import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SignatureRequest } from '@prisma/client';
import { PDFDocument } from 'pdf-lib';
import { PrismaService } from '../prisma/prisma.service';
import { PdfService } from '../pdf/pdf.service';
import { PdfToolsService } from '../pdf-tools/pdf-tools.service';
import { EmailService } from '../email/email.service';
import { OrganizationSealService } from './organization-seal.service';
import { SignatureAdapterRegistry } from './signature-documents';
import { SignatureEventsService, TX_OPTIONS } from './signature-events.service';
import { requestFolder, SignatureStorageService } from './signature-storage.service';
import { renderEvidenceBody } from './evidence-sheet';
import { sha256Hex } from './signature-crypto.util';
import { verifyChain } from './signature-event-chain.util';
import { CONSENT_VERSION } from './legal-texts';

export const MAX_SEAL_ATTEMPTS = 5;
/** El sello de tiempo pendiente se reintenta hasta este total de intentos y por 3 días. */
const MAX_TIMESTAMP_ATTEMPTS = 8;
const TIMESTAMP_RETRY_DAYS = 3;
const DEFAULT_TSA_URLS = 'http://timestamp.digicert.com,http://timestamp.sectigo.com';

export type SealOutcome = 'SEALED' | 'SKIPPED' | 'FAILED' | 'RETRY';

const fmtSvLong = (d: Date) =>
  new Intl.DateTimeFormat('es-SV', { timeZone: 'America/El_Salvador', dateStyle: 'long', timeStyle: 'short' }).format(d);

/**
 * Sellado del documento firmado (docs/firma-externa-por-enlace.md §10):
 * verificar integridad → hoja de evidencia → fusionar → sello de la organización → sello de tiempo →
 * guardar. La firma YA está registrada en BD cuando esto corre: un fallo aquí no la pierde, se reintenta.
 */
