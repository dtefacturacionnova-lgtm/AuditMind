'use client';

import { useState, Component, type ErrorInfo, type ReactNode } from 'react';
import { Loader2, LayoutTemplate, CheckCircle2, AlertTriangle, RefreshCw, Sparkles } from 'lucide-react';
import {
  usePaperSections,
  useUpdateSection,
  useInitFromTemplate,
  useMentionIndex,
  useCreateReference,
  usePropagateTrialBalance,
  usePropagateAjustes,
  usePropagateFinancialAnalysis,
  usePropagateDiferencias,
  usePropagateControlDeficiencias,
  usePropagateConfirmaciones,
  usePropagateNia530ToMrci,
  usePropagateSegregacionToMrci,
  useRecalculateCosoComponentAnalysis,
  usePropagateHallazgosToFindings,
  useSeedSubstantiveProcedures,
  useSeedCosoQuestions,
} from '@/hooks/useWorkingPaperGraph';
import { SectionField } from './SectionField';
import type { AiDraftConfig } from './SectionField';
import { WorkOfflinePanel } from './WorkOfflinePanel';
import { FieldEvidencePanel } from './FieldEvidencePanel';
import { TrialBalanceImporter, AccountClassifier, AccountSemaforo } from './TrialBalancePanel';
import { MaterialidadPanel } from './MaterialidadPanel';
import { SamplingExecutionPanel } from './SamplingExecutionPanel';
import { RatioTrendChart, ConcentrationChart, VariationChart, AjeImpactChart, MaterialityBridgeChart } from './AnalyticsCharts';
import { CosoScorePanel, CosoPrincipleMiniChart, COSO_COMPONENTS } from './CosoScorePanel';
import { MethodologyInfo } from './MethodologyInfo';

// ─── PT-FIN-B07 S1 — botón "Propagar desde Balance" (B-00 S2 → Horizontal) ────

function BalancePropagateBar({ paperId }: { paperId: string }) {
  const propagate = usePropagateFinancialAnalysis();
  const [msg, setMsg] = useState('');
  const [isError, setIsError] = useState(false);

  async function handleClick() {
    setMsg('');
    setIsError(false);
    try {
      const res = await propagate.mutateAsync(paperId);
      setMsg(res.message);
      setIsError(false);
    } catch (err) {
      setMsg((err as Error).message || 'Error al propagar el balance');
      setIsError(true);
    }
  }

  return (
    <div className="pt-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[11px] text-gray-400">
          Trae los saldos de 3 períodos ya clasificados en B-00 (Clasificador de Cuentas) y calcula las variaciones.
        </p>
        <button
          type="button"
          onClick={handleClick}
          disabled={propagate.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors shrink-0"
          title="Traer saldos clasificados desde B-00 y calcular variaciones"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${propagate.isPending ? 'animate-spin' : ''}`} />
          {propagate.isPending ? 'Propagando…' : 'Propagar desde Balance'}
        </button>
      </div>
      {msg && (
        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 mt-2 text-xs ${
          isError ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-indigo-50 border border-indigo-200 text-indigo-700'
        }`}>
          {isError ? <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> : <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
          {msg}
        </div>
      )}
    </div>
  );
}

// ─── PT-FIN-B08 S1 — botón "Consolidar Diferencias" (C-SUST/C-NORM → B08) ─────

function DiferenciasPropagateBar({ paperId }: { paperId: string }) {
  const propagate = usePropagateDiferencias();
  const [msg, setMsg] = useState('');
  const [isError, setIsError] = useState(false);

  async function handleClick() {
    setMsg('');
    setIsError(false);
    try {
      const res = await propagate.mutateAsync(paperId);
      setMsg(res.message);
      setIsError(false);
    } catch (err) {
      setMsg((err as Error).message || 'Error al consolidar las diferencias');
      setIsError(true);
    }
  }

  return (
    <div className="pt-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[11px] text-gray-400">
          Trae las diferencias de S1 de cada papel de ejecución (C-01..C-14, C-13/C-15) y recalcula S2/S3 vs materialidad.
        </p>
        <button
          type="button"
          onClick={handleClick}
          disabled={propagate.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors shrink-0"
          title="Consolidar diferencias desde los papeles de ejecución"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${propagate.isPending ? 'animate-spin' : ''}`} />
          {propagate.isPending ? 'Consolidando…' : 'Consolidar Diferencias'}
        </button>
      </div>
      {msg && (
        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 mt-2 text-xs ${
          isError ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-indigo-50 border border-indigo-200 text-indigo-700'
        }`}>
          {isError ? <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> : <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
          {msg}
        </div>
      )}
    </div>
  );
}

// ─── PT-FIN-C-SUST S3 — botón "Cargar Procedimientos Sugeridos" (biblioteca) ──

function SeedProceduresBar({ paperId }: { paperId: string }) {
  const seed = useSeedSubstantiveProcedures();
  const [msg, setMsg] = useState('');
  const [isError, setIsError] = useState(false);

  async function handleClick() {
    setMsg('');
    setIsError(false);
    try {
      const res = await seed.mutateAsync(paperId);
      setMsg(res.message);
      setIsError(false);
    } catch (err) {
      setMsg((err as Error).message || 'Error al cargar los procedimientos');
      setIsError(true);
    }
  }

  return (
    <div className="pt-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[11px] text-gray-400">
          Trae los procedimientos de la biblioteca sustantiva para esta área — nunca borra ni pisa filas ya llenadas.
        </p>
        <button
          type="button"
          onClick={handleClick}
          disabled={seed.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white text-xs font-semibold rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors shrink-0"
          title="Cargar procedimientos sugeridos de la biblioteca sustantiva"
        >
          <Sparkles className={`w-3.5 h-3.5 ${seed.isPending ? 'animate-pulse' : ''}`} />
          {seed.isPending ? 'Cargando…' : 'Cargar Procedimientos Sugeridos'}
        </button>
      </div>
      {msg && (
        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 mt-2 text-xs ${
          isError ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-violet-50 border border-violet-200 text-violet-700'
        }`}>
          {isError ? <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> : <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
          {msg}
        </div>
      )}
    </div>
  );
}

// ─── PT-COSO S1-S5 — botón "Cargar Preguntas Sugeridas" (biblioteca COSO) ─────

function SeedCosoQuestionsBar({ paperId, sectionKey }: { paperId: string; sectionKey: string }) {
  const seed = useSeedCosoQuestions();
  const [msg, setMsg] = useState('');
  const [isError, setIsError] = useState(false);

  async function handleClick() {
    setMsg('');
    setIsError(false);
    try {
      const res = await seed.mutateAsync({ paperId, sectionKey });
      setMsg(res.message);
      setIsError(false);
    } catch (err) {
      setMsg((err as Error).message || 'Error al cargar las preguntas');
      setIsError(true);
    }
  }

  return (
    <div className="pt-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[11px] text-gray-400">
          Trae las preguntas de evaluación de la biblioteca COSO para este componente — nunca borra ni pisa filas ya llenadas.
        </p>
        <button
          type="button"
          onClick={handleClick}
          disabled={seed.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white text-xs font-semibold rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors shrink-0"
          title="Cargar preguntas sugeridas de la biblioteca de evaluación COSO"
        >
          <Sparkles className={`w-3.5 h-3.5 ${seed.isPending ? 'animate-pulse' : ''}`} />
          {seed.isPending ? 'Cargando…' : 'Cargar Preguntas Sugeridas'}
        </button>
      </div>
      {msg && (
        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 mt-2 text-xs ${
          isError ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-violet-50 border border-violet-200 text-violet-700'
        }`}>
          {isError ? <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> : <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
          {msg}
        </div>
      )}
    </div>
  );
}

// ─── PT-NIA265 S1 — botón "Consolidar Deficiencias" desde PT-A3 y PT-ITGC ─────

function DeficienciasCIPropagateBar({ paperId }: { paperId: string }) {
  const propagate = usePropagateControlDeficiencias();
  const [msg, setMsg] = useState('');
  const [isError, setIsError] = useState(false);

  async function handleClick() {
    setMsg('');
    setIsError(false);
    try {
      const res = await propagate.mutateAsync(paperId);
      setMsg(res.message);
      setIsError(false);
    } catch (err) {
      setMsg((err as Error).message || 'Error al consolidar las deficiencias');
      setIsError(true);
    }
  }

  return (
    <div className="pt-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[11px] text-gray-400">
          Trae las excepciones de PT-A3 (controles de proceso) y PT-ITGC (controles generales de TI) — distinto de los Hallazgos generales.
        </p>
        <button
          type="button"
          onClick={handleClick}
          disabled={propagate.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors shrink-0"
          title="Consolidar deficiencias desde PT-A3 y PT-ITGC"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${propagate.isPending ? 'animate-spin' : ''}`} />
          {propagate.isPending ? 'Consolidando…' : 'Consolidar Deficiencias'}
        </button>
      </div>
      {msg && (
        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 mt-2 text-xs ${
          isError ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-indigo-50 border border-indigo-200 text-indigo-700'
        }`}>
          {isError ? <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> : <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
          {msg}
        </div>
      )}
    </div>
  );
}

