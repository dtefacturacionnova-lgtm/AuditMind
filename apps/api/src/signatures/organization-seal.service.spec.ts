import { ServiceUnavailableException } from '@nestjs/common';
import { OrganizationSealService } from './organization-seal.service';
import { decryptSecret } from '../common/utils/signing-key.util';

const MASTER = 'clave-maestra-de-prueba-32-caracteres';

/** Prisma en memoria: updateMany respeta la condición `sealCertPem: null` como lo hace Postgres. */
function fakePrisma(orgName = 'Pérez Cortez y Asociados') {
  const row: { id: string; name: string; sealCertPem: string | null; sealKeyEncrypted: string | null; sealCreatedAt: Date | null } =
    { id: 'org1', name: orgName, sealCertPem: null, sealKeyEncrypted: null, sealCreatedAt: null };
  const writes: number[] = [];
  const prisma = {
    organization: {
      findUniqueOrThrow: async () => { await Promise.resolve(); return { ...row }; },
      findUnique: async () => ({ ...row }),
      updateMany: async ({ where, data }: { where: { id: string; sealCertPem: null }; data: Partial<typeof row> }) => {
        await Promise.resolve();
        if (where.sealCertPem === null && row.sealCertPem !== null) return { count: 0 };
        Object.assign(row, data);
        writes.push(1);
        return { count: 1 };
      },
    },
  };
  return { prisma, row, writes };
}

const service = (prisma: unknown, key = MASTER) =>
  new OrganizationSealService(prisma as never, { get: (_k: string, d?: string) => key || d } as never);

jest.setTimeout(60_000);

describe('OrganizationSealService', () => {
  it('genera el sello la primera vez, guarda la clave CIFRADA y devuelve huella', async () => {
    const { prisma, row } = fakePrisma();
    const seal = await service(prisma).getOrCreateSeal('org1');
    expect(seal.certPem).toContain('BEGIN CERTIFICATE');
    expect(seal.privateKeyPem).toContain('BEGIN RSA PRIVATE KEY'); // PKCS#1, lo que exige Stirling
    expect(seal.fingerprintSha256).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
    expect(seal.organizationName).toBe('Pérez Cortez y Asociados');
    // lo guardado NO es la clave en claro, y se descifra con la maestra
    expect(row.sealKeyEncrypted).not.toContain('PRIVATE KEY');
    expect(decryptSecret(row.sealKeyEncrypted!, MASTER)).toBe(seal.privateKeyPem);
    expect(row.sealCreatedAt).toBeInstanceOf(Date);
  });

  it('la segunda llamada devuelve el mismo sello y no escribe de nuevo', async () => {
    const { prisma, writes } = fakePrisma();
    const svc = service(prisma);
    const a = await svc.getOrCreateSeal('org1');
    const b = await svc.getOrCreateSeal('org1');
    expect(b.certPem).toBe(a.certPem);
    expect(b.fingerprintSha256).toBe(a.fingerprintSha256);
    expect(writes).toHaveLength(1);
  });

  it('dos creaciones simultáneas terminan con UN solo sello (gana la primera)', async () => {
    const { prisma, writes } = fakePrisma();
    const svc = service(prisma);
    const [a, b] = await Promise.all([svc.getOrCreateSeal('org1'), svc.getOrCreateSeal('org1')]);
    expect(writes).toHaveLength(1);
    expect(b.certPem).toBe(a.certPem);
    expect(b.privateKeyPem).toBe(a.privateKeyPem);
  });

  it('sin ENCRYPTION_KEY no genera nada ni escribe en la BD', async () => {
    const { prisma, writes } = fakePrisma();
    await expect(service(prisma, '').getOrCreateSeal('org1')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(writes).toHaveLength(0);
  });

  it('con otra clave maestra no se puede descifrar el sello guardado', async () => {
    const { prisma } = fakePrisma();
    await service(prisma).getOrCreateSeal('org1');
    await expect(service(prisma, 'otra-clave-maestra-distinta-0123456').getOrCreateSeal('org1')).rejects.toThrow();
  });

  it('getFingerprintIfExists: null si no hay sello y NO lo crea', async () => {
    const { prisma, writes } = fakePrisma();
    const svc = service(prisma);
    expect(await svc.getFingerprintIfExists('org1')).toBeNull();
    expect(writes).toHaveLength(0);
    const seal = await svc.getOrCreateSeal('org1');
    expect(await svc.getFingerprintIfExists('org1')).toBe(seal.fingerprintSha256);
  });
});
