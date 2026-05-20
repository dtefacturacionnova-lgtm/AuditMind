'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Upload, Search, ChevronRight, Clock, CheckCircle2,
  XCircle, AlertTriangle, Plus, Send, Copy, Check,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import {
  usePbcRequestsForOrg, useCreatePbcRequest, PBC_STATUS_CONFIG,
  type PbcStatus, type CreatePbcData,
} from '@/hooks/usePbc';
import { formatDate } from '@/lib/utils';

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '',          label: 'Todos los estados' },
  { value: 'PENDING',   label: 'Pendiente' },
  { value: 'SUBMITTED', label: 'Enviada' },
  { value: 'ACCEPTED',  label: 'Aceptada' },
  { value: 'REJECTED',  label: 'Rechazada' },
  { value: 'OVERDUE',   label: 'Vencida' },
];

// ─── Modal: Crear solicitud PBC ───────────────────────────────────────────────
function CreatePbcModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [form, setForm] = useState<CreatePbcData>({
    auditId:          '',
    title:            '',
    description:      '',
    assignedToEmail:  '',
    assignedToName:   '',
    dueDate:          '',
  });
  const create = useCreatePbcRequest();

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await create.mutateAsync(form);
      onClose();
      setForm({ auditId: '', title: '', description: '', assignedToEmail: '', assignedToName: '', dueDate: '' });
    } catch (err) {
      // error shown inline
    }
  };

  const field = (label: string, node: React.ReactNode) => (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-600">{label}</label>
      {node}
    </div>
  );

  const inputCls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6 mx-4">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Nueva solicitud PBC</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {field('ID de auditoría *',
            <input
              required
              value={form.auditId}
              onChange={e => setForm(p => ({ ...p, auditId: e.target.value }))}
              placeholder="ej. clxxx..."
              className={inputCls}
            />
          )}
          {field('Título de la solicitud *',
            <input
              required
              value={form.title}
              onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              placeholder="ej. Estados financieros 2025"
              className={inputCls}
            />
          )}
          {field('Descripción',
            <textarea
              rows={2}
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder="Detalle qué documentación se requiere..."
              className={inputCls + ' resize-none'}
            />
          )}
          <div className="grid grid-cols-2 gap-3">
            {field('Email del auditado *',
              <input
                required
                type="email"
                value={form.assignedToEmail}
                onChange={e => setForm(p => ({ ...p, assignedToEmail: e.target.value }))}
                placeholder="contacto@empresa.cl"
                className={inputCls}
              />
            )}
            {field('Nombre',
              <input
                value={form.assignedToName}
                onChange={e => setForm(p => ({ ...p, assignedToName: e.target.value }))}
                placeholder="María González"
                className={inputCls}
              />
            )}
          </div>
          {field('Fecha límite *',
            <input
              required
              type="date"
              value={form.dueDate}
              onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))}
              className={inputCls}
            />
          )}

          {create.isError && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
              {(create.error as Error)?.message ?? 'Error al crear solicitud'}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={create.isPending}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2"
            >
              <Send className="w-3.5 h-3.5" />
              {create.isPending ? 'Creando...' : 'Crear solicitud'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Copy link button ─────────────────────────────────────────────────────────
function CopyLinkButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);

  const copy = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const url = `${window.location.origin}/portal/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      onClick={copy}
      title="Copiar enlace del portal"
      className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function PbcPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch]             = useState('');
  const [page, setPage]                 = useState(1);
  const [showCreate, setShowCreate]     = useState(false);

  const { data, isLoading } = usePbcRequestsForOrg({
    status: statusFilter as PbcStatus || undefined,
    page,
    limit: 20,
  });

  const requests = data?.data ?? [];
  const meta     = data?.meta;

  const filtered = search
    ? requests.filter(r =>
        r.title.toLowerCase().includes(search.toLowerCase()) ||
        r.requestedToEmail.toLowerCase().includes(search.toLowerCase()) ||
        r.audit?.title?.toLowerCase().includes(search.toLowerCase()),
      )
    : requests;

  // KPIs from current page (approximation — in real app use /org/stats)
  const pending   = requests.filter(r => r.status === 'PENDING').length;
  const submitted = requests.filter(r => r.status === 'SUBMITTED').length;
  const overdue   = requests.filter(r => r.status === 'OVERDUE').length;
  const accepted  = requests.filter(r => r.status === 'ACCEPTED').length;

  return (
    <div className="flex flex-col h-full">
      <Header title="Portal del Auditado (PBC)" />

      <div className="flex-1 overflow-auto p-6 space-y-6">

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Pendientes',  value: pending,   icon: Clock,         color: 'text-amber-500',   bg: 'bg-amber-50' },
            { label: 'Enviadas',    value: submitted, icon: Upload,        color: 'text-blue-500',    bg: 'bg-blue-50' },
            { label: 'Vencidas',    value: overdue,   icon: AlertTriangle, color: 'text-red-500',     bg: 'bg-red-50' },
            { label: 'Aceptadas',   value: accepted,  icon: CheckCircle2,  color: 'text-emerald-500', bg: 'bg-emerald-50' },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${color}`} />
                </div>
                <div>
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className="text-2xl font-bold text-gray-800">{value}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Filters + Create */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por título, email o auditoría..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {STATUS_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Nueva solicitud
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {isLoading ? (
            <div className="divide-y divide-gray-100">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="p-4 animate-pulse flex gap-4">
                  <div className="w-20 h-5 bg-gray-100 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-100 rounded w-2/3" />
                    <div className="h-3 bg-gray-100 rounded w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <Upload className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No hay solicitudes PBC</p>
              <p className="text-gray-400 text-sm mt-1">
                {statusFilter || search
                  ? 'Prueba con otros filtros'
                  : 'Crea tu primera solicitud con el botón "Nueva solicitud"'}
              </p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 grid grid-cols-12 gap-4 text-xs font-medium text-gray-500 uppercase tracking-wide">
                <div className="col-span-3">Solicitud</div>
                <div className="col-span-2">Auditado</div>
                <div className="col-span-2">Auditoría</div>
                <div className="col-span-2">Estado</div>
                <div className="col-span-2">Vence</div>
                <div className="col-span-1" />
              </div>

              <div className="divide-y divide-gray-100">
                {filtered.map(req => {
                  const st = PBC_STATUS_CONFIG[req.status];
                  const isOverdue = req.status !== 'ACCEPTED' && req.status !== 'REJECTED' && new Date(req.dueDate) < new Date();
                  return (
                    <div key={req.id} className="grid grid-cols-12 gap-4 px-4 py-3.5 items-center hover:bg-gray-50 transition-colors group">

                      {/* Title */}
                      <div className="col-span-3">
                        <Link href={`/dashboard/pbc/${req.id}`} className="block">
                          <p className="text-sm font-medium text-gray-800 line-clamp-1 group-hover:text-blue-600 transition-colors">
                            {req.title}
                          </p>
                          <p className="text-xs text-gray-400 line-clamp-1 mt-0.5">
                            {req.description?.slice(0, 60)}
                          </p>
                        </Link>
                      </div>

                      {/* Auditado */}
                      <div className="col-span-2">
                        <p className="text-xs text-gray-700">{req.requestedToName ?? '—'}</p>
                        <p className="text-xs text-gray-400 truncate">{req.requestedToEmail}</p>
                      </div>

                      {/* Audit */}
                      <div className="col-span-2">
                        <p className="text-xs text-gray-500 line-clamp-2">{req.audit?.title ?? '—'}</p>
                      </div>

                      {/* Status */}
                      <div className="col-span-2">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold border ${st.bg} ${st.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                          {st.label}
                        </span>
                      </div>

                      {/* Due date */}
                      <div className="col-span-2">
                        <span className={`text-xs ${isOverdue ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                          {formatDate(req.dueDate)}
                          {isOverdue && <span className="ml-1 text-red-500">⚠</span>}
                        </span>
                      </div>

                      {/* Actions */}
                      <div className="col-span-1 flex items-center justify-end gap-1">
                        <CopyLinkButton token={req.portalToken} />
                        <Link href={`/dashboard/pbc/${req.id}`} className="p-1.5 rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors">
                          <ChevronRight className="w-4 h-4" />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pagination */}
              {meta && meta.totalPages > 1 && (
                <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
                  <p className="text-xs text-gray-500">{meta.total} solicitudes en total</p>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="px-3 py-1 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
                    >
                      Anterior
                    </button>
                    <span className="px-3 py-1 text-xs text-gray-500">{page} / {meta.totalPages}</span>
                    <button
                      onClick={() => setPage(p => Math.min(meta.totalPages, p + 1))}
                      disabled={page >= meta.totalPages}
                      className="px-3 py-1 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

      </div>

      <CreatePbcModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}
