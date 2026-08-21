'use client';

import React, { useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import {
  CalendarDays, Plus, Trash2, Clock, CheckCircle2, Zap, Lock,
  TrendingUp, AlertTriangle, ChevronDown, ChevronUp, Edit2, Save, X,
  Download, ClipboardList, DollarSign, ShieldAlert, BarChart3,
  Globe, AlertCircle, Calendar, Info, Printer, User, History, Users,
  Sparkles, Link2, Unlink,
} from 'lucide-react';
import NextLink from 'next/link';
import { apiClient } from '@/lib/api-client';
import { Header } from '@/components/layout/Header';
import {
  usePlan, useApprovePlan, useActivatePlan, useClosePlan,
  useUpdatePlanItem, useRemovePlanItem, useUpdatePlan,
  useImportFromProjects, usePlanProjectCandidates,
  useLinkableAudits, useLinkAudit, useUnlinkAudit,
  PLAN_STATUS_CONFIG, PRIORITY_CONFIG, RISK_LEVEL_CONFIG,
  PlanItem, ProjectCandidate, AuditPlan,
} from '@/hooks/usePlans';
import { useAuditProjects } from '@/hooks/useAuditProjects';
import { useUser } from '@/hooks/useUser';
import { cn } from '@/lib/utils';

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
  const [linking, setLinking] = useState(false);
  const [pickedAuditId, setPickedAuditId] = useState('');
  const [hours, setHours]     = useState(String(item.estimatedHours));
  const [prio,  setPrio]      = useState(String(item.priority));
  const [responsible, setResponsible]       = useState(item.responsibleName ?? '');
  const [teamNotesVal, setTeamNotesVal]     = useState(item.teamNotes ?? '');
  const [startDate, setStartDate] = useState(
    item.tentativeStartDate ? item.tentativeStartDate.slice(0, 10) : '',
  );
  const [endDate, setEndDate] = useState(
    item.tentativeEndDate ? item.tentativeEndDate.slice(0, 10) : '',
  );
  const updateItem = useUpdatePlanItem(planId);
  const removeItem = useRemovePlanItem(planId);
  const linkAudit   = useLinkAudit(planId);
  const unlinkAudit = useUnlinkAudit(planId);
  const { data: linkableAudits = [] } = useLinkableAudits(planId);
  const pr = PRIORITY_CONFIG[item.priority] ?? PRIORITY_CONFIG[2];

  const realHours = item.audit?.actualHours ?? null;
  const realPct = realHours !== null && item.estimatedHours > 0
    ? Math.round((realHours / item.estimatedHours) * 100) : null;
  const realTone = realPct === null ? 'text-gray-500'
    : realPct >= 100 ? 'text-red-600' : realPct >= 80 ? 'text-amber-600' : 'text-emerald-600';

  const handleLink = async () => {
    if (!pickedAuditId) return;
    await linkAudit.mutateAsync({ itemId: item.id, auditId: pickedAuditId });
    setLinking(false);
    setPickedAuditId('');
  };

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
      data: {
        estimatedHours:    +hours,
        priority:          +prio,
        responsibleName:   responsible || undefined,
        teamNotes:         teamNotesVal || undefined,
        tentativeStartDate: startDate || undefined,
        tentativeEndDate:   endDate || undefined,
      } as any,
    });
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
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
          {item.responsibleName && (
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <User className="w-3 h-3" />{item.responsibleName}
            </span>
          )}
          {item.audit ? (
            <NextLink
              href={`/dashboard/audits/${item.audit.id}`}
              className={cn('text-xs font-medium flex items-center gap-1 hover:underline', realTone)}
              title="Horas reales trabajadas en el encargo vinculado"
            >
              <Link2 className="w-3 h-3" />
              {realHours!.toFixed(1)}h reales{realPct !== null && ` (${realPct}%)`}
            </NextLink>
          ) : linking ? null : (
            <span className="text-xs text-gray-300">Sin encargo vinculado — 0h reales</span>
          )}
        </div>

        {linking && (
          <div className="flex items-center gap-1.5 mt-1.5">
            <select
              value={pickedAuditId}
              onChange={e => setPickedAuditId(e.target.value)}
              className="rounded border border-gray-200 px-2 py-1 text-xs bg-white max-w-[220px]"
            >
              <option value="">Seleccionar encargo…</option>
              {linkableAudits.map(a => (
                <option key={a.id} value={a.id}>{a.title}</option>
              ))}
            </select>
            <button onClick={handleLink} disabled={!pickedAuditId || linkAudit.isPending}
              className="text-xs px-2 py-1 rounded bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50">
              {linkAudit.isPending ? '...' : 'Vincular'}
            </button>
            <button onClick={() => { setLinking(false); setPickedAuditId(''); }}
              className="p-1 text-gray-400 hover:text-gray-600">
              <X className="w-3.5 h-3.5" />
            </button>
            {linkableAudits.length === 0 && (
              <span className="text-[11px] text-gray-400">No hay encargos sin vincular en esta organización.</span>
            )}
          </div>
        )}
      </div>

      {editing ? (
        <div className="flex items-center gap-2 flex-wrap">
          <input type="number" value={hours} onChange={e => setHours(e.target.value)}
            className="w-20 rounded border border-gray-200 px-2 py-1 text-xs" />
          <select value={prio} onChange={e => setPrio(e.target.value)}
            className="rounded border border-gray-200 px-2 py-1 text-xs bg-white">
            <option value="1">Alta</option>
            <option value="2">Media</option>
            <option value="3">Baja</option>
          </select>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            title="Inicio tentativo"
            className="rounded border border-gray-200 px-2 py-1 text-xs" />
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
            title="Fin tentativo"
            className="rounded border border-gray-200 px-2 py-1 text-xs" />
          <input
            type="text"
            placeholder="Responsable…"
            value={responsible}
            onChange={e => setResponsible(e.target.value)}
            className="w-28 rounded border border-gray-200 px-2 py-1 text-xs"
          />
          <input
            type="text"
            placeholder="Notas equipo…"
            value={teamNotesVal}
            onChange={e => setTeamNotesVal(e.target.value)}
            className="w-32 rounded border border-gray-200 px-2 py-1 text-xs"
          />
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
              {item.audit ? (
                <button
                  onClick={async () => {
                    if (confirm('¿Desvincular este encargo del ítem del plan? Las horas reales dejarán de mostrarse aquí.')) {
                      await unlinkAudit.mutateAsync(item.id);
                    }
                  }}
                  disabled={unlinkAudit.isPending}
                  title="Desvincular encargo"
                  className="p-1 text-gray-300 hover:text-amber-500 disabled:opacity-60">
                  <Unlink className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button onClick={() => setLinking(v => !v)} title="Vincular a un encargo real"
                  className="p-1 text-gray-300 hover:text-blue-500">
                  <Link2 className="w-3.5 h-3.5" />
                </button>
              )}
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

// ═══════════════════════════════════════════════════════════════════════════════
// ANÁLISIS DEL PLAN — Components
// ═══════════════════════════════════════════════════════════════════════════════

// ─── SVG Donut chart ──────────────────────────────────────────────────────────
function DonutChart({ segments, size = 130, strokeWidth = 22 }: {
  segments: { label: string; value: number; color: string; textColor: string }[];
  size?: number;
  strokeWidth?: number;
}) {
  const r  = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const C  = 2 * Math.PI * r;
  const total = segments.reduce((s, seg) => s + seg.value, 0);

  if (total === 0) {
    return (
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth={strokeWidth} />
      </svg>
    );
  }

  let cumulative = 0;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}
      style={{ transform: 'rotate(-90deg)' }}>
      {/* Track */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth={strokeWidth} />
      {segments.map(seg => {
        if (seg.value === 0) { return null; }
        const pct = seg.value / total;
        const dashLen = pct * C;
        const dashOffset = C * (1 - cumulative / total);
        cumulative += seg.value;
        return (
          <circle key={seg.label}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${dashLen} ${C}`}
            strokeDashoffset={dashOffset}
            strokeLinecap="butt"
          />
        );
      })}
    </svg>
  );
}

// ─── Quarterly Gantt Timeline ─────────────────────────────────────────────────
const QUARTER_COLORS: Record<string, { label: string; bg: string; text: string; border: string }> = {
  Q1: { label: 'T1 Ene–Mar', bg: 'bg-sky-50',    text: 'text-sky-700',    border: 'border-sky-200' },
  Q2: { label: 'T2 Abr–Jun', bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200' },
  Q3: { label: 'T3 Jul–Sep', bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200' },
  Q4: { label: 'T4 Oct–Dic', bg: 'bg-emerald-50',text: 'text-emerald-700',border: 'border-emerald-200' },
};

const GANTT_RISK_COLORS: Record<string, string> = {
  CRITICO: '#ef4444',
  ALTO:    '#f97316',
  MEDIO:   '#f59e0b',
  BAJO:    '#22c55e',
};

function getQuarter(date: Date): 'Q1' | 'Q2' | 'Q3' | 'Q4' {
  const m = date.getMonth(); // 0–11
  return m < 3 ? 'Q1' : m < 6 ? 'Q2' : m < 9 ? 'Q3' : 'Q4';
}

function QuarterlyTimeline({ items, year }: { items: PlanItem[]; year: number }) {
  const yearStart = new Date(year, 0, 1).getTime();
  const yearEnd   = new Date(year, 11, 31, 23, 59).getTime();
  const yearMs    = yearEnd - yearStart;

  // Only items with both dates
  const scheduled = items.filter(i => i.tentativeStartDate && i.tentativeEndDate);

  if (scheduled.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-gray-400">
        <Calendar className="w-10 h-10 mb-2 opacity-25" />
        <p className="text-sm font-medium">Sin fechas asignadas</p>
        <p className="text-xs mt-1">Edita las auditorías en la pestaña "Auditorías" para asignar fechas tentativas.</p>
      </div>
    );
  }

  // Group by quarter (based on start date)
  const byQuarter: Record<string, PlanItem[]> = { Q1: [], Q2: [], Q3: [], Q4: [] };
  scheduled.forEach(item => {
    const sd = new Date(item.tentativeStartDate!);
    byQuarter[getQuarter(sd)].push(item);
  });

  const quarters = (['Q1', 'Q2', 'Q3', 'Q4'] as const).filter(q => byQuarter[q].length > 0);

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex items-center gap-4 flex-wrap">
        {Object.entries(GANTT_RISK_COLORS).map(([level, color]) => (
          <span key={level} className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="w-3 h-3 rounded-sm inline-block flex-shrink-0" style={{ backgroundColor: color }} />
            {RISK_LEVEL_CONFIG[level]?.label ?? level}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-xs text-gray-600">
          <span className="w-3 h-3 rounded-sm inline-block flex-shrink-0 bg-blue-400" />
          Sin clasificar
        </span>
      </div>

      {quarters.map(q => {
        const qCfg = QUARTER_COLORS[q];
        const qItems = byQuarter[q];

        return (
          <div key={q} className={`rounded-xl border ${qCfg.border} overflow-hidden`}>
            {/* Quarter header */}
            <div className={`${qCfg.bg} px-4 py-2 flex items-center justify-between`}>
              <span className={`text-xs font-bold ${qCfg.text} uppercase tracking-wide`}>
                {qCfg.label}
              </span>
              <span className={`text-xs ${qCfg.text} opacity-70`}>
                {qItems.length} auditoría{qItems.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Timeline rows */}
            <div className="bg-white p-3 space-y-2">
              {qItems.map(item => {
                const name = item.auditProject?.name ?? item.auditEntity?.name ?? '—';
                const riskLevel = item.auditProject?.finalRiskLevel;
                const barColor = GANTT_RISK_COLORS[riskLevel ?? ''] ?? '#60a5fa';

                const sd = new Date(item.tentativeStartDate!).getTime();
                const ed = new Date(item.tentativeEndDate!).getTime();

                // Clamp to year boundaries
                const startClamped = Math.max(sd, yearStart);
                const endClamped   = Math.min(ed, yearEnd);

                const leftPct  = ((startClamped - yearStart) / yearMs) * 100;
                const widthPct = Math.max(((endClamped - startClamped) / yearMs) * 100, 0.5); // min 0.5%

                // Duration in weeks
                const durationDays = Math.round((ed - sd) / (1000 * 60 * 60 * 24));

                return (
                  <div key={item.id} className="flex items-center gap-3">
                    {/* Name */}
                    <div className="w-44 flex-shrink-0">
                      <p className="text-xs font-medium text-gray-800 truncate" title={name}>{name}</p>
                      {item.auditProject?.correlative && (
                        <p className="text-[10px] text-gray-400 font-mono">{item.auditProject.correlative}</p>
                      )}
                    </div>

                    {/* Bar track */}
                    <div className="flex-1 relative h-7 bg-gray-50 rounded-lg overflow-hidden border border-gray-100">
                      {/* Q dividers */}
                      {[25, 50, 75].map(pct => (
                        <div key={pct}
                          className="absolute top-0 bottom-0 w-px bg-gray-200"
                          style={{ left: `${pct}%` }} />
                      ))}
                      {/* Bar */}
                      <div
                        className="absolute top-1 bottom-1 rounded flex items-center px-1.5 text-white"
                        style={{
                          left:  `${leftPct}%`,
                          width: `${widthPct}%`,
                          backgroundColor: barColor,
                          minWidth: '4px',
                        }}>
                        {widthPct > 8 && (
                          <span className="text-[10px] font-semibold truncate leading-none">
                            {durationDays}d
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Hours */}
                    <div className="w-14 text-right flex-shrink-0">
                      <span className="text-xs text-gray-500 font-mono">
                        {item.estimatedHours.toLocaleString('es-CL')}h
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Quarter axis labels */}
            <div className="bg-gray-50 border-t border-gray-100 px-3 py-1">
              <div className="flex" style={{ marginLeft: '188px', marginRight: '64px' }}>
                {['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'].map((m, i) => (
                  <span key={m} className="flex-1 text-[9px] text-gray-400 text-center">{m}</span>
                ))}
              </div>
            </div>
          </div>
        );
      })}

      {/* Show unscheduled count */}
      {items.length - scheduled.length > 0 && (
        <p className="text-xs text-gray-400 text-center">
          <AlertCircle className="inline w-3.5 h-3.5 mr-1 text-amber-500" />
          {items.length - scheduled.length} auditoría{items.length - scheduled.length !== 1 ? 's' : ''} sin fechas tentativas asignadas
        </p>
      )}
    </div>
  );
}

// ─── Universe Coverage Report ─────────────────────────────────────────────────
function UniverseCoverageReport({ plan }: { plan: AuditPlan }) {
  const { data: allProjects = [], isLoading } = useAuditProjects();

  // Set of project IDs included in this plan
  const planProjectIds = useMemo(
    () => new Set(plan.items.map(i => i.auditProjectId).filter(Boolean)),
    [plan.items],
  );

  // All active projects, enriched with plan coverage
  const enriched = useMemo(() =>
    allProjects
      .filter(p => p.status !== 'CANCELLED')
      .map(p => ({ ...p, inThisPlan: planProjectIds.has(p.id) }))
      .sort((a, b) => {
        // Sort: in-plan first, then by risk score desc
        if (a.inThisPlan !== b.inThisPlan) return a.inThisPlan ? -1 : 1;
        return (b.finalRiskScore ?? 0) - (a.finalRiskScore ?? 0);
      }),
    [allProjects, planProjectIds],
  );

  const covered   = enriched.filter(p => p.inThisPlan).length;
  const total     = enriched.length;
  const pct       = total > 0 ? Math.round((covered / total) * 100) : 0;

  // Critical/High not in plan
  const criticalUncovered = enriched.filter(
    p => !p.inThisPlan && (p.finalRiskLevel === 'CRITICO' || p.finalRiskLevel === 'ALTO'),
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-gray-400">
        <Globe className="w-10 h-10 mb-2 opacity-25" />
        <p className="text-sm">No hay proyectos en el Banco de Proyectos</p>
      </div>
    );
  }

  const RISK_COLORS: Record<string, { bg: string; text: string }> = {
    CRITICO: { bg: 'bg-red-100',    text: 'text-red-700' },
    ALTO:    { bg: 'bg-orange-100', text: 'text-orange-700' },
    MEDIO:   { bg: 'bg-amber-100',  text: 'text-amber-700' },
    BAJO:    { bg: 'bg-green-100',  text: 'text-green-700' },
  };

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-3xl font-black text-gray-900">{covered}</p>
          <p className="text-xs text-gray-500 mt-1">En este plan</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-3xl font-black text-gray-400">{total - covered}</p>
          <p className="text-xs text-gray-500 mt-1">No incluidos</p>
        </div>
        <div className={cn(
          'rounded-xl border p-4 text-center',
          pct >= 70 ? 'bg-emerald-50 border-emerald-200' :
          pct >= 40 ? 'bg-amber-50 border-amber-200' :
          'bg-red-50 border-red-200',
        )}>
          <p className={cn(
            'text-3xl font-black',
            pct >= 70 ? 'text-emerald-700' : pct >= 40 ? 'text-amber-700' : 'text-red-700',
          )}>{pct}%</p>
          <p className="text-xs text-gray-500 mt-1">Cobertura del banco</p>
        </div>
      </div>

      {/* Critical/High uncovered alert */}
      {criticalUncovered.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-red-700">
              {criticalUncovered.length} proyecto{criticalUncovered.length > 1 ? 's' : ''} CRÍTICO/ALTO fuera del plan
            </p>
            <p className="text-xs text-red-500 mt-0.5">
              Estos proyectos tienen riesgo elevado y no están incluidos en el plan {plan.year}. Considera revisarlos.
            </p>
            <div className="flex flex-wrap gap-1 mt-2">
              {criticalUncovered.slice(0, 5).map(p => (
                <span key={p.id} className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-mono">
                  {p.correlative}
                </span>
              ))}
              {criticalUncovered.length > 5 && (
                <span className="text-[10px] text-red-500">+{criticalUncovered.length - 5} más</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* IIA Standard note */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-start gap-2">
        <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700">
          <span className="font-semibold">IIA Estándar 2010:</span> El plan de auditoría debe basarse en el universo de auditoría y reflejar el riesgo. Se recomienda una cobertura rotatoria del 100% del universo en un horizonte de 3 a 5 años.
        </p>
      </div>

      {/* Coverage table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Proyecto</th>
              <th className="text-left px-3 py-2.5 font-semibold text-gray-600 hidden sm:table-cell">Categoría</th>
              <th className="text-center px-3 py-2.5 font-semibold text-gray-600">Riesgo</th>
              <th className="text-center px-3 py-2.5 font-semibold text-gray-600">Últ. Auditoría</th>
              <th className="text-center px-3 py-2.5 font-semibold text-gray-600">Plan {plan.year}</th>
            </tr>
          </thead>
          <tbody>
            {enriched.map((p, idx) => {
              const rl = p.finalRiskLevel ? RISK_COLORS[p.finalRiskLevel] : null;
              const gapDays = p.coverageGapDays ?? null;

              let gapLabel = 'Sin registro';
              let gapColor = 'text-gray-400';
              if (gapDays !== null) {
                if (gapDays < 365) { gapLabel = `${Math.floor(gapDays / 30) || 1} meses`; gapColor = 'text-emerald-600'; }
                else if (gapDays < 730) { gapLabel = `${Math.floor(gapDays / 30)} meses`; gapColor = 'text-amber-600'; }
                else { gapLabel = `${(gapDays / 365).toFixed(1)} años`; gapColor = 'text-red-600'; }
              }

              return (
                <tr key={p.id}
                  className={cn(
                    'border-b border-gray-50 last:border-0',
                    p.inThisPlan ? 'bg-white' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50',
                  )}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-gray-400">{p.correlative}</span>
                      <span className="font-medium text-gray-800 truncate max-w-[180px]" title={p.name}>
                        {p.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-gray-500 hidden sm:table-cell">
                    {p.riskCategory ?? '—'}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {rl ? (
                      <span className={`px-1.5 py-0.5 rounded-full font-semibold ${rl.bg} ${rl.text}`}>
                        {RISK_LEVEL_CONFIG[p.finalRiskLevel!]?.label ?? p.finalRiskLevel}
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className={`px-3 py-2.5 text-center font-medium ${gapColor}`}>
                    {gapLabel}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {p.inThisPlan ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Incluido
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Capacity Heatmap ─────────────────────────────────────────────────────────
function CapacityHeatmap({ items, year }: { items: PlanItem[]; year: number }) {
  // Build map: responsible → month (0-11) → hours
  const responsibles = useMemo(() => {
    const map: Record<string, Record<number, number>> = {};

    items.forEach(item => {
      if (!item.responsibleName || !item.tentativeStartDate || !item.tentativeEndDate) return;
      const name = item.responsibleName;
      if (!map[name]) map[name] = {};

      const start = new Date(item.tentativeStartDate);
      const end = new Date(item.tentativeEndDate);
      const totalDays = Math.max((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24), 1);

      // Distribute hours proportionally across months
      let cur = new Date(start);
      while (cur <= end) {
        const mo = cur.getMonth();
        const monthEnd = new Date(cur.getFullYear(), mo + 1, 0);
        const daysInSlice = Math.min(
          (monthEnd.getTime() - cur.getTime()) / (1000 * 60 * 60 * 24) + 1,
          (end.getTime() - cur.getTime()) / (1000 * 60 * 60 * 24) + 1,
        );
        const hoursForMonth = (daysInSlice / totalDays) * item.estimatedHours;
        map[name][mo] = (map[name][mo] ?? 0) + hoursForMonth;
        cur = new Date(cur.getFullYear(), mo + 1, 1);
      }
    });

    return map;
  }, [items]);

  const names = Object.keys(responsibles);
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  // Get max hours for color scale
  const allValues = Object.values(responsibles).flatMap(m => Object.values(m));
  const maxHours = Math.max(...allValues, 1);

  const heatColor = (hours: number) => {
    if (hours === 0) return 'bg-gray-50 text-gray-300';
    const pct = hours / maxHours;
    if (pct >= 0.75) return 'bg-red-500 text-white';
    if (pct >= 0.50) return 'bg-orange-400 text-white';
    if (pct >= 0.25) return 'bg-amber-300 text-gray-800';
    return 'bg-blue-100 text-blue-800';
  };

  if (names.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-slate-500" />
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
            Mapa de capacidad por auditor
          </p>
        </div>
        <div className="flex flex-col items-center justify-center py-8 text-gray-400">
          <Users className="w-8 h-8 mb-2 opacity-25" />
          <p className="text-sm">Sin responsables asignados</p>
          <p className="text-xs mt-1">Edita las auditorías y asigna un responsable para ver el mapa.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-4 h-4 text-slate-500" />
        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
          Mapa de capacidad por auditor {year}
        </p>
        <div className="ml-auto flex items-center gap-2 text-[10px] text-gray-400">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-100 inline-block"/>Bajo</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-300 inline-block"/>Medio</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-400 inline-block"/>Alto</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500 inline-block"/>Crítico</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              <th className="text-left pr-3 pb-2 font-semibold text-gray-500 min-w-[140px]">Auditor</th>
              {months.map(m => (
                <th key={m} className="pb-2 font-semibold text-gray-500 text-center w-14">{m}</th>
              ))}
              <th className="pb-2 font-semibold text-gray-500 text-right pl-3">Total</th>
            </tr>
          </thead>
          <tbody>
            {names.map(name => {
              const row = responsibles[name];
              const total = Object.values(row).reduce((s, h) => s + h, 0);
              return (
                <tr key={name}>
                  <td className="pr-3 py-1 font-medium text-gray-700 truncate max-w-[140px]" title={name}>
                    {name}
                  </td>
                  {months.map((_, mi) => {
                    const h = Math.round(row[mi] ?? 0);
                    return (
                      <td key={mi} className="py-1 px-0.5">
                        <div className={`rounded text-center py-1.5 font-mono font-semibold text-[11px] ${heatColor(h)}`}
                          title={h > 0 ? `${h}h en ${months[mi]}` : undefined}>
                          {h > 0 ? h : ''}
                        </div>
                      </td>
                    );
                  })}
                  <td className="pl-3 py-1 text-right font-bold text-gray-700">
                    {Math.round(total)}h
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── L3.6: Plan Maturity Score ────────────────────────────────────────────────

function calcMaturityScore(plan: AuditPlan) {
  const items = plan.items;
  if (items.length === 0) return { score: 0, dimensions: [] as Array<{ label: string; pts: number; max: number; tip: string }> };

  const withDates = items.filter(i => i.tentativeStartDate && i.tentativeEndDate).length;
  const d1 = Math.round((withDates / items.length) * 25);

  const withResp = items.filter(i => i.responsibleName).length;
  const d2 = Math.round((withResp / items.length) * 25);

  const util = plan.utilizationPct;
  const d3 = Math.min(25,
    util >= 60 && util <= 95 ? 25
    : util >= 40 && util < 60 ? Math.round(((util - 40) / 20) * 15) + 10
    : util > 95 ? Math.max(0, Math.round(25 - (util - 95) * 1.5))
    : Math.round((util / 40) * 10),
  );

  const avgHours = items.reduce((s, i) => s + i.estimatedHours, 0) / items.length;
  const highPrio = items.filter(i => i.priority === 1);
  const highPrioAvg = highPrio.length > 0
    ? highPrio.reduce((s, i) => s + i.estimatedHours, 0) / highPrio.length : 0;
  const d4 = Math.min(25,
    highPrio.length === 0 ? 12
    : highPrioAvg >= avgHours ? 25
    : Math.round((highPrioAvg / avgHours) * 25),
  );

  return {
    score: d1 + d2 + d3 + d4,
    dimensions: [
      { label: 'Fechas asignadas',        pts: d1, max: 25, tip: `${withDates}/${items.length} ítems con fechas tentativas` },
      { label: 'Equipo asignado',         pts: d2, max: 25, tip: `${withResp}/${items.length} ítems con responsable` },
      { label: 'Utilización capacidad',   pts: d3, max: 25, tip: `${util}% — óptimo 60-95%` },
      { label: 'Alineación riesgo-horas', pts: d4, max: 25, tip: highPrio.length > 0 ? `Alta prioridad: ${highPrioAvg.toFixed(0)} h prom. vs ${avgHours.toFixed(0)} h general` : 'Sin ítems de alta prioridad' },
    ],
  };
}

function MaturityScoreCard({ plan }: { plan: AuditPlan }) {
  const { score, dimensions } = calcMaturityScore(plan);
  if (plan.items.length === 0) return null;
  const color = score >= 75 ? 'text-emerald-600' : score >= 50 ? 'text-amber-600' : 'text-red-600';
  const bg    = score >= 75 ? 'bg-emerald-50 border-emerald-200' : score >= 50 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200';
  const label = score >= 75 ? 'Plan maduro' : score >= 50 ? 'En desarrollo' : 'Necesita mejoras';
  return (
    <div className={`rounded-xl border p-4 ${bg}`}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Score de Madurez</p>
          <p className="text-[10px] text-gray-400 mt-0.5">Completitud del plan — 0 a 100</p>
        </div>
        <div className="text-right">
          <p className={`text-4xl font-black leading-none ${color}`}>{score}</p>
          <p className={`text-[11px] font-semibold mt-0.5 ${color}`}>{label}</p>
        </div>
      </div>
      <div className="space-y-2">
        {dimensions.map(d => (
          <div key={d.label}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-600">{d.label}</span>
              <span className="text-[11px] font-bold text-gray-700">{d.pts}/{d.max}</span>
            </div>
            <div className="h-1.5 bg-white/70 rounded-full overflow-hidden mt-0.5">
              <div className={`h-full rounded-full ${d.pts / d.max >= 0.8 ? 'bg-emerald-500' : d.pts / d.max >= 0.5 ? 'bg-amber-400' : 'bg-red-400'}`}
                style={{ width: `${(d.pts / d.max) * 100}%` }} />
            </div>
            <p className="text-[10px] text-gray-400 mt-0.5">{d.tip}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── L3.2: Auditor View Tab ───────────────────────────────────────────────────

function AuditorViewTab({ plan }: { plan: AuditPlan }) {
  const items = plan.items;

  const byAuditor = useMemo(() => {
    const map: Record<string, PlanItem[]> = {};
    items.forEach(item => {
      const name = item.responsibleName || '— Sin asignar';
      if (!map[name]) map[name] = [];
      map[name].push(item);
    });
    return Object.entries(map).sort((a, b) => {
      if (a[0].startsWith('—')) return 1;
      if (b[0].startsWith('—')) return -1;
      const hA = a[1].reduce((s, i) => s + i.estimatedHours, 0);
      const hB = b[1].reduce((s, i) => s + i.estimatedHours, 0);
      return hB - hA;
    });
  }, [items]);

  const maxHours = Math.max(
    ...byAuditor.map(([, its]) => its.reduce((s, i) => s + i.estimatedHours, 0)), 1,
  );

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <Users className="w-10 h-10 mb-2 opacity-25" />
        <p className="text-sm">Sin ítems en el plan</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400">
        {byAuditor.filter(([n]) => !n.startsWith('—')).length} auditor{byAuditor.filter(([n]) => !n.startsWith('—')).length !== 1 ? 'es' : ''} asignados
        · {byAuditor.find(([n]) => n.startsWith('—'))?.[1].length ?? 0} sin asignar
      </p>
      {byAuditor.map(([name, auditorItems]) => {
        const totalH = auditorItems.reduce((s, i) => s + i.estimatedHours, 0);
        const pct    = (totalH / maxHours) * 100;
        const unassigned = name.startsWith('—');
        return (
          <div key={name} className={`bg-white rounded-xl border p-4 ${unassigned ? 'border-dashed border-gray-200 opacity-60' : 'border-gray-200 shadow-sm'}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0 ${unassigned ? 'bg-gray-300' : 'bg-blue-600'}`}>
                  {unassigned ? '?' : name[0].toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">{name}</p>
                  <p className="text-xs text-gray-400">{auditorItems.length} auditoría{auditorItems.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-base font-bold text-gray-800">{totalH.toLocaleString('es-CL')} h</p>
                {plan.totalHours > 0 && (
                  <p className="text-[11px] text-gray-400">{Math.round((totalH / plan.totalHours) * 100)}% del plan</p>
                )}
              </div>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-3">
              <div className={`h-full rounded-full ${unassigned ? 'bg-gray-300' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="space-y-1">
              {auditorItems.map(item => {
                const itemName = item.auditProject?.name ?? item.auditEntity?.name ?? '—';
                const rl = item.auditProject?.finalRiskLevel;
                return (
                  <div key={item.id} className="flex items-center gap-2 py-1 border-b border-gray-50 last:border-0 text-xs">
                    {rl ? (
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${rl === 'CRITICO' ? 'bg-red-500' : rl === 'ALTO' ? 'bg-orange-500' : rl === 'MEDIO' ? 'bg-amber-400' : 'bg-green-500'}`} />
                    ) : <span className="w-2 h-2 rounded-full flex-shrink-0 bg-blue-300" />}
                    <span className="flex-1 text-gray-700 truncate">{itemName}</span>
                    {item.tentativeStartDate && (
                      <span className="text-[10px] text-gray-400 flex-shrink-0 hidden sm:inline">
                        {formatDate(item.tentativeStartDate)} → {formatDate(item.tentativeEndDate)}
                      </span>
                    )}
                    <span className="text-gray-500 flex-shrink-0 w-14 text-right font-medium">{item.estimatedHours} h</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Analysis Tab ─────────────────────────────────────────────────────────────
function AnalysisTab({ plan }: { plan: AuditPlan }) {
  const items = plan.items;

  // ── Risk level distribution ──
  const riskCounts = useMemo(() => {
    const counts: Record<string, number> = { CRITICO: 0, ALTO: 0, MEDIO: 0, BAJO: 0, SIN_NIVEL: 0 };
    items.forEach(item => {
      const lvl = item.auditProject?.finalRiskLevel;
      if (lvl && counts[lvl] !== undefined) counts[lvl]++;
      else counts.SIN_NIVEL++;
    });
    return counts;
  }, [items]);

  const riskDonutSegments = [
    { label: 'Crítico', value: riskCounts.CRITICO, color: '#ef4444', textColor: 'text-red-600' },
    { label: 'Alto',    value: riskCounts.ALTO,    color: '#f97316', textColor: 'text-orange-600' },
    { label: 'Medio',   value: riskCounts.MEDIO,   color: '#f59e0b', textColor: 'text-amber-600' },
    { label: 'Bajo',    value: riskCounts.BAJO,    color: '#22c55e', textColor: 'text-green-600' },
    { label: 'Sin nivel', value: riskCounts.SIN_NIVEL, color: '#cbd5e1', textColor: 'text-slate-500' },
  ].filter(s => s.value > 0);

  // ── Priority distribution ──
  const priorityCounts = useMemo(() => ({
    1: items.filter(i => i.priority === 1).length,
    2: items.filter(i => i.priority === 2).length,
    3: items.filter(i => i.priority === 3).length,
  }), [items]);
  const maxPrio = Math.max(...Object.values(priorityCounts), 1);

  // ── Scheduling alerts ──
  const withDates    = items.filter(i => i.tentativeStartDate).length;
  const withoutDates = items.length - withDates;
  const overCapacity = plan.utilizationPct > 100;
  const schedPct     = items.length > 0 ? Math.round((withDates / items.length) * 100) : 0;

  // ── Risk by category (from auditProject.riskCategory) ──
  const catCounts = useMemo(() => {
    const map: Record<string, { total: number; hours: number }> = {};
    items.forEach(item => {
      const cat = item.auditProject?.riskCategory ?? item.auditEntity?.category ?? 'Sin categoría';
      if (!map[cat]) map[cat] = { total: 0, hours: 0 };
      map[cat].total++;
      map[cat].hours += item.estimatedHours;
    });
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total);
  }, [items]);
  const maxCat = Math.max(...catCounts.map(([, v]) => v.total), 1);

  const totalBudget = items.reduce((s, i) => s + (i.auditProject?.totalBudget ?? 0), 0);
  const totalHours  = items.reduce((s, i) => s + i.estimatedHours, 0);

  return (
    <div className="space-y-5">

      {/* ── Row 0: Maturity Score ── */}
      <MaturityScoreCard plan={plan} />

      {/* ── Row 1: KPI Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: 'Auditorías en el plan',
            value: items.length,
            sub:   `${priorityCounts[1]} de alta prioridad`,
            icon: <ClipboardList className="w-5 h-5 text-blue-600" />,
            bg:   'bg-blue-50 border-blue-200',
          },
          {
            label: 'Horas planificadas',
            value: `${totalHours.toLocaleString('es-CL')} h`,
            sub:   plan.totalHours > 0 ? `${plan.utilizationPct}% de ${plan.totalHours.toLocaleString('es-CL')} h disponibles` : 'Capacidad sin definir',
            icon: <Clock className="w-5 h-5 text-violet-600" />,
            bg:   'bg-violet-50 border-violet-200',
          },
          {
            label: 'Con fechas asignadas',
            value: `${schedPct}%`,
            sub:   `${withDates} de ${items.length} auditorías`,
            icon: <Calendar className="w-5 h-5 text-amber-600" />,
            bg:   schedPct === 100 ? 'bg-emerald-50 border-emerald-200' : schedPct >= 50 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200',
          },
          {
            label: 'Presupuesto total',
            value: totalBudget > 0 ? fmtCurrency(totalBudget) : 'Sin datos',
            sub:   `De ${items.filter(i => i.auditProject?.totalBudget).length} proyectos con presupuesto`,
            icon: <DollarSign className="w-5 h-5 text-emerald-600" />,
            bg:   'bg-emerald-50 border-emerald-200',
          },
        ].map(card => (
          <div key={card.label} className={`rounded-xl border p-4 ${card.bg}`}>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-xs text-gray-500 mb-1">{card.label}</p>
                <p className="text-xl font-black text-gray-900 leading-tight">{card.value}</p>
                <p className="text-[11px] text-gray-500 mt-1">{card.sub}</p>
              </div>
              <div className="flex-shrink-0 opacity-70">{card.icon}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Row 2: Charts + Alerts ── */}
      <div className="grid grid-cols-3 gap-4">

        {/* Donut: Risk distribution */}
        <div className="col-span-1 bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Distribución por riesgo
          </p>
          {items.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">Sin auditorías en el plan</p>
          ) : (
            <div className="flex items-center gap-4">
              {/* SVG donut */}
              <div className="relative flex-shrink-0">
                <DonutChart segments={riskDonutSegments} size={110} strokeWidth={20} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-black text-gray-900 leading-none">{items.length}</span>
                  <span className="text-[10px] text-gray-400 leading-tight">total</span>
                </div>
              </div>
              {/* Legend */}
              <div className="flex-1 space-y-1.5">
                {riskDonutSegments.map(seg => (
                  <div key={seg.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: seg.color }} />
                      <span className="text-xs text-gray-600">{seg.label}</span>
                    </div>
                    <span className="text-xs font-semibold text-gray-800">{seg.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* By category bars */}
        <div className="col-span-1 bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Por tipo de riesgo
          </p>
          {catCounts.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">Sin datos</p>
          ) : (
            <div className="space-y-2.5">
              {catCounts.slice(0, 7).map(([cat, data]) => (
                <div key={cat}>
                  <div className="flex justify-between mb-0.5">
                    <span className="text-xs text-gray-600 truncate max-w-[140px]" title={cat}>{cat}</span>
                    <span className="text-xs font-semibold text-gray-800 ml-2">{data.total}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${(data.total / maxCat) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Alerts */}
        <div className="col-span-1 bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Alertas del plan
          </p>
          <div className="space-y-3">
            {/* Over-capacity */}
            {overCapacity && (
              <div className="flex items-start gap-2 p-2.5 bg-red-50 rounded-lg border border-red-200">
                <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-red-700">Capacidad superada</p>
                  <p className="text-[11px] text-red-500 mt-0.5">
                    {plan.utilizationPct}% de utilización. Considera reducir horas o aumentar la capacidad.
                  </p>
                </div>
              </div>
            )}

            {/* No dates */}
            {withoutDates > 0 && (
              <div className="flex items-start gap-2 p-2.5 bg-amber-50 rounded-lg border border-amber-200">
                <Calendar className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-amber-700">Fechas no asignadas</p>
                  <p className="text-[11px] text-amber-500 mt-0.5">
                    {withoutDates} auditoría{withoutDates > 1 ? 's' : ''} sin fechas tentativas.
                  </p>
                </div>
              </div>
            )}

            {/* Priority breakdown */}
            <div className="flex items-start gap-2 p-2.5 bg-slate-50 rounded-lg border border-slate-200">
              <TrendingUp className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs font-semibold text-slate-700">Distribución de prioridad</p>
                <div className="flex gap-3 mt-1.5">
                  {[
                    { label: 'Alta',  count: priorityCounts[1], color: 'bg-red-100 text-red-700' },
                    { label: 'Media', count: priorityCounts[2], color: 'bg-amber-100 text-amber-700' },
                    { label: 'Baja',  count: priorityCounts[3], color: 'bg-gray-100 text-gray-600' },
                  ].map(p => (
                    <span key={p.label} className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${p.color}`}>
                      {p.count} {p.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* All good */}
            {!overCapacity && withoutDates === 0 && items.length > 0 && (
              <div className="flex items-start gap-2 p-2.5 bg-emerald-50 rounded-lg border border-emerald-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-emerald-700">Plan bien configurado</p>
                  <p className="text-[11px] text-emerald-500 mt-0.5">
                    Todas las auditorías tienen fechas y la capacidad no está excedida.
                  </p>
                </div>
              </div>
            )}

            {items.length === 0 && (
              <div className="flex items-start gap-2 p-2.5 bg-gray-50 rounded-lg border border-gray-200">
                <Info className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-gray-500">
                  El plan aún no tiene auditorías. Ve a la pestaña <span className="font-semibold">Auditorías</span> para importarlas.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Row 3: Quarterly Timeline ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-4 h-4 text-blue-500" />
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
            Cronograma tentativo {plan.year}
          </p>
          <span className="ml-auto text-xs text-gray-400">
            {items.filter(i => i.tentativeStartDate).length} de {items.length} con fechas
          </span>
        </div>
        <QuarterlyTimeline items={items} year={plan.year} />
      </div>

      {/* ── Row 4: Universe Coverage ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-4">
          <Globe className="w-4 h-4 text-indigo-500" />
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
            Cobertura del Banco de Proyectos
          </p>
          <span className="ml-auto text-[10px] text-gray-400 font-medium uppercase tracking-wide">
            IIA Std. 2010
          </span>
        </div>
        <UniverseCoverageReport plan={plan} />
      </div>

      {/* ── Row 5: Capacity Heatmap by responsible ── */}
      <CapacityHeatmap items={items} year={plan.year} />

    </div>
  );
}

// ─── AddAmendmentForm ─────────────────────────────────────────────────────────
function AddAmendmentForm({ planId }: { planId: string }) {
  const [desc, setDesc] = useState('');
  const updatePlan = useUpdatePlan(planId);
  const { data: plan } = usePlan(planId);
  const { user } = useUser();
  const [open, setOpen] = useState(false);

  const handleAdd = async () => {
    if (!desc.trim()) return;
    const existing = (plan?.amendments as any[]) ?? [];
    const newEntry = {
      date: new Date().toISOString(),
      description: desc.trim(),
      approvedBy: user?.name ?? 'Sistema',
    };
    await updatePlan.mutateAsync({ amendments: [...existing, newEntry] as any });
    setDesc('');
    setOpen(false);
  };

  if (!open) return (
    <button onClick={() => setOpen(true)}
      className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline mb-2 mt-1">
      <Plus className="w-3.5 h-3.5" /> Registrar cambio
    </button>
  );

  return (
    <div className="flex gap-2 items-center mb-3 mt-1">
      <input
        type="text"
        placeholder="Describe el cambio o justificación…"
        value={desc}
        onChange={e => setDesc(e.target.value)}
        className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
        onKeyDown={e => e.key === 'Enter' && handleAdd()}
      />
      <button onClick={handleAdd} disabled={!desc.trim() || updatePlan.isPending}
        className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg disabled:opacity-50">
        Guardar
      </button>
      <button onClick={() => { setOpen(false); setDesc(''); }}
        className="px-3 py-1.5 border border-gray-200 text-xs text-gray-600 rounded-lg">
        Cancelar
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function PlanDetailPage() {
  const params = useParams<{ id: string }>();
  const { data: plan, isLoading } = usePlan(params.id);
  const { user } = useUser();
  const [editingObjectives, setEditObj] = useState(false);
  const [objText, setObjText] = useState('');
  const [showAllItems, setShowAll] = useState(false);
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [planTab, setPlanTab] = useState<'audits' | 'analysis' | 'auditors'>('audits');
  const [showLog, setShowLog] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);

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

  const legalItems = sortedItems.filter(i => i.isMandatory || (i.auditProject as any)?.legalBasis);
  const riskItems  = sortedItems.filter(i => !i.isMandatory && !(i.auditProject as any)?.legalBasis);
  const riskByCategory = riskItems.reduce<Record<string, typeof riskItems>>((acc, item) => {
    const cat = (item.auditProject?.riskCategory) ?? 'Sin categoría';
    acc[cat] = [...(acc[cat] ?? []), item];
    return acc;
  }, {});

  const StatusIcon = { DRAFT: Clock, APPROVED: CheckCircle2, ACTIVE: Zap, CLOSED: Lock }[plan.status] ?? Clock;

  const projectItems = sortedItems.filter(i => i.auditProject);
  const totalProjectBudget = projectItems.reduce((s, i) => s + (i.auditProject?.totalBudget ?? 0), 0);

  const byCategory = sortedItems
    .filter(i => i.auditEntity)
    .reduce<Record<string, typeof sortedItems>>((acc, item) => {
      const cat = item.auditEntity!.category;
      acc[cat] = [...(acc[cat] ?? []), item];
      return acc;
    }, {});

  const handleGenerateSummary = async () => {
    setAiLoading(true);
    setShowAiPanel(true);
    setAiSummary(null);
    const itemLines = plan.items.slice(0, 25).map((item, idx) => {
      const name = item.auditProject?.name ?? item.auditEntity?.name ?? '—';
      const risk = item.auditProject?.finalRiskLevel ?? '—';
      return `${idx + 1}. ${name} | Riesgo: ${risk} | Horas: ${item.estimatedHours} | Responsable: ${item.responsibleName ?? 'Sin asignar'}`;
    }).join('\n');
    const prompt = `Eres el asistente de auditoría CASSANDRA. Genera un resumen ejecutivo profesional del Plan Anual de Auditoría ${plan.year} para el Comité de Auditoría Interna.

Datos del plan:
- Nombre: ${plan.name}
- Estado: ${PLAN_STATUS_CONFIG[plan.status].label}
- Horas: ${plan.allocatedHours} asignadas de ${plan.totalHours} disponibles (${plan.utilizationPct}% utilización)
- Auditorías planificadas: ${plan.items.length}
- Prioridad alta: ${plan.items.filter(i => i.priority === 1).length} | Media: ${plan.items.filter(i => i.priority === 2).length} | Baja: ${plan.items.filter(i => i.priority === 3).length}
- Objetivos del plan: ${plan.objectives.join('; ') || 'No definidos'}

Auditorías incluidas:
${itemLines}

Genera en español un resumen ejecutivo de 3-4 párrafos (máximo 350 palabras) que incluya: síntesis del alcance y cobertura, principales riesgos priorizados, distribución de recursos y conclusión ejecutiva. Usa lenguaje formal para el Comité de Auditoría.`;
    try {
      const result = await apiClient.post<{ response: string }>('/ai/chat', {
        agentType: 'CASSANDRA',
        message: prompt,
        history: [],
      });
      setAiSummary(result.response);
    } catch {
      setAiSummary('Error al conectar con el servicio de IA. Verifica que el AI Service esté activo (puerto 3003).');
    } finally {
      setAiLoading(false);
    }
  };

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

      {/* ── L3.3: AI Summary Modal ── */}
      {showAiPanel && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-10">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-violet-500" />
                <div>
                  <p className="text-sm font-bold text-gray-800">Resumen Ejecutivo del Plan {plan.year}</p>
                  <p className="text-xs text-gray-400">Generado por IA — Solo lectura</p>
                </div>
              </div>
              <button onClick={() => setShowAiPanel(false)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-5 min-h-40">
              {aiLoading ? (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-gray-500">Analizando el plan con IA…</p>
                </div>
              ) : aiSummary ? (
                <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap leading-relaxed">
                  {aiSummary}
                </div>
              ) : null}
            </div>
            <div className="border-t border-gray-100 px-6 py-4 flex justify-between">
              <button
                onClick={handleGenerateSummary}
                disabled={aiLoading}
                className="flex items-center gap-1.5 text-xs text-violet-600 hover:underline disabled:opacity-50">
                <Sparkles className="w-3.5 h-3.5" /> Regenerar
              </button>
              <button onClick={() => setShowAiPanel(false)}
                className="px-4 py-2 border border-gray-200 text-sm text-gray-600 rounded-xl hover:bg-gray-50">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto px-6 py-6 space-y-4">

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
                <button onClick={() => window.print()}
                  className="px-3 py-2 border border-gray-300 text-gray-600 text-xs font-semibold rounded-xl hover:bg-gray-50 transition-colors flex items-center gap-1.5"
                  data-no-print>
                  <Printer className="w-3.5 h-3.5" />
                  PDF / Imprimir
                </button>
                <button
                  onClick={handleGenerateSummary}
                  disabled={aiLoading || plan.items.length === 0}
                  className="px-3 py-2 border border-violet-300 bg-violet-50 text-violet-700 text-xs font-semibold rounded-xl hover:bg-violet-100 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                  data-no-print
                  title="Genera un resumen ejecutivo del plan usando IA (Gemini)">
                  <Sparkles className="w-3.5 h-3.5" />
                  {aiLoading ? 'Generando...' : '✨ Resumen IA'}
                </button>
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

          {/* ── Tab switcher ── */}
          <div className="flex border-b border-gray-200 bg-white rounded-t-xl overflow-hidden">
            <button
              onClick={() => setPlanTab('audits')}
              className={cn(
                'flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors border-b-2',
                planTab === 'audits'
                  ? 'border-blue-600 text-blue-600 bg-blue-50/40'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50',
              )}>
              <ClipboardList className="w-4 h-4" />
              Auditorías planificadas
              <span className="ml-1 text-xs text-gray-400 font-normal">({sortedItems.length})</span>
            </button>
            <button
              onClick={() => setPlanTab('analysis')}
              className={cn(
                'flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors border-b-2',
                planTab === 'analysis'
                  ? 'border-blue-600 text-blue-600 bg-blue-50/40'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50',
              )}>
              <BarChart3 className="w-4 h-4" />
              Análisis del plan
            </button>
            <button
              onClick={() => setPlanTab('auditors')}
              className={cn(
                'flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors border-b-2',
                planTab === 'auditors'
                  ? 'border-blue-600 text-blue-600 bg-blue-50/40'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50',
              )}>
              <Users className="w-4 h-4" />
              Por Auditor
            </button>
          </div>

          {/* ── Tab: Auditorías ── */}
          {planTab === 'audits' && (
            <div className="grid grid-cols-3 gap-4">

              {/* Left: Stats + Budget + Objectives + By category */}
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
                      { label: 'Auditorías iniciadas',  value: `${plan.startedItems} de ${sortedItems.length}` },
                      { label: 'Horas reales',          value: `${plan.realHours.toLocaleString('es-CL')} h` },
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

              {/* Right: Items list */}
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
                      {/* Grupo Legales */}
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

                      {/* Grupo Por Riesgo */}
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

              {/* L2.2 — Change log */}
              <div className="col-span-3 bg-white rounded-2xl border border-gray-200 shadow-sm">
                <button
                  onClick={() => setShowLog(v => !v)}
                  className="w-full flex items-center justify-between px-5 py-3 text-xs font-semibold text-gray-600 hover:bg-gray-50 rounded-2xl transition-colors">
                  <span className="flex items-center gap-2">
                    <History className="w-4 h-4" />
                    Historial de cambios del plan
                    {(plan.amendments as any[])?.length > 0 && (
                      <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                        {(plan.amendments as any[]).length}
                      </span>
                    )}
                  </span>
                  {showLog ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {showLog && (
                  <div className="px-5 pb-4">
                    {canEdit && <AddAmendmentForm planId={plan.id} />}
                    {!(plan.amendments as any[])?.length ? (
                      <p className="text-xs text-gray-400 py-3 text-center">Sin cambios registrados</p>
                    ) : (
                      <div className="space-y-2 mt-2">
                        {[...(plan.amendments as any[])].reverse().map((a: any, i: number) => (
                          <div key={i} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
                            <div className="flex-1">
                              <p className="text-xs text-gray-700">{a.description}</p>
                              <p className="text-[11px] text-gray-400 mt-0.5">
                                {a.approvedBy && <span className="font-medium">{a.approvedBy} · </span>}
                                {a.date ? new Date(a.date).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Tab: Análisis ── */}
          {planTab === 'analysis' && <AnalysisTab plan={plan} />}

          {/* ── Tab: Por Auditor (L3.2) ── */}
          {planTab === 'auditors' && <AuditorViewTab plan={plan} />}

        </div>
      </div>
    </div>
  );
}
