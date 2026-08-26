'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Loader2, CheckCircle2, XCircle, HelpCircle, Mic, Square, FileText, Trash2,
  Search, Sparkles, ShieldAlert, AlertTriangle,
} from 'lucide-react';
import {
  useInvestigationContext, useCreateInvestigationContext, useDeleteInvestigationContext,
  useInvestigationReports, useCreateInvestigationReport, useInvestigationReport,
  type ClusterHallazgos, type VeredictoClaim,
} from '@/hooks/useInvestigationReport';
import { formatDate } from '@/lib/utils';
import { CaatsAutoRunPanel } from './CaatsAutoRunPanel';

// ─── Helpers — visual mapping (mismo vocabulario que EvidenceGraphView) ────────

const NIVEL_RIESGO_STYLE: Record<string, string> = {
  bajo:  'bg-gray-100 text-gray-600',
  medio: 'bg-amber-100 text-amber-700',
  alto:  'bg-red-100 text-red-700',
};

const VEREDICTO_STYLE: Record<VeredictoClaim, { color: string; icon: typeof CheckCircle2; label: string }> = {
  confirmada:               { color: 'text-emerald-600', icon: CheckCircle2, label: 'Confirmada' },
  contradicha:               { color: 'text-red-600',     icon: XCircle,      label: 'Contradicha' },
  sin_evidencia_suficiente:  { color: 'text-gray-500',    icon: HelpCircle,   label: 'Sin evidencia suficiente' },
};

interface InvestigatorTabProps {
  auditId: string;
}

