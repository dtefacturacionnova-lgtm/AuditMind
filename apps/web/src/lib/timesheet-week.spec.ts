import {
  addDays, buildEntries, buildSingleEntry, buildWeekRows, copyPreviousWeek, dayTotals, emptyMeta, formatHours, isClosedDay, monthOf, monthsOfDays, overCapDays,
  snapHours, toDateKey, weekDays, weekStart, type DraftValues, type RowMeta, type SavedEntryLike, type WeekRow,
} from './timesheet-week';

const rows: WeekRow[] = [
  { key: 'audit:a1', label: 'Auditoría Pérez', category: 'CLIENT_BILLABLE', auditId: 'a1', client: true },
  { key: 'audit:a2', label: 'Auditoría Gómez', category: 'CLIENT_BILLABLE', auditId: 'a2', client: true },
  { key: 'cat:ADMIN', label: 'Administrativo', category: 'ADMIN', client: false },
];
const week = weekDays('2026-10-21'); // miércoles → lunes 19 … domingo 25
const meta = (over: Record<string, Partial<RowMeta>> = {}): Record<string, RowMeta> =>
  Object.fromEntries(Object.entries(over).map(([k, v]) => [k, { ...emptyMeta(), ...v }]));

describe('Semana', () => {
  it('va de lunes a domingo, también cuando la fecha es domingo o lunes', () => {
    expect(week[0]).toBe('2026-10-19');
    expect(week[6]).toBe('2026-10-25');
    expect(weekStart('2026-10-25')).toBe('2026-10-19'); // domingo
    expect(weekStart('2026-10-19')).toBe('2026-10-19'); // lunes
    expect(weekDays('2026-11-01')[0]).toBe('2026-10-26'); // semana que cruza de mes
  });
  it('sumar días cruza meses y años sin desfase', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('toDateKey usa el día local, no el de UTC', () => {
    expect(toDateKey(new Date(2026, 9, 5, 23, 30))).toBe('2026-10-05');
  });
  it('una semana puede tocar dos meses', () => {
    const w = weekDays('2026-10-28');
    expect(monthsOfDays(w).map((m) => `${m.year}-${m.month}`)).toEqual(['2026-10', '2026-11']);
    expect(monthOf('2026-11-02')).toEqual({ year: 2026, month: 11 });
  });
  it('detecta los días de un mes cerrado', () => {
    expect(isClosedDay('2026-09-30', [{ year: 2026, month: 9 }])).toBe(true);
    expect(isClosedDay('2026-10-01', [{ year: 2026, month: 9 }])).toBe(false);
  });
});

describe('Horas', () => {
  it('se redondean al cuarto de hora y nunca bajan de 0,25', () => {
    expect(snapHours('1.1')).toBe(1);
    expect(snapHours('1,4')).toBe(1.5);
    expect(snapHours(0.1)).toBe(0.25);
    expect(snapHours('7.9')).toBe(8);
  });
  it('lo que no es un número positivo se rechaza', () => {
    for (const bad of ['', 'abc', '0', '-2', NaN]) expect(snapHours(bad as any)).toBeNull();
  });
  it('se muestran sin ceros de sobra', () => {
    expect(formatHours(8)).toBe('8h');
    expect(formatHours(1.5)).toBe('1.5h');
    expect(formatHours(0.25)).toBe('0.25h');
  });
});

describe('Del borrador a las horas a guardar', () => {
  const values: DraftValues = { 'audit:a1': { '2026-10-19': '8', '2026-10-20': '4.1' }, 'cat:ADMIN': { '2026-10-19': '1' } };

  it('arma una hora por celda con la descripción de la fila', () => {
    const { entries, errors } = buildEntries(rows, values, meta({ 'audit:a1': { description: 'Pruebas de ventas' } }), [], true);
    expect(errors).toEqual([]);
    expect(entries).toEqual([
      { workDate: '2026-10-19', hours: 8, category: 'CLIENT_BILLABLE', description: 'Pruebas de ventas', auditId: 'a1' },
      { workDate: '2026-10-20', hours: 4, category: 'CLIENT_BILLABLE', description: 'Pruebas de ventas', auditId: 'a1' },
      { workDate: '2026-10-19', hours: 1, category: 'ADMIN' },
    ]);
  });

  it('con el cierre activo, las horas de cliente piden descripción; las demás no', () => {
    const r = buildEntries(rows, values, meta({ 'audit:a1': { description: 'corta' } }), [], true);
    expect(r.errors).toEqual([]);
    const bad = buildEntries(rows, values, meta({ 'audit:a1': { description: 'ab' } }), [], true);
    expect(bad.errors).toEqual([expect.stringContaining('descripción')]);
    expect(buildEntries(rows, values, meta(), [], false).errors).toEqual([]); // sin cierre activo no se exige
  });

  it('una fila no facturable pide su motivo y lo manda', () => {
    const noReason = buildEntries(rows, values, meta({ 'audit:a1': { description: 'Retrabajo de papeles', billable: false } }), [], true);
    expect(noReason.errors).toEqual([expect.stringContaining('por qué no se factura')]);
    const ok = buildEntries(rows, values, meta({ 'audit:a1': { description: 'Retrabajo de papeles', billable: false, reason: 'REWORK' } }), [], true);
    expect(ok.errors).toEqual([]);
    expect(ok.entries[0]).toMatchObject({ category: 'CLIENT_NON_BILLABLE', nonBillableReason: 'REWORK' });
    expect(ok.entries.find((e) => e.category === 'ADMIN')).not.toHaveProperty('nonBillableReason');
  });

  it('los días de un mes cerrado no se guardan y avisan', () => {
    const v: DraftValues = { 'audit:a1': { '2026-09-30': '2', '2026-10-01': '3' } };
    const r = buildEntries(rows, v, meta({ 'audit:a1': { description: 'Visita al cliente' } }), [{ year: 2026, month: 9 }], true);
    expect(r.entries.map((e) => e.workDate)).toEqual(['2026-10-01']);
    expect(r.errors).toEqual([expect.stringContaining('cerrado')]);
  });

  it('celdas vacías, en blanco o inválidas', () => {
    const v: DraftValues = { 'audit:a1': { '2026-10-19': '  ', '2026-10-20': 'x', '2026-10-21': '25' } };
    const r = buildEntries(rows, v, meta({ 'audit:a1': { description: 'Pruebas de ventas' } }), [], true);
    expect(r.entries).toEqual([]);
    expect(r.errors).toHaveLength(2); // 'x' inválida y 25 h supera el máximo; la celda en blanco se ignora
  });
});

describe('Tope diario', () => {
  it('suma lo guardado y el borrador de cada día', () => {
    const t = dayTotals(week, [{ workDate: '2026-10-19T00:00:00.000Z', hours: 12 }], [
      { workDate: '2026-10-19', hours: 9, category: 'CLIENT_BILLABLE' },
      { workDate: '2026-10-20', hours: 3, category: 'ADMIN' },
    ]);
    expect(t['2026-10-19']).toEqual({ saved: 12, draft: 9, total: 21 });
    expect(t['2026-10-20'].total).toBe(3);
    expect(overCapDays(t)).toEqual(['2026-10-19']);
  });
});

describe('Copiar la semana anterior', () => {
  const prev: SavedEntryLike[] = [
    { workDate: '2026-10-12T00:00:00.000Z', hours: 8, category: 'CLIENT_BILLABLE', description: 'Pruebas de ventas', auditId: 'a1' },
    { workDate: '2026-10-13T00:00:00.000Z', hours: 4, category: 'CLIENT_NON_BILLABLE', description: 'Rehacer papel', auditId: 'a1', nonBillableReason: 'REWORK' },
    { workDate: '2026-10-14T00:00:00.000Z', hours: 2, category: 'ADMIN' },
    { workDate: '2026-10-15T00:00:00.000Z', hours: 6, category: 'CLIENT_BILLABLE', auditId: 'a-que-ya-no-tengo' },
  ];

  it('pasa cada hora al mismo día de esta semana, con su descripción y su motivo', () => {
    const r = copyPreviousWeek(prev, rows, week, [], []);
    expect(r.values['audit:a1']).toEqual({ '2026-10-19': '8', '2026-10-20': '4' });
    expect(r.values['cat:ADMIN']).toEqual({ '2026-10-21': '2' });
    expect(r.meta['audit:a1']).toMatchObject({ description: 'Pruebas de ventas', billable: false, reason: 'REWORK' });
    expect(r).toMatchObject({ copied: 3, skipped: 1 }); // el encargo que ya no tengo asignado se salta
  });

  it('no pisa lo ya guardado ni entra a un mes cerrado', () => {
    const saved: SavedEntryLike[] = [{ workDate: '2026-10-19T00:00:00.000Z', hours: 1, category: 'CLIENT_BILLABLE', auditId: 'a1' }];
    const r = copyPreviousWeek(prev, rows, week, saved, []);
    expect(r.values['audit:a1']).toEqual({ '2026-10-20': '4' });
    const closed = copyPreviousWeek(prev, rows, week, [], [{ year: 2026, month: 10 }]);
    expect(closed.copied).toBe(0);
  });
});

describe('Una sola hora (edición y ajustes)', () => {
  const form = (over: Record<string, unknown> = {}) => ({
    workDate: '2026-09-15', hours: '3', rowKey: 'audit:a1', description: 'Visita al cliente', billable: true, reason: '' as const, ...over,
  });
  it('arma la hora del servidor con encargo, descripción y categoría', () => {
    expect(buildSingleEntry(form(), rows, true).entry).toEqual({
      workDate: '2026-09-15', hours: 3, category: 'CLIENT_BILLABLE', description: 'Visita al cliente', auditId: 'a1',
    });
  });
  it('una actividad que no es de cliente no lleva descripción obligatoria ni encargo', () => {
    expect(buildSingleEntry(form({ rowKey: 'cat:ADMIN', description: '' }), rows, true).entry).toEqual({
      workDate: '2026-09-15', hours: 3, category: 'ADMIN',
    });
  });
  it('rechaza lo incompleto con un mensaje claro', () => {
    expect(buildSingleEntry(form({ rowKey: 'x' }), rows, true).error).toMatch(/encargo/);
    expect(buildSingleEntry(form({ hours: 'abc' }), rows, true).error).toMatch(/horas/);
    expect(buildSingleEntry(form({ hours: '30' }), rows, true).error).toMatch(/20h/);
    expect(buildSingleEntry(form({ workDate: '' }), rows, true).error).toMatch(/fecha/);
    expect(buildSingleEntry(form({ description: 'ab' }), rows, true).error).toMatch(/descripción/);
    expect(buildSingleEntry(form({ billable: false }), rows, true).error).toMatch(/por qué/);
  });
  it('no facturable lleva su motivo', () => {
    expect(buildSingleEntry(form({ billable: false, reason: 'COURTESY' }), rows, true).entry)
      .toMatchObject({ category: 'CLIENT_NON_BILLABLE', nonBillableReason: 'COURTESY' });
  });
  it('arma las filas: encargos primero y luego las categorías', () => {
    const built = buildWeekRows([{ audit: { id: 'a9', title: 'Auditoría X' } }], [{ category: 'ADMIN', label: 'Administrativo' }]);
    expect(built.map((r) => [r.key, r.client])).toEqual([['audit:a9', true], ['cat:ADMIN', false]]);
  });
});
