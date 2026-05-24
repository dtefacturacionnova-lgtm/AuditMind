import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import { PhaseType } from '@prisma/client';
import { CreateIndexTemplateDto, UpdateIndexTemplateDto } from './dto/index-template.dto';

// ─── Plantilla IIA estándar (fallback y seed inicial) ────────────────────────
export const IIA_STANDARD_STRUCTURE = [
  {
    phaseType: 'PLANNING',
    name: 'Planificación de la Auditoría',
    order: 0,
    folders: [
      { ref: 'A', name: 'Planificación', sortOrder: 0, children: [
        { ref: 'A-1', name: 'Comunicación de Auditoría',  sortOrder: 0 },
        { ref: 'A-2', name: 'Entendimiento del Negocio',  sortOrder: 1 },
        { ref: 'A-3', name: 'Evaluación de Riesgos',      sortOrder: 2 },
        { ref: 'A-4', name: 'Materialidad',               sortOrder: 3 },
        { ref: 'A-5', name: 'Programa de Auditoría',      sortOrder: 4 },
      ]},
    ],
  },
  {
    phaseType: 'FIELDWORK',
    name: 'Ejecución de la Auditoría',
    order: 1,
    folders: [
      { ref: 'B', name: 'Evaluación de Controles', sortOrder: 0, children: [
        { ref: 'B-1', name: 'Ambiente de Control (COSO)',     sortOrder: 0 },
        { ref: 'B-2', name: 'Evaluación de Controles Clave',  sortOrder: 1 },
      ]},
      { ref: 'C', name: 'Pruebas Sustantivas', sortOrder: 1, children: [
        { ref: 'C-1', name: 'Área 1', sortOrder: 0 },
        { ref: 'C-2', name: 'Área 2', sortOrder: 1 },
      ]},
      { ref: 'AD', name: 'Análisis de Datos (CAATs)', sortOrder: 2 },
      { ref: 'I',  name: 'Entrevistas',               sortOrder: 3 },
    ],
  },
  {
    phaseType: 'REPORTING',
    name: 'Informe',
    order: 2,
    folders: [
      { ref: 'D', name: 'Hallazgos', sortOrder: 0 },
      { ref: 'E', name: 'Cierre y Conclusión', sortOrder: 1, children: [
        { ref: 'E-1', name: 'Borrador de Informe',  sortOrder: 0 },
        { ref: 'E-2', name: 'Revisión de Gerencia', sortOrder: 1 },
        { ref: 'E-3', name: 'Informe Final',        sortOrder: 2 },
      ]},
    ],
  },
  {
    phaseType: 'FOLLOWUP',
    name: 'Eventos Posteriores',
    order: 3,
    folders: [
      { ref: 'F', name: 'Seguimiento de Recomendaciones', sortOrder: 0 },
      { ref: 'G', name: 'Archivo Permanente',              sortOrder: 1 },
    ],
  },
];

