'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import {
  Plus, Trash2, X, Sparkles, Loader2, Check, ArrowUp, ArrowDown, ArrowUpDown,
  Paperclip, FileText, CircleSlash, AlertTriangle, AlertOctagon,
} from 'lucide-react';
import { useAssistSection, useAttachToAccountSchedule, useRemoveAccountScheduleAttachment } from '@/hooks/useWorkingPaperGraph';

// ─── Types ────────────────────────────────────────────────────────────────────

type MatrixRow = Record<string, string>;

interface RowAttachment {
  id: string; filename: string; url: string; mimeType: string; size: number; uploadedAt: string;
}

interface Props {
  value:       unknown;
  onChange:    (rows: MatrixRow[]) => void;
  paperId?:    string;
  sectionKey:  string;
  aiHint?:     string;
  readOnly?:   boolean;
  // When set, this section starts with (and keeps) one row per row of the named
  // sibling MATRIX section, matched/copied by these column names.
  linkedFrom?:  { sectionKey: string; keyColumns: string[] };
  sourceValue?: unknown;
  // Opt-in per-row auditor tooling (severity dot, note, evidence attachments).
  // Internal state lives in row keys prefixed "_" (id, nota, attachments) which
  // are never treated as data columns — kept off by default so the other ~45
  // papers reusing this grid are unaffected.
  enableRowExtras?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseValue(value: unknown): MatrixRow[] {
  try {
    const parsed: unknown = Array.isArray(value) ? value : JSON.parse(String(value ?? '[]'));
    if (!Array.isArray(parsed)) return [];
    return (parsed as Record<string, unknown>[])
      .filter(r => r && typeof r === 'object')
      .map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v == null ? '' : String(v)])));
  } catch {
    return [];
  }
}

function deriveColumns(rows: MatrixRow[]): string[] {
  const seen = new Set<string>();
  const cols: string[] = [];
  for (const row of rows) {
    for (const k of Object.keys(row)) {
      if (k.startsWith('_')) continue; // internal row-extras keys (id/nota/attachments), never a data column
      if (!seen.has(k)) { seen.add(k); cols.push(k); }
    }
  }
  return cols;
}

function genRowId(): string {
  return `mx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Assigns a stable "_id" to any row that doesn't already have one — needed to key per-row note/evidence. */
function withRowIds(rows: MatrixRow[]): MatrixRow[] {
  return rows.map(r => (r['_id'] ? r : { ...r, _id: genRowId() }));
}

function parseAttachments(raw?: string): RowAttachment[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RowAttachment[]) : [];
  } catch {
    return [];
  }
}

function formatBytes(n?: number): string {
  if (!n || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// ─── Severity (semáforo) ──────────────────────────────────────────────────────
// Auto-computed (not manually set) from the widest variance found in the row's
// own "%"/"variación" columns — same spirit as the materiality semáforo used
// elsewhere (AccountSemaforo), applied here to analytical-review results.

type Severity = 'high' | 'medium' | 'low' | null;

// Only headers that literally name a "variación" count — a bare "%" isn't enough,
// since composition columns like "% Año Actual" (S2) are a share-of-total, not a
// change, and would falsely read as high-severity at typical composition sizes.
function isVarianceHeader(col: string): boolean {
  const n = col.toLowerCase();
  return n.includes('variac') && !n.includes('$');
}

function computeRowSeverity(row: MatrixRow, columns: string[]): Severity {
  let maxAbs = -1;
  let usesPp = false; // percentage-point variance (vertical analysis) uses a tighter threshold than a %-change
  for (const col of columns) {
    if (!isVarianceHeader(col)) continue;
    const raw = row[col];
    if (!raw) continue;
    const n = parseFloat(raw.replace(/[^\d.-]/g, ''));
    if (!Number.isFinite(n)) continue;
    if (col.toLowerCase().includes('pp')) usesPp = true;
    maxAbs = Math.max(maxAbs, Math.abs(n));
  }
  if (maxAbs < 0) return null;
  const [hi, med] = usesPp ? [5, 3] : [20, 10];
  if (maxAbs >= hi) return 'high';
  if (maxAbs >= med) return 'medium';
  return 'low';
}

const SEVERITY_STYLE: Record<'high' | 'medium' | 'low', { dot: string; label: string }> = {
  high:   { dot: 'bg-red-500 ring-red-200',       label: 'Variación significativa (≥20%) — requiere atención' },
  medium: { dot: 'bg-amber-400 ring-amber-200',   label: 'Variación moderada (10%–20%) — revisar' },
  low:    { dot: 'bg-emerald-500 ring-emerald-200', label: 'Variación dentro de lo esperado (<10%)' },
};

function SeverityDot({ severity }: { severity: Severity }) {
  if (!severity) return <span className="text-gray-300 text-xs">—</span>;
  const s = SEVERITY_STYLE[severity];
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ring-4 ${s.dot}`} title={s.label} />;
}

