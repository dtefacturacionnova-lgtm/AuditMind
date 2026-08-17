'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Mic, Square, FileText, ChevronDown, ChevronUp, Loader2, CheckCircle2,
  XCircle, AlertTriangle, Trash2, ArrowUpCircle, Sparkles, ShieldAlert,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { useUser } from '@/hooks/useUser';
import type { PaperSection } from '@/hooks/useWorkingPaperGraph';
import {
  useFieldEvidenceList, useCreateFieldEvidence, useDeleteFieldEvidence,
  useAcceptFinding, useDiscardFinding, usePromoteFinding,
  type FieldEvidence, type FieldEvidenceFinding, type FieldEvidenceStatus,
} from '@/hooks/useFieldEvidence';

/**
 * Panel de Evidencia de Campo (EVD-09) — capacidad general de captura rápida
 * (nota de texto o nota de voz) + revisión humana de hallazgos sugeridos por
 * IA ("la IA sugiere, el auditor aprueba", mismo principio que
 * seedSubstantiveProcedures y el resto del sistema). NO es un FieldType
 * nuevo — se monta una vez por papel (mismo patrón que WorkOfflinePanel),
 * colapsado por defecto, disponible en cualquier papel inteligente.
 */

interface Props {
  paperId: string;
  sectionKey: string; // sección "activa" del papel — destino sugerido por defecto al capturar
  sections: PaperSection[]; // secciones del papel — para elegir dónde materializar un hallazgo aceptado
  readOnly?: boolean;
}

const ESTADO_LABEL: Record<FieldEvidenceStatus, string> = {
  UPLOADED: 'En cola',
  TRANSCRIBING: 'Transcribiendo audio…',
  EXTRACTING: 'Analizando con IA…',
  READY: 'Listo',
  FAILED: 'Falló',
};

const NIVEL_RIESGO_CLASS: Record<string, string> = {
  alto: 'bg-red-100 text-red-700 border-red-200',
  medio: 'bg-amber-100 text-amber-700 border-amber-200',
  bajo: 'bg-gray-100 text-gray-600 border-gray-200',
};

const TIPO_LABEL: Record<string, string> = {
  contradiccion: 'Contradicción',
  evasiva: 'Evasiva',
  anomalia_visual: 'Anomalía visual',
  riesgo_mencionado: 'Riesgo mencionado',
  inconsistencia_con_expediente: 'Inconsistencia con el expediente',
  incumplimiento_mencionado: 'Incumplimiento mencionado',
};

function EstadoBadge({ status }: { status: FieldEvidenceStatus }) {
  if (status === 'READY') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
        <CheckCircle2 className="w-3 h-3" /> Listo
      </span>
    );
  }
  if (status === 'FAILED') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
        <XCircle className="w-3 h-3" /> Falló
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5">
      <Loader2 className="w-3 h-3 animate-spin" /> {ESTADO_LABEL[status]}
    </span>
  );
}

