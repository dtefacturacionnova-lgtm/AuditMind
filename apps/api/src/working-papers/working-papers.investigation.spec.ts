/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConflictException } from '@nestjs/common';
import { FakeDb } from '../signatures/testing/fake-db';
import { user } from '../signatures/testing/harness';
import { PaperSectionsService } from './paper-sections.service';
import { WorkingPapersService } from './working-papers.service';

process.env.SUPABASE_URL ??= 'https://proyecto.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'clave-de-prueba';

/**
 * Revisión de seguridad F5b (2026-10-19): el papel de entrevista de una auditoría en MODO INVESTIGACIÓN (con el acta
 * firmada en su sección S2) lo leía cualquier auditor de la organización por `GET /working-papers/:id`, `/org` y
 * `/:id/sections`, y cualquiera podía borrarlo (y con él, el rastro de las actas enviadas a firma).
 */
function setup() {
  const fake = new FakeDb();
  fake.seedAudit({ isInvestigationMode: true, team: [{ userId: 'u-team' }] });
  fake.seedAudit({ id: 'aud2', isInvestigationMode: false });
  fake.seedPaper();                                    // wp1 en la auditoría en investigación
  fake.seedPaper({ id: 'wp2', auditId: 'aud2' });       // wp2 en una auditoría normal
  fake.seedSection();
  const prisma = fake.client;
  const papers = new WorkingPapersService(prisma, null as any, null as any, null as any, null as any, null as any, null as any);
  const sections = new PaperSectionsService(prisma, null as any, null as any, null as any, null as any);
  return { fake, papers, sections };
}

const outsider = user('AUDIT_MANAGER', 'u-fuera');
const member = user('AUDITOR', 'u-team');

describe('Papeles de trabajo · modo investigación', () => {
  it('ver el papel y sus secciones: solo el equipo, CAE, ADMIN y SUPER_ADMIN', async () => {
    const { papers, sections } = setup();
    await expect(papers.findOne('wp1', outsider)).rejects.toThrow(/modo investigación/);
    await expect((sections as any).assertPaperAccess('wp1', outsider)).rejects.toThrow(/modo investigación/);
    await expect(papers.findOne('wp1', member)).resolves.toMatchObject({ id: 'wp1' });
    await expect(papers.findOne('wp1', user('CAE', 'u-cae'))).resolves.toMatchObject({ id: 'wp1' });
    await expect((sections as any).assertPaperAccess('wp1', member)).resolves.toMatchObject({ id: 'wp1' });
    // Una auditoría normal: basta con ser de la organización.
    await expect(papers.findOne('wp2', outsider)).resolves.toMatchObject({ id: 'wp2' });
  });

  it('el listado de la organización excluye los papeles de investigaciones ajenas', async () => {
    const { papers } = setup();
    expect((await papers.findAllForOrg(outsider)).data.map((p: any) => p.id)).toEqual(['wp2']);
    expect((await papers.findAllForOrg(member)).data.map((p: any) => p.id).sort()).toEqual(['wp1', 'wp2']);
    expect((await papers.findAllForOrg(user('ADMIN', 'u-admin'))).data).toHaveLength(2);
  });

  it('borrar: fuera del equipo no; y un papel con actas enviadas a firma se conserva como evidencia', async () => {
    const { fake, papers } = setup();
    await expect(papers.remove('wp1', outsider)).rejects.toThrow(/modo investigación/);
    fake.tables.signatureRequest.push({ id: 'sr1', organizationId: 'org1', documentType: 'INTERVIEW_RECORD', targetId: 'wp1', status: 'DECLINED' });
    await expect(papers.remove('wp1', member)).rejects.toBeInstanceOf(ConflictException);
    expect(fake.tables.workingPaper.map((p) => p.id)).toContain('wp1');
    await expect(papers.remove('wp2', outsider)).resolves.toEqual({ deleted: true }); // sin actas, en auditoría normal
  });
});
