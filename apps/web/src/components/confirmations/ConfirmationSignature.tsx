'use client';

import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FileText, Loader2, Paperclip, Trash2 } from 'lucide-react';
import { SignatureSection } from '@/components/signatures/SignatureSection';
import type { PayloadFieldsContext } from '@/components/signatures/SendForSignatureModal';
import { FormField, Note, ghostBtn, inputCls, labelCls } from '@/components/signatures/ui';
import {
  CONFIRMATION_TYPE_CONFIG, useRemoveAuthorizationLetter, useUploadAuthorizationLetter, type ExternalConfirmation,
} from '@/hooks/useConfirmations';
import { useOnSignatureStatusChange, type SignatureRequestView } from '@/hooks/useSignatureRequests';
import {
  confirmationResponseRows, initialConfirmationPayload, validateConfirmationPayload, type ConfirmationSendPayload,
} from '@/lib/signature/confirmation';
import { formatBytes } from '@/lib/signature/helpers';

const MAX_AUTH_BYTES = 10 * 1024 * 1024;

/** Campos propios de la confirmación dentro de la ventana de envío (el modal es genérico). */
export function ConfirmationPayloadFields({ ctx, confirmationId, hasAmount }: { ctx: PayloadFieldsContext; confirmationId: string; hasAmount: boolean }) {
  const p = ctx.payload as ConfirmationSendPayload;
  const upload = useUploadAuthorizationLetter(confirmationId);
  const remove = useRemoveAuthorizationLetter(confirmationId);
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [size, setSize] = useState<number | null>(null);
  const busy = ctx.disabled || upload.isPending || remove.isPending;

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setFileError(null);
    if (file.size > MAX_AUTH_BYTES) { setFileError('El archivo supera el límite de 10 MB.'); return; }
    try {
      const r = await upload.mutateAsync(file);
      setSize(r.sizeBytes);
      ctx.setPayload({ authorizationPath: r.authorizationPath, authorizationName: r.name });
    } catch (e) {
      setFileError((e as Error).message || 'No se pudo subir el archivo.');
    }
  };

  const clear = async () => {
    setFileError(null);
    try {
      await remove.mutateAsync();
      setSize(null);
      ctx.setPayload({ authorizationPath: undefined, authorizationName: undefined });
    } catch (e) {
      setFileError((e as Error).message || 'No se pudo quitar el archivo.');
    }
  };

  return (
    <fieldset className="space-y-3 rounded-xl border border-gray-200 p-3" disabled={ctx.disabled}>
      <legend className="px-1 text-xs font-semibold text-gray-600">Datos de la confirmación</legend>

      <div role="radiogroup" aria-label="Tipo de confirmación" className="space-y-2">
        {([
          ['POSITIVE_WITH_AMOUNT', 'Con saldo', 'El confirmante ve el saldo y dice si está de acuerdo.', !hasAmount],
          ['POSITIVE_BLANK', 'Con saldo en blanco', 'El confirmante escribe el saldo según sus registros (no se le muestra el tuyo).', false],
        ] as const).map(([value, title, help, unavailable]) => (
          <label key={value} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${unavailable ? 'cursor-not-allowed border-gray-100 bg-gray-50 text-gray-400' : 'cursor-pointer border-gray-200 hover:bg-gray-50'} ${p.mode === value ? 'border-blue-400 bg-blue-50' : ''}`}>
            <input type="radio" name="confirmation-mode" checked={p.mode === value} disabled={unavailable || busy}
              onChange={() => ctx.setPayload({ mode: value })} className="mt-0.5 h-4 w-4 accent-blue-600" />
            <span><span className="block font-medium text-gray-800">{title}</span>{unavailable ? 'No disponible: la confirmación no tiene monto registrado.' : help}</span>
          </label>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="Fecha de corte" required>
          {(a) => <input {...a} type="date" value={p.asOfDate ?? ''} onChange={(e) => ctx.setPayload({ asOfDate: e.target.value })} disabled={busy} className={inputCls} />}
        </FormField>
        <FormField label="Moneda" required hint="Código de 3 letras, por ejemplo USD.">
          {(a) => <input {...a} value={p.currency ?? ''} maxLength={3} onChange={(e) => ctx.setPayload({ currency: e.target.value.toUpperCase() })} disabled={busy} className={`${inputCls} uppercase`} />}
        </FormField>
      </div>

      <div>
        <p className={labelCls}>Carta de autorización del cliente <span className="font-normal text-gray-400">(opcional)</span></p>
        <p className="mb-1.5 text-[11px] text-gray-400">Muchos bancos la exigen. Se revisa con antivirus y se anexa al final del documento que verá el confirmante.</p>
        {p.authorizationPath ? (
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs">
            <FileText className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate" title={p.authorizationName}>{p.authorizationName ?? 'Carta de autorización'}</span>
            {size !== null && <span className="text-gray-400">{formatBytes(size)}</span>}
            <button type="button" onClick={() => void clear()} disabled={busy} aria-label="Quitar la carta de autorización" className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40">
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <>
            <input ref={fileInput} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="sr-only" tabIndex={-1} aria-label="Elegir la carta de autorización"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void choose(f); }} />
            <button type="button" onClick={() => fileInput.current?.click()} disabled={busy} className={ghostBtn}>
              {upload.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />}
              {upload.isPending ? 'Subiendo y revisando…' : 'Subir carta (PDF, JPG o PNG)'}
            </button>
          </>
        )}
        {fileError && <div className="mt-2"><Note tone="error">{fileError}</Note></div>}
      </div>

      <label className="flex cursor-pointer items-start gap-2 text-xs text-gray-700">
        <input type="checkbox" checked={p.recipientVerified === true} onChange={(e) => ctx.setPayload({ recipientVerified: e.target.checked })} disabled={busy} className="mt-0.5 h-4 w-4 accent-blue-600" />
        <span>Verifiqué de forma independiente que el correo del confirmante es correcto <span className="text-gray-400">(NIA 505: la solicitud debe estar bien dirigida)</span>.</span>
      </label>
    </fieldset>
  );
}

/** La respuesta que firmó el confirmante, en lenguaje de auditor. */
function ResponseView({ request }: { request: SignatureRequestView }) {
  const rows = confirmationResponseRows(request.response);
  if (rows.length === 0) return <p className="text-sm text-gray-500">Sin datos de respuesta.</p>;
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k} className={`min-w-0 ${k === 'Comentarios' ? 'sm:col-span-2' : ''}`}>
          <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{k}</dt>
          <dd className="mt-0.5 whitespace-pre-wrap break-words text-sm text-gray-800">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Firma electrónica de una confirmación externa: panel de solicitudes + envío con los datos propios de NIA 505.
 * Cuando el confirmante firma o rechaza (o se revoca), la confirmación se recarga para mostrar su estado al día.
 */
export function ConfirmationSignature({ confirmation }: { confirmation: ExternalConfirmation }) {
  const qc = useQueryClient();
  const hasAmount = confirmation.amount != null;
  const sendable = confirmation.status === 'DRAFT' || confirmation.status === 'SENT';
  const type = CONFIRMATION_TYPE_CONFIG[confirmation.type];

  useOnSignatureStatusChange('EXTERNAL_CONFIRMATION', confirmation.id, () => {
    void qc.invalidateQueries({ queryKey: ['confirmation', confirmation.id] });
    void qc.invalidateQueries({ queryKey: ['confirmations'] });
  });

  return (
    <SignatureSection
      documentType="EXTERNAL_CONFIRMATION"
      targetId={confirmation.id}
      documentLabel="Confirmación externa"
      documentTitle={`${type.label} — ${confirmation.respondentName}`}
      defaultSigner={{ name: confirmation.respondentName, email: confirmation.respondentEmail }}
      initialPayload={{ ...initialConfirmationPayload(hasAmount) }}
      renderPayloadFields={(ctx) => <ConfirmationPayloadFields ctx={ctx} confirmationId={confirmation.id} hasAmount={hasAmount} />}
      validatePayload={(p) => validateConfirmationPayload(p as ConfirmationSendPayload, { hasAmount })}
      renderResponse={(r) => <ResponseView request={r} />}
      canSend={sendable}
      sendLabel="Enviar por correo para firma"
      emptyHint="Todavía no se ha enviado esta confirmación para firma electrónica."
    />
  );
}
