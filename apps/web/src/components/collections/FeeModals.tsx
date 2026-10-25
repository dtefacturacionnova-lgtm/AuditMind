'use client';

import { useState } from 'react';
import {
  useAmendFee, useSetFee, FeeView, FeeType, FeeProgressMethod,
} from '@/hooks/useCollections';
import { formatMoney } from '@/lib/utils';
import { ErrorLine, Field, Modal, btnGhost, btnPrimary, inputCls, todayIso, toMoney } from './ui';

/** Definir o cambiar el honorario del encargo. Con adendas, cuotas o facturas el monto solo cambia por adenda. */
export function FeeModal({ view, onClose }: { view: FeeView; onClose: () => void }) {
  const fee = view.fee;
  const locked = !!fee && (view.amendments.length > 0 || view.schedule.some((s) => s.status !== 'CANCELLED') || view.summary.invoicedNet > 0);
  const [feeType, setFeeType] = useState<FeeType>(fee?.feeType ?? 'FIXED');
  const [amount, setAmount] = useState(fee?.totalAmount != null ? String(fee.totalAmount) : '');
  const [fromProposal, setFromProposal] = useState(false);
  const [term, setTerm] = useState(String(fee?.paymentTermDays ?? 30));
  const [method, setMethod] = useState<FeeProgressMethod>(fee?.progressMethod ?? 'HOURS');
  const [manual, setManual] = useState(fee?.manualProgressPct != null ? String(fee.manualProgressPct) : '');
  const [notes, setNotes] = useState(fee?.notes ?? '');
  const save = useSetFee();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await save.mutateAsync({
        engagementId: view.engagement.id,
        data: {
          feeType,
          ...(feeType === 'FIXED' && (fromProposal ? { importFromProposal: true } : { totalAmount: toMoney(amount) })),
          paymentTermDays: Number(term),
          progressMethod: method,
          ...(method === 'MANUAL' && manual !== '' && { manualProgressPct: Number(manual) }),
          notes,
        },
      });
      onClose();
    } catch { /* se muestra abajo */ }
  };

  return (
    <Modal title={fee ? 'Editar honorario' : 'Definir honorario'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Tipo de honorario">
          <select value={feeType} onChange={(e) => setFeeType(e.target.value as FeeType)} disabled={locked} className={inputCls}>
            <option value="FIXED">Monto fijo (con calendario de cobros)</option>
            <option value="TIME_BASED">Por tiempo (se factura libremente)</option>
          </select>
        </Field>
        {feeType === 'FIXED' && (
          <>
            {!fee && (
              <label className="flex items-center gap-2 text-xs text-gray-600">
                <input type="checkbox" checked={fromProposal} onChange={(e) => setFromProposal(e.target.checked)} />
                Tomar el honorario de la propuesta aceptada (solo si está en USD)
              </label>
            )}
            {!fromProposal && (
              <Field label="Honorario neto (USD, sin IVA) *" hint={locked ? 'Ya hay adendas, cuotas o facturas: para cambiar el monto registra una adenda.' : undefined}>
                <input required type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={locked} className={inputCls} />
              </Field>
            )}
          </>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Días de crédito" hint="Se suman a la fecha de cada factura.">
            <input type="number" min={0} max={365} value={term} onChange={(e) => setTerm(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Avance del servicio">
            <select value={method} onChange={(e) => setMethod(e.target.value as FeeProgressMethod)} className={inputCls}>
              <option value="HOURS">Por horas facturables</option>
              <option value="MILESTONES">Por hitos cumplidos</option>
              <option value="MANUAL">Manual (dirección)</option>
            </select>
          </Field>
        </div>
        {method === 'MANUAL' && (
          <Field label="Avance manual (%)">
            <input type="number" min={0} max={100} step="0.1" value={manual} onChange={(e) => setManual(e.target.value)} className={inputCls} />
          </Field>
        )}
        <Field label="Notas">
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} />
        </Field>
        <ErrorLine error={save.error} />
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className={`flex-1 ${btnGhost}`}>Cancelar</button>
          <button type="submit" disabled={save.isPending} className={`flex-1 ${btnPrimary}`}>{save.isPending ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Adenda: sube o baja el honorario. Positivo sube, negativo baja. */
export function AmendmentModal({ view, onClose }: { view: FeeView; onClose: () => void }) {
  const [date, setDate] = useState(todayIso());
  const [reason, setReason] = useState('');
  const [delta, setDelta] = useState('');
  const amend = useAmendFee();
  const current = view.fee?.totalAmount ?? 0;
  const next = delta !== '' && Number.isFinite(Number(delta)) ? current + Number(delta) : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await amend.mutateAsync({ engagementId: view.engagement.id, data: { date, reason: reason.trim(), amountDelta: Number(delta) } });
      onClose();
    } catch { /* se muestra abajo */ }
  };

  return (
    <Modal title="Registrar adenda" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-xs text-gray-500">Honorario actual: <strong>{formatMoney(current)}</strong>{next !== null && <> → quedaría en <strong>{formatMoney(next)}</strong></>}</p>
        <Field label="Fecha de la adenda *"><input required type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} className={inputCls} /></Field>
        <Field label="Cambio al honorario (USD) *" hint="Positivo sube el honorario; negativo lo baja (no puede quedar por debajo de lo ya facturado y programado).">
          <input required type="number" step="0.01" value={delta} onChange={(e) => setDelta(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Motivo *"><textarea required rows={3} minLength={5} value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} /></Field>
        <ErrorLine error={amend.error} />
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className={`flex-1 ${btnGhost}`}>Cancelar</button>
          <button type="submit" disabled={amend.isPending || delta === '' || Number(delta) === 0} className={`flex-1 ${btnPrimary}`}>{amend.isPending ? 'Guardando…' : 'Registrar adenda'}</button>
        </div>
      </form>
    </Modal>
  );
}
