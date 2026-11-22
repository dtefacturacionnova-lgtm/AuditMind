'use client';

import { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, Callout, Field, INPUT_CLS, Modal } from '@/components/billing/ui';
import { useApprovePayment, useRejectPayment, fetchProofUrl } from '@/hooks/useBillingAdmin';
import { useCancelPayment } from '@/hooks/useBillingClient';
import type { AdminPaymentRow } from '@/lib/billing/admin-types';
import {
  REJECT_MAX, approvalEffect, errorText, isAlreadyProcessed, methodLabel, paymentAmount, paymentActions, safeProofUrl, validateRejectReason,
  type ApprovalContext,
} from '@/lib/billing/payments';

type Notify = (kind: 'ok' | 'warn', msg: string) => void;

const ALREADY_DONE = 'Otra persona ya procesó este pago. Actualicé la lista para que veas cómo quedó.';

function Actions({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap justify-end gap-2 pt-4">{children}</div>;
}

/** Resumen que se repite en los dos modales para no confirmar a ciegas: organización, referencia, concepto y monto. */
function PaymentSummary({ p }: { p: AdminPaymentRow }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
      <dt className="text-gray-600">Organización</dt><dd className="break-words font-semibold text-gray-900">{p.organizationName}</dd>
      <dt className="text-gray-600">Referencia</dt><dd className="font-semibold tabular-nums text-gray-900">{p.reference}</dd>
      <dt className="text-gray-600">Concepto</dt><dd className="break-words text-gray-900">{p.concept}</dd>
      <dt className="text-gray-600">Monto</dt><dd className="font-bold tabular-nums text-gray-900">{paymentAmount(p)}</dd>
      <dt className="text-gray-600">Método</dt><dd className="text-gray-900">{methodLabel(p.method)}</dd>
    </dl>
  );
}

// ── Aprobar ──

export function ApprovePaymentModal({ payment, context, onClose, notify }: {
  payment: AdminPaymentRow; context: ApprovalContext; onClose: () => void; notify: Notify;
}) {
  const approve = useApprovePayment();
  const [error, setError] = useState<string | null>(null);
  const actions = paymentActions(payment);
  const effect = approvalEffect(payment, context);

  async function confirm() {
    setError(null);
    try {
      await approve.mutateAsync(payment.id);
      notify('ok', `Se aprobó el pago ${payment.reference} de ${payment.organizationName}: ${payment.concept}.`);
      onClose();
    } catch (err) {
      if (isAlreadyProcessed(err)) {
        notify('warn', `${payment.reference}: ${ALREADY_DONE}`);
        onClose();
        return;
      }
      setError(errorText(err, 'No se pudo aprobar el pago.'));
    }
  }

  return (
    <Modal
      title="Aprobar pago" onClose={approve.isPending ? () => undefined : onClose}
      subtitle="Aprobar acredita el pago en una sola operación que no se puede repetir."
    >
      <div className="space-y-4">
        <PaymentSummary p={payment} />
        <div>
          <p className="mb-1.5 text-sm font-semibold text-gray-900">Qué hará esta aprobación</p>
          <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-gray-800">
            {effect.map((line) => <li key={line} className="break-words">{line}</li>)}
          </ul>
        </div>
        {actions.approveWithoutProof && (
          <Callout tone="warning" title="Este pago no tiene comprobante adjunto">
            Aprueba solo si ya verificaste el dinero por otro medio (por ejemplo, efectivo recibido o el movimiento en el banco con esta referencia).
          </Callout>
        )}
        {error && <Callout tone="critical">{error}</Callout>}
      </div>
      <Actions>
        <button type="button" onClick={onClose} disabled={approve.isPending} className={BTN_SECONDARY}>Cancelar</button>
        <button type="button" onClick={() => void confirm()} disabled={approve.isPending} className={BTN_PRIMARY}>
          {approve.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {approve.isPending ? 'Aprobando…' : 'Aprobar y acreditar'}
        </button>
      </Actions>
    </Modal>
  );
}

// ── Rechazar ──

export function RejectPaymentModal({ payment, onClose, notify }: { payment: AdminPaymentRow; onClose: () => void; notify: Notify }) {
  const reject = useRejectPayment();
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const check = validateRejectReason(reason);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!check.ok) return;
    setError(null);
    try {
      await reject.mutateAsync({ id: payment.id, reason: check.reason });
      notify('ok', `Se rechazó el pago ${payment.reference} de ${payment.organizationName}.`);
      onClose();
    } catch (err) {
      if (isAlreadyProcessed(err)) {
        notify('warn', `${payment.reference}: ${ALREADY_DONE}`);
        onClose();
        return;
      }
      setError(errorText(err, 'No se pudo rechazar el pago.'));
    }
  }

  return (
    <Modal
      title="Rechazar pago" onClose={reject.isPending ? () => undefined : onClose}
      subtitle="El cliente verá el motivo en «Mis pagos». No se acredita nada."
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <PaymentSummary p={payment} />
        <Field
          label="Motivo del rechazo" htmlFor="rj-reason"
          help={`Obligatorio, de 3 a ${REJECT_MAX} caracteres. Escríbelo de forma que el cliente sepa qué corregir. (${reason.trim().length}/${REJECT_MAX})`}
          error={touched && !check.ok ? check.message : undefined}
        >
          <textarea
            id="rj-reason" rows={3} value={reason} maxLength={REJECT_MAX + 100} onChange={(e) => setReason(e.target.value)} onBlur={() => setTouched(true)}
            aria-invalid={touched && !check.ok} aria-describedby={touched && !check.ok ? 'rj-reason-error' : 'rj-reason-help'} className={INPUT_CLS}
          />
        </Field>
        {error && <Callout tone="critical">{error}</Callout>}
        <Actions>
          <button type="button" onClick={onClose} disabled={reject.isPending} className={BTN_SECONDARY}>Volver</button>
          <button type="submit" disabled={reject.isPending || (touched && !check.ok)} className={BTN_DANGER}>
            {reject.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {reject.isPending ? 'Rechazando…' : 'Rechazar pago'}
          </button>
        </Actions>
      </form>
    </Modal>
  );
}

