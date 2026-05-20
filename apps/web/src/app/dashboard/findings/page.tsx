'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, Filter, Search, ChevronRight,
  TrendingUp, Clock, CheckCircle2, XCircle, BarChart2, Plus,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import {
  useFindingsForOrg, SEVERITY_CONFIG, STATUS_CONFIG, qualityScoreColor,
  type FindingSeverity, type FindingStatus,
} from '@/hooks/useFindings';
import { useDebounce } from '@/hooks/useDebounce';
import { formatDate } from '@/lib/utils';

const SEVERITY_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Todas las severidades' },
  { value: 'CRITICAL', label: 'Crítico' },
  { value: 'HIGH', label: 'Alto' },
  { value: 'MEDIUM', label: 'Medio' },
  { value: 'LOW', label: 'Bajo' },
  { value: 'INFORMATIONAL', label: 'Informativo' },
];

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Todos los estados' },
  { value: 'DRAFT', label: 'Borrador' },
  { value: 'IN_REVIEW', label: 'En Revisión' },
  { value: 'APPROVED', label: 'Aprobado' },
  { value: 'IN_PROGRESS', label: 'En Progreso' },
  { value: 'OVERDUE', label: 'Vencido' },
  { value: 'CLOSED', label: 'Cerrado' },
];

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-amber-400' : 'bg-red-400'
          }`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className={`text-xs font-medium tabular-nums ${qualityScoreColor(score)}`}>
        {score}
      </span>
    </div>
  );
}

export default function FindingsPage() {
  const [severityFilter, setSeverityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(searchTerm, 300);

  const { data, isLoading } = useFindingsForOrg({
    severity: severityFilter || undefined,
    status: statusFilter || undefined,
    page,
    limit: 20,
  });

  const findings = data?.data ?? [];
  const meta = data?.meta;

  // Client-side search filter
  const filtered = debouncedSearch
    ? findings.filter(f =>
        f.title.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        f.audit?.title?.toLowerCase().includes(debouncedSearch.toLowerCase()),
      )
    : findings;

  // Summary counts
  const criticalCount = findings.filter(f => f.severity === 'CRITICAL').length;
  const overdueCount = findings.filter(f => f.status === 'OVERDUE').length;
  const inReviewCount = findings.filter(f => f.status === 'IN_REVIEW').length;
  const closedCount = findings.filter(f => f.status === 'CLOSED').length;

  return (
    <div className="flex flex-col h-full">
      <Header title="Hallazgos" />

      <div className="flex-1 overflow-auto p-6 space-y-6">

        {/* Top bar with action */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {data?.meta?.total !== undefined ? `${data.meta.total} hallazgos en total` : ''}
          </p>
          <Link
            href="/dashboard/findings/new"
            className="flex items-center gap-2 px-4 py-2 bg-[#0F2D4A] text-white rounded-lg text-sm font-medium hover:bg-[#1a3f5f] transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Nuevo Hallazgo
          </Link>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Críticos abiertos</p>
                <p className="text-2xl font-bold text-gray-800">{criticalCount}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center">
                <Clock className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Vencidos</p>
                <p className="text-2xl font-bold text-gray-800">{overdueCount}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                <BarChart2 className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-xs text-gray-500">En revisión</p>
                <p className="text-2xl font-bold text-gray-800">{inReviewCount}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Cerrados</p>
                <p className="text-2xl font-bold text-gray-800">{closedCount}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters + Search */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por título o auditoría..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={severityFilter}
              onChange={e => { setSeverityFilter(e.target.value); setPage(1); }}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {SEVERITY_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {STATUS_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {isLoading ? (
            <div className="divide-y divide-gray-100">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="p-4 animate-pulse flex gap-4">
                  <div className="w-16 h-5 bg-gray-100 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-100 rounded w-2/3" />
                    <div className="h-3 bg-gray-100 rounded w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <AlertTriangle className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No hay hallazgos</p>
              <p className="text-gray-400 text-sm mt-1">
                {severityFilter || statusFilter || searchTerm
                  ? 'Prueba con otros filtros'
                  : 'Los hallazgos aparecerán al crearlos desde una auditoría'}
              </p>
            </div>
          ) : (
            <>
              {/* Header row */}
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 grid grid-cols-12 gap-4 text-xs font-medium text-gray-500 uppercase tracking-wide">
                <div className="col-span-1">Sev.</div>
                <div className="col-span-4">Hallazgo</div>
                <div className="col-span-2">Auditoría</div>
                <div className="col-span-2">Estado</div>
                <div className="col-span-1">Calidad</div>
                <div className="col-span-1">Vence</div>
                <div className="col-span-1" />
              </div>

              <div className="divide-y divide-gray-100">
                {filtered.map(finding => {
                  const sev = SEVERITY_CONFIG[finding.severity];
                  const st = STATUS_CONFIG[finding.status];
                  return (
                    <Link
                      key={finding.id}
                      href={`/dashboard/findings/${finding.id}`}
                      className="grid grid-cols-12 gap-4 px-4 py-3.5 items-center hover:bg-gray-50 transition-colors group"
                    >
                      {/* Severity */}
                      <div className="col-span-1">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${sev.bg} ${sev.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${sev.dot}`} />
                          {sev.label.slice(0, 3).toUpperCase()}
                        </span>
                      </div>

                      {/* Title */}
                      <div className="col-span-4">
                        <p className="text-sm font-medium text-gray-800 line-clamp-1 group-hover:text-blue-600 transition-colors">
                          {finding.title}
                        </p>
                        <p className="text-xs text-gray-400 line-clamp-1 mt-0.5">
                          {finding.condition.slice(0, 80)}…
                        </p>
                      </div>

                      {/* Audit */}
                      <div className="col-span-2">
                        <p className="text-xs text-gray-500 line-clamp-2">{finding.audit?.title ?? '—'}</p>
                      </div>

                      {/* Status */}
                      <div className="col-span-2">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${st.bg} ${st.color}`}>
                          {st.label}
                        </span>
                        {finding.isRecurring && (
                          <span className="ml-1 text-xs text-purple-600 font-medium">↩ Recurrente</span>
                        )}
                      </div>

                      {/* Quality Score */}
                      <div className="col-span-1">
                        <ScoreBar score={finding.qualityScore} />
                      </div>

                      {/* Due date */}
                      <div className="col-span-1">
                        {finding.dueDate ? (
                          <span className={`text-xs ${
                            new Date(finding.dueDate) < new Date() ? 'text-red-600 font-medium' : 'text-gray-500'
                          }`}>
                            {formatDate(finding.dueDate)}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </div>

                      {/* Arrow */}
                      <div className="col-span-1 flex justify-end">
                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
                      </div>
                    </Link>
                  );
                })}
              </div>

              {/* Pagination */}
              {meta && meta.totalPages > 1 && (
                <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
                  <p className="text-xs text-gray-500">
                    {meta.total} hallazgos en total
                  </p>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="px-3 py-1 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
                    >
                      Anterior
                    </button>
                    <span className="px-3 py-1 text-xs text-gray-500">
                      {page} / {meta.totalPages}
                    </span>
                    <button
                      onClick={() => setPage(p => Math.min(meta.totalPages, p + 1))}
                      disabled={page >= meta.totalPages}
                      className="px-3 py-1 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

      </div>
    </div>
  );
}