function HallazgoCard({
  finding, paperId, puedePromover, seccionesDestino, defaultSectionKey,
}: {
  finding: FieldEvidenceFinding; paperId: string; puedePromover: boolean;
  seccionesDestino: PaperSection[]; defaultSectionKey: string;
}) {
  const aceptar = useAcceptFinding(paperId);
  const descartar = useDiscardFinding(paperId);
  const promover = usePromoteFinding(paperId);
  const [error, setError] = useState('');

  // Solo secciones MATRIX pueden recibir la fila materializada — el resto de
  // fieldTypes no tienen una forma de fila donde encajar el hallazgo.
  const opcionesDestino = seccionesDestino.filter(s => s.fieldType === 'MATRIX');
  const destinoInicial = opcionesDestino.some(s => s.sectionKey === defaultSectionKey)
    ? defaultSectionKey
    : (opcionesDestino[0]?.sectionKey ?? defaultSectionKey);
  const [targetSectionKey, setTargetSectionKey] = useState(destinoInicial);

  const riesgoClass = NIVEL_RIESGO_CLASS[finding.nivelRiesgo] ?? NIVEL_RIESGO_CLASS.bajo;
  const busy = aceptar.isPending || descartar.isPending || promover.isPending;

  async function handle(fn: () => Promise<unknown>) {
    setError('');
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-semibold text-gray-700 bg-gray-100 rounded-full px-2 py-0.5">
            {TIPO_LABEL[finding.tipo] ?? finding.tipo}
          </span>
          <span className={`text-[11px] font-medium rounded-full px-2 py-0.5 border ${riesgoClass}`}>
            Riesgo {finding.nivelRiesgo}
          </span>
        </div>
        {finding.disposition === 'ACCEPTED' && (
          <span className="text-[11px] font-medium text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Aceptado</span>
        )}
        {finding.disposition === 'DISCARDED' && (
          <span className="text-[11px] font-medium text-gray-400 flex items-center gap-1"><XCircle className="w-3 h-3" /> Descartado</span>
        )}
        {finding.disposition === 'PROMOTED' && (
          <span className="text-[11px] font-medium text-indigo-700 flex items-center gap-1"><ArrowUpCircle className="w-3 h-3" /> Promovido a hallazgo</span>
        )}
      </div>

      <p className="text-xs text-gray-700">{finding.descripcion}</p>
      <blockquote className="text-xs text-gray-500 italic border-l-2 border-gray-200 pl-2">
        "{finding.citaTextual}"
        {finding.fuenteRef && <span className="not-italic text-gray-400"> — {finding.fuenteRef}</span>}
      </blockquote>
      {finding.justificacion && (
        <p className="text-[11px] text-gray-400">{finding.justificacion}</p>
      )}

      {error && <p className="text-[11px] text-red-600">{error}</p>}

      {finding.disposition === 'PENDING' && (
        <div className="space-y-1.5 pt-1">
          {opcionesDestino.length > 0 && (
            <label className="flex items-center gap-1.5 text-[11px] text-gray-500">
              Agregar fila en
              <select
                value={targetSectionKey}
                onChange={e => setTargetSectionKey(e.target.value)}
                disabled={busy}
                className="text-[11px] border border-gray-200 rounded-md px-1.5 py-0.5 outline-none focus:border-gray-400"
              >
                {opcionesDestino.map(s => (
                  <option key={s.sectionKey} value={s.sectionKey}>{s.label}</option>
                ))}
              </select>
            </label>
          )}
          <div className="flex items-center gap-2">
            <button
              disabled={busy}
              onClick={() => handle(() => aceptar.mutateAsync({ findingId: finding.id, targetSectionKey }))}
              className="text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg px-3 py-1.5"
            >
              Aceptar
            </button>
            <button
              disabled={busy}
              onClick={() => handle(() => descartar.mutateAsync(finding.id))}
              className="text-xs font-medium text-gray-600 hover:text-gray-800 disabled:opacity-50 rounded-lg px-3 py-1.5 border border-gray-200"
            >
              Descartar
            </button>
          </div>
        </div>
      )}

      {finding.disposition === 'ACCEPTED' && puedePromover && (
        <div className="pt-1">
          <button
            disabled={busy}
            onClick={() => handle(() => promover.mutateAsync(finding.id))}
            className="flex items-center gap-1.5 text-xs font-medium text-indigo-700 hover:text-indigo-900 disabled:opacity-50 rounded-lg px-3 py-1.5 border border-indigo-200 bg-indigo-50"
          >
            <ArrowUpCircle className="w-3.5 h-3.5" /> Promover a Hallazgo formal (PT-HALL)
          </button>
        </div>
      )}
    </div>
  );
}

