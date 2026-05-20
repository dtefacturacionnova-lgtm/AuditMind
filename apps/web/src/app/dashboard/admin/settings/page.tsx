'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  User,
  Mail,
  ShieldCheck,
  Briefcase,
  Users,
  Zap,
  Bell,
  Calendar,
  ClipboardCheck,
  CheckCircle,
  KeyRound,
  LogOut,
  Loader2,
  Check,
  AlertCircle,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { apiClient } from '@/lib/api-client';
import { useUser } from '@/hooks/useUser';
import { createClient } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl?: string;
  aiPersonality: 'PROFESSIONAL' | 'COLLABORATIVE' | 'CONCISE';
  notificationPreferences?: {
    newFindings: boolean;
    actionPlanDueDates: boolean;
    auditStatusChanges: boolean;
    externalConfirmationsReceived: boolean;
  };
}

type PatchUserPayload = {
  name?: string;
  aiPersonality?: string;
  notificationPreferences?: UserProfile['notificationPreferences'];
};

type AiPersonality = 'PROFESSIONAL' | 'COLLABORATIVE' | 'CONCISE';

interface NotifPrefs {
  newFindings: boolean;
  actionPlanDueDates: boolean;
  auditStatusChanges: boolean;
  externalConfirmationsReceived: boolean;
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

const AI_PERSONALITY_OPTIONS: {
  value: AiPersonality;
  label: string;
  description: string;
  Icon: React.FC<{ className?: string }>;
}[] = [
  {
    value: 'PROFESSIONAL',
    label: 'Profesional',
    description: 'Respuestas formales y precisas',
    Icon: Briefcase,
  },
  {
    value: 'COLLABORATIVE',
    label: 'Colaborativo',
    description: 'Tono amigable y didáctico',
    Icon: Users,
  },
  {
    value: 'CONCISE',
    label: 'Conciso',
    description: 'Respuestas cortas y directas al punto',
    Icon: Zap,
  },
];

const DEFAULT_NOTIF_PREFS: NotifPrefs = {
  newFindings: true,
  actionPlanDueDates: true,
  auditStatusChanges: true,
  externalConfirmationsReceived: false,
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useUserProfile() {
  return useQuery<UserProfile>({
    queryKey: ['users', 'me'],
    queryFn: () => apiClient.get<UserProfile>('/users/me'),
    staleTime: 60_000,
  });
}

function usePatchUserProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PatchUserPayload) =>
      apiClient.patch<UserProfile>('/users/me', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users', 'me'] });
    },
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {description && (
          <p className="text-sm text-gray-500 mt-0.5">{description}</p>
        )}
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

function Toggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      aria-pressed={value}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F2D4A]/40 ${
        value ? 'bg-[#0F2D4A]' : 'bg-gray-200'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          value ? 'translate-x-[18px]' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

// ─── Settings Page ────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { user: sessionUser, signOut } = useUser();
  const { data: profile, isLoading, isError } = useUserProfile();
  const patchProfile = usePatchUserProfile();

  // ── Section 1: profile ──────────────────────────────────────────────────────
  const [displayName, setDisplayName] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // ── Section 2: AI personality (optimistic) ──────────────────────────────────
  const [aiPersonality, setAiPersonality] = useState<AiPersonality>('PROFESSIONAL');

  // ── Section 3: notifications (optimistic) ──────────────────────────────────
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs>(DEFAULT_NOTIF_PREFS);

  // ── Section 4: security ─────────────────────────────────────────────────────
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);

  // ── Toast ───────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState('');

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  // Seed local state from fetched profile
  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.name ?? '');
    setAiPersonality(profile.aiPersonality ?? 'PROFESSIONAL');
    setNotifPrefs({
      ...DEFAULT_NOTIF_PREFS,
      ...(profile.notificationPreferences ?? {}),
    });
  }, [profile]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function handleSaveProfile() {
    if (!displayName.trim()) return;
    setIsSavingProfile(true);
    try {
      await patchProfile.mutateAsync({ name: displayName.trim() });
      showToast('Perfil actualizado correctamente');
    } catch {
      showToast('Error al guardar el perfil');
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handleSelectPersonality(value: AiPersonality) {
    // Optimistic update
    setAiPersonality(value);
    try {
      await patchProfile.mutateAsync({ aiPersonality: value });
      showToast('Preferencia de IA guardada');
    } catch {
      // Revert on error
      setAiPersonality(profile?.aiPersonality ?? 'PROFESSIONAL');
      showToast('Error al guardar preferencia de IA');
    }
  }

  async function handleToggleNotif(key: keyof NotifPrefs) {
    const updated = { ...notifPrefs, [key]: !notifPrefs[key] };
    // Optimistic update
    setNotifPrefs(updated);
    try {
      await patchProfile.mutateAsync({ notificationPreferences: updated });
    } catch {
      // Revert on error
      setNotifPrefs(notifPrefs);
      showToast('Error al guardar preferencia de notificaciones');
    }
  }

  async function handleResetPassword() {
    if (!sessionUser?.email) return;
    setIsSendingReset(true);
    try {
      const supabase = createClient();
      await supabase.auth.resetPasswordForEmail(sessionUser.email, {
        redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
      });
      setResetEmailSent(true);
      showToast('Email de restablecimiento enviado');
    } catch {
      showToast('Error al enviar el email');
    } finally {
      setIsSendingReset(false);
    }
  }

  async function handleSignOut() {
    await signOut();
  }

  // ── Render states ────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <Header
          breadcrumbs={[
            { label: 'Admin', href: '/dashboard' },
            { label: 'Configuración' },
          ]}
        />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col h-full">
        <Header
          breadcrumbs={[
            { label: 'Admin', href: '/dashboard' },
            { label: 'Configuración' },
          ]}
        />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
          <AlertCircle className="h-10 w-10 text-red-400" />
          <p className="text-sm font-medium text-gray-700">
            Error al cargar la configuración
          </p>
          <p className="text-xs text-gray-400">
            Intenta recargar la página
          </p>
        </div>
      </div>
    );
  }

  const role = profile?.role ?? sessionUser?.role ?? 'AUDITOR';
  const roleBadgeColor = ROLE_COLORS[role] ?? 'bg-gray-100 text-gray-600';
  const roleLabel = ROLE_LABELS[role] ?? role;

  // Notification rows config
  type NotifRow = {
    key: keyof NotifPrefs;
    label: string;
    description: string;
    Icon: React.FC<{ className?: string }>;
  };

  const notifRows: NotifRow[] = [
    {
      key: 'newFindings',
      label: 'Notificaciones de hallazgos nuevos',
      description: 'Recibe un aviso cada vez que se registra un nuevo hallazgo',
      Icon: Bell,
    },
    {
      key: 'actionPlanDueDates',
      label: 'Vencimientos de planes de acción',
      description: 'Alertas antes del vencimiento de planes asignados',
      Icon: Calendar,
    },
    {
      key: 'auditStatusChanges',
      label: 'Cambios de estado en auditorías',
      description: 'Notificaciones cuando una auditoría avanza de etapa',
      Icon: ClipboardCheck,
    },
    {
      key: 'externalConfirmationsReceived',
      label: 'Confirmaciones externas recibidas',
      description: 'Aviso al recibir una respuesta de confirmación externa',
      Icon: CheckCircle,
    },
  ];

  return (
    <div className="flex flex-col h-full">
      <Header
        breadcrumbs={[
          { label: 'Admin', href: '/dashboard' },
          { label: 'Configuración' },
        ]}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-6 space-y-6">

          {/* Page heading */}
          <div>
            <h1 className="text-xl font-bold text-gray-900">Configuración</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Gestiona tu perfil, preferencias de IA y notificaciones
            </p>
          </div>

          {/* ── 1. Perfil personal ───────────────────────────────────────────── */}
          <SectionCard
            title="Perfil personal"
            description="Tu información de cuenta en AuditMind"
          >
            <div className="space-y-5">
              {/* Avatar + name + email row */}
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#0F2D4A] text-xl font-bold text-white select-none">
                  {(displayName || profile?.name || '?').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {profile?.name}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    {profile?.email ?? sessionUser?.email}
                  </p>
                </div>
              </div>

              {/* Display name field */}
              <div className="space-y-1.5">
                <label
                  htmlFor="display-name"
                  className="flex items-center gap-1.5 text-sm font-medium text-gray-700"
                >
                  <User className="h-3.5 w-3.5 text-gray-400" />
                  Nombre para mostrar
                </label>
                <input
                  id="display-name"
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="Tu nombre completo"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/20 focus:border-[#0F2D4A] transition-colors"
                />
              </div>

              {/* Email field (read-only) */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                  <Mail className="h-3.5 w-3.5 text-gray-400" />
                  Correo electrónico
                </label>
                <input
                  type="email"
                  readOnly
                  value={profile?.email ?? sessionUser?.email ?? ''}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-400 cursor-not-allowed select-none"
                />
              </div>

              {/* Role badge (read-only) */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                  <ShieldCheck className="h-3.5 w-3.5 text-gray-400" />
                  Rol en la organización
                </label>
                <div>
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${roleBadgeColor}`}
                  >
                    {roleLabel}
                  </span>
                </div>
              </div>

              {/* Save button */}
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={handleSaveProfile}
                  disabled={isSavingProfile || !displayName.trim()}
                  className="flex items-center gap-2 bg-[#0F2D4A] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#1a3f5f] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isSavingProfile ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Guardando…
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      Guardar cambios
                    </>
                  )}
                </button>
              </div>
            </div>
          </SectionCard>

          {/* ── 2. Preferencias de IA ────────────────────────────────────────── */}
          <SectionCard
            title="Preferencias de IA"
            description="Elige cómo quieres que responda el asistente inteligente"
          >
            <div className="space-y-3">
              <p className="text-sm text-gray-600 font-medium">
                Personalidad del asistente
              </p>
              <div className="grid gap-3">
                {AI_PERSONALITY_OPTIONS.map(({ value, label, description, Icon }) => {
                  const isSelected = aiPersonality === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => handleSelectPersonality(value)}
                      className={`flex items-center gap-4 w-full text-left px-4 py-3.5 rounded-xl border-2 transition-all ${
                        isSelected
                          ? 'border-[#0F2D4A] bg-[#0F2D4A]/5'
                          : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {/* Icon circle */}
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
                          isSelected
                            ? 'bg-[#0F2D4A] text-white'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>

                      {/* Label + description */}
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm font-semibold ${
                            isSelected ? 'text-[#0F2D4A]' : 'text-gray-800'
                          }`}
                        >
                          {label}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {description}
                        </p>
                      </div>

                      {/* Checkmark */}
                      <div
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                          isSelected
                            ? 'border-[#0F2D4A] bg-[#0F2D4A]'
                            : 'border-gray-300'
                        }`}
                      >
                        {isSelected && (
                          <Check className="h-3 w-3 text-white" strokeWidth={3} />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </SectionCard>

          {/* ── 3. Notificaciones ───────────────────────────────────────────── */}
          <SectionCard
            title="Notificaciones"
            description="Controla qué eventos generan alertas para ti"
          >
            <div className="divide-y divide-gray-100">
              {notifRows.map(({ key, label, description, Icon }) => (
                <div
                  key={key}
                  className="flex items-center gap-4 py-3.5 first:pt-0 last:pb-0"
                >
                  {/* Icon */}
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                    <Icon className="h-4 w-4" />
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 leading-snug">
                      {label}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5 leading-snug">
                      {description}
                    </p>
                  </div>

                  {/* Toggle */}
                  <Toggle
                    value={notifPrefs[key]}
                    onChange={() => handleToggleNotif(key)}
                  />
                </div>
              ))}
            </div>
          </SectionCard>

          {/* ── 4. Seguridad ────────────────────────────────────────────────── */}
          <SectionCard
            title="Seguridad"
            description="Gestiona el acceso a tu cuenta"
          >
            <div className="space-y-4">
              {/* Change password */}
              <div className="flex items-center justify-between gap-4 py-3 border-b border-gray-100">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                    <KeyRound className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800">
                      Cambiar contraseña
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {resetEmailSent
                        ? 'Email de restablecimiento enviado — revisa tu bandeja'
                        : 'Recibirás un enlace seguro en tu correo'}
                    </p>
                  </div>
                </div>

                {resetEmailSent ? (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg shrink-0">
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                    Enviado
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResetPassword}
                    disabled={isSendingReset}
                    className="flex items-center gap-2 text-sm font-medium text-[#0F2D4A] border border-[#0F2D4A]/30 px-3 py-1.5 rounded-lg hover:bg-[#0F2D4A]/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                  >
                    {isSendingReset ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <KeyRound className="h-3.5 w-3.5" />
                    )}
                    Restablecer
                  </button>
                )}
              </div>

              {/* Sign out */}
              <div className="flex items-center justify-between gap-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-400">
                    <LogOut className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800">
                      Cerrar sesión
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Salir de AuditMind en este dispositivo
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSignOut}
                  className="flex items-center gap-2 text-sm font-medium text-red-600 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors shrink-0"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Salir
                </button>
              </div>
            </div>
          </SectionCard>

        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm text-white shadow-lg animate-fade-in">
          <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          {toast}
        </div>
      )}
    </div>
  );
}
