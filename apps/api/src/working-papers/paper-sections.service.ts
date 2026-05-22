import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import { PaperGraphService } from './paper-graph.service';
import { PAPER_TEMPLATES } from './paper-templates';

@Injectable()
export class PaperSectionsService {
  constructor(
    private readonly prisma:       PrismaService,
    private readonly graphService: PaperGraphService,
  ) {}

  // ─── Access guard ────────────────────────────────────────────────────────

  private async assertPaperAccess(paperId: string, user: AuthUser) {
    const wp = await this.prisma.workingPaper.findUnique({
      where:   { id: paperId },
      include: { audit: { select: { organizationId: true } } },
    });
    if (!wp) throw new NotFoundException('Papel de trabajo no encontrado');
    if (wp.audit.organizationId !== user.organizationId) throw new ForbiddenException();
    return wp;
  }

  // ─── CRUD ────────────────────────────────────────────────────────────────

  /**
   * Get all sections for a paper ordered by sortOrder.
   */
  async getSections(paperId: string, user: AuthUser) {
    await this.assertPaperAccess(paperId, user);
    return this.prisma.paperSection.findMany({
      where:   { paperId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /**
   * Update a single section value and trigger graph propagation.
   */
  async updateSection(
    paperId:    string,
    sectionKey: string,
    value:      unknown,
    user:       AuthUser,
  ) {
    await this.assertPaperAccess(paperId, user);

    const existing = await this.prisma.paperSection.findUnique({
      where: { paperId_sectionKey: { paperId, sectionKey } },
    });
    if (!existing) throw new NotFoundException(`Sección '${sectionKey}' no encontrada en el papel`);

    const updated = await this.prisma.paperSection.update({
      where: { paperId_sectionKey: { paperId, sectionKey } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data:  { value: value as any },
    });

    // Propagate change to downstream papers
    await this.graphService.onSectionUpdated(paperId, sectionKey, value);

    return updated;
  }

  /**
   * Bulk upsert sections from a template (for initializing a paper from a template key).
   * templateKey must match a key in PAPER_TEMPLATES (e.g. "PT-A1").
   */
  async initFromTemplate(
    paperId:     string,
    templateKey: string,
    user:        AuthUser,
  ) {
    await this.assertPaperAccess(paperId, user);

    const template = PAPER_TEMPLATES[templateKey];
    if (!template) {
      throw new BadRequestException(
        `Plantilla '${templateKey}' no encontrada. Disponibles: ${Object.keys(PAPER_TEMPLATES).join(', ')}`,
      );
    }

    const upsertOps = template.map((t) =>
      this.prisma.paperSection.upsert({
        where:  { paperId_sectionKey: { paperId, sectionKey: t.sectionKey } },
        create: {
          paperId,
          sectionKey:   t.sectionKey,
          label:        t.label,
          description:  t.description,
          fieldType:    t.fieldType,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          value:        (t.defaultValue ?? null) as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          options:      t.options ? (t.options as any) : undefined,
          isRequired:   t.isRequired,
          isAutoFilled: t.isAutoFilled,
          sourceRef:    t.sourceRef,
          sortOrder:    t.sortOrder,
          aiHint:       t.aiHint,
        },
        update: {
          label:        t.label,
          description:  t.description,
          fieldType:    t.fieldType,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          options:      t.options ? (t.options as any) : undefined,
          isRequired:   t.isRequired,
          isAutoFilled: t.isAutoFilled,
          sourceRef:    t.sourceRef,
          sortOrder:    t.sortOrder,
          aiHint:       t.aiHint,
          // Note: we do NOT overwrite 'value' on update — preserve auditor's work
        },
      }),
    );

    // Also update paperCode on the working paper itself
    await this.prisma.workingPaper.update({
      where: { id: paperId },
      data:  { paperCode: templateKey },
    });

    return Promise.all(upsertOps);
  }

  /**
   * Compute a quality score (0-100) for a SMART paper based on section completeness.
   * Score = (completed required sections / total required sections) × 70
   *       + (completed optional sections / total optional sections) × 30
   */
  async computeQualityScore(paperId: string): Promise<number> {
    const sections = await this.prisma.paperSection.findMany({
      where: { paperId },
    });

    if (sections.length === 0) return 0;

    const required = sections.filter((s) => s.isRequired);
    const optional = sections.filter((s) => !s.isRequired);

    const isComplete = (s: { value: unknown }) =>
      s.value !== null && s.value !== undefined && s.value !== '' && s.value !== '{}';

    const reqCompleted = required.filter(isComplete).length;
    const optCompleted = optional.filter(isComplete).length;

    const reqScore = required.length > 0 ? (reqCompleted / required.length) * 70 : 70;
    const optScore = optional.length > 0 ? (optCompleted / optional.length) * 30 : 30;

    const score = Math.round(reqScore + optScore);

    // Persist quality score to DB
    await this.prisma.workingPaper.update({
      where: { id: paperId },
      data:  { qualityScore: score },
    });

    return score;
  }
}
