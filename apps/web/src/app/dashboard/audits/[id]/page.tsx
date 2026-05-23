'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Lock, Calendar, Clock, Users, FileText,
  AlertTriangle, Upload, BadgeCheck, Edit2, ChevronRight,
  TrendingUp, Target, Shield, Sparkles, Wand2, Loader2, X,
  ClipboardCopy, Check, ListChecks, Plus,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { useAudit, useUpdateAuditStatus } from '@/hooks/useAudits';
import { useFindingsByAudit, SEVERITY_CONFIG, STATUS_CONFIG } from '@/hooks/useFindings';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import { MinervaAuditPanel } from '@/components/audits/MinervaAuditPanel';

const STATUS_STYLES: Record<string, string> = {
  PLANNING: 'bg-blue-100 text-blue-700 border border-blue-200',
  IN_PROGRESS: 'bg-indigo-100 text-indigo-700 border border-indigo-200',
  REVIEW: 'bg-amber-100 text-amber-700 border border-amber-200',
  CLOSED: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  CANCELLED: 'bg-red-50 text-red-600 border border-red-200',
};

const STATUS_LABELS: Record<string, string> = {
  PLANNING: 'Planificación', IN_PROGRESS: 'En Progreso',
  REVIEW: 'En Revisión', CLOSED: 'Cerrada', CANCELLED: 'Cancelada',
};

const TYPE_LABELS: Record<string, string> = {
  FINANCIAL: 'Financiera', OPERATIONAL: 'Operacional', COMPLIANCE: 'Cumplimiento',
  IT: 'TI', FORENSIC: 'Forense', INTEGRATED: 'Integrada',
  FOLLOW_UP: 'Seguimiento', SPECIAL: 'Especial', ESG: 'ESG',
};

const STATUS_TRANSITIONS: Record<string, string[]> = {
  PLANNING: ['IN_PROGRESS'],
  IN_PROGRESS: ['REVIEW', 'CANCELLED'],
  REVIEW: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: [],
  CANCELLED: [],
};

type Tab = 'overview' | 'team' | 'findings' | 'pbc' | 'confirmations';

function StatCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-xl font-bold text-gray-800">{value}</p>
      </div>
    </div>
  );
}

