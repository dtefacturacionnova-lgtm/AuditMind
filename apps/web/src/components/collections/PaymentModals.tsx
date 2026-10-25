'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useClients } from '@/hooks/usePortfolio';
import {
  useApplyPayment, useInvoices, usePayment, useRegisterPayment, useRemoveApplication, useUpdatePayment, useVoidPayment,
  InvoiceRow, PAYMENT_METHOD_LABEL, PaymentMethod, TAX_TYPE_LABEL, RegisterPaymentData, WithholdingInput,
} from '@/hooks/useCollections';
import { formatDateUTC, formatMoney } from '@/lib/utils';
import { ErrorLine, Field, Modal, Pill, ReasonModal, btnDanger, btnGhost, btnPrimary, btnSmall, btnSmallDanger, inputCls, todayIso } from './ui';

const cents = (v: string | number) => Math.round((Number(v) || 0) * 100);
const newRequestId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `req-${Date.now()}-${Math.random().toString(36).slice(2)}`);

/** Reparto de la que vence primero (igual que el servidor): por vencimiento y, a igual fecha, por número en orden natural. */
function allocateOldestFirst(amountCents: number, invoices: InvoiceRow[]): Record<string, string> {
  let remaining = Math.max(0, amountCents);
  const out: Record<string, string> = {};
  const sorted = [...invoices].sort((a, b) => (a.dueDate === b.dueDate ? a.invoiceNumber.localeCompare(b.invoiceNumber, 'es', { numeric: true }) : a.dueDate < b.dueDate ? -1 : 1));
  for (const inv of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, cents(inv.balance));
    if (take <= 0) continue;
    out[inv.id] = (take / 100).toFixed(2);
    remaining -= take;
  }
  return out;
}

