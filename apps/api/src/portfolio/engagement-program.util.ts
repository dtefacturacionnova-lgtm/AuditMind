/**
 * Programa anual de encargos (modalidad externa): horas comprometidas en los encargos de un año contra la capacidad neta del equipo.
 * Funciones puras; los datos los trae `EngagementProgramService`.
 *
 * Qué año ocupa un encargo:
 *  · con fechas previstas de inicio y fin: sus días se reparten entre los años que toca, y cada año recibe su parte de las horas;
 *  · con una sola fecha: todo cae en el año de esa fecha;
 *  · sin fechas: una auditoría se trabaja el año SIGUIENTE a su ejercicio (se audita 2026 en 2027) y una consultoría en el año de su ejercicio.
 *
 * De dónde salen las horas de un encargo (la primera que exista):
 *  1. presupuesto del equipo de la auditoría (horas por persona; si la auditoría tiene más horas estimadas que las repartidas, el resto queda
 *     «sin asignar a personas»);
 *  2. horas estimadas de la auditoría;
 *  3. horas del equipo propuesto en la propuesta (solo por rol, no por persona: todas quedan sin asignar);
 *  4. ninguna: el encargo se lista aparte para que alguien le ponga horas.
 */
export type HoursSource = 'TEAM_BUDGET' | 'ESTIMATE' | 'PROPOSAL' | 'NONE';
export type WindowBasis = 'PLANNED_DATES' | 'ASSUMED_YEAR';

export interface ProgramEngagementInput {
  id: string;
  kind: 'AUDIT' | 'CONSULTING';
  title: string | null;
  clientName: string;
  fiscalYear: number;
  status: 'DRAFT' | 'APPROVED';
  plannedStartDate: Date | null;
  plannedEndDate: Date | null;
  partnerName: string | null;
  estimatedHours: number | null;
  team: Array<{ userId: string; userName: string; budgetedHours: number | null }>;
  proposalHours: number;
}

export interface ProgramPersonInput { userId: string; name: string; capacity: number }

export interface ProgramEngagementLine {
  id: string; kind: 'AUDIT' | 'CONSULTING'; title: string | null; clientName: string; fiscalYear: number; status: 'DRAFT' | 'APPROVED';
  partnerName: string | null; plannedStartDate: string | null; plannedEndDate: string | null; basis: WindowBasis;
  /** Parte del encargo que cae en el año (0–1). */
  yearShare: number;
  source: HoursSource;
  /** Horas del encargo que caen en el año. */
  hours: number;
  assignedHours: number;
  unassignedHours: number;
  byPerson: Array<{ userId: string; userName: string; hours: number }>;
}

export interface ProgramPersonLine {
  userId: string; name: string; capacity: number | null; committed: number; actual: number;
  utilizationPct: number | null; free: number | null; overbooked: boolean;
}

export interface ProgramResult {
  year: number;
  engagements: ProgramEngagementLine[];
  withoutHours: ProgramEngagementLine[];
  people: ProgramPersonLine[];
  totals: {
    capacity: number; committed: number; unassigned: number; free: number; utilizationPct: number | null;
    overbookedPeople: number; peopleWithoutProfile: number; engagementsWithoutHours: number;
  };
}

const MS_DAY = 24 * 60 * 60 * 1000;
const round2 = (n: number) => Math.round(n * 100) / 100;
const ymdOf = (d: Date) => d.toISOString().slice(0, 10);
const dayStart = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/** Parte (0–1) de un encargo que cae en `year`, y con qué criterio se decidió. */
export function yearShare(i: Pick<ProgramEngagementInput, 'kind' | 'fiscalYear' | 'plannedStartDate' | 'plannedEndDate'>, year: number): { share: number; basis: WindowBasis } {
  const { plannedStartDate: s, plannedEndDate: e } = i;
  if (s && e && dayStart(e) >= dayStart(s)) {
    const start = dayStart(s); const end = dayStart(e);
    const total = Math.round((end - start) / MS_DAY) + 1;
    const from = Math.max(start, Date.UTC(year, 0, 1)); const to = Math.min(end, Date.UTC(year, 11, 31));
    const inside = to >= from ? Math.round((to - from) / MS_DAY) + 1 : 0;
    return { share: inside / total, basis: 'PLANNED_DATES' };
  }
  const one = s ?? e;
  if (one) return { share: one.getUTCFullYear() === year ? 1 : 0, basis: 'PLANNED_DATES' };
  const assumed = i.kind === 'AUDIT' ? i.fiscalYear + 1 : i.fiscalYear;
  return { share: assumed === year ? 1 : 0, basis: 'ASSUMED_YEAR' };
}

