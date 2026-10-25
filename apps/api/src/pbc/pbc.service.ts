import {
  Injectable, NotFoundException, ForbiddenException,
  ConflictException, ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { CreatePbcRequestDto } from './dto/create-pbc-request.dto';
import { AuthUser } from '../auth/jwt.strategy';
import { PbcRequestStatus } from '@prisma/client';
import { decryptSecret, encryptSecret } from '../common/utils/signing-key.util';
import { assertInvestigationAccess, INVESTIGATION_SELECT, visibleAuditWhere } from '../common/utils/investigation-scope.util';
import { generateToken, hashToken } from '../signatures/signature-crypto.util';
import { OTP_MAX_LOCKS } from '../signatures/otp-limits';

/**
 * Vencimiento del enlace del portal público (decisión 2026-10-18): 30 días
 * después de la fecha límite de la solicitud (o desde hoy, si esa fecha ya
 * pasó). "Regenerar enlace" lo renueva. Antes los enlaces no vencían nunca.
 */
const PORTAL_LINK_GRACE_DAYS = 30;
function portalExpiry(dueDate: Date): Date {
  const base = Math.max(dueDate.getTime(), Date.now());
  return new Date(base + PORTAL_LINK_GRACE_DAYS * 24 * 3600 * 1000);
}

/**
 * Campos que NUNCA salen de la API: el token del portal no se guarda en claro (sha256 para buscarlo + copia cifrada
 * para que el equipo pueda volver a copiar el enlace), ni el estado del código por correo (huella del código vigente,
 * intentos, ventanas y bloqueos). El detalle de la solicitud solo expone el resumen `portalLock`.
 */
const PORTAL_SECRET_FIELDS = [
  'portalTokenHash', 'portalTokenEncrypted',
  'portalOtpHash', 'portalOtpExpiresAt', 'portalOtpAttempts', 'portalOtpFailuresHour', 'portalOtpWindowStart',
  'portalOtpSentCount', 'portalOtpLastSentAt', 'portalLockedUntil', 'portalLockCount',
] as const;
type PortalSecretField = (typeof PORTAL_SECRET_FIELDS)[number];

export function withoutPortalSecrets<T extends object>(row: T): Omit<T, PortalSecretField> {
  const rest: Record<string, unknown> = { ...(row as Record<string, unknown>) };
  for (const f of PORTAL_SECRET_FIELDS) delete rest[f];
  return rest as Omit<T, PortalSecretField>;
}

/** Resumen del bloqueo del portal para el equipo: `null` si no hay; `permanent` cuando el enlace quedó inservible. */
export function portalLockOf(
  r: { portalLockCount: number; portalLockedUntil: Date | null }, now = new Date(),
): { permanent: boolean; until: string | null } | null {
  if (r.portalLockCount >= OTP_MAX_LOCKS) return { permanent: true, until: null };
  if (r.portalLockedUntil && r.portalLockedUntil.getTime() > now.getTime()) return { permanent: false, until: r.portalLockedUntil.toISOString() };
  return null;
}

@Injectable()
export class PbcService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private email: EmailService,
  ) {}

  /** Genera un token nuevo y devuelve el token en claro (para el enlace) junto con lo único que se guarda de él. */
  private issueToken(): { token: string; stored: { portalTokenHash: string; portalTokenEncrypted: string } } {
    const key = this.config.get<string>('ENCRYPTION_KEY', '');
    if (!key) throw new ServiceUnavailableException('Falta la clave de cifrado del servidor (ENCRYPTION_KEY).');
    const token = generateToken();
    return { token, stored: { portalTokenHash: hashToken(token), portalTokenEncrypted: encryptSecret(token, key) } };
  }

  /**
   * La auditoría es de la organización y, si está en modo investigación, el usuario es del equipo (o CAE/ADMIN).
   * Revisión de seguridad F5b (2026-10-19): antes cualquiera de la organización podía leer la solicitud, recuperar el
   * enlace del auditado y escribir en el portal como si fuera él.
   */
  private async assertAuditVisible(auditId: string, user: AuthUser) {
    const audit = await this.prisma.audit.findFirst({
      where: { id: auditId, organizationId: user.organizationId },
      select: INVESTIGATION_SELECT,
    });
    if (!audit) throw new NotFoundException('Auditoría no encontrada');
    assertInvestigationAccess(audit, user);
  }

  /** Solicitud PBC de la organización y visible para el usuario; devuelve su id de auditoría. */
  private async assertRequestVisible(id: string, user: AuthUser): Promise<{ id: string; auditId: string }> {
    const request = await this.prisma.pbcRequest.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true, auditId: true },
    });
    if (!request) throw new NotFoundException('Solicitud PBC no encontrada');
    await this.assertAuditVisible(request.auditId, user);
    return request;
  }

  // ─── Métodos autenticados (auditor) ──────────────────────────────────────────

  async create(dto: CreatePbcRequestDto, user: AuthUser) {
    await this.assertAuditVisible(dto.auditId, user);

    const { stored } = this.issueToken();
    const created = await this.prisma.pbcRequest.create({
      data: {
        auditId:          dto.auditId,
        organizationId:   user.organizationId,
        title:            dto.title,
        description:      dto.description ?? '',
        requestedToEmail: dto.assignedToEmail,
        requestedToName:  dto.assignedToName,
        dueDate:          new Date(dto.dueDate),
        ...stored,
        portalTokenExpiresAt: portalExpiry(new Date(dto.dueDate)),
        status:           PbcRequestStatus.PENDING,
        createdById:      user.id,
      },
      include: {
        audit: { select: { id: true, title: true } },
      },
    });
    return withoutPortalSecrets(created);
  }

  async findAllForAudit(auditId: string, user: AuthUser) {
    await this.assertAuditVisible(auditId, user);

    const rows = await this.prisma.pbcRequest.findMany({
      // organizationId además del auditId: el id de auditoría ya se validó arriba, esto es la segunda capa.
      where: { auditId, organizationId: user.organizationId },
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    return rows.map(withoutPortalSecrets);
  }

  async findAllForOrg(
    user: AuthUser,
    page = 1,
    limit = 20,
    status?: PbcRequestStatus,
  ) {
    const where = {
      organizationId: user.organizationId,
      audit: visibleAuditWhere(user), // sin las auditorías en modo investigación ajenas a su equipo
      ...(status && { status }),
    };

    const [data, total] = await Promise.all([
      this.prisma.pbcRequest.findMany({
        where,
        skip:    (page - 1) * limit,
        take:    limit,
        orderBy: [{ dueDate: 'asc' }, { status: 'asc' }],
        include: {
          audit:    { select: { id: true, title: true } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      }),
      this.prisma.pbcRequest.count({ where }),
    ]);

    return {
      data: data.map(withoutPortalSecrets),
      meta: { total, page, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOneForAuditor(id: string, user: AuthUser) {
    const request = await this.prisma.pbcRequest.findUnique({
      where: { id },
      include: {
        audit:    { select: { id: true, title: true, startDate: true, endDate: true } },
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!request) throw new NotFoundException('Solicitud PBC no encontrada');
    if (request.organizationId !== user.organizationId) throw new ForbiddenException();
    await this.assertAuditVisible(request.auditId, user);
    return { ...withoutPortalSecrets(request), portalLock: portalLockOf(request) };
  }

  async addAuditorMessage(
    id: string,
    user: AuthUser,
    content: string,
    attachmentUrls?: string[],
  ) {
    const request = await this.prisma.pbcRequest.findUnique({
      where: { id },
      include: { audit: { select: { organizationId: true } } },
    });
    if (!request) throw new NotFoundException('Solicitud PBC no encontrada');
    if (request.audit.organizationId !== user.organizationId) throw new ForbiddenException();
    await this.assertAuditVisible(request.auditId, user);

    return this.prisma.pbcMessage.create({
      data: {
        requestId:      id,
        senderEmail:    user.email,
        senderName:     user.name,
        isAuditor:      true,
        content,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        attachmentUrls: (attachmentUrls ?? []) as any,
      },
    });
  }

  async getStats(auditId: string, user: AuthUser) {
    await this.assertAuditVisible(auditId, user);

    const [stats, overdue] = await Promise.all([
      this.prisma.pbcRequest.groupBy({
        by: ['status'],
        where: { auditId },
        _count: { id: true },
      }),
      this.prisma.pbcRequest.count({
        where: {
          auditId,
          dueDate: { lt: new Date() },
          status:  { notIn: [PbcRequestStatus.ACCEPTED, PbcRequestStatus.REJECTED] },
        },
      }),
    ]);

    return { byStatus: stats, overdue };
  }

  async review(
    id: string,
    status: PbcRequestStatus,
    notes: string | undefined,
    user: AuthUser,
  ) {
    const request = await this.prisma.pbcRequest.findUnique({
      where: { id },
      include: { audit: { select: { organizationId: true } } },
    });
    if (!request) throw new NotFoundException('Solicitud PBC no encontrada');
    if (request.audit.organizationId !== user.organizationId) throw new ForbiddenException();
    await this.assertAuditVisible(request.auditId, user);

    if (notes) {
      await this.prisma.pbcMessage.create({
        data: {
          requestId:   id,
          senderEmail: user.email,
          senderName:  user.name,
          isAuditor:   true,
          content:     notes,
        },
      });
    }

    const updated = await this.prisma.pbcRequest.update({
      where: { id },
      data: {
        status,
        ...(status === PbcRequestStatus.ACCEPTED && { acceptedAt: new Date() }),
        ...(status === PbcRequestStatus.REJECTED  && notes && { rejectionReason: notes }),
      },
      include: {
        audit:    { select: { id: true, title: true } },
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    return withoutPortalSecrets(updated);
  }

  /** Rota el enlace: el anterior deja de servir al instante. Devuelve el enlace nuevo UNA vez y su vencimiento. */
  async regenerateToken(id: string, user: AuthUser) {
    await this.assertRequestVisible(id, user);
    const request = await this.prisma.pbcRequest.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true, dueDate: true },
    });
    if (!request) throw new NotFoundException('Solicitud no encontrada');

    const { token, stored } = this.issueToken();
    // Un enlace nuevo parte de cero: sin código vigente, sin contadores ni bloqueos, y las sesiones abiertas dejan de servir.
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.pbcRequest.update({
        where: { id },
        data: {
          ...stored, portalTokenExpiresAt: portalExpiry(request.dueDate),
          portalOtpHash: null, portalOtpExpiresAt: null, portalOtpAttempts: 0, portalOtpFailuresHour: 0, portalOtpWindowStart: null,
          portalOtpSentCount: 0, portalOtpLastSentAt: null, portalLockedUntil: null, portalLockCount: 0,
        },
        select: { id: true, portalTokenExpiresAt: true },
      });
      await tx.pbcPortalSession.updateMany({ where: { requestId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      return u;
    });
    return { id: updated.id, portalUrl: this.email.portalUrl(token), portalTokenExpiresAt: updated.portalTokenExpiresAt };
  }

  /**
   * El equipo auditor vuelve a copiar el enlace vigente de una solicitud. Se descifra la copia guardada; la BD sola
   * no revela el token. Solo de la propia organización. Una solicitud sin copia (creada antes del cambio) debe regenerarse.
   */
  async getPortalLink(id: string, user: AuthUser) {
    await this.assertRequestVisible(id, user);
    const request = await this.prisma.pbcRequest.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true, portalTokenEncrypted: true, portalTokenExpiresAt: true },
    });
    if (!request) throw new NotFoundException('Solicitud no encontrada');
    const key = this.config.get<string>('ENCRYPTION_KEY', '');
    if (!key) throw new ServiceUnavailableException('Falta la clave de cifrado del servidor (ENCRYPTION_KEY).');
    if (!request.portalTokenEncrypted) {
      throw new ConflictException('Esta solicitud no tiene un enlace guardado. Usa «Regenerar enlace» para crear uno nuevo.');
    }
    let token: string;
    try {
      token = decryptSecret(request.portalTokenEncrypted, key);
    } catch {
      throw new ConflictException('No se pudo recuperar el enlace. Usa «Regenerar enlace» para crear uno nuevo.');
    }
    return { url: this.email.portalUrl(token), expiresAt: request.portalTokenExpiresAt };
  }

  async markOverdue(user: AuthUser) {
    const result = await this.prisma.pbcRequest.updateMany({
      where: {
        organizationId: user.organizationId,
        dueDate: { lt: new Date() },
        status:  { in: [PbcRequestStatus.PENDING, PbcRequestStatus.SUBMITTED] },
      },
      data: { status: PbcRequestStatus.OVERDUE },
    });
    return { updated: result.count };
  }
}
