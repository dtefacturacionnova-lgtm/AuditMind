import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateConfirmationDto, UpdateConfirmationDto,
  ReceiveResponseDto, ReconcileDto, AltProcedureDto,
} from './dto/create-confirmation.dto';
import { AuthUser } from '../auth/jwt.strategy';
import { ConfirmationStatus } from '@prisma/client';

const INCLUDE_FULL = {
  audit: { select: { id: true, title: true, organizationId: true } },
} as const;

@Injectable()
export class ConfirmationsService {
  constructor(private prisma: PrismaService) {}

  // ── Helpers ────────────────────────────────────────────────────────────────
  private async getConfirmationOrThrow(id: string, user: AuthUser) {
    const conf = await this.prisma.externalConfirmation.findUnique({
      where: { id },
      include: INCLUDE_FULL,
    });
    if (!conf) throw new NotFoundException('Confirmación no encontrada');
    if (conf.audit.organizationId !== user.organizationId) throw new ForbiddenException();
    return conf;
  }

  // ── Create ─────────────────────────────────────────────────────────────────
  async create(dto: CreateConfirmationDto, user: AuthUser) {
    const audit = await this.prisma.audit.findFirst({
      where: { id: dto.auditId, organizationId: user.organizationId },
    });
    if (!audit) throw new NotFoundException('Auditoría no encontrada');

    return this.prisma.externalConfirmation.create({
      data: {
        auditId:        dto.auditId,
        type:           dto.type,
        respondentName: dto.respondentName,
        respondentEmail:dto.respondentEmail,
        amount:         dto.amount,
        accountRef:     dto.accountRef,
        status:         ConfirmationStatus.DRAFT,
      },
      include: INCLUDE_FULL,
    });
  }

  // ── List by audit ──────────────────────────────────────────────────────────
  async findAllForAudit(auditId: string, user: AuthUser) {
    const audit = await this.prisma.audit.findFirst({
      where: { id: auditId, organizationId: user.organizationId },
    });
    if (!audit) throw new NotFoundException('Auditoría no encontrada');

    return this.prisma.externalConfirmation.findMany({
      where: { auditId },
      include: INCLUDE_FULL,
      orderBy: [{ type: 'asc' }, { createdAt: 'desc' }],
    });
  }

