'use client';
import { useState, useMemo } from 'react';
import {
  Plus, Search, Globe, AlertTriangle, BarChart2, Edit2, Trash2,
  ChevronRight, ChevronDown, Layers, FlaskConical, ShieldCheck,
  Star, Clock, CheckCircle2, X, Save, Target, TrendingUp, AlertCircle,
  Building2, Cpu, MapPin, FolderKanban, Users, Scale, Briefcase,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { useAuditUniverse, useRiskSummary, useCreateAuditUnit } from '@/hooks/useAuditUniverse';
import {
  useAuditProcesses, useCreateAuditProcess, useDeleteAuditProcess,
  useAuditableUnits, useCreateAuditableUnit, useDeleteAuditableUnit,
  useUpsertAssessment, usePlanCandidates,
  ENTITY_TYPE_CONFIG, RISK_LEVEL_CONFIG,
  type AuditProcess, type AuditableUnit, type AuditableUnitAssessment,
  type AuditEntityType,
} from '@/hooks/useAuditUniverse2';
import { cn } from '@/lib/utils';

// ─── Scoring helpers ──────────────────────────────────────────────────────────

const SCORE_LABELS: Record<number, string> = {
  1: 'Muy bajo', 2: 'Bajo', 3: 'Medio', 4: 'Alto', 5: 'Muy alto',
};

const MATURITY_LABELS: Record<number, string> = {
  1: 'Ad-hoc', 2: 'Inicial', 3: 'Definido', 4: 'Gestionado', 5: 'Optimizado',
};

const OPINION_OPTIONS = [
  { value: 'SATISFACTORY',      label: 'Satisfactorio',        color: 'text-green-700' },
  { value: 'NEEDS_IMPROVEMENT', label: 'Necesita mejoras',     color: 'text-amber-700' },
  { value: 'UNSATISFACTORY',    label: 'Insatisfactorio',      color: 'text-orange-700' },
  { value: 'CRITICAL',          label: 'Crítico',              color: 'text-red-700' },
];

function ScoreSlider({ label, hint, value, onChange, labelMap = SCORE_LABELS }: {
  label: string; hint?: string; value: number;
  onChange: (v: number) => void; labelMap?: Record<number, string>;
}) {
  const colors = ['', 'bg-green-400', 'bg-lime-400', 'bg-amber-400', 'bg-orange-400', 'bg-red-500'];
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-700">{label}</span>
        <span className={cn('text-xs font-bold px-1.5 py-0.5 rounded', colors[value], 'text-white')}>
          {value} — {labelMap[value]}
        </span>
      </div>
      {hint && <p className="text-[10px] text-slate-400">{hint}</p>}
      <input
        type="range" min={1} max={5} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded accent-blue-600"
      />
      <div className="flex justify-between text-[9px] text-slate-400">
        <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
      </div>
    </div>
  );
}

// ─── Scoring Modal ────────────────────────────────────────────────────────────

