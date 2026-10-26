'use client';

import { useState } from 'react';
import { CalendarPlus, FilePlus2, Pencil, Plus, Receipt, Trash2, Wallet, XCircle } from 'lucide-react';
import { useUser } from '@/hooks/useUser';
import {
  useCancelScheduleItem, useDeleteFee, useDeleteScheduleItem, useEngagementFee, useInvoices,
  INVOICE_STATUS_CONFIG, SCHEDULE_STATE_CONFIG, ScheduleItem,
} from '@/hooks/useCollections';
import { formatDateUTC, formatMoney } from '@/lib/utils';
import { AmendmentModal, FeeModal } from './FeeModals';
import { GenerateScheduleModal, ScheduleItemModal } from './ScheduleModals';
import { InvoiceDetailModal, InvoiceFormModal } from './InvoiceModals';
import { PaymentFormModal } from './PaymentModals';
import { ConfirmModal, ErrorLine, Pill, btnSmall, btnSmallDanger, todayIso } from './ui';
import { useSetItemCompletion } from '@/hooks/useCollectionsReports';

const DIRECTION = ['CAE', 'ADMIN', 'SUPER_ADMIN'];

/**
 * Panel «Cobros» de un encargo: honorario y adendas, calendario de cobros, facturas registradas y su cobro.
 * Crear, ver, editar y anular/borrar viven aquí; la dirección (CAE o superior) define el honorario y el calendario.
 */
