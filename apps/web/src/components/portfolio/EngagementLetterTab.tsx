'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FileText, PenTool, CheckCircle2, AlertTriangle } from 'lucide-react';
import {
  useCreateEngagementLetter, useUpdateEngagementLetter, useSignEngagementLetter,
  ENGAGEMENT_LETTER_STATUS_CONFIG, CLIENT_KEY, ClientDetail,
} from '@/hooks/usePortfolio';
import { useOnSignatureStatusChange, useSignatureRequests } from '@/hooks/useSignatureRequests';
import { SignatureSection } from '@/components/signatures/SignatureSection';
import { isActive } from '@/lib/signature/internal';
import { formatDate } from '@/lib/utils';

const cls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400';

function SignModal({ letterId, onClose }: { letterId: string; onClose: () => void }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const sign = useSignEngagementLetter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await sign.mutateAsync({ id: letterId, data: { signedByClientName: name, signedByClientRole: role, fileUrl: fileUrl || undefined } });
      onClose();
    } catch { /* shown below */ }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-1">Registrar firma manual</h2>
        <p className="text-xs text-gray-400 mb-4">
          Úsalo cuando el cliente firmó la carta en papel. Al confirmar, el cliente pasa a estado Activo y ya podrá registrar encargos.
          Si hay una solicitud de firma por enlace vigente, se revoca.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">Nombre de quien firma *</label>
            <input required value={name} onChange={e => setName(e.target.value)} className={cls} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">Cargo *</label>
            <input required value={role} onChange={e => setRole(e.target.value)} placeholder="Representante Legal" className={cls} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">URL del PDF firmado (opcional)</label>
            <input value={fileUrl} onChange={e => setFileUrl(e.target.value)} className={cls} />
          </div>

          {sign.isError && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
              {(sign.error as Error)?.message ?? 'Error al firmar'}
            </p>
          )}

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 border border-gray-200 text-sm font-medium rounded-xl text-gray-600 hover:bg-gray-50">
              Cancelar
            </button>
            <button type="submit" disabled={sign.isPending}
              className="flex-1 py-2 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 disabled:opacity-60">
              {sign.isPending ? 'Firmando…' : 'Confirmar firma'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function EngagementLetterTab({ client }: { client: ClientDetail }) {
  const [content, setContent] = useState<string | null>(null);
  const [showSign, setShowSign] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);

  const createLetter = useCreateEngagementLetter();
  const updateLetter = useUpdateEngagementLetter();
  const qc = useQueryClient();

  const pendingProposal = client.proposals.find(p => p.status === 'ACCEPTED' && !p.engagementLetter);
  const letter = client.engagementLetters[0];

  // Firma electrónica por enlace: ¿hay una solicitud vigente? (cambiar el texto la revoca) y, cuando cambia el estado de la
  // más reciente (el cliente firmó, rechazó, se revocó…), se recarga la carta para que su estado y su PDF se vean al día.
  const { data: requests } = useSignatureRequests('ENGAGEMENT_LETTER', letter?.id);
  const hasActiveRequest = !!requests?.some(r => isActive(r.status));
  useOnSignatureStatusChange('ENGAGEMENT_LETTER', letter?.id, () => { void qc.invalidateQueries({ queryKey: [CLIENT_KEY, client.id] }); });

  if (!letter) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400 max-w-md mx-auto text-center">
        <FileText className="w-10 h-10 mb-3 opacity-40" />
        {pendingProposal ? (
          <>
            <p className="text-sm font-medium text-gray-600">Propuesta aceptada — emita la carta de compromiso</p>
            <button
              onClick={() => createLetter.mutate({ proposalId: pendingProposal.id })}
              disabled={createLetter.isPending}
              className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700 disabled:opacity-60"
            >
              {createLetter.isPending ? 'Generando…' : 'Emitir Carta de Compromiso (NIA 210)'}
            </button>
            {createLetter.isError && (
              <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mt-3">
                {(createLetter.error as Error)?.message}
              </p>
            )}
          </>
        ) : (
          <>
            <AlertTriangle className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-sm font-medium text-gray-600">Aún no hay carta de compromiso</p>
            <p className="text-xs mt-1">Se emite automáticamente cuando una propuesta es aceptada por el cliente.</p>
          </>
        )}
      </div>
    );
  }

  const cfg = ENGAGEMENT_LETTER_STATUS_CONFIG[letter.status];
  // Una carta rechazada también se puede editar: al guardar vuelve a borrador y puede enviarse de nuevo.
  const editable = letter.status !== 'SIGNED';
  const canSignManually = letter.status === 'DRAFT' || letter.status === 'SENT';
  const value = content ?? letter.content;
  const dirty = content !== null && content !== letter.content;

  const handleSave = async () => {
    // Si hay una solicitud de firma vigente, guardar un texto distinto la revoca: se avisa antes.
    if (hasActiveRequest && dirty && !confirmSave) { setConfirmSave(true); return; }
    setConfirmSave(false);
    try {
      await updateLetter.mutateAsync({ id: letter.id, data: { content: value } });
      // El servidor pudo revocar la solicitud de firma vigente: el panel debe mostrarlo ya, no a los 30 s.
      void qc.invalidateQueries({ queryKey: ['signature-requests'] });
    } catch { /* shown below */ }
  };

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Carta de Compromiso {letter.year}</h3>
        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
      </div>

      {letter.status === 'SIGNED' && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 className="w-4 h-4" />
          Firmada por {letter.signedByClientName} ({letter.signedByClientRole}) el {letter.signedAt ? formatDate(letter.signedAt) : '—'}
          {letter.fileUrl && (
            <a href={letter.fileUrl} target="_blank" rel="noreferrer" className="ml-auto underline">Ver PDF firmado</a>
          )}
        </div>
      )}

      {letter.status === 'DECLINED' && (
        <div role="alert" className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">El cliente rechazó la carta.</p>
            {letter.declineReason && <p className="mt-0.5">Motivo: «{letter.declineReason}»</p>}
            <p className="mt-1 text-xs text-red-600">Edita el texto y guarda para devolverla a borrador y enviarla de nuevo.</p>
          </div>
        </div>
      )}

      <textarea
        rows={18}
        disabled={!editable}
        value={value}
        onChange={e => { setContent(e.target.value); setConfirmSave(false); }}
        className={`${cls} font-mono text-xs leading-relaxed`}
        aria-label="Texto de la carta de compromiso"
      />

      {updateLetter.isError && (
        <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
          {(updateLetter.error as Error)?.message ?? 'Error al guardar'}
        </p>
      )}

      {confirmSave && (
        <div role="alert" className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">Hay una solicitud de firma vigente.</p>
          <p className="mt-0.5 text-xs">Si guardas un texto distinto, la solicitud se revoca (su enlace deja de funcionar) y la carta vuelve a borrador: tendrás que enviarla de nuevo para firma.</p>
          <div className="mt-2 flex gap-2">
            <button onClick={handleSave} disabled={updateLetter.isPending}
              className="px-3 py-1.5 bg-amber-600 text-white text-xs font-medium rounded-lg hover:bg-amber-700 disabled:opacity-60">
              Guardar y revocar la solicitud
            </button>
            <button onClick={() => setConfirmSave(false)} className="px-3 py-1.5 border border-amber-300 text-amber-800 text-xs font-medium rounded-lg hover:bg-amber-100">Volver</button>
          </div>
        </div>
      )}

      {editable && !confirmSave && (
        <div className="flex gap-2">
          <button onClick={handleSave} disabled={updateLetter.isPending}
            className="px-4 py-2 border border-gray-200 text-sm font-medium rounded-xl text-gray-700 hover:bg-gray-50 disabled:opacity-60">
            {updateLetter.isPending ? 'Guardando…' : 'Guardar cambios'}
          </button>
          {canSignManually && (
            <button onClick={() => setShowSign(true)} title="Para una carta firmada en papel"
              className="flex items-center gap-1.5 px-4 py-2 border border-emerald-200 text-emerald-700 text-sm font-medium rounded-xl hover:bg-emerald-50">
              <PenTool className="w-4 h-4" /> Registrar firma manual
            </button>
          )}
        </div>
      )}

      <SignatureSection
        documentType="ENGAGEMENT_LETTER"
        targetId={letter.id}
        documentLabel="Carta de compromiso"
        documentTitle={`Carta de compromiso ${letter.year} — ${client.legalName}`}
        defaultSigner={{ name: client.contactName ?? undefined, email: client.contactEmail ?? undefined }}
        canSend={letter.status !== 'SIGNED'}
        sendLabel="Enviar para firma"
        sendDisabledReason={
          dirty ? 'Guarda los cambios del texto antes de enviarla: el firmante verá el texto guardado.'
          : letter.status === 'DECLINED' ? 'El cliente rechazó la carta. Edita el texto y guarda para devolverla a borrador y poder enviarla de nuevo.'
          : null
        }
        emptyHint="Todavía no se ha enviado la carta para firma electrónica."
      />

      {showSign && <SignModal letterId={letter.id} onClose={() => setShowSign(false)} />}
    </div>
  );
}
