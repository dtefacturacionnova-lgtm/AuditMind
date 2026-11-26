import { Injectable, Logger, NotFoundException, ForbiddenException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { UsageService } from '../billing/usage.service';
import { AuthUser } from '../auth/jwt.strategy';
import { assertInvestigationAccess, visibleAuditWhere } from '../common/utils/investigation-scope.util';
import { generateText, isLlmConfigured } from '../common/llm/llm-client';
import { AiService } from '../ai/ai.service';
import {
  BUDGETS, PaperAiInput, assessPaperContext, buildPaperBrief, buildRagBlock, frameworkFor, insufficientInstruction, insufficientMessage,
  loadPaperAiInput, parseInsufficient, ragBaseFor, ragQueryFor,
} from './paper-ai-context';
import { PAPER_LIBRARY, PaperLibrary, librarySuggestionsFor } from './paper-library';
import { OrgLibraryDb, effectiveEntry, loadMergedPaper } from './paper-library/org-library';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SuggestionPriority = 'HIGH' | 'MEDIUM' | 'LOW';

export interface AiProcedureSuggestion {
  id:         string;
  area:       string;
  procedure:  string;
  rationale:  string;
  priority:   SuggestionPriority;
  basedOn:    string;   // human-readable source description
  niaRef?:    string;   // e.g. "NIA 315, NIA 240"
  /** De dónde sale: `LIBRARY` = biblioteca curada del papel (sin gasto de IA); `AI` = generada por la IA. */
  source?:      'LIBRARY' | 'AI';
  /** Solo biblioteca: lo necesario para aplicar el ítem completo al papel (título, enunciado y desarrollo modelo). */
  title?:       string;
  statement?:   string;
  development?: string;
  /** Solo biblioteca: `BASE` del sistema, `EDITED` ajustado por la organización, `OWN` creado por ella. */
  origin?:      'BASE' | 'EDITED' | 'OWN';
}

export interface CrossAuditSuggestionsResult {
  auditId:          string;
  suggestions:      AiProcedureSuggestion[];
  basedOnAudits:    number;
  totalFindings:    number;
  recurringAreas:   string[];
  generatedAt:      string;
  aiGenerated:      boolean;
  /** Con papel: la IA (o el servidor) avisa que no hay contexto suficiente / que la IA no respondió, en vez de rellenar con reglas genéricas. */
  insufficientContext?: boolean;
  notice?:          string;
  /** Con papel: cuántas sugerencias vienen de la biblioteca del papel. */
  libraryCount?:    number;
  /** Con biblioteca: se puede pedir a la IA que AMPLÍE (nuevas sugerencias que no repitan las de la biblioteca). */
  canExpand?:       boolean;
}

interface GeminiSuggestion {
  area:      string;
  procedure: string;
  rationale: string;
  priority:  SuggestionPriority;
  niaRef?:   string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class CrossAuditLearningService {
  private readonly logger = new Logger(CrossAuditLearningService.name);

  constructor(
    private readonly prisma:  PrismaService,
    private readonly config:  ConfigService,
    // Opcional: sin él (pruebas que construyen el servicio a mano) las acciones de IA corren sin medirse.
    @Optional() private readonly usage?: UsageService,
    // Opcional: sin él no se consulta la normativa (RAG) y el resto funciona igual.
    @Optional() private readonly aiService?: AiService,
  ) {}

  // ─── Public API ───────────────────────────────────────────────────────────

  async generateSuggestions(
    auditId: string,
    user:    AuthUser,
    paperId?: string,
    expand = false,
  ): Promise<CrossAuditSuggestionsResult> {
    // Validate access
    const audit = await this.prisma.audit.findUnique({
      where:   { id: auditId },
      include: {
        auditEntity: { select: { id: true, name: true, sector: true, category: true } },
        team:        { select: { userId: true } },
      },
    });
    if (!audit) throw new NotFoundException('Auditoría no encontrada');
    if (audit.organizationId !== user.organizationId) throw new ForbiddenException();
    assertInvestigationAccess(audit, user); // modo investigación (2026-10-25): secciones del destino enviadas a la IA

    // ─── Contexto del papel actual (para contextualizar las sugerencias) ──
    let paperContext: { paperCode: string | null; title: string; type: string } | null = null;
    if (paperId) {
      const wp = await this.prisma.workingPaper.findFirst({
        where:  { id: paperId, auditId },
        select: { paperCode: true, title: true, type: true },
      });
      if (wp) {
        paperContext = { paperCode: wp.paperCode, title: wp.title, type: wp.type };
      }
    }

    const entityId = audit.auditEntityId;
    const entityName = audit.auditEntity?.name ?? audit.title;
    const sector = audit.auditEntity?.sector ?? '';

    // ─── 1. Find previous audits for the same entity ─────────────────────
    const previousAudits = entityId
      ? await this.prisma.audit.findMany({
          where: {
            // Solo auditorías que el usuario puede ver: los hallazgos de una investigación ajena no entran al historial.
            AND:            [visibleAuditWhere(user)],
            auditEntityId:  entityId,
            id:             { not: auditId },
          },
          select: { id: true, title: true, type: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 5, // up to 5 previous audits
        })
      : [];

    // ─── 2. Collect findings from previous audits ─────────────────────────
    const prevAuditIds = previousAudits.map(a => a.id);

    // Also look at same sector/type audits within the org if no entity history
    const fallbackAuditIds = prevAuditIds.length === 0 && audit.type
      ? (await this.prisma.audit.findMany({
          where: {
            AND:            [visibleAuditWhere(user)],
            type:           audit.type,
            id:             { not: auditId },
          },
          select: { id: true },
          take:   5,
        })).map(a => a.id)
      : [];

    const sourceAuditIds = [...prevAuditIds, ...fallbackAuditIds].slice(0, 5);

    const pastFindings = sourceAuditIds.length > 0
      ? await this.prisma.finding.findMany({
          where: { auditId: { in: sourceAuditIds } },
          select: {
            id: true, title: true, severity: true, status: true,
            condition: true, cause: true, recommendation: true,
            createdAt: true,
          },
          orderBy: { severity: 'asc' },
          take: 30,
        })
      : [];

    // ─── 3. Contexto del papel actual ─────────────────────────────────────
    // Con papel: la ficha de ESE papel (paper-ai-context.ts) reemplaza las 20 secciones de todos los papeles del encargo, que mezclaban
    // temas ajenos. Sin papel (vista del encargo): comportamiento anterior.
    const paperInput = paperContext && paperId ? await loadPaperAiInput(this.prisma, paperId) : null;

    const smartSections = paperInput
      ? []
      : await this.prisma.paperSection.findMany({
          where: { paper: { auditId } },
          select: {
            sectionKey: true, label: true, value: true, sortOrder: true,
            paper: { select: { paperCode: true, title: true } },
          },
          orderBy: { sortOrder: 'asc' },
          take: 20,
        });

    // ─── 4. Identify recurring areas ─────────────────────────────────────
    const recurringAreas = this.identifyRecurringAreas(pastFindings);

    const base = {
      auditId,
      basedOnAudits:  sourceAuditIds.length,
      totalFindings:  pastFindings.length,
      recurringAreas,
      generatedAt:    new Date().toISOString(),
    };
    const llmReady = isLlmConfigured(this.config);

    // ─── 5a. Con papel: biblioteca primero (0 tokens), IA solo para ampliar o si no hay biblioteca ──
    if (paperInput) {
      const applied = paperInput.procedures.flatMap((p) => [p.title, p.area, p.statement, p.procedure].filter((t): t is string => !!t));
      // Biblioteca de la organización = catálogo del sistema + sus ediciones, ocultos y procedimientos propios. Si la base no responde
      // (o aún no tiene el valor de enum de esta función), se usa el catálogo del sistema tal cual: nunca se cae la sugerencia por esto.
      const code = paperInput.paper.code;
      let orgLibrary: PaperLibrary = PAPER_LIBRARY;
      let hiddenTitles: string[] = [];
      if (code) {
        try {
          const eff = effectiveEntry(await loadMergedPaper(this.prisma as unknown as OrgLibraryDb, user.organizationId, code));
          orgLibrary = { ...PAPER_LIBRARY, [code]: eff.entry };
          hiddenTitles = eff.hiddenTitles;
        } catch (err) {
          this.logger.warn(`[CrossAudit] biblioteca de la organización no disponible, uso la del sistema: ${String(err)}`);
        }
      }
      const lib = librarySuggestionsFor(code, audit.type, applied, orgLibrary);

      if (lib.total > 0 && !expand) {
        return {
          ...base, suggestions: lib.suggestions, aiGenerated: false, libraryCount: lib.suggestions.length, canExpand: llmReady,
          ...(lib.suggestions.length === 0 ? { notice: 'Ya aplicaste todos los procedimientos de la biblioteca de este papel. Puedes pedirle a la IA que amplíe con otros.' } : {}),
        };
      }

      const check = assessPaperContext(paperInput);
      if (!check.enough) {
        return { ...base, suggestions: lib.suggestions, aiGenerated: false, libraryCount: lib.suggestions.length, insufficientContext: true, notice: insufficientMessage(check.missing) };
      }
      if (!llmReady) {
        return { ...base, suggestions: lib.suggestions, aiGenerated: false, libraryCount: lib.suggestions.length, notice: 'La IA no está configurada en este entorno; no se muestran sugerencias genéricas.' };
      }
      try {
        const out = await this.callLlmForPaper(audit, entityName, sector, pastFindings, recurringAreas, paperInput, [...lib.allTitles, ...hiddenTitles, ...applied]);
        if ('insufficient' in out) {
          return { ...base, suggestions: lib.suggestions, aiGenerated: true, libraryCount: lib.suggestions.length, canExpand: lib.total > 0, insufficientContext: true, notice: insufficientMessage([out.insufficient]) };
        }
        return { ...base, suggestions: [...lib.suggestions, ...out.suggestions], aiGenerated: true, libraryCount: lib.suggestions.length, canExpand: lib.total > 0 };
      } catch (err) {
        this.logger.warn('[CrossAudit] LLM failed (con papel), sin relleno genérico', String(err));
        return { ...base, suggestions: lib.suggestions, aiGenerated: false, libraryCount: lib.suggestions.length, canExpand: lib.total > 0, notice: 'La IA no respondió. Intenta de nuevo; no se muestran sugerencias genéricas que no correspondan a este papel.' };
      }
    }

    // ─── 5b. Sin papel (vista del encargo): comportamiento anterior ───────
    let suggestions: AiProcedureSuggestion[];
    let aiGenerated = false;
    if (llmReady && (pastFindings.length > 0 || smartSections.length > 0)) {
      try {
        suggestions = await this.callLlm(
          audit, entityName, sector,
          pastFindings, smartSections, recurringAreas, null,
        );
        aiGenerated = true;
      } catch (err) {
        this.logger.warn('[CrossAudit] LLM failed, using rule-based', String(err));
        suggestions = this.ruleBased(pastFindings, audit.type, recurringAreas);
      }
    } else {
      suggestions = this.ruleBased(pastFindings, audit.type, recurringAreas);
    }

    return { ...base, suggestions, aiGenerated };
  }

  // ─── Recurring area detection ─────────────────────────────────────────────

  private identifyRecurringAreas(
    findings: Array<{ title: string; severity: string }>,
  ): string[] {
    const AREA_KEYWORDS: Record<string, string[]> = {
      'Tesorería / Caja':          ['tesorería', 'caja', 'efectivo', 'banco', 'conciliación'],
      'Compras / Proveedores':     ['compras', 'proveedor', 'adquisición', 'licitación', 'contrato'],
      'Nómina / RRHH':             ['nómina', 'remuneración', 'personal', 'horas extra', 'vacaciones'],
      'Activos Fijos':             ['activo fijo', 'propiedad', 'depreciación', 'inventario fijo'],
      'Ingresos / Facturación':    ['ingreso', 'factura', 'cobranza', 'crédito', 'cliente'],
      'TI / Sistemas':             ['sistema', 'acceso', 'contraseña', 'backup', 'seguridad TI', 'datos'],
      'Cumplimiento / Normativo':  ['normativa', 'ley', 'reglamento', 'compliance', 'regulación'],
      'Gastos Generales':          ['gasto', 'viático', 'representación', 'servicio'],
    };

    const freq: Record<string, number> = {};

    for (const finding of findings) {
      const text = finding.title.toLowerCase();
      for (const [area, keywords] of Object.entries(AREA_KEYWORDS)) {
        if (keywords.some(k => text.includes(k))) {
          freq[area] = (freq[area] ?? 0) + 1;
        }
      }
    }

    // Return areas with ≥1 occurrence, sorted by frequency
    return Object.entries(freq)
      .sort(([, a], [, b]) => b - a)
      .map(([area]) => area)
      .slice(0, 5);
  }

  // ─── Llamada al LLM (OpenRouter → Gemini) ─────────────────────────────────

  private async callLlm(
    audit:          { title: string; type: string },
    entityName:     string,
    sector:         string,
    pastFindings:   Array<{ title: string; severity: string; condition: string | null; recommendation: string | null }>,
    smartSections:  Array<{ sectionKey: string; label: string; value: unknown; paper: { paperCode: string | null; title: string } }>,
    recurringAreas: string[],
    paperContext:   { paperCode: string | null; title: string; type: string } | null,
  ): Promise<AiProcedureSuggestion[]> {
    const findingsSummary = pastFindings.slice(0, 15).map((f, i) =>
      `${i + 1}. [${f.severity}] ${f.title}${f.condition ? ` — ${f.condition.slice(0, 150)}` : ''}`
    ).join('\n');

    const sectionsSummary = smartSections.slice(0, 10).map(s =>
      `[${s.paper.paperCode ?? 'PT'}] ${s.label}: ${String(s.value ?? '').slice(0, 200)}`
    ).join('\n');

    const areasText = recurringAreas.length > 0
      ? `Áreas con hallazgos recurrentes: ${recurringAreas.join(', ')}`
      : 'Sin historial previo de hallazgos en esta entidad.';

    // Bloque de foco del papel actual (cuando se invoca desde un papel)
    const paperFocusBlock = paperContext
      ? `\n🎯 PAPEL DE TRABAJO ACTUAL (enfoca las sugerencias a ESTE papel):
- Código: ${paperContext.paperCode ?? '—'}
- Título: ${paperContext.title}
- Tipo: ${paperContext.type}
Las sugerencias DEBEN ser procedimientos directamente ejecutables en el contexto de este papel específico. Por ejemplo, si el papel es de Entendimiento del Negocio, sugiere procedimientos de indagación y análisis del entorno; si es de Evaluación de Controles, sugiere pruebas de diseño y efectividad de controles; si es de Pruebas Sustantivas, sugiere recálculos, confirmaciones y muestreos.\n`
      : '';

    const prompt = `Eres un auditor experto en aprendizaje cruzado entre auditorías. Con base en el historial de hallazgos y el contexto actual, sugiere procedimientos de auditoría específicos.

AUDITORÍA ACTUAL:
- Entidad: ${entityName} ${sector ? `(sector: ${sector})` : ''}
- Tipo: ${audit.type}
- Título: ${audit.title}
${paperFocusBlock}
${areasText}

HALLAZGOS DE AUDITORÍAS ANTERIORES (${pastFindings.length} total):
${findingsSummary || 'Sin hallazgos históricos disponibles.'}

CONTEXTO DE PAPELES ACTUALES:
${sectionsSummary || 'Sin secciones completadas aún.'}

Genera 6-8 procedimientos de auditoría específicos y accionables${paperContext ? ', RELEVANTES AL PAPEL DE TRABAJO ACTUAL indicado arriba' : ', priorizando las áreas con mayor historial de hallazgos'}.

Responde EXCLUSIVAMENTE con un JSON array:
[
  {
    "area": "<área de auditoría específica>",
    "procedure": "<descripción concisa del procedimiento a ejecutar>",
    "rationale": "<por qué este procedimiento es relevante basado en el historial>",
    "priority": "HIGH|MEDIUM|LOW",
    "niaRef": "<NIA relevante, opcional>"
  }
]

INSTRUCCIONES:
- Los procedimientos deben ser concretos y ejecutables (verbos de acción: verificar, comparar, recalcular, indagar, confirmar)
- Prioridad HIGH = hallazgo CRITICAL/HIGH recurrente o área de mayor riesgo
- Incluye al menos 2 procedimientos basados en hallazgos recurrentes
- Máximo 120 palabras por procedimiento
- Solo el array JSON, sin texto extra`;

    const raw = await generateText(this.config, {
      messages: [{ role: 'user', content: prompt }], temperature: 0.4, maxTokens: 2000, json: true, timeoutMs: 35_000, meter: { usage: this.usage, agent: 'MINERVA', weight: 1 },
    });
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('No JSON array in LLM response');

    const parsed = JSON.parse(match[0]) as GeminiSuggestion[];

    return parsed.map((s, i) => ({
      id:        `sug-${Date.now()}-${i}`,
      area:      s.area,
      procedure: s.procedure,
      rationale: s.rationale,
      priority:  s.priority,
      niaRef:    s.niaRef,
      basedOn:   pastFindings.length > 0
        ? `${pastFindings.length} hallazgo(s) en auditorías anteriores`
        : 'Análisis de contexto actual',
    }));
  }

  // ─── Llamada al LLM con la ficha del papel ────────────────────────────────

  /**
   * Sugerencias de aprendizaje cruzado para UN papel: ficha compacta del papel y del encargo + normativa del marco (RAG, 3 fragmentos)
   * + hallazgos históricos (el «cruce»). Si la IA no puede ser específica responde `{"sin_contexto": …}` y se devuelve el aviso.
   */
  private async callLlmForPaper(
    audit:          { title: string; type: string },
    entityName:     string,
    sector:         string,
    pastFindings:   Array<{ title: string; severity: string; condition: string | null; recommendation: string | null }>,
    recurringAreas: string[],
    paper:          PaperAiInput,
    exclude:        string[] = [],
  ): Promise<{ suggestions: AiProcedureSuggestion[] } | { insufficient: string }> {
    const brief = buildPaperBrief(paper, BUDGETS.estandar);

    let ragBlock = '';
    const ragBase = ragBaseFor(audit.type);
    if (ragBase && this.aiService) {
      const labels = paper.sections.map((sec) => sec.label).slice(0, 3);
      const hits = await this.aiService.searchRag(ragQueryFor([paper.paper.title, ...labels]), [ragBase], 3);
      ragBlock = buildRagBlock(hits);
    }

    const findingsSummary = pastFindings.slice(0, 10).map((f, i) =>
      `${i + 1}. [${f.severity}] ${f.title}${f.condition ? ` — ${f.condition.slice(0, 120)}` : ''}`,
    ).join('\n');
    const areasText = recurringAreas.length > 0
      ? `Áreas con hallazgos recurrentes: ${recurringAreas.join(', ')}`
      : 'Sin historial previo de hallazgos en esta entidad.';
    const excluded = Array.from(new Set(exclude.map((t) => t.trim()).filter(Boolean))).slice(0, 14).map((t) => t.slice(0, 70));
    const excludeText = excluded.length > 0
      ? `YA SUGERIDOS O APLICADOS EN ESTE PAPEL (no los repitas; propón procedimientos distintos que los complementen): ${excluded.join('; ')}\n`
      : '';

    const prompt = `Eres un auditor experto en ${frameworkFor(audit.type)}. Sugiere procedimientos de auditoría para UN papel de trabajo concreto, usando también el historial de la entidad.

ENTIDAD: ${entityName}${sector ? ` (sector: ${sector})` : ''}

FICHA DEL PAPEL Y DEL ENCARGO (los procedimientos deben ser ejecutables en ESTE papel, no en otro):
${brief}
${ragBlock ? `
NORMATIVA RECUPERADA DE LA BASE DE CONOCIMIENTO (fuente autorizada; cita artículo o norma SOLO si aparece aquí):
${ragBlock}
` : ''}
${areasText}
HALLAZGOS DE AUDITORÍAS ANTERIORES (${pastFindings.length} total):
${findingsSummary || 'Sin hallazgos históricos disponibles.'}
${excludeText}
Genera de 4 a 6 procedimientos específicos de ESTE papel. No repitas los que la ficha ya lista como existentes. Si hay hallazgos recurrentes relevantes a este papel, incluye al menos 1 basado en ellos; si no son relevantes, ignóralos.
${insufficientInstruction(true)}

Responde EXCLUSIVAMENTE con un JSON array:
[
  {
    "area": "<área específica>",
    "procedure": "<procedimiento concreto a ejecutar, máx. 100 palabras>",
    "rationale": "<por qué es relevante para ESTE papel>",
    "priority": "HIGH|MEDIUM|LOW",
    "niaRef": "<norma o artículo aplicable, solo si aparece en la normativa recuperada o es una NIA que conoces con certeza; si no, omitir>"
  }
]
Verbos de acción (verificar, comparar, recalcular, indagar, confirmar). Solo el JSON, sin texto extra.`;

    const raw = await generateText(this.config, {
      messages: [{ role: 'user', content: prompt }], temperature: 0.4, maxTokens: 1600, json: true, timeoutMs: 35_000,
      meter: { usage: this.usage, agent: 'MINERVA', weight: 1 },
    });

    const motivo = parseInsufficient(raw);
    if (motivo !== null) return { insufficient: motivo };

    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('No JSON array in LLM response');
    const parsed = JSON.parse(match[0]) as GeminiSuggestion[];

    return {
      suggestions: parsed.map((sg, i) => ({
        id:        `sug-${Date.now()}-${i}`,
        area:      sg.area,
        procedure: sg.procedure,
        rationale: sg.rationale,
        priority:  sg.priority,
        niaRef:    sg.niaRef,
        source:    'AI' as const,
        basedOn:   pastFindings.length > 0
          ? `Ficha del papel + ${pastFindings.length} hallazgo(s) en auditorías anteriores`
          : 'Ficha del papel y del encargo',
      })),
    };
  }

  // ─── Rule-based fallback ──────────────────────────────────────────────────

  private ruleBased(
    pastFindings:   Array<{ title: string; severity: string }>,
    auditType:      string,
    recurringAreas: string[],
  ): AiProcedureSuggestion[] {
    const base: AiProcedureSuggestion[] = [
      {
        id:        'rb-001',
        area:      'Control Interno General',
        procedure: 'Verificar la segregación de funciones en los procesos clave y confirmar que ningún empleado tiene acceso a autorizar, ejecutar y registrar una misma transacción.',
        rationale: 'Procedimiento estándar de alto valor en cualquier tipo de auditoría.',
        priority:  'HIGH',
        basedOn:   'Procedimiento estándar NIA 315',
        niaRef:    'NIA 315',
      },
      {
        id:        'rb-002',
        area:      'Conciliaciones y Cierre',
        procedure: 'Recalcular una muestra de conciliaciones bancarias y de saldos contables del período bajo revisión para verificar exactitud aritmética y soporte documental.',
        rationale: 'Errores en conciliaciones son frecuentes en organizaciones con procesos manuales.',
        priority:  'MEDIUM',
        basedOn:   'Procedimiento analítico estándar',
        niaRef:    'NIA 520',
      },
      {
        id:        'rb-003',
        area:      'Cumplimiento Normativo',
        procedure: 'Verificar el cumplimiento de las principales obligaciones legales y regulatorias aplicables a la entidad (impuestos, licencias, informes obligatorios).',
        rationale: 'Incumplimientos normativos generan contingencias significativas.',
        priority:  'HIGH',
        basedOn:   'Procedimiento estándar de compliance',
        niaRef:    'NIA 250',
      },
    ];

    // Add area-specific suggestions based on recurring areas
    for (const area of recurringAreas.slice(0, 3)) {
      base.push({
        id:        `rb-area-${area.replace(/\s/g, '-')}`,
        area,
        procedure: `Aplicar procedimientos de auditoría enfocados en ${area}: verificar autorización, documentación de soporte y exactitud de registros. Obtener muestra representativa para pruebas de detalle.`,
        rationale: `Esta área presentó hallazgos en auditorías anteriores de la misma entidad.`,
        priority:  'HIGH',
        basedOn:   `${pastFindings.filter(f => f.title.toLowerCase().includes(area.toLowerCase().split('/')[0].trim())).length} hallazgos históricos`,
      });
    }

    if (auditType === 'IT') {
      base.push({
        id:        'rb-it-001',
        area:      'Seguridad de Accesos TI',
        procedure: 'Revisar matriz de accesos críticos en sistemas ERP: usuarios con privilegios elevados, cuentas genéricas activas y accesos de usuarios desvinculados.',
        rationale: 'Riesgo de acceso no autorizado a sistemas es crítico en auditorías de TI.',
        priority:  'HIGH',
        basedOn:   'Mejor práctica COBIT 2019 / ISO 27001',
        niaRef:    'GTAG 1',
      });
    }

    return base.slice(0, 8);
  }
}
