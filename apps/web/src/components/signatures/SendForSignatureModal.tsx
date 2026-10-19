'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Send } from 'lucide-react';
import { useCreateSignatureRequest, type SendResult } from '@/hooks/useSignatureRequests';
import {
  DEFAULT_EXPIRY_DAYS, expiryChoices, validateSendForm, type SendFormValues, type SignatureDocumentType,
} from '@/lib/signature/internal';
import { formatDateSv } from '@/lib/signature/helpers';
import { Dialog, FormField, Note, OneTimeLink, ghostBtn, inputCls, primaryBtn } from './ui';

export interface PayloadFieldsContext {
  payload: Record<string, unknown>;
  setPayload: (patch: Record<string, unknown>) => void;
  disabled: boolean;
}

export interface SendForSignatureModalProps {
  open: boolean;
  onClose: () => void;
  documentType: SignatureDocumentType;
  /** Id del documento de origen (carta, confirmación o papel de la entrevista). */
  targetId: string;
  /** Nombre del tipo de documento para los textos: «Carta de compromiso», «Confirmación externa»… */
  documentLabel: string;
  /** Qué documento concreto se envía (aparece bajo el título). */
  documentTitle?: string;
  defaultSigner?: { name?: string; email?: string; role?: string };
  /** Si ya hay una solicitud activa de este documento, la nueva la reemplaza: se avisa antes de enviar. */
  replacesActive?: boolean;
  /** Valores iniciales de los datos propios del tipo (F2–F4). */
  initialPayload?: Record<string, unknown>;
  /** Campos propios del tipo: acta completa, modo de la confirmación, carta de autorización… */
  renderPayloadFields?: (ctx: PayloadFieldsContext) => ReactNode;
  /** Devuelve el texto de error si el payload no está completo; null si es válido. */
  validatePayload?: (payload: Record<string, unknown>) => string | null;
  onSent?: (result: SendResult) => void;
}

/** Envía un documento a firma por enlace (docs/firma-externa-por-enlace.md §14). Genérico: cada tipo aporta sus campos. */
export function SendForSignatureModal(props: SendForSignatureModalProps) {
  // El cuerpo se monta solo mientras está abierta: al cerrar se pierde el estado, incluido el enlace en claro.
  return props.open ? <ModalBody {...props} /> : null;
}

