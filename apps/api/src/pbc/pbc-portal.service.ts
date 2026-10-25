import {
  BadRequestException, GoneException, HttpException, Injectable, Logger, NotFoundException, ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PbcRequest, PbcRequestStatus, PbcPortalSession, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { ClientInfo } from '../signatures/request-info.util';
import {
  derivePortalOtpKey, generateOtp, generateToken, hashToken, hmacOtp, isWellFormedToken, maskEmail, verifyOtp,
} from '../signatures/signature-crypto.util';
import {
  DAY_MS, HOUR_MS, OTP_LOCK_MS, OTP_MAX_FAILS_PER_CODE, OTP_MAX_FAILS_PER_HOUR, OTP_MAX_LOCKS, OTP_MAX_SENDS_PER_DAY,
  OTP_MAX_SENDS_PER_HOUR, OTP_MIN_GAP_MS, OTP_TTL_MS, SESSION_TTL_MS,
} from '../signatures/otp-limits';

/** Códigos por organización y día para el portal PBC: presupuesto propio, no compite con el de la firma. */
export const MAX_PBC_OTP_EMAILS_PER_ORG_PER_DAY = 1000;

const TOKEN_ERROR = 'Solicitud no encontrada o token inválido';
const SESSION_ERROR = 'Verifica tu correo nuevamente.';
const TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 } as const;

const locked = () => new HttpException('Demasiados intentos. Vuelve a intentarlo en una hora.', 423);
// `reason` deja que la pantalla distinga el bloqueo de 1 hora del definitivo sin interpretar el texto.
const lockedForGood = () => new HttpException(
  { message: 'Este enlace se bloqueó por demasiados intentos fallidos. Pide al equipo auditor que te envíe uno nuevo.', reason: 'locked-permanent' }, 423,
);

/**
 * Lo único que ve el auditado en el portal público (sin login). Antes se devolvía el registro completo: token,
 * organizationId, createdById, etc. (auditoría de seguridad 2026-10-18).
 */
export const PORTAL_SELECT = {
  id: true, title: true, description: true, status: true, dueDate: true,
  submittedAt: true, acceptedAt: true, rejectionReason: true,
  requestedToName: true, fileUrls: true, portalTokenExpiresAt: true,
  audit:    { select: { title: true } },
  messages: {
    orderBy: { createdAt: 'asc' as const },
    select:  { id: true, isAuditor: true, senderName: true, content: true, attachmentUrls: true, createdAt: true },
  },
} satisfies Prisma.PbcRequestSelect;

/**
 * Portal PBC PÚBLICO del auditado (sin cuenta). Tener el enlace NO basta para ver ni escribir: hace falta además un código de
 * 6 dígitos que llega al correo registrado en la solicitud y la sesión corta que se abre al acertarlo (mismo mecanismo y
 * mismos parámetros que la firma por enlace; docs/portal-pbc-codigo-por-correo.md).
 * Nunca se registran ni se devuelven tokens, códigos o sesiones.
 */
@Injectable()
export class PbcPortalService {
  private readonly logger = new Logger(PbcPortalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
  ) {}

  // ═══ Resolución del enlace y la sesión ══════════════════════════════════════
  private encryptionKey(): string {
    const key = this.config.get<string>('ENCRYPTION_KEY', '');
    if (!key) throw new ServiceUnavailableException('El portal no está disponible: falta la clave de cifrado del servidor.');
    return key;
  }

  private static assertLinkActive(r: Pick<PbcRequest, 'portalTokenExpiresAt'>, now = new Date()): void {
    if (r.portalTokenExpiresAt && r.portalTokenExpiresAt.getTime() < now.getTime()) {
      throw new GoneException('Este enlace venció. Pide uno nuevo al equipo auditor.');
    }
  }

  /** Busca por la HUELLA del token (nunca se compara el token en claro) y descarta basura antes de tocar la BD. */
  private async loadByToken(token: unknown): Promise<PbcRequest> {
    if (!isWellFormedToken(token)) throw new NotFoundException(TOKEN_ERROR);
    const r = await this.prisma.pbcRequest.findUnique({ where: { portalTokenHash: hashToken(token) } });
    if (!r) throw new NotFoundException(TOKEN_ERROR);
    PbcPortalService.assertLinkActive(r);
    return r;
  }

