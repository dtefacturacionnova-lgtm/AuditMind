/**
 * Biblioteca de procedimientos por papel — contenido curado que se sugiere SIN gastar tokens de IA.
 *
 * Idea: cada papel (por `paperCode`) trae procedimientos ya redactados, con un desarrollo modelo con marcadores `[completar…]`. El botón
 * «Generar sugerencias» muestra primero esto (0 tokens); la IA solo se usa para AMPLIAR cuando el auditor lo pide, y recibe la lista
 * de lo ya sugerido para no repetirlo.
 *
 * El catálogo vive en código (versionado y revisable en git; llega con cada despliegue, sin SQL). La edición por organización queda
 * para una fase posterior. Diseño: docs/ia-contexto-del-papel-propuesta.md §5.
 *
 * REGLA DE CONTENIDO: solo se citan NIA/NIC/NIIF/NIGC por número de norma y los artículos de `ALLOWED_LEGAL_REFS`, que fueron verificados
 * contra la base RAG. Cualquier otra norma local se describe sin inventar numeración. `validateLibrary` lo hace cumplir en las pruebas.
 */

export const TECHNIQUES = ['Inspección', 'Confirmación', 'Observación', 'Indagación', 'Recálculo', 'Reejecución', 'Analítico'] as const;
export type Technique = (typeof TECHNIQUES)[number];
export type LibraryPriority = 'HIGH' | 'MEDIUM' | 'LOW';

/** Artículos locales verificados contra el RAG (FISCAL_SV). Agregar uno exige verificarlo primero. */
export const ALLOWED_LEGAL_REFS: readonly string[] = [
  'Art. 151 CT',    // pago a cuenta mensual del ISR, 1.75 % de los ingresos brutos mensuales
  'Art. 119-E CT',  // invalidación de Documentos Tributarios Electrónicos
];

export interface PaperLibraryProcedure {
  /** Estable: `${paperCode}.NN`. No cambia aunque cambie el texto (permite saber qué se aplicó). */
  id: string;
  /** Título corto (≤ 90). */
  title: string;
  /** Qué se va a ejecutar (enunciado). */
  statement: string;
  /** Desarrollo modelo, con marcadores [completar…] donde el auditor documenta lo que obtuvo. Nunca cifras ni resultados inventados. */
  development: string;
  technique: Technique;
  /** NIA/NIC/NIIF/NIGC por número, o un artículo de ALLOWED_LEGAL_REFS. */
  ref?: string;
  priority: LibraryPriority;
  /** Si se indica, el procedimiento solo aplica a esos tipos de encargo (p. ej. un papel reutilizado en varios marcos). */
  auditTypes?: string[];
  /**
   * De dónde sale en la biblioteca EFECTIVA de una organización (ver org-library.ts). El catálogo en código no lo trae:
   * `BASE` = tal cual viene del sistema, `EDITED` = el sistema lo trae pero la organización lo ajustó, `OWN` = lo creó la organización.
   */
  origin?: LibraryOrigin;
}

export type LibraryOrigin = 'BASE' | 'EDITED' | 'OWN';

export interface PaperLibraryEntry {
  /** 'AAAA-MM' de la última revisión del contenido (para saber cuándo una norma cambió y toca revisar). */
  reviewedAt: string;
  procedures: PaperLibraryProcedure[];
}

export type PaperLibrary = Record<string, PaperLibraryEntry>;

/** Arma la entrada de un papel numerando los ids (`PT-XXX.01`, `.02`…) en el orden dado: el orden no se reordena sin cambiar los ids a propósito. */
export function entry(paperCode: string, reviewedAt: string, items: Array<Omit<PaperLibraryProcedure, 'id'>>): [string, PaperLibraryEntry] {
  return [paperCode, { reviewedAt, procedures: items.map((p, i) => ({ ...p, id: `${paperCode}.${String(i + 1).padStart(2, '0')}` })) }];
}

/** Forma común con `AiProcedureSuggestion` (cross-audit-learning) más lo que permite aplicar el ítem completo al papel. */
export interface LibrarySuggestion {
  id: string;
  area: string;
  procedure: string;
  rationale: string;
  priority: LibraryPriority;
  basedOn: string;
  niaRef?: string;
  title: string;
  statement: string;
  development: string;
  source: 'LIBRARY';
  /** Si lo pone el sistema, lo ajustó la organización o lo creó ella (la pantalla lo rotula distinto). */
  origin: LibraryOrigin;
}

// ─── Texto ────────────────────────────────────────────────────────────────────

