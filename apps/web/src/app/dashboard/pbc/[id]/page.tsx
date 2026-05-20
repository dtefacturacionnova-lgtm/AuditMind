'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Copy, Check, ChevronLeft, Send, RefreshCw, CheckCircle2,
  XCircle, ExternalLink, Paperclip, Clock, User,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import {
  usePbcRequest, useAddAuditorMessage, useReviewPbc, useRegenerateToken,
  PBC_STATUS_CONFIG,
} from '@/hooks/usePbc';
import { formatDate, formatRelativeTime } from '@/lib/utils';

// ─── Chat message bubble ──────────────────────────────────────────────────────
function MessageBubble({ msg }: {
  msg: {
    id: string;
    senderName: string;
    senderEmail: string;
    isAuditor: boolean;
    content: string;
    attachmentUrls: string[];
    createdAt: string;
  };
}) {
  if (msg.isAuditor) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%]">
          <div className="bg-blue-600 text-white rounded-2xl rounded-br-sm px-4 py-2.5 shadow-sm">
            <p className="text-sm leading-relaxed">{msg.content}</p>
            {msg.attachmentUrls?.length > 0 && (
              <div className="mt-2 space-y-1">
                {(msg.attachmentUrls as string[]).map((url, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-blue-100 text-xs">
                    <Paperclip className="w-3 h-3" />
                    <span>{url}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <p className="text-[10px] text-gray-400 mt-1 text-right">
            {msg.senderName} · {formatRelativeTime(msg.createdAt)}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[75%]">
        <div className="bg-white border border-gray-200 text-gray-800 rounded-2xl rounded-bl-sm px-4 py-2.5 shadow-sm">
          <p className="text-sm leading-relaxed">{msg.content}</p>
          {msg.attachmentUrls?.length > 0 && (
            <div className="mt-2 space-y-1">
              {(msg.attachmentUrls as string[]).map((url, i) => (
                <div key={i} className="flex items-center gap-1.5 text-gray-500 text-xs">
                  <Paperclip className="w-3 h-3" />
                  <span>{url}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <p className="text-[10px] text-gray-400 mt-1">
          {msg.senderName} · {formatRelativeTime(msg.createdAt)}
        </p>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function PbcDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: request, isLoading } = usePbcRequest(params.id);

  const addMessage    = useAddAuditorMessage();
  const review        = useReviewPbc();
  const regenerate    = useRegenerateToken();

  const [msgText, setMsgText]         = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [showReject, setShowReject]   = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [request?.messages?.length]);

  const copyPortalLink = () => {
    if (!request) return;
    const url = `${window.location.origin}/portal/${request.portalToken}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2500);
    });
  };

  const handleSendMessage = async () => {
    if (!msgText.trim()) return;
    await addMessage.mutateAsync({ id: params.id, content: msgText.trim() });
    setMsgText('');
  };

  const handleAccept = async () => {
    await review.mutateAsync({ id: params.id, status: 'ACCEPTED', notes: reviewNotes || undefined });
    setReviewNotes('');
  };

  const handleReject = async () => {
    if (!reviewNotes.trim()) return;
    await review.mutateAsync({ id: params.id, status: 'REJECTED', notes: reviewNotes });
    setReviewNotes('');
    setShowReject(false);
  };

  const handleRegenerate = async () => {
    if (!confirm('¿Regenerar el token? El enlace anterior dejará de funcionar.')) return;
    await regenerate.mutateAsync(params.id);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <Header breadcrumbs={[{ label: 'Portal PBC', href: '/dashboard/pbc' }, { label: '...' }]} />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="flex flex-col h-full">
        <Header breadcrumbs={[{ label: 'Portal PBC', href: '/dashboard/pbc' }, { label: 'No encontrado' }]} />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-500">Solicitud no encontrada.</p>
        </div>
      </div>
    );
  }

  const st = PBC_STATUS_CONFIG[request.status];
  const messages = request.messages ?? [];
  const isOverdue = request.status !== 'ACCEPTED' && request.status !== 'REJECTED' && new Date(request.dueDate) < new Date();
  const canReview = request.status === 'SUBMITTED';

  return (
    <div className="flex flex-col h-full">
      <Header
        breadcrumbs={[
          { label: 'Portal PBC', href: '/dashboard/pbc' },
          { label: request.title },
        ]}
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto grid grid-cols-3 gap-6">

          {/* ── Chat (left 2/3) ── */}
          <div className="col-span-2 flex flex-col gap-4">

            {/* Status banner */}
            {request.status === 'ACCEPTED' && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <p className="text-sm text-emerald-700 font-medium">Solicitud aceptada el {formatDate(request.acceptedAt!)}</p>
              </div>
            )}
            {request.status === 'REJECTED' && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2">
                <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-red-700 font-medium">Solicitud rechazada</p>
                  {request.rejectionReason && (
                    <p className="text-xs text-red-600 mt-0.5">{request.rejectionReason}</p>
                  )}
                </div>
              </div>
            )}
            {isOverdue && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-red-500 shrink-0" />
                <p className="text-sm text-red-700 font-medium">Vencida — fecha límite: {formatDate(request.dueDate)}</p>
              </div>
            )}

            {/* Messages */}
            <div className="bg-white rounded-xl border border-gray-200 flex flex-col" style={{ minHeight: 400 }}>
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">Conversación</p>
                <span className="text-xs text-gray-400">{messages.length} mensaje{messages.length !== 1 ? 's' : ''}</span>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ maxHeight: 400 }}>
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full py-8 text-center">
                    <User className="w-8 h-8 text-gray-200 mb-2" />
                    <p className="text-sm text-gray-400">No hay mensajes aún</p>
                    <p className="text-xs text-gray-300 mt-1">Escribe un mensaje al auditado</p>
                  </div>
                ) : (
                  messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message input */}
              {request.status !== 'ACCEPTED' && (
                <div className="border-t border-gray-100 p-3 flex gap-2">
                  <textarea
                    rows={2}
                    value={msgText}
                    onChange={e => setMsgText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder="Escribe un mensaje al auditado... (Enter para enviar)"
                    className="flex-1 resize-none text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!msgText.trim() || addMessage.isPending}
                    className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Review actions */}
            {canReview && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-sm font-medium text-gray-700 mb-3">Revisar respuesta del auditado</p>
                <textarea
                  rows={2}
                  value={reviewNotes}
                  onChange={e => setReviewNotes(e.target.value)}
                  placeholder="Comentarios opcionales (requerido para rechazar)..."
                  className="w-full resize-none text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleAccept}
                    disabled={review.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-60"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Aceptar respuesta
                  </button>
                  <button
                    onClick={() => setShowReject(!showReject)}
                    className="flex items-center gap-2 px-4 py-2 border border-red-200 text-red-600 text-sm rounded-lg hover:bg-red-50"
                  >
                    <XCircle className="w-4 h-4" />
                    Rechazar
                  </button>
                </div>
                {showReject && (
                  <div className="mt-3">
                    <p className="text-xs text-gray-500 mb-2">Indica el motivo del rechazo (obligatorio):</p>
                    <button
                      onClick={handleReject}
                      disabled={!reviewNotes.trim() || review.isPending}
                      className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-60"
                    >
                      Confirmar rechazo
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Sidebar (right 1/3) ── */}
          <div className="col-span-1 space-y-4">

            {/* Status + meta */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${st.bg} ${st.color}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                  {st.label}
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">Auditado</span>
                  <span className="text-gray-700 font-medium text-right max-w-[60%] truncate">
                    {request.requestedToName ?? request.requestedToEmail}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Email</span>
                  <span className="text-gray-600 text-right max-w-[60%] truncate">{request.requestedToEmail}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Fecha límite</span>
                  <span className={`font-medium ${isOverdue ? 'text-red-600' : 'text-gray-700'}`}>
                    {formatDate(request.dueDate)}
                  </span>
                </div>
                {request.submittedAt && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Enviada</span>
                    <span className="text-gray-700">{formatDate(request.submittedAt)}</span>
                  </div>
                )}
                {request.audit && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Auditoría</span>
                    <span className="text-gray-700 text-right max-w-[60%] line-clamp-2">{request.audit.title}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Portal link */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Enlace del portal</p>
              <p className="text-xs text-gray-500 leading-relaxed">
                Comparte este enlace con el auditado. No requiere contraseña.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={copyPortalLink}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 text-blue-700 text-xs font-medium rounded-lg hover:bg-blue-100 transition-colors"
                >
                  {copiedToken
                    ? <><Check className="w-3.5 h-3.5" /> Copiado</>
                    : <><Copy className="w-3.5 h-3.5" /> Copiar enlace</>}
                </button>
                <a
                  href={`/portal/${request.portalToken}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:text-blue-600 hover:border-blue-200 transition-colors"
                  title="Abrir portal"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
              <button
                onClick={handleRegenerate}
                disabled={regenerate.isPending}
                className="w-full flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors py-1"
              >
                <RefreshCw className="w-3 h-3" />
                Regenerar token
              </button>
            </div>

            {/* Description */}
            {request.description && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Descripción</p>
                <p className="text-sm text-gray-600 leading-relaxed">{request.description}</p>
              </div>
            )}

            {/* File URLs */}
            {Array.isArray(request.fileUrls) && (request.fileUrls as string[]).length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Archivos recibidos</p>
                <ul className="space-y-1">
                  {(request.fileUrls as string[]).map((url, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs text-gray-600">
                      <Paperclip className="w-3 h-3 text-gray-400 shrink-0" />
                      <span className="truncate">{url}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
