import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';

/**
 * Ficha de Riesgo — trazabilidad de UN riesgo/área a través de toda la cadena
 * de papeles de Control Interno (Fase 6a del plan de docs/modelo-integrado-
 * control-interno-analisis.md §8.4).
 *
 * Agregación de SOLO LECTURA: no persiste nada; responde la pregunta "¿puede
 * un revisor seguir desde una conclusión hasta la evidencia que la soporta?"
 * juntando las filas relevantes de PT-A2/A5/A3/NIA530/MRCI/NIA265/COSO y los
 * nodos de flujograma en una sola respuesta navegable.
 *
 * Problema central que resuelve el diseño: las filas de riesgo viven dentro
 * de secciones MATRIX (JSON) sin IDs estables ni claves foráneas entre
 * papeles. Por eso:
 *  - El ANCLA es (paperId, sectionKey, rowIndex) — lo que la UI ya conoce al
 *    hacer clic en una fila — o directamente un nombre de área (`?area=`).
 *  - La CORRELACIÓN entre papeles se hace contra el catálogo canónico de
 *    áreas (PT-A2 S1, con PT-A5 S1 como fallback), comparando por FRASES
 *    derivadas del nombre del área (nombre principal, contenido del
 *    paréntesis y sub-frases separadas por " y "), nunca por tokens sueltos —
 *    "Cuentas por Cobrar" no debe coincidir con "Cuentas por Pagar" solo por
 *    compartir la palabra "cuentas".
 *  - Cada coincidencia lleva su `matchBasis` (AREA / DESCRIPCION /
 *    PAPEL_COMPLETO / NODO) para que la UI y el revisor sepan POR QUÉ esa
 *    fila aparece en la ficha. Un bloque sin coincidencias se devuelve igual
 *    (available/rows vacías) — la degradación es visible, nunca silenciosa.
 */

// ─── Contrato de respuesta (lo consume la Fase 6b — cockpit/drawer) ──────────

export type RiskTraceBlockKind =
  | 'IDENTIFICACION' // PT-A2 S5/S6 — dónde nació el riesgo
  | 'RMM'            // PT-A5 S1/S3 — cuenta/aserción/RMM (solo perfil Externa)
  | 'CONTROL'        // PT-A3 S2/S4 — control mitigante y excepciones
  | 'PRUEBA'         // PT-NIA530 S4 — resultado de muestreo/atributos del área
  | 'RESIDUAL'       // PT-MRCI S1/S2 — riesgo residual tras el control
  | 'DEFICIENCIA'    // PT-NIA265 S1 + PT-COSO S8 — deficiencias comunicadas
  | 'FLUJOGRAMA';    // nodos de proceso vinculados al área

export type RiskTraceMatchBasis = 'AREA' | 'DESCRIPCION' | 'PAPEL_COMPLETO' | 'NODO';

export interface RiskTraceSectionHit {
  sectionKey:   string;
  sectionLabel: string;
  matchBasis:   RiskTraceMatchBasis;
  /** Filas coincidentes TAL CUAL están en el papel — la UI las tabula. */
  rows:         Record<string, unknown>[];
}

export interface RiskTraceBlock {
  kind:       RiskTraceBlockKind;
  title:      string;
  /** null cuando el papel no existe en este encargo (ej. PT-MRCI sin sembrar). */
  paperId:    string | null;
  paperCode:  string | null;
  wpCode:     string | null;   // código de expediente (A-05, A-08B, …)
  paperTitle: string | null;
  available:  boolean;
  sections:   RiskTraceSectionHit[];
}

export interface RiskTraceFlowNode {
  paperId:    string;
  sectionKey: string;
  nodeId:     string;
  kind:       string;
  label:      string;
  linkedPaperCode: string | null;
}

export interface RiskTraceResponse {
  anchor: {
    paperId:    string | null;
    paperCode:  string | null;
    sectionKey: string | null;
    rowIndex:   number | null;
    riskLabel:  string;
    area:       string | null;
  };
  areaCatalog: string[];
  blocks:      RiskTraceBlock[];
  flowNodes:   RiskTraceFlowNode[];
}

// ─── Contrato del cockpit (Fase 6b — pipeline/stepper + lista de riesgos) ────

/** "RMM" se relabela "RIESGO" para el stepper — el nombre interno del bloque
 *  correspondiente a esta etapa (§8.3 del doc de diseño) sigue siendo RMM. */
export type ControlInternoStageKey = RiskTraceBlockKind | 'CONCLUSION';

