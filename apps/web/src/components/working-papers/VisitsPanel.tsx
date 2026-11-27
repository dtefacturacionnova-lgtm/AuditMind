'use client';

import { useRef, useState } from 'react';
import {
  AlertCircle, CalendarDays, CheckCircle2, FileSpreadsheet, Loader2, Lock, ArrowRightLeft, Target, X,
} from 'lucide-react';
import type { PaperSection } from '@/hooks/useWorkingPaperGraph';
import { useUser } from '@/hooks/useUser';
import { apiClient } from '@/lib/api-client';
import {
  AuditVisit, CompareStatus, VisitBalanceAccounts, useAuditVisits, useEnableVisits, useImportVisitBalance, useUpdateVisit,
  useVisitBalance, useVisitsCompare,
} from '@/hooks/useAuditVisits';
import {
  MAX_VISIT_ACCOUNTS, S1Row, VISIT_KINDS, VISIT_KIND_LABEL, VISIT_STATUS_LABEL, VisitAccountInput, VisitKind,
  balanceTotals, buildS1FromVisit, classificationDiffersFromS1, cutoffsProblem, defaultCutoffs, fmtDay, s1DiffersFromVisit,
  statusActions, toVisitAccounts,
} from '@/lib/visits/visit-base';
import { parseCSVWithReport } from './TrialBalancePanel';
import { VisitsBridge } from './VisitsBridge';

// ─── Utilidades ───────────────────────────────────────────────────────────────

const money = (n: number | string | null | undefined) =>
  new Intl.NumberFormat('es-SV', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);

function safeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

const errText = (e: unknown) => (e instanceof Error ? e.message : 'No se pudo completar la operación.');

/** Lee un Excel/CSV de saldos con el mismo lector de S1 (columnas: Cuenta, Descripción, Saldo). */
async function readBalanceFile(file: File): Promise<{ accounts: VisitAccountInput[]; skipped: number }> {
  let text: string;
  if (/\.(xlsx?|ods)$/i.test(file.name)) {
    const { read, utils } = await import('xlsx');
    const wb = read(await file.arrayBuffer(), { type: 'array' });
    const aoa = utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' }) as string[][];
    if (aoa.length < 2) throw new Error('El archivo Excel no tiene filas de datos.');
    // Se limpian los saltos de línea de las celdas: un encabezado de varias líneas rompe la conversión a CSV.
    text = aoa.map((row) => row.map((c) => `"${String(c ?? '').replace(/[\n\r]+/g, ' ').replace(/"/g, '""')}"`).join(',')).join('\n');
  } else {
    text = await file.text();
  }
  const parsed = parseCSVWithReport(text);
  if (parsed.valid.length === 0) {
    throw new Error(
      parsed.skipped.length > 0
        ? `Ninguna fila pasó la validación (${parsed.skipped.length} rechazada${parsed.skipped.length > 1 ? 's' : ''}). Revisa que la hoja tenga una fila de encabezado con «cuenta», «descripcion» y «saldo_actual».`
        : 'No se encontraron cuentas válidas. Revisa el formato del archivo.',
    );
  }
  if (parsed.valid.length > MAX_VISIT_ACCOUNTS) throw new Error(`El balance tiene ${parsed.valid.length} cuentas; el máximo es ${MAX_VISIT_ACCOUNTS}.`);
  return { accounts: toVisitAccounts(parsed.valid), skipped: parsed.skipped.length };
}

type Tone = 'ok' | 'warn' | 'error';
const TONE_CLASS: Record<Tone, string> = {
  ok: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  warn: 'bg-amber-50 border-amber-200 text-amber-800',
  error: 'bg-red-50 border-red-200 text-red-700',
};

