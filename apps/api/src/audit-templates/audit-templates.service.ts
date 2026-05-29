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

// ─── SectionDef — folder/subfolder structure ─────────────────────────────────

interface SectionDef {
  ref: string;
  name: string;
  phaseType: 'PLANNING' | 'FIELDWORK' | 'REPORTING' | 'FOLLOWUP';
  children?: Array<{ ref: string; name: string }>;
}

// ─── System template seed data ────────────────────────────────────────────────

interface SystemTemplateSeed {
  name: string;
  description: string;
  auditTypes: AuditType[];
  sections: SectionDef[];
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
        sections:       dto.sections    as any ?? null,
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

    // System templates CAN be edited (they are the org's starting point, not sacred).
    // Only deletion is blocked to avoid losing the base reference.

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
        ...(dto.sections    !== undefined && { sections:    dto.sections   as any }),
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
   * Called lazily in findAll(). Creates system templates if they don't exist yet.
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
          sections:    seed.sections   as any,
          isDefault:   true,
          isSystem:    true,
          createdById: userId,
        },
      });
    }
    this.logger.log(`[AuditTemplates] ${seeds.length} system templates created for org ${organizationId}`);
  }

  // ─── Reseed system templates ───────────────────────────────────────────────
  /**
   * Updates existing system templates with the current seed definitions.
   * Matches by name — preserves ID (no audit references break).
   * Creates any missing ones.
   */
  async reseedSystemTemplates(user: AuthUser): Promise<{ updated: number; created: number }> {
    const seeds = this.getSystemTemplates();
    const existing = await this.prisma.auditTemplate.findMany({
      where: { organizationId: user.organizationId, isSystem: true },
      select: { id: true, name: true },
    });

    let updated = 0;
    let created = 0;

    for (const seed of seeds) {
      const match = existing.find((e) => e.name === seed.name);
      if (match) {
        await this.prisma.auditTemplate.update({
          where: { id: match.id },
          data: {
            description: seed.description,
            auditTypes:  seed.auditTypes as any,
            papers:      seed.papers     as any,
            sections:    seed.sections   as any,
          },
        });
        updated++;
      } else {
        await this.prisma.auditTemplate.create({
          data: {
            organizationId: user.organizationId,
            name:           seed.name,
            description:    seed.description,
            auditTypes:     seed.auditTypes as any,
            papers:         seed.papers     as any,
            sections:       seed.sections   as any,
            isDefault:      true,
            isSystem:       true,
            createdById:    user.id,
          },
        });
        created++;
      }
    }

    this.logger.log(`[AuditTemplates] Reseed complete: ${updated} updated, ${created} created for org ${user.organizationId}`);
    return { updated, created };
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
  // Based on: AuditMind_PapelesInteligentes_v4.0, AuditMind_PTv5.0,
  //           AuditMind_UAIGubernamental_v7.0, AuditMind_AuditFinancieraExternaSV_v8.0

  private getSystemTemplates(): SystemTemplateSeed[] {
    return [

      // ═══════════════════════════════════════════════════════════════════════
      // 1. Auditoría Interna Privada (NOGAI/IIA 2025) — ÍNDICE-01
      //    Secciones: A (Planificación) · B (Ejecución) · D (Hallazgos) · E (Cierre)
      // ═══════════════════════════════════════════════════════════════════════
      {
        name: 'Auditoría Interna (NOGAI/IIA 2025)',
        description:
          'Índice completo para Auditoría Interna Privada según NOGAI e IIA 2025. ' +
          'Incluye planificación COSO, ejecución, hallazgos e informe. ' +
          'Aplica a: Interna, Operacional, TI, Cumplimiento, ESG, BCP/DRP.',
        auditTypes: [
          AuditType.INTERNAL,
          AuditType.OPERATIONAL,
          AuditType.IT,
          AuditType.COMPLIANCE,
          AuditType.ESG,
          AuditType.BCP_DRP,
        ],
        sections: [
          { ref: 'A', name: 'Planificación y Entendimiento del Negocio', phaseType: 'PLANNING' },
          { ref: 'B', name: 'Ejecución y Pruebas de Campo',              phaseType: 'FIELDWORK' },
          { ref: 'D', name: 'Hallazgos y Comunicaciones',                phaseType: 'REPORTING' },
          { ref: 'E', name: 'Cierre e Informe de Auditoría',             phaseType: 'REPORTING' },
        ],
        papers: [
          // ── A — Planificación ───────────────────────────────────────────
          { code: 'A-01', indexSection: 'A',
            title:  'Orden de Trabajo / Notificación de Inicio',
            type:   WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.STANDARD },
          { code: 'A-02', indexSection: 'A',
            title:    'Entendimiento del Negocio y Entorno',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART,
            paperCode: 'PT-A1' },
          { code: 'A-03', indexSection: 'A',
            title:    'Evaluación de Riesgo Inherente (RI) por Área',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART,
            paperCode: 'PT-A2' },
          { code: 'A-04', indexSection: 'A',
            title:    'Evaluación de Controles y Riesgo de Control (RC)',
            type:     WorkingPaperType.CONTROL_EVALUATION, wpKind: WpKind.SMART,
            paperCode: 'PT-A3' },
          { code: 'A-05', indexSection: 'A',
            title:    'Cálculo de Materialidad',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART,
            paperCode: 'PT-A4' },
          { code: 'A-06', indexSection: 'A',
            title:    'Evaluación de Riesgos COSO 2013 — Sistema de Control Interno',
            type:     WorkingPaperType.CONTROL_EVALUATION, wpKind: WpKind.SMART,
            paperCode: 'PT-COSO' },
          { code: 'A-07', indexSection: 'A',
            title:    'Matriz de Riesgo, Control e Impacto (MRCI)',
            type:     WorkingPaperType.CONTROL_EVALUATION, wpKind: WpKind.MASTER,
            paperCode: 'PT-MRCI' },
          { code: 'A-08', indexSection: 'A',
            title:    'Memorando de Planificación',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.MASTER,
            paperCode: 'PT-MEMO' },
          { code: 'A-09', indexSection: 'A',
            title:    'Programa de Auditoría',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.MASTER,
            paperCode: 'PT-PROG' },
          { code: 'A-10', indexSection: 'A',
            title:  'Presupuesto de Horas y Cronograma',
            type:   WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.STANDARD },
          // ── B — Ejecución ───────────────────────────────────────────────
          { code: 'B-01', indexSection: 'B',
            title:    'Cuestionario de Evaluación de Controles por Área',
            type:     WorkingPaperType.CONTROL_EVALUATION, wpKind: WpKind.SMART,
            paperCode: 'PT-B1' },
          { code: 'B-02', indexSection: 'B',
            title:    'Papel de Procedimiento Sustantivo',
            type:     WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART,
            paperCode: 'PT-B2' },
          { code: 'B-03', indexSection: 'B',
            title:    'Cédula de Análisis de Datos / CAATs',
            type:     WorkingPaperType.DATA_ANALYSIS, wpKind: WpKind.SMART,
            paperCode: 'PT-B4' },
          { code: 'B-04', indexSection: 'B',
            title:  'Guía y Papel de Entrevista',
            type:   WorkingPaperType.INTERVIEW, wpKind: WpKind.SMART },
          { code: 'B-05', indexSection: 'B',
            title:  'Papel de Soporte / Evidencia',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.STANDARD },
          // ── D — Hallazgos y Comunicaciones ──────────────────────────────
          { code: 'D-00', indexSection: 'D',
            title:    'Resumen Consolidado de Hallazgos',
            type:     WorkingPaperType.FINDING, wpKind: WpKind.MASTER },
          { code: 'D-01', indexSection: 'D',
            title:    'Hallazgo de Auditoría',
            type:     WorkingPaperType.FINDING, wpKind: WpKind.SMART,
            paperCode: 'PT-D1' },
          // ── E — Cierre e Informe ─────────────────────────────────────────
          { code: 'E-01', indexSection: 'E',
            title:    'Conclusión del Proyecto',
            type:     WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.MASTER },
          { code: 'E-02', indexSection: 'E',
            title:    'Borrador del Informe de Auditoría',
            type:     WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.MASTER,
            paperCode: 'PT-MEMO' },
          { code: 'E-03', indexSection: 'E',
            title:  'Informe Final Aprobado con Firma Digital',
            type:   WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.STANDARD },
          { code: 'E-04', indexSection: 'E',
            title:  'Plan de Seguimiento de Recomendaciones',
            type:   WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.STANDARD },
        ],
      },

      // ═══════════════════════════════════════════════════════════════════════
      // 2. Auditoría Externa / Financiera (NIA/ISA) — ÍNDICE-03
      //    Secciones: A (Planificación) · B (EEFF/Sumarias) · C (Pruebas) · D (Cierre) · E (Informe)
      // ═══════════════════════════════════════════════════════════════════════
      {
        name: 'Auditoría Externa (NIA/ISA)',
        description:
          'Índice completo para Auditoría Externa de Estados Financieros según NIA/ISA + CVPCPA El Salvador. ' +
          'Incluye planificación, EEFF, sumarias, pruebas sustantivas, cierre e informe del auditor. ' +
          'Aplica a: Externa, Financiera.',
        auditTypes: [AuditType.EXTERNAL, AuditType.FINANCIAL],
        sections: [
          { ref: 'A', name: 'Planificación y Estrategia Global',      phaseType: 'PLANNING' },
          { ref: 'B', name: 'Estados Financieros y Cédulas Sumarias', phaseType: 'FIELDWORK' },
          { ref: 'C', name: 'Pruebas Sustantivas por Área',           phaseType: 'FIELDWORK' },
          { ref: 'D', name: 'Cierre de la Auditoría',                 phaseType: 'REPORTING' },
          { ref: 'E', name: 'Informe del Auditor Independiente',      phaseType: 'REPORTING' },
        ],
        papers: [
          // ── A — Planificación ───────────────────────────────────────────
          { code: 'A-01', indexSection: 'A',
            title:  'Carta de Encargo / Términos del Trabajo (NIA 210)',
            type:   WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.STANDARD },
          { code: 'A-02', indexSection: 'A',
            title:  'Evaluación de Independencia y Ética (NIA 220 / CIEPC)',
            type:   WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART },
          { code: 'A-03', indexSection: 'A',
            title:    'Entendimiento de la Entidad y su Entorno (NIA 315)',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART,
            paperCode: 'PT-A1' },
          { code: 'A-04', indexSection: 'A',
            title:    'Evaluación del Control Interno sobre RF (NIA 315.25)',
            type:     WorkingPaperType.CONTROL_EVALUATION, wpKind: WpKind.SMART,
            paperCode: 'PT-A3' },
          { code: 'A-05', indexSection: 'A',
            title:    'Evaluación y Respuesta a los Riesgos de Incorrección Material (NIA 315/330/240)',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART,
            paperCode: 'PT-A2' },
          { code: 'A-06', indexSection: 'A',
            title:    'Cálculo de Materialidad (NIA 320)',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART,
            paperCode: 'PT-A4' },
          { code: 'A-07', indexSection: 'A',
            title:    'Memorando de Planificación — Estrategia Global (NIA 300)',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.MASTER,
            paperCode: 'PT-MEMO' },
          { code: 'A-08', indexSection: 'A',
            title:    'Programa de Auditoría por Área / Aserción (NIA 330)',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.MASTER,
            paperCode: 'PT-PROG' },
          // ── B — Estados Financieros y Sumarias ──────────────────────────
          { code: 'B-00', indexSection: 'B',
            title:    'PT de Estados Financieros — Cédula Madre (EEFF)',
            type:     WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART,
            paperCode: 'PT-EEFF' },
          { code: 'B-01', indexSection: 'B',
            title:  'Cédula Sumaria de Activos',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.MASTER },
          { code: 'B-02', indexSection: 'B',
            title:  'Cédula Sumaria de Pasivos',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.MASTER },
          { code: 'B-03', indexSection: 'B',
            title:  'Cédula Sumaria de Patrimonio',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.MASTER },
          { code: 'B-04', indexSection: 'B',
            title:  'Cédula Sumaria de Ingresos y Costos',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.MASTER },
          { code: 'B-05', indexSection: 'B',
            title:  'Cédula de Ajustes y Reclasificaciones',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART },
          { code: 'B-06', indexSection: 'B',
            title:    'Cédula de Diferencias y Ajustes vs. Materialidad',
            type:     WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.MASTER,
            paperCode: 'PT-DIFS' },
          // ── C — Pruebas Sustantivas por Área ────────────────────────────
          { code: 'C-01', indexSection: 'C',
            title:  'Caja y Bancos — Conciliaciones Bancarias (NIA 505)',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART },
          { code: 'C-02', indexSection: 'C',
            title:  'Cuentas por Cobrar — Circularización (NIA 505)',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART,
            paperCode: 'PT-CIRC' },
          { code: 'C-03', indexSection: 'C',
            title:  'Inventarios — Observación de Conteo Físico (NIA 501)',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART },
          { code: 'C-04', indexSection: 'C',
            title:  'Activos Fijos / Propiedad, Planta y Equipo (NIA 500)',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART },
          { code: 'C-07', indexSection: 'C',
            title:  'Cuentas por Pagar y Pasivos Corrientes (NIA 505)',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART },
          { code: 'C-11', indexSection: 'C',
            title:  'Ingresos — Reconocimiento y Corte (NIA 240 / Sec. 23 NIIF-PYMES)',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART },
          { code: 'C-13', indexSection: 'C',
            title:  'Partes Relacionadas (NIA 550)',
            type:   WorkingPaperType.NORMATIVE_ANALYSIS, wpKind: WpKind.SMART },
          { code: 'C-14', indexSection: 'C',
            title:  'Estimaciones Contables — Provisiones y Valor Razonable (NIA 540)',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART },
          { code: 'C-15', indexSection: 'C',
            title:  'Continuidad Operativa (NIA 570)',
            type:   WorkingPaperType.NORMATIVE_ANALYSIS, wpKind: WpKind.SMART },
          // ── D — Cierre ───────────────────────────────────────────────────
          { code: 'D-01', indexSection: 'D',
            title:  'Carta de Representación de la Administración (NIA 580)',
            type:   WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.SMART },
          { code: 'D-02', indexSection: 'D',
            title:    'Cédula Final de Diferencias y Ajustes (NIA 450)',
            type:     WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.MASTER,
            paperCode: 'PT-DIFS' },
          { code: 'D-03', indexSection: 'D',
            title:  'Eventos Posteriores al Cierre (NIA 560)',
            type:   WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.SMART },
          { code: 'D-04', indexSection: 'D',
            title:  'Carta de Debilidades de Control Interno (NIA 265)',
            type:   WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.MASTER },
          // ── E — Informe ──────────────────────────────────────────────────
          { code: 'E-01', indexSection: 'E',
            title:    'Borrador del Informe del Auditor Independiente (NIA 700-720)',
            type:     WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.MASTER,
            paperCode: 'PT-MEMO' },
          { code: 'E-02', indexSection: 'E',
            title:  'Informe Final con Firma Digital del Socio / CP',
            type:   WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.STANDARD },
        ],
      },

      // ═══════════════════════════════════════════════════════════════════════
      // 3. Auditoría Interna Gubernamental (NAIG) — ACA + ACP
      //    Secciones: ACA · PL · EJ · COM · INF · SEG
      // ═══════════════════════════════════════════════════════════════════════
      {
        name: 'Auditoría Interna Gubernamental (NAIG)',
        description:
          'Índice completo ACA+ACP para Auditoría Interna Gubernamental según NAIG Decreto 7/2016, ' +
          'Manual Corte de Cuentas SV, NTCI, LACAP y SAFI. ' +
          'Aplica a: Interna Gubernamental.',
        auditTypes: [AuditType.INTERNAL_GOVERNMENTAL],
        sections: [
          { ref: 'ACA', name: 'Archivo Corriente de Control Administrativo', phaseType: 'PLANNING' },
          { ref: 'PL',  name: 'Planificación',                               phaseType: 'PLANNING' },
          { ref: 'EJ',  name: 'Ejecución',                                   phaseType: 'FIELDWORK' },
          { ref: 'COM', name: 'Hallazgos y Comunicaciones',                  phaseType: 'REPORTING' },
          { ref: 'INF', name: 'Informe',                                     phaseType: 'REPORTING' },
          { ref: 'SEG', name: 'Seguimiento de Recomendaciones',              phaseType: 'FOLLOWUP' },
        ],
        papers: [
          // ── ACA — Archivo Corriente de Control Administrativo ────────────
          { code: 'ACA-01', indexSection: 'ACA',
            title:  'Orden de Trabajo con sus Modificaciones',
            type:   WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.STANDARD },
          { code: 'ACA-02', indexSection: 'ACA',
            title:  'Correspondencia Remitida a la Entidad y Terceros',
            type:   WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.STANDARD },
          { code: 'ACA-03', indexSection: 'ACA',
            title:  'Correspondencia Recibida de la Entidad y Terceros',
            type:   WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.STANDARD },
          { code: 'ACA-04', indexSection: 'ACA',
            title:  'Hoja de Costos de la Auditoría',
            type:   WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.STANDARD },
          { code: 'ACA-06', indexSection: 'ACA',
            title:  'Bitácora de Supervisión',
            type:   WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART },
          { code: 'ACA-07', indexSection: 'ACA',
            title:  'Hoja de Instrucciones del Jefe de Equipo y Supervisor',
            type:   WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART },
          // ── PL — Planificación ──────────────────────────────────────────
          { code: 'PL-01', indexSection: 'PL',
            title:    'Análisis General de la Entidad (NAIG Art. 42-45)',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART,
            paperCode: 'PT-A1' },
          { code: 'PL-02', indexSection: 'PL',
            title:    'Evaluación del SCI Institucional — NTCI/COSO (NAIG Art. 46-52)',
            type:     WorkingPaperType.CONTROL_EVALUATION, wpKind: WpKind.SMART,
            paperCode: 'PT-COSO' },
          { code: 'PL-03', indexSection: 'PL',
            title:    'Evaluación de Riesgos por Componente/Área (NAIG Art. 53-58)',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART,
            paperCode: 'PT-A2' },
          { code: 'PL-04', indexSection: 'PL',
            title:  'Revisión de Recomendaciones de Auditorías Anteriores (NAIG Art. 61)',
            type:   WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART },
          { code: 'PL-06', indexSection: 'PL',
            title:    'Materialidad y Criterios de Selección (Base: Presupuesto Asignado)',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART,
            paperCode: 'PT-A4' },
          { code: 'PL-08', indexSection: 'PL',
            title:    'Memorando de Planificación Gubernamental (NAIG Art. 58-60)',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.MASTER,
            paperCode: 'PT-MEMO' },
          { code: 'PL-09', indexSection: 'PL',
            title:    'Programa de Auditoría por Componente',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.MASTER,
            paperCode: 'PT-PROG' },
          // ── EJ — Ejecución ──────────────────────────────────────────────
          { code: 'EJ-F01', indexSection: 'EJ',
            title:  'Cédula Sumaria de Ejecución Presupuestaria (NAIG Art. 75-80 / SAFI)',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.MASTER },
          { code: 'EJ-LC01', indexSection: 'EJ',
            title:  'Cédula de Revisión de Contrataciones LACAP (NAIG Art. 82-88)',
            type:   WorkingPaperType.NORMATIVE_ANALYSIS, wpKind: WpKind.SMART },
          { code: 'EJ-NM01', indexSection: 'EJ',
            title:  'Cédula de Análisis de Nómina Institucional (NAIG Art. 82 / Ley SC)',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART },
          { code: 'EJ-OP01', indexSection: 'EJ',
            title:  'Cédula de Indicadores de Gestión — 7E (NAG / NAIG Art. 90-98)',
            type:   WorkingPaperType.DATA_ANALYSIS, wpKind: WpKind.SMART },
          // ── COM — Hallazgos ─────────────────────────────────────────────
          { code: 'COM-RH', indexSection: 'COM',
            title:  'Resumen Consolidado de Hallazgos',
            type:   WorkingPaperType.FINDING, wpKind: WpKind.MASTER },
          { code: 'COM-H01', indexSection: 'COM',
            title:    'Hallazgo de Auditoría Gubernamental — 5 Elementos (NAIG Art. 130-145)',
            type:     WorkingPaperType.FINDING, wpKind: WpKind.SMART,
            paperCode: 'PT-GOV-HAL' },
          // ── INF — Informe ───────────────────────────────────────────────
          { code: 'INF-01', indexSection: 'INF',
            title:    'Informe de Auditoría Gubernamental (NAIG Art. 150-160 / NAG)',
            type:     WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.MASTER,
            paperCode: 'PT-MEMO' },
          { code: 'INF-02', indexSection: 'INF',
            title:  'Informe Final — Papel Membretado con Firma del Jefe UAI',
            type:   WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.STANDARD },
          // ── SEG — Seguimiento ───────────────────────────────────────────
          { code: 'SEG-01', indexSection: 'SEG',
            title:  'Plan de Implementación de Recomendaciones (NAIG Art. 61-62)',
            type:   WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.STANDARD },
        ],
      },

      // ═══════════════════════════════════════════════════════════════════════
      // 4. Auditoría Forense / Examen Especial (ACFE + NIA 240)
      //    Secciones: A (Planificación) · B (Investigación) · D (Hallazgos) · E (Informe)
      // ═══════════════════════════════════════════════════════════════════════
      {
        name: 'Auditoría Forense (ACFE + NIA 240)',
        description:
          'Índice para Examen Especial / Auditoría Forense según ACFE y NIA 240. ' +
          'Incluye cadena de custodia, red flags, CAATs forenses e informe forense. ' +
          'Aplica a: Forense.',
        auditTypes: [AuditType.FORENSIC],
        sections: [
          { ref: 'A', name: 'Planificación e Investigación Inicial', phaseType: 'PLANNING' },
          { ref: 'B', name: 'Investigación y Evidencia Forense',     phaseType: 'FIELDWORK' },
          { ref: 'D', name: 'Hallazgos Forenses',                    phaseType: 'REPORTING' },
          { ref: 'E', name: 'Informe Forense',                       phaseType: 'REPORTING' },
        ],
        papers: [
          // ── A — Planificación ───────────────────────────────────────────
          { code: 'A-01', indexSection: 'A',
            title:  'Instrucción / Orden de Investigación Especial',
            type:   WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.STANDARD },
          { code: 'A-02', indexSection: 'A',
            title:    'Entendimiento del Negocio y Contexto Forense',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART,
            paperCode: 'PT-A1' },
          { code: 'A-03', indexSection: 'A',
            title:    'Evaluación de Riesgo de Fraude — Triángulo ACFE (NIA 240)',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART,
            paperCode: 'PT-A2' },
          { code: 'A-04', indexSection: 'A',
            title:  'Cadena de Custodia y Registro de Evidencia Digital',
            type:   WorkingPaperType.CONTROL_EVALUATION, wpKind: WpKind.STANDARD },
          { code: 'A-05', indexSection: 'A',
            title:    'Programa de Investigación Especial',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.MASTER,
            paperCode: 'PT-PROG' },
          // ── B — Investigación ───────────────────────────────────────────
          { code: 'B-01', indexSection: 'B',
            title:  'Análisis de Indicadores de Fraude / Red Flags ACFE',
            type:   WorkingPaperType.DATA_ANALYSIS, wpKind: WpKind.SMART },
          { code: 'B-02', indexSection: 'B',
            title:  'Prueba de Transacciones Sospechosas — CAATs Forenses',
            type:   WorkingPaperType.DATA_ANALYSIS, wpKind: WpKind.SMART },
          { code: 'B-03', indexSection: 'B',
            title:  'Guía y Papel de Entrevista Forense',
            type:   WorkingPaperType.INTERVIEW, wpKind: WpKind.SMART },
          { code: 'B-04', indexSection: 'B',
            title:  'Análisis de Datos Forenses — Reconstitución de Hechos',
            type:   WorkingPaperType.DATA_ANALYSIS, wpKind: WpKind.SMART },
          // ── D — Hallazgos ───────────────────────────────────────────────
          { code: 'D-01', indexSection: 'D',
            title:  'Hallazgo Forense — Condición, Causa, Efecto y Evidencia',
            type:   WorkingPaperType.FINDING, wpKind: WpKind.SMART },
          // ── E — Informe ──────────────────────────────────────────────────
          { code: 'E-01', indexSection: 'E',
            title:    'Informe Forense / Examen Especial',
            type:     WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.MASTER,
            paperCode: 'PT-MEMO' },
          { code: 'E-02', indexSection: 'E',
            title:  'Informe Final con Cadena de Custodia',
            type:   WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.STANDARD },
        ],
      },

      // ═══════════════════════════════════════════════════════════════════════
      // 5. Auditoría IT Security (ISO 27001) — sin cambios (ya completo)
      // ═══════════════════════════════════════════════════════════════════════
      {
        name: 'Auditoría IT Security (ISO 27001)',
        description:
          'Índice para Auditoría de Seguridad de la Información según ISO 27001:2022, ' +
          'NRP-23/NRP-32 (BCR/SSF El Salvador) y Ley de Ciberseguridad D.L. 143/2024. ' +
          'Aplica a: IT Security.',
        auditTypes: [AuditType.IT_SECURITY],
        sections: [
          { ref: 'A', name: 'Planificación del SGSI',                  phaseType: 'PLANNING' },
          { ref: 'B', name: 'Evaluación Técnica de Controles',         phaseType: 'FIELDWORK' },
          { ref: 'C', name: 'Cumplimiento Normativo',                  phaseType: 'FIELDWORK' },
          { ref: 'D', name: 'Hallazgos e Informe de Seguridad',        phaseType: 'REPORTING' },
        ],
        papers: [
          // ── A — Planificación ───────────────────────────────────────────
          { code: 'A-01', indexSection: 'A',
            title:  'Alcance del SGSI y Términos del Trabajo (ISO 27001 cl. 4-6)',
            type:   WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.STANDARD },
          { code: 'A-02', indexSection: 'A',
            title:    'Entendimiento del Entorno TI y Clasificación de Activos',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART,
            paperCode: 'PT-A1' },
          { code: 'A-03', indexSection: 'A',
            title:    'Evaluación de Riesgos de Seguridad (ISO 27001 cl. 6.1 / NRP-23)',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART,
            paperCode: 'PT-SEC-RISK' },
          { code: 'A-04', indexSection: 'A',
            title:    'Evaluación de Controles — Tecnológicos, Organizacionales y Personas',
            type:     WorkingPaperType.CONTROL_EVALUATION, wpKind: WpKind.SMART,
            paperCode: 'PT-A3' },
          { code: 'A-05', indexSection: 'A',
            title:    'Memorando de Planificación — Auditoría SI',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.MASTER,
            paperCode: 'PT-MEMO' },
          { code: 'A-06', indexSection: 'A',
            title:    'Programa de Auditoría de Seguridad de la Información',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.MASTER,
            paperCode: 'PT-PROG' },
          // ── B — Ejecución ───────────────────────────────────────────────
          { code: 'B-01', indexSection: 'B',
            title:  'Revisión de Gestión de Accesos e Identidades — IAM (ISO A.8)',
            type:   WorkingPaperType.CONTROL_EVALUATION, wpKind: WpKind.SMART },
          { code: 'B-02', indexSection: 'B',
            title:  'Revisión de Gestión de Vulnerabilidades y Parches',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.STANDARD },
          { code: 'B-03', indexSection: 'B',
            title:  'Evaluación de Controles Criptográficos y PKI (ISO A.8.24)',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.STANDARD },
          { code: 'B-04', indexSection: 'B',
            title:  'Revisión de Gestión de Incidentes de Seguridad (ISO A.8.16)',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.STANDARD },
          { code: 'B-05', indexSection: 'B',
            title:  'Evidencia de Pruebas de Penetración y Análisis de Vulnerabilidades',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.STANDARD },
          // ── C — Cumplimiento Normativo ───────────────────────────────────
          { code: 'C-01', indexSection: 'C',
            title:    'Checklist de Cumplimiento NRP-23 / NRP-32 (BCR/SSF El Salvador)',
            type:     WorkingPaperType.NORMATIVE_ANALYSIS, wpKind: WpKind.SMART,
            paperCode: 'PT-SEC-RISK' },
          { code: 'C-02', indexSection: 'C',
            title:  'Evaluación Ley de Ciberseguridad D.L. 143/2024 — ACE',
            type:   WorkingPaperType.NORMATIVE_ANALYSIS, wpKind: WpKind.STANDARD },
          // ── D — Hallazgos / Informe ──────────────────────────────────────
          { code: 'D-01', indexSection: 'D',
            title:  'Hallazgo de Seguridad de la Información',
            type:   WorkingPaperType.FINDING, wpKind: WpKind.SMART },
          { code: 'D-02', indexSection: 'D',
            title:    'Informe de Auditoría de Seguridad de la Información con Plan de Remediación',
            type:     WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.MASTER,
            paperCode: 'PT-MEMO' },
        ],
      },

      // ═══════════════════════════════════════════════════════════════════════
      // 6. Auditoría AML/Prevención LD (LCDA/NRP-36) — sin cambios (ya completo)
      // ═══════════════════════════════════════════════════════════════════════
      {
        name: 'Auditoría AML/Prevención LD (LCDA/NRP-36)',
        description:
          'Índice completo para Auditoría de Prevención de Lavado de Dinero y Activos ' +
          'según LCDA, NRP-36 y GAFI. Incluye DDC/KYC, PEPs, monitoreo, ROS y dictamen. ' +
          'Aplica a: AML.',
        auditTypes: [AuditType.AML],
        sections: [
          { ref: 'A', name: 'Planificación ALD/PLD',                    phaseType: 'PLANNING' },
          { ref: 'B', name: 'Ejecución — Pruebas de Cumplimiento',      phaseType: 'FIELDWORK' },
          { ref: 'C', name: 'Cumplimiento Normativo NRP-36',            phaseType: 'FIELDWORK' },
          { ref: 'D', name: 'Informe ALD y Plan de Subsanación',        phaseType: 'REPORTING' },
        ],
        papers: [
          // ── A — Planificación ───────────────────────────────────────────
          { code: 'A-01', indexSection: 'A',
            title:  'Designación y Términos del Trabajo — Auditoría ALD/PLD',
            type:   WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.STANDARD },
          { code: 'A-02', indexSection: 'A',
            title:    'Entendimiento del Sujeto Obligado — Marco Legal y Perfil de Negocio',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART,
            paperCode: 'PT-A1' },
          { code: 'A-03', indexSection: 'A',
            title:    'Evaluación de Riesgo LA/FT — Metodología NRP-36 / GAFI',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART,
            paperCode: 'PT-AML-RISK' },
          { code: 'A-04', indexSection: 'A',
            title:    'Evaluación de Controles PLD — 3 Líneas de Defensa',
            type:     WorkingPaperType.CONTROL_EVALUATION, wpKind: WpKind.SMART,
            paperCode: 'PT-A3' },
          { code: 'A-05', indexSection: 'A',
            title:    'Memorando de Planificación ALD/PLD',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.MASTER,
            paperCode: 'PT-MEMO' },
          { code: 'A-06', indexSection: 'A',
            title:    'Programa de Auditoría ALD — GAFI / NRP-36',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.MASTER,
            paperCode: 'PT-PROG' },
          // ── B — Ejecución ───────────────────────────────────────────────
          { code: 'B-01', indexSection: 'B',
            title:  'Prueba de DDC/KYC — Debida Diligencia de Clientes (NRP-36 Art. 15)',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.STANDARD },
          { code: 'B-02', indexSection: 'B',
            title:  'Revisión de PEPs y Listas de Sanciones (OFAC / ONU / UE)',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.STANDARD },
          { code: 'B-03', indexSection: 'B',
            title:  'Revisión de Transacciones Inusuales y Sistema de Monitoreo',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.STANDARD },
          { code: 'B-04', indexSection: 'B',
            title:  'Revisión de ROS — Reportes de Operaciones Sospechosas (UIF / SIRAF)',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.STANDARD },
          { code: 'B-05', indexSection: 'B',
            title:  'Evaluación del Oficial de Cumplimiento (Ley LCDA Art. 14)',
            type:   WorkingPaperType.CONTROL_EVALUATION, wpKind: WpKind.STANDARD },
          { code: 'B-06', indexSection: 'B',
            title:  'Revisión de Programa de Capacitación y Cultura ALD',
            type:   WorkingPaperType.CONTROL_EVALUATION, wpKind: WpKind.STANDARD },
          // ── C — Cumplimiento Normativo ───────────────────────────────────
          { code: 'C-01', indexSection: 'C',
            title:    'Checklist NRP-36 / Instructivo UIF V3 — Cumplimiento',
            type:     WorkingPaperType.NORMATIVE_ANALYSIS, wpKind: WpKind.SMART,
            paperCode: 'PT-AML-RISK' },
          // ── D — Informe ──────────────────────────────────────────────────
          { code: 'D-01', indexSection: 'D',
            title:    'Informe ALD — Formato CVPCPA Guía V3 (Res. 129/2022)',
            type:     WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.MASTER,
            paperCode: 'PT-MEMO' },
          { code: 'D-02', indexSection: 'D',
            title:  'Resumen de Incumplimientos y Plan de Subsanación',
            type:   WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.MASTER },
        ],
      },
    ];
  }
}
