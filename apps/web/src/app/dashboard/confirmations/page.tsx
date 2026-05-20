'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Send, CheckCircle2, AlertCircle, Clock, Mail,
  Plus, Search, Filter, TrendingUp, FileCheck, XCircle,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import {
  useConfirmationsForOrg, useConfirmationStats, useCreateConfirmation,
  CONFIRMATION_STATUS_CONFIG, CONFIRMATION_TYPE_CONFIG, formatAmount,
  ConfirmationStatus, ConfirmationType, CreateConfirmationData,
} from '@/hooks/useConfirmations';

// ─── Create modal ─────────────────────────────────────────────────────────────
function CreateConfirmationModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState<CreateConfirmationData>({
    auditId: '', type: 'BANK', respondentName: '', respondentEmail: '',
  });
  const create = useCreateConfirmation();

  if (!open) return null;

  const cls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const field = (label: string, node: React.ReactNode) => (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-600">{label}</label>
      {node}
    </div>
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await create.mutateAsync(form);
      onClose();
      setForm({ auditId: '', type: 'BANK', respondentName: '', respondentEmail: '' });
    } catch { /* shown below */ }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 mx-4">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Nueva confirmación externa</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {field('ID de Auditoría *',
            <input required value={form.auditId}
              onChange={e => setForm(p => ({ ...p, auditId: e.target.value }))}
              placeholder="ej. audit-01" className={cls} />
          )}
          {field('Tipo *',
            <select value={form.type}
              onChange={e => setForm(p => ({ ...p, type: e.target.value as ConfirmationType }))}
              className={cls + ' bg-white'}>
              {Object.entries(CONFIRMATION_TYPE_CONFIG).map(([k, v]) => (
                <option key={k} value={k}>{v.icon} {v.label}</option>
              ))}
            </select>
          )}
          {field('Nombre del confirmante *',
            <input required value={form.respondentName}
              onChange={e => setForm(p => ({ ...p, respondentName: e.target.value }))}
              placeholder="ej. Banco Santander Chile" className={cls} />
          )}
          {field('Email *',
            <input required type="email" value={form.respondentEmail}
              onChange={e => setForm(p => ({ ...p, respondentEmail: e.target.value }))}
              placeholder="ej. confirmaciones@santander.cl" className={cls} />
          )}
          {field('Monto a confirmar (CLP)',
            <input type="number" value={form.amount ?? ''}
              onChange={e => setForm(p => ({ ...p, amount: e.target.value ? +e.target.value : undefined }))}
              placeholder="ej. 1500000" className={cls} />
          )}
          {field('Referencia de cuenta',
            <input value={form.accountRef ?? ''}
              onChange={e => setForm(p => ({ ...p, accountRef: e.target.value || undefined }))}
              placeholder="ej. Cta. Cte. 123-456-7" className={cls} />
          )}

          {create.isError && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
              {(create.error as Error)?.message ?? 'Error al crear'}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 border border-gray-200 text-sm font-medium rounded-xl text-gray-600 hover:bg-gray-50">
              Cancelar
            </button>
            <button type="submit" disabled={create.isPending}
              className="flex-1 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-60">
              {create.isPending ? 'Creando...' : 'Crear confirmación'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ConfirmationsPage() {
  const router   = useRouter();
  const [search,    setSearch]    = useState('');
  const [statusFilter, setStatus] = useState<ConfirmationStatus | ''>('');
  const [showCreate, setCreate]   = useState(false);

  const { data: statsData } = useConfirmationStats();
  const { data, isLoading } = useConfirmationsForOrg({
    status: statusFilter || undefined,
  });

  const confirmations = data?.data ?? [];
  const stats = statsData;

  const filtered = confirmations.filter(c =>
    !search ||
    c.respondentName.toLowerCase().includes(search.toLowerCase()) ||
    c.audit?.title.toLowerCase().includes(search.toLowerCase()) ||
    c.accountRef?.toLowerCase().includes(search.toLowerCase())
  );

  const kpis = [
    { label: 'Total',       value: stats?.total       ?? 0, icon: FileCheck,   color: 'text-blue-600',   bg: 'bg-blue-50' },
    { label: 'Enviadas',    value: stats?.sent         ?? 0, icon: Send,        color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { label: 'Recibidas',   value: stats?.received     ?? 0, icon: Mail,        color: 'text-amber-600',  bg: 'bg-amber-50' },
    { label: 'Conciliadas', value: stats?.reconciled   ?? 0, icon: CheckCircle2,color: 'text-emerald-600',bg: 'bg-emerald-50' },
    { label: 'Sin Respuesta',value: stats?.noResponse  ?? 0, icon: AlertCircle, color: 'text-red-600',    bg: 'bg-red-50' },
    { label: 'Proc. Alt.',  value: stats?.altProcedure ?? 0, icon: TrendingUp,  color: 'text-purple-600', bg: 'bg-purple-50' },
  ];

  return (
    <div className="flex flex-col h-full">
      <Header title="Confirmaciones Externas — NIA 505" />

      <div className="flex-1 overflow-auto p-6 space-y-6">

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {kpis.map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex flex-col gap-2">
              <div className={`w-8 h-8 rounded-xl ${bg} flex items-center justify-center`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <p className="text-2xl font-bold text-gray-900">{value}</p>
              <p className="text-xs text-gray-500">{label}</p>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por confirmante, auditoría o cuenta..."
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={statusFilter}
              onChange={e => setStatus(e.target.value as ConfirmationStatus | '')}
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todos los estados</option>
              {Object.entries(CONFIRMATION_STATUS_CONFIG).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> Nueva confirmación
          </button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Mail className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">No hay confirmaciones</p>
              <p className="text-xs mt-1">Crea la primera confirmación externa</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Confirmante</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tipo</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Auditoría</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Monto</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Diferencia</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Estado</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Enviada</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map(conf => {
                    const st   = CONFIRMATION_STATUS_CONFIG[conf.status];
                    const type = CONFIRMATION_TYPE_CONFIG[conf.type];
                    const hasDiff = conf.difference != null && Number(conf.difference) > 0;
                    return (
                      <tr
                        key={conf.id}
                        onClick={() => router.push(`/dashboard/confirmations/${conf.id}`)}
                        className="hover:bg-blue-50/40 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{conf.respondentName}</p>
                          {conf.accountRef && (
                            <p className="text-xs text-gray-400 mt-0.5 font-mono">{conf.accountRef}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-base">{type.icon}</span>
                          <span className="ml-1.5 text-xs text-gray-600">{type.label}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 max-w-[180px] truncate">
                          {conf.audit?.title ?? conf.auditId}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-sm text-gray-700">
                          {formatAmount(conf.amount)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {hasDiff ? (
                            <span className="font-mono text-sm text-red-600">{formatAmount(Number(conf.difference))}</span>
                          ) : conf.status === 'RECONCILED' ? (
                            <span className="text-xs text-emerald-600">Sin diferencia</span>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${st.bg} ${st.color}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                            {st.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">
                          {conf.sentAt
                            ? new Date(conf.sentAt).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
                            : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* NIA 505 note */}
        <p className="text-xs text-gray-400 text-center">
          Las confirmaciones externas se rigen por la <strong>NIA 505</strong> — Confirmaciones externas.
          El auditor mantiene control sobre el proceso de envío, recepción y conciliación.
        </p>
      </div>

      <CreateConfirmationModal open={showCreate} onClose={() => setCreate(false)} />
    </div>
  );
}
