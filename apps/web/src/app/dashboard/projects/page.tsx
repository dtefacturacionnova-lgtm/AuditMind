'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Plus, Pencil, Trash2, X, Save, Loader2, Search,
  ChevronDown, ClipboardList, BarChart3, CheckCircle2,
  Circle, DollarSign, Users, Clock, RefreshCw, Zap, ShieldAlert,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { cn, mapRiskTypeToCategory } from '@/lib/utils';
import {
  useAuditProjects,
  useProjectStats,
  useCreateProject,
  useUpdateProject,
  useDeleteProject,
  useSyncCoverage,
  computeRiskScore,
  formatCoverageGap,
  AuditProject,
  AuditProjectTeamMember,
} from '@/hooks/useAuditProjects';
import { useStrategicObjectives } from '@/hooks/useStrategic';
import { useEntityTree, usePlanCandidates, AuditEntityNode, type AuditableUnit } from '@/hooks/useAuditUniverse2';
import { RiskCatalogView } from '@/components/RiskCatalogView';
import { useProjectFindings } from '@/hooks/usePlans';

// ─── Constants ────────────────────────────────────────────────────────────────

const RISK_CATEGORIES = [
  { value: 'INTEGRAL_GOBIERNO',   label: '1. Riesgo Integral y Gobierno',          color: 'bg-slate-700'  },
  { value: 'CREDITO_FIDEICOMISO', label: '2. Riesgo de Crédito/Fideicomiso',       color: 'bg-blue-700'   },
  { value: 'LIQUIDEZ_MERCADO',    label: '3. Riesgo de Liquidez y Mercado',        color: 'bg-cyan-700'   },
  { value: 'LAVADO_DINERO',       label: '4. Riesgo de Lavado de Dinero',          color: 'bg-red-700'    },
  { value: 'OPERACIONAL',         label: '5. Riesgo Operacional (Op/Legal/TI/Fr)', color: 'bg-orange-600' },
  { value: 'AMBIENTAL_SOCIAL',    label: '6. Riesgo Ambiental y Social',           color: 'bg-green-700'  },
  { value: 'SEGUIMIENTO',         label: '7. Riesgo de Seguimiento',               color: 'bg-purple-700' },
  { value: 'OTROS',               label: '8. Otros Riesgos',                       color: 'bg-gray-600'   },
];

const DEFAULT_TEAM: AuditProjectTeamMember[] = [
  { role: 'Gerente de Auditoría', count: 1, costPerHour: 0, hours: 0 },
  { role: 'Supervisor',           count: 1, costPerHour: 0, hours: 0 },
  { role: 'Coordinador',          count: 1, costPerHour: 0, hours: 0 },
  { role: 'Auditor Senior',       count: 1, costPerHour: 0, hours: 0 },
  { role: 'Auditor Junior',       count: 1, costPerHour: 0, hours: 0 },
];

const RISK_LEVEL_BADGE: Record<string, string> = {
  CRITICO: 'bg-red-100 text-red-700 border border-red-300',
  ALTO:    'bg-orange-100 text-orange-700 border border-orange-300',
  MEDIO:   'bg-amber-100 text-amber-700 border border-amber-300',
  BAJO:    'bg-green-100 text-green-700 border border-green-300',
};

const RISK_LEVEL_BAR: Record<string, string> = {
  CRITICO: 'bg-red-500',
  ALTO:    'bg-orange-500',
  MEDIO:   'bg-amber-400',
  BAJO:    'bg-green-500',
};

const LEGAL_REQUIREMENT_OPTS = [
  { value: 1, label: 'No aplica' },
  { value: 2, label: 'Recomendación' },
  { value: 3, label: 'Norma sectorial' },
  { value: 4, label: 'Ley obligatoria' },
];

const OPINION_OPTIONS = [
  { value: 'SATISFACTORY',      label: 'Satisfactorio' },
  { value: 'NEEDS_IMPROVEMENT', label: 'Necesita mejoras' },
  { value: 'UNSATISFACTORY',    label: 'Insatisfactorio' },
  { value: 'CRITICAL',          label: 'Crítico' },
];

const SCORE_LABELS: Record<number, string> = { 1: 'Muy bajo', 2: 'Bajo', 3: 'Medio', 4: 'Alto', 5: 'Muy alto' };
const MATURITY_LABELS: Record<number, string> = { 1: 'Ad-hoc', 2: 'Inicial', 3: 'Definido', 4: 'Gestionado', 5: 'Optimizado' };

// ─── Helper: flatten entity tree ──────────────────────────────────────────────

function flattenTree(nodes: AuditEntityNode[], depth = 0): Array<{ id: string; label: string }> {
  const result: Array<{ id: string; label: string }> = [];
  for (const node of nodes) {
    const indent = '    '.repeat(depth);
    const prefix = depth > 0 ? '└ ' : '';
    result.push({ id: node.id, label: `${indent}${prefix}${node.name}` });
    if (node.children?.length) result.push(...flattenTree(node.children, depth + 1));
  }
  return result;
}

// ─── Coverage Gap Badge ───────────────────────────────────────────────────────

function CoverageGapBadge({ days }: { days?: number | null }) {
  const { label, color, urgency } = formatCoverageGap(days);
  if (urgency === 'none') {
    return <span className="text-[11px] text-slate-400 italic">Sin historial</span>;
  }
  const icon = urgency === 'ok'
    ? <CheckCircle2 className="h-3 w-3" />
    : <Clock className="h-3 w-3" />;
  return (
    <span className={cn('flex items-center gap-1 text-[11px] font-medium', color)}>
      {icon}
      {label}
    </span>
  );
}

// ─── ScoreSlider (mismo componente que Universe) ───────────────────────────────

