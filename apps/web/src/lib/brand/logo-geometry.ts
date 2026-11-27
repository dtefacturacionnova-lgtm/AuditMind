/**
 * Geometría del logo Nova Criterio y de la firma NovaTech, tomada de la lámina «Logo final» (L7) y de las pantallas P1–P2 del diseño.
 * Aparte del componente para poder probarla sin React. Lienzo del símbolo: 24 × 24.
 */

/** Chevron (el «^» de total, marca de auditoría «sumado»): trazo del color de tinta, vértices en ángulo vivo. */
export const SYMBOL_CHEVRON = { d: 'M3.5 11.5L9.5 5.5L15.5 11.5', strokeWidth: 2.75 } as const;

/** Doble raya de total contable: trazo del color de acento. */
export const SYMBOL_RULES = { d: 'M3 16.5H21M3 21H21', strokeWidth: 2 } as const;

export const SYMBOL_VIEWBOX = '0 0 24 24';

/** Isotipo de NovaTech (círculo con la N), lienzo 32 × 32. */
export const NOVATECH_ISOTYPE = {
  viewBox: '0 0 32 32',
  circle: { d: 'M30 16A14 14 0 1 1 2 16A14 14 0 1 1 30 16', strokeWidth: 3 },
  letter: { d: 'M9.5 22.5V9.5L19.5 22.5V9.5M14.5 9.5H24.5', strokeWidth: 2.75 },
} as const;

export const BRAND_NAME = 'Nova Criterio';
export const BRAND_TAGLINE = ['Inteligencia con criterio.', 'Auditoría con confianza.'] as const;
export const BRAND_BY = 'por NovaTech';
/** Pie legal de las pantallas de acceso y de las listas (P1/P2). Confirmar la razón social antes de publicarlo. */
export const BRAND_LEGAL = 'NOVATECH INTELLIGENT SYSTEMS, S.A. de C.V.';

export type LogoVariant = 'symbol' | 'wordmark' | 'lockup';

/**
 * Medidas de cada pieza a partir del tamaño del símbolo. Proporciones de L7: símbolo 64 ↔ nombre 30 px ↔ eslogan 15 px ↔ firma 12 px;
 * la versión de una línea usa símbolo 40 ↔ nombre 30 px.
 */
export function logoMetrics(variant: LogoVariant, symbolSize: number) {
  const nameRatio = variant === 'lockup' ? 30 / 64 : 30 / 40;
  const r = (n: number) => Math.round(n * 100) / 100;
  return {
    symbolSize,
    nameSize: r(symbolSize * nameRatio),
    taglineSize: r((symbolSize * 15) / 64),
    byTextSize: r(Math.max((symbolSize * 12) / 64, 10)),
    byIsotypeSize: r(Math.max((symbolSize * 22) / 64, 14)),
    gap: r(variant === 'lockup' ? (symbolSize * 14) / 64 : (symbolSize * 12) / 40),
  };
}
