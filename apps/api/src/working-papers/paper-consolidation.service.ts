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
  // 'merge' (default): preserva nota_auditor/ajustes/adjuntos de las filas de detalle
  // existentes, emparejando por código de cuenta. 'overwrite': reemplaza todo.
  mode?:      'overwrite' | 'merge';
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

type SectionMap = Record<string, unknown>;

// ─── Lead schedule config ─────────────────────────────────────────────────────

interface AccountMappingRow {
  cuenta: string; descripcion: string;
  saldo_actual: number; saldo_anterior: number; saldo_anterior2: number;
  sub_sumaria: string; grupo: string;
}

interface DetailSectionDef { key: string; label: string; subSumaria: string; }

interface LeadScheduleConfig {
  groupName: string;
  prefix: string;
  detailSections: DetailSectionDef[];
  // Only conclusionSectionKey is guaranteed to exist on every lead schedule paper.
  // analysisSectionKey/proceduresSectionKey are omitted on papers whose template
  // doesn't have a distinct section for them (their content folds into conclusion).
  analysisSectionKey?: string;
  proceduresSectionKey?: string;
  conclusionSectionKey: string;
}

const LEAD_SCHEDULE_CONFIG: Record<string, LeadScheduleConfig> = {
  'PT-FIN-B01': {
    groupName: 'Activos Corrientes', prefix: 'B-01',
    detailSections: [
      { key: 'S2', label: 'Caja y Bancos',           subSumaria: 'B-01a' },
      { key: 'S3', label: 'Cuentas por Cobrar',       subSumaria: 'B-01b' },
      { key: 'S4', label: 'Inventarios',              subSumaria: 'B-01c' },
      { key: 'S5', label: 'Otros Activos Corrientes', subSumaria: 'B-01d' },
    ],
    analysisSectionKey: 'S6', proceduresSectionKey: 'S7', conclusionSectionKey: 'S9',
  },
  // B02/B03: no hay sección separada de "procedimientos sugeridos" en la plantilla real.
  'PT-FIN-B02': {
    groupName: 'Activos No Corrientes', prefix: 'B-02',
    detailSections: [
      { key: 'S2', label: 'Propiedad, Planta y Equipo', subSumaria: 'B-02a' },
      { key: 'S3', label: 'Activos Intangibles',         subSumaria: 'B-02b' },
      { key: 'S4', label: 'Inversiones LP',              subSumaria: 'B-02c' },
    ],
    analysisSectionKey: 'S5', conclusionSectionKey: 'S7',
  },
  'PT-FIN-B03': {
    groupName: 'Pasivos Corrientes', prefix: 'B-03',
    detailSections: [
      { key: 'S2', label: 'Proveedores y CxP',          subSumaria: 'B-03a' },
      { key: 'S3', label: 'Obligaciones Financieras CP', subSumaria: 'B-03b' },
      { key: 'S4', label: 'Impuestos y Retenciones',    subSumaria: 'B-03c' },
    ],
    analysisSectionKey: 'S5', conclusionSectionKey: 'S7',
  },
  // B04/B05/B06: análisis y conclusión están combinados en una sola sección de la
  // plantilla real — no hay analysisSectionKey ni proceduresSectionKey separados.
  'PT-FIN-B04': {
    groupName: 'Pasivos No Corrientes', prefix: 'B-04',
    detailSections: [
      { key: 'S2', label: 'Deuda a Largo Plazo', subSumaria: 'B-04a' },
      { key: 'S3', label: 'Provisiones LP',      subSumaria: 'B-04b' },
      { key: 'S4', label: 'Arrendamientos LP (NIIF 16)', subSumaria: 'B-04c' },
    ],
    conclusionSectionKey: 'S5',
  },
  'PT-FIN-B05': {
    groupName: 'Patrimonio', prefix: 'B-05',
    detailSections: [
      { key: 'S2', label: 'Capital Social',       subSumaria: 'B-05a' },
      { key: 'S3', label: 'Reservas y ORI',       subSumaria: 'B-05b' },
      { key: 'S4', label: 'Utilidades Retenidas y del Período', subSumaria: 'B-05c' },
    ],
    conclusionSectionKey: 'S6',
  },
  'PT-FIN-B06': {
    groupName: 'Resultados (P&G)', prefix: 'B-06',
    detailSections: [
      { key: 'S2', label: 'Ingresos',               subSumaria: 'B-06a' },
      { key: 'S3', label: 'Costo de Ventas',         subSumaria: 'B-06b' },
      { key: 'S4', label: 'Gastos Operativos',       subSumaria: 'B-06c' },
    ],
    conclusionSectionKey: 'S6',
  },
};

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class PaperConsolidationService {
  private readonly logger = new Logger(PaperConsolidationService.name);

  private readonly geminiEndpoint =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

  constructor(
    private readonly prisma:  PrismaService,
    private readonly config:  ConfigService,
  ) {}

  // ─── Event handler ────────────────────────────────────────────────────────

  @OnEvent('paper.consolidate', { async: true })
  async handleConsolidate(event: PaperConsolidateEvent): Promise<void> {
    const { paperId, paperCode, auditId, auditTitle, sourceData, userId, reason, mode = 'merge' } = event;
    this.logger.log(`[Consolidation] Starting: ${paperId} (${paperCode ?? 'no code'}, mode=${mode})`);

    const lsConfig = paperCode ? LEAD_SCHEDULE_CONFIG[paperCode] : null;

    // MASTER papers fuera de PT-MEMO/PT-PROG/lead-schedules (PT-MRCI, PT-DIFS,
    // PT-NIA265, PT-FIN-DICT, etc.) tienen su propio botón de consolidación/
    // propagación determinista — este flujo genérico no sabe qué significan sus
    // secciones y NO debe tocarlas. No-op explícito en vez de dejar caer al
    // prompt "default: PT-MEMO", que escribiría S2..S8 sobre secciones con otro
    // significado (bug real encontrado 2026-08-20: así se corrompieron PT-MRCI S3/S4).
    if (!lsConfig && !PaperConsolidationService.GENERIC_CONSOLIDATION_CODES.has(paperCode)) {
      this.logger.warn(
        `[Consolidation] "${paperCode}" no tiene un flujo de consolidación genérica — se omite. ` +
        `Use el botón de propagación específico de este papel.`,
      );
      await this.prisma.workingPaper.update({
        where: { id: paperId },
        data:  { syncStatus: SyncStatus.SYNCED, lastSyncedAt: new Date() },
      }).catch(() => { /* ignore secondary failure */ });
      return;
    }

    try {
      // ── PI.5: capture snapshot of current state BEFORE modifying ────────
      await this.snapshotCurrentState(paperId, sourceData, userId, reason);

      // 1. Generate section content (AI or fallback)
      let sections: SectionMap;
      if (lsConfig) {
        sections = await this.generateLeadScheduleSections(lsConfig, auditId, auditTitle);
        if (mode === 'merge') {
          sections = await this.mergeDetailRows(paperId, lsConfig, sections);
        }
      } else {
        sections = await this.generateSections(paperCode, sourceData, auditTitle);
      }

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

  // ─── Lead schedule generation ─────────────────────────────────────────────

  private async generateLeadScheduleSections(
    config:     LeadScheduleConfig,
    auditId:    string,
    auditTitle: string,
  ): Promise<SectionMap> {
    // Fetch B-00 S2 (classified account mapping)
    const b00 = await this.prisma.workingPaper.findFirst({
      where:   { auditId, paperCode: 'PT-FIN-B00' },
      include: { sections: { where: { sectionKey: 'S2' } } },
    });

    const allAccounts = Array.isArray(b00?.sections[0]?.value)
      ? (b00!.sections[0].value as unknown as AccountMappingRow[])
      : [];

    // Filter to this paper's prefix (B-01, B-02, …)
    const groupAccounts = allAccounts.filter(a => a.sub_sumaria?.startsWith(config.prefix));

    const sections: SectionMap = {};

    // ── Detail sections (S2-Sx): one per sub-sumaria subgroup ────────────
    for (const det of config.detailSections) {
      const rows = groupAccounts
        .filter(a => a.sub_sumaria === det.subSumaria)
        .map(a => ({
          cuenta:        a.cuenta,
          descripcion:   a.descripcion,
          saldo_actual:  a.saldo_actual,
          saldo_anterior: a.saldo_anterior,
          var_abs:  (a.saldo_actual ?? 0) - (a.saldo_anterior ?? 0),
          var_pct:  a.saldo_anterior
            ? Math.round(((a.saldo_actual - a.saldo_anterior) / Math.abs(a.saldo_anterior)) * 1000) / 10
            : 0,
        }));
      if (rows.length > 0) sections[det.key] = rows;
    }

    // ── AI analysis sections (S6/S7/S9 or equivalents) ───────────────────
    const totalActual   = groupAccounts.reduce((s, a) => s + (a.saldo_actual   ?? 0), 0);
    const totalAnterior = groupAccounts.reduce((s, a) => s + (a.saldo_anterior ?? 0), 0);

    const apiKey = this.config.get<string>('GEMINI_API_KEY', '');
    let aiSections: SectionMap = {};

    if (apiKey && groupAccounts.length > 0) {
      try {
        const prompt = this.buildLeadSchedulePrompt(config, groupAccounts, totalActual, totalAnterior, auditTitle);
        aiSections   = await this.callGeminiWithPrompt(apiKey, prompt);
        this.logger.log(`[Consolidation] Lead schedule AI OK: ${config.groupName}`);
      } catch (err) {
        this.logger.warn('[Consolidation] Lead schedule Gemini failed, using fallback', String(err));
      }
    }

    if (!aiSections[config.conclusionSectionKey]) {
      aiSections = this.templateFallbackLeadSchedule(config, groupAccounts, totalActual, totalAnterior, auditTitle);
    }

    return { ...sections, ...aiSections };
  }

  /**
   * "Merge" reconsolidation: preserves the auditor's own work on detail rows
   * (id, nota_auditor, ajuste_debito, ajuste_credito, attachments) by matching
   * freshly-generated rows against the currently persisted ones via account code
   * (`cuenta`). Rows for accounts no longer present are simply dropped (their
   * evidence attachments become orphaned in content.accountScheduleEvidence,
   * same as any other row deletion). New accounts get blank annotations.
   */
  private async mergeDetailRows(
    paperId: string,
    config:  LeadScheduleConfig,
    fresh:   SectionMap,
  ): Promise<SectionMap> {
    const keys = config.detailSections.map(d => d.key);
    if (keys.length === 0) return fresh;

    const existing = await this.prisma.paperSection.findMany({
      where:  { paperId, sectionKey: { in: keys } },
      select: { sectionKey: true, value: true },
    });
    const existingByKey = new Map(existing.map(s => [s.sectionKey, s.value]));
    const PRESERVE_FIELDS = ['id', 'nota_auditor', 'ajuste_debito', 'ajuste_credito', 'attachments'] as const;

    const merged: SectionMap = { ...fresh };
    for (const key of keys) {
      const freshRows = fresh[key];
      if (!Array.isArray(freshRows)) continue;
      const existingRows = existingByKey.get(key);
      if (!Array.isArray(existingRows) || existingRows.length === 0) continue;

      const existingByCuenta = new Map(
        (existingRows as Array<Record<string, unknown>>)
          .filter(r => r && typeof r.cuenta === 'string')
          .map(r => [r.cuenta as string, r]),
      );

      merged[key] = (freshRows as Array<Record<string, unknown>>).map(row => {
        const prior = existingByCuenta.get(row.cuenta as string);
        if (!prior) return row;
        const out: Record<string, unknown> = { ...row };
        for (const f of PRESERVE_FIELDS) {
          if (prior[f] !== undefined) out[f] = prior[f];
        }
        return out;
      });
    }
    return merged;
  }

  // ─── Section generation ───────────────────────────────────────────────────

  // paperCodes con un prompt/fallback real en buildPrompt()/templateFallback() más
  // abajo. Guardado también por handleConsolidate() antes de llegar aquí — único
  // caller de este método — pero se deja explícito por si se agrega otro caller.
  static readonly GENERIC_CONSOLIDATION_CODES = new Set<string | null>(['PT-MEMO', 'PT-PROG', null]);

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

  // ─── Gemini calls ─────────────────────────────────────────────────────────

  private async callGeminiWithPrompt(apiKey: string, prompt: string): Promise<SectionMap> {
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

  private async callGemini(
    apiKey:     string,
    paperCode:  string | null,
    sourceData: SourcePaperData[],
    auditTitle: string,
  ): Promise<SectionMap> {
    const prompt = this.buildPrompt(paperCode, sourceData, auditTitle);
    return this.callGeminiWithPrompt(apiKey, prompt);
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

    // NOTA: "Auditoría Financiera Externa v1.0" no usa la nomenclatura genérica
    // PT-A1 — el entendimiento del cliente es PT-FIN-A3-KC. Sí trae PT-A5 (código de
    // plantilla A-05B, "Matriz Integrada RMM") y PT-COSO (A-04C) como fuentes reales
    // de PT-MEMO (corregido 2026-08-20: el comentario anterior decía lo contrario).
    // Mantener también el código legacy PT-A1 en el check por si algún encargo antiguo
    // (plantilla "Auditoría Externa (NIA/ISA)") lo usa.
    const hasEntendimiento = sourceData.some(p => p.paperCode === 'PT-FIN-A3-KC' || p.paperCode === 'PT-A1');
    const hasPTA2 = sourceData.some(p => p.paperCode === 'PT-A2');
    const hasPTA4 = sourceData.some(p => p.paperCode === 'PT-A4');
    const hasPTA5 = sourceData.some(p => p.paperCode === 'PT-A5');
    const hasPTCOSO = sourceData.some(p => p.paperCode === 'PT-COSO');
    const hasPTMRCI = sourceData.some(p => p.paperCode === 'PT-MRCI');
    // Plantilla Fiscal: ver nota equivalente en templateFallback() más abajo — PT-A2
    // en Fiscal es Riesgo de Fraude (no riesgo inherente general) y PT-A4 no existe;
    // estas fuentes solo aparecen en encargos Fiscal, nunca en Financiera.
    const hasFiscRisk = sourceData.some(p => p.paperCode === 'PT-FISC-RISK');
    const hasFiscMat  = sourceData.some(p => p.paperCode === 'PT-FISC-MAT');

    if (paperCode === 'PT-PROG') {
      // PT-PROG's real sections (post-rediseño): S1 Objetivo, S2 Alcance/Población/
      // Aserciones, S3/S3B/S4 datos puntuales, S5 PROCEDURE_GRID (su propio botón
      // "Generar con IA", no tocar aquí), S6 Conclusión, S7 Firmas (MATRIX, manual).
      // Solo generamos S1/S2/S6 — narrativa libre; nunca escribir en S5 ni S7.
      return `Eres un experto en auditoría NIA/IAASB. Con los datos de fuente, genera el contenido narrativo del Programa de Auditoría (PT-PROG) en español.

DATOS DE FUENTE:
${contextLines.join('\n')}

Responde EXCLUSIVAMENTE con un JSON (sin markdown) con estas claves:
{
  "S1": "Objetivo general del programa de auditoría, 2-3 párrafos: (1) alcance general del encargo (áreas/ciclos cubiertos), (2) objetivo referenciando NIA 330, (3) naturaleza del enfoque (sustantivo/mixto/controles) según los riesgos significativos y el nivel de riesgo inherente de PT-A2. Incluye cita [PT-A2]. Máx. 300 palabras.",
  "S2": "Alcance, población y aserciones relevantes a nivel de encargo, 2-3 párrafos: (1) alcance de las pruebas por área significativa, (2) fuente de datos/población (balance de comprobación, período), (3) aserciones relevantes (Existencia, Integridad, Valuación, Derechos y Obligaciones, Presentación) por tipo de cuenta, referenciando materialidad de PT-A4. Incluye cita [PT-A4]. Máx. 300 palabras.",
  "S6": "Conclusión general del programa, 1-2 párrafos formales: indica que los procedimientos detallados en la Cédula de Procedimientos y Actividades (S5) responden a los riesgos identificados en PT-A2 y a la materialidad de PT-A4, y que su ejecución y conclusión final quedan sujetas al trabajo de campo. Incluye citas [PT-A2][PT-A4]. Máx. 200 palabras."
}`;
    }

    // Default: PT-MEMO
    return `Eres un experto en documentación de auditoría externa e interna. Con los datos de fuente, genera el Memorando de Planificación (PT-MEMO) en español formal de auditoría.

DATOS DE FUENTE:
${contextLines.join('\n')}

Responde EXCLUSIVAMENTE con un JSON (sin markdown extra) con estas claves:
{
  "S2": "${hasEntendimiento ? 'Entendimiento del negocio: resumen ejecutivo en 3 párrafos síntesis del papel de Conocimiento del Cliente y su Entorno (PT-FIN-A3-KC) — usa el contenido real que aparece en DATOS DE FUENTE bajo ese código, no lo trates como no disponible' : 'Entendimiento del negocio: indica que el papel de Conocimiento del Cliente aún no está completo y describe los pasos a seguir'}. Incluye cita [PT-FIN-A3-KC]. Máx. 350 palabras.",
  "S3": "${hasFiscRisk ? `Evaluación del riesgo inherente de incumplimiento fiscal: 2-3 párrafos con el nivel de riesgo por impuesto (ISR/IVA/Retenciones/Precios de Transferencia) de PT-FISC-RISK.${hasPTA2 ? ' Agrega un párrafo final citando PT-A2 EXCLUSIVAMENTE como complemento de riesgo de FRAUDE fiscal — nunca lo presentes como el riesgo inherente general, esa cifra viene de PT-FISC-RISK.' : ''} Incluye cita [PT-FISC-RISK]${hasPTA2 ? '[PT-A2]' : ''}.` : (hasPTA2 ? 'Evaluación del riesgo inherente: 2-3 párrafos con nivel global de RI, riesgos significativos y riesgo de fraude de PT-A2. Incluye presunciones NIA 240 evaluadas. Incluye cita [PT-A2].' : 'Evaluación de RI: indica que PT-A2 no está disponible. Incluye cita [PT-A2].')}. Máx. 300 palabras.",
  "S4": "${hasFiscMat ? 'Materialidad fiscal (NACOT Sección 10): 1-2 párrafos con la materialidad global (MG), la base y tolerancia aplicadas, y la materialidad específica por tributo, de PT-FISC-MAT. Incluye cita [PT-FISC-MAT].' : (hasPTA4 ? 'Materialidad NIA 320: 1-2 párrafos con MG, ME, UAE, base y justificación de PT-A4. Incluye cita [PT-A4].' : 'Materialidad: indica que PT-A4 no está disponible. Incluye cita [PT-A4].')}. Máx. 250 palabras.",
  "S5": "Enfoque de auditoría: describe la estrategia mixta basada en riesgo (controles vs. sustantivo) por área, apoyándote en los riesgos significativos${hasFiscRisk ? ' documentados en PT-FISC-RISK' : ' y presunciones NIA 240 documentados en PT-A2'}. Máx. 200 palabras.",
  "S3b": "${hasPTA5 ? 'Resumen de la Estrategia de Auditoría Consolidada por Área: para cada área/ciclo con RMM evaluado en PT-A5 (sección de estrategia consolidada), indica el nivel RMM y el enfoque de auditoría resultante (solo sustantivo / controles+sustantivo / 100% sustantivo). Formato de lista breve, un renglón por área.' : 'Indica que PT-A5 (Matriz RMM Integrada) no está disponible para este encargo.'}. Incluye cita [PT-A5]. Máx. 250 palabras.",
  "S5b": "${hasPTA5 ? 'Respuestas generales a riesgos pervasivos de EEFF identificados en PT-A5, conforme NIA 330.5 (mayor escepticismo, personal más experimentado, imprevisibilidad, procedimientos al cierre en lugar de interino). Si PT-A5 no identificó riesgos pervasivos, indícalo expresamente: "No se identificaron riesgos pervasivos de EEFF que requieran respuesta general".' : 'Indica que PT-A5 no está disponible.'}. Incluye cita [PT-A5]. Máx. 200 palabras.",
  "S3c": "${hasPTCOSO ? 'Conclusión global de control interno: 1-2 párrafos con el resultado de la evaluación COSO 2013 (EFECTIVO / CON_DEBILIDADES_SIGNIFICATIVAS / INEFECTIVO) de PT-COSO y su implicación directa en el enfoque de auditoría (ENFOQUE_CONTROLES / MIXTO / SUSTANTIVO).' : 'Indica que la evaluación COSO (PT-COSO) aún no está completa.'}. Incluye cita [PT-COSO]. Máx. 200 palabras.",
  "S4b": "${hasPTMRCI ? 'Riesgo residual e impacto potencial en el dictamen: resume la conclusión de PT-MRCI — cuántos riesgos quedaron con residual Alto/Muy Alto tras considerar los controles, y si alguno tiene impacto potencial distinto de \\"Ninguno\\" en el tipo de opinión.' : 'Indica que la Matriz de Riesgo-Control-Impacto (PT-MRCI) aún no está completa.'}. Incluye cita [PT-MRCI]. Máx. 250 palabras.",
  "S8": "Conclusión integral del memorando: 2 párrafos formales que integren entendimiento del negocio, evaluación de riesgos y materialidad para concluir el enfoque de auditoría de '${auditTitle}'. Lenguaje ${hasFiscRisk || hasFiscMat ? 'NACOT' : 'NIA/ISA'} profesional. Incluye citas [PT-FIN-A3-KC]${hasFiscRisk ? '[PT-FISC-RISK]' : '[PT-A2]'}${hasFiscMat ? '[PT-FISC-MAT]' : '[PT-A4]'}."
}

INSTRUCCIONES:
- Redacta en español formal de auditoría (${hasFiscRisk || hasFiscMat ? 'NACOT' : 'NIA/IAASB'})
- Usa citas [PT-FIN-A3-KC], [PT-A2], [PT-A4], [PT-FISC-RISK], [PT-FISC-MAT], [PT-A5], [PT-COSO], [PT-MRCI] al referenciar fuentes — SOLO usa los códigos que efectivamente aparecen en DATOS DE FUENTE arriba, con el contenido real que traen (nunca digas que una fuente "no está disponible" si su bloque aparece en DATOS DE FUENTE)
- Si PT-FISC-RISK está presente en DATOS DE FUENTE, ese es el riesgo inherente fiscal real — PT-A2 (si también aparece) es únicamente riesgo de FRAUDE, un dato complementario, JAMÁS lo presentes como el nivel de riesgo inherente general
- Si PT-FISC-MAT está presente en DATOS DE FUENTE, esa es la materialidad real de este encargo — ignora cualquier mención a PT-A4, que no aplica a auditorías fiscales
- Si citas un artículo o sección normativa (Código Tributario, Ley de ISR, Ley de IVA, Código de Comercio, NACOT), cita ÚNICAMENTE los que aparezcan textualmente en DATOS DE FUENTE arriba — nunca inventes ni adivines un número de artículo o de sección que no esté ahí. La NACOT tiene 19 secciones numeradas secuencialmente (no una numeración estilo NIA 100/300/500); si no estás seguro de la sección exacta, cita "conforme a la NACOT" sin número en vez de arriesgar un número incorrecto
- Sé conciso pero completo
- Solo el JSON, sin texto fuera del objeto`;
  }

  // ─── Lead schedule prompt ────────────────────────────────────────────────

  private buildLeadSchedulePrompt(
    config:        LeadScheduleConfig,
    accounts:      AccountMappingRow[],
    totalActual:   number,
    totalAnterior: number,
    auditTitle:    string,
  ): string {
    const fmt = (n: number) =>
      new Intl.NumberFormat('es-SV', { maximumFractionDigits: 0 }).format(Math.abs(n));

    const varTotal = totalActual - totalAnterior;
    const varPct   = totalAnterior !== 0
      ? Math.round((varTotal / Math.abs(totalAnterior)) * 100) : 0;

    const lines = accounts.map(a => {
      const v  = (a.saldo_actual ?? 0) - (a.saldo_anterior ?? 0);
      const vp = a.saldo_anterior
        ? Math.round((v / Math.abs(a.saldo_anterior)) * 100) : 0;
      return `${a.cuenta} | ${a.descripcion} | ${fmt(a.saldo_actual)} | ${fmt(a.saldo_anterior)} | ${v >= 0 ? '+' : ''}${fmt(Math.abs(v))} (${vp >= 0 ? '+' : ''}${vp}%)`;
    }).join('\n');

    const { analysisSectionKey: sk6, proceduresSectionKey: sk7, conclusionSectionKey: sk9 } = config;

    // Not every lead schedule paper has all 3 narrative sections split out — build
    // the requested JSON shape to match whichever keys this paper's template has.
    const claims: string[] = [];
    if (sk6) {
      claims.push(`  "${sk6}": "Análisis de variaciones del grupo ${config.groupName} en 3-4 párrafos: variación total, sub-áreas con mayor movimiento, causas probables, cuentas que superan 15% de variación. Lenguaje NIA formal. Máx 400 palabras."`);
    }
    if (sk7) {
      claims.push(`  "${sk7}": "Procedimientos sustantivos recomendados en 6-8 ítems numerados: '1. Procedimiento: descripción concisa'. Basados en variaciones y riesgos de ${config.groupName}. Incluir referencia a papeles de detalle. Máx 300 palabras."`);
    }
    if (sk6) {
      claims.push(`  "${sk9}": "Conclusión preliminar del área ${config.groupName} en 2 párrafos: nivel de riesgo identificado, razonabilidad de saldos, indicar que el auditor debe completar con evidencia de campo."`);
    } else {
      // No separate analysis section on this paper — fold the variance analysis
      // INTO the conclusion so that content isn't lost.
      claims.push(`  "${sk9}": "Análisis de variaciones y conclusión preliminar del área ${config.groupName} en 4-5 párrafos: (1-2) variación total, sub-áreas con mayor movimiento, causas probables, cuentas que superan 15% de variación; (3) nivel de riesgo identificado, razonabilidad de saldos; (4) indicar que el auditor debe completar con evidencia de campo. Lenguaje NIA formal. Máx 500 palabras."`);
    }

    return `Eres un auditor senior experto en NIA/IAASB. Analiza el grupo "${config.groupName}" de la auditoría "${auditTitle}".

CUENTAS DEL GRUPO (código | nombre | saldo actual | saldo año anterior | variación):
${lines}

TOTAL GRUPO: $${fmt(totalActual)} (año anterior: $${fmt(totalAnterior)}, variación: ${varPct >= 0 ? '+' : ''}${varPct}%)

Responde EXCLUSIVAMENTE con JSON (sin markdown) con estas claves:
{
${claims.join(',\n')}
}`;
  }

  // ─── Lead schedule fallback ───────────────────────────────────────────────

  private templateFallbackLeadSchedule(
    config:        LeadScheduleConfig,
    accounts:      AccountMappingRow[],
    totalActual:   number,
    totalAnterior: number,
    auditTitle:    string,
  ): SectionMap {
    const fmt = (n: number) =>
      new Intl.NumberFormat('es-SV', { maximumFractionDigits: 0 }).format(Math.abs(n));

    const varTotal = totalActual - totalAnterior;
    const varPct   = totalAnterior !== 0
      ? Math.round((varTotal / Math.abs(totalAnterior)) * 100) : 0;
    const now      = new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' });

    const significant = accounts
      .filter(a => {
        const v  = (a.saldo_actual ?? 0) - (a.saldo_anterior ?? 0);
        const vp = a.saldo_anterior ? Math.abs(v / a.saldo_anterior) * 100 : 0;
        return vp > 15 || Math.abs(v) > 50_000;
      })
      .map(a => {
        const v  = (a.saldo_actual ?? 0) - (a.saldo_anterior ?? 0);
        const vp = a.saldo_anterior ? Math.round((v / Math.abs(a.saldo_anterior)) * 100) : 0;
        return `• ${a.descripcion} (${a.cuenta}): ${v >= 0 ? '+' : '-'}$${fmt(Math.abs(v))} (${vp >= 0 ? '+' : ''}${vp}%)`;
      }).join('\n');

    const { analysisSectionKey: sk6, proceduresSectionKey: sk7, conclusionSectionKey: sk9 } = config;

    const analysisText = `El grupo ${config.groupName} de la auditoría "${auditTitle}" totaliza $${fmt(Math.abs(totalActual))} al cierre del período auditado, frente a $${fmt(Math.abs(totalAnterior))} del año anterior, reflejando una variación de ${varPct >= 0 ? '+' : ''}${varPct}%.\n\nCuentas con variaciones relevantes (>15% o >$50,000):\n${significant || '• No se identificaron variaciones individuales significativas.'}\n\nEl auditor debe analizar las causas de cada variación y determinar su consistencia con el entendimiento del negocio. Generado automáticamente el ${now}.`;

    const proceduresText = [
      '1. Procedimiento: Conciliar el total del grupo con el balance de comprobación (B-00) y verificar cuadre con cédula sumaria S1.',
      '2. Procedimiento: Aplicar procedimientos analíticos a cuentas con variación >15% para identificar causas e inconsistencias.',
      '3. Procedimiento: Seleccionar partidas para pruebas de detalle según materialidad de PT-A4 y el nivel de riesgo del área.',
      '4. Procedimiento: Verificar existencia, valuación y presentación de saldos significativos conforme a NIA 500.',
      '5. Procedimiento: Obtener documentación de soporte para saldos con variación inusual o sin explicación aparente.',
      '6. Procedimiento: Documentar evidencia obtenida en papeles de trabajo de detalle (C-0x) por cada cuenta examinada.',
    ].join('\n');

    const conclusionText = `Conclusión preliminar — ${config.groupName}: Con base en el análisis del balance de comprobación, el grupo totaliza $${fmt(Math.abs(totalActual))} con ${accounts.length} cuenta(s) y una variación de ${varPct >= 0 ? '+' : ''}${varPct}% respecto al año anterior.\n\nEsta conclusión es preliminar. El auditor responsable debe completarla con la evidencia de campo obtenida, las excepciones resueltas y la evaluación final de razonabilidad, antes de aprobar y firmar este papel de trabajo. Generado automáticamente el ${now}.`;

    const result: SectionMap = {};
    if (sk6) {
      result[sk6] = analysisText;
      result[sk9] = conclusionText;
    } else {
      // No separate analysis section — fold both into the single conclusion section.
      result[sk9] = `${analysisText}\n\n${conclusionText}`;
    }
    if (sk7) result[sk7] = proceduresText;
    return result;
  }

  // ─── Template fallback ────────────────────────────────────────────────────

  private templateFallback(
    paperCode:  string | null,
    sourceData: SourcePaperData[],
    auditTitle: string,
  ): SectionMap {
    const now   = new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' });
    const a1    = sourceData.find(p => p.paperCode === 'PT-FIN-A3-KC' || p.paperCode === 'PT-A1');
    const a2    = sourceData.find(p => p.paperCode === 'PT-A2');
    const a4    = sourceData.find(p => p.paperCode === 'PT-A4');

    // Plantilla Fiscal: PT-A2 en Fiscal es el papel de Riesgo de FRAUDE (no de riesgo
    // inherente general — ese vive en PT-FISC-RISK), y PT-A4 no existe en Fiscal en
    // absoluto (la materialidad fiscal vive en PT-FISC-MAT). Detectarlos por separado
    // y preferirlos SOLO cuando están presentes — un encargo Financiero nunca trae
    // PT-FISC-RISK/PT-FISC-MAT como fuente, así que esta rama nunca se activa por
    // error para esa plantilla; el camino a2/a4 de abajo queda intacto como estaba.
    const fiscRisk = sourceData.find(p => p.paperCode === 'PT-FISC-RISK');
    const fiscMat  = sourceData.find(p => p.paperCode === 'PT-FISC-MAT');

    const a1Bullets = a1
      ? a1.sections
          .filter(s => this.valToString(s.value).length > 5)
          .slice(0, 4)
          .map(s => `• ${s.label}: ${this.valToString(s.value).slice(0, 200)}`)
          .join('\n')
      : 'El papel de Conocimiento del Cliente y su Entorno (PT-FIN-A3-KC) aún no ha sido completado.';

    const riConclusion = a2?.sections.find(s => s.sectionKey === 'S8');
    const riLevel      = riConclusion ? this.valToString(riConclusion.value) : 'MODERADO';

    const mgSection  = a4?.sections.find(s => s.sectionKey === 'S3');
    const meSection  = a4?.sections.find(s => s.sectionKey === 'S4');
    const uaeSection = a4?.sections.find(s => s.sectionKey === 'S5');

    const a5    = sourceData.find(p => p.paperCode === 'PT-A5');
    const coso  = sourceData.find(p => p.paperCode === 'PT-COSO');
    const mrci  = sourceData.find(p => p.paperCode === 'PT-MRCI');

    const a5S4 = a5?.sections.find(s => s.sectionKey === 'S4');
    const a5S2 = a5?.sections.find(s => s.sectionKey === 'S2');
    const cosoS6 = coso?.sections.find(s => s.sectionKey === 'S6');
    const cosoS7 = coso?.sections.find(s => s.sectionKey === 'S7');
    const mrciS4 = mrci?.sections.find(s => s.sectionKey === 'S4');

    const humanizeEnum = (v: unknown) => this.valToString(v)
      .toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    // Renderiza un array MATRIX como lista breve "· Campo clave: valor" (un renglón
    // por fila, usando la primera columna como etiqueta) — mismo espíritu que
    // a1Bullets arriba, reutilizable para cualquier sección MATRIX de origen.
    const matrixBullets = (section: { value: unknown } | undefined, cols: string[], max = 6): string => {
      const rows = Array.isArray(section?.value) ? (section!.value as Record<string, unknown>[]) : [];
      if (rows.length === 0) return '';
      return rows.slice(0, max)
        .map(r => `• ${cols.map(c => r[c]).filter(v => v !== undefined && v !== '').join(' — ')}`)
        .join('\n');
    };

    const s3bText = a5S4
      ? `Resumen de la Estrategia de Auditoría Consolidada por Área [PT-A5]:\n\n${matrixBullets(a5S4, ['Área/Ciclo', 'RMM', 'Enfoque principal', 'ME específica ($)']) || 'PT-A5 aún no tiene áreas registradas en su Estrategia Consolidada (S4).'}`
      : 'La Matriz RMM Integrada (PT-A5) no está disponible para este encargo.';

    const s5bBullets = matrixBullets(a5S2, ['Descripción del riesgo pervasivo', 'Respuesta general del auditor (NIA 330.5)']);
    const s5bText = a5S4
      ? (s5bBullets
          ? `Respuestas generales a riesgos pervasivos de EEFF (NIA 330.5) [PT-A5]:\n\n${s5bBullets}`
          : 'No se identificaron riesgos pervasivos de EEFF que requieran respuesta general [PT-A5].')
      : 'La Matriz RMM Integrada (PT-A5) no está disponible para este encargo.';

    const s3cText = (cosoS6 || cosoS7)
      ? `La evaluación COSO 2013 del Sistema de Control Interno [PT-COSO] concluye en un resultado global de **${cosoS6 ? humanizeEnum(cosoS6.value) : 'Sin evaluar'}**, con una implicación en el enfoque de auditoría de **${cosoS7 ? humanizeEnum(cosoS7.value) : 'Sin definir'}**.\n\nEsta conclusión complementa la evaluación de Riesgo de Control (PT-A3) explicando el nivel de confianza depositable en el ambiente de control de la entidad.`
      : 'La evaluación COSO 2013 del Sistema de Control Interno (PT-COSO) aún no está completa.';

    const s4bText = mrciS4
      ? `Conclusión de la Matriz de Riesgo-Control-Impacto [PT-MRCI]:\n\n${this.valToString(mrciS4.value)}`
      : 'La Matriz de Riesgo, Control e Impacto (PT-MRCI) aún no está completa.';

    if (paperCode === 'PT-PROG') {
      return {
        S1: `Objetivo general del programa de auditoría para "${auditTitle}": conforme a NIA 330, el programa responde a los riesgos de incorrección material identificados en la evaluación de riesgos [PT-A2], aplicando un enfoque combinado de pruebas de controles y procedimientos sustantivos proporcional al nivel de riesgo de cada área.\n\nGenerado automáticamente el ${now}. El auditor debe revisar y ajustar según las circunstancias específicas de la auditoría.`,
        S2: `El alcance de las pruebas cubre las áreas y saldos significativos de los estados financieros, con la población y período definidos por cada cédula sumaria (B-01 a B-06). Las aserciones relevantes (Existencia, Integridad, Valuación, Derechos y Obligaciones, Presentación) se evalúan por tipo de cuenta conforme a NIA 315 Rev. 2019, referenciando la materialidad de ejecución establecida en [PT-A4].`,
        S6: `Conclusión general: los procedimientos detallados en la Cédula de Procedimientos y Actividades (S5) responden a los riesgos identificados en [PT-A2] y a la materialidad definida en [PT-A4]. Su ejecución y conclusión final quedan sujetas a la evidencia obtenida en el trabajo de campo.\n\nGenerado automáticamente el ${now}.`,
      };
    }

    // ── Riesgo inherente (S3): Fiscal usa PT-FISC-RISK como fuente principal —
    // PT-A2 en Fiscal es el papel de FRAUDE, se cita aparte como complemento, nunca
    // como el nivel de riesgo inherente general.
    const fiscRiskS3 = fiscRisk?.sections.find(s => s.sectionKey === 'S3'); // Riesgo de incumplimiento significativo
    const fiscRiskS7 = fiscRisk?.sections.find(s => s.sectionKey === 'S7'); // Score de riesgo por impuesto (MATRIX)
    const fraudS7    = a2?.sections.find(s => s.sectionKey === 'S7');       // Riesgo de fraude ACFE+NIA240 (también existe en Financiera)
    const s3Text = fiscRisk
      ? [
          `Evaluación del riesgo inherente de incumplimiento fiscal [PT-FISC-RISK] para "${auditTitle}":`,
          matrixBullets(fiscRiskS7, ['Impuesto', 'Score de Riesgo']) || '',
          fiscRiskS3 ? `\n${this.valToString(fiscRiskS3.value)}` : '',
          fraudS7 ? `\n\nRiesgo de fraude fiscal (complementario) [PT-A2]:\n${matrixBullets(fraudS7, ['Indicador ACFE/NIA 240', 'Presente']) || this.valToString(fraudS7.value).slice(0, 400)}` : '',
          '\nEl equipo de auditoría aplicará un enfoque basado en riesgos, asignando mayor cobertura a las áreas de riesgo alto e incorporando procedimientos para los riesgos de fraude identificados (NIA 240 adaptada a NACOT).',
        ].filter(Boolean).join('\n')
      : `La evaluación del riesgo inherente [PT-A2] para la auditoría "${auditTitle}" concluye en un nivel de riesgo inherente global: **${riLevel}**.\n\nSe han identificado áreas de riesgo significativo que requieren procedimientos específicos conforme a NIA 315. El equipo de auditoría aplicará un enfoque basado en riesgos, asignando mayor cobertura a las áreas de riesgo alto e incorporando procedimientos para los riesgos de fraude identificados (NIA 240).`;

    // ── Materialidad (S4): Fiscal usa PT-FISC-MAT (NACOT Sec. 10) — PT-A4 no existe
    // en la plantilla Fiscal en absoluto, así que esta rama es la única fuente posible.
    const fiscMatS4 = fiscMat?.sections.find(s => s.sectionKey === 'S4'); // Materialidad Global calculada
    const fiscMatS7 = fiscMat?.sections.find(s => s.sectionKey === 'S7'); // Conclusión sobre aplicación
    const s4Text = fiscMat
      ? [
          `La materialidad fiscal fue determinada de conformidad con NACOT Sección 10 [PT-FISC-MAT].`,
          fiscMatS4 ? `Materialidad Global (MG): ${this.valToString(fiscMatS4.value)}` : '',
          fiscMatS7 ? `\n${this.valToString(fiscMatS7.value)}` : '',
        ].filter(Boolean).join('\n')
      : [
          `La materialidad fue calculada de conformidad con NIA 320 [PT-A4].`,
          mgSection  ? `Materialidad Global (MG): ${this.valToString(mgSection.value)}` : '',
          meSection  ? `Materialidad de Ejecución (ME): ${this.valToString(meSection.value)}` : '',
          uaeSection ? `Umbral de Ajuste Específico (UAE): ${this.valToString(uaeSection.value)}` : '',
          '',
          'Los importes anteriores constituyen la referencia para la identificación de errores materiales durante la ejecución.',
        ].filter(Boolean).join('\n');

    // PT-MEMO
    return {
      S2: `Con base en el papel de Conocimiento del Cliente y su Entorno [PT-FIN-A3-KC], se obtuvo el siguiente entendimiento del negocio para la auditoría "${auditTitle}":\n\n${a1Bullets}\n\nEl auditor ha obtenido comprensión suficiente del entorno operativo, regulatorio y de sistemas de la entidad para planificar adecuadamente los procedimientos de auditoría conforme a las NIA.`,

      S3: s3Text,

      S4: s4Text,

      S3b: s3bText,
      S5b: s5bText,
      S3c: s3cText,
      S4b: s4bText,

      S8: fiscRisk || fiscMat
        ? `Con base en el entendimiento del negocio [PT-FIN-A3-KC], la evaluación de riesgo inherente fiscal [PT-FISC-RISK] y la materialidad fiscal establecida [PT-FISC-MAT], el equipo de auditoría concluye que la planificación de "${auditTitle}" es adecuada y proporciona una base razonable para la ejecución.\n\nEl enfoque combina pruebas de controles en áreas de menor riesgo con procedimientos sustantivos reforzados en áreas de riesgo significativo, conforme a la NACOT. Generado automáticamente el ${now}. El auditor debe revisar y validar este párrafo antes de la aprobación del memorando.`
        : `Con base en el entendimiento del negocio [PT-FIN-A3-KC], la evaluación de riesgo inherente (${riLevel}) [PT-A2] y los parámetros de materialidad establecidos [PT-A4], el equipo de auditoría concluye que la planificación de "${auditTitle}" es adecuada y proporciona una base razonable para la ejecución.\n\nEl enfoque combina pruebas de controles en áreas de menor riesgo con procedimientos sustantivos reforzados en áreas de riesgo significativo, en conformidad con NIA/IAASB. Generado automáticamente el ${now}. El auditor debe revisar y validar este párrafo antes de la aprobación del memorando.`,
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
      if (value === null || value === undefined) continue;
      const isEmpty = Array.isArray(value)
        ? value.length === 0
        : !String(value).trim();
      if (isEmpty) continue;
      // updateMany silently skips when 0 rows match (sections not yet initialised)
      await this.prisma.paperSection.updateMany({
        where: { paperId, sectionKey },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data:  { value: value as any, isStale: false, staleSince: null, staleReason: null },
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
    const str = (v: unknown) => (typeof v === 'string' ? v : '');

    // ── B-series lead schedule ────────────────────────────────────────────
    const lsConfig = paperCode ? LEAD_SCHEDULE_CONFIG[paperCode] : null;
    if (lsConfig) {
      parts.push(`**${paperCode} — ${lsConfig.groupName} · ${auditTitle}**\n\n`);
      const s6 = lsConfig.analysisSectionKey   ? str(sections[lsConfig.analysisSectionKey])   : '';
      const s7 = lsConfig.proceduresSectionKey ? str(sections[lsConfig.proceduresSectionKey]) : '';
      const s9 = str(sections[lsConfig.conclusionSectionKey]);
      if (s6) parts.push(`### I. Análisis de Variaciones\n\n${s6}`);
      if (s7) parts.push(`\n\n### II. Procedimientos Sustantivos Recomendados\n\n${s7}`);
      if (s9) parts.push(`\n\n### III. Conclusión Preliminar del Área\n\n${s9}`);
      return parts.join('');
    }

    // ── PT-PROG ───────────────────────────────────────────────────────────
    if (paperCode === 'PT-PROG') {
      if (sections.S1) parts.push(`### Objetivo del Programa\n\n${str(sections.S1)}`);
      if (sections.S2) parts.push(`\n\n### Alcance, Población y Aserciones\n\n${str(sections.S2)}`);
      if (sections.S6) parts.push(`\n\n### Conclusión General\n\n${str(sections.S6)}`);
      return parts.join('');
    }

    // ── PT-MEMO / generic MASTER ──────────────────────────────────────────
    parts.push(`**${paperCode ?? 'Memorando'} — ${auditTitle}**\n\n`);
    if (sections.S2)  parts.push(`### I. Entendimiento del Negocio\n\n${str(sections.S2)}`);
    if (sections.S3)  parts.push(`\n\n### II. Evaluación de Riesgo Inherente\n\n${str(sections.S3)}`);
    if (sections.S3c) parts.push(`\n\n### III. Conclusión Global de Control Interno\n\n${str(sections.S3c)}`);
    if (sections.S4)  parts.push(`\n\n### IV. Materialidad\n\n${str(sections.S4)}`);
    if (sections.S3b) parts.push(`\n\n### V. Resumen RMM por Área\n\n${str(sections.S3b)}`);
    if (sections.S5b) parts.push(`\n\n### VI. Respuesta a Riesgos Pervasivos\n\n${str(sections.S5b)}`);
    if (sections.S4b) parts.push(`\n\n### VII. Riesgo Residual e Impacto en el Dictamen\n\n${str(sections.S4b)}`);
    if (sections.S8)  parts.push(`\n\n### VIII. Conclusión y Enfoque de Auditoría\n\n${str(sections.S8)}`);
    return parts.join('');
  }
}
