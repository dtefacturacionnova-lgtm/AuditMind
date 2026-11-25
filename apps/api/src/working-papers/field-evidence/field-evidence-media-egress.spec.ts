import { BadRequestException, ForbiddenException } from '@nestjs/common';

process.env.SUPABASE_URL ??= 'https://proyecto.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'clave-de-prueba';

import { FieldEvidenceService } from './field-evidence.service';

/**
 * La evidencia de campo (video, audio, fotos y PDF originales) firma su enlace por su cuenta, sin pasar por el firmador común:
 * por eso tiene su propio aviso a la medición de descargas de «Consumo».
 */
const PATH = 'evidence/cmaudit0000000000000001/cmpaper00000000000000001/cmev0000000000000000001_entrevista.wav';
const ORG = 'org-a';
const ME = { id: 'user-1', supabaseUserId: 's', email: 'a@x.com', name: 'A', role: 'AUDITOR', organizationId: ORG, aiAssistantPersonality: 'x' };

function build(evidence: Record<string, unknown> | null, signed: { data: { signedUrl: string } | null; error: { message: string } | null } = { data: { signedUrl: 'https://firmada' }, error: null }, withEgress = true) {
  const noteIssued = jest.fn();
  const prisma = { fieldEvidence: { findUnique: jest.fn(async () => evidence) } };
  const svc = new FieldEvidenceService(prisma as never, {} as never, {} as never, {} as never, undefined, withEgress ? ({ noteIssued } as never) : undefined);
  jest.spyOn(svc as never as { assertPaperAccess: () => Promise<void> }, 'assertPaperAccess').mockResolvedValue(undefined);
  const createSignedUrl = jest.fn(async () => signed);
  (svc as never as { supabase: unknown }).supabase = { storage: { from: () => ({ createSignedUrl }) } };
  return { svc, noteIssued, createSignedUrl };
}
const ev = (over: Record<string, unknown> = {}) => ({ id: 'cmev0000000000000000001', paperId: 'cmpaper00000000000000001', storageKey: PATH, filename: 'entrevista.wav', capturedById: 'user-1', ...over });

describe('evidencia de campo: aviso a la medición de descargas', () => {
  it('al escuchar o ver (view) avisa con la organización de quien consulta y la ruta del archivo', async () => {
    const { svc, noteIssued } = build(ev());
    const r = await svc.obtenerUrlMedia('cmpaper00000000000000001', 'cmev0000000000000000001', 'view', ME);
    expect(r).toEqual({ url: 'https://firmada', expiresIn: 300 });
    expect(noteIssued).toHaveBeenCalledTimes(1);
    expect(noteIssued).toHaveBeenCalledWith(ORG, [PATH]);
  });

  it('al descargar (download) también avisa, si quien pide puede descargar', async () => {
    const { svc, noteIssued, createSignedUrl } = build(ev({ capturedById: 'otra-persona' }));
    await svc.obtenerUrlMedia('cmpaper00000000000000001', 'cmev0000000000000000001', 'download', { ...ME, role: 'AUDIT_MANAGER' });
    expect(createSignedUrl).toHaveBeenCalledWith(PATH, 300, { download: 'entrevista.wav' });
    expect(noteIssued).toHaveBeenCalledWith(ORG, [PATH]);
  });

  it('si no se entrega ningún enlace NO avisa: descarga negada, nota de texto, evidencia inexistente o fallo al firmar', async () => {
    const denied = build(ev({ capturedById: 'otra-persona' }));
    await expect(denied.svc.obtenerUrlMedia('cmpaper00000000000000001', 'cmev0000000000000000001', 'download', ME)).rejects.toBeInstanceOf(ForbiddenException);
    const text = build(ev({ storageKey: null }));
    await expect(text.svc.obtenerUrlMedia('cmpaper00000000000000001', 'cmev0000000000000000001', 'view', ME)).rejects.toBeInstanceOf(BadRequestException);
    const missing = build(null);
    await expect(missing.svc.obtenerUrlMedia('cmpaper00000000000000001', 'cmev0000000000000000001', 'view', ME)).rejects.toThrow('Evidencia no encontrada');
    const otherPaper = build(ev({ paperId: 'otro-papel' }));
    await expect(otherPaper.svc.obtenerUrlMedia('cmpaper00000000000000001', 'cmev0000000000000000001', 'view', ME)).rejects.toThrow('Evidencia no encontrada');
    const broken = build(ev(), { data: null, error: { message: 'storage caído' } });
    await expect(broken.svc.obtenerUrlMedia('cmpaper00000000000000001', 'cmev0000000000000000001', 'view', ME)).rejects.toThrow('storage caído');
    for (const b of [denied, text, missing, otherPaper, broken]) expect(b.noteIssued).not.toHaveBeenCalled();
  });

  it('sin la medición conectada (pruebas que construyen el servicio a mano) todo funciona igual', async () => {
    const { svc } = build(ev(), undefined, false);
    await expect(svc.obtenerUrlMedia('cmpaper00000000000000001', 'cmev0000000000000000001', 'view', ME)).resolves.toMatchObject({ url: 'https://firmada' });
  });
});