function Banner({ tone, children, onClose }: { tone: Tone; children: React.ReactNode; onClose?: () => void }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex items-start gap-2 border rounded-lg px-3 py-2 text-xs ${TONE_CLASS[tone]}`}>
      {tone === 'ok' ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
      <div className="flex-1 space-y-1">{children}</div>
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Cerrar aviso" className="shrink-0 opacity-60 hover:opacity-100">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

const STATUS_PILL: Record<AuditVisit['status'], string> = {
  PLANNED: 'bg-gray-100 text-gray-600',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  CLOSED: 'bg-emerald-100 text-emerald-700',
};

const CMP_LABEL: Record<CompareStatus, string> = {
  NUEVA: 'Nuevas', DESAPARECIDA: 'Desaparecidas', EN_CERO: 'Pasaron a cero', CAMBIO: 'Con cambio', SIN_CAMBIO: 'Sin cambio',
};
const CMP_PILL: Record<CompareStatus, string> = {
  NUEVA: 'bg-sky-100 text-sky-700',
  DESAPARECIDA: 'bg-red-100 text-red-700',
  EN_CERO: 'bg-orange-100 text-orange-700',
  CAMBIO: 'bg-amber-100 text-amber-700',
  SIN_CAMBIO: 'bg-gray-100 text-gray-500',
};
const CMP_ORDER: CompareStatus[] = ['NUEVA', 'DESAPARECIDA', 'EN_CERO', 'CAMBIO', 'SIN_CAMBIO'];
const COMPARE_ROW_CAP = 300;

// ─── Panel ────────────────────────────────────────────────────────────────────

export interface VisitsPanelProps {
  auditId: string;
  s1Section?: PaperSection;
  s2Section?: PaperSection;
  /** El papel está bloqueado (firmado o sin permiso de escritura): no se copia nada a S1. */
  readonly: boolean;
  onSaveSection: (key: string, value: unknown) => void | Promise<void>;
}

export function VisitsPanel({ auditId, s1Section, s2Section, readonly, onSaveSection }: VisitsPanelProps) {
  const { hasRole } = useUser();
  const isManager = hasRole(['AUDIT_MANAGER']);
  const canImport = hasRole(['AUDITOR']) && !readonly;

  const { data, isLoading, error } = useAuditVisits(auditId);
  const enable = useEnableVisits(auditId);
  const update = useUpdateVisit(auditId);
  const importBalance = useImportVisitBalance(auditId);

  const fileRef = useRef<HTMLInputElement>(null);
  const importTarget = useRef<string | null>(null);

  const [notice, setNotice] = useState<{ tone: Tone; lines: string[] } | null>(null);
  const [dates, setDates] = useState(() => defaultCutoffs(new Date().getFullYear()));
  const [reading, setReading] = useState(false);
  const [preview, setPreview] = useState<{ visitId: string; filename: string; accounts: VisitAccountInput[]; skipped: number } | null>(null);
  const [editDate, setEditDate] = useState<{ visitId: string; value: string } | null>(null);
  const [confirmBase, setConfirmBase] = useState<string | null>(null);
  const [busyBase, setBusyBase] = useState(false);
  const [cmpFrom, setCmpFrom] = useState<VisitKind | ''>('');
  const [cmpTo, setCmpTo] = useState<VisitKind | ''>('');
  const [cmpFilter, setCmpFilter] = useState<'DIF' | CompareStatus>('DIF');

  const visits = data?.visits ?? [];
  const baseVisit = visits.find((v) => v.isAnalysisBase) ?? null;
  const { data: baseAccounts } = useVisitBalance(baseVisit?.balance ? baseVisit.id : null);

  const s1Rows = safeArray<S1Row>(s1Section?.value);
  const s2Rows = safeArray<{ cuenta: string; saldo_actual: number }>(s2Section?.value);

  const withBalance = visits.filter((v) => v.balance);
  const effFrom: VisitKind | '' = cmpFrom || (withBalance.length >= 2 ? withBalance[0].kind : '');
  const effTo: VisitKind | '' = cmpTo || (withBalance.length >= 2 ? withBalance[withBalance.length - 1].kind : '');
  const compare = useVisitsCompare(auditId, effFrom, effTo);

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>;
  }
  if (error) {
    return <div className="py-8"><Banner tone="error">No se pudieron cargar las visitas: {errText(error)}</Banner></div>;
  }
  if (!data || !data.supported) return null;

  // ── Acciones ────────────────────────────────────────────────────────────────

  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setNotice(null);
    try {
      return await fn();
    } catch (e) {
      setNotice({ tone: 'error', lines: [errText(e)] });
      return undefined;
    }
  }

  async function onActivate() {
    const problem = cutoffsProblem(dates);
    if (problem) { setNotice({ tone: 'error', lines: [problem] }); return; }
    const ok = await run(() => enable.mutateAsync(dates));
    if (ok) setNotice({ tone: 'ok', lines: ['Visitas activadas. Carga el balance de cada una con su fecha de corte.'] });
  }

  function pickFile(visitId: string) {
    importTarget.current = visitId;
    fileRef.current?.click();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    const visitId = importTarget.current;
    if (!file || !visitId) return;
    setNotice(null);
    setReading(true);
    try {
      const { accounts, skipped } = await readBalanceFile(file);
      setPreview({ visitId, filename: file.name, accounts, skipped });
    } catch (err) {
      setPreview(null);
      setNotice({ tone: 'error', lines: [errText(err)] });
    } finally {
      setReading(false);
    }
  }

  async function onConfirmImport() {
    if (!preview) return;
    const res = await run(() => importBalance.mutateAsync({ visitId: preview.visitId, filename: preview.filename, accounts: preview.accounts }));
    if (!res) return;
    setPreview(null);
    const lines = [`Balance cargado: ${res.accountCount} cuentas${res.supersedes ? ' (reemplaza al anterior como vigente; el anterior queda como historia)' : ''}.`];
    setNotice({ tone: res.warnings.length > 0 ? 'warn' : 'ok', lines: [...lines, ...res.warnings] });
  }

  async function onStatus(v: AuditVisit, to: AuditVisit['status']) {
    await run(() => update.mutateAsync({ visitId: v.id, status: to }));
  }

  async function onSaveDate() {
    if (!editDate) return;
    const ok = await run(() => update.mutateAsync({ visitId: editDate.visitId, cutoffDate: editDate.value }));
    if (ok) setEditDate(null);
  }

  async function onUseAsBase(v: AuditVisit) {
    if (!s1Section) return;
    setBusyBase(true);
    setNotice(null);
    try {
      if (!v.isAnalysisBase) await update.mutateAsync({ visitId: v.id, isAnalysisBase: true });
    } catch (e) {
      setNotice({ tone: 'error', lines: [errText(e)] });
      setBusyBase(false);
      return;
    }
    try {
      const fresh = await apiClient.get<VisitBalanceAccounts>(`/audits/visits/${v.id}/trial-balance`);
      const { rows, stats } = buildS1FromVisit(s1Rows, fresh.accounts);
      await onSaveSection('S1', rows);
      setConfirmBase(null);
      const parts = [`${stats.updated} cuenta${stats.updated === 1 ? '' : 's'} actualizada${stats.updated === 1 ? '' : 's'}`];
      if (stats.added) parts.push(`${stats.added} nueva${stats.added === 1 ? '' : 's'}`);
      if (stats.zeroed) parts.push(`${stats.zeroed} que la visita no trae quedaron en cero`);
      setNotice({
        tone: 'ok',
        lines: [
          `S1 ahora usa el balance de la visita ${VISIT_KIND_LABEL[v.kind].toLowerCase()} al ${fmtDay(v.cutoffDate)}: ${parts.join(', ')}. Los saldos de años anteriores no se tocaron.`,
          'Los análisis no se recalculan solos: en la clasificación (S2) usa «Sync desde balance», «Guardar Clasificación» y «Propagar a Cédulas».',
        ],
      });
    } catch (e) {
      setNotice({ tone: 'warn', lines: [`La visita quedó marcada como base, pero no se pudo copiar a S1: ${errText(e)} Reintenta con «Copiar a S1».`] });
    } finally {
      setBusyBase(false);
    }
  }

  async function onClearBase(v: AuditVisit) {
    const ok = await run(() => update.mutateAsync({ visitId: v.id, isAnalysisBase: false }));
    if (ok) setNotice({ tone: 'ok', lines: ['Se quitó la marca de base. S1 conserva los saldos que ya tenía.'] });
  }

  // ── Qué base están usando hoy S1 y los análisis ─────────────────────────────

  const s1Diff = baseVisit && baseAccounts ? s1DiffersFromVisit(s1Rows, baseAccounts.accounts) : null;
  const s2Diff = s1Rows.length > 0 && s2Rows.length > 0 ? classificationDiffersFromS1(s1Rows, s2Rows) : 0;

  // ── Pantalla ────────────────────────────────────────────────────────────────

  const compareRows = (compare.data?.rows ?? []).filter((r) => (cmpFilter === 'DIF' ? r.status !== 'SIN_CAMBIO' : r.status === cmpFilter));

  return (
    <div className="space-y-4">
      <input ref={fileRef} type="file" accept=".csv,.txt,.tsv,.xlsx,.xls,.ods" className="hidden" onChange={onFile} />

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-start gap-3">
          <CalendarDays className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-gray-800">Visitas del encargo</p>
            <p className="text-xs text-gray-500 mt-0.5 max-w-3xl">
              Planificación, interina y final: cada una guarda el balance de comprobación a su fecha de corte. Tú eliges qué visita alimenta los
              análisis de B-00 (S3 a S14); lo ya importado en S1 sigue funcionando igual hasta que lo cambies.
            </p>
          </div>
        </div>
      </div>

      {notice && (
        <Banner tone={notice.tone} onClose={() => setNotice(null)}>
          {notice.lines.map((l, i) => <p key={i}>{l}</p>)}
        </Banner>
      )}

      {/* ── Sin visitas todavía ── */}
      {!data.enabled && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
          <p className="text-xs text-gray-600 max-w-3xl">
            Este encargo trabaja hoy con un solo balance (S1). Al activar las visitas se crean las tres con su fecha de corte; no se pierde ni cambia nada
            de lo ya hecho.
          </p>
          {isManager ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl">
                {(['planning', 'interim', 'final'] as const).map((k) => (
                  <label key={k} className="text-xs text-gray-600">
                    <span className="block font-semibold mb-1">Corte de {k === 'planning' ? 'planificación' : k === 'interim' ? 'la interina' : 'la final'}</span>
                    <input
                      type="date" value={dates[k]} onChange={(e) => setDates((d) => ({ ...d, [k]: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </label>
                ))}
              </div>
              <button
                type="button" onClick={onActivate} disabled={enable.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {enable.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarDays className="w-3.5 h-3.5" />}
                Activar visitas
              </button>
            </>
          ) : (
            <p className="text-xs text-gray-500">Pide a un Gerente de Auditoría que active las visitas de este encargo.</p>
          )}
        </div>
      )}

      {/* ── Línea de tiempo ── */}
      {data.enabled && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {VISIT_KINDS.map((kind) => {
              const v = visits.find((x) => x.kind === kind);
              if (!v) return null;
              const closedLock = v.status === 'CLOSED' && !isManager;
              const pv = preview?.visitId === v.id ? preview : null;
              const totals = pv ? balanceTotals(pv.accounts) : null;
              const editing = editDate?.visitId === v.id;
              const suggested = !data.analysisBase && data.suggestedAnalysisBase === v.kind;
              return (
                <div key={v.id} className={`bg-white rounded-2xl border shadow-sm p-4 space-y-3 ${v.isAnalysisBase ? 'border-blue-300 ring-1 ring-blue-200' : 'border-gray-200'}`}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-800">{VISIT_KIND_LABEL[v.kind]}</p>
                    <div className="flex items-center gap-1.5">
                      {v.isAnalysisBase && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-600 text-white flex items-center gap-1">
                          <Target className="w-3 h-3" /> Base de análisis
                        </span>
                      )}
                      {suggested && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">Sugerida</span>}
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_PILL[v.status]}`}>
                        {v.status === 'CLOSED' && <Lock className="w-3 h-3 inline mr-0.5 -mt-0.5" />}
                        {VISIT_STATUS_LABEL[v.status]}
                      </span>
                    </div>
                  </div>

                  {/* Fecha de corte */}
                  <div className="text-xs text-gray-600">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 block">Fecha de corte</span>
                    {editing ? (
                      <div className="flex items-center gap-1.5 mt-1">
                        <input
                          type="date" value={editDate.value} onChange={(e) => setEditDate({ visitId: v.id, value: e.target.value })}
                          className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <button type="button" onClick={onSaveDate} disabled={update.isPending} className="px-2 py-1 bg-emerald-600 text-white rounded-lg text-[11px] font-semibold disabled:opacity-50">Guardar</button>
                        <button type="button" onClick={() => setEditDate(null)} className="px-2 py-1 text-[11px] text-gray-500 border border-gray-200 rounded-lg">Cancelar</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-gray-800">{fmtDay(v.cutoffDate)}</span>
                        {isManager && v.status !== 'CLOSED' && (
                          <button type="button" onClick={() => setEditDate({ visitId: v.id, value: v.cutoffDate })} className="text-[11px] text-blue-600 hover:underline">Cambiar</button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Balance vigente */}
                  <div className="text-xs">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 block mb-1">Balance vigente</span>
                    {v.balance ? (
                      <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 space-y-0.5">
                        <p className="font-medium text-gray-700 truncate" title={v.balance.filename}>{v.balance.filename}</p>
                        <p className="text-gray-500">{v.balance.accountCount} cuentas · cargado el {fmtDay(v.balance.importedAt.slice(0, 10))}</p>
                        <p className={v.balance.isBalanced ? 'text-emerald-600' : 'text-amber-600'}>
                          {v.balance.isBalanced ? '✓ Cuadra' : `⚠ No cuadra (débitos ${money(v.balance.totalDebit)} · créditos ${money(v.balance.totalCredit)})`}
                        </p>
                        {v.balanceVersions > 1 && <p className="text-gray-400">{v.balanceVersions} cargas: la más reciente es la vigente.</p>}
                      </div>
                    ) : (
                      <p className="text-gray-400 border border-dashed border-gray-200 rounded-lg px-3 py-3 text-center">Sin balance cargado</p>
                    )}
                  </div>

                  {/* Vista previa de la carga */}
                  {pv && totals && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs space-y-1.5">
                      <p className="font-medium text-amber-800">{pv.accounts.length} cuentas leídas de «{pv.filename}» — aún sin guardar</p>
                      <p className={totals.balanced ? 'text-emerald-700' : 'text-amber-700'}>
                        {totals.balanced ? '✓ Cuadra' : `⚠ No cuadra: débitos ${money(totals.totalDebit)} · créditos ${money(totals.totalCredit)}`}
                      </p>
                      {pv.skipped > 0 && <p className="text-amber-700">{pv.skipped} fila{pv.skipped > 1 ? 's' : ''} omitida{pv.skipped > 1 ? 's' : ''} por no ser código de cuenta.</p>}
                      <div className="flex gap-1.5 pt-0.5">
                        <button type="button" onClick={onConfirmImport} disabled={importBalance.isPending}
                          className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 text-white rounded-lg text-[11px] font-semibold hover:bg-emerald-700 disabled:opacity-50">
                          {importBalance.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                          Confirmar balance
                        </button>
                        <button type="button" onClick={() => setPreview(null)} className="px-2.5 py-1 text-[11px] text-gray-600 border border-gray-200 bg-white rounded-lg">Cancelar</button>
                      </div>
                    </div>
                  )}

                  {/* Acciones */}
                  <div className="flex flex-wrap gap-1.5">
                    {canImport && (
                      <button
                        type="button" onClick={() => pickFile(v.id)} disabled={reading || closedLock}
                        title={closedLock ? 'La visita está cerrada: solo un Gerente puede cargar una corrección.' : undefined}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 text-white rounded-lg text-[11px] font-semibold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {reading && importTarget.current === v.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileSpreadsheet className="w-3 h-3" />}
                        {v.balance ? 'Cargar corrección' : 'Cargar balance'}
                      </button>
                    )}
                    {isManager && statusActions(v.status).map((a) => (
                      <button key={a.to} type="button" onClick={() => onStatus(v, a.to)} disabled={update.isPending}
                        className="px-2.5 py-1.5 text-[11px] font-semibold text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                        {a.label}
                      </button>
                    ))}
                    {isManager && v.balance && !readonly && s1Section && (
                      v.isAnalysisBase ? (
                        <>
                          <button type="button" onClick={() => setConfirmBase(v.id)} disabled={busyBase}
                            className="px-2.5 py-1.5 text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50">
                            Copiar a S1
                          </button>
                          <button type="button" onClick={() => onClearBase(v)} disabled={update.isPending}
                            className="px-2.5 py-1.5 text-[11px] text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                            Quitar base
                          </button>
                        </>
                      ) : (
                        <button type="button" onClick={() => setConfirmBase(v.id)} disabled={busyBase}
                          className="px-2.5 py-1.5 text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50">
                          Usar como base de análisis
                        </button>
                      )
                    )}
                  </div>

                  {/* Confirmación de copiar a S1 */}
                  {confirmBase === v.id && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900 space-y-2">
                      <p>
                        Esto reemplaza el <strong>saldo actual de S1</strong> con el balance de la visita {VISIT_KIND_LABEL[v.kind].toLowerCase()} al {fmtDay(v.cutoffDate)}
                        {s1Rows.length > 0 ? ` (hoy S1 tiene ${s1Rows.length} cuentas)` : ''}. Los saldos de años anteriores y las descripciones no se tocan. Los análisis se recalculan cuando tú lo decidas.
                      </p>
                      <div className="flex gap-1.5">
                        <button type="button" onClick={() => onUseAsBase(v)} disabled={busyBase}
                          className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 text-white rounded-lg text-[11px] font-semibold hover:bg-blue-700 disabled:opacity-50">
                          {busyBase && <Loader2 className="w-3 h-3 animate-spin" />} Confirmar
                        </button>
                        <button type="button" onClick={() => setConfirmBase(null)} disabled={busyBase} className="px-2.5 py-1 text-[11px] text-gray-600 border border-gray-200 bg-white rounded-lg">Cancelar</button>
                      </div>
                    </div>
                  )}

                  {v.closedAt && <p className="text-[10px] text-gray-400">Cerrada el {fmtDay(v.closedAt.slice(0, 10))}</p>}
                </div>
              );
            })}
          </div>

          {/* ── Base de análisis: ¿S1 y los análisis están sobre ella? ── */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-2">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Base de los análisis</p>
            {!baseVisit && (
              <p className="text-xs text-gray-600">
                Ninguna visita está marcada como base: B-00 usa el balance que ya tenía en S1.
                {data.suggestedAnalysisBase && <> La sugerida es la visita <strong>{VISIT_KIND_LABEL[data.suggestedAnalysisBase].toLowerCase()}</strong>.</>}
              </p>
            )}
            {baseVisit && (
              <p className="text-xs text-gray-600">
                Base: visita <strong>{VISIT_KIND_LABEL[baseVisit.kind].toLowerCase()}</strong> al {fmtDay(baseVisit.cutoffDate)}.
              </p>
            )}
            {baseVisit && s1Diff !== null && s1Diff > 0 && (
              <Banner tone="warn">
                <p>S1 no coincide con la visita base: {s1Diff} cuenta{s1Diff > 1 ? 's tienen' : ' tiene'} un saldo actual distinto. Usa «Copiar a S1» en la visita para alinearlo.</p>
              </Banner>
            )}
            {baseVisit && s1Diff === 0 && s2Diff === 0 && <p className="text-xs text-emerald-600">✓ S1 y la clasificación ya están sobre esta base.</p>}
            {s2Diff > 0 && (
              <Banner tone="warn">
                <p>
                  Los análisis se calcularon con otra base: {s2Diff} cuenta{s2Diff > 1 ? 's' : ''} de la clasificación (S2) {s2Diff > 1 ? 'tienen' : 'tiene'} un saldo distinto al de S1.
                  En la clasificación usa «Sync desde balance», «Guardar Clasificación» y «Propagar a Cédulas».
                </p>
              </Banner>
            )}
          </div>

          {/* ── Comparación entre visitas ── */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-3">
            <div className="flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-blue-600" />
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Comparar visitas</p>
            </div>

            {withBalance.length < 2 ? (
              <p className="text-xs text-gray-500">Carga el balance de al menos dos visitas para compararlas por código de cuenta.</p>
            ) : (
              <>
                <div className="flex items-center gap-2 flex-wrap text-xs text-gray-600">
                  <label className="flex items-center gap-1.5">Desde
                    <select value={effFrom} onChange={(e) => setCmpFrom(e.target.value as VisitKind)} className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white">
                      {withBalance.map((v) => <option key={v.kind} value={v.kind}>{VISIT_KIND_LABEL[v.kind]} · {fmtDay(v.cutoffDate)}</option>)}
                    </select>
                  </label>
                  <label className="flex items-center gap-1.5">hasta
                    <select value={effTo} onChange={(e) => setCmpTo(e.target.value as VisitKind)} className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white">
                      {withBalance.map((v) => <option key={v.kind} value={v.kind}>{VISIT_KIND_LABEL[v.kind]} · {fmtDay(v.cutoffDate)}</option>)}
                    </select>
                  </label>
                </div>

                {effFrom === effTo && <p className="text-xs text-amber-600">Elige dos visitas distintas.</p>}
                {compare.isLoading && <div className="flex items-center gap-2 text-xs text-blue-600"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Comparando…</div>}
                {compare.error && <Banner tone="error">{errText(compare.error)}</Banner>}

                {compare.data && (
                  <>
                    {compare.data.warnings.map((w) => <Banner key={w} tone="warn"><p>{w}</p></Banner>)}
                    <div className="flex flex-wrap gap-1.5">
                      <button type="button" onClick={() => setCmpFilter('DIF')}
                        className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${cmpFilter === 'DIF' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}>
                        Con diferencias
                      </button>
                      {CMP_ORDER.map((s) => (
                        <button key={s} type="button" onClick={() => setCmpFilter(s)}
                          className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${cmpFilter === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}>
                          {CMP_LABEL[s]} · {compare.data.summary[s]}
                        </button>
                      ))}
                    </div>

                    {compareRows.length === 0 ? (
                      <p className="text-xs text-gray-500 py-4 text-center">No hay cuentas en este filtro.</p>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-gray-200">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-gray-50 border-b border-gray-200 text-gray-600">
                              <th className="px-3 py-2 text-left font-semibold">Cuenta</th>
                              <th className="px-3 py-2 text-left font-semibold">Descripción</th>
                              <th className="px-3 py-2 text-left font-semibold">Estado</th>
                              <th className="px-3 py-2 text-right font-semibold">{VISIT_KIND_LABEL[compare.data.from.kind]}</th>
                              <th className="px-3 py-2 text-right font-semibold">{VISIT_KIND_LABEL[compare.data.to.kind]}</th>
                              <th className="px-3 py-2 text-right font-semibold">Variación</th>
                              <th className="px-3 py-2 text-right font-semibold">%</th>
                            </tr>
                          </thead>
                          <tbody>
                            {compareRows.slice(0, COMPARE_ROW_CAP).map((r) => (
                              <tr key={r.code} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                                <td className="px-3 py-1.5 font-mono text-gray-700">{r.code}</td>
                                <td className="px-3 py-1.5 text-gray-700">{r.name}</td>
                                <td className="px-3 py-1.5"><span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${CMP_PILL[r.status]}`}>{CMP_LABEL[r.status]}</span></td>
                                <td className="px-3 py-1.5 text-right font-mono text-gray-600">{r.fromBalance === null ? '—' : money(r.fromBalance)}</td>
                                <td className="px-3 py-1.5 text-right font-mono text-gray-600">{r.toBalance === null ? '—' : money(r.toBalance)}</td>
                                <td className={`px-3 py-1.5 text-right font-mono ${r.delta < 0 ? 'text-red-600' : 'text-gray-700'}`}>{money(r.delta)}</td>
                                <td className="px-3 py-1.5 text-right font-mono text-gray-500">{r.deltaPct === null ? '—' : `${r.deltaPct.toFixed(1)}%`}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {compareRows.length > COMPARE_ROW_CAP && (
                      <p className="text-[11px] text-gray-500">Se muestran las primeras {COMPARE_ROW_CAP} de {compareRows.length} cuentas; usa los filtros para acotar.</p>
                    )}
                  </>
                )}
              </>
            )}
          </div>

          {/* ── Puente interina → final ── */}
          <VisitsBridge
            auditId={auditId}
            ready={Boolean(visits.find((v) => v.kind === 'INTERIM')?.balance && visits.find((v) => v.kind === 'FINAL')?.balance)}
            canCreate={hasRole(['AUDITOR'])}
          />
        </>
      )}
    </div>
  );
}
