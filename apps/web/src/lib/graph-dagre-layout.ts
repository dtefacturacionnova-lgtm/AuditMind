import dagre from '@dagrejs/dagre';
import { Position, type Node, type Edge } from '@xyflow/react';

// Layout genérico top-down para cualquier grafo de React Flow — extraído de
// PapersGraphView.tsx (grafo de papeles) para reutilizarse también en
// EvidenceGraphView.tsx (grafo de evidencia, Fase 1) sin duplicar la función.
export function layoutNodes(
  nodes: Node[],
  edges: Edge[],
  opts?: { nodeW?: number; nodeH?: number },
): Node[] {
  const nodeW = opts?.nodeW ?? 200;
  const nodeH = opts?.nodeH ?? 90;

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 36, ranksep: 60, marginx: 24, marginy: 24 });

  nodes.forEach((n) => g.setNode(n.id, { width: nodeW, height: nodeH }));
  edges.forEach((e) => g.setEdge(e.source, e.target));

  dagre.layout(g);

  return nodes.map((n) => {
    const pos = g.node(n.id);
    return {
      ...n,
      position: { x: pos.x - nodeW / 2, y: pos.y - nodeH / 2 },
      targetPosition: Position.Top,
      sourcePosition: Position.Bottom,
    };
  });
}
