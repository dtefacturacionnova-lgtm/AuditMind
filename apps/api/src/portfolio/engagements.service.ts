import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException, ConflictException,
  Logger,
} from '@nestjs/common';
import {
  AuditOriginType, AuditStatus, AuditType, ClientStatus, EngagementStatus, Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import { AuditIndexService } from '../audits/audit-index.service';
import { AuditFoldersService } from '../audit-folders/audit-folders.service';
import { ClientsService } from './clients.service';
import { CreateEngagementDto } from './dto/engagement.dto';

/** Código estable de la plantilla de sistema "Auditoría Financiera Externa v1.0". */
const EXTERNAL_FINANCIAL_TEMPLATE_CODE = 'AUDIT_EXTERNAL_FINANCIAL_V1';

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

    const duplicate = await this.prisma.engagement.findUnique({
      where: { clientId_fiscalYear: { clientId: dto.clientId, fiscalYear: dto.fiscalYear } },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException(
        `Ya existe un encargo para este cliente en el ejercicio ${dto.fiscalYear} (${duplicate.id}).`,
      );
    }

    if (dto.engagementLetterId) {
      const letter = await this.prisma.engagementLetter.findUnique({
        where:  { id: dto.engagementLetterId },
        select: { id: true, organizationId: true, clientId: true },
      });
      if (!letter || letter.organizationId !== user.organizationId) {
        throw new NotFoundException('Carta de compromiso no encontrada');
      }
      if (letter.clientId !== dto.clientId) {
        throw new BadRequestException('La carta de compromiso pertenece a otro cliente.');
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
        where:  { id: dto.leadPartnerId, organizationId: user.organizationId },
        select: { id: true },
      });
      if (!partner) throw new NotFoundException('Socio a cargo no encontrado en la organización');
    }

    return this.prisma.engagement.create({
      data: {
        organizationId:     user.organizationId,
        clientId:           dto.clientId,
        engagementLetterId: dto.engagementLetterId ?? null,
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
    return this.prisma.engagement.findMany({
      where: {
        organizationId: user.organizationId,
        ...(clientId && { clientId }),
        ...(status   && { status }),
      },
      orderBy: [{ fiscalYear: 'desc' }, { createdAt: 'desc' }],
      include: ENGAGEMENT_INCLUDE,
    });
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

    // 2. Resolver la plantilla
    const templateId = await this.resolveTemplateId(engagement.templateId, user);

    // 3. AuditEntity espejo del cliente (si aún no existe)
    const auditEntityId = await this.ensureAuditEntity(engagement.clientId, user);

    // 4. Transacción atómica: Audit + LEAD del equipo + vínculo en el Engagement
    const title = `${engagement.client.legalName} — Auditoría EEFF ${engagement.fiscalYear}`;
    const leadAuditorId = engagement.leadPartnerId ?? user.id;
    const scope = await this.buildScope(engagement.engagementLetter?.id ?? null, engagement.client.legalName, engagement.fiscalYear);

    const result = await this.prisma.$transaction(async (tx) => {
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
          auditPeriodStart: new Date(Date.UTC(engagement.fiscalYear, 0, 1)),
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
        data:  { auditId: audit.id, status: EngagementStatus.APPROVED },
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

    return this.prisma.engagement.update({
      where:   { id },
      data:    { status: EngagementStatus.CANCELLED },
      include: ENGAGEMENT_INCLUDE,
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

    const fallback = await this.prisma.auditTemplate.findFirst({
      where:  { organizationId: user.organizationId, code: EXTERNAL_FINANCIAL_TEMPLATE_CODE },
      select: { id: true },
    });
    if (!fallback) {
      throw new NotFoundException(
        'No se encontró la plantilla de Auditoría Financiera Externa (code = ' +
        `${EXTERNAL_FINANCIAL_TEMPLATE_CODE}) para esta organización — ejecuta el reseed del sistema ` +
        '(POST /audit-templates/reseed-system) o indica templateId en el encargo.',
      );
    }
    return fallback.id;
  }

  /**
   * El cliente de Cartera y la `AuditEntity` del Universo Auditable son dos
   * caras del mismo sujeto: la auditoría real cuelga de `Audit.auditEntityId`,
   * así que al aprobar se crea el espejo una sola vez y queda cacheado en
   * `Client.auditEntityId` (@unique, relación 1-1).
   */
  private async ensureAuditEntity(clientId: string, user: AuthUser): Promise<string> {
    const client = await this.prisma.client.findUnique({ where: { id: clientId } });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    if (client.auditEntityId) return client.auditEntityId;

    const entity = await this.prisma.auditEntity.create({
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

    await this.prisma.client.update({
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