// ─── PT-FIN-C-SUST S1 — botón "Consolidar Confirmaciones" (NIA 505) ──────────

function ConfirmacionesPropagateBar({ paperId }: { paperId: string }) {
  const propagate = usePropagateConfirmaciones();
  const [msg, setMsg] = useState('');
  const [isError, setIsError] = useState(false);

  async function handleClick() {
    setMsg('');
    setIsError(false);
    try {
      const res = await propagate.mutateAsync(paperId);
      setMsg(res.message);
      setIsError(false);
    } catch (err) {
      setMsg((err as Error).message || 'Error al consolidar las confirmaciones');
      setIsError(true);
    }
  }

  return (
    <div className="pt-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[11px] text-gray-400">
          Solo si esta área tiene confirmaciones externas (Bancos, CxC, CxP…): trae las conciliadas con diferencia y las sin respuesta desde el módulo de Confirmaciones (NIA 505).
        </p>
        <button
          type="button"
          onClick={handleClick}
          disabled={propagate.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors shrink-0"
          title="Consolidar Confirmaciones Externas (NIA 505)"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${propagate.isPending ? 'animate-spin' : ''}`} />
          {propagate.isPending ? 'Consolidando…' : 'Consolidar Confirmaciones'}
        </button>
      </div>
      {msg && (
        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 mt-2 text-xs ${
          isError ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-indigo-50 border border-indigo-200 text-indigo-700'
        }`}>
          {isError ? <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> : <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
          {msg}
        </div>
      )}
    </div>
  );
}

// ─── PT-MRCI S1 — botón "Propagar desde NIA 530" (CONTROL_NO_EFECTIVO) ────────

function Nia530PropagateBar({ paperId }: { paperId: string }) {
  const propagate = usePropagateNia530ToMrci();
  const [msg, setMsg] = useState('');
  const [isError, setIsError] = useState(false);

  async function handleClick() {
    setMsg('');
    setIsError(false);
    try {
      const res = await propagate.mutateAsync(paperId);
      setMsg(res.message);
      setIsError(false);
    } catch (err) {
      setMsg((err as Error).message || 'Error al propagar desde PT-NIA530');
      setIsError(true);
    }
  }

  return (
    <div className="pt-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[11px] text-gray-400">
          Trae de PT-NIA530 (Atributos) las áreas con CONTROL_NO_EFECTIVO y marca "Operando Efectivamente = No" + escala el Riesgo Residual en las filas coincidentes — nunca revierte una fila ya marcada.
        </p>
        <button
          type="button"
          onClick={handleClick}
          disabled={propagate.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors shrink-0"
          title="Propagar CONTROL_NO_EFECTIVO desde PT-NIA530"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${propagate.isPending ? 'animate-spin' : ''}`} />
          {propagate.isPending ? 'Propagando…' : 'Propagar desde NIA 530'}
        </button>
      </div>
      {msg && (
        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 mt-2 text-xs ${
          isError ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-indigo-50 border border-indigo-200 text-indigo-700'
        }`}>
          {isError ? <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> : <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
          {msg}
        </div>
      )}
    </div>
  );
}

// ─── PT-MRCI S1 — botón "Propagar Segregación de Funciones" (PT-A3 S10) ───────

function SegregacionPropagateBar({ paperId }: { paperId: string }) {
  const propagate = usePropagateSegregacionToMrci();
  const [msg, setMsg] = useState('');
  const [isError, setIsError] = useState(false);

  async function handleClick() {
    setMsg('');
    setIsError(false);
    try {
      const res = await propagate.mutateAsync(paperId);
      setMsg(res.message);
      setIsError(false);
    } catch (err) {
      setMsg((err as Error).message || 'Error al propagar la segregación de funciones');
      setIsError(true);
    }
  }

  return (
    <div className="pt-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[11px] text-gray-400">
          Trae de PT-A3 S10 (Segregación de Funciones) las incompatibilidades sin control compensatorio y las agrega como riesgos nuevos — reemplaza las filas propagadas antes, nunca toca las que agregó a mano.
        </p>
        <button
          type="button"
          onClick={handleClick}
          disabled={propagate.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors shrink-0"
          title="Propagar Segregación de Funciones desde PT-A3 S10"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${propagate.isPending ? 'animate-spin' : ''}`} />
          {propagate.isPending ? 'Propagando…' : 'Propagar Segregación de Funciones'}
        </button>
      </div>
      {msg && (
        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 mt-2 text-xs ${
          isError ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-indigo-50 border border-indigo-200 text-indigo-700'
        }`}>
          {isError ? <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> : <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
          {msg}
        </div>
      )}
    </div>
  );
}

// ─── PT-NIA265 S2 — botón "Recalcular Análisis COSO" a partir de S1 ───────────

