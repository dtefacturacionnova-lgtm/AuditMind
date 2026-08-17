'use client';
import { useState } from 'react';
import Link from 'next/link';
import {
  Search, Plus, ClipboardList, Lock,
  ChevronDown, Sparkles, FileText,
  AlertTriangle, Calendar, ArrowRight,
  TrendingUp, CheckCircle2, Clock, XCircle,
  FileArchive,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { useAudits } from '@/hooks/useAudits';
import { formatDate } from '@/lib/utils';
import {
  AUDIT_TYPES, AUDIT_SUBTYPES,
  getTypeLabel, getSubtypeLabel,
  TYPE_BADGE,
} from '@/lib/audit-types';
import { AtlasAnalysisModal } from '@/components/audits/AtlasAnalysisModal';
import { RestoreBackupModal } from '@/components/audits/RestoreBackupModal';

// ─── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, {
  label: string; bg: string; text: string; border: string;
  bar: string; icon: React.ElementType;
}> = {
  PLANNING:    { label: 'Planificación', bg: 'bg-blue-50',    text: 'text-blue-700',   border: 'border-blue-200',   bar: 'bg-blue-400',    icon: Clock },
  IN_PROGRESS: { label: 'En Progreso',  bg: 'bg-indigo-50',  text: 'text-indigo-700', border: 'border-indigo-200', bar: 'bg-indigo-500',  icon: TrendingUp },
  REVIEW:      { label: 'En Revisión',  bg: 'bg-amber-50',   text: 'text-amber-700',  border: 'border-amber-200',  bar: 'bg-amber-400',   icon: Clock },
  CLOSED:      { label: 'Cerrada',      bg: 'bg-emerald-50', text: 'text-emerald-700',border: 'border-emerald-200',bar: 'bg-emerald-500', icon: CheckCircle2 },
  CANCELLED:   { label: 'Cancelada',    bg: 'bg-red-50',     text: 'text-red-600',    border: 'border-red-200',    bar: 'bg-red-400',     icon: XCircle },
};

// ─── Risk config ───────────────────────────────────────────────────────────────

const RISK_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  CRITICAL: { label: 'Crítico',  bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500' },
  HIGH:     { label: 'Alto',     bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500' },
  MEDIUM:   { label: 'Medio',    bg: 'bg-yellow-100', text: 'text-yellow-700', dot: 'bg-yellow-500' },
  LOW:      { label: 'Bajo',     bg: 'bg-blue-100',   text: 'text-blue-700',   dot: 'bg-blue-400' },
  MINIMAL:  { label: 'Mínimo',   bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-400' },
};

// ─── Status accent bar colors (left edge of card) ─────────────────────────────

const STATUS_ACCENT: Record<string, string> = {
  PLANNING:    'bg-blue-400',
  IN_PROGRESS: 'bg-indigo-500',
  REVIEW:      'bg-amber-400',
  CLOSED:      'bg-emerald-500',
  CANCELLED:   'bg-red-400',
};

// ─── Compute period progress percentage ───────────────────────────────────────

function periodProgress(startDate?: string | null, endDate?: string | null): number | null {
  if (!startDate || !endDate) return null;
  const start = new Date(startDate).getTime();
  const end   = new Date(endDate).getTime();
  const now   = Date.now();
  if (end <= start) return null;
  return Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)));
}