// ── Ver comprobante ──

/** Abre el comprobante en una pestaña nueva (aislada del sitio). El enlace es temporal (5 minutos): se pide justo al hacer clic. */
export function ViewProofButton({ paymentId, reference, className }: { paymentId: string; reference: string; className: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setError(null);
    // La pestaña se abre ANTES de pedir el enlace para que el navegador no la bloquee; se aísla (opener nulo) y recién entonces se le da la dirección.
    let tab: Window | null = null;
    try {
      tab = window.open('about:blank', '_blank');
      if (tab) tab.opener = null;
    } catch {
      tab = null;
    }
    try {
      const { url } = await fetchProofUrl(paymentId);
      const safe = safeProofUrl(url);
      if (!safe) throw new Error('El enlace del comprobante no es válido.');
      if (tab) tab.location.href = safe;
      else window.open(safe, '_blank', 'noopener,noreferrer');
    } catch (err) {
      try { tab?.close(); } catch { /* la pestaña ya se cerró */ }
      setError(errorText(err, 'No se pudo abrir el comprobante.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" onClick={() => void open()} disabled={busy} className={className}>
        {busy && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
        Ver comprobante<span className="sr-only"> del pago {reference}</span>
      </button>
      {error && <span role="alert" className="flex items-start gap-1 text-xs font-medium text-red-700"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />{error}</span>}
    </span>
  );
}

// ── Cancelar (cliente) ──

export function CancelPaymentModal({ payment, onClose, notify }: {
  payment: { id: string; reference: string; concept: string; amountUsd: number }; onClose: () => void; notify: Notify;
}) {
  const cancel = useCancelPayment();
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setError(null);
    try {
      await cancel.mutateAsync(payment.id);
      notify('ok', `Cancelaste el pago ${payment.reference}.`);
      onClose();
    } catch (err) {
      setError(errorText(err, 'No se pudo cancelar el pago.'));
    }
  }

  return (
    <Modal
      title="Cancelar este pago" onClose={cancel.isPending ? () => undefined : onClose}
      subtitle="Solo se cancela la solicitud: no se cobra ni se acredita nada. Si ya hiciste el pago, no canceles: escribe a la plataforma."
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
        <dt className="text-gray-600">Referencia</dt><dd className="font-semibold tabular-nums text-gray-900">{payment.reference}</dd>
        <dt className="text-gray-600">Concepto</dt><dd className="break-words text-gray-900">{payment.concept}</dd>
        <dt className="text-gray-600">Monto</dt><dd className="font-bold tabular-nums text-gray-900">{paymentAmount(payment)}</dd>
      </dl>
      {error && <div className="mt-3"><Callout tone="critical">{error}</Callout></div>}
      <Actions>
        <button type="button" onClick={onClose} disabled={cancel.isPending} className={BTN_SECONDARY}>No cancelar</button>
        <button type="button" onClick={() => void confirm()} disabled={cancel.isPending} className={BTN_DANGER}>
          {cancel.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {cancel.isPending ? 'Cancelando…' : 'Sí, cancelar el pago'}
        </button>
      </Actions>
    </Modal>
  );
}