export interface ControlInternoStage {
  key:        ControlInternoStageKey;
  label:      string;
  paperCode:  string | null;
  wpCode:     string | null;
  paperId:    string | null;
  available:  boolean;
  count:      number;
  countLabel: string;
}

export interface ControlInternoRiskRow {
  paperId:    string;
  sectionKey: string;
  rowIndex:   number;
  label:      string;
  area:       string | null;
  badge:      string | null;
}

export type ControlInternoProfile = 'EXTERNA' | 'INTERNA' | 'GENERICO';

export interface ControlInternoSummary {
  profile:     ControlInternoProfile;
  stages:      ControlInternoStage[];
  risks:       ControlInternoRiskRow[];
  areaCatalog: string[];
}

// ─── Contrato del Reporte Integrado (Fase 7 — control-interno-pdf.ts) ────────

export interface IntegratedReportControlRow {
  riesgo:           string;
  controlMitigante: string;
  riesgoInherente:  string;
  riesgoResidual:   string;
  refRiesgo:        string;
}

export interface IntegratedReportData {
  auditTitle:  string;
  entityName:  string;
  flowchart:   { nodes: unknown[]; edges: unknown[] } | null;
  flowchartPaperTitle: string | null;
  controlRows: IntegratedReportControlRow[];
  heatMap:     Record<string, unknown>[];
  summary:     { totalRiesgos: number; porNivel: Record<string, number>; pctReduccion: number | null };
  conclusion:  string | null;
  recommendations: Array<{ descripcion: string; fuente: string }>;
  mrciPaper:   { code: string; id: string } | null;
}

// ─── Normalización y coincidencia por frases ─────────────────────────────────

const strip = (s: unknown): string =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const STOPWORDS = new Set(['y', 'de', 'del', 'la', 'el', 'los', 'las', 'por', 'en', 'con', 'a', 'o', 'u', 'e', 'al', 'se', 'que', 'no', 'si', 'sin', 'un', 'una', 'para']);

/** Palabras distintivas (≥5 chars, sin stopwords) — para similitud de descripciones. */
const distinctiveTokens = (s: unknown): Set<string> =>
  new Set(
    strip(s)
      .replace(/[^a-z0-9ñ\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length >= 5 && !STOPWORDS.has(t)),
  );

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Frases identificadoras de un área: nombre principal (antes del paréntesis),
 * contenido del paréntesis, y las sub-frases de ambos separadas por " y ".
 * Ej. "Tesorería (Caja y Bancos)" → ["tesoreria", "caja y bancos", "caja", "bancos"].
 * "Cuentas por Cobrar" → ["cuentas por cobrar"] — nunca "cuentas" a secas.
 */
function areaPhrases(area: string): string[] {
  const parenMatch = area.match(/\(([^)]*)\)/);
  const main  = strip(area.replace(/\([^)]*\)/g, ''));
  const paren = parenMatch ? strip(parenMatch[1]) : '';
  const parts = new Set<string>();
  for (const base of [main, paren]) {
    if (!base) continue;
    parts.add(base);
    for (const sub of base.split(/\s+y\s+/)) {
      const t = sub.trim();
      // Sub-frases de una sola palabra corta o genérica no identifican nada.
      if (t.length >= 4 && !STOPWORDS.has(t)) parts.add(t);
    }
  }
  return [...parts];
}

/** ¿El texto hace referencia al área? Frase completa con frontera de palabra. */
function textReferencesArea(text: unknown, area: string): boolean {
  const t = strip(text);
  if (!t) return false;
  return areaPhrases(area).some(p =>
    new RegExp(`(^|[^a-z0-9ñ])${escapeRegex(p)}([^a-z0-9ñ]|$)`).test(t),
  );
}

/** Similitud entre dos textos libres: ≥2 palabras distintivas compartidas. */
function descriptionsOverlap(a: unknown, b: unknown): boolean {
  const ta = distinctiveTokens(a);
  if (ta.size === 0) return false;
  const tb = distinctiveTokens(b);
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared >= 2;
}

/** Concatenación de todos los valores string de una fila — el "texto" de la fila. */
function rowText(row: Record<string, unknown>): string {
  return Object.values(row)
    .filter(v => typeof v === 'string')
    .join(' · ');
}

function findColumn(row: Record<string, unknown>, patterns: RegExp[]): string | undefined {
  const keys = Object.keys(row);
  for (const p of patterns) {
    const k = keys.find(k => p.test(strip(k)));
    if (k) return k;
  }
  return undefined;
}

const AREA_COLUMN = [/area\s*\/?\s*ciclo/, /ciclo\s*\/?\s*area/, /^area$/, /^ciclo/, /cuenta\s*\/?\s*rubro/];
const DESC_COLUMN = [/descripcion del riesgo/, /riesgo significativo/, /^riesgo$/, /descripcion de la deficiencia/, /^descripcion/, /deficiencia/];

