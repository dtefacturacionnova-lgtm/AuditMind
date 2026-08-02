import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

    // Gather peer papers from the same audit by paperCode (PT-A1, PT-A2, PT-A3)
    const peers = await this.prisma.workingPaper.findMany({
      where: {
        auditId:   wp.auditId,
        paperCode: { in: ['PT-A1', 'PT-A2', 'PT-A3'] },
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
}
