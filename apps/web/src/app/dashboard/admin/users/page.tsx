'use client';

import { useState, useRef, Suspense } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Search, UserPlus, Users, UserCheck, ShieldCheck,
  Trash2, ChevronLeft, ChevronRight, Loader2, AlertCircle,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { apiClient } from '@/lib/api-client';
import { useUser } from '@/hooks/useUser';
import { formatDate } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrgUser {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  avatarUrl?: string;
  _count?: { audits: number };
}

interface UsersResponse {
  data: OrgUser[];
  meta: {
    total: number;
    page: number;
    totalPages: number;
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN:    'Super Admin',
  ADMIN:          'Administrador',
  CAE:            'CAE / Director',
  AUDIT_MANAGER:  'Gerente de Auditoría',
  SENIOR_AUDITOR: 'Auditor Senior',
  AUDITOR:        'Auditor',
  AUDITEE:        'Auditado (Portal)',
  READ_ONLY:      'Solo Lectura',
};

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN:    'bg-gray-900 text-white',
  ADMIN:          'bg-red-100 text-red-700',
  CAE:            'bg-purple-100 text-purple-700',
  AUDIT_MANAGER:  'bg-indigo-100 text-indigo-700',
  SENIOR_AUDITOR: 'bg-blue-100 text-blue-700',
  AUDITOR:        'bg-sky-100 text-sky-700',
  AUDITEE:        'bg-gray-100 text-gray-600',
  READ_ONLY:      'bg-gray-100 text-gray-600',
};

const ROLE_HIERARCHY: Record<string, number> = {
  SUPER_ADMIN:    100,
  ADMIN:          90,
  CAE:            80,
  AUDIT_MANAGER:  70,
  SENIOR_AUDITOR: 60,
  AUDITOR:        50,
  AUDITEE:        20,
  READ_ONLY:      10,
};

// Roles that can be assigned (excludes SUPER_ADMIN from the dropdown)
const ASSIGNABLE_ROLES = [
  'ADMIN',
  'CAE',
  'AUDIT_MANAGER',
  'SENIOR_AUDITOR',
  'AUDITOR',
  'AUDITEE',
  'READ_ONLY',
] as const;

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useUsers(search?: string, page = 1) {
  const params = new URLSearchParams({ page: String(page), limit: '20' });
  if (search) params.set('search', search);

  return useQuery<UsersResponse>({
    queryKey: ['users', search, page],
    queryFn: () => apiClient.get<UsersResponse>(`/users?${params.toString()}`),
    staleTime: 30_000,
  });
}

function useUpdateUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      apiClient.patch(`/users/${id}/role`, { role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

function useDeactivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AvatarInitial({ name, avatarUrl }: { name: string; avatarUrl?: string }) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className="h-8 w-8 rounded-full object-cover flex-shrink-0"
      />
    );
  }
  const initial = name?.charAt(0).toUpperCase() ?? '?';
  // Deterministic color from name
  const colors = [
    'bg-blue-500', 'bg-indigo-500', 'bg-purple-500', 'bg-emerald-500',
    'bg-teal-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500',
  ];
  const idx = name.charCodeAt(0) % colors.length;
  return (
    <div className={`h-8 w-8 rounded-full ${colors[idx]} text-white text-xs font-bold flex items-center justify-center flex-shrink-0`}>
      {initial}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const color = ROLE_COLORS[role] ?? 'bg-gray-100 text-gray-600';
  const label = ROLE_LABELS[role] ?? role;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      Activo
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
      <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
      Inactivo
    </span>
  );
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i} className="border-b border-gray-100">
          <td className="px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-gray-200 animate-pulse" />
              <div className="space-y-1.5">
                <div className="h-3 w-32 rounded bg-gray-200 animate-pulse" />
                <div className="h-2.5 w-44 rounded bg-gray-100 animate-pulse" />
              </div>
            </div>
          </td>
          <td className="px-4 py-3"><div className="h-5 w-28 rounded-full bg-gray-200 animate-pulse" /></td>
          <td className="px-4 py-3"><div className="h-5 w-16 rounded-full bg-gray-100 animate-pulse" /></td>
          <td className="px-4 py-3"><div className="h-3 w-20 rounded bg-gray-100 animate-pulse" /></td>
          <td className="px-4 py-3"><div className="h-7 w-36 rounded-lg bg-gray-100 animate-pulse" /></td>
          <td className="px-4 py-3"><div className="h-7 w-7 rounded-lg bg-gray-100 animate-pulse" /></td>
        </tr>
      ))}
    </>
  );
}

