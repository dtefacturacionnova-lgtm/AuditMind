/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';

/**
 * La consulta de invitaciones pendientes contra un Postgres REAL con la misma forma de `auth.users` que Supabase (columnas email_confirmed_at,
 * last_sign_in_at y deleted_at). La base de pruebas no trae el esquema `auth`: la prueba crea la tabla mínima.
 *
 *   COLLECTIONS_TEST_DATABASE_URL=postgresql://postgres:test@localhost:54329/cobros_test npx jest invite-pending
 */
const URL = process.env.COLLECTIONS_TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;
jest.setTimeout(60_000);

suite('invitaciones pendientes contra Postgres real', () => {
  let prisma: PrismaClient;
  let AuthService: any;

  beforeAll(async () => {
    process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';
    ({ AuthService } = await import('./auth.service'));
    prisma = new PrismaClient({ datasourceUrl: URL });
    await prisma.$connect();
    await prisma.$executeRawUnsafe('CREATE SCHEMA IF NOT EXISTS auth');
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS auth.users (
      id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz, last_sign_in_at timestamptz, deleted_at timestamptz)`);
  });
  afterAll(async () => { await prisma?.$disconnect(); });

  const add = (o: { confirmed?: boolean; signedIn?: boolean; deleted?: boolean }) => {
    const id = randomUUID();
    return prisma.$executeRawUnsafe(
      'INSERT INTO auth.users (id, email, email_confirmed_at, last_sign_in_at, deleted_at) VALUES ($1::uuid, $2, $3::timestamptz, $4::timestamptz, $5::timestamptz)',
      id, `${id}@t.test`, o.confirmed ? new Date().toISOString() : null, o.signedIn ? new Date().toISOString() : null, o.deleted ? new Date().toISOString() : null,
    ).then(() => id);
  };

  it('solo marca como pendiente a quien nunca confirmó su correo ni entró, y no a un usuario borrado', async () => {
    const pending = await add({});
    const confirmed = await add({ confirmed: true });
    const signedIn = await add({ signedIn: true });
    const deleted = await add({ deleted: true });
    const svc = new AuthService(prisma as any);
    const r: Set<string> = await svc.pendingInvites([pending, confirmed, signedIn, deleted, randomUUID()]);
    expect([...r]).toEqual([pending]);
  });

  it('con muchos ids y duplicados responde bien, y sin ids no consulta', async () => {
    const a = await add({}); const b = await add({});
    const svc = new AuthService(prisma as any);
    const r: Set<string> = await svc.pendingInvites([a, a, b, ...Array.from({ length: 200 }, () => randomUUID())]);
    expect([...r].sort()).toEqual([a, b].sort());
    expect((await svc.pendingInvites([])).size).toBe(0);
  });
});
