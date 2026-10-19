'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { CheckCircle2, Clock, Copy, Download, FileSignature, Hourglass, LinkIcon, Mail, ServerCrash, ShieldAlert, XCircle, Ban } from 'lucide-react';
import { captureFragmentToken } from '@/lib/fragment-token';
import { SignatureApiError, signatureApi } from '@/lib/signature/api';
import { classifyApiError, reducer, type CodePurpose, type Stage } from '@/lib/signature/flow';
import { buildResponse, fileProblem, formatDateSv, formatDateTimeSv, validateSigner } from '@/lib/signature/helpers';
import type { PublicAttachment } from '@/lib/signature/types';
import { CodeStep } from './CodeStep';
import { DocumentStep, emptyForm, type SignForm } from './DocumentStep';
import { Alert, Card, Heading, Spinner, StatusScreen, Stepper, primaryButton, secondaryButton } from './ui';

const POLL_MS = 4000;
const POLL_MAX_MS = 5 * 60_000;

/**
 * Flujo del firmante (docs/firma-externa-por-enlace.md §14). El token del enlace llega en el FRAGMENTO de la URL
 * (#…): se lee una vez, se borra de la barra de direcciones y del historial al instante y vive SOLO en memoria
 * (un ref). Recargar la página lo pierde a propósito: hay que volver a abrir el enlace del correo.
 */