@Injectable()
export class SignatureSealingService {
  private readonly logger = new Logger(SignatureSealingService.name);
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: SignatureStorageService,
    private readonly events: SignatureEventsService,
    private readonly pdf: PdfService,
    private readonly pdfTools: PdfToolsService,
    private readonly orgSeal: OrganizationSealService,
    private readonly email: EmailService,
    private readonly registry: SignatureAdapterRegistry,
    private readonly config: ConfigService,
  ) {}

  private tsaUrls(): string[] {
    return (this.config.get<string>('SIGNATURE_TSA_URLS') || DEFAULT_TSA_URLS).split(',').map((s) => s.trim()).filter(Boolean);
  }

  /** Aplica el sello de tiempo con la primera autoridad que responda. */
  private async timestamp(pdf: Buffer): Promise<{ pdf: Buffer; tsa: string | null }> {
    for (const tsa of this.tsaUrls()) {
      try {
        return { pdf: await this.pdfTools.timestampPdf(pdf, 'documento-firmado.pdf', tsa), tsa };
      } catch (err) {
        this.logger.warn(`Autoridad de sello de tiempo ${tsa} no respondió: ${(err as Error).message?.slice(0, 120)}`);
      }
    }
    return { pdf, tsa: null };
  }

  // ─── Sellado principal ─────────────────────────────────────────────────────
  /**
   * Nunca rechaza: se llama en segundo plano (`void`) y una promesa rechazada sin manejar tumba el proceso de Node
   * (revisión de seguridad F5b, 2026-10-19). Si la BD falla incluso al registrar el fallo, se registra en el log y el cron
   * lo vuelve a intentar.
   */
  async sealRequest(id: string): Promise<SealOutcome> {
    if (this.inFlight.has(id)) return 'SKIPPED';
    this.inFlight.add(id);
    try {
      // "Reclamar" el trabajo de forma atómica: cuenta el intento y evita que dos ejecuciones sellen lo mismo.
      const claimed = await this.prisma.signatureRequest.updateMany({
        where: { id, status: 'SIGNED', sealStatus: 'PENDING' },
        data: { sealAttempts: { increment: 1 } },
      });
      if (claimed.count === 0) return 'SKIPPED';
      const req = await this.prisma.signatureRequest.findUniqueOrThrow({ where: { id } });
      try {
        return await this.doSeal(req);
      } catch (err) {
        return await this.handleFailure(req, err);
      }
    } catch (err) {
      this.logger.error(`Sellado de ${id} no pudo completarse ni registrarse: ${(err as Error).message?.slice(0, 200)}`);
      return 'RETRY';
    } finally {
      this.inFlight.delete(id);
    }
  }

  private async doSeal(req: SignatureRequest): Promise<SealOutcome> {
    // 1. Integridad ANTES de sellar: bitácora íntegra y PDF original intacto.
    const chain = await this.events.listChain(req.id);
    const verification = verifyChain(req.id, chain);
    if (!verification.ok) return this.failIntegrity(req, `bitácora: ${verification.reason} (evento ${verification.brokenAtSeq})`);
    const original = await this.storage.download(req.documentPath);
    if (sha256Hex(original) !== req.documentSha256) return this.failIntegrity(req, 'la huella del PDF original no coincide');

    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: req.organizationId }, select: { name: true } });
    const attachments = await this.prisma.signatureAttachment.findMany({
      where: { requestId: req.id, submitted: true, scanStatus: 'CLEAN' }, orderBy: { createdAt: 'asc' },
    });
    const adapter = this.registry.find(req.documentType);
    const payload = (req.payload ?? {}) as Record<string, unknown>;
    const response = (req.response ?? {}) as Record<string, unknown>;
    const headHash = chain[chain.length - 1].hash;

    // 2. Hoja de evidencia.
    const evidenceHtml = renderEvidenceBody({
      orgName: org.name,
      documentLabel: adapter?.label ?? req.documentType,
      title: req.title,
      verificationCode: req.verificationCode ?? '—',
      verifyUrl: this.email.verifyUrl(),
      documentSha256: req.documentSha256,
      expectedSignerName: req.signerName,
      signerEmail: req.signerEmail,
      signedName: req.signedName ?? '',
      signedRole: req.signedRole,
      emailVerifiedAt: req.otpVerifiedAt,
      signerIp: req.signerIp,
      signerUserAgent: req.signerUserAgent,
      signedAt: req.signedAt ?? new Date(),
      consentVersion: req.consentVersion ?? CONSENT_VERSION,
      consentText: req.consentText ?? '',
      responseLines: adapter ? adapter.summarizeResponse(payload, response) : [],
      attachments: attachments.map((a) => ({
        originalName: a.originalName, sizeBytes: a.sizeBytes, originalSha256: a.originalSha256, safeSha256: a.safeSha256,
      })),
      events: chain.map((e) => ({ seq: e.seq, type: e.type, at: e.at, ip: e.ip ?? null })),
      headHash,
    });
    const evidencePdf = await this.pdf.generateBranded({
      title: 'Hoja de evidencia de firma electrónica',
      subtitle: req.title,
      body: evidenceHtml,
      options: { printPageNumbers: true, format: 'A4', footerNote: `Hoja de evidencia · ${req.verificationCode ?? ''}` },
    });

    // 3. Fusionar, sellar (firma visible en la ÚLTIMA página = la hoja de evidencia) y sellar el tiempo.
    const merged = await this.pdfTools.mergePdfs([
      { buffer: original, filename: 'documento.pdf' },
      { buffer: evidencePdf, filename: 'evidencia.pdf' },
    ]);
    const totalPages = (await PDFDocument.load(merged, { ignoreEncryption: true })).getPageCount();
    const seal = await this.orgSeal.getOrCreateSeal(req.organizationId);
    const signed = await this.pdfTools.signPdf(
      merged, 'documento-firmado.pdf',
      { privateKeyPem: Buffer.from(seal.privateKeyPem), certPem: Buffer.from(seal.certPem) },
      { name: `${org.name} · Sello de evidencia`, reason: 'Constancia de firma electrónica simple', location: 'AuditMind', pageNumber: totalPages, showSignature: true },
    );
    const { pdf: finalPdf, tsa } = await this.timestamp(signed);

    // 4. Guardar. Se sobrescribe a propósito: es un artefacto derivado que se puede regenerar (un reintento tras
    //    un fallo parcial no debe chocar con el archivo de un intento anterior).
    const finalSha = sha256Hex(finalPdf);
    const signedPath = `${requestFolder(req.id, req.organizationId, req.auditId)}/signed.pdf`;
    await this.storage.upload(signedPath, finalPdf, 'application/pdf', true);

    await this.prisma.$transaction(async (tx) => {
      await tx.signatureRequest.update({
        where: { id: req.id },
        data: { sealStatus: 'SEALED', sealedAt: new Date(), tsaUrlUsed: tsa, signedPdfPath: signedPath, signedPdfSha256: finalSha, eventsHeadHash: headHash },
      });
      await this.events.append(tx, req.id, { type: 'SEALED', detail: { sha256: finalSha, tsa, headHash } });
    }, TX_OPTIONS);

    // 5. Efectos posteriores (mejor esfuerzo: la firma y el sello ya están a salvo).
    if (adapter?.afterSealed) {
      try { await adapter.afterSealed(req, signedPath, finalPdf); }
      catch (err) { this.logger.error(`afterSealed(${req.documentType}) falló para ${req.id}: ${(err as Error).message}`); }
    }
    await this.email.sendSignatureCompleted(req.signerEmail, {
      orgName: org.name, title: req.title, verificationCode: req.verificationCode ?? '', signedAt: fmtSvLong(req.signedAt ?? new Date()),
    }).catch(() => undefined);
    this.logger.log(`Solicitud ${req.id} sellada (${totalPages} págs, sello de tiempo: ${tsa ?? 'pendiente'})`);
    return 'SEALED';
  }

  private async failIntegrity(req: SignatureRequest, reason: string): Promise<SealOutcome> {
    this.logger.error(`INTEGRIDAD: solicitud ${req.id} no se selló: ${reason}`);
    await this.prisma.$transaction(async (tx) => {
      await tx.signatureRequest.update({ where: { id: req.id }, data: { sealStatus: 'FAILED' } });
      await this.events.append(tx, req.id, { type: 'INTEGRITY_FAILED', detail: { phase: 'seal', reason } });
    }, TX_OPTIONS);
    await this.notifyCreator(req, 'integrity');
    return 'FAILED';
  }

  private async handleFailure(req: SignatureRequest, err: unknown): Promise<SealOutcome> {
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 200);
    const attempts = (await this.prisma.signatureRequest.findUnique({ where: { id: req.id }, select: { sealAttempts: true } }))?.sealAttempts ?? req.sealAttempts;
    const exhausted = attempts >= MAX_SEAL_ATTEMPTS;
    this.logger.error(`Sellado de ${req.id} falló (intento ${attempts}/${MAX_SEAL_ATTEMPTS}): ${message}`);
    await this.prisma.$transaction(async (tx) => {
      if (exhausted) await tx.signatureRequest.update({ where: { id: req.id }, data: { sealStatus: 'FAILED' } });
      await this.events.append(tx, req.id, { type: 'SEAL_FAILED', detail: { attempt: attempts, error: message, final: exhausted } });
    }, TX_OPTIONS);
    if (exhausted) { await this.notifyCreator(req, 'seal'); return 'FAILED'; }
    return 'RETRY';
  }

  private async notifyCreator(req: SignatureRequest, kind: 'seal' | 'integrity') {
    const creator = await this.prisma.user.findUnique({ where: { id: req.createdById }, select: { email: true } });
    if (!creator?.email) return;
    const panelPath = req.auditId ? `/dashboard/audits/${req.auditId}` : '/dashboard/portfolio';
    if (kind === 'seal') await this.email.sendSignatureSealFailed(creator.email, { title: req.title, panelPath }).catch(() => undefined);
    else await this.email.sendSignatureIntegrityAlert(creator.email, { title: req.title, panelPath }).catch(() => undefined);
  }

  /** "Reintentar sellado" del panel: devuelve la solicitud a PENDING con el contador en cero. */
  async requeue(id: string, organizationId: string): Promise<boolean> {
    const r = await this.prisma.signatureRequest.updateMany({
      where: { id, organizationId, status: 'SIGNED', sealStatus: { in: ['FAILED', 'PENDING'] } },
      data: { sealStatus: 'PENDING', sealAttempts: 0 },
    });
    return r.count === 1;
  }

  // ─── Sello de tiempo pendiente ─────────────────────────────────────────────
  /** PDF sellado al que no se le pudo aplicar sello de tiempo (ninguna autoridad respondió): se reintenta. */
  async retryTimestamp(id: string): Promise<boolean> {
    if (this.inFlight.has(id)) return false;
    this.inFlight.add(id);
    try {
      const req = await this.prisma.signatureRequest.findFirst({
        where: { id, status: 'SIGNED', sealStatus: 'SEALED', tsaUrlUsed: null, sealAttempts: { lt: MAX_TIMESTAMP_ATTEMPTS } },
      });
      if (!req?.signedPdfPath) return false;
      await this.prisma.signatureRequest.update({ where: { id }, data: { sealAttempts: { increment: 1 } } });
      const current = await this.storage.download(req.signedPdfPath);
      // Se sella el tiempo SOLO sobre el PDF que se selló: si el archivo guardado ya no es ese, no se "legitima" otro
      // con una huella nueva (revisión de seguridad F5b, 2026-10-19).
      if (!req.signedPdfSha256 || sha256Hex(current) !== req.signedPdfSha256) {
        this.logger.error(`INTEGRIDAD: el PDF sellado de ${id} cambió; no se aplica el sello de tiempo`);
        await this.events.appendStandalone(id, { type: 'INTEGRITY_FAILED', detail: { phase: 'timestamp', reason: 'la huella del PDF sellado no coincide' } });
        await this.prisma.signatureRequest.update({ where: { id }, data: { sealAttempts: MAX_TIMESTAMP_ATTEMPTS } }); // no reintentar
        await this.notifyCreator(req, 'integrity');
        return false;
      }
      const { pdf, tsa } = await this.timestamp(current);
      if (!tsa) return false;
      const sha = sha256Hex(pdf);
      await this.storage.upload(req.signedPdfPath, pdf, 'application/pdf', true);
      await this.prisma.$transaction(async (tx) => {
        await tx.signatureRequest.update({ where: { id }, data: { tsaUrlUsed: tsa, signedPdfSha256: sha } });
        await this.events.append(tx, id, { type: 'SEALED', detail: { phase: 'timestamp', sha256: sha, tsa } });
      }, TX_OPTIONS);
      this.logger.log(`Sello de tiempo aplicado a la solicitud ${id} (${tsa})`);
      return true;
    } catch (err) {
      this.logger.warn(`Reintento de sello de tiempo de ${id} falló: ${(err as Error).message?.slice(0, 120)}`);
      return false;
    } finally {
      this.inFlight.delete(id);
    }
  }

  // ─── Cola (la usa el cron) ─────────────────────────────────────────────────
  async runPending(limit = 5): Promise<number> {
    const pending = await this.prisma.signatureRequest.findMany({
      where: { status: 'SIGNED', sealStatus: 'PENDING', sealAttempts: { lt: MAX_SEAL_ATTEMPTS } },
      orderBy: { signedAt: 'asc' }, take: limit, select: { id: true },
    });
    let done = 0;
    for (const p of pending) if ((await this.sealRequest(p.id)) === 'SEALED') done++;

    const since = new Date(Date.now() - TIMESTAMP_RETRY_DAYS * 24 * 3600 * 1000);
    const untimestamped = await this.prisma.signatureRequest.findMany({
      where: { status: 'SIGNED', sealStatus: 'SEALED', tsaUrlUsed: null, sealedAt: { gte: since }, sealAttempts: { lt: MAX_TIMESTAMP_ATTEMPTS } },
      orderBy: { sealedAt: 'asc' }, take: limit, select: { id: true },
    });
    for (const u of untimestamped) await this.retryTimestamp(u.id);
    return done;
  }
}
