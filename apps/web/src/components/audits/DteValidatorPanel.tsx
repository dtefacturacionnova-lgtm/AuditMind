'use client';

import { useState, useRef } from 'react';
import {
  Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle, ShieldAlert,
  HelpCircle, ChevronDown, ChevronRight, X, RefreshCw,
} from 'lucide-react';
import {
  useValidateDte, type DteRecord, type DteValidationResult,
  type DteConformity, type DteSeverity,
} from '@/hooks/useDteValidator';

// ─── Visual mapping ──────────────────────────────────────────────────────────

const CONFORMITY_STYLE: Record<DteConformity, { bg: string; border: string; text: string; label: string; Icon: typeof CheckCircle2 }> = {
  CLEAN:           { bg: 'bg-emerald-50',  border: 'border-emerald-200', text: 'text-emerald-700',   label: 'Sin anomalías', Icon: CheckCircle2 },
  MINOR_ISSUES:    { bg: 'bg-blue-50',     border: 'border-blue-200',    text: 'text-blue-700',      label: 'Anomalías menores', Icon: CheckCircle2 },
  SUSPECT:         { bg: 'bg-amber-50',    border: 'border-amber-200',   text: 'text-amber-700',     label: 'Sospechosa — revisar', Icon: AlertTriangle },
  NON_CONFORMING:  { bg: 'bg-red-50',      border: 'border-red-200',     text: 'text-red-700',       label: 'NO conforme — riesgo alto', Icon: ShieldAlert },
};

const SEVERITY_STYLE: Record<DteSeverity, { color: string; bg: string }> = {
  LOW:    { color: 'text-gray-600',   bg: 'bg-gray-100 border-gray-200' },
  MEDIUM: { color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200' },
  HIGH:   { color: 'text-red-700',    bg: 'bg-red-50 border-red-200' },
};

// ─── CSV parser ──────────────────────────────────────────────────────────────

function parseCsv(text: string): DteRecord[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return [];

  // Detect delimiter (, ; or \t)
  const sample = lines[0];
  const delim = sample.includes(';') ? ';' : sample.includes('\t') ? '\t' : ',';

  const headers = lines[0].split(delim).map(h => h.trim().toLowerCase().replace(/[^a-z0-9]/gi, ''));

  const headerMap: Record<string, keyof DteRecord> = {
    fecha:              'fecha', fechaemision: 'fecha', emision: 'fecha',
    hora:               'hora', horaemision: 'hora',
    numerocorrelativo:  'numeroCorrelativo', correlativo: 'numeroCorrelativo',
    numerodte:          'numeroCorrelativo', numerodocumento: 'numeroCorrelativo', numero: 'numeroCorrelativo',
    tipo:               'tipo', tipodte: 'tipo', tipodocumento: 'tipo',
    codigogeneracion:   'codigoGeneracion', codigo: 'codigoGeneracion', codigogen: 'codigoGeneracion',
    estado:             'estado', estatus: 'estado',
    monto:              'monto', montototal: 'monto', total: 'monto',
    receptornit:        'receptorNit', nit: 'receptorNit', nitreceptor: 'receptorNit',
    receptornombre:     'receptorNombre', nombre: 'receptorNombre', nombrereceptor: 'receptorNombre',
  };

  const records: DteRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(delim);
    if (cells.length < 2) continue;

    const r: Partial<DteRecord> = {};
    for (let c = 0; c < headers.length; c++) {
      const key = headerMap[headers[c]];
      if (!key) continue;
      const val = cells[c]?.trim();
      if (val) {
        (r as Record<string, string>)[key] = val;
      }
    }

    if (r.fecha && r.numeroCorrelativo) {
      records.push(r as DteRecord);
    }
  }
  return records;
}

// ─── Score ring ──────────────────────────────────────────────────────────────

function RiskRing({ score }: { score: number }) {
  const r = 30;
  const C = 2 * Math.PI * r;
  const offset = C - (score / 100) * C;
  const color = score >= 65 ? '#ef4444' : score >= 35 ? '#f59e0b' : score >= 15 ? '#3b82f6' : '#10b981';
  return (
    <svg viewBox="0 0 80 80" className="w-20 h-20">
      <circle cx="40" cy="40" r={r} fill="none" stroke="#e5e7eb" strokeWidth="6" />
      <circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="6"
        strokeDasharray={C} strokeDashoffset={offset} strokeLinecap="round"
        transform="rotate(-90 40 40)" />
      <text x="40" y="44" textAnchor="middle" fontSize="16" fontWeight="bold" fill="#1f2937">{Math.round(score)}</text>
      <text x="40" y="56" textAnchor="middle" fontSize="6" fill="#9ca3af">/100</text>
    </svg>
  );
}

// ─── Anomaly card ────────────────────────────────────────────────────────────

