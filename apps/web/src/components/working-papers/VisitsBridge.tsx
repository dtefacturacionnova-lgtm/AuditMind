'use client';

import { Fragment, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, ListPlus, Loader2, Route } from 'lucide-react';
import { useBridgeTargets, useCreateBridgeSteps, useVisitsBridge } from '@/hooks/useAuditVisits';
import { fmtDay } from '@/lib/visits/visit-base';
import {
  BRIDGE_FILTER_LABEL, BridgeFilter, BridgeRowView, NATURE_LABEL, REASON_LABEL, acceptSummary, acceptableCodes, canAcceptStep, defaultTarget, filterBridgeRows,
  pruneSelection, toggleCode,
} from '@/lib/visits/bridge-view';

const money = (n: number | string | null | undefined) =>
  new Intl.NumberFormat('es-SV', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);

const ROW_CAP = 300;
const NO_ROWS: BridgeRowView[] = [];
const PCT_OPTIONS = [10, 20, 30, 50];
const FILTERS: BridgeFilter[] = ['ALERTAS', 'PENDIENTES', 'TODAS', 'SOLO_INTERINA', 'SOLO_FINAL'];

const errText = (e: unknown) => (e instanceof Error ? e.message : 'No se pudo completar la operación.');

/**
 * Puente interina → final: qué cuentas se movieron o se apartaron de lo esperado después de la visita interina (NIA 330, período
 * restante). Es una REFERENCIA que dirige el trabajo del auditor, no una conclusión: cada alerta pide su propia prueba.
 */
