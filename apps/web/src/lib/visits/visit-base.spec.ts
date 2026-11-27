import {
  balanceTotals, buildS1FromVisit, classificationDiffersFromS1, cutoffsProblem, defaultCutoffs, fmtDay, s1DiffersFromVisit, statusActions,
  toVisitAccounts, S1Row,
} from './visit-base';

const row = (cuenta: string, saldo_actual: number, extra: Partial<S1Row> = {}): S1Row => ({
  cuenta, descripcion: `Cuenta ${cuenta}`, saldo_actual, saldo_anterior: 0, saldo_anterior2: 0, ...extra,
});
const acc = (code: string, balance: number, name = `Visita ${code}`) => ({ code, name, balance });

describe('buildS1FromVisit', () => {
  it('pone el saldo de la visita y conserva históricos y descripciones', () => {
    const s1 = [row('1101', 100, { saldo_anterior: 80, saldo_anterior2: 60, descripcion: 'Caja general' })];
    const { rows, stats } = buildS1FromVisit(s1, [acc('1101', 250.5)]);
    expect(rows).toEqual([{ cuenta: '1101', descripcion: 'Caja general', saldo_actual: 250.5, saldo_anterior: 80, saldo_anterior2: 60 }]);
    expect(stats).toEqual({ updated: 1, added: 0, zeroed: 0 });
  });

  it('usa el nombre de la visita solo si S1 no tenía descripción', () => {
    const { rows } = buildS1FromVisit([row('1101', 0, { descripcion: '  ' })], [acc('1101', 5, 'Caja')]);
    expect(rows[0].descripcion).toBe('Caja');
  });

  it('una cuenta de S1 que la visita no trae queda en cero pero NO se borra (conserva su histórico)', () => {
    const s1 = [row('1101', 100), row('5101', 40, { saldo_anterior: 30 }), row('5102', 0)];
    const { rows, stats } = buildS1FromVisit(s1, [acc('1101', 120)]);
    expect(rows.map((r) => [r.cuenta, r.saldo_actual, r.saldo_anterior])).toEqual([['1101', 120, 0], ['5101', 0, 30], ['5102', 0, 0]]);
    // Solo cuenta como «en cero» la que tenía saldo: la 5102 ya estaba en cero.
    expect(stats).toEqual({ updated: 1, added: 0, zeroed: 1 });
  });

  it('las cuentas nuevas de la visita se agregan al final con histórico en cero', () => {
    const { rows, stats } = buildS1FromVisit([row('1101', 1)], [acc('1101', 2), acc('1201', 7, 'Clientes')]);
    expect(rows[1]).toEqual({ cuenta: '1201', descripcion: 'Clientes', saldo_actual: 7, saldo_anterior: 0, saldo_anterior2: 0 });
    expect(stats.added).toBe(1);
  });

  it('un código repetido en S1 recibe el saldo una sola vez (no se duplica)', () => {
    const { rows } = buildS1FromVisit([row('1101', 1), row('1101', 1)], [acc('1101', 500)]);
    expect(rows.map((r) => r.saldo_actual)).toEqual([500, 0]);
    expect(rows.reduce((s, r) => s + r.saldo_actual, 0)).toBe(500);
  });

  it('empareja por código aunque tenga espacios y no muta lo recibido', () => {
    const s1 = [row(' 1101 ', 1)];
    const copia = JSON.parse(JSON.stringify(s1));
    const { rows } = buildS1FromVisit(s1, [acc('1101', 9)]);
    expect(rows[0].saldo_actual).toBe(9);
    expect(s1).toEqual(copia);
  });

  it('S1 vacío: crea todas las cuentas desde la visita', () => {
    const { rows, stats } = buildS1FromVisit([], [acc('1', 1), acc('2', -1)]);
    expect(rows).toHaveLength(2);
    expect(stats).toEqual({ updated: 0, added: 2, zeroed: 0 });
  });
});

