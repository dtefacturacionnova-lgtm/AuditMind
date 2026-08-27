'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────
export type QaipTrack = 'IIA_INTERNAL' | 'NIGC_EXTERNAL';
export type QaipAssessmentKind = 'AUTOEVALUACION' | 'EQA_EXTERNA' | 'SAIV';
export type AcceptanceRating = 'PENDING' | 'GREEN' | 'YELLOW' | 'RED';

export interface QaipStandard {
  id: string;
  track: QaipTrack;
  code: string;
  component: string;
  title: string;
  guidance?: string | null;
  sortOrder: number;
}

export interface QaipAssessmentItem {
  id: string;
  assessmentId: string;
  standardId: string;
  rating: AcceptanceRating;
  evidence?: string | null;
  notes?: string | null;
  standard: QaipStandard;
}

export interface QaipAssessment {
  id: string;
  organizationId: string;
  track: QaipTrack;
  kind: QaipAssessmentKind;
  period: string;
  assessorName?: string | null;
  overallResult: AcceptanceRating;
  overallJustification?: string | null;
  nextDueAt?: string | null;
  decidedById?: string | null;
  decidedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  decidedBy?: { id: string; name: string } | null;
  items: QaipAssessmentItem[];
}

export interface IndependenceDeclaration {
  id: string;
  organizationId: string;
  caeId: string;
  year: number;
  declarationText: string;
  signedAt: string;
  documentUrl?: string | null;
  createdAt: string;
}

export interface AuditCharter {
  id: string;
  organizationId: string;
  version: number;
  content: unknown;
  approvedBy: string;
  approvedAt: string;
  effectiveDate: string;
  createdAt: string;
}

// ─── V2 — Hallazgos, causa raíz y remediación ──────────────────────────────
export type QaipFindingSource = 'AUTOEVALUACION' | 'EQR' | 'COMITE' | 'AD_HOC';
export type QaipFindingStatus = 'OPEN' | 'REMEDIATED' | 'CLOSED';
export type FindingSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFORMATIONAL';
export type QaipRootCauseCategory = 'COMPETENCIA' | 'PRESION_TIEMPO' | 'BRECHA_METODOLOGICA' | 'SUPERVISION_INSUFICIENTE' | 'TONO_DIRECCION' | 'OTRO';
export type QaipRemediationStatus = 'OPEN' | 'DONE';

export interface QaipRootCause {
  id: string;
  findingId: string;
  category: QaipRootCauseCategory;
  analysis: string;
  createdAt: string;
}

export interface QaipRemediationAction {
  id: string;
  findingId: string;
  description: string;
  ownerId: string;
  dueDate: string;
  status: QaipRemediationStatus;
  closureEvidence?: string | null;
  closedAt?: string | null;
  createdAt: string;
  owner?: { id: string; name: string };
}

export interface QaipFinding {
  id: string;
  organizationId: string;
  track: QaipTrack;
  source: QaipFindingSource;
  assessmentItemId?: string | null;
  engagementId?: string | null;
  severity: FindingSeverity;
  description: string;
  status: QaipFindingStatus;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: { id: string; name: string };
  assessmentItem?: { standard: QaipStandard } | null;
  rootCauses: QaipRootCause[];
  remediationActions: QaipRemediationAction[];
}

export interface QaipPerformanceDashboard {
  year: number;
  engagementPerformance: {
    totalSignedOff: number;
    reviewedPct: number | null;
    avgDaysReviewToSignOff: number | null;
  };
  qualityFindings: {
    open: number;
    remediated: number;
    closed: number;
    overdueRemediationActions: number;
    byRootCauseCategory: Record<string, number>;
  };
  clientAcceptanceCoverage: {
    activeClients: number;
    withDecidedAcceptance: number;
    coveragePct: number | null;
  };
  cpeCompliance: {
    year: number;
    minRequiredHours: number;
    staffTotal: number;
    staffCompliant: number;
    compliancePct: number | null;
    belowMinimum: Array<{ id: string; name: string; hours: number; missingHours: number }>;
  };
  workPlanCompliance: {
    year: number;
    planExists: boolean;
    planId?: string;
    planName?: string;
    planStatus?: string;
    totalItems: number;
    startedItems?: number;
    completedItems: number;
    completedOnTimeItems: number;
    completionPct: number | null;
    onTimePct?: number | null;
  };
  profitabilityCompliance: {
    year: number;
    hours: { planned: number; real: number; compliancePct: number | null };
    money: {
      engagementsTotal: number;
      engagementsWithRevenue: number;
      engagementsWithMargin: number;
      totalIncome: number;
      totalCost: number;
      totalMargin: number;
      totalMarginPct: number | null;
    };
  };
  recommendations: {
    year: number;
    findingsCreatedYtd: number;
    findingsClosedYtd: number;
    resolutionRateYtd: number | null;
    recurringFindingsYtd: number;
    recurrenceRateYtd: number | null;
    actionsCreatedYtd: number;
    actionsCompletedYtd: number;
    implementationRateYtd: number | null;
    overdueActionsNow: number;
  };
  partnerCyclicalInspection: {
    tracked: boolean;
    note: string;
  };
}

