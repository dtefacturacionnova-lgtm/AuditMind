/**
 * Base de datos falsa en memoria SOLO para pruebas de la biblioteca por papel: imita lo que usan org-library.ts y
 * paper-library-admin.service.ts de `contentLibraryItem` (findMany/findFirst/count/create/update/delete/deleteMany).
 * Respeta el filtro por organización y por kind, que es justo lo que las pruebas de aislamiento necesitan comprobar.
 */
export interface FakeRow {
  id: string;
  organizationId: string;
  kind: string;
  groupKey: string;
  groupLabel: string | null;
  itemLabel: string;
  itemSubtitle: string | null;
  itemDetails: unknown;
  sortOrder: number;
  isSystem: boolean;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

export function fakeLibraryDb(seed: Array<Partial<FakeRow>> = []) {
  let n = 0;
  let clock = new Date('2026-11-01T00:00:00Z').getTime();
  const tick = () => new Date((clock += 60_000));
  const rows: FakeRow[] = [];
  const full = (r: Partial<FakeRow>): FakeRow => ({
    id: r.id ?? `row${++n}`, organizationId: 'org1', kind: 'PAPER_PROCEDURE', groupKey: 'PT-NIA550', groupLabel: null, itemLabel: '',
    itemSubtitle: null, itemDetails: null, sortOrder: 0, isSystem: false, createdById: 'u1', createdAt: tick(), updatedAt: tick(), ...r,
  });
  seed.forEach((s) => rows.push(full(s)));

  const match = (r: FakeRow, where: any) =>
    (!where.id || (typeof where.id === 'string' ? r.id === where.id : (where.id.in ?? []).includes(r.id))) &&
    (!where.organizationId || r.organizationId === where.organizationId) &&
    (!where.kind || r.kind === where.kind) &&
    (!where.groupKey || r.groupKey === where.groupKey);

  const contentLibraryItem = {
    findMany: async ({ where }: any) => rows.filter((r) => match(r, where)).map((r) => ({ ...r })),
    findFirst: async ({ where }: any) => {
      const r = rows.find((x) => match(x, where));
      return r ? { ...r } : null;
    },
    count: async ({ where }: any) => rows.filter((r) => match(r, where)).length,
    create: async ({ data }: any) => {
      const r = full(data);
      rows.push(r);
      return { ...r };
    },
    update: async ({ where, data }: any) => {
      const r = rows.find((x) => x.id === where.id);
      if (!r) throw new Error('no existe');
      Object.assign(r, data, { updatedAt: tick() });
      return { ...r };
    },
    delete: async ({ where }: any) => {
      const i = rows.findIndex((x) => x.id === where.id);
      if (i < 0) throw new Error('no existe');
      rows.splice(i, 1);
      return {};
    },
    deleteMany: async ({ where }: any) => {
      const gone = rows.filter((r) => match(r, where));
      gone.forEach((g) => rows.splice(rows.indexOf(g), 1));
      return { count: gone.length };
    },
  };
  return { contentLibraryItem, rows };
}
