/**
 * Lo que el auditor redacta al enviar un ACTA DE ENTREVISTA a firma (docs/firma-externa-por-enlace.md §11.3): valores
 * iniciales y validación previa. Refleja `parseActaPayload` de la API (que vuelve a validar todo); aquí solo se avisa antes
 * de enviar. Lógica pura, sin React.
 */
export type Modality = 'PRESENCIAL' | 'VIRTUAL' | 'TELEFONICA';

export const MODALITY_OPTIONS: Array<{ value: Modality; label: string }> = [
  { value: 'PRESENCIAL', label: 'Presencial' },
  { value: 'VIRTUAL', label: 'Virtual' },
  { value: 'TELEFONICA', label: 'Telefónica' },
];

export const ACTA_LIMITS = { contentMin: 50, contentMax: 50_000, interviewersMax: 500, locationMax: 200, noteMax: 1000 } as const;

export interface ActaDraft {
  interviewDate?: string;
  modality?: Modality;
  location?: string;
  interviewers?: string;
  content?: string;
  confidentialityNote?: string;
}

/** Fecha de hoy en el calendario LOCAL del navegador (YYYY-MM-DD), no la de UTC. */
export function localIsoDate(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function initialActaPayload(interviewerName: string, now = new Date()): ActaDraft {
  return { interviewDate: localIsoDate(now), modality: 'PRESENCIAL', interviewers: interviewerName, location: '', content: '', confidentialityNote: '' };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Fecha real (rechaza 2026-02-31), no futura (se tolera mañana por la zona horaria) y de los últimos 10 años. */
export function isValidInterviewDate(value: string, now = new Date()): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) return false;
  const tenYearsAgo = new Date(now); tenYearsAgo.setUTCFullYear(now.getUTCFullYear() - 10);
  return d.getTime() <= now.getTime() + 24 * 3600 * 1000 && d.getTime() >= tenYearsAgo.getTime();
}

/** Texto del primer problema, o null si está listo para enviar. */
export function validateActaPayload(p: ActaDraft, now = new Date()): string | null {
  if (!p.interviewDate || !isValidInterviewDate(p.interviewDate, now)) return 'Escribe la fecha de la entrevista (no puede ser futura).';
  if (!MODALITY_OPTIONS.some((m) => m.value === p.modality)) return 'Elige la modalidad de la entrevista.';
  const interviewers = (p.interviewers ?? '').trim();
  if (interviewers.length < 2) return 'Escribe quién o quiénes realizaron la entrevista.';
  if (interviewers.length > ACTA_LIMITS.interviewersMax) return `Los entrevistadores son demasiado largos (máximo ${ACTA_LIMITS.interviewersMax} caracteres).`;
  if ((p.location ?? '').trim().length > ACTA_LIMITS.locationMax) return `El lugar es demasiado largo (máximo ${ACTA_LIMITS.locationMax} caracteres).`;
  const content = (p.content ?? '').trim();
  if (content.length < ACTA_LIMITS.contentMin) return `El texto del acta es muy corto (mínimo ${ACTA_LIMITS.contentMin} caracteres).`;
  if (content.length > ACTA_LIMITS.contentMax) return `El texto del acta es demasiado largo (máximo ${ACTA_LIMITS.contentMax} caracteres).`;
  if ((p.confidentialityNote ?? '').trim().length > ACTA_LIMITS.noteMax) return `La nota de confidencialidad es demasiado larga (máximo ${ACTA_LIMITS.noteMax} caracteres).`;
  return null;
}

/** Papeles que admiten acta firmada: `PT-ENTREV`, los de tipo entrevista y los de entrevistas forenses (`B-INT-*`). */
export function isInterviewPaper(p: { paperCode?: string | null; code?: string | null; type?: string | null }): boolean {
  return p.paperCode === 'PT-ENTREV' || p.type === 'INTERVIEW' || /^B-INT-/.test(p.paperCode ?? '') || /^B-INT-/.test(p.code ?? '');
}

/** La respuesta que firmó el entrevistado (la forma que guarda la API) en líneas «campo → valor» para el panel. */
export function actaResponseRows(response: unknown): Array<[string, string]> {
  if (!response || typeof response !== 'object') return [];
  const r = response as { conforme?: unknown; observations?: unknown };
  const rows: Array<[string, string]> = [];
  if (typeof r.conforme === 'boolean') rows.push(['Respuesta', r.conforme ? 'Conforme con el contenido del acta' : 'No conforme']);
  if (typeof r.observations === 'string' && r.observations.trim()) rows.push(['Observaciones', r.observations.trim()]);
  return rows;
}
