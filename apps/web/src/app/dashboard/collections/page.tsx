'use client';

import { useState } from 'react';
import { Receipt, Search, Wallet } from 'lucide-react';
import { useUser } from '@/hooks/useUser';
import {
  useInvoices, usePayments, useReverseWithholding, useWithholdings,
  INVOICE_STATUS_CONFIG, InvoiceStatus, PAYMENT_METHOD_LABEL, TAX_TYPE_LABEL, TaxType,
} from '@/hooks/useCollections';
import { useClients } from '@/hooks/usePortfolio';
import { formatDateUTC, formatMoney } from '@/lib/utils';
import { InvoiceDetailModal, InvoiceFormModal } from '@/components/collections/InvoiceModals';
import { PaymentDetailModal, PaymentFormModal } from '@/components/collections/PaymentModals';
import { ErrorLine, Pill, ReasonModal, btnPrimary, btnSmall, btnSmallDanger, inputCls } from '@/components/collections/ui';
import { AgingPanel } from '@/components/collections/AgingPanel';
import { ManagementPanel } from '@/components/collections/ManagementPanel';
import { ReadyToInvoicePanel } from '@/components/collections/ReadyToInvoicePanel';
import { useAlerts } from '@/hooks/useCollectionsReports';

type Tab = 'invoices' | 'payments' | 'withholdings' | 'aging' | 'management' | 'hours';
const DIRECTION = ['CAE', 'ADMIN', 'SUPER_ADMIN'];

