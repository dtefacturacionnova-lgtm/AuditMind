import { EntitlementKey } from './billing.constants';

/**
 * Qué módulo o función necesita cada controlador, por su ruta (prefijo por SEGMENTOS completos; gana el más largo).
 *
 * El menú de la web solo oculta cosas en pantalla: la barrera real es esta tabla, que aplica `SubscriptionGuard` en el servidor
 * (quien escriba la URL a mano o llame al API recibe 403 MODULO_NO_INCLUIDO). La prueba `route-entitlements.spec.ts` recorre TODOS los
 * controladores y falla si alguno no está aquí ni en CORE_ROUTES: un controlador nuevo no puede quedar sin declarar.
 */
export const GATED_ROUTES: ReadonlyArray<readonly [string, EntitlementKey]> = [
  ['audits/:auditId/investigation-report', 'FORENSE'],
  ['investigation-graph', 'FORENSE'],
  ['signature-requests', 'FIRMA'],
  ['public/signatures', 'FIRMA'],
  ['watchlists', 'CAATS_AVANZADOS'],
  ['strategic', 'PLAN_ANUAL'],
  ['audit-universe', 'PLAN_ANUAL'],
  ['audit-projects', 'PLAN_ANUAL'],
  ['plans', 'PLAN_ANUAL'],
  ['portfolio', 'CARTERA'],
  ['collections', 'CARTERA'],
  ['timesheet', 'HORAS'],
  ['capacity', 'HORAS'],
  ['admin-tasks', 'HORAS'],
  ['risks', 'RIESGOS'],
  ['committee', 'GOBIERNO'],
  ['qaip', 'GOBIERNO'],
  ['pbc', 'SEGUIMIENTO_EXT'],
  ['pbc-portal', 'SEGUIMIENTO_EXT'],
  ['confirmations', 'SEGUIMIENTO_EXT'],
  ['reports', 'REPORTES_IA'],
  ['pdf-tools', 'REPORTES_IA'],
];

/** Núcleo y plataforma: disponibles en todos los planes (los asistentes de IA y los límites tienen sus propios chequeos). */
export const CORE_ROUTES: readonly string[] = [
  'auth', 'users', 'organizations', 'catalogs', 'index-templates', 'audit-templates', 'content-library', 'data-sources', 'dashboard',
  'notifications', 'audits', 'audit-procedures', 'working-papers', 'findings', 'fiscal', 'email', 'ai', 'billing', 'billing-admin',
];

export function normalizeRoute(path: string): string {
  return path.replace(/^\/+/, '').replace(/^api\/v\d+\//, '').replace(/\/+$/, '').toLowerCase();
}

const underPrefix = (route: string, prefix: string) => route === prefix || route.startsWith(prefix + '/');

/**
 * El derecho que exige una ruta: una clave de módulo/función, 'CORE' (siempre), o `null` si el controlador no está declarado
 * (la prueba lo impide; en ejecución se trata como núcleo para no romper nada).
 */
export function resolveRouteEntitlement(path: string): EntitlementKey | 'CORE' | null {
  const route = normalizeRoute(path);
  const gated = [...GATED_ROUTES].sort((a, b) => b[0].length - a[0].length).find(([prefix]) => underPrefix(route.toLowerCase(), prefix.toLowerCase()));
  if (gated) return gated[1];
  if (CORE_ROUTES.some((prefix) => underPrefix(route, prefix))) return 'CORE';
  return null;
}

/** En solo lectura (licencia vencida) solo pasan las consultas y estas rutas: iniciar sesión, pagar/renovar y exportar. */
export const READONLY_ALLOWED_ROUTES: readonly string[] = ['auth', 'billing', 'notifications'];
export const READONLY_ALLOWED_ACTIONS = /(^|\/)(export|download|pdf)(\/|$)/i;
export const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

export function isAllowedWhileReadOnly(method: string, fullPath: string): boolean {
  if (SAFE_METHODS.includes((method || '').toUpperCase())) return true;
  const route = normalizeRoute(fullPath);
  if (READONLY_ALLOWED_ROUTES.some((p) => underPrefix(route, p))) return true;
  return READONLY_ALLOWED_ACTIONS.test(route);
}
