'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Sparkles, AlertTriangle, CheckCircle2, Loader2, RefreshCw, ExternalLink,
  TrendingDown, ShieldAlert,
} from 'lucide-react';
import { useBenfordResult, useRunBenford, type BenfordResultData, type BenfordConformity } from '@/hooks/useBenford';

// ─── Visual mapping ──────────────────────────────────────────────────────────

const CONFORMITY_STYLE: Record<BenfordConformity, { bg: string; text: string; border: string; icon: typeof CheckCircle2; label: string }> = {
  CLOSE:          { bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200', icon: CheckCircle2, label: 'Conformidad alta' },
  ACCEPTABLE:     { bg: 'bg-blue-50',     text: 'text-blue-700',    border: 'border-blue-200',    icon: CheckCircle2, label: 'Conformidad aceptable' },
  SUSPECT:        { bg: 'bg-amber-50',    text: 'text-amber-700',   border: 'border-amber-200',   icon: AlertTriangle, label: 'Sospecha — revisar' },
  NON_CONFORMING: { bg: 'bg-red-50',      text: 'text-red-700',     border: 'border-red-200',     icon: ShieldAlert, label: 'NO conforme — alto riesgo' },
};

// ─── Distribution chart (SVG bar chart) ──────────────────────────────────────

function DigitDistributionChart({ digits }: { digits: BenfordResultData['digits'] }) {
  const W   = 460;
  const H   = 200;
  const PAD = { top: 18, right: 10, bottom: 26, left: 32 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const maxY = Math.max(35, ...digits.map(d => Math.max(d.observed_pct, d.expected_pct))) + 2;

  const xFor = (i: number) => PAD.left + (i + 0.5) * (innerW / 9);
  const yFor = (v: number) => PAD.top + innerH - (v / maxY) * innerH;
  const barW = (innerW / 9) * 0.35;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      {/* Y axis ticks */}
      {[0, 10, 20, 30].map(t => (
        <g key={t}>
          <line x1={PAD.left} x2={PAD.left + innerW} y1={yFor(t)} y2={yFor(t)} stroke="#f3f4f6" strokeWidth={1} />
          <text x={PAD.left - 6} y={yFor(t) + 3} textAnchor="end" fontSize="9" fill="#9ca3af">{t}%</text>
        </g>
      ))}

      {/* Bars */}
      {digits.map((d, i) => {
        const cx = xFor(i);
        const obsY = yFor(d.observed_pct);
        const expY = yFor(d.expected_pct);
        const obsColor = d.is_anomalous ? '#fb923c' : '#60a5fa';

        return (
          <g key={d.digit}>
            {/* Expected (background) */}
            <rect
              x={cx - barW} y={expY}
              width={barW * 2} height={PAD.top + innerH - expY}
              fill="#e5e7eb" opacity={0.7}
            />
            {/* Observed (foreground, narrower) */}
            <rect
              x={cx - barW * 0.6} y={obsY}
              width={barW * 1.2} height={PAD.top + innerH - obsY}
              fill={obsColor} rx={2}
            />
            {/* X label */}
            <text x={cx} y={H - 8} textAnchor="middle" fontSize="11" fontWeight="bold" fill="#374151">
              {d.digit}
            </text>
            {/* Observed % above bar */}
            <text x={cx} y={obsY - 3} textAnchor="middle" fontSize="8" fill="#374151">
              {d.observed_pct.toFixed(1)}
            </text>
          </g>
        );
      })}

      {/* Legend */}
      <g transform={`translate(${PAD.left}, 6)`}>
        <rect width={10} height={8} fill="#e5e7eb" />
        <text x={14} y={7} fontSize="9" fill="#6b7280">Esperado (Benford)</text>
        <rect x={100} width={10} height={8} fill="#60a5fa" />
        <text x={114} y={7} fontSize="9" fill="#6b7280">Observado</text>
        <rect x={185} width={10} height={8} fill="#fb923c" />
        <text x={199} y={7} fontSize="9" fill="#6b7280">Anómalo (&gt;20% desviación)</text>
      </g>
    </svg>
  );
}

// ─── Score ring ──────────────────────────────────────────────────────────────

function RiskRing({ score }: { score: number }) {
  const r = 30;
  const C = 2 * Math.PI * r;
  const offset = C - (score / 100) * C;
  const color = score >= 70 ? '#ef4444' : score >= 40 ? '#f59e0b' : '#10b981';

  return (
    <svg viewBox="0 0 80 80" className="w-20 h-20">
      <circle cx="40" cy="40" r={r} fill="none" stroke="#e5e7eb" strokeWidth="6" />
      <circle
        cx="40" cy="40" r={r}
        fill="none" stroke={color} strokeWidth="6"
        strokeDasharray={C} strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 40 40)"
      />
      <text x="40" y="44" textAnchor="middle" fontSize="16" fontWeight="bold" fill="#1f2937">
        {Math.round(score)}
      </text>
      <text x="40" y="56" textAnchor="middle" fontSize="6" fill="#9ca3af">/100</text>
    </svg>
  );
}

