'use client';

import { useState, useCallback, useRef } from 'react';
import {
  Loader2, RefreshCw, AlertTriangle, CheckCircle2, Clock,
  Sparkles, TrendingUp, ClipboardList, PenLine, ChevronDown, ChevronUp,
  Save, Paperclip, X, FileText, Image as ImageIcon, FileSpreadsheet, File as FileGeneric,
} from 'lucide-react';
import {
  useConsolidatePaper, useUpdateSection, useMaterialidad,
  useAttachToAccountSchedule, useRemoveAccountScheduleAttachment,
} from '@/hooks/useWorkingPaperGraph';
import type { WpSyncStatus, WpPaperSection } from '@/hooks/useWorkingPapers';
import type { EvidenceAttachment } from './DocumentEvidencePanel';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AccountRow {
  id?:             string;   // generated client-side if missing (legacy rows)
  cuenta:          string;
  descripcion:     string;
  saldo_actual:    number;
  saldo_anterior:  number;
  var_abs:         number;
  var_pct:         number;
  ajuste_debito?:   number;
  ajuste_credito?:  number;
  nota_auditor?:   string;
  attachments?:    EvidenceAttachment[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtNum = (n: number) =>
  new Intl.NumberFormat('es-SV', { maximumFractionDigits: 0 }).format(n);

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('es-SV', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

const fmtDate = (iso?: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('es-SV', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
};

/** Comparative (prior-year) cut-off — same calendar date one year before the audited period end. */
function priorYearIso(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString();
}

function genRowId(): string {
  return `lsr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function semaforo(abs: number, mg: number | null, me: number | null) {
  if (!mg && !me) return null;
  if (mg && abs > mg) return { icon: '🔴', label: 'Material',    cls: 'text-red-600 bg-red-50' };
  if (me && abs > me) return { icon: '🟡', label: 'Significativo', cls: 'text-amber-600 bg-amber-50' };
  return                       { icon: '🟢', label: 'Inmaterial', cls: 'text-emerald-600 bg-emerald-50' };
}

function toAccountRows(value: unknown): AccountRow[] {
  if (!Array.isArray(value)) return [];
  return (value as AccountRow[])
    .filter(r => r && typeof r.cuenta === 'string')
    .map(r => ({ ...r, id: r.id ?? genRowId() }));
}

function toText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType === 'application/pdf') return <FileText className="w-3.5 h-3.5 shrink-0 text-red-500" />;
  if (mimeType.startsWith('image/'))  return <ImageIcon className="w-3.5 h-3.5 shrink-0 text-blue-500" />;
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv'))
    return <FileSpreadsheet className="w-3.5 h-3.5 shrink-0 text-emerald-600" />;
  return <FileGeneric className="w-3.5 h-3.5 shrink-0 text-gray-400" />;
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

// ─── Account Detail Table (with per-row annotations, adjustments & evidence) ──

function AccountDetailTable({
  label, sectionKey, paperId, initialRows, mg, me, fechaActual, fechaAnterior,
}: {
  label:          string;
  sectionKey:     string;
  paperId:        string;
  initialRows:    AccountRow[];
  mg:             number | null;
  me:             number | null;
  fechaActual:    string | null;
  fechaAnterior:  string | null;
}) {
  const [open, setOpen]   = useState(true);
  const [rows, setRows]   = useState<AccountRow[]>(initialRows);
  const [saving, setSaving] = useState<string | null>(null);
  const update = useUpdateSection();
  const attachMutation = useAttachToAccountSchedule();
  const removeMutation = useRemoveAccountScheduleAttachment();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [removingId,  setRemovingId]  = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const total    = rows.reduce((s, r) => s + (r.saldo_actual  ?? 0), 0);
  const totalAnt = rows.reduce((s, r) => s + (r.saldo_anterior ?? 0), 0);
  const totalVar = total - totalAnt;
  const totalDeb = rows.reduce((s, r) => s + (r.ajuste_debito  ?? 0), 0);
  const totalCred = rows.reduce((s, r) => s + (r.ajuste_credito ?? 0), 0);
  const totalAuditado = total + totalDeb - totalCred;

  function persist(updated: AccountRow[], rowId: string) {
    setRows(updated);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSaving(rowId);
      try {
        await update.mutateAsync({ paperId, sectionKey, value: updated });
      } finally {
        setSaving(null);
      }
    }, 900);
  }

  const updateRow = useCallback((rowId: string, patch: Partial<AccountRow>) => {
    persist(rows.map(r => r.id === rowId ? { ...r, ...patch } : r), rowId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, paperId, sectionKey, update]);

  async function handleUpload(row: AccountRow, file: File) {
    if (!row.id) return;
    setUploadingId(row.id);
    try {
      const att = await attachMutation.mutateAsync({ paperId, rowId: row.id, file });
      const updated = rows.map(r => r.id === row.id ? { ...r, attachments: [...(r.attachments ?? []), att] } : r);
      setRows(updated);
      await update.mutateAsync({ paperId, sectionKey, value: updated });
    } catch (e) {
      alert('Error al subir el adjunto: ' + (e as Error).message);
    } finally {
      setUploadingId(null);
    }
  }

  async function handleRemoveAttachment(row: AccountRow, attachmentId: string) {
    if (!row.id) return;
    setRemovingId(attachmentId);
    try {
      await removeMutation.mutateAsync({ paperId, rowId: row.id, attachmentId });
      const updated = rows.map(r => r.id === row.id ? { ...r, attachments: (r.attachments ?? []).filter(a => a.id !== attachmentId) } : r);
      setRows(updated);
      await update.mutateAsync({ paperId, sectionKey, value: updated });
    } catch (e) {
      alert('Error al quitar el adjunto: ' + (e as Error).message);
    } finally {
      setRemovingId(null);
    }
  }

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
                <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-right">
                  Saldo al{fechaAnterior && <span className="block font-normal text-gray-400 normal-case">{fechaAnterior}</span>}
                </th>
                <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-right">Var. $</th>
                <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-right">Var. %</th>
                <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-right">
                  Saldo al{fechaActual && <span className="block font-normal text-gray-400 normal-case">{fechaActual}</span>}
                </th>
                <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-right" title="Ajustes y/o reclasificaciones — débito">Ajuste Débito</th>
                <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-right" title="Ajustes y/o reclasificaciones — crédito">Ajuste Crédito</th>
                <th className="px-3 py-2 text-xs font-semibold text-emerald-700 text-right bg-emerald-50/60">
                  Saldo{fechaActual && <span className="block font-normal text-emerald-500 normal-case">{fechaActual}</span>} s/Auditoría
                </th>
                <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-center">Mat.</th>
                <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-left min-w-[180px]">
                  Resultado de revisión
                </th>
                <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-left min-w-[160px]">
                  Evidencia
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(row => {
                const sem = semaforo(Math.abs(row.saldo_actual), mg, me);
                const varColor = row.var_abs > 0 ? 'text-emerald-600' : row.var_abs < 0 ? 'text-red-500' : 'text-gray-400';
                const rowId = row.id ?? '';
                const auditado = row.saldo_actual + (row.ajuste_debito ?? 0) - (row.ajuste_credito ?? 0);
                return (
                  <tr key={rowId} className="hover:bg-gray-50/50 transition-colors align-top">
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-500 whitespace-nowrap">{row.cuenta}</td>
                    <td className="px-3 py-2.5 text-gray-800 max-w-[180px]">{row.descripcion}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-400 whitespace-nowrap">{fmtNum(row.saldo_anterior)}</td>
                    <td className={`px-3 py-2.5 text-right font-mono whitespace-nowrap ${varColor}`}>
                      {row.var_abs >= 0 ? '+' : ''}{fmtNum(row.var_abs)}
                    </td>
                    <td className={`px-3 py-2.5 text-right text-xs font-medium whitespace-nowrap ${varColor}`}>
                      {row.var_pct >= 0 ? '+' : ''}{row.var_pct}%
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-800 whitespace-nowrap">{fmtNum(row.saldo_actual)}</td>
                    <td className="px-2 py-1.5 w-24">
                      <input
                        type="text"
                        inputMode="decimal"
                        defaultValue={row.ajuste_debito ? String(row.ajuste_debito) : ''}
                        onBlur={e => {
                          const v = parseFloat(e.target.value.replace(/,/g, ''));
                          updateRow(rowId, { ajuste_debito: isNaN(v) ? 0 : v });
                        }}
                        placeholder="0"
                        className="w-full text-xs text-right text-gray-800 bg-transparent border-b border-transparent hover:border-gray-200 focus:border-blue-400 focus:outline-none py-0.5 tabular-nums placeholder:text-gray-300"
                      />
                    </td>
                    <td className="px-2 py-1.5 w-24">
                      <input
                        type="text"
                        inputMode="decimal"
                        defaultValue={row.ajuste_credito ? String(row.ajuste_credito) : ''}
                        onBlur={e => {
                          const v = parseFloat(e.target.value.replace(/,/g, ''));
                          updateRow(rowId, { ajuste_credito: isNaN(v) ? 0 : v });
                        }}
                        placeholder="0"
                        className="w-full text-xs text-right text-gray-800 bg-transparent border-b border-transparent hover:border-gray-200 focus:border-blue-400 focus:outline-none py-0.5 tabular-nums placeholder:text-gray-300"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-emerald-700 whitespace-nowrap bg-emerald-50/60">
                      {fmtNum(auditado)}
                    </td>
                    <td className="px-3 py-2.5 text-center whitespace-nowrap">
                      {sem ? (
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${sem.cls}`}>
                          {sem.icon}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-2 py-1.5 min-w-[180px]">
                      <div className="relative">
                        <textarea
                          value={row.nota_auditor ?? ''}
                          onChange={e => updateRow(rowId, { nota_auditor: e.target.value })}
                          rows={2}
                          className="w-full text-xs text-gray-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5 resize-y focus:outline-none focus:ring-2 focus:ring-amber-200 placeholder:text-gray-300"
                          placeholder="Anote el resultado de la revisión para esta cuenta…"
                        />
                        {saving === rowId && (
                          <span className="absolute top-1 right-1">
                            <Save className="w-3 h-3 text-amber-400 animate-pulse" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2.5 min-w-[160px]">
                      <div className="flex flex-col gap-1">
                        {(row.attachments ?? []).map(att => (
                          <div key={att.id} className="flex items-center gap-1.5 px-1.5 py-1 bg-white border border-gray-100 rounded-md shadow-sm group/chip hover:border-gray-200">
                            <FileIcon mimeType={att.mimeType} />
                            <a href={att.url} target="_blank" rel="noreferrer" className="text-[11px] text-blue-600 hover:underline truncate max-w-[80px]" title={att.filename}>
                              {att.filename}
                            </a>
                            <span className="text-[10px] text-gray-400 ml-auto shrink-0">{fmtSize(att.size)}</span>
                            <button
                              onClick={() => handleRemoveAttachment(row, att.id)}
                              disabled={removingId === att.id}
                              className="opacity-0 group-hover/chip:opacity-100 text-gray-300 hover:text-red-500 transition-all disabled:opacity-50 shrink-0"
                              title="Quitar adjunto"
                            >
                              {removingId === att.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                            </button>
                          </div>
                        ))}
                        <input
                          ref={el => { fileInputRefs.current[rowId] = el; }}
                          type="file"
                          className="hidden"
                          accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.xlsx,.xls,.csv,.docx,.doc,.txt,.zip"
                          onChange={e => {
                            const f = e.target.files?.[0];
                            if (f) handleUpload(row, f);
                            e.target.value = '';
                          }}
                        />
                        <button
                          onClick={() => fileInputRefs.current[rowId]?.click()}
                          disabled={uploadingId === rowId}
                          className="flex items-center gap-1 text-[10px] text-blue-500 hover:text-blue-700 border border-dashed border-blue-200 hover:border-blue-400 rounded-md px-2 py-1 transition-colors disabled:opacity-50"
                        >
                          {uploadingId === rowId ? <Loader2 className="w-3 h-3 animate-spin" /> : <Paperclip className="w-3 h-3" />}
                          Adjuntar evidencia
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold">
                <td colSpan={2} className="px-3 py-2 text-xs text-gray-600 uppercase tracking-wide">Total</td>
                <td className="px-3 py-2 text-right font-mono text-gray-400">{fmtNum(totalAnt)}</td>
                <td className={`px-3 py-2 text-right font-mono ${totalVar >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {totalVar >= 0 ? '+' : ''}{fmtNum(totalVar)}
                </td>
                <td />
                <td className="px-3 py-2 text-right font-mono text-gray-800">{fmtNum(total)}</td>
                <td className="px-3 py-2 text-right font-mono text-gray-700">{fmtNum(totalDeb)}</td>
                <td className="px-3 py-2 text-right font-mono text-gray-700">{fmtNum(totalCred)}</td>
                <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700 bg-emerald-50/60">{fmtNum(totalAuditado)}</td>
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

// ─── Editable narrative editor (generic — used for Conclusión, Apreciación del
// auditor, and Procedimientos editables) ──────────────────────────────────────

interface EditorColorScheme {
  border: string; headerBg: string; headerBorder: string; iconColor: string; titleColor: string; ring: string;
}
const EDITOR_COLORS: Record<'blue' | 'violet' | 'amber', EditorColorScheme> = {
  blue:   { border: 'border-blue-200',   headerBg: 'bg-blue-50',   headerBorder: 'border-blue-100',   iconColor: 'text-blue-500',   titleColor: 'text-blue-800',   ring: 'focus:ring-blue-200' },
  violet: { border: 'border-violet-200', headerBg: 'bg-violet-50', headerBorder: 'border-violet-100', iconColor: 'text-violet-500', titleColor: 'text-violet-800', ring: 'focus:ring-violet-200' },
  amber:  { border: 'border-amber-200',  headerBg: 'bg-amber-50',  headerBorder: 'border-amber-100',  iconColor: 'text-amber-500',  titleColor: 'text-amber-800',  ring: 'focus:ring-amber-200' },
};

function ConclusionEditor({
  paperId, sectionKey, section,
  title = 'Conclusión Preliminar del Área',
  icon: Icon = PenLine,
  color = 'blue',
  placeholder = 'Escribe aquí la conclusión preliminar del auditor sobre este grupo de cuentas. Indica si los saldos son razonables y si se requieren procedimientos adicionales…',
  helperNote,
}: {
  paperId:    string;
  sectionKey: string;
  section:    WpPaperSection | undefined;
  title?:     string;
  icon?:      React.ElementType;
  color?:     'blue' | 'violet' | 'amber';
  placeholder?: string;
  helperNote?: string;
}) {
  const [text, setText]   = useState(toText(section?.value));
  const [dirty, setDirty] = useState(false);
  const update = useUpdateSection();
  const c = EDITOR_COLORS[color];

  async function handleSave() {
    await update.mutateAsync({ paperId, sectionKey, value: text });
    setDirty(false);
  }

  return (
    <div className={`rounded-xl border ${c.border} overflow-hidden shadow-sm`}>
      <div className={`flex items-center justify-between px-4 py-3 ${c.headerBg} border-b ${c.headerBorder}`}>
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${c.iconColor}`} />
          <span className={`text-xs font-bold uppercase tracking-wide opacity-60 ${c.titleColor}`}>{sectionKey}</span>
          <span className={`text-sm font-semibold ${c.titleColor}`}>{title}</span>
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
      {helperNote && (
        <p className="px-4 pt-2 text-[11px] text-gray-400">{helperNote}</p>
      )}
      <textarea
        value={text}
        onChange={e => { setText(e.target.value); setDirty(true); }}
        onBlur={() => { if (dirty) handleSave(); }}
        rows={5}
        className={`w-full px-4 py-3 text-sm text-gray-700 resize-y focus:outline-none focus:ring-2 focus:ring-inset ${c.ring}`}
        placeholder={placeholder}
      />
    </div>
  );
}

// ─── Reconsolidate modal — merge vs. overwrite ───────────────────────────────

function ReconsolidateModal({
  onConfirm, onClose,
}: {
  onConfirm: (mode: 'overwrite' | 'merge') => Promise<void>;
  onClose:   () => void;
}) {
  const [loadingMode, setLoadingMode] = useState<'overwrite' | 'merge' | null>(null);

  async function handle(mode: 'overwrite' | 'merge') {
    setLoadingMode(mode);
    try { await onConfirm(mode); onClose(); }
    finally { setLoadingMode(null); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="px-6 pt-6 pb-3">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-violet-100">
            <Sparkles className="h-5 w-5 text-violet-600" />
          </div>
          <h3 className="text-sm font-semibold text-gray-800">Reconsolidar con IA</h3>
          <p className="mt-1 text-xs text-gray-500">
            Esta área puede tener notas de revisión, ajustes o evidencia cargada por el auditor. ¿Cómo quieres reconsolidar?
          </p>
        </div>
        <div className="px-6 pb-5 space-y-2">
          <button
            onClick={() => handle('merge')}
            disabled={loadingMode !== null}
            className="w-full flex items-start gap-3 text-left px-4 py-3 rounded-xl border-2 border-blue-200 bg-blue-50 hover:border-blue-400 transition-colors disabled:opacity-50"
          >
            <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <span>
              <span className="flex items-center gap-1.5 text-sm font-semibold text-blue-800">
                Mantener notas y adjuntos
                {loadingMode === 'merge' && <Loader2 className="w-3 h-3 animate-spin" />}
              </span>
              <span className="block text-xs text-blue-600 mt-0.5">
                Actualiza saldos y análisis con los datos más recientes de B-00, pero conserva tus notas de revisión, ajustes Débito/Crédito y evidencia adjunta por cuenta.
              </span>
            </span>
          </button>
          <button
            onClick={() => handle('overwrite')}
            disabled={loadingMode !== null}
            className="w-full flex items-start gap-3 text-left px-4 py-3 rounded-xl border-2 border-red-200 bg-red-50 hover:border-red-400 transition-colors disabled:opacity-50"
          >
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <span>
              <span className="flex items-center gap-1.5 text-sm font-semibold text-red-800">
                Sobrescribir todo
                {loadingMode === 'overwrite' && <Loader2 className="w-3 h-3 animate-spin" />}
              </span>
              <span className="block text-xs text-red-600 mt-0.5">
                Regenera todo desde cero. Se perderán las notas de revisión, ajustes y evidencia cargada por el auditor en esta área.
              </span>
            </span>
          </button>
        </div>
        <div className="flex justify-end border-t border-gray-100 px-6 py-3">
          <button
            onClick={onClose}
            disabled={loadingMode !== null}
            className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      </div>
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
  paperId:         string;
  paperCode:       string;
  auditId:         string;
  syncStatus:      WpSyncStatus;
  sections:        WpPaperSection[];
  lastSyncedAt?:   string;
  auditPeriodEnd?: string | null;
  config: {
    groupName:             string;
    prefix:                string;
    detailSections:        { key: string; label: string; subSumaria: string }[];
    analysisSectionKey?:   string;
    proceduresSectionKey?: string;
    conclusionSectionKey:  string;
    auditorNotesKey?:      string;
  };
}

export function LeadScheduleMasterView({
  paperId, paperCode, auditId, syncStatus, sections, lastSyncedAt, config, auditPeriodEnd,
}: LeadScheduleMasterViewProps) {
  const consolidate    = useConsolidatePaper();
  const { data: mat }  = useMaterialidad(auditId);
  const isRegenerating = syncStatus === 'REGENERATING' || consolidate.isPending;
  const [showReconsolidateModal, setShowReconsolidateModal] = useState(false);

  function requestConsolidate() {
    // Only ask merge-vs-overwrite when there's existing work that could be lost —
    // a fresh DRAFT paper has nothing to preserve, so just consolidate directly.
    if (syncStatus === 'SYNCED' || syncStatus === 'STALE') {
      setShowReconsolidateModal(true);
    } else {
      void consolidate.mutateAsync({ paperId, mode: 'merge' });
    }
  }

  const sAnalysis     = sections.find(s => s.sectionKey === config.analysisSectionKey);
  const sProcedures   = sections.find(s => s.sectionKey === config.proceduresSectionKey);
  const sConclusion   = sections.find(s => s.sectionKey === config.conclusionSectionKey);
  const sAuditorNotes = config.auditorNotesKey ? sections.find(s => s.sectionKey === config.auditorNotesKey) : undefined;

  // Cut-off dates for the column labels — derived from the audit's own examined
  // period (comparative year = same calendar date, one year earlier).
  const fechaActual   = fmtDate(auditPeriodEnd);
  const fechaAnterior = fmtDate(priorYearIso(auditPeriodEnd));

  // Compute group total from S2-S5 detail rows (reliable even when S1 is empty)
  const detailPairs = config.detailSections.map(det => ({
    ...det,
    rows: toAccountRows(sections.find(s => s.sectionKey === det.key)?.value),
  }));
  const groupTotal = detailPairs.flatMap(d => d.rows).reduce((s, r) => s + Math.abs(r.saldo_actual ?? 0), 0);
  const hasContent = detailPairs.some(d => d.rows.length > 0)
    || toText(sAnalysis?.value).length > 10
    || toText(sConclusion?.value).length > 10;

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
              onClick={requestConsolidate}
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
            onClick={requestConsolidate}
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
            onClick={() => consolidate.mutateAsync({ paperId, mode: 'merge' })}
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

          {/* ── Análisis de Variaciones (AI) ── siempre se conserva ── */}
          {config.analysisSectionKey && (
            <NarrativeCard
              icon={TrendingUp}
              sectionKey={config.analysisSectionKey}
              title="Análisis de Variaciones"
              color="bg-blue-50 border-blue-100 text-blue-800"
              text={toText(sAnalysis?.value)}
            />
          )}

          {/* ── Apreciación propia del auditor, adicional al análisis IA ── */}
          {config.auditorNotesKey && (
            <ConclusionEditor
              paperId={paperId}
              sectionKey={config.auditorNotesKey}
              section={sAuditorNotes}
              title="Apreciación del Auditor"
              icon={PenLine}
              color="violet"
              placeholder="Anota tu propio criterio profesional sobre estas variaciones — matices, contexto del cliente o dudas que el análisis automático no capture…"
            />
          )}

          {/* ── S9: Conclusión Preliminar ── BEFORE tables ── */}
          <ConclusionEditor
            paperId={paperId}
            sectionKey={config.conclusionSectionKey}
            section={sConclusion}
          />

          {/* ── S2-S5: Account detail tables (with per-row annotation, adjustments & evidence) ── */}
          {detailPairs.filter(d => d.rows.length > 0).map(det => (
            <AccountDetailTable
              key={det.key}
              label={det.label}
              sectionKey={det.key}
              paperId={paperId}
              initialRows={det.rows}
              mg={mat?.mg ?? null}
              me={mat?.me ?? null}
              fechaActual={fechaActual}
              fechaAnterior={fechaAnterior}
            />
          ))}

          {/* ── Procedimientos sugeridos — propuesta de la IA, editable por el auditor ── */}
          {config.proceduresSectionKey && (
            <ConclusionEditor
              paperId={paperId}
              sectionKey={config.proceduresSectionKey}
              section={sProcedures}
              title="Procedimientos Sustantivos Recomendados"
              icon={ClipboardList}
              color="amber"
              placeholder="Procedimientos analíticos adicionales sugeridos según las variaciones identificadas…"
              helperNote="Propuesta generada por IA — edítala libremente; no tiene carácter obligatorio."
            />
          )}
        </>
      )}

      {showReconsolidateModal && (
        <ReconsolidateModal
          onConfirm={async mode => { await consolidate.mutateAsync({ paperId, mode }); }}
          onClose={() => setShowReconsolidateModal(false)}
        />
      )}
    </div>
  );
}