export function engagementHours(i: ProgramEngagementInput): { source: HoursSource; total: number; assigned: number; perPerson: Array<{ userId: string; userName: string; hours: number }> } {
  const perPerson = i.team.filter((t) => (t.budgetedHours ?? 0) > 0).map((t) => ({ userId: t.userId, userName: t.userName, hours: t.budgetedHours as number }));
  const assigned = perPerson.reduce((s, p) => s + p.hours, 0);
  const estimate = i.estimatedHours && i.estimatedHours > 0 ? i.estimatedHours : 0;
  if (assigned > 0) return { source: 'TEAM_BUDGET', total: Math.max(assigned, estimate), assigned, perPerson };
  if (estimate > 0) return { source: 'ESTIMATE', total: estimate, assigned: 0, perPerson: [] };
  if (i.proposalHours > 0) return { source: 'PROPOSAL', total: i.proposalHours, assigned: 0, perPerson: [] };
  return { source: 'NONE', total: 0, assigned: 0, perPerson: [] };
}

export function buildProgram(
  year: number, engagements: ProgramEngagementInput[], people: ProgramPersonInput[], actualByUser: Map<string, number>,
): ProgramResult {
  const lines: ProgramEngagementLine[] = [];
  for (const e of engagements) {
    const { share, basis } = yearShare(e, year);
    if (share <= 0) continue;
    const h = engagementHours(e);
    lines.push({
      id: e.id, kind: e.kind, title: e.title, clientName: e.clientName, fiscalYear: e.fiscalYear, status: e.status, partnerName: e.partnerName,
      plannedStartDate: e.plannedStartDate ? ymdOf(e.plannedStartDate) : null, plannedEndDate: e.plannedEndDate ? ymdOf(e.plannedEndDate) : null,
      basis, yearShare: round2(share), source: h.source,
      hours: round2(h.total * share), assignedHours: round2(h.assigned * share), unassignedHours: round2((h.total - h.assigned) * share),
      byPerson: h.perPerson.map((p) => ({ userId: p.userId, userName: p.userName, hours: round2(p.hours * share) })),
    });
  }
  lines.sort((a, b) => b.hours - a.hours || a.clientName.localeCompare(b.clientName));

  const committed = new Map<string, number>();
  const names = new Map<string, string>();
  for (const l of lines) for (const p of l.byPerson) { committed.set(p.userId, (committed.get(p.userId) ?? 0) + p.hours); names.set(p.userId, p.userName); }

  const profile = new Map(people.map((p) => [p.userId, p]));
  const ids = new Set<string>([...people.map((p) => p.userId), ...committed.keys()]);
  const peopleLines: ProgramPersonLine[] = [...ids].map((userId) => {
    const p = profile.get(userId);
    const capacity = p ? round2(p.capacity) : null;
    const c = round2(committed.get(userId) ?? 0);
    return {
      userId, name: p?.name ?? names.get(userId) ?? '—', capacity, committed: c, actual: round2(actualByUser.get(userId) ?? 0),
      utilizationPct: capacity && capacity > 0 ? round2((c / capacity) * 100) : null,
      free: capacity === null ? null : round2(capacity - c),
      overbooked: capacity !== null && c > capacity,
    };
  }).sort((a, b) => (b.utilizationPct ?? -1) - (a.utilizationPct ?? -1) || a.name.localeCompare(b.name));

  const capacity = round2(peopleLines.reduce((s, p) => s + (p.capacity ?? 0), 0));
  const assignedTotal = round2(lines.reduce((s, l) => s + l.assignedHours, 0));
  const unassigned = round2(lines.reduce((s, l) => s + l.unassignedHours, 0));
  const withoutHours = lines.filter((l) => l.source === 'NONE');
  return {
    year,
    engagements: lines.filter((l) => l.source !== 'NONE'),
    withoutHours,
    people: peopleLines,
    totals: {
      capacity, committed: assignedTotal, unassigned, free: round2(capacity - assignedTotal - unassigned),
      utilizationPct: capacity > 0 ? round2(((assignedTotal + unassigned) / capacity) * 100) : null,
      overbookedPeople: peopleLines.filter((p) => p.overbooked).length,
      peopleWithoutProfile: peopleLines.filter((p) => p.capacity === null).length,
      engagementsWithoutHours: withoutHours.length,
    },
  };
}
