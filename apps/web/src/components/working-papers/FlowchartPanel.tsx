'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Handle,
  Position,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  useReactFlow,
  type Node,
  type Edge,
  type NodeProps,
  type Connection,
  type NodeChange,
  type EdgeChange,
  MarkerType,
} from '@xyflow/react';
import { useRouter } from 'next/navigation';
import { Play, Square, Diamond, FileText, X, Link2, Unlink } from 'lucide-react';
import { useMentionIndex, useCreateReference, type MentionItem } from '@/hooks/useWorkingPaperGraph';

import '@xyflow/react/dist/style.css';

// ─── Persisted shape (lo que vive en PaperSection.value) ─────────────────────

export type FlowNodeKind = 'inicio_fin' | 'proceso' | 'decision' | 'documento';

export interface FlowchartLinkedPaper {
  paperId:      string;
  code:         string;
  title:        string;
  sectionKey?:  string;
  sectionLabel?: string;
}

export interface FlowchartNodeValue {
  id:     string;
  kind:   FlowNodeKind;
  label:  string;
  x:      number;
  y:      number;
  linkedPaper?: FlowchartLinkedPaper;
}

export interface FlowchartEdgeValue {
  id:     string;
  source: string;
  target: string;
}

export interface FlowchartValue {
  nodes: FlowchartNodeValue[];
  edges: FlowchartEdgeValue[];
}

interface Props {
  paperId:   string;
  auditId?:  string;
  sectionKey: string;
  value:     FlowchartValue | null;
  onChange:  (value: FlowchartValue) => void;
  readOnly?: boolean;
}

// ─── Node kind → apariencia ───────────────────────────────────────────────────

const KIND_META: Record<FlowNodeKind, { label: string; icon: typeof Play; addLabel: string }> = {
  inicio_fin: { label: 'Inicio / Fin', icon: Play,     addLabel: '+ Inicio/Fin' },
  proceso:    { label: 'Proceso',      icon: Square,   addLabel: '+ Proceso' },
  decision:   { label: 'Decisión',     icon: Diamond,  addLabel: '+ Decisión' },
  documento:  { label: 'Documento',    icon: FileText, addLabel: '+ Documento' },
};

