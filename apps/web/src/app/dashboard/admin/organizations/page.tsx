'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2, Plus, Mail, Loader2, AlertCircle, X, ShieldAlert,
  Power, Users, FolderOpen, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { apiClient } from '@/lib/api-client';
import { useUser } from '@/hooks/useUser';
import { formatDate } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

type Modality = 'INTERNAL' | 'EXTERNAL' | 'BOTH';

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  auditModality: Modality;
  active: boolean;
  createdAt: string;
  _count: { users: number; audits: number };
  users: { name: string; email: string }[]; // administradores activos (hasta 3)
}

interface CreateOrgResponse extends OrgRow {
  adminInvite?: { email: string; status: 'sent' | 'failed'; error?: string };
}

const MODALITY_LABELS: Record<Modality, string> = {
  BOTH: 'Interna + Externa',
  INTERNAL: 'Solo Interna',
  EXTERNAL: 'Solo Externa',
};

const PLAN_OPTIONS = [
  { value: 'starter', label: 'Starter' },
  { value: 'professional', label: 'Professional' },
  { value: 'enterprise', label: 'Enterprise' },
];

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useOrganizations(enabled: boolean) {
  return useQuery<OrgRow[]>({
    queryKey: ['organizations', 'all'],
    queryFn: () => apiClient.get<OrgRow[]>('/organizations'),
    enabled,
    staleTime: 15_000,
  });
}

function useCreateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: {
      name: string;
      auditModality: Modality;
      subscriptionTier: string;
      adminName?: string;
      adminEmail?: string;
    }) => apiClient.post<CreateOrgResponse>('/organizations', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['organizations'] }),
  });
}

function useInviteAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dto }: { id: string; name: string; email: string }) =>
      apiClient.post(`/organizations/${id}/invite-admin`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['organizations'] }),
  });
}

function useToggleActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      apiClient.patch(`/organizations/${id}`, { active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['organizations'] }),
  });
}

// ─── Modals ───────────────────────────────────────────────────────────────────

const INPUT_CLS =
  'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/20 focus:border-[#0F2D4A]';

