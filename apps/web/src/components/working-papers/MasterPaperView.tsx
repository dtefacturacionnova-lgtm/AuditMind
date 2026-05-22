'use client';

import { Loader2, RefreshCw, AlertTriangle, CheckCircle2, Clock, Sparkles } from 'lucide-react';
import { useConsolidatePaper } from '@/hooks/useWorkingPaperGraph';
import type { WpSyncStatus } from '@/hooks/useWorkingPapers';

// ─── Narrative renderer ───────────────────────────────────────────────────────
// Renders text with inline source citations like [PT-A1] highlighted.

function NarrativeDisplay({ text }: { text: string }) {
  // Split on citation tokens like [PT-A1], [PT-A2], [PT-PROG], etc.
  const parts = text.split(/(\[[A-Z0-9-]+\])/g);

  return (
    <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed space-y-3">
      {text.split('\n\n').map((para, pi) => (
        <p key={pi}>
          {para.split(/(\[[A-Z0-9-]+\])/g).map((part, i) =>
            /^\[[A-Z0-9-]+\]$/.test(part) ? (
              <span
                key={i}
                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-100 text-blue-700 border border-blue-200 mx-0.5 align-middle"
              >
                {part}
              </span>
            ) : (
              part
            )
          )}
        </p>
      ))}
      {/* Suppress unused variable warning from destructuring */}
      {parts.length === 0 && null}
    </div>
  );
}

// ─── Sync status badge ────────────────────────────────────────────────────────

function SyncStatusBadge({ syncStatus }: { syncStatus: WpSyncStatus }) {
  switch (syncStatus) {
    case 'SYNCED':
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Al día
        </span>
      );
    case 'STALE':
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200">
          <AlertTriangle className="w-3.5 h-3.5" />
          Desactualizado
        </span>
      );
    case 'REGENERATING':
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 border border-blue-200 animate-pulse">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Consolidando con IA…
        </span>
      );
    default: // DRAFT
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200">
          <Clock className="w-3.5 h-3.5" />
          Sin consolidar
        </span>
      );
  }
}

// ─── MasterPaperView ──────────────────────────────────────────────────────────

interface MasterPaperViewProps {
  paperId: string;
  syncStatus: WpSyncStatus;
  narrative?: string;
  staleCount?: number;
  lastSyncedAt?: string;
}

export function MasterPaperView({
  paperId,
  syncStatus,
  narrative,
  staleCount = 0,
  lastSyncedAt,
}: MasterPaperViewProps) {
  const consolidate = useConsolidatePaper();

  async function handleConsolidate() {
    await consolidate.mutateAsync(paperId);
  }

  const isRegenerating = syncStatus === 'REGENERATING' || consolidate.isPending;

  return (
    <div className="space-y-4">
      {/* Status banner */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <SyncStatusBadge syncStatus={isRegenerating ? 'REGENERATING' : syncStatus} />
            {lastSyncedAt && syncStatus === 'SYNCED' && (
              <span className="text-xs text-gray-400">
                Última sincronización:{' '}
                {new Intl.DateTimeFormat('es-CL', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                }).format(new Date(lastSyncedAt))}
              </span>
            )}
          </div>

          {(syncStatus === 'DRAFT' || syncStatus === 'SYNCED') && !isRegenerating && (
            <button
              onClick={handleConsolidate}
              disabled={consolidate.isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-violet-600 rounded-xl hover:bg-violet-700 disabled:opacity-50 transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              Consolidar
            </button>
          )}
        </div>
      </div>

      {/* STALE banner */}
      {syncStatus === 'STALE' && !isRegenerating && (
        <div className="flex items-center justify-between gap-4 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Alguna fuente cambió</p>
              <p className="text-xs text-amber-600 mt-0.5">
                {staleCount > 0
                  ? `${staleCount} sección${staleCount !== 1 ? 'es' : ''} requiere${staleCount !== 1 ? 'n' : ''} regeneración.`
                  : 'Una o más fuentes de datos se han actualizado.'}
                {' '}¿Deseas regenerar este papel?
              </p>
            </div>
          </div>
          <button
            onClick={handleConsolidate}
            disabled={consolidate.isPending}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-amber-600 rounded-xl hover:bg-amber-700 disabled:opacity-50 shrink-0 transition-colors"
          >
            {consolidate.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Procesando…</>
            ) : (
              <><RefreshCw className="w-4 h-4" /> Consolidar ahora</>
            )}
          </button>
        </div>
      )}

      {/* REGENERATING overlay */}
      {isRegenerating && (
        <div className="flex flex-col items-center py-12 gap-4 bg-white rounded-2xl border border-blue-200 shadow-sm">
          <div className="flex gap-1.5">
            {[0, 1, 2, 3].map(i => (
              <div
                key={i}
                className="w-2 h-2 rounded-full bg-blue-400 animate-bounce"
                style={{ animationDelay: `${i * 100}ms` }}
              />
            ))}
          </div>
          <p className="text-sm text-blue-600 font-medium">Consolidando con IA…</p>
          <p className="text-xs text-gray-400">
            Esto puede tardar unos segundos dependiendo del volumen de fuentes.
          </p>
        </div>
      )}

      {/* Narrative content */}
      {!isRegenerating && syncStatus === 'SYNCED' && narrative && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Narrativa consolidada
          </p>
          <NarrativeDisplay text={narrative} />
        </div>
      )}

      {/* Empty DRAFT state */}
      {!isRegenerating && syncStatus === 'DRAFT' && !narrative && (
        <div className="flex flex-col items-center py-16 gap-4 bg-white rounded-2xl border border-gray-200 shadow-sm text-center">
          <div className="w-16 h-16 rounded-2xl bg-violet-50 border border-violet-200 flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-violet-300" />
          </div>
          <div>
            <p className="text-base font-semibold text-gray-700 mb-1">
              Este papel aún no tiene contenido consolidado
            </p>
            <p className="text-sm text-gray-400 max-w-sm">
              Haz clic en &ldquo;Consolidar&rdquo; para que la IA recopile y sintetice la información
              de todos los papeles fuente vinculados.
            </p>
          </div>
          <button
            onClick={handleConsolidate}
            disabled={consolidate.isPending}
            className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-violet-600 rounded-xl hover:bg-violet-700 disabled:opacity-50 transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            Consolidar ahora
          </button>
        </div>
      )}
    </div>
  );
}
