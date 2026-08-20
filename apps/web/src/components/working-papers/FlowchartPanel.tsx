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
import { Play, Square, Diamond, FileText, ShieldCheck, X, Link2, Unlink, Tag } from 'lucide-react';
import { useMentionIndex, useCreateReference, usePaperSections, type MentionItem } from '@/hooks/useWorkingPaperGraph';

import '@xyflow/react/dist/style.css';

// ─── Persisted shape (lo que vive en PaperSection.value) ─────────────────────

// 'control' — Fase 2 del plan de Control Interno (docs/modelo-integrado-
// control-interno-analisis.md §8.9): marcador de control sobre el diagrama,
// mismo modelo de nodo que los demás, círculo pequeño en vez de forma de
// proceso. Nodos existentes con los 4 kinds originales no cambian.
export type FlowNodeKind = 'inicio_fin' | 'proceso' | 'decision' | 'documento' | 'control';

export interface FlowchartLinkedPaper {
  paperId:      string;
  code:         string;
  title:        string;
  sectionKey?:  string;
  sectionLabel?: string;
  /** Fila específica vinculada (típicamente PT-MRCI S1) — habilita el badge
   *  de Riesgo Residual. Snapshot al momento de vincular, mismo criterio que
   *  `code`/`title` arriba (no se re-consulta en vivo). */
  rowId?:         string;
  rowLabel?:      string;
  residualLevel?: string;
}

export interface FlowchartNodeValue {
  id:     string;
  kind:   FlowNodeKind;
  label:  string;
  x:      number;
  y:      number;
  /** Carril/área — Fase 2 (§8.9). Nodos sin `lane` se muestran en un carril
   *  único implícito, tanto en el editor como en el PDF — no rompe diagramas
   *  ya construidos. */
  lane?:  string;
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
  inicio_fin: { label: 'Inicio / Fin', icon: Play,       addLabel: '+ Inicio/Fin' },
  proceso:    { label: 'Proceso',      icon: Square,     addLabel: '+ Proceso' },
  decision:   { label: 'Decisión',     icon: Diamond,    addLabel: '+ Decisión' },
  documento:  { label: 'Documento',    icon: FileText,   addLabel: '+ Documento' },
  control:    { label: 'Control',      icon: ShieldCheck, addLabel: '+ Control' },
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

// Paleta estable por nombre de carril — mismo hash en el editor y en el PDF
// (Fase 7) para que el color de un carril no cambie entre ambos.
const LANE_PALETTE = [
  { bg: 'bg-sky-100 text-sky-700 border-sky-300' },
  { bg: 'bg-violet-100 text-violet-700 border-violet-300' },
  { bg: 'bg-rose-100 text-rose-700 border-rose-300' },
  { bg: 'bg-teal-100 text-teal-700 border-teal-300' },
  { bg: 'bg-orange-100 text-orange-700 border-orange-300' },
  { bg: 'bg-lime-100 text-lime-700 border-lime-300' },
];
function laneStyle(lane: string): string {
  let hash = 0;
  for (let i = 0; i < lane.length; i++) hash = (hash * 31 + lane.charCodeAt(i)) >>> 0;
  return LANE_PALETTE[hash % LANE_PALETTE.length].bg;
}

const RESIDUAL_DOT: Record<string, string> = {
  bajo: 'bg-emerald-500', moderado: 'bg-amber-500', alto: 'bg-orange-500', 'muy alto': 'bg-red-600',
};
function residualDotClass(level: string): string {
  const norm = level.toLowerCase().trim();
  return RESIDUAL_DOT[norm] ?? 'bg-gray-400';
}

// ─── Nodo custom ───────────────────────────────────────────────────────────────

type FlowNodeData = FlowchartNodeValue & {
  onLabelChange: (id: string, label: string) => void;
  onLaneChange:  (id: string, lane: string) => void;
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
  control:    'rounded-full bg-cyan-50 border-cyan-400',
};

/** Tag de carril — compacto, clic para asignar/renombrar (datalist con los
 *  carriles ya usados en este mismo diagrama, para no escribir el nombre dos
 *  veces). Se omite del todo si no hay carril y el nodo es de solo lectura. */
function LaneTag({ nodeId, lane, readOnly, onLaneChange }: {
  nodeId: string; lane?: string; readOnly: boolean; onLaneChange: (id: string, lane: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(lane ?? '');

  if (readOnly && !lane) return null;

  if (editing) {
    return (
      <input
        autoFocus
        list="flowchart-lanes"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { setEditing(false); onLaneChange(nodeId, draft.trim()); }}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setDraft(lane ?? ''); setEditing(false); } }}
        onMouseDown={e => e.stopPropagation()}
        placeholder="Carril…"
        className="text-[10px] border border-gray-200 rounded px-1 py-0.5 outline-none focus:border-indigo-400 w-full nodrag mt-1"
      />
    );
  }

  return (
    <button
      onClick={() => !readOnly && setEditing(true)}
      onMouseDown={e => e.stopPropagation()}
      disabled={readOnly}
      className={`mt-1 inline-flex items-center gap-1 text-[10px] font-medium rounded-full px-1.5 py-0.5 border max-w-full truncate ${
        lane ? laneStyle(lane) : 'text-gray-300 border-gray-200 border-dashed'
      }`}
      title={readOnly ? lane : 'Asignar carril/área'}
    >
      <Tag className="w-2.5 h-2.5 shrink-0" />
      <span className="truncate">{lane || 'Sin carril'}</span>
    </button>
  );
}

