'use client';

import { useState } from 'react';
import { FileSignature, Sparkles, Plus, Trash2, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import {
  useCreateProposal, useUpdateProposal, useGenerateProposalDraft,
  useSendProposal, useAcceptProposal, useRejectProposal,
  PROPOSAL_STATUS_CONFIG, ACCEPTANCE_RATING_CONFIG,
  ClientDetail, ProposalTeamMember, CreateProposalData,
} from '@/hooks/usePortfolio';
const cls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400';
const label = 'text-xs font-medium text-gray-600';

function TeamEditor({ team, onChange, disabled }: {
  team: ProposalTeamMember[]; onChange: (t: ProposalTeamMember[]) => void; disabled?: boolean;
}) {
  const update = (i: number, patch: Partial<ProposalTeamMember>) =>
    onChange(team.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  const remove = (i: number) => onChange(team.filter((_, idx) => idx !== i));
  const add = () => onChange([...team, { name: '', role: '', hours: 0 }]);

  return (
    <div className="space-y-2">
      <label className={label}>Equipo propuesto</label>
      {team.map((m, i) => (
        <div key={i} className="flex gap-2">
          <input placeholder="Nombre" disabled={disabled} value={m.name}
            onChange={e => update(i, { name: e.target.value })} className={`${cls} flex-[2]`} />
          <input placeholder="Rol" disabled={disabled} value={m.role ?? ''}
            onChange={e => update(i, { role: e.target.value })} className={`${cls} flex-[2]`} />
          <input type="number" placeholder="Horas" disabled={disabled} value={m.hours ?? ''}
            onChange={e => update(i, { hours: +e.target.value || 0 })} className={`${cls} flex-1`} />
          {!disabled && (
            <button type="button" onClick={() => remove(i)} className="px-2 text-gray-400 hover:text-red-500">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
      {!disabled && (
        <button type="button" onClick={add} className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800">
          <Plus className="w-3.5 h-3.5" /> Agregar integrante
        </button>
      )}
    </div>
  );
}

// ─── Crear propuesta ────────────────────────────────────────────────────────
function CreateProposalForm({ clientId }: { clientId: string }) {
  const [form, setForm] = useState<CreateProposalData>({ clientId, feeCurrency: 'USD' });
  const [team, setTeam] = useState<ProposalTeamMember[]>([]);
  const create = useCreateProposal();

  const set = (patch: Partial<CreateProposalData>) => setForm(p => ({ ...p, ...patch }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await create.mutateAsync({ ...form, teamJson: team.filter(m => m.name.trim()) });
    } catch { /* shown below */ }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
      <div className="flex flex-col gap-1">
        <label className={label}>Alcance del encargo</label>
        <textarea rows={3} value={form.scope ?? ''} onChange={e => set({ scope: e.target.value })}
          placeholder="Auditoría de estados financieros de propósito general…" className={cls} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className={label}>Inicio del período fiscal</label>
          <input type="date" value={form.fiscalPeriodStart ?? ''} onChange={e => set({ fiscalPeriodStart: e.target.value })} className={cls} />
        </div>
        <div className="flex flex-col gap-1">
          <label className={label}>Fin del período fiscal</label>
          <input type="date" value={form.fiscalPeriodEnd ?? ''} onChange={e => set({ fiscalPeriodEnd: e.target.value })} className={cls} />
        </div>
        <div className="flex flex-col gap-1">
          <label className={label}>Honorarios</label>
          <input type="number" min={0} value={form.feeAmount ?? ''} onChange={e => set({ feeAmount: +e.target.value || undefined })} className={cls} />
        </div>
        <div className="flex flex-col gap-1">
          <label className={label}>Moneda</label>
          <input maxLength={3} value={form.feeCurrency ?? 'USD'} onChange={e => set({ feeCurrency: e.target.value.toUpperCase() })} className={cls} />
        </div>
      </div>

      <TeamEditor team={team} onChange={setTeam} />

      {create.isError && (
        <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
          {(create.error as Error)?.message ?? 'Error al crear la propuesta'}
        </p>
      )}

      <button type="submit" disabled={create.isPending}
        className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-60">
        <FileSignature className="w-4 h-4" /> {create.isPending ? 'Creando…' : 'Crear propuesta'}
      </button>
    </form>
  );
}

// ─── Gestión de la propuesta activa ─────────────────────────────────────────
function ManageProposal({ proposal }: { proposal: ClientDetail['proposals'][number] }) {
  const [form, setForm] = useState({
    scope: proposal.scope ?? '',
    fiscalPeriodStart: proposal.fiscalPeriodStart?.slice(0, 10) ?? '',
    fiscalPeriodEnd: proposal.fiscalPeriodEnd?.slice(0, 10) ?? '',
    feeAmount: proposal.feeAmount != null ? Number(proposal.feeAmount) : undefined,
    feeCurrency: proposal.feeCurrency,
  });
  const [team, setTeam] = useState<ProposalTeamMember[]>(proposal.teamJson ?? []);
  const [finalContent, setFinalContent] = useState(proposal.finalContent ?? proposal.aiDraftContent ?? '');

  const update = useUpdateProposal();
  const generateDraft = useGenerateProposalDraft();
  const send = useSendProposal();
  const accept = useAcceptProposal();
  const reject = useRejectProposal();

  const editable = proposal.status === 'DRAFT' || proposal.status === 'SENT';
  const cfg = PROPOSAL_STATUS_CONFIG[proposal.status];

  const set = (patch: Partial<typeof form>) => setForm(p => ({ ...p, ...patch }));

  const handleSave = async () => {
    try {
      await update.mutateAsync({
        id: proposal.id,
        data: { ...form, teamJson: team.filter(m => m.name.trim()), finalContent },
      });
    } catch { /* shown below */ }
  };

  const handleGenerate = async () => {
    try {
      const result = await generateDraft.mutateAsync(proposal.id);
      setFinalContent(result.aiDraftContent ?? '');
    } catch { /* shown below */ }
  };

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">Propuesta {proposal.year}</h3>
          {proposal.acceptanceCheck && (
            <p className="text-xs text-gray-400">
              Radar {proposal.acceptanceCheck.year}:{' '}
              <span className={ACCEPTANCE_RATING_CONFIG[proposal.acceptanceCheck.overallResult].color}>
                {ACCEPTANCE_RATING_CONFIG[proposal.acceptanceCheck.overallResult].label}
              </span>
            </p>
          )}
        </div>
        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
      </div>

      <div className="flex flex-col gap-1">
        <label className={label}>Alcance del encargo</label>
        <textarea rows={3} disabled={!editable} value={form.scope} onChange={e => set({ scope: e.target.value })} className={cls} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className={label}>Inicio del período</label>
          <input type="date" disabled={!editable} value={form.fiscalPeriodStart} onChange={e => set({ fiscalPeriodStart: e.target.value })} className={cls} />
        </div>
        <div className="flex flex-col gap-1">
          <label className={label}>Fin del período</label>
          <input type="date" disabled={!editable} value={form.fiscalPeriodEnd} onChange={e => set({ fiscalPeriodEnd: e.target.value })} className={cls} />
        </div>
        <div className="flex flex-col gap-1">
          <label className={label}>Honorarios</label>
          <input type="number" min={0} disabled={!editable} value={form.feeAmount ?? ''} onChange={e => set({ feeAmount: +e.target.value || undefined })} className={cls} />
        </div>
        <div className="flex flex-col gap-1">
          <label className={label}>Moneda</label>
          <input maxLength={3} disabled={!editable} value={form.feeCurrency} onChange={e => set({ feeCurrency: e.target.value.toUpperCase() })} className={cls} />
        </div>
      </div>

      <TeamEditor team={team} onChange={setTeam} disabled={!editable} />

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <label className={label}>Texto de la propuesta</label>
          {editable && (
            <button type="button" onClick={handleGenerate} disabled={generateDraft.isPending}
              className="flex items-center gap-1 text-xs font-medium text-violet-600 hover:text-violet-800 disabled:opacity-50">
              <Sparkles className="w-3.5 h-3.5" /> {generateDraft.isPending ? 'Generando…' : 'Generar borrador con IA'}
            </button>
          )}
        </div>
        <textarea rows={10} disabled={!editable} value={finalContent} onChange={e => setFinalContent(e.target.value)}
          placeholder="Genere un borrador con IA o redacte el texto final de la propuesta…"
          className={`${cls} font-mono text-xs`} />
        {generateDraft.data?.usedAI === false && (
          <p className="text-xs text-amber-600">Se usó una plantilla de respaldo (IA no disponible) — revise y complete el texto.</p>
        )}
      </div>

      {(update.isError || send.isError || accept.isError || reject.isError) && (
        <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
          {((update.error ?? send.error ?? accept.error ?? reject.error) as Error)?.message ?? 'Error al procesar'}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {editable && (
          <button onClick={handleSave} disabled={update.isPending}
            className="px-4 py-2 border border-gray-200 text-sm font-medium rounded-xl text-gray-700 hover:bg-gray-50 disabled:opacity-60">
            {update.isPending ? 'Guardando…' : 'Guardar cambios'}
          </button>
        )}
        {proposal.status === 'DRAFT' && (
          <button onClick={() => send.mutate(proposal.id)} disabled={send.isPending}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-60">
            {send.isPending ? 'Enviando…' : 'Enviar propuesta'}
          </button>
        )}
        {proposal.status === 'SENT' && (
          <>
            <button onClick={() => accept.mutate(proposal.id)} disabled={accept.isPending}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 disabled:opacity-60">
              <CheckCircle2 className="w-4 h-4" /> Registrar aceptación
            </button>
            <button onClick={() => reject.mutate(proposal.id)} disabled={reject.isPending}
              className="flex items-center gap-1.5 px-4 py-2 border border-red-200 text-red-600 text-sm font-medium rounded-xl hover:bg-red-50 disabled:opacity-60">
              <XCircle className="w-4 h-4" /> Registrar rechazo
            </button>
          </>
        )}
        {proposal.status === 'ACCEPTED' && (
          <p className="text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">
            Propuesta aceptada — continúe en la pestaña <strong>Carta de Compromiso</strong> para emitirla.
          </p>
        )}
      </div>
    </div>
  );
}

export function ProposalTab({ client }: { client: ClientDetail }) {
  const currentYear = new Date().getFullYear();
  const check = client.acceptanceChecks.find(c => c.year === currentYear);
  const gateOk = !!check && (check.overallResult === 'GREEN' || check.overallResult === 'YELLOW');

  const latest = client.proposals[0];
  const canCreateNew = !latest || latest.status === 'REJECTED' || latest.status === 'EXPIRED';

  if (!gateOk) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400 max-w-md mx-auto text-center">
        <AlertTriangle className="w-10 h-10 mb-3 opacity-40" />
        <p className="text-sm font-medium text-gray-600">Radar de Aceptación pendiente</p>
        <p className="text-xs mt-1">
          Debe decidir el Radar de Aceptación {currentYear} en Verde o Amarillo en la pestaña
          {' '}<strong>Radar de Aceptación</strong> antes de emitir una propuesta.
        </p>
      </div>
    );
  }

  return (
    <div>
      {latest && (
        <div className="max-w-2xl mb-6">
          <ManageProposal key={latest.id} proposal={latest} />
        </div>
      )}
      {canCreateNew && (
        <div className={latest ? 'pt-6 border-t border-gray-100' : ''}>
          {latest && <p className="text-xs text-gray-400 mb-3">La propuesta anterior fue rechazada. Puede emitir una nueva:</p>}
          <CreateProposalForm clientId={client.id} />
        </div>
      )}
    </div>
  );
}
