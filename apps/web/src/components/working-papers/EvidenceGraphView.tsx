'use client';

import { useMemo, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
  MarkerType,
} from '@xyflow/react';
import { useRouter } from 'next/navigation';
import {
  User, Landmark, ArrowLeftRight, FileText, Quote, Calendar,
  Database, Loader2, X, AlertTriangle, ExternalLink, CheckCircle2, GitMerge,
} from 'lucide-react';
import {
  useAuditEvidenceGraph,
  useMergeEntities,
  type EvidenceGraphNode,
  type EvidenceGraphEdge,
  type EvidenceGraph,
  type GraphEntityType,
  type GraphRelationType,
} from '@/hooks/useAuditEvidenceGraph';
import { layoutNodes } from '@/lib/graph-dagre-layout';
import { formatDate } from '@/lib/utils';

import '@xyflow/react/dist/style.css';

// ─── Helpers — visual mapping ────────────────────────────────────────────────

const ENTITY_STYLE: Record<GraphEntityType, { bg: string; border: string; icon: typeof User; label: string; dot: string }> = {
  PERSONA:      { bg: 'bg-blue-50',    border: 'border-blue-400',    icon: User,           label: 'Persona',       dot: '#60a5fa' },
  CUENTA:       { bg: 'bg-emerald-50', border: 'border-emerald-500', icon: Landmark,       label: 'Cuenta',        dot: '#10b981' },
  TRANSACCION:  { bg: 'bg-amber-50',   border: 'border-amber-400',   icon: ArrowLeftRight, label: 'Transacción',   dot: '#f59e0b' },
  DOCUMENTO:    { bg: 'bg-gray-50',    border: 'border-gray-300',    icon: FileText,       label: 'Documento',     dot: '#9ca3af' },
  AFIRMACION:   { bg: 'bg-violet-50',  border: 'border-violet-500',  icon: Quote,          label: 'Afirmación',    dot: '#a78bfa' },
  FECHA_EVENTO: { bg: 'bg-rose-50',    border: 'border-rose-400',    icon: Calendar,       label: 'Fecha/Evento',  dot: '#fb7185' },
};

const RELATION_STYLE: Record<GraphRelationType, { color: string; label: string }> = {
  AUTORIZO:   { color: '#10b981', label: 'Autorizó' },
  CONTRADICE: { color: '#ef4444', label: 'Contradice' },
  MENCIONA:   { color: '#9ca3af', label: 'Menciona' },
  INVOLUCRA:  { color: '#60a5fa', label: 'Involucra' },
};

const EVIDENCE_KIND_LABEL: Record<string, string> = {
  TEXT_NOTE: 'Nota de texto',
  AUDIO_NOTE: 'Nota de voz',
  INTERVIEW_AUDIO: 'Entrevista',
  ANNOTATED_PHOTO: 'Foto anotada',
  SHORT_VIDEO: 'Video corto',
  PDF_DOCUMENT: 'Documento PDF',
};

// Fase 2a — bajo este umbral una relación se muestra atenuada/punteada; la
// escala 0-1 la reporta el propio LLM extractor.
const UMBRAL_CONFIANZA_BAJA = 0.6;

// ─── Custom node ──────────────────────────────────────────────────────────────

type EntityNodeData = EvidenceGraphNode & {
  onClick: (node: EvidenceGraphNode) => void;
  [key: string]: unknown; // requerido por el genérico Node de React Flow
};

function EntityNode({ data }: NodeProps<Node<EntityNodeData>>) {
  const style = ENTITY_STYLE[data.tipo] ?? ENTITY_STYLE.DOCUMENTO;
  const Icon = style.icon;
  const tieneCitaInvalida = data.mentions.some((m) => !m.validadaCita);
  const confirmado = data.mentions.some((m) => m.confirmadoPorAuditor);

  return (
    <div
      onClick={() => data.onClick(data)}
      className={`${style.bg} ${style.border} border-2 rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer w-[200px] overflow-hidden`}
    >
      <Handle type="target" position={Position.Top} className="!bg-gray-400 !w-2 !h-2 !border-0" />
      <Handle type="source" position={Position.Bottom} className="!bg-gray-400 !w-2 !h-2 !border-0" />

      <div className="flex items-center justify-between px-2.5 py-1.5 bg-white/60 border-b border-current/10">
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon className="w-3.5 h-3.5 shrink-0 text-gray-700" />
          <span className="text-[10px] font-semibold text-gray-700">{style.label}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {confirmado && (
            <CheckCircle2 className="w-3 h-3 text-emerald-600" aria-label="Confirmado por el auditor" />
          )}
          {tieneCitaInvalida && (
            <AlertTriangle className="w-3 h-3 text-orange-500" aria-label="Cita sin verificar" />
          )}
        </div>
      </div>

      <div className="px-2.5 py-2">
        <p className="text-[11px] font-semibold text-gray-800 leading-tight line-clamp-2">{data.nombre}</p>
      </div>

      <div className="px-2.5 pb-1.5">
        <span className="text-[9px] text-gray-500">
          {data.mentionCount} {data.mentionCount === 1 ? 'mención' : 'menciones'}
        </span>
      </div>
    </div>
  );
}

