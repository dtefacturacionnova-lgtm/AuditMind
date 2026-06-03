'use client';

import { useState, useMemo } from 'react';
import {
  History, GitCompareArrows, RotateCcw, ChevronRight, User, FileText,
  Sparkles, AlertTriangle, Loader2, X, CheckCircle2,
} from 'lucide-react';
import {
  usePaperVersions, useCompareVersions, useRestoreVersion,
  type VersionMeta, type WordToken, type SectionDiff,
} from '@/hooks/usePaperVersions';

// ─── Diff renderer ───────────────────────────────────────────────────────────

function DiffTokens({ tokens, side }: { tokens: WordToken[]; side: 'old' | 'new' }) {
  return (
    <p className="text-[12px] leading-relaxed text-gray-700 whitespace-pre-wrap break-words">
      {tokens.map((t, i) => {
        if (t.type === 'unchanged') {
          return <span key={i}>{t.text}</span>;
        }
        if (t.type === 'removed' && side === 'old') {
          return (
            <span key={i} className="bg-red-100 text-red-800 rounded px-0.5">
              {t.text}
            </span>
          );
        }
        if (t.type === 'added' && side === 'new') {
          return (
            <span key={i} className="bg-emerald-100 text-emerald-800 rounded px-0.5">
              {t.text}
            </span>
          );
        }
        return null;
      })}
    </p>
  );
}

