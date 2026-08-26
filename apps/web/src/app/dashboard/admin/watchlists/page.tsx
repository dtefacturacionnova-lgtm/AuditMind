'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldBan, RefreshCw, CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';

type SourceList = 'OFAC_SDN' | 'UN_CONSOLIDATED';
type SyncStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

interface WatchlistSync {
  id: string;
  sourceList: SourceList;
  status: SyncStatus;
  triggeredBy: string;
  recordsFetched: number | null;
  recordsUpserted: number | null;
  recordsDeactivated: number | null;
  errorMsg: string | null;
  startedAt: string;
  completedAt: string | null;
}

interface SyncStatusRow {
  sourceList: SourceList;
  lastSync: WatchlistSync | null;
  activeEntryCount: number;
}

const SOURCE_LABELS: Record<SourceList, string> = {
  OFAC_SDN: 'OFAC SDN (Tesoro EE.UU.)',
  UN_CONSOLIDATED: 'Lista Consolidada ONU',
};

const STATUS_STYLES: Record<SyncStatus, { color: string; label: string; icon: React.ElementType }> = {
  PENDING:   { color: 'text-gray-500 bg-gray-50 border-gray-200',       label: 'Pendiente',    icon: Clock },
  RUNNING:   { color: 'text-amber-600 bg-amber-50 border-amber-200',    label: 'En curso',     icon: Loader2 },
  COMPLETED: { color: 'text-emerald-600 bg-emerald-50 border-emerald-200', label: 'Completado', icon: CheckCircle2 },
  FAILED:    { color: 'text-red-600 bg-red-50 border-red-200',          label: 'Falló',        icon: XCircle },
};

// Motor CAATs #18 (Screening de Sanciones) — recurso de PLATAFORMA, no de
// organización, ver apps/api/src/watchlists. Estado de solo lectura visible
// para cualquier ADMIN (afecta los resultados de screening de su
// organización); disparar una sincronización manual requiere SUPER_ADMIN
// (toca servidores de gobierno externos y afecta a toda la plataforma).
export default function WatchlistsPage() {
  const qc = useQueryClient();

  const { data: rows, isLoading } = useQuery<SyncStatusRow[]>({
    queryKey: ['watchlists', 'sync-status'],
    queryFn: () => apiClient.get<SyncStatusRow[]>('/watchlists/sync-status'),
    refetchInterval: (query) => {
      const enProceso = query.state.data?.some((r) => r.lastSync?.status === 'RUNNING');
      return enProceso ? 3000 : false;
    },
  });

  const triggerSync = useMutation({
    mutationFn: (sourceList?: SourceList) => apiClient.post('/watchlists/sync', sourceList ? { sourceList } : {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['watchlists', 'sync-status'] }),
  });

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <Header />
      <div className="flex-1 overflow-y-auto px-6 py-6 max-w-4xl mx-auto w-full">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <ShieldBan className="h-6 w-6 text-red-700" /> Listas de Sanciones
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Copia local de OFAC SDN + Lista Consolidada ONU, usada por el motor CAATs de Screening de Sanciones
              en todas las organizaciones. Se sincroniza automáticamente cada día.
            </p>
          </div>
          <button
            onClick={() => triggerSync.mutate(undefined)}
            disabled={triggerSync.isPending}
            className="flex items-center gap-2 bg-[#0F2D4A] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#1a3f5f] disabled:opacity-40 transition-colors"
          >
            {triggerSync.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Sincronizar ahora
          </button>
        </div>

        {triggerSync.error && (
          <p className="text-xs text-red-600 mb-4">
            {triggerSync.error instanceof Error ? triggerSync.error.message : 'No se pudo disparar la sincronización.'}
          </p>
        )}

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-400 py-10 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando estado…
          </div>
        ) : (
          <div className="space-y-3">
            {rows?.map((row) => {
              const sync = row.lastSync;
              const style = sync ? STATUS_STYLES[sync.status] : null;
              const Icon = style?.icon ?? Clock;
              return (
                <div key={row.sourceList} className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-gray-800">{SOURCE_LABELS[row.sourceList]}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">{row.activeEntryCount.toLocaleString()} entradas activas</p>
                    </div>
                    {style && (
                      <span className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border ${style.color}`}>
                        <Icon className={`h-3.5 w-3.5 ${sync?.status === 'RUNNING' ? 'animate-spin' : ''}`} />
                        {style.label}
                      </span>
                    )}
                  </div>
                  {sync ? (
                    <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500 space-y-1">
                      <p>Última corrida: {formatDate(sync.startedAt)} ({sync.triggeredBy === 'CRON' ? 'automática' : 'manual'})</p>
                      {sync.status === 'COMPLETED' && (
                        <p>
                          {sync.recordsFetched?.toLocaleString() ?? '—'} registros descargados ·{' '}
                          {sync.recordsUpserted?.toLocaleString() ?? '—'} actualizados ·{' '}
                          {sync.recordsDeactivated?.toLocaleString() ?? 0} dados de baja
                        </p>
                      )}
                      {sync.status === 'FAILED' && sync.errorMsg && (
                        <p className="text-red-600">{sync.errorMsg}</p>
                      )}
                    </div>
                  ) : (
                    <p className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400">
                      Sin sincronizaciones todavía — use &quot;Sincronizar ahora&quot; o espere la corrida diaria automática.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
