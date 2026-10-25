'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Briefcase, Plus, BadgeCheck, XCircle, ExternalLink, ShieldAlert,
  DollarSign, ChevronUp, ChevronDown, Pencil, Wallet,
} from 'lucide-react';
import { useUser } from '@/hooks/useUser';
import { useOrgUsersList } from '@/hooks/useCapacity';
import {
  useCreateEngagement, useApproveEngagement, useCancelEngagement, useUpdateEngagement,
  ENGAGEMENT_STATUS_CONFIG, ClientDetail, CreateEngagementData, Engagement, EngagementKind,
} from '@/hooks/usePortfolio';
import { formatDateUTC, formatMoney } from '@/lib/utils';
import { ProfitabilityPanel } from './ProfitabilityPanel';
import { EngagementBillingPanel } from '@/components/collections/EngagementBillingPanel';

/** Mismo umbral que ProfitabilityPanel — se repite aquí solo para decidir si se
 *  muestra el botón (evita importar el componente completo por una constante). */
const PROFITABILITY_ROLES = ['CAE', 'ADMIN', 'SUPER_ADMIN'];

const cls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const label = 'text-xs font-medium text-gray-600';

/** Roles que pueden ser socio/gerente a cargo (mismo criterio del API). */
const PARTNER_ROLES = ['AUDIT_MANAGER', 'CAE', 'ADMIN', 'SUPER_ADMIN'];

