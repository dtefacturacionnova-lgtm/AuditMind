import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException, GoneException,
  ConflictException, ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { CreatePbcRequestDto } from './dto/create-pbc-request.dto';
import { AuthUser } from '../auth/jwt.strategy';
import { PbcRequestStatus } from '@prisma/client';
import { decryptSecret, encryptSecret } from '../common/utils/signing-key.util';
import { generateToken, hashToken, isWellFormedToken } from '../signatures/signature-crypto.util';

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
 * Lo único que ve el auditado en el portal público (sin login). Antes se
 * devolvía el registro completo: token, organizationId, createdById, etc.
 * (auditoría de seguridad 2026-10-18).
 */
const PORTAL_SELECT = {
  id: true, title: true, description: true, status: true, dueDate: true,
  submittedAt: true, acceptedAt: true, rejectionReason: true,
  requestedToName: true, fileUrls: true, portalTokenExpiresAt: true,
  audit:    { select: { title: true } },
  messages: {
    orderBy: { createdAt: 'asc' as const },
    select:  { id: true, isAuditor: true, senderName: true, content: true, attachmentUrls: true, createdAt: true },
  },
};

/**
 * Campos que NUNCA salen de la API: el token del portal no se guarda en claro (sha256 para buscarlo + copia cifrada
 * para que el equipo pueda volver a copiar el enlace), y ninguna de las dos formas debe viajar en una respuesta.
 */
export function withoutPortalSecrets<T extends object>(row: T): Omit<T, 'portalTokenHash' | 'portalTokenEncrypted'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
  const { portalTokenHash, portalTokenEncrypted, ...rest } = row as any;
  return rest;
}

const TOKEN_ERROR = 'Solicitud no encontrada o token inválido';

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

  // ─── Métodos autenticados (auditor) ──────────────────────────────────────────

  async create(dto: CreatePbcRequestDto, user: AuthUser) {
    const audit = await this.prisma.audit.findFirst({
      where: { id: dto.auditId, organizationId: user.organizationId },
    });
    if (!audit) throw new NotFoundException('Auditoría no encontrada');

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
    const audit = await this.prisma.audit.findFirst({
      where: { id: auditId, organizationId: user.organizationId },
    });
    if (!audit) throw new NotFoundException('Auditoría no encontrada');

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
    return withoutPortalSecrets(request);
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
    const audit = await this.prisma.audit.findFirst({
      where: { id: auditId, organizationId: user.organizationId },
    });
    if (!audit) throw new NotFoundException('Auditoría no encontrada');

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
    const request = await this.prisma.pbcRequest.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true, dueDate: true },
    });
    if (!request) throw new NotFoundException('Solicitud no encontrada');

    const { token, stored } = this.issueToken();
    const updated = await this.prisma.pbcRequest.update({
      where: { id },
      data:   { ...stored, portalTokenExpiresAt: portalExpiry(request.dueDate) },
      select: { id: true, portalTokenExpiresAt: true },
    });
    return { id: updated.id, portalUrl: this.email.portalUrl(token), portalTokenExpiresAt: updated.portalTokenExpiresAt };
  }

  /**
   * El equipo auditor vuelve a copiar el enlace vigente de una solicitud. Se descifra la copia guardada; la BD sola
   * no revela el token. Solo de la propia organización. Una solicitud sin copia (creada antes del cambio) debe regenerarse.
   */
  async getPortalLink(id: string, user: AuthUser) {
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

  // ─── Métodos públicos del portal (validados por token) ────────────────────────

  private assertLinkActive(request: { portalTokenExpiresAt: Date | null }) {
    if (request.portalTokenExpiresAt && request.portalTokenExpiresAt.getTime() < Date.now()) {
      throw new GoneException('Este enlace venció. Pide uno nuevo al equipo auditor.');
    }
  }

  /** Busca por la HUELLA del token (nunca se compara el token en claro) y descarta basura antes de tocar la BD. */
  private async loadByToken(token: unknown) {
    if (!isWellFormedToken(token)) throw new NotFoundException(TOKEN_ERROR);
    const request = await this.prisma.pbcRequest.findUnique({ where: { portalTokenHash: hashToken(token) } });
    if (!request) throw new NotFoundException(TOKEN_ERROR);
    this.assertLinkActive(request);
    return request;
  }

  async findByToken(token: unknown) {
    if (!isWellFormedToken(token)) throw new NotFoundException(TOKEN_ERROR);
    const request = await this.prisma.pbcRequest.findUnique({
      where: { portalTokenHash: hashToken(token) },
      select: PORTAL_SELECT,
    });
    if (!request) throw new NotFoundException(TOKEN_ERROR);
    this.assertLinkActive(request);
    return request;
  }

  async addMessageByToken(token: unknown, content: string, attachmentUrls?: string[]) {
    const request = await this.loadByToken(token);
    if (request.status === PbcRequestStatus.ACCEPTED) {
      throw new BadRequestException('Esta solicitud ya fue aceptada y no acepta más mensajes');
    }

    return this.prisma.pbcMessage.create({
      data: {
        requestId:      request.id,
        senderEmail:    request.requestedToEmail,
        senderName:     request.requestedToName ?? 'Auditado',
        isAuditor:      false,
        content,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        attachmentUrls: (attachmentUrls ?? []) as any,
      },
    });
  }

  async submitByToken(token: unknown, fileUrls?: string[], auditeeNotes?: string) {
    const request = await this.loadByToken(token);
    if (request.status === PbcRequestStatus.ACCEPTED) {
      throw new BadRequestException('Esta solicitud ya fue aceptada');
    }
    if (request.status === PbcRequestStatus.SUBMITTED) {
      throw new BadRequestException('La solicitud ya fue enviada anteriormente');
    }

    if (auditeeNotes) {
      await this.prisma.pbcMessage.create({
        data: {
          requestId:   request.id,
          senderEmail: request.requestedToEmail,
          senderName:  request.requestedToName ?? 'Auditado',
          isAuditor:   false,
          content:     `📎 Respuesta enviada: ${auditeeNotes}`,
        },
      });
    }

    return this.prisma.pbcRequest.update({
      where: { id: request.id },
      data: {
        status:      PbcRequestStatus.SUBMITTED,
        submittedAt: new Date(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(fileUrls?.length && { fileUrls: fileUrls as any }),
      },
      select: PORTAL_SELECT,
    });
  }
}
