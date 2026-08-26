'use client';

// ─── Visualizador de resultados CAATs — compartido entre la pantalla ─────────
// standalone (dashboard/analytics) y el panel embebido en el papel de trabajo
// PT-B4 (CaatsAnalysisPanel). Única fuente de verdad para no divergir el
// diseño entre ambos puntos de entrada.

import { useState } from 'react';
import { ChevronDown, ChevronUp, ShieldCheck, CheckCircle2, ListChecks } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  fieldLabel, testLabel, formatValue,
  RISK_LEVEL_LABELS, RISK_LEVEL_COLORS, CONFORMITY_LABELS, CONFORMITY_COLORS,
} from '@/lib/caats-labels';

export function ResultSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <span className="text-sm font-semibold text-gray-700">{title}</span>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && <div className="px-4 py-3">{children}</div>}
    </div>
  );
}

function KpiStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-xl px-4 py-3">
      <p className="text-[11px] text-gray-500 font-medium leading-tight">{label}</p>
      <p className="text-lg font-bold text-gray-900 mt-1 leading-tight">{value}</p>
    </div>
  );
}

function SeverityBadge({ level }: { level: string }) {
  const c = RISK_LEVEL_COLORS[level] ?? RISK_LEVEL_COLORS.LOW;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0', c.bg, c.text)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', c.dot)} />
      {RISK_LEVEL_LABELS[level] ?? level}
    </span>
  );
}

export interface FindingLike {
  test_name: string; risk_level: string; record_count: number;
  description: string; sample_records?: Record<string, unknown>[];
}

function SeverityBarChart({ findings }: { findings: FindingLike[] }) {
  const order = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
  const counts: Record<string, number> = {};
  findings.forEach(f => { counts[f.risk_level] = (counts[f.risk_level] ?? 0) + 1; });
  const max = Math.max(...order.map(k => counts[k] ?? 0), 1);
  const active = order.filter(k => counts[k] > 0);
  if (active.length === 0) return null;
  return (
    <div className="flex items-end gap-4 h-24 px-2">
      {active.map(k => {
        const c = RISK_LEVEL_COLORS[k];
        const h = Math.max(((counts[k] ?? 0) / max) * 100, 12);
        return (
          <div key={k} className="flex flex-col items-center justify-end h-full gap-1.5 flex-1 max-w-[64px]">
            <span className="text-xs font-bold text-gray-700">{counts[k]}</span>
            <div className="w-full rounded-t-md overflow-hidden bg-gray-100" style={{ height: '100%' }}>
              <div className={cn('w-full rounded-t-md', c.dot)} style={{ height: `${h}%`, marginTop: 'auto' }} />
            </div>
            <span className="text-[10px] text-gray-400">{RISK_LEVEL_LABELS[k]}</span>
          </div>
        );
      })}
    </div>
  );
}