export function InvestigatorTab({ auditId }: InvestigatorTabProps) {
  // ─── Contexto previo del auditor ────────────────────────────────────────
  const notas = useInvestigationContext(auditId);
  const crearContexto = useCreateInvestigationContext(auditId);
  const eliminarContexto = useDeleteInvestigationContext(auditId);

  const [modoContexto, setModoContexto] = useState<'texto' | 'audio'>('texto');
  const [textoContexto, setTextoContexto] = useState('');
  const [errorContexto, setErrorContexto] = useState('');

  const [grabando, setGrabando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  async function iniciarGrabacion() {
    setErrorContexto('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        setAudioBlob(new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' }));
        stream.getTracks().forEach((t) => t.stop());
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setAudioBlob(null);
      setSegundos(0);
      setGrabando(true);
      timerRef.current = setInterval(() => setSegundos((s) => s + 1), 1000);
    } catch {
      setErrorContexto('No se pudo acceder al micrófono — revise los permisos del navegador.');
    }
  }

  function detenerGrabacion() {
    mediaRecorderRef.current?.stop();
    setGrabando(false);
    if (timerRef.current) clearInterval(timerRef.current);
  }

  async function handleGuardarContexto() {
    setErrorContexto('');
    try {
      if (modoContexto === 'texto') {
        if (!textoContexto.trim()) { setErrorContexto('Escriba el contexto antes de guardar.'); return; }
        await crearContexto.mutateAsync({
          kind: 'TEXT_NOTE', capturedAt: new Date().toISOString(), texto: textoContexto.trim(),
        });
        setTextoContexto('');
      } else {
        if (!audioBlob) { setErrorContexto('Grabe una nota de voz antes de guardar.'); return; }
        await crearContexto.mutateAsync({
          kind: 'AUDIO_NOTE', capturedAt: new Date().toISOString(), file: audioBlob, fileName: 'contexto_previo.webm',
        });
        setAudioBlob(null);
      }
    } catch (e) {
      setErrorContexto(e instanceof Error ? e.message : 'No se pudo guardar el contexto.');
    }
  }

  // ─── Objetivo + generación de informe ────────────────────────────────────
  const [objetivo, setObjetivo] = useState('');
  const [errorInforme, setErrorInforme] = useState('');
  const [activeReportId, setActiveReportId] = useState<string | undefined>(undefined);

  const reports = useInvestigationReports(auditId);
  const crearReporte = useCreateInvestigationReport(auditId);
  const activeReport = useInvestigationReport(auditId, activeReportId);

  useEffect(() => {
    if (!activeReportId && reports.data && reports.data.length > 0) {
      setActiveReportId(reports.data[0].id);
    }
  }, [reports.data, activeReportId]);

  const hayInformeEnCurso = reports.data?.some((r) => r.status === 'PENDING' || r.status === 'RUNNING') ?? false;

  async function handleGenerarInforme() {
    setErrorInforme('');
    if (!objetivo.trim()) { setErrorInforme('Describa el objetivo del análisis antes de generar el informe.'); return; }
    try {
      const nuevo = await crearReporte.mutateAsync(objetivo.trim());
      setActiveReportId(nuevo.id);
      setObjetivo('');
    } catch (e) {
      setErrorInforme(e instanceof Error ? e.message : 'No se pudo iniciar el informe.');
    }
  }

  return (
    <div className="space-y-4">
      {/* Contexto previo del auditor */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-violet-500" /> Contexto previo del auditor
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Describa (texto o voz) lo que ya cree saber — antecedentes, hipótesis, hechos previos. SHERLOCK
            verificará cada afirmación contra el grafo de evidencia real, de forma independiente al objetivo.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setModoContexto('texto')}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border ${modoContexto === 'texto' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}
          >
            Texto
          </button>
          <button
            onClick={() => setModoContexto('audio')}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border ${modoContexto === 'audio' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}
          >
            Nota de voz
          </button>
        </div>

        {modoContexto === 'texto' ? (
          <textarea
            value={textoContexto}
            onChange={(e) => setTextoContexto(e.target.value)}
            rows={4}
            placeholder="Ej.: Tengo entendido que Juan Pérez autorizó el pago sin la firma del gerente financiero…"
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-gray-400 resize-none"
          />
        ) : (
          <div className="flex items-center gap-3">
            {!grabando && !audioBlob && (
              <button
                onClick={iniciarGrabacion}
                className="flex items-center gap-1.5 text-xs font-semibold text-white bg-red-500 hover:bg-red-600 rounded-lg px-3 py-1.5"
              >
                <Mic className="w-3.5 h-3.5" /> Grabar
              </button>
            )}
            {grabando && (
              <button
                onClick={detenerGrabacion}
                className="flex items-center gap-1.5 text-xs font-semibold text-white bg-gray-900 rounded-lg px-3 py-1.5 animate-pulse"
              >
                <Square className="w-3.5 h-3.5" /> Detener ({segundos}s)
              </button>
            )}
            {!grabando && audioBlob && (
              <>
                <audio controls src={URL.createObjectURL(audioBlob)} className="h-8" />
                <button onClick={() => setAudioBlob(null)} className="text-xs text-gray-500 hover:text-red-600">
                  Descartar
                </button>
              </>
            )}
          </div>
        )}

        {errorContexto && <p className="text-xs text-red-600">{errorContexto}</p>}

        <button
          onClick={handleGuardarContexto}
          disabled={crearContexto.isPending}
          className="flex items-center gap-1.5 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-40 rounded-lg px-3 py-1.5"
        >
          {crearContexto.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldAlert className="w-3.5 h-3.5" />}
          Guardar contexto
        </button>

        {(notas.data?.length ?? 0) > 0 && (
          <div className="space-y-2 pt-2 border-t border-gray-100">
            {notas.data!.map((n) => (
              <div key={n.id} className="flex items-start justify-between gap-3 text-xs bg-gray-50 rounded-lg px-3 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[10px] text-gray-400 mb-0.5">
                    <span>{n.kind === 'TEXT_NOTE' ? 'Texto' : 'Voz'}</span>
                    <span>·</span>
                    <span>{formatDate(n.capturedAt)}</span>
                    {n.status !== 'READY' && n.status !== 'FAILED' && (
                      <span className="flex items-center gap-1 text-blue-600"><Loader2 className="w-3 h-3 animate-spin" /> Procesando…</span>
                    )}
                    {n.status === 'FAILED' && (
                      <span className="flex items-center gap-1 text-red-600"><AlertTriangle className="w-3 h-3" /> {n.errorMsg ?? 'Falló'}</span>
                    )}
                    {n.calidadBaja && (
                      <span className="flex items-center gap-1 text-orange-600"><AlertTriangle className="w-3 h-3" /> Calidad baja</span>
                    )}
                  </div>
                  <p className="text-gray-700 line-clamp-2">
                    {n.kind === 'TEXT_NOTE' ? n.textoOriginal : (n.transcript?.texto ?? '(sin transcribir aún)')}
                  </p>
                </div>
                <button
                  onClick={() => eliminarContexto.mutate(n.id)}
                  className="shrink-0 text-gray-300 hover:text-red-600"
                  aria-label="Eliminar nota de contexto"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Fase 2c — análisis CAATs auto-detectado desde una hoja de cálculo */}
      <CaatsAutoRunPanel auditId={auditId} />

      {/* Objetivo del análisis */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
          <Search className="w-4 h-4 text-violet-500" /> Objetivo del análisis
        </h3>
        <textarea
          value={objetivo}
          onChange={(e) => setObjetivo(e.target.value)}
          rows={3}
          placeholder="Ej.: Investigar si hubo pagos autorizados sin la segregación de funciones requerida en el ciclo de tesorería…"
          className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-gray-400 resize-none"
        />
        {errorInforme && <p className="text-xs text-red-600">{errorInforme}</p>}
        <button
          onClick={handleGenerarInforme}
          disabled={crearReporte.isPending || hayInformeEnCurso}
          className="flex items-center gap-1.5 text-xs font-semibold text-white bg-gray-900 hover:bg-gray-800 disabled:opacity-40 rounded-lg px-3 py-1.5"
        >
          {crearReporte.isPending || hayInformeEnCurso ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {hayInformeEnCurso ? 'Ya hay un informe en curso…' : 'Generar informe'}
        </button>
      </div>

      {/* Historial */}
      {(reports.data?.length ?? 0) > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {reports.data!.map((r) => (
            <button
              key={r.id}
              onClick={() => setActiveReportId(r.id)}
              className={`text-[11px] px-2.5 py-1 rounded-full border flex items-center gap-1.5 ${
                r.id === activeReportId ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'
              }`}
            >
              {(r.status === 'PENDING' || r.status === 'RUNNING') && <Loader2 className="w-3 h-3 animate-spin" />}
              {r.status === 'FAILED' && <XCircle className="w-3 h-3 text-red-400" />}
              {formatDate(r.startedAt)} — {r.objetivo.slice(0, 40)}{r.objetivo.length > 40 ? '…' : ''}
            </button>
          ))}
        </div>
      )}

      {/* Informe activo */}
      {activeReport.data && (
        <ReporteDetalle report={activeReport.data} />
      )}
    </div>
  );
}

// ─── Detalle del informe ────────────────────────────────────────────────────

function ReporteDetalle({ report }: { report: NonNullable<ReturnType<typeof useInvestigationReport>['data']> }) {
  if (report.status === 'PENDING' || report.status === 'RUNNING') {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-10 flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
        <p className="text-sm text-gray-600 font-medium">Sherlock está analizando el grafo de evidencia…</p>
        <p className="text-xs text-gray-400">Esto puede tardar uno o dos minutos.</p>
      </div>
    );
  }

  if (report.status === 'FAILED') {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
        <p className="text-sm text-red-700 font-semibold">El informe no se pudo generar</p>
        <p className="text-xs text-red-600 mt-1">{report.errorMsg}</p>
      </div>
    );
  }

  const result = report.result;
  if (!result) return null;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-2">
        <h3 className="text-sm font-bold text-gray-800">Conclusión general</h3>
        <p className="text-sm text-gray-700">{result.conclusionGeneral}</p>
        {result.grafoTruncado && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">{result.notaTruncamiento}</p>
          </div>
        )}
      </div>

      <ClusterGroup titulo="Hallazgos relacionados al objetivo" icon={Search} clusters={result.hallazgosObjetivo} />
      <ClusterGroup titulo="Otras banderas detectadas" icon={AlertTriangle} clusters={result.otrasBanderas} />

      {result.verificacionContexto.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
          <h3 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-violet-500" /> Verificación del contexto del auditor
          </h3>
          {result.verificacionContexto.map((c, i) => {
            const style = VEREDICTO_STYLE[c.veredicto];
            const Icon = style.icon;
            return (
              <div key={i} className="rounded-xl border border-gray-200 p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-gray-700 italic flex-1">&ldquo;{c.claim_texto}&rdquo;</p>
                  <span className={`flex items-center gap-1 text-[10px] font-semibold shrink-0 ${style.color}`}>
                    <Icon className="w-3.5 h-3.5" /> {style.label}
                  </span>
                </div>
                <p className="text-[11px] text-gray-500">{c.justificacion}</p>
                {c.citas_relevantes.length > 0 && (
                  <div className="pl-3 border-l-2 border-gray-100 space-y-1">
                    {c.citas_relevantes.map((cita, j) => (
                      <p key={j} className="text-[11px] text-gray-600 italic">&ldquo;{cita}&rdquo;</p>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {result.claimsExtraidos.length > 0 && (
        <details className="bg-white rounded-2xl border border-gray-200 p-5">
          <summary className="text-xs font-semibold text-gray-500 cursor-pointer">
            Afirmaciones atomizadas del contexto del auditor ({result.claimsExtraidos.length}) — extracción ciega, previa al análisis
          </summary>
          <ul className="mt-2 space-y-1">
            {result.claimsExtraidos.map((claim, i) => (
              <li key={i} className="text-[11px] text-gray-600">· {claim}</li>
            ))}
          </ul>
        </details>
      )}

      {result.fuentesNoValidadas.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5 space-y-2">
          <h3 className="text-sm font-bold text-orange-800 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" /> Fuentes no validadas
          </h3>
          <p className="text-xs text-orange-700">
            Estas evidencias tuvieron calidad degradada (OCR o transcripción difícil) — sus citas dentro del
            informe deben tratarse con más cautela.
          </p>
          {result.fuentesNoValidadas.map((f) => (
            <p key={f.evidenceId} className="text-xs text-orange-700 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" /> {f.filename ?? f.evidenceId} — {f.motivo}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function ClusterGroup({ titulo, icon: Icon, clusters }: { titulo: string; icon: typeof Search; clusters: ClusterHallazgos[] }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
      <h3 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
        <Icon className="w-4 h-4 text-violet-500" /> {titulo}
      </h3>
      {clusters.length === 0 ? (
        <p className="text-xs text-gray-400">Sin hallazgos en esta categoría para este informe.</p>
      ) : (
        clusters.map((cluster, i) => (
          <div key={i} className="rounded-xl border border-gray-100 p-3 space-y-2 bg-gray-50">
            <div>
              <p className="text-xs font-bold text-gray-700">{cluster.tema}</p>
              <p className="text-[11px] text-gray-500">{cluster.resumen}</p>
            </div>
            {cluster.hallazgos.map((h, j) => (
              <div key={j} className="bg-white rounded-lg border border-gray-200 p-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-gray-800">{h.titulo}</p>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${NIVEL_RIESGO_STYLE[h.nivel_riesgo]}`}>
                    {h.nivel_riesgo}
                  </span>
                </div>
                <p className="text-[11px] text-gray-600">{h.descripcion}</p>
                <p className="text-[11px] text-gray-700 italic">&ldquo;{h.cita_textual}&rdquo;</p>
                {!h.citaVerificada && (
                  <span className="flex items-center gap-1 text-[10px] text-orange-600">
                    <AlertTriangle className="w-3 h-3" /> Cita no verificable contra el grafo enviado
                  </span>
                )}
                <p className="text-[10px] text-gray-400">{h.justificacion}</p>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}
