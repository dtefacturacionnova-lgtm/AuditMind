'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, Loader2, Lock } from 'lucide-react';
import { useCreateAdjustment, type CreateAdjustmentData } from '@/hooks/useHoursClose';
import type { TimesheetEntry } from '@/hooks/useTimesheet';
import {
  MIN_DESCRIPTION_LENGTH, buildSingleEntry, monthLabel, monthName, parseDateKey, toDateKey, type MonthKey, type SingleEntryForm, type WeekRow,
} from '@/lib/timesheet-week';
import { Modal, btnGhost, btnPrimary, inputCls } from './Modal';
import { SingleEntryFields } from './SingleEntryFields';
import { entryToForm, rowsWithEntry } from './EntryEditModal';

export type AdjustmentRequest =
  | { kind: 'ADD'; month: MonthKey }
  | { kind: 'EDIT' | 'DELETE'; entry: TimesheetEntry };

const TITLES = { ADD: 'Pedir que se agreguen horas', EDIT: 'Pedir un cambio de horas', DELETE: 'Pedir que se borren horas' } as const;

const firstDay = (m: MonthKey) => `${monthLabel(m)}-01`;
const lastDay = (m: MonthKey) => toDateKey(new Date(m.year, m.month, 0, 12));

/**
 * Pedido de ajuste de un mes ya cerrado: la persona explica por qué y un gerente lo aprueba o lo rechaza. No cambia nada
 * hasta que se aprueba.
 */
export function AdjustmentModal({
  request, rows, closed, onClose, onDone,
}: { request: AdjustmentRequest; rows: WeekRow[]; closed: MonthKey[]; onClose: () => void; onDone: (message: string) => void }) {
  const editing = request.kind !== 'ADD' ? request.entry : null;
  const allRows = useMemo(() => (editing ? rowsWithEntry(rows, editing) : rows), [rows, editing]);
  const [month, setMonth] = useState<MonthKey>(request.kind === 'ADD' ? request.month : (closed[0] ?? { year: 0, month: 0 }));
  const [form, setForm] = useState<SingleEntryForm>(() => editing
    ? entryToForm(editing)
    : { workDate: lastDay(request.kind === 'ADD' ? request.month : month), hours: '', rowKey: '', description: '', billable: true, reason: '' });
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const create = useCreateAdjustment();

  const send = async () => {
    if (reason.trim().length < MIN_DESCRIPTION_LENGTH) { setError('Cuéntale al gerente por qué hace falta el cambio.'); return; }
    let data: CreateAdjustmentData;
    if (request.kind === 'DELETE') {
      data = { action: 'DELETE', timeEntryId: request.entry.id, reason: reason.trim() };
    } else {
      // Un ajuste siempre exige descripción en horas de cliente: el cierre está activo.
      const { entry, error: err } = buildSingleEntry(form, allRows, true);
      if (!entry) { setError(err ?? 'Revisa los datos.'); return; }
      if (request.kind === 'ADD') {
        data = { action: 'ADD', entry, reason: reason.trim() };
      } else {
        data = {
          action: 'EDIT', timeEntryId: request.entry.id, reason: reason.trim(),
          changes: {
            hours: entry.hours, category: entry.category, description: entry.description ?? null,
            auditId: entry.auditId ?? null, nonBillableReason: entry.nonBillableReason ?? null,
          },
        };
      }
    }
    try {
      await create.mutateAsync(data);
      onDone('Pedido enviado. Tu gerente lo revisará; las horas no cambian hasta que lo apruebe.');
      onClose();
    } catch (e) {
      setError((e as Error).message || 'No se pudo enviar el pedido.');
    }
  };

  return (
    <Modal
      title={TITLES[request.kind]} icon={<Lock className="w-4 h-4 text-amber-600" />} onClose={onClose}
      footer={(
        <>
          <button onClick={onClose} className={btnGhost}>Cancelar</button>
          <button onClick={send} disabled={create.isPending} className={btnPrimary}>
            {create.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Enviar pedido
          </button>
        </>
      )}
    >
      <p className="text-xs text-gray-500">
        {request.kind === 'ADD'
          ? <>Ese mes ya está cerrado. Indica las horas que faltan; se agregan solo si un gerente aprueba el pedido.</>
          : <>El mes de estas horas ya está cerrado. Tu gerente decide si el cambio procede.</>}
      </p>

      {request.kind === 'ADD' && closed.length > 1 && (
        <label className="block text-xs font-medium text-gray-600">
          Mes cerrado
          <select
            value={monthLabel(month)} className={`${inputCls} mt-1`}
            onChange={e => {
              const m = closed.find(c => monthLabel(c) === e.target.value)!;
              setMonth(m);
              setForm(f => ({ ...f, workDate: lastDay(m) }));
            }}
          >
            {closed.map(m => <option key={monthLabel(m)} value={monthLabel(m)}>{monthName(m)}</option>)}
          </select>
        </label>
      )}

      {request.kind === 'DELETE' ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
          <p className="font-semibold text-gray-700">
            {parseDateKey(request.entry.workDate.slice(0, 10)).toLocaleDateString('es-SV', { day: '2-digit', month: 'long', year: 'numeric' })} · {request.entry.hours}h
          </p>
          <p>{request.entry.description || 'Sin descripción'}</p>
        </div>
      ) : (
        <SingleEntryFields
          form={form} onChange={setForm} rows={allRows}
          dateMin={firstDay(request.kind === 'ADD' ? month : { year: Number(form.workDate.slice(0, 4)), month: Number(form.workDate.slice(5, 7)) })}
          dateMax={lastDay(request.kind === 'ADD' ? month : { year: Number(form.workDate.slice(0, 4)), month: Number(form.workDate.slice(5, 7)) })}
          lockDate={request.kind === 'EDIT'}
        />
      )}

      <label className="block text-xs font-medium text-gray-600">
        Motivo del pedido
        <textarea
          rows={2} value={reason} maxLength={1000} onChange={e => setReason(e.target.value)}
          placeholder="Por qué hace falta el cambio" className={`${inputCls} mt-1 resize-none`}
        />
      </label>

      {error && (
        <div className="flex items-start gap-2 rounded-xl px-3 py-2 text-xs font-medium bg-red-50 text-red-600 border border-red-200">
          <AlertCircle className="w-4 h-4 shrink-0 mt-px" /> {error}
        </div>
      )}
    </Modal>
  );
}
