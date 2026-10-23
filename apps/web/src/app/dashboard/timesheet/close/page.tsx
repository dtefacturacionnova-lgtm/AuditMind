'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle, AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, Eye, Loader2, LockKeyhole, LockOpen,
  Mail, Settings2, ShieldAlert, XCircle,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Modal, btnGhost, btnPrimary, inputCls } from '@/components/timesheet/Modal';
import { useUser } from '@/hooks/useUser';
import {
  useAdjustments, useClosePeriod, useDecideAdjustment, useHoursCloseSettings, usePeriodOverview, usePersonEntries, useReopenPeriod,
  useRemindPeriod, useUpdateHoursCloseSettings,
  type Adjustment, type PeriodPersonRow, type PeriodWarning, type WarningCode,
} from '@/hooks/useHoursClose';
import { CATEGORY_LABELS } from '@/hooks/useTimesheet';
import { NON_BILLABLE_REASON_LABELS, formatHours, monthName, parseDateKey } from '@/lib/timesheet-week';

const MANAGER_ROLES = new Set(['AUDIT_MANAGER', 'CAE', 'ADMIN', 'SUPER_ADMIN']);
const DIRECTION_ROLES = new Set(['CAE', 'ADMIN', 'SUPER_ADMIN']);
const ROLE_LABELS: Record<string, string> = {
  AUDITOR: 'Auditor', SENIOR_AUDITOR: 'Auditor sénior', AUDIT_MANAGER: 'Gerente', CAE: 'Dirección (CAE)', ADMIN: 'Administrador', SUPER_ADMIN: 'Superadministrador',
};
const WARNING_LABELS: Record<WarningCode, string> = {
  MISSING_DAYS: 'Días sin horas', HOURS_LOW: 'Pocas horas', HOURS_HIGH: 'Muchas horas', LONG_DAYS: 'Días largos',
  NO_DESCRIPTION: 'Sin descripción', NO_COST_PROFILE: 'Sin perfil de costeo', NO_AVAILABILITY_PROFILE: 'Sin perfil de disponibilidad',
};
const fmtDate = (key: string) => parseDateKey(key.slice(0, 10)).toLocaleDateString('es-SV', { day: 'numeric', month: 'short', year: 'numeric' });

