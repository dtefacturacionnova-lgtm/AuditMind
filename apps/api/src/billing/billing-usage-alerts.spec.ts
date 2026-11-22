import {
  NEAR_PERCENT, describeUsageAlert, fmtGb, planAiAlert, planStorageAlert, usageLevel, type AiUsageInput, type UsageAlertDecision,
} from './billing-usage-alerts';

const GB = 1024 ** 3;

describe('usageLevel — 80 % y 100 %', () => {
  it('el umbral es el 80 % exacto (aritmética entera, sin redondeos de coma flotante)', () => {
    expect(NEAR_PERCENT).toBe(80);
    expect(usageLevel(79, 100)).toBeNull();
    expect(usageLevel(80, 100)).toBe('NEAR');
    expect(usageLevel(99, 100)).toBe('NEAR');
    expect(usageLevel(100, 100)).toBe('FULL');
    expect(usageLevel(150, 100)).toBe('FULL');
  });
  it('funciona con capacidades que no dan un 80 % redondo', () => {
    expect(usageLevel(7, 9)).toBeNull(); // 77.7 %
    expect(usageLevel(8, 10)).toBe('NEAR');
    expect(usageLevel(2399, 3000)).toBeNull(); // 79.96 %
    expect(usageLevel(2400, 3000)).toBe('NEAR');
  });
  it('sin capacidad o con uso negativo o inválido no hay nivel', () => {
    expect(usageLevel(5, 0)).toBeNull();
    expect(usageLevel(5, -1)).toBeNull();
    expect(usageLevel(-1, 100)).toBeNull();
    expect(usageLevel(NaN, 100)).toBeNull();
    expect(usageLevel(5, NaN)).toBeNull();
  });
  it('sin uso no hay nivel', () => {
    expect(usageLevel(0, 100)).toBeNull();
  });
});

const ai = (over: Partial<AiUsageInput> = {}): AiUsageInput => ({ included: 1000, usedTotal: 0, usedFromPlan: 0, packRemaining: 0, available: 1000, ...over });

