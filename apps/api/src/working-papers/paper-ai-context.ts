/**
 * Contexto del papel de trabajo para los botones de IA (mejorar redacción, borrador de procedimiento, sugerencias, programa).
 *
 * Antes cada botón mandaba a la IA solo el título y el tipo del papel (una enumeración genérica), y respondía con texto que valía para
 * cualquier papel. Aquí vive UNA ficha compacta del papel y del encargo, armada en el servidor a partir del `paperId`, con tope de
 * caracteres (el consumo de IA importa) y una regla de suficiencia: si no hay con qué proponer algo específico, se dice, no se inventa.
 *
 * Las funciones son puras (se prueban sin base de datos); `loadPaperAiInput` es el único que toca Prisma.
 * Diseño: docs/ia-contexto-del-papel-propuesta.md
 */
import { PAPER_TEMPLATES } from './paper-templates';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface PaperAiInput {
  paper: {
    code: string | null;
    title: string;
    narrative?: string | null;
  };
  audit: {
    title?: string | null;
    type?: string | null;
    subtype?: string | null;
    scope?: string | null;
    entityName?: string | null;
    periodStart?: Date | string | null;
    periodEnd?: Date | string | null;
  };
  sections: Array<{ key: string; label: string; value: unknown }>;
  procedures: Array<{ title?: string | null; statement?: string | null; area?: string | null; procedure?: string | null }>;
  /** El papel nació de una plantilla (`PAPER_TEMPLATES`): sus secciones describen para qué sirve. */
  hasTemplate: boolean;
}

export interface BriefBudget {
  sections: number;        // máximo de secciones llenas
  sectionChars: number;    // caracteres por sección llena
  empties: number;         // máximo de etiquetas de secciones por llenar
  procs: number;           // máximo de procedimientos ya existentes (solo título)
  procChars: number;
  scopeChars: number;
  narrativeChars: number;
  totalChars: number;      // tope duro de la ficha completa
}

/** `ligero` = mejorar redacción (el texto ya es el contenido); `estandar` = borrador, sugerencias y programa. */
export const BUDGETS: Record<'ligero' | 'estandar', BriefBudget> = {
  ligero:   { sections: 3, sectionChars: 120, empties: 8,  procs: 5, procChars: 60, scopeChars: 160, narrativeChars: 0,   totalChars: 1200 },
  estandar: { sections: 8, sectionChars: 160, empties: 12, procs: 8, procChars: 80, scopeChars: 240, narrativeChars: 300, totalChars: 2600 },
};

export const INSUFFICIENT_MARK = 'SIN_CONTEXTO';

// ─── Tipo de encargo → marco normativo y base RAG ────────────────────────────

/** Misma tabla que usa el asistente por sección (`paper-sections.service.ts`): cada marco es independiente, no se mezclan. */
export const RAG_BASE_BY_AUDIT_TYPE: Record<string, string> = {
  FISCAL: 'FISCAL_SV',
  AML: 'AML_SV',
  INTERNAL: 'IIA_STANDARDS_2024',
  INTERNAL_GOVERNMENTAL: 'NAIG_CCR_SV',
  EXTERNAL_FINANCIAL: 'CVPCPA_SV',
};

export function ragBaseFor(auditType?: string | null): string | undefined {
  return auditType ? RAG_BASE_BY_AUDIT_TYPE[auditType] : undefined;
}

const FRAMEWORK_BY_AUDIT_TYPE: Record<string, string> = {
  FISCAL: 'cumplimiento tributario de El Salvador (Código Tributario, NACOT, Ley de IVA, Ley de ISR)',
  AML: 'prevención de lavado de activos y financiamiento del terrorismo (Ley Especial PLD/FT/FP, NRP-36, GAFI)',
  INTERNAL: 'Normas Globales de Auditoría Interna del IIA (2024)',
  INTERNAL_GOVERNMENTAL: 'Normas de Auditoría Interna Gubernamental (NAIG, Corte de Cuentas de la República)',
  EXTERNAL_FINANCIAL: 'NIA (IAASB) y guías del CVPCPA de El Salvador',
  FINANCIAL: 'NIA (IAASB)',
  EXTERNAL: 'NIA (IAASB)',
  IT_SECURITY: 'ISO 27001:2022 y NRP-23/32',
  IT_SYSTEMS: 'COBIT 2019',
  BCP_CONTINUITY: 'ISO 22301:2019 y NRP-24',
};

