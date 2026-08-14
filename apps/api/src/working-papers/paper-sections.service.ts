import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, FindingSeverity, FindingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import { PaperGraphService } from './paper-graph.service';
import { PAPER_TEMPLATES } from './paper-templates';
import { AiService } from '../ai/ai.service';
import { ContentLibraryService } from '../content-library/content-library.service';
import { reliabilityFactor } from './reliability-factor';

@Injectable()
export class PaperSectionsService {
  private readonly logger = new Logger(PaperSectionsService.name);

  private readonly geminiEndpoint =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

  constructor(
    private readonly prisma:         PrismaService,
    private readonly graphService:   PaperGraphService,
    private readonly config:         ConfigService,
    private readonly aiService:      AiService,
    private readonly contentLibrary: ContentLibraryService,
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
        select: { sectionKey: true, fieldType: true, label: true, sortOrder: true, aiHint: true, description: true },
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
        'ENUM_SELECT', 'SAMPLE_ITEM_REGISTER', 'SAMPLING_EVALUATION',
      ]);
      const stale = tplSections.filter(t => {
        const e = existingMap.get(t.sectionKey);
        if (!e) return false;
        return e.fieldType   !== (t.fieldType as string)
          || e.sortOrder    !== (t.sortOrder ?? 0)
          || e.label        !== t.label
          || e.aiHint       !== (t.aiHint ?? null)
          || e.description  !== (t.description ?? null);
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
- Si el contenido cubre varios temas o normas distintas (ej. "Negocio en marcha (NIA 570): ... Fraude (NIA 240): ... Partes relacionadas (NIA 550): ..."), escribe SIEMPRE cada tema como una viñeta separada por su propia línea ("- Tema (NIA XXX): contenido"), nunca como un párrafo corrido que los mezcle todos.
- Si requiere narrativa de un solo tema, usa 2-4 párrafos máximo.
- NO inventes datos específicos del cliente (NIT, montos, nombres) que no estén en el contexto.
- Si necesitas referenciar otra sección o papel, usa el formato [CODE::SXX].
- Si la Instrucción o el Hint IA mencionan más de un área/norma (ej. "Área X: ... Área Y: ..." — plantillas genéricas reutilizadas para varios temas), usa EXCLUSIVAMENTE la guía que corresponda al título real de este papel ("${ctx.paperTitle}") e ignora por completo la de las otras áreas mencionadas.
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
- Si la Instrucción o la especificación de columnas mencionan más de un área/norma (ej. "Área X: ... Área Y: ..." — plantillas genéricas reutilizadas para varios temas), genera filas usando EXCLUSIVAMENTE la guía que corresponda al título real de este papel ("${ctx.paperTitle}") e ignora la de las otras áreas mencionadas.
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
   * Consolida en PT-FIN-B08 S1 las diferencias/hallazgos con impacto ($) de
   * los papeles de ejecución de la auditoría: PT-FIN-C-SUST S1 (C-01..C-14),
   * PT-NIA570 S2 (C-15, Continuidad), PT-NIA550 S5 (C-13, Partes Relacionadas
   * no reveladas) y PT-FIN-C-NORM S1 (legacy — instancias creadas antes de
   * separar PT-NIA550/PT-NIA570). Calcula los totales por categoría vs UAE/MG
   * en S2 (leyendo PT-A4 vía getMaterialidadByAudit) y recalcula el semáforo
   * preliminar de S3. Sobrescribe S1/S2/S3 por completo en cada corrida — son
   * un reflejo directo de los papeles de ejecución y de la materialidad
   * vigente, sin anotaciones propias del auditor que deban preservarse (esas
   * viven en S4-S9: AJEs, respuesta del cliente, opinión y narrativa).
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
    const firstOf = (r: Record<string, unknown>, keys: string[]): unknown => {
      for (const k of keys) if (r[k] !== undefined) return r[k];
      return undefined;
    };

    type Tipo = 'Factual' | 'Por Estimación' | 'Proyectada';
    type ConsolidatedRow = Record<string, string>;

    // Papeles genéricos por área (Incumplimientos/Indicadores/No reveladas) — misma forma
    // de salida (sin saldo cliente/auditor, siempre Factual), distintos nombres de columna
    // según el papel de origen. C-SUST se maneja aparte porque sí tiene esa comparación.
    const GENERIC_SOURCES: Array<{
      paperCode: string; sectionKey: string;
      areaKeys: string[]; descKeys: string[]; amountKeys: string[]; estadoKeys: string[];
    }> = [
      { // legacy — instancias creadas antes de separar PT-NIA550/PT-NIA570
        paperCode: 'PT-FIN-C-NORM', sectionKey: 'S1',
        areaKeys: ['Área'], descKeys: ['Descripción del incumplimiento/riesgo', 'Descripción'],
        amountKeys: ['Impacto potencial en EEFF ($)', 'Impacto potencial en EEFF'],
        estadoKeys: ['¿Revelar en dictamen? (Sí/No/Evaluar)', '¿Revelar en dictamen?'],
      },
      {
        paperCode: 'PT-NIA570', sectionKey: 'S2',
        areaKeys: ['Tipo de Indicador'], descKeys: ['Descripción'],
        amountKeys: ['Impacto Potencial en EEFF ($)', 'Impacto Potencial en EEFF'],
        estadoKeys: ['¿Mitigado por un Plan de la Administración?'],
      },
      {
        paperCode: 'PT-NIA550', sectionKey: 'S5',
        areaKeys: ['Parte Relacionada / Transacción'], descKeys: ['Parte Relacionada / Transacción'],
        amountKeys: ['Monto $'], estadoKeys: ['Acción Tomada'],
      },
    ];

    const execPapers = await this.prisma.workingPaper.findMany({
      where:   { auditId: wp.auditId, paperCode: { in: ['PT-FIN-C-SUST', 'PT-NIA530', ...GENERIC_SOURCES.map(s => s.paperCode)] } },
      include: { sections: { where: { sectionKey: { in: ['S1', 'S2', 'S4', 'S5'] } } } },
    });

    const consolidated: ConsolidatedRow[] = [];
    let seq = 0;

    for (const p of execPapers) {
      const origen = `${norm(p.code)} · ${norm(p.title)}`;

      if (p.paperCode === 'PT-FIN-C-SUST') {
        const rows = asRows(p.sections.find(s => s.sectionKey === 'S1')?.value);
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
        continue;
      }

      if (p.paperCode === 'PT-NIA530') {
        // Proyección de errores de muestreo (S4, calculada por recalculateSamplingEvaluation).
        // Solo entran las áreas cuya acción sugerida ya cruzó ME (PROPONER_AJUSTE) o MG
        // (MODIFICAR_OPINION) — las que solo requieren "ampliar muestra" o están "cerca
        // del límite" son riesgo de muestreo, no una diferencia real, y no se consolidan.
        const s4Val = p.sections.find(s => s.sectionKey === 'S4')?.value;
        const filas = s4Val && typeof s4Val === 'object' && Array.isArray((s4Val as Record<string, unknown>)['filas'])
          ? (s4Val as { filas: Record<string, unknown>[] }).filas
          : [];
        for (const f of filas) {
          const accion = norm(f['accion']);
          if (accion !== 'PROPONER_AJUSTE' && accion !== 'MODIFICAR_OPINION') continue;
          const mle = f['errorMasProbable'];
          const encontrado = f['erroresEncontrados'];
          const diferencia = typeof mle === 'number' ? mle : asNumber(encontrado);
          if (!diferencia) continue;
          seq++;
          consolidated.push({
            '#':               String(seq),
            'Papel de Origen': origen,
            'Área/Cuenta':     norm(f['area']),
            'Descripción':     `Error más probable proyectado por muestreo${f['esMUS'] ? ' (MUS, IC ' + norm(f['nivelConfianzaPct']) + '%)' : ' (no estadístico)'} — ${accion === 'MODIFICAR_OPINION' ? 'supera MG' : 'supera ME'}`,
            'Saldo s/Cliente': 'N/A',
            'Saldo s/Auditor': 'N/A',
            'Diferencia $':    diferencia.toFixed(2),
            'Tipo':            'Proyectada' as Tipo,
            'Estado':          'Pendiente',
          });
        }
        continue;
      }

      const cfg = GENERIC_SOURCES.find(s => s.paperCode === p.paperCode);
      if (!cfg) continue;
      const rows = asRows(p.sections.find(s => s.sectionKey === cfg.sectionKey)?.value);
      for (const r of rows) {
        const diferencia = asNumber(firstOf(r, cfg.amountKeys));
        if (!diferencia) continue;
        seq++;
        consolidated.push({
          '#':               String(seq),
          'Papel de Origen': origen,
          'Área/Cuenta':     norm(firstOf(r, cfg.areaKeys)),
          'Descripción':     norm(firstOf(r, cfg.descKeys)),
          'Saldo s/Cliente': 'N/A',
          'Saldo s/Auditor': 'N/A',
          'Diferencia $':    diferencia.toFixed(2),
          'Tipo':            'Factual',
          'Estado':          norm(firstOf(r, cfg.estadoKeys)) || 'Pendiente',
        });
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
      'Proyectada':     { total: 0, count: 0 },
    };
    for (const r of consolidated) {
      const b = buckets[r['Tipo'] as Tipo];
      b.total += asNumber(r['Diferencia $']);
      b.count++;
    }
    const grandTotal = buckets['Factual'].total + buckets['Por Estimación'].total + buckets['Proyectada'].total;
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
      catRow('Proyectada', buckets['Proyectada'].total, buckets['Proyectada'].count),
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

  // ─── Auditoría Financiera: consolidación de deficiencias a PT-NIA265 ────────

  /**
   * Consolida en PT-NIA265 S1 las deficiencias de control identificadas en
   * PT-A3 S4 (Excepciones y Desvíos de Control, evaluación de controles de
   * proceso) y PT-ITGC S1-S4 (los 4 dominios de TI, filtrando solo las filas
   * cuya Efectividad indique una deficiencia). Deliberadamente NO toma de
   * PT-HALL (Hallazgos) — "Deficiencia de Control Interno" es un concepto más
   * angosto y normado (NIA 265) que un hallazgo general de auditoría; se
   * captura en el punto donde se prueban los controles, no se retro-clasifica
   * desde un log de hallazgos genérico. Sobrescribe S1 por completo en cada
   * corrida — es un reflejo directo de las pruebas de control ya ejecutadas.
   */
  async propagateControlDeficiencias(paperId: string, user: AuthUser) {
    const wp = await this.assertPaperAccess(paperId, user);

    if (wp.paperCode !== 'PT-NIA265') {
      throw new BadRequestException(
        'Solo el papel PT-NIA265 puede consolidar deficiencias desde PT-A3 y PT-ITGC',
      );
    }

    const norm = (v: unknown): string => (v == null ? '' : String(v)).trim();
    const asRows = (value: unknown): Record<string, unknown>[] => (Array.isArray(value) ? value : []);
    const firstOf = (r: Record<string, unknown>, keys: string[]): unknown => {
      for (const k of keys) if (r[k] !== undefined) return r[k];
      return undefined;
    };
    const severityOf = (raw: string): string => {
      const n = raw.toLowerCase();
      if (n.includes('material')) return 'DEFICIENCIA_MATERIAL';
      if (n.includes('significativ')) return 'DEFICIENCIA_SIGNIFICATIVA';
      if (n.includes('menor')) return 'DEFICIENCIA_MENOR';
      return ''; // "Efectivo", vacío, u otro valor no reconocido → no es una deficiencia
    };

    type ConsolidatedRow = Record<string, string>;
    const consolidated: ConsolidatedRow[] = [];
    let seq = 0;

    // ── Fuente 1: PT-A3 S4 — Excepciones y Desvíos de Control ────────────────
    const a3Papers = await this.prisma.workingPaper.findMany({
      where:   { auditId: wp.auditId, paperCode: 'PT-A3' },
      include: { sections: { where: { sectionKey: 'S4' } } },
    });
    for (const p of a3Papers) {
      const rows = asRows(p.sections.find(s => s.sectionKey === 'S4')?.value);
      for (const r of rows) {
        const desc = norm(firstOf(r, ['Descripción de la excepción', 'Descripción']));
        if (!desc || /^sin excepciones/i.test(desc)) continue;
        const severidad = severityOf(norm(firstOf(r, [
          'Severidad (Deficiencia Menor / Deficiencia Significativa / Deficiencia Material)', 'Severidad',
        ])));
        if (!severidad) continue;
        seq++;
        consolidated.push({
          '#':                             String(seq),
          'Descripción de la deficiencia': desc,
          'Componente COSO':               'ACTIVIDADES_CONTROL',
          'Proceso/Área afectada':         norm(firstOf(r, ['Control afectado (código de S2)', 'Control afectado'])),
          'Severidad':                     severidad,
          'Riesgo potencial':              norm(r['Causa raíz']),
          'Cuentas EEFF afectadas':        '',
          'Ref. PT origen':                `PT-A3::S4${p.code ? ` (${norm(p.code)})` : ''}`,
        });
      }
    }

    // ── Fuente 2: PT-ITGC S1-S4 — 4 dominios, solo filas con deficiencia ─────
    const ITGC_DOMAINS: Record<string, string> = {
      S1: 'TI — Gestión de Acceso Lógico',
      S2: 'TI — Gestión de Cambios',
      S3: 'TI — Operaciones de TI',
      S4: 'TI — Desarrollo de Programas',
    };
    const itgcPapers = await this.prisma.workingPaper.findMany({
      where:   { auditId: wp.auditId, paperCode: 'PT-ITGC' },
      include: { sections: { where: { sectionKey: { in: Object.keys(ITGC_DOMAINS) } } } },
    });
    for (const p of itgcPapers) {
      for (const [sk, dominio] of Object.entries(ITGC_DOMAINS)) {
        const rows = asRows(p.sections.find(s => s.sectionKey === sk)?.value);
        for (const r of rows) {
          const severidad = severityOf(norm(firstOf(r, [
            'Efectividad (Efectivo / Def. Menor / Def. Significativa / Def. Material)', 'Efectividad',
          ])));
          if (!severidad) continue;
          const desc = norm(firstOf(r, ['Descripción del control', 'ID Control']));
          if (!desc) continue;
          seq++;
          consolidated.push({
            '#':                             String(seq),
            'Descripción de la deficiencia': desc,
            'Componente COSO':               'ACTIVIDADES_CONTROL',
            'Proceso/Área afectada':         dominio,
            'Severidad':                     severidad,
            'Riesgo potencial':              norm(r['Impacto en auditoría']),
            'Cuentas EEFF afectadas':        '',
            'Ref. PT origen':                `PT-ITGC::${sk}${p.code ? ` (${norm(p.code)})` : ''}`,
          });
        }
      }
    }

    await this.prisma.paperSection.update({
      where: { paperId_sectionKey: { paperId, sectionKey: 'S1' } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data:  { value: consolidated as any, isStale: false, staleSince: null, staleReason: null },
    });
    await this.graphService.onSectionUpdated(paperId, 'S1', consolidated);

    return {
      consolidated: consolidated.length,
      message: consolidated.length > 0
        ? `${consolidated.length} deficiencia(s) consolidadas desde PT-A3 (evaluación de controles) y PT-ITGC (controles generales de TI).`
        : 'No se encontraron excepciones con severidad Menor/Significativa/Material en PT-A3 ni PT-ITGC — puede que aún no se hayan registrado pruebas de control, o que no haya deficiencias.',
    };
  }

  /**
   * Recalcula PT-NIA265 S2 ("Análisis por Componente COSO — Mapa de Debilidades")
   * contando por severidad las deficiencias de S1 para cada uno de los 5
   * componentes COSO. A diferencia de S1 (que se REEMPLAZA por completo al
   * consolidar), aquí se preserva el juicio del auditor: "Evaluación del
   * componente" e "Impacto en estrategia de auditoría" de cada componente se
   * mantienen tal cual estaban si ya existía una fila para ese componente —
   * solo los 3 conteos se recalculan, siempre a partir de S1.
   */
  async recalculateCosoComponentAnalysis(paperId: string, user: AuthUser) {
    const wp = await this.assertPaperAccess(paperId, user);

    if (wp.paperCode !== 'PT-NIA265') {
      throw new BadRequestException(
        'Solo el papel PT-NIA265 puede recalcular el Análisis por Componente COSO',
      );
    }

    const norm = (v: unknown): string => (v == null ? '' : String(v)).trim();
    const asRows = (value: unknown): Record<string, unknown>[] => (Array.isArray(value) ? value : []);

    const s1 = await this.prisma.paperSection.findUnique({
      where: { paperId_sectionKey: { paperId, sectionKey: 'S1' } },
    });
    const deficiencias = asRows(s1?.value);

    const s2 = await this.prisma.paperSection.findUnique({
      where: { paperId_sectionKey: { paperId, sectionKey: 'S2' } },
    });
    const existingByComponent = new Map<string, Record<string, unknown>>();
    for (const r of asRows(s2?.value)) {
      const comp = norm(r['Componente COSO']);
      if (comp) existingByComponent.set(comp, r);
    }

    const COMPONENTES = ['ENTORNO_CONTROL', 'EVALUACION_RIESGOS', 'ACTIVIDADES_CONTROL', 'INFORMACION_COMUNICACION', 'MONITOREO'];
    const recalculated = COMPONENTES.map(comp => {
      const propias = deficiencias.filter(d => norm(d['Componente COSO']) === comp);
      const menores       = propias.filter(d => norm(d['Severidad']) === 'DEFICIENCIA_MENOR').length;
      const significativas = propias.filter(d => norm(d['Severidad']) === 'DEFICIENCIA_SIGNIFICATIVA').length;
      const materiales     = propias.filter(d => norm(d['Severidad']) === 'DEFICIENCIA_MATERIAL').length;
      const existing = existingByComponent.get(comp);
      return {
        'Componente COSO':                     comp,
        '# Deficiencias Menores':               String(menores),
        '# Deficiencias Significativas':        String(significativas),
        '# Deficiencias Materiales':             String(materiales),
        'Evaluación del componente':            norm(existing?.['Evaluación del componente']),
        'Impacto en estrategia de auditoría':   norm(existing?.['Impacto en estrategia de auditoría']),
      };
    });

    await this.prisma.paperSection.update({
      where: { paperId_sectionKey: { paperId, sectionKey: 'S2' } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data:  { value: recalculated as any, isStale: false, staleSince: null, staleReason: null },
    });
    await this.graphService.onSectionUpdated(paperId, 'S2', recalculated);

    const totalDeficiencias = deficiencias.length;
    const componentesConDeficiencias = recalculated.filter(
      r => Number(r['# Deficiencias Menores']) + Number(r['# Deficiencias Significativas']) + Number(r['# Deficiencias Materiales']) > 0,
    ).length;

    return {
      recalculated: true,
      totalDeficiencias,
      componentesConDeficiencias,
      message: totalDeficiencias > 0
        ? `Conteo recalculado desde ${totalDeficiencias} deficiencia(s) de S1, distribuidas en ${componentesConDeficiencias} de 5 componentes COSO. La Evaluación del componente e Impacto en estrategia se conservaron tal cual estaban.`
        : 'S1 no tiene deficiencias registradas todavía — los 5 componentes quedan en 0.',
    };
  }

  /**
   * Sincroniza los hallazgos documentados en PT-HALL (S1 Identificación, una
   * fila por hallazgo) con la tabla `Finding` — la misma tabla que alimenta el
   * contador "Hallazgos" del dashboard del encargo (antes, PT-HALL vivía
   * completamente desconectado de ese contador).
   *
   * Solo PT-HALL propaga — PT-HALL-COM (comunicación) y PT-HALL-RESP
   * (seguimiento consolidado de períodos anteriores) NO crean Findings
   * nuevos, para no inflar el conteo con hallazgos que ya deberían existir
   * como Finding del encargo ANTERIOR en el que se identificaron.
   *
   * isRecurring se marca automáticamente solo si S8 = "Reabierto..." — un
   * hallazgo que se reabre sí es, por definición, un hallazgo que ya existía.
   * El dashboard filtra isRecurring=false en su conteo principal (ver
   * AuditsService) para no mezclar hallazgos propios del encargo con
   * seguimiento de períodos anteriores.
   */
  async propagateHallazgosToFindings(paperId: string, user: AuthUser) {
    const wp = await this.assertPaperAccess(paperId, user);

    if (wp.paperCode !== 'PT-HALL') {
      throw new BadRequestException('Solo el papel PT-HALL puede sincronizar hallazgos al dashboard');
    }

    const norm = (v: unknown): string => (v == null ? '' : String(v)).trim();
    const asRows = (value: unknown): Record<string, unknown>[] => (Array.isArray(value) ? value : []);
    const findKey = (row: Record<string, unknown>, patterns: string[]): string | undefined => {
      const keys = Object.keys(row);
      const norm2 = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      for (const p of patterns) {
        const found = keys.find(k => norm2(k).includes(p));
        if (found) return found;
      }
      return undefined;
    };

    const sections = await this.prisma.paperSection.findMany({ where: { paperId } });
    const byKey = new Map(sections.map(s => [s.sectionKey, s]));

    const s1Rows = asRows(byKey.get('S1')?.value);
    if (s1Rows.length === 0) {
      return { created: 0, updated: 0, message: 'S1 (Identificación del Hallazgo) no tiene filas — nada que sincronizar.' };
    }

    const condition      = norm(byKey.get('S2')?.value) || '(pendiente de documentar — ver S2 Condición)';
    const criteria       = norm(byKey.get('S3')?.value) || '(pendiente de documentar — ver S3 Criterio)';
    const cause          = norm(byKey.get('S4')?.value) || '(pendiente de documentar — ver S4 Causa)';
    const recommendation = norm(byKey.get('S6')?.value) || '(pendiente de documentar — ver S6 Recomendación)';
    const effectRows     = asRows(byKey.get('S5')?.value);
    const effectKey      = effectRows.length > 0 ? findKey(effectRows[0], ['descripcion']) : undefined;
    const effect = effectRows.length > 0
      ? effectRows.map(r => norm(effectKey ? r[effectKey] : '')).filter(Boolean).join(' | ') || '(pendiente de documentar — ver S5 Efecto e Impacto)'
      : '(pendiente de documentar — ver S5 Efecto e Impacto)';

    const estadoRaw = norm(byKey.get('S8')?.value).toLowerCase();
    let status: FindingStatus = FindingStatus.DRAFT;
    let isRecurring = false;
    if (estadoRaw.startsWith('cerrado'))   status = FindingStatus.CLOSED;
    else if (estadoRaw.startsWith('vigente'))  status = FindingStatus.IN_PROGRESS;
    else if (estadoRaw.startsWith('vencido'))  status = FindingStatus.OVERDUE;
    else if (estadoRaw.startsWith('reabierto')) { status = FindingStatus.IN_PROGRESS; isRecurring = true; }
    else if (estadoRaw.startsWith('diferido')) status = FindingStatus.ACCEPTED_RISK;

    const SEVERITY_MAP: Record<string, FindingSeverity> = { alto: FindingSeverity.HIGH, medio: FindingSeverity.MEDIUM, bajo: FindingSeverity.LOW };

    let created = 0, updated = 0;
    for (const row of s1Rows) {
      const idKey = findKey(row, ['id hallazgo', 'id']);
      const areaKey = findKey(row, ['area']);
      const riesgoKey = findKey(row, ['clasificacion de riesgo', 'riesgo']);
      const idHallazgo = idKey ? norm(row[idKey]) : '';
      const area = areaKey ? norm(row[areaKey]) : '';
      const title = [idHallazgo, area].filter(Boolean).join(' — ') || wp.title;
      const severityRaw = (riesgoKey ? norm(row[riesgoKey]) : '').toLowerCase();
      const severity = SEVERITY_MAP[severityRaw] ?? FindingSeverity.MEDIUM;

      const existing = await this.prisma.finding.findFirst({ where: { workingPaperId: paperId, title } });
      const data = {
        title, condition, criteria, cause, effect, risk: effect, recommendation,
        severity, status, isRecurring,
        workingPaperId: paperId, auditId: wp.auditId, organizationId: user.organizationId,
      };
      if (existing) {
        await this.prisma.finding.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await this.prisma.finding.create({ data: { ...data, qualityScore: 0, aiDraftUsed: false } });
        created++;
      }
    }

    return {
      created, updated,
      message: `${created} hallazgo(s) nuevos y ${updated} actualizados sincronizados al contador del dashboard.${isRecurring ? ' Marcado(s) como seguimiento de período anterior (Reabierto) — no cuentan en el total principal.' : ''}`,
    };
  }

  // ─── PT-NIA530: evaluación de resultados del muestreo (extrapolación MUS) ────

  /**
   * Calcula S4 (Evaluación de Resultados del Muestreo) a partir de S5 (ítems
   * examinados, uno por fila) + S2 (tipo de muestreo por área) + S3 (intervalo
   * y factor k por área) + la materialidad real del encargo (PT-A4, NO la copia
   * narrativa de S1 — misma fuente que usa propagateDiferencias para B08).
   *
   * Para áreas MUS: implementa el método de evaluación combinado
   * atributos-variables (Stringer bound simplificado) — tainting por ítem,
   * Precisión Básica, Ampliación de Precisión (PGW) y Límite Superior de Error
   * (UEL). Los factores de confiabilidad se resuelven numéricamente contra la
   * distribución de Poisson (ver reliability-factor.ts) en vez de una tabla
   * hardcodeada. Para áreas Dirigidas/100%: sin proyección estadística, se
   * compara la suma de diferencias encontradas directamente.
   */
  async recalculateSamplingEvaluation(paperId: string, user: AuthUser) {
    const wp = await this.assertPaperAccess(paperId, user);
    if (wp.paperCode !== 'PT-NIA530') {
      throw new BadRequestException('Solo el papel PT-NIA530 puede recalcular la evaluación de muestreo');
    }

    const norm = (v: unknown): string => (v == null ? '' : String(v)).trim();
    const asRows = (value: unknown): Record<string, unknown>[] => (Array.isArray(value) ? value : []);
    const asNumber = (v: unknown): number | null => {
      if (v === null || v === undefined || v === '') return null;
      const n = parseFloat(String(v).replace(/[^\d.-]/g, ''));
      return Number.isFinite(n) ? n : null;
    };
    const findKey = (row: Record<string, unknown>, patterns: string[]): string | undefined => {
      const keys = Object.keys(row);
      const norm2 = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      for (const p of patterns) {
        const found = keys.find(k => norm2(k).includes(p));
        if (found) return found;
      }
      return undefined;
    };
    const normArea = (s: string): string =>
      s.toLowerCase().trim().replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+/g, ' ');

    const sections = await this.prisma.paperSection.findMany({ where: { paperId } });
    const byKey = new Map(sections.map(s => [s.sectionKey, s]));

    const s2Rows = asRows(byKey.get('S2')?.value);
    const s3Rows = asRows(byKey.get('S3')?.value);
    const s5Rows = asRows(byKey.get('S5')?.value) as Array<{
      area?: string; bookValue?: unknown; auditedValue?: unknown;
    }>;

    if (s5Rows.length === 0) {
      return {
        recalculated: false, areas: 0, areasEnAccion: 0,
        message: 'S5 (Registro de Selección) no tiene ítems — nada que evaluar. Registre al menos un ítem examinado antes de recalcular.',
      };
    }

    // Materialidad real del encargo — PT-A4, la misma fuente que usa el puente a PT-FIN-B08.
    const { mg, me, uae } = await this.getMaterialidadByAudit(wp.auditId, user);

    // Tipo de muestreo declarado por área (S2)
    const tipoByArea = new Map<string, string>();
    if (s2Rows.length > 0) {
      const areaKey = findKey(s2Rows[0], ['area']);
      const tipoKey = findKey(s2Rows[0], ['tipo de muestreo']);
      for (const r of s2Rows) {
        const area = areaKey ? normArea(norm(r[areaKey])) : '';
        if (!area) continue;
        tipoByArea.set(area, tipoKey ? norm(r[tipoKey]) : '');
      }
    }

    // Diseño MUS por área (S3): intervalo de muestreo, factor k, n planificado
    interface DesignInfo { interval: number | null; k: number | null; nPlanned: number | null; }
    const designByArea = new Map<string, DesignInfo>();
    if (s3Rows.length > 0) {
      const areaKey     = findKey(s3Rows[0], ['area']);
      const intervalKey = findKey(s3Rows[0], ['intervalo de muestreo']);
      const kKey        = findKey(s3Rows[0], ['factor k']);
      const nKey        = findKey(s3Rows[0], ['n = k']);
      for (const r of s3Rows) {
        const area = areaKey ? normArea(norm(r[areaKey])) : '';
        if (!area) continue;
        designByArea.set(area, {
          interval: intervalKey ? asNumber(r[intervalKey]) : null,
          k:        kKey ? asNumber(r[kKey]) : null,
          nPlanned: nKey ? asNumber(r[nKey]) : null,
        });
      }
    }

    // Agrupar ítems examinados de S5 por área
    interface ItemAgg { bookValue: number; diff: number; }
    const itemsByArea = new Map<string, ItemAgg[]>();
    const rawAreaLabel = new Map<string, string>();
    for (const r of s5Rows) {
      const rawArea = norm(r.area);
      if (!rawArea) continue;
      const area = normArea(rawArea);
      if (!rawAreaLabel.has(area)) rawAreaLabel.set(area, rawArea);
      const bv = typeof r.bookValue === 'number' ? r.bookValue : asNumber(r.bookValue);
      const av = r.auditedValue === null || r.auditedValue === undefined || r.auditedValue === ''
        ? null
        : (typeof r.auditedValue === 'number' ? r.auditedValue : asNumber(r.auditedValue));
      if (av === null || bv === null) continue; // sin examinar todavía, o sin valor en libros
      if (!itemsByArea.has(area)) itemsByArea.set(area, []);
      itemsByArea.get(area)!.push({ bookValue: bv, diff: bv - av });
    }

    type Accion   = 'NINGUNA' | 'CERCA_DEL_LIMITE' | 'AMPLIAR_MUESTRA' | 'PROPONER_AJUSTE' | 'MODIFICAR_OPINION';
    type Semaforo = 'VERDE' | 'AMARILLO' | 'NARANJA' | 'ROJO';

    interface AreaResult {
      area: string; tipoMuestreo: string; esMUS: boolean;
      itemsExaminados: number; itemsConError: number; erroresEncontrados: number;
      intervaloMuestreo: number | null; factorK: number | null; nivelConfianzaPct: number | null;
      precisionBasica: number | null; errorMasProbable: number | null;
      ampliacionPrecision: number | null; limiteSuperiorError: number | null;
      valorComparado: number; uae: number | null; me: number | null; mg: number | null;
      superaUAE: boolean; superaME: boolean; superaMG: boolean;
      accion: Accion; semaforo: Semaforo;
      ampliacionSugerida: { itemsAdicionales: number; muestraTotalSugerida: number } | null;
      nota: string | null;
    }

    const filas: AreaResult[] = [];

    for (const [area, items] of itemsByArea) {
      const tipoRaw = tipoByArea.get(area) ?? '';
      const esMUS = /mus/i.test(tipoRaw);
      const design = designByArea.get(area);

      const itemsExaminados = items.length;
      const itemsConError = items.filter(i => i.diff !== 0).length;
      const erroresEncontrados = items.reduce((s, i) => s + Math.abs(i.diff), 0);

      let precisionBasica: number | null = null;
      let errorMasProbable: number | null = null;
      let ampliacionPrecision: number | null = null;
      let limiteSuperiorError: number | null = null;
      let nivelConfianzaPct: number | null = null;
      let nota: string | null = null;

      const canEvaluateMUS = esMUS && design?.interval != null && design.interval > 0 && design?.k != null && design.k > 0;

      if (esMUS && !canEvaluateMUS) {
        nota = 'Sin diseño MUS completo en S3 para esta área (falta intervalo o factor k) — se compara el error encontrado directamente, sin proyectar.';
      } else if (!tipoRaw) {
        nota = 'Tipo de muestreo no definido en S2 para esta área — tratada como no estadística (sin proyección).';
      }

      if (canEvaluateMUS) {
        const interval = design!.interval as number;
        const k = design!.k as number;
        const riskLevel = Math.exp(-k); // k = RF(0, riesgo) = -ln(riesgo) — mismo factor ya usado en S1/S3
        nivelConfianzaPct = Math.round((1 - riskLevel) * 100);

        // Ítems "ciertos" (valor en libros ≥ intervalo — ya fueron examinados con
        // certeza, su error entra 100%) vs "logical units" (< intervalo, sujetos
        // a tainting y al margen de precisión por riesgo de muestreo).
        const logicalTaintings: number[] = [];
        let certainErrorSum = 0;
        let logicalErrorSum = 0;
        for (const it of items) {
          if (it.diff === 0 || it.bookValue <= 0) continue;
          if (it.bookValue >= interval) {
            certainErrorSum += Math.abs(it.diff);
          } else {
            const tainting = Math.min(1, Math.abs(it.diff) / it.bookValue);
            logicalTaintings.push(tainting);
            logicalErrorSum += tainting * interval;
          }
        }
        logicalTaintings.sort((a, b) => b - a);

        errorMasProbable = certainErrorSum + logicalErrorSum;
        precisionBasica  = k * interval;

        let pgw = 0;
        for (let j = 0; j < logicalTaintings.length; j++) {
          const incremento = reliabilityFactor(j + 1, riskLevel) - reliabilityFactor(j, riskLevel);
          pgw += incremento * logicalTaintings[j] * interval;
        }
        ampliacionPrecision = pgw;
        limiteSuperiorError = precisionBasica + errorMasProbable + pgw;
      }

      const valorComparado = canEvaluateMUS && limiteSuperiorError != null ? limiteSuperiorError : erroresEncontrados;
      const superaUAE = uae != null && valorComparado >= uae;
      const superaME  = me  != null && valorComparado >= me;
      const superaMG  = mg  != null && valorComparado >= mg;

      let accion: Accion = 'NINGUNA';
      let semaforo: Semaforo = 'VERDE';
      if (mg != null && valorComparado >= mg) {
        accion = 'MODIFICAR_OPINION'; semaforo = 'ROJO';
      } else if (me != null && errorMasProbable != null && errorMasProbable >= me) {
        // El punto estimado (no solo el margen de riesgo) ya supera la materialidad — error real, no solo riesgo de muestreo.
        accion = 'PROPONER_AJUSTE'; semaforo = 'NARANJA';
      } else if (me != null && !canEvaluateMUS && erroresEncontrados >= me) {
        accion = 'PROPONER_AJUSTE'; semaforo = 'NARANJA';
      } else if (me != null && valorComparado >= me) {
        // Solo el UEL (margen de riesgo de muestreo) supera ME — primero intentar ampliar la muestra.
        accion = 'AMPLIAR_MUESTRA'; semaforo = 'AMARILLO';
      } else if (me != null && me > 0 && valorComparado >= me * 0.75) {
        accion = 'CERCA_DEL_LIMITE'; semaforo = 'AMARILLO';
      }

      let ampliacionSugerida: AreaResult['ampliacionSugerida'] = null;
      if (canEvaluateMUS && (accion === 'AMPLIAR_MUESTRA' || accion === 'CERCA_DEL_LIMITE')
        && limiteSuperiorError != null && me != null && me > 0 && itemsExaminados > 0) {
        const nActual = design?.nPlanned ?? itemsExaminados;
        const nTotal = Math.ceil(nActual * (limiteSuperiorError / me));
        const itemsAdicionales = Math.max(0, nTotal - nActual);
        if (itemsAdicionales > 0) ampliacionSugerida = { itemsAdicionales, muestraTotalSugerida: nTotal };
      }

      filas.push({
        area: rawAreaLabel.get(area) ?? area,
        tipoMuestreo: tipoRaw || 'No especificado (revisar S2)',
        esMUS,
        itemsExaminados, itemsConError, erroresEncontrados,
        intervaloMuestreo: design?.interval ?? null,
        factorK: design?.k ?? null,
        nivelConfianzaPct,
        precisionBasica, errorMasProbable, ampliacionPrecision, limiteSuperiorError,
        valorComparado, uae, me, mg,
        superaUAE, superaME, superaMG,
        accion, semaforo,
        ampliacionSugerida,
        nota,
      });
    }

    filas.sort((a, b) => b.valorComparado - a.valorComparado);

    const value = {
      filas,
      calculadoEn: new Date().toISOString(),
      totalErrorProyectado: filas.reduce((s, f) => s + (f.errorMasProbable ?? f.erroresEncontrados), 0),
      mg, me, uae,
    };

    await this.prisma.paperSection.update({
      where: { paperId_sectionKey: { paperId, sectionKey: 'S4' } },
      data:  { value: value as unknown as Prisma.InputJsonValue, isStale: false, staleSince: null, staleReason: null },
    });
    await this.graphService.onSectionUpdated(paperId, 'S4', value);

    const areasEnAccion = filas.filter(f => f.accion === 'PROPONER_AJUSTE' || f.accion === 'MODIFICAR_OPINION').length;

    return {
      recalculated: true,
      areas: filas.length,
      areasEnAccion,
      message: `Evaluación recalculada para ${filas.length} área(s). `
        + (areasEnAccion > 0
          ? `${areasEnAccion} área(s) requieren proponer ajuste o escalar a socio — ver semáforo.`
          : 'Todas las áreas dentro de parámetros aceptables.'),
    };
  }

  // ─── Auditoría Financiera: biblioteca de procedimientos sustantivos ─────────

  /**
   * Carga en PT-FIN-C-SUST S3 los procedimientos sugeridos de la Biblioteca de
   * Contenido (content_library_items, kind=SUBSTANTIVE_PROCEDURE) para el área
   * del papel (wp.code, ej. "C-01") — editable desde
   * /dashboard/admin/content-library. A diferencia de los demás propagateXxx
   * de esta clase, esto NO sobrescribe — solo AGREGA los procedimientos que
   * aún no estén en la tabla (comparando por texto), porque S3 tiene datos
   * propios del auditor por fila (Población, Muestra, Criterio, Período) que
   * nunca deben perderse al volver a presionar el botón.
   */
  async seedSubstantiveProcedures(paperId: string, user: AuthUser) {
    const wp = await this.assertPaperAccess(paperId, user);

    if (wp.paperCode !== 'PT-FIN-C-SUST') {
      throw new BadRequestException(
        'Solo el papel PT-FIN-C-SUST puede cargar procedimientos de la biblioteca sustantiva',
      );
    }

    await this.contentLibrary.ensureSystemLibrary(user.organizationId, user.id);
    const library = await this.prisma.contentLibraryItem.findMany({
      where: { organizationId: user.organizationId, kind: 'SUBSTANTIVE_PROCEDURE', groupKey: wp.code },
      orderBy: { sortOrder: 'asc' },
    });
    if (library.length === 0) {
      return {
        added: 0,
        message: `Aún no hay procedimientos en la biblioteca para el área ${wp.code} — puede agregar filas manualmente mientras tanto, o agregarlos en Administración → Biblioteca de Contenido.`,
      };
    }

    const norm = (v: unknown): string => (v == null ? '' : String(v)).trim();
    const asRows = (value: unknown): Record<string, string>[] =>
      Array.isArray(value) ? (value as Record<string, string>[]) : [];

    const DEFAULT_COLUMNS = ['N°', 'Procedimiento', 'Técnica', 'Población total', 'Muestra seleccionada', 'Criterio', 'Período cubierto'];

    const s3 = await this.prisma.paperSection.findUnique({
      where: { paperId_sectionKey: { paperId, sectionKey: 'S3' } },
    });
    const existing = asRows(s3?.value);
    const existingDesc = new Set(existing.map(r => norm(r['Procedimiento']).toLowerCase()));
    const columns = existing.length > 0 ? Object.keys(existing[0]) : DEFAULT_COLUMNS;

    const toAdd = library.filter(p => !existingDesc.has(p.itemLabel.toLowerCase()));
    if (toAdd.length === 0) {
      return { added: 0, message: 'Todos los procedimientos de la biblioteca ya están en la tabla — nada que agregar.' };
    }

    let seq = existing.length;
    const newRows = toAdd.map(p => {
      seq++;
      const row: Record<string, string> = {};
      for (const c of columns) row[c] = '';
      row['N°'] = String(seq);
      row['Procedimiento'] = p.itemLabel;
      row['Técnica'] = p.itemSubtitle ?? '';
      return row;
    });

    const merged = [...existing, ...newRows];

    await this.prisma.paperSection.update({
      where: { paperId_sectionKey: { paperId, sectionKey: 'S3' } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data:  { value: merged as any, isStale: false, staleSince: null, staleReason: null },
    });
    await this.graphService.onSectionUpdated(paperId, 'S3', merged);

    return {
      added: newRows.length,
      message: `${newRows.length} procedimiento(s) agregados desde la biblioteca de ${wp.code}. Complete Población, Muestra, Criterio y Período para cada uno.`,
    };
  }

  // ─── PT-COSO: biblioteca de preguntas de evaluación por principio ───────────

  /**
   * Carga en la sección indicada de PT-COSO (S1-S5, una por componente) las
   * preguntas de evaluación sugeridas de la Biblioteca de Contenido
   * (content_library_items, kind=COSO_QUESTION) — una fila POR PREGUNTA (point of
   * focus), no por principio: así cada una se responde Sí/No/N-A individualmente
   * y el puntaje del componente se deriva de esas respuestas en vez de que el
   * auditor tenga que sintetizar todo el principio en un solo número (ver
   * CosoScorePanel). Igual que seedSubstantiveProcedures, es ADITIVO: solo agrega
   * preguntas que aún no estén en la tabla (comparando por Principio+Pregunta),
   * nunca pisa Respuesta ni Evidencia que el auditor ya haya llenado.
   */
  async seedCosoQuestions(paperId: string, sectionKey: string, user: AuthUser) {
    const wp = await this.assertPaperAccess(paperId, user);

    if (wp.paperCode !== 'PT-COSO') {
      throw new BadRequestException(
        'Solo el papel PT-COSO puede cargar preguntas de la biblioteca de evaluación COSO',
      );
    }

    await this.contentLibrary.ensureSystemLibrary(user.organizationId, user.id);
    const library = await this.prisma.contentLibraryItem.findMany({
      where: { organizationId: user.organizationId, kind: 'COSO_QUESTION', groupKey: sectionKey },
      orderBy: { sortOrder: 'asc' },
    });
    if (library.length === 0) {
      throw new BadRequestException(`No hay biblioteca de preguntas para la sección ${sectionKey}`);
    }

    const norm = (v: unknown): string => (v == null ? '' : String(v)).trim().toLowerCase();
    const asRows = (value: unknown): Record<string, string>[] =>
      Array.isArray(value) ? (value as Record<string, string>[]) : [];

    const RESPUESTA_COL = 'Respuesta (Sí/No/N-A)';
    const COLUMNS = ['Principio', 'Pregunta', RESPUESTA_COL, 'Evidencia y Observaciones'];

    const section = await this.prisma.paperSection.findUnique({
      where: { paperId_sectionKey: { paperId, sectionKey } },
    });
    const existing = asRows(section?.value);
    const existingKeys = new Set(existing.map(r => `${norm(r['Principio'])}::${norm(r['Pregunta'])}`));
    const columns = existing.length > 0 ? Object.keys(existing[0]) : COLUMNS;

    const newRows: Record<string, string>[] = [];
    for (const p of library) {
      const preguntas = Array.isArray(p.itemDetails) ? (p.itemDetails as unknown as string[]) : [];
      for (const q of preguntas) {
        const key = `${norm(p.itemLabel)}::${norm(q)}`;
        if (existingKeys.has(key)) continue;
        const row: Record<string, string> = {};
        for (const c of columns) row[c] = '';
        row['Principio'] = p.itemLabel;
        row['Pregunta'] = q;
        newRows.push(row);
      }
    }
    if (newRows.length === 0) {
      return { added: 0, message: 'Todas las preguntas de la biblioteca ya están en la tabla — nada que agregar.' };
    }

    const merged = [...existing, ...newRows];

    await this.prisma.paperSection.update({
      where: { paperId_sectionKey: { paperId, sectionKey } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data:  { value: merged as any, isStale: false, staleSince: null, staleReason: null },
    });
    await this.graphService.onSectionUpdated(paperId, sectionKey, merged);

    return {
      added: newRows.length,
      message: `${newRows.length} pregunta(s) agregadas desde la biblioteca de evaluación COSO. Responda Sí/No/N-A y documente Evidencia y Observaciones para cada una.`,
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

  /**
   * Última ejecución del panel de muestreo real (PT-A4 S_EJE — sube población,
   * calcula intervalo, selecciona ítems por MUS/sistemático/aleatorio). Se usa
   * como origen de datos para importar ítems ya seleccionados en PT-NIA530 S5,
   * en vez de que el auditor los vuelva a tipear a mano.
   *
   * Limitación conocida (no resuelta aquí): S_EJE guarda UNA sola ejecución por
   * auditoría — si el auditor la corre de nuevo para otra área, la anterior se
   * pierde. El importador de S5 debe usarse justo después de cada ejecución.
   */
  async getSamplingExecutionByAudit(auditId: string, user: AuthUser) {
    const sample = await this.prisma.workingPaper.findFirst({
      where:  { auditId, audit: { organizationId: user.organizationId } },
      select: { id: true },
    });
    if (!sample) throw new ForbiddenException();

    const paper = await this.prisma.workingPaper.findFirst({
      where:   { auditId, paperCode: 'PT-A4' },
      include: { sections: { where: { sectionKey: 'S_EJE' } } },
    });
    const value = paper?.sections.find(s => s.sectionKey === 'S_EJE')?.value ?? null;
    return { execution: value };
  }
}