function AnomalyCard({ anomaly }: { anomaly: DteValidationResult['anomalies'][number] }) {
  const [open, setOpen] = useState(false);
  const sevStyle = SEVERITY_STYLE[anomaly.severity];

  return (
    <div className={`border rounded-2xl overflow-hidden ${sevStyle.bg}`}>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
        <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${sevStyle.color} bg-white border border-current/20`}>
          {anomaly.severity}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800">{anomaly.type.replace(/_/g, ' ')}</p>
          <p className="text-xs text-gray-600 mt-0.5">{anomaly.description}</p>
        </div>
        <span className="text-[10px] text-gray-500">{anomaly.affected.length} afectado(s)</span>
        {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
      </button>

      {open && anomaly.affected.length > 0 && (
        <div className="bg-white border-t border-current/10 max-h-60 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-3 py-1.5 text-left text-gray-600 font-semibold">Correlativo</th>
                <th className="px-3 py-1.5 text-left text-gray-600 font-semibold">Fecha</th>
                <th className="px-3 py-1.5 text-left text-gray-600 font-semibold">Hora</th>
                <th className="px-3 py-1.5 text-left text-gray-600 font-semibold">Notas</th>
              </tr>
            </thead>
            <tbody>
              {anomaly.affected.map((a, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="px-3 py-1.5 font-mono text-gray-700">{a.correlativo || '—'}</td>
                  <td className="px-3 py-1.5 text-gray-700">{a.fecha || '—'}</td>
                  <td className="px-3 py-1.5 text-gray-500">{a.hora ?? '—'}</td>
                  <td className="px-3 py-1.5 text-gray-500">{a.extra ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function DteValidatorPanel() {
  const [records, setRecords]   = useState<DteRecord[]>([]);
  const [filename, setFilename] = useState<string | null>(null);
  const [parseError, setParseError] = useState('');
  const [result, setResult]     = useState<DteValidationResult | null>(null);
  const validate = useValidateDte();
  const fileRef  = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setParseError('');
    setResult(null);
    setFilename(file.name);
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.length === 0) {
        setParseError('No se detectaron registros válidos. Asegúrate que el CSV tenga columnas "fecha" y "numeroCorrelativo" como mínimo.');
        setRecords([]);
        return;
      }
      setRecords(parsed);
    } catch (e) {
      setParseError((e as Error).message ?? 'Error al leer archivo');
    }
  }

  async function handleRun() {
    if (records.length === 0) return;
    try {
      const res = await validate.mutateAsync({ records });
      setResult(res);
    } catch (e) {
      setParseError((e as Error).message ?? 'Error en validación');
    }
  }

  function reset() {
    setRecords([]);
    setResult(null);
    setFilename(null);
    setParseError('');
    if (fileRef.current) fileRef.current.value = '';
  }

  const style = result ? CONFORMITY_STYLE[result.conformity] : null;

  return (
    <div className="space-y-4">
      {/* Upload zone */}
      {records.length === 0 && (
        <div className="bg-white rounded-2xl border-2 border-dashed border-violet-300 p-10 text-center">
          <FileSpreadsheet className="w-12 h-12 text-violet-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-gray-900 mb-1">Validador de DTEs (CT SV)</h3>
          <p className="text-sm text-gray-600 max-w-md mx-auto mb-4">
            Carga un CSV con los DTEs del período. Detectaré saltos en correlativo, emisiones en feriados,
            duplicados, anulaciones excesivas y otras anomalías que la DGII examina.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.tsv,text/csv"
            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
            className="hidden"
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white font-semibold rounded-xl hover:bg-violet-700"
          >
            <Upload className="w-4 h-4" />
            Subir CSV
          </button>
          {parseError && <p className="text-xs text-red-600 mt-3">{parseError}</p>}
          <div className="mt-5 text-[10px] text-gray-400">
            Columnas reconocidas: fecha, hora, numeroCorrelativo, tipo, codigoGeneracion, estado, monto, receptorNit, receptorNombre
          </div>
        </div>
      )}

      {/* Records loaded — run button */}
      {records.length > 0 && !result && (
        <div className="bg-violet-50 border border-violet-200 rounded-2xl p-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="w-6 h-6 text-violet-600" />
            <div>
              <p className="text-sm font-bold text-gray-900">{filename}</p>
              <p className="text-xs text-gray-600">{records.length} DTEs detectados · listos para análisis</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={reset} className="text-xs text-gray-500 hover:text-gray-700">Cambiar archivo</button>
            <button
              onClick={handleRun}
              disabled={validate.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white font-semibold text-sm rounded-xl hover:bg-violet-700 disabled:opacity-50"
            >
              {validate.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <HelpCircle className="w-4 h-4" />}
              Analizar DTEs
            </button>
          </div>
        </div>
      )}

      {/* Result */}
      {result && style && (
        <>
          <div className={`${style.bg} ${style.border} border-2 rounded-2xl p-5`}>
            <div className="flex items-start gap-5">
              <RiskRing score={result.riskScore} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <style.Icon className={`w-5 h-5 ${style.text}`} />
                  <h3 className={`text-lg font-bold ${style.text}`}>{style.label}</h3>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed">{result.recommendation}</p>

                <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                  <Stat label="Total DTEs" value={result.totalRecords} />
                  <Stat label="Anomalías" value={result.anomalies.length} />
                  <Stat label="Anulados %" value={`${result.summary.anuladosPct.toFixed(1)}%`} />
                </div>
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                <button
                  onClick={reset}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50"
                >
                  <X className="w-3.5 h-3.5" />
                  Cerrar
                </button>
                <button
                  onClick={handleRun}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-violet-200 text-violet-700 text-xs font-medium rounded-lg hover:bg-violet-50"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Re-analizar
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide">
              {result.anomalies.length} Anomalía(s) detectada(s)
            </h4>
            {result.anomalies.length === 0 ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-sm font-semibold text-emerald-800">
                  Ningún DTE presenta anomalías significativas
                </p>
              </div>
            ) : (
              result.anomalies.map((a, i) => <AnomalyCard key={i} anomaly={a} />)
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-lg px-3 py-2 border border-gray-100">
      <p className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-lg font-bold text-gray-800 mt-0.5">{value}</p>
    </div>
  );
}