/** Fecha de cierre del ejercicio `year` según el cierre fiscal del cliente (mes/día), p. ej. 2026-06-30. */
function closingDate(year: number, month: number, day: number): string {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate(); // último día de ese mes (por si el día no existe: 29-feb)
  return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

function NewEngagementModal({ client, onClose }: { client: ClientDetail; onClose: () => void }) {
  const currentYear = new Date().getFullYear();
  // Solo cartas SIGNED tienen valor real acá — sin firma no hay honorario exigible
  // todavía. Si el cliente tiene exactamente una, se preselecciona (caso típico:
  // primer encargo tras la carta inicial); con varias, el auditor elige a mano.
  const signedLetters = client.engagementLetters.filter(l => l.status === 'SIGNED');
  const [form, setForm] = useState<CreateEngagementData>({
    clientId: client.id,
    kind: 'AUDIT',
    fiscalYear: currentYear,
    fiscalYearEndDate: closingDate(currentYear, client.fiscalYearEndMonth || 12, client.fiscalYearEndDay || 31),
    engagementLetterId: signedLetters.length === 1 ? signedLetters[0].id : undefined,
  });
  const create = useCreateEngagement();
  const { data: orgUsers = [] } = useOrgUsersList();
  const partners = orgUsers.filter(u => PARTNER_ROLES.includes(u.role));

  const set = (patch: Partial<CreateEngagementData>) => setForm(p => ({ ...p, ...patch }));
  // Al cambiar el ejercicio, el cierre se recalcula con el cierre fiscal del cliente (antes quedaba el del año anterior).
  const setYear = (fiscalYear: number) =>
    set({ fiscalYear, fiscalYearEndDate: closingDate(fiscalYear, client.fiscalYearEndMonth || 12, client.fiscalYearEndDay || 31) });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await create.mutateAsync({
        ...form, engagementLetterId: form.engagementLetterId || undefined,
        title: form.kind === 'CONSULTING' ? form.title?.trim() : undefined,
      });
      onClose();
    } catch { /* shown below */ }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Nuevo Encargo</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex flex-col gap-1">
            <label className={label}>Tipo de encargo *</label>
            <select value={form.kind} onChange={e => set({ kind: e.target.value as EngagementKind })} className={cls}>
              <option value="AUDIT">Auditoría</option>
              <option value="CONSULTING">Consultoría</option>
            </select>
            {form.kind === 'CONSULTING' && (
              <p className="text-[11px] text-gray-400">Lleva encargo, horas y costos como una auditoría, con menos rigor: etapas de Planificación, Ejecución e Informes y cierre.</p>
            )}
          </div>
          {form.kind === 'CONSULTING' && (
            <div className="flex flex-col gap-1">
              <label className={label}>Nombre de la consultoría *</label>
              <input required minLength={3} maxLength={200} value={form.title ?? ''} onChange={e => set({ title: e.target.value })}
                placeholder="Ej. Asesoría tributaria 2026" className={cls} />
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className={label}>Año fiscal *</label>
            <input required type="number" value={form.fiscalYear}
              onChange={e => setYear(+e.target.value)} className={cls} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={label}>Fecha de cierre fiscal *</label>
            <input required type="date" value={form.fiscalYearEndDate}
              onChange={e => set({ fiscalYearEndDate: e.target.value })} className={cls} />
            <p className="text-[11px] text-gray-400">Debe caer en el año fiscal; el período auditado empieza el día siguiente al cierre del ejercicio anterior.</p>
          </div>
          <div className="flex flex-col gap-1">
            <label className={label}>Socio / gerente a cargo</label>
            <select value={form.leadPartnerId ?? ''} onChange={e => set({ leadPartnerId: e.target.value || undefined })} className={cls}>
              <option value="">Quien apruebe el encargo (por defecto)</option>
              {partners.map(u => <option key={u.id} value={u.id}>{u.name} — {u.role}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={label}>Carta de Compromiso vinculada</label>
            {signedLetters.length > 0 ? (
              <select value={form.engagementLetterId ?? ''}
                onChange={e => set({ engagementLetterId: e.target.value || undefined })} className={cls}>
                <option value="">Sin vincular</option>
                {signedLetters.map(l => (
                  <option key={l.id} value={l.id}>
                    Ejercicio {l.year} — {l.proposal?.feeAmount != null
                      ? `${formatMoney(l.proposal.feeAmount)} ${l.proposal.feeCurrency}`
                      : 'honorario no definido'}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-[11px] text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                Este cliente no tiene cartas de compromiso firmadas — la Rentabilidad de este
                encargo no podrá calcular ingreso hasta vincular una.
              </p>
            )}
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

function EditEngagementModal({ engagement, client, onClose }: { engagement: Engagement; client: ClientDetail; onClose: () => void }) {
  const [title, setTitle] = useState(engagement.title ?? '');
  const draft = engagement.status === 'DRAFT';
  const signedLetters = client.engagementLetters.filter(l => l.status === 'SIGNED');
  const [letterId, setLetterId] = useState(engagement.engagementLetterId ?? '');
  const [closing, setClosing] = useState(engagement.fiscalYearEndDate?.slice(0, 10) ?? '');
  const [start, setStart] = useState(engagement.plannedStartDate?.slice(0, 10) ?? '');
  const [end, setEnd] = useState(engagement.plannedEndDate?.slice(0, 10) ?? '');
  const [notes, setNotes] = useState(engagement.notes ?? '');
  const update = useUpdateEngagement();
  const consulting = engagement.kind === 'CONSULTING';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await update.mutateAsync({
        id: engagement.id,
        data: {
          ...(consulting && { title: title.trim() }),
          ...(draft && letterId && letterId !== engagement.engagementLetterId && { engagementLetterId: letterId }),
          ...(draft && closing && closing !== engagement.fiscalYearEndDate?.slice(0, 10) && { fiscalYearEndDate: closing }),
          ...(start && { plannedStartDate: start }),
          ...(end && { plannedEndDate: end }),
          notes,
        },
      });
      onClose();
    } catch { /* shown below */ }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Editar encargo</h2>
        <form onSubmit={submit} className="space-y-3">
          {consulting && (
            <div className="flex flex-col gap-1">
              <label className={label}>Nombre de la consultoría *</label>
              <input required minLength={3} maxLength={200} value={title} onChange={e => setTitle(e.target.value)} className={cls} />
            </div>
          )}
          {draft && (
            <>
              <div className="flex flex-col gap-1">
                <label className={label}>Carta de compromiso que respalda el encargo</label>
                <select value={letterId} onChange={e => setLetterId(e.target.value)} className={cls}>
                  <option value="">{signedLetters.length > 0 ? 'Sin vincular (se usa la última firmada al aprobar)' : 'Sin cartas firmadas'}</option>
                  {signedLetters.map(l => <option key={l.id} value={l.id}>Ejercicio {l.year} — firmada</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className={label}>Fecha de cierre fiscal</label>
                <input type="date" value={closing} onChange={e => setClosing(e.target.value)} className={cls} />
              </div>
            </>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className={label}>Inicio planeado</label>
              <input type="date" value={start} onChange={e => setStart(e.target.value)} className={cls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className={label}>Fin planeado</label>
              <input type="date" value={end} min={start || undefined} onChange={e => setEnd(e.target.value)} className={cls} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className={label}>Notas</label>
            <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} className={cls} />
          </div>
          {update.isError && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{(update.error as Error)?.message ?? 'Error al guardar'}</p>
          )}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 border border-gray-200 text-sm font-medium rounded-xl text-gray-600 hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={update.isPending}
              className="flex-1 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-60">
              {update.isPending ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ApproveConfirm({ engagementId, clientName, fiscalYear, kind, onClose }: {
  engagementId: string; clientName: string; fiscalYear: number; kind: EngagementKind; onClose: () => void;
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
          Esto creará {kind === 'CONSULTING' ? <>el <strong>expediente de la consultoría</strong> (con sus etapas de Planificación, Ejecución e Informes y cierre)</> : <>una <strong>auditoría real</strong></>} para {clientName} — ejercicio {fiscalYear} — y no puede deshacerse
          desde Cartera. El encargo quedará vinculado permanentemente a ese expediente.
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
            {approve.isPending ? 'Aprobando…' : kind === 'CONSULTING' ? 'Sí, crear el expediente' : 'Sí, crear la auditoría'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function EngagementsTab({ client }: { client: ClientDetail }) {
  const { hasRole } = useUser();
  const canApprove = hasRole(['AUDIT_MANAGER', 'CAE', 'ADMIN', 'SUPER_ADMIN']);
  const canViewProfitability = hasRole(PROFITABILITY_ROLES);
  const [showNew, setShowNew] = useState(false);
  const [approving, setApproving] = useState<{ id: string; year: number; kind: EngagementKind } | null>(null);
  const [editing, setEditing] = useState<Engagement | null>(null);
  const [expandedProfitability, setExpandedProfitability] = useState<string | null>(null);
  const [expandedBilling, setExpandedBilling] = useState<string | null>(null);
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

      {cancelEngagement.isError && (
        <p role="alert" className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
          {(cancelEngagement.error as Error)?.message ?? 'No se pudo cancelar el encargo'}
        </p>
      )}

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
            const isProfitabilityOpen = expandedProfitability === eng.id;
            const isBillingOpen = expandedBilling === eng.id;
            const consulting = eng.kind === 'CONSULTING';
            return (
              <div key={eng.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">
                      {consulting && <span className="mr-2 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-violet-50 text-violet-700">Consultoría</span>}
                      {consulting ? (eng.title ?? 'Consultoría') : 'Ejercicio fiscal'} {consulting ? `· ${eng.fiscalYear}` : eng.fiscalYear}
                    </p>
                    <p className="text-xs text-gray-400">
                      Cierre {formatDateUTC(eng.fiscalYearEndDate)}
                      {eng.plannedStartDate && ` · Planeado ${formatDateUTC(eng.plannedStartDate)} – ${eng.plannedEndDate ? formatDateUTC(eng.plannedEndDate) : '—'}`}
                    </p>
                    {eng.notes && <p className="text-xs text-gray-400 mt-1">{eng.notes}</p>}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                    {canApprove && eng.status !== 'CANCELLED' && (
                      <>
                        <button onClick={() => setEditing(eng)} aria-label="Editar encargo"
                          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50">
                          <Pencil className="w-3.5 h-3.5" /> Editar
                        </button>
                        <button onClick={() => setExpandedBilling(isBillingOpen ? null : eng.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 border border-violet-200 text-violet-700 text-xs font-medium rounded-lg hover:bg-violet-50">
                          <Wallet className="w-3.5 h-3.5" /> Cobros
                          {isBillingOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      </>
                    )}
                    {eng.status === 'DRAFT' && (
                      <>
                        {canApprove && (
                          <button
                            onClick={() => setApproving({ id: eng.id, year: eng.fiscalYear, kind: eng.kind })}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white text-xs font-medium rounded-lg hover:bg-amber-700"
                          >
                            <BadgeCheck className="w-3.5 h-3.5" /> Aprobar y Crear Auditoría
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (window.confirm(`¿Cancelar el encargo ${consulting ? (eng.title ?? 'de consultoría') : `del ejercicio ${eng.fiscalYear}`}? No se puede deshacer desde esta pantalla.`)) {
                              cancelEngagement.mutate(eng.id);
                            }
                          }}
                          disabled={cancelEngagement.isPending}
                          className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 text-red-600 text-xs font-medium rounded-lg hover:bg-red-50 disabled:opacity-50"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Cancelar
                        </button>
                      </>
                    )}
                    {eng.status === 'APPROVED' && eng.audit && (
                      <>
                        {canViewProfitability && (
                          <button
                            onClick={() => setExpandedProfitability(isProfitabilityOpen ? null : eng.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 border border-emerald-200 text-emerald-700 text-xs font-medium rounded-lg hover:bg-emerald-50"
                          >
                            <DollarSign className="w-3.5 h-3.5" />
                            Ver Rentabilidad
                            {isProfitabilityOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        )}
                        {eng.audit.restricted ? (
                          <span className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-400 text-xs font-medium rounded-lg italic"
                            title="Auditoría reservada: solo la ve su equipo y la dirección">
                            <ShieldAlert className="w-3.5 h-3.5" /> Auditoría reservada
                          </span>
                        ) : (
                          <Link href={`/dashboard/audits/${eng.audit.id}`}
                            className="flex items-center gap-1.5 px-3 py-1.5 border border-blue-200 text-blue-700 text-xs font-medium rounded-lg hover:bg-blue-50">
                            <ExternalLink className="w-3.5 h-3.5" /> Ver Auditoría
                          </Link>
                        )}
                      </>
                    )}
                  </div>
                </div>
                {isBillingOpen && (
                  <div className="border-t border-gray-100 bg-gray-50/50 p-4">
                    <EngagementBillingPanel engagementId={eng.id} />
                  </div>
                )}
                {isProfitabilityOpen && (
                  <div className="border-t border-gray-100 bg-gray-50/50 p-4">
                    <ProfitabilityPanel engagementId={eng.id} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showNew && <NewEngagementModal client={client} onClose={() => setShowNew(false)} />}
      {approving && (
        <ApproveConfirm
          engagementId={approving.id}
          clientName={client.legalName}
          fiscalYear={approving.year}
          kind={approving.kind}
          onClose={() => setApproving(null)}
        />
      )}
      {editing && <EditEngagementModal engagement={editing} client={client} onClose={() => setEditing(null)} />}
    </div>
  );
}
