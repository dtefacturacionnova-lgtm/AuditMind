'use client';

import { useState, type MouseEvent } from 'react';
import {
  Sparkles, Loader2, ChevronDown, ChevronUp, BookMarked,
  TrendingUp, Lightbulb, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import {
  useAiSuggestions,
  useAppendProcedure,
  type CrossAuditSuggestionsResult,
  type AiProcedureSuggestion,
  type SuggestionPriority,
} from '@/hooks/useWorkingPaperGraph';

// ─── Priority config ──────────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<SuggestionPriority, { label: string; color: string; bg: string; border: string }> = {
  HIGH:   { label: 'Alta',  color: 'text-red-700',   bg: 'bg-red-50',   border: 'border-red-200' },
  MEDIUM: { label: 'Media', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
  LOW:    { label: 'Baja',  color: 'text-gray-600',  bg: 'bg-gray-50',  border: 'border-gray-200' },
};

// ─── Suggestion card ──────────────────────────────────────────────────────────

function SuggestionCard({
  suggestion,
  onApply,
  canApplyToPaper,
}: {
  suggestion: AiProcedureSuggestion;
  onApply:    (suggestion: AiProcedureSuggestion) => Promise<void> | void;
  canApplyToPaper: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [applied, setApplied] = useState(false);
  const [busy, setBusy] = useState(false);
  const pCfg = PRIORITY_CONFIG[suggestion.priority];

  async function handleApply(e: MouseEvent) {
    e.stopPropagation();
    setBusy(true);
    try {
      await onApply(suggestion);
    } finally {
      setBusy(false);
    }
    setApplied(true);
    setTimeout(() => setApplied(false), 2500);
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div
        className="flex items-start justify-between gap-3 p-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-start gap-2.5 flex-1 min-w-0">
          <div className={`mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${pCfg.bg} ${pCfg.color} ${pCfg.border} border`}>
            {pCfg.label}
          </div>
          {suggestion.source === 'LIBRARY' && (
            <div
              title={suggestion.origin === 'OWN'
                ? 'Procedimiento que tu organización agregó a la biblioteca de este papel: no gastó IA y trae un desarrollo modelo'
                : suggestion.origin === 'EDITED'
                  ? 'Procedimiento de la biblioteca de este papel, ajustado por tu organización: no gastó IA y trae un desarrollo modelo'
                  : 'Procedimiento curado de la biblioteca de este papel: no gastó IA y trae un desarrollo modelo'}
              className={`mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold shrink-0 border ${
                suggestion.origin === 'OWN' || suggestion.origin === 'EDITED'
                  ? 'bg-violet-50 text-violet-700 border-violet-200'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}>
              {suggestion.origin === 'OWN' || suggestion.origin === 'EDITED' ? 'Tu biblioteca' : 'Biblioteca'}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-xs font-semibold text-gray-600 truncate">{suggestion.area}</p>
            <p className="text-sm text-gray-800 mt-0.5 line-clamp-2">{suggestion.procedure}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {suggestion.niaRef && (
            <span className="text-[10px] text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded font-mono">
              {suggestion.niaRef}
            </span>
          )}
          {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </div>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
          {/* Rationale */}
          <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-lg p-3">
            <Lightbulb className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700">{suggestion.rationale}</p>
          </div>

          {suggestion.development && (
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3">
              <p className="text-[10px] font-semibold uppercase text-emerald-700 mb-1">Desarrollo modelo (completa los [corchetes])</p>
              <p className="text-xs text-gray-700 whitespace-pre-line">{suggestion.development}</p>
            </div>
          )}

          {/* Source */}
          <p className="text-[10px] text-gray-400 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            Basado en: {suggestion.basedOn}
          </p>

          {/* Apply button */}
          <button
            onClick={handleApply}
            disabled={busy}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors disabled:opacity-60 ${
              applied
                ? 'text-emerald-700 bg-emerald-50 border border-emerald-200'
                : 'text-white bg-violet-600 hover:bg-violet-700'
            }`}
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            {applied
              ? (canApplyToPaper ? '✓ Agregado al papel' : '✓ Copiado')
              : (canApplyToPaper ? 'Aplicar al papel' : 'Copiar procedimiento')}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── CrossAuditSuggestions ────────────────────────────────────────────────────

interface CrossAuditSuggestionsProps {
  auditId:  string;
  paperId?: string;
  onApply?: (procedure: string, area: string) => void;
}

export function CrossAuditSuggestions({ auditId, paperId, onApply }: CrossAuditSuggestionsProps) {
  const [result, setResult]     = useState<CrossAuditSuggestionsResult | null>(null);
  const [filterPriority, setFilter] = useState<SuggestionPriority | 'ALL'>('ALL');
  const generate = useAiSuggestions();
  const append   = useAppendProcedure();

  async function handleGenerate(expand = false) {
    const res = await generate.mutateAsync({ auditId, paperId, expand });
    setResult(res);
  }

  // Aplicar = agregar al papel actual (si hay paperId) o delegar al padre
  async function handleApplyToPaper(sug: AiProcedureSuggestion) {
    if (onApply) {
      onApply(sug.procedure, sug.area);
      return;
    }
    if (paperId) {
      // Los de biblioteca se aplican completos (título, enunciado y desarrollo modelo); los de IA, como siempre.
      await append.mutateAsync(sug.source === 'LIBRARY'
        ? { paperId, title: sug.title, statement: sug.statement, development: sug.development, area: sug.area, niaRef: sug.niaRef }
        : { paperId, procedure: sug.procedure, area: sug.area, niaRef: sug.niaRef });
    }
  }

  const filtered = result?.suggestions.filter(
    s => filterPriority === 'ALL' || s.priority === filterPriority
  ) ?? [];

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <BookMarked className="w-4 h-4 text-violet-600" />
          <div>
            <p className="text-sm font-semibold text-gray-800">Sugerencias por Aprendizaje Cruzado</p>
            {result && (
              <p className="text-[10px] text-gray-400">
                {result.basedOnAudits} auditoría(s) anterior(es) · {result.totalFindings} hallazgo(s) analizados
                {!!result.libraryCount && <span className="text-emerald-600 ml-1.5">· {result.libraryCount} de la biblioteca</span>}
                {result.aiGenerated && <span className="text-violet-500 ml-1.5">· IA</span>}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={() => handleGenerate(false)}
          disabled={generate.isPending}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-violet-600 rounded-xl hover:bg-violet-700 disabled:opacity-50 transition-colors"
        >
          {generate.isPending ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analizando…</>
          ) : (
            <><Sparkles className="w-3.5 h-3.5" /> {result ? 'Regenerar' : 'Generar sugerencias'}</>
          )}
        </button>
      </div>

      {/* Aviso: sin contexto suficiente / la IA no respondió (no se rellena con sugerencias genéricas) */}
      {result?.notice && (
        <div role="status" className="mx-4 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
          {result.notice}
        </div>
      )}

      {/* Recurring areas */}
      {result?.recurringAreas && result.recurringAreas.length > 0 && (
        <div className="px-4 pt-4 pb-1">
          <p className="text-[10px] text-gray-400 uppercase font-medium mb-2">Áreas con hallazgos recurrentes</p>
          <div className="flex flex-wrap gap-1.5">
            {result.recurringAreas.map(area => (
              <span key={area} className="text-xs bg-amber-50 border border-amber-200 text-amber-700 px-2.5 py-1 rounded-full flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {area}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filter + list */}
      {result && result.suggestions.length > 0 && (
        <div className="p-4 space-y-3">
          {/* Priority filter */}
          <div className="flex gap-1.5">
            {(['ALL', 'HIGH', 'MEDIUM', 'LOW'] as const).map(p => (
              <button
                key={p}
                onClick={() => setFilter(p)}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                  filterPriority === p
                    ? 'bg-violet-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {p === 'ALL' ? 'Todos' : PRIORITY_CONFIG[p].label}
                {p !== 'ALL' && (
                  <span className="ml-1.5 text-[10px] opacity-70">
                    ({result.suggestions.filter(s => s.priority === p).length})
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Suggestion cards */}
          <div className="space-y-2">
            {filtered.map(sug => (
              <SuggestionCard
                key={sug.id}
                suggestion={sug}
                canApplyToPaper={!!paperId || !!onApply}
                onApply={async (sg) => {
                  if (onApply || paperId) {
                    await handleApplyToPaper(sg);
                  } else {
                    // Sin papel ni handler → fallback clipboard
                    const text = `[${sg.area}${sg.niaRef ? ` · ${sg.niaRef}` : ''}]\n${sg.procedure}`;
                    try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
                  }
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Ampliar con IA: solo cuando el papel tiene biblioteca; la IA recibe lo ya sugerido y propone otros */}
      {result?.canExpand && !generate.isPending && (
        <div className="px-4 pb-4 -mt-1 flex items-center gap-3">
          <button
            onClick={() => handleGenerate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-violet-700 bg-violet-50 border border-violet-200 rounded-lg hover:bg-violet-100 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" /> Ampliar con IA
          </button>
          <p className="text-[11px] text-gray-400">La IA propone otros procedimientos, sin repetir los de la biblioteca (gasta IA).</p>
        </div>
      )}

      {/* Loading */}
      {generate.isPending && (
        <div className="p-8 flex flex-col items-center gap-3">
          <div className="flex gap-1.5">
            {[0,1,2,3].map(i => (
              <div key={i} className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: `${i*100}ms` }} />
            ))}
          </div>
          <p className="text-xs text-violet-600 text-center">
            Analizando historial de hallazgos de la entidad y generando procedimientos con IA…
          </p>
        </div>
      )}

      {/* Empty state */}
      {!result && !generate.isPending && (
        <div className="p-8 text-center">
          <div className="w-12 h-12 rounded-2xl bg-violet-50 border border-violet-200 flex items-center justify-center mx-auto mb-3">
            <BookMarked className="w-6 h-6 text-violet-300" />
          </div>
          <p className="text-sm font-medium text-gray-600 mb-1">
            Aprende de la historia de auditorías
          </p>
          <p className="text-xs text-gray-400 max-w-xs mx-auto">
            Si el papel tiene biblioteca, se muestra primero (sin gastar IA). Si no, la IA analiza el papel y los hallazgos de auditorías anteriores de la misma entidad.
          </p>
        </div>
      )}
    </div>
  );
}
