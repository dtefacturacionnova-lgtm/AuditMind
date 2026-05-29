'use client';
import { useState } from 'react';
import Link from 'next/link';
import {
  Search, Plus, ClipboardList,
  ArrowRight, Lock, ChevronDown, Sparkles,
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

const STATUS_STYLES: Record<string, string> = {
  PLANNING:    'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-indigo-100 text-indigo-700',
  REVIEW:      'bg-amber-100 text-amber-700',
  CLOSED:      'bg-emerald-100 text-emerald-700',
  CANCELLED:   'bg-red-50 text-red-600',
};

const STATUS_LABELS: Record<string, string> = {
  PLANNING: 'Planificación', IN_PROGRESS: 'En Progreso',
  REVIEW: 'En Revisión', CLOSED: 'Cerrada', CANCELLED: 'Cancelada',
};

const RISK_STYLES: Record<string, string> = {
  CRITICAL: 'bg-red-600 text-white',
  HIGH:     'bg-orange-500 text-white',
  MEDIUM:   'bg-yellow-400 text-yellow-900',
  LOW:      'bg-blue-400 text-white',
  MINIMAL:  'bg-green-400 text-white',
};

const STATUS_FILTERS = [
  { label: 'Todos los estados', value: '' },
  { label: 'Planificación', value: 'PLANNING' },
  { label: 'En Progreso',   value: 'IN_PROGRESS' },
  { label: 'En Revisión',   value: 'REVIEW' },
  { label: 'Cerradas',      value: 'CLOSED' },
  { label: 'Canceladas',    value: 'CANCELLED' },
];

export default function AuditsPage() {
  const [search,     setSearch]     = useState('');
  const [status,     setStatus]     = useState('');
  const [type,       setType]       = useState('');
  const [subtype,    setSubtype]    = useState('');
  const [page,       setPage]       = useState(1);
  const [showAtlas,  setShowAtlas]  = useState(false);

  // Reset subtype when type changes
  function handleTypeChange(v: string) {
    setType(v);
    setSubtype('');
    setPage(1);
  }

  const { data, isLoading } = useAudits({ search, status, type, subtype, page });

  return (
    <div className="min-h-full">
      <Header
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Auditorías' },
        ]}
      />

      <div className="p-6 space-y-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-1 items-center gap-3 max-w-3xl flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por título..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 py-2 text-sm placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
            {/* Status filter */}
            <div className="relative">
              <select
                value={status}
                onChange={(e) => { setStatus(e.target.value); setPage(1); }}
                className="appearance-none rounded-lg border border-gray-200 bg-white pl-3 pr-8 py-2 text-xs text-gray-700 focus:border-blue-400 focus:outline-none"
              >
                {STATUS_FILTERS.map(f => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            </div>

            {/* Type filter */}
            <div className="relative">
              <select
                value={type}
                onChange={(e) => handleTypeChange(e.target.value)}
                className="appearance-none rounded-lg border border-gray-200 bg-white pl-3 pr-8 py-2 text-xs text-gray-700 focus:border-blue-400 focus:outline-none"
              >
                <option value="">Todos los tipos</option>
                {AUDIT_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            </div>

            {/* Subtype filter — shown when a type with subtypes is selected */}
            {type && AUDIT_SUBTYPES[type]?.length > 0 && (
              <div className="relative">
                <select
                  value={subtype}
                  onChange={(e) => { setSubtype(e.target.value); setPage(1); }}
                  className="appearance-none rounded-lg border border-blue-200 bg-blue-50 pl-3 pr-8 py-2 text-xs text-blue-700 focus:border-blue-400 focus:outline-none"
                >
                  <option value="">Todos los sub-tipos</option>
                  {AUDIT_SUBTYPES[type].map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-blue-400" />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAtlas(true)}
              className="flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-700 hover:bg-violet-100 transition-colors"
              title="Análisis de inteligencia histórica multi-año con ATLAS"
            >
              <Sparkles className="h-4 w-4" />
              Análisis Multi-Año
            </button>
            <Link
              href="/dashboard/audits/new"
              className="flex items-center gap-1.5 rounded-lg bg-[#0F2D4A] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#1a4a7a] transition-colors"
            >
              <Plus className="h-4 w-4" />
              Nueva Auditoría
            </Link>
          </div>
        </div>

        {/* Summary stat */}
        {data && (
          <p className="text-xs text-gray-500">
            {data.meta.total} auditorías encontradas
          </p>
        )}

        {/* Table */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="divide-y divide-gray-100">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4 px-6 py-4">
                  <div className="h-4 w-20 animate-pulse rounded bg-gray-100" />
                  <div className="h-4 flex-1 animate-pulse rounded bg-gray-100" />
                  <div className="h-4 w-24 animate-pulse rounded bg-gray-100" />
                </div>
              ))}
            </div>
          ) : data?.data.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <ClipboardList className="h-12 w-12 text-gray-200 mb-3" />
              <p className="text-base font-medium text-gray-500">No hay auditorías</p>
              <p className="text-sm text-gray-400 mt-1">Crea la primera auditoría de tu organización</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Código</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Auditoría</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Tipo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Estado</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Riesgo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden xl:table-cell">Período</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">PTs / Hall.</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data?.data.map((audit) => (
                  <tr key={audit.id} className="hover:bg-blue-50/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs text-gray-600 font-medium">{audit.code}</span>
                        {audit.isInvestigationMode && (
                          <span title="Modo investigación"><Lock className="h-3 w-3 text-red-500" /></span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-gray-800 truncate max-w-[240px]">{audit.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{audit.auditableUnit?.name}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="flex flex-col gap-1">
                        <span className={`inline-block self-start rounded-full px-2 py-0.5 text-[10px] font-semibold ${TYPE_BADGE[audit.type] ?? 'bg-gray-100 text-gray-600'}`}>
                          {getTypeLabel(audit.type)}
                        </span>
                        {audit.subtype && (
                          <span className="text-[10px] text-gray-400 font-medium">
                            {getSubtypeLabel(audit.type, audit.subtype)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[audit.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {STATUS_LABELS[audit.status] ?? audit.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${audit.riskLevel ? (RISK_STYLES[audit.riskLevel] ?? 'bg-gray-100 text-gray-600') : 'bg-gray-100 text-gray-600'}`}>
                        {audit.riskLevel ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell">
                      <p className="text-xs text-gray-500">
                        {formatDate(audit.startDate)} – {formatDate(audit.endDate)}
                      </p>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-center">
                      <div className="flex items-center justify-center gap-3 text-xs text-gray-500">
                        <span title="Papeles de trabajo">{audit._count?.workingPapers ?? 0} PT</span>
                        <span className={audit._count?.findings > 0 ? 'text-amber-600 font-medium' : ''} title="Hallazgos">
                          {audit._count?.findings ?? 0} H
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/audits/${audit.id}`}
                        className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs font-medium transition-colors"
                      >
                        Ver <ArrowRight className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {data && data.meta.totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">
              Página {data.meta.page} de {data.meta.totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => p - 1)}
                disabled={!data.meta.hasPrev}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 disabled:opacity-40 hover:bg-gray-50 transition-colors"
              >
                Anterior
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={!data.meta.hasNext}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 disabled:opacity-40 hover:bg-gray-50 transition-colors"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ATLAS — Multi-Year Analysis Modal */}
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
    </div>
  );
}
