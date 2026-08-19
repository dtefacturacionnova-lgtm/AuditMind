'use client';

import { useState } from 'react';
import { Pencil, X, Check, User, Calendar } from 'lucide-react';
import { useUpdateClient, ClientDetail, UpdateClientData } from '@/hooks/usePortfolio';
import { formatDate } from '@/lib/utils';

function toForm(client: ClientDetail): UpdateClientData {
  return {
    legalName:          client.legalName,
    tradeName:          client.tradeName ?? '',
    taxId:              client.taxId ?? '',
    industry:           client.industry ?? '',
    contactName:        client.contactName ?? '',
    contactEmail:       client.contactEmail ?? '',
    contactPhone:       client.contactPhone ?? '',
    address:            client.address ?? '',
    fiscalYearEndMonth: client.fiscalYearEndMonth,
    fiscalYearEndDay:   client.fiscalYearEndDay,
    notes:              client.notes ?? '',
  };
}

const FIELD_LABELS: Record<string, string> = {
  legalName: 'Razón social', tradeName: 'Nombre comercial', taxId: 'NIT / Tax ID',
  industry: 'Industria / Sector', contactName: 'Contacto', contactEmail: 'Correo de contacto',
  contactPhone: 'Teléfono', address: 'Dirección',
};

export function ClientInfoTab({ client }: { client: ClientDetail }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<UpdateClientData>(() => toForm(client));
  const update = useUpdateClient(client.id);

  const cls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const set = (patch: Partial<UpdateClientData>) => setForm(p => ({ ...p, ...patch }));

  const startEdit = () => { setForm(toForm(client)); setEditing(true); };
  const cancel = () => { setForm(toForm(client)); setEditing(false); };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await update.mutateAsync(form);
      setEditing(false);
    } catch { /* shown below */ }
  };

  if (editing) {
    return (
      <form onSubmit={handleSave} className="space-y-4 max-w-3xl">
        <div className="grid grid-cols-2 gap-4">
          {(['legalName', 'tradeName', 'taxId', 'industry', 'contactName', 'contactPhone'] as const).map(key => (
            <div key={key} className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">{FIELD_LABELS[key]}</label>
              <input value={form[key] ?? ''} onChange={e => set({ [key]: e.target.value })} className={cls} />
            </div>
          ))}
          <div className="flex flex-col gap-1 col-span-2">
            <label className="text-xs font-medium text-gray-600">Correo de contacto</label>
            <input type="email" value={form.contactEmail ?? ''} onChange={e => set({ contactEmail: e.target.value })} className={cls} />
          </div>
          <div className="flex flex-col gap-1 col-span-2">
            <label className="text-xs font-medium text-gray-600">Dirección</label>
            <input value={form.address ?? ''} onChange={e => set({ address: e.target.value })} className={cls} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">Mes cierre fiscal</label>
            <input type="number" min={1} max={12} value={form.fiscalYearEndMonth ?? 12}
              onChange={e => set({ fiscalYearEndMonth: +e.target.value || 12 })} className={cls} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">Día cierre fiscal</label>
            <input type="number" min={1} max={31} value={form.fiscalYearEndDay ?? 31}
              onChange={e => set({ fiscalYearEndDay: +e.target.value || 31 })} className={cls} />
          </div>
          <div className="flex flex-col gap-1 col-span-2">
            <label className="text-xs font-medium text-gray-600">Notas</label>
            <textarea rows={3} value={form.notes ?? ''} onChange={e => set({ notes: e.target.value })} className={cls} />
          </div>
        </div>

        {update.isError && (
          <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
            {(update.error as Error)?.message ?? 'Error al guardar'}
          </p>
        )}

        <div className="flex gap-2">
          <button type="button" onClick={cancel}
            className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 text-sm font-medium rounded-xl text-gray-600 hover:bg-gray-50">
            <X className="w-3.5 h-3.5" /> Cancelar
          </button>
          <button type="submit" disabled={update.isPending}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-60">
            <Check className="w-3.5 h-3.5" /> {update.isPending ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    );
  }

  const Row = ({ label, value }: { label: string; value?: string | null }) => (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm text-gray-800 mt-0.5">{value || '—'}</p>
    </div>
  );

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex justify-end">
        <button onClick={startEdit}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-sm font-medium rounded-lg text-gray-600 hover:bg-gray-50">
          <Pencil className="w-3.5 h-3.5" /> Editar
        </button>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <Row label="Razón social" value={client.legalName} />
        <Row label="Nombre comercial" value={client.tradeName} />
        <Row label="NIT / Tax ID" value={client.taxId} />
        <Row label="Industria / Sector" value={client.industry} />
        <Row label="Contacto" value={client.contactName} />
        <Row label="Teléfono" value={client.contactPhone} />
        <Row label="Correo de contacto" value={client.contactEmail} />
        <Row label="Dirección" value={client.address} />
        <Row label="Cierre fiscal" value={`${String(client.fiscalYearEndDay).padStart(2, '0')}/${String(client.fiscalYearEndMonth).padStart(2, '0')}`} />
      </div>

      {client.notes && (
        <div>
          <p className="text-xs text-gray-400">Notas</p>
          <p className="text-sm text-gray-700 mt-0.5 whitespace-pre-wrap">{client.notes}</p>
        </div>
      )}

      <div className="pt-4 border-t border-gray-100 flex items-center gap-4 text-xs text-gray-400">
        <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" /> Creado por {client.createdBy?.name ?? '—'}</span>
        <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {formatDate(client.createdAt)}</span>
        {client.auditEntity && (
          <span className="ml-auto text-gray-500">Entidad vinculada en el Universo: {client.auditEntity.name}</span>
        )}
      </div>
    </div>
  );
}
