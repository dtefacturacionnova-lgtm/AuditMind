'use client';
import { useState } from 'react';
import Link from 'next/link';
import {
  Search, Plus, Filter, ClipboardList,
  AlertTriangle, ArrowRight, Lock,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { useAudits } from '@/hooks/useAudits';
import { formatDate } from '@/lib/utils';

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  PLANNED: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-indigo-100 text-indigo-700',
  FIELDWORK: 'bg-violet-100 text-violet-700',
  REVIEW: 'bg-amber-100 text-amber-700',
  REPORTING: 'bg-orange-100 text-orange-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-red-50 text-red-600',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador', PLANNED: 'Planificada', IN_PROGRESS: 'En Progreso',
  FIELDWORK: 'Campo', REVIEW: 'En Revisión', REPORTING: 'Reportería',
  COMPLETED: 'Completada', CANCELLED: 'Cancelada',
};

const RISK_STYLES: Record<string, string> = {
  CRITICAL: 'bg-red-600 text-white',
  HIGH: 'bg-orange-500 text-white',
  MEDIUM: 'bg-yellow-400 text-yellow-900',
  LOW: 'bg-blue-400 text-white',
  MINIMAL: 'bg-green-400 text-white',
};

const TYPE_LABELS: Record<string, string> = {
  FINANCIAL: 'Financiera', OPERATIONAL: 'Operacional', COMPLIANCE: 'Cumplimiento',
  IT: 'TI', FORENSIC: 'Forense', INTEGRATED: 'Integrada',
  FOLLOW_UP: 'Seguimiento', SPECIAL: 'Especial', ESG: 'ESG',
};

const FILTERS = [
  { label: 'Todas', value: '' },
  { label: 'En Progreso', value: 'IN_PROGRESS' },
  { label: 'Campo', value: 'FIELDWORK' },
  { label: 'Revisión', value: 'REVIEW' },
  { label: 'Planificadas', value: 'PLANNED' },
  { label: 'Completadas', value: 'COMPLETED' },
];

export default function AuditsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useAudits({ search, status, page });

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
          <div className="flex flex-1 items-center gap-3 max-w-2xl">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por título o código..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 py-2 text-sm placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
            {/* Status filter chips */}
            <div className="hidden lg:flex items-center gap-1">
              {FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => { setStatus(f.value); setPage(1); }}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    status === f.value
                      ? 'bg-[#0F2D4A] text-white'
                      : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <Link
            href="/dashboard/audits/new"
            className="flex items-center gap-1.5 rounded-lg bg-[#0F2D4A] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#1a4a7a] transition-colors"
          >
            <Plus className="h-4 w-4" />
            Nueva Auditoría
          </Link>
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
                      <span className="text-xs text-gray-600">{TYPE_LABELS[audit.type] ?? audit.type}</span>
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
    </div>
  );
}
