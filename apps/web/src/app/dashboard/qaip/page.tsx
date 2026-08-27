'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck, ShieldCheck, FileText, Lock, ChevronRight, AlertTriangle, Plus, CheckCircle2,
} from 'lucide-react';
import {
  useQaipAssessments, useStartQaipAssessment, useUpdateQaipAssessmentItem, useDecideQaipAssessment,
  useIndependenceDeclarations, useUpsertIndependenceDeclaration,
  useAuditCharters, useCreateAuditCharter,
  useQaipFindings, useCreateQaipFinding, useUpdateQaipFindingStatus,
  useAddQaipRootCause, useAddQaipRemediationAction, useUpdateQaipRemediationAction,
  useQaipPerformance,
  QAIP_RATING_CONFIG, QAIP_TRACK_LABEL, QAIP_FINDING_STATUS_CONFIG, QAIP_SEVERITY_CONFIG, QAIP_ROOT_CAUSE_LABEL,
  QaipTrack, QaipAssessment, AcceptanceRating, QaipFinding,
  QaipFindingSource, FindingSeverity, QaipRootCauseCategory,
} from '@/hooks/useQaip';
import { useOrgUsersList } from '@/hooks/useCapacity';
import { formatDate } from '@/lib/utils';

const RATINGS: AcceptanceRating[] = ['PENDING', 'GREEN', 'YELLOW', 'RED'];
const TRACKS: QaipTrack[] = ['IIA_INTERNAL', 'NIGC_EXTERNAL'];
const FINDING_SOURCES: QaipFindingSource[] = ['AUTOEVALUACION', 'EQR', 'COMITE', 'AD_HOC'];
const SEVERITIES: FindingSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL'];
const ROOT_CAUSE_CATEGORIES: QaipRootCauseCategory[] = ['COMPETENCIA', 'PRESION_TIEMPO', 'BRECHA_METODOLOGICA', 'SUPERVISION_INSUFICIENTE', 'TONO_DIRECCION', 'OTRO'];

// ─── Tarjeta de resultado global ────────────────────────────────────────────
function Semaforo({ result }: { result: AcceptanceRating }) {
  const cfg = QAIP_RATING_CONFIG[result];
  return (
    <div className={`flex items-center gap-3 rounded-2xl border-2 ${cfg.border} ${cfg.bg} px-5 py-4`}>
      <span className={`w-4 h-4 rounded-full ${
        result === 'GREEN' ? 'bg-emerald-500' : result === 'YELLOW' ? 'bg-amber-500' : result === 'RED' ? 'bg-red-500' : 'bg-gray-300'
      }`} />
      <div>
        <p className={`text-sm font-bold ${cfg.color}`}>Resultado global: {cfg.label}</p>
        <p className="text-xs text-gray-500">Se calcula automáticamente como la peor calificación de todos los standards.</p>
      </div>
    </div>
  );
}