  // ── List org (all audits) ──────────────────────────────────────────────────
  async findAllForOrg(user: AuthUser, page = 1, limit = 20, status?: ConfirmationStatus) {
    const where = {
      audit: { organizationId: user.organizationId },
      ...(status && { status }),
    };
    const [data, total] = await Promise.all([
      this.prisma.externalConfirmation.findMany({
        where,
        include: INCLUDE_FULL,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.externalConfirmation.count({ where }),
    ]);
    return { data, meta: { total, page, totalPages: Math.ceil(total / limit) } };
  }

  // ── Get one ────────────────────────────────────────────────────────────────
  async findOne(id: string, user: AuthUser) {
    return this.getConfirmationOrThrow(id, user);
  }

  // ── Update (edit before sending) ──────────────────────────────────────────
  async update(id: string, dto: UpdateConfirmationDto, user: AuthUser) {
    const conf = await this.getConfirmationOrThrow(id, user);
    if (conf.status !== ConfirmationStatus.DRAFT) {
      throw new ForbiddenException('Solo se puede editar una confirmación en estado DRAFT');
    }
    return this.prisma.externalConfirmation.update({
      where: { id },
      data: {
        ...(dto.respondentName  && { respondentName:  dto.respondentName }),
        ...(dto.respondentEmail && { respondentEmail: dto.respondentEmail }),
        ...(dto.amount          != null && { amount:  dto.amount }),
        ...(dto.accountRef      && { accountRef:      dto.accountRef }),
      },
      include: INCLUDE_FULL,
    });
  }

  // ── Send ───────────────────────────────────────────────────────────────────
  async send(id: string, user: AuthUser) {
    const conf = await this.getConfirmationOrThrow(id, user);
    if (conf.status !== ConfirmationStatus.DRAFT) {
      throw new ForbiddenException('Solo se puede enviar desde estado DRAFT');
    }
    return this.prisma.externalConfirmation.update({
      where: { id },
      data: {
        status:  ConfirmationStatus.SENT,
        sentAt:  new Date(),
        sentBy:  user.name ?? user.email,
      },
      include: INCLUDE_FULL,
    });
  }

  // ── Receive response ───────────────────────────────────────────────────────
  async receiveResponse(id: string, dto: ReceiveResponseDto, user: AuthUser) {
    const conf = await this.getConfirmationOrThrow(id, user);
    if (conf.status !== ConfirmationStatus.SENT) {
      throw new ForbiddenException('Solo se puede registrar respuesta en estado SENT');
    }

    // Calcular diferencia si se proporciona responseAmount
    let difference: number | undefined;
    if (dto.responseAmount != null && conf.amount != null) {
      difference = Math.abs(Number(conf.amount) - dto.responseAmount);
    }

    return this.prisma.externalConfirmation.update({
      where: { id },
      data: {
        status:             ConfirmationStatus.RECEIVED,
        responseContent:    dto.responseContent,
        responseAmount:     dto.responseAmount,
        responseReceivedAt: new Date(),
        ...(difference != null && { difference }),
      },
      include: INCLUDE_FULL,
    });
  }

  // ── Reconcile ──────────────────────────────────────────────────────────────
  async reconcile(id: string, dto: ReconcileDto, user: AuthUser) {
    const conf = await this.getConfirmationOrThrow(id, user);
    if (conf.status !== ConfirmationStatus.RECEIVED) {
      throw new ForbiddenException('Solo se puede conciliar desde estado RECEIVED');
    }
    return this.prisma.externalConfirmation.update({
      where: { id },
      data: {
        status: ConfirmationStatus.RECONCILED,
        ...(dto.differenceExplanation && { differenceExplanation: dto.differenceExplanation }),
      },
      include: INCLUDE_FULL,
    });
  }

  // ── Mark no response ───────────────────────────────────────────────────────
  async markNoResponse(id: string, user: AuthUser) {
    const conf = await this.getConfirmationOrThrow(id, user);
    if (conf.status !== ConfirmationStatus.SENT) {
      throw new ForbiddenException('Solo se puede marcar sin respuesta desde estado SENT');
    }
    return this.prisma.externalConfirmation.update({
      where: { id },
      data: { status: ConfirmationStatus.NO_RESPONSE },
      include: INCLUDE_FULL,
    });
  }

  // ── Alt procedure ──────────────────────────────────────────────────────────
  async altProcedure(id: string, dto: AltProcedureDto, user: AuthUser) {
    const conf = await this.getConfirmationOrThrow(id, user);
    if (!([ConfirmationStatus.NO_RESPONSE, ConfirmationStatus.RECEIVED] as ConfirmationStatus[]).includes(conf.status)) {
      throw new ForbiddenException('Procedimiento alternativo solo aplica desde NO_RESPONSE o RECEIVED');
    }
    return this.prisma.externalConfirmation.update({
      where: { id },
      data: {
        status:              ConfirmationStatus.ALT_PROCEDURE,
        alternativeProcedure: dto.alternativeProcedure,
      },
      include: INCLUDE_FULL,
    });
  }

  // ── Delete (solo DRAFT) ────────────────────────────────────────────────────
  async remove(id: string, user: AuthUser) {
    const conf = await this.getConfirmationOrThrow(id, user);
    if (conf.status !== ConfirmationStatus.DRAFT) {
      throw new ForbiddenException('Solo se puede eliminar una confirmación en estado DRAFT');
    }
    await this.prisma.externalConfirmation.delete({ where: { id } });
    return { message: 'Confirmación eliminada' };
  }

  // ── Stats org ──────────────────────────────────────────────────────────────
  async getOrgStats(user: AuthUser) {
    const base = { audit: { organizationId: user.organizationId } };
    const [total, draft, sent, received, reconciled, noResponse, altProcedure] = await Promise.all([
      this.prisma.externalConfirmation.count({ where: base }),
      this.prisma.externalConfirmation.count({ where: { ...base, status: ConfirmationStatus.DRAFT } }),
      this.prisma.externalConfirmation.count({ where: { ...base, status: ConfirmationStatus.SENT } }),
      this.prisma.externalConfirmation.count({ where: { ...base, status: ConfirmationStatus.RECEIVED } }),
      this.prisma.externalConfirmation.count({ where: { ...base, status: ConfirmationStatus.RECONCILED } }),
      this.prisma.externalConfirmation.count({ where: { ...base, status: ConfirmationStatus.NO_RESPONSE } }),
      this.prisma.externalConfirmation.count({ where: { ...base, status: ConfirmationStatus.ALT_PROCEDURE } }),
    ]);
    return { total, draft, sent, received, reconciled, noResponse, altProcedure };
  }
}