export default function AuditDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusComment, setStatusComment] = useState('');

  const { data: audit, isLoading } = useAudit(id);
  const updateStatus = useUpdateAuditStatus();

  if (isLoading) {
    return (
      <div className="flex flex-col h-screen bg-[#F0F4F8]">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#0F2D4A]" />
        </div>
      </div>
    );
  }

  if (!audit) {
    return (
      <div className="flex flex-col h-screen bg-[#F0F4F8]">
        <Header />
        <div className="flex-1 flex items-center justify-center flex-col gap-3">
          <AlertTriangle className="h-12 w-12 text-gray-400" />
          <p className="text-gray-600">Auditoría no encontrada</p>
          <Link href="/dashboard/audits" className="text-[#0F2D4A] font-medium hover:underline">
            Volver al listado
          </Link>
        </div>
      </div>
    );
  }

  const nextStatuses = STATUS_TRANSITIONS[audit.status] ?? [];
  const progressPct = audit.estimatedHours > 0
    ? Math.min(100, Math.round((audit.actualHours / audit.estimatedHours) * 100))
    : 0;

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'overview', label: 'Resumen' },
    { key: 'team', label: 'Equipo', count: audit.team?.length ?? 0 },
    { key: 'findings', label: 'Hallazgos', count: audit._count?.findings ?? 0 },
    { key: 'pbc', label: 'PBC', count: audit._count?.pbcRequests ?? 0 },
    { key: 'confirmations', label: 'Confirmaciones', count: audit._count?.externalConfirmations ?? 0 },
  ];

  async function handleStatusChange(newStatus: string) {
    await updateStatus.mutateAsync({ id, status: newStatus, comment: statusComment });
    setShowStatusModal(false);
    setStatusComment('');
  }

  return (
    <div className="flex flex-col h-screen bg-[#F0F4F8]">
      <Header />

      <div className="flex-1 overflow-auto">
        {/* Breadcrumb + header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="max-w-7xl mx-auto">
            <nav className="flex items-center gap-2 text-sm text-gray-500 mb-3">
              <Link href="/dashboard" className="hover:text-gray-800">Dashboard</Link>
              <ChevronRight className="h-4 w-4" />
              <Link href="/dashboard/audits" className="hover:text-gray-800">Auditorías</Link>
              <ChevronRight className="h-4 w-4" />
              <span className="text-gray-800 font-medium truncate max-w-[240px]">{audit.title}</span>
            </nav>

            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <button
                  onClick={() => router.back()}
                  className="mt-1 p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 flex-shrink-0"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-2xl font-bold text-gray-900 truncate">{audit.title}</h1>
                    {audit.isInvestigationMode && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium border border-red-200">
                        <Lock className="h-3 w-3" />
                        Modo Investigación
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="font-mono text-sm text-gray-500">{audit.code}</span>
                    <span className="text-gray-300">·</span>
                    <span className="text-sm text-gray-500">{TYPE_LABELS[audit.type] ?? audit.type}</span>
                    {audit.auditEntity && (
                      <>
                        <span className="text-gray-300">·</span>
                        <span className="text-sm text-gray-500">{audit.auditEntity.name}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_STYLES[audit.status] ?? ''}`}>
                  {STATUS_LABELS[audit.status] ?? audit.status}
                </span>
                {nextStatuses.length > 0 && (
                  <button
                    onClick={() => setShowStatusModal(true)}
                    className="px-3 py-1.5 bg-[#0F2D4A] text-white rounded-lg text-sm font-medium hover:bg-[#1a3f5f] flex items-center gap-1.5"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                    Cambiar Estado
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon={FileText} label="Papeles de Trabajo" value={audit._count?.workingPapers ?? 0} color="bg-blue-50 text-blue-600" />
            <StatCard icon={AlertTriangle} label="Hallazgos" value={audit._count?.findings ?? 0} color="bg-orange-50 text-orange-600" />
            <StatCard icon={Upload} label="PBC Pendientes" value={audit._count?.pbcRequests ?? 0} color="bg-violet-50 text-violet-600" />
            <StatCard icon={BadgeCheck} label="Confirmaciones" value={audit._count?.externalConfirmations ?? 0} color="bg-emerald-50 text-emerald-600" />
          </div>

          {/* Tabs */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex border-b border-gray-200 overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-5 py-3 text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                    activeTab === tab.key
                      ? 'text-[#0F2D4A] border-b-2 border-[#0F2D4A] bg-blue-50/30'
                      : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                  }`}
                >
                  {tab.label}
                  {tab.count !== undefined && (
                    <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                      activeTab === tab.key ? 'bg-[#0F2D4A] text-white' : 'bg-gray-200 text-gray-600'
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="p-6">
              {activeTab === 'overview' && (
                <OverviewTab audit={audit} progressPct={progressPct} />
              )}
              {activeTab === 'team' && (
                <TeamTab team={audit.team ?? []} />
              )}
              {activeTab === 'findings' && (
                <FindingsTab auditId={id} />
              )}
              {activeTab === 'pbc' && (
                <EmptyTab
                  icon={Upload}
                  title="Portal de Clientes (PBC)"
                  description="Las solicitudes PBC de esta auditoría aparecerán aquí."
                  href={`/dashboard/pbc?auditId=${id}`}
                  linkLabel="Ver en módulo PBC"
                />
              )}
              {activeTab === 'confirmations' && (
                <EmptyTab
                  icon={BadgeCheck}
                  title="Confirmaciones Externas"
                  description="Las confirmaciones externas de esta auditoría aparecerán aquí."
                  href={`/dashboard/confirmations?auditId=${id}`}
                  linkLabel="Ver en módulo de Confirmaciones"
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Status change modal */}
      {showStatusModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Cambiar Estado</h3>
            <p className="text-sm text-gray-500 mb-4">Selecciona el nuevo estado para esta auditoría.</p>

            <div className="space-y-2 mb-4">
              {nextStatuses.map((s) => (
                <button
                  key={s}
                  onClick={() => handleStatusChange(s)}
                  disabled={updateStatus.isPending}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 border-gray-200 hover:border-[#0F2D4A] hover:bg-blue-50/30 transition-colors text-left"
                >
                  <span className="font-medium text-gray-800">{STATUS_LABELS[s] ?? s}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[s]}`}>
                    {STATUS_LABELS[s]}
                  </span>
                </button>
              ))}
            </div>

            <textarea
              value={statusComment}
              onChange={(e) => setStatusComment(e.target.value)}
              placeholder="Comentario (opcional)..."
              rows={3}
              className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/30 mb-4"
            />

            <button
              onClick={() => setShowStatusModal(false)}
              className="w-full py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Audit Program Modal ─────────────────────────────────────────────────────
