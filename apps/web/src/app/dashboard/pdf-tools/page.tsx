'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Upload,
  X,
  Download,
  Loader2,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  FileText,
  AlertCircle,
  RotateCcw,
  Stamp,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  PDF_TOOL_OPERATIONS,
  PDF_TOOL_ACCEPT,
  PDF_TOOL_MAX_SIZE_SINGLE,
  PDF_TOOL_MAX_SIZE_MERGE,
  getPdfToolOperation,
  formatBytes,
  type PdfToolOperation,
  type PdfToolField,
} from '@/lib/pdf-tools-config';

type FieldValue = string | number | boolean;
type FieldValues = Record<string, FieldValue>;
type ResultBlob = { blob: Blob; filename: string; contentType: string };

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function defaultValuesFor(op: PdfToolOperation): FieldValues {
  const values: FieldValues = {};
  for (const f of op.fields) {
    if (f.default !== undefined) values[f.name] = f.default;
  }
  return values;
}

function StepLabel({ n, text }: { n: number; text: string }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
        {n}
      </span>
      <span className="text-sm font-semibold text-slate-700">{text}</span>
    </div>
  );
}

function Dropzone({
  multiple,
  onFiles,
}: {
  multiple: boolean;
  onFiles: (files: FileList) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 transition-colors',
        isDragging ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50',
      )}
    >
      <input
        ref={inputRef}
        type="file"
        multiple={multiple}
        accept={PDF_TOOL_ACCEPT}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <Upload className="h-7 w-7 text-slate-300" />
      <p className="text-sm font-medium text-slate-600">
        Arrastra {multiple ? 'los PDFs' : 'un PDF'} o haz clic aquí
      </p>
      <p className="text-xs text-slate-400">Solo archivos PDF</p>
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: PdfToolField;
  value: FieldValue | undefined;
  onChange: (v: FieldValue) => void;
}) {
  const baseClass =
    'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400';

  switch (field.type) {
    case 'text':
      return (
        <input
          type="text"
          value={(value as string) ?? ''}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={baseClass}
        />
      );
    case 'textarea':
      return (
        <textarea
          value={(value as string) ?? ''}
          placeholder={field.placeholder}
          rows={3}
          onChange={(e) => onChange(e.target.value)}
          className={cn(baseClass, 'font-mono')}
        />
      );
    case 'select':
      return (
        <select value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} className={baseClass}>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case 'number':
      return (
        <input
          type="number"
          value={value === undefined || value === '' ? '' : Number(value)}
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          className={baseClass}
        />
      );
    case 'checkbox':
      return (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-400"
          />
          {field.label}
        </label>
      );
    case 'color':
      return (
        <input
          type="color"
          value={(value as string) ?? '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-16 rounded-lg border border-slate-200 p-1"
        />
      );
    default:
      return null;
  }
}

function FieldRow({
  field,
  value,
  onChange,
}: {
  field: PdfToolField;
  value: FieldValue | undefined;
  onChange: (v: FieldValue) => void;
}) {
  if (field.type === 'checkbox') {
    return <FieldInput field={field} value={value} onChange={onChange} />;
  }
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">
        {field.label}
        {field.required && <span className="text-red-500"> *</span>}
      </label>
      <FieldInput field={field} value={value} onChange={onChange} />
      {field.help && <p className="mt-1 text-[11px] text-slate-400">{field.help}</p>}
    </div>
  );
}