// ─── Alert-type icon ────────────────────────────────────────────────────────
// A handful of MATRIX sections classify each row with a short "tipo de alerta"
// value (e.g. B-00's Detalle de Alertas: CUENTA_NUEVA / SALDO_CERO /
// VARIACION_CRITICA / DESCUADRE, written either as the raw enum token or the
// human label). Detected by content, not column name, so it applies wherever
// this pattern shows up — not just B-00 — and only for a short, enum-like cell
// value (never inside a narrative sentence that happens to mention "descuadre").

interface AlertKind { icon: typeof Sparkles; label: string; cls: string }

const ALERT_KIND_PATTERNS: Array<{ re: RegExp; kind: AlertKind }> = [
  { re: /^cuenta[_\s-]*nueva$/,        kind: { icon: Sparkles,       label: 'Cuenta nueva',      cls: 'text-blue-600' } },
  { re: /^saldo[_\s-]*cero$/,          kind: { icon: CircleSlash,    label: 'Saldo cero',        cls: 'text-gray-500' } },
  { re: /^variaci[o]n[_\s-]*critica$/, kind: { icon: AlertTriangle,  label: 'Variación crítica', cls: 'text-red-600' } },
  { re: /^descuadre$/,                 kind: { icon: AlertOctagon,   label: 'Descuadre',         cls: 'text-orange-600' } },
];

function matchAlertKind(raw: string): AlertKind | null {
  const v = raw.trim();
  if (!v || v.length > 40) return null;
  const stripAccents = (s: string) => s.replace(/[̀-ͯ]/g, '');
  const norm = stripAccents(v.toLowerCase().normalize('NFD'));
  for (const { re, kind } of ALERT_KIND_PATTERNS) {
    if (re.test(norm)) return kind;
  }
  return null;
}

/**
 * Finds the sentence-ending period starting at `from` within `text` — i.e. a "."
 * followed by " <Uppercase>" whose preceding word is long enough to not be an
 * abbreviation ("vs.", "ej.", "Ref." are followed by a capitalized continuation
 * of the SAME clause, not a new sentence). Returns text.length if none is found.
 */
function findSentenceEnd(text: string, from: number): number {
  let depth = 0;
  for (let i = from; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (ch === '.' && depth === 0) {
      const nextOk = /^\s+\p{Lu}/u.test(text.slice(i + 1));
      const wordBefore = /(\p{L}+)$/u.exec(text.slice(from, i));
      const prevOk = !wordBefore || wordBefore[1].length >= 4;
      if (nextOk && prevOk) return i;
    }
  }
  return text.length;
}

/**
 * Most MATRIX aiHints spell out their columns as "Columnas: A | B | C. <more prose>".
 * Extract that pipe-separated list (73% of MATRIX sections follow this convention)
 * so the grid starts pre-populated with the intended structure instead of a blank
 * generic column.
 */
function parseSimpleColumns(aiHint: string): string[] {
  const marker = /columnas\s*:/i.exec(aiHint);
  if (!marker) return [];
  const start = marker.index + marker[0].length;
  const end = findSentenceEnd(aiHint, start);
  return aiHint.slice(start, end).split('|').map(s => s.trim()).filter(Boolean);
}

/**
 * A few complex MATRIX aiHints group columns as "GRUPO A — LABEL: A | B | C.
 * GRUPO B — LABEL: D | E." (e.g. PT-APE04 S3's 6-group tracking matrix). Flatten
 * every group's fields into one column list, in order.
 */
function parseGroupedColumns(aiHint: string): string[] {
  const headerRe = /GRUPO\s+[A-ZÁÉÍÓÚÑ]+\s*[—-]\s*[^:]+:/gu;
  const markers: Array<{ start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = headerRe.exec(aiHint))) {
    markers.push({ start: m.index, end: m.index + m[0].length });
  }
  if (markers.length === 0) return [];

  const cols: string[] = [];
  for (let g = 0; g < markers.length; g++) {
    const fieldStart = markers[g].end;
    const fieldEnd = g + 1 < markers.length ? markers[g + 1].start : findSentenceEnd(aiHint, fieldStart);
    let chunk = aiHint.slice(fieldStart, fieldEnd).trim();
    if (chunk.endsWith('.')) chunk = chunk.slice(0, -1).trim();
    cols.push(...chunk.split('|').map(s => s.trim()).filter(Boolean));
  }
  return cols;
}

/** Full (un-shortened) suggested column phrases, trying each known aiHint convention in turn. */
function parseColumnsFromAiHint(aiHint?: string): string[] {
  if (!aiHint) return [];
  const simple = parseSimpleColumns(aiHint);
  if (simple.length > 0) return simple;
  return parseGroupedColumns(aiHint);
}

/** Short header label (text before the first parenthetical hint). */
function shortColumnLabel(col: string): string {
  const idx = col.indexOf('(');
  return idx > 0 ? col.slice(0, idx).trim() : col;
}

