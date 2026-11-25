import {
  accountNature, annualizationFactor, buildBridge, compareBalances, currentBalance, defaultAnalysisBase,
  normalizeAccounts, toCents, validateVisitCutoffs,
} from './visit-rules';

const acc = (code: string, balance: number, name = '') => ({ code, name, balance });

describe('validateVisitCutoffs (orden de las 3 visitas)', () => {
  it('acepta planificación < interina < final', () => {
    expect(validateVisitCutoffs([
      { kind: 'PLANNING', cutoffDate: '2026-03-31' }, { kind: 'INTERIM', cutoffDate: '2026-09-30' }, { kind: 'FINAL', cutoffDate: '2026-12-31' },
    ])).toEqual([]);
  });
  it('acepta solo interina y final, sin importar el orden en que lleguen', () => {
    expect(validateVisitCutoffs([{ kind: 'FINAL', cutoffDate: '2026-12-31' }, { kind: 'INTERIM', cutoffDate: '2026-09-30' }])).toEqual([]);
  });
  it('rechaza una interina posterior a la final', () => {
    const r = validateVisitCutoffs([{ kind: 'INTERIM', cutoffDate: '2027-01-15' }, { kind: 'FINAL', cutoffDate: '2026-12-31' }]);
    expect(r.map((i) => i.code)).toEqual(['ORDEN_FECHAS']);
    expect(r[0].message).toContain('FINAL');
  });
  it('rechaza dos visitas con la misma fecha de corte (el orden es estricto)', () => {
    expect(validateVisitCutoffs([{ kind: 'INTERIM', cutoffDate: '2026-09-30' }, { kind: 'FINAL', cutoffDate: '2026-09-30' }]).map((i) => i.code)).toEqual(['ORDEN_FECHAS']);
  });
  it('rechaza planificación posterior a la final aunque la interina esté bien', () => {
    const r = validateVisitCutoffs([
      { kind: 'PLANNING', cutoffDate: '2026-12-31' }, { kind: 'INTERIM', cutoffDate: '2026-09-30' }, { kind: 'FINAL', cutoffDate: '2026-12-31' },
    ]);
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((i) => i.code === 'ORDEN_FECHAS')).toBe(true);
  });
  it('rechaza un tipo de visita repetido y una fecha inválida', () => {
    expect(validateVisitCutoffs([{ kind: 'INTERIM', cutoffDate: '2026-06-30' }, { kind: 'INTERIM', cutoffDate: '2026-09-30' }]).map((i) => i.code)).toEqual(['VISITA_REPETIDA']);
    expect(validateVisitCutoffs([{ kind: 'FINAL', cutoffDate: 'no-es-fecha' }]).map((i) => i.code)).toEqual(['FECHA_INVALIDA']);
  });
  it('una sola visita siempre es válida', () => {
    expect(validateVisitCutoffs([{ kind: 'FINAL', cutoffDate: '2026-12-31' }])).toEqual([]);
    expect(validateVisitCutoffs([])).toEqual([]);
  });
});

describe('currentBalance y defaultAnalysisBase', () => {
  it('la carga vigente de una visita es la más reciente', () => {
    const r = currentBalance([
      { importedAt: '2026-10-01T10:00:00Z', data: 'vieja' }, { importedAt: '2026-10-05T10:00:00Z', data: 'nueva' }, { importedAt: '2026-10-03T10:00:00Z', data: 'media' },
    ]);
    expect(r?.data).toBe('nueva');
  });
  it('sin cargas no hay balance vigente', () => { expect(currentBalance([])).toBeNull(); });

  const v = (kind: 'PLANNING' | 'INTERIM' | 'FINAL', cutoffDate: string, hasBalance: boolean) => ({ kind, cutoffDate, hasBalance });
  it('por defecto la base es la final si ya tiene balance', () => {
    expect(defaultAnalysisBase([v('PLANNING', '2026-03-31', true), v('INTERIM', '2026-09-30', true), v('FINAL', '2026-12-31', true)])).toBe('FINAL');
  });
  it('si la final aún no tiene balance, la última cargada por fecha de corte', () => {
    expect(defaultAnalysisBase([v('PLANNING', '2026-03-31', true), v('INTERIM', '2026-09-30', true), v('FINAL', '2026-12-31', false)])).toBe('INTERIM');
    expect(defaultAnalysisBase([v('PLANNING', '2026-03-31', true), v('INTERIM', '2026-09-30', false), v('FINAL', '2026-12-31', false)])).toBe('PLANNING');
  });
  it('ninguna con balance → no hay base', () => {
    expect(defaultAnalysisBase([v('INTERIM', '2026-09-30', false), v('FINAL', '2026-12-31', false)])).toBeNull();
    expect(defaultAnalysisBase([])).toBeNull();
  });
});

