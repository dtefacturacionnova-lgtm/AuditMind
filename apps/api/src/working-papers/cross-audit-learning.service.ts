import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';

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
}

export interface CrossAuditSuggestionsResult {
  auditId:          string;
  suggestions:      AiProcedureSuggestion[];
  basedOnAudits:    number;
  totalFindings:    number;
  recurringAreas:   string[];
  generatedAt:      string;
  aiGenerated:      boolean;
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

  private readonly geminiEndpoint =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

  constructor(
    private readonly prisma:  PrismaService,
    private readonly config:  ConfigService,
  ) {}

  // ─── Public API ───────────────────────────────────────────────────────────

  async generateSuggestions(
    auditId: string,
    user:    AuthUser,
    paperId?: string,
  ): Promise<CrossAuditSuggestionsResult> {
    // Validate access
    const audit = await this.prisma.audit.findUnique({
      where:   { id: auditId },
      include: {
        auditEntity: { select: { id: true, name: true, sector: true, category: true } },
      },
    });
    if (!audit) throw new NotFoundException('Auditoría no encontrada');
    if (audit.organizationId !== user.organizationId) throw new ForbiddenException();

    // ─── Contexto del papel actual (para contextualizar las sugerencias) ──
    let paperContext: { paperCode: string | null; title: string; type: string } | null = null;
    if (paperId) {
      const wp = await this.prisma.workingPaper.findUnique({
        where:  { id: paperId },
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
            organizationId: user.organizationId,
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
            organizationId: user.organizationId,
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

    // ─── 3. Current audit's SMART sections for context ───────────────────
    const smartSections = await this.prisma.paperSection.findMany({
      where: {
        paper: { auditId },
      },
      select: {
        sectionKey: true, label: true, value: true, sortOrder: true,
        paper: { select: { paperCode: true, title: true } },
      },
      orderBy: { sortOrder: 'asc' },
      take: 20,
    });

    // ─── 4. Identify recurring areas ─────────────────────────────────────
    const recurringAreas = this.identifyRecurringAreas(pastFindings);

    // ─── 5. Generate AI suggestions ───────────────────────────────────────
    const apiKey = this.config.get<string>('GEMINI_API_KEY', '');
    let suggestions: AiProcedureSuggestion[];
    let aiGenerated = false;

    // Corre Gemini si hay historial, secciones, O contexto de papel (para que
    // un papel nuevo sin historial reciba sugerencias relevantes a su tipo).
    if (apiKey && (pastFindings.length > 0 || smartSections.length > 0 || paperContext)) {
      try {
        suggestions = await this.callGemini(
          apiKey, audit, entityName, sector,
          pastFindings, smartSections, recurringAreas, paperContext,
        );
        aiGenerated = true;
      } catch (err) {
        this.logger.warn('[CrossAudit] Gemini failed, using rule-based', String(err));
        suggestions = this.ruleBased(pastFindings, audit.type, recurringAreas);
      }
    } else {
      suggestions = this.ruleBased(pastFindings, audit.type, recurringAreas);
    }

    return {
      auditId,
      suggestions,
      basedOnAudits:  sourceAuditIds.length,
      totalFindings:  pastFindings.length,
      recurringAreas,
      generatedAt:    new Date().toISOString(),
      aiGenerated,
    };
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

  // ─── Gemini call ──────────────────────────────────────────────────────────

  private async callGemini(
    apiKey:         string,
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

    const res = await fetch(`${this.geminiEndpoint}?key=${apiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature:     0.4,
          maxOutputTokens: 2000,
          responseMimeType: 'application/json',
        },
      }),
      signal: AbortSignal.timeout(35_000),
    });

    if (!res.ok) throw new Error(`Gemini ${res.status}`);
    const data = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('No JSON array in Gemini response');

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
