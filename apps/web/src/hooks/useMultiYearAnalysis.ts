import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// ── Report shape returned by ATLAS ──────────────────────────────────────────

export interface AtlasYearSnapshot {
  year: string;
  riskLevel: string;
  findingsCount: number;
  criticalCount: number;
  highCount: number;
}

export interface AtlasRiskEvolution {
  trend: 'improving' | 'stable' | 'deteriorating';
  trendLabel: string;
  narrative: string;
  byYear: AtlasYearSnapshot[];
}

export interface AtlasRecurrentTheme {
  theme: string;
  appearances: number;
  years: string[];
  severityTrend: 'escalating' | 'stable' | 'improving';
  severityTrendLabel: string;
  wasResolvedAndReturned: boolean;
  analysis: string;
  urgency: 'critical' | 'high' | 'medium';
}

export interface AtlasFindingRecurrence {
  summary: string;
  recidivismRate: number;
  recurrentThemes: AtlasRecurrentTheme[];
  resolvedDefinitively: string[];
  newInLatestPeriod: string[];
}

export interface AtlasEscalationAlert {
  finding: string;
  initialSeverity: string;
  currentSeverity: string;
  yearsEscalating: number;
  interpretation: string;
  immediateAction: string;
}

export interface AtlasSystemicPattern {
  pattern: string;
  evidence: string;
  rootCause: string;
  impact: string;
  affectedAreas: string[];
}

export interface AtlasImplementationEffectiveness {
  overallRate: number;
  narrative: string;
  wellImplemented: string[];
  poorlyImplemented: string[];
}

export interface AtlasOrganizationalContext {
  inferredChanges: string;
  controlEnvironment: string;
  maturityAssessment: string;
}

export interface AtlasPlanningRecommendation {
  priority: 'high' | 'medium' | 'low';
  area: string;
  recommendation: string;
  rationale: string;
  suggestedProcedure: string;
}

export interface AtlasManagementLetterPoint {
  title: string;
  narrative: string;
  category: string;
}

export interface AtlasReport {
  executiveSummary: string;
  periodCoverage: {
    from: string;
    to: string;
    auditsAnalyzed: number;
    entityName: string;
  };
  riskEvolution: AtlasRiskEvolution;
  findingRecurrence: AtlasFindingRecurrence;
  escalationAlerts: AtlasEscalationAlert[];
  systemicPatterns: AtlasSystemicPattern[];
  implementationEffectiveness: AtlasImplementationEffectiveness;
  organizationalContext: AtlasOrganizationalContext;
  positiveTrends: string[];
  planningRecommendations: AtlasPlanningRecommendation[];
  managementLetterPoints: AtlasManagementLetterPoint[];
  conclusion: string;
  // fallback when JSON parse fails
  rawContent?: string;
  parseError?: boolean;
}

export interface AtlasAnalysisResult {
  report: AtlasReport;
  model: string;
  auditsAnalyzed: number;
  generatedAt: string;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useMultiYearAnalysis() {
  return useMutation({
    mutationFn: (auditIds: string[]) =>
      apiClient.post<AtlasAnalysisResult>('/ai/multi-year-analysis', { auditIds }),
  });
}