function ModalShell({
  title, subtitle, onClose, children,
}: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>
        {subtitle && <p className="text-xs text-gray-500 mb-4">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

function CreateOrgModal({
  onClose, onCreated,
}: { onClose: () => void; onCreated: (res: CreateOrgResponse) => void }) {
  const [name, setName] = useState('');
  const [modality, setModality] = useState<Modality>('BOTH');
  const [plan, setPlan] = useState('professional');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const create = useCreateOrganization();

  const wantsAdmin = adminEmail.trim().length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await create.mutateAsync({
        name: name.trim(),
        auditModality: modality,
        subscriptionTier: plan,
        ...(wantsAdmin && { adminEmail: adminEmail.trim(), adminName: adminName.trim() || name.trim() }),
      });
      onCreated(res);
    } catch {
      // el mensaje queda expuesto vía create.error más abajo
    }
  }

  return (
    <ModalShell
      title="Nueva organización"
      subtitle="Crea un espacio aislado para un despacho o empresa: sus auditorías, papeles y usuarios no se mezclan con los de otras organizaciones."
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Nombre de la organización</label>
          <input
            type="text" required minLength={2} value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Pérez Cortez y Asociados"
            className={INPUT_CLS}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Módulos</label>
            <select value={modality} onChange={e => setModality(e.target.value as Modality)} className={`${INPUT_CLS} bg-white`}>
              {(Object.keys(MODALITY_LABELS) as Modality[]).map(m => (
                <option key={m} value={m}>{MODALITY_LABELS[m]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Plan</label>
            <select value={plan} onChange={e => setPlan(e.target.value)} className={`${INPUT_CLS} bg-white`}>
              {PLAN_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-3">
          <div>
            <p className="text-xs font-semibold text-gray-700">Primer administrador (opcional)</p>
            <p className="text-[11px] text-gray-500">
              Le llega un correo de invitación y define su propia contraseña — nadie más la ve. Puedes invitarlo después.
            </p>
          </div>
          <input
            type="text" value={adminName} onChange={e => setAdminName(e.target.value)}
            placeholder="Nombre del administrador" className={`${INPUT_CLS} bg-white`}
          />
          <input
            type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)}
            placeholder="correo@despacho.com" className={`${INPUT_CLS} bg-white`}
          />
        </div>

        {create.isError && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {(create.error as Error).message || 'No se pudo crear la organización.'}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={create.isPending || name.trim().length < 2}
            className="flex items-center gap-1.5 bg-[#0F2D4A] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#1a3f5f] disabled:opacity-50 transition-colors"
          >
            {create.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            {create.isPending ? 'Creando…' : 'Crear organización'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function InviteAdminModal({
  org, onClose, onSuccess,
}: { org: OrgRow; onClose: () => void; onSuccess: (email: string) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const invite = useInviteAdmin();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await invite.mutateAsync({ id: org.id, name: name.trim(), email: email.trim() });
      onSuccess(email.trim());
    } catch {
      // error visible vía invite.error
    }
  }

  return (
    <ModalShell
      title={`Invitar administrador — ${org.name}`}
      subtitle="Le enviamos un correo de invitación — la persona define su propia contraseña, nadie más la ve."
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Nombre completo</label>
          <input type="text" required minLength={2} value={name} onChange={e => setName(e.target.value)} className={INPUT_CLS} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Correo electrónico</label>
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="correo@despacho.com" className={INPUT_CLS} />
        </div>

        {invite.isError && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {(invite.error as Error).message || 'Error al enviar la invitación.'}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700">Cancelar</button>
          <button
            type="submit"
            disabled={invite.isPending || name.trim().length < 2 || !email.trim()}
            className="flex items-center gap-1.5 bg-[#0F2D4A] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#1a3f5f] disabled:opacity-50 transition-colors"
          >
            {invite.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
            {invite.isPending ? 'Enviando…' : 'Enviar invitación'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OrganizationsPage() {
  const { user, loading: userLoading } = useUser();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const { data: orgs, isLoading, isError, error, refetch } = useOrganizations(isSuperAdmin);
  const toggle = useToggleActive();

  const [showCreate, setShowCreate] = useState(false);
  const [inviteFor, setInviteFor] = useState<OrgRow | null>(null);
  const [toast, setToast] = useState<{ kind: 'ok' | 'warn'; msg: string } | null>(null);

  function showToast(kind: 'ok' | 'warn', msg: string) {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 7000);
  }

  function handleCreated(res: CreateOrgResponse) {
    setShowCreate(false);
    if (res.adminInvite?.status === 'failed') {
      showToast('warn', `"${res.name}" quedó creada, pero la invitación a ${res.adminInvite.email} falló: ${res.adminInvite.error}. Puedes reintentar con "Invitar administrador".`);
    } else if (res.adminInvite?.status === 'sent') {
      showToast('ok', `"${res.name}" creada. Invitación enviada a ${res.adminInvite.email}.`);
    } else {
      showToast('ok', `"${res.name}" creada. Falta invitar a su administrador.`);
    }
  }

  async function handleToggle(org: OrgRow) {
    const next = !org.active;
    const msg = next
      ? `¿Reactivar la organización "${org.name}"? Sus usuarios podrán volver a entrar.`
      : `¿Desactivar la organización "${org.name}"?

Todos sus usuarios dejarán de poder usar AuditMind hasta que la reactives. Sus datos no se borran.`;
    if (!window.confirm(msg)) return;
    try {
      await toggle.mutateAsync({ id: org.id, active: next });
      showToast('ok', `"${org.name}" ${next ? 'activada' : 'desactivada'}.`);
    } catch (e) {
      showToast('warn', (e as Error).message || 'No se pudo cambiar el estado.');
    }
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Organizaciones" />

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5 max-w-7xl mx-auto w-full">
        {userLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
        ) : !isSuperAdmin ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <ShieldAlert className="h-10 w-10 text-amber-500" />
            <p className="text-sm font-medium text-gray-700">Acceso restringido</p>
            <p className="text-xs text-gray-500 max-w-sm">
              Solo el Super Admin de la plataforma puede crear y administrar organizaciones.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-xl font-bold text-gray-900">Organizaciones</h1>
                <p className="text-sm text-gray-500 mt-0.5">
                  Cada organización es un espacio aislado: sus datos no se mezclan con los de las demás.
                </p>
              </div>
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 bg-[#0F2D4A] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#1a3f5f] transition-colors"
              >
                <Plus className="h-4 w-4" />
                Nueva organización
              </button>
            </div>

            {toast && (
              <div
                className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                  toast.kind === 'ok'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-amber-50 border-amber-200 text-amber-800'
                }`}
              >
                {toast.kind === 'ok' ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> : <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />}
                <span>{toast.msg}</span>
              </div>
            )}

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {isError ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                  <AlertCircle className="h-10 w-10 text-red-400" />
                  <p className="text-sm font-medium text-gray-700">Error al cargar las organizaciones</p>
                  <p className="text-xs text-gray-500">{(error as Error)?.message}</p>
                  <button onClick={() => refetch()} className="text-sm text-[#0F2D4A] underline">Reintentar</button>
                </div>
              ) : isLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
                        <th className="px-4 py-3 font-semibold">Organización</th>
                        <th className="px-4 py-3 font-semibold">Módulos</th>
                        <th className="px-4 py-3 font-semibold">Administrador(es)</th>
                        <th className="px-4 py-3 font-semibold text-center">Usuarios</th>
                        <th className="px-4 py-3 font-semibold text-center">Auditorías</th>
                        <th className="px-4 py-3 font-semibold">Estado</th>
                        <th className="px-4 py-3 font-semibold text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(orgs ?? []).map(org => (
                        <tr key={org.id} className={org.active ? '' : 'bg-gray-50/60 text-gray-500'}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="p-1.5 bg-blue-50 rounded-lg"><Building2 className="h-4 w-4 text-[#0F2D4A]" /></div>
                              <div>
                                <p className="font-medium text-gray-900">{org.name}</p>
                                <p className="text-[11px] text-gray-400">{org.slug} · creada {formatDate(org.createdAt)}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                              {MODALITY_LABELS[org.auditModality]}
                            </span>
                            <p className="text-[11px] text-gray-400 mt-0.5 capitalize">{org.plan}</p>
                          </td>
                          <td className="px-4 py-3">
                            {org.users.length === 0 ? (
                              <span className="text-[11px] font-medium text-amber-600">Sin administrador — invítalo</span>
                            ) : (
                              <ul className="space-y-0.5">
                                {org.users.map(a => (
                                  <li key={a.email} className="text-xs text-gray-700">
                                    {a.name} <span className="text-gray-400">· {a.email}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-flex items-center gap-1 text-xs text-gray-600"><Users className="h-3 w-3" />{org._count.users}</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-flex items-center gap-1 text-xs text-gray-600"><FolderOpen className="h-3 w-3" />{org._count.audits}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                org.active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-200 text-gray-600'
                              }`}
                            >
                              {org.active ? 'Activa' : 'Inactiva'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-1.5">
                              <button
                                onClick={() => setInviteFor(org)}
                                className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                              >
                                <Mail className="h-3.5 w-3.5" /> Invitar admin
                              </button>
                              <button
                                onClick={() => handleToggle(org)}
                                disabled={toggle.isPending}
                                className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                              >
                                <Power className="h-3.5 w-3.5" /> {org.active ? 'Desactivar' : 'Activar'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {showCreate && <CreateOrgModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />}
      {inviteFor && (
        <InviteAdminModal
          org={inviteFor}
          onClose={() => setInviteFor(null)}
          onSuccess={email => {
            showToast('ok', `Invitación enviada a ${email}.`);
            setInviteFor(null);
          }}
        />
      )}
    </div>
  );
}
