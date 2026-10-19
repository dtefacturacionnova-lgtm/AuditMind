/**
 * Búsqueda de papeles en el índice (Expediente) de un encargo. Lógica pura, sin React.
 *
 * Se busca en lo que el auditor reconoce de un papel: su referencia, su código de índice (`B-10`), su código de plantilla
 * (`PT-ENTREV`), su título y el nombre del archivo. Sin distinguir mayúsculas ni tildes («conciliacion» encuentra
 * «Conciliación»). Varias palabras se combinan con Y: «entrevista guia» exige ambas.
 */

export interface SearchablePaper {
  id: string;
  ref?: string | null;
  code?: string | null;
  paperCode?: string | null;
  title: string;
  originalFilename?: string | null;
}

export interface SearchableFolder<P extends SearchablePaper = SearchablePaper> {
  id: string;
  ref: string;
  name: string;
  papers?: P[];
  children?: SearchableFolder<P>[];
}

export interface SearchablePhase<P extends SearchablePaper = SearchablePaper> {
  name: string;
  folders: SearchableFolder<P>[];
}

/** Minúsculas, sin tildes ni signos de combinación y con los espacios normalizados. */
export function normalizeText(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Palabras de la búsqueda; con menos de 2 caracteres en total no se busca. */
export function searchTokens(query: string): string[] {
  const q = normalizeText(query);
  return q.length < 2 ? [] : q.split(' ').filter(Boolean);
}

export function paperHaystack(p: SearchablePaper): string {
  return normalizeText([p.ref, p.code, p.paperCode, p.title, p.originalFilename].filter(Boolean).join(' '));
}

export function paperMatches(p: SearchablePaper, tokens: string[]): boolean {
  if (tokens.length === 0) return false;
  const hay = paperHaystack(p);
  return tokens.every((t) => hay.includes(t));
}

export interface PaperHit<P extends SearchablePaper = SearchablePaper> {
  paper: P;
  /** Dónde está: «Planificación › B — Estados Financieros»; «Sin carpeta» si no está en ninguna. */
  location: string;
  folderId: string | null;
}

export const NO_FOLDER_LABEL = 'Sin carpeta';

/** Recorre fases → carpetas (cualquier profundidad) → papeles, y los papeles sueltos al final. */
export function searchPapers<P extends SearchablePaper>(
  phases: SearchablePhase<P>[],
  orphans: P[],
  query: string,
): PaperHit<P>[] {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return [];
  const hits: PaperHit<P>[] = [];

  const walk = (folders: SearchableFolder<P>[], phaseName: string, trail: string[]) => {
    for (const f of folders) {
      const here = [...trail, `${f.ref} — ${f.name}`];
      for (const paper of f.papers ?? []) {
        if (paperMatches(paper, tokens)) hits.push({ paper, location: [phaseName, ...here].join(' › '), folderId: f.id });
      }
      walk(f.children ?? [], phaseName, here);
    }
  };
  for (const phase of phases) walk(phase.folders, phase.name, []);
  for (const paper of orphans) if (paperMatches(paper, tokens)) hits.push({ paper, location: NO_FOLDER_LABEL, folderId: null });
  return hits;
}
