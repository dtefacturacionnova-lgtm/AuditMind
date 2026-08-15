'use client';

import { useRef, useState } from 'react';
import { Download, Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle, AlertCircle } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useImportExcelTemplate, type ExcelLecturaResultado } from '@/hooks/useWorkingPaperGraph';

/**
 * Botón genérico "Descargar plantilla / Subir plantilla completada" (EXC-04).
 * Reutilizable para cualquier `ExcelTemplateKey` registrada en
 * `excel-templates.registry.ts` (backend) — ver
 * docs/integracion-excel-plantillas-inteligentes.md §3.
 *
 * No asume nada sobre el contenido de la plantilla: solo dispara la descarga
 * (`GET .../excel-template/:key`) y la subida (`POST .../excel-template/:key/import`)
 * y muestra el resultado. Cada plantilla concreta (fases 1-5) se inserta donde
 * corresponda pasando su propio `templateKey`.
 */
export function ExcelTemplateBar({
  paperId, templateKey, label, description,
}: {
  paperId: string;
  templateKey: string;
  label: string;
  description?: string;
}) {
  const importar = useImportExcelTemplate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [descargando, setDescargando] = useState(false);
  const [resultado, setResultado] = useState<ExcelLecturaResultado | null>(null);
  const [error, setError] = useState('');

  async function handleDescargar() {
    setDescargando(true);
    setError('');
    try {
      await apiClient.downloadFile(
        `/working-papers/${paperId}/excel-template/${templateKey}`,
        `AuditMind_${templateKey}_${paperId.slice(0, 8)}.xlsx`,
      );
    } catch (err) {
      setError((err as Error).message || 'Error al descargar la plantilla');
    } finally {
      setDescargando(false);
    }
  }

  async function handleArchivoSeleccionado(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite volver a seleccionar el mismo archivo
    if (!file) return;
    setError('');
    setResultado(null);
    try {
      const res = await importar.mutateAsync({ paperId, templateKey, file });
      setResultado(res);
    } catch (err) {
      setError((err as Error).message || 'Error al subir la plantilla');
    }
  }

  const pendiente = descargando || importar.isPending;

  return (
    <div className="pt-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
          <FileSpreadsheet className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
          {description ?? `Plantilla Excel "${label}" — datos del encargo ya pre-llenados, zonas libres para el auditor.`}
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleDescargar}
            disabled={pendiente}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            title={`Descargar plantilla "${label}"`}
          >
            {descargando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            {descargando ? 'Descargando…' : 'Descargar plantilla'}
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={pendiente}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            title="Subir la plantilla completada"
          >
            {importar.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {importar.isPending ? 'Subiendo…' : 'Subir completada'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={handleArchivoSeleccionado}
          />
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg px-3 py-2 mt-2 text-xs bg-red-50 border border-red-200 text-red-700">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {error}
        </div>
      )}

      {resultado && (
        <div className="rounded-lg px-3 py-2 mt-2 text-xs bg-emerald-50 border border-emerald-200 text-emerald-700 space-y-1.5">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            {resultado.seccionesActualizadas.length > 0
              ? `Se actualizaron ${resultado.seccionesActualizadas.length} sección(es) a partir de ${resultado.rangosLeidos} rango(s) leído(s).`
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
  );
}
