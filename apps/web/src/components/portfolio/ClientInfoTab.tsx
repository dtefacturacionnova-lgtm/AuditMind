'use client';

import { useState } from 'react';
import { Pencil, X, Check, User, Calendar, Plus, Trash2 } from 'lucide-react';
import { useUpdateClient, ClientDetail, UpdateClientData, BeneficialOwner } from '@/hooks/usePortfolio';
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
    legalRepName:       client.legalRepName ?? '',
    beneficialOwners:   client.beneficialOwners ?? [],
  };
}

const FIELD_LABELS: Record<string, string> = {
  legalName: 'Razón social', tradeName: 'Nombre comercial', taxId: 'NIT / Tax ID',
  industry: 'Industria / Sector', contactName: 'Contacto', contactEmail: 'Correo de contacto',
  contactPhone: 'Teléfono', address: 'Dirección', legalRepName: 'Representante legal',
};

function emptyOwner(): BeneficialOwner {
  return { name: '', participationPct: undefined, idNumber: '' };
}

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

        <div className="border-t border-gray-100 pt-4 space-y-3">
          <div>
            <p className="text-xs font-semibold text-gray-700">Identificación del cliente — DDC (Ley PLD/FT/FP, Decreto 426/2025)</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Solo relevante si el despacho es sujeto obligado para este cliente (Art. 7.7 — administra fondos/cuentas
              del cliente, constituye sociedades, etc.). Alimenta el screening de sanciones del Radar de Aceptación.
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">Representante legal</label>
            <input value={form.legalRepName ?? ''} onChange={e => set({ legalRepName: e.target.value })} className={cls} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-600">Beneficiarios finales (participación ≥ 25%)</label>
            {(form.beneficialOwners ?? []).map((owner, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  placeholder="Nombre completo"
                  value={owner.name}
                  onChange={e => set({
                    beneficialOwners: (form.beneficialOwners ?? []).map((o, j) => j === i ? { ...o, name: e.target.value } : o),
                  })}
                  className={`${cls} flex-1`}
                />
                <input
                  type="number" min={0} max={100} placeholder="%"
                  value={owner.participationPct ?? ''}
                  onChange={e => set({
                    beneficialOwners: (form.beneficialOwners ?? []).map((o, j) => j === i ? { ...o, participationPct: e.target.value === '' ? undefined : +e.target.value } : o),
                  })}
                  className={`${cls} w-20`}
                />
                <button type="button"
                  onClick={() => set({ beneficialOwners: (form.beneficialOwners ?? []).filter((_, j) => j !== i) })}
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <button type="button"
              onClick={() => set({ beneficialOwners: [...(form.beneficialOwners ?? []), emptyOwner()] })}
              className="flex items-center gap-1.5 self-start text-xs font-medium text-blue-600 hover:text-blue-700 px-2 py-1">
              <Plus className="w-3.5 h-3.5" /> Agregar beneficiario
            </button>
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

      {(client.legalRepName || client.beneficialOwners?.length > 0) && (
        <div className="pt-4 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-700 mb-2">Identificación del cliente — DDC (Ley PLD/FT/FP)</p>
          <div className="grid grid-cols-2 gap-5">
            <Row label="Representante legal" value={client.legalRepName} />
            {client.beneficialOwners?.length > 0 && (
              <div>
                <p className="text-xs text-gray-400">Beneficiarios finales</p>
                <ul className="text-sm text-gray-800 mt-0.5 space-y-0.5">
                  {client.beneficialOwners.map((o, i) => (
                    <li key={i}>{o.name}{o.participationPct != null ? ` — ${o.participationPct}%` : ''}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
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
