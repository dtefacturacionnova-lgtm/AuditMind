'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Search, Loader2, FileSpreadsheet, CheckCircle2, ArrowRight, AlertCircle } from 'lucide-react';
import { useAudits } from '@/hooks/useAudits';
import { useWorkingPapersForAudit } from '@/hooks/useWorkingPapers';
import { useUpdateSection } from '@/hooks/useWorkingPaperGraph';
import type { AnalysisId } from '@/lib/caats-fields';

interface Props {
  engine:          AnalysisId;
  label:           string;
  result:          Record<string, unknown>;
  fileName?:       string;
  fieldMapping?:   Record<string, string>;
  benfordColumn?:  string;
  anomalyColumns?: string[];
  onClose:         () => void;
}

export function SaveAsWorkingPaperModal({
  engine, label, result, fileName, fieldMapping, benfordColumn, anomalyColumns, onClose,
}: Props) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [auditId, setAuditId] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ paperId: string } | null>(null);

  const { data: auditsResp, isLoading: loadingAudits } = useAudits({ search: search || undefined, limit: 20 });
  const { data: papers, isLoading: loadingPapers } = useWorkingPapersForAudit(auditId ?? '');
  const updateSection = useUpdateSection();

  const b4Papers = (papers ?? []).filter(p => p.paperCode === 'PT-B4');

  async function saveTo(paperId: string) {
    await updateSection.mutateAsync({
      paperId,
      sectionKey: 'S1',
      value: {
        engine,
        fileName: fileName ?? 'Datos de muestra',
        fieldMapping,
        benfordColumn,
        anomalyColumns,
        result,
        ranAt: new Date().toISOString(),
      },
    });
    setSaved({ paperId });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-gradient-to-r from-[#0F2D4A] to-[#1a4a7a] px-6 py-5 flex items-start justify-between gap-4 shrink-0">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-white/60">Guardar como papel de trabajo</p>
            <h3 className="text-lg font-bold text-white mt-0.5">{label}</h3>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {saved ? (
          <div className="px-6 py-8 flex flex-col items-center text-center gap-3">
            <CheckCircle2 className="w-10 h-10 text-emerald-500" />
            <p className="text-sm font-semibold text-gray-800">Resultado guardado en el papel PT-B4</p>
            <p className="text-xs text-gray-500">El análisis quedó registrado como evidencia en la sección de análisis CAATs de ese papel.</p>
            <div className="flex gap-2 mt-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cerrar
              </button>
              <button
                onClick={() => router.push(`/dashboard/working-papers/${saved.paperId}`)}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0F2D4A] hover:bg-[#1a4a7a] rounded-lg transition-colors"
              >
                Ir al papel <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-y-auto px-6 py-5 space-y-4">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">1. Selecciona el encargo</p>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-gray-300 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={search}
                  onChange={e => { setSearch(e.target.value); setAuditId(null); }}
                  placeholder="Buscar encargo por nombre…"
                  className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {loadingAudits ? (
                <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-gray-400" /></div>
              ) : (
                <div className="mt-2 max-h-36 overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-lg">
                  {(auditsResp?.data ?? []).map(a => (
                    <button
                      key={a.id}
                      onClick={() => setAuditId(a.id)}
                      className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition-colors ${auditId === a.id ? 'bg-[#0F2D4A]/5 text-[#0F2D4A] font-semibold' : 'text-gray-700'}`}
                    >
                      {a.code} — {a.title}
                    </button>
                  ))}
                  {(auditsResp?.data ?? []).length === 0 && (
                    <p className="px-3 py-3 text-xs text-gray-400 text-center">Sin encargos que coincidan.</p>
                  )}
                </div>
              )}
            </div>

            {auditId && (
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">2. Selecciona el papel PT-B4</p>
                {loadingPapers ? (
                  <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-gray-400" /></div>
                ) : b4Papers.length === 0 ? (
                  <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    Este encargo no tiene ningún papel de Análisis de Datos CAATs (PT-B4) disponible en su plantilla.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {b4Papers.map(p => (
                      <button
                        key={p.id}
                        onClick={() => saveTo(p.id)}
                        disabled={updateSection.isPending}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 border border-gray-200 rounded-lg hover:border-[#0F2D4A]/40 hover:bg-gray-50 transition-colors disabled:opacity-50 text-left"
                      >
                        <FileSpreadsheet className="w-4 h-4 text-[#0F2D4A] shrink-0" />
                        <span className="text-xs">
                          <strong className="text-gray-800">{p.code}</strong>
                          <span className="text-gray-500"> — {p.title}</span>
                        </span>
                        {updateSection.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin ml-auto shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {updateSection.isError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                No se pudo guardar el resultado. Intenta de nuevo.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
