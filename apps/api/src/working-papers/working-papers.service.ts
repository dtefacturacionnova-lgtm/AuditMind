import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateWorkingPaperDto, AddCommentDto, AddTickMarkEntryDto,
} from './dto/create-working-paper.dto';
import { UpdateWorkingPaperDto, UpdateWorkingPaperStatusDto } from './dto/update-working-paper.dto';
import { AuthUser } from '../auth/jwt.strategy';
import { WorkingPaperStatus, UserRole, TickMark, WpKind, SyncStatus } from '@prisma/client';
import { PaperGraphService } from './paper-graph.service';

async function generateWpCode(
  prisma: PrismaService,
  auditId: string,
  indexSection: string,
): Promise<string> {
  const count = await prisma.workingPaper.count({
    where: { auditId, indexSection },
  });
  return `${indexSection}-${String(count + 1).padStart(2, '0')}`;
}

const INCLUDE_FULL = {
  preparedBy:  { select: { id: true, name: true, avatarUrl: true } },
  reviewedBy:  { select: { id: true, name: true, avatarUrl: true } },
  findings:    { select: { id: true, title: true, severity: true, status: true } },
  tickEntries: { orderBy: { createdAt: 'asc' as const } },
  comments:    { orderBy: { createdAt: 'asc' as const } },
  // ─── Intelligent Papers ─────────────────────────────────────────────────
  sections:     { orderBy: { sortOrder: 'asc' as const } },
  sourceLinks:  {
    include: {
      target: {
        select: { id: true, code: true, title: true, wpKind: true, syncStatus: true },
      },
    },
  },
  targetLinks:  {
    include: {
      source: {
        select: { id: true, code: true, title: true, wpKind: true, syncStatus: true },
      },
    },
  },
} as const;

@Injectable()
export class WorkingPapersService {
  constructor(
    private readonly prisma:        PrismaService,
    private readonly paperGraph:    PaperGraphService,
    private readonly eventEmitter:  EventEmitter2,
  ) {}

  private async assertAuditAccess(auditId: string, user: AuthUser) {
    const audit = await this.prisma.audit.findFirst({
      where: { id: auditId, organizationId: user.organizationId },
      include: { team: { select: { userId: true } } },
    });
    if (!audit) throw new NotFoundException('Auditoría no encontrada');

    if (audit.isInvestigationMode) {
      const onTeam      = audit.team.some((m) => m.userId === user.id);
      const privileged  = ([UserRole.CAE, UserRole.ADMIN, UserRole.SUPER_ADMIN] as string[]).includes(user.role);
      if (!onTeam && !privileged) throw new ForbiddenException('Acceso restringido — modo investigación');
    }

    return audit;
  }

  // ─── CRUD ────────────────────────────────────────────────────────────────────

  async create(dto: CreateWorkingPaperDto, user: AuthUser) {
    await this.assertAuditAccess(dto.auditId, user);
    const code = await generateWpCode(this.prisma, dto.auditId, dto.indexSection);

    return this.prisma.workingPaper.create({
      data: {
        code,
        title:          dto.title,
        type:           dto.type,
        indexSection:   dto.indexSection,
        auditId:        dto.auditId,
        preparedById:   user.id,
        reviewedById:   dto.reviewerId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        content:        (dto.content ?? {}) as any,
        conclusion:     dto.conclusion,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tickMarks:      (dto.tickMarks ?? []) as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        crossReferences:(dto.crossReferences ?? []) as any,
        aiAssisted:     dto.aiAssisted ?? false,
        status:         WorkingPaperStatus.DRAFT,
        version:        1,
      },
      include: INCLUDE_FULL,
    });
  }

  async findAllForAudit(auditId: string, user: AuthUser) {
    await this.assertAuditAccess(auditId, user);
    return this.prisma.workingPaper.findMany({
      where:   { auditId },
      orderBy: [{ indexSection: 'asc' }, { code: 'asc' }],
      include: {
        preparedBy: { select: { id: true, name: true, avatarUrl: true } },
        reviewedBy: { select: { id: true, name: true, avatarUrl: true } },
        _count:     { select: { findings: true, comments: true, tickEntries: true } },
      },
    });
  }

