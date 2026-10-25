/**
 * Puntaje de riesgo de un proyecto del Banco (0–100) — la MISMA fórmula que la pantalla (`computeRiskScore` en
 * apps/web/src/hooks/useAuditProjects.ts) y que el Universo: 30 % riesgo residual + 70 % factores contextuales.
 * Se calcula también en el servidor (revisión del Plan Anual, 2026-10-25): antes solo lo calculaba la pantalla, así que
 * «Sincronizar cobertura» cambiaba un factor y dejaba el puntaje y el nivel viejos, y los proyectos creados por lote desde
 * Candidatas se guardaban sin puntaje (y entraban al plan con prioridad baja y primeros en la lista).
 */
export const GROUP_B_WEIGHTS: Record<string, number> = {
  materialityScore: 0.20, strategicAlignScore: 0.20, operationalAlignScore: 0.15,
  fraudHistoryScore: 0.15, managementReqScore: 0.10, staffTurnoverScore: 0.10, coverageHistoryScore: 0.10,
};

export interface ProjectRiskFactors {
  impactScore?: number | null; likelihoodScore?: number | null; controlMaturityScore?: number | null;
  materialityScore?: number | null; strategicAlignScore?: number | null; operationalAlignScore?: number | null;
  fraudHistoryScore?: number | null; managementReqScore?: number | null; staffTurnoverScore?: number | null;
  coverageHistoryScore?: number | null;
}

export type ProjectRiskLevel = 'CRITICO' | 'ALTO' | 'MEDIO' | 'BAJO';

/** `null` si falta alguno de los 10 factores (no se inventa un puntaje con datos incompletos). */
export function computeProjectRisk(p: ProjectRiskFactors): { score: number; level: ProjectRiskLevel } | null {
  const { impactScore, likelihoodScore, controlMaturityScore } = p;
  if (!impactScore || !likelihoodScore || !controlMaturityScore) return null;
  for (const key of Object.keys(GROUP_B_WEIGHTS)) if (!(p as Record<string, number | null | undefined>)[key]) return null;

  const residual = impactScore * likelihoodScore * (1 - controlMaturityScore / 5);
  const groupA = (residual / 25) * 100;
  const groupB = Object.entries(GROUP_B_WEIGHTS).reduce(
    (sum, [key, w]) => sum + (((p as Record<string, number>)[key] - 1) / 4) * 100 * w, 0,
  );
  const total = groupA * 0.30 + groupB * 0.70;
  const level: ProjectRiskLevel = total >= 75 ? 'CRITICO' : total >= 55 ? 'ALTO' : total >= 35 ? 'MEDIO' : 'BAJO';
  return { score: Math.round(total * 10) / 10, level };
}

export const RISK_FACTOR_KEYS = [
  'impactScore', 'likelihoodScore', 'controlMaturityScore', ...Object.keys(GROUP_B_WEIGHTS),
] as const;