/** Cobranza: facturas por cobrar, cobros recibidos y retenciones sufridas, con alta, detalle, edición y anulación. */
export default function CollectionsPage() {
  const { hasRole } = useUser();
  const canDirect = hasRole(DIRECTION);
  const [tab, setTab] = useState<Tab>('invoices');
  const [clientId, setClientId] = useState('');
  const clients = useClients();

  // Facturas
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<InvoiceStatus | ''>('');
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [invPage, setInvPage] = useState(1);
  const invoices = useInvoices({ clientId: clientId || undefined, search: search || undefined, status: status || undefined, open: onlyOpen && !status, overdue: onlyOverdue, page: invPage, pageSize: 50 }, tab === 'invoices');

  // Cobros
  const [onlyUnapplied, setOnlyUnapplied] = useState(false);
  const [payPage, setPayPage] = useState(1);
  const payments = usePayments({ clientId: clientId || undefined, unapplied: onlyUnapplied, page: payPage, pageSize: 50 }, tab === 'payments');

  // Retenciones
  const [taxType, setTaxType] = useState<TaxType | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [whPage, setWhPage] = useState(1);
  const withholdings = useWithholdings({ clientId: clientId || undefined, taxType: taxType || undefined, from: from || undefined, to: to || undefined, page: whPage, pageSize: 100 }, tab === 'withholdings');
  const reverse = useReverseWithholding();
  const [reversing, setReversing] = useState<string | null>(null);

  // Ventanas
  const [newInvoice, setNewInvoice] = useState(false);
  const [newPayment, setNewPayment] = useState<{ clientId?: string; invoiceId?: string } | null>(null);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);

  const alerts = useAlerts();
  const alertCount = alerts.data ? alerts.data.counts.overduePromises + alerts.data.counts.followUps + alerts.data.counts.unattendedInvoices : 0;
  const tabBtn = (t: Tab, label: string, badge = 0) => (
    <button type="button" onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
      {label}{badge > 0 && <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">{badge}</span>}
    </button>
  );

  const invTotals = invoices.data?.items.reduce((s, i) => s + (i.status === 'VOID' ? 0 : i.balance), 0) ?? 0;

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-800 flex items-center gap-2"><Wallet className="w-5 h-5" /> Cobranza</h1>
          <p className="text-sm text-gray-500">Facturas ya emitidas, cobros recibidos y retenciones. Aquí solo se registra; la facturación se emite fuera de AuditMind.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setNewInvoice(true)} className={btnPrimary}><Receipt className="inline w-4 h-4 mr-1" />Registrar factura</button>
          <button type="button" onClick={() => setNewPayment({})} className={btnPrimary}><Wallet className="inline w-4 h-4 mr-1" />Registrar cobro</button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-64">
          <label className="text-xs font-medium text-gray-600">Cliente</label>
          <select value={clientId} onChange={(e) => { setClientId(e.target.value); setInvPage(1); setPayPage(1); }} className={inputCls}>
            <option value="">Todos los clientes</option>
            {(clients.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.legalName}</option>)}
          </select>
        </div>
      </div>

      <div className="flex border-b border-gray-200">
        {tabBtn('invoices', 'Por cobrar')}{tabBtn('aging', 'Antigüedad')}{tabBtn('payments', 'Cobros')}{tabBtn('withholdings', 'Retenciones')}{tabBtn('management', 'Gestión de cobro', alertCount)}{tabBtn('hours', 'Horas por facturar')}
      </div>

      {tab === 'invoices' && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
              <input value={search} onChange={(e) => { setSearch(e.target.value); setInvPage(1); }} placeholder="Número de control o descripción" className={`${inputCls} pl-8`} />
            </div>
            <select value={status} onChange={(e) => { setStatus(e.target.value as InvoiceStatus | ''); setInvPage(1); }} className={`${inputCls} w-40`}>
              <option value="">Todos los estados</option>
              {(Object.keys(INVOICE_STATUS_CONFIG) as InvoiceStatus[]).map((k) => <option key={k} value={k}>{INVOICE_STATUS_CONFIG[k].label}</option>)}
            </select>
            <label className="flex items-center gap-1 text-xs text-gray-600"><input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} disabled={!!status} /> Solo con saldo</label>
            <label className="flex items-center gap-1 text-xs text-gray-600"><input type="checkbox" checked={onlyOverdue} onChange={(e) => { setOnlyOverdue(e.target.checked); setInvPage(1); }} /> Solo vencidas</label>
            <span className="ml-auto text-xs text-gray-500">Saldo en esta página: <strong>{formatMoney(invTotals)}</strong></span>
          </div>
          <ErrorLine error={invoices.error} />
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-gray-400"><th className="px-3 py-2">N.º de control</th><th>Cliente</th><th>Encargo</th><th>Fecha</th><th>Vence</th><th className="text-right">Total</th><th className="text-right">Saldo</th><th className="pr-3">Estado</th></tr></thead>
              <tbody>
                {invoices.isLoading && <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">Cargando…</td></tr>}
                {invoices.data?.items.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">No hay facturas con esos filtros.</td></tr>}
                {invoices.data?.items.map((inv) => {
                  const cfg = INVOICE_STATUS_CONFIG[inv.status];
                  return (
                    <tr key={inv.id} onClick={() => setInvoiceId(inv.id)} className="border-t border-gray-100 cursor-pointer hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-700">{inv.invoiceNumber}</td>
                      <td>{inv.client?.legalName}</td>
                      <td className="text-xs text-gray-500">{inv.engagement?.kind === 'CONSULTING' ? (inv.engagement.title ?? 'Consultoría') : 'Auditoría'} {inv.engagement?.fiscalYear}</td>
                      <td>{formatDateUTC(inv.invoiceDate)}</td>
                      <td className={inv.overdue ? 'text-red-600 font-medium' : ''}>{formatDateUTC(inv.dueDate)}{inv.overdue && <span className="text-xs"> ({inv.overdueDays} d)</span>}</td>
                      <td className="text-right">{formatMoney(inv.totalAmount)}</td>
                      <td className="text-right font-semibold">{formatMoney(inv.balance)}</td>
                      <td className="pr-3"><Pill label={cfg.label} bg={cfg.bg} color={cfg.color} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pager page={invPage} total={invoices.data?.total ?? 0} pageSize={50} onPage={setInvPage} />
        </section>
      )}

      {tab === 'aging' && <AgingPanel clientId={clientId} onOpenInvoice={setInvoiceId} />}
      {tab === 'management' && <ManagementPanel clientId={clientId} onOpenInvoice={setInvoiceId} />}
      {tab === 'hours' && <ReadyToInvoicePanel />}

      {tab === 'payments' && (
        <section className="space-y-3">
          <label className="flex items-center gap-1 text-xs text-gray-600"><input type="checkbox" checked={onlyUnapplied} onChange={(e) => { setOnlyUnapplied(e.target.checked); setPayPage(1); }} /> Solo con saldo a favor sin aplicar</label>
          <ErrorLine error={payments.error} />
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-gray-400"><th className="px-3 py-2">Fecha</th><th>Cliente</th><th>Forma</th><th>Referencia</th><th className="text-right">Recibido</th><th className="text-right">Aplicado</th><th className="text-right">A favor</th><th className="pr-3">Estado</th></tr></thead>
              <tbody>
                {payments.isLoading && <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">Cargando…</td></tr>}
                {payments.data?.items.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">No hay cobros con esos filtros.</td></tr>}
                {payments.data?.items.map((p) => (
                  <tr key={p.id} onClick={() => setPaymentId(p.id)} className={`border-t border-gray-100 cursor-pointer hover:bg-gray-50 ${p.status === 'VOID' ? 'text-gray-400' : ''}`}>
                    <td className="px-3 py-2">{formatDateUTC(p.paymentDate)}</td>
                    <td>{p.client?.legalName}</td>
                    <td>{PAYMENT_METHOD_LABEL[p.method]}</td>
                    <td>{p.reference ?? '—'}</td>
                    <td className="text-right">{formatMoney(p.amount)}</td>
                    <td className="text-right">{formatMoney(p.appliedAmount)}</td>
                    <td className={`text-right ${p.unappliedAmount > 0 && p.status === 'ACTIVE' ? 'font-semibold text-amber-700' : ''}`}>{formatMoney(p.unappliedAmount)}</td>
                    <td className="pr-3"><Pill label={p.status === 'ACTIVE' ? 'Vigente' : 'Anulado'} bg={p.status === 'ACTIVE' ? 'bg-emerald-50' : 'bg-gray-100'} color={p.status === 'ACTIVE' ? 'text-emerald-700' : 'text-gray-500'} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={payPage} total={payments.data?.total ?? 0} pageSize={50} onPage={setPayPage} />
        </section>
      )}

      {tab === 'withholdings' && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <select value={taxType} onChange={(e) => { setTaxType(e.target.value as TaxType | ''); setWhPage(1); }} className={`${inputCls} w-40`}>
              <option value="">Todos los impuestos</option>
              {(Object.keys(TAX_TYPE_LABEL) as TaxType[]).map((k) => <option key={k} value={k}>{TAX_TYPE_LABEL[k]}</option>)}
            </select>
            <div><label className="text-xs text-gray-500">Desde</label><input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setWhPage(1); }} className={inputCls} /></div>
            <div><label className="text-xs text-gray-500">Hasta</label><input type="date" value={to} onChange={(e) => { setTo(e.target.value); setWhPage(1); }} className={inputCls} /></div>
            <span className="ml-auto text-xs text-gray-500">Total retenido en el periodo: <strong>{formatMoney(withholdings.data?.totalAmount ?? 0)}</strong></span>
          </div>
          <ErrorLine error={withholdings.error} />
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-gray-400"><th className="px-3 py-2">Fecha</th><th>Factura</th><th>Impuesto</th><th>Comprobante</th><th className="text-right">Monto</th><th className="pr-3" /></tr></thead>
              <tbody>
                {withholdings.data?.items.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">No hay retenciones en ese periodo.</td></tr>}
                {withholdings.data?.items.map((w) => (
                  <tr key={w.id} className="border-t border-gray-100">
                    <td className="px-3 py-2">{formatDateUTC(w.appliedOn)}</td>
                    <td><button type="button" className="text-blue-600 hover:underline" onClick={() => setInvoiceId(w.invoiceId)}>{w.invoiceNumber ?? w.invoiceId}</button></td>
                    <td>{TAX_TYPE_LABEL[w.taxType]}</td>
                    <td>{w.certificateNumber ?? <span className="text-amber-600 text-xs">Falta el comprobante</span>}</td>
                    <td className="text-right font-medium">{formatMoney(w.amount)}</td>
                    <td className="pr-3 text-right">{canDirect && <button type="button" onClick={() => setReversing(w.id)} className={btnSmallDanger}>Revertir</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={whPage} total={withholdings.data?.total ?? 0} pageSize={100} onPage={setWhPage} />
        </section>
      )}

      {newInvoice && <InvoiceFormModal onClose={() => setNewInvoice(false)} />}
      {newPayment && <PaymentFormModal clientId={newPayment.clientId} invoiceId={newPayment.invoiceId} onClose={() => setNewPayment(null)} />}
      {invoiceId && (
        <InvoiceDetailModal
          invoiceId={invoiceId} canDirect={canDirect} onClose={() => setInvoiceId(null)}
          onRegisterPayment={(c, i) => { setInvoiceId(null); setNewPayment({ clientId: c, invoiceId: i }); }}
        />
      )}
      {paymentId && <PaymentDetailModal paymentId={paymentId} canDirect={canDirect} onClose={() => setPaymentId(null)} />}
      {reversing && (
        <ReasonModal
          title="Revertir retención" confirmLabel="Revertir" pending={reverse.isPending} error={reverse.error}
          description="La retención queda revertida (se conserva en el historial) y el saldo de la factura sube."
          onClose={() => setReversing(null)}
          onConfirm={async (reason) => { try { await reverse.mutateAsync({ id: reversing, reason }); setReversing(null); } catch { /* abajo */ } }}
        />
      )}
    </div>
  );
}

function Pager({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-2 text-xs text-gray-500">
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className={btnSmall}>Anterior</button>
      <span>Página {page} de {pages} · {total} registros</span>
      <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} className={btnSmall}>Siguiente</button>
    </div>
  );
}