interface AuditProcedure {
  ref?: string;
  id?: string;
  description: string;
  technique?: string;
  sample?: string;
  niaRef?: string;
  nia_reference?: string;   // alternate key
  tickMark?: string;
  time_estimate?: string;
  phase?: string;           // flat-array format
}

interface AuditProgramStep {
  section: string;
  procedures: AuditProcedure[];
}

interface AuditProgram {
  title?: string;
  objective?: string;         // singular (actual LLM output)
  objectives?: string[];      // plural (alternate)
  steps?: AuditProgramStep[]; // sectioned format (actual LLM output)
  procedures?: AuditProcedure[]; // flat format (fallback)
  totalProcedures?: number;
  total_procedures?: number;
  estimatedHours?: number;
  riskFocus?: string[];
  risk_areas?: string[];
  notes?: string;
}

interface GenerateProgramResponse {
  program: AuditProgram;
  model: string;
  tokens_used?: number;
}

function AuditProgramModal({
  audit,
  onClose,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  audit: any;
  onClose: () => void;
}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [program, setProgram]           = useState<AuditProgram | null>(null);
  const [error, setError]               = useState('');
  const [aiModel, setAiModel]           = useState('');
  const [copied, setCopied]             = useState(false);

  async function generate() {
    setError('');
    setIsGenerating(true);
    try {
      const result = await apiClient.post<GenerateProgramResponse>(
        '/ai/scriptorium/audit-program',
        {
          auditTitle:        audit.title,
          auditType:         audit.type ?? 'OPERATIONAL',
          scope:             audit.scope,
          objectives:        audit.objectives,
          riskLevel:         audit.riskLevel,
          entityDescription: audit.auditEntity?.name,
        },
      );
      setProgram(result.program);
      setAiModel(result.model ?? '');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al generar el programa.');
    } finally {
      setIsGenerating(false);
    }
  }

  async function copyToClipboard() {
    if (!program) return;
    const text = formatProgramAsText(program);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Support both `steps` (sectioned) and flat `procedures` format
  const steps: AuditProgramStep[] = program?.steps
    ?? (program?.procedures ? [{ section: 'Procedimientos', procedures: program.procedures }] : []);
  const totalCount = program?.totalProcedures ?? program?.total_procedures
    ?? steps.reduce((s, st) => s + st.procedures.length, 0);
  const riskItems = program?.riskFocus ?? program?.risk_areas ?? [];
  const objectiveText = program?.objective
    ?? (program?.objectives ? program.objectives.join(' ') : '');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-600 flex items-center justify-center">
              <ListChecks className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Programa de Auditoría</h2>
              <p className="text-xs text-gray-500">Generado por Scriptorium IA</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-6 py-5">
          {!program && !isGenerating && (
            <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
              <div className="w-16 h-16 rounded-2xl bg-violet-50 border border-violet-200 flex items-center justify-center">
                <Wand2 className="w-8 h-8 text-violet-500" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-800 mb-1">Generar programa de auditoría</h3>
                <p className="text-sm text-gray-500 max-w-sm">
                  Scriptorium analizará el contexto de esta auditoría y generará procedimientos
                  NIA organizados por fases, con estimados de tiempo y referencias normativas.
                </p>
              </div>
              {error && (
                <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}
              <button
                onClick={generate}
                className="flex items-center gap-2 px-6 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 transition-all shadow-sm"
              >
                <Sparkles className="w-4 h-4" />
                ✨ Generar con Scriptorium
              </button>
            </div>
          )}

          {isGenerating && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="flex gap-1.5">
                {[0, 1, 2, 3, 4].map(i => (
                  <div key={i} className="w-2.5 h-2.5 rounded-full bg-violet-400 animate-bounce"
                    style={{ animationDelay: `${i * 100}ms` }} />
                ))}
              </div>
              <p className="text-sm text-violet-600 font-medium">Generando programa de auditoría…</p>
              <p className="text-xs text-gray-400">Scriptorium está analizando el contexto y redactando procedimientos NIA</p>
            </div>
          )}

          {program && !isGenerating && (
            <div className="space-y-5">
              {/* Program header */}
              {program.title && (
                <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
                  <h3 className="font-semibold text-violet-900 text-base">{program.title}</h3>
                  {aiModel && (
                    <p className="text-xs text-violet-500 mt-1">Generado con {aiModel}</p>
                  )}
                </div>
              )}

              {/* Objective */}
              {objectiveText && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Objetivo</h4>
                  <p className="text-sm text-gray-600 leading-relaxed bg-gray-50 rounded-xl p-3">{objectiveText}</p>
                </div>
              )}

              {/* Stats row */}
              {(totalCount > 0 || program.estimatedHours) && (
                <div className="flex gap-3 flex-wrap">
                  {totalCount > 0 && (
                    <div className="bg-violet-50 border border-violet-200 rounded-lg px-3 py-2 text-center">
                      <p className="text-lg font-bold text-violet-700">{totalCount}</p>
                      <p className="text-xs text-violet-500">Procedimientos</p>
                    </div>
                  )}
                  {program.estimatedHours && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-center">
                      <p className="text-lg font-bold text-blue-700">{program.estimatedHours}h</p>
                      <p className="text-xs text-blue-500">Horas estimadas</p>
                    </div>
                  )}
                </div>
              )}

              {/* Risk Focus */}
              {riskItems.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Focos de Riesgo</h4>
                  <div className="flex flex-wrap gap-2">
                    {riskItems.map((area, i) => (
                      <span key={i} className="px-2.5 py-1 rounded-full bg-orange-50 border border-orange-200 text-xs text-orange-700 font-medium">
                        {area}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Steps / Procedures */}
              {steps.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
                    Programa de Trabajo
                  </h4>
                  <div className="space-y-4">
                    {steps.map((step, si) => (
                      <div key={si}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="w-2 h-2 rounded-full bg-violet-500 flex-shrink-0" />
                          <h5 className="text-sm font-semibold text-gray-800">{step.section}</h5>
                          <span className="text-xs text-gray-400">({step.procedures.length})</span>
                        </div>
                        <div className="ml-4 space-y-2">
                          {step.procedures.map((proc, i) => (
                            <div key={i} className="bg-gray-50 rounded-xl p-3 space-y-1.5">
                              <div className="flex items-start gap-2">
                                <span className="text-xs font-mono text-gray-400 flex-shrink-0 mt-0.5 min-w-[36px]">
                                  {proc.ref ?? proc.id ?? `${si + 1}.${i + 1}`}
                                </span>
                                <p className="text-sm text-gray-700 leading-relaxed">{proc.description}</p>
                              </div>
                              <div className="flex flex-wrap gap-1.5 ml-10">
                                {(proc.niaRef ?? proc.nia_reference) && (
                                  <span className="text-[11px] text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded">
                                    {proc.niaRef ?? proc.nia_reference}
                                  </span>
                                )}
                                {proc.technique && (
                                  <span className="text-[11px] text-violet-600 bg-violet-50 border border-violet-100 px-2 py-0.5 rounded">
                                    {proc.technique}
                                  </span>
                                )}
                                {proc.sample && (
                                  <span className="text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                                    {proc.sample}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              {program.notes && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Notas</p>
                  <p className="text-sm text-amber-800">{program.notes}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            {program && (
              <button
                onClick={generate}
                disabled={isGenerating}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Regenerar
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {program && (
              <button
                onClick={copyToClipboard}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                {copied ? (
                  <><Check className="w-3.5 h-3.5 text-emerald-500" /> Copiado</>
                ) : (
                  <><ClipboardCopy className="w-3.5 h-3.5" /> Copiar programa</>
                )}
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-medium text-gray-700 transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatProgramAsText(program: AuditProgram): string {
  const lines: string[] = [];
  if (program.title) lines.push(`# ${program.title}`, '');
  if (program.objective) lines.push('## Objetivo', program.objective, '');
  if (program.steps?.length) {
    lines.push('## Procedimientos');
    program.steps.forEach((step) => {
      lines.push(`\n### ${step.section}`);
      step.procedures.forEach((p, i) => {
        const ref = p.ref ?? p.id ?? String(i + 1);
        lines.push(`${ref}. ${p.description}`);
        if (p.niaRef ?? p.nia_reference) lines.push(`   Referencia: ${p.niaRef ?? p.nia_reference}`);
        if (p.technique) lines.push(`   Técnica: ${p.technique}`);
        if (p.sample) lines.push(`   Muestra: ${p.sample}`);
      });
    });
  } else if (program.procedures?.length) {
    lines.push('## Procedimientos');
    program.procedures.forEach((p, i) => {
      lines.push(`${i + 1}. ${p.description}`);
      if (p.niaRef ?? p.nia_reference) lines.push(`   Referencia: ${p.niaRef ?? p.nia_reference}`);
    });
  }
  if (program.riskFocus?.length) {
    lines.push('', '## Focos de Riesgo');
    program.riskFocus.forEach(r => lines.push(`- ${r}`));
  }
  if (program.notes) lines.push('', '## Notas', program.notes);
  return lines.join('\n');
}

// ─── OverviewTab ──────────────────────────────────────────────────────────────
function OverviewTab({ audit, progressPct }: { audit: any; progressPct: number }) {
  const [showProgramModal, setShowProgramModal] = useState(false);
  return (
    <div className="space-y-6">
      {/* MINERVA Coordinadora */}
      <MinervaAuditPanel
        audit={{
          id:             audit.id,
          title:          audit.title,
          type:           audit.type,
          status:         audit.status,
          riskLevel:      audit.riskLevel,
          scope:          audit.scope,
          objectives:     audit.objectives,
          estimatedHours: audit.estimatedHours ?? 0,
          actualHours:    audit.actualHours ?? 0,
          workingPapers:  audit._count?.workingPapers ?? 0,
          findings:       audit._count?.findings ?? 0,
          pbcRequests:    audit._count?.pbcRequests ?? 0,
          materialityGlobal: audit.materiality,
          riskModel:      audit.auditRiskModel,
        }}
      />

      {/* AI Audit Program Banner */}
      <div className="flex items-center justify-between bg-gradient-to-r from-violet-50 to-purple-50 border border-violet-200 rounded-xl px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-600 flex items-center justify-center flex-shrink-0">
            <ListChecks className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-violet-900">Programa de Auditoría con IA</p>
            <p className="text-xs text-violet-500">Genera procedimientos NIA organizados por fases en segundos</p>
          </div>
        </div>
        <button
          onClick={() => setShowProgramModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 transition-all shadow-sm flex-shrink-0"
        >
          <Sparkles className="w-4 h-4" />
          ✨ Generar Programa
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Dates & Hours */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Cronograma</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 rounded-xl p-3">
            <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
              <Calendar className="h-3.5 w-3.5" />
              Inicio
            </div>
            <p className="font-medium text-gray-800">{formatDate(audit.startDate) || '—'}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
              <Calendar className="h-3.5 w-3.5" />
              Fin Estimado
            </div>
            <p className="font-medium text-gray-800">{formatDate(audit.endDate) || '—'}</p>
          </div>
        </div>

        {/* Hours progress */}
        <div className="bg-gray-50 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-sm text-gray-600">
              <Clock className="h-4 w-4" />
              Horas de Trabajo
            </div>
            <span className="text-sm font-semibold text-gray-800">
              {audit.actualHours ?? 0} / {audit.estimatedHours ?? 0} h
            </span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#0F2D4A] rounded-full transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">{progressPct}% completado</p>
        </div>

        {/* Scope */}
        {audit.scope && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Alcance</h3>
            <p className="text-sm text-gray-600 leading-relaxed bg-gray-50 rounded-xl p-3">{audit.scope}</p>
          </div>
        )}

        {/* Objectives */}
        {audit.objectives && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Objetivos</h3>
            <p className="text-sm text-gray-600 leading-relaxed bg-gray-50 rounded-xl p-3">{audit.objectives}</p>
          </div>
        )}
      </div>

      {/* Materiality & Risk */}
      <div className="space-y-4">
        {audit.materiality && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <Target className="h-4 w-4 text-indigo-600" />
              Materialidad (NIA 320)
            </h3>
            <div className="space-y-2">
              {[
                { label: 'Materialidad Global (MG)', value: audit.materiality, color: 'bg-indigo-50 text-indigo-700' },
                { label: 'Materialidad de Ejecución (ME)', value: audit.materialityExecution, color: 'bg-blue-50 text-blue-700' },
                { label: 'Umbral de Acumulación (UAE)', value: audit.materialityAccumulation, color: 'bg-sky-50 text-sky-700' },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
                  <span className="text-sm text-gray-600">{item.label}</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold font-mono ${item.color}`}>
                    {item.value ? `$${Number(item.value).toLocaleString('es-CL')}` : '—'}
                  </span>
                </div>
              ))}
              {audit.materialityBase && (
                <p className="text-xs text-gray-400 pl-1">Base: {audit.materialityBase}</p>
              )}
            </div>
          </div>
        )}

        {audit.auditRiskModel && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <Shield className="h-4 w-4 text-orange-600" />
              Modelo de Riesgo (NIA 200)
            </h3>
            <div className="space-y-2">
              {[
                { label: 'Riesgo Inherente (RI)', value: audit.auditRiskModel.inherentRisk },
                { label: 'Riesgo de Control (RC)', value: audit.auditRiskModel.controlRisk },
                { label: 'Riesgo de Detección (RD)', value: audit.auditRiskModel.detectionRisk },
                { label: 'Riesgo de Auditoría', value: audit.auditRiskModel.auditRisk },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
                  <span className="text-sm text-gray-600">{item.label}</span>
                  <span className="font-mono text-sm font-medium text-gray-800">
                    {item.value !== undefined ? `${(item.value * 100).toFixed(1)}%` : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {audit.auditEntity && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
              Unidad Auditada
            </h3>
            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
              <p className="font-medium text-gray-800">{audit.auditEntity.name}</p>
              {audit.auditEntity.category && (
                <p className="text-sm text-gray-500">{audit.auditEntity.category}</p>
              )}
              {audit.auditEntity.inherentRiskScore !== undefined && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">Riesgo Inherente:</span>
                  <span className="text-xs font-bold text-orange-600">{audit.auditEntity.inherentRiskScore}/100</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      </div>{/* end grid */}

      {/* Audit Program Modal */}
      {showProgramModal && (
        <AuditProgramModal audit={audit} onClose={() => setShowProgramModal(false)} />
      )}
    </div>
  );
}

function FindingsTab({ auditId }: { auditId: string }) {
  const { data: findings, isLoading } = useFindingsByAudit(auditId);

  const newHref = `/dashboard/findings/new?auditId=${auditId}`;

  const NewButton = () => (
    <Link
      href={newHref}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0F2D4A] text-white rounded-lg text-sm font-medium hover:bg-[#1a3f5f] transition-colors"
    >
      <Plus className="h-4 w-4" />
      Nuevo Hallazgo
    </Link>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Hallazgos</h3>
        <NewButton />
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && (!findings || findings.length === 0) && (
        <div className="text-center py-12">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="h-7 w-7 text-gray-400" />
          </div>
          <p className="text-sm text-gray-500 mb-4">No hay hallazgos en esta auditoría</p>
          <NewButton />
        </div>
      )}

      {/* Findings list */}
      {!isLoading && findings && findings.length > 0 && (
        <div className="space-y-2">
          {findings.map((finding) => {
            const sev = SEVERITY_CONFIG[finding.severity];
            const sta = STATUS_CONFIG[finding.status];
            const score = finding.qualityScore ?? 0;
            const scoreBarColor = score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-amber-500' : 'bg-red-500';
            const isOverdue = finding.dueDate
              ? new Date(finding.dueDate) < new Date()
              : false;

            return (
              <Link
                key={finding.id}
                href={`/dashboard/findings/${finding.id}`}
                className="flex items-center gap-3 bg-gray-50 hover:bg-blue-50/40 border border-gray-200 hover:border-[#0F2D4A]/20 rounded-xl px-4 py-3 transition-colors group"
              >
                {/* Severity dot */}
                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${sev.dot}`} />

                {/* Severity badge */}
                <span className={`text-xs font-medium px-2 py-0.5 rounded border flex-shrink-0 ${sev.color} ${sev.bg}`}>
                  {sev.label}
                </span>

                {/* Title */}
                <span className="flex-1 text-sm font-medium text-gray-800 truncate min-w-0">
                  {finding.title}
                </span>

                {/* Status badge */}
                <span className={`text-xs font-medium px-2 py-0.5 rounded flex-shrink-0 ${sta.color} ${sta.bg}`}>
                  {sta.label}
                </span>

                {/* Quality score bar */}
                <div className="flex items-center gap-1.5 flex-shrink-0 w-20">
                  <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${scoreBarColor}`}
                      style={{ width: `${score}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 w-6 text-right">{score}</span>
                </div>

                {/* Due date */}
                {finding.dueDate && (
                  <span className={`text-xs flex-shrink-0 ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                    {formatDate(finding.dueDate)}
                  </span>
                )}

                {/* Arrow */}
                <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0 group-hover:text-[#0F2D4A] transition-colors" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TeamTab({ team }: { team: any[] }) {
  const roleLabels: Record<string, string> = {
    LEAD: 'Auditor Líder',
    AUDITOR: 'Auditor',
    SUPERVISOR: 'Supervisor',
    EXPERT: 'Experto',
    OBSERVER: 'Observador',
  };

  if (!team.length) {
    return (
      <div className="text-center py-12 text-gray-400">
        <Users className="h-10 w-10 mx-auto mb-2 opacity-50" />
        <p>No hay miembros en el equipo</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {team.map((member) => (
        <div key={member.id} className="flex items-center gap-3 bg-gray-50 rounded-xl p-4">
          <div className="w-10 h-10 rounded-full bg-[#0F2D4A] flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
            {member.user?.name?.charAt(0)?.toUpperCase() ?? '?'}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-gray-800 truncate">{member.user?.name ?? '—'}</p>
            <p className="text-xs text-gray-500">{roleLabels[member.role] ?? member.role}</p>
          </div>
          {member.role === 'LEAD' && (
            <span className="ml-auto px-2 py-0.5 rounded-full bg-[#0F2D4A] text-white text-xs flex-shrink-0">
              Líder
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function EmptyTab({ icon: Icon, title, description, href, linkLabel }: {
  icon: React.ElementType;
  title: string;
  description: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <div className="text-center py-12">
      <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
        <Icon className="h-7 w-7 text-gray-400" />
      </div>
      <h3 className="font-semibold text-gray-700 mb-1">{title}</h3>
      <p className="text-sm text-gray-400 mb-4">{description}</p>
      <Link
        href={href}
        className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0F2D4A] text-white rounded-lg text-sm font-medium hover:bg-[#1a3f5f]"
      >
        {linkLabel}
        <ChevronRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