describe('accountNature', () => {
  it.each([['1101', 'BALANCE'], ['2105', 'BALANCE'], ['3101', 'BALANCE'], ['4101', 'RESULTADOS'], ['5101', 'RESULTADOS'], ['6101', 'RESULTADOS'],
    ['7101', 'RESULTADOS'], ['8101', 'SIN_CLASIFICAR'], ['9101', 'SIN_CLASIFICAR'], ['0101', 'SIN_CLASIFICAR'], ['ABC', 'SIN_CLASIFICAR'], ['', 'SIN_CLASIFICAR'], ['  4101', 'RESULTADOS']])(
    '%s → %s', (code, nature) => { expect(accountNature(code)).toBe(nature); });
});

describe('normalizeAccounts', () => {
  it('usa balance si viene; si no, débito − crédito', () => {
    const m = normalizeAccounts([{ code: '1101', balance: 50 }, { code: '1102', debit: 100, credit: 30 }, { code: '1103', debit: 10 }]);
    expect(m.get('1101')!.balanceCents).toBe(5000);
    expect(m.get('1102')!.balanceCents).toBe(7000);
    expect(m.get('1103')!.balanceCents).toBe(1000);
  });
  it('balance en cero prevalece sobre débito/crédito (no lo recalcula)', () => {
    expect(normalizeAccounts([{ code: '1101', balance: 0, debit: 100, credit: 30 }]).get('1101')!.balanceCents).toBe(0);
  });
  it('suma cuentas repetidas, ignora códigos vacíos y valores no numéricos', () => {
    const m = normalizeAccounts([{ code: ' 1101 ', balance: 10, name: '' }, { code: '1101', balance: 5.5, name: 'Caja' }, { code: '', balance: 99 }, { code: '1102', balance: NaN }]);
    expect(m.size).toBe(2);
    expect(m.get('1101')).toEqual({ code: '1101', name: 'Caja', balanceCents: 1550 });
    expect(m.get('1102')!.balanceCents).toBe(0);
  });
  it('trabaja en centavos: 0.1 + 0.2 suma exactamente 0.30', () => {
    expect(normalizeAccounts([{ code: '1101', balance: 0.1 }, { code: '1101', balance: 0.2 }]).get('1101')!.balanceCents).toBe(toCents(0.3));
  });
});

describe('compareBalances', () => {
  const from = [acc('1101', 100, 'Caja'), acc('1102', 200, 'Bancos'), acc('1103', 50, 'CxC'), acc('1104', 0, 'Otros'), acc('2101', 300, 'Proveedores')];
  const to = [acc('1101', 150, 'Caja'), acc('1102', 200, 'Bancos'), acc('1103', 0, 'CxC'), acc('1104', 0, 'Otros'), acc('1105', 70, 'Nueva')];
  const r = compareBalances(from, to);
  const by = (code: string) => r.rows.find((x) => x.code === code)!;

  it('clasifica cada cuenta', () => {
    expect(by('1101').status).toBe('CAMBIO');
    expect(by('1102').status).toBe('SIN_CAMBIO');
    expect(by('1103').status).toBe('EN_CERO');
    expect(by('1104').status).toBe('SIN_CAMBIO'); // ya estaba en cero y sigue en cero
    expect(by('1105').status).toBe('NUEVA');
    expect(by('2101').status).toBe('DESAPARECIDA');
    expect(r.summary).toEqual({ NUEVA: 1, DESAPARECIDA: 1, EN_CERO: 1, CAMBIO: 1, SIN_CAMBIO: 2 });
  });
  it('calcula variación en $ y en % con signo', () => {
    expect(by('1101')).toMatchObject({ delta: 50, deltaPct: 50, fromBalance: 100, toBalance: 150 });
    expect(by('1103')).toMatchObject({ delta: -50, deltaPct: -100 });
    expect(by('1102')).toMatchObject({ delta: 0, deltaPct: 0 });
  });
  it('el porcentaje es null si no hay base (cuenta nueva o saldo origen 0); una desaparecida baja 100%', () => {
    expect(by('1105').deltaPct).toBeNull();
    expect(by('1105')).toMatchObject({ fromBalance: null, toBalance: 70, delta: 70 });
    expect(by('2101')).toMatchObject({ fromBalance: 300, toBalance: null, delta: -300, deltaPct: -100 });
    expect(compareBalances([acc('1101', 0)], [acc('1101', 10)]).rows[0].deltaPct).toBeNull();
  });
  it('un saldo que cambia de signo es un cambio, no «sin cambio»', () => {
    expect(compareBalances([acc('1101', 100)], [acc('1101', -100)]).rows[0]).toMatchObject({ status: 'CAMBIO', delta: -200, deltaPct: -200 });
  });
  it('el % se calcula sobre el valor absoluto de la base (saldos acreedores negativos)', () => {
    expect(compareBalances([acc('2101', -100)], [acc('2101', -150)]).rows[0]).toMatchObject({ delta: -50, deltaPct: -50 });
    expect(compareBalances([acc('2101', -100)], [acc('2101', -50)]).rows[0]).toMatchObject({ delta: 50, deltaPct: 50 });
  });
  it('ordena por código numéricamente (1101 antes que 11010) y no pierde cuentas', () => {
    const res = compareBalances([acc('11010', 1), acc('1101', 1), acc('2', 1)], []);
    expect(res.rows.map((x) => x.code)).toEqual(['2', '1101', '11010']);
  });
  it('balances vacíos', () => {
    expect(compareBalances([], [])).toEqual({ rows: [], summary: { NUEVA: 0, DESAPARECIDA: 0, EN_CERO: 0, CAMBIO: 0, SIN_CAMBIO: 0 } });
  });
});

