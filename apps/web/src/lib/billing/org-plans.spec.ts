import type { PlanRow, SubscriptionRow } from './admin-types';
import { choiceHint, defaultPlanCode, orgPlanView, planChoiceGroups, prettyLegacyPlan, subscriptionsByOrg, tierToSend } from './org-plans';

const plan = (code: string, name: string, over: Partial<PlanRow> = {}): PlanRow => ({
  id: `id_${code}`, code, name, audience: 'EMPRESA', description: '', isPublic: true, featured: false, active: true, sortOrder: 10, trialDays: 14,
  limits: {}, modules: [], functions: [], assistants: [], prices: [], ...over,
});

const CATALOG: PlanRow[] = [
  plan('PILOTO', 'Piloto / Fundador', { sortOrder: 70, trialDays: 0, isPublic: false }),
  plan('EMPRESA_PLUS', 'Empresa Plus', { sortOrder: 50 }),
  plan('PERSONA_INICIAL', 'Persona Inicial', { sortOrder: 10, audience: 'PERSONA' }),
  plan('INTERNO', 'Interno', { sortOrder: 80, trialDays: 0, isPublic: false }),
  plan('EMPRESA_DESPACHO', 'Empresa Despacho', { sortOrder: 30 }),
  plan('INSTITUCIONAL', 'Institucional', { sortOrder: 60, isPublic: false, trialDays: 30 }),
];

describe('planChoiceGroups', () => {
  it('dos grupos: los que empiezan con prueba y los exentos, cada uno en el orden del catálogo', () => {
    const g = planChoiceGroups(CATALOG);
    expect(g.map((x) => x.id)).toEqual(['TRIAL', 'EXEMPT']);
    expect(g[0].choices.map((c) => c.code)).toEqual(['PERSONA_INICIAL', 'EMPRESA_DESPACHO', 'EMPRESA_PLUS', 'INSTITUCIONAL']);
    expect(g[1].choices.map((c) => c.code)).toEqual(['PILOTO', 'INTERNO']);
  });
  it('los planes no públicos (Institucional) sí se pueden elegir: se asignan a mano', () => {
    expect(planChoiceGroups(CATALOG)[0].choices.map((c) => c.code)).toContain('INSTITUCIONAL');
  });
  it('los inactivos no se ofrecen', () => {
    const g = planChoiceGroups([...CATALOG, plan('VIEJO', 'Viejo', { active: false }), plan('INTERNO_X', 'Otro', { active: false })]);
    const codes = g.flatMap((x) => x.choices.map((c) => c.code));
    expect(codes).not.toContain('VIEJO');
    expect(codes).not.toContain('INTERNO_X');
  });
  it('cada opción dice cuánto dura la prueba o que es exenta', () => {
    const g = planChoiceGroups(CATALOG);
    expect(g[0].choices.find((c) => c.code === 'EMPRESA_DESPACHO')).toMatchObject({ label: 'Empresa Despacho · prueba de 14 días', exempt: false, trialDays: 14 });
    expect(g[0].choices.find((c) => c.code === 'INSTITUCIONAL')!.label).toBe('Institucional · prueba de 30 días');
    expect(g[1].choices[0]).toMatchObject({ label: 'Piloto / Fundador · exenta, sin vencimiento', exempt: true });
  });
  it('1 día en singular y 0 días como «sin prueba»', () => {
    const g = planChoiceGroups([plan('A', 'A', { trialDays: 1 }), plan('B', 'B', { trialDays: 0, sortOrder: 20 })]);
    expect(g[0].choices.map((c) => c.label)).toEqual(['A · prueba de 1 día', 'B · sin prueba']);
  });
  it('un grupo vacío no se devuelve', () => {
    expect(planChoiceGroups([plan('PILOTO', 'Piloto')]).map((x) => x.id)).toEqual(['EXEMPT']);
    expect(planChoiceGroups([plan('X', 'X')]).map((x) => x.id)).toEqual(['TRIAL']);
  });
  it('sin planes (todavía cargando, error o tablas sin crear) devuelve lista vacía, sin romper', () => {
    expect(planChoiceGroups(null)).toEqual([]);
    expect(planChoiceGroups(undefined)).toEqual([]);
    expect(planChoiceGroups([])).toEqual([]);
    expect(planChoiceGroups('x' as never)).toEqual([]);
  });
  it('descarta entradas rotas sin romper y no modifica la lista recibida', () => {
    const input = [...CATALOG, null as never, { code: '', name: 'Sin código' } as never, { code: 'SIN_NOMBRE' } as never];
    const before = input.map((p) => p?.code);
    const codes = planChoiceGroups(input).flatMap((x) => x.choices.map((c) => c.code));
    expect(codes).not.toContain('');
    expect(codes).not.toContain('SIN_NOMBRE');
    expect(input.map((p) => p?.code)).toEqual(before);
  });
  it('días de prueba raros se toman como 0 y nunca salen negativos', () => {
    const g = planChoiceGroups([plan('A', 'A', { trialDays: -5 }), plan('B', 'B', { trialDays: Number.NaN, sortOrder: 20 })]);
    expect(g[0].choices.map((c) => c.trialDays)).toEqual([0, 0]);
  });
  it('a igual orden, por nombre', () => {
    const g = planChoiceGroups([plan('Z', 'Zeta', { sortOrder: 5 }), plan('A', 'Alfa', { sortOrder: 5 })]);
    expect(g[0].choices.map((c) => c.code)).toEqual(['A', 'Z']);
  });
});

