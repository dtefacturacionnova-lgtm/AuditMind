'use client';

import { useState } from 'react';
import { Sparkles, Loader2, CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronUp, ShieldCheck } from 'lucide-react';
import { useQualityCheck, type QualityCheckResult, type QualityLevel } from '@/hooks/useWorkingPaperGraph';

// ─── Level display config ─────────────────────────────────────────────────────

const LEVEL_CONFIG: Record<QualityLevel, { label: string; color: string; bg: string; border: string; icon: React.ElementType }> = {
  EXCELENTE:    { label: 'Excelente',    color: 'text-emerald-700', bg: 'bg-emerald-50',  border: 'border-emerald-200', icon: CheckCircle2 },
  BUENA:        { label: 'Buena',        color: 'text-blue-700',    bg: 'bg-blue-50',     border: 'border-blue-200',    icon: ShieldCheck },
  ACEPTABLE:    { label: 'Aceptable',    color: 'text-amber-700',   bg: 'bg-amber-50',    border: 'border-amber-200',   icon: AlertTriangle },
  INSUFICIENTE: { label: 'Insuficiente', color: 'text-red-700',     bg: 'bg-red-50',      border: 'border-red-200',     icon: XCircle },
};

// ─── Score ring ───────────────────────────────────────────────────────────────

function ScoreRing({ score, level }: { score: number; level: QualityLevel }) {
  const cfg   = LEVEL_CONFIG[level];
  const size  = 80;
  const r     = 32;
  const circ  = 2 * Math.PI * r;
  const dash  = circ * (score / 100);

  const strokeColor =
    level === 'EXCELENTE'    ? '#10b981' :
    level === 'BUENA'        ? '#3b82f6' :
    level === 'ACEPTABLE'    ? '#f59e0b' :
                               '#ef4444';

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#e5e7eb" strokeWidth="8" fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={strokeColor} strokeWidth="8" fill="none"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-lg font-bold ${cfg.color}`}>{score}</span>
        <span className="text-[9px] text-gray-400 uppercase">/ 100</span>
      </div>
    </div>
  );
}

// ─── Issue row ────────────────────────────────────────────────────────────────

function IssueRow({ issue }: { issue: QualityCheckResult['issues'][0] }) {
  const isError = issue.severity === 'ERROR';
  return (
    <div className={`flex items-start gap-2.5 rounded-lg p-3 text-sm ${
      isError ? 'bg-red-50 border border-red-100' : 'bg-amber-50 border border-amber-100'
    }`}>
      {isError
        ? <XCircle    className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
        : <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
      }
      <div>
        <p className={`text-xs font-semibold ${isError ? 'text-red-700' : 'text-amber-700'}`}>
          {issue.label} — {issue.type}
        </p>
        <p className={`text-xs mt-0.5 ${isError ? 'text-red-600' : 'text-amber-600'}`}>{issue.message}</p>
      </div>
    </div>
  );
}

// ─── QualityGatePanel ─────────────────────────────────────────────────────────

interface QualityGatePanelProps {
  paperId:      string;
  existingScore?: number;
}

export function QualityGatePanel({ paperId, existingScore }: QualityGatePanelProps) {
  const [result, setResult]     = useState<QualityCheckResult | null>(null);
  const [expanded, setExpanded] = useState(false);
  const check = useQualityCheck();

  async function handleCheck() {
    const res = await check.mutateAsync(paperId);
    setResult({ ...res, paperId });
    setExpanded(true);
  }

  const displayScore = result?.score ?? existingScore;
  const displayLevel = result?.level ?? (
    displayScore !== undefined
      ? displayScore >= 90 ? 'EXCELENTE'
      : displayScore >= 75 ? 'BUENA'
      : displayScore >= 50 ? 'ACEPTABLE'
      : 'INSUFICIENTE'
      : undefined
  );

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-violet-600" />
          <p className="text-sm font-semibold text-gray-800">Gate de Calidad Semántica</p>
          {result?.aiGenerated && (
            <span className="text-[10px] text-violet-600 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full flex items-center gap-1">
              <Sparkles className="w-2.5 h-2.5" /> IA
            </span>
          )}
        </div>
        <button
          onClick={handleCheck}
          disabled={check.isPending}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-violet-600 rounded-xl hover:bg-violet-700 disabled:opacity-50 transition-colors"
        >
          {check.isPending ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analizando…</>
          ) : (
            <><Sparkles className="w-3.5 h-3.5" /> {result ? 'Re-analizar' : 'Analizar calidad'}</>
          )}
        </button>
      </div>

      {/* Score summary */}
      {displayScore !== undefined && displayLevel && (
        <div className="p-4">
          <div className="flex items-center gap-5">
            <ScoreRing score={displayScore} level={displayLevel} />
            <div className="flex-1">
              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold mb-2 ${LEVEL_CONFIG[displayLevel].bg} ${LEVEL_CONFIG[displayLevel].color} ${LEVEL_CONFIG[displayLevel].border} border`}>
                {(() => { const Icon = LEVEL_CONFIG[displayLevel].icon; return <Icon className="w-3 h-3" />; })()}
                Calidad {LEVEL_CONFIG[displayLevel].label}
              </div>
              {result?.recommendation && (
                <p className="text-xs text-gray-600 leading-relaxed">{result.recommendation}</p>
              )}
            </div>
          </div>

          {/* Strengths */}
          {result?.strengths && result.strengths.length > 0 && (
            <div className="mt-3 space-y-1">
              {result.strengths.map((s, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-emerald-700">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-500" />
                  {s}
                </div>
              ))}
            </div>
          )}

          {/* Issues toggle */}
          {result?.issues && result.issues.length > 0 && (
            <div className="mt-3">
              <button
                onClick={() => setExpanded(e => !e)}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 font-medium"
              >
                {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                {result.issues.length} observación{result.issues.length !== 1 ? 'es' : ''} encontrada{result.issues.length !== 1 ? 's' : ''}
              </button>

              {expanded && (
                <div className="mt-2 space-y-2">
                  {result.issues.map((issue, i) => (
                    <IssueRow key={i} issue={issue} />
                  ))}
                </div>
              )}
            </div>
          )}

          {result && result.issues.length === 0 && (
            <div className="mt-3 flex items-center gap-2 text-xs text-emerald-600">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Sin observaciones de calidad detectadas.
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {displayScore === undefined && !check.isPending && (
        <div className="p-6 text-center">
          <p className="text-sm text-gray-400">
            Haz clic en &ldquo;Analizar calidad&rdquo; para obtener un análisis semántico IA de este papel.
          </p>
        </div>
      )}

      {check.isPending && (
        <div className="p-6 flex flex-col items-center gap-3">
          <div className="flex gap-1.5">
            {[0,1,2].map(i => (
              <div key={i} className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: `${i*100}ms` }} />
            ))}
          </div>
          <p className="text-xs text-violet-600">La IA está evaluando la coherencia y profundidad del papel…</p>
        </div>
      )}
    </div>
  );
}
