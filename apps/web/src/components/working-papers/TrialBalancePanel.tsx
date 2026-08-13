'use client';

import { useState, useRef } from 'react';
import {
  Upload, RefreshCw, CheckCircle2, AlertCircle, Table2, Tag,
  BarChart3, Loader2, Save, FileSpreadsheet,
} from 'lucide-react';
import type { PaperSection } from '@/hooks/useWorkingPaperGraph';
import { useMaterialidadByAudit } from '@/hooks/useWorkingPaperGraph';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TrialBalanceRow {
  cuenta:          string;
  descripcion:     string;
  saldo_actual:    number;
  saldo_anterior:  number;
  saldo_anterior2: number;
}

export interface AccountMappingRow {
  cuenta:          string;
  descripcion:     string;
  saldo_actual:    number;
  saldo_anterior:  number;
  saldo_anterior2: number;
  sub_sumaria:     string;
  grupo:           string;
}

// ── SV default code ranges ────────────────────────────────────────────────────

interface CodeRange { from: number; to: number; sub: string; grupo: string }

const SV_RANGES: CodeRange[] = [
  { from: 1100, to: 1199, sub: 'B-01a', grupo: 'Activos Corrientes'    },
  { from: 1200, to: 1299, sub: 'B-01b', grupo: 'Activos Corrientes'    },
  { from: 1300, to: 1399, sub: 'B-01c', grupo: 'Activos Corrientes'    },
  { from: 1400, to: 1499, sub: 'B-01d', grupo: 'Activos Corrientes'    },
  { from: 1500, to: 1699, sub: 'B-02a', grupo: 'Activos No Corrientes' },
  { from: 1700, to: 1799, sub: 'B-02b', grupo: 'Activos No Corrientes' },
  { from: 1800, to: 1999, sub: 'B-02c', grupo: 'Activos No Corrientes' },
  { from: 2100, to: 2299, sub: 'B-03a', grupo: 'Pasivos Corrientes'    },
  { from: 2300, to: 2499, sub: 'B-03b', grupo: 'Pasivos Corrientes'    },
  { from: 2500, to: 2699, sub: 'B-03c', grupo: 'Pasivos Corrientes'    },
  { from: 2700, to: 2999, sub: 'B-04a', grupo: 'Pasivos No Corrientes' },
  { from: 3000, to: 3999, sub: 'B-05a', grupo: 'Patrimonio'            },
  { from: 4000, to: 4999, sub: 'B-06a', grupo: 'Resultados'            },
  { from: 5000, to: 5999, sub: 'B-06b', grupo: 'Resultados'            },
  { from: 6000, to: 6999, sub: 'B-06c', grupo: 'Resultados'            },
  { from: 7000, to: 7999, sub: 'B-06d', grupo: 'Resultados'            },
];

const SUB_SUMARIA_OPTIONS = [
  { value: 'B-01a', label: 'B-01a · Caja y Bancos'               },
  { value: 'B-01b', label: 'B-01b · Cuentas por Cobrar'          },
  { value: 'B-01c', label: 'B-01c · Inventarios'                 },
  { value: 'B-01d', label: 'B-01d · Otros Activos Corrientes'    },
  { value: 'B-02a', label: 'B-02a · Propiedad, Planta y Equipo'  },
  { value: 'B-02b', label: 'B-02b · Intangibles y Diferidos'     },
  { value: 'B-02c', label: 'B-02c · Otros Activos No Corrientes' },
  { value: 'B-03a', label: 'B-03a · Proveedores y CxP'           },
  { value: 'B-03b', label: 'B-03b · Préstamos Corrientes'        },
  { value: 'B-03c', label: 'B-03c · Otros Pasivos Corrientes'    },
  { value: 'B-04a', label: 'B-04a · Deuda Largo Plazo'           },
  { value: 'B-04b', label: 'B-04b · Otros Pasivos No Corrientes' },
  { value: 'B-05a', label: 'B-05a · Patrimonio Neto'             },
  { value: 'B-06a', label: 'B-06a · Ingresos'                    },
  { value: 'B-06b', label: 'B-06b · Costos de Ventas'            },
  { value: 'B-06c', label: 'B-06c · Gastos de Operación'         },
  { value: 'B-06d', label: 'B-06d · Otros Ingresos / Gastos'     },
  { value: 'SIN_ASIGNAR', label: '⚠ Sin asignar'                },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

export interface SkippedRow {
  lineNum:   number;
  rawCuenta: string;
  reason:    string;
}

export interface ParseResult {
  valid:   TrialBalanceRow[];
  skipped: SkippedRow[];
}

function splitLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; continue; }
    if ((ch === ',' || ch === ';' || ch === '\t') && !inQ) {
      result.push(cur.trim()); cur = '';
    } else { cur += ch; }
  }
  result.push(cur.trim());
  return result;
}

