import { readFileSync } from 'fs';
import { join } from 'path';
import {
  NC_DARK, NC_FONT, NC_LIGHT, NC_PALETTES, NC_TOKEN_KEYS, NC_TYPE_SCALE, NcPalette, NcTokenKey, contrastRatio, ncCssVar, ncCssVarName, relativeLuminance,
} from './tokens';
import { BRAND_NAME, BRAND_TAGLINE, NOVATECH_ISOTYPE, SYMBOL_CHEVRON, SYMBOL_RULES, logoMetrics } from './logo-geometry';
// eslint-disable-next-line @typescript-eslint/no-var-requires
import tailwind from '../../../tailwind.config';

const WEB = join(__dirname, '..', '..', '..');
const css = readFileSync(join(WEB, 'src', 'app', 'globals.css'), 'utf-8').replace(/\r\n/g, '\n');
const layout = readFileSync(join(WEB, 'src', 'app', 'layout.tsx'), 'utf-8');

/** Lo que el bloque de CSS que empieza en `selector` asigna a las variables --nc-*. */
function cssBlock(selector: string): Record<string, string> {
  const at = css.indexOf(selector);
  if (at < 0) throw new Error(`No está el selector ${selector} en globals.css`);
  const body = css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--nc-[a-z-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const expected = (p: NcPalette) => Object.fromEntries(NC_TOKEN_KEYS.map((k) => [ncCssVarName(k), p[k].toUpperCase()]));
const upper = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.toUpperCase()]));

describe('contraste: las cifras que declara el diseño (lámina S2)', () => {
  // [token, contra fondo, contra panel] tal como las publica el diseño; tolerancia de redondeo.
  const CLAIMS: Record<'dark' | 'light', Array<[NcTokenKey, number, number]>> = {
    dark: [['line', 1.6, 1.2], ['text', 11.9, 9.9], ['muted', 6.2, 5.2], ['accent', 5.3, 4.4], ['success', 6.0, 5.0], ['warning', 5.1, 4.2], ['danger', 3.9, 3.2]],
    light: [['line', 1.4, 1.5], ['text', 17.4, 19.3], ['muted', 5.8, 6.4], ['accent', 4.6, 5.0], ['success', 4.8, 5.3], ['warning', 4.9, 5.4], ['danger', 5.6, 6.2]],
  };

  for (const theme of ['dark', 'light'] as const) {
    const p = NC_PALETTES[theme];
    for (const [key, onBg, onPanel] of CLAIMS[theme]) {
      it(`${theme} · ${key}: ${onBg} sobre el fondo y ${onPanel} sobre el panel`, () => {
        expect(contrastRatio(p[key], p.bg)).toBeCloseTo(onBg, 0);
        expect(Math.abs(contrastRatio(p[key], p.bg) - onBg)).toBeLessThan(0.1);
        expect(Math.abs(contrastRatio(p[key], p.panel) - onPanel)).toBeLessThan(0.1);
      });
    }
  }

  it('el texto del botón principal sobre el acento: 5.3 en oscuro y 5.0 en claro', () => {
    expect(Math.abs(contrastRatio(NC_DARK.onAccent, NC_DARK.accent) - 5.3)).toBeLessThan(0.1);
    expect(Math.abs(contrastRatio(NC_LIGHT.onAccent, NC_LIGHT.accent) - 5.0)).toBeLessThan(0.1);
  });
});

