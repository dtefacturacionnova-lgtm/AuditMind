import type { PlanRow } from './admin-types';
import { ASSISTANT_KEYS, suggestAssistants } from './catalog';
import {
  emptyPlanForm, formToDto, limitValue, parseMoney, parseWhole, planEconomics, planPriceSummary, planToForm, planWarnings, resetAssistants,
  setAssistant, setFunction, setModule, validatePlanForm, type PlanFormState,
} from './plan-form';

const SETTINGS = { costPerRequestUsd: 0.0012, safetyMultiplier: 3 };

/** El plan «Empresa Despacho» del diseño (§10.5 y §11.4). */
const despacho: PlanRow = {
  id: 'p1', code: 'EMPRESA_DESPACHO', name: 'Empresa Despacho', audience: 'EMPRESA', description: 'Despacho pequeño o mediano',
  isPublic: true, featured: true, active: true, sortOrder: 3, trialDays: 14,
  limits: { users: 5, maxUsers: 15, extraUserPriceUsd: 19, storageGb: 100, maxFileMb: 500, aiRequests: 5000, fileTypes: ['PDF', 'FOTO', 'AUDIO', 'VIDEO', 'PPT', 'XLS', 'OTROS'], packsAi: true, packsStorage: false },
  modules: ['CARTERA', 'HORAS', 'RIESGOS', 'SEGUIMIENTO_EXT', 'REPORTES_IA'], functions: ['FIRMA', 'MARCA'],
  assistants: suggestAssistants(['CARTERA', 'HORAS', 'RIESGOS', 'SEGUIMIENTO_EXT', 'REPORTES_IA'], ['FIRMA', 'MARCA']),
  prices: [
    { months: 1, priceUsd: '149', active: true }, { months: 3, priceUsd: '424.00', active: true },
    { months: 6, priceUsd: '805', active: true }, { months: 12, priceUsd: '1490', active: true }, { months: 0, priceUsd: '0', active: false },
  ],
};

describe('pre-marcado de asistentes por afinidad (misma regla que el API)', () => {
  it('sin módulos solo quedan los de ejecución', () => {
    expect(suggestAssistants([], [])).toEqual(['ARGUS', 'SCRIPTORIUM', 'SOCRATES', 'VULCANO']);
  });

  it('Gobierno agrega ATLAS, FENIX, MINERVA_QAIP y los de cumplimiento', () => {
    const s = suggestAssistants(['GOBIERNO'], []);
    for (const a of ['ATLAS', 'FENIX', 'MINERVA_QAIP', 'SENADO', 'FISCUS', 'THEMIS']) expect(s).toContain(a);
    expect(s).not.toContain('HERMES');
    expect(s).not.toContain('MINERVA');
  });

  it('Cartera trae el trío fiscal/PLD; Plan Anual y Riesgos traen MINERVA y CASSANDRA', () => {
    expect(suggestAssistants(['CARTERA'], [])).toEqual(expect.arrayContaining(['SENADO', 'FISCUS', 'THEMIS']));
    expect(suggestAssistants(['PLAN_ANUAL'], [])).toEqual(expect.arrayContaining(['MINERVA', 'CASSANDRA']));
    expect(suggestAssistants(['RIESGOS'], [])).toEqual(expect.arrayContaining(['MINERVA', 'CASSANDRA']));
  });

  it('la función Forense trae HERMES y SHERLOCK; Reportería trae CICERO', () => {
    expect(suggestAssistants([], ['FORENSE'])).toEqual(expect.arrayContaining(['HERMES', 'SHERLOCK']));
    expect(suggestAssistants(['REPORTES_IA'], [])).toContain('CICERO');
  });

  it('con todo marcado salen los 15 asistentes', () => {
    expect(suggestAssistants(['PLAN_ANUAL', 'CARTERA', 'GOBIERNO', 'RIESGOS', 'REPORTES_IA'], ['FORENSE'])).toHaveLength(15);
  });
});

