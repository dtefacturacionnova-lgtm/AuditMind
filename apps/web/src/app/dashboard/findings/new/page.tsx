'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Sparkles, Loader2, CheckCircle2, AlertTriangle,
  Wand2, Info, ChevronRight,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { useCreateFinding, type FindingSeverity, type CreateFindingData } from '@/hooks/useFindings';
import { useAudits, type Audit } from '@/hooks/useAudits';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────
interface GeneratedFinding {
  title: string;
  condition: string;
  criteria: string;
  cause: string;
  effect: string;
  risk: string;
  recommendation: string;
}

interface GenerateResponse {
  generated: GeneratedFinding;
  model: string;
  tokens_used?: { input: number; output: number };
}

const SEVERITY_OPTIONS: { value: FindingSeverity; label: string; color: string }[] = [
  { value: 'CRITICAL',      label: 'Crítico',      color: 'text-red-700 bg-red-50 border-red-200' },
  { value: 'HIGH',          label: 'Alto',          color: 'text-orange-700 bg-orange-50 border-orange-200' },
  { value: 'MEDIUM',        label: 'Medio',         color: 'text-yellow-700 bg-yellow-50 border-yellow-200' },
  { value: 'LOW',           label: 'Bajo',          color: 'text-blue-700 bg-blue-50 border-blue-200' },
  { value: 'INFORMATIONAL', label: 'Informativo',   color: 'text-gray-700 bg-gray-50 border-gray-200' },
];

const CCCERR_LABELS: Record<keyof Omit<GeneratedFinding, 'title'>, { label: string; desc: string; rows: number }> = {
  condition:      { label: 'Condición',       desc: '¿Qué fue encontrado? (situación actual)',        rows: 3 },
  criteria:       { label: 'Criterio',        desc: '¿Cuál es la norma o referencia aplicable?',      rows: 2 },
  cause:          { label: 'Causa',           desc: '¿Por qué ocurrió?',                              rows: 2 },
  effect:         { label: 'Efecto',          desc: '¿Cuál es el impacto para la organización?',      rows: 2 },
  risk:           { label: 'Riesgo',          desc: '¿Qué riesgo representa si no se corrige?',       rows: 2 },
  recommendation: { label: 'Recomendación',   desc: '¿Qué debería hacer la organización?',           rows: 3 },
};

