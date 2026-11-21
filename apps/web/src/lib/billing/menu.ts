import { type ModuleKey } from './catalog';

/**
 * Qué módulo del plan corresponde a cada parte del menú y de las rutas de la web.
 * El plan se SUMA al filtro que ya existe por modalidad (Interna/Externa) y por rol: no lo reemplaza.
 * Lo que no está aquí es núcleo y siempre es visible.
 */

/** Grupo del menú → módulo (el grupo entero se muestra con candado). */
export const GROUP_MODULE: Readonly<Record<string, ModuleKey>> = {
  'Cartera': 'CARTERA',
  'Planificación Anual': 'PLAN_ANUAL',
  'Horas y Rentabilidad': 'HORAS',
  'Riesgos y Controles': 'RIESGOS',
  'Gobierno': 'GOBIERNO',
  'Reportería e IA': 'REPORTES_IA',
};

/** Opciones sueltas dentro de un grupo de núcleo (Seguimiento) → módulo. */
export const ITEM_MODULE: Readonly<Record<string, ModuleKey>> = {
  'Portal Auditado (PBC)': 'SEGUIMIENTO_EXT',
  'Confirmaciones Ext.': 'SEGUIMIENTO_EXT',
};

/** Módulo de un grupo del menú, o null si es núcleo. */
export function moduleOfGroup(label: string): ModuleKey | null {
  return Object.prototype.hasOwnProperty.call(GROUP_MODULE, label) ? GROUP_MODULE[label] : null;
}

/** Módulo de una opción suelta del menú, o null si es núcleo. */
export function moduleOfItem(label: string): ModuleKey | null {
  return Object.prototype.hasOwnProperty.call(ITEM_MODULE, label) ? ITEM_MODULE[label] : null;
}

/**
 * Rutas de la web → módulo, para mostrar «no está en tu plan» si alguien escribe la dirección a mano.
 * Es CONSERVADORA: solo secciones cuyo módulo es inequívoco; lo demás se deja pasar (el servidor es la barrera real).
 * Gana el prefijo más largo; `null` excluye una sub-ruta del módulo de su padre.
 */
export const ROUTE_MODULES: ReadonlyArray<readonly [string, ModuleKey | null]> = [
  // Rentabilidad, capacidad y programa viven bajo /portfolio pero se muestran en «Horas y Rentabilidad»: no se bloquean desde la web.
  ['/dashboard/portfolio/profitability', null],
  ['/dashboard/portfolio/capacity', null],
  ['/dashboard/portfolio/program', null],
  ['/dashboard/portfolio', 'CARTERA'],
  ['/dashboard/collections', 'CARTERA'],
  ['/dashboard/strategic', 'PLAN_ANUAL'],
  ['/dashboard/universe', 'PLAN_ANUAL'],
  ['/dashboard/projects', 'PLAN_ANUAL'],
  ['/dashboard/plans', 'PLAN_ANUAL'],
  ['/dashboard/timesheet', 'HORAS'],
  ['/dashboard/my-utilization', 'HORAS'],
  ['/dashboard/firm-hours', 'HORAS'],
  ['/dashboard/admin-tasks', 'HORAS'],
  ['/dashboard/admin/firm-calendar', 'HORAS'],
  ['/dashboard/admin/cost-profiles', 'HORAS'],
  ['/dashboard/risks', 'RIESGOS'],
  ['/dashboard/committee', 'GOBIERNO'],
  ['/dashboard/qaip', 'GOBIERNO'],
  ['/dashboard/esg', 'GOBIERNO'],
  ['/dashboard/bcp', 'GOBIERNO'],
  ['/dashboard/pbc', 'SEGUIMIENTO_EXT'],
  ['/dashboard/confirmations', 'SEGUIMIENTO_EXT'],
  ['/dashboard/ai', 'REPORTES_IA'],
  ['/dashboard/pdf-tools', 'REPORTES_IA'],
  ['/dashboard/reports', 'REPORTES_IA'],
  ['/dashboard/analytics', 'REPORTES_IA'],
];

const underPrefix = (path: string, prefix: string) => path === prefix || path.startsWith(prefix + '/');

/** Módulo que exige una ruta de la web (sin query ni #fragmento), o null si es núcleo o no se sabe. */
export function moduleForPath(pathname: string | null | undefined): ModuleKey | null {
  if (!pathname) return null;
  const clean = pathname.split(/[?#]/)[0].replace(/\/+$/, '').toLowerCase();
  let best: readonly [string, ModuleKey | null] | null = null;
  for (const entry of ROUTE_MODULES) {
    if (underPrefix(clean, entry[0]) && (!best || entry[0].length > best[0].length)) best = entry;
  }
  return best ? best[1] : null;
}

/** Grupos del menú, en orden, para la vista previa del editor de planes («Así lo ve el cliente»). */
export const MENU_PREVIEW_GROUPS: readonly string[] = [
  'Dashboard', 'Cartera', 'Planificación Anual', 'Ejecución del Plan Anual', 'Seguimiento', 'Horas y Rentabilidad',
  'Riesgos y Controles', 'Reportería e IA', 'Gobierno', 'Administración',
];

export interface MenuPreviewRow {
  label: string;
  /** Módulo que lo gobierna (null = núcleo, siempre visible). */
  module: ModuleKey | null;
  locked: boolean;
  /** Detalle bajo el nombre (en Seguimiento: qué opciones quedan). */
  sub: string;
}

/** Menú tal como lo vería un cliente con los módulos dados; los que no están incluidos salen con candado. */
export function menuPreview(modules: readonly string[]): MenuPreviewRow[] {
  return MENU_PREVIEW_GROUPS.map((label) => {
    const mod = moduleOfGroup(label);
    const locked = mod !== null && !modules.includes(mod);
    let sub = '';
    if (label === 'Seguimiento') sub = modules.includes('SEGUIMIENTO_EXT') ? 'Hallazgos · PBC · Confirmaciones' : 'Hallazgos';
    return { label, module: mod, locked, sub };
  });
}

/** Dirección de la pantalla «no está en tu plan» de un módulo o función. */
export function lockedHref(key: string): string {
  return `/dashboard/billing/modulo/${encodeURIComponent(key)}`;
}