// A valid account code must contain at least one digit and not be a metadata token
function isValidAccountCode(raw: string): { ok: boolean; reason?: string } {
  const code = raw.trim();
  if (!code) return { ok: false, reason: 'Código vacío' };
  if (code.length > 30) return { ok: false, reason: 'Texto demasiado largo para ser un código de cuenta' };
  if (code.startsWith('(') || code.startsWith(')')) return { ok: false, reason: 'Parece un año entre paréntesis (fila de encabezado)' };
  if (/[|]/.test(code)) return { ok: false, reason: 'Contiene separadores de fila de título' };
  if (!/\d/.test(code)) return { ok: false, reason: 'No contiene ningún dígito (fila de texto descriptivo)' };
  const lower = code.toLowerCase().replace(/[\s_\-]/g, '');
  const metaWords = ['cuenta', 'codigo', 'code', 'cta', 'descripcion', 'nombre',
                     'saldoactual', 'saldoanterior', 'saldo', 'balance', 'total'];
  if (metaWords.some(w => lower === w || lower.startsWith(w + '('))) {
    return { ok: false, reason: 'Fila de encabezado de columna' };
  }
  return { ok: true };
}

function parseCSVWithReport(text: string): ParseResult {
  const lines = text.split('\n').map(l => l.replace(/\r/g, '').trim()).filter(Boolean);
  if (lines.length < 2) return { valid: [], skipped: [] };

  // Auto-detect header row: scan first 6 rows for recognizable column keywords
  const HDR_KEYWORDS = ['cuenta', 'codigo', 'code', 'cta', 'descripcion', 'nombre', 'saldo', 'debe', 'haber', 'actual', 'anterior'];
  let headerIdx = 0;
  for (let i = 0; i < Math.min(6, lines.length); i++) {
    const norm = lines[i].toLowerCase().replace(/[\s_\-\.]+/g, '');
    if (HDR_KEYWORDS.filter(k => norm.includes(k)).length >= 2) { headerIdx = i; break; }
  }

  const hdr = splitLine(lines[headerIdx]).map(h =>
    h.toLowerCase().replace(/[\s_\-\.]+/g, '').replace(/\(.*?\)/g, ''),
  );

  function col(patterns: string[]): number {
    for (const p of patterns) {
      const i = hdr.findIndex(h => h.includes(p));
      if (i >= 0) return i;
    }
    return -1;
  }
  const iCuenta = col(['cuenta', 'codigo', 'code', 'cta', 'num', 'nro']);
  const iDesc   = col(['descripcion', 'nombre', 'concepto', 'name', 'desc', 'detalle', 'detail']);
  const iActual = col(['actual', 'current', 'saldoactual', 'corriente', 'periodo1', 'ano1', 'saldo1']);
  const iAnt    = col(['anterior', 'prior', 'saldoanterior', 'periodo2', 'ano2', 'saldo2']);
  const iAnt2   = col(['anterior2', 'prev2', 'periodo3', 'ano3', 'saldo3', 'anteriordos']);

  const toN = (v: string) => parseFloat(v.replace(/[$,\s]/g, '').replace(/\(([^)]+)\)/, '-$1')) || 0;
  const g   = (cells: string[], i: number, fb: number) => cells[i >= 0 ? i : fb] ?? '';

  const valid:   TrialBalanceRow[] = [];
  const skipped: SkippedRow[]      = [];

  lines.slice(headerIdx + 1).forEach((line, idx) => {
    const c        = splitLine(line);
    const rawCuenta = g(c, iCuenta, 0);
    const actual    = toN(g(c, iActual, 2));

    // Silently skip fully blank rows
    if (!rawCuenta && actual === 0) return;

    const { ok, reason } = isValidAccountCode(rawCuenta);
    if (!ok) {
      skipped.push({ lineNum: headerIdx + idx + 2, rawCuenta, reason: reason! });
      return;
    }

    valid.push({
      cuenta:          rawCuenta,
      descripcion:     g(c, iDesc, 1),
      saldo_actual:    actual,
      saldo_anterior:  toN(g(c, iAnt, 3)),
      saldo_anterior2: toN(g(c, iAnt2, 4)),
    });
  });

  return { valid, skipped };
}

