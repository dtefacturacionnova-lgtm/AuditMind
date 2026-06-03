'use client';

import { useState, useRef } from 'react';
import {
  Upload, Database, Loader2, CheckCircle2, AlertTriangle, ShieldAlert,
  RefreshCw, Search, X,
} from 'lucide-react';
import {
  useDgiiStats, useImportDgii, useVerifyDgii,
  type DgiiContribuyente, type VerifyResult,
} from '@/hooks/useDgii';

// ─── CSV parser ──────────────────────────────────────────────────────────────

function parseCsv(text: string): DgiiContribuyente[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return [];
  const delim = lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : ',';
  const headers = lines[0].split(delim).map(h => h.trim().toLowerCase().replace(/[^a-z0-9]/gi, ''));

  const map: Record<string, keyof DgiiContribuyente> = {
    nit: 'nit', nrc: 'nrc',
    nombre: 'nombre', razonsocial: 'nombre', razon: 'nombre',
    estado: 'estado', situacion: 'estado',
    giro: 'giro', actividad: 'giro', actividadeconomica: 'giro',
    categoria: 'categoria', tipocontribuyente: 'categoria',
    fechainscripcion: 'fechaInscripcion', inscripcion: 'fechaInscripcion',
    direccion: 'direccion',
  };

  const records: DgiiContribuyente[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(delim);
    const r: Partial<DgiiContribuyente> = {};
    for (let c = 0; c < headers.length; c++) {
      const key = map[headers[c]];
      if (!key) continue;
      const val = cells[c]?.trim();
      if (val) (r as Record<string, string>)[key] = val;
    }
    if (r.nit && r.nombre) records.push({ estado: 'ACTIVO', ...r } as DgiiContribuyente);
  }
  return records;
}

// ─── Main panel ──────────────────────────────────────────────────────────────

