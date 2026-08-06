'use client';

import { useState } from 'react';
import {
  Loader2, RefreshCw, AlertTriangle, CheckCircle2, Clock,
  Sparkles, TrendingUp, ClipboardList, PenLine, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useConsolidatePaper, useUpdateSection, useMaterialidad } from '@/hooks/useWorkingPaperGraph';
import type { WpSyncStatus, WpPaperSection } from '@/hooks/useWorkingPapers';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AccountRow {
  cuenta:         string;
  descripcion:    string;
  saldo_actual:   number;
  saldo_anterior: number;
  var_abs:        number;
  var_pct:        number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtNum = (n: number) =>
  new Intl.NumberFormat('es-SV', { maximumFractionDigits: 0 }).format(n);

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('es-SV', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

function semaforo(abs: number, mg: number | null, me: number | null) {
  if (!mg && !me) return null;
  if (mg && abs > mg) return { icon: '🔴', label: 'Material', cls: 'text-red-600 bg-red-50' };
  if (me && abs > me) return { icon: '🟡', label: 'Sig.', cls: 'text-amber-600 bg-amber-50' };
  return { icon: '🟢', label: 'Inmaterial', cls: 'text-emerald-600 bg-emerald-50' };
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
  auditId, sections, prefix,
}: { auditId: string; sections: WpPaperSection[]; prefix: string }) {
  const { data: mat } = useMaterialidad(auditId);

  // Compute group total from S1 summary (aggregated totals by sub-sumaria)
  const s1 = sections.find(s => s.sectionKey === 'S1');
  const s1Rows = Array.isArray(s1?.value)
    ? (s1!.value as Array<{ sub_sumaria: string; saldo_actual: number }>)
        .filter(r => r.sub_sumaria?.startsWith(prefix))
    : [];
  const groupTotal = s1Rows.reduce((sum, r) => sum + (r.saldo_actual ?? 0), 0);

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

// ─── Account Detail Table ─────────────────────────────────────────────────────

function AccountDetailTable({
  label, sectionKey, rows, mg, me,
}: {
  label:      string;
  sectionKey: string;
  rows:       AccountRow[];
  mg:         number | null;
  me:         number | null;
}) {
  const [open, setOpen] = useState(true);
  const total = rows.reduce((s, r) => s + (r.saldo_actual ?? 0), 0);
  const totalAnt = rows.reduce((s, r) => s + (r.saldo_anterior ?? 0), 0);
  const totalVar = total - totalAnt;

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
                {['Código', 'Descripción', 'Saldo actual', 'Saldo ant.', 'Var. $', 'Var. %', 'Mat.'].map(h => (
                  <th key={h} className={`px-3 py-2 text-xs font-semibold text-gray-500 ${h === 'Descripción' || h === 'Código' ? 'text-left' : 'text-right'} ${h === 'Mat.' ? 'text-center' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((row, i) => {
                const sem = semaforo(Math.abs(row.saldo_actual), mg, me);
                const varColor = row.var_abs > 0 ? 'text-emerald-600' : row.var_abs < 0 ? 'text-red-500' : 'text-gray-400';
                return (
                  <tr key={i} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-500">{row.cuenta}</td>
                    <td className="px-3 py-2.5 text-gray-800 max-w-xs">{row.descripcion}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-800">{fmtNum(row.saldo_actual)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-400">{fmtNum(row.saldo_anterior)}</td>
                    <td className={`px-3 py-2.5 text-right font-mono ${varColor}`}>
                      {row.var_abs >= 0 ? '+' : ''}{fmtNum(row.var_abs)}
                    </td>
                    <td className={`px-3 py-2.5 text-right text-xs font-medium ${varColor}`}>
                      {row.var_pct >= 0 ? '+' : ''}{row.var_pct}%
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {sem ? (
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${sem.cls}`}>
                          {sem.icon}
                        </span>
                      ) : '—'}
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
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Narrative Card ───────────────────────────────────────────────────────────

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
  const initialText = toText(section?.value);
  const [text, setText]   = useState(initialText);
  const [dirty, setDirty] = useState(false);
  const update = useUpdateSection();

  async function handleSave() {
    await update.mutateAsync({ paperId, sectionKey, value: text });
    setDirty(false);
  }

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <PenLine className="w-4 h-4 text-gray-400" />
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">{sectionKey}</span>
          <span className="text-sm font-semibold text-gray-700">Conclusión del Área</span>
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
        rows={6}
        className="w-full px-4 py-3 text-sm text-gray-700 resize-y focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-200 rounded-b-xl"
        placeholder="Escribe aquí la conclusión del auditor sobre este grupo de cuentas una vez ejecutados los procedimientos de campo..."
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
  paperId:      string;
  paperCode:    string;
  auditId:      string;
  syncStatus:   WpSyncStatus;
  sections:     WpPaperSection[];
  lastSyncedAt?: string;
  /** Maps paperCode → { groupName, prefix, detailSections[{ key, label, subSumaria }], analysisSectionKey, proceduresSectionKey, conclusionSectionKey } */
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

  const s1 = sections.find(s => s.sectionKey === 'S1');
  const sAnalysis    = sections.find(s => s.sectionKey === config.analysisSectionKey);
  const sProcedures  = sections.find(s => s.sectionKey === config.proceduresSectionKey);
  const sConclusion  = sections.find(s => s.sectionKey === config.conclusionSectionKey);

  const detailPairs = config.detailSections
    .map(det => ({ ...det, rows: toAccountRows(sections.find(s => s.sectionKey === det.key)?.value) }))
    .filter(d => d.rows.length > 0);

  const hasContent = detailPairs.length > 0 || toText(sAnalysis?.value).length > 10;

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

      {/* ── Materialidad banner ── */}
      {!isRegenerating && <MaterialidadBanner auditId={auditId} sections={sections} prefix={config.prefix} />}

      {/* ── S1: Summary table ── */}
      {!isRegenerating && s1 && Array.isArray(s1.value) && (s1.value as unknown[]).length > 0 && (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">S1</span>
            <p className="text-sm font-semibold text-gray-700">Resumen por Sub-Grupo — {config.groupName}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Sub-sumaria', 'Grupo', 'Saldo actual', 'Saldo ant.', 'Saldo ant.-2', 'N° cuentas'].map(h => (
                    <th key={h} className={`px-3 py-2 text-xs font-semibold text-gray-500 ${h === 'Sub-sumaria' || h === 'Grupo' ? 'text-left' : 'text-right'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(s1.value as Array<{ sub_sumaria: string; grupo: string; saldo_actual: number; saldo_anterior: number; saldo_anterior2: number; n_cuentas: number }>).map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-3 py-2.5 font-mono text-xs font-bold text-blue-600">{row.sub_sumaria}</td>
                    <td className="px-3 py-2.5 text-gray-700">{row.grupo}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{fmtNum(row.saldo_actual)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-400">{fmtNum(row.saldo_anterior)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-300">{fmtNum(row.saldo_anterior2)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-500">{row.n_cuentas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── S2-S5: Account detail tables ── */}
      {!isRegenerating && detailPairs.map(det => (
        <AccountDetailTable
          key={det.key}
          label={det.label}
          sectionKey={det.key}
          rows={det.rows}
          mg={mat?.mg ?? null}
          me={mat?.me ?? null}
        />
      ))}

      {/* ── AI Analysis (S6 or equivalent) ── */}
      {!isRegenerating && (
        <NarrativeCard
          icon={TrendingUp}
          sectionKey={config.analysisSectionKey}
          title="Análisis de Variaciones"
          color="bg-blue-50 border-blue-100 text-blue-800"
          text={toText(sAnalysis?.value)}
        />
      )}

      {/* ── Suggested procedures (S7 or equivalent) ── */}
      {!isRegenerating && (
        <NarrativeCard
          icon={ClipboardList}
          sectionKey={config.proceduresSectionKey}
          title="Procedimientos Sustantivos Recomendados"
          color="bg-violet-50 border-violet-100 text-violet-800"
          text={toText(sProcedures?.value)}
        />
      )}

      {/* ── Conclusion editor (S9 or equivalent) ── */}
      {!isRegenerating && (
        <ConclusionEditor
          paperId={paperId}
          sectionKey={config.conclusionSectionKey}
          section={sConclusion}
        />
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
              Asegúrate de haber importado el balance de comprobación en B-00 y propagado los datos
              antes de consolidar.
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
    </div>
  );
}