describe('edición con pre-marcado automático', () => {
  it('mientras está en automático, marcar un módulo marca sus asistentes afines', () => {
    let f = emptyPlanForm();
    expect(f.assistants.ATLAS).toBe(false);
    f = setModule(f, 'GOBIERNO', true);
    expect(f.assistants.ATLAS).toBe(true);
    expect(f.assistants.FENIX).toBe(true);
    f = setFunction(f, 'FORENSE', true);
    expect(f.assistants.SHERLOCK).toBe(true);
    f = setModule(f, 'GOBIERNO', false);
    expect(f.assistants.ATLAS).toBe(false);
    expect(f.assistants.SHERLOCK).toBe(true);
  });

  it('un cambio manual saca del automático: marcar módulos ya no toca los asistentes', () => {
    let f = emptyPlanForm();
    f = setAssistant(f, 'ATLAS', true);
    expect(f.assistantsAuto).toBe(false);
    f = setModule(f, 'GOBIERNO', true);
    f = setModule(f, 'GOBIERNO', false);
    expect(f.assistants.ATLAS).toBe(true);
  });

  it('«Pre-marcar según módulos» vuelve a la regla', () => {
    let f = setAssistant(emptyPlanForm(), 'ATLAS', true);
    f = setModule(f, 'CARTERA', true);
    f = resetAssistants(f);
    expect(f.assistantsAuto).toBe(true);
    expect(f.assistants.ATLAS).toBe(false);
    expect(f.assistants.FISCUS).toBe(true);
  });

  it('un plan guardado con los asistentes que da la regla entra en automático; uno personalizado, no', () => {
    expect(planToForm(despacho).assistantsAuto).toBe(true);
    expect(planToForm({ ...despacho, assistants: ['ARGUS'] }).assistantsAuto).toBe(false);
  });

  it('al cargar un plan personalizado no se pierden sus asistentes al editar módulos', () => {
    let f = planToForm({ ...despacho, assistants: ['ARGUS', 'ATLAS'] });
    f = setModule(f, 'GOBIERNO', true);
    expect(ASSISTANT_KEYS.filter((k) => f.assistants[k])).toEqual(['ARGUS', 'ATLAS']);
  });
});

describe('lectura de números', () => {
  it('enteros solo con dígitos', () => {
    expect(parseWhole('14')).toBe(14);
    expect(parseWhole(' 0 ')).toBe(0);
    for (const bad of ['', '-1', '1.5', '1e3', 'abc', '12 3', '1234567890']) expect(parseWhole(bad)).toBeNull();
  });

  it('dinero con hasta dos decimales, con «$» y comas de miles', () => {
    expect(parseMoney('149')).toBe(149);
    expect(parseMoney('$ 1,490.50')).toBe(1490.5);
    expect(parseMoney('19.5')).toBe(19.5);
    for (const bad of ['', '-5', '1.234', 'abc', '1,2', '12.', '.5']) expect(parseMoney(bad)).toBeNull();
  });

  it('«sin tope» vale -1', () => {
    expect(limitValue({ unlimited: true, value: 'x' })).toBe(-1);
    expect(limitValue({ unlimited: false, value: '100' })).toBe(100);
    expect(limitValue({ unlimited: false, value: '' })).toBeNull();
  });
});

