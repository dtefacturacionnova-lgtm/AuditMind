'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ChevronLeft, ChevronRight, CalendarDays, Clock, Save,
  Loader2, Trash2, BarChart3, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import {
  useMyAssignments, useTimesheetEntries,
  useCreateTimesheetEntriesBulk, useDeleteTimesheetEntry,
  NON_BILLABLE_CATEGORIES, CATEGORY_LABELS,
  type TimesheetCategory, type CreateTimesheetEntryData,
} from '@/hooks/useTimesheet';

const MAX_DAILY_HOURS = 20;
const DAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/** YYYY-MM-DD en horario LOCAL (evita el desfase de un día que da toISOString con UTC) */
function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const date = new Date(d);
  date.setDate(date.getDate() + n);
  return date;
}

function formatDateHeader(d: Date): string {
  const label = DAY_LABELS[d.getDay()];
  return `${label}, ${d.toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' })}`;
}

// ─── Row model ────────────────────────────────────────────────────────────────
interface TimesheetRow {
  key:      string;
  label:    string;
  category: TimesheetCategory;
  auditId?: string;
  billable: boolean;
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function TimesheetPage() {
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const dateKey = toDateKey(selectedDate);

  const { data: assignments = [], isLoading: loadingAssignments } = useMyAssignments();
  const { data: existingEntries = [], isLoading: loadingEntries } = useTimesheetEntries({
    dateFrom: dateKey,
    dateTo:   dateKey,
  });

  const bulkCreate  = useCreateTimesheetEntriesBulk();
  const deleteEntry = useDeleteTimesheetEntry();

  const [values, setValues] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  // Nuevo día → limpiar el borrador (las horas ya guardadas se listan aparte).
  useEffect(() => { setValues({}); setMessage(null); }, [dateKey]);

  const rows: TimesheetRow[] = useMemo(() => {
    const assignmentRows: TimesheetRow[] = assignments.map(a => ({
      key:      `audit:${a.audit.id}`,
      label:    a.audit.title,
      category: 'CLIENT_BILLABLE',
      auditId:  a.audit.id,
      billable: true,
    }));
    const categoryRows: TimesheetRow[] = NON_BILLABLE_CATEGORIES.map(c => ({
      key:      `cat:${c.category}`,
      label:    c.label,
      category: c.category,
      billable: false,
    }));
    return [...assignmentRows, ...categoryRows];
  }, [assignments]);

  const setValue = (rowKey: string, value: string) => setValues(prev => ({ ...prev, [rowKey]: value }));

  const draftTotal = useMemo(
    () => Object.values(values).reduce((s, v) => s + (parseFloat(v) || 0), 0),
    [values],
  );
  const billableDraft = useMemo(
    () => rows.filter(r => r.billable).reduce((s, r) => s + (parseFloat(values[r.key]) || 0), 0),
    [rows, values],
  );
  const nonBillableDraft = draftTotal - billableDraft;

  const existingTotal = useMemo(() => existingEntries.reduce((s, e) => s + e.hours, 0), [existingEntries]);
  const projectedTotal = existingTotal + draftTotal;
  const overCap = projectedTotal > MAX_DAILY_HOURS;

  const handleSave = async () => {
    const entries: CreateTimesheetEntryData[] = [];
    rows.forEach(row => {
      const raw = values[row.key];
      const hours = parseFloat(raw);
      if (!raw || Number.isNaN(hours) || hours <= 0) return;
      entries.push({
        workDate: dateKey,
        hours,
        category: row.category,
        ...(row.auditId ? { auditId: row.auditId } : {}),
      });
    });

    if (entries.length === 0) {
      setMessage({ type: 'error', text: 'Ingresa al menos una cantidad de horas antes de guardar.' });
      return;
    }

    try {
      const res = await bulkCreate.mutateAsync(entries);
      setValues({});
      setMessage({ type: 'ok', text: `${res.created} entrada${res.created !== 1 ? 's' : ''} guardada${res.created !== 1 ? 's' : ''} correctamente.` });
    } catch (err) {
      setMessage({ type: 'error', text: (err as Error)?.message ?? 'Error al guardar las horas.' });
    }
  };

  const isLoading = loadingAssignments || loadingEntries;
  const isToday = dateKey === toDateKey(new Date());

  return (
    <div className="flex flex-col h-full">
      <Header title="Captura de Horas" />

      <div className="flex-1 overflow-auto p-6 space-y-6">

        {/* Date navigator */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedDate(d => addDays(d, -1))}
              className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-500"
              title="Día anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white">
              <CalendarDays className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-semibold text-gray-800">{formatDateHeader(selectedDate)}</span>
            </div>
            <button
              onClick={() => setSelectedDate(d => addDays(d, 1))}
              className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-500"
              title="Día siguiente"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            {!isToday && (
              <button
                onClick={() => setSelectedDate(new Date())}
                className="px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-xs font-medium text-gray-600"
              >
                Hoy
              </button>
            )}
          </div>

          <Link
            href="/dashboard/timesheet/report"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-xs font-medium text-gray-600"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            Ver reporte consolidado
          </Link>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Facturable (borrador)',    value: billableDraft,    color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'No facturable (borrador)', value: nonBillableDraft, color: 'text-amber-600',   bg: 'bg-amber-50' },
            { label: 'Ya guardado este día',      value: existingTotal,    color: 'text-gray-600',    bg: 'bg-gray-100' },
            { label: 'Total del día',             value: projectedTotal,   color: overCap ? 'text-red-600' : 'text-blue-600', bg: overCap ? 'bg-red-50' : 'bg-blue-50' },
          ].map(({ label, value, color, bg }) => (
            <div key={label} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
              <div className={`w-8 h-8 rounded-xl ${bg} flex items-center justify-center mb-2`}>
                <Clock className={`w-4 h-4 ${color}`} />
              </div>
              <p className={`text-2xl font-bold ${overCap && label === 'Total del día' ? 'text-red-600' : 'text-gray-900'}`}>{value.toFixed(1)}h</p>
              <p className="text-xs text-gray-500">{label}</p>
            </div>
          ))}
        </div>

