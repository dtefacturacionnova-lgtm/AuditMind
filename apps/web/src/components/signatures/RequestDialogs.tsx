'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { RefreshCw } from 'lucide-react';
import { useInPersonSignatureRequest, useResendSignatureRequest, useRevokeSignatureRequest, type SendResult, type SignatureRequestView } from '@/hooks/useSignatureRequests';
import { DEFAULT_EXPIRY_DAYS, EXPIRY_OPTIONS, validateReason } from '@/lib/signature/internal';
import { formatDateSv } from '@/lib/signature/helpers';
import { Dialog, FormField, Note, OneTimeLink, dangerBtn, ghostBtn, inputCls, primaryBtn } from './ui';

/** «Reenviar»: rota el enlace (el anterior deja de servir), reinicia el código y vuelve a enviar el correo. */
export function ResendDialog({ request, onClose }: { request: SignatureRequestView; onClose: () => void }) {
  const resend = useResendSignatureRequest();
  const [days, setDays] = useState<'keep' | number>('keep');
  const [result, setResult] = useState<SendResult | null>(null);

  const stillValid = request.status !== 'EXPIRED' && !!request.expiresAt && new Date(request.expiresAt).getTime() > Date.now();
  const keepLabel = stillValid
    ? `Mantener el plazo actual (vence el ${formatDateSv(request.expiresAt)})`
    : `Plazo estándar (${DEFAULT_EXPIRY_DAYS[request.documentType]} días desde hoy)`;
  const options = useMemo(() => [...EXPIRY_OPTIONS], []);

  const close = () => { resend.reset(); onClose(); };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (resend.isPending) return;
    try {
      setResult(await resend.mutateAsync({ id: request.id, ...(days === 'keep' ? {} : { expiresInDays: days }) }));
    } catch { /* se muestra abajo */ }
  };

  if (result) {
    return (
      <Dialog title={result.emailSent ? 'Enlace reenviado' : 'Enlace nuevo creado, correo no enviado'} subtitle={request.title} onClose={close}>
        <OneTimeLink url={result.signUrl} emailSent={result.emailSent} signerEmail={result.request.signerEmail} />
        <div className="mt-5 flex justify-end"><button type="button" className={primaryBtn} onClick={close}>Listo</button></div>
      </Dialog>
    );
  }

  return (
    <Dialog title="Reenviar a firma" subtitle={`${request.title} — ${request.signerName} <${request.signerEmail}>`} onClose={close} busy={resend.isPending}>
      <form onSubmit={(e) => void submit(e)} className="space-y-3">
        <Note tone="warn">Se genera un enlace nuevo: <strong>el anterior deja de funcionar</strong> y el firmante tendrá que pedir otro código de verificación.</Note>
        <FormField label="Plazo para firmar">
          {(a) => (
            <select {...a} value={String(days)} onChange={(e) => setDays(e.target.value === 'keep' ? 'keep' : Number(e.target.value))} disabled={resend.isPending} className={inputCls}>
              <option value="keep">{keepLabel}</option>
              {options.map((d) => <option key={d} value={d}>{d} días desde hoy</option>)}
            </select>
          )}
        </FormField>
        {resend.isError && <Note tone="error">{resend.error.message || 'No se pudo reenviar. Inténtalo de nuevo.'}</Note>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={close} disabled={resend.isPending} className={ghostBtn}>Cancelar</button>
          <button type="submit" disabled={resend.isPending} className={primaryBtn}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> {resend.isPending ? 'Reenviando…' : 'Reenviar'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/**
 * «Abrir para firma presencial»: rota el enlace SIN enviar correo y lo abre en una pestaña nueva del dispositivo del auditor.
 * El código de verificación llega al correo del firmante, que lo lee en su teléfono.
 */
export function InPersonDialog({ request, onClose }: { request: SignatureRequestView; onClose: () => void }) {
  const inPerson = useInPersonSignatureRequest();

  const close = () => { inPerson.reset(); onClose(); };

  const open = async () => {
    if (inPerson.isPending) return;
    // La pestaña se abre ya, dentro del clic (si no, el navegador la bloquea), y luego se le asigna el enlace.
    const tab = window.open('about:blank', '_blank');
    try {
      const r = await inPerson.mutateAsync({ id: request.id });
      if (tab) { tab.opener = null; tab.location.href = r.signUrl; }
      onClose();
    } catch {
      tab?.close();
    }
  };

  return (
    <Dialog title="Abrir para firma presencial" subtitle={`${request.title} — ${request.signerName} <${request.signerEmail}>`} onClose={close} busy={inPerson.isPending}>
      <div className="space-y-3">
        <Note tone="info">
          Se genera un enlace nuevo <strong>sin enviar ningún correo</strong> y se abre en otra pestaña de este dispositivo. El enlace anterior deja de funcionar.
          Entrégale el dispositivo a la persona: el código de verificación le llega a <strong>{request.signerEmail}</strong> y lo puede leer en su teléfono.
        </Note>
        {inPerson.isError && <Note tone="error">{inPerson.error.message || 'No se pudo preparar la firma presencial. Inténtalo de nuevo.'}</Note>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={close} disabled={inPerson.isPending} className={ghostBtn}>Cancelar</button>
          <button type="button" onClick={() => void open()} disabled={inPerson.isPending} className={primaryBtn}>
            {inPerson.isPending ? 'Preparando…' : 'Abrir para firma presencial'}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

/** «Revocar»: cierra una solicitud vigente. Pide el motivo, que queda en la bitácora. */
export function RevokeDialog({ request, onClose }: { request: SignatureRequestView; onClose: () => void }) {
  const revoke = useRevokeSignatureRequest();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const close = () => { revoke.reset(); onClose(); };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (revoke.isPending) return;
    const problem = validateReason(reason);
    setError(problem);
    if (problem) return;
    try {
      await revoke.mutateAsync({ id: request.id, reason: reason.trim() });
      close();
    } catch { /* se muestra abajo */ }
  };

  return (
    <Dialog title="Revocar la solicitud" subtitle={`${request.title} — ${request.signerName}`} onClose={close} busy={revoke.isPending}>
      <form onSubmit={(e) => void submit(e)} className="space-y-3" noValidate>
        <Note tone="warn">El enlace deja de funcionar al instante. Si el firmante lo abre, verá que fue cancelado. Esta acción no se puede deshacer; para volver a pedir la firma tendrás que enviar una solicitud nueva.</Note>
        <FormField label="Motivo" required error={error ?? undefined} hint="Queda en la bitácora de la solicitud.">
          {(a) => <textarea {...a} rows={3} maxLength={500} value={reason} onChange={(e) => { setReason(e.target.value); setError(null); }} disabled={revoke.isPending} className={inputCls} />}
        </FormField>
        {revoke.isError && <Note tone="error">{revoke.error.message || 'No se pudo revocar. Inténtalo de nuevo.'}</Note>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={close} disabled={revoke.isPending} className={ghostBtn}>Volver</button>
          <button type="submit" disabled={revoke.isPending} className={`${dangerBtn} !px-4 !py-2 !text-sm`}>{revoke.isPending ? 'Revocando…' : 'Revocar solicitud'}</button>
        </div>
      </form>
    </Dialog>
  );
}
