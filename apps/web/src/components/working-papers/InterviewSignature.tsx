'use client';

import { useMemo } from 'react';
import { SignatureSection } from '@/components/signatures/SignatureSection';
import type { PayloadFieldsContext } from '@/components/signatures/SendForSignatureModal';
import { FormField, Note, inputCls } from '@/components/signatures/ui';
import { useUser } from '@/hooks/useUser';
import type { SignatureRequestView } from '@/hooks/useSignatureRequests';
import {
  actaResponseRows, ACTA_LIMITS, initialActaPayload, MODALITY_OPTIONS, validateActaPayload, type ActaDraft, type Modality,
} from '@/lib/signature/interview';

/** Campos propios del acta dentro de la ventana de envío (el modal es genérico). */
export function ActaPayloadFields({ ctx }: { ctx: PayloadFieldsContext }) {
  const p = ctx.payload as ActaDraft;
  const disabled = ctx.disabled;
  const content = p.content ?? '';

  return (
    <fieldset className="space-y-3 rounded-xl border border-gray-200 p-3" disabled={disabled}>
      <legend className="px-1 text-xs font-semibold text-gray-600">Datos de la entrevista</legend>
      <p className="text-[11px] text-gray-500">La persona entrevistada es quien firma: sus datos son los de arriba. El acta no podrá cambiarse después de enviarla; para corregirla se revoca y se envía otra.</p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="Fecha de la entrevista" required>
          {(a) => <input {...a} type="date" value={p.interviewDate ?? ''} onChange={(e) => ctx.setPayload({ interviewDate: e.target.value })} disabled={disabled} className={inputCls} />}
        </FormField>
        <FormField label="Modalidad" required>
          {(a) => (
            <select {...a} value={p.modality ?? ''} onChange={(e) => ctx.setPayload({ modality: e.target.value as Modality })} disabled={disabled} className={inputCls}>
              {MODALITY_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          )}
        </FormField>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="Entrevistadores" required hint="Quién o quiénes realizaron la entrevista.">
          {(a) => <input {...a} value={p.interviewers ?? ''} maxLength={ACTA_LIMITS.interviewersMax} onChange={(e) => ctx.setPayload({ interviewers: e.target.value })} disabled={disabled} className={inputCls} />}
        </FormField>
        <FormField label="Lugar o plataforma" hint="Opcional: sala, dirección o videollamada.">
          {(a) => <input {...a} value={p.location ?? ''} maxLength={ACTA_LIMITS.locationMax} onChange={(e) => ctx.setPayload({ location: e.target.value })} disabled={disabled} className={inputCls} />}
        </FormField>
      </div>

      <FormField label="Texto del acta" required hint={`${content.trim().length.toLocaleString('es-SV')} de ${ACTA_LIMITS.contentMax.toLocaleString('es-SV')} caracteres (mínimo ${ACTA_LIMITS.contentMin}). Se respetan los saltos de línea.`}>
        {(a) => <textarea {...a} rows={9} value={content} maxLength={ACTA_LIMITS.contentMax} onChange={(e) => ctx.setPayload({ content: e.target.value })} disabled={disabled} className={inputCls} />}
      </FormField>

      <FormField label="Nota de confidencialidad" hint="Opcional: aparece resaltada antes del acta.">
        {(a) => <textarea {...a} rows={2} value={p.confidentialityNote ?? ''} maxLength={ACTA_LIMITS.noteMax} onChange={(e) => ctx.setPayload({ confidentialityNote: e.target.value })} disabled={disabled} className={inputCls} />}
      </FormField>
    </fieldset>
  );
}

/** La respuesta que firmó el entrevistado, en lenguaje de auditor. */
function ResponseView({ request }: { request: SignatureRequestView }) {
  const rows = actaResponseRows(request.response);
  if (rows.length === 0) return <p className="text-sm text-gray-500">Sin datos de respuesta.</p>;
  return (
    <dl className="space-y-2">
      {rows.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{k}</dt>
          <dd className="mt-0.5 whitespace-pre-wrap break-words text-sm text-gray-800">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Actas de entrevista para firma electrónica (papel PT-ENTREV, de tipo entrevista o B-INT-*). El acta se redacta en la
 * ventana de envío y vive en la solicitud; al sellarse, el PDF firmado se agrega a la sección S2 del papel.
 * En modo investigación se avisa que el correo puede alertar a la persona investigada y se ofrece la firma presencial.
 */
export function InterviewSignature({ paperId, paperTitle, investigationMode }: { paperId: string; paperTitle: string; investigationMode: boolean }) {
  const { user } = useUser();
  const initial = useMemo(() => ({ ...initialActaPayload(user?.name ?? '') }), [user?.name]);

  return (
    <SignatureSection
      documentType="INTERVIEW_RECORD"
      targetId={paperId}
      title="Actas para firma"
      documentLabel="Acta de entrevista"
      documentTitle={paperTitle}
      sendLabel="Enviar acta para firma"
      initialPayload={initial}
      renderPayloadFields={(ctx) => <ActaPayloadFields ctx={ctx} />}
      validatePayload={(p) => validateActaPayload(p as ActaDraft)}
      renderResponse={(r) => <ResponseView request={r} />}
      allowInPerson
      notice={investigationMode ? (
        <Note tone="warn"><strong>Modo investigación.</strong> Enviar el acta por correo puede alertar a la persona investigada. Considera la firma presencial: marca la opción de abajo y que la persona abra el enlace en su teléfono (o en una ventana privada de tu equipo).</Note>
      ) : undefined}
      emptyHint="Todavía no se ha enviado ningún acta de este papel para firma electrónica."
    />
  );
}
