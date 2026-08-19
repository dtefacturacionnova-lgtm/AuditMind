'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Briefcase, Plus, BadgeCheck, XCircle, ExternalLink, ShieldAlert,
} from 'lucide-react';
import { useUser } from '@/hooks/useUser';
import {
  useCreateEngagement, useApproveEngagement, useCancelEngagement,
  ENGAGEMENT_STATUS_CONFIG, ClientDetail, CreateEngagementData,
} from '@/hooks/usePortfolio';
import { formatDateUTC } from '@/lib/utils';

const cls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const label = 'text-xs font-medium text-gray-600';

function NewEngagementModal({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const currentYear = new Date().getFullYear();
  const [form, setForm] = useState<CreateEngagementData>({
    clientId, fiscalYear: currentYear, fiscalYearEndDate: `${currentYear}-12-31`,
  });
  const create = useCreateEngagement();

  const set = (patch: Partial<CreateEngagementData>) => setForm(p => ({ ...p, ...patch }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await create.mutateAsync(form);
      onClose();
    } catch { /* shown below */ }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Nuevo Encargo</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex flex-col gap-1">
            <label className={label}>Año fiscal *</label>
            <input required type="number" value={form.fiscalYear}
              onChange={e => set({ fiscalYear: +e.target.value })} className={cls} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={label}>Fecha de cierre fiscal *</label>
            <input required type="date" value={form.fiscalYearEndDate}
              onChange={e => set({ fiscalYearEndDate: e.target.value })} className={cls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className={label}>Inicio planeado</label>
              <input type="date" value={form.plannedStartDate ?? ''} onChange={e => set({ plannedStartDate: e.target.value })} className={cls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className={label}>Fin planeado</label>
              <input type="date" value={form.plannedEndDate ?? ''} onChange={e => set({ plannedEndDate: e.target.value })} className={cls} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className={label}>Notas</label>
            <textarea rows={2} value={form.notes ?? ''} onChange={e => set({ notes: e.target.value })} className={cls} />
          </div>

          {create.isError && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
              {(create.error as Error)?.message ?? 'Error al crear el encargo'}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 border border-gray-200 text-sm font-medium rounded-xl text-gray-600 hover:bg-gray-50">
              Cancelar
            </button>
            <button type="submit" disabled={create.isPending}
              className="flex-1 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-60">
              {create.isPending ? 'Creando…' : 'Crear encargo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ApproveConfirm({ engagementId, clientName, fiscalYear, onClose }: {
  engagementId: string; clientName: string; fiscalYear: number; onClose: () => void;
}) {
  const approve = useApproveEngagement();

  const handleApprove = async () => {
    try {
      await approve.mutateAsync(engagementId);
      onClose();
    } catch { /* shown below */ }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6">
        <div className="flex items-center gap-2 text-amber-600 mb-2">
          <ShieldAlert className="w-5 h-5" />
          <h2 className="text-base font-semibold text-gray-800">Aprobar encargo — acción irreversible</h2>
        </div>
        <p className="text-sm text-gray-600">
          Esto creará una <strong>auditoría real</strong> para {clientName} — ejercicio {fiscalYear} — y no puede deshacerse
          desde Cartera. El encargo quedará vinculado permanentemente a esa auditoría.
        </p>
        {approve.isError && (
          <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mt-3">
            {(approve.error as Error)?.message ?? 'Error al aprobar'}
          </p>
        )}
        <div className="flex gap-2 pt-4">
          <button onClick={onClose}
            className="flex-1 py-2 border border-gray-200 text-sm font-medium rounded-xl text-gray-600 hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={handleApprove} disabled={approve.isPending}
            className="flex-1 py-2 bg-amber-600 text-white text-sm font-medium rounded-xl hover:bg-amber-700 disabled:opacity-60">
            {approve.isPending ? 'Aprobando…' : 'Sí, crear la auditoría'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function EngagementsTab({ client }: { client: ClientDetail }) {
  const { hasRole } = useUser();
  const canApprove = hasRole(['AUDIT_MANAGER', 'CAE', 'ADMIN', 'SUPER_ADMIN']);
  const [showNew, setShowNew] = useState(false);
  const [approving, setApproving] = useState<{ id: string; year: number } | null>(null);
  const cancelEngagement = useCancelEngagement();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Encargos de {client.legalName}</h3>
        {client.status === 'ACTIVE' && (
          <button onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
            <Plus className="w-3.5 h-3.5" /> Nuevo Encargo
          </button>
        )}
      </div>

      {client.status !== 'ACTIVE' && client.engagements.length === 0 && (
        <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
          El cliente debe estar Activo (carta de compromiso firmada) para registrar encargos.
        </p>
      )}

      {client.engagements.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
          <Briefcase className="w-10 h-10 mb-2 opacity-30" />
          <p className="text-sm">Sin encargos registrados</p>
        </div>
      ) : (
        <div className="space-y-3">
          {client.engagements.map(eng => {
            const cfg = ENGAGEMENT_STATUS_CONFIG[eng.status];
            return (
              <div key={eng.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Ejercicio fiscal {eng.fiscalYear}</p>
                  <p className="text-xs text-gray-400">
                    Cierre {formatDateUTC(eng.fiscalYearEndDate)}
                    {eng.plannedStartDate && ` · Planeado ${formatDateUTC(eng.plannedStartDate)} – ${eng.plannedEndDate ? formatDateUTC(eng.plannedEndDate) : '—'}`}
                  </p>
                  {eng.notes && <p className="text-xs text-gray-400 mt-1">{eng.notes}</p>}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                  {eng.status === 'DRAFT' && (
                    <>
                      {canApprove && (
                        <button
                          onClick={() => setApproving({ id: eng.id, year: eng.fiscalYear })}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white text-xs font-medium rounded-lg hover:bg-amber-700"
                        >
                          <BadgeCheck className="w-3.5 h-3.5" /> Aprobar y Crear Auditoría
                        </button>
                      )}
                      <button
                        onClick={() => cancelEngagement.mutate(eng.id)}
                        disabled={cancelEngagement.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 text-red-600 text-xs font-medium rounded-lg hover:bg-red-50 disabled:opacity-50"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Cancelar
                      </button>
                    </>
                  )}
                  {eng.status === 'APPROVED' && eng.audit && (
                    <Link href={`/dashboard/audits/${eng.audit.id}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-blue-200 text-blue-700 text-xs font-medium rounded-lg hover:bg-blue-50">
                      <ExternalLink className="w-3.5 h-3.5" /> Ver Auditoría
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showNew && <NewEngagementModal clientId={client.id} onClose={() => setShowNew(false)} />}
      {approving && (
        <ApproveConfirm
          engagementId={approving.id}
          clientName={client.legalName}
          fiscalYear={approving.year}
          onClose={() => setApproving(null)}
        />
      )}
    </div>
  );
}