// ─── Vista de una evaluación (checklist agrupado por componente) ───────────
function AssessmentView({ assessment }: { assessment: QaipAssessment }) {
  const updateItem = useUpdateQaipAssessmentItem();
  const decide = useDecideQaipAssessment();
  const [form, setForm] = useState<Record<string, { rating: AcceptanceRating; evidence: string; notes: string }>>({});
  const [justification, setJustification] = useState('');
  const [nextDueAt, setNextDueAt] = useState(assessment.nextDueAt?.slice(0, 10) ?? '');
  const [showDecide, setShowDecide] = useState(false);

  useEffect(() => {
    const next: typeof form = {};
    for (const item of assessment.items) {
      next[item.id] = { rating: item.rating, evidence: item.evidence ?? '', notes: item.notes ?? '' };
    }
    setForm(next);
  }, [assessment.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const decided = !!assessment.decidedAt;
  const allEvaluated = assessment.items.every(i => (form[i.id]?.rating ?? 'PENDING') !== 'PENDING');

  const groups = useMemo(() => {
    const map = new Map<string, typeof assessment.items>();
    for (const item of assessment.items) {
      const key = item.standard.component;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return [...map.entries()];
  }, [assessment.items]);

  const saveItem = async (itemId: string, override?: Partial<{ rating: AcceptanceRating; evidence: string; notes: string }>) => {
    const f = { ...(form[itemId] ?? { rating: 'PENDING' as AcceptanceRating, evidence: '', notes: '' }), ...override };
    try {
      await updateItem.mutateAsync({ id: itemId, data: { rating: f.rating, evidence: f.evidence, notes: f.notes } });
    } catch { /* shown inline via mutation state, ok to ignore here */ }
  };

  const setRating = (itemId: string, rating: AcceptanceRating) => {
    setForm(p => ({ ...p, [itemId]: { ...(p[itemId] ?? { evidence: '', notes: '' }), rating } }));
    saveItem(itemId, { rating });
  };

  const handleDecide = async () => {
    try {
      await decide.mutateAsync({ id: assessment.id, overallJustification: justification, nextDueAt: nextDueAt || undefined });
      setShowDecide(false);
      setJustification('');
    } catch { /* shown below */ }
  };

  const cls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">
            {assessment.kind === 'AUTOEVALUACION' ? 'Autoevaluación' : assessment.kind === 'EQA_EXTERNA' ? 'Evaluación Externa (EQA)' : 'Autoevaluación con Validación Independiente (SAIV)'} {assessment.period}
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">{QAIP_TRACK_LABEL[assessment.track].sub}</p>
        </div>
        {decided && (
          <span className="flex items-center gap-1.5 text-xs text-gray-400">
            <Lock className="w-3.5 h-3.5" /> Decidido — solo lectura
          </span>
        )}
      </div>

      <Semaforo result={assessment.overallResult} />

      {decided && assessment.overallJustification && (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400">Justificación de la decisión</p>
          <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{assessment.overallJustification}</p>
          <p className="text-xs text-gray-400 mt-2">
            Decidido por {assessment.decidedBy?.name ?? '—'} el {assessment.decidedAt ? formatDate(assessment.decidedAt) : '—'}
            {assessment.nextDueAt && ` · Próxima evaluación externa: ${formatDate(assessment.nextDueAt)}`}
          </p>
        </div>
      )}

      <div className="space-y-5">
        {groups.map(([component, items]) => (
          <div key={component}>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{component}</p>
            <div className="space-y-3">
              {items.map(item => {
                const f = form[item.id] ?? { rating: 'PENDING' as AcceptanceRating, evidence: '', notes: '' };
                const rcfg = QAIP_RATING_CONFIG[f.rating];
                return (
                  <div key={item.id} className={`bg-white rounded-2xl border p-4 space-y-3 ${rcfg.border}`}>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">
                        <span className="font-mono text-xs text-gray-400 mr-2">{item.standard.code}</span>
                        {item.standard.title}
                      </p>
                      {item.standard.guidance && <p className="text-xs text-gray-400 mt-1">{item.standard.guidance}</p>}
                    </div>
                    <div className="flex gap-1.5">
                      {RATINGS.map(r => {
                        const rc = QAIP_RATING_CONFIG[r];
                        const active = f.rating === r;
                        return (
                          <button
                            key={r}
                            type="button"
                            disabled={decided}
                            onClick={() => setRating(item.id, r)}
                            className={`flex-1 text-xs font-medium py-1.5 rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                              active ? `${rc.bg} ${rc.color} ${rc.border}` : 'border-gray-200 text-gray-400 hover:bg-gray-50'
                            }`}
                          >
                            {rc.label}
                          </button>
                        );
                      })}
                    </div>
                    <textarea
                      rows={2}
                      disabled={decided}
                      placeholder="Evidencia (dónde se documentó / qué se revisó)"
                      value={f.evidence}
                      onChange={e => setForm(p => ({ ...p, [item.id]: { ...f, evidence: e.target.value } }))}
                      onBlur={() => saveItem(item.id)}
                      className={cls}
                    />
                    <textarea
                      rows={2}
                      disabled={decided}
                      placeholder="Notas"
                      value={f.notes}
                      onChange={e => setForm(p => ({ ...p, [item.id]: { ...f, notes: e.target.value } }))}
                      onBlur={() => saveItem(item.id)}
                      className={cls}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {updateItem.isError && (
        <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
          {(updateItem.error as Error)?.message ?? 'Error al guardar'}
        </p>
      )}

      {!decided && (
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowDecide(true)}
            disabled={!allEvaluated}
            title={!allEvaluated ? 'Califique todos los standards antes de decidir' : undefined}
            className="px-4 py-2 bg-[#0F2D4A] text-white text-sm font-medium rounded-xl hover:bg-[#1a3f5f] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Decidir evaluación
          </button>
        </div>
      )}

      {showDecide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-1">Decidir Evaluación QAIP</h2>
            <p className="text-xs text-gray-400 mb-4">
              El resultado global se calculará automáticamente como la peor calificación de todos los standards.
            </p>
            <textarea
              rows={4}
              required
              placeholder="Justificación profesional de la conclusión…"
              value={justification}
              onChange={e => setJustification(e.target.value)}
              className={cls}
            />
            <label className="block text-xs font-medium text-gray-600 mt-3 mb-1">Próxima evaluación externa (opcional — Std. 8.4: cada 5 años)</label>
            <input type="date" value={nextDueAt} onChange={e => setNextDueAt(e.target.value)} className={cls} />
            {decide.isError && (
              <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mt-2">
                {(decide.error as Error)?.message ?? 'Error al decidir'}
              </p>
            )}
            <div className="flex gap-2 pt-4">
              <button onClick={() => setShowDecide(false)}
                className="flex-1 py-2 border border-gray-200 text-sm font-medium rounded-xl text-gray-600 hover:bg-gray-50">
                Cancelar
              </button>
              <button
                onClick={handleDecide}
                disabled={decide.isPending || !justification.trim()}
                className="flex-1 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-60"
              >
                {decide.isPending ? 'Decidiendo…' : 'Confirmar decisión'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Panel de un track (Interno o Externo) ─────────────────────────────────
function TrackPanel({ track }: { track: QaipTrack }) {
  const currentYear = String(new Date().getFullYear());
  const { data: assessments, isLoading } = useQaipAssessments(track);
  const start = useStartQaipAssessment();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const current = assessments?.find(a => a.period === currentYear);
  const selected = assessments?.find(a => a.id === selectedId) ?? current;

  if (isLoading) {
    return <div className="py-16 text-center text-sm text-gray-400">Cargando…</div>;
  }

  if (!current) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400 max-w-xl mx-auto text-center">
        <BadgeCheck className="w-12 h-12 mb-3 opacity-30" />
        <p className="text-sm font-medium text-gray-600">Aún no se ha iniciado la autoevaluación {currentYear}</p>
        <p className="text-xs mt-1">{QAIP_TRACK_LABEL[track].sub}</p>
        <button
          onClick={() => start.mutate({ track, period: currentYear })}
          disabled={start.isPending}
          className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700 disabled:opacity-60"
        >
          {start.isPending ? 'Iniciando…' : `Iniciar autoevaluación ${currentYear}`}
        </button>
        {assessments && assessments.length > 0 && (
          <div className="mt-8 w-full text-left">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Evaluaciones anteriores</p>
            <PastList assessments={assessments} onSelect={setSelectedId} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
      <aside className="space-y-1">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Períodos</p>
        {assessments?.map(a => (
          <button
            key={a.id}
            onClick={() => setSelectedId(a.id)}
            className={`w-full flex items-center justify-between text-left px-3 py-2 rounded-lg text-sm ${
              (selected?.id ?? current.id) === a.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <span>{a.period}</span>
            <span className={`w-2 h-2 rounded-full ${QAIP_RATING_CONFIG[a.overallResult].bg.replace('100', '500')}`} />
          </button>
        ))}
      </aside>
      <div>{selected && <AssessmentView assessment={selected} />}</div>
    </div>
  );
}

function PastList({ assessments, onSelect }: { assessments: QaipAssessment[]; onSelect: (id: string) => void }) {
  return (
    <div className="space-y-1">
      {assessments.map(a => (
        <button key={a.id} onClick={() => onSelect(a.id)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-gray-200 text-sm hover:bg-gray-50">
          <span className="text-gray-700">{a.period}</span>
          <span className={`text-xs font-medium ${QAIP_RATING_CONFIG[a.overallResult].color}`}>{QAIP_RATING_CONFIG[a.overallResult].label}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Independencia y Estatuto ───────────────────────────────────────────────
function GovernancePanel() {
  const { data: declarations } = useIndependenceDeclarations();
  const upsertDecl = useUpsertIndependenceDeclaration();
  const { data: charters } = useAuditCharters();
  const createCharter = useCreateAuditCharter();

  const currentYear = new Date().getFullYear();
  const currentDecl = declarations?.find(d => d.year === currentYear);
  const [declText, setDeclText] = useState(currentDecl?.declarationText ?? '');
  useEffect(() => { setDeclText(currentDecl?.declarationText ?? ''); }, [currentDecl?.id]);

  const [charterOpen, setCharterOpen] = useState(false);
  const [charterContent, setCharterContent] = useState('');
  const [charterApprovedBy, setCharterApprovedBy] = useState('');
  const [charterDate, setCharterDate] = useState('');

  const cls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl">
      <div>
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-700">Declaración de Independencia {currentYear}</h3>
        </div>
        <p className="text-xs text-gray-400 mb-3">NIGC 1 componente 3 / Ética IIA — firmada anualmente por el CAE o socio a cargo.</p>
        <textarea
          rows={6}
          value={declText}
          onChange={e => setDeclText(e.target.value)}
          placeholder="Declaro que durante el período no tuve conflictos de interés ni amenazas a mi independencia…"
          className={cls}
        />
        <button
          onClick={() => upsertDecl.mutate({ year: currentYear, declarationText: declText })}
          disabled={upsertDecl.isPending || !declText.trim()}
          className="mt-3 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-60"
        >
          {upsertDecl.isPending ? 'Guardando…' : currentDecl ? 'Actualizar declaración' : 'Firmar declaración'}
        </button>
        {currentDecl && (
          <p className="text-xs text-gray-400 mt-2">Firmada el {formatDate(currentDecl.signedAt)}</p>
        )}

        {declarations && declarations.length > 1 && (
          <div className="mt-6">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Años anteriores</p>
            <div className="space-y-1">
              {declarations.filter(d => d.year !== currentYear).map(d => (
                <div key={d.id} className="flex items-center justify-between px-3 py-2 rounded-lg border border-gray-100 text-sm text-gray-600">
                  <span>{d.year}</span>
                  <span className="text-xs text-gray-400">Firmada {formatDate(d.signedAt)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-700">Estatuto de Auditoría</h3>
        </div>
        <p className="text-xs text-gray-400 mb-3">Misión, autoridad y alcance de la función — cada aprobación crea una versión nueva.</p>

        <div className="space-y-2 mb-4">
          {charters?.map(c => (
            <div key={c.id} className="flex items-center justify-between px-3 py-2 rounded-lg border border-gray-200 text-sm">
              <div>
                <span className="font-medium text-gray-700">Versión {c.version}</span>
                <span className="text-xs text-gray-400 ml-2">Aprobado por {c.approvedBy}</span>
              </div>
              <span className="text-xs text-gray-400">Vigente desde {formatDate(c.effectiveDate)}</span>
            </div>
          ))}
          {(!charters || charters.length === 0) && (
            <p className="text-xs text-gray-400">Sin versiones aprobadas todavía.</p>
          )}
        </div>

        {!charterOpen ? (
          <button onClick={() => setCharterOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 text-sm font-medium rounded-xl text-gray-700 hover:bg-gray-50">
            <ChevronRight className="w-3.5 h-3.5" /> Aprobar nueva versión
          </button>
        ) : (
          <div className="space-y-2 border border-gray-200 rounded-xl p-4">
            <textarea rows={5} placeholder="Contenido del estatuto…" value={charterContent}
              onChange={e => setCharterContent(e.target.value)} className={cls} />
            <input placeholder="Aprobado por (ej. Junta Directiva)" value={charterApprovedBy}
              onChange={e => setCharterApprovedBy(e.target.value)} className={cls} />
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">Fecha de aprobación y vigencia</label>
              <input type="date" value={charterDate} onChange={e => setCharterDate(e.target.value)} className={cls} />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setCharterOpen(false)}
                className="flex-1 py-2 border border-gray-200 text-sm font-medium rounded-xl text-gray-600 hover:bg-gray-50">
                Cancelar
              </button>
              <button
                onClick={async () => {
                  if (!charterContent.trim() || !charterApprovedBy.trim() || !charterDate) return;
                  await createCharter.mutateAsync({
                    content: charterContent, approvedBy: charterApprovedBy,
                    approvedAt: charterDate, effectiveDate: charterDate,
                  });
                  setCharterOpen(false); setCharterContent(''); setCharterApprovedBy(''); setCharterDate('');
                }}
                disabled={createCharter.isPending}
                className="flex-1 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-60"
              >
                {createCharter.isPending ? 'Guardando…' : 'Aprobar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Hallazgos de Calidad, Causa Raíz y Desempeño (V2) ─────────────────────
function RootCauseForm({ findingId, onDone }: { findingId: string; onDone: () => void }) {
  const addRootCause = useAddQaipRootCause();
  const [category, setCategory] = useState<QaipRootCauseCategory>('COMPETENCIA');
  const [analysis, setAnalysis] = useState('');
  const cls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="bg-gray-50 rounded-xl p-3 space-y-2">
      <select value={category} onChange={e => setCategory(e.target.value as QaipRootCauseCategory)} className={cls}>
        {ROOT_CAUSE_CATEGORIES.map(c => <option key={c} value={c}>{QAIP_ROOT_CAUSE_LABEL[c]}</option>)}
      </select>
      <textarea rows={2} placeholder="Análisis: por qué ocurrió, no solo qué ocurrió"
        value={analysis} onChange={e => setAnalysis(e.target.value)} className={cls} />
      <div className="flex gap-2">
        <button
          onClick={async () => { if (!analysis.trim()) return; await addRootCause.mutateAsync({ findingId, category, analysis }); onDone(); }}
          disabled={addRootCause.isPending || !analysis.trim()}
          className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60"
        >
          {addRootCause.isPending ? 'Guardando…' : 'Guardar causa raíz'}
        </button>
        <button onClick={onDone} className="px-3 py-1.5 border border-gray-200 text-xs font-medium rounded-lg text-gray-600 hover:bg-gray-50">Cancelar</button>
      </div>
    </div>
  );
}

function RemediationForm({ findingId, onDone }: { findingId: string; onDone: () => void }) {
  const addAction = useAddQaipRemediationAction();
  const { data: users } = useOrgUsersList();
  const [description, setDescription] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const cls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="bg-gray-50 rounded-xl p-3 space-y-2">
      <textarea rows={2} placeholder="Plan de acción" value={description} onChange={e => setDescription(e.target.value)} className={cls} />
      <div className="flex gap-2">
        <select value={ownerId} onChange={e => setOwnerId(e.target.value)} className={cls}>
          <option value="">Responsable…</option>
          {users?.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={cls} />
      </div>
      <div className="flex gap-2">
        <button
          onClick={async () => { if (!description.trim() || !ownerId || !dueDate) return; await addAction.mutateAsync({ findingId, description, ownerId, dueDate }); onDone(); }}
          disabled={addAction.isPending || !description.trim() || !ownerId || !dueDate}
          className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60"
        >
          {addAction.isPending ? 'Guardando…' : 'Guardar plan de acción'}
        </button>
        <button onClick={onDone} className="px-3 py-1.5 border border-gray-200 text-xs font-medium rounded-lg text-gray-600 hover:bg-gray-50">Cancelar</button>
      </div>
    </div>
  );
}

function FindingCard({ finding }: { finding: QaipFinding }) {
  const [showRootCause, setShowRootCause] = useState(false);
  const [showRemediation, setShowRemediation] = useState(false);
  const updateStatus = useUpdateQaipFindingStatus();
  const updateAction = useUpdateQaipRemediationAction();
  const sCfg = QAIP_SEVERITY_CONFIG[finding.severity];
  const stCfg = QAIP_FINDING_STATUS_CONFIG[finding.status];

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${sCfg.bg} ${sCfg.color}`}>{sCfg.label}</span>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${stCfg.bg} ${stCfg.color}`}>{stCfg.label}</span>
            <span className="text-[11px] text-gray-400">{QAIP_TRACK_LABEL[finding.track].label} · {finding.source}</span>
          </div>
          <p className="text-sm text-gray-800">{finding.description}</p>
          {finding.assessmentItem && (
            <p className="text-xs text-gray-400 mt-1">Origen: {finding.assessmentItem.standard.code} — {finding.assessmentItem.standard.title}</p>
          )}
        </div>
        {finding.status === 'OPEN' && (
          <button onClick={() => updateStatus.mutate({ id: finding.id, status: 'CLOSED' })}
            className="text-xs text-gray-400 hover:text-gray-700 whitespace-nowrap">Cerrar sin remediar</button>
        )}
      </div>

      {finding.rootCauses.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Causa raíz</p>
          {finding.rootCauses.map(rc => (
            <div key={rc.id} className="text-xs bg-amber-50 text-amber-800 rounded-lg px-3 py-2">
              <span className="font-semibold">{QAIP_ROOT_CAUSE_LABEL[rc.category]}:</span> {rc.analysis}
            </div>
          ))}
        </div>
      )}

      {finding.remediationActions.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Plan de acción</p>
          {finding.remediationActions.map(a => {
            const overdue = a.status === 'OPEN' && new Date(a.dueDate) < new Date();
            return (
              <div key={a.id} className={`text-xs rounded-lg px-3 py-2 flex items-center justify-between gap-2 ${
                a.status === 'DONE' ? 'bg-emerald-50 text-emerald-800' : overdue ? 'bg-red-50 text-red-800' : 'bg-gray-50 text-gray-700'
              }`}>
                <span>{a.description} — {a.owner?.name ?? '—'} · {formatDate(a.dueDate)}{overdue && ' (vencido)'}</span>
                {a.status === 'OPEN' && (
                  <button onClick={() => updateAction.mutate({ id: a.id, status: 'DONE' })}
                    className="shrink-0 flex items-center gap-1 text-emerald-700 hover:text-emerald-900 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Marcar hecho
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex gap-3 pt-1">
        {!showRootCause && <button onClick={() => setShowRootCause(true)} className="text-xs font-medium text-blue-600 hover:text-blue-700">+ Causa raíz</button>}
        {!showRemediation && <button onClick={() => setShowRemediation(true)} className="text-xs font-medium text-blue-600 hover:text-blue-700">+ Plan de acción</button>}
      </div>
      {showRootCause && <RootCauseForm findingId={finding.id} onDone={() => setShowRootCause(false)} />}
      {showRemediation && <RemediationForm findingId={finding.id} onDone={() => setShowRemediation(false)} />}
    </div>
  );
}

function NewFindingModal({ onClose }: { onClose: () => void }) {
  const create = useCreateQaipFinding();
  const [track, setTrack] = useState<QaipTrack>('IIA_INTERNAL');
  const [source, setSource] = useState<QaipFindingSource>('AD_HOC');
  const [severity, setSeverity] = useState<FindingSeverity>('MEDIUM');
  const [description, setDescription] = useState('');
  const cls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6 space-y-3">
        <h2 className="text-base font-semibold text-gray-800">Nuevo Hallazgo de Calidad</h2>
        <div className="grid grid-cols-2 gap-2">
          <select value={track} onChange={e => setTrack(e.target.value as QaipTrack)} className={cls}>
            {TRACKS.map(t => <option key={t} value={t}>{QAIP_TRACK_LABEL[t].label}</option>)}
          </select>
          <select value={source} onChange={e => setSource(e.target.value as QaipFindingSource)} className={cls}>
            {FINDING_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <select value={severity} onChange={e => setSeverity(e.target.value as FindingSeverity)} className={cls}>
          {SEVERITIES.map(s => <option key={s} value={s}>{QAIP_SEVERITY_CONFIG[s].label}</option>)}
        </select>
        <textarea rows={3} placeholder="Descripción del hallazgo" value={description} onChange={e => setDescription(e.target.value)} className={cls} />
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 py-2 border border-gray-200 text-sm font-medium rounded-xl text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button
            onClick={async () => { if (!description.trim()) return; await create.mutateAsync({ track, source, severity, description }); onClose(); }}
            disabled={create.isPending || !description.trim()}
            className="flex-1 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-60"
          >
            {create.isPending ? 'Guardando…' : 'Registrar hallazgo'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PerformancePanel() {
  const currentYear = new Date().getFullYear();
  const { data: perf, isLoading } = useQaipPerformance(currentYear);
  const { data: findings } = useQaipFindings();
  const [showNew, setShowNew] = useState(false);

  if (isLoading || !perf) return <div className="py-16 text-center text-sm text-gray-400">Cargando…</div>;

  const cards = [
    { label: 'Papeles revisados antes de firmar', value: perf.engagementPerformance.reviewedPct != null ? `${perf.engagementPerformance.reviewedPct}%` : '—', sub: `${perf.engagementPerformance.totalSignedOff} firmados en ${perf.year}` },
    { label: 'Días promedio revisión → firma', value: perf.engagementPerformance.avgDaysReviewToSignOff ?? '—', sub: 'Std. 12.3 / NIGC1-C5' },
    { label: 'Cobertura Radar de Aceptación', value: perf.clientAcceptanceCoverage.coveragePct != null ? `${perf.clientAcceptanceCoverage.coveragePct}%` : '—', sub: `${perf.clientAcceptanceCoverage.withDecidedAcceptance} de ${perf.clientAcceptanceCoverage.activeClients} clientes activos — NIGC1-C4` },
    { label: 'Hallazgos de calidad abiertos', value: perf.qualityFindings.open, sub: `${perf.qualityFindings.remediated} remediados · ${perf.qualityFindings.closed} cerrados` },
    { label: 'Acciones de remediación vencidas', value: perf.qualityFindings.overdueRemediationActions, sub: 'Requieren atención' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {cards.map(c => (
          <div key={c.label} className="bg-white rounded-2xl border border-gray-200 p-4">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">{c.label}</p>
            <p className="text-2xl font-extrabold text-gray-800">{c.value}</p>
            <p className="text-[11px] text-gray-400 mt-1">{c.sub}</p>
          </div>
        ))}
      </div>

      {Object.keys(perf.qualityFindings.byRootCauseCategory).length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Causas raíz por categoría</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(perf.qualityFindings.byRootCauseCategory).map(([cat, count]) => (
              <span key={cat} className="text-xs font-medium bg-amber-50 text-amber-800 px-3 py-1.5 rounded-full">
                {QAIP_ROOT_CAUSE_LABEL[cat as QaipRootCauseCategory] ?? cat}: {count}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-gray-400" /> Hallazgos de Calidad</h3>
        <button onClick={() => setShowNew(true)} className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">
          <Plus className="w-3.5 h-3.5" /> Nuevo hallazgo
        </button>
      </div>
      <div className="space-y-3">
        {findings?.map(f => <FindingCard key={f.id} finding={f} />)}
        {findings?.length === 0 && <p className="text-sm text-gray-400 text-center py-8">Sin hallazgos de calidad registrados.</p>}
      </div>

      {showNew && <NewFindingModal onClose={() => setShowNew(false)} />}
    </div>
  );
}

// ─── Página principal ────────────────────────────────────────────────────────
export default function QaipPage() {
  const [tab, setTab] = useState<QaipTrack | 'GOVERNANCE' | 'FINDINGS'>('IIA_INTERNAL');

  const tabs: Array<{ key: QaipTrack | 'GOVERNANCE' | 'FINDINGS'; label: string }> = [
    { key: 'IIA_INTERNAL', label: QAIP_TRACK_LABEL.IIA_INTERNAL.label },
    { key: 'NIGC_EXTERNAL', label: QAIP_TRACK_LABEL.NIGC_EXTERNAL.label },
    { key: 'FINDINGS', label: 'Hallazgos y Desempeño' },
    { key: 'GOVERNANCE', label: 'Independencia y Estatuto' },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
          <BadgeCheck className="w-5 h-5 text-blue-600" /> QAIP y Calidad
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Sistema de gestión de calidad del despacho — Normas Globales del IIA (2024) para Auditoría Interna y NIGC 1/2 para Auditoría Externa/Fiscal/AML.
        </p>
      </div>

      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'GOVERNANCE' ? <GovernancePanel /> : tab === 'FINDINGS' ? <PerformancePanel /> : <TrackPanel track={tab} />}
    </div>
  );
}
