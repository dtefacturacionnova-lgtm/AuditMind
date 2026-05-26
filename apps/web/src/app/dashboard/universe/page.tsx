'use client';
import { useState } from 'react';
import {
  Plus, Trash2, ChevronRight, ChevronDown, Edit2,
  Layers, FlaskConical, X, Save, Target, Building2, Info,
  Users, MapPin, Mail, Phone, DollarSign,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { useRiskSummary } from '@/hooks/useAuditUniverse';
import {
  useEntityTree, useCreateAuditEntity, useUpdateAuditEntity, useDeleteAuditEntity,
  useAuditProcesses, useCreateAuditProcess, useDeleteAuditProcess,
  useAuditableUnits, useCreateAuditableUnit, useUpdateAuditableUnit, useDeleteAuditableUnit,
  useUpsertAssessment, usePlanCandidates,
  ENTITY_TYPE_CONFIG, ORG_ENTITY_TYPES, RISK_LEVEL_CONFIG,
  type AuditEntityNode, type AuditProcess, type AuditableUnit,
} from '@/hooks/useAuditUniverse2';
import { useEntityTypeConfigs, useProcessCategoryConfigs, type EntityTypeConfig, type ProcessCategoryConfig } from '@/hooks/useCatalogs';
import { useStrategicObjectives } from '@/hooks/useStrategic';
import { cn } from '@/lib/utils';

// ─── Tipos de Riesgo ──────────────────────────────────────────────────────────
const RISK_TYPE_OPTIONS = [
  { value: 'FINANCIERO',    label: 'Riesgo Financiero' },
  { value: 'OPERACIONAL',   label: 'Riesgo Operacional' },
  { value: 'TECNOLOGIA',    label: 'Riesgo de Tecnología' },
  { value: 'CUMPLIMIENTO',  label: 'Riesgo de Cumplimiento' },
  { value: 'FRAUDE',        label: 'Riesgo de Fraude' },
  { value: 'ESTRATEGICO',   label: 'Riesgo Estratégico' },
  { value: 'LEGAL',         label: 'Riesgo Legal' },
  { value: 'ESG',           label: 'Riesgo ESG / Medioambiental' },
];

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
    staffTurnoverScore:    existing?.staffTurnoverScore    ?? 1,
    coverageHistoryScore:  existing?.coverageHistoryScore  ?? 1,
    lastAuditDate:         existing?.lastAuditDate?.slice(0, 10) ?? '',
    lastAuditOpinion:      existing?.lastAuditOpinion ?? '',
    recommendedFreqMonths: existing?.recommendedFreqMonths ?? 12,
    notes:                 existing?.notes ?? '',
  });
  const set = (k: string, v: number | string) => setForm((f) => ({ ...f, [k]: v }));

  const inherent = form.impactScore * form.likelihoodScore;
  const residual = inherent * (1 - form.controlMaturityScore / 5);
  const residualNorm = (residual / 25) * 100;

  // Grupo B: suma ponderada (pesos IIA/Big 4: materialidad 20%, alin. PE 20%, alin. PO 15%, fraude 15%, dirección 10%, rotación 10%, cobertura 10%)
  const GROUP_B_WEIGHTS: Record<string, number> = {
    materialityScore: 0.20, strategicAlignScore: 0.20, operationalAlignScore: 0.15,
    fraudHistoryScore: 0.15, managementReqScore: 0.10, staffTurnoverScore: 0.10, coverageHistoryScore: 0.10,
  };
  const secondaryWeighted = Object.entries(GROUP_B_WEIGHTS).reduce((sum, [key, w]) => {
    const score = (form as unknown as Record<string, number>)[key] ?? 1;
    return sum + ((score - 1) / 4) * 100 * w;
  }, 0);
  const totalScore = residualNorm * 0.30 + secondaryWeighted * 0.70;
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
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Grupo A — Riesgo Residual (peso 30%)</h3>
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
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Grupo B — Factores Contextuales (peso 70%)</h3>
            <p className="text-[10px] text-slate-400 mb-3">Suma ponderada: Materialidad 20% · Alin.PE 20% · Alin.PO 15% · Fraude 15% · Dirección 10% · Rotación 10% · Cobertura 10%</p>
            <div className="space-y-4">
              <ScoreSlider label="Materialidad Financiera (20%)" hint="Tamaño del presupuesto / volumen de transacciones del área" value={form.materialityScore} onChange={(v) => set('materialityScore', v)} />
              <ScoreSlider label="Alineación al Plan Estratégico (20%)" hint="¿Esta área es crítica para los objetivos estratégicos?" value={form.strategicAlignScore} onChange={(v) => set('strategicAlignScore', v)} />
              <ScoreSlider label="Alineación al Plan Operativo (15%)" hint="¿Qué tan relevante es para la operación diaria?" value={form.operationalAlignScore} onChange={(v) => set('operationalAlignScore', v)} />
              <ScoreSlider label="Antecedentes de Fraude / Denuncias (15%)" hint="Historial de fraudes, investigaciones o alertas de ética" value={form.fraudHistoryScore} onChange={(v) => set('fraudHistoryScore', v)} />
              <ScoreSlider label="Solicitud de la Dirección (10%)" hint="¿La gerencia o junta ha pedido expresamente esta auditoría?" value={form.managementReqScore} onChange={(v) => set('managementReqScore', v)} />
              <ScoreSlider label="Rotación de Personal (10%)" hint="Cambios recientes de personal clave, nueva gerencia, M&A, restructuración" value={form.staffTurnoverScore} onChange={(v) => set('staffTurnoverScore', v)} />
              <ScoreSlider label="Historial de Cobertura (10%)" hint="Tiempo transcurrido desde la última auditoría respecto a la frecuencia recomendada" value={form.coverageHistoryScore} onChange={(v) => set('coverageHistoryScore', v)} />
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
  const { data, isLoading, isError } = usePlanCandidates(currentYear);
  if (isLoading) return <div className="p-8 text-center text-slate-400 text-sm">Cargando candidatas…</div>;
  if (isError || !data) return (
    <div className="p-10 text-center text-slate-400 text-sm space-y-1">
      <p className="font-medium text-slate-500">No se pudo cargar las candidatas.</p>
      <p className="text-xs">Verifica que existan unidades auditables creadas.</p>
    </div>
  );

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
          {data.candidates.length === 0 && (
            <div className="px-4 py-10 text-center">
              <p className="text-sm text-slate-400">Sin candidatas para {currentYear}.</p>
              <p className="text-xs text-slate-300 mt-1">Crea unidades auditables en la pestaña anterior.</p>
            </div>
          )}
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