/** Registrar un cobro: cuánto entró, a qué facturas se aplica y qué retenciones practicó el cliente en ese pago. */
export function PaymentFormModal({ clientId: presetClient, invoiceId: presetInvoice, onClose }: { clientId?: string; invoiceId?: string; onClose: () => void }) {
  const clients = useClients(); // todos: un cliente que dejó de estar activo puede seguir pagando lo que debe
  const [clientId, setClientId] = useState(presetClient ?? '');
  const [date, setDate] = useState(todayIso());
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('TRANSFER');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [apply, setApply] = useState<Record<string, string>>({});
  const [iva, setIva] = useState<Record<string, string>>({});
  const [renta, setRenta] = useState<Record<string, string>>({});
  const requestId = useRef(newRequestId());
  const register = useRegisterPayment();
  const invoicesQ = useInvoices({ clientId, open: true, pageSize: 200 }, !!clientId);
  const invoices = useMemo(() => invoicesQ.data?.items ?? [], [invoicesQ.data]);

  // Al llegar desde una factura se precarga con su saldo (una sola vez).
  const preset = useRef(false);
  useEffect(() => {
    if (!presetInvoice || preset.current) return;
    const inv = invoices.find((i) => i.id === presetInvoice);
    if (inv) { preset.current = true; setAmount(inv.balance.toFixed(2)); setApply({ [inv.id]: inv.balance.toFixed(2) }); }
  }, [presetInvoice, invoices]);

  const amountC = cents(amount);
  const appliedC = Object.values(apply).reduce((s, v) => s + cents(v), 0);
  const unappliedC = amountC - appliedC;
  const rowError = (inv: InvoiceRow) => cents(apply[inv.id] ?? 0) + cents(iva[inv.id] ?? 0) + cents(renta[inv.id] ?? 0) > cents(inv.balance);
  const anyRowError = invoices.some(rowError);
  const canSubmit = !!clientId && amountC > 0 && unappliedC >= 0 && !anyRowError && !register.isPending;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const applications = invoices.filter((i) => cents(apply[i.id] ?? 0) > 0).map((i) => ({ invoiceId: i.id, amount: Number(apply[i.id]) }));
    const withholdings: (WithholdingInput & { invoiceId: string })[] = [];
    for (const i of invoices) {
      if (cents(iva[i.id] ?? 0) > 0) withholdings.push({ invoiceId: i.id, taxType: 'IVA', amount: Number(iva[i.id]) });
      if (cents(renta[i.id] ?? 0) > 0) withholdings.push({ invoiceId: i.id, taxType: 'RENTA', amount: Number(renta[i.id]) });
    }
    const data: RegisterPaymentData = {
      clientId, paymentDate: date, amount: Number(amount), method, reference: reference || undefined, notes: notes || undefined,
      clientRequestId: requestId.current, ...(applications.length && { applications }), ...(withholdings.length && { withholdings }),
    };
    try { await register.mutateAsync(data); onClose(); } catch { /* abajo */ }
  };

  return (
    <Modal title="Registrar cobro" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cliente *">
            <select required value={clientId} disabled={!!presetClient} onChange={(e) => { setClientId(e.target.value); setApply({}); setIva({}); setRenta({}); }} className={inputCls}>
              <option value="">Elige el cliente…</option>
              {(clients.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.legalName}</option>)}
            </select>
          </Field>
          <Field label="Fecha del cobro *"><input required type="date" max={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} /></Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Dinero recibido (USD) *" hint="Lo que entró al banco, sin contar retenciones."><input required type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} /></Field>
          <Field label="Forma de pago *">
            <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className={inputCls}>
              {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((k) => <option key={k} value={k}>{PAYMENT_METHOD_LABEL[k]}</option>)}
            </select>
          </Field>
          <Field label="Referencia"><input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="N.º de transferencia o cheque" className={inputCls} /></Field>
        </div>

        {clientId && (
          <div className="rounded-xl border border-gray-100">
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
              <p className="text-xs font-medium text-gray-600">Facturas pendientes del cliente</p>
              <div className="flex gap-2">
                <button type="button" disabled={amountC <= 0} onClick={() => setApply(allocateOldestFirst(amountC, invoices))} className={btnSmall}>Repartir (la más antigua primero)</button>
                <button type="button" onClick={() => { setApply({}); setIva({}); setRenta({}); }} className={btnSmall}>Limpiar</button>
              </div>
            </div>
            {invoicesQ.isLoading ? <p className="p-3 text-xs text-gray-400">Cargando…</p> : invoices.length === 0 ? <p className="p-3 text-xs text-gray-400">Este cliente no tiene facturas con saldo. El cobro quedará como saldo a favor.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="text-left text-gray-400"><th className="px-3 py-1">Factura</th><th>Vence</th><th className="text-right">Saldo</th><th className="w-28">Aplicar</th><th className="w-24">Ret. IVA</th><th className="w-24 pr-3">Ret. Renta</th></tr></thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={inv.id} className={`border-t border-gray-100 ${rowError(inv) ? 'bg-red-50' : ''}`}>
                        <td className="px-3 py-1 font-medium text-gray-700">{inv.invoiceNumber}{inv.overdue && <span className="ml-1 text-red-600">({inv.overdueDays} d)</span>}</td>
                        <td>{formatDateUTC(inv.dueDate)}</td>
                        <td className="text-right">{formatMoney(inv.balance)}</td>
                        <td><input type="number" step="0.01" min="0" value={apply[inv.id] ?? ''} onChange={(e) => setApply({ ...apply, [inv.id]: e.target.value })} className={`${inputCls} !py-1`} /></td>
                        <td><input type="number" step="0.01" min="0" value={iva[inv.id] ?? ''} onChange={(e) => setIva({ ...iva, [inv.id]: e.target.value })} className={`${inputCls} !py-1`} /></td>
                        <td className="pr-3"><input type="number" step="0.01" min="0" value={renta[inv.id] ?? ''} onChange={(e) => setRenta({ ...renta, [inv.id]: e.target.value })} className={`${inputCls} !py-1`} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex flex-wrap gap-x-6 gap-y-1 px-3 py-2 border-t border-gray-100 text-xs text-gray-600">
              <span>Recibido: <strong>{formatMoney(amountC / 100)}</strong></span>
              <span>Aplicado: <strong>{formatMoney(appliedC / 100)}</strong></span>
              <span className={unappliedC < 0 ? 'text-red-600' : ''}>Saldo a favor: <strong>{formatMoney(unappliedC / 100)}</strong></span>
              {anyRowError && <span className="text-red-600">Una factura recibe más que su saldo.</span>}
            </div>
          </div>
        )}
        <Field label="Notas"><input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} /></Field>
        <ErrorLine error={register.error} />
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className={`flex-1 ${btnGhost}`}>Cancelar</button>
          <button type="submit" disabled={!canSubmit} className={`flex-1 ${btnPrimary}`}>{register.isPending ? 'Registrando…' : 'Registrar cobro'}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Detalle del cobro: aplicaciones, retenciones, aplicar saldo a favor, editar y anular. */
