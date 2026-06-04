'use client';

import { useState, type MouseEvent } from 'react';
import {
  Sparkles, Loader2, ChevronDown, ChevronUp, BookMarked,
  TrendingUp, Lightbulb, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import {
  useAiSuggestions,
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
}: {
  suggestion: AiProcedureSuggestion;
  onApply?:   (procedure: string, area: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [applied, setApplied] = useState(false);
  const pCfg = PRIORITY_CONFIG[suggestion.priority];

  async function handleApply(e: MouseEvent) {
    e.stopPropagation();
    const text = `[${suggestion.area}${suggestion.niaRef ? ` · ${suggestion.niaRef}` : ''}]\n${suggestion.procedure}`;
    // If a parent provided onApply, use it; otherwise copy to clipboard
    if (onApply) {
      onApply(suggestion.procedure, suggestion.area);
    } else {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        /* clipboard may be blocked — still show feedback */
      }
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

          {/* Source */}
          <p className="text-[10px] text-gray-400 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            Basado en: {suggestion.basedOn}
          </p>

          {/* Apply button */}
          <button
            onClick={handleApply}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              applied
                ? 'text-emerald-700 bg-emerald-50 border border-emerald-200'
                : 'text-white bg-violet-600 hover:bg-violet-700'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            {applied ? '✓ Copiado al portapapeles' : 'Aplicar al programa'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── CrossAuditSuggestions ────────────────────────────────────────────────────

interface CrossAuditSuggestionsProps {
  auditId:  string;
  onApply?: (procedure: string, area: string) => void;
}

export function CrossAuditSuggestions({ auditId, onApply }: CrossAuditSuggestionsProps) {
  const [result, setResult]     = useState<CrossAuditSuggestionsResult | null>(null);
  const [filterPriority, setFilter] = useState<SuggestionPriority | 'ALL'>('ALL');
  const generate = useAiSuggestions();

  async function handleGenerate() {
    const res = await generate.mutateAsync(auditId);
    setResult(res);
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
                {result.aiGenerated && <span className="text-violet-500 ml-1.5">· IA</span>}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={handleGenerate}
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
                onApply={onApply}
              />
            ))}
          </div>
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
            La IA analiza los hallazgos de auditorías anteriores de la misma entidad para sugerir procedimientos relevantes.
          </p>
        </div>
      )}
    </div>
  );
}