function EvidenciaCard({
  evidencia, paperId, puedeEliminar, puedePromover, seccionesDestino,
}: {
  evidencia: FieldEvidence; paperId: string; puedeEliminar: boolean; puedePromover: boolean;
  seccionesDestino: PaperSection[];
}) {
  const eliminar = useDeleteFieldEvidence(paperId);
  const [verNoVerificables, setVerNoVerificables] = useState(false);

  const validados = evidencia.findings.filter(f => f.validadaCita);
  const noVerificables = evidencia.findings.filter(f => !f.validadaCita);
  const Icon = evidencia.kind === 'AUDIO_NOTE' ? Mic : FileText;

  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50/50 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="p-1.5 rounded-lg bg-white border border-gray-200 shrink-0">
            <Icon className="w-3.5 h-3.5 text-gray-500" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-gray-800">{formatDate(evidencia.capturedAt)}</span>
              <span className="text-xs text-gray-400">· {evidencia.capturedByName}</span>
              <EstadoBadge status={evidencia.status} />
            </div>
            {(evidencia.lugar || evidencia.descripcion) && (
              <p className="text-xs text-gray-500 mt-0.5 truncate">
                {[evidencia.lugar, evidencia.descripcion].filter(Boolean).join(' — ')}
              </p>
            )}
          </div>
        </div>
        {puedeEliminar && (
          <button
            onClick={() => eliminar.mutate(evidencia.id)}
            disabled={eliminar.isPending}
            title="Eliminar evidencia"
            className="text-gray-300 hover:text-red-600 shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {evidencia.status === 'FAILED' && evidencia.errorMsg && (
        <div className="flex items-start gap-1.5 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {evidencia.errorMsg}
        </div>
      )}

      {evidencia.status === 'READY' && evidencia.extraccionRaw && (
        <div className="space-y-2.5">
          <div className="flex items-start gap-1.5 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg px-2.5 py-2">
            <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5 text-indigo-400" />
            <div>
              <p>{evidencia.extraccionRaw.resumen_ejecutivo}</p>
              {evidencia.extraccionRaw.temas.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {evidencia.extraccionRaw.temas.map(t => (
                    <span key={t} className="text-[10px] text-gray-500 bg-gray-100 rounded-full px-1.5 py-0.5">{t}</span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {validados.length > 0 ? (
            <div className="space-y-2">
              {validados.map(f => (
                <HallazgoCard
                  key={f.id} finding={f} paperId={paperId} puedePromover={puedePromover}
                  seccionesDestino={seccionesDestino} defaultSectionKey={evidencia.sectionKey}
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic">Sin hallazgos sugeridos para esta evidencia.</p>
          )}

          {noVerificables.length > 0 && (
            <div>
              <button
                onClick={() => setVerNoVerificables(v => !v)}
                className="flex items-center gap-1.5 text-[11px] text-amber-700 hover:text-amber-900"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                {noVerificables.length} hallazgo(s) descartado(s) por cita no verificable
                {verNoVerificables ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              {verNoVerificables && (
                <div className="mt-2 space-y-2 opacity-70">
                  {noVerificables.map(f => (
                    <div key={f.id} className="rounded-xl border border-amber-200 bg-amber-50/40 p-3 text-xs text-gray-600">
                      <p className="font-medium text-amber-800 mb-1">
                        {TIPO_LABEL[f.tipo] ?? f.tipo} — cita no encontrada literal en la fuente
                      </p>
                      <p>{f.descripcion}</p>
                      <blockquote className="italic text-gray-500 border-l-2 border-amber-200 pl-2 mt-1">"{f.citaTextual}"</blockquote>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CapturaForm({ paperId, sectionKey }: { paperId: string; sectionKey: string }) {
  const crear = useCreateFieldEvidence(paperId);
  const [modo, setModo] = useState<'texto' | 'audio'>('texto');
  const [texto, setTexto] = useState('');
  const [lugar, setLugar] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [error, setError] = useState('');

  // Grabación de audio — MediaRecorder nativo del navegador, sin librerías.
  const [grabando, setGrabando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  async function iniciarGrabacion() {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        setAudioBlob(new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' }));
        stream.getTracks().forEach(t => t.stop());
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setAudioBlob(null);
      setSegundos(0);
      setGrabando(true);
      timerRef.current = setInterval(() => setSegundos(s => s + 1), 1000);
    } catch {
      setError('No se pudo acceder al micrófono — revise los permisos del navegador.');
    }
  }

  function detenerGrabacion() {
    mediaRecorderRef.current?.stop();
    setGrabando(false);
    if (timerRef.current) clearInterval(timerRef.current);
  }

  async function handleSubmit() {
    setError('');
    try {
      if (modo === 'texto') {
        if (!texto.trim()) { setError('Escriba una nota antes de guardar.'); return; }
        await crear.mutateAsync({
          kind: 'TEXT_NOTE', sectionKey, capturedAt: new Date().toISOString(),
          texto: texto.trim(), lugar: lugar.trim() || undefined, descripcion: descripcion.trim() || undefined,
        });
        setTexto('');
      } else {
        if (!audioBlob) { setError('Grabe una nota de voz antes de guardar.'); return; }
        await crear.mutateAsync({
          kind: 'AUDIO_NOTE', sectionKey, capturedAt: new Date().toISOString(),
          file: audioBlob, fileName: 'nota_voz.webm',
          lugar: lugar.trim() || undefined, descripcion: descripcion.trim() || undefined,
        });
        setAudioBlob(null);
      }
      setLugar('');
      setDescripcion('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar la evidencia');
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => setModo('texto')}
          className={`flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5 ${modo === 'texto' ? 'bg-gray-900 text-white' : 'text-gray-500 border border-gray-200'}`}
        >
          <FileText className="w-3.5 h-3.5" /> Nota de texto
        </button>
        <button
          onClick={() => setModo('audio')}
          className={`flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5 ${modo === 'audio' ? 'bg-gray-900 text-white' : 'text-gray-500 border border-gray-200'}`}
        >
          <Mic className="w-3.5 h-3.5" /> Nota de voz
        </button>
      </div>

      {modo === 'texto' ? (
        <textarea
          value={texto}
          onChange={e => setTexto(e.target.value)}
          rows={3}
          placeholder="Escriba lo observado — una cita textual exacta permite que la IA la use como evidencia verificable…"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-gray-400 resize-none"
        />
      ) : (
        <div className="flex items-center gap-3 py-2">
          {!grabando && !audioBlob && (
            <button
              onClick={iniciarGrabacion}
              className="flex items-center gap-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg px-4 py-2"
            >
              <Mic className="w-4 h-4" /> Grabar
            </button>
          )}
          {grabando && (
            <button
              onClick={detenerGrabacion}
              className="flex items-center gap-2 text-sm font-medium text-white bg-gray-900 rounded-lg px-4 py-2 animate-pulse"
            >
              <Square className="w-4 h-4" /> Detener ({segundos}s)
            </button>
          )}
          {!grabando && audioBlob && (
            <div className="flex items-center gap-3">
              <audio controls src={URL.createObjectURL(audioBlob)} className="h-9" />
              <button onClick={iniciarGrabacion} className="text-xs text-gray-500 hover:text-gray-700 underline">Regrabar</button>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <input
          value={lugar}
          onChange={e => setLugar(e.target.value)}
          placeholder="Lugar (opcional)"
          className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-gray-400"
        />
        <input
          value={descripcion}
          onChange={e => setDescripcion(e.target.value)}
          placeholder="Contexto (opcional)"
          className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-gray-400"
        />
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex justify-end">
        <button
          onClick={handleSubmit}
          disabled={crear.isPending}
          className="flex items-center gap-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg px-4 py-2"
        >
          {crear.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          Guardar y analizar con IA
        </button>
      </div>
    </div>
  );
}

export function FieldEvidencePanel({ paperId, sectionKey, sections, readOnly }: Props) {
  const [abierto, setAbierto] = useState(false);
  const { data: evidencias, isLoading } = useFieldEvidenceList(paperId, abierto);
  const { hasRole } = useUser();

  const puedeEliminar = hasRole(['SENIOR_AUDITOR']);
  const puedePromover = hasRole(['SENIOR_AUDITOR']);
  const pendientes = (evidencias ?? []).reduce(
    (n, e) => n + e.findings.filter(f => f.disposition === 'PENDING' && f.validadaCita).length, 0,
  );

  return (
    <div className="rounded-2xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setAbierto(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-white hover:bg-gray-50"
      >
        <div className="flex items-center gap-2">
          <Mic className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-semibold text-gray-800">Evidencia de Campo</span>
          {pendientes > 0 && (
            <span className="text-[11px] font-semibold text-white bg-indigo-600 rounded-full px-2 py-0.5">
              {pendientes} por revisar
            </span>
          )}
        </div>
        {abierto ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {abierto && (
        <div className="border-t border-gray-200 bg-gray-50/30 p-4 space-y-4">
          {!readOnly && <CapturaForm paperId={paperId} sectionKey={sectionKey} />}

          {isLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
          ) : evidencias && evidencias.length > 0 ? (
            <div className="space-y-3">
              {evidencias.map(ev => (
                <EvidenciaCard
                  key={ev.id} evidencia={ev} paperId={paperId}
                  puedeEliminar={puedeEliminar} puedePromover={puedePromover}
                  seccionesDestino={sections}
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400 text-center py-4">Sin evidencia de campo capturada todavía.</p>
          )}
        </div>
      )}
    </div>
  );
}