// ─── Configuración de bloques (qué papel/secciones alimenta cada etapa) ──────

interface BlockSpec {
  kind:      RiskTraceBlockKind;
  title:     string;
  paperCode: string;
  sections:  string[];
  /** Sección cuyo valor TEXT define el alcance del papel completo (PT-A3 S1 = ciclo evaluado). */
  scopeSection?: string;
  /** El valor no es un array de filas sino { filas: [...] } (PT-NIA530 S4). */
  wrappedRows?: boolean;
}

const BLOCK_SPECS: BlockSpec[] = [
  { kind: 'IDENTIFICACION', title: 'Identificación del Riesgo (PT-A2)',            paperCode: 'PT-A2',    sections: ['S5', 'S6'] },
  { kind: 'RMM',            title: 'Cuenta / Aserción / RMM (PT-A5)',              paperCode: 'PT-A5',    sections: ['S1', 'S3'] },
  { kind: 'CONTROL',        title: 'Controles y Excepciones (PT-A3)',              paperCode: 'PT-A3',    sections: ['S2', 'S4'], scopeSection: 'S1' },
  { kind: 'PRUEBA',         title: 'Prueba de Muestreo / Atributos (PT-NIA530)',   paperCode: 'PT-NIA530', sections: ['S4'], wrappedRows: true },
  { kind: 'RESIDUAL',       title: 'Riesgo Residual tras Controles (PT-MRCI)',     paperCode: 'PT-MRCI',  sections: ['S1', 'S2'] },
  { kind: 'DEFICIENCIA',    title: 'Deficiencias Comunicadas (PT-NIA265)',         paperCode: 'PT-NIA265', sections: ['S1'] },
  { kind: 'DEFICIENCIA',    title: 'Deficiencias Comunicables (PT-COSO)',          paperCode: 'PT-COSO',  sections: ['S8'] },
];

@Injectable()
export class RiskTraceService {
  constructor(private readonly prisma: PrismaService) {}

