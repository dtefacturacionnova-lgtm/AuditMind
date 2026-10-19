import { BadRequestException } from '@nestjs/common';

/**
 * Datos propios del ACTA DE ENTREVISTA que el auditor redacta al enviarla a firma
 * (docs/firma-externa-por-enlace.md §11.3) y la respuesta del entrevistado. Lógica pura, sin Nest ni BD.
 * El entrevistado es el firmante: su nombre y cargo salen de los datos del firmante, no se piden dos veces.
 */

export const MODALITIES = ['PRESENCIAL', 'VIRTUAL', 'TELEFONICA'] as const;
export type Modality = (typeof MODALITIES)[number];

export const MODALITY_LABELS: Record<Modality, string> = { PRESENCIAL: 'Presencial', VIRTUAL: 'Virtual', TELEFONICA: 'Telefónica' };

export const ACTA_LIMITS = { contentMin: 50, contentMax: 50_000, interviewersMax: 500, locationMax: 200, noteMax: 1000, observationsMax: 4000 } as const;

export interface ActaPayload {
  /** YYYY-MM-DD */
  interviewDate: string;
  modality: Modality;
  location: string | null;
  interviewers: string;
  content: string;
  confidentialityNote: string | null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const bad = (message: string) => new BadRequestException(message);
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Fecha real (rechaza 2026-02-31), no futura (se tolera mañana por la zona horaria) y de los últimos 10 años. */
function validInterviewDate(value: string, now: Date): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) return false;
  const tomorrow = now.getTime() + 24 * 3600 * 1000;
  const tenYearsAgo = new Date(now); tenYearsAgo.setUTCFullYear(now.getUTCFullYear() - 10);
  return d.getTime() <= tomorrow && d.getTime() >= tenYearsAgo.getTime();
}

/** Valida y normaliza lo que manda la ventana de envío. Lanza 400 con un mensaje que el auditor entiende. */
export function parseActaPayload(raw: Record<string, unknown>, now = new Date()): ActaPayload {
  const interviewDate = text(raw.interviewDate);
  if (!validInterviewDate(interviewDate, now)) throw bad('Escribe la fecha de la entrevista (no puede ser futura).');

  if (!MODALITIES.includes(raw.modality as Modality)) throw bad('Elige la modalidad de la entrevista: presencial, virtual o telefónica.');

  const interviewers = text(raw.interviewers);
  if (interviewers.length < 2) throw bad('Escribe quién o quiénes realizaron la entrevista.');
  if (interviewers.length > ACTA_LIMITS.interviewersMax) throw bad(`Los entrevistadores son demasiado largos (máximo ${ACTA_LIMITS.interviewersMax} caracteres).`);

  const location = text(raw.location);
  if (location.length > ACTA_LIMITS.locationMax) throw bad(`El lugar es demasiado largo (máximo ${ACTA_LIMITS.locationMax} caracteres).`);

  const content = text(raw.content);
  if (content.length < ACTA_LIMITS.contentMin) throw bad(`El texto del acta es muy corto (mínimo ${ACTA_LIMITS.contentMin} caracteres).`);
  if (content.length > ACTA_LIMITS.contentMax) throw bad(`El texto del acta es demasiado largo (máximo ${ACTA_LIMITS.contentMax} caracteres).`);

  const note = text(raw.confidentialityNote);
  if (note.length > ACTA_LIMITS.noteMax) throw bad(`La nota de confidencialidad es demasiado larga (máximo ${ACTA_LIMITS.noteMax} caracteres).`);

  return {
    interviewDate, modality: raw.modality as Modality, location: location || null, interviewers, content, confidentialityNote: note || null,
  };
}

// ─── Respuesta del entrevistado ──────────────────────────────────────────────
export interface ActaResponse {
  conforme: boolean;
  observations: string;
}

/** `conforme` es obligatorio y debe ser un booleano de verdad; las observaciones son obligatorias si NO está conforme. */
export function parseActaResponse(raw: unknown): ActaResponse {
  const r = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  if (Object.keys(r).some((k) => k !== 'conforme' && k !== 'observations')) throw bad('La respuesta contiene datos que no corresponden a este documento.');
  if (typeof r.conforme !== 'boolean') throw bad('Indica si estás conforme con el acta.');
  if (r.observations !== undefined && r.observations !== null && typeof r.observations !== 'string') throw bad('Las observaciones deben ser texto.');
  const observations = text(r.observations);
  if (observations.length > ACTA_LIMITS.observationsMax) throw bad(`Las observaciones son demasiado largas (máximo ${ACTA_LIMITS.observationsMax} caracteres).`);
  if (!r.conforme && !observations) throw bad('Si no estás conforme, escribe tus observaciones.');
  return { conforme: r.conforme, observations };
}

/** Papeles que admiten acta firmada: `PT-ENTREV`, los de tipo entrevista y los de entrevistas forenses (`B-INT-*`). */
export function isInterviewPaper(p: { paperCode?: string | null; code?: string | null; type?: string | null }): boolean {
  return p.paperCode === 'PT-ENTREV' || p.type === 'INTERVIEW' || /^B-INT-/.test(p.paperCode ?? '') || /^B-INT-/.test(p.code ?? '');
}
