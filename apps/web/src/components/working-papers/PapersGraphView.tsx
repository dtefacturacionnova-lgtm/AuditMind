'use client';

import { useMemo, useCallback } from 'react';
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
import dagre from '@dagrejs/dagre';
import { useRouter } from 'next/navigation';
import {
  FileText, Database, Sparkles, Activity, Paperclip,
  CheckCircle2, AlertTriangle, Clock, Loader2,
} from 'lucide-react';
import { useAuditPapersGraph, type GraphNode, type AuditGraph } from '@/hooks/useAuditPapersGraph';

import '@xyflow/react/dist/style.css';

// ─── Helpers — visual mapping ────────────────────────────────────────────────

const WP_KIND_STYLE: Record<string, { bg: string; border: string; icon: typeof FileText; label: string }> = {
  STANDARD: { bg: 'bg-gray-50',    border: 'border-gray-300',    icon: FileText, label: 'Estándar' },
  SMART:    { bg: 'bg-blue-50',    border: 'border-blue-400',    icon: Database, label: 'Inteligente' },
  MASTER:   { bg: 'bg-violet-50',  border: 'border-violet-500',  icon: Sparkles, label: 'Maestro' },
  LIVE:     { bg: 'bg-emerald-50', border: 'border-emerald-500', icon: Activity, label: 'Vivo' },
  FILE:     { bg: 'bg-amber-50',   border: 'border-amber-400',   icon: Paperclip, label: 'Archivo' },
};

const SYNC_STYLE: Record<string, { dot: string; label: string; iconColor: string; Icon: typeof CheckCircle2 }> = {
  DRAFT:        { dot: 'bg-gray-400',   label: 'Borrador',      iconColor: 'text-gray-400',   Icon: Clock },
  SYNCED:       { dot: 'bg-emerald-500', label: 'Sincronizado',  iconColor: 'text-emerald-600', Icon: CheckCircle2 },
  STALE:        { dot: 'bg-orange-500',  label: 'Desactualizado', iconColor: 'text-orange-600', Icon: AlertTriangle },
  REGENERATING: { dot: 'bg-blue-500 animate-pulse', label: 'Regenerando…', iconColor: 'text-blue-500', Icon: Loader2 },
};

// ─── Custom node ──────────────────────────────────────────────────────────────

type PaperNodeData = GraphNode & {
  onClick: (paperId: string) => void;
  [key: string]: unknown; // required by React Flow Node generic constraint
};

function PaperNode({ data }: NodeProps<Node<PaperNodeData>>) {
  const kindStyle = WP_KIND_STYLE[data.wpKind] ?? WP_KIND_STYLE.STANDARD;
  const syncStyle = SYNC_STYLE[data.syncStatus] ?? SYNC_STYLE.DRAFT;
  const KindIcon = kindStyle.icon;
  const SyncIcon = syncStyle.Icon;

  return (
    <div
      onClick={() => data.onClick(data.id)}
      className={`${kindStyle.bg} ${kindStyle.border} border-2 rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer w-[200px] overflow-hidden`}
    >
      <Handle type="target" position={Position.Top}    className="!bg-gray-400 !w-2 !h-2 !border-0" />
      <Handle type="source" position={Position.Bottom} className="!bg-gray-400 !w-2 !h-2 !border-0" />

      {/* Header */}
      <div className="flex items-center justify-between px-2.5 py-1.5 bg-white/60 border-b border-current/10">
        <div className="flex items-center gap-1.5 min-w-0">
          <KindIcon className="w-3.5 h-3.5 shrink-0 text-gray-700" />
          <span className="text-[10px] font-mono font-bold text-gray-700 truncate">
            {data.paperCode ?? data.code}
          </span>
        </div>
        <span className={`w-2 h-2 rounded-full ${syncStyle.dot}`} title={syncStyle.label} />
      </div>

      {/* Title */}
      <div className="px-2.5 py-2">
        <p className="text-[11px] font-semibold text-gray-800 leading-tight line-clamp-2">
          {data.title}
        </p>
      </div>

      {/* Footer: stats */}
      <div className="px-2.5 pb-1.5 flex items-center justify-between gap-1">
        <div className="flex items-center gap-1">
          <SyncIcon className={`w-2.5 h-2.5 ${syncStyle.iconColor} ${data.syncStatus === 'REGENERATING' ? 'animate-spin' : ''}`} />
          <span className="text-[9px] text-gray-500">{syncStyle.label}</span>
        </div>

        {data.staleCount > 0 && (
          <span
            className="text-[9px] font-bold text-orange-700 bg-orange-100 border border-orange-200 px-1.5 py-0.5 rounded-full"
            title={`${data.staleCount} sección(es) desactualizada(s)`}
          >
            {data.staleCount} ⚠
          </span>
        )}

        {data.staleCount === 0 && (data.inDegree > 0 || data.outDegree > 0) && (
          <span className="text-[9px] text-gray-400">
            {data.inDegree > 0 && `↓${data.inDegree}`}
            {data.inDegree > 0 && data.outDegree > 0 && ' '}
            {data.outDegree > 0 && `↑${data.outDegree}`}
          </span>
        )}
      </div>
    </div>
  );
}

