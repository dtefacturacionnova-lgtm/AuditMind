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

// ─── Date helpers ─────────────────────────────────────────────────────────────
const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function getMonday(d: Date): Date {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay(); // 0=Dom … 6=Sáb
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}

function addDays(d: Date, n: number): Date {
  const date = new Date(d);
  date.setDate(date.getDate() + n);
  return date;
}

/** YYYY-MM-DD en horario LOCAL (evita el desfase de un día que da toISOString con UTC) */
function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDayHeader(d: Date, i: number): string {
  return `${DAY_LABELS[i]} ${d.getDate()}`;
}

function formatWeekRange(start: Date, end: Date): string {
  const fmt = (d: Date) => d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
  return `${fmt(start)} – ${fmt(end)}, ${end.getFullYear()}`;
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
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const days   = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekEnd = days[6];
  const weekKey = toDateKey(weekStart);

  const { data: assignments = [], isLoading: loadingAssignments } = useMyAssignments();
  const { data: existingEntries = [], isLoading: loadingEntries } = useTimesheetEntries({
    dateFrom: toDateKey(weekStart),
    dateTo:   toDateKey(weekEnd),
  });

  const bulkCreate  = useCreateTimesheetEntriesBulk();
  const deleteEntry = useDeleteTimesheetEntry();

  const [grid, setGrid] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  // Nueva semana → limpiar el borrador (las horas ya guardadas se listan aparte).
  useEffect(() => { setGrid({}); setMessage(null); }, [weekKey]);

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

  const getCell = (rowKey: string, dayIdx: number): string => grid[rowKey]?.[dayIdx] ?? '';

  const setCell = (rowKey: string, dayIdx: number, value: string) => {
    setGrid(prev => {
      const current = prev[rowKey] ?? Array(7).fill('');
      const next = [...current];
      next[dayIdx] = value;
      return { ...prev, [rowKey]: next };
    });
  };

  const rowTotal = (row: TimesheetRow): number =>
    (grid[row.key] ?? []).reduce((s, v) => s + (parseFloat(v) || 0), 0);

  const dayTotal = (dayIdx: number): number =>
    rows.reduce((s, row) => s + (parseFloat(grid[row.key]?.[dayIdx] ?? '') || 0), 0);

  const billableTotal    = useMemo(() => rows.filter(r => r.billable).reduce((s, r) => s + rowTotal(r), 0), [rows, grid]);
  const nonBillableTotal = useMemo(() => rows.filter(r => !r.billable).reduce((s, r) => s + rowTotal(r), 0), [rows, grid]);
  const grandTotal = billableTotal + nonBillableTotal;

  const existingTotal = useMemo(() => existingEntries.reduce((s, e) => s + e.hours, 0), [existingEntries]);

  const handleSave = async () => {
    const entries: CreateTimesheetEntryData[] = [];
    rows.forEach(row => {
      days.forEach((day, i) => {
        const raw = getCell(row.key, i);
        const hours = parseFloat(raw);
        if (!raw || Number.isNaN(hours) || hours <= 0) return;
        entries.push({
          workDate: toDateKey(day),
          hours,
          category: row.category,
          ...(row.auditId ? { auditId: row.auditId } : {}),
        });
      });
    });

    if (entries.length === 0) {
      setMessage({ type: 'error', text: 'Ingresa al menos una cantidad de horas antes de guardar.' });
      return;
    }

    try {
      const res = await bulkCreate.mutateAsync(entries);
      setGrid({});
      setMessage({ type: 'ok', text: `${res.created} entrada${res.created !== 1 ? 's' : ''} guardada${res.created !== 1 ? 's' : ''} correctamente.` });
    } catch (err) {
      setMessage({ type: 'error', text: (err as Error)?.message ?? 'Error al guardar las horas.' });
    }
  };

  const isLoading = loadingAssignments || loadingEntries;

  return (
    <div className="flex flex-col h-full">
      <Header title="Captura de Horas" />

      <div className="flex-1 overflow-auto p-6 space-y-6">

        {/* Week navigator + summary */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setWeekStart(w => addDays(w, -7))}
              className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-500"
              title="Semana anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white">
              <CalendarDays className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-semibold text-gray-800">{formatWeekRange(weekStart, weekEnd)}</span>
            </div>
            <button
              onClick={() => setWeekStart(w => addDays(w, 7))}
              className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-500"
              title="Semana siguiente"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setWeekStart(getMonday(new Date()))}
              className="px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-xs font-medium text-gray-600"
            >
              Semana actual
            </button>
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
            { label: 'Facturable (borrador)',     value: billableTotal,    color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'No facturable (borrador)',  value: nonBillableTotal, color: 'text-amber-600',   bg: 'bg-amber-50' },
            { label: 'Total semana (borrador)',    value: grandTotal,       color: 'text-blue-600',    bg: 'bg-blue-50' },
            { label: 'Ya guardado esta semana',    value: existingTotal,    color: 'text-gray-600',    bg: 'bg-gray-100' },
          ].map(({ label, value, color, bg }) => (
            <div key={label} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
              <div className={`w-8 h-8 rounded-xl ${bg} flex items-center justify-center mb-2`}>
                <Clock className={`w-4 h-4 ${color}`} />
              </div>
              <p className="text-2xl font-bold text-gray-900">{value.toFixed(1)}h</p>
              <p className="text-xs text-gray-500">{label}</p>
            </div>
          ))}
        </div>

        {message && (
          <div className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-medium ${
            message.type === 'ok' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-200'
          }`}>
            {message.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {message.text}
          </div>
        )}

        {/* Weekly grid */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="flex justify-center py-14">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-gray-200">
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-600 min-w-[220px]">Actividad</th>
                    {days.map((d, i) => (
                      <th key={i} className="px-2 py-2.5 font-semibold text-gray-600 text-center w-20">
                        {formatDayHeader(d, i)}
                      </th>
                    ))}
                    <th className="px-3 py-2.5 font-semibold text-gray-600 text-right w-20">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.filter(r => r.billable).length > 0 && (
                    <tr className="bg-emerald-50/40">
                      <td colSpan={9} className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                        Encargos (facturable)
                      </td>
                    </tr>
                  )}
                  {rows.filter(r => r.billable).map(row => (
                    <tr key={row.key} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-2 text-gray-700 font-medium truncate max-w-[220px]" title={row.label}>
                        {row.label}
                      </td>
                      {days.map((_, i) => (
                        <td key={i} className="px-1.5 py-1.5">
                          <input
                            type="number" min="0" max="24" step="0.5"
                            value={getCell(row.key, i)}
                            onChange={e => setCell(row.key, i, e.target.value)}
                            placeholder="—"
                            className="w-full text-center rounded-md border border-gray-200 px-1 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right font-bold text-gray-800">{rowTotal(row).toFixed(1)}h</td>
                    </tr>
                  ))}
                  {assignments.length === 0 && !loadingAssignments && (
                    <tr>
                      <td colSpan={9} className="px-4 py-3 text-center text-gray-400 italic">
                        No tienes encargos activos asignados.
                      </td>
                    </tr>
                  )}

                  <tr className="bg-amber-50/40">
                    <td colSpan={9} className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                      Actividades no facturables
                    </td>
                  </tr>
                  {rows.filter(r => !r.billable).map(row => (
                    <tr key={row.key} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-2 text-gray-700 font-medium">{row.label}</td>
                      {days.map((_, i) => (
                        <td key={i} className="px-1.5 py-1.5">
                          <input
                            type="number" min="0" max="24" step="0.5"
                            value={getCell(row.key, i)}
                            onChange={e => setCell(row.key, i, e.target.value)}
                            placeholder="—"
                            className="w-full text-center rounded-md border border-gray-200 px-1 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right font-bold text-gray-800">{rowTotal(row).toFixed(1)}h</td>
                    </tr>
                  ))}

                  {/* Totales por día */}
                  <tr className="bg-gray-50 border-t-2 border-gray-200">
                    <td className="px-4 py-2.5 font-bold text-gray-800">Total del día</td>
                    {days.map((_, i) => (
                      <td key={i} className="px-1.5 py-2.5 text-center font-bold text-gray-800">
                        {dayTotal(i).toFixed(1)}h
                      </td>
                    ))}
                    <td className="px-3 py-2.5 text-right font-black text-gray-900">{grandTotal.toFixed(1)}h</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Save */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={bulkCreate.isPending || isLoading}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50"
          >
            {bulkCreate.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {bulkCreate.isPending ? 'Guardando…' : 'Guardar semana'}
          </button>
        </div>

        {/* Already-saved entries this week */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">Horas ya registradas esta semana</h3>
          </div>
          {existingEntries.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              Sin horas registradas todavía en este rango.
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-2 font-semibold text-gray-600">Fecha</th>
                  <th className="text-left px-4 py-2 font-semibold text-gray-600">Categoría</th>
                  <th className="text-right px-4 py-2 font-semibold text-gray-600">Horas</th>
                  <th className="text-left px-4 py-2 font-semibold text-gray-600">Descripción</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {[...existingEntries]
                  .sort((a, b) => a.workDate.localeCompare(b.workDate))
                  .map(e => (
                    <tr key={e.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                      <td className="px-4 py-2 text-gray-600 whitespace-nowrap">
                        {new Date(e.workDate).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}
                      </td>
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
