'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays, Users, Plus, Pencil, Trash2, Loader2, ShieldAlert,
  AlertCircle, ArrowRight, ChevronDown, X,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { useUser } from '@/hooks/useUser';
import { cn } from '@/lib/utils';
import {
  useHolidays, useCreateHoliday, useUpdateHoliday, useDeleteHoliday,
  useTeamAvailabilityProfiles, useUpsertAvailabilityProfile, useOrgUsersList,
  HolidayConfig, UserAvailabilityProfile,
} from '@/hooks/useCapacity';

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - 1 + i);

const DEFAULT_AVAILABILITY = {
  workingDaysPerWeek: 5,
  standardDailyHours: 8,
  annualVacationDays: 15,
  estimatedSickDays:  5,
  estimatedLeaveDays: 3,
};

// ─── Year selector (shared) ────────────────────────────────────────────────────

function YearSelect({ year, onChange }: { year: number; onChange: (y: number) => void }) {
  return (
    <div className="relative">
      <select
        value={year}
        onChange={e => onChange(Number(e.target.value))}
        className="appearance-none pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/20 focus:border-[#0F2D4A] font-medium text-gray-700"
      >
        {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
    </div>
  );
}

// ─── Holiday modal ──────────────────────────────────────────────────────────────

function HolidayModal({
  initial, onClose, onSave, isPending,
}: {
  initial?: HolidayConfig;
  onClose: () => void;
  onSave: (data: { date: string; label: string; recurring: boolean }) => void;
  isPending: boolean;
}) {
  const [date, setDate] = useState(initial?.date?.slice(0, 10) ?? '');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [recurring, setRecurring] = useState(initial?.recurring ?? false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">
            {initial ? 'Editar festivo' : 'Agregar festivo'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha *</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/20 focus:border-[#0F2D4A]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Etiqueta *</label>
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="Ej. Día de la Independencia"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/20 focus:border-[#0F2D4A]"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={recurring}
              onChange={e => setRecurring(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-[#0F2D4A] focus:ring-[#0F2D4A]/20"
            />
            Se repite cada año (mismo mes/día)
          </label>
        </div>
        <div className="px-6 py-4 border-t flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50 transition-colors"
            disabled={isPending}
          >Cancelar</button>
          <button
            onClick={() => onSave({ date, label, recurring })}
            disabled={!date || !label.trim() || isPending}
            className="px-4 py-2 text-sm rounded-lg bg-[#0F2D4A] text-white hover:bg-[#1a3f5f] disabled:opacity-50 flex items-center gap-2 transition-colors"
          >
            {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Holidays tab ───────────────────────────────────────────────────────────────

function HolidaysTab({ year }: { year: number }) {
  const { data: holidays = [], isLoading, isError } = useHolidays(year);
  const createHoliday = useCreateHoliday();
  const updateHoliday = useUpdateHoliday();
  const deleteHoliday = useDeleteHoliday();

  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit'; item: HolidayConfig } | null>(null);
  const isPending = createHoliday.isPending || updateHoliday.isPending;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Días festivos {year}</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Se descuentan automáticamente al calcular los días laborales disponibles del año
          </p>
        </div>
        <button
          onClick={() => setModal({ mode: 'create' })}
          className="flex items-center gap-2 px-4 py-2 bg-[#0F2D4A] text-white text-sm rounded-lg hover:bg-[#1a3f5f] transition-colors"
        >
          <Plus className="w-4 h-4" /> Agregar festivo
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" /> Cargando…
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2 text-center text-gray-500">
          <AlertCircle className="w-8 h-8 text-red-400" />
          <p className="text-sm">Error al cargar los festivos</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border divide-y">
          {holidays.map(h => (
            <div key={h.id} className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 transition-colors">
              <CalendarDays className="w-4 h-4 text-gray-300 flex-shrink-0" />
              <span className="text-sm font-mono text-gray-600 w-28 shrink-0">
                {new Date(h.date).toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })}
              </span>
              <span className="text-sm text-gray-800 flex-1">{h.label}</span>
              {h.recurring && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 shrink-0">
                  Se repite cada año
                </span>
              )}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setModal({ mode: 'edit', item: h })}
                  className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
                  title="Editar"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => { if (confirm(`¿Eliminar el festivo "${h.label}"?`)) deleteHoliday.mutate(h.id); }}
                  disabled={deleteHoliday.isPending}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 disabled:opacity-40 transition-colors"
                  title="Eliminar"
                >
                  {deleteHoliday.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
            </div>
          ))}
          {holidays.length === 0 && (
            <div className="text-center py-10 text-gray-400 text-sm">No hay festivos configurados para {year}</div>
          )}
        </div>
      )}

      {modal && (
        <HolidayModal
          initial={modal.mode === 'edit' ? modal.item : undefined}
          onClose={() => setModal(null)}
          isPending={isPending}
          onSave={(data) => {
            if (modal.mode === 'create') {
              createHoliday.mutate(data, { onSuccess: () => setModal(null) });
            } else {
              updateHoliday.mutate({ id: modal.item.id, data }, { onSuccess: () => setModal(null) });
            }
          }}
        />
      )}
    </div>
  );
}

// ─── Availability tab ───────────────────────────────────────────────────────────

function CascadeRow({ label, value, unit, highlight }: { label: string; value: number; unit: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className={cn('text-sm', highlight ? 'font-semibold text-gray-900' : 'text-gray-600')}>{label}</span>
      <span className={cn('text-sm font-mono', highlight ? 'font-bold text-[#0F2D4A]' : 'text-gray-800')}>
        {value.toLocaleString('es', { maximumFractionDigits: 1 })} {unit}
      </span>
    </div>
  );
}

function AvailabilityTab({ year }: { year: number }) {
  const { data: users = [], isLoading: loadingUsers } = useOrgUsersList();
  const { data: profiles = [], isLoading: loadingProfiles } = useTeamAvailabilityProfiles(year);
  const upsert = useUpsertAvailabilityProfile();

  const [userId, setUserId] = useState('');
  const [toastMsg, setToastMsg] = useState('');

  useEffect(() => {
    if (!userId && users.length > 0) setUserId(users[0].id);
  }, [users, userId]);

  const existing = useMemo(
    () => profiles.find(p => p.userId === userId),
    [profiles, userId],
  );

  const [form, setForm] = useState(DEFAULT_AVAILABILITY);

  // Re-seed el formulario cuando cambia el empleado/año o llega su perfil existente
  useEffect(() => {
    setForm(existing ? {
      workingDaysPerWeek: existing.workingDaysPerWeek,
      standardDailyHours: existing.standardDailyHours,
      annualVacationDays: existing.annualVacationDays,
      estimatedSickDays:  existing.estimatedSickDays,
      estimatedLeaveDays: existing.estimatedLeaveDays,
    } : DEFAULT_AVAILABILITY);
  }, [existing, userId, year]);

  function showToast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3500);
  }

  async function handleSave() {
    if (!userId) return;
    try {
      await upsert.mutateAsync({ userId, year, ...form });
      showToast('Disponibilidad guardada correctamente');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al guardar');
    }
  }

  const selectedUser = users.find(u => u.id === userId);
  const numCls = 'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/20 focus:border-[#0F2D4A]';

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-gray-800">Disponibilidad por persona — {year}</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Días y horas netas disponibles de cada auditor, usadas para calcular su tasa de costeo
        </p>
      </div>

      {/* Employee selector */}
      <div className="mb-5 max-w-xs">
        <label className="block text-xs font-medium text-gray-600 mb-1">Empleado</label>
        <div className="relative">
          <select
            value={userId}
            onChange={e => setUserId(e.target.value)}
            disabled={loadingUsers}
            className="w-full appearance-none pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/20 focus:border-[#0F2D4A]"
          >
            {loadingUsers && <option>Cargando…</option>}
            {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {loadingProfiles ? (
        <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" /> Cargando…
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Form */}
          <div className="bg-white rounded-xl border p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Días laborales / semana</label>
                <input
                  type="number" min={1} max={7} value={form.workingDaysPerWeek}
                  onChange={e => setForm(f => ({ ...f, workingDaysPerWeek: Number(e.target.value) }))}
                  className={numCls}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Horas diarias estándar</label>
                <input
                  type="number" min={0} step={0.5} value={form.standardDailyHours}
                  onChange={e => setForm(f => ({ ...f, standardDailyHours: Number(e.target.value) }))}
                  className={numCls}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Vacaciones anuales (días)</label>
              <input
                type="number" min={0} value={form.annualVacationDays}
                onChange={e => setForm(f => ({ ...f, annualVacationDays: Number(e.target.value) }))}
                className={numCls}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Incapacidades estimadas (días)</label>
                <input
                  type="number" min={0} value={form.estimatedSickDays}
                  onChange={e => setForm(f => ({ ...f, estimatedSickDays: Number(e.target.value) }))}
                  className={numCls}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Otros permisos estimados (días)</label>
                <input
                  type="number" min={0} value={form.estimatedLeaveDays}
                  onChange={e => setForm(f => ({ ...f, estimatedLeaveDays: Number(e.target.value) }))}
                  className={numCls}
                />
              </div>
            </div>

            <button
              onClick={handleSave}
              disabled={!userId || upsert.isPending}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0F2D4A] text-white text-sm font-medium rounded-lg hover:bg-[#1a3f5f] disabled:opacity-50 transition-colors"
            >
              {upsert.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {upsert.isPending ? 'Guardando…' : 'Guardar disponibilidad'}
            </button>
          </div>

          {/* Result card — cascade */}
          <div className="bg-white rounded-xl border p-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Cálculo de disponibilidad
            </p>
            <p className="text-xs text-gray-400 mb-3">
              {selectedUser ? selectedUser.name : '—'} · {year}
            </p>

            {existing ? (
              <div className="divide-y">
                <CascadeRow label="Días laborales brutos del año" value={existing.grossWorkingDays} unit="días" />
                <div className="flex items-center gap-2 py-1 text-gray-300">
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span className="text-[11px] text-gray-400">− vacaciones, incapacidades y permisos</span>
                </div>
                <CascadeRow label="Días netos disponibles" value={existing.netAvailableDays} unit="días" />
                <div className="flex items-center gap-2 py-1 text-gray-300">
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span className="text-[11px] text-gray-400">× horas diarias estándar</span>
                </div>
                <CascadeRow label="Horas netas disponibles" value={existing.netAvailableHours} unit="hrs" highlight />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center text-gray-400 gap-2">
                <Users className="w-8 h-8 opacity-30" />
                <p className="text-xs max-w-[220px]">
                  Aún no hay un perfil de disponibilidad guardado para este empleado en {year}. Guarda el formulario para ver el cálculo.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 bg-gray-900 text-white text-sm rounded-xl shadow-lg">
          {toastMsg}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FirmCalendarPage() {
  const { hasRole } = useUser();
  const [tab, setTab] = useState<'holidays' | 'availability'>('holidays');
  const [year, setYear] = useState(CURRENT_YEAR);

  // Defensa en profundidad: todos los endpoints de /capacity usados en esta
  // pantalla (festivos CRUD, lista de disponibilidad del equipo, upsert) exigen
  // rol AUDIT_MANAGER+ en el backend.
  if (!hasRole(['AUDIT_MANAGER'])) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Calendario y Capacidad" />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
          <div className="p-4 bg-amber-50 rounded-full">
            <ShieldAlert className="h-10 w-10 text-amber-500" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">No tienes permiso para ver esta información</h2>
            <p className="text-sm text-gray-500 mt-1 max-w-xs">
              Necesitas el rol de Gerente de Auditoría o superior para acceder a esta sección.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Calendario y Capacidad"
        breadcrumbs={[{ label: 'Admin' }, { label: 'Calendario y Capacidad' }]}
      />

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 max-w-5xl mx-auto w-full">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Calendario y Capacidad de la Firma</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Configura los días festivos y la disponibilidad anual de cada persona del equipo
          </p>
        </div>

        {/* Tabs + year selector */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
            <button
              onClick={() => setTab('holidays')}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                tab === 'holidays' ? 'bg-white shadow text-[#0F2D4A]' : 'text-gray-600 hover:text-gray-900',
              )}
            >
              <CalendarDays className="w-4 h-4" />
              Días Festivos
            </button>
            <button
              onClick={() => setTab('availability')}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                tab === 'availability' ? 'bg-white shadow text-[#0F2D4A]' : 'text-gray-600 hover:text-gray-900',
              )}
            >
              <Users className="w-4 h-4" />
              Disponibilidad por Persona
            </button>
          </div>

          <YearSelect year={year} onChange={setYear} />
        </div>

        {tab === 'holidays' ? <HolidaysTab year={year} /> : <AvailabilityTab year={year} />}
      </div>
    </div>
  );
}