function CosoComponentAnalysisBar({ paperId }: { paperId: string }) {
  const recalculate = useRecalculateCosoComponentAnalysis();
  const [msg, setMsg] = useState('');
  const [isError, setIsError] = useState(false);

  async function handleClick() {
    setMsg('');
    setIsError(false);
    try {
      const res = await recalculate.mutateAsync(paperId);
      setMsg(res.message);
      setIsError(false);
    } catch (err) {
      setMsg((err as Error).message || 'Error al recalcular el análisis por componente');
      setIsError(true);
    }
  }

  return (
    <div className="pt-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[11px] text-gray-400">
          Cuenta las deficiencias de S1 por componente COSO y severidad — la Evaluación e Impacto que ya hayas escrito no se pierden.
        </p>
        <button
          type="button"
          onClick={handleClick}
          disabled={recalculate.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors shrink-0"
          title="Recalcular conteos por componente COSO desde S1"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${recalculate.isPending ? 'animate-spin' : ''}`} />
          {recalculate.isPending ? 'Recalculando…' : 'Recalcular Análisis COSO'}
        </button>
      </div>
      {msg && (
        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 mt-2 text-xs ${
          isError ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-indigo-50 border border-indigo-200 text-indigo-700'
        }`}>
          {isError ? <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> : <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
          {msg}
        </div>
      )}
    </div>
  );
}

// ─── PT-HALL S1 — botón "Sincronizar con Hallazgos del Dashboard" ─────────────

function HallazgosSyncBar({ paperId }: { paperId: string }) {
  const propagate = usePropagateHallazgosToFindings();
  const [msg, setMsg] = useState('');
  const [isError, setIsError] = useState(false);

  async function handleClick() {
    setMsg('');
    setIsError(false);
    try {
      const res = await propagate.mutateAsync(paperId);
      setMsg(res.message);
      setIsError(false);
    } catch (err) {
      setMsg((err as Error).message || 'Error al sincronizar los hallazgos');
      setIsError(true);
    }
  }

  return (
    <div className="pt-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[11px] text-gray-400">
          Crea o actualiza un Hallazgo (tabla del dashboard) por cada fila de esta tabla — distinto del seguimiento de informes anteriores, que no se cuenta aquí.
        </p>
        <button
          type="button"
          onClick={handleClick}
          disabled={propagate.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors shrink-0"
          title="Sincronizar con el contador de Hallazgos del dashboard"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${propagate.isPending ? 'animate-spin' : ''}`} />
          {propagate.isPending ? 'Sincronizando…' : 'Sincronizar con Hallazgos del Dashboard'}
        </button>
      </div>
      {msg && (
        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 mt-2 text-xs ${
          isError ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-indigo-50 border border-indigo-200 text-indigo-700'
        }`}>
          {isError ? <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> : <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
          {msg}
        </div>
      )}
    </div>
  );
}

// ─── PT-FIN-B09 S1 — botón "Propagar Ajustes" desde B-08 y PT-ADJ-RECLASIF ────

function AjePropagateBar({ paperId }: { paperId: string }) {
  const propagate = usePropagateAjustes();
  const [msg, setMsg] = useState('');
  const [isError, setIsError] = useState(false);

  async function handleClick() {
    setMsg('');
    setIsError(false);
    try {
      const res = await propagate.mutateAsync(paperId);
      setMsg(res.message);
      setIsError(false);
    } catch (err) {
      setMsg((err as Error).message || 'Error al propagar los ajustes');
      setIsError(true);
    }
  }

  return (
    <div className="pt-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[11px] text-gray-400">
          Trae los AJEs aceptados de B-08 (Diferencias) y PT-ADJ-RECLASIF sin perder filas ni notas ya editadas aquí.
        </p>
        <button
          type="button"
          onClick={handleClick}
          disabled={propagate.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors shrink-0"
          title="Traer AJEs aceptados desde B-08 y PT-ADJ-RECLASIF"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${propagate.isPending ? 'animate-spin' : ''}`} />
          {propagate.isPending ? 'Propagando…' : 'Propagar Ajustes'}
        </button>
      </div>
      {msg && (
        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 mt-2 text-xs ${
          isError ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-indigo-50 border border-indigo-200 text-indigo-700'
        }`}>
          {isError ? <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> : <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
          {msg}
        </div>
      )}
    </div>
  );
}

// ─── Error boundary ───────────────────────────────────────────────────────────

class SectionErrorBoundary extends Component<
  { children: ReactNode; label?: string },
  { caught: Error | null }
