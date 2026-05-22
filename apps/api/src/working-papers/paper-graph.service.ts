import {
  Injectable, NotFoundException, ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import { SyncStatus, WorkingPaperStatus } from '@prisma/client';
import { CreatePaperLinkDto } from './dto/paper-section.dto';

@Injectable()
export class PaperGraphService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ─── Graph propagation ───────────────────────────────────────────────────

  /**
   * Called when a section is updated in a SMART paper.
   * Finds all PaperLinks where sourceId = paperId AND sourceField matches,
   * marks each target paper as STALE (unless it is APPROVED).
   * Emits `paper.stale` for each affected paper.
   *
   * PCAOB/IAASB compliance: APPROVED papers are NEVER auto-rewritten.
   * Only the stale flag is set — the auditor must re-confirm.
   */
  async onSectionUpdated(
    paperId: string,
    sectionKey: string,
    _newValue: unknown,
  ): Promise<void> {
    const links = await this.prisma.paperLink.findMany({
      where:   { sourceId: paperId, sourceField: { startsWith: sectionKey }, isActive: true },
      include: { target: { select: { id: true, syncStatus: true, status: true } } },
    });

    for (const link of links) {
      const target = link.target;

      // PCAOB/IAASB compliance — never auto-modify an APPROVED paper
      if (target.status === WorkingPaperStatus.APPROVED) {
        continue;
      }

      if (target.syncStatus === SyncStatus.SYNCED) {
        await this.prisma.workingPaper.update({
          where: { id: target.id },
          data:  { syncStatus: SyncStatus.STALE },
        });

        this.eventEmitter.emit('paper.stale', {
          paperId:  target.id,
          sourceId: paperId,
          reason:   `Sección ${sectionKey} del papel fuente fue modificada`,
        });
      }
    }
  }

  /**
   * Get all papers that feed into a given paper (upstream / sources).
   */
  async getUpstreamPapers(paperId: string) {
    const links = await this.prisma.paperLink.findMany({
      where:   { targetId: paperId, isActive: true },
      include: {
        source: {
          select: {
            id: true, code: true, title: true,
            wpKind: true, syncStatus: true, paperCode: true,
          },
        },
      },
    });
    return links.map((l) => ({ ...l.source, sourceField: l.sourceField, targetField: l.targetField }));
  }

  /**
   * Get all papers that depend on a given paper (downstream / targets).
   */
  async getDownstreamPapers(paperId: string) {
    const links = await this.prisma.paperLink.findMany({
      where:   { sourceId: paperId, isActive: true },
      include: {
        target: {
          select: {
            id: true, code: true, title: true,
            wpKind: true, syncStatus: true, paperCode: true,
          },
        },
      },
    });
    return links.map((l) => ({ ...l.target, sourceField: l.sourceField, targetField: l.targetField }));
  }

  /**
   * Mark a paper and ALL its downstream dependents as STALE (cascades).
   * APPROVED papers are exempt per PCAOB/IAASB compliance.
   */
  async markStale(paperId: string, reason: string): Promise<void> {
    await this._markStaleRecursive(paperId, reason, new Set<string>());
  }

  private async _markStaleRecursive(
    paperId: string,
    reason:  string,
    visited: Set<string>,
  ): Promise<void> {
    if (visited.has(paperId)) return; // cycle guard
    visited.add(paperId);

    const paper = await this.prisma.workingPaper.findUnique({
      where:  { id: paperId },
      select: { id: true, syncStatus: true, status: true },
    });

    if (!paper) return;

    // PCAOB/IAASB compliance — skip APPROVED papers
    if (paper.status !== WorkingPaperStatus.APPROVED) {
      await this.prisma.workingPaper.update({
        where: { id: paperId },
        data:  { syncStatus: SyncStatus.STALE },
      });

      this.eventEmitter.emit('paper.stale', { paperId, reason });
    }

    // Cascade to all downstream dependents
    const downstreamLinks = await this.prisma.paperLink.findMany({
      where:  { sourceId: paperId, isActive: true },
      select: { targetId: true },
    });

    for (const link of downstreamLinks) {
      await this._markStaleRecursive(link.targetId, reason, visited);
    }
  }

  // ─── Link management ─────────────────────────────────────────────────────

  /**
   * Create a directional link between two papers.
   * The target paper `id` is taken from the route param; sourceId is in the DTO.
   */
  async createLink(targetId: string, dto: CreatePaperLinkDto, user: AuthUser) {
    // Verify target paper belongs to user's org
    const target = await this.prisma.workingPaper.findUnique({
      where:   { id: targetId },
      include: { audit: { select: { organizationId: true } } },
    });
    if (!target) throw new NotFoundException('Papel destino no encontrado');
    if (target.audit.organizationId !== user.organizationId) throw new ForbiddenException();

    // Verify source paper belongs to user's org
    const source = await this.prisma.workingPaper.findUnique({
      where:   { id: dto.sourceId },
      include: { audit: { select: { organizationId: true } } },
    });
    if (!source) throw new NotFoundException('Papel fuente no encontrado');
    if (source.audit.organizationId !== user.organizationId) throw new ForbiddenException();

    return this.prisma.paperLink.create({
      data: {
        sourceId:    dto.sourceId,
        targetId,
        sourceField: dto.sourceField,
        targetField: dto.targetField,
        mappingType: dto.mappingType ?? 'DIRECT',
        description: dto.description,
        isActive:    dto.isActive ?? true,
      },
    });
  }

  // ─── Graph overview ──────────────────────────────────────────────────────

  /**
   * Return both upstream sources and downstream targets with sync status.
   */
  async getGraphForPaper(paperId: string, user: AuthUser) {
    const paper = await this.prisma.workingPaper.findUnique({
      where:   { id: paperId },
      include: { audit: { select: { organizationId: true } } },
    });
    if (!paper) throw new NotFoundException('Papel de trabajo no encontrado');
    if (paper.audit.organizationId !== user.organizationId) throw new ForbiddenException();

    const [sources, targets] = await Promise.all([
      this.getUpstreamPapers(paperId),
      this.getDownstreamPapers(paperId),
    ]);

    return { sources, targets };
  }
}
