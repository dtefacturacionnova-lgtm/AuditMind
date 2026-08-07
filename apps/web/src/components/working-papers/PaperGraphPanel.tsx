'use client';

import { useRouter } from 'next/navigation';
import {
  Loader2, ArrowUpCircle, ArrowDownCircle,
  CheckCircle2, AlertTriangle, Clock, RefreshCw,
  ArrowRight, Zap, Layers, BrainCircuit, ExternalLink,
} from 'lucide-react';
import { usePaperGraph } from '@/hooks/useWorkingPaperGraph';
import type { WpRef } from '@/hooks/useWorkingPaperGraph';

// ─── Sync status ───────────────────────────────────────────────────────────────

function SyncIcon({ status }: { status: string }) {
  switch (status) {
    case 'SYNCED':       return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />;
    case 'STALE':        return <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />;
    case 'REGENERATING': return <RefreshCw    className="w-3.5 h-3.5 text-blue-500 shrink-0 animate-spin" />;
    default:             return <Clock        className="w-3.5 h-3.5 text-gray-400 shrink-0" />;
  }
}

function syncStatusLabel(status: string): string {
  switch (status) {
    case 'SYNCED':       return 'Al día';
    case 'STALE':        return 'Desactualizado';
    case 'REGENERATING': return 'Consolidando…';
    default:             return 'Borrador';
  }
}

// ─── Mapping type badge ────────────────────────────────────────────────────────

function MappingBadge({ type }: { type?: string }) {
  switch (type) {
    case 'DIRECT':
      return (
        <span className="inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200 shrink-0" title="Enlace directo — los datos fluyen sin transformación">
          <ArrowRight className="w-2.5 h-2.5" />
          DIRECTO
        </span>
      );
    case 'AGGREGATED':
      return (
        <span className="inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 shrink-0" title="Enlace agregado — los datos se consolidan antes de fluir">
          <Layers className="w-2.5 h-2.5" />
          AGREGADO
        </span>
      );
    case 'AI_GENERATED':
      return (
        <span className="inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 shrink-0" title="Enlace IA — los datos son interpretados y redactados por el agente IA">
          <BrainCircuit className="w-2.5 h-2.5" />
          IA
        </span>
      );
    default:
      return null;
  }
}

// ─── Kind badge ────────────────────────────────────────────────────────────────

function kindBadgeClass(wpKind: string): string {
  switch (wpKind) {
    case 'SMART':  return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'MASTER': return 'bg-purple-50 text-purple-700 border-purple-200';
    case 'LIVE':   return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    default:       return 'bg-gray-50 text-gray-600 border-gray-200';
  }
}

// ─── WpRef row ────────────────────────────────────────────────────────────────