> {
  state: { caught: Error | null } = { caught: null };
  static getDerivedStateFromError(e: Error) { return { caught: e }; }
  componentDidCatch(e: Error, info: ErrorInfo) {
    console.error('[SmartPaperSections] render error', e, info);
  }
  render() {
    if (this.state.caught) {
      return (
        <div className="py-4 border-b border-gray-100">
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-700">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold mb-0.5">{this.props.label ?? 'Esta sección'} no pudo renderizarse</p>
              <p className="text-red-500">{this.state.caught.message}</p>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Template key selector ────────────────────────────────────────────────────

// Conjuntos de claves permitidas por tipo de auditoría.
// Deben mantenerse en sync con TEMPLATE_ALLOWED_CODES en new/page.tsx.
const _HALL_KEYS = new Set(['PT-HALL', 'PT-HALL-COM', 'PT-HALL-RESP']);
const _EXT_FIN_KEYS = new Set([
  'PT-INDEP','PT-A1','PT-A2','PT-A3','PT-A4','PT-COSO','PT-MEMO','PT-PROG',
  'PT-NIA250','PT-NIA530','PT-NIA610','PT-NIA620',
  'PT-FIN-ENCARGO',
  'PT-FIN-A3-KC','PT-FIN-B00','PT-FIN-B01','PT-FIN-B02','PT-FIN-B03',
  'PT-FIN-B04','PT-FIN-B05','PT-FIN-B06','PT-FIN-B07','PT-FIN-B08','PT-FIN-B09',
  'PT-ADJ-RECLASIF','PT-DIFS','PT-CIRC','PT-FIN-C-SUST','PT-NIA550','PT-NIA570','PT-FIN-C-ESTIM','PT-FIN-C-GEN','PT-ENTREV',
  'PT-REP580','PT-NIA560','PT-NIA265','PT-NIA260','PT-FIN-DICT',
  'PT-COMP-CHK','PT-EQR','PT-CARRYFWD',
  ..._HALL_KEYS,
]);
const _FISCAL_KEYS    = new Set(['PT-A1','PT-A2','PT-A3','PT-A4','PT-MEMO','PT-PROG','PT-FISC-INDEP','PT-FISC-QC','PT-FISC-ENCARGO','PT-FISC-RISK','PT-FISC-AML','PT-FISC-PT','PT-FISC-ZF','PT-FISC-DICT',..._HALL_KEYS]);
const _INTERNAL_KEYS  = new Set(['PT-A1','PT-A2','PT-A3','PT-A4','PT-COSO','PT-MEMO','PT-PROG','PT-DIFS',..._HALL_KEYS]);
const _NAIG_KEYS      = new Set(['PT-A1','PT-A2','PT-A4','PT-COSO','PT-MEMO','PT-PROG','PT-GOV-HAL',..._HALL_KEYS]);
const _IT_KEYS        = new Set(['PT-A1','PT-A3','PT-MEMO','PT-PROG','PT-SEC-RISK','PT-BIA',..._HALL_KEYS]);
const _AML_KEYS       = new Set(['PT-A1','PT-A3','PT-MEMO','PT-PROG','PT-AML-RISK',..._HALL_KEYS]);
const _FORENSIC_KEYS  = new Set(['PT-A2','PT-MEMO','PT-PROG','PT-DIFS',..._HALL_KEYS]);
const TEMPLATE_FILTER: Record<string, Set<string>> = {
  EXTERNAL: _EXT_FIN_KEYS, FINANCIAL: _EXT_FIN_KEYS, EXTERNAL_FINANCIAL: _EXT_FIN_KEYS,
  FISCAL: _FISCAL_KEYS,
  INTERNAL: _INTERNAL_KEYS, OPERATIONAL: _INTERNAL_KEYS, IT: _INTERNAL_KEYS,
  COMPLIANCE: _INTERNAL_KEYS, ESG: _INTERNAL_KEYS, BCP_DRP: _INTERNAL_KEYS,
  INTERNAL_GOVERNMENTAL: _NAIG_KEYS,
  IT_SECURITY: _IT_KEYS,
  AML: _AML_KEYS,
  FORENSIC: _FORENSIC_KEYS,
};

// Las claves DEBEN coincidir con PAPER_TEMPLATES del backend (paperCode).
// Ver apps/api/src/working-papers/paper-templates.ts
const AVAILABLE_TEMPLATES = [
  { key: 'PT-A1',       label: 'Entendimiento del Negocio (PT-A1)' },
  { key: 'PT-A2',       label: 'Evaluación de Riesgo Inherente (PT-A2)' },
  { key: 'PT-A3',       label: 'Evaluación de Control Interno (PT-A3)' },
  { key: 'PT-A4',       label: 'Materialidad (PT-A4)' },
  { key: 'PT-COSO',     label: 'Evaluación COSO 2013 (PT-COSO)' },
  { key: 'PT-MEMO',     label: 'Memorando de Planificación (PT-MEMO)' },
  { key: 'PT-PROG',     label: 'Programa de Auditoría (PT-PROG)' },
  { key: 'PT-EEFF',     label: 'Estados Financieros / Cédula Madre (PT-EEFF)' },
  { key: 'PT-DIFS',     label: 'Cédula de Diferencias (PT-DIFS)' },
  { key: 'PT-GOV-HAL',  label: 'Hallazgo Gubernamental (PT-GOV-HAL)' },
  { key: 'PT-SEC-RISK', label: 'Riesgo de Seguridad TI (PT-SEC-RISK)' },
  { key: 'PT-BIA',      label: 'Análisis de Impacto al Negocio (PT-BIA)' },
  { key: 'PT-AML-RISK', label: 'Riesgo LA/FT — AML (PT-AML-RISK)' },
  // ── Fiscal El Salvador v6.1 — NACOT 2018 ──
  { key: 'PT-FISC-INDEP',   label: 'Fiscal · Independencia NACOT/CIEPC (PT-FISC-INDEP)' },
  { key: 'PT-FISC-QC',      label: 'Fiscal · Control de Calidad del Encargo (PT-FISC-QC)' },
  { key: 'PT-FISC-ENCARGO', label: 'Fiscal · Carta de Encargo NACOT (PT-FISC-ENCARGO)' },
  { key: 'PT-FISC-RISK',    label: 'Fiscal · Riesgo de Incumplimiento NIA315+NACOT (PT-FISC-RISK)' },
  { key: 'PT-FISC-AML',     label: 'Fiscal · Anti-Lavado LCLDA (PT-FISC-AML)' },
  { key: 'PT-FISC-PT',      label: 'Fiscal · Precios de Transferencia OCDE (PT-FISC-PT)' },
  { key: 'PT-FISC-ZF',      label: 'Fiscal · Dictamen Semestral Zona Franca (PT-FISC-ZF)' },
  { key: 'PT-FISC-DICT',    label: 'Fiscal · Dictamen NACOT Anexo 1 (PT-FISC-DICT)' },
  // ── Auditoría Financiera Externa v1.0 — Lead Schedules Automáticos ──────
  { key: 'PT-FIN-B00', label: 'Fin.Ext · EEFF Importación + Clasificador de Cuentas (PT-FIN-B00)' },
  { key: 'PT-FIN-B01', label: 'Fin.Ext · Cédula Sumaria Activos Corrientes (PT-FIN-B01)'          },
  { key: 'PT-FIN-B02', label: 'Fin.Ext · Cédula Sumaria Activos No Corrientes (PT-FIN-B02)'       },
  { key: 'PT-FIN-B03', label: 'Fin.Ext · Cédula Sumaria Pasivos Corrientes (PT-FIN-B03)'          },
  { key: 'PT-FIN-B04', label: 'Fin.Ext · Cédula Sumaria Pasivos No Corrientes (PT-FIN-B04)'       },
  { key: 'PT-FIN-B05', label: 'Fin.Ext · Cédula Sumaria Patrimonio (PT-FIN-B05)'                  },
  { key: 'PT-FIN-B06', label: 'Fin.Ext · Cédula Sumaria Resultados P&G (PT-FIN-B06)'              },
  { key: 'PT-FIN-B07', label: 'Fin.Ext · Análisis de Variaciones NIA 520 (PT-FIN-B07)'            },
  { key: 'PT-FIN-B08', label: 'Fin.Ext · Cédula Diferencias + Semáforo Opinión NIA 450 (PT-FIN-B08)' },
  { key: 'PT-FIN-B09',    label: 'Fin.Ext · Libro de AJEs con Base Técnica NIIF (PT-FIN-B09)'                    },
  // ── Ejecución (C papers) ────────────────────────────────────────────────────────────────────
  { key: 'PT-FIN-C-SUST', label: 'Fin.Ext · Prueba Sustantiva de Ejecución — C-01..C-12, C-14 (PT-FIN-C-SUST)' },
  { key: 'PT-NIA570',     label: 'Fin.Ext · Continuidad Operativa — Negocio en Marcha NIA 570 — C-15 (PT-NIA570)' },
  { key: 'PT-NIA550',     label: 'Fin.Ext · Partes Relacionadas NIA 550 — C-13 (PT-NIA550)'                    },
  { key: 'PT-ENTREV',     label: 'Fin.Ext · Guía y Papel de Entrevista — B-04 (PT-ENTREV)'                     },
  // ── Cierre e Informe ────────────────────────────────────────────────────────────────────────
  { key: 'PT-FIN-DICT',   label: 'Fin.Ext · Dictamen del Auditor Independiente NIA 700-720 (PT-FIN-DICT)'      },
  // ── Planificación / Aceptación del Encargo ────────────────────────────────
  { key: 'PT-FIN-ENCARGO', label: 'Fin.Ext · Carta de Encargo y Términos del Trabajo NIA 210 (PT-FIN-ENCARGO)' },
  // ── Archivo Permanente / Conocimiento ────────────────────────────────────
  { key: 'PT-FIN-A3-KC',  label: 'Fin.Ext · Conocimiento del Cliente y su Entorno NIA 315 (PT-FIN-A3-KC)'    },
  { key: 'PT-INDEP',       label: 'Fin.Ext · Independencia, Ética y Aceptación NIA 220/IESBA (PT-INDEP)'      },
  // ── NIAs Específicas (Planificación) ─────────────────────────────────────
  { key: 'PT-NIA250',  label: 'NIA 250 · Cumplimiento con Leyes y Regulaciones (PT-NIA250)' },
  { key: 'PT-NIA530',  label: 'NIA 530 · Plan Maestro de Muestreo Estadístico (PT-NIA530)' },
  { key: 'PT-NIA610',  label: 'NIA 610 · Uso del Trabajo de Auditoría Interna (PT-NIA610)' },
  { key: 'PT-NIA620',  label: 'NIA 620 · Uso del Trabajo de Experto del Auditor (PT-NIA620)' },
  // ── NIAs Específicas (Cierre) ─────────────────────────────────────────────
  { key: 'PT-REP580',  label: 'NIA 580 · Carta de Representación de la Dirección (PT-REP580)' },
  { key: 'PT-NIA560',  label: 'NIA 560 · Eventos Posteriores al Cierre (PT-NIA560)' },
  { key: 'PT-NIA265',  label: 'NIA 265 · Carta de Debilidades de CI (PT-NIA265)' },
  { key: 'PT-NIA260',  label: 'NIA 260 · Comunicación con Gobierno Corporativo (PT-NIA260)' },
  // ── Cierre del Encargo y Control de Calidad ───────────────────────────────
  { key: 'PT-COMP-CHK', label: 'Fin.Ext · Lista de Verificación de Cumplimiento (PT-COMP-CHK)' },
  { key: 'PT-EQR',      label: 'Fin.Ext · Revisión del Control de Calidad del Encargo (PT-EQR)' },
  { key: 'PT-CARRYFWD', label: 'Fin.Ext · Asuntos para Revisiones Futuras (PT-CARRYFWD)' },
  // ── Pruebas de Ejecución (papers adicionales financieros) ─────────────────
  { key: 'PT-CIRC',        label: 'Fin.Ext · Circularización de CxC NIA 505 (PT-CIRC)'                         },
  { key: 'PT-FIN-C-GEN',   label: 'Fin.Ext · Área / Cuenta Adicional — Sustantiva Genérica (PT-FIN-C-GEN)'   },
  { key: 'PT-FIN-C-ESTIM', label: 'Fin.Ext · Estimaciones Contables NIA 540 Rev. (PT-FIN-C-ESTIM)'             },
  { key: 'PT-ADJ-RECLASIF',label: 'Fin.Ext · Libro de Ajustes y Reclasificaciones del Auditor (PT-ADJ-RECLASIF)'},
  // ── Hallazgos y Seguimiento — Universal (todas las plantillas) ────────────
  { key: 'PT-HALL',        label: 'Universal · Hallazgo Individual — 5 Elementos + Seguimiento (PT-HALL)'       },
  { key: 'PT-HALL-COM',    label: 'Universal · Comunicación Formal de Hallazgos al Cliente/Área (PT-HALL-COM)'  },
  { key: 'PT-HALL-RESP',   label: 'Universal · Seguimiento Consolidado — Respondidos/Vigentes/Vencidos (PT-HALL-RESP)'},
];

function InitFromTemplatePanel({
  paperId,
  defaultKey,
  auditType,
  onDone,
}: {
  paperId: string;
  defaultKey?: string;
  auditType?: string;
  onDone: () => void;
}) {
  const allowedKeys = auditType ? TEMPLATE_FILTER[auditType] : undefined;
  const visibleTemplates = allowedKeys
    ? AVAILABLE_TEMPLATES.filter(t => allowedKeys.has(t.key))
    : AVAILABLE_TEMPLATES;

  // Si el papel ya tiene una plantilla preasignada (paperCode) que existe en la lista, usarla directamente
  const preassigned = defaultKey ? visibleTemplates.find(t => t.key === defaultKey) : undefined;
  const initialKey = preassigned ? defaultKey! : '';
  const [selected, setSelected] = useState(initialKey);
  const initMutation = useInitFromTemplate();

  async function handleInit() {
    const key = preassigned ? defaultKey! : selected;
    if (!key) return;
    await initMutation.mutateAsync({ paperId, templateKey: key });
    onDone();
  }

  // ── Caso A: Plantilla preasignada → botón directo sin dropdown ─────────────
  if (preassigned) {
    return (
      <div className="flex flex-col items-center py-16 gap-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center">
          <LayoutTemplate className="w-8 h-8 text-blue-400" />
        </div>
        <div>
          <p className="text-base font-semibold text-gray-800 mb-1">
            Este papel no tiene secciones todavía
          </p>
          <p className="text-sm text-gray-500 max-w-sm">
            Plantilla asignada: <span className="font-semibold text-blue-700">{preassigned.key}</span>
          </p>
          <p className="text-xs text-gray-400 mt-1 max-w-sm">{preassigned.label}</p>
        </div>
        <button
          onClick={handleInit}
          disabled={initMutation.isPending}
          className="flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors"
        >
          {initMutation.isPending ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Inicializando…</>
          ) : (
            <><LayoutTemplate className="w-4 h-4" /> Iniciar papel</>
          )}
        </button>
      </div>
    );
  }

  // ── Caso B: Sin plantilla preasignada → dropdown de selección ─────────────
  return (
    <div className="flex flex-col items-center py-16 gap-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center">
        <LayoutTemplate className="w-8 h-8 text-blue-400" />
      </div>
      <div>
        <p className="text-base font-semibold text-gray-800 mb-1">
          Este papel no tiene secciones todavía
        </p>
        <p className="text-sm text-gray-400 max-w-sm">
          Elige una plantilla para inicializar las secciones estructuradas de este papel inteligente.
        </p>
      </div>

      <div className="w-full max-w-xs space-y-3">
        <select
          value={selected}
          onChange={e => setSelected(e.target.value)}
          className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">— Seleccionar plantilla —</option>
          {visibleTemplates.map(t => (
            <option key={t.key} value={t.key}>{t.label}</option>
          ))}
        </select>

        <button
          onClick={handleInit}
          disabled={!selected || initMutation.isPending}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors"
        >
          {initMutation.isPending ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Inicializando…</>
          ) : (
            <><LayoutTemplate className="w-4 h-4" /> Inicializar secciones</>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function SectionProgressBar({ filled, total }: { filled: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((filled / total) * 100);
  const color = pct === 100 ? 'bg-emerald-500' : pct >= 60 ? 'bg-blue-500' : 'bg-amber-400';

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-gray-500 shrink-0 font-medium">
        {filled}/{total} secciones completas
      </span>
      {pct === 100 && (
        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
      )}
    </div>
  );
}

// ─── SmartPaperSections ───────────────────────────────────────────────────────

interface SmartPaperSectionsProps {
  paperId:        string;
  auditId:        string;
  paperCode?:     string | null;
  readonly?:      boolean;
  aiDraftConfig?: AiDraftConfig;
  auditType?:     string;
}

export function SmartPaperSections({
  paperId,
  auditId,
  paperCode,
  readonly = false,
  aiDraftConfig,
  auditType,
}: SmartPaperSectionsProps) {
  const { data: sections, isLoading, error } = usePaperSections(paperId);
  const updateSection       = useUpdateSection();
  const createReference     = useCreateReference();
  const propagateTrialBal   = usePropagateTrialBalance();
  const { data: mentionItems = [] } = useMentionIndex(auditId);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  // Tab selection for papers with many sections grouped via section.tab (e.g. PT-FIN-B00).
  // Declared before the early returns below to respect the Rules of Hooks.
  const [activeTab, setActiveTab] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-red-600">Error al cargar secciones: {(error as Error).message}</p>
      </div>
    );
  }

  if (!sections || sections.length === 0) {
    return (
      <InitFromTemplatePanel
        paperId={paperId}
        defaultKey={paperCode ?? undefined}
        auditType={auditType}
        onDone={() => { /* query will auto-refresh */ }}
      />
    );
  }

  const sorted = [...sections].sort((a, b) => a.sortOrder - b.sortOrder);
  const required = sorted.filter(s => s.isRequired);
  const filled = required.filter(s => s.value !== null && s.value !== undefined && s.value !== '');

  // Lookup helpers for PT-FIN-B00 specialized rendering
  const s1Section = sorted.find(s => s.sectionKey === 'S1');
  const s2Section = sorted.find(s => s.sectionKey === 'S2');

  // Group into tabs when the paper's sections declare one (order = first appearance
  // by sortOrder). Papers without tabs render exactly as before — flat, no tab bar.
  const tabs = Array.from(new Set(sorted.map(s => s.tab).filter((t): t is string => !!t)));
  const effectiveTab = tabs.length > 1
    ? (activeTab && tabs.includes(activeTab) ? activeTab : tabs[0])
    : null;
  const visibleSections = effectiveTab ? sorted.filter(s => s.tab === effectiveTab) : sorted;
  const tabRequiredCount = (t: string) => {
    const inTab = sorted.filter(s => s.tab === t && s.isRequired);
    const done  = inTab.filter(s => s.value !== null && s.value !== undefined && s.value !== '');
    return { done: done.length, total: inTab.length };
  };

  async function handleSave(sectionKey: string, value: unknown) {
    setSavingKey(sectionKey);
    try {
      await updateSection.mutateAsync({ paperId, sectionKey, value });
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Completitud de secciones requeridas
        </p>
        <SectionProgressBar filled={filled.length} total={required.length} />
      </div>

      {/* Trabajar fuera de línea (EXC-24..27) — plantilla Excel genérica */}
      <WorkOfflinePanel paperId={paperId} sections={sorted} readonly={readonly} />

      {/* Evidencia de Campo (EVD-09) — capacidad general, no un FieldType nuevo;
          disponible en cualquier papel inteligente, colapsada por defecto. */}
      <FieldEvidencePanel paperId={paperId} sectionKey={sorted[0]?.sectionKey ?? 'S1'} sections={sorted} readOnly={readonly} />

      {/* Saving indicator */}
      {savingKey && (
        <div className="flex items-center gap-2 text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Guardando &ldquo;{sections.find(s => s.sectionKey === savingKey)?.label ?? savingKey}&rdquo;...
        </div>
      )}

      {/* PT-A4 — Panel de materialidad: auto-calcula MG/ME/UAE desde S1b × S2 */}
      {paperCode === 'PT-A4' && (
        <MaterialidadPanel
          sections={sorted}
          readonly={readonly}
          onSave={handleSave}
        />
      )}

      {/* PT-A4 — Panel de ejecución de muestreo NIA 530 (MUS + Atributos) */}
      {paperCode === 'PT-A4' && (
        <SamplingExecutionPanel
          sections={sorted}
          readonly={readonly}
          onSave={handleSave}
        />
      )}

      {/* Tab bar — only rendered when the paper's sections declare more than one tab */}
      {tabs.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto bg-white rounded-2xl border border-gray-200 shadow-sm p-1.5">
          {tabs.map(t => {
            const { done, total } = tabRequiredCount(t);
            const active = t === effectiveTab;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setActiveTab(t)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                }`}
              >
                {t}
                {total > 0 && (
                  <span className={`text-[10px] tabular-nums px-1.5 py-0.5 rounded-full ${
                    active ? 'bg-white/20' : done === total ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {done}/{total}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Sections */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-5 divide-y divide-gray-100">
        {visibleSections.map(section => {
          // PT-FIN-B00: S1 → importador de balance, S2 → clasificador de cuentas
          if (paperCode === 'PT-FIN-B00') {
            if (section.sectionKey === 'S1') {
              return (
                <SectionErrorBoundary key="S1" label="S1 · Balance de Comprobación">
                  <TrialBalanceImporter
                    section={section}
                    readonly={readonly}
                    onSave={handleSave}
                  />
                </SectionErrorBoundary>
              );
            }
            if (section.sectionKey === 'S2' && s1Section) {
              return (
                <SectionErrorBoundary key={`classifier-${Array.isArray(s1Section.value) ? (s1Section.value as unknown[]).length : 0}`} label="S2 · Clasificador de Cuentas">
                  <AccountClassifier
                    s1Section={s1Section}
                    s2Section={section}
                    readonly={readonly}
                    onSave={handleSave}
                    onPropagate={
                      !readonly
                        ? () => propagateTrialBal.mutateAsync(paperId)
                        : undefined
                    }
                  />
                </SectionErrorBoundary>
              );
            }
            if (section.sectionKey === 'S6' && s1Section) {
              return (
                <SectionErrorBoundary key="S6" label="S6 · Semáforo de Cuentas">
                  <AccountSemaforo
                    s1Section={s1Section}
                    s2Section={s2Section}
                    s6Section={section}
                    auditId={auditId}
                    readonly={readonly}
                    onSave={handleSave}
                  />
                </SectionErrorBoundary>
              );
            }
            // S10/S11 — grid editable de siempre + gráfico de solo-lectura arriba,
            // derivado de las mismas filas (no reemplaza la tabla, la complementa).
            if (section.sectionKey === 'S10' || section.sectionKey === 'S11') {
              const rows = Array.isArray(section.value) ? section.value as Record<string, unknown>[] : [];
              return (
                <SectionErrorBoundary key={section.sectionKey} label={section.label}>
                  <div>
                    {section.sectionKey === 'S10' && <RatioTrendChart rows={rows} />}
                    {section.sectionKey === 'S11' && <ConcentrationChart rows={rows} />}
                    <SectionField
                      section={section}
                      allSections={sorted}
                      readonly={readonly}
                      onSave={handleSave}
                      paperId={paperId}
                      paperCode={paperCode}
                      auditId={auditId}
                      mentionItems={mentionItems}
                      aiDraftConfig={aiDraftConfig}
                      onMentionSelect={(sectionKey, targetPaperId, targetSectionKey) => {
                        void createReference.mutateAsync({
                          paperId,
                          sourceSectionKey: sectionKey,
                          targetPaperId,
                          targetSectionKey,
                        });
                      }}
                    />
                  </div>
                </SectionErrorBoundary>
              );
            }
          }

          // PT-FIN-B07: gráfico de solo-lectura arriba (S1 mayores variaciones, S3 ratios
          // actual vs anterior) + botón "Cómo se calcula" junto al título de cada análisis.
          if (paperCode === 'PT-FIN-B07' && ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'].includes(section.sectionKey)) {
            const rows = Array.isArray(section.value) ? section.value as Record<string, unknown>[] : [];
            return (
              <SectionErrorBoundary key={section.sectionKey} label={section.label}>
                <div>
                  <div className="flex justify-end pt-3">
                    <MethodologyInfo paperCode={paperCode} sectionKey={section.sectionKey} />
                  </div>
                  {section.sectionKey === 'S1' && !readonly && paperId && <BalancePropagateBar paperId={paperId} />}
                  {section.sectionKey === 'S1' && <VariationChart rows={rows} />}
                  {section.sectionKey === 'S3' && <RatioTrendChart rows={rows} />}
                  <SectionField
                    section={section}
                    allSections={sorted}
                    readonly={readonly}
                    onSave={handleSave}
                    paperId={paperId}
                    paperCode={paperCode}
                    auditId={auditId}
                    mentionItems={mentionItems}
                    aiDraftConfig={aiDraftConfig}
                    onMentionSelect={(sectionKey, targetPaperId, targetSectionKey) => {
                      void createReference.mutateAsync({
                        paperId,
                        sourceSectionKey: sectionKey,
                        targetPaperId,
                        targetSectionKey,
                      });
                    }}
                  />
                </div>
              </SectionErrorBoundary>
            );
          }

          // PT-FIN-C-SUST S3: botón "Cargar Procedimientos Sugeridos" (biblioteca por área).
          if (paperCode === 'PT-FIN-C-SUST' && section.sectionKey === 'S3') {
            return (
              <SectionErrorBoundary key="S3" label={section.label}>
                <div>
                  {!readonly && paperId && <SeedProceduresBar paperId={paperId} />}
                  <SectionField
                    section={section}
                    allSections={sorted}
                    readonly={readonly}
                    onSave={handleSave}
                    paperId={paperId}
                    paperCode={paperCode}
                    auditId={auditId}
                    mentionItems={mentionItems}
                    aiDraftConfig={aiDraftConfig}
                    onMentionSelect={(sectionKey, targetPaperId, targetSectionKey) => {
                      void createReference.mutateAsync({
                        paperId,
                        sourceSectionKey: sectionKey,
                        targetPaperId,
                        targetSectionKey,
                      });
                    }}
                  />
                </div>
              </SectionErrorBoundary>
            );
          }

          // PT-MRCI S1: botón "Propagar desde NIA 530" (CONTROL_NO_EFECTIVO → Operando Efectivamente + Residual).
          if (paperCode === 'PT-MRCI' && section.sectionKey === 'S1') {
            return (
              <SectionErrorBoundary key="S1" label={section.label}>
                <div>
                  {!readonly && paperId && <Nia530PropagateBar paperId={paperId} />}
                  {!readonly && paperId && <SegregacionPropagateBar paperId={paperId} />}
                  <SectionField
                    section={section}
                    allSections={sorted}
                    readonly={readonly}
                    onSave={handleSave}
                    paperId={paperId}
                    paperCode={paperCode}
                    auditId={auditId}
                    mentionItems={mentionItems}
                    aiDraftConfig={aiDraftConfig}
                    onMentionSelect={(sectionKey, targetPaperId, targetSectionKey) => {
                      void createReference.mutateAsync({
                        paperId,
                        sourceSectionKey: sectionKey,
                        targetPaperId,
                        targetSectionKey,
                      });
                    }}
                  />
                </div>
              </SectionErrorBoundary>
            );
          }

          // PT-FIN-C-SUST S1: botón "Consolidar Confirmaciones" (trae ExternalConfirmation del encargo, NIA 505).
          if (paperCode === 'PT-FIN-C-SUST' && section.sectionKey === 'S1') {
            return (
              <SectionErrorBoundary key="S1" label={section.label}>
                <div>
                  {!readonly && paperId && <ConfirmacionesPropagateBar paperId={paperId} />}
                  <SectionField
                    section={section}
                    allSections={sorted}
                    readonly={readonly}
                    onSave={handleSave}
                    paperId={paperId}
                    paperCode={paperCode}
                    auditId={auditId}
                    mentionItems={mentionItems}
                    aiDraftConfig={aiDraftConfig}
                    onMentionSelect={(sectionKey, targetPaperId, targetSectionKey) => {
                      void createReference.mutateAsync({
                        paperId,
                        sourceSectionKey: sectionKey,
                        targetPaperId,
                        targetSectionKey,
                      });
                    }}
                  />
                </div>
              </SectionErrorBoundary>
            );
          }

          // PT-COSO S6: Puntaje Ponderado del SCI (radar + medidor + barra de 17 principios), antes de la conclusión global.
          if (paperCode === 'PT-COSO' && section.sectionKey === 'S6') {
            return (
              <SectionErrorBoundary key="S6" label={section.label}>
                <div>
                  <CosoScorePanel sections={sorted} />
                  <SectionField
                    section={section}
                    allSections={sorted}
                    readonly={readonly}
                    onSave={handleSave}
                    paperId={paperId}
                    paperCode={paperCode}
                    auditId={auditId}
                    mentionItems={mentionItems}
                    aiDraftConfig={aiDraftConfig}
                    onMentionSelect={(sectionKey, targetPaperId, targetSectionKey) => {
                      void createReference.mutateAsync({
                        paperId,
                        sourceSectionKey: sectionKey,
                        targetPaperId,
                        targetSectionKey,
                      });
                    }}
                  />
                </div>
              </SectionErrorBoundary>
            );
          }

          // PT-COSO S1-S5: botón "Cargar Preguntas Sugeridas" (biblioteca de evaluación COSO por componente).
          if (paperCode === 'PT-COSO' && ['S1', 'S2', 'S3', 'S4', 'S5'].includes(section.sectionKey)) {
            return (
              <SectionErrorBoundary key={section.sectionKey} label={section.label}>
                <div>
                  {!readonly && paperId && <SeedCosoQuestionsBar paperId={paperId} sectionKey={section.sectionKey} />}
                  {(() => {
                    const componentMeta = COSO_COMPONENTS.find(c => c.sectionKey === section.sectionKey);
                    return componentMeta ? <CosoPrincipleMiniChart section={section} componentMeta={componentMeta} /> : null;
                  })()}
                  <SectionField
                    section={section}
                    allSections={sorted}
                    readonly={readonly}
                    onSave={handleSave}
                    paperId={paperId}
                    paperCode={paperCode}
                    auditId={auditId}
                    mentionItems={mentionItems}
                    aiDraftConfig={aiDraftConfig}
                    onMentionSelect={(sectionKey, targetPaperId, targetSectionKey) => {
                      void createReference.mutateAsync({
                        paperId,
                        sourceSectionKey: sectionKey,
                        targetPaperId,
                        targetSectionKey,
                      });
                    }}
                  />
                </div>
              </SectionErrorBoundary>
            );
          }

          // PT-NIA265 S1: botón "Consolidar Deficiencias" (trae PT-A3 S4 + PT-ITGC).
          if (paperCode === 'PT-NIA265' && section.sectionKey === 'S1') {
            return (
              <SectionErrorBoundary key="S1" label={section.label}>
                <div>
                  {!readonly && paperId && <DeficienciasCIPropagateBar paperId={paperId} />}
                  <SectionField
                    section={section}
                    allSections={sorted}
                    readonly={readonly}
                    onSave={handleSave}
                    paperId={paperId}
                    paperCode={paperCode}
                    auditId={auditId}
                    mentionItems={mentionItems}
                    aiDraftConfig={aiDraftConfig}
                    onMentionSelect={(sectionKey, targetPaperId, targetSectionKey) => {
                      void createReference.mutateAsync({
                        paperId,
                        sourceSectionKey: sectionKey,
                        targetPaperId,
                        targetSectionKey,
                      });
                    }}
                  />
                </div>
              </SectionErrorBoundary>
            );
          }

          // PT-NIA265 S2: botón "Recalcular Análisis COSO" (cuenta S1 por componente).
          if (paperCode === 'PT-NIA265' && section.sectionKey === 'S2') {
            return (
              <SectionErrorBoundary key="S2" label={section.label}>
                <div>
                  {!readonly && paperId && <CosoComponentAnalysisBar paperId={paperId} />}
                  <SectionField
                    section={section}
                    allSections={sorted}
                    readonly={readonly}
                    onSave={handleSave}
                    paperId={paperId}
                    paperCode={paperCode}
                    auditId={auditId}
                    mentionItems={mentionItems}
                    aiDraftConfig={aiDraftConfig}
                    onMentionSelect={(sectionKey, targetPaperId, targetSectionKey) => {
                      void createReference.mutateAsync({
                        paperId,
                        sourceSectionKey: sectionKey,
                        targetPaperId,
                        targetSectionKey,
                      });
                    }}
                  />
                </div>
              </SectionErrorBoundary>
            );
          }

          // PT-HALL S1: botón "Sincronizar con Hallazgos del Dashboard".
          if (paperCode === 'PT-HALL' && section.sectionKey === 'S1') {
            return (
              <SectionErrorBoundary key="S1" label={section.label}>
                <div>
                  {!readonly && paperId && <HallazgosSyncBar paperId={paperId} />}
                  <SectionField
                    section={section}
                    allSections={sorted}
                    readonly={readonly}
                    onSave={handleSave}
                    paperId={paperId}
                    paperCode={paperCode}
                    auditId={auditId}
                    mentionItems={mentionItems}
                    aiDraftConfig={aiDraftConfig}
                    onMentionSelect={(sectionKey, targetPaperId, targetSectionKey) => {
                      void createReference.mutateAsync({
                        paperId,
                        sourceSectionKey: sectionKey,
                        targetPaperId,
                        targetSectionKey,
                      });
                    }}
                  />
                </div>
              </SectionErrorBoundary>
            );
          }

          // PT-FIN-B08 S1/S2: botón "Consolidar Diferencias" en S1 (trae C-SUST/C-NORM
          // y recalcula S2/S3) + gráfico puente de materialidad sobre S2.
          if (paperCode === 'PT-FIN-B08' && ['S1', 'S2', 'S3'].includes(section.sectionKey)) {
            const rows = Array.isArray(section.value) ? section.value as Record<string, unknown>[] : [];
            return (
              <SectionErrorBoundary key={section.sectionKey} label={section.label}>
                <div>
                  <div className="flex justify-end pt-3">
                    <MethodologyInfo paperCode={paperCode} sectionKey={section.sectionKey} />
                  </div>
                  {section.sectionKey === 'S1' && !readonly && paperId && <DiferenciasPropagateBar paperId={paperId} />}
                  {section.sectionKey === 'S2' && <MaterialityBridgeChart rows={rows} />}
                  <SectionField
                    section={section}
                    allSections={sorted}
                    readonly={readonly}
                    onSave={handleSave}
                    paperId={paperId}
                    paperCode={paperCode}
                    auditId={auditId}
                    mentionItems={mentionItems}
                    aiDraftConfig={aiDraftConfig}
                    onMentionSelect={(sectionKey, targetPaperId, targetSectionKey) => {
                      void createReference.mutateAsync({
                        paperId,
                        sourceSectionKey: sectionKey,
                        targetPaperId,
                        targetSectionKey,
                      });
                    }}
                  />
                </div>
              </SectionErrorBoundary>
            );
          }

          // PT-FIN-B09 S1: botón "Propagar Ajustes" (B-08 + PT-ADJ-RECLASIF) + gráfico
          // de impacto neto por cuenta, ambos arriba del grid editable de siempre.
          if (paperCode === 'PT-FIN-B09' && section.sectionKey === 'S1') {
            const rows = Array.isArray(section.value) ? section.value as Record<string, unknown>[] : [];
            return (
              <SectionErrorBoundary key="S1" label={section.label}>
                <div>
                  {!readonly && paperId && <AjePropagateBar paperId={paperId} />}
                  <AjeImpactChart rows={rows} />
                  <SectionField
                    section={section}
                    allSections={sorted}
                    readonly={readonly}
                    onSave={handleSave}
                    paperId={paperId}
                    paperCode={paperCode}
                    auditId={auditId}
                    mentionItems={mentionItems}
                    aiDraftConfig={aiDraftConfig}
                    onMentionSelect={(sectionKey, targetPaperId, targetSectionKey) => {
                      void createReference.mutateAsync({
                        paperId,
                        sourceSectionKey: sectionKey,
                        targetPaperId,
                        targetSectionKey,
                      });
                    }}
                  />
                </div>
              </SectionErrorBoundary>
            );
          }

          // PT-A4: S1..S5 renderizados por MaterialidadPanel; S_EJE por SamplingExecutionPanel
          if (paperCode === 'PT-A4' && ['S1', 'S1b', 'S2', 'S3', 'S4', 'S5', 'S_EJE'].includes(section.sectionKey)) {
            return null;
          }

          return (
            <SectionErrorBoundary key={section.sectionKey} label={section.label}>
              <SectionField
                section={section}
                allSections={sorted}
                readonly={readonly}
                onSave={handleSave}
                paperId={paperId}
                paperCode={paperCode}
                auditId={auditId}
                mentionItems={mentionItems}
                aiDraftConfig={aiDraftConfig}
                onMentionSelect={(sectionKey, targetPaperId, targetSectionKey) => {
                  void createReference.mutateAsync({
                    paperId,
                    sourceSectionKey: sectionKey,
                    targetPaperId,
                    targetSectionKey,
                  });
                }}
              />
            </SectionErrorBoundary>
          );
        })}
      </div>
    </div>
  );
}