describe('del plan del API al formulario y de vuelta', () => {
  it('el formulario refleja el plan', () => {
    const f = planToForm(despacho);
    expect(f.name).toBe('Empresa Despacho');
    expect(f.users).toEqual({ unlimited: false, value: '5' });
    expect(f.aiRequests.value).toBe('5000');
    expect(f.prices[12]).toEqual({ on: true, value: '1490', existing: true });
    expect(f.prices[3].value).toBe('424');
    expect(f.prices[0]).toEqual({ on: false, value: '0', existing: true });
    expect(f.fileTypes.VIDEO).toBe(true);
    expect(f.packsStorage).toBe(false);
    expect(f.modules.CARTERA).toBe(true);
    expect(f.modules.GOBIERNO).toBe(false);
  });

  it('el cuerpo solo trae campos del DTO y con tipos exactos', () => {
    const dto = formToDto(planToForm(despacho), 'update') as Record<string, any>;
    expect(Object.keys(dto).sort()).toEqual(
      ['active', 'assistants', 'audience', 'description', 'featured', 'functions', 'isPublic', 'limits', 'modules', 'name', 'prices', 'sortOrder', 'trialDays'],
    );
    expect(Object.keys(dto.limits).sort()).toEqual(
      ['aiRequests', 'extraUserPriceUsd', 'fileTypes', 'maxFileMb', 'maxUsers', 'packsAi', 'packsStorage', 'storageGb', 'users'],
    );
    for (const k of ['isPublic', 'featured', 'active']) expect(typeof dto[k]).toBe('boolean');
    expect(typeof dto.limits.packsAi).toBe('boolean');
    expect(typeof dto.limits.packsStorage).toBe('boolean');
    for (const k of ['users', 'maxUsers', 'storageGb', 'maxFileMb', 'aiRequests', 'extraUserPriceUsd']) expect(typeof dto.limits[k]).toBe('number');
    expect(typeof dto.trialDays).toBe('number');
    expect(typeof dto.sortOrder).toBe('number');
    expect(dto.limits.packsStorage).toBe(false);
    expect(dto.code).toBeUndefined();
  });

  it('al crear envía el código en mayúsculas; al actualizar no', () => {
    const f = { ...emptyPlanForm(), code: ' empresa_nueva ', name: 'Nueva' };
    expect(formToDto(f, 'create').code).toBe('EMPRESA_NUEVA');
    expect('code' in formToDto(f, 'update')).toBe(false);
  });

  it('los precios: activos se envían activos; los existentes apagados se envían desactivados; los nuevos apagados no se envían', () => {
    const f = planToForm(despacho);
    const dto = formToDto(f, 'update') as { prices: Array<{ months: number; priceUsd: number; active: boolean }> };
    expect(dto.prices).toEqual([
      { months: 1, priceUsd: 149, active: true }, { months: 3, priceUsd: 424, active: true },
      { months: 6, priceUsd: 805, active: true }, { months: 12, priceUsd: 1490, active: true },
      { months: 0, priceUsd: 0, active: false },
    ]);
    const fresh = emptyPlanForm();
    fresh.prices[12] = { on: true, value: '990', existing: false };
    expect((formToDto({ ...fresh, code: 'ABC', name: 'x' }, 'create') as { prices: unknown[] }).prices).toEqual([{ months: 12, priceUsd: 990, active: true }]);
  });

  it('«sin tope» se envía como -1', () => {
    const f: PlanFormState = { ...planToForm(despacho), aiRequests: { unlimited: true, value: '' }, storageGb: { unlimited: true, value: '' } };
    const dto = formToDto(f, 'update') as { limits: Record<string, number> };
    expect(dto.limits.aiRequests).toBe(-1);
    expect(dto.limits.storageGb).toBe(-1);
    expect(planToForm({ ...despacho, limits: { ...despacho.limits, aiRequests: -1 } }).aiRequests).toEqual({ unlimited: true, value: '' });
  });

  it('el round-trip de un plan válido no cambia nada', () => {
    const dto = formToDto(planToForm(despacho), 'update') as Record<string, any>;
    expect(dto.modules).toEqual(despacho.modules);
    expect(dto.functions).toEqual(despacho.functions);
    expect(dto.assistants.sort()).toEqual([...despacho.assistants].sort());
    expect(dto.limits.users).toBe(5);
    expect(dto.limits.fileTypes).toEqual(expect.arrayContaining(['VIDEO', 'PDF']));
  });
});

