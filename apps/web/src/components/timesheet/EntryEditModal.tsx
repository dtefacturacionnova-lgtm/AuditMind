'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, Loader2, Pencil } from 'lucide-react';
import { useUpdateTimesheetEntry, type TimesheetEntry } from '@/hooks/useTimesheet';
import { buildSingleEntry, type SingleEntryForm, type WeekRow } from '@/lib/timesheet-week';
import { Modal, btnGhost, btnPrimary } from './Modal';
import { SingleEntryFields } from './SingleEntryFields';

/** Pasa una hora guardada a los campos del formulario. */
export function entryToForm(e: TimesheetEntry): SingleEntryForm {
  return {
    workDate: e.workDate.slice(0, 10),
    hours: String(e.hours),
    rowKey: e.auditId ? `audit:${e.auditId}` : `cat:${e.category}`,
    description: e.description ?? '',
    billable: e.category !== 'CLIENT_NON_BILLABLE',
    reason: e.nonBillableReason ?? '',
  };
}

/** Si el encargo de la hora ya no está entre mis asignaciones, se agrega como fila fija para poder editarla igual. */
export function rowsWithEntry(rows: WeekRow[], e: TimesheetEntry): WeekRow[] {
  if (e.auditId) {
    if (rows.some(r => r.auditId === e.auditId)) return rows;
    return [{ key: `audit:${e.auditId}`, label: 'Encargo (ya no asignado)', category: 'CLIENT_BILLABLE', auditId: e.auditId, client: true }, ...rows];
  }
  // Hora de cliente ligada solo a un ítem del plan (la crea la ruta vieja del plan): no tiene fila de encargo en la captura.
  if ((e.category === 'CLIENT_BILLABLE' || e.category === 'CLIENT_NON_BILLABLE') && !rows.some(r => r.key === `cat:${e.category}`)) {
    return [{ key: `cat:${e.category}`, label: 'Ítem del plan', category: e.category, client: true }, ...rows];
  }
  return rows;
}

/** Edita una hora propia de un mes ABIERTO. Para un mes cerrado se usa AdjustmentModal. */
export function EntryEditModal({
  entry, rows, requireDescription, onClose,
}: { entry: TimesheetEntry; rows: WeekRow[]; requireDescription: boolean; onClose: () => void }) {
  const allRows = useMemo(() => rowsWithEntry(rows, entry), [rows, entry]);
  const [form, setForm] = useState<SingleEntryForm>(() => entryToForm(entry));
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateTimesheetEntry();

  const save = async () => {
    const { entry: next, error: err } = buildSingleEntry(form, allRows, requireDescription);
    if (!next) { setError(err ?? 'Revisa los datos.'); return; }
    try {
      await update.mutateAsync({
        id: entry.id,
        workDate: next.workDate, hours: next.hours, category: next.category,
        description: next.description ?? null,
        auditId: next.auditId ?? null,
        nonBillableReason: next.nonBillableReason ?? null,
      });
      onClose();
    } catch (e) {
      setError((e as Error).message || 'No se pudo guardar el cambio.');
    }
  };

  return (
    <Modal
      title="Editar horas" icon={<Pencil className="w-4 h-4 text-blue-600" />} onClose={onClose}
      footer={(
        <>
          <button onClick={onClose} className={btnGhost}>Cancelar</button>
          <button onClick={save} disabled={update.isPending} className={btnPrimary}>
            {update.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Guardar cambios
          </button>
        </>
      )}
    >
      <SingleEntryFields form={form} onChange={setForm} rows={allRows} />
      {error && (
        <div className="flex items-start gap-2 rounded-xl px-3 py-2 text-xs font-medium bg-red-50 text-red-600 border border-red-200">
          <AlertCircle className="w-4 h-4 shrink-0 mt-px" /> {error}
        </div>
      )}
    </Modal>
  );
}