/** Mes anterior al actual: el que normalmente toca cerrar. */
function defaultPeriod() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export default function HoursClosePage() {
  const { user } = useUser();
  const isManager = MANAGER_ROLES.has(user?.role ?? '');
  const isDirection = DIRECTION_ROLES.has(user?.role ?? '');

  const [period, setPeriod] = useState(defaultPeriod);
  const shift = (n: number) => setPeriod(p => {
    const idx = p.year * 12 + (p.month - 1) + n;
    return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
  });

  const { data: settings } = useHoursCloseSettings();
  const { data: overview, isLoading, error } = usePeriodOverview(period.year, period.month, { enabled: isManager });
  const { data: pending = [] } = useAdjustments('PENDING');
  const remind = useRemindPeriod();

  const [detail, setDetail] = useState<PeriodPersonRow | null>(null);
  const [closing, setClosing] = useState<PeriodPersonRow | null>(null);
  const [reopening, setReopening] = useState<PeriodPersonRow | null>(null);
  const [deciding, setDeciding] = useState<{ adjustment: Adjustment; approve: boolean } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [notice, setNotice] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const rows = overview?.rows ?? [];
  const withMissing = rows.filter(r => r.status === 'OPEN' && r.missingDays.length > 0);
  const label = monthName(period);

  const handleRemind = async () => {
    try {
      const res = await remind.mutateAsync({ year: period.year, month: period.month });
      setNotice({ type: 'ok', text: res.candidates === 0 ? 'Nadie tiene días sin horas en este mes.' : `Recordatorio enviado a ${res.sent} de ${res.candidates} persona(s).` });
    } catch (e) {
      setNotice({ type: 'error', text: (e as Error).message });
    }
  };

  const pendingForMonth = useMemo(() => pending.filter(a => a.year === period.year && a.month === period.month).length, [pending, period]);

  if (user && !isManager) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Cierre de Horas" />
        <div className="p-6">
          <div className="max-w-xl rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-600 flex gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0" />
            <p>El cierre de horas lo hace un gerente o la dirección. Tú registras tus horas en <Link href="/dashboard/timesheet" className="text-blue-600 underline">Captura de Horas</Link>.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Cierre de Horas" />

      <div className="flex-1 overflow-auto p-6 space-y-5">

        {/* Mes y acciones */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button onClick={() => shift(-1)} className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-500" title="Mes anterior"><ChevronLeft className="w-4 h-4" /></button>
            <div className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-800 capitalize min-w-[11rem] text-center">{label}</div>
            <button onClick={() => shift(1)} className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-500" title="Mes siguiente"><ChevronRight className="w-4 h-4" /></button>
          </div>
          <div className="flex gap-2">
            {settings?.enabled && (
              <button
                onClick={handleRemind} disabled={remind.isPending || withMissing.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                title={withMissing.length === 0 ? 'Nadie tiene días sin horas' : `Avisar a ${withMissing.length} persona(s) con días sin horas`}
              >
                {remind.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                Recordar a quienes faltan ({withMissing.length})
              </button>
            )}
            {isDirection && (
              <button onClick={() => setShowSettings(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:bg-gray-50">
                <Settings2 className="w-3.5 h-3.5" /> Parámetros
              </button>
            )}
          </div>
        </div>

        {notice && (
          <div className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-medium ${notice.type === 'ok' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
            {notice.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />} {notice.text}
          </div>
        )}

        {settings && !settings.enabled && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
            <span>
              El cierre de horas está <strong>apagado</strong> en tu organización: nada se bloquea y no se pueden cerrar meses.
              {isDirection ? ' Puedes activarlo en «Parámetros».' : ' La dirección puede activarlo en «Parámetros».'}
              {' '}Mientras tanto ves el avance de cada persona.
            </span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-medium bg-red-50 text-red-600 border border-red-200">
            <AlertCircle className="w-4 h-4" /> {(error as Error).message}
          </div>
        )}

        {/* Resumen */}
        {overview && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Personas', value: overview.summary.people, tone: 'text-gray-900' },
              { label: 'Meses cerrados', value: `${overview.summary.closed} de ${overview.summary.people}`, tone: overview.summary.closed === overview.summary.people && overview.summary.people > 0 ? 'text-emerald-600' : 'text-gray-900' },
              { label: 'Con avisos', value: overview.summary.withWarnings, tone: overview.summary.withWarnings > 0 ? 'text-amber-600' : 'text-gray-900' },
              { label: 'Ajustes pendientes', value: overview.summary.pendingAdjustments, tone: overview.summary.pendingAdjustments > 0 ? 'text-blue-600' : 'text-gray-900' },
            ].map(c => (
              <div key={c.label} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
                <p className={`text-2xl font-bold ${c.tone}`}>{c.value}</p>
                <p className="text-xs text-gray-500">{c.label}</p>
              </div>
            ))}
          </div>
        )}
        {overview && overview.enabled && (
          <p className="text-xs text-gray-500">
            {overview.finished ? 'Plazos de este mes: ' : 'Este mes todavía no termina. Plazos: '}
            los auditores registran hasta el <strong>{fmtDate(overview.entryDeadline)}</strong> y el gerente cierra hasta el <strong>{fmtDate(overview.closeDeadline)}</strong>.
            {' '}Los avisos no bloquean el cierre: tú decides.
          </p>
        )}

        {/* Personas */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="flex justify-center py-14"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
          ) : rows.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">No hay personas que registren horas en esta organización.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-gray-200 text-gray-600">
                    <th className="text-left px-4 py-2.5 font-semibold">Persona</th>
                    <th className="text-center px-3 py-2.5 font-semibold">Días con horas</th>
                    <th className="text-right px-3 py-2.5 font-semibold">Horas / disponibles</th>
                    <th className="text-right px-3 py-2.5 font-semibold">Facturable</th>
                    <th className="text-left px-3 py-2.5 font-semibold">Avisos</th>
                    <th className="text-left px-3 py-2.5 font-semibold">Estado</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.userId} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 align-top">
                      <td className="px-4 py-2.5">
                        <p className="font-semibold text-gray-800">{r.name}</p>
                        <p className="text-gray-400">{ROLE_LABELS[r.role] ?? r.role}</p>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={r.missingDays.length > 0 ? 'font-semibold text-amber-700' : 'text-gray-700'}>{r.daysWithHours} / {r.businessDays}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-700">
                        {formatHours(r.totalHours)}{r.availableHours !== null ? <span className="text-gray-400"> / {formatHours(r.availableHours)}</span> : <span className="text-gray-300"> / —</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-700">
                        {formatHours(r.billableHours)}
                        {r.billableUtilizationPct !== null && <span className="block text-[10px] text-gray-400">{r.billableUtilizationPct}% de lo disponible</span>}
                      </td>
                      <td className="px-3 py-2.5"><Warnings warnings={r.warnings} /></td>
                      <td className="px-3 py-2.5">
                        {r.status === 'CLOSED' ? (
                          <span className="inline-flex flex-col">
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 font-medium w-fit"><LockKeyhole className="w-3 h-3" /> Cerrado</span>
                            <span className="text-[10px] text-gray-400 mt-0.5">{r.closedAt ? fmtDate(r.closedAt) : ''}{r.closedByName ? ` · ${r.closedByName}` : ''}</span>
                          </span>
                        ) : (
                          <span className="inline-flex flex-col">
                            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 text-gray-600 px-2 py-0.5 font-medium w-fit"><LockOpen className="w-3 h-3" /> Abierto</span>
                            {r.reopenedAt && <span className="text-[10px] text-gray-400 mt-0.5">Reabierto el {fmtDate(r.reopenedAt)}</span>}
                          </span>
                        )}
                        {r.pendingAdjustments > 0 && <span className="block text-[10px] text-blue-600 mt-0.5">{r.pendingAdjustments} ajuste(s) pendiente(s)</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <button onClick={() => setDetail(r)} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-gray-500 hover:bg-gray-100" title="Ver sus horas del mes"><Eye className="w-3.5 h-3.5" /> Ver</button>
                        {r.canClose && (
                          <button
                            onClick={() => setClosing(r)} disabled={!overview?.finished}
                            title={overview?.finished ? 'Cerrar el mes de esta persona' : 'Solo se cierran meses terminados'}
                            className="ml-1 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-40"
                          ><ClipboardCheck className="w-3.5 h-3.5" /> Cerrar</button>
                        )}
                        {r.canReopen && (
                          <button onClick={() => setReopening(r)} className="ml-1 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 font-medium hover:bg-gray-50"><LockOpen className="w-3.5 h-3.5" /> Reabrir</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Ajustes pendientes */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Pedidos de ajuste pendientes</h3>
            <span className="text-xs text-gray-400">{pending.length} en total{pendingForMonth ? ` · ${pendingForMonth} de ${label}` : ''}</span>
          </div>
          {pending.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">No hay pedidos esperando respuesta.</div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {pending.map(a => (
                <li key={a.id} className="px-5 py-3 flex flex-wrap items-start justify-between gap-3 text-xs">
                  <div className="space-y-0.5 min-w-0">
                    <p className="font-semibold text-gray-800">
                      {a.user.name} <span className="font-normal text-gray-400">· {monthName(a)}</span>
                    </p>
                    <p className="text-gray-600"><AdjustmentSummary a={a} /></p>
                    <p className="text-gray-500 italic">«{a.reason}»</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => setDeciding({ adjustment: a, approve: false })} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 font-medium hover:bg-gray-50"><XCircle className="w-3.5 h-3.5" /> Rechazar</button>
                    <button onClick={() => setDeciding({ adjustment: a, approve: true })} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700"><CheckCircle2 className="w-3.5 h-3.5" /> Aprobar</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {detail && <PersonDetailModal row={detail} year={period.year} month={period.month} onClose={() => setDetail(null)} />}
      {closing && <CloseModal row={closing} year={period.year} month={period.month} label={label} onClose={() => setClosing(null)} onDone={text => setNotice({ type: 'ok', text })} />}
      {reopening && <ReopenModal row={reopening} year={period.year} month={period.month} label={label} onClose={() => setReopening(null)} onDone={text => setNotice({ type: 'ok', text })} />}
      {deciding && <DecideModal adjustment={deciding.adjustment} approve={deciding.approve} onClose={() => setDeciding(null)} onDone={text => setNotice({ type: 'ok', text })} />}
      {showSettings && settings && <SettingsModal initial={settings} onClose={() => setShowSettings(false)} onDone={text => setNotice({ type: 'ok', text })} />}
    </div>
  );
}

// ─── Piezas ───────────────────────────────────────────────────────────────────
function Warnings({ warnings }: { warnings: PeriodWarning[] }) {
  if (warnings.length === 0) return <span className="text-emerald-600 font-medium">Sin avisos</span>;
  return (
    <div className="flex flex-wrap gap-1 max-w-[18rem]">
      {warnings.map(w => (
        <span key={w.code} title={w.detail} className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 px-2 py-0.5 text-[10px] font-medium">
          <AlertTriangle className="w-3 h-3" /> {WARNING_LABELS[w.code]}
        </span>
      ))}
    </div>
  );
}

function AdjustmentSummary({ a }: { a: Adjustment }) {
  const p = (a.payload ?? {}) as Record<string, unknown>;
  if (a.action === 'ADD') return <>Agregar {formatHours(Number(p.hours ?? 0))} el {fmtDate(String(p.workDate ?? ''))}{p.description ? ` — ${String(p.description)}` : ''}</>;
  if (a.action === 'DELETE') return <>Borrar {a.entry ? `${formatHours(a.entry.hours)} del ${fmtDate(a.entry.workDate)}${a.entry.description ? ` — ${a.entry.description}` : ''}` : 'una hora'}</>;
  const changes = Object.entries(p).filter(([, v]) => v !== undefined).map(([k, v]) => `${k === 'hours' ? 'horas' : k === 'description' ? 'descripción' : k}: ${String(v ?? '—')}`);
  return <>Cambiar {a.entry ? `la hora del ${fmtDate(a.entry.workDate)} (${formatHours(a.entry.hours)})` : 'una hora'} → {changes.join(', ') || 'sin detalle'}</>;
}

function ErrorLine({ text }: { text: string | null }) {
  if (!text) return null;
  return <div className="flex items-start gap-2 rounded-xl px-3 py-2 text-xs font-medium bg-red-50 text-red-600 border border-red-200"><AlertCircle className="w-4 h-4 shrink-0 mt-px" /> {text}</div>;
}

function PersonDetailModal({ row, year, month, onClose }: { row: PeriodPersonRow; year: number; month: number; onClose: () => void }) {
  const { data, isLoading, error } = usePersonEntries(row.userId, year, month);
  return (
    <Modal title={`Horas de ${row.name} · ${monthName({ year, month })}`} onClose={onClose} wide>
      {row.warnings.length > 0 && (
        <ul className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800 space-y-0.5">
          {row.warnings.map(w => <li key={w.code}>• {w.detail}</li>)}
          {row.missingDays.length > 0 && <li className="text-amber-700">Días sin horas: {row.missingDays.map(d => fmtDate(d)).join(', ')}</li>}
        </ul>
      )}
      {isLoading ? <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-blue-500" /></div> : error ? <ErrorLine text={(error as Error).message} /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="bg-gray-50 border-b border-gray-200 text-gray-600">
              <th className="text-left px-3 py-2 font-semibold">Día</th><th className="text-left px-3 py-2 font-semibold">Encargo o actividad</th>
              <th className="text-right px-3 py-2 font-semibold">Horas</th><th className="text-left px-3 py-2 font-semibold">Descripción</th>
            </tr></thead>
            <tbody>
              {(data?.entries ?? []).map(e => (
                <tr key={e.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-3 py-1.5 whitespace-nowrap text-gray-600">{fmtDate(e.workDate)}</td>
                  <td className="px-3 py-1.5 text-gray-700">
                    {e.auditTitle ?? CATEGORY_LABELS[e.category]}
                    {e.category === 'CLIENT_NON_BILLABLE' && <span className="ml-1.5 rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-[10px] font-medium">No facturable{e.nonBillableReason ? ` · ${NON_BILLABLE_REASON_LABELS[e.nonBillableReason]}` : ''}</span>}
                    {e.afterClose && <span className="ml-1.5 rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 text-[10px] font-medium">Ajuste posterior</span>}
                  </td>
                  <td className="px-3 py-1.5 text-right font-bold text-gray-800">{formatHours(e.hours)}</td>
                  <td className="px-3 py-1.5 text-gray-600">{e.description ?? <span className="text-red-400">sin descripción</span>}</td>
                </tr>
              ))}
              {data?.entries.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-400">Sin horas registradas en este mes.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

function CloseModal({ row, year, month, label, onClose, onDone }: { row: PeriodPersonRow; year: number; month: number; label: string; onClose: () => void; onDone: (t: string) => void }) {
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const close = useClosePeriod();
  const go = async () => {
    try {
      const res = await close.mutateAsync({ userId: row.userId, year, month, note: note.trim() || undefined });
      onDone(`Cerraste ${label} de ${row.name}: ${res.entryCount} registro(s), ${formatHours(res.totalHours)}${res.entriesWithoutCostRate ? ` (${res.entriesWithoutCostRate} sin perfil de costeo)` : ''}.`);
      onClose();
    } catch (e) { setError((e as Error).message); }
  };
  return (
    <Modal title={`Cerrar ${label} de ${row.name}`} icon={<ClipboardCheck className="w-4 h-4 text-blue-600" />} onClose={onClose}
      footer={<><button onClick={onClose} className={btnGhost}>Cancelar</button><button onClick={go} disabled={close.isPending} className={btnPrimary}>{close.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Cerrar el mes</button></>}>
      <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600 space-y-1">
        <p><strong>{formatHours(row.totalHours)}</strong> en {row.daysWithHours} de {row.businessDays} días hábiles{row.availableHours !== null ? `; ${formatHours(row.availableHours)} disponibles` : ''}.</p>
        <p>Al cerrar, sus horas, su costo por hora y su tarifa por encargo quedan fijos. Para cambiar algo después, la persona pide un ajuste o tú reabres el mes.</p>
      </div>
      {row.warnings.length > 0 ? (
        <ul className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800 space-y-0.5">
          <li className="font-semibold">Avisos (no impiden cerrar):</li>
          {row.warnings.map(w => <li key={w.code}>• {w.detail}</li>)}
        </ul>
      ) : <p className="text-xs text-emerald-700 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Sin avisos.</p>}
      <label className="block text-xs font-medium text-gray-600">Nota del cierre (opcional)
        <textarea rows={2} value={note} maxLength={1000} onChange={e => setNote(e.target.value)} className={`${inputCls} mt-1 resize-none`} placeholder="Por ejemplo: faltaban 2 días, confirmados con la persona" />
      </label>
      <ErrorLine text={error} />
    </Modal>
  );
}

function ReopenModal({ row, year, month, label, onClose, onDone }: { row: PeriodPersonRow; year: number; month: number; label: string; onClose: () => void; onDone: (t: string) => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const reopen = useReopenPeriod();
  const go = async () => {
    if (reason.trim().length < 5) { setError('Escribe el motivo (queda en la bitácora).'); return; }
    try {
      await reopen.mutateAsync({ userId: row.userId, year, month, reason: reason.trim() });
      onDone(`Reabriste ${label} de ${row.name}. Vuelve a ser provisional hasta que lo cierres de nuevo.`);
      onClose();
    } catch (e) { setError((e as Error).message); }
  };
  return (
    <Modal title={`Reabrir ${label} de ${row.name}`} icon={<LockOpen className="w-4 h-4 text-amber-600" />} onClose={onClose}
      footer={<><button onClick={onClose} className={btnGhost}>Cancelar</button><button onClick={go} disabled={reopen.isPending} className={btnPrimary}>{reopen.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Reabrir el mes</button></>}>
      <p className="text-xs text-gray-600">Mientras esté reabierto, la persona puede editar sus horas de ese mes y el costo y la tarifa dejan de estar fijos. Quedan constancia de quién lo reabrió, cuándo y por qué.</p>
      <label className="block text-xs font-medium text-gray-600">Motivo
        <textarea rows={2} value={reason} maxLength={1000} onChange={e => setReason(e.target.value)} className={`${inputCls} mt-1 resize-none`} placeholder="Por qué hace falta reabrirlo" />
      </label>
      <ErrorLine text={error} />
    </Modal>
  );
}

function DecideModal({ adjustment, approve, onClose, onDone }: { adjustment: Adjustment; approve: boolean; onClose: () => void; onDone: (t: string) => void }) {
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const decide = useDecideAdjustment();
  const go = async () => {
    try {
      await decide.mutateAsync({ id: adjustment.id, approve, note: note.trim() || undefined });
      onDone(approve ? 'Ajuste aprobado: las horas ya cambiaron y quedaron marcadas como posteriores al cierre.' : 'Pedido rechazado.');
      onClose();
    } catch (e) { setError((e as Error).message); }
  };
  return (
    <Modal title={approve ? 'Aprobar ajuste' : 'Rechazar ajuste'} icon={approve ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-gray-500" />} onClose={onClose}
      footer={<><button onClick={onClose} className={btnGhost}>Cancelar</button><button onClick={go} disabled={decide.isPending} className={btnPrimary}>{decide.isPending && <Loader2 className="w-4 h-4 animate-spin" />} {approve ? 'Aprobar' : 'Rechazar'}</button></>}>
      <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600 space-y-1">
        <p className="font-semibold text-gray-800">{adjustment.user.name} · {monthName(adjustment)}</p>
        <p><AdjustmentSummary a={adjustment} /></p>
        <p className="italic">«{adjustment.reason}»</p>
      </div>
      <label className="block text-xs font-medium text-gray-600">Nota para la persona (opcional)
        <textarea rows={2} value={note} maxLength={1000} onChange={e => setNote(e.target.value)} className={`${inputCls} mt-1 resize-none`} />
      </label>
      <ErrorLine text={error} />
    </Modal>
  );
}

function SettingsModal({ initial, onClose, onDone }: { initial: { enabled: boolean; entryDeadlineDay: number; closeDeadlineDay: number }; onClose: () => void; onDone: (t: string) => void }) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [entryDay, setEntryDay] = useState(String(initial.entryDeadlineDay));
  const [closeDay, setCloseDay] = useState(String(initial.closeDeadlineDay));
  const [error, setError] = useState<string | null>(null);
  const save = useUpdateHoursCloseSettings();
  const go = async () => {
    const a = Number(entryDay); const b = Number(closeDay);
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b > 28 || b < a) { setError('Los plazos son días hábiles entre 1 y 28, y el del gerente no puede ser anterior al del auditor.'); return; }
    try {
      await save.mutateAsync({ enabled, entryDeadlineDay: a, closeDeadlineDay: b });
      onDone(enabled ? 'Cierre de horas activado.' : 'Cierre de horas apagado: ya nada se bloquea.');
      onClose();
    } catch (e) { setError((e as Error).message); }
  };
  return (
    <Modal title="Parámetros del cierre de horas" icon={<Settings2 className="w-4 h-4 text-blue-600" />} onClose={onClose}
      footer={<><button onClick={onClose} className={btnGhost}>Cancelar</button><button onClick={go} disabled={save.isPending} className={btnPrimary}>{save.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Guardar</button></>}>
      <label className="flex items-start gap-3 rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-700">
        <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="mt-1 rounded border-gray-300" />
        <span>
          <strong>Activar el cierre de horas</strong>
          <span className="block text-xs text-gray-500">Un mes cerrado de una persona ya no se puede registrar, editar ni borrar; los cambios pasan por un pedido de ajuste. Las horas de cliente pasan a exigir descripción. Apagado, nada se bloquea: lo que se escriba en meses ya cerrados mientras esté apagado no queda congelado (reabre y vuelve a cerrar esos meses).</span>
        </span>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs font-medium text-gray-600">Los auditores registran hasta el día hábil
          <input type="number" min={1} max={28} value={entryDay} onChange={e => setEntryDay(e.target.value)} className={`${inputCls} mt-1`} />
        </label>
        <label className="block text-xs font-medium text-gray-600">El gerente cierra hasta el día hábil
          <input type="number" min={1} max={28} value={closeDay} onChange={e => setCloseDay(e.target.value)} className={`${inputCls} mt-1`} />
        </label>
      </div>
      <p className="text-xs text-gray-500">Los plazos del mes siguiente solo orientan y fijan cuándo salen los recordatorios por correo; no bloquean a nadie.</p>
      <ErrorLine text={error} />
    </Modal>
  );
}
