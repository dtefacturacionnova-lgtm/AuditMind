import * as fs from 'fs';
import * as path from 'path';
import { ENTITLEMENT_KEYS } from './billing.constants';
import { CORE_ROUTES, GATED_ROUTES, isAllowedWhileReadOnly, normalizeRoute, resolveRouteEntitlement } from './route-entitlements';

/** Rutas de TODOS los controladores del código fuente, leídas de `@Controller('…')`. */
function controllerPaths(): Array<{ file: string; route: string }> {
  const out: Array<{ file: string; route: string }> = [];
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.controller.ts')) {
        const src = fs.readFileSync(full, 'utf8');
        for (const m of src.matchAll(/@Controller\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/g)) out.push({ file: path.relative(path.join(__dirname, '..'), full), route: m[1] ?? '' });
      }
    }
  };
  walk(path.join(__dirname, '..'));
  return out;
}

describe('cada controlador declara a qué módulo pertenece', () => {
  const controllers = controllerPaths();

  it('encuentra los controladores (sanidad de la propia prueba)', () => {
    expect(controllers.length).toBeGreaterThan(40);
  });

  it('NINGÚN controlador queda sin declarar: o es de un módulo/función o es núcleo', () => {
    const sinDeclarar = controllers.filter((c) => resolveRouteEntitlement(c.route) === null).map((c) => `${c.file} → @Controller('${c.route}')`);
    expect(sinDeclarar).toEqual([]);
  });

  it('cada regla de módulo apunta a un controlador que existe (detecta erratas y controladores renombrados)', () => {
    const rutas = controllers.map((c) => normalizeRoute(c.route));
    const huerfanas = GATED_ROUTES.filter(([prefix]) => !rutas.some((r) => r === prefix.toLowerCase() || r.startsWith(prefix.toLowerCase() + '/'))).map(([p]) => p);
    expect(huerfanas).toEqual([]);
    const coreHuerfanas = CORE_ROUTES.filter((prefix) => !rutas.some((r) => r === prefix || r.startsWith(prefix + '/')));
    expect(coreHuerfanas).toEqual([]);
  });

  it('las claves de las reglas son módulos o funciones válidos', () => {
    for (const [, key] of GATED_ROUTES) expect(ENTITLEMENT_KEYS).toContain(key);
  });
});

describe('resolveRouteEntitlement', () => {
  const casos: Array<[string, string | null]> = [
    ['portfolio', 'CARTERA'], ['portfolio/clients', 'CARTERA'], ['portfolio/engagement-letters', 'CARTERA'], ['collections', 'CARTERA'],
    ['plans', 'PLAN_ANUAL'], ['strategic', 'PLAN_ANUAL'], ['audit-universe', 'PLAN_ANUAL'], ['audit-projects', 'PLAN_ANUAL'],
    ['timesheet', 'HORAS'], ['capacity', 'HORAS'], ['admin-tasks', 'HORAS'], ['risks', 'RIESGOS'],
    ['committee', 'GOBIERNO'], ['qaip', 'GOBIERNO'], ['qaip/competencies', 'GOBIERNO'], ['qaip/eqr', 'GOBIERNO'],
    ['pbc', 'SEGUIMIENTO_EXT'], ['pbc-portal', 'SEGUIMIENTO_EXT'], ['confirmations', 'SEGUIMIENTO_EXT'],
    ['reports', 'REPORTES_IA'], ['pdf-tools', 'REPORTES_IA'],
    ['signature-requests', 'FIRMA'], ['public/signatures', 'FIRMA'],
    ['audits/:auditId/investigation-report', 'FORENSE'], ['audits/:auditId/investigation-report/caats', 'FORENSE'], ['investigation-graph', 'FORENSE'],
    ['watchlists', 'CAATS_AVANZADOS'],
    ['audits', 'CORE'], ['audits/:auditId/expediente', 'CORE'], ['working-papers', 'CORE'], ['working-papers/:paperId/evidence', 'CORE'],
    ['findings', 'CORE'], ['users', 'CORE'], ['billing', 'CORE'], ['ai', 'CORE'],
    ['algo-inventado', null],
  ];
  it.each(casos)('%s → %s', (ruta, esperado) => {
    expect(resolveRouteEntitlement(ruta)).toBe(esperado);
  });

  it('compara por SEGMENTOS completos: «pbc-portal» no cae en «pbc» por prefijo de texto, ni «planning» en «plans»', () => {
    expect(resolveRouteEntitlement('pbc-portal')).toBe('SEGUIMIENTO_EXT');
    expect(resolveRouteEntitlement('plansomething')).toBeNull();
    expect(resolveRouteEntitlement('riskset')).toBeNull();
  });

  it('el prefijo más específico gana sobre el núcleo (audits/…/investigation-report es forense; audits es núcleo)', () => {
    expect(resolveRouteEntitlement('audits/abc/investigation-report')).toBe('CORE'); // el id real no coincide con el patrón :auditId: se usa la ruta DECLARADA del controlador
    expect(resolveRouteEntitlement('audits/:auditId/investigation-report')).toBe('FORENSE');
    expect(resolveRouteEntitlement('audits')).toBe('CORE');
  });

  it('ignora mayúsculas, barras y el prefijo global api/v1', () => {
    expect(resolveRouteEntitlement('/api/v1/Portfolio/')).toBe('CARTERA');
    expect(normalizeRoute('/api/v1/portfolio/clients/')).toBe('portfolio/clients');
  });
});

describe('isAllowedWhileReadOnly (licencia vencida)', () => {
  it('las consultas siempre pasan', () => {
    for (const m of ['GET', 'HEAD', 'OPTIONS', 'get']) expect(isAllowedWhileReadOnly(m, 'portfolio/clients')).toBe(true);
  });
  it('crear, editar y borrar no pasan', () => {
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) expect(isAllowedWhileReadOnly(m, 'findings')).toBe(false);
  });
  it('iniciar sesión, pagar/renovar y notificaciones sí pasan', () => {
    expect(isAllowedWhileReadOnly('POST', 'auth/login')).toBe(true);
    expect(isAllowedWhileReadOnly('POST', 'billing/payments')).toBe(true);
    expect(isAllowedWhileReadOnly('PATCH', 'notifications/123/read')).toBe(true);
  });
  it('exportar y descargar pasan aunque sean POST', () => {
    expect(isAllowedWhileReadOnly('POST', 'ai/analytics/:type/pdf')).toBe(true);
    expect(isAllowedWhileReadOnly('POST', 'reports/export')).toBe(true);
    expect(isAllowedWhileReadOnly('POST', 'audits/:id/download')).toBe(true);
  });
  it('el chat de IA y los análisis NO pasan en solo lectura (cuestan dinero)', () => {
    expect(isAllowedWhileReadOnly('POST', 'ai/chat')).toBe(false);
    expect(isAllowedWhileReadOnly('POST', 'ai/analytics/:type')).toBe(false);
  });
});
