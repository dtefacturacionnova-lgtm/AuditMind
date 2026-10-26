const DAY_MS = 24 * 3600 * 1000;

/**
 * Brecha de cobertura de una unidad auditable: cuánto se pasó de la fecha en que tocaba volver a auditarla.
 *  - Con fecha de la última auditoría: próxima fecha = esa fecha + la frecuencia recomendada; brecha = hoy − próxima (>0 = vencida).
 *  - Sin fecha (nunca auditada): NO hay brecha que contar. Antes se guardaba 9999 días y la pantalla decía «27 años sin auditar»;
 *    ahora la brecha es null y `neverAudited` es true (la pantalla dice «Nunca auditada» y la ordena como la más urgente).
 */
export function computeCoverage(lastAuditDate: Date | null, freqMonths: number, now: Date = new Date()) {
  if (!lastAuditDate) return { nextRecommendedDate: null as Date | null, coverageGapDays: null as number | null, neverAudited: true };
  const nextRecommendedDate = new Date(lastAuditDate.getTime() + freqMonths * 30.44 * DAY_MS);
  return {
    nextRecommendedDate,
    coverageGapDays: Math.round((now.getTime() - nextRecommendedDate.getTime()) / DAY_MS),
    neverAudited: false,
  };
}

/**
 * La brecha guardada en la evaluación se calculó el día que se guardó y se quedaba congelada (una unidad evaluada en enero
 * mostraba en octubre la brecha de enero). Se recalcula al leer, con la fecha de la última auditoría y la frecuencia guardadas.
 */
export function withLiveCoverage<T extends { lastAuditDate: Date | null; recommendedFreqMonths: number }>(assessment: T, now: Date = new Date()) {
  return { ...assessment, ...computeCoverage(assessment.lastAuditDate, assessment.recommendedFreqMonths, now) };
}
