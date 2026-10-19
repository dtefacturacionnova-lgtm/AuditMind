import {
  BadRequestException, ConflictException, ForbiddenException, GoneException, HttpException, Injectable, Logger,
  NotFoundException, ServiceUnavailableException, UnauthorizedException,
} from '@nestjs/common';
import { Prisma, SignatureRequest, SignatureSession } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { ClientInfo } from './request-info.util';
import { DeclineDto, SignDto } from './dto/signature.dto';
import {
  deriveOtpKey, generateOtp, generateToken, generateVerificationCode, hashToken, hmacOtp, isWellFormedToken,
  maskEmail, normalizeVerificationCode, sha256Hex, verifyOtp,
} from './signature-crypto.util';
import { SignatureAdapterRegistry, SignatureDocumentAdapter } from './signature-documents';
import { SignatureEventsService, TX_OPTIONS } from './signature-events.service';
import { SignaturePolicyService } from './signature-policy.service';
import { SignatureSealingService } from './signature-sealing.service';
import { SignatureAttachmentsService } from './signature-attachments.service';
import { SignatureStorageService } from './signature-storage.service';
import { OrganizationSealService } from './organization-seal.service';
import { CONSENT_VERSION, renderConsentText, renderDeclineNotice, renderPrivacyNotice } from './legal-texts';
import { publicDocumentView, publicRequestView, publicVerifyView } from './signature-views';

// ─── Parámetros de seguridad (docs/firma-externa-por-enlace.md §6) ───────────
export const OTP_TTL_MS = 10 * 60_000;
export const OTP_MIN_GAP_MS = 60_000;
export const OTP_MAX_SENDS_PER_HOUR = 5;
export const OTP_MAX_FAILS_PER_CODE = 5;
export const OTP_MAX_FAILS_PER_HOUR = 10;
export const OTP_LOCK_MS = 3_600_000;
export const SESSION_TTL_MS = 30 * 60_000;
export const SIGNED_DOWNLOAD_DAYS = 30;
const HOUR_MS = 3_600_000;
const ACTIVE = ['PENDING', 'VIEWED'] as const;

const INVALID_LINK = 'Enlace no válido o reemplazado por uno más reciente. Revisa el último correo que recibiste.';
const locked = () => new HttpException('Demasiados intentos. Vuelve a intentarlo en una hora.', 423);

/**
 * Flujo PÚBLICO del firmante (sin cuenta). Cada operación parte del token del enlace (cabecera X-Signature-Token) y,
 * salvo la verificación del correo, de una sesión corta obtenida con el código (X-Signature-Session).
 * Nunca se registran ni se devuelven tokens, códigos o sesiones.
 */
@Injectable()
export class SignaturePublicService {
  private readonly logger = new Logger(SignaturePublicService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: SignatureEventsService,
    private readonly storage: SignatureStorageService,
    private readonly attachments: SignatureAttachmentsService,
    private readonly sealing: SignatureSealingService,
    private readonly orgSeal: OrganizationSealService,
    private readonly registry: SignatureAdapterRegistry,
    private readonly policy: SignaturePolicyService,
    private readonly email: EmailService,
  ) {}