// ─── Competencias / CPE ─────────────────────────────────────────────────────
export type CertificationType = 'CIA' | 'CISA' | 'CFE' | 'CPA' | 'CRMA' | 'CGAP' | 'PMP' | 'ISO27001_LA' | 'ISO22301_LA' | 'CISSP' | 'CDPSE';

export interface UserCertification {
  id: string;
  userId: string;
  type: CertificationType;
  certNumber?: string | null;
  issuedAt: string;
  expiresAt?: string | null;
  isActive: boolean;
  verificationUrl?: string | null;
  createdAt: string;
}

export interface UserCompetency {
  id: string;
  userId: string;
  area: string;
  expertiseLevel: number;
  yearsExperience: number;
}

export interface CpeRecord {
  id: string;
  userId: string;
  year: number;
  category: string;
  hours: number;
  description: string;
  completedAt: string;
  createdAt: string;
}

export interface CompetencyRosterEntry {
  id: string;
  name: string;
  email: string;
  role: string;
  certifications: UserCertification[];
  competencies: UserCompetency[];
  cpe: { year: number; hours: number; minRequired: number; compliant: boolean };
}

export interface CompetencyProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  certifications: UserCertification[];
  competencies: UserCompetency[];
  cpeRecords: CpeRecord[];
  cpeSummary: { year: number; hours: number; minRequired: number; compliant: boolean };
}

// ─── V3 — Revisión de Calidad del Encargo (EQR, NIGC 2) ────────────────────
export interface EngagementQualityReview {
  id: string;
  auditId: string;
  reviewerId?: string | null;
  wasEngagementPartner: boolean;
  independenceJustification?: string | null;
  checklist: Array<{ item: string; ok?: boolean; comment?: string }>;
  result: AcceptanceRating;
  notes?: string | null;
  completedById?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  reviewer?: { id: string; name: string } | null;
  completedBy?: { id: string; name: string } | null;
  audit?: { id: string; title: string; requiresEqr: boolean };
}

// ─── Query keys ───────────────────────────────────────────────────────────────
const STANDARDS_KEY = 'qaip-standards';
const ASSESSMENTS_KEY = 'qaip-assessments';
const ASSESSMENT_KEY = 'qaip-assessment';
const INDEPENDENCE_KEY = 'qaip-independence';
const CHARTERS_KEY = 'qaip-charters';
const FINDINGS_KEY = 'qaip-findings';
const PERFORMANCE_KEY = 'qaip-performance';
const EQR_KEY = 'qaip-eqr';
const COMPETENCIES_ROSTER_KEY = 'qaip-competencies-roster';
const COMPETENCIES_PROFILE_KEY = 'qaip-competencies-profile';

// ─── Standards ────────────────────────────────────────────────────────────────
export function useQaipStandards(track: QaipTrack) {
  return useQuery<QaipStandard[]>({
    queryKey: [STANDARDS_KEY, track],
    queryFn: () => apiClient.get(`/qaip/standards?track=${track}`),
    staleTime: 5 * 60_000,
  });
}

// ─── Assessments ──────────────────────────────────────────────────────────────
export function useQaipAssessments(track?: QaipTrack) {
  const qs = track ? `?track=${track}` : '';
  return useQuery<QaipAssessment[]>({
    queryKey: [ASSESSMENTS_KEY, track ?? 'all'],
    queryFn: () => apiClient.get(`/qaip/assessments${qs}`),
    staleTime: 15_000,
  });
}

export function useQaipAssessment(id: string) {
  return useQuery<QaipAssessment>({
    queryKey: [ASSESSMENT_KEY, id],
    queryFn: () => apiClient.get(`/qaip/assessments/${id}`),
    enabled: !!id,
    staleTime: 10_000,
  });
}