function ScoringModal({ unit, onClose }: { unit: AuditableUnit; onClose: () => void }) {
  const existing = unit.assessments?.[0];
  const upsert = useUpsertAssessment();
  const currentYear = new Date().getFullYear();

  const [form, setForm] = useState({
    assessmentYear: currentYear,
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

  // Preview del score total
  const inherent = form.impactScore * form.likelihoodScore;
  const residual = inherent * (1 - form.controlMaturityScore / 5);
  const residualNorm = (residual / 25) * 100;
  const secondaryAvg = (form.materialityScore + form.strategicAlignScore + form.operationalAlignScore +
    form.fraudHistoryScore + form.managementReqScore + form.changeVelocityScore) / 6;
  const secondaryNorm = ((secondaryAvg - 1) / 4) * 100;
  const totalScore = residualNorm * 0.7 + secondaryNorm * 0.3;
  const riskLevel = totalScore >= 75 ? 'CRITICAL' : totalScore >= 55 ? 'HIGH' : totalScore >= 35 ? 'MEDIUM' : 'LOW';
  const rl = RISK_LEVEL_CONFIG[riskLevel as keyof typeof RISK_LEVEL_CONFIG];

  const save = () => {
    upsert.mutate(
      { unitId: unit.id, data: { ...form, lastAuditDate: form.lastAuditDate || undefined } },
      { onSuccess: onClose },
    );
  };

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
          {/* Score preview */}
          <div className={cn('rounded-lg border p-4 flex items-center justify-between', rl.bg, rl.border)}>
            <div>
              <p className="text-xs text-slate-500">Score Total (preview)</p>
              <p className={cn('text-2xl font-bold', rl.color)}>{totalScore.toFixed(1)}</p>
            </div>
            <span className={cn('px-3 py-1 rounded-full text-sm font-semibold', rl.bg, rl.color, 'border', rl.border)}>
              {rl.label}
            </span>
          </div>

          {/* Grupo A */}
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">
              Grupo A — Riesgo Residual (peso 70%)
            </h3>
            <div className="space-y-4">
              <ScoreSlider label="Impacto" hint="Magnitud del daño si ocurre el riesgo" value={form.impactScore} onChange={(v) => set('impactScore', v)} />
              <ScoreSlider label="Probabilidad" hint="Frecuencia estimada de ocurrencia" value={form.likelihoodScore} onChange={(v) => set('likelihoodScore', v)} />
              <ScoreSlider label="Madurez de Controles" hint="Calidad de los controles existentes"
                value={form.controlMaturityScore} onChange={(v) => set('controlMaturityScore', v)}
                labelMap={MATURITY_LABELS}
              />
              <div className="grid grid-cols-3 gap-3 text-xs text-slate-600 bg-slate-50 rounded p-3">
                <div><span className="text-slate-400">Riesgo Inherente:</span><br /><strong>{inherent.toFixed(1)}/25</strong></div>
                <div><span className="text-slate-400">Riesgo Residual:</span><br /><strong>{residual.toFixed(1)}/25</strong></div>
                <div><span className="text-slate-400">Normalizado:</span><br /><strong>{residualNorm.toFixed(1)}/100</strong></div>
              </div>
            </div>
          </div>

          {/* Grupo B */}
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">
              Grupo B — Factores Secundarios (peso 30%)
            </h3>
            <div className="space-y-4">
              <ScoreSlider label="Materialidad Financiera" hint="Tamaño del presupuesto / volumen de transacciones del área" value={form.materialityScore} onChange={(v) => set('materialityScore', v)} />
              <ScoreSlider label="Alineación al Plan Estratégico" hint="¿Esta área es crítica para los objetivos estratégicos?" value={form.strategicAlignScore} onChange={(v) => set('strategicAlignScore', v)} />
              <ScoreSlider label="Alineación al Plan Operativo" hint="¿Qué tan relevante es para la operación diaria?" value={form.operationalAlignScore} onChange={(v) => set('operationalAlignScore', v)} />
              <ScoreSlider label="Antecedentes de Fraude / Denuncias" hint="Historial de fraudes, investigaciones o alertas de ética" value={form.fraudHistoryScore} onChange={(v) => set('fraudHistoryScore', v)} />
              <ScoreSlider label="Solicitud de la Dirección" hint="¿La gerencia o junta ha pedido expresamente esta auditoría?" value={form.managementReqScore} onChange={(v) => set('managementReqScore', v)} />
              <ScoreSlider label="Velocidad de Cambio" hint="Cambios recientes: nuevo sistema, M&A, nueva gerencia, restructuración" value={form.changeVelocityScore} onChange={(v) => set('changeVelocityScore', v)} />
            </div>
          </div>

          {/* Historial */}
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">
              Historial de Cobertura
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-slate-700">Última auditoría</label>
                <input type="date" value={form.lastAuditDate}
                  onChange={(e) => set('lastAuditDate', e.target.value)}
                  className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-700">Opinión / Resultado</label>
                <select value={form.lastAuditOpinion}
                  onChange={(e) => set('lastAuditOpinion', e.target.value)}
                  className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5 text-sm">
                  <option value="">— Sin calificación —</option>
                  {OPINION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-700">Frecuencia recomendada (meses)</label>
                <input type="number" min={1} max={60} value={form.recommendedFreqMonths}
                  onChange={(e) => set('recommendedFreqMonths', Number(e.target.value))}
                  className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                />
              </div>
            </div>
            <div className="mt-3">
              <label className="text-xs font-medium text-slate-700">Notas / Justificación</label>
              <textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)}
                className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5 text-sm resize-none"
                placeholder="Contexto adicional sobre el riesgo de esta unidad…"
              />
            </div>
          </div>
        </div>

        <div className="border-t px-6 py-4 flex justify-end gap-3">
          <button onClick={onClose} className="rounded px-4 py-2 text-sm border border-slate-300 hover:bg-slate-50">
            Cancelar
          </button>
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

// ─── Plan Candidates View ─────────────────────────────────────────────────────

function PlanCandidatesView() {
  const currentYear = new Date().getFullYear();
  const { data, isLoading } = usePlanCandidates(currentYear);

  if (isLoading) return <div className="p-8 text-center text-slate-400 text-sm">Cargando candidatas…</div>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total candidatas', value: data.total, color: 'text-slate-900' },
          { label: 'Mandatorias', value: data.mandatory, color: 'text-rose-600' },
          { label: 'Vencidas', value: data.overdue, color: 'text-orange-600' },
          { label: 'Año', value: data.year, color: 'text-blue-700' },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-slate-200 bg-white p-4 text-center">
            <p className={cn('text-2xl font-bold', s.color)}>{s.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Ranked list */}
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
                      <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                        MANDATORIO
                      </span>
                    )}
                    {u.alreadyInCurrentPlan && (
                      <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] bg-green-100 text-green-700">
                        En plan {data.year}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {u.auditProcess?.category} · {u.auditType}
                    {u.coverageGapDays != null && u.coverageGapDays > 0 && (
                      <span className="ml-2 text-orange-600 font-medium">
                        ⚠ Vencida hace {u.coverageGapDays}d
                      </span>
                    )}
                  </p>
                </div>
                {/* Score bar */}
                <div className="w-32 shrink-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className={cn('text-xs font-bold', rl.color)}>{(u.totalScore ?? 0).toFixed(1)}</span>
                    <span className={cn('text-[10px] px-1 rounded', rl.bg, rl.color)}>{rl.label}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-200">
                    <div
                      className={cn('h-1.5 rounded-full',
                        (u.totalScore ?? 0) >= 75 ? 'bg-red-500' :
                        (u.totalScore ?? 0) >= 55 ? 'bg-orange-400' :
                        (u.totalScore ?? 0) >= 35 ? 'bg-amber-400' : 'bg-green-400'
                      )}
                      style={{ width: `${Math.min(u.totalScore ?? 0, 100)}%` }}
                    />
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

// ─── Auditable Units Tab ──────────────────────────────────────────────────────

function AuditableUnitsTab() {
  const { data: units = [], isLoading } = useAuditableUnits();
  const { data: entities } = useAuditUniverse();
  const { data: processes = [] } = useAuditProcesses();
  const createUnit = useCreateAuditableUnit();
  const deleteUnit = useDeleteAuditableUnit();
  const [scoringUnit, setScoringUnit] = useState<AuditableUnit | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ auditEntityId: '', auditProcessId: '', auditType: 'OPERATIONAL', isMandatory: false, mandatoryBasis: '' });

  const AUDIT_TYPES = ['OPERATIONAL', 'FINANCIAL', 'IT', 'COMPLIANCE', 'FORENSIC', 'ADVISORY'];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Intersección Entidad × Proceso — objeto real de planificación
        </p>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700">
          <Plus className="h-3.5 w-3.5" /> Nueva Unidad
        </button>
      </div>

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
                {AUDIT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="flex items-start gap-2 pt-5">
              <input type="checkbox" id="mandatory" checked={form.isMandatory}
                onChange={(e) => setForm((f) => ({ ...f, isMandatory: e.target.checked }))}
                className="mt-0.5" />
              <label htmlFor="mandatory" className="text-xs text-slate-700 cursor-pointer">
                Mandatorio (ley/norma)
              </label>
            </div>
            {form.isMandatory && (
              <div className="col-span-2">
                <label className="text-xs font-medium text-slate-700">Base legal / regulatoria</label>
                <input value={form.mandatoryBasis} onChange={(e) => setForm((f) => ({ ...f, mandatoryBasis: e.target.value }))}
                  placeholder="Ej: Ley 29720 Art. 5 / Norma SBS N°2024-001"
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
                <th className="px-4 py-3 text-center">Score</th>
                <th className="px-4 py-3 text-center">Cobertura</th>
                <th className="px-4 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {units.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  No hay unidades auditables. Crea la primera combinación Entidad × Proceso.
                </td></tr>
              )}
              {units.map((u) => {
                const a = u.assessments?.[0];
                const rl = a ? RISK_LEVEL_CONFIG[a.riskLevel as keyof typeof RISK_LEVEL_CONFIG] : null;
                const overdue = (a?.coverageGapDays ?? 0) > 0;
                return (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{u.auditEntity?.name}</p>
                      {u.isMandatory && (
                        <span className="text-[10px] px-1 py-0.5 rounded bg-rose-100 text-rose-700 font-semibold">
                          MANDATORIO
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-slate-700">{u.auditProcess?.name}</p>
                      <p className="text-[11px] text-slate-400">{u.auditProcess?.code}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600">{u.auditType}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {a ? (
                        <div>
                          <span className={cn('text-sm font-bold', rl?.color)}>{a.totalScore.toFixed(1)}</span>
                          <span className={cn('ml-1 text-[10px] px-1 rounded', rl?.bg, rl?.color)}>{rl?.label}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Sin evaluar</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {overdue ? (
                        <span className="text-xs text-orange-600 font-medium">⚠ {a!.coverageGapDays}d vencida</span>
                      ) : a?.nextRecommendedDate ? (
                        <span className="text-xs text-green-600">✓ Al día</span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => setScoringUnit(u)}
                        className="rounded p-1.5 hover:bg-blue-50 text-blue-600" title="Evaluar riesgo">
                        <FlaskConical className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => deleteUnit.mutate(u.id)}
                        className="rounded p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-500">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {scoringUnit && <ScoringModal unit={scoringUnit} onClose={() => setScoringUnit(null)} />}
    </div>
  );
}

// ─── Processes Tab ────────────────────────────────────────────────────────────

function ProcessesTab() {
  const { data: processes = [], isLoading } = useAuditProcesses();
  const createProcess = useCreateAuditProcess();
  const deleteProcess = useDeleteAuditProcess();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', description: '', category: '' });

  const CATEGORIES = ['Financiero', 'Operacional', 'TI / Sistemas', 'RR.HH.', 'Compliance', 'Comercial', 'Logística'];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Catálogo de procesos de negocio — segunda dimensión del Universo</p>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700">
          <Plus className="h-3.5 w-3.5" /> Nuevo Proceso
        </button>
      </div>

      {showCreate && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-blue-900">Nuevo Proceso</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-700">Código</label>
              <input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="PROC-FIN-01" className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Categoría</label>
              <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5 text-sm">
                <option value="">Sin categoría</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-slate-700">Nombre</label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Gestión de Compras" className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-slate-700">Descripción (opcional)</label>
              <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowCreate(false)} className="rounded px-3 py-1.5 text-xs border border-slate-300 hover:bg-white">Cancelar</button>
            <button
              disabled={!form.code || !form.name || createProcess.isPending}
              onClick={() => createProcess.mutate(form, { onSuccess: () => { setShowCreate(false); setForm({ code: '', name: '', description: '', category: '' }); } })}
              className="rounded px-3 py-1.5 text-xs bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60">
              Crear
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="py-8 text-center text-slate-400 text-sm">Cargando…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {processes.length === 0 && (
            <div className="col-span-3 py-8 text-center text-slate-400 text-sm">
              No hay procesos. Crea los procesos de negocio a auditar.
            </div>
          )}
          {processes.map((p) => (
            <div key={p.id} className="rounded-lg border border-slate-200 bg-white p-4 flex justify-between items-start">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{p.code}</span>
                  {p.category && <span className="text-xs text-slate-400">{p.category}</span>}
                </div>
                <p className="mt-1 font-medium text-slate-900 text-sm">{p.name}</p>
                {p.description && <p className="text-xs text-slate-400 mt-0.5 truncate">{p.description}</p>}
                <p className="text-[11px] text-slate-300 mt-1">{p._count?.auditableUnits ?? 0} unidades auditables</p>
              </div>
              <button onClick={() => deleteProcess.mutate(p.id)} className="rounded p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 shrink-0">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = 'entities' | 'processes' | 'units' | 'candidates';

export default function UniversePage() {
  const [tab, setTab] = useState<Tab>('entities');
  const [search, setSearch] = useState('');
  const { data, isLoading } = useAuditUniverse({ page: 1, limit: 50, search });
  const { data: riskSummary } = useRiskSummary();

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'entities',   label: 'Entidades',            icon: Building2 },
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
        {/* Risk summary cards */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Crítico',  value: riskSummary?.CRITICAL ?? 0, color: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-200' },
            { label: 'Alto',     value: riskSummary?.HIGH    ?? 0, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
            { label: 'Medio',    value: riskSummary?.MEDIUM  ?? 0, color: 'text-amber-600',  bg: 'bg-amber-50',  border: 'border-amber-200' },
            { label: 'Bajo',     value: riskSummary?.LOW     ?? 0, color: 'text-green-600',  bg: 'bg-green-50',  border: 'border-green-200' },
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

        {/* Tab content */}
        {tab === 'entities' && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar entidades…"
                  className="w-full rounded-lg border border-slate-200 pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            {isLoading ? (
              <div className="py-8 text-center text-slate-400 text-sm">Cargando…</div>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left">Entidad</th>
                      <th className="px-4 py-3 text-left">Tipo</th>
                      <th className="px-4 py-3 text-left">Regulaciones</th>
                      <th className="px-4 py-3 text-right">Score Inicial</th>
                      <th className="px-4 py-3 text-right">Unidades</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(data?.data ?? []).map((e: any) => {
                      const etConfig = ENTITY_TYPE_CONFIG[e.entityType as AuditEntityType];
                      const regs: string[] = e.applicableRegulations ?? [];
                      return (
                        <tr key={e.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-900">{e.name}</p>
                            {e.description && <p className="text-xs text-slate-400 truncate max-w-xs">{e.description}</p>}
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn('text-xs px-2 py-0.5 rounded', etConfig?.color ?? 'bg-slate-100 text-slate-600')}>
                              {etConfig?.icon} {etConfig?.label ?? e.entityType}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {regs.slice(0, 3).map((r) => (
                                <span key={r} className="text-[10px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                                  {r}
                                </span>
                              ))}
                              {regs.length > 3 && <span className="text-[10px] text-slate-400">+{regs.length - 3}</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-sm font-semibold text-slate-700">{e.inherentRiskScore}</span>
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-slate-500">
                            {e._count?.auditableUnits ?? 0}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === 'processes'  && <ProcessesTab />}
        {tab === 'units'      && <AuditableUnitsTab />}
        {tab === 'candidates' && <PlanCandidatesView />}
      </div>
    </div>
  );
}
