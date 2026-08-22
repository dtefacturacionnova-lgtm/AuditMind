'use client';

import { useState } from 'react';
import { Loader2, ShieldAlert } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { useUser } from '@/hooks/useUser';
import { useOrgUsersList } from '@/hooks/useCapacity';
import { useAttendance } from '@/hooks/useTimesheet';
import { AttendanceCalendar } from '@/components/timesheet/AttendanceCalendar';

const MONTH_LABELS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const NOW = new Date();
const YEAR_OPTIONS = Array.from({ length: 4 }, (_, i) => NOW.getFullYear() - 1 + i);

export default function AttendancePage() {
  const { hasRole } = useUser();
  const canView = hasRole(['AUDIT_MANAGER', 'CAE', 'ADMIN', 'SUPER_ADMIN']);
  const { data: users = [], isLoading: loadingUsers } = useOrgUsersList();
  const [userId, setUserId] = useState('');
  const [year, setYear] = useState(NOW.getFullYear());
  const [month, setMonth] = useState(NOW.getMonth() + 1);

  const { data, isLoading } = useAttendance(year, month, userId || undefined);

  if (!canView) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Asistencia" />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
          <div className="p-4 bg-amber-50 rounded-full">
            <ShieldAlert className="h-10 w-10 text-amber-500" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">No tienes permiso para ver esta información</h2>
            <p className="text-sm text-gray-500 mt-1 max-w-xs">
              Necesitas el rol de Gerente de Auditoría o superior para ver la asistencia de otras personas.
              Tu propio calendario está disponible en Mi Utilización.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Asistencia" breadcrumbs={[{ label: 'Horas y Rentabilidad' }, { label: 'Asistencia' }]} />

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 max-w-4xl mx-auto w-full">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Calendario de horas por persona</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Horas a encargos, administrativas, ausencias y festivos — día a día, por persona del equipo.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={userId}
            onChange={e => setUserId(e.target.value)}
            className="pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/20 focus:border-[#0F2D4A] font-medium text-gray-700"
          >
            <option value="">Selecciona una persona…</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <select
            value={month}
            onChange={e => setMonth(Number(e.target.value))}
            className="pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/20 focus:border-[#0F2D4A] font-medium text-gray-700"
          >
            {MONTH_LABELS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/20 focus:border-[#0F2D4A] font-medium text-gray-700"
          >
            {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {!userId ? (
          <p className="text-sm text-gray-400 bg-gray-50 rounded-lg px-4 py-6 text-center">
            Selecciona una persona para ver su calendario de {MONTH_LABELS[month - 1]} {year}.
          </p>
        ) : loadingUsers || isLoading || !data ? (
          <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" /> Cargando…
          </div>
        ) : (
          <>
            <h2 className="text-sm font-semibold text-gray-700">{data.userName} — {MONTH_LABELS[month - 1]} {year}</h2>
            <AttendanceCalendar data={data} />
          </>
        )}
      </div>
    </div>
  );
}