export function useStartQaipAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { track: QaipTrack; kind?: QaipAssessmentKind; period?: string; assessorName?: string }) =>
      apiClient.post<QaipAssessment>('/qaip/assessments/start', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [ASSESSMENTS_KEY] });
    },
  });
}

export function useUpdateQaipAssessmentItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { rating?: AcceptanceRating; evidence?: string; notes?: string } }) =>
      apiClient.patch<QaipAssessmentItem>(`/qaip/assessment-items/${id}`, data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: [ASSESSMENT_KEY, vars.id] });
      qc.invalidateQueries({ queryKey: [ASSESSMENTS_KEY] });
    },
  });
}

export function useDecideQaipAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, overallJustification, nextDueAt }: { id: string; overallJustification: string; nextDueAt?: string }) =>
      apiClient.post<QaipAssessment>(`/qaip/assessments/${id}/decide`, { overallJustification, nextDueAt }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [ASSESSMENTS_KEY] });
      qc.invalidateQueries({ queryKey: [ASSESSMENT_KEY] });
    },
  });
}

// ─── Independencia y Estatuto ───────────────────────────────────────────────────
export function useIndependenceDeclarations() {
  return useQuery<IndependenceDeclaration[]>({
    queryKey: [INDEPENDENCE_KEY],
    queryFn: () => apiClient.get('/qaip/independence-declarations'),
    staleTime: 30_000,
  });
}

export function useUpsertIndependenceDeclaration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { year?: number; declarationText: string; documentUrl?: string }) =>
      apiClient.post<IndependenceDeclaration>('/qaip/independence-declarations', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [INDEPENDENCE_KEY] }),
  });
}

export function useAuditCharters() {
  return useQuery<AuditCharter[]>({
    queryKey: [CHARTERS_KEY],
    queryFn: () => apiClient.get('/qaip/charters'),
    staleTime: 30_000,
  });
}

export function useCreateAuditCharter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { content: string; approvedBy: string; approvedAt: string; effectiveDate: string }) =>
      apiClient.post<AuditCharter>('/qaip/charters', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [CHARTERS_KEY] }),
  });
}

// ─── Hallazgos, causa raíz y remediación ─────────────────────────────────────
export function useQaipFindings(track?: QaipTrack, status?: QaipFindingStatus) {
  const params = new URLSearchParams();
  if (track) params.set('track', track);
  if (status) params.set('status', status);
  const qs = params.toString();
  return useQuery<QaipFinding[]>({
    queryKey: [FINDINGS_KEY, track ?? 'all', status ?? 'all'],
    queryFn: () => apiClient.get(`/qaip/findings${qs ? '?' + qs : ''}`),
    staleTime: 15_000,
  });
}

export function useCreateQaipFinding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      track: QaipTrack; source: QaipFindingSource; severity: FindingSeverity; description: string;
      assessmentItemId?: string; engagementId?: string;
    }) => apiClient.post<QaipFinding>('/qaip/findings', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [FINDINGS_KEY] });
      qc.invalidateQueries({ queryKey: [PERFORMANCE_KEY] });
    },
  });
}

