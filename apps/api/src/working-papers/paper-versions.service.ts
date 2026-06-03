/**
 * PI.5 — Version History MASTER con diff
 *
 * Servicio para listar, comparar y restaurar versiones históricas de un papel.
 * Las versiones se crean automáticamente vía PaperConsolidationService.snapshotCurrentState
 * cuando se ejecuta una consolidación MASTER.
 *
 * NIA 230 — Documentación de auditoría: trazabilidad completa de cambios.
 */
import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import { SyncStatus } from '@prisma/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SectionSnapshot {
  sectionKey:   string;
  label:        string;
  value:        unknown;
  isAutoFilled: boolean;
  sourceRef:    string | null;
}

export type ChangeType = 'unchanged' | 'added' | 'removed' | 'modified';

export interface WordToken {
  text:  string;
  type:  ChangeType;
}

export interface SectionDiff {
  sectionKey:    string;
  label:         string;
  changeType:    ChangeType;
  wordsAdded:    number;
  wordsRemoved:  number;
  oldTokens:     WordToken[];   // tokens for left side (v1)
  newTokens:     WordToken[];   // tokens for right side (v2)
}

export interface CompareResult {
  fromVersion:        number;
  toVersion:          number;
  fromDate:           string;
  toDate:             string;
  sectionsCompared:   number;
  sectionsModified:   number;
  sectionsAdded:      number;
  sectionsRemoved:    number;
  totalWordsAdded:    number;
  totalWordsRemoved:  number;
  narrativeDiff:      { oldTokens: WordToken[]; newTokens: WordToken[] } | null;
  sectionDiffs:       SectionDiff[];
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class PaperVersionsService {
  constructor(private readonly prisma: PrismaService) {}

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

  // ─── List versions ───────────────────────────────────────────────────────

  async listVersions(paperId: string, user: AuthUser) {
    await this.assertPaperAccess(paperId, user);

    const versions = await this.prisma.workingPaperVersion.findMany({
      where:   { paperId },
      orderBy: { version: 'desc' },
      select: {
        id: true, version: true, changedBy: true, changedAt: true,
        narrative: true, sectionsSnapshot: true, sourcePapersHashes: true,
        reason: true, consolidatedById: true, isRestore: true,
      },
    });

    // Resolve user names for changedBy / consolidatedById
    const userIds = new Set<string>();
    for (const v of versions) {
      if (v.consolidatedById) userIds.add(v.consolidatedById);
      if (v.changedBy && v.changedBy !== 'system') userIds.add(v.changedBy);
    }
    const users = userIds.size > 0
      ? await this.prisma.user.findMany({
          where:  { id: { in: Array.from(userIds) } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const userMap = new Map(users.map(u => [u.id, u]));

    return versions.map(v => {
      const sections = (v.sectionsSnapshot as SectionSnapshot[] | null) ?? [];
      const wordCount = this.countWords(v.narrative ?? '') +
                        sections.reduce((sum, s) => sum + this.countWords(this.valueText(s.value)), 0);
      return {
        id:             v.id,
        version:        v.version,
        changedAt:      v.changedAt.toISOString(),
        changedBy:      userMap.get(v.changedBy)?.name ?? userMap.get(v.changedBy)?.email ?? v.changedBy,
        consolidatedBy: v.consolidatedById ? userMap.get(v.consolidatedById)?.name ?? userMap.get(v.consolidatedById)?.email ?? null : null,
        reason:         v.reason,
        isRestore:      v.isRestore,
        sectionsCount:  sections.length,
        wordCount,
      };
    });
  }

  // ─── Get one version (full snapshot) ─────────────────────────────────────

  async getVersion(paperId: string, versionId: string, user: AuthUser) {
    await this.assertPaperAccess(paperId, user);

    const v = await this.prisma.workingPaperVersion.findUnique({
      where: { id: versionId },
    });
    if (!v || v.paperId !== paperId) {
      throw new NotFoundException('Versión no encontrada');
    }

    return {
      id:               v.id,
      version:          v.version,
      changedAt:        v.changedAt.toISOString(),
      changedBy:        v.changedBy,
      reason:           v.reason,
      isRestore:        v.isRestore,
      narrative:        v.narrative,
      sections:         (v.sectionsSnapshot as SectionSnapshot[] | null) ?? [],
      sourcePapersHashes: v.sourcePapersHashes,
    };
  }

  // ─── Compare two versions ────────────────────────────────────────────────

  async compareVersions(
    paperId: string,
    fromVersion: number,
    toVersion: number,
    user: AuthUser,
  ): Promise<CompareResult> {
    await this.assertPaperAccess(paperId, user);

    // Allow "0" as a special target to mean "current state of the paper"
    const [from, to] = await Promise.all([
      this.loadVersionByNumber(paperId, fromVersion),
      toVersion === 0
        ? this.loadCurrentAsVirtualVersion(paperId)
        : this.loadVersionByNumber(paperId, toVersion),
    ]);

    if (!from) throw new NotFoundException(`Versión ${fromVersion} no encontrada`);
    if (!to)   throw new NotFoundException(`Versión ${toVersion} no encontrada`);

    const fromSections = (from.sectionsSnapshot as SectionSnapshot[] | null) ?? [];
    const toSections   = (to.sectionsSnapshot   as SectionSnapshot[] | null) ?? [];

    // Map by sectionKey for alignment
    const fromMap = new Map(fromSections.map(s => [s.sectionKey, s]));
    const toMap   = new Map(toSections.map(s => [s.sectionKey, s]));
    const allKeys = new Set([...fromMap.keys(), ...toMap.keys()]);

    let sectionsModified = 0;
    let sectionsAdded    = 0;
    let sectionsRemoved  = 0;
    let totalWordsAdded   = 0;
    let totalWordsRemoved = 0;

    const sectionDiffs: SectionDiff[] = [];

    for (const key of Array.from(allKeys).sort()) {
      const oldSec = fromMap.get(key);
      const newSec = toMap.get(key);

      if (!oldSec && newSec) {
        sectionsAdded++;
        const tokens = this.tokenize(this.valueText(newSec.value), 'added');
        const wAdded = tokens.filter(t => t.type === 'added').length;
        totalWordsAdded += wAdded;
        sectionDiffs.push({
          sectionKey:   key,
          label:        newSec.label,
          changeType:   'added',
          wordsAdded:   wAdded,
          wordsRemoved: 0,
          oldTokens:    [],
          newTokens:    tokens,
        });
        continue;
      }

      if (oldSec && !newSec) {
        sectionsRemoved++;
        const tokens = this.tokenize(this.valueText(oldSec.value), 'removed');
        const wRemoved = tokens.filter(t => t.type === 'removed').length;
        totalWordsRemoved += wRemoved;
        sectionDiffs.push({
          sectionKey:   key,
          label:        oldSec.label,
          changeType:   'removed',
          wordsAdded:   0,
          wordsRemoved: wRemoved,
          oldTokens:    tokens,
          newTokens:    [],
        });
        continue;
      }

      if (oldSec && newSec) {
        const oldText = this.valueText(oldSec.value);
        const newText = this.valueText(newSec.value);
        const { oldTokens, newTokens, added, removed } = this.diffText(oldText, newText);
        if (added === 0 && removed === 0) {
          sectionDiffs.push({
            sectionKey:   key,
            label:        newSec.label,
            changeType:   'unchanged',
            wordsAdded:   0,
            wordsRemoved: 0,
            oldTokens,
            newTokens,
          });
        } else {
          sectionsModified++;
          totalWordsAdded   += added;
          totalWordsRemoved += removed;
          sectionDiffs.push({
            sectionKey:   key,
            label:        newSec.label,
            changeType:   'modified',
            wordsAdded:   added,
            wordsRemoved: removed,
            oldTokens,
            newTokens,
          });
        }
      }
    }

    // Diff the narrative itself
    let narrativeDiff: CompareResult['narrativeDiff'] = null;
    if (from.narrative || to.narrative) {
      const { oldTokens, newTokens } = this.diffText(from.narrative ?? '', to.narrative ?? '');
      narrativeDiff = { oldTokens, newTokens };
    }

    return {
      fromVersion: from.version,
      toVersion:   to.version,
      fromDate:    from.changedAt.toISOString(),
      toDate:      to.changedAt.toISOString(),
      sectionsCompared:  allKeys.size,
      sectionsModified,
      sectionsAdded,
      sectionsRemoved,
      totalWordsAdded,
      totalWordsRemoved,
      narrativeDiff,
      sectionDiffs,
    };
  }

  // ─── Restore a version ───────────────────────────────────────────────────

  async restoreVersion(
    paperId:   string,
    versionId: string,
    reason:    string | undefined,
    user:      AuthUser,
  ) {
    const paper = await this.assertPaperAccess(paperId, user);

    const target = await this.prisma.workingPaperVersion.findUnique({
      where: { id: versionId },
    });
    if (!target || target.paperId !== paperId) {
      throw new NotFoundException('Versión no encontrada');
    }

    // 1. Snapshot the CURRENT state as a new historical version (so it isn't lost)
    const currentSections = await this.prisma.paperSection.findMany({
      where:   { paperId }, orderBy: { sortOrder: 'asc' },
      select:  { sectionKey: true, label: true, value: true, isAutoFilled: true, sourceRef: true },
    });
    await this.prisma.workingPaperVersion.create({
      data: {
        paperId,
        version:          paper.version,
        content:          (paper.content ?? {}) as object,
        narrative:        paper.narrative,
        sectionsSnapshot: currentSections as unknown as object,
        reason:           reason
          ? `Estado previo a restauración de v${target.version}: ${reason}`
          : `Estado previo a restauración de v${target.version}`,
        consolidatedById: user.id,
        changedBy:        user.id,
        isRestore:        false,
      },
    });

    // 2. Apply the target version's snapshot back into the live paper
    const targetSections = (target.sectionsSnapshot as SectionSnapshot[] | null) ?? [];

    for (const s of targetSections) {
      await this.prisma.paperSection.updateMany({
        where: { paperId, sectionKey: s.sectionKey },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data:  { value: s.value as any, isStale: false, staleSince: null, staleReason: null },
      });
    }

    await this.prisma.workingPaper.update({
      where: { id: paperId },
      data: {
        narrative:    target.narrative,
        syncStatus:   SyncStatus.SYNCED,
        lastSyncedAt: new Date(),
        version:      { increment: 1 },
      },
    });

    // 3. Mark a NEW version as the restored result
    const updatedPaper = await this.prisma.workingPaper.findUnique({
      where: { id: paperId }, select: { version: true },
    });

    await this.prisma.workingPaperVersion.create({
      data: {
        paperId,
        version:          updatedPaper!.version,
        content:          (paper.content ?? {}) as object,
        narrative:        target.narrative,
        sectionsSnapshot: targetSections as unknown as object,
        reason:           `Restaurada de v${target.version}${reason ? ` — ${reason}` : ''}`,
        consolidatedById: user.id,
        changedBy:        user.id,
        isRestore:        true,
      },
    });

    return {
      restored:   true,
      fromVersion: target.version,
      newVersion:  updatedPaper!.version,
    };
  }

  // ─── Helpers — load versions ─────────────────────────────────────────────

  private async loadVersionByNumber(paperId: string, versionNumber: number) {
    return this.prisma.workingPaperVersion.findFirst({
      where:   { paperId, version: versionNumber },
      orderBy: { changedAt: 'desc' },
    });
  }

  /**
   * Builds a virtual "current" version from the live paper for comparison purposes.
   */
  private async loadCurrentAsVirtualVersion(paperId: string) {
    const paper = await this.prisma.workingPaper.findUnique({
      where:  { id: paperId },
      select: { narrative: true, version: true, content: true, updatedAt: true },
    });
    if (!paper) return null;
    const sections = await this.prisma.paperSection.findMany({
      where:   { paperId }, orderBy: { sortOrder: 'asc' },
      select:  { sectionKey: true, label: true, value: true, isAutoFilled: true, sourceRef: true },
    });

    return {
      version:          paper.version,
      narrative:        paper.narrative,
      sectionsSnapshot: sections,
      changedAt:        paper.updatedAt,
      sourcePapersHashes: {},
    };
  }

  // ─── Helpers — word counting and tokenization ────────────────────────────

  private valueText(v: unknown): string {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    return JSON.stringify(v);
  }

  private countWords(s: string): number {
    if (!s) return 0;
    return s.trim().split(/\s+/).filter(Boolean).length;
  }

  private tokenize(text: string, type: ChangeType): WordToken[] {
    if (!text) return [];
    return text.split(/(\s+)/).filter(Boolean).map(t => ({ text: t, type }));
  }

  /**
   * Word-level diff using the classic LCS (longest common subsequence)
   * dynamic programming algorithm. Produces token streams suitable for
   * side-by-side rendering: oldTokens (left) and newTokens (right).
   * Texts up to ~50k words are handled in <1s.
   */
  private diffText(
    oldText: string,
    newText: string,
  ): { oldTokens: WordToken[]; newTokens: WordToken[]; added: number; removed: number } {
    const oldWords = oldText.split(/(\s+)/).filter(Boolean);
    const newWords = newText.split(/(\s+)/).filter(Boolean);

    const m = oldWords.length;
    const n = newWords.length;

    // Cap to avoid OOM on huge papers
    if (m > 8000 || n > 8000) {
      return {
        oldTokens: oldWords.map(t => ({ text: t, type: 'removed' as ChangeType })),
        newTokens: newWords.map(t => ({ text: t, type: 'added'   as ChangeType })),
        added:   newWords.filter(w => w.trim()).length,
        removed: oldWords.filter(w => w.trim()).length,
      };
    }

    // LCS DP table (uint16 should be enough — capped above at 8000)
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (oldWords[i - 1] === newWords[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    const oldTokens: WordToken[] = [];
    const newTokens: WordToken[] = [];
    let added = 0;
    let removed = 0;

    let i = m, j = n;
    while (i > 0 && j > 0) {
      if (oldWords[i - 1] === newWords[j - 1]) {
        oldTokens.unshift({ text: oldWords[i - 1], type: 'unchanged' });
        newTokens.unshift({ text: newWords[j - 1], type: 'unchanged' });
        i--; j--;
      } else if (dp[i - 1][j] >= dp[i][j - 1]) {
        oldTokens.unshift({ text: oldWords[i - 1], type: 'removed' });
        if (oldWords[i - 1].trim()) removed++;
        i--;
      } else {
        newTokens.unshift({ text: newWords[j - 1], type: 'added' });
        if (newWords[j - 1].trim()) added++;
        j--;
      }
    }
    while (i > 0) {
      oldTokens.unshift({ text: oldWords[i - 1], type: 'removed' });
      if (oldWords[i - 1].trim()) removed++;
      i--;
    }
    while (j > 0) {
      newTokens.unshift({ text: newWords[j - 1], type: 'added' });
      if (newWords[j - 1].trim()) added++;
      j--;
    }

    return { oldTokens, newTokens, added, removed };
  }
}
