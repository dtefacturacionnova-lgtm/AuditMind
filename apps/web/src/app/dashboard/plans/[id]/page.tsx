'use client';

import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import {
  CalendarDays, Plus, Trash2, Clock, CheckCircle2, Zap, Lock,
  TrendingUp, AlertTriangle, ChevronDown, ChevronUp, Edit2, Save, X,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import {
  usePlan, useApprovePlan, useActivatePlan, useClosePlan,
  useAddPlanItem, useUpdatePlanItem, useRemovePlanItem, useUpdatePlan,
  PLAN_STATUS_CONFIG, PRIORITY_CONFIG,
  CreatePlanItemData, PlanItem,
} from '@/hooks/usePlans';
import { useAuditUniverse } from '@/hooks/useAuditUniverse';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}

function CapacityBar({ pct, allocated, remaining, total }: {
  pct: number; allocated: number; remaining: number; total: number;
}) {
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500';
  const textColor = pct >= 90 ? 'text-red-600' : pct >= 70 ? 'text-amber-600' : 'text-emerald-600';
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-gray-600">Utilización de capacidad</span>
        <span className={`font-bold text-lg ${textColor}`}>{pct}%</span>
      </div>
      <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <div className="flex justify-between text-xs text-gray-500">
        <span>{allocated.toLocaleString('es-CL')} h asignadas</span>
        <span>{remaining > 0 ? `${remaining.toLocaleString('es-CL')} h disponibles` : 'Capacidad superada'}</span>
        <span>{total.toLocaleString('es-CL')} h totales</span>
      </div>
    </div>
  );
}

