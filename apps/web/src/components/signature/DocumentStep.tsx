'use client';

import { useEffect, useRef, useState } from 'react';
import { Ban, FileText, Paperclip, PenLine, Trash2 } from 'lucide-react';
import type { FieldValues } from '@/lib/signature/helpers';
import { formatBytes, formatDateSv, formatTimeSv, MAX_FILES } from '@/lib/signature/helpers';
import type { FormField, PublicAttachment, PublicDocument } from '@/lib/signature/types';
import { PdfViewer, type Integrity } from './PdfViewer';
import { Alert, Card, Field, Heading, Stepper, inputClass, primaryButton, secondaryButton } from './ui';

export interface SignForm {
  signedName: string;
  signedRole: string;
  values: FieldValues;
  consent: boolean;
}
export const emptyForm: SignForm = { signedName: '', signedRole: '', values: {}, consent: false };

interface Props {
  doc: PublicDocument;
  sessionExpiresAt: string;
  form: SignForm;
  onChange: (next: SignForm) => void;
  attachments: PublicAttachment[];
  fieldErrors: Record<string, string>;
  submitError: string | null;
  uploadError: string | null;
  busy: boolean;
  uploading: boolean;
  onSign: () => void;
  onDecline: (reason: string) => void;
  onUpload: (files: File[]) => void;
  onRemoveAttachment: (id: string) => void;
}

function DynamicField({ field, value, error, onChange }: {
  field: FormField; value: string | boolean | undefined; error?: string; onChange: (v: string | boolean) => void;
}) {
  const id = `f-${field.key}`;
  if (field.type === 'boolean') {
    return (
      <fieldset aria-describedby={error ? `${id}-error` : field.help ? `${id}-help` : undefined}>
        <legend className="mb-1.5 text-sm font-medium text-gray-800">
          {field.label}{field.required && <span className="text-red-600" aria-hidden="true"> *</span>}
          {field.required && <span className="sr-only"> (obligatorio)</span>}
        </legend>
        <div className="flex gap-3">
          {([['Sí', true], ['No', false]] as const).map(([label, v]) => (
            <label key={label} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium ${
              value === v ? 'border-blue-600 bg-blue-50 text-blue-900' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}>
              <input type="radio" name={id} checked={value === v} onChange={() => onChange(v)} aria-invalid={error ? true : undefined} className="h-4 w-4 accent-blue-600" />
              {label}
            </label>
          ))}
        </div>
        {field.help && <p id={`${id}-help`} className="mt-1 text-xs text-gray-500">{field.help}</p>}
        {error && <p id={`${id}-error`} className="mt-1 text-xs font-medium text-red-600">{error}</p>}
      </fieldset>
    );
  }
  return (
    <Field id={id} label={field.label} required={field.required} help={field.help} error={error}>
      {(a11y) =>
        field.type === 'textarea' ? (
          <textarea {...a11y} rows={4} maxLength={field.maxLength ?? 4000} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} className={inputClass} />
        ) : field.type === 'amount' ? (
          <div className="relative max-w-xs">
            <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm text-gray-500" aria-hidden="true">$</span>
            <input {...a11y} inputMode="decimal" autoComplete="off" placeholder="0.00" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} className={`${inputClass} pl-7`} />
          </div>
        ) : (
          <input {...a11y} type="text" maxLength={field.maxLength ?? 500} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} className={inputClass} />
        )
      }
    </Field>
  );
}