describe('validación del formulario', () => {
  it('un plan completo es válido', () => {
    expect(validatePlanForm(planToForm(despacho), 'update')).toEqual({});
  });

  it('al crear exige código y nombre', () => {
    const e = validatePlanForm(emptyPlanForm(), 'create');
    expect(e.name).toBeDefined();
    expect(e.code).toBeDefined();
    expect(validatePlanForm({ ...emptyPlanForm(), name: 'X', code: 'ab' }, 'create').code).toBeDefined();
    expect(validatePlanForm({ ...emptyPlanForm(), name: 'X', code: 'ñandú' }, 'create').code).toBeDefined();
    expect(validatePlanForm({ ...emptyPlanForm(), name: 'X', code: 'plan_ok1' }, 'create')).toEqual({});
  });

  it('al actualizar no exige código', () => {
    expect(validatePlanForm({ ...emptyPlanForm(), name: 'X' }, 'update')).toEqual({});
  });

  it('rechaza el máximo de usuarios menor que los incluidos (el API también lo rechaza)', () => {
    const f = { ...planToForm(despacho), users: { unlimited: false, value: '10' }, maxUsers: { unlimited: false, value: '5' } };
    expect(validatePlanForm(f, 'update').maxUsers).toBeDefined();
  });

  it('con usuarios sin tope no compara', () => {
    const f = { ...planToForm(despacho), users: { unlimited: true, value: '' }, maxUsers: { unlimited: false, value: '5' } };
    expect(validatePlanForm(f, 'update').maxUsers).toBeUndefined();
  });

  it('días de prueba entre 0 y 365; límites enteros; precios con formato de dinero', () => {
    const f = planToForm(despacho);
    expect(validatePlanForm({ ...f, trialDays: '366' }, 'update').trialDays).toBeDefined();
    expect(validatePlanForm({ ...f, trialDays: '0' }, 'update').trialDays).toBeUndefined();
    expect(validatePlanForm({ ...f, aiRequests: { unlimited: false, value: '1.5' } }, 'update').aiRequests).toBeDefined();
    expect(validatePlanForm({ ...f, storageGb: { unlimited: false, value: '' } }, 'update').storageGb).toBeDefined();
    expect(validatePlanForm({ ...f, extraUserPriceUsd: 'abc' }, 'update').extraUserPriceUsd).toBeDefined();
    expect(validatePlanForm({ ...f, prices: { ...f.prices, 12: { on: true, value: '', existing: true } } }, 'update').price12).toBeDefined();
    expect(validatePlanForm({ ...f, prices: { ...f.prices, 12: { on: false, value: '', existing: true } } }, 'update').price12).toBeUndefined();
  });
});

describe('advertencias del editor', () => {
  it('Horas sin Cartera', () => {
    const f = setModule(setModule(emptyPlanForm(), 'HORAS', true), 'RIESGOS', true);
    expect(planWarnings(f).join(' ')).toContain('Horas y Rentabilidad rinde más junto con Cartera');
    expect(planWarnings(setModule(f, 'CARTERA', true)).join(' ')).not.toContain('Horas y Rentabilidad rinde más');
  });

  it('forense marcado sin la función', () => {
    const f = setAssistant(emptyPlanForm(), 'SHERLOCK', true);
    expect(planWarnings(f).join(' ')).toContain('«Investigador forense» no está incluida');
    expect(planWarnings(setFunction(f, 'FORENSE', true)).join(' ')).not.toContain('Investigador forense');
  });

  it('asistentes de Gobierno sin el módulo', () => {
    const f = setAssistant(emptyPlanForm(), 'ATLAS', true);
    expect(planWarnings(f).join(' ')).toContain('Gobierno Corporativo');
  });

  it('solo núcleo, sin precio, sin tope, sin tipos de archivo, inactivo', () => {
    const f: PlanFormState = {
      ...emptyPlanForm(), code: 'X', aiRequests: { unlimited: true, value: '' }, storageGb: { unlimited: true, value: '' }, active: false,
      fileTypes: { VIDEO: false, AUDIO: false, PDF: false, FOTO: false, PPT: false, XLS: false, OTROS: false },
    };
    const w = planWarnings(f).join(' | ');
    expect(w).toContain('ningún módulo opcional');
    expect(w).toContain('ningún precio activo');
    expect(w).toContain('peticiones de IA están sin tope');
    expect(w).toContain('espacio está sin tope');
    expect(w).toContain('ningún tipo de archivo');
    expect(w).toContain('inactivo');
  });

  it('Piloto e Interno no necesitan precio', () => {
    expect(planWarnings({ ...emptyPlanForm(), code: 'interno' }).join(' ')).not.toContain('ningún precio activo');
  });

  it('un plan sano no tiene advertencias', () => {
    expect(planWarnings(planToForm(despacho))).toEqual([]);
  });
});

