'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { useCreateAudit } from '@/hooks/useAudits';
import { useAuditUniverse } from '@/hooks/useAuditUniverse';
import { useAuditTemplates } from '@/hooks/useAuditTemplates';
import { AUDIT_TYPES, AUDIT_SUBTYPES } from '@/lib/audit-types';

interface FormData {
  title:   string;
  type:    string;
  subtype: string;
  auditableUnitId: string;
  startDate: string;
  endDate: string;
  plannedHours: string;
  scope: string;
  objectives: string;
  isInvestigationMode: boolean;
  // Materiality
  enableMateriality: boolean;
  materialityBase: string;
  materialityBaseDescription: string;
  materialityPercentage: string;
  // Risk model
  enableRiskModel: boolean;
  inherentRisk: string;
  controlRisk: string;
}

const INITIAL_FORM: FormData = {
  title:   '',
  type:    'FINANCIAL',
  subtype: '',
  auditableUnitId: '',
  startDate: '',
  endDate: '',
  plannedHours: '',
  scope: '',
  objectives: '',
  isInvestigationMode: false,
  enableMateriality: false,
  materialityBase: '',
  materialityBaseDescription: '',
  materialityPercentage: '2',
  enableRiskModel: false,
  inherentRisk: '0.6',
  controlRisk: '0.5',
};

function computeMaterialityPreview(base: number, pct: number) {
  const mg = (base * pct) / 100;
  return { mg, me: mg * 0.75, uae: mg * 0.5 };
}

function computeRiskPreview(ir: number, cr: number) {
  const dr = Math.min(0.05 / (ir * cr), 1);
  return { dr, ar: ir * cr * dr };
}

