import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import { PhaseStatus, PhaseType, WpKind, WorkingPaperType, WorkingPaperStatus } from '@prisma/client';
import {
  CreatePhaseDto, UpdatePhaseDto,
  CreateFolderDto, UpdateFolderDto, ReorderFoldersDto,
  CreateFilePaperDto,
} from './dto/folder.dto';

// ─── Selección mínima de papel para el árbol del expediente ──────────────────
const PAPER_STUB_SELECT = {
  id: true, ref: true, code: true, title: true,
  status: true, wpKind: true, type: true,
  mimeType: true, originalFilename: true, fileUrl: true,
  createdAt: true,
} as const;

// ─── Plantilla estándar de índice (IIA / COSO) ───────────────────────────────
// Se inserta automáticamente al crear una auditoría.
// El usuario puede modificarla a su gusto después.
const DEFAULT_INDEX_TEMPLATE = [
  {
    phaseType: PhaseType.PLANNING,
    name: 'Planificación de la Auditoría',
    order: 0,
    folders: [
      { ref: 'A',   name: 'Planificación',              sortOrder: 0, children: [
        { ref: 'A-1', name: 'Comunicación de Auditoría',    sortOrder: 0 },
        { ref: 'A-2', name: 'Entendimiento del Negocio',     sortOrder: 1 },
        { ref: 'A-3', name: 'Evaluación de Riesgos',         sortOrder: 2 },
        { ref: 'A-4', name: 'Materialidad',                  sortOrder: 3 },
        { ref: 'A-5', name: 'Programa de Auditoría',         sortOrder: 4 },
      ]},
    ],
  },
  {
    phaseType: PhaseType.FIELDWORK,
    name: 'Ejecución de la Auditoría',
    order: 1,
    folders: [
      { ref: 'B',   name: 'Evaluación de Controles',    sortOrder: 0, children: [
        { ref: 'B-1', name: 'Ambiente de Control (COSO)',    sortOrder: 0 },
        { ref: 'B-2', name: 'Evaluación de Controles Clave', sortOrder: 1 },
      ]},
      { ref: 'C',   name: 'Pruebas Sustantivas',         sortOrder: 1, children: [
        { ref: 'C-1', name: 'Área 1',                        sortOrder: 0 },
        { ref: 'C-2', name: 'Área 2',                        sortOrder: 1 },
      ]},
      { ref: 'AD',  name: 'Análisis de Datos (CAATs)',   sortOrder: 2 },
      { ref: 'I',   name: 'Entrevistas',                 sortOrder: 3 },
    ],
  },
  {
    phaseType: PhaseType.REPORTING,
    name: 'Informe',
    order: 2,
    folders: [
      { ref: 'D',   name: 'Hallazgos',                  sortOrder: 0 },
      { ref: 'E',   name: 'Cierre y Conclusión',         sortOrder: 1, children: [
        { ref: 'E-1', name: 'Borrador de Informe',           sortOrder: 0 },
        { ref: 'E-2', name: 'Revisión de Gerencia',          sortOrder: 1 },
        { ref: 'E-3', name: 'Informe Final',                 sortOrder: 2 },
      ]},
    ],
  },
  {
    phaseType: PhaseType.FOLLOWUP,
    name: 'Eventos Posteriores',
    order: 3,
    folders: [
      { ref: 'F',   name: 'Seguimiento de Recomendaciones', sortOrder: 0 },
      { ref: 'G',   name: 'Archivo Permanente',              sortOrder: 1 },
    ],
  },
];