describe('resumen económico del plan (solo superadmin)', () => {
  it('Empresa Despacho: IA $6.00 con tope $18.00, espacio $2.13, costo $8.13 y margen del 94 % sobre el precio por mes más bajo', () => {
    const e = planEconomics(planToForm(despacho), SETTINGS);
    expect(e.aiCost).toBeCloseTo(6, 6);
    expect(e.aiCap).toBeCloseTo(18, 6);
    expect(e.storageSupabase).toBeCloseTo(2.13, 6);
    expect(e.storageR2).toBeCloseTo(1.5, 6);
    expect(e.totalCost).toBeCloseTo(8.13, 6);
    expect(e.monthlyPrice).toBeCloseTo(1490 / 12, 6);
    expect(e.margin?.pct).toBe(93); // 1 - 8.13/124.17 = 93.45 %
    expect(e.modulesCount).toBe(5);
    expect(e.functionsCount).toBe(2);
    expect(e.assistantsCount).toBe(despacho.assistants.length);
  });

  it('cambia con los parámetros de la plataforma', () => {
    const e = planEconomics(planToForm(despacho), { costPerRequestUsd: 0.002, safetyMultiplier: 2 });
    expect(e.aiCost).toBeCloseTo(10, 6);
    expect(e.aiCap).toBeCloseTo(20, 6);
  });

  it('sin tope no hay costo ni margen', () => {
    const f = { ...planToForm(despacho), aiRequests: { unlimited: true, value: '' } };
    const e = planEconomics(f, SETTINGS);
    expect(e.aiCost).toBeNull();
    expect(e.totalCost).toBeNull();
    expect(e.margin).toBeNull();
  });

  it('sin precios activos no hay margen', () => {
    const f = emptyPlanForm();
    expect(planEconomics(f, SETTINGS).margin).toBeNull();
  });
});

describe('resumen de precios de la lista de planes', () => {
  it('precio mensual y el más bajo por mes', () => {
    const s = planPriceSummary(despacho);
    expect(s.monthly).toBe(149);
    expect(s.lowestPerMonth).toBeCloseTo(1490 / 12, 6);
    expect(s.hasActivePrice).toBe(true);
  });

  it('sin precio mensual, solo la equivalencia', () => {
    const s = planPriceSummary({ prices: [{ months: 12, priceUsd: '1200', active: true }] });
    expect(s.monthly).toBeNull();
    expect(s.lowestPerMonth).toBe(100);
  });

  it('ignora precios desactivados y sin vencimiento', () => {
    expect(planPriceSummary({ prices: [{ months: 1, priceUsd: '50', active: false }] })).toEqual({ monthly: null, lowestPerMonth: null, hasActivePrice: false });
    expect(planPriceSummary({ prices: [{ months: 0, priceUsd: '0', active: true }] })).toEqual({ monthly: null, lowestPerMonth: null, hasActivePrice: true });
    expect(planPriceSummary({ prices: [] }).hasActivePrice).toBe(false);
  });
});
