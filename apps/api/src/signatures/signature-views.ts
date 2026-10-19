import { SignatureAttachment, SignatureEvent, SignatureRequest } from '@prisma/client';
import { maskEmail } from './signature-crypto.util';
import { FormSpec } from './signature-documents';

/**
 * Vistas de salida de la firma por enlace (docs/firma-externa-por-enlace.md §9).
 *
 * REGLA: toda respuesta pública se construye aquí, campo por campo, con una lista explícita. Nunca se
 * devuelve una fila de la BD ni se hace `...row`. Prohibido en vistas públicas: id interno,
 * organizationId, auditId, targetId, createdById, correos o nombres del equipo, tokenHash, tokenEncrypted,
 * otpHash, rutas de Storage y URLs canónicas `.../object/public/...`. `signature-views.spec.ts` lo comprueba
 * con las claves exactas.
 */

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

// ─── Públicas ────────────────────────────────────────────────────────────────

/** GET /request — sin contenido del documento. */
export function publicRequestView(r: SignatureRequest, orgName: string, documentLabel: string) {
  const signed = r.status === 'SIGNED';
  return {
    orgName,
    documentLabel,
    title: r.title,
    maskedEmail: maskEmail(r.signerEmail),
    expiresAt: iso(r.expiresAt),
    // VIEWED es un detalle interno: para el firmante sigue "pendiente".
    status: r.status === 'VIEWED' ? 'PENDING' : r.status,
    requiresOtp: true as const,
    signedAt: signed ? iso(r.signedAt) : null,
    canDownloadSigned: signed && r.sealStatus === 'SEALED',
  };
}

/** GET /document — tras verificar el código. */
export function publicDocumentView(
  r: SignatureRequest,
  p: {
    orgName: string; documentLabel: string; pdfUrl: string;
    consentText: string; consentVersion: string; privacyNotice: string; declineNotice: string;
    form: FormSpec; attachments: Pick<SignatureAttachment, 'id' | 'originalName' | 'sizeBytes'>[];
  },
) {
  return {
    title: r.title,
    documentLabel: p.documentLabel,
    orgName: p.orgName,
    signerName: r.signerName,
    signerRole: r.signerRole,
    expiresAt: iso(r.expiresAt),
    documentSha256: r.documentSha256,
    pdfUrl: p.pdfUrl,
    consentVersion: p.consentVersion,
    consentText: p.consentText,
    privacyNotice: p.privacyNotice,
    declineNotice: p.declineNotice,
    form: p.form,
    attachments: p.attachments.map((a) => ({ id: a.id, originalName: a.originalName, sizeBytes: a.sizeBytes })),
  };
}

/** GET /verify/:code — página pública de verificación. */
export function publicVerifyView(
  r: SignatureRequest,
  p: { orgName: string; documentLabel: string; sealFingerprint: string | null; acceptedHashes: string[] },
) {
  return {
    valid: r.status === 'SIGNED',
    sealing: r.status === 'SIGNED' && r.sealStatus !== 'SEALED',
    documentLabel: p.documentLabel,
    title: r.title,
    orgName: p.orgName,
    signedAt: iso(r.signedAt),
    signedName: r.signedName,
    sealedAt: iso(r.sealedAt),
    // Huellas con las que el PDF sellado puede coincidir (la que tenía al sellarse y, si luego se le
    // aplicó sello de tiempo, la final). El navegador compara; el archivo nunca se sube.
    acceptedHashes: p.acceptedHashes,
    sealFingerprint: p.sealFingerprint,
    timestamped: r.tsaUrlUsed !== null,
  };
}

// ─── Internas (equipo autenticado) ───────────────────────────────────────────

/** Lista y detalle para el panel interno. No incluye secretos ni rutas de Storage. */
export function internalRequestView(
  r: SignatureRequest,
  extra: { documentLabel: string; events?: SignatureEvent[]; attachments?: SignatureAttachment[] },
) {
  return {
    id: r.id,
    documentType: r.documentType,
    documentLabel: extra.documentLabel,
    targetId: r.targetId,
    auditId: r.auditId,
    title: r.title,
    signerName: r.signerName,
    signerEmail: r.signerEmail,
    signerRole: r.signerRole,
    status: r.status,
    sealStatus: r.sealStatus,
    createdAt: iso(r.createdAt),
    expiresAt: iso(r.expiresAt),
    sentAt: iso(r.sentAt),
    sendCount: r.sendCount,
    reminderEnabled: r.reminderEnabled,
    viewedAt: iso(r.viewedAt),
    signedAt: iso(r.signedAt),
    signedName: r.signedName,
    signedRole: r.signedRole,
    signerIp: r.signerIp,
    response: r.response,
    declineReason: r.declineReason,
    verificationCode: r.verificationCode,
    documentSha256: r.documentSha256,
    signedPdfSha256: r.signedPdfSha256,
    sealedAt: iso(r.sealedAt),
    timestamped: r.tsaUrlUsed !== null,
    revokedAt: iso(r.revokedAt),
    revokedReason: r.revokedReason,
    hasSignedPdf: r.signedPdfPath !== null,
    events: (extra.events ?? []).map((e) => ({ seq: e.seq, type: e.type, at: iso(e.at), ip: e.ip, userAgent: e.userAgent, detail: e.detail })),
    attachments: (extra.attachments ?? []).map((a) => ({
      id: a.id, originalName: a.originalName, detectedType: a.detectedType, sizeBytes: a.sizeBytes,
      scanStatus: a.scanStatus, submitted: a.submitted, hasSafeCopy: a.safePath !== null,
      originalSha256: a.originalSha256, safeSha256: a.safeSha256,
    })),
  };
}
