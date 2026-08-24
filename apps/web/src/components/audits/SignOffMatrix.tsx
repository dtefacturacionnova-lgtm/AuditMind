'use client';

import { useSignOffMatrix, openSignedPdf, type SignOffLevel } from '@/hooks/useWorkingPaperSignOff';
import { CheckCircle2, Circle, Clock, Lock, AlertCircle, ExternalLink, FileCheck2 } from 'lucide-react';
import Link from 'next/link';

const STATUS_LABELS: Record<string, string> = {
  NOT_STARTED:    'No iniciado',
  IN_PROGRESS:    'En proceso',
  PENDING_REVIEW: 'Pend. revisión',
  RETURNED:       'Observado',
  REVIEWED:       'Revisado',
  SIGNED_OFF:     'Firmado',
  CLOSED:         'Cerrado',
  DRAFT:          'Borrador',
  IN_REVIEW:      'En revisión',
  APPROVED:       'Aprobado',
  ARCHIVED:       'Archivado',
};

const STATUS_COLORS: Record<string, string> = {
  NOT_STARTED:    'bg-gray-100 text-gray-600',
  IN_PROGRESS:    'bg-blue-100 text-blue-700',
  PENDING_REVIEW: 'bg-amber-100 text-amber-700',
  RETURNED:       'bg-red-100 text-red-700',
  REVIEWED:       'bg-indigo-100 text-indigo-700',
  SIGNED_OFF:     'bg-emerald-100 text-emerald-700',
  CLOSED:         'bg-slate-100 text-slate-600',
  DRAFT:          'bg-gray-100 text-gray-600',
  IN_REVIEW:      'bg-amber-100 text-amber-700',
  APPROVED:       'bg-emerald-100 text-emerald-700',
  ARCHIVED:       'bg-slate-200 text-slate-500',
};

function SignCell({
  name, date, paperId, level, pdfPath,
}: {
  name?: string | null;
  date?: string | null;
  paperId: string;
  level: SignOffLevel;
  pdfPath?: string | null;
}) {
  if (!name) {
    return (
      <div className="flex items-center gap-1.5 text-gray-300">
        <Circle className="h-4 w-4" />
        <span className="text-xs text-gray-400">Pendiente</span>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-1.5">
      <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-700 leading-tight">{name}</p>
        {date && (
          <p className="text-[10px] text-slate-400">
            {new Date(date).toLocaleDateString('es', { day: '2-digit', month: 'short', year: '2-digit' })}
          </p>
        )}
      </div>
      {pdfPath && (
        <button
          onClick={() => openSignedPdf(paperId, level)}
          title="Ver PDF firmado digitalmente"
          className="text-slate-300 hover:text-emerald-600 flex-shrink-0 mt-0.5"
        >
          <FileCheck2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function SignOffMatrix({ auditId }: { auditId: string }) {
  const { data, isLoading } = useSignOffMatrix(auditId);

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {[1,2,3,4,5].map(i => (
          <div key={i} className="h-12 rounded-lg bg-slate-100 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!data?.length) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <AlertCircle className="h-10 w-10 text-gray-200 mb-3" />
        <p className="text-sm text-gray-500">No hay papeles de trabajo en esta auditoría</p>
      </div>
    );
  }

  // Group by indexSection
  const grouped = data.reduce<Record<string, typeof data>>((acc, wp) => {
    acc[wp.indexSection] = acc[wp.indexSection] ?? [];
    acc[wp.indexSection].push(wp);
    return acc;
  }, {});

  const signedCount  = data.filter(w => w.signedOffAt).length;
  const reviewedCount = data.filter(w => w.reviewedAt).length;
  const preparedCount = data.filter(w => w.preparedAt).length;

  return (
    <div className="p-4 space-y-4">
      {/* Summary KPIs */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total papeles', value: data.length,    color: 'bg-slate-50 text-slate-700 border-slate-200' },
          { label: 'Preparados',   value: preparedCount,  color: 'bg-blue-50 text-blue-700 border-blue-200' },
          { label: 'Revisados',    value: reviewedCount,  color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
          { label: 'Firmados',     value: signedCount,    color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
        ].map(k => (
          <div key={k.label} className={`rounded-xl border p-3 ${k.color}`}>
            <p className="text-xs opacity-70">{k.label}</p>
            <p className="text-2xl font-bold mt-0.5">{k.value}</p>
            <div className="mt-1 h-1 rounded-full bg-current/20">
              <div
                className="h-1 rounded-full bg-current"
                style={{ width: `${Math.round((k.value / data.length) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Matrix table */}
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Código / Papel</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Estado</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider w-36">Preparado por</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider w-36">Revisado por</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider w-36">Firmado por</th>
              <th className="px-3 py-2.5 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {Object.entries(grouped).map(([section, papers]) => (
              <>
                <tr key={`section-${section}`} className="bg-slate-50/50">
                  <td colSpan={6} className="px-4 py-1.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Sección {section}
                    </span>
                  </td>
                </tr>
                {papers.map(wp => (
                  <tr key={wp.id} className="hover:bg-blue-50/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {(wp.status === 'SIGNED_OFF' || wp.status === 'CLOSED') && (
                          <Lock className="h-3 w-3 text-emerald-500 flex-shrink-0" />
                        )}
                        <div>
                          <p className="font-mono text-xs text-slate-500">{wp.code}</p>
                          <p className="text-sm font-medium text-slate-800 truncate max-w-[200px]">{wp.title}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLORS[wp.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {STATUS_LABELS[wp.status] ?? wp.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <SignCell name={wp.preparedBy?.name} date={wp.preparedAt} paperId={wp.id} level="prepare" pdfPath={wp.preparedPdfPath} />
                    </td>
                    <td className="px-4 py-3">
                      <SignCell name={wp.reviewedBy?.name} date={wp.reviewedAt} paperId={wp.id} level="review" pdfPath={wp.reviewedPdfPath} />
                    </td>
                    <td className="px-4 py-3">
                      <SignCell name={wp.signedOffBy?.name} date={wp.signedOffAt} paperId={wp.id} level="signoff" pdfPath={wp.signedOffPdfPath} />
                    </td>
                    <td className="px-3 py-3">
                      <Link
                        href={`/dashboard/working-papers/${wp.id}`}
                        className="text-blue-500 hover:text-blue-700"
                        title="Abrir papel"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-slate-400 text-center">
        Las firmas se registran en el papel de trabajo individual → pestaña Revisión
      </p>
    </div>
  );
}
