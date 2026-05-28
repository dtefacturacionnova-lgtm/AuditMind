'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarDays, Plus, CheckCircle2, Clock, Zap, Lock,
  BarChart3, TrendingUp,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import {
  usePlans, useCreatePlan,
  PLAN_STATUS_CONFIG, CreatePlanData, AuditPlan,
} from '@/hooks/usePlans';

// ─── Create modal ─────────────────────────────────────────────────────────────
function CreatePlanModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const currentYear = new Date().getFullYear();
  const [form, setForm] = useState<CreatePlanData>({
    year: currentYear + 1, name: `Plan Anual de Auditoría ${currentYear + 1}`, totalHours: 1800,
  });
  const create = useCreatePlan();

  if (!open) return null;

  const cls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await create.mutateAsync(form);
      onClose();
    } catch { /* shown below */ }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 mx-4">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Nuevo Plan Anual</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">Año *</label>
            <input required type="number" value={form.year}
              onChange={e => setForm(p => ({
                ...p, year: +e.target.value,
                name: `Plan Anual de Auditoría ${e.target.value}`,
              }))}
              min={2020} max={2030} className={cls} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">Nombre del plan *</label>
            <input required value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              className={cls} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">Horas totales disponibles</label>
            <input type="number" value={form.totalHours ?? ''}
              onChange={e => setForm(p => ({ ...p, totalHours: +e.target.value || 0 }))}
              placeholder="ej. 1800" className={cls} />
            <p className="text-xs text-gray-400">Capacidad total del equipo de auditoría para el año</p>
          </div>

          {create.isError && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
              {(create.error as Error)?.message ?? 'Error al crear'}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 border border-gray-200 text-sm font-medium rounded-xl text-gray-600 hover:bg-gray-50">
              Cancelar
            </button>
            <button type="submit" disabled={create.isPending}
              className="flex-1 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-60">
              {create.isPending ? 'Creando...' : 'Crear plan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── L3.1: Multi-Year Coverage Matrix ────────────────────────────────────────

function MultiYearMatrix({ plans }: { plans: AuditPlan[] }) {
  const sorted = useMemo(() => [...plans].sort((a, b) => a.year - b.year), [plans]);
  const years  = sorted.map(p => p.year);

  // Collect all unique project/entity names
  const allNames = useMemo(() => {
    const set = new Set<string>();
    plans.forEach(plan => {
      plan.items.forEach(item => {
        const name = item.auditProject?.name ?? item.auditEntity?.name;
        if (name) set.add(name);
      });
    });
    return [...set];
  }, [plans]);

  // Build lookup: name → year → { hours, level }
  const lookup = useMemo(() => {
    const map: Record<string, Record<number, { hours: number; level?: string }>> = {};
    allNames.forEach(n => { map[n] = {}; });
    plans.forEach(plan => {
      plan.items.forEach(item => {
        const name = item.auditProject?.name ?? item.auditEntity?.name;
        if (!name) return;
        map[name][plan.year] = {
          hours: item.estimatedHours,
          level: item.auditProject?.finalRiskLevel,
        };
      });
    });
    return map;
  }, [allNames, plans]);

  // Sort names by frequency desc, then alpha
  const sortedNames = useMemo(() =>
    [...allNames].sort((a, b) => {
      const fa = years.filter(y => lookup[a][y]).length;
      const fb = years.filter(y => lookup[b][y]).length;
      return fb !== fa ? fb - fa : a.localeCompare(b);
    }),
    [allNames, years, lookup],
  );

  if (plans.length < 2 || sortedNames.length === 0) return null;

  const CELL_COLORS: Record<string, string> = {
    CRITICO: 'bg-red-500 text-white',
    ALTO:    'bg-orange-500 text-white',
    MEDIO:   'bg-amber-400 text-gray-900',
    BAJO:    'bg-green-500 text-white',
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
        <CalendarDays className="w-4 h-4 text-blue-600" />
        <h3 className="text-sm font-semibold text-gray-700">Cobertura Multianual</h3>
        <span className="ml-1 text-xs text-gray-400">
          {years[0]}–{years[years.length - 1]} · {sortedNames.length} proyectos/entidades
        </span>
        <div className="ml-auto flex items-center gap-2 text-[10px] text-gray-400">
          {Object.entries(CELL_COLORS).map(([l, cls]) => (
            <span key={l} className={`px-1.5 py-0.5 rounded font-semibold ${cls}`}>{l}</span>
          ))}
          <span className="px-1.5 py-0.5 rounded bg-blue-400 text-white font-semibold">SIN NIVEL</span>
        </div>
      </div>
      <div className="overflow-auto max-h-96">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 bg-slate-50 z-10">
            <tr>
              <th className="px-4 py-2 text-left text-gray-500 font-medium border-b border-gray-100 w-64 min-w-48">Proyecto / Entidad</th>
              {years.map(y => (
                <th key={y} className="px-2 py-2 text-center text-gray-500 font-medium border-b border-gray-100 w-16">{y}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedNames.slice(0, 50).map((name, ri) => (
              <tr key={name} className={ri % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                <td className="px-4 py-2 text-gray-700 font-medium border-b border-gray-50 max-w-xs truncate" title={name}>{name}</td>
                {years.map(y => {
                  const cell = lookup[name][y];
                  return (
                    <td key={y} className="px-2 py-2 text-center border-b border-gray-50">
                      {cell ? (
                        <span
                          title={`${cell.hours} h`}
                          className={`inline-flex items-center justify-center w-8 h-6 rounded text-[10px] font-bold ${CELL_COLORS[cell.level ?? ''] ?? 'bg-blue-400 text-white'}`}>
                          ✓
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center w-8 h-6 rounded bg-gray-100 text-gray-300 text-[10px]">–</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {sortedNames.length > 50 && (
          <p className="text-xs text-gray-400 text-center py-2 border-t border-gray-100">
            + {sortedNames.length - 50} proyectos adicionales
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Capacity bar ─────────────────────────────────────────────────────────────
function CapacityBar({ pct, allocated, total }: { pct: number; allocated: number; total: number }) {
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-500">
        <span>{allocated.toLocaleString('es-CL')} h asignadas</span>
        <span className="font-semibold">{pct}%</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <p className="text-xs text-gray-400">{total.toLocaleString('es-CL')} h totales</p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function PlansPage() {
  const router = useRouter();
  const { data: plans = [], isLoading } = usePlans();
  const [showCreate, setCreate] = useState(false);

  const active   = plans.filter(p => p.status === 'ACTIVE').length;
  const approved = plans.filter(p => p.status === 'APPROVED').length;
  const draft    = plans.filter(p => p.status === 'DRAFT').length;
  const totalItems = plans.reduce((s, p) => s + p.items.length, 0);

  const statusIcons: Record<string, React.ElementType> = {
    DRAFT: Clock, APPROVED: CheckCircle2, ACTIVE: Zap, CLOSED: Lock,
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="Planificación Anual" />

      <div className="flex-1 overflow-auto p-6 space-y-6">

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total planes',       value: plans.length, icon: CalendarDays, color: 'text-blue-600',   bg: 'bg-blue-50' },
            { label: 'Activos',            value: active,       icon: Zap,          color: 'text-emerald-600',bg: 'bg-emerald-50' },
            { label: 'En aprobación',      value: approved,     icon: CheckCircle2, color: 'text-amber-600',  bg: 'bg-amber-50' },
            { label: 'Entidades planificadas', value: totalItems, icon: BarChart3,  color: 'text-purple-600', bg: 'bg-purple-50' },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex flex-col gap-2">
              <div className={`w-8 h-8 rounded-xl ${bg} flex items-center justify-center`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <p className="text-2xl font-bold text-gray-900">{value}</p>
              <p className="text-xs text-gray-500">{label}</p>
            </div>
          ))}
        </div>

        {/* Header row */}
        <div className="flex justify-between items-center">
          <h2 className="text-sm font-semibold text-gray-700">
            {plans.length} plan{plans.length !== 1 ? 'es' : ''} registrado{plans.length !== 1 ? 's' : ''}
          </h2>
          <button
            onClick={() => setCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" /> Nuevo plan
          </button>
        </div>

        {/* Plans list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : plans.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <CalendarDays className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm font-medium">Sin planes anuales</p>
            <p className="text-xs mt-1">Crea el primer plan anual de auditoría</p>
            <button onClick={() => setCreate(true)}
              className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700">
              Crear plan
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {plans.map(plan => {
              const st = PLAN_STATUS_CONFIG[plan.status];
              const StatusIcon = statusIcons[plan.status] ?? Clock;
              return (
                <div
                  key={plan.id}
                  onClick={() => router.push(`/dashboard/plans/${plan.id}`)}
                  className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 cursor-pointer hover:shadow-md hover:border-blue-200 transition-all"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-2xl font-bold text-gray-900">{plan.year}</p>
                      <p className="text-sm text-gray-600 mt-0.5 line-clamp-1">{plan.name}</p>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${st.bg} ${st.color}`}>
                      <StatusIcon className="w-3 h-3" />
                      {st.label}
                    </span>
                  </div>

                  {/* Stats */}
                  <div className="flex gap-4 text-xs text-gray-500 mb-4">
                    <span className="flex items-center gap-1">
                      <CalendarDays className="w-3.5 h-3.5" />
                      {plan.items.length} entidad{plan.items.length !== 1 ? 'es' : ''}
                    </span>
                    <span className="flex items-center gap-1">
                      <TrendingUp className="w-3.5 h-3.5" />
                      {plan.allocatedHours.toLocaleString('es-CL')} h
                    </span>
                  </div>

                  {/* Capacity bar */}
                  {plan.totalHours > 0 && (
                    <CapacityBar
                      pct={plan.utilizationPct}
                      allocated={plan.allocatedHours}
                      total={plan.totalHours}
                    />
                  )}

                  {/* Objectives preview */}
                  {plan.objectives.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <p className="text-xs text-gray-400 line-clamp-2">
                        {plan.objectives[0]}
                        {plan.objectives.length > 1 && ` +${plan.objectives.length - 1} más`}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* L3.1 — Multi-year matrix */}
        {plans.length >= 2 && <MultiYearMatrix plans={plans} />}

      </div>

      <CreatePlanModal open={showCreate} onClose={() => setCreate(false)} />
    </div>
  );
}
