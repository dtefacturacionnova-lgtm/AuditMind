'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, FileText, Database, Sparkles, Activity, Paperclip,
  Loader2, AlertTriangle, Folder, CheckCircle2,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { useAudit } from '@/hooks/useAudits';
import {
  useCreateWorkingPaper, useWorkingPapersForAudit,
  usePaperCatalogue, type PaperCatalogueEntry,
} from '@/hooks/useWorkingPapers';

const WORKING_PAPER_TYPES = [
  { value: 'PLANNING_UNDERSTANDING', label: 'Planificación y Entendimiento' },
  { value: 'CONTROL_EVALUATION',     label: 'Evaluación de Controles' },
  { value: 'SUBSTANTIVE_TEST',       label: 'Prueba Sustantiva' },
  { value: 'DATA_ANALYSIS',          label: 'Análisis de Datos / CAATs' },
  { value: 'FINDING',                label: 'Hallazgo' },
  { value: 'CLOSURE_CONCLUSION',     label: 'Cierre y Conclusión' },
  { value: 'INTERVIEW',              label: 'Entrevista' },
  { value: 'CONFIRMATION',           label: 'Confirmación Externa' },
  { value: 'NORMATIVE_ANALYSIS',     label: 'Análisis Normativo' },
] as const;

const WP_KINDS = [
  { value: 'STANDARD', label: 'Estándar', icon: FileText,  description: 'Documento tradicional con adjuntos y narrativa libre',          color: 'bg-gray-50 border-gray-300 text-gray-700' },
  { value: 'SMART',    label: 'Inteligente', icon: Database, description: 'Secciones tipadas, asistencia IA por sección, propagación al grafo', color: 'bg-blue-50 border-blue-400 text-blue-700' },
  { value: 'MASTER',   label: 'Maestro',   icon: Sparkles, description: 'Consolida múltiples papeles SMART vía IA',                       color: 'bg-violet-50 border-violet-500 text-violet-700' },
  { value: 'LIVE',     label: 'Vivo',      icon: Activity, description: 'Dashboard en tiempo real (no editable manualmente)',             color: 'bg-emerald-50 border-emerald-500 text-emerald-700' },
  { value: 'FILE',     label: 'Archivo',   icon: Paperclip, description: 'Solo archivo adjunto sin contenido propio',                     color: 'bg-amber-50 border-amber-400 text-amber-700' },
] as const;