describe('planAiAlert — peticiones de IA del mes', () => {
  it('por debajo del 80 % no avisa', () => {
    expect(planAiAlert(ai({ usedTotal: 700, usedFromPlan: 700, available: 300 }))).toBeNull();
    expect(planAiAlert(ai({ usedTotal: 799, usedFromPlan: 799, available: 201 }))).toBeNull();
  });
  it('al 80 % avisa «cerca» con el porcentaje, lo gastado y lo que queda', () => {
    expect(planAiAlert(ai({ usedTotal: 800, usedFromPlan: 800, available: 200 }))).toEqual({ kind: 'AI_80', percent: 80, used: 800, capacity: 1000, remaining: 200 });
    expect(planAiAlert(ai({ usedTotal: 999, usedFromPlan: 999, available: 1 }))).toMatchObject({ kind: 'AI_80', percent: 99, remaining: 1 });
  });
  it('el porcentaje es entero y se trunca, sin redondear hacia arriba', () => {
    expect(planAiAlert(ai({ usedTotal: 833, usedFromPlan: 833, available: 167 }))).toMatchObject({ kind: 'AI_80', percent: 83 });
    expect(planAiAlert(ai({ usedTotal: 989, usedFromPlan: 989, available: 11 }))).toMatchObject({ kind: 'AI_80', percent: 98 });
    expect(planStorageAlert(8.37 * GB, 10 * GB)).toMatchObject({ kind: 'STORAGE_80', percent: 83 });
  });
  it('al agotarse avisa «lleno» (100 %), justo cuando el servidor pausa la IA', () => {
    expect(planAiAlert(ai({ usedTotal: 1000, usedFromPlan: 1000, available: 0 }))).toEqual({ kind: 'AI_100', percent: 100, used: 1000, capacity: 1000, remaining: 0 });
  });
  it('de los dos niveles sale solo el más alto', () => {
    expect(planAiAlert(ai({ usedTotal: 1000, usedFromPlan: 1000, available: 0 }))?.kind).toBe('AI_100');
  });
  it('los paquetes suman a la capacidad: agotar lo del plan no es «lleno» mientras queden paquetes', () => {
    // plan 1000, ya gastó todo el plan y 100 de un paquete de 1000 → capacidad 2000, queda 900
    const s = ai({ usedTotal: 1100, usedFromPlan: 1000, packRemaining: 900, available: 900 });
    expect(planAiAlert(s)).toBeNull(); // 55 %
    // …y a punto de agotar el paquete también: 1000 + 900 gastados de 2000 = 95 %
    expect(planAiAlert(ai({ usedTotal: 1900, usedFromPlan: 1000, packRemaining: 100, available: 100 }))).toMatchObject({ kind: 'AI_80', percent: 95, capacity: 2000, remaining: 100 });
    expect(planAiAlert(ai({ usedTotal: 2000, usedFromPlan: 1000, packRemaining: 0, available: 0 }))).toMatchObject({ kind: 'AI_100', capacity: 2000 });
  });
  it('un paquete nuevo comprado a media mes amplía la capacidad', () => {
    expect(planAiAlert(ai({ usedTotal: 1000, usedFromPlan: 1000, packRemaining: 5000, available: 5000 }))).toBeNull();
  });
  it('sin tope (plan ilimitado) no hay avisos', () => {
    expect(planAiAlert(ai({ included: null, available: null, usedTotal: 99999, usedFromPlan: 99999 }))).toBeNull();
  });
  it('un plan sin IA y sin paquetes (capacidad 0) no avisa', () => {
    expect(planAiAlert(ai({ included: 0, available: 0 }))).toBeNull();
  });
  it('si el plan se redujo y lo gastado ya supera lo incluido, el porcentaje se mide contra lo que de verdad cubre el plan más los paquetes', () => {
    // plan 500, gastó 600 (el plan bajó a mitad de mes), paquete con 100 → capacidad efectiva 600, quedan 100: 83 %, no «lleno»
    expect(planAiAlert(ai({ included: 500, usedTotal: 600, usedFromPlan: 600, packRemaining: 100, available: 100 })))
      .toEqual({ kind: 'AI_80', percent: 83, used: 500, capacity: 600, remaining: 100 });
  });
  it('si el plan se redujo y lo gastado supera lo incluido, solo es «lleno» cuando ya no queda nada', () => {
    const s = ai({ included: 500, usedTotal: 800, usedFromPlan: 800, packRemaining: 300, available: 300 });
    expect(planAiAlert(s)?.kind).not.toBe('AI_100');
    expect(planAiAlert({ ...s, packRemaining: 0, available: 0 })?.kind).toBe('AI_100');
  });
});

describe('planStorageAlert — espacio', () => {
  it('por debajo del 80 % no avisa; sin tope tampoco', () => {
    expect(planStorageAlert(7 * GB, 10 * GB)).toBeNull();
    expect(planStorageAlert(100 * GB, null)).toBeNull();
    expect(planStorageAlert(0, 10 * GB)).toBeNull();
  });
  it('al 80 % avisa «cerca» con lo que queda', () => {
    expect(planStorageAlert(8 * GB, 10 * GB)).toEqual({ kind: 'STORAGE_80', percent: 80, used: 8 * GB, capacity: 10 * GB, remaining: 2 * GB });
    expect(planStorageAlert(9.9 * GB, 10 * GB)).toMatchObject({ kind: 'STORAGE_80', percent: 99 });
  });
  it('lleno (100 % o más) avisa «lleno»', () => {
    expect(planStorageAlert(10 * GB, 10 * GB)).toEqual({ kind: 'STORAGE_100', percent: 100, used: 10 * GB, capacity: 10 * GB, remaining: 0 });
    expect(planStorageAlert(12 * GB, 10 * GB)).toMatchObject({ kind: 'STORAGE_100', percent: 100, remaining: 0 });
  });
  it('una capacidad de 0 GB no avisa', () => {
    expect(planStorageAlert(1, 0)).toBeNull();
  });
});

