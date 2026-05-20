'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import {
  ArrowLeft, AlertTriangle, CheckCircle2, Clock, Send,
  ThumbsUp, ThumbsDown, UserPlus, MessageSquare, Shield,
  TrendingUp, FileText, ChevronRight, Lock, RefreshCw,
  Star, Edit3, X, Check, Sparkles, ChevronDown, ChevronUp, Loader2,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { apiClient } from '@/lib/api-client';
import {
  useFinding,
  useUpdateFinding,
  useSubmitFinding,
  useApproveFinding,
  useRejectFinding,
  useAssignFindingResponsible,
  useCloseFinding,
  useAddFindingComment,
  SEVERITY_CONFIG,
  STATUS_CONFIG,
  qualityScoreColor,
  qualityScoreBg,
  type FindingStatus,
  type Finding,
} from '@/hooks/useFindings';
import { formatDate, cn } from '@/lib/utils';

// ─── AI Improve Modal ─────────────────────────────────────────────────────────

interface ImprovedFinding {
  title?: string;
  condition?: string;
  criteria?: string;
  cause?: string;
  effect?: string;
  risk?: string;
  recommendation?: string;
  improvements_summary?: string[];
}

function ImproveWithAIModal({
  finding,
  onClose,
  onApply,
}: {
  finding: Finding;
  onClose: () => void;
  onApply: (improved: ImprovedFinding) => void;
}) {
  const [result, setResult] = useState<{ improved: ImprovedFinding; model: string; tokens_used: number } | null>(null);
  const [expandedField, setExpandedField] = useState<string | null>(null);

  const improveMutation = useMutation({
    mutationFn: () =>
      apiClient.post<{ improved: ImprovedFinding; model: string; tokens_used: number }>(
        '/ai/scriptorium/improve-finding',
        {
          finding: {
            title:          finding.title,
            condition:      finding.condition,
            criteria:       finding.criteria,
            cause:          finding.cause,
            effect:         finding.effect,
            risk:           finding.risk,
            recommendation: finding.recommendation,
            severity:       finding.severity,
            auditTitle:     finding.audit?.title,
            auditType:      finding.audit?.type,
          },
        },
      ),
    onSuccess: (data) => setResult(data),
  });

  const FIELDS: { key: keyof ImprovedFinding; label: string }[] = [
    { key: 'condition',      label: 'Condición' },
    { key: 'criteria',       label: 'Criterio' },
    { key: 'cause',          label: 'Causa' },
    { key: 'effect',         label: 'Efecto' },
    { key: 'risk',           label: 'Riesgo' },
    { key: 'recommendation', label: 'Recomendación' },
  ];

  const original: Record<string, string | undefined> = {
    condition:      finding.condition,
    criteria:       finding.criteria,
    cause:          finding.cause,
    effect:         finding.effect,
    risk:           finding.risk,
    recommendation: finding.recommendation,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-violet-100 rounded-lg">
              <Sparkles className="h-4 w-4 text-violet-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Mejorar con IA — Scriptorium</h2>
              <p className="text-xs text-gray-400">Redacción profesional manteniendo todos los hechos</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {!result && !improveMutation.isPending && (
            <div className="space-y-4">
              <div className="p-4 bg-violet-50 rounded-xl border border-violet-100">
                <p className="text-sm text-violet-800 font-medium mb-1">¿Qué mejora Scriptorium?</p>
                <ul className="text-sm text-violet-700 space-y-1 list-disc list-inside">
                  <li>Precisión técnica del lenguaje de auditoría</li>
                  <li>Citas normativas específicas en el Criterio</li>
                  <li>Cuantificación del impacto en el Efecto</li>
                  <li>Recomendaciones específicas y accionables con plazos</li>
                  <li>Estructura lógica C-C-C-E-R-R</li>
                </ul>
              </div>
              <p className="text-xs text-gray-400 text-center">
                Scriptorium (Gemini 2.5 Flash) · Los hechos del auditor se mantienen intactos
              </p>
            </div>
          )}

          {improveMutation.isPending && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="relative">
                <div className="w-12 h-12 rounded-full border-4 border-violet-100 border-t-violet-600 animate-spin" />
                <Sparkles className="absolute inset-0 m-auto h-5 w-5 text-violet-600" />
              </div>
              <p className="text-sm font-medium text-gray-600">Scriptorium está mejorando el hallazgo…</p>
              <p className="text-xs text-gray-400">Esto toma 10-20 segundos</p>
            </div>
          )}

          {improveMutation.isError && (
            <div className="p-4 bg-red-50 rounded-xl border border-red-200 text-sm text-red-700">
              Error al procesar. Verifica que el AI Service está activo en puerto 3003.
            </div>
          )}

          {result && (
            <div className="space-y-3">
              {/* Improvements summary */}
              {result.improved.improvements_summary && result.improved.improvements_summary.length > 0 && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <p className="text-xs font-semibold text-emerald-800 mb-1.5">Mejoras aplicadas:</p>
                  <ul className="space-y-0.5">
                    {result.improved.improvements_summary.map((s, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-emerald-700">
                        <Check className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Field diffs */}
              {FIELDS.map(({ key, label }) => {
                const orig = original[key as string];
                const improved = result.improved[key];
                if (!improved || Array.isArray(improved)) return null;
                const changed = orig?.trim() !== improved.trim();
                const isExpanded = expandedField === key;

                return (
                  <div key={key} className={`rounded-xl border overflow-hidden ${changed ? 'border-violet-200' : 'border-gray-100'}`}>
                    <button
                      onClick={() => setExpandedField(isExpanded ? null : key)}
                      className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-gray-700">{label}</span>
                        {changed && (
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-violet-100 text-violet-700">
                            Mejorado
                          </span>
                        )}
                        {!changed && (
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-gray-200 text-gray-500">
                            Sin cambios
                          </span>
                        )}
                      </div>
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-gray-400" /> : <ChevronDown className="h-3.5 w-3.5 text-gray-400" />}
                    </button>

                    {isExpanded && (
                      <div className="p-4 space-y-3">
                        {orig && (
                          <div>
                            <p className="text-[10px] font-semibold text-gray-400 mb-1 uppercase">Original</p>
                            <p className="text-xs text-gray-500 leading-relaxed bg-gray-50 p-2 rounded-lg">{orig}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-[10px] font-semibold text-violet-600 mb-1 uppercase">Mejorado</p>
                          <p className="text-xs text-gray-700 leading-relaxed bg-violet-50 p-2 rounded-lg border border-violet-100">{improved}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              <p className="text-center text-xs text-gray-400">
                Modelo: {result.model} · {result.tokens_used.toLocaleString()} tokens
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
            {result ? 'Cerrar sin aplicar' : 'Cancelar'}
          </button>
          <div className="flex gap-2">
            {!result ? (
              <button
                onClick={() => improveMutation.mutate()}
                disabled={improveMutation.isPending}
                className="flex items-center gap-2 px-5 py-2 bg-violet-600 text-white rounded-xl text-sm font-medium hover:bg-violet-700 disabled:opacity-50 transition-colors"
              >
                {improveMutation.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Sparkles className="h-4 w-4" />
                }
                {improveMutation.isPending ? 'Procesando…' : 'Mejorar con Scriptorium'}
              </button>
            ) : (
              <button
                onClick={() => { onApply(result.improved); onClose(); }}
                className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors"
              >
                <Check className="h-4 w-4" />
                Aplicar mejoras al hallazgo
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Quality Score Ring ───────────────────────────────────────────────────────
function QualityRing({ score }: { score: number }) {
  const r = 26;
  const circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444';
  return (
    <div className="relative w-16 h-16">
      <svg viewBox="0 0 60 60" className="w-full h-full -rotate-90">
        <circle cx="30" cy="30" r={r} fill="none" stroke="#f1f5f9" strokeWidth="5" />
        <circle
          cx="30" cy="30" r={r} fill="none"
          stroke={color} strokeWidth="5"
          strokeDasharray={`${fill} ${circ}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${qualityScoreColor(score)}`}>
        {score}
      </span>
    </div>
  );
}

// ─── Section block ────────────────────────────────────────────────────────────
function Section({ label, value, editable, onSave }: {
  label: string;
  value: string;
  editable?: boolean;
  onSave?: (val: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!value) return null;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
        {editable && !editing && (
          <button onClick={() => { setDraft(value); setEditing(true); }}
            className="text-xs text-blue-500 hover:text-blue-700">
            <Edit3 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 text-sm border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setEditing(false)} className="px-3 py-1 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">
              Cancelar
            </button>
            <button
              onClick={() => { onSave?.(draft); setEditing(false); }}
              className="px-3 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Guardar
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{value}</p>
      )}
    </div>
  );
}

// ─── Workflow button group ────────────────────────────────────────────────────
function WorkflowActions({ status, id, qualityScore }: {
  status: FindingStatus;
  id: string;
  qualityScore: number;
}) {
  const submit = useSubmitFinding();
  const approve = useApproveFinding();
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const reject = useRejectFinding();
  const close = useCloseFinding();

  if (status === 'CLOSED' || status === 'ACCEPTED_RISK') return null;

  return (
    <div className="space-y-3">
      {status === 'DRAFT' && (
        <div className="space-y-2">
          <button
            onClick={() => submit.mutate(id)}
            disabled={submit.isPending}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
          >
            <Send className="w-4 h-4" />
            {submit.isPending ? 'Enviando…' : 'Enviar a revisión'}
          </button>
          {qualityScore < 60 && (
            <p className="text-xs text-amber-600 text-center">
              Score actual: {qualityScore}/100. Mínimo 60 para enviar.
            </p>
          )}
        </div>
      )}

      {status === 'IN_REVIEW' && (
        <div className="space-y-2">
          <button
            onClick={() => approve.mutate(id)}
            disabled={approve.isPending}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-60 transition-colors"
          >
            <ThumbsUp className="w-4 h-4" />
            {approve.isPending ? 'Aprobando…' : 'Aprobar hallazgo'}
          </button>
          {!showReject ? (
            <button
              onClick={() => setShowReject(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-red-200 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors"
            >
              <ThumbsDown className="w-4 h-4" />
              Rechazar con observaciones
            </button>
          ) : (
            <div className="space-y-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-xs font-medium text-red-700">Observaciones de rechazo:</p>
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="Describe qué debe mejorar el auditor..."
                rows={3}
                className="w-full px-2 py-1.5 text-sm border border-red-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-red-400"
              />
              <div className="flex gap-2">
                <button onClick={() => setShowReject(false)} className="flex-1 px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-white">
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    if (rejectReason.trim()) {
                      reject.mutate({ id, reason: rejectReason });
                      setShowReject(false);
                    }
                  }}
                  className="flex-1 px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  Confirmar rechazo
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {(status === 'APPROVED' || status === 'IN_PROGRESS' || status === 'OVERDUE') && (
        <button
          onClick={() => close.mutate(id)}
          disabled={close.isPending}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-60 transition-colors"
        >
          <CheckCircle2 className="w-4 h-4" />
          {close.isPending ? 'Cerrando…' : 'Marcar como cerrado'}
        </button>
      )}
    </div>
  );
}

// ─── Assign modal ─────────────────────────────────────────────────────────────
function AssignModal({ findingId, onClose }: { findingId: string; onClose: () => void }) {
  const [responsibleId, setResponsibleId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [desc, setDesc] = useState('');
  const assign = useAssignFindingResponsible();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Asignar responsable</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">ID del responsable</label>
            <input
              type="text"
              value={responsibleId}
              onChange={e => setResponsibleId(e.target.value)}
              placeholder="ID del usuario"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Fecha límite</label>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Descripción del plan de acción</label>
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              rows={3}
              placeholder="Describe las acciones a tomar..."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
            Cancelar
          </button>
          <button
            onClick={() => {
              if (!responsibleId || !dueDate) return;
              assign.mutate({ id: findingId, responsibleId, dueDate, actionDescription: desc });
              onClose();
            }}
            disabled={!responsibleId || !dueDate || assign.isPending}
            className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {assign.isPending ? 'Asignando…' : 'Asignar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function FindingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: finding, isLoading, error } = useFinding(id);
  const updateFinding = useUpdateFinding(id);
  const addComment = useAddFindingComment();
  const [commentText, setCommentText] = useState('');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showImproveModal, setShowImproveModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'detail' | 'actions' | 'comments'>('detail');

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Cargando hallazgo…" />
        <div className="flex-1 p-6 space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse space-y-3">
              <div className="h-4 bg-gray-100 rounded w-1/3" />
              <div className="h-3 bg-gray-100 rounded w-full" />
              <div className="h-3 bg-gray-100 rounded w-4/5" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !finding) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Hallazgo no encontrado" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <AlertTriangle className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No se pudo cargar el hallazgo</p>
            <button onClick={() => router.back()} className="mt-4 text-sm text-blue-600 hover:underline">
              Volver
            </button>
          </div>
        </div>
      </div>
    );
  }

  const sev = SEVERITY_CONFIG[finding.severity];
  const st = STATUS_CONFIG[finding.status];
  const isEditable = finding.status === 'DRAFT';

  const handleFieldSave = (field: string) => (value: string) => {
    updateFinding.mutate({ [field]: value });
  };

  const handleApplyImproved = (improved: ImprovedFinding) => {
    const patch: Record<string, string> = {};
    if (improved.title)          patch.title          = improved.title;
    if (improved.condition)      patch.condition      = improved.condition;
    if (improved.criteria)       patch.criteria       = improved.criteria;
    if (improved.cause)          patch.cause          = improved.cause;
    if (improved.effect)         patch.effect         = improved.effect;
    if (improved.risk)           patch.risk           = improved.risk;
    if (improved.recommendation) patch.recommendation = improved.recommendation;
    if (Object.keys(patch).length > 0) updateFinding.mutate(patch);
  };

  return (
    <div className="flex flex-col h-full">
      <Header
        title={finding.title}
        breadcrumbs={[
          { label: 'Hallazgos', href: '/dashboard/findings' },
          { label: finding.audit?.title ?? 'Auditoría', href: finding.audit ? `/dashboard/audits/${finding.audit.id}` : undefined },
          { label: finding.title },
        ]}
      />

      <div className="flex-1 overflow-auto">
        <div className="p-6 max-w-7xl mx-auto">

          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-4">
            <Link href="/dashboard/findings" className="hover:text-blue-600">Hallazgos</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            {finding.audit && (
              <>
                <Link href={`/dashboard/audits/${finding.audit.id}`} className="hover:text-blue-600">
                  {finding.audit.title}
                </Link>
                <ChevronRight className="w-3.5 h-3.5" />
              </>
            )}
            <span className="text-gray-600 font-medium truncate max-w-xs">{finding.title}</span>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

            {/* Main content */}
            <div className="xl:col-span-2 space-y-4">

              {/* Title card */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${sev.bg} ${sev.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sev.dot}`} />
                        {sev.label}
                      </span>
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${st.bg} ${st.color}`}>
                        {st.label}
                      </span>
                      {finding.isMaterial && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                          <AlertTriangle className="w-3 h-3" /> Material
                        </span>
                      )}
                      {finding.isRecurring && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">
                          <RefreshCw className="w-3 h-3" /> Recurrente
                        </span>
                      )}
                    </div>
                    <h1 className="text-lg font-semibold text-gray-800">{finding.title}</h1>
                  </div>
                  <QualityRing score={finding.qualityScore} />
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-1 border-b border-gray-100 -mx-5 px-5">
                  {(['detail', 'actions', 'comments'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                        activeTab === tab
                          ? 'border-blue-500 text-blue-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {tab === 'detail' ? 'C·C·C·E·R·R' : tab === 'actions' ? `Acciones (${finding.actions?.length ?? 0})` : `Notas (${finding.comments?.length ?? 0})`}
                    </button>
                  ))}
                  {/* AI improve button — always visible, works on any status */}
                  <button
                    onClick={() => setShowImproveModal(true)}
                    className="ml-auto flex items-center gap-1.5 px-3 py-1.5 mb-1 rounded-lg text-xs font-medium bg-violet-600 text-white hover:bg-violet-700 transition-colors"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Mejorar con IA
                  </button>
                </div>

                <div className="pt-5 space-y-6">
                  {activeTab === 'detail' && (
                    <>
                      <Section label="Condición" value={finding.condition} editable={isEditable} onSave={handleFieldSave('condition')} />
                      <Section label="Criterio (norma / política aplicable)" value={finding.criteria} editable={isEditable} onSave={handleFieldSave('criteria')} />
                      <Section label="Causa" value={finding.cause} editable={isEditable} onSave={handleFieldSave('cause')} />
                      <Section label="Efecto / Consecuencia" value={finding.effect} editable={isEditable} onSave={handleFieldSave('effect')} />
                      <Section label="Riesgo" value={finding.risk ?? ''} editable={isEditable} onSave={handleFieldSave('risk')} />
                      <Section label="Recomendación" value={finding.recommendation ?? ''} editable={isEditable} onSave={handleFieldSave('recommendation')} />
                      {finding.managementResponse && (
                        <Section label="Respuesta de la gerencia" value={finding.managementResponse} editable={false} />
                      )}
                    </>
                  )}

                  {activeTab === 'actions' && (
                    <div className="space-y-3">
                      {finding.actions && finding.actions.length > 0 ? (
                        finding.actions.map(action => (
                          <div key={action.id} className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                            <p className="text-sm text-gray-700">{action.description}</p>
                            <div className="flex items-center justify-between mt-2">
                              <span className="text-xs text-gray-400">
                                {action.responsible?.name ?? 'Sin asignar'} · Vence {formatDate(action.dueDate)}
                              </span>
                              <div className="flex items-center gap-2">
                                <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${action.progressPct}%` }} />
                                </div>
                                <span className="text-xs text-gray-500">{action.progressPct}%</span>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="py-8 text-center">
                          <UserPlus className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                          <p className="text-sm text-gray-400">Sin plan de acción asignado</p>
                          {finding.status === 'APPROVED' && !finding.responsible && (
                            <button
                              onClick={() => setShowAssignModal(true)}
                              className="mt-3 text-sm text-blue-600 hover:underline"
                            >
                              Asignar responsable
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'comments' && (
                    <div className="space-y-4">
                      {finding.comments && finding.comments.length > 0 ? (
                        <div className="space-y-3">
                          {finding.comments.map(c => (
                            <div key={c.id} className={`p-3 rounded-lg ${c.isInternal ? 'bg-amber-50 border border-amber-100' : 'bg-gray-50 border border-gray-100'}`}>
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-xs font-medium text-gray-700">{c.author.name}</span>
                                <span className="text-xs text-gray-400">{formatDate(c.createdAt)}</span>
                              </div>
                              <p className="text-sm text-gray-700">{c.content}</p>
                              {c.isInternal && <p className="text-xs text-amber-600 mt-1">• Nota interna</p>}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400 text-center py-4">Sin comentarios</p>
                      )}
                      {/* Add comment */}
                      <div className="pt-2 border-t border-gray-100 space-y-2">
                        <textarea
                          value={commentText}
                          onChange={e => setCommentText(e.target.value)}
                          placeholder="Agregar nota o comentario..."
                          rows={3}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                        />
                        <div className="flex justify-end">
                          <button
                            onClick={() => {
                              if (commentText.trim()) {
                                addComment.mutate({ id, content: commentText, isInternal: false });
                                setCommentText('');
                              }
                            }}
                            disabled={!commentText.trim() || addComment.isPending}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                          >
                            <MessageSquare className="w-4 h-4" />
                            Comentar
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right sidebar */}
            <div className="space-y-4">

              {/* Quality score breakdown */}
              <div className={`rounded-xl border p-4 ${qualityScoreBg(finding.qualityScore)}`}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    Score de Calidad
                  </p>
                  <span className={`text-lg font-bold ${qualityScoreColor(finding.qualityScore)}`}>
                    {finding.qualityScore}/100
                  </span>
                </div>
                <div className="w-full h-2 bg-white/60 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      finding.qualityScore >= 80 ? 'bg-emerald-500' :
                      finding.qualityScore >= 60 ? 'bg-amber-400' : 'bg-red-400'
                    }`}
                    style={{ width: `${finding.qualityScore}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {finding.qualityScore >= 80 ? '✓ Calidad óptima para informe' :
                   finding.qualityScore >= 60 ? '⚠ Suficiente para revisión' :
                   '✗ Requiere mejoras antes de enviar'}
                </p>
              </div>

              {/* Metadata */}
              <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Información</p>
                <div className="space-y-2 text-sm">
                  {finding.normativeReference && (
                    <div className="flex gap-2">
                      <Shield className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs text-gray-400">Norma</p>
                        <p className="text-gray-700 font-medium">{finding.normativeReference}</p>
                        {finding.normativeArticle && (
                          <p className="text-xs text-gray-500">{finding.normativeArticle}</p>
                        )}
                      </div>
                    </div>
                  )}
                  {finding.effectAmount && (
                    <div className="flex gap-2">
                      <TrendingUp className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs text-gray-400">Efecto económico</p>
                        <p className="text-gray-700 font-medium">
                          {Number(finding.effectAmount).toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })}
                        </p>
                      </div>
                    </div>
                  )}
                  {finding.responsible && (
                    <div className="flex gap-2">
                      <UserPlus className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs text-gray-400">Responsable</p>
                        <p className="text-gray-700 font-medium">{finding.responsible.name}</p>
                      </div>
                    </div>
                  )}
                  {finding.dueDate && (
                    <div className="flex gap-2">
                      <Clock className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs text-gray-400">Fecha límite</p>
                        <p className={`font-medium ${new Date(finding.dueDate) < new Date() ? 'text-red-600' : 'text-gray-700'}`}>
                          {formatDate(finding.dueDate)}
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <FileText className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs text-gray-400">Creado</p>
                      <p className="text-gray-700">{formatDate(finding.createdAt)}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Workflow actions */}
              <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Acciones</p>
                <WorkflowActions status={finding.status} id={id} qualityScore={finding.qualityScore} />
                {finding.status === 'APPROVED' && !finding.responsible && (
                  <button
                    onClick={() => setShowAssignModal(true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-blue-200 text-blue-600 text-sm font-medium rounded-lg hover:bg-blue-50 transition-colors"
                  >
                    <UserPlus className="w-4 h-4" />
                    Asignar responsable
                  </button>
                )}
              </div>

              {/* Link to audit */}
              {finding.audit && (
                <Link
                  href={`/dashboard/audits/${finding.audit.id}`}
                  className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors group"
                >
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Auditoría</p>
                    <p className="text-sm font-medium text-gray-700 group-hover:text-blue-600">{finding.audit.title}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-400" />
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {showAssignModal && (
        <AssignModal findingId={id} onClose={() => setShowAssignModal(false)} />
      )}

      {showImproveModal && (
        <ImproveWithAIModal
          finding={finding}
          onClose={() => setShowImproveModal(false)}
          onApply={handleApplyImproved}
        />
      )}
    </div>
  );
}
