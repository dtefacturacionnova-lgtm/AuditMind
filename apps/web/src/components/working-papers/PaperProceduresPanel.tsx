'use client';

import { ListChecks, Trash2, Loader2 } from 'lucide-react';
import { useRemoveProcedure } from '@/hooks/useWorkingPaperGraph';

export interface AppliedProcedure {
  id:        string;
  area:      string;
  procedure: string;
  niaRef?:   string;
  addedAt:   string;
}

interface PaperProceduresPanelProps {
  paperId:    string;
  procedures: AppliedProcedure[];
  readonly?:  boolean;
}

/**
 * Muestra los procedimientos agregados al papel (content.procedures[]),
 * típicamente desde las Sugerencias por Aprendizaje Cruzado.
 */
export function PaperProceduresPanel({ paperId, procedures, readonly = false }: PaperProceduresPanelProps) {
  const remove = useRemoveProcedure();

  if (!procedures || procedures.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
      <div className="flex items-center gap-2 p-4 border-b border-gray-100">
        <ListChecks className="w-4 h-4 text-emerald-600" />
        <p className="text-sm font-semibold text-gray-800">
          Procedimientos del Papel
          <span className="ml-2 text-xs font-normal text-gray-400">({procedures.length})</span>
        </p>
      </div>

      <div className="p-4 space-y-2">
        {procedures.map((p, i) => (
          <div
            key={p.id}
            className="flex items-start gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-gray-50 transition-colors"
          >
            <span className="shrink-0 w-6 h-6 rounded-lg bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center mt-0.5">
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-gray-600">{p.area}</span>
                {p.niaRef && (
                  <span className="text-[10px] font-mono text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
                    {p.niaRef}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-800 mt-0.5 leading-relaxed">{p.procedure}</p>
            </div>
            {!readonly && (
              <button
                onClick={() => remove.mutate({ paperId, procedureId: p.id })}
                disabled={remove.isPending}
                className="shrink-0 p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                title="Quitar procedimiento"
              >
                {remove.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
