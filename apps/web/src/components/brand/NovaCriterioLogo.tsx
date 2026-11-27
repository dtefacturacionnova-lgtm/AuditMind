import type { CSSProperties } from 'react';
import {
  BRAND_BY, BRAND_NAME, BRAND_TAGLINE, LogoVariant, NOVATECH_ISOTYPE, SYMBOL_CHEVRON, SYMBOL_RULES, SYMBOL_VIEWBOX, logoMetrics,
} from '@/lib/brand/logo-geometry';

/**
 * Logo de Nova Criterio (identidad de marca; plan en docs/rediseno-identidad-nova-criterio-plan.md).
 *
 * - El chevron toma el color de texto del contenedor (`currentColor`); la doble raya, el acento de la marca (`--nc-accent`).
 * - `tone="mono"` es la versión de una sola tinta (fondo blanco o negativo): las rayas pasan a la misma tinta, atenuadas.
 * - Las fuentes salen de las variables que define `app/layout.tsx`; con cualquiera de ellas sin cargar cae a una de sistema.
 *
 * Fase 0: el componente existe pero ninguna pantalla lo usa todavía (se coloca en el acceso y la barra en la fase 1).
 */

type Tone = 'brand' | 'mono';

const FONT_DISPLAY = "var(--font-space-grotesk), 'Space Grotesk', system-ui, sans-serif";
const FONT_TAGLINE = "var(--font-playfair), 'Playfair Display', Georgia, serif";
const FONT_BODY = "Inter, system-ui, sans-serif";

export interface NovaCriterioSymbolProps {
  /** Lado en px (el símbolo es cuadrado). */
  size?: number;
  tone?: Tone;
  /** `true` cuando al lado ya está el nombre escrito: se oculta a los lectores de pantalla para no leerlo dos veces. */
  decorative?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function NovaCriterioSymbol({ size = 32, tone = 'brand', decorative = false, className, style }: NovaCriterioSymbolProps) {
  const a11y = decorative ? { 'aria-hidden': true as const } : { role: 'img' as const, 'aria-label': BRAND_NAME };
  return (
    <svg viewBox={SYMBOL_VIEWBOX} width={size} height={size} className={className} style={{ display: 'block', flex: 'none', ...style }} {...a11y}>
      <path d={SYMBOL_CHEVRON.d} fill="none" stroke="currentColor" strokeWidth={SYMBOL_CHEVRON.strokeWidth} strokeLinejoin="miter" strokeMiterlimit={10} />
      <path
        d={SYMBOL_RULES.d}
        fill="none"
        stroke={tone === 'brand' ? 'var(--nc-accent, #8A6A1F)' : 'currentColor'}
        strokeOpacity={tone === 'brand' ? 1 : 0.5}
        strokeWidth={SYMBOL_RULES.strokeWidth}
      />
    </svg>
  );
}

/** Isotipo de NovaTech (círculo con la N), para la firma «por NovaTech». */
export function NovaTechIsotype({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox={NOVATECH_ISOTYPE.viewBox} width={size} height={size} className={className} style={{ display: 'block', flex: 'none' }} fill="none" stroke="currentColor" aria-hidden="true">
      <path d={NOVATECH_ISOTYPE.circle.d} strokeWidth={NOVATECH_ISOTYPE.circle.strokeWidth} />
      <path d={NOVATECH_ISOTYPE.letter.d} strokeWidth={NOVATECH_ISOTYPE.letter.strokeWidth} strokeLinejoin="miter" strokeMiterlimit={10} />
    </svg>
  );
}

export interface NovaCriterioLogoProps {
  /** `symbol`: solo el símbolo · `wordmark`: símbolo y nombre en una línea · `lockup`: símbolo, nombre, eslogan y «por NovaTech». */
  variant?: LogoVariant;
  /** Tamaño del símbolo en px; el resto de las piezas se calcula a partir de él. */
  size?: number;
  tone?: Tone;
  className?: string;
}

export function NovaCriterioLogo({ variant = 'wordmark', size, tone = 'brand', className }: NovaCriterioLogoProps) {
  if (variant === 'symbol') return <NovaCriterioSymbol size={size ?? 32} tone={tone} className={className} />;

  const m = logoMetrics(variant, size ?? (variant === 'lockup' ? 64 : 40));
  const name = (
    <span style={{ font: `600 ${m.nameSize}px/1 ${FONT_DISPLAY}`, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>{BRAND_NAME}</span>
  );

  if (variant === 'wordmark') {
    return (
      <span className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: m.gap }}>
        <NovaCriterioSymbol size={m.symbolSize} tone={tone} decorative />
        {name}
      </span>
    );
  }

  return (
    <span className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: m.gap }}>
      <NovaCriterioSymbol size={m.symbolSize} tone={tone} decorative />
      <span style={{ display: 'flex', flexDirection: 'column', gap: Math.round(m.symbolSize / 8) }}>
        {name}
        <span style={{ font: `italic 400 ${m.taglineSize}px/1.3 ${FONT_TAGLINE}`, color: 'var(--nc-muted, #5A5F66)', whiteSpace: 'nowrap' }}>
          {BRAND_TAGLINE[0]}
          <br />
          {BRAND_TAGLINE[1]}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--nc-muted, #5A5F66)', font: `400 ${m.byTextSize}px/1 ${FONT_BODY}`, letterSpacing: '.03em', whiteSpace: 'nowrap' }}>
          <NovaTechIsotype size={m.byIsotypeSize} />
          {BRAND_BY}
        </span>
      </span>
    </span>
  );
}
