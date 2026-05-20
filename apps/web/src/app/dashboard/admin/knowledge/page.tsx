'use client';

import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import {
  BookOpen, Upload, Trash2, FileText, ChevronRight, Loader2,
  CheckCircle2, AlertTriangle, Database, Sparkles, X, RefreshCw,
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

interface RagDocument {
  id: string;
  title: string;
  rag_base: string;
  organization_id: string | null;
  source_url: string | null;
  created_at: string | null;
  chunk_count: number;
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
    staleTime: 30_000,
  });
}

// ─── Upload Modal ─────────────────────────────────────────────────────────────
function UploadModal({
  bases,
  onClose,
  onSuccess,
}: {
  bases: RagBase[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [docTitle, setDocTitle]   = useState('');
  const [ragBase, setRagBase]     = useState(bases[0]?.id ?? '');
  const [selectedFile, setFile]   = useState<File | null>(null);
  const [error, setError]         = useState('');
  const [uploading, setUploading] = useState(false);
  const [done, setDone]           = useState(false);
  const [result, setResult]       = useState<{ chunks?: number; size_kb?: number } | null>(null);
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

  async function handleUpload() {
    if (!selectedFile) { setError('Selecciona un archivo PDF.'); return; }
    if (!docTitle.trim()) { setError('Ingresa un título para el documento.'); return; }
    if (!ragBase) { setError('Selecciona la base de conocimiento.'); return; }

    setError('');
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('docTitle', docTitle.trim());
      formData.append('ragBase', ragBase);

      // Use fetch directly for multipart (apiClient doesn't support multipart)
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? '';

      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
      const res = await fetch(`${apiUrl}/ai/rag/ingest/pdf`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `Error ${res.status}`);
      }

      const data = await res.json();
      setResult({ chunks: data.chunks, size_kb: data.size_kb });
      setDone(true);
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al subir el archivo.');
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
              <p className="text-xs text-gray-500">PDF → pgvector → disponible en agentes IA</p>
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
                <h3 className="font-semibold text-gray-800">¡Documento ingresado!</h3>
                <p className="text-sm text-gray-500 mt-1">
                  <span className="font-medium text-violet-700">{result?.chunks ?? 0} chunks</span> generados
                  {result?.size_kb ? ` · ${result.size_kb} KB` : ''}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Ya disponible para los agentes IA en sus consultas
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
              {/* File picker */}
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
                  <p className="text-xs text-violet-500">Procesando PDF y generando embeddings…</p>
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
              onClick={handleUpload}
              disabled={uploading || !selectedFile}
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

  const { data: basesData } = useRagBases();
  const { data: docsData, isLoading } = useRagDocuments(ragBaseFilter || undefined);

  const bases = basesData?.bases ?? [];
  const documents = docsData?.documents ?? [];

  const deleteDoc = useMutation({
    mutationFn: (docId: string) => apiClient.delete(`/ai/rag/documents/${docId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rag', 'documents'] }),
  });

  const baseLabelMap = Object.fromEntries(bases.map(b => [b.id, b.name]));

  function handleUploadSuccess() {
    qc.invalidateQueries({ queryKey: ['rag', 'documents'] });
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
              Carga documentos PDF normativos (NIAs, NIIF, IIA, políticas internas) para que los agentes IA
              los consulten automáticamente durante sus respuestas. Los documentos se fragmentan y
              almacenan como vectores en pgvector.
            </p>
            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-1.5 text-xs text-violet-600">
                <Sparkles className="w-3.5 h-3.5" />
                Agentes con RAG: Minerva, Scriptorium, Argus, Cicero, Lex y más
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
            Cargar PDF
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
            onClick={() => qc.invalidateQueries({ queryKey: ['rag', 'documents'] })}
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
                Sube el primer PDF normativo para enriquecer las respuestas de los agentes IA
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
                <div className="col-span-3">Base de Conocimiento</div>
                <div className="col-span-2">Chunks</div>
                <div className="col-span-2">Ingresado</div>
                <div className="col-span-1" />
              </div>
              <div className="divide-y divide-gray-100">
                {documents.map(doc => (
                  <div key={doc.id} className="grid grid-cols-12 gap-4 px-4 py-3.5 items-center hover:bg-gray-50 group">
                    <div className="col-span-4 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-4 h-4 text-red-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{doc.title}</p>
                        {doc.organization_id ? (
                          <span className="text-xs text-indigo-500">Organización específica</span>
                        ) : (
                          <span className="text-xs text-gray-400">Base global</span>
                        )}
                      </div>
                    </div>
                    <div className="col-span-3">
                      <span className="text-xs font-medium text-violet-700 bg-violet-50 border border-violet-200 px-2 py-1 rounded-full">
                        {baseLabelMap[doc.rag_base] ?? doc.rag_base}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-sm font-semibold text-gray-700">
                        {doc.chunk_count.toLocaleString()}
                      </span>
                      <span className="text-xs text-gray-400 ml-1">frags.</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-xs text-gray-500">
                        {doc.created_at ? formatDate(doc.created_at) : '—'}
                      </span>
                    </div>
                    <div className="col-span-1 flex justify-end">
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
          onSuccess={handleUploadSuccess}
        />
      )}
    </div>
  );
}