  async getTrace(
    auditId: string,
    user: AuthUser,
    anchor: { paperId?: string; sectionKey?: string; rowIndex?: number; area?: string },
  ): Promise<RiskTraceResponse> {
    const audit = await this.prisma.audit.findUnique({
      where:  { id: auditId },
      select: { organizationId: true },
    });
    if (!audit) throw new NotFoundException('Auditoría no encontrada');
    if (audit.organizationId !== user.organizationId) throw new ForbiddenException();

    // ── 1. Papeles y secciones de la cadena, en una sola consulta ──────────
    const codes = [...new Set(BLOCK_SPECS.map(b => b.paperCode))];
    const papers = await this.prisma.workingPaper.findMany({
      where:   { auditId, paperCode: { in: codes } },
      orderBy: { createdAt: 'asc' },
      select:  { id: true, code: true, title: true, paperCode: true, updatedAt: true },
    });

    const neededKeys = [...new Set(BLOCK_SPECS.flatMap(b => [...b.sections, ...(b.scopeSection ? [b.scopeSection] : [])]))];
    const sections = papers.length > 0
      ? await this.prisma.paperSection.findMany({
          where:  { paperId: { in: papers.map(p => p.id) }, sectionKey: { in: neededKeys } },
          select: { paperId: true, sectionKey: true, label: true, value: true },
        })
      : [];
    const sectionOf = (paperId: string, key: string) =>
      sections.find(s => s.paperId === paperId && s.sectionKey === key);

    // Ante duplicados del mismo paperCode (ocurre en encargos reales): gana el
    // papel del ANCLA si es uno de ellos; si no, el que tenga más secciones de
    // la cadena con contenido; empate → el trabajado más recientemente.
    const isFilled = (v: unknown): boolean => {
      if (v == null) return false;
      if (Array.isArray(v)) return v.length > 0;
      if (typeof v === 'object') return Object.keys(v as object).length > 0;
      return String(v).trim() !== '';
    };
    const filledCount = (paperId: string) =>
      sections.filter(s => s.paperId === paperId && isFilled(s.value)).length;
    const paperByCode = new Map<string, typeof papers[number]>();
    for (const p of papers) {
      const current = paperByCode.get(p.paperCode!);
      if (!current) { paperByCode.set(p.paperCode!, p); continue; }
      if (current.id === anchor.paperId) continue;      // el ancla siempre gana
      if (p.id === anchor.paperId) { paperByCode.set(p.paperCode!, p); continue; }
      const a = filledCount(p.id), b = filledCount(current.id);
      if (a > b || (a === b && p.updatedAt > current.updatedAt)) paperByCode.set(p.paperCode!, p);
    }

    // ── 2. Catálogo canónico de áreas (PT-A2 S1; fallback PT-A5 S1) ────────
    const areaCatalog = await this.loadAreaCatalog(paperByCode, sectionOf);

    // ── 3. Resolver el ancla → área + descripción del riesgo ───────────────
    const resolved = await this.resolveAnchor(auditId, anchor, areaCatalog);

    // ── 4. Armar los bloques ───────────────────────────────────────────────
    const blocks: RiskTraceBlock[] = BLOCK_SPECS.map(spec => {
      const paper = paperByCode.get(spec.paperCode);
      const block: RiskTraceBlock = {
        kind: spec.kind, title: spec.title,
        paperId: paper?.id ?? null, paperCode: spec.paperCode,
        wpCode: paper?.code ?? null, paperTitle: paper?.title ?? null,
        available: !!paper, sections: [],
      };
      if (!paper) return block;

      // Papel de alcance único (PT-A3): si su S1 nombra el área del ancla,
      // TODO el papel es relevante — se incluyen las secciones completas.
      const wholeScope = spec.scopeSection
        && resolved.area
        && textReferencesArea(sectionOf(paper.id, spec.scopeSection)?.value, resolved.area);

      for (const key of spec.sections) {
        const sec = sectionOf(paper.id, key);
        if (!sec) continue;
        const raw = spec.wrappedRows
          ? (sec.value as { filas?: unknown[] } | null)?.filas
          : sec.value;
        const rows = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
        if (rows.length === 0) continue;

        if (wholeScope) {
          block.sections.push({ sectionKey: key, sectionLabel: sec.label, matchBasis: 'PAPEL_COMPLETO', rows });
          continue;
        }

        const byArea = resolved.area
          ? rows.filter(r => textReferencesArea(rowText(r), resolved.area!))
          : [];
        if (byArea.length > 0) {
          block.sections.push({ sectionKey: key, sectionLabel: sec.label, matchBasis: 'AREA', rows: byArea });
          continue;
        }
        if (resolved.description) {
          const byDesc = rows.filter(r => descriptionsOverlap(rowText(r), resolved.description));
          if (byDesc.length > 0) {
            block.sections.push({ sectionKey: key, sectionLabel: sec.label, matchBasis: 'DESCRIPCION', rows: byDesc });
          }
        }
      }
      return block;
    });

    // ── 5. Nodos de flujograma que referencian el área ─────────────────────
    const flowNodes: RiskTraceFlowNode[] = [];
    if (resolved.area) {
      const flowSections = await this.prisma.paperSection.findMany({
        where:  { fieldType: 'FLOWCHART', paper: { auditId } },
        select: { paperId: true, sectionKey: true, value: true },
      });
      for (const fs of flowSections) {
        const nodes = (fs.value as { nodes?: unknown[] } | null)?.nodes;
        if (!Array.isArray(nodes)) continue;
        for (const n of nodes as Array<Record<string, unknown>>) {
          if (!textReferencesArea(String(n.label ?? ''), resolved.area)) continue;
          const linked = n.linkedPaper as { code?: string } | null | undefined;
          flowNodes.push({
            paperId: fs.paperId, sectionKey: fs.sectionKey,
            nodeId: String(n.id ?? ''), kind: String(n.kind ?? ''),
            label: String(n.label ?? ''), linkedPaperCode: linked?.code ?? null,
          });
        }
      }
    }

    return {
      anchor: {
        paperId: anchor.paperId ?? null,
        paperCode: resolved.anchorPaperCode,
        sectionKey: anchor.sectionKey ?? null,
        rowIndex: anchor.rowIndex ?? null,
        riskLabel: resolved.riskLabel,
        area: resolved.area,
      },
      areaCatalog,
      blocks,
      flowNodes,
    };
  }

