'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, X, Sparkles, Loader2, Check } from 'lucide-react';
import { useAssistSection } from '@/hooks/useWorkingPaperGraph';

// ─── Types ────────────────────────────────────────────────────────────────────

type MatrixRow = Record<string, string>;

interface Props {
  value:      unknown;
  onChange:   (rows: MatrixRow[]) => void;
  paperId?:   string;
  sectionKey: string;
  aiHint?:    string;
  readOnly?:  boolean;
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
      if (!seen.has(k)) { seen.add(k); cols.push(k); }
    }
  }
  return cols;
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

/** Disambiguate repeated short labels (e.g. across GRUPO sections) by appending " (2)", " (3)", ... */
function dedupeLabels(labels: string[]): string[] {
  const seen = new Map<string, number>();
  return labels.map(l => {
    const count = seen.get(l) ?? 0;
    seen.set(l, count + 1);
    return count === 0 ? l : `${l} (${count + 1})`;
  });
}

// ─── Panel principal ──────────────────────────────────────────────────────────

/**
 * Generic editable table for the MATRIX field type. Columns are dynamic (derived
 * from the stored rows, or defined by the auditor from scratch) since MATRIX is
 * reused across ~45 papers with completely different column schemas — there is
 * no per-section fixed schema to render against.
 */
export function MatrixGridPanel({ value, onChange, paperId, sectionKey, aiHint, readOnly = false }: Props) {
  // aiHint-derived suggestion: short header labels + full phrase per label (for the tooltip)
  const suggestedFull  = parseColumnsFromAiHint(aiHint);
  const suggestedShort = dedupeLabels(suggestedFull.map(shortColumnLabel));
  const suggestedTitleByLabel = Object.fromEntries(suggestedShort.map((s, i) => [s, suggestedFull[i]]));

  const initialRows = parseValue(value);
  const initialColumns = initialRows.length > 0 ? deriveColumns(initialRows) : suggestedShort;

  const [rows,       setRows]       = useState<MatrixRow[]>(initialRows);
  const [columns,    setColumns]    = useState<string[]>(initialColumns);
  const [editingCol, setEditingCol] = useState<string | null>(null);
  const [colDraft,   setColDraft]   = useState('');
  const [aiError,    setAiError]    = useState('');
  const [aiPreview,  setAiPreview]  = useState<MatrixRow[] | null>(null);
  const [aiUsedReal, setAiUsedReal] = useState(true);
  const [usingSuggested, setUsingSuggested] = useState(initialRows.length === 0 && suggestedShort.length > 0);

  const assist = useAssistSection();

  // Re-sync local state when the incoming value changes (save confirmation, reload, etc.)
  const valueSignature = JSON.stringify(value ?? null);
  useEffect(() => {
    const parsed = parseValue(value);
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

  function commit(nextRows: MatrixRow[], nextColumns: string[]) {
    const padded = nextRows.map(r => {
      const out: MatrixRow = {};
      for (const c of nextColumns) out[c] = r[c] ?? '';
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
    commit([...rows, Object.fromEntries(cols.map(c => [c, '']))], cols);
  }

  function updateCell(rowIdx: number, col: string, val: string) {
    commit(rows.map((r, i) => (i === rowIdx ? { ...r, [col]: val } : r)), columns);
  }

  function deleteRow(idx: number) {
    commit(rows.filter((_, i) => i !== idx), columns);
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
    const previewCols = deriveColumns(aiPreview);
    if (mode === 'replace') {
      commit(aiPreview, previewCols);
    } else {
      commit([...rows, ...aiPreview], Array.from(new Set([...columns, ...previewCols])));
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
      ) : (
        <div className="border border-gray-100 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50">
                  {columns.map(col => (
                    <th key={col} className="px-3 py-2 text-left font-semibold text-gray-600 border-b border-gray-200 group/col">
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
                  {!readOnly && <th className="w-7" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="group border-b border-gray-100 last:border-0 hover:bg-blue-50/20">
                    {columns.map(col => (
                      <td key={col} className="px-3 py-2 align-top">
                        {readOnly ? (
                          <span className="text-gray-700">{row[col] || '—'}</span>
                        ) : (
                          <textarea
                            value={row[col] ?? ''}
                            onChange={e => updateCell(i, col, e.target.value)}
                            rows={1}
                            className="w-full text-xs text-gray-800 bg-transparent border-b border-transparent
                              hover:border-gray-200 focus:border-blue-400 focus:outline-none py-0.5 resize-none
                              placeholder:text-gray-300 transition-colors"
                          />
                        )}
                      </td>
                    ))}
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
                ))}
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
      )}
    </div>
  );
}
