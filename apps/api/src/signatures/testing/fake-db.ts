/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';

/**
 * Base de datos en memoria para probar la firma por enlace SIN tocar la base real.
 * Imita lo que importa para estos servicios:
 *  - transacciones que se DESHACEN si algo lanza, y que se serializan (como el FOR UPDATE sobre la solicitud),
 *  - restricciones únicas (tokenHash, verificationCode, requestId+seq),
 *  - updateMany condicional (la base de "gana una sola firma"),
 *  - { increment }, orden, take, select y el filtro por la relación `request`.
 */
type Row = Record<string, any>;

const now = () => new Date();

const DEFAULTS: Record<string, () => Row> = {
  signatureRequest: () => ({
    auditId: null, signerRole: null, payload: {}, status: 'PENDING', lockedUntil: null,
    otpHash: null, otpExpiresAt: null, otpAttempts: 0, otpFailuresHour: 0, otpWindowStart: null, otpSentCount: 0,
    otpLastSentAt: null, otpVerifiedAt: null, documentPages: null, consentVersion: null, consentText: null,
    signedName: null, signedRole: null, response: null, declineReason: null, signedAt: null, viewedAt: null,
    signerIp: null, signerUserAgent: null, verificationCode: null, sealStatus: 'NOT_APPLICABLE', sealAttempts: 0,
    sealedAt: null, tsaUrlUsed: null, signedPdfPath: null, signedPdfSha256: null, eventsHeadHash: null, sentAt: null,
    sendCount: 0, reminderEnabled: true, reminderSentAt: null, revokedAt: null, revokedById: null, revokedReason: null,
    createdAt: now(), updatedAt: now(),
  }),
  signatureSession: () => ({ ip: null, userAgent: null, revokedAt: null, createdAt: now() }),
  signatureEvent: () => ({ ip: null, userAgent: null, actorId: null, detail: null, at: now() }),
  signatureAttachment: () => ({ safePath: null, safeSha256: null, scanSignature: null, submitted: false, createdAt: now() }),
  organization: () => ({}),
  user: () => ({}),
};

const UNIQUE: Record<string, string[][]> = {
  signatureRequest: [['id'], ['tokenHash'], ['verificationCode']],
  signatureSession: [['id'], ['tokenHash']],
  signatureEvent: [['id'], ['requestId', 'seq']],
  signatureAttachment: [['id']],
  organization: [['id']],
  user: [['id']],
};

const isOp = (v: any) => v && typeof v === 'object' && !(v instanceof Date) && Object.keys(v).some((k) => ['in', 'notIn', 'gt', 'gte', 'lt', 'lte', 'not', 'equals'].includes(k));
const cmp = (a: any, b: any) => (a instanceof Date ? a.getTime() : a) - (b instanceof Date ? b.getTime() : b);
const eq = (a: any, b: any) => (a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : (a ?? null) === (b ?? null));

export class FakeDb {
  tables: Record<string, Row[]> = {
    signatureRequest: [], signatureSession: [], signatureEvent: [], signatureAttachment: [], organization: [], user: [],
  };
  private chain: Promise<unknown> = Promise.resolve();

  // ─── filtros ───────────────────────────────────────────────────────────────
  private match(table: string, row: Row, where: Row = {}): boolean {
    return Object.entries(where).every(([key, cond]) => {
      if (cond === undefined) return true;
      if (key === 'request') {
        const req = this.tables.signatureRequest.find((r) => r.id === row.requestId);
        return !!req && this.match('signatureRequest', req, cond);
      }
      const v = row[key];
      if (isOp(cond)) {
        if ('in' in cond && !cond.in.some((x: any) => eq(x, v))) return false;
        if ('notIn' in cond && cond.notIn.some((x: any) => eq(x, v))) return false;
        if ('gt' in cond && !(v != null && cmp(v, cond.gt) > 0)) return false;
        if ('gte' in cond && !(v != null && cmp(v, cond.gte) >= 0)) return false;
        if ('lt' in cond && !(v != null && cmp(v, cond.lt) < 0)) return false;
        if ('lte' in cond && !(v != null && cmp(v, cond.lte) <= 0)) return false;
        if ('not' in cond && eq(v, cond.not)) return false;
        if ('equals' in cond && !eq(v, cond.equals)) return false;
        return true;
      }
      return eq(v, cond);
    });
  }

  private assertUnique(table: string, row: Row, ignore?: Row) {
    for (const cols of UNIQUE[table] ?? []) {
      if (cols.some((c) => row[c] === null || row[c] === undefined)) continue;
      const dup = this.tables[table].find((o) => o !== ignore && cols.every((c) => eq(o[c], row[c])));
      if (dup) throw new Error(`Unique constraint failed on ${table}(${cols.join(',')})`);
    }
  }

