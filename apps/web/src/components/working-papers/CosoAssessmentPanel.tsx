'use client';

import { useState } from 'react';
import {
  Sparkles, Loader2, X, CheckCircle2, AlertTriangle, ShieldAlert, HelpCircle,
  ChevronDown, ChevronRight, FileDigit, Copy,
} from 'lucide-react';
import { useRunCosoAssess, type CosoMaturity, type CosoAssessment, type CosoComponent } from '@/hooks/useCosoAssessment';

// ─── Visual mapping ──────────────────────────────────────────────────────────

const MATURITY_STYLE: Record<CosoMaturity, {
  bg: string; border: string; text: string; dot: string; label: string; Icon: typeof CheckCircle2;
}> = {
  EFFECTIVE:             { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500',  label: 'Efectivo',                Icon: CheckCircle2 },
  WITH_DEFICIENCIES:     { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700',   dot: 'bg-amber-500',    label: 'Con deficiencias',        Icon: AlertTriangle },
  INEFFECTIVE:           { bg: 'bg-red-50',     border: 'border-red-200',     text: 'text-red-700',     dot: 'bg-red-500',      label: 'Inefectivo',              Icon: ShieldAlert },
  INSUFFICIENT_EVIDENCE: { bg: 'bg-gray-50',    border: 'border-gray-200',    text: 'text-gray-600',    dot: 'bg-gray-400',     label: 'Evidencia insuficiente',  Icon: HelpCircle },
};

// ─── Score ring ──────────────────────────────────────────────────────────────

function ScoreRing({ score, size = 76 }: { score: number; size?: number }) {
  const r = size * 0.38;
  const C = 2 * Math.PI * r;
  const offset = C - (score / 100) * C;
  const color = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444';
  const cx = size / 2;

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="#e5e7eb" strokeWidth="6" />
      <circle
        cx={cx} cy={cx} r={r}
        fill="none" stroke={color} strokeWidth="6"
        strokeDasharray={C} strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cx})`}
      />
      <text x={cx} y={cx + 4} textAnchor="middle" fontSize={size * 0.22} fontWeight="bold" fill="#1f2937">
        {Math.round(score)}
      </text>
      <text x={cx} y={cx + size * 0.22} textAnchor="middle" fontSize={size * 0.10} fill="#9ca3af">
        /100
      </text>
    </svg>
  );
}

// ─── Component card ──────────────────────────────────────────────────────────

function ComponentCard({ comp }: { comp: CosoComponent }) {
  const [open, setOpen] = useState(false);
  const style = MATURITY_STYLE[comp.maturity];
  const Icon = style.Icon;

  return (
    <div className={`${style.bg} ${style.border} border rounded-2xl overflow-hidden`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/40 transition-colors"
      >
        <ScoreRing score={comp.score} size={56} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-gray-500">{comp.key}</span>
            <h4 className="font-semibold text-gray-900 text-sm">{comp.name}</h4>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <Icon className={`w-3.5 h-3.5 ${style.text}`} />
            <span className={`text-xs font-medium ${style.text}`}>{style.label}</span>
          </div>
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 bg-white/30">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Narrativa</p>
            <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">{comp.narrative}</p>
          </div>

          {comp.evidence.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Evidencia</p>
              <ul className="text-xs text-gray-700 space-y-1 pl-3">
                {comp.evidence.map((e, i) => <li key={i} className="leading-relaxed">• {e}</li>)}
              </ul>
            </div>
          )}

          {comp.deficiencies.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-red-600 mb-1">Debilidades identificadas</p>
              <ul className="text-xs text-red-700 space-y-1 pl-3">
                {comp.deficiencies.map((d, i) => <li key={i} className="leading-relaxed">• {d}</li>)}
              </ul>
            </div>
          )}

          {comp.recommendations.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-violet-600 mb-1">Recomendaciones</p>
              <ul className="text-xs text-violet-700 space-y-1 pl-3">
                {comp.recommendations.map((r, i) => <li key={i} className="leading-relaxed">• {r}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Build insertable text ───────────────────────────────────────────────────

export function assessmentToText(a: CosoAssessment): string {
  const lines: string[] = [];
  lines.push('═════════ EVALUACIÓN COSO 2013 (asistida por IA) ═════════');
  lines.push(`Score global: ${a.overallScore}/100 · Madurez: ${MATURITY_STYLE[a.overallMaturity]?.label ?? a.overallMaturity}`);
  lines.push('');
  lines.push('RESUMEN EJECUTIVO');
  lines.push(a.executiveSummary);
  lines.push('');
  for (const c of a.components) {
    lines.push(`──── ${c.key} · ${c.name} ────`);
    lines.push(`Score: ${c.score}/100 · ${MATURITY_STYLE[c.maturity]?.label ?? c.maturity}`);
    lines.push(c.narrative);
    if (c.deficiencies.length) {
      lines.push('Debilidades:');
      c.deficiencies.forEach(d => lines.push(`  • ${d}`));
    }
    if (c.recommendations.length) {
      lines.push('Recomendaciones:');
      c.recommendations.forEach(r => lines.push(`  • ${r}`));
    }
    lines.push('');
  }
  lines.push('PRÓXIMOS PASOS RECOMENDADOS');
  a.nextSteps.forEach(s => lines.push(`  • ${s}`));
  return lines.join('\n');
}

// ─── Main component ──────────────────────────────────────────────────────────

interface CosoAssessmentPanelProps {
  paperId:  string;
  onClose:  () => void;
  onInsert?: (assessment: CosoAssessment) => void;
}

export function CosoAssessmentPanel({ paperId, onClose, onInsert }: CosoAssessmentPanelProps) {
  const runAssess = useRunCosoAssess();
  const [assessment, setAssessment] = useState<CosoAssessment | null>(null);
  const [error, setError]           = useState('');

  async function handleRun() {
    setError('');
    setAssessment(null);
    try {
      const res = await runAssess.mutateAsync(paperId);
      setAssessment(res.assessment);
    } catch (e) {
      setError((e as Error).message ?? 'Error al evaluar COSO');
    }
  }

  async function handleCopy() {
    if (!assessment) return;
    await navigator.clipboard.writeText(assessmentToText(assessment));
  }

  function handleInsert() {
    if (!assessment || !onInsert) return;
    onInsert(assessment);
    onClose();
  }

  const principlesByComponent = assessment
    ? assessment.components.map(c => ({
        component: c,
        principles: assessment.principles.filter(p => p.componentKey === c.key),
      }))
    : [];

  const overallStyle = assessment ? MATURITY_STYLE[assessment.overallMaturity] : null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Evaluación COSO 2013</h2>
              <p className="text-xs text-gray-500">5 componentes · 17 principios · asistida por IA (Minerva)</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">

          {/* ── Empty state / run button ── */}
          {!assessment && !runAssess.isPending && (
            <div className="text-center py-8 space-y-4">
              <p className="text-sm text-gray-600 max-w-xl mx-auto">
                El agente <strong>Minerva</strong> leerá el contexto del expediente
                (PT-A1 entendimiento, PT-A2 riesgos, PT-A3 controles, hallazgos previos)
                y propondrá una valoración estructurada de los 5 componentes y 17 principios COSO 2013.
                Tú revisas, ajustas y apruebas.
              </p>
              <button
                onClick={handleRun}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white font-semibold rounded-xl hover:bg-violet-700 transition-colors"
              >
                <Sparkles className="w-4 h-4" />
                Generar evaluación COSO con IA
              </button>
              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>
          )}

          {/* ── Loading ── */}
          {runAssess.isPending && (
            <div className="flex flex-col items-center py-14 gap-4">
              <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
              <div className="text-center">
                <p className="text-sm text-violet-700 font-semibold">Minerva está evaluando los 5 componentes…</p>
                <p className="text-xs text-gray-400 mt-1">Analizando expediente · esto puede tomar 30-60 segundos</p>
              </div>
            </div>
          )}

          {/* ── Assessment result ── */}
          {assessment && overallStyle && (
            <>
              {/* Overall summary */}
              <div className={`${overallStyle.bg} ${overallStyle.border} border-2 rounded-2xl p-5`}>
                <div className="flex items-start gap-5">
                  <ScoreRing score={assessment.overallScore} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <overallStyle.Icon className={`w-5 h-5 ${overallStyle.text}`} />
                      <h3 className={`text-lg font-bold ${overallStyle.text}`}>{overallStyle.label}</h3>
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                      {assessment.executiveSummary}
                    </p>
                  </div>
                </div>
              </div>

              {/* Components */}
              <div>
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">5 Componentes</h4>
                <div className="space-y-2">
                  {assessment.components.map(c => (
                    <ComponentCard key={c.key} comp={c} />
                  ))}
                </div>
              </div>

              {/* 17 Principles */}
              <div>
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">17 Principios</h4>
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600 w-12">P</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600 w-14">Comp.</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Justificación</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600 w-24">Fuente</th>
                        <th className="px-3 py-2 text-center font-semibold text-gray-600 w-32">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {principlesByComponent.flatMap(({ principles }) =>
                        principles.map(p => {
                          const ps = MATURITY_STYLE[p.status];
                          return (
                            <tr key={p.id} className="border-t border-gray-100">
                              <td className="px-3 py-2 font-mono font-bold text-gray-800">{p.id}</td>
                              <td className="px-3 py-2 font-mono text-gray-500">{p.componentKey}</td>
                              <td className="px-3 py-2 text-gray-700 leading-relaxed">{p.justification}</td>
                              <td className="px-3 py-2 text-gray-500 font-mono text-[10px]">{p.evidenceRef}</td>
                              <td className="px-3 py-2 text-center">
                                <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${ps.bg} ${ps.text} border ${ps.border}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${ps.dot}`} />
                                  {ps.label}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Next steps */}
              {assessment.nextSteps.length > 0 && (
                <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4">
                  <h4 className="text-xs font-bold text-violet-700 uppercase tracking-wide mb-2">Próximos pasos recomendados</h4>
                  <ul className="space-y-1.5">
                    {assessment.nextSteps.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-violet-900">
                        <span className="font-bold text-violet-600 mt-0.5">{i + 1}.</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50"
                >
                  <Copy className="w-3 h-3" /> Copiar texto
                </button>
                {onInsert && (
                  <button
                    onClick={handleInsert}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-violet-600 text-white text-xs font-semibold rounded-lg hover:bg-violet-700"
                  >
                    <FileDigit className="w-3 h-3" /> Insertar en el papel
                  </button>
                )}
                <button
                  onClick={handleRun}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-violet-200 text-violet-700 text-xs font-medium rounded-lg hover:bg-violet-50"
                >
                  <Sparkles className="w-3 h-3" /> Re-evaluar
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