function SampleRecordsTable({ rows }: { rows: Record<string, unknown>[] }) {
  if (!rows || rows.length === 0) return null;
  const cols = Object.keys(rows[0]);
  return (
    <div className="mt-2.5 overflow-x-auto border border-gray-100 rounded-lg">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="bg-gray-50">
            {cols.map(c => (
              <th key={c} className="text-left px-2 py-1.5 text-gray-400 font-semibold whitespace-nowrap">{fieldLabel(c)}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.slice(0, 5).map((row, i) => (
            <tr key={i}>
              {cols.map(c => (
                <td key={c} className="px-2 py-1.5 text-gray-700 whitespace-nowrap">{formatValue(row[c], c)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FindingCard({ finding }: { finding: FindingLike }) {
  return (
    <div className="border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="font-semibold text-sm text-gray-900">{testLabel(finding.test_name)}</h4>
        <SeverityBadge level={finding.risk_level} />
      </div>
      <p className="text-xs text-gray-500 mt-1.5">{finding.description}</p>
      <SampleRecordsTable rows={finding.sample_records ?? []} />
    </div>
  );
}

function GenericTable({ rows }: { rows: Record<string, unknown>[] }) {
  if (!rows || rows.length === 0) return <p className="text-xs text-gray-400 py-3 text-center">Sin datos.</p>;
  const cols = Object.keys(rows[0]);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr>
            {cols.map(c => (
              <th key={c} className="text-left px-2 py-1.5 bg-gray-50 text-gray-500 font-semibold border-b border-gray-200 whitespace-nowrap">
                {fieldLabel(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.slice(0, 20).map((row, i) => (
            <tr key={i} className="hover:bg-gray-50">
              {cols.map(c => (
                <td key={c} className="px-2 py-1.5 text-gray-700 whitespace-nowrap">{formatValue(row[c], c)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 20 && <p className="text-xs text-gray-400 mt-2 text-center">Mostrando 20 de {rows.length} registros</p>}
    </div>
  );
}

// Claves que ya se muestran en secciones dedicadas — se excluyen de los KPI
// escalares genéricos para no duplicar la información.
const RESULT_SPECIAL_KEYS = new Set([
  'findings', 'summary', 'vendor_concentration', 'pay_distribution', 'digits',
  'top_anomalous_amounts', 'interpretation', 'top_anomalies', 'feature_stats', 'conformity',
  'top_conflicted_users', 'exposure_by_party', 'employee_concentration',
  'daily_amounts', 'bidder_win_rate', 'aging_buckets', 'vendor_activity', 'exposure_by_jurisdiction',
  'tipo_breakdown', 'lists_consulted',
]);

export function AnalysisResultView({ result }: { result: Record<string, unknown> }) {
  const kpiEntries = Object.entries(result).filter(([k, v]) => !RESULT_SPECIAL_KEYS.has(k) && typeof v !== 'object');
  const findings = Array.isArray(result.findings) ? (result.findings as FindingLike[]) : null;
  const topAnomalies = Array.isArray(result.top_anomalies) ? (result.top_anomalies as Array<Record<string, unknown>>) : null;
  const vendorConcentration = Array.isArray(result.vendor_concentration) ? (result.vendor_concentration as Record<string, unknown>[]) : null;
  const topConflictedUsers = Array.isArray(result.top_conflicted_users) ? (result.top_conflicted_users as Record<string, unknown>[]) : null;
  const exposureByParty = Array.isArray(result.exposure_by_party) ? (result.exposure_by_party as Record<string, unknown>[]) : null;
  const employeeConcentration = Array.isArray(result.employee_concentration) ? (result.employee_concentration as Record<string, unknown>[]) : null;
  const dailyAmounts = Array.isArray(result.daily_amounts) ? (result.daily_amounts as Record<string, unknown>[]) : null;
  const bidderWinRate = Array.isArray(result.bidder_win_rate) ? (result.bidder_win_rate as Record<string, unknown>[]) : null;
  const agingBuckets = Array.isArray(result.aging_buckets) ? (result.aging_buckets as Record<string, unknown>[]) : null;
  const vendorActivity = Array.isArray(result.vendor_activity) ? (result.vendor_activity as Record<string, unknown>[]) : null;
  const exposureByJurisdiction = Array.isArray(result.exposure_by_jurisdiction) ? (result.exposure_by_jurisdiction as Record<string, unknown>[]) : null;
  const topAnomalousAmounts = Array.isArray(result.top_anomalous_amounts) ? (result.top_anomalous_amounts as Record<string, unknown>[]) : null;
  const tipoBreakdown = Array.isArray(result.tipo_breakdown) ? (result.tipo_breakdown as Record<string, unknown>[]) : null;
  const digits = Array.isArray(result.digits) ? (result.digits as Record<string, unknown>[]) : null;
  const payDist = result.pay_distribution && typeof result.pay_distribution === 'object'
    ? result.pay_distribution as Record<string, unknown> : null;
  const featureStats = result.feature_stats && typeof result.feature_stats === 'object'
    ? result.feature_stats as Record<string, unknown> : null;
  const conformity = typeof result.conformity === 'string' ? result.conformity : null;

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpiEntries.map(([k, v]) => (
          <KpiStat key={k} label={fieldLabel(k)} value={formatValue(v, k)} />
        ))}
      </div>

      {typeof result.lists_consulted === 'string' && (
        <div className="flex items-start gap-2 bg-gray-50 rounded-xl px-4 py-2.5 text-xs text-gray-600">
          <ListChecks className="w-3.5 h-3.5 shrink-0 mt-0.5 text-gray-400" />
          <p><span className="font-semibold text-gray-700">Listas consultadas: </span>{result.lists_consulted}</p>
        </div>
      )}

      {conformity && (
        <div className={cn('rounded-xl px-4 py-3 flex items-center gap-3', CONFORMITY_COLORS[conformity]?.bg ?? 'bg-gray-50')}>
          <ShieldCheck className={cn('w-5 h-5 shrink-0', CONFORMITY_COLORS[conformity]?.text ?? 'text-gray-600')} />
          <div>
            <p className="text-[11px] font-medium text-gray-500">Conformidad con Ley de Benford</p>
            <p className={cn('text-sm font-bold', CONFORMITY_COLORS[conformity]?.text ?? 'text-gray-800')}>
              {CONFORMITY_LABELS[conformity] ?? conformity}
            </p>
          </div>
        </div>
      )}

      {typeof result.interpretation === 'string' && (
        <div className="bg-blue-50 border-l-4 border-blue-400 rounded-r-lg px-4 py-3">
          <p className="text-sm text-blue-800 italic">{result.interpretation}</p>
        </div>
      )}

      {findings && findings.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-gray-800 mb-3">Hallazgos ({findings.length})</h3>
          <SeverityBarChart findings={findings} />
          <div className="space-y-2.5 mt-3">
            {findings.map((f, i) => <FindingCard key={i} finding={f} />)}
          </div>
        </div>
      )}
      {findings && findings.length === 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> No se detectaron hallazgos de riesgo en los datos analizados.
        </div>
      )}

      {topAnomalies && topAnomalies.length > 0 && (
        <ResultSection title={`Principales Anomalías (${topAnomalies.length})`}>
          <div className="space-y-2.5">
            {topAnomalies.map((a, i) => (
              <div key={i} className="border border-gray-200 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-700">Registro #{String(a.index)}</span>
                  <span className="text-[11px] text-gray-400">Puntaje: {formatValue(a.anomaly_score)}</span>
                </div>
                {Array.isArray(a.flags) && a.flags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {(a.flags as string[]).map((flag, j) => (
                      <span key={j} className="text-[10px] bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-medium">{flag}</span>
                    ))}
                  </div>
                )}
                {a.record && typeof a.record === 'object'
                  ? <SampleRecordsTable rows={[a.record as Record<string, unknown>]} />
                  : null}
              </div>
            ))}
          </div>
        </ResultSection>
      )}

      {vendorConcentration && (
        <ResultSection title="Concentración por Proveedor">
          <GenericTable rows={vendorConcentration} />
        </ResultSection>
      )}

      {topConflictedUsers && (
        <ResultSection title="Usuarios con Más Conflictos de Segregación">
          <GenericTable rows={topConflictedUsers} />
        </ResultSection>
      )}

      {exposureByParty && (
        <ResultSection title="Exposición por Parte Relacionada">
          <GenericTable rows={exposureByParty} />
        </ResultSection>
      )}

      {employeeConcentration && (
        <ResultSection title="Concentración por Empleado">
          <GenericTable rows={employeeConcentration} />
        </ResultSection>
      )}

      {dailyAmounts && (
        <ResultSection title="Montos Diarios" defaultOpen={false}>
          <GenericTable rows={dailyAmounts} />
        </ResultSection>
      )}

      {bidderWinRate && (
        <ResultSection title="Tasa de Adjudicación por Proveedor">
          <GenericTable rows={bidderWinRate} />
        </ResultSection>
      )}

      {agingBuckets && (
        <ResultSection title="Antigüedad de Saldos">
          <GenericTable rows={agingBuckets} />
        </ResultSection>
      )}

      {vendorActivity && (
        <ResultSection title="Actividad por Proveedor">
          <GenericTable rows={vendorActivity} />
        </ResultSection>
      )}

      {exposureByJurisdiction && (
        <ResultSection title="Exposición por Jurisdicción">
          <GenericTable rows={exposureByJurisdiction} />
        </ResultSection>
      )}

      {topAnomalousAmounts && (
        <ResultSection title="Montos Más Atípicos">
          <GenericTable rows={topAnomalousAmounts} />
        </ResultSection>
      )}

      {tipoBreakdown && (
        <ResultSection title="Documentos por Tipo de DTE">
          <GenericTable rows={tipoBreakdown} />
        </ResultSection>
      )}

      {digits && (
        <ResultSection title="Distribución de Dígitos (Observado vs. Esperado)">
          <div className="flex items-end gap-2 h-32 px-2">
            {digits.map((d) => {
              const obs = Number(d.observed_pct ?? 0);
              const exp = Number(d.expected_pct ?? 0);
              const max = Math.max(...digits.map(x => Math.max(Number(x.observed_pct ?? 0), Number(x.expected_pct ?? 0))), 1);
              return (
                <div key={String(d.digit)} className="flex flex-col items-center justify-end h-full flex-1 gap-1">
                  <div className="w-full flex items-end justify-center gap-0.5" style={{ height: '100%' }}>
                    <div className={cn('w-1/2 rounded-t', d.is_anomalous ? 'bg-red-400' : 'bg-blue-500')}
                      style={{ height: `${Math.max((obs / max) * 100, 3)}%`, marginTop: 'auto' }} title={`Observado ${obs}%`} />
                    <div className="w-1/2 rounded-t bg-gray-300" style={{ height: `${Math.max((exp / max) * 100, 3)}%`, marginTop: 'auto' }} title={`Esperado ${exp}%`} />
                  </div>
                  <span className="text-[10px] text-gray-400">{String(d.digit)}</span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-2 justify-center text-[11px] text-gray-500">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500" />Observado</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-gray-300" />Esperado (Benford)</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-400" />Observado — anómalo</span>
          </div>
        </ResultSection>
      )}

      {payDist && (
        <ResultSection title="Distribución Salarial">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            {Object.entries(payDist).filter(([k]) => k !== 'by_department').map(([k, v]) => (
              <KpiStat key={k} label={fieldLabel(k)} value={formatValue(v, k)} />
            ))}
          </div>
          {payDist.by_department && typeof payDist.by_department === 'object'
            ? (
              <GenericTable rows={Object.entries(payDist.by_department as Record<string, unknown>).map(([dept, stats]) => ({
                departamento: dept, ...(stats as Record<string, unknown>),
              }))} />
            )
            : null}
        </ResultSection>
      )}

      {featureStats && (
        <ResultSection title="Estadísticas de Variables">
          <GenericTable rows={Object.entries(featureStats).map(([field, stats]) => ({
            variable: field,
            ...(typeof stats === 'object' && stats !== null ? stats as Record<string, unknown> : { valor: stats }),
          }))} />
        </ResultSection>
      )}
    </div>
  );
}