function ScoreSlider({ label, hint, value, onChange, labelMap = SCORE_LABELS }: {
  label: string; hint?: string; value?: number;
  onChange: (v: number) => void; labelMap?: Record<number, string>;
}) {
  const colors = ['', 'bg-green-400', 'bg-lime-400', 'bg-amber-400', 'bg-orange-400', 'bg-red-500'];
  const val = value ?? 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-700">{label}</span>
        {val > 0 ? (
          <span className={cn('text-xs font-bold px-1.5 py-0.5 rounded text-white', colors[val])}>
            {val} — {labelMap[val]}
          </span>
        ) : (
          <span className="text-xs text-slate-400 italic">Sin evaluar</span>
        )}
      </div>
      {hint && <p className="text-[10px] text-slate-400">{hint}</p>}
      <input type="range" min={1} max={5} value={val || 1}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded accent-blue-600" />
      <div className="flex justify-between text-[9px] text-slate-400">
        <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
      </div>
    </div>
  );
}

// ─── Blank form ───────────────────────────────────────────────────────────────

function blankForm(): Partial<AuditProject> {
  return {
    correlative: '',
    name: '',
    planYear: new Date().getFullYear(),
    strategicObjectiveId: '',
    strategicLineId: '',
    responsibleEntityId: '',
    supportEntityId: '',
    riskCategory: '',
    notes: '',
    // Risk fields — left undefined so user must fill them in
    impactScore: undefined,
    likelihoodScore: undefined,
    controlMaturityScore: undefined,
    materialityScore: undefined,
    strategicAlignScore: undefined,
    operationalAlignScore: undefined,
    fraudHistoryScore: undefined,
    managementReqScore: undefined,
    staffTurnoverScore: undefined,
    coverageHistoryScore: undefined,
    legalRequirement: undefined,
    lastAuditOpinion: undefined,
    finalRiskScore: undefined,
    finalRiskLevel: undefined,
    includeInPlan: false,
    targetPlanYear: new Date().getFullYear(),
    legalBasis: '',
    frequencyPerYear: 1,
    plannedHours: undefined,
    teamJson: DEFAULT_TEAM.map(r => ({ ...r })),
    totalBudget: undefined,
    status: 'DRAFT',
  };
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, icon: Icon, color,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/10 px-4 py-3 backdrop-blur-sm">
      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', color)}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div>
        <p className="text-[11px] text-blue-200">{label}</p>
        <p className="text-xl font-bold text-white leading-tight">{value}</p>
      </div>
    </div>
  );
}

// ─── Risk Score Display ───────────────────────────────────────────────────────

function RiskScoreDisplay({ score, level }: { score?: number; level?: string }) {
  if (!score || !level) return <span className="text-slate-400 text-xs">—</span>;
  const pct = Math.min(100, score); // score is now 0-100
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-slate-200 overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', RISK_LEVEL_BAR[level] ?? 'bg-slate-400')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', RISK_LEVEL_BADGE[level] ?? 'bg-gray-100 text-gray-600')}>
        {level}
      </span>
      <span className="text-xs text-slate-500">{score.toFixed(1)}</span>
    </div>
  );
}

// ─── L2.6 + L2.7: Project History Panel ──────────────────────────────────────