export function VisitsBridge({ auditId, ready, canCreate }: { auditId: string; ready: boolean; canCreate: boolean }) {
  const [pct, setPct] = useState(20);
  const [filter, setFilter] = useState<BridgeFilter>('ALERTAS');
  const [selected, setSelected] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [targetId, setTargetId] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn' | 'error'; lines: string[] } | null>(null);

  const bridge = useVisitsBridge(auditId, ready, pct);
  const targets = useBridgeTargets(auditId, ready && canCreate);
  const create = useCreateBridgeSteps(auditId);

  const rows = bridge.data?.rows ?? NO_ROWS;
  const target = (targets.data ?? []).find((t) => t.sectionId === targetId) ?? defaultTarget(targets.data ?? []);

  // Si el puente se recalcula (otro umbral, un paso creado por otra persona), la selección no puede quedar con cuentas que ya no aplican.
  useEffect(() => {
    setSelected((s) => { const next = pruneSelection(s, rows); return next.length === s.length ? s : next; });
  }, [rows]);

  const shown = filterBridgeRows(rows, filter);
  const pending = acceptableCodes(rows);

  async function onCreate() {
    if (!target || selected.length === 0) return;
    setMsg(null);
    try {
      const res = await create.mutateAsync({ sectionId: target.sectionId, codes: selected });
      setSelected([]);
      setMsg({ tone: res.skipped.length > 0 ? 'warn' : 'ok', lines: acceptSummary(res) });
    } catch (e) {
      setMsg({ tone: 'error', lines: [errText(e)] });
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Route className="w-4 h-4 text-blue-600" />
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Puente interina → final (período restante)</p>
      </div>

      {!ready && <p className="text-xs text-gray-500">Carga el balance de la visita interina y el de la final para ver el puente por cuenta.</p>}
      {ready && bridge.isLoading && <div className="flex items-center gap-2 text-xs text-blue-600"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Calculando el puente…</div>}
      {ready && bridge.error && (
        <div role="alert" className="flex items-start gap-2 border rounded-lg px-3 py-2 text-xs bg-red-50 border-red-200 text-red-700">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {errText(bridge.error)}
        </div>
      )}

      {bridge.data && (
        <>
          <p className="text-xs text-gray-500 max-w-3xl">
            Referencia, no conclusión. En cuentas de balance se alerta cuando el movimiento supera la materialidad de ejecución; en cuentas de resultados,
            cuando el saldo final se aparta de lo esperado (saldo de la interina proyectado al cierre) por más de la materialidad y del porcentaje elegido.
          </p>

          <div className="flex flex-wrap gap-2 text-[11px]">
            <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-700">
              Interina al {fmtDay(bridge.data.interim.cutoffDate)} → Final al {fmtDay(bridge.data.final.cutoffDate)}
            </span>
            <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-700">
              Materialidad de ejecución: {bridge.data.materiality.execution === null ? 'sin definir' : `${money(bridge.data.materiality.execution)} (${bridge.data.materiality.source === 'PT-A4' ? 'papel A-06 PT-A4' : 'dato del encargo'})`}
            </span>
            <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-700">
              Ejercicio: {bridge.data.period.source === 'ENCARGO' ? `${fmtDay(bridge.data.period.start)} a ${fmtDay(bridge.data.period.end)}` : 'año calendario (el encargo no lo define)'}
            </span>
            <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-700">
              Proyección de resultados: {bridge.data.annualizationFactor === null ? 'no disponible' : `× ${bridge.data.annualizationFactor.toFixed(4)}`}
            </span>
            <span className={`px-2 py-1 rounded-full font-semibold ${bridge.data.alerts > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'}`}>
              {bridge.data.alerts} alerta{bridge.data.alerts === 1 ? '' : 's'}
            </span>
          </div>

          {bridge.data.warnings.map((w) => (
            <div key={w} role="status" className="flex items-start gap-2 border rounded-lg px-3 py-2 text-xs bg-amber-50 border-amber-200 text-amber-800">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {w}
            </div>
          ))}

          <div className="flex items-center gap-2 flex-wrap text-xs text-gray-600">
            <label className="flex items-center gap-1.5">Variación mínima en resultados
              <select value={pct} onChange={(e) => setPct(Number(e.target.value))} className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white">
                {PCT_OPTIONS.map((p) => <option key={p} value={p}>{p} %</option>)}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button key={f} type="button" onClick={() => setFilter(f)}
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${filter === f ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}>
                {BRIDGE_FILTER_LABEL[f]} · {filterBridgeRows(rows, f).length}
              </button>
            ))}
          </div>

          {/* Aceptar pasos sugeridos */}
          {canCreate && pending.length > 0 && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs text-blue-900 space-y-2">
              <p>
                Cada alerta puede convertirse en un paso de <strong>período restante</strong> (timing «puente interina → cierre») dentro de un procedimiento
                «RF-NIA330». No se crean solos: marca las cuentas y acepta.
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <label className="flex items-center gap-1.5">Crear en
                  <select value={target?.sectionId ?? ''} onChange={(e) => setTargetId(e.target.value)} disabled={!targets.data || targets.data.length === 0}
                    className="border border-blue-200 rounded-lg px-2 py-1 text-xs bg-white text-gray-700 max-w-[320px]">
                    {(targets.data ?? []).map((t) => (
                      <option key={t.sectionId} value={t.sectionId}>{t.paperCode} · {t.paperTitle} — {t.sectionLabel}</option>
                    ))}
                  </select>
                </label>
                <button type="button" onClick={() => setSelected(pending)} className="px-2.5 py-1 text-[11px] border border-blue-200 bg-white rounded-lg text-blue-700">
                  Marcar las {pending.length} sin paso
                </button>
                {selected.length > 0 && (
                  <button type="button" onClick={() => setSelected([])} className="px-2.5 py-1 text-[11px] border border-gray-200 bg-white rounded-lg text-gray-600">Quitar marcas</button>
                )}
                <button type="button" onClick={onCreate} disabled={create.isPending || selected.length === 0 || !target}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 text-white rounded-lg text-[11px] font-semibold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed">
                  {create.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <ListPlus className="w-3 h-3" />}
                  Crear {selected.length} paso{selected.length === 1 ? '' : 's'}
                </button>
              </div>
              {targets.data && targets.data.length === 0 && (
                <p className="text-amber-700">Este encargo aún no tiene un papel con cuadrícula de procedimientos donde crear los pasos.</p>
              )}
            </div>
          )}

          {msg && (
            <div role={msg.tone === 'error' ? 'alert' : 'status'}
              className={`flex items-start gap-2 border rounded-lg px-3 py-2 text-xs ${msg.tone === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : msg.tone === 'warn' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
              {msg.tone === 'ok' ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
              <div className="space-y-0.5">{msg.lines.map((l, i) => <p key={i}>{l}</p>)}</div>
            </div>
          )}

          {shown.length === 0 ? (
            <p className="text-xs text-gray-500 py-4 text-center">No hay cuentas en este filtro.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-gray-600">
                    {canCreate && <th className="px-2 py-2 w-8" />}
                    <th className="px-3 py-2 text-left font-semibold">Cuenta</th>
                    <th className="px-3 py-2 text-left font-semibold">Descripción</th>
                    <th className="px-3 py-2 text-left font-semibold">Tipo</th>
                    <th className="px-3 py-2 text-right font-semibold">Interina</th>
                    <th className="px-3 py-2 text-right font-semibold">Final</th>
                    <th className="px-3 py-2 text-right font-semibold">Movimiento</th>
                    <th className="px-3 py-2 text-right font-semibold">Esperado</th>
                    <th className="px-3 py-2 text-right font-semibold">Desvío</th>
                    <th className="px-3 py-2 text-left font-semibold">Alerta</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.slice(0, ROW_CAP).map((r) => {
                    const expanded = open === r.code;
                    return (
                      <Fragment key={r.code}>
                        <tr className={`border-b border-gray-100 hover:bg-gray-50 ${r.alert ? 'bg-amber-50/40' : ''}`}>
                          {canCreate && (
                            <td className="px-2 py-1.5 text-center">
                              {canAcceptStep(r) && (
                                <input type="checkbox" checked={selected.includes(r.code)} onChange={() => setSelected((s) => toggleCode(s, r.code))}
                                  aria-label={`Crear el paso de la cuenta ${r.code}`} />
                              )}
                            </td>
                          )}
                          <td className="px-3 py-1.5 font-mono text-gray-700">{r.code}</td>
                          <td className="px-3 py-1.5 text-gray-700">{r.name}</td>
                          <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">{NATURE_LABEL[r.nature]}</td>
                          <td className="px-3 py-1.5 text-right font-mono text-gray-600">{r.interimBalance === null ? '—' : money(r.interimBalance)}</td>
                          <td className="px-3 py-1.5 text-right font-mono text-gray-600">{r.finalBalance === null ? '—' : money(r.finalBalance)}</td>
                          <td className={`px-3 py-1.5 text-right font-mono ${r.movement < 0 ? 'text-red-600' : 'text-gray-700'}`}>{money(r.movement)}</td>
                          <td className="px-3 py-1.5 text-right font-mono text-gray-500">{r.expectedFinal === null ? '—' : money(r.expectedFinal)}</td>
                          <td className="px-3 py-1.5 text-right font-mono text-gray-500">
                            {r.deviation === null ? '—' : `${money(r.deviation)}${r.deviationPct === null ? '' : ` (${r.deviationPct.toFixed(1)}%)`}`}
                          </td>
                          <td className="px-3 py-1.5">
                            {r.alert && r.reason ? (
                              <button type="button" onClick={() => setOpen(expanded ? null : r.code)} aria-expanded={expanded}
                                className="flex items-center gap-1 text-[11px] font-semibold text-amber-800 hover:underline text-left">
                                {expanded ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
                                {REASON_LABEL[r.reason]}
                              </button>
                            ) : <span className="text-gray-300">—</span>}
                            {r.stepId && <span className="block text-[10px] font-semibold text-emerald-700">Paso creado</span>}
                          </td>
                        </tr>
                        {expanded && r.suggestedStep && (
                          <tr className="border-b border-gray-100 bg-amber-50/60">
                            <td colSpan={canCreate ? 10 : 9} className="px-4 py-2 text-[11px] text-gray-700">
                              <span className="font-semibold text-gray-500 uppercase tracking-wide text-[10px] mr-2">Paso sugerido</span>{r.suggestedStep}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {shown.length > ROW_CAP && <p className="text-[11px] text-gray-500">Se muestran las primeras {ROW_CAP} de {shown.length} cuentas; usa los filtros para acotar.</p>}
        </>
      )}
    </div>
  );
}
