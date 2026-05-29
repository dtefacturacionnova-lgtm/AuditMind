import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import { AuditType, WorkingPaperType, WpKind } from '@prisma/client';
import { CreateAuditTemplateDto, UpdateAuditTemplateDto } from './dto/audit-template.dto';

// ─── PaperDef mirrors audit-index.service interface ──────────────────────────

interface PaperDef {
  code: string;
  indexSection: string;
  title: string;
  type: WorkingPaperType;
  wpKind: WpKind;
  paperCode?: string;
}

// ─── System template seed data ────────────────────────────────────────────────

interface SystemTemplateSeed {
  name: string;
  description: string;
  auditTypes: AuditType[];
  papers: PaperDef[];
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class AuditTemplatesService {
  private readonly logger = new Logger(AuditTemplatesService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Read operations ───────────────────────────────────────────────────────

  async findAll(user: AuthUser, auditType?: AuditType) {
    // Lazy-seed system templates on first access for this org
    await this.ensureSystemTemplates(user.organizationId, user.id);

    const templates = await this.prisma.auditTemplate.findMany({
      where: {
        organizationId: user.organizationId,
      },
      orderBy: [{ isSystem: 'desc' }, { isDefault: 'desc' }, { name: 'asc' }],
      include: {
        createdBy: { select: { id: true, name: true } },
        _count: { select: { audits: true } },
      },
    });

    if (!auditType) return templates;

    // Filter by auditType in the JSON array field (done in JS since JSON array filtering is DB-specific)
    return templates.filter((t) => {
      const types = t.auditTypes as AuditType[];
      return types.includes(auditType);
    });
  }

  async findOne(id: string, user: AuthUser) {
    const template = await this.prisma.auditTemplate.findFirst({
      where: { id, organizationId: user.organizationId },
      include: {
        createdBy: { select: { id: true, name: true } },
        _count: { select: { audits: true } },
      },
    });
    if (!template) throw new NotFoundException('Plantilla de auditoría no encontrada');
    return template;
  }

  // ─── Create ────────────────────────────────────────────────────────────────

  async create(dto: CreateAuditTemplateDto, user: AuthUser) {
    if (dto.isDefault) {
      await this.clearDefaultForTypes(dto.auditTypes, user.organizationId);
    }

    return this.prisma.auditTemplate.create({
      data: {
        organizationId: user.organizationId,
        name:           dto.name,
        description:    dto.description ?? null,
        auditTypes:     dto.auditTypes  as any,
        papers:         dto.papers      as any,
        isDefault:      dto.isDefault   ?? false,
        isSystem:       false,
        createdById:    user.id,
      },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    });
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateAuditTemplateDto, user: AuthUser) {
    const template = await this.findOne(id, user);

    if (template.isSystem) {
      throw new ForbiddenException(
        'Las plantillas del sistema no pueden editarse. Duplícala para crear una versión propia.',
      );
    }

    if (dto.isDefault) {
      const typesToCheck = dto.auditTypes ?? (template.auditTypes as AuditType[]);
      await this.clearDefaultForTypes(typesToCheck, user.organizationId, id);
    }

    return this.prisma.auditTemplate.update({
      where: { id },
      data: {
        ...(dto.name        !== undefined && { name:        dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.auditTypes  !== undefined && { auditTypes:  dto.auditTypes as any }),
        ...(dto.papers      !== undefined && { papers:      dto.papers     as any }),
        ...(dto.isDefault   !== undefined && { isDefault:   dto.isDefault }),
      },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    });
  }

  // ─── Delete ────────────────────────────────────────────────────────────────

  async remove(id: string, user: AuthUser) {
    const template = await this.findOne(id, user);

    if (template.isSystem) {
      throw new ForbiddenException('Las plantillas del sistema no pueden eliminarse.');
    }
    if (template.isDefault) {
      throw new BadRequestException(
        'No puedes eliminar una plantilla marcada como predeterminada. Asigna otra como default primero.',
      );
    }

    await this.prisma.auditTemplate.delete({ where: { id } });
    return { deleted: true };
  }

  // ─── Duplicate ─────────────────────────────────────────────────────────────

  async duplicate(id: string, user: AuthUser) {
    const source = await this.findOne(id, user);

    return this.prisma.auditTemplate.create({
      data: {
        organizationId: user.organizationId,
        name:           `${source.name} (copia)`,
        description:    source.description ?? null,
        auditTypes:     source.auditTypes  as any,
        papers:         source.papers      as any,
        isDefault:      false,
        isSystem:       false,
        createdById:    user.id,
      },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    });
  }

  // ─── Set default ───────────────────────────────────────────────────────────

  async setDefault(id: string, user: AuthUser) {
    const template = await this.findOne(id, user);
    const types = template.auditTypes as AuditType[];

    // Remove default from any template that shares at least one type
    await this.clearDefaultForTypes(types, user.organizationId, id);

    return this.prisma.auditTemplate.update({
      where: { id },
      data:  { isDefault: true },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    });
  }

  // ─── Ensure system templates ───────────────────────────────────────────────
  /**
   * Called during organization onboarding.
   * Creates the pre-defined system templates if they don't exist yet.
   */
  async ensureSystemTemplates(organizationId: string, userId: string): Promise<void> {
    const existing = await this.prisma.auditTemplate.count({
      where: { organizationId, isSystem: true },
    });

    if (existing > 0) {
      this.logger.debug(`[AuditTemplates] System templates already exist for org ${organizationId}`);
      return;
    }

    this.logger.log(`[AuditTemplates] Seeding system templates for org ${organizationId}`);
    const seeds = this.getSystemTemplates();

    for (const seed of seeds) {
      await this.prisma.auditTemplate.create({
        data: {
          organizationId,
          name:        seed.name,
          description: seed.description,
          auditTypes:  seed.auditTypes as any,
          papers:      seed.papers     as any,
          isDefault:   true,
          isSystem:    true,
          createdById: userId,
        },
      });
    }
    this.logger.log(`[AuditTemplates] ${seeds.length} system templates created for org ${organizationId}`);
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /**
   * Unmarks isDefault on any template whose auditTypes overlap with the given list.
   * Optionally excludes a specific template id (the one being set as default).
   */
  private async clearDefaultForTypes(
    auditTypes: AuditType[],
    organizationId: string,
    excludeId?: string,
  ): Promise<void> {
    const currentDefaults = await this.prisma.auditTemplate.findMany({
      where: {
        organizationId,
        isDefault: true,
        ...(excludeId && { id: { not: excludeId } }),
      },
      select: { id: true, auditTypes: true },
    });

    const toUnmark = currentDefaults
      .filter((t) => {
        const types = t.auditTypes as AuditType[];
        return types.some((type) => auditTypes.includes(type));
      })
      .map((t) => t.id);

    if (toUnmark.length > 0) {
      await this.prisma.auditTemplate.updateMany({
        where: { id: { in: toUnmark } },
        data:  { isDefault: false },
      });
    }
  }

  // ─── System template data ──────────────────────────────────────────────────

  private getSystemTemplates(): SystemTemplateSeed[] {
    return [
      // ── 1. Auditoría Interna (NOGAI/IIA 2025) ─────────────────────────────
      {
        name: 'Auditoría Interna (NOGAI/IIA 2025)',
        description:
          'Papeles estándar para Auditoría Interna Privada según NOGAI e IIA 2025. ' +
          'Aplica a: Interna, Operacional, TI, Cumplimiento, ESG, BCP/DRP.',
        auditTypes: [
          AuditType.INTERNAL,
          AuditType.OPERATIONAL,
          AuditType.IT,
          AuditType.COMPLIANCE,
          AuditType.ESG,
          AuditType.BCP_DRP,
        ],
        papers: [
          {
            code: 'A-01', indexSection: 'A',
            title:  'Orden de Trabajo / Notificación de Inicio',
            type:   WorkingPaperType.PLANNING_UNDERSTANDING,
            wpKind: WpKind.STANDARD,
          },
          {
            code: 'A-02', indexSection: 'A',
            title:    'Entendimiento del Negocio y Entorno',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING,
            wpKind:   WpKind.SMART,
            paperCode: 'PT-A1',
          },
          {
            code: 'A-03', indexSection: 'A',
            title:    'Evaluación de Riesgo Inherente (RI) por Área',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING,
            wpKind:   WpKind.SMART,
            paperCode: 'PT-A2',
          },
          {
            code: 'A-04', indexSection: 'A',
            title:    'Evaluación de Controles y Riesgo de Control (RC)',
            type:     WorkingPaperType.CONTROL_EVALUATION,
            wpKind:   WpKind.SMART,
            paperCode: 'PT-A3',
          },
          {
            code: 'A-05', indexSection: 'A',
            title:    'Cálculo de Materialidad',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING,
            wpKind:   WpKind.SMART,
            paperCode: 'PT-A4',
          },
          {
            code: 'A-06', indexSection: 'A',
            title:    'Evaluación de Riesgos COSO 2013 — Sistema de Control Interno',
            type:     WorkingPaperType.CONTROL_EVALUATION,
            wpKind:   WpKind.SMART,
            paperCode: 'PT-COSO',
          },
          {
            code: 'A-07', indexSection: 'A',
            title:    'Memorando de Planificación',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING,
            wpKind:   WpKind.MASTER,
            paperCode: 'PT-MEMO',
          },
          {
            code: 'A-08', indexSection: 'A',
            title:    'Programa de Auditoría',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING,
            wpKind:   WpKind.MASTER,
            paperCode: 'PT-PROG',
          },
        ],
      },

      // ── 2. Auditoría Externa (NIA/ISA) ────────────────────────────────────
      {
        name: 'Auditoría Externa (NIA/ISA)',
        description:
          'Papeles estándar para Auditoría Externa de Estados Financieros según NIA/ISA. ' +
          'Aplica a: Externa, Financiera.',
        auditTypes: [AuditType.EXTERNAL, AuditType.FINANCIAL],
        papers: [
          {
            code: 'A-01', indexSection: 'A',
            title:  'Carta de Encargo / Términos del Trabajo (NIA 210)',
            type:   WorkingPaperType.PLANNING_UNDERSTANDING,
            wpKind: WpKind.STANDARD,
          },
          {
            code: 'A-02', indexSection: 'A',
            title:    'Entendimiento del Negocio y Entorno (NIA 315)',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING,
            wpKind:   WpKind.SMART,
            paperCode: 'PT-A1',
          },
          {
            code: 'A-03', indexSection: 'A',
            title:    'Identificación y Evaluación de Riesgos de Error Material (NIA 315)',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING,
            wpKind:   WpKind.SMART,
            paperCode: 'PT-A2',
          },
          {
            code: 'A-04', indexSection: 'A',
            title:    'Evaluación del Control Interno sobre RF (NIA 315.25)',
            type:     WorkingPaperType.CONTROL_EVALUATION,
            wpKind:   WpKind.SMART,
            paperCode: 'PT-A3',
          },
          {
            code: 'A-05', indexSection: 'A',
            title:    'Cálculo de Materialidad (NIA 320)',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING,
            wpKind:   WpKind.SMART,
            paperCode: 'PT-A4',
          },
          {
            code: 'A-06', indexSection: 'A',
            title:    'Evaluación COSO 2013 — Control Interno sobre Información Financiera',
            type:     WorkingPaperType.CONTROL_EVALUATION,
            wpKind:   WpKind.SMART,
            paperCode: 'PT-COSO',
          },
          {
            code: 'A-07', indexSection: 'A',
            title:    'Memorando de Planificación',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING,
            wpKind:   WpKind.MASTER,
            paperCode: 'PT-MEMO',
          },
          {
            code: 'A-08', indexSection: 'A',
            title:    'Programa de Auditoría por Sección',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING,
            wpKind:   WpKind.MASTER,
            paperCode: 'PT-PROG',
          },
          {
            code: 'B-00', indexSection: 'B',
            title:    'Estados Financieros del Cliente — Cédula Madre (EEFF)',
            type:     WorkingPaperType.SUBSTANTIVE_TEST,
            wpKind:   WpKind.SMART,
            paperCode: 'PT-EEFF',
          },
          {
            code: 'B-06', indexSection: 'B',
            title:    'Cédula de Diferencias y Ajustes vs. Materialidad',
            type:     WorkingPaperType.SUBSTANTIVE_TEST,
            wpKind:   WpKind.MASTER,
            paperCode: 'PT-DIFS',
          },
        ],
      },

      // ── 3. Auditoría Interna Gubernamental (NAIG) ─────────────────────────
      {
        name: 'Auditoría Interna Gubernamental (NAIG)',
        description:
          'Papeles para Auditoría Interna Gubernamental El Salvador según NAIG Decreto 7/2016. ' +
          'Aplica a: Interna Gubernamental.',
        auditTypes: [AuditType.INTERNAL_GOVERNMENTAL],
        papers: [
          {
            code: 'ACA-01', indexSection: 'ACA',
            title:  'Comisión / Designación del Auditor Gubernamental (NAIG Art. 8-9)',
            type:   WorkingPaperType.PLANNING_UNDERSTANDING,
            wpKind: WpKind.STANDARD,
          },
          {
            code: 'ACA-02', indexSection: 'ACA',
            title:    'Entendimiento del Ente Gubernamental — Marco Legal y Presupuestario',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING,
            wpKind:   WpKind.SMART,
            paperCode: 'PT-A1',
          },
          {
            code: 'ACA-03', indexSection: 'ACA',
            title:  'Evaluación del SIAFI y Sistemas de Información Gubernamental',
            type:   WorkingPaperType.CONTROL_EVALUATION,
            wpKind: WpKind.STANDARD,
          },
          {
            code: 'PL-01', indexSection: 'PL',
            title:    'Evaluación de Riesgo Gubernamental (NAIG Art. 14)',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING,
            wpKind:   WpKind.SMART,
            paperCode: 'PT-A2',
          },
          {
            code: 'PL-02', indexSection: 'PL',
            title:    'Evaluación del SCI Gubernamental — COSO 2013 (NAIG Art. 15)',
            type:     WorkingPaperType.CONTROL_EVALUATION,
            wpKind:   WpKind.SMART,
            paperCode: 'PT-COSO',
          },
          {
            code: 'PL-03', indexSection: 'PL',
            title:    'Determinación de Materialidad Pública (Base: Presupuesto Asignado)',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING,
            wpKind:   WpKind.SMART,
            paperCode: 'PT-A4',
          },
          {
            code: 'PL-04', indexSection: 'PL',
            title:    'Memorando de Planificación Gubernamental (NAIG Cap. V)',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING,
            wpKind:   WpKind.MASTER,
            paperCode: 'PT-MEMO',
          },
          {
            code: 'PL-05', indexSection: 'PL',
            title:    'Programa de Auditoría Gubernamental',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING,
            wpKind:   WpKind.MASTER,
            paperCode: 'PT-PROG',
          },
          {
            code: 'EJ-01', indexSection: 'EJ',
            title:  'Pruebas de Ejecución Presupuestaria y Tesorería (Ley AFI)',
            type:   WorkingPaperType.SUBSTANTIVE_TEST,
            wpKind: WpKind.STANDARD,
          },
          {
            code: 'EJ-02', indexSection: 'EJ',
            title:  'Revisión de Compras y Contrataciones — LACAP / UACI',
            type:   WorkingPaperType.SUBSTANTIVE_TEST,
            wpKind: WpKind.STANDARD,
          },
          {
            code: 'EJ-03', indexSection: 'EJ',
            title:  'Revisión de Planillas, Remuneraciones y Beneficios',
            type:   WorkingPaperType.SUBSTANTIVE_TEST,
            wpKind: WpKind.STANDARD,
          },
          {
            code: 'COM-01', indexSection: 'COM',
            title:    'Hoja de Hallazgo Gubernamental — 5 Elementos NAIG',
            type:     WorkingPaperType.FINDING,
            wpKind:   WpKind.SMART,
            paperCode: 'PT-GOV-HAL',
          },
          {
            code: 'INF-01', indexSection: 'INF',
            title:    'Informe de Auditoría Gubernamental (NAIG Cap. VIII)',
            type:     WorkingPaperType.CLOSURE_CONCLUSION,
            wpKind:   WpKind.MASTER,
            paperCode: 'PT-MEMO',
          },
          {
            code: 'SEG-01', indexSection: 'SEG',
            title:  'Seguimiento de Recomendaciones y Compromisos (NAIG Art. 37)',
            type:   WorkingPaperType.CLOSURE_CONCLUSION,
            wpKind: WpKind.STANDARD,
          },
        ],
      },

      // ── 4. Auditoría Forense (ACFE + NIA 240) ─────────────────────────────
      {
        name: 'Auditoría Forense (ACFE + NIA 240)',
        description:
          'Papeles para Examen Especial / Auditoría Forense según ACFE y NIA 240. ' +
          'Aplica a: Forense.',
        auditTypes: [AuditType.FORENSIC],
        papers: [
          {
            code: 'A-01', indexSection: 'A',
            title:  'Instrucción / Orden de Investigación Especial',
            type:   WorkingPaperType.PLANNING_UNDERSTANDING,
            wpKind: WpKind.STANDARD,
          },
          {
            code: 'A-02', indexSection: 'A',
            title:    'Entendimiento del Negocio y Contexto Forense',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING,
            wpKind:   WpKind.SMART,
            paperCode: 'PT-A1',
          },
          {
            code: 'A-03', indexSection: 'A',
            title:    'Evaluación de Riesgo de Fraude — Triángulo ACFE (NIA 240)',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING,
            wpKind:   WpKind.SMART,
            paperCode: 'PT-A2',
          },
          {
            code: 'A-04', indexSection: 'A',
            title:  'Cadena de Custodia y Registro de Evidencia Digital',
            type:   WorkingPaperType.CONTROL_EVALUATION,
            wpKind: WpKind.STANDARD,
          },
          {
            code: 'A-05', indexSection: 'A',
            title:    'Programa de Investigación Especial',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING,
            wpKind:   WpKind.MASTER,
            paperCode: 'PT-PROG',
          },
        ],
      },

      // ── 5. Auditoría IT Security (ISO 27001) ──────────────────────────────
      {
        name: 'Auditoría IT Security (ISO 27001)',
        description:
          'Papeles para Auditoría de Seguridad de la Información según ISO 27001:2022 y NRP-23/32. ' +
          'Aplica a: IT Security.',
        auditTypes: [AuditType.IT_SECURITY],
        papers: [
          {
            code: 'A-01', indexSection: 'A',
            title:  'Alcance del SGSI y Términos del Trabajo (ISO 27001 cl. 4-6)',
            type:   WorkingPaperType.PLANNING_UNDERSTANDING,
            wpKind: WpKind.STANDARD,
          },
          {
            code: 'A-02', indexSection: 'A',
            title:    'Entendimiento del Entorno TI y Clasificación de Activos',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING,
            wpKind:   WpKind.SMART,
            paperCode: 'PT-A1',
          },
          {
            code: 'A-03', indexSection: 'A',
            title:    'Evaluación de Riesgos de Seguridad (ISO 27001 cl. 6.1 / NRP-23)',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING,
            wpKind:   WpKind.SMART,
            paperCode: 'PT-SEC-RISK',
          },
          {
            code: 'A-04', indexSection: 'A',
            title:    'Evaluación de Controles — Tecnológicos, Organizacionales y Personas',
            type:     WorkingPaperType.CONTROL_EVALUATION,
            wpKind:   WpKind.SMART,
            paperCode: 'PT-A3',
          },
          {
            code: 'A-05', indexSection: 'A',
            title:    'Memorando de Planificación — Auditoría SI',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING,
            wpKind:   WpKind.MASTER,
            paperCode: 'PT-MEMO',
          },
          {
            code: 'A-06', indexSection: 'A',
            title:    'Programa de Auditoría de Seguridad de la Información',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING,
            wpKind:   WpKind.MASTER,
            paperCode: 'PT-PROG',
          },
          {
            code: 'B-01', indexSection: 'B',
            title:  'Revisión de Gestión de Accesos e Identidades — IAM (ISO A.8)',
            type:   WorkingPaperType.CONTROL_EVALUATION,
            wpKind: WpKind.STANDARD,
          },
          {
            code: 'B-02', indexSection: 'B',
            title:  'Revisión de Gestión de Vulnerabilidades y Parches',
            type:   WorkingPaperType.SUBSTANTIVE_TEST,
            wpKind: WpKind.STANDARD,
          },
          {
            code: 'B-03', indexSection: 'B',
            title:  'Evaluación de Controles Criptográficos y PKI (ISO A.8.24)',
            type:   WorkingPaperType.SUBSTANTIVE_TEST,
            wpKind: WpKind.STANDARD,
          },
          {
            code: 'B-04', indexSection: 'B',
            title:  'Revisión de Gestión de Incidentes de Seguridad (ISO A.8.16)',
            type:   WorkingPaperType.SUBSTANTIVE_TEST,
            wpKind: WpKind.STANDARD,
          },
          {
            code: 'B-05', indexSection: 'B',
            title:  'Evidencia de Pruebas de Penetración y Análisis de Vulnerabilidades',
            type:   WorkingPaperType.SUBSTANTIVE_TEST,
            wpKind: WpKind.STANDARD,
          },
          {
            code: 'C-01', indexSection: 'C',
            title:    'Checklist de Cumplimiento NRP-23 / NRP-32 (BCR/SSF El Salvador)',
            type:     WorkingPaperType.NORMATIVE_ANALYSIS,
            wpKind:   WpKind.SMART,
            paperCode: 'PT-SEC-RISK',
          },
          {
            code: 'C-02', indexSection: 'C',
            title:  'Evaluación Ley de Ciberseguridad D.L. 143/2024 — ACE',
            type:   WorkingPaperType.NORMATIVE_ANALYSIS,
            wpKind: WpKind.STANDARD,
          },
          {
            code: 'D-01', indexSection: 'D',
            title:    'Informe de Auditoría de Seguridad de la Información',
            type:     WorkingPaperType.CLOSURE_CONCLUSION,
            wpKind:   WpKind.MASTER,
            paperCode: 'PT-MEMO',
          },
        ],
      },

      // ── 6. Auditoría AML/Prevención LD (LCDA/NRP-36) ─────────────────────
      {
        name: 'Auditoría AML/Prevención LD (LCDA/NRP-36)',
        description:
          'Papeles para Auditoría de Prevención de Lavado de Dinero y Activos según LCDA, NRP-36 y GAFI. ' +
          'Aplica a: AML.',
        auditTypes: [AuditType.AML],
        papers: [
          {
            code: 'A-01', indexSection: 'A',
            title:  'Designación y Términos del Trabajo — Auditoría ALD/PLD',
            type:   WorkingPaperType.PLANNING_UNDERSTANDING,
            wpKind: WpKind.STANDARD,
          },
          {
            code: 'A-02', indexSection: 'A',
            title:    'Entendimiento del Sujeto Obligado — Marco Legal y Perfil de Negocio',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING,
            wpKind:   WpKind.SMART,
            paperCode: 'PT-A1',
          },
          {
            code: 'A-03', indexSection: 'A',
            title:    'Evaluación de Riesgo LA/FT — Metodología NRP-36 / GAFI',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING,
            wpKind:   WpKind.SMART,
            paperCode: 'PT-AML-RISK',
          },
          {
            code: 'A-04', indexSection: 'A',
            title:    'Evaluación de Controles PLD — 3 Líneas de Defensa',
            type:     WorkingPaperType.CONTROL_EVALUATION,
            wpKind:   WpKind.SMART,
            paperCode: 'PT-A3',
          },
          {
            code: 'A-05', indexSection: 'A',
            title:    'Memorando de Planificación ALD/PLD',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING,
            wpKind:   WpKind.MASTER,
            paperCode: 'PT-MEMO',
          },
          {
            code: 'A-06', indexSection: 'A',
            title:    'Programa de Auditoría ALD — GAFI / NRP-36',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING,
            wpKind:   WpKind.MASTER,
            paperCode: 'PT-PROG',
          },
          {
            code: 'B-01', indexSection: 'B',
            title:  'Prueba de DDC/KYC — Debida Diligencia de Clientes (NRP-36 Art. 15)',
            type:   WorkingPaperType.SUBSTANTIVE_TEST,
            wpKind: WpKind.STANDARD,
          },
          {
            code: 'B-02', indexSection: 'B',
            title:  'Revisión de PEPs y Listas de Sanciones (OFAC / ONU / UE)',
            type:   WorkingPaperType.SUBSTANTIVE_TEST,
            wpKind: WpKind.STANDARD,
          },
          {
            code: 'B-03', indexSection: 'B',
            title:  'Revisión de Transacciones Inusuales y Sistema de Monitoreo',
            type:   WorkingPaperType.SUBSTANTIVE_TEST,
            wpKind: WpKind.STANDARD,
          },
          {
            code: 'B-04', indexSection: 'B',
            title:  'Revisión de ROS — Reportes de Operaciones Sospechosas (UIF / SIRAF)',
            type:   WorkingPaperType.SUBSTANTIVE_TEST,
            wpKind: WpKind.STANDARD,
          },
          {
            code: 'B-05', indexSection: 'B',
            title:  'Evaluación del Oficial de Cumplimiento (Ley LCDA Art. 14)',
            type:   WorkingPaperType.CONTROL_EVALUATION,
            wpKind: WpKind.STANDARD,
          },
          {
            code: 'B-06', indexSection: 'B',
            title:  'Revisión de Programa de Capacitación y Cultura ALD',
            type:   WorkingPaperType.CONTROL_EVALUATION,
            wpKind: WpKind.STANDARD,
          },
          {
            code: 'C-01', indexSection: 'C',
            title:    'Checklist NRP-36 / Instructivo UIF V3 — Cumplimiento',
            type:     WorkingPaperType.NORMATIVE_ANALYSIS,
            wpKind:   WpKind.SMART,
            paperCode: 'PT-AML-RISK',
          },
          {
            code: 'D-01', indexSection: 'D',
            title:    'Informe ALD — Formato CVPCPA Guía V3 (Res. 129/2022)',
            type:     WorkingPaperType.CLOSURE_CONCLUSION,
            wpKind:   WpKind.MASTER,
            paperCode: 'PT-MEMO',
          },
        ],
      },
    ];
  }
}
