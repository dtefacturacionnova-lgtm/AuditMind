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

// ─── PaperLinkDef — directed edge between papers in the knowledge graph ─────

interface PaperLinkDef {
  sourceCode:  string;   // code o paperCode del papel fuente
  targetCode:  string;
  sourceField: string;   // "S3" o "S3.field"
  targetField: string;
  mappingType?: 'DIRECT' | 'AGGREGATED' | 'AI_GENERATED';
  description?: string;
}

// ─── System template seed data ────────────────────────────────────────────────

interface SystemTemplateSeed {
  name: string;
  description: string;
  auditTypes: AuditType[];
  sections: SectionDef[];
  papers: PaperDef[];
  links?: PaperLinkDef[];
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
        links:          dto.links       as any ?? null,
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
        ...(dto.links       !== undefined && { links:       dto.links      as any }),
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
          links:       (seed.links ?? null) as any,
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
            links:       (seed.links ?? null) as any,
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
            links:          (seed.links ?? null) as any,
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
  //           AuditMind_UAIGubernamental_v7.0, AuditMind_AuditFinancieraExternaSV_v8.0,
  //           AuditMind_AuditoriaForenseSV_v9.0, AuditMind_AuditSeguridad_TI_v9.0,
  //           AuditMind_AuditAML_PLD_v9.0, AuditMind_AuditFiscalSV_v6.0

