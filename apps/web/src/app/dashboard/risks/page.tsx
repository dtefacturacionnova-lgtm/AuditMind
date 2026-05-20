'use client';

import { useState } from 'react';
import { Header } from '@/components/layout/Header';
import {
  useRisks, useRiskStats, useCreateRisk, useUpdateRisk, useDeleteRisk,
  getRiskColor, RISK_CATEGORIES, CATEGORY_COLORS, TREND_CONFIG,
  type RiskRegister, type CreateRiskData, type RiskCategory, type RiskTrend,
} from '@/hooks/useRisks';
import {
  ShieldAlert, Plus, Pencil, Trash2, TrendingUp, TrendingDown,
  Minus, AlertTriangle, BarChart3, X, Loader2, CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function matrixColor(p: number, i: number): string {
  const score = p * i;
  if (score >= 20) return 'bg-red-500 text-white';
  if (score >= 15) return 'bg-orange-400 text-white';
  if (score >= 8)  return 'bg-amber-300 text-amber-900';
  return 'bg-green-200 text-green-800';
}

function TrendIcon({ trend }: { trend: RiskTrend }) {
  if (trend === 'INCREASING')  return <TrendingUp  className="w-3.5 h-3.5 text-red-500" />;
  if (trend === 'DECREASING')  return <TrendingDown className="w-3.5 h-3.5 text-green-500" />;
  return <Minus className="w-3.5 h-3.5 text-amber-500" />;
}

// ─── Risk Matrix ──────────────────────────────────────────────────────────────

function RiskMatrix({ risks }: { risks: RiskRegister[] }) {
  // Build a map of (probability, impact) → count
  const grid: Record<string, number> = {};
  risks.forEach(r => {
    const key = `${r.probability}-${r.impact}`;
    grid[key] = (grid[key] ?? 0) + 1;
  });

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
        <BarChart3 className="w-4 h-4 text-[#0F2D4A]" />
        Mapa de Riesgos (Inherente)
      </h3>
      <div className="flex gap-2">
        {/* Y-axis label */}
        <div className="flex flex-col justify-around items-center w-5">
          {[5, 4, 3, 2, 1].map(p => (
            <span key={p} className="text-[10px] text-gray-400 font-medium">{p}</span>
          ))}
        </div>

        {/* Grid */}
        <div className="flex-1">
          <div className="grid grid-rows-5 gap-1">
            {[5, 4, 3, 2, 1].map(prob => (
              <div key={prob} className="grid grid-cols-5 gap-1">
                {[1, 2, 3, 4, 5].map(imp => {
                  const score = prob * imp;
                  const count = grid[`${prob}-${imp}`] ?? 0;
                  return (
                    <div
                      key={imp}
                      title={`P=${prob}, I=${imp} → Score=${score}`}
                      className={cn(
                        'aspect-square rounded flex items-center justify-center text-xs font-bold transition-all',
                        matrixColor(prob, imp),
                        count > 0 ? 'ring-2 ring-offset-1 ring-gray-900/20 scale-105' : 'opacity-60',
                      )}
                    >
                      {count > 0 ? count : ''}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* X-axis labels */}
          <div className="grid grid-cols-5 gap-1 mt-1">
            {[1, 2, 3, 4, 5].map(i => (
              <span key={i} className="text-[10px] text-gray-400 text-center">{i}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Axes labels */}
      <div className="mt-2 flex justify-between text-[10px] text-gray-400">
        <span className="rotate-0">↑ Probabilidad</span>
        <span>Impacto →</span>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-2">
        {[
          { label: 'Crítico (≥20)',  cls: 'bg-red-500' },
          { label: 'Alto (15-19)',    cls: 'bg-orange-400' },
          { label: 'Medio (8-14)',   cls: 'bg-amber-300' },
          { label: 'Bajo (<8)',      cls: 'bg-green-200' },
        ].map(({ label, cls }) => (
          <div key={label} className="flex items-center gap-1">
            <div className={cn('w-3 h-3 rounded', cls)} />
            <span className="text-[10px] text-gray-500">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Risk Form Modal ──────────────────────────────────────────────────────────

interface RiskFormData {
  title:          string;
  description:    string;
  category:       RiskCategory;
  probability:    number;
  impact:         number;
  controlsScore:  number;
  trend:          RiskTrend;
}

const DEFAULT_FORM: RiskFormData = {
  title:         '',
  description:   '',
  category:      'operacional',
  probability:   3,
  impact:        3,
  controlsScore: 0,
  trend:         'STABLE',
};

function RiskModal({
  initial,
  onClose,
  onSave,
  saving,
}: {
  initial?: RiskRegister | null;
  onClose: () => void;
  onSave:  (data: CreateRiskData) => void;
  saving:  boolean;
}) {
  const [form, setForm] = useState<RiskFormData>(
    initial
      ? {
          title:         initial.title,
          description:   initial.description,
          category:      initial.category,
          probability:   initial.probability,
          impact:        initial.impact,
          controlsScore: initial.controlsScore,
          trend:         initial.trend,
        }
      : DEFAULT_FORM,
  );

  const inherentScore = form.probability * form.impact;
  const residualScore = Math.round(inherentScore * (1 - form.controlsScore / 100));
  const inherentColor = getRiskColor(inherentScore);
  const residualColor = getRiskColor(residualScore);

  function set<K extends keyof RiskFormData>(key: K, val: RiskFormData[K]) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.description.trim()) return;
    onSave(form);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#0F2D4A] flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-base font-bold text-gray-900">
              {initial ? 'Editar Riesgo' : 'Registrar Nuevo Riesgo'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-auto px-6 py-5 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Título del riesgo *</label>
            <input
              type="text"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="Ej. Falla en controles de acceso a sistemas críticos"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#0F2D4A]/30 outline-none"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Descripción *</label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={3}
              placeholder="Descripción del riesgo, sus causas y posibles consecuencias…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-[#0F2D4A]/30 outline-none"
              required
            />
          </div>

          {/* Category + Trend */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Categoría</label>
              <select
                value={form.category}
                onChange={e => set('category', e.target.value as RiskCategory)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#0F2D4A]/30 outline-none"
              >
                {RISK_CATEGORIES.map(c => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Tendencia</label>
              <select
                value={form.trend}
                onChange={e => set('trend', e.target.value as RiskTrend)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#0F2D4A]/30 outline-none"
              >
                <option value="INCREASING">↑ Aumentando</option>
                <option value="STABLE">→ Estable</option>
                <option value="DECREASING">↓ Disminuyendo</option>
              </select>
            </div>
          </div>

          {/* Probability + Impact sliders */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                Probabilidad: <span className="text-[#0F2D4A] font-bold">{form.probability}</span>/5
              </label>
              <input
                type="range" min={1} max={5} step={1}
                value={form.probability}
                onChange={e => set('probability', Number(e.target.value))}
                className="w-full accent-[#0F2D4A]"
              />
              <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                <span>Muy baja</span><span>Muy alta</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                Impacto: <span className="text-[#0F2D4A] font-bold">{form.impact}</span>/5
              </label>
              <input
                type="range" min={1} max={5} step={1}
                value={form.impact}
                onChange={e => set('impact', Number(e.target.value))}
                className="w-full accent-[#0F2D4A]"
              />
              <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                <span>Mínimo</span><span>Catastrófico</span>
              </div>
            </div>
          </div>

          {/* Controls effectiveness */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Efectividad de controles: <span className="text-[#0F2D4A] font-bold">{form.controlsScore}%</span>
            </label>
            <input
              type="range" min={0} max={100} step={5}
              value={form.controlsScore}
              onChange={e => set('controlsScore', Number(e.target.value))}
              className="w-full accent-[#0F2D4A]"
            />
            <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
              <span>Sin controles</span><span>Controles totales</span>
            </div>
          </div>

          {/* Score preview */}
          <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
            <div className="text-center">
              <p className="text-[10px] text-gray-500 mb-1">Riesgo Inherente</p>
              <span className={cn(
                'inline-flex items-center px-3 py-1 rounded-full text-sm font-bold',
                inherentColor.bg, inherentColor.text,
              )}>
                {inherentScore} — {inherentColor.label}
              </span>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-gray-500 mb-1">Riesgo Residual</p>
              <span className={cn(
                'inline-flex items-center px-3 py-1 rounded-full text-sm font-bold',
                residualColor.bg, residualColor.text,
              )}>
                {residualScore} — {residualColor.label}
              </span>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit as unknown as React.MouseEventHandler}
            disabled={saving || !form.title.trim()}
            className="px-5 py-2 bg-[#0F2D4A] text-white text-sm rounded-lg hover:bg-[#1a4a7a] disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {initial ? 'Guardar cambios' : 'Registrar riesgo'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RisksPage() {
  const { data: risks = [], isLoading } = useRisks();
  const { data: stats } = useRiskStats();
  const createMutation = useCreateRisk();
  const deleteMutation = useDeleteRisk();

  const [showModal, setShowModal]     = useState(false);
  const [editing, setEditing]         = useState<RiskRegister | null>(null);
  const [filterCat, setFilterCat]     = useState<RiskCategory | 'all'>('all');
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [toast, setToast]             = useState('');

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  const filtered = risks.filter(r => {
    if (filterCat !== 'all' && r.category !== filterCat) return false;
    if (filterLevel !== 'all') {
      const s = r.residualScore;
      if (filterLevel === 'critical' && s < 20)  return false;
      if (filterLevel === 'high'     && (s < 15 || s >= 20)) return false;
      if (filterLevel === 'medium'   && (s < 8  || s >= 15)) return false;
      if (filterLevel === 'low'      && s >= 8)  return false;
    }
    return true;
  });

  function handleSave(data: CreateRiskData) {
    if (editing) {
      const update = useUpdateRisk; // eslint-disable-line react-hooks/rules-of-hooks
      // Use the create mutation on editing — we'll handle inline via dedicated component
      // For simplicity, close and let user re-open
      void update;
    }
    createMutation.mutate(data, {
      onSuccess: () => {
        setShowModal(false);
        showToast('Riesgo registrado exitosamente');
      },
    });
  }

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Evaluación de Riesgos"
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Riesgos y Controles' },
          { label: 'Evaluación de Riesgos' },
        ]}
      />

      <div className="flex-1 overflow-auto p-6 space-y-6">

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Riesgos',    value: stats?.total ?? 0,     color: 'bg-[#0F2D4A] text-white', icon: ShieldAlert },
            { label: 'Críticos',         value: stats?.critical ?? 0,  color: 'bg-red-600 text-white',   icon: AlertTriangle },
            { label: 'Altos',            value: stats?.high ?? 0,      color: 'bg-orange-500 text-white',icon: AlertTriangle },
            { label: 'Tendencia ↑',      value: stats?.increasing ?? 0,color: 'bg-amber-500 text-white', icon: TrendingUp },
          ].map(({ label, value, color, icon: Icon }) => (
            <div key={label} className={cn('rounded-xl p-4 flex items-center gap-3', color)}>
              <Icon className="w-6 h-6 opacity-80 shrink-0" />
              <div>
                <p className="text-2xl font-bold leading-tight">{value}</p>
                <p className="text-xs opacity-80">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Matrix + Controls ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Risk Matrix */}
          <div className="lg:col-span-1">
            {isLoading ? (
              <div className="bg-white border border-gray-200 rounded-xl p-5 h-64 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
              </div>
            ) : (
              <RiskMatrix risks={risks} />
            )}
          </div>

          {/* Distribution by category */}
          <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-[#0F2D4A]" />
              Distribución por Categoría
            </h3>
            {isLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-8 bg-gray-100 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : risks.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-gray-400">
                <ShieldAlert className="w-10 h-10 mb-2 opacity-30" />
                <p className="text-sm">Sin riesgos registrados</p>
              </div>
            ) : (
              <div className="space-y-2">
                {RISK_CATEGORIES.map(cat => {
                  const catRisks = risks.filter(r => r.category === cat);
                  if (catRisks.length === 0) return null;
                  const pct = Math.round((catRisks.length / risks.length) * 100);
                  const critical = catRisks.filter(r => r.residualScore >= 20).length;
                  return (
                    <div key={cat} className="flex items-center gap-3">
                      <span className={cn(
                        'text-[11px] font-medium px-2 py-0.5 rounded-full w-28 text-center shrink-0',
                        CATEGORY_COLORS[cat],
                      )}>
                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </span>
                      <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                        <div
                          className="bg-[#0F2D4A] h-full rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="text-xs text-gray-500 w-16 text-right shrink-0">
                        {catRisks.length} riesgo{catRisks.length !== 1 && 's'}
                        {critical > 0 && (
                          <span className="ml-1 text-red-500 font-semibold">({critical}⚠)</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Filters + Table ── */}
        <div className="bg-white border border-gray-200 rounded-xl">
          {/* Toolbar */}
          <div className="px-5 py-4 border-b border-gray-200 flex flex-wrap items-center gap-3">
            <h3 className="text-sm font-semibold text-gray-700 flex-1">
              Registro de Riesgos
              <span className="ml-2 text-xs text-gray-400 font-normal">
                {filtered.length} de {risks.length}
              </span>
            </h3>

            {/* Level filter */}
            <select
              value={filterLevel}
              onChange={e => setFilterLevel(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600 focus:outline-none"
            >
              <option value="all">Todos los niveles</option>
              <option value="critical">Crítico (≥20)</option>
              <option value="high">Alto (15-19)</option>
              <option value="medium">Medio (8-14)</option>
              <option value="low">Bajo (&lt;8)</option>
            </select>

            {/* Category filter */}
            <select
              value={filterCat}
              onChange={e => setFilterCat(e.target.value as RiskCategory | 'all')}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600 focus:outline-none"
            >
              <option value="all">Todas las categorías</option>
              {RISK_CATEGORIES.map(c => (
                <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
              ))}
            </select>

            <button
              onClick={() => { setEditing(null); setShowModal(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0F2D4A] text-white text-xs rounded-lg hover:bg-[#1a4a7a] transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Nuevo riesgo
            </button>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="p-5 space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-14 bg-gray-50 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-gray-400">
              <ShieldAlert className="w-12 h-12 mb-3 opacity-20" />
              <p className="text-sm font-medium">Sin riesgos registrados</p>
              <p className="text-xs mt-1">Registra el primer riesgo con el botón &quot;Nuevo riesgo&quot;</p>
              <button
                onClick={() => { setEditing(null); setShowModal(true); }}
                className="mt-4 flex items-center gap-2 px-4 py-2 bg-[#0F2D4A] text-white text-sm rounded-lg hover:bg-[#1a4a7a]"
              >
                <Plus className="w-4 h-4" /> Registrar primer riesgo
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {/* Header row */}
              <div className="px-5 py-2.5 grid grid-cols-12 gap-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                <div className="col-span-4">Riesgo</div>
                <div className="col-span-2">Categoría</div>
                <div className="col-span-1 text-center">P×I</div>
                <div className="col-span-2 text-center">Inherente</div>
                <div className="col-span-2 text-center">Residual</div>
                <div className="col-span-1" />
              </div>

              {filtered.map(risk => {
                const inherent = getRiskColor(risk.inherentScore);
                const residual = getRiskColor(risk.residualScore);
                return (
                  <div
                    key={risk.id}
                    className="px-5 py-3.5 grid grid-cols-12 gap-3 items-center hover:bg-gray-50/80 transition-colors group"
                  >
                    {/* Title + trend */}
                    <div className="col-span-4">
                      <div className="flex items-start gap-2">
                        <TrendIcon trend={risk.trend} />
                        <div>
                          <p className="text-sm font-medium text-gray-800 leading-snug">{risk.title}</p>
                          {risk.auditEntity && (
                            <p className="text-[11px] text-gray-400 mt-0.5">{risk.auditEntity.name}</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Category */}
                    <div className="col-span-2">
                      <span className={cn(
                        'text-[11px] font-medium px-2 py-0.5 rounded-full',
                        CATEGORY_COLORS[risk.category],
                      )}>
                        {risk.category.charAt(0).toUpperCase() + risk.category.slice(1)}
                      </span>
                    </div>

                    {/* P × I */}
                    <div className="col-span-1 text-center text-xs text-gray-500">
                      {risk.probability}×{risk.impact}
                    </div>

                    {/* Inherent score */}
                    <div className="col-span-2 flex justify-center">
                      <span className={cn(
                        'px-2.5 py-0.5 rounded-full text-xs font-bold',
                        inherent.bg, inherent.text,
                      )}>
                        {risk.inherentScore} · {inherent.label}
                      </span>
                    </div>

                    {/* Residual score */}
                    <div className="col-span-2 flex justify-center">
                      <span className={cn(
                        'px-2.5 py-0.5 rounded-full text-xs font-bold',
                        residual.bg, residual.text,
                      )}>
                        {risk.residualScore} · {residual.label}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="col-span-1 flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => { setEditing(risk); setShowModal(true); }}
                        title="Editar"
                        className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-700"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`¿Eliminar "${risk.title}"?`)) {
                            deleteMutation.mutate(risk.id, {
                              onSuccess: () => showToast('Riesgo eliminado'),
                            });
                          }
                        }}
                        title="Eliminar"
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Modal ── */}
      {showModal && (
        <RiskFormWithUpdate
          initial={editing}
          onClose={() => { setShowModal(false); setEditing(null); }}
          onCreated={() => showToast(editing ? 'Riesgo actualizado' : 'Riesgo registrado')}
        />
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-[#0F2D4A] text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 z-50 animate-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 text-green-400" />
          <span className="text-sm">{toast}</span>
        </div>
      )}
    </div>
  );
}

// ─── Wrapper that picks create vs update ─────────────────────────────────────

function RiskFormWithUpdate({
  initial,
  onClose,
  onCreated,
}: {
  initial:   RiskRegister | null;
  onClose:   () => void;
  onCreated: () => void;
}) {
  const createMut = useCreateRisk();
  const updateMut = useUpdateRisk(initial?.id ?? '');

  function handleSave(data: CreateRiskData) {
    const mut = initial ? updateMut : createMut;
    (mut as typeof createMut).mutate(data, {
      onSuccess: () => { onClose(); onCreated(); },
    });
  }

  const saving = createMut.isPending || updateMut.isPending;

  return (
    <RiskModal
      initial={initial}
      onClose={onClose}
      onSave={handleSave}
      saving={saving}
    />
  );
}