@Injectable()
export class AuditFoldersService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private async verifyAuditAccess(auditId: string, user: AuthUser) {
    const audit = await this.prisma.audit.findUnique({
      where: { id: auditId },
      select: { organizationId: true },
    });
    if (!audit) throw new NotFoundException('Auditoría no encontrada');
    if (audit.organizationId !== user.organizationId) {
      throw new ForbiddenException('Sin acceso a esta auditoría');
    }
    return audit;
  }

  // ─── Inicializar expediente (plantilla estándar) ──────────────────────────

  async initializeFromTemplate(auditId: string, user: AuthUser): Promise<void> {
    await this.verifyAuditAccess(auditId, user);

    // Verificar que no tenga fases ya creadas
    const existing = await this.prisma.auditPhase.count({ where: { auditId } });
    if (existing > 0) throw new BadRequestException('El expediente ya fue inicializado');

    for (const tplPhase of DEFAULT_INDEX_TEMPLATE) {
      const phase = await this.prisma.auditPhase.create({
        data: {
          auditId,
          phaseType: tplPhase.phaseType,
          name: tplPhase.name,
          order: tplPhase.order,
        },
      });

      for (const folder of tplPhase.folders) {
        const parentFolder = await this.prisma.auditFolder.create({
          data: {
            auditId,
            phaseId: phase.id,
            ref: folder.ref,
            name: folder.name,
            sortOrder: folder.sortOrder,
            createdById: user.id,
          },
        });

        if ('children' in folder && folder.children) {
          for (const child of folder.children) {
            await this.prisma.auditFolder.create({
              data: {
                auditId,
                phaseId: phase.id,
                parentId: parentFolder.id,
                ref: child.ref,
                name: child.name,
                sortOrder: child.sortOrder,
                createdById: user.id,
              },
            });
          }
        }
      }
    }
  }

  // ─── Obtener expediente completo (fases + carpetas + conteos) ────────────

  async getExpediente(auditId: string, user: AuthUser) {
    await this.verifyAuditAccess(auditId, user);

    const phases = await this.prisma.auditPhase.findMany({
      where: { auditId },
      orderBy: { order: 'asc' },
      include: {
        signedOffBy: { select: { id: true, name: true } },
        folders: {
          where: { parentId: null },   // Solo raíces; hijos se cargan anidados
          orderBy: { sortOrder: 'asc' },
          include: {
            children: {
              orderBy: { sortOrder: 'asc' },
              include: {
                children: {             // Nivel 3 máximo
                  orderBy: { sortOrder: 'asc' },
                  include: {
                    papers: { select: PAPER_STUB_SELECT, orderBy: { createdAt: 'asc' } },
                  },
                },
                papers: { select: PAPER_STUB_SELECT, orderBy: { createdAt: 'asc' } },
              },
            },
            papers: { select: PAPER_STUB_SELECT, orderBy: { createdAt: 'asc' } },
          },
        },
      },
    });

    // Si no hay fases, devolver vacío (sin auto-init)
    return phases;
  }

  // ─── Fases ────────────────────────────────────────────────────────────────

  async createPhase(auditId: string, dto: CreatePhaseDto, user: AuthUser) {
    await this.verifyAuditAccess(auditId, user);

    // Verificar que no exista ya esa fase
    const exists = await this.prisma.auditPhase.findUnique({
      where: { auditId_phaseType: { auditId, phaseType: dto.phaseType } },
    });
    if (exists) throw new BadRequestException(`La fase ${dto.phaseType} ya existe`);

    return this.prisma.auditPhase.create({
      data: {
        auditId,
        phaseType: dto.phaseType,
        name: dto.name,
        order: dto.order ?? 0,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        targetDate: dto.targetDate ? new Date(dto.targetDate) : undefined,
      },
    });
  }

  async updatePhase(phaseId: string, dto: UpdatePhaseDto, user: AuthUser) {
    const phase = await this.prisma.auditPhase.findUnique({
      where: { id: phaseId },
      include: { audit: { select: { organizationId: true } } },
    });
    if (!phase) throw new NotFoundException('Fase no encontrada');
    if (phase.audit.organizationId !== user.organizationId) {
      throw new ForbiddenException();
    }

    return this.prisma.auditPhase.update({
      where: { id: phaseId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.startDate !== undefined && { startDate: dto.startDate ? new Date(dto.startDate) : null }),
        ...(dto.targetDate !== undefined && { targetDate: dto.targetDate ? new Date(dto.targetDate) : null }),
      },
    });
  }

  async signOffPhase(phaseId: string, user: AuthUser) {
    const phase = await this.prisma.auditPhase.findUnique({
      where: { id: phaseId },
      include: {
        audit: { select: { organizationId: true } },
        folders: { include: { papers: { select: { status: true } } } },
      },
    });
    if (!phase) throw new NotFoundException('Fase no encontrada');
    if (phase.audit.organizationId !== user.organizationId) throw new ForbiddenException();

    return this.prisma.auditPhase.update({
      where: { id: phaseId },
      data: {
        status: PhaseStatus.COMPLETE,
        signedOffById: user.id,
        signedOffAt: new Date(),
      },
    });
  }

  // ─── Carpetas ─────────────────────────────────────────────────────────────

  async createFolder(auditId: string, dto: CreateFolderDto, user: AuthUser) {
    await this.verifyAuditAccess(auditId, user);

    // Validar profundidad máxima (3 niveles)
    if (dto.parentId) {
      const parent = await this.prisma.auditFolder.findUnique({
        where: { id: dto.parentId },
        include: { parent: true },
      });
      if (!parent) throw new NotFoundException('Carpeta padre no encontrada');
      if (parent.parentId) {
        const grandParent = await this.prisma.auditFolder.findUnique({
          where: { id: parent.parentId },
          select: { parentId: true },
        });
        if (grandParent?.parentId) {
          throw new BadRequestException('Profundidad máxima de carpetas: 3 niveles');
        }
      }
    }

    return this.prisma.auditFolder.create({
      data: {
        auditId,
        phaseId: dto.phaseId ?? null,
        parentId: dto.parentId ?? null,
        ref: dto.ref,
        name: dto.name,
        description: dto.description,
        sortOrder: dto.sortOrder ?? 0,
        createdById: user.id,
      },
    });
  }

  async updateFolder(folderId: string, dto: UpdateFolderDto, user: AuthUser) {
    const folder = await this.prisma.auditFolder.findUnique({
      where: { id: folderId },
      include: { audit: { select: { organizationId: true } } },
    });
    if (!folder) throw new NotFoundException('Carpeta no encontrada');
    if (folder.audit.organizationId !== user.organizationId) throw new ForbiddenException();

    return this.prisma.auditFolder.update({
      where: { id: folderId },
      data: {
        ...(dto.ref !== undefined && { ref: dto.ref }),
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.phaseId !== undefined && { phaseId: dto.phaseId }),
        ...(dto.parentId !== undefined && { parentId: dto.parentId }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      },
    });
  }

  async deleteFolder(folderId: string, user: AuthUser) {
    const folder = await this.prisma.auditFolder.findUnique({
      where: { id: folderId },
      include: {
        audit: { select: { organizationId: true } },
        children: true,
        _count: { select: { papers: true } },
      },
    });
    if (!folder) throw new NotFoundException('Carpeta no encontrada');
    if (folder.audit.organizationId !== user.organizationId) throw new ForbiddenException();
    if (folder.children.length > 0) {
      throw new BadRequestException('No se puede eliminar una carpeta con sub-carpetas');
    }
    if (folder._count.papers > 0) {
      throw new BadRequestException('No se puede eliminar una carpeta con papeles asociados');
    }

    await this.prisma.auditFolder.delete({ where: { id: folderId } });
    return { deleted: true };
  }

  async reorderFolders(dto: ReorderFoldersDto, user: AuthUser) {
    const updates = dto.items.map(({ id, sortOrder }) =>
      this.prisma.auditFolder.update({
        where: { id },
        data: { sortOrder },
      }),
    );
    await this.prisma.$transaction(updates);
    return { reordered: dto.items.length };
  }

  // ─── Registrar archivo adjunto como papel de trabajo ────────────────────

  async createFilePaper(
    auditId: string,
    folderId: string,
    dto: CreateFilePaperDto,
    user: AuthUser,
  ) {
    await this.verifyAuditAccess(auditId, user);

    const folder = await this.prisma.auditFolder.findUnique({ where: { id: folderId } });
    if (!folder) throw new NotFoundException('Carpeta no encontrada');
    if (folder.auditId !== auditId) throw new BadRequestException('La carpeta pertenece a otra auditoría');

    // Auto-code: FILE-001, FILE-002…
    const count = await this.prisma.workingPaper.count({ where: { auditId } });
    const code = `FILE-${String(count + 1).padStart(3, '0')}`;

    return this.prisma.workingPaper.create({
      data: {
        auditId,
        folderId,
        ref: dto.ref ?? null,
        code,
        indexSection: folder.ref ?? 'FILE',
        title: dto.title,
        type: this.mimeToWpType(dto.mimeType),
        wpKind: WpKind.FILE,
        status: WorkingPaperStatus.IN_PROGRESS,
        fileUrl: dto.fileUrl,
        originalFilename: dto.originalFilename,
        mimeType: dto.mimeType,
        fileSize: dto.fileSize ?? null,
        preparedById: user.id,
      },
      select: PAPER_STUB_SELECT,
    });
  }

  private mimeToWpType(mimeType: string): WorkingPaperType {
    const m = mimeType.toLowerCase();
    if (m.includes('spreadsheet') || m.includes('excel') || m.endsWith('.xls'))
      return WorkingPaperType.SUBSTANTIVE_TEST;
    if (m.includes('presentation') || m.includes('powerpoint'))
      return WorkingPaperType.CLOSURE_CONCLUSION;
    if (m.startsWith('audio/'))
      return WorkingPaperType.INTERVIEW;
    return WorkingPaperType.PLANNING_UNDERSTANDING; // Word / PDF / image / default
  }

  // ─── Asignar papel a carpeta ──────────────────────────────────────────────

  async assignPaperToFolder(paperId: string, folderId: string | null, user: AuthUser) {
    const paper = await this.prisma.workingPaper.findUnique({
      where: { id: paperId },
      include: { audit: { select: { organizationId: true } } },
    });
    if (!paper) throw new NotFoundException('Papel no encontrado');
    if (paper.audit.organizationId !== user.organizationId) throw new ForbiddenException();

    if (folderId) {
      const folder = await this.prisma.auditFolder.findUnique({ where: { id: folderId } });
      if (!folder) throw new NotFoundException('Carpeta no encontrada');
      if (folder.auditId !== paper.auditId) {
        throw new BadRequestException('La carpeta pertenece a otra auditoría');
      }
    }

    return this.prisma.workingPaper.update({
      where: { id: paperId },
      data: { folderId },
    });
  }
}
