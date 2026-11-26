/**
 * Biblioteca por papel — capa de la ORGANIZACIÓN sobre el catálogo en código.
 *
 * El catálogo del sistema (`PAPER_LIBRARY`) llega con cada despliegue y no se toca desde la app. Encima de él, cada organización guarda
 * sus propios ajustes en `content_library_items` (kind = PAPER_PROCEDURE, groupKey = código del papel):
 *   · procedimiento PROPIO       → fila sin `baseId`: lo creó la organización.
 *   · EDICIÓN de uno del sistema → fila con `baseId` y el contenido completo: reemplaza al original para esa organización.
 *   · OCULTAR uno del sistema    → fila con `baseId` y `hidden: true`: deja de sugerirse (el original sigue en el sistema).
 *   · RESTAURAR                  → se borra la fila: vuelve el texto del sistema.
 * Lo que se sugiere = catálogo − ocultos, con las ediciones encima, más los propios. Así una corrección del sistema llega a quien no
 * lo tocó, y quien lo ajustó conserva su versión.
 *
 * Forma de la fila: itemLabel = título · itemSubtitle = técnica · itemDetails = OrgPayload (JSON).
 * Este archivo es lógica pura (fusión y validación) más dos funciones que leen la base; el servicio con permisos vive aparte.
 */
import { AuditType, ContentLibraryKind } from '@prisma/client';
import {
  LibraryOrigin, LibraryPriority, PaperLibrary, PaperLibraryEntry, PaperLibraryProcedure, TECHNIQUES, Technique, normalizeTitle,
} from './paper-library';
import { PAPER_LIBRARY } from './index';

export const PAPER_PROCEDURE_KIND = ContentLibraryKind.PAPER_PROCEDURE;

/** Topes para que nadie llene la base por error o abuso. */
export const MAX_OWN_PER_PAPER = 60;
export const MAX_ROWS_PER_ORG = 1500;

const PRIORITIES: readonly LibraryPriority[] = ['HIGH', 'MEDIUM', 'LOW'];
export const PAPER_CODE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{1,39}$/;

// ─── Tipos ────────────────────────────────────────────────────────────────────

/** Lo que el auditor escribe (y lo que se guarda) para un procedimiento de la organización. */
export interface OrgProcedureInput {
  title: string;
  statement: string;
  development: string;
  technique: Technique;
  ref?: string;
  priority: LibraryPriority;
  /** Vacío/ausente = aplica a todos los tipos de encargo. */
  auditTypes?: string[];
}

/** Contenido de `itemDetails`. */
export interface OrgPayload {
  v: 1;
  baseId?: string;
  hidden?: boolean;
  statement?: string;
  development?: string;
  ref?: string;
  priority?: LibraryPriority;
  auditTypes?: string[];
}