  async findAllForOrg(
    user: AuthUser,
    page     = 1,
    limit    = 30,
    status?: WorkingPaperStatus,
    auditId?: string,
  ) {
    const where = {
      audit: { organizationId: user.organizationId },
      ...(status  && { status }),
      ...(auditId && { auditId }),
    };

    const [data, total] = await Promise.all([
      this.prisma.workingPaper.findMany({
        where,
        skip:    (page - 1) * limit,
        take:    limit,
        orderBy: [{ auditId: 'asc' }, { indexSection: 'asc' }, { code: 'asc' }],
        include: {
          audit:      { select: { id: true, title: true } },
          preparedBy: { select: { id: true, name: true } },
          reviewedBy: { select: { id: true, name: true } },
          _count:     { select: { findings: true, tickEntries: true } },
        },
      }),
      this.prisma.workingPaper.count({ where }),
    ]);

    return { data, meta: { total, page, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string, user: AuthUser) {
    const wp = await this.prisma.workingPaper.findUnique({
      where:   { id },
      include: {
        ...INCLUDE_FULL,
        audit: {
          select: {
            id: true, title: true, organizationId: true,
            isInvestigationMode: true,
            team: { select: { userId: true } },
          },
        },
      },
    });
    if (!wp) throw new NotFoundException('Papel de trabajo no encontrado');
    if (wp.audit.organizationId !== user.organizationId) throw new ForbiddenException();
    return wp;
  }

  private LOCKED_STATUSES: WorkingPaperStatus[] = [
    WorkingPaperStatus.SIGNED_OFF,
    WorkingPaperStatus.CLOSED,
    WorkingPaperStatus.ARCHIVED,
  ];

  async update(id: string, dto: UpdateWorkingPaperDto, user: AuthUser) {
    const wp = await this.findOne(id, user);
    // F6.4 Lockdown: block edits on SIGNED_OFF, CLOSED, ARCHIVED papers
    if (this.LOCKED_STATUSES.includes(wp.status as WorkingPaperStatus)) {
      throw new BadRequestException(
        `El papel "${wp.title}" está bloqueado (estado: ${wp.status}). No se permiten modificaciones.`,
      );
    }

    // Snapshot version before updating
    await this.prisma.workingPaperVersion.create({
      data: {
        paperId:   id,
        version:   wp.version,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        content:   wp.content as any,
        changedBy: user.id,
        diff:      {},
      },
    });

    const updated = await this.prisma.workingPaper.update({
      where: { id },
      data:  {
        ...(dto.title      !== undefined && { title: dto.title }),
        ...(dto.ref        !== undefined && { ref: dto.ref }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(dto.content    !== undefined && { content: dto.content as any }),
        ...(dto.conclusion !== undefined && { conclusion: dto.conclusion }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(dto.tickMarks  !== undefined && { tickMarks: dto.tickMarks as any }),
        ...(dto.crossReferences !== undefined && {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          crossReferences: dto.crossReferences as any,
        }),
        ...(dto.reviewerId  !== undefined && { reviewedById: dto.reviewerId }),
        ...(dto.aiAssisted  !== undefined && { aiAssisted: dto.aiAssisted }),
        version: { increment: 1 },
      },
      include: INCLUDE_FULL,
    });

    // Propagate content changes to downstream graph dependents
    if (dto.content !== undefined) {
      await this.paperGraph.onSectionUpdated(id, 'content', dto.content);
    }

    return updated;
  }

  async updateStatus(id: string, dto: UpdateWorkingPaperStatusDto, user: AuthUser) {
    const wp = await this.findOne(id, user);

    if (dto.status === WorkingPaperStatus.APPROVED) {
      const approverRoles: string[] = [UserRole.AUDIT_MANAGER, UserRole.CAE, UserRole.SENIOR_AUDITOR];
      const canApprove = wp.reviewedById === user.id || approverRoles.includes(user.role);
      if (!canApprove) throw new ForbiddenException('Solo el revisor asignado o un gerente puede aprobar este papel');
    }

    if (dto.reviewNotes) {
      await this.prisma.workingPaperComment.create({
        data: { paperId: id, authorId: user.id, content: dto.reviewNotes },
      });
    }

    // F6.4 Set retention date when paper is closed (7 years default)
    const retentionData = dto.status === WorkingPaperStatus.CLOSED
      ? { retentionUntil: new Date(Date.now() + 7 * 365.25 * 24 * 3600 * 1000) }
      : {};

    return this.prisma.workingPaper.update({
      where:   { id },
      data:    { status: dto.status, ...retentionData },
      include: INCLUDE_FULL,
    });
  }

  async remove(id: string, user: AuthUser): Promise<{ deleted: boolean }> {
    const wp = await this.prisma.workingPaper.findFirst({
      where: { id, audit: { organizationId: user.organizationId } },
      select: { id: true },
    });
    if (!wp) throw new NotFoundException('Papel de trabajo no encontrado');

    // All child records (PaperSection, WorkingPaperVersion, WorkingPaperComment,
    // TickMarkEntry, PaperLink) have onDelete: Cascade — one delete suffices.
    await this.prisma.workingPaper.delete({ where: { id } });
    return { deleted: true };
  }

  async getIndex(auditId: string, user: AuthUser) {
    await this.assertAuditAccess(auditId, user);
    const papers = await this.prisma.workingPaper.findMany({
      where:   { auditId },
      orderBy: [{ indexSection: 'asc' }, { code: 'asc' }],
      select:  {
        id: true, code: true, title: true, type: true,
        indexSection: true, status: true, aiAssisted: true, version: true,
        preparedBy: { select: { id: true, name: true } },
        reviewedBy: { select: { id: true, name: true } },
        _count: { select: { findings: true, tickEntries: true, comments: true } },
      },
    });

    return papers.reduce<Record<string, typeof papers>>((acc, wp) => {
      acc[wp.indexSection] = acc[wp.indexSection] ?? [];
      acc[wp.indexSection].push(wp);
      return acc;
    }, {});
  }

  // ─── Tick mark entries ────────────────────────────────────────────────────────

  async addTickMarkEntry(
    id: string,
    dto: AddTickMarkEntryDto,
    user: AuthUser,
  ) {
    await this.findOne(id, user); // access check

    return this.prisma.tickMarkEntry.create({
      data: {
        paperId:   id,
        fieldPath: dto.fieldPath,
        tickMark:  dto.tickMark,
        note:      dto.note,
        createdBy: user.id,
      },
    });
  }

  async removeTickMarkEntry(entryId: string, user: AuthUser) {
    const entry = await this.prisma.tickMarkEntry.findUnique({
      where:   { id: entryId },
      include: { paper: { include: { audit: { select: { organizationId: true } } } } },
    });
    if (!entry) throw new NotFoundException('Marca de auditoría no encontrada');
    if (entry.paper.audit.organizationId !== user.organizationId) throw new ForbiddenException();

    await this.prisma.tickMarkEntry.delete({ where: { id: entryId } });
    return { deleted: true };
  }

  // ─── Comments ────────────────────────────────────────────────────────────────

  async addComment(id: string, dto: AddCommentDto, user: AuthUser) {
    await this.findOne(id, user); // access check

    return this.prisma.workingPaperComment.create({
      data: { paperId: id, authorId: user.id, content: dto.content },
    });
  }

  async resolveComment(commentId: string, user: AuthUser) {
    const comment = await this.prisma.workingPaperComment.findUnique({
      where:   { id: commentId },
      include: { paper: { include: { audit: { select: { organizationId: true } } } } },
    });
    if (!comment) throw new NotFoundException('Comentario no encontrado');
    if (comment.paper.audit.organizationId !== user.organizationId) throw new ForbiddenException();

    return this.prisma.workingPaperComment.update({
      where: { id: commentId },
      data:  { resolved: true, resolvedBy: user.id },
    });
  }

  // ─── Version history ──────────────────────────────────────────────────────────

  async getVersionHistory(id: string, user: AuthUser) {
    await this.findOne(id, user); // access check

    return this.prisma.workingPaperVersion.findMany({
      where:   { paperId: id },
      orderBy: { version: 'desc' },
      select:  {
        id: true, version: true, changedAt: true, changedBy: true,
      },
    });
  }

  // ─── F6.6 Checkout / collaborative lock ──────────────────────────────────────

  private readonly CHECKOUT_TTL_MS = 30 * 60 * 1000; // 30 minutes

  async checkout(id: string, user: AuthUser) {
    const wp = await this.findOne(id, user);

    if (this.LOCKED_STATUSES.includes(wp.status as WorkingPaperStatus)) {
      throw new BadRequestException('El papel está bloqueado y no puede ser editado');
    }

    const now = new Date();

    // Check if someone else has it checked out and the lock hasn't expired
    if (
      wp.checkedOutById &&
      wp.checkedOutById !== user.id &&
      wp.checkedOutAt &&
      now.getTime() - new Date(wp.checkedOutAt).getTime() < this.CHECKOUT_TTL_MS
    ) {
      return {
        success:     false,
        lockedBy:    wp.checkedOutById,
        lockedAt:    wp.checkedOutAt,
        expiresAt:   new Date(new Date(wp.checkedOutAt).getTime() + this.CHECKOUT_TTL_MS),
      };
    }

    await this.prisma.workingPaper.update({
      where: { id },
      data:  { checkedOutById: user.id, checkedOutAt: now },
    });

    return { success: true, checkedOutById: user.id, checkedOutAt: now };
  }

  async checkin(id: string, user: AuthUser) {
    const wp = await this.findOne(id, user);

    // Only the current holder or a manager can release the lock
    const canRelease =
      wp.checkedOutById === user.id ||
      ([UserRole.CAE, UserRole.AUDIT_MANAGER, UserRole.ADMIN, UserRole.SUPER_ADMIN] as string[]).includes(user.role);

    if (!canRelease) {
      throw new ForbiddenException('Solo el usuario que abrió el papel puede liberarlo');
    }

    await this.prisma.workingPaper.update({
      where: { id },
      data:  { checkedOutById: null, checkedOutAt: null },
    });

    return { success: true };
  }

  // ─── F6.2 Sign-off matrix ─────────────────────────────────────────────────────

  async signOff(
    id: string,
    level: 'prepare' | 'review' | 'signoff',
    user: AuthUser,
  ) {
    const wp = await this.findOne(id, user);

    if (level === 'review' || level === 'signoff') {
      const managerRoles: string[] = [
        UserRole.AUDIT_MANAGER, UserRole.CAE, UserRole.SENIOR_AUDITOR,
        UserRole.ADMIN, UserRole.SUPER_ADMIN,
      ];
      if (!managerRoles.includes(user.role)) {
        throw new ForbiddenException('Solo gerentes o revisores pueden firmar en este nivel');
      }
    }

    if (level === 'signoff') {
      const signOffRoles: string[] = [UserRole.CAE, UserRole.AUDIT_MANAGER, UserRole.ADMIN, UserRole.SUPER_ADMIN];
      if (!signOffRoles.includes(user.role)) {
        throw new ForbiddenException('Solo el CAE o Gerente de Auditoría pueden realizar la firma final');
      }
    }

    const data: Record<string, unknown> =
      level === 'prepare'  ? { preparedById:  user.id, preparedAt:  new Date() } :
      level === 'review'   ? { reviewedById:  user.id, reviewedAt:  new Date() } :
                             { signedOffById: user.id, signedOffAt: new Date() };

    return this.prisma.workingPaper.update({
      where:   { id },
      data:    data as any,
      include: INCLUDE_FULL,
    });
  }

  async getSignOffMatrix(auditId: string, user: AuthUser) {
    await this.assertAuditAccess(auditId, user);
    return this.prisma.workingPaper.findMany({
      where:   { auditId },
      orderBy: [{ indexSection: 'asc' }, { code: 'asc' }],
      select: {
        id: true, code: true, indexSection: true, title: true, status: true, type: true,
        preparedById: true, preparedAt:  true,
        reviewedById: true, reviewedAt:  true,
        signedOffById: true, signedOffAt: true,
        preparedBy:   { select: { id: true, name: true } },
        reviewedBy:   { select: { id: true, name: true } },
        signedOffBy:  { select: { id: true, name: true } },
        qualityScore: true,
        _count: { select: { comments: true } },
      },
    });
  }

  // ─── F6.3 PBC ↔ Workpaper links ──────────────────────────────────────────────

  async getPbcLinks(paperId: string, user: AuthUser) {
    const wp = await this.findOne(paperId, user);
    // Return all PBC requests for the same audit, marking which are linked
    const [linked, allPbc] = await Promise.all([
      this.prisma.pbcPaperLink.findMany({
        where:   { paperId },
        include: {
          pbc: {
            select: {
              id: true, title: true, description: true,
              requestedToEmail: true, status: true, fileUrls: true, submittedAt: true,
            },
          },
        },
      }),
      this.prisma.pbcRequest.findMany({
        where: { auditId: wp.auditId },
        select: {
          id: true, title: true, description: true,
          requestedToEmail: true, status: true, fileUrls: true, submittedAt: true,
        },
      }),
    ]);

    const linkedIds = new Set(linked.map(l => l.pbcId));
    return {
      linkedItems: linked,
      availableItems: allPbc.filter(p => !linkedIds.has(p.id)),
    };
  }

  async linkPbc(paperId: string, pbcId: string, user: AuthUser) {
    await this.findOne(paperId, user);
    // Validate pbc belongs to same org
    const pbc = await this.prisma.pbcRequest.findFirst({
      where: { id: pbcId, audit: { organizationId: user.organizationId } },
    });
    if (!pbc) throw new NotFoundException('Solicitud PBC no encontrada');

    return this.prisma.pbcPaperLink.upsert({
      where:  { pbcId_paperId: { pbcId, paperId } },
      create: { pbcId, paperId, createdById: user.id },
      update: {},
    });
  }

  async unlinkPbc(linkId: string, user: AuthUser) {
    const link = await this.prisma.pbcPaperLink.findUnique({
      where:   { id: linkId },
      include: { paper: { include: { audit: { select: { organizationId: true } } } } },
    });
    if (!link) throw new NotFoundException('Vínculo no encontrado');
    if (link.paper.audit.organizationId !== user.organizationId) throw new ForbiddenException();

    await this.prisma.pbcPaperLink.delete({ where: { id: linkId } });
    return { deleted: true };
  }

  // ─── Master paper consolidation ───────────────────────────────────────────

  /**
   * Trigger AI consolidation of a MASTER paper.
   *
   * 1. Validates wpKind === MASTER.
   * 2. Sets syncStatus = REGENERATING (returned immediately to caller).
   * 3. Discovers source papers:
   *      a) Via explicit PaperLinks (targetId = this paper, isActive = true)
   *      b) Fallback: finds PT-A1, PT-A2, PT-A4 by paperCode in the same audit
   * 4. Emits `paper.consolidate` event — PaperConsolidationService handles it
   *    asynchronously: calls Gemini, updates sections, marks SYNCED.
   */
  async consolidateMasterPaper(id: string, user: AuthUser) {
    const wp = await this.findOne(id, user);

    if (wp.wpKind !== WpKind.MASTER) {
      throw new BadRequestException(
        'Solo los papeles MASTER pueden ser consolidados mediante este endpoint',
      );
    }

    // 1. Set REGENERATING immediately so the UI reacts
    await this.prisma.workingPaper.update({
      where: { id },
      data:  { syncStatus: SyncStatus.REGENERATING },
    });

    // 2a. Collect upstream papers via explicit PaperLinks
    const links = await this.prisma.paperLink.findMany({
      where:   { targetId: id, isActive: true },
      include: {
        source: {
          select: {
            id: true, code: true, title: true, paperCode: true,
            sections: { orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });

    let sourcePapers = links.map(l => ({
      paperId:   l.source.id,
      paperCode: l.source.paperCode,
      title:     l.source.title,
      sections:  l.source.sections as Array<{
        sectionKey: string; label: string; value: unknown;
        aiHint: string | null; isAutoFilled: boolean; sortOrder: number;
      }>,
    }));

    // 2b. Fallback: auto-discover PT-A1, PT-A2, PT-A4 in the same audit
    if (sourcePapers.length === 0) {
      const discovered = await this.prisma.workingPaper.findMany({
        where: {
          auditId:   wp.auditId,
          paperCode: { in: ['PT-A1', 'PT-A2', 'PT-A4'] },
        },
        include: { sections: { orderBy: { sortOrder: 'asc' } } },
      });
      sourcePapers = discovered.map(p => ({
        paperId:   p.id,
        paperCode: p.paperCode,
        title:     p.title,
        sections:  p.sections as Array<{
          sectionKey: string; label: string; value: unknown;
          aiHint: string | null; isAutoFilled: boolean; sortOrder: number;
        }>,
      }));
    }

    // 3. Emit event — fire-and-forget; PaperConsolidationService handles the AI work
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const auditTitle = String((wp as any).audit?.title ?? 'Sin título');
    this.eventEmitter.emit('paper.consolidate', {
      paperId:    id,
      paperCode:  wp.paperCode,
      auditId:    wp.auditId,
      auditTitle,
      sourceData: sourcePapers,
      // PI.5 — track who triggered the consolidation for version history
      userId:     user.id,
      reason:     wp.syncStatus === 'STALE' ? 'Re-consolidación tras cambios en fuentes' : 'Consolidación inicial',
    });

    return {
      paperId:           id,
      paperCode:         wp.paperCode,
      syncStatus:        SyncStatus.REGENERATING,
      sourcePapersFound: sourcePapers.length,
      message:           sourcePapers.length > 0
        ? `Consolidación IA iniciada con ${sourcePapers.length} fuente(s). El estado cambiará a "Al día" en segundos.`
        : 'Consolidación iniciada sin fuentes vinculadas — se generará contenido base. Vincule PT-A1, PT-A2 y PT-A4 para una consolidación completa.',
    };
  }
}