const nodeTypes = { entity: EntityNode };

// ─── Build nodes + edges from graph data ─────────────────────────────────────

function buildGraph(
  graph: EvidenceGraph,
  onNodeClick: (node: EvidenceGraphNode) => void,
): { nodes: Node[]; edges: Edge[] } {
  const rfNodes: Node[] = graph.nodes.map((n) => ({
    id: n.id,
    type: 'entity',
    data: { ...n, onClick: onNodeClick } as EntityNodeData,
    position: { x: 0, y: 0 },
  }));

  const rfEdges: Edge[] = graph.edges.map((e) => {
    const style = RELATION_STYLE[e.tipo] ?? RELATION_STYLE.MENCIONA;
    const bajaConfianza = e.confianza < UMBRAL_CONFIANZA_BAJA;
    return {
      id: e.id,
      source: e.sourceId,
      target: e.targetId,
      type: 'smoothstep',
      animated: !e.validadaCita,
      style: {
        stroke: style.color,
        strokeWidth: e.confirmadoPorAuditor ? 2.4 : 1.8,
        strokeDasharray: bajaConfianza ? '4 3' : undefined,
        opacity: bajaConfianza ? 0.5 : 1,
      },
      markerEnd: { type: MarkerType.ArrowClosed, color: style.color },
      label: `${style.label}${bajaConfianza ? ' · baja confianza' : ''}${e.confirmadoPorAuditor ? ' ✓' : ''}`,
      labelStyle: { fontSize: 9, fill: '#6b7280' },
      labelBgStyle: { fill: 'white', fillOpacity: 0.85 },
      labelBgPadding: [3, 1] as [number, number],
      labelBgBorderRadius: 3,
    };
  });

  return { nodes: layoutNodes(rfNodes, rfEdges), edges: rfEdges };
}

// ─── Main component ──────────────────────────────────────────────────────────

interface EvidenceGraphViewProps {
  auditId: string;
}

