'use client';

import { useState } from 'react';
import { useCreateCollectionNote, useUpdateCollectionNote, CONTACT_METHOD_LABEL, CollectionNoteRow, ContactMethod } from '@/hooks/useCollectionsReports';
import { ErrorLine, Field, Modal, btnGhost, btnPrimary, inputCls, todayIso } from './ui';

/**
 * Anotar (o corregir) un contacto de cobro: qué se habló, la promesa de pago y cuándo volver a contactar.
 * Con `note` edita; sin ella crea, ligado al cliente y, si se indica, a una factura o un encargo.
 */
export function CollectionNoteModal({ clientId, invoiceId, engagementId, note, onClose }: {
  clientId?: string; invoiceId?: string; engagementId?: string; note?: CollectionNoteRow; onClose: () => void;
}) {
  const editing = !!note;
  const [method, setMethod] = useState<ContactMethod>(note?.method ?? 'CALL');
  const [contactedOn, setContactedOn] = useState(note?.contactedOn ?? todayIso());
  const [contactName, setContactName] = useState(note?.contactName ?? '');
  const [text, setText] = useState(note?.note ?? '');
  const [promiseDate, setPromiseDate] = useState(note?.promiseDate ?? '');
  const [promiseAmount, setPromiseAmount] = useState(note?.promiseAmount != null ? String(note.promiseAmount) : '');
  const [followUp, setFollowUp] = useState(note?.nextFollowUpOn ?? '');
  const create = useCreateCollectionNote();
  const update = useUpdateCollectionNote();
  const mutation = editing ? update : create;
  const ready = text.trim().length >= 3 && (promiseAmount.trim() === '' || promiseDate !== '');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing && note) {
        await update.mutateAsync({
          id: note.id,
          data: {
            contactedOn, method, contactName, note: text.trim(), nextFollowUpOn: followUp,
            ...(promiseDate && promiseDate !== note.promiseDate && { promiseDate }),
            ...(promiseAmount.trim() !== '' && Number(promiseAmount) !== note.promiseAmount && { promiseAmount: Number(promiseAmount) }),
          },
        });
      } else if (clientId) {
        await create.mutateAsync({
          clientId, invoiceId, engagementId, contactedOn, method, contactName: contactName.trim() || undefined, note: text.trim(),
          promiseDate: promiseDate || undefined, promiseAmount: promiseAmount.trim() === '' ? undefined : Number(promiseAmount), nextFollowUpOn: followUp || undefined,
        });
      }
      onClose();
    } catch { /* se muestra abajo */ }
  };

  return (
    <Modal title={editing ? 'Corregir nota de gestión' : 'Anotar contacto de cobro'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Medio *">
            <select value={method} onChange={(e) => setMethod(e.target.value as ContactMethod)} className={inputCls}>
              {(Object.keys(CONTACT_METHOD_LABEL) as ContactMethod[]).map((k) => <option key={k} value={k}>{CONTACT_METHOD_LABEL[k]}</option>)}
            </select>
          </Field>
          <Field label="Fecha del contacto *"><input required type="date" max={todayIso()} value={contactedOn} onChange={(e) => setContactedOn(e.target.value)} className={inputCls} /></Field>
        </div>
        <Field label="Persona del cliente con quien se habló"><input value={contactName} onChange={(e) => setContactName(e.target.value)} className={inputCls} /></Field>
        <Field label="Qué se habló *"><textarea required rows={3} value={text} onChange={(e) => setText(e.target.value)} className={inputCls} /></Field>
        <fieldset className="rounded-xl border border-gray-200 p-3 space-y-2">
          <legend className="px-1 text-xs font-medium text-gray-600">Promesa de pago (opcional)</legend>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha prometida"><input type="date" min={contactedOn} value={promiseDate} onChange={(e) => setPromiseDate(e.target.value)} className={inputCls} /></Field>
            <Field label="Monto prometido (USD)"><input type="number" step="0.01" min="0.01" value={promiseAmount} onChange={(e) => setPromiseAmount(e.target.value)} disabled={!promiseDate} className={inputCls} /></Field>
          </div>
        </fieldset>
        <Field label="Volver a contactar el" hint="Aparece en las alertas de ese día. Déjalo vacío si no hace falta."><input type="date" min={contactedOn} value={followUp} onChange={(e) => setFollowUp(e.target.value)} className={inputCls} /></Field>
        <ErrorLine error={mutation.error} />
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className={`flex-1 ${btnGhost}`}>Cancelar</button>
          <button type="submit" disabled={!ready || mutation.isPending || (!editing && !clientId)} className={`flex-1 ${btnPrimary}`}>{mutation.isPending ? 'Guardando…' : editing ? 'Guardar cambios' : 'Anotar contacto'}</button>
        </div>
      </form>
    </Modal>
  );
}
