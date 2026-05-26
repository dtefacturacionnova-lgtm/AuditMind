'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Plus, Pencil, Trash2, X, Save, Loader2, Search,
  ChevronDown, ClipboardList, BarChart3, CheckCircle2,
  Circle, DollarSign, Users, Clock, RefreshCw, Zap,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { cn } from '@/lib/utils';
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
import { useEntityTree, AuditEntityNode } from '@/hooks/useAuditUniverse2';

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

const RISK_LEVEL_PCT: Record<string, number> = {
  CRITICO: 100,
  ALTO:    75,
  MEDIO:   50,
  BAJO:    25,
};

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

// ─── Risk score select options ────────────────────────────────────────────────

const STRATEGIC_IMPACT_OPTS = [
  { value: 1, label: 'Nulo' },
  { value: 2, label: 'Bajo' },
  { value: 3, label: 'Directo' },
  { value: 4, label: 'Crítico' },
];
const OPERATIONAL_IMPACT_OPTS = [
  { value: 1, label: 'Nulo' },
  { value: 2, label: 'Menor' },
  { value: 3, label: 'Moderado' },
  { value: 4, label: 'Paralizante' },
];
const LEGAL_REQUIREMENT_OPTS = [
  { value: 1, label: 'No aplica' },
  { value: 2, label: 'Recomendación' },
  { value: 3, label: 'Norma sectorial' },
  { value: 4, label: 'Ley obligatoria' },
];
const LAST_AUDIT_AGE_OPTS = [
  { value: 1, label: '< 12 meses' },
  { value: 2, label: '12–24 meses' },
  { value: 3, label: '24–36 meses' },
  { value: 4, label: '+36 meses o nunca' },
];
const RISK_PERCEPTION_OPTS = [
  { value: 1, label: 'Bajo' },
  { value: 2, label: 'Moderado' },
  { value: 3, label: 'Alto' },
  { value: 4, label: 'Crítico' },
];

// ─── Coverage Gap Badge ───────────────────────────────────────────────────────

function CoverageGapBadge({ days }: { days?: number | null }) {
  const { label, color, urgency } = formatCoverageGap(days);
  if (urgency === 'none') {
    return <span className="text-[11px] text-slate-400 italic">Sin historial</span>;
  }
  const icon = urgency === 'ok'
    ? <CheckCircle2 className="h-3 w-3" />
    : urgency === 'warn'
    ? <Clock className="h-3 w-3" />
    : <Clock className="h-3 w-3" />;
  return (
    <span className={cn('flex items-center gap-1 text-[11px] font-medium', color)}>
      {icon}
      {label}
    </span>
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
    areaScore: undefined,
    strategicImpact: undefined,
    operationalImpact: undefined,
    legalRequirement: undefined,
    lastAuditAge: undefined,
    riskPerception: undefined,
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
  const pct = ((score - 1) / 3) * 100;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-slate-200 overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', RISK_LEVEL_BAR[level] ?? 'bg-slate-400')}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', RISK_LEVEL_BADGE[level] ?? 'bg-gray-100 text-gray-600')}>
        {level}
      </span>
      <span className="text-xs text-slate-500">{score.toFixed(2)}</span>
    </div>
  );
}

// ─── RiskRow helper ───────────────────────────────────────────────────────────