  /**
   * Resumen para el cockpit (pestaña "Control Interno", Fase 6b): el stepper
   * con un badge por etapa y la lista de riesgos clicables que abren la Ficha
   * de Riesgo (getTrace). Todo de solo lectura — mismos papeles que getTrace,
   * sin persistir nada nuevo.
   */
  async getSummary(auditId: string, user: AuthUser): Promise<ControlInternoSummary> {
    const audit = await this.prisma.audit.findUnique({
      where:  { id: auditId },
      select: { organizationId: true },
    });
    if (!audit) throw new NotFoundException('Auditoría no encontrada');
    if (audit.organizationId !== user.organizationId) throw new ForbiddenException();

    const codes = [...new Set(BLOCK_SPECS.map(b => b.paperCode))];
    const papers = await this.prisma.workingPaper.findMany({
      where:   { auditId, paperCode: { in: codes } },
      orderBy: { createdAt: 'asc' },
      select:  { id: true, code: true, paperCode: true },
    });
    const sections = papers.length > 0
      ? await this.prisma.paperSection.findMany({
          where:  { paperId: { in: papers.map(p => p.id) } },
          select: { paperId: true, sectionKey: true, value: true },
        })
      : [];
    const isFilled = (v: unknown): boolean => {
      if (v == null) return false;
      if (Array.isArray(v)) return v.length > 0;
      if (typeof v === 'object') return Object.keys(v as object).length > 0;
      return String(v).trim() !== '';
    };
    // Duplicados: gana el papel con más secciones llenas (sin ancla — este
    // endpoint no tiene una fila específica que deba ganar el desempate).
    const filledCount = (paperId: string) => sections.filter(s => s.paperId === paperId && isFilled(s.value)).length;
    const paperByCode = new Map<string, typeof papers[number]>();
    for (const p of papers) {
      const current = paperByCode.get(p.paperCode!);
      if (!current || filledCount(p.id) > filledCount(current.id)) paperByCode.set(p.paperCode!, p);
    }
    const sectionOf = (paperId: string, key: string) => sections.find(s => s.paperId === paperId && s.sectionKey === key);
    const rowsOf = (code: string, key: string, wrapped = false): Record<string, unknown>[] => {
      const paper = paperByCode.get(code);
      if (!paper) return [];
      const sec = sectionOf(paper.id, key);
      const raw = wrapped ? (sec?.value as { filas?: unknown[] } | null)?.filas : sec?.value;
      return Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
    };

    const areaCatalog = await this.loadAreaCatalog(paperByCode, sectionOf);
    const profile: ControlInternoProfile = paperByCode.has('PT-A5')
      ? 'EXTERNA'
      : paperByCode.has('PT-MRCI') ? 'INTERNA' : 'GENERICO';

    // ── Lista de riesgos clicables: PT-A2 S6 (riesgos significativos) es la
    // fuente más específica; si está vacía, un riesgo genérico por área. ──
    const a2 = paperByCode.get('PT-A2');
    const s6Rows = rowsOf('PT-A2', 'S6');
    const risks: ControlInternoRiskRow[] = [];
    if (a2 && s6Rows.length > 0) {
      s6Rows.forEach((row, idx) => {
        const descCol = findColumn(row, DESC_COLUMN);
        const areaCol = findColumn(row, AREA_COLUMN);
        const label = descCol ? String(row[descCol] ?? '').trim() : '';
        const explicitArea = areaCol ? String(row[areaCol] ?? '').trim() : '';
        const area = explicitArea
          ? (areaCatalog.find(a => textReferencesArea(explicitArea, a) || textReferencesArea(a, explicitArea)) ?? explicitArea)
          : (areaCatalog.find(a => textReferencesArea(rowText(row), a)) ?? null);
        if (label.length < 15 && !area) return; // fila sin contenido identificable
        risks.push({
          paperId: a2.id, sectionKey: 'S6', rowIndex: idx,
          label: label.length >= 15 ? label : (area ?? `Riesgo #${idx + 1}`),
          area, badge: 'Riesgo Significativo',
        });
      });
    } else {
      areaCatalog.forEach((area, idx) => {
        risks.push({ paperId: a2?.id ?? '', sectionKey: 'S1', rowIndex: idx, label: area, area, badge: null });
      });
    }

    // ── Badges por etapa — un conteo de solo lectura por bloque de la cadena. ──
    const countRmmSignificativos = rowsOf('PT-A5', 'S1').filter(r => {
      const col = findColumn(r, [/riesgo significativo/]);
      return col && /^s/i.test(strip(String(r[col])));
    }).length;
    const countResidualAlto = rowsOf('PT-MRCI', 'S1').filter(r => {
      const col = findColumn(r, [/riesgo residual/]);
      return col && /alto/i.test(strip(String(r[col])));
    }).length;
    const countPruebaAtencion = rowsOf('PT-NIA530', 'S4', true).filter(r => {
      const accion = String((r as Record<string, unknown>).accion ?? '');
      return accion && accion !== 'NINGUNA';
    }).length;
    const countDeficiencias = rowsOf('PT-NIA265', 'S1').length + rowsOf('PT-COSO', 'S8').length;
    // Fase 3 — Segregación de Funciones (PT-A3 S10): se blende en el badge de
    // Control en vez de tener etapa propia (§8.6 — "tarjeta adicional dentro
    // de Control", su resultado alimenta PT-MRCI igual que cualquier riesgo).
    const countControles = rowsOf('PT-A3', 'S2').length;
    const countSegregacionInadecuada = rowsOf('PT-A3', 'S10').filter(r => {
      const col = findColumn(r, [/segregaci[oó]n adecuada/]);
      return col && /^no$/i.test(strip(String(r[col])));
    }).length;
    const controlLabel = countSegregacionInadecuada > 0
      ? `${countControles} control(es) · ${countSegregacionInadecuada} debilidad(es) de segregación`
      : `${countControles} control(es) documentado(s)`;
    const mrciConclusion = sectionOf(paperByCode.get('PT-MRCI')?.id ?? '', 'S4')?.value;
    const stageOf = (kind: RiskTraceBlockKind): BlockSpec => BLOCK_SPECS.find(b => b.kind === kind)!;
    const mk = (kind: ControlInternoStageKey, label: string, spec: BlockSpec | null, count: number, countLabel: string): ControlInternoStage => {
      const paper = spec ? paperByCode.get(spec.paperCode) : undefined;
      return {
        key: kind, label,
        paperCode: spec?.paperCode ?? null, wpCode: paper?.code ?? null, paperId: paper?.id ?? null,
        available: !!paper, count, countLabel,
      };
    };

    const stages: ControlInternoStage[] = [
      mk('IDENTIFICACION', 'Identificación',      stageOf('IDENTIFICACION'), s6Rows.length,           `${s6Rows.length} riesgo(s) significativo(s)`),
      mk('RMM',            profile === 'EXTERNA' ? 'Cuenta / RMM' : 'Riesgo', stageOf('RMM'),          countRmmSignificativos, profile === 'EXTERNA' ? `${countRmmSignificativos} área(s) con RMM significativo` : 'No aplica a este perfil'),
      mk('CONTROL',        'Control',             stageOf('CONTROL'),        countControles,           controlLabel),
      mk('PRUEBA',         'Prueba / Muestreo',   stageOf('PRUEBA'),         countPruebaAtencion,      countPruebaAtencion > 0 ? `${countPruebaAtencion} área(s) requieren atención` : 'Sin alertas'),
      mk('RESIDUAL',       'Riesgo Residual',     stageOf('RESIDUAL'),       countResidualAlto,        countResidualAlto > 0 ? `${countResidualAlto} residual(es) Alto/Muy Alto` : 'Sin residuales altos'),
      mk('DEFICIENCIA',    'Deficiencias',        stageOf('DEFICIENCIA'),    countDeficiencias,        `${countDeficiencias} deficiencia(s) comunicada(s)`),
      { key: 'CONCLUSION', label: 'Conclusión', paperCode: 'PT-MRCI', wpCode: paperByCode.get('PT-MRCI')?.code ?? null, paperId: paperByCode.get('PT-MRCI')?.id ?? null, available: !!paperByCode.get('PT-MRCI'), count: isFilled(mrciConclusion) ? 1 : 0, countLabel: isFilled(mrciConclusion) ? 'Redactada' : 'Pendiente' },
    ];

    return { profile, stages, risks, areaCatalog };
  }

