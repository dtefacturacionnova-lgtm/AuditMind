'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCreateClient, CreateClientData } from '@/hooks/usePortfolio';

const EMPTY: CreateClientData = {
  legalName: '', tradeName: '', taxId: '', industry: '',
  contactName: '', contactEmail: '', contactPhone: '', address: '',
  fiscalYearEndMonth: 12, fiscalYearEndDay: 31, notes: '',
};

export function NewClientModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [form, setForm] = useState<CreateClientData>(EMPTY);
  const create = useCreateClient();

  if (!open) return null;

  const cls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const label = 'text-xs font-medium text-gray-600';

  const set = (patch: Partial<CreateClientData>) => setForm(p => ({ ...p, ...patch }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await create.mutateAsync(form);
      setForm(EMPTY);
      onClose();
      router.push(`/dashboard/portfolio/clients/${created.id}`);
    } catch { /* shown below */ }
  };

  const handleClose = () => {
    setForm(EMPTY);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Nuevo Prospecto</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1 col-span-2">
              <label className={label}>Razón social *</label>
              <input required value={form.legalName} onChange={e => set({ legalName: e.target.value })}
                placeholder="Empresa Comercial Demo SA de CV" className={cls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className={label}>Nombre comercial</label>
              <input value={form.tradeName} onChange={e => set({ tradeName: e.target.value })} className={cls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className={label}>NIT / Tax ID</label>
              <input value={form.taxId} onChange={e => set({ taxId: e.target.value })} className={cls} />
            </div>
            <div className="flex flex-col gap-1 col-span-2">
              <label className={label}>Industria / Sector</label>
              <input value={form.industry} onChange={e => set({ industry: e.target.value })} className={cls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className={label}>Contacto</label>
              <input value={form.contactName} onChange={e => set({ contactName: e.target.value })} className={cls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className={label}>Teléfono</label>
              <input value={form.contactPhone} onChange={e => set({ contactPhone: e.target.value })} className={cls} />
            </div>
            <div className="flex flex-col gap-1 col-span-2">
              <label className={label}>Correo de contacto</label>
              <input type="email" value={form.contactEmail} onChange={e => set({ contactEmail: e.target.value })} className={cls} />
            </div>
            <div className="flex flex-col gap-1 col-span-2">
              <label className={label}>Dirección</label>
              <input value={form.address} onChange={e => set({ address: e.target.value })} className={cls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className={label}>Mes cierre fiscal</label>
              <input type="number" min={1} max={12} value={form.fiscalYearEndMonth}
                onChange={e => set({ fiscalYearEndMonth: +e.target.value || 12 })} className={cls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className={label}>Día cierre fiscal</label>
              <input type="number" min={1} max={31} value={form.fiscalYearEndDay}
                onChange={e => set({ fiscalYearEndDay: +e.target.value || 31 })} className={cls} />
            </div>
          </div>

          {create.isError && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
              {(create.error as Error)?.message ?? 'Error al crear el prospecto'}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={handleClose}
              className="flex-1 py-2 border border-gray-200 text-sm font-medium rounded-xl text-gray-600 hover:bg-gray-50">
              Cancelar
            </button>
            <button type="submit" disabled={create.isPending}
              className="flex-1 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-60">
              {create.isPending ? 'Creando...' : 'Crear prospecto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
