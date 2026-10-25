import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { RefType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import { assertAuditVisible, assertInvestigationAccess, AUDIT_ACCESS_SELECT } from '../common/utils/investigation-scope.util';

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
  paperCode:    string | null;  // PT-A2, PT-MRCI… — plantilla del papel, no confundir con `code`
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
    await assertAuditVisible(this.prisma, auditId, user); // modo investigación (2026-10-25): índice de todos los papeles y secciones

    const papers = await this.prisma.workingPaper.findMany({
      where:   { auditId },
      orderBy: [{ indexSection: 'asc' }, { code: 'asc' }],
      select:  {
        id:    true,
        code:  true,
        paperCode: true,
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
      paperCode: p.paperCode,
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
      select: { id: true, auditId: true, audit: { select: AUDIT_ACCESS_SELECT } },
    });
    if (!sourcePaper)
      throw new NotFoundException('Papel origen no encontrado');
    if (sourcePaper.audit.organizationId !== user.organizationId)
      throw new ForbiddenException('Sin acceso');
    assertInvestigationAccess(sourcePaper.audit, user);

    // Verify target paper belongs to same org
    const targetPaper = await this.prisma.workingPaper.findFirst({
      where:  { id: dto.targetPaperId },
      select: { id: true, auditId: true, audit: { select: AUDIT_ACCESS_SELECT } },
    });
    if (!targetPaper)
      throw new NotFoundException('Papel destino no encontrado');
    if (targetPaper.audit.organizationId !== user.organizationId)
      throw new ForbiddenException('Sin acceso al papel destino');
    assertInvestigationAccess(targetPaper.audit, user);
    // Las referencias @mención son entre papeles de la misma auditoría (el índice de mención es por auditoría).
    if (targetPaper.auditId !== sourcePaper.auditId) throw new BadRequestException('Solo se puede hacer referencia a papeles de la misma auditoría.');

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
      select: { id: true, audit: { select: AUDIT_ACCESS_SELECT } },
    });
    if (!paper) throw new NotFoundException('Papel no encontrado');
    if (paper.audit.organizationId !== user.organizationId)
      throw new ForbiddenException('Sin acceso');
    assertInvestigationAccess(paper.audit, user);

    return this.prisma.paperReference.findMany({
      // Solo referencias a papeles del mismo encargo (modo investigación, 2026-10-25).
      where: { sourcePaperId: paperId, targetPaper: { audit: { workingPapers: { some: { id: paperId } } } } },
      include: {
        targetPaper: { select: { code: true, title: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}
