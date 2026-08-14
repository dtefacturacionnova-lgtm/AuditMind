/**
 * Factores de confiabilidad para evaluación de muestreo MUS/PPS (NIA 530).
 *
 * En vez de una tabla AICPA hardcodeada (fácil de transcribir mal), se resuelve
 * numéricamente la relación matemática exacta detrás de esas tablas: el factor
 * de confiabilidad para n errores a un nivel de riesgo dado es el valor λ de una
 * distribución de Poisson tal que P(X ≤ n | Poisson(λ)) = nivel de riesgo.
 * Para n=0 esto se reduce a λ = -ln(nivelDeRiesgo) — la misma fórmula que ya usa
 * este papel para el factor "k" de S1/S3 (Bajo=3.0 ⇢ 95%, Medio=1.9 ⇢ 85%, Alto=0.9 ⇢ 60%).
 */

function poissonCDF(lambda: number, n: number): number {
  if (lambda <= 0) return 1;
  let term = Math.exp(-lambda);
  let sum = term;
  for (let i = 1; i <= n; i++) {
    term *= lambda / i;
    sum += term;
  }
  return sum;
}

/**
 * Factor de confiabilidad para `n` errores (logical units) a un nivel de riesgo
 * `riskLevel` (ej. 0.05 = 95% de confianza). Resuelto por bisección — 80
 * iteraciones dan precisión sobrada para uso monetario.
 */
export function reliabilityFactor(n: number, riskLevel: number): number {
  if (!(riskLevel > 0) || !(riskLevel < 1)) return NaN;
  let lo = 0;
  let hi = 60; // suficiente incluso para riskLevel muy pequeño y n grande
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (poissonCDF(mid, n) > riskLevel) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Nivel de confianza (%) implícito en un factor k ya calculado (k = RF(0, riesgo) = -ln(riesgo)). */
export function confidenceFromK(k: number): number {
  return (1 - Math.exp(-k)) * 100;
}

/** Nivel de riesgo (0-1) implícito en un factor k ya calculado. */
export function riskFromK(k: number): number {
  return Math.exp(-k);
}
