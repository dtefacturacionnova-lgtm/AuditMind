'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, Loader2, Search } from 'lucide-react';
import { ApprovePaymentModal, RejectPaymentModal, ViewProofButton } from '@/components/billing/PaymentModals';
import { PaymentInstructionsCard } from '@/components/billing/PaymentInstructionsCard';
import { BTN_PRIMARY, BTN_SMALL, Card, INPUT_CLS, Pill, QueryError } from '@/components/billing/ui';
import { useAdminPacks, useAdminPayments, useSubscriptions } from '@/hooks/useBillingAdmin';
import type { AdminPaymentRow } from '@/lib/billing/admin-types';
import {
  DEFAULT_PAYMENT_FILTERS, PAYMENT_STATUSES, PAYMENT_STATUS_LABEL, deadlineText, filterPayments, kindLabel, methodLabel, paymentActions,
  paymentAmount, paymentCounts, paymentStatusView, sortQueue, type ApprovalContext, type PaymentFilters, type StatusFilter,
} from '@/lib/billing/payments';
import { toNumber } from '@/lib/billing/pricing';
import { shortDate } from '@/lib/billing/subscription-tools';
import { cn } from '@/lib/utils';

/** El API entrega los 200 pagos más recientes. */
const API_PAGE = 200;

const CHIPS: StatusFilter[] = ['PENDING', ...PAYMENT_STATUSES.filter((s) => s !== 'PENDING'), 'ALL'];

type Dialog = { kind: 'approve' | 'reject'; payment: AdminPaymentRow };

