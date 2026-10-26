/**
 * Revisión, coincidencia por coincidencia, del screening de sanciones del cliente (Art. 15 DDC, Ley PLD/FT/FP). Antes bastaba una nota
 * general: no quedaba constancia de cuál coincidencia se descartó, quién la descartó ni por qué. Las revisiones viven dentro de
 * `sanctionsScreeningResult.reviews`, con la clave de cada coincidencia (nombre revisado + nombre de la lista + lista).
 *
 * Reglas al decidir el Radar:
 *  - Toda coincidencia debe estar revisada como «falso positivo» (con motivo) o «confirmada» (con motivo).
 *  - Una coincidencia confirmada obliga a que la dimensión Sanciones/PLD sea Rojo.
 *  - Con Sanciones/PLD en Rojo no hace falta revisar una por una: el cliente se declina.
 */
export type ScreeningDecision = 'FALSE_POSITIVE' | 'CONFIRMED';

export interface ScreeningReview {
  decision: ScreeningDecision;
  reason: string;
  byId: string;
  byName: string;
  at: string;
}

export interface ScreeningMatch {
  key: string;
  uploadedName: string;
  matchedName: string;
  sourceList: string;
  score: number | null;
  review: ScreeningReview | null;
}

type RawResult = {
  screenedAt?: string;
  findings?: Array<{ sample_records?: Array<{ uploaded_name?: string; matched_watchlist_name?: string; source_list?: string; score?: number }> }>;
  reviews?: Record<string, ScreeningReview>;
} | null | undefined;

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

export function matchKeyOf(r: { uploaded_name?: string; matched_watchlist_name?: string; source_list?: string }): string {
  return `${norm(r.uploaded_name)}|${norm(r.matched_watchlist_name)}|${norm(r.source_list)}`;
}

export function screeningMatches(result: RawResult): ScreeningMatch[] {
  const out = new Map<string, ScreeningMatch>();
  for (const f of result?.findings ?? []) {
    for (const r of f.sample_records ?? []) {
      const key = matchKeyOf(r);
      if (out.has(key)) continue;
      out.set(key, {
        key, uploadedName: r.uploaded_name ?? '', matchedName: r.matched_watchlist_name ?? '', sourceList: r.source_list ?? '',
        score: typeof r.score === 'number' ? r.score : null, review: result?.reviews?.[key] ?? null,
      });
    }
  }
  return [...out.values()];
}

/** Lo que impide decidir por culpa del screening ([] = nada). `sanctionsStatus` es la calificación que se está por decidir. */
export function screeningReviewProblems(result: RawResult, sanctionsStatus: string): string[] {
  const matches = screeningMatches(result);
  if (matches.length === 0) return [];
  const problems: string[] = [];
  const confirmed = matches.filter((m) => m.review?.decision === 'CONFIRMED');
  if (confirmed.length > 0 && sanctionsStatus !== 'RED') {
    problems.push(
      `Hay ${confirmed.length} coincidencia(s) confirmada(s) con una lista de sanciones (${confirmed.map((m) => m.matchedName).join(', ')}): ` +
      'la dimensión Sanciones/PLD debe quedar en Rojo.',
    );
  }
  const unreviewed = matches.filter((m) => !m.review);
  if (unreviewed.length > 0 && sanctionsStatus !== 'RED') {
    problems.push(
      `Faltan por revisar ${unreviewed.length} coincidencia(s) del screening de sanciones: marca cada una como falso positivo o confirmada, con su motivo.`,
    );
  }
  return problems;
}

/** Al volver a correr el screening se conservan las revisiones de las coincidencias que siguen siendo las mismas. */
export function carryOverReviews(previous: RawResult, next: RawResult): Record<string, ScreeningReview> {
  const keep: Record<string, ScreeningReview> = {};
  for (const m of screeningMatches(next)) {
    const old = previous?.reviews?.[m.key];
    if (old) keep[m.key] = old;
  }
  return keep;
}