// ─── Inner component (uses useSearchParams) ───────────────────────────────────
function NewFindingForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefilledAuditId = searchParams.get('auditId') ?? '';

  // Form fields
  const [auditId, setAuditId]               = useState(prefilledAuditId);
  const [severity, setSeverity]             = useState<FindingSeverity>('MEDIUM');
  const [title, setTitle]                   = useState('');
  const [description, setDescription]       = useState('');
  const [condition, setCondition]           = useState('');
  const [criteria, setCriteria]             = useState('');
  const [cause, setCause]                   = useState('');
  const [effect, setEffect]                 = useState('');
  const [risk, setRisk]                     = useState('');
  const [recommendation, setRecommendation] = useState('');
  const [effectAmount, setEffectAmount]     = useState('');
  const [isMaterial, setIsMaterial]         = useState(false);
  const [isRecurring, setIsRecurring]       = useState(false);

  // AI state
  const [isGenerating, setIsGenerating]       = useState(false);
  const [generatedFields, setGeneratedFields] = useState<Set<string>>(new Set());
  const [generateError, setGenerateError]     = useState('');
  const [aiModel, setAiModel]                 = useState('');

  // Audits list
  const { data: auditsData, isLoading: auditsLoading } = useAudits({ limit: 100 });
  const audits = auditsData?.data ?? [];
  const selectedAudit = audits.find(a => a.id === auditId);

  const createFinding = useCreateFinding();

  // Pre-select audit from URL if found in list
  useEffect(() => {
    if (prefilledAuditId && !auditId) setAuditId(prefilledAuditId);
  }, [prefilledAuditId, auditId]);

  async function handleGenerateWithAI() {
    if (!description.trim()) {
      setGenerateError('Escribe una descripción breve antes de generar.');
      return;
    }
    setGenerateError('');
    setIsGenerating(true);
    setGeneratedFields(new Set());
    try {
      const result = await apiClient.post<GenerateResponse>('/ai/scriptorium/generate-finding', {
        description: description.trim(),
        auditTitle: selectedAudit?.title,
        auditType: selectedAudit?.type,
        severity,
      });

      const g = result.generated;
      if (g.title)          { setTitle(g.title);               setGeneratedFields(prev => new Set([...prev, 'title'])); }
      if (g.condition)      { setCondition(g.condition);        setGeneratedFields(prev => new Set([...prev, 'condition'])); }
      if (g.criteria)       { setCriteria(g.criteria);          setGeneratedFields(prev => new Set([...prev, 'criteria'])); }
      if (g.cause)          { setCause(g.cause);                setGeneratedFields(prev => new Set([...prev, 'cause'])); }
      if (g.effect)         { setEffect(g.effect);              setGeneratedFields(prev => new Set([...prev, 'effect'])); }
      if (g.risk)           { setRisk(g.risk);                  setGeneratedFields(prev => new Set([...prev, 'risk'])); }
      if (g.recommendation) { setRecommendation(g.recommendation); setGeneratedFields(prev => new Set([...prev, 'recommendation'])); }

      setAiModel(result.model ?? '');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al contactar el servicio de IA.';
      setGenerateError(msg);
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!auditId) { setGenerateError('Selecciona una auditoría.'); return; }

    const data: CreateFindingData = {
      title,
      severity,
      auditId,
      condition,
      criteria,
      cause,
      effect,
      risk: risk || undefined,
      recommendation: recommendation || undefined,
      effectAmount: effectAmount ? parseFloat(effectAmount) : undefined,
      isMaterial,
      isRecurring,
    };

    await createFinding.mutateAsync(data);
    router.push('/dashboard/findings');
  }

  const hasGeneratedContent = generatedFields.size > 0;
  const canGenerate = description.trim().length >= 10;
  const canSubmit = auditId && title && condition && criteria && cause && effect;

  return (
    <div className="flex flex-col h-full">
      <Header title="Nuevo Hallazgo" />

      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">

          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/dashboard" className="hover:text-gray-800">Dashboard</Link>
            <ChevronRight className="w-4 h-4" />
            <Link href="/dashboard/findings" className="hover:text-gray-800">Hallazgos</Link>
            <ChevronRight className="w-4 h-4" />
            <span className="text-gray-800 font-medium">Nuevo hallazgo</span>
          </nav>

          <form onSubmit={handleSubmit} className="space-y-6">

            {/* ── Paso 1: Auditoría y Severidad ─────────────────────────── */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
              <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#0F2D4A] text-white text-xs flex items-center justify-center font-bold">1</span>
                Contexto del hallazgo
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Audit selector */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Auditoría <span className="text-red-500">*</span>
                  </label>
                  {auditsLoading ? (
                    <div className="h-10 bg-gray-100 rounded-lg animate-pulse" />
                  ) : (
                    <select
                      value={auditId}
                      onChange={e => setAuditId(e.target.value)}
                      required
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/30 bg-white"
                    >
                      <option value="">Selecciona una auditoría…</option>
                      {audits.map(a => (
                        <option key={a.id} value={a.id}>
                          [{a.code}] {a.title}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Severity */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Severidad <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {SEVERITY_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setSeverity(opt.value)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                          severity === opt.value
                            ? opt.color + ' ring-2 ring-offset-1 ring-current'
                            : 'text-gray-500 bg-gray-50 border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Paso 2: IA Generate ────────────────────────────────────── */}
            <div className="bg-gradient-to-br from-violet-50 to-purple-50 rounded-xl border border-violet-200 p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Wand2 className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-violet-900">
                    Generar con IA — Scriptorium
                  </h2>
                  <p className="text-xs text-violet-600 mt-0.5">
                    Describe brevemente el problema detectado. Scriptorium redactará el hallazgo
                    completo en formato C-C-C-E-R-R siguiendo estándares de auditoría.
                  </p>
                </div>
              </div>

              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Ej: Se encontraron pagos duplicados en el sistema de cuentas por pagar, donde varios proveedores recibieron doble pago por las mismas facturas durante el período de auditoría…"
                rows={4}
                className="w-full px-4 py-3 text-sm border border-violet-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white/80 resize-none placeholder-gray-400"
              />

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleGenerateWithAI}
                  disabled={isGenerating || !canGenerate}
                  className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generando con IA…
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      ✨ Generar hallazgo con IA
                    </>
                  )}
                </button>

                {hasGeneratedContent && !isGenerating && (
                  <span className="flex items-center gap-1.5 text-xs text-emerald-700 font-medium bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Generado con {aiModel || 'IA'}
                  </span>
                )}
              </div>

              {generateError && (
                <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  {generateError}
                </div>
              )}

              {isGenerating && (
                <div className="flex flex-col items-center gap-3 py-4">
                  <div className="flex gap-1.5">
                    {[0, 1, 2, 3, 4].map(i => (
                      <div
                        key={i}
                        className="w-2 h-2 rounded-full bg-violet-400 animate-bounce"
                        style={{ animationDelay: `${i * 100}ms` }}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-violet-500">Scriptorium está redactando el hallazgo…</p>
                </div>
              )}
            </div>

            {/* ── Paso 3: Campos del hallazgo ───────────────────────────── */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
              <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#0F2D4A] text-white text-xs flex items-center justify-center font-bold">3</span>
                Redacción del hallazgo
                {hasGeneratedContent && (
                  <span className="ml-2 flex items-center gap-1 text-xs text-violet-600 font-normal bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full">
                    <Sparkles className="w-3 h-3" />
                    Campos con IA aplicada
                  </span>
                )}
              </h2>

              {/* Title */}
              <FieldRow
                label="Título del hallazgo"
                required
                isAI={generatedFields.has('title')}
                hint="Nombre corto y descriptivo del hallazgo"
              >
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  required
                  placeholder="Ej: Pagos duplicados a proveedores en sistema AP"
                  className={fieldClass(generatedFields.has('title'))}
                />
              </FieldRow>

              {/* C-C-C-E-R-R Fields */}
              {(Object.keys(CCCERR_LABELS) as (keyof typeof CCCERR_LABELS)[]).map(key => {
                const meta  = CCCERR_LABELS[key];
                const value = getFieldValue(key, { condition, criteria, cause, effect, risk, recommendation });
                const setter = getFieldSetter(key, { setCondition, setCriteria, setCause, setEffect, setRisk, setRecommendation });
                const isRequired = ['condition', 'criteria', 'cause', 'effect'].includes(key);
                return (
                  <FieldRow
                    key={key}
                    label={meta.label}
                    required={isRequired}
                    isAI={generatedFields.has(key)}
                    hint={meta.desc}
                  >
                    <textarea
                      value={value}
                      onChange={e => setter(e.target.value)}
                      required={isRequired}
                      rows={meta.rows}
                      placeholder={`${meta.label}…`}
                      className={fieldClass(generatedFields.has(key)) + ' resize-none'}
                    />
                  </FieldRow>
                );
              })}

              {/* Optional fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-gray-100">
                <FieldRow label="Monto del efecto (USD)" isAI={false}>
                  <input
                    type="number"
                    value={effectAmount}
                    onChange={e => setEffectAmount(e.target.value)}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/30"
                  />
                </FieldRow>
                <div className="space-y-3 pt-6">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isMaterial}
                      onChange={e => setIsMaterial(e.target.checked)}
                      className="w-4 h-4 rounded text-[#0F2D4A] border-gray-300 focus:ring-[#0F2D4A]"
                    />
                    <span className="text-sm text-gray-700">Es un hallazgo material</span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isRecurring}
                      onChange={e => setIsRecurring(e.target.checked)}
                      className="w-4 h-4 rounded text-[#0F2D4A] border-gray-300 focus:ring-[#0F2D4A]"
                    />
                    <span className="text-sm text-gray-700">Es un hallazgo recurrente</span>
                  </label>
                </div>
              </div>
            </div>

            {/* ── Actions ──────────────────────────────────────────────── */}
            <div className="flex items-center justify-between pb-6">
              <Link
                href="/dashboard/findings"
                className="flex items-center gap-2 px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Cancelar
              </Link>
              <button
                type="submit"
                disabled={!canSubmit || createFinding.isPending}
                className="flex items-center gap-2 px-6 py-2.5 bg-[#0F2D4A] text-white rounded-xl text-sm font-semibold hover:bg-[#1a3f5f] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                {createFinding.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creando…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Crear hallazgo
                  </>
                )}
              </button>
            </div>

          </form>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fieldClass(isAI: boolean) {
  return `w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 transition-colors ${
    isAI
      ? 'border-violet-300 bg-violet-50/40 focus:ring-violet-400/40 focus:border-violet-400'
      : 'border-gray-200 bg-white focus:ring-[#0F2D4A]/20 focus:border-[#0F2D4A]/40'
  }`;
}

function FieldRow({
  label, required, isAI, hint, children,
}: {
  label: string;
  required?: boolean;
  isAI: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <label className="text-sm font-medium text-gray-700">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        {isAI && (
          <span className="flex items-center gap-1 text-[10px] font-medium text-violet-600 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded-full">
            <Sparkles className="w-2.5 h-2.5" />
            IA
          </span>
        )}
        {hint && (
          <span className="text-xs text-gray-400 flex items-center gap-0.5 ml-auto">
            <Info className="w-3 h-3" />
            {hint}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function getFieldValue(
  key: keyof typeof CCCERR_LABELS,
  values: { condition: string; criteria: string; cause: string; effect: string; risk: string; recommendation: string },
): string {
  return values[key];
}

function getFieldSetter(
  key: keyof typeof CCCERR_LABELS,
  setters: {
    setCondition: (v: string) => void;
    setCriteria: (v: string) => void;
    setCause: (v: string) => void;
    setEffect: (v: string) => void;
    setRisk: (v: string) => void;
    setRecommendation: (v: string) => void;
  },
): (v: string) => void {
  const map: Record<string, (v: string) => void> = {
    condition: setters.setCondition,
    criteria:  setters.setCriteria,
    cause:     setters.setCause,
    effect:    setters.setEffect,
    risk:      setters.setRisk,
    recommendation: setters.setRecommendation,
  };
  return map[key];
}

// ─── Page wrapper (Suspense for useSearchParams) ──────────────────────────────
export default function NewFindingPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col h-full">
        <Header title="Nuevo Hallazgo" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </div>
    }>
      <NewFindingForm />
    </Suspense>
  );
}
