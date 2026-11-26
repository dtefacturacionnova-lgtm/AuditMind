import { CATALOG_FINANCIERA } from './catalog-financiera';
import { CATALOG_FISCAL } from './catalog-fiscal';
import { LibrarySuggestion, PaperLibrary, libraryProceduresFor, libraryToSuggestions } from './paper-library';

export * from './paper-library';

/** Catálogo completo. Para agregar papeles: nuevo archivo `catalog-*.ts` con `entry(...)` y sumarlo aquí; las pruebas validan el contenido. */
export const PAPER_LIBRARY: PaperLibrary = { ...CATALOG_FINANCIERA, ...CATALOG_FISCAL };

export interface PaperLibraryResult {
  /** Sugerencias aún no aplicadas al papel, ordenadas por prioridad. */
  suggestions: LibrarySuggestion[];
  /** Total de procedimientos de la biblioteca del papel (aplicados o no). 0 = el papel no tiene biblioteca. */
  total: number;
  /** Títulos de todo lo que la biblioteca ofrece para ese papel, para decirle a la IA que no lo repita al ampliar. */
  allTitles: string[];
}

/** Biblioteca de un papel para un tipo de encargo, sin lo que el papel ya tiene aplicado. */
export function librarySuggestionsFor(
  paperCode: string | null | undefined,
  auditType: string | null | undefined,
  appliedTitles: string[] = [],
  library: PaperLibrary = PAPER_LIBRARY,
): PaperLibraryResult {
  const items = libraryProceduresFor(paperCode, auditType, library);
  if (items.length === 0) return { suggestions: [], total: 0, allTitles: [] };
  const reviewedAt = library[paperCode as string].reviewedAt;
  return {
    suggestions: libraryToSuggestions(items, reviewedAt, appliedTitles),
    total: items.length,
    allTitles: items.map((p) => p.title),
  };
}
