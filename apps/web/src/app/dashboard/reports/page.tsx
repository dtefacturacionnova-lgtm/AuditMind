'use client';

import { FileText, ExternalLink, AlertTriangle, ClipboardList } from 'lucide-react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { useReportsList } from '@/hooks/useReports';
import { formatDate } from '@/lib/utils';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  PLANNING:    { label: 'Planificación', color: 'text-blue-700',    bg: 'bg-blue-50' },
  IN_PROGRESS: { label: 'En Progreso',  color: 'text-indigo-700',  bg: 'bg-indigo-50' },
  REVIEW:      { label: 'En Revisión',  color: 'text-amber-700',   bg: 'bg-amber-50' },
  CLOSED:      { label: 'Cerrada',      color: 'text-emerald-700', bg: 'bg-emerald-50' },
};

export default function ReportsPage() {
  const { data, isLoading } = useReportsList();

  return (
    <div className="flex flex-col h-full">
      <Header title="Motor de Reportería" />

      <div className="flex-1 overflow-auto p-6 space-y-6">

        {/* Info banner */}
        <div className="rounded-xl bg-[#0F2D4A] text-white p-5 flex items-start gap-4">
          <FileText className="w-8 h-8 text-blue-300 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-base font-semibold">Informes de Auditoría</h2>
            <p className="text-sm text-blue-200 mt-1">
              Genera informes completos NIA-conformes para cada auditoría. Incluye hallazgos,
              papeles de trabajo, confirmaciones y análisis de capacidad.
            </p>
          </div>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !data?.items.length ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <FileText className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm font-medium">Sin auditorías disponibles</p>
            <p className="text-xs mt-1">Las auditorías en progreso, revisión o cerradas aparecerán aquí</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {data.items.map(audit => {
              const st = STATUS_CONFIG[audit.status] ?? { label: audit.status, color: 'text-gray-600', bg: 'bg-gray-100' };
              return (
                <div key={audit.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 flex flex-col gap-3">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{audit.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{audit.auditEntity.name}</p>
                    </div>
                    <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${st.bg} ${st.color}`}>
                      {st.label}
                    </span>
                  </div>

                  {/* Stats */}
                  <div className="flex gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {audit._count.findings} hallazgos
                    </span>
                    <span className="flex items-center gap-1">
                      <ClipboardList className="w-3.5 h-3.5" />
                      {audit._count.workingPapers} papeles
                    </span>
                  </div>

                  {/* Dates */}
                  <p className="text-xs text-gray-400">
                    {formatDate(audit.startDate)} — {formatDate(audit.endDate)}
                  </p>

                  {/* Actions: Preliminary + Final */}
                  <div className="flex gap-2">
                    <Link
                      href={`/dashboard/reports/audit/${audit.id}?mode=preliminary`}
                      target="_blank"
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-amber-500 text-white text-xs font-semibold rounded-xl hover:bg-amber-600 transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Preliminar
                      <ExternalLink className="w-3 h-3 opacity-70" />
                    </Link>
                    <Link
                      href={`/dashboard/reports/audit/${audit.id}?mode=final`}
                      target="_blank"
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-[#0F2D4A] text-white text-xs font-semibold rounded-xl hover:bg-[#1a4a7a] transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Final
                      <ExternalLink className="w-3 h-3 opacity-70" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
