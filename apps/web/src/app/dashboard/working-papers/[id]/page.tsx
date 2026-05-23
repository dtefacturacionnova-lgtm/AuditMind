'use client';

import { useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import {
  Bot, CheckCircle2, Clock, AlertCircle, Lock, Plus, Trash2,
  MessageSquare, History, FileText, Network,
  Link2, Save, Sparkles, Loader2, X, Wand2,
  Brain, Star, Activity, AlertTriangle, RefreshCw,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import {
  useWorkingPaper, useUpdateWorkingPaper, useUpdateWpStatus,
  useAddTickMark, useRemoveTickMark, useAddWpComment, useResolveWpComment,
  useWpVersions,
  WP_STATUS_CONFIG, WP_TYPE_CONFIG, TICK_MARK_CONFIG,
  WP_KIND_CONFIG, SYNC_STATUS_CONFIG,
  type WpStatus, type TickMarkKey, type WpKind, type WpSyncStatus,
} from '@/hooks/useWorkingPapers';
import { SmartPaperSections }     from '@/components/working-papers/SmartPaperSections';
import { MasterPaperView }         from '@/components/working-papers/MasterPaperView';
import { PaperGraphPanel }         from '@/components/working-papers/PaperGraphPanel';
import { QualityGatePanel }        from '@/components/working-papers/QualityGatePanel';
import { LivePaperDashboard }      from '@/components/working-papers/LivePaperDashboard';
import { CrossAuditSuggestions }   from '@/components/working-papers/CrossAuditSuggestions';
import { PaperAgentPanel, PaperAgentButton, PAPER_AGENT_MAP, DEFAULT_AGENT } from '@/components/working-papers/PaperAgentPanel';
import type { AiDraftConfig } from '@/components/working-papers/SectionField';
import { apiClient }            from '@/lib/api-client';
import { formatDate, formatRelativeTime } from '@/lib/utils';
import type { WorkingPaper, TickMarkEntry } from '@/hooks/useWorkingPapers';

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

const STATUS_TRANSITIONS: Record<WpStatus, WpStatus | null> = {
  DRAFT:     'IN_REVIEW',
  IN_REVIEW: 'APPROVED',
  APPROVED:  'ARCHIVED',
  ARCHIVED:  null,
};

const STATUS_ACTIONS: Partial<Record<WpStatus, string>> = {
  DRAFT:     'Enviar a revisión',
  IN_REVIEW: 'Aprobar',
  APPROVED:  'Archivar (finalizar)',
};

const STATUS_ICONS: Record<WpStatus, React.ElementType> = {
  DRAFT:     Clock,
  IN_REVIEW: AlertCircle,
  APPROVED:  CheckCircle2,
  ARCHIVED:  Lock,
};

// ─── WpKind badge ─────────────────────────────────────────────────────────────

function WpKindBadge({ wpKind }: { wpKind: WpKind }) {
  const cfg = WP_KIND_CONFIG[wpKind] ?? WP_KIND_CONFIG.STANDARD;
  const icons: Record<WpKind, React.ElementType> = {
    STANDARD: FileText,
    SMART:    Brain,
    MASTER:   Star,
    LIVE:     Activity,
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

// ─── Tab definitions ──────────────────────────────────────────────────────────

type TabKey = 'content' | 'sections' | 'graph' | 'review' | 'history';

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
  const [conclusion, setConclusion]   = useState('');
  const [dirty, setDirty]             = useState(false);
  const [activeTab, setActiveTab]     = useState<TabKey>('content');
  const [commentText, setComment]     = useState('');
  const [reviewNotes, setRvNotes]     = useState('');
  const [showScriptorium, setScripto]     = useState(false);
  const [showAgentPanel,  setAgentPanel] = useState(false);

  const [initialized, setInit] = useState(false);
  if (wp && !initialized) {
    setContent((wp.content ?? {}) as Record<string, string>);
    setConclusion(wp.conclusion ?? '');
    setInit(true);
  }

  const setField = useCallback((key: string) => (value: string) => {
    setContent(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  }, []);

  const setConclusionField = useCallback((v: string) => {
    setConclusion(v);
    setDirty(true);
  }, []);

  const handleSave = async () => {
    await updateWp.mutateAsync({ content, conclusion });
    setDirty(false);
  };

  const handleStatusChange = async (next: WpStatus) => {
    await updateStatus.mutateAsync({ id: params.id, status: next, reviewNotes: reviewNotes || undefined });
    setRvNotes('');
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

  const st         = WP_STATUS_CONFIG[wp.status];
  const typeConf   = WP_TYPE_CONFIG[wp.type];
  const nextStatus = STATUS_TRANSITIONS[wp.status];
  const StatusIcon = STATUS_ICONS[wp.status];
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

  // Determine which tabs to show
  const showSectionsTab = wpKind === 'SMART';
  const showGraphTab    = wpKind === 'SMART' || wpKind === 'MASTER';

  const allTabs: { key: TabKey; label: string; icon: React.ElementType; show: boolean }[] = [
    { key: 'content'  as TabKey, label: 'Contenido',   icon: FileText,       show: wpKind !== 'MASTER' && wpKind !== 'LIVE' },
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
          { label: 'Papeles de Trabajo', href: '/dashboard/working-papers' },
          { label: wp.code },
        ]}
      />

      <div className="flex flex-1 overflow-hidden">
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto space-y-4">

          {/* ── Paper header ── */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-xs font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-lg">
                    {wp.paperCode ?? wp.code}
                  </span>
                  <span className={`text-xs font-medium ${typeConf.color}`}>{typeConf.label}</span>
                  {/* wpKind badge */}
                  <WpKindBadge wpKind={wpKind} />
                  {/* syncStatus badge for SMART and MASTER */}
                  {(wpKind === 'SMART' || wpKind === 'MASTER') && (
                    <SyncStatusBadge syncStatus={syncStatus} />
                  )}
                  {wp.aiAssisted && (
                    <span className="flex items-center gap-1 text-[10px] text-purple-600 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full">
                      <Bot className="w-2.5 h-2.5" /> Asistido por IA
                    </span>
                  )}
                </div>
                <h1 className="text-lg font-bold text-gray-900">{wp.title}</h1>
                <p className="text-xs text-gray-400 mt-1">
                  {wp.audit?.title} · v{wp.version} · Actualizado {formatRelativeTime(wp.updatedAt)}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${st.bg} ${st.color}`}>
                  <StatusIcon className="w-3.5 h-3.5" />
                  {st.label}
                </span>
                {/* Agent panel toggle — always visible */}
                <PaperAgentButton
                  type={wp.type}
                  onClick={() => setAgentPanel(p => !p)}
                  active={showAgentPanel}
                />
                {wp.status === 'DRAFT' && wpKind === 'STANDARD' && (
                  <button
                    onClick={() => setScripto(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white text-xs font-medium rounded-lg hover:bg-violet-700"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Generar borrador
                  </button>
                )}
                {dirty && (
                  <button
                    onClick={handleSave}
                    disabled={updateWp.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {updateWp.isPending ? 'Guardando...' : 'Guardar'}
                  </button>
                )}
              </div>
            </div>
          </div>

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

          {/* ── MASTER paper view ── */}
          {wpKind === 'MASTER' && (
            <MasterPaperView
              paperId={params.id}
              syncStatus={syncStatus}
              narrative={wp.narrative}
              sections={wp.sections}
              lastSyncedAt={wp.lastSyncedAt}
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

                {/* Workflow */}
                {wp.status !== 'ARCHIVED' && nextStatus && (
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-3">
                    <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Workflow</p>
                    {wp.status === 'IN_REVIEW' && (
                      <textarea
                        rows={2}
                        value={reviewNotes}
                        onChange={e => setRvNotes(e.target.value)}
                        placeholder="Notas de revisión (opcionales)..."
                        className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      />
                    )}
                    <button
                      onClick={() => handleStatusChange(nextStatus)}
                      disabled={updateStatus.isPending}
                      className="w-full py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-60"
                    >
                      {STATUS_ACTIONS[wp.status] ?? `→ ${WP_STATUS_CONFIG[nextStatus].label}`}
                    </button>
                    {wp.status === 'DRAFT' && (
                      <p className="text-[10px] text-gray-400 text-center">
                        El papel pasará a estado &ldquo;En Revisión&rdquo; para ser aprobado
                      </p>
                    )}
                  </div>
                )}

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
                readonly={wp.status === 'APPROVED'}
                aiDraftConfig={wp.status !== 'APPROVED' ? aiDraftConfig : undefined}
              />
              <CrossAuditSuggestions auditId={wp.auditId} />
            </div>
          )}

          {/* ── Tab: Grafo ── */}
          {effectiveTab === 'graph' && (
            <PaperGraphPanel paperId={params.id} />
          )}

          {/* ── Tab: Revisión ── */}
          {effectiveTab === 'review' && (
            <div className="max-w-2xl space-y-4">
              {/* Semantic quality gate — SMART and MASTER papers only */}
              {(wpKind === 'SMART' || wpKind === 'MASTER') && (
                <QualityGatePanel paperId={params.id} existingScore={wp.qualityScore} />
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

          {/* ── Tab: Historial ── */}
          {effectiveTab === 'history' && (
            <div className="max-w-lg space-y-3">
              {!versions || versions.length === 0 ? (
                <div className="py-12 text-center bg-white rounded-2xl border border-gray-200">
                  <History className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                  <p className="text-sm text-gray-400">Sin historial de versiones</p>
                  <p className="text-xs text-gray-300 mt-1">Las versiones anteriores aparecerán aquí al guardar cambios</p>
                </div>
              ) : (
                <>
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-blue-700">v{wp.version} — Versión actual</p>
                      <p className="text-xs text-blue-500 mt-0.5">{formatRelativeTime(wp.updatedAt)}</p>
                    </div>
                    <span className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded-full">Actual</span>
                  </div>

                  {versions.map(v => (
                    <div key={v.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-700">v{v.version}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{formatDate(v.changedAt)}</p>
                      </div>
                      <span className="text-xs text-gray-500">{formatRelativeTime(v.changedAt)}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

        </div>
      </div>

      {/* ── Agent Panel (side panel, slides in when active) ── */}
      {showAgentPanel && (
        <PaperAgentPanel
          wp={wp}
          onClose={() => setAgentPanel(false)}
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
    </div>
  );
}