function FieldGroup({
  fields,
  values,
  onChange,
}: {
  fields: PdfToolField[];
  values: FieldValues;
  onChange: (name: string, v: FieldValue) => void;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const basic = fields.filter((f) => !f.advanced);
  const advanced = fields.filter((f) => f.advanced);

  if (!fields.length) return null;

  return (
    <div className="space-y-3">
      {basic.map((f) => (
        <FieldRow key={f.name} field={f} value={values[f.name]} onChange={(v) => onChange(f.name, v)} />
      ))}
      {advanced.length > 0 && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowAdvanced((s) => !s)}
            className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showAdvanced && 'rotate-180')} />
            Opciones avanzadas
          </button>
          {showAdvanced && (
            <div className="mt-3 space-y-3 rounded-lg border border-slate-100 bg-slate-50/50 p-3">
              {advanced.map((f) => (
                <FieldRow key={f.name} field={f} value={values[f.name]} onChange={(v) => onChange(f.name, v)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PdfToolsPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialOp = searchParams.get('op');

  const [selectedOpId, setSelectedOpId] = useState<string | null>(
    getPdfToolOperation(initialOp) ? initialOp : null,
  );
  const [files, setFiles] = useState<File[]>([]);
  const [fieldValues, setFieldValues] = useState<FieldValues>({});
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResultBlob | null>(null);

  const op = useMemo(() => getPdfToolOperation(selectedOpId), [selectedOpId]);

  // Si llega ?op= inválido/desconocido (ej. 'sign', excluido del hub), volver al selector.
  useEffect(() => {
    if (initialOp && !getPdfToolOperation(initialOp)) setSelectedOpId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectOperation = useCallback(
    (id: string) => {
      const nextOp = getPdfToolOperation(id);
      if (!nextOp) return;
      setSelectedOpId(id);
      setFiles([]);
      setFieldValues(defaultValuesFor(nextOp));
      setResult(null);
      setError(null);
      router.replace(`/dashboard/pdf-tools?op=${id}`, { scroll: false });
    },
    [router],
  );

  const resetOperation = useCallback(() => {
    setSelectedOpId(null);
    setFiles([]);
    setFieldValues({});
    setResult(null);
    setError(null);
    router.replace('/dashboard/pdf-tools', { scroll: false });
  }, [router]);

  const handleFiles = useCallback(
    (incoming: FileList) => {
      const arr = Array.from(incoming).filter(
        (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'),
      );
      if (!arr.length) return;
      setError(null);
      setResult(null);
      setFiles((prev) => (op?.multiFile ? [...prev, ...arr] : [arr[0]]));
    },
    [op],
  );

  const moveFile = (index: number, dir: -1 | 1) => {
    setFiles((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const removeFile = (index: number) => setFiles((prev) => prev.filter((_, i) => i !== index));

  const maxSize = op?.multiFile ? PDF_TOOL_MAX_SIZE_MERGE : PDF_TOOL_MAX_SIZE_SINGLE;

  const canRun = useMemo(() => {
    if (!op || !files.length) return false;
    for (const f of op.fields) {
      if (f.required && !fieldValues[f.name]) return false;
    }
    return true;
  }, [op, files, fieldValues]);

  const handleRun = async () => {
    if (!op) return;
    const oversized = files.find((f) => f.size > maxSize);
    if (oversized) {
      setError(`"${oversized.name}" supera el límite de ${formatBytes(maxSize)} por archivo.`);
      return;
    }
    setIsRunning(true);
    setError(null);
    setResult(null);
    try {
      const formData = new FormData();
      if (op.multiFile) {
        files.forEach((f) => formData.append('files', f));
      } else {
        formData.append('file', files[0]);
      }
      for (const f of op.fields) {
        const v = fieldValues[f.name];
        if (v === undefined || v === '') continue;
        formData.append(f.name, typeof v === 'boolean' ? String(v) : String(v));
      }
      const res = await apiClient.postFormBlob(op.endpoint, formData);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ocurrió un error al procesar el PDF.');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="Notario PDF" />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Banner */}
        <div className="rounded-xl bg-[#0F2D4A] text-white p-5 flex items-start gap-4">
          <Stamp className="w-8 h-8 text-blue-300 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-base font-semibold">Notario PDF</h2>
            <p className="text-sm text-blue-200 mt-1">
              Sube uno o varios PDF, elige una operación y descarga el resultado. Herramienta de uso libre,
              sin vincularse automáticamente a ningún papel de trabajo — adjunta el resultado donde lo necesites.
            </p>
          </div>
        </div>

        {/* Selector de operación */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Elige una operación</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PDF_TOOL_OPERATIONS.map((option) => {
              const Icon = option.icon;
              const active = option.id === selectedOpId;
              return (
                <button
                  key={option.id}
                  onClick={() => selectOperation(option.id)}
                  className={cn(
                    'flex items-start gap-3 rounded-xl border p-4 text-left transition-colors',
                    active
                      ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-400'
                      : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50',
                  )}
                >
                  <Icon className={cn('h-5 w-5 mt-0.5 shrink-0', active ? 'text-blue-600' : 'text-slate-400')} />
                  <div>
                    <p className={cn('text-sm font-semibold', active ? 'text-blue-900' : 'text-slate-700')}>
                      {option.label}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">{option.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Formulario de la operación seleccionada */}
        {op && (
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-5">
            <div>
              <StepLabel n={1} text={op.multiFile ? 'Cargar archivos' : 'Cargar archivo'} />
              <Dropzone multiple={op.multiFile} onFiles={handleFiles} />

              {op.multiFile ? (
                files.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {files.map((f, i) => (
                      <li
                        key={`${f.name}-${i}`}
                        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                      >
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-500">
                          {i + 1}
                        </span>
                        <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                        <span className="flex-1 truncate text-slate-700">{f.name}</span>
                        <span className="shrink-0 text-xs text-slate-400">{formatBytes(f.size)}</span>
                        <button
                          onClick={() => moveFile(i, -1)}
                          disabled={i === 0}
                          className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => moveFile(i, 1)}
                          disabled={i === files.length - 1}
                          className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => removeFile(i)}
                          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              ) : (
                files[0] && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                    <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="flex-1 truncate text-slate-700">{files[0].name}</span>
                    <span className="shrink-0 text-xs text-slate-400">{formatBytes(files[0].size)}</span>
                    <button
                      onClick={() => removeFile(0)}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )
              )}
            </div>

            {op.fields.length > 0 && (
              <div>
                <StepLabel n={2} text="Configurar" />
                <FieldGroup
                  fields={op.fields}
                  values={fieldValues}
                  onChange={(name, v) => setFieldValues((prev) => ({ ...prev, [name]: v }))}
                />
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={handleRun}
                disabled={!canRun || isRunning}
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Ejecutar
              </button>
              <button
                onClick={resetOperation}
                className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Elegir otra operación
              </button>
            </div>

            {result && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-emerald-800">{result.filename}</p>
                    <p className="text-xs text-emerald-600">
                      {formatBytes(result.blob.size)} · {result.contentType.includes('zip') ? 'Archivo ZIP' : 'PDF'}
                    </p>
                  </div>
                  <button
                    onClick={() => triggerBlobDownload(result.blob, result.filename)}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Descargar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function PdfToolsPage() {
  return (
    <Suspense fallback={null}>
      <PdfToolsPageInner />
    </Suspense>
  );
}