  /**
   * Datos para el Reporte Integrado de Control Interno (Fase 7, §8.9) — junta
   * en una sola estructura lo que `control-interno-pdf.ts` necesita para
   * ensamblar la página: flujograma (con carriles/marcadores de la Fase 2) +
   * tabla de controles de PT-MRCI S1 + mapa de calor Área×Nivel de PT-MRCI S3
   * (alternativa de menor esfuerzo del §8.9 — no requiere separar PT-A2 en
   * Probabilidad×Impacto) + resumen numérico + conclusión + recomendaciones.
   * Solo lectura, mismo criterio de "más contenido gana" que getSummary ante
   * papeles duplicados.
   */
  async getIntegratedReportData(auditId: string, user: AuthUser): Promise<IntegratedReportData> {
    const audit = await this.prisma.audit.findUnique({
      where:  { id: auditId },
      select: { organizationId: true, title: true, auditEntity: { select: { name: true } } },
    });
    if (!audit) throw new NotFoundException('Auditoría no encontrada');
    if (audit.organizationId !== user.organizationId) throw new ForbiddenException();

    const codes = ['PT-MRCI', 'PT-NIA265', 'PT-COSO'];
    const papers = await this.prisma.workingPaper.findMany({
      where:   { auditId, paperCode: { in: codes } },
      orderBy: { createdAt: 'asc' },
      select:  { id: true, code: true, paperCode: true },
    });
    const sections = papers.length > 0
      ? await this.prisma.paperSection.findMany({
          where:  { paperId: { in: papers.map(p => p.id) } },
          select: { paperId: true, sectionKey: true, value: true },
        })
      : [];
    const isFilled = (v: unknown): boolean => {
      if (v == null) return false;
      if (Array.isArray(v)) return v.length > 0;
      if (typeof v === 'object') return Object.keys(v as object).length > 0;
      return String(v).trim() !== '';
    };
    const filledCount = (paperId: string) => sections.filter(s => s.paperId === paperId && isFilled(s.value)).length;
    const paperByCode = new Map<string, typeof papers[number]>();
    for (const p of papers) {
      const current = paperByCode.get(p.paperCode!);
      if (!current || filledCount(p.id) > filledCount(current.id)) paperByCode.set(p.paperCode!, p);
    }
    const sectionOf = (paperId: string, key: string) => sections.find(s => s.paperId === paperId && s.sectionKey === key);
    const rowsOf = (code: string, key: string): Record<string, unknown>[] => {
      const paper = paperByCode.get(code);
      const raw = paper ? sectionOf(paper.id, key)?.value : null;
      return Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
    };
    const findKey = (row: Record<string, unknown>, patterns: RegExp[]): string | undefined =>
      Object.keys(row).find(k => patterns.some(p => p.test(k.toLowerCase())));
    const cell = (row: Record<string, unknown>, patterns: RegExp[]): string => {
      const k = findKey(row, patterns);
      return k ? String(row[k] ?? '').trim() : '';
    };

    // ── Flujograma: la primera sección FLOWCHART con contenido en el encargo ──
    const flowSections = await this.prisma.paperSection.findMany({
      where:  { fieldType: 'FLOWCHART', paper: { auditId } },
      select: { value: true, paper: { select: { title: true } } },
    });
    const flowSection = flowSections.find(s => {
      const nodes = (s.value as { nodes?: unknown[] } | null)?.nodes;
      return Array.isArray(nodes) && nodes.length > 0;
    });
    const flowVal = flowSection?.value as { nodes?: unknown[]; edges?: unknown[] } | undefined;

    // ── Tabla de controles + resumen numérico (PT-MRCI S1) ──────────────────
    const mrciRows = rowsOf('PT-MRCI', 'S1');
    const RANK: Record<string, number> = { bajo: 1, moderado: 2, alto: 3, 'muy alto': 4 };
    const porNivel: Record<string, number> = { Bajo: 0, Moderado: 0, Alto: 0, 'Muy Alto': 0 };
    const controlRows = mrciRows.map(row => {
      const residual = cell(row, [/riesgo residual/]);
      const key = Object.keys(porNivel).find(k => k.toLowerCase() === residual.toLowerCase().trim());
      if (key) porNivel[key]++;
      return {
        riesgo:           cell(row, [/^riesgo$/]),
        controlMitigante: cell(row, [/control mitigante/]),
        riesgoInherente:  cell(row, [/riesgo inherente/]) || '—',
        riesgoResidual:   residual || '—',
        refRiesgo:        cell(row, [/ref\.? riesgo/]),
      };
    });
    const altoMuyAlto = porNivel['Alto'] + porNivel['Muy Alto'];
    const inherenteAltoMuyAlto = mrciRows.filter(r => RANK[cell(r, [/riesgo inherente/]).toLowerCase()] >= 3).length;
    const pctReduccion = inherenteAltoMuyAlto > 0
      ? Math.round((1 - altoMuyAlto / inherenteAltoMuyAlto) * 100)
      : null;

    // ── Conclusión (PT-MRCI S4) y Recomendaciones (NIA265 S1 + COSO S8) ─────
    const conclusionRaw = sectionOf(paperByCode.get('PT-MRCI')?.id ?? '', 'S4')?.value;
    const conclusion = typeof conclusionRaw === 'string' && conclusionRaw.trim() ? conclusionRaw.trim() : null;

    const recommendations = [
      ...rowsOf('PT-NIA265', 'S1').map(r => ({
        descripcion: cell(r, [/recomendaci[oó]n/]) || cell(r, [/descripci[oó]n/]),
        fuente: 'PT-NIA265',
      })),
      ...rowsOf('PT-COSO', 'S8').map(r => ({
        descripcion: cell(r, [/recomendaci[oó]n/]),
        fuente: 'PT-COSO',
      })),
    ].filter(r => r.descripcion.length > 0);

    return {
      auditTitle:  audit.title,
      entityName:  audit.auditEntity?.name ?? audit.title,
      flowchart:   flowVal?.nodes?.length ? { nodes: flowVal.nodes!, edges: flowVal.edges ?? [] } : null,
      flowchartPaperTitle: flowSection?.paper?.title ?? null,
      controlRows,
      heatMap:     rowsOf('PT-MRCI', 'S3'),
      summary:     { totalRiesgos: mrciRows.length, porNivel, pctReduccion },
      conclusion,
      recommendations,
      mrciPaper:   paperByCode.get('PT-MRCI') ? { code: paperByCode.get('PT-MRCI')!.code, id: paperByCode.get('PT-MRCI')!.id } : null,
    };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async loadAreaCatalog(
    paperByCode: Map<string, { id: string }>,
    sectionOf: (paperId: string, key: string) => { value: unknown } | undefined,
  ): Promise<string[]> {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const [code, key] of [['PT-A2', 'S1'], ['PT-A5', 'S1']] as const) {
      const paper = paperByCode.get(code);
      if (!paper) continue;
      const rows = sectionOf(paper.id, key)?.value;
      if (!Array.isArray(rows)) continue;
      for (const r of rows as Record<string, unknown>[]) {
        const col = findColumn(r, AREA_COLUMN);
        const area = col ? String(r[col] ?? '').trim() : '';
        if (area && !seen.has(strip(area))) { seen.add(strip(area)); out.push(area); }
      }
      if (out.length > 0) break; // PT-A2 S1 es el canónico; PT-A5 solo fallback
    }
    return out;
  }

