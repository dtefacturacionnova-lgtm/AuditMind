/**
 * Identidad de marca Nova Criterio — valores de diseño (fuente única en código).
 *
 * Origen: canvas de Claude Design «Nova Criterio» (dirección «Cuaderno contable»), láminas S2 (paleta, contraste, tipo) y P1–P2 (pantallas).
 * Plan: docs/rediseno-identidad-nova-criterio-plan.md. Estos valores viven también como variables CSS `--nc-*` en `app/globals.css` y como colores
 * `nc-*` en `tailwind.config.ts`; `tokens.spec.ts` comprueba que los tres coinciden y que el contraste es el que el diseño declara.
 *
 * Sirven donde CSS no llega: gráficos (recharts), correos HTML, PDF/DOCX y pruebas.
 */

export const NC_TOKEN_KEYS = [
  'bg', 'panel', 'line', 'lineStrong', 'text', 'muted', 'accent', 'accentHover',
  'success', 'warning', 'danger', 'hover', 'pressed', 'onAccent',
] as const;

export type NcTokenKey = (typeof NC_TOKEN_KEYS)[number];
export type NcPalette = Record<NcTokenKey, string>;
export type NcTheme = 'light' | 'dark';

/** Oscuro: petróleo ajustado (matiz 190°). Es la base del diseño. */
export const NC_DARK: NcPalette = {
  bg: '#0B2A30',
  panel: '#103842',
  line: '#1E4A55',
  lineStrong: '#2C5E6B',
  text: '#E9E4D6',
  muted: '#93AAAD',
  accent: '#B8934A',
  accentHover: '#C9A55C',
  success: '#3FB68B',
  warning: '#F0702A',
  danger: '#E5484D',
  hover: '#15414D',
  pressed: '#1B4B58',
  onAccent: '#0B2A30',
};

/** Claro: hueso. El acento y los estados se oscurecen para pasar 4.5:1 sobre el fondo y el panel. */
export const NC_LIGHT: NcPalette = {
  bg: '#F6F3EC',
  panel: '#FFFFFF',
  line: '#D8D2C2',
  lineStrong: '#C9C3B2',
  text: '#0B0E14',
  muted: '#5A5F66',
  accent: '#8A6A1F',
  accentHover: '#7A5C16',
  success: '#1F7A58',
  warning: '#B24A12',
  danger: '#B8292E',
  hover: '#EEE9DC',
  pressed: '#E3DDCC',
  onAccent: '#FFFFFF',
};

export const NC_PALETTES: Record<NcTheme, NcPalette> = { light: NC_LIGHT, dark: NC_DARK };

/** `accentHover` → `--nc-accent-hover`. */
export function ncCssVarName(key: NcTokenKey): string {
  return `--nc-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

export const ncCssVar = (key: NcTokenKey): string => `var(${ncCssVarName(key)})`;

// ── Tipografía ──────────────────────────────────────────────────────────────────────────────────

export const NC_FONT = {
  /** Títulos y el nombre de la marca. */
  display: "'Space Grotesk', system-ui, sans-serif",
  /** Cuerpo y etiquetas. */
  body: "Inter, system-ui, sans-serif",
  /** Cifras (siempre tabulares) y referencias. */
  mono: "'JetBrains Mono', ui-monospace, monospace",
  /** Solo el eslogan del logo. */
  tagline: "'Playfair Display', Georgia, serif",
} as const;

/** Escala tipográfica del diseño (S2): tamaño y altura de línea en px. */
export const NC_TYPE_SCALE = {
  t1: { name: 'Título de pantalla', family: 'display', weight: 600, size: 24, line: 30 },
  t2: { name: 'Título de sección', family: 'display', weight: 600, size: 16, line: 22 },
  t3: { name: 'Cuerpo', family: 'body', weight: 400, size: 13, line: 18 },
  t4: { name: 'Cuerpo con énfasis', family: 'body', weight: 600, size: 13, line: 18 },
  t5: { name: 'Etiqueta de columna', family: 'body', weight: 500, size: 11, line: 14 },
  t6: { name: 'Cifra', family: 'mono', weight: 400, size: 12, line: 16 },
  t7: { name: 'Referencia', family: 'mono', weight: 500, size: 11, line: 14 },
} as const;

/** Radio de esquina y alturas de control/fila (px). */
export const NC_SHAPE = {
  radius: 2,
  /** Botón principal e input. */
  control: 40,
  /** Botón secundario y filtros. */
  controlSm: 32,
  /** Fila de tabla: cómoda y compacta (uso diario del auditor). */
  rowComfortable: 40,
  rowCompact: 32,
} as const;

// ── Contraste (WCAG 2.x) ────────────────────────────────────────────────────────────────────────

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`Color hexadecimal inválido: ${hex}`);
  const n = parseInt(m[1], 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** Razón de contraste WCAG entre dos colores `#RRGGBB` (1 a 21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
