import { ProgramEngagementInput, buildProgram, engagementHours, yearShare } from './engagement-program.util';

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const eng = (o: Partial<ProgramEngagementInput> = {}): ProgramEngagementInput => ({
  id: 'e1', kind: 'AUDIT', title: null, clientName: 'Cliente SA', fiscalYear: 2026, status: 'APPROVED', plannedStartDate: null, plannedEndDate: null,
  partnerName: 'Socio', estimatedHours: null, team: [], proposalHours: 0, ...o,
});

describe('programa anual — a qué año pertenece un encargo', () => {
  it('sin fechas: una auditoría se trabaja el año siguiente a su ejercicio y una consultoría en el año de su ejercicio', () => {
    expect(yearShare(eng({ fiscalYear: 2026 }), 2027)).toEqual({ share: 1, basis: 'ASSUMED_YEAR' });
    expect(yearShare(eng({ fiscalYear: 2026 }), 2026).share).toBe(0);
    expect(yearShare(eng({ kind: 'CONSULTING', fiscalYear: 2026 }), 2026).share).toBe(1);
    expect(yearShare(eng({ kind: 'CONSULTING', fiscalYear: 2026 }), 2027).share).toBe(0);
  });

  it('con fechas previstas reparte los días entre los años que toca', () => {
    const span = eng({ plannedStartDate: d('2026-11-01'), plannedEndDate: d('2027-02-28') });   // 61 días de 2026 y 59 de 2027 (120 en total)
    const a = yearShare(span, 2026); const b = yearShare(span, 2027);
    expect(a.basis).toBe('PLANNED_DATES');
    expect(a.share).toBeCloseTo(61 / 120, 6);
    expect(b.share).toBeCloseTo(59 / 120, 6);
    expect(a.share + b.share).toBeCloseTo(1, 9);
    expect(yearShare(span, 2028).share).toBe(0);
    expect(yearShare(eng({ plannedStartDate: d('2027-03-01'), plannedEndDate: d('2027-03-31') }), 2027).share).toBe(1);
  });

  it('con una sola fecha cae entero en el año de esa fecha; fechas al revés se tratan como una sola', () => {
    expect(yearShare(eng({ plannedStartDate: d('2027-05-10') }), 2027).share).toBe(1);
    expect(yearShare(eng({ plannedEndDate: d('2027-05-10') }), 2026).share).toBe(0);
    expect(yearShare(eng({ plannedStartDate: d('2027-05-10'), plannedEndDate: d('2027-05-01') }), 2027).share).toBe(1);
  });
});

describe('programa anual — de dónde salen las horas', () => {
  it('presupuesto del equipo > horas estimadas > horas de la propuesta > ninguna', () => {
    const team = [{ userId: 'a', userName: 'Ana', budgetedHours: 100 }, { userId: 'b', userName: 'Beto', budgetedHours: null }, { userId: 'c', userName: 'Cris', budgetedHours: 50 }];
    expect(engagementHours(eng({ team, estimatedHours: 120 }))).toMatchObject({ source: 'TEAM_BUDGET', total: 150, assigned: 150 });
    expect(engagementHours(eng({ team, estimatedHours: 200 }))).toMatchObject({ source: 'TEAM_BUDGET', total: 200, assigned: 150 });   // el resto queda sin asignar
    expect(engagementHours(eng({ estimatedHours: 80, proposalHours: 500 }))).toMatchObject({ source: 'ESTIMATE', total: 80, assigned: 0 });
    expect(engagementHours(eng({ proposalHours: 60 }))).toMatchObject({ source: 'PROPOSAL', total: 60, assigned: 0 });
    expect(engagementHours(eng())).toMatchObject({ source: 'NONE', total: 0 });
  });
});

