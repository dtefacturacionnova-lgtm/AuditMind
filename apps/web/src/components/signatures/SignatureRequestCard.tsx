'use client';

import { useState, type ReactNode } from 'react';
import {
  ChevronDown, ChevronRight, CheckCircle2, ExternalLink, FileText, History, Loader2, Paperclip, RefreshCw, ShieldCheck, ShieldAlert, UserCheck, XCircle,
} from 'lucide-react';
import {
  useResealSignatureRequest, useSignatureFileLink, useSignatureIntegrity, type SignatureAttachmentView, type SignatureRequestView,
} from '@/hooks/useSignatureRequests';
import {
  canReseal, canResend, canRevoke, eventDetail, eventLabel, integrityLabel, isInPersonRequest, responseEntries, sealLabel, STATUS_META, verifyPath,
} from '@/lib/signature/internal';
import { formatBytes, formatDateSv, formatDateTimeSv } from '@/lib/signature/helpers';
import { InPersonDialog, ResendDialog, RevokeDialog } from './RequestDialogs';
import { Chip, Note, dangerBtn, ghostBtn } from './ui';

export interface RequestCardProps {
  request: SignatureRequestView;
  /** Puede reenviar, revocar y reintentar el sellado. */
  canManage: boolean;
  /** Gerente o superior: verificar integridad y bajar adjuntos originales sin reconstruir. */
  isManager: boolean;
  defaultOpen?: boolean;
  /** Ofrece «Abrir para firma presencial» (actas de entrevista). */
  allowInPerson?: boolean;
  /** Vista propia de la respuesta del firmante (F2–F4). Si no se da, se muestra una lista genérica. */
  renderResponse?: (r: SignatureRequestView) => ReactNode;
  responseLabels?: Record<string, string>;
}

const SCAN: Record<SignatureAttachmentView['scanStatus'], { label: string; tone: 'green' | 'red' | 'amber' }> = {
  CLEAN: { label: 'Sin virus', tone: 'green' },
  INFECTED: { label: 'Infectado', tone: 'red' },
  ERROR: { label: 'No se pudo revisar', tone: 'amber' },
};

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-gray-800">{children}</dd>
    </div>
  );
}

