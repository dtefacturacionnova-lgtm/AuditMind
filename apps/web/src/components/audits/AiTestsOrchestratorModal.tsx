'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  X, Sparkles, Loader2, CheckCircle2, AlertTriangle, MinusCircle,
  TrendingDown, ShieldCheck, ExternalLink, RefreshCw, Clock,
} from 'lucide-react';
import { useRunAiTests, useAiTestsReport, type AiTestResult, type AiTestStatus, type AiTestKind } from '@/hooks/useAiTests';

// ─── Visual mapping ──────────────────────────────────────────────────────────

const KIND_META: Record<AiTestKind, { label: string; Icon: typeof TrendingDown; color: string }> = {
  BENFORD: { label: 'Análisis Benford',    Icon: TrendingDown, color: 'text-violet-600' },
  COSO:    { label: 'Evaluación COSO 2013', Icon: ShieldCheck,  color: 'text-emerald-600' },
};

const STATUS_META: Record<AiTestStatus, { Icon: typeof CheckCircle2; color: string; bg: string; label: string }> = {
  SUCCESS: { Icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200', label: 'Exitoso' },
  FAILED:  { Icon: AlertTriangle, color: 'text-red-600',    bg: 'bg-red-50 border-red-200',         label: 'Falló' },
  SKIPPED: { Icon: MinusCircle,  color: 'text-gray-400',    bg: 'bg-gray-50 border-gray-200',       label: 'Omitido' },
};

// ─── Test result row ─────────────────────────────────────────────────────────

function TestRow({ test }: { test: AiTestResult }) {
  const kind   = KIND_META[test.kind];
  const status = STATUS_META[test.status];
  const KIcon  = kind.Icon;
  const SIcon  = status.Icon;

  return (
    <div className={`${status.bg} border rounded-xl px-4 py-3`}>
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shrink-0">
          <KIcon className={`w-4 h-4 ${kind.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-gray-800">{kind.label}</span>
            <span className="text-[10px] text-gray-400">·</span>
            <span className="text-xs text-gray-600 truncate">{test.label}</span>
          </div>
          <p className="text-xs text-gray-700 mt-0.5">{test.message}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {test.findingId && (
            <Link
              href={`/dashboard/findings/${test.findingId}`}
              className="flex items-center gap-1 text-[10px] font-medium text-red-700 bg-red-100 border border-red-200 px-2 py-0.5 rounded-full hover:bg-red-200"
            >
              Hallazgo <ExternalLink className="w-2.5 h-2.5" />
            </Link>
          )}
          <span className={`flex items-center gap-1 ${status.color}`}>
            <SIcon className="w-3.5 h-3.5" />
            <span className="text-[10px] font-semibold">{status.label}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Main modal ──────────────────────────────────────────────────────────────

interface AiTestsOrchestratorModalProps {
  auditId: string;
  onClose: () => void;
}

export function AiTestsOrchestratorModal({ auditId, onClose }: AiTestsOrchestratorModalProps) {
  const { data: report, isLoading } = useAiTestsReport(auditId);
  const run = useRunAiTests();
  const [error, setError] = useState('');

  async function handleRun() {
    setError('');
    try {
      await run.mutateAsync(auditId);
    } catch (e) {
      setError((e as Error).message ?? 'Error al ejecutar pruebas IA');
    }
  }

  const summary = report?.summary ?? null;
  const isRunning = run.isPending;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">

        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Pruebas IA — Orquestador</h2>
              <p className="text-xs text-gray-500">Ejecuta automáticamente todas las pruebas IA disponibles en esta auditoría</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">

          {/* Run button + last run info */}
          <div className="flex items-center justify-between gap-4 bg-gradient-to-r from-violet-50 to-blue-50 border border-violet-200 rounded-2xl p-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">
                {isRunning ? 'Ejecutando pruebas IA…' : 'Pruebas disponibles'}
              </p>
              <p className="text-xs text-gray-600 mt-0.5">
                Benford sobre cada Trial Balance · COSO sobre A-06 / PT-COSO si existe
              </p>
              {report?.ranAt && (
                <div className="flex items-center gap-1.5 mt-2 text-[11px] text-gray-500">
                  <Clock className="w-3 h-3" />
                  Última ejecución: {new Date(report.ranAt).toLocaleString('es-CL')}
                </div>
              )}
            </div>
            <button
              onClick={handleRun}
              disabled={isRunning}
              className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white font-semibold rounded-xl hover:bg-violet-700 disabled:opacity-50 transition-colors shrink-0"
            >
              {isRunning ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Ejecutando…</>
              ) : summary ? (
                <><RefreshCw className="w-4 h-4" /> Volver a ejecutar</>
              ) : (
                <><Sparkles className="w-4 h-4" /> Ejecutar pruebas IA</>
              )}
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <p className="text-sm text-red-700 font-medium">Error</p>
              <p className="text-xs text-red-600 mt-1">{error}</p>
            </div>
          )}

          {/* Loading state */}
          {isLoading && !summary && (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
            </div>
          )}

          {/* Empty state */}
          {!isLoading && !summary && !isRunning && (
            <div className="bg-white border border-gray-200 rounded-2xl p-6 text-center">
              <p className="text-sm text-gray-600">
                Aún no se han ejecutado pruebas IA en esta auditoría.<br />
                Pulsa <strong>Ejecutar pruebas IA</strong> para iniciar.
              </p>
              <p className="text-xs text-gray-400 mt-3">
                Esto puede tardar 1-3 minutos dependiendo de los datos cargados.
              </p>
            </div>
          )}

          {/* Summary */}
          {summary && (
            <>
              <div className="grid grid-cols-4 gap-2">
                <KPICard label="Total"            value={summary.counts.total}           color="bg-gray-50 text-gray-700 border-gray-200" />
                <KPICard label="Exitosas"         value={summary.counts.success}         color="bg-emerald-50 text-emerald-700 border-emerald-200" />
                <KPICard label="Omitidas"         value={summary.counts.skipped}         color="bg-gray-50 text-gray-500 border-gray-200" />
                <KPICard label="Hallazgos creados" value={summary.counts.findingsCreated} color="bg-red-50 text-red-700 border-red-200" />
              </div>

              {summary.counts.failed > 0 && (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <p className="text-xs text-amber-800">
                    {summary.counts.failed} prueba(s) fallaron. Revisa los detalles abajo.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Detalle por prueba</h3>
                {summary.tests.map((t, i) => (
                  <TestRow key={`${t.kind}-${t.target}-${i}`} test={t} />
                ))}
              </div>

              <div className="text-[10px] text-gray-400 text-right pt-2 border-t border-gray-100">
                Duración total: {(summary.durationMs / 1000).toFixed(1)}s
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tiny KPI card ───────────────────────────────────────────────────────────

function KPICard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`rounded-xl border p-3 ${color}`}>
      <p className="text-[10px] opacity-70 font-medium uppercase tracking-wide">{label}</p>
      <p className="text-xl font-bold mt-0.5">{value}</p>
    </div>
  );
}