export function DocumentStep(p: Props) {
  const { doc, form, onChange } = p;
  const [integrity, setIntegrity] = useState<Integrity>('checking');
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const formRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Al fallar la validación, el foco va al primer campo con error.
  useEffect(() => {
    if (Object.keys(p.fieldErrors).length === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [p.fieldErrors]);

  const set = (patch: Partial<SignForm>) => onChange({ ...form, ...patch });
  const setValue = (key: string, v: string | boolean) => onChange({ ...form, values: { ...form.values, [key]: v } });
  const blocked = integrity === 'mismatch' || integrity === 'checking';
  const canSign = form.consent && !blocked && !p.busy && !p.uploading;
  const canAttachMore = p.attachments.length < MAX_FILES;

  return (
    <>
      <Stepper current={2} />
      <Heading subtitle={<><strong className="text-gray-800">{doc.orgName}</strong> te envió «{doc.title}» ({doc.documentLabel}).
        {doc.expiresAt && <> Puedes firmarlo hasta el {formatDateSv(doc.expiresAt)}.</>}</>}>
        Revisa el documento y firma
      </Heading>

      <div className="space-y-5" ref={formRef}>
        <Card>
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-gray-900"><FileText className="h-4 w-4 text-gray-400" aria-hidden="true" /> Documento</h2>
          <PdfViewer pdfUrl={doc.pdfUrl} expectedSha256={doc.documentSha256} onIntegrity={setIntegrity} />
        </Card>

        {/* Si el documento no coincide con el enviado no hay nada que responder ni firmar: se ocultan los formularios. */}
        {integrity !== 'mismatch' && (
          <>
            {doc.form.fields.length > 0 && (
              <Card>
                <h2 className="mb-4 text-base font-semibold text-gray-900">Tu respuesta</h2>
                <div className="space-y-5">
                  {doc.form.fields.map((f) => (
                    <DynamicField key={f.key} field={f} value={form.values[f.key]} error={p.fieldErrors[f.key]} onChange={(v) => setValue(f.key, v)} />
                  ))}
                </div>
              </Card>
            )}

            {doc.form.allowAttachments && (
              <Card>
                <h2 className="mb-1 flex items-center gap-2 text-base font-semibold text-gray-900"><Paperclip className="h-4 w-4 text-gray-400" aria-hidden="true" /> Documentos de soporte <span className="text-xs font-normal text-gray-500">(opcional)</span></h2>
                <p className="mb-3 text-xs text-gray-500">PDF, JPG o PNG. Hasta {MAX_FILES} archivos de 10 MB. Cada archivo se revisa con un antivirus antes de aceptarse.</p>
                {p.attachments.length > 0 && (
                  <ul className="mb-3 divide-y divide-gray-100 rounded-xl border border-gray-200">
                    {p.attachments.map((a) => (
                      <li key={a.id} className="flex items-center gap-3 px-3.5 py-2.5 text-sm">
                        <FileText className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate" title={a.originalName}>{a.originalName}</span>
                        <span className="shrink-0 text-xs text-gray-500">{formatBytes(a.sizeBytes)}</span>
                        <button type="button" onClick={() => p.onRemoveAttachment(a.id)} disabled={p.busy || p.uploading}
                          className="shrink-0 rounded-lg p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-40"
                          aria-label={`Quitar ${a.originalName}`}>
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" multiple className="sr-only" tabIndex={-1}
                  onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ''; if (files.length) p.onUpload(files); }} />
                <button type="button" onClick={() => fileRef.current?.click()} disabled={!canAttachMore || p.busy || p.uploading} className={secondaryButton}>
                  <Paperclip className="h-4 w-4" aria-hidden="true" /> {p.uploading ? 'Subiendo y revisando…' : 'Agregar archivo'}
                </button>
                {p.uploadError && <div className="mt-3"><Alert tone="red">{p.uploadError}</Alert></div>}
              </Card>
            )}

            <Card>
              <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900"><PenLine className="h-4 w-4 text-gray-400" aria-hidden="true" /> Tu firma</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="signedName" label="Tu nombre completo" required error={p.fieldErrors.signedName} help="Escríbelo tal como firmarías el documento.">
                  {(a11y) => <input {...a11y} type="text" autoComplete="name" maxLength={120} value={form.signedName} onChange={(e) => set({ signedName: e.target.value })} className={inputClass} />}
                </Field>
                <Field id="signedRole" label="Tu cargo" required={doc.form.signedRoleRequired} error={p.fieldErrors.signedRole}>
                  {(a11y) => <input {...a11y} type="text" autoComplete="organization-title" maxLength={120} value={form.signedRole} onChange={(e) => set({ signedRole: e.target.value })} className={inputClass} />}
                </Field>
              </div>

              <div className="mt-5 rounded-xl border border-gray-300 bg-gray-50 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Declaración de consentimiento</p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{doc.consentText}</p>
              </div>
              <label className="mt-3 flex cursor-pointer items-start gap-3 text-sm text-gray-800">
                <input type="checkbox" checked={form.consent} onChange={(e) => set({ consent: e.target.checked })} className="mt-0.5 h-4 w-4 accent-blue-600" />
                <span>He leído la declaración y la acepto. <span className="sr-only">(obligatorio para firmar)</span></span>
              </label>
              <p className="mt-3 text-xs leading-relaxed text-gray-500">{doc.privacyNotice}</p>

              {p.submitError && <div className="mt-4"><Alert tone="red">{p.submitError}</Alert></div>}
              {Object.keys(p.fieldErrors).length > 0 && !p.submitError && (
                <div className="mt-4"><Alert tone="red">Revisa los campos marcados en rojo antes de firmar.</Alert></div>
              )}
              {integrity === 'checking' && <p className="mt-3 text-xs text-gray-500">Espera a que termine la verificación del documento para poder firmar.</p>}

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button type="button" onClick={p.onSign} disabled={!canSign} className={primaryButton}>
                  <PenLine className="h-4 w-4" aria-hidden="true" /> {p.busy ? 'Firmando…' : 'Firmar documento'}
                </button>
                <button type="button" onClick={() => setDeclining((v) => !v)} disabled={p.busy} className={secondaryButton} aria-expanded={declining}>
                  <Ban className="h-4 w-4" aria-hidden="true" /> No firmar
                </button>
                <span className="text-xs text-gray-500 sm:ml-auto">Sesión segura hasta las {formatTimeSv(p.sessionExpiresAt)} (hora de El Salvador)</span>
              </div>

              {declining && (
                <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <Field id="declineReason" label="¿Por qué no vas a firmar?" required help={doc.declineNotice}
                    error={reason.trim().length > 0 && reason.trim().length < 5 ? 'Escribe al menos 5 caracteres.' : undefined}>
                    {(a11y) => <textarea {...a11y} rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} />}
                  </Field>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <button type="button" onClick={() => p.onDecline(reason.trim())} disabled={reason.trim().length < 5 || p.busy} className={primaryButton}>
                      {p.busy ? 'Enviando…' : 'Confirmar que no firmaré'}
                    </button>
                    <button type="button" onClick={() => { setDeclining(false); setReason(''); }} disabled={p.busy} className={secondaryButton}>Volver</button>
                  </div>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </>
  );
}