export function EngagementBillingPanel({ engagementId }: { engagementId: string }) {
  const { hasRole } = useUser();
  const canDirect = hasRole(DIRECTION);
  const { data: view, isLoading, error } = useEngagementFee(engagementId);
  const invoicesQ = useInvoices({ engagementId, pageSize: 200 });
  const [feeOpen, setFeeOpen] = useState(false);
  const [amendOpen, setAmendOpen] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [itemModal, setItemModal] = useState<{ item?: ScheduleItem } | null>(null);
  const [invoiceModal, setInvoiceModal] = useState<{ item?: ScheduleItem } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [payFor, setPayFor] = useState<{ clientId: string; invoiceId?: string } | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'fee' | 'cancel' | 'delete'; item?: ScheduleItem } | null>(null);
  const deleteFee = useDeleteFee();
  const cancelItem = useCancelScheduleItem();
  const deleteItem = useDeleteScheduleItem();
  const completion = useSetItemCompletion();

  if (isLoading) return <p className="text-sm text-gray-400">Cargando cobros…</p>;
  if (error) return <ErrorLine error={error} />;
  if (!view) return null;
  const { fee, summary, schedule, amendments } = view;
  const fixed = fee?.feeType === 'FIXED';

  return (
    <div className="space-y-5">
      {/* Resumen */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {[
          ['Honorario neto', fee ? (fixed ? formatMoney(summary.feeTotal) : 'Por tiempo') : '—'],
          ['Facturado (neto)', formatMoney(summary.invoicedNet)],
          ['Sin programar', summary.unscheduled === null ? '—' : formatMoney(Math.max(0, summary.unscheduled))],
          ['Cobrado', formatMoney(summary.collected)],
          ['Retenido', formatMoney(summary.withheld)],
          ['Acreditado (notas)', formatMoney(summary.credited)],
          ['Castigado', formatMoney(summary.writtenOff)],
          ['Por cobrar', formatMoney(summary.receivable)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl bg-white border border-gray-200 px-3 py-2">
            <p className="text-[11px] text-gray-400">{k}</p>
            <p className="text-sm font-semibold text-gray-800">{v}</p>
          </div>
        ))}
      </div>

      {/* Avance y devengado */}
      {view.accrual && (
        <section className="rounded-xl bg-white border border-gray-200 p-4 space-y-2">
          <h4 className="text-sm font-semibold text-gray-700">Avance y devengado <span className="font-normal text-gray-400">(al {formatDateUTC(view.accrual.asOf)})</span></h4>
          {view.accrual.progressPct === null && view.accrual.feeType === 'FIXED' ? (
            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
              {view.accrual.missing === 'NO_BUDGET'
                ? 'Sin presupuesto de horas completo: el avance no se puede calcular. Asigna las horas presupuestadas de todo el equipo en la pestaña Equipo del encargo (quien registró horas facturables debe tener presupuesto).'
                : view.accrual.missing === 'NO_MANUAL_PROGRESS'
                  ? 'El método de avance es manual y la dirección aún no fijó el porcentaje.'
                  : 'El avance todavía no se puede calcular.'}
            </p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              {view.accrual.feeType === 'FIXED' && <div><p className="text-[11px] text-gray-400">Avance</p><p className="font-semibold text-gray-800">{view.accrual.progressPct}%{view.accrual.basis === 'COMPLETION' ? ' · informe final firmado' : ''}</p></div>}
              <div><p className="text-[11px] text-gray-400">{view.accrual.feeType === 'FIXED' ? 'Devengado' : 'Ingreso (lo facturado)'}</p><p className="font-semibold text-gray-800">{formatMoney(view.accrual.accrued)}</p></div>
              {view.accrual.toInvoice !== null && <div><p className="text-[11px] text-gray-400">Por facturar</p><p className="font-semibold text-gray-800">{formatMoney(view.accrual.toInvoice)}</p></div>}
              {view.accrual.method === 'HOURS' && view.accrual.feeType === 'FIXED' && <div><p className="text-[11px] text-gray-400">Horas facturables / presupuesto</p><p className="font-semibold text-gray-800">{view.accrual.billableHours} / {view.accrual.budgetHours ?? '—'}</p></div>}
            </div>
          )}
        </section>
      )}

      {/* Honorario */}
      <section className="rounded-xl bg-white border border-gray-200 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Wallet className="w-4 h-4" /> Honorario</h4>
          {canDirect && (
            <div className="flex gap-2">
              <button type="button" onClick={() => setFeeOpen(true)} className={`${btnSmall} inline-flex items-center gap-1`}><Pencil className="w-3 h-3" /> {fee ? 'Editar' : 'Definir honorario'}</button>
              {fee && fixed && <button type="button" onClick={() => setAmendOpen(true)} className={`${btnSmall} inline-flex items-center gap-1`}><Plus className="w-3 h-3" /> Adenda</button>}
              {fee && <button type="button" onClick={() => setConfirm({ kind: 'fee' })} className={`${btnSmallDanger} inline-flex items-center gap-1`}><Trash2 className="w-3 h-3" /> Borrar</button>}
            </div>
          )}
        </div>
        {!fee ? (
          <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
            {canDirect ? 'Define el honorario del encargo para programar y registrar sus cobros.' : 'La dirección aún no ha definido el honorario de este encargo.'}
          </p>
        ) : (
          <div className="text-sm text-gray-600 space-y-1">
            <p>
              {fixed ? <>Monto fijo <strong>{formatMoney(fee.totalAmount)}</strong>{fee.originalAmount !== fee.totalAmount && <> (original {formatMoney(fee.originalAmount)})</>}</> : 'Honorario por tiempo: se factura libremente.'}
              {' · '}crédito de {fee.paymentTermDays} días{fee.source === 'PROPOSAL' && ' · tomado de la propuesta'}
            </p>
            {fee.notes && <p className="text-xs text-gray-400">{fee.notes}</p>}
            {amendments.length > 0 && (
              <ul className="text-xs text-gray-500 list-disc pl-5">
                {amendments.map((a) => <li key={a.id}>{formatDateUTC(a.date)} — {a.amountDelta > 0 ? '+' : ''}{formatMoney(a.amountDelta)}: {a.reason}</li>)}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* Calendario */}
      {fee && fixed && (
        <section className="rounded-xl bg-white border border-gray-200 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><CalendarPlus className="w-4 h-4" /> Calendario de cobros</h4>
            {canDirect && (
              <div className="flex gap-2">
                <button type="button" onClick={() => setGenOpen(true)} className={btnSmall}>Generar calendario</button>
                <button type="button" onClick={() => setItemModal({})} className={`${btnSmall} inline-flex items-center gap-1`}><Plus className="w-3 h-3" /> Cuota</button>
              </div>
            )}
          </div>
          {schedule.length === 0 ? <p className="text-xs text-gray-400">Sin cuotas programadas.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-left text-gray-400"><th className="py-1">#</th><th>Concepto</th><th>Fecha</th><th className="text-right">Monto</th><th>Estado</th><th>Factura</th><th /></tr></thead>
                <tbody>
                  {schedule.map((it) => {
                    const cfg = SCHEDULE_STATE_CONFIG[it.state];
                    const planned = it.status === 'PLANNED';
                    return (
                      <tr key={it.id} className={`border-t border-gray-100 ${it.status === 'CANCELLED' ? 'text-gray-400' : ''}`}>
                        <td className="py-1.5">{it.sequence}</td>
                        <td className="font-medium text-gray-700">{it.label}</td>
                        <td>{formatDateUTC(it.dueDate)}</td>
                        <td className="text-right">{formatMoney(it.amount)}</td>
                        <td><Pill label={cfg.label} bg={cfg.bg} color={cfg.color} /></td>
                        <td>{it.invoice ? <button type="button" onClick={() => setDetailId(it.invoice!.id)} className="text-blue-600 hover:underline">{it.invoice.invoiceNumber}</button> : '—'}</td>
                        <td className="text-right whitespace-nowrap space-x-1">
                          {fee.progressMethod === 'MILESTONES' && it.status !== 'CANCELLED' && (
                            it.completedAt
                              ? <button type="button" disabled={completion.isPending} onClick={() => completion.mutate({ itemId: it.id, completedOn: null })} className={btnSmall} title={`Cumplido el ${formatDateUTC(it.completedAt)}`}>Cumplido ✓</button>
                              : <button type="button" disabled={completion.isPending} onClick={() => completion.mutate({ itemId: it.id, completedOn: todayIso() })} className={btnSmall}>Marcar cumplido</button>
                          )}
                          {planned && <button type="button" onClick={() => setInvoiceModal({ item: it })} className={`${btnSmall} inline-flex items-center gap-1`}><FilePlus2 className="w-3 h-3" /> Facturar</button>}
                          {planned && canDirect && <button type="button" onClick={() => setItemModal({ item: it })} className={btnSmall} aria-label="Editar cuota"><Pencil className="w-3 h-3" /></button>}
                          {planned && canDirect && <button type="button" onClick={() => setConfirm({ kind: 'cancel', item: it })} className={btnSmallDanger} aria-label="Cancelar cuota"><XCircle className="w-3 h-3" /></button>}
                          {it.status !== 'INVOICED' && canDirect && <button type="button" onClick={() => setConfirm({ kind: 'delete', item: it })} className={btnSmallDanger} aria-label="Borrar cuota"><Trash2 className="w-3 h-3" /></button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <ErrorLine error={completion.error} />
        </section>
      )}

      {/* Facturas */}
      {fee && (
        <section className="rounded-xl bg-white border border-gray-200 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Receipt className="w-4 h-4" /> Facturas registradas</h4>
            <div className="flex gap-2">
              <button type="button" onClick={() => setInvoiceModal({})} className={`${btnSmall} inline-flex items-center gap-1`}><Plus className="w-3 h-3" /> Registrar factura</button>
              <button type="button" onClick={() => setPayFor({ clientId: view.engagement.clientId })} className={`${btnSmall} inline-flex items-center gap-1`}><Plus className="w-3 h-3" /> Registrar cobro</button>
            </div>
          </div>
          {(invoicesQ.data?.items.length ?? 0) === 0 ? <p className="text-xs text-gray-400">Aún no hay facturas registradas.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-left text-gray-400"><th className="py-1">N.º de control</th><th>Fecha</th><th>Vence</th><th className="text-right">Total</th><th className="text-right">Saldo</th><th>Estado</th></tr></thead>
                <tbody>
                  {invoicesQ.data!.items.map((inv) => {
                    const cfg = INVOICE_STATUS_CONFIG[inv.status];
                    return (
                      <tr key={inv.id} onClick={() => setDetailId(inv.id)} className="border-t border-gray-100 cursor-pointer hover:bg-gray-50">
                        <td className="py-1.5 font-medium text-gray-700">{inv.invoiceNumber}</td>
                        <td>{formatDateUTC(inv.invoiceDate)}</td>
                        <td className={inv.overdue ? 'text-red-600 font-medium' : ''}>{formatDateUTC(inv.dueDate)}</td>
                        <td className="text-right">{formatMoney(inv.totalAmount)}</td>
                        <td className="text-right font-medium">{formatMoney(inv.balance)}</td>
                        <td><Pill label={cfg.label} bg={cfg.bg} color={cfg.color} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {feeOpen && <FeeModal view={view} onClose={() => setFeeOpen(false)} />}
      {amendOpen && <AmendmentModal view={view} onClose={() => setAmendOpen(false)} />}
      {genOpen && <GenerateScheduleModal view={view} onClose={() => setGenOpen(false)} />}
      {itemModal && <ScheduleItemModal engagementId={engagementId} item={itemModal.item} onClose={() => setItemModal(null)} />}
      {invoiceModal && <InvoiceFormModal engagementId={engagementId} scheduleItem={invoiceModal.item} termDays={fee?.paymentTermDays} onClose={() => setInvoiceModal(null)} />}
      {detailId && (
        <InvoiceDetailModal
          invoiceId={detailId} canDirect={canDirect} termDays={fee?.paymentTermDays} onClose={() => setDetailId(null)}
          onRegisterPayment={(clientId, invoiceId) => { setDetailId(null); setPayFor({ clientId, invoiceId }); }}
        />
      )}
      {payFor && <PaymentFormModal clientId={payFor.clientId} invoiceId={payFor.invoiceId} onClose={() => setPayFor(null)} />}

      {confirm?.kind === 'fee' && (
        <ConfirmModal
          title="Borrar honorario" confirmLabel="Borrar honorario" pending={deleteFee.isPending} error={deleteFee.error}
          description="Solo se puede borrar si no tiene adendas, cuotas ni facturas. Si ya tiene movimientos, ajústalo con una adenda."
          onClose={() => setConfirm(null)}
          onConfirm={async () => { try { await deleteFee.mutateAsync(engagementId); setConfirm(null); } catch { /* abajo */ } }}
        />
      )}
      {confirm?.kind === 'cancel' && confirm.item && (
        <ConfirmModal
          title={`Cancelar la cuota «${confirm.item.label}»`} confirmLabel="Cancelar cuota" pending={cancelItem.isPending} error={cancelItem.error}
          description="La cuota deja de contar en el calendario y su monto vuelve a quedar sin programar. Se conserva en el historial."
          onClose={() => setConfirm(null)}
          onConfirm={async () => { try { await cancelItem.mutateAsync(confirm.item!.id); setConfirm(null); } catch { /* abajo */ } }}
        />
      )}
      {confirm?.kind === 'delete' && confirm.item && (
        <ConfirmModal
          title={`Borrar la cuota «${confirm.item.label}»`} confirmLabel="Borrar cuota" pending={deleteItem.isPending} error={deleteItem.error}
          description="Solo se borra una cuota que nunca tuvo factura (ni anulada); si tuvo, cancélala en su lugar."
          onClose={() => setConfirm(null)}
          onConfirm={async () => { try { await deleteItem.mutateAsync(confirm.item!.id); setConfirm(null); } catch { /* abajo */ } }}
        />
      )}
    </div>
  );
}
