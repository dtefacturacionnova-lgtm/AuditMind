'use client';

import {
  NON_BILLABLE_REASON_LABELS, type NonBillableReason, type SingleEntryForm, type WeekRow,
} from '@/lib/timesheet-week';
import { inputCls } from './Modal';

/**
 * Campos de UNA hora: fecha, encargo o actividad, horas, descripción y, para horas de cliente, facturable o no con su motivo.
 * Lo usan la edición de una hora y los pedidos de ajuste de un mes cerrado.
 */
export function SingleEntryFields({
  form, onChange, rows, dateMin, dateMax, lockActivity = false, lockDate = false,
}: {
  form: SingleEntryForm;
  onChange: (next: SingleEntryForm) => void;
  rows: WeekRow[];
  dateMin?: string;
  dateMax?: string;
  lockActivity?: boolean;
  lockDate?: boolean;
}) {
  const row = rows.find(r => r.key === form.rowKey);
  const set = (patch: Partial<SingleEntryForm>) => onChange({ ...form, ...patch });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs font-medium text-gray-600">
          Fecha
          <input
            type="date" value={form.workDate} min={dateMin} max={dateMax} disabled={lockDate}
            onChange={e => set({ workDate: e.target.value })} className={`${inputCls} mt-1`}
          />
        </label>
        <label className="block text-xs font-medium text-gray-600">
          Horas
          <input
            type="number" min="0.25" max="20" step="0.25" value={form.hours} placeholder="0"
            onChange={e => set({ hours: e.target.value })} className={`${inputCls} mt-1`}
          />
        </label>
      </div>

      <label className="block text-xs font-medium text-gray-600">
        Encargo o actividad
        <select
          value={form.rowKey} disabled={lockActivity}
          onChange={e => set({ rowKey: e.target.value })} className={`${inputCls} mt-1`}
        >
          <option value="">Elige…</option>
          {rows.map(r => <option key={r.key} value={r.key}>{r.client ? 'Encargo · ' : ''}{r.label}</option>)}
        </select>
      </label>

      {row?.client && (
        <>
          <label className="block text-xs font-medium text-gray-600">
            Descripción del trabajo
            <textarea
              rows={2} value={form.description} maxLength={2000} placeholder="Qué se hizo (es el respaldo para facturar y revisar)"
              onChange={e => set({ description: e.target.value })} className={`${inputCls} mt-1 resize-none`}
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-medium text-gray-700">
              <input
                type="checkbox" checked={form.billable}
                onChange={e => set({ billable: e.target.checked, reason: e.target.checked ? '' : form.reason })}
                className="rounded border-gray-300"
              />
              Se factura al cliente
            </label>
            {!form.billable && (
              <select
                value={form.reason} onChange={e => set({ reason: e.target.value as NonBillableReason | '' })}
                className={`${inputCls} !w-auto`} aria-label="Motivo de no facturación"
              >
                <option value="">Motivo de no facturación…</option>
                {(Object.keys(NON_BILLABLE_REASON_LABELS) as NonBillableReason[]).map(k => (
                  <option key={k} value={k}>{NON_BILLABLE_REASON_LABELS[k]}</option>
                ))}
              </select>
            )}
          </div>
        </>
      )}
    </div>
  );
}