export function useUpdateQaipFindingStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: QaipFindingStatus }) =>
      apiClient.patch<QaipFinding>(`/qaip/findings/${id}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [FINDINGS_KEY] });
      qc.invalidateQueries({ queryKey: [PERFORMANCE_KEY] });
    },
  });
}

export function useAddQaipRootCause() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ findingId, category, analysis }: { findingId: string; category: QaipRootCauseCategory; analysis: string }) =>
      apiClient.post<QaipFinding>(`/qaip/findings/${findingId}/root-causes`, { category, analysis }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [FINDINGS_KEY] });
      qc.invalidateQueries({ queryKey: [PERFORMANCE_KEY] });
    },
  });
}

export function useAddQaipRemediationAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ findingId, description, ownerId, dueDate }: { findingId: string; description: string; ownerId: string; dueDate: string }) =>
      apiClient.post<QaipFinding>(`/qaip/findings/${findingId}/remediation-actions`, { description, ownerId, dueDate }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [FINDINGS_KEY] });
      qc.invalidateQueries({ queryKey: [PERFORMANCE_KEY] });
    },
  });
}

export function useUpdateQaipRemediationAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, closureEvidence }: { id: string; status?: QaipRemediationStatus; closureEvidence?: string }) =>
      apiClient.patch<QaipRemediationAction>(`/qaip/remediation-actions/${id}`, { status, closureEvidence }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [FINDINGS_KEY] });
      qc.invalidateQueries({ queryKey: [PERFORMANCE_KEY] });
    },
  });
}

export function useQaipPerformance(year: number) {
  return useQuery<QaipPerformanceDashboard>({
    queryKey: [PERFORMANCE_KEY, year],
    queryFn: () => apiClient.get(`/qaip/performance?year=${year}`),
    staleTime: 30_000,
  });
}

export const QAIP_FINDING_STATUS_CONFIG: Record<QaipFindingStatus, { label: string; color: string; bg: string }> = {
  OPEN:       { label: 'Abierto',    color: 'text-red-700',     bg: 'bg-red-100' },
  REMEDIATED: { label: 'Remediado',  color: 'text-amber-700',   bg: 'bg-amber-100' },
  CLOSED:     { label: 'Cerrado',    color: 'text-emerald-700', bg: 'bg-emerald-100' },
};

export const QAIP_SEVERITY_CONFIG: Record<FindingSeverity, { label: string; color: string; bg: string }> = {
  CRITICAL:      { label: 'Crítico',    color: 'text-red-700',    bg: 'bg-red-100' },
  HIGH:          { label: 'Alto',       color: 'text-orange-700', bg: 'bg-orange-100' },
  MEDIUM:        { label: 'Medio',      color: 'text-amber-700',  bg: 'bg-amber-100' },
  LOW:           { label: 'Bajo',       color: 'text-blue-700',   bg: 'bg-blue-100' },
  INFORMATIONAL: { label: 'Informativo', color: 'text-gray-600',  bg: 'bg-gray-100' },
};

export const QAIP_ROOT_CAUSE_LABEL: Record<QaipRootCauseCategory, string> = {
  COMPETENCIA: 'Brecha de competencia',
  PRESION_TIEMPO: 'Presión de tiempo',
  BRECHA_METODOLOGICA: 'Brecha metodológica',
  SUPERVISION_INSUFICIENTE: 'Supervisión insuficiente',
  TONO_DIRECCION: 'Tono desde la dirección',
  OTRO: 'Otro',
};

// ─── Revisión de Calidad del Encargo (EQR) ───────────────────────────────────
export function useEqr(auditId: string) {
  return useQuery<EngagementQualityReview | null>({
    queryKey: [EQR_KEY, auditId],
    queryFn: () => apiClient.get(`/qaip/eqr/${auditId}`),
    enabled: !!auditId,
    staleTime: 10_000,
  });
}

export function useRequireEqr() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (auditId: string) => apiClient.post<EngagementQualityReview>(`/qaip/eqr/${auditId}/require`, {}),
    onSuccess: (_, auditId) => qc.invalidateQueries({ queryKey: [EQR_KEY, auditId] }),
  });
}

export function useAssignEqrReviewer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ auditId, ...data }: { auditId: string; reviewerId: string; wasEngagementPartner?: boolean; independenceJustification?: string }) =>
      apiClient.patch<EngagementQualityReview>(`/qaip/eqr/${auditId}/reviewer`, data),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: [EQR_KEY, vars.auditId] }),
  });
}

export function useCompleteEqr() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ auditId, result, notes }: { auditId: string; result: AcceptanceRating; notes?: string }) =>
      apiClient.post<EngagementQualityReview>(`/qaip/eqr/${auditId}/complete`, { result, notes }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: [EQR_KEY, vars.auditId] }),
  });
}

// ─── Competencias / CPE ─────────────────────────────────────────────────────
export function useCompetenciesRoster(enabled: boolean = true) {
  return useQuery<CompetencyRosterEntry[]>({
    queryKey: [COMPETENCIES_ROSTER_KEY],
    queryFn: () => apiClient.get('/qaip/competencies'),
    enabled,
    staleTime: 30_000,
  });
}

export function useCompetencyProfile(userId: string) {
  return useQuery<CompetencyProfile>({
    queryKey: [COMPETENCIES_PROFILE_KEY, userId],
    queryFn: () => apiClient.get(`/qaip/competencies/${userId}`),
    enabled: !!userId,
    staleTime: 15_000,
  });
}

export function useMyCompetencyProfile() {
  return useQuery<CompetencyProfile>({
    queryKey: [COMPETENCIES_PROFILE_KEY, 'me'],
    queryFn: () => apiClient.get('/qaip/competencies/me'),
    staleTime: 15_000,
  });
}

function invalidateCompetencies(qc: ReturnType<typeof useQueryClient>, userId?: string) {
  qc.invalidateQueries({ queryKey: [COMPETENCIES_ROSTER_KEY] });
  qc.invalidateQueries({ queryKey: [COMPETENCIES_PROFILE_KEY] });
  qc.invalidateQueries({ queryKey: [PERFORMANCE_KEY] });
  if (userId) qc.invalidateQueries({ queryKey: [COMPETENCIES_PROFILE_KEY, userId] });
}

export function useAddCertification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, ...data }: { userId: string; type: CertificationType; certNumber?: string; issuedAt: string; expiresAt?: string; verificationUrl?: string }) =>
      apiClient.post<UserCertification>(`/qaip/competencies/${userId}/certifications`, data),
    onSuccess: (_, vars) => invalidateCompetencies(qc, vars.userId),
  });
}

export function useRemoveCertification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; userId: string }) => apiClient.delete(`/qaip/competencies/certifications/${id}`),
    onSuccess: (_, vars) => invalidateCompetencies(qc, vars.userId),
  });
}

export function useAddCompetency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, ...data }: { userId: string; area: string; expertiseLevel: number; yearsExperience?: number }) =>
      apiClient.post<UserCompetency>(`/qaip/competencies/${userId}/skills`, data),
    onSuccess: (_, vars) => invalidateCompetencies(qc, vars.userId),
  });
}

export function useRemoveCompetency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; userId: string }) => apiClient.delete(`/qaip/competencies/skills/${id}`),
    onSuccess: (_, vars) => invalidateCompetencies(qc, vars.userId),
  });
}

export function useAddCpeRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, ...data }: { userId: string; year: number; category: string; hours: number; description: string; completedAt: string }) =>
      apiClient.post<CpeRecord>(`/qaip/competencies/${userId}/cpe`, data),
    onSuccess: (_, vars) => invalidateCompetencies(qc, vars.userId),
  });
}

export function useRemoveCpeRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; userId: string }) => apiClient.delete(`/qaip/competencies/cpe/${id}`),
    onSuccess: (_, vars) => invalidateCompetencies(qc, vars.userId),
  });
}

export const CERTIFICATION_LABEL: Record<CertificationType, string> = {
  CIA: 'CIA — Certified Internal Auditor',
  CISA: 'CISA — Certified Information Systems Auditor',
  CFE: 'CFE — Certified Fraud Examiner',
  CPA: 'CPA — Contador Público Autorizado',
  CRMA: 'CRMA — Certification in Risk Management Assurance',
  CGAP: 'CGAP — Certified Government Auditing Professional',
  PMP: 'PMP — Project Management Professional',
  ISO27001_LA: 'ISO 27001 Lead Auditor',
  ISO22301_LA: 'ISO 22301 Lead Auditor',
  CISSP: 'CISSP — Certified Information Systems Security Professional',
  CDPSE: 'CDPSE — Certified Data Privacy Solutions Engineer',
};

export const CPE_CATEGORY_LABEL: Record<string, string> = {
  etica: 'Ética',
  tecnica: 'Técnica',
  liderazgo: 'Liderazgo',
};

// ─── Config visual ──────────────────────────────────────────────────────────────
export const QAIP_RATING_CONFIG: Record<AcceptanceRating, { label: string; color: string; bg: string; border: string }> = {
  PENDING: { label: 'Pendiente', color: 'text-gray-500',    bg: 'bg-gray-100',    border: 'border-gray-200' },
  GREEN:   { label: 'Verde',     color: 'text-emerald-700', bg: 'bg-emerald-100', border: 'border-emerald-300' },
  YELLOW:  { label: 'Amarillo',  color: 'text-amber-700',   bg: 'bg-amber-100',   border: 'border-amber-300' },
  RED:     { label: 'Rojo',      color: 'text-red-700',     bg: 'bg-red-100',     border: 'border-red-300' },
};

export const QAIP_TRACK_LABEL: Record<QaipTrack, { label: string; sub: string }> = {
  IIA_INTERNAL:  { label: 'Auditoría Interna', sub: 'Normas Globales del IIA (2024) — Dominio V' },
  NIGC_EXTERNAL: { label: 'Auditoría Externa / Fiscal / AML', sub: 'NIGC 1 y 2 (ISQM 1/2) — CVPCPA' },
};
