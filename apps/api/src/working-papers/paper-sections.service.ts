import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import { PaperGraphService } from './paper-graph.service';
import { PAPER_TEMPLATES } from './paper-templates';

@Injectable()
export class PaperSectionsService {
  private readonly logger = new Logger(PaperSectionsService.name);

  private readonly geminiEndpoint =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

  constructor(
    private readonly prisma:       PrismaService,
    private readonly graphService: PaperGraphService,
    private readonly config:       ConfigService,
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
   * When the auditor saves, the section is no longer "stale" — they have re-confirmed it.
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
      data:  { value: value as any, isStale: false, staleSince: null, staleReason: null },
    });

    // PI.2 — if no sections are stale anymore, clear paper-level STALE banner
    const remainingStale = await this.prisma.paperSection.count({
      where: { paperId, isStale: true },
    });
    if (remainingStale === 0) {
      const paper = await this.prisma.workingPaper.findUnique({
        where: { id: paperId }, select: { syncStatus: true },
      });
      if (paper?.syncStatus === 'STALE') {
        await this.prisma.workingPaper.update({
          where: { id: paperId },
          data:  { syncStatus: 'SYNCED', lastSyncedAt: new Date() },
        });
      }
    }

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

  // ─── PI.3: AI section-by-section assistant ────────────────────────────────

  /**
   * Generate an AI suggestion for a single section without overwriting the saved value.
   * Returns the suggested text — the auditor reviews and decides whether to accept.
   *
   * Uses the section's `aiHint` + the audit context + the paper title to build a
   * focused prompt. Does NOT mutate the section value (auditor controls acceptance).
   */
  async assistSection(
    paperId:    string,
    sectionKey: string,
    user:       AuthUser,
    userPrompt?: string,
  ): Promise<{ suggestion: string; usedAI: boolean }> {
    const wp = await this.assertPaperAccess(paperId, user);

    const section = await this.prisma.paperSection.findUnique({
      where: { paperId_sectionKey: { paperId, sectionKey } },
    });
    if (!section) throw new NotFoundException(`Sección '${sectionKey}' no encontrada`);

    // Gather all other sections of the same paper as context (current values)
    const siblings = await this.prisma.paperSection.findMany({
      where:   { paperId, NOT: { sectionKey } },
      orderBy: { sortOrder: 'asc' },
      select:  { sectionKey: true, label: true, value: true },
    });

    // Gather audit context
    const audit = await this.prisma.audit.findUnique({
      where:  { id: wp.auditId },
      select: { title: true, scope: true, type: true, subtype: true },
    });

    const prompt = this.buildSectionAssistPrompt({
      paperTitle:   wp.title,
      paperCode:    wp.paperCode ?? wp.code,
      sectionKey:   section.sectionKey,
      sectionLabel: section.label,
      sectionDescription: section.description ?? '',
      currentValue: this.valueToText(section.value),
      aiHint:       section.aiHint ?? '',
      siblings:     siblings.map(s => ({
        key:   s.sectionKey,
        label: s.label,
        value: this.valueToText(s.value),
      })),
      auditTitle:   audit?.title ?? '',
      auditScope:   audit?.scope ?? '',
      auditType:    audit?.type ?? '',
      auditSubtype: audit?.subtype ?? '',
      userPrompt:   userPrompt ?? '',
    });

    const apiKey = this.config.get<string>('GEMINI_API_KEY', '');
    if (!apiKey) {
      this.logger.warn('[AssistSection] GEMINI_API_KEY not set — returning template fallback');
      return {
        suggestion: this.fallbackSuggestion(section.label, section.description ?? '', section.aiHint ?? ''),
        usedAI:     false,
      };
    }

    try {
      const text = await this.callGeminiText(apiKey, prompt);
      return { suggestion: text, usedAI: true };
    } catch (err) {
      this.logger.error('[AssistSection] Gemini failed, using fallback', String(err));
      return {
        suggestion: this.fallbackSuggestion(section.label, section.description ?? '', section.aiHint ?? ''),
        usedAI:     false,
      };
    }
  }

  // ─── PI.2: Per-section stale management ───────────────────────────────────

  /**
   * Get all stale sections for a paper, with their staleSince/staleReason metadata.
   */
  async getStaleSections(paperId: string, user: AuthUser) {
    await this.assertPaperAccess(paperId, user);
    return this.prisma.paperSection.findMany({
      where:   { paperId, isStale: true },
      orderBy: { sortOrder: 'asc' },
      select:  {
        id: true, sectionKey: true, label: true, value: true,
        staleSince: true, staleReason: true, sortOrder: true,
      },
    });
  }

  /**
   * Manually clear the stale flag on a section (auditor confirms current value is still valid).
   * Does NOT change the value. If no stale sections remain, paper-level banner is cleared.
   */
  async confirmSection(paperId: string, sectionKey: string, user: AuthUser) {
    await this.assertPaperAccess(paperId, user);

    const section = await this.prisma.paperSection.findUnique({
      where: { paperId_sectionKey: { paperId, sectionKey } },
    });
    if (!section) throw new NotFoundException(`Sección '${sectionKey}' no encontrada`);
    if (!section.isStale) {
      return { ok: true, alreadyFresh: true };
    }

    await this.prisma.paperSection.update({
      where: { paperId_sectionKey: { paperId, sectionKey } },
      data:  { isStale: false, staleSince: null, staleReason: null },
    });

    // Clear paper-level banner if no more stale sections
    const remaining = await this.prisma.paperSection.count({
      where: { paperId, isStale: true },
    });
    if (remaining === 0) {
      const paper = await this.prisma.workingPaper.findUnique({
        where: { id: paperId }, select: { syncStatus: true },
      });
      if (paper?.syncStatus === 'STALE') {
        await this.prisma.workingPaper.update({
          where: { id: paperId },
          data:  { syncStatus: 'SYNCED', lastSyncedAt: new Date() },
        });
      }
    }

    return { ok: true, remainingStale: remaining };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private valueToText(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return JSON.stringify(value);
  }

  private buildSectionAssistPrompt(ctx: {
    paperTitle: string; paperCode: string;
    sectionKey: string; sectionLabel: string; sectionDescription: string;
    currentValue: string; aiHint: string;
    siblings: Array<{ key: string; label: string; value: string }>;
    auditTitle: string; auditScope: string; auditType: string; auditSubtype: string;
    userPrompt: string;
  }): string {
    const siblingsText = ctx.siblings
      .filter(s => s.value.trim())
      .slice(0, 8)
      .map(s => `[${s.key}] ${s.label}: ${s.value.slice(0, 300)}`)
      .join('\n');

    return `Eres un experto en auditoría (NIA/IAASB/COSO). Estás asistiendo al auditor a redactar UNA sección específica de un papel de trabajo.

CONTEXTO DE LA AUDITORÍA:
- Título: "${ctx.auditTitle}"
- Tipo: ${ctx.auditType}${ctx.auditSubtype ? ` / ${ctx.auditSubtype}` : ''}
- Alcance: ${ctx.auditScope || '(no especificado)'}

PAPEL DE TRABAJO: ${ctx.paperCode} — ${ctx.paperTitle}

SECCIÓN A REDACTAR:
- Clave: ${ctx.sectionKey}
- Título: ${ctx.sectionLabel}
- Instrucción: ${ctx.sectionDescription || '(sin descripción explícita)'}
- Hint IA: ${ctx.aiHint || '(sin hint)'}
- Valor actual: ${ctx.currentValue || '(vacío)'}

OTRAS SECCIONES YA COMPLETADAS DEL MISMO PAPEL:
${siblingsText || '(ninguna)'}

${ctx.userPrompt ? `INSTRUCCIÓN ADICIONAL DEL AUDITOR:\n${ctx.userPrompt}\n` : ''}
INSTRUCCIONES DE REDACCIÓN:
- Responde EXCLUSIVAMENTE con el contenido sugerido para esta sección — sin preámbulo, sin disclaimer.
- Español formal de auditoría. Tono profesional, conciso.
- Si la sección requiere un listado, usa viñetas o numeración.
- Si requiere narrativa, usa 2-4 párrafos máximo.
- NO inventes datos específicos del cliente (NIT, montos, nombres) que no estén en el contexto.
- Si necesitas referenciar otra sección o papel, usa el formato [CODE::SXX].
- Máximo 400 palabras.`;
  }

  private async callGeminiText(apiKey: string, prompt: string): Promise<string> {
    const res = await fetch(`${this.geminiEndpoint}?key=${apiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.35, maxOutputTokens: 1200 },
      }),
      signal: AbortSignal.timeout(45_000),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Gemini HTTP ${res.status}: ${errBody.slice(0, 200)}`);
    }

    const data = await res.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      error?: { message: string };
    };

    if (data.error) throw new Error(`Gemini error: ${data.error.message}`);
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (!text.trim()) throw new Error('Gemini returned empty text');
    return text.trim();
  }

  private fallbackSuggestion(label: string, description: string, aiHint: string): string {
    return `[Sugerencia de plantilla — IA no disponible]\n\n${label}\n\n${description || aiHint || 'Documente esta sección con base en las normas NIA aplicables, evidencia obtenida y juicio profesional del auditor.'}\n\nNota: configure GEMINI_API_KEY para activar el asistente IA contextual.`;
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
