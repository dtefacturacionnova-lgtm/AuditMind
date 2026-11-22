'use client';

import { useId, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Upload } from 'lucide-react';
import { BTN_PRIMARY, BTN_SECONDARY, Callout, INPUT_CLS } from '@/components/billing/ui';
import { useUploadProof } from '@/hooks/useBillingClient';
import type { PaymentRow } from '@/lib/billing/client-types';
import { formatBytes } from '@/lib/billing/consumption';
import { PROOF_EXTENSIONS, proofErrorText, validateProofFile } from '@/lib/billing/payments';

/**
 * Sube el comprobante de un pago pendiente. Revisa tipo (PDF, JPG o PNG) y tamaño (hasta 5 MB) en el navegador ANTES de enviar;
 * el servidor vuelve a validar por los primeros bytes del archivo.
 */
export function ProofUploader({ payment, onUploaded, replacing = false }: {
  payment: Pick<PaymentRow, 'id' | 'reference'>;
  onUploaded?: (p: PaymentRow) => void;
  /** Ya hay un comprobante: el texto del botón dice «Cambiar». */
  replacing?: boolean;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadProof();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = e.target.files?.[0] ?? null;
    setDone(null);
    setError(null);
    setFile(null);
    if (!chosen) return;
    const check = await validateProofFile(chosen);
    if (!check.ok) {
      setError(check.message);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    setFile(chosen);
  }

  async function send() {
    if (!file) return;
    setError(null);
    try {
      const updated = await upload.mutateAsync({ id: payment.id, file });
      setDone(file.name);
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      onUploaded?.(updated);
    } catch (err) {
      setError(proofErrorText(err));
    }
  }

  return (
    <div className="space-y-2.5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="text-sm font-semibold text-gray-800">
          {replacing ? 'Cambiar el comprobante' : 'Comprobante de pago'}
        </label>
        <input
          ref={inputRef} id={inputId} type="file" onChange={(e) => void pick(e)} disabled={upload.isPending}
          accept={[...PROOF_EXTENSIONS.map((x) => `.${x}`), 'application/pdf', 'image/jpeg', 'image/png'].join(',')}
          aria-describedby={`${inputId}-help`} aria-invalid={error ? true : undefined}
          className={`${INPUT_CLS} file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-gray-800`}
        />
        <p id={`${inputId}-help`} className="text-xs text-gray-600">
          PDF, JPG o PNG, hasta 5 MB. Incluye la referencia <span className="font-semibold tabular-nums">{payment.reference}</span> en tu pago.
        </p>
      </div>
      {file && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="min-w-0 break-all text-sm text-gray-800">
            {file.name} <span className="tabular-nums text-gray-600">· {formatBytes(file.size)}</span>
          </p>
          <button type="button" onClick={() => void send()} disabled={upload.isPending} className={BTN_PRIMARY}>
            {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
            {upload.isPending ? 'Subiendo…' : replacing ? 'Subir el nuevo comprobante' : 'Subir comprobante'}
          </button>
          {!upload.isPending && (
            <button type="button" onClick={() => { setFile(null); if (inputRef.current) inputRef.current.value = ''; }} className={BTN_SECONDARY}>Quitar</button>
          )}
        </div>
      )}
      {error && <Callout tone="critical">{error}</Callout>}
      {done && (
        <p role="status" className="flex items-start gap-1.5 text-sm font-medium text-green-900">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="break-all">Recibimos tu comprobante ({done}). Un administrador de la plataforma lo revisa.</span>
        </p>
      )}
    </div>
  );
}
