'use client';

import { useState, useCallback, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Bot, CheckCircle2, Circle, Clock, AlertCircle, Lock, Plus, Trash2,
  MessageSquare, History, FileText, Network,
  Link2, Save, Sparkles, Loader2, X, Wand2,
  Brain, Star, Activity, AlertTriangle, RefreshCw, Zap,
  Folder, ChevronRight, Calendar, User, RotateCcw,
  Download, ExternalLink, FileSpreadsheet, Presentation, Music, Video,
  Image as ImageIcon, ArrowLeft, Calculator,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import {
  useWorkingPaper, useUpdateWorkingPaper, useUpdateWpStatus,
  useAddTickMark, useRemoveTickMark, useAddWpComment, useResolveWpComment,
  useWpVersions,
  WP_STATUS_CONFIG, WP_STATUS_FLOW, WP_TYPE_CONFIG, TICK_MARK_CONFIG,
  WP_KIND_CONFIG, SYNC_STATUS_CONFIG,
  type WpStatus, type TickMarkKey, type WpKind, type WpSyncStatus,
} from '@/hooks/useWorkingPapers';
import { SmartPaperSections }     from '@/components/working-papers/SmartPaperSections';
import { MasterPaperView }         from '@/components/working-papers/MasterPaperView';
import { PaperGraphPanel }         from '@/components/working-papers/PaperGraphPanel';
import { QualityGatePanel }        from '@/components/working-papers/QualityGatePanel';
import { LivePaperDashboard }      from '@/components/working-papers/LivePaperDashboard';
import { CrossAuditSuggestions }   from '@/components/working-papers/CrossAuditSuggestions';
import { PaperProceduresPanel, type AppliedProcedure } from '@/components/working-papers/PaperProceduresPanel';
import { PaperAgentPanel, PaperAgentButton, PAPER_AGENT_MAP, DEFAULT_AGENT } from '@/components/working-papers/PaperAgentPanel';
import { SamplingCalculatorModal }  from '@/components/working-papers/SamplingCalculatorModal';
import { CosoAssessmentPanel, assessmentToText } from '@/components/working-papers/CosoAssessmentPanel';
import { DocumentEvidencePanel, type DocumentEvidenceRow } from '@/components/working-papers/DocumentEvidencePanel';
import { useUpdateSection }         from '@/hooks/useWorkingPaperGraph';
import { type CosoAssessment }      from '@/hooks/useCosoAssessment';
import { VersionHistoryPanel }      from '@/components/working-papers/VersionHistoryPanel';
import type { AiDraftConfig } from '@/components/working-papers/SectionField';
import { apiClient }            from '@/lib/api-client';
import { formatDate, formatRelativeTime } from '@/lib/utils';
import type { WorkingPaper, TickMarkEntry } from '@/hooks/useWorkingPapers';
import { useSignOff, usePbcLinks, useLinkPbc, useUnlinkPbc } from '@/hooks/useWorkingPaperSignOff';
import type { SignOffLevel } from '@/hooks/useWorkingPaperSignOff';
import { useCheckout, useCheckin } from '@/hooks/useCheckout';

// ─── Scriptorium Draft Modal ──────────────────────────────────────────────────

interface GeneratedDraft {
  objective?: string;
  scope?: string;
  procedures?: Array<{ step?: number; description: string; technique?: string; expectedEvidence?: string }>;
  conclusion?: string;
  reviewNotes?: string;
  niaReferences?: string[];
}

interface DraftResponse {
  draft: GeneratedDraft;
  model: string;
  paperType: string;
}

function ScriptoriumDraftModal({
  wp,
  onClose,
  onApply,
}: {
  wp: WorkingPaper;
  onClose: () => void;
  onApply: (content: Record<string, string>, conclusion: string) => void;
}) {
  const [draft, setDraft]     = useState<GeneratedDraft | null>(null);
  const [aiModel, setAiModel] = useState('');
  const [error, setError]     = useState('');

  const generate = useMutation({
    mutationFn: () =>
      apiClient.post<DraftResponse>('/ai/scriptorium/working-paper', {
        paperType:  wp.type,
        auditTitle: wp.audit?.title ?? '',
        auditType:  wp.audit?.type ?? '',
        scope:      wp.audit?.scope ?? '',
        context:    `Código: ${wp.code}. Título: ${wp.title}.`,
      }),
    onSuccess: (data) => {
      setDraft(data.draft);
      setAiModel(data.model ?? '');
    },
    onError: (err: Error) => setError(err.message),
  });

  function handleApply() {
    if (!draft) return;
    const newContent: Record<string, string> = {};
    if (draft.objective)  newContent.objective = draft.objective;
    if (draft.scope)      newContent.scope = draft.scope;
    if (draft.procedures?.length) {
      newContent.procedures = draft.procedures
        .map((p, i) => `${i + 1}. ${p.description}${p.technique ? ` [${p.technique}]` : ''}`)
        .join('\n');
    }
    if (draft.reviewNotes)     newContent.reviewNotes = draft.reviewNotes;
    if (draft.niaReferences?.length) newContent.references = draft.niaReferences.join(', ');
    onApply(newContent, draft.conclusion ?? '');
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-600 flex items-center justify-center">
              <Wand2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Generar borrador con Scriptorium</h2>
              <p className="text-xs text-gray-500">{WP_TYPE_CONFIG[wp.type]?.label ?? wp.type}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-6 py-5">
          {!draft && !generate.isPending && (
            <div className="flex flex-col items-center py-10 gap-4 text-center">
              <div className="w-16 h-16 rounded-2xl bg-violet-50 border border-violet-200 flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-violet-400" />
              </div>
              <div>
                <p className="font-semibold text-gray-800 mb-1">Scriptorium generará un borrador completo</p>
                <p className="text-sm text-gray-400 max-w-xs">
                  Objetivo, alcance, procedimientos con técnicas NIA y conclusión — adaptado al tipo de papel y la auditoría.
                </p>
              </div>
              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</p>
              )}
              <button
                onClick={() => generate.mutate()}
                className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700"
              >
                <Sparkles className="w-4 h-4" /> Generar borrador
              </button>
            </div>
          )}

          {generate.isPending && (
            <div className="flex flex-col items-center py-12 gap-3">
              <div className="flex gap-1.5">
                {[0,1,2,3].map(i => (
                  <div key={i} className="w-2 h-2 rounded-full bg-violet-400 animate-bounce"
                    style={{ animationDelay: `${i*100}ms` }} />
                ))}
              </div>
              <p className="text-sm text-violet-600">Scriptorium está redactando el papel de trabajo…</p>
            </div>
          )}

          {draft && (
            <div className="space-y-4">
              {aiModel && (
                <p className="text-xs text-violet-500 flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3" /> Generado con {aiModel}
                </p>
              )}
              {draft.objective && <DraftSection title="Objetivo" content={draft.objective} />}
              {draft.scope && <DraftSection title="Alcance" content={draft.scope} />}
              {draft.procedures?.length && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Procedimientos</p>
                  <div className="space-y-2">
                    {draft.procedures.map((p, i) => (
                      <div key={i} className="bg-gray-50 rounded-xl p-3">
                        <p className="text-sm text-gray-700"><span className="font-medium text-gray-500 mr-1">{i+1}.</span>{p.description}</p>
                        {p.technique && <p className="text-xs text-violet-600 mt-0.5 ml-4">Técnica: {p.technique}</p>}
                        {p.expectedEvidence && <p className="text-xs text-blue-600 mt-0.5 ml-4">Evidencia: {p.expectedEvidence}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {draft.conclusion && <DraftSection title="Conclusión" content={draft.conclusion} />}
              {draft.niaReferences?.length && (
                <div className="flex flex-wrap gap-1.5">
                  {draft.niaReferences.map(r => (
                    <span key={r} className="text-xs bg-blue-50 border border-blue-200 text-blue-700 px-2 py-0.5 rounded">{r}</span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between flex-shrink-0">
          <div>
            {draft && (
              <button onClick={() => { setDraft(null); generate.mutate(); }}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-violet-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:border-violet-200">
                <Sparkles className="w-3.5 h-3.5" /> Regenerar
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-4 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">
              Cancelar
            </button>
            {draft && (
              <button onClick={handleApply}
                className="flex items-center gap-2 px-5 py-1.5 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700">
                <CheckCircle2 className="w-4 h-4" /> Aplicar borrador
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DraftSection({ title, content }: { title: string; content: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{title}</p>
      <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 rounded-xl p-3 whitespace-pre-wrap">{content}</p>
    </div>
  );
}

// ─── Section editor ───────────────────────────────────────────────────────────

function ContentSection({
  label,
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  rows?: number;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="border-b border-gray-100 last:border-0 py-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{label}</p>
      {editing ? (
        <div className="space-y-2">
          <textarea
            autoFocus
            rows={rows}
            value={value}
            onChange={e => onChange(e.target.value)}
            className="w-full text-sm border border-blue-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
          />
          <button
            onClick={() => setEditing(false)}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            Listo
          </button>
        </div>
      ) : (
        <div
          onClick={() => setEditing(true)}
          className="min-h-[2.5rem] cursor-text text-sm text-gray-700 leading-relaxed rounded-lg p-2 -mx-2 hover:bg-gray-50 transition-colors"
        >
          {value ? (
            <p className="whitespace-pre-wrap">{value}</p>
          ) : (
            <p className="text-gray-400 italic">{placeholder}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tick mark row ────────────────────────────────────────────────────────────

function TickMarkRow({ entry, onRemove }: {
  entry: TickMarkEntry;
  onRemove: () => void;
}) {
  const cfg = TICK_MARK_CONFIG[entry.tickMark as TickMarkKey];
  return (
    <tr className="hover:bg-gray-50 transition-colors group">
      <td className="px-3 py-2.5 text-sm text-gray-700">{entry.fieldPath}</td>
      <td className="px-3 py-2.5 text-center">
        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg bg-gray-50 border border-gray-200 font-mono font-bold text-sm ${cfg?.color}`}>
          {cfg?.symbol ?? entry.tickMark}
        </span>
      </td>
      <td className="px-3 py-2.5 text-xs text-gray-500">{cfg?.label}</td>
      <td className="px-3 py-2.5 text-xs text-gray-500">{entry.note ?? '—'}</td>
      <td className="px-3 py-2.5 text-right">
        <button
          onClick={onRemove}
          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  );
}

// ─── Add tick mark form ───────────────────────────────────────────────────────

function AddTickMarkForm({ onAdd, disabled }: {
  onAdd: (fieldPath: string, tickMark: TickMarkKey, note?: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState('');
  const [mark, setMark] = useState<TickMarkKey>('VERIFIED');
  const [note, setNote] = useState('');

  const submit = () => {
    if (!path.trim()) return;
    onAdd(path.trim(), mark, note.trim() || undefined);
    setPath(''); setNote(''); setOpen(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium disabled:opacity-40 py-1"
      >
        <Plus className="w-3.5 h-3.5" /> Agregar marca
      </button>
    );
  }

  return (
    <div className="mt-3 bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
      <p className="text-xs font-semibold text-blue-700">Nueva marca de auditoría</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-600 mb-1 block">Ítem / Descripción *</label>
          <input value={path} onChange={e => setPath(e.target.value)}
            placeholder="ej. Saldo cuenta corriente 01-2025"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="text-xs text-gray-600 mb-1 block">Tipo de marca *</label>
          <select value={mark} onChange={e => setMark(e.target.value as TickMarkKey)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            {Object.entries(TICK_MARK_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.symbol} — {v.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="text-xs text-gray-600 mb-1 block">Nota (opcional)</label>
        <input value={note} onChange={e => setNote(e.target.value)}
          placeholder="Aclaración o referencia al documento fuente"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
      <div className="flex gap-2">
        <button onClick={() => setOpen(false)} className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">Cancelar</button>
        <button onClick={submit} disabled={!path.trim()}
          className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
          Agregar
        </button>
      </div>
    </div>
  );
}

// ─── Status workflow ──────────────────────────────────────────────────────────

const STATUS_TRANSITIONS: Partial<Record<WpStatus, WpStatus>> = {
  // Flujo nuevo (estándar industria)
  NOT_STARTED:    'IN_PROGRESS',
  IN_PROGRESS:    'PENDING_REVIEW',
  PENDING_REVIEW: 'REVIEWED',
  RETURNED:       'IN_PROGRESS',      // Volver a en proceso tras observación
  REVIEWED:       'SIGNED_OFF',
  SIGNED_OFF:     'CLOSED',
  // Flujo legacy (compatibilidad)
  DRAFT:          'IN_REVIEW',
  IN_REVIEW:      'APPROVED',
  APPROVED:       'ARCHIVED',
};

// Transición regresiva (devolver al preparador)
const STATUS_RETURN: Partial<Record<WpStatus, WpStatus>> = {
  PENDING_REVIEW: 'RETURNED',
  IN_REVIEW:      'DRAFT',
};

const STATUS_ACTIONS: Partial<Record<WpStatus, string>> = {
  NOT_STARTED:    'Iniciar trabajo',
  IN_PROGRESS:    'Enviar a revisión',
  PENDING_REVIEW: 'Marcar como revisado',
  RETURNED:       'Re-enviar a revisión',
  REVIEWED:       'Aprobar (firmar)',
  SIGNED_OFF:     'Cerrar papel',
  // Legacy
  DRAFT:          'Enviar a revisión',
  IN_REVIEW:      'Aprobar',
  APPROVED:       'Archivar (finalizar)',
};

const STATUS_RETURN_LABEL: Partial<Record<WpStatus, string>> = {
  PENDING_REVIEW: 'Devolver (observar)',
  IN_REVIEW:      'Devolver al preparador',
};

const STATUS_ICONS: Partial<Record<WpStatus, React.ElementType>> = {
  NOT_STARTED:    Clock,
  IN_PROGRESS:    Activity,
  PENDING_REVIEW: AlertCircle,
  RETURNED:       AlertTriangle,
  REVIEWED:       CheckCircle2,
  SIGNED_OFF:     CheckCircle2,
  CLOSED:         Lock,
  DRAFT:          Clock,
  IN_REVIEW:      AlertCircle,
  APPROVED:       CheckCircle2,
  ARCHIVED:       Lock,
};

// ─── FileTypeIcon ─────────────────────────────────────────────────────────────

function FileTypeIcon({ mime, filename, size = 'lg' }: {
  mime: string;
  filename?: string | null;
  size?: 'sm' | 'lg';
}) {
  const ext = (filename ?? '').toLowerCase();
  const isImage = mime.startsWith('image/');
  const isPdf   = mime === 'application/pdf';
  const isAudio = mime.startsWith('audio/');
  const isVideo = mime.startsWith('video/');
  const isWord  = mime.includes('word') || mime.includes('document') ||
                  ext.endsWith('.docx') || ext.endsWith('.doc');
  const isExcel = mime.includes('spreadsheet') || mime.includes('excel') ||
                  ext.endsWith('.xlsx') || ext.endsWith('.xls');
  const isPpt   = mime.includes('presentation') || mime.includes('powerpoint') ||
                  ext.endsWith('.pptx') || ext.endsWith('.ppt');

  const dim  = size === 'lg' ? 'h-16 w-16' : 'h-9 w-9';
  const icon = size === 'lg' ? 'h-8 w-8'   : 'h-4 w-4';
  const txt  = size === 'lg' ? 'text-2xl font-bold' : 'text-[10px] font-bold';

  if (isWord)  return <div className={`flex ${dim} shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white ${txt} select-none shadow-sm`}>W</div>;
  if (isExcel) return <div className={`flex ${dim} shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm`}><FileSpreadsheet className={icon} /></div>;
  if (isPpt)   return <div className={`flex ${dim} shrink-0 items-center justify-center rounded-xl bg-orange-500 text-white shadow-sm`}><Presentation className={icon} /></div>;
  if (isPdf)   return <div className={`flex ${dim} shrink-0 items-center justify-center rounded-xl bg-red-500 text-white ${size === 'lg' ? 'text-sm font-bold' : 'text-[9px] font-bold'} select-none shadow-sm`}>PDF</div>;
  if (isImage) return <div className={`flex ${dim} shrink-0 items-center justify-center rounded-xl bg-pink-500 text-white shadow-sm`}><ImageIcon className={icon} /></div>;
  if (isAudio) return <div className={`flex ${dim} shrink-0 items-center justify-center rounded-xl bg-violet-500 text-white shadow-sm`}><Music className={icon} /></div>;
  if (isVideo) return <div className={`flex ${dim} shrink-0 items-center justify-center rounded-xl bg-sky-500 text-white shadow-sm`}><Video className={icon} /></div>;
  return <div className={`flex ${dim} shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 shadow-sm`}><FileText className={`${icon} text-slate-400`} /></div>;
}

// ─── FilePaperView ────────────────────────────────────────────────────────────

function FilePaperView({ wp }: { wp: WorkingPaper }) {
  const mime    = wp.mimeType ?? '';
  const fileUrl = wp.fileUrl ?? '';

  // Type detection
  const isImage = mime.startsWith('image/');
  const isPdf   = mime === 'application/pdf';
  const isAudio = mime.startsWith('audio/');
  const isVideo = mime.startsWith('video/');
  const isWord  = mime.includes('word') || mime.includes('document') ||
                  (wp.originalFilename ?? '').toLowerCase().endsWith('.docx') ||
                  (wp.originalFilename ?? '').toLowerCase().endsWith('.doc');
  const isExcel = mime.includes('spreadsheet') || mime.includes('excel') ||
                  (wp.originalFilename ?? '').toLowerCase().endsWith('.xlsx') ||
                  (wp.originalFilename ?? '').toLowerCase().endsWith('.xls');
  const isPpt   = mime.includes('presentation') || mime.includes('powerpoint') ||
                  (wp.originalFilename ?? '').toLowerCase().endsWith('.pptx') ||
                  (wp.originalFilename ?? '').toLowerCase().endsWith('.ppt');
  const isOffice = isWord || isExcel || isPpt;

  let typeLabel = 'Archivo';
  if (isImage)  typeLabel = 'Imagen';
  else if (isPdf)   typeLabel = 'PDF';
  else if (isAudio) typeLabel = 'Audio';
  else if (isVideo) typeLabel = 'Video';
  else if (isWord)  typeLabel = 'Word';
  else if (isExcel) typeLabel = 'Excel';
  else if (isPpt)   typeLabel = 'PowerPoint';

  const fmtBytes = (b?: number | null) => {
    if (!b) return '';
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Supabase ?download= forces Content-Disposition: attachment server-side — no CORS needed
  const downloadUrl = fileUrl
    ? `${fileUrl}${fileUrl.includes('?') ? '&' : '?'}download=${encodeURIComponent(wp.originalFilename ?? 'archivo')}`
    : '';

  // Microsoft Office Online viewer for Word / Excel / PPT
  const officeViewerUrl = isOffice && fileUrl
    ? `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(fileUrl)}`
    : null;

  // State for inline Office viewer toggle
  const [showOfficeViewer, setShowOfficeViewer] = useState(false);

  return (
    <div className="space-y-4 p-6 max-w-4xl">
      {/* Info card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-5">
          <FileTypeIcon mime={mime} filename={wp.originalFilename} size="lg" />
          <div className="flex-1 min-w-0">
            <p className="truncate text-base font-semibold text-slate-800">
              {wp.originalFilename ?? wp.title}
            </p>
            <div className="mt-1 flex items-center gap-2.5 text-sm text-slate-500">
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                {typeLabel}
              </span>
              {wp.fileSize && <span>{fmtBytes(wp.fileSize)}</span>}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {/* Always show direct "Abrir" link for every file type */}
              {fileUrl && (
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg bg-[#0F2D4A] px-4 py-2 text-sm font-medium text-white hover:bg-[#1a4a7a]"
                >
                  <ExternalLink className="h-4 w-4" /> Abrir documento
                </a>
              )}

              {/* Download with forced Content-Disposition */}
              {downloadUrl && (
                <a
                  href={downloadUrl}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  <Download className="h-4 w-4" /> Descargar
                </a>
              )}

              {/* Office Online — toggle inline viewer */}
              {officeViewerUrl && (
                <button
                  onClick={() => setShowOfficeViewer(v => !v)}
                  className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium border transition-colors ${
                    showOfficeViewer
                      ? 'bg-orange-600 text-white border-orange-600 hover:bg-orange-700'
                      : 'bg-white text-orange-700 border-orange-300 hover:bg-orange-50'
                  }`}
                >
                  <ExternalLink className="h-4 w-4" />
                  {showOfficeViewer ? 'Ocultar Office Online' : 'Ver en Office Online'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Preview zone ── */}

      {/* Image — inline preview always visible */}
      {isImage && fileUrl && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Vista previa</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fileUrl}
            alt={wp.originalFilename ?? wp.title}
            className="mx-auto max-h-[600px] w-auto rounded-xl object-contain"
          />
        </div>
      )}

      {/* PDF — inline iframe */}
      {isPdf && fileUrl && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Vista previa PDF</p>
          <iframe
            src={`${fileUrl}#toolbar=1`}
            title={wp.originalFilename ?? wp.title}
            className="h-[700px] w-full rounded-xl border border-slate-100"
          />
        </div>
      )}

      {/* Audio */}
      {isAudio && fileUrl && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Reproducir audio</p>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio controls src={fileUrl} className="w-full" />
        </div>
      )}

      {/* Video */}
      {isVideo && fileUrl && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Reproducir video</p>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video controls src={fileUrl} className="w-full rounded-xl" />
        </div>
      )}

      {/* Office — inline viewer (toggled) */}
      {isOffice && officeViewerUrl && showOfficeViewer && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Vista previa — Microsoft Office Online
            </p>
            <p className="text-[10px] text-slate-400">
              Si no carga, usa <strong>Abrir documento</strong> arriba
            </p>
          </div>
          <iframe
            src={officeViewerUrl}
            title={wp.originalFilename ?? wp.title}
            className="h-[750px] w-full rounded-xl border border-slate-100"
          />
        </div>
      )}

      {/* Office — hint when viewer is hidden */}
      {isOffice && !showOfficeViewer && fileUrl && (
        <div className="rounded-xl border border-orange-100 bg-orange-50 px-5 py-3.5 flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
            <FileText className="h-4 w-4 text-orange-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-orange-800">Documento {typeLabel}</p>
            <p className="text-xs text-orange-600 mt-0.5">
              Usa <strong>Abrir documento</strong> para abrirlo en el navegador, o activa <strong>Ver en Office Online</strong> para verlo aquí mismo.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── WpKind badge ─────────────────────────────────────────────────────────────

function WpKindBadge({ wpKind }: { wpKind: WpKind }) {
  const cfg = WP_KIND_CONFIG[wpKind] ?? WP_KIND_CONFIG.STANDARD;
  const icons: Record<WpKind, React.ElementType> = {
    STANDARD: FileText,
    SMART:    Brain,
    MASTER:   Star,
    LIVE:     Activity,
    FILE:     FileText,
  };
  const Icon = icons[wpKind] ?? FileText;

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

// ─── SyncStatus badge ─────────────────────────────────────────────────────────

function SyncStatusBadge({ syncStatus }: { syncStatus: WpSyncStatus }) {
  const cfg = SYNC_STATUS_CONFIG[syncStatus] ?? SYNC_STATUS_CONFIG.DRAFT;
  const isSpinning = syncStatus === 'REGENERATING';

  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
      {syncStatus === 'SYNCED'        && <CheckCircle2 className="w-3 h-3" />}
      {syncStatus === 'STALE'         && <AlertTriangle className="w-3 h-3" />}
      {syncStatus === 'REGENERATING'  && <RefreshCw className={`w-3 h-3 ${isSpinning ? 'animate-spin' : ''}`} />}
      {syncStatus === 'DRAFT'         && <Clock className="w-3 h-3" />}
      {cfg.label}
    </span>
  );
}

// ─── Live paper placeholder ───────────────────────────────────────────────────

function LivePaperView() {
  return (
    <div className="flex flex-col items-center py-20 gap-4 bg-white rounded-2xl border border-gray-200 shadow-sm text-center">
      <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center">
        <Activity className="w-8 h-8 text-emerald-400 animate-pulse" />
      </div>
      <div>
        <p className="text-base font-semibold text-gray-700 mb-1">Panel en tiempo real</p>
        <p className="text-sm text-gray-400 max-w-sm">
          Los papeles de trabajo VIVO muestran indicadores en tiempo real de la auditoría.
          Esta vista estará disponible en el Sprint 2.
        </p>
      </div>
    </div>
  );
}

// ─── F6.2 Sign-off panel ─────────────────────────────────────────────────────

function SignOffPanel({ paperId, wp }: { paperId: string; wp: WorkingPaper }) {
  const signOff = useSignOff(paperId);
  const isLocked = wp.status === 'SIGNED_OFF' || wp.status === 'CLOSED';

  async function handleSign(level: SignOffLevel) {
    try { await signOff.mutateAsync(level); } catch {}
  }

  const levels: Array<{
    level: SignOffLevel;
    label: string;
    name?: string | null;
    date?: string | null;
    color: string;
  }> = [
    { level: 'prepare',  label: 'Preparado por',    name: (wp as any).preparedBy?.name,   date: (wp as any).preparedAt,  color: 'blue' },
    { level: 'review',   label: 'Revisado por',     name: (wp as any).reviewedBy?.name,   date: (wp as any).reviewedAt,  color: 'indigo' },
    { level: 'signoff',  label: 'Firmado por (CAE)',name: (wp as any).signedOffBy?.name,  date: (wp as any).signedOffAt, color: 'emerald' },
  ];

  const colorMap: Record<string, string> = {
    blue:    'border-blue-200 bg-blue-50 text-blue-700',
    indigo:  'border-indigo-200 bg-indigo-50 text-indigo-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  };
  const btnMap: Record<string, string> = {
    blue:    'bg-blue-600 hover:bg-blue-700',
    indigo:  'bg-indigo-600 hover:bg-indigo-700',
    emerald: 'bg-emerald-600 hover:bg-emerald-700',
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Matriz de Firmas — Este Papel</p>
      <div className="grid grid-cols-3 gap-3">
        {levels.map(l => (
          <div key={l.level} className={`rounded-lg border p-3 ${colorMap[l.color]}`}>
            <p className="text-[10px] font-semibold uppercase tracking-wider opacity-70 mb-1">{l.label}</p>
            {l.name ? (
              <div>
                <p className="text-xs font-bold">{l.name}</p>
                {l.date && (
                  <p className="text-[10px] opacity-60 mt-0.5">
                    {new Date(l.date).toLocaleDateString('es', { day: '2-digit', month: 'short', year: '2-digit' })}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                <p className="text-[10px] opacity-50">Sin firma</p>
                {!isLocked && (
                  <button
                    onClick={() => handleSign(l.level)}
                    disabled={signOff.isPending}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold text-white ${btnMap[l.color]} disabled:opacity-50`}
                  >
                    {signOff.isPending ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <CheckCircle2 className="h-2.5 w-2.5" />}
                    Firmar
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── F6.3 PBC links panel ─────────────────────────────────────────────────────

const PBC_STATUS_COLORS: Record<string, string> = {
  PENDING:   'bg-yellow-100 text-yellow-700',
  SUBMITTED: 'bg-blue-100 text-blue-700',
  ACCEPTED:  'bg-emerald-100 text-emerald-700',
  REJECTED:  'bg-red-100 text-red-700',
  OVERDUE:   'bg-red-50 text-red-600',
};

const PBC_STATUS_LABELS: Record<string, string> = {
  PENDING:   'Pendiente',
  SUBMITTED: 'Enviado',
  ACCEPTED:  'Aceptado',
  REJECTED:  'Rechazado',
  OVERDUE:   'Vencido',
};

function PbcLinksPanel({ paperId }: { paperId: string }) {
  const { data, isLoading } = usePbcLinks(paperId);
  const linkPbc   = useLinkPbc(paperId);
  const unlinkPbc = useUnlinkPbc(paperId);
  const [showAvailable, setShowAvailable] = useState(false);

  if (isLoading) return null;
  if (!data) return null;

  const { linkedItems, availableItems } = data;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-violet-500" />
          <p className="text-xs font-semibold text-slate-700">Evidencias PBC Vinculadas</p>
          {linkedItems.length > 0 && (
            <span className="text-[10px] font-semibold bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">
              {linkedItems.length}
            </span>
          )}
        </div>
        {availableItems.length > 0 && (
          <button
            onClick={() => setShowAvailable(v => !v)}
            className="text-[11px] text-violet-600 hover:text-violet-800 font-medium"
          >
            {showAvailable ? 'Ocultar disponibles' : `+ Vincular (${availableItems.length})`}
          </button>
        )}
      </div>

      {linkedItems.length === 0 && !showAvailable && (
        <div className="py-6 text-center">
          <Link2 className="h-7 w-7 text-gray-200 mx-auto mb-1.5" />
          <p className="text-xs text-gray-400">No hay solicitudes PBC vinculadas</p>
          {availableItems.length > 0 && (
            <button
              onClick={() => setShowAvailable(true)}
              className="text-xs text-violet-600 hover:underline mt-1"
            >
              Vincular evidencia disponible
            </button>
          )}
        </div>
      )}

      {linkedItems.length > 0 && (
        <div className="divide-y divide-slate-50">
          {linkedItems.map(link => (
            <div key={link.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-700 truncate">{link.pbc.title}</p>
                <p className="text-[10px] text-slate-400 truncate">{link.pbc.requestedToEmail}</p>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${PBC_STATUS_COLORS[link.pbc.status] ?? 'bg-gray-100 text-gray-600'}`}>
                {PBC_STATUS_LABELS[link.pbc.status] ?? link.pbc.status}
              </span>
              <button
                onClick={() => unlinkPbc.mutateAsync(link.id)}
                disabled={unlinkPbc.isPending}
                className="text-slate-300 hover:text-red-400 transition-colors"
                title="Desvincular"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {showAvailable && availableItems.length > 0 && (
        <div className="border-t border-slate-100">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-2">
            Disponibles para vincular
          </p>
          <div className="divide-y divide-slate-50 max-h-48 overflow-y-auto">
            {availableItems.map(pbc => (
              <div key={pbc.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-violet-50/30">
                <Circle className="h-3.5 w-3.5 text-slate-200 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-700 truncate">{pbc.title}</p>
                  <p className="text-[10px] text-slate-400 truncate">{pbc.requestedToEmail}</p>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${PBC_STATUS_COLORS[pbc.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {PBC_STATUS_LABELS[pbc.status] ?? pbc.status}
                </span>
                <button
                  onClick={() => linkPbc.mutateAsync(pbc.id)}
                  disabled={linkPbc.isPending}
                  className="flex items-center gap-1 text-[10px] font-medium text-violet-600 hover:text-violet-800 disabled:opacity-50"
                >
                  <Plus className="h-3 w-3" />
                  Vincular
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab definitions ──────────────────────────────────────────────────────────

type TabKey = 'content' | 'sections' | 'graph' | 'review' | 'history' | 'file';

// ─── COSO IA → section mapping helpers ───────────────────────────────────────

const COSO_PRINCIPLE_NAMES: Record<number, string> = {
  1:  'Integridad y valores éticos',
  2:  'Independencia del órgano de supervisión',
  3:  'Estructura, autoridades y responsabilidades',
  4:  'Competencia del personal',
  5:  'Responsabilidad por el control',
  6:  'Objetivos específicos definidos',
  7:  'Identificación y análisis de riesgos',
  8:  'Evaluación del riesgo de fraude',
  9:  'Cambios significativos identificados',
  10: 'Selección y desarrollo de controles',
  11: 'Controles Generales de TI',
  12: 'Implementación mediante políticas y procedimientos',
  13: 'Información relevante y de calidad',
  14: 'Comunicación interna efectiva',
  15: 'Comunicación con terceros',
  16: 'Evaluaciones continuas e independientes',
  17: 'Comunicación oportuna de deficiencias',
};

const COSO_COMP_TO_SECTION: Record<string, string> = {
  CE: 'S1', RA: 'S2', CA: 'S3', IC: 'S4', MA: 'S5',
};

const COSO_MATURITY_LABEL: Record<string, string> = {
  EFFECTIVE:             'Efectivo',
  WITH_DEFICIENCIES:     'Con deficiencias',
  INEFFECTIVE:           'Inefectivo',
  INSUFFICIENT_EVIDENCE: 'Evidencia insuficiente',
};

function cosoToCompEval(m: string): string {
  if (m === 'EFFECTIVE')   return 'EFECTIVO';
  if (m === 'INEFFECTIVE') return 'DEBILIDAD_MATERIAL';
  return 'DEBILIDAD_SIGNIFICATIVA';
}
function cosoToS6(m: string): string {
  if (m === 'EFFECTIVE')   return 'EFECTIVO';
  if (m === 'INEFFECTIVE') return 'INEFECTIVO';
  return 'CON_DEBILIDADES_SIGNIFICATIVAS';
}
function cosoToS7(m: string): string {
  if (m === 'EFFECTIVE')   return 'ENFOQUE_CONTROLES';
  if (m === 'INEFFECTIVE') return 'ENFOQUE_SUSTANTIVO';
  return 'ENFOQUE_MIXTO';
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WpDetailPage() {
  const params = useParams<{ id: string }>();
  const { data: wp, isLoading } = useWorkingPaper(params.id);

  const updateWp       = useUpdateWorkingPaper(params.id);
  const updateStatus   = useUpdateWpStatus();
  const addTickMark    = useAddTickMark(params.id);
  const removeTickMark = useRemoveTickMark(params.id);
  const addComment     = useAddWpComment(params.id);
  const resolveComment = useResolveWpComment(params.id);
  const { data: versions } = useWpVersions(params.id);

  const [content, setContent]         = useState<Record<string, string>>({});
  const [documentEvidence, setDocumentEvidence] = useState<DocumentEvidenceRow[]>([]);
  const [conclusion, setConclusion]   = useState('');
  const [dirty, setDirty]             = useState(false);
  const [activeTab, setActiveTab]     = useState<TabKey>('content');
  const [commentText, setComment]     = useState('');
  const [reviewNotes, setRvNotes]     = useState('');
  const [showScriptorium, setScripto]    = useState(false);
  const [showAgentPanel,  setAgentPanel] = useState(false);
  const [reviewAlert,     setReviewAlert] = useState(false);
  const [agentAutoMsg,    setAgentAutoMsg] = useState('');
  const [checkoutBanner,  setCheckoutBanner] = useState<string | null>(null);
  const [showSampling,    setShowSampling]    = useState(false);
  const [downloadingPdf,  setDownloadingPdf]  = useState(false);
  const [showCoso,        setShowCoso]        = useState(false);
  const updateSection = useUpdateSection();

  // Initialize content from server data — use useEffect to avoid setState-during-render
  const [initialized, setInit] = useState(false);
  useEffect(() => {
    if (wp && !initialized) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fullContent = (wp.content ?? {}) as Record<string, any>;
      const { documentEvidence: de, ...textContent } = fullContent;
      setContent(textContent as Record<string, string>);
      const rows = Array.isArray(de) ? (de as DocumentEvidenceRow[]) : [];
      setDocumentEvidence(rows.map(r => ({ ...r, attachments: Array.isArray(r.attachments) ? r.attachments : [] })));
      setConclusion(wp.conclusion ?? '');
      setInit(true);
    }
  }, [wp, initialized]);

  // F6.6 — Auto-checkout on mount, auto-checkin on unmount
  const checkout = useCheckout(params.id);
  const checkin  = useCheckin(params.id);
  useEffect(() => {
    if (!wp) return;
    const locked = wp.status === 'SIGNED_OFF' || wp.status === 'CLOSED' || wp.status === 'ARCHIVED';
    if (locked) return; // no checkout needed for read-only papers
    checkout.mutateAsync().then(result => {
      if (!result.success && result.lockedBy) {
        const exp = result.expiresAt ? ` (expira ${new Date(result.expiresAt).toLocaleTimeString()})` : '';
        setCheckoutBanner(`${result.lockedBy} tiene este papel abierto para edición${exp}.`);
      }
    }).catch(() => {/* ignore checkout errors silently */});
    return () => {
      checkin.mutate();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, wp?.status]);

  const setField = useCallback((key: string) => (value: string) => {
    setContent(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  }, []);

  const setConclusionField = useCallback((v: string) => {
    setConclusion(v);
    setDirty(true);
  }, []);

  const handleSave = async () => {
    try {
      await updateWp.mutateAsync({ content: { ...content, documentEvidence }, conclusion });
      setDirty(false);
    } catch (e) {
      alert('Error al guardar: ' + (e as Error).message);
    }
  };

  async function handleDownloadPdf() {
    setDownloadingPdf(true);
    try {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? '';
      const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
      const res = await fetch(`${base}/working-papers/${params.id}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('No se pudo generar el PDF del papel');
      const blob = await res.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `auditmind_papel_${(wp?.paperCode ?? wp?.code ?? params.id)}.pdf`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setDownloadingPdf(false);
    }
  }

  const handleStatusChange = async (next: WpStatus) => {
    if (!wp) return;
    await updateStatus.mutateAsync({ id: params.id, status: next, reviewNotes: reviewNotes || undefined });
    setRvNotes('');

    // Level-3: proactive agent review suggestion after DRAFT → IN_REVIEW
    if (next === 'IN_REVIEW') {
      const code  = wp.paperCode ?? wp.code;
      const audit = (wp.audit as any)?.title ?? 'la auditoría';
      const reviewPrompts: Record<string, string> = {
        PLANNING_UNDERSTANDING:
          `Revisa el papel ${code} de ${audit}. Identifica: (1) gaps en el entendimiento del negocio, (2) riesgos significativos no cubiertos en el alcance, (3) si la materialidad y los riesgos están correctamente documentados según NIA 315. Sé específico sobre qué falta.`,
        CONTROL_EVALUATION:
          `Revisa la evaluación de controles internos ${code} de ${audit}. Verifica: (1) si las pruebas de controles son suficientes para cada riesgo, (2) si las deficiencias están documentadas según COSO 2013, (3) si el impacto de las debilidades en el riesgo de detección es correcto.`,
        SUBSTANTIVE_TEST:
          `Revisa las pruebas sustantivas ${code} de ${audit}. Evalúa: (1) si el tamaño muestral es suficiente según NIA 530, (2) si la evidencia obtenida soporta las conclusiones, (3) si hay excepciones sin documentar o sin respuesta.`,
        DATA_ANALYSIS:
          `Revisa el análisis de datos ${code} de ${audit}. Evalúa: (1) si las conclusiones están respaldadas por los resultados CAAT, (2) si las anomalías tienen seguimiento adecuado, (3) si las limitaciones del análisis están documentadas.`,
        FINDING:
          `Revisa los hallazgos en ${code} de ${audit}. Para cada hallazgo verifica: (1) estructura C-C-C-E-R-R completa, (2) impacto correctamente cuantificado, (3) recomendaciones específicas y medibles. Mejora la redacción ejecutiva donde sea necesario.`,
        CLOSURE_CONCLUSION:
          `Revisa el papel de cierre ${code} de ${audit}. Verifica: (1) si la conclusión es consistente con los hallazgos, (2) si la opinión propuesta está justificada según NIAs, (3) si las limitaciones del alcance están documentadas correctamente.`,
        INTERVIEW:
          `Revisa la documentación de entrevistas ${code} de ${audit}. Evalúa: (1) si las respuestas están con suficiente detalle, (2) si hay inconsistencias que requieren seguimiento, (3) si las conclusiones están vinculadas a los hallazgos de la auditoría.`,
        CONFIRMATION:
          `Revisa las confirmaciones externas ${code} de ${audit}. Verifica: (1) si el proceso siguió NIA 505, (2) si las diferencias están documentadas, (3) si los procedimientos alternativos para confirmaciones no recibidas son suficientes.`,
        NORMATIVE_ANALYSIS:
          `Revisa el análisis normativo ${code} de ${audit}. Evalúa: (1) si todos los requisitos regulatorios relevantes están cubiertos, (2) si los incumplimientos tienen evidencia suficiente, (3) si las implicaciones legales están correctamente evaluadas.`,
      };
      const prompt = reviewPrompts[wp.type]
        ?? `Revisa el contenido del papel ${code} de ${audit}. Identifica gaps, inconsistencias y oportunidades de mejora en la documentación.`;

      setAgentAutoMsg(prompt);
      setReviewAlert(true);
    }
  };

  const handleAddTickMark = async (fieldPath: string, tickMark: TickMarkKey, note?: string) => {
    await addTickMark.mutateAsync({ fieldPath, tickMark, note });
  };

  const handleAddComment = async () => {
    if (!commentText.trim()) return;
    await addComment.mutateAsync(commentText.trim());
    setComment('');
  };

  if (isLoading || !wp) {
    return (
      <div className="flex flex-col h-full">
        <Header breadcrumbs={[{ label: 'Papeles de Trabajo', href: '/dashboard/working-papers' }, { label: '...' }]} />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const wpKind     = (wp.wpKind     ?? 'STANDARD') as WpKind;
  const syncStatus = (wp.syncStatus ?? 'DRAFT')    as WpSyncStatus;

  const st         = WP_STATUS_CONFIG[wp.status] ?? WP_STATUS_CONFIG.IN_PROGRESS;
  const typeConf   = WP_TYPE_CONFIG[wp.type];
  const nextStatus = STATUS_TRANSITIONS[wp.status] ?? null;
  const StatusIcon = STATUS_ICONS[wp.status] ?? Clock;
  const tickEntries = wp.tickEntries ?? [];
  const comments    = wp.comments ?? [];
  const findings    = wp.findings ?? [];
  const openComments = comments.filter(c => !c.resolved);

  // Build AI draft context for SMART paper sections
  const agentMeta = PAPER_AGENT_MAP[wp.type] ?? DEFAULT_AGENT;
  const aiDraftConfig: AiDraftConfig = {
    agentId:     agentMeta.agentId,
    agentName:   agentMeta.agentName,
    agentColor:  agentMeta.agentColor,
    paperContext: {
      auditTitle:  (wp.audit as any)?.title  ?? '',
      auditType:   (wp.audit as any)?.type   ?? '',
      auditScope:  (wp.audit as any)?.scope  ?? '',
      riskLevel:   (wp.audit as any)?.riskLevel ?? '',
      paperCode:   wp.paperCode ?? wp.code,
      paperTitle:  wp.title,
      paperType:   wp.type,
    },
  };

  // F6.4 Lockdown — paper cannot be edited when SIGNED_OFF, CLOSED or ARCHIVED
  const isLocked = wp.status === 'SIGNED_OFF' || wp.status === 'CLOSED' || wp.status === 'ARCHIVED';

  // Determine which tabs to show
  const isFilePaper     = wpKind === 'FILE';
  const showSectionsTab = wpKind === 'SMART';
  const showGraphTab    = wpKind === 'SMART' || wpKind === 'MASTER';

  const allTabs: { key: TabKey; label: string; icon: React.ElementType; show: boolean }[] = [
    { key: 'file'     as TabKey, label: 'Documento',   icon: Download,       show: isFilePaper },
    { key: 'content'  as TabKey, label: 'Contenido',   icon: FileText,       show: !isFilePaper && wpKind !== 'MASTER' && wpKind !== 'LIVE' && wpKind !== 'SMART' },
    { key: 'sections' as TabKey, label: 'Secciones',   icon: Brain,          show: showSectionsTab },
    { key: 'graph'    as TabKey, label: 'Grafo',        icon: Network,        show: showGraphTab },
    { key: 'review'   as TabKey, label: `Revisión${openComments.length ? ` (${openComments.length})` : ''}`, icon: MessageSquare, show: true },
    { key: 'history'  as TabKey, label: 'Historial',   icon: History,        show: true },
  ];
  const tabs = allTabs.filter(t => t.show);

  // For MASTER / LIVE, default tab should not be 'content' if it isn't visible
  const visibleTabKeys = tabs.map(t => t.key);
  const effectiveTab: TabKey = visibleTabKeys.includes(activeTab) ? activeTab : (visibleTabKeys[0] ?? 'content');

  return (
    <div className="flex flex-col h-full">
      <Header
        breadcrumbs={[
          { label: 'Auditorías', href: '/dashboard/audits' },
          ...(wp.audit ? [{ label: wp.audit.title, href: `/dashboard/audits/${wp.auditId}?tab=expediente` }] : []),
          { label: wp.ref ?? wp.paperCode ?? wp.code },
        ]}
      />

      <div className="flex flex-1 overflow-hidden">
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto space-y-4">

          {/* ── Paper header — encabezado estándar de auditoría ── */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Franja superior: auditoría + ruta */}
            <div className="bg-[#0F2D4A] px-5 py-2.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0 text-xs text-blue-200">
                <FileText className="h-3.5 w-3.5 shrink-0 text-blue-300" />
                <span className="font-semibold text-white truncate">{wp.audit?.title ?? '—'}</span>
                {wp.folder && (
                  <>
                    <ChevronRight className="h-3 w-3 shrink-0 text-blue-400" />
                    <Folder className="h-3 w-3 shrink-0 text-amber-300" />
                    <span className="truncate text-blue-200">
                      <span className="font-mono">{wp.folder.ref}</span>
                      {' — '}{wp.folder.name}
                    </span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <PaperAgentButton
                  type={wp.type}
                  onClick={() => setAgentPanel(p => !p)}
                  active={showAgentPanel}
                />
                {(wp.status === 'DRAFT' || wp.status === 'IN_PROGRESS') && wpKind === 'STANDARD' && !isFilePaper && (
                  <button
                    onClick={() => setScripto(true)}
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-violet-600 text-white text-xs font-medium rounded-lg hover:bg-violet-700"
                  >
                    <Sparkles className="w-3 h-3" />
                    Borrador IA
                  </button>
                )}
                {dirty && !isLocked && (
                  <button
                    onClick={handleSave}
                    disabled={updateWp.isPending}
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-500 text-white text-xs font-medium rounded-lg hover:bg-blue-400 disabled:opacity-60"
                  >
                    <Save className="w-3 h-3" />
                    {updateWp.isPending ? 'Guardando…' : 'Guardar'}
                  </button>
                )}
                {isLocked && (
                  <span className="flex items-center gap-1 text-[10px] text-slate-400 bg-slate-100 px-2 py-1 rounded-lg">
                    <Lock className="w-2.5 h-2.5" /> Bloqueado
                  </span>
                )}
              </div>
            </div>

            {/* Cuerpo del encabezado */}
            <div className="p-5">
              {/* Ref + badges */}
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-lg text-sm">
                  {wp.ref ?? wp.paperCode ?? wp.code}
                </span>
                <span className={`text-xs font-medium ${typeConf.color}`}>{typeConf.label}</span>
                <WpKindBadge wpKind={wpKind} />
                {(wpKind === 'SMART' || wpKind === 'MASTER') && (
                  <SyncStatusBadge syncStatus={syncStatus} />
                )}
                {wp.aiAssisted && (
                  <span className="flex items-center gap-1 text-[10px] text-purple-600 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full">
                    <Bot className="w-2.5 h-2.5" /> IA
                  </span>
                )}
              </div>

              {/* Título */}
              <h1 className="text-lg font-bold text-gray-900 mb-3">{wp.title}</h1>

              {/* Grid de metadatos */}
              <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs sm:grid-cols-4">
                <div>
                  <p className="text-gray-400 font-medium uppercase tracking-wide text-[10px]">Elaborado por</p>
                  <p className="text-gray-700 font-medium flex items-center gap-1 mt-0.5">
                    <User className="h-3 w-3 text-gray-400" />
                    {wp.preparedBy?.name ?? '—'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400 font-medium uppercase tracking-wide text-[10px]">Revisado por</p>
                  <p className="text-gray-700 font-medium flex items-center gap-1 mt-0.5">
                    <User className="h-3 w-3 text-gray-400" />
                    {wp.reviewedBy?.name ?? 'Sin asignar'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400 font-medium uppercase tracking-wide text-[10px]">Período auditado</p>
                  <p className="text-gray-700 font-medium flex items-center gap-1 mt-0.5">
                    <Calendar className="h-3 w-3 text-gray-400" />
                    {wp.periodStart
                      ? `${formatDate(wp.periodStart)} — ${formatDate(wp.periodEnd ?? wp.periodStart)}`
                      : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400 font-medium uppercase tracking-wide text-[10px]">Versión</p>
                  <p className="text-gray-700 font-medium mt-0.5">
                    v{wp.version} · {formatRelativeTime(wp.updatedAt)}
                  </p>
                </div>
              </div>

              {/* Pipeline de estados */}
              <div className="mt-4 flex items-center gap-1 flex-wrap">
                {WP_STATUS_FLOW.map((s, i) => {
                  const sCfg = WP_STATUS_CONFIG[s];
                  const isActive  = wp.status === s;
                  const isPast    = WP_STATUS_FLOW.indexOf(wp.status as WpStatus) > i;
                  const isLegacy  = !WP_STATUS_FLOW.includes(wp.status as WpStatus);
                  return (
                    <div key={s} className="flex items-center gap-1">
                      <span className={[
                        'text-[11px] font-medium px-2 py-0.5 rounded-full border transition-all',
                        isActive ? `${sCfg.bg} ${sCfg.color} ${sCfg.border} ring-2 ring-offset-1 ring-current` :
                        isPast   ? 'bg-emerald-50 text-emerald-600 border-emerald-200 opacity-70' :
                                   'bg-gray-50 text-gray-400 border-gray-200 opacity-50',
                      ].join(' ')}>
                        {isActive && '● '}{sCfg.label}
                      </span>
                      {i < WP_STATUS_FLOW.length - 1 && (
                        <ChevronRight className="h-3 w-3 text-gray-300 shrink-0" />
                      )}
                    </div>
                  );
                })}
                {/* Mostrar estado legacy si no está en el nuevo flujo */}
                {!WP_STATUS_FLOW.includes(wp.status as WpStatus) && (
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${st.bg} ${st.color}`}>
                    ● {st.label}
                  </span>
                )}
              </div>
            </div>

            {/* F6.4 Lockdown banner */}
            {(wp.status === 'SIGNED_OFF' || wp.status === 'CLOSED') && (
              <div className="mx-5 mb-4 flex items-center gap-2.5 rounded-xl bg-slate-50 border border-slate-200 px-4 py-2.5">
                <Lock className="h-4 w-4 text-slate-500 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-700">
                    Papel bloqueado — {wp.status === 'SIGNED_OFF' ? 'Firmado' : 'Cerrado'}
                  </p>
                  <p className="text-xs text-slate-400">
                    Este papel no puede modificarse.
                    {(wp as any).retentionUntil && (
                      <> Retención hasta: <strong>{formatDate((wp as any).retentionUntil)}</strong>.</>
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* F6.6 Checkout banner — paper open by another user */}
            {checkoutBanner && (
              <div className="mx-5 mb-4 flex items-center gap-2.5 rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5">
                <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-800">Papel en uso por otro usuario</p>
                  <p className="text-xs text-amber-600">{checkoutBanner} Tus cambios podrían generar conflictos.</p>
                </div>
                <button
                  onClick={() => setCheckoutBanner(null)}
                  className="text-amber-400 hover:text-amber-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Acciones de estado */}
            <div className="border-t border-gray-100 px-5 py-3 flex items-center gap-2 flex-wrap bg-gray-50/50">
              {wp.auditId && (
                <Link
                  href={`/dashboard/audits/${wp.auditId}?tab=expediente`}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Volver al Índice
                </Link>
              )}
              {/* PI.7a — Calculadora de muestreo NIA 530 */}
              <button
                onClick={() => setShowSampling(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-violet-200 bg-violet-50 text-violet-700 text-xs font-medium rounded-lg hover:bg-violet-100 transition-colors"
                title="Calcular tamaño de muestra (NIA 530)"
              >
                <Calculator className="w-3.5 h-3.5" />
                Muestreo
              </button>
              {/* PI.7c — Evaluación COSO 2013 asistida por IA */}
              <button
                onClick={() => setShowCoso(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-violet-200 bg-violet-50 text-violet-700 text-xs font-medium rounded-lg hover:bg-violet-100 transition-colors"
                title="Evaluación COSO 2013 asistida por IA"
              >
                <Sparkles className="w-3.5 h-3.5" />
                COSO IA
              </button>
              {/* Fase 2 — Descargar PDF del papel */}
              <button
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 bg-slate-50 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50"
                title="Descargar este papel en PDF profesional"
              >
                {downloadingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                PDF
              </button>
              {nextStatus && (
                <button
                  onClick={() => handleStatusChange(nextStatus)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0F2D4A] text-white text-xs font-medium rounded-lg hover:bg-[#1a4a7a]"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {STATUS_ACTIONS[wp.status] ?? 'Avanzar estado'}
                </button>
              )}
              {STATUS_RETURN[wp.status] && (
                <button
                  onClick={() => handleStatusChange(STATUS_RETURN[wp.status]!)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-red-200 text-red-700 text-xs font-medium rounded-lg hover:bg-red-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  {STATUS_RETURN_LABEL[wp.status] ?? 'Devolver'}
                </button>
              )}
              <span className="ml-auto text-xs text-gray-400">
                {wp.qualityScore != null ? `Calidad: ${wp.qualityScore}/100` : ''}
              </span>
            </div>
          </div>

          {/* ── Level-3: Proactive review alert ── */}
          {reviewAlert && (
            <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
              <CheckCircle2 className="w-5 h-5 text-blue-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-blue-800">Papel enviado a revisión</p>
                <p className="text-xs text-blue-600">
                  ¿Quieres que{' '}
                  <span className="font-semibold">{agentMeta.agentName}</span>{' '}
                  revise el contenido y detecte gaps antes de aprobar?
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {(wpKind === 'SMART' || wpKind === 'MASTER') && (
                  <button
                    onClick={() => { setActiveTab('review'); setReviewAlert(false); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors"
                  >
                    <Star className="w-3.5 h-3.5" /> Quality Gate
                  </button>
                )}
                <button
                  onClick={() => {
                    setAgentPanel(true);
                    setReviewAlert(false);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#0F2D4A] rounded-lg hover:bg-[#1a4a7a] transition-colors"
                >
                  <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white ${agentMeta.agentColor}`}>
                    {agentMeta.agentName.charAt(0)}
                  </div>
                  Revisar con {agentMeta.agentName}
                </button>
                <button
                  onClick={() => setReviewAlert(false)}
                  className="p-1 rounded hover:bg-blue-200 text-blue-400 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ── Tabs ── */}
          <div className="flex border-b border-gray-200 gap-1 overflow-x-auto">
            {tabs.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  effectiveTab === key
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>

          {/* ── FILE paper view ── */}
          {isFilePaper && effectiveTab === 'file' && (
            <FilePaperView wp={wp} />
          )}

          {/* ── MASTER paper view ── */}
          {wpKind === 'MASTER' && (
            <MasterPaperView
              paperId={params.id}
              syncStatus={syncStatus}
              narrative={wp.narrative}
              sections={wp.sections}
              lastSyncedAt={wp.lastSyncedAt}
              paperCode={wp.paperCode}
              auditId={wp.auditId}
            />
          )}

          {/* ── LIVE paper view ── */}
          {wpKind === 'LIVE' && effectiveTab !== 'review' && effectiveTab !== 'history' && (
            <LivePaperDashboard paperId={params.id} />
          )}

          {/* ── Tab: Contenido (STANDARD / SMART only) ── */}
          {effectiveTab === 'content' && wpKind !== 'MASTER' && wpKind !== 'LIVE' && (
            <div className="grid grid-cols-3 gap-4">

              {/* Left: Editor */}
              <div className="col-span-2 space-y-4">
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-5 divide-y divide-gray-100">
                  <ContentSection
                    label="Objetivo"
                    value={content.objective ?? ''}
                    onChange={setField('objective')}
                    placeholder="Describe el objetivo de este papel de trabajo..."
                    rows={3}
                  />
                  <ContentSection
                    label="Alcance"
                    value={content.scope ?? ''}
                    onChange={setField('scope')}
                    placeholder="Define el alcance y las limitaciones..."
                    rows={2}
                  />
                  <ContentSection
                    label="Procedimientos aplicados"
                    value={content.procedures ?? ''}
                    onChange={setField('procedures')}
                    placeholder="Describe los procedimientos de auditoría realizados..."
                    rows={5}
                  />
                  <ContentSection
                    label="Evidencia obtenida"
                    value={content.evidence ?? ''}
                    onChange={setField('evidence')}
                    placeholder="Documenta la evidencia recopilada y sus fuentes..."
                    rows={4}
                  />
                  <ContentSection
                    label="Observaciones"
                    value={content.observations ?? ''}
                    onChange={setField('observations')}
                    placeholder="Observaciones y excepciones identificadas..."
                    rows={3}
                  />
                </div>

                {/* Conclusión */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Conclusión</p>
                  <textarea
                    rows={3}
                    value={conclusion}
                    onChange={e => setConclusionField(e.target.value)}
                    placeholder="Escribe la conclusión del procedimiento de auditoría..."
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                  />
                </div>

                {/* Tick marks */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm font-semibold text-gray-700">Marcas de auditoría</p>
                    <p className="text-xs text-gray-400">Leyenda de símbolos usados en este papel</p>
                  </div>

                  {tickEntries.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-100">
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Ítem</th>
                            <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase w-14">Marca</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Nota</th>
                            <th className="w-8" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {tickEntries.map(entry => (
                            <TickMarkRow
                              key={entry.id}
                              entry={entry}
                              onRemove={() => removeTickMark.mutateAsync(entry.id)}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="py-6 text-center">
                      <p className="text-sm text-gray-400">No hay marcas de auditoría aún</p>
                      <p className="text-xs text-gray-300 mt-1">Las marcas documentan la verificación de cada ítem</p>
                    </div>
                  )}

                  <AddTickMarkForm
                    onAdd={handleAddTickMark}
                    disabled={addTickMark.isPending || wp.status === 'ARCHIVED'}
                  />
                </div>

                {/* Documentos y Evidencias Recibidos */}
                <DocumentEvidencePanel
                  paperId={params.id}
                  rows={documentEvidence}
                  onChange={newRows => { setDocumentEvidence(newRows); setDirty(true); }}
                  readOnly={wp.status === 'SIGNED_OFF' || wp.status === 'CLOSED' || wp.status === 'ARCHIVED'}
                />
              </div>

              {/* Right: Sidebar */}
              <div className="col-span-1 space-y-4">
                {/* Metadata */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-3">
                  <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Información</p>
                  <div className="space-y-2 text-xs">
                    {[
                      { label: 'Elaborado por', value: wp.preparedBy?.name ?? '—' },
                      { label: 'Revisado por',  value: wp.reviewedBy?.name  ?? 'Sin asignar' },
                      { label: 'Versión',       value: `v${wp.version}` },
                      { label: 'Creado',        value: formatDate(wp.createdAt) },
                      { label: 'Actualizado',   value: formatDate(wp.updatedAt) },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex justify-between">
                        <span className="text-gray-500">{label}</span>
                        <span className="text-gray-700 font-medium text-right">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Workflow — acciones de estado movidas al encabezado del papel */}

                {/* Linked findings */}
                {findings.length > 0 && (
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
                    <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-3">Hallazgos vinculados</p>
                    <ul className="space-y-2">
                      {findings.map(f => (
                        <li key={f.id} className="text-xs">
                          <a href={`/dashboard/findings/${f.id}`} className="text-blue-600 hover:underline line-clamp-2">
                            {f.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Cross-references */}
                {wp.crossReferences.length > 0 && (
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
                    <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                      <Link2 className="w-3.5 h-3.5 inline mr-1" />
                      Referencias cruzadas
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {(wp.crossReferences as string[]).map((ref, i) => (
                        <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs font-mono rounded-lg">
                          {ref}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tick mark legend */}
                {tickEntries.length > 0 && (
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
                    <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-3">Leyenda de marcas</p>
                    <div className="space-y-1.5">
                      {[...new Set(tickEntries.map(e => e.tickMark))].map(mark => {
                        const cfg = TICK_MARK_CONFIG[mark as TickMarkKey];
                        return (
                          <div key={mark} className="flex items-center gap-2 text-xs">
                            <span className={`font-mono font-bold w-6 text-center ${cfg.color}`}>{cfg.symbol}</span>
                            <span className="text-gray-600">{cfg.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Tab: Secciones (SMART) ── */}
          {effectiveTab === 'sections' && wpKind === 'SMART' && (
            <div className="space-y-4">
              <SmartPaperSections
                paperId={params.id}
                auditId={wp.auditId}
                paperCode={wp.paperCode}
                readonly={wp.status === 'APPROVED'}
                aiDraftConfig={wp.status !== 'APPROVED' ? aiDraftConfig : undefined}
              />
              <PaperProceduresPanel
                paperId={params.id}
                auditId={wp.auditId}
                paperTitle={wp.title}
                paperType={wp.type}
                paperCode={wp.paperCode}
                procedures={(wp.content as { procedures?: AppliedProcedure[] })?.procedures ?? []}
                readonly={wp.status === 'APPROVED'}
              />
              <CrossAuditSuggestions auditId={wp.auditId} paperId={params.id} />
            </div>
          )}

          {/* ── Tab: Grafo ── */}
          {effectiveTab === 'graph' && (
            <PaperGraphPanel paperId={params.id} />
          )}

          {/* ── Tab: Revisión ── */}
          {effectiveTab === 'review' && (
            <div className="max-w-2xl space-y-4">

              {/* F6.2 Sign-off panel */}
              <SignOffPanel paperId={params.id} wp={wp} />

              {/* F6.3 PBC links panel */}
              <PbcLinksPanel paperId={params.id} />

              {/* Semantic quality gate — SMART and MASTER papers only */}
              {(wpKind === 'SMART' || wpKind === 'MASTER') && (
                <QualityGatePanel
                  paperId={params.id}
                  existingScore={wp.qualityScore}
                  existingReport={(wp as { qualityReport?: import('@/hooks/useWorkingPaperGraph').QualityCheckResult }).qualityReport ?? null}
                />
              )}

              {comments.length === 0 && (
                <div className="py-12 text-center bg-white rounded-2xl border border-gray-200">
                  <MessageSquare className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                  <p className="text-sm text-gray-400">No hay comentarios de revisión</p>
                  <p className="text-xs text-gray-300 mt-1">Los comentarios del revisor aparecerán aquí</p>
                </div>
              )}

              {comments.map(comment => (
                <div
                  key={comment.id}
                  className={`bg-white rounded-xl border p-4 ${
                    comment.resolved ? 'border-gray-200 opacity-60' : 'border-amber-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="text-sm text-gray-800 leading-relaxed">{comment.content}</p>
                      <p className="text-[10px] text-gray-400 mt-1.5">{formatRelativeTime(comment.createdAt)}</p>
                    </div>
                    {!comment.resolved && (
                      <button
                        onClick={() => resolveComment.mutateAsync(comment.id)}
                        className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium shrink-0 mt-0.5"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Resolver
                      </button>
                    )}
                    {comment.resolved && (
                      <span className="text-xs text-gray-400 shrink-0">Resuelto</span>
                    )}
                  </div>
                </div>
              ))}

              <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                <p className="text-xs font-medium text-gray-600">Agregar comentario de revisión</p>
                <textarea
                  rows={3}
                  value={commentText}
                  onChange={e => setComment(e.target.value)}
                  placeholder="Escribe una nota o solicitud de corrección para el auditor..."
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
                <button
                  onClick={handleAddComment}
                  disabled={!commentText.trim() || addComment.isPending}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-40"
                >
                  Agregar comentario
                </button>
              </div>
            </div>
          )}

          {/* ── Tab: Historial — PI.5 con diff + restore ── */}
          {effectiveTab === 'history' && (
            <VersionHistoryPanel paperId={params.id as string} />
          )}

        </div>
      </div>

      {/* ── Agent Panel (side panel, slides in when active) ── */}
      {showAgentPanel && (
        <PaperAgentPanel
          wp={wp}
          onClose={() => { setAgentPanel(false); setAgentAutoMsg(''); }}
          autoMessage={agentAutoMsg || undefined}
        />
      )}
      </div>{/* flex row wrapper */}

      {/* ── Scriptorium Draft Modal ── */}
      {showScriptorium && (
        <ScriptoriumDraftModal
          wp={wp}
          onClose={() => setScripto(false)}
          onApply={(newContent, newConclusion) => {
            setContent(prev => ({ ...prev, ...newContent }));
            setConclusion(newConclusion);
            setDirty(true);
          }}
        />
      )}

      {/* ── PI.7a Sampling Calculator Modal ── */}
      <SamplingCalculatorModal
        open={showSampling}
        onClose={() => setShowSampling(false)}
        onInsert={(text) => {
          // Append the sampling result to the paper conclusion
          setConclusion(prev => prev ? `${prev}\n\n${text}` : text);
          setDirty(true);
        }}
      />

      {/* ── PI.7c COSO Assessment Panel ── */}
      {showCoso && (
        <CosoAssessmentPanel
          paperId={params.id as string}
          onClose={() => setShowCoso(false)}
          onInsert={(assessment: CosoAssessment) => {
            if (wp?.paperCode === 'PT-COSO') {
              // Populate the 13 structured PT-COSO sections from the AI assessment
              const pid = params.id as string;
              const updates: Promise<unknown>[] = [];
              for (const comp of assessment.components) {
                const s = COSO_COMP_TO_SECTION[comp.key];
                if (!s) continue;
                const compPrinciples = assessment.principles.filter(p => p.componentKey === comp.key);
                const matrixRows = compPrinciples.map(p => ({
                  'Principio':     `P${p.id} — ${COSO_PRINCIPLE_NAMES[p.id] ?? ''}`,
                  'Estado':        COSO_MATURITY_LABEL[p.status] ?? p.status,
                  'Evidencia':     p.evidenceRef,
                  'Justificación': p.justification,
                }));
                updates.push(updateSection.mutateAsync({ paperId: pid, sectionKey: s,           value: matrixRows }));
                updates.push(updateSection.mutateAsync({ paperId: pid, sectionKey: `${s}_EVAL`, value: cosoToCompEval(comp.maturity) }));
              }
              updates.push(updateSection.mutateAsync({ paperId: pid, sectionKey: 'S6', value: cosoToS6(assessment.overallMaturity) }));
              updates.push(updateSection.mutateAsync({ paperId: pid, sectionKey: 'S7', value: cosoToS7(assessment.overallMaturity) }));
              const defText = assessment.components
                .flatMap(c => c.deficiencies.map(d => `[${c.key}] ${d}`))
                .join('\n');
              updates.push(updateSection.mutateAsync({ paperId: pid, sectionKey: 'S8', value: defText || '(Sin deficiencias identificadas)' }));
              const conclusionText = [
                assessment.executiveSummary,
                '',
                'Próximos pasos recomendados:',
                ...assessment.nextSteps.map((step, i) => `${i + 1}. ${step}`),
              ].join('\n');
              updates.push(updateSection.mutateAsync({ paperId: pid, sectionKey: 'S9', value: conclusionText }));
              Promise.all(updates).catch(e => alert('Error al guardar secciones COSO: ' + (e as Error).message));
            } else {
              // Standard (non-SMART) paper: append formatted text to the conclusion field
              const text = assessmentToText(assessment);
              setConclusion(prev => prev ? `${prev}\n\n${text}` : text);
              setDirty(true);
            }
          }}
        />
      )}
    </div>
  );
}