describe('s1DiffersFromVisit / classificationDiffersFromS1', () => {
  it('0 cuando S1 ya está sobre la visita (aunque falten cuentas en cero o cambie el orden)', () => {
    const s1 = [row('2101', -50), row('1101', 50), row('4101', 0)];
    expect(s1DiffersFromVisit(s1, [acc('1101', 50), acc('2101', -50)])).toBe(0);
  });

  it('cuenta las cuentas con saldo distinto, las que faltan de un lado y los centavos', () => {
    const s1 = [row('1101', 50), row('2101', -50.01), row('3101', 7)];
    expect(s1DiffersFromVisit(s1, [acc('1101', 50), acc('2101', -50), acc('4101', 3)])).toBe(3);
  });

  it('compara en centavos redondeados: 0.29 y 0.1 + 0.19 son el mismo saldo', () => {
    expect(0.29 * 100).toBeLessThan(29); // el error de decimales que un truncado convertiría en diferencia
    expect(s1DiffersFromVisit([row('1101', 0.29)], [acc('1101', 0.1 + 0.19)])).toBe(0);
  });

  it('suma los códigos repetidos antes de comparar', () => {
    expect(s1DiffersFromVisit([row('1101', 30), row('1101', 20)], [acc('1101', 50)])).toBe(0);
  });

  it('la clasificación está vieja si algún saldo de S2 ya no es el de S1', () => {
    const s1 = [row('1101', 80), row('2101', -80)];
    expect(classificationDiffersFromS1(s1, [{ cuenta: '1101', saldo_actual: 80 }, { cuenta: '2101', saldo_actual: -80 }])).toBe(0);
    expect(classificationDiffersFromS1(s1, [{ cuenta: '1101', saldo_actual: 50 }, { cuenta: '2101', saldo_actual: -80 }])).toBe(1);
    expect(classificationDiffersFromS1(s1, [])).toBe(2);
  });
});

describe('toVisitAccounts / balanceTotals', () => {
  it('reparte el saldo neto en débito y crédito y un balance que cuadra suma igual', () => {
    const out = toVisitAccounts([
      { cuenta: ' 1101 ', descripcion: ' Caja ', saldo_actual: 1000.005 },
      { cuenta: '2101', descripcion: 'Proveedores', saldo_actual: -1000 },
      { cuenta: '4101', descripcion: 'Ventas', saldo_actual: 0 },
    ]);
    expect(out[0]).toMatchObject({ code: '1101', name: 'Caja', debit: 1000.01, credit: 0, balance: 1000.01 });
    expect(out[1]).toMatchObject({ debit: 0, credit: 1000, balance: -1000 });
    expect(out[2]).toMatchObject({ debit: 0, credit: 0, balance: 0 });
    const t = balanceTotals(out);
    expect(t).toMatchObject({ totalDebit: 1000.01, totalCredit: 1000 });
    expect(t.balanced).toBe(false);
  });

  it('un balance exacto cuadra y los textos largos se recortan a lo que acepta la API', () => {
    const out = toVisitAccounts([
      { cuenta: 'x'.repeat(80), descripcion: 'n'.repeat(400), saldo_actual: 10 },
      { cuenta: '2', descripcion: '', saldo_actual: -10 },
    ]);
    expect(out[0].code).toHaveLength(60);
    expect(out[0].name).toHaveLength(300);
    expect(balanceTotals(out).balanced).toBe(true);
  });
});

describe('fechas y estados', () => {
  it('propone marzo, septiembre y diciembre', () => {
    expect(defaultCutoffs(2026)).toEqual({ planning: '2026-03-31', interim: '2026-09-30', final: '2026-12-31' });
  });

  it('valida que las fechas existan y vayan en orden estricto', () => {
    const ok = defaultCutoffs(2026);
    expect(cutoffsProblem(ok)).toBeNull();
    expect(cutoffsProblem({ ...ok, interim: '' })).toMatch(/completas/);
    expect(cutoffsProblem({ ...ok, interim: '2026-02-30' })).toMatch(/completas/);
    expect(cutoffsProblem({ ...ok, interim: '2026-03-31' })).toMatch(/orden/);
    expect(cutoffsProblem({ ...ok, final: '2026-09-30' })).toMatch(/orden/);
    expect(cutoffsProblem({ planning: '2026-10-01', interim: '2026-09-30', final: '2026-12-31' })).toMatch(/orden/);
  });

  it('ofrece los cambios de estado que corresponden', () => {
    expect(statusActions('PLANNED').map((a) => a.to)).toEqual(['IN_PROGRESS', 'CLOSED']);
    expect(statusActions('IN_PROGRESS').map((a) => a.to)).toEqual(['CLOSED']);
    expect(statusActions('CLOSED').map((a) => [a.to, a.label])).toEqual([['IN_PROGRESS', 'Reabrir']]);
  });

  it('formatea el día sin corrimiento de zona horaria', () => {
    expect(fmtDay('2026-09-30')).toBe('30/09/2026');
    expect(fmtDay('2026-01-01T00:00:00.000Z')).toBe('01/01/2026');
    expect(fmtDay(null)).toBe('—');
  });
});
