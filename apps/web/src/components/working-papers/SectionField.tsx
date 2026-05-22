'use client';

import { useState } from 'react';
import { Pencil, Bot, X, Check } from 'lucide-react';
import type { PaperSection, SectionFieldType } from '@/hooks/useWorkingPaperGraph';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function displayValue(value: unknown, fieldType: SectionFieldType): string {
  if (value === null || value === undefined || value === '') return '';
  switch (fieldType) {
    case 'BOOLEAN':
      return value ? 'Sí' : 'No';
    case 'CURRENCY':
      return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(Number(value));
    case 'PERCENTAGE':
      return `${value}%`;
    case 'DATE':
      return new Intl.DateTimeFormat('es-CL').format(new Date(String(value)));
    default:
      return String(value);
  }
}

// ─── Matrix display ───────────────────────────────────────────────────────────

function MatrixDisplay({ value }: { value: unknown }) {
  let data: Record<string, unknown>[] = [];
  try {
    data = Array.isArray(value) ? (value as Record<string, unknown>[]) : JSON.parse(String(value));
  } catch {
    return <p className="text-xs text-gray-400 italic">Datos de matriz inválidos</p>;
  }
  if (!data.length) return <p className="text-xs text-gray-400 italic">Sin datos</p>;

  const cols = Object.keys(data[0]);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
        <thead>
          <tr className="bg-gray-50">
            {cols.map(col => (
              <th key={col} className="px-3 py-2 text-left font-semibold text-gray-600 border-b border-gray-200">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-b border-gray-100 last:border-0">
              {cols.map(col => (
                <td key={col} className="px-3 py-2 text-gray-700">
                  {String(row[col] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Reference badge ──────────────────────────────────────────────────────────

function ReferenceBadge({ value }: { value: unknown }) {
  const refs = Array.isArray(value) ? value : [value];
  return (
    <div className="flex flex-wrap gap-1.5">
      {refs.filter(Boolean).map((r, i) => (
        <span
          key={i}
          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono font-medium bg-indigo-50 border border-indigo-200 text-indigo-700"
        >
          {String(r)}
        </span>
      ))}
      {refs.filter(Boolean).length === 0 && (
        <span className="text-xs text-gray-400 italic">Sin referencia</span>
      )}
    </div>
  );
}

// ─── Editable input ───────────────────────────────────────────────────────────

interface EditInputProps {
  section: PaperSection;
  value: unknown;
  onChange: (v: unknown) => void;
  onBlur: () => void;
}

function EditInput({ section, value, onChange, onBlur }: EditInputProps) {
  const baseInput =
    'w-full text-sm border border-blue-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';

  switch (section.fieldType) {
    case 'TEXTAREA':
      return (
        <textarea
          autoFocus
          rows={4}
          className={`${baseInput} resize-y`}
          value={String(value ?? '')}
          onChange={e => onChange(e.target.value)}
          onBlur={onBlur}
        />
      );

    case 'BOOLEAN':
      return (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => { onChange(true); onBlur(); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
              value === true
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-300'
            }`}
          >
            Sí
          </button>
          <button
            type="button"
            onClick={() => { onChange(false); onBlur(); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
              value === false
                ? 'bg-red-500 text-white border-red-500'
                : 'bg-white text-gray-600 border-gray-200 hover:border-red-300'
            }`}
          >
            No
          </button>
        </div>
      );

    case 'ENUM_SELECT':
      return (
        <select
          autoFocus
          className={baseInput}
          value={String(value ?? '')}
          onChange={e => onChange(e.target.value)}
          onBlur={onBlur}
        >
          <option value="">— Seleccionar —</option>
          {(section.options ?? []).map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );

    case 'DATE':
      return (
        <input
          autoFocus
          type="date"
          className={baseInput}
          value={String(value ?? '')}
          onChange={e => onChange(e.target.value)}
          onBlur={onBlur}
        />
      );

    case 'NUMBER':
    case 'CURRENCY':
    case 'PERCENTAGE':
      return (
        <div className="flex items-center gap-2">
          {section.fieldType === 'CURRENCY' && (
            <span className="text-sm text-gray-500 shrink-0">$</span>
          )}
          <input
            autoFocus
            type="number"
            className={baseInput}
            value={String(value ?? '')}
            onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
            onBlur={onBlur}
          />
          {section.fieldType === 'PERCENTAGE' && (
            <span className="text-sm text-gray-500 shrink-0">%</span>
          )}
        </div>
      );

    default: // TEXT
      return (
        <input
          autoFocus
          type="text"
          className={baseInput}
          value={String(value ?? '')}
          onChange={e => onChange(e.target.value)}
          onBlur={onBlur}
        />
      );
  }
}

// ─── Main SectionField component ─────────────────────────────────────────────

export interface SectionFieldProps {
  section: PaperSection;
  readonly?: boolean;
  onSave: (sectionKey: string, value: unknown) => void;
}

export function SectionField({ section, readonly = false, onSave }: SectionFieldProps) {
  const [editing, setEditing]     = useState(false);
  const [localValue, setLocal]    = useState<unknown>(section.value);
  const [overriding, setOverride] = useState(false);

  // Keep local value in sync with incoming section value
  const effectiveValue = editing ? localValue : section.value;

  const isReadOnlyField =
    readonly ||
    section.fieldType === 'MATRIX' ||
    section.fieldType === 'REFERENCE' ||
    section.fieldType === 'RISK_REF' ||
    section.fieldType === 'ATTACHMENT';

  const isAutoAndLocked = section.isAutoFilled && !overriding && !editing;

  function startEdit() {
    if (isReadOnlyField) return;
    if (section.isAutoFilled && !overriding) {
      setOverride(true);
    }
    setLocal(section.value);
    setEditing(true);
  }

  function handleBlur() {
    setEditing(false);
    onSave(section.sectionKey, localValue);
  }

  function handleCancelOverride() {
    setEditing(false);
    setOverride(false);
  }

  // Auto-filled wrapper styles
  const autoFilledWrap = section.isAutoFilled
    ? 'bg-amber-50 border border-amber-200 rounded-xl p-3'
    : '';

  return (
    <div className="py-4 border-b border-gray-100 last:border-0">
      {/* Label row */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            {section.label}
            {section.isRequired && <span className="text-red-500 ml-0.5">*</span>}
          </p>
          {section.isAutoFilled && (
            <span className="flex items-center gap-1 text-[10px] text-amber-600 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded-full">
              <Bot className="w-2.5 h-2.5" />
              de: {section.sourceRef ?? 'IA'}
            </span>
          )}
        </div>

        {/* Edit toggle */}
        {!isReadOnlyField && !editing && (
          <button
            onClick={startEdit}
            className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all"
            title="Editar"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
        {editing && overriding && (
          <button
            onClick={handleCancelOverride}
            className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
            title="Cancelar edición"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        {editing && !overriding && (
          <button
            onClick={handleBlur}
            className="flex items-center gap-1 text-xs text-emerald-600 font-medium"
          >
            <Check className="w-3.5 h-3.5" /> Listo
          </button>
        )}
      </div>

      {section.description && (
        <p className="text-[11px] text-gray-400 mb-2">{section.description}</p>
      )}

      {section.aiHint && !editing && (
        <p className="text-[11px] text-violet-500 italic mb-2">
          Sugerencia IA: {section.aiHint}
        </p>
      )}

      {/* Value display / edit */}
      <div className={`group relative ${autoFilledWrap}`}>
        {/* Overlay edit button for auto-filled fields */}
        {section.isAutoFilled && !editing && !readonly && (
          <button
            onClick={startEdit}
            className="absolute top-1 right-1 p-1 rounded hover:bg-amber-200 text-amber-500 hover:text-amber-700 transition-colors z-10"
            title="Editar manualmente (sobrescribir valor de IA)"
          >
            <Pencil className="w-3 h-3" />
          </button>
        )}

        {editing ? (
          <EditInput
            section={section}
            value={localValue}
            onChange={setLocal}
            onBlur={handleBlur}
          />
        ) : (
          <div
            onClick={isReadOnlyField || isAutoAndLocked ? undefined : startEdit}
            className={!isReadOnlyField && !isAutoAndLocked ? 'cursor-text hover:bg-gray-50 rounded-lg p-1.5 -mx-1.5 transition-colors' : ''}
          >
            {/* Matrix */}
            {section.fieldType === 'MATRIX' && (
              <MatrixDisplay value={effectiveValue} />
            )}

            {/* Reference / Risk ref */}
            {(section.fieldType === 'REFERENCE' || section.fieldType === 'RISK_REF') && (
              <ReferenceBadge value={effectiveValue} />
            )}

            {/* Attachment */}
            {section.fieldType === 'ATTACHMENT' && (
              <p className="text-xs text-gray-500 italic">
                {effectiveValue ? String(effectiveValue) : 'Sin adjunto'}
              </p>
            )}

            {/* Boolean */}
            {section.fieldType === 'BOOLEAN' && effectiveValue !== null && effectiveValue !== undefined && (
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                effectiveValue ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'
              }`}>
                {effectiveValue ? 'Sí' : 'No'}
              </span>
            )}

            {/* All text-like */}
            {!['MATRIX', 'REFERENCE', 'RISK_REF', 'ATTACHMENT', 'BOOLEAN'].includes(section.fieldType) && (
              <p className={`text-sm leading-relaxed ${
                effectiveValue !== null && effectiveValue !== undefined && effectiveValue !== ''
                  ? 'text-gray-700'
                  : 'text-gray-400 italic'
              }`}>
                {effectiveValue !== null && effectiveValue !== undefined && effectiveValue !== ''
                  ? displayValue(effectiveValue, section.fieldType)
                  : section.description
                    ? 'Sin valor — haz clic para editar'
                    : 'Haz clic para editar'}
              </p>
            )}

            {/* Boolean empty state */}
            {section.fieldType === 'BOOLEAN' && (effectiveValue === null || effectiveValue === undefined) && (
              <p className="text-sm text-gray-400 italic">Sin selección</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
