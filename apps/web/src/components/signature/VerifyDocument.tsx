'use client';

import { useCallback, useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { BadgeCheck, FileSearch, ShieldAlert, Upload } from 'lucide-react';
import { SignatureApiError, signatureApi } from '@/lib/signature/api';
import { formatBytes, formatDateTimeSv, formatVerificationInput, isCompleteVerificationCode, sameHash, sha256Hex } from '@/lib/signature/helpers';
import type { VerifyResult } from '@/lib/signature/types';
import { Alert, Card, Heading, Spinner, inputClass, primaryButton } from './ui';

const MAX_CHECK_BYTES = 100 * 1024 * 1024;

type FileCheck =
  | { kind: 'idle' }
  | { kind: 'working'; name: string }
  | { kind: 'match'; name: string; sha: string }
  | { kind: 'mismatch'; name: string; sha: string }
  | { kind: 'error'; message: string };

/**
 * Verificación pública de un documento firmado (docs/firma-externa-por-enlace.md §16). El código es público por
 * diseño (no da acceso a nada: solo confirma que el documento existe y con qué huella se selló). La comparación del
 * archivo ocurre ENTERAMENTE en este navegador: el PDF no se sube a ningún servidor.
 */
export function VerifyDocument() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [check, setCheck] = useState<FileCheck>({ kind: 'idle' });
  const startedRef = useRef(false);

  const lookup = useCallback(async (value: string) => {
    setBusy(true);
    setError(null);
    setResult(null);
    setCheck({ kind: 'idle' });
    try {
      setResult(await signatureApi.verify(value));
    } catch (e) {
      if (e instanceof SignatureApiError && e.status === 404) setError('No encontramos un documento con ese código. Revisa que esté completo y vuelve a intentarlo.');
      else if (e instanceof SignatureApiError && e.status === 429) setError('Hiciste muchas consultas seguidas. Espera un minuto e inténtalo de nuevo.');
      else setError(e instanceof SignatureApiError ? e.message : 'No pudimos consultar el código. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }, []);

  // Si el enlace trae el código en el fragmento (/verificar#ABCD-EFGH-JKMN-PQRS) se llena y se consulta solo.
  useEffect(() => {
    if (startedRef.current) return; // React StrictMode ejecuta los efectos dos veces en desarrollo
    startedRef.current = true;
    const fromHash = formatVerificationInput(decodeURIComponent(window.location.hash.replace(/^#/, '')));
    if (!fromHash) return;
    setCode(fromHash);
    if (isCompleteVerificationCode(fromHash)) void lookup(fromHash);
  }, [lookup]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (isCompleteVerificationCode(code) && !busy) void lookup(code);
  };

  const compareFile = useCallback(async (file: File | undefined) => {
    if (!file || !result) return;
    if (file.size > MAX_CHECK_BYTES) { setCheck({ kind: 'error', message: `El archivo pesa ${formatBytes(file.size)}; el máximo para comprobar aquí es ${formatBytes(MAX_CHECK_BYTES)}.` }); return; }
    setCheck({ kind: 'working', name: file.name });
    try {
      const sha = await sha256Hex(await file.arrayBuffer());
      setCheck(result.acceptedHashes.some((h) => sameHash(h, sha)) ? { kind: 'match', name: file.name, sha } : { kind: 'mismatch', name: file.name, sha });
    } catch {
      setCheck({ kind: 'error', message: 'No pudimos leer el archivo. Inténtalo con otro.' });
    }
  }, [result]);

  return (
    <div className="space-y-5">
      <Card>
        <Heading subtitle="Escribe el código que aparece en la constancia de firma para confirmar que el documento es auténtico.">
          Verificar un documento firmado
        </Heading>
        <form onSubmit={submit} className="space-y-3" noValidate>
          <label htmlFor="vcode" className="block text-sm font-medium text-gray-800">Código de verificación</label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              id="vcode" value={code} onChange={(e) => setCode(formatVerificationInput(e.target.value))}
              inputMode="text" autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="XXXX-XXXX-XXXX-XXXX"
              aria-invalid={error ? true : undefined} aria-describedby={error ? 'vcode-error' : undefined}
              className={`${inputClass} font-mono text-base tracking-wider sm:max-w-sm`}
            />
            <button type="submit" disabled={!isCompleteVerificationCode(code) || busy} className={primaryButton}>
              {busy ? 'Consultando…' : 'Verificar'}
            </button>
          </div>
          {error && <Alert tone="red" id="vcode-error">{error}</Alert>}
        </form>
      </Card>

      {busy && <Spinner label="Consultando el código…" />}

      {result && !busy && (
        <>
          <Card>
            {result.valid ? (
              <div className="mb-4 flex items-start gap-3">
                <BadgeCheck className="mt-0.5 h-8 w-8 shrink-0 text-emerald-600" aria-hidden="true" />
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Firma registrada y vigente</h2>
                  <p className="text-sm text-gray-600">Este documento fue firmado electrónicamente y su constancia existe en AuditMind.</p>
                </div>
              </div>
            ) : (
              <div className="mb-4">
                <Alert tone="amber">Este código existe, pero la solicitud <strong>no tiene una firma registrada</strong> (puede haberse rechazado o cancelado).</Alert>
              </div>
            )}

            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <Item label="Documento" value={result.title} />
              <Item label="Tipo" value={result.documentLabel} />
              <Item label="Emitido por" value={result.orgName} />
              {result.signedName && <Item label="Firmado por" value={result.signedName} />}
              {result.signedAt && <Item label="Fecha de la firma" value={formatDateTimeSv(result.signedAt)} />}
              {result.valid && (
                <Item
                  label="Sellado del PDF"
                  value={result.sealing ? 'En proceso (suele tardar unos minutos)' : result.sealedAt ? `Completado el ${formatDateTimeSv(result.sealedAt)}` : 'Completado'}
                />
              )}
              {result.valid && !result.sealing && <Item label="Sello de tiempo de tercero" value={result.timestamped ? 'Sí (RFC 3161)' : 'Pendiente o no aplicado'} />}
            </dl>
            {result.sealFingerprint && (
              <p className="mt-4 break-all rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-[11px] text-gray-600">
                Huella del sello de la organización (SHA-256): {result.sealFingerprint}
              </p>
            )}
          </Card>

          {result.valid && (
            <Card>
              <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-gray-900"><FileSearch className="h-5 w-5 text-blue-600" aria-hidden="true" /> Comprobar tu copia del PDF</h2>
              <p className="mb-4 text-sm text-gray-600">
                Selecciona el PDF firmado que tienes. Calculamos su huella <strong>en tu navegador</strong> y la comparamos con la registrada: el archivo no se sube a ningún servidor.
              </p>
              {result.acceptedHashes.length === 0 ? (
                <Alert tone="amber">El documento todavía se está sellando, así que aún no hay una huella contra la cual comparar. Vuelve a intentarlo en unos minutos.</Alert>
              ) : (
                <FileDrop onFile={(f) => void compareFile(f)} />
              )}
              <div className="mt-4" aria-live="polite">
                {check.kind === 'working' && <Spinner label={`Calculando la huella de ${check.name}…`} />}
                {check.kind === 'error' && <Alert tone="red">{check.message}</Alert>}
                {check.kind === 'match' && (
                  <Alert tone="green">
                    <p className="font-semibold">El archivo coincide con el documento firmado.</p>
                    <p className="mt-1">«{check.name}» no ha sido modificado desde que se selló.</p>
                    <p className="mt-1 break-all font-mono text-[11px]">SHA-256: {check.sha}</p>
                  </Alert>
                )}
                {check.kind === 'mismatch' && (
                  <Alert tone="red">
                    <p className="flex items-center gap-2 font-semibold"><ShieldAlert className="h-4 w-4" aria-hidden="true" /> El archivo NO coincide con el registrado.</p>
                    <p className="mt-1">«{check.name}» es distinto del documento sellado (o fue modificado después). No lo consideres auténtico sin consultar a quien lo emitió.</p>
                    <p className="mt-1 break-all font-mono text-[11px]">SHA-256 del archivo: {check.sha}</p>
                  </Alert>
                )}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-0.5 break-words text-gray-900">{value}</dd>
    </div>
  );
}

/** Zona para soltar o elegir un PDF. Accesible con teclado (es un botón real). */
function FileDrop({ onFile }: { onFile: (f: File | undefined) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); onFile(e.dataTransfer.files?.[0]); };
  return (
    <>
      <button
        type="button" onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}
        className={`flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
          over ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-gray-300 bg-gray-50 text-gray-600 hover:border-blue-400 hover:bg-blue-50/50'}`}
      >
        <Upload className="h-6 w-6" aria-hidden="true" />
        <span className="font-medium">Elige el PDF o suéltalo aquí</span>
      </button>
      <input ref={input} type="file" accept="application/pdf,.pdf" className="sr-only" tabIndex={-1} aria-label="Elegir el PDF firmado"
        onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
    </>
  );
}
