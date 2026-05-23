import {
  Injectable, NotFoundException, ForbiddenException,
} from '@nestjs/common';
import { RefType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateReferenceDto {
  sourceSectionKey: string;
  targetPaperId:    string;
  targetSectionKey?: string;
  refType?:         RefType;
}

// ─── Mention-index item returned to the frontend for autocomplete ─────────────

export interface MentionItem {
  paperId:      string;
  code:         string;   // A-01, B-00…
  title:        string;
  wpKind:       string;
  sections: {
    sectionKey: string;
    label:      string;
  }[];
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class PaperReferencesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns an index of all papers (+ their sections) belonging to the given
   * audit. Used by the frontend @mention autocomplete dropdown.
   */
  async getMentionIndex(auditId: string, user: AuthUser): Promise<MentionItem[]> {
    // Verify audit belongs to org
    const audit = await this.prisma.audit.findFirst({
      where: { id: auditId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!audit) throw new NotFoundException('Auditoría no encontrada');

    const papers = await this.prisma.workingPaper.findMany({
      where:   { auditId },
      orderBy: [{ indexSection: 'asc' }, { code: 'asc' }],
      select:  {
        id:    true,
        code:  true,
        title: true,
        wpKind: true,
        sections: {
          select:  { sectionKey: true, label: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    return papers.map(p => ({
      paperId:  p.id,
      code:     p.code,
      title:    p.title,
      wpKind:   p.wpKind,
      sections: p.sections.map(s => ({
        sectionKey: s.sectionKey,
        label:      s.label,
      })),
    }));
  }

  /**
   * Persists a @mention reference from (sourcePaper, sourceSectionKey)
   * → (targetPaper, targetSectionKey?).
   */
  async createReference(
    sourcePaperId: string,
    dto:           CreateReferenceDto,
    user:          AuthUser,
  ) {
    // Verify source paper belongs to org
    const sourcePaper = await this.prisma.workingPaper.findFirst({
      where:  { id: sourcePaperId },
      select: { id: true, audit: { select: { organizationId: true } } },
    });
    if (!sourcePaper)
      throw new NotFoundException('Papel origen no encontrado');
    if (sourcePaper.audit.organizationId !== user.organizationId)
      throw new ForbiddenException('Sin acceso');

    // Verify target paper belongs to same org
    const targetPaper = await this.prisma.workingPaper.findFirst({
      where:  { id: dto.targetPaperId },
      select: { id: true, audit: { select: { organizationId: true } } },
    });
    if (!targetPaper)
      throw new NotFoundException('Papel destino no encontrado');
    if (targetPaper.audit.organizationId !== user.organizationId)
      throw new ForbiddenException('Sin acceso al papel destino');

    // Determine refType
    const refType: RefType = dto.refType
      ?? (dto.targetSectionKey ? RefType.FIELD : RefType.INDEX);

    const targetSectionKey = dto.targetSectionKey ?? null;

    // Prisma upsert doesn't handle null in compound unique well — use find+create
    const existing = await this.prisma.paperReference.findFirst({
      where: {
        sourcePaperId,
        sourceSectionKey: dto.sourceSectionKey,
        targetPaperId:    dto.targetPaperId,
        targetSectionKey,
      },
    });

    if (existing) {
      return this.prisma.paperReference.update({
        where: { id: existing.id },
        data:  { refType },
      });
    }

    return this.prisma.paperReference.create({
      data: {
        sourcePaperId,
        sourceSectionKey: dto.sourceSectionKey,
        targetPaperId:    dto.targetPaperId,
        targetSectionKey,
        refType,
      },
    });
  }

  /**
   * Returns all @mention references that originate from a given paper,
   * including the target paper code and section label for display.
   */
  async getReferencesForPaper(paperId: string, user: AuthUser) {
    const paper = await this.prisma.workingPaper.findFirst({
      where:  { id: paperId },
      select: { id: true, audit: { select: { organizationId: true } } },
    });
    if (!paper) throw new NotFoundException('Papel no encontrado');
    if (paper.audit.organizationId !== user.organizationId)
      throw new ForbiddenException('Sin acceso');

    return this.prisma.paperReference.findMany({
      where: { sourcePaperId: paperId },
      include: {
        targetPaper: { select: { code: true, title: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}