export function normalizeTitle(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Texto de «basado en» que ve el auditor según quién escribió el procedimiento. */
export function basedOnFor(origin: LibraryOrigin, reviewedAt: string): string {
  if (origin === 'OWN') return 'Biblioteca de tu organización';
  if (origin === 'EDITED') return `Biblioteca del papel, ajustada por tu organización (base revisada ${reviewedAt})`;
  return `Biblioteca del papel (revisada ${reviewedAt})`;
}

// ─── Selección ────────────────────────────────────────────────────────────────

/** Procedimientos de la biblioteca de un papel, filtrados por tipo de encargo. Vacío si el papel no tiene biblioteca. */
export function libraryProceduresFor(
  paperCode: string | null | undefined,
  auditType: string | null | undefined,
  library: PaperLibrary,
): PaperLibraryProcedure[] {
  if (!paperCode) return [];
  const entry = library[paperCode];
  if (!entry) return [];
  return entry.procedures.filter((p) => !p.auditTypes || p.auditTypes.length === 0 || (!!auditType && p.auditTypes.includes(auditType)));
}

/**
 * Convierte ítems de la biblioteca en sugerencias. Omite los que el papel YA tiene aplicados (mismo título) para no repetirlos.
 * `appliedTitles` son los títulos/áreas/enunciados de los procedimientos existentes del papel.
 */
export function libraryToSuggestions(
  items: PaperLibraryProcedure[],
  reviewedAt: string,
  appliedTitles: string[] = [],
): LibrarySuggestion[] {
  const applied = new Set(appliedTitles.map(normalizeTitle).filter(Boolean));
  const order: Record<LibraryPriority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return items
    .filter((p) => !applied.has(normalizeTitle(p.title)) && !applied.has(normalizeTitle(p.statement)))
    .map((p, i) => ({ p, i }))
    .sort((a, b) => order[a.p.priority] - order[b.p.priority] || a.i - b.i)
    .map(({ p }) => ({
      id: `lib-${p.id}`,
      area: p.title,
      procedure: p.statement,
      rationale: `Procedimiento tipo de la biblioteca de este papel (técnica: ${p.technique}). Ya trae un desarrollo modelo con marcadores [completar…]; no se gastó IA.`,
      priority: p.priority,
      basedOn: basedOnFor(p.origin ?? 'BASE', reviewedAt),
      niaRef: p.ref,
      title: p.title,
      statement: p.statement,
      development: p.development,
      source: 'LIBRARY' as const,
      origin: p.origin ?? 'BASE',
    }));
}

// ─── Calidad del catálogo (las pruebas exigen que no haya problemas) ─────────

const REF_STANDARD = /^(NIA|NIC|NIIF|NIGC) ?\d+(\.\d+)?( ?(\/|,|y) ?(NIA|NIC|NIIF|NIGC) ?\d+)*$/;
const REVIEWED = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Reglas que cada ítem del catálogo debe cumplir. Devuelve la lista de problemas (vacía = catálogo sano).
 * `validPaperCodes`: códigos de papel que existen (plantillas), para atrapar un `paperCode` mal escrito.
 */
export function validateLibrary(library: PaperLibrary, validPaperCodes: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  const allIds = new Set<string>();

  for (const [code, entry] of Object.entries(library)) {
    const at = (m: string) => problems.push(`${code}: ${m}`);
    if (!validPaperCodes.has(code)) at('el papel no existe en las plantillas');
    if (!REVIEWED.test(entry.reviewedAt)) at(`reviewedAt inválido («${entry.reviewedAt}»)`);
    if (entry.procedures.length < 3) at(`trae ${entry.procedures.length} procedimientos (mínimo 3)`);

    const titles = new Set<string>();
    entry.procedures.forEach((p, idx) => {
      const pa = (m: string) => problems.push(`${p.id}: ${m}`);
      const expected = `${code}.${String(idx + 1).padStart(2, '0')}`;
      if (p.id !== expected) pa(`el id debería ser ${expected}`);
      if (allIds.has(p.id)) pa('id repetido');
      allIds.add(p.id);
      const nt = normalizeTitle(p.title);
      if (titles.has(nt)) pa('título repetido dentro del papel');
      titles.add(nt);

      if (p.title.length < 8 || p.title.length > 90) pa(`el título debe tener entre 8 y 90 caracteres (tiene ${p.title.length})`);
      if (p.statement.length < 30 || p.statement.length > 400) pa(`el enunciado debe tener entre 30 y 400 caracteres (tiene ${p.statement.length})`);
      if (p.development.length < 80 || p.development.length > 700) pa(`el desarrollo debe tener entre 80 y 700 caracteres (tiene ${p.development.length})`);
      if (!/\[completar/i.test(p.development)) pa('el desarrollo debe llevar marcadores [completar…]');
      // Un desarrollo modelo no trae montos: los pone el auditor en los marcadores.
      if (/\$\s?\d/.test(p.development)) pa('el desarrollo no debe traer montos');
      const textoCompleto = `${p.title} ${p.statement} ${p.development}`;
      if (/\b(lorem|xxx)\b/i.test(textoCompleto) || /\bTODO\b/.test(textoCompleto) || /pendiente de redactar/i.test(textoCompleto)) pa('tiene texto provisional');
      if (!(TECHNIQUES as readonly string[]).includes(p.technique)) pa(`técnica desconocida («${p.technique}»)`);
      if (!['HIGH', 'MEDIUM', 'LOW'].includes(p.priority)) pa(`prioridad desconocida («${p.priority}»)`);
      if (p.ref !== undefined && !REF_STANDARD.test(p.ref) && !ALLOWED_LEGAL_REFS.includes(p.ref)) {
        pa(`la referencia «${p.ref}» no es una NIA/NIC/NIIF/NIGC ni un artículo verificado (ALLOWED_LEGAL_REFS)`);
      }
      // No se cita numeración legal local en el texto fuera de lo verificado.
      const texto = `${p.statement} ${p.development}`;
      const arts = texto.match(/\bArt(?:ículo|s?\.)\s*\d+[-\w]*(?:\s*(?:CT|LISR|LIVA|Ley[^,.;]*))?/gi) ?? [];
      for (const a of arts) {
        const verificado = ALLOWED_LEGAL_REFS.some((r) => normalizeTitle(a).includes(normalizeTitle(r.replace(/\s*CT$/, ''))));
        if (!verificado) pa(`cita un artículo no verificado en el texto («${a.trim()}»)`);
      }
    });
  }
  return problems;
}
