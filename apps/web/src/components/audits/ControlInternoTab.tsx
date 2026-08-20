'use client';

import { useState } from 'react';
import {
  Loader2, AlertTriangle, ChevronRight, Download,
  Target, GitBranch, ShieldCheck, ClipboardCheck, TrendingDown, FileWarning, FileCheck2,
} from 'lucide-react';
import {
  useControlInternoSummary, type ControlInternoStageKey, type ControlInternoRiskRow,
  type ControlInternoStage, type RiskTraceAnchor,
} from '@/hooks/useControlInterno';
import { RiskTraceDrawer } from './RiskTraceDrawer';
import { apiClient } from '@/lib/api-client';

const STAGE_ICON: Record<ControlInternoStageKey, React.ElementType> = {
  IDENTIFICACION: Target, RMM: GitBranch, CONTROL: ShieldCheck, PRUEBA: ClipboardCheck,
  RESIDUAL: TrendingDown, DEFICIENCIA: FileWarning, CONCLUSION: FileCheck2,
};

const PROFILE_LABEL: Record<string, string> = {
  EXTERNA: 'Perfil: Auditoría Financiera Externa (NIA)',
  INTERNA: 'Perfil: Auditoría Interna',
  GENERICO: 'Perfil: general (sin PT-A5 ni PT-MRCI sembrados)',
};

function StageChip({ stage }: { stage: ControlInternoStage }) {
  const Icon = STAGE_ICON[stage.key] ?? Target;
  const hasSignal = stage.count > 0 && (stage.key === 'PRUEBA' || stage.key === 'RESIDUAL' || stage.key === 'DEFICIENCIA');
  return (
    <div className={`flex flex-col items-center gap-1.5 min-w-[104px] px-2 ${!stage.available ? 'opacity-40' : ''}`}>
      <div className={`flex items-center justify-center w-9 h-9 rounded-full border-2 ${
        hasSignal ? 'border-amber-400 bg-amber-50' : stage.available ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200 bg-gray-50'
      }`}>
        <Icon className={`w-4 h-4 ${hasSignal ? 'text-amber-600' : stage.available ? 'text-indigo-600' : 'text-gray-300'}`} />
      </div>
      <p className="text-[11px] font-semibold text-gray-700 text-center leading-tight">{stage.label}</p>
      <p className={`text-[10px] text-center leading-tight ${hasSignal ? 'text-amber-600 font-medium' : 'text-gray-400'}`}>
        {stage.available ? stage.countLabel : 'No sembrado'}
      </p>
    </div>
  );
}

function RiskRow({ risk, onClick }: { risk: ControlInternoRiskRow; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-white rounded-xl border border-gray-200 hover:border-indigo-300 hover:shadow-sm transition-all text-left"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{risk.label}</p>
        {risk.area && <p className="text-[11px] text-gray-400 truncate">{risk.area}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {risk.badge && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-50 border border-indigo-200 text-indigo-700">
            {risk.badge}
          </span>
        )}
        <ChevronRight className="w-4 h-4 text-gray-300" />
      </div>
    </button>
  );
}

export function ControlInternoTab({ auditId }: { auditId: string }) {
  const { data: summary, isLoading, isError } = useControlInternoSummary(auditId);
  const [drawerAnchor, setDrawerAnchor] = useState<RiskTraceAnchor | null>(null);
  const [downloading, setDownloading] = useState(false);

  async function handleDownloadReport() {
    setDownloading(true);
    try {
      await apiClient.downloadFile(
        `/working-papers/control-interno-report/${auditId}/pdf`,
        `AuditMind_Control_Interno_${auditId.slice(0, 8)}.pdf`,
      );
    } catch (err) {
      alert((err as Error).message || 'Error al descargar el Reporte Integrado');
    } finally {
      setDownloading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (isError || !summary) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        No se pudo cargar el resumen de Control Interno de este encargo.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <p className="text-[11px] font-medium text-gray-400">{PROFILE_LABEL[summary.profile]}</p>
          <button
            onClick={handleDownloadReport}
            disabled={downloading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-600 text-xs font-semibold rounded-lg hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-50 transition-colors shrink-0"
            title="Descargar Reporte Integrado de Control Interno (PDF)"
          >
            {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            {downloading ? 'Generando…' : 'Reporte Integrado (PDF)'}
          </button>
        </div>
        <div className="flex items-start overflow-x-auto pb-2 -mx-1 px-1">
          {summary.stages.map((stage, i) => (
            <div key={stage.key} className="flex items-start shrink-0">
              <StageChip stage={stage} />
              {i < summary.stages.length - 1 && (
                <div className="w-6 h-px bg-gray-200 mt-[18px] shrink-0" />
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">
            Riesgos ({summary.risks.length})
          </h3>
          <p className="text-[11px] text-gray-400">Clic en cualquier fila para abrir la Ficha de Riesgo</p>
        </div>

        {summary.risks.length === 0 ? (
          <p className="text-xs text-gray-400 italic py-6 text-center">
            No hay riesgos identificados todavía en PT-A2 — complételo para poblar esta lista.
          </p>
        ) : (
          <div className="space-y-2">
            {summary.risks.map(risk => (
              <RiskRow
                key={`${risk.paperId}-${risk.sectionKey}-${risk.rowIndex}`}
                risk={risk}
                onClick={() => setDrawerAnchor({ paperId: risk.paperId, sectionKey: risk.sectionKey, rowIndex: risk.rowIndex })}
              />
            ))}
          </div>
        )}
      </div>

      {drawerAnchor && (
        <RiskTraceDrawer auditId={auditId} anchor={drawerAnchor} onClose={() => setDrawerAnchor(null)} />
      )}
    </div>
  );
}