function FlowNode({ data }: NodeProps<Node<FlowNodeData>>) {
  const meta = KIND_META[data.kind];
  const Icon = meta.icon;

  // Buffer local para la etiqueta — el nodo es controlado por `stored.nodes`,
  // que solo se actualiza cuando vuelve el round-trip completo de guardar
  // (PATCH → invalidar caché → refetch). Escribir letra por letra directo
  // contra `data.label` deja cada tecla esperando ese round-trip antes de
  // pintarse: se siente "en cámara lenta" y, si el usuario teclea más rápido
  // de lo que tarda el guardado anterior en volver, cada onChange arma su
  // commit desde un `stored` todavía viejo — letras intermedias se pierden y
  // solo "gana" la última en aterrizar (bug real reportado en producción,
  // 2026-08-17). El buffer pinta cada tecla al instante y solo se envía al
  // backend cuando el usuario hace una pausa (debounce) o sale del campo —
  // un solo commit con el texto final, no una carrera de commits parciales.
  const [label, setLabel] = useState(data.label);
  const isEditingRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isEditingRef.current) setLabel(data.label);
  }, [data.label]);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const handleLabelInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    isEditingRef.current = true;
    setLabel(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => data.onLabelChange(data.id, value), 500);
  };

  const flushLabel = () => {
    isEditingRef.current = false;
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    if (label !== data.label) data.onLabelChange(data.id, label);
  };

  const residualDot = data.linkedPaper?.residualLevel ? (
    <span
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${residualDotClass(data.linkedPaper.residualLevel)}`}
      title={`Riesgo Residual: ${data.linkedPaper.residualLevel}`}
    />
  ) : null;

  // 'control' — marcador pequeño (§8.9): círculo compacto en vez de la
  // tarjeta rectangular de los demás kinds, mismo modelo de datos por debajo.
  if (data.kind === 'control') {
    return (
      <div className="group relative flex flex-col items-center" style={{ width: 84 }}>
        <Handle type="target" position={Position.Top}    className="!bg-gray-400 !w-2 !h-2 !border-0" />
        <Handle type="source" position={Position.Bottom} className="!bg-gray-400 !w-2 !h-2 !border-0" />

        {!data.readOnly && (
          <button
            onClick={() => data.onDelete(data.id)}
            className="absolute -top-1 -right-1 z-10 w-4 h-4 rounded-full bg-white border border-gray-300 text-gray-400 hover:text-red-600 hover:border-red-300 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
            title="Eliminar nodo"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        )}

        <div className={`relative border-2 shadow-sm ${KIND_SHAPE_CLASS.control} w-11 h-11 flex items-center justify-center`}>
          <Icon className="w-4 h-4 text-cyan-700" />
          {residualDot && <span className="absolute -bottom-0.5 -right-0.5">{residualDot}</span>}
        </div>

        {data.readOnly ? (
          <span className="text-[10px] font-medium text-gray-600 text-center leading-tight mt-1 line-clamp-2">{data.label}</span>
        ) : (
          <input
            value={label}
            onChange={handleLabelInput}
            onBlur={flushLabel}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            onMouseDown={e => e.stopPropagation()}
            className="text-[10px] font-medium text-gray-600 text-center bg-transparent outline-none w-full nodrag mt-1"
          />
        )}

        <LaneTag nodeId={data.id} lane={data.lane} readOnly={data.readOnly} onLaneChange={data.onLaneChange} />

        {data.linkedPaper ? (
          <button
            onClick={() => data.onNavigate(data.linkedPaper!.paperId)}
            onMouseDown={e => e.stopPropagation()}
            className="mt-1 flex items-center gap-0.5 text-[9px] font-mono text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-1 py-0.5 max-w-full truncate"
            title={`Ir a ${data.linkedPaper.title}${data.linkedPaper.rowLabel ? ' — ' + data.linkedPaper.rowLabel : ''}`}
          >
            <Link2 className="w-2 h-2 shrink-0" />
            <span className="truncate">{data.linkedPaper.code}</span>
            {!data.readOnly && (
              <Unlink className="w-2 h-2 shrink-0 ml-0.5 text-indigo-400 hover:text-red-600" onClick={e => { e.stopPropagation(); data.onUnlink(data.id); }} />
            )}
          </button>
        ) : !data.readOnly ? (
          <button onClick={() => data.onLink(data.id)} onMouseDown={e => e.stopPropagation()} className="mt-1 text-gray-300 hover:text-indigo-600">
            <Link2 className="w-2.5 h-2.5" />
          </button>
        ) : null}
      </div>
    );
  }

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
            value={label}
            onChange={handleLabelInput}
            onBlur={flushLabel}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            onMouseDown={e => e.stopPropagation()}
            className="text-xs font-semibold text-gray-800 bg-transparent outline-none min-w-0 flex-1 nodrag"
          />
        )}
      </div>

      <LaneTag nodeId={data.id} lane={data.lane} readOnly={data.readOnly} onLaneChange={data.onLaneChange} />

      {data.linkedPaper ? (
        <button
          onClick={() => data.onNavigate(data.linkedPaper!.paperId)}
          onMouseDown={e => e.stopPropagation()}
          className="mt-1 flex items-center gap-1 text-[10px] font-mono text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-1.5 py-0.5 max-w-full truncate"
          title={`Ir a ${data.linkedPaper.title}${data.linkedPaper.rowLabel ? ' — ' + data.linkedPaper.rowLabel : ''}`}
        >
          {residualDot}
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
          className="mt-1 flex items-center gap-1 text-[10px] text-gray-400 hover:text-indigo-600"
        >
          <Link2 className="w-2.5 h-2.5" /> Vincular a papel
        </button>
      ) : null}
    </div>
  );
}

const nodeTypes = { flow: FlowNode };

// ─── Selector de fila — solo cuando se vincula a PT-MRCI (badge de Residual) ──
// Fase 2 (§8.9): vincular un nodo a una fila concreta de PT-MRCI S1 en vez de
// solo al papel, para poder mostrar el badge de color por Riesgo Residual.
// Snapshot al vincular (rowLabel/residualLevel), no lectura en vivo — mismo
// criterio que `code`/`title` de FlowchartLinkedPaper.

function findColumn(row: Record<string, unknown>, patterns: RegExp[]): string | undefined {
  const keys = Object.keys(row);
  for (const p of patterns) {
    const k = keys.find(k => p.test(k.toLowerCase()));
    if (k) return k;
  }
  return undefined;
}

function RowPicker({ paperId, sectionKey, onPick, onClose }: {
  paperId: string; sectionKey: string;
  onPick: (row: { rowId: string; rowLabel: string; residualLevel?: string }) => void;
  onClose: () => void;
}) {
  const { data: sections, isLoading } = usePaperSections(paperId);
  const section = sections?.find(s => s.sectionKey === sectionKey);
  const rows = Array.isArray(section?.value) ? (section!.value as Record<string, unknown>[]) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[70vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-3 border-b border-gray-100 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700">Vincular a una fila de {section?.label ?? sectionKey}</p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-2 space-y-1">
          {isLoading && <p className="text-xs text-gray-400 text-center py-6">Cargando…</p>}
          {!isLoading && rows.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-6">Esta sección todavía no tiene filas.</p>
          )}
          {rows.map((row, idx) => {
            const riesgoCol = findColumn(row, [/^riesgo$/, /descripcion/]);
            const residualCol = findColumn(row, [/riesgo residual/]);
            const label = riesgoCol ? String(row[riesgoCol] ?? '').trim() : `Fila ${idx + 1}`;
            const residual = residualCol ? String(row[residualCol] ?? '').trim() : undefined;
            return (
              <button
                key={idx}
                onClick={() => onPick({ rowId: String(idx), rowLabel: label.slice(0, 80), residualLevel: residual || undefined })}
                className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-gray-50 flex items-center justify-between gap-2"
              >
                <span className="text-xs text-gray-700 truncate flex-1">{label}</span>
                {residual && (
                  <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-medium rounded-full px-1.5 py-0.5 ${residualDotClass(residual)} bg-opacity-15 text-gray-700`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${residualDotClass(residual)}`} />
                    {residual}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

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
  // Paso intermedio, solo cuando el papel elegido es PT-MRCI: pedir además la
  // fila concreta antes de confirmar el vínculo (habilita el badge de Residual).
  const [rowPickerTarget, setRowPickerTarget] = useState<{ item: MentionItem; sectionKey: string } | null>(null);

  const stored: FlowchartValue = value ?? { nodes: [], edges: [] };
  const knownLanes = useMemo(
    () => [...new Set(stored.nodes.map(n => n.lane).filter((l): l is string => !!l))],
    [stored.nodes],
  );

  const commit = useCallback((next: FlowchartValue) => onChange(next), [onChange]);

  const handleAddNode = useCallback((kind: FlowNodeKind) => {
    commit({ nodes: [...stored.nodes, newNode(kind, stored.nodes.length)], edges: stored.edges });
  }, [stored, commit]);

  const handleLabelChange = useCallback((id: string, label: string) => {
    commit({ nodes: stored.nodes.map(n => (n.id === id ? { ...n, label } : n)), edges: stored.edges });
  }, [stored, commit]);

  const handleLaneChange = useCallback((id: string, lane: string) => {
    commit({ nodes: stored.nodes.map(n => (n.id === id ? { ...n, lane: lane || undefined } : n)), edges: stored.edges });
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

  const applyLink = useCallback((linkedPaper: FlowchartLinkedPaper, targetSectionKey?: string) => {
    if (!linkingNodeId) return;
    commit({ nodes: stored.nodes.map(n => (n.id === linkingNodeId ? { ...n, linkedPaper } : n)), edges: stored.edges });
    createReference.mutate({ paperId, sourceSectionKey: sectionKey, targetPaperId: linkedPaper.paperId, targetSectionKey });
    setLinkingNodeId(null);
  }, [linkingNodeId, stored, commit, createReference, paperId, sectionKey]);

  const handlePick = useCallback((item: MentionItem, targetSectionKey?: string) => {
    if (!linkingNodeId) return;
    // PT-MRCI + una sección elegida → pedir la fila específica antes de
    // confirmar (es el papel de donde sale el badge de Riesgo Residual).
    if (item.paperCode === 'PT-MRCI' && targetSectionKey) {
      setRowPickerTarget({ item, sectionKey: targetSectionKey });
      return;
    }
    const section = targetSectionKey ? item.sections.find(s => s.sectionKey === targetSectionKey) : undefined;
    applyLink({
      paperId: item.paperId, code: item.code, title: item.title,
      sectionKey: section?.sectionKey, sectionLabel: section?.label,
    }, targetSectionKey);
  }, [linkingNodeId, applyLink]);

  const handleRowPick = useCallback((row: { rowId: string; rowLabel: string; residualLevel?: string }) => {
    if (!rowPickerTarget) return;
    const { item, sectionKey: targetSectionKey } = rowPickerTarget;
    const section = item.sections.find(s => s.sectionKey === targetSectionKey);
    applyLink({
      paperId: item.paperId, code: item.code, title: item.title,
      sectionKey: section?.sectionKey, sectionLabel: section?.label,
      rowId: row.rowId, rowLabel: row.rowLabel, residualLevel: row.residualLevel,
    }, targetSectionKey);
    setRowPickerTarget(null);
  }, [rowPickerTarget, applyLink]);

  const rfNodes: Node[] = useMemo(() => stored.nodes.map(n => ({
    id: n.id,
    type: 'flow',
    position: { x: n.x, y: n.y },
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
    data: {
      ...n, readOnly: !!readOnly,
      onLabelChange: handleLabelChange, onLaneChange: handleLaneChange, onDelete: handleDeleteNode,
      onLink: setLinkingNodeId, onUnlink: handleUnlink,
      onNavigate: (pid: string) => router.push(`/dashboard/working-papers/${pid}`),
    } as FlowNodeData,
  })), [stored.nodes, readOnly, handleLabelChange, handleLaneChange, handleDeleteNode, handleUnlink, router]);

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

      <datalist id="flowchart-lanes">
        {knownLanes.map(l => <option key={l} value={l} />)}
      </datalist>

      {linkingNodeId && (
        <LinkPicker
          items={mentionItems ?? []}
          onPick={handlePick}
          onClose={() => setLinkingNodeId(null)}
        />
      )}

      {rowPickerTarget && (
        <RowPicker
          paperId={rowPickerTarget.item.paperId}
          sectionKey={rowPickerTarget.sectionKey}
          onPick={handleRowPick}
          onClose={() => { setRowPickerTarget(null); setLinkingNodeId(null); }}
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