describe('fmtGb', () => {
  it('un decimal como máximo y sin ceros de relleno', () => {
    expect(fmtGb(8 * GB)).toBe('8 GB');
    expect(fmtGb(3.5 * GB)).toBe('3.5 GB');
    expect(fmtGb(0.44 * GB)).toBe('0.4 GB');
    expect(fmtGb(1234 * GB)).toBe('1,234 GB');
  });
});

describe('describeUsageAlert — el texto', () => {
  const ctx = { orgName: 'Despacho Pérez', planName: 'Despacho' };
  const d = (over: Partial<UsageAlertDecision> & Pick<UsageAlertDecision, 'kind'>): UsageAlertDecision => ({ percent: 80, used: 800, capacity: 1000, remaining: 200, ...over });

  it('IA al 80 %: porcentaje, lo gastado, lo que queda y qué pasará al llegar', () => {
    const t = describeUsageAlert(d({ kind: 'AI_80', percent: 83, used: 830, remaining: 170 }), ctx);
    expect(t.subject).toBe('Llevas el 83 % de tus peticiones de IA de este mes');
    expect(t.heading).toBe('Llevas el 83 % de tus peticiones de IA');
    expect(t.paragraphs[0]).toContain('830 de 1,000 peticiones');
    expect(t.paragraphs[0]).toContain('te quedan 170');
    expect(t.paragraphs.join(' ')).toContain('se pausan hasta el próximo mes');
    expect(t.paragraphs.join(' ')).toContain('Despacho Pérez');
    expect(t.level).toBe('warning');
    expect(t.notificationType).toBe('USAGE_AI_80');
  });
  it('IA al 100 %: crítico, dice que está en pausa y cómo se reactiva; nada se borra', () => {
    const t = describeUsageAlert(d({ kind: 'AI_100', percent: 100, used: 1000, remaining: 0 }), ctx);
    expect(t.heading).toBe('Llegaste al límite de peticiones de IA');
    expect(t.paragraphs[0]).toContain('Usaste las 1,000 peticiones');
    expect(t.paragraphs.join(' ')).toContain('en pausa');
    expect(t.paragraphs.join(' ')).toContain('no se borra nada');
    expect(t.level).toBe('critical');
    expect(t.notificationType).toBe('USAGE_AI_100');
  });
  it('espacio al 80 %: GB usados, capacidad y lo que queda; lo guardado no se borra', () => {
    const t = describeUsageAlert(d({ kind: 'STORAGE_80', percent: 85, used: 8.5 * GB, capacity: 10 * GB, remaining: 1.5 * GB }), ctx);
    expect(t.subject).toBe('Usaste el 85 % de tu espacio en AuditMind');
    expect(t.paragraphs[0]).toContain('8.5 GB de 10 GB');
    expect(t.paragraphs[0]).toContain('te quedan 1.5 GB');
    expect(t.paragraphs.join(' ')).toContain('no se borra');
    expect(t.level).toBe('warning');
    expect(t.notificationType).toBe('USAGE_STORAGE_80');
  });
  it('espacio al 100 %: lleno, no se pueden subir archivos nuevos, lo guardado sigue disponible', () => {
    const t = describeUsageAlert(d({ kind: 'STORAGE_100', percent: 100, used: 10 * GB, capacity: 10 * GB, remaining: 0 }), ctx);
    expect(t.heading).toBe('Tu espacio está lleno');
    expect(t.paragraphs[0]).toContain('Usaste los 10 GB');
    expect(t.paragraphs.join(' ')).toContain('No podrás subir archivos nuevos');
    expect(t.paragraphs.join(' ')).toContain('sigue disponible');
    expect(t.level).toBe('critical');
    expect(t.notificationType).toBe('USAGE_STORAGE_100');
  });
  it('no inventa precios ni enlaces de pago; el asunto es una sola línea', () => {
    for (const kind of ['AI_80', 'AI_100', 'STORAGE_80', 'STORAGE_100'] as const) {
      const t = describeUsageAlert(d({ kind }), { orgName: 'X\nY', planName: 'P' });
      expect(t.paragraphs.join(' ')).not.toMatch(/\$|https?:\/\//);
      expect(t.subject).not.toMatch(/[\r\n]/);
    }
  });
});