const STATUS_FILTERS = [
  { label: 'Todos los estados', value: '' },
  { label: 'Planificación',     value: 'PLANNING' },
  { label: 'En Progreso',       value: 'IN_PROGRESS' },
  { label: 'En Revisión',       value: 'REVIEW' },
  { label: 'Cerradas',          value: 'CLOSED' },
  { label: 'Canceladas',        value: 'CANCELLED' },
];

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function AuditsPage() {
  const [search,    setSearch]    = useState('');
  const [status,    setStatus]    = useState('');
  const [type,      setType]      = useState('');
  const [subtype,   setSubtype]   = useState('');
  const [page,      setPage]      = useState(1);
  const [showAtlas, setShowAtlas] = useState(false);
  const [showRestore, setShowRestore] = useState(false);

  function handleTypeChange(v: string) {
    setType(v);
    setSubtype('');
    setPage(1);
  }

  const { data, isLoading } = useAudits({ search, status, type, subtype, page });

  // ── KPI counts ──────────────────────────────────────────────────────────────
  const allAudits  = data?.data ?? [];
  const kpiCounts  = {
    active:   allAudits.filter(a => a.status === 'IN_PROGRESS').length,
    planning: allAudits.filter(a => a.status === 'PLANNING').length,
    review:   allAudits.filter(a => a.status === 'REVIEW').length,
    closed:   allAudits.filter(a => a.status === 'CLOSED').length,
  };

  return (
    <div className="min-h-full bg-[#F0F4F8]">
      <Header
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Auditorías' },
        ]}
      />

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-5">

        {/* ── Page title + CTA ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Auditorías</h1>
            {data && (
              <p className="text-sm text-gray-400 mt-0.5">
                {data.meta.total} auditorías en tu organización
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAtlas(true)}
              className="flex items-center gap-1.5 rounded-xl border border-violet-200 bg-white px-4 py-2 text-sm font-medium text-violet-700 hover:bg-violet-50 shadow-sm transition-colors"
            >
              <Sparkles className="h-4 w-4" />
              Análisis Multi-Año
            </button>
            {/* BKP-09 — restaurar un backup (siempre como encargo nuevo) */}
            <button
              onClick={() => setShowRestore(true)}
              className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 shadow-sm transition-colors"
              title="Restaurar un backup como encargo nuevo"
            >
              <FileArchive className="h-4 w-4" />
              Restaurar Backup
            </button>
            <Link
              href="/dashboard/audits/new"
              className="flex items-center gap-1.5 rounded-xl bg-[#0F2D4A] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#1a4a7a] transition-colors"
            >
              <Plus className="h-4 w-4" />
              Nueva Auditoría
            </Link>
          </div>
        </div>

        {/* ── KPI chips ─────────────────────────────────────────────────────── */}
        {data && (
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => { setStatus(''); setPage(1); }}
              className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
                status === ''
                  ? 'bg-[#0F2D4A] text-white border-[#0F2D4A] shadow-sm'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              <span className="font-bold">{data.meta.total}</span>
              <span className="opacity-80">Total</span>
            </button>
            {[
              { key: 'IN_PROGRESS', count: kpiCounts.active,   label: 'En Progreso',  color: 'indigo' },
              { key: 'PLANNING',    count: kpiCounts.planning, label: 'Planificación', color: 'blue' },
              { key: 'REVIEW',      count: kpiCounts.review,   label: 'En Revisión',  color: 'amber' },
              { key: 'CLOSED',      count: kpiCounts.closed,   label: 'Cerradas',     color: 'emerald' },
            ].map(kpi => {
              const colorMap: Record<string, string> = {
                indigo:  'bg-indigo-50 text-indigo-700 border-indigo-200',
                blue:    'bg-blue-50 text-blue-700 border-blue-200',
                amber:   'bg-amber-50 text-amber-700 border-amber-200',
                emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
              };
              const activeMap: Record<string, string> = {
                indigo:  'bg-indigo-600 text-white border-indigo-600',
                blue:    'bg-blue-600 text-white border-blue-600',
                amber:   'bg-amber-500 text-white border-amber-500',
                emerald: 'bg-emerald-600 text-white border-emerald-600',
              };
              const isActive = status === kpi.key;
              return (
                <button
                  key={kpi.key}
                  onClick={() => { setStatus(isActive ? '' : kpi.key); setPage(1); }}
                  className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-colors shadow-sm ${
                    isActive ? activeMap[kpi.color] : colorMap[kpi.color] + ' hover:opacity-80'
                  }`}
                >
                  <span className="font-bold">{kpi.count}</span>
                  <span className="opacity-80">{kpi.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* ── Filters bar ───────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por título..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 py-2.5 text-sm placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 shadow-sm"
            />
          </div>

          <div className="relative">
            <select
              value={type}
              onChange={(e) => handleTypeChange(e.target.value)}
              className="appearance-none rounded-xl border border-gray-200 bg-white pl-3 pr-8 py-2.5 text-sm text-gray-700 focus:border-blue-400 focus:outline-none shadow-sm"
            >
              <option value="">Todos los tipos</option>
              {AUDIT_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          </div>

          {type && AUDIT_SUBTYPES[type]?.length > 0 && (
            <div className="relative">
              <select
                value={subtype}
                onChange={(e) => { setSubtype(e.target.value); setPage(1); }}
                className="appearance-none rounded-xl border border-blue-200 bg-blue-50 pl-3 pr-8 py-2.5 text-sm text-blue-700 focus:border-blue-400 focus:outline-none shadow-sm"
              >
                <option value="">Todos los sub-tipos</option>
                {AUDIT_SUBTYPES[type].map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-blue-400" />
            </div>
          )}
        </div>

        {/* ── Audit cards list ──────────────────────────────────────────────── */}
        <div className="space-y-3">
          {isLoading ? (
            [...Array(4)].map((_, i) => (
              <div key={i} className="h-24 rounded-2xl bg-white border border-gray-200 animate-pulse shadow-sm" />
            ))
          ) : allAudits.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 bg-white rounded-2xl border border-gray-200 shadow-sm text-center">
              <div className="w-16 h-16 rounded-2xl bg-gray-50 border border-gray-200 flex items-center justify-center mb-4">
                <ClipboardList className="h-8 w-8 text-gray-300" />
              </div>
              <p className="text-base font-semibold text-gray-500">No hay auditorías</p>
              <p className="text-sm text-gray-400 mt-1 mb-5">Crea la primera auditoría de tu organización</p>
              <Link
                href="/dashboard/audits/new"
                className="flex items-center gap-2 rounded-xl bg-[#0F2D4A] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1a4a7a]"
              >
                <Plus className="h-4 w-4" /> Nueva Auditoría
              </Link>
            </div>
          ) : (
            allAudits.map((audit) => {
              const st      = STATUS_CONFIG[audit.status] ?? STATUS_CONFIG.PLANNING;
              const accent  = STATUS_ACCENT[audit.status] ?? 'bg-gray-300';
              const risk    = audit.riskLevel ? (RISK_CONFIG[audit.riskLevel] ?? null) : null;
              const pct     = periodProgress(audit.startDate, audit.endDate);
              const StatusIcon = st.icon;
              const findings   = audit._count?.findings ?? 0;
              const papers     = audit._count?.workingPapers ?? 0;

              return (
                <Link
                  key={audit.id}
                  href={`/dashboard/audits/${audit.id}`}
                  className="group block bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md hover:border-[#0F2D4A]/20 transition-all overflow-hidden"
                >
                  <div className="flex items-stretch">
                    {/* Left accent bar */}
                    <div className={`w-1 flex-shrink-0 ${accent}`} />

                    <div className="flex-1 px-5 py-4 min-w-0">
                      {/* Top row: code + title + investigation badge */}
                      <div className="flex items-start gap-3 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <span className="font-mono text-xs font-bold text-[#0F2D4A]/60 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-lg">
                              {audit.code}
                            </span>
                            {audit.isInvestigationMode && (
                              <span className="flex items-center gap-1 text-[10px] font-semibold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                                <Lock className="h-2.5 w-2.5" /> Investigación
                              </span>
                            )}
                          </div>
                          <h3 className="text-base font-bold text-gray-900 truncate group-hover:text-[#0F2D4A]">
                            {audit.title}
                          </h3>
                          {audit.auditableUnit?.name && (
                            <p className="text-xs text-gray-400 mt-0.5 truncate">{audit.auditableUnit.name}</p>
                          )}
                        </div>

                        {/* Right: arrow */}
                        <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center group-hover:bg-[#0F2D4A] group-hover:border-[#0F2D4A] transition-colors mt-0.5">
                          <ArrowRight className="h-3.5 w-3.5 text-gray-400 group-hover:text-white transition-colors" />
                        </div>
                      </div>

                      {/* Middle row: badges */}
                      <div className="flex items-center gap-2 flex-wrap mb-3">
                        {/* Status */}
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${st.bg} ${st.text} ${st.border}`}>
                          <StatusIcon className="h-3 w-3" />
                          {st.label}
                        </span>

                        {/* Type */}
                        <span className={`inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded-full ${TYPE_BADGE[audit.type] ?? 'bg-gray-100 text-gray-600'}`}>
                          {getTypeLabel(audit.type)}
                        </span>

                        {/* Subtype */}
                        {audit.subtype && (
                          <span className="text-[11px] text-gray-400 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">
                            {getSubtypeLabel(audit.type, audit.subtype)}
                          </span>
                        )}

                        {/* Risk */}
                        {risk && (
                          <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ${risk.bg} ${risk.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${risk.dot}`} />
                            {risk.label}
                          </span>
                        )}

                        {/* Period */}
                        {(audit.startDate || audit.endDate) && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
                            <Calendar className="h-3 w-3" />
                            {formatDate(audit.startDate)} – {formatDate(audit.endDate)}
                          </span>
                        )}
                      </div>

                      {/* Bottom row: progress bar + stats */}
                      <div className="flex items-center gap-4">
                        {/* Period progress bar */}
                        {pct !== null && audit.status !== 'CLOSED' && audit.status !== 'CANCELLED' && (
                          <div className="flex-1 flex items-center gap-2 min-w-0 max-w-xs">
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  pct >= 90 ? 'bg-red-400' : pct >= 70 ? 'bg-amber-400' : 'bg-blue-400'
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-gray-400 font-medium flex-shrink-0">{pct}%</span>
                          </div>
                        )}

                        {/* Stats pills */}
                        <div className="flex items-center gap-2 ml-auto">
                          <div className="flex items-center gap-1 text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1">
                            <FileText className="h-3 w-3 text-blue-400" />
                            <span className="font-semibold text-gray-700">{papers}</span>
                            <span className="text-gray-400">PT</span>
                          </div>
                          <div className={`flex items-center gap-1 text-xs rounded-lg px-2.5 py-1 border ${
                            findings > 0
                              ? 'bg-amber-50 border-amber-100 text-amber-700'
                              : 'bg-gray-50 border-gray-100 text-gray-400'
                          }`}>
                            <AlertTriangle className="h-3 w-3" />
                            <span className="font-semibold">{findings}</span>
                            <span className={findings > 0 ? 'text-amber-500' : ''}>Hall.</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>

        {/* ── Pagination ────────────────────────────────────────────────────── */}
        {data && data.meta.totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">
              Página {data.meta.page} de {data.meta.totalPages} · {data.meta.total} resultados
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => p - 1)}
                disabled={!data.meta.hasPrev}
                className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-gray-600 disabled:opacity-40 hover:bg-gray-50 transition-colors shadow-sm"
              >
                ← Anterior
              </button>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={!data.meta.hasNext}
                className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-gray-600 disabled:opacity-40 hover:bg-gray-50 transition-colors shadow-sm"
              >
                Siguiente →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ATLAS modal */}
      {showAtlas && (
        <AtlasAnalysisModal
          audits={(data?.data ?? []).map(a => ({
            id:            a.id,
            title:         a.title,
            status:        a.status,
            startDate:     a.startDate ?? undefined,
            endDate:       a.endDate   ?? undefined,
            type:          a.type      ?? undefined,
            riskLevel:     a.riskLevel ?? undefined,
            findingsCount: a._count?.findings ?? 0,
          }))}
          onClose={() => setShowAtlas(false)}
        />
      )}

      {showRestore && (
        <RestoreBackupModal onClose={() => setShowRestore(false)} />
      )}
    </div>
  );
}