/**
 * A column named like "Respuesta (Sí/No/N-A)" or "Clasificación (Significativa/Material)"
 * carries a closed set of choices in its trailing parenthetical — render it as a dropdown
 * instead of free text. By convention the first option is the "positive"/best answer
 * (used by the group-tally badge below). Guards against matching prose parentheticals
 * (long descriptions) by requiring short, comma-free slash-separated tokens.
 */
function parseColumnOptions(col: string): string[] | null {
  const m = col.match(/\(([^)]+)\)\s*$/);
  if (!m) return null;
  const parts = m[1].split('/').map(s => s.trim()).filter(Boolean);
  if (parts.length < 2 || parts.length > 6) return null;
  if (!parts.every(p => p.length > 0 && p.length <= 14 && !/[.,;:]/.test(p))) return null;
  return parts;
}

function optionPillClasses(opt: string): string {
  const n = opt.toLowerCase();
  if (/^s(í|i)/.test(n)) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (/^no/.test(n)) return 'bg-red-50 text-red-700 border-red-200';
  if (/^n\/?a/.test(n)) return 'bg-gray-50 text-gray-500 border-gray-200';
  return 'bg-blue-50 text-blue-700 border-blue-200';
}

function tallyBadgeClasses(pct: number | null): string {
  if (pct === null) return 'bg-gray-50 text-gray-400 border-gray-200';
  if (pct >= 75) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (pct >= 50) return 'bg-amber-50 text-amber-700 border-amber-200';
  if (pct >= 25) return 'bg-orange-50 text-orange-700 border-orange-200';
  return 'bg-red-50 text-red-700 border-red-200';
}

/** Disambiguate repeated short labels (e.g. across GRUPO sections) by appending " (2)", " (3)", ... */
function dedupeLabels(labels: string[]): string[] {
  const seen = new Map<string, number>();
  return labels.map(l => {
    const count = seen.get(l) ?? 0;
    seen.set(l, count + 1);
    return count === 0 ? l : `${l} (${count + 1})`;
  });
}

/** Numeric-aware compare: sorts "1,250.00" / "-3.5%" / "$420,000" as numbers when both sides look numeric. */
function compareValues(a: string, b: string): number {
  const na = parseFloat(a.replace(/[^\d.-]/g, ''));
  const nb = parseFloat(b.replace(/[^\d.-]/g, ''));
  if (Number.isFinite(na) && Number.isFinite(nb) && /\d/.test(a) && /\d/.test(b)) return na - nb;
  return a.localeCompare(b, 'es');
}

// ─── Column width — bounded auto-fit by content type ──────────────────────────
// MATRIX has no fixed schema (columns vary per section), so width is inferred from
// the header text itself: short-value columns (N°, fechas, montos, Sí/No, severidad)
// stay narrow; narrative columns (descripción, observaciones, salvaguarda…) get much
// more room. Bounded on both ends so a column never clips to ~4 letters nor balloons
// to fill the row — the table wraps in a horizontally-scrolling container either way.

interface ColWidth { min: number; max: number }

const NARROW_COL_HINTS = [
  'n°', 'no.', 'núm', 'numero', 'código', 'code', 'fecha', 'monto', 'saldo', 'valor',
  '%', 'pct', 'sí/no', 'si/no', 'sí / no', 'estado', 'severidad', 'nivel', 'prioridad',
  'aplica', 'cumple', 'acuse de recibo', 'año', 'moneda', 'cantidad', 'tipo', 'id',
];
const WIDE_COL_HINTS = [
  'descripci', 'observ', 'situaci', 'detalle', 'justificaci', 'narrativa', 'comentario',
  'salvaguarda', 'criterio', 'causa', 'efecto', 'condici', 'recomendaci', 'resultado',
  'evidencia', 'conclusi', 'nota', 'respuesta', 'acción', 'hallazgo', 'fundamento',
  'riesgo potencial', 'plan de acción',
];

function columnWidth(col: string): ColWidth {
  const n = col.toLowerCase();
  if (NARROW_COL_HINTS.some(k => n.includes(k))) return { min: 90, max: 160 };
  if (WIDE_COL_HINTS.some(k => n.includes(k))) return { min: 260, max: 440 };
  return { min: 160, max: 260 };
}

function colStyle(col: string): { minWidth: string; maxWidth: string } {
  const w = columnWidth(col);
  return { minWidth: `${w.min}px`, maxWidth: `${w.max}px` };
}

// ─── Celda de texto auto-ajustable ─────────────────────────────────────────────
// Crece en altura con el contenido (en vez de recortar a una sola línea) — el
// ancho ya viene acotado por colStyle(), así que esta es la otra mitad del
// "autoajuste al contenido": lo que no cabe a lo ancho, se ve completo a lo alto.