  // ═══ Resolución del enlace y la sesión ══════════════════════════════════════
  private async loadByToken(token: unknown): Promise<SignatureRequest> {
    if (!isWellFormedToken(token)) throw new NotFoundException(INVALID_LINK);
    const r = await this.prisma.signatureRequest.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!r) throw new NotFoundException(INVALID_LINK);
    return r;
  }

  private static isActive(r: Pick<SignatureRequest, 'status'>): boolean {
    return (ACTIVE as readonly string[]).includes(r.status);
  }

  /** Revocada, vencida (por fecha o por estado) o fuera de la ventana de descarga → 410. */
  private assertNotGone(r: SignatureRequest, now = new Date()): void {
    if (r.status === 'REVOKED') throw new GoneException({ message: 'Esta solicitud fue cancelada por quien la envió.', reason: 'revoked' });
    const expired = r.status === 'EXPIRED'
      || (SignaturePublicService.isActive(r) && r.expiresAt.getTime() <= now.getTime())
      || (r.status === 'SIGNED' && !!r.signedAt && now.getTime() > r.signedAt.getTime() + SIGNED_DOWNLOAD_DAYS * 864e5);
    if (expired) throw new GoneException({ message: 'Este enlace venció. Pide uno nuevo a quien te lo envió.', reason: 'expired' });
  }

  /** Para operar sobre la solicitud (ver, adjuntar, firmar, rechazar): debe estar pendiente. */
  private assertOpen(r: SignatureRequest, now = new Date()): void {
    this.assertNotGone(r, now);
    if (r.status === 'SIGNED') throw new ConflictException({ message: 'Esta solicitud ya fue firmada.', status: 'SIGNED' });
    if (r.status === 'DECLINED') throw new ConflictException({ message: 'Esta solicitud ya fue rechazada.', status: 'DECLINED' });
  }

  /** Para pedir/verificar el código: pendiente, o firmada dentro de la ventana de descarga. */
  private assertOtpAllowed(r: SignatureRequest, now = new Date()): void {
    this.assertNotGone(r, now);
    if (r.status === 'DECLINED') throw new ConflictException({ message: 'Esta solicitud ya fue rechazada.', status: 'DECLINED' });
  }

  private async requireSession(r: SignatureRequest, sessionToken: unknown): Promise<SignatureSession> {
    if (!isWellFormedToken(sessionToken)) throw new UnauthorizedException('Verifica tu correo nuevamente.');
    const s = await this.prisma.signatureSession.findUnique({ where: { tokenHash: hashToken(sessionToken) } });
    if (!s || s.requestId !== r.id || s.revokedAt || s.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Verifica tu correo nuevamente.');
    }
    return s;
  }

  private adapter(r: SignatureRequest): SignatureDocumentAdapter {
    const a = this.registry.find(r.documentType);
    if (!a) throw new ServiceUnavailableException('Este tipo de documento no está disponible en este momento.');
    return a;
  }

  private async orgName(organizationId: string): Promise<string> {
    return (await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } })).name;
  }

  // ═══ GET /request ═══════════════════════════════════════════════════════════
  async getRequest(token: unknown) {
    this.policy.assertEnabled();
    const r = await this.loadByToken(token);
    this.assertNotGone(r);
    const label = this.registry.find(r.documentType)?.label ?? 'Documento';
    return publicRequestView(r, await this.orgName(r.organizationId), label);
  }

  // ═══ POST /otp/send ═════════════════════════════════════════════════════════
  async sendOtp(token: unknown, info: ClientInfo) {
    this.policy.assertEnabled();
    const key = deriveOtpKey(this.policy.encryptionKey());
    const r0 = await this.loadByToken(token);
    this.assertOtpAllowed(r0);
    await this.policy.assertDailyEmailCap(r0.organizationId);

    const code = generateOtp();
    const outcome = await this.prisma.$transaction(async (tx) => {
      await this.events.lock(tx, r0.id);
      const cur = await tx.signatureRequest.findUniqueOrThrow({ where: { id: r0.id } });
      this.assertOtpAllowed(cur);
      const now = new Date();
      if (cur.lockedUntil && cur.lockedUntil > now) return { kind: 'locked' as const };

      const fresh = !cur.otpWindowStart || now.getTime() - cur.otpWindowStart.getTime() > HOUR_MS;
      const windowStart = fresh ? now : cur.otpWindowStart!;
      const sentCount = fresh ? 0 : cur.otpSentCount;
      const failures = fresh ? 0 : cur.otpFailuresHour;

      if (cur.otpLastSentAt) {
        const wait = OTP_MIN_GAP_MS - (now.getTime() - cur.otpLastSentAt.getTime());
        if (wait > 0) return { kind: 'wait' as const, seconds: Math.ceil(wait / 1000) };
      }
      if (sentCount >= OTP_MAX_SENDS_PER_HOUR) return { kind: 'limit' as const };

      await tx.signatureRequest.update({
        where: { id: cur.id },
        data: {
          otpHash: hmacOtp(code, key, cur.id), otpExpiresAt: new Date(now.getTime() + OTP_TTL_MS), otpAttempts: 0,
          otpSentCount: sentCount + 1, otpLastSentAt: now, otpWindowStart: windowStart, otpFailuresHour: failures,
        },
      });
      await this.events.append(tx, cur.id, { type: 'OTP_SENT', ip: info.ip, userAgent: info.userAgent });
      return { kind: 'ok' as const };
    }, TX_OPTIONS);

    if (outcome.kind === 'locked') throw locked();
    if (outcome.kind === 'wait') throw new HttpException(`Espera ${outcome.seconds} segundos para pedir otro código.`, 429);
    if (outcome.kind === 'limit') throw new HttpException('Pediste demasiados códigos. Inténtalo de nuevo más tarde.', 429);

    const sent = await this.email.sendSignatureOtp(r0.signerEmail, { orgName: await this.orgName(r0.organizationId), code });
    if (!sent.sent) throw new ServiceUnavailableException('No pudimos enviar el código. Inténtalo de nuevo en unos minutos.');
    return { sent: true, maskedEmail: maskEmail(r0.signerEmail), resendInSeconds: OTP_MIN_GAP_MS / 1000 };
  }

  // ═══ POST /otp/verify ═══════════════════════════════════════════════════════
  async verifyOtp(token: unknown, code: string, info: ClientInfo) {
    this.policy.assertEnabled();
    const key = deriveOtpKey(this.policy.encryptionKey());
    const r0 = await this.loadByToken(token);
    this.assertOtpAllowed(r0);

    // El resultado se calcula dentro de la transacción y las excepciones se lanzan DESPUÉS: los contadores de
    // intentos fallidos deben guardarse aunque la respuesta sea un error.
    const outcome = await this.prisma.$transaction(async (tx) => {
      await this.events.lock(tx, r0.id);
      const cur = await tx.signatureRequest.findUniqueOrThrow({ where: { id: r0.id } });
      this.assertOtpAllowed(cur);
      const now = new Date();
      if (cur.lockedUntil && cur.lockedUntil > now) return { kind: 'locked' as const };
      if (!cur.otpHash || !cur.otpExpiresAt || cur.otpExpiresAt <= now) return { kind: 'none' as const };

      const fresh = !cur.otpWindowStart || now.getTime() - cur.otpWindowStart.getTime() > HOUR_MS;
      const windowStart = fresh ? now : cur.otpWindowStart!;
      const sentCount = fresh ? 0 : cur.otpSentCount;
      const failuresBefore = fresh ? 0 : cur.otpFailuresHour;

      if (verifyOtp(code, key, cur.id, cur.otpHash)) {
        const sessionToken = generateToken();
        await tx.signatureRequest.update({
          where: { id: cur.id },
          data: {
            otpHash: null, otpExpiresAt: null, otpAttempts: 0, otpVerifiedAt: now,
            otpWindowStart: windowStart, otpSentCount: sentCount, otpFailuresHour: failuresBefore,
            ...(cur.status === 'PENDING' ? { status: 'VIEWED' as const, viewedAt: now } : {}),
          },
        });
        const session = await tx.signatureSession.create({
          data: { requestId: cur.id, tokenHash: hashToken(sessionToken), expiresAt: new Date(now.getTime() + SESSION_TTL_MS), ip: info.ip, userAgent: info.userAgent },
        });
        await this.events.append(tx, cur.id, { type: 'SESSION_STARTED', ip: info.ip, userAgent: info.userAgent });
        if (cur.status === 'PENDING') await this.events.append(tx, cur.id, { type: 'VIEWED', ip: info.ip, userAgent: info.userAgent });
        return { kind: 'ok' as const, sessionToken, sessionExpiresAt: session.expiresAt };
      }

      const attempts = cur.otpAttempts + 1;
      const failures = failuresBefore + 1;
      const lockNow = failures >= OTP_MAX_FAILS_PER_HOUR;
      const burned = attempts >= OTP_MAX_FAILS_PER_CODE;
      await tx.signatureRequest.update({
        where: { id: cur.id },
        data: {
          otpAttempts: attempts, otpFailuresHour: failures, otpWindowStart: windowStart, otpSentCount: sentCount,
          ...(burned || lockNow ? { otpHash: null, otpExpiresAt: null } : {}),
          ...(lockNow ? { lockedUntil: new Date(now.getTime() + OTP_LOCK_MS) } : {}),
        },
      });
      await this.events.append(tx, cur.id, { type: 'OTP_FAILED', ip: info.ip, userAgent: info.userAgent, detail: { attempt: attempts } });
      if (lockNow) await this.events.append(tx, cur.id, { type: 'OTP_LOCKED', ip: info.ip, userAgent: info.userAgent, detail: { failuresInWindow: failures } });
      return lockNow ? { kind: 'locked' as const } : burned ? { kind: 'burned' as const } : { kind: 'wrong' as const, left: OTP_MAX_FAILS_PER_CODE - attempts };
    }, TX_OPTIONS);

    switch (outcome.kind) {
      case 'ok': return { sessionToken: outcome.sessionToken, sessionExpiresAt: outcome.sessionExpiresAt.toISOString() };
      case 'locked': throw locked();
      case 'none': throw new BadRequestException('El código venció o no se solicitó. Pide uno nuevo.');
      case 'burned': throw new BadRequestException('Demasiados intentos con este código. Pide uno nuevo.');
      default: throw new BadRequestException(`Código incorrecto. Te quedan ${outcome.left} intento(s).`);
    }
  }

  // ═══ GET /document ══════════════════════════════════════════════════════════
  async getDocument(token: unknown, sessionToken: unknown) {
    this.policy.assertEnabled();
    const r = await this.loadByToken(token);
    this.assertOpen(r);
    await this.requireSession(r, sessionToken);
    const adapter = this.adapter(r);
    const orgName = await this.orgName(r.organizationId);
    return publicDocumentView(r, {
      orgName,
      documentLabel: adapter.label,
      pdfUrl: await this.storage.signedUrl(r.documentPath),
      consentText: renderConsentText(r.title),
      consentVersion: CONSENT_VERSION,
      privacyNotice: renderPrivacyNotice(orgName),
      declineNotice: renderDeclineNotice(orgName),
      form: adapter.buildForm((r.payload ?? {}) as Record<string, unknown>),
      attachments: await this.attachments.list(r.id),
    });
  }

  // ═══ Adjuntos ═══════════════════════════════════════════════════════════════
  async uploadAttachment(token: unknown, sessionToken: unknown, file: { originalname: string; buffer: Buffer } | undefined, info: ClientInfo) {
    this.policy.assertEnabled();
    const r = await this.loadByToken(token);
    this.assertOpen(r);
    await this.requireSession(r, sessionToken);
    if (!this.adapter(r).allowsAttachments) throw new ForbiddenException('Este documento no admite archivos adjuntos.');
    if (!file?.buffer) throw new BadRequestException('No se recibió ningún archivo.');
    const att = await this.attachments.accept(r, file, info);
    return { id: att.id, originalName: att.originalName, sizeBytes: att.sizeBytes, status: 'accepted' as const };
  }

  async removeAttachment(token: unknown, sessionToken: unknown, attachmentId: string) {
    this.policy.assertEnabled();
    const r = await this.loadByToken(token);
    this.assertOpen(r);
    await this.requireSession(r, sessionToken);
    if (!(await this.attachments.remove(r, attachmentId))) throw new NotFoundException('Archivo no encontrado');
    return { removed: true };
  }

  // ═══ POST /sign ═════════════════════════════════════════════════════════════
  async sign(token: unknown, sessionToken: unknown, dto: SignDto, info: ClientInfo) {
    this.policy.assertEnabled();
    const r0 = await this.loadByToken(token);
    this.assertOpen(r0);
    const session = await this.requireSession(r0, sessionToken);
    const adapter = this.adapter(r0);
    const payload = (r0.payload ?? {}) as Record<string, unknown>;

    if (dto.consent !== true) throw new BadRequestException('Debes aceptar la declaración de consentimiento para firmar.');
    if (adapter.buildForm(payload).signedRoleRequired && !dto.signedRole?.trim()) throw new BadRequestException('Escribe tu cargo.');
    const response = adapter.validateResponse(payload, dto.response ?? {});

    // El firmante firma lo que VIO: el PDF guardado debe seguir siendo idéntico al que se envió.
    let original: Buffer;
    try { original = await this.storage.download(r0.documentPath); }
    catch { throw new ServiceUnavailableException('No se pudo cargar el documento. Inténtalo de nuevo.'); }
    if (sha256Hex(original) !== r0.documentSha256) {
      await this.events.appendStandalone(r0.id, { type: 'INTEGRITY_FAILED', ip: info.ip, userAgent: info.userAgent, detail: { phase: 'sign' } });
      void this.notifyCreator(r0, 'integrity');
      throw new ConflictException('El documento no pudo verificarse; el equipo auditor fue notificado.');
    }

    const consentText = renderConsentText(r0.title);
    const signedAt = new Date();
    const signedName = dto.signedName.trim();
    const signedRole = dto.signedRole?.trim() || null;

    const result = await this.prisma.$transaction(async (tx) => {
      await this.events.lock(tx, r0.id);
      // Primero el estado (si otra firma ya ganó, el mensaje correcto es "ya fue firmada"), luego la sesión, que
      // puede haberse revocado mientras tanto (reenvío, revocación).
      this.assertOpen(await tx.signatureRequest.findUniqueOrThrow({ where: { id: r0.id } }), signedAt);
      const s = await tx.signatureSession.findUnique({ where: { id: session.id } });
      if (!s || s.revokedAt || s.expiresAt <= signedAt) throw new UnauthorizedException('Verifica tu correo nuevamente.');

      const verificationCode = await this.freshVerificationCode(tx);
      // Condicional: solo una firma gana, y nunca después del vencimiento.
      const res = await tx.signatureRequest.updateMany({
        where: { id: r0.id, status: { in: [...ACTIVE] }, expiresAt: { gt: signedAt } },
        data: {
          status: 'SIGNED', signedAt, signedName, signedRole, consentVersion: CONSENT_VERSION, consentText,
          response: response as Prisma.InputJsonValue, signerIp: info.ip, signerUserAgent: info.userAgent,
          verificationCode, sealStatus: 'PENDING', otpHash: null, otpExpiresAt: null,
        },
      });
      if (res.count === 0) throw new ConflictException('Esta solicitud ya fue firmada o venció.');

      await tx.signatureSession.updateMany({ where: { requestId: r0.id, revokedAt: null }, data: { revokedAt: signedAt } });
      const submitted = await this.attachments.markSubmitted(tx, r0.id);
      await this.events.append(tx, r0.id, {
        type: 'SIGNED', ip: info.ip, userAgent: info.userAgent,
        detail: { signedName, signedRole, consentVersion: CONSENT_VERSION, attachments: submitted, documentSha256: r0.documentSha256 },
      });
      const updated = await tx.signatureRequest.findUniqueOrThrow({ where: { id: r0.id } });
      await adapter.onSigned?.(tx, { request: updated, signedName, signedRole, response, at: signedAt });
      return updated;
    }, TX_OPTIONS);

    await this.attachments.purgeUnsubmitted(r0.id).catch(() => undefined);
    void this.notifyCreator(result, 'signed');
    void this.sealing.sealRequest(result.id); // en segundo plano; si falla, el cron lo reintenta
    return { status: 'SIGNED' as const, verificationCode: result.verificationCode!, sealing: true as const };
  }

  private async freshVerificationCode(tx: Prisma.TransactionClient): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const code = generateVerificationCode();
      if (!(await tx.signatureRequest.findFirst({ where: { verificationCode: code }, select: { id: true } }))) return code;
    }
    throw new ServiceUnavailableException('No se pudo generar el código de verificación. Inténtalo de nuevo.');
  }

  // ═══ POST /decline ══════════════════════════════════════════════════════════
  async decline(token: unknown, sessionToken: unknown, dto: DeclineDto, info: ClientInfo) {
    this.policy.assertEnabled();
    const r0 = await this.loadByToken(token);
    this.assertOpen(r0);
    const session = await this.requireSession(r0, sessionToken);
    const adapter = this.adapter(r0);
    const reason = dto.reason.trim();
    const at = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.events.lock(tx, r0.id);
      this.assertOpen(await tx.signatureRequest.findUniqueOrThrow({ where: { id: r0.id } }), at);
      const s = await tx.signatureSession.findUnique({ where: { id: session.id } });
      if (!s || s.revokedAt || s.expiresAt <= at) throw new UnauthorizedException('Verifica tu correo nuevamente.');
      const res = await tx.signatureRequest.updateMany({
        where: { id: r0.id, status: { in: [...ACTIVE] }, expiresAt: { gt: at } },
        data: { status: 'DECLINED', declineReason: reason, otpHash: null, otpExpiresAt: null },
      });
      if (res.count === 0) throw new ConflictException('Esta solicitud ya fue firmada, rechazada o venció.');
      await tx.signatureSession.updateMany({ where: { requestId: r0.id, revokedAt: null }, data: { revokedAt: at } });
      await this.events.append(tx, r0.id, { type: 'DECLINED', ip: info.ip, userAgent: info.userAgent, detail: { reason } });
      const row = await tx.signatureRequest.findUniqueOrThrow({ where: { id: r0.id } });
      await adapter.onDeclined?.(tx, row, reason);
      return row;
    }, TX_OPTIONS);

    await this.attachments.purgeUnsubmitted(r0.id).catch(() => undefined);
    void this.notifyCreator(updated, 'declined', reason);
    return { status: 'DECLINED' as const };
  }

  // ═══ GET /signed ════════════════════════════════════════════════════════════
  async getSigned(token: unknown, sessionToken: unknown) {
    this.policy.assertEnabled();
    const r = await this.loadByToken(token);
    this.assertNotGone(r);
    if (r.status !== 'SIGNED') throw new ConflictException({ message: 'Este documento todavía no está firmado.', status: r.status });
    await this.requireSession(r, sessionToken);
    if (r.sealStatus !== 'SEALED' || !r.signedPdfPath) return { sealing: r.sealStatus !== 'FAILED', failed: r.sealStatus === 'FAILED' };
    return { sealing: false, failed: false, pdfUrl: await this.storage.signedUrl(r.signedPdfPath) };
  }

  // ═══ GET /verify/:code ══════════════════════════════════════════════════════
  async verify(rawCode: unknown) {
    this.policy.assertEnabled();
    const code = normalizeVerificationCode(rawCode);
    if (!code) throw new NotFoundException('No encontramos un documento con ese código.');
    const r = await this.prisma.signatureRequest.findUnique({ where: { verificationCode: code } });
    if (!r) throw new NotFoundException('No encontramos un documento con ese código.');

    const sealed = await this.prisma.signatureEvent.findMany({ where: { requestId: r.id, type: 'SEALED' }, orderBy: { seq: 'asc' } });
    const hashes = new Set<string>();
    if (r.signedPdfSha256) hashes.add(r.signedPdfSha256);
    for (const e of sealed) {
      const sha = (e.detail as { sha256?: unknown } | null)?.sha256;
      if (typeof sha === 'string') hashes.add(sha);
    }
    return publicVerifyView(r, {
      orgName: await this.orgName(r.organizationId),
      documentLabel: this.registry.find(r.documentType)?.label ?? 'Documento',
      sealFingerprint: await this.orgSeal.getFingerprintIfExists(r.organizationId),
      acceptedHashes: [...hashes],
    });
  }

  // ═══ Avisos al equipo ═══════════════════════════════════════════════════════
  private async notifyCreator(r: SignatureRequest, kind: 'signed' | 'declined' | 'integrity', reason?: string) {
    try {
      const creator = await this.prisma.user.findUnique({ where: { id: r.createdById }, select: { email: true } });
      if (!creator?.email) return;
      const panelPath = r.auditId ? `/dashboard/audits/${r.auditId}` : '/dashboard/portfolio';
      if (kind === 'integrity') await this.email.sendSignatureIntegrityAlert(creator.email, { title: r.title, panelPath });
      else await this.email.sendSignatureOutcome(creator.email, {
        title: r.title, signerName: r.signedName ?? r.signerName, signerEmail: r.signerEmail,
        outcome: kind === 'signed' ? 'SIGNED' : 'DECLINED', reason, panelPath,
      });
    } catch (err) {
      this.logger.warn(`No se pudo avisar al equipo (${r.id}): ${(err as Error).message}`);
    }
  }
}