  private apply(row: Row, data: Row) {
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      if (v === Prisma.DbNull || v === Prisma.JsonNull) row[k] = null;
      else if (v && typeof v === 'object' && !(v instanceof Date) && 'increment' in v) row[k] = (row[k] ?? 0) + v.increment;
      else row[k] = v instanceof Date ? new Date(v.getTime()) : v;
    }
    if ('updatedAt' in row) row.updatedAt = now();
  }

  private pick(row: Row, select?: Row): Row {
    if (!select) return { ...row };
    return Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => [k, row[k]]));
  }

  private order(rows: Row[], orderBy?: Row): Row[] {
    if (!orderBy) return rows;
    const [[field, dir]] = Object.entries(orderBy) as [string, 'asc' | 'desc'][];
    return [...rows].sort((a, b) => (dir === 'desc' ? -1 : 1) * cmp(a[field], b[field]));
  }

  // ─── delegado por tabla (API parecida a Prisma) ────────────────────────────
  delegate(table: string) {
    const t = () => this.tables[table];
    return {
      create: async ({ data }: any) => {
        const row = { ...DEFAULTS[table](), id: randomUUID() } as Row;
        this.apply(row, data);
        if (data.id) row.id = data.id;
        this.assertUnique(table, row);
        t().push(row);
        return { ...row };
      },
      findFirst: async ({ where, orderBy, select }: any = {}) => {
        const rows = this.order(t().filter((r) => this.match(table, r, where)), orderBy);
        return rows[0] ? this.pick(rows[0], select) : null;
      },
      findUnique: async ({ where, select }: any) => {
        const row = t().find((r) => this.match(table, r, where));
        return row ? this.pick(row, select) : null;
      },
      findUniqueOrThrow: async ({ where, select }: any) => {
        const row = t().find((r) => this.match(table, r, where));
        if (!row) throw new Error(`No ${table} found`);
        return this.pick(row, select);
      },
      findMany: async ({ where, orderBy, take, select }: any = {}) => {
        let rows = this.order(t().filter((r) => this.match(table, r, where)), orderBy);
        if (take) rows = rows.slice(0, take);
        return rows.map((r) => this.pick(r, select));
      },
      count: async ({ where }: any = {}) => t().filter((r) => this.match(table, r, where)).length,
      update: async ({ where, data }: any) => {
        const row = t().find((r) => this.match(table, r, where));
        if (!row) throw new Error(`Record to update not found in ${table}`);
        const next = { ...row }; this.apply(next, data); this.assertUnique(table, next, row);
        Object.assign(row, next);
        return { ...row };
      },
      updateMany: async ({ where, data }: any) => {
        const rows = t().filter((r) => this.match(table, r, where));
        for (const row of rows) { const next = { ...row }; this.apply(next, data); this.assertUnique(table, next, row); Object.assign(row, next); }
        return { count: rows.length };
      },
      delete: async ({ where }: any) => {
        const i = t().findIndex((r) => this.match(table, r, where));
        if (i < 0) throw new Error(`Record to delete not found in ${table}`);
        return t().splice(i, 1)[0];
      },
      deleteMany: async ({ where }: any = {}) => {
        const keep = t().filter((r) => !this.match(table, r, where));
        const count = t().length - keep.length;
        this.tables[table] = keep;
        return { count };
      },
    };
  }

  // ─── transacciones ─────────────────────────────────────────────────────────
  /** Serializa las transacciones (equivale al FOR UPDATE) y deshace todo si la función lanza. */
  private transaction = (fn: (tx: any) => Promise<any>): Promise<any> => {
    const run = async () => {
      const snapshot = structuredClone(this.tables);
      try {
        return await fn(this.client);
      } catch (err) {
        this.tables = snapshot;
        throw err;
      }
    };
    const result = this.chain.then(run, run);
    this.chain = result.catch(() => undefined);
    return result;
  };

  readonly client: any = {
    signatureRequest: this.delegate('signatureRequest'),
    signatureSession: this.delegate('signatureSession'),
    signatureEvent: this.delegate('signatureEvent'),
    signatureAttachment: this.delegate('signatureAttachment'),
    organization: this.delegate('organization'),
    user: this.delegate('user'),
    $transaction: (fn: any) => this.transaction(fn),
    $queryRaw: async () => [],
  };

  // ─── ayudas para las pruebas ───────────────────────────────────────────────
  seedOrg(id = 'org1', name = 'Pérez Cortez y Asociados') { this.tables.organization.push({ id, name }); }
  seedUser(id = 'u1', email = 'auditor@despacho.com', name = 'Ana Auditora') { this.tables.user.push({ id, email, name }); }
  get requests() { return this.tables.signatureRequest; }
  get events() { return this.tables.signatureEvent; }
}
