'use client';

import type { ReactNode } from 'react';
import { Loader2, PenLine, Send } from 'lucide-react';
import { useUser } from '@/hooks/useUser';
import { useSignatureRequests, type SignatureRequestView } from '@/hooks/useSignatureRequests';
import { MANAGER_ROLE, MIN_ROLE_BY_TYPE, type SignatureDocumentType } from '@/lib/signature/internal';
import { SignatureRequestCard } from './SignatureRequestCard';
import { Note, primaryBtn } from './ui';

export interface SignatureRequestsPanelProps {
  documentType: SignatureDocumentType;
  targetId: string | undefined;
  title?: string;
  /** Muestra el botón de envío; el que monta el panel decide qué abre (normalmente SendForSignatureModal). */
  onSend?: () => void;
  sendLabel?: string;
  /** Si se da, el botón de envío queda desactivado y se explica por qué (p. ej. «Falta el monto de la confirmación»). */
  sendDisabledReason?: string | null;
  /** Por defecto se deducen del rol de la sesión; se pueden fijar desde fuera (pruebas, vistas de solo lectura). */
  canManage?: boolean;
  isManager?: boolean;
  renderResponse?: (r: SignatureRequestView) => ReactNode;
  responseLabels?: Record<string, string>;
  emptyHint?: ReactNode;
}

/** Solicitudes de firma de un documento: estado, respuesta, archivos, bitácora y acciones (docs/firma-externa-por-enlace.md §14). */
export function SignatureRequestsPanel({
  documentType, targetId, title = 'Firma electrónica', onSend, sendLabel = 'Enviar para firma', sendDisabledReason,
  canManage, isManager, renderResponse, responseLabels, emptyHint,
}: SignatureRequestsPanelProps) {
  const { hasRole } = useUser();
  const manage = canManage ?? hasRole([MIN_ROLE_BY_TYPE[documentType]]);
  const manager = isManager ?? hasRole([MANAGER_ROLE]);
  const { data, isLoading, isError, error, refetch } = useSignatureRequests(documentType, targetId);

  return (
    <section aria-label={title} className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <PenLine className="h-4 w-4 text-gray-400" aria-hidden="true" />
        <h2 className="flex-1 text-sm font-semibold text-gray-800">{title}</h2>
        {onSend && manage && (
          <button type="button" onClick={onSend} disabled={!!sendDisabledReason} title={sendDisabledReason ?? undefined} className={primaryBtn}>
            <Send className="h-3.5 w-3.5" aria-hidden="true" /> {sendLabel}
          </button>
        )}
      </div>
      {onSend && manage && sendDisabledReason && <div className="mb-3"><Note tone="warn">{sendDisabledReason}</Note></div>}

      {isLoading && (
        <p className="flex items-center gap-2 py-6 text-sm text-gray-400" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Cargando solicitudes…</p>
      )}

      {isError && (
        <Note tone="error">
          No se pudieron cargar las solicitudes de firma{error?.message ? `: ${error.message}` : ''}.{' '}
          <button type="button" onClick={() => void refetch()} className="font-semibold underline">Reintentar</button>
        </Note>
      )}

      {!isLoading && !isError && data && data.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-500">
          {emptyHint ?? 'Todavía no se ha enviado este documento a firma.'}
        </div>
      )}

      {data && data.length > 0 && (
        <div className="space-y-2.5">
          {data.map((r, i) => (
            <SignatureRequestCard key={r.id} request={r} canManage={manage} isManager={manager} defaultOpen={i === 0}
              renderResponse={renderResponse} responseLabels={responseLabels} />
          ))}
        </div>
      )}
    </section>
  );
}
