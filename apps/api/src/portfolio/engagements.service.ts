import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException, ConflictException,
  Logger,
} from '@nestjs/common';
import {
  AuditOriginType, AuditStatus, AuditType, ClientInvoiceStatus, ClientStatus, EngagementKind, EngagementStatus, PhaseStatus, PhaseType, Prisma,
  ScheduleItemStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import { AuditIndexService } from '../audits/audit-index.service';
import { AuditFoldersService } from '../audit-folders/audit-folders.service';
import { ClientsService } from './clients.service';
import {
  assertFiscalYearEnd, assertReadyToApprove, auditPeriodStartFor, findExternalFinancialTemplateId, PARTNER_ROLES,
} from './engagement-readiness.util';
import { CreateEngagementDto, UpdateEngagementDto } from './dto/engagement.dto';
import { cancelEngagementInTx } from './engagement-cancel.util';
import { assertAuditVisible, maskHiddenAudits } from '../common/utils/investigation-scope.util';


/**
 * Etapas básicas de una consultoría (acordadas con el despacho, 2026-10-23). No lleva plantilla de papeles ni expediente
 * precargado: depende demasiado del tipo de consultoría y se define más adelante.
 */
export const CONSULTING_PHASES: ReadonlyArray<{ phaseType: PhaseType; name: string }> = [
  { phaseType: PhaseType.PLANNING,  name: 'Planificación' },
  { phaseType: PhaseType.FIELDWORK, name: 'Ejecución' },
  { phaseType: PhaseType.REPORTING, name: 'Informes y cierre' },
];

const ENGAGEMENT_INCLUDE = {
  client:   { select: { id: true, legalName: true, tradeName: true, status: true, auditEntityId: true } },
  template: { select: { id: true, name: true, code: true } },
  engagementLetter: { select: { id: true, status: true, signedAt: true, year: true } },
  audit:    { select: { id: true, title: true, status: true, type: true, templateId: true } },
} satisfies Prisma.EngagementInclude;

@Injectable()
export class EngagementsService {
  private readonly logger = new Logger(EngagementsService.name);

  constructor(
    private readonly prisma:       PrismaService,
    private readonly clients:      ClientsService,
    private readonly auditIndex:   AuditIndexService,
    private readonly auditFolders: AuditFoldersService,
  ) {}

  private async getEngagementOrThrow(id: string, user: AuthUser) {
    const engagement = await this.prisma.engagement.findUnique({
      where:   { id },
      include: ENGAGEMENT_INCLUDE,
    });
    if (!engagement) throw new NotFoundException('Encargo no encontrado');
    if (engagement.organizationId !== user.organizationId) throw new ForbiddenException();
    return engagement;
  }

  // ── Crear encargo ─────────────────────────────────────────────────────────
  async create(dto: CreateEngagementDto, user: AuthUser) {
    const client = await this.clients.getClientOrThrow(dto.clientId, user);

    if (client.status !== ClientStatus.ACTIVE) {
      throw new BadRequestException(
        `Solo se pueden registrar encargos de clientes ACTIVE (actual: ${client.status}). ` +
        'Firme la carta de compromiso antes de crear el encargo.',
      );
    }

    const kind = dto.kind ?? EngagementKind.AUDIT;
    const title = dto.title?.trim() || null;
    if (kind === EngagementKind.CONSULTING) {
      if (!title || title.length < 3) throw new BadRequestException('Una consultoría necesita un nombre de al menos 3 caracteres (por ejemplo «Asesoría tributaria 2026»).');
      if (dto.templateId) throw new BadRequestException('Las consultorías no usan plantilla de auditoría.');
    }

    // Una AUDITORÍA por cliente y año (índice parcial en la base); las consultorías pueden ser varias.
    if (kind === EngagementKind.AUDIT) {
      const duplicate = await this.prisma.engagement.findFirst({
        // Un encargo cancelado no ocupa el ejercicio (el índice único de la base tampoco lo cuenta).
        where: { clientId: dto.clientId, fiscalYear: dto.fiscalYear, kind: EngagementKind.AUDIT, status: { not: EngagementStatus.CANCELLED } },
        select: { id: true },
      });
      if (duplicate) {
        throw new ConflictException(
          `Ya existe un encargo para este cliente en el ejercicio ${dto.fiscalYear} (${duplicate.id}).`,
        );
      }
    }

    assertFiscalYearEnd(dto.fiscalYear, dto.fiscalYearEndDate);

    if (dto.engagementLetterId) {
      const letter = await this.prisma.engagementLetter.findUnique({
        where:  { id: dto.engagementLetterId },
        select: { id: true, organizationId: true, clientId: true, status: true },
      });
      if (!letter || letter.organizationId !== user.organizationId) {
        throw new NotFoundException('Carta de compromiso no encontrada');
      }
      if (letter.clientId !== dto.clientId) {
        throw new BadRequestException('La carta de compromiso pertenece a otro cliente.');
      }
      if (letter.status !== 'SIGNED') {
        throw new BadRequestException('Solo se vincula una carta de compromiso firmada: el encargo se acuerda por escrito (NIA 210).');
      }
    }

    if (dto.templateId) {
      const template = await this.prisma.auditTemplate.findFirst({
        where:  { id: dto.templateId, organizationId: user.organizationId },
        select: { id: true },
      });
      if (!template) throw new NotFoundException('Plantilla de auditoría no encontrada');
    }

    if (dto.leadPartnerId) {
      const partner = await this.prisma.user.findFirst({
        where:  { id: dto.leadPartnerId, organizationId: user.organizationId, active: true, role: { in: [...PARTNER_ROLES] } },
        select: { id: true },
      });
      if (!partner) throw new BadRequestException('El socio a cargo debe ser un usuario activo de la organización con rol de gerente o superior.');
    }

    return this.prisma.engagement.create({
      data: {
        organizationId:     user.organizationId,
        clientId:           dto.clientId,
        engagementLetterId: dto.engagementLetterId ?? null,
        kind,
        title,
        fiscalYear:         dto.fiscalYear,
        fiscalYearEndDate:  new Date(dto.fiscalYearEndDate),
        plannedStartDate:   dto.plannedStartDate ? new Date(dto.plannedStartDate) : null,
        plannedEndDate:     dto.plannedEndDate   ? new Date(dto.plannedEndDate)   : null,
        leadPartnerId:      dto.leadPartnerId ?? null,
        templateId:         dto.templateId ?? null,
        notes:              dto.notes ?? null,
        status:             EngagementStatus.DRAFT,
        createdById:        user.id,
      },
      include: ENGAGEMENT_INCLUDE,
    });
  }

  // ── Listar ────────────────────────────────────────────────────────────────
  async findAll(user: AuthUser, clientId?: string, status?: EngagementStatus) {
    const rows = await this.prisma.engagement.findMany({
      where: {
        organizationId: user.organizationId,
        ...(clientId && { clientId }),
        ...(status   && { status }),
      },
      orderBy: [{ fiscalYear: 'desc' }, { createdAt: 'desc' }],
      include: ENGAGEMENT_INCLUDE,
    });
    // Modo investigación (2026-10-25): el encargo cuya auditoría es una investigación ajena al equipo no muestra su título ni estado.
    return maskHiddenAudits(this.prisma, rows, user);
  }

  // ── Editar datos descriptivos ─────────────────────────────────────────────
  /**
   * Cambia nombre, fechas previstas, socio a cargo y notas. No toca cliente, ejercicio ni tipo (de eso depende el honorario
   * y el calendario de cobros). El socio solo se cambia mientras el encargo es borrador: después el responsable vive en la auditoría.
   */
  async update(id: string, dto: UpdateEngagementDto, user: AuthUser) {
    const engagement = await this.getEngagementOrThrow(id, user);
    if (engagement.status === EngagementStatus.CANCELLED) {
      throw new BadRequestException('Un encargo cancelado no se puede editar.');
    }
    if (dto.title !== undefined && engagement.kind === EngagementKind.AUDIT) {
      throw new BadRequestException('El nombre solo se edita en las consultorías: la auditoría se nombra con el cliente y el ejercicio.');
    }
    if (dto.leadPartnerId !== undefined) {
      if (engagement.status !== EngagementStatus.DRAFT) {
        throw new BadRequestException('El socio a cargo solo se cambia mientras el encargo es borrador; después se cambia en la auditoría.');
      }
      const partner = await this.prisma.user.findFirst({
        where:  { id: dto.leadPartnerId, organizationId: user.organizationId, active: true, role: { in: [...PARTNER_ROLES] } },
        select: { id: true },
      });
      if (!partner) throw new BadRequestException('El socio a cargo debe ser un usuario activo de la organización con rol de gerente o superior.');
    }

    // La carta que respalda el encargo y el cierre del ejercicio se corrigen solo mientras es borrador (después de aprobar ya
    // nacieron la auditoría y su período). Antes no había forma de vincular la carta desde el encargo ni de corregir el cierre.
    if (dto.engagementLetterId !== undefined || dto.fiscalYearEndDate !== undefined) {
      if (engagement.status !== EngagementStatus.DRAFT) {
        throw new BadRequestException('La carta de compromiso y el cierre del ejercicio solo se cambian mientras el encargo es borrador.');
      }
    }
    if (dto.engagementLetterId) {
      const letter = await this.prisma.engagementLetter.findFirst({
        where:  { id: dto.engagementLetterId, organizationId: user.organizationId, clientId: engagement.clientId },
        select: { id: true, status: true },
      });
      if (!letter) throw new NotFoundException('Carta de compromiso no encontrada para este cliente');
      if (letter.status !== 'SIGNED') throw new BadRequestException('Solo se vincula una carta de compromiso firmada (NIA 210).');
    }
    if (dto.fiscalYearEndDate) assertFiscalYearEnd(engagement.fiscalYear, dto.fiscalYearEndDate);

    const start = dto.plannedStartDate ? new Date(dto.plannedStartDate) : undefined;
    const end   = dto.plannedEndDate   ? new Date(dto.plannedEndDate)   : undefined;
    const effStart = start ?? engagement.plannedStartDate ?? undefined;
    const effEnd   = end   ?? engagement.plannedEndDate   ?? undefined;
    if (effStart && effEnd && effEnd < effStart) {
      throw new BadRequestException('La fecha de fin prevista no puede ser anterior a la de inicio.');
    }

    const newTitle = dto.title !== undefined ? dto.title.trim() : undefined;
    if (newTitle !== undefined && newTitle.length < 3) throw new BadRequestException('El nombre debe tener al menos 3 caracteres.');
    // Modo investigación (2026-10-25): renombrar la consultoría renombra su auditoría; no se hace sobre una investigación ajena.
    if (newTitle !== undefined && engagement.auditId) await assertAuditVisible(this.prisma, engagement.auditId, user);
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.engagement.update({
        where: { id },
        data: {
          ...(newTitle !== undefined && { title: newTitle }),
          ...(start && { plannedStartDate: start }),
          ...(end && { plannedEndDate: end }),
          ...(dto.leadPartnerId !== undefined && { leadPartnerId: dto.leadPartnerId }),
          ...(dto.engagementLetterId && { engagementLetterId: dto.engagementLetterId }),
          ...(dto.fiscalYearEndDate && { fiscalYearEndDate: new Date(dto.fiscalYearEndDate) }),
          ...(dto.notes !== undefined && { notes: dto.notes }),
        },
        include: ENGAGEMENT_INCLUDE,
      });
      // El nombre de la consultoría es también el de su auditoría real: se mantienen iguales.
      if (newTitle !== undefined && engagement.auditId) {
        await tx.audit.update({
          where: { id: engagement.auditId },
          data:  { title: `${engagement.client.legalName} — ${newTitle}` },
        });
      }
      return updated;
    });
    // ...y la respuesta no muestra título ni estado de una investigación ajena (igual que el listado).
    return (await maskHiddenAudits(this.prisma, [result], user))[0];
  }

  // ── Aprobar encargo → crear la auditoría real ─────────────────────────────
  /**
   * Convierte el encargo comercial en una auditoría del sistema.
   *
   * Nota de diseño — por qué NO se inyecta `AuditsService.create()`:
   * `AuditsModule` sí exporta `AuditsService` y no habría ciclo de dependencias,
   * pero `AuditsService.create()` abre su propia escritura contra `PrismaService`
   * y no acepta un cliente de transacción externo. El requisito de esta operación
   * es que la `Audit` y el `Engagement.auditId`/`status` se escriban de forma
   * atómica: si el update del encargo falla, la auditoría NO debe quedar
   * huérfana. Por eso se replican aquí los campos mínimos que `AuditsService`
   * ya establece (mismo shape: title/type/auditEntityId/organizationId/
   * leadAuditorId/fechas/templateId/status + alta del LEAD en `AuditTeam`)
   * dentro de un único `$transaction`, y el scaffold del expediente se dispara
   * DESPUÉS del commit reutilizando los mismos servicios que usa
   * `AuditsService.create()` (`AuditIndexService` + `AuditFoldersService`),
   * también en fire-and-forget. Es el mismo criterio con el que
   * `FieldEvidenceModule` reutiliza servicios de `WorkingPapersModule` en vez de
   * crear un mecanismo de acceso a datos paralelo.
   */
  async approve(id: string, user: AuthUser) {
    // 1. Cargar y validar precondición
    const engagement = await this.getEngagementOrThrow(id, user);
    if (engagement.status !== EngagementStatus.DRAFT) {
      throw new BadRequestException(
        `Solo se puede aprobar un encargo en DRAFT (actual: ${engagement.status}).`,
      );
    }

    if (engagement.kind === EngagementKind.CONSULTING) return this.approveConsulting(engagement, user);

    // 2. Precondiciones de negocio (cliente activo, carta firmada, aceptación del ejercicio) y plantilla
    const readiness = await assertReadyToApprove(this.prisma, engagement);
    const templateId = await this.resolveTemplateId(engagement.templateId, user);

    // 3-4. Transacción atómica: reclamo del encargo + AuditEntity espejo del cliente + Audit + LEAD del equipo + vínculo
    const title = `${engagement.client.legalName} — Auditoría EEFF ${engagement.fiscalYear}`;
    const leadAuditorId = engagement.leadPartnerId ?? user.id;
    const scope = await this.buildScope(engagement.engagementLetter?.id ?? readiness.letterId, engagement.client.legalName, engagement.fiscalYear);

    const result = await this.prisma.$transaction(async (tx) => {
      await this.claimDraft(tx, id);
      const auditEntityId = await this.ensureAuditEntity(tx, engagement.clientId, user);
      const audit = await tx.audit.create({
        data: {
          organizationId:   user.organizationId,
          title,
          type:             AuditType.EXTERNAL_FINANCIAL,
          subtype:          'EEFF_COMPLETO',
          status:           AuditStatus.PLANNING,
          // El encargo nace de una solicitud del cliente (dirección), no del plan
          // anual de una auditoría interna — mismo criterio que la auditoría demo
          // de Auditoría Financiera Externa sembrada por AuditTemplatesService.
          originType:       AuditOriginType.UNPLANNED_MANAGEMENT,
          auditEntityId,
          templateId,
          leadAuditorId,
          startDate:        engagement.plannedStartDate ?? null,
          endDate:          engagement.plannedEndDate   ?? null,
          auditPeriodStart: auditPeriodStartFor(engagement.fiscalYearEndDate),
          auditPeriodEnd:   engagement.fiscalYearEndDate,
          estimatedHours:   0,
          scope,
          objectives:
            'Emitir una opinión independiente sobre si los estados financieros presentan razonablemente, ' +
            'en todos los aspectos materiales, la situación financiera, el rendimiento financiero y los ' +
            'flujos de efectivo de la entidad, de conformidad con el marco de información financiera aplicable (NIA 200).',
        },
      });

      // Igual que AuditsService.create(): el auditor a cargo siempre queda en el equipo.
      await tx.auditTeam.upsert({
        where:  { auditId_userId: { auditId: audit.id, userId: leadAuditorId } },
        create: { auditId: audit.id, userId: leadAuditorId, role: 'LEAD' },
        update: { role: 'LEAD' },
      });

      const updated = await tx.engagement.update({
        where: { id },
        data:  { auditId: audit.id, status: EngagementStatus.APPROVED, ...(engagement.engagementLetterId ? {} : { engagementLetterId: readiness.letterId }) },
        include: ENGAGEMENT_INCLUDE,
      });

      return updated;
    });

    // 5. Scaffold del expediente — fuera de la transacción (es idempotente y
    //    tarda; un fallo aquí no debe revertir la aprobación).
    const auditId = result.auditId;
    if (auditId) {
      void (async () => {
        try {
          await this.auditIndex.scaffold(auditId, AuditType.EXTERNAL_FINANCIAL, user.id, templateId);
          await this.auditFolders.initializeFromAuditTemplateSections(auditId, user);
        } catch (err) {
          this.logger.error(
            `[Engagement.approve] Scaffold falló para la auditoría ${auditId}`,
            String(err),
          );
        }
      })();
    }

    return result;
  }

  /**
   * Aprobar una consultoría: crea su auditoría real (tipo OPERATIONAL, subtipo CONSULTORIA) con las tres etapas básicas y
   * SIN plantilla de papeles ni expediente precargado. Las horas y los costos se registran contra esa auditoría, igual que
   * en una auditoría. Todo en una transacción: o quedan la auditoría, el equipo, las etapas y el vínculo, o nada.
   */
  private async approveConsulting(
    engagement: Awaited<ReturnType<EngagementsService['getEngagementOrThrow']>>,
    user: AuthUser,
  ) {
    const leadAuditorId = engagement.leadPartnerId ?? user.id;
    const name = engagement.title ?? `Consultoría ${engagement.fiscalYear}`;
    const title = `${engagement.client.legalName} — ${name}`;

    return this.prisma.$transaction(async (tx) => {
      await this.claimDraft(tx, engagement.id);
      const auditEntityId = await this.ensureAuditEntity(tx, engagement.clientId, user);
      const audit = await tx.audit.create({
        data: {
          organizationId:   user.organizationId,
          title,
          type:             AuditType.OPERATIONAL,
          subtype:          'CONSULTORIA',
          status:           AuditStatus.PLANNING,
          originType:       AuditOriginType.UNPLANNED_MANAGEMENT,
          auditEntityId,
          templateId:       null,
          leadAuditorId,
          startDate:        engagement.plannedStartDate ?? null,
          endDate:          engagement.plannedEndDate   ?? null,
          auditPeriodStart: new Date(Date.UTC(engagement.fiscalYear, 0, 1)),
          auditPeriodEnd:   engagement.fiscalYearEndDate,
          estimatedHours:   0,
          scope:            engagement.notes ?? `${name} para ${engagement.client.legalName}, ejercicio ${engagement.fiscalYear}.`,
        },
      });
      await tx.auditTeam.upsert({
        where:  { auditId_userId: { auditId: audit.id, userId: leadAuditorId } },
        create: { auditId: audit.id, userId: leadAuditorId, role: 'LEAD' },
        update: { role: 'LEAD' },
      });
      await tx.auditPhase.createMany({
        data: CONSULTING_PHASES.map((p, order) => ({
          auditId: audit.id, phaseType: p.phaseType, name: p.name, order, status: PhaseStatus.PENDING,
        })),
      });
      return tx.engagement.update({
        where:   { id: engagement.id },
        data:    { auditId: audit.id, status: EngagementStatus.APPROVED },
        include: ENGAGEMENT_INCLUDE,
      });
    });
  }

  /**
   * Reclama el paso DRAFT → APPROVED de forma atómica: de dos aprobaciones simultáneas (doble clic) gana una y la otra recibe 409,
   * en lugar de crear dos auditorías y dejar una huérfana. La fila queda bloqueada hasta que confirme la transacción.
   */
  private async claimDraft(tx: Prisma.TransactionClient, id: string) {
    const res = await tx.engagement.updateMany({
      where: { id, status: EngagementStatus.DRAFT, auditId: null },
      data:  { status: EngagementStatus.APPROVED },
    });
    if (res.count !== 1) throw new ConflictException('El encargo ya fue aprobado (o lo está aprobando otra persona).');
  }

  // ── Cancelar encargo ──────────────────────────────────────────────────────
  async cancel(id: string, user: AuthUser) {
    const engagement = await this.getEngagementOrThrow(id, user);

    if (engagement.auditId) {
      throw new BadRequestException(
        'El encargo ya generó una auditoría real; no se puede cancelar desde Cartera. ' +
        'Use el flujo de cancelación de auditorías (PATCH /audits/:id/status → CANCELLED).',
      );
    }
    if (engagement.status === EngagementStatus.CANCELLED) {
      throw new BadRequestException('El encargo ya está cancelado.');
    }

    // Facturas vigentes, cuotas por cobrar y candado: ver cancelEngagementInTx (lo comparte la cancelación de la auditoría).
    return this.prisma.$transaction(async (tx) => {
      await cancelEngagementInTx(tx, id, user, { viaAudit: false });
      return tx.engagement.findUniqueOrThrow({ where: { id }, include: ENGAGEMENT_INCLUDE });
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async resolveTemplateId(explicitId: string | null, user: AuthUser): Promise<string> {
    if (explicitId) {
      const template = await this.prisma.auditTemplate.findFirst({
        where:  { id: explicitId, organizationId: user.organizationId },
        select: { id: true },
      });
      if (!template) throw new NotFoundException('La plantilla indicada en el encargo no existe en la organización');
      return template.id;
    }

    const fallback = await findExternalFinancialTemplateId(this.prisma, user.organizationId);
    if (!fallback) {
      throw new NotFoundException(
        'No se encontró la plantilla «Auditoría Financiera Externa v1.0» para esta organización: abre Plantillas de Auditoría ' +
        '(se siembran solas) o indica la plantilla en el encargo.',
      );
    }
    return fallback;
  }

  /**
   * El cliente de Cartera y la `AuditEntity` del Universo Auditable son dos
   * caras del mismo sujeto: la auditoría real cuelga de `Audit.auditEntityId`,
   * así que al aprobar se crea el espejo una sola vez y queda cacheado en
   * `Client.auditEntityId` (@unique, relación 1-1).
   */
  private async ensureAuditEntity(db: Prisma.TransactionClient, clientId: string, user: AuthUser): Promise<string> {
    // Dos encargos del mismo cliente aprobados a la vez no deben crear dos espejos: se serializa por la fila del cliente.
    await db.$queryRaw`SELECT id FROM clients WHERE id = ${clientId} FOR UPDATE`;
    const client = await db.client.findUnique({ where: { id: clientId } });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    if (client.auditEntityId) return client.auditEntityId;

    const entity = await db.auditEntity.create({
      data: {
        organizationId: user.organizationId,
        name:           client.legalName,
        description:
          `Cliente de auditoría externa registrado en Cartera${client.taxId ? ` — NIT/Tax ID: ${client.taxId}` : ''}.`,
        entityType:     'COMPANY',
        sector:         client.industry ?? null,
        responsible:    client.contactName ?? null,
        location:       client.address ?? null,
        contactEmail:   client.contactEmail ?? null,
        contactPhone:   client.contactPhone ?? null,
        active:         true,
      },
      select: { id: true },
    });

    await db.client.update({
      where: { id: clientId },
      data:  { auditEntityId: entity.id },
    });

    return entity.id;
  }

  /** Alcance de la auditoría, tomado de la propuesta aceptada cuando existe. */
  private async buildScope(
    engagementLetterId: string | null,
    legalName: string,
    fiscalYear: number,
  ): Promise<string> {
    const genericScope =
      `Auditoría de los estados financieros de ${legalName} correspondientes al ejercicio ${fiscalYear}, ` +
      'de conformidad con las Normas Internacionales de Auditoría (NIA).';

    if (!engagementLetterId) return genericScope;

    const letter = await this.prisma.engagementLetter.findUnique({
      where:   { id: engagementLetterId },
      select:  { proposal: { select: { scope: true } } },
    });
    return letter?.proposal?.scope ?? genericScope;
  }
}
