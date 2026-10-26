'use client';

import { useState } from 'react';
import { formatMoney } from '@/lib/utils';
import { useRegisterCreditNote, useRegisterWriteOff } from '@/hooks/useCollectionsReports';
import { ErrorLine, Field, Modal, btnGhost, btnPrimary, inputCls, todayIso } from './ui';

/** Nota de crédito (DTE 05) sobre una factura con saldo: solo la dirección. */
export function CreditNoteModal({ invoiceId, invoiceNumber, balance, netAmount, invoiceDate, onClose }: {
  invoiceId: string; invoiceNumber: string; balance: number; netAmount: number; invoiceDate: string; onClose: () => void;
}) {
  const [number, setNumber] = useState('');
  const [gen, setGen] = useState('');
  const [issueDate, setIssueDate] = useState(todayIso());
  const [net, setNet] = useState('');
  const [tax, setTax] = useState('');
  const [reason, setReason] = useState('');
  const register = useRegisterCreditNote();
  const total = (Number(net) || 0) + (Number(tax) || 0);
  const ready = number.trim().length >= 3 && Number(net) > 0 && reason.trim().length >= 10;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await register.mutateAsync({
        invoiceId,
        data: {
          creditNoteNumber: number.trim(), generationCode: gen.trim() || undefined, issueDate, netAmount: Number(net),
          taxAmount: tax.trim() === '' ? undefined : Number(tax), reason: reason.trim(),
        },
      });
      onClose();
    } catch { /* se muestra abajo */ }
  };

  return (
    <Modal title={`Nota de crédito sobre ${invoiceNumber}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-xs text-gray-500">
          Saldo de la factura: <strong>{formatMoney(balance)}</strong> · neto de la factura: {formatMoney(netAmount)}. La nota baja el saldo y lo facturado del encargo (libera espacio del honorario).
          Si el cliente ya pagó, quita primero la aplicación del cobro: queda como saldo a favor.
        </p>
        <Field label="N.º de control de la nota (DTE 05) *"><input required value={number} onChange={(e) => setNumber(e.target.value)} placeholder="DTE-05-M001P001-000000000000012" className={inputCls} /></Field>
        <Field label="Código de generación (UUID)"><input value={gen} onChange={(e) => setGen(e.target.value)} className={inputCls} /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Fecha *"><input required type="date" min={invoiceDate} max={todayIso()} value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className={inputCls} /></Field>
          <Field label="Neto (USD) *"><input required type="number" step="0.01" min="0.01" value={net} onChange={(e) => setNet(e.target.value)} className={inputCls} /></Field>
          <Field label="IVA (USD)"><input type="number" step="0.01" min="0" value={tax} onChange={(e) => setTax(e.target.value)} className={inputCls} /></Field>
        </div>
        <p className={`text-xs ${total > balance ? 'text-red-600' : 'text-gray-500'}`}>Total de la nota: <strong>{formatMoney(total)}</strong>{total > balance && ' — supera el saldo de la factura'}</p>
        <Field label="Motivo * (mínimo 10 caracteres)"><textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} /></Field>
        <ErrorLine error={register.error} />
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className={`flex-1 ${btnGhost}`}>Cancelar</button>
          <button type="submit" disabled={!ready || register.isPending} className={`flex-1 ${btnPrimary}`}>{register.isPending ? 'Guardando…' : 'Registrar nota de crédito'}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Castigo (total o parcial) de un saldo incobrable: solo la dirección. */
export function WriteOffModal({ invoiceId, invoiceNumber, balance, invoiceDate, onClose }: {
  invoiceId: string; invoiceNumber: string; balance: number; invoiceDate: string; onClose: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayIso());
  const [reason, setReason] = useState('');
  const register = useRegisterWriteOff();
  const ready = Number(amount) > 0 && Number(amount) <= balance && reason.trim().length >= 10;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await register.mutateAsync({ invoiceId, data: { amount: Number(amount), writtenOffOn: date, reason: reason.trim() } });
      onClose();
    } catch { /* se muestra abajo */ }
  };

  return (
    <Modal title={`Castigar saldo de ${invoiceNumber}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-xs text-gray-500">
          Saldo de la factura: <strong>{formatMoney(balance)}</strong>. El castigo baja el saldo y lo saca de la antigüedad; no toca lo cobrado y se puede reversar.
          Puede ser parcial: el resto del saldo sigue por cobrar.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Monto a castigar (USD) *"><input required type="number" step="0.01" min="0.01" max={balance} value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} /></Field>
          <Field label="Fecha *"><input required type="date" min={invoiceDate} max={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} /></Field>
        </div>
        <button type="button" onClick={() => setAmount(String(balance))} className="text-xs text-blue-600 hover:underline">Castigar todo el saldo ({formatMoney(balance)})</button>
        <Field label="Motivo * (mínimo 10 caracteres)"><textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Se agotaron las gestiones de cobro: el cliente cerró operaciones." className={inputCls} /></Field>
        <ErrorLine error={register.error} />
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className={`flex-1 ${btnGhost}`}>Cancelar</button>
          <button type="submit" disabled={!ready || register.isPending} className={`flex-1 ${btnPrimary}`}>{register.isPending ? 'Guardando…' : 'Registrar castigo'}</button>
        </div>
      </form>
    </Modal>
  );
}
