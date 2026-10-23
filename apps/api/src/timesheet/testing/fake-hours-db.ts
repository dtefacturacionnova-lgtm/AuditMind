/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'crypto';

/**
 * Base de datos en memoria para probar el cierre de horas SIN tocar la base real (que es producción).
 * Imita lo que usan TimesheetService, PlansService y HoursCloseService: filtros con in/notIn/gte/lt/OR, claves únicas
 * compuestas, upsert, agregados, `include: { user }`, y transacciones que SE DESHACEN si algo lanza.
 * Los candados de Postgres (pg_advisory_xact_lock) no se simulan: solo se registran las llaves pedidas.
 */
type Row = Record<string, any>;
const now = () => new Date();

const DEFAULTS: Record<string, () => Row> = {
  timeEntry: () => ({
    auditId: null, planItemId: null, description: null, category: 'CLIENT_BILLABLE', nonBillableReason: null,
    costRateSnapshot: null, billRateSnapshot: null, closedAt: null, afterClose: false, createdAt: now(), updatedAt: now(),
  }),
  hoursCloseSettings: () => ({ enabled: false, entryDeadlineDay: 5, closeDeadlineDay: 10, lastReminderPeriod: null, updatedById: null, createdAt: now(), updatedAt: now() }),
  hoursPeriodClose: () => ({
    status: 'CLOSED', closedById: null, closedAt: null, closeNote: null, entryCount: 0, totalHours: 0,
    reopenedById: null, reopenedAt: null, reopenReason: null, createdAt: now(), updatedAt: now(),
  }),
  timeEntryLog: () => ({ timeEntryId: null, before: null, after: null, note: null, createdAt: now() }),
  timeAdjustmentRequest: () => ({
    timeEntryId: null, payload: null, status: 'PENDING', decidedById: null, decidedAt: null, decisionNote: null, createdAt: now(), updatedAt: now(),
  }),
  user: () => ({ active: true, email: 'x@x.com' }),
  audit: () => ({ actualHours: 0 }),
  auditPlanItem: () => ({}),
  holidayConfig: () => ({ active: true, recurring: false }),
  userAvailabilityProfile: () => ({}),
  userCostProfile: () => ({}),
  auditTeam: () => ({ agreedRatePerHour: null }),
};

const COMPOUND: Record<string, string[]> = {
  organizationId_userId_year_month: ['organizationId', 'userId', 'year', 'month'],
};

const isOp = (v: any) => v && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v)
  && Object.keys(v).some((k) => ['in', 'notIn', 'gt', 'gte', 'lt', 'lte', 'not', 'equals'].includes(k));
const num = (a: any) => (a instanceof Date ? a.getTime() : a);
const eq = (a: any, b: any) => (a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : (a ?? null) === (b ?? null));

class Table {
  rows: Row[] = [];
  constructor(private name: string, private db: FakeHoursDb) {}

  private match(row: Row, where: Row = {}): boolean {
    return Object.entries(where).every(([key, cond]) => {
      if (cond === undefined) return true;
      if (key === 'OR') return (cond as Row[]).some((sub) => this.match(row, sub));
      if (key === 'AND') return (cond as Row[]).every((sub) => this.match(row, sub));
      if (key in COMPOUND) return COMPOUND[key].every((k) => eq(row[k], (cond as Row)[k]));
      const v = row[key];
      if (isOp(cond)) {
        if ('in' in cond && !cond.in.some((x: any) => eq(x, v))) return false;
        if ('notIn' in cond && cond.notIn.some((x: any) => eq(x, v))) return false;
        if ('gt' in cond && !(v != null && num(v) > num(cond.gt))) return false;
        if ('gte' in cond && !(v != null && num(v) >= num(cond.gte))) return false;
        if ('lt' in cond && !(v != null && num(v) < num(cond.lt))) return false;
        if ('lte' in cond && !(v != null && num(v) <= num(cond.lte))) return false;
        if ('not' in cond && eq(v, cond.not)) return false;
        if ('equals' in cond && !eq(v, cond.equals)) return false;
        return true;
      }
      return eq(v, cond);
    });
  }