function NewWorkingPaperInner() {
  const router = useRouter();
  const params = useSearchParams();
  const auditId  = params.get('auditId')  ?? '';
  const folderId = params.get('folderId') ?? '';

  const { data: audit, isLoading: auditLoading, isError: auditError } = useAudit(auditId);
  const create = useCreateWorkingPaper();
  const { data: existingPapers = [] } = useWorkingPapersForAudit(auditId);
  const { data: catalogue = [] }      = usePaperCatalogue(audit?.type);

  const existingPaperCodes = useMemo(
    () => new Set(existingPapers.map(p => p.paperCode).filter(Boolean) as string[]),
    [existingPapers],
  );

  const [title,     setTitle]     = useState('');
  const [type,      setType]      = useState<typeof WORKING_PAPER_TYPES[number]['value']>('PLANNING_UNDERSTANDING');
  const [wpKind,    setWpKind]    = useState<typeof WP_KINDS[number]['value']>('SMART');

  // Muestra SMART y MASTER juntos: elegir un papel ya define su motor (ver
  // handleSelectPaperCode), así que exigir adivinar el tipo antes de verlo en
  // la lista es lo que hacía que papeles MASTER como PT-MEMO/PT-PROG "no aparecieran".
  const filteredGroups = useMemo(() => {
    const grouped = new Map<string, PaperCatalogueEntry[]>();
    for (const p of catalogue) {
      if (p.wpKind !== 'SMART' && p.wpKind !== 'MASTER') continue;
      if (!grouped.has(p.group)) grouped.set(p.group, []);
      grouped.get(p.group)!.push(p);
    }
    return Array.from(grouped.entries()).map(([group, items]) => ({ group, items }));
  }, [catalogue]);
  const [code,      setCode]      = useState('');
  const [paperCode,   setPaperCode]   = useState('');
  const [customCode,  setCustomCode]  = useState(false);
  const [error,       setError]       = useState('');

  function handleSelectPaperCode(value: string) {
    if (value === '__custom__') { setCustomCode(true); setPaperCode(''); return; }
    setPaperCode(value);
    if (!value) return;
    const meta = catalogue.find(p => p.code === value);
    if (meta) {
      if (!title.trim()) setTitle(meta.title);
      setType(meta.type as never);
      setWpKind(meta.wpKind as never);
    }
  }

  // Pre-fill code based on folder ref (if available)
  const [folderRef, setFolderRef] = useState('');
  useEffect(() => {
    if (!audit || !folderId) return;
    interface FolderShape { id: string; ref: string; phaseId: string; parentId: string | null }
    interface AuditShape { phases?: Array<{ folders?: FolderShape[] }> }
    const a = audit as unknown as AuditShape;
    const allFolders = (a.phases ?? []).flatMap(p => p.folders ?? []);
    const folder = allFolders.find(f => f.id === folderId);
    if (folder?.ref) setFolderRef(folder.ref);
  }, [audit, folderId]);

  if (!auditId) {
    return (
      <div className="flex flex-col h-screen bg-[#F0F4F8]">
        <Header />
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <AlertTriangle className="w-10 h-10 text-amber-500" />
          <p className="text-sm text-gray-700">Falta el parámetro <code>auditId</code> en la URL.</p>
          <Link href="/dashboard/audits" className="text-xs text-blue-600 hover:underline">Volver al listado</Link>
        </div>
      </div>
    );
  }

  if (auditLoading && !auditError) {
    return (
      <div className="flex flex-col h-screen bg-[#F0F4F8]">
        <Header />
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
          <p className="text-xs text-gray-500">Cargando auditoría…</p>
        </div>
      </div>
    );
  }

  // If audit not found or errored, still allow creating with the auditId we have
  if (auditError || !audit) {
    return (
      <div className="flex flex-col h-screen bg-[#F0F4F8]">
        <Header />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 max-w-md mx-auto text-center px-6">
          <AlertTriangle className="w-10 h-10 text-amber-500" />
          <p className="text-sm text-gray-700 font-semibold">Auditoría no encontrada</p>
          <p className="text-xs text-gray-500">
            El identificador <code className="bg-gray-100 px-1.5 py-0.5 rounded">{auditId}</code> no corresponde a ninguna auditoría existente.
            Es posible que el enlace sea de prueba o que la auditoría haya sido eliminada.
          </p>
          <div className="flex gap-2 mt-2">
            <Link href="/dashboard/audits" className="text-xs text-blue-600 hover:underline">Ir al listado</Link>
            <button onClick={() => router.back()} className="text-xs text-gray-500 hover:text-gray-800">Volver</button>
          </div>
        </div>
      </div>
    );
  }

  async function handleCreate() {
    setError('');
    if (!title.trim()) { setError('El título es obligatorio'); return; }

    try {
      const newPaper = await create.mutateAsync({
        title:        title.trim(),
        type:         type as never,
        indexSection: folderRef || 'A',
        auditId,
        folderId:     folderId || undefined,
        wpKind,
        code:         code.trim() || undefined,
        paperCode:    paperCode.trim() || undefined,
      });
      router.push(`/dashboard/working-papers/${newPaper.id}`);
    } catch (e) {
      setError((e as Error).message ?? 'Error al crear papel');
    }
  }

  return (
    <div className="flex flex-col h-screen bg-[#F0F4F8]">
      <Header />

      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
          {/* Header */}
          <div>
            <button
              onClick={() => router.back()}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 mb-3"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Volver
            </button>
            <h1 className="text-2xl font-bold text-gray-900">Nuevo Papel de Trabajo</h1>
            <div className="flex items-center gap-2 mt-1 text-sm text-gray-500 flex-wrap">
              <span>Auditoría: <strong className="text-gray-700">{audit?.title}</strong></span>
              {folderRef && (
                <>
                  <span>·</span>
                  <Folder className="w-3.5 h-3.5 text-violet-500" />
                  <span>Carpeta: <strong className="text-violet-700">{folderRef}</strong></span>
                </>
              )}
            </div>
          </div>

          {/* Form */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Título <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Ej. Evaluación de Controles de Caja"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Código (opcional)
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  placeholder={folderRef ? `Ej. ${folderRef}-01` : 'Ej. B-01'}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400 font-mono"
                />
                <p className="text-[10px] text-gray-400 mt-1">Si no se da, se genera automáticamente</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Tipo
                </label>
                <select
                  value={type}
                  onChange={e => setType(e.target.value as never)}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white"
                >
                  {WORKING_PAPER_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* wpKind selector visual */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-2">
                Tipo de Papel (motor inteligente)
              </label>
              <div className="grid grid-cols-5 gap-2">
                {WP_KINDS.map(k => {
                  const Icon = k.icon;
                  const selected = wpKind === k.value;
                  return (
                    <button
                      key={k.value}
                      type="button"
                      onClick={() => setWpKind(k.value)}
                      className={`p-3 border-2 rounded-xl transition-all text-center ${
                        selected ? `${k.color} ring-2 ring-current` : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <Icon className="w-5 h-5 mx-auto mb-1" />
                      <p className="text-xs font-bold">{k.label}</p>
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-gray-500 mt-2">
                {WP_KINDS.find(k => k.value === wpKind)?.description}
              </p>
            </div>

            {/* Canonical paper picker — only for SMART / MASTER */}
            {(wpKind === 'SMART' || wpKind === 'MASTER') && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-gray-700">
                    Plantilla canónica de secciones
                  </label>
                  {audit?.template?.name && (
                    <span className="text-[10px] text-violet-600 font-medium bg-violet-50 px-2 py-0.5 rounded-full border border-violet-200">
                      {audit.template.name}
                    </span>
                  )}
                </div>
                {!customCode ? (
                  <select
                    value={paperCode}
                    onChange={e => handleSelectPaperCode(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white"
                  >
                    <option value="">— Sin plantilla (papel en blanco) —</option>
                    {filteredGroups.map(g => (
                      <optgroup key={g.group} label={g.group}>
                        {g.items.map(p => {
                          const used = existingPaperCodes.has(p.code);
                          const kindTag = p.wpKind === 'MASTER' ? ' (Maestro)' : '';
                          return (
                            <option key={p.code} value={p.code} disabled={used}>
                              {used
                                ? `✓ ${p.code} — ${p.title}${kindTag} (ya en el encargo)`
                                : `${p.code} — ${p.title}${kindTag}`}
                            </option>
                          );
                        })}
                      </optgroup>
                    ))}
                    <option value="__custom__">✎ Ingresar código manualmente…</option>
                  </select>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={paperCode}
                      onChange={e => setPaperCode(e.target.value)}
                      placeholder="PT-A1, PT-COSO, PT-MEMO…"
                      className="flex-1 px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400 font-mono"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => { setCustomCode(false); setPaperCode(''); }}
                      className="px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 whitespace-nowrap"
                    >
                      ← Lista
                    </button>
                  </div>
                )}
                {paperCode && (() => { const m = catalogue.find(p => p.code === paperCode); return m ? <p className="text-[10px] text-blue-600 mt-1">💡 {m.hint}</p> : null; })()}
                {existingPaperCodes.size > 0 && !customCode && (
                  <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                    Las plantillas marcadas con ✓ ya están en este encargo y no pueden seleccionarse
                  </p>
                )}
                {!paperCode && !customCode && existingPaperCodes.size === 0 && (
                  <p className="text-[10px] text-gray-400 mt-1">
                    Al seleccionar una plantilla, el tipo, motor y secciones se inicializan automáticamente.
                  </p>
                )}
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                onClick={() => router.back()}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                disabled={create.isPending || !title.trim()}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#0F2D4A] text-white font-semibold rounded-xl hover:bg-[#1a4a7a] disabled:opacity-50 text-sm"
              >
                {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Crear papel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Wrapper con Suspense (Next.js 15 exige Suspense para useSearchParams) ─────
export default function NewWorkingPaperPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col h-screen bg-[#F0F4F8]">
          <Header />
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
          </div>
        </div>
      }
    >
      <NewWorkingPaperInner />
    </Suspense>
  );
}
