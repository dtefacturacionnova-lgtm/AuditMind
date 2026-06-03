import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SyncStatus } from '@prisma/client';

// ─── Event payload ────────────────────────────────────────────────────────────

export interface PaperConsolidateEvent {
  paperId:    string;
  paperCode:  string | null;
  auditId:    string;
  auditTitle: string;
  sourceData: SourcePaperData[];
  // PI.5 — para registrar quién disparó la consolidación
  userId?:    string;
  reason?:    string;
}

export interface SourcePaperData {
  paperId:   string;
  paperCode: string | null;
  title:     string;
  sections:  SourceSection[];
}

interface SourceSection {
  sectionKey:   string;
  label:        string;
  value:        unknown;
  aiHint?:      string | null;
  isAutoFilled: boolean;
  sortOrder:    number;
}

// ─── Gemini response shape ────────────────────────────────────────────────────

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  error?: { message: string };
}

// ─── Generated sections map ───────────────────────────────────────────────────

type SectionMap = Record<string, string>;

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class PaperConsolidationService {
  private readonly logger = new Logger(PaperConsolidationService.name);

  private readonly geminiEndpoint =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent';

  constructor(
    private readonly prisma:  PrismaService,
    private readonly config:  ConfigService,
  ) {}

  // ─── Event handler ────────────────────────────────────────────────────────

  @OnEvent('paper.consolidate', { async: true })
  async handleConsolidate(event: PaperConsolidateEvent): Promise<void> {
    const { paperId, paperCode, auditTitle, sourceData, userId, reason } = event;
    this.logger.log(`[Consolidation] Starting: ${paperId} (${paperCode ?? 'no code'})`);

    try {
      // ── PI.5: capture snapshot of current state BEFORE modifying ────────
      await this.snapshotCurrentState(paperId, sourceData, userId, reason);

      // 1. Generate section content (AI or fallback)
      const sections = await this.generateSections(paperCode, sourceData, auditTitle);

      // 2. Persist each section value
      await this.persistSections(paperId, sections);

      // 3. Compose the full narrative text
      const narrative = this.composeNarrative(sections, paperCode, auditTitle);

      // 4. Mark paper as SYNCED
      await this.prisma.workingPaper.update({
        where: { id: paperId },
        data: {
          narrative,
          syncStatus:   SyncStatus.SYNCED,
          lastSyncedAt: new Date(),
          aiAssisted:   true,
          version:      { increment: 1 },
        },
      });

      this.logger.log(`[Consolidation] Complete: ${paperId}`);
    } catch (err) {
      this.logger.error(`[Consolidation] Failed for ${paperId}`, err);
      // Always reset to STALE so the user can retry — never leave REGENERATING
      await this.prisma.workingPaper.update({
        where: { id: paperId },
        data:  { syncStatus: SyncStatus.STALE },
      }).catch(() => { /* ignore secondary failure */ });
    }
  }

  // ─── PI.5 — Snapshot for version history ─────────────────────────────────
  /**
   * Creates a WorkingPaperVersion row capturing the paper's state BEFORE
   * the consolidation overwrites it. Also computes SHA-256 of each source
   * paper's sections so we can later detect which source triggered a re-sync.
   *
   * Idempotent: if there's nothing to snapshot (DRAFT empty paper), skip.
   */
  private async snapshotCurrentState(
    paperId:    string,
    sourceData: SourcePaperData[],
    userId?:    string,
    reason?:    string,
  ): Promise<void> {
    const paper = await this.prisma.workingPaper.findUnique({
      where:  { id: paperId },
      select: { narrative: true, version: true, content: true },
    });
    if (!paper) return;

    const sections = await this.prisma.paperSection.findMany({
      where:   { paperId },
      orderBy: { sortOrder: 'asc' },
      select:  {
        sectionKey: true, label: true, value: true,
        isAutoFilled: true, sourceRef: true,
      },
    });

    // Skip snapshot if paper has no real content yet (first consolidation)
    const hasContent = (paper.narrative && paper.narrative.length > 10) ||
                       sections.some(s => s.value && String(s.value).trim().length > 0);
    if (!hasContent) {
      this.logger.debug(`[Consolidation] Skipping snapshot — paper ${paperId} is empty`);
      return;
    }

    // Compute SHA-256 of each source paper's effective content
    const sourceHashes: Record<string, string> = {};
    for (const src of sourceData) {
      const key = src.paperCode ?? src.paperId;
      const payload = JSON.stringify(
        src.sections.map(s => ({ k: s.sectionKey, v: s.value ?? '' })),
      );
      sourceHashes[key] = createHash('sha256').update(payload).digest('hex').slice(0, 16);
    }

    await this.prisma.workingPaperVersion.create({
      data: {
        paperId,
        version:            paper.version,
        content:            (paper.content ?? {}) as object,
        narrative:          paper.narrative ?? null,
        sectionsSnapshot:   sections as unknown as object,
        sourcePapersHashes: sourceHashes,
        reason:             reason ?? null,
        consolidatedById:   userId ?? null,
        changedBy:          userId ?? 'system',
        isRestore:          false,
      },
    });

    this.logger.log(`[Consolidation] Snapshot v${paper.version} saved for ${paperId}`);
  }

  // ─── Section generation ───────────────────────────────────────────────────

  private async generateSections(
    paperCode: string | null,
    sourceData: SourcePaperData[],
    auditTitle: string,
  ): Promise<SectionMap> {
    const apiKey = this.config.get<string>('GEMINI_API_KEY', '');

    if (apiKey) {
      try {
        return await this.callGemini(apiKey, paperCode, sourceData, auditTitle);
      } catch (err) {
        this.logger.warn('[Consolidation] Gemini failed, using template fallback', String(err));
      }
    } else {
      this.logger.warn('[Consolidation] GEMINI_API_KEY not configured, using template fallback');
    }

    return this.templateFallback(paperCode, sourceData, auditTitle);
  }

  // ─── Gemini call ──────────────────────────────────────────────────────────

  private async callGemini(
    apiKey:     string,
    paperCode:  string | null,
    sourceData: SourcePaperData[],
    auditTitle: string,
  ): Promise<SectionMap> {
    const prompt = this.buildPrompt(paperCode, sourceData, auditTitle);

    const res = await fetch(`${this.geminiEndpoint}?key=${apiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature:      0.3,
          maxOutputTokens:  3500,
          responseMimeType: 'application/json',
        },
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Gemini HTTP ${res.status}: ${errBody.slice(0, 200)}`);
    }

    const data = await res.json() as GeminiResponse;

    if (data.error) throw new Error(`Gemini API error: ${data.error.message}`);

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Gemini returned no JSON object');

    const parsed = JSON.parse(jsonMatch[0]) as SectionMap;
    this.logger.log(`[Consolidation] Gemini generated ${Object.keys(parsed).length} sections`);
    return parsed;
  }

  // ─── Prompt builder ───────────────────────────────────────────────────────

  private buildPrompt(
    paperCode:  string | null,
    sourceData: SourcePaperData[],
    auditTitle: string,
  ): string {
    const contextLines: string[] = [
      `Auditoría: "${auditTitle}"`,
      `Papel destino: ${paperCode ?? 'PT-MEMO'}`,
      '',
    ];

    for (const paper of sourceData) {
      const code = paper.paperCode ?? paper.title;
      contextLines.push(`=== ${code}: ${paper.title} ===`);
      for (const s of paper.sections) {
        const val = this.valToString(s.value);
        if (val.trim()) {
          contextLines.push(`[${s.sectionKey}] ${s.label}:`);
          contextLines.push(val.slice(0, 800));   // hard cap per section
          contextLines.push('');
        }
      }
    }

    const hasPTA1 = sourceData.some(p => p.paperCode === 'PT-A1');
    const hasPTA2 = sourceData.some(p => p.paperCode === 'PT-A2');
    const hasPTA4 = sourceData.some(p => p.paperCode === 'PT-A4');

    if (paperCode === 'PT-PROG') {
      return `Eres un experto en auditoría. Con los datos de fuente, genera el contenido del Programa de Auditoría (PT-PROG) en español.

DATOS DE FUENTE:
${contextLines.join('\n')}

Responde EXCLUSIVAMENTE con un JSON (sin markdown) con estas claves:
{
  "S1": "Lista de 8-12 procedimientos de auditoría específicos, uno por línea con formato 'N. Procedimiento: descripción'. Basado en los riesgos del PT-A2 y materialidad del PT-A4 [PT-A2][PT-A4].",
  "S7": "Notas del auditor: resumen del enfoque de auditoría propuesto, 2 párrafos. Incluye citas [PT-A2][PT-A4]."
}`;
    }

    // Default: PT-MEMO
    return `Eres un experto en documentación de auditoría externa e interna. Con los datos de fuente, genera el Memorando de Planificación (PT-MEMO) en español formal de auditoría.

DATOS DE FUENTE:
${contextLines.join('\n')}

Responde EXCLUSIVAMENTE con un JSON (sin markdown extra) con estas claves:
{
  "S2": "${hasPTA1 ? 'Entendimiento del negocio: resumen ejecutivo en 3 párrafos síntesis de PT-A1' : 'Entendimiento del negocio: indica que PT-A1 no está completo y describe los pasos a seguir'}. Incluye cita [PT-A1]. Máx. 350 palabras.",
  "S3": "${hasPTA2 ? 'Evaluación del riesgo inherente: 2-3 párrafos con nivel global de RI, riesgos significativos y riesgo de fraude de PT-A2' : 'Evaluación de RI: indica que PT-A2 no está disponible'}. Incluye cita [PT-A2]. Máx. 300 palabras.",
  "S4": "${hasPTA4 ? 'Materialidad NIA 320: 1-2 párrafos con MG, ME, UAE, base y justificación de PT-A4' : 'Materialidad: indica que PT-A4 no está disponible'}. Incluye cita [PT-A4]. Máx. 250 palabras.",
  "S8": "Conclusión integral del memorando: 2 párrafos formales que integren entendimiento del negocio, evaluación de riesgos y materialidad para concluir el enfoque de auditoría de '${auditTitle}'. Lenguaje NIA/ISA profesional. Incluye citas [PT-A1][PT-A2][PT-A4]."
}

INSTRUCCIONES:
- Redacta en español formal de auditoría (NIA/IAASB)
- Usa citas [PT-A1], [PT-A2], [PT-A4] al referenciar fuentes
- Sé conciso pero completo
- Solo el JSON, sin texto fuera del objeto`;
  }

  // ─── Template fallback ────────────────────────────────────────────────────

  private templateFallback(
    paperCode:  string | null,
    sourceData: SourcePaperData[],
    auditTitle: string,
  ): SectionMap {
    const now   = new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' });
    const a1    = sourceData.find(p => p.paperCode === 'PT-A1');
    const a2    = sourceData.find(p => p.paperCode === 'PT-A2');
    const a4    = sourceData.find(p => p.paperCode === 'PT-A4');

    const a1Bullets = a1
      ? a1.sections
          .filter(s => this.valToString(s.value).length > 5)
          .slice(0, 4)
          .map(s => `• ${s.label}: ${this.valToString(s.value).slice(0, 200)}`)
          .join('\n')
      : 'El papel PT-A1 (Entendimiento del Negocio) aún no ha sido completado.';

    const riConclusion = a2?.sections.find(s => s.sectionKey === 'S8');
    const riLevel      = riConclusion ? this.valToString(riConclusion.value) : 'MODERADO';

    const mgSection  = a4?.sections.find(s => s.sectionKey === 'S3');
    const meSection  = a4?.sections.find(s => s.sectionKey === 'S4');
    const uaeSection = a4?.sections.find(s => s.sectionKey === 'S5');

    if (paperCode === 'PT-PROG') {
      return {
        S1: [
          '1. Procedimiento: Obtener y revisar el entendimiento del negocio documentado en PT-A1.',
          '2. Procedimiento: Evaluar el sistema de control interno en las áreas de riesgo significativo identificadas.',
          '3. Procedimiento: Aplicar pruebas de detalle en saldos de mayor materialidad según PT-A4.',
          '4. Procedimiento: Verificar la existencia y valuación de activos significativos.',
          '5. Procedimiento: Evaluar la razonabilidad de estimaciones contables.',
          '6. Procedimiento: Realizar procedimientos analíticos comparativos.',
          '7. Procedimiento: Verificar el cumplimiento de obligaciones legales y regulatorias.',
          '8. Procedimiento: Indagar sobre partes relacionadas y transacciones inusuales.',
        ].join('\n'),
        S7: `Enfoque de auditoría para "${auditTitle}": se adoptará un enfoque basado en riesgos [PT-A2] con énfasis en las áreas de mayor riesgo inherente identificadas. Los procedimientos se orientarán a obtener evidencia suficiente y apropiada para las afirmaciones de mayor riesgo [PT-A4].\n\nGenerado automáticamente el ${now}. El auditor debe revisar y ajustar los procedimientos según las circunstancias específicas de la auditoría.`,
      };
    }

    // PT-MEMO
    return {
      S2: `Con base en el PT-A1 [PT-A1], se obtuvo el siguiente entendimiento del negocio para la auditoría "${auditTitle}":\n\n${a1Bullets}\n\nEl auditor ha obtenido comprensión suficiente del entorno operativo, regulatorio y de sistemas de la entidad para planificar adecuadamente los procedimientos de auditoría conforme a las NIA.`,

      S3: `La evaluación del riesgo inherente [PT-A2] para la auditoría "${auditTitle}" concluye en un nivel de riesgo inherente global: **${riLevel}**.\n\nSe han identificado áreas de riesgo significativo que requieren procedimientos específicos conforme a NIA 315. El equipo de auditoría aplicará un enfoque basado en riesgos, asignando mayor cobertura a las áreas de riesgo alto e incorporando procedimientos para los riesgos de fraude identificados (NIA 240).`,

      S4: [
        `La materialidad fue calculada de conformidad con NIA 320 [PT-A4].`,
        mgSection  ? `Materialidad Global (MG): ${this.valToString(mgSection.value)}` : '',
        meSection  ? `Materialidad de Ejecución (ME): ${this.valToString(meSection.value)}` : '',
        uaeSection ? `Umbral de Ajuste Específico (UAE): ${this.valToString(uaeSection.value)}` : '',
        '',
        'Los importes anteriores constituyen la referencia para la identificación de errores materiales durante la ejecución.',
      ].filter(Boolean).join('\n'),

      S8: `Con base en el entendimiento del negocio [PT-A1], la evaluación de riesgo inherente (${riLevel}) [PT-A2] y los parámetros de materialidad establecidos [PT-A4], el equipo de auditoría concluye que la planificación de "${auditTitle}" es adecuada y proporciona una base razonable para la ejecución.\n\nEl enfoque combina pruebas de controles en áreas de menor riesgo con procedimientos sustantivos reforzados en áreas de riesgo significativo, en conformidad con NIA/IAASB. Generado automáticamente el ${now}. El auditor debe revisar y validar este párrafo antes de la aprobación del memorando.`,
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private valToString(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string')  return value;
    if (typeof value === 'number')  return String(value);
    if (typeof value === 'boolean') return value ? 'Sí' : 'No';
    if (Array.isArray(value))       return value.map(v => this.valToString(v)).join(', ');
    if (typeof value === 'object')  return JSON.stringify(value);
    return String(value);
  }

  // ─── DB persistence ───────────────────────────────────────────────────────

  private async persistSections(paperId: string, sections: SectionMap): Promise<void> {
    for (const [sectionKey, value] of Object.entries(sections)) {
      if (!value?.toString().trim()) continue;
      // updateMany silently skips when 0 rows match (sections not yet initialised)
      await this.prisma.paperSection.updateMany({
        where: { paperId, sectionKey },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data:  { value: value as any },
      });
    }
  }

  // ─── Narrative composer ───────────────────────────────────────────────────

  private composeNarrative(
    sections:  SectionMap,
    paperCode: string | null,
    auditTitle: string,
  ): string {
    const parts: string[] = [];

    if (paperCode === 'PT-PROG') {
      if (sections.S1) parts.push(`### Procedimientos de Auditoría\n\n${sections.S1}`);
      if (sections.S7) parts.push(`\n\n### Notas del Auditor\n\n${sections.S7}`);
    } else {
      // PT-MEMO / generic MASTER
      const title = `**${paperCode ?? 'Memorando'} — ${auditTitle}**\n\n`;
      parts.push(title);
      if (sections.S2) parts.push(`### I. Entendimiento del Negocio\n\n${sections.S2}`);
      if (sections.S3) parts.push(`\n\n### II. Evaluación de Riesgo Inherente\n\n${sections.S3}`);
      if (sections.S4) parts.push(`\n\n### III. Materialidad\n\n${sections.S4}`);
      if (sections.S8) parts.push(`\n\n### IV. Conclusión y Enfoque de Auditoría\n\n${sections.S8}`);
    }

    return parts.join('');
  }
}
