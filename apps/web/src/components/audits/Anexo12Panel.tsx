'use client';

import { Download, FileSpreadsheet, AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { useAnexo12, type Anexo12Row } from '@/hooks/useAnexo12';
import { apiClient } from '@/lib/api-client';

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    CRITICAL: 'bg-red-100 text-red-700 border-red-200',
    HIGH:     'bg-orange-100 text-orange-700 border-orange-200',
    MEDIUM:   'bg-amber-100 text-amber-700 border-amber-200',
    LOW:      'bg-blue-100 text-blue-700 border-blue-200',
    INFORMATIONAL: 'bg-gray-100 text-gray-700 border-gray-200',
  };
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${colors[severity] ?? 'bg-gray-100 text-gray-700 border-gray-200'}`}>
      {severity}
    </span>
  );
}

function RowsTable({ rows, title, color }: { rows: Anexo12Row[]; title: string; color: string }) {
  if (rows.length === 0) return null;
  return (
    <div className={`bg-white border rounded-2xl overflow-hidden ${color}`}>
      <div className="px-4 py-2.5 bg-current/5 border-b border-current/10">
        <h4 className="text-xs font-bold uppercase tracking-wide">{title} <span className="text-[10px] font-normal opacity-70">({rows.length})</span></h4>
      </div>
      <table className="w-full text-xs">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left font-semibold text-gray-600 w-10">#</th>
            <th className="px-3 py-2 text-left font-semibold text-gray-600">Concepto</th>
            <th className="px-3 py-2 text-left font-semibold text-gray-600 w-32">Norma / Art.</th>
            <th className="px-3 py-2 text-right font-semibold text-gray-600 w-28">Monto</th>
            <th className="px-3 py-2 text-right font-semibold text-gray-600 w-28">Impacto Fiscal</th>
            <th className="px-3 py-2 text-center font-semibold text-gray-600 w-20">Sev.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={`${r.tipo}-${r.numero}`} className="border-t border-gray-100 hover:bg-gray-50">
              <td className="px-3 py-2 font-mono text-gray-500">{r.numero}</td>
              <td className="px-3 py-2 text-gray-800">
                <p className="font-medium">{r.concepto}</p>
                {r.descripcion && <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-2">{r.descripcion}</p>}
              </td>
              <td className="px-3 py-2 text-gray-600 text-[10px]">
                <p>{r.norma}</p>
                <p className="text-gray-400">{r.articulo}</p>
              </td>
              <td className="px-3 py-2 text-right font-mono text-gray-700">
                {r.monto > 0 ? r.monto.toLocaleString('es-CL', { minimumFractionDigits: 2 }) : '—'}
              </td>
              <td className="px-3 py-2 text-right font-mono font-semibold text-gray-800">
                {r.impactoFiscal > 0 ? r.impactoFiscal.toLocaleString('es-CL', { minimumFractionDigits: 2 }) : '—'}
              </td>
              <td className="px-3 py-2 text-center">
                <SeverityBadge severity={r.severidad} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Anexo12Panel({ auditId }: { auditId: string }) {
  const { data, isLoading, error, refetch } = useAnexo12(auditId);

  function downloadCsv() {
    apiClient.downloadFile(`/fiscal/anexo12/${auditId}/csv`, `anexo12_${auditId.slice(0, 8)}.csv`)
      .catch(e => alert((e as Error).message));
  }

  if (isLoading) {
    return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-violet-500 animate-spin" /></div>;
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
        <p className="text-sm text-red-700 font-semibold">Error al generar Anexo 12</p>
        <p className="text-xs text-red-600 mt-1">{(error as Error).message}</p>
      </div>
    );
  }

  if (!data) return null;

  const noFindings = data.totales.countFormales === 0 && data.totales.countSustantivos === 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-violet-50 to-blue-50 border border-violet-200 rounded-2xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <FileSpreadsheet className="w-5 h-5 text-violet-600 shrink-0" />
              <h3 className="text-base font-bold text-gray-900">Anexo 12 SDF — Detalle de Incumplimientos</h3>
            </div>
            <p className="text-xs text-gray-600 mt-1">
              <strong>Contribuyente:</strong> {data.contribuyente} · <strong>Período:</strong> {data.periodo}
            </p>
            <p className="text-[10px] text-gray-500 mt-1">
              CT SV Art. 134-135 — Generación automática desde hallazgos aprobados
            </p>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <button
              onClick={downloadCsv}
              disabled={noFindings}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              CSV para SDF
            </button>
            <button
              onClick={() => refetch()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50"
            >
              <RefreshCw className="w-3 h-3" /> Recargar
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-4 gap-2 mt-4">
          <KPI label="Formales" value={data.totales.countFormales} color="bg-blue-50 text-blue-700 border-blue-200" />
          <KPI label="Sustantivos" value={data.totales.countSustantivos} color="bg-amber-50 text-amber-700 border-amber-200" />
          <KPI label="Monto total" value={`USD ${data.totales.montoTotal.toLocaleString('es-CL', { minimumFractionDigits: 0 })}`} color="bg-gray-50 text-gray-700 border-gray-200" />
          <KPI label="Impacto fiscal" value={`USD ${data.totales.impactoTotal.toLocaleString('es-CL', { minimumFractionDigits: 0 })}`} color="bg-red-50 text-red-700 border-red-200" />
        </div>
      </div>

      {noFindings && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center">
          <FileSpreadsheet className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
          <p className="text-sm font-semibold text-emerald-800">Sin incumplimientos a reportar</p>
          <p className="text-xs text-emerald-600 mt-1">
            No hay hallazgos aprobados en esta auditoría. El Anexo 12 no es obligatorio en este caso.
          </p>
        </div>
      )}

      {/* Aviso */}
      {!noFindings && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-amber-900">Impacto Fiscal estimado al 30% (tasa ISR)</p>
            <p className="text-[10px] text-amber-700 mt-0.5">
              El cálculo automático aplica la tasa ISR estándar sobre el monto del hallazgo. Para hallazgos
              específicos (IVA 13%, retenciones, multas), ajusta el monto manualmente en el CSV antes de subir al SDF.
            </p>
          </div>
        </div>
      )}

      <RowsTable rows={data.formales}    title="Sección A — Incumplimientos Formales"     color="border-blue-200 text-blue-700" />
      <RowsTable rows={data.sustantivos} title="Sección B — Incumplimientos Sustantivos"  color="border-amber-200 text-amber-700" />

      <p className="text-[10px] text-gray-400 text-center">
        Generado {new Date(data.generatedAt).toLocaleString('es-CL')} · El archivo CSV es compatible con el formato del Sistema del Dictamen Fiscal (SDF) DGII.
      </p>
    </div>
  );
}

function KPI({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className={`rounded-xl border p-2.5 ${color}`}>
      <p className="text-[10px] opacity-75 uppercase tracking-wide font-medium">{label}</p>
      <p className="text-base font-bold mt-0.5 truncate">{value}</p>
    </div>
  );
}
