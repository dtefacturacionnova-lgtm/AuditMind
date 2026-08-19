'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, Building2, ChevronRight, ChevronDown, Radar, FileSignature,
  PenTool, CheckCircle2, Archive,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import {
  useClients, useStartAcceptance,
  PIPELINE_STATUSES, ARCHIVED_STATUSES, CLIENT_STATUS_CONFIG,
  Client, ClientStatus,
} from '@/hooks/usePortfolio';
import { NewClientModal } from '@/components/portfolio/NewClientModal';

const COLUMN_ICONS: Record<ClientStatus, React.ElementType> = {
  PROSPECT:             Building2,
  IN_ACCEPTANCE:        Radar,
  PROPOSAL_IN_PROGRESS: FileSignature,
  PENDING_SIGNATURE:    PenTool,
  ACTIVE:               CheckCircle2,
  INACTIVE:             Archive,
  DECLINED:             Archive,
};

/** Acción contextual mostrada en la tarjeta según la columna del pipeline. */
const STAGE_ACTION: Partial<Record<ClientStatus, { label: string; tab?: string; triggersStart?: boolean }>> = {
  PROSPECT:             { label: 'Iniciar Radar de Aceptación →', triggersStart: true },
  IN_ACCEPTANCE:        { label: 'Evaluar Radar →', tab: 'radar' },
  PROPOSAL_IN_PROGRESS: { label: 'Gestionar Propuesta →', tab: 'proposal' },
  PENDING_SIGNATURE:    { label: 'Firmar Carta de Compromiso →', tab: 'letter' },
};

function ClientCard({ client }: { client: Client }) {
  const router = useRouter();
  const startAcceptance = useStartAcceptance();
  const action = STAGE_ACTION[client.status];

  const handleAction = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!action) return;
    if (action.triggersStart) {
      try {
        await startAcceptance.mutateAsync(client.id);
      } catch { /* el error se ve al entrar al detalle */ }
      router.push(`/dashboard/portfolio/clients/${client.id}?tab=radar`);
      return;
    }
    router.push(`/dashboard/portfolio/clients/${client.id}${action.tab ? `?tab=${action.tab}` : ''}`);
  };

  return (
    <div
      onClick={() => router.push(`/dashboard/portfolio/clients/${client.id}`)}
      className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 cursor-pointer hover:shadow-md hover:border-blue-200 transition-all"
    >
      <p className="text-sm font-semibold text-gray-900 line-clamp-2">{client.legalName}</p>
      {client.tradeName && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{client.tradeName}</p>}
      <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
        {client.industry && <span className="truncate">{client.industry}</span>}
      </div>
      {client._count && (
        <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-400">
          {client._count.proposals > 0 && <span>{client._count.proposals} propuesta{client._count.proposals !== 1 ? 's' : ''}</span>}
          {client._count.engagements > 0 && <span>{client._count.engagements} encargo{client._count.engagements !== 1 ? 's' : ''}</span>}
        </div>
      )}
      {action && (
        <button
          onClick={handleAction}
          disabled={startAcceptance.isPending}
          className="mt-3 w-full text-left text-xs font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1 disabled:opacity-50"
        >
          {startAcceptance.isPending && action.triggersStart ? 'Iniciando…' : action.label}
        </button>
      )}
    </div>
  );
}

function PipelineColumn({ status, clients }: { status: ClientStatus; clients: Client[] }) {
  const cfg = CLIENT_STATUS_CONFIG[status];
  const Icon = COLUMN_ICONS[status];
  return (
    <div className="flex flex-col w-72 flex-shrink-0 bg-gray-50 rounded-2xl border border-gray-200">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200">
        <span className={`w-6 h-6 rounded-lg flex items-center justify-center ${cfg.bg}`}>
          <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
        </span>
        <h3 className="text-sm font-semibold text-gray-700">{cfg.label}</h3>
        <span className="ml-auto text-xs font-medium text-gray-400 bg-white rounded-full px-2 py-0.5 border border-gray-200">
          {clients.length}
        </span>
      </div>
      <div className="flex-1 p-3 space-y-3 overflow-y-auto max-h-[calc(100vh-260px)]">
        {clients.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">Sin clientes</p>
        ) : (
          clients.map(c => <ClientCard key={c.id} client={c} />)
        )}
      </div>
    </div>
  );
}

function ArchivedSection({ clients }: { clients: Client[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  if (clients.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-5 py-3 text-sm font-semibold text-gray-600"
      >
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        <Archive className="w-4 h-4 text-gray-400" />
        Inactivos / Declinados
        <span className="ml-1 text-xs font-medium text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
          {clients.length}
        </span>
      </button>
      {open && (
        <div className="px-5 pb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {clients.map(c => {
            const cfg = CLIENT_STATUS_CONFIG[c.status];
            return (
              <div
                key={c.id}
                onClick={() => router.push(`/dashboard/portfolio/clients/${c.id}`)}
                className="border border-gray-100 rounded-xl p-3 cursor-pointer hover:border-gray-300"
              >
                <p className="text-sm font-medium text-gray-700 line-clamp-1">{c.legalName}</p>
                <span className={`inline-flex mt-1 items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.bg} ${cfg.color}`}>
                  {cfg.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function PortfolioPipelinePage() {
  const { data: clients = [], isLoading } = useClients();
  const [showCreate, setShowCreate] = useState(false);

  const byStatus = (status: ClientStatus) => clients.filter(c => c.status === status);
  const archived = clients.filter(c => ARCHIVED_STATUSES.includes(c.status));

  return (
    <div className="flex flex-col h-full">
      <Header title="Cartera de Clientes" />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-sm font-semibold text-gray-700">
            {clients.length} cliente{clients.length !== 1 ? 's' : ''} en cartera
          </h2>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" /> Nuevo Prospecto
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div className="flex gap-4 overflow-x-auto pb-2">
              {PIPELINE_STATUSES.map(status => (
                <PipelineColumn key={status} status={status} clients={byStatus(status)} />
              ))}
            </div>

            <ArchivedSection clients={archived} />
          </>
        )}
      </div>

      <NewClientModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}
