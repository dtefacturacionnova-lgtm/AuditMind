'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { RefreshCw } from 'lucide-react';
import { useInPersonSignatureRequest, useResendSignatureRequest, useRevokeSignatureRequest, type SendResult, type SignatureRequestView } from '@/hooks/useSignatureRequests';
import { DEFAULT_EXPIRY_DAYS, EXPIRY_OPTIONS, validateReason } from '@/lib/signature/internal';
import { formatDateSv } from '@/lib/signature/helpers';
import { Dialog, FormField, InPersonWarning, Note, OneTimeLink, dangerBtn, ghostBtn, inputCls, openSignUrl, primaryBtn } from './ui';

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
 * «Firma presencial»: rota el enlace SIN enviar correo y lo muestra UNA vez, para abrirlo en el teléfono de la persona o en
 * una ventana privada. Ya no se abre solo en una pestaña del navegador del auditor: esa pestaña compartiría su sesión de
 * AuditMind con quien reciba el equipo (revisión de seguridad F5b, 2026-10-19). El código llega al correo del firmante.
 */
export function InPersonDialog({ request, onClose }: { request: SignatureRequestView; onClose: () => void }) {
  const inPerson = useInPersonSignatureRequest();
  const [result, setResult] = useState<SendResult | null>(null);

  const close = () => { inPerson.reset(); onClose(); };

  const prepare = async () => {
    if (inPerson.isPending) return;
    try {
      setResult(await inPerson.mutateAsync({ id: request.id }));
    } catch { /* se muestra abajo */ }
  };

  if (result) {
    return (
      <Dialog title="Lista para firma presencial" subtitle={request.title} onClose={close}>
        <OneTimeLink url={result.signUrl} emailSent={false} emailSkipped signerEmail={result.request.signerEmail} onOpenInPerson={() => openSignUrl(result.signUrl)} />
        <div className="mt-5 flex justify-end"><button type="button" className={primaryBtn} onClick={close}>Listo</button></div>
      </Dialog>
    );
  }

  return (
    <Dialog title="Firma presencial" subtitle={`${request.title} — ${request.signerName} <${request.signerEmail}>`} onClose={close} busy={inPerson.isPending}>
      <div className="space-y-3">
        <Note tone="info">
          Se genera un enlace nuevo <strong>sin enviar ningún correo</strong>; el enlace anterior deja de funcionar. El código de verificación le llega a
          <strong> {request.signerEmail}</strong>, que lo puede leer en su teléfono.
        </Note>
        <InPersonWarning />
        {inPerson.isError && <Note tone="error">{inPerson.error.message || 'No se pudo preparar la firma presencial. Inténtalo de nuevo.'}</Note>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={close} disabled={inPerson.isPending} className={ghostBtn}>Cancelar</button>
          <button type="button" onClick={() => void prepare()} disabled={inPerson.isPending} className={primaryBtn}>
            {inPerson.isPending ? 'Preparando…' : 'Generar enlace'}
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
