import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePbcRequestDto } from './dto/create-pbc-request.dto';
import { AuthUser } from '../auth/jwt.strategy';
import { PbcRequestStatus } from '@prisma/client';
import { randomBytes } from 'crypto';

@Injectable()
export class PbcService {
  constructor(private prisma: PrismaService) {}

  private generatePortalToken(): string {
    return randomBytes(32).toString('hex');
  }

  // ─── Métodos autenticados (auditor) ──────────────────────────────────────────

  async create(dto: CreatePbcRequestDto, user: AuthUser) {
    const audit = await this.prisma.audit.findFirst({
      where: { id: dto.auditId, organizationId: user.organizationId },
    });
    if (!audit) throw new NotFoundException('Auditoría no encontrada');

    return this.prisma.pbcRequest.create({
      data: {
        auditId:          dto.auditId,
        organizationId:   user.organizationId,
        title:            dto.title,
        description:      dto.description ?? '',
        requestedToEmail: dto.assignedToEmail,
        requestedToName:  dto.assignedToName,
        dueDate:          new Date(dto.dueDate),
        portalToken:      this.generatePortalToken(),
        status:           PbcRequestStatus.PENDING,
        createdById:      user.id,
      },
      include: {
        audit: { select: { id: true, title: true } },
      },
    });
  }

  async findAllForAudit(auditId: string, user: AuthUser) {
    const audit = await this.prisma.audit.findFirst({
      where: { id: auditId, organizationId: user.organizationId },
    });
    if (!audit) throw new NotFoundException('Auditoría no encontrada');

    return this.prisma.pbcRequest.findMany({
      where: { auditId },
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
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
      data,
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
    return request;
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

    return this.prisma.pbcRequest.update({
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
  }

  async regenerateToken(id: string, user: AuthUser) {
    const request = await this.prisma.pbcRequest.findUnique({
      where: { id },
      include: { audit: { select: { organizationId: true } } },
    });
    if (!request) throw new NotFoundException('Solicitud no encontrada');
    if (request.audit.organizationId !== user.organizationId) throw new ForbiddenException();

    return this.prisma.pbcRequest.update({
      where: { id },
      data:   { portalToken: this.generatePortalToken() },
      select: { id: true, portalToken: true },
    });
  }

  async markOverdue() {
    const result = await this.prisma.pbcRequest.updateMany({
      where: {
        dueDate: { lt: new Date() },
        status:  { in: [PbcRequestStatus.PENDING, PbcRequestStatus.SUBMITTED] },
      },
      data: { status: PbcRequestStatus.OVERDUE },
    });
    return { updated: result.count };
  }

  // ─── Métodos públicos del portal (validados por token) ────────────────────────

  async findByToken(token: string) {
    const request = await this.prisma.pbcRequest.findUnique({
      where: { portalToken: token },
      include: {
        audit:    { select: { id: true, title: true, startDate: true, endDate: true } },
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!request) throw new NotFoundException('Solicitud no encontrada o token inválido');
    return request;
  }

  async addMessageByToken(token: string, content: string, attachmentUrls?: string[]) {
    const request = await this.prisma.pbcRequest.findUnique({
      where: { portalToken: token },
    });
    if (!request) throw new NotFoundException('Token inválido');
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

  async submitByToken(token: string, fileUrls?: string[], auditeeNotes?: string) {
    const request = await this.prisma.pbcRequest.findUnique({
      where: { portalToken: token },
    });
    if (!request) throw new NotFoundException('Token inválido');
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
      include: {
        audit:    { select: { id: true, title: true } },
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
  }
}
