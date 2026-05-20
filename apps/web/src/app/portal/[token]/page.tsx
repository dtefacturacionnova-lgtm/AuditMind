'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
  Send, Paperclip, X, CheckCircle2, Clock, AlertTriangle,
  FileText, Upload, ShieldCheck,
} from 'lucide-react';
import { usePortalRequest, useAddPortalMessage, useSubmitPortal, PBC_STATUS_CONFIG } from '@/hooks/usePbc';
import { formatDate, formatRelativeTime } from '@/lib/utils';

// ─── Message bubble ───────────────────────────────────────────────────────────
function MessageBubble({ msg }: {
  msg: {
    id: string;
    senderName: string;
    isAuditor: boolean;
    content: string;
    attachmentUrls: string[];
    createdAt: string;
  };
}) {
  if (msg.isAuditor) {
    return (
      <div className="flex justify-start gap-3">
        <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5">
          A
        </div>
        <div className="max-w-[78%]">
          <p className="text-[10px] text-gray-400 mb-1">Equipo auditor</p>
          <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-2.5 shadow-sm">
            <p className="text-sm text-gray-800 leading-relaxed">{msg.content}</p>
            {Array.isArray(msg.attachmentUrls) && msg.attachmentUrls.length > 0 && (
              <div className="mt-2 space-y-1 border-t border-gray-100 pt-2">
                {(msg.attachmentUrls as string[]).map((url, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-gray-500 text-xs">
                    <Paperclip className="w-3 h-3" />
                    <span>{url}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <p className="text-[10px] text-gray-400 mt-1">{formatRelativeTime(msg.createdAt)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-end gap-3">
      <div className="max-w-[78%]">
        <p className="text-[10px] text-gray-400 mb-1 text-right">Tú</p>
        <div className="bg-blue-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 shadow-sm">
          <p className="text-sm leading-relaxed">{msg.content}</p>
          {Array.isArray(msg.attachmentUrls) && msg.attachmentUrls.length > 0 && (
            <div className="mt-2 space-y-1 border-t border-blue-500 pt-2">
              {(msg.attachmentUrls as string[]).map((url, i) => (
                <div key={i} className="flex items-center gap-1.5 text-blue-100 text-xs">
                  <Paperclip className="w-3 h-3" />
                  <span>{url}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <p className="text-[10px] text-gray-400 mt-1 text-right">{formatRelativeTime(msg.createdAt)}</p>
      </div>
      <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs font-bold shrink-0 mt-0.5">
        U
      </div>
    </div>
  );
}

// ─── File tag ─────────────────────────────────────────────────────────────────
function FileTag({ name, onRemove }: { name: string; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-700 text-xs rounded-full px-2.5 py-1">
      <Paperclip className="w-3 h-3 shrink-0" />
      <span className="max-w-[180px] truncate">{name}</span>
      <button onClick={onRemove} className="hover:text-red-500 transition-colors">
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function PortalPage() {
  const params  = useParams<{ token: string }>();
  const token   = params.token;

  const { data: request, isLoading, error } = usePortalRequest(token);
  const addMessage = useAddPortalMessage(token);
  const submit     = useSubmitPortal(token);

  const [msgText, setMsgText]         = useState('');
  const [files, setFiles]             = useState<string[]>([]);
  const [fileInput, setFileInput]     = useState('');
  const [showSubmit, setShowSubmit]   = useState(false);
  const [submitNotes, setSubmitNotes] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [request?.messages?.length]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 text-sm">Cargando solicitud…</p>
      </div>
    );
  }

  if (error || !request) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
        <AlertTriangle className="w-12 h-12 text-red-300" />
        <h2 className="text-lg font-semibold text-gray-700">Enlace inválido o expirado</h2>
        <p className="text-gray-500 text-sm max-w-sm">
          Este enlace no es válido o ya no está disponible. Contacta al equipo auditor para obtener un nuevo enlace.
        </p>
      </div>
    );
  }

  const st       = PBC_STATUS_CONFIG[request.status];
  const messages = request.messages ?? [];
  const isLocked = request.status === 'ACCEPTED' || request.status === 'REJECTED';
  const isOverdue = !isLocked && new Date(request.dueDate) < new Date();

  const handleSendMessage = async () => {
    if (!msgText.trim()) return;
    await addMessage.mutateAsync({ content: msgText.trim(), attachmentUrls: files.length ? files : undefined });
    setMsgText('');
    setFiles([]);
  };

  const handleAddFile = () => {
    if (!fileInput.trim()) return;
    setFiles(f => [...f, fileInput.trim()]);
    setFileInput('');
  };

  const handleLocalFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files;
    if (!f) return;
    Array.from(f).forEach(file => setFiles(prev => [...prev, file.name]));
    e.target.value = '';
  };

  const handleSubmit = async () => {
    await submit.mutateAsync({ auditeeNotes: submitNotes || undefined, fileUrls: files.length ? files : undefined });
    setShowSubmit(false);
    setSubmitNotes('');
    setFiles([]);
  };

  return (
    <div className="space-y-6">

      {/* ── Header card ── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">
              {request.audit?.title ?? 'Auditoría'}
            </p>
            <h1 className="text-xl font-bold text-gray-900 leading-tight">{request.title}</h1>
            {request.description && (
              <p className="text-sm text-gray-600 mt-2 leading-relaxed">{request.description}</p>
            )}
          </div>
          <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap ${st.bg} ${st.color}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
            {st.label}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-500">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            <span>
              Fecha límite:{' '}
              <span className={isOverdue ? 'text-red-600 font-semibold' : 'text-gray-700 font-medium'}>
                {formatDate(request.dueDate)}
                {isOverdue && ' (vencida)'}
              </span>
            </span>
          </div>
          {request.submittedAt && (
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span>Enviada el <span className="text-gray-700 font-medium">{formatDate(request.submittedAt)}</span></span>
            </div>
          )}
        </div>
      </div>

      {/* ── Accepted / Rejected banners ── */}
      {request.status === 'ACCEPTED' && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-emerald-700">¡Solicitud aceptada!</p>
            <p className="text-xs text-emerald-600 mt-0.5">
              El equipo auditor ha revisado y aceptado tu respuesta el {formatDate(request.acceptedAt!)}. No se requieren acciones adicionales.
            </p>
          </div>
        </div>
      )}

      {request.status === 'REJECTED' && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-700">Solicitud rechazada — se requiere corrección</p>
            {request.rejectionReason && (
              <p className="text-xs text-red-600 mt-0.5">{request.rejectionReason}</p>
            )}
            <p className="text-xs text-red-500 mt-1">Contacta al equipo auditor para más instrucciones.</p>
          </div>
        </div>
      )}

      {/* ── Chat thread ── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700">Conversación</p>
          <span className="text-xs text-gray-400">{messages.length} mensaje{messages.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Messages */}
        <div className="p-5 space-y-4 overflow-y-auto" style={{ maxHeight: 480 }}>
          {messages.length === 0 ? (
            <div className="py-12 text-center">
              <FileText className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-gray-400">No hay mensajes aún</p>
              <p className="text-xs text-gray-300 mt-1">El equipo auditor te enviará instrucciones aquí</p>
            </div>
          ) : (
            messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        {!isLocked && (
          <div className="border-t border-gray-100 p-4 space-y-3">
            {/* Files attached */}
            {files.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {files.map((f, i) => (
                  <FileTag key={i} name={f} onRemove={() => setFiles(prev => prev.filter((_, j) => j !== i))} />
                ))}
              </div>
            )}

            {/* Message row */}
            <div className="flex gap-2 items-end">
              <div className="flex-1 border border-gray-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
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
                  placeholder="Escribe tu mensaje... (Enter para enviar, Shift+Enter nueva línea)"
                  className="w-full px-3 py-2.5 text-sm resize-none focus:outline-none"
                />
                {/* File actions bar */}
                <div className="flex items-center gap-1 px-3 py-1.5 border-t border-gray-100 bg-gray-50">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    title="Adjuntar archivo"
                    className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>
                  <input ref={fileRef} type="file" multiple className="hidden" onChange={handleLocalFile} />
                  <input
                    type="text"
                    value={fileInput}
                    onChange={e => setFileInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddFile(); }}}
                    placeholder="o pega una URL de archivo y presiona Enter…"
                    className="flex-1 text-xs bg-transparent focus:outline-none text-gray-500 placeholder:text-gray-400"
                  />
                </div>
              </div>
              <button
                onClick={handleSendMessage}
                disabled={!msgText.trim() || addMessage.isPending}
                className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Submit response ── */}
      {!isLocked && request.status !== 'SUBMITTED' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-start gap-3 mb-4">
            <Upload className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-gray-800">Enviar respuesta formal</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Una vez enviada, el equipo auditor recibirá una notificación para revisar tu respuesta.
              </p>
            </div>
          </div>

          {!showSubmit ? (
            <button
              onClick={() => setShowSubmit(true)}
              className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors"
            >
              Preparar envío
            </button>
          ) : (
            <div className="space-y-3">
              {/* Additional files */}
              <div>
                <p className="text-xs font-medium text-gray-600 mb-2">Archivos adjuntos</p>
                <div
                  onClick={() => fileRef.current?.click()}
                  className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition-colors"
                >
                  <Paperclip className="w-6 h-6 text-gray-300 mx-auto mb-2" />
                  <p className="text-xs text-gray-500">Haz clic para adjuntar archivos</p>
                  <p className="text-[10px] text-gray-400 mt-1">Los nombres de archivo quedarán registrados</p>
                </div>
                {files.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {files.map((f, i) => (
                      <FileTag key={i} name={f} onRemove={() => setFiles(prev => prev.filter((_, j) => j !== i))} />
                    ))}
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1">Notas de envío (opcional)</p>
                <textarea
                  rows={3}
                  value={submitNotes}
                  onChange={e => setSubmitNotes(e.target.value)}
                  placeholder="Agrega comentarios adicionales sobre tu respuesta…"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowSubmit(false)}
                  className="flex-1 py-2.5 border border-gray-200 text-gray-600 text-sm rounded-xl hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submit.isPending}
                  className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {submit.isPending ? 'Enviando…' : 'Enviar respuesta'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Already submitted ── */}
      {request.status === 'SUBMITTED' && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-blue-700">Respuesta enviada</p>
            <p className="text-xs text-blue-600 mt-0.5">
              Tu respuesta fue enviada el {request.submittedAt ? formatDate(request.submittedAt) : '—'}. El equipo auditor la está revisando.
              Puedes seguir enviando mensajes si necesitas agregar información.
            </p>
          </div>
        </div>
      )}

    </div>
  );
}
