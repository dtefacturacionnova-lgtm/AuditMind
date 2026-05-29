'use client';

import { useState } from 'react';
import { X, RotateCcw, Loader2, CheckCircle2, ArrowRight, Copy } from 'lucide-react';
import { useRollForward } from '@/hooks/useRollForward';
import { useRouter } from 'next/navigation';

interface Props {
  auditId: string;
  sourceTitle: string;
  sourceStartDate?: string | null;
  sourceEndDate?:   string | null;
  onClose: () => void;
}

function nextYear(dateStr?: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().split('T')[0];
}

export function RollForwardModal({ auditId, sourceTitle, sourceStartDate, sourceEndDate, onClose }: Props) {
  const router = useRouter();
  const currentYear = new Date().getFullYear();
  const [title,              setTitle]              = useState(`${sourceTitle} — ${currentYear + 1}`);
  const [startDate,          setStartDate]          = useState(nextYear(sourceStartDate));
  const [endDate,            setEndDate]            = useState(nextYear(sourceEndDate));
  const [carryOpenFindings,  setCarryOpenFindings]  = useState(false);
  const [done,               setDone]               = useState<{ id: string; title: string } | null>(null);

  const rollForward = useRollForward(auditId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = await rollForward.mutateAsync({
      title,
      startDate: startDate || undefined,
      endDate:   endDate   || undefined,
      carryOpenFindings,
    });
    setDone(result);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-[#0F2D4A]">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-white/10 flex items-center justify-center">
              <RotateCcw className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Roll-forward</p>
              <p className="text-xs text-white/60">Copiar estructura al siguiente período</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white rounded-lg p-1">
            <X className="h-4 w-4" />
          </button>
        </div>

        {done ? (
          /* Success state */
          <div className="p-8 flex flex-col items-center text-center gap-4">
            <div className="h-16 w-16 rounded-full bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            </div>
            <div>
              <p className="text-base font-semibold text-slate-800">Auditoría creada exitosamente</p>
              <p className="text-sm text-slate-500 mt-1">{done.title}</p>
            </div>
            <p className="text-xs text-slate-400">
              La nueva auditoría tiene todos los papeles de trabajo en estado <strong>En Proceso</strong> listos para comenzar.
            </p>
            <div className="flex gap-2 mt-2">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"
              >
                Cerrar
              </button>
              <button
                onClick={() => { onClose(); router.push(`/dashboard/audits/${done.id}`); }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0F2D4A] text-white text-sm font-medium hover:bg-[#1a4a7a]"
              >
                Abrir nueva auditoría
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-5">

            {/* Source reference */}
            <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 flex items-start gap-2.5">
              <Copy className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-blue-700">Copiando estructura de</p>
                <p className="text-sm text-blue-800 font-semibold mt-0.5">{sourceTitle}</p>
                <p className="text-xs text-blue-500 mt-1">
                  Se copiarán todos los papeles de trabajo (sin contenido) con estado inicial "En Proceso".
                </p>
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Título de la nueva auditoría *
              </label>
              <input
                required
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Fecha inicio</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Fecha fin</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                />
              </div>
            </div>

            {/* Carry findings toggle */}
            <label className="flex items-start gap-3 cursor-pointer">
              <div className="mt-0.5">
                <input
                  type="checkbox"
                  checked={carryOpenFindings}
                  onChange={e => setCarryOpenFindings(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700">Trasladar hallazgos abiertos</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Los hallazgos en estado Borrador, En Revisión, o Aprobado se copiarán como [CF] carry-forward para seguimiento.
                </p>
              </div>
            </label>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={rollForward.isPending || !title.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0F2D4A] text-white text-sm font-medium hover:bg-[#1a4a7a] disabled:opacity-50"
              >
                {rollForward.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Creando...</>
                ) : (
                  <><RotateCcw className="h-4 w-4" />Crear Roll-forward</>
                )}
              </button>
            </div>

            {rollForward.isError && (
              <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
                Error al crear la auditoría. Verifica los datos e intenta de nuevo.
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
