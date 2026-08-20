'use client';

import { useRouter } from 'next/navigation';
import {
  X, Loader2, ExternalLink, AlertTriangle, ArrowRight,
  Target, GitBranch, ShieldCheck, ClipboardCheck, TrendingDown, FileWarning, Workflow,
} from 'lucide-react';
import {
  useRiskTrace, type RiskTraceAnchor, type RiskTraceBlock, type ControlInternoStageKey,
} from '@/hooks/useControlInterno';

const STAGE_ICON: Record<ControlInternoStageKey, React.ElementType> = {
  IDENTIFICACION: Target, RMM: GitBranch, CONTROL: ShieldCheck, PRUEBA: ClipboardCheck,
  RESIDUAL: TrendingDown, DEFICIENCIA: FileWarning, CONCLUSION: FileWarning,
};

const MATCH_BASIS_LABEL: Record<string, string> = {
  AREA: 'Coincide por área', DESCRIPCION: 'Coincide por descripción',
  PAPEL_COMPLETO: 'Papel completo del ciclo', NODO: 'Nodo del flujograma',
};

function RowTable({ rows }: { rows: Record<string, unknown>[] }) {
  if (rows.length === 0) return null;
  const cols = [...new Set(rows.flatMap(r => Object.keys(r)))].slice(0, 6);
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-100">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="bg-gray-50 text-gray-500">
            {cols.map(c => <th key={c} className="px-2 py-1.5 text-left font-medium whitespace-nowrap">{c}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map((r, i) => (
            <tr key={i}>
              {cols.map(c => (
                <td key={c} className="px-2 py-1.5 text-gray-700 align-top max-w-[220px]">
                  <span className="line-clamp-3">{String(r[c] ?? '—')}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BlockCard({ block, onOpenPaper }: { block: RiskTraceBlock; onOpenPaper: (paperId: string) => void }) {
  const Icon = STAGE_ICON[block.kind] ?? Target;
  const totalRows = block.sections.reduce((n, s) => n + s.rows.length, 0);

  return (
    <div className={`rounded-xl border p-3 ${block.available ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50/60'}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={`w-4 h-4 shrink-0 ${block.available ? 'text-indigo-600' : 'text-gray-300'}`} />
          <p className="text-xs font-semibold text-gray-800 truncate">{block.title}</p>
        </div>
        {block.available && block.paperId && (
          <button
            onClick={() => onOpenPaper(block.paperId!)}
            className="flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-800 shrink-0"
            title="Ir al papel"
          >
            {block.wpCode} <ExternalLink className="w-3 h-3" />
          </button>
        )}
      </div>

      {!block.available && (
        <p className="text-[11px] text-gray-400 italic">
          {block.paperCode} no está sembrado en este encargo — no aplica o falta crearlo.
        </p>
      )}

      {block.available && totalRows === 0 && (
        <p className="text-[11px] text-gray-400 italic">Sin filas coincidentes en {block.paperCode} para este riesgo/área.</p>
      )}

      {block.sections.map(sec => (
        <div key={sec.sectionKey} className="mt-1.5 first:mt-0">
          <p className="text-[10px] text-gray-400 mb-1">
            {sec.sectionLabel} · <span className="italic">{MATCH_BASIS_LABEL[sec.matchBasis] ?? sec.matchBasis}</span>
          </p>
          <RowTable rows={sec.rows} />
        </div>
      ))}
    </div>
  );
}

export function RiskTraceDrawer({ auditId, anchor, onClose }: {
  auditId: string;
  anchor: RiskTraceAnchor;
  onClose: () => void;
}) {
  const router = useRouter();
  const { data: trace, isLoading, isError } = useRiskTrace(auditId, anchor);

  function openPaper(paperId: string) {
    router.push(`/dashboard/working-papers/${paperId}`);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="h-full w-full max-w-2xl bg-[#F8FAFC] shadow-2xl overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-4 bg-white border-b border-gray-200">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-indigo-500 uppercase tracking-wide">Ficha de Riesgo</p>
            <p className="text-sm font-semibold text-gray-900 truncate">{trace?.anchor.riskLabel ?? '…'}</p>
            {trace?.anchor.area && (
              <p className="text-[11px] text-gray-400 truncate">Área: {trace.anchor.area}</p>
            )}
          </div>
          <button onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {isLoading && (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          )}

          {isError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-xs">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              No se pudo cargar la traza de este riesgo.
            </div>
          )}

          {trace && (
            <>
              {trace.blocks.map((block, i) => (
                <div key={`${block.kind}-${block.paperCode ?? i}`} className="relative">
                  <BlockCard block={block} onOpenPaper={openPaper} />
                  {i < trace.blocks.length - 1 && (
                    <div className="flex justify-center py-0.5">
                      <ArrowRight className="w-3.5 h-3.5 text-gray-300 rotate-90" />
                    </div>
                  )}
                </div>
              ))}

              {trace.flowNodes.length > 0 && (
                <div className="rounded-xl border border-gray-200 bg-white p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Workflow className="w-4 h-4 text-indigo-600" />
                    <p className="text-xs font-semibold text-gray-800">Nodos del Flujograma</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {trace.flowNodes.map((n, i) => (
                      <button
                        key={i}
                        onClick={() => openPaper(n.paperId)}
                        className="px-2 py-1 rounded-full text-[11px] font-medium bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100"
                      >
                        {n.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