function parseCSV(text: string): ParseResult {
  return parseCSVWithReport(text);
}

function autoMap(code: string): { sub: string; grupo: string } {
  const n = parseInt(code.replace(/[^0-9]/g, '').substring(0, 4), 10);
  if (!isNaN(n)) {
    for (const r of SV_RANGES) {
      if (n >= r.from && n <= r.to) return { sub: r.sub, grupo: r.grupo };
    }
  }
  return { sub: 'SIN_ASIGNAR', grupo: 'No Clasificado' };
}

function fmtN(n: number): string {
  return new Intl.NumberFormat('es-SV', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function safeParseArray<T>(value: unknown): T[] {
  try { return Array.isArray(value) ? (value as T[]) : []; } catch { return []; }
}

// ── TrialBalanceImporter — sección S1 ────────────────────────────────────────

export function TrialBalanceImporter({
  section,
  readonly,
  onSave,
}: {
  section:  PaperSection;
  readonly: boolean;
  onSave:   (key: string, value: unknown) => void | Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview,    setPreview]  = useState<TrialBalanceRow[] | null>(null);
  const [parseError, setError]    = useState('');
  const [saving,     setSaving]   = useState(false);
  const [skipped,    setSkipped]  = useState<SkippedRow[]>([]);

  const saved  = safeParseArray<TrialBalanceRow>(section.value);
  const rows   = preview ?? saved;
  const hasSaved = saved.length > 0;

  const netActual   = rows.reduce((s, r) => s + r.saldo_actual, 0);
  const isCuadrado  = Math.abs(netActual) < 1;
  const netAnterior = rows.reduce((s, r) => s + r.saldo_anterior, 0);
  const netAnt2     = rows.reduce((s, r) => s + r.saldo_anterior2, 0);

  function applyParseResult(result: ParseResult) {
    setSkipped(result.skipped);
    if (!result.valid.length) {
      setError(
        result.skipped.length > 0
          ? `Ninguna fila pasó la validación (${result.skipped.length} fila${result.skipped.length > 1 ? 's' : ''} rechazada${result.skipped.length > 1 ? 's' : ''}). Verifique que la hoja tenga una fila de encabezado con "cuenta", "descripcion" y "saldo_actual".`
          : 'No se encontraron cuentas válidas. Verifique el formato del archivo.',
      );
      return;
    }
    setPreview(result.valid);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setError('');
    setSkipped([]);
    const isXlsx = /\.(xlsx?|ods)$/i.test(f.name);
    const reader = new FileReader();

    if (isXlsx) {
      reader.onload = async ev => {
        try {
          const { read, utils } = await import('xlsx');
          const wb  = read(ev.target?.result as ArrayBuffer, { type: 'array' });
          const ws  = wb.Sheets[wb.SheetNames[0]];
          const aoa = utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' }) as string[][];
          if (aoa.length < 2) { setError('El archivo Excel no tiene filas de datos.'); return; }
          // Sanitize: strip embedded newlines from cells (multi-line headers break CSV conversion)
          const csv = aoa
            .map(row => row.map(c => `"${String(c ?? '').replace(/[\n\r]+/g, ' ').replace(/"/g, '""')}"`).join(','))
            .join('\n');
          applyParseResult(parseCSV(csv));
        } catch (err) { setError(`Error al leer Excel: ${(err as Error).message}`); }
      };
      reader.readAsArrayBuffer(f);
    } else {
      reader.onload = ev => {
        try {
          applyParseResult(parseCSV(ev.target?.result as string));
        } catch (err) { setError(`Error al parsear: ${(err as Error).message}`); }
      };
      reader.readAsText(f);
    }
    e.target.value = '';
  }

  async function handleSave() {
    if (!preview) return;
    setSaving(true);
    try { await Promise.resolve(onSave(section.sectionKey, preview)); setPreview(null); }
    finally { setSaving(false); }
  }

  return (
    <div className="py-4 border-b border-gray-100">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            {section.label}{section.isRequired && <span className="text-red-500 ml-0.5">*</span>}
          </p>
          {section.description && <p className="text-[11px] text-gray-400 mt-0.5">{section.description}</p>}
        </div>
        {!readonly && (
          <div className="flex items-center gap-2">
            {preview && (
              <button onClick={() => setPreview(null)}
                className="text-[11px] text-gray-500 hover:text-gray-700 px-2 py-1 rounded border border-gray-200 hover:border-gray-300 transition-colors">
                Cancelar
              </button>
            )}
            <input ref={fileRef} type="file" accept=".csv,.txt,.tsv,.xlsx,.xls,.ods" className="hidden" onChange={onFileChange} />
            <button onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors">
              <FileSpreadsheet className="w-3.5 h-3.5" />
              {hasSaved ? 'Reimportar' : 'Importar Excel/CSV'}
            </button>
          </div>
        )}
      </div>

      {/* CSV hint */}
      {!hasSaved && !preview && (
        <p className="text-[11px] text-gray-400 mb-3">
          Importe el balance de comprobación en formato <strong>Excel (.xlsx)</strong> o CSV.
          Columnas esperadas: <span className="font-mono bg-gray-100 px-1 rounded">Cuenta, Descripcion, Saldo_Actual[, Saldo_Anterior, Saldo_Anterior_2]</span>
        </p>
      )}

      {/* Parse error */}
      {parseError && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3 text-xs text-red-700">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />{parseError}
        </div>
      )}

      {/* Skipped rows report */}
      {skipped.length > 0 && !parseError && (
        <details className="mb-3 bg-amber-50 border border-amber-200 rounded-lg text-xs">
          <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer text-amber-700 font-medium select-none">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {skipped.length} fila{skipped.length > 1 ? 's' : ''} omitida{skipped.length > 1 ? 's' : ''} por no ser código de cuenta válido — haga clic para ver detalle
          </summary>
          <div className="border-t border-amber-200 overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-amber-100 text-amber-800">
                  <th className="px-3 py-1.5 text-left font-semibold w-16">Fila</th>
                  <th className="px-3 py-1.5 text-left font-semibold">Valor en columna Cuenta</th>
                  <th className="px-3 py-1.5 text-left font-semibold">Motivo del rechazo</th>
                </tr>
              </thead>
              <tbody>
                {skipped.map((s, i) => (
                  <tr key={i} className="border-t border-amber-100">
                    <td className="px-3 py-1 font-mono text-amber-700">{s.lineNum}</td>
                    <td className="px-3 py-1 font-mono text-gray-700 max-w-[300px] truncate">{s.rawCuenta || '(vacío)'}</td>
                    <td className="px-3 py-1 text-amber-700">{s.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {/* Preview banner */}
      {preview && (
        <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
          <p className="text-xs text-amber-700 font-medium">
            {preview.length} cuentas importadas — previsualización (no guardada aún)
          </p>
          {!readonly && (
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {saving ? 'Guardando…' : 'Confirmar Balance'}
            </button>
          )}
        </div>
      )}

      {/* Empty state */}
      {rows.length === 0 && (
        <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-xl">
          <Table2 className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">Sin datos de balance de comprobación</p>
        </div>
      )}

      {/* Table */}
      {rows.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-600">
                  <th className="px-3 py-2 text-left font-semibold">Cuenta</th>
                  <th className="px-3 py-2 text-left font-semibold">Descripción</th>
                  <th className="px-3 py-2 text-right font-semibold">Saldo Actual</th>
                  <th className="px-3 py-2 text-right font-semibold">Año Ant.</th>
                  <th className="px-3 py-2 text-right font-semibold">Ant. −2</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-3 py-1.5 font-mono text-gray-700">{r.cuenta}</td>
                    <td className="px-3 py-1.5 text-gray-700">{r.descripcion}</td>
                    <td className={`px-3 py-1.5 text-right font-mono ${r.saldo_actual < 0 ? 'text-red-600' : 'text-gray-700'}`}>
                      {fmtN(r.saldo_actual)}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-gray-500">
                      {r.saldo_anterior ? fmtN(r.saldo_anterior) : '—'}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-gray-400">
                      {r.saldo_anterior2 ? fmtN(r.saldo_anterior2) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-300 bg-gray-50">
                  <td colSpan={2} className="px-3 py-2 text-xs font-bold text-gray-600">
                    TOTAL — {rows.length} cuentas
                  </td>
                  <td className={`px-3 py-2 text-right font-mono text-xs font-bold ${isCuadrado ? 'text-emerald-700' : 'text-red-600'}`}>
                    {fmtN(netActual)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-gray-500">
                    {netAnterior ? fmtN(netAnterior) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-gray-400">
                    {netAnt2 ? fmtN(netAnt2) : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <p className={`text-[11px] mt-2 ${isCuadrado ? 'text-emerald-600' : 'text-amber-600'}`}>
            {isCuadrado
              ? '✓ Cuadre verificado — suma neta = 0 (activos = pasivos + patrimonio)'
              : `⚠ Diferencia neta: ${fmtN(netActual)} — verificar cuadre activos = pasivos + patrimonio`
            }
          </p>
        </>
      )}
    </div>
  );
}

// ── Types: semáforo ──────────────────────────────────────────────────────────

export interface SemaforoRow {
  cuenta:       string;
  descripcion:  string;
  saldo_actual: number;
  pct_total:    number;
  sub_sumaria:  string;
  semaforo:     'ROJO' | 'AMARILLO' | 'VERDE';
  enfoque:      string;
}

// ── AccountClassifier — sección S2 ───────────────────────────────────────────

export function AccountClassifier({
  s1Section,
  s2Section,
  readonly,
  onSave,
  onPropagate,
}: {
  s1Section:   PaperSection;
  s2Section:   PaperSection;
  readonly:    boolean;
  onSave:      (key: string, value: unknown) => void | Promise<void>;
  onPropagate?: () => Promise<{ message: string }>;
}) {
  const s1Rows    = safeParseArray<TrialBalanceRow>(s1Section.value);
  const savedMaps = safeParseArray<AccountMappingRow>(s2Section.value);
  const hasS1     = s1Rows.length > 0;

  // Init from saved S2 if available, otherwise auto-generate from S1
  const [mappings, setMappings] = useState<AccountMappingRow[]>(() => {
    if (savedMaps.length > 0) return savedMaps;
    return s1Rows.map(r => {
      const { sub, grupo } = autoMap(r.cuenta);
      return { ...r, sub_sumaria: sub, grupo };
    });
  });
  const [saving,      setSaving]      = useState(false);
  // If S2 was empty on mount, `mappings` above was auto-generated from S1 — that's
  // real unsaved data, so Guardar must start enabled or the auditor can never save
  // it (and Propagar would then fail server-side with "S2 está vacío").
  const [dirty,       setDirty]       = useState(() => savedMaps.length === 0 && s1Rows.length > 0);
  const [propagating, setPropagating] = useState(false);
  const [propagateMsg, setPropagateMsg] = useState('');

  const unassigned = mappings.filter(m => m.sub_sumaria === 'SIN_ASIGNAR').length;

  // Re-merge from S1 preserving manual overrides
  function syncFromBalance() {
    setMappings(prev =>
      s1Rows.map(r => {
        const existing = prev.find(m => m.cuenta === r.cuenta);
        const { sub, grupo } = autoMap(r.cuenta);
        return { ...r, sub_sumaria: existing?.sub_sumaria ?? sub, grupo: existing?.grupo ?? grupo };
      })
    );
    setDirty(true);
  }

  function autoFillAll() {
    setMappings(prev => prev.map(m => {
      const { sub, grupo } = autoMap(m.cuenta);
      return { ...m, sub_sumaria: sub, grupo };
    }));
    setDirty(true);
  }

  function setSubSumaria(idx: number, sub: string) {
    setMappings(prev => prev.map((m, i) => {
      if (i !== idx) return m;
      const range = SV_RANGES.find(r => r.sub === sub);
      return { ...m, sub_sumaria: sub, grupo: range?.grupo ?? m.grupo };
    }));
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await Promise.resolve(onSave(s2Section.sectionKey, mappings));

      // Auto-fill S3 (cuadre booleano) — solo si hay datos en S1
      if (s1Rows.length > 0) {
        const netActual = s1Rows.reduce((s, r) => s + r.saldo_actual, 0);
        await Promise.resolve(onSave('S3', Math.abs(netActual) < 1));
      }

      // Auto-fill S4 (totales por sub-sumaria)
      const totals: Record<string, { sub_sumaria: string; grupo: string; saldo_actual: number; saldo_anterior: number; n_cuentas: number }> = {};
      for (const m of mappings) {
        if (!totals[m.sub_sumaria]) {
          totals[m.sub_sumaria] = { sub_sumaria: m.sub_sumaria, grupo: m.grupo, saldo_actual: 0, saldo_anterior: 0, n_cuentas: 0 };
        }
        totals[m.sub_sumaria].saldo_actual   += m.saldo_actual;
        totals[m.sub_sumaria].saldo_anterior += m.saldo_anterior;
        totals[m.sub_sumaria].n_cuentas++;
      }
      await Promise.resolve(onSave('S4', Object.values(totals).sort((a, b) => a.sub_sumaria.localeCompare(b.sub_sumaria))));

      setDirty(false);
    } finally {
      setSaving(false);
    }
  }

  async function handlePropagate() {
    if (!onPropagate) return;
    setPropagating(true);
    setPropagateMsg('');
    try {
      const res = await onPropagate();
      setPropagateMsg(res.message);
    } catch (err) {
      setPropagateMsg(`Error: ${(err as Error).message}`);
    } finally {
      setPropagating(false);
    }
  }

  // Group totals for mini-cards
  const grouped = mappings.reduce((acc, m) => {
    acc[m.sub_sumaria] = (acc[m.sub_sumaria] ?? 0) + m.saldo_actual;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="py-4 border-b border-gray-100">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            {s2Section.label}{s2Section.isRequired && <span className="text-red-500 ml-0.5">*</span>}
          </p>
          {s2Section.description && <p className="text-[11px] text-gray-400 mt-0.5">{s2Section.description}</p>}
        </div>
        {!readonly && hasS1 && (
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button onClick={syncFromBalance}
              className="flex items-center gap-1 text-[11px] text-gray-600 px-2.5 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              <RefreshCw className="w-3 h-3" /> Sync desde balance
            </button>
            <button onClick={autoFillAll}
              className="flex items-center gap-1 text-[11px] text-blue-700 bg-blue-50 px-2.5 py-1.5 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors">
              <Tag className="w-3 h-3" /> Auto-asignar rangos SV
            </button>
            <button onClick={handleSave} disabled={saving || !dirty}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {saving ? 'Guardando…' : 'Guardar Clasificación'}
            </button>
            {onPropagate && !dirty && (
              <button onClick={handlePropagate} disabled={propagating}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                title="Enviar totales por sub-sumaria a B-01..B-06">
                <RefreshCw className={`w-3.5 h-3.5 ${propagating ? 'animate-spin' : ''}`} />
                {propagating ? 'Propagando…' : 'Propagar a Cédulas'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Propagation feedback */}
      {propagateMsg && (
        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 mb-3 text-xs ${
          propagateMsg.startsWith('Error')
            ? 'bg-red-50 border border-red-200 text-red-700'
            : 'bg-indigo-50 border border-indigo-200 text-indigo-700'
        }`}>
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          {propagateMsg}
        </div>
      )}

      {/* No S1 data */}
      {!hasS1 && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          Importe el balance de comprobación en S1 primero — el clasificador se generará automáticamente desde ahí.
        </div>
      )}

      {/* Unassigned warning */}
      {hasS1 && unassigned > 0 && (
        <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 mb-3 text-xs text-orange-700">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {unassigned} cuenta{unassigned > 1 ? 's' : ''} sin sub-sumaria asignada — use &ldquo;Auto-asignar&rdquo; o asigne manualmente.
        </div>
      )}

      {hasS1 && (
        <>
          {/* Classifier table */}
          <div className="overflow-x-auto rounded-xl border border-gray-200 mb-4">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-600">
                  <th className="px-3 py-2 text-left font-semibold">Cuenta</th>
                  <th className="px-3 py-2 text-left font-semibold">Descripción</th>
                  <th className="px-3 py-2 text-right font-semibold">Saldo Actual</th>
                  <th className="px-3 py-2 text-left font-semibold min-w-[210px]">Sub-Sumaria</th>
                  <th className="px-3 py-2 text-left font-semibold">Grupo</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((m, i) => (
                  <tr
                    key={i}
                    className={`border-b border-gray-100 last:border-0 ${
                      m.sub_sumaria === 'SIN_ASIGNAR' ? 'bg-orange-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <td className="px-3 py-1.5 font-mono text-gray-700">{m.cuenta}</td>
                    <td className="px-3 py-1.5 text-gray-700">{m.descripcion}</td>
                    <td className={`px-3 py-1.5 text-right font-mono ${m.saldo_actual < 0 ? 'text-red-600' : 'text-gray-700'}`}>
                      {fmtN(m.saldo_actual)}
                    </td>
                    <td className="px-3 py-1.5">
                      {readonly ? (
                        <span className="text-gray-700">{m.sub_sumaria}</span>
                      ) : (
                        <select
                          value={m.sub_sumaria}
                          onChange={e => setSubSumaria(i, e.target.value)}
                          className={`w-full text-xs border rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                            m.sub_sumaria === 'SIN_ASIGNAR'
                              ? 'border-orange-300 bg-orange-50 text-orange-700'
                              : 'border-gray-200 bg-white text-gray-700'
                          }`}
                        >
                          {SUB_SUMARIA_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">{m.grupo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals by sub-sumaria — mini cards */}
          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Totales por Sub-Sumaria (se propagan a S4 al guardar)
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
              {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([sub, total]) => (
                <div
                  key={sub}
                  className={`rounded-lg px-3 py-2 border ${
                    sub === 'SIN_ASIGNAR'
                      ? 'border-orange-200 bg-orange-50'
                      : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <p className="text-[10px] font-bold text-gray-500">{sub}</p>
                  <p className={`text-xs font-mono font-semibold mt-0.5 ${total < 0 ? 'text-red-600' : 'text-gray-700'}`}>
                    {fmtN(total)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── AccountSemaforo — sección S6 ─────────────────────────────────────────────

const SEMAFORO_ORDER: Record<string, number> = { ROJO: 0, AMARILLO: 1, VERDE: 2 };

function semaforoEmoji(s: SemaforoRow['semaforo']) {
  return s === 'ROJO' ? '🔴' : s === 'AMARILLO' ? '🟡' : '🟢';
}

function semaforoLabel(s: SemaforoRow['semaforo']) {
  return s === 'ROJO' ? 'Alto — >MG' : s === 'AMARILLO' ? 'Moderado — ME..MG' : 'Bajo — <ME';
}

function semaforoBadge(s: SemaforoRow['semaforo']) {
  const base = 'text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap';
  if (s === 'ROJO')     return `${base} bg-red-100 text-red-700`;
  if (s === 'AMARILLO') return `${base} bg-amber-100 text-amber-700`;
  return `${base} bg-emerald-100 text-emerald-700`;
}

export function AccountSemaforo({
  s1Section,
  s2Section,
  s6Section,
  auditId,
  readonly,
  onSave,
}: {
  s1Section:  PaperSection;
  s2Section:  PaperSection | undefined;
  s6Section:  PaperSection;
  auditId:    string;
  readonly:   boolean;
  onSave:     (key: string, value: unknown) => void | Promise<void>;
}) {
  const { data: mat, isLoading: matLoading } = useMaterialidadByAudit(auditId);
  const [preview, setPreview] = useState<SemaforoRow[] | null>(null);
  const [saving,  setSaving]  = useState(false);

  const s1Rows   = safeParseArray<TrialBalanceRow>(s1Section.value);
  const s2Rows   = safeParseArray<AccountMappingRow>(s2Section?.value);
  const saved    = safeParseArray<SemaforoRow>(s6Section.value);
  const display  = preview ?? saved;

  const totalAbs = s1Rows.reduce((sum, r) => sum + Math.abs(r.saldo_actual), 0);

  const mg  = mat?.mg  ?? null;
  const me  = mat?.me  ?? null;

  function computeSemaforo() {
    const rows: SemaforoRow[] = s1Rows.map(r => {
      const abs      = Math.abs(r.saldo_actual);
      const s2match  = s2Rows.find(m => m.cuenta === r.cuenta);
      const sub      = s2match?.sub_sumaria ?? 'SIN_ASIGNAR';
      const pct      = totalAbs > 0 ? (abs / totalAbs) * 100 : 0;

      let semaforo: SemaforoRow['semaforo'];
      let enfoque: string;

      if (mg !== null && abs > mg) {
        semaforo = 'ROJO';
        enfoque  = 'Pruebas sustantivas extensas (100% o muestra representativa)';
      } else if (me !== null && abs >= me) {
        semaforo = 'AMARILLO';
        enfoque  = 'Analíticas + pruebas sustantivas focalizadas';
      } else {
        semaforo = 'VERDE';
        enfoque  = 'Procedimientos analíticos suficientes';
      }

      return { cuenta: r.cuenta, descripcion: r.descripcion, saldo_actual: r.saldo_actual, pct_total: pct, sub_sumaria: sub, semaforo, enfoque };
    });

    rows.sort((a, b) => {
      const d = SEMAFORO_ORDER[a.semaforo] - SEMAFORO_ORDER[b.semaforo];
      return d !== 0 ? d : Math.abs(b.saldo_actual) - Math.abs(a.saldo_actual);
    });

    setPreview(rows);
  }

  async function handleSave() {
    if (!preview) return;
    setSaving(true);
    try {
      await Promise.resolve(onSave('S6', preview));
      setPreview(null);
    } finally {
      setSaving(false);
    }
  }

  const rojos    = display.filter(r => r.semaforo === 'ROJO').length;
  const amarillos = display.filter(r => r.semaforo === 'AMARILLO').length;
  const verdes   = display.filter(r => r.semaforo === 'VERDE').length;

  const noBalance      = s1Rows.length === 0;
  const noMaterialidad = !matLoading && (mg === null || me === null);

  return (
    <div className="py-4 border-b border-gray-100">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            {s6Section.label}
            {s6Section.isRequired && <span className="text-red-500 ml-0.5">*</span>}
          </p>
          {s6Section.description && (
            <p className="text-[11px] text-gray-400 mt-0.5">{s6Section.description}</p>
          )}
        </div>
        {!readonly && !noBalance && !noMaterialidad && (
          <div className="flex items-center gap-2">
            <button
              onClick={computeSemaforo}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Calcular semáforo
            </button>
            {preview && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {saving ? 'Guardando…' : 'Guardar S6'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* MG/ME chip strip */}
      {mat && (mg !== null || me !== null) && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Desde A-06 PT-A4:</span>
          {mg !== null && (
            <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-700">
              MG {fmtN(mg)}
            </span>
          )}
          {me !== null && (
            <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700">
              ME {fmtN(me)}
            </span>
          )}
          {mat.uae !== null && (
            <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">
              UAE {fmtN(mat.uae)}
            </span>
          )}
        </div>
      )}

      {/* Warnings */}
      {matLoading && (
        <div className="flex items-center gap-2 text-xs text-blue-600 mb-3">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando materialidad…
        </div>
      )}
      {noBalance && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700 mb-3">
          <AlertCircle className="w-4 h-4 shrink-0" />
          Importe el balance de comprobación en S1 primero.
        </div>
      )}
      {!noBalance && noMaterialidad && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700 mb-3">
          <AlertCircle className="w-4 h-4 shrink-0" />
          Complete el papel <strong>A-06 PT-A4 — Materialidad</strong> (MG y ME) antes de calcular el semáforo.
        </div>
      )}

      {/* Preview banner */}
      {preview && (
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mb-3 text-xs text-blue-700">
          <BarChart3 className="w-3.5 h-3.5 shrink-0" />
          Vista previa calculada — {preview.length} cuentas. Presione &quot;Guardar S6&quot; para confirmar.
        </div>
      )}

      {/* Summary chips */}
      {display.length > 0 && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Resumen:</span>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-700">
            🔴 {rojos} cuenta{rojos !== 1 ? 's' : ''} &gt; MG
          </span>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700">
            🟡 {amarillos} ME–MG
          </span>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">
            🟢 {verdes} &lt; ME
          </span>
        </div>
      )}

      {/* Semaphore table */}
      {display.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-600">
                <th className="px-3 py-2 text-center font-semibold w-14">Riesgo</th>
                <th className="px-3 py-2 text-left font-semibold">Cuenta</th>
                <th className="px-3 py-2 text-left font-semibold">Descripción</th>
                <th className="px-3 py-2 text-right font-semibold">Saldo Actual</th>
                <th className="px-3 py-2 text-right font-semibold">% Total</th>
                <th className="px-3 py-2 text-left font-semibold">Sub-Sumaria</th>
                <th className="px-3 py-2 text-left font-semibold">Enfoque</th>
              </tr>
            </thead>
            <tbody>
              {display.map((row, i) => (
                <tr key={i} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-3 py-1.5 text-center">
                    <span className={semaforoBadge(row.semaforo)}>
                      {semaforoEmoji(row.semaforo)} {semaforoLabel(row.semaforo)}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 font-mono text-gray-700">{row.cuenta}</td>
                  <td className="px-3 py-1.5 text-gray-700">{row.descripcion}</td>
                  <td className={`px-3 py-1.5 text-right font-mono ${(row.saldo_actual ?? 0) < 0 ? 'text-red-600' : 'text-gray-700'}`}>
                    {fmtN(row.saldo_actual ?? 0)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-gray-500">
                    {(row.pct_total ?? 0).toFixed(1)}%
                  </td>
                  <td className="px-3 py-1.5 font-mono text-gray-600">{row.sub_sumaria}</td>
                  <td className="px-3 py-1.5 text-gray-500 text-[11px]">{row.enfoque}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