const nodeTypes = { paper: PaperNode };

// ─── Layout — Dagre auto top-down ────────────────────────────────────────────

const NODE_W = 200;
const NODE_H = 90;

function layoutNodes(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 36, ranksep: 60, marginx: 24, marginy: 24 });

  nodes.forEach(n => g.setNode(n.id, { width: NODE_W, height: NODE_H }));
  edges.forEach(e => g.setEdge(e.source, e.target));

  dagre.layout(g);

  return nodes.map(n => {
    const pos = g.node(n.id);
    return {
      ...n,
      position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 },
      targetPosition: Position.Top,
      sourcePosition: Position.Bottom,
    };
  });
}

// ─── Build nodes + edges from graph data ─────────────────────────────────────

function buildGraph(graph: AuditGraph, onNodeClick: (paperId: string) => void): { nodes: Node[]; edges: Edge[] } {
  const rfNodes: Node[] = graph.nodes.map(n => ({
    id:   n.id,
    type: 'paper',
    data: { ...n, onClick: onNodeClick } as PaperNodeData,
    position: { x: 0, y: 0 }, // will be set by dagre
  }));

  const rfEdges: Edge[] = graph.edges.map(e => {
    const isAI       = e.mappingType === 'AI_GENERATED';
    const isAggregated = e.mappingType === 'AGGREGATED';
    return {
      id:       e.id,
      source:   e.sourceId,
      target:   e.targetId,
      type:     'smoothstep',
      animated: isAI,
      style: {
        stroke: isAI ? '#a78bfa' : isAggregated ? '#60a5fa' : '#9ca3af',
        strokeWidth: 1.8,
      },
      markerEnd: {
        type:  MarkerType.ArrowClosed,
        color: isAI ? '#a78bfa' : isAggregated ? '#60a5fa' : '#9ca3af',
      },
      label: `${e.sourceField} → ${e.targetField}`,
      labelStyle: { fontSize: 9, fill: '#6b7280' },
      labelBgStyle: { fill: 'white', fillOpacity: 0.85 },
      labelBgPadding: [3, 1] as [number, number],
      labelBgBorderRadius: 3,
    };
  });

  return { nodes: layoutNodes(rfNodes, rfEdges), edges: rfEdges };
}

// ─── Main component ──────────────────────────────────────────────────────────

interface PapersGraphViewProps {
  auditId: string;
}

function PapersGraphInner({ auditId }: PapersGraphViewProps) {
  const router = useRouter();
  const { data, isLoading, error } = useAuditPapersGraph(auditId);

  const onNodeClick = useCallback((paperId: string) => {
    router.push(`/dashboard/working-papers/${paperId}`);
  }, [router]);

  const { nodes, edges } = useMemo(() => {
    if (!data) return { nodes: [], edges: [] };
    return buildGraph(data, onNodeClick);
  }, [data, onNodeClick]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
        <p className="text-sm text-gray-500">Construyendo el grafo de conocimiento…</p>
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
        <p className="text-sm font-semibold text-gray-600">No hay papeles aún en esta auditoría</p>
        <p className="text-xs text-gray-400 mt-1">
          Crea papeles SMART y MASTER, vincúlalos, y verás aquí el grafo de conocimiento.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Stats bar */}
      <div className="bg-white rounded-2xl border border-gray-200 px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 text-xs">
          <StatChip label="Papeles" value={data.stats.totalPapers} color="text-gray-700" />
          <StatChip label="Vínculos" value={data.stats.totalLinks} color="text-gray-700" />
          <span className="w-px h-4 bg-gray-200" />
          <StatChip label="SMART" value={data.stats.smartPapers} color="text-blue-600" />
          <StatChip label="MASTER" value={data.stats.masterPapers} color="text-violet-600" />
          <span className="w-px h-4 bg-gray-200" />
          <StatChip label="Sincronizados" value={data.stats.syncedPapers} color="text-emerald-600" />
          {data.stats.stalePapers > 0 && (
            <StatChip label="Desactualizados" value={data.stats.stalePapers} color="text-orange-600" />
          )}
        </div>

        <div className="flex items-center gap-3 text-[10px] text-gray-500">
          <Legend color="#9ca3af" label="Directo" />
          <Legend color="#60a5fa" label="Agregado" />
          <Legend color="#a78bfa" label="IA" />
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
              const d = n.data as unknown as PaperNodeData;
              if (d.syncStatus === 'STALE') return '#fb923c';
              if (d.syncStatus === 'REGENERATING') return '#60a5fa';
              if (d.wpKind === 'MASTER') return '#a78bfa';
              if (d.wpKind === 'SMART')  return '#60a5fa';
              if (d.wpKind === 'LIVE')   return '#34d399';
              return '#d1d5db';
            }}
            className="!bg-white !border !border-gray-200 !rounded-xl"
            pannable
            zoomable
          />
        </ReactFlow>
      </div>
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

export function PapersGraphView({ auditId }: PapersGraphViewProps) {
  return (
    <ReactFlowProvider>
      <PapersGraphInner auditId={auditId} />
    </ReactFlowProvider>
  );
}