  private project(row: Row, args: Row = {}): Row {
    let out: Row = { ...row };
    if (args.select) out = Object.fromEntries(Object.keys(args.select).filter((k) => args.select[k]).map((k) => [k, row[k]]));
    if (args.include?.user) {
      const u = this.db.tables.user.rows.find((x) => x.id === row.userId);
      out.user = u ? this.pickFields(u, args.include.user.select) : null;
    }
    return out;
  }
  private pickFields(row: Row, select?: Row): Row {
    return select ? Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => [k, row[k]])) : { ...row };
  }

  private find(where?: Row): Row[] { return this.rows.filter((r) => this.match(r, where)); }

  async findMany(args: Row = {}) {
    let rows = this.find(args.where);
    const ob = Array.isArray(args.orderBy) ? args.orderBy : args.orderBy ? [args.orderBy] : [];
    for (const o of [...ob].reverse()) {
      const [k, dir] = Object.entries(o)[0] as [string, string];
      rows = [...rows].sort((a, b) => (num(a[k]) > num(b[k]) ? 1 : num(a[k]) < num(b[k]) ? -1 : 0) * (dir === 'desc' ? -1 : 1));
    }
    if (args.take) rows = rows.slice(0, args.take);
    return rows.map((r) => this.project(r, args));
  }
  async findFirst(args: Row = {}) { const r = this.find(args.where)[0]; return r ? this.project(r, args) : null; }
  async findUnique(args: Row) { return this.findFirst(args); }
  async count(args: Row = {}) { return this.find(args.where).length; }

  private build(data: Row): Row {
    const row: Row = { id: randomUUID(), ...(DEFAULTS[this.name]?.() ?? {}) };
    for (const [k, v] of Object.entries(data)) if (v !== undefined) row[k] = v;
    return row;
  }
  private checkUnique(row: Row) {
    if (this.name === 'hoursPeriodClose') {
      const dup = this.rows.find((o) => o !== row && ['organizationId', 'userId', 'year', 'month'].every((c) => eq(o[c], row[c])));
      if (dup) throw new Error('Unique constraint failed on hoursPeriodClose');
    }
    if (this.name === 'hoursCloseSettings' && this.rows.find((o) => o !== row && o.organizationId === row.organizationId)) {
      throw new Error('Unique constraint failed on hoursCloseSettings');
    }
  }
  async create(args: Row) {
    const row = this.build(args.data);
    this.rows.push(row);
    try { this.checkUnique(row); } catch (e) { this.rows.pop(); throw e; }
    return this.project(row, args);
  }
  async createMany(args: Row) { for (const d of args.data) await this.create({ data: d }); return { count: args.data.length }; }
  async createManyAndReturn(args: Row) { const out = []; for (const d of args.data) out.push(await this.create({ data: d })); return out; }

  private apply(row: Row, data: Row) {
    for (const [k, v] of Object.entries(data)) if (v !== undefined) row[k] = v;
    if ('updatedAt' in row) row.updatedAt = now();
  }
  async update(args: Row) {
    const row = this.find(args.where)[0];
    if (!row) throw new Error(`Record to update not found (${this.name})`);
    this.apply(row, args.data);
    return this.project(row, args);
  }
  async updateMany(args: Row) { const rows = this.find(args.where); rows.forEach((r) => this.apply(r, args.data)); return { count: rows.length }; }
  async upsert(args: Row) {
    const row = this.find(args.where)[0];
    if (row) { this.apply(row, args.update); return this.project(row, args); }
    return this.create({ data: { ...args.create } });
  }
  async delete(args: Row) {
    const i = this.rows.findIndex((r) => this.match(r, args.where));
    if (i < 0) throw new Error(`Record to delete not found (${this.name})`);
    return this.rows.splice(i, 1)[0];
  }
  async aggregate(args: Row) {
    const rows = this.find(args.where);
    const out: Row = {};
    if (args._sum) out._sum = Object.fromEntries(Object.keys(args._sum).map((k) => [k, rows.length ? rows.reduce((n, r) => n + (r[k] ?? 0), 0) : null]));
    if (args._count) out._count = { _all: rows.length };
    return out;
  }
  async groupBy(args: Row) {
    const keys: string[] = args.by;
    const groups = new Map<string, Row[]>();
    for (const r of this.find(args.where)) {
      const key = keys.map((k) => r[k]).join('|');
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    return [...groups.values()].map((rs) => ({ ...Object.fromEntries(keys.map((k) => [k, rs[0][k]])), _count: { _all: rs.length } }));
  }
}