export default function NewAuditPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  const [templateId, setTemplateId] = useState<string>('');
  const [scaffoldMode, setScaffoldMode] = useState<'FULL' | 'STRUCTURE_ONLY'>('FULL');

  const createAudit = useCreateAudit();
  const { data: universeData } = useAuditUniverse({ limit: 100 });
  const { data: templates } = useAuditTemplates(form.type);

  function set(field: keyof FormData, value: string | boolean) {
    setForm((prev) => ({
      ...prev,
      [field]: value,
      // Reset subtype when type changes
      ...(field === 'type' ? { subtype: '' } : {}),
    }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function validate(): boolean {
    const newErrors: typeof errors = {};
    if (!form.title.trim()) newErrors.title = 'El título es requerido';
    if (!form.type) newErrors.type = 'El tipo es requerido';
    if (!form.auditableUnitId) newErrors.auditableUnitId = 'Selecciona una unidad auditable';
    if (!form.startDate) newErrors.startDate = 'La fecha de inicio es requerida';
    if (!form.endDate) newErrors.endDate = 'La fecha de fin es requerida';
    if (form.startDate && form.endDate && form.startDate >= form.endDate) {
      newErrors.endDate = 'La fecha de fin debe ser posterior al inicio';
    }
    if (form.enableMateriality) {
      if (!form.materialityBase || Number(form.materialityBase) <= 0) {
        newErrors.materialityBase = 'Base de materialidad requerida';
      }
      if (!form.materialityBaseDescription.trim()) {
        newErrors.materialityBaseDescription = 'Descripción de base requerida';
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    const payload: any = {
      title:           form.title.trim(),
      type:            form.type,
      subtype:         form.subtype || undefined,
      auditableUnitId: form.auditableUnitId,
      startDate: form.startDate,
      endDate: form.endDate,
      plannedHours: form.plannedHours ? Number(form.plannedHours) : undefined,
      scope: form.scope.trim() || undefined,
      objectives: form.objectives.trim() || undefined,
      isInvestigationMode: form.isInvestigationMode,
      templateId: templateId || undefined,
      scaffoldMode: templateId ? scaffoldMode : undefined,
    };

    if (form.enableMateriality && form.materialityBase) {
      payload.materiality = {
        base: Number(form.materialityBase),
        baseDescription: form.materialityBaseDescription,
        percentage: Number(form.materialityPercentage),
      };
    }

    if (form.enableRiskModel && form.inherentRisk && form.controlRisk) {
      payload.auditRiskModel = {
        inherentRisk: Number(form.inherentRisk),
        controlRisk: Number(form.controlRisk),
      };
    }

    try {
      const audit = await createAudit.mutateAsync(payload) as { id: string };
      router.push(`/dashboard/audits/${audit.id}`);
    } catch (err: any) {
      setErrors({ title: err.message ?? 'Error al crear la auditoría' });
    }
  }

  const matPreview = form.enableMateriality && form.materialityBase && form.materialityPercentage
    ? computeMaterialityPreview(Number(form.materialityBase), Number(form.materialityPercentage))
    : null;

  const riskPreview = form.enableRiskModel && form.inherentRisk && form.controlRisk
    ? computeRiskPreview(Number(form.inherentRisk), Number(form.controlRisk))
    : null;

  return (
    <div className="flex flex-col h-screen bg-[#F0F4F8]">
      <Header />

      <div className="flex-1 overflow-auto">
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="max-w-3xl mx-auto">
            <nav className="flex items-center gap-2 text-sm text-gray-500 mb-3">
              <Link href="/dashboard" className="hover:text-gray-800">Dashboard</Link>
              <ChevronRight className="h-4 w-4" />
              <Link href="/dashboard/audits" className="hover:text-gray-800">Auditorías</Link>
              <ChevronRight className="h-4 w-4" />
              <span className="text-gray-800 font-medium">Nueva Auditoría</span>
            </nav>
            <div className="flex items-center gap-3">
              <Link href="/dashboard/audits" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">Nueva Auditoría</h1>
            </div>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-6 py-8">
          <form onSubmit={handleSubmit} className="space-y-6">

            {/* Basic info */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
              <h2 className="text-base font-semibold text-gray-800">Información General</h2>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Título <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => set('title', e.target.value)}
                  placeholder="Ej. Auditoría Financiera Q2 2026 — División Norte"
                  className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/30 ${
                    errors.title ? 'border-red-300 bg-red-50' : 'border-gray-200'
                  }`}
                />
                {errors.title && <FieldError msg={errors.title} />}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Tipo <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.type}
                    onChange={(e) => set('type', e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/30"
                  >
                    {AUDIT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Unidad Auditable <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.auditableUnitId}
                    onChange={(e) => set('auditableUnitId', e.target.value)}
                    className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/30 ${
                      errors.auditableUnitId ? 'border-red-300 bg-red-50' : 'border-gray-200'
                    }`}
                  >
                    <option value="">Seleccionar unidad...</option>
                    {universeData?.data?.map((unit: any) => (
                      <option key={unit.id} value={unit.id}>{unit.name}</option>
                    ))}
                  </select>
                  {errors.auditableUnitId && <FieldError msg={errors.auditableUnitId} />}
                </div>
              </div>

              {/* Subtype selector — shown only when the selected type has subtypes */}
              {AUDIT_SUBTYPES[form.type]?.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Sub-tipo
                    <span className="ml-1.5 text-[10px] text-gray-400 font-normal normal-case">
                      (opcional)
                    </span>
                  </label>
                  <select
                    value={form.subtype}
                    onChange={(e) => set('subtype', e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/30"
                  >
                    <option value="">— Sin sub-tipo —</option>
                    {AUDIT_SUBTYPES[form.type].map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Plantilla de Papeles */}
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Plantilla de Papeles de Trabajo
                  </label>
                  <select
                    value={templateId}
                    onChange={(e) => {
                      setTemplateId(e.target.value);
                      // Reset to FULL when template changes
                      setScaffoldMode('FULL');
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="">Sin plantilla (expediente manual)</option>
                    {(templates ?? []).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} — {t.papers.length} papeles{t.isDefault ? ' ★' : ''}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-slate-500">
                    {templateId
                      ? 'La plantilla define qué papeles de trabajo se crean automáticamente'
                      : 'Sin plantilla: se iniciará con una carpeta vacía "Plantilla de Índice"'}
                  </p>
                </div>

                {/* Scaffold mode — solo cuando hay plantilla seleccionada */}
                {templateId && (
                  <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 space-y-2.5">
                    <p className="text-xs font-semibold text-blue-800">¿Qué desea crear desde la plantilla?</p>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="scaffoldMode"
                        value="FULL"
                        checked={scaffoldMode === 'FULL'}
                        onChange={() => setScaffoldMode('FULL')}
                        className="mt-0.5 accent-blue-600"
                      />
                      <div>
                        <p className="text-sm font-medium text-slate-800">Estructura completa + todos los papeles</p>
                        <p className="text-xs text-slate-500">Crea automáticamente cada papel de trabajo definido en la plantilla</p>
                      </div>
                    </label>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="scaffoldMode"
                        value="STRUCTURE_ONLY"
                        checked={scaffoldMode === 'STRUCTURE_ONLY'}
                        onChange={() => setScaffoldMode('STRUCTURE_ONLY')}
                        className="mt-0.5 accent-blue-600"
                      />
                      <div>
                        <p className="text-sm font-medium text-slate-800">Solo la estructura de carpetas</p>
                        <p className="text-xs text-slate-500">No crea papeles ahora — los podrás agregar individualmente desde el expediente cuando los necesites</p>
                      </div>
                    </label>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Fecha Inicio <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => set('startDate', e.target.value)}
                    className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/30 ${
                      errors.startDate ? 'border-red-300 bg-red-50' : 'border-gray-200'
                    }`}
                  />
                  {errors.startDate && <FieldError msg={errors.startDate} />}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Fecha Fin <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={(e) => set('endDate', e.target.value)}
                    className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/30 ${
                      errors.endDate ? 'border-red-300 bg-red-50' : 'border-gray-200'
                    }`}
                  />
                  {errors.endDate && <FieldError msg={errors.endDate} />}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Horas Estimadas</label>
                  <input
                    type="number"
                    min={0}
                    value={form.plannedHours}
                    onChange={(e) => set('plannedHours', e.target.value)}
                    placeholder="Ej. 120"
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/30"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Alcance</label>
                <textarea
                  value={form.scope}
                  onChange={(e) => set('scope', e.target.value)}
                  placeholder="Describe el alcance de la auditoría..."
                  rows={3}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/30"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Objetivos</label>
                <textarea
                  value={form.objectives}
                  onChange={(e) => set('objectives', e.target.value)}
                  placeholder="Define los objetivos de la auditoría..."
                  rows={3}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/30"
                />
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isInvestigationMode}
                  onChange={(e) => set('isInvestigationMode', e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-[#0F2D4A]"
                />
                <div>
                  <p className="text-sm font-medium text-gray-700">Modo Investigación</p>
                  <p className="text-xs text-gray-400">Restringe el acceso solo al equipo asignado y roles privilegiados</p>
                </div>
              </label>
            </div>

            {/* Materiality */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <label className="flex items-center gap-3 cursor-pointer mb-4">
                <input
                  type="checkbox"
                  checked={form.enableMateriality}
                  onChange={(e) => set('enableMateriality', e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-[#0F2D4A]"
                />
                <div>
                  <p className="text-sm font-semibold text-gray-800">Materialidad (NIA 320)</p>
                  <p className="text-xs text-gray-400">Define umbrales de materialidad para esta auditoría</p>
                </div>
              </label>

              {form.enableMateriality && (
                <div className="space-y-4 border-t border-gray-100 pt-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Base de Materialidad <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={form.materialityBase}
                        onChange={(e) => set('materialityBase', e.target.value)}
                        placeholder="Ej. 5000000"
                        className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/30 ${
                          errors.materialityBase ? 'border-red-300 bg-red-50' : 'border-gray-200'
                        }`}
                      />
                      {errors.materialityBase && <FieldError msg={errors.materialityBase} />}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Porcentaje (%)</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        value={form.materialityPercentage}
                        onChange={(e) => set('materialityPercentage', e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/30"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Descripción de la Base <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.materialityBaseDescription}
                      onChange={(e) => set('materialityBaseDescription', e.target.value)}
                      placeholder="Ej. Activos totales al 31/12/2025"
                      className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/30 ${
                        errors.materialityBaseDescription ? 'border-red-300 bg-red-50' : 'border-gray-200'
                      }`}
                    />
                    {errors.materialityBaseDescription && <FieldError msg={errors.materialityBaseDescription} />}
                  </div>

                  {matPreview && (
                    <div className="bg-indigo-50 rounded-xl p-4 grid grid-cols-3 gap-3">
                      {[
                        { label: 'MG', value: matPreview.mg },
                        { label: 'ME (75%)', value: matPreview.me },
                        { label: 'UAE (50%)', value: matPreview.uae },
                      ].map((item) => (
                        <div key={item.label} className="text-center">
                          <p className="text-xs text-indigo-500 font-medium">{item.label}</p>
                          <p className="font-bold text-indigo-800 font-mono text-sm">
                            ${item.value.toLocaleString('es-CL', { maximumFractionDigits: 0 })}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Risk model */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <label className="flex items-center gap-3 cursor-pointer mb-4">
                <input
                  type="checkbox"
                  checked={form.enableRiskModel}
                  onChange={(e) => set('enableRiskModel', e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-[#0F2D4A]"
                />
                <div>
                  <p className="text-sm font-semibold text-gray-800">Modelo de Riesgo (NIA 200)</p>
                  <p className="text-xs text-gray-400">RI × RC × RD = 5% — Calcula riesgo de detección</p>
                </div>
              </label>

              {form.enableRiskModel && (
                <div className="space-y-4 border-t border-gray-100 pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Riesgo Inherente (0–1)</label>
                      <input
                        type="number"
                        min={0} max={1} step={0.05}
                        value={form.inherentRisk}
                        onChange={(e) => set('inherentRisk', e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/30"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Riesgo de Control (0–1)</label>
                      <input
                        type="number"
                        min={0} max={1} step={0.05}
                        value={form.controlRisk}
                        onChange={(e) => set('controlRisk', e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/30"
                      />
                    </div>
                  </div>

                  {riskPreview && (
                    <div className="bg-orange-50 rounded-xl p-4 grid grid-cols-2 gap-3">
                      <div className="text-center">
                        <p className="text-xs text-orange-500 font-medium">Riesgo de Detección (RD)</p>
                        <p className="font-bold text-orange-800 font-mono">{(riskPreview.dr * 100).toFixed(1)}%</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-orange-500 font-medium">Riesgo de Auditoría (RA)</p>
                        <p className={`font-bold font-mono ${riskPreview.ar <= 0.05 ? 'text-emerald-700' : 'text-red-700'}`}>
                          {(riskPreview.ar * 100).toFixed(2)}%
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Submit */}
            <div className="flex items-center justify-end gap-3 pb-8">
              <Link
                href="/dashboard/audits"
                className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm font-medium"
              >
                Cancelar
              </Link>
              <button
                type="submit"
                disabled={createAudit.isPending}
                className="px-6 py-2.5 bg-[#0F2D4A] text-white rounded-xl text-sm font-semibold hover:bg-[#1a3f5f] disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {createAudit.isPending ? (
                  <>
                    <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    Creando...
                  </>
                ) : (
                  'Crear Auditoría'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function FieldError({ msg }: { msg: string }) {
  return (
    <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
      <AlertTriangle className="h-3 w-3" />
      {msg}
    </p>
  );
}
