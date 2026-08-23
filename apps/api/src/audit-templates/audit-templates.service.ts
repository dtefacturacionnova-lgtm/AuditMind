import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import { AuditOriginType, AuditStatus, AuditType, WorkingPaperType, WpKind } from '@prisma/client';
import { CreateAuditTemplateDto, UpdateAuditTemplateDto } from './dto/audit-template.dto';
import { PAPER_TEMPLATES } from '../working-papers/paper-templates';
import { AuditFoldersService } from '../audit-folders/audit-folders.service';

// ─── PaperDef mirrors audit-index.service interface ──────────────────────────

interface PaperDef {
  code: string;
  indexSection: string;
  title: string;
  type: WorkingPaperType;
  wpKind: WpKind;
  paperCode?: string;
  // Comité de Auditoría: este papel, al llegar a estado terminal, marca el
  // encargo como 100% ejecutado (ver isCompletionTrigger en WorkingPaper).
  isCompletionTrigger?: boolean;
}

// ─── SectionDef — folder/subfolder structure ─────────────────────────────────

interface SectionDef {
  ref: string;
  name: string;
  phaseType: 'PLANNING' | 'FIELDWORK' | 'REPORTING' | 'FOLLOWUP';
  children?: Array<{ ref: string; name: string }>;
  // % que representa esta sección dentro del avance total del encargo para
  // el Comité de Auditoría (0-100, las secciones de una plantilla deberían
  // sumar 100). Omitir = no cuenta para el avance ponderado (ej. archivo
  // permanente, que es documentación paralela, no una fase secuencial).
  weight?: number;
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditFolders: AuditFoldersService,
  ) {}

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
          // Pesos 5/25/45/10/15 (suma 100) — esfuerzo típico sugerido, decisión
          // explícita del usuario, ya reseeded en la organización de desarrollo.
          { ref: 'APE', name: 'Archivo Permanente', phaseType: 'PLANNING', weight: 5,
            children: [
              { ref: 'APE-01', name: 'Información Legal y Estatutos' },
              { ref: 'APE-02', name: 'Estructura Organizacional' },
              { ref: 'APE-03', name: 'Evaluaciones de Riesgo Históricas' },
              { ref: 'APE-04', name: 'Informes de Auditorías Anteriores' },
              { ref: 'APE-05', name: 'Contratos y Acuerdos Clave' },
              { ref: 'APE-06', name: 'Políticas y Manuales de Control Interno' },
            ],
          },
          { ref: 'A', name: 'Planificación y Entendimiento del Negocio', phaseType: 'PLANNING',  weight: 25 },
          { ref: 'B', name: 'Ejecución y Pruebas de Campo',              phaseType: 'FIELDWORK',  weight: 45 },
          { ref: 'D', name: 'Hallazgos y Comunicaciones',                phaseType: 'REPORTING',  weight: 10 },
          { ref: 'E', name: 'Cierre e Informe de Auditoría',             phaseType: 'REPORTING',  weight: 15 },
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
            title:  'Seguimiento de Informes y Hallazgos de Auditorías Anteriores (NIA 265/315/450/510)',
            type:   WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART, paperCode: 'PT-APE04' },
          { code: 'APE-05', indexSection: 'APE-05',
            title:  'Contratos, Acuerdos de Nivel de Servicio y Compromisos Clave',
            type:   WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.STANDARD },
          { code: 'APE-06', indexSection: 'APE-06',
            title:    'Políticas Contables y Manuales de Control Interno (NIA 315 / NIC 8)',
            type:     WorkingPaperType.CONTROL_EVALUATION, wpKind: WpKind.SMART,
            paperCode: 'PT-APE06' },
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
          { code: 'A-04B', indexSection: 'A',
            title:    'Controles Generales de TI — ITGC (NIA 315 Rev. 2019)',
            type:     WorkingPaperType.CONTROL_EVALUATION, wpKind: WpKind.SMART,
            paperCode: 'PT-ITGC' },
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
          { code: 'A-07B', indexSection: 'A',
            title:    'Estrategia Global de Auditoría (NIA 300)',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART,
            paperCode: 'PT-STRAT' },
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
            type:   WorkingPaperType.INTERVIEW, wpKind: WpKind.SMART,
            paperCode: 'PT-ENTREV' },
          { code: 'B-05', indexSection: 'B',
            title:  'Papel de Soporte / Evidencia',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.STANDARD },
          // ── D — Hallazgos y Comunicaciones ──────────────────────────────
          { code: 'D-00', indexSection: 'D',
            title:    'Cédula de Seguimiento — Hallazgos Respondidos, Vigentes y Vencidos',
            type:     WorkingPaperType.FINDING, wpKind: WpKind.MASTER,
            paperCode: 'PT-HALL-RESP' },
          { code: 'D-01', indexSection: 'D',
            title:    'Hallazgo de Auditoría (5 Elementos + Seguimiento de Respuesta)',
            type:     WorkingPaperType.FINDING, wpKind: WpKind.SMART,
            paperCode: 'PT-HALL' },
          { code: 'D-02', indexSection: 'D',
            title:    'Comunicación Formal de Hallazgos al Auditado',
            type:     WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.SMART,
            paperCode: 'PT-HALL-COM' },
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
            type:   WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.STANDARD,
            paperCode: 'PT-INFORME-FINAL', isCompletionTrigger: true },
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
          '[EN DESARROLLO — para encargos financieros use "Auditoría Financiera Externa v1.0"; ' +
          'esta plantilla no tiene lead schedules automáticos (B-01..B-04 sin plantilla asignada)] ' +
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
            title:     'Carta de Encargo / Términos del Trabajo (NIA 210)',
            type:      WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART,
            paperCode: 'PT-FIN-ENCARGO' },
          { code: 'A-02', indexSection: 'A',
            title:     'Evaluación de Independencia y Ética (NIA 220 / ISA 220 Rev. / IESBA)',
            type:      WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART,
            paperCode: 'PT-INDEP' },
          { code: 'A-03', indexSection: 'A',
            title:    'Entendimiento de la Entidad y su Entorno (NIA 315)',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART,
            paperCode: 'PT-A1' },
          { code: 'A-04', indexSection: 'A',
            title:    'Evaluación del Control Interno sobre RF (NIA 315.25)',
            type:     WorkingPaperType.CONTROL_EVALUATION, wpKind: WpKind.SMART,
            paperCode: 'PT-A3' },
          { code: 'A-04b', indexSection: 'A',
            title:    'Evaluación COSO 2013 — Sistema de Control Interno (NIA 315)',
            type:     WorkingPaperType.CONTROL_EVALUATION, wpKind: WpKind.SMART,
            paperCode: 'PT-COSO' },
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
          { code: 'A-09', indexSection: 'A',
            title:    'Evaluación de Cumplimiento con Leyes y Regulaciones (NIA 250)',
            type:     WorkingPaperType.NORMATIVE_ANALYSIS, wpKind: WpKind.SMART,
            paperCode: 'PT-NIA250' },
          { code: 'A-10', indexSection: 'A',
            title:    'Plan Maestro de Muestreo Estadístico (NIA 530)',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART,
            paperCode: 'PT-NIA530' },
          { code: 'A-12', indexSection: 'A',
            title:    'Uso del Trabajo de Auditoría Interna (NIA 610)',
            type:     WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART,
            paperCode: 'PT-NIA610' },
          // ── B — Estados Financieros y Sumarias ──────────────────────────
          { code: 'B-00', indexSection: 'B-EEFF',
            title:    'PT de Estados Financieros — Cédula Madre (EEFF)',
            type:     WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART,
            paperCode: 'PT-FIN-B00' },
          { code: 'B-05', indexSection: 'B-EEFF',
            title:  'Cédula de Ajustes y Reclasificaciones',
            type:   WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART,
            paperCode: 'PT-ADJ-RECLASIF' },
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
            title:     'Caja y Bancos — Conciliaciones Bancarias (NIA 505)',
            type:      WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART,
            paperCode: 'PT-FIN-C-SUST' },
          { code: 'C-02', indexSection: 'C-02',
            title:     'Cuentas por Cobrar — Circularización (NIA 505)',
            type:      WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART,
            paperCode: 'PT-CIRC' },
          { code: 'C-03', indexSection: 'C-03',
            title:     'Inventarios — Observación de Conteo Físico (NIA 501)',
            type:      WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART,
            paperCode: 'PT-FIN-C-SUST' },
          { code: 'C-04', indexSection: 'C-04',
            title:     'Activos Fijos / Propiedad, Planta y Equipo (NIA 500)',
            type:      WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART,
            paperCode: 'PT-FIN-C-SUST' },
          { code: 'C-05', indexSection: 'C-05',
            title:     'Inversiones y Valores — Confirmación y Valuación (NIA 501)',
            type:      WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART,
            paperCode: 'PT-FIN-C-SUST' },
          { code: 'C-06', indexSection: 'C-06',
            title:     'Activos Intangibles y Gastos Diferidos (NIIF 38)',
            type:      WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART,
            paperCode: 'PT-FIN-C-SUST' },
          { code: 'C-07', indexSection: 'C-07',
            title:     'Cuentas por Pagar y Pasivos Corrientes (NIA 505)',
            type:      WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART,
            paperCode: 'PT-FIN-C-SUST' },
          { code: 'C-08', indexSection: 'C-08',
            title:     'Obligaciones Bancarias y Financieras — Conciliación (NIA 505)',
            type:      WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART,
            paperCode: 'PT-FIN-C-SUST' },
          { code: 'C-09', indexSection: 'C-09',
            title:     'Pasivos de Largo Plazo — Verificación de Términos y Garantías',
            type:      WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART,
            paperCode: 'PT-FIN-C-SUST' },
          { code: 'C-10', indexSection: 'C-10',
            title:     'Capital Contable, Reservas y Dividendos (NIA 500)',
            type:      WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART,
            paperCode: 'PT-FIN-C-SUST' },
          { code: 'C-11', indexSection: 'C-11',
            title:     'Ingresos — Reconocimiento y Corte (NIA 240 / Sec. 23 NIIF-PYMES)',
            type:      WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART,
            paperCode: 'PT-FIN-C-SUST' },
          { code: 'C-12', indexSection: 'C-12',
            title:     'Costos de Ventas y Gastos de Operación — Análisis de Variaciones',
            type:      WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART,
            paperCode: 'PT-FIN-C-SUST' },
          { code: 'C-13', indexSection: 'C-13',
            title:     'Partes Relacionadas (NIA 550)',
            type:      WorkingPaperType.NORMATIVE_ANALYSIS, wpKind: WpKind.SMART,
            paperCode: 'PT-NIA550' },
          { code: 'C-14', indexSection: 'C-14',
            title:     'Estimaciones Contables — Provisiones y Valor Razonable (NIA 540 Rev. 2019)',
            type:      WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART,
            paperCode: 'PT-FIN-C-ESTIM' },
          { code: 'C-15', indexSection: 'C-15',
            title:     'Continuidad Operativa (NIA 570)',
            type:      WorkingPaperType.NORMATIVE_ANALYSIS, wpKind: WpKind.SMART,
            paperCode: 'PT-NIA570' },
          // ── D — Cierre ───────────────────────────────────────────────────
          { code: 'D-01', indexSection: 'D',
            title:  'Carta de Representación de la Administración (NIA 580)',
            type:   WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.SMART,
            paperCode: 'PT-REP580' },
          { code: 'D-02', indexSection: 'D',
            title:    'Cédula Final de Diferencias y Ajustes (NIA 450)',
            type:     WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.MASTER,
            paperCode: 'PT-DIFS' },
          { code: 'D-03', indexSection: 'D',
            title:    'Eventos Posteriores al Cierre (NIA 560)',
            type:     WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.SMART,
            paperCode: 'PT-NIA560' },
          { code: 'D-04', indexSection: 'D',
            title:    'Carta de Debilidades de Control Interno (NIA 265)',
            type:     WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.MASTER,
            paperCode: 'PT-NIA265' },
          { code: 'D-05', indexSection: 'D',
            title:    'Comunicación con Encargados del Gobierno Corporativo (NIA 260)',
            type:     WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.SMART,
            paperCode: 'PT-NIA260' },
          { code: 'D-06', indexSection: 'D',
            title:    'Uso del Trabajo de un Experto del Auditor (NIA 620)',
            type:     WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.SMART,
            paperCode: 'PT-NIA620' },
          { code: 'D-07', indexSection: 'D',
            title:    'Hallazgo de Auditoría (5 Elementos + Seguimiento de Respuesta)',
            type:     WorkingPaperType.FINDING, wpKind: WpKind.SMART,
            paperCode: 'PT-HALL' },
          { code: 'D-08', indexSection: 'D',
            title:    'Comunicación Formal de Hallazgos al Cliente / Administración',
            type:     WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.SMART,
            paperCode: 'PT-HALL-COM' },
          { code: 'D-09', indexSection: 'D',
            title:    'Cédula de Seguimiento — Hallazgos Respondidos, Vigentes y Vencidos',
            type:     WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.MASTER,
            paperCode: 'PT-HALL-RESP' },
          // ── E — Informe ──────────────────────────────────────────────────
          { code: 'E-01', indexSection: 'E',
            title:    'Borrador del Informe del Auditor Independiente (NIA 700-720)',
            type:     WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.MASTER,
            paperCode: 'PT-FIN-DICT' },
          { code: 'E-02', indexSection: 'E',
            title:  'Informe Final con Firma Digital del Socio / CP',
            type:   WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.STANDARD },
        ],
        // ─── Grafo NIA/ISA ───────────────────────────────────────────────────
        links: [
          // Entendimiento → riesgos, memo
          { sourceCode: 'A-03', targetCode: 'A-05', sourceField: 'S1', targetField: 'S1', mappingType: 'DIRECT',       description: 'Entidad → Aserciones de riesgo' },
          { sourceCode: 'A-03', targetCode: 'A-07', sourceField: 'S1', targetField: 'S2', mappingType: 'AI_GENERATED', description: 'Entendimiento → Memo' },
          // Control interno → COSO → riesgos
          { sourceCode: 'A-04',  targetCode: 'A-04b', sourceField: 'S3', targetField: 'S1', mappingType: 'DIRECT',       description: 'Controles por área → Análisis COSO' },
          { sourceCode: 'A-04',  targetCode: 'A-05',  sourceField: 'S3', targetField: 'S2', mappingType: 'DIRECT',       description: 'CI → RIM' },
          { sourceCode: 'A-04',  targetCode: 'A-07',  sourceField: 'S3', targetField: 'S5', mappingType: 'AI_GENERATED', description: 'CI → Enfoque del Memo' },
          { sourceCode: 'A-04b', targetCode: 'A-05',  sourceField: 'S7', targetField: 'S2', mappingType: 'DIRECT',       description: 'Enfoque COSO → Respuesta a riesgos IM' },
          { sourceCode: 'A-04b', targetCode: 'A-07',  sourceField: 'S9', targetField: 'S5', mappingType: 'AI_GENERATED', description: 'Conclusión SCI → Estrategia en Memo' },
          // Riesgos → memo, programa
          { sourceCode: 'A-05', targetCode: 'A-07', sourceField: 'S4', targetField: 'S3', mappingType: 'AI_GENERATED', description: 'Riesgos → Sección RI del Memo' },
          { sourceCode: 'A-05', targetCode: 'A-08', sourceField: 'S4', targetField: 'S1', mappingType: 'AGGREGATED',   description: 'Riesgos → Procedimientos' },
          // Materialidad → memo, programa, sumarias, cierre
          { sourceCode: 'A-06', targetCode: 'A-07', sourceField: 'S3', targetField: 'S4', mappingType: 'DIRECT',       description: 'Materialidad → Memo' },
          { sourceCode: 'A-06', targetCode: 'A-08', sourceField: 'S4', targetField: 'S2', mappingType: 'AGGREGATED',   description: 'ME → Tamaños muestra' },
          { sourceCode: 'A-06', targetCode: 'D-02', sourceField: 'S3', targetField: 'S2', mappingType: 'DIRECT',       description: 'MG → Cédula final de diferencias' },
          // EEFF (B-00) alimenta sumarias via S4 (propagación automática PT-FIN-B00)
          { sourceCode: 'B-00', targetCode: 'B-01', sourceField: 'S4', targetField: 'S1', mappingType: 'AGGREGATED',   description: 'TB Activos → Sumaria Activos' },
          { sourceCode: 'B-00', targetCode: 'B-02', sourceField: 'S4', targetField: 'S1', mappingType: 'AGGREGATED',   description: 'TB Pasivos → Sumaria Pasivos' },
          { sourceCode: 'B-00', targetCode: 'B-03', sourceField: 'S4', targetField: 'S1', mappingType: 'AGGREGATED',   description: 'TB Patrimonio → Sumaria Patrimonio' },
          { sourceCode: 'B-00', targetCode: 'B-04', sourceField: 'S4', targetField: 'S1', mappingType: 'AGGREGATED',   description: 'TB Ingresos/Costos → Sumaria Resultados' },
          // Programa → pruebas C-*
          { sourceCode: 'A-08', targetCode: 'C-01', sourceField: 'S1', targetField: 'S1', mappingType: 'DIRECT',       description: 'Programa → Caja/Bancos' },
          { sourceCode: 'A-08', targetCode: 'C-02', sourceField: 'S1', targetField: 'S1', mappingType: 'DIRECT',       description: 'Programa → CxC' },
          { sourceCode: 'A-08', targetCode: 'C-03', sourceField: 'S1', targetField: 'S1', mappingType: 'DIRECT',       description: 'Programa → Inventarios' },
          // Ajustes B-05 → sumarias (Saldo Ajustado) y cédula final NIA 450
          { sourceCode: 'B-05', targetCode: 'B-01', sourceField: 'S2', targetField: 'S1', mappingType: 'AGGREGATED',   description: 'Ajustes → Sumaria Activos (Saldo Ajustado)' },
          { sourceCode: 'B-05', targetCode: 'B-02', sourceField: 'S2', targetField: 'S1', mappingType: 'AGGREGATED',   description: 'Ajustes → Sumaria Pasivos (Saldo Ajustado)' },
          { sourceCode: 'B-05', targetCode: 'B-03', sourceField: 'S2', targetField: 'S1', mappingType: 'AGGREGATED',   description: 'Ajustes → Sumaria Patrimonio (Saldo Ajustado)' },
          { sourceCode: 'B-05', targetCode: 'B-04', sourceField: 'S2', targetField: 'S1', mappingType: 'AGGREGATED',   description: 'Ajustes → Sumaria Resultados (Saldo Ajustado)' },
          { sourceCode: 'B-05', targetCode: 'D-02', sourceField: 'S3', targetField: 'S3', mappingType: 'AGGREGATED',   description: 'AJEs rechazados → Cédula final NIA 450' },
          // NIA 250 (A-09) → Memo y Programa
          { sourceCode: 'A-09', targetCode: 'A-07', sourceField: 'S5', targetField: 'S9', mappingType: 'AI_GENERATED', description: 'Cumplimiento legal → Memo' },
          { sourceCode: 'A-09', targetCode: 'A-08', sourceField: 'S3', targetField: 'S1', mappingType: 'AGGREGATED',   description: 'Incumplimientos → Programa de auditoría' },
          // NIA 530 (A-10) → Programa y C-xx
          { sourceCode: 'A-10', targetCode: 'A-08', sourceField: 'S2', targetField: 'S2', mappingType: 'DIRECT',       description: 'Plan de muestreo → Tamaños muestra en programa' },
          { sourceCode: 'A-06', targetCode: 'A-10', sourceField: 'S3', targetField: 'S1', mappingType: 'DIRECT',       description: 'Materialidad → Parámetros de muestreo' },
          // NIA 610 (A-12) → Programa y evaluación CI
          { sourceCode: 'A-12', targetCode: 'A-08', sourceField: 'S6', targetField: 'S5', mappingType: 'DIRECT',       description: 'Uso AI interna → Ajuste alcance programa' },
          { sourceCode: 'A-04', targetCode: 'A-12', sourceField: 'S1', targetField: 'S1', mappingType: 'DIRECT',       description: 'Evaluación CI → Evaluación función AI' },
          // NIA 560 (D-03) → Informe
          { sourceCode: 'D-03', targetCode: 'E-01', sourceField: 'S5', targetField: 'S3', mappingType: 'AI_GENERATED', description: 'Hechos posteriores → Párrafo énfasis/modificación opinión' },
          // NIA 260 (D-05) → Informe
          { sourceCode: 'D-05', targetCode: 'E-01', sourceField: 'S3', targetField: 'S2', mappingType: 'AI_GENERATED', description: 'Asuntos significativos → Informe' },
          // Carta debilidades alimenta informe y D-05
          { sourceCode: 'D-04', targetCode: 'E-01', sourceField: 'S1', targetField: 'S2', mappingType: 'AI_GENERATED', description: 'Debilidades CI → Informe' },
          { sourceCode: 'D-04', targetCode: 'D-05', sourceField: 'S1', targetField: 'S4', mappingType: 'DIRECT',       description: 'Debilidades CI → Comunicación TCWG' },
          // NIA 620 (D-06) → Informe y TCWG
          { sourceCode: 'D-06', targetCode: 'E-01', sourceField: 'S4', targetField: 'S2', mappingType: 'AI_GENERATED', description: 'Evaluación trabajo experto → Informe' },
          { sourceCode: 'D-06', targetCode: 'D-05', sourceField: 'S5', targetField: 'S3', mappingType: 'DIRECT',       description: 'Conclusión experto → Asuntos significativos TCWG' },
          { sourceCode: 'D-02', targetCode: 'E-01', sourceField: 'S1', targetField: 'S3', mappingType: 'AI_GENERATED', description: 'Diferencias → Opinión del Informe' },
          // Carta de Representación
          { sourceCode: 'B-05', targetCode: 'D-01', sourceField: 'S3', targetField: 'S6', mappingType: 'DIRECT',       description: 'AJEs rechazados → Representaciones' },
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
            title:    'Cédula de Seguimiento — Hallazgos Respondidos, Vigentes y Vencidos',
            type:     WorkingPaperType.FINDING, wpKind: WpKind.MASTER,
            paperCode: 'PT-HALL-RESP' },
          { code: 'COM-H01', indexSection: 'COM',
            title:    'Hallazgo de Auditoría Gubernamental — 5 Elementos (NAIG Art. 130-145)',
            type:     WorkingPaperType.FINDING, wpKind: WpKind.SMART,
            paperCode: 'PT-GOV-HAL' },
          { code: 'COM-H02', indexSection: 'COM',
            title:    'Comunicación Formal de Hallazgos al Auditado (NAIG Art. 145-149)',
            type:     WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.SMART,
            paperCode: 'PT-HALL-COM' },
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
          // ── D — Hallazgos Forenses (5 papeles) ──────────────────────────
          { code: 'D-01', indexSection: 'D',
            title:    'Cédula de Seguimiento — Hallazgos Respondidos, Vigentes y Vencidos',
            type:     WorkingPaperType.FINDING, wpKind: WpKind.MASTER,
            paperCode: 'PT-HALL-RESP' },
          { code: 'D-02', indexSection: 'D',
            title:    'Hallazgo Forense — 5 Elementos + Seguimiento',
            type:     WorkingPaperType.FINDING, wpKind: WpKind.SMART,
            paperCode: 'PT-HALL' },
          { code: 'D-03', indexSection: 'D',
            title:    'Evaluación de Controles que Fallaron o Fueron Eludidos',
            type:     WorkingPaperType.FINDING, wpKind: WpKind.SMART,
            paperCode: 'PT-D1' },
          { code: 'D-04', indexSection: 'D',
            title:  'Matriz de Responsabilidades y Perpetradores Identificados',
            type:   WorkingPaperType.FINDING, wpKind: WpKind.MASTER },
          { code: 'D-05', indexSection: 'D',
            title:    'Comunicación Formal de Hallazgos Forenses al Contratante',
            type:     WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.SMART,
            paperCode: 'PT-HALL-COM' },
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
          // ── D — Hallazgos e Informe (5 papeles) ─────────────────────────
          { code: 'D-01', indexSection: 'D',
            title:    'Cédula de Seguimiento — Hallazgos Respondidos, Vigentes y Vencidos',
            type:     WorkingPaperType.FINDING, wpKind: WpKind.MASTER,
            paperCode: 'PT-HALL-RESP' },
          { code: 'D-02', indexSection: 'D',
            title:    'Hallazgo de Seguridad — 5 Elementos + Plan de Remediación',
            type:     WorkingPaperType.FINDING, wpKind: WpKind.SMART,
            paperCode: 'PT-HALL' },
          { code: 'D-03', indexSection: 'D',
            title:    'Comunicación Formal de Hallazgos de Seguridad al Responsable TI / Dirección',
            type:     WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.SMART,
            paperCode: 'PT-HALL-COM' },
          { code: 'D-04', indexSection: 'D',
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
          // ── D — Hallazgos e Informe (5 papeles) ─────────────────────────
          { code: 'D-01', indexSection: 'D',
            title:    'Cédula de Seguimiento — Hallazgos / Incumplimientos Respondidos y Vencidos',
            type:     WorkingPaperType.FINDING, wpKind: WpKind.MASTER,
            paperCode: 'PT-HALL-RESP' },
          { code: 'D-02', indexSection: 'D',
            title:    'Hallazgo / Incumplimiento ALD — 5 Elementos + Seguimiento',
            type:     WorkingPaperType.FINDING, wpKind: WpKind.SMART,
            paperCode: 'PT-HALL' },
          { code: 'D-03', indexSection: 'D',
            title:    'Comunicación Formal de Hallazgos ALD al Oficial de Cumplimiento / Dirección',
            type:     WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.SMART,
            paperCode: 'PT-HALL-COM' },
          { code: 'D-04', indexSection: 'D',
            title:    'Informe ALD — Formato CVPCPA Guía V3 (Resolución 129/2022)',
            type:     WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.MASTER,
            paperCode: 'PT-MEMO' },
          { code: 'D-05', indexSection: 'D',
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
          // ── D — Hallazgos, Comunicación y Dictamen (9 papeles) ──────────
          { code: 'D-01', indexSection: 'D',
            title:    'Cédula de Seguimiento — Incumplimientos Respondidos, Vigentes y Vencidos',
            type:     WorkingPaperType.FINDING, wpKind: WpKind.MASTER,
            paperCode: 'PT-HALL-RESP' },
          { code: 'D-02', indexSection: 'D',
            title:    'Hallazgo Fiscal — Incumplimiento Formal y/o Sustantivo (5 Elementos)',
            type:     WorkingPaperType.FINDING, wpKind: WpKind.SMART,
            paperCode: 'PT-HALL' },
          { code: 'D-03', indexSection: 'D',
            title:    'Comunicación Previa de Hallazgos Fiscales (Art. 133 CT / NACOT Sec. 6.3)',
            type:     WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.SMART,
            paperCode: 'PT-HALL-COM' },
          { code: 'D-04', indexSection: 'D',
            title:    'Resumen de Incumplimientos Formales y Sustantivos — Anexo 12 SDF',
            type:     WorkingPaperType.FINDING, wpKind: WpKind.MASTER },
          { code: 'D-05', indexSection: 'D',
            title:    'Cédula de Diferencias Fiscales vs. Declaraciones Presentadas',
            type:     WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.MASTER,
            paperCode: 'PT-DIFS' },
          { code: 'D-06', indexSection: 'D',
            title:    'Borrador del Informe Fiscal — Agente Cicero Fiscal (Art. 129-135 CT)',
            type:     WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.MASTER,
            paperCode: 'PT-MEMO' },
          { code: 'D-07', indexSection: 'D',
            title:    'Dictamen Fiscal — Modelo Oficial NACOT Anexo 1 (3 Tipos de Opinión) — SDF 31 de Mayo',
            type:     WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.MASTER,
            paperCode: 'PT-FISC-DICT' },
          { code: 'D-08', indexSection: 'D',
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
          { ref: 'APE', name: 'Archivo Permanente del Cliente',            phaseType: 'PLANNING',
            children: [
              { ref: 'APE-01', name: 'Escrituras, NIT y Matrículas' },
              { ref: 'APE-02', name: 'Organigrama y Estructura Societaria' },
              { ref: 'APE-03', name: 'Carta de Encargo y Confirmaciones Previas' },
              { ref: 'APE-04', name: 'Informes de Auditorías Anteriores' },
              { ref: 'APE-05', name: 'Contratos y Compromisos Clave' },
              { ref: 'APE-06', name: 'Políticas Contables y Manuales CI' },
            ],
          },
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
          { ref: 'F',   name: 'Cierre del Encargo y Control de Calidad',   phaseType: 'REPORTING' },
        ],
        papers: [
          // ── APE — Archivo Permanente ─────────────────────────────────────
          { code: 'APE-01', indexSection: 'APE-01',
            title: 'Escrituras de Constitución, NIT y Matrículas',
            type: WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.STANDARD },
          { code: 'APE-02', indexSection: 'APE-02',
            title: 'Organigrama y Estructura Societaria',
            type: WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.STANDARD },
          { code: 'APE-03', indexSection: 'APE-03',
            title: 'Carta de Encargo y Confirmaciones de Años Anteriores',
            type: WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.STANDARD },
          { code: 'APE-04', indexSection: 'APE-04',
            title: 'Seguimiento de Informes y Hallazgos de Auditorías Anteriores (NIA 265/315/450/510)',
            type: WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART, paperCode: 'PT-APE04' },
          { code: 'APE-05', indexSection: 'APE-05',
            title: 'Contratos y Compromisos Clave (arrendamientos, créditos, etc.)',
            type: WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.STANDARD },
          { code: 'APE-06', indexSection: 'APE-06',
            title: 'Políticas Contables y Manuales de Control Interno (NIA 315 / NIC 8)',
            type: WorkingPaperType.CONTROL_EVALUATION, wpKind: WpKind.SMART,
            paperCode: 'PT-APE06' },
          // ── A — Planificación ──────────────────────────────────────────────
          { code: 'A-01', indexSection: 'A',
            title: 'Carta de Encargo y Términos del Trabajo (NIA 210)',
            type: WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART, paperCode: 'PT-FIN-ENCARGO' },
          { code: 'A-02', indexSection: 'A',
            title: 'Evaluación de Independencia y Ética (NIA 220 / CIEPC)',
            type: WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART, paperCode: 'PT-INDEP' },
          { code: 'A-03', indexSection: 'A',
            title: 'Conocimiento del Cliente y su Entorno (NIA 315)',
            type: WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART, paperCode: 'PT-FIN-A3-KC' },
          { code: 'A-04', indexSection: 'A',
            title: 'Evaluación del Control Interno sobre RF (NIA 315.25)',
            type: WorkingPaperType.CONTROL_EVALUATION, wpKind: WpKind.SMART, paperCode: 'PT-A3' },
          { code: 'A-04B', indexSection: 'A',
            title: 'Controles Generales de TI — ITGC (NIA 315 Rev. 2019 / ISA 402)',
            type: WorkingPaperType.CONTROL_EVALUATION, wpKind: WpKind.SMART, paperCode: 'PT-ITGC' },
          { code: 'A-04C', indexSection: 'A',
            title: 'Evaluación COSO 2013 — Sistema de Control Interno (5 Comp. / 17 Prin.)',
            type: WorkingPaperType.CONTROL_EVALUATION, wpKind: WpKind.SMART, paperCode: 'PT-COSO' },
          { code: 'A-05', indexSection: 'A',
            title: 'Evaluación y Respuesta a Riesgos de Incorrección Material (NIA 315/330/240)',
            type: WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART, paperCode: 'PT-A2' },
          { code: 'A-05B', indexSection: 'A',
            title: 'Matriz Integrada RMM — Consolidación RI + RC (NIA 315.32)',
            type: WorkingPaperType.CONTROL_EVALUATION, wpKind: WpKind.SMART, paperCode: 'PT-A5' },
          { code: 'A-06', indexSection: 'A',
            title: 'Cálculo de Materialidad — MG, ME, UAE (NIA 320)',
            type: WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART, paperCode: 'PT-A4' },
          { code: 'A-06B', indexSection: 'A',
            title: 'Estrategia Global de Auditoría (NIA 300)',
            type: WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART, paperCode: 'PT-STRAT' },
          { code: 'A-07', indexSection: 'A',
            title: 'Memorando de Planificación — Estrategia Global (NIA 300)',
            type: WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.MASTER, paperCode: 'PT-MEMO' },
          { code: 'A-08', indexSection: 'A',
            title: 'Programa de Auditoría por Área / Aserción (NIA 330)',
            type: WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.MASTER, paperCode: 'PT-PROG' },
          { code: 'A-08B', indexSection: 'A',
            title: 'Matriz de Riesgo, Control e Impacto — Drill-down por Riesgo (MRCI)',
            type: WorkingPaperType.CONTROL_EVALUATION, wpKind: WpKind.MASTER, paperCode: 'PT-MRCI' },
          { code: 'A-09', indexSection: 'A',
            title: 'Plan Maestro de Muestreo Estadístico (NIA 530)',
            type: WorkingPaperType.PLANNING_UNDERSTANDING, wpKind: WpKind.SMART, paperCode: 'PT-NIA530' },
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
            type: WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART, paperCode: 'PT-CIRC' },
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
            type: WorkingPaperType.NORMATIVE_ANALYSIS, wpKind: WpKind.SMART, paperCode: 'PT-NIA550' },
          { code: 'C-14', indexSection: 'C-14',
            title: 'Estimaciones Contables — Provisiones y Valor Razonable (NIA 540)',
            type: WorkingPaperType.SUBSTANTIVE_TEST, wpKind: WpKind.SMART, paperCode: 'PT-FIN-C-ESTIM' },
          { code: 'C-15', indexSection: 'C-15',
            title: 'Continuidad Operativa (NIA 570)',
            type: WorkingPaperType.NORMATIVE_ANALYSIS, wpKind: WpKind.SMART, paperCode: 'PT-NIA570' },
          // ── D — Cierre ────────────────────────────────────────────────────
          { code: 'D-01', indexSection: 'D',
            title: 'Carta de Representación de la Administración (NIA 580)',
            type: WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.SMART, paperCode: 'PT-REP580' },
          { code: 'D-02', indexSection: 'D',
            title: 'Carta de Debilidades de Control Interno (NIA 265)',
            type: WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.MASTER, paperCode: 'PT-NIA265' },
          { code: 'D-03', indexSection: 'D',
            title: 'Eventos Posteriores al Cierre (NIA 560)',
            type: WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.SMART, paperCode: 'PT-NIA560' },
          { code: 'D-05', indexSection: 'D',
            title: 'Comunicación con Encargados del Gobierno Corporativo (NIA 260)',
            type: WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.SMART, paperCode: 'PT-NIA260' },
          { code: 'D-06', indexSection: 'D',
            title: 'Uso del Trabajo de un Experto del Auditor (NIA 620)',
            type: WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.SMART, paperCode: 'PT-NIA620' },
          { code: 'D-07', indexSection: 'D',
            title: 'Hallazgo de Auditoría (5 Elementos + Seguimiento de Respuesta)',
            type: WorkingPaperType.FINDING, wpKind: WpKind.SMART, paperCode: 'PT-HALL' },
          { code: 'D-08', indexSection: 'D',
            title: 'Comunicación Formal de Hallazgos al Cliente / Administración',
            type: WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.SMART, paperCode: 'PT-HALL-COM' },
          { code: 'D-09', indexSection: 'D',
            title: 'Cédula de Seguimiento — Hallazgos Respondidos, Vigentes y Vencidos',
            type: WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.MASTER, paperCode: 'PT-HALL-RESP' },
          // ── E — Informe ───────────────────────────────────────────────────
          { code: 'E-01', indexSection: 'E',
            title: 'Informe del Auditor Independiente — Borrador (NIA 700-720)',
            type: WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.MASTER, paperCode: 'PT-FIN-DICT' },
          { code: 'E-02', indexSection: 'E',
            title: 'Informe Final con Firma Digital del Socio',
            type: WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.STANDARD },
          // ── F — Cierre del Encargo y Control de Calidad ─────────────────────
          { code: 'F-01', indexSection: 'F',
            title: 'Lista de Verificación de Cumplimiento',
            type: WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.SMART, paperCode: 'PT-COMP-CHK' },
          { code: 'F-02', indexSection: 'F',
            title: 'Revisión del Control de Calidad del Encargo',
            type: WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.SMART, paperCode: 'PT-EQR' },
          { code: 'F-03', indexSection: 'F',
            title: 'Asuntos para Revisiones Futuras',
            type: WorkingPaperType.CLOSURE_CONCLUSION, wpKind: WpKind.SMART, paperCode: 'PT-CARRYFWD' },
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
          // ── A-05B/A-04C/A-08B → A-07: RMM, control interno y riesgo residual → memo ──
          { sourceCode: 'A-05B', targetCode: 'A-07', sourceField: 'S2,S4', targetField: 'S5b,S3b', mappingType: 'DIRECT',       description: 'RMM por área y riesgos pervasivos → Resumen RMM y respuesta general del Memorando' },
          { sourceCode: 'A-04C', targetCode: 'A-07', sourceField: 'S6,S7', targetField: 'S3c',      mappingType: 'AI_GENERATED', description: 'Conclusión SCI COSO → Conclusión de Control Interno del Memorando' },
          { sourceCode: 'A-08B', targetCode: 'A-07', sourceField: 'S4',    targetField: 'S4b',      mappingType: 'AI_GENERATED', description: 'Conclusión de riesgo residual MRCI → Impacto en el dictamen del Memorando' },
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
          // ── D-05/D-06 → E-01 y entre sí (agregados junto con los papeles) ──
          { sourceCode: 'D-05', targetCode: 'E-01', sourceField: 'S3', targetField: 'S2', mappingType: 'AI_GENERATED', description: 'Asuntos significativos TCWG → Informe' },
          { sourceCode: 'D-06', targetCode: 'E-01', sourceField: 'S4', targetField: 'S2', mappingType: 'AI_GENERATED', description: 'Evaluación trabajo experto → Informe' },
          { sourceCode: 'D-06', targetCode: 'D-05', sourceField: 'S5', targetField: 'S3', mappingType: 'DIRECT',       description: 'Conclusión experto → Asuntos significativos TCWG' },
        ],
      },
    ];
  }

  // ─── Demo Audit ───────────────────────────────────────────────────────────────
  /**
   * Crea una auditoría de demostración completamente poblada que muestra
   * el flujo completo de la plantilla "Auditoría Financiera Externa v1.0":
   *   - 20 cuentas balanceadas en B-00 (S1)
   *   - Clasificador con sub-sumarias SV (S2)
   *   - Semáforo automático vs. MG/ME (S6)
   *   - Papeles A-03, A-04, A-05, A-06 con datos realistas
   *   - C-01 (Caja y Bancos) como prueba sustantiva de ejemplo
   *   - E-01 con dictamen limpio
   *
   * Idempotente: si ya existe, retorna el ID sin recrear nada.
   */
  async createDemoAudit(user: AuthUser): Promise<{ auditId: string; created: boolean; message: string }> {
    // ── Idempotency check ───────────────────────────────────────────────────
    const existing = await this.prisma.audit.findFirst({
      where: {
        organizationId: user.organizationId,
        title: 'Empresa Comercial Demo SA de CV — Auditoría EEFF 2024',
      },
      select: { id: true },
    });
    if (existing) {
      // Reset expediente: unlink papers first (FK has no SetNull cascade), then delete phases
      await this.prisma.workingPaper.updateMany({
        where: { auditId: existing.id },
        data:  { folderId: null },
      });
      await this.prisma.auditPhase.deleteMany({ where: { auditId: existing.id } });
      await this.auditFolders.initializeFromAuditTemplateSections(existing.id, user);
      return { auditId: existing.id, created: false, message: 'Demo ya existe — expediente reinicializado con secciones A/B/C/D/E.' };
    }

    // ── 1. AuditEntity demo ──────────────────────────────────────────────────
    let entity = await this.prisma.auditEntity.findFirst({
      where: { organizationId: user.organizationId, name: 'Empresa Comercial Demo SA de CV' },
      select: { id: true },
    });
    if (!entity) {
      entity = await this.prisma.auditEntity.create({
        data: {
          organizationId:  user.organizationId,
          name:            'Empresa Comercial Demo SA de CV',
          description:     'Entidad de demostración del sistema AuditMind. Empresa mediana del sector comercio mayorista (El Salvador). NIT: 0614-010185-101-7.',
          entityType:      'COMPANY',
          sector:          'Comercio al por mayor de mercancías generales',
          responsible:     'Lic. Roberto Morales — Gerente Financiero',
          location:        'San Salvador, El Salvador',
          inherentRiskScore: 60,
          active:          true,
        },
        select: { id: true },
      });
    }

    // ── 2. Find template ─────────────────────────────────────────────────────
    await this.ensureSystemTemplates(user.organizationId, user.id);
    const template = await this.prisma.auditTemplate.findFirst({
      where: { organizationId: user.organizationId, name: 'Auditoría Financiera Externa v1.0' },
    });
    if (!template) {
      throw new NotFoundException(
        'Plantilla "Auditoría Financiera Externa v1.0" no encontrada. Ejecute POST /audit-templates/reseed-system primero.',
      );
    }

    // ── 3. Create the Audit ──────────────────────────────────────────────────
    const audit = await this.prisma.audit.create({
      data: {
        organizationId:          user.organizationId,
        title:                   'Empresa Comercial Demo SA de CV — Auditoría EEFF 2024',
        type:                    AuditType.EXTERNAL_FINANCIAL,
        status:                  AuditStatus.CLOSED,
        originType:              AuditOriginType.UNPLANNED_MANAGEMENT,
        auditEntityId:           entity.id,
        leadAuditorId:           user.id,
        startDate:               new Date('2025-01-15'),
        endDate:                 new Date('2025-03-28'),
        auditPeriodStart:        new Date('2024-01-01'),
        auditPeriodEnd:          new Date('2024-12-31'),
        reportIssuanceDate:      new Date('2025-04-05'),
        estimatedHours:          480,
        actualHours:             465,
        methodology:             'SUBSTANTIVE_FOCUS',
        scope:                   'Auditoría de los estados financieros de Empresa Comercial Demo SA de CV correspondientes al ejercicio terminado el 31 de diciembre de 2024, incluyendo el Balance General, Estado de Resultados, Estado de Cambios en el Patrimonio y Estado de Flujos de Efectivo, de conformidad con las Normas Internacionales de Auditoría (NIA) y normativa CVPCPA El Salvador.',
        objectives:              'Emitir una opinión independiente sobre si los estados financieros presentan razonablemente, en todos los aspectos materiales, la situación financiera, el rendimiento financiero y los flujos de efectivo de la entidad de acuerdo con las NIIF para PYMES adoptadas por el CVPCPA.',
        materiality:             150000,
        materialityExecution:    90000,
        materialityAccumulation: 75000,
        materialityBase:         'INGRESOS_TOTALES',
        materialityBaseAmount:   5000000,
        auditOpinion:            'SATISFACTORY',
        templateId:              template.id,
        // Documentación de la solicitud imprevista (ejemplo demo)
        requestedByName:         'Lic. Héctor Martínez Fuentes',
        requestedByRole:         'Presidente — Comité de Auditoría',
        requestDate:             new Date('2024-12-05'),
        requestReason:           'El Comité de Auditoría acordó en sesión del 05/12/2024 (Acta CA-2024-08) solicitar la realización de una auditoría de estados financieros externos correspondiente al ejercicio 2024, debido al vencimiento del contrato con el auditor externo anterior y la necesidad de presentar estados financieros auditados a la entidad bancaria antes del 30 de abril de 2025 (condición del préstamo LP vigente).',
        requestAntecedents:      'Antecedentes: (1) El contrato con el despacho anterior (Auditores Asociados SA) venció el 31/08/2024 y no fue renovado. (2) El préstamo LP con Banco Agrícola ($450,000 vigente) establece en la cláusula 8.3 la obligación de presentar EEFF auditados antes del 30 de abril de cada año. (3) La empresa no cuenta con función de auditoría interna que pueda realizar esta función. (4) El Comité evaluó tres propuestas de firmas auditoras y seleccionó la firma actual mediante proceso competitivo. Resolución CA-2024-08, aprobada por unanimidad.',
      },
    });

    // Lead auditor to team
    await this.prisma.auditTeam.upsert({
      where:  { auditId_userId: { auditId: audit.id, userId: user.id } },
      create: { auditId: audit.id, userId: user.id, role: 'LEAD' },
      update: { role: 'LEAD' },
    });

    // ── 4. Scaffold papers ──────────────────────────────────────────────────
    const paperDefs = (template.papers as unknown as Array<{
      code: string; indexSection: string; title: string;
      type: WorkingPaperType; wpKind: WpKind; paperCode?: string;
    }>);

    const paperIdMap = new Map<string, string>(); // code → wp.id

    for (const def of paperDefs) {
      const wp = await this.prisma.workingPaper.create({
        data: {
          auditId:      audit.id,
          code:         def.code,
          indexSection: def.indexSection,
          title:        def.title,
          type:         def.type,
          wpKind:       def.wpKind,
          paperCode:    def.paperCode ?? null,
          preparedById: user.id,
          status:       'SIGNED_OFF' as any,
          preparedAt:   new Date('2025-03-20'),
          reviewedAt:   new Date('2025-03-25'),
          signedOffAt:  new Date('2025-03-28'),
        },
      });
      paperIdMap.set(def.code, wp.id);
      if (def.paperCode) paperIdMap.set(def.paperCode, wp.id);

      if (def.paperCode && (def.wpKind === WpKind.SMART || def.wpKind === WpKind.MASTER)) {
        const tpl = PAPER_TEMPLATES[def.paperCode];
        if (tpl?.length) {
          await this.prisma.paperSection.createMany({
            data: tpl.map((t) => ({
              paperId:      wp.id,
              sectionKey:   t.sectionKey,
              label:        t.label,
              description:  t.description  ?? null,
              fieldType:    t.fieldType,
              value:        (t.defaultValue ?? null) as any,
              options:      (t.options      ?? [])   as any,
              isRequired:   t.isRequired,
              isAutoFilled: t.isAutoFilled,
              sourceRef:    t.sourceRef     ?? null,
              sortOrder:    t.sortOrder,
              aiHint:       t.aiHint        ?? null,
            })),
            skipDuplicates: true,
          });
        }
      }
    }

    // ── 5. Populate sections ─────────────────────────────────────────────────
    await this._populateDemoSections(audit.id, paperIdMap);

    // ── 6. Create a demo finding ─────────────────────────────────────────────
    const c01Id = paperIdMap.get('C-01');
    await this.prisma.finding.create({
      data: {
        auditId:            audit.id,
        organizationId:     user.organizationId,
        workingPaperId:     c01Id,
        title:              'Diferencia en Conciliación Bancaria — Banco BAC cuenta 001-123456-7',
        severity:           'LOW',
        status:             'CLOSED',
        condition:          'Al 31 de diciembre de 2024, la conciliación bancaria de la cuenta corriente 001-123456-7 del Banco BAC Credomatic presentó una partida en conciliación pendiente por $3,200, correspondiente a un cheque girado el 28 de diciembre de 2024 que no fue presentado al cobro dentro del período.',
        criteria:           'Las políticas contables de la entidad establecen que las conciliaciones bancarias deben prepararse mensualmente y las partidas en conciliación con antigüedad mayor a 30 días deben investigarse. NIA 505 — Confirmaciones Externas. NIIF para PYMES Sección 7 — Estado de Flujos de Efectivo.',
        cause:              'El cheque No. 0012547 fue girado a favor del proveedor Distribuidora El Sol SA de CV el 28 de diciembre de 2024 por pago de facturas. El beneficiario lo presentó al cobro el 8 de enero de 2025, posterior al cierre del período.',
        effect:             'La partida en conciliación de $3,200 es inferior al Umbral de Ajuste Específico (UAE = $7,500) establecido en la hoja de materialidad A-06, por lo que no constituye una incorrección material. La cuenta bancaria no requiere ajuste.',
        risk:               'Bajo — la partida es inferior al UAE y quedó conciliada en el período siguiente.',
        recommendation:     '1. Documentar la partida en la conciliación bancaria de enero 2025 y verificar el cobro efectivo. 2. Reforzar la política de entrega de cheques para evitar demoras entre giro y entrega al beneficiario.',
        normativeReference: 'NIA 505 — Confirmaciones Externas / NIIF para PYMES Sección 7',
        isMaterial:         false,
        effectAmount:       3200,
        dueDate:            new Date('2025-06-30'),
        closedAt:           new Date('2025-04-05'),
        aiDraftUsed:        false,
        qualityScore:       85,
      },
    });

    // ── 7. Initialize expediente using the audit template's A/B/C/D/E sections
    await this.auditFolders.initializeFromAuditTemplateSections(audit.id, user);

    this.logger.log(`[Demo] Auditoría demo creada: ${audit.id} para org ${user.organizationId}`);
    return { auditId: audit.id, created: true, message: 'Auditoría demo creada exitosamente.' };
  }

  // ─── Private: populate demo sections ──────────────────────────────────────

  private async _populateDemoSections(
    auditId:    string,
    paperIdMap: Map<string, string>,
  ): Promise<void> {
    const upd = async (paperId: string | undefined, sectionKey: string, value: unknown) => {
      if (!paperId) return;
      await this.prisma.paperSection.updateMany({
        where: { paperId, sectionKey },
        data:  { value: value as any },
      });
    };

    // ── Demo data constants ──────────────────────────────────────────────────
    const trialBalanceRows = [
      { cuenta: '1101', descripcion: 'Caja General',                      saldo_actual:  15000,   saldo_anterior:  12000,   saldo_anterior2: 10000  },
      { cuenta: '1102', descripcion: 'Bancos BAC Credomatic',             saldo_actual:  320000,  saldo_anterior:  280000,  saldo_anterior2: 240000 },
      { cuenta: '1201', descripcion: 'Clientes Comerciales',              saldo_actual:  850000,  saldo_anterior:  720000,  saldo_anterior2: 650000 },
      { cuenta: '1202', descripcion: 'Documentos por Cobrar',             saldo_actual:  120000,  saldo_anterior:  95000,   saldo_anterior2: 80000  },
      { cuenta: '1301', descripcion: 'Inventario de Mercadería',          saldo_actual:  680000,  saldo_anterior:  620000,  saldo_anterior2: 580000 },
      { cuenta: '1501', descripcion: 'Mobiliario y Equipo de Oficina',    saldo_actual:  420000,  saldo_anterior:  420000,  saldo_anterior2: 380000 },
      { cuenta: '1502', descripcion: '(-) Dep. Acumulada Mob. y Equipo',  saldo_actual: -180000,  saldo_anterior: -150000,  saldo_anterior2: -120000},
      { cuenta: '1601', descripcion: 'Gastos Diferidos (seguros 2025)',   saldo_actual:  25000,   saldo_anterior:  30000,   saldo_anterior2: 28000  },
      { cuenta: '2101', descripcion: 'Proveedores Nacionales',            saldo_actual: -380000,  saldo_anterior: -340000,  saldo_anterior2: -300000},
      { cuenta: '2102', descripcion: 'Préstamos Bancarios CP',            saldo_actual: -250000,  saldo_anterior: -200000,  saldo_anterior2: -180000},
      { cuenta: '2201', descripcion: 'IVA por Pagar',                     saldo_actual: -95000,   saldo_anterior: -85000,   saldo_anterior2: -75000 },
      { cuenta: '2202', descripcion: 'Retenciones ISSS / AFP / ISR',      saldo_actual: -28000,   saldo_anterior: -24000,   saldo_anterior2: -22000 },
      { cuenta: '2301', descripcion: 'Préstamos Bancarios LP',            saldo_actual: -450000,  saldo_anterior: -500000,  saldo_anterior2: -540000},
      { cuenta: '3101', descripcion: 'Capital Social',                    saldo_actual: -500000,  saldo_anterior: -500000,  saldo_anterior2: -500000},
      { cuenta: '3201', descripcion: 'Utilidades Retenidas Inicio Año',   saldo_actual: -277000,  saldo_anterior: -186000,  saldo_anterior2: -116000},
      { cuenta: '4101', descripcion: 'Ventas de Mercadería',              saldo_actual: -5000000, saldo_anterior: -4500000, saldo_anterior2: -4100000},
      { cuenta: '5101', descripcion: 'Costo de Ventas',                   saldo_actual:  3200000, saldo_anterior:  2900000, saldo_anterior2: 2650000},
      { cuenta: '6101', descripcion: 'Gastos de Ventas y Distribución',   saldo_actual:  800000,  saldo_anterior:  720000,  saldo_anterior2: 660000 },
      { cuenta: '6201', descripcion: 'Gastos de Administración y RRHH',   saldo_actual:  550000,  saldo_anterior:  500000,  saldo_anterior2: 460000 },
      { cuenta: '6301', descripcion: 'Gastos Financieros e Intereses',    saldo_actual:  180000,  saldo_anterior:  130000,  saldo_anterior2: 115000 },
    ];

    // Auto-assign sub_sumarias by SV code ranges
    const svRanges = [
      { from: 1100, to: 1199, sub: 'B-01a', grupo: 'Activos Corrientes'    },
      { from: 1200, to: 1299, sub: 'B-01b', grupo: 'Activos Corrientes'    },
      { from: 1300, to: 1399, sub: 'B-01c', grupo: 'Activos Corrientes'    },
      { from: 1500, to: 1699, sub: 'B-02a', grupo: 'Activos No Corrientes' },
      { from: 2100, to: 2299, sub: 'B-03a', grupo: 'Pasivos Corrientes'    },
      { from: 3000, to: 3999, sub: 'B-05a', grupo: 'Patrimonio'            },
      { from: 4000, to: 4999, sub: 'B-06a', grupo: 'Resultados'            },
      { from: 5000, to: 5999, sub: 'B-06b', grupo: 'Resultados'            },
      { from: 6000, to: 6999, sub: 'B-06c', grupo: 'Resultados'            },
    ];

    const accountMappingRows = trialBalanceRows.map((r) => {
      const code = parseInt(r.cuenta, 10);
      // 2301 → manually reclassify to B-04a Pasivos No Corrientes
      if (r.cuenta === '2301') {
        return { ...r, sub_sumaria: 'B-04a', grupo: 'Pasivos No Corrientes' };
      }
      const range = svRanges.find((rg) => code >= rg.from && code <= rg.to);
      return { ...r, sub_sumaria: range?.sub ?? 'B-01d', grupo: range?.grupo ?? 'Otros' };
    });

    const MG = 150000;
    const ME =  90000;
    const totalAbs = trialBalanceRows.reduce((s, r) => s + Math.abs(r.saldo_actual), 0);

    const semaforoRows = accountMappingRows.map((r) => {
      const abs = Math.abs(r.saldo_actual);
      const semaforo: 'ROJO' | 'AMARILLO' | 'VERDE' =
        abs > MG ? 'ROJO' : abs >= ME ? 'AMARILLO' : 'VERDE';
      const enfoque =
        semaforo === 'ROJO'
          ? 'Pruebas sustantivas extensas — confirmación externa, arqueo o corte'
          : semaforo === 'AMARILLO'
          ? 'Procedimientos analíticos + sustantivos focalizados'
          : 'Procedimientos analíticos suficientes';
      return {
        cuenta:       r.cuenta,
        descripcion:  r.descripcion,
        saldo_actual: r.saldo_actual,
        pct_total:    totalAbs > 0 ? Math.round((abs / totalAbs) * 10000) / 100 : 0,
        sub_sumaria:  r.sub_sumaria,
        semaforo,
        enfoque,
      };
    });

    // ── Sub-sumaria totals ───────────────────────────────────────────────────
    const subSumariaMap: Record<string, { saldo_actual: number; saldo_anterior: number; grupo: string }> = {};
    for (const r of accountMappingRows) {
      if (!subSumariaMap[r.sub_sumaria]) {
        subSumariaMap[r.sub_sumaria] = { saldo_actual: 0, saldo_anterior: 0, grupo: r.grupo };
      }
      subSumariaMap[r.sub_sumaria].saldo_actual   += r.saldo_actual;
      subSumariaMap[r.sub_sumaria].saldo_anterior += r.saldo_anterior;
    }
    const subSumariaTotals = Object.entries(subSumariaMap).map(([sub, v]) => ({
      sub_sumaria: sub, grupo: v.grupo, saldo_actual: v.saldo_actual, saldo_anterior: v.saldo_anterior,
      variacion: v.saldo_actual - v.saldo_anterior,
      variacion_pct: v.saldo_anterior !== 0 ? Math.round(((v.saldo_actual - v.saldo_anterior) / Math.abs(v.saldo_anterior)) * 10000) / 100 : null,
    }));

    // ── A-03: Entendimiento del Negocio (PT-A1) ──────────────────────────────
    const a03Id = paperIdMap.get('A-03');
    await upd(a03Id, 'S1',
      'Razón Social: Empresa Comercial Demo SA de CV\nNIT: 0614-010185-101-7 | NRC: 123456-7\nDomicilio Fiscal: Colonia Escalón, Calle La Mascota No. 245, San Salvador\nEjercicio Auditado: 1 de enero al 31 de diciembre de 2024\nFecha de Cierre Contable: 31 de diciembre de 2024\nRepresentante Legal: Lic. Carlos Eduardo Pérez Martínez\nContacto Financiero: Lic. Roberto Morales — Gerente Financiero / Tel. 2222-3333');
    await upd(a03Id, 'S2',
      'Empresa Comercial Demo SA de CV es una sociedad anónima de capital variable constituida en El Salvador en 1998. Su actividad principal es el comercio al por mayor de productos de consumo masivo, ferretería y electrodomésticos, con distribución a más de 300 clientes activos en los departamentos de San Salvador, La Libertad y Sonsonate.\n\nPrincipales líneas de negocio:\n• Importación y distribución de electrodomésticos (45% de ingresos)\n• Distribución de productos de ferretería (35% de ingresos)\n• Productos de consumo y hogar (20% de ingresos)\n\nLa empresa tiene 12 años de relación comercial ininterrumpida con Proveedor Global Corp y mantiene una participación de mercado estimada en el 8% del segmento mayorista de la Zona Central.');
    await upd(a03Id, 'S3',
      'Marcos normativos aplicables:\n• Contabilidad: NIIF para las PYMES (adoptadas por el CVPCPA mediante Resolución 129/2022)\n• Auditoría: NIA (Normas Internacionales de Auditoría) vigentes\n• Tributario: Código Tributario DL 230/2000, Ley ISR DL 134/1991, Ley IVA DL 296/1992\n• Societario: Código de Comercio de El Salvador — SA de CV\n• Laboral: Código de Trabajo, Ley del Seguro Social, Sistema de Ahorro para Pensiones (SAP)\n• No tiene obligaciones en mercado de valores. No es entidad regulada por la SSF.');
    await upd(a03Id, 'S4',
      'ERP: ODOO 16 Community implementado en enero 2023 (migración desde Excel). Módulos activos: Contabilidad, Inventario, Compras, Ventas, Facturación Electrónica DTE. Base de datos: PostgreSQL 14. Servidor: hosting compartido con backup semanal.\n\nRiesgos TI relevantes:\n• Ausencia de control de versiones en el ERP — actualizaciones manuales sin ambiente de pruebas\n• Backups semanales (no diarios) — riesgo de pérdida de hasta 7 días de transacciones\n• Sin segregación de funciones completa en el módulo contable — el Contador puede crear y aprobar asientos\n• Facturación Electrónica (DTE) integrada con DGII mediante conector hacienda.gob.sv');
    await upd(a03Id, 'S5',
      'Estructura organizacional:\n• Junta General de Accionistas (reunión anual)\n• Gerencia General: Lic. Carlos Pérez (Director y Gerente General)\n• Gerencia Financiera: Lic. Roberto Morales (supervisa Contabilidad y Tesorería)\n• Contabilidad: Lcda. Ana Flores (Contadora General) + 2 auxiliares\n• Ventas: 8 ejecutivos de ventas y distribución\n• Bodega: 12 empleados (recepción, despacho, inventario)\n• Total empleados: 47\n\nNo existe función de Auditoría Interna. El Comité de Auditoría está integrado por 2 socios minoritarios.');
    await upd(a03Id, 'S6',
      'Cambios significativos en 2024:\n1. Ampliación de bodega: en marzo 2024 se arrendó un nuevo local de 800 m² en Soyapango para aumentar la capacidad de almacenamiento (+40%). Inversión en estanterías y equipo: $42,000.\n2. Nuevo proveedor principal: incorporación de Electrotek Internacional como proveedor de electrodomésticos (facturación 2024: $850,000), reemplazando parcialmente a Distribuidora Regional.\n3. Implementación de crédito automatizado: en julio 2024 se implementó un módulo de scoring de crédito básico en ODOO para las cuentas por cobrar. Sin cambios en política contable de reconocimiento.\n4. Cambio de contador: en agosto 2024 renunció el Contador anterior (Sr. Marco López, 8 años en la empresa) y fue reemplazado por Lcda. Ana Flores.');
    await upd(a03Id, 'S7',
      'Historial de auditorías anteriores:\n• 2023: Auditoría de EEFF ejecutada por el mismo despacho. Opinión sin modificaciones. Tres observaciones de control interno: (1) falta de segregación en módulo contable — en proceso de mejora, (2) inventario con diferencias en conteo vs. sistema — corregido en 2024 con inventario trimestral, (3) conciliaciones bancarias con retraso — mejorado a proceso mensual.\n• 2022: Auditoría de EEFF por despacho anterior (Auditores Asociados SA). Opinión sin modificaciones. Observación: cuentas por cobrar sin política de provisión documentada — corregida en 2023.');
    await upd(a03Id, 'S8',
      'Factores externos relevantes en 2024:\n• Inflación en El Salvador: 2.8% promedio anual (BCR). Impacto moderado en costos de importación.\n• Tipo de cambio: El Salvador utiliza dólar estadounidense como moneda oficial — sin riesgo cambiario en transacciones locales. Proveedores internacionales facturan en USD.\n• Sector comercio mayorista: crecimiento sectorial estimado en 5.2% (DIGESTYC). La empresa creció 11.1% en ingresos, superando el promedio sectorial.\n• Tasa de interés activa promedio: 7.8% (BCR) — afecta el costo de los préstamos bancarios de la empresa.\n• Sin contingencias regulatorias conocidas. Sin litigios laborales activos de cuantía material.');

    // ── A-04: Control Interno (PT-A3) — Ciclo de Tesorería ──────────────────
    const a04Id = paperIdMap.get('A-04');
    await upd(a04Id, 'S1', 'Ciclo de Tesorería — Caja y Bancos');
    await upd(a04Id, 'S2', [
      { num: 1, descripcion: 'Autorización de desembolsos por Gerencia Financiera (>$1,000)',  tipo: 'Preventivo',  frecuencia: 'Por transacción', responsable: 'Gerente Financiero',      riesgo: 'Desembolsos no autorizados' },
      { num: 2, descripcion: 'Conciliaciones bancarias mensuales independientes del cajero',   tipo: 'Detectivo',   frecuencia: 'Mensual',          responsable: 'Contador General',       riesgo: 'Diferencias no detectadas' },
      { num: 3, descripcion: 'Fondo de caja chica con límite de $500 y arqueo quincenal',     tipo: 'Preventivo',  frecuencia: 'Quincenal',        responsable: 'Cajero + Contabilidad',  riesgo: 'Malversación de fondos' },
      { num: 4, descripcion: 'Firma dual en cheques mayores a $5,000',                        tipo: 'Preventivo',  frecuencia: 'Por transacción', responsable: 'Gerente General + GF',   riesgo: 'Emisión de cheques no autorizados' },
      { num: 5, descripcion: 'Revisión semanal de extractos bancarios por Gerencia',          tipo: 'Detectivo',   frecuencia: 'Semanal',          responsable: 'Gerente Financiero',      riesgo: 'Transacciones no autorizadas' },
    ]);
    await upd(a04Id, 'S3', [
      { control: 1, tecnica: 'Inspección',    muestra: 24, periodo: 'Ene-Dic 2024', resultado: 'Sin excepciones — 24/24 desembolsos >$1,000 con autorización firmada del GF' },
      { control: 2, tecnica: 'Rejecución',    muestra: 6,  periodo: 'Ene-Jun 2024', resultado: 'Conciliaciones correctas — diferencia max $200 en partidas en tránsito documentadas' },
      { control: 3, tecnica: 'Observación',   muestra: 2,  periodo: 'Oct-Nov 2024', resultado: '1 excepción: arqueo de octubre con diferencia de $45 (ver S4)' },
      { control: 4, tecnica: 'Inspección',    muestra: 15, periodo: 'Ene-Dic 2024', resultado: 'Sin excepciones — 15/15 cheques >$5,000 con firma dual' },
      { control: 5, tecnica: 'Inspección',    muestra: 12, periodo: 'Ene-Dic 2024', resultado: 'Sin excepciones — revisiones documentadas con evidencia de firma del GF' },
    ]);
    await upd(a04Id, 'S4',
      'Excepción en Control #3 — Arqueo de Caja Chica (Octubre 2024):\nEn el arqueo realizado el 15 de octubre de 2024, se detectó una diferencia de $45 entre el efectivo físico y el saldo contable del fondo de caja chica. Según indagación con el cajero, el faltante correspondía a un adelanto informal para compra de insumos de oficina que no había sido voucherizado. El faltante fue reintegrado el mismo día.\n\nCalificación de la excepción: Aislada, de cuantía no material ($45 vs. UAE=$7,500). No afecta la evaluación global del control. Se recomienda reforzar la política de voucherización inmediata en caja chica.');
    await upd(a04Id, 'S5', 'BAJO');
    await upd(a04Id, 'S6', 'MODERADO');
    await upd(a04Id, 'S7',
      'Dado que el RC del ciclo de Tesorería se evaluó como BAJO (controles efectivos con una sola excepción aislada de cuantía no material), el RD requerido es MODERADO. Esto significa:\n\n• Para Caja y Bancos (C-01): se aplicarán confirmaciones bancarias de las cuentas principales, conciliación al 31/12/2024 y arqueo sorpresivo de caja chica — alcance moderado de pruebas sustantivas.\n• No se amplía el muestreo de transacciones de caja más allá de los 30 ítems planificados.\n• Se mantiene el tamaño de muestra para conciliaciones bancarias en 2 meses (diciembre + mes adicional de alto riesgo).');
    await upd(a04Id, 'S8',
      'Los controles del ciclo de Tesorería son efectivos en su operación. La única excepción identificada (diferencia de $45 en caja chica) es de naturaleza aislada y cuantía inmaterial. Se depositó un nivel BAJO de confianza en los controles, lo que reduce los procedimientos sustantivos requeridos en el área de Caja y Bancos.\n\nDeficiencia comunicable (NIA 265): La excepción en caja chica no constituye deficiencia significativa por su cuantía. Se recomendará mejora en la política de voucherización en la carta de debilidades D-02.');

    // ── A-05: Riesgos (PT-A2) ────────────────────────────────────────────────
    const a05Id = paperIdMap.get('A-05');
    await upd(a05Id, 'S1', [
      { area: 'Caja y Bancos',         proceso: 'Tesorería',     materiala: true  },
      { area: 'Cuentas por Cobrar',    proceso: 'Ventas/CxC',    materiala: true  },
      { area: 'Inventarios',           proceso: 'Compras/Bodega', materiala: true  },
      { area: 'Activos Fijos',         proceso: 'Administración', materiala: true  },
      { area: 'Pasivos Financieros',   proceso: 'Tesorería',     materiala: true  },
      { area: 'Ingresos/Costos',       proceso: 'Ventas',        materiala: true  },
    ]);
    await upd(a05Id, 'S2', [
      { cuenta: '1101/1102', saldo: 335000,  moneda: 'USD', afirmaciones: 'Existencia, Completitud, Valuación, Presentación' },
      { cuenta: '1201/1202', saldo: 970000,  moneda: 'USD', afirmaciones: 'Existencia, Completitud, Valuación (neto de provisiones), Corte' },
      { cuenta: '1301',      saldo: 680000,  moneda: 'USD', afirmaciones: 'Existencia, Completitud, Valuación (FIFO/PMP), Propiedad' },
      { cuenta: '1501/1502', saldo: 240000,  moneda: 'USD', afirmaciones: 'Existencia, Valuación (neto dep.), Presentación' },
      { cuenta: '2101/2102', saldo: -630000, moneda: 'USD', afirmaciones: 'Completitud, Exactitud, Corte, Clasificación' },
      { cuenta: '4101/5101', saldo: -1800000,moneda: 'USD', afirmaciones: 'Ocurrencia, Completitud, Corte, Medición' },
    ]);
    await upd(a05Id, 'S3',
      'CUENTAS POR COBRAR (RI: ALTO)\nFactores que incrementan el RI: (1) El cambio de sistema ERP en 2023 generó diferencias históricas entre el módulo de cartera y contabilidad que requirieron ajustes manuales. (2) El cambio de contador en agosto 2024 aumenta el riesgo de errores en la aplicación de la política de provisiones. (3) La cartera incluye clientes con montos superiores a $50,000 que concentran el 65% del saldo.\n\nINVENTARIOS (RI: ALTO)\nFactores: (1) Alta rotación de productos con precios volátiles de importación. (2) El sistema de inventario en ODOO tuvo diferencias en el primer año de implementación. (3) Ampliación de bodega en 2024 con nuevos procesos de recepción no maduros.\n\nCAJA Y BANCOS (RI: BAJO)\nControles robustos. Sin cambios sistémicos. Historial limpio.');
    await upd(a05Id, 'S4', [
      { area: 'Cuentas por Cobrar', score: 4, nivel: 'ALTO',   base: 'Cambio contador, concentración cartera, migración ERP' },
      { area: 'Inventarios',        score: 4, nivel: 'ALTO',   base: 'Precios volátiles, nuevo proceso bodega, implementación ODOO' },
      { area: 'Ingresos',           score: 3, nivel: 'MEDIO',  base: 'Riesgo de corte de ventas / reconocimiento anticipado' },
      { area: 'Caja y Bancos',      score: 2, nivel: 'BAJO',   base: 'Controles robustos, historial limpio' },
      { area: 'Activos Fijos',      score: 2, nivel: 'BAJO',   base: 'Movimientos mínimos, tasas de depreciación estables' },
      { area: 'Pasivos',            score: 3, nivel: 'MEDIO',  base: 'Préstamos con covenants — riesgo de reclasificación CP/LP' },
    ]);
    await upd(a05Id, 'S5', [
      { riesgo: 'Sobrevaluación de inventario por costo desactualizado', area: 'Inventarios', probabilidad: 'MEDIA', impacto: 'ALTO', respuesta: 'Prueba de inventario físico + verificación de costos de importación' },
      { riesgo: 'Reconocimiento de ingresos en período incorrecto (corte)', area: 'Ingresos', probabilidad: 'MEDIA', impacto: 'ALTO', respuesta: 'Prueba de corte de ventas — últimos 15 días del año' },
      { riesgo: 'Incobrabilidad no provisionada en cartera de clientes', area: 'CxC', probabilidad: 'MEDIA', impacto: 'MEDIO', respuesta: 'Análisis de antigüedad + circularización de saldos >$20,000' },
      { riesgo: 'Reclasificación CP/LP en préstamos bancarios', area: 'Pasivos', probabilidad: 'BAJA', impacto: 'MEDIO', respuesta: 'Revisión de contratos de crédito y cuotas a vencer' },
    ]);
    await upd(a05Id, 'S6',
      'Riesgos significativos identificados conforme NIA 315:\n\n1. CORTE DE INGRESOS — Riesgo de que las ventas de diciembre se registren en enero o viceversa. Requiere procedimiento específico: prueba de corte documentando los 20 últimos registros de ventas del año y los 20 primeros de enero 2025.\n\n2. VALUACIÓN DE INVENTARIO — El cambio de proveedor principal en 2024 (Electrotek Internacional) implica costos de importación distintos a los históricos. Se realizará prueba de comparación entre factura de importación y costo unitario en sistema.\n\nEstos dos riesgos recibirán procedimientos adicionales independientemente de la evaluación de controles.');
    await upd(a05Id, 'S7',
      'Evaluación del Triángulo del Fraude (ACFE) — 2024:\n\nPRESIÓN: Moderada. La empresa creció 11.1% en ingresos vs. 8% planificado. No se identifican presiones de deuda inminente. El nuevo préstamo LP de $500,000 tiene covenants de cobertura de intereses que podrían generar incentivo de manipulación si la utilidad cae.\n\nOPORTUNIDAD: Moderada. La ausencia de función de Auditoría Interna y la segregación incompleta en el módulo contable de ODOO generan oportunidades. El cambio de contador en agosto 2024 (período de transición) es un factor de riesgo adicional.\n\nRACIONALIZACIÓN: Baja. La empresa tiene cultura de cumplimiento tributario documentada. Sin antecedentes de fraude.\n\nConclusión: Riesgo de fraude bajo-moderado. Sin indicadores específicos que justifiquen procedimientos especiales de NIA 240 más allá de los ya planificados.');
    await upd(a05Id, 'S8', 'MODERADO');

    // ── A-06: Materialidad (PT-A4) ───────────────────────────────────────────
    const a06Id = paperIdMap.get('A-06');
    await upd(a06Id, 'S1',  'INGRESOS_TOTALES');
    await upd(a06Id, 'S1b', 5000000);
    await upd(a06Id, 'S2',  3);
    await upd(a06Id, 'S3',  150000);
    await upd(a06Id, 'S4',  90000);
    await upd(a06Id, 'S5',  7500);
    await upd(a06Id, 'S6',
      'Justificación del criterio elegido:\n\nBase elegida: INGRESOS TOTALES ($5,000,000)\nPorcentaje aplicado: 3%\n\nRationale:\n• La empresa es una distribuidora comercial. Sus ingresos son la métrica principal de dimensión del negocio para los usuarios de los estados financieros (socios, bancos, proveedores). Los activos totales no son tan representativos dado que gran parte del activo es inventario, cuya valuación depende de las propias estimaciones del cliente.\n• La utilidad antes de impuestos ($270,000) es volátil y relativamente pequeña como proporción de los activos. Si se usara 5% sobre utilidad = $13,500, lo que parece muy conservador dada la dimensión del negocio.\n• El rango NIA 320 para ingresos es 1%-3%. Se elige 3% (límite superior) porque los controles del ciclo de Tesorería son robustos (RC=Bajo) y el entorno regulatorio no exige materialidad más estricta.\n\nMG = $5,000,000 × 3% = $150,000\nME = $150,000 × 60% = $90,000 (aplicamos 60% en lugar del 75% estándar dado el RI moderado en inventarios y CxC).\nUAE = $150,000 × 5% = $7,500');
    await upd(a06Id, 'S7',
      'Comparación con período anterior:\nMG 2023: $135,000 (3% sobre ingresos de $4,500,000)\nMG 2024: $150,000 (3% sobre ingresos de $5,000,000)\n\nVariación: +$15,000 (+11.1%) — directamente proporcional al crecimiento de ingresos. La variación es razonable y no requiere ajuste de enfoque. No hay cambio en metodología de cálculo. El mismo porcentaje del 3% fue aplicado en el período anterior, manteniendo consistencia (NIA 320.A14).');

    // ── B-00: Cédula Madre (PT-FIN-B00) ─────────────────────────────────────
    const b00Id = paperIdMap.get('B-00');
    await upd(b00Id, 'S0', 'INGRESOS_TOTALES');
    await upd(b00Id, 'S1', trialBalanceRows);
    await upd(b00Id, 'S2', accountMappingRows);
    await upd(b00Id, 'S3', true);
    await upd(b00Id, 'S4', subSumariaTotals);
    await upd(b00Id, 'S5',
      'ALERTAS DEL BALANCE DE COMPROBACIÓN:\n\n⚠️ CUENTAS POR COBRAR ($850,000): Incremento del 18.1% vs. año anterior ($720,000). Supera el crecimiento de ingresos (11.1%), lo que sugiere posible deterioro en recuperación de cartera. Verificar con C-02 (circularización y análisis de antigüedad).\n\n⚠️ INVENTARIO ($680,000): Incremento del 9.7% vs. año anterior ($620,000), en línea con el crecimiento de ventas. Sin embargo, la ampliación de bodega en marzo 2024 puede haber generado diferencias en el recuento. Verificar con C-03 (observación de inventario físico).\n\n✅ PASIVOS FINANCIEROS ($700,000 total): La deuda total disminuyó de $700,000 a $700,000 (sin cambio neto), aunque el LP bajó de $500,000 a $450,000 mientras el CP subió de $200,000 a $250,000. Verificar clasificación CP/LP de los préstamos con C-08.\n\n📊 RESULTADO NETO: Utilidad estimada $270,000 (+45.2% vs. año anterior $186,000) — crecimiento positivo consistente con la expansión del negocio.');
    await upd(b00Id, 'S6', semaforoRows);
    await upd(b00Id, 'S7',
      'ANÁLISIS GLOBAL — Empresa Comercial Demo SA de CV — 2024\n\nSe aplicó el procedimiento analítico de Cédula Madre conforme NIA 520. El balance de comprobación al 31 de diciembre de 2024 totaliza correctamente (débitos = créditos = $7,160,000). Se identificaron 20 cuentas.\n\nDistribución del semáforo NIA 320:\n• ROJO (>MG $150,000): 15 cuentas — requieren pruebas sustantivas extensas\n• AMARILLO (ME $90,000 - MG $150,000): 2 cuentas (1202 Documentos por Cobrar, 2201 IVA por Pagar) — analíticas + sustantivas focalizadas\n• VERDE (<ME $90,000): 3 cuentas (1101 Caja, 1601 Gastos Diferidos, 2202 Retenciones) — analíticas suficientes\n\nLas 5 cuentas con mayor exposición material son: Ventas ($5M), Costo de Ventas ($3.2M), Clientes ($850K), Inventario ($680K) y Gastos de Ventas ($800K). Estas cuentas representan el 94.3% del total absoluto y recibirán procedimientos sustantivos prioritarios.');
    await upd(b00Id, 'S8', [
      { cuenta: '1101', descripcion: 'Caja General',              saldo_actual: 15000,   saldo_anterior: 12000,   variacion: 3000,   variacion_pct: 25.0,  ajuste_propuesto: 0 },
      { cuenta: '1102', descripcion: 'Bancos BAC Credomatic',     saldo_actual: 320000,  saldo_anterior: 280000,  variacion: 40000,  variacion_pct: 14.3,  ajuste_propuesto: 0 },
      { cuenta: '1201', descripcion: 'Clientes Comerciales',      saldo_actual: 850000,  saldo_anterior: 720000,  variacion: 130000, variacion_pct: 18.1,  ajuste_propuesto: 0 },
      { cuenta: '1301', descripcion: 'Inventario de Mercadería',  saldo_actual: 680000,  saldo_anterior: 620000,  variacion: 60000,  variacion_pct: 9.7,   ajuste_propuesto: 0 },
      { cuenta: '4101', descripcion: 'Ventas de Mercadería',      saldo_actual: -5000000,saldo_anterior: -4500000,variacion: -500000,variacion_pct: 11.1,  ajuste_propuesto: 0 },
      { cuenta: '5101', descripcion: 'Costo de Ventas',           saldo_actual: 3200000, saldo_anterior: 2900000, variacion: 300000, variacion_pct: 10.3,  ajuste_propuesto: 0 },
    ]);
    await upd(b00Id, 'S9', {
      balance_general: {
        activos_corrientes:     { saldo: 1985000, saldo_anterior: 1727000 },
        activos_no_corrientes:  { saldo: 265000,  saldo_anterior: 300000  },
        total_activos:          { saldo: 2250000, saldo_anterior: 2027000 },
        pasivos_corrientes:     { saldo: 753000,  saldo_anterior: 649000  },
        pasivos_no_corrientes:  { saldo: 450000,  saldo_anterior: 500000  },
        total_pasivos:          { saldo: 1203000, saldo_anterior: 1149000 },
        patrimonio:             { saldo: 777000,  saldo_anterior: 686000  },
        total_pasivos_patrimonio:{ saldo: 2250000, saldo_anterior: 2027000},
      },
      estado_resultados: {
        ingresos:               { saldo: 5000000, saldo_anterior: 4500000 },
        costo_ventas:           { saldo: 3200000, saldo_anterior: 2900000 },
        utilidad_bruta:         { saldo: 1800000, saldo_anterior: 1600000 },
        gastos_operativos:      { saldo: 1530000, saldo_anterior: 1350000 },
        utilidad_operacional:   { saldo: 270000,  saldo_anterior: 250000  },
        gastos_financieros:     { saldo: 180000,  saldo_anterior: 130000  },
        utilidad_antes_isr:     { saldo: 270000,  saldo_anterior: 186000  },
      },
    });

    // ── C-01: Caja y Bancos (PT-FIN-C-SUST) ─────────────────────────────────
    const c01Id = paperIdMap.get('C-01');
    await upd(c01Id, 'S1', 'C-01 · Caja y Bancos — Conciliaciones y Arqueo\nRef. B-00 S6: Cuentas 1101 y 1102 | Saldo total: $335,000');
    await upd(c01Id, 'S2', [
      { procedimiento: 'Confirmación bancaria externa',       objetivo: 'Existencia y exactitud de saldos bancarios al 31/12/2024',          responsable: 'Socio a cargo',    fecha_ejecucion: '2025-01-20', estado: 'Completado' },
      { procedimiento: 'Rejecución de conciliación bancaria', objetivo: 'Verificar la conciliación bancaria al 31/12/2024',                   responsable: 'Auditor Senior',  fecha_ejecucion: '2025-02-05', estado: 'Completado' },
      { procedimiento: 'Arqueo de caja chica',                objetivo: 'Verificar existencia de efectivo en caja al momento del arqueo',     responsable: 'Auditor Junior',  fecha_ejecucion: '2025-01-22', estado: 'Completado' },
      { procedimiento: 'Análisis de transacciones inusuales', objetivo: 'Identificar transacciones fuera de patrón en diciembre 2024',        responsable: 'Auditor Senior',  fecha_ejecucion: '2025-02-10', estado: 'Completado' },
    ]);
    await upd(c01Id, 'S3', [
      { hallazgo: 'Confirmación bancaria BAC Credomatic',  resultado: 'CONFORME',   monto_confirmado: 320000, diferencia: 0,   explicacion: 'El banco confirmó el saldo de $320,000 al 31/12/2024. Sin diferencias.' },
      { hallazgo: 'Partida en conciliación cheque 0012547', resultado: 'DIFERENCIA', monto_confirmado: 3200,   diferencia: 3200, explicacion: 'Cheque girado 28/12/2024, cobrado 08/01/2025. Partida <UAE. Ver hallazgo HF-01.' },
      { hallazgo: 'Arqueo caja chica',                      resultado: 'CONFORME',   monto_confirmado: 15000,  diferencia: 0,   explicacion: 'Efectivo + vouchers = $15,000 (límite del fondo). Sin diferencias en arqueo de enero 2025.' },
    ]);
    await upd(c01Id, 'S4', []);
    await upd(c01Id, 'S5',
      'CONCLUSIÓN — Caja y Bancos (NIA 500/505):\n\nSe han aplicado los procedimientos sustantivos planificados sobre las cuentas de Caja y Bancos al 31 de diciembre de 2024. Los procedimientos aplicados incluyen: (1) confirmación bancaria externa con Banco BAC Credomatic, (2) rejecución de la conciliación bancaria al 31/12/2024, (3) arqueo de caja chica y (4) análisis de transacciones inusuales.\n\nRESULTADOS:\n• Saldo confirmado por el banco: $320,000 — SIN DIFERENCIAS materiales\n• Partida en conciliación: cheque No. 0012547 por $3,200 — inferior al UAE ($7,500), no requiere ajuste\n• Caja chica: $15,000 — SIN DIFERENCIAS\n• No se identificaron transacciones inusuales o patrones anómalos\n\nEL SALDO DE CAJA Y BANCOS POR $335,000 ESTÁ RAZONABLEMENTE PRESENTADO en todos los aspectos materiales al 31 de diciembre de 2024, de conformidad con las NIIF para PYMES (Sección 7 — Efectivo y Equivalentes de Efectivo).');
    await upd(c01Id, 'S6', 'MODERADO');
    await upd(c01Id, 'S7',
      'RECOMENDACIONES — Caja y Bancos:\n\n1. Implementar la política de entrega inmediata de cheques a beneficiarios para evitar partidas en tránsito innecesarias.\n2. Considerar migrar a pagos electrónicos (transferencias ACH / DTE pago) para proveedores recurrentes, eliminando el riesgo de cheques no cobrados.\n\nLas observaciones han sido comunicadas a la Gerencia Financiera el 10 de febrero de 2025. La administración aceptó ambas recomendaciones e indicará implementación en Q1 2025.');
    await upd(c01Id, 'S8', 'OPINION_LIMPIA');

    // ── E-01: Dictamen (PT-FIN-DICT) ─────────────────────────────────────────
    const e01Id = paperIdMap.get('E-01');
    if (e01Id) {
      const e01Sections = await this.prisma.paperSection.findMany({
        where: { paperId: e01Id }, select: { sectionKey: true },
      });
      const sectionKeys = new Set(e01Sections.map((s) => s.sectionKey));
      if (sectionKeys.has('S1')) {
        await upd(e01Id, 'S1', 'OPINION_SIN_MODIFICACIONES');
      }
      if (sectionKeys.has('S2')) {
        await upd(e01Id, 'S2',
          'INFORME DEL AUDITOR INDEPENDIENTE\n\nA los Accionistas de Empresa Comercial Demo SA de CV:\n\nOPINIÓN\nHemos auditado los estados financieros de Empresa Comercial Demo SA de CV (la "Sociedad"), que comprenden el balance general al 31 de diciembre de 2024, el estado de resultados, el estado de cambios en el patrimonio y el estado de flujos de efectivo correspondientes al ejercicio terminado en dicha fecha, así como las notas que incluyen un resumen de las políticas contables significativas.\n\nEn nuestra opinión, los estados financieros adjuntos presentan razonablemente, en todos los aspectos materiales, la situación financiera de Empresa Comercial Demo SA de CV al 31 de diciembre de 2024, así como sus resultados y flujos de efectivo por el ejercicio terminado en dicha fecha, de conformidad con las Normas Internacionales de Información Financiera para las Pequeñas y Medianas Entidades (NIIF para las PYMES) adoptadas por el Consejo de Vigilancia de la Profesión de Contaduría Pública y Auditoría (CVPCPA).');
      }
      if (sectionKeys.has('S3')) {
        await upd(e01Id, 'S3',
          'BASE DE LA OPINIÓN\nHemos llevado a cabo nuestra auditoría de conformidad con las Normas Internacionales de Auditoría (NIA). Nuestras responsabilidades bajo esas normas se describen más adelante en la sección "Responsabilidades del Auditor para la Auditoría de los Estados Financieros" de nuestro informe. Somos independientes de la Sociedad de conformidad con los requerimientos éticos aplicables a nuestra auditoría de los estados financieros y hemos cumplido las demás responsabilidades de ética de conformidad con esos requerimientos. Consideramos que la evidencia de auditoría que hemos obtenido es suficiente y apropiada para proporcionar una base para nuestra opinión.\n\nMATERIALIDAD\nMaterialidad Global (MG): $150,000 — calculada al 3% sobre ingresos totales de $5,000,000.\nMaterialidad de Ejecución (ME): $90,000 — 60% de la MG.\nUmbral de Ajuste Específico (UAE): $7,500 — 5% de la MG.');
      }
    }

    this.logger.log(`[Demo] Secciones clave pobladas para auditoría ${auditId}`);
  }
}
