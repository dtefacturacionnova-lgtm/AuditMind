'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ChevronLeft, ChevronRight, CalendarDays, Clock, Save, Loader2, Trash2, BarChart3, CheckCircle2, AlertCircle,
  Lock, Pencil, Copy, Eraser, Plus, Hourglass,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import {
  useMyAssignments, useTimesheetEntries, useCreateTimesheetEntriesBulk, useDeleteTimesheetEntry,
  NON_BILLABLE_CATEGORIES, CATEGORY_LABELS, type TimesheetEntry,
} from '@/hooks/useTimesheet';
import { useMyPeriods } from '@/hooks/useHoursClose';
import { apiClient } from '@/lib/api-client';
import {
  MAX_DAILY_HOURS, NON_BILLABLE_REASON_LABELS, addDays, buildEntries, buildWeekRows, copyPreviousWeek, dayTotals, emptyMeta,
  formatHours, isClosedDay, monthName, monthsOfDays, overCapDays, parseDateKey, toDateKey, weekDays,
  type DraftValues, type MonthKey, type RowMeta, type SavedEntryLike,
} from '@/lib/timesheet-week';
import { EntryEditModal } from '@/components/timesheet/EntryEditModal';
import { AdjustmentModal, type AdjustmentRequest } from '@/components/timesheet/AdjustmentModal';

