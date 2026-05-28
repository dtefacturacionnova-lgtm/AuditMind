'use client';

import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import {
  CalendarDays, Plus, Trash2, Clock, CheckCircle2, Zap, Lock,
  TrendingUp, AlertTriangle, ChevronDown, ChevronUp, Edit2, Save, X,
  Download, ClipboardList, DollarSign, ShieldAlert,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import {
  usePlan, useApprovePlan, useActivatePlan, useClosePlan,
  useUpdatePlanItem, useRemovePlanItem, useUpdatePlan,
  useImportFromProjects, usePlanProjectCandidates,
  PLAN_STATUS_CONFIG, PRIORITY_CONFIG, RISK_LEVEL_CONFIG,
  PlanItem, ProjectCandidate,
} from '@/hooks/usePlans';
import { useAuditProjects } from '@/hooks/useAuditProjects';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtCurrency(v?: number | null) {
  if (!v) return '—';
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
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

// ─── Import from Banco de Proyectos panel ─────────────────────────────────────
function ImportFromBancoPanel({ planId, planYear, onClose }: { planId: string; planYear: number; onClose: () => void }) {
  const { data: candidates = [], isLoading } = usePlanProjectCandidates(planId);
  const importMut = useImportFromProjects(planId);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (id: string) => setSelected(prev => {
    const s = new Set(prev);
    s.has(id) ? s.delete(id) : s.add(id);
    return s;
  });

  const pending = candidates.filter(c => !c.alreadyInPlan);
  const already = candidates.filter(c => c.alreadyInPlan);
  const totalBudget = [...selected].reduce((sum, id) => {
    const p = candidates.find(c => c.id === id);
    return sum + (p?.totalBudget ?? 0);
  }, 0);
  const totalHours = [...selected].reduce((sum, id) => {
    const p = candidates.find(c => c.id === id);
    return sum + (p?.plannedHours ?? 0);
  }, 0);

  const handleImport = async () => {
    if (selected.size === 0) return;
    await importMut.mutateAsync([...selected]);
    onClose();
  };

  const rlCfg = (level?: string) => RISK_LEVEL_CONFIG[level ?? ''] ?? { label: level ?? '—', color: 'text-gray-500', bg: 'bg-gray-100' };

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* backdrop */}
      <div className="flex-1 bg-black/30" onClick={onClose} />

      {/* panel */}
      <div className="w-[520px] bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* header */}
        <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 p-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ClipboardList className="w-5 h-5" />
              <div>
                <p className="font-bold text-base">Importar del Banco de Proyectos</p>
                <p className="text-xs text-indigo-200 mt-0.5">Proyectos marcados para este plan anual</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-indigo-500 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* selection summary */}
        {selected.size > 0 && (
          <div className="bg-indigo-50 border-b border-indigo-100 px-5 py-3 flex items-center gap-4 text-xs">
            <span className="font-semibold text-indigo-700">{selected.size} seleccionado{selected.size > 1 ? 's' : ''}</span>
            {totalHours > 0 && (
              <span className="text-indigo-600 flex items-center gap-1">
                <Clock className="w-3 h-3" /> {totalHours.toLocaleString('es-CL')} h
              </span>
            )}
            {totalBudget > 0 && (
              <span className="text-indigo-600 flex items-center gap-1">
                <DollarSign className="w-3 h-3" /> {fmtCurrency(totalBudget)}
              </span>
            )}
          </div>
        )}

        {/* list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : pending.length === 0 && already.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">Sin candidatos para este plan</p>
              <p className="text-xs mt-1">Marca proyectos como "Incluir en Plan" en el Banco de Proyectos</p>
            </div>
          ) : (
            <>
              {pending.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">
                    Disponibles — {pending.length}
                  </p>
                  {pending.map(p => {
                    const rl = rlCfg(p.finalRiskLevel);
                    const isSelected = selected.has(p.id);
                    return (
                      <label key={p.id}
                        className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? 'border-indigo-400 bg-indigo-50'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}>
                        <input
                          type="checkbox" checked={isSelected}
                          onChange={() => toggle(p.id)}
                          className="mt-0.5 accent-indigo-600 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-mono text-gray-400">{p.correlative}</span>
                            {p.finalRiskLevel && (
                              <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${rl.bg} ${rl.color}`}>
                                {rl.label}
                              </span>
                            )}
                            {/* Year mismatch warning */}
                            {p.targetPlanYear && p.targetPlanYear !== planYear ? (
                              <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                                Año objetivo: {p.targetPlanYear}
                              </span>
                            ) : (
                              <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                                {p.planYear}
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-medium text-gray-800 mt-0.5 truncate">{p.name}</p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                            {p.riskCategory && <span>{p.riskCategory}</span>}
                            {p.plannedHours ? <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" />{p.plannedHours} h</span> : null}
                            {p.totalBudget ? <span className="flex items-center gap-0.5"><DollarSign className="w-3 h-3" />{fmtCurrency(p.totalBudget)}</span> : null}
                          </div>
                          {p.strategicObjective && (
                            <p className="text-xs text-indigo-500 mt-0.5 truncate">
                              OE: {p.strategicObjective.name}
                            </p>
                          )}
                        </div>
                        {p.finalRiskScore && (
                          <span className="text-xs font-bold text-gray-400 flex-shrink-0 mt-1">
                            {p.finalRiskScore.toFixed(2)}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </>
              )}

              {already.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1 mt-4">
                    Ya importados — {already.length}
                  </p>
                  {already.map(p => {
                    const rl = rlCfg(p.finalRiskLevel);
                    return (
                      <div key={p.id}
                        className="flex items-start gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50 opacity-60">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-gray-400">{p.correlative}</span>
                            {p.finalRiskLevel && (
                              <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${rl.bg} ${rl.color}`}>
                                {rl.label}
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-medium text-gray-700 mt-0.5 truncate">{p.name}</p>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </>
          )}
        </div>

        {/* footer */}
        <div className="border-t border-gray-200 p-4 flex gap-3">
          <button
            onClick={handleImport}
            disabled={selected.size === 0 || importMut.isPending}
            className="flex-1 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl
              hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors
              flex items-center justify-center gap-2">
            <Download className="w-4 h-4" />
            {importMut.isPending
              ? 'Importando...'
              : selected.size > 0
                ? `Importar ${selected.size} proyecto${selected.size > 1 ? 's' : ''}`
                : 'Selecciona proyectos'}
          </button>
          <button onClick={onClose}
            className="px-4 py-2.5 border border-gray-200 text-sm text-gray-600 rounded-xl hover:bg-gray-50">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Quick add any project from Banco de Proyectos directly ──────────────────
// For projects NOT yet marked "Incluir en Plan" but you want to add ad-hoc.
function QuickAddProjectForm({ planId, existingProjectIds, onAdded }: {
  planId: string;
  existingProjectIds: string[];
  onAdded: () => void;
}) {
  const [open, setOpen]         = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch]     = useState('');
  const { data: allProjects = [] } = useAuditProjects();
  const importMut = useImportFromProjects(planId);

  // Show projects not already in the plan and NOT already marked includeInPlan
  // (those come via the main "Importar del Banco" panel)
  const available = allProjects.filter(
    p => !existingProjectIds.includes(p.id) && !p.includeInPlan,
  );
  const filtered = search
    ? available.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.correlative.toLowerCase().includes(search.toLowerCase()),
      )
    : available;

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 text-gray-500 text-xs rounded-xl hover:border-blue-400 hover:text-blue-600 w-full justify-center transition-colors">
        <Plus className="w-3.5 h-3.5" /> Agregar proyecto del Banco directamente
      </button>
    );
  }

  const handleAdd = async () => {
    if (!selectedId) return;
    await importMut.mutateAsync([selectedId]);
    setSelectedId('');
    setSearch('');
    setOpen(false);
    onAdded();
  };

  const RISK_COLORS: Record<string, string> = {
    CRITICO: 'text-red-600', ALTO: 'text-orange-600', MEDIO: 'text-amber-600', BAJO: 'text-green-600',
  };

  return (
    <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3">
      <div>
        <p className="text-xs font-semibold text-slate-700">Agregar proyecto del Banco directamente</p>
        <p className="text-[11px] text-slate-400 mt-0.5">
          Proyectos sin "Incluir en Plan" que quieres incorporar de forma directa.
        </p>
      </div>
      <input
        type="text" placeholder="Buscar por nombre o correlativo…"
        value={search} onChange={e => { setSearch(e.target.value); setSelectedId(''); }}
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {filtered.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-2">
          {available.length === 0
            ? 'Todos los proyectos del Banco ya están en este plan o marcados para importar.'
            : 'Sin resultados para esa búsqueda.'}
        </p>
      ) : (
        <div className="max-h-48 overflow-y-auto space-y-1">
          {filtered.map(p => (
            <label key={p.id}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-all text-xs ${
                selectedId === p.id
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}>
              <input type="radio" name="quick-add-project"
                value={p.id} checked={selectedId === p.id}
                onChange={() => setSelectedId(p.id)}
                className="accent-blue-600 flex-shrink-0" />
              <span className="font-mono text-gray-400 flex-shrink-0">{p.correlative}</span>
              <span className="flex-1 truncate text-gray-800 font-medium">{p.name}</span>
              {p.finalRiskLevel && (
                <span className={`flex-shrink-0 font-semibold ${RISK_COLORS[p.finalRiskLevel] ?? 'text-gray-500'}`}>
                  {p.finalRiskLevel}
                </span>
              )}
              <span className="flex-shrink-0 text-gray-400">{p.planYear}</span>
            </label>
          ))}
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <button onClick={handleAdd} disabled={!selectedId || importMut.isPending}
          className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
          {importMut.isPending ? 'Agregando…' : 'Agregar al plan'}
        </button>
        <button onClick={() => { setOpen(false); setSearch(''); setSelectedId(''); }}
          className="px-4 py-2 border border-gray-200 text-xs text-gray-600 rounded-lg hover:bg-gray-50">
          Cancelar
        </button>
      </div>
    </div>
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

  // Item can come from entity (legacy) or from AuditProject (P.4)
  const isFromProject = !!item.auditProjectId;
  const displayName  = isFromProject ? (item.auditProject?.name ?? '—') : (item.auditEntity?.name ?? '—');
  const displaySub   = isFromProject
    ? item.auditProject?.riskCategory ?? ''
    : item.auditEntity?.category ?? '';

  const rl = isFromProject && item.auditProject?.finalRiskLevel
    ? RISK_LEVEL_CONFIG[item.auditProject.finalRiskLevel]
    : null;

  const riskNum = isFromProject
    ? item.auditProject?.finalRiskScore
    : item.auditEntity?.inherentRiskScore;

  const handleSave = async () => {
    await updateItem.mutateAsync({
      itemId: item.id,
      data: { estimatedHours: +hours, priority: +prio },
    });
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
      {/* Risk indicator */}
      {isFromProject && rl ? (
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${rl.bg} ${rl.color}`}>
          <ShieldAlert className="w-4 h-4" />
        </div>
      ) : (
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${
          (riskNum ?? 0) >= 80 ? 'bg-red-50 text-red-700' :
          (riskNum ?? 0) >= 60 ? 'bg-amber-50 text-amber-700' :
          'bg-green-50 text-green-700'
        }`}>
          {riskNum ?? '—'}
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {isFromProject && (
            <span className="text-xs font-mono text-gray-400">{item.auditProject?.correlative}</span>
          )}
          <p className="text-sm font-medium text-gray-900 truncate">{displayName}</p>
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {displaySub && <span className="text-xs text-gray-400">{displaySub}</span>}
          {isFromProject && rl && (
            <span className={`text-xs px-1.5 py-0 rounded-full font-medium ${rl.bg} ${rl.color}`}>
              {rl.label}
            </span>
          )}
          {item.tentativeStartDate && (
            <span className="text-xs text-gray-400">
              · {formatDate(item.tentativeStartDate)} → {formatDate(item.tentativeEndDate)}
            </span>
          )}
          {isFromProject && item.auditProject?.totalBudget ? (
            <span className="text-xs text-gray-400 flex items-center gap-0.5">
              <DollarSign className="w-3 h-3" />{fmtCurrency(item.auditProject.totalBudget)}
            </span>
          ) : null}
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
                  if (confirm(`¿Quitar "${displayName}" del plan?`)) {
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
  const [showImportPanel, setShowImportPanel] = useState(false);

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
  const displayItems = showAllItems ? sortedItems : sortedItems.slice(0, 10);

  // Grouping: Legales (mandatorias) vs Por Riesgo
  const legalItems = sortedItems.filter(i => i.isMandatory || (i.auditProject as any)?.legalBasis);
  const riskItems  = sortedItems.filter(i => !i.isMandatory && !(i.auditProject as any)?.legalBasis);
  // Sub-group riskItems by riskCategory
  const riskByCategory = riskItems.reduce<Record<string, typeof riskItems>>((acc, item) => {
    const cat = (item.auditProject?.riskCategory) ?? 'Sin categoría';
    acc[cat] = [...(acc[cat] ?? []), item];
    return acc;
  }, {});

  const StatusIcon = { DRAFT: Clock, APPROVED: CheckCircle2, ACTIVE: Zap, CLOSED: Lock }[plan.status] ?? Clock;

  // Project-sourced items budget summary
  const projectItems = sortedItems.filter(i => i.auditProject);
  const totalProjectBudget = projectItems.reduce((s, i) => s + (i.auditProject?.totalBudget ?? 0), 0);

  // By category (for entity-sourced items)
  const byCategory = sortedItems
    .filter(i => i.auditEntity)
    .reduce<Record<string, typeof sortedItems>>((acc, item) => {
      const cat = item.auditEntity!.category;
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

      {showImportPanel && (
        <ImportFromBancoPanel planId={plan.id} planYear={plan.year} onClose={() => setShowImportPanel(false)} />
      )}

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

              {/* Workflow + Import buttons */}
              <div className="flex gap-2 flex-wrap justify-end">
                {canEdit && (
                  <button
                    onClick={() => setShowImportPanel(true)}
                    className="px-3 py-2 border border-indigo-300 text-indigo-700 bg-indigo-50 text-xs font-semibold rounded-xl hover:bg-indigo-100 transition-colors flex items-center gap-1.5">
                    <ClipboardList className="w-3.5 h-3.5" />
                    Importar del Banco
                  </button>
                )}
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

            {/* ── Left: Stats + Budget + Objectives + By category ── */}
            <div className="col-span-1 space-y-4">

              {/* Stats */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Resumen</p>
                <div className="space-y-2 text-sm">
                  {[
                    { label: 'Proyectos importados', value: projectItems.length },
                    { label: 'Entidades manuales',   value: sortedItems.filter(i => i.auditEntity).length },
                    { label: 'Horas asignadas',      value: `${plan.allocatedHours.toLocaleString('es-CL')} h` },
                    { label: 'Horas restantes',      value: `${Math.max(0, plan.remainingHours).toLocaleString('es-CL')} h` },
                    { label: 'Prioridad alta',       value: sortedItems.filter(i => i.priority === 1).length },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex justify-between">
                      <span className="text-gray-500 text-xs">{label}</span>
                      <span className="font-semibold text-gray-800 text-xs">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Budget from Banco */}
              {totalProjectBudget > 0 && (
                <div className="bg-indigo-50 rounded-2xl border border-indigo-200 p-4">
                  <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5" /> Presupuesto del plan
                  </p>
                  <p className="text-xl font-black text-indigo-800">{fmtCurrency(totalProjectBudget)}</p>
                  <p className="text-xs text-indigo-500 mt-0.5">
                    De {projectItems.length} proyecto{projectItems.length > 1 ? 's' : ''} importado{projectItems.length > 1 ? 's' : ''}
                  </p>
                </div>
              )}

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
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-gray-800">
                    Auditorías planificadas
                    <span className="ml-2 text-xs font-normal text-gray-400">{sortedItems.length} total</span>
                  </p>
                  <div className="flex items-center gap-1.5 text-xs text-gray-400">
                    <TrendingUp className="w-3.5 h-3.5" />
                    Agrupado por tipo
                  </div>
                </div>

                {sortedItems.length === 0 ? (
                  <div className="py-8 flex flex-col items-center text-gray-400">
                    <AlertTriangle className="w-8 h-8 mb-2 opacity-30" />
                    <p className="text-sm">Sin auditorías en el plan</p>
                    <p className="text-xs mt-1 text-center">
                      Importa desde el Banco de Proyectos o agrega auditorías manualmente
                    </p>
                  </div>
                ) : (
                  <>
                    {/* ── Grupo Legales ── */}
                    {legalItems.length > 0 && (
                      <div className="mb-3">
                        <div className="flex items-center gap-2 px-2 py-1.5 bg-rose-50 rounded-lg mb-1 border border-rose-100">
                          <ShieldAlert className="w-3.5 h-3.5 text-rose-600 flex-shrink-0" />
                          <span className="text-xs font-bold text-rose-700 uppercase tracking-wide">
                            Legales — Obligatorias por ley o norma ({legalItems.length})
                          </span>
                        </div>
                        {legalItems.map(item => (
                          <PlanItemRow key={item.id} item={item} planId={plan.id} canEdit={canEdit} />
                        ))}
                      </div>
                    )}

                    {/* ── Grupo Por Riesgo — sub-agrupado por Tipo de Riesgo ── */}
                    {riskItems.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 px-2 py-1.5 bg-blue-50 rounded-lg mb-1 border border-blue-100">
                          <TrendingUp className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                          <span className="text-xs font-bold text-blue-700 uppercase tracking-wide">
                            Por Riesgo — Evaluación periódica ({riskItems.length})
                          </span>
                        </div>
                        {Object.entries(riskByCategory).map(([cat, catItems]) => (
                          <div key={cat} className="mb-2">
                            {Object.keys(riskByCategory).length > 1 && (
                              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-2 py-1">
                                {cat}
                              </p>
                            )}
                            {catItems.map(item => (
                              <PlanItemRow key={item.id} item={item} planId={plan.id} canEdit={canEdit} />
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {canEdit && (
                  <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                    <button
                      onClick={() => setShowImportPanel(true)}
                      className="flex items-center gap-2 px-3 py-2 border border-dashed border-indigo-300 text-indigo-600 text-xs rounded-xl hover:border-indigo-400 hover:bg-indigo-50 w-full justify-center transition-colors">
                      <ClipboardList className="w-3.5 h-3.5" />
                      Importar del Banco de Proyectos
                    </button>
                    <QuickAddProjectForm
                      planId={plan.id}
                      existingProjectIds={sortedItems.map(i => i.auditProjectId ?? '').filter(Boolean)}
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
