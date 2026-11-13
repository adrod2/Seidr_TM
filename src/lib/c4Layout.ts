import ELK from 'elkjs/lib/elk.bundled.js';

export interface LayoutNode {
  id: string;
  width: number;
  height: number;
  c4Type?: string;
}

export interface LayoutEdge {
  source: string;
  target: string;
}

export type Point = { x: number; y: number };
export type Positions = Record<string, Point>;

export const LAYOUT_MODES = [
  { id: 'layered-down', label: 'Layered (top → bottom)' },
  { id: 'layered-right', label: 'Layered (left → right)' },
  { id: 'tiered', label: 'Tiered by C4 type' },
  { id: 'radial', label: 'Radial (hub-centred)' },
  { id: 'organic', label: 'Organic (force-directed)' },
  { id: 'grid', label: 'Compact grid by type' },
] as const;

export type LayoutModeId = typeof LAYOUT_MODES[number]['id'];

export const MIN_GAP = 48;

const TIER: Record<string, number> = { Person: 0, System: 1, Container: 1, Component: 2, Database: 3 };
const tierOf = (node: LayoutNode) => TIER[node.c4Type || 'Container'] ?? 1;

let elkInstance: InstanceType<typeof ELK> | null = null;
const elk = () => (elkInstance ??= new ELK());

const BASE_LAYERED = {
  'elk.algorithm': 'layered',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.spacing.nodeNode': '70',
  'elk.layered.spacing.nodeNodeBetweenLayers': '110',
  'elk.spacing.edgeNode': '40',
  'elk.spacing.componentComponent': '90',
  'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
};

const validEdges = (nodes: LayoutNode[], edges: LayoutEdge[]) => {
  const ids = new Set(nodes.map((n) => n.id));
  const seen = new Set<string>();
  return edges.filter((e) => {
    const key = `${e.source}->${e.target}`;
    if (!ids.has(e.source) || !ids.has(e.target) || e.source === e.target || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

async function runElk(nodes: LayoutNode[], edges: LayoutEdge[], options: Record<string, string>,
  nodeOptions?: (node: LayoutNode) => Record<string, string>): Promise<Positions> {
  const graph = await elk().layout({
    id: 'root',
    layoutOptions: options,
    children: nodes.map((n) => ({ id: n.id, width: n.width, height: n.height, layoutOptions: nodeOptions?.(n) })),
    edges: validEdges(nodes, edges).map((e, i) => ({ id: `e${i}`, sources: [e.source], targets: [e.target] })),
  });
  const positions: Positions = {};
  for (const child of graph.children || []) positions[child.id] = { x: child.x || 0, y: child.y || 0 };
  return positions;
}

function radialLayout(nodes: LayoutNode[], edges: LayoutEdge[]): Positions {
  const adjacency = new Map(nodes.map((n) => [n.id, new Set<string>()]));
  for (const e of validEdges(nodes, edges)) {
    adjacency.get(e.source)!.add(e.target);
    adjacency.get(e.target)!.add(e.source);
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const hub = [...nodes].sort((a, b) => adjacency.get(b.id)!.size - adjacency.get(a.id)!.size || tierOf(a) - tierOf(b))[0];
  const depth = new Map<string, number>([[hub.id, 0]]);
  const queue = [hub.id];
  while (queue.length) {
    const id = queue.shift()!;
    for (const next of adjacency.get(id)!) {
      if (!depth.has(next)) {
        depth.set(next, depth.get(id)! + 1);
        queue.push(next);
      }
    }
  }
  const maxDepth = Math.max(0, ...depth.values());
  for (const n of nodes) if (!depth.has(n.id)) depth.set(n.id, maxDepth + 1);

  const rings: string[][] = [];
  for (const [id, d] of depth) (rings[d] ??= []).push(id);
  const positions: Positions = {};
  const center = byId.get(hub.id)!;
  positions[hub.id] = { x: -center.width / 2, y: -center.height / 2 };
  let radius = 0;
  let previousExtent = Math.hypot(center.width, center.height) / 2;
  rings.forEach((ring, d) => {
    if (d === 0 || !ring?.length) return;
    ring.sort((a, b) => tierOf(byId.get(a)!) - tierOf(byId.get(b)!) || a.localeCompare(b));
    const maxDiag = Math.max(...ring.map((id) => Math.hypot(byId.get(id)!.width, byId.get(id)!.height)));
    // Ring must clear the previous ring and leave room for every node on its circumference.
    radius = Math.max(radius + previousExtent + maxDiag / 2 + MIN_GAP,
      (ring.length * (maxDiag + MIN_GAP)) / (2 * Math.PI));
    previousExtent = maxDiag / 2;
    ring.forEach((id, i) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * i) / ring.length + (d % 2 ? 0 : Math.PI / ring.length);
      const n = byId.get(id)!;
      positions[id] = { x: Math.cos(angle) * radius - n.width / 2, y: Math.sin(angle) * radius - n.height / 2 };
    });
  });
  return positions;
}

function gridLayout(nodes: LayoutNode[]): Positions {
  const sorted = [...nodes].sort((a, b) => tierOf(a) - tierOf(b) || a.id.localeCompare(b.id));
  const columns = Math.max(1, Math.ceil(Math.sqrt(sorted.length * 1.6)));
  const cellW = Math.max(...sorted.map((n) => n.width)) + MIN_GAP * 1.5;
  const positions: Positions = {};
  let y = 0;
  for (let row = 0; row * columns < sorted.length; row++) {
    const items = sorted.slice(row * columns, (row + 1) * columns);
    const rowH = Math.max(...items.map((n) => n.height));
    const offset = ((columns - items.length) * cellW) / 2;
    items.forEach((n, col) => {
      positions[n.id] = { x: offset + col * cellW + (cellW - MIN_GAP * 1.5 - n.width) / 2, y: y + (rowH - n.height) / 2 };
    });
    y += rowH + MIN_GAP * 1.5;
  }
  return positions;
}

export const overlaps = (a: Point, an: LayoutNode, b: Point, bn: LayoutNode, gap = MIN_GAP) =>
  a.x < b.x + bn.width + gap && b.x < a.x + an.width + gap &&
  a.y < b.y + bn.height + gap && b.y < a.y + an.height + gap;

export function hasOverlaps(nodes: LayoutNode[], positions: Positions, gap = MIN_GAP) {
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (overlaps(positions[nodes[i].id], nodes[i], positions[nodes[j].id], nodes[j], gap)) return true;
    }
  }
  return false;
}

/** Pushes nodes apart along the axis of least penetration until no two boxes (plus gap) intersect. */
export function removeOverlaps(nodes: LayoutNode[], input: Positions, gap = MIN_GAP): Positions {
  const positions: Positions = Object.fromEntries(nodes.map((n) => [n.id, { ...(input[n.id] || { x: 0, y: 0 }) }]));
  for (let iteration = 0; iteration < 400; iteration++) {
    let moved = false;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const [a, b] = [nodes[i], nodes[j]];
        const [pa, pb] = [positions[a.id], positions[b.id]];
        if (!overlaps(pa, a, pb, b, gap)) continue;
        const dx = (pb.x + b.width / 2) - (pa.x + a.width / 2);
        const dy = (pb.y + b.height / 2) - (pa.y + a.height / 2);
        const overlapX = (a.width + b.width) / 2 + gap - Math.abs(dx);
        const overlapY = (a.height + b.height) / 2 + gap - Math.abs(dy);
        if (overlapX < overlapY) {
          const shift = (overlapX / 2 + 1) * (dx < 0 || (dx === 0 && i % 2) ? -1 : 1);
          pa.x -= shift;
          pb.x += shift;
        } else {
          const shift = (overlapY / 2 + 1) * (dy < 0 || (dy === 0 && i % 2) ? -1 : 1);
          pa.y -= shift;
          pb.y += shift;
        }
        moved = true;
      }
    }
    if (!moved) return positions;
  }
  return hasOverlaps(nodes, positions, gap) ? gridLayout(nodes) : positions;
}