function RiskRow({
  label, weight, value, options, onChange,
}: {
  label: string;
  weight: string;
  value?: number;
  options: { value: number; label: string }[];
  onChange: (v: number) => void;
}) {
  const levelColors = ['', 'text-green-600', 'text-yellow-600', 'text-orange-600', 'text-red-600'];
  return (
    <div className="grid grid-cols-12 items-center gap-3 py-2 border-b border-slate-100 last:border-0">
      <div className="col-span-6">
        <p className="text-sm font-medium text-slate-700">{label}</p>
        <p className="text-[11px] text-slate-400">Peso: {weight}</p>
      </div>
      <div className="col-span-4">
        <select
          value={value ?? ''}
          onChange={e => onChange(Number(e.target.value))}
          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">— Seleccionar —</option>
          {options.map(o => (
            <option key={o.value} value={o.value}>{o.value} — {o.label}</option>
          ))}
        </select>
      </div>
      <div className="col-span-2 text-center">
        {value ? (
          <span className={cn('text-lg font-bold', levelColors[value] ?? '')}>
            {value}
          </span>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const [yearFilter, setYearFilter]     = useState<number | undefined>(undefined);
  const [riskFilter, setRiskFilter]     = useState<string>('');
  const [search, setSearch]             = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const { data: projects = [], isLoading } = useAuditProjects(yearFilter, riskFilter || undefined, debouncedSearch || undefined);
  const { data: stats }                    = useProjectStats();
  const { data: objectives = [] }          = useStrategicObjectives();
  const { data: entityTree = [] }          = useEntityTree();

  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();
  const syncCoverage  = useSyncCoverage();

  const [showModal, setShowModal]       = useState(false);
  const [editing, setEditing]           = useState<AuditProject | null>(null);
  const [form, setForm]                 = useState<Partial<AuditProject>>(blankForm());
  const [activeTab, setActiveTab]       = useState<0 | 1 | 2>(0);
  const [saving, setSaving]             = useState(false);
  const [syncResult, setSyncResult]     = useState<{ updated: number } | null>(null);

  // Flattened entity list for dropdowns
  const entityList = useMemo(() => flattenTree(entityTree), [entityTree]);

  // Filtered lines based on selected objective
  const filteredLines = useMemo(() => {
    if (!form.strategicObjectiveId) return [];
    const obj = objectives.find(o => o.id === form.strategicObjectiveId);
    return obj?.lines ?? [];
  }, [form.strategicObjectiveId, objectives]);

  // Live risk computation — uses lastAuditAgeDynamic from editing project as fallback
  const liveRisk = useMemo(() => computeRiskScore({
    areaScore:           form.areaScore,
    strategicImpact:     form.strategicImpact,
    operationalImpact:   form.operationalImpact,
    legalRequirement:    form.legalRequirement,
    lastAuditAge:        form.lastAuditAge,
    lastAuditAgeDynamic: editing?.lastAuditAgeDynamic,
    riskPerception:      form.riskPerception,
  }), [form.areaScore, form.strategicImpact, form.operationalImpact, form.legalRequirement, form.lastAuditAge, editing?.lastAuditAgeDynamic, form.riskPerception]);

  // Budget calculation from teamJson
  const teamJson = (form.teamJson ?? DEFAULT_TEAM.map(r => ({ ...r }))) as AuditProjectTeamMember[];
  const totalBudget = teamJson.reduce((s, r) => s + r.count * r.costPerHour * r.hours, 0);

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

  // Year tabs from stats
  const years = stats?.years ?? [];

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <Header title="Banco de Proyectos de Auditoría" />

      {/* ── Banner ── */}
      <div className="bg-gradient-to-r from-[#0F2D4A] to-[#1a4a7a] px-6 py-5">
        <div className="flex flex-wrap gap-3">
          <StatCard
            label="Total Proyectos"
            value={stats?.total ?? 0}
            icon={ClipboardList}
            color="bg-blue-500"
          />
          <StatCard
            label="En Plan Anual"
            value={stats?.inPlan ?? 0}
            icon={CheckCircle2}
            color="bg-emerald-500"
          />
          <StatCard
            label="Riesgo Crítico"
            value={stats?.critico ?? 0}
            icon={BarChart3}
            color="bg-red-500"
          />
          <StatCard
            label="Riesgo Alto"
            value={stats?.alto ?? 0}
            icon={BarChart3}
            color="bg-orange-500"
          />
          <StatCard
            label="Presupuesto Total"
            value={`$${((stats?.totalBudget ?? 0) / 1000).toFixed(1)}K`}
            icon={DollarSign}
            color="bg-violet-500"
          />
          <StatCard
            label="Con Entidad Asignada"
            value={stats?.withEntity ?? 0}
            icon={Zap}
            color="bg-teal-500"
          />
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Year tabs */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setYearFilter(undefined)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                !yearFilter ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              )}
            >
              Todos
            </button>
            {years.map(y => (
              <button
                key={y}
                onClick={() => setYearFilter(y)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  yearFilter === y ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                )}
              >
                {y}
              </button>
            ))}
          </div>

          <div className="h-5 w-px bg-slate-200" />

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar proyecto..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
            />
          </div>

          {/* Risk filter */}
          <div className="relative">
            <select
              value={riskFilter}
              onChange={e => setRiskFilter(e.target.value)}
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
              title="Actualiza la variable 'Antigüedad última auditoría' en todos los proyectos usando el historial real de auditorías cerradas"
            >
              {syncCoverage.isPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <RefreshCw className="h-3.5 w-3.5" />
              }
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
                    <tr
                      key={p.id}
                      className="cursor-pointer hover:bg-blue-50/30 transition-colors"
                      onClick={() => openEdit(p)}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.correlative}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">{p.name}</p>
                        <p className="text-[11px] text-slate-400">Plan {p.planYear}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {p.strategicObjective ? (
                          <span>{p.strategicObjective.code}</span>
                        ) : null}
                        {p.strategicLine ? (
                          <span className="block text-slate-400">{p.strategicLine.code}</span>
                        ) : null}
                        {!p.strategicObjective && !p.strategicLine && <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        <p className="font-medium">{p.responsibleEntity?.name ?? <span className="text-slate-300">—</span>}</p>
                        {p.responsibleEntity && (
                          <CoverageGapBadge days={p.coverageGapDays} />
                        )}
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
                          : <Circle className="mx-auto h-5 w-5 text-slate-300" />
                        }
                      </td>
                      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => openEdit(p)}
                            className="rounded p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                            title="Editar"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(p.id)}
                            className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                            title="Eliminar"
                          >
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

            {/* Tabs */}
            <div className="flex border-b border-slate-200 px-6">
              {(['Identificación', 'Riesgo', 'Planificación'] as const).map((tab, i) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(i as 0 | 1 | 2)}
                  className={cn(
                    'border-b-2 px-4 py-3 text-sm font-medium transition-colors',
                    activeTab === i
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700',
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Modal body */}
            <div className="max-h-[60vh] overflow-y-auto px-6 py-5">

              {/* ── Tab 0: Identificación ── */}
              {activeTab === 0 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="label-sm">Correlativo *</label>
                      <input
                        className="input-sm"
                        placeholder="BAP-001"
                        value={form.correlative ?? ''}
                        onChange={e => setField('correlative', e.target.value)}
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="label-sm">Nombre del Proyecto *</label>
                      <input
                        className="input-sm"
                        placeholder="Auditoría de..."
                        value={form.name ?? ''}
                        onChange={e => setField('name', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label-sm">Año del Plan</label>
                      <input
                        type="number"
                        className="input-sm"
                        value={form.planYear ?? new Date().getFullYear()}
                        onChange={e => setField('planYear', Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <label className="label-sm">Categoría de Riesgo</label>
                      <select
                        className="input-sm"
                        value={form.riskCategory ?? ''}
                        onChange={e => setField('riskCategory', e.target.value)}
                      >
                        <option value="">— Seleccionar —</option>
                        {RISK_CATEGORIES.map(c => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label-sm">Objetivo Estratégico</label>
                      <select
                        className="input-sm"
                        value={form.strategicObjectiveId ?? ''}
                        onChange={e => {
                          setField('strategicObjectiveId', e.target.value);
                          setField('strategicLineId', '');
                        }}
                      >
                        <option value="">— Ninguno —</option>
                        {objectives.map(o => (
                          <option key={o.id} value={o.id}>{o.icon} {o.code} — {o.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label-sm">Línea Estratégica</label>
                      <select
                        className="input-sm"
                        value={form.strategicLineId ?? ''}
                        onChange={e => setField('strategicLineId', e.target.value)}
                        disabled={!form.strategicObjectiveId}
                      >
                        <option value="">— Ninguna —</option>
                        {filteredLines.map(l => (
                          <option key={l.id} value={l.id}>{l.code} — {l.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label-sm">Área Responsable</label>
                      <select
                        className="input-sm"
                        value={form.responsibleEntityId ?? ''}
                        onChange={e => setField('responsibleEntityId', e.target.value)}
                      >
                        <option value="">— Ninguna —</option>
                        {entityList.map(e => (
                          <option key={e.id} value={e.id}>{e.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label-sm">Área de Apoyo</label>
                      <select
                        className="input-sm"
                        value={form.supportEntityId ?? ''}
                        onChange={e => setField('supportEntityId', e.target.value)}
                      >
                        <option value="">— Ninguna —</option>
                        {entityList.map(e => (
                          <option key={e.id} value={e.id}>{e.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="label-sm">Notas / Alcance</label>
                    <textarea
                      rows={3}
                      className="input-sm resize-none"
                      placeholder="Descripción del alcance, antecedentes..."
                      value={form.notes ?? ''}
                      onChange={e => setField('notes', e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* ── Tab 1: Riesgo ── */}
              {activeTab === 1 && (
                <div className="space-y-4">
                  {/* Area score special input */}
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-700">Score del Área (0–100)</p>
                        <p className="text-xs text-slate-400">Peso: 25% — Se mapea automáticamente a escala 1–4</p>
                      </div>
                      <div className="text-right">
                        <span className="text-2xl font-bold text-blue-600">{form.areaScore ?? '—'}</span>
                        {form.areaScore != null && (
                          <span className="ml-2 text-sm text-slate-500">
                            → {form.areaScore >= 75 ? 4 : form.areaScore >= 55 ? 3 : form.areaScore >= 35 ? 2 : 1}
                          </span>
                        )}
                      </div>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={form.areaScore ?? 0}
                      onChange={e => setField('areaScore', Number(e.target.value))}
                      className="w-full accent-blue-600"
                    />
                    <div className="mt-1 flex justify-between text-[10px] text-slate-400">
                      <span>0 → Nivel 1</span>
                      <span>35 → Nivel 2</span>
                      <span>55 → Nivel 3</span>
                      <span>75 → Nivel 4</span>
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <RiskRow
                      label="Impacto Plan Estratégico"
                      weight="20%"
                      value={form.strategicImpact}
                      options={STRATEGIC_IMPACT_OPTS}
                      onChange={v => setField('strategicImpact', v)}
                    />
                    <RiskRow
                      label="Impacto Plan Operativo"
                      weight="15%"
                      value={form.operationalImpact}
                      options={OPERATIONAL_IMPACT_OPTS}
                      onChange={v => setField('operationalImpact', v)}
                    />
                    <RiskRow
                      label="Requerimiento Legal"
                      weight="20%"
                      value={form.legalRequirement}
                      options={LEGAL_REQUIREMENT_OPTS}
                      onChange={v => setField('legalRequirement', v)}
                    />
                    {/* Antigüedad — enhanced with dynamic coverage hint */}
                    <div className="py-2 border-b border-slate-100">
                      <div className="grid grid-cols-12 items-center gap-3">
                        <div className="col-span-6">
                          <p className="text-sm font-medium text-slate-700">Antigüedad Última Auditoría</p>
                          <p className="text-[11px] text-slate-400">Peso: 10%</p>
                        </div>
                        <div className="col-span-4">
                          <select
                            value={form.lastAuditAge ?? ''}
                            onChange={e => setField('lastAuditAge', Number(e.target.value) || undefined)}
                            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">— Manual —</option>
                            {LAST_AUDIT_AGE_OPTS.map(o => (
                              <option key={o.value} value={o.value}>{o.value} — {o.label}</option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-2 text-center">
                          {(form.lastAuditAge ?? editing?.lastAuditAgeDynamic) ? (
                            <span className={cn('text-lg font-bold', ['', 'text-green-600', 'text-yellow-600', 'text-orange-600', 'text-red-600'][form.lastAuditAge ?? editing?.lastAuditAgeDynamic ?? 0] ?? '')}>
                              {form.lastAuditAge ?? editing?.lastAuditAgeDynamic}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </div>
                      </div>
                      {editing?.lastAuditAgeDynamic != null && (
                        <div className="mt-2 flex items-center justify-between rounded-lg bg-teal-50 border border-teal-200 px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Zap className="h-3.5 w-3.5 text-teal-600" />
                            <span className="text-xs text-teal-700 font-medium">
                              Historial real: nivel {editing.lastAuditAgeDynamic}
                              {' '}({LAST_AUDIT_AGE_OPTS.find(o => o.value === editing.lastAuditAgeDynamic)?.label})
                            </span>
                            {editing.coverageGapDays != null && (
                              <span className={cn('text-[11px]', formatCoverageGap(editing.coverageGapDays).color)}>
                                · {formatCoverageGap(editing.coverageGapDays).label}
                              </span>
                            )}
                          </div>
                          {form.lastAuditAge !== editing.lastAuditAgeDynamic && (
                            <button
                              type="button"
                              onClick={() => setField('lastAuditAge', editing.lastAuditAgeDynamic!)}
                              className="text-[11px] font-semibold text-teal-700 hover:underline"
                            >
                              Usar este valor →
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <RiskRow
                      label="Percepción del Riesgo Auditor"
                      weight="10%"
                      value={form.riskPerception}
                      options={RISK_PERCEPTION_OPTS}
                      onChange={v => setField('riskPerception', v)}
                    />
                  </div>

                  {/* Live result */}
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
                            <p className="text-3xl font-bold text-slate-800">{liveRisk.score.toFixed(2)}</p>
                            <p className="text-xs text-slate-500">escala 1.0 – 4.0</p>
                          </>
                        ) : (
                          <p className="text-sm text-slate-400 mt-1">Complete todas las variables para ver el resultado</p>
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
                          style={{ width: `${((liveRisk.score - 1) / 3) * 100}%` }}
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
                      <input
                        className="input-sm"
                        placeholder="Ley, reglamento, norma..."
                        value={form.legalBasis ?? ''}
                        onChange={e => setField('legalBasis', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="label-sm">Horas Programadas</label>
                      <input
                        type="number"
                        className="input-sm"
                        placeholder="0"
                        value={form.plannedHours ?? ''}
                        onChange={e => setField('plannedHours', Number(e.target.value))}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="label-sm">Frecuencia por Año</label>
                    <div className="flex gap-2 mt-1">
                      {[1, 2, 3].map(f => (
                        <button
                          key={f}
                          onClick={() => setField('frequencyPerYear', f)}
                          className={cn(
                            'rounded-lg border px-5 py-2 text-sm font-medium transition-colors',
                            form.frequencyPerYear === f
                              ? 'border-blue-600 bg-blue-600 text-white'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300',
                          )}
                        >
                          {f}x
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Team table */}
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
                                  <input
                                    type="number"
                                    min={0}
                                    className="w-full text-center rounded border border-slate-200 px-1 py-1 text-sm"
                                    value={row.count}
                                    onChange={e => setTeamRow(idx, 'count', Number(e.target.value))}
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    className="w-full text-center rounded border border-slate-200 px-1 py-1 text-sm"
                                    value={row.costPerHour}
                                    onChange={e => setTeamRow(idx, 'costPerHour', Number(e.target.value))}
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    type="number"
                                    min={0}
                                    className="w-full text-center rounded border border-slate-200 px-1 py-1 text-sm"
                                    value={row.hours}
                                    onChange={e => setTeamRow(idx, 'hours', Number(e.target.value))}
                                  />
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
                            <td colSpan={4} className="px-3 py-2 text-right text-sm font-semibold text-slate-700">
                              Presupuesto Total
                            </td>
                            <td className="px-3 py-2 text-right text-base font-bold text-blue-700">
                              ${totalBudget.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    <p className="mt-2 text-xs text-slate-400">
                      Presupuesto = Cantidad × Costo/hora × Horas asignadas por rol
                    </p>
                  </div>

                  {/* Budget summary */}
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
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
              <div className="flex gap-2">
                {activeTab > 0 && (
                  <button
                    onClick={() => setActiveTab((activeTab - 1) as 0 | 1 | 2)}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                  >
                    Anterior
                  </button>
                )}
                {activeTab < 2 && (
                  <button
                    onClick={() => setActiveTab((activeTab + 1) as 0 | 1 | 2)}
                    className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700 hover:bg-blue-100"
                  >
                    Siguiente
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowModal(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
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

      {/* ── Global styles for inputs ── */}
      <style jsx global>{`
        .label-sm {
          display: block;
          margin-bottom: 4px;
          font-size: 12px;
          font-weight: 500;
          color: #64748b;
        }
        .input-sm {
          width: 100%;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          background: #f8fafc;
          padding: 6px 10px;
          font-size: 13px;
          color: #1e293b;
          outline: none;
          transition: box-shadow 0.15s;
        }
        .input-sm:focus {
          box-shadow: 0 0 0 2px #3b82f6;
          border-color: #3b82f6;
          background: white;
        }
        .input-sm:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
