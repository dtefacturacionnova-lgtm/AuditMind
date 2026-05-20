'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Palette,
  Image as ImageIcon,
  Loader2,
  AlertCircle,
  ShieldAlert,
  ClipboardList,
  FileSearch,
  Users,
  FileText,
  CheckCircle2,
  TriangleAlert,
  Download,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { apiClient } from '@/lib/api-client';
import { useUser } from '@/hooks/useUser';
import { formatDate } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  logoUrl?: string;
  primaryColor: string;
  settings: Record<string, unknown>;
  createdAt: string;
  _count?: { users: number; audits: number };
}

interface OrgStats {
  totalAudits: number;
  activeAudits: number;
  totalFindings: number;
  openFindings: number;
  totalUsers: number;
  totalWorkingPapers: number;
}

interface UpdateOrganizationDto {
  name?: string;
  logoUrl?: string;
  primaryColor?: string;
  settings?: Record<string, unknown>;
}

// ─── Plan config ──────────────────────────────────────────────────────────────

const PLAN_LABELS: Record<string, string> = {
  starter:      'Starter',
  professional: 'Professional',
  enterprise:   'Enterprise',
};

const PLAN_COLORS: Record<string, string> = {
  starter:      'bg-gray-100 text-gray-600',
  professional: 'bg-blue-100 text-blue-700',
  enterprise:   'bg-purple-100 text-purple-700',
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useOrganization(orgId: string) {
  return useQuery<Organization>({
    queryKey: ['organization', orgId],
    queryFn: () => apiClient.get<Organization>(`/organizations/${orgId}`),
    enabled: Boolean(orgId),
    staleTime: 60_000,
  });
}

function useOrgStats(orgId: string) {
  return useQuery<OrgStats>({
    queryKey: ['organization-stats', orgId],
    queryFn: () => apiClient.get<OrgStats>(`/organizations/${orgId}/stats`),
    enabled: Boolean(orgId),
    staleTime: 60_000,
  });
}

function useUpdateOrganization(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpdateOrganizationDto) =>
      apiClient.patch<Organization>(`/organizations/${orgId}`, dto),
    onSuccess: (updated) => {
      qc.setQueryData(['organization', orgId], updated);
      qc.invalidateQueries({ queryKey: ['organization', orgId] });
    },
  });
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function PlanBadge({ plan }: { plan: string }) {
  const colors = PLAN_COLORS[plan] ?? 'bg-gray-100 text-gray-600';
  const label  = PLAN_LABELS[plan] ?? plan;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${colors}`}>
      {label}
    </span>
  );
}

function StatSkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
      <div className="h-3 w-24 rounded bg-gray-200 animate-pulse" />
      <div className="h-7 w-12 rounded bg-gray-200 animate-pulse" />
      <div className="h-2.5 w-20 rounded bg-gray-100 animate-pulse" />
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: number;
  sub?: string;
  icon: React.ReactNode;
  iconBg: string;
}

function StatCard({ label, value, sub, icon, iconBg }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-gray-500 font-medium">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value.toLocaleString('es-CL')}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
        <div className={`p-2.5 rounded-xl flex-shrink-0 ${iconBg}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

// ─── Main inner component ─────────────────────────────────────────────────────

function OrganizationPageInner() {
  const { user, hasRole } = useUser();
  const orgId = user?.organizationId ?? '';

  const { data: org, isLoading: orgLoading, isError: orgError } = useOrganization(orgId);
  const { data: stats, isLoading: statsLoading } = useOrgStats(orgId);
  const updateOrg = useUpdateOrganization(orgId);

  // Editable form state — seeded from fetched org
  const [name, setName]           = useState('');
  const [logoUrl, setLogoUrl]     = useState('');
  const [primaryColor, setPrimaryColor] = useState('#0F2D4A');
  const [hexInput, setHexInput]   = useState('#0F2D4A');
  const [toastMsg, setToastMsg]   = useState('');
  const [toastOk, setToastOk]     = useState(true);

  // Track whether the user has made any changes
  const dirty =
    org !== undefined &&
    (name !== (org.name ?? '') ||
      logoUrl !== (org.logoUrl ?? '') ||
      primaryColor !== (org.primaryColor ?? '#0F2D4A'));

  // Seed form when data arrives (only once)
  const seeded = useRef(false);
  useEffect(() => {
    if (org && !seeded.current) {
      setName(org.name);
      setLogoUrl(org.logoUrl ?? '');
      setPrimaryColor(org.primaryColor ?? '#0F2D4A');
      setHexInput(org.primaryColor ?? '#0F2D4A');
      seeded.current = true;
    }
  }, [org]);

  // Keep hex text input in sync with color picker
  function handleColorPickerChange(val: string) {
    setPrimaryColor(val);
    setHexInput(val);
  }

  function handleHexInputChange(val: string) {
    setHexInput(val);
    // Only propagate valid 6-digit hex values
    if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
      setPrimaryColor(val);
    }
  }

  function showToast(msg: string, ok = true) {
    setToastMsg(msg);
    setToastOk(ok);
    setTimeout(() => setToastMsg(''), 3500);
  }

  async function handleSave() {
    if (!dirty || updateOrg.isPending) return;
    const dto: UpdateOrganizationDto = {};
    if (name !== org?.name) dto.name = name.trim();
    if (logoUrl !== (org?.logoUrl ?? '')) dto.logoUrl = logoUrl.trim() || undefined;
    if (primaryColor !== org?.primaryColor) dto.primaryColor = primaryColor;

    try {
      await updateOrg.mutateAsync(dto);
      showToast('Cambios guardados correctamente', true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al guardar';
      showToast(msg, false);
    }
  }

  // ── Permission guard ──
  if (!hasRole(['ADMIN', 'CAE'])) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Organización" />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
          <div className="p-4 bg-amber-50 rounded-full">
            <ShieldAlert className="h-10 w-10 text-amber-500" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Sin permisos</h2>
            <p className="text-sm text-gray-500 mt-1 max-w-xs">
              Necesitas el rol de Administrador o CAE para acceder a esta sección.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Full-page loading ──
  if (orgLoading) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Organización" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (orgError || !org) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Organización" />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
          <AlertCircle className="h-10 w-10 text-red-400" />
          <p className="text-sm font-medium text-gray-700">No se pudo cargar la organización.</p>
        </div>
      </div>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Organización"
        breadcrumbs={[
          { label: 'Admin' },
          { label: 'Organización' },
        ]}
      />

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 max-w-3xl mx-auto w-full">

        {/* Page heading */}
        <div>
          <h1 className="text-xl font-bold text-gray-900">Perfil de la organización</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Gestiona la identidad y configuración de <span className="font-medium text-gray-700">{org.name}</span>
          </p>
        </div>

        {/* ── Section A: Editable info ──────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          {/* Header row: section title + plan badge + created date */}
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <p className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              Información general
            </p>
            <div className="flex items-center gap-3">
              <PlanBadge plan={org.plan} />
              <span className="text-xs text-gray-400">
                Creado el {formatDate(org.createdAt)}
              </span>
            </div>
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
              <Building2 className="h-3.5 w-3.5 text-gray-400" />
              Nombre de la organización <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Nombre de la organización"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/20 focus:border-[#0F2D4A] bg-white placeholder-gray-300"
            />
          </div>

          {/* Primary color */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
              <Palette className="h-3.5 w-3.5 text-gray-400" />
              Color primario
            </label>
            <div className="flex items-center gap-3">
              {/* Color swatch / native picker */}
              <div className="relative flex-shrink-0">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={e => handleColorPickerChange(e.target.value)}
                  className="h-9 w-12 rounded-lg border border-gray-200 cursor-pointer p-0.5 bg-white"
                  title="Elegir color"
                />
              </div>
              {/* Hex text input */}
              <input
                type="text"
                value={hexInput}
                onChange={e => handleHexInputChange(e.target.value)}
                maxLength={7}
                placeholder="#0F2D4A"
                spellCheck={false}
                className="w-32 text-sm font-mono border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/20 focus:border-[#0F2D4A] bg-white"
              />
              {/* Live preview chip */}
              <div
                className="h-9 w-24 rounded-lg flex items-center justify-center text-xs font-medium text-white shadow-sm flex-shrink-0"
                style={{ backgroundColor: /^#[0-9A-Fa-f]{6}$/.test(primaryColor) ? primaryColor : '#0F2D4A' }}
              >
                Vista previa
              </div>
            </div>
          </div>

          {/* Logo URL */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
              <ImageIcon className="h-3.5 w-3.5 text-gray-400" />
              URL del logotipo <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <div className="flex items-center gap-3">
              <input
                type="url"
                value={logoUrl}
                onChange={e => setLogoUrl(e.target.value)}
                placeholder="https://ejemplo.com/logo.png"
                className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/20 focus:border-[#0F2D4A] bg-white placeholder-gray-300"
              />
              {/* Logo preview */}
              {logoUrl && (
                <div className="flex-shrink-0">
                  <img
                    src={logoUrl}
                    alt="Logotipo"
                    className="h-10 w-auto max-w-[80px] rounded-lg border border-gray-200 object-contain bg-gray-50 p-1"
                    onError={e => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Slug (read-only) */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-600">Slug</label>
            <div className="text-sm text-gray-500 font-mono bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 select-all">
              {org.slug}
            </div>
          </div>

          {/* Save button */}
          <div className="flex justify-end pt-1">
            <button
              onClick={handleSave}
              disabled={!dirty || updateOrg.isPending || !name.trim()}
              className="flex items-center gap-2 bg-[#0F2D4A] text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-[#1a3f5f] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {updateOrg.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Guardando…
                </>
              ) : (
                'Guardar cambios'
              )}
            </button>
          </div>
        </div>

        {/* ── Section B: Stats grid ─────────────────────────────────────────── */}
        <div>
          <p className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
            Estadísticas
          </p>

          {statsLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <StatSkeletonCard key={i} />
              ))}
            </div>
          ) : stats ? (
            <div className="grid grid-cols-2 gap-4">
              <StatCard
                label="Auditorías activas"
                value={stats.activeAudits}
                sub={`de ${stats.totalAudits} en total`}
                icon={<FileSearch className="h-5 w-5 text-[#0F2D4A]" />}
                iconBg="bg-blue-50"
              />
              <StatCard
                label="Hallazgos abiertos"
                value={stats.openFindings}
                sub={`de ${stats.totalFindings} en total`}
                icon={<ClipboardList className="h-5 w-5 text-amber-600" />}
                iconBg="bg-amber-50"
              />
              <StatCard
                label="Papeles de trabajo"
                value={stats.totalWorkingPapers}
                icon={<FileText className="h-5 w-5 text-emerald-600" />}
                iconBg="bg-emerald-50"
              />
              <StatCard
                label="Usuarios activos"
                value={stats.totalUsers}
                icon={<Users className="h-5 w-5 text-indigo-600" />}
                iconBg="bg-indigo-50"
              />
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-8 flex flex-col items-center gap-3 text-center">
              <AlertCircle className="h-8 w-8 text-gray-300" />
              <p className="text-sm text-gray-500">No se pudieron cargar las estadísticas.</p>
            </div>
          )}
        </div>

        {/* ── Section C: Danger zone ────────────────────────────────────────── */}
        <div className="rounded-xl border border-red-200 bg-red-50/30 p-6 space-y-4">
          <div className="flex items-center gap-2">
            <TriangleAlert className="h-4 w-4 text-red-500 flex-shrink-0" />
            <p className="text-sm font-semibold text-red-700 uppercase tracking-wide">
              Zona de Peligro
            </p>
          </div>

          {/* Exportar datos */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm font-medium text-gray-800">Exportar datos</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Descarga un archivo con todos los datos de la organización.
              </p>
            </div>
            <button
              disabled
              title="Próximamente"
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-red-200 text-sm font-medium text-red-400 bg-white cursor-not-allowed opacity-60"
            >
              <Download className="h-4 w-4" />
              Exportar datos
              <span className="ml-1 text-[10px] font-semibold bg-red-100 text-red-500 px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                Próximamente
              </span>
            </button>
          </div>
        </div>

      </div>

      {/* Toast */}
      {toastMsg && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-5 py-2.5 text-sm rounded-xl shadow-lg transition-all ${
            toastOk
              ? 'bg-gray-900 text-white'
              : 'bg-red-600 text-white'
          }`}
        >
          {toastOk
            ? <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
            : <AlertCircle className="h-4 w-4 text-red-200 flex-shrink-0" />
          }
          {toastMsg}
        </div>
      )}
    </div>
  );
}

// ─── Page export ──────────────────────────────────────────────────────────────

export default function OrganizationPage() {
  return <OrganizationPageInner />;
}
