'use client';

import { cn } from '@/lib/utils';
import type { Attendance } from '@/hooks/useTimesheet';

const WEEKDAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

// Horas registradas manda sobre cualquier otra clasificación del día — un fin de
// semana o festivo TRABAJADO es información real (horas extra), no debe ocultarse
// bajo el estilo genérico de "no laboral".
function dayCellTone(day: Attendance['days'][number]): string {
  if (day.totalHours > 0) return 'bg-emerald-50/60 border-emerald-100';
  if (day.hasGap) return 'bg-red-50 border-red-100';
  if (day.isHoliday) return 'bg-indigo-50 border-indigo-100';
  if (day.isWeekend) return 'bg-gray-50 border-gray-100';
  return 'bg-white border-gray-100';
}

export function AttendanceCalendar({ data }: { data: Attendance }) {
  const firstDate = new Date(`${data.days[0]?.date ?? `${data.year}-${String(data.month).padStart(2, '0')}-01`}T00:00:00`);
  const leadingBlanks = firstDate.getDay(); // 0=Dom … alinea el día 1 a su columna de weekday

  return (
    <div className="space-y-4">
      {/* Resumen del mes */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'A encargos',        value: `${data.summary.totalBillable.toFixed(1)}h`, color: 'text-emerald-600' },
          { label: 'Administrativas',   value: `${data.summary.totalAdmin.toFixed(1)}h`,     color: 'text-amber-600' },
          { label: 'Ausencias',         value: `${data.summary.totalLeave.toFixed(1)}h`,      color: 'text-blue-600' },
          { label: 'Festivos',          value: data.summary.holidayDays,                      color: 'text-indigo-600' },
          { label: 'Días sin registrar', value: data.summary.gapDays,                          color: data.summary.gapDays > 0 ? 'text-red-600' : 'text-gray-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl border border-gray-200 bg-white p-3">
            <p className={cn('text-lg font-bold', color)}>{value}</p>
            <p className="text-[11px] text-gray-500">{label}</p>
          </div>
        ))}
      </div>

      {/* Calendario */}
      <div className="rounded-xl border border-gray-200 bg-white p-3">
        <div className="grid grid-cols-7 gap-1.5 mb-1.5">
          {WEEKDAY_LABELS.map(w => (
            <div key={w} className="text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: leadingBlanks }).map((_, i) => <div key={`blank-${i}`} />)}
          {data.days.map(day => (
            <div
              key={day.date}
              title={day.holidayLabel ?? undefined}
              className={cn('rounded-lg border p-1.5 min-h-[64px] flex flex-col', dayCellTone(day))}
            >
              <span className="text-[11px] font-semibold text-gray-500">{Number(day.date.slice(8, 10))}</span>
              {day.totalHours > 0 ? (
                <div className="mt-0.5 space-y-0.5">
                  {day.billableHours > 0 && <p className="text-[10px] text-emerald-700 font-medium">{day.billableHours}h enc.</p>}
                  {day.adminHours > 0 && <p className="text-[10px] text-amber-700">{day.adminHours}h adm.</p>}
                  {day.leaveHours > 0 && <p className="text-[10px] text-blue-700">{day.leaveHours}h aus.</p>}
                  {(day.isHoliday || day.isWeekend) && (
                    <p className="text-[8px] text-gray-400">{day.isHoliday ? day.holidayLabel : 'Fin de semana'}</p>
                  )}
                </div>
              ) : day.isHoliday ? (
                <span className="text-[9px] text-indigo-600 leading-tight mt-0.5 line-clamp-2">{day.holidayLabel}</span>
              ) : day.isWeekend ? (
                <span className="text-[9px] text-gray-300 mt-0.5">—</span>
              ) : day.isFuture ? (
                <span className="text-[9px] text-gray-200 mt-0.5">—</span>
              ) : (
                <span className="text-[9px] text-red-500 font-medium mt-0.5">Sin registrar</span>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100 text-[10px] text-gray-500 flex-wrap">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-50 border border-emerald-100" /> Con horas</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-red-50 border border-red-100" /> Sin registrar</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-indigo-50 border border-indigo-100" /> Festivo</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-gray-50 border border-gray-100" /> Fin de semana</span>
        </div>
      </div>
    </div>
  );
}
