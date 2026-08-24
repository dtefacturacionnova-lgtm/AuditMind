'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import {
  BookOpen, Upload, Trash2, FileText, ChevronRight, Loader2,
  CheckCircle2, AlertTriangle, Database, Sparkles, X, RefreshCw,
  Link2, Power, Hash, Bot, Info,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────
interface RagBase {
  id: string;
  name: string;
  description: string;
}

type RagStatus = 'pendiente' | 'procesando' | 'listo' | 'error' | 'unchanged';

interface RagDocument {
  id: string;
  title: string;
  rag_base: string;
  organization_id: string | null;
  source_url: string | null;
  created_at: string | null;
  chunk_count: number;
  content_hash: string | null;
  content_hash_short: string | null;
  revision: number;
  superseded_by: string | null;
  is_active: boolean;
  status: RagStatus;
  error_message: string | null;
  embedding_providers: string[];
}

interface AgentsWithRag {
  general_chat_agents: string[];
  note: string;
}

// ─── Badge helpers ────────────────────────────────────────────────────────────
const ESTADO_LABEL: Record<RagStatus, string> = {
  pendiente: 'Pendiente', procesando: 'Procesando', listo: 'Listo',
  error: 'Error', unchanged: 'Sin cambios',
};
const ESTADO_CLASS: Record<RagStatus, string> = {
  pendiente: 'bg-gray-100 text-gray-500 border-gray-200',
  procesando: 'bg-amber-50 text-amber-700 border-amber-200',
  listo: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  error: 'bg-red-50 text-red-700 border-red-200',
  unchanged: 'bg-gray-100 text-gray-500 border-gray-200',
};

const PROVIDER_LABEL: Record<string, string> = {
  gemini: 'Gemini', voyage: 'Voyage', jina: 'Jina', cohere: 'Cohere',
};
const PROVIDER_CLASS: Record<string, string> = {
  gemini: 'bg-violet-50 text-violet-700 border-violet-200',
  voyage: 'bg-sky-50 text-sky-700 border-sky-200',
  jina: 'bg-teal-50 text-teal-700 border-teal-200',
  cohere: 'bg-orange-50 text-orange-700 border-orange-200',
};