// ─── Add item form ────────────────────────────────────────────────────────────
function AddItemForm({ planId, existingEntityIds, onAdded }: {
  planId: string;
  existingEntityIds: string[];
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreatePlanItemData>({
    auditEntityId: '', estimatedHours: 80, priority: 2,
  });
  const addItem = useAddPlanItem(planId);
  const { data: univResp } = useAuditUniverse({ limit: 100 });
  const entities = univResp?.data ?? [];
  const available = entities.filter(e => !existingEntityIds.includes(e.id));

  const cls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.auditEntityId) return;
    await addItem.mutateAsync(form);
    setForm({ auditEntityId: '', estimatedHours: 80, priority: 2 });
    setOpen(false);
    onAdded();
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 text-gray-500 text-xs rounded-xl hover:border-blue-400 hover:text-blue-600 w-full justify-center transition-colors">
        <Plus className="w-3.5 h-3.5" /> Agregar entidad al plan
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-blue-50 rounded-xl border border-blue-200 p-4 space-y-3">
      <p className="text-xs font-semibold text-blue-700">Agregar entidad</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <select required value={form.auditEntityId}
            onChange={e => setForm(p => ({ ...p, auditEntityId: e.target.value }))}
            className={cls + ' bg-white'}>
            <option value="">Seleccionar entidad...</option>
            {available.map(e => (
              <option key={e.id} value={e.id}>
                [{e.category}] {e.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-600 block mb-1">Horas estimadas</label>
          <input type="number" required value={form.estimatedHours}
            onChange={e => setForm(p => ({ ...p, estimatedHours: +e.target.value }))}
            min={1} className={cls} />
        </div>
        <div>
          <label className="text-xs text-gray-600 block mb-1">Prioridad</label>
          <select value={form.priority ?? 2}
            onChange={e => setForm(p => ({ ...p, priority: +e.target.value }))}
            className={cls + ' bg-white'}>
            <option value={1}>Alta</option>
            <option value={2}>Media</option>
            <option value={3}>Baja</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-600 block mb-1">Inicio tentativo</label>
          <input type="date" value={form.tentativeStartDate ?? ''}
            onChange={e => setForm(p => ({ ...p, tentativeStartDate: e.target.value || undefined }))}
            className={cls} />
        </div>
        <div>
          <label className="text-xs text-gray-600 block mb-1">Fin tentativo</label>
          <input type="date" value={form.tentativeEndDate ?? ''}
            onChange={e => setForm(p => ({ ...p, tentativeEndDate: e.target.value || undefined }))}
            className={cls} />
        </div>
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={addItem.isPending}
          className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60">
          {addItem.isPending ? 'Agregando...' : 'Agregar'}
        </button>
        <button type="button" onClick={() => setOpen(false)}
          className="px-4 py-2 border border-gray-200 text-xs text-gray-600 rounded-lg hover:bg-gray-50">
          Cancelar
        </button>
      </div>
    </form>
  );
}

// ─── Plan item row ────────────────────────────────────────────────────────────
function PlanItemRow({ item, planId, canEdit }: { item: PlanItem; planId: string; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [hours, setHours]     = useState(String(item.estimatedHours));
  const [prio,  setPrio]      = useState(String(item.priority));
  const updateItem = useUpdatePlanItem(planId);
  const removeItem = useRemovePlanItem(planId);
  const pr = PRIORITY_CONFIG[item.priority] ?? PRIORITY_CONFIG[2];

  const handleSave = async () => {
    await updateItem.mutateAsync({
      itemId: item.id,
      data: { estimatedHours: +hours, priority: +prio },
    });
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
      {/* Risk score */}
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${
        item.auditEntity.inherentRiskScore >= 80 ? 'bg-red-50 text-red-700' :
        item.auditEntity.inherentRiskScore >= 60 ? 'bg-amber-50 text-amber-700' :
        'bg-green-50 text-green-700'
      }`}>
        {item.auditEntity.inherentRiskScore}
      </div>

      {/* Entity info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{item.auditEntity.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-gray-400">{item.auditEntity.category}</span>
          {item.tentativeStartDate && (
            <span className="text-xs text-gray-400">
              · {formatDate(item.tentativeStartDate)} → {formatDate(item.tentativeEndDate)}
            </span>
          )}
        </div>
      </div>

      {/* Priority & hours */}
      {editing ? (
        <div className="flex items-center gap-2">
          <input type="number" value={hours} onChange={e => setHours(e.target.value)}
            className="w-20 rounded border border-gray-200 px-2 py-1 text-xs" />
          <select value={prio} onChange={e => setPrio(e.target.value)}
            className="rounded border border-gray-200 px-2 py-1 text-xs bg-white">
            <option value="1">Alta</option>
            <option value="2">Media</option>
            <option value="3">Baja</option>
          </select>
          <button onClick={handleSave} disabled={updateItem.isPending}
            className="p-1 text-emerald-600 hover:text-emerald-700">
            <Save className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setEditing(false)} className="p-1 text-gray-400 hover:text-gray-600">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${pr.bg} ${pr.color}`}>
            {pr.label}
          </span>
          <span className="text-xs font-mono text-gray-600 w-16 text-right">
            {item.estimatedHours.toLocaleString('es-CL')} h
          </span>
          {canEdit && (
            <>
              <button onClick={() => setEditing(true)} className="p-1 text-gray-300 hover:text-blue-500">
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={async () => {
                  if (confirm(`¿Quitar "${item.auditEntity.name}" del plan?`)) {
                    await removeItem.mutateAsync(item.id);
                  }
                }}
                disabled={removeItem.isPending}
                className="p-1 text-gray-300 hover:text-red-500 disabled:opacity-60">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function PlanDetailPage() {
  const params = useParams<{ id: string }>();
  const { data: plan, isLoading } = usePlan(params.id);
  const [editingObjectives, setEditObj] = useState(false);
  const [objText, setObjText] = useState('');
  const [showAllItems, setShowAll] = useState(false);

  const approve  = useApprovePlan();
  const activate = useActivatePlan();
  const close    = useClosePlan();
  const updatePlan = useUpdatePlan(params.id);

  if (isLoading || !plan) {
    return (
      <div className="flex flex-col h-full">
        <Header breadcrumbs={[{ label: 'Planificación', href: '/dashboard/plans' }, { label: '...' }]} />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const st       = PLAN_STATUS_CONFIG[plan.status];
  const canEdit  = plan.status !== 'CLOSED';
  const sortedItems = [...plan.items].sort((a, b) => a.priority - b.priority);
  const displayItems = showAllItems ? sortedItems : sortedItems.slice(0, 8);

  const StatusIcon = { DRAFT: Clock, APPROVED: CheckCircle2, ACTIVE: Zap, CLOSED: Lock }[plan.status] ?? Clock;

  // By category
  const byCategory = sortedItems.reduce<Record<string, typeof sortedItems>>((acc, item) => {
    const cat = item.auditEntity.category;
    acc[cat] = [...(acc[cat] ?? []), item];
    return acc;
  }, {});

  const handleSaveObjectives = async () => {
    const objectives = objText.split('\n').map(s => s.trim()).filter(Boolean);
    await updatePlan.mutateAsync({ objectives });
    setEditObj(false);
  };

  return (
    <div className="flex flex-col h-full">
      <Header breadcrumbs={[
        { label: 'Planificación', href: '/dashboard/plans' },
        { label: `Plan ${plan.year}` },
      ]} />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto space-y-4">

          {/* ── Header card ── */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                <CalendarDays className="w-7 h-7 text-blue-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-3xl font-black text-gray-900">{plan.year}</span>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${st.bg} ${st.color}`}>
                    <StatusIcon className="w-3 h-3" />
                    {st.label}
                  </span>
                </div>
                <p className="text-sm text-gray-600">{plan.name}</p>
                {plan.approvedAt && (
                  <p className="text-xs text-gray-400 mt-0.5">Aprobado el {formatDate(plan.approvedAt)}</p>
                )}
              </div>

              {/* Workflow buttons */}
              <div className="flex gap-2">
                {plan.status === 'DRAFT' && (
                  <button onClick={() => approve.mutateAsync(plan.id)} disabled={approve.isPending}
                    className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-60 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {approve.isPending ? '...' : 'Aprobar plan'}
                  </button>
                )}
                {plan.status === 'APPROVED' && (
                  <button onClick={() => activate.mutateAsync(plan.id)} disabled={activate.isPending}
                    className="px-4 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-60 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5" />
                    {activate.isPending ? '...' : 'Activar plan'}
                  </button>
                )}
                {plan.status === 'ACTIVE' && (
                  <button onClick={() => {
                    if (confirm('¿Cerrar este plan? Esta acción no se puede deshacer.')) {
                      close.mutateAsync(plan.id);
                    }
                  }} disabled={close.isPending}
                    className="px-4 py-2 border border-gray-300 text-gray-600 text-xs font-semibold rounded-xl hover:bg-gray-50 disabled:opacity-60 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" />
                    {close.isPending ? '...' : 'Cerrar plan'}
                  </button>
                )}
              </div>
            </div>

            {/* Capacity bar */}
            {plan.totalHours > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <CapacityBar
                  pct={plan.utilizationPct}
                  allocated={plan.allocatedHours}
                  remaining={plan.remainingHours}
                  total={plan.totalHours}
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4">

            {/* ── Left: Objectives + Summary ── */}
            <div className="col-span-1 space-y-4">

              {/* Stats */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Resumen</p>
                <div className="space-y-2 text-sm">
                  {[
                    { label: 'Entidades',      value: plan.items.length },
                    { label: 'Horas asignadas',value: `${plan.allocatedHours.toLocaleString('es-CL')} h` },
                    { label: 'Horas restantes',value: `${Math.max(0, plan.remainingHours).toLocaleString('es-CL')} h` },
                    { label: 'Prioridad alta', value: sortedItems.filter(i => i.priority === 1).length },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex justify-between">
                      <span className="text-gray-500 text-xs">{label}</span>
                      <span className="font-semibold text-gray-800 text-xs">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Objectives */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Objetivos del plan</p>
                  {canEdit && !editingObjectives && (
                    <button onClick={() => {
                      setObjText(plan.objectives.join('\n'));
                      setEditObj(true);
                    }} className="text-xs text-blue-600 hover:underline">Editar</button>
                  )}
                </div>

                {editingObjectives ? (
                  <div className="space-y-2">
                    <textarea
                      rows={5} value={objText}
                      onChange={e => setObjText(e.target.value)}
                      placeholder="Un objetivo por línea..."
                      className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                    <div className="flex gap-2">
                      <button onClick={handleSaveObjectives} disabled={updatePlan.isPending}
                        className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg">
                        Guardar
                      </button>
                      <button onClick={() => setEditObj(false)}
                        className="px-3 py-1.5 border border-gray-200 text-xs text-gray-600 rounded-lg">
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : plan.objectives.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">Sin objetivos definidos</p>
                ) : (
                  <ul className="space-y-2">
                    {plan.objectives.map((obj, i) => (
                      <li key={i} className="flex gap-2 text-xs text-gray-700">
                        <span className="text-blue-400 font-bold flex-shrink-0">{i + 1}.</span>
                        {obj}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* By category */}
              {Object.keys(byCategory).length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Por categoría</p>
                  <div className="space-y-2">
                    {Object.entries(byCategory).map(([cat, items]) => {
                      const hrs = items.reduce((s, i) => s + i.estimatedHours, 0);
                      return (
                        <div key={cat} className="flex justify-between items-center">
                          <span className="text-xs text-gray-600">{cat}</span>
                          <span className="text-xs text-gray-400">
                            {items.length} · {hrs.toLocaleString('es-CL')} h
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* ── Right: Items list ── */}
            <div className="col-span-2 space-y-4">
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-semibold text-gray-800">
                    Entidades planificadas
                    <span className="ml-2 text-xs font-normal text-gray-400">{sortedItems.length} total</span>
                  </p>
                  <div className="flex items-center gap-1.5 text-xs text-gray-400">
                    <TrendingUp className="w-3.5 h-3.5" />
                    Ordenado por prioridad y riesgo
                  </div>
                </div>

                {sortedItems.length === 0 ? (
                  <div className="py-8 flex flex-col items-center text-gray-400">
                    <AlertTriangle className="w-8 h-8 mb-2 opacity-30" />
                    <p className="text-sm">Sin entidades en el plan</p>
                    <p className="text-xs mt-1">Agrega entidades del universo de auditoría</p>
                  </div>
                ) : (
                  <>
                    {displayItems.map(item => (
                      <PlanItemRow key={item.id} item={item} planId={plan.id} canEdit={canEdit} />
                    ))}
                    {sortedItems.length > 8 && (
                      <button
                        onClick={() => setShowAll(!showAllItems)}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:underline mt-2"
                      >
                        {showAllItems
                          ? <><ChevronUp className="w-3.5 h-3.5" /> Ver menos</>
                          : <><ChevronDown className="w-3.5 h-3.5" /> Ver {sortedItems.length - 8} más</>
                        }
                      </button>
                    )}
                  </>
                )}

                {canEdit && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <AddItemForm
                      planId={plan.id}
                      existingEntityIds={sortedItems.map(i => i.auditEntityId)}
                      onAdded={() => {}}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