export function PaymentDetailModal({ paymentId, canDirect, onClose }: { paymentId: string; canDirect: boolean; onClose: () => void }) {
  const { data: p, isLoading, error } = usePayment(paymentId);
  const update = useUpdatePayment();
  const apply = useApplyPayment();
  const remove = useRemoveApplication();
  const voidPayment = useVoidPayment();
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [voiding, setVoiding] = useState(false);
  const [target, setTarget] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [eDate, setEDate] = useState('');
  const [eMethod, setEMethod] = useState<PaymentMethod>('TRANSFER');
  const [eRef, setERef] = useState('');
  const [eNotes, setENotes] = useState('');
  const [eAmount, setEAmount] = useState('');
  const open = useInvoices({ clientId: p?.clientId, open: true, pageSize: 200 }, !!p && p.status === 'ACTIVE' && p.unappliedAmount > 0);

  if (removing && p) {
    return (
      <ReasonModal
        title="Quitar aplicación" confirmLabel="Quitar aplicación" pending={remove.isPending} error={remove.error}
        description="El dinero vuelve a ser saldo a favor del cobro y la factura recupera su saldo. La aplicación queda en el historial."
        onClose={() => setRemoving(null)}
        onConfirm={async (reason) => { try { await remove.mutateAsync({ paymentId: p.id, applicationId: removing, reason }); setRemoving(null); } catch { /* abajo */ } }}
      />
    );
  }
  if (voiding && p) {
    return (
      <ReasonModal
        title="Anular cobro" confirmLabel="Anular cobro" pending={voidPayment.isPending} error={voidPayment.error}
        description="El cobro queda anulado (no se borra): se revierten sus aplicaciones y las retenciones que se anotaron con él, y las facturas recuperan su saldo."
        onClose={() => setVoiding(false)}
        onConfirm={async (reason) => { try { await voidPayment.mutateAsync({ id: p.id, reason }); setVoiding(false); } catch { /* abajo */ } }}
      />
    );
  }

  const startEdit = () => {
    if (!p) return;
    setEDate(p.paymentDate); setEMethod(p.method); setERef(p.reference ?? ''); setENotes(p.notes ?? ''); setEAmount(String(p.amount)); setEditing(true);
  };
  const hasMoves = !!p && (p.applications.some((a) => !a.reversedAt) || p.withholdings.some((w) => !w.reversedAt));

  return (
    <Modal title="Cobro" onClose={onClose} wide>
      {isLoading && <p className="text-sm text-gray-400">Cargando…</p>}
      <ErrorLine error={error} />
      {p && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Pill label={p.status === 'ACTIVE' ? 'Vigente' : 'Anulado'} bg={p.status === 'ACTIVE' ? 'bg-emerald-50' : 'bg-gray-100'} color={p.status === 'ACTIVE' ? 'text-emerald-700' : 'text-gray-500'} />
            <span className="text-sm text-gray-600">{p.client?.legalName}</span>
          </div>

          {editing ? (
            <form className="space-y-3 rounded-xl border border-gray-100 p-3" onSubmit={async (e) => {
              e.preventDefault();
              try { await update.mutateAsync({ id: p.id, data: { paymentDate: eDate, method: eMethod, reference: eRef, notes: eNotes, ...(hasMoves ? {} : { amount: Number(eAmount) }) } }); setEditing(false); } catch { /* abajo */ }
            }}>
              <div className="grid grid-cols-4 gap-3">
                <Field label="Fecha"><input type="date" max={todayIso()} value={eDate} onChange={(e) => setEDate(e.target.value)} className={inputCls} /></Field>
                <Field label="Forma"><select value={eMethod} onChange={(e) => setEMethod(e.target.value as PaymentMethod)} className={inputCls}>{(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((k) => <option key={k} value={k}>{PAYMENT_METHOD_LABEL[k]}</option>)}</select></Field>
                <Field label="Referencia"><input value={eRef} onChange={(e) => setERef(e.target.value)} className={inputCls} /></Field>
                <Field label="Monto" hint={hasMoves ? 'Tiene aplicaciones: no se cambia.' : undefined}><input type="number" step="0.01" min="0.01" disabled={hasMoves} value={eAmount} onChange={(e) => setEAmount(e.target.value)} className={inputCls} /></Field>
              </div>
              <Field label="Notas"><input value={eNotes} onChange={(e) => setENotes(e.target.value)} className={inputCls} /></Field>
              <ErrorLine error={update.error} />
              <div className="flex gap-2"><button type="button" className={btnGhost} onClick={() => setEditing(false)}>Cancelar</button><button type="submit" disabled={update.isPending} className={btnPrimary}>{update.isPending ? 'Guardando…' : 'Guardar'}</button></div>
            </form>
          ) : (
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              {[
                ['Fecha', formatDateUTC(p.paymentDate)], ['Forma', PAYMENT_METHOD_LABEL[p.method]], ['Referencia', p.reference ?? '—'], ['Recibido', formatMoney(p.amount)],
                ['Aplicado', formatMoney(p.appliedAmount)], ['Saldo a favor', formatMoney(p.unappliedAmount)], ['Notas', p.notes ?? '—'],
              ].map(([k, v]) => <div key={k}><dt className="text-[11px] text-gray-400">{k}</dt><dd className="font-medium text-gray-800">{v}</dd></div>)}
            </dl>
          )}
          {p.status === 'VOID' && <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">Anulado: {p.voidReason}</p>}

          <div>
            <h4 className="text-xs font-semibold text-gray-600 mb-1">Aplicaciones</h4>
            {p.applications.length === 0 ? <p className="text-xs text-gray-400">Sin aplicaciones.</p> : (
              <table className="w-full text-xs"><tbody>
                {p.applications.map((a) => (
                  <tr key={a.id} className={`border-t border-gray-100 ${a.reversedAt ? 'text-gray-400 line-through' : ''}`}>
                    <td className="py-1">{formatDateUTC(a.appliedOn)}</td>
                    <td>Factura {a.invoice?.invoiceNumber ?? '—'}</td>
                    <td className="text-right font-medium">{formatMoney(a.amount)}</td>
                    <td className="text-right">{!a.reversedAt && p.permissions.canUnapply && canDirect && <button type="button" onClick={() => setRemoving(a.id)} className={btnSmallDanger}>Quitar</button>}</td>
                  </tr>
                ))}
              </tbody></table>
            )}
          </div>

          {p.withholdings.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-600 mb-1">Retenciones practicadas en este pago</h4>
              <table className="w-full text-xs"><tbody>
                {p.withholdings.map((w) => (
                  <tr key={w.id} className={`border-t border-gray-100 ${w.reversedAt ? 'text-gray-400 line-through' : ''}`}>
                    <td className="py-1">Factura {w.invoice?.invoiceNumber ?? '—'}</td><td>{TAX_TYPE_LABEL[w.taxType]}{w.certificateNumber ? ` · ${w.certificateNumber}` : ''}</td><td className="text-right font-medium">{formatMoney(w.amount)}</td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          )}

          {p.status === 'ACTIVE' && p.unappliedAmount > 0 && (
            <form className="rounded-xl border border-blue-100 bg-blue-50/40 p-3 space-y-2" onSubmit={async (e) => {
              e.preventDefault();
              try { await apply.mutateAsync({ id: p.id, applications: [{ invoiceId: target, amount: Number(targetAmount) }] }); setTarget(''); setTargetAmount(''); } catch { /* abajo */ }
            }}>
              <p className="text-xs font-medium text-gray-700">Aplicar saldo a favor ({formatMoney(p.unappliedAmount)})</p>
              <div className="grid grid-cols-[1fr_8rem_auto] gap-2">
                <select required value={target} onChange={(e) => { setTarget(e.target.value); const inv = open.data?.items.find((i) => i.id === e.target.value); if (inv) setTargetAmount(Math.min(inv.balance, p.unappliedAmount).toFixed(2)); }} className={inputCls}>
                  <option value="">Elige la factura…</option>
                  {(open.data?.items ?? []).map((i) => <option key={i.id} value={i.id}>{i.invoiceNumber} — saldo {formatMoney(i.balance)}</option>)}
                </select>
                <input required type="number" step="0.01" min="0.01" value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} className={inputCls} />
                <button type="submit" disabled={apply.isPending || !target} className={btnPrimary}>Aplicar</button>
              </div>
              <ErrorLine error={apply.error} />
            </form>
          )}

          <details className="text-xs text-gray-500">
            <summary className="cursor-pointer">Historial ({p.log.length})</summary>
            <ul className="mt-1 space-y-0.5">{p.log.map((l) => <li key={l.id}>{new Date(l.createdAt).toLocaleString('es-SV')} — {l.action}{l.note ? `: ${l.note}` : ''}</li>)}</ul>
          </details>

          <div className="flex flex-wrap gap-2 pt-1 border-t border-gray-100">
            {p.status === 'ACTIVE' && !editing && <button type="button" onClick={startEdit} className={btnGhost}>Editar</button>}
            {canDirect && p.permissions.canVoid && <button type="button" onClick={() => setVoiding(true)} className={btnDanger}>Anular cobro</button>}
            <button type="button" onClick={onClose} className={`ml-auto ${btnGhost}`}>Cerrar</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
