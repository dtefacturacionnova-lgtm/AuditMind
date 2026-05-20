'use client';
import { useState } from 'react';
import { Plus, Search, Globe, AlertTriangle, TrendingUp, BarChart2, Edit2, Trash2 } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import {
  useAuditUniverse, useRiskSummary, useCreateAuditUnit, useDeleteAuditUnit,
  type AuditableUnit,
} from '@/hooks/useAuditUniverse';
import { useDebounce } from '@/hooks/useDebounce';

const RISK_SCORE_STYLE = (score: number) => {
  if (score >= 80) return { bar: 'bg-red-500', badge: 'bg-red-100 text-red-700', label: 'Crítico' };
  if (score >= 60) return { bar: 'bg-orange-500', badge: 'bg-orange-100 text-orange-700', label: 'Alto' };
  if (score >= 40) return { bar: 'bg-yellow-400', badge: 'bg-yellow-100 text-yellow-800', label: 'Medio' };
  return { bar: 'bg-blue-400', badge: 'bg-blue-100 text-blue-700', label: 'Bajo' };
};

interface UnitFormData {
  name: string;
  description: string;
  category: string;
  location: string;
  responsible: string;
  riskScore: string;
}

const EMPTY_FORM: UnitFormData = {
  name: '', description: '', category: 'Proceso',
  location: '', responsible: '', riskScore: '50',
};

const CATEGORIES = ['Proceso', 'Área', 'Filial', 'Proyecto', 'Sistema', 'Proveedor', 'Otro'];

export default function UniversePage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<UnitFormData>(EMPTY_FORM);
  const [formError, setFormError] = useState('');

  const debouncedSearch = useDebounce(search, 300);
  const { data, isLoading } = useAuditUniverse({ page, limit: 15, search: debouncedSearch || undefined });
  const { data: riskSummary } = useRiskSummary();
  const createUnit = useCreateAuditUnit();
  const deleteUnit = useDeleteAuditUnit();

  function setField(k: keyof UnitFormData, v: string) {
    setForm((p) => ({ ...p, [k]: v }));
    if (formError) setFormError('');
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setFormError('El nombre es requerido'); return; }

    await createUnit.mutateAsync({
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      division: form.category,
      location: form.location.trim() || undefined,
      responsibleId: form.responsible.trim() || undefined,
      riskScore: Number(form.riskScore),
    });
    setShowForm(false);
    setForm(EMPTY_FORM);
  }

  const units = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="flex flex-col h-screen bg-[#F0F4F8]">
      <Header />

      <div className="flex-1 overflow-auto">
        <div className="bg-white border-b border-gray-200 px-6 py-5">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Globe className="h-6 w-6 text-[#0F2D4A]" />
                Universo de Auditoría
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {meta?.total ?? 0} unidades auditables registradas
              </p>
            </div>
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#0F2D4A] text-white rounded-xl text-sm font-medium hover:bg-[#1a3f5f]"
            >
              <Plus className="h-4 w-4" />
              Nueva Unidad
            </button>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
          {/* Risk summary */}
          {riskSummary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Crítico', key: 'CRITICAL', color: 'border-l-red-500 bg-red-50', text: 'text-red-700' },
                { label: 'Alto', key: 'HIGH', color: 'border-l-orange-500 bg-orange-50', text: 'text-orange-700' },
                { label: 'Medio', key: 'MEDIUM', color: 'border-l-yellow-400 bg-yellow-50', text: 'text-yellow-800' },
                { label: 'Bajo', key: 'LOW', color: 'border-l-blue-400 bg-blue-50', text: 'text-blue-700' },
              ].map((item) => (
                <div key={item.key} className={`rounded-xl border-l-4 p-4 ${item.color}`}>
                  <p className="text-xs text-gray-500 mb-1">{item.label}</p>
                  <p className={`text-2xl font-bold ${item.text}`}>
                    {riskSummary[item.key as keyof typeof riskSummary]}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Search */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Buscar por nombre, categoría..."
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/30 bg-white"
            />
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0F2D4A]" />
              </div>
            ) : units.length === 0 ? (
              <div className="text-center py-16">
                <Globe className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">Sin unidades auditables</p>
                <p className="text-sm text-gray-400 mt-1">Crea la primera unidad para comenzar</p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Unidad / Categoría</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Responsable</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Riesgo Inherente</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Auditorías</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {units.map((unit) => {
                    const rs = RISK_SCORE_STYLE(unit.inherentRiskScore);
                    return (
                      <tr key={unit.id} className="hover:bg-blue-50/30 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-800">{unit.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{unit.category}</p>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span className="text-sm text-gray-600">{unit.responsible || '—'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${rs.bar}`}
                                style={{ width: `${unit.inherentRiskScore}%` }}
                              />
                            </div>
                            <span className="font-mono text-xs text-gray-600">{unit.inherentRiskScore}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${rs.badge}`}>
                              {rs.label}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center hidden lg:table-cell">
                          <span className="text-sm text-gray-600">{unit._count?.audits ?? 0}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-end">
                            <button className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => deleteUnit.mutate(unit.id)}
                              className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">
                {((page - 1) * 15) + 1}–{Math.min(page * 15, meta.total)} de {meta.total}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => p - 1)}
                  disabled={!meta.hasPrev}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                >
                  Anterior
                </button>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!meta.hasNext}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Nueva Unidad Auditable</h3>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Nombre <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setField('name', e.target.value)}
                  placeholder="Ej. División de Finanzas"
                  className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/30 ${formError ? 'border-red-300' : 'border-gray-200'}`}
                />
                {formError && <p className="mt-1 text-xs text-red-600">{formError}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Categoría</label>
                  <select
                    value={form.category}
                    onChange={(e) => setField('category', e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/30"
                  >
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Ubicación</label>
                  <input
                    type="text"
                    value={form.location}
                    onChange={(e) => setField('location', e.target.value)}
                    placeholder="Ej. Santiago"
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/30"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Responsable</label>
                <input
                  type="text"
                  value={form.responsible}
                  onChange={(e) => setField('responsible', e.target.value)}
                  placeholder="Nombre del responsable"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/30"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Puntuación de Riesgo Inherente: <span className="font-bold">{form.riskScore}/100</span>
                </label>
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={form.riskScore}
                  onChange={(e) => setField('riskScore', e.target.value)}
                  className="w-full accent-[#0F2D4A]"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                  <span>Bajo (1)</span>
                  <span>Crítico (100)</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Descripción</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setField('description', e.target.value)}
                  rows={2}
                  placeholder="Descripción opcional..."
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/30"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createUnit.isPending}
                  className="flex-1 py-2.5 bg-[#0F2D4A] text-white rounded-xl text-sm font-semibold hover:bg-[#1a3f5f] disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {createUnit.isPending ? (
                    <><span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Creando...</>
                  ) : 'Crear Unidad'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