// ─── Inner page (uses useSearchParams — must be inside Suspense) ───────────────

function UsersPageInner() {
  const { user: currentUser } = useUser();
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [page, setPage] = useState(1);
  const [toastMsg, setToastMsg] = useState('');

  // Simple debounce via timeout ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleSearchChange(val: string) {
    setSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(1);
    }, 350);
  }

  const { data, isLoading, isError } = useUsers(debouncedSearch || undefined, page);
  const updateRole   = useUpdateUserRole();
  const deactivate   = useDeactivateUser();

  const users       = data?.data ?? [];
  const meta        = data?.meta;
  const total       = meta?.total ?? 0;
  const totalPages  = meta?.totalPages ?? 1;

  // Stats derived from current page data (best-effort; full stats need separate endpoint)
  const activeCount  = users.filter(u => u.isActive).length;
  const auditorCount = users.filter(u => u.role === 'AUDITOR' || u.role === 'SENIOR_AUDITOR').length;
  const managerCount = users.filter(u => u.role === 'AUDIT_MANAGER' || u.role === 'CAE').length;

  function showToast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3500);
  }

  function canManageUser(targetRole: string): boolean {
    if (!currentUser) return false;
    const myLevel = ROLE_HIERARCHY[currentUser.role] ?? 0;
    const targetLevel = ROLE_HIERARCHY[targetRole] ?? 0;
    return myLevel > targetLevel;
  }

  function canAssignRole(role: string): boolean {
    if (!currentUser) return false;
    const myLevel = ROLE_HIERARCHY[currentUser.role] ?? 0;
    return (ROLE_HIERARCHY[role] ?? 0) < myLevel;
  }

  async function handleRoleChange(userId: string, newRole: string) {
    try {
      await updateRole.mutateAsync({ id: userId, role: newRole });
      showToast('Rol actualizado correctamente');
    } catch {
      showToast('Error al actualizar el rol');
    }
  }

  async function handleDeactivate(userId: string, userName: string) {
    if (!window.confirm(`¿Desactivar a "${userName}"? El usuario perderá acceso al sistema.`)) return;
    try {
      await deactivate.mutateAsync(userId);
      showToast('Usuario desactivado correctamente');
    } catch {
      showToast('Error al desactivar el usuario');
    }
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Usuarios" />

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5 max-w-7xl mx-auto w-full">

        {/* Page heading + actions */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Gestión de Usuarios</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Administra roles y acceso de los miembros de la organización
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={e => handleSearchChange(e.target.value)}
                placeholder="Buscar por nombre o email…"
                className="pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/20 focus:border-[#0F2D4A] w-64 bg-white"
              />
            </div>
            {/* Invite button */}
            <button
              onClick={() => showToast('Funcionalidad próximamente')}
              className="flex items-center gap-2 bg-[#0F2D4A] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#1a3f5f] transition-colors"
            >
              <UserPlus className="h-4 w-4" />
              Invitar usuario
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 rounded-lg">
                <Users className="h-4 w-4 text-[#0F2D4A]" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Total usuarios</p>
                <p className="text-xl font-bold text-gray-900">{isLoading ? '—' : total}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-50 rounded-lg">
                <UserCheck className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Activos (página)</p>
                <p className="text-xl font-bold text-gray-900">{isLoading ? '—' : activeCount}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-sky-50 rounded-lg">
                <ShieldCheck className="h-4 w-4 text-sky-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Auditores</p>
                <p className="text-xl font-bold text-gray-900">{isLoading ? '—' : auditorCount}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-50 rounded-lg">
                <ShieldCheck className="h-4 w-4 text-indigo-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Gerentes / CAE</p>
                <p className="text-xl font-bold text-gray-900">{isLoading ? '—' : managerCount}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Table card */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {isError ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <AlertCircle className="h-10 w-10 text-red-400" />
              <p className="text-sm font-medium text-gray-700">Error al cargar los usuarios</p>
              <button
                onClick={() => qc.invalidateQueries({ queryKey: ['users'] })}
                className="text-sm text-[#0F2D4A] hover:underline"
              >
                Reintentar
              </button>
            </div>
          ) : (
            <>
              {/* Table header */}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px]">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                        Usuario
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                        Rol
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                        Estado
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                        Registrado
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                        Cambiar rol
                      </th>
                      <th className="px-4 py-2.5 w-12" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {isLoading ? (
                      <SkeletonRows />
                    ) : users.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-16 text-center">
                          <Users className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                          <p className="text-sm text-gray-500 font-medium">
                            {debouncedSearch
                              ? `Sin resultados para "${debouncedSearch}"`
                              : 'No hay usuarios en esta organización'}
                          </p>
                        </td>
                      </tr>
                    ) : (
                      users.map(u => {
                        const isSelf     = u.id === currentUser?.id;
                        const canManage  = canManageUser(u.role) && !isSelf;
                        const isPending  = updateRole.isPending || deactivate.isPending;

                        return (
                          <tr
                            key={u.id}
                            className={`group transition-colors hover:bg-gray-50/60 ${!u.isActive ? 'opacity-60' : ''}`}
                          >
                            {/* Name + email */}
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <AvatarInitial name={u.name} avatarUrl={u.avatarUrl} />
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-gray-900 truncate leading-tight">
                                    {u.name}
                                    {isSelf && (
                                      <span className="ml-1.5 text-xs font-normal text-gray-400">(tú)</span>
                                    )}
                                  </p>
                                  <p className="text-xs text-gray-400 truncate leading-tight mt-0.5">
                                    {u.email}
                                  </p>
                                </div>
                              </div>
                            </td>

                            {/* Role badge */}
                            <td className="px-4 py-3">
                              <RoleBadge role={u.role} />
                              {u._count && u._count.audits > 0 && (
                                <p className="text-[11px] text-gray-400 mt-0.5">
                                  {u._count.audits} auditoría{u._count.audits !== 1 ? 's' : ''}
                                </p>
                              )}
                            </td>

                            {/* Status */}
                            <td className="px-4 py-3">
                              <StatusBadge isActive={u.isActive} />
                            </td>

                            {/* Created date */}
                            <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                              {formatDate(u.createdAt)}
                            </td>

                            {/* Role change select */}
                            <td className="px-4 py-3">
                              {canManage ? (
                                <select
                                  defaultValue={u.role}
                                  disabled={isPending || !u.isActive}
                                  onChange={e => handleRoleChange(u.id, e.target.value)}
                                  className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/20 focus:border-[#0F2D4A] disabled:opacity-50 disabled:cursor-not-allowed max-w-[180px]"
                                >
                                  {ASSIGNABLE_ROLES.filter(r => canAssignRole(r)).map(r => (
                                    <option key={r} value={r}>
                                      {ROLE_LABELS[r]}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span className="text-xs text-gray-300 italic">Sin permiso</span>
                              )}
                            </td>

                            {/* Deactivate */}
                            <td className="px-4 py-3">
                              {canManage && u.isActive ? (
                                <button
                                  onClick={() => handleDeactivate(u.id, u.name)}
                                  disabled={isPending}
                                  title="Desactivar usuario"
                                  className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50"
                                >
                                  {deactivate.isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-4 w-4" />
                                  )}
                                </button>
                              ) : (
                                <div className="h-7 w-7" />
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                  <p className="text-xs text-gray-500">
                    Página {page} de {totalPages} · {total} usuarios en total
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      Anterior
                    </button>

                    {/* Page numbers (show at most 5 around current) */}
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter(n => Math.abs(n - page) <= 2)
                      .map(n => (
                        <button
                          key={n}
                          onClick={() => setPage(n)}
                          className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                            n === page
                              ? 'bg-[#0F2D4A] text-white border-[#0F2D4A]'
                              : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                          }`}
                        >
                          {n}
                        </button>
                      ))}

                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Siguiente
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 bg-gray-900 text-white text-sm rounded-xl shadow-lg animate-fade-in">
          {toastMsg}
        </div>
      )}
    </div>
  );
}

// ─── Page export (wraps inner in Suspense for useSearchParams) ────────────────

export default function UsersPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col h-full">
          <Header title="Usuarios" />
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        </div>
      }
    >
      <UsersPageInner />
    </Suspense>
  );
}
