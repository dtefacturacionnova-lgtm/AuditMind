import { MODULE_KEYS } from './catalog';
import {
  GROUP_MODULE, ROUTE_MODULES, lockedHref, menuPreview, moduleForPath, moduleOfGroup, moduleOfItem,
} from './menu';

describe('mapa del menú a módulos', () => {
  it('cada grupo del menú apunta a su módulo', () => {
    expect(moduleOfGroup('Cartera')).toBe('CARTERA');
    expect(moduleOfGroup('Planificación Anual')).toBe('PLAN_ANUAL');
    expect(moduleOfGroup('Horas y Rentabilidad')).toBe('HORAS');
    expect(moduleOfGroup('Riesgos y Controles')).toBe('RIESGOS');
    expect(moduleOfGroup('Gobierno')).toBe('GOBIERNO');
    expect(moduleOfGroup('Reportería e IA')).toBe('REPORTES_IA');
  });

  it('en Seguimiento solo PBC y Confirmaciones dependen del plan', () => {
    expect(moduleOfItem('Portal Auditado (PBC)')).toBe('SEGUIMIENTO_EXT');
    expect(moduleOfItem('Confirmaciones Ext.')).toBe('SEGUIMIENTO_EXT');
    expect(moduleOfItem('Hallazgos')).toBeNull();
    expect(moduleOfGroup('Seguimiento')).toBeNull();
  });

  it('el núcleo no depende del plan', () => {
    for (const core of ['Dashboard', 'Ejecución del Plan Anual', 'Administración', 'Hallazgos']) {
      expect(moduleOfGroup(core)).toBeNull();
      expect(moduleOfItem(core)).toBeNull();
    }
  });

  it('no se deja engañar por nombres heredados de Object', () => {
    expect(moduleOfGroup('constructor')).toBeNull();
    expect(moduleOfItem('toString')).toBeNull();
  });

  it('todos los módulos del catálogo aparecen en el menú (ninguno queda sin donde mostrarse)', () => {
    const inMenu = new Set<string>([...Object.values(GROUP_MODULE), 'SEGUIMIENTO_EXT']);
    for (const key of MODULE_KEYS) expect(inMenu.has(key)).toBe(true);
  });
});

describe('módulo de una ruta de la web', () => {
  it('reconoce las secciones de cada módulo y sus sub-rutas', () => {
    expect(moduleForPath('/dashboard/portfolio')).toBe('CARTERA');
    expect(moduleForPath('/dashboard/portfolio/abc123/propuesta')).toBe('CARTERA');
    expect(moduleForPath('/dashboard/collections')).toBe('CARTERA');
    expect(moduleForPath('/dashboard/strategic')).toBe('PLAN_ANUAL');
    expect(moduleForPath('/dashboard/plans/xyz')).toBe('PLAN_ANUAL');
    expect(moduleForPath('/dashboard/timesheet/close')).toBe('HORAS');
    expect(moduleForPath('/dashboard/admin/cost-profiles')).toBe('HORAS');
    expect(moduleForPath('/dashboard/risks')).toBe('RIESGOS');
    expect(moduleForPath('/dashboard/qaip')).toBe('GOBIERNO');
    expect(moduleForPath('/dashboard/pbc')).toBe('SEGUIMIENTO_EXT');
    expect(moduleForPath('/dashboard/confirmations')).toBe('SEGUIMIENTO_EXT');
    expect(moduleForPath('/dashboard/pdf-tools')).toBe('REPORTES_IA');
  });

  it('Rentabilidad, Capacidad y Programa (bajo /portfolio) no se bloquean desde la web', () => {
    expect(moduleForPath('/dashboard/portfolio/profitability')).toBeNull();
    expect(moduleForPath('/dashboard/portfolio/capacity')).toBeNull();
    expect(moduleForPath('/dashboard/portfolio/program')).toBeNull();
  });

  it('el prefijo es por segmento completo: plan-risks no es plans', () => {
    expect(moduleForPath('/dashboard/plan-risks')).toBeNull();
    expect(moduleForPath('/dashboard/plansomething')).toBeNull();
  });

  it('el núcleo, Mi plan y la administración de la plataforma no se bloquean', () => {
    for (const p of ['/dashboard', '/dashboard/audits', '/dashboard/findings', '/dashboard/working-papers', '/dashboard/notifications',
      '/dashboard/billing', '/dashboard/billing/modulo/CARTERA', '/dashboard/admin/users', '/dashboard/admin/billing/planes']) {
      expect(moduleForPath(p)).toBeNull();
    }
  });

  it('ignora query, fragmento, barra final y mayúsculas', () => {
    expect(moduleForPath('/dashboard/risks/?x=1#a')).toBe('RIESGOS');
    expect(moduleForPath('/Dashboard/Risks')).toBe('RIESGOS');
    expect(moduleForPath('')).toBeNull();
    expect(moduleForPath(null)).toBeNull();
    expect(moduleForPath(undefined)).toBeNull();
  });

  it('no repite prefijos en la tabla', () => {
    const prefixes = ROUTE_MODULES.map(([p]) => p);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });
});

describe('vista previa del menú del cliente', () => {
  it('marca con candado los grupos cuyo módulo no está en el plan', () => {
    const rows = menuPreview(['CARTERA', 'HORAS']);
    const by = Object.fromEntries(rows.map((r) => [r.label, r]));
    expect(by['Cartera'].locked).toBe(false);
    expect(by['Horas y Rentabilidad'].locked).toBe(false);
    expect(by['Planificación Anual'].locked).toBe(true);
    expect(by['Gobierno'].locked).toBe(true);
    expect(by['Reportería e IA'].locked).toBe(true);
    expect(by['Dashboard'].locked).toBe(false);
    expect(by['Administración'].locked).toBe(false);
  });

  it('Seguimiento nunca se bloquea entero: solo cambia su detalle', () => {
    expect(menuPreview([]).find((r) => r.label === 'Seguimiento')).toMatchObject({ locked: false, sub: 'Hallazgos' });
    expect(menuPreview(['SEGUIMIENTO_EXT']).find((r) => r.label === 'Seguimiento')?.sub).toBe('Hallazgos · PBC · Confirmaciones');
  });

  it('con todos los módulos no queda ningún candado', () => {
    expect(menuPreview([...MODULE_KEYS]).some((r) => r.locked)).toBe(false);
  });
});

describe('dirección de la pantalla «no está en tu plan»', () => {
  it('codifica la clave', () => {
    expect(lockedHref('CARTERA')).toBe('/dashboard/billing/modulo/CARTERA');
    expect(lockedHref('a b/c')).toBe('/dashboard/billing/modulo/a%20b%2Fc');
  });
});
