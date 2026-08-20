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
import { IndexTemplatesService } from '../index-templates/index-templates.service';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ─── Selección mínima de papel para el árbol del expediente ──────────────────
const PAPER_STUB_SELECT = {
  id: true, ref: true, code: true, paperCode: true, title: true,
  status: true, wpKind: true, type: true,
  mimeType: true, originalFilename: true, fileUrl: true,
  createdAt: true,
  preparedBy: { select: { id: true, name: true, avatarUrl: true } },
  reviewedBy:  { select: { id: true, name: true, avatarUrl: true } },
  _count: { select: { comments: true, findings: true, tickEntries: true } },
};

// DEFAULT_INDEX_TEMPLATE moved to IndexTemplatesService (IIA_STANDARD_STRUCTURE)

@Injectable()
export class AuditFoldersService {
  private readonly supabaseAdmin: SupabaseClient;

  constructor(
    private readonly prisma: PrismaService,
    private readonly indexTemplates: IndexTemplatesService,
  ) {
    this.supabaseAdmin = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }

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

  async initializeFromTemplate(
    auditId: string,
    user: AuthUser,
    templateId?: string,
  ): Promise<{ created: boolean; phases: number; folders: number; orphansLinked: number }> {
    await this.verifyAuditAccess(auditId, user);

    // IDEMPOTENTE: si ya hay fases, intentar enlazar huérfanos y devolver OK
    const existing = await this.prisma.auditPhase.count({ where: { auditId } });
    if (existing > 0) {
      const orphansLinked = await this.linkOrphanPapersToFolders(auditId);
      return { created: false, phases: existing, folders: 0, orphansLinked };
    }

    // Obtener estructura: desde DB (templateId o default) o fallback hardcoded
    const structure = await this.indexTemplates.getStructureForInit(templateId, user);

    let phaseCount = 0;
    let folderCount = 0;
    for (const tplPhase of structure) {
      const phase = await this.prisma.auditPhase.create({
        data: {
          auditId,
          phaseType: tplPhase.phaseType as PhaseType,
          name: tplPhase.name,
          order: tplPhase.order,
        },
      });
      phaseCount++;

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
        folderCount++;

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
            folderCount++;
          }
        }
      }
    }

    // Link orphan papers (created earlier by scaffold) to their folders
    const orphansLinked = await this.linkOrphanPapersToFolders(auditId);

    return { created: true, phases: phaseCount, folders: folderCount, orphansLinked };
  }

  // ─── Inicializar expediente (desde secciones de AuditTemplate) ──────────

  /**
   * Inicializa el expediente usando la estructura de secciones definida en
   * la plantilla de auditoría (AuditTemplate.sections), en lugar de un IndexTemplate.
   */
  async initializeFromAuditTemplateSections(
    auditId:  string,
    user:     AuthUser,
  ): Promise<{ created: boolean; phases: number; folders: number; orphansLinked: number }> {
    await this.verifyAuditAccess(auditId, user);

    const existing = await this.prisma.auditPhase.count({ where: { auditId } });
    if (existing > 0) {
      // IDEMPOTENTE: en lugar de error, intentamos linkar papeles huérfanos y devolvemos OK
      const orphansLinked = await this.linkOrphanPapersToFolders(auditId);
      return { created: false, phases: existing, folders: 0, orphansLinked };
    }

    const audit = await this.prisma.audit.findFirst({
      where: { id: auditId, organizationId: user.organizationId },
      select: { templateId: true },
    });

    interface SectionDef {
      ref: string; name: string;
      phaseType?: string;
      children?: Array<{ ref: string; name: string }>;
    }

    // 1. Try to get sections from the AuditTemplate
    let sections: SectionDef[] | null = null;
    if (audit?.templateId) {
      const template = await this.prisma.auditTemplate.findFirst({
        where: { id: audit.templateId },
        select: { sections: true },
      });
      if (template?.sections && Array.isArray(template.sections) && (template.sections as unknown[]).length > 0) {
        sections = template.sections as unknown as SectionDef[];
      }
    }

    // 2. FALLBACK: if the template has no sections, derive the folder structure
    //    from the indexSection values of the papers that already exist in the
    //    audit (created by scaffold). This guarantees the button always works.
    if (!sections || sections.length === 0) {
      sections = await this.deriveSectionsFromPapers(auditId);
    }

    // 3. Last resort: a single root folder so the user can build manually
    if (!sections || sections.length === 0) {
      sections = [{ ref: 'A', name: 'Expediente', phaseType: 'PLANNING' }];
    }

    // Group sections by phaseType (preserving insertion order)
    const phaseGroups = new Map<string, SectionDef[]>();
    const phaseOrder: string[] = [];
    for (const s of sections) {
      const pt = s.phaseType ?? 'PLANNING';
      if (!phaseGroups.has(pt)) { phaseGroups.set(pt, []); phaseOrder.push(pt); }
      phaseGroups.get(pt)!.push(s);
    }

    const PHASE_NAMES: Record<string, string> = {
      PLANNING:  'Planificación',
      FIELDWORK: 'Ejecución',
      REPORTING: 'Informe',
      FOLLOWUP:  'Seguimiento',
    };

    let order = 0;
    let phaseCount = 0;
    let folderCount = 0;
    for (const phaseType of phaseOrder) {
      const phaseSections = phaseGroups.get(phaseType)!;
      const phase = await this.prisma.auditPhase.create({
        data: {
          auditId,
          phaseType: phaseType as PhaseType,
          name: PHASE_NAMES[phaseType] ?? phaseType,
          order: order++,
        },
      });
      phaseCount++;

      for (const [si, section] of phaseSections.entries()) {
        const folder = await this.prisma.auditFolder.create({
          data: {
            auditId, phaseId: phase.id,
            ref: section.ref, name: section.name,
            sortOrder: si, createdById: user.id,
          },
        });
        folderCount++;
        if (section.children?.length) {
          for (const [ci, child] of section.children.entries()) {
            await this.prisma.auditFolder.create({
              data: {
                auditId, phaseId: phase.id, parentId: folder.id,
                ref: child.ref, name: child.name,
                sortOrder: ci, createdById: user.id,
              },
            });
            folderCount++;
          }
        }
      }
    }

    // Link any orphan papers (created earlier by scaffold) to their folders
    const orphansLinked = await this.linkOrphanPapersToFolders(auditId);

    return { created: true, phases: phaseCount, folders: folderCount, orphansLinked };
  }

  // ─── Derivar estructura de carpetas desde los papeles existentes ──────────
  /**
   * Cuando la plantilla de auditoría no tiene `sections` definidas, derivamos
   * la estructura de carpetas agrupando los WorkingPapers por su indexSection.
   *
   * Soporta jerarquía de 2 niveles por convención de naming:
   *   - "A"      → carpeta raíz A
   *   - "B-DDC"  → subcarpeta DDC dentro de la carpeta raíz B
   *
   * El phaseType se infiere por el prefijo de la letra (A→PLANNING, etc.)
   * de forma conservadora — todo va a PLANNING si no se reconoce.
   */
  private async deriveSectionsFromPapers(auditId: string): Promise<Array<{
    ref: string; name: string; phaseType?: string;
    children?: Array<{ ref: string; name: string }>;
  }>> {
    const papers = await this.prisma.workingPaper.findMany({
      where:  { auditId },
      select: { indexSection: true },
    });
    if (papers.length === 0) return [];

    // Phase inference by root letter (NIA/NOGAI convention)
    const PHASE_BY_ROOT: Record<string, string> = {
      A: 'PLANNING', B: 'FIELDWORK', C: 'FIELDWORK',
      D: 'REPORTING', E: 'REPORTING', F: 'FOLLOWUP',
    };

    // Collect unique refs, split root vs child by "-"
    const rootMap = new Map<string, Set<string>>();  // root → set of child refs
    for (const p of papers) {
      const idx = (p.indexSection ?? '').trim();
      if (!idx) continue;
      const dashPos = idx.indexOf('-');
      if (dashPos > 0) {
        const root = idx.slice(0, dashPos);
        if (!rootMap.has(root)) rootMap.set(root, new Set());
        rootMap.get(root)!.add(idx);          // full child ref e.g. "B-DDC"
      } else {
        if (!rootMap.has(idx)) rootMap.set(idx, new Set());
      }
    }

    const sections: Array<{
      ref: string; name: string; phaseType?: string;
      children?: Array<{ ref: string; name: string }>;
    }> = [];

    for (const [root, childRefs] of Array.from(rootMap.entries()).sort()) {
      const children = Array.from(childRefs).sort().map(cr => ({
        ref:  cr,
        name: cr,                              // use the ref as name (e.g. "B-DDC")
      }));
      sections.push({
        ref:       root,
        name:      `Sección ${root}`,
        phaseType: PHASE_BY_ROOT[root.charAt(0).toUpperCase()] ?? 'PLANNING',
        ...(children.length > 0 ? { children } : {}),
      });
    }

    return sections;
  }

  // ─── Link papeles huérfanos creados por scaffold a su folder correspondiente ────
  /**
   * Cuando una auditoría se crea con scaffoldMode='FULL', el AuditIndexService
   * crea WorkingPapers con un indexSection (ej. 'A', 'B-DDC') pero sin folderId.
   * Después de crear la estructura de carpetas, este método engancha cada
   * papel huérfano (folderId=null) a su folder que coincide por ref.
   *
   * Resuelve casos:
   * 1. indexSection coincide exactamente con folder.ref → directo
   * 2. indexSection coincide con un subfolder hijo (ej. 'B-DDC') → usa ese
   * 3. Sin match → queda huérfano (no error)
   */
  private async linkOrphanPapersToFolders(auditId: string): Promise<number> {
    const orphans = await this.prisma.workingPaper.findMany({
      where:  { auditId, folderId: null },
      select: { id: true, indexSection: true },
    });
    if (orphans.length === 0) return 0;

    const folders = await this.prisma.auditFolder.findMany({
      where:  { auditId },
      select: { id: true, ref: true },
    });
    const byRef = new Map<string, string>();
    for (const f of folders) byRef.set(f.ref, f.id);

    let linked = 0;
    for (const wp of orphans) {
      const folderId = byRef.get(wp.indexSection);
      if (!folderId) continue;
      await this.prisma.workingPaper.update({
        where: { id: wp.id },
        data:  { folderId },
      });
      linked++;
    }
    return linked;
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

  // ─── Upload via backend (bypasses Storage RLS) ──────────────────────────────

  async uploadAndRegisterFile(
    auditId: string,
    folderId: string,
    file: Express.Multer.File,
    title: string,
    ref: string | undefined,
    user: AuthUser,
  ) {
    await this.verifyAuditAccess(auditId, user);

    const folder = await this.prisma.auditFolder.findUnique({ where: { id: folderId } });
    if (!folder) throw new NotFoundException('Carpeta no encontrada');
    if (folder.auditId !== auditId) throw new BadRequestException('La carpeta pertenece a otra auditoría');

    // Upload to Supabase Storage using service-role key (bypasses RLS)
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${auditId}/${Date.now()}_${safeName}`;

    const { error: uploadError } = await this.supabaseAdmin.storage
      .from('audit-files')
      .upload(path, file.buffer, {
        contentType: file.mimetype || 'application/octet-stream',
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) throw new BadRequestException(`Error al subir archivo: ${uploadError.message}`);

    const { data: urlData } = this.supabaseAdmin.storage.from('audit-files').getPublicUrl(path);

    // Register in DB
    const count = await this.prisma.workingPaper.count({ where: { auditId } });
    const code = `FILE-${String(count + 1).padStart(3, '0')}`;

    return this.prisma.workingPaper.create({
      data: {
        auditId,
        folderId,
        ref: ref ?? null,
        code,
        indexSection: folder.ref ?? 'FILE',
        title,
        type: this.mimeToWpType(file.mimetype),
        wpKind: WpKind.FILE,
        status: WorkingPaperStatus.IN_PROGRESS,
        fileUrl: urlData.publicUrl,
        originalFilename: file.originalname,
        mimeType: file.mimetype || 'application/octet-stream',
        fileSize: file.size ?? null,
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