  private async requireSession(r: Pick<PbcRequest, 'id'>, sessionToken: unknown): Promise<PbcPortalSession> {
    if (!isWellFormedToken(sessionToken)) throw new UnauthorizedException(SESSION_ERROR);
    const s = await this.prisma.pbcPortalSession.findUnique({ where: { tokenHash: hashToken(sessionToken) } });
    if (!s || s.requestId !== r.id || s.revokedAt || s.expiresAt.getTime() <= Date.now()) throw new UnauthorizedException(SESSION_ERROR);
    return s;
  }

  /** Token + sesión válidos → la solicitud. Todas las rutas protegidas pasan por aquí. */
  private async authorize(token: unknown, sessionToken: unknown): Promise<PbcRequest> {
    const r = await this.loadByToken(token);
    await this.requireSession(r, sessionToken);
    return r;
  }

  private async orgName(organizationId: string): Promise<string> {
    return (await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } })).name;
  }

  /** Bloquea la fila de la solicitud hasta el fin de la transacción: dos verificaciones simultáneas no esquivan el contador. */
  private async lockRow(tx: Prisma.TransactionClient, id: string): Promise<PbcRequest> {
    await tx.$queryRaw`SELECT id FROM pbc_requests WHERE id = ${id} FOR UPDATE`;
    return tx.pbcRequest.findUniqueOrThrow({ where: { id } });
  }

  // ═══ GET / — portada sin datos de la solicitud ══════════════════════════════
  async getCover(token: unknown) {
    const r = await this.loadByToken(token);
    return {
      orgName: await this.orgName(r.organizationId),
      maskedEmail: maskEmail(r.requestedToEmail),
      expiresAt: r.portalTokenExpiresAt ? r.portalTokenExpiresAt.toISOString() : null,
    };
  }

  // ═══ POST /otp/send ═════════════════════════════════════════════════════════
  async sendOtp(token: unknown, info: ClientInfo) {
    const key = derivePortalOtpKey(this.encryptionKey());
    const r0 = await this.loadByToken(token);
    await this.assertDailyOtpCap(r0.organizationId);

    const code = generateOtp();
    const outcome = await this.prisma.$transaction(async (tx) => {
      const cur = await this.lockRow(tx, r0.id);
      PbcPortalService.assertLinkActive(cur);
      const now = new Date();
      if (cur.portalLockCount >= OTP_MAX_LOCKS) return { kind: 'lockedForGood' as const };
      if (cur.portalLockedUntil && cur.portalLockedUntil > now) return { kind: 'locked' as const };
      const sentToday = await tx.pbcPortalEvent.count({ where: { requestId: cur.id, type: 'OTP_SENT', at: { gte: new Date(now.getTime() - DAY_MS) } } });
      if (sentToday >= OTP_MAX_SENDS_PER_DAY) return { kind: 'limit' as const };

      const fresh = !cur.portalOtpWindowStart || now.getTime() - cur.portalOtpWindowStart.getTime() > HOUR_MS;
      const windowStart = fresh ? now : cur.portalOtpWindowStart!;
      const sentCount = fresh ? 0 : cur.portalOtpSentCount;
      const failures = fresh ? 0 : cur.portalOtpFailuresHour;

      if (cur.portalOtpLastSentAt) {
        const wait = OTP_MIN_GAP_MS - (now.getTime() - cur.portalOtpLastSentAt.getTime());
        if (wait > 0) return { kind: 'wait' as const, seconds: Math.ceil(wait / 1000) };
      }
      if (sentCount >= OTP_MAX_SENDS_PER_HOUR) return { kind: 'limit' as const };

      // Un código nuevo invalida el anterior y reinicia sus intentos.
      await tx.pbcRequest.update({
        where: { id: cur.id },
        data: {
          portalOtpHash: hmacOtp(code, key, cur.id), portalOtpExpiresAt: new Date(now.getTime() + OTP_TTL_MS), portalOtpAttempts: 0,
          portalOtpSentCount: sentCount + 1, portalOtpLastSentAt: now, portalOtpWindowStart: windowStart, portalOtpFailuresHour: failures,
        },
      });
      await tx.pbcPortalEvent.create({ data: { requestId: cur.id, type: 'OTP_SENT', ip: info.ip, userAgent: info.userAgent } });
      return { kind: 'ok' as const };
    }, TX_OPTIONS);

    if (outcome.kind === 'lockedForGood') throw lockedForGood();
    if (outcome.kind === 'locked') throw locked();
    if (outcome.kind === 'wait') throw new HttpException(`Espera ${outcome.seconds} segundos para pedir otro código.`, 429);
    if (outcome.kind === 'limit') throw new HttpException('Pediste demasiados códigos. Inténtalo de nuevo más tarde.', 429);

    const sent = await this.email.sendPbcPortalOtp(r0.requestedToEmail, { orgName: await this.orgName(r0.organizationId), code });
    if (!sent.sent) throw new ServiceUnavailableException('No pudimos enviar el código. Inténtalo de nuevo en unos minutos.');
    return { sent: true, maskedEmail: maskEmail(r0.requestedToEmail), resendInSeconds: OTP_MIN_GAP_MS / 1000 };
  }

  /** Códigos por organización y día: un tercero que los pide en bucle no puede dejar a la organización sin cupo. */
  private async assertDailyOtpCap(organizationId: string): Promise<void> {
    const since = new Date(Date.now() - DAY_MS);
    const sent = await this.prisma.pbcPortalEvent.count({ where: { type: 'OTP_SENT', at: { gte: since }, request: { organizationId } } });
    if (sent >= MAX_PBC_OTP_EMAILS_PER_ORG_PER_DAY) {
      throw new HttpException('No podemos enviar más códigos por hoy. Inténtalo mañana o avisa al equipo auditor.', 429);
    }
  }

  // ═══ POST /otp/verify ═══════════════════════════════════════════════════════
  async verifyOtp(token: unknown, code: string, info: ClientInfo) {
    const key = derivePortalOtpKey(this.encryptionKey());
    const r0 = await this.loadByToken(token);

    // El resultado se calcula dentro de la transacción y las excepciones se lanzan DESPUÉS: los contadores de intentos
    // fallidos deben guardarse aunque la respuesta sea un error.
    const outcome = await this.prisma.$transaction(async (tx) => {
      const cur = await this.lockRow(tx, r0.id);
      PbcPortalService.assertLinkActive(cur);
      const now = new Date();
      if (cur.portalLockCount >= OTP_MAX_LOCKS) return { kind: 'lockedForGood' as const };
      if (cur.portalLockedUntil && cur.portalLockedUntil > now) return { kind: 'locked' as const };
      if (!cur.portalOtpHash || !cur.portalOtpExpiresAt || cur.portalOtpExpiresAt <= now) return { kind: 'none' as const };

      const fresh = !cur.portalOtpWindowStart || now.getTime() - cur.portalOtpWindowStart.getTime() > HOUR_MS;
      const windowStart = fresh ? now : cur.portalOtpWindowStart!;
      const sentCount = fresh ? 0 : cur.portalOtpSentCount;
      const failuresBefore = fresh ? 0 : cur.portalOtpFailuresHour;

      if (verifyOtp(code, key, cur.id, cur.portalOtpHash)) {
        const sessionToken = generateToken();
        await tx.pbcRequest.update({
          where: { id: cur.id },
          data: { portalOtpHash: null, portalOtpExpiresAt: null, portalOtpAttempts: 0, portalOtpWindowStart: windowStart, portalOtpSentCount: sentCount, portalOtpFailuresHour: failuresBefore },
        });
        const session = await tx.pbcPortalSession.create({
          data: { requestId: cur.id, tokenHash: hashToken(sessionToken), expiresAt: new Date(now.getTime() + SESSION_TTL_MS), ip: info.ip, userAgent: info.userAgent },
        });
        await tx.pbcPortalEvent.create({ data: { requestId: cur.id, type: 'SESSION_STARTED', ip: info.ip, userAgent: info.userAgent } });
        return { kind: 'ok' as const, sessionToken, sessionExpiresAt: session.expiresAt };
      }

      const attempts = cur.portalOtpAttempts + 1;
      const failures = failuresBefore + 1;
      const lockNow = failures >= OTP_MAX_FAILS_PER_HOUR;
      const burned = attempts >= OTP_MAX_FAILS_PER_CODE;
      const lockNumber = cur.portalLockCount + 1;
      await tx.pbcRequest.update({
        where: { id: cur.id },
        data: {
          portalOtpAttempts: attempts, portalOtpFailuresHour: failures, portalOtpWindowStart: windowStart, portalOtpSentCount: sentCount,
          ...(burned || lockNow ? { portalOtpHash: null, portalOtpExpiresAt: null } : {}),
          ...(lockNow ? { portalLockedUntil: new Date(now.getTime() + OTP_LOCK_MS), portalLockCount: lockNumber } : {}),
        },
      });
      await tx.pbcPortalEvent.create({ data: { requestId: cur.id, type: 'OTP_FAILED', ip: info.ip, userAgent: info.userAgent, detail: { attempt: attempts } } });
      if (lockNow) {
        await tx.pbcPortalEvent.create({ data: { requestId: cur.id, type: 'OTP_LOCKED', ip: info.ip, userAgent: info.userAgent, detail: { failuresInWindow: failures, lockNumber } } });
        if (lockNumber >= OTP_MAX_LOCKS) {
          // Intentos de adivinar el código: el enlace queda inservible y también se cierran las sesiones abiertas.
          await tx.pbcPortalSession.updateMany({ where: { requestId: cur.id, revokedAt: null }, data: { revokedAt: now } });
          return { kind: 'lockedForGood' as const, notify: true };
        }
      }
      return lockNow ? { kind: 'locked' as const } : burned ? { kind: 'burned' as const } : { kind: 'wrong' as const, left: OTP_MAX_FAILS_PER_CODE - attempts };
    }, TX_OPTIONS);

    switch (outcome.kind) {
      case 'ok': return { sessionToken: outcome.sessionToken, sessionExpiresAt: outcome.sessionExpiresAt.toISOString() };
      case 'lockedForGood':
        if ('notify' in outcome) void this.notifyCreator(r0);
        throw lockedForGood();
      case 'locked': throw locked();
      case 'none': throw new BadRequestException('El código venció o no se solicitó. Pide uno nuevo.');
      case 'burned': throw new BadRequestException('Demasiados intentos con este código. Pide uno nuevo.');
      default: throw new BadRequestException(`Código incorrecto. Te quedan ${outcome.left} intento(s).`);
    }
  }

  /** Aviso al equipo cuando el enlace queda inservible. Nunca debe romper la respuesta al visitante. */
  private async notifyCreator(r: PbcRequest) {
    try {
      const creator = await this.prisma.user.findUnique({ where: { id: r.createdById }, select: { email: true } });
      if (!creator?.email) return;
      await this.email.sendPbcPortalLockedAlert(creator.email, { title: r.title, requestedToEmail: r.requestedToEmail, panelPath: `/dashboard/audits/${r.auditId}` });
    } catch (err) {
      this.logger.warn(`No se pudo avisar al equipo del bloqueo del portal (${r.id}): ${(err as Error).message}`);
    }
  }

  // ═══ Rutas protegidas por sesión ════════════════════════════════════════════
  async getRequest(token: unknown, sessionToken: unknown) {
    const r = await this.authorize(token, sessionToken);
    return this.prisma.pbcRequest.findUniqueOrThrow({ where: { id: r.id }, select: PORTAL_SELECT });
  }

  async addMessage(token: unknown, sessionToken: unknown, content: string, attachmentUrls?: string[]) {
    const r = await this.authorize(token, sessionToken);
    if (r.status === PbcRequestStatus.ACCEPTED) {
      throw new BadRequestException('Esta solicitud ya fue aceptada y no acepta más mensajes');
    }
    return this.prisma.pbcMessage.create({
      data: {
        requestId:      r.id,
        senderEmail:    r.requestedToEmail,
        senderName:     r.requestedToName ?? 'Auditado',
        isAuditor:      false,
        content,
        attachmentUrls: (attachmentUrls ?? []) as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async submit(token: unknown, sessionToken: unknown, fileUrls?: string[], auditeeNotes?: string) {
    const r = await this.authorize(token, sessionToken);
    if (r.status === PbcRequestStatus.ACCEPTED) throw new BadRequestException('Esta solicitud ya fue aceptada');
    if (r.status === PbcRequestStatus.SUBMITTED) throw new BadRequestException('La solicitud ya fue enviada anteriormente');

    if (auditeeNotes) {
      await this.prisma.pbcMessage.create({
        data: {
          requestId:   r.id,
          senderEmail: r.requestedToEmail,
          senderName:  r.requestedToName ?? 'Auditado',
          isAuditor:   false,
          content:     `📎 Respuesta enviada: ${auditeeNotes}`,
        },
      });
    }
    return this.prisma.pbcRequest.update({
      where: { id: r.id },
      data: {
        status:      PbcRequestStatus.SUBMITTED,
        submittedAt: new Date(),
        ...(fileUrls?.length && { fileUrls: fileUrls as unknown as Prisma.InputJsonValue }),
      },
      select: PORTAL_SELECT,
    });
  }
}