const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const fmtLong = (key: string) => parseDateKey(key).toLocaleDateString('es-SV', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtShort = (key: string) => parseDateKey(key).toLocaleDateString('es-SV', { day: 'numeric', month: 'short' });

const cellCls =
  'w-[4.5rem] text-center rounded-md border border-gray-200 px-1 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-300 disabled:cursor-not-allowed';

export default function TimesheetPage() {
  const [anchor, setAnchor] = useState(() => toDateKey(new Date()));
  const days = useMemo(() => weekDays(anchor), [anchor]);
  const todayKey = toDateKey(new Date());
  const dateFrom = days[0];
  const dateTo = days[6];

  const { data: assignments = [], isLoading: loadingAssignments } = useMyAssignments();
  const { data: saved = [], isLoading: loadingEntries } = useTimesheetEntries({ dateFrom, dateTo });
  const { data: periods } = useMyPeriods(dateFrom, dateTo);
  const bulkCreate = useCreateTimesheetEntriesBulk();
  const deleteEntry = useDeleteTimesheetEntry();

  const closed: MonthKey[] = useMemo(() => (periods?.closed ?? []).map(c => ({ year: c.year, month: c.month })), [periods]);
  const requireDescription = !!periods?.enabled;
  const rows = useMemo(() => buildWeekRows(assignments, NON_BILLABLE_CATEGORIES), [assignments]);

  const [values, setValues] = useState<DraftValues>({});
  const [meta, setMeta] = useState<Record<string, RowMeta>>({});
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string; details?: string[] } | null>(null);
  const [editing, setEditing] = useState<TimesheetEntry | null>(null);
  const [adjusting, setAdjusting] = useState<AdjustmentRequest | null>(null);
  const [copying, setCopying] = useState(false);

  // Otra semana → borrador limpio (las horas ya guardadas se listan aparte).
  useEffect(() => { setValues({}); setMeta({}); setMessage(null); }, [dateFrom]);

  const metaOf = (key: string): RowMeta => meta[key] ?? emptyMeta();
  const setCell = (rowKey: string, day: string, value: string) =>
    setValues(prev => ({ ...prev, [rowKey]: { ...(prev[rowKey] ?? {}), [day]: value } }));
  const setMetaField = (rowKey: string, patch: Partial<RowMeta>) =>
    setMeta(prev => ({ ...prev, [rowKey]: { ...(prev[rowKey] ?? emptyMeta()), ...patch } }));

  const draft = useMemo(() => buildEntries(rows, values, meta, closed, requireDescription), [rows, values, meta, closed, requireDescription]);
  const totals = useMemo(() => dayTotals(days, saved, draft.entries), [days, saved, draft.entries]);
  const overDays = overCapDays(totals);
  const hasDraft = Object.values(values).some(v => Object.values(v).some(x => String(x ?? '').trim() !== ''));

  const billableDraft = draft.entries.filter(e => e.category === 'CLIENT_BILLABLE').reduce((s, e) => s + e.hours, 0);
  const otherDraft = draft.entries.reduce((s, e) => s + e.hours, 0) - billableDraft;
  const savedTotal = saved.reduce((s, e) => s + e.hours, 0);

  const handleSave = async () => {
    if (draft.entries.length === 0 && draft.errors.length === 0) {
      setMessage({ type: 'error', text: 'Escribe al menos una cantidad de horas antes de guardar.' });
      return;
    }
    if (draft.errors.length > 0) {
      setMessage({ type: 'error', text: 'Corrige esto antes de guardar:', details: draft.errors });
      return;
    }
    if (overDays.length > 0) {
      setMessage({ type: 'error', text: `Hay días que superan las ${MAX_DAILY_HOURS}h: ${overDays.map(fmtShort).join(', ')}.` });
      return;
    }
    try {
      const res = await bulkCreate.mutateAsync(draft.entries);
      setValues({});
      setMeta({});
      setMessage({ type: 'ok', text: `${res.created} registro${res.created !== 1 ? 's' : ''} guardado${res.created !== 1 ? 's' : ''} correctamente.` });
    } catch (err) {
      const e = err as Error & { errors?: { index: number; error: string }[] };
      setMessage({ type: 'error', text: e?.message ?? 'Error al guardar las horas.' });
    }
  };

  const handleCopyPrevious = async () => {
    setCopying(true);
    setMessage(null);
    try {
      const prevFrom = addDays(dateFrom, -7);
      const prevTo = addDays(dateFrom, -1);
      const prev = await apiClient.get<TimesheetEntry[]>(`/timesheet/entries?dateFrom=${prevFrom}&dateTo=${prevTo}`);
      const asLike = (e: TimesheetEntry): SavedEntryLike => ({
        workDate: e.workDate, hours: e.hours, category: e.category, description: e.description, auditId: e.auditId, nonBillableReason: e.nonBillableReason,
      });
      const result = copyPreviousWeek(prev.map(asLike), rows, days, saved.map(asLike), closed);
      if (result.copied === 0) {
        setMessage({ type: 'error', text: prev.length === 0 ? 'La semana anterior no tiene horas registradas.' : 'No había nada que copiar: ya está registrado o el encargo ya no te está asignado.' });
      } else {
        setValues(prevValues => {
          const merged: DraftValues = { ...prevValues };
          for (const [k, v] of Object.entries(result.values)) merged[k] = { ...(merged[k] ?? {}), ...v };
          return merged;
        });
        setMeta(prevMeta => ({ ...prevMeta, ...result.meta }));
        setMessage({
          type: 'ok',
          text: `Se copiaron ${result.copied} registro${result.copied !== 1 ? 's' : ''} de la semana anterior${result.skipped ? ` (${result.skipped} no se pudieron copiar)` : ''}. Revísalos y guarda.`,
        });
      }
    } catch (err) {
      setMessage({ type: 'error', text: (err as Error).message || 'No se pudo leer la semana anterior.' });
    } finally {
      setCopying(false);
    }
  };

  const isLoading = loadingAssignments || loadingEntries;
  const clientRows = rows.filter(r => r.client);
  const otherRows = rows.filter(r => !r.client);
  const weekMonths = monthsOfDays(days);
  const closedInWeek = weekMonths.filter(m => closed.some(c => c.year === m.year && c.month === m.month));
  const weekHasOpenDays = days.some(d => !isClosedDay(d, closed));

  const sortedSaved = useMemo(
    () => [...saved].sort((a, b) => a.workDate.localeCompare(b.workDate) || a.createdAt.localeCompare(b.createdAt)),
    [saved],
  );

  const renderRowCells = (rowKey: string, disabledAll = false) => days.map(day => {
    const dayClosed = isClosedDay(day, closed);
    return (
      <td key={day} className="px-1 py-1.5 text-center">
        <input
          type="number" min="0" max={MAX_DAILY_HOURS} step="0.25" inputMode="decimal"
          value={values[rowKey]?.[day] ?? ''}
          disabled={dayClosed || disabledAll}
          onChange={e => setCell(rowKey, day, e.target.value)}
          placeholder="—" aria-label={`${rowKey} ${day}`}
          className={cellCls}
        />
      </td>
    );
  });

  return (
    <div className="flex flex-col h-full">
      <Header title="Captura de Horas" />

      <div className="flex-1 overflow-auto p-6 space-y-5">

        {/* Navegador de semana */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button onClick={() => setAnchor(a => addDays(a, -7))} className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-500" title="Semana anterior">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white">
              <CalendarDays className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-semibold text-gray-800">Semana del {fmtLong(dateFrom)} al {fmtLong(dateTo)}</span>
            </div>
            <button onClick={() => setAnchor(a => addDays(a, 7))} className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-500" title="Semana siguiente">
              <ChevronRight className="w-4 h-4" />
            </button>
            {!days.includes(todayKey) && (
              <button onClick={() => setAnchor(todayKey)} className="px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-xs font-medium text-gray-600">
                Esta semana
              </button>
            )}
          </div>
          <Link href="/dashboard/timesheet/report" className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-xs font-medium text-gray-600">
            <BarChart3 className="w-3.5 h-3.5" />
            Ver reporte consolidado
          </Link>
        </div>

        {/* Meses cerrados */}
        {closedInWeek.map(m => (
          <div key={`${m.year}-${m.month}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 text-xs bg-amber-50 text-amber-800 border border-amber-200">
            <span className="flex items-start gap-2">
              <Lock className="w-4 h-4 shrink-0 mt-px" />
              <span>
                <strong className="capitalize">{monthName(m)}</strong> ya está cerrado: no se puede registrar, editar ni borrar directamente.
                Si falta algo o hay un error, pide un ajuste y tu gerente lo revisa.
              </span>
            </span>
            <button
              onClick={() => setAdjusting({ kind: 'ADD', month: m })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-amber-300 font-semibold hover:bg-amber-100"
            >
              <Plus className="w-3.5 h-3.5" /> Pedir que se agreguen horas
            </button>
          </div>
        ))}
        {!!periods?.pendingAdjustments && (
          <div className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
            <Hourglass className="w-4 h-4 shrink-0" />
            Tienes {periods.pendingAdjustments} pedido{periods.pendingAdjustments !== 1 ? 's' : ''} de ajuste esperando respuesta de tu gerente.
          </div>
        )}

        {/* Resumen */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Facturable (borrador)', value: billableDraft, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Otras horas (borrador)', value: otherDraft, color: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'Ya guardado esta semana', value: savedTotal, color: 'text-gray-600', bg: 'bg-gray-100' },
            { label: 'Total de la semana', value: savedTotal + billableDraft + otherDraft, color: 'text-blue-600', bg: 'bg-blue-50' },
          ].map(({ label, value, color, bg }) => (
            <div key={label} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
              <div className={`w-8 h-8 rounded-xl ${bg} flex items-center justify-center mb-2`}><Clock className={`w-4 h-4 ${color}`} /></div>
              <p className="text-2xl font-bold text-gray-900">{value.toFixed(2).replace(/\.?0+$/, '') || '0'}h</p>
              <p className="text-xs text-gray-500">{label}</p>
            </div>
          ))}
        </div>

        {overDays.length > 0 && (
          <div className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-medium bg-red-50 text-red-600 border border-red-200">
            <AlertCircle className="w-4 h-4 shrink-0" />
            Estos días superan el máximo de {MAX_DAILY_HOURS}h: {overDays.map(d => `${fmtShort(d)} (${formatHours(totals[d].total)})`).join(', ')}. Ajusta las cantidades antes de guardar.
          </div>
        )}

        {message && (
          <div className={`rounded-xl px-4 py-2.5 text-xs font-medium ${message.type === 'ok' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
            <div className="flex items-center gap-2">
              {message.type === 'ok' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              {message.text}
            </div>
            {message.details && (
              <ul className="mt-1.5 ml-6 list-disc space-y-0.5 font-normal">{message.details.map(d => <li key={d}>{d}</li>)}</ul>
            )}
          </div>
        )}

        {/* Cuadrícula semanal */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="flex justify-center py-14"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse min-w-[760px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-gray-200">
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Actividad</th>
                    {days.map(day => {
                      const d = parseDateKey(day);
                      const weekend = d.getDay() === 0 || d.getDay() === 6;
                      return (
                        <th key={day} className={`px-1 py-2 text-center font-semibold w-[5rem] ${day === todayKey ? 'text-blue-700' : weekend ? 'text-gray-400' : 'text-gray-600'}`}>
                          <div className="text-xs">{DAY_SHORT[d.getDay()]}</div>
                          <div className={`text-sm ${day === todayKey ? 'inline-block rounded-full bg-blue-600 text-white px-1.5' : ''}`}>{d.getDate()}</div>
                          {isClosedDay(day, closed) && <Lock className="w-3 h-3 mx-auto mt-0.5 text-amber-500" aria-label="Mes cerrado" />}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {clientRows.length > 0 && (
                    <tr className="bg-emerald-50/40">
                      <td colSpan={8} className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">Encargos</td>
                    </tr>
                  )}
                  {clientRows.map(row => {
                    const m = metaOf(row.key);
                    const hasValues = Object.values(values[row.key] ?? {}).some(x => String(x ?? '').trim() !== '');
                    return (
                      <FragmentRow key={row.key}>
                        <tr className="border-t border-gray-100">
                          <td className="px-4 pt-2.5 pb-1 text-gray-700 font-medium align-top">{row.label}</td>
                          {renderRowCells(row.key, !weekHasOpenDays)}
                        </tr>
                        <tr className="border-b border-gray-100">
                          <td colSpan={8} className="px-4 pb-2.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                type="text" value={m.description} maxLength={2000}
                                onChange={e => setMetaField(row.key, { description: e.target.value })}
                                placeholder={requireDescription ? 'Descripción del trabajo (obligatoria)' : 'Descripción del trabajo (opcional)'}
                                aria-label={`Descripción ${row.label}`}
                                className={`flex-1 min-w-[14rem] rounded-md border px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                  hasValues && requireDescription && m.description.trim().length < 5 ? 'border-red-300 bg-red-50/40' : 'border-gray-200'
                                }`}
                              />
                              <label className="flex items-center gap-1.5 text-xs text-gray-600 whitespace-nowrap">
                                <input
                                  type="checkbox" checked={m.billable}
                                  onChange={e => setMetaField(row.key, { billable: e.target.checked, reason: e.target.checked ? '' : m.reason })}
                                  className="rounded border-gray-300"
                                />
                                Se factura
                              </label>
                              {!m.billable && (
                                <select
                                  value={m.reason} onChange={e => setMetaField(row.key, { reason: e.target.value as RowMeta['reason'] })}
                                  aria-label={`Motivo de no facturación ${row.label}`}
                                  className="rounded-md border border-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                  <option value="">Motivo…</option>
                                  {Object.entries(NON_BILLABLE_REASON_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                                </select>
                              )}
                            </div>
                          </td>
                        </tr>
                      </FragmentRow>
                    );
                  })}
                  {assignments.length === 0 && !loadingAssignments && (
                    <tr><td colSpan={8} className="px-4 py-3 text-center text-gray-400 italic">No tienes encargos activos asignados.</td></tr>
                  )}

                  <tr className="bg-amber-50/40">
                    <td colSpan={8} className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">Actividades que no son de un encargo</td>
                  </tr>
                  {otherRows.map(row => (
                    <tr key={row.key} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-2 text-gray-700 font-medium">{row.label}</td>
                      {renderRowCells(row.key, !weekHasOpenDays)}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t border-gray-200">
                    <td className="px-4 py-2 text-xs font-semibold text-gray-600">Total del día</td>
                    {days.map(day => (
                      <td key={day} className={`px-1 py-2 text-center text-xs font-bold ${totals[day].total > MAX_DAILY_HOURS ? 'text-red-600' : 'text-gray-700'}`}>
                        {totals[day].total > 0 ? formatHours(totals[day].total) : <span className="text-gray-300">—</span>}
                        {totals[day].draft > 0 && totals[day].saved > 0 && (
                          <div className="text-[10px] font-normal text-gray-400">+{formatHours(totals[day].draft)} nuevas</div>
                        )}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Acciones */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            <button
              onClick={handleCopyPrevious} disabled={copying || isLoading || !weekHasOpenDays}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              {copying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
              Copiar semana anterior
            </button>
            {hasDraft && (
              <button
                onClick={() => { setValues({}); setMeta({}); setMessage(null); }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                <Eraser className="w-3.5 h-3.5" /> Limpiar borrador
              </button>
            )}
          </div>
          <button
            onClick={handleSave}
            disabled={bulkCreate.isPending || isLoading || !hasDraft}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50"
          >
            {bulkCreate.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {bulkCreate.isPending ? 'Guardando…' : 'Guardar semana'}
          </button>
        </div>

        {/* Horas ya registradas */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">Horas ya registradas esta semana</h3>
          </div>
          {sortedSaved.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">Sin horas registradas todavía en esta semana.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-2 font-semibold text-gray-600">Día</th>
                    <th className="text-left px-4 py-2 font-semibold text-gray-600">Categoría</th>
                    <th className="text-right px-4 py-2 font-semibold text-gray-600">Horas</th>
                    <th className="text-left px-4 py-2 font-semibold text-gray-600">Descripción</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {sortedSaved.map(e => {
                    const day = e.workDate.slice(0, 10);
                    const locked = isClosedDay(day, closed);
                    return (
                      <tr key={e.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                        <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{fmtShort(day)}</td>
                        <td className="px-4 py-2 text-gray-600">
                          {CATEGORY_LABELS[e.category]}
                          {e.nonBillableReason && (
                            <span className="ml-1.5 rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-[10px] font-medium">{NON_BILLABLE_REASON_LABELS[e.nonBillableReason]}</span>
                          )}
                          {e.afterClose && (
                            <span className="ml-1.5 rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 text-[10px] font-medium" title="Entró por un ajuste aprobado después del cierre del mes">Ajuste posterior al cierre</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right font-bold text-gray-800">{formatHours(e.hours)}</td>
                        <td className="px-4 py-2 text-gray-600">{e.description ?? <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {locked ? (
                            <span className="inline-flex items-center gap-2">
                              <Lock className="w-3.5 h-3.5 text-amber-500" aria-label="Mes cerrado" />
                              <button onClick={() => setAdjusting({ kind: 'EDIT', entry: e })} className="text-blue-600 hover:underline">Pedir cambio</button>
                              <button onClick={() => setAdjusting({ kind: 'DELETE', entry: e })} className="text-red-500 hover:underline">Pedir borrado</button>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-2">
                              <button onClick={() => setEditing(e)} className="text-gray-400 hover:text-blue-600 transition-colors" title="Editar">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => { if (window.confirm('¿Borrar este registro de horas?')) deleteEntry.mutate(e.id, { onError: (err) => setMessage({ type: 'error', text: (err as Error).message }) }); }}
                                disabled={deleteEntry.isPending}
                                className="text-gray-300 hover:text-red-500 transition-colors" title="Borrar"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {editing && <EntryEditModal entry={editing} rows={rows} requireDescription={requireDescription} onClose={() => setEditing(null)} />}
      {adjusting && (
        <AdjustmentModal
          request={adjusting} rows={rows} closed={closed} onClose={() => setAdjusting(null)}
          onDone={text => setMessage({ type: 'ok', text })}
        />
      )}
    </div>
  );
}

/** Agrupa dos filas de la tabla bajo una sola llave. */
function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