const TABLES = [
  'timeEntry', 'hoursCloseSettings', 'hoursPeriodClose', 'timeEntryLog', 'timeAdjustmentRequest', 'user', 'audit', 'auditPlanItem',
  'holidayConfig', 'userAvailabilityProfile', 'userCostProfile', 'auditTeam',
] as const;

export class FakeHoursDb {
  tables = Object.fromEntries(TABLES.map((t) => [t, new Table(t, this)])) as Record<(typeof TABLES)[number], Table>;
  lockKeys: string[] = [];
  /** Cuántas transacciones se deshicieron por un error. */
  rollbacks = 0;

  timeEntry = this.tables.timeEntry;
  hoursCloseSettings = this.tables.hoursCloseSettings;
  hoursPeriodClose = this.tables.hoursPeriodClose;
  timeEntryLog = this.tables.timeEntryLog;
  timeAdjustmentRequest = this.tables.timeAdjustmentRequest;
  user = this.tables.user;
  audit = this.tables.audit;
  auditPlanItem = this.tables.auditPlanItem;
  holidayConfig = this.tables.holidayConfig;
  userAvailabilityProfile = this.tables.userAvailabilityProfile;
  userCostProfile = this.tables.userCostProfile;
  auditTeam = this.tables.auditTeam;

  /** Candado de transacción: no hay concurrencia real en las pruebas, solo se anota la llave. */
  $queryRaw = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    this.lockKeys.push(String(values[0] ?? strings.join('')));
    return [];
  };

  /** Las transacciones corren de una en una (como lo hace el candado por persona y mes en Postgres) y se deshacen si algo lanza. */
  private chain: Promise<unknown> = Promise.resolve();

  $transaction(cb: (tx: this) => Promise<any>, _opts?: unknown): Promise<any> {
    const run = async () => {
      const snapshot = Object.fromEntries(TABLES.map((t) => [t, this.tables[t].rows.map((r) => ({ ...r }))]));
      try {
        return await cb(this);
      } catch (e) {
        for (const t of TABLES) this.tables[t].rows = snapshot[t];
        this.rollbacks++;
        throw e;
      }
    };
    const result = this.chain.then(run, run);
    this.chain = result.catch(() => undefined);
    return result;
  }

  // ── Atajos de siembra ─────────────────────────────────────────────────────
  seedOrgUsers(orgId = 'org1') {
    const mk = (id: string, role: string, name: string, organizationId = orgId) => {
      const row = { id, organizationId, role, name, email: `${id}@firma.test`, active: true };
      this.tables.user.rows.push({ ...DEFAULTS.user(), ...row });
      return { id, role, organizationId, email: row.email, name, supabaseUserId: `s-${id}`, aiAssistantPersonality: 'ATHENA' };
    };
    return {
      auditor: mk('auditor1', 'AUDITOR', 'Ana Auditora'),
      senior: mk('senior1', 'SENIOR_AUDITOR', 'Sergio Senior'),
      manager: mk('manager1', 'AUDIT_MANAGER', 'Marta Gerente'),
      manager2: mk('manager2', 'AUDIT_MANAGER', 'Mario Gerente'),
      cae: mk('cae1', 'CAE', 'Carla Directora'),
      outsider: mk('outsider1', 'AUDIT_MANAGER', 'Otto Otro', 'org2'),
    };
  }
  seedAudit(id = 'aud1', organizationId = 'org1') { this.tables.audit.rows.push({ ...DEFAULTS.audit(), id, organizationId }); }
  enable(organizationId = 'org1', extra: Row = {}) {
    this.tables.hoursCloseSettings.rows.push({ ...DEFAULTS.hoursCloseSettings(), organizationId, enabled: true, ...extra });
  }
  entries(where: Row = {}) { return this.tables.timeEntry.rows.filter((r) => Object.entries(where).every(([k, v]) => eq(r[k], v))); }
  logs() { return this.tables.timeEntryLog.rows; }
}