/** Lo mínimo que se necesita de una fila de `content_library_items`. */
export interface OrgLibraryRow {
  id: string;
  groupKey: string;
  itemLabel: string;
  itemSubtitle: string | null;
  itemDetails: unknown;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface MergedProcedure extends PaperLibraryProcedure {
  origin: LibraryOrigin;
  hidden: boolean;
  /** Fila de la organización detrás de este ítem (ediciones, ocultos y propios). Ausente = viene del sistema sin tocar. */
  rowId?: string;
  /** Solo EDITED: el texto original del sistema, para mostrar qué cambió y poder restaurarlo. */
  original?: PaperLibraryProcedure;
}

export interface MergedPaper {
  paperCode: string;
  /** El papel tiene catálogo del sistema. */
  hasBase: boolean;
  reviewedAt: string;
  items: MergedProcedure[];
}

// ─── Lectura defensiva de filas ───────────────────────────────────────────────

interface ParsedRow {
  row: OrgLibraryRow;
  baseId?: string;
  hidden: boolean;
  /** Presente solo si la fila trae un contenido completo y válido. */
  content?: OrgProcedureInput;
}

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export function parseRow(row: OrgLibraryRow): ParsedRow {
  const d = asObject(row.itemDetails) ?? {};
  const baseId = typeof d.baseId === 'string' && d.baseId ? d.baseId : undefined;
  const hidden = d.hidden === true;
  const technique = row.itemSubtitle as Technique;
  const hasContent =
    typeof d.statement === 'string' && d.statement.trim() !== '' &&
    typeof d.development === 'string' && d.development.trim() !== '' &&
    row.itemLabel.trim() !== '' &&
    (TECHNIQUES as readonly string[]).includes(technique) &&
    PRIORITIES.includes(d.priority as LibraryPriority);
  if (!hasContent) return { row, baseId, hidden };
  const auditTypes = Array.isArray(d.auditTypes) ? d.auditTypes.filter((t): t is string => typeof t === 'string') : [];
  return {
    row, baseId, hidden,
    content: {
      title: row.itemLabel,
      statement: d.statement as string,
      development: d.development as string,
      technique,
      ref: typeof d.ref === 'string' && d.ref ? d.ref : undefined,
      priority: d.priority as LibraryPriority,
      auditTypes: auditTypes.length > 0 ? auditTypes : undefined,
    },
  };
}

export function buildPayload(content: OrgProcedureInput | undefined, opts: { baseId?: string; hidden?: boolean }): OrgPayload {
  return {
    v: 1,
    ...(opts.baseId ? { baseId: opts.baseId } : {}),
    ...(opts.hidden ? { hidden: true } : {}),
    ...(content
      ? {
          statement: content.statement,
          development: content.development,
          ...(content.ref ? { ref: content.ref } : {}),
          priority: content.priority,
          ...(content.auditTypes && content.auditTypes.length > 0 ? { auditTypes: content.auditTypes } : {}),
        }
      : {}),
  };
}

// ─── Fusión ───────────────────────────────────────────────────────────────────

function currentMonth(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Misma sustancia (para detectar «editó sin cambiar nada»). */
export function sameContent(a: OrgProcedureInput, b: PaperLibraryProcedure): boolean {
  const types = (x?: string[]) => [...(x ?? [])].sort().join('|');
  return (
    a.title === b.title && a.statement === b.statement && a.development === b.development && a.technique === b.technique &&
    (a.ref ?? '') === (b.ref ?? '') && a.priority === b.priority && types(a.auditTypes) === types(b.auditTypes)
  );
}

/**
 * Biblioteca efectiva de UN papel para una organización: catálogo del sistema (en su orden) con ediciones y ocultos aplicados,
 * seguido de los procedimientos propios (por `sortOrder`). Si hay varias filas para el mismo procedimiento del sistema (carrera
 * entre dos editores), gana la más reciente.
 */
export function mergePaper(
  paperCode: string,
  rows: OrgLibraryRow[],
  base: PaperLibrary = PAPER_LIBRARY,
  now: Date = new Date(),
): MergedPaper {
  const baseEntry = base[paperCode];
  const parsed = rows.filter((r) => r.groupKey === paperCode).map(parseRow);

  const overrides = new Map<string, ParsedRow>();
  for (const p of [...parsed].sort((a, b) => a.row.updatedAt.getTime() - b.row.updatedAt.getTime())) {
    if (p.baseId) overrides.set(p.baseId, p); // el orden ascendente deja al final la más reciente
  }

  const items: MergedProcedure[] = [];
  for (const b of baseEntry?.procedures ?? []) {
    const ov = overrides.get(b.id);
    if (!ov) { items.push({ ...b, origin: 'BASE', hidden: false }); continue; }
    if (ov.content && !sameContent(ov.content, b)) {
      items.push({
        ...b, ...ov.content, id: b.id, auditTypes: ov.content.auditTypes,
        origin: 'EDITED', hidden: ov.hidden, rowId: ov.row.id, original: b,
      });
    } else {
      items.push({ ...b, origin: 'BASE', hidden: ov.hidden, ...(ov.hidden ? { rowId: ov.row.id } : {}) });
    }
  }

  const own = parsed
    .filter((p) => !p.baseId && p.content)
    .sort((a, b) => a.row.sortOrder - b.row.sortOrder || a.row.createdAt.getTime() - b.row.createdAt.getTime());
  for (const p of own) {
    items.push({ ...(p.content as OrgProcedureInput), id: `org-${p.row.id}`, origin: 'OWN', hidden: false, rowId: p.row.id });
  }

  return { paperCode, hasBase: !!baseEntry, reviewedAt: baseEntry?.reviewedAt ?? currentMonth(now), items };
}

/** Lo que alimenta «Generar sugerencias»: sin ocultos, con el origen de cada ítem, y los títulos ocultos aparte (la IA no debe repetirlos). */
export function effectiveEntry(merged: MergedPaper): { entry: PaperLibraryEntry; hiddenTitles: string[] } {
  const visible = merged.items.filter((i) => !i.hidden);
  return {
    entry: {
      reviewedAt: merged.reviewedAt,
      procedures: visible.map(({ hidden: _h, rowId: _r, original: _o, ...p }) => p),
    },
    hiddenTitles: merged.items.filter((i) => i.hidden).map((i) => i.title),
  };
}

// ─── Validación y limpieza de lo que escribe el auditor ───────────────────────

/** Recorta espacios, vacía `ref` y quita tipos de encargo repetidos. No inventa nada. */
export function cleanOrgInput(i: Partial<OrgProcedureInput>): Partial<OrgProcedureInput> {
  const t = (s: unknown) => (typeof s === 'string' ? s.trim() : undefined);
  const ref = t(i.ref);
  const types = Array.isArray(i.auditTypes) ? [...new Set(i.auditTypes.map((x) => String(x).trim()).filter(Boolean))] : undefined;
  return {
    title: t(i.title), statement: t(i.statement), development: t(i.development),
    technique: i.technique, priority: i.priority,
    ...(ref ? { ref } : {}),
    ...(types && types.length > 0 ? { auditTypes: types } : {}),
  };
}

/**
 * Reglas para lo que escribe la organización. Más flojas que las del catálogo del sistema a propósito: aquí escribe una persona que
 * conoce su norma local, así que NO se limitan las referencias ni se exigen los marcadores [completar…] (el formulario los sugiere).
 * Sí se cuidan largos, técnica, prioridad y tipos de encargo válidos.
 */
export function validateOrgProcedure(
  input: Partial<OrgProcedureInput>,
  validAuditTypes: readonly string[] = Object.values(AuditType),
): string[] {
  const p: string[] = [];
  const len = (s: string | undefined) => (s ?? '').length;
  if (len(input.title) < 8 || len(input.title) > 90) p.push(`El título debe tener entre 8 y 90 caracteres (tiene ${len(input.title)}).`);
  if (len(input.statement) < 30 || len(input.statement) > 600) p.push(`El enunciado debe tener entre 30 y 600 caracteres (tiene ${len(input.statement)}).`);
  if (len(input.development) < 80 || len(input.development) > 1500) p.push(`El desarrollo debe tener entre 80 y 1500 caracteres (tiene ${len(input.development)}).`);
  if (!input.technique || !(TECHNIQUES as readonly string[]).includes(input.technique)) p.push(`La técnica debe ser una de: ${TECHNIQUES.join(', ')}.`);
  if (!input.priority || !PRIORITIES.includes(input.priority)) p.push('La prioridad debe ser HIGH, MEDIUM o LOW.');
  if (input.ref !== undefined && input.ref.length > 60) p.push('La referencia no puede pasar de 60 caracteres.');
  for (const t of input.auditTypes ?? []) {
    if (!validAuditTypes.includes(t)) p.push(`«${t}» no es un tipo de encargo válido.`);
  }
  return p;
}

/** Otro ítem VISIBLE del mismo papel con el mismo título (o el mismo enunciado). `exceptId` = el que se está editando. */
export function findDuplicate(items: MergedProcedure[], input: Pick<OrgProcedureInput, 'title' | 'statement'>, exceptId?: string): MergedProcedure | undefined {
  const nt = normalizeTitle(input.title);
  const ns = normalizeTitle(input.statement);
  return items.find((i) => !i.hidden && i.id !== exceptId && (normalizeTitle(i.title) === nt || normalizeTitle(i.statement) === ns));
}

// ─── Lectura desde la base ────────────────────────────────────────────────────

/** Subconjunto de PrismaService que usan estas funciones (para poder probarlas sin base). */
export interface OrgLibraryDb {
  contentLibraryItem: {
    findMany(args: unknown): Promise<OrgLibraryRow[]>;
  };
}

export async function loadOrgRows(db: OrgLibraryDb, organizationId: string, paperCode?: string): Promise<OrgLibraryRow[]> {
  return db.contentLibraryItem.findMany({
    where: { organizationId, kind: PAPER_PROCEDURE_KIND, ...(paperCode ? { groupKey: paperCode } : {}) },
    select: { id: true, groupKey: true, itemLabel: true, itemSubtitle: true, itemDetails: true, sortOrder: true, createdAt: true, updatedAt: true },
    orderBy: { createdAt: 'asc' },
  });
}

/** Biblioteca efectiva de un papel para una organización. Lanza si la base falla: quien la usa decide si cae al catálogo del sistema. */
export async function loadMergedPaper(db: OrgLibraryDb, organizationId: string, paperCode: string): Promise<MergedPaper> {
  return mergePaper(paperCode, await loadOrgRows(db, organizationId, paperCode));
}