export async function computeLayout(mode: LayoutModeId, nodes: LayoutNode[], edges: LayoutEdge[]): Promise<Positions> {
  if (!nodes.length) return {};
  let positions: Positions;
  switch (mode) {
    case 'layered-down':
      positions = await runElk(nodes, edges, { ...BASE_LAYERED, 'elk.direction': 'DOWN' });
      break;
    case 'layered-right':
      positions = await runElk(nodes, edges, { ...BASE_LAYERED, 'elk.direction': 'RIGHT', 'elk.layered.spacing.nodeNodeBetweenLayers': '140' });
      break;
    case 'tiered':
      positions = await runElk(nodes, edges, { ...BASE_LAYERED, 'elk.direction': 'DOWN', 'elk.partitioning.activate': 'true' },
        (n) => ({ 'elk.partitioning.partition': String(tierOf(n)) }));
      break;
    case 'organic':
      positions = await runElk(nodes, edges, {
        'elk.algorithm': 'stress',
        'elk.stress.desiredEdgeLength': String(Math.max(...nodes.map((n) => n.width)) + 160),
        'elk.spacing.nodeNode': '80',
      });
      break;
    case 'radial':
      positions = radialLayout(nodes, edges);
      break;
    case 'grid':
    default:
      positions = gridLayout(nodes);
  }
  const clean = removeOverlaps(nodes, positions);
  // Normalise so the diagram starts at the origin regardless of algorithm.
  const minX = Math.min(...Object.values(clean).map((p) => p.x));
  const minY = Math.min(...Object.values(clean).map((p) => p.y));
  return Object.fromEntries(Object.entries(clean).map(([id, p]) => [id, { x: Math.round(p.x - minX), y: Math.round(p.y - minY) }]));
}
