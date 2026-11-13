import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LAYOUT_MODES, computeLayout, hasOverlaps, removeOverlaps } from './c4Layout.ts';

const types = ['Person', 'Person', 'System', 'Container', 'Container', 'Container', 'Container', 'Component', 'Database', 'Database', 'System'];
const nodes = types.map((c4Type, i) => ({ id: `N${i}`, c4Type, width: 250, height: c4Type === 'Person' ? 200 : 170 }));
const edges = [
  ['N0', 'N3'], ['N1', 'N3'], ['N3', 'N4'], ['N4', 'N5'], ['N4', 'N6'], ['N5', 'N8'], ['N6', 'N9'],
  ['N4', 'N7'], ['N7', 'N9'], ['N5', 'N10'], ['N2', 'N4'], ['N4', 'N3'], ['N4', 'MISSING'],
].map(([source, target]) => ({ source, target }));

test('every layout mode places every node without overlaps', async () => {
  for (const { id } of LAYOUT_MODES) {
    const positions = await computeLayout(id, nodes, edges);
    assert.deepEqual(Object.keys(positions).sort(), nodes.map((n) => n.id).sort(), id);
    assert.equal(hasOverlaps(nodes, positions), false, `${id} produced overlapping nodes`);
  }
});

test('layout modes produce genuinely different arrangements', async () => {
  const signatures = new Set();
  for (const { id } of LAYOUT_MODES) {
    const positions = await computeLayout(id, nodes, edges);
    signatures.add(JSON.stringify(nodes.map((n) => positions[n.id])));
  }
  assert.equal(signatures.size, LAYOUT_MODES.length);
});

test('tiered layout keeps people above containers and databases at the bottom', async () => {
  const p = await computeLayout('tiered', nodes, edges);
  const maxPersonY = Math.max(p.N0.y, p.N1.y);
  const minDatabaseY = Math.min(p.N8.y, p.N9.y);
  assert.ok(maxPersonY < p.N3.y && p.N3.y < minDatabaseY);
});

test('overlap removal separates stacked nodes and handles empty and single graphs', async () => {
  const stacked = Object.fromEntries(nodes.map((n) => [n.id, { x: 0, y: 0 }]));
  assert.equal(hasOverlaps(nodes, removeOverlaps(nodes, stacked)), false);
  assert.deepEqual(await computeLayout('radial', [], []), {});
  assert.deepEqual(await computeLayout('organic', [nodes[0]], []), { N0: { x: 0, y: 0 } });
});