function SectionDiffCard({ diff }: { diff: SectionDiff }) {
  const isUnchanged = diff.changeType === 'unchanged';
  if (isUnchanged && diff.oldTokens.length === 0 && diff.newTokens.length === 0) return null;

  const colorByType: Record<string, string> = {
    unchanged: 'border-gray-200 bg-white',
    added:     'border-emerald-200 bg-emerald-50/30',
    removed:   'border-red-200 bg-red-50/30',
    modified:  'border-amber-200 bg-amber-50/30',
  };

  const labelByType: Record<string, string> = {
    unchanged: 'Sin cambios',
    added:     'Sección agregada',
    removed:   'Sección eliminada',
    modified:  'Modificada',
  };

  return (
    <div className={`border rounded-2xl overflow-hidden ${colorByType[diff.changeType]}`}>
      <div className="px-4 py-2 flex items-center justify-between border-b border-current/10 bg-white/40">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-gray-500">{diff.sectionKey}</span>
          <span className="text-xs font-semibold text-gray-800">{diff.label}</span>
        </div>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="text-gray-500">{labelByType[diff.changeType]}</span>
          {diff.wordsAdded > 0  && <span className="text-emerald-700">+{diff.wordsAdded}</span>}
          {diff.wordsRemoved > 0 && <span className="text-red-700">−{diff.wordsRemoved}</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px bg-gray-200">
        <div className="bg-white p-3">
          <DiffTokens tokens={diff.oldTokens} side="old" />
        </div>
        <div className="bg-white p-3">
          <DiffTokens tokens={diff.newTokens} side="new" />
        </div>
      </div>
    </div>
  );
}

// ─── Restore confirmation modal ──────────────────────────────────────────────

function RestoreModal({
  paperId,
  version,
  onClose,
  onSuccess,
}: {
  paperId: string;
  version: VersionMeta;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [reason, setReason] = useState('');
  const restore = useRestoreVersion();
  const [error, setError] = useState('');

  async function handleRestore() {
    setError('');
    try {
      await restore.mutateAsync({ paperId, versionId: version.id, reason: reason.trim() || undefined });
      onSuccess();
      onClose();
    } catch (e) {
      setError((e as Error).message ?? 'Error al restaurar');
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900">Restaurar versión {version.version}</h3>
            <p className="text-xs text-gray-500">El estado actual quedará archivado como versión nueva</p>
          </div>
        </div>

        <div className="bg-gray-50 rounded-xl p-3 text-xs space-y-1 mb-3">
          <p><strong>Autor:</strong> {version.changedBy}</p>
          <p><strong>Fecha:</strong> {new Date(version.changedAt).toLocaleString('es-CL')}</p>
          {version.reason && <p><strong>Razón original:</strong> {version.reason}</p>}
        </div>

        <label className="block">
          <span className="text-xs font-semibold text-gray-700">Razón de la restauración (opcional)</span>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Ej: La consolidación nueva introdujo un error en la conclusión"
            rows={3}
            className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </label>

        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

        <div className="flex items-center justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
          >
            Cancelar
          </button>
          <button
            onClick={handleRestore}
            disabled={restore.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-sm font-semibold rounded-xl hover:bg-amber-700 disabled:opacity-50"
          >
            {restore.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
            Restaurar versión
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Version list item ──────────────────────────────────────────────────────

function VersionItem({
  v,
  isLatest,
  isSelected,
  onSelect,
  onCompare,
  onRestore,
}: {
  v: VersionMeta;
  isLatest: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onCompare: () => void;
  onRestore: () => void;
}) {
  return (
    <div
      className={`border-2 rounded-2xl p-3 transition-colors ${
        isSelected ? 'border-violet-400 bg-violet-50/40' : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          onClick={onSelect}
          className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${
            isLatest ? 'bg-emerald-100 text-emerald-700' :
            v.isRestore ? 'bg-amber-100 text-amber-700' :
            'bg-gray-100 text-gray-700'
          }`}
        >
          v{v.version}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900">
              {new Date(v.changedAt).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
            {isLatest && (
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">
                ACTUAL
              </span>
            )}
            {v.isRestore && (
              <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">
                RESTAURADA
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-500">
            <User className="w-3 h-3" />
            <span>{v.changedBy}</span>
            <span>·</span>
            <FileText className="w-3 h-3" />
            <span>{v.sectionsCount} secciones · {v.wordCount} palabras</span>
          </div>

          {v.reason && (
            <p className="text-[11px] text-gray-600 italic mt-1.5 line-clamp-2">
              {v.reason}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1 shrink-0">
          <button
            onClick={onCompare}
            className="text-[10px] text-violet-700 bg-violet-50 border border-violet-200 px-2 py-1 rounded-lg hover:bg-violet-100 flex items-center gap-1"
            title="Comparar con versión actual"
          >
            <GitCompareArrows className="w-3 h-3" />
            Comparar
          </button>
          {!isLatest && (
            <button
              onClick={onRestore}
              className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg hover:bg-amber-100 flex items-center gap-1"
              title="Restaurar esta versión"
            >
              <RotateCcw className="w-3 h-3" />
              Restaurar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Compare panel ───────────────────────────────────────────────────────────

function ComparePanel({ paperId, fromVersion, onClose }: { paperId: string; fromVersion: number; onClose: () => void }) {
  // Always compare against current state (toVersion=0)
  const { data, isLoading } = useCompareVersions(paperId, fromVersion, 0);

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-6 h-6 text-violet-500 animate-spin" />
      </div>
    );
  }

  if (!data) return null;

  const noChanges = data.sectionsModified === 0 && data.sectionsAdded === 0 && data.sectionsRemoved === 0;

  return (
    <div className="space-y-3">
      {/* Compare header */}
      <div className="bg-gradient-to-r from-violet-50 to-blue-50 border border-violet-200 rounded-2xl p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <GitCompareArrows className="w-5 h-5 text-violet-600 shrink-0" />
            <div>
              <p className="text-sm font-bold text-gray-900">
                v{data.fromVersion} <ChevronRight className="inline w-3 h-3" /> v{data.toVersion === 0 ? 'actual' : data.toVersion}
              </p>
              <p className="text-[11px] text-gray-600 mt-0.5">
                {new Date(data.fromDate).toLocaleString('es-CL')} → {new Date(data.toDate).toLocaleString('es-CL')}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/50 text-gray-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-3 mt-3 text-xs">
          <span className="text-gray-600">
            <strong>{data.sectionsCompared}</strong> secciones comparadas
          </span>
          <span className="w-px h-3 bg-gray-300" />
          {data.sectionsModified > 0 && (
            <span className="text-amber-700">
              <strong>{data.sectionsModified}</strong> modificadas
            </span>
          )}
          {data.sectionsAdded > 0 && (
            <span className="text-emerald-700">
              <strong>+{data.sectionsAdded}</strong> agregadas
            </span>
          )}
          {data.sectionsRemoved > 0 && (
            <span className="text-red-700">
              <strong>−{data.sectionsRemoved}</strong> eliminadas
            </span>
          )}
          <span className="w-px h-3 bg-gray-300" />
          <span className="text-emerald-700">+{data.totalWordsAdded} palabras</span>
          <span className="text-red-700">−{data.totalWordsRemoved} palabras</span>
        </div>
      </div>

      {noChanges && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center">
          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
          <p className="text-sm font-semibold text-emerald-800">Las dos versiones son idénticas</p>
          <p className="text-xs text-emerald-600 mt-1">No hay diferencias detectables a nivel de secciones</p>
        </div>
      )}

      {/* Sections diff */}
      {!noChanges && (
        <>
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide pt-2">
            Cambios por sección
          </h4>
          <div className="space-y-2">
            {data.sectionDiffs
              .filter(d => d.changeType !== 'unchanged')
              .map(d => (
                <SectionDiffCard key={d.sectionKey} diff={d} />
              ))}
          </div>

          {/* Show unchanged sections collapsed at the bottom */}
          {data.sectionDiffs.some(d => d.changeType === 'unchanged') && (
            <details className="mt-3">
              <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                Ver secciones sin cambios ({data.sectionDiffs.filter(d => d.changeType === 'unchanged').length})
              </summary>
              <div className="space-y-2 mt-2">
                {data.sectionDiffs
                  .filter(d => d.changeType === 'unchanged')
                  .map(d => (
                    <SectionDiffCard key={d.sectionKey} diff={d} />
                  ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}

// ─── Main panel ──────────────────────────────────────────────────────────────

export function VersionHistoryPanel({ paperId }: { paperId: string }) {
  const { data: versions, isLoading } = usePaperVersions(paperId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [compareFrom, setCompareFrom] = useState<number | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<VersionMeta | null>(null);

  const sortedVersions = useMemo(() => {
    if (!versions) return [];
    return [...versions].sort((a, b) => b.version - a.version);
  }, [versions]);

  const latestVersion = sortedVersions[0]?.version ?? 0;

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-6 h-6 text-violet-500 animate-spin" />
      </div>
    );
  }

  if (!versions || versions.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-10 text-center">
        <History className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-sm font-semibold text-gray-600">Sin historial de versiones</p>
        <p className="text-xs text-gray-400 mt-1">
          Las versiones se crean automáticamente cada vez que consolidas un papel MASTER.
        </p>
        <p className="text-xs text-gray-400 mt-3 max-w-md mx-auto">
          PI.5 — NIA 230 trazabilidad. Cada consolidación crea un snapshot completo del estado anterior,
          incluyendo narrativa, secciones y hashes de papeles fuente.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-12 gap-4">
      {/* Left — version list */}
      <div className="col-span-5 space-y-2">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">
            {versions.length} versión{versions.length !== 1 ? 'es' : ''}
          </h3>
          {compareFrom !== null && (
            <button
              onClick={() => setCompareFrom(null)}
              className="text-[10px] text-violet-700 hover:underline"
            >
              Cerrar comparación
            </button>
          )}
        </div>

        {sortedVersions.map(v => (
          <VersionItem
            key={v.id}
            v={v}
            isLatest={v.version === latestVersion}
            isSelected={selectedId === v.id}
            onSelect={() => setSelectedId(selectedId === v.id ? null : v.id)}
            onCompare={() => setCompareFrom(v.version)}
            onRestore={() => setRestoreTarget(v)}
          />
        ))}
      </div>

      {/* Right — compare panel or hint */}
      <div className="col-span-7">
        {compareFrom !== null ? (
          <ComparePanel
            paperId={paperId}
            fromVersion={compareFrom}
            onClose={() => setCompareFrom(null)}
          />
        ) : (
          <div className="sticky top-2 bg-white border border-dashed border-gray-300 rounded-2xl p-8 text-center">
            <Sparkles className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-600 font-medium">Selecciona una versión y pulsa <strong>Comparar</strong></p>
            <p className="text-xs text-gray-400 mt-1.5 max-w-xs mx-auto">
              Te mostraré el diff word-level lado a lado contra la versión actual del papel.
            </p>
          </div>
        )}
      </div>

      {/* Restore modal */}
      {restoreTarget && (
        <RestoreModal
          paperId={paperId}
          version={restoreTarget}
          onClose={() => setRestoreTarget(null)}
          onSuccess={() => {
            setCompareFrom(null);
            setSelectedId(null);
          }}
        />
      )}
    </div>
  );
}
