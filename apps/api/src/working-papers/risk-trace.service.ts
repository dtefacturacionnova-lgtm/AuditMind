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