@Injectable()
export class IndexTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Seed IIA estándar (lazy, si la org no tiene ninguna) ────────────────

  private async seedIfEmpty(user: AuthUser) {
    const count = await this.prisma.indexTemplate.count({
      where: { organizationId: user.organizationId },
    });
    if (count > 0) return;

    await this.prisma.indexTemplate.create({
      data: {
        organizationId: user.organizationId,
        name: 'IIA Estándar',
        description: 'Plantilla basada en estándares IIA con estructura A-G.',
        isDefault: true,
        isSystem: true,
        structure: IIA_STANDARD_STRUCTURE as object,
        createdById: user.id,
      },
    });
  }

  // ─── Listar plantillas de la org ──────────────────────────────────────────

  async getTemplates(user: AuthUser) {
    await this.seedIfEmpty(user);
    return this.prisma.indexTemplate.findMany({
      where: { organizationId: user.organizationId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      include: { createdBy: { select: { id: true, name: true } } },
    });
  }

  // ─── Obtener una plantilla ────────────────────────────────────────────────

  async getTemplate(id: string, user: AuthUser) {
    const tpl = await this.prisma.indexTemplate.findUnique({
      where: { id },
      include: { createdBy: { select: { id: true, name: true } } },
    });
    if (!tpl) throw new NotFoundException('Plantilla no encontrada');
    if (tpl.organizationId !== user.organizationId) throw new ForbiddenException();
    return tpl;
  }

  // ─── Crear plantilla ──────────────────────────────────────────────────────

  async createTemplate(dto: CreateIndexTemplateDto, user: AuthUser) {
    // Si se marca como default, quitar default a las demás
    if (dto.isDefault) {
      await this.prisma.indexTemplate.updateMany({
        where: { organizationId: user.organizationId, isDefault: true },
        data: { isDefault: false },
      });
    }
    return this.prisma.indexTemplate.create({
      data: {
        organizationId: user.organizationId,
        name: dto.name,
        description: dto.description,
        isDefault: dto.isDefault ?? false,
        isSystem: false,
        structure: dto.structure as object,
        createdById: user.id,
      },
      include: { createdBy: { select: { id: true, name: true } } },
    });
  }

  // ─── Actualizar plantilla ─────────────────────────────────────────────────

  async updateTemplate(id: string, dto: UpdateIndexTemplateDto, user: AuthUser) {
    const tpl = await this.getTemplate(id, user);

    if (dto.isDefault) {
      await this.prisma.indexTemplate.updateMany({
        where: { organizationId: user.organizationId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return this.prisma.indexTemplate.update({
      where: { id },
      data: {
        ...(dto.name        !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.isDefault   !== undefined && { isDefault: dto.isDefault }),
        ...(dto.structure   !== undefined && { structure: dto.structure as object }),
      },
      include: { createdBy: { select: { id: true, name: true } } },
    });
  }

  // ─── Eliminar plantilla ───────────────────────────────────────────────────

  async deleteTemplate(id: string, user: AuthUser) {
    const tpl = await this.getTemplate(id, user);
    if (tpl.isSystem) throw new BadRequestException('No se pueden eliminar las plantillas del sistema');
    if (tpl.isDefault) throw new BadRequestException(
      'No se puede eliminar la plantilla por defecto. Asigna otra como default primero.',
    );
    await this.prisma.indexTemplate.delete({ where: { id } });
    return { deleted: true };
  }

  // ─── Establecer como default ──────────────────────────────────────────────

  async setDefault(id: string, user: AuthUser) {
    await this.getTemplate(id, user);

    await this.prisma.indexTemplate.updateMany({
      where: { organizationId: user.organizationId, isDefault: true },
      data: { isDefault: false },
    });

    return this.prisma.indexTemplate.update({
      where: { id },
      data: { isDefault: true },
    });
  }

  // ─── Obtener estructura para inicializar expediente ───────────────────────
  // Usada por AuditFoldersService.initializeFromTemplate

  async getStructureForInit(
    templateId: string | undefined,
    user: AuthUser,
  ): Promise<typeof IIA_STANDARD_STRUCTURE> {
    await this.seedIfEmpty(user);

    if (templateId) {
      const tpl = await this.getTemplate(templateId, user);
      return tpl.structure as typeof IIA_STANDARD_STRUCTURE;
    }

    // Buscar default de la org
    const defaultTpl = await this.prisma.indexTemplate.findFirst({
      where: { organizationId: user.organizationId, isDefault: true },
    });
    if (defaultTpl) {
      return defaultTpl.structure as typeof IIA_STANDARD_STRUCTURE;
    }

    return IIA_STANDARD_STRUCTURE;
  }

  // ─── Contar carpetas en una estructura ────────────────────────────────────

  static countStructure(structure: typeof IIA_STANDARD_STRUCTURE) {
    let folders = 0;
    for (const phase of structure) {
      for (const f of phase.folders ?? []) {
        folders++;
        folders += (f as any).children?.length ?? 0;
      }
    }
    return { phases: structure.length, folders };
  }
}
