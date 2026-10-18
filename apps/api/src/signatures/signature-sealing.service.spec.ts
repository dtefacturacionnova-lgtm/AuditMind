/* eslint-disable @typescript-eslint/no-explicit-any */
import { PDFDocument } from 'pdf-lib';
import { buildHarness, INFO, makePdf, user } from './testing/harness';
import { sha256Hex } from './signature-crypto.util';
import { verifyChain } from './signature-event-chain.util';
import { MAX_SEAL_ATTEMPTS } from './signature-sealing.service';

const SIGN = { signedName: 'Juan Pérez', signedRole: 'Gerente', consent: true, response: { agrees: true, comments: 'Conforme' } } as any;

/** Una solicitud ya firmada, lista para sellar (el sellado automático se desactiva para controlarlo desde la prueba). */
async function signed(env: Record<string, string> = {}) {
  const h = buildHarness(env);
  const c = await h.create();
  const session = await h.openSession(c.token);
  const spy = jest.spyOn(h.sealing, 'sealRequest').mockResolvedValue('SKIPPED');
  await h.public.sign(c.token, session, SIGN, INFO);
  spy.mockRestore();
  await new Promise((r) => setImmediate(r));
  h.email.sendSignatureOutcome.mockClear();
  const row = () => h.fake.requests.find((r) => r.id === c.id)!;
  return { h, ...c, row };
}

