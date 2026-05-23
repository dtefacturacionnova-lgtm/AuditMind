import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';

// ─── Types ────────────────────────────────────────────────────────────────────

export type IssueType = 'COMPLETENESS' | 'COHERENCE' | 'CONSISTENCY' | 'DEPTH';
export type IssueSeverity = 'WARNING' | 'ERROR';
export type QualityLevel = 'INSUFICIENTE' | 'ACEPTABLE' | 'BUENA' | 'EXCELENTE';

export interface QualityIssue {
  sectionKey: string;
  label:      string;
  type:       IssueType;
  message:    string;
  severity:   IssueSeverity;
}

export interface QualityCheckResult {
  paperId:      string;
  score:        number;          // 0-100
  level:        QualityLevel;
  aiGenerated:  boolean;
  issues:       QualityIssue[];
  strengths:    string[];
  recommendation: string;
  checkedAt:    string;
}

interface GeminiQualityResponse {
  score:          number;
  issues:         Array<{
    sectionKey:  string;
    label?:      string;
    type:        IssueType;
    message:     string;
    severity:    IssueSeverity;
  }>;
  strengths:      string[];
  recommendation: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class PaperQualityService {
  private readonly logger = new Logger(PaperQualityService.name);

  private readonly geminiEndpoint =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent';

  constructor(
    private readonly prisma:  PrismaService,
    private readonly config:  ConfigService,
  ) {}

  // ─── Public API ───────────────────────────────────────────────────────────

  async runQualityCheck(paperId: string, user: AuthUser): Promise<QualityCheckResult> {
    // Access check
    const wp = await this.prisma.workingPaper.findUnique({
      where:   { id: paperId },
      include: {
        audit:    { select: { organizationId: true, title: true } },
        sections: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!wp) throw new NotFoundException('Papel de trabajo no encontrado');
    if (wp.audit.organizationId !== user.organizationId) throw new ForbiddenException();

    const sections = wp.sections;
    if (sections.length === 0) {
      return this.emptyResult(paperId, 'Este papel no tiene secciones. Inicializa desde una plantilla primero.');
    }

    // Rule-based score (always computed as baseline)
    const ruleScore = this.computeRuleScore(sections);
    const ruleIssues = this.computeRuleIssues(sections);

    // Try AI enhancement
    const apiKey = this.config.get<string>('GEMINI_API_KEY', '');
    if (apiKey) {
      try {
        const aiResult = await this.callGemini(apiKey, sections, wp.audit.title, wp.paperCode);
        const merged = this.mergeResults(ruleScore, ruleIssues, aiResult, sections);
        await this.persistScore(paperId, merged.score);
        return merged;
      } catch (err) {
        this.logger.warn('[QualityCheck] Gemini unavailable, using rule-based only', String(err));
      }
    }

    // Rule-based fallback
    const result = this.buildResult(paperId, ruleScore, ruleIssues, false);
    await this.persistScore(paperId, result.score);
    return result;
  }

  // ─── Rule-based scoring ───────────────────────────────────────────────────

  private computeRuleScore(sections: Array<{ value: unknown; isRequired: boolean; label: string }>): number {
    if (sections.length === 0) return 0;

    const required = sections.filter(s => s.isRequired);
    const optional = sections.filter(s => !s.isRequired);

    const isFilled = (s: { value: unknown }) => {
      const v = s.value;
      if (!v) return false;
      const str = typeof v === 'string' ? v : JSON.stringify(v);
      return str.trim().length > 20; // at least 20 chars = substantive
    };

    const reqFilled = required.filter(isFilled).length;
    const optFilled = optional.filter(isFilled).length;

    const reqScore = required.length > 0 ? (reqFilled / required.length) * 70 : 70;
    const optScore = optional.length > 0 ? (optFilled / optional.length) * 30 : 30;

    return Math.round(reqScore + optScore);
  }

  private computeRuleIssues(sections: Array<{ sectionKey: string; label: string; value: unknown; isRequired: boolean }>): QualityIssue[] {
    const issues: QualityIssue[] = [];

    for (const s of sections) {
      const v = s.value;
      const str = !v ? '' : (typeof v === 'string' ? v : JSON.stringify(v));

      if (s.isRequired && str.trim().length < 20) {
        issues.push({
          sectionKey: s.sectionKey,
          label:      s.label,
          type:       'COMPLETENESS',
          message:    `La sección "${s.label}" es obligatoria y está incompleta o vacía.`,
          severity:   'ERROR',
        });
      } else if (!s.isRequired && str.trim().length > 0 && str.trim().length < 15) {
        issues.push({
          sectionKey: s.sectionKey,
          label:      s.label,
          type:       'DEPTH',
          message:    `La sección "${s.label}" tiene contenido muy breve (${str.trim().length} chars). Considera expandirlo.`,
          severity:   'WARNING',
        });
      }
    }

    return issues;
  }

  // ─── Gemini AI analysis ───────────────────────────────────────────────────

  private async callGemini(
    apiKey:    string,
    sections:  Array<{ sectionKey: string; label: string; value: unknown; isRequired: boolean; aiHint: string | null }>,
    auditTitle: string,
    paperCode:  string | null,
  ): Promise<GeminiQualityResponse> {
    const sectionSummary = sections.map(s => {
      const val = typeof s.value === 'string' ? s.value : JSON.stringify(s.value ?? '');
      return `[${s.sectionKey}] ${s.label} (obligatoria: ${s.isRequired ? 'SÍ' : 'NO'})\n${val.slice(0, 500)}`;
    }).join('\n\n---\n\n');

    const prompt = `Eres un auditor experto en control de calidad de papeles de trabajo. Evalúa la calidad de este papel de auditoría.

Auditoría: "${auditTitle}"
Papel: ${paperCode ?? 'Papel de trabajo'}

SECCIONES:
${sectionSummary}

Evalúa:
1. COHERENCIA: ¿El nivel de riesgo en S3/S8 es consistente con la evidencia presentada?
2. COMPLETITUD: ¿Las secciones obligatorias tienen contenido sustantivo (no genérico)?
3. PROFUNDIDAD: ¿El contenido es específico o son declaraciones genéricas?
4. CONSISTENCIA: ¿Hay contradicciones internas entre secciones?

Responde EXCLUSIVAMENTE con un JSON:
{
  "score": <número 0-100 adicional al score de completitud — evalúa calidad semántica>,
  "issues": [
    {
      "sectionKey": "<clave>",
      "label": "<nombre>",
      "type": "COMPLETENESS|COHERENCE|CONSISTENCY|DEPTH",
      "message": "<descripción específica del problema en español>",
      "severity": "WARNING|ERROR"
    }
  ],
  "strengths": ["<fortaleza 1>", "<fortaleza 2>"],
  "recommendation": "<recomendación de mejora principal en 1-2 oraciones>"
}

Solo el JSON, sin markdown.`;

    const res = await fetch(`${this.geminiEndpoint}?key=${apiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature:     0.2,
          maxOutputTokens: 1500,
          responseMimeType: 'application/json',
        },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) throw new Error(`Gemini ${res.status}`);
    const data = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON in Gemini response');

    return JSON.parse(match[0]) as GeminiQualityResponse;
  }

  // ─── Merge + helpers ──────────────────────────────────────────────────────

  private mergeResults(
    ruleScore:  number,
    ruleIssues: QualityIssue[],
    aiResult:   GeminiQualityResponse,
    sections:   Array<{ sectionKey: string; label: string }>,
  ): QualityCheckResult {
    // Blend: 60% rule-based completeness + 40% AI semantic quality
    const blended = Math.round(ruleScore * 0.6 + (aiResult.score ?? 50) * 0.4);

    // Merge issues — AI issues take precedence, rule issues fill the gap
    const aiKeys = new Set(aiResult.issues.map(i => i.sectionKey));
    const filteredRuleIssues = ruleIssues.filter(i => !aiKeys.has(i.sectionKey));

    const labelMap = Object.fromEntries(sections.map(s => [s.sectionKey, s.label]));
    const aiIssues: QualityIssue[] = aiResult.issues.map(i => ({
      sectionKey: i.sectionKey,
      label:      i.label ?? labelMap[i.sectionKey] ?? i.sectionKey,
      type:       i.type,
      message:    i.message,
      severity:   i.severity,
    }));

    const allIssues = [...aiIssues, ...filteredRuleIssues];

    return {
      paperId:        '',  // set by caller
      score:          blended,
      level:          this.scoreToLevel(blended),
      aiGenerated:    true,
      issues:         allIssues,
      strengths:      aiResult.strengths ?? [],
      recommendation: aiResult.recommendation ?? '',
      checkedAt:      new Date().toISOString(),
    };
  }

  private buildResult(
    paperId:    string,
    score:      number,
    issues:     QualityIssue[],
    aiGenerated: boolean,
  ): QualityCheckResult {
    const errors   = issues.filter(i => i.severity === 'ERROR').length;
    const warnings = issues.filter(i => i.severity === 'WARNING').length;

    const strengths: string[] = [];
    if (score >= 80) strengths.push('Todas las secciones obligatorias tienen contenido sustantivo.');
    if (errors === 0 && warnings === 0) strengths.push('Sin observaciones de calidad detectadas.');
    if (score >= 90) strengths.push('Documentación completa y detallada.');

    const recommendation = errors > 0
      ? `Hay ${errors} sección(es) obligatoria(s) incompleta(s). Complétalas antes de enviar a revisión.`
      : warnings > 0
        ? `Considera ampliar las ${warnings} sección(es) con contenido breve para mejorar la calidad documental.`
        : 'El papel cumple los criterios de calidad requeridos.';

    return {
      paperId,
      score,
      level:          this.scoreToLevel(score),
      aiGenerated,
      issues,
      strengths,
      recommendation,
      checkedAt:      new Date().toISOString(),
    };
  }

  private emptyResult(paperId: string, msg: string): QualityCheckResult {
    return {
      paperId,
      score:          0,
      level:          'INSUFICIENTE',
      aiGenerated:    false,
      issues:         [],
      strengths:      [],
      recommendation: msg,
      checkedAt:      new Date().toISOString(),
    };
  }

  private scoreToLevel(score: number): QualityLevel {
    if (score >= 90) return 'EXCELENTE';
    if (score >= 75) return 'BUENA';
    if (score >= 50) return 'ACEPTABLE';
    return 'INSUFICIENTE';
  }

  private async persistScore(paperId: string, score: number): Promise<void> {
    await this.prisma.workingPaper.update({
      where: { id: paperId },
      data:  { qualityScore: score },
    }).catch(() => { /* non-critical */ });
  }
}