function StatusBadge({ status }: { status: RagStatus }) {
  const isBusy = status === 'procesando' || status === 'pendiente';
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${ESTADO_CLASS[status]}`}>
      {isBusy && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
      {ESTADO_LABEL[status]}
    </span>
  );
}

// ─── Hooks ────────────────────────────────────────────────────────────────────
function useRagBases() {
  return useQuery<{ bases: RagBase[] }>({
    queryKey: ['rag', 'bases'],
    queryFn: () => apiClient.get('/ai/rag/bases') as Promise<{ bases: RagBase[] }>,
    staleTime: Infinity,
  });
}

function useRagDocuments(ragBase?: string) {
  return useQuery<{ documents: RagDocument[]; total: number }>({
    queryKey: ['rag', 'documents', ragBase],
    queryFn: () => {
      const params = new URLSearchParams();
      if (ragBase) params.set('ragBase', ragBase);
      const qs = params.toString();
      return apiClient.get(`/ai/rag/documents${qs ? `?${qs}` : ''}`);
    },
    staleTime: 15_000,
  });
}

function useAgentsWithRag() {
  return useQuery<AgentsWithRag>({
    queryKey: ['rag', 'agents-with-rag'],
    queryFn: () => apiClient.get('/ai/rag/agents-with-rag') as Promise<AgentsWithRag>,
    staleTime: Infinity,
  });
}

/** Sondea un documento mientras su estado sea pendiente/procesando, y avisa
 * cuando termina — evita que el usuario tenga que refrescar a mano para ver
 * si una ingesta en segundo plano ya terminó (o falló). */
function usePollDocument(docId: string | null, onSettled: () => void) {
  useEffect(() => {
    if (!docId) return;
    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const doc = await apiClient.get(`/ai/rag/documents/${docId}`) as RagDocument;
        if (cancelled) return;
        if (doc.status === 'listo' || doc.status === 'error' || doc.status === 'unchanged') {
          clearInterval(interval);
          onSettled();
        }
      } catch {
        clearInterval(interval);
      }
    }, 2500);
    return () => { cancelled = true; clearInterval(interval); };
  }, [docId, onSettled]);
}

// ─── Upload Modal ─────────────────────────────────────────────────────────────
function UploadModal({
  bases,
  onClose,
  onQueued,
}: {
  bases: RagBase[];
  onClose: () => void;
  onQueued: (docId: string) => void;
}) {
  const [mode, setMode]           = useState<'file' | 'url'>('file');
  const [docTitle, setDocTitle]   = useState('');
  const [ragBase, setRagBase]     = useState(bases[0]?.id ?? '');
  const [selectedFile, setFile]   = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState('');
  const [error, setError]         = useState('');
  const [uploading, setUploading] = useState(false);
  const [done, setDone]           = useState(false);
  const [result, setResult]       = useState<{ status?: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.pdf')) {
      setError('Solo se permiten archivos PDF.');
      return;
    }
    if (f.size > 50 * 1024 * 1024) {
      setError('El archivo supera el límite de 50 MB.');
      return;
    }
    setError('');
    setFile(f);
    if (!docTitle) setDocTitle(f.name.replace(/\.pdf$/i, ''));
  }

  async function handleSubmit() {
    if (mode === 'file' && !selectedFile) { setError('Selecciona un archivo PDF.'); return; }
    if (mode === 'url' && !sourceUrl.trim()) { setError('Ingresa una URL.'); return; }
    if (!docTitle.trim()) { setError('Ingresa un título para el documento.'); return; }
    if (!ragBase) { setError('Selecciona la base de conocimiento.'); return; }

    setError('');
    setUploading(true);
    try {
      let data: { doc_id?: string; status?: string };

      if (mode === 'file') {
        const formData = new FormData();
        formData.append('file', selectedFile as File);
        formData.append('docTitle', docTitle.trim());
        formData.append('ragBase', ragBase);

        const supabase = createClient();
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token ?? '';
        const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
        const res = await fetch(`${apiUrl}/ai/rag/ingest/pdf`, {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        });
        if (!res.ok) throw new Error((await res.text()) || `Error ${res.status}`);
        data = await res.json();
      } else {
        data = await apiClient.post('/ai/rag/ingest/url', {
          url: sourceUrl.trim(),
          docTitle: docTitle.trim(),
          ragBase,
        });
      }

      setResult({ status: data.status });
      setDone(true);
      if (data.doc_id) onQueued(data.doc_id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al procesar el documento.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-600 flex items-center justify-center">
              <Upload className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Cargar documento normativo</h2>
              <p className="text-xs text-gray-500">PDF/URL → pgvector → disponible en agentes IA</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {done ? (
            <div className="flex flex-col items-center py-8 gap-3 text-center">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7 text-emerald-500" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-800">
                  {result?.status === 'unchanged' ? 'Sin cambios' : 'Documento en cola de procesamiento'}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  {result?.status === 'unchanged'
                    ? 'El contenido es idéntico a la revisión ya cargada — no se generaron embeddings de nuevo.'
                    : 'Generando embeddings en segundo plano — la tabla se actualizará sola cuando termine.'}
                </p>
              </div>
              <button
                onClick={onClose}
                className="mt-2 px-5 py-2 bg-[#0F2D4A] text-white rounded-xl text-sm font-medium hover:bg-[#1a3f5f]"
              >
                Cerrar
              </button>
            </div>
          ) : (
            <>
              {/* Mode switch */}
              <div className="flex gap-2 p-1 bg-gray-100 rounded-xl">
                <button
                  onClick={() => setMode('file')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${mode === 'file' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}
                >
                  <Upload className="w-3.5 h-3.5" /> Subir PDF
                </button>
                <button
                  onClick={() => setMode('url')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${mode === 'url' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}
                >
                  <Link2 className="w-3.5 h-3.5" /> Pegar URL
                </button>
              </div>

              {mode === 'file' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Archivo PDF <span className="text-red-500">*</span>
                  </label>
                  <div
                    onClick={() => fileRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                      selectedFile
                        ? 'border-violet-300 bg-violet-50/40'
                        : 'border-gray-200 hover:border-violet-300 hover:bg-violet-50/20'
                    }`}
                  >
                    {selectedFile ? (
                      <div className="flex items-center justify-center gap-3">
                        <FileText className="w-8 h-8 text-violet-500" />
                        <div className="text-left">
                          <p className="text-sm font-medium text-violet-800">{selectedFile.name}</p>
                          <p className="text-xs text-violet-500">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <Upload className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                        <p className="text-sm text-gray-500">Haz clic para seleccionar un PDF</p>
                        <p className="text-xs text-gray-400">Máximo 50 MB</p>
                      </>
                    )}
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    URL del documento <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="url"
                    value={sourceUrl}
                    onChange={e => setSourceUrl(e.target.value)}
                    placeholder="https://www.ejemplo.gob.sv/normativa.pdf"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400/50"
                  />
                  <p className="text-xs text-gray-400 mt-1">Acepta PDF o páginas HTML publicadas — el servidor descarga y extrae el texto.</p>
                </div>
              )}

              {/* Document title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Título del documento <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={docTitle}
                  onChange={e => setDocTitle(e.target.value)}
                  placeholder="Ej: NIA 315 — Identificación y Evaluación de Riesgos"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400/50"
                />
              </div>

              {/* RAG base selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Base de conocimiento <span className="text-red-500">*</span>
                </label>
                <select
                  value={ragBase}
                  onChange={e => setRagBase(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400/50 bg-white"
                >
                  {bases.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              {uploading && (
                <div className="flex flex-col items-center gap-2 py-4">
                  <div className="flex gap-1.5">
                    {[0, 1, 2].map(i => (
                      <div key={i} className="w-2 h-2 rounded-full bg-violet-400 animate-bounce"
                        style={{ animationDelay: `${i * 150}ms` }} />
                    ))}
                  </div>
                  <p className="text-xs text-violet-500">
                    {mode === 'url' ? 'Descargando y extrayendo texto…' : 'Registrando documento…'}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {!done && (
          <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={uploading || (mode === 'file' ? !selectedFile : !sourceUrl.trim())}
              className="flex items-center gap-2 px-5 py-2 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Procesando…</>
              ) : (
                <><Upload className="w-4 h-4" /> Cargar e indexar</>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function KnowledgePage() {
  const qc = useQueryClient();
  const [ragBaseFilter, setRagBaseFilter] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [pollingDocId, setPollingDocId] = useState<string | null>(null);

  const { data: basesData } = useRagBases();
  const { data: docsData, isLoading } = useRagDocuments(ragBaseFilter || undefined);
  const { data: agentsData } = useAgentsWithRag();

  const bases = basesData?.bases ?? [];
  const documents = docsData?.documents ?? [];

  const invalidateDocs = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['rag', 'documents'] });
  }, [qc]);

  usePollDocument(pollingDocId, useCallback(() => {
    setPollingDocId(null);
    invalidateDocs();
  }, [invalidateDocs]));

  const deleteDoc = useMutation({
    mutationFn: (docId: string) => apiClient.delete(`/ai/rag/documents/${docId}`),
    onSuccess: invalidateDocs,
  });

  const toggleDoc = useMutation({
    mutationFn: (docId: string) => apiClient.patch(`/ai/rag/documents/${docId}/toggle`, {}),
    onSuccess: invalidateDocs,
  });

  const baseLabelMap = Object.fromEntries(bases.map(b => [b.id, b.name]));

  function handleQueued(docId: string) {
    invalidateDocs();
    setPollingDocId(docId);
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Base de Conocimiento RAG" />

      <div className="flex-1 overflow-auto p-6 space-y-6">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-gray-500">
          <Link href="/dashboard" className="hover:text-gray-800">Dashboard</Link>
          <ChevronRight className="w-4 h-4" />
          <Link href="/dashboard/admin/data-sources" className="hover:text-gray-800">Administración</Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-gray-800 font-medium">Base de Conocimiento</span>
        </nav>

        {/* Header card */}
        <div className="bg-gradient-to-br from-violet-50 to-purple-50 rounded-xl border border-violet-200 p-6 flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-violet-600 flex items-center justify-center flex-shrink-0">
            <Database className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-violet-900">Base de Conocimiento Normativa</h2>
            <p className="text-sm text-violet-600 mt-1 max-w-2xl">
              Carga documentos normativos (NIAs, NIIF, IIA, políticas internas) para que los agentes IA
              los consulten automáticamente durante sus respuestas. Los documentos se fragmentan y
              almacenan como vectores en pgvector.
            </p>
            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-1.5 text-xs text-violet-600">
                <Sparkles className="w-3.5 h-3.5" />
                Agentes con RAG: {agentsData?.general_chat_agents?.join(', ') ?? 'Minerva, Scriptorium, Argus, Cicero, Lex y más'}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-violet-500">
                <Database className="w-3.5 h-3.5" />
                {docsData?.total ?? 0} documentos · {documents.reduce((s, d) => s + d.chunk_count, 0)} chunks
              </div>
            </div>
          </div>
          <button
            onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 transition-all shadow-sm flex-shrink-0"
          >
            <Upload className="w-4 h-4" />
            Cargar documento
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={ragBaseFilter}
            onChange={e => setRagBaseFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400/40 bg-white"
          >
            <option value="">Todas las bases</option>
            {bases.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <button
            onClick={invalidateDocs}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Actualizar
          </button>
        </div>

        {/* Documents table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {isLoading ? (
            <div className="p-8 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : documents.length === 0 ? (
            <div className="py-16 text-center">
              <BookOpen className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No hay documentos cargados</p>
              <p className="text-gray-400 text-sm mt-1">
                Sube el primer documento normativo para enriquecer las respuestas de los agentes IA
              </p>
              <button
                onClick={() => setShowUploadModal(true)}
                className="mt-4 flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 mx-auto"
              >
                <Upload className="w-4 h-4" />
                Cargar primer documento
              </button>
            </div>
          ) : (
            <>
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 grid grid-cols-12 gap-4 text-xs font-medium text-gray-500 uppercase tracking-wide">
                <div className="col-span-4">Documento</div>
                <div className="col-span-2">Base de Conocimiento</div>
                <div className="col-span-2">Estado / Proveedor</div>
                <div className="col-span-2">Chunks</div>
                <div className="col-span-1">Ingresado</div>
                <div className="col-span-1" />
              </div>
              <div className="divide-y divide-gray-100">
                {documents.map(doc => (
                  <div key={doc.id} className={`grid grid-cols-12 gap-4 px-4 py-3.5 items-center hover:bg-gray-50 group ${!doc.is_active ? 'opacity-50' : ''}`}>
                    <div className="col-span-4 flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-4 h-4 text-red-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate" title={doc.title}>{doc.title}</p>
                        <div className="flex items-center gap-2 flex-wrap mt-0.5">
                          <span className="text-xs text-gray-400">
                            {doc.organization_id ? 'Organización específica' : 'Base global'}
                          </span>
                          {doc.revision > 1 && (
                            <span className="text-[10px] font-mono text-indigo-500 bg-indigo-50 border border-indigo-200 px-1.5 rounded">
                              REV {doc.revision}
                            </span>
                          )}
                          {doc.content_hash_short && (
                            <span
                              className="text-[10px] font-mono text-gray-400 flex items-center gap-0.5"
                              title="Hash SHA-256 del contenido — trazabilidad y reproducibilidad"
                            >
                              <Hash className="w-2.5 h-2.5" />{doc.content_hash_short}
                            </span>
                          )}
                        </div>
                        {doc.source_url && (
                          <a
                            href={doc.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-sky-600 hover:underline truncate block mt-0.5"
                            title={doc.source_url}
                          >
                            {doc.source_url}
                          </a>
                        )}
                        {doc.status === 'error' && doc.error_message && (
                          <p className="text-[11px] text-red-500 mt-0.5 truncate" title={doc.error_message}>
                            {doc.error_message}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="col-span-2">
                      <span className="text-xs font-medium text-violet-700 bg-violet-50 border border-violet-200 px-2 py-1 rounded-full">
                        {baseLabelMap[doc.rag_base] ?? doc.rag_base}
                      </span>
                    </div>
                    <div className="col-span-2 flex flex-col gap-1 items-start">
                      <StatusBadge status={doc.status} />
                      {doc.embedding_providers.map(p => (
                        <span
                          key={p}
                          className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${PROVIDER_CLASS[p] ?? 'bg-gray-50 text-gray-500 border-gray-200'}`}
                        >
                          {PROVIDER_LABEL[p] ?? p}
                        </span>
                      ))}
                    </div>
                    <div className="col-span-2">
                      <span className="text-sm font-semibold text-gray-700">
                        {doc.chunk_count.toLocaleString()}
                      </span>
                      <span className="text-xs text-gray-400 ml-1">frags.</span>
                    </div>
                    <div className="col-span-1">
                      <span className="text-xs text-gray-500">
                        {doc.created_at ? formatDate(doc.created_at) : '—'}
                      </span>
                    </div>
                    <div className="col-span-1 flex justify-end gap-1">
                      <button
                        onClick={() => toggleDoc.mutate(doc.id)}
                        disabled={toggleDoc.isPending}
                        title={doc.is_active ? 'Desactivar (deja de usarse en búsquedas, no se borra)' : 'Reactivar'}
                        className={`p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50 ${
                          doc.is_active ? 'text-gray-300 hover:text-amber-500 hover:bg-amber-50' : 'text-amber-500 bg-amber-50 opacity-100'
                        }`}
                      >
                        <Power className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`¿Eliminar "${doc.title}"? Se borrarán todos sus fragmentos.`)) {
                            deleteDoc.mutate(doc.id);
                          }
                        }}
                        disabled={deleteDoc.isPending}
                        className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Especialistas con RAG */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
            <Bot className="w-4 h-4 text-indigo-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800">Especialistas IA con acceso a esta base</p>
            <p className="text-xs text-gray-500 mt-1 flex flex-wrap gap-1.5">
              {(agentsData?.general_chat_agents ?? []).map(a => (
                <span key={a} className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-600 font-medium">{a}</span>
              ))}
            </p>
            <p className="text-xs text-gray-400 mt-2 flex items-start gap-1">
              <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
              {agentsData?.note ?? 'Estos agentes buscan en todas las bases activas al responder.'}
            </p>
          </div>
        </div>

        {/* RAG bases info */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
            Bases de Conocimiento Disponibles
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {bases.map(base => {
              const count = documents.filter(d => d.rag_base === base.id).length;
              return (
                <div key={base.id} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{base.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{base.description}</p>
                    </div>
                    {count > 0 && (
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-violet-600 text-white text-xs flex items-center justify-center font-bold">
                        {count}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {showUploadModal && (
        <UploadModal
          bases={bases}
          onClose={() => setShowUploadModal(false)}
          onQueued={handleQueued}
        />
      )}
    </div>
  );
}