describe('defaultPlanCode y tierToSend', () => {
  const groups = planChoiceGroups(CATALOG);
  it('preselecciona el plan por defecto de la plataforma si se puede elegir', () => {
    expect(defaultPlanCode(groups, 'EMPRESA_DESPACHO')).toBe('EMPRESA_DESPACHO');
    expect(defaultPlanCode(groups, 'PILOTO')).toBe('PILOTO');
  });
  it('si ese plan ya no existe o está inactivo, el primero con prueba', () => {
    expect(defaultPlanCode(groups, 'BORRADO')).toBe('PERSONA_INICIAL');
    expect(defaultPlanCode(groups, null)).toBe('PERSONA_INICIAL');
    expect(defaultPlanCode(groups, undefined)).toBe('PERSONA_INICIAL');
    expect(defaultPlanCode(groups, '')).toBe('PERSONA_INICIAL');
  });
  it('prefiere el primero CON PRUEBA aunque los exentos vengan primero en la lista', () => {
    const reversed = [...groups].reverse();
    expect(reversed.map((g) => g.id)).toEqual(['EXEMPT', 'TRIAL']);
    expect(defaultPlanCode(reversed, null)).toBe('PERSONA_INICIAL');
    expect(defaultPlanCode(reversed, 'NO_EXISTE')).toBe('PERSONA_INICIAL');
  });
  it('sin planes con prueba, el primero que haya; sin nada, vacío', () => {
    expect(defaultPlanCode(planChoiceGroups([plan('PILOTO', 'P')]), 'X')).toBe('PILOTO');
    expect(defaultPlanCode([], 'X')).toBe('');
  });
  it('solo manda un código que existe en la lista; lo demás no se manda', () => {
    expect(tierToSend('EMPRESA_PLUS', groups)).toBe('EMPRESA_PLUS');
    expect(tierToSend('professional', groups)).toBeUndefined(); // el texto antiguo ya no se manda
    expect(tierToSend('', groups)).toBeUndefined();
    expect(tierToSend('EMPRESA_PLUS', [])).toBeUndefined();
  });
});