function AutoGrowCell({
  value, onChange, readOnly, placeholder, onFocus,
}: {
  value: string; onChange: (v: string) => void; readOnly?: boolean; placeholder?: string; onFocus?: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };
  useEffect(resize, [value]);

  if (readOnly) {
    return <span className="text-gray-700 whitespace-pre-wrap break-words">{value || '—'}</span>;
  }
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={e => onChange(e.target.value)}
      onInput={resize}
      onFocus={onFocus}
      rows={1}
      placeholder={placeholder}
      className="w-full text-xs text-gray-800 bg-transparent border-b border-transparent
        hover:border-gray-200 focus:border-blue-400 focus:outline-none py-0.5 resize-none
        overflow-hidden whitespace-pre-wrap break-words placeholder:text-gray-300 transition-colors"
    />
  );
}

// ─── Panel principal ──────────────────────────────────────────────────────────

/**
 * Generic editable table for the MATRIX field type. Columns are dynamic (derived
 * from the stored rows, or defined by the auditor from scratch) since MATRIX is
 * reused across ~45 papers with completely different column schemas — there is
 * no per-section fixed schema to render against.
 */
export function MatrixGridPanel({
  value, onChange, paperId, sectionKey, aiHint, linkedFrom, sourceValue, readOnly = false,
  enableRowExtras = false,
}: Props) {
  // aiHint-derived suggestion: short header labels + full phrase per label (for the tooltip)
  const suggestedFull  = parseColumnsFromAiHint(aiHint);
  // Columns whose parenthetical is a closed option list (e.g. "Respuesta (Sí/No/N-A)")
  // keep their full text as the header/key — it doubles as the dropdown's option source.
  const suggestedShort = dedupeLabels(suggestedFull.map(f => (parseColumnOptions(f) ? f : shortColumnLabel(f))));
  const suggestedTitleByLabel = Object.fromEntries(suggestedShort.map((s, i) => [s, suggestedFull[i]]));

  const initialRows = enableRowExtras ? withRowIds(parseValue(value)) : parseValue(value);
  const initialColumns = initialRows.length > 0 ? deriveColumns(initialRows) : suggestedShort;

  const [rows,       setRows]       = useState<MatrixRow[]>(initialRows);
  const [columns,    setColumns]    = useState<string[]>(initialColumns);
  const [editingCol, setEditingCol] = useState<string | null>(null);
  const [colDraft,   setColDraft]   = useState('');
  const [aiError,    setAiError]    = useState('');
  const [aiPreview,  setAiPreview]  = useState<MatrixRow[] | null>(null);
  const [aiUsedReal, setAiUsedReal] = useState(true);
  const [usingSuggested, setUsingSuggested] = useState(initialRows.length === 0 && suggestedShort.length > 0);
  // Display-only sort — never reorders the persisted rows, just the render order.
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDir,    setSortDir]    = useState<'asc' | 'desc'>('asc');
  // Row extras (severity/note/evidence) — only meaningful when enableRowExtras.
  const [uploadingRowId, setUploadingRowId] = useState<string | null>(null);
  const [rowErrors,      setRowErrors]      = useState<Record<string, string>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  // Excel-style crosshair: the row and column of the last-focused cell stay highlighted
  // (not cleared on blur) so the auditor keeps a visual anchor while scanning a wide grid.
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: string } | null>(null);

  function toggleSort(col: string) {
    if (sortColumn !== col) { setSortColumn(col); setSortDir('asc'); return; }
    if (sortDir === 'asc') { setSortDir('desc'); return; }
    setSortColumn(null);
  }

  const assist = useAssistSection();
  const attachMutation = useAttachToAccountSchedule();
  const removeAttachMutation = useRemoveAccountScheduleAttachment();

  // Re-sync local state when the incoming value changes (save confirmation, reload, etc.)
  const valueSignature = JSON.stringify(value ?? null);
  useEffect(() => {
    const parsed = enableRowExtras ? withRowIds(parseValue(value)) : parseValue(value);
    setRows(parsed);
    if (parsed.length > 0) {
      setColumns(deriveColumns(parsed));
      setUsingSuggested(false);
    } else if (suggestedShort.length > 0) {
      setColumns(suggestedShort);
      setUsingSuggested(true);
    } else {
      setColumns([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueSignature]);

  // Reconcile linked rows: ensure at least one row per row of the source section,
  // matched by keyColumns. Never removes or overwrites rows the auditor already has.
  const sourceSignature = linkedFrom ? JSON.stringify(sourceValue ?? null) : '';
  useEffect(() => {
    if (!linkedFrom) return;
    const src = parseValue(sourceValue);
    if (src.length === 0) return;
    const cols = columns.length > 0 ? columns : linkedFrom.keyColumns;
    const keyOf = (r: MatrixRow) => JSON.stringify(linkedFrom.keyColumns.map(k => r[k] ?? ''));
    const existingKeys = new Set(rows.map(keyOf));
    const additions = src
      .filter(sr => !existingKeys.has(keyOf(sr)))
      .map(sr => {
        const row: MatrixRow = {};
        for (const c of cols) row[c] = linkedFrom.keyColumns.includes(c) ? (sr[c] ?? '') : '';
        return row;
      });
    if (additions.length > 0) commit([...rows, ...additions], cols);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceSignature]);

  function commit(nextRows: MatrixRow[], nextColumns: string[]) {
    const padded = nextRows.map(r => {
      const out: MatrixRow = {};
      for (const c of nextColumns) out[c] = r[c] ?? '';
      if (enableRowExtras) {
        for (const k of Object.keys(r)) {
          if (k.startsWith('_')) out[k] = r[k];
        }
      }
      return out;
    });
    setRows(padded);
    setColumns(nextColumns);
    onChange(padded);
  }

  function addColumn() {
    setUsingSuggested(false);
    commit(rows, [...columns, `Columna ${columns.length + 1}`]);
  }

  function renameColumn(oldName: string, newName: string) {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) { setEditingCol(null); return; }
    setUsingSuggested(false);
    const nextColumns = columns.map(c => (c === oldName ? trimmed : c));
    const nextRows = rows.map(r => {
      const { [oldName]: val, ...rest } = r;
      return { ...rest, [trimmed]: val ?? '' };
    });
    commit(nextRows, nextColumns);
    setEditingCol(null);
  }

  function deleteColumn(name: string) {
    setUsingSuggested(false);
    const nextColumns = columns.filter(c => c !== name);
    const nextRows = rows.map(r => {
      const { [name]: _drop, ...rest } = r;
      return rest;
    });
    commit(nextRows, nextColumns);
  }

  function addRow() {
    const cols = columns.length > 0 ? columns : ['Campo 1'];
    const base: MatrixRow = Object.fromEntries(cols.map(c => [c, '']));
    commit([...rows, enableRowExtras ? { ...base, _id: genRowId() } : base], cols);
  }

  function updateCell(rowIdx: number, col: string, val: string) {
    commit(rows.map((r, i) => (i === rowIdx ? { ...r, [col]: val } : r)), columns);
  }

  function deleteRow(idx: number) {
    commit(rows.filter((_, i) => i !== idx), columns);
  }

  function updateRowNote(idx: number, note: string) {
    commit(rows.map((r, i) => (i === idx ? { ...r, _nota: note } : r)), columns);
  }

  async function handleAttach(idx: number, file: File) {
    if (!paperId) return;
    const row = rows[idx];
    const rowId = row['_id'];
    if (!rowId) return;
    if (file.size > 25 * 1024 * 1024) {
      setRowErrors(prev => ({ ...prev, [rowId]: 'El archivo supera el límite de 25MB.' }));
      return;
    }
    setUploadingRowId(rowId);
    setRowErrors(prev => ({ ...prev, [rowId]: '' }));
    try {
      const att = await attachMutation.mutateAsync({ paperId, rowId, file });
      const next = [...parseAttachments(row['_attachments']), att];
      commit(rows.map((r, i) => (i === idx ? { ...r, _attachments: JSON.stringify(next) } : r)), columns);
    } catch (e) {
      setRowErrors(prev => ({ ...prev, [rowId]: (e as Error).message || 'Error al subir el archivo' }));
    } finally {
      setUploadingRowId(null);
    }
  }

  async function handleRemoveAttachment(idx: number, attachmentId: string) {
    if (!paperId) return;
    const row = rows[idx];
    const rowId = row['_id'];
    if (!rowId) return;
    try {
      await removeAttachMutation.mutateAsync({ paperId, rowId, attachmentId });
      const next = parseAttachments(row['_attachments']).filter(a => a.id !== attachmentId);
      commit(rows.map((r, i) => (i === idx ? { ...r, _attachments: JSON.stringify(next) } : r)), columns);
    } catch (e) {
      setRowErrors(prev => ({ ...prev, [rowId]: (e as Error).message || 'Error al quitar el adjunto' }));
    }
  }

  async function generateWithAI() {
    if (!paperId) return;
    setAiError('');
    setAiPreview(null);
    try {
      const res = await assist.mutateAsync({ paperId, sectionKey });
      const parsed: unknown = JSON.parse(res.suggestion);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        setAiError(
          res.usedAI
            ? 'La IA no encontró suficiente información en el expediente para proponer filas. Agregue filas manualmente.'
            : 'Asistente IA no disponible. Agregue filas manualmente.',
        );
        return;
      }
      const cleanRows: MatrixRow[] = (parsed as Record<string, unknown>[]).map(r =>
        Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v == null ? '' : String(v)])),
      );
      setAiPreview(cleanRows);
      setAiUsedReal(res.usedAI);
    } catch (e) {
      setAiError((e as Error).message || 'Error al generar con IA');
    }
  }

  function applyAiPreview(mode: 'replace' | 'append') {
    if (!aiPreview) return;
    const preview = enableRowExtras ? withRowIds(aiPreview) : aiPreview;
    const previewCols = deriveColumns(preview);
    if (mode === 'replace') {
      commit(preview, previewCols);
    } else {
      commit([...rows, ...preview], Array.from(new Set([...columns, ...previewCols])));
    }
    setAiPreview(null);
  }

  const loadingAI = assist.isPending;

  return (
    <div className="mt-1">
      {!readOnly && (
        <div className="flex items-center gap-2 mb-2">
          {paperId && (
            <button
              type="button"
              onClick={generateWithAI}
              disabled={loadingAI}
              className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-lg
                bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100
                transition-colors disabled:opacity-50"
            >
              {loadingAI ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {loadingAI ? 'Generando…' : 'Generar con IA'}
            </button>
          )}
          <button
            type="button"
            onClick={addColumn}
            className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-lg
              text-gray-500 border border-dashed border-gray-300 hover:border-gray-400 hover:text-gray-700 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Columna
          </button>
          {usingSuggested && columns.length > 0 && (
            <span
              className="text-[10px] text-blue-600 bg-blue-50 border border-blue-200 px-2 py-1 rounded-full"
              title="Columnas propuestas según la especificación del papel — puede renombrarlas, quitarlas o agregar más"
            >
              Columnas sugeridas — editables
            </span>
          )}
          {linkedFrom && (
            <span
              className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full"
              title={`Se agrega automáticamente una fila por cada registro de ${linkedFrom.sectionKey} — puede editarlas, eliminarlas o agregar filas extra`}
            >
              Filas vinculadas a {linkedFrom.sectionKey}
            </span>
          )}
        </div>
      )}

      {aiError && (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mb-2">
          {aiError}
        </p>
      )}

      {aiPreview && (
        <div className="mb-3 border border-violet-200 bg-violet-50/60 rounded-xl p-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold text-violet-700 flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> Propuesta IA — {aiPreview.length} fila{aiPreview.length === 1 ? '' : 's'}
              {!aiUsedReal && (
                <span className="text-[10px] text-amber-600 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded-full ml-1">
                  Fallback
                </span>
              )}
            </span>
            <button onClick={() => setAiPreview(null)} className="p-0.5 rounded hover:bg-violet-100 text-violet-400">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="overflow-x-auto bg-white rounded-lg border border-violet-100 mb-2">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-violet-50/50">
                  {deriveColumns(aiPreview).map(c => (
                    <th key={c} className="px-2 py-1.5 text-left font-semibold text-violet-700 border-b border-violet-100">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {aiPreview.map((r, i) => (
                  <tr key={i} className="border-b border-gray-50 last:border-0">
                    {deriveColumns(aiPreview).map(c => (
                      <td key={c} className="px-2 py-1.5 text-gray-700">{r[c] || '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => applyAiPreview(rows.length > 0 ? 'append' : 'replace')}
              className="flex items-center gap-1 px-3 py-1.5 bg-violet-600 text-white text-[11px] font-semibold rounded-lg hover:bg-violet-700 transition-colors"
            >
              <Check className="w-3 h-3" /> {rows.length > 0 ? 'Agregar a la tabla' : 'Aplicar'}
            </button>
            {rows.length > 0 && (
              <button
                onClick={() => applyAiPreview('replace')}
                className="text-[11px] text-gray-500 hover:text-gray-700 px-2 py-1.5"
              >
                Reemplazar filas actuales
              </button>
            )}
            <button onClick={() => setAiPreview(null)} className="text-[11px] text-gray-400 hover:text-gray-600 px-2 py-1.5">
              Descartar
            </button>
          </div>
        </div>
      )}

      {columns.length === 0 ? (
        <div className="py-6 text-center border border-dashed border-gray-200 rounded-xl">
          <p className="text-xs text-gray-400 mb-3">
            Sin datos.{!readOnly && ' Agregue una fila o genere el contenido con IA.'}
          </p>
          {!readOnly && (
            <button
              onClick={addRow}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100
                text-blue-700 text-xs font-medium rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Agregar primera fila
            </button>
          )}
        </div>
      ) : (() => {
        // Group-tally banner: when the first column repeats across consecutive rows
        // (e.g. several preguntas under the same Principio) and some other column
        // carries a short Sí/No/N-A-style option list, show a compact "X/Y Sí" banner
        // above each group — reusable wherever a MATRIX nests sub-items under a parent
        // label. Disabled while a custom sort is active (grouping only holds in the
        // natural/stored row order).
        const groupCol = columns.length > 1 ? columns[0] : null;
        const tallyCol = groupCol
          ? columns.find(c => c !== groupCol && (parseColumnOptions(c)?.length ?? 0) >= 2 && (parseColumnOptions(c)?.length ?? 0) <= 3)
          : undefined;
        const positiveOption = tallyCol ? parseColumnOptions(tallyCol)?.[0] : undefined;
        const hasRepeatedGroups = groupCol ? rows.some((r, idx) => idx > 0 && r[groupCol] === rows[idx - 1][groupCol] && r[groupCol]) : false;
        const showGroups = !sortColumn && !!groupCol && !!tallyCol && !!positiveOption && hasRepeatedGroups;

        const groupStats = new Map<string, { positive: number; total: number }>();
        if (showGroups && groupCol && tallyCol && positiveOption) {
          for (const r of rows) {
            const key = r[groupCol] ?? '';
            const stat = groupStats.get(key) ?? { positive: 0, total: 0 };
            const answer = (r[tallyCol] ?? '').trim();
            if (answer) {
              stat.total += 1;
              if (answer.toLowerCase() === positiveOption.toLowerCase()) stat.positive += 1;
            }
            groupStats.set(key, stat);
          }
        }
        const totalColsForSpan = columns.length + (enableRowExtras ? 3 : 0) + (!readOnly ? 1 : 0);

        return (
        <div className="border border-gray-100 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="bg-gray-50">
                  {columns.map(col => (
                    <th
                      key={col}
                      style={colStyle(col)}
                      className={`px-3 py-2 text-left font-semibold border-b border-gray-200 group/col align-top transition-colors ${
                        selectedCell?.col === col ? 'bg-blue-100/70 text-blue-800' : 'text-gray-600'
                      }`}
                    >
                      {editingCol === col ? (
                        <input
                          autoFocus
                          value={colDraft}
                          onChange={e => setColDraft(e.target.value)}
                          onBlur={() => renameColumn(col, colDraft)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') renameColumn(col, colDraft);
                            if (e.key === 'Escape') setEditingCol(null);
                          }}
                          className="w-full text-xs border-b border-blue-300 focus:outline-none bg-white px-1 py-0.5"
                        />
                      ) : (
                        <div className="flex items-center gap-1">
                          <span
                            className={!readOnly ? 'cursor-text' : ''}
                            title={suggestedTitleByLabel[col]}
                            onClick={() => { if (readOnly) return; setEditingCol(col); setColDraft(col); }}
                          >
                            {col}
                          </span>
                          <button
                            onClick={() => toggleSort(col)}
                            className={`transition-all ${
                              sortColumn === col ? 'text-blue-600' : 'text-gray-300 opacity-0 group-hover/col:opacity-100 hover:text-gray-500'
                            }`}
                            title={
                              sortColumn === col
                                ? (sortDir === 'asc' ? 'Ordenado ascendente — clic para invertir' : 'Ordenado descendente — clic para quitar orden')
                                : 'Ordenar por esta columna'
                            }
                          >
                            {sortColumn === col
                              ? (sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)
                              : <ArrowUpDown className="w-3 h-3" />}
                          </button>
                          {!readOnly && (
                            <button
                              onClick={() => deleteColumn(col)}
                              className="opacity-0 group-hover/col:opacity-100 text-gray-300 hover:text-red-500 transition-all"
                              title="Eliminar columna"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </th>
                  ))}
                  {enableRowExtras && (
                    <th className="w-10 px-2 py-2 text-center font-semibold text-gray-500 border-b border-gray-200" title="Nivel de atención — calculado automáticamente según la magnitud de las variaciones de la fila">
                      Aten.
                    </th>
                  )}
                  {enableRowExtras && (
                    <th className="px-3 py-2 text-left font-semibold text-gray-600 border-b border-gray-200 min-w-[160px]">
                      Nota del auditor
                    </th>
                  )}
                  {enableRowExtras && (
                    <th className="px-3 py-2 text-left font-semibold text-gray-600 border-b border-gray-200 min-w-[140px]">
                      Evidencia
                    </th>
                  )}
                  {!readOnly && <th className="w-7" />}
                </tr>
              </thead>
              <tbody>
                {(sortColumn
                  ? rows
                      .map((row, i) => ({ row, i }))
                      .sort((a, b) => {
                        const cmp = compareValues(a.row[sortColumn] ?? '', b.row[sortColumn] ?? '');
                        return sortDir === 'asc' ? cmp : -cmp;
                      })
                  : rows.map((row, i) => ({ row, i }))
                ).map(({ row, i }) => {
                  const rowId = row['_id'] ?? '';
                  const rowError = rowErrors[rowId];
                  const isSelectedRow = selectedCell?.row === i;
                  const isGroupStart = showGroups && groupCol && (i === 0 || rows[i - 1][groupCol] !== row[groupCol]);
                  const stat = showGroups && groupCol ? groupStats.get(row[groupCol] ?? '') : undefined;
                  return (
                  <Fragment key={i}>
                  {isGroupStart && groupCol && (
                    <tr key={`grp-${i}`} className="bg-gray-50/80">
                      <td colSpan={totalColsForSpan} className="px-3 py-1.5 text-[11px] font-semibold text-gray-500 border-b border-gray-100">
                        <span className="mr-2">{row[groupCol] || '—'}</span>
                        {stat && stat.total > 0 && (
                          <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${tallyBadgeClasses((stat.positive / stat.total) * 100)}`}>
                            {stat.positive}/{stat.total} {positiveOption}
                          </span>
                        )}
                      </td>
                    </tr>
                  )}
                  <tr
                    key={i}
                    className={`group border-b border-gray-100 last:border-0 hover:bg-blue-50/20 transition-colors ${
                      isSelectedRow ? 'bg-blue-50/60' : i % 2 === 1 ? 'bg-gray-50/60' : ''
                    }`}
                  >
                    {columns.map(col => {
                      const isSelectedCol = selectedCell?.col === col;
                      const isSelectedCell = isSelectedRow && isSelectedCol;
                      const alertKind = matchAlertKind(row[col] ?? '');
                      const cellOptions = parseColumnOptions(col);
                      return (
                      <td
                        key={col}
                        style={colStyle(col)}
                        className={`px-3 py-2 align-top transition-colors ${
                          isSelectedCell
                            ? 'bg-blue-100/80 ring-1 ring-inset ring-blue-300'
                            : isSelectedCol ? 'bg-blue-50/50' : ''
                        }`}
                      >
                        {cellOptions ? (
                          readOnly ? (
                            row[col] ? (
                              <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${optionPillClasses(row[col])}`}>
                                {row[col]}
                              </span>
                            ) : <span className="text-gray-300 text-xs">—</span>
                          ) : (
                            <select
                              value={row[col] ?? ''}
                              onChange={e => updateCell(i, col, e.target.value)}
                              onFocus={() => setSelectedCell({ row: i, col })}
                              className="w-full text-xs text-gray-800 bg-transparent border-b border-transparent
                                hover:border-gray-200 focus:border-blue-400 focus:outline-none py-0.5"
                            >
                              <option value="">—</option>
                              {cellOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                          )
                        ) : (
                        <div className={alertKind ? 'flex items-start gap-1.5' : undefined}>
                          {alertKind && (
                            <span title={alertKind.label} className="shrink-0 mt-0.5">
                              <alertKind.icon className={`w-3.5 h-3.5 ${alertKind.cls}`} />
                            </span>
                          )}
                          <AutoGrowCell
                            value={row[col] ?? ''}
                            onChange={v => updateCell(i, col, v)}
                            readOnly={readOnly}
                            onFocus={() => setSelectedCell({ row: i, col })}
                          />
                        </div>
                        )}
                      </td>
                      );
                    })}
                    {enableRowExtras && (
                      <td className="px-2 py-2 align-top text-center">
                        <SeverityDot severity={computeRowSeverity(row, columns)} />
                      </td>
                    )}
                    {enableRowExtras && (
                      <td className="px-3 py-2 align-top min-w-[160px] max-w-[280px]">
                        <AutoGrowCell
                          value={row['_nota'] ?? ''}
                          onChange={v => updateRowNote(i, v)}
                          readOnly={readOnly}
                          placeholder="Apreciación del auditor…"
                        />
                      </td>
                    )}
                    {enableRowExtras && (
                      <td className="px-2 py-2 align-top">
                        <div className="flex flex-col gap-1">
                          {parseAttachments(row['_attachments']).map(att => (
                            <div key={att.id} className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-md px-1.5 py-1 max-w-[220px]">
                              <FileText className="w-3 h-3 text-gray-400 shrink-0" />
                              <a
                                href={att.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 min-w-0 truncate text-[10px] text-blue-600 hover:underline"
                                title={`${att.filename}${att.size ? ' · ' + formatBytes(att.size) : ''}`}
                              >
                                {att.filename}
                              </a>
                              {!readOnly && (
                                <button
                                  onClick={() => handleRemoveAttachment(i, att.id)}
                                  className="p-0.5 rounded hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors shrink-0"
                                  title="Quitar adjunto"
                                >
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              )}
                            </div>
                          ))}
                          {!readOnly && (
                            <>
                              <input
                                ref={el => { fileInputRefs.current[rowId] = el; }}
                                type="file"
                                className="hidden"
                                onChange={e => {
                                  const file = e.target.files?.[0];
                                  if (file) void handleAttach(i, file);
                                  e.target.value = '';
                                }}
                              />
                              <button
                                onClick={() => fileInputRefs.current[rowId]?.click()}
                                disabled={uploadingRowId === rowId}
                                className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-blue-600 border border-dashed border-gray-300 hover:border-blue-300 rounded-md px-1.5 py-1 transition-colors disabled:opacity-50"
                              >
                                {uploadingRowId === rowId ? <Loader2 className="w-3 h-3 animate-spin" /> : <Paperclip className="w-3 h-3" />}
                                {uploadingRowId === rowId ? 'Subiendo…' : 'Adjuntar'}
                              </button>
                              {rowError && <p className="text-[10px] text-red-600">{rowError}</p>}
                            </>
                          )}
                        </div>
                      </td>
                    )}
                    {!readOnly && (
                      <td className="px-2 py-2 align-top">
                        <button
                          onClick={() => deleteRow(i)}
                          className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all"
                          title="Eliminar fila"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                  </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!readOnly && (
            <div className="px-4 py-2.5 border-t border-gray-50 bg-gray-50/40">
              <button
                onClick={addRow}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-blue-600 transition-colors font-medium"
              >
                <Plus className="w-3.5 h-3.5" /> Agregar fila
              </button>
            </div>
          )}
        </div>
        );
      })()}
    </div>
  );
}