export function SignatureRequestCard({ request: r, canManage, isManager, defaultOpen = false, allowInPerson = false, renderResponse, responseLabels }: RequestCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [dialog, setDialog] = useState<'resend' | 'revoke' | 'in-person' | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [quarantine, setQuarantine] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [fileNote, setFileNote] = useState<string | null>(null);

  const link = useSignatureFileLink();
  const integrity = useSignatureIntegrity();
  const reseal = useResealSignatureRequest();

  const status = STATUS_META[r.status];
  const seal = sealLabel(r.status, r.sealStatus, r.timestamped);
  const panelId = `sig-${r.id}`;

  /** Pide el enlace de 10 minutos y lo abre en otra pestaña. */
  const openFile = async (kind: string) => {
    setActionError(null);
    setFileNote(null);
    try {
      const f = await link.mutateAsync({ id: r.id, kind });
      if (f.warning) setFileNote(f.warning);
      const a = document.createElement('a');
      a.href = f.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) {
      setActionError((e as Error).message || 'No se pudo abrir el archivo.');
    }
  };

  const runReseal = async () => {
    setActionError(null);
    try { await reseal.mutateAsync({ id: r.id }); } catch (e) { setActionError((e as Error).message || 'No se pudo reintentar el sellado.'); }
  };

  const runIntegrity = () => { setActionError(null); integrity.mutate({ id: r.id }); };

  const entries = r.response ? responseEntries(r.response, responseLabels) : [];

  return (
    <article className="rounded-xl border border-gray-200 bg-white">
      <h3 className="m-0">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={panelId}
          className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
          {open ? <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" /> : <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />}
          <Chip tone={status.tone} title={status.hint}>{status.label}</Chip>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800">{r.signerName}{r.signerRole ? <span className="font-normal text-gray-500"> · {r.signerRole}</span> : null}</span>
          <span className="hidden shrink-0 text-xs text-gray-400 sm:inline">
            {r.status === 'SIGNED' ? `Firmada ${formatDateSv(r.signedAt)}` : `Enviada ${formatDateSv(r.sentAt ?? r.createdAt)}`}
          </span>
        </button>
      </h3>

      {open && (
        <div id={panelId} className="space-y-4 border-t border-gray-100 px-4 pb-4 pt-3">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            <Item label="Correo">{r.signerEmail}</Item>
            <Item label="Enviada">{r.sentAt ? `${formatDateTimeSv(r.sentAt)}${r.sendCount > 1 ? ` · ${r.sendCount} envíos` : ''}` : isInPersonRequest(r.events) ? 'Firma presencial: no se envió correo con el enlace' : 'El correo no llegó a enviarse'}</Item>
            <Item label="Vence">{formatDateSv(r.expiresAt) || '—'}{r.reminderEnabled && (r.status === 'PENDING' || r.status === 'VIEWED') ? ' · con recordatorio' : ''}</Item>
            {r.viewedAt && <Item label="Abierta por el firmante">{formatDateTimeSv(r.viewedAt)}</Item>}
          </dl>

          {(r.status === 'PENDING' || r.status === 'VIEWED') && (
            <Note tone="info">{status.hint} El enlace es personal: solo sirve con el código que llega a {r.signerEmail}.</Note>
          )}
          {r.status === 'EXPIRED' && <Note tone="warn">Pasó la fecha límite sin firma. Puedes reenviar para dar un plazo nuevo.</Note>}
          {r.status === 'DECLINED' && (
            <Note tone="error"><strong>El firmante decidió no firmar.</strong>{r.declineReason ? <> Motivo: «{r.declineReason}»</> : null}</Note>
          )}
          {r.status === 'REVOKED' && (
            <Note tone="info">
              <strong>Revocada</strong>{r.revokedAt ? ` · ${formatDateTimeSv(r.revokedAt)}` : ''}
              {r.revokedReason ? <span className="block">Motivo: «{r.revokedReason}»</span> : null}
            </Note>
          )}

          {r.status === 'SIGNED' && (
            <div className="space-y-3">
              <Note tone="ok">
                <strong>Firmada por {r.signedName ?? r.signerName}{r.signedRole ? ` (${r.signedRole})` : ''}</strong>
                <span className="block">{formatDateTimeSv(r.signedAt)}{r.signerIp ? ` · desde la dirección IP ${r.signerIp}` : ''}</span>
              </Note>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                {r.verificationCode && (
                  <span className="text-gray-600">Código de verificación:{' '}
                    <a href={verifyPath(r.verificationCode)} target="_blank" rel="noopener noreferrer" className="font-mono font-semibold text-blue-700 hover:underline">{r.verificationCode}</a>
                  </span>
                )}
                {seal && (
                  <span className="inline-flex items-center gap-1.5">
                    {r.sealStatus === 'PENDING' && <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" aria-hidden="true" />}
                    <Chip tone={seal.tone}>{seal.label}</Chip>
                  </span>
                )}
              </div>
              {entries.length > 0 || renderResponse ? (
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Respuesta del firmante</p>
                  {renderResponse ? renderResponse(r) : (
                    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                      {entries.map(([k, v]) => <Item key={k} label={k}>{v}</Item>)}
                    </dl>
                  )}
                </div>
              ) : null}
            </div>
          )}

          {r.attachments.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500"><Paperclip className="h-3.5 w-3.5" aria-hidden="true" /> Adjuntos del firmante</p>
              <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                {r.attachments.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate" title={a.originalName}>{a.originalName}</span>
                    <span className="text-xs text-gray-400">{formatBytes(a.sizeBytes)}</span>
                    <Chip tone={SCAN[a.scanStatus].tone}>{SCAN[a.scanStatus].label}</Chip>
                    {!a.submitted && <Chip tone="gray" title="Se subió pero el firmante no llegó a enviarlo">Sin enviar</Chip>}
                    {a.hasSafeCopy && <button type="button" className={ghostBtn} onClick={() => void openFile(`attachment:${a.id}`)} disabled={link.isPending}>Abrir copia reconstruida</button>}
                    {isManager && (
                      <button type="button" className={ghostBtn} onClick={() => setQuarantine(quarantine === a.id ? null : a.id)} aria-expanded={quarantine === a.id}>Original</button>
                    )}
                    {quarantine === a.id && (
                      <div className="w-full">
                        <Note tone="warn">
                          Es el archivo <strong>tal como lo subió el tercero, sin reconstruir</strong>. Ábrelo solo si lo necesitas como evidencia.
                          <span className="mt-2 flex gap-2">
                            <button type="button" className={dangerBtn} onClick={() => { setQuarantine(null); void openFile(`quarantine:${a.id}`); }}>Abrir el original</button>
                            <button type="button" className={ghostBtn} onClick={() => setQuarantine(null)}>Cancelar</button>
                          </span>
                        </Note>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2" role="group" aria-label="Acciones de la solicitud">
            <button type="button" className={ghostBtn} onClick={() => void openFile('original')} disabled={link.isPending}>
              <FileText className="h-3.5 w-3.5" aria-hidden="true" /> Documento enviado
            </button>
            {r.hasSignedPdf && (
              <button type="button" className={ghostBtn} onClick={() => void openFile('signed')} disabled={link.isPending}>
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> PDF firmado
              </button>
            )}
            {canManage && canResend(r.status) && (
              <button type="button" className={ghostBtn} onClick={() => setDialog('resend')}><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Reenviar</button>
            )}
            {canManage && allowInPerson && canResend(r.status) && (
              <button type="button" className={ghostBtn} onClick={() => setDialog('in-person')}><UserCheck className="h-3.5 w-3.5" aria-hidden="true" /> Abrir para firma presencial</button>
            )}
            {canManage && canReseal(r.status, r.sealStatus) && (
              <button type="button" className={ghostBtn} onClick={() => void runReseal()} disabled={reseal.isPending}>
                <RefreshCw className={`h-3.5 w-3.5 ${reseal.isPending ? 'animate-spin' : ''}`} aria-hidden="true" /> Reintentar sellado
              </button>
            )}
            {canManage && canRevoke(r.status) && <button type="button" className={dangerBtn} onClick={() => setDialog('revoke')}><XCircle className="h-3.5 w-3.5" aria-hidden="true" /> Revocar</button>}
            {isManager && (
              <button type="button" className={ghostBtn} onClick={runIntegrity} disabled={integrity.isPending}>
                {integrity.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />} Verificar integridad
              </button>
            )}
            <button type="button" className={ghostBtn} onClick={() => setShowLog((s) => !s)} aria-expanded={showLog}>
              <History className="h-3.5 w-3.5" aria-hidden="true" /> {showLog ? 'Ocultar bitácora' : `Bitácora (${r.events.length})`}
            </button>
          </div>

          {fileNote && <Note tone="warn">{fileNote}</Note>}
          {actionError && <Note tone="error">{actionError}</Note>}
          {integrity.isError && <Note tone="error">{integrity.error.message || 'No se pudo verificar la integridad.'}</Note>}

          {integrity.data && (
            <div className="space-y-2" aria-live="polite">
              <Note tone={integrity.data.ok ? 'ok' : 'error'}>
                {integrity.data.ok
                  ? <strong>Integridad verificada: nada fue alterado desde que se firmó.</strong>
                  : <><strong>Se detectó una inconsistencia.</strong> Esto se registró en la bitácora. Conserva el expediente tal como está y avisa a quien administra el sistema.</>}
              </Note>
              <ul className="space-y-1 text-xs">
                {integrity.data.checks.map((c) => (
                  <li key={c.name} className="flex items-start gap-2">
                    {c.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label="Correcto" /> : <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" aria-label="Con problemas" />}
                    <span className={c.ok ? 'text-gray-700' : 'font-medium text-red-700'}>{integrityLabel(c.name)}{c.detail ? ` — ${c.detail}` : ''}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {showLog && (
            <ol className="space-y-2 border-l-2 border-gray-100 pl-4 text-xs" aria-label="Bitácora de la solicitud">
              {r.events.length === 0 && <li className="text-gray-400">Sin eventos.</li>}
              {r.events.map((e) => {
                const detail = eventDetail(e);
                return (
                  <li key={e.seq}>
                    <p className="font-medium text-gray-800">{eventLabel(e)}{detail ? <span className="font-normal text-gray-600"> — {detail}</span> : null}</p>
                    <p className="text-[11px] text-gray-400">{formatDateTimeSv(e.at)}{e.ip ? ` · ${e.ip}` : ''}</p>
                  </li>
                );
              })}
            </ol>
          )}
          <p className="flex items-center gap-1 text-[11px] text-gray-400">
            <ExternalLink className="h-3 w-3" aria-hidden="true" /> Los enlaces a archivos duran 10 minutos; se piden de nuevo al abrirlos.
          </p>
        </div>
      )}

      {dialog === 'resend' && <ResendDialog request={r} onClose={() => setDialog(null)} />}
      {dialog === 'in-person' && <InPersonDialog request={r} onClose={() => setDialog(null)} />}
      {dialog === 'revoke' && <RevokeDialog request={r} onClose={() => setDialog(null)} />}
    </article>
  );
}
