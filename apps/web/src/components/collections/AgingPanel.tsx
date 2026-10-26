'use client';

import { Fragment, useState } from 'react';
import { FileText, Printer } from 'lucide-react';
import { AGING_BUCKETS, AgingBucketKey, Statement, useAging, useStatement } from '@/hooks/useCollectionsReports';
import { formatDateUTC, formatMoney } from '@/lib/utils';
import { ErrorLine, Field, Modal, btnGhost, btnPrimary, btnSmall, inputCls, todayIso } from './ui';

const KIND_LABEL: Record<string, string> = {
  INVOICE: 'Factura', INVOICE_VOIDED: 'Factura anulada', APPLICATION: 'Cobro', APPLICATION_REVERSED: 'Cobro: aplicación quitada',
  WITHHOLDING: 'Retención', WITHHOLDING_REVERSED: 'Retención revertida', CREDIT_NOTE: 'Nota de crédito', CREDIT_NOTE_VOIDED: 'Nota de crédito anulada',
  WRITE_OFF: 'Castigo', WRITE_OFF_REVERSED: 'Castigo revertido',
};

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** Estado de cuenta listo para imprimir o guardar como PDF desde el navegador. */
function printStatement(st: Statement) {
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) return;
  const rows = st.lines.map((l) => `<tr><td>${esc(formatDateUTC(l.date))}</td><td>${esc(KIND_LABEL[l.kind] ?? l.kind)}</td><td>${esc(l.reference)}</td><td>${esc(l.description)}</td><td class="n">${l.debit ? esc(formatMoney(l.debit)) : ''}</td><td class="n">${l.credit ? esc(formatMoney(l.credit)) : ''}</td><td class="n">${esc(formatMoney(l.balance))}</td></tr>`).join('');
  const open = st.openInvoices.map((i) => `<tr><td>${esc(i.invoiceNumber)}</td><td>${esc(formatDateUTC(i.invoiceDate))}</td><td>${esc(formatDateUTC(i.dueDate))}</td><td class="n">${i.overdueDays} d</td><td class="n">${esc(formatMoney(i.balance))}</td></tr>`).join('');
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Estado de cuenta — ${esc(st.client.legalName)}</title>
<style>body{font:13px/1.4 system-ui,Segoe UI,Arial,sans-serif;color:#1f2937;margin:32px}h1{font-size:18px;margin:0}h2{font-size:14px;margin:22px 0 6px}table{width:100%;border-collapse:collapse}
th,td{padding:5px 6px;border-bottom:1px solid #e5e7eb;text-align:left}th{font-size:11px;color:#6b7280;text-transform:uppercase}.n{text-align:right;font-variant-numeric:tabular-nums}
.meta{color:#6b7280;margin:2px 0 14px}.tot{font-weight:600}@media print{body{margin:12mm}}</style></head><body>
<h1>Estado de cuenta</h1><p class="meta">${esc(st.client.legalName)}${st.client.taxId ? ` · NIT ${esc(st.client.taxId)}` : ''}<br>Al ${esc(formatDateUTC(st.asOf))}${st.from ? ` · desde ${esc(formatDateUTC(st.from))}` : ''}</p>
<table><thead><tr><th>Fecha</th><th>Movimiento</th><th>Documento</th><th>Detalle</th><th class="n">Cargo</th><th class="n">Abono</th><th class="n">Saldo</th></tr></thead><tbody>
${st.from ? `<tr><td colspan="6">Saldo anterior</td><td class="n">${esc(formatMoney(st.openingBalance))}</td></tr>` : ''}${rows}
<tr class="tot"><td colspan="6">Saldo al ${esc(formatDateUTC(st.asOf))}</td><td class="n">${esc(formatMoney(st.closingBalance))}</td></tr></tbody></table>
${open ? `<h2>Facturas con saldo</h2><table><thead><tr><th>Factura</th><th>Fecha</th><th>Vence</th><th class="n">Vencida</th><th class="n">Saldo</th></tr></thead><tbody>${open}</tbody></table>` : ''}
${st.unappliedCredit > 0 ? `<p class="meta">Saldo a favor del cliente (recibido y no aplicado): <strong>${esc(formatMoney(st.unappliedCredit))}</strong></p>` : ''}
<script>window.onload=function(){window.focus();window.print();}</script></body></html>`);
  w.document.close();
}

/** Estado de cuenta de un cliente a una fecha de corte, con impresión. */
export function StatementModal({ clientId, asOf: initialAsOf, onClose }: { clientId: string; asOf?: string; onClose: () => void }) {
  const [asOf, setAsOf] = useState(initialAsOf ?? todayIso());
  const [from, setFrom] = useState('');
  const { data: st, isLoading, error } = useStatement(clientId, { asOf, from: from || undefined });
  return (
    <Modal title={st ? `Estado de cuenta — ${st.client.legalName}` : 'Estado de cuenta'} onClose={onClose} wide>
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Al (fecha de corte)"><input type="date" max={todayIso()} value={asOf} onChange={(e) => setAsOf(e.target.value || todayIso())} className={inputCls} /></Field>
          <Field label="Desde (opcional)"><input type="date" max={asOf} value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} /></Field>
          {st && <button type="button" onClick={() => printStatement(st)} className={`${btnPrimary} ml-auto inline-flex items-center gap-1`}><Printer className="w-4 h-4" /> Imprimir / PDF</button>}
        </div>
        {isLoading && <p className="text-sm text-gray-400">Cargando…</p>}
        <ErrorLine error={error} />
        {st && (
          <>
            {!st.reconciles && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">El saldo corrido no coincide con la suma de saldos de las facturas: avisa a soporte antes de enviar este estado de cuenta.</p>}
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-xs">
                <thead><tr className="text-left text-gray-400"><th className="px-2 py-1.5">Fecha</th><th>Movimiento</th><th>Documento</th><th>Detalle</th><th className="text-right">Cargo</th><th className="text-right">Abono</th><th className="text-right pr-2">Saldo</th></tr></thead>
                <tbody>
                  {st.from && <tr className="bg-gray-50"><td colSpan={6} className="px-2 py-1.5 text-gray-500">Saldo anterior</td><td className="text-right pr-2 font-medium">{formatMoney(st.openingBalance)}</td></tr>}
                  {st.lines.length === 0 && <tr><td colSpan={7} className="px-2 py-4 text-center text-gray-400">Sin movimientos en el periodo.</td></tr>}
                  {st.lines.map((l, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-2 py-1.5">{formatDateUTC(l.date)}</td><td>{KIND_LABEL[l.kind] ?? l.kind}</td><td>{l.reference}</td><td className="text-gray-500">{l.description}</td>
                      <td className="text-right">{l.debit ? formatMoney(l.debit) : ''}</td><td className="text-right">{l.credit ? formatMoney(l.credit) : ''}</td><td className="text-right pr-2 font-medium">{formatMoney(l.balance)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-gray-200 bg-gray-50 font-semibold"><td colSpan={6} className="px-2 py-1.5">Saldo al {formatDateUTC(st.asOf)}</td><td className="text-right pr-2">{formatMoney(st.closingBalance)}</td></tr>
                </tbody>
              </table>
            </div>
            {st.unappliedCredit > 0 && <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">Saldo a favor del cliente (recibido y sin aplicar): <strong>{formatMoney(st.unappliedCredit)}</strong>. No está descontado del saldo de arriba.</p>}
          </>
        )}
        <div className="flex justify-end"><button type="button" onClick={onClose} className={btnGhost}>Cerrar</button></div>
      </div>
    </Modal>
  );
}

/** Pestaña «Antigüedad»: saldos por cliente en cubetas de días vencidos, a una fecha de corte, con detalle por factura y estado de cuenta. */
export function AgingPanel({ clientId, onOpenInvoice }: { clientId: string; onOpenInvoice: (id: string) => void }) {
  const [asOf, setAsOf] = useState(todayIso());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [statementFor, setStatementFor] = useState<string | null>(null);
  const aging = useAging({ asOf, clientId: clientId || undefined, detail: true });
  const data = aging.data;
  const cell = (n: number, danger = false) => <td className={`text-right ${n === 0 ? 'text-gray-300' : danger ? 'text-red-600 font-medium' : ''}`}>{formatMoney(n)}</td>;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Saldos al (fecha de corte)" hint="Se reconstruye con las fechas de cada movimiento: una reversa posterior no cambia el pasado.">
          <input type="date" max={todayIso()} value={asOf} onChange={(e) => setAsOf(e.target.value || todayIso())} className={inputCls} />
        </Field>
        {data && <p className="ml-auto text-sm text-gray-600">Por cobrar al {formatDateUTC(data.asOf)}: <strong>{formatMoney(data.total)}</strong>{data.unappliedCredit > 0 && <span className="text-amber-700"> · saldo a favor de clientes {formatMoney(data.unappliedCredit)}</span>}</p>}
      </div>
      <ErrorLine error={aging.error} />
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-400">
              <th className="px-3 py-2">Cliente</th>{AGING_BUCKETS.map((b) => <th key={b.key} className="text-right">{b.label}</th>)}<th className="text-right">Total</th><th className="pr-3" />
            </tr>
          </thead>
          <tbody>
            {aging.isLoading && <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">Cargando…</td></tr>}
            {data?.clients.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">No hay saldos por cobrar a esa fecha.</td></tr>}
            {data?.clients.map((c) => (
              <Fragment key={c.clientId}>
                <tr className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => setExpanded(expanded === c.clientId ? null : c.clientId)}>
                  <td className="px-3 py-2 font-medium text-gray-700">{c.client?.legalName ?? c.clientId} <span className="text-xs font-normal text-gray-400">({c.invoiceCount})</span></td>
                  {AGING_BUCKETS.map((b) => <Fragment key={b.key}>{cell(c.buckets[b.key as AgingBucketKey], b.key !== 'CURRENT')}</Fragment>)}
                  <td className="text-right font-semibold">{formatMoney(c.total)}</td>
                  <td className="pr-3 text-right"><button type="button" onClick={(e) => { e.stopPropagation(); setStatementFor(c.clientId); }} className={`${btnSmall} inline-flex items-center gap-1`}><FileText className="w-3 h-3" /> Estado de cuenta</button></td>
                </tr>
                {expanded === c.clientId && c.invoices?.map((i) => (
                  <tr key={i.invoiceId} className="bg-gray-50/60 text-xs">
                    <td className="pl-8 py-1.5"><button type="button" className="text-blue-600 hover:underline" onClick={() => onOpenInvoice(i.invoiceId)}>{i.invoiceNumber}</button> <span className="text-gray-400">vence {formatDateUTC(i.dueDate)}{i.overdueDays > 0 ? ` · ${i.overdueDays} d vencida` : ''}</span></td>
                    {AGING_BUCKETS.map((b) => <td key={b.key} className="text-right">{i.bucket === b.key ? formatMoney(i.balance) : ''}</td>)}
                    <td className="text-right">{formatMoney(i.balance)}</td><td />
                  </tr>
                ))}
              </Fragment>
            ))}
            {data && data.clients.length > 0 && (
              <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                <td className="px-3 py-2">Total</td>{AGING_BUCKETS.map((b) => <Fragment key={b.key}>{cell(data.buckets[b.key as AgingBucketKey], b.key !== 'CURRENT')}</Fragment>)}<td className="text-right">{formatMoney(data.total)}</td><td />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {data?.creditOnly && data.creditOnly.length > 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">Clientes sin saldo pero con saldo a favor: {data.creditOnly.map((c) => `${c.client?.legalName ?? c.clientId} (${formatMoney(c.unappliedCredit)})`).join(', ')}.</p>
      )}
      {statementFor && <StatementModal clientId={statementFor} asOf={asOf} onClose={() => setStatementFor(null)} />}
    </section>
  );
}
