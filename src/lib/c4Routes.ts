export interface DiagramPoint { x: number; y: number }
export interface DiagramBox extends DiagramPoint { width: number; height: number }
type Side = 'top' | 'right' | 'bottom' | 'left';
export interface DiagramPort extends DiagramPoint { side: Side }
const GAP = 18;
const inside = (point: DiagramPoint, box: DiagramBox) => point.x > box.x && point.x < box.x + box.width
  && point.y > box.y && point.y < box.y + box.height;

export const segmentBlocked = (a: DiagramPoint, b: DiagramPoint, boxes: DiagramBox[]) => boxes.some(box =>
  a.y === b.y ? a.y > box.y && a.y < box.y + box.height
    && Math.max(a.x, b.x) > box.x && Math.min(a.x, b.x) < box.x + box.width
    : a.x > box.x && a.x < box.x + box.width
      && Math.max(a.y, b.y) > box.y && Math.min(a.y, b.y) < box.y + box.height);

export function placeCallouts(targets: DiagramBox[], obstacles: DiagramBox[]): DiagramPoint[] {
  const occupied = [...obstacles];
  return targets.map(target => {
    for (let ring = 0; ; ring++) {
      for (let column = -ring; column <= ring; column++) {
        const point = { x: target.x + (target.width - 220) / 2 + column * 268, y: target.y - 180 - ring * 172 };
        const box = { ...point, width: 220, height: 124 };
        if (occupied.every(other => box.x + box.width + 32 <= other.x || other.x + other.width + 32 <= box.x
          || box.y + box.height + 32 <= other.y || other.y + other.height + 32 <= box.y)) {
          occupied.push(box);
          return point;
        }
      }
    }
  });
}

export function routeDiagramEdge(source: DiagramPort, target: DiagramPort, obstacles: DiagramBox[]) {
  const step = (port: DiagramPort): DiagramPoint => ({
    x: port.x + (port.side === 'right' ? 28 : port.side === 'left' ? -28 : 0),
    y: port.y + (port.side === 'bottom' ? 28 : port.side === 'top' ? -28 : 0),
  });
  const start = step(source), end = step(target);
  if (segmentBlocked(source, start, obstacles) || segmentBlocked(end, target, obstacles)) return undefined;
  const boxes = obstacles.map(box => ({ x: box.x - GAP, y: box.y - GAP, width: box.width + GAP * 2, height: box.height + GAP * 2 }));
  if ([start, end].some(point => boxes.some(box => inside(point, box)))) return undefined;
  const xs = [...new Set([start.x, end.x, ...boxes.flatMap(box => [box.x, box.x + box.width])])].sort((a, b) => a - b);
  const ys = [...new Set([start.y, end.y, ...boxes.flatMap(box => [box.y, box.y + box.height])])].sort((a, b) => a - b);
  const key = (x: number, y: number) => y * xs.length + x;
  const point = (id: number) => ({ x: xs[id % xs.length], y: ys[Math.floor(id / xs.length)] });
  const origin = key(xs.indexOf(start.x), ys.indexOf(start.y));
  const destination = key(xs.indexOf(end.x), ys.indexOf(end.y));
  const distance = new Map<number, number>([[origin, 0]]);
  const previous = new Map<number, number>();
  const open = [{ id: origin, score: 0 }];
  const closed = new Set<number>();
  while (open.length) {
    const current = open.shift()!.id;
    if (closed.has(current)) continue;
    if (current === destination) {
      const points: DiagramPoint[] = [target, end];
      let cursor = current;
      while (previous.has(cursor)) { cursor = previous.get(cursor)!; points.push(point(cursor)); }
      points.push(source);
      points.reverse();
      const simplified = points.filter((p, index) => {
        const a = points[index - 1], b = points[index + 1];
        return !a || !b || !((a.x === p.x && p.x === b.x) || (a.y === p.y && p.y === b.y));
      }).filter((p, index, list) => !index || p.x !== list[index - 1].x || p.y !== list[index - 1].y);
      const segments = simplified.slice(1).map((b, index) => ({ a: simplified[index], b }));
      if (!segments.length) return undefined;
      const longest = segments.reduce((best, segment) =>
        Math.abs(segment.a.x - segment.b.x) + Math.abs(segment.a.y - segment.b.y)
        > Math.abs(best.a.x - best.b.x) + Math.abs(best.a.y - best.b.y) ? segment : best);
      return {
        points: simplified,
        path: simplified.map((p, index) => `${index ? 'L' : 'M'} ${p.x} ${p.y}`).join(' '),
        labelX: (longest.a.x + longest.b.x) / 2, labelY: (longest.a.y + longest.b.y) / 2,
      };
    }
    closed.add(current);
    const a = point(current), x = current % xs.length, y = Math.floor(current / xs.length);
    const neighbors = [
      ...(x ? [key(x - 1, y)] : []), ...(x < xs.length - 1 ? [key(x + 1, y)] : []),
      ...(y ? [key(x, y - 1)] : []), ...(y < ys.length - 1 ? [key(x, y + 1)] : []),
    ];
    for (const next of neighbors) {
      const b = point(next);
      if (closed.has(next) || boxes.some(box => inside(b, box)) || segmentBlocked(a, b, boxes)) continue;
      const cost = distance.get(current)! + Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      if (cost >= (distance.get(next) ?? Infinity)) continue;
      distance.set(next, cost); previous.set(next, current);
      const entry = { id: next, score: cost + Math.abs(b.x - end.x) + Math.abs(b.y - end.y) };
      let low = 0, high = open.length;
      while (low < high) { const mid = (low + high) >>> 1; if (open[mid].score <= entry.score) low = mid + 1; else high = mid; }
      open.splice(low, 0, entry);
    }
  }
  return undefined;
}
