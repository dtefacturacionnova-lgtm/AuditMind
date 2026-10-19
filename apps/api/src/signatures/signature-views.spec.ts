/* eslint-disable @typescript-eslint/no-explicit-any */
import { internalRequestView, publicDocumentView, publicRequestView, publicVerifyView } from './signature-views';

/** Fila con un valor "centinela" reconocible en CADA dato interno: si alguno aparece en una vista pública, se filtró. */
const SENTINEL = {
  id: 'SENT-ID', organizationId: 'SENT-ORG', auditId: 'SENT-AUDIT', targetId: 'SENT-TARGET', createdById: 'SENT-CREATOR',
  tokenHash: 'SENT-TOKENHASH', tokenEncrypted: 'SENT-TOKENENC', otpHash: 'SENT-OTPHASH', documentPath: 'SENT-DOCPATH/original.pdf',
  signedPdfPath: 'SENT-SIGNEDPATH/signed.pdf', revokedById: 'SENT-REVOKER', payload: { secret: 'SENT-PAYLOAD' },
};
const row = (over: Record<string, unknown> = {}): any => ({
  ...SENTINEL,
  documentType: 'EXTERNAL_CONFIRMATION', title: 'Confirmación de saldo', signerName: 'Juan Pérez', signerEmail: 'juan.perez@banco.com', signerRole: 'Gerente',
  status: 'PENDING', expiresAt: new Date('2026-11-01T00:00:00Z'), documentSha256: 'a'.repeat(64), signedAt: null, signedName: null, signedRole: null,
  sealStatus: 'NOT_APPLICABLE', sealedAt: null, tsaUrlUsed: null, signedPdfSha256: null, verificationCode: null, response: null, declineReason: null,
  createdAt: new Date(), sentAt: new Date(), sendCount: 1, reminderEnabled: true, viewedAt: null, signerIp: '203.0.113.7', revokedAt: null, revokedReason: null,
  ...over,
});
const FORBIDDEN = Object.values(SENTINEL).flatMap((v) => (typeof v === 'string' ? [v] : [])).concat('SENT-PAYLOAD', 'object/public');

describe('vistas públicas: solo lo imprescindible', () => {
  it('GET /request: claves exactas y el correo enmascarado', () => {
    const v = publicRequestView(row(), 'Pérez Cortez y Asociados', 'Confirmación externa (NIA 505)');
    expect(Object.keys(v).sort()).toEqual(['canDownloadSigned', 'documentLabel', 'expiresAt', 'maskedEmail', 'orgName', 'requiresOtp', 'signedAt', 'status', 'title']);
    expect(v.maskedEmail).toBe('j•••@b•••.com');
    const dump = JSON.stringify(v);
    for (const s of FORBIDDEN) expect(dump).not.toContain(s);
    expect(dump).not.toContain('juan.perez');
    expect(dump).not.toContain('203.0.113.7'); // ni siquiera su propia IP
  });

  it('VIEWED se muestra como PENDING y la descarga solo se ofrece si está firmada Y sellada', () => {
    expect(publicRequestView(row({ status: 'VIEWED' }), 'O', 'L').status).toBe('PENDING');
    expect(publicRequestView(row({ status: 'SIGNED', sealStatus: 'PENDING', signedAt: new Date() }), 'O', 'L').canDownloadSigned).toBe(false);
    expect(publicRequestView(row({ status: 'SIGNED', sealStatus: 'SEALED', signedAt: new Date() }), 'O', 'L').canDownloadSigned).toBe(true);
    expect(publicRequestView(row({ status: 'PENDING' }), 'O', 'L').signedAt).toBeNull();
  });

  it('GET /document: claves exactas, sin rutas ni identificadores (ni siquiera un enlace de Storage al PDF)', () => {
    const v = publicDocumentView(row(), {
      orgName: 'Org', documentLabel: 'Confirmación', consentText: 'texto', consentVersion: 'v1', privacyNotice: 'aviso', declineNotice: 'rechazo',
      form: { fields: [], allowAttachments: true, signedRoleRequired: true },
      attachments: [{ id: 'att1', originalName: 'estado.pdf', sizeBytes: 123, quarantinePath: 'SENT-Q', safePath: 'SENT-S' } as any],
    });
    expect(Object.keys(v).sort()).toEqual(['attachments', 'consentText', 'consentVersion', 'declineNotice', 'documentLabel', 'documentSha256', 'expiresAt', 'form', 'orgName', 'privacyNotice', 'signerName', 'signerRole', 'title']);
    expect(v.attachments).toEqual([{ id: 'att1', originalName: 'estado.pdf', sizeBytes: 123 }]); // sin rutas de Storage
    const dump = JSON.stringify(v);
    for (const s of [...FORBIDDEN, 'SENT-Q', 'SENT-S']) expect(dump).not.toContain(s);
  });

  it('GET /verify: claves exactas; no revela correo, IP ni identificadores', () => {
    const v = publicVerifyView(row({ status: 'SIGNED', sealStatus: 'SEALED', signedAt: new Date(), signedName: 'Juan Pérez', sealedAt: new Date(), signedPdfSha256: 'b'.repeat(64), verificationCode: 'AAAA-BBBB-CCCC-DDDD' }),
      { orgName: 'Org', documentLabel: 'Confirmación', sealFingerprint: 'AA:BB', acceptedHashes: ['b'.repeat(64)] });
    expect(Object.keys(v).sort()).toEqual(['acceptedHashes', 'documentLabel', 'orgName', 'sealFingerprint', 'sealedAt', 'sealing', 'signedAt', 'signedName', 'timestamped', 'title', 'valid']);
    const dump = JSON.stringify(v);
    for (const s of FORBIDDEN) expect(dump).not.toContain(s);
    expect(dump).not.toContain('juan.perez');
    expect(dump).not.toContain('203.0.113.7');
    expect(v.valid).toBe(true);
    expect(v.sealing).toBe(false);
  });
});

describe('vista interna: útil para el equipo, sin secretos', () => {
  it('no incluye hashes de token, token cifrado, código, ni rutas de Storage', () => {
    const v = internalRequestView(row({ status: 'SIGNED', signedPdfPath: 'SENT-SIGNEDPATH/signed.pdf', signedAt: new Date() }), {
      documentLabel: 'Confirmación',
      events: [{ seq: 1, type: 'CREATED', at: new Date(), ip: '1.1.1.1', userAgent: 'ua', detail: { x: 1 }, prevHash: 'SENT-PREV', hash: 'SENT-HASH' } as any],
      attachments: [{ id: 'a1', originalName: 'x.pdf', detectedType: 'pdf', sizeBytes: 1, scanStatus: 'CLEAN', submitted: true, safePath: 'SENT-S', quarantinePath: 'SENT-Q', originalSha256: 'o', safeSha256: 's' } as any],
    });
    const dump = JSON.stringify(v);
    for (const secret of ['SENT-TOKENHASH', 'SENT-TOKENENC', 'SENT-OTPHASH', 'SENT-DOCPATH', 'SENT-SIGNEDPATH', 'SENT-S', 'SENT-Q', 'SENT-PREV', 'SENT-HASH', 'SENT-PAYLOAD']) {
      expect(dump).not.toContain(secret);
    }
    expect(v.hasSignedPdf).toBe(true);
    expect(v.events[0]).toEqual({ seq: 1, type: 'CREATED', at: expect.any(String), ip: '1.1.1.1', userAgent: 'ua', detail: { x: 1 } });
    expect(v.attachments[0]).toMatchObject({ hasSafeCopy: true, scanStatus: 'CLEAN' });
  });
});