function EvidenceGraphInner({ auditId }: EvidenceGraphViewProps) {
  const router = useRouter();
  const { data, isLoading, error } = useAuditEvidenceGraph(auditId);
  const [selected, setSelected] = useState<EvidenceGraphNode | null>(null);
  const [fusionarConId, setFusionarConId] = useState('');
  const [errorFusion, setErrorFusion] = useState('');
  const mergeEntities = useMergeEntities(auditId);

  const { nodes, edges } = useMemo(() => {
    if (!data) return { nodes: [], edges: [] };
    return buildGraph(data, setSelected);
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
        <p className="text-sm text-gray-500">Construyendo el grafo de evidencia…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
        <p className="text-sm text-red-700 font-semibold">Error al cargar el grafo</p>
        <p className="text-xs text-red-600 mt-1">{(error as Error).message}</p>
      </div>
    );
  }

  if (!data || data.nodes.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-10 text-center">
        <Database className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-sm font-semibold text-gray-600">Aún no hay entidades en el grafo de evidencia</p>
        <p className="text-xs text-gray-400 mt-1">
          Captura evidencia de campo (nota, audio, foto o video) — las personas, cuentas, transacciones
          y demás entidades que la IA identifique aparecerán aquí conectadas.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Stats bar */}
      <div className="bg-white rounded-2xl border border-gray-200 px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 text-xs">
          <StatChip label="Entidades" value={data.stats.totalEntities} color="text-gray-700" />
          <StatChip label="Relaciones" value={data.stats.totalRelations} color="text-gray-700" />
          {data.stats.unvalidatedMentions > 0 && (
            <StatChip label="Citas sin verificar" value={data.stats.unvalidatedMentions} color="text-orange-600" />
          )}
        </div>

        <div className="flex items-center gap-3 text-[10px] text-gray-500 flex-wrap">
          {(Object.keys(RELATION_STYLE) as GraphRelationType[]).map((tipo) => (
            <Legend key={tipo} color={RELATION_STYLE[tipo].color} label={RELATION_STYLE[tipo].label} />
          ))}
          <span className="flex items-center gap-1">
            <span className="w-4 h-0.5 rounded-full border-t border-dashed border-gray-400" style={{ opacity: 0.5 }} />
            <span>Línea punteada = confianza baja (&lt;{Math.round(UMBRAL_CONFIANZA_BAJA * 100)}%)</span>
          </span>
        </div>
      </div>

      {/* Graph canvas */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden" style={{ height: 'calc(100vh - 280px)', minHeight: 500 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.2}
          maxZoom={1.8}
          proOptions={{ hideAttribution: true }}
          nodesDraggable
          elementsSelectable
        >
          <Background gap={16} size={1} color="#e5e7eb" />
          <Controls className="!bg-white !border !border-gray-200 !rounded-xl !shadow-sm" />
          <MiniMap
            nodeColor={(n) => {
              const d = n.data as unknown as EntityNodeData;
              return ENTITY_STYLE[d.tipo]?.dot ?? '#d1d5db';
            }}
            className="!bg-white !border !border-gray-200 !rounded-xl"
            pannable
            zoomable
          />
        </ReactFlow>
      </div>

      {/* Panel lateral de menciones */}
      {selected && (
        <div className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-white border-l border-gray-200 shadow-2xl flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase">{ENTITY_STYLE[selected.tipo]?.label}</p>
              <p className="text-sm font-bold text-gray-800">{selected.nombre}</p>
            </div>
            <button onClick={() => setSelected(null)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {selected.mentions.map((m) => (
              <div key={m.id} className="rounded-xl border border-gray-200 p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-medium text-gray-500">
                    {EVIDENCE_KIND_LABEL[m.evidenceKind] ?? m.evidenceKind} · {formatDate(m.capturedAt)}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    {m.confirmadoPorAuditor && (
                      <span className="flex items-center gap-1 text-[9px] font-semibold text-emerald-600">
                        <CheckCircle2 className="w-3 h-3" /> Confirmado por el auditor
                      </span>
                    )}
                    {!m.validadaCita && (
                      <span className="flex items-center gap-1 text-[9px] font-semibold text-orange-600">
                        <AlertTriangle className="w-3 h-3" /> Sin verificar
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-gray-700 italic">&ldquo;{m.citaTextual}&rdquo;</p>
                <button
                  onClick={() => router.push(`/dashboard/working-papers/${m.evidencePaperId}`)}
                  className="flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-700"
                >
                  <ExternalLink className="w-3 h-3" /> Ver evidencia
                </button>
              </div>
            ))}
          </div>

          {/* Fase 2a — fusión manual de entidades duplicadas */}
          <div className="border-t border-gray-100 p-5 space-y-2">
            <p className="text-[11px] font-semibold text-gray-600 flex items-center gap-1.5">
              <GitMerge className="w-3.5 h-3.5" /> ¿Es la misma entidad que otra ya en el grafo?
            </p>
            <select
              value={fusionarConId}
              onChange={(e) => { setFusionarConId(e.target.value); setErrorFusion(''); }}
              className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-gray-400"
            >
              <option value="">Elegir entidad destino…</option>
              {data.nodes
                .filter((n) => n.tipo === selected.tipo && n.id !== selected.id)
                .map((n) => (
                  <option key={n.id} value={n.id}>{n.nombre} ({n.mentionCount} menciones)</option>
                ))}
            </select>
            {errorFusion && <p className="text-[11px] text-red-600">{errorFusion}</p>}
            <button
              onClick={async () => {
                if (!fusionarConId) { setErrorFusion('Elige con cuál entidad fusionar.'); return; }
                try {
                  await mergeEntities.mutateAsync({ loserEntityId: selected.id, survivorEntityId: fusionarConId });
                  setSelected(null);
                  setFusionarConId('');
                } catch (e) {
                  setErrorFusion(e instanceof Error ? e.message : 'No se pudo fusionar.');
                }
              }}
              disabled={!fusionarConId || mergeEntities.isPending}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-gray-900 hover:bg-gray-800 disabled:opacity-40 rounded-lg px-3 py-1.5"
            >
              {mergeEntities.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitMerge className="w-3.5 h-3.5" />}
              Fusionar hacia la entidad elegida
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tiny helpers ────────────────────────────────────────────────────────────

function StatChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`font-bold ${color}`}>{value}</span>
      <span className="text-gray-500">{label}</span>
    </span>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="w-4 h-0.5 rounded-full" style={{ background: color }} />
      <span>{label}</span>
    </span>
  );
}

// ─── Public wrapper (ReactFlowProvider required) ─────────────────────────────

export function EvidenceGraphView({ auditId }: EvidenceGraphViewProps) {
  return (
    <ReactFlowProvider>
      <EvidenceGraphInner auditId={auditId} />
    </ReactFlowProvider>
  );
}