export function SignFlow() {
  const [stage, dispatch] = useReducer(reducer, { kind: 'loading' } as Stage);
  const stageRef = useRef<Stage>(stage);
  stageRef.current = stage;
  const tokenRef = useRef<string | null>(null);
  const startedRef = useRef(false);

  const [busy, setBusy] = useState(false);
  // Un doble clic llega antes de que React pinte el botón deshabilitado: este ref cierra esa rendija (firmar y rechazar son
  // irreversibles y el servidor, además, es atómico).
  const inFlight = useRef(false);
  const [resendAt, setResendAt] = useState<number | null>(null);
  // El formulario vive FUERA de la máquina de estados: si la sesión vence y hay que verificar el correo otra vez, no se pierde.
  const [form, setForm] = useState<SignForm>(emptyForm);
  const [attachments, setAttachments] = useState<PublicAttachment[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  /** Traduce un error de la API en una acción de pantalla; devuelve el mensaje si solo hay que mostrarlo. */
  const handleError = useCallback((e: unknown, ctx: 'load' | 'session' | 'code'): string | null => {
    const a = classifyApiError(e, ctx);
    switch (a.action) {
      case 'terminal': dispatch({ type: 'TERMINAL', stage: a.stage }); return null;
      case 'session-expired': dispatch({ type: 'SESSION_EXPIRED' }); return null;
      case 'already-signed': dispatch({ type: 'ALREADY_SIGNED' }); return null;
      case 'locked': dispatch({ type: 'CODE_ERROR', message: a.message, locked: true }); return null;
      case 'inline': return a.message;
    }
  }, []);

  // ─── Cargar la solicitud ───────────────────────────────────────────────────
  const load = useCallback(async () => {
    const token = tokenRef.current;
    if (!token) return;
    try {
      dispatch({ type: 'LOADED', request: await signatureApi.getRequest(token) });
    } catch (e) {
      const msg = handleError(e, 'load');
      if (msg) dispatch({ type: 'TERMINAL', stage: { kind: 'unavailable', message: msg } });
    }
  }, [handleError]);

  useEffect(() => {
    if (startedRef.current) return; // React StrictMode ejecuta el efecto dos veces en desarrollo
    startedRef.current = true;
    const captured = captureFragmentToken(); // lee el #token y lo borra de la URL (dos veces; ver lib/fragment-token.ts)
    if (captured.kind === 'missing') { dispatch({ type: 'TERMINAL', stage: { kind: 'no-token' } }); return; }
    if (captured.kind === 'malformed') { dispatch({ type: 'TERMINAL', stage: { kind: 'invalid' } }); return; }
    tokenRef.current = captured.token;
    void load();
  }, [load]);

  // Cada pantalla nueva empieza arriba (si no, tras firmar al final de un formulario largo el firmante ve el medio de la nueva).
  useEffect(() => { window.scrollTo({ top: 0 }); }, [stage.kind]);

  // ─── Código de verificación ────────────────────────────────────────────────
  const sendCode = useCallback(async () => {
    const token = tokenRef.current;
    if (!token) return;
    setBusy(true);
    try {
      const r = await signatureApi.sendOtp(token);
      dispatch({ type: 'OTP_SENT', maskedEmail: r.maskedEmail });
      setResendAt(Date.now() + r.resendInSeconds * 1000);
    } catch (e) {
      const msg = handleError(e, 'code');
      if (msg) {
        dispatch({ type: 'CODE_ERROR', message: msg });
        const wait = /Espera (\d+) segundos/.exec(msg); // "Espera 30 segundos para pedir otro código."
        if (wait) setResendAt(Date.now() + Number(wait[1]) * 1000);
      }
    } finally {
      setBusy(false);
    }
  }, [handleError]);

  const verifyCode = useCallback(async (code: string) => {
    const token = tokenRef.current;
    const current = stageRef.current;
    if (!token || current.kind !== 'code' || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const v = await signatureApi.verifyOtp(token, code);
      if (current.purpose === 'sign') {
        // El código ya se consumió: si la carga del documento falla por red o por el servidor, se reintenta una vez antes
        // de rendirse (si no, el firmante tendría que pedir otro correo por un fallo que no fue suyo).
        const doc = await signatureApi.getDocument(token, v.sessionToken).catch(async (e: unknown) => {
          if (e instanceof SignatureApiError && (e.status === 0 || e.status >= 500)) return signatureApi.getDocument(token, v.sessionToken);
          throw e;
        });
        setAttachments(doc.attachments);
        dispatch({ type: 'VERIFIED_SIGN', doc, sessionToken: v.sessionToken, sessionExpiresAt: v.sessionExpiresAt });
      } else {
        dispatch({ type: 'VERIFIED_DOWNLOAD', sessionToken: v.sessionToken });
      }
    } catch (e) {
      const msg = handleError(e, 'code');
      if (msg) dispatch({ type: 'CODE_ERROR', message: msg });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [handleError]);

  const goToCode = useCallback((purpose: CodePurpose) => {
    dispatch({ type: 'GO_CODE', purpose });
    void sendCode();
  }, [sendCode]);

  // ─── La sesión segura vence a los 30 min: avisar y volver a pedir el código antes de que falle un envío ─────
  useEffect(() => {
    if (stage.kind !== 'document') return;
    const ms = new Date(stage.sessionExpiresAt).getTime() - Date.now();
    const id = setTimeout(() => dispatch({ type: 'SESSION_EXPIRED' }), Math.max(0, ms));
    return () => clearTimeout(id);
  }, [stage]);

  // ─── Descarga de la copia firmada: espera a que termine el sellado ─────────
  const polling = stage.kind === 'download' && (stage.state === 'checking' || stage.state === 'sealing');
  useEffect(() => {
    if (!polling) return;
    const token = tokenRef.current;
    if (!token) return;
    const startedAt = Date.now();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const current = stageRef.current;
      if (current.kind !== 'download') return;
      try {
        const r = await signatureApi.getSigned(token, current.sessionToken);
        if (cancelled) return;
        if (r.ready) {
          // La copia sellada llega en bytes por la API (nunca un enlace de Storage) y se ofrece desde el navegador.
          const buf = await signatureApi.getSignedFile(token, current.sessionToken);
          if (cancelled) return;
          dispatch({ type: 'DOWNLOAD_STATE', state: 'ready', pdfUrl: URL.createObjectURL(new Blob([buf], { type: 'application/pdf' })) });
          return;
        }
        if (r.failed || Date.now() - startedAt > POLL_MAX_MS) { dispatch({ type: 'DOWNLOAD_STATE', state: 'failed' }); return; }
        dispatch({ type: 'DOWNLOAD_STATE', state: 'sealing' });
        timer = setTimeout(tick, POLL_MS);
      } catch (e) {
        if (cancelled) return;
        // Sesión vencida → vuelve a pedir el código; cualquier otro error → "no pudimos preparar tu copia".
        if (handleError(e, 'session') !== null) dispatch({ type: 'DOWNLOAD_STATE', state: 'failed' });
      }
    };
    void tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [polling, handleError]);

  // La copia descargable vive en memoria (blob:): se libera al salir de la pantalla.
  const downloadUrl = stage.kind === 'download' ? stage.pdfUrl : null;
  useEffect(() => () => { if (downloadUrl?.startsWith('blob:')) URL.revokeObjectURL(downloadUrl); }, [downloadUrl]);

  // ─── Adjuntos ──────────────────────────────────────────────────────────────
  const upload = useCallback(async (files: File[]) => {
    const current = stageRef.current;
    const token = tokenRef.current;
    if (current.kind !== 'document' || !token) return;
    setUploadError(null);
    setUploading(true);
    let list = attachments;
    try {
      for (const file of files) {
        const problem = fileProblem(file, { count: list.length, bytes: list.reduce((s, a) => s + a.sizeBytes, 0) });
        if (problem) { setUploadError(`${file.name}: ${problem}`); break; }
        try {
          const a = await signatureApi.uploadAttachment(token, current.sessionToken, file);
          list = [...list, { id: a.id, originalName: a.originalName, sizeBytes: a.sizeBytes }];
          setAttachments(list);
        } catch (e) {
          const msg = handleError(e, 'session');
          if (msg) setUploadError(`${file.name}: ${msg}`);
          break;
        }
      }
    } finally {
      setUploading(false);
    }
  }, [attachments, handleError]);

  const removeAttachment = useCallback(async (id: string) => {
    const current = stageRef.current;
    const token = tokenRef.current;
    if (current.kind !== 'document' || !token) return;
    setUploadError(null);
    try {
      await signatureApi.removeAttachment(token, current.sessionToken, id);
      setAttachments((list) => list.filter((a) => a.id !== id));
    } catch (e) {
      const msg = handleError(e, 'session');
      if (msg) setUploadError(msg);
    }
  }, [handleError]);

  // ─── Firmar / rechazar ─────────────────────────────────────────────────────
  /** Al editar, los errores ya corregidos desaparecen solos (solo se revisan los campos que estaban marcados). */
  const onFormChange = useCallback((next: SignForm) => {
    setForm(next);
    const current = stageRef.current;
    if (current.kind !== 'document') return;
    setFieldErrors((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      const all = {
        ...validateSigner({ name: next.signedName, role: next.signedRole, roleRequired: current.doc.form.signedRoleRequired }),
        ...buildResponse(current.doc.form.fields, next.values).errors,
      };
      const kept: Record<string, string> = {};
      for (const key of Object.keys(prev)) if (all[key]) kept[key] = all[key];
      return kept;
    });
  }, []);

  const sign = useCallback(async () => {
    const current = stageRef.current;
    const token = tokenRef.current;
    if (current.kind !== 'document' || !token) return;
    const signerErrors = validateSigner({ name: form.signedName, role: form.signedRole, roleRequired: current.doc.form.signedRoleRequired });
    const built = buildResponse(current.doc.form.fields, form.values);
    const errors = { ...signerErrors, ...built.errors };
    setFieldErrors(errors);
    setSubmitError(null);
    if (Object.keys(errors).length > 0 || !form.consent || inFlight.current) return;

    inFlight.current = true;
    setBusy(true);
    try {
      const r = await signatureApi.sign(token, current.sessionToken, {
        signedName: form.signedName.trim(), signedRole: form.signedRole.trim() || undefined, consent: true, response: built.response,
      });
      dispatch({ type: 'SIGNED', verificationCode: r.verificationCode });
    } catch (e) {
      const msg = handleError(e, 'session');
      if (msg) setSubmitError(msg);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [form, handleError]);

  const decline = useCallback(async (reason: string) => {
    const current = stageRef.current;
    const token = tokenRef.current;
    if (current.kind !== 'document' || !token || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setSubmitError(null);
    try {
      await signatureApi.decline(token, current.sessionToken, reason);
      dispatch({ type: 'TERMINAL', stage: { kind: 'declined', justNow: true } });
    } catch (e) {
      const msg = handleError(e, 'session');
      if (msg) setSubmitError(msg);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [handleError]);

  // ─── Pantallas ─────────────────────────────────────────────────────────────
  switch (stage.kind) {
    case 'loading':
      return <Spinner label="Abriendo tu enlace seguro…" />;

    case 'no-token':
      return (
        <StatusScreen tone="amber" icon={<LinkIcon className="h-7 w-7" />} title="Abre el enlace desde tu correo">
          Esta página necesita el enlace completo que recibiste por correo. Si recargaste la página o copiaste solo una parte de la dirección, vuelve a abrir el mensaje original y usa el botón <strong>«Revisar y firmar»</strong>.
        </StatusScreen>
      );

    case 'invalid':
      return (
        <StatusScreen tone="red" icon={<ShieldAlert className="h-7 w-7" />} title="Enlace no válido">
          Este enlace no existe o fue reemplazado por uno más reciente. Revisa el último correo que recibiste o pide un enlace nuevo a quien te envió el documento.
        </StatusScreen>
      );

    case 'gone':
      return stage.reason === 'revoked' ? (
        <StatusScreen tone="gray" icon={<XCircle className="h-7 w-7" />} title="Esta solicitud fue cancelada">
          Quien te envió el documento canceló esta solicitud. Si crees que es un error, comunícate con esa persona.
        </StatusScreen>
      ) : (
        <StatusScreen tone="amber" icon={<Clock className="h-7 w-7" />} title="Este enlace venció">
          El plazo para firmar terminó. Pide un enlace nuevo a quien te envió el documento.
        </StatusScreen>
      );

    case 'unavailable':
      return (
        <StatusScreen tone="red" icon={<ServerCrash className="h-7 w-7" />} title="No pudimos abrir el documento"
          action={<button type="button" className={primaryButton} onClick={() => { dispatch({ type: 'RESTART' }); void load(); }}>Reintentar</button>}>
          {stage.message}
        </StatusScreen>
      );

    case 'declined':
      return (
        <StatusScreen tone="gray" icon={<Ban className="h-7 w-7" />} title={stage.justNow ? 'Registramos que no firmarás' : 'Esta solicitud fue rechazada'}>
          {stage.justNow ? 'Avisamos a quien te envió el documento y le compartimos tu motivo. Ya puedes cerrar esta página.' : 'Ya no se puede firmar este documento con este enlace.'}
        </StatusScreen>
      );

    case 'intro':
      return (
        <>
          <Stepper current={1} />
          <Card>
            <Heading subtitle={<><strong className="text-gray-800">{stage.request.orgName}</strong> te envió un documento para tu firma electrónica.</>}>
              Tienes un documento para firmar
            </Heading>
            <dl className="mb-5 grid gap-x-6 gap-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm sm:grid-cols-2">
              <div><dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Documento</dt><dd className="mt-0.5 font-medium text-gray-900">{stage.request.title}</dd></div>
              <div><dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Tipo</dt><dd className="mt-0.5 text-gray-900">{stage.request.documentLabel}</dd></div>
              <div><dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Enviado a</dt><dd className="mt-0.5 text-gray-900">{stage.request.maskedEmail}</dd></div>
              <div><dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Puedes firmar hasta</dt><dd className="mt-0.5 text-gray-900">{formatDateSv(stage.request.expiresAt)}</dd></div>
            </dl>
            <ol className="mb-6 list-decimal space-y-2 pl-5 text-sm text-gray-700 marker:font-semibold marker:text-blue-700">
              <li>Te enviamos un <strong>código de 6 dígitos</strong> a tu correo para comprobar que eres tú.</li>
              <li>Lees el documento y llenas tu respuesta.</li>
              <li>Firmas con tu nombre. Recibes una constancia con un código para verificarla.</li>
            </ol>
            <button type="button" onClick={() => goToCode('sign')} disabled={busy} className={primaryButton}>
              <Mail className="h-4 w-4" aria-hidden="true" /> Enviar código a mi correo
            </button>
            <p className="mt-4 text-xs text-gray-500">Si no esperabas este documento, puedes ignorarlo: nadie puede verlo ni firmarlo sin el código que llega a tu correo.</p>
          </Card>
        </>
      );

    case 'already-signed':
      return (
        <StatusScreen tone="green" icon={<CheckCircle2 className="h-7 w-7" />} title="Este documento ya fue firmado"
          action={<button type="button" className={primaryButton} onClick={() => goToCode('download')}><Download className="h-4 w-4" aria-hidden="true" /> Descargar copia firmada</button>}>
          {stage.request.signedAt ? <span className="mb-1 block font-medium text-gray-800">Firmado el {formatDateTimeSv(stage.request.signedAt)}</span> : null}
          Para descargar tu copia te pediremos verificar tu correo otra vez.
        </StatusScreen>
      );

    case 'code':
      return (
        <>
          <Stepper current={1} />
          <CodeStep
            maskedEmail={stage.maskedEmail} purpose={stage.purpose} sent={stage.sent} error={stage.error} notice={stage.notice}
            locked={stage.locked} busy={busy} resendAt={resendAt} onSend={() => void sendCode()} onVerify={(c) => void verifyCode(c)}
          />
        </>
      );

    case 'document':
      return (
        <DocumentStep
          doc={stage.doc} loadPdf={() => signatureApi.getDocumentFile(tokenRef.current ?? '', stage.sessionToken)}
          sessionExpiresAt={stage.sessionExpiresAt} form={form} onChange={onFormChange}
          attachments={attachments} fieldErrors={fieldErrors} submitError={submitError} uploadError={uploadError}
          busy={busy} uploading={uploading} onSign={() => void sign()} onDecline={(r) => void decline(r)}
          onUpload={(f) => void upload(f)} onRemoveAttachment={(id) => void removeAttachment(id)}
        />
      );

    case 'signed':
      return (
        <SignedScreen
          orgName={stage.request.orgName} code={stage.verificationCode}
          onDownload={() => (stage.sessionToken ? dispatch({ type: 'START_DOWNLOAD' }) : goToCode('download'))}
        />
      );

    case 'download':
      return (
        <>
          <Stepper current={3} />
          {stage.state === 'ready' && stage.pdfUrl ? (
            <StatusScreen tone="green" icon={<FileSignature className="h-7 w-7" />} title="Tu copia firmada está lista"
              action={<a href={stage.pdfUrl} download="documento-firmado.pdf" className={primaryButton}><Download className="h-4 w-4" aria-hidden="true" /> Descargar PDF firmado</a>}>
              Guárdala en tu equipo. Si cierras esta página, puedes volver a abrir el enlace de tu correo durante 30 días.
            </StatusScreen>
          ) : stage.state === 'failed' ? (
            <StatusScreen tone="amber" icon={<Hourglass className="h-7 w-7" />} title="Todavía no pudimos preparar tu copia">
              Tu firma <strong>sí quedó registrada</strong>. El equipo de {stage.request.orgName} ya fue avisado. Vuelve a intentarlo más tarde con el mismo enlace de tu correo.
            </StatusScreen>
          ) : (
            <Spinner label={stage.state === 'sealing' ? 'Estamos sellando el documento. Esta página se actualiza sola (suele tardar unos minutos)…' : 'Preparando tu copia…'} />
          )}
        </>
      );
  }
}

function SignedScreen({ orgName, code, onDownload }: { orgName: string; code: string; onDownload: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* sin portapapeles: el código sigue a la vista */ }
  };
  return (
    <>
      <Stepper current={3} />
      <Card className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50" aria-hidden="true">
          <CheckCircle2 className="h-7 w-7 text-emerald-600" />
        </div>
        <Heading>Tu firma quedó registrada</Heading>
        <p className="mx-auto max-w-md text-sm leading-relaxed text-gray-600">
          Avisamos a {orgName}. Guarda este código: sirve para comprobar la autenticidad del documento en cualquier momento.
        </p>
        <div className="mx-auto mt-5 max-w-sm rounded-2xl border-2 border-blue-900/80 px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Código de verificación</p>
          <p className="mt-1 select-all font-mono text-xl font-bold tracking-wider text-blue-950 sm:text-2xl" aria-label={`Código de verificación ${code.split('').join(' ')}`}>{code}</p>
          <button type="button" onClick={() => void copy()} className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:underline">
            <Copy className="h-3.5 w-3.5" aria-hidden="true" /> {copied ? 'Copiado' : 'Copiar código'}
          </button>
        </div>
        <div className="mx-auto mt-5 max-w-md">
          <Alert tone="blue" live={false}>
            Estamos sellando el documento. Cuando esté listo te enviaremos una constancia por correo. También puedes descargar tu copia firmada ahora mismo.
          </Alert>
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={onDownload} className={primaryButton}><Download className="h-4 w-4" aria-hidden="true" /> Descargar copia firmada</button>
          <a href="/verificar" className={secondaryButton}>Verificar un documento</a>
        </div>
      </Card>
    </>
  );
}