// ─── Main panel ──────────────────────────────────────────────────────────────

export function BenfordPanel({ tbId, auditId }: { tbId: string; auditId: string }) {
  const { data: stored, isLoading } = useBenfordResult(tbId);
  const runBenford = useRunBenford();
  const [error, setError] = useState('');

  async function handleRun() {
    setError('');
    try {
      await runBenford.mutateAsync(tbId);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const result = stored?.result ?? null;
  const findingId = stored?.findingId ?? null;
  const runAt = stored?.runAt ?? null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-violet-500 animate-spin" />
      </div>
    );
  }

  // ── Empty state ─────────────────────────────────────────────────────────
  if (!result) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-violet-100 mb-4">
          <TrendingDown className="w-7 h-7 text-violet-600" />
        </div>
        <h3 className="text-lg font-bold text-gray-900 mb-1">Análisis de Ley de Benford</h3>
        <p className="text-sm text-gray-500 max-w-md mx-auto mb-5">
          Detecta posibles manipulaciones contables comparando la distribución del primer dígito
          de los saldos con la distribución logarítmica natural (NIA 240 — Metodología Nigrini).
        </p>
        <button
          onClick={handleRun}
          disabled={runBenford.isPending}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white font-semibold rounded-xl hover:bg-violet-700 disabled:opacity-50 transition-colors"
        >
          {runBenford.isPending ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Analizando…</>
          ) : (
            <><Sparkles className="w-4 h-4" /> Ejecutar análisis Benford</>
          )}
        </button>
        {error && <p className="text-xs text-red-600 mt-3">{error}</p>}
      </div>
    );
  }

  const style = CONFORMITY_STYLE[result.conformity];
  const StyleIcon = style.icon;

  return (
    <div className="space-y-4">

      {/* ── Header / verdict ── */}
      <div className={`${style.bg} ${style.border} border-2 rounded-2xl p-5`}>
        <div className="flex items-start gap-5">
          <RiskRing score={result.risk_score} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <StyleIcon className={`w-5 h-5 ${style.text}`} />
              <h3 className={`text-lg font-bold ${style.text}`}>{style.label}</h3>
            </div>
            <p className="text-sm text-gray-700 leading-relaxed">{result.interpretation}</p>

            <div className="flex items-center gap-4 mt-3 flex-wrap text-xs">
              <Stat label="MAD" value={result.mad.toFixed(4)} />
              <Stat label="χ² stat" value={result.chi2_statistic.toFixed(2)} />
              <Stat label="p-valor" value={result.chi2_pvalue.toFixed(4)} />
              <Stat label="Cuentas válidas" value={String(result.valid_records)} />
              {runAt && <Stat label="Última corrida" value={new Date(runAt).toLocaleString('es-CL')} />}
            </div>
          </div>

          <button
            onClick={handleRun}
            disabled={runBenford.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 shrink-0"
            title="Volver a ejecutar"
          >
            {runBenford.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Re-ejecutar
          </button>
        </div>
      </div>

      {/* ── Auto-generated Finding banner ── */}
      {findingId && (
        <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-3 flex items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-900">Hallazgo borrador creado automáticamente</p>
              <p className="text-xs text-red-700 mt-0.5">
                La desviación supera el umbral de riesgo. Revisa el hallazgo, ajusta la narrativa y aprueba.
              </p>
            </div>
          </div>
          <Link
            href={`/dashboard/findings/${findingId}`}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 shrink-0 transition-colors"
          >
            Ver hallazgo
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      )}

      {/* ── Distribution chart ── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h4 className="text-sm font-bold text-gray-900 mb-3">Distribución del primer dígito</h4>
        <DigitDistributionChart digits={result.digits} />
      </div>

      {/* ── Per-digit table ── */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h4 className="text-sm font-bold text-gray-900">Desviación por dígito</h4>
        </div>
        <table className="w-full text-xs">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-5 py-2 text-left font-semibold text-gray-600">Dígito</th>
              <th className="px-5 py-2 text-right font-semibold text-gray-600">Observado %</th>
              <th className="px-5 py-2 text-right font-semibold text-gray-600">Esperado %</th>
              <th className="px-5 py-2 text-right font-semibold text-gray-600">Desviación %</th>
              <th className="px-5 py-2 text-center font-semibold text-gray-600">Estado</th>
            </tr>
          </thead>
          <tbody>
            {result.digits.map(d => (
              <tr key={d.digit} className="border-t border-gray-100">
                <td className="px-5 py-2 font-mono font-bold text-gray-800">{d.digit}</td>
                <td className="px-5 py-2 text-right text-gray-700">{d.observed_pct.toFixed(2)}</td>
                <td className="px-5 py-2 text-right text-gray-500">{d.expected_pct.toFixed(2)}</td>
                <td className={`px-5 py-2 text-right font-medium ${
                  Math.abs(d.deviation_pct) > 20 ? 'text-orange-600' : 'text-gray-700'
                }`}>
                  {d.deviation_pct > 0 ? '+' : ''}{d.deviation_pct.toFixed(1)}%
                </td>
                <td className="px-5 py-2 text-center">
                  {d.is_anomalous ? (
                    <span className="inline-flex items-center gap-1 text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full text-[10px] font-medium">
                      <AlertTriangle className="w-2.5 h-2.5" /> Anómalo
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full text-[10px] font-medium">
                      <CheckCircle2 className="w-2.5 h-2.5" /> OK
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Top anomalous accounts ── */}
      {result.top_anomalous_amounts.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h4 className="text-sm font-bold text-gray-900">
              Cuentas con mayor desviación
              <span className="text-xs font-normal text-gray-500 ml-2">({result.top_anomalous_amounts.length} de las más relevantes)</span>
            </h4>
          </div>
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-5 py-2 text-left font-semibold text-gray-600">Código</th>
                <th className="px-5 py-2 text-left font-semibold text-gray-600">Cuenta</th>
                <th className="px-5 py-2 text-right font-semibold text-gray-600">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {result.top_anomalous_amounts.map((acc, i) => (
                <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-5 py-2 font-mono text-gray-700">{acc.code}</td>
                  <td className="px-5 py-2 text-gray-700">{acc.name}</td>
                  <td className="px-5 py-2 text-right font-medium text-gray-800">
                    {Number(acc.amount).toLocaleString('es-CL', { maximumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Audit context link */}
      <p className="text-[10px] text-gray-400 text-center">
        Análisis sobre auditoría <Link href={`/dashboard/audits/${auditId}`} className="text-violet-600 hover:underline">{auditId.slice(0, 8)}…</Link> · NIA 240 — Metodología Nigrini
      </p>
    </div>
  );
}

// ─── Tiny ────────────────────────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="font-mono font-medium text-gray-700">{value}</span>
      <span className="text-gray-500">{label}</span>
    </span>
  );
}