export function DgiiNrcPanel() {
  const { data: stats } = useDgiiStats();
  const importMut = useImportDgii();
  const verifyMut = useVerifyDgii();

  const [parsedRecords, setParsedRecords] = useState<DgiiContribuyente[]>([]);
  const [filename, setFilename] = useState<string | null>(null);
  const [importError, setImportError] = useState('');
  const [replaceAll, setReplaceAll] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; created: number; updated: number } | null>(null);

  const [nitsInput, setNitsInput] = useState('');
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  // ── Import handlers ────────────────────────────────────────────────────
  async function handleFile(file: File) {
    setImportError('');
    setImportResult(null);
    setFilename(file.name);
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.length === 0) {
        setImportError('No se detectaron registros válidos. CSV debe tener columnas "nit" y "nombre" como mínimo.');
        return;
      }
      setParsedRecords(parsed);
    } catch (e) {
      setImportError((e as Error).message);
    }
  }

  async function handleImport() {
    if (parsedRecords.length === 0) return;
    try {
      const res = await importMut.mutateAsync({ contribuyentes: parsedRecords, replaceAll });
      setImportResult(res);
      setParsedRecords([]);
      setFilename(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (e) {
      setImportError((e as Error).message);
    }
  }

  // ── Verify handler ─────────────────────────────────────────────────────
  async function handleVerify() {
    const nits = nitsInput.split(/[\n,;\s]+/).map(s => s.trim()).filter(Boolean);
    if (nits.length === 0) return;
    try {
      const res = await verifyMut.mutateAsync(nits);
      setVerifyResult(res);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <div className="space-y-5">

      {/* ── Stats ── */}
      <div className="bg-gradient-to-r from-violet-50 to-blue-50 border border-violet-200 rounded-2xl p-4">
        <div className="flex items-center gap-3">
          <Database className="w-8 h-8 text-violet-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-gray-900">Padrón DGII — caché local</h3>
            {stats && stats.total > 0 ? (
              <p className="text-xs text-gray-600 mt-0.5">
                <strong>{stats.total.toLocaleString('es-CL')}</strong> contribuyentes cargados ·{' '}
                {Object.entries(stats.byEstado).map(([k, v]) => (
                  <span key={k} className="mr-2"><strong>{v}</strong> {k.toLowerCase()}</span>
                ))}
                {stats.lastImportAt && <span className="text-gray-400"> · última carga {new Date(stats.lastImportAt).toLocaleString('es-CL')}</span>}
              </p>
            ) : (
              <p className="text-xs text-gray-500 mt-0.5">Sin padrón cargado todavía. Importa el archivo de contribuyentes activos publicado por DGII.</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Import block ── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
          <Upload className="w-4 h-4 text-violet-600" />
          Importar / actualizar padrón
        </h3>

        {parsedRecords.length === 0 && !importResult && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.tsv,text/csv"
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
              className="hidden"
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full border-2 border-dashed border-violet-300 rounded-xl p-6 text-center hover:bg-violet-50/30 transition-colors"
            >
              <Upload className="w-6 h-6 text-violet-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-gray-700">Subir archivo CSV</p>
              <p className="text-xs text-gray-500 mt-1">Columnas: nit, nrc, nombre, estado, giro, categoria, fechaInscripcion, direccion</p>
            </button>
            {importError && <p className="text-xs text-red-600 mt-2">{importError}</p>}
          </>
        )}

        {parsedRecords.length > 0 && (
          <div className="space-y-3">
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-800">{filename}</p>
                <p className="text-xs text-gray-600">{parsedRecords.length.toLocaleString('es-CL')} contribuyentes listos</p>
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-700">
              <input type="checkbox" checked={replaceAll} onChange={e => setReplaceAll(e.target.checked)} />
              <span>Reemplazar TODO el padrón previo (en lugar de actualizar incremental)</span>
            </label>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => { setParsedRecords([]); setFilename(null); if (fileRef.current) fileRef.current.value = ''; }}
                className="text-xs text-gray-500 hover:text-gray-700">Cancelar</button>
              <button
                onClick={handleImport}
                disabled={importMut.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 disabled:opacity-50"
              >
                {importMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                Importar {parsedRecords.length.toLocaleString('es-CL')} registros
              </button>
            </div>
          </div>
        )}

        {importResult && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-emerald-900">Importación exitosa</p>
              <p className="text-xs text-emerald-700 mt-0.5">
                {importResult.imported.toLocaleString('es-CL')} registros procesados · {importResult.created} creados · {importResult.updated} actualizados
              </p>
            </div>
            <button onClick={() => setImportResult(null)} className="text-emerald-600 hover:text-emerald-800">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* ── Verify block ── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
          <Search className="w-4 h-4 text-violet-600" />
          Verificar NITs (anti-facturas de favor)
        </h3>

        <textarea
          value={nitsInput}
          onChange={e => setNitsInput(e.target.value)}
          placeholder="Pega aquí los NITs a verificar (uno por línea, separados por coma, espacio o salto de línea).&#10;Ej:&#10;06140811960017&#10;06141911950021&#10;..."
          rows={6}
          className="w-full text-sm font-mono border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
        />
        <div className="flex items-center justify-between mt-2">
          <p className="text-[10px] text-gray-500">
            Detecta proveedores sin NIT registrado en DGII (posibles facturas de favor) o con NRC suspendido/cancelado.
          </p>
          <button
            onClick={handleVerify}
            disabled={verifyMut.isPending || !nitsInput.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 disabled:opacity-50"
          >
            {verifyMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Verificar
          </button>
        </div>

        {verifyResult && (
          <VerifyResultView result={verifyResult} onClear={() => setVerifyResult(null)} />
        )}
      </div>
    </div>
  );
}

// ─── Verify result view ──────────────────────────────────────────────────────

function VerifyResultView({ result, onClear }: { result: VerifyResult; onClear: () => void }) {
  return (
    <div className="mt-4 space-y-3">
      <div className="grid grid-cols-4 gap-2">
        <KPI label="Total" value={result.summary.total} color="bg-gray-50 text-gray-700 border-gray-200" />
        <KPI label="Activos" value={result.summary.activeCount} color="bg-emerald-50 text-emerald-700 border-emerald-200" />
        <KPI label="Suspendidos / Cancelados" value={result.summary.suspendedCount} color="bg-amber-50 text-amber-700 border-amber-200" />
        <KPI label="NO ENCONTRADOS" value={result.summary.notFoundCount} color="bg-red-50 text-red-700 border-red-200" />
      </div>

      {result.summary.notFoundCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2">
            <ShieldAlert className="w-4 h-4 text-red-600" />
            <p className="text-sm font-bold text-red-900">NITs no encontrados en padrón</p>
          </div>
          <p className="text-xs text-red-700 mb-2">
            Potencial indicador de facturas de favor o proveedores no registrados en DGII. Investigar caso por caso.
          </p>
          <div className="font-mono text-xs text-red-800 space-y-0.5 max-h-32 overflow-y-auto">
            {result.notFound.map(n => <div key={n}>{n}</div>)}
          </div>
        </div>
      )}

      {result.summary.suspendedCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <p className="text-sm font-bold text-amber-900">NITs suspendidos o cancelados</p>
          </div>
          <table className="w-full text-xs">
            <thead className="bg-amber-100/50">
              <tr>
                <th className="px-2 py-1 text-left text-amber-800">NIT</th>
                <th className="px-2 py-1 text-left text-amber-800">Nombre</th>
                <th className="px-2 py-1 text-left text-amber-800">Estado</th>
              </tr>
            </thead>
            <tbody>
              {result.found.filter(f => !f.isActive).map(f => (
                <tr key={f.nit} className="border-t border-amber-200/50">
                  <td className="px-2 py-1 font-mono">{f.nit}</td>
                  <td className="px-2 py-1">{f.nombre}</td>
                  <td className="px-2 py-1 font-medium text-amber-700">{f.estado}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <p className="text-[10px] text-gray-500">
          {result.summary.activeCount} contribuyentes verificados como ACTIVOS · no requieren acción
        </p>
        <button onClick={onClear} className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
          <RefreshCw className="w-3 h-3" /> Limpiar resultado
        </button>
      </div>
    </div>
  );
}

function KPI({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`rounded-xl border p-2.5 ${color}`}>
      <p className="text-[10px] opacity-75 uppercase tracking-wide font-medium">{label}</p>
      <p className="text-xl font-bold mt-0.5">{value}</p>
    </div>
  );
}