  private async resolveAnchor(
    auditId: string,
    anchor: { paperId?: string; sectionKey?: string; rowIndex?: number; area?: string },
    areaCatalog: string[],
  ): Promise<{ area: string | null; description: string | null; riskLabel: string; anchorPaperCode: string | null }> {
    // Ancla directa por área (para uso desde el dashboard, sin fila concreta).
    if (anchor.area && !anchor.paperId) {
      const match = areaCatalog.find(a => textReferencesArea(a, anchor.area!) || textReferencesArea(anchor.area!, a));
      const area = match ?? anchor.area;
      return { area, description: null, riskLabel: area, anchorPaperCode: null };
    }

    if (!anchor.paperId || !anchor.sectionKey || anchor.rowIndex == null) {
      throw new BadRequestException(
        'Indique el ancla: paperId + sectionKey + rowIndex (fila de riesgo), o bien ?area= para trazar un área completa.',
      );
    }

    const paper = await this.prisma.workingPaper.findFirst({
      where:  { id: anchor.paperId, auditId },
      select: { paperCode: true },
    });
    if (!paper) throw new NotFoundException('El papel del ancla no pertenece a esta auditoría');

    const sec = await this.prisma.paperSection.findUnique({
      where: { paperId_sectionKey: { paperId: anchor.paperId, sectionKey: anchor.sectionKey } },
    });
    const raw = sec?.value as unknown;
    const rows = Array.isArray(raw)
      ? (raw as Record<string, unknown>[])
      : Array.isArray((raw as { filas?: unknown[] } | null)?.filas)
        ? ((raw as { filas: Record<string, unknown>[] }).filas)
        : [];
    const row = rows[anchor.rowIndex];
    if (!row) throw new NotFoundException(`La fila ${anchor.rowIndex} no existe en ${anchor.sectionKey} del papel ancla`);

    const descCol = findColumn(row, DESC_COLUMN);
    const areaCol = findColumn(row, AREA_COLUMN);
    // Una "descripción" de menos de 15 caracteres no describe nada — es un flag
    // tipo "Sí"/"N/A" cuya columna coincidió por nombre (ej. "¿Riesgo
    // Significativo? (S/N)"). Se descarta y el label cae al área.
    const descRaw = descCol ? String(row[descCol] ?? '').trim() : '';
    const description = descRaw.length >= 15 ? descRaw : null;
    const explicitArea = areaCol ? String(row[areaCol] ?? '').trim() : '';

    // Resolver el área contra el catálogo: primero la columna explícita,
    // después escaneando el texto completo de la fila.
    let area: string | null = null;
    if (explicitArea) {
      area = areaCatalog.find(a => textReferencesArea(explicitArea, a) || textReferencesArea(a, explicitArea)) ?? explicitArea;
    } else {
      const text = rowText(row);
      area = areaCatalog.find(a => textReferencesArea(text, a)) ?? null;
    }

    return {
      area,
      description,
      riskLabel: description ?? explicitArea ?? area ?? '(fila sin descripción)',
      anchorPaperCode: paper.paperCode,
    };
  }
}