describe('choiceHint', () => {
  const groups = planChoiceGroups(CATALOG);
  it('plan con prueba: dice cuánto dura y qué sigue', () => {
    const h = choiceHint('EMPRESA_DESPACHO', groups, 'ENFORCE');
    expect(h).toContain('Empieza con una prueba de 14 días');
    expect(h).toContain('Planes y suscripciones');
    expect(h).not.toContain('apagado');
  });
  it('plan exento: sin cobro ni vencimiento', () => {
    expect(choiceHint('PILOTO', groups, 'ENFORCE')).toContain('Sin cobro ni vencimiento');
  });
  it('con el cumplimiento apagado avisa que el plan no limita nada todavía', () => {
    expect(choiceHint('EMPRESA_DESPACHO', groups, 'OFF')).toContain('El cumplimiento de planes está apagado');
    expect(choiceHint('PILOTO', groups, 'OFF')).toContain('El cumplimiento de planes está apagado');
    expect(choiceHint('EMPRESA_DESPACHO', groups, 'OBSERVE')).not.toContain('apagado');
    expect(choiceHint('EMPRESA_DESPACHO', groups, undefined)).not.toContain('apagado');
  });
  it('un plan sin prueba lo dice; un código desconocido no explica nada', () => {
    expect(choiceHint('A', planChoiceGroups([plan('A', 'A', { trialDays: 0 })]), 'ENFORCE')).toContain('Empieza sin prueba');
    expect(choiceHint('NADA', groups, 'OFF')).toBe('');
  });
});

describe('plan de cada organización en la tabla', () => {
  const sub = (over: Partial<SubscriptionRow> = {}): Pick<SubscriptionRow, 'planName' | 'exempt' | 'status' | 'endsAt'> => ({
    planName: 'Empresa Despacho', exempt: false, status: 'TRIAL', endsAt: '2026-12-05T00:00:00.000Z', ...over,
  });

  it('texto antiguo con buen formato', () => {
    expect(prettyLegacyPlan('professional')).toBe('Professional');
    expect(prettyLegacyPlan('empresa_despacho')).toBe('Empresa despacho');
    expect(prettyLegacyPlan('ENTERPRISE')).toBe('Enterprise');
    expect(prettyLegacyPlan('')).toBe('—');
    expect(prettyLegacyPlan(null)).toBe('—');
    expect(prettyLegacyPlan(undefined)).toBe('—');
    expect(prettyLegacyPlan(42)).toBe('—');
  });
  it('con suscripción: el plan real, su estado y su vencimiento', () => {
    const v = orgPlanView('professional', sub());
    expect(v).toMatchObject({ name: 'Empresa Despacho', exempt: false, fromSubscription: true });
    expect(v.detail).toBe('Prueba · vence 04-12-2026'); // la fecha se muestra en hora de El Salvador (como en todo «Planes y suscripciones»)
  });
  it('exenta (Piloto o Interno): «Exenta», sin fecha', () => {
    expect(orgPlanView('professional', sub({ planName: 'Piloto / Fundador', exempt: true, endsAt: null }))).toEqual({ name: 'Piloto / Fundador', detail: 'Exenta', exempt: true, fromSubscription: true });
  });
  it('sin vencimiento: solo el estado', () => {
    expect(orgPlanView('x', sub({ endsAt: null, status: 'ACTIVE' })).detail).not.toContain('vence');
  });
  it('estado desconocido: no inventa nada', () => {
    expect(orgPlanView('x', sub({ status: 'RARO' as never, endsAt: null })).detail).toBeNull();
    expect(orgPlanView('x', sub({ status: 'RARO' as never })).detail).toContain('vence');
  });
  it('sin suscripción (tablas sin crear, error o cargando): el texto antiguo, sin presentarlo como plan nuevo', () => {
    expect(orgPlanView('professional', null)).toEqual({ name: 'Professional', detail: null, exempt: false, fromSubscription: false });
    expect(orgPlanView('', undefined)).toEqual({ name: '—', detail: null, exempt: false, fromSubscription: false });
  });
  it('un nombre de plan vacío cae al texto antiguo', () => {
    expect(orgPlanView('starter', sub({ planName: '' })).name).toBe('Starter');
  });
  it('subscriptionsByOrg indexa por organización y tolera datos rotos', () => {
    const map = subscriptionsByOrg([{ organizationId: 'a', planName: 'A' } as never, { organizationId: 'b', planName: 'B' } as never, null as never, { planName: 'sin id' } as never]);
    expect([...map.keys()]).toStrictEqual(['a', 'b']); // toEqual ignoraría un `undefined` de más
    expect(map.size).toBe(2);
    expect(map.has(undefined as never)).toBe(false);
    expect(subscriptionsByOrg(null).size).toBe(0);
    expect(subscriptionsByOrg(undefined).size).toBe(0);
  });
});
