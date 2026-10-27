'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useEngagements } from '@/hooks/usePortfolio';
import {
  useAddWithholding, useInvoice, useRegisterInvoice, useReverseWithholding, useUpdateInvoice, useVoidInvoice,
  DOCUMENT_TYPE_LABEL, DocumentType, INVOICE_STATUS_CONFIG, InvoiceDetail, PAYMENT_METHOD_LABEL, ScheduleItem, TAX_TYPE_LABEL, TaxType, WithholdingInput,
} from '@/hooks/useCollections';
import { formatDateUTC, formatMoney } from '@/lib/utils';
import { useCollectionNotes, useReverseWriteOff, useVoidCreditNote, CONTACT_METHOD_LABEL, PROMISE_STATUS_CONFIG } from '@/hooks/useCollectionsReports';
import { CreditNoteModal, WriteOffModal } from './AdjustmentModals';
import { CollectionNoteModal } from './CollectionNoteModal';
import {
  ErrorLine, Field, Modal, Pill, ReasonModal, btnDanger, btnGhost, btnPrimary, btnSmall, btnSmallDanger, inputCls, todayIso,
} from './ui';

interface WhRow { taxType: TaxType; amount: string; certificateNumber: string }
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Registrar (o corregir) una factura que ya se emitió como DTE. No se factura en línea: aquí solo se anota. */
export function InvoiceFormModal({ engagementId, scheduleItem, invoice, hours: hoursLive, termDays = 30, onClose }: {
  engagementId?: string; scheduleItem?: ScheduleItem; invoice?: InvoiceDetail; termDays?: number; onClose: () => void;
  /** Factura de horas (Fase 4): las horas cerradas elegidas; el neto es su suma y no se edita. */
  hours?: { ids: string[]; net: number; hoursTotal: number };
}) {
  const editing = !!invoice;
  // Las horas elegidas se congelan al abrir el formulario: si la lista se recarga con el formulario abierto (reconexión, otro gerente que
  // factura), lo que se envía sigue siendo lo que se vio, y el servidor rechaza con un aviso claro lo que ya no esté disponible.
  const [hours] = useState(hoursLive);
  const coreLocked = editing && !invoice.permissions.canEditAll;
  const hoursInvoice = !!hours || (editing && invoice.hours.some((h) => !h.releasedAt));
  const netLocked = coreLocked || hoursInvoice;
  const engagements = useEngagements();
  const [engId, setEngId] = useState(engagementId ?? invoice?.engagementId ?? '');
  const [number, setNumber] = useState(invoice?.invoiceNumber ?? '');
  const [genCode, setGenCode] = useState(invoice?.generationCode ?? '');
  const [docType, setDocType] = useState<DocumentType>(invoice?.documentType ?? '03');
  const [invDate, setInvDate] = useState(invoice?.invoiceDate ?? todayIso());
  const [dueDate, setDueDate] = useState(invoice?.dueDate ?? '');
  const [description, setDescription] = useState(invoice?.description ?? scheduleItem?.label ?? (hours ? `Horas de trabajo (${Math.round(hours.hoursTotal * 100) / 100} h)` : ''));
  const [net, setNet] = useState(invoice ? String(invoice.netAmount) : scheduleItem ? String(scheduleItem.amount) : hours ? String(hours.net) : '');
  const [tax, setTax] = useState(invoice ? String(invoice.taxAmount) : '');
  const [whs, setWhs] = useState<WhRow[]>([]);
  const register = useRegisterInvoice();
  const update = useUpdateInvoice();
  const mutation = editing ? update : register;

  const netN = Number(net) || 0;
  const taxN = Number(tax) || 0;
  const whTotal = whs.reduce((s, w) => s + (Number(w.amount) || 0), 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        await update.mutateAsync({
          id: invoice.id,
          data: {
            ...(coreLocked ? {} : { invoiceNumber: number, generationCode: genCode, documentType: docType, ...(hoursInvoice ? {} : { netAmount: Number(net) }), taxAmount: Number(tax || 0) }),
            invoiceDate: invDate, dueDate: dueDate || undefined, description,
          },
        });
      } else {
        await register.mutateAsync({
          engagementId: engId, scheduleItemId: scheduleItem?.id, invoiceNumber: number, generationCode: genCode || undefined, documentType: docType,
          invoiceDate: invDate, dueDate: dueDate || undefined, description: description || undefined, netAmount: Number(net), taxAmount: Number(tax || 0),
          timeEntryIds: hours?.ids,
          withholdings: whs.filter((w) => w.amount !== '').map<WithholdingInput>((w) => ({ taxType: w.taxType, amount: Number(w.amount), certificateNumber: w.certificateNumber || undefined })),
        });
      }
      onClose();
    } catch { /* abajo */ }
  };

  return (
    <Modal title={editing ? `Editar factura ${invoice.invoiceNumber}` : hours ? 'Facturar horas de trabajo' : scheduleItem ? `Registrar factura — ${scheduleItem.label}` : 'Registrar factura'} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-3">
        {!editing && !engagementId && (
          <Field label="Encargo *">
            <select required value={engId} onChange={(e) => setEngId(e.target.value)} className={inputCls}>
              <option value="">Elige el encargo…</option>
              {(engagements.data ?? []).filter((x) => x.status !== 'CANCELLED').map((x) => (
                <option key={x.id} value={x.id}>
                  {x.client?.legalName} — {x.kind === 'CONSULTING' ? (x.title ?? 'Consultoría') : 'Auditoría'} {x.fiscalYear}
                </option>
              ))}
            </select>
          </Field>
        )}
        {hoursInvoice && <p className="text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-2">{hours ? `Factura de ${hours.ids.length} registro(s) de horas (${Math.round(hours.hoursTotal * 100) / 100} h): el neto es la suma exacta de las horas elegidas. Si el DTE que emitiste trae otro neto, cambia la selección de horas.` : 'Factura de horas: su neto es la suma de las horas facturadas y no se edita. Para cambiarlo, anúlala y vuelve a facturar las horas.'}</p>}
        {coreLocked && <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">La factura ya tiene cobros, retenciones, notas de crédito o castigos: solo se editan las fechas y la descripción. Para corregir un movimiento, revíertelo desde el detalle de la factura.</p>}
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Field label="Número de control del DTE *"><input required value={number} onChange={(e) => setNumber(e.target.value)} disabled={coreLocked} placeholder="DTE-03-M001P001-000000000000015" className={inputCls} /></Field>
          </div>
          <Field label="Tipo de documento *">
            <select value={docType} onChange={(e) => setDocType(e.target.value as DocumentType)} disabled={coreLocked} className={inputCls}>
              {(Object.keys(DOCUMENT_TYPE_LABEL) as DocumentType[]).map((k) => <option key={k} value={k}>{DOCUMENT_TYPE_LABEL[k]}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Código de generación (UUID)" hint="Opcional pero recomendable: evita registrar dos veces el mismo DTE."><input value={genCode} onChange={(e) => setGenCode(e.target.value)} disabled={coreLocked} className={inputCls} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha de la factura *"><input required type="date" value={invDate} max={todayIso()} onChange={(e) => setInvDate(e.target.value)} className={inputCls} /></Field>
          <Field label="Vencimiento" hint={`Si lo dejas vacío: fecha de la factura + ${termDays} días.`}><input type="date" value={dueDate} min={invDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} /></Field>
        </div>
        <Field label="Descripción"><input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Monto neto (USD) *"><input required type="number" step="0.01" min="0.01" value={net} onChange={(e) => setNet(e.target.value)} disabled={netLocked} className={inputCls} /></Field>
          <Field label="IVA (USD)">
            <div className="flex gap-1">
              <input type="number" step="0.01" min="0" value={tax} onChange={(e) => setTax(e.target.value)} disabled={coreLocked} className={inputCls} />
              <button type="button" disabled={coreLocked || netN <= 0} onClick={() => setTax(String(round2(netN * 0.13)))} className={btnSmall} title="Calcular el 13 % del neto">13 %</button>
            </div>
          </Field>
          <Field label="Total"><div className="px-3 py-2 text-sm font-semibold text-gray-800 bg-gray-50 rounded-lg">{formatMoney(netN + taxN)}</div></Field>
        </div>

        {!editing && (
          <div className="space-y-2 rounded-xl border border-gray-100 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-gray-600">Retenciones que trae el DTE (opcional)</p>
              <button type="button" onClick={() => setWhs([...whs, { taxType: 'IVA', amount: '', certificateNumber: '' }])} className={`${btnSmall} inline-flex items-center gap-1`}><Plus className="w-3 h-3" /> Agregar</button>
            </div>
            {whs.map((w, i) => (
              <div key={i} className="grid grid-cols-[7rem_8rem_1fr_2rem] gap-2 items-center">
                <select value={w.taxType} onChange={(e) => setWhs(whs.map((x, j) => (j === i ? { ...x, taxType: e.target.value as TaxType } : x)))} className={inputCls}>
                  {(Object.keys(TAX_TYPE_LABEL) as TaxType[]).map((k) => <option key={k} value={k}>{TAX_TYPE_LABEL[k]}</option>)}
                </select>
                <input type="number" step="0.01" min="0.01" placeholder="Monto" value={w.amount} onChange={(e) => setWhs(whs.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} className={inputCls} />
                <input placeholder="N.º de comprobante (opcional)" value={w.certificateNumber} onChange={(e) => setWhs(whs.map((x, j) => (j === i ? { ...x, certificateNumber: e.target.value } : x)))} className={inputCls} />
                <button type="button" aria-label="Quitar retención" onClick={() => setWhs(whs.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            {whTotal > 0 && <p className="text-xs text-gray-500">Saldo a cobrar al registrar: {formatMoney(Math.max(0, netN + taxN - whTotal))}</p>}
          </div>
        )}

        <ErrorLine error={mutation.error} />
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className={`flex-1 ${btnGhost}`}>Cancelar</button>
          <button type="submit" disabled={mutation.isPending || (!editing && !engId) || (!!hours && hours.ids.length === 0)} className={`flex-1 ${btnPrimary}`}>{mutation.isPending ? 'Guardando…' : editing ? 'Guardar cambios' : hours ? 'Registrar factura de horas' : 'Registrar factura'}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Anotar una retención en una factura (por ejemplo, el comprobante llegó después). */
export function WithholdingModal({ invoiceId, balance, onClose }: { invoiceId: string; balance: number; onClose: () => void }) {
  const [taxType, setTaxType] = useState<TaxType>('IVA');
  const [amount, setAmount] = useState('');
  const [appliedOn, setAppliedOn] = useState(todayIso());
  const [cert, setCert] = useState('');
  const add = useAddWithholding();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await add.mutateAsync({ invoiceId, data: { taxType, amount: Number(amount), appliedOn, certificateNumber: cert || undefined } }); onClose(); } catch { /* abajo */ }
  };
  return (
    <Modal title="Anotar retención" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-xs text-gray-500">Saldo de la factura: <strong>{formatMoney(balance)}</strong>. La retención baja el saldo sin ser dinero recibido.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Impuesto *">
            <select value={taxType} onChange={(e) => setTaxType(e.target.value as TaxType)} className={inputCls}>
              {(Object.keys(TAX_TYPE_LABEL) as TaxType[]).map((k) => <option key={k} value={k}>{TAX_TYPE_LABEL[k]}</option>)}
            </select>
          </Field>
          <Field label="Monto (USD) *"><input required type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha *"><input required type="date" max={todayIso()} value={appliedOn} onChange={(e) => setAppliedOn(e.target.value)} className={inputCls} /></Field>
          <Field label="N.º de comprobante"><input value={cert} onChange={(e) => setCert(e.target.value)} className={inputCls} /></Field>
        </div>
        <ErrorLine error={add.error} />
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className={`flex-1 ${btnGhost}`}>Cancelar</button>
          <button type="submit" disabled={add.isPending} className={`flex-1 ${btnPrimary}`}>{add.isPending ? 'Guardando…' : 'Anotar retención'}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Detalle de la factura con todos sus movimientos y las acciones que corresponden al rol. */
export function InvoiceDetailModal({ invoiceId, canDirect, termDays, onRegisterPayment, onClose }: {
  invoiceId: string; canDirect: boolean; termDays?: number; onRegisterPayment: (clientId: string, invoiceId: string) => void; onClose: () => void;
}) {
  const { data: inv, isLoading, error } = useInvoice(invoiceId);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [reversing, setReversing] = useState<string | null>(null);
  const [crediting, setCrediting] = useState(false);
  const [writingOff, setWritingOff] = useState(false);
  const [voidingNote, setVoidingNote] = useState<string | null>(null);
  const [reversingOff, setReversingOff] = useState<string | null>(null);
  const [noting, setNoting] = useState(false);
  const voidInvoice = useVoidInvoice();
  const reverse = useReverseWithholding();
  const voidNote = useVoidCreditNote();
  const reverseOff = useReverseWriteOff();
  const notesQ = useCollectionNotes({ invoiceId, pageSize: 20 });

  if (crediting && inv) return <CreditNoteModal invoiceId={inv.id} invoiceNumber={inv.invoiceNumber} balance={inv.balance} netAmount={inv.netAmount} invoiceDate={inv.invoiceDate} onClose={() => setCrediting(false)} />;
  if (writingOff && inv) return <WriteOffModal invoiceId={inv.id} invoiceNumber={inv.invoiceNumber} balance={inv.balance} invoiceDate={inv.invoiceDate} onClose={() => setWritingOff(false)} />;
  if (noting && inv) return <CollectionNoteModal clientId={inv.clientId} invoiceId={inv.id} engagementId={inv.engagementId} onClose={() => setNoting(false)} />;
  if (voidingNote && inv) {
    return (
      <ReasonModal
        title="Anular nota de crédito" confirmLabel="Anular nota" pending={voidNote.isPending} error={voidNote.error}
        description="La nota queda anulada (se conserva en el historial): el saldo de la factura sube y lo facturado del encargo también. Se rechaza si dejaría lo facturado más lo programado por encima del honorario."
        onClose={() => setVoidingNote(null)}
        onConfirm={async (reason) => { try { await voidNote.mutateAsync({ id: voidingNote, reason }); setVoidingNote(null); } catch { /* abajo */ } }}
      />
    );
  }
  if (reversingOff && inv) {
    return (
      <ReasonModal
        title="Reversar castigo" confirmLabel="Reversar castigo" pending={reverseOff.isPending} error={reverseOff.error}
        description="El castigo queda reversado (se conserva en el historial) y el saldo de la factura vuelve a ser cobrable y a verse en la antigüedad."
        onClose={() => setReversingOff(null)}
        onConfirm={async (reason) => { try { await reverseOff.mutateAsync({ id: reversingOff, reason }); setReversingOff(null); } catch { /* abajo */ } }}
      />
    );
  }

  if (editing && inv) return <InvoiceFormModal invoice={inv} termDays={termDays} onClose={() => setEditing(false)} />;
  if (adding && inv) return <WithholdingModal invoiceId={inv.id} balance={inv.balance} onClose={() => setAdding(false)} />;
  if (voiding && inv) {
    return (
      <ReasonModal
        title={`Anular factura ${inv.invoiceNumber}`} confirmLabel="Anular factura" pending={voidInvoice.isPending} error={voidInvoice.error}
        description="La factura queda anulada (no se borra): libera su número y su cuota del calendario. Solo se puede anular si no tiene cobros, notas de crédito ni castigos."
        onClose={() => setVoiding(false)}
        onConfirm={async (reason) => { try { await voidInvoice.mutateAsync({ id: inv.id, reason }); setVoiding(false); } catch { /* abajo */ } }}
      />
    );
  }
  if (reversing && inv) {
    return (
      <ReasonModal
        title="Revertir retención" confirmLabel="Revertir" pending={reverse.isPending} error={reverse.error}
        description="La retención queda revertida (se conserva en el historial) y el saldo de la factura sube. Si la anotaste mal, vuelve a anotarla correcta."
        onClose={() => setReversing(null)}
        onConfirm={async (reason) => { try { await reverse.mutateAsync({ id: reversing, reason }); setReversing(null); } catch { /* abajo */ } }}
      />
    );
  }

  const cfg = inv ? INVOICE_STATUS_CONFIG[inv.status] : null;
  const open = inv && (inv.status === 'OPEN' || inv.status === 'PARTIAL');
  return (
    <Modal title={inv ? `Factura ${inv.invoiceNumber}` : 'Factura'} onClose={onClose} wide>
      {isLoading && <p className="text-sm text-gray-400">Cargando…</p>}
      <ErrorLine error={error} />
      {inv && cfg && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Pill label={cfg.label} bg={cfg.bg} color={cfg.color} />
            {inv.overdue && <Pill label={`Vencida hace ${inv.overdueDays} d`} bg="bg-red-50" color="text-red-700" />}
            <span className="text-sm text-gray-600">{inv.client?.legalName} · {inv.engagement?.kind === 'CONSULTING' ? (inv.engagement.title ?? 'Consultoría') : 'Auditoría'} {inv.engagement?.fiscalYear}</span>
          </div>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            {[
              ['Fecha', formatDateUTC(inv.invoiceDate)], ['Vence', formatDateUTC(inv.dueDate)],
              ['Tipo', DOCUMENT_TYPE_LABEL[inv.documentType]], ['Cuota', inv.scheduleItem ? `#${inv.scheduleItem.sequence} ${inv.scheduleItem.label}` : 'Libre'],
              ['Neto', formatMoney(inv.netAmount)], ['IVA', formatMoney(inv.taxAmount)], ['Total', formatMoney(inv.totalAmount)], ['Saldo', formatMoney(inv.balance)],
              ['Cobrado', formatMoney(inv.paidAmount)], ['Retenido', formatMoney(inv.withheldAmount)],
              ['Acreditado', formatMoney(inv.creditedAmount)], ['Castigado', formatMoney(inv.writtenOffAmount)],
            ].map(([k, v]) => <div key={k}><dt className="text-[11px] text-gray-400">{k}</dt><dd className="font-medium text-gray-800">{v}</dd></div>)}
          </dl>
          {inv.description && <p className="text-sm text-gray-600">{inv.description}</p>}
          {inv.status === 'VOID' && <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">Anulada: {inv.voidReason}</p>}

          {inv.hours.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-600 mb-1">Horas facturadas</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="text-left text-gray-400"><th className="py-1">Fecha</th><th>Persona</th><th className="text-right">Horas</th><th className="text-right">Tarifa</th><th className="text-right">Monto</th></tr></thead>
                  <tbody>
                    {inv.hours.map((h) => (
                      <tr key={h.id} className={`border-t border-gray-100 ${h.releasedAt ? 'text-gray-400 line-through' : ''}`}>
                        <td className="py-1">{h.workDate ? formatDateUTC(h.workDate) : '—'}</td>
                        <td>{h.userName}{h.description ? <span className="block text-[11px] text-gray-400">{h.description}</span> : null}</td>
                        <td className="text-right">{h.hours} h</td>
                        <td className="text-right">{formatMoney(h.rate)}</td>
                        <td className="text-right font-medium">{formatMoney(h.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div>
            <h4 className="text-xs font-semibold text-gray-600 mb-1">Cobros aplicados</h4>
            {inv.applications.length === 0 ? <p className="text-xs text-gray-400">Sin cobros.</p> : (
              <table className="w-full text-xs"><tbody>
                {inv.applications.map((a) => (
                  <tr key={a.id} className={`border-t border-gray-100 ${a.reversedAt ? 'text-gray-400 line-through' : ''}`}>
                    <td className="py-1">{formatDateUTC(a.appliedOn)}</td>
                    <td>{a.payment ? `${PAYMENT_METHOD_LABEL[a.payment.method]}${a.payment.reference ? ` · ${a.payment.reference}` : ''}` : '—'}</td>
                    <td className="text-right font-medium">{formatMoney(a.amount)}</td>
                    <td className="text-right text-gray-400 no-underline">{a.reversedAt ? 'quitada' : ''}</td>
                  </tr>
                ))}
              </tbody></table>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-xs font-semibold text-gray-600">Retenciones</h4>
              {open && <button type="button" onClick={() => setAdding(true)} className={btnSmall}>Anotar retención</button>}
            </div>
            {inv.withholdings.length === 0 ? <p className="text-xs text-gray-400">Sin retenciones.</p> : (
              <table className="w-full text-xs"><tbody>
                {inv.withholdings.map((w) => (
                  <tr key={w.id} className={`border-t border-gray-100 ${w.reversedAt ? 'text-gray-400 line-through' : ''}`}>
                    <td className="py-1">{formatDateUTC(w.appliedOn)}</td>
                    <td>{TAX_TYPE_LABEL[w.taxType]}{w.certificateNumber ? ` · ${w.certificateNumber}` : ''}{w.paymentId ? ' · en el pago' : ' · en la factura'}</td>
                    <td className="text-right font-medium">{formatMoney(w.amount)}</td>
                    <td className="text-right">{!w.reversedAt && inv.permissions.canReverseWithholding && <button type="button" onClick={() => setReversing(w.id)} className={btnSmallDanger}>Revertir</button>}</td>
                  </tr>
                ))}
              </tbody></table>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-xs font-semibold text-gray-600">Notas de crédito</h4>
              {inv.permissions.canCredit && <button type="button" onClick={() => setCrediting(true)} className={btnSmall}>Nota de crédito</button>}
            </div>
            {inv.creditNotes.length === 0 ? <p className="text-xs text-gray-400">Sin notas de crédito.</p> : (
              <table className="w-full text-xs"><tbody>
                {inv.creditNotes.map((n) => (
                  <tr key={n.id} className={`border-t border-gray-100 ${n.status === 'VOID' ? 'text-gray-400 line-through' : ''}`}>
                    <td className="py-1">{formatDateUTC(n.issueDate)}</td>
                    <td>{n.creditNoteNumber}<span className="block text-[11px] text-gray-400 no-underline">{n.reason}</span></td>
                    <td className="text-right font-medium">{formatMoney(n.totalAmount)}</td>
                    <td className="text-right">{n.status === 'ACTIVE' && inv.permissions.canVoidCreditNote && <button type="button" onClick={() => setVoidingNote(n.id)} className={btnSmallDanger}>Anular</button>}{n.status === 'VOID' && 'anulada'}</td>
                  </tr>
                ))}
              </tbody></table>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-xs font-semibold text-gray-600">Castigos</h4>
              {inv.permissions.canWriteOff && <button type="button" onClick={() => setWritingOff(true)} className={btnSmallDanger}>Castigar saldo</button>}
            </div>
            {inv.writeOffs.length === 0 ? <p className="text-xs text-gray-400">Sin castigos.</p> : (
              <table className="w-full text-xs"><tbody>
                {inv.writeOffs.map((w) => (
                  <tr key={w.id} className={`border-t border-gray-100 ${w.status === 'REVERSED' ? 'text-gray-400 line-through' : ''}`}>
                    <td className="py-1">{formatDateUTC(w.writtenOffOn)}</td>
                    <td>{w.reason}</td>
                    <td className="text-right font-medium">{formatMoney(w.amount)}</td>
                    <td className="text-right">{w.status === 'ACTIVE' && inv.permissions.canReverseWriteOff && <button type="button" onClick={() => setReversingOff(w.id)} className={btnSmallDanger}>Reversar</button>}{w.status === 'REVERSED' && 'reversado'}</td>
                  </tr>
                ))}
              </tbody></table>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-xs font-semibold text-gray-600">Gestión de cobro</h4>
              <button type="button" onClick={() => setNoting(true)} className={btnSmall}>Anotar contacto</button>
            </div>
            {(notesQ.data?.items.length ?? 0) === 0 ? <p className="text-xs text-gray-400">Sin contactos anotados sobre esta factura.</p> : (
              <ul className="space-y-1 text-xs text-gray-600">
                {notesQ.data!.items.map((n) => (
                  <li key={n.id} className="border-t border-gray-100 pt-1">
                    <strong>{formatDateUTC(n.contactedOn)}</strong> · {CONTACT_METHOD_LABEL[n.method]}{n.contactName ? ` con ${n.contactName}` : ''}: {n.note}
                    {n.promiseDate && n.promiseStatus && <span className={`ml-1 ${PROMISE_STATUS_CONFIG[n.promiseStatus].color}`}>[promesa {PROMISE_STATUS_CONFIG[n.promiseStatus].label.toLowerCase()} para el {formatDateUTC(n.promiseDate)}]</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <details className="text-xs text-gray-500">
            <summary className="cursor-pointer">Historial ({inv.log.length})</summary>
            <ul className="mt-1 space-y-0.5">{inv.log.map((l) => <li key={l.id}>{new Date(l.createdAt).toLocaleString('es-SV')} — {l.action}{l.note ? `: ${l.note}` : ''}</li>)}</ul>
          </details>

          <div className="flex flex-wrap gap-2 pt-1 border-t border-gray-100">
            {open && <button type="button" onClick={() => onRegisterPayment(inv.clientId, inv.id)} className={btnPrimary}>Registrar cobro</button>}
            {inv.permissions.canEditBasics && <button type="button" onClick={() => setEditing(true)} className={btnGhost}>Editar</button>}
            {canDirect && inv.permissions.canVoid && <button type="button" onClick={() => setVoiding(true)} className={btnDanger}>Anular factura</button>}
            <button type="button" onClick={onClose} className={`ml-auto ${btnGhost}`}>Cerrar</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