function PaymentCard({ p, now, onApprove, onReject }: {
  p: AdminPaymentRow; now: Date; onApprove: (p: AdminPaymentRow) => void; onReject: (p: AdminPaymentRow) => void;
}) {
  const view = paymentStatusView(p);
  const actions = paymentActions(p);
  const deadline = p.status === 'PENDING' ? deadlineText(p.expiresAt, now) : '';
  const resolvedOn = shortDate(p.approvedAt);

  return (
    <li className={cn('rounded-xl border p-4', p.status === 'PENDING' ? 'border-gray-300 bg-gray-50' : 'border-gray-200 bg-white')}>
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-64">
          <div className="flex flex-wrap items-center gap-2">
            <p className="break-words text-sm font-semibold text-gray-900">{p.organizationName}</p>
            <Pill tone={view.tone}>{view.label}</Pill>
          </div>
          <p className="mt-1 break-words text-sm text-gray-800">
            {kindLabel(p.kind)} · {p.concept}
          </p>
          <p className="mt-0.5 text-sm text-gray-800">
            <span className="font-bold tabular-nums text-gray-900">{paymentAmount(p)}</span> · {methodLabel(p.method)} ·{' '}
            <span className="font-semibold tabular-nums">{p.reference}</span>
          </p>
          <p className="mt-0.5 text-xs tabular-nums text-gray-600">
            Pedido el {shortDate(p.createdAt) || '—'}
            {deadline && ` · ${deadline}`}
            {p.status === 'APPROVED' && resolvedOn && ` · aprobado el ${resolvedOn}`}
            {p.status === 'REJECTED' && resolvedOn && ` · rechazado el ${resolvedOn}`}
          </p>
          {p.status === 'REJECTED' && p.rejectedReason && <p className="mt-1 break-words text-xs font-medium text-red-900">Motivo: {p.rejectedReason}</p>}
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-800">
          <FileText className="h-4 w-4 shrink-0 text-gray-600" aria-hidden="true" />
          {p.hasProof ? (
            <span className="min-w-0 break-all">Con comprobante{p.proofName ? `: ${p.proofName}` : ''}</span>
          ) : (
            <span className="font-semibold text-amber-900">Sin comprobante</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {actions.canViewProof && <ViewProofButton paymentId={p.id} reference={p.reference} className={BTN_SMALL} />}
          {actions.canReject && (
            <button type="button" onClick={() => onReject(p)} className={cn(BTN_SMALL, 'border-red-300 text-red-900 hover:bg-red-50')}>
              Rechazar<span className="sr-only"> el pago {p.reference}</span>
            </button>
          )}
          {actions.canApprove && (
            <button type="button" onClick={() => onApprove(p)} className={BTN_PRIMARY}>
              Aprobar<span className="sr-only"> el pago {p.reference}</span>
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

export default function AdminPaymentsPage() {
  const paymentsQ = useAdminPayments();
  const subsQ = useSubscriptions();
  const packsQ = useAdminPacks();
  const [filters, setFilters] = useState<PaymentFilters>(DEFAULT_PAYMENT_FILTERS);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [toast, setToast] = useState<{ kind: 'ok' | 'warn'; msg: string } | null>(null);
  const now = useMemo(() => new Date(), [paymentsQ.dataUpdatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const all = useMemo(() => (Array.isArray(paymentsQ.data) ? paymentsQ.data : []), [paymentsQ.data]);
  const counts = useMemo(() => paymentCounts(all), [all]);
  const shown = useMemo(() => sortQueue(filterPayments(all, filters)), [all, filters]);
  const filtered = filters.status !== 'ALL' || filters.q.trim() !== '';

  const notify = (kind: 'ok' | 'warn', msg: string) => {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 9000);
  };

  /** Lo que sabemos de la organización y del paquete para explicar qué hará aprobar (si no se pudo leer, el modal lo dice sin afirmar de más). */
  const contextFor = (p: AdminPaymentRow): ApprovalContext => {
    const ctx: ApprovalContext = {};
    if (p.kind === 'LICENSE' && subsQ.data) {
      ctx.currentPlanCode = subsQ.data.find((s) => s.organizationId === p.organizationId)?.planCode ?? null;
    }
    if (p.kind === 'PACK' && packsQ.data) {
      const pack = packsQ.data.find((x) => x.code === p.packCode);
      const qty = pack ? toNumber(pack.quantity) : null;
      if (pack && qty !== null) ctx.pack = { kind: pack.kind, quantity: qty };
    }
    return ctx;
  };

  const set = (patch: Partial<PaymentFilters>) => setFilters((f) => ({ ...f, ...patch }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Pagos</h1>
        <p className="mt-0.5 text-sm text-gray-600">
          Cola de aprobación de licencias y paquetes. Aprobar acredita el pago en una sola operación que no se puede repetir; todo queda en el registro de actividad.
        </p>
      </div>

      {toast && (
        <div role="status" className={cn('flex items-start gap-2 rounded-lg border px-3 py-2 text-sm', toast.kind === 'ok' ? 'border-green-300 bg-green-50 text-green-950' : 'border-amber-300 bg-amber-50 text-amber-950')}>
          {toast.kind === 'ok' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
          <span className="break-words">{toast.msg}</span>
        </div>
      )}

      {paymentsQ.isError ? (
        <div className="rounded-xl border border-gray-200 bg-white"><QueryError error={paymentsQ.error} what="los pagos" onRetry={() => void paymentsQ.refetch()} /></div>
      ) : paymentsQ.isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-400" aria-label="Cargando" /></div>
      ) : (
        <Card>
          <div className="mb-4 space-y-3">
            <div role="group" aria-label="Filtrar por estado" className="flex flex-wrap gap-1.5">
              {CHIPS.map((st) => {
                const on = filters.status === st;
                const n = st === 'ALL' ? counts.ALL : counts[st];
                return (
                  <button
                    key={st} type="button" aria-pressed={on} onClick={() => set({ status: st })}
                    className={cn(
                      'rounded-full border px-3.5 py-1.5 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F2D4A]',
                      on ? 'border-[#0F2D4A] bg-[#0F2D4A] font-semibold text-white' : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50',
                    )}
                  >
                    {st === 'ALL' ? 'Todos' : PAYMENT_STATUS_LABEL[st]} <span className="tabular-nums">{n}</span>
                  </button>
                );
              })}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="pq" className="mb-1 block text-xs font-semibold text-gray-700">Buscar</label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" aria-hidden="true" />
                  <input id="pq" type="search" value={filters.q} onChange={(e) => set({ q: e.target.value })} placeholder="Organización o referencia (AUD-…)" className={cn(INPUT_CLS, 'pl-8')} />
                </div>
              </div>
              <p className="self-end pb-2 text-sm text-gray-700">
                <strong className="tabular-nums">{counts.PENDING}</strong> pendiente{counts.PENDING === 1 ? '' : 's'}, <strong className="tabular-nums">{counts.pendingWithProof}</strong> con comprobante listo para revisar.
              </p>
            </div>
            {filtered && (
              <p className="text-sm text-gray-700">
                Mostrando {shown.length} de {all.length}.{' '}
                <button type="button" onClick={() => setFilters({ status: 'ALL', q: '' })} className="font-semibold underline underline-offset-2">Ver todos</button>
              </p>
            )}
          </div>

          {shown.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-600">
              {all.length === 0
                ? 'Todavía no hay pagos. Cuando un cliente pida pagar una licencia o comprar un paquete, aparecerá aquí.'
                : filters.status === 'PENDING' && filters.q.trim() === ''
                  ? 'No hay pagos pendientes. Todo está al día.'
                  : 'Ningún pago coincide con los filtros.'}
            </p>
          ) : (
            <ul className="space-y-3">
              {shown.map((p) => (
                <PaymentCard key={p.id} p={p} now={now} onApprove={(x) => setDialog({ kind: 'approve', payment: x })} onReject={(x) => setDialog({ kind: 'reject', payment: x })} />
              ))}
            </ul>
          )}

          {all.length >= API_PAGE && (
            <p className="mt-3 text-xs text-gray-600">Se muestran los {API_PAGE} pagos más recientes; los más antiguos no aparecen aquí.</p>
          )}
          <p className="mt-3 text-xs leading-relaxed text-gray-600">
            Orden: primero lo pendiente con comprobante (el más antiguo arriba), luego lo pendiente sin comprobante y al final lo ya resuelto.
            La tarea diaria de la plataforma pasa a «Vencidos» los pagos pendientes cuyo plazo (14 días) terminó; los comprobantes nunca se borran.
          </p>
        </Card>
      )}

      <PaymentInstructionsCard notify={notify} />

      {dialog?.kind === 'approve' && (
        <ApprovePaymentModal key={dialog.payment.id} payment={dialog.payment} context={contextFor(dialog.payment)} onClose={() => setDialog(null)} notify={notify} />
      )}
      {dialog?.kind === 'reject' && <RejectPaymentModal key={dialog.payment.id} payment={dialog.payment} onClose={() => setDialog(null)} notify={notify} />}
    </div>
  );
}