        {overCap && (
          <div className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-medium bg-red-50 text-red-600 border border-red-200">
            <AlertCircle className="w-4 h-4 shrink-0" />
            El total del día ({projectedTotal.toFixed(1)}h) supera el máximo permitido de {MAX_DAILY_HOURS}h — ajusta las cantidades antes de guardar.
          </div>
        )}

        {message && (
          <div className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-medium ${
            message.type === 'ok' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-200'
          }`}>
            {message.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {message.text}
          </div>
        )}

        {/* Daily grid */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="flex justify-center py-14">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-gray-200">
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Actividad</th>
                    <th className="px-4 py-2.5 font-semibold text-gray-600 text-center w-40">Horas ({dateKey.slice(5)})</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.filter(r => r.billable).length > 0 && (
                    <tr className="bg-emerald-50/40">
                      <td colSpan={2} className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                        Encargos (facturable)
                      </td>
                    </tr>
                  )}
                  {rows.filter(r => r.billable).map(row => (
                    <tr key={row.key} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-2.5 text-gray-700 font-medium">{row.label}</td>
                      <td className="px-4 py-2 flex justify-center">
                        <input
                          type="number" min="0" max="24" step="0.5"
                          value={values[row.key] ?? ''}
                          onChange={e => setValue(row.key, e.target.value)}
                          placeholder="—"
                          className="w-24 text-center rounded-md border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </td>
                    </tr>
                  ))}
                  {assignments.length === 0 && !loadingAssignments && (
                    <tr>
                      <td colSpan={2} className="px-4 py-3 text-center text-gray-400 italic">
                        No tienes encargos activos asignados.
                      </td>
                    </tr>
                  )}

                  <tr className="bg-amber-50/40">
                    <td colSpan={2} className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                      Actividades no facturables
                    </td>
                  </tr>
                  {rows.filter(r => !r.billable).map(row => (
                    <tr key={row.key} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-2.5 text-gray-700 font-medium">{row.label}</td>
                      <td className="px-4 py-2 flex justify-center">
                        <input
                          type="number" min="0" max="24" step="0.5"
                          value={values[row.key] ?? ''}
                          onChange={e => setValue(row.key, e.target.value)}
                          placeholder="—"
                          className="w-24 text-center rounded-md border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Save */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={bulkCreate.isPending || isLoading || overCap}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50"
          >
            {bulkCreate.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {bulkCreate.isPending ? 'Guardando…' : 'Guardar día'}
          </button>
        </div>

        {/* Already-saved entries this day */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">Horas ya registradas este día</h3>
          </div>
          {existingEntries.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              Sin horas registradas todavía en esta fecha.
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-2 font-semibold text-gray-600">Categoría</th>
                  <th className="text-right px-4 py-2 font-semibold text-gray-600">Horas</th>
                  <th className="text-left px-4 py-2 font-semibold text-gray-600">Descripción</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {existingEntries.map(e => (
                  <tr key={e.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                    <td className="px-4 py-2 text-gray-600">{CATEGORY_LABELS[e.category]}</td>
                    <td className="px-4 py-2 text-right font-bold text-gray-800">{e.hours}h</td>
                    <td className="px-4 py-2 text-gray-600">{e.description ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => deleteEntry.mutate(e.id)}
                        disabled={deleteEntry.isPending}
                        className="text-gray-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
