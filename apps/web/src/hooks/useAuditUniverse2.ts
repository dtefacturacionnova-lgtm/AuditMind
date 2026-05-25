'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// ─── Tipos ────────────────────────────────────────────────────────────────────

// Tipos jerárquicos de organigrama (principales)
export type AuditEntityType =
  | 'CORPORATE' | 'COMPANY' | 'DIVISION' | 'DEPARTMENT'
  | 'AREA' | 'TEAM' | 'BRANCH' | 'SUBSIDIARY'
  | 'BUSINESS_UNIT' | 'LEGAL_ENTITY' | 'LOCATION'  // legados
  | 'PROCESS' | 'IT_SYSTEM' | 'IT_GC' | 'PROJECT' | 'VENDOR' | 'REGULATORY' | 'STRATEGIC';

// Tipos que aparecen en el selector del formulario (solo los org-chart)
export const ORG_ENTITY_TYPES: { value: AuditEntityType; label: string }[] = [
  { value: 'CORPORATE',   label: 'Corporativo / Holding' },
  { value: 'COMPANY',     label: 'Empresa / Razón Social' },
  { value: 'DIVISION',    label: 'División / Vicepresidencia' },
  { value: 'DEPARTMENT',  label: 'Departamento / Dirección' },
  { value: 'AREA',        label: 'Área / Gerencia' },
  { value: 'TEAM',        label: 'Equipo / Unidad operativa' },
  { value: 'BRANCH',      label: 'Sucursal / Sede / Planta' },
  { value: 'SUBSIDIARY',  label: 'Subsidiaria / Filial' },
];

export const ENTITY_TYPE_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  // Org-chart
  CORPORATE:    { label: 'Corporativo',     icon: '🏛️', color: 'bg-slate-200 text-slate-800'   },
  COMPANY:      { label: 'Empresa',         icon: '🏢', color: 'bg-blue-100 text-blue-800'     },
  DIVISION:     { label: 'División',        icon: '🗂️', color: 'bg-indigo-100 text-indigo-700' },
  DEPARTMENT:   { label: 'Departamento',    icon: '📁', color: 'bg-sky-100 text-sky-700'       },
  AREA:         { label: 'Área / Gerencia', icon: '👥', color: 'bg-teal-100 text-teal-700'     },
  TEAM:         { label: 'Equipo',          icon: '🔹', color: 'bg-green-100 text-green-700'   },
  BRANCH:       { label: 'Sucursal',        icon: '📍', color: 'bg-amber-100 text-amber-700'   },
  SUBSIDIARY:   { label: 'Subsidiaria',     icon: '⚖️', color: 'bg-purple-100 text-purple-700' },
  // Legados
  BUSINESS_UNIT:{ label: 'Área / Depto.',   icon: '🏢', color: 'bg-slate-100 text-slate-700'  },
  LEGAL_ENTITY: { label: 'Entidad Legal',   icon: '⚖️', color: 'bg-purple-100 text-purple-700' },
  LOCATION:     { label: 'Ubicación',       icon: '📍', color: 'bg-green-100 text-green-700'  },
  PROCESS:      { label: 'Proceso',         icon: '⚙️', color: 'bg-blue-100 text-blue-700'    },
  IT_SYSTEM:    { label: 'Sistema TI',      icon: '💻', color: 'bg-cyan-100 text-cyan-700'    },
  IT_GC:        { label: 'CGTI',            icon: '🔐', color: 'bg-red-100 text-red-700'      },
  PROJECT:      { label: 'Proyecto',        icon: '📋', color: 'bg-amber-100 text-amber-700'  },
  VENDOR:       { label: 'Proveedor',       icon: '🤝', color: 'bg-orange-100 text-orange-700'},
  REGULATORY:   { label: 'Regulatorio',     icon: '📜', color: 'bg-rose-100 text-rose-700'   },
  STRATEGIC:    { label: 'Estratégico',     icon: '🎯', color: 'bg-indigo-100 text-indigo-700'},
};

export interface AuditEntityNode {
  id: string;
  name: string;
  description?: string;
  entityType: AuditEntityType;
  parentEntityId?: string;
  inherentRiskScore: number;
  applicableRegulations: string[];
  active: boolean;
  owner?: { id: string; name: string } | null;
  _count?: { auditableUnits: number; audits: number };
  children: AuditEntityNode[];
}

export interface AuditProcess {
  id: string;
  code: string;
  name: string;
  description?: string;
  category?: string;
  apqcCode?: string;
  active: boolean;
  sortOrder: number;
  _count?: { auditableUnits: number };
}

export interface AuditableUnitAssessment {
  id: string;
  auditableUnitId: string;
  assessmentYear: number;
  // Grupo A
  impactScore: number;
  likelihoodScore: number;
  controlMaturityScore: number;
  inherentRiskScore: number;
  residualRiskScore: number;
  // Grupo B
  materialityScore: number;
  strategicAlignScore: number;
  operationalAlignScore: number;
  fraudHistoryScore: number;
  managementReqScore: number;
  changeVelocityScore: number;
  // Score final
  totalScore: number;
  riskLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  // Coverage
  lastAuditDate?: string;
  lastAuditOpinion?: string;
  recommendedFreqMonths: number;
  nextRecommendedDate?: string;
  coverageGapDays?: number;
  notes?: string;
}

