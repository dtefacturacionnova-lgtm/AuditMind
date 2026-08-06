'use client';

import { useState, useCallback, useRef } from 'react';
import {
  Loader2, RefreshCw, AlertTriangle, CheckCircle2, Clock,
  Sparkles, TrendingUp, ClipboardList, PenLine, ChevronDown, ChevronUp,
  Save,
} from 'lucide-react';
import { useConsolidatePaper, useUpdateSection, useMaterialidad } from '@/hooks/useWorkingPaperGraph';
import type { WpSyncStatus, WpPaperSection } from '@/hooks/useWorkingPapers';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AccountRow {
  cuenta:          string;
  descripcion:     string;
  saldo_actual:    number;
  saldo_anterior:  number;
  var_abs:         number;
  var_pct:         number;
  nota_auditor?:   string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtNum = (n: number) =>
  new Intl.NumberFormat('es-SV', { maximumFractionDigits: 0 }).format(n);

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('es-SV', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

function semaforo(abs: number, mg: number | null, me: number | null) {
  if (!mg && !me) return null;
  if (mg && abs > mg) return { icon: '🔴', label: 'Material',    cls: 'text-red-600 bg-red-50' };
  if (me && abs > me) return { icon: '🟡', label: 'Significativo', cls: 'text-amber-600 bg-amber-50' };
  return                       { icon: '🟢', label: 'Inmaterial', cls: 'text-emerald-600 bg-emerald-50' };
}

function toAccountRows(value: unknown): AccountRow[] {
  if (!Array.isArray(value)) return [];
  return (value as AccountRow[]).filter(r => r && typeof r.cuenta === 'string');
}

function toText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

// ─── Materialidad Banner ──────────────────────────────────────────────────────

function MaterialidadBanner({
  auditId, groupTotal,
}: { auditId: string; groupTotal: number }) {
  const { data: mat } = useMaterialidad(auditId);
  const sem = mat?.mg ? semaforo(Math.abs(groupTotal), mat.mg, mat.me ?? null) : null;

  if (!mat?.mg && !mat?.me) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 bg-white border border-gray-200 rounded-2xl px-5 py-3 shadow-sm">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-gray-500 font-medium">MG:</span>
        <span className="font-mono font-bold text-gray-800">{mat.mg ? fmtCurrency(mat.mg) : '—'}</span>
      </div>
      <div className="w-px h-4 bg-gray-200" />
      <div className="flex items-center gap-2 text-sm">
        <span className="text-gray-500 font-medium">ME:</span>
        <span className="font-mono font-bold text-gray-800">{mat.me ? fmtCurrency(mat.me) : '—'}</span>
      </div>
      <div className="w-px h-4 bg-gray-200" />
      <div className="flex items-center gap-2 text-sm">
        <span className="text-gray-500 font-medium">Total grupo:</span>
        <span className="font-mono font-bold text-gray-800">{fmtCurrency(Math.abs(groupTotal))}</span>
      </div>
      {sem && (
        <>
          <div className="w-px h-4 bg-gray-200" />
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${sem.cls}`}>
            {sem.icon} {sem.label}
          </span>
        </>
      )}
    </div>
  );
}

// ─── Account Detail Table (with per-row annotations) ──────────────────────────

function AccountDetailTable({
  label, sectionKey, paperId, initialRows, mg, me,
}: {
  label:        string;
  sectionKey:   string;
  paperId:      string;
  initialRows:  AccountRow[];
  mg:           number | null;
  me:           number | null;
}) {
  const [open, setOpen]   = useState(true);
  const [rows, setRows]   = useState<AccountRow[]>(initialRows);
  const [saving, setSaving] = useState<number | null>(null);
  const update = useUpdateSection();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const total    = rows.reduce((s, r) => s + (r.saldo_actual  ?? 0), 0);
  const totalAnt = rows.reduce((s, r) => s + (r.saldo_anterior ?? 0), 0);
  const totalVar = total - totalAnt;

  const updateNota = useCallback((index: number, nota: string) => {
    const updated = rows.map((r, i) => i === index ? { ...r, nota_auditor: nota } : r);
    setRows(updated);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSaving(index);
      try {
        await update.mutateAsync({ paperId, sectionKey, value: updated });
      } finally {
        setSaving(null);
      }
    }, 900);
  }, [rows, paperId, sectionKey, update]);

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">{sectionKey}</span>
          <span className="text-sm font-semibold text-gray-700">{label}</span>
          <span className="text-xs text-gray-400">({rows.length} cuenta{rows.length !== 1 ? 's' : ''})</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm font-semibold text-gray-700">{fmtCurrency(Math.abs(total))}</span>
          {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-left">Código</th>
                <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-left">Descripción</th>
                <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-right">Saldo actual</th>
                <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-right">Saldo ant.</th>
                <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-right">Var. $</th>
                <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-right">Var. %</th>
                <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-center">Mat.</th>
                <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-left min-w-[200px]">
                  Resultado de revisión
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((row, i) => {
                const sem = semaforo(Math.abs(row.saldo_actual), mg, me);
                const varColor = row.var_abs > 0 ? 'text-emerald-600' : row.var_abs < 0 ? 'text-red-500' : 'text-gray-400';
                return (
                  <tr key={i} className="hover:bg-gray-50/50 transition-colors align-top">
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-500 whitespace-nowrap">{row.cuenta}</td>
                    <td className="px-3 py-2.5 text-gray-800 max-w-[180px]">{row.descripcion}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-800 whitespace-nowrap">{fmtNum(row.saldo_actual)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-400 whitespace-nowrap">{fmtNum(row.saldo_anterior)}</td>
                    <td className={`px-3 py-2.5 text-right font-mono whitespace-nowrap ${varColor}`}>
                      {row.var_abs >= 0 ? '+' : ''}{fmtNum(row.var_abs)}
                    </td>
                    <td className={`px-3 py-2.5 text-right text-xs font-medium whitespace-nowrap ${varColor}`}>
                      {row.var_pct >= 0 ? '+' : ''}{row.var_pct}%
                    </td>
                    <td className="px-3 py-2.5 text-center whitespace-nowrap">
                      {sem ? (
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${sem.cls}`}>
                          {sem.icon}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-2 py-1.5 min-w-[200px]">
                      <div className="relative">
                        <textarea
                          value={row.nota_auditor ?? ''}
                          onChange={e => updateNota(i, e.target.value)}
                          rows={2}
                          className="w-full text-xs text-gray-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5 resize-y focus:outline-none focus:ring-2 focus:ring-amber-200 placeholder:text-gray-300"
                          placeholder="Anote el resultado de la revisión para esta cuenta…"
                        />
                        {saving === i && (
                          <span className="absolute top-1 right-1">
                            <Save className="w-3 h-3 text-amber-400 animate-pulse" />
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold">
                <td colSpan={2} className="px-3 py-2 text-xs text-gray-600 uppercase tracking-wide">Total</td>
                <td className="px-3 py-2 text-right font-mono text-gray-800">{fmtNum(total)}</td>
                <td className="px-3 py-2 text-right font-mono text-gray-400">{fmtNum(totalAnt)}</td>
                <td className={`px-3 py-2 text-right font-mono ${totalVar >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {totalVar >= 0 ? '+' : ''}{fmtNum(totalVar)}
                </td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Narrative Card (read-only AI text) ──────────────────────────────────────

function NarrativeCard({
  icon: Icon, sectionKey, title, color, text,
}: {
  icon:       React.ElementType;
  sectionKey: string;
  title:      string;
  color:      string;
  text:       string;
}) {
  if (!text) return null;
  return (
    <div className={`rounded-xl border ${color} p-4`}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 shrink-0" />
        <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">{sectionKey}</span>
        <p className="text-xs font-bold uppercase tracking-wide">{title}</p>
      </div>
      <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed space-y-2">
        {text.split('\n').map((line, i) =>
          line.trim() ? <p key={i}>{line}</p> : null,
        )}
      </div>
    </div>
  );
}

// ─── Conclusion Editor ────────────────────────────────────────────────────────

function ConclusionEditor({
  paperId, sectionKey, section,
}: {
  paperId:    string;
  sectionKey: string;
  section:    WpPaperSection | undefined;
}) {
  const [text, setText]   = useState(toText(section?.value));
  const [dirty, setDirty] = useState(false);
  const update = useUpdateSection();

  async function handleSave() {
    await update.mutateAsync({ paperId, sectionKey, value: text });
    setDirty(false);
  }

  return (
    <div className="rounded-xl border border-blue-200 overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 bg-blue-50 border-b border-blue-100">
        <div className="flex items-center gap-2">
          <PenLine className="w-4 h-4 text-blue-500" />
          <span className="text-xs font-bold text-blue-400 uppercase tracking-wide">{sectionKey}</span>
          <span className="text-sm font-semibold text-blue-800">Conclusión Preliminar del Área</span>
        </div>
        <div className="flex items-center gap-2">
          {!dirty && text && (
            <span className="flex items-center gap-1 text-xs text-emerald-600">
              <CheckCircle2 className="w-3.5 h-3.5" /> Guardado
            </span>
          )}
          {dirty && (
            <button
              onClick={handleSave}
              disabled={update.isPending}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {update.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              Guardar
            </button>
          )}
        </div>
      </div>
      <textarea
        value={text}
        onChange={e => { setText(e.target.value); setDirty(true); }}
        onBlur={() => { if (dirty) handleSave(); }}
        rows={5}
        className="w-full px-4 py-3 text-sm text-gray-700 resize-y focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-200"
        placeholder="Escribe aquí la conclusión preliminar del auditor sobre este grupo de cuentas. Indica si los saldos son razonables y si se requieren procedimientos adicionales…"
      />
    </div>
  );
}

// ─── Sync status badge ────────────────────────────────────────────────────────

function SyncBadge({ syncStatus }: { syncStatus: WpSyncStatus }) {
  if (syncStatus === 'SYNCED')
    return <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200"><CheckCircle2 className="w-3.5 h-3.5" />Al día</span>;
  if (syncStatus === 'STALE')
    return <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200"><AlertTriangle className="w-3.5 h-3.5" />Desactualizado</span>;
  if (syncStatus === 'REGENERATING')
    return <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 border border-blue-200 animate-pulse"><Loader2 className="w-3.5 h-3.5 animate-spin" />Consolidando…</span>;
  return <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200"><Clock className="w-3.5 h-3.5" />Sin consolidar</span>;
}

// ─── Lead Schedule Master View (export) ──────────────────────────────────────

export interface LeadScheduleMasterViewProps {
  paperId:       string;
  paperCode:     string;
  auditId:       string;
  syncStatus:    WpSyncStatus;
  sections:      WpPaperSection[];
  lastSyncedAt?: string;
  config: {
    groupName:             string;
    prefix:                string;
    detailSections:        { key: string; label: string; subSumaria: string }[];
    analysisSectionKey:    string;
    proceduresSectionKey:  string;
    conclusionSectionKey:  string;
  };
}

export function LeadScheduleMasterView({
  paperId, paperCode, auditId, syncStatus, sections, lastSyncedAt, config,
}: LeadScheduleMasterViewProps) {
  const consolidate    = useConsolidatePaper();
  const { data: mat }  = useMaterialidad(auditId);
  const isRegenerating = syncStatus === 'REGENERATING' || consolidate.isPending;

  const sAnalysis   = sections.find(s => s.sectionKey === config.analysisSectionKey);
  const sProcedures = sections.find(s => s.sectionKey === config.proceduresSectionKey);
  const sConclusion = sections.find(s => s.sectionKey === config.conclusionSectionKey);

  // Compute group total from S2-S5 detail rows (reliable even when S1 is empty)
  const detailPairs = config.detailSections.map(det => ({
    ...det,
    rows: toAccountRows(sections.find(s => s.sectionKey === det.key)?.value),
  }));
  const groupTotal = detailPairs.flatMap(d => d.rows).reduce((s, r) => s + Math.abs(r.saldo_actual ?? 0), 0);
  const hasContent = detailPairs.some(d => d.rows.length > 0) || toText(sAnalysis?.value).length > 10;

  return (
    <div className="space-y-4">

      {/* ── Status / action bar ── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <SyncBadge syncStatus={isRegenerating ? 'REGENERATING' : syncStatus} />
            {lastSyncedAt && syncStatus === 'SYNCED' && (
              <span className="text-xs text-gray-400">
                Última consolidación:{' '}
                {new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(lastSyncedAt))}
              </span>
            )}
          </div>
          {!isRegenerating && (
            <button
              onClick={() => consolidate.mutateAsync(paperId)}
              disabled={consolidate.isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-violet-600 rounded-xl hover:bg-violet-700 disabled:opacity-50 transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              {syncStatus === 'SYNCED' ? 'Reconsolidar' : 'Consolidar con IA'}
            </button>
          )}
        </div>
      </div>

      {/* ── STALE banner ── */}
      {syncStatus === 'STALE' && !isRegenerating && (
        <div className="flex items-center justify-between gap-4 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Balance de comprobación actualizado</p>
              <p className="text-xs text-amber-600 mt-0.5">Reconsolida para actualizar las tablas de detalle y el análisis de variaciones.</p>
            </div>
          </div>
          <button
            onClick={() => consolidate.mutateAsync(paperId)}
            disabled={consolidate.isPending}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-amber-600 rounded-xl hover:bg-amber-700 disabled:opacity-50 shrink-0"
          >
            <RefreshCw className="w-4 h-4" /> Reconsolidar
          </button>
        </div>
      )}

      {/* ── Regenerating state ── */}
      {isRegenerating && (
        <div className="flex flex-col items-center py-14 gap-5 bg-white rounded-2xl border border-blue-200 shadow-sm">
          <div className="flex gap-1.5">
            {[0,1,2,3,4].map(i => (
              <div key={i} className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: `${i*90}ms` }} />
            ))}
          </div>
          <div className="text-center">
            <p className="text-sm text-blue-700 font-semibold">Consolidando {config.groupName}…</p>
            <p className="text-xs text-gray-400 mt-1">Leyendo B-00 · Filtrando cuentas · Analizando variaciones con Gemini</p>
          </div>
        </div>
      )}

      {/* ── Empty DRAFT state ── */}
      {!isRegenerating && !hasContent && syncStatus === 'DRAFT' && (
        <div className="flex flex-col items-center py-16 gap-4 bg-white rounded-2xl border border-gray-200 shadow-sm text-center">
          <div className="w-16 h-16 rounded-2xl bg-violet-50 border border-violet-200 flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-violet-300" />
          </div>
          <div>
            <p className="text-base font-semibold text-gray-700 mb-1">Cédula sumaria sin consolidar</p>
            <p className="text-sm text-gray-400 max-w-sm">
              Haz clic en &ldquo;Consolidar con IA&rdquo; para generar las tablas de detalle, análisis de
              variaciones y conclusión preliminar del área <strong>{config.groupName}</strong>.
            </p>
            <p className="text-xs text-gray-400 mt-2">
              Asegúrate de haber importado el balance de comprobación en B-00 antes de consolidar.
            </p>
          </div>
          <button
            onClick={() => consolidate.mutateAsync(paperId)}
            disabled={consolidate.isPending}
            className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-violet-600 rounded-xl hover:bg-violet-700 disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            Consolidar ahora con IA
          </button>
        </div>
      )}

      {!isRegenerating && hasContent && (
        <>
          {/* ── Materialidad banner (total computed from S2-S5 rows) ── */}
          <MaterialidadBanner auditId={auditId} groupTotal={groupTotal} />

          {/* ── S6: Análisis de Variaciones (AI) ── FIRST ── */}
          <NarrativeCard
            icon={TrendingUp}
            sectionKey={config.analysisSectionKey}
            title="Análisis de Variaciones"
            color="bg-blue-50 border-blue-100 text-blue-800"
            text={toText(sAnalysis?.value)}
          />

          {/* ── S9: Conclusión Preliminar ── BEFORE tables ── */}
          <ConclusionEditor
            paperId={paperId}
            sectionKey={config.conclusionSectionKey}
            section={sConclusion}
          />

          {/* ── S2-S5: Account detail tables (with per-row annotation) ── */}
          {detailPairs.filter(d => d.rows.length > 0).map(det => (
            <AccountDetailTable
              key={det.key}
              label={det.label}
              sectionKey={det.key}
              paperId={paperId}
              initialRows={det.rows}
              mg={mat?.mg ?? null}
              me={mat?.me ?? null}
            />
          ))}

          {/* ── S7: Procedimientos sugeridos (AI, at the bottom as reference) ── */}
          <NarrativeCard
            icon={ClipboardList}
            sectionKey={config.proceduresSectionKey}
            title="Procedimientos Sustantivos Recomendados"
            color="bg-violet-50 border-violet-100 text-violet-800"
            text={toText(sProcedures?.value)}
          />
        </>
      )}
    </div>
  );
}
