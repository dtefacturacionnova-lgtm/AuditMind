'use client';
import { useState } from 'react';
import {
  Plus, Trash2, ChevronRight, ChevronDown, Edit2,
  Layers, FlaskConical, X, Save, Target, Building2, Info,
  Users, MapPin, Mail, Phone, DollarSign,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { useAuditUniverse, useRiskSummary } from '@/hooks/useAuditUniverse';
import {
  useEntityTree, useCreateAuditEntity, useUpdateAuditEntity, useDeleteAuditEntity,
  useAuditProcesses, useCreateAuditProcess, useDeleteAuditProcess,
  useAuditableUnits, useCreateAuditableUnit, useUpdateAuditableUnit, useDeleteAuditableUnit,
  useUpsertAssessment, usePlanCandidates,
  ENTITY_TYPE_CONFIG, ORG_ENTITY_TYPES, RISK_LEVEL_CONFIG,
  type AuditEntityNode, type AuditProcess, type AuditableUnit,
} from '@/hooks/useAuditUniverse2';
import { useEntityTypeConfigs, type EntityTypeConfig } from '@/hooks/useCatalogs';
import { cn } from '@/lib/utils';

// Derive accent color class from catalog color string (e.g. "bg-blue-100 text-blue-800" → "blue")
function getAccentBorder(entityType: string): string {
  const map: Record<string, string> = {
    CORPORATE:  'border-l-slate-500',
    COMPANY:    'border-l-blue-500',
    DIVISION:   'border-l-indigo-500',
    DEPARTMENT: 'border-l-sky-500',
    AREA:       'border-l-teal-500',
    TEAM:       'border-l-green-500',
    BRANCH:     'border-l-amber-500',
    SUBSIDIARY: 'border-l-purple-500',
  };
  return map[entityType] ?? 'border-l-slate-400';
}

function getAccentDot(entityType: string): string {
  const map: Record<string, string> = {
    CORPORATE:  'bg-slate-500',
    COMPANY:    'bg-blue-500',
    DIVISION:   'bg-indigo-500',
    DEPARTMENT: 'bg-sky-500',
    AREA:       'bg-teal-500',
    TEAM:       'bg-green-500',
    BRANCH:     'bg-amber-500',
    SUBSIDIARY: 'bg-purple-500',
  };
  return map[entityType] ?? 'bg-slate-400';
}

function resolveTypeConfig(entityType: string, catalog?: EntityTypeConfig[]) {
  const cat = catalog?.find(t => t.value === entityType && t.active);
  if (cat) return { label: cat.label, icon: cat.icon, color: cat.color };
  return ENTITY_TYPE_CONFIG[entityType] ?? { label: entityType, icon: '🏢', color: 'bg-slate-100 text-slate-700' };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const APQC_CATEGORIES = [
  { code: '1.0',  name: 'Desarrollar Visión y Estrategia',            short: 'Estrategia',          type: 'operating' },
  { code: '2.0',  name: 'Desarrollar y Gestionar Productos/Servicios', short: 'Productos/Servicios', type: 'operating' },
  { code: '3.0',  name: 'Comercializar y Vender',                      short: 'Ventas y Marketing',  type: 'operating' },
  { code: '4.0',  name: 'Gestionar Cadena de Suministro',              short: 'Cadena Suministro',   type: 'operating' },
  { code: '5.0',  name: 'Producir y Entregar Productos/Servicios',     short: 'Producción/Entrega',  type: 'operating' },
  { code: '6.0',  name: 'Gestionar Servicio al Cliente',               short: 'Servicio al Cliente', type: 'operating' },
  { code: '7.0',  name: 'Gestionar Capital Humano',                    short: 'Capital Humano',      type: 'support'   },
  { code: '8.0',  name: 'Gestionar Tecnología de Información',         short: 'TI / Sistemas',       type: 'support'   },
  { code: '9.0',  name: 'Gestionar Recursos Financieros',              short: 'Finanzas',            type: 'support'   },
  { code: '10.0', name: 'Adquirir, Construir y Gestionar Activos',     short: 'Activos',             type: 'support'   },
  { code: '11.0', name: 'Gestionar Riesgos, Cumplimiento y Resiliencia', short: 'Riesgos/Compliance', type: 'support'  },
  { code: '12.0', name: 'Gestionar Relaciones Externas',               short: 'Rel. Externas',       type: 'support'   },
  { code: '13.0', name: 'Gestionar Conocimiento, Innovación y Mejora', short: 'Conocimiento',        type: 'support'   },
] as const;

const SCORE_LABELS: Record<number, string> = { 1: 'Muy bajo', 2: 'Bajo', 3: 'Medio', 4: 'Alto', 5: 'Muy alto' };
const MATURITY_LABELS: Record<number, string> = { 1: 'Ad-hoc', 2: 'Inicial', 3: 'Definido', 4: 'Gestionado', 5: 'Optimizado' };
const OPINION_OPTIONS = [
  { value: 'SATISFACTORY',      label: 'Satisfactorio',    color: 'text-green-700' },
  { value: 'NEEDS_IMPROVEMENT', label: 'Necesita mejoras', color: 'text-amber-700' },
  { value: 'UNSATISFACTORY',    label: 'Insatisfactorio',  color: 'text-orange-700' },
  { value: 'CRITICAL',          label: 'Crítico',          color: 'text-red-700' },
];

// ─── ScoreSlider ──────────────────────────────────────────────────────────────

function ScoreSlider({ label, hint, value, onChange, labelMap = SCORE_LABELS }: {
  label: string; hint?: string; value: number;
  onChange: (v: number) => void; labelMap?: Record<number, string>;
}) {
  const colors = ['', 'bg-green-400', 'bg-lime-400', 'bg-amber-400', 'bg-orange-400', 'bg-red-500'];
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-700">{label}</span>
        <span className={cn('text-xs font-bold px-1.5 py-0.5 rounded text-white', colors[value])}>
          {value} — {labelMap[value]}
        </span>
      </div>
      {hint && <p className="text-[10px] text-slate-400">{hint}</p>}
      <input type="range" min={1} max={5} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded accent-blue-600" />
      <div className="flex justify-between text-[9px] text-slate-400">
        <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
      </div>
    </div>
  );
}

// ─── ScoringModal ─────────────────────────────────────────────────────────────

function ScoringModal({ unit, onClose }: { unit: AuditableUnit; onClose: () => void }) {
  const existing = unit.assessments?.[0];
  const upsert = useUpsertAssessment();
  const currentYear = new Date().getFullYear();
  const [form, setForm] = useState({
    assessmentYear:        currentYear,
    impactScore:           existing?.impactScore           ?? 3,
    likelihoodScore:       existing?.likelihoodScore       ?? 3,
    controlMaturityScore:  existing?.controlMaturityScore  ?? 3,
    materialityScore:      existing?.materialityScore      ?? 3,
    strategicAlignScore:   existing?.strategicAlignScore   ?? 1,
    operationalAlignScore: existing?.operationalAlignScore ?? 1,
    fraudHistoryScore:     existing?.fraudHistoryScore     ?? 1,
    managementReqScore:    existing?.managementReqScore    ?? 1,
    changeVelocityScore:   existing?.changeVelocityScore   ?? 1,
    lastAuditDate:         existing?.lastAuditDate?.slice(0, 10) ?? '',
    lastAuditOpinion:      existing?.lastAuditOpinion ?? '',
    recommendedFreqMonths: existing?.recommendedFreqMonths ?? 12,
    notes:                 existing?.notes ?? '',
  });
  const set = (k: string, v: number | string) => setForm((f) => ({ ...f, [k]: v }));

  const inherent = form.impactScore * form.likelihoodScore;
  const residual = inherent * (1 - form.controlMaturityScore / 5);
  const residualNorm = (residual / 25) * 100;
  const secondaryAvg = (form.materialityScore + form.strategicAlignScore + form.operationalAlignScore +
    form.fraudHistoryScore + form.managementReqScore + form.changeVelocityScore) / 6;
  const secondaryNorm = ((secondaryAvg - 1) / 4) * 100;
  const totalScore = residualNorm * 0.7 + secondaryNorm * 0.3;
  const riskLevel = totalScore >= 75 ? 'CRITICAL' : totalScore >= 55 ? 'HIGH' : totalScore >= 35 ? 'MEDIUM' : 'LOW';
  const rl = RISK_LEVEL_CONFIG[riskLevel as keyof typeof RISK_LEVEL_CONFIG];

  const save = () => upsert.mutate(
    { unitId: unit.id, data: { ...form, lastAuditDate: form.lastAuditDate || undefined } },
    { onSuccess: onClose },
  );

  const unitName = unit.name ?? `${unit.auditEntity?.name} — ${unit.auditProcess?.name}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="font-semibold text-slate-900">Evaluación de Riesgos</h2>
            <p className="text-xs text-slate-500">{unitName}</p>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-6 py-5 space-y-6">
          <div className={cn('rounded-lg border p-4 flex items-center justify-between', rl.bg, rl.border)}>
            <div>
              <p className="text-xs text-slate-500">Score Total (preview)</p>
              <p className={cn('text-2xl font-bold', rl.color)}>{totalScore.toFixed(1)}</p>
            </div>
            <span className={cn('px-3 py-1 rounded-full text-sm font-semibold border', rl.bg, rl.color, rl.border)}>
              {rl.label}
            </span>
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Grupo A — Riesgo Residual (peso 70%)</h3>
            <div className="space-y-4">
              <ScoreSlider label="Impacto" hint="Magnitud del daño si ocurre el riesgo" value={form.impactScore} onChange={(v) => set('impactScore', v)} />
              <ScoreSlider label="Probabilidad" hint="Frecuencia estimada de ocurrencia" value={form.likelihoodScore} onChange={(v) => set('likelihoodScore', v)} />
              <ScoreSlider label="Madurez de Controles" hint="Calidad de los controles existentes" value={form.controlMaturityScore} onChange={(v) => set('controlMaturityScore', v)} labelMap={MATURITY_LABELS} />
              <div className="grid grid-cols-3 gap-3 text-xs text-slate-600 bg-slate-50 rounded p-3">
                <div><span className="text-slate-400">Riesgo Inherente:</span><br /><strong>{inherent.toFixed(1)}/25</strong></div>
                <div><span className="text-slate-400">Riesgo Residual:</span><br /><strong>{residual.toFixed(1)}/25</strong></div>
                <div><span className="text-slate-400">Normalizado:</span><br /><strong>{residualNorm.toFixed(1)}/100</strong></div>
              </div>
            </div>
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Grupo B — Factores Secundarios (peso 30%)</h3>
            <div className="space-y-4">
              <ScoreSlider label="Materialidad Financiera" hint="Tamaño del presupuesto / volumen de transacciones del área" value={form.materialityScore} onChange={(v) => set('materialityScore', v)} />
              <ScoreSlider label="Alineación al Plan Estratégico" hint="¿Esta área es crítica para los objetivos estratégicos?" value={form.strategicAlignScore} onChange={(v) => set('strategicAlignScore', v)} />
              <ScoreSlider label="Alineación al Plan Operativo" hint="¿Qué tan relevante es para la operación diaria?" value={form.operationalAlignScore} onChange={(v) => set('operationalAlignScore', v)} />
              <ScoreSlider label="Antecedentes de Fraude / Denuncias" hint="Historial de fraudes, investigaciones o alertas de ética" value={form.fraudHistoryScore} onChange={(v) => set('fraudHistoryScore', v)} />
              <ScoreSlider label="Solicitud de la Dirección" hint="¿La gerencia o junta ha pedido expresamente esta auditoría?" value={form.managementReqScore} onChange={(v) => set('managementReqScore', v)} />
              <ScoreSlider label="Velocidad de Cambio" hint="Cambios recientes: nuevo sistema, M&A, nueva gerencia, restructuración" value={form.changeVelocityScore} onChange={(v) => set('changeVelocityScore', v)} />
            </div>
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Historial de Cobertura</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-slate-700">Última auditoría</label>
                <input type="date" value={form.lastAuditDate} onChange={(e) => set('lastAuditDate', e.target.value)}
                  className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-700">Opinión / Resultado</label>
                <select value={form.lastAuditOpinion} onChange={(e) => set('lastAuditOpinion', e.target.value)}
                  className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5 text-sm">
                  <option value="">— Sin calificación —</option>
                  {OPINION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-700">Frecuencia recomendada (meses)</label>
                <input type="number" min={1} max={60} value={form.recommendedFreqMonths}
                  onChange={(e) => set('recommendedFreqMonths', Number(e.target.value))}
                  className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
              </div>
            </div>
            <div className="mt-3">
              <label className="text-xs font-medium text-slate-700">Notas / Justificación</label>
              <textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)}
                className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5 text-sm resize-none"
                placeholder="Contexto adicional sobre el riesgo de esta unidad…" />
            </div>
          </div>
        </div>
        <div className="border-t px-6 py-4 flex justify-end gap-3">
          <button onClick={onClose} className="rounded px-4 py-2 text-sm border border-slate-300 hover:bg-slate-50">Cancelar</button>
          <button onClick={save} disabled={upsert.isPending}
            className="rounded px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1.5 disabled:opacity-60">
            <Save className="h-3.5 w-3.5" />
            {upsert.isPending ? 'Guardando…' : 'Guardar Evaluación'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── PlanCandidatesView ───────────────────────────────────────────────────────

function PlanCandidatesView() {
  const currentYear = new Date().getFullYear();
  const { data, isLoading } = usePlanCandidates(currentYear);
  if (isLoading) return <div className="p-8 text-center text-slate-400 text-sm">Cargando candidatas…</div>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total candidatas', value: data.total,     color: 'text-slate-900' },
          { label: 'Mandatorias',      value: data.mandatory, color: 'text-rose-600'  },
          { label: 'Vencidas',         value: data.overdue,   color: 'text-orange-600'},
          { label: 'Año',              value: data.year,      color: 'text-blue-700'  },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-slate-200 bg-white p-4 text-center">
            <p className={cn('text-2xl font-bold', s.color)}>{s.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Candidatas Rankeadas por Score</h3>
          <span className="text-xs text-slate-400">Mandatorias primero · luego por riesgo residual ↓</span>
        </div>
        <div className="divide-y divide-slate-100">
          {data.candidates.map((u, i) => {
            const rl = RISK_LEVEL_CONFIG[(u.riskLevel ?? 'MEDIUM') as keyof typeof RISK_LEVEL_CONFIG];
            return (
              <div key={u.id} className={cn('flex items-center gap-4 px-4 py-3', u.isMandatory && 'bg-rose-50/40')}>
                <span className="text-xs font-mono text-slate-400 w-6 shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-900 truncate">
                      {u.name ?? `${u.auditEntity?.name} — ${u.auditProcess?.name}`}
                    </span>
                    {u.isMandatory && (
                      <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">MANDATORIO</span>
                    )}
                    {u.alreadyInCurrentPlan && (
                      <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] bg-green-100 text-green-700">En plan {data.year}</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {u.auditProcess?.category} · {u.auditType}
                    {(u.coverageGapDays ?? 0) > 0 && (
                      <span className="ml-2 text-orange-600 font-medium">⚠ Vencida hace {u.coverageGapDays}d</span>
                    )}
                  </p>
                </div>
                <div className="w-32 shrink-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className={cn('text-xs font-bold', rl.color)}>{(u.totalScore ?? 0).toFixed(1)}</span>
                    <span className={cn('text-[10px] px-1 rounded', rl.bg, rl.color)}>{rl.label}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-200">
                    <div className={cn('h-1.5 rounded-full',
                      (u.totalScore ?? 0) >= 75 ? 'bg-red-500' :
                      (u.totalScore ?? 0) >= 55 ? 'bg-orange-400' :
                      (u.totalScore ?? 0) >= 35 ? 'bg-amber-400' : 'bg-green-400'
                    )} style={{ width: `${Math.min(u.totalScore ?? 0, 100)}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── EntityModal (crear y editar) ─────────────────────────────────────────────

function EntityModal({ node, parentId, parentName, onClose }: {
  node?: AuditEntityNode;
  parentId?: string;
  parentName?: string;
  onClose: () => void;
}) {
  const createEntity = useCreateAuditEntity();
  const updateEntity = useUpdateAuditEntity();
  const { data: catalogTypes = [] } = useEntityTypeConfigs();
  const isPending = createEntity.isPending || updateEntity.isPending;
  const isEdit = !!node;
  const [activeTab, setActiveTab] = useState<'basic' | 'details' | 'governance'>('basic');

  const [form, setForm] = useState({
    name:                   node?.name ?? '',
    entityType:             node?.entityType ?? 'AREA',
    description:            node?.description ?? '',
    applicableRegulations:  (node?.applicableRegulations ?? []).join(', '),
    riskScore:              node?.inherentRiskScore ?? 0,
    objective:              node?.objective ?? '',
    status:                 node?.status ?? 'ACTIVE',
    responsible:            node?.responsible ?? '',
    employeeCount:          node?.employeeCount?.toString() ?? '',
    contactEmail:           node?.contactEmail ?? '',
    contactPhone:           node?.contactPhone ?? '',
    budget:                 node?.budget ?? '',
    location:               node?.location ?? '',
    sector:                 node?.sector ?? '',
  });
  const set = (k: string, v: string | number) => setForm((f) => ({ ...f, [k]: v }));

  const RISK_LEVELS = [
    { score: 0,  label: 'Sin evaluar' },
    { score: 20, label: 'Bajo (20)' },
    { score: 40, label: 'Medio (40)' },
    { score: 60, label: 'Alto (60)' },
    { score: 80, label: 'Crítico (80)' },
  ];

  const entityTypeOptions = catalogTypes.length > 0
    ? catalogTypes.filter(t => t.active)
    : ORG_ENTITY_TYPES.map(t => ({ value: t.value, label: t.label, icon: '', color: '' }));

  const save = () => {
    const regs = form.applicableRegulations
      ? form.applicableRegulations.split(',').map((r) => r.trim()).filter(Boolean)
      : [];
    const payload: any = {
      name:                  form.name,
      entityType:            form.entityType,
      description:           form.description || undefined,
      applicableRegulations: regs,
      riskScore:             form.riskScore,
      objective:             form.objective || undefined,
      status:                form.status,
      responsible:           form.responsible || undefined,
      employeeCount:         form.employeeCount ? Number(form.employeeCount) : undefined,
      contactEmail:          form.contactEmail || undefined,
      contactPhone:          form.contactPhone || undefined,
      budget:                form.budget || undefined,
      location:              form.location || undefined,
      sector:                form.sector || undefined,
    };
    if (isEdit) {
      updateEntity.mutate({ id: node!.id, data: payload }, { onSuccess: onClose });
    } else {
      createEntity.mutate({ ...payload, parentEntityId: parentId }, { onSuccess: onClose });
    }
  };

  const tabs = [
    { id: 'basic',      label: 'Información' },
    { id: 'details',    label: 'Detalles' },
    { id: 'governance', label: 'Gobernanza' },
  ] as const;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between border-b px-6 py-4 shrink-0">
          <div>
            <h2 className="font-semibold text-slate-900">
              {isEdit ? 'Editar Entidad' : parentId ? 'Agregar Sub-entidad' : 'Nueva Entidad Raíz'}
            </h2>
            {!isEdit && parentName && <p className="text-xs text-slate-500">Dependiente de: {parentName}</p>}
            {isEdit && <p className="text-xs text-slate-500">{node!.name}</p>}
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-3 border-b shrink-0">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={cn('px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors',
                activeTab === t.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700',
              )}>{t.label}</button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4">
          {activeTab === 'basic' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-700">Nombre *</label>
                <input value={form.name} onChange={(e) => set('name', e.target.value)}
                  placeholder="Ej: Gerencia de Finanzas"
                  className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-700">Nivel jerárquico *</label>
                <select value={form.entityType} onChange={(e) => set('entityType', e.target.value)}
                  className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm">
                  {entityTypeOptions.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-700">Descripción corta</label>
                <input value={form.description} onChange={(e) => set('description', e.target.value)}
                  placeholder="Breve descripción del área"
                  className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-700">Objetivo General</label>
                <textarea rows={2} value={form.objective} onChange={(e) => set('objective', e.target.value)}
                  placeholder="Propósito y misión del área dentro de la organización"
                  className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-700">Estado</label>
                  <select value={form.status} onChange={(e) => set('status', e.target.value)}
                    className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm">
                    <option value="ACTIVE">Activo</option>
                    <option value="INACTIVE">Inactivo</option>
                    <option value="RESTRUCTURING">En restructuración</option>
                    <option value="MERGED">Fusionado</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-700">Riesgo Inherente</label>
                  <select value={form.riskScore} onChange={(e) => set('riskScore', Number(e.target.value))}
                    className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm">
                    {RISK_LEVELS.map((r) => (
                      <option key={r.score} value={r.score}>{r.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'details' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-700">Responsable</label>
                  <input value={form.responsible} onChange={(e) => set('responsible', e.target.value)}
                    placeholder="Nombre del titular"
                    className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-700">N.° de Empleados</label>
                  <input type="number" value={form.employeeCount} onChange={(e) => set('employeeCount', e.target.value)}
                    placeholder="0"
                    className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-700">Email de contacto</label>
                  <input type="email" value={form.contactEmail} onChange={(e) => set('contactEmail', e.target.value)}
                    placeholder="area@empresa.com"
                    className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-700">Teléfono</label>
                  <input value={form.contactPhone} onChange={(e) => set('contactPhone', e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-700">Ubicación / Sede</label>
                  <input value={form.location} onChange={(e) => set('location', e.target.value)}
                    placeholder="Ciudad, País"
                    className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-700">Sector / Industria</label>
                  <input value={form.sector} onChange={(e) => set('sector', e.target.value)}
                    placeholder="Financiero, Tecnología…"
                    className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-700">Presupuesto anual</label>
                <input value={form.budget} onChange={(e) => set('budget', e.target.value)}
                  placeholder="USD 1,200,000 / Referencial"
                  className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm" />
              </div>
            </div>
          )}

          {activeTab === 'governance' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-700">Regulaciones aplicables</label>
                <input value={form.applicableRegulations} onChange={(e) => set('applicableRegulations', e.target.value)}
                  placeholder="SOX, GDPR, UAF, CMF (separados por coma)"
                  className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm" />
                <p className="mt-1 text-[10px] text-slate-400">Ingresa los marcos regulatorios separados por coma</p>
              </div>
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800">
                <strong>Nota:</strong> El score de riesgo definitivo se calcula mediante la evaluación multi-factor
                en la pestaña <em>Unidades Auditables</em>. El riesgo inherente aquí es solo un indicador inicial.
              </div>
            </div>
          )}
        </div>

        <div className="border-t px-6 py-4 flex justify-end gap-3 shrink-0">
          <button onClick={onClose} className="rounded px-4 py-2 text-sm border border-slate-300 hover:bg-slate-50">Cancelar</button>
          <button onClick={save} disabled={!form.name || isPending}
            className="rounded px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 flex items-center gap-1.5">
            <Save className="h-3.5 w-3.5" />
            {isPending ? 'Guardando…' : isEdit ? 'Guardar Cambios' : 'Crear Entidad'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── EntityCard ───────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; dot: string }> = {
  ACTIVE:         { label: 'Activo',           dot: 'bg-green-500'  },
  INACTIVE:       { label: 'Inactivo',          dot: 'bg-gray-400'   },
  RESTRUCTURING:  { label: 'Restructuración',   dot: 'bg-amber-500'  },
  MERGED:         { label: 'Fusionado',          dot: 'bg-purple-500' },
};

function EntityCard({
  node, depth, isLast, ancestorIsLast,
  onAddChild, onEdit, onDelete, onSelect, selectedId,
  catalog,
}: {
  node: AuditEntityNode;
  depth: number;
  isLast: boolean;
  ancestorIsLast: boolean[];
  onAddChild: (id: string, name: string) => void;
  onEdit: (node: AuditEntityNode) => void;
  onDelete: (id: string) => void;
  onSelect: (node: AuditEntityNode) => void;
  selectedId: string | undefined;
  catalog: EntityTypeConfig[];
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children.length > 0;
  const etConfig = resolveTypeConfig(node.entityType, catalog);
  const accentBorder = getAccentBorder(node.entityType);
  const accentDot = getAccentDot(node.entityType);
  const rs = node.inherentRiskScore;
  const riskLevel = rs >= 75 ? 'CRITICAL' : rs >= 55 ? 'HIGH' : rs >= 35 ? 'MEDIUM' : 'LOW';
  const rl = rs > 0 ? RISK_LEVEL_CONFIG[riskLevel as keyof typeof RISK_LEVEL_CONFIG] : null;
  const statusCfg = STATUS_CONFIG[node.status ?? 'ACTIVE'] ?? STATUS_CONFIG['ACTIVE'];

  return (
    <div>
      <div className="flex items-stretch gap-0 group">
        {/* Ancestor continuation lines */}
        {ancestorIsLast.map((wasLast, i) => (
          <div key={i} className="w-6 shrink-0 relative">
            {!wasLast && <div className="absolute left-3 inset-y-0 w-px bg-slate-200" />}
          </div>
        ))}

        {/* Current level connector */}
        {depth > 0 && (
          <div className="w-6 shrink-0 relative">
            <div className="absolute left-3 top-0 bottom-1/2 w-px bg-slate-200" />
            {!isLast && <div className="absolute left-3 top-1/2 bottom-0 w-px bg-slate-200" />}
            <div className="absolute left-3 top-1/2 w-3 h-px bg-slate-200" />
          </div>
        )}

        {/* Expand toggle */}
        <div className="w-5 shrink-0 flex items-center justify-center">
          {hasChildren ? (
            <button onClick={() => setExpanded(!expanded)}
              className="w-4 h-4 rounded flex items-center justify-center hover:bg-slate-200 transition-colors">
              {expanded
                ? <ChevronDown className="h-3 w-3 text-slate-500" />
                : <ChevronRight className="h-3 w-3 text-slate-500" />}
            </button>
          ) : (
            <div className={cn('w-2 h-2 rounded-full', accentDot, 'opacity-50')} />
          )}
        </div>

        {/* The card itself */}
        <div className={cn(
          'flex-1 mb-1.5 rounded-lg border border-slate-200 border-l-[3px] bg-white shadow-sm',
          'hover:shadow-md transition-shadow cursor-pointer',
          accentBorder,
          node.id === selectedId && 'ring-2 ring-blue-400 ring-offset-1 shadow-md',
        )}
          onClick={() => onSelect(node)}
        >
          <div className="px-3 py-2.5 flex items-start gap-2.5">
            {/* Icon */}
            <span className="text-base mt-0.5 shrink-0">{etConfig.icon}</span>

            {/* Main content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-slate-900 truncate">{node.name}</span>
                <span className={cn('shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium', etConfig.color)}>
                  {etConfig.label}
                </span>
                {/* Status dot */}
                <span className="flex items-center gap-1 shrink-0">
                  <span className={cn('w-1.5 h-1.5 rounded-full', statusCfg.dot)} />
                  <span className="text-[10px] text-slate-400">{statusCfg.label}</span>
                </span>
              </div>

              {/* Responsible + objective */}
              {(node.responsible || node.objective) && (
                <div className="mt-0.5 space-y-0.5">
                  {node.responsible && (
                    <p className="text-[11px] text-slate-500 flex items-center gap-1">
                      <Users className="h-2.5 w-2.5" />{node.responsible}
                    </p>
                  )}
                  {node.objective && (
                    <p className="text-[11px] text-slate-400 line-clamp-1">{node.objective}</p>
                  )}
                </div>
              )}

              {/* Stats row */}
              <div className="mt-1.5 flex items-center gap-3 flex-wrap">
                {(node.employeeCount ?? 0) > 0 && (
                  <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                    <Users className="h-2.5 w-2.5" />{node.employeeCount} emp.
                  </span>
                )}
                <span className="text-[10px] text-slate-400">
                  {node._count?.auditableUnits ?? 0} unidades auditables
                </span>
                {rl && rs > 0 && (
                  <span className={cn('text-[10px] px-1 py-0.5 rounded border font-medium shrink-0', rl.bg, rl.color, rl.border)}>
                    {rl.label}
                  </span>
                )}
                {(node.applicableRegulations?.length ?? 0) > 0 && (
                  <span className="text-[10px] text-rose-600 bg-rose-50 px-1 rounded border border-rose-200">
                    {node.applicableRegulations!.slice(0, 2).join(', ')}
                    {node.applicableRegulations!.length > 2 && ` +${node.applicableRegulations!.length - 2}`}
                  </span>
                )}
              </div>
            </div>

            {/* Hover actions */}
            <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={e => e.stopPropagation()}>
              <button onClick={() => onAddChild(node.id, node.name)}
                className="p-1.5 rounded hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors" title="Agregar sub-entidad">
                <Plus className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => onEdit(node)}
                className="p-1.5 rounded hover:bg-amber-50 text-slate-400 hover:text-amber-600 transition-colors" title="Editar">
                <Edit2 className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => onDelete(node.id)}
                className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors" title="Eliminar">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Children */}
      {hasChildren && expanded && (
        <div className="ml-0">
          {node.children.map((child, idx) => (
            <EntityCard
              key={child.id}
              node={child}
              depth={depth + 1}
              isLast={idx === node.children.length - 1}
              ancestorIsLast={[...ancestorIsLast, isLast]}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onDelete={onDelete}
              onSelect={onSelect}
              selectedId={selectedId}
              catalog={catalog}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── EntityDetailModal ────────────────────────────────────────────────────────

function EntityDetailModal({
  node, catalog, onEdit, onAddChild, onClose,
}: {
  node: AuditEntityNode;
  catalog: EntityTypeConfig[];
  onEdit: (node: AuditEntityNode) => void;
  onAddChild: (id: string, name: string) => void;
  onClose: () => void;
}) {
  const etConfig = resolveTypeConfig(node.entityType, catalog);
  const accentBorder = getAccentBorder(node.entityType);
  const accentDot = getAccentDot(node.entityType);
  const rs = node.inherentRiskScore;
  const riskLevel = rs >= 75 ? 'CRITICAL' : rs >= 55 ? 'HIGH' : rs >= 35 ? 'MEDIUM' : 'LOW';
  const rl = rs > 0 ? RISK_LEVEL_CONFIG[riskLevel as keyof typeof RISK_LEVEL_CONFIG] : null;
  const statusCfg = STATUS_CONFIG[node.status ?? 'ACTIVE'] ?? STATUS_CONFIG['ACTIVE'];

  const hasContactInfo = node.responsible || node.contactEmail || node.contactPhone || node.location;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: '85vh', animation: 'modalIn 0.18s ease-out' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Styled header with color accent */}
        <div className={cn('border-l-4 px-5 py-4 flex items-start justify-between gap-3 bg-slate-50', accentBorder)}>
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-2xl shrink-0">{etConfig.icon}</span>
            <div className="min-w-0">
              <h2 className="font-bold text-base text-slate-900 leading-tight">{node.name}</h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className={cn('text-[11px] px-2 py-0.5 rounded-full font-medium', etConfig.color)}>
                  {etConfig.label}
                </span>
                <span className="flex items-center gap-1 text-[11px] text-slate-500">
                  <span className={cn('w-1.5 h-1.5 rounded-full', statusCfg.dot)} />
                  {statusCfg.label}
                </span>
                {rl && rs > 0 && (
                  <span className={cn('text-[11px] px-2 py-0.5 rounded-full font-medium border', rl.bg, rl.color, rl.border)}>
                    Riesgo {rl.label}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-1.5 rounded-lg hover:bg-slate-200 transition-colors"
          >
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

          {/* Objective */}
          {node.objective && (
            <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-500 mb-1">Objetivo General</p>
              <p className="text-sm text-blue-900 leading-relaxed">{node.objective}</p>
            </div>
          )}

          {/* Description */}
          {node.description && !node.objective && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Descripción</p>
              <p className="text-sm text-slate-700 leading-relaxed">{node.description}</p>
            </div>
          )}

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2">
            {(node.employeeCount ?? 0) > 0 && (
              <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-3 text-center">
                <p className="text-xl font-bold text-slate-900">{node.employeeCount}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Empleados</p>
              </div>
            )}
            <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-3 text-center">
              <p className="text-xl font-bold text-slate-900">{node._count?.auditableUnits ?? 0}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Unid. audit.</p>
            </div>
            {(node._count?.audits ?? 0) > 0 && (
              <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-3 text-center">
                <p className="text-xl font-bold text-slate-900">{node._count?.audits}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Auditorías</p>
              </div>
            )}
          </div>

          {/* Contact / location info */}
          {hasContactInfo && (
            <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
              {node.responsible && (
                <div className="flex items-center gap-3 px-4 py-2.5">
                  <Users className="h-4 w-4 text-slate-400 shrink-0" />
                  <div>
                    <p className="text-[10px] text-slate-400">Responsable</p>
                    <p className="text-sm font-medium text-slate-800">{node.responsible}</p>
                  </div>
                </div>
              )}
              {node.contactEmail && (
                <div className="flex items-center gap-3 px-4 py-2.5">
                  <Mail className="h-4 w-4 text-slate-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] text-slate-400">Email</p>
                    <a href={`mailto:${node.contactEmail}`}
                      className="text-sm text-blue-600 hover:underline truncate block">
                      {node.contactEmail}
                    </a>
                  </div>
                </div>
              )}
              {node.contactPhone && (
                <div className="flex items-center gap-3 px-4 py-2.5">
                  <Phone className="h-4 w-4 text-slate-400 shrink-0" />
                  <div>
                    <p className="text-[10px] text-slate-400">Teléfono</p>
                    <p className="text-sm text-slate-800">{node.contactPhone}</p>
                  </div>
                </div>
              )}
              {node.location && (
                <div className="flex items-center gap-3 px-4 py-2.5">
                  <MapPin className="h-4 w-4 text-slate-400 shrink-0" />
                  <div>
                    <p className="text-[10px] text-slate-400">Ubicación</p>
                    <p className="text-sm text-slate-800">{node.location}{node.sector ? ` · ${node.sector}` : ''}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Budget */}
          {node.budget && (
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3">
              <DollarSign className="h-4 w-4 text-slate-400 shrink-0" />
              <div>
                <p className="text-[10px] text-slate-400">Presupuesto anual</p>
                <p className="text-sm font-semibold text-slate-800">{node.budget}</p>
              </div>
            </div>
          )}

          {/* Regulations */}
          {(node.applicableRegulations?.length ?? 0) > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Regulaciones aplicables</p>
              <div className="flex flex-wrap gap-1.5">
                {node.applicableRegulations!.map((r, i) => (
                  <span key={i} className="px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
                    {r}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Children summary */}
          {node.children.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                Sub-entidades ({node.children.length})
              </p>
              <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                {node.children.slice(0, 6).map(child => {
                  const childCfg = resolveTypeConfig(child.entityType, catalog);
                  return (
                    <div key={child.id} className="flex items-center gap-2.5 px-4 py-2">
                      <span className="text-sm">{childCfg.icon}</span>
                      <span className="flex-1 text-sm text-slate-700 truncate">{child.name}</span>
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', childCfg.color)}>
                        {childCfg.label}
                      </span>
                    </div>
                  );
                })}
                {node.children.length > 6 && (
                  <div className="px-4 py-2 text-[11px] text-slate-400">
                    +{node.children.length - 6} sub-entidades más
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="shrink-0 border-t border-slate-100 px-5 py-3 flex gap-2 bg-slate-50/60">
          <button
            onClick={() => { onAddChild(node.id, node.name); onClose(); }}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Agregar sub-entidad
          </button>
          <button
            onClick={() => { onEdit(node); onClose(); }}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors"
          >
            <Edit2 className="h-3.5 w-3.5" /> Editar entidad
          </button>
        </div>
      </div>

      <style>{`
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.96) translateY(8px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);   }
        }
      `}</style>
    </div>
  );
}

// ─── EntityTreeView ───────────────────────────────────────────────────────────

function EntityTreeView() {
  const { data: tree = [], isLoading } = useEntityTree();
  const { data: catalog = [] } = useEntityTypeConfigs();
  const deleteEntity = useDeleteAuditEntity();
  const [detailNode, setDetailNode] = useState<AuditEntityNode | null>(null);

  type ModalState =
    | { mode: 'add'; parentId?: string; parentName?: string }
    | { mode: 'edit'; node: AuditEntityNode }
    | null;
  const [modal, setModal] = useState<ModalState>(null);

  if (isLoading) return <div className="py-8 text-center text-slate-400 text-sm">Cargando organigrama…</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Estructura jerárquica de la organización auditada · {tree.length} entidades raíz
        </p>
        <button onClick={() => setModal({ mode: 'add' })}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700 transition-colors">
          <Plus className="h-3.5 w-3.5" /> Nueva Entidad Raíz
        </button>
      </div>

      {tree.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-200 py-16 text-center">
          <Building2 className="mx-auto h-10 w-10 text-slate-300 mb-3" />
          <p className="text-sm font-medium text-slate-500">Sin entidades registradas</p>
          <p className="text-xs text-slate-400 mt-1">Crea la primera entidad raíz de tu organigrama</p>
          <button onClick={() => setModal({ mode: 'add' })}
            className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-xs text-white hover:bg-blue-700">
            Crear Primera Entidad
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          {tree.map((root, idx) => (
            <EntityCard
              key={root.id}
              node={root}
              depth={0}
              isLast={idx === tree.length - 1}
              ancestorIsLast={[]}
              onAddChild={(id, name) => setModal({ mode: 'add', parentId: id, parentName: name })}
              onEdit={(node) => setModal({ mode: 'edit', node })}
              onDelete={(id) => { deleteEntity.mutate(id); if (detailNode?.id === id) setDetailNode(null); }}
              onSelect={(node) => setDetailNode(prev => prev?.id === node.id ? null : node)}
              selectedId={detailNode?.id}
              catalog={catalog}
            />
          ))}
        </div>
      )}

      {/* Detail overlay modal */}
      {detailNode && (
        <EntityDetailModal
          node={detailNode}
          catalog={catalog}
          onEdit={(node) => { setModal({ mode: 'edit', node }); setDetailNode(null); }}
          onAddChild={(id, name) => { setModal({ mode: 'add', parentId: id, parentName: name }); setDetailNode(null); }}
          onClose={() => setDetailNode(null)}
        />
      )}

      {modal?.mode === 'add' && (
        <EntityModal
          parentId={modal.parentId}
          parentName={modal.parentName}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.mode === 'edit' && (
        <EntityModal
          node={modal.node}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

// ─── ProcessCreateModal ───────────────────────────────────────────────────────

function ProcessCreateModal({ defaultApqcCode, onClose }: {
  defaultApqcCode?: string; onClose: () => void;
}) {
  const createProcess = useCreateAuditProcess();
  const defaultCat = APQC_CATEGORIES.find((c) => c.code === defaultApqcCode);
  const [form, setForm] = useState({
    code: '',
    name: '',
    description: '',
    apqcCode: defaultApqcCode ?? '',
    category: defaultCat?.name ?? '',
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleApqcChange = (code: string) => {
    const cat = APQC_CATEGORIES.find((c) => c.code === code);
    setForm((f) => ({ ...f, apqcCode: code, category: cat?.name ?? '' }));
  };

  const save = () => {
    createProcess.mutate(
      {
        code: form.code,
        name: form.name,
        description: form.description || undefined,
        apqcCode: form.apqcCode || undefined,
        category: form.category || undefined,
      },
      { onSuccess: onClose },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="font-semibold text-slate-900">Nuevo Proceso</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-700">Código *</label>
              <input value={form.code} onChange={(e) => set('code', e.target.value)}
                placeholder="PROC-FIN-01"
                className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Categoría APQC PCF</label>
              <select value={form.apqcCode} onChange={(e) => handleApqcChange(e.target.value)}
                className="mt-1 block w-full rounded border border-slate-300 px-2 py-2 text-sm">
                <option value="">— Sin categoría —</option>
                <optgroup label="Operativos (1.0–6.0)">
                  {APQC_CATEGORIES.filter((c) => c.type === 'operating').map((c) => (
                    <option key={c.code} value={c.code}>{c.code} {c.short}</option>
                  ))}
                </optgroup>
                <optgroup label="Soporte y Gestión (7.0–13.0)">
                  {APQC_CATEGORIES.filter((c) => c.type === 'support').map((c) => (
                    <option key={c.code} value={c.code}>{c.code} {c.short}</option>
                  ))}
                </optgroup>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-700">Nombre *</label>
            <input value={form.name} onChange={(e) => set('name', e.target.value)}
              placeholder="Gestión de Compras y Pagos"
              className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-700">Descripción</label>
            <input value={form.description} onChange={(e) => set('description', e.target.value)}
              placeholder="Descripción breve (opcional)"
              className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="border-t px-6 py-4 flex justify-end gap-3">
          <button onClick={onClose} className="rounded px-4 py-2 text-sm border border-slate-300 hover:bg-slate-50">Cancelar</button>
          <button onClick={save} disabled={!form.code || !form.name || createProcess.isPending}
            className="rounded px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60">
            {createProcess.isPending ? 'Creando…' : 'Crear Proceso'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── APQC Category Card ───────────────────────────────────────────────────────

function ApqcCategoryCard({
  category, processes, onAdd, onDelete,
}: {
  category: typeof APQC_CATEGORIES[number];
  processes: AuditProcess[];
  onAdd: (apqcCode: string) => void;
  onDelete: (id: string) => void;
}) {
  const isOperating = category.type === 'operating';
  return (
    <div className="shrink-0 w-56 rounded-lg border border-slate-200 bg-white flex flex-col shadow-sm">
      {/* Card header */}
      <div className={cn(
        'px-3 py-2.5 rounded-t-lg border-b flex items-start gap-2',
        isOperating ? 'bg-blue-50 border-blue-100' : 'bg-purple-50 border-purple-100',
      )}>
        <span className={cn('shrink-0 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded mt-0.5',
          isOperating ? 'bg-blue-200 text-blue-800' : 'bg-purple-200 text-purple-800')}>
          {category.code}
        </span>
        <span className="text-xs font-semibold text-slate-700 leading-tight flex-1">{category.short}</span>
        <button onClick={() => onAdd(category.code)}
          className={cn('shrink-0 p-0.5 rounded hover:bg-white/60 transition-colors',
            isOperating ? 'text-blue-600' : 'text-purple-600')}
          title={`Agregar proceso a ${category.short}`}>
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Processes list */}
      <div className="flex-1 px-2 py-2 space-y-1 min-h-[80px]">
        {processes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-16 text-center">
            <p className="text-[10px] text-slate-400">Sin procesos</p>
            <button onClick={() => onAdd(category.code)}
              className="mt-1 text-[10px] text-blue-500 hover:underline">
              + Agregar
            </button>
          </div>
        ) : (
          processes.map((p) => (
            <div key={p.id} className="flex items-start gap-1.5 group/proc py-0.5">
              <span className="shrink-0 text-[9px] font-mono bg-slate-100 text-slate-600 px-1 py-0.5 rounded mt-0.5">
                {p.code}
              </span>
              <span className="flex-1 text-[11px] text-slate-700 leading-tight">{p.name}</span>
              <button onClick={() => onDelete(p.id)}
                className="shrink-0 p-0.5 rounded text-slate-300 hover:text-red-400 hover:bg-red-50 opacity-0 group-hover/proc:opacity-100 transition-opacity">
                <Trash2 className="h-2.5 w-2.5" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Footer count */}
      <div className="px-3 py-1.5 border-t border-slate-100 text-[10px] text-slate-400">
        {processes.length} proceso{processes.length !== 1 ? 's' : ''}
      </div>
    </div>
  );
}

// ─── ProcessesTab (APQC PCF) ──────────────────────────────────────────────────

function ProcessesTab() {
  const { data: processes = [], isLoading } = useAuditProcesses();
  const deleteProcess = useDeleteAuditProcess();
  const [createModal, setCreateModal] = useState<string | null>(null); // null = closed, '' = no preset, '1.0' = preset

  const byCode = (code: string) => processes.filter((p) => p.apqcCode === code);
  const uncategorized = processes.filter((p) => !p.apqcCode || !APQC_CATEGORIES.find((c) => c.code === p.apqcCode));
  const operating = APQC_CATEGORIES.filter((c) => c.type === 'operating');
  const support = APQC_CATEGORIES.filter((c) => c.type === 'support');

  if (isLoading) return <div className="py-8 text-center text-slate-400 text-sm">Cargando catálogo…</div>;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-700">Catálogo de Procesos · APQC PCF v8.0</p>
          <p className="text-xs text-slate-400">Marco de clasificación de procesos compatible con estándares internacionales</p>
        </div>
        <button onClick={() => setCreateModal('')}
          className="flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700">
          <Plus className="h-3.5 w-3.5" /> Nuevo Proceso
        </button>
      </div>

      {/* Operating swimlane */}
      <div className="rounded-lg border border-blue-200 bg-blue-50/30 overflow-hidden">
        <div className="px-4 py-2.5 bg-blue-600 flex items-center gap-2">
          <span className="text-xs font-bold text-white uppercase tracking-wide">Procesos Operativos</span>
          <span className="text-[10px] text-blue-200">APQC PCF 1.0 – 6.0</span>
        </div>
        <div className="px-3 py-3 overflow-x-auto">
          <div className="flex gap-3 pb-1" style={{ minWidth: 'max-content' }}>
            {operating.map((cat) => (
              <ApqcCategoryCard
                key={cat.code}
                category={cat}
                processes={byCode(cat.code)}
                onAdd={(code) => setCreateModal(code)}
                onDelete={(id) => deleteProcess.mutate(id)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Support swimlane */}
      <div className="rounded-lg border border-purple-200 bg-purple-50/30 overflow-hidden">
        <div className="px-4 py-2.5 bg-purple-700 flex items-center gap-2">
          <span className="text-xs font-bold text-white uppercase tracking-wide">Procesos de Soporte y Gestión</span>
          <span className="text-[10px] text-purple-200">APQC PCF 7.0 – 13.0</span>
        </div>
        <div className="px-3 py-3 overflow-x-auto">
          <div className="flex gap-3 pb-1" style={{ minWidth: 'max-content' }}>
            {support.map((cat) => (
              <ApqcCategoryCard
                key={cat.code}
                category={cat}
                processes={byCode(cat.code)}
                onAdd={(code) => setCreateModal(code)}
                onDelete={(id) => deleteProcess.mutate(id)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Uncategorized */}
      {uncategorized.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200">
            <span className="text-xs font-semibold text-slate-600">Sin Categoría APQC</span>
          </div>
          <div className="divide-y divide-slate-100">
            {uncategorized.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 group hover:bg-slate-50">
                <span className="text-xs font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{p.code}</span>
                <span className="flex-1 text-sm text-slate-700">{p.name}</span>
                {p.description && <span className="text-xs text-slate-400 truncate max-w-xs">{p.description}</span>}
                <span className="text-[11px] text-slate-400">{p._count?.auditableUnits ?? 0} uds</span>
                <button onClick={() => deleteProcess.mutate(p.id)}
                  className="p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {createModal !== null && (
        <ProcessCreateModal
          defaultApqcCode={createModal || undefined}
          onClose={() => setCreateModal(null)}
        />
      )}
    </div>
  );
}

// ─── EditUnitModal ────────────────────────────────────────────────────────────

const AUDIT_TYPE_LABELS: Record<string, string> = {
  OPERATIONAL: 'Operacional',
  FINANCIAL:   'Financiero',
  IT:          'Tecnología (TI)',
  COMPLIANCE:  'Cumplimiento',
  FORENSIC:    'Forense',
  ADVISORY:    'Consultoría',
};

function EditUnitModal({ unit, onClose }: { unit: AuditableUnit; onClose: () => void }) {
  const updateUnit = useUpdateAuditableUnit();
  const [form, setForm] = useState({
    name:          unit.name ?? '',
    auditType:     unit.auditType ?? 'OPERATIONAL',
    isMandatory:   unit.isMandatory ?? false,
    mandatoryBasis: unit.mandatoryBasis ?? '',
    notes:         unit.notes ?? '',
  });
  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const save = () => {
    updateUnit.mutate(
      { id: unit.id, data: { ...form, name: form.name || undefined } },
      { onSuccess: onClose },
    );
  };

  const unitLabel = unit.name ?? `${unit.auditEntity?.name} — ${unit.auditProcess?.name}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="font-semibold text-slate-900">Editar Unidad Auditable</h2>
            <p className="text-xs text-slate-500 truncate max-w-xs">{unitLabel}</p>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-700">Nombre personalizado</label>
            <input value={form.name} onChange={(e) => set('name', e.target.value)}
              placeholder="Dejar vacío para usar 'Entidad — Proceso'"
              className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-700">Tipo de Auditoría</label>
            <select value={form.auditType} onChange={(e) => set('auditType', e.target.value)}
              className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm">
              {Object.entries(AUDIT_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3 py-1">
            <input type="checkbox" id="edit-mandatory" checked={form.isMandatory}
              onChange={(e) => set('isMandatory', e.target.checked)}
              className="h-4 w-4 rounded accent-rose-600" />
            <label htmlFor="edit-mandatory" className="text-sm text-slate-700 cursor-pointer">
              Auditoría Mandatoria (ley / norma regulatoria)
            </label>
          </div>
          {form.isMandatory && (
            <div>
              <label className="text-xs font-medium text-slate-700">Base legal / regulatoria</label>
              <input value={form.mandatoryBasis} onChange={(e) => set('mandatoryBasis', e.target.value)}
                placeholder="Ej: Ley UAF Art. 12 / Norma CMF N°2024-01"
                className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm" />
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-slate-700">Notas internas</label>
            <textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)}
              className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm resize-none"
              placeholder="Observaciones, contexto o justificación…" />
          </div>
        </div>
        <div className="border-t px-6 py-4 flex justify-end gap-3">
          <button onClick={onClose} className="rounded px-4 py-2 text-sm border border-slate-300 hover:bg-slate-50">Cancelar</button>
          <button onClick={save} disabled={updateUnit.isPending}
            className="rounded px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 flex items-center gap-1.5">
            <Save className="h-3.5 w-3.5" />
            {updateUnit.isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── AuditableUnitsTab ────────────────────────────────────────────────────────

function AuditableUnitsTab() {
  const { data: units = [], isLoading } = useAuditableUnits();
  const { data: entities } = useAuditUniverse();
  const { data: processes = [] } = useAuditProcesses();
  const createUnit = useCreateAuditableUnit();
  const deleteUnit = useDeleteAuditableUnit();
  const [scoringUnit, setScoringUnit] = useState<AuditableUnit | null>(null);
  const [editUnit, setEditUnit] = useState<AuditableUnit | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showScoreInfo, setShowScoreInfo] = useState(false);
  const [form, setForm] = useState({
    auditEntityId: '', auditProcessId: '', auditType: 'OPERATIONAL',
    isMandatory: false, mandatoryBasis: '',
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-700">Unidades Auditables</p>
          <p className="text-xs text-slate-400">Combinación Entidad × Proceso — el objeto que entra al Plan Anual</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700">
          <Plus className="h-3.5 w-3.5" /> Nueva Unidad
        </button>
      </div>

      {/* Scoring explanation panel */}
      <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
        <button onClick={() => setShowScoreInfo(!showScoreInfo)}
          className="flex items-center gap-2 w-full text-left">
          <Info className="h-4 w-4 text-blue-500 shrink-0" />
          <span className="text-xs font-semibold text-blue-800">¿Cómo funciona el puntaje de riesgo?</span>
          <ChevronDown className={cn('h-3.5 w-3.5 text-blue-400 ml-auto transition-transform', showScoreInfo && 'rotate-180')} />
        </button>
        {showScoreInfo && (
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-blue-900">
            <div className="rounded bg-white/70 p-3 space-y-1.5">
              <p className="font-bold text-blue-700">Grupo A — Riesgo Residual (70%)</p>
              <p>El <strong>auditor define</strong> 3 factores con sliders 1–5:</p>
              <ul className="space-y-0.5 pl-3 list-disc text-blue-800">
                <li><strong>Impacto</strong> — magnitud del daño si el riesgo ocurre</li>
                <li><strong>Probabilidad</strong> — frecuencia estimada de ocurrencia</li>
                <li><strong>Madurez de Controles</strong> — calidad de controles existentes</li>
              </ul>
              <p className="text-[10px] text-blue-600 font-mono bg-blue-100 rounded px-2 py-1">
                Inherente = Impacto × Probabilidad (1–25)<br />
                Residual = Inherente × (1 − Madurez/5)<br />
                Normalizado = (Residual / 25) × 100
              </p>
            </div>
            <div className="rounded bg-white/70 p-3 space-y-1.5">
              <p className="font-bold text-blue-700">Grupo B — Factores Contextuales (30%)</p>
              <p>El <strong>auditor define</strong> 6 factores adicionales:</p>
              <ul className="space-y-0.5 pl-3 list-disc text-blue-800">
                <li>Materialidad financiera del área</li>
                <li>Alineación al Plan Estratégico</li>
                <li>Alineación al Plan Operativo</li>
                <li>Antecedentes de fraude / denuncias</li>
                <li>Solicitud de la dirección / junta</li>
                <li>Velocidad de cambio (M&A, TI, etc.)</li>
              </ul>
              <p className="text-[10px] text-blue-600 font-mono bg-blue-100 rounded px-2 py-1">
                Score Final = A×0.70 + B×0.30<br />
                CRÍTICO ≥75 · ALTO ≥55 · MEDIO ≥35 · BAJO &lt;35
              </p>
            </div>
            <div className="col-span-2 rounded bg-amber-50 border border-amber-200 px-3 py-2 text-amber-800">
              <strong>¿Es automático o manual?</strong> — El <em>usuario define los 9 factores</em> mediante sliders y el <em>sistema calcula el score final</em> automáticamente. Usa el botón <FlaskConical className="inline h-3.5 w-3.5 mx-0.5" /><strong>Evaluar Riesgo</strong> en cada unidad para abrir el formulario de evaluación.
            </div>
          </div>
        )}
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-blue-900">Nueva Unidad Auditable</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-700">Entidad</label>
              <select value={form.auditEntityId} onChange={(e) => setForm((f) => ({ ...f, auditEntityId: e.target.value }))}
                className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5 text-sm">
                <option value="">Seleccionar…</option>
                {(entities?.data ?? []).map((e: any) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Proceso</label>
              <select value={form.auditProcessId} onChange={(e) => setForm((f) => ({ ...f, auditProcessId: e.target.value }))}
                className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5 text-sm">
                <option value="">Seleccionar…</option>
                {processes.map((p) => (
                  <option key={p.id} value={p.id}>[{p.code}] {p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Tipo de Auditoría</label>
              <select value={form.auditType} onChange={(e) => setForm((f) => ({ ...f, auditType: e.target.value }))}
                className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5 text-sm">
                {Object.entries(AUDIT_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div className="flex items-start gap-2 pt-5">
              <input type="checkbox" id="mandatory" checked={form.isMandatory}
                onChange={(e) => setForm((f) => ({ ...f, isMandatory: e.target.checked }))} className="mt-0.5" />
              <label htmlFor="mandatory" className="text-xs text-slate-700 cursor-pointer">Mandatorio (ley/norma)</label>
            </div>
            {form.isMandatory && (
              <div className="col-span-2">
                <label className="text-xs font-medium text-slate-700">Base legal / regulatoria</label>
                <input value={form.mandatoryBasis} onChange={(e) => setForm((f) => ({ ...f, mandatoryBasis: e.target.value }))}
                  placeholder="Ej: Ley UAF Art. 12 / Norma CMF N°2024-01"
                  className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowCreate(false)} className="rounded px-3 py-1.5 text-xs border border-slate-300 hover:bg-white">Cancelar</button>
            <button
              disabled={!form.auditEntityId || !form.auditProcessId || createUnit.isPending}
              onClick={() => createUnit.mutate(form as any, { onSuccess: () => { setShowCreate(false); setForm({ auditEntityId: '', auditProcessId: '', auditType: 'OPERATIONAL', isMandatory: false, mandatoryBasis: '' }); } })}
              className="rounded px-3 py-1.5 text-xs bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60">
              Crear
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="py-8 text-center text-slate-400 text-sm">Cargando…</div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Entidad</th>
                <th className="px-4 py-3 text-left">Proceso</th>
                <th className="px-4 py-3 text-left">Tipo</th>
                <th className="px-4 py-3 text-center">Score / Riesgo</th>
                <th className="px-4 py-3 text-center">Cobertura</th>
                <th className="px-4 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {units.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center">
                  <p className="text-sm text-slate-400">Sin unidades auditables.</p>
                  <p className="text-xs text-slate-300 mt-1">Crea la primera combinación Entidad × Proceso.</p>
                </td></tr>
              )}
              {units.map((u) => {
                const a = u.assessments?.[0];
                const rl = a ? RISK_LEVEL_CONFIG[a.riskLevel as keyof typeof RISK_LEVEL_CONFIG] : null;
                const overdue = (a?.coverageGapDays ?? 0) > 0;
                return (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">
                        {u.name ? (
                          <>{u.name}<span className="ml-1.5 text-[10px] text-slate-400 font-normal">{u.auditEntity?.name}</span></>
                        ) : u.auditEntity?.name}
                      </p>
                      {u.isMandatory && (
                        <span className="inline-block mt-0.5 text-[10px] px-1 py-0.5 rounded bg-rose-100 text-rose-700 font-semibold">
                          MANDATORIO
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-slate-700">{u.auditProcess?.name}</p>
                      <p className="text-[11px] text-slate-400">{u.auditProcess?.code}
                        {u.auditProcess?.category && <> · {u.auditProcess.category}</>}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                        {AUDIT_TYPE_LABELS[u.auditType] ?? u.auditType}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {a ? (
                        <div className="space-y-0.5">
                          <div className="flex items-center justify-center gap-1">
                            <span className={cn('text-sm font-bold', rl?.color)}>{a.totalScore.toFixed(1)}</span>
                            <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-semibold', rl?.bg, rl?.color)}>
                              {rl?.label}
                            </span>
                          </div>
                          <div className="h-1 rounded-full bg-slate-200 w-20 mx-auto">
                            <div className={cn('h-1 rounded-full',
                              a.totalScore >= 75 ? 'bg-red-500' :
                              a.totalScore >= 55 ? 'bg-orange-400' :
                              a.totalScore >= 35 ? 'bg-amber-400' : 'bg-green-400'
                            )} style={{ width: `${Math.min(a.totalScore, 100)}%` }} />
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => setScoringUnit(u)}
                          className="text-xs text-blue-500 hover:underline">
                          + Evaluar riesgo
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {overdue
                        ? <span className="text-xs text-orange-600 font-medium">⚠ {a!.coverageGapDays}d vencida</span>
                        : a?.nextRecommendedDate
                          ? <span className="text-xs text-green-600">✓ Al día</span>
                          : <span className="text-xs text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => setScoringUnit(u)}
                          className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium bg-blue-50 text-blue-700 hover:bg-blue-100"
                          title="Evaluar / actualizar score de riesgo">
                          <FlaskConical className="h-3 w-3" />
                          {a ? 'Riesgo' : 'Evaluar'}
                        </button>
                        <button onClick={() => setEditUnit(u)}
                          className="rounded p-1.5 hover:bg-amber-50 text-slate-400 hover:text-amber-600"
                          title="Editar unidad">
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => deleteUnit.mutate(u.id)}
                          className="rounded p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-500"
                          title="Eliminar">
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

      {scoringUnit && <ScoringModal unit={scoringUnit} onClose={() => setScoringUnit(null)} />}
      {editUnit    && <EditUnitModal unit={editUnit}   onClose={() => setEditUnit(null)} />}
    </div>
  );
}

// ─── UniversePage ─────────────────────────────────────────────────────────────

type Tab = 'entities' | 'processes' | 'units' | 'candidates';

export default function UniversePage() {
  const [tab, setTab] = useState<Tab>('entities');
  const { data: riskSummary } = useRiskSummary();

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'entities',   label: 'Organigrama',          icon: Building2 },
    { id: 'processes',  label: 'Catálogo de Procesos', icon: Layers },
    { id: 'units',      label: 'Unidades Auditables',  icon: FlaskConical },
    { id: 'candidates', label: 'Candidatas al Plan',   icon: Target },
  ];

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Universo de Auditoría"
        breadcrumbs={[{ label: 'Planificación Anual' }, { label: 'Universo de Auditoría' }]}
      />
      <div className="flex-1 overflow-auto p-6 space-y-5">
        {/* Risk summary */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Crítico', value: riskSummary?.CRITICAL ?? 0, color: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-200'    },
            { label: 'Alto',    value: riskSummary?.HIGH    ?? 0, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
            { label: 'Medio',   value: riskSummary?.MEDIUM  ?? 0, color: 'text-amber-600',  bg: 'bg-amber-50',  border: 'border-amber-200'  },
            { label: 'Bajo',    value: riskSummary?.LOW     ?? 0, color: 'text-green-600',  bg: 'bg-green-50',  border: 'border-green-200'  },
          ].map((s) => (
            <div key={s.label} className={cn('rounded-lg border p-4 text-center', s.bg, s.border)}>
              <p className={cn('text-2xl font-bold', s.color)}>{s.value}</p>
              <p className="text-xs text-slate-600 mt-0.5">Riesgo {s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-200">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                tab === t.id
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700',
              )}>
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {tab === 'entities'   && <EntityTreeView />}
        {tab === 'processes'  && <ProcessesTab />}
        {tab === 'units'      && <AuditableUnitsTab />}
        {tab === 'candidates' && <PlanCandidatesView />}
      </div>
    </div>
  );
}
