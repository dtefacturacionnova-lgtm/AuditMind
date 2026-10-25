'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  useCreateScheduleItem, useGenerateSchedule, useUpdateScheduleItem, FeeView, MilestoneData, ScheduleItem, ScheduleItemKind,
} from '@/hooks/useCollections';
import { formatMoney } from '@/lib/utils';
import { ErrorLine, Field, Modal, btnGhost, btnPrimary, btnSmall, inputCls, todayIso } from './ui';

type Mode = 'EQUAL' | 'MILESTONES' | 'SINGLE';
interface MilestoneRow { label: string; date: string; value: string }

/** Genera el calendario de cobros: cuotas iguales, por hitos o pago único. La última cuota absorbe los centavos. */
export function GenerateScheduleModal({ view, onClose }: { view: FeeView; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('EQUAL');
  const [count, setCount] = useState('12');
  const [firstDate, setFirstDate] = useState(todayIso());
  const [every, setEvery] = useState('1');
  const [label, setLabel] = useState('Honorarios');
  const [replace, setReplace] = useState(true);
  const [byPercent, setByPercent] = useState(true);
  const [rows, setRows] = useState<MilestoneRow[]>([{ label: 'Firma del contrato', date: todayIso(), value: '30' }, { label: 'Informe final', date: todayIso(), value: '70' }]);
  const generate = useGenerateSchedule();

  const total = view.fee?.totalAmount ?? 0;
  const base = replace ? total - view.summary.invoicedNet : (view.summary.unscheduled ?? 0);
  const n = Number(count);
  const preview = mode === 'EQUAL' && n > 0 && base > 0 ? Math.floor((base * 100) / n) / 100 : null;
  const pctSum = rows.reduce((s, r) => s + (Number(r.value) || 0), 0);
  const amtSum = rows.reduce((s, r) => s + (Number(r.value) || 0), 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = mode === 'EQUAL'
      ? { mode, count: n, firstDate, everyMonths: Number(every), replacePlanned: replace }
      : mode === 'SINGLE'
        ? { mode, firstDate, label, replacePlanned: replace }
        : {
          mode, replacePlanned: replace,
          milestones: rows.map<MilestoneData>((r) => ({ label: r.label, date: r.date, ...(byPercent ? { percent: Number(r.value) } : { amount: Number(r.value) }) })),
        };
    try { await generate.mutateAsync({ engagementId: view.engagement.id, data }); onClose(); } catch { /* abajo */ }
  };

  return (
    <Modal title="Generar calendario de cobros" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-xs text-gray-500">
          Por programar: <strong>{formatMoney(Math.max(0, base))}</strong> netos (honorario {formatMoney(total)} − facturado {formatMoney(view.summary.invoicedNet)}{replace ? '' : ` − ya programado ${formatMoney(view.summary.scheduled)}`}).
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Forma de reparto">
            <select value={mode} onChange={(e) => setMode(e.target.value as Mode)} className={inputCls}>
              <option value="EQUAL">Cuotas iguales</option>
              <option value="MILESTONES">Por hitos</option>
              <option value="SINGLE">Pago único</option>
            </select>
          </Field>
          <label className="flex items-end gap-2 text-xs text-gray-600 pb-2">
            <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
            Reemplazar las cuotas que aún no se han facturado
          </label>
        </div>

        {mode === 'EQUAL' && (
          <div className="grid grid-cols-3 gap-3">
            <Field label="Cantidad de cuotas"><input type="number" min={1} max={60} value={count} onChange={(e) => setCount(e.target.value)} className={inputCls} /></Field>
            <Field label="Primera cuota"><input type="date" value={firstDate} onChange={(e) => setFirstDate(e.target.value)} className={inputCls} /></Field>
            <Field label="Cada">
              <select value={every} onChange={(e) => setEvery(e.target.value)} className={inputCls}>
                {[1, 2, 3, 4, 6, 12].map((m) => <option key={m} value={m}>{m === 1 ? 'mes' : `${m} meses`}</option>)}
              </select>
            </Field>
            {preview !== null && <p className="col-span-3 text-xs text-gray-500">≈ {formatMoney(preview)} por cuota; la última absorbe los centavos.</p>}
          </div>
        )}

        {mode === 'SINGLE' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha del cobro"><input type="date" value={firstDate} onChange={(e) => setFirstDate(e.target.value)} className={inputCls} /></Field>
            <Field label="Etiqueta"><input value={label} onChange={(e) => setLabel(e.target.value)} className={inputCls} /></Field>
          </div>
        )}

        {mode === 'MILESTONES' && (
          <div className="space-y-2">
            <div className="flex items-center gap-4 text-xs text-gray-600">
              <label className="flex items-center gap-1"><input type="radio" checked={byPercent} onChange={() => setByPercent(true)} /> Por porcentaje</label>
              <label className="flex items-center gap-1"><input type="radio" checked={!byPercent} onChange={() => setByPercent(false)} /> Por monto</label>
              <span className="ml-auto">{byPercent ? `Suma: ${pctSum.toFixed(2)} % (debe ser 100)` : `Suma: ${formatMoney(amtSum)} (debe ser ${formatMoney(Math.max(0, base))})`}</span>
            </div>
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-[1fr_9rem_6rem_2rem] gap-2 items-center">
                <input placeholder="Hito (ej. Entrega del informe)" value={r.label} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} className={inputCls} />
                <input type="date" value={r.date} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} className={inputCls} />
                <input type="number" step="0.01" min="0" placeholder={byPercent ? '%' : 'USD'} value={r.value} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} className={inputCls} />
                <button type="button" aria-label="Quitar hito" disabled={rows.length <= 1} onClick={() => setRows(rows.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-600 disabled:opacity-30"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            <button type="button" onClick={() => setRows([...rows, { label: '', date: todayIso(), value: '' }])} className={`${btnSmall} inline-flex items-center gap-1`}><Plus className="w-3 h-3" /> Agregar hito</button>
          </div>
        )}

        <ErrorLine error={generate.error} />
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className={`flex-1 ${btnGhost}`}>Cancelar</button>
          <button type="submit" disabled={generate.isPending || base <= 0} className={`flex-1 ${btnPrimary}`}>{generate.isPending ? 'Generando…' : 'Generar calendario'}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Agregar a mano una cuota, o editar una que todavía no tiene factura. */
export function ScheduleItemModal({ engagementId, item, onClose }: { engagementId: string; item?: ScheduleItem; onClose: () => void }) {
  const [label, setLabel] = useState(item?.label ?? '');
  const [kind, setKind] = useState<ScheduleItemKind>(item?.kind ?? 'INSTALLMENT');
  const [dueDate, setDueDate] = useState(item?.dueDate ?? todayIso());
  const [amount, setAmount] = useState(item ? String(item.amount) : '');
  const create = useCreateScheduleItem();
  const update = useUpdateScheduleItem();
  const mutation = item ? update : create;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = { label, kind, dueDate, amount: Number(amount) };
    try {
      if (item) await update.mutateAsync({ itemId: item.id, data });
      else await create.mutateAsync({ engagementId, data });
      onClose();
    } catch { /* abajo */ }
  };

  return (
    <Modal title={item ? 'Editar cuota' : 'Agregar cuota'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Etiqueta *"><input required value={label} onChange={(e) => setLabel(e.target.value)} className={inputCls} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo">
            <select value={kind} onChange={(e) => setKind(e.target.value as ScheduleItemKind)} className={inputCls}>
              <option value="INSTALLMENT">Cuota</option><option value="MILESTONE">Hito</option><option value="ADVANCE">Anticipo</option>
            </select>
          </Field>
          <Field label="Fecha a facturar *"><input required type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} /></Field>
        </div>
        <Field label="Monto neto (USD) *"><input required type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} /></Field>
        <ErrorLine error={mutation.error} />
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className={`flex-1 ${btnGhost}`}>Cancelar</button>
          <button type="submit" disabled={mutation.isPending} className={`flex-1 ${btnPrimary}`}>{mutation.isPending ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  );
}
