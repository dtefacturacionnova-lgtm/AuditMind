'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, FileText, Loader2, Upload } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { AdminOnly, ClientBillingNav } from '@/components/billing/ClientBillingNav';
import { CancelPaymentModal } from '@/components/billing/PaymentModals';
import { ProofUploader } from '@/components/billing/ProofUploader';
import { BTN_PRIMARY, BTN_SECONDARY, BTN_SMALL, Card, Pill } from '@/components/billing/ui';
import { useMyPayments } from '@/hooks/useBillingClient';
import type { PaymentRow } from '@/lib/billing/client-types';
import {
  MAX_PENDING_PAYMENTS, deadlineText, kindLabel, methodLabel, paymentActions, paymentAmount, paymentStatusView, sortMine,
} from '@/lib/billing/payments';
import { shortDate } from '@/lib/billing/subscription-tools';
import { cn } from '@/lib/utils';

function PaymentCard({ p, now, onCancel, notify }: { p: PaymentRow; now: Date; onCancel: (p: PaymentRow) => void; notify: (kind: 'ok' | 'warn', msg: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const view = paymentStatusView(p);
  const actions = paymentActions(p);
  const deadline = p.status === 'PENDING' ? deadlineText(p.expiresAt, now) : '';
  const resolvedOn = shortDate(p.approvedAt);

  return (
    <li className={cn('rounded-xl border bg-white p-4 sm:p-5', p.status === 'PENDING' ? 'border-gray-300' : 'border-gray-200')}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-60">
          <div className="flex flex-wrap items-center gap-2">
            <p className="break-words text-sm font-semibold text-gray-900">{p.concept}</p>
            <Pill tone={view.tone}>{view.label}</Pill>
          </div>
          <p className="mt-1 text-sm text-gray-700">
            {kindLabel(p.kind)} · {methodLabel(p.method)} · Referencia <span className="font-semibold tabular-nums text-gray-900">{p.reference}</span>
          </p>
          <p className="mt-0.5 text-xs tabular-nums text-gray-600">
            Solicitado el {shortDate(p.createdAt) || '—'}
            {p.status === 'APPROVED' && resolvedOn && ` · acreditado el ${resolvedOn}`}
            {p.status === 'REJECTED' && resolvedOn && ` · rechazado el ${resolvedOn}`}
            {deadline && ` · ${deadline}`}
          </p>
        </div>
        <p className="text-xl font-bold tabular-nums text-gray-900">{paymentAmount(p)}</p>
      </div>

      {view.hint && (
        <p className={cn('mt-3 break-words text-sm leading-relaxed', p.status === 'REJECTED' ? 'font-medium text-red-900' : 'text-gray-700')}>{view.hint}</p>
      )}

      {p.hasProof && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-gray-700">
          <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 break-all">Comprobante subido{p.proofName ? `: ${p.proofName}` : ''}</span>
        </p>
      )}

      {(actions.canUploadProof || actions.canCancel) && (
        <div className="mt-3 space-y-3 border-t border-gray-100 pt-3">
          <div className="flex flex-wrap gap-2">
            {actions.canUploadProof && (
              <button type="button" onClick={() => setUploading((v) => !v)} aria-expanded={uploading} className={p.hasProof ? BTN_SMALL : BTN_PRIMARY}>
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                {p.hasProof ? 'Cambiar comprobante' : 'Subir comprobante'}
                <span className="sr-only"> del pago {p.reference}</span>
              </button>
            )}
            {actions.canCancel && (
              <button type="button" onClick={() => onCancel(p)} className={p.hasProof ? BTN_SMALL : BTN_SECONDARY}>
                Cancelar pago<span className="sr-only"> {p.reference}</span>
              </button>
            )}
          </div>
          {uploading && actions.canUploadProof && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <ProofUploader payment={p} replacing={p.hasProof} onUploaded={() => { setUploading(false); notify('ok', `Recibimos el comprobante del pago ${p.reference}. Un administrador de la plataforma lo revisa.`); }} />
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function MyPaymentsInner() {
  const q = useMyPayments();
  const now = useMemo(() => new Date(), [q.dataUpdatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const [cancelling, setCancelling] = useState<PaymentRow | null>(null);
  const [toast, setToast] = useState<{ kind: 'ok' | 'warn'; msg: string } | null>(null);

  const rows = useMemo(() => sortMine(Array.isArray(q.data) ? q.data : []), [q.data]);
  const pending = rows.filter((r) => r.status === 'PENDING').length;

  const notify = (kind: 'ok' | 'warn', msg: string) => {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 8000);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-2xl text-sm leading-relaxed text-gray-700">
          Tus solicitudes de pago y su estado. Cuando un administrador de la plataforma aprueba el pago, la licencia o el paquete se acredita en tu cuenta.
          {pending > 0 && <> Tienes <strong className="tabular-nums">{pending}</strong> de {MAX_PENDING_PAYMENTS} pagos pendientes permitidos.</>}
        </p>
        <Link href="/dashboard/billing/comprar" className={BTN_PRIMARY}>Comprar más</Link>
      </div>

      {toast && (
        <div role="status" className={cn('flex items-start gap-2 rounded-lg border px-3 py-2 text-sm', toast.kind === 'ok' ? 'border-green-300 bg-green-50 text-green-950' : 'border-amber-300 bg-amber-50 text-amber-950')}>
          {toast.kind === 'ok' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
          <span>{toast.msg}</span>
        </div>
      )}

      {q.isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-400" aria-label="Cargando" /></div>
      ) : q.isError ? (
        <Card>
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <AlertTriangle className="h-8 w-8 text-amber-500" aria-hidden="true" />
            <p className="text-sm font-semibold text-gray-800">No se pudieron cargar tus pagos</p>
            {q.error instanceof Error && q.error.message && <p className="max-w-md break-words text-xs text-gray-600">{q.error.message}</p>}
            <button type="button" onClick={() => void q.refetch()} className={BTN_SECONDARY}>Reintentar</button>
          </div>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <p className="text-sm font-semibold text-gray-800">Todavía no tienes pagos</p>
            <p className="max-w-md text-xs text-gray-600">Cuando compres peticiones de IA, espacio o pagues tu licencia, la solicitud aparecerá aquí con su referencia.</p>
            <Link href="/dashboard/billing/comprar" className={BTN_PRIMARY}>Comprar más</Link>
          </div>
        </Card>
      ) : (
        <>
          <ul className="space-y-3">
            {rows.map((p) => <PaymentCard key={p.id} p={p} now={now} onCancel={setCancelling} notify={notify} />)}
          </ul>
          {rows.length >= 50 && <p className="text-xs text-gray-600">Se muestran tus 50 pagos más recientes.</p>}
        </>
      )}

      {cancelling && <CancelPaymentModal payment={cancelling} onClose={() => setCancelling(null)} notify={notify} />}
    </div>
  );
}

export default function MyPaymentsPage() {
  return (
    <div className="flex h-full flex-col">
      <Header title="Mis pagos" />
      <div className="mx-auto w-full max-w-6xl flex-1 space-y-5 overflow-y-auto px-4 py-6 sm:px-6">
        <div>
          <p className="text-sm text-gray-600">Administración › Mi plan › Mis pagos</p>
          <h1 className="text-2xl font-bold text-gray-900">Mis pagos</h1>
        </div>
        <ClientBillingNav />
        <AdminOnly>
          <MyPaymentsInner />
        </AdminOnly>
      </div>
    </div>
  );
}
