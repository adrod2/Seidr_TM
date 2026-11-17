import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeDiagramEdge, segmentBlocked, placeCallouts } from './c4Routes.ts';

test('diagram arrows route around intermediate components instead of cutting through them', () => {
  const obstacles = [{ x: 0, y: 0, width: 200, height: 150 }, { x: 300, y: 0, width: 200, height: 150 },
    { x: 600, y: 0, width: 200, height: 150 }];
  const route = routeDiagramEdge({ x: 200, y: 75, side: 'right' }, { x: 600, y: 75, side: 'left' }, obstacles);
  assert.ok(route);
  assert.ok(route.points.some(point => point.y < 0 || point.y > 150));
  for (let index = 1; index < route.points.length; index++) {
    assert.ok(route.points[index - 1].x === route.points[index].x || route.points[index - 1].y === route.points[index].y);
    assert.equal(segmentBlocked(route.points[index - 1], route.points[index], obstacles), false);
  }
});

test('overlapping ports disclose an unavailable route instead of inventing a clear path', () => {
  assert.equal(routeDiagramEdge({ x: 200, y: 75, side: 'right' }, { x: 300, y: 75, side: 'left' },
    [{ x: 100, y: 0, width: 400, height: 200 }]), undefined);
});

test('multiple threat callouts remain separate from each other and all component boxes', () => {
  const target = { x: 300, y: 0, width: 250, height: 200 };
  const obstacles = [target, { x: 0, y: -200, width: 250, height: 200 }];
  const positions = placeCallouts(Array(12).fill(target), obstacles);
  const boxes = [...obstacles, ...positions.map(position => ({ ...position, width: 220, height: 124 }))];
  for (let a = obstacles.length; a < boxes.length; a++) for (let b = 0; b < a; b++) {
    assert.ok(boxes[a].x + boxes[a].width <= boxes[b].x || boxes[b].x + boxes[b].width <= boxes[a].x
      || boxes[a].y + boxes[a].height <= boxes[b].y || boxes[b].y + boxes[b].height <= boxes[a].y);
  }
});
