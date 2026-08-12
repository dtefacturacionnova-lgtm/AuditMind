import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import { PaperGraphService } from './paper-graph.service';
import { PAPER_TEMPLATES } from './paper-templates';
import { AiService } from '../ai/ai.service';

@Injectable()
export class PaperSectionsService {
  private readonly logger = new Logger(PaperSectionsService.name);

  private readonly geminiEndpoint =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

  constructor(
    private readonly prisma:       PrismaService,
    private readonly graphService: PaperGraphService,
    private readonly config:       ConfigService,
    private readonly aiService:    AiService,
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
   * Lazy-sync:
   *   1. Missing sections (sectionKey not in DB) are created from the template.
   *   2. Existing sections whose fieldType, label, sortOrder or aiHint differ from the
   *      current template are updated — preserving the value UNLESS the fieldType changed
   *      to an incompatible structural type (PROCEDURE_GRID, MATRIX, REFERENCE, etc.),
   *      in which case the stale text value is cleared so the UI renders correctly.
   */
  async getSections(paperId: string, user: AuthUser) {
    await this.assertPaperAccess(paperId, user);

    const paper = await this.prisma.workingPaper.findUnique({
      where:  { id: paperId },
      select: { paperCode: true },
    });

    if (paper?.paperCode && PAPER_TEMPLATES[paper.paperCode]) {
      const tplSections = PAPER_TEMPLATES[paper.paperCode];

      const existing = await this.prisma.paperSection.findMany({
        where:  { paperId },
        select: { sectionKey: true, fieldType: true, label: true, sortOrder: true, aiHint: true },
      });
      const existingMap = new Map(existing.map(s => [s.sectionKey, s]));

      // 1 — create missing sections
      const missing = tplSections.filter(t => !existingMap.has(t.sectionKey));
      if (missing.length > 0) {
        await this.prisma.paperSection.createMany({
          data: missing.map(t => ({
            paperId,
            sectionKey:   t.sectionKey,
            label:        t.label,
            description:  t.description ?? null,
            fieldType:    t.fieldType as any,
            isRequired:   t.isRequired  ?? false,
            isAutoFilled: t.isAutoFilled ?? false,
            sourceRef:    t.sourceRef   ?? null,
            sortOrder:    t.sortOrder   ?? 0,
            aiHint:       t.aiHint      ?? null,
            options:      t.options ? (t.options as any) : undefined,
          })),
          skipDuplicates: true,
        });
      }

      // 2 — sync metadata of existing sections whose fieldType or sortOrder drifted
      const STRUCTURAL_TYPES = new Set([
        'PROCEDURE_GRID', 'MATRIX', 'REFERENCE', 'RISK_REF',
        'ATTACHMENT', 'BOOLEAN', 'ACCOUNT_SCHEDULE', 'DECLARATIONS',
        'LEGAL_MATRIX', 'AUDIT_REPORTS', 'CHECKLIST', 'COMMUNICATION_LOG',
        'ENUM_SELECT',
      ]);
      const stale = tplSections.filter(t => {
        const e = existingMap.get(t.sectionKey);
        if (!e) return false;
        return e.fieldType !== (t.fieldType as string)
          || e.sortOrder  !== (t.sortOrder ?? 0)
          || e.label      !== t.label
          || e.aiHint     !== (t.aiHint ?? null);
      });
      for (const t of stale) {
        const e = existingMap.get(t.sectionKey)!;
        const fieldTypeChanged = e.fieldType !== (t.fieldType as string);
        // Clear the stored value only when moving to an incompatible structural type
        const clearValue = fieldTypeChanged && STRUCTURAL_TYPES.has(t.fieldType as string);
        await this.prisma.paperSection.updateMany({
          where:  { paperId, sectionKey: t.sectionKey },
          data: {
            fieldType:   t.fieldType as any,
            label:       t.label,
            description: t.description ?? null,
            sortOrder:   t.sortOrder   ?? 0,
            aiHint:      t.aiHint      ?? null,
            sourceRef:   t.sourceRef   ?? null,
            options:     t.options ? (t.options as any) : undefined,
            ...(clearValue ? { value: Prisma.DbNull } : {}),
          },
        });
      }
    }

    const sections = await this.prisma.paperSection.findMany({
      where:   { paperId },
      orderBy: { sortOrder: 'asc' },
    });

    // Attach linkedFrom/tab from the template (not persisted — they're structural
    // constants of the paper, recomputed fresh on every read).
    const tplByKey = paper?.paperCode && PAPER_TEMPLATES[paper.paperCode]
      ? new Map(PAPER_TEMPLATES[paper.paperCode].map(t => [t.sectionKey, t]))
      : null;
    if (!tplByKey) return sections;
    return sections.map(s => ({
      ...s,
      linkedFrom: tplByKey.get(s.sectionKey)?.linkedFrom ?? null,
      tab:        tplByKey.get(s.sectionKey)?.tab ?? null,
    }));
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updated = await this.prisma.paperSection.upsert({
      where:  { paperId_sectionKey: { paperId, sectionKey } },
      create: {
        paperId, sectionKey, label: sectionKey,
        fieldType:    'TEXTAREA' as any,
        value:        value as any,
        isRequired:   false,
        isAutoFilled: false,
        sortOrder:    999,
      },
      update: { value: value as any, isStale: false, staleSince: null, staleReason: null },
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
  ): Promise<{ suggestion: string; usedAI: boolean; isStructured?: boolean }> {
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

    const baseCtx = {
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
    };

    const apiKey = this.config.get<string>('GEMINI_API_KEY', '');

    // MATRIX sections need structured JSON rows, not free-form prose.
    if (section.fieldType === 'MATRIX') {
      if (!apiKey) {
        this.logger.warn('[AssistSection] GEMINI_API_KEY not set — returning empty matrix fallback');
        return { suggestion: '[]', usedAI: false, isStructured: true };
      }
      try {
        const rows = await this.callGeminiJson(apiKey, this.buildMatrixAssistPrompt(baseCtx));
        return { suggestion: JSON.stringify(rows), usedAI: true, isStructured: true };
      } catch (err) {
        this.logger.error('[AssistSection] Gemini matrix generation failed, using empty fallback', String(err));
        return { suggestion: '[]', usedAI: false, isStructured: true };
      }
    }

    const prompt = this.buildSectionAssistPrompt(baseCtx);

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

  // ─── PI.7c — COSO 2013 auto-assessment ───────────────────────────────────

  /**
   * Build context from related papers (PT-A1, PT-A2, PT-A3) + the current paper,
   * then call the AI service to produce a structured COSO 2013 assessment.
   *
   * Returns the structured assessment — does NOT mutate the paper. The frontend
   * lets the auditor pick which parts to apply.
   */
  async runCosoAssess(paperId: string, user: AuthUser) {
    const wp = await this.assertPaperAccess(paperId, user);

    // Audit context
    const audit = await this.prisma.audit.findUnique({
      where:  { id: wp.auditId },
      select: { title: true, scope: true, type: true, subtype: true },
    });

    // Gather peer papers from the same audit by paperCode
    const peers = await this.prisma.workingPaper.findMany({
      where: {
        auditId:   wp.auditId,
        paperCode: { in: ['PT-A1', 'PT-A2', 'PT-A3', 'PT-A4', 'PT-A5', 'PT-COSO'] },
      },
      include: { sections: { orderBy: { sortOrder: 'asc' } } },
    });

    const peerByCode = new Map<string, typeof peers[number]>();
    for (const p of peers) {
      if (p.paperCode) peerByCode.set(p.paperCode, p);
    }

    const summarizePaper = (p: (typeof peers)[number] | undefined): string => {
      if (!p) return '';
      const sectionsText = p.sections
        .filter(s => s.value != null && String(s.value).trim().length > 0)
        .slice(0, 12)
        .map(s => `  • ${s.label}: ${this.valueToText(s.value).slice(0, 400)}`)
        .join('\n');
      return [
        `Papel: ${p.code} — ${p.title}`,
        p.narrative ? `Narrativa: ${p.narrative.slice(0, 600)}` : '',
        sectionsText ? `Secciones:\n${sectionsText}` : '',
      ].filter(Boolean).join('\n');
    };

    // Findings summary — last 10 findings of this audit
    const findings = await this.prisma.finding.findMany({
      where:  { auditId: wp.auditId },
      orderBy: { createdAt: 'desc' },
      take:    10,
      select:  { title: true, severity: true, condition: true, status: true },
    });
    const findingsSummary = findings.length === 0
      ? ''
      : findings
        .map(f => `[${f.severity}] ${f.title} (${f.status}) — ${f.condition.slice(0, 250)}`)
        .join('\n');

    // Current A-06 / COSO paper notes — own sections + narrative
    const currentSections = await this.prisma.paperSection.findMany({
      where: { paperId }, orderBy: { sortOrder: 'asc' },
    });
    const currentCosoNotes = [
      wp.narrative ? `Narrativa actual: ${wp.narrative.slice(0, 600)}` : '',
      ...currentSections
        .filter(s => s.value != null && String(s.value).trim().length > 0)
        .map(s => `${s.label}: ${this.valueToText(s.value).slice(0, 400)}`),
    ].filter(Boolean).join('\n');

    const payload = {
      auditTitle:        audit?.title ?? wp.title,
      auditType:         audit?.type,
      scope:             audit?.scope ?? undefined,
      entityContext:     summarizePaper(peerByCode.get('PT-A1')),
      riskAssessment:    summarizePaper(peerByCode.get('PT-A2')),
      controlEvaluation: summarizePaper(peerByCode.get('PT-A3')),
      rmmMatrix:         summarizePaper(peerByCode.get('PT-A5')),
      cosoEvaluation:    summarizePaper(peerByCode.get('PT-COSO')),
      currentCosoNotes:  currentCosoNotes || undefined,
      findingsSummary:   findingsSummary || undefined,
    };

    const aiResponse = await this.aiService.cosoAssess(payload) as {
      assessment: unknown;
      model:      string;
      tokens_used: number;
    };

    return {
      paperId,
      assessment: aiResponse.assessment,
      model:      aiResponse.model,
      tokensUsed: aiResponse.tokens_used,
      generatedAt: new Date().toISOString(),
    };
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

  private buildMatrixAssistPrompt(ctx: {
    paperTitle: string; paperCode: string;
    sectionKey: string; sectionLabel: string; sectionDescription: string;
    currentValue: string; aiHint: string;
    siblings: Array<{ key: string; label: string; value: string }>;
    auditTitle: string; auditScope: string; auditType: string; auditSubtype: string;
    userPrompt: string;
  }): string {
    // MATRIX generation often needs to analyze EVERY row of an upstream table (e.g. flag
    // accounts from a full trial balance) — the 400-char truncation used for narrative
    // drafts would only cover 2-3 rows, so structural/tabular siblings get much more room.
    const siblingsText = ctx.siblings
      .filter(s => s.value.trim())
      .slice(0, 8)
      .map(s => `[${s.key}] ${s.label}: ${s.value.slice(0, 12000)}`)
      .join('\n');

    return `Eres un experto en auditoría (NIA/IAASB/COSO). Estás generando el CONTENIDO TABULAR de una sección de un papel de trabajo — una tabla con filas y columnas, no texto narrativo.

CONTEXTO DE LA AUDITORÍA:
- Título: "${ctx.auditTitle}"
- Tipo: ${ctx.auditType}${ctx.auditSubtype ? ` / ${ctx.auditSubtype}` : ''}
- Alcance: ${ctx.auditScope || '(no especificado)'}

PAPEL DE TRABAJO: ${ctx.paperCode} — ${ctx.paperTitle}

TABLA A GENERAR:
- Clave: ${ctx.sectionKey}
- Título: ${ctx.sectionLabel}
- Instrucción: ${ctx.sectionDescription || '(sin descripción explícita)'}
- Especificación de columnas (úsala para definir las claves del JSON): ${ctx.aiHint || '(sin hint — infiere columnas razonables del título)'}
- Contenido actual: ${ctx.currentValue && ctx.currentValue !== '[]' ? ctx.currentValue : '(vacío — genera desde cero)'}

OTRAS SECCIONES YA COMPLETADAS DEL MISMO PAPEL (úsalas como fuente de datos reales cuando aplique):
${siblingsText || '(ninguna)'}

${ctx.userPrompt ? `INSTRUCCIÓN ADICIONAL DEL AUDITOR:\n${ctx.userPrompt}\n` : ''}
INSTRUCCIONES DE SALIDA:
- Responde EXCLUSIVAMENTE con un array JSON de objetos — sin markdown, sin \`\`\`json, sin preámbulo, sin comentarios.
- Cada objeto es una fila. Las claves (keys) de cada objeto deben ser los nombres cortos de columna descritos en la especificación (ej. "Ref. SEG", "Ciclo / Área", "Estado").
- TODAS las filas deben tener exactamente las mismas claves, en el mismo orden.
- Si no hay datos reales suficientes en el contexto para poblar filas con contenido verídico, devuelve un array vacío [] en vez de inventar datos del cliente (montos, nombres, fechas específicas).
- Si la instrucción pide filtrar (ej. solo cuentas que disparan una alerta, o con variación significativa), evalúa CADA fila de la fuente contra el criterio y genera una fila de salida únicamente para las que califican — no generes una fila por cada fila de la fuente si el criterio es selectivo.
- Máximo 40 filas.
- NO inventes datos específicos del cliente (NIT, montos, nombres) que no estén en el contexto — usa "Pendiente de evidencia" o similar cuando falte información y el campo sea obligatorio.`;
  }

  private async callGeminiJson(apiKey: string, prompt: string): Promise<unknown[]> {
    const res = await fetch(`${this.geminiEndpoint}?key=${apiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.25,
          maxOutputTokens: 6000,
          responseMimeType: 'application/json',
        },
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

    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error('Gemini matrix response is not a JSON array');
    return parsed;
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

  // ─── Auditoría Financiera: propagación determinista de balances ───────────

  /**
   * Propaga los totales del Clasificador de Cuentas (B-00 S2) a las Cédulas Sumarias
   * B-01..B-06 (sección S1 de cada una) de forma determinista — sin IA.
   *
   * Mapa sub-sumaria → paperCode:
   *   B-01a..d → PT-FIN-B01 (Activos Corrientes)
   *   B-02a..c → PT-FIN-B02 (Activos No Corrientes)
   *   B-03a..c → PT-FIN-B03 (Pasivos Corrientes)
   *   B-04a..b → PT-FIN-B04 (Pasivos No Corrientes)
   *   B-05a    → PT-FIN-B05 (Patrimonio)
   *   B-06a..d → PT-FIN-B06 (Resultados P&G)
   */
  async propagateTrialBalance(paperId: string, user: AuthUser) {
    const wp = await this.assertPaperAccess(paperId, user);

    if (wp.paperCode !== 'PT-FIN-B00') {
      throw new BadRequestException(
        'Solo el papel PT-FIN-B00 puede propagar balances a las cédulas sumarias',
      );
    }

    const s2 = await this.prisma.paperSection.findUnique({
      where: { paperId_sectionKey: { paperId, sectionKey: 'S2' } },
    });

    if (!s2?.value || !Array.isArray(s2.value) || (s2.value as unknown[]).length === 0) {
      throw new BadRequestException(
        'S2 (Clasificador de Cuentas) está vacío — guarde la clasificación antes de propagar',
      );
    }

    type MappingRow = {
      cuenta: string; descripcion: string;
      saldo_actual: number; saldo_anterior: number; saldo_anterior2: number;
      sub_sumaria: string; grupo: string;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapping = s2.value as unknown as MappingRow[];

    // Prefijo de sub-sumaria → código de papel lead schedule
    const SUB_TO_PAPER: Record<string, string> = {
      'B-01': 'PT-FIN-B01',
      'B-02': 'PT-FIN-B02',
      'B-03': 'PT-FIN-B03',
      'B-04': 'PT-FIN-B04',
      'B-05': 'PT-FIN-B05',
      'B-06': 'PT-FIN-B06',
    };

    // Agregar por sub-sumaria
    const bySubSumaria: Record<string, { sub_sumaria: string; grupo: string; saldo_actual: number; saldo_anterior: number; saldo_anterior2: number; n_cuentas: number }> = {};
    for (const m of mapping) {
      const key = m.sub_sumaria;
      if (!bySubSumaria[key]) {
        bySubSumaria[key] = { sub_sumaria: key, grupo: m.grupo, saldo_actual: 0, saldo_anterior: 0, saldo_anterior2: 0, n_cuentas: 0 };
      }
      bySubSumaria[key].saldo_actual    += m.saldo_actual   ?? 0;
      bySubSumaria[key].saldo_anterior  += m.saldo_anterior ?? 0;
      bySubSumaria[key].saldo_anterior2 += m.saldo_anterior2 ?? 0;
      bySubSumaria[key].n_cuentas++;
    }

    // Agrupar por lead schedule
    const byLeadSchedule: Record<string, typeof bySubSumaria[string][]> = {};
    for (const [sub, data] of Object.entries(bySubSumaria)) {
      if (sub === 'SIN_ASIGNAR') continue;
      const prefix = sub.substring(0, 4); // 'B-01', 'B-02', …
      const paperCode = SUB_TO_PAPER[prefix];
      if (!paperCode) continue;
      if (!byLeadSchedule[paperCode]) byLeadSchedule[paperCode] = [];
      byLeadSchedule[paperCode].push(data);
    }

    const targetPaperCodes = Object.keys(byLeadSchedule);
    if (!targetPaperCodes.length) {
      return { propagated: 0, message: 'No hay sub-sumarias asignadas para propagar' };
    }

    // Buscar los papeles de cédulas sumarias en la misma auditoría
    const leadSchedulePapers = await this.prisma.workingPaper.findMany({
      where:   { auditId: wp.auditId, paperCode: { in: targetPaperCodes } },
      include: { sections: { where: { sectionKey: 'S1' } } },
    });

    let propagated = 0;
    for (const lsPaper of leadSchedulePapers) {
      if (!lsPaper.paperCode) continue;
      const sectionData = byLeadSchedule[lsPaper.paperCode];
      if (!sectionData?.length) continue;

      const s1Section = lsPaper.sections.find(s => s.sectionKey === 'S1');
      if (!s1Section) continue;

      // Escribir la tabla de totales como MATRIX JSON en S1
      const sortedData = [...sectionData].sort((a, b) => a.sub_sumaria.localeCompare(b.sub_sumaria));
      await this.prisma.paperSection.update({
        where: { paperId_sectionKey: { paperId: lsPaper.id, sectionKey: 'S1' } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data:  { value: sortedData as any, isStale: false, staleSince: null, staleReason: null },
      });

      await this.graphService.onSectionUpdated(lsPaper.id, 'S1', sortedData);
      propagated++;
    }

    return {
      propagated,
      total:   targetPaperCodes.length,
      message: `${propagated} de ${targetPaperCodes.length} cédulas sumarias actualizadas`,
    };
  }

  // ─── Auditoría Financiera: propagación de balances a B-07 Análisis Horizontal ─

  /**
   * Llena PT-FIN-B07 S1 (Análisis Horizontal) con los saldos de 3 períodos ya
   * clasificados en PT-FIN-B00 S2 — la misma fuente de la que ya se calculan
   * B-01..B-06. Determinista (sin IA): S1 declaraba isAutoFilled+sourceRef pero
   * no existía ninguna propagación real, dejando el grid vacío ("La IA no
   * encontró información") aunque el balance ya estuviera cargado. Sobrescribe
   * S1 por completo en cada corrida (igual que propagateTrialBalance), porque
   * es un reflejo directo del balance, no contiene anotaciones del auditor que
   * deban preservarse. S2 (Vertical), S3 (Ratios) y S4 (Procedimientos) leen
   * S1 como contexto de sección hermana en "Generar con IA" — no necesitan
   * propagación propia una vez S1 tiene datos reales.
   */
  async propagateFinancialAnalysis(paperId: string, user: AuthUser) {
    const wp = await this.assertPaperAccess(paperId, user);

    if (wp.paperCode !== 'PT-FIN-B07') {
      throw new BadRequestException(
        'Solo el papel PT-FIN-B07 puede propagar el Análisis Horizontal desde B-00',
      );
    }

    const b00 = await this.prisma.workingPaper.findFirst({
      where:   { auditId: wp.auditId, paperCode: 'PT-FIN-B00' },
      include: { sections: { where: { sectionKey: 'S2' } } },
    });

    type MappingRow = {
      cuenta: string; descripcion: string;
      saldo_actual: number; saldo_anterior: number; saldo_anterior2: number;
    };
    const accounts = (b00?.sections[0]?.value ?? []) as unknown as MappingRow[];
    if (!Array.isArray(accounts) || accounts.length === 0) {
      throw new BadRequestException(
        'El Clasificador de Cuentas de B-00 (S2) está vacío — cargue y clasifique el balance antes de propagar',
      );
    }

    const pct = (curr: number, prior: number): string => {
      if (!prior) return curr ? 'N/A' : '0.00';
      return (((curr - prior) / Math.abs(prior)) * 100).toFixed(2);
    };
    const tendencia = (varPctStr: string): string => {
      const v = parseFloat(varPctStr);
      if (!Number.isFinite(v)) return '→ Estable';
      if (v > 1) return '↑ Creciente';
      if (v < -1) return '↓ Decreciente';
      return '→ Estable';
    };

    const rows = [...accounts]
      .sort((a, b) => String(a.cuenta ?? '').localeCompare(String(b.cuenta ?? '')))
      .map(a => {
        const actual    = Number(a.saldo_actual) || 0;
        const anterior   = Number(a.saldo_anterior) || 0;
        const anterior2  = Number(a.saldo_anterior2) || 0;
        const varPct1    = pct(actual, anterior);
        return {
          'Código':                            String(a.cuenta ?? ''),
          'Cuenta':                             String(a.descripcion ?? ''),
          'Saldo Año Actual':                   actual.toFixed(2),
          'Saldo Año Anterior':                 anterior.toFixed(2),
          'Saldo Año -2':                       anterior2.toFixed(2),
          'Variación $ Actual vs Anterior':     (actual - anterior).toFixed(2),
          'Variación % Actual vs Anterior':     varPct1,
          'Variación $ Anterior vs Año-2':      (anterior - anterior2).toFixed(2),
          'Variación % Anterior vs Año-2':      pct(anterior, anterior2),
          'Tendencia':                          tendencia(varPct1),
        };
      });

    await this.prisma.paperSection.update({
      where: { paperId_sectionKey: { paperId, sectionKey: 'S1' } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data:  { value: rows as any, isStale: false, staleSince: null, staleReason: null },
    });
    await this.graphService.onSectionUpdated(paperId, 'S1', rows);

    return {
      propagated: rows.length,
      message: `${rows.length} cuenta(s) propagadas desde el Balance de Comprobación (B-00).`,
    };
  }

  // ─── Auditoría Financiera: propagación de AJEs a B-09 Libro de AJEs ──────────

  /**
   * Trae al Libro de AJEs (PT-FIN-B09 S1) los asientos aceptados registrados en
   * PT-FIN-B08 S4 (mismo esquema pareado Debe/Haber — copia directa) y en
   * PT-ADJ-RECLASIF S1 (una fila por pierna Dr/Cr — se agrupan por "# AJE" para
   * reconstruir el asiento). No sobrescribe filas agregadas manualmente ni pisa
   * ediciones ya hechas por el auditor sobre una fila previamente propagada
   * (Descripción Técnica / Base NIIF/NIA / Estado) — solo refresca las cuentas
   * y montos, que deben reflejar siempre la fuente.
   */
  async propagateAjustes(paperId: string, user: AuthUser) {
    const wp = await this.assertPaperAccess(paperId, user);

    if (wp.paperCode !== 'PT-FIN-B09') {
      throw new BadRequestException(
        'Solo el papel PT-FIN-B09 puede propagar ajustes desde B-08 y PT-ADJ-RECLASIF',
      );
    }

    type AjeRow = Record<string, string>;
    const asRows = (value: unknown): Record<string, unknown>[] => (Array.isArray(value) ? value : []);
    const norm = (v: unknown): string => (v == null ? '' : String(v)).trim();
    const isAccepted = (estado: string) => /acept/i.test(estado);

    // ── Fuente 1: PT-FIN-B08 S4 — mismo esquema pareado, copia directa ────────
    const b08 = await this.prisma.workingPaper.findFirst({
      where:   { auditId: wp.auditId, paperCode: 'PT-FIN-B08' },
      include: { sections: { where: { sectionKey: 'S4' } } },
    });
    const fromB08: AjeRow[] = asRows(b08?.sections[0]?.value)
      .filter(r => isAccepted(norm(r['Estado'])))
      .map(r => ({
        '# AJE':              norm(r['# AJE']),
        'Origen':              'B-08',
        'Cuenta Debe Código':  norm(r['Cuenta Debe Código']),
        'Cuenta Debe Nombre':  norm(r['Cuenta Debe Nombre']),
        'Monto Debe':          norm(r['Monto Debe']),
        'Cuenta Haber Código': norm(r['Cuenta Haber Código']),
        'Cuenta Haber Nombre': norm(r['Cuenta Haber Nombre']),
        'Monto Haber':         norm(r['Monto Haber']),
        'Descripción Técnica': norm(r['Descripción Técnica']),
        'Base NIIF/NIA':       norm(r['Base NIIF/NIA']),
        'Estado':              'Propuesto',
      }))
      .filter(r => r['# AJE']);

    // ── Fuente 2: PT-ADJ-RECLASIF S1 — una pierna Dr/Cr por fila, agrupar por # AJE ─
    const adj = await this.prisma.workingPaper.findFirst({
      where:   { auditId: wp.auditId, paperCode: 'PT-ADJ-RECLASIF' },
      include: { sections: { where: { sectionKey: 'S1' } } },
    });
    const acceptedAdjLegs = asRows(adj?.sections[0]?.value)
      .filter(r => norm(r['Estado']).toUpperCase().includes('ACEPTADO'));

    const legsByAje = new Map<string, Record<string, unknown>[]>();
    for (const r of acceptedAdjLegs) {
      const key = norm(r['# AJE']);
      if (!key) continue;
      if (!legsByAje.has(key)) legsByAje.set(key, []);
      legsByAje.get(key)!.push(r);
    }

    const fromAdj: AjeRow[] = [];
    let skippedIncomplete = 0;
    for (const [aje, legs] of legsByAje) {
      const dr = legs.find(l => /^d/i.test(norm(l['Naturaleza (Dr o Cr)'])));
      const cr = legs.find(l => /^c/i.test(norm(l['Naturaleza (Dr o Cr)'])));
      if (!dr || !cr) { skippedIncomplete++; continue; }
      const desc = norm(dr['Descripción del asiento']) || norm(cr['Descripción del asiento']);
      const ref  = norm(dr['Referencia PT soporte']) || norm(cr['Referencia PT soporte']);
      fromAdj.push({
        '# AJE':              aje,
        'Origen':              'PT-ADJ-RECLASIF',
        'Cuenta Debe Código':  norm(dr['Cuenta Código']),
        'Cuenta Debe Nombre':  norm(dr['Cuenta Nombre']),
        'Monto Debe':          norm(dr['Monto $']),
        'Cuenta Haber Código': norm(cr['Cuenta Código']),
        'Cuenta Haber Nombre': norm(cr['Cuenta Nombre']),
        'Monto Haber':         norm(cr['Monto $']),
        'Descripción Técnica': ref ? `${desc} (Ref: ${ref})` : desc,
        'Base NIIF/NIA':       '',
        'Estado':              'Propuesto',
      });
    }

    const incoming = [...fromB08, ...fromAdj];
    if (incoming.length === 0) {
      return {
        propagated: 0,
        added: 0,
        updated: 0,
        skippedIncomplete,
        message: skippedIncomplete > 0
          ? `No hay AJEs aceptados para propagar (${skippedIncomplete} de PT-ADJ-RECLASIF omitidos por no tener ambas piernas Debe/Haber).`
          : 'No hay AJEs aceptados en B-08 ni en PT-ADJ-RECLASIF para propagar.',
      };
    }

    // ── Merge con S1 existente ────────────────────────────────────────────────
    const s1 = await this.prisma.paperSection.findUnique({
      where: { paperId_sectionKey: { paperId, sectionKey: 'S1' } },
    });
    const existing = asRows(s1?.value) as AjeRow[];
    const keyOf = (r: AjeRow) => `${norm(r['Origen'])}::${norm(r['# AJE'])}`;

    let added = 0;
    let updated = 0;
    const merged = [...existing];
    for (const inc of incoming) {
      const key = keyOf(inc);
      const idx = merged.findIndex(r => keyOf(r) === key);
      if (idx === -1) {
        merged.push(inc);
        added++;
      } else {
        const prev = merged[idx];
        merged[idx] = {
          ...prev,
          'Cuenta Debe Código':  inc['Cuenta Debe Código'],
          'Cuenta Debe Nombre':  inc['Cuenta Debe Nombre'],
          'Monto Debe':          inc['Monto Debe'],
          'Cuenta Haber Código': inc['Cuenta Haber Código'],
          'Cuenta Haber Nombre': inc['Cuenta Haber Nombre'],
          'Monto Haber':         inc['Monto Haber'],
          // Preserve auditor edits made after a prior propagation — only fill if still blank.
          'Descripción Técnica': norm(prev['Descripción Técnica']) || inc['Descripción Técnica'],
          'Base NIIF/NIA':       norm(prev['Base NIIF/NIA']) || inc['Base NIIF/NIA'],
          'Estado':              norm(prev['Estado']) || inc['Estado'],
        };
        updated++;
      }
    }

    await this.prisma.paperSection.update({
      where: { paperId_sectionKey: { paperId, sectionKey: 'S1' } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data:  { value: merged as any, isStale: false, staleSince: null, staleReason: null },
    });
    await this.graphService.onSectionUpdated(paperId, 'S1', merged);

    return {
      propagated: added + updated,
      added,
      updated,
      skippedIncomplete,
      total: merged.length,
      message: `${added} AJE(s) nuevo(s), ${updated} actualizado(s)`
        + (skippedIncomplete ? `, ${skippedIncomplete} omitido(s) por datos incompletos.` : '.'),
    };
  }

  // ─── Auditoría Financiera: consolidación de diferencias a B-08 ──────────────

  /**
   * Consolida en PT-FIN-B08 S1 todas las diferencias registradas en S1 de cada
   * papel PT-FIN-C-SUST (C-01..C-14) y PT-FIN-C-NORM (C-13/C-15) de la
   * auditoría, calcula los totales por categoría vs UAE/MG en S2 (leyendo
   * PT-A4 vía getMaterialidadByAudit) y recalcula el semáforo preliminar de
   * S3. Sobrescribe S1/S2/S3 por completo en cada corrida — son un reflejo
   * directo de los papeles de ejecución y de la materialidad vigente, sin
   * anotaciones propias del auditor que deban preservarse (esas viven en
   * S4-S9: AJEs, respuesta del cliente, opinión y narrativa).
   */
  async propagateDiferencias(paperId: string, user: AuthUser) {
    const wp = await this.assertPaperAccess(paperId, user);

    if (wp.paperCode !== 'PT-FIN-B08') {
      throw new BadRequestException(
        'Solo el papel PT-FIN-B08 puede consolidar diferencias desde los papeles de ejecución',
      );
    }

    const norm = (v: unknown): string => (v == null ? '' : String(v)).trim();
    const asRows = (value: unknown): Record<string, unknown>[] => (Array.isArray(value) ? value : []);
    const asNumber = (v: unknown): number => {
      const n = parseFloat(String(v ?? '').replace(/[^\d.-]/g, ''));
      return Number.isFinite(n) ? n : 0;
    };

    const execPapers = await this.prisma.workingPaper.findMany({
      where:   { auditId: wp.auditId, paperCode: { in: ['PT-FIN-C-SUST', 'PT-FIN-C-NORM'] } },
      include: { sections: { where: { sectionKey: 'S1' } } },
    });

    type Tipo = 'Factual' | 'Por Estimación';
    type ConsolidatedRow = Record<string, string>;

    const consolidated: ConsolidatedRow[] = [];
    let seq = 0;

    for (const p of execPapers) {
      const origen = `${norm(p.code)} · ${norm(p.title)}`;
      const rows = asRows(p.sections[0]?.value);

      if (p.paperCode === 'PT-FIN-C-SUST') {
        for (const r of rows) {
          const diferencia = asNumber(r['Diferencia ($)'] ?? r['Diferencia']);
          if (!diferencia) continue; // sin diferencia real, no acumular ruido
          seq++;
          const naturaleza: string = norm(r['Naturaleza (Error/Estimación/Fraude/No ajustable)'] ?? r['Naturaleza']);
          const tipo: Tipo = /estimaci/i.test(naturaleza) ? 'Por Estimación' : 'Factual';
          consolidated.push({
            '#':               String(seq),
            'Papel de Origen': origen,
            'Área/Cuenta':     norm(r['Área/Cuenta']),
            'Descripción':     norm(r['Descripción de la diferencia'] ?? r['Descripción']),
            'Saldo s/Cliente': norm(r['Saldo según cliente ($)'] ?? r['Saldo según cliente']),
            'Saldo s/Auditor': norm(r['Saldo según auditor ($)'] ?? r['Saldo según auditor']),
            'Diferencia $':    diferencia.toFixed(2),
            'Tipo':            tipo,
            'Estado':          norm(r['Proponer AJE (Sí/No/Pendiente)'] ?? r['Proponer AJE']) || 'Pendiente',
          });
        }
      } else {
        // PT-FIN-C-NORM: hallazgos de cumplimiento — sin saldo cliente/auditor,
        // el impacto potencial se registra directamente como la diferencia.
        for (const r of rows) {
          const diferencia = asNumber(r['Impacto potencial en EEFF ($)'] ?? r['Impacto potencial en EEFF']);
          if (!diferencia) continue;
          seq++;
          consolidated.push({
            '#':               String(seq),
            'Papel de Origen': origen,
            'Área/Cuenta':     norm(r['Área']),
            'Descripción':     norm(r['Descripción del incumplimiento/riesgo'] ?? r['Descripción']),
            'Saldo s/Cliente': 'N/A',
            'Saldo s/Auditor': 'N/A',
            'Diferencia $':    diferencia.toFixed(2),
            'Tipo':            'Factual',
            'Estado':          norm(r['¿Revelar en dictamen? (Sí/No/Evaluar)'] ?? r['¿Revelar en dictamen?']) || 'Pendiente',
          });
        }
      }
    }

    // ── S1: consolidado ────────────────────────────────────────────────────
    await this.prisma.paperSection.update({
      where: { paperId_sectionKey: { paperId, sectionKey: 'S1' } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data:  { value: consolidated as any, isStale: false, staleSince: null, staleReason: null },
    });
    await this.graphService.onSectionUpdated(paperId, 'S1', consolidated);

    // ── S2/S3: totales por categoría vs materialidad ──────────────────────
    const { mg, uae } = await this.getMaterialidadByAudit(wp.auditId, user);

    if (mg == null) {
      return {
        consolidated: consolidated.length,
        sourcePapers: execPapers.length,
        message: `${consolidated.length} diferencia(s) consolidadas desde ${execPapers.length} papel(es) de ejecución. `
          + 'S2 y S3 no se calcularon: defina la materialidad en A-06 (PT-A4) primero.',
      };
    }

    const buckets: Record<Tipo, { total: number; count: number }> = {
      'Factual':        { total: 0, count: 0 },
      'Por Estimación': { total: 0, count: 0 },
    };
    for (const r of consolidated) {
      const b = buckets[r['Tipo'] as Tipo];
      b.total += asNumber(r['Diferencia $']);
      b.count++;
    }
    const grandTotal = buckets['Factual'].total + buckets['Por Estimación'].total;
    const supera = (v: number, threshold: number | null): string =>
      threshold == null ? 'N/A' : (v >= threshold ? 'Sí' : 'No');
    const catRow = (categoria: string, total: number, count: number): ConsolidatedRow => ({
      'Categoría':                categoria,
      'Total Acumulado':          total.toFixed(2),
      'UAE (50% MG)':             uae != null ? uae.toFixed(2) : 'N/A',
      'Materialidad Global (MG)': mg.toFixed(2),
      '¿Supera UAE?':             supera(total, uae),
      '¿Supera MG?':              supera(total, mg),
      '# Diferencias':            String(count),
    });

    const s2Rows: ConsolidatedRow[] = [
      catRow('Factual', buckets['Factual'].total, buckets['Factual'].count),
      catRow('Por Estimación', buckets['Por Estimación'].total, buckets['Por Estimación'].count),
      catRow('Proyectada', 0, 0),
      catRow('Total', grandTotal, consolidated.length),
    ];

    await this.prisma.paperSection.update({
      where: { paperId_sectionKey: { paperId, sectionKey: 'S2' } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data:  { value: s2Rows as any, isStale: false, staleSince: null, staleReason: null },
    });
    await this.graphService.onSectionUpdated(paperId, 'S2', s2Rows);

    const semaforo = grandTotal >= mg
      ? 'ROJO_SALVEDAD_O_ADVERSA'
      : (uae != null && grandTotal >= uae)
        ? 'AMARILLO_EVALUAR_SALVEDAD'
        : 'VERDE_OPINION_SIN_SALVEDADES';

    await this.prisma.paperSection.update({
      where: { paperId_sectionKey: { paperId, sectionKey: 'S3' } },
      data:  { value: semaforo, isStale: false, staleSince: null, staleReason: null },
    });
    await this.graphService.onSectionUpdated(paperId, 'S3', semaforo);

    return {
      consolidated: consolidated.length,
      sourcePapers: execPapers.length,
      grandTotal,
      semaforo,
      message: `${consolidated.length} diferencia(s) consolidadas desde ${execPapers.length} papel(es) de ejecución. `
        + `Total acumulado: $${grandTotal.toFixed(2)} — semáforo preliminar: ${semaforo.replace(/_/g, ' ')}.`,
    };
  }

  // ─── Auditoría Financiera: MG/ME/UAE cross-paper ────────────────────────────

  /**
   * Busca el papel PT-A4 de la auditoría y devuelve MG (S3), ME (S4) y UAE (S5).
   * Usado por el semáforo de cuentas de B-00 S6.
   */
  async getMaterialidadByAudit(auditId: string, user: AuthUser) {
    // Verify org membership via any paper in the audit
    const sample = await this.prisma.workingPaper.findFirst({
      where:   { auditId, audit: { organizationId: user.organizationId } },
      select:  { id: true },
    });
    if (!sample) throw new ForbiddenException();

    const paper = await this.prisma.workingPaper.findFirst({
      where:   { auditId, paperCode: 'PT-A4' },
      include: { sections: { where: { sectionKey: { in: ['S3', 'S4', 'S5'] } } } },
    });
    if (!paper) return { mg: null, me: null, uae: null, paperId: null };

    const s3 = paper.sections.find(s => s.sectionKey === 'S3');
    const s4 = paper.sections.find(s => s.sectionKey === 'S4');
    const s5 = paper.sections.find(s => s.sectionKey === 'S5');

    return {
      mg:      s3?.value != null ? Number(s3.value) : null,
      me:      s4?.value != null ? Number(s4.value) : null,
      uae:     s5?.value != null ? Number(s5.value) : null,
      paperId: paper.id,
    };
  }
}
