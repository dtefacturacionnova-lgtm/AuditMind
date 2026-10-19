import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SignatureRequestsService } from '../signatures/signature-requests.service';
import { assertInvestigationAccess, INVESTIGATION_SELECT, visibleAuditWhere } from '../common/utils/investigation-scope.util';
import {
  CreateConfirmationDto, UpdateConfirmationDto,
  ReceiveResponseDto, ReconcileDto, AltProcedureDto,
} from './dto/create-confirmation.dto';
import { AuthUser } from '../auth/jwt.strategy';
import { ConfirmationStatus, Prisma, SignatureDocumentType } from '@prisma/client';

const INCLUDE_FULL = {
  audit: { select: { id: true, title: true, organizationId: true } },
} as const;

/** Las transacciones que cierran solicitudes de firma escriben su bitácora: mismo margen que la firma (lección #32). */
const TX_OPTIONS = { timeout: 30_000 } as const;

@Injectable()
export class ConfirmationsService {
  constructor(
    private prisma: PrismaService,
    private signatures: SignatureRequestsService,
  ) {}

  /** Cierra la solicitud de firma por enlace vigente de esta confirmación (si hay una): lo que se envió ya no es lo vigente. */
  private revokeSignatures(tx: Prisma.TransactionClient, confirmationId: string, user: AuthUser, reason: string) {
    return this.signatures.revokeActiveForTarget(tx, {
      organizationId: user.organizationId, documentType: SignatureDocumentType.EXTERNAL_CONFIRMATION,
      targetId: confirmationId, reason, actorId: user.id,
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  /** La auditoría es de la organización y, si está en modo investigación, el usuario es del equipo (o CAE/ADMIN). */
  private async assertAuditVisible(auditId: string, user: AuthUser) {
    const audit = await this.prisma.audit.findFirst({
      where: { id: auditId, organizationId: user.organizationId },
      select: INVESTIGATION_SELECT,
    });
    if (!audit) throw new NotFoundException('Auditoría no encontrada');
    assertInvestigationAccess(audit, user);
  }

  private async getConfirmationOrThrow(id: string, user: AuthUser) {
    const conf = await this.prisma.externalConfirmation.findUnique({
      where: { id },
      include: INCLUDE_FULL,
    });
    if (!conf) throw new NotFoundException('Confirmación no encontrada');
    if (conf.audit.organizationId !== user.organizationId) throw new ForbiddenException();
    await this.assertAuditVisible(conf.auditId, user);
    return conf;
  }

  /** Error de estado cuando una escritura condicional no encontró la confirmación en el estado esperado (carrera). */
  private static stateChanged(): ConflictException {
    return new ConflictException('La confirmación cambió de estado mientras se guardaba (por ejemplo, el confirmante acaba de responder). Recarga la página.');
  }

  // ── Create ─────────────────────────────────────────────────────────────────
  async create(dto: CreateConfirmationDto, user: AuthUser) {
    await this.assertAuditVisible(dto.auditId, user);

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
    await this.assertAuditVisible(auditId, user);

    return this.prisma.externalConfirmation.findMany({
      where: { auditId },
      include: INCLUDE_FULL,
      orderBy: [{ type: 'asc' }, { createdAt: 'desc' }],
    });
  }

  // ── List org (all audits) ──────────────────────────────────────────────────
  async findAllForOrg(user: AuthUser, page = 1, limit = 20, status?: ConfirmationStatus) {
    const where = {
      audit: visibleAuditWhere(user), // sin las auditorías en modo investigación ajenas a su equipo
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
    const changed =
      (!!dto.respondentName && dto.respondentName !== conf.respondentName) ||
      (!!dto.respondentEmail && dto.respondentEmail !== conf.respondentEmail) ||
      (dto.amount != null && Number(dto.amount) !== Number(conf.amount)) ||
      (!!dto.accountRef && dto.accountRef !== conf.accountRef);

    return this.prisma.$transaction(async (tx) => {
      // Si cambia lo que el confirmante ve (monto, cuenta, nombre o correo), nadie debe firmar lo anterior.
      if (changed) await this.revokeSignatures(tx, id, user, 'Los datos de la confirmación cambiaron después de enviarla');
      // Condicional: si mientras tanto se envió a firma (pasó a SENT), no se edita lo que ya se envió.
      const res = await tx.externalConfirmation.updateMany({
        where: { id, status: ConfirmationStatus.DRAFT },
        data: {
          ...(dto.respondentName  && { respondentName:  dto.respondentName }),
          ...(dto.respondentEmail && { respondentEmail: dto.respondentEmail }),
          ...(dto.amount          != null && { amount:  dto.amount }),
          ...(dto.accountRef      && { accountRef:      dto.accountRef }),
        },
      });
      if (res.count === 0) throw ConfirmationsService.stateChanged();
      return tx.externalConfirmation.findUniqueOrThrow({ where: { id }, include: INCLUDE_FULL });
    }, TX_OPTIONS);
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
  /**
   * Registra la respuesta de una confirmación pendiente (SENT → RECEIVED) y calcula la diferencia contra el monto
   * solicitado. Es la ÚNICA transición a RECEIVED: la usan el registro manual de la respuesta y la firma electrónica
   * por enlace (adaptador de la confirmación), cada una dentro de su transacción.
   */
  async applyResponse(
    tx: Prisma.TransactionClient,
    id: string,
    organizationId: string,
    data: { responseContent: string; responseAmount?: number | null; at?: Date },
  ) {
    const conf = await tx.externalConfirmation.findFirst({ where: { id, audit: { organizationId } } });
    if (!conf) throw new NotFoundException('Confirmación no encontrada');
    if (conf.status !== ConfirmationStatus.SENT) {
      throw new ForbiddenException('Solo se puede registrar respuesta en estado SENT');
    }

    // Calcular diferencia si se proporciona responseAmount
    let difference: number | undefined;
    if (data.responseAmount != null && conf.amount != null) {
      difference = Math.abs(Number(conf.amount) - data.responseAmount);
    }

    // Condicional: solo una respuesta gana (registro manual y firma por enlace al mismo tiempo).
    const res = await tx.externalConfirmation.updateMany({
      where: { id, status: ConfirmationStatus.SENT },
      data: {
        status:             ConfirmationStatus.RECEIVED,
        responseContent:    data.responseContent,
        responseAmount:     data.responseAmount ?? undefined,
        responseReceivedAt: data.at ?? new Date(),
        ...(difference != null && { difference }),
      },
    });
    if (res.count === 0) throw ConfirmationsService.stateChanged();
    return tx.externalConfirmation.findUniqueOrThrow({ where: { id }, include: INCLUDE_FULL });
  }

  /** Registro MANUAL de la respuesta (llegó por otro medio). Cierra la solicitud por enlace vigente. */
  async receiveResponse(id: string, dto: ReceiveResponseDto, user: AuthUser) {
    const conf = await this.getConfirmationOrThrow(id, user);
    if (conf.status !== ConfirmationStatus.SENT) {
      throw new ForbiddenException('Solo se puede registrar respuesta en estado SENT');
    }
    return this.prisma.$transaction(async (tx) => {
      await this.revokeSignatures(tx, id, user, 'La respuesta se registró de forma manual');
      return this.applyResponse(tx, id, user.organizationId, { responseContent: dto.responseContent, responseAmount: dto.responseAmount });
    }, TX_OPTIONS);
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
    return this.prisma.$transaction(async (tx) => {
      await this.revokeSignatures(tx, id, user, 'Se marcó la confirmación como sin respuesta');
      // Condicional: si el confirmante firmó justo ahora (RECEIVED), su respuesta no se pisa.
      const res = await tx.externalConfirmation.updateMany({
        where: { id, status: ConfirmationStatus.SENT },
        data: { status: ConfirmationStatus.NO_RESPONSE },
      });
      if (res.count === 0) throw ConfirmationsService.stateChanged();
      return tx.externalConfirmation.findUniqueOrThrow({ where: { id }, include: INCLUDE_FULL });
    }, TX_OPTIONS);
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
    // Las solicitudes de firma (rechazos, revocaciones, vencidas) son evidencia: sin la confirmación nadie podría verlas.
    const signatureHistory = await this.prisma.signatureRequest.count({
      where: { organizationId: user.organizationId, documentType: SignatureDocumentType.EXTERNAL_CONFIRMATION, targetId: id },
    });
    if (signatureHistory > 0) {
      throw new ConflictException('Esta confirmación tiene historial de firma electrónica y se conserva como evidencia: no se puede eliminar.');
    }
    const res = await this.prisma.externalConfirmation.deleteMany({ where: { id, status: ConfirmationStatus.DRAFT } });
    if (res.count === 0) throw ConfirmationsService.stateChanged();
    return { message: 'Confirmación eliminada' };
  }

  // ── Stats org ──────────────────────────────────────────────────────────────
  async getOrgStats(user: AuthUser) {
    const base = { audit: visibleAuditWhere(user) };
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