describe('Sellado', () => {
  afterEach(() => jest.restoreAllMocks());

  it('camino feliz: fusiona original + hoja de evidencia, firma la ÚLTIMA página con el sello de la organización y sella el tiempo', async () => {
    const { h, id, row } = await signed();
    expect(await h.sealing.sealRequest(id)).toBe('SEALED');

    const r = row();
    expect(r).toMatchObject({ sealStatus: 'SEALED', tsaUrlUsed: 'http://timestamp.digicert.com', signedPdfPath: `signature-requests/aud1/${id}/signed.pdf` });
    expect(r.sealedAt).toBeInstanceOf(Date);

    // la firma visible va en la página 2 (original de 1 página + hoja de evidencia de 1)
    expect(h.pdfTools.signCalls).toEqual([{ name: 'Pérez Cortez y Asociados · Sello de evidencia', pageNumber: 2 }]);
    expect(h.orgSeal.getOrCreateSeal).toHaveBeenCalledWith('org1'); // sello de LA organización de la solicitud
    expect(h.pdfTools.tsaCalls).toEqual(['http://timestamp.digicert.com']);

    // el archivo guardado es el sellado, y su huella queda registrada
    const final = await h.storage.download(r.signedPdfPath);
    expect(r.signedPdfSha256).toBe(sha256Hex(final));
    expect((await PDFDocument.load(final)).getPageCount()).toBe(2);
    expect(final.toString('latin1')).toContain('%SIGNED');

    // la cabeza de la cadena impresa es la del último evento ANTES de sellar; la cadena completa sigue íntegra
    const chain = await h.events.listChain(id);
    const sealedEvent = chain.at(-1)!;
    expect(sealedEvent).toMatchObject({ type: 'SEALED' });
    expect(chain.find((e) => e.hash === r.eventsHeadHash)!.type).toBe('SIGNED');
    expect(verifyChain(id, chain).ok).toBe(true);
    expect(sealedEvent.detail).toMatchObject({ sha256: r.signedPdfSha256, tsa: 'http://timestamp.digicert.com', headHash: r.eventsHeadHash });

    // efectos posteriores: gancho del documento y constancia al firmante
    expect(h.adapter.calls.sealed).toEqual([{ id, path: r.signedPdfPath }]);
    expect(h.email.sendSignatureCompleted).toHaveBeenCalledWith('juan@banco.com', expect.objectContaining({ verificationCode: r.verificationCode, orgName: 'Pérez Cortez y Asociados' }));
  });

  it('la hoja de evidencia lleva el código, la IP, el consentimiento y la respuesta, y ESCAPA lo que escribió el tercero', async () => {
    const { h, id, token, session, row } = await (async () => {
      const h = buildHarness();
      const c = await h.create();
      const session = await h.openSession(c.token);
      jest.spyOn(h.sealing, 'sealRequest').mockResolvedValue('SKIPPED');
      await h.public.sign(c.token, session, { signedName: '<img src=x onerror=alert(1)>', signedRole: 'Gerente "X" & Cía', consent: true, response: { agrees: false, comments: '<script>alert(1)</script>' } } as any, INFO);
      (h.sealing.sealRequest as jest.Mock).mockRestore();
      return { h, ...c, session, row: () => h.fake.requests.find((r) => r.id === c.id)! };
    })();
    void token; void session;
    await h.sealing.sealRequest(id);
    const html = h.pdf.lastBody;
    expect(html).toContain(row().verificationCode);
    expect(html).toContain(INFO.ip);
    expect(html).toContain(INFO.userAgent);
    expect(html).toContain('En desacuerdo');
    expect(html).toContain(row().documentSha256);
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('Gerente &quot;X&quot; &amp; Cía');
  });

  it('segunda autoridad de sello de tiempo si la primera no responde', async () => {
    const { h, id, row } = await signed();
    h.pdfTools.failTsa.add('http://timestamp.digicert.com');
    expect(await h.sealing.sealRequest(id)).toBe('SEALED');
    expect(row().tsaUrlUsed).toBe('http://timestamp.sectigo.com');
    expect(h.pdfTools.tsaCalls).toEqual(['http://timestamp.digicert.com', 'http://timestamp.sectigo.com']);
  });

  it('si NINGUNA responde: queda sellado sin sello de tiempo y se reintenta solo ese paso; la verificación acepta ambas huellas', async () => {
    const { h, id, row } = await signed();
    h.pdfTools.failTsa.add('http://timestamp.digicert.com').add('http://timestamp.sectigo.com');
    expect(await h.sealing.sealRequest(id)).toBe('SEALED');
    const firstSha = row().signedPdfSha256;
    expect(row()).toMatchObject({ sealStatus: 'SEALED', tsaUrlUsed: null });

    // el cron lo detecta y, con la autoridad ya disponible, le aplica el sello
    h.pdfTools.failTsa.clear();
    await h.sealing.runPending();
    expect(row().tsaUrlUsed).toBe('http://timestamp.digicert.com');
    expect(row().signedPdfSha256).not.toBe(firstSha);
    expect((await h.storage.download(row().signedPdfPath)).toString('latin1')).toContain('%TS:http://timestamp.digicert.com');

    const view = await h.public.verify(row().verificationCode);
    expect(view.acceptedHashes).toEqual(expect.arrayContaining([firstSha, row().signedPdfSha256]));
    expect(view.timestamped).toBe(true);
    // ya con sello de tiempo, no se vuelve a intentar
    h.pdfTools.tsaCalls.length = 0;
    await h.sealing.runPending();
    expect(h.pdfTools.tsaCalls).toHaveLength(0);
  });

  it('si la bitácora fue alterada, NO sella: FAILED, evento de integridad y alerta al equipo', async () => {
    const { h, id, row } = await signed();
    h.fake.events.find((e) => e.type === 'CREATED')!.ip = '6.6.6.6'; // edición directa en la base
    expect(await h.sealing.sealRequest(id)).toBe('FAILED');
    expect(row().sealStatus).toBe('FAILED');
    expect(row().signedPdfPath).toBeNull();
    expect(h.fake.events.at(-1)).toMatchObject({ type: 'INTEGRITY_FAILED' });
    expect(h.pdfTools.signCalls).toHaveLength(0);
    expect(h.email.sendSignatureIntegrityAlert).toHaveBeenCalledWith('auditor@despacho.com', expect.objectContaining({ title: expect.any(String) }));
  });

  it('si el PDF original fue reemplazado, NO sella', async () => {
    const { h, id, row } = await signed();
    h.storage.files.set(row().documentPath, await makePdf(5));
    expect(await h.sealing.sealRequest(id)).toBe('FAILED');
    expect(h.fake.events.at(-1)!.detail).toMatchObject({ phase: 'seal' });
    expect(h.pdfTools.signCalls).toHaveLength(0);
  });

  it('un fallo técnico se reintenta; al quinto intento queda FAILED y avisa; "reintentar" lo reinicia', async () => {
    const { h, id, row } = await signed();
    jest.spyOn(h.pdf, 'generateBranded').mockRejectedValue(new Error('Chromium no disponible'));
    for (let i = 1; i < MAX_SEAL_ATTEMPTS; i++) {
      expect(await h.sealing.sealRequest(id)).toBe('RETRY');
      expect(row()).toMatchObject({ sealStatus: 'PENDING', sealAttempts: i });
    }
    expect(await h.sealing.sealRequest(id)).toBe('FAILED');
    expect(row().sealStatus).toBe('FAILED');
    expect(h.fake.events.filter((e) => e.type === 'SEAL_FAILED')).toHaveLength(MAX_SEAL_ATTEMPTS);
    expect(h.email.sendSignatureSealFailed).toHaveBeenCalledTimes(1);
    expect(await h.sealing.sealRequest(id)).toBe('SKIPPED'); // ya no se toca solo

    // el auditor reintenta desde el panel y esta vez funciona
    (h.pdf.generateBranded as any).mockRestore?.();
    await h.requests.reseal(user('AUDITOR'), id); // dispara el sellado en segundo plano
    for (let i = 0; i < 100 && row().sealStatus !== 'SEALED'; i++) await new Promise((r) => setTimeout(r, 20));
    expect(row().sealStatus).toBe('SEALED');
  });

  it('dos ejecuciones simultáneas sellan UNA sola vez', async () => {
    const { h, id } = await signed();
    const [a, b] = await Promise.all([h.sealing.sealRequest(id), h.sealing.sealRequest(id)]);
    expect([a, b].sort()).toEqual(['SEALED', 'SKIPPED']);
    expect(h.pdfTools.signCalls).toHaveLength(1);
    expect(h.fake.events.filter((e) => e.type === 'SEALED')).toHaveLength(1);
  });

  it('la cola (cron) sella lo pendiente y respeta el límite de intentos', async () => {
    const { h, id, row } = await signed();
    expect(await h.sealing.runPending()).toBe(1);
    expect(row().sealStatus).toBe('SEALED');
    expect(await h.sealing.runPending()).toBe(0);
    expect(id).toBeDefined();
  });

  it('lo no firmado o rechazado nunca se sella', async () => {
    const h = buildHarness();
    const { id, token } = await h.create();
    expect(await h.sealing.sealRequest(id)).toBe('SKIPPED');
    const session = await h.openSession(token);
    await h.public.decline(token, session, { reason: 'No corresponde' }, INFO);
    expect(await h.sealing.sealRequest(id)).toBe('SKIPPED');
    expect(h.pdfTools.signCalls).toHaveLength(0);
  });

  it('si falla el gancho posterior (afterSealed) la firma y el sello NO se pierden', async () => {
    const { h, id, row } = await signed();
    h.adapter.afterSealed = async () => { throw new Error('no se pudo adjuntar al papel'); };
    expect(await h.sealing.sealRequest(id)).toBe('SEALED');
    expect(row().sealStatus).toBe('SEALED');
  });
});