describe('programa anual — capacidad contra horas comprometidas', () => {
  const people = [{ userId: 'a', name: 'Ana', capacity: 1500 }, { userId: 'b', name: 'Beto', capacity: 1000 }, { userId: 'z', name: 'Zoe', capacity: 800 }];

  it('suma por persona, marca a quien se pasa de su capacidad y separa lo que nadie tiene asignado', () => {
    const e1 = eng({ id: 'e1', fiscalYear: 2026, team: [{ userId: 'a', userName: 'Ana', budgetedHours: 900 }, { userId: 'b', userName: 'Beto', budgetedHours: 600 }], estimatedHours: 1700 });
    const e2 = eng({ id: 'e2', kind: 'CONSULTING', fiscalYear: 2027, clientName: 'Otro SA', team: [{ userId: 'a', userName: 'Ana', budgetedHours: 700 }] });
    const e3 = eng({ id: 'e3', fiscalYear: 2026, proposalHours: 300, status: 'DRAFT', clientName: 'Prospecto SA' });
    const r = buildProgram(2027, [e1, e2, e3], people, new Map([['a', 100]]));

    expect(r.engagements.map((l) => [l.id, l.hours, l.assignedHours, l.unassignedHours])).toEqual([['e1', 1700, 1500, 200], ['e2', 700, 700, 0], ['e3', 300, 0, 300]]);
    const ana = r.people.find((p) => p.userId === 'a')!;
    expect(ana).toMatchObject({ capacity: 1500, committed: 1600, actual: 100, overbooked: true, free: -100 });
    expect(ana.utilizationPct).toBeCloseTo(106.67, 2);
    expect(r.people.find((p) => p.userId === 'b')).toMatchObject({ committed: 600, overbooked: false, free: 400 });
    expect(r.people.find((p) => p.userId === 'z')).toMatchObject({ committed: 0, utilizationPct: 0, free: 800 });
    expect(r.people[0].userId).toBe('a');                                            // la más cargada primero
    expect(r.totals).toMatchObject({ capacity: 3300, committed: 2200, unassigned: 500, free: 600, overbookedPeople: 1, peopleWithoutProfile: 0, engagementsWithoutHours: 0 });
    expect(r.totals.utilizationPct).toBeCloseTo(81.82, 2);
  });

  it('un encargo de otro año no entra; uno sin horas se lista aparte; quien tiene horas sin perfil de disponibilidad se avisa', () => {
    const other = eng({ id: 'old', fiscalYear: 2024, team: [{ userId: 'a', userName: 'Ana', budgetedHours: 500 }] });   // se trabajó en 2025
    const empty = eng({ id: 'empty', fiscalYear: 2026, clientName: 'Sin horas SA' });
    const ghost = eng({ id: 'g', fiscalYear: 2026, team: [{ userId: 'x', userName: 'Xavier', budgetedHours: 120 }] });
    const r = buildProgram(2027, [other, empty, ghost], people, new Map());
    expect(r.engagements.map((l) => l.id)).toEqual(['g']);
    expect(r.withoutHours.map((l) => l.id)).toEqual(['empty']);
    const x = r.people.find((p) => p.userId === 'x')!;
    expect(x).toMatchObject({ name: 'Xavier', capacity: null, committed: 120, utilizationPct: null, free: null, overbooked: false });
    expect(r.totals).toMatchObject({ peopleWithoutProfile: 1, engagementsWithoutHours: 1, committed: 120 });
  });

  it('un encargo que cruza de año reparte sus horas por días entre los dos programas', () => {
    const span = eng({ plannedStartDate: d('2026-12-17'), plannedEndDate: d('2027-01-15'), team: [{ userId: 'a', userName: 'Ana', budgetedHours: 620 }] });   // 15 + 15 días
    const y26 = buildProgram(2026, [span], people, new Map()); const y27 = buildProgram(2027, [span], people, new Map());
    expect(y26.engagements[0].hours).toBe(310);
    expect(y27.engagements[0].hours).toBe(310);
    expect(y26.engagements[0].hours + y27.engagements[0].hours).toBe(620);
  });

  it('sin capacidad registrada el porcentaje de uso no se inventa', () => {
    const r = buildProgram(2027, [eng({ proposalHours: 100 })], [], new Map());
    expect(r.totals).toMatchObject({ capacity: 0, utilizationPct: null, free: -100, unassigned: 100 });
  });
});