function ProcessCreateModal({ defaultApqcCode, catalogCats, onClose }: {
  defaultApqcCode?: string;
  catalogCats: ProcessCategoryConfig[];
  onClose: () => void;
}) {
  const createProcess = useCreateAuditProcess();
  const defaultCat = catalogCats.find(c => c.code === defaultApqcCode);
  const [form, setForm] = useState({
    code: '', name: '', description: '',
    apqcCode: defaultApqcCode ?? '',
    category: defaultCat?.name ?? '',
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleCatChange = (code: string) => {
    const cat = catalogCats.find(c => c.code === code);
    setForm(f => ({ ...f, apqcCode: code, category: cat?.name ?? '' }));
  };

  const save = () => createProcess.mutate(
    { code: form.code, name: form.name, description: form.description || undefined,
      apqcCode: form.apqcCode || undefined, category: form.category || undefined },
    { onSuccess: onClose },
  );

  const strategicCats = catalogCats.filter(c => c.type === 'STRATEGIC');
  const operatingCats = catalogCats.filter(c => c.type === 'OPERATING');
  const supportCats   = catalogCats.filter(c => c.type === 'SUPPORT');

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
              <input value={form.code} onChange={e => set('code', e.target.value)}
                placeholder="PROC-FIN-01"
                className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Categoría</label>
              <select value={form.apqcCode} onChange={e => handleCatChange(e.target.value)}
                className="mt-1 block w-full rounded border border-slate-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— Sin categoría —</option>
                {strategicCats.length > 0 && (
                  <optgroup label="Estratégicos">
                    {strategicCats.map(c => <option key={c.code} value={c.code}>{c.code} · {c.name}</option>)}
                  </optgroup>
                )}
                {operatingCats.length > 0 && (
                  <optgroup label="Misionales / Operativos">
                    {operatingCats.map(c => <option key={c.code} value={c.code}>{c.code} · {c.name}</option>)}
                  </optgroup>
                )}
                {supportCats.length > 0 && (
                  <optgroup label="Soporte / Gestión">
                    {supportCats.map(c => <option key={c.code} value={c.code}>{c.code} · {c.name}</option>)}
                  </optgroup>
                )}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-700">Nombre *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="Gestión de Compras y Pagos"
              className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-700">Descripción</label>
            <input value={form.description} onChange={e => set('description', e.target.value)}
              placeholder="Descripción breve (opcional)"
              className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div className="border-t px-6 py-4 flex justify-end gap-3">
          <button onClick={onClose} className="rounded px-4 py-2 text-sm border border-slate-300 hover:bg-slate-50">Cancelar</button>
          <button onClick={save} disabled={!form.code || !form.name || createProcess.isPending}
            className="rounded px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 flex items-center gap-1.5">
            <Save className="h-3.5 w-3.5" />
            {createProcess.isPending ? 'Creando…' : 'Crear Proceso'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Process Map sub-components ───────────────────────────────────────────────

/** Rectangular card — used for Strategic and Support bands */
function ProcessCategoryCard({
  cat, processes, theme, onAdd, onDelete,
}: {
  cat: ProcessCategoryConfig;
  processes: AuditProcess[];
  theme: 'strategic' | 'support';
  onAdd: () => void;
  onDelete: (id: string) => void;
}) {
  const t = theme === 'strategic' ? {
    card:  'border-[#1d3f62] bg-[#1a3a5c]',
    code:  'bg-[#234f7a] text-blue-200 border-[#2d5f8a]',
    title: 'text-blue-50',
    add:   'text-blue-300 hover:bg-white/10 hover:text-white',
    proc:  'bg-[#234f7a]/70 border-[#2d5f8a] text-blue-100',
    pcode: 'text-blue-300',
    del:   'text-blue-400 hover:text-red-300 hover:bg-red-900/20',
    empty: 'border-blue-500/30 text-blue-400/60',
    count: 'text-blue-400/60',
  } : {
    card:  'border-purple-200 bg-white',
    code:  'bg-purple-100 text-purple-700 border-purple-200',
    title: 'text-slate-800',
    add:   'text-purple-500 hover:bg-purple-50',
    proc:  'bg-purple-50 border-purple-200 text-slate-700',
    pcode: 'text-purple-500',
    del:   'text-slate-300 hover:text-red-500 hover:bg-red-50',
    empty: 'border-purple-200 text-purple-400',
    count: 'text-slate-400',
  };

  return (
    <div className={cn('rounded-xl border p-3 flex flex-col gap-2 shrink-0', t.card)} style={{ width: '172px' }}>
      <div className="flex items-start justify-between gap-1">
        <div className="flex-1 min-w-0">
          <span className={cn('inline-block text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border mb-1', t.code)}>
            {cat.code}
          </span>
          <p className={cn('text-[11px] font-semibold leading-snug', t.title)}>{cat.name}</p>
        </div>
        <button onClick={onAdd} className={cn('p-1 rounded transition-colors shrink-0', t.add)} title="Agregar proceso">
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex flex-col gap-1 flex-1">
        {processes.length === 0 ? (
          <button onClick={onAdd}
            className={cn('text-[10px] py-2 rounded-lg border border-dashed text-center opacity-60 hover:opacity-100 transition-opacity', t.empty)}>
            + Agregar proceso
          </button>
        ) : (
          processes.map(p => (
            <div key={p.id} className={cn('flex items-center gap-1 rounded-lg border px-1.5 py-1 group/p', t.proc)}>
              <span className={cn('text-[9px] font-mono shrink-0', t.pcode)}>{p.code}</span>
              <span className="flex-1 text-[10px] font-medium leading-tight truncate">{p.name}</span>
              <button onClick={() => onDelete(p.id)}
                className={cn('opacity-0 group-hover/p:opacity-100 p-0.5 rounded shrink-0 transition-all', t.del)}>
                <Trash2 className="h-2.5 w-2.5" />
              </button>
            </div>
          ))
        )}
      </div>
      <div className={cn('text-[10px]', t.count)}>
        {processes.length} proceso{processes.length !== 1 ? 's' : ''}
      </div>
    </div>
  );
}

/** Chevron/arrow-shaped card — used for Operating band value-chain */
function OperatingChevronCard({
  cat, processes, onAdd, onDelete, isFirst, isLast,
}: {
  cat: ProcessCategoryConfig;
  processes: AuditProcess[];
  onAdd: () => void;
  onDelete: (id: string) => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const N = 14; // notch size in px
  const clipPath =
    isFirst && isLast ? 'none'
    : isFirst  ? `polygon(0 0, calc(100% - ${N}px) 0, 100% 50%, calc(100% - ${N}px) 100%, 0 100%)`
    : isLast   ? `polygon(${N}px 0, 100% 0, 100% 100%, ${N}px 100%, 0 50%)`
    : `polygon(${N}px 0, calc(100% - ${N}px) 0, 100% 50%, calc(100% - ${N}px) 100%, ${N}px 100%, 0 50%)`;

  return (
    <div
      className="bg-[#dbeafe] flex flex-col gap-2 relative"
      style={{
        clipPath,
        width: '176px',
        minWidth: '176px',
        paddingTop: '10px',
        paddingBottom: '10px',
        paddingLeft: isFirst ? '10px' : `${N + 6}px`,
        paddingRight: isLast ? '10px' : `${N + 6}px`,
        filter: 'drop-shadow(1px 0 0 #bfdbfe) drop-shadow(-1px 0 0 #bfdbfe) drop-shadow(0 1px 0 #bfdbfe) drop-shadow(0 -1px 0 #bfdbfe)',
      }}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="flex-1 min-w-0">
          <span className="inline-block text-[9px] font-mono font-bold bg-blue-200 text-blue-700 px-1.5 py-0.5 rounded mb-1">
            {cat.code}
          </span>
          <p className="text-[11px] font-semibold text-slate-800 leading-snug">{cat.name}</p>
        </div>
        <button onClick={onAdd}
          className="p-0.5 rounded text-blue-500 hover:bg-blue-200 transition-colors shrink-0" title="Agregar proceso">
          <Plus className="h-3 w-3" />
        </button>
      </div>
      <div className="flex flex-col gap-1 flex-1">
        {processes.length === 0 ? (
          <button onClick={onAdd}
            className="text-[10px] py-1.5 rounded border border-dashed border-blue-300 text-blue-400 text-center opacity-70 hover:opacity-100 transition-opacity">
            + Agregar
          </button>
        ) : (
          <>
            {processes.slice(0, 4).map(p => (
              <div key={p.id} className="flex items-center gap-1 bg-white/70 rounded px-1.5 py-0.5 group/p border border-blue-200/60">
                <span className="text-[9px] font-mono text-blue-500 shrink-0">{p.code}</span>
                <span className="flex-1 text-[10px] font-medium text-slate-700 truncate">{p.name}</span>
                <button onClick={() => onDelete(p.id)}
                  className="opacity-0 group-hover/p:opacity-100 text-red-400 shrink-0 transition-opacity">
                  <Trash2 className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
            {processes.length > 4 && (
              <span className="text-[9px] text-blue-500/70 text-center">+{processes.length - 4} más</span>
            )}
          </>
        )}
      </div>
      <div className="text-[10px] text-blue-500/60">
        {processes.length} proceso{processes.length !== 1 ? 's' : ''}
      </div>
    </div>
  );
}

/** Thin connector row between bands with directional arrows */
function BandConnector({ label, arrowUp = false }: { label: string; arrowUp?: boolean }) {
  const arrow = arrowUp ? '↑' : '↓';
  return (
    <div className="flex items-center justify-center gap-6 py-2.5 bg-slate-50 border-y border-slate-100">
      <span className="text-lg text-slate-300 select-none">{arrow}</span>
      <span className="text-[10px] text-slate-400 italic">{label}</span>
      <span className="text-lg text-slate-300 select-none">{arrow}</span>
    </div>
  );
}

// ─── ProcessesTab — Visual Process Map ───────────────────────────────────────

function ProcessesTab() {
  const { data: processes = [], isLoading: loadingProcs } = useAuditProcesses();
  const { data: catalogCats = [], isLoading: loadingCats } = useProcessCategoryConfigs();
  const deleteProcess = useDeleteAuditProcess();
  const [createModal, setCreateModal] = useState<string | null>(null);

  const strategicCats = catalogCats.filter(c => c.type === 'STRATEGIC');
  const operatingCats = catalogCats.filter(c => c.type === 'OPERATING');
  const supportCats   = catalogCats.filter(c => c.type === 'SUPPORT');

  const byCategory = (code: string) => processes.filter(p => p.apqcCode === code);
  const uncategorized = processes.filter(p => !p.apqcCode || !catalogCats.some(c => c.code === p.apqcCode));

  const stratCount = strategicCats.reduce((s, c) => s + byCategory(c.code).length, 0);
  const operCount  = operatingCats.reduce((s, c)  => s + byCategory(c.code).length, 0);
  const suppCount  = supportCats.reduce((s, c)   => s + byCategory(c.code).length, 0);

  if (loadingProcs || loadingCats) {
    return <div className="py-8 text-center text-slate-400 text-sm">Cargando mapa de procesos…</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-700">Mapa de Procesos</p>
          <p className="text-xs text-slate-400">
            {processes.length} proceso{processes.length !== 1 ? 's' : ''} distribuidos en {catalogCats.length} categorías
          </p>
        </div>
        <button onClick={() => setCreateModal('')}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700 transition-colors">
          <Plus className="h-3.5 w-3.5" /> Nuevo Proceso
        </button>
      </div>

      {/* ── CANVAS ── */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #cbd5e1', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>

        {/* ══════════ STRATEGIC BAND ══════════ */}
        <div className="bg-[#0f2d4a]">
          <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-1 h-7 rounded-full bg-blue-400" />
              <div>
                <p className="text-white text-xs font-bold uppercase tracking-widest">Procesos Estratégicos</p>
                <p className="text-blue-300/80 text-[10px]">Gobierno corporativo · Dirección · Planeación</p>
              </div>
            </div>
            <span className="text-[10px] text-blue-300 bg-[#1a3f5f] px-2.5 py-1 rounded-full border border-blue-700/40">
              {stratCount} proceso{stratCount !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="px-5 py-4 overflow-x-auto">
            {strategicCats.length === 0 ? (
              <div className="flex items-center gap-2 text-blue-400/50 text-xs py-2">
                <Target className="h-4 w-4" />
                <span>Sin categorías estratégicas · </span>
                <a href="/dashboard/admin/catalogs" className="underline hover:text-blue-300 transition-colors">
                  Configurar en Catálogos →
                </a>
              </div>
            ) : (
              <div className="flex gap-3" style={{ minWidth: 'max-content' }}>
                {strategicCats.map(cat => (
                  <ProcessCategoryCard
                    key={cat.id} cat={cat} theme="strategic"
                    processes={byCategory(cat.code)}
                    onAdd={() => setCreateModal(cat.code)}
                    onDelete={id => deleteProcess.mutate(id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <BandConnector label="Dirección estratégica hacia procesos misionales" />

        {/* ══════════ OPERATING BAND ══════════ */}
        <div style={{ background: 'linear-gradient(180deg, rgba(255,237,213,0.35) 0%, rgba(255,251,235,0.45) 100%)' }}>
          <div className="px-5 pt-4 pb-3 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(249,115,22,0.12)' }}>
            <div className="flex items-center gap-3">
              <div className="w-1 h-7 rounded-full bg-orange-400" />
              <div>
                <p className="text-orange-800 text-xs font-bold uppercase tracking-widest">Procesos Misionales / Operativos</p>
                <p className="text-orange-500/80 text-[10px]">Cadena de valor principal · flujo de izquierda a derecha →</p>
              </div>
            </div>
            <span className="text-[10px] text-orange-700 bg-orange-100 px-2.5 py-1 rounded-full border border-orange-200">
              {operCount} proceso{operCount !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="px-5 py-4 overflow-x-auto">
            {operatingCats.length === 0 ? (
              <div className="py-3 text-orange-400/60 text-xs text-center">Sin categorías operativas configuradas</div>
            ) : (
              <div className="flex items-stretch gap-0.5" style={{ minWidth: 'max-content' }}>
                {operatingCats.map((cat, i) => (
                  <OperatingChevronCard
                    key={cat.id} cat={cat}
                    processes={byCategory(cat.code)}
                    onAdd={() => setCreateModal(cat.code)}
                    onDelete={id => deleteProcess.mutate(id)}
                    isFirst={i === 0}
                    isLast={i === operatingCats.length - 1}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <BandConnector label="Procesos de soporte habilitan los procesos misionales" arrowUp />

        {/* ══════════ SUPPORT BAND ══════════ */}
        <div style={{ background: 'rgba(245,243,255,0.5)' }}>
          <div className="px-5 pt-4 pb-3 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(147,51,234,0.08)' }}>
            <div className="flex items-center gap-3">
              <div className="w-1 h-7 rounded-full bg-purple-400" />
              <div>
                <p className="text-purple-800 text-xs font-bold uppercase tracking-widest">Procesos de Soporte / Gestión</p>
                <p className="text-purple-400/80 text-[10px]">Habilitan, dan soporte y gestionan los recursos de la organización</p>
              </div>
            </div>
            <span className="text-[10px] text-purple-700 bg-purple-100 px-2.5 py-1 rounded-full border border-purple-200">
              {suppCount} proceso{suppCount !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="px-5 py-4">
            {supportCats.length === 0 ? (
              <div className="py-3 text-purple-400/60 text-xs text-center">Sin categorías de soporte configuradas</div>
            ) : (
              <div className="flex flex-wrap gap-3">
                {supportCats.map(cat => (
                  <ProcessCategoryCard
                    key={cat.id} cat={cat} theme="support"
                    processes={byCategory(cat.code)}
                    onAdd={() => setCreateModal(cat.code)}
                    onDelete={id => deleteProcess.mutate(id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

      </div>{/* end canvas */}

      {/* Uncategorized */}
      {uncategorized.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50 border-b">
            <span className="text-xs font-semibold text-slate-600">Sin Categoría</span>
          </div>
          <div className="divide-y divide-slate-100">
            {uncategorized.map(p => (
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
          catalogCats={catalogCats}
          onClose={() => setCreateModal(null)}
        />
      )}
    </div>
  );
}

// ─── EditUnitModal ────────────────────────────────────────────────────────────

const AUDIT_TYPE_LABELS: Record<string, string> = {
  FINANCIERA:      'Auditoría Financiera',
  OPERACIONAL:     'Auditoría Operacional',
  GESTION:         'Auditoría de Gestión',
  TECNOLOGIA:      'Auditoría de Tecnología',
  EXAMEN_ESPECIAL: 'Examen Especial',
  CONSULTORIA:     'Consultoría',
  FORENSE:         'Investigación Forense',
  FRAUDE:          'Fraude',
  CALIDAD:         'Revisión de Calidad',
  OTROS:           'Otros',
  // legado — mantener para registros anteriores
  OPERATIONAL:     'Operacional',
  FINANCIAL:       'Financiero',
  IT:              'Tecnología (TI)',
  COMPLIANCE:      'Cumplimiento',
  FORENSIC:        'Forense',
  ADVISORY:        'Consultoría (legacy)',
};

// Helper: flattens recursive entity tree for <select> display with indentation
function flattenTree(
  nodes: AuditEntityNode[],
  depth = 0,
): Array<{ id: string; label: string }> {
  const result: Array<{ id: string; label: string }> = [];
  for (const node of nodes) {
    const indent = '    '.repeat(depth);
    const prefix = depth > 0 ? '└ ' : '';
    result.push({ id: node.id, label: `${indent}${prefix}${node.name}` });
    if (node.children && node.children.length > 0) {
      result.push(...flattenTree(node.children, depth + 1));
    }
  }
  return result;
}

function EditUnitModal({ unit, onClose }: { unit: AuditableUnit; onClose: () => void }) {
  const updateUnit = useUpdateAuditableUnit();
  const { data: objectives = [] } = useStrategicObjectives();
  const [form, setForm] = useState({
    name:           unit.name ?? '',
    auditType:      unit.auditType ?? 'OPERACIONAL',
    isMandatory:    unit.isMandatory ?? false,
    mandatoryBasis: unit.mandatoryBasis ?? '',
    riskType:       unit.riskType ?? '',
    strategicLineId: unit.strategicLineId ?? '',
    notes:          unit.notes ?? '',
  });
  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const save = () => {
    updateUnit.mutate(
      { id: unit.id, data: {
        ...form,
        name: form.name || undefined,
        strategicLineId: form.strategicLineId || undefined,
        riskType: form.riskType || undefined,
      }},
      { onSuccess: onClose },
    );
  };

  const unitLabel = unit.name ?? `${unit.auditEntity?.name} — ${unit.auditProcess?.name}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="font-semibold text-slate-900">Editar Auditoría</h2>
            <p className="text-xs text-slate-500 truncate max-w-xs">{unitLabel}</p>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-700">Nombre personalizado</label>
            <input value={form.name} onChange={(e) => set('name', e.target.value)}
              placeholder="Dejar vacío para usar 'Área — Proceso'"
              className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-700">Tipo de Auditoría</label>
              <select value={form.auditType} onChange={(e) => set('auditType', e.target.value)}
                className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm">
                <option value="FINANCIERA">Auditoría Financiera</option>
                <option value="OPERACIONAL">Auditoría Operacional</option>
                <option value="GESTION">Auditoría de Gestión</option>
                <option value="TECNOLOGIA">Auditoría de Tecnología</option>
                <option value="EXAMEN_ESPECIAL">Examen Especial</option>
                <option value="CONSULTORIA">Consultoría</option>
                <option value="FORENSE">Investigación Forense</option>
                <option value="FRAUDE">Fraude</option>
                <option value="CALIDAD">Revisión de Calidad</option>
                <option value="OTROS">Otros</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Tipo de Riesgo</label>
              <select value={form.riskType} onChange={(e) => set('riskType', e.target.value)}
                className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm">
                <option value="">— Sin clasificar —</option>
                {RISK_TYPE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-700">Línea Estratégica</label>
            <select value={form.strategicLineId} onChange={(e) => set('strategicLineId', e.target.value)}
              className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm">
              <option value="">— Sin línea estratégica —</option>
              {objectives.map((o) => (
                <optgroup key={o.id} label={`${o.code} · ${o.name}`}>
                  {(o.lines ?? []).map((l) => (
                    <option key={l.id} value={l.id}>{l.code} · {l.name}</option>
                  ))}
                </optgroup>
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
  const { data: entityTree = [] } = useEntityTree();
  const { data: processes = [] } = useAuditProcesses();
  const { data: processCats = [] } = useProcessCategoryConfigs();
  const { data: objectives = [] } = useStrategicObjectives();
  const createUnit = useCreateAuditableUnit();
  const deleteUnit = useDeleteAuditableUnit();
  const [scoringUnit, setScoringUnit] = useState<AuditableUnit | null>(null);
  const [editUnit, setEditUnit] = useState<AuditableUnit | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showScoreInfo, setShowScoreInfo] = useState(false);
  const [form, setForm] = useState({
    name: '',
    auditEntityId: '', auditProcessId: '', auditType: 'OPERACIONAL',
    isMandatory: false, mandatoryBasis: '',
    riskType: '', strategicLineId: '',
  });


  // Flat list with hierarchy indentation for entity <select>
  const flatEntities = flattenTree(entityTree);

  // Build a map: apqcCode → category type (STRATEGIC | OPERATING | SUPPORT)
  const codeTypeMap = new Map<string, string>(
    processCats.map(c => [c.code, c.type]),
  );
  // Group processes by their parent category type via apqcCode
  const strategicProcs = processes.filter(p => codeTypeMap.get(p.apqcCode ?? '') === 'STRATEGIC');
  const operatingProcs = processes.filter(p => codeTypeMap.get(p.apqcCode ?? '') === 'OPERATING');
  const supportProcs   = processes.filter(p => codeTypeMap.get(p.apqcCode ?? '') === 'SUPPORT');
  const uncategorized  = processes.filter(
    p => !p.apqcCode || !codeTypeMap.has(p.apqcCode),
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-700">Universo de Auditorías</p>
          <p className="text-xs text-slate-400">Combinación Auditoría × Proceso — objeto evaluado y candidato al Plan Anual</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700">
          <Plus className="h-3.5 w-3.5" /> Nueva Auditoría
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
              <p className="font-bold text-blue-700">Grupo A — Riesgo Residual (30%)</p>
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
              <p className="font-bold text-blue-700">Grupo B — Factores Contextuales (70%)</p>
              <p>El <strong>auditor define</strong> 7 factores con pesos diferenciados:</p>
              <ul className="space-y-0.5 pl-3 list-disc text-blue-800">
                <li>Materialidad financiera del área <em>(20%)</em></li>
                <li>Alineación al Plan Estratégico <em>(20%)</em></li>
                <li>Alineación al Plan Operativo <em>(15%)</em></li>
                <li>Antecedentes de fraude / denuncias <em>(15%)</em></li>
                <li>Solicitud de la dirección / junta <em>(10%)</em></li>
                <li>Rotación de personal / cambios gestión <em>(10%)</em></li>
                <li>Historial de cobertura de auditoría <em>(10%)</em></li>
              </ul>
              <p className="text-[10px] text-blue-600 font-mono bg-blue-100 rounded px-2 py-1">
                Score Final = A×0.30 + B×0.70<br />
                CRÍTICO ≥75 · ALTO ≥55 · MEDIO ≥35 · BAJO &lt;35
              </p>
            </div>
            <div className="col-span-2 rounded bg-amber-50 border border-amber-200 px-3 py-2 text-amber-800">
              <strong>¿Es automático o manual?</strong> — El <em>usuario define los 10 factores</em> mediante sliders y el <em>sistema calcula el score final</em> automáticamente. Usa el botón <FlaskConical className="inline h-3.5 w-3.5 mx-0.5" /><strong>Evaluar Riesgo</strong> en cada auditoría para abrir el formulario de evaluación. La metodología sigue los lineamientos IIA / Big 4 donde los factores contextuales pesan más que el riesgo inherente.
            </div>
          </div>
        )}
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-blue-900">Nueva Auditoría</h3>
          {/* Nombre */}
          <div>
            <label className="text-xs font-medium text-slate-700">Nombre de la Auditoría <span className="text-slate-400 font-normal">(opcional — se genera automáticamente si se deja vacío)</span></label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ej: Auditoría de Tesorería 2026"
              className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {/* Auditoría — árbol jerárquico completo */}
            <div>
              <label className="text-xs font-medium text-slate-700">Auditoría (Área / Entidad)</label>
              <select value={form.auditEntityId} onChange={(e) => setForm((f) => ({ ...f, auditEntityId: e.target.value }))}
                className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5 text-sm">
                <option value="">Seleccionar área del organigrama…</option>
                {flatEntities.map((e) => (
                  <option key={e.id} value={e.id}>{e.label}</option>
                ))}
              </select>
            </div>

            {/* Proceso — agrupado por tipo */}
            <div>
              <label className="text-xs font-medium text-slate-700">Proceso</label>
              <select value={form.auditProcessId} onChange={(e) => setForm((f) => ({ ...f, auditProcessId: e.target.value }))}
                className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5 text-sm">
                <option value="">Seleccionar proceso del mapa…</option>
                {strategicProcs.length > 0 && (
                  <optgroup label="── Estratégicos ──">
                    {strategicProcs.map((p) => (
                      <option key={p.id} value={p.id}>[{p.code}] {p.name}</option>
                    ))}
                  </optgroup>
                )}
                {operatingProcs.length > 0 && (
                  <optgroup label="── Misionales / Operativos ──">
                    {operatingProcs.map((p) => (
                      <option key={p.id} value={p.id}>[{p.code}] {p.name}</option>
                    ))}
                  </optgroup>
                )}
                {supportProcs.length > 0 && (
                  <optgroup label="── Soporte / Gestión ──">
                    {supportProcs.map((p) => (
                      <option key={p.id} value={p.id}>[{p.code}] {p.name}</option>
                    ))}
                  </optgroup>
                )}
                {uncategorized.length > 0 && (
                  <optgroup label="── Sin categoría ──">
                    {uncategorized.map((p) => (
                      <option key={p.id} value={p.id}>[{p.code}] {p.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            {/* Tipo de Auditoría */}
            <div>
              <label className="text-xs font-medium text-slate-700">Tipo de Auditoría</label>
              <select value={form.auditType} onChange={(e) => setForm((f) => ({ ...f, auditType: e.target.value }))}
                className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5 text-sm">
                <option value="FINANCIERA">Auditoría Financiera</option>
                <option value="OPERACIONAL">Auditoría Operacional</option>
                <option value="GESTION">Auditoría de Gestión</option>
                <option value="TECNOLOGIA">Auditoría de Tecnología</option>
                <option value="EXAMEN_ESPECIAL">Examen Especial</option>
                <option value="CONSULTORIA">Consultoría</option>
                <option value="FORENSE">Investigación Forense</option>
                <option value="FRAUDE">Fraude</option>
                <option value="CALIDAD">Revisión de Calidad</option>
                <option value="OTROS">Otros</option>
              </select>
            </div>

            {/* Tipo de Riesgo */}
            <div>
              <label className="text-xs font-medium text-slate-700">Tipo de Riesgo</label>
              <select value={form.riskType} onChange={(e) => setForm((f) => ({ ...f, riskType: e.target.value }))}
                className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5 text-sm">
                <option value="">— Sin clasificar —</option>
                {RISK_TYPE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>

            {/* Línea Estratégica */}
            <div className="col-span-2">
              <label className="text-xs font-medium text-slate-700">Línea Estratégica</label>
              <select value={form.strategicLineId} onChange={(e) => setForm((f) => ({ ...f, strategicLineId: e.target.value }))}
                className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5 text-sm">
                <option value="">— Sin línea estratégica —</option>
                {objectives.map((o) => (
                  <optgroup key={o.id} label={`${o.code} · ${o.name}`}>
                    {(o.lines ?? []).map((l) => (
                      <option key={l.id} value={l.id}>{l.code} · {l.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div className="flex items-start gap-2 pt-2">
              <input type="checkbox" id="mandatory" checked={form.isMandatory}
                onChange={(e) => setForm((f) => ({ ...f, isMandatory: e.target.checked }))} className="mt-0.5" />
              <label htmlFor="mandatory" className="text-xs text-slate-700 cursor-pointer">Mandatorio (ley/norma regulatoria)</label>
            </div>
            {form.isMandatory && (
              <div>
                <label className="text-xs font-medium text-slate-700">Base legal</label>
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
              onClick={() => createUnit.mutate(
                { ...form, name: form.name.trim() || undefined } as any,
                { onSuccess: () => {
                  setShowCreate(false);
                  setForm({ name: '', auditEntityId: '', auditProcessId: '', auditType: 'OPERACIONAL', isMandatory: false, mandatoryBasis: '', riskType: '', strategicLineId: '' });
                }}
              )}
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
                <th className="px-4 py-3 text-left">Auditoría</th>
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
                  <p className="text-sm text-slate-400">Sin auditorías registradas.</p>
                  <p className="text-xs text-slate-300 mt-1">Crea la primera combinación Área × Proceso.</p>
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
    { id: 'entities',   label: 'Organigrama',            icon: Building2 },
    { id: 'processes',  label: 'Catálogo de Procesos',   icon: Layers },
    { id: 'units',      label: 'Universo de Auditorías', icon: FlaskConical },
    { id: 'candidates', label: 'Candidatas al Plan',     icon: Target },
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