function newNode(kind: FlowNodeKind, index: number): FlowchartNodeValue {
  return {
    id: `fn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    kind,
    label: KIND_META[kind].label,
    x: 60 + (index % 4) * 210,
    y: 40 + Math.floor(index / 4) * 130,
  };
}

// ─── Nodo custom ───────────────────────────────────────────────────────────────

type FlowNodeData = FlowchartNodeValue & {
  onLabelChange: (id: string, label: string) => void;
  onDelete:      (id: string) => void;
  onLink:        (id: string) => void;
  onUnlink:      (id: string) => void;
  onNavigate:    (paperId: string) => void;
  readOnly:      boolean;
  [key: string]: unknown;
};

const KIND_SHAPE_CLASS: Record<FlowNodeKind, string> = {
  inicio_fin: 'rounded-full bg-emerald-50 border-emerald-400',
  proceso:    'rounded-lg bg-blue-50 border-blue-400',
  decision:   'rounded-lg bg-amber-50 border-amber-400',
  documento:  'rounded-lg border-dashed bg-violet-50 border-violet-400',
};

function FlowNode({ data }: NodeProps<Node<FlowNodeData>>) {
  const meta = KIND_META[data.kind];
  const Icon = meta.icon;
  return (
    <div className={`border-2 shadow-sm ${KIND_SHAPE_CLASS[data.kind]} px-3 py-2 w-[180px] group relative`}>
      <Handle type="target" position={Position.Top}    className="!bg-gray-400 !w-2 !h-2 !border-0" />
      <Handle type="source" position={Position.Bottom} className="!bg-gray-400 !w-2 !h-2 !border-0" />

      {!data.readOnly && (
        <button
          onClick={() => data.onDelete(data.id)}
          className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-white border border-gray-300 text-gray-400 hover:text-red-600 hover:border-red-300 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
          title="Eliminar nodo"
        >
          <X className="w-3 h-3" />
        </button>
      )}

      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3.5 h-3.5 text-gray-500 shrink-0" />
        {data.readOnly ? (
          <span className="text-xs font-semibold text-gray-800 truncate">{data.label}</span>
        ) : (
          <input
            value={data.label}
            onChange={e => data.onLabelChange(data.id, e.target.value)}
            onMouseDown={e => e.stopPropagation()}
            className="text-xs font-semibold text-gray-800 bg-transparent outline-none min-w-0 flex-1 nodrag"
          />
        )}
      </div>

      {data.linkedPaper ? (
        <button
          onClick={() => data.onNavigate(data.linkedPaper!.paperId)}
          onMouseDown={e => e.stopPropagation()}
          className="flex items-center gap-1 text-[10px] font-mono text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-1.5 py-0.5 max-w-full truncate"
          title={`Ir a ${data.linkedPaper.title}`}
        >
          <Link2 className="w-2.5 h-2.5 shrink-0" />
          <span className="truncate">
            {data.linkedPaper.code}{data.linkedPaper.sectionLabel ? ` · ${data.linkedPaper.sectionLabel}` : ''}
          </span>
          {!data.readOnly && (
            <Unlink
              className="w-2.5 h-2.5 shrink-0 ml-0.5 text-indigo-400 hover:text-red-600"
              onClick={e => { e.stopPropagation(); data.onUnlink(data.id); }}
            />
          )}
        </button>
      ) : !data.readOnly ? (
        <button
          onClick={() => data.onLink(data.id)}
          onMouseDown={e => e.stopPropagation()}
          className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-indigo-600"
        >
          <Link2 className="w-2.5 h-2.5" /> Vincular a papel
        </button>
      ) : null}
    </div>
  );
}

const nodeTypes = { flow: FlowNode };

// ─── Selector de vínculo (popover simple) ─────────────────────────────────────

function LinkPicker({
  items, onPick, onClose,
}: { items: MentionItem[]; onPick: (item: MentionItem, sectionKey?: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const filtered = items.filter(i =>
    !query || i.code.toLowerCase().includes(query.toLowerCase()) || i.title.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[70vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-3 border-b border-gray-100">
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar papel por código o título…"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-indigo-400"
          />
        </div>
        <div className="overflow-y-auto flex-1 p-2 space-y-1">
          {filtered.map(item => (
            <div key={item.paperId} className="rounded-lg hover:bg-gray-50">
              <button
                onClick={() => onPick(item)}
                className="w-full text-left px-2.5 py-1.5 flex items-center justify-between gap-2"
              >
                <span className="text-xs font-mono font-bold text-gray-700">{item.code}</span>
                <span className="text-xs text-gray-500 truncate flex-1">{item.title}</span>
              </button>
              {item.sections.length > 0 && (
                <div className="pl-4 pb-1 flex flex-wrap gap-1">
                  {item.sections.map(s => (
                    <button
                      key={s.sectionKey}
                      onClick={() => onPick(item, s.sectionKey)}
                      className="text-[10px] text-gray-500 bg-gray-100 hover:bg-indigo-100 hover:text-indigo-700 rounded px-1.5 py-0.5"
                    >
                      {s.sectionKey} · {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-6">Sin resultados</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Panel principal ────────────────────────────────────────────────────────

function FlowchartPanelInner({ paperId, auditId, sectionKey, value, onChange, readOnly }: Props) {
  const router = useRouter();
  const { data: mentionItems } = useMentionIndex(auditId ?? '');
  const createReference = useCreateReference();
  const [linkingNodeId, setLinkingNodeId] = useState<string | null>(null);

  const stored: FlowchartValue = value ?? { nodes: [], edges: [] };

  const commit = useCallback((next: FlowchartValue) => onChange(next), [onChange]);

  const handleAddNode = useCallback((kind: FlowNodeKind) => {
    commit({ nodes: [...stored.nodes, newNode(kind, stored.nodes.length)], edges: stored.edges });
  }, [stored, commit]);

  const handleLabelChange = useCallback((id: string, label: string) => {
    commit({ nodes: stored.nodes.map(n => (n.id === id ? { ...n, label } : n)), edges: stored.edges });
  }, [stored, commit]);

  const handleDeleteNode = useCallback((id: string) => {
    commit({
      nodes: stored.nodes.filter(n => n.id !== id),
      edges: stored.edges.filter(e => e.source !== id && e.target !== id),
    });
  }, [stored, commit]);

  const handleUnlink = useCallback((id: string) => {
    commit({ nodes: stored.nodes.map(n => (n.id === id ? { ...n, linkedPaper: undefined } : n)), edges: stored.edges });
  }, [stored, commit]);

  const handlePick = useCallback((item: MentionItem, targetSectionKey?: string) => {
    if (!linkingNodeId) return;
    const section = targetSectionKey ? item.sections.find(s => s.sectionKey === targetSectionKey) : undefined;
    const linkedPaper: FlowchartLinkedPaper = {
      paperId: item.paperId, code: item.code, title: item.title,
      sectionKey: section?.sectionKey, sectionLabel: section?.label,
    };
    commit({ nodes: stored.nodes.map(n => (n.id === linkingNodeId ? { ...n, linkedPaper } : n)), edges: stored.edges });
    createReference.mutate({ paperId, sourceSectionKey: sectionKey, targetPaperId: item.paperId, targetSectionKey });
    setLinkingNodeId(null);
  }, [linkingNodeId, stored, commit, createReference, paperId, sectionKey]);

  const rfNodes: Node[] = useMemo(() => stored.nodes.map(n => ({
    id: n.id,
    type: 'flow',
    position: { x: n.x, y: n.y },
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
    data: {
      ...n, readOnly: !!readOnly,
      onLabelChange: handleLabelChange, onDelete: handleDeleteNode,
      onLink: setLinkingNodeId, onUnlink: handleUnlink,
      onNavigate: (pid: string) => router.push(`/dashboard/working-papers/${pid}`),
    } as FlowNodeData,
  })), [stored.nodes, readOnly, handleLabelChange, handleDeleteNode, handleUnlink, router]);

  const rfEdges: Edge[] = useMemo(() => stored.edges.map(e => ({
    id: e.id, source: e.source, target: e.target, type: 'smoothstep',
    style: { stroke: '#9ca3af', strokeWidth: 1.8 },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#9ca3af' },
  })), [stored.edges]);

  // `fitView` (prop de <ReactFlow>) solo ajusta el zoom/pan al MONTAR — un nodo
  // agregado después (botones "+ Inicio/Fin" etc.) puede quedar fuera del área
  // visible sin ningún aviso, dando la sensación de que "no pasó nada" aunque
  // sí se guardó (bug real detectado 2026-08-17: los clics del auditor SÍ
  // persistían el nodo nuevo, solo que no se veía). Se reajusta la vista cada
  // vez que cambia la CANTIDAD de nodos (agregar o borrar), no en cada drag.
  const { fitView } = useReactFlow();
  const prevNodeCount = useRef(stored.nodes.length);
  useEffect(() => {
    if (stored.nodes.length === prevNodeCount.current) return;
    prevNodeCount.current = stored.nodes.length;
    // Un solo requestAnimationFrame NO basta: React Flow mide cada nodo nuevo
    // vía ResizeObserver (el mismo mecanismo de fixes_and_lessons.md #20) y esa
    // medición corre en un ciclo posterior al primer paint — fitView() llamado
    // demasiado pronto calcula el encuadre con el nodo nuevo todavía en tamaño
    // 0, dejándolo fuera del área visible por un margen pequeño (verificado:
    // ~11px, exactamente el borde inferior del canvas). Un timeout corto le da
    // tiempo real al ResizeObserver de correr antes de reencuadrar.
    const t = setTimeout(() => {
      fitView({ padding: 0.3, duration: 300 });
    }, 60);
    return () => clearTimeout(t);
  }, [stored.nodes.length, fitView]);

  // `FlowchartPanel` es un componente 100% controlado (sin buffer/estado local:
  // `stored` es siempre el `value` que viene del papel) y sin actualización
  // optimista — el nodo nuevo solo aparece cuando termina el ciclo completo
  // guardar→refrescar. React Flow dispara `onNodesChange` con MÁS que cambios
  // del usuario: al montar un nodo nuevo lo mide vía ResizeObserver (mismo
  // mecanismo del fitView de arriba) y emite un `NodeChange` de tipo
  // 'dimensions' automáticamente, sin ninguna acción del usuario; un clic para
  // seleccionar emite 'select'. Sin filtrar, CUALQUIERA de esos dispara un
  // commit() con el `stored` de ese instante — si ese instante cae antes de
  // que el guardado real del usuario haya vuelto del servidor, este segundo
  // commit "eco" pisa esa escritura con una foto vieja: el nodo aparece unos
  // segundos y luego desaparece (bug real reportado en producción, 2026-08-17).
  // Solo 'remove' y el POSITION change de fin de arrastre (dragging:false)
  // representan una edición real que hay que persistir.
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const relevantes = changes.filter(c => c.type === 'remove' || (c.type === 'position' && c.dragging === false));
    if (relevantes.length === 0) return;

    const next = applyNodeChanges(changes, rfNodes);
    const posById = new Map(next.map(n => [n.id, n.position]));
    const removed = new Set(relevantes.filter(c => c.type === 'remove').map(c => c.id));
    if (removed.size > 0) {
      commit({ nodes: stored.nodes.filter(n => !removed.has(n.id)), edges: stored.edges.filter(e => !removed.has(e.source) && !removed.has(e.target)) });
      return;
    }
    commit({ nodes: stored.nodes.map(n => (posById.has(n.id) ? { ...n, x: posById.get(n.id)!.x, y: posById.get(n.id)!.y } : n)), edges: stored.edges });
  }, [rfNodes, stored, commit]);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    // Mismo motivo que onNodesChange — 'select' (clic para seleccionar una
    // arista) no debe disparar un guardado, solo 'remove' es una edición real.
    if (!changes.some(c => c.type === 'remove')) return;
    const next = applyEdgeChanges(changes, rfEdges);
    commit({ nodes: stored.nodes, edges: next.map(e => ({ id: e.id, source: e.source, target: e.target })) });
  }, [rfEdges, stored, commit]);

  const onConnect = useCallback((conn: Connection) => {
    const next = addEdge({ ...conn, id: `fe_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}` }, rfEdges);
    commit({ nodes: stored.nodes, edges: next.map(e => ({ id: e.id, source: e.source!, target: e.target! })) });
  }, [rfEdges, stored, commit]);

  return (
    <div className="space-y-2">
      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          {(Object.keys(KIND_META) as FlowNodeKind[]).map(kind => {
            const Icon = KIND_META[kind].icon;
            return (
              <button
                key={kind}
                onClick={() => handleAddNode(kind)}
                className="flex items-center gap-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 hover:border-indigo-300 hover:text-indigo-700"
              >
                <Icon className="w-3.5 h-3.5" /> {KIND_META[kind].addLabel}
              </button>
            );
          })}
          <span className="text-[11px] text-gray-400 self-center ml-1">
            Arrastre desde el borde de un nodo para conectar. Seleccione una arista y presione Supr para borrarla.
          </span>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden" style={{ height: 420 }}>
        {stored.nodes.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-gray-400">
            <Square className="w-8 h-8" />
            <p className="text-xs">{readOnly ? 'Sin flujograma documentado.' : 'Agregue el primer nodo con los botones de arriba.'}</p>
          </div>
        ) : (
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={nodeTypes}
            onNodesChange={readOnly ? undefined : onNodesChange}
            onEdgesChange={readOnly ? undefined : onEdgesChange}
            onConnect={readOnly ? undefined : onConnect}
            nodesDraggable={!readOnly}
            nodesConnectable={!readOnly}
            elementsSelectable
            deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            minZoom={0.4}
            maxZoom={1.8}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={16} size={1} color="#e5e7eb" />
            <Controls className="!bg-white !border !border-gray-200 !rounded-xl !shadow-sm" />
          </ReactFlow>
        )}
      </div>

      {linkingNodeId && (
        <LinkPicker
          items={mentionItems ?? []}
          onPick={handlePick}
          onClose={() => setLinkingNodeId(null)}
        />
      )}
    </div>
  );
}

export function FlowchartPanel(props: Props) {
  return (
    <ReactFlowProvider>
      <FlowchartPanelInner {...props} />
    </ReactFlowProvider>
  );
}