export function frameworkFor(auditType?: string | null): string {
  return (auditType && FRAMEWORK_BY_AUDIT_TYPE[auditType]) || 'normas profesionales de auditoría (NIA/IAASB, COSO)';
}

/** Las aserciones de NIA 315 (EXI, VAL, COM…) son de estados financieros; en un encargo fiscal, PLD o de TI no aplican. */
export function usesFinancialAssertions(auditType?: string | null): boolean {
  return auditType === 'EXTERNAL_FINANCIAL' || auditType === 'FINANCIAL' || auditType === 'EXTERNAL';
}

// ─── Texto ────────────────────────────────────────────────────────────────────

function collapse(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

export function clip(s: string, max: number): string {
  const t = collapse(s);
  if (max <= 0) return '';
  return t.length <= max ? t : `${t.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** Resumen corto de un valor de sección: texto tal cual; listas y matrices como «N elementos», nunca volcadas. */
export function valueSummary(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return collapse(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '';
    if (value.every((v) => typeof v === 'string')) return collapse((value as string[]).join('; '));
    return `[${value.length} ${value.length === 1 ? 'elemento' : 'elementos'}]`;
  }
  if (typeof value === 'object') {
    const texts = Object.values(value as Record<string, unknown>).filter((v): v is string => typeof v === 'string' && v.trim() !== '');
    return collapse(texts.join(' · '));
  }
  return '';
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function procLabel(p: PaperAiInput['procedures'][number]): string {
  return collapse(p.title || p.area || p.statement || p.procedure || '');
}

// ─── Ficha ────────────────────────────────────────────────────────────────────

/**
 * Ficha compacta del papel y del encargo. Prioridad al recortar: encargo y papel (siempre), secciones llenas, procedimientos
 * existentes, etiquetas de secciones por llenar. Nunca pasa de `budget.totalChars`.
 */
export function buildPaperBrief(input: PaperAiInput, budget: BriefBudget = BUDGETS.estandar): string {
  const { paper, audit } = input;

  const head: string[] = [];
  const tipo = [audit.type, audit.subtype].filter(Boolean).join(' / ');
  const periodo = [fmtDate(audit.periodStart), fmtDate(audit.periodEnd)].filter(Boolean).join(' a ');
  const encargo = [
    tipo ? `${tipo}` : '',
    audit.title ? `"${clip(audit.title, 120)}"` : '',
    audit.entityName ? `entidad: ${clip(audit.entityName, 80)}` : '',
    periodo ? `período: ${periodo}` : '',
  ].filter(Boolean).join(' — ');
  if (encargo) head.push(`ENCARGO: ${encargo}`);
  if (audit.scope && collapse(audit.scope)) head.push(`ALCANCE: ${clip(audit.scope, budget.scopeChars)}`);
  head.push(`PAPEL: ${paper.code ? `${paper.code} — ` : ''}${clip(paper.title, 140)}`);
  if (budget.narrativeChars > 0 && paper.narrative && collapse(paper.narrative)) {
    head.push(`NARRATIVA DEL PAPEL: ${clip(paper.narrative, budget.narrativeChars)}`);
  }

  const filled: string[] = [];
  const empty: string[] = [];
  for (const s of input.sections) {
    const v = valueSummary(s.value);
    if (v) filled.push(`- [${s.key}] ${clip(s.label, 60)}: ${clip(v, budget.sectionChars)}`);
    else empty.push(clip(s.label, 50));
  }
  const procs = input.procedures.map(procLabel).filter(Boolean).map((p) => clip(p, budget.procChars));

  const render = (nFilled: number, nProcs: number, nEmpty: number): string => {
    const parts = [...head];
    if (nFilled > 0) parts.push(`SECCIONES YA LLENAS:\n${filled.slice(0, nFilled).join('\n')}`);
    if (nEmpty > 0 && empty.length > 0) parts.push(`SECCIONES POR LLENAR (de qué trata el papel): ${empty.slice(0, nEmpty).join('; ')}`);
    if (nProcs > 0 && procs.length > 0) parts.push(`PROCEDIMIENTOS YA EN EL PAPEL (no repetirlos): ${procs.slice(0, nProcs).join('; ')}`);
    return parts.join('\n');
  };

  let nFilled = Math.min(filled.length, budget.sections);
  let nProcs = Math.min(procs.length, budget.procs);
  let nEmpty = Math.min(empty.length, budget.empties);
  let out = render(nFilled, nProcs, nEmpty);
  // Recorta de lo menos a lo más valioso hasta que quepa: etiquetas vacías → procedimientos → secciones llenas.
  while (out.length > budget.totalChars && (nEmpty > 0 || nProcs > 0 || nFilled > 0)) {
    if (nEmpty > 0) nEmpty -= 1;
    else if (nProcs > 0) nProcs -= 1;
    else nFilled -= 1;
    out = render(nFilled, nProcs, nEmpty);
  }
  return out.length > budget.totalChars ? clip(out, budget.totalChars) : out;
}

// ─── Suficiencia ──────────────────────────────────────────────────────────────

const GENERIC_TITLE = /^(nuevo papel|nuevo papel de trabajo|nueva hoja|nuevo|nueva|sin titulo|papel|papel de trabajo|documento|prueba|test|tmp|temporal|untitled|new paper)( \d+)?$/;

function normTitle(s: string): string {
  return collapse(s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
}

export interface ContextAssessment {
  enough: boolean;
  missing: string[];
}

/**
 * ¿Hay con qué proponer algo específico de ESTE papel? Se necesita un título descriptivo y al menos una señal más: plantilla conocida,
 * una sección llena, un procedimiento, narrativa o el alcance del encargo. Es deliberadamente permisiva: la segunda capa es la propia IA,
 * que responde `SIN_CONTEXTO` si aun así no puede.
 */
export function assessPaperContext(input: PaperAiInput): ContextAssessment {
  const title = normTitle(input.paper.title || '');
  const letters = title.replace(/[^a-z]/g, '').length;
  const words = title.split(' ').filter((w) => /[a-z0-9]/.test(w)).length;
  const titleOk = letters >= 4 && !GENERIC_TITLE.test(title) && (words >= 2 || input.hasTemplate);

  const hasFilledSection = input.sections.some((s) => valueSummary(s.value) !== '');
  const hasProcedure = input.procedures.some((p) => procLabel(p) !== '');
  const hasNarrative = collapse(input.paper.narrative ?? '').length >= 40;
  const hasScope = collapse(input.audit.scope ?? '').length >= 20;
  const hasSignal = input.hasTemplate || hasFilledSection || hasProcedure || hasNarrative || hasScope;

  const missing: string[] = [];
  if (!titleOk) missing.push('un título descriptivo del papel (hoy es genérico o demasiado corto)');
  if (!hasSignal) missing.push('algo de contenido: llenar al menos una sección, agregar un procedimiento o definir el alcance del encargo');
  return { enough: missing.length === 0, missing };
}

export function insufficientMessage(missing: string[]): string {
  const falta = missing.length > 0 ? ` Falta: ${missing.join('; ')}.` : '';
  return `La IA no tiene contexto suficiente de este papel para proponer algo específico y prefiere no inventar.${falta}`;
}

/** Instrucción común a todos los prompts: cómo avisar que falta contexto. */
export function insufficientInstruction(asJson: boolean): string {
  return asJson
    ? `Si con el contexto recibido NO puedes proponer algo específico de ESTE papel (solo saldría algo genérico que valdría para cualquier papel), responde únicamente {"sin_contexto": "<qué falta, en una frase>"} en lugar de lo pedido.`
    : `Si con el contexto recibido NO puedes proponer algo específico de ESTE papel (solo saldría algo genérico que valdría para cualquier papel), responde únicamente "${INSUFFICIENT_MARK}: <qué falta, en una frase>" en lugar de lo pedido.`;
}

/** Detecta el aviso de la IA («SIN_CONTEXTO: …» en texto o `{"sin_contexto": "…"}` en JSON). Devuelve el motivo, o null si es una respuesta normal. */
export function parseInsufficient(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = raw.trim();
  const json = text.match(/^\s*(?:```(?:json)?\s*)?\{\s*"sin_contexto"\s*:\s*"((?:[^"\\]|\\.)*)"/i);
  if (json) return collapse(json[1].replace(/\\"/g, '"')) || 'La IA indicó que falta contexto del papel.';
  // Exige los dos puntos (o el marcador solo): «Sin contexto adicional, se revisó…» es un desarrollo legítimo, no un aviso.
  const plain = text.match(/^["'\s]*SIN[_ ]CONTEXTO\s*:\s*([\s\S]*)$/i);
  if (plain) return collapse(plain[1].replace(/["']+\s*$/, '')) || 'La IA indicó que falta contexto del papel.';
  if (/^["'\s]*SIN_CONTEXTO["'\s]*$/i.test(text)) return 'La IA indicó que falta contexto del papel.';
  return null;
}

// ─── Normativa (RAG) ──────────────────────────────────────────────────────────

export function ragQueryFor(parts: Array<string | null | undefined>): string {
  return clip(parts.filter((p): p is string => !!p && collapse(p) !== '').join(' — '), 300);
}

/** Máximo 3 fragmentos de ~350 caracteres: la normativa que fundamenta, sin inflar el prompt. */
export function buildRagBlock(
  hits: Array<{ content: string; sectionTitle: string | null }>,
  maxHits = 3,
  charsEach = 350,
): string {
  return hits
    .slice(0, maxHits)
    .map((h) => `${h.sectionTitle ? `[${clip(h.sectionTitle, 60)}] ` : ''}${clip(h.content, charsEach)}`)
    .join('\n---\n');
}

// ─── Carga desde la base ──────────────────────────────────────────────────────

/** Subconjunto de Prisma que usa el cargador (facilita las pruebas con un doble). */
export interface PaperAiPrisma {
  workingPaper: {
    findUnique(args: unknown): Promise<unknown>;
  };
}

/**
 * Lee del servidor lo que la ficha necesita. NO valida acceso: quien llama debe haber pasado ya por su `assertPaperAccess` /
 * `assertSectionAccess` (organización y modo investigación).
 */
export async function loadPaperAiInput(prisma: PaperAiPrisma, paperId: string): Promise<PaperAiInput | null> {
  const wp = (await prisma.workingPaper.findUnique({
    where: { id: paperId },
    select: {
      code: true, paperCode: true, title: true, narrative: true, content: true,
      audit: {
        select: {
          title: true, type: true, subtype: true, scope: true, auditPeriodStart: true, auditPeriodEnd: true,
          auditEntity: { select: { name: true } },
        },
      },
      sections: { orderBy: { sortOrder: 'asc' }, select: { sectionKey: true, label: true, value: true } },
    },
  })) as null | {
    code: string; paperCode: string | null; title: string; narrative: string | null; content: unknown;
    audit: {
      title: string; type: string; subtype: string | null; scope: string | null;
      auditPeriodStart: Date | null; auditPeriodEnd: Date | null; auditEntity: { name: string } | null;
    };
    sections: Array<{ sectionKey: string; label: string; value: unknown }>;
  };
  if (!wp) return null;

  const content = (wp.content && typeof wp.content === 'object' ? wp.content : {}) as { procedures?: unknown };
  const procedures = Array.isArray(content.procedures) ? (content.procedures as PaperAiInput['procedures']) : [];
  const code = wp.paperCode ?? wp.code ?? null;

  return {
    paper: { code, title: wp.title, narrative: wp.narrative },
    audit: {
      title: wp.audit.title, type: wp.audit.type, subtype: wp.audit.subtype, scope: wp.audit.scope,
      entityName: wp.audit.auditEntity?.name ?? null, periodStart: wp.audit.auditPeriodStart, periodEnd: wp.audit.auditPeriodEnd,
    },
    sections: wp.sections.map((s) => ({ key: s.sectionKey, label: s.label, value: s.value })),
    procedures,
    hasTemplate: !!(wp.paperCode && PAPER_TEMPLATES[wp.paperCode]),
  };
}