function ModalBody({
  onClose, documentType, targetId, documentLabel, documentTitle, defaultSigner, replacesActive, initialPayload,
  renderPayloadFields, validatePayload, onSent,
}: SendForSignatureModalProps) {
  const defaultDays = DEFAULT_EXPIRY_DAYS[documentType];
  const create = useCreateSignatureRequest();
  const [values, setValues] = useState<SendFormValues>({
    signerName: defaultSigner?.name ?? '', signerEmail: defaultSigner?.email ?? '', signerRole: defaultSigner?.role ?? '',
    expiresInDays: defaultDays, reminderEnabled: true,
  });
  const [payload, setPayloadState] = useState<Record<string, unknown>>(initialPayload ?? {});
  const [errors, setErrors] = useState<ReturnType<typeof validateSendForm>>({});
  const [payloadError, setPayloadError] = useState<string | null>(null);
  const [result, setResult] = useState<SendResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);

  // Al fallar la validación, el foco va al primer campo con error (teclado y lectores de pantalla).
  useEffect(() => {
    if (Object.keys(errors).length > 0) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errors]);

  const set = (patch: Partial<SendFormValues>) => setValues((v) => ({ ...v, ...patch }));
  const choices = useMemo(() => expiryChoices(defaultDays), [defaultDays]);
  const deadline = useMemo(() => formatDateSv(new Date(Date.now() + values.expiresInDays * 864e5).toISOString()), [values.expiresInDays]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (create.isPending) return;
    const found = validateSendForm(values);
    const payloadProblem = validatePayload?.(payload) ?? null;
    setErrors(found);
    setPayloadError(payloadProblem);
    if (Object.keys(found).length > 0 || payloadProblem) return;
    try {
      const r = await create.mutateAsync({
        documentType, targetId,
        signerName: values.signerName.trim(), signerEmail: values.signerEmail.trim(),
        ...(values.signerRole.trim() ? { signerRole: values.signerRole.trim() } : {}),
        expiresInDays: values.expiresInDays, reminderEnabled: values.reminderEnabled,
        ...(Object.keys(payload).length > 0 ? { payload } : {}),
      });
      setResult(r);
      onSent?.(r);
    } catch { /* el mensaje se muestra abajo desde create.error */ }
  };

  // Cerrar sin copiar un enlace cuando el correo falló: confirmar (reenviar genera otro, pero conviene avisar).
  const requestClose = () => {
    if (result && !result.emailSent && !copied && !confirmingClose) { setConfirmingClose(true); return; }
    create.reset();
    onClose();
  };

  if (result) {
    return (
      <Dialog title={result.emailSent ? 'Enviada a firma' : 'Solicitud creada, correo no enviado'} subtitle={documentTitle} onClose={requestClose}>
        <OneTimeLink url={result.signUrl} emailSent={result.emailSent} signerEmail={result.request.signerEmail} onCopied={() => setCopied(true)} />
        <p className="mt-3 text-[11px] text-gray-500">
          El documento quedó congelado: el firmante verá exactamente el PDF que se generó ahora. Si cambias el documento en AuditMind, esta solicitud se revoca y habrá que enviarla de nuevo.
        </p>
        {confirmingClose && (
          <div className="mt-4"><Note tone="warn">Todavía no copiaste el enlace y el correo no salió. Si cierras, tendrás que usar «Reenviar» para obtener uno nuevo.</Note></div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          {confirmingClose && <button type="button" className={ghostBtn} onClick={() => setConfirmingClose(false)}>Volver</button>}
          <button type="button" className={primaryBtn} onClick={requestClose}>{confirmingClose ? 'Cerrar de todos modos' : 'Listo'}</button>
        </div>
      </Dialog>
    );
  }

  const busy = create.isPending;
  return (
    <Dialog title={`Enviar «${documentLabel}» a firma`} subtitle={documentTitle} onClose={requestClose} busy={busy}>
      <form ref={formRef} onSubmit={(e) => void submit(e)} className="space-y-3" noValidate>
        {replacesActive && (
          <Note tone="warn">Ya hay una solicitud vigente de este documento. Al enviar esta, la anterior se revoca y su enlace deja de funcionar.</Note>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Nombre de quien firmará" required error={errors.signerName}>
            {(a) => <input {...a} value={values.signerName} onChange={(e) => set({ signerName: e.target.value })} maxLength={120} autoComplete="off" disabled={busy} className={inputCls} />}
          </FormField>
          <FormField label="Cargo" error={errors.signerRole}>
            {(a) => <input {...a} value={values.signerRole} onChange={(e) => set({ signerRole: e.target.value })} maxLength={120} autoComplete="off" disabled={busy} className={inputCls} />}
          </FormField>
        </div>
        <FormField label="Correo del firmante" required error={errors.signerEmail} hint="Le llegará el enlace y, al abrirlo, un código de 6 dígitos para confirmar que es esa persona.">
          {(a) => <input {...a} type="email" value={values.signerEmail} onChange={(e) => set({ signerEmail: e.target.value })} maxLength={254} autoComplete="off" disabled={busy} className={inputCls} />}
        </FormField>

        {renderPayloadFields?.({
          payload, disabled: busy,
          setPayload: (patch) => { setPayloadState((p) => ({ ...p, ...patch })); setPayloadError(null); },
        })}
        {payloadError && <Note tone="error">{payloadError}</Note>}

        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2">
          <FormField label="Plazo para firmar" error={errors.expiresInDays} hint={`Vence el ${deadline}.`}>
            {(a) => (
              <select {...a} value={values.expiresInDays} onChange={(e) => set({ expiresInDays: Number(e.target.value) })} disabled={busy} className={inputCls}>
                {choices.map((d) => <option key={d} value={d}>{d} días{d === defaultDays ? ' (recomendado)' : ''}</option>)}
              </select>
            )}
          </FormField>
          <label className="flex cursor-pointer items-start gap-2 pb-5 text-xs text-gray-700">
            <input type="checkbox" checked={values.reminderEnabled} onChange={(e) => set({ reminderEnabled: e.target.checked })} disabled={busy} className="mt-0.5 h-4 w-4 accent-blue-600" />
            <span>Enviar un recordatorio 3 días antes de que venza, si todavía no firmó.</span>
          </label>
        </div>

        <p className="text-[11px] leading-relaxed text-gray-500">
          Al enviar, el documento se convierte en PDF y queda congelado: el firmante verá exactamente ese archivo. La firma guarda la fecha, la hora, el correo verificado y la huella del documento.
        </p>

        {create.isError && <Note tone="error">{create.error.message || 'No se pudo enviar. Inténtalo de nuevo.'}</Note>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={requestClose} disabled={busy} className={ghostBtn}>Cancelar</button>
          <button type="submit" disabled={busy} className={primaryBtn}>
            <Send className="h-3.5 w-3.5" aria-hidden="true" /> {busy ? 'Preparando y enviando…' : 'Enviar a firma'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