describe('contraste: mínimos de accesibilidad que la marca se compromete a cumplir', () => {
  for (const theme of ['dark', 'light'] as const) {
    const p = NC_PALETTES[theme];
    const surfaces = [['fondo', p.bg], ['panel', p.panel]] as const;

    for (const [name, surface] of surfaces) {
      it(`${theme} · texto principal y secundario ≥ 4.5:1 sobre el ${name}`, () => {
        expect(contrastRatio(p.text, surface)).toBeGreaterThanOrEqual(7);
        expect(contrastRatio(p.muted, surface)).toBeGreaterThanOrEqual(4.5);
      });
      it(`${theme} · los íconos de estado (éxito, advertencia, error) ≥ 3:1 sobre el ${name}`, () => {
        for (const k of ['success', 'warning', 'danger'] as const) expect(contrastRatio(p[k], surface)).toBeGreaterThanOrEqual(3);
      });
    }

    it(`${theme} · el rótulo del botón principal ≥ 4.5:1 sobre el acento`, () => {
      expect(contrastRatio(p.onAccent, p.accent)).toBeGreaterThanOrEqual(4.5);
    });
    it(`${theme} · el acento como texto sobre el fondo ≥ 4.5:1`, () => {
      expect(contrastRatio(p.accent, p.bg)).toBeGreaterThanOrEqual(4.5);
    });
  }

  it('en claro los textos de estado también pasan 4.5:1 (en oscuro solo se usan como ícono)', () => {
    for (const k of ['success', 'warning', 'danger'] as const) {
      expect(contrastRatio(NC_LIGHT[k], NC_LIGHT.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(NC_LIGHT[k], NC_LIGHT.panel)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('la línea es decorativa: nunca debe parecerse al texto', () => {
    for (const p of [NC_DARK, NC_LIGHT]) expect(contrastRatio(p.line, p.bg)).toBeLessThan(2);
  });
});

describe('cálculo de contraste', () => {
  it('blanco sobre negro es 21:1, igual sobre igual 1:1 y el orden no importa', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#123456', '#123456')).toBeCloseTo(1, 5);
    expect(contrastRatio('#0B2A30', '#E9E4D6')).toBeCloseTo(contrastRatio('#E9E4D6', '#0B2A30'), 10);
  });
  it('luminancia de los extremos y rechazo de colores mal escritos', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 10);
    expect(() => relativeLuminance('#FFF')).toThrow(/inválido/);
    expect(() => relativeLuminance('rojo')).toThrow(/inválido/);
  });
});

describe('los mismos valores en TypeScript, CSS y Tailwind', () => {
  it('las variables --nc-* de globals.css (claro) son las de NC_LIGHT', () => {
    expect(upper(cssBlock(":root, :root[data-theme='light']"))).toEqual(expected(NC_LIGHT));
  });
  it('las variables del tema oscuro explícito son las de NC_DARK', () => {
    expect(upper(cssBlock(":root[data-theme='dark']"))).toEqual(expected(NC_DARK));
  });
  it('las del oscuro según el sistema (sin tema elegido) son las de NC_DARK', () => {
    expect(upper(cssBlock(":root:not([data-theme='light'])"))).toEqual(expected(NC_DARK));
  });
  it('el oscuro según el sistema respeta una elección explícita de claro', () => {
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme='light'\]\)/);
  });
  it('Tailwind expone cada token como nc-… apuntando a su variable', () => {
    const nc = (tailwind.theme?.extend?.colors as Record<string, Record<string, string>>).nc;
    const kebab = (k: NcTokenKey) => ncCssVarName(k).replace(/^--nc-/, '');
    expect(Object.keys(nc).sort()).toEqual(NC_TOKEN_KEYS.map(kebab).sort());
    for (const k of NC_TOKEN_KEYS) expect(nc[kebab(k)]).toBe(ncCssVar(k));
  });
  it('Tailwind no redefine lo que ya usa la aplicación (primary, font-mono, radios por defecto)', () => {
    const ext = tailwind.theme?.extend as Record<string, Record<string, unknown>>;
    expect(ext.fontFamily).not.toHaveProperty('mono');
    expect(ext.fontFamily).not.toHaveProperty('serif');
    expect(Object.keys(ext.borderRadius)).toEqual(['nc']);
    expect((ext.colors.primary as Record<string, string>).DEFAULT).toBe('#0F2D4A');
  });
  it('los nombres de variable salen del nombre del token', () => {
    expect(ncCssVarName('accentHover')).toBe('--nc-accent-hover');
    expect(ncCssVarName('onAccent')).toBe('--nc-on-accent');
    expect(ncCssVar('bg')).toBe('var(--nc-bg)');
  });
});

describe('fuentes de la marca', () => {
  it('el diseño usa Space Grotesk, Inter, JetBrains Mono y Playfair Display', () => {
    expect(NC_FONT.display).toContain('Space Grotesk');
    expect(NC_FONT.body).toContain('Inter');
    expect(NC_FONT.mono).toContain('JetBrains Mono');
    expect(NC_FONT.tagline).toContain('Playfair Display');
  });
  it('layout.tsx expone las variables que usan Tailwind y el logo, sin sustituir la fuente del cuerpo', () => {
    for (const v of ['--font-space-grotesk', '--font-jetbrains-mono', '--font-playfair']) expect(layout).toContain(`'${v}'`);
    expect(layout).toContain('className={inter.className}');
    expect(layout).not.toMatch(/Inter\(\{[^}]*variable/);
  });
  it('la escala tipográfica es la de la lámina S2', () => {
    expect(NC_TYPE_SCALE.t1).toMatchObject({ size: 24, line: 30, weight: 600, family: 'display' });
    expect(NC_TYPE_SCALE.t3).toMatchObject({ size: 13, line: 18, family: 'body' });
    expect(NC_TYPE_SCALE.t6).toMatchObject({ size: 12, line: 16, family: 'mono' });
  });
});

describe('logo', () => {
  it('geometría del símbolo y del isotipo NovaTech (lámina L7 y pantallas P1–P2)', () => {
    expect(SYMBOL_CHEVRON).toEqual({ d: 'M3.5 11.5L9.5 5.5L15.5 11.5', strokeWidth: 2.75 });
    expect(SYMBOL_RULES).toEqual({ d: 'M3 16.5H21M3 21H21', strokeWidth: 2 });
    expect(NOVATECH_ISOTYPE.viewBox).toBe('0 0 32 32');
  });
  it('textos de la marca', () => {
    expect(BRAND_NAME).toBe('Nova Criterio');
    expect(BRAND_TAGLINE.join(' ')).toBe('Inteligencia con criterio. Auditoría con confianza.');
  });
  it('proporciones: símbolo 64 → nombre 30 y eslogan 15 (versión completa); símbolo 40 → nombre 30 (una línea)', () => {
    expect(logoMetrics('lockup', 64)).toMatchObject({ nameSize: 30, taglineSize: 15, byTextSize: 12, byIsotypeSize: 22, gap: 14 });
    expect(logoMetrics('wordmark', 40)).toMatchObject({ symbolSize: 40, nameSize: 30, gap: 12 });
  });
  it('a tamaños pequeños la firma no baja del mínimo legible', () => {
    expect(logoMetrics('lockup', 24).byTextSize).toBe(10);
    expect(logoMetrics('lockup', 24).byIsotypeSize).toBe(14);
  });
});
