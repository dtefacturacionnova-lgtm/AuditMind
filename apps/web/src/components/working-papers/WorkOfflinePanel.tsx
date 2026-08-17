'use client';

import { useRef, useState } from 'react';
import {
  Download, Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle,
  AlertCircle, ChevronDown, ChevronUp,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useImportExcelGenerico, type ExcelLecturaResultado, type PaperSection, type SectionFieldType } from '@/hooks/useWorkingPaperGraph';

/**
 * Plantilla Excel genérica (EXC-24..27, §5.5 del documento de diseño) —
 * "marcar cualquier papel para trabajarlo fuera de línea". A diferencia de
 * `ExcelTemplateBar` (una clave de plantilla fija, layout hecho a mano), este
 * panel deja al auditor elegir CUÁLES secciones de ESTE papel incluir, y el
 * layout se genera automáticamente en el backend a partir de lo que cada
 * sección ya declara — cubre ~93% de las secciones del sistema sin que haga
 * falta escribir una plantilla nueva por papel.
 *
 * Debe montarse UNA vez por papel (no por sección) — recibe todas las
 * secciones y decide internamente cuáles son elegibles.
 */
const TIPOS_ELEGIBLES: SectionFieldType[] = [
  'MATRIX', 'TEXTAREA', 'TEXT', 'CURRENCY', 'BOOLEAN', 'ENUM_SELECT', 'DATE', 'PERCENTAGE',
];

interface Props {
  paperId: string;
  sections: PaperSection[];
  readonly?: boolean;
}

export function WorkOfflinePanel({ paperId, sections, readonly }: Props) {
  const elegibles = sections.filter(s => TIPOS_ELEGIBLES.includes(s.fieldType));
  const importar = useImportExcelGenerico();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [abierto, setAbierto] = useState(false);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [descargando, setDescargando] = useState(false);
  const [omitidas, setOmitidas] = useState<Array<{ sectionKey: string; motivo: string }>>([]);
  const [resultado, setResultado] = useState<ExcelLecturaResultado | null>(null);
  const [error, setError] = useState('');

  if (readonly || elegibles.length === 0) return null;

  function toggle(sectionKey: string) {
    setSeleccion(prev => {
      const next = new Set(prev);
      if (next.has(sectionKey)) next.delete(sectionKey); else next.add(sectionKey);
      return next;
    });
  }

  async function handleDescargar() {
    if (seleccion.size === 0) { setError('Seleccione al menos una sección'); return; }
    setDescargando(true);
    setError('');
    setOmitidas([]);
    try {
      const query = Array.from(seleccion).join(',');
      const headers = await apiClient.downloadFileWithHeaders(
        `/working-papers/${paperId}/excel-generic?sections=${encodeURIComponent(query)}`,
        `AuditMind_Generico_${paperId.slice(0, 8)}.xlsx`,
      );
      const raw = headers.get('X-AuditMind-Omitidas');
      if (raw) {
        try { setOmitidas(JSON.parse(decodeURIComponent(raw))); } catch { /* ignore */ }
      }
    } catch (err) {
      setError((err as Error).message || 'Error al descargar la plantilla');
    } finally {
      setDescargando(false);
    }
  }

  async function handleArchivoSeleccionado(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setResultado(null);
    try {
      const res = await importar.mutateAsync({ paperId, file });
      setResultado(res);
    } catch (err) {
      setError((err as Error).message || 'Error al subir la plantilla');
    }
  }

  const pendiente = descargando || importar.isPending;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
      <button
        type="button"
        onClick={() => setAbierto(v => !v)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
          Trabajar fuera de línea
        </span>
        {abierto ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {abierto && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-xs text-gray-500">
            Marque las secciones que quiere descargar en un Excel para trabajarlas sin conexión. Al volver a subir el
            archivo, cada sección se reemplaza tal cual quedó — igual que editarla directamente en pantalla.
          </p>

          <div className="flex flex-wrap gap-2">
            {elegibles.map(s => (
              <label
                key={s.sectionKey}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border cursor-pointer transition-colors ${
                  seleccion.has(s.sectionKey)
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={seleccion.has(s.sectionKey)}
                  onChange={() => toggle(s.sectionKey)}
                  className="accent-emerald-600"
                />
                {s.sectionKey} — {s.label}
              </label>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDescargar}
              disabled={pendiente || seleccion.size === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {descargando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              {descargando ? 'Descargando…' : `Descargar (${seleccion.size})`}
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={pendiente}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {importar.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {importar.isPending ? 'Subiendo…' : 'Subir completada'}
            </button>
            <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={handleArchivoSeleccionado} />
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs bg-red-50 border border-red-200 text-red-700">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {error}
            </div>
          )}

          {omitidas.length > 0 && (
            <div className="rounded-lg px-3 py-2 text-xs bg-amber-50 border border-amber-200 text-amber-700 space-y-1">
              <p className="font-semibold">Secciones no incluidas:</p>
              {omitidas.map((o, i) => (
                <p key={i}>· <b>{o.sectionKey}</b>: {o.motivo}</p>
              ))}
            </div>
          )}

          {resultado && (
            <div className="rounded-lg px-3 py-2 text-xs bg-emerald-50 border border-emerald-200 text-emerald-700 space-y-1.5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                {resultado.seccionesActualizadas.length > 0
                  ? `Se actualizaron ${resultado.seccionesActualizadas.length} sección(es).`
                  : 'El archivo se procesó, pero ninguna sección se actualizó — revise las advertencias.'}
              </div>
              {resultado.advertencias.length > 0 && (
                <ul className="space-y-1 pl-1">
                  {resultado.advertencias.map((a, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-amber-700">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{a.rangoNombre ? <b>{a.rangoNombre}:</b> : null} {a.mensaje}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