export interface AuditableUnit {
  id: string;
  organizationId: string;
  auditEntityId: string;
  auditProcessId: string;
  name?: string;
  auditType: string;
  isMandatory: boolean;
  mandatoryBasis?: string;
  active: boolean;
  notes?: string;
  auditEntity?: { id: string; name: string; entityType: AuditEntityType };
  auditProcess?: { id: string; code: string; name: string; category?: string };
  assessments?: AuditableUnitAssessment[];
  // computed en plan-candidates
  assessment?: AuditableUnitAssessment | null;
  totalScore?: number;
  riskLevel?: string;
  coverageGapDays?: number | null;
  isOverdue?: boolean;
  alreadyInCurrentPlan?: boolean;
}

export interface PlanCandidatesResult {
  year: number;
  total: number;
  mandatory: number;
  overdue: number;
  candidates: AuditableUnit[];
}

export const RISK_LEVEL_CONFIG = {
  CRITICAL: { label: 'Crítico',  color: 'text-red-700',    bg: 'bg-red-100',    border: 'border-red-300' },
  HIGH:     { label: 'Alto',     color: 'text-orange-700', bg: 'bg-orange-100', border: 'border-orange-300' },
  MEDIUM:   { label: 'Medio',    color: 'text-amber-700',  bg: 'bg-amber-100',  border: 'border-amber-300' },
  LOW:      { label: 'Bajo',     color: 'text-green-700',  bg: 'bg-green-100',  border: 'border-green-300' },
} as const;

// ─── Hook: Entity Tree ────────────────────────────────────────────────────────

export function useEntityTree() {
  return useQuery<AuditEntityNode[]>({
    queryKey: ['entity-tree'],
    queryFn: () => apiClient.get('/audit-universe/tree'),
  });
}

// ─── Hooks: AuditProcess ─────────────────────────────────────────────────────

export function useAuditProcesses() {
  return useQuery<AuditProcess[]>({
    queryKey: ['audit-processes'],
    queryFn: () => apiClient.get('/audit-universe/processes/list'),
  });
}

export function useCreateAuditEntity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string; entityType?: string; parentEntityId?: string;
      description?: string; applicableRegulations?: string[];
    }) => apiClient.post('/audit-universe', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entity-tree'] });
      qc.invalidateQueries({ queryKey: ['audit-universe'] });
    },
  });
}

export function useUpdateAuditEntity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: {
      id: string;
      data: {
        name?: string; entityType?: string; parentEntityId?: string | null;
        description?: string; applicableRegulations?: string[];
        riskScore?: number; isActive?: boolean;
      };
    }) => apiClient.patch(`/audit-universe/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entity-tree'] });
      qc.invalidateQueries({ queryKey: ['audit-universe'] });
    },
  });
}

export function useDeleteAuditEntity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/audit-universe/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entity-tree'] });
      qc.invalidateQueries({ queryKey: ['audit-universe'] });
    },
  });
}

export function useCreateAuditProcess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { code: string; name: string; description?: string; category?: string; apqcCode?: string }) =>
      apiClient.post('/audit-universe/processes', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audit-processes'] }),
  });
}

export function useUpdateAuditProcess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<AuditProcess> }) =>
      apiClient.patch(`/audit-universe/processes/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audit-processes'] }),
  });
}

export function useDeleteAuditProcess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/audit-universe/processes/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audit-processes'] }),
  });
}

// ─── Hooks: AuditableUnit ─────────────────────────────────────────────────────

export function useAuditableUnits(entityId?: string, year?: number) {
  return useQuery<AuditableUnit[]>({
    queryKey: ['auditable-units', entityId, year],
    queryFn: () => {
      const params = new URLSearchParams();
      if (entityId) params.set('entityId', entityId);
      if (year) params.set('year', String(year));
      return apiClient.get(`/audit-universe/units/list?${params}`);
    },
  });
}

export function useCreateAuditableUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      auditEntityId: string; auditProcessId: string;
      name?: string; auditType?: string;
      isMandatory?: boolean; mandatoryBasis?: string; notes?: string;
    }) => apiClient.post('/audit-universe/units', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auditable-units'] });
      qc.invalidateQueries({ queryKey: ['audit-universe'] });
    },
  });
}

export function useUpdateAuditableUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<AuditableUnit> }) =>
      apiClient.patch(`/audit-universe/units/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auditable-units'] }),
  });
}

export function useDeleteAuditableUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/audit-universe/units/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auditable-units'] }),
  });
}

// ─── Hooks: Scoring Engine ────────────────────────────────────────────────────

export function useUpsertAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ unitId, data }: { unitId: string; data: Partial<AuditableUnitAssessment> & { assessmentYear?: number } }) =>
      apiClient.post(`/audit-universe/units/${unitId}/assessment`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auditable-units'] });
      qc.invalidateQueries({ queryKey: ['plan-candidates'] });
    },
  });
}

// ─── Hooks: Plan Builder ──────────────────────────────────────────────────────

export function usePlanCandidates(year?: number) {
  return useQuery<PlanCandidatesResult>({
    queryKey: ['plan-candidates', year],
    queryFn: () => {
      const params = year ? `?year=${year}` : '';
      return apiClient.get(`/audit-universe/plan-candidates${params}`);
    },
  });
}