function ProjectHistoryPanel({ projectId, project }: { projectId: string; project: AuditProject }) {
  const { data: findings = [], isLoading } = useProjectFindings(projectId);

  const scoreRows = [
    { label: 'Impacto',              value: project.impactScore },
    { label: 'Probabilidad',         value: project.likelihoodScore },
    { label: 'Madurez Controles',    value: project.controlMaturityScore },
    { label: 'Materialidad',         value: project.materialityScore },
    { label: 'Alin. Estratégica',    value: project.strategicAlignScore },
    { label: 'Alin. Operativa',      value: project.operationalAlignScore },
    { label: 'Fraude/Denuncias',     value: project.fraudHistoryScore },
    { label: 'Req. Dirección',       value: project.managementReqScore },
    { label: 'Rotación Personal',    value: project.staffTurnoverScore },
    { label: 'Cobertura',            value: project.coverageHistoryScore },
  ];

  return (
    <div className="space-y-6">
      {/* L2.6 — Evaluación de Riesgo */}
      <div>
        <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">
          Evaluación de Riesgo Actual
        </h3>
        <div className="mb-3 flex items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div>
            <p className="text-[11px] text-slate-400">Puntaje Final</p>
            <p className="text-2xl font-bold text-slate-800">{project.finalRiskScore?.toFixed(1) ?? '—'}</p>
            <p className="text-[11px] text-slate-400">escala 0–100</p>
          </div>
          {project.finalRiskLevel && (
            <span className={cn('ml-auto rounded-xl px-4 py-1.5 text-base font-bold', RISK_LEVEL_BADGE[project.finalRiskLevel] ?? 'bg-gray-100 text-gray-600')}>
              {project.finalRiskLevel}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {scoreRows.map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between rounded-lg border border-slate-100 bg-white px-3 py-1.5">
              <span className="text-xs text-slate-500">{label}</span>
              <span className="text-sm font-bold text-slate-700">{value != null ? `${value}/5` : '—'}</span>
            </div>
          ))}
        </div>
        {project.coverageGapDays != null && (
          <div className="mt-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs text-teal-700">
            Último historial de cobertura: {project.lastAuditAgeDynamic ?? '—'} · {project.coverageGapDays} días desde última auditoría
          </div>
        )}
      </div>

      {/* L2.7 — Hallazgos de Auditorías Anteriores */}
      <div>
        <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">
          Hallazgos de Auditorías Anteriores
        </h3>
        {isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando hallazgos…
          </div>
        ) : findings.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">
            No hay hallazgos anteriores vinculados a este proyecto
          </div>
        ) : (
          <div className="space-y-2">
            {findings.map(f => (
              <div key={f.id} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-slate-800">{f.title}</p>
                  <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                    f.severity === 'CRITICAL' ? 'bg-red-100 text-red-700 border border-red-300'
                    : f.severity === 'HIGH'   ? 'bg-orange-100 text-orange-700 border border-orange-300'
                    : f.severity === 'MEDIUM' ? 'bg-amber-100 text-amber-700 border border-amber-300'
                    : 'bg-green-100 text-green-700 border border-green-300'
                  )}>
                    {f.severity}
                  </span>
                </div>
                {f.condition && (
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">{f.condition}</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                  <span>Auditoría: <span className="font-medium text-slate-600">{f.audit.title}</span></span>
                  <span>{new Date(f.createdAt).toLocaleDateString('es')}</span>
                  <span className={cn('font-medium', f.status === 'CLOSED' ? 'text-emerald-600' : 'text-amber-600')}>
                    {f.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function ProjectsPageContent() {
  const [yearFilter, setYearFilter]     = useState<number | undefined>(undefined);
  const [riskFilter, setRiskFilter]     = useState<string>('');
  const [search, setSearch]             = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const { data: projects = [], isLoading } = useAuditProjects(yearFilter, riskFilter || undefined, debouncedSearch || undefined);
  const { data: stats }                    = useProjectStats();
  const { data: objectives = [] }          = useStrategicObjectives();
  const { data: entityTree = [] }          = useEntityTree();
  const { data: candidatesResult }         = usePlanCandidates(new Date().getFullYear());

  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();
  const syncCoverage  = useSyncCoverage();

  const [pageTab, setPageTab]           = useState<'projects' | 'catalog'>('projects');
  const [showModal, setShowModal]       = useState(false);
  const [editing, setEditing]           = useState<AuditProject | null>(null);
  const [form, setForm]                 = useState<Partial<AuditProject>>(blankForm());
  const [activeTab, setActiveTab]       = useState<0 | 1 | 2 | 3>(0);
  const [saving, setSaving]             = useState(false);
  const [syncResult, setSyncResult]     = useState<{ updated: number } | null>(null);
  const [pendingLineId, setPendingLineId] = useState<string | null>(null);

  // ── Pre-fill from URL params (coming from Universe "Completar en Banco") ─────
  const searchParams = useSearchParams();
  useEffect(() => {
    const fromUnit = searchParams.get('fromUnit');
    if (!fromUnit) return;
    const scoreRaw = parseFloat(searchParams.get('score') ?? '0');
    const lineId   = searchParams.get('strategicLineId') ?? '';
    const prefilled: Partial<AuditProject> = {
      ...blankForm(),
      name:                searchParams.get('name')               ?? '',
      riskCategory:        mapRiskTypeToCategory(searchParams.get('riskCategory')),
      legalBasis:          searchParams.get('legalBasis')         ?? '',
      responsibleEntityId: searchParams.get('responsibleEntityId') ?? undefined,
      legalRequirement: searchParams.get('isMandatory') === 'true' ? 4 : undefined,
      // Copy all 10 scoring fields directly from URL params (passed as-is from Universe)
      impactScore:           Number(searchParams.get('impactScore'))           || undefined,
      likelihoodScore:       Number(searchParams.get('likelihoodScore'))       || undefined,
      controlMaturityScore:  Number(searchParams.get('controlMaturityScore'))  || undefined,
      materialityScore:      Number(searchParams.get('materialityScore'))      || undefined,
      strategicAlignScore:   Number(searchParams.get('strategicAlignScore'))   || undefined,
      operationalAlignScore: Number(searchParams.get('operationalAlignScore')) || undefined,
      fraudHistoryScore:     Number(searchParams.get('fraudHistoryScore'))     || undefined,
      managementReqScore:    Number(searchParams.get('managementReqScore'))    || undefined,
      staffTurnoverScore:    Number(searchParams.get('staffTurnoverScore'))    || undefined,
      coverageHistoryScore:  Number(searchParams.get('coverageHistoryScore'))  || undefined,
      lastAuditOpinion:      searchParams.get('lastAuditOpinion')              ?? undefined,
      notes: `Promovido desde el Universo de Auditorías (score: ${scoreRaw > 0 ? scoreRaw.toFixed(0) : '—'})`,
    };
    setForm(prefilled);
    if (lineId) setPendingLineId(lineId);
    setEditing(null);
    setShowModal(true);
    window.history.replaceState({}, '', '/dashboard/projects');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Resolve strategicObjectiveId when objectives load ─────────────────────
  useEffect(() => {
    if (!pendingLineId || !objectives.length) return;
    for (const obj of objectives) {
      const line = (obj as any).lines?.find((l: { id: string }) => l.id === pendingLineId);
      if (line) {
        setForm(prev => ({ ...prev, strategicObjectiveId: obj.id, strategicLineId: pendingLineId }));
        setPendingLineId(null);
        break;
      }
    }
  }, [pendingLineId, objectives]);

  const entityList = useMemo(() => flattenTree(entityTree), [entityTree]);

  const filteredLines = useMemo(() => {
    if (!form.strategicObjectiveId) return [];
    const obj = objectives.find(o => o.id === form.strategicObjectiveId);
    return obj?.lines ?? [];
  }, [form.strategicObjectiveId, objectives]);

  // Live risk score — same formula as Universe
  const liveRisk = useMemo(() => computeRiskScore({
    impactScore:           form.impactScore,
    likelihoodScore:       form.likelihoodScore,
    controlMaturityScore:  form.controlMaturityScore,
    materialityScore:      form.materialityScore,
    strategicAlignScore:   form.strategicAlignScore,
    operationalAlignScore: form.operationalAlignScore,
    fraudHistoryScore:     form.fraudHistoryScore,
    managementReqScore:    form.managementReqScore,
    staffTurnoverScore:    form.staffTurnoverScore,
    coverageHistoryScore:  form.coverageHistoryScore,
  }), [
    form.impactScore, form.likelihoodScore, form.controlMaturityScore,
    form.materialityScore, form.strategicAlignScore, form.operationalAlignScore,
    form.fraudHistoryScore, form.managementReqScore, form.staffTurnoverScore,
    form.coverageHistoryScore,
  ]);

  const teamJson = (form.teamJson ?? DEFAULT_TEAM.map(r => ({ ...r }))) as AuditProjectTeamMember[];
  const totalBudget = teamJson.reduce((s, r) => s + r.count * r.costPerHour * r.hours, 0);

  // ── Load from Universe candidate (dropdown in the modal) ─────────────────
  function handleLoadFromCandidate(unitId: string) {
    const u = candidatesResult?.candidates.find(c => c.id === unitId);
    if (!u) return;
    const score = u.totalScore ?? 0;
    let resolvedObjectiveId = '';
    if (u.strategicLineId) {
      for (const obj of objectives) {
        if ((obj as any).lines?.find((l: { id: string }) => l.id === u.strategicLineId)) {
          resolvedObjectiveId = obj.id;
          break;
        }
      }
    }
    const assess = u.assessment ?? u.assessments?.[0];
    setForm(prev => ({
      ...prev,
      name:                 u.name ?? `${u.auditEntity?.name ?? ''} — ${u.auditProcess?.name ?? ''}`,
      riskCategory:         mapRiskTypeToCategory(u.riskType) || prev.riskCategory,
      legalBasis:           u.mandatoryBasis ?? prev.legalBasis ?? '',
      strategicObjectiveId: resolvedObjectiveId,
      strategicLineId:      u.strategicLineId ?? '',
      responsibleEntityId:  u.auditEntityId   || prev.responsibleEntityId,
      legalRequirement:     u.isMandatory ? 4 : prev.legalRequirement,
      // Direct copy of all 10 scoring fields from Universe assessment
      impactScore:           assess?.impactScore           ?? prev.impactScore,
      likelihoodScore:       assess?.likelihoodScore       ?? prev.likelihoodScore,
      controlMaturityScore:  assess?.controlMaturityScore  ?? prev.controlMaturityScore,
      materialityScore:      assess?.materialityScore      ?? prev.materialityScore,
      strategicAlignScore:   assess?.strategicAlignScore   ?? prev.strategicAlignScore,
      operationalAlignScore: assess?.operationalAlignScore ?? prev.operationalAlignScore,
      fraudHistoryScore:     assess?.fraudHistoryScore     ?? prev.fraudHistoryScore,
      managementReqScore:    assess?.managementReqScore    ?? prev.managementReqScore,
      staffTurnoverScore:    assess?.staffTurnoverScore    ?? prev.staffTurnoverScore,
      coverageHistoryScore:  assess?.coverageHistoryScore  ?? prev.coverageHistoryScore,
      lastAuditOpinion:      assess?.lastAuditOpinion      ?? prev.lastAuditOpinion,
      notes: `Promovido desde el Universo de Auditorías (score: ${score.toFixed(0)})${u.isMandatory ? ' · OBLIGATORIA' : ''}`,
    }));
  }

  function openNew() {
    setEditing(null);
    setForm(blankForm());
    setActiveTab(0);
    setShowModal(true);
  }

  function openEdit(p: AuditProject) {
    setEditing(p);
    setForm({
      ...p,
      teamJson: (p.teamJson && (p.teamJson as any[]).length > 0)
        ? p.teamJson as AuditProjectTeamMember[]
        : DEFAULT_TEAM.map(r => ({ ...r })),
    });
    setActiveTab(0);
    setShowModal(true);
  }

  function setField<K extends keyof AuditProject>(key: K, val: AuditProject[K]) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  function setTeamRow(idx: number, field: keyof AuditProjectTeamMember, val: number) {
    const updated = [...teamJson];
    updated[idx] = { ...updated[idx], [field]: val };
    setForm(prev => ({ ...prev, teamJson: updated, totalBudget: updated.reduce((s, r) => s + r.count * r.costPerHour * r.hours, 0) }));
  }

  async function handleSave() {
    if (!form.name || !form.correlative) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        finalRiskScore: liveRisk?.score,
        finalRiskLevel: liveRisk?.level,
        totalBudget,
      };
      if (editing) {
        await updateProject.mutateAsync({ id: editing.id, data: payload });
      } else {
        await createProject.mutateAsync(payload);
      }
      setShowModal(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este proyecto? Esta acción no se puede deshacer.')) return;
    await deleteProject.mutateAsync(id);
  }

  async function handleSyncCoverage() {
    const result = await syncCoverage.mutateAsync();
    setSyncResult({ updated: result.updated });
    setTimeout(() => setSyncResult(null), 4000);
  }

  async function handleTogglePlan(p: AuditProject) {
    await updateProject.mutateAsync({ id: p.id, data: { includeInPlan: !p.includeInPlan } });
  }

  const years = stats?.years ?? [];

  // Grupo A inherent/residual preview
  const inherent = (form.impactScore ?? 0) * (form.likelihoodScore ?? 0);
  const residual  = form.controlMaturityScore
    ? inherent * (1 - form.controlMaturityScore / 5)
    : 0;

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <Header title="Banco de Proyectos de Auditoría" />

      {/* ── Page Tab Switcher ── */}
      <div className="flex border-b border-slate-200 bg-white px-6">
        <button
          onClick={() => setPageTab('projects')}
          className={cn(
            'flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors',
            pageTab === 'projects'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700',
          )}
        >
          <ClipboardList className="h-4 w-4" />
          Proyectos de Auditoría
        </button>
        <button
          onClick={() => setPageTab('catalog')}
          className={cn(
            'flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors',
            pageTab === 'catalog'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700',
          )}
        >
          <ShieldAlert className="h-4 w-4" />
          Catálogo de Riesgos
        </button>
      </div>

      {/* ── Catalog tab ── */}
      {pageTab === 'catalog' && <RiskCatalogView />}

      {/* ── Projects tab content ── */}
      {pageTab === 'projects' && <>

      {/* ── Banner ── */}
      <div className="bg-gradient-to-r from-[#0F2D4A] to-[#1a4a7a] px-6 py-5">
        <div className="flex flex-wrap gap-3">
          <StatCard label="Total Proyectos"      value={stats?.total ?? 0}       icon={ClipboardList}  color="bg-blue-500"   />
          <StatCard label="En Plan Anual"        value={stats?.inPlan ?? 0}      icon={CheckCircle2}   color="bg-emerald-500"/>
          <StatCard label="Riesgo Crítico"       value={stats?.critico ?? 0}     icon={BarChart3}      color="bg-red-500"    />
          <StatCard label="Riesgo Alto"          value={stats?.alto ?? 0}        icon={BarChart3}      color="bg-orange-500" />
          <StatCard label="Presupuesto Total"    value={`$${((stats?.totalBudget ?? 0) / 1000).toFixed(1)}K`} icon={DollarSign} color="bg-violet-500"/>
          <StatCard label="Con Entidad Asignada" value={stats?.withEntity ?? 0}  icon={Zap}            color="bg-teal-500"   />
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setYearFilter(undefined)}
              className={cn('rounded-full px-3 py-1 text-xs font-medium transition-colors',
                !yearFilter ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}
            >Todos</button>
            {years.map(y => (
              <button key={y} onClick={() => setYearFilter(y)}
                className={cn('rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  yearFilter === y ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}
              >{y}</button>
            ))}
          </div>
          <div className="h-5 w-px bg-slate-200" />
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text" placeholder="Buscar proyecto..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
            />
          </div>
          <div className="relative">
            <select value={riskFilter} onChange={e => setRiskFilter(e.target.value)}
              className="h-8 appearance-none rounded-lg border border-slate-200 bg-slate-50 pl-3 pr-7 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todos los niveles</option>
              <option value="CRITICO">Crítico</option>
              <option value="ALTO">Alto</option>
              <option value="MEDIO">Medio</option>
              <option value="BAJO">Bajo</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          </div>
          <div className="ml-auto flex items-center gap-2">
            {syncResult && (
              <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">
                ✓ {syncResult.updated} proyecto{syncResult.updated !== 1 ? 's' : ''} actualizados
              </span>
            )}
            <button
              onClick={handleSyncCoverage}
              disabled={syncCoverage.isPending}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
              title="Actualiza la variable 'Historial de Cobertura' en todos los proyectos usando el historial real de auditorías cerradas"
            >
              {syncCoverage.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Sincronizar Cobertura
            </button>
            <button
              onClick={openNew}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Nuevo Proyecto
            </button>
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          </div>
        ) : projects.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-slate-400">
            <ClipboardList className="h-10 w-10 opacity-30" />
            <p className="text-sm">No hay proyectos registrados. Cree el primero.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">#</th>
                  <th className="px-4 py-3 text-left">Nombre del Proyecto</th>
                  <th className="px-4 py-3 text-left">OE / LE vinculada</th>
                  <th className="px-4 py-3 text-left">Área Responsable</th>
                  <th className="px-4 py-3 text-left">Cat. Riesgo</th>
                  <th className="px-4 py-3 text-left">Riesgo Final</th>
                  <th className="px-4 py-3 text-center">En Plan</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {projects.map((p) => {
                  const cat = RISK_CATEGORIES.find(c => c.value === p.riskCategory);
                  return (
                    <tr key={p.id} className="cursor-pointer hover:bg-blue-50/30 transition-colors" onClick={() => openEdit(p)}>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.correlative}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">{p.name}</p>
                        <p className="text-[11px] text-slate-400">Plan {p.planYear}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {p.strategicObjective ? <span>{p.strategicObjective.code}</span> : null}
                        {p.strategicLine ? <span className="block text-slate-400">{p.strategicLine.code}</span> : null}
                        {!p.strategicObjective && !p.strategicLine && <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        <p className="font-medium">{p.responsibleEntity?.name ?? <span className="text-slate-300">—</span>}</p>
                        {p.responsibleEntity && <CoverageGapBadge days={p.coverageGapDays} />}
                      </td>
                      <td className="px-4 py-3">
                        {cat ? (
                          <span className={cn('rounded-full px-2 py-0.5 text-[11px] text-white font-medium', cat.color)}>
                            {cat.label.split('.')[0].trim()}
                          </span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <RiskScoreDisplay score={p.finalRiskScore} level={p.finalRiskLevel} />
                      </td>
                      <td className="px-4 py-3 text-center" onClick={e => { e.stopPropagation(); handleTogglePlan(p); }}>
                        {p.includeInPlan
                          ? <CheckCircle2 className="mx-auto h-5 w-5 text-emerald-500" />
                          : <Circle className="mx-auto h-5 w-5 text-slate-300" />}
                      </td>
                      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <button onClick={() => openEdit(p)} className="rounded p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors" title="Editar">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => handleDelete(p.id)} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors" title="Eliminar">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      </>}

      {/* ── Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-10">
          <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl">
            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2 className="text-base font-bold text-slate-800">
                  {editing ? 'Editar Proyecto' : 'Nuevo Proyecto de Auditoría'}
                </h2>
                <p className="text-xs text-slate-400">
                  {editing ? `Editando: ${editing.correlative} — ${editing.name}` : 'Complete los datos del nuevo proyecto'}
                </p>
              </div>
              <button onClick={() => setShowModal(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Banner: promoted from Universe */}
            {!editing && form.notes?.startsWith('Promovido desde el Universo') && (
              <div className="mx-6 mt-4 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs text-blue-800">
                <Zap className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                <span><strong>Pre-llenado desde Candidatas al Plan.</strong> Los campos de riesgo del Universo fueron copiados directamente. Revisa y completa el equipo en "Planificación".</span>
              </div>
            )}

            {/* Tabs */}
            <div className="flex border-b border-slate-200 px-6">
              {(['Identificación', 'Riesgo', 'Planificación'] as const).map((tab, i) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(i as 0 | 1 | 2)}
                  className={cn(
                    'border-b-2 px-4 py-3 text-sm font-medium transition-colors',
                    activeTab === i ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700',
                  )}
                >{tab}</button>
              ))}
              {editing && (
                <button
                  onClick={() => setActiveTab(3)}
                  className={cn(
                    'border-b-2 px-4 py-3 text-sm font-medium transition-colors',
                    activeTab === 3 ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700',
                  )}
                >Historial</button>
              )}
            </div>

            {/* Modal body */}
            <div className="max-h-[65vh] overflow-y-auto px-6 py-5">

              {/* ── Tab 0: Identificación ── */}
              {activeTab === 0 && (
                <div className="space-y-4">

                  {/* Load from Universe */}
                  {!editing && (candidatesResult?.candidates.length ?? 0) > 0 && (
                    <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
                      <label className="mb-1.5 block text-xs font-semibold text-indigo-700">
                        Cargar desde Universo de Auditoría
                      </label>
                      <select
                        defaultValue=""
                        onChange={e => { if (e.target.value) handleLoadFromCandidate(e.target.value); }}
                        className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      >
                        <option value="" disabled>— Selecciona una candidata para auto-llenar todos los campos —</option>
                        <optgroup label="⚖️ Obligatorias (Mandato Legal)">
                          {candidatesResult?.candidates.filter(u => u.isMandatory).map(u => (
                            <option key={u.id} value={u.id}>
                              {u.name ?? `${u.auditEntity?.name ?? ''} — ${u.auditProcess?.name ?? ''}`}
                              {u.totalScore ? ` [score ${u.totalScore.toFixed(0)}]` : ''}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="🔴 Alta Prioridad (score ≥ 55)">
                          {candidatesResult?.candidates.filter(u => !u.isMandatory && (u.totalScore ?? 0) >= 55).map(u => (
                            <option key={u.id} value={u.id}>
                              {u.name ?? `${u.auditEntity?.name ?? ''} — ${u.auditProcess?.name ?? ''}`}
                              {u.totalScore ? ` [score ${u.totalScore.toFixed(0)}]` : ''}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="🟡 Otras evaluadas">
                          {candidatesResult?.candidates.filter(u => !u.isMandatory && (u.totalScore ?? 0) < 55).map(u => (
                            <option key={u.id} value={u.id}>
                              {u.name ?? `${u.auditEntity?.name ?? ''} — ${u.auditProcess?.name ?? ''}`}
                              {u.totalScore ? ` [score ${u.totalScore.toFixed(0)}]` : ''}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                      <p className="mt-1 text-[11px] text-indigo-500">
                        Al seleccionar se copian todos los campos de riesgo evaluados en el Universo.
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="label-sm">Correlativo *</label>
                      <input className="input-sm" placeholder="BAP-001"
                        value={form.correlative ?? ''} onChange={e => setField('correlative', e.target.value)} />
                    </div>
                    <div className="col-span-2">
                      <label className="label-sm">Nombre del Proyecto *</label>
                      <input className="input-sm" placeholder="Auditoría de..."
                        value={form.name ?? ''} onChange={e => setField('name', e.target.value)} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label-sm">Año del Plan</label>
                      <input type="number" className="input-sm"
                        value={form.planYear ?? new Date().getFullYear()}
                        onChange={e => setField('planYear', Number(e.target.value))} />
                    </div>
                    <div>
                      <label className="label-sm">Categoría de Riesgo</label>
                      <select className="input-sm" value={form.riskCategory ?? ''} onChange={e => setField('riskCategory', e.target.value)}>
                        <option value="">— Seleccionar —</option>
                        {RISK_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label-sm">Objetivo Estratégico</label>
                      <select className="input-sm" value={form.strategicObjectiveId ?? ''}
                        onChange={e => { setField('strategicObjectiveId', e.target.value); setField('strategicLineId', ''); }}>
                        <option value="">— Ninguno —</option>
                        {objectives.map(o => <option key={o.id} value={o.id}>{o.icon} {o.code} — {o.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label-sm">Línea Estratégica</label>
                      <select className="input-sm" value={form.strategicLineId ?? ''}
                        onChange={e => setField('strategicLineId', e.target.value)}
                        disabled={!form.strategicObjectiveId}>
                        <option value="">— Ninguna —</option>
                        {filteredLines.map(l => <option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label-sm">Área Responsable</label>
                      <select className="input-sm" value={form.responsibleEntityId ?? ''} onChange={e => setField('responsibleEntityId', e.target.value)}>
                        <option value="">— Ninguna —</option>
                        {entityList.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label-sm">Área de Apoyo</label>
                      <select className="input-sm" value={form.supportEntityId ?? ''} onChange={e => setField('supportEntityId', e.target.value)}>
                        <option value="">— Ninguna —</option>
                        {entityList.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="label-sm">Notas / Alcance</label>
                    <textarea rows={3} className="input-sm resize-none"
                      placeholder="Descripción del alcance, antecedentes..."
                      value={form.notes ?? ''} onChange={e => setField('notes', e.target.value)} />
                  </div>
                </div>
              )}

              {/* ── Tab 1: Riesgo ── */}
              {activeTab === 1 && (
                <div className="space-y-5">

                  {/* ── Grupo A ── */}
                  <div>
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">
                      Grupo A — Riesgo Residual (peso 30%)
                    </h3>
                    <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
                      <ScoreSlider
                        label="Impacto"
                        hint="Magnitud del daño si ocurre el riesgo"
                        value={form.impactScore}
                        onChange={v => setField('impactScore', v)}
                      />
                      <ScoreSlider
                        label="Probabilidad"
                        hint="Frecuencia estimada de ocurrencia"
                        value={form.likelihoodScore}
                        onChange={v => setField('likelihoodScore', v)}
                      />
                      <ScoreSlider
                        label="Madurez de Controles"
                        hint="Calidad de los controles existentes"
                        value={form.controlMaturityScore}
                        onChange={v => setField('controlMaturityScore', v)}
                        labelMap={MATURITY_LABELS}
                      />
                      {/* Inherent / Residual preview */}
                      {(form.impactScore && form.likelihoodScore) ? (
                        <div className="grid grid-cols-3 gap-3 text-xs text-slate-600 bg-slate-50 rounded p-3">
                          <div><span className="text-slate-400">Riesgo Inherente:</span><br /><strong>{inherent.toFixed(1)}/25</strong></div>
                          <div><span className="text-slate-400">Riesgo Residual:</span><br /><strong>{residual.toFixed(1)}/25</strong></div>
                          <div><span className="text-slate-400">Normalizado:</span><br /><strong>{((residual / 25) * 100).toFixed(1)}/100</strong></div>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* ── Grupo B ── */}
                  <div>
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">
                      Grupo B — Factores Contextuales (peso 70%)
                    </h3>
                    <p className="text-[10px] text-slate-400 mb-3">
                      Materialidad 20% · Alin.PE 20% · Alin.PO 15% · Fraude 15% · Dirección 10% · Rotación 10% · Cobertura 10%
                    </p>
                    <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
                      <ScoreSlider
                        label="Materialidad Financiera (20%)"
                        hint="Tamaño del presupuesto / volumen de transacciones del área"
                        value={form.materialityScore}
                        onChange={v => setField('materialityScore', v)}
                      />
                      <ScoreSlider
                        label="Alineación al Plan Estratégico (20%)"
                        hint="¿Esta área es crítica para los objetivos estratégicos?"
                        value={form.strategicAlignScore}
                        onChange={v => setField('strategicAlignScore', v)}
                      />
                      <ScoreSlider
                        label="Alineación al Plan Operativo (15%)"
                        hint="¿Qué tan relevante es para la operación diaria?"
                        value={form.operationalAlignScore}
                        onChange={v => setField('operationalAlignScore', v)}
                      />
                      <ScoreSlider
                        label="Antecedentes de Fraude / Denuncias (15%)"
                        hint="Historial de fraudes, investigaciones o alertas de ética"
                        value={form.fraudHistoryScore}
                        onChange={v => setField('fraudHistoryScore', v)}
                      />
                      <ScoreSlider
                        label="Solicitud de la Dirección (10%)"
                        hint="¿La gerencia o junta ha pedido expresamente esta auditoría?"
                        value={form.managementReqScore}
                        onChange={v => setField('managementReqScore', v)}
                      />
                      <ScoreSlider
                        label="Rotación de Personal (10%)"
                        hint="Cambios recientes de personal clave, nueva gerencia, M&A, restructuración"
                        value={form.staffTurnoverScore}
                        onChange={v => setField('staffTurnoverScore', v)}
                      />
                      <div>
                        <ScoreSlider
                          label="Historial de Cobertura (10%)"
                          hint="Tiempo transcurrido desde la última auditoría respecto a la frecuencia recomendada"
                          value={form.coverageHistoryScore}
                          onChange={v => setField('coverageHistoryScore', v)}
                        />
                        {/* Coverage hint from real audit history */}
                        {editing?.lastAuditAgeDynamic != null && (
                          <div className="mt-2 flex items-center justify-between rounded-lg bg-teal-50 border border-teal-200 px-3 py-2">
                            <div className="flex items-center gap-2">
                              <Zap className="h-3.5 w-3.5 text-teal-600" />
                              <span className="text-xs text-teal-700 font-medium">
                                Historial real: banda {editing.lastAuditAgeDynamic}
                              </span>
                              {editing.coverageGapDays != null && (
                                <span className={cn('text-[11px]', formatCoverageGap(editing.coverageGapDays).color)}>
                                  · {formatCoverageGap(editing.coverageGapDays).label}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* ── Campos adicionales del proyecto ── */}
                  <div>
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">
                      Campos Adicionales del Proyecto
                    </h3>
                    <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="label-sm">Requerimiento Legal / Normativo</label>
                          <select className="input-sm" value={form.legalRequirement ?? ''}
                            onChange={e => setField('legalRequirement', Number(e.target.value) || undefined)}>
                            <option value="">— Seleccionar —</option>
                            {LEGAL_REQUIREMENT_OPTS.map(o => (
                              <option key={o.value} value={o.value}>{o.value} — {o.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="label-sm">Opinión Última Auditoría</label>
                          <select className="input-sm" value={form.lastAuditOpinion ?? ''}
                            onChange={e => setField('lastAuditOpinion', e.target.value || undefined)}>
                            <option value="">— Sin calificación —</option>
                            {OPINION_OPTIONS.map(o => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── Live Risk Score ── */}
                  <div className={cn(
                    'rounded-xl border-2 p-4 transition-all',
                    liveRisk
                      ? liveRisk.level === 'CRITICO' ? 'border-red-300 bg-red-50'
                      : liveRisk.level === 'ALTO'    ? 'border-orange-300 bg-orange-50'
                      : liveRisk.level === 'MEDIO'   ? 'border-amber-300 bg-amber-50'
                      : 'border-green-300 bg-green-50'
                      : 'border-slate-200 bg-slate-50'
                  )}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Puntaje de Riesgo Calculado</p>
                        {liveRisk ? (
                          <>
                            <p className="text-3xl font-bold text-slate-800">{liveRisk.score.toFixed(1)}</p>
                            <p className="text-xs text-slate-500">escala 0 – 100</p>
                          </>
                        ) : (
                          <p className="text-sm text-slate-400 mt-1">Complete los 10 factores para ver el resultado</p>
                        )}
                      </div>
                      {liveRisk && (
                        <span className={cn('rounded-xl px-5 py-2 text-xl font-bold', RISK_LEVEL_BADGE[liveRisk.level])}>
                          {liveRisk.level}
                        </span>
                      )}
                    </div>
                    {liveRisk && (
                      <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-white/60">
                        <div
                          className={cn('h-full rounded-full transition-all duration-500', RISK_LEVEL_BAR[liveRisk.level])}
                          style={{ width: `${liveRisk.score}%` }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Include in plan */}
                  <div className="flex items-center gap-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={form.includeInPlan ?? false}
                        onChange={e => setField('includeInPlan', e.target.checked)}
                        className="h-4 w-4 rounded accent-blue-600"
                      />
                      <span className="text-sm font-medium text-slate-700">Incluir en Plan Anual</span>
                    </label>
                    {form.includeInPlan && (
                      <div className="ml-auto flex items-center gap-2">
                        <label className="text-xs text-slate-500">Año objetivo:</label>
                        <input
                          type="number"
                          className="h-8 w-24 rounded-lg border border-slate-200 px-2 text-sm"
                          value={form.targetPlanYear ?? new Date().getFullYear()}
                          onChange={e => setField('targetPlanYear', Number(e.target.value))}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Tab 2: Planificación ── */}
              {activeTab === 2 && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label-sm">Base Legal / Normativa</label>
                      <input className="input-sm" placeholder="Ley, reglamento, norma..."
                        value={form.legalBasis ?? ''} onChange={e => setField('legalBasis', e.target.value)} />
                    </div>
                    <div>
                      <label className="label-sm">Horas Programadas</label>
                      <input type="number" className="input-sm" placeholder="0"
                        value={form.plannedHours ?? ''} onChange={e => setField('plannedHours', Number(e.target.value))} />
                    </div>
                  </div>

                  <div>
                    <label className="label-sm">Frecuencia por Año</label>
                    <div className="flex gap-2 mt-1">
                      {[1, 2, 3].map(f => (
                        <button key={f} onClick={() => setField('frequencyPerYear', f)}
                          className={cn('rounded-lg border px-5 py-2 text-sm font-medium transition-colors',
                            form.frequencyPerYear === f
                              ? 'border-blue-600 bg-blue-600 text-white'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300')}
                        >{f}x</button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center gap-2">
                      <Users className="h-4 w-4 text-slate-500" />
                      <label className="text-sm font-semibold text-slate-700">Equipo de Auditoría</label>
                    </div>
                    <div className="overflow-hidden rounded-lg border border-slate-200">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                          <tr>
                            <th className="px-3 py-2 text-left">Cargo</th>
                            <th className="px-3 py-2 text-center w-16">Cant.</th>
                            <th className="px-3 py-2 text-center w-28">Costo/h (USD)</th>
                            <th className="px-3 py-2 text-center w-24">Horas</th>
                            <th className="px-3 py-2 text-right w-28">Total USD</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {teamJson.map((row, idx) => {
                            const rowTotal = row.count * row.costPerHour * row.hours;
                            return (
                              <tr key={row.role}>
                                <td className="px-3 py-2 text-slate-700 font-medium">{row.role}</td>
                                <td className="px-3 py-2">
                                  <input type="number" min={0} className="w-full text-center rounded border border-slate-200 px-1 py-1 text-sm"
                                    value={row.count} onChange={e => setTeamRow(idx, 'count', Number(e.target.value))} />
                                </td>
                                <td className="px-3 py-2">
                                  <input type="number" min={0} step={0.01} className="w-full text-center rounded border border-slate-200 px-1 py-1 text-sm"
                                    value={row.costPerHour} onChange={e => setTeamRow(idx, 'costPerHour', Number(e.target.value))} />
                                </td>
                                <td className="px-3 py-2">
                                  <input type="number" min={0} className="w-full text-center rounded border border-slate-200 px-1 py-1 text-sm"
                                    value={row.hours} onChange={e => setTeamRow(idx, 'hours', Number(e.target.value))} />
                                </td>
                                <td className="px-3 py-2 text-right font-medium text-slate-700">
                                  ${rowTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="bg-slate-50">
                          <tr>
                            <td colSpan={4} className="px-3 py-2 text-right text-sm font-semibold text-slate-700">Presupuesto Total</td>
                            <td className="px-3 py-2 text-right text-base font-bold text-blue-700">
                              ${totalBudget.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    <p className="mt-2 text-xs text-slate-400">Presupuesto = Cantidad × Costo/hora × Horas asignadas por rol</p>
                  </div>

                  <div className="rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 p-4 text-white">
                    <p className="text-xs font-medium opacity-80">Presupuesto Total del Proyecto</p>
                    <p className="text-3xl font-bold mt-1">
                      ${totalBudget.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      <span className="text-sm font-normal opacity-70 ml-1">USD</span>
                    </p>
                    {form.frequencyPerYear && form.frequencyPerYear > 1 && (
                      <p className="text-xs opacity-70 mt-0.5">
                        × {form.frequencyPerYear} = ${(totalBudget * form.frequencyPerYear).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} anual
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* ── Tab 3: Historial (L2.6 + L2.7) — only when editing ── */}
              {activeTab === 3 && editing && (
                <ProjectHistoryPanel projectId={editing.id} project={editing} />
              )}
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
              <div className="flex gap-2">
                {activeTab > 0 && (
                  <button onClick={() => setActiveTab((activeTab - 1) as 0 | 1 | 2 | 3)}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Anterior</button>
                )}
                {activeTab < 2 && (
                  <button onClick={() => setActiveTab((activeTab + 1) as 0 | 1 | 2 | 3)}
                    className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700 hover:bg-blue-100">Siguiente</button>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowModal(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
                <button
                  onClick={handleSave}
                  disabled={saving || !form.name || !form.correlative}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {editing ? 'Guardar Cambios' : 'Crear Proyecto'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Global styles ── */}
      <style jsx global>{`
        .label-sm { display:block; margin-bottom:4px; font-size:12px; font-weight:500; color:#64748b; }
        .input-sm { width:100%; border-radius:8px; border:1px solid #e2e8f0; background:#f8fafc; padding:6px 10px; font-size:13px; color:#1e293b; outline:none; transition:box-shadow 0.15s; }
        .input-sm:focus { box-shadow:0 0 0 2px #3b82f6; border-color:#3b82f6; background:white; }
        .input-sm:disabled { opacity:0.5; cursor:not-allowed; }
      `}</style>
    </div>
  );
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center text-slate-400">Cargando…</div>}>
      <ProjectsPageContent />
    </Suspense>
  );
}