describe('annualizationFactor', () => {
  it('a mitad del año calendario el factor es ~2', () => {
    // 2026 tiene 365 días; al 30/06 pasaron 181 → 365/181
    expect(annualizationFactor('2026-06-30')).toBeCloseTo(365 / 181, 10);
  });
  it('al cierre del ejercicio el factor es 1', () => { expect(annualizationFactor('2026-12-31')).toBe(1); });
  it('respeta un ejercicio que no es el año calendario', () => {
    // 1/jul/2025 – 30/jun/2026 = 365 días; al 31/dic/2025 pasaron 184
    expect(annualizationFactor('2025-12-31', '2025-07-01', '2026-06-30')).toBeCloseTo(365 / 184, 10);
  });
  it('año bisiesto usa 366 días', () => { expect(annualizationFactor('2028-12-31')).toBe(1); expect(annualizationFactor('2028-06-30')).toBeCloseTo(366 / 182, 10); });
  it('null si el corte cae fuera del ejercicio, el período es inválido o la fecha no existe', () => {
    expect(annualizationFactor('2027-01-05', '2026-01-01', '2026-12-31')).toBeNull();
    expect(annualizationFactor('2025-12-31', '2026-01-01', '2026-12-31')).toBeNull();
    expect(annualizationFactor('2026-06-30', '2026-12-31', '2026-01-01')).toBeNull();
    expect(annualizationFactor('basura')).toBeNull();
  });
  it('el primer día del ejercicio cuenta como un día transcurrido (no divide por cero)', () => {
    expect(annualizationFactor('2026-01-01')).toBe(365);
  });
});