function WpRefRow({
  ref: wp,
  direction,
  onClick,
}: {
  ref:       WpRef;
  direction: 'source' | 'target';
  onClick:   () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex flex-col gap-1.5 px-3 py-2.5 rounded-xl hover:bg-gray-50 text-left transition-colors group border border-transparent hover:border-gray-100"
    >
      {/* Top row: code + title + sync */}
      <div className="flex items-center gap-2.5 w-full">
        <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border shrink-0 ${kindBadgeClass(wp.wpKind)}`}>
          {wp.code}
        </span>
        <span className="flex-1 text-xs text-gray-700 truncate group-hover:text-gray-900 font-medium">
          {wp.title}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <SyncIcon status={wp.syncStatus} />
          <span className="text-[10px] text-gray-400">{syncStatusLabel(wp.syncStatus)}</span>
        </div>
        <ExternalLink className="w-3 h-3 text-gray-300 group-hover:text-blue-400 shrink-0 transition-colors" />
      </div>

      {/* Bottom row: field mapping + mapping type */}
      {(wp.sourceField || wp.targetField || wp.mappingType) && (
        <div className="flex items-center gap-2 pl-0.5">
          {wp.sourceField && wp.targetField && (
            <div className="flex items-center gap-1 text-[10px] font-mono text-gray-400">
              {direction === 'source' ? (
                <>
                  <span className="bg-gray-100 px-1 py-0.5 rounded text-gray-500">{wp.sourceField}</span>
                  <ArrowRight className="w-2.5 h-2.5 text-gray-300" />
                  <span className="bg-blue-50 px-1 py-0.5 rounded text-blue-500">este papel</span>
                </>
              ) : (
                <>
                  <span className="bg-blue-50 px-1 py-0.5 rounded text-blue-500">este papel</span>
                  <ArrowRight className="w-2.5 h-2.5 text-gray-300" />
                  <span className="bg-gray-100 px-1 py-0.5 rounded text-gray-500">{wp.targetField}</span>
                </>
              )}
            </div>
          )}
          <MappingBadge type={wp.mappingType} />
          {wp.description && (
            <span className="text-[10px] text-gray-400 italic truncate flex-1">
              {wp.description}
            </span>
          )}
        </div>
      )}
    </button>
  );
}

// ─── PaperGraphPanel ──────────────────────────────────────────────────────────

interface PaperGraphPanelProps {
  paperId: string;
}

export function PaperGraphPanel({ paperId }: PaperGraphPanelProps) {
  const router = useRouter();
  const { data, isLoading, error } = usePaperGraph(paperId);

  function navigateTo(id: string) {
    router.push(`/dashboard/working-papers/${id}`);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-red-500">Error al cargar el grafo: {(error as Error).message}</p>
      </div>
    );
  }

  const sources = data?.sources ?? [];
  const targets = data?.targets ?? [];
  const hasConnections = sources.length > 0 || targets.length > 0;

  if (!hasConnections) {
    return (
      <div className="flex flex-col items-center py-16 gap-3 bg-white rounded-2xl border border-gray-200 shadow-sm text-center">
        <div className="w-12 h-12 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center">
          <ArrowUpCircle className="w-6 h-6 text-gray-300" />
        </div>
        <p className="text-sm text-gray-400">Este papel no tiene conexiones en el grafo todavía</p>
        <p className="text-xs text-gray-300 max-w-xs">
          Las conexiones aparecen cuando este papel actúa como fuente para un papel MASTER,
          o cuando es alimentado por papeles SMART.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Sources — papers this one receives from */}
      {sources.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-white">
            <ArrowDownCircle className="w-4 h-4 text-blue-500" />
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Recibe datos de ({sources.length})
            </p>
            <span className="text-[10px] text-gray-400 ml-auto">Haz clic para navegar al papel</span>
          </div>
          <div className="p-2 space-y-0.5">
            {sources.map(wp => (
              <WpRefRow
                key={wp.id}
                ref={wp}
                direction="source"
                onClick={() => navigateTo(wp.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Targets — papers that feed off this one */}
      {targets.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-purple-50 to-white">
            <ArrowUpCircle className="w-4 h-4 text-purple-500" />
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Alimenta datos a ({targets.length})
            </p>
            <span className="text-[10px] text-gray-400 ml-auto">Haz clic para navegar al papel</span>
          </div>
          <div className="p-2 space-y-0.5">
            {targets.map(wp => (
              <WpRefRow
                key={wp.id}
                ref={wp}
                direction="target"
                onClick={() => navigateTo(wp.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 space-y-2">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Leyenda</p>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { icon: <CheckCircle2 className="w-3 h-3 text-emerald-500" />, label: 'Al día' },
            { icon: <AlertTriangle className="w-3 h-3 text-amber-500" />, label: 'Desactualizado' },
            { icon: <RefreshCw    className="w-3 h-3 text-blue-500"   />, label: 'Consolidando' },
            { icon: <Clock        className="w-3 h-3 text-gray-400"   />, label: 'Borrador' },
          ].map(({ icon, label }) => (
            <div key={label} className="flex items-center gap-1.5 text-[10px] text-gray-500">
              {icon}
              {label}
            </div>
          ))}
        </div>
        <div className="border-t border-gray-200 pt-2 flex flex-wrap gap-1.5">
          <MappingBadge type="DIRECT" />
          <MappingBadge type="AGGREGATED" />
          <MappingBadge type="AI_GENERATED" />
        </div>
        <p className="text-[9px] text-gray-400 leading-relaxed">
          Cuando un papel fuente cambia, los papeles destino aparecen como <strong>Desactualizado</strong>.
          Las secciones afectadas muestran un aviso naranja con la razón del cambio.
        </p>
      </div>
    </div>
  );
}