  private getSystemTemplates(): SystemTemplateSeed[] {
    return [

      // ═══════════════════════════════════════════════════════════════════════
      // 1. Auditoría Interna Privada (NOGAI/IIA 2025) — ÍNDICE-01
      //    Secciones: APE · A · B · D · E
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
          { ref: 'APE', name: 'Archivo Permanente', phaseType: 'PLANNING',
            children: [
              { ref: 'APE-01', name: 'Información Legal y Estatutos' },
              { ref: 'APE-02', name: 'Estructura Organizacional' },
              { ref: 'APE-03', name: 'Evaluaciones de Riesgo Históricas' },
              { ref: 'APE-04', name: 'Informes de Auditorías Anteriores' },
              { ref: 'APE-05', name: 'Contratos y Acuerdos Clave' },
              { ref: 'APE-06', name: 'Políticas y Manuales de Control Interno' },
            ],
          },
          { ref: 'A', name: 'Planificación y Entendimiento del Negocio', phaseType: 'PLANNING' },
          { ref: 'B', name: 'Ejecución y Pruebas de Campo',              phaseType: 'FIELDWORK' },
          { ref: 'D', name: 'Hallazgos y Comunicaciones',                phaseType: 'REPORTING' },
          { ref: 'E', name: 'Cierre e Informe de Auditoría',             phaseType: 'REPORTING' },
        ],
        papers: [
          // ── APE — Archivo Permanente ────────────────────────────────────
          { code: 'APE-01', indexSection: 'APE-01',
            title:  'Información Legal, Estatutos y Contratos Institucionales',
            type:   WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.STANDARD },
          { code: 'APE-02', indexSection: 'APE-02',
            title:  'Organigrama, Manuales de Organización y Funciones',
            type:   WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.STANDARD },
          { code: 'APE-03', indexSection: 'APE-03',
            title:    'Evaluaciones de Riesgo y COSO Institucional Histórico',
            type:     WorkingPaperType.CONTROL_EVALUATION, wpKind: WpKind.STANDARD },
          { code: 'APE-04', indexSection: 'APE-04',
            title:  'Informes y Hallazgos de Auditorías Anteriores',
            type:   WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.STANDARD },
          { code: 'APE-05', indexSection: 'APE-05',
            title:  'Contratos, Acuerdos de Nivel de Servicio y Compromisos Clave',
            type:   WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.STANDARD },
          { code: 'APE-06', indexSection: 'APE-06',
            title:  'Políticas, Procedimientos y Manuales de Control Interno Vigentes',
            type:   WorkingPaperType.CONTROL_EVALUATION, wpKind: WpKind.STANDARD },
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
        // ─── Grafo de conocimiento NOGAI/IIA ─────────────────────────────────
        links: [
          // Entendimiento del negocio alimenta riesgos, materialidad y memo
          { sourceCode: 'A-02', targetCode: 'A-03', sourceField: 'S1', targetField: 'S1', mappingType: 'DIRECT',       description: 'Áreas/procesos al evaluar RI' },
          { sourceCode: 'A-02', targetCode: 'A-08', sourceField: 'S1', targetField: 'S2', mappingType: 'AI_GENERATED', description: 'Entendimiento → Memorando' },
          // Riesgo inherente alimenta materialidad, MRCI, memo y programa
          { sourceCode: 'A-03', targetCode: 'A-07', sourceField: 'S5', targetField: 'S1', mappingType: 'DIRECT',       description: 'Riesgos identificados → Matriz MRCI' },
          { sourceCode: 'A-03', targetCode: 'A-08', sourceField: 'S8', targetField: 'S3', mappingType: 'AI_GENERATED', description: 'RI global → Sección RI del Memo' },
          { sourceCode: 'A-03', targetCode: 'A-09', sourceField: 'S5', targetField: 'S1', mappingType: 'AGGREGATED',   description: 'Riesgos → Priorización del programa' },
          // Controles alimentan MRCI, memo y programa
          { sourceCode: 'A-04', targetCode: 'A-07', sourceField: 'S3', targetField: 'S2', mappingType: 'DIRECT',       description: 'Controles evaluados → MRCI' },
          { sourceCode: 'A-04', targetCode: 'A-08', sourceField: 'S5', targetField: 'S5', mappingType: 'AI_GENERATED', description: 'RC → Enfoque del Memo' },
          { sourceCode: 'A-04', targetCode: 'A-09', sourceField: 'S5', targetField: 'S2', mappingType: 'AGGREGATED',   description: 'RC → Tipo de pruebas en Programa' },
          // Materialidad alimenta memo y programa
          { sourceCode: 'A-05', targetCode: 'A-08', sourceField: 'S3', targetField: 'S4', mappingType: 'DIRECT',       description: 'Materialidad → Sección del Memo' },
          { sourceCode: 'A-05', targetCode: 'A-09', sourceField: 'S4', targetField: 'S3', mappingType: 'AGGREGATED',   description: 'Materialidad → Tamaños muestra Programa' },
          // COSO alimenta el A-04 (evaluación de controles)
          { sourceCode: 'A-06', targetCode: 'A-04', sourceField: 'S7', targetField: 'S2', mappingType: 'DIRECT',       description: 'COSO global → Resultado por área' },
          { sourceCode: 'A-06', targetCode: 'A-08', sourceField: 'S7', targetField: 'S6', mappingType: 'AI_GENERATED', description: 'COSO → Conclusión SCI del Memo' },
          // MRCI alimenta programa y hallazgos
          { sourceCode: 'A-07', targetCode: 'A-09', sourceField: 'S6', targetField: 'S1', mappingType: 'DIRECT',       description: 'MRCI → Procedimientos del Programa' },
          { sourceCode: 'A-07', targetCode: 'D-00', sourceField: 'S5', targetField: 'S1', mappingType: 'AGGREGATED',   description: 'MRCI → Hallazgos consolidados' },
          // Programa alimenta papeles de ejecución y memo
          { sourceCode: 'A-09', targetCode: 'B-01', sourceField: 'S1', targetField: 'S1', mappingType: 'DIRECT',       description: 'Procedimientos → Cuestionario' },
          { sourceCode: 'A-09', targetCode: 'B-02', sourceField: 'S1', targetField: 'S1', mappingType: 'DIRECT',       description: 'Procedimientos → Pruebas sustantivas' },
          { sourceCode: 'A-09', targetCode: 'B-03', sourceField: 'S1', targetField: 'S1', mappingType: 'DIRECT',       description: 'Procedimientos → CAATs' },
          // Hallazgos consolidados → informe
          { sourceCode: 'D-00', targetCode: 'E-02', sourceField: 'S1', targetField: 'S4', mappingType: 'AGGREGATED',   description: 'Hallazgos → Sección Hallazgos del Informe' },
          { sourceCode: 'D-00', targetCode: 'E-01', sourceField: 'S1', targetField: 'S1', mappingType: 'AI_GENERATED', description: 'Hallazgos → Conclusión del proyecto' },
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
          { ref: 'B', name: 'Estados Financieros y Cédulas Sumarias', phaseType: 'FIELDWORK',
            children: [
              { ref: 'B-EEFF', name: 'Cédula Madre y Ajustes' },
              { ref: 'B-ACT',  name: 'Activos' },
              { ref: 'B-PAS',  name: 'Pasivos' },
              { ref: 'B-PAT',  name: 'Patrimonio' },
              { ref: 'B-ING',  name: 'Ingresos y Costos' },
            ],
          },
          { ref: 'C', name: 'Pruebas Sustantivas por Área',           phaseType: 'FIELDWORK',
            children: [
              { ref: 'C-01', name: 'Caja y Bancos' },
              { ref: 'C-02', name: 'Cuentas por Cobrar' },
              { ref: 'C-03', name: 'Inventarios' },
              { ref: 'C-04', name: 'Activo Fijo / PP&E' },
              { ref: 'C-05', name: 'Inversiones y Valores' },
              { ref: 'C-06', name: 'Intangibles y Diferidos' },
              { ref: 'C-07', name: 'Cuentas por Pagar' },
              { ref: 'C-08', name: 'Obligaciones Financieras' },
              { ref: 'C-09', name: 'Otros Pasivos' },
              { ref: 'C-10', name: 'Capital y Reservas' },
              { ref: 'C-11', name: 'Ingresos' },
              { ref: 'C-12', name: 'Costos y Gastos' },
              { ref: 'C-13', name: 'Partes Relacionadas' },
              { ref: 'C-14', name: 'Estimaciones y Provisiones' },
              { ref: 'C-15', name: 'Continuidad Operativa' },
            ],
          },
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
          { code: 'B-00', indexSection: 'B-EEFF',
            title:    'PT de Estados Financieros — Cédula Madre (EEFF)',
            type:     WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART,
            paperCode: 'PT-EEFF' },
          { code: 'B-05', indexSection: 'B-EEFF',
            title:  'Cédula de Ajustes y Reclasificaciones',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART },
          { code: 'B-06', indexSection: 'B-EEFF',
            title:    'Cédula de Diferencias y Ajustes vs. Materialidad',
            type:     WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.MASTER,
            paperCode: 'PT-DIFS' },
          { code: 'B-01', indexSection: 'B-ACT',
            title:  'Cédula Sumaria de Activos',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.MASTER },
          { code: 'B-02', indexSection: 'B-PAS',
            title:  'Cédula Sumaria de Pasivos',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.MASTER },
          { code: 'B-03', indexSection: 'B-PAT',
            title:  'Cédula Sumaria de Patrimonio',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.MASTER },
          { code: 'B-04', indexSection: 'B-ING',
            title:  'Cédula Sumaria de Ingresos y Costos',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.MASTER },
          // ── C — Pruebas Sustantivas por Área ────────────────────────────
          { code: 'C-01', indexSection: 'C-01',
            title:  'Caja y Bancos — Conciliaciones Bancarias (NIA 505)',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART },
          { code: 'C-02', indexSection: 'C-02',
            title:  'Cuentas por Cobrar — Circularización (NIA 505)',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART,
            paperCode: 'PT-CIRC' },
          { code: 'C-03', indexSection: 'C-03',
            title:  'Inventarios — Observación de Conteo Físico (NIA 501)',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART },
          { code: 'C-04', indexSection: 'C-04',
            title:  'Activos Fijos / Propiedad, Planta y Equipo (NIA 500)',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART },
          { code: 'C-05', indexSection: 'C-05',
            title:  'Inversiones y Valores — Confirmación y Valuación (NIA 501)',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART },
          { code: 'C-06', indexSection: 'C-06',
            title:  'Activos Intangibles y Gastos Diferidos (NIIF 38)',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART },
          { code: 'C-07', indexSection: 'C-07',
            title:  'Cuentas por Pagar y Pasivos Corrientes (NIA 505)',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART },
          { code: 'C-08', indexSection: 'C-08',
            title:  'Obligaciones Bancarias y Financieras — Conciliación (NIA 505)',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART },
          { code: 'C-09', indexSection: 'C-09',
            title:  'Pasivos de Largo Plazo — Verificación de Términos y Garantías',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART },
          { code: 'C-10', indexSection: 'C-10',
            title:  'Capital Contable, Reservas y Dividendos (NIA 500)',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART },
          { code: 'C-11', indexSection: 'C-11',
            title:  'Ingresos — Reconocimiento y Corte (NIA 240 / Sec. 23 NIIF-PYMES)',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART },
          { code: 'C-12', indexSection: 'C-12',
            title:  'Costos de Ventas y Gastos de Operación — Análisis de Variaciones',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART },
          { code: 'C-13', indexSection: 'C-13',
            title:  'Partes Relacionadas (NIA 550)',
            type:   WorkingPaperType.NORMATIVE_ANALYSIS, wpKind: WpKind.SMART },
          { code: 'C-14', indexSection: 'C-14',
            title:  'Estimaciones Contables — Provisiones y Valor Razonable (NIA 540)',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART },
          { code: 'C-15', indexSection: 'C-15',
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
        // ─── Grafo NIA/ISA ───────────────────────────────────────────────────
        links: [
          // Entendimiento → riesgos, memo
          { sourceCode: 'A-03', targetCode: 'A-05', sourceField: 'S1', targetField: 'S1', mappingType: 'DIRECT',       description: 'Entidad → Aserciones de riesgo' },
          { sourceCode: 'A-03', targetCode: 'A-07', sourceField: 'S1', targetField: 'S2', mappingType: 'AI_GENERATED', description: 'Entendimiento → Memo' },
          // Control interno → riesgos
          { sourceCode: 'A-04', targetCode: 'A-05', sourceField: 'S3', targetField: 'S2', mappingType: 'DIRECT',       description: 'CI → RIM' },
          { sourceCode: 'A-04', targetCode: 'A-07', sourceField: 'S3', targetField: 'S5', mappingType: 'AI_GENERATED', description: 'CI → Enfoque del Memo' },
          // Riesgos → memo, programa
          { sourceCode: 'A-05', targetCode: 'A-07', sourceField: 'S4', targetField: 'S3', mappingType: 'AI_GENERATED', description: 'Riesgos → Sección RI del Memo' },
          { sourceCode: 'A-05', targetCode: 'A-08', sourceField: 'S4', targetField: 'S1', mappingType: 'AGGREGATED',   description: 'Riesgos → Procedimientos' },
          // Materialidad → memo, programa, sumarias, cierre
          { sourceCode: 'A-06', targetCode: 'A-07', sourceField: 'S3', targetField: 'S4', mappingType: 'DIRECT',       description: 'Materialidad → Memo' },
          { sourceCode: 'A-06', targetCode: 'A-08', sourceField: 'S4', targetField: 'S2', mappingType: 'AGGREGATED',   description: 'ME → Tamaños muestra' },
          { sourceCode: 'A-06', targetCode: 'D-02', sourceField: 'S3', targetField: 'S2', mappingType: 'DIRECT',       description: 'MG → Cédula final de diferencias' },
          // EEFF (B-00) alimenta sumarias y diferencias
          { sourceCode: 'B-00', targetCode: 'B-01', sourceField: 'S1', targetField: 'S1', mappingType: 'AGGREGATED',   description: 'EEFF → Activos sumaria' },
          { sourceCode: 'B-00', targetCode: 'B-02', sourceField: 'S1', targetField: 'S1', mappingType: 'AGGREGATED',   description: 'EEFF → Pasivos sumaria' },
          { sourceCode: 'B-00', targetCode: 'B-03', sourceField: 'S1', targetField: 'S1', mappingType: 'AGGREGATED',   description: 'EEFF → Patrimonio sumaria' },
          { sourceCode: 'B-00', targetCode: 'B-04', sourceField: 'S1', targetField: 'S1', mappingType: 'AGGREGATED',   description: 'EEFF → Ingresos/Costos sumaria' },
          // Programa → pruebas C-*
          { sourceCode: 'A-08', targetCode: 'C-01', sourceField: 'S1', targetField: 'S1', mappingType: 'DIRECT',       description: 'Programa → Caja/Bancos' },
          { sourceCode: 'A-08', targetCode: 'C-02', sourceField: 'S1', targetField: 'S1', mappingType: 'DIRECT',       description: 'Programa → CxC' },
          { sourceCode: 'A-08', targetCode: 'C-03', sourceField: 'S1', targetField: 'S1', mappingType: 'DIRECT',       description: 'Programa → Inventarios' },
          // Ajustes B-05 → cédula final
          { sourceCode: 'B-05', targetCode: 'D-02', sourceField: 'S1', targetField: 'S3', mappingType: 'AGGREGATED',   description: 'Ajustes → Cédula final NIA 450' },
          // Carta debilidades alimenta informe
          { sourceCode: 'D-04', targetCode: 'E-01', sourceField: 'S1', targetField: 'S2', mappingType: 'AI_GENERATED', description: 'Debilidades → KAM del Informe' },
          { sourceCode: 'D-02', targetCode: 'E-01', sourceField: 'S1', targetField: 'S3', mappingType: 'AI_GENERATED', description: 'Diferencias → Opinión del Informe' },
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
          { ref: 'ACA', name: 'Archivo Corriente de Control Administrativo', phaseType: 'PLANNING',
            children: [
              { ref: 'ACA-01', name: 'Orden de Trabajo y Modificaciones' },
              { ref: 'ACA-02', name: 'Correspondencia Remitida' },
              { ref: 'ACA-03', name: 'Correspondencia Recibida' },
              { ref: 'ACA-04', name: 'Hoja de Costos' },
              { ref: 'ACA-06', name: 'Bitácora de Supervisión' },
              { ref: 'ACA-07', name: 'Instrucciones del Supervisor' },
            ],
          },
          { ref: 'PL',  name: 'Planificación',                               phaseType: 'PLANNING' },
          { ref: 'EJ',  name: 'Ejecución',                                   phaseType: 'FIELDWORK',
            children: [
              { ref: 'EJ-F',  name: 'Ejecución Presupuestaria (SAFI)' },
              { ref: 'EJ-OP', name: 'Indicadores de Gestión — 7E' },
              { ref: 'EJ-LC', name: 'Contrataciones LACAP/UACI' },
              { ref: 'EJ-NM', name: 'Nómina Institucional' },
            ],
          },
          { ref: 'COM', name: 'Hallazgos y Comunicaciones',                  phaseType: 'REPORTING' },
          { ref: 'INF', name: 'Informe',                                     phaseType: 'REPORTING' },
          { ref: 'SEG', name: 'Seguimiento de Recomendaciones',              phaseType: 'FOLLOWUP' },
        ],
        papers: [
          // ── ACA — Archivo Corriente de Control Administrativo ────────────
          { code: 'ACA-01', indexSection: 'ACA-01',
            title:  'Orden de Trabajo con sus Modificaciones',
            type:   WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.STANDARD },
          { code: 'ACA-02', indexSection: 'ACA-02',
            title:  'Correspondencia Remitida a la Entidad y Terceros',
            type:   WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.STANDARD },
          { code: 'ACA-03', indexSection: 'ACA-03',
            title:  'Correspondencia Recibida de la Entidad y Terceros',
            type:   WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.STANDARD },
          { code: 'ACA-04', indexSection: 'ACA-04',
            title:  'Hoja de Costos de la Auditoría',
            type:   WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.STANDARD },
          { code: 'ACA-06', indexSection: 'ACA-06',
            title:  'Bitácora de Supervisión',
            type:   WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART },
          { code: 'ACA-07', indexSection: 'ACA-07',
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
          { code: 'EJ-F01', indexSection: 'EJ-F',
            title:  'Cédula Sumaria de Ejecución Presupuestaria (NAIG Art. 75-80 / SAFI)',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.MASTER },
          { code: 'EJ-F02', indexSection: 'EJ-F',
            title:  'Análisis de Modificaciones Presupuestarias y Fondos Especiales (SAFI)',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART },
          { code: 'EJ-OP01', indexSection: 'EJ-OP',
            title:  'Cédula de Indicadores de Gestión — 7E (NAG / NAIG Art. 90-98)',
            type:   WorkingPaperType.DATA_ANALYSIS, wpKind: WpKind.SMART },
          { code: 'EJ-LC01', indexSection: 'EJ-LC',
            title:  'Cédula de Revisión de Contrataciones LACAP (NAIG Art. 82-88)',
            type:   WorkingPaperType.NORMATIVE_ANALYSIS, wpKind: WpKind.SMART },
          { code: 'EJ-LC02', indexSection: 'EJ-LC',
            title:  'Evaluación de Procesos de Licitación y Compra Directa (UACI)',
            type:   WorkingPaperType.NORMATIVE_ANALYSIS, wpKind: WpKind.SMART },
          { code: 'EJ-NM01', indexSection: 'EJ-NM',
            title:  'Cédula de Análisis de Nómina Institucional (NAIG Art. 82 / Ley SC)',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART },
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
        // ─── Grafo NAIG ───────────────────────────────────────────────────────
        links: [
          { sourceCode: 'PL-01', targetCode: 'PL-08', sourceField: 'S1', targetField: 'S2', mappingType: 'AI_GENERATED', description: 'Análisis general → Memorando gubernamental' },
          { sourceCode: 'PL-02', targetCode: 'PL-03', sourceField: 'S7', targetField: 'S2', mappingType: 'DIRECT',       description: 'SCI → Riesgos por componente' },
          { sourceCode: 'PL-03', targetCode: 'PL-08', sourceField: 'S5', targetField: 'S3', mappingType: 'AI_GENERATED', description: 'Riesgos → Memo' },
          { sourceCode: 'PL-03', targetCode: 'PL-09', sourceField: 'S5', targetField: 'S1', mappingType: 'AGGREGATED',   description: 'Riesgos → Programa' },
          { sourceCode: 'PL-04', targetCode: 'PL-08', sourceField: 'S1', targetField: 'S5', mappingType: 'DIRECT',       description: 'Recomendaciones previas → Memo' },
          { sourceCode: 'PL-06', targetCode: 'PL-08', sourceField: 'S3', targetField: 'S4', mappingType: 'DIRECT',       description: 'Materialidad → Memo' },
          { sourceCode: 'PL-06', targetCode: 'PL-09', sourceField: 'S3', targetField: 'S2', mappingType: 'AGGREGATED',   description: 'Materialidad → Tamaños muestra' },
          { sourceCode: 'PL-09', targetCode: 'EJ-F01',  sourceField: 'S1', targetField: 'S1', mappingType: 'DIRECT',     description: 'Programa → Ejecución presupuestaria' },
          { sourceCode: 'PL-09', targetCode: 'EJ-LC01', sourceField: 'S1', targetField: 'S1', mappingType: 'DIRECT',     description: 'Programa → LACAP' },
          { sourceCode: 'PL-09', targetCode: 'EJ-NM01', sourceField: 'S1', targetField: 'S1', mappingType: 'DIRECT',     description: 'Programa → Nómina' },
          { sourceCode: 'EJ-F01',  targetCode: 'COM-RH',  sourceField: 'S5', targetField: 'S1', mappingType: 'AGGREGATED', description: 'Hallazgos EP → Consolidado' },
          { sourceCode: 'EJ-LC01', targetCode: 'COM-RH',  sourceField: 'S5', targetField: 'S2', mappingType: 'AGGREGATED', description: 'Hallazgos LACAP → Consolidado' },
          { sourceCode: 'EJ-NM01', targetCode: 'COM-RH',  sourceField: 'S5', targetField: 'S3', mappingType: 'AGGREGATED', description: 'Hallazgos nómina → Consolidado' },
          { sourceCode: 'COM-RH',  targetCode: 'INF-01',  sourceField: 'S1', targetField: 'S3', mappingType: 'AI_GENERATED', description: 'Hallazgos → Informe NAIG' },
          { sourceCode: 'COM-H01', targetCode: 'SEG-01',  sourceField: 'S5', targetField: 'S1', mappingType: 'DIRECT',     description: 'Hallazgos individuales → Plan seguimiento' },
        ],
      },

      // ═══════════════════════════════════════════════════════════════════════
      // 4. Auditoría Forense / Examen Especial (ACFE + NIA 240) — 29 papeles
      //    Secciones: A · B (B-EVD · B-INT · B-CAA · B-TXN) · D · E
      // ═══════════════════════════════════════════════════════════════════════
      {
        name: 'Auditoría Forense (ACFE + NIA 240)',
        description:
          'Índice completo para Examen Especial / Auditoría Forense según ACFE Fraud Examiners Manual, ' +
          'NIA 240, ISAE 3000 e ISRS 4400. Incluye cadena de custodia digital, CAATs forenses, ' +
          'entrevistas estructuradas e informe forense. Aplica a: Forense.',
        auditTypes: [AuditType.FORENSIC],
        sections: [
          { ref: 'A', name: 'Planificación e Investigación Preliminar', phaseType: 'PLANNING' },
          { ref: 'B', name: 'Investigación y Evidencia Forense',        phaseType: 'FIELDWORK',
            children: [
              { ref: 'B-EVD', name: 'Evidencia Digital y Cadena de Custodia' },
              { ref: 'B-INT', name: 'Entrevistas Forenses' },
              { ref: 'B-CAA', name: 'CAATs y Análisis de Datos' },
              { ref: 'B-TXN', name: 'Análisis de Transacciones' },
            ],
          },
          { ref: 'D', name: 'Hallazgos Forenses',                       phaseType: 'REPORTING' },
          { ref: 'E', name: 'Informe Forense',                          phaseType: 'REPORTING' },
        ],
        papers: [
          // ── A — Planificación (7 papeles) ────────────────────────────────
          { code: 'A-01', indexSection: 'A',
            title:  'Carta de Encargo y Términos del Trabajo Forense (NIA 210 / ISRS 4400)',
            type:   WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.STANDARD },
          { code: 'A-02', indexSection: 'A',
            title:  'Evaluación de Independencia, Ética y Conflictos de Interés (CIEPC)',
            type:   WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.STANDARD },
          { code: 'A-03', indexSection: 'A',
            title:  'Notificación de Alerta / Denuncia — Análisis de Credibilidad',
            type:   WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.STANDARD },
          { code: 'A-04', indexSection: 'A',
            title:    'Hipótesis de Fraude y Mapa de Esquemas ACFE — Árbol del Fraude',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART,
            paperCode: 'PT-A2' },
          { code: 'A-05', indexSection: 'A',
            title:    'Plan de Investigación Forense — Fases, Equipo y Cronograma',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.MASTER,
            paperCode: 'PT-PROG' },
          { code: 'A-06', indexSection: 'A',
            title:    'Evaluación de Riesgo Forense — Triángulo del Fraude (NIA 240)',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART,
            paperCode: 'PT-A2' },
          { code: 'A-07', indexSection: 'A',
            title:    'Memorando de Planificación Forense',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.MASTER,
            paperCode: 'PT-MEMO' },
          // ── B-EVD — Evidencia Digital y Cadena de Custodia (4 papeles) ──
          { code: 'B-EVD-01', indexSection: 'B-EVD',
            title:  'Registro de Incautación de Evidencia',
            type:   WorkingPaperType.CONTROL_EVALUATION, wpKind: WpKind.STANDARD },
          { code: 'B-EVD-02', indexSection: 'B-EVD',
            title:  'Formulario de Cadena de Custodia (RFC 3227)',
            type:   WorkingPaperType.CONTROL_EVALUATION, wpKind: WpKind.STANDARD },
          { code: 'B-EVD-03', indexSection: 'B-EVD',
            title:  'Protocolo de Imagen Forense Digital — Verificación de Integridad',
            type:   WorkingPaperType.CONTROL_EVALUATION, wpKind: WpKind.STANDARD },
          { code: 'B-EVD-04', indexSection: 'B-EVD',
            title:  'Log de Integridad — Hash SHA-256 de Evidencias Recolectadas',
            type:   WorkingPaperType.CONTROL_EVALUATION, wpKind: WpKind.STANDARD },
          // ── B-INT — Entrevistas Forenses (4 papeles) ─────────────────────
          { code: 'B-INT-01', indexSection: 'B-INT',
            title:    'Plan y Guía de Entrevistas Forenses — Técnica PEACE',
            type:     WorkingPaperType.INTERVIEW, wpKind: WpKind.SMART,
            paperCode: 'PT-PROG' },
          { code: 'B-INT-02', indexSection: 'B-INT',
            title:  'Actas de Entrevista a Testigos',
            type:   WorkingPaperType.INTERVIEW, wpKind: WpKind.STANDARD },
          { code: 'B-INT-03', indexSection: 'B-INT',
            title:  'Actas de Entrevista a Sujetos de Interés / Personas Investigadas',
            type:   WorkingPaperType.INTERVIEW, wpKind: WpKind.STANDARD },
          { code: 'B-INT-04', indexSection: 'B-INT',
            title:    'Análisis de Declaraciones, Contradicciones e Inconsistencias',
            type:     WorkingPaperType.DATA_ANALYSIS, wpKind: WpKind.SMART,
            paperCode: 'PT-A2' },
          // ── B-CAA — CAATs y Análisis de Datos (4 papeles) ────────────────
          { code: 'B-CAA-01', indexSection: 'B-CAA',
            title:    'Programa de Análisis de Datos CAATs — ACL / IDEA / Python',
            type:     WorkingPaperType.DATA_ANALYSIS, wpKind: WpKind.MASTER,
            paperCode: 'PT-PROG' },
          { code: 'B-CAA-02', indexSection: 'B-CAA',
            title:    'Prueba de Benford — Análisis de Primer Dígito',
            type:     WorkingPaperType.DATA_ANALYSIS, wpKind: WpKind.SMART,
            paperCode: 'PT-B4' },
          { code: 'B-CAA-03', indexSection: 'B-CAA',
            title:    'Detección de Duplicados y Pagos Múltiples a Proveedores',
            type:     WorkingPaperType.DATA_ANALYSIS, wpKind: WpKind.SMART,
            paperCode: 'PT-B4' },
          { code: 'B-CAA-04', indexSection: 'B-CAA',
            title:    'Análisis de Excepciones y Anomalías — Transacciones Fuera de Rango',
            type:     WorkingPaperType.DATA_ANALYSIS, wpKind: WpKind.SMART,
            paperCode: 'PT-B4' },
          // ── B-TXN — Análisis de Transacciones (4 papeles) ────────────────
          { code: 'B-TXN-01', indexSection: 'B-TXN',
            title:    'Mapeo y Rastreo de Flujos de Fondos — Fuente y Aplicación',
            type:     WorkingPaperType.DATA_ANALYSIS, wpKind: WpKind.SMART,
            paperCode: 'PT-B4' },
          { code: 'B-TXN-02', indexSection: 'B-TXN',
            title:    'Análisis de Partes Relacionadas y Empresas Vinculadas (NIA 550)',
            type:     WorkingPaperType.NORMATIVE_ANALYSIS, wpKind: WpKind.SMART,
            paperCode: 'PT-B2' },
          { code: 'B-TXN-03', indexSection: 'B-TXN',
            title:    'Reconstrucción Contable — Cuentas Afectadas y Asientos Alterados',
            type:     WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART,
            paperCode: 'PT-B2' },
          { code: 'B-TXN-04', indexSection: 'B-TXN',
            title:    'Cuantificación del Perjuicio Económico — Metodología ACFE',
            type:     WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.MASTER,
            paperCode: 'PT-DIFS' },
          // ── D — Hallazgos Forenses (3 papeles) ──────────────────────────
          { code: 'D-01', indexSection: 'D',
            title:    'Cédula Maestra de Hallazgos Forenses',
            type:     WorkingPaperType.FINDING, wpKind: WpKind.MASTER },
          { code: 'D-02', indexSection: 'D',
            title:    'Evaluación de Controles que Fallaron o Fueron Eludidos',
            type:     WorkingPaperType.FINDING, wpKind: WpKind.SMART,
            paperCode: 'PT-D1' },
          { code: 'D-03', indexSection: 'D',
            title:  'Matriz de Responsabilidades y Perpetradores Identificados',
            type:   WorkingPaperType.FINDING, wpKind: WpKind.MASTER },
          // ── E — Informe Forense (3 papeles) ─────────────────────────────
          { code: 'E-01', indexSection: 'E',
            title:    'Borrador del Informe Forense — ACFE / ISAE 3000',
            type:     WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.MASTER,
            paperCode: 'PT-MEMO' },
          { code: 'E-02', indexSection: 'E',
            title:  'Informe Forense Final — Versión Ejecutiva con Cadena de Custodia',
            type:   WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.STANDARD },
          { code: 'E-03', indexSection: 'E',
            title:  'Anexos Técnicos al Informe — Evidencia Digital y CAATs',
            type:   WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.STANDARD },
        ],
        // ─── Grafo Forense (ACFE + NIA 240) ──────────────────────────────────
        links: [
          { sourceCode: 'A-03', targetCode: 'A-04', sourceField: 'S2', targetField: 'S1', mappingType: 'DIRECT',       description: 'Denuncia → Hipótesis de fraude' },
          { sourceCode: 'A-04', targetCode: 'A-05', sourceField: 'S1', targetField: 'S2', mappingType: 'AGGREGATED',   description: 'Hipótesis → Plan de investigación' },
          { sourceCode: 'A-04', targetCode: 'A-06', sourceField: 'S2', targetField: 'S1', mappingType: 'DIRECT',       description: 'Hipótesis → Triángulo del fraude' },
          { sourceCode: 'A-05', targetCode: 'A-07', sourceField: 'S2', targetField: 'S2', mappingType: 'AI_GENERATED', description: 'Plan → Memo de planificación' },
          { sourceCode: 'A-06', targetCode: 'A-07', sourceField: 'S6', targetField: 'S3', mappingType: 'AI_GENERATED', description: 'Riesgo fraude → Memo' },
          { sourceCode: 'A-07', targetCode: 'B-CAA-01', sourceField: 'S2', targetField: 'S1', mappingType: 'DIRECT',   description: 'Memo → Programa CAATs' },
          { sourceCode: 'B-EVD-04', targetCode: 'B-TXN-04', sourceField: 'S1', targetField: 'S2', mappingType: 'DIRECT', description: 'Hash de evidencia → Cuantificación' },
          { sourceCode: 'B-CAA-02', targetCode: 'B-TXN-01', sourceField: 'S1', targetField: 'S2', mappingType: 'AGGREGATED', description: 'Benford → Rastreo de flujos' },
          { sourceCode: 'B-CAA-04', targetCode: 'B-TXN-01', sourceField: 'S1', targetField: 'S2', mappingType: 'AGGREGATED', description: 'Anomalías → Rastreo de flujos' },
          { sourceCode: 'B-INT-03', targetCode: 'B-INT-04', sourceField: 'S1', targetField: 'S1', mappingType: 'DIRECT',   description: 'Entrevistas → Análisis declaraciones' },
          { sourceCode: 'B-TXN-04', targetCode: 'D-01', sourceField: 'S1', targetField: 'S2', mappingType: 'AGGREGATED', description: 'Perjuicio cuantificado → Hallazgos' },
          { sourceCode: 'B-INT-04', targetCode: 'D-03', sourceField: 'S1', targetField: 'S1', mappingType: 'AGGREGATED', description: 'Declaraciones → Matriz responsabilidades' },
          { sourceCode: 'D-01', targetCode: 'E-01',   sourceField: 'S1', targetField: 'S2', mappingType: 'AI_GENERATED', description: 'Hallazgos → Borrador Informe Forense' },
          { sourceCode: 'D-02', targetCode: 'E-01',   sourceField: 'S1', targetField: 'S3', mappingType: 'AI_GENERATED', description: 'Controles fallidos → Informe' },
          { sourceCode: 'D-03', targetCode: 'E-01',   sourceField: 'S1', targetField: 'S4', mappingType: 'DIRECT',       description: 'Responsabilidades → Informe' },
        ],
      },

      // ═══════════════════════════════════════════════════════════════════════
      // 5. Auditoría IT Security (ISO 27001) — 26 papeles
      //    Secciones: A · B (B-IAM · B-VULN · B-CRYPT · B-INC · B-PENTEST · B-BCP)
      //              C (C-NRP · C-CIBER · C-COBIT) · D
      // ═══════════════════════════════════════════════════════════════════════
      {
        name: 'Auditoría IT Security (ISO 27001)',
        description:
          'Índice completo para Auditoría de Seguridad de la Información según ISO 27001:2022, ' +
          'COBIT 2019, NIST CSF 2.0, NRP-23/NRP-32 (BCR/SSF El Salvador) y Ley de Ciberseguridad ' +
          'D.L. 143/2024. Aplica a: IT Security.',
        auditTypes: [AuditType.IT_SECURITY],
        sections: [
          { ref: 'A', name: 'Planificación del SGSI',           phaseType: 'PLANNING' },
          { ref: 'B', name: 'Evaluación Técnica de Controles',  phaseType: 'FIELDWORK',
            children: [
              { ref: 'B-IAM',    name: 'Gestión de Identidades y Accesos (IAM/PAM)' },
              { ref: 'B-VULN',   name: 'Vulnerabilidades y Parches' },
              { ref: 'B-CRYPT',  name: 'Controles Criptográficos y PKI' },
              { ref: 'B-INC',    name: 'Gestión de Incidentes de Seguridad' },
              { ref: 'B-PENTEST',name: 'Pruebas de Penetración y Ethical Hacking' },
              { ref: 'B-BCP',    name: 'Continuidad y DRP' },
            ],
          },
          { ref: 'C', name: 'Cumplimiento Normativo',            phaseType: 'FIELDWORK',
            children: [
              { ref: 'C-NRP',   name: 'NRP-23 / NRP-32 (BCR/SSF)' },
              { ref: 'C-CIBER', name: 'Ley Ciberseguridad D.L. 143/2024' },
              { ref: 'C-COBIT', name: 'COBIT 2019' },
            ],
          },
          { ref: 'D', name: 'Hallazgos e Informe de Seguridad', phaseType: 'REPORTING' },
        ],
        papers: [
          // ── A — Planificación (6 papeles) ────────────────────────────────
          { code: 'A-01', indexSection: 'A',
            title:  'Alcance del SGSI y Términos del Trabajo (ISO 27001 cl. 4-6)',
            type:   WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.STANDARD },
          { code: 'A-02', indexSection: 'A',
            title:    'Entendimiento del Entorno TI y Clasificación de Activos (ISO A.5.9)',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART,
            paperCode: 'PT-A1' },
          { code: 'A-03', indexSection: 'A',
            title:    'Evaluación de Riesgos de Seguridad (ISO 27001 cl. 6.1 / NRP-23)',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART,
            paperCode: 'PT-SEC-RISK' },
          { code: 'A-04', indexSection: 'A',
            title:    'Evaluación de Controles ISO 27001 Anexo A — 93 Controles',
            type:     WorkingPaperType.CONTROL_EVALUATION, wpKind: WpKind.SMART,
            paperCode: 'PT-A3' },
          { code: 'A-05', indexSection: 'A',
            title:    'Memorando de Planificación — Auditoría SGSI',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.MASTER,
            paperCode: 'PT-MEMO' },
          { code: 'A-06', indexSection: 'A',
            title:    'Programa de Auditoría de Seguridad de la Información',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.MASTER,
            paperCode: 'PT-PROG' },
          // ── B-IAM — Gestión de Identidades (2 papeles) ──────────────────
          { code: 'B-IAM-01', indexSection: 'B-IAM',
            title:    'Revisión de Gestión de Accesos e Identidades — IAM (ISO A.5.15-A.5.18)',
            type:     WorkingPaperType.CONTROL_EVALUATION, wpKind: WpKind.SMART,
            paperCode: 'PT-A3' },
          { code: 'B-IAM-02', indexSection: 'B-IAM',
            title:  'Revisión de Accesos Privilegiados, PAM y Cuentas de Servicio (ISO A.8.2)',
            type:   WorkingPaperType.CONTROL_EVALUATION, wpKind: WpKind.SMART },
          // ── B-VULN — Vulnerabilidades (2 papeles) ───────────────────────
          { code: 'B-VULN-01', indexSection: 'B-VULN',
            title:  'Revisión de Gestión de Vulnerabilidades Técnicas y Parches (ISO A.8.8)',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.STANDARD },
          { code: 'B-VULN-02', indexSection: 'B-VULN',
            title:  'Revisión de Configuración Segura y Hardening de Sistemas (ISO A.8.9)',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.STANDARD },
          // ── B-CRYPT — Criptografía (2 papeles) ──────────────────────────
          { code: 'B-CRYPT-01', indexSection: 'B-CRYPT',
            title:  'Evaluación de Controles Criptográficos y PKI (ISO A.8.24)',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.STANDARD },
          { code: 'B-CRYPT-02', indexSection: 'B-CRYPT',
            title:  'Revisión de Certificados Digitales, Autoridades de Certificación y TLS',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.STANDARD },
          // ── B-INC — Incidentes (2 papeles) ──────────────────────────────
          { code: 'B-INC-01', indexSection: 'B-INC',
            title:  'Revisión de Gestión de Incidentes de Seguridad (ISO A.5.24-A.5.27)',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.STANDARD },
          { code: 'B-INC-02', indexSection: 'B-INC',
            title:    'Análisis de Log de Incidentes, Tiempo de Respuesta y MTTR',
            type:     WorkingPaperType.DATA_ANALYSIS, wpKind: WpKind.SMART,
            paperCode: 'PT-B4' },
          // ── B-PENTEST — Pruebas de Penetración (2 papeles) ──────────────
          { code: 'B-PENTEST-01', indexSection: 'B-PENTEST',
            title:  'Evidencia de Pruebas de Penetración — Metodología PTES / OWASP Top 10',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.STANDARD },
          { code: 'B-PENTEST-02', indexSection: 'B-PENTEST',
            title:  'Revisión de Escaneo de Vulnerabilidades y Plan de Remediación (ISO A.8.29)',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.STANDARD },
          // ── B-BCP — Continuidad (2 papeles) ─────────────────────────────
          { code: 'B-BCP-01', indexSection: 'B-BCP',
            title:  'Revisión del Plan de Continuidad y DRP (ISO A.5.29-30 / NRP-23)',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.STANDARD },
          { code: 'B-BCP-02', indexSection: 'B-BCP',
            title:  'Evaluación de Pruebas y Simulacros de Recuperación (BCI GPG 7.0)',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.STANDARD },
          // ── C-NRP — Cumplimiento BCR/SSF (2 papeles) ────────────────────
          { code: 'C-NRP-01', indexSection: 'C-NRP',
            title:    'Checklist Integral de Cumplimiento NRP-23 BCR — SGSI',
            type:     WorkingPaperType.NORMATIVE_ANALYSIS, wpKind: WpKind.SMART,
            paperCode: 'PT-SEC-RISK' },
          { code: 'C-NRP-02', indexSection: 'C-NRP',
            title:    'Checklist Cumplimiento NRP-32 SSF — Canales Digitales y Ciberseguridad',
            type:     WorkingPaperType.NORMATIVE_ANALYSIS, wpKind: WpKind.SMART,
            paperCode: 'PT-SEC-RISK' },
          // ── C-CIBER — Ley Ciberseguridad (2 papeles) ────────────────────
          { code: 'C-CIBER-01', indexSection: 'C-CIBER',
            title:  'Evaluación Ley de Ciberseguridad D.L. 143/2024 — Obligaciones ACE',
            type:   WorkingPaperType.NORMATIVE_ANALYSIS, wpKind: WpKind.STANDARD },
          { code: 'C-CIBER-02', indexSection: 'C-CIBER',
            title:  'Revisión de Notificación de Incidentes — CSIRT Nacional y Plazos D.L. 143',
            type:   WorkingPaperType.NORMATIVE_ANALYSIS, wpKind: WpKind.STANDARD },
          // ── C-COBIT — COBIT 2019 (2 papeles) ────────────────────────────
          { code: 'C-COBIT-01', indexSection: 'C-COBIT',
            title:    'Evaluación COBIT 2019 — APO13 (Seguridad), DSS05, MEA02',
            type:     WorkingPaperType.NORMATIVE_ANALYSIS, wpKind: WpKind.SMART,
            paperCode: 'PT-A3' },
          { code: 'C-COBIT-02', indexSection: 'C-COBIT',
            title:  'Revisión Gobierno TI y Gestión del Riesgo — EDM03 / APO12 (COBIT 2019)',
            type:   WorkingPaperType.NORMATIVE_ANALYSIS, wpKind: WpKind.STANDARD },
          // ── D — Hallazgos e Informe (2 papeles) ─────────────────────────
          { code: 'D-01', indexSection: 'D',
            title:    'Hallazgo de Seguridad de la Información — Plan de Remediación',
            type:     WorkingPaperType.FINDING, wpKind: WpKind.SMART,
            paperCode: 'PT-D1' },
          { code: 'D-02', indexSection: 'D',
            title:    'Informe de Auditoría de Seguridad de la Información con Mapa de Riesgo',
            type:     WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.MASTER,
            paperCode: 'PT-MEMO' },
        ],
        // ─── Grafo IT Security (ISO 27001 + NRP-23/32 + D.L. 143) ────────────
        links: [
          { sourceCode: 'A-02', targetCode: 'A-03', sourceField: 'S1', targetField: 'S1', mappingType: 'DIRECT',       description: 'Activos → Análisis de riesgos' },
          { sourceCode: 'A-02', targetCode: 'A-04', sourceField: 'S1', targetField: 'S1', mappingType: 'DIRECT',       description: 'Activos → Anexo A' },
          { sourceCode: 'A-03', targetCode: 'A-04', sourceField: 'S2', targetField: 'S2', mappingType: 'AGGREGATED',   description: 'Riesgos → Selección de controles' },
          { sourceCode: 'A-03', targetCode: 'A-05', sourceField: 'S2', targetField: 'S3', mappingType: 'AI_GENERATED', description: 'Riesgos → Memo SGSI' },
          { sourceCode: 'A-04', targetCode: 'A-06', sourceField: 'S2', targetField: 'S1', mappingType: 'AGGREGATED',   description: 'Anexo A → Programa' },
          { sourceCode: 'A-06', targetCode: 'B-IAM-01',    sourceField: 'S1', targetField: 'S1', mappingType: 'DIRECT', description: 'Programa → IAM' },
          { sourceCode: 'A-06', targetCode: 'B-VULN-01',   sourceField: 'S1', targetField: 'S1', mappingType: 'DIRECT', description: 'Programa → Vulnerabilidades' },
          { sourceCode: 'A-06', targetCode: 'B-PENTEST-01', sourceField: 'S1', targetField: 'S1', mappingType: 'DIRECT', description: 'Programa → Pentest' },
          { sourceCode: 'A-06', targetCode: 'B-BCP-01',    sourceField: 'S1', targetField: 'S1', mappingType: 'DIRECT', description: 'Programa → BCP' },
          { sourceCode: 'B-VULN-01', targetCode: 'B-PENTEST-02', sourceField: 'S2', targetField: 'S1', mappingType: 'AGGREGATED', description: 'Vulns → Plan remediación' },
          { sourceCode: 'B-INC-02',  targetCode: 'C-CIBER-02',   sourceField: 'S2', targetField: 'S1', mappingType: 'AGGREGATED', description: 'Log incidentes → Plazos D.L. 143' },
          { sourceCode: 'C-NRP-01',  targetCode: 'D-01', sourceField: 'S3', targetField: 'S2', mappingType: 'AGGREGATED', description: 'Incumplimientos NRP-23 → Hallazgos' },
          { sourceCode: 'C-NRP-02',  targetCode: 'D-01', sourceField: 'S3', targetField: 'S3', mappingType: 'AGGREGATED', description: 'Incumplimientos NRP-32 → Hallazgos' },
          { sourceCode: 'C-CIBER-01', targetCode: 'D-01', sourceField: 'S3', targetField: 'S4', mappingType: 'AGGREGATED', description: 'D.L. 143 → Hallazgos' },
          { sourceCode: 'C-COBIT-01', targetCode: 'D-01', sourceField: 'S2', targetField: 'S5', mappingType: 'AGGREGATED', description: 'COBIT → Hallazgos' },
          { sourceCode: 'D-01', targetCode: 'D-02', sourceField: 'S1', targetField: 'S3', mappingType: 'AI_GENERATED', description: 'Hallazgos → Informe SGSI' },
        ],
      },

      // ═══════════════════════════════════════════════════════════════════════
      // 6. Auditoría AML/Prevención LD (LCDA/NRP-36) — 24 papeles
      //    Secciones: A · B (B-DDC · B-PEPS · B-MON · B-ROS · B-OFC · B-CAP · B-PROD)
      //              C · D
      // ═══════════════════════════════════════════════════════════════════════
      {
        name: 'Auditoría AML/Prevención LD (LCDA/NRP-36)',
        description:
          'Índice completo para Auditoría de Prevención de Lavado de Dinero y Activos ' +
          'según LCDA, NRP-36 (BCR/SSF), GAFI 40 Recomendaciones y Resolución CVPCPA 129/2022. ' +
          'Cubre DDC/KYC/EDD, PEPs, monitoreo, ROS, Oficial de Cumplimiento y criptoactivos. ' +
          'Aplica a: AML.',
        auditTypes: [AuditType.AML],
        sections: [
          { ref: 'A', name: 'Planificación ALD/PLD',               phaseType: 'PLANNING' },
          { ref: 'B', name: 'Ejecución — Pruebas de Cumplimiento', phaseType: 'FIELDWORK',
            children: [
              { ref: 'B-DDC',  name: 'Debida Diligencia del Cliente (KYC/CDD/EDD)' },
              { ref: 'B-PEPS', name: 'PEPs y Listas de Sanciones' },
              { ref: 'B-MON',  name: 'Monitoreo de Transacciones e Inusuales' },
              { ref: 'B-ROS',  name: 'Reportes de Operaciones Sospechosas (UIF/SIRAF)' },
              { ref: 'B-OFC',  name: 'Oficial de Cumplimiento y Estructura' },
              { ref: 'B-CAP',  name: 'Capacitación y Cultura ALD' },
              { ref: 'B-PROD', name: 'Productos, Servicios y Canales de Alto Riesgo' },
            ],
          },
          { ref: 'C', name: 'Cumplimiento Normativo NRP-36',       phaseType: 'FIELDWORK' },
          { ref: 'D', name: 'Informe ALD y Plan de Subsanación',   phaseType: 'REPORTING' },
        ],
        papers: [
          // ── A — Planificación (6 papeles) ────────────────────────────────
          { code: 'A-01', indexSection: 'A',
            title:  'Designación y Términos del Trabajo — Auditoría ALD/PLD (CVPCPA Res. 129/2022)',
            type:   WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.STANDARD },
          { code: 'A-02', indexSection: 'A',
            title:    'Entendimiento del Sujeto Obligado — Perfil, Productos y Marco Legal',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART,
            paperCode: 'PT-A1' },
          { code: 'A-03', indexSection: 'A',
            title:    'Evaluación de Riesgo LA/FT — Metodología NRP-36 / GAFI Risk-Based Approach',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART,
            paperCode: 'PT-AML-RISK' },
          { code: 'A-04', indexSection: 'A',
            title:    'Evaluación de Controles PLD — 3 Líneas de Defensa (NRP-36 Art. 21-30)',
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
          // ── B-DDC — Debida Diligencia (2 papeles) ───────────────────────
          { code: 'B-DDC-01', indexSection: 'B-DDC',
            title:  'Prueba de DDC/KYC — Debida Diligencia Simplificada y Estándar (NRP-36 Art. 15)',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.STANDARD },
          { code: 'B-DDC-02', indexSection: 'B-DDC',
            title:    'Prueba de EDD — Debida Diligencia Reforzada (PEPs / Alto Riesgo / Corresponsales)',
            type:     WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART,
            paperCode: 'PT-AML-RISK' },
          // ── B-PEPS — PEPs y Sanciones (2 papeles) ───────────────────────
          { code: 'B-PEPS-01', indexSection: 'B-PEPS',
            title:  'Revisión de Identificación y Monitoreo de PEPs (GAFI Rec. 12)',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.STANDARD },
          { code: 'B-PEPS-02', indexSection: 'B-PEPS',
            title:  'Revisión de Consulta a Listas de Sanciones OFAC / ONU / UE (GAFI Rec. 6)',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.STANDARD },
          // ── B-MON — Monitoreo (2 papeles) ───────────────────────────────
          { code: 'B-MON-01', indexSection: 'B-MON',
            title:  'Revisión de Transacciones Inusuales y Sistema de Monitoreo Automatizado',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.STANDARD },
          { code: 'B-MON-02', indexSection: 'B-MON',
            title:    'Análisis de Umbrales, Alertas y Efectividad del Monitoreo (NRP-36 Art. 35)',
            type:     WorkingPaperType.DATA_ANALYSIS, wpKind: WpKind.SMART,
            paperCode: 'PT-B4' },
          // ── B-ROS — Reportes Sospechosos (2 papeles) ────────────────────
          { code: 'B-ROS-01', indexSection: 'B-ROS',
            title:  'Revisión de ROS — Reportes de Operaciones Sospechosas (UIF/SIRAF)',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.STANDARD },
          { code: 'B-ROS-02', indexSection: 'B-ROS',
            title:    'Evaluación del Proceso de Escalamiento y Calidad de los ROS',
            type:     WorkingPaperType.CONTROL_EVALUATION, wpKind: WpKind.SMART,
            paperCode: 'PT-AML-RISK' },
          // ── B-OFC — Oficial de Cumplimiento (2 papeles) ─────────────────
          { code: 'B-OFC-01', indexSection: 'B-OFC',
            title:  'Evaluación del Oficial de Cumplimiento — Perfil e Idoneidad (LCDA Art. 14)',
            type:   WorkingPaperType.CONTROL_EVALUATION, wpKind: WpKind.STANDARD },
          { code: 'B-OFC-02', indexSection: 'B-OFC',
            title:  'Revisión de Estructura del Área de Cumplimiento y Comité ALD (NRP-36 Art. 21)',
            type:   WorkingPaperType.CONTROL_EVALUATION, wpKind: WpKind.STANDARD },
          // ── B-CAP — Capacitación (2 papeles) ────────────────────────────
          { code: 'B-CAP-01', indexSection: 'B-CAP',
            title:  'Revisión del Programa Anual de Capacitación ALD (NRP-36 Art. 45)',
            type:   WorkingPaperType.CONTROL_EVALUATION, wpKind: WpKind.STANDARD },
          { code: 'B-CAP-02', indexSection: 'B-CAP',
            title:    'Evaluación de Resultados de Capacitación y Cultura ALD Organizacional',
            type:     WorkingPaperType.DATA_ANALYSIS, wpKind: WpKind.SMART,
            paperCode: 'PT-AML-RISK' },
          // ── B-PROD — Productos de Alto Riesgo (2 papeles) ───────────────
          { code: 'B-PROD-01', indexSection: 'B-PROD',
            title:    'Evaluación de Productos, Servicios y Canales de Alto Riesgo LA/FT (GAFI Rec. 10)',
            type:     WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART,
            paperCode: 'PT-AML-RISK' },
          { code: 'B-PROD-02', indexSection: 'B-PROD',
            title:    'Evaluación de Criptoactivos y Billetera Chivo — Ley Bitcoin D.L. 57/2021',
            type:     WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART,
            paperCode: 'PT-AML-RISK' },
          // ── C — Cumplimiento Normativo (2 papeles) ───────────────────────
          { code: 'C-01', indexSection: 'C',
            title:    'Checklist NRP-36 / Instructivo UIF V3 — Cumplimiento Integral Arts. 1-80',
            type:     WorkingPaperType.NORMATIVE_ANALYSIS, wpKind: WpKind.SMART,
            paperCode: 'PT-AML-RISK' },
          { code: 'C-02', indexSection: 'C',
            title:    'Evaluación GAFI 40 Recomendaciones — Efectividad y Resultados Inmediatos',
            type:     WorkingPaperType.NORMATIVE_ANALYSIS, wpKind: WpKind.SMART,
            paperCode: 'PT-AML-RISK' },
          // ── D — Informe (2 papeles) ──────────────────────────────────────
          { code: 'D-01', indexSection: 'D',
            title:    'Informe ALD — Formato CVPCPA Guía V3 (Resolución 129/2022)',
            type:     WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.MASTER,
            paperCode: 'PT-MEMO' },
          { code: 'D-02', indexSection: 'D',
            title:  'Resumen de Incumplimientos, Observaciones y Plan de Subsanación',
            type:   WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.MASTER },
        ],
        // ─── Grafo AML/PLD (LCDA + NRP-36 + GAFI) ────────────────────────────
        links: [
          { sourceCode: 'A-02', targetCode: 'A-03', sourceField: 'S1', targetField: 'S1', mappingType: 'DIRECT',       description: 'Perfil sujeto obligado → Riesgos LA/FT' },
          { sourceCode: 'A-03', targetCode: 'A-04', sourceField: 'S5', targetField: 'S1', mappingType: 'AGGREGATED',   description: 'ERI → 3 líneas de defensa' },
          { sourceCode: 'A-03', targetCode: 'A-05', sourceField: 'S5', targetField: 'S3', mappingType: 'AI_GENERATED', description: 'ERI → Memo ALD' },
          { sourceCode: 'A-04', targetCode: 'A-05', sourceField: 'S4', targetField: 'S4', mappingType: 'AI_GENERATED', description: 'Controles → Memo enfoque' },
          { sourceCode: 'A-05', targetCode: 'A-06', sourceField: 'S2', targetField: 'S1', mappingType: 'AGGREGATED',   description: 'Memo → Programa' },
          { sourceCode: 'A-06', targetCode: 'B-DDC-01', sourceField: 'S1', targetField: 'S1', mappingType: 'DIRECT',   description: 'Programa → DDC' },
          { sourceCode: 'A-06', targetCode: 'B-PEPS-01', sourceField: 'S1', targetField: 'S1', mappingType: 'DIRECT',  description: 'Programa → PEPs' },
          { sourceCode: 'A-06', targetCode: 'B-MON-01', sourceField: 'S1', targetField: 'S1', mappingType: 'DIRECT',   description: 'Programa → Monitoreo' },
          { sourceCode: 'A-06', targetCode: 'B-ROS-01', sourceField: 'S1', targetField: 'S1', mappingType: 'DIRECT',   description: 'Programa → ROS' },
          { sourceCode: 'B-DDC-01', targetCode: 'B-DDC-02', sourceField: 'S2', targetField: 'S1', mappingType: 'AGGREGATED', description: 'Clientes alto riesgo → EDD' },
          { sourceCode: 'B-MON-01', targetCode: 'B-ROS-01', sourceField: 'S3', targetField: 'S1', mappingType: 'AGGREGATED', description: 'Alertas → ROS' },
          { sourceCode: 'B-MON-02', targetCode: 'B-ROS-02', sourceField: 'S2', targetField: 'S1', mappingType: 'AGGREGATED', description: 'Efectividad monitoreo → Calidad ROS' },
          { sourceCode: 'B-OFC-01', targetCode: 'B-OFC-02', sourceField: 'S2', targetField: 'S1', mappingType: 'DIRECT',     description: 'Oficial → Estructura Comité' },
          { sourceCode: 'B-PROD-01', targetCode: 'A-03', sourceField: 'S2', targetField: 'S6', mappingType: 'AGGREGATED', description: 'Productos alto riesgo → Re-evaluación ERI' },
          { sourceCode: 'B-DDC-01', targetCode: 'C-01', sourceField: 'S3', targetField: 'S1', mappingType: 'AGGREGATED', description: 'Hallazgos DDC → Checklist NRP-36' },
          { sourceCode: 'B-MON-01', targetCode: 'C-01', sourceField: 'S4', targetField: 'S2', mappingType: 'AGGREGATED', description: 'Hallazgos monitoreo → Checklist NRP-36' },
          { sourceCode: 'C-01', targetCode: 'D-01', sourceField: 'S1', targetField: 'S3', mappingType: 'AI_GENERATED', description: 'Cumplimiento NRP-36 → Informe ALD' },
          { sourceCode: 'C-02', targetCode: 'D-01', sourceField: 'S1', targetField: 'S4', mappingType: 'AI_GENERATED', description: 'GAFI → Informe ALD' },
          { sourceCode: 'D-01', targetCode: 'D-02', sourceField: 'S1', targetField: 'S1', mappingType: 'AGGREGATED', description: 'Informe → Plan subsanación' },
        ],
      },

      // ═══════════════════════════════════════════════════════════════════════
      // 7. Auditoría Fiscal El Salvador v6.1 — NACOT 2018 como norma rectora — 53 papeles
      //    Secciones: APF · A · ISR · IVA · OF · AF · D
      //    v6.1: NACOT 2018 central + Independencia/Calidad/Carta de Encargo (CIEPC),
      //          Riesgo de Incumplimiento (NIA 315), AML (LCLDA), Precios de Transferencia
      //          (OCDE/BEPS), Dictamen Semestral Zonas Francas/SSII y Dictamen NACOT Anexo 1.
      // ═══════════════════════════════════════════════════════════════════════
      {
        name: 'Auditoría Fiscal El Salvador (CT/DGII)',
        description:
          'Índice completo de Auditoría Fiscal El Salvador v6.1. NORMA TÉCNICA RECTORA: NACOT 2018 ' +
          '(Norma para el Aseguramiento sobre el Cumplimiento de Obligaciones Tributarias, CVPCPA), ' +
          'que rige ética e independencia (CIEPC), control de calidad, aceptación del encargo, ' +
          'planificación, ejecución, documentación y el Dictamen (Anexo 1, 3 tipos de opinión). ' +
          'Marco legal: Código Tributario Arts. 129-138, LISR, Ley IVA; NIA supletoriamente. ' +
          'Cubre ISR (F11), IVA (F07), Pago a Cuenta (F14), Precios de Transferencia OCDE/BEPS (F982), ' +
          'AML/LCLDA, Dictamen Semestral Zonas Francas/Servicios Internacionales, Obligaciones Formales ' +
          '(DTE/libros) y Dictamen Fiscal SDF. Aplica a: Fiscal.',
        auditTypes: [AuditType.FISCAL],
        sections: [
          { ref: 'APF', name: 'Archivo Permanente Fiscal',                 phaseType: 'PLANNING',
            children: [
              { ref: 'APF-01', name: 'Nombramiento y Credencial CVPCPA' },
              { ref: 'APF-02', name: 'Términos del Encargo' },
              { ref: 'APF-03', name: 'Organigrama del Contribuyente' },
              { ref: 'APF-04', name: 'Declaraciones Fiscales Anteriores' },
              { ref: 'APF-05', name: 'Informes de Auditoría Fiscal Anteriores' },
              { ref: 'APF-06', name: 'Historial de Requerimientos DGII' },
              { ref: 'APF-07', name: 'Acuerdos Especiales y Resoluciones' },
              { ref: 'APF-08', name: 'Independencia — NACOT Sec. 2 / CIEPC' },
              { ref: 'APF-09', name: 'Control de Calidad del Encargo — NACOT Sec. 3' },
            ],
          },
          { ref: 'A', name: 'Planificación Fiscal',                        phaseType: 'PLANNING' },
          { ref: 'ISR', name: 'Ejecución — Impuesto Sobre la Renta (ISR)', phaseType: 'FIELDWORK',
            children: [
              { ref: 'ISR-01', name: 'Ingresos Gravados y Exentos' },
              { ref: 'ISR-02', name: 'Gastos Deducibles (Art. 28-29 LISR)' },
              { ref: 'ISR-03', name: 'Gastos No Deducibles (Art. 30 LISR)' },
              { ref: 'ISR-04', name: 'Conciliación Fiscal — Anexo 3 DGII' },
              { ref: 'ISR-05', name: 'Depreciaciones — Fiscal vs. Contable' },
              { ref: 'ISR-06', name: 'Reservas y Provisiones' },
              { ref: 'ISR-07', name: 'Pago a Cuenta Mensual (F14)' },
              { ref: 'ISR-08', name: 'Retenciones ISR Practicadas' },
              { ref: 'ISR-09', name: 'Ganancia / Pérdida de Capital' },
              { ref: 'ISR-10', name: 'Precios de Transferencia (F982)' },
            ],
          },
          { ref: 'IVA', name: 'Ejecución — IVA (Impuesto Transferencia BM)', phaseType: 'FIELDWORK',
            children: [
              { ref: 'IVA-01', name: 'Ventas / Débito Fiscal vs. Declaraciones F07' },
              { ref: 'IVA-02', name: 'Compras / Crédito Fiscal — Requisitos Art. 65' },
              { ref: 'IVA-03', name: 'Documentos Legales (CCF/DTE) — Requisitos Formales' },
              { ref: 'IVA-04', name: 'Créditos Fiscales No Deducibles (Art. 65-A)' },
              { ref: 'IVA-05', name: 'Operaciones Exentas y Proporcionalidad' },
              { ref: 'IVA-06', name: 'Retenciones y Percepciones IVA (Art. 162-163 CT)' },
              { ref: 'IVA-07', name: 'Libros de IVA — Compras y Ventas' },
            ],
          },
          { ref: 'OF', name: 'Obligaciones Formales',                       phaseType: 'FIELDWORK',
            children: [
              { ref: 'OF-01', name: 'Libros Contables — Registro y Autorización' },
              { ref: 'OF-02', name: 'Inventario — Registros y Valuación' },
              { ref: 'OF-03', name: 'DTE — Correlativo, Invalidaciones y Nulos' },
              { ref: 'OF-04', name: 'Informe Partes Relacionadas (F982)' },
              { ref: 'OF-05', name: 'Declaraciones en Tiempo (ISR/IVA/F14/F07)' },
            ],
          },
          { ref: 'AF', name: 'Análisis Especiales y Antifraude Fiscal',     phaseType: 'FIELDWORK',
            children: [
              { ref: 'AF-01', name: 'Red Flags de Evasión Fiscal (NIA 240 / ACFE)' },
              { ref: 'AF-02', name: 'Transacciones Inusuales y Testaferros' },
              { ref: 'AF-03', name: 'Evasión IVA — Compras sin CCF Válido' },
              { ref: 'AF-04', name: 'Precios de Transferencia — Paraísos Fiscales' },
              { ref: 'AF-05', name: 'CAATs Fiscales — 100% de Transacciones' },
              { ref: 'AF-06', name: 'Anti-Lavado de Activos — LCLDA / Reforma 2024' },
              { ref: 'AF-07', name: 'Precios de Transferencia — Análisis Completo OCDE/BEPS' },
              { ref: 'AF-08', name: 'Dictamen Semestral — Zonas Francas / Servicios Internacionales' },
            ],
          },
          { ref: 'D', name: 'Comunicación, Dictamen e Informe Fiscal',     phaseType: 'REPORTING' },
        ],
        papers: [
          // ── APF — Archivo Permanente Fiscal (7 papeles) ──────────────────
          { code: 'APF-01', indexSection: 'APF-01',
            title:  'Carta de Aceptación e Informe de Nombramiento — Copia del SDF (Art. 131 CT)',
            type:   WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.STANDARD },
          { code: 'APF-02', indexSection: 'APF-02',
            title:  'Credencial CVPCPA Vigente del Auditor y Socio Firmante',
            type:   WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.STANDARD },
          { code: 'APF-03', indexSection: 'APF-03',
            title:    'Carta de Encargo Fiscal — Términos del Encargo NACOT Sección 4',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART,
            paperCode: 'PT-FISC-ENCARGO' },
          { code: 'APF-04', indexSection: 'APF-04',
            title:  'Organigrama del Contribuyente y Áreas Involucradas',
            type:   WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.STANDARD },
          { code: 'APF-05', indexSection: 'APF-05',
            title:  'Declaraciones Fiscales de Períodos Anteriores (ISR F11, IVA F07, F14)',
            type:   WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.STANDARD },
          { code: 'APF-06', indexSection: 'APF-06',
            title:  'Informes de Auditoría Fiscal de Ejercicios Anteriores — Hallazgos Recurrentes',
            type:   WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.STANDARD },
          { code: 'APF-07', indexSection: 'APF-07',
            title:  'Historial de Requerimientos de la DGII al Contribuyente',
            type:   WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.STANDARD },
          { code: 'APF-08', indexSection: 'APF-08',
            title:    'Evaluación de Independencia del Auditor Fiscal — NACOT Sección 2 / CIEPC 2018',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART,
            paperCode: 'PT-FISC-INDEP' },
          { code: 'APF-09', indexSection: 'APF-09',
            title:    'Control de Calidad del Encargo Fiscal — NACOT Sección 3',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART,
            paperCode: 'PT-FISC-QC' },
          // ── A — Planificación Fiscal (7 papeles) ─────────────────────────
          { code: 'A-01', indexSection: 'A',
            title:    'Entendimiento del Contribuyente y Contexto Fiscal — NIT, Giro, ERP (Art. 131 CT)',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART,
            paperCode: 'PT-A1' },
          { code: 'A-02', indexSection: 'A',
            title:    'Evaluación del Sistema de Control Interno Tributario — por Impuesto',
            type:     WorkingPaperType.CONTROL_EVALUATION, wpKind: WpKind.SMART,
            paperCode: 'PT-A3' },
          { code: 'A-03', indexSection: 'A',
            title:    'Evaluación del Riesgo de Incumplimiento Fiscal — NIA 315 + NACOT Sección 5',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART,
            paperCode: 'PT-FISC-RISK' },
          { code: 'A-04', indexSection: 'A',
            title:    'Evaluación de Riesgo de Fraude Fiscal — Indicadores ACFE + NIA 240',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART,
            paperCode: 'PT-A2' },
          { code: 'A-05', indexSection: 'A',
            title:    'Memorando de Planificación Fiscal — Agente Cicero Fiscal',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.MASTER,
            paperCode: 'PT-MEMO' },
          { code: 'A-06', indexSection: 'A',
            title:    'Programa de Auditoría Fiscal por Impuesto — Intensidad según Riesgo',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.MASTER,
            paperCode: 'PT-PROG' },
          { code: 'A-07', indexSection: 'A',
            title:  'Presupuesto de Horas y Cronograma por Componente Fiscal',
            type:   WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.STANDARD },
          // ── ISR — Impuesto Sobre la Renta (10 papeles) ───────────────────
          { code: 'ISR-01', indexSection: 'ISR-01',
            title:    'Cédula de Ingresos Gravados y Exentos — Comparativo EEFF vs. F11 (Art. 1-2 LISR)',
            type:     WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART,
            paperCode: 'PT-B2' },
          { code: 'ISR-02', indexSection: 'ISR-02',
            title:    'Cédula de Gastos Deducibles — Matriz de Requisitos Art. 28-29 LISR',
            type:     WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART,
            paperCode: 'PT-B2' },
          { code: 'ISR-03', indexSection: 'ISR-03',
            title:    'Cédula de Gastos No Deducibles — Reclasificación y Cuantificación (Art. 30 LISR)',
            type:     WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART,
            paperCode: 'PT-B2' },
          { code: 'ISR-04', indexSection: 'ISR-04',
            title:    'Conciliación Utilidad Contable vs. Resultado Fiscal — Anexo 3 DGII',
            type:     WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.MASTER,
            paperCode: 'PT-DIFS' },
          { code: 'ISR-05', indexSection: 'ISR-05',
            title:    'Cédula de Depreciaciones — Tasas Fiscales vs. Contables (Art. 30 lit. b LISR)',
            type:     WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART,
            paperCode: 'PT-B2' },
          { code: 'ISR-06', indexSection: 'ISR-06',
            title:    'Cédula de Reservas, Provisiones y Estimaciones (Art. 29-31 LISR)',
            type:     WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART,
            paperCode: 'PT-B2' },
          { code: 'ISR-07', indexSection: 'ISR-07',
            title:    'Revisión de Pago a Cuenta Mensual (F14) — 1.75% sobre Ingresos (Art. 151 CT)',
            type:     WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART,
            paperCode: 'PT-B4' },
          { code: 'ISR-08', indexSection: 'ISR-08',
            title:    'Revisión de Retenciones ISR — Servicios 10%, Empleados, No Domiciliados (Art. 72-83)',
            type:     WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART,
            paperCode: 'PT-B2' },
          { code: 'ISR-09', indexSection: 'ISR-09',
            title:    'Ganancia / Pérdida de Capital — Tasa 10% si Posesión > 12 Meses (Art. 14-A LISR)',
            type:     WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART,
            paperCode: 'PT-B2' },
          { code: 'ISR-10', indexSection: 'ISR-10',
            title:    'Precios de Transferencia y Partes Relacionadas — Arm\'s Length (Art. 199-A CT)',
            type:     WorkingPaperType.NORMATIVE_ANALYSIS, wpKind: WpKind.SMART,
            paperCode: 'PT-B2' },
          // ── IVA — Impuesto al Valor Agregado (7 papeles) ─────────────────
          { code: 'IVA-01', indexSection: 'IVA-01',
            title:    'Cédula Comparativa Ventas / Débito Fiscal vs. Declaraciones F07 — Cuadre Triple',
            type:     WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART,
            paperCode: 'PT-B2' },
          { code: 'IVA-02', indexSection: 'IVA-02',
            title:    'Cédula de Crédito Fiscal — Verificación Requisitos Art. 65 Ley IVA',
            type:     WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART,
            paperCode: 'PT-B2' },
          { code: 'IVA-03', indexSection: 'IVA-03',
            title:    'Revisión de Requisitos Formales de CCF y DTE (Art. 107-115 CT)',
            type:     WorkingPaperType.NORMATIVE_ANALYSIS, wpKind: WpKind.SMART,
            paperCode: 'PT-B1' },
          { code: 'IVA-04', indexSection: 'IVA-04',
            title:    'Créditos Fiscales No Deducibles — Categorías Art. 65-A Ley IVA',
            type:     WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART,
            paperCode: 'PT-B2' },
          { code: 'IVA-05', indexSection: 'IVA-05',
            title:    'Análisis de Operaciones Exentas y Proporcionalidad del Crédito Fiscal',
            type:     WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART,
            paperCode: 'PT-B2' },
          { code: 'IVA-06', indexSection: 'IVA-06',
            title:    'Retenciones y Percepciones de IVA — Grandes Contribuyentes (Art. 162-163 CT)',
            type:     WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART,
            paperCode: 'PT-B2' },
          { code: 'IVA-07', indexSection: 'IVA-07',
            title:    'Verificación de Libros de IVA — Compras y Ventas vs. Declaraciones',
            type:     WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART,
            paperCode: 'PT-B4' },
          // ── OF — Obligaciones Formales (5 papeles) ───────────────────────
          { code: 'OF-01', indexSection: 'OF-01',
            title:    'Registro y Autorización de Libros Contables (Art. 435-438 CCo / CT)',
            type:     WorkingPaperType.NORMATIVE_ANALYSIS, wpKind: WpKind.SMART,
            paperCode: 'PT-B1' },
          { code: 'OF-02', indexSection: 'OF-02',
            title:    'Revisión de Registros de Inventario — Método y Valuación (Art. 142 CT)',
            type:     WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART,
            paperCode: 'PT-B1' },
          { code: 'OF-03', indexSection: 'OF-03',
            title:    'Verificación de DTE — Correlativo, Invalidaciones y Nulos (Ley DTE)',
            type:     WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART,
            paperCode: 'PT-B4' },
          { code: 'OF-04', indexSection: 'OF-04',
            title:    'Informe de Operaciones con Sujetos Relacionados (F982) — Precios de Transferencia',
            type:     WorkingPaperType.NORMATIVE_ANALYSIS, wpKind: WpKind.SMART,
            paperCode: 'PT-B1' },
          { code: 'OF-05', indexSection: 'OF-05',
            title:    'Cumplimiento de Declaraciones en Tiempo — ISR, IVA, F14, F07 (Art. 134 CT)',
            type:     WorkingPaperType.NORMATIVE_ANALYSIS, wpKind: WpKind.SMART,
            paperCode: 'PT-B4' },
          // ── AF — Análisis Especiales y Antifraude (5 papeles) ─────────────
          { code: 'AF-01', indexSection: 'AF-01',
            title:    'Análisis de Fraude Fiscal — Red Flags DGII / ACFE / NIA 240',
            type:     WorkingPaperType.DATA_ANALYSIS, wpKind: WpKind.SMART,
            paperCode: 'PT-B4' },
          { code: 'AF-02', indexSection: 'AF-02',
            title:    'Análisis de Transacciones Inusuales y Posibles Testaferros',
            type:     WorkingPaperType.DATA_ANALYSIS, wpKind: WpKind.SMART,
            paperCode: 'PT-B4' },
          { code: 'AF-03', indexSection: 'AF-03',
            title:    'Análisis de Evasión de IVA — Compras sin CCF Válido / Facturas de Favor',
            type:     WorkingPaperType.DATA_ANALYSIS, wpKind: WpKind.SMART,
            paperCode: 'PT-B4' },
          { code: 'AF-04', indexSection: 'AF-04',
            title:    'Análisis de Precios de Transferencia con Paraísos Fiscales (Art. 199-A CT)',
            type:     WorkingPaperType.DATA_ANALYSIS, wpKind: WpKind.SMART,
            paperCode: 'PT-B4' },
          { code: 'AF-05', indexSection: 'AF-05',
            title:    'CAATs Fiscales — Análisis del 100% de Transacciones (Agente Argus)',
            type:     WorkingPaperType.DATA_ANALYSIS, wpKind: WpKind.SMART,
            paperCode: 'PT-B4' },
          { code: 'AF-06', indexSection: 'AF-06',
            title:    'Análisis de Indicadores de Lavado de Activos — LCLDA / Reforma 2024 / FATF',
            type:     WorkingPaperType.DATA_ANALYSIS, wpKind: WpKind.SMART,
            paperCode: 'PT-FISC-AML' },
          { code: 'AF-07', indexSection: 'AF-07',
            title:    'Precios de Transferencia — Análisis Completo OCDE (5 Métodos / BEPS) — Art. 199-A CT',
            type:     WorkingPaperType.NORMATIVE_ANALYSIS, wpKind: WpKind.SMART,
            paperCode: 'PT-FISC-PT' },
          { code: 'AF-08', indexSection: 'AF-08',
            title:    'Dictamen Semestral — Régimen de Zona Franca y Servicios Internacionales (Art. 47.f Ley SSII)',
            type:     WorkingPaperType.NORMATIVE_ANALYSIS, wpKind: WpKind.SMART,
            paperCode: 'PT-FISC-ZF' },
          // ── D — Comunicación y Dictamen (6 papeles) ─────────────────────
          { code: 'D-01', indexSection: 'D',
            title:    'Hallazgo Fiscal — Incumplimiento Formal y/o Sustantivo',
            type:     WorkingPaperType.FINDING, wpKind: WpKind.SMART,
            paperCode: 'PT-D1' },
          { code: 'D-02', indexSection: 'D',
            title:    'Resumen de Incumplimientos Formales y Sustantivos — Anexo 12 SDF',
            type:     WorkingPaperType.FINDING, wpKind: WpKind.MASTER },
          { code: 'D-03', indexSection: 'D',
            title:    'Cédula de Diferencias Fiscales vs. Declaraciones Presentadas',
            type:     WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.MASTER,
            paperCode: 'PT-DIFS' },
          { code: 'D-04', indexSection: 'D',
            title:    'Borrador del Informe Fiscal — Agente Cicero Fiscal (Art. 129-135 CT)',
            type:     WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.MASTER,
            paperCode: 'PT-MEMO' },
          { code: 'D-05', indexSection: 'D',
            title:    'Dictamen Fiscal — Modelo Oficial NACOT Anexo 1 (3 Tipos de Opinión) — SDF 31 de Mayo',
            type:     WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.MASTER,
            paperCode: 'PT-FISC-DICT' },
          { code: 'D-06', indexSection: 'D',
            title:  'Plan de Subsanación de Incumplimientos Identificados',
            type:   WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.STANDARD },
        ],
        // ─── Grafo Fiscal SV (CT/DGII/CVPCPA) ────────────────────────────────
        links: [
          // Planificación
          { sourceCode: 'A-01', targetCode: 'A-02', sourceField: 'S1', targetField: 'S1', mappingType: 'DIRECT',       description: 'Entendimiento → SCI tributario' },
          { sourceCode: 'A-01', targetCode: 'A-05', sourceField: 'S2', targetField: 'S2', mappingType: 'AI_GENERATED', description: 'Entendimiento → Memo' },
          { sourceCode: 'A-02', targetCode: 'A-03', sourceField: 'S7', targetField: 'S1', mappingType: 'DIRECT',       description: 'SCI → Score riesgo por impuesto' },
          { sourceCode: 'A-03', targetCode: 'A-04', sourceField: 'S7', targetField: 'S6', mappingType: 'AGGREGATED',   description: 'Riesgo → Análisis fraude fiscal' },
          { sourceCode: 'A-03', targetCode: 'A-05', sourceField: 'S7', targetField: 'S4', mappingType: 'AI_GENERATED', description: 'Riesgo → Memo enfoque' },
          { sourceCode: 'A-03', targetCode: 'A-06', sourceField: 'S7', targetField: 'S2', mappingType: 'AGGREGATED',   description: 'Riesgo → Programa intensidad' },
          { sourceCode: 'A-04', targetCode: 'A-05', sourceField: 'S6', targetField: 'S5', mappingType: 'AI_GENERATED', description: 'Fraude → Memo áreas énfasis' },
          // ISR
          { sourceCode: 'ISR-01', targetCode: 'ISR-04', sourceField: 'S2', targetField: 'S1', mappingType: 'DIRECT',     description: 'Ingresos → Conciliación' },
          { sourceCode: 'ISR-02', targetCode: 'ISR-03', sourceField: 'S5', targetField: 'S1', mappingType: 'AGGREGATED', description: 'Gastos rechazados → No deducibles' },
          { sourceCode: 'ISR-03', targetCode: 'ISR-04', sourceField: 'S1', targetField: 'S2', mappingType: 'DIRECT',     description: 'No deducibles → Conciliación' },
          { sourceCode: 'ISR-05', targetCode: 'ISR-04', sourceField: 'S2', targetField: 'S4', mappingType: 'DIRECT',     description: 'Depreciaciones → Conciliación' },
          { sourceCode: 'ISR-06', targetCode: 'ISR-04', sourceField: 'S2', targetField: 'S5', mappingType: 'DIRECT',     description: 'Reservas → Conciliación' },
          { sourceCode: 'ISR-04', targetCode: 'D-03',  sourceField: 'S7', targetField: 'S1', mappingType: 'AGGREGATED', description: 'Diferencia ISR → Cédula de diferencias' },
          { sourceCode: 'ISR-08', targetCode: 'D-03',  sourceField: 'S2', targetField: 'S4', mappingType: 'AGGREGATED', description: 'Retenciones → Cédula' },
          // IVA
          { sourceCode: 'IVA-01', targetCode: 'D-03', sourceField: 'S5', targetField: 'S2', mappingType: 'AGGREGATED', description: 'Débito fiscal → Cédula' },
          { sourceCode: 'IVA-02', targetCode: 'D-03', sourceField: 'S5', targetField: 'S3', mappingType: 'AGGREGATED', description: 'Crédito fiscal → Cédula' },
          { sourceCode: 'IVA-02', targetCode: 'AF-03', sourceField: 'S2', targetField: 'S1', mappingType: 'AGGREGATED', description: 'Crédito → Análisis evasión' },
          // CAATs Fiscales
          { sourceCode: 'AF-05', targetCode: 'AF-01', sourceField: 'S1', targetField: 'S1', mappingType: 'AGGREGATED', description: 'CAATs → Red flags' },
          { sourceCode: 'AF-05', targetCode: 'IVA-01', sourceField: 'S1', targetField: 'S2', mappingType: 'AGGREGATED', description: 'CAATs → Cruce ventas' },
          { sourceCode: 'AF-05', targetCode: 'IVA-02', sourceField: 'S2', targetField: 'S1', mappingType: 'AGGREGATED', description: 'CAATs → Cruce compras' },
          { sourceCode: 'AF-01', targetCode: 'D-01',  sourceField: 'S6', targetField: 'S1', mappingType: 'AGGREGATED', description: 'Red flags → Hallazgos' },
          // Comunicación
          { sourceCode: 'D-01', targetCode: 'D-02', sourceField: 'S1', targetField: 'S1', mappingType: 'AGGREGATED', description: 'Hallazgos → Anexo 12' },
          { sourceCode: 'D-03', targetCode: 'D-04', sourceField: 'S1', targetField: 'S7', mappingType: 'AI_GENERATED', description: 'Diferencias → Informe Fiscal' },
          { sourceCode: 'D-02', targetCode: 'D-04', sourceField: 'S1', targetField: 'S10', mappingType: 'DIRECT',      description: 'Anexo 12 → Informe' },
          { sourceCode: 'D-04', targetCode: 'D-05', sourceField: 'S9', targetField: 'S3', mappingType: 'DIRECT',       description: 'Informe → Dictamen NACOT' },
          { sourceCode: 'D-01', targetCode: 'D-06', sourceField: 'S6', targetField: 'S1', mappingType: 'AGGREGATED', description: 'Hallazgos → Plan subsanación' },
          // ── v6.1 NACOT — Aceptación, Independencia y Control de Calidad ──────
          { sourceCode: 'APF-08', targetCode: 'APF-09', sourceField: 'S5', targetField: 'S1', mappingType: 'DIRECT',       description: 'Independencia → Control de Calidad' },
          { sourceCode: 'APF-08', targetCode: 'APF-03', sourceField: 'S5', targetField: 'S5', mappingType: 'DIRECT',       description: 'Independencia → Carta de Encargo' },
          { sourceCode: 'APF-08', targetCode: 'D-05',   sourceField: 'S6', targetField: 'S5', mappingType: 'AI_GENERATED', description: 'Independencia → Dictamen (declaración)' },
          { sourceCode: 'APF-09', targetCode: 'D-05',   sourceField: 'S6', targetField: 'S7', mappingType: 'DIRECT',       description: 'Control de Calidad aprueba → Dictamen' },
          { sourceCode: 'APF-03', targetCode: 'A-01',   sourceField: 'S2', targetField: 'S1', mappingType: 'AI_GENERATED', description: 'Carta de Encargo → Entendimiento' },
          // ── v6.1 — Riesgo de Incumplimiento alimenta programa y memo ────────
          { sourceCode: 'A-03',  targetCode: 'A-06',   sourceField: 'S8', targetField: 'S2', mappingType: 'AGGREGATED',   description: 'Respuesta planeada → Programa intensidad' },
          // ── v6.1 — AML y Precios de Transferencia OCDE ──────────────────────
          { sourceCode: 'AF-06', targetCode: 'AF-07',  sourceField: 'S3', targetField: 'S1', mappingType: 'AGGREGATED',   description: 'Paraísos fiscales (AML) → Precios de Transferencia' },
          { sourceCode: 'AF-06', targetCode: 'AF-01',  sourceField: 'S2', targetField: 'S1', mappingType: 'AGGREGATED',   description: 'Indicadores AML → Red flags' },
          { sourceCode: 'AF-07', targetCode: 'ISR-04', sourceField: 'S8', targetField: 'S2', mappingType: 'DIRECT',       description: 'Ajuste PT → Conciliación fiscal' },
          { sourceCode: 'AF-07', targetCode: 'D-03',   sourceField: 'S8', targetField: 'S1', mappingType: 'AGGREGATED',   description: 'Ajuste PT → Cédula de diferencias' },
          // ── v6.1 — Dictamen semestral Zonas Francas integra al anual ────────
          { sourceCode: 'AF-08', targetCode: 'D-05',   sourceField: 'S6', targetField: 'S3', mappingType: 'AI_GENERATED', description: 'Dictamen semestral → Dictamen anual' },
          // ── v6.1 — Cédula de diferencias sugiere tipo de opinión ────────────
          { sourceCode: 'D-03',  targetCode: 'D-05',   sourceField: 'S1', targetField: 'S7', mappingType: 'AI_GENERATED', description: 'Diferencias → Tipo de opinión NACOT' },
        ],
      },

      // ═══════════════════════════════════════════════════════════════════════
      // 8. Auditoría Financiera Externa v1.0 — Lead Schedules Automáticos
      //    Secciones: A (Planificación) · B-00..B-09 (EEFF + Sumarias) · C · D · E
      //    Basada en: AuditMind_FinancieroAuto_v13.0_AuditBrain.docx
      //    Incluye: Clasificador de cuentas, drill-down por sub-sumaria,
      //             análisis de variaciones automático, semáforo de opinión,
      //             libro de AJEs y rollforward cross-engagement.
      // ═══════════════════════════════════════════════════════════════════════
      {
        name: 'Auditoría Financiera Externa v1.0',
        description:
          'Plantilla especializada para Auditoría Financiera Externa con lead schedules automáticos y ' +
          'cédulas sumarias inteligentes. Importa el balance de comprobación (Excel/ERP/manual), lo ' +
          'clasifica en 24 sub-sumarias configurables, propaga saldos automáticamente a B-01..B-06, ' +
          'genera análisis de variaciones con ratios financieros (B-07), consolida diferencias con ' +
          'semáforo de opinión Verde/Amarillo/Rojo (B-08), y produce el Libro de AJEs con base ' +
          'técnica NIIF/NIA (B-09). Cumple NIA 315, 320, 330, 450, 505, 520, 700-720. ' +
          'Aplica a: Auditoría Externa, Financiera.',
        auditTypes: [AuditType.EXTERNAL, AuditType.FINANCIAL],
        sections: [
          { ref: 'A',   name: 'Planificación y Estrategia Global',        phaseType: 'PLANNING' },
          { ref: 'B',   name: 'Estados Financieros y Cédulas Sumarias',   phaseType: 'FIELDWORK',
            children: [
              { ref: 'B-00', name: 'Importación y Clasificador de Cuentas' },
              { ref: 'B-01', name: 'Activos Corrientes' },
              { ref: 'B-02', name: 'Activos No Corrientes' },
              { ref: 'B-03', name: 'Pasivos Corrientes' },
              { ref: 'B-04', name: 'Pasivos No Corrientes' },
              { ref: 'B-05', name: 'Patrimonio' },
              { ref: 'B-06', name: 'Resultados (P&G)' },
              { ref: 'B-07', name: 'Análisis de Variaciones' },
              { ref: 'B-08', name: 'Diferencias y Ajustes' },
              { ref: 'B-09', name: 'Libro de AJEs' },
            ],
          },
          { ref: 'C',   name: 'Pruebas Sustantivas por Área',             phaseType: 'FIELDWORK',
            children: [
              { ref: 'C-01', name: 'Caja y Bancos' },
              { ref: 'C-02', name: 'Cuentas por Cobrar' },
              { ref: 'C-03', name: 'Inventarios' },
              { ref: 'C-04', name: 'Activo Fijo / PP&E' },
              { ref: 'C-05', name: 'Inversiones y Valores' },
              { ref: 'C-06', name: 'Intangibles y Diferidos' },
              { ref: 'C-07', name: 'Cuentas por Pagar' },
              { ref: 'C-08', name: 'Obligaciones Financieras e Impuestos' },
              { ref: 'C-09', name: 'Pasivos No Corrientes' },
              { ref: 'C-10', name: 'Capital y Patrimonio' },
              { ref: 'C-11', name: 'Ingresos' },
              { ref: 'C-12', name: 'Costos y Gastos' },
              { ref: 'C-13', name: 'Partes Relacionadas' },
              { ref: 'C-14', name: 'Estimaciones y Provisiones' },
              { ref: 'C-15', name: 'Continuidad Operativa' },
            ],
          },
          { ref: 'D',   name: 'Cierre de la Auditoría',                   phaseType: 'REPORTING' },
          { ref: 'E',   name: 'Informe del Auditor Independiente',         phaseType: 'REPORTING' },
        ],
        papers: [
          // ── A — Planificación ──────────────────────────────────────────────
          { code: 'A-01', indexSection: 'A',
            title: 'Carta de Encargo y Términos del Trabajo (NIA 210)',
            type: WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.STANDARD },
          { code: 'A-02', indexSection: 'A',
            title: 'Evaluación de Independencia y Ética (NIA 220 / CIEPC)',
            type: WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART },
          { code: 'A-03', indexSection: 'A',
            title: 'Entendimiento de la Entidad y su Entorno (NIA 315)',
            type: WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART, paperCode: 'PT-A1' },
          { code: 'A-04', indexSection: 'A',
            title: 'Evaluación del Control Interno sobre RF (NIA 315.25)',
            type: WorkingPaperType.CONTROL_EVALUATION, wpKind: WpKind.SMART, paperCode: 'PT-A3' },
          { code: 'A-05', indexSection: 'A',
            title: 'Evaluación y Respuesta a Riesgos de Incorrección Material (NIA 315/330/240)',
            type: WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART, paperCode: 'PT-A2' },
          { code: 'A-06', indexSection: 'A',
            title: 'Cálculo de Materialidad — MG, ME, UAE (NIA 320)',
            type: WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART, paperCode: 'PT-A4' },
          { code: 'A-07', indexSection: 'A',
            title: 'Memorando de Planificación — Estrategia Global (NIA 300)',
            type: WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.MASTER, paperCode: 'PT-MEMO' },
          { code: 'A-08', indexSection: 'A',
            title: 'Programa de Auditoría por Área / Aserción (NIA 330)',
            type: WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.MASTER, paperCode: 'PT-PROG' },
          // ── B — Estados Financieros y Cédulas Sumarias ────────────────────
          { code: 'B-00', indexSection: 'B-00',
            title: 'PT-EEFF — Importación, Clasificador de Cuentas y Cédula Madre',
            type: WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART, paperCode: 'PT-FIN-B00' },
          { code: 'B-01', indexSection: 'B-01',
            title: 'Cédula Sumaria — Activos Corrientes (Lead Schedule)',
            type: WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.MASTER, paperCode: 'PT-FIN-B01' },
          { code: 'B-02', indexSection: 'B-02',
            title: 'Cédula Sumaria — Activos No Corrientes (Lead Schedule)',
            type: WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.MASTER, paperCode: 'PT-FIN-B02' },
          { code: 'B-03', indexSection: 'B-03',
            title: 'Cédula Sumaria — Pasivos Corrientes (Lead Schedule)',
            type: WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.MASTER, paperCode: 'PT-FIN-B03' },
          { code: 'B-04', indexSection: 'B-04',
            title: 'Cédula Sumaria — Pasivos No Corrientes (Lead Schedule)',
            type: WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.MASTER, paperCode: 'PT-FIN-B04' },
          { code: 'B-05', indexSection: 'B-05',
            title: 'Cédula Sumaria — Patrimonio (Lead Schedule)',
            type: WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.MASTER, paperCode: 'PT-FIN-B05' },
          { code: 'B-06', indexSection: 'B-06',
            title: 'Cédula Sumaria — Resultados P&G (Lead Schedule)',
            type: WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.MASTER, paperCode: 'PT-FIN-B06' },
          { code: 'B-07', indexSection: 'B-07',
            title: 'Análisis de Variaciones Automático — Procedimientos Analíticos (NIA 520)',
            type: WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART, paperCode: 'PT-FIN-B07' },
          { code: 'B-08', indexSection: 'B-08',
            title: 'Cédula de Diferencias y Ajustes Consolidada — Semáforo de Opinión (NIA 450)',
            type: WorkingPaperType.FINDING, wpKind: WpKind.MASTER, paperCode: 'PT-FIN-B08' },
          { code: 'B-09', indexSection: 'B-09',
            title: 'Libro de AJEs — Asientos de Ajuste con Base Técnica NIIF (NIA 450)',
            type: WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART, paperCode: 'PT-FIN-B09' },
          // ── C — Pruebas Sustantivas ────────────────────────────────────────
          { code: 'C-01', indexSection: 'C-01',
            title: 'Caja y Bancos — Conciliaciones Bancarias y Arqueo (NIA 505)',
            type: WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART, paperCode: 'PT-FIN-C-SUST' },
          { code: 'C-02', indexSection: 'C-02',
            title: 'Cuentas por Cobrar — Circularización y Antigüedad (NIA 505)',
            type: WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART, paperCode: 'PT-FIN-C-SUST' },
          { code: 'C-03', indexSection: 'C-03',
            title: 'Inventarios — Observación Conteo Físico y Valuación (NIA 501)',
            type: WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART, paperCode: 'PT-FIN-C-SUST' },
          { code: 'C-04', indexSection: 'C-04',
            title: 'Activo Fijo PP&E — Existencia, Alta/Baja y Depreciación (NIA 500)',
            type: WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART, paperCode: 'PT-FIN-C-SUST' },
          { code: 'C-05', indexSection: 'C-05',
            title: 'Inversiones y Valores — Confirmación y Valuación (NIA 501)',
            type: WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART, paperCode: 'PT-FIN-C-SUST' },
          { code: 'C-06', indexSection: 'C-06',
            title: 'Activos Intangibles y Diferidos — Valuación y Amortización (NIIF 38)',
            type: WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART, paperCode: 'PT-FIN-C-SUST' },
          { code: 'C-07', indexSection: 'C-07',
            title: 'Cuentas por Pagar — Circularización Pasivos y Búsqueda (NIA 505)',
            type: WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART, paperCode: 'PT-FIN-C-SUST' },
          { code: 'C-08', indexSection: 'C-08',
            title: 'Obligaciones Bancarias e Impuestos — Conciliación y Cumplimiento',
            type: WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART, paperCode: 'PT-FIN-C-SUST' },
          { code: 'C-09', indexSection: 'C-09',
            title: 'Pasivos de Largo Plazo — Verificación de Términos y Covenants',
            type: WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART, paperCode: 'PT-FIN-C-SUST' },
          { code: 'C-10', indexSection: 'C-10',
            title: 'Capital y Patrimonio — Verificación de Autorizaciones (NIA 500)',
            type: WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART, paperCode: 'PT-FIN-C-SUST' },
          { code: 'C-11', indexSection: 'C-11',
            title: 'Ingresos — Reconocimiento y Corte (NIIF 15 / NIA 240)',
            type: WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART, paperCode: 'PT-FIN-C-SUST' },
          { code: 'C-12', indexSection: 'C-12',
            title: 'Costos y Gastos Operativos — Análisis y Acumulación',
            type: WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART, paperCode: 'PT-FIN-C-SUST' },
          { code: 'C-13', indexSection: 'C-13',
            title: 'Partes Relacionadas — Identificación y Revelación (NIA 550)',
            type: WorkingPaperType.NORMATIVE_ANALYSIS, wpKind: WpKind.SMART, paperCode: 'PT-FIN-C-NORM' },
          { code: 'C-14', indexSection: 'C-14',
            title: 'Estimaciones Contables — Provisiones y Valor Razonable (NIA 540)',
            type: WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART, paperCode: 'PT-FIN-C-SUST' },
          { code: 'C-15', indexSection: 'C-15',
            title: 'Continuidad Operativa (NIA 570)',
            type: WorkingPaperType.NORMATIVE_ANALYSIS, wpKind: WpKind.SMART, paperCode: 'PT-FIN-C-NORM' },
          // ── D — Cierre ────────────────────────────────────────────────────
          { code: 'D-01', indexSection: 'D',
            title: 'Carta de Representación de la Administración (NIA 580)',
            type: WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.SMART },
          { code: 'D-02', indexSection: 'D',
            title: 'Carta de Debilidades de Control Interno (NIA 265)',
            type: WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.MASTER, paperCode: 'PT-FIN-D02CI' },
          { code: 'D-03', indexSection: 'D',
            title: 'Eventos Posteriores al Cierre (NIA 560)',
            type: WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.SMART },
          // ── E — Informe ───────────────────────────────────────────────────
          { code: 'E-01', indexSection: 'E',
            title: 'Informe del Auditor Independiente — Borrador (NIA 700-720)',
            type: WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.MASTER, paperCode: 'PT-FIN-DICT' },
          { code: 'E-02', indexSection: 'E',
            title: 'Informe Final con Firma Digital del Socio',
            type: WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.STANDARD },
        ],
        // ─── Grafo de conocimiento — Auditoría Financiera Externa v1.0 ──────
        links: [
          // ── A: cadena de planificación ────────────────────────────────────
          { sourceCode: 'A-03', targetCode: 'A-05', sourceField: 'S1', targetField: 'S1', mappingType: 'DIRECT',       description: 'Entendimiento → Aserciones de riesgo' },
          { sourceCode: 'A-03', targetCode: 'A-07', sourceField: 'S1', targetField: 'S2', mappingType: 'AI_GENERATED', description: 'Entendimiento → Memorando' },
          { sourceCode: 'A-04', targetCode: 'A-05', sourceField: 'S3', targetField: 'S2', mappingType: 'DIRECT',       description: 'Control interno → RIM' },
          { sourceCode: 'A-05', targetCode: 'A-07', sourceField: 'S4', targetField: 'S3', mappingType: 'AI_GENERATED', description: 'Riesgos → Memorando' },
          { sourceCode: 'A-05', targetCode: 'A-08', sourceField: 'S4', targetField: 'S1', mappingType: 'AGGREGATED',   description: 'Riesgos → Programa' },
          { sourceCode: 'A-06', targetCode: 'A-07', sourceField: 'S3', targetField: 'S4', mappingType: 'DIRECT',       description: 'Materialidad → Memorando' },
          { sourceCode: 'A-06', targetCode: 'A-08', sourceField: 'S4', targetField: 'S2', mappingType: 'AGGREGATED',   description: 'ME → Tamaños de muestra' },
          // ── A-06 → B-00 y B-08: materialidad alimenta semáforos ──────────
          { sourceCode: 'A-06', targetCode: 'B-00', sourceField: 'S3', targetField: 'S6', mappingType: 'DIRECT',       description: 'ME y MG → semáforo por cuenta en Clasificador' },
          { sourceCode: 'A-06', targetCode: 'B-08', sourceField: 'S3', targetField: 'S2', mappingType: 'DIRECT',       description: 'UAE y MG → cálculo semáforo de opinión B-08' },
          // ── B-00 → B-01..B-06: propagación de saldos ─────────────────────
          { sourceCode: 'B-00', targetCode: 'B-01', sourceField: 'S4', targetField: 'S1', mappingType: 'AGGREGATED',   description: 'Totales Activos Corrientes → Lead Schedule B-01' },
          { sourceCode: 'B-00', targetCode: 'B-02', sourceField: 'S4', targetField: 'S1', mappingType: 'AGGREGATED',   description: 'Totales Activos No Corrientes → Lead Schedule B-02' },
          { sourceCode: 'B-00', targetCode: 'B-03', sourceField: 'S4', targetField: 'S1', mappingType: 'AGGREGATED',   description: 'Totales Pasivos Corrientes → Lead Schedule B-03' },
          { sourceCode: 'B-00', targetCode: 'B-04', sourceField: 'S4', targetField: 'S1', mappingType: 'AGGREGATED',   description: 'Totales Pasivos No Corrientes → Lead Schedule B-04' },
          { sourceCode: 'B-00', targetCode: 'B-05', sourceField: 'S4', targetField: 'S1', mappingType: 'AGGREGATED',   description: 'Totales Patrimonio → Lead Schedule B-05' },
          { sourceCode: 'B-00', targetCode: 'B-06', sourceField: 'S4', targetField: 'S1', mappingType: 'AGGREGATED',   description: 'Totales Resultados → Lead Schedule B-06' },
          // ── B-00 → B-07: balance completo para análisis de variaciones ────
          { sourceCode: 'B-00', targetCode: 'B-07', sourceField: 'S1', targetField: 'S1', mappingType: 'DIRECT',       description: 'Balance 3 períodos → Análisis horizontal B-07' },
          // ── B-07 → A-08: procedimientos sugeridos → programa ──────────────
          { sourceCode: 'B-07', targetCode: 'A-08', sourceField: 'S4', targetField: 'S2', mappingType: 'AI_GENERATED', description: 'Procedimientos sugeridos por variación → Programa' },
          // ── C-01..C-15 → B-08: diferencias de ejecución → cédula consolidada
          { sourceCode: 'C-01', targetCode: 'B-08', sourceField: 'S1', targetField: 'S1', mappingType: 'AGGREGATED',   description: 'Diferencias Caja/Bancos → Cédula consolidada' },
          { sourceCode: 'C-02', targetCode: 'B-08', sourceField: 'S1', targetField: 'S1', mappingType: 'AGGREGATED',   description: 'Diferencias CxC → Cédula consolidada' },
          { sourceCode: 'C-03', targetCode: 'B-08', sourceField: 'S1', targetField: 'S1', mappingType: 'AGGREGATED',   description: 'Diferencias Inventarios → Cédula consolidada' },
          { sourceCode: 'C-04', targetCode: 'B-08', sourceField: 'S1', targetField: 'S1', mappingType: 'AGGREGATED',   description: 'Diferencias Activo Fijo → Cédula consolidada' },
          { sourceCode: 'C-07', targetCode: 'B-08', sourceField: 'S1', targetField: 'S1', mappingType: 'AGGREGATED',   description: 'Diferencias CxP → Cédula consolidada' },
          { sourceCode: 'C-08', targetCode: 'B-08', sourceField: 'S1', targetField: 'S1', mappingType: 'AGGREGATED',   description: 'Diferencias Obligaciones/Impuestos → Cédula consolidada' },
          { sourceCode: 'C-11', targetCode: 'B-08', sourceField: 'S1', targetField: 'S1', mappingType: 'AGGREGATED',   description: 'Diferencias Ingresos → Cédula consolidada' },
          { sourceCode: 'C-12', targetCode: 'B-08', sourceField: 'S1', targetField: 'S1', mappingType: 'AGGREGATED',   description: 'Diferencias Costos/Gastos → Cédula consolidada' },
          // ── B-08 → B-01..B-06: ajustes aceptados actualiz. sumarias ──────
          { sourceCode: 'B-08', targetCode: 'B-01', sourceField: 'S4', targetField: 'S1', mappingType: 'AGGREGATED',   description: 'AJEs AC → columna ajustes B-01' },
          { sourceCode: 'B-08', targetCode: 'B-02', sourceField: 'S4', targetField: 'S1', mappingType: 'AGGREGATED',   description: 'AJEs ANC → columna ajustes B-02' },
          { sourceCode: 'B-08', targetCode: 'B-03', sourceField: 'S4', targetField: 'S1', mappingType: 'AGGREGATED',   description: 'AJEs PC → columna ajustes B-03' },
          { sourceCode: 'B-08', targetCode: 'B-04', sourceField: 'S4', targetField: 'S1', mappingType: 'AGGREGATED',   description: 'AJEs PNC → columna ajustes B-04' },
          { sourceCode: 'B-08', targetCode: 'B-05', sourceField: 'S4', targetField: 'S1', mappingType: 'AGGREGATED',   description: 'AJEs Patrimonio → columna ajustes B-05' },
          { sourceCode: 'B-08', targetCode: 'B-06', sourceField: 'S4', targetField: 'S1', mappingType: 'AGGREGATED',   description: 'AJEs Resultados → columna ajustes B-06' },
          // ── B-08 → B-09: AJEs confirmados → libro formal ─────────────────
          { sourceCode: 'B-08', targetCode: 'B-09', sourceField: 'S4', targetField: 'S1', mappingType: 'DIRECT',       description: 'AJEs aceptados → Libro de AJEs B-09' },
          // ── B-08 → E-01: semáforo de opinión → dictamen ──────────────────
          { sourceCode: 'B-08', targetCode: 'E-01', sourceField: 'S3', targetField: 'S1', mappingType: 'AI_GENERATED', description: 'Semáforo de opinión → tipo de dictamen E-01' },
          { sourceCode: 'B-08', targetCode: 'E-01', sourceField: 'S9', targetField: 'S2', mappingType: 'AI_GENERATED', description: 'Narrativa del socio → párrafo de opinión E-01' },
          // ── D-01 → E-01: carta de representación confirma dictamen ────────
          { sourceCode: 'D-01', targetCode: 'E-01', sourceField: 'S1', targetField: 'S3', mappingType: 'DIRECT',       description: 'Carta de representación → dictamen (NIA 580)' },
          { sourceCode: 'D-02', targetCode: 'E-01', sourceField: 'S1', targetField: 'S2', mappingType: 'AI_GENERATED', description: 'Debilidades CI → KAM del informe (NIA 265/701)' },
        ],
      },
    ];
  }
}