describe('buildBridge', () => {
  const base = { interimCutoff: '2026-06-30', periodStart: '2026-01-01', periodEnd: '2026-12-31', executionMateriality: 1000 };
  const f = 365 / 181;
  const row = (r: ReturnType<typeof buildBridge>, code: string) => r.rows.find((x) => x.code === code)!;

  it('cuentas de balance: alerta si el movimiento supera la materialidad de ejecución (estrictamente)', () => {
    const r = buildBridge({ ...base, interim: [acc('1101', 5000), acc('1102', 5000), acc('2101', -5000)], final: [acc('1101', 6001), acc('1102', 6000), acc('2101', -3999)] });
    expect(row(r, '1101')).toMatchObject({ movement: 1001, alert: true, reason: 'MOVIMIENTO_SOBRE_ME' });
    expect(row(r, '1102')).toMatchObject({ movement: 1000, alert: false, reason: null }); // justo en el umbral: no alerta
    expect(row(r, '2101')).toMatchObject({ movement: 1001, alert: true }); // el signo no importa
    expect(row(r, '1101').expectedFinal).toBeNull();
    expect(row(r, '1101').suggestedStep).toContain('1101');
    expect(row(r, '1102').suggestedStep).toBeNull();
  });

  it('cuentas de resultados: se anualiza la interina y se compara con el final', () => {
    const interim = [acc('4101', 100000, 'Ventas')];
    const expected = Math.round(100000 * f * 100) / 100;
    const r = buildBridge({ ...base, interim, final: [acc('4101', expected)] });
    expect(row(r, '4101').expectedFinal).toBeCloseTo(expected, 2);
    expect(row(r, '4101')).toMatchObject({ deviation: 0, alert: false });
    expect(r.annualizationFactor).toBeCloseTo(f, 10);
  });

  it('resultados: exige superar la ME y ADEMÁS el porcentaje (20% por defecto)', () => {
    const exp = 100000 * f; // ~201 657
    // desvío 10% (> ME, < 20%) → no alerta
    expect(row(buildBridge({ ...base, interim: [acc('4101', 100000)], final: [acc('4101', exp * 1.1)] }), '4101').alert).toBe(false);
    // desvío 25% (> ME, > 20%) → alerta
    const hi = row(buildBridge({ ...base, interim: [acc('4101', 100000)], final: [acc('4101', exp * 1.25)] }), '4101');
    expect(hi).toMatchObject({ alert: true, reason: 'DESVIO_SOBRE_ESPERADO' });
    expect(hi.deviationPct).toBeCloseTo(25, 1);
    // desvío 50% pero por debajo de la ME → no alerta
    expect(row(buildBridge({ ...base, interim: [acc('4101', 100)], final: [acc('4101', 100 * f * 1.5)] }), '4101').alert).toBe(false);
    // el umbral porcentual es configurable
    expect(row(buildBridge({ ...base, pctThreshold: 5, interim: [acc('4101', 100000)], final: [acc('4101', exp * 1.1)] }), '4101').alert).toBe(true);
    // también alerta cuando el resultado cae (desvío negativo)
    expect(row(buildBridge({ ...base, interim: [acc('4101', 100000)], final: [acc('4101', exp * 0.7)] }), '4101')).toMatchObject({ alert: true });
  });

  it('resultados: el umbral porcentual es inclusivo (justo 20% alerta, 19.5% no)', () => {
    // ejercicio de 10 días con corte al 5.º día → factor exacto 2, sin redondeos
    const p = { interimCutoff: '2026-01-05', periodStart: '2026-01-01', periodEnd: '2026-01-10', executionMateriality: 1000 };
    expect(buildBridge({ ...p, interim: [acc('4101', 10000)], final: [acc('4101', 24000)] }).rows[0]).toMatchObject({ expectedFinal: 20000, deviation: 4000, deviationPct: 20, alert: true });
    expect(buildBridge({ ...p, interim: [acc('4101', 10000)], final: [acc('4101', 23900)] }).rows[0]).toMatchObject({ deviationPct: 19.5, alert: false });
  });

  it('el signo del movimiento no importa: una baja también alerta; una cuenta acreedora nueva también', () => {
    const r = buildBridge({ ...base, interim: [acc('1103', 8000)], final: [acc('1103', 5000), acc('2301', -7000)] });
    expect(row(r, '1103')).toMatchObject({ movement: -3000, alert: true, reason: 'MOVIMIENTO_SOBRE_ME' });
    expect(row(r, '2301')).toMatchObject({ presence: 'SOLO_FINAL', alert: true, reason: 'CUENTA_NUEVA_MATERIAL' });
    expect(row(buildBridge({ ...base, interim: [acc('2301', -7000)], final: [] }), '2301')).toMatchObject({ alert: true, reason: 'CUENTA_DESAPARECIDA_MATERIAL' });
  });

  it('resultados: un desvío justo igual a la materialidad no alerta aunque el % sea alto', () => {
    const p = { interimCutoff: '2026-01-05', periodStart: '2026-01-01', periodEnd: '2026-01-10' };
    expect(buildBridge({ ...p, executionMateriality: 4000, interim: [acc('4101', 10000)], final: [acc('4101', 24000)] }).rows[0]).toMatchObject({ deviation: 4000, alert: false });
    expect(buildBridge({ ...p, executionMateriality: 3999.99, interim: [acc('4101', 10000)], final: [acc('4101', 24000)] }).rows[0].alert).toBe(true);
  });

  it('una materialidad infinita no sirve: se trata como ausente y se avisa', () => {
    const r = buildBridge({ ...base, executionMateriality: Infinity, interim: [acc('1101', 0)], final: [acc('1101', 1e9)] });
    expect(r.warnings).toContain('SIN_MATERIALIDAD');
    expect(r.alerts).toBe(0);
  });

  it('cuenta nueva o desaparecida con saldo justo en la materialidad no alerta', () => {
    const r = buildBridge({ ...base, interim: [acc('1201', 1000)], final: [acc('1301', 1000)] });
    expect(row(r, '1201').alert).toBe(false);
    expect(row(r, '1301').alert).toBe(false);
    const r2 = buildBridge({ ...base, interim: [acc('1201', 1000.01)], final: [acc('1301', 1000.01)] });
    expect(row(r2, '1201').alert).toBe(true);
    expect(row(r2, '1301').alert).toBe(true);
  });

  it('resultados con esperado cero: alerta con superar la ME (el % no se puede calcular)', () => {
    const r = buildBridge({ ...base, interim: [acc('4101', 0)], final: [acc('4101', 5000)] });
    expect(row(r, '4101')).toMatchObject({ expectedFinal: 0, deviationPct: null, alert: true, reason: 'DESVIO_SOBRE_ESPERADO' });
    expect(row(buildBridge({ ...base, interim: [acc('4101', 0)], final: [acc('4101', 500)] }), '4101').alert).toBe(false);
  });

  it('cuenta presente en una sola visita: se lista aparte y alerta solo si su saldo es material', () => {
    const r = buildBridge({ ...base, interim: [acc('1201', 9000), acc('1202', 100)], final: [acc('1301', 7000), acc('1302', 100)] });
    expect(row(r, '1201')).toMatchObject({ presence: 'SOLO_INTERINA', finalBalance: null, movement: -9000, alert: true, reason: 'CUENTA_DESAPARECIDA_MATERIAL' });
    expect(row(r, '1202')).toMatchObject({ presence: 'SOLO_INTERINA', alert: false });
    expect(row(r, '1301')).toMatchObject({ presence: 'SOLO_FINAL', interimBalance: null, movement: 7000, alert: true, reason: 'CUENTA_NUEVA_MATERIAL' });
    expect(row(r, '1302')).toMatchObject({ presence: 'SOLO_FINAL', alert: false });
    expect(row(r, '1301').suggestedStep).toContain('no existía en la interina');
    expect(row(r, '1201').suggestedStep).toContain('ya no figura al cierre');
  });

  it('cuenta de resultados que solo existe en una visita no se proyecta', () => {
    const r = buildBridge({ ...base, interim: [acc('4101', 100)], final: [acc('4102', 100)] });
    expect(row(r, '4101').expectedFinal).toBeNull();
    expect(row(r, '4102').expectedFinal).toBeNull();
  });

  it('cuenta sin clasificar: compara movimiento, no proyecta', () => {
    const r = buildBridge({ ...base, interim: [acc('9001', 100)], final: [acc('9001', 5000)] });
    expect(row(r, '9001')).toMatchObject({ nature: 'SIN_CLASIFICAR', expectedFinal: null, movement: 4900, alert: true, reason: 'MOVIMIENTO_SOBRE_ME' });
  });

  it('sin materialidad válida: calcula todo, no alerta y avisa', () => {
    for (const me of [undefined, null, 0, -5, NaN]) {
      const r = buildBridge({ ...base, executionMateriality: me as number | null | undefined, interim: [acc('1101', 100)], final: [acc('1101', 99999)] });
      expect(r.warnings).toContain('SIN_MATERIALIDAD');
      expect(r.alerts).toBe(0);
      expect(row(r, '1101').movement).toBe(99899);
    }
  });

  it('período inválido: no anualiza, avisa, y las cuentas de resultados caen a comparar movimiento', () => {
    const r = buildBridge({ ...base, periodStart: '2026-12-31', periodEnd: '2026-01-01', interim: [acc('4101', 100)], final: [acc('4101', 9000)] });
    expect(r.warnings).toContain('PERIODO_INVALIDO');
    expect(r.annualizationFactor).toBeNull();
    expect(row(r, '4101')).toMatchObject({ expectedFinal: null, alert: true, reason: 'MOVIMIENTO_SOBRE_ME' });
  });

  it('cuenta el total de alertas y ordena por código', () => {
    const r = buildBridge({ ...base, interim: [acc('2101', 0), acc('1101', 0)], final: [acc('2101', 5000), acc('1101', 5000)] });
    expect(r.rows.map((x) => x.code)).toEqual(['1101', '2101']);
    expect(r.alerts).toBe(2);
  });

  it('es determinista y no modifica sus entradas', () => {
    const interim = [acc('1101', 100)]; const final = [acc('1101', 5000)];
    const snapshot = JSON.stringify({ interim, final });
    const a = buildBridge({ ...base, interim, final }); const b = buildBridge({ ...base, interim, final });
    expect(a).toEqual(b);
    expect(JSON.stringify({ interim, final })).toBe(snapshot);
  });
});
