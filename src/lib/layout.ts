import dagre from '@dagrejs/dagre';
import type { SimEdge } from '@/engine/models/types';
import type { PersistedNode } from '@/schemas/projectSchema';

const NODE_WIDTH = 220;
const NODE_HEIGHT = 112;

export function applyDagreLayout(
  nodes: readonly PersistedNode[],
  edges: readonly SimEdge[],
): PersistedNode[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 64, ranksep: 110, marginx: 40, marginy: 40 });

  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  return nodes.map((node) => {
    const pos = g.node(node.id) as { x: number; y: number } | undefined;
    if (!pos) return node;
    return {
      ...node,
      position: {
        x: Math.round(pos.x - NODE_WIDTH / 2),
        y: Math.round(pos.y - NODE_HEIGHT / 2),
      },
    };
  });
}
