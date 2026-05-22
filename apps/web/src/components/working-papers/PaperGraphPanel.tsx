'use client';

import { useRouter } from 'next/navigation';
import { Loader2, ArrowUpCircle, ArrowDownCircle, CheckCircle2, AlertTriangle, Clock, RefreshCw } from 'lucide-react';
import { usePaperGraph } from '@/hooks/useWorkingPaperGraph';
import type { WpRef } from '@/hooks/useWorkingPaperGraph';

// ─── Sync status icon ─────────────────────────────────────────────────────────

function SyncIcon({ status }: { status: string }) {
  switch (status) {
    case 'SYNCED':
      return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />;
    case 'STALE':
      return <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />;
    case 'REGENERATING':
      return <RefreshCw className="w-3.5 h-3.5 text-blue-500 shrink-0 animate-spin" />;
    default: // DRAFT
      return <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />;
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

function kindBadgeClass(wpKind: string): string {
  switch (wpKind) {
    case 'SMART':  return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'MASTER': return 'bg-purple-50 text-purple-700 border-purple-200';
    case 'LIVE':   return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    default:       return 'bg-gray-50 text-gray-600 border-gray-200';
  }
}

// ─── WpRef row ────────────────────────────────────────────────────────────────

function WpRefRow({ ref: wp, onClick }: { ref: WpRef; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-gray-50 text-left transition-colors group"
    >
      <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border shrink-0 ${kindBadgeClass(wp.wpKind)}`}>
        {wp.code}
      </span>
      <span className="flex-1 text-xs text-gray-700 truncate group-hover:text-gray-900">
        {wp.title}
      </span>
      <div className="flex items-center gap-1 shrink-0">
        <SyncIcon status={wp.syncStatus} />
        <span className="text-[10px] text-gray-400">{syncStatusLabel(wp.syncStatus)}</span>
      </div>
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
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50">
            <ArrowDownCircle className="w-4 h-4 text-blue-500" />
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Recibe de ({sources.length})
            </p>
          </div>
          <div className="p-2 space-y-0.5">
            {sources.map(wp => (
              <WpRefRow
                key={wp.id}
                ref={wp}
                onClick={() => navigateTo(wp.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Targets — papers that feed off this one */}
      {targets.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50">
            <ArrowUpCircle className="w-4 h-4 text-purple-500" />
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Alimenta a ({targets.length})
            </p>
          </div>
          <div className="p-2 space-y-0.5">
            {targets.map(wp => (
              <WpRefRow
                key={wp.id}
                ref={wp}
                onClick={() => navigateTo(wp.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Leyenda</p>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { icon: <CheckCircle2 className="w-3 h-3 text-emerald-500" />, label: 'Al día' },
            { icon: <AlertTriangle className="w-3 h-3 text-amber-500" />, label: 'Desactualizado' },
            { icon: <RefreshCw className="w-3 h-3 text-blue-500" />, label: 'Consolidando' },
            { icon: <Clock className="w-3 h-3 text-gray-400" />, label: 'Borrador' },
          ].map(({ icon, label }) => (
            <div key={label} className="flex items-center gap-1.5 text-[10px] text-gray-500">
              {icon}
              {label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
