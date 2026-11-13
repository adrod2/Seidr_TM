import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildC4Mermaid, displayProtocol, toC4Element, visibleComponents } from './c4Model.ts';

const srg = {
  components: [
    { id: 'USER', name: 'Customer', type: 'ExternalEntity', c4Type: 'Person', c4Level: 'L1', description: 'Buys "things"; uses <app>' },
    { id: 'PAY', name: 'Stripe', type: 'ExternalEntity', c4Type: 'System', c4Level: 'L1', external: true, description: 'Payments' },
    { id: 'API-GW', name: 'API Gateway', type: 'Process', c4Type: 'Container', c4Level: 'L2', technology: 'AWS API Gateway', description: 'Routes `calls`' },
    { id: 'DB', name: 'Orders DB', type: 'DataStore', c4Level: 'L2', description: 'PostgreSQL' },
    { id: 'CTRL', name: 'Order Controller', type: 'Process', c4Type: 'Component', c4Level: 'L3', description: 'Handles orders' },
  ],
  edges: [
    { id: 'e1', sourceId: 'USER', targetId: 'API-GW', label: 'Places orders', protocol: 'HTTPS' },
    { id: 'e2', sourceId: 'API-GW', targetId: 'DB', label: 'Reads/writes', protocol: 'JDBC|TLS' },
    { id: 'e3', sourceId: 'API-GW', targetId: 'PAY', label: 'Charges cards' },
  ],
};

test('in-scope system becomes the L2 boundary and placeholder protocols are hidden', () => {
  const withSystem = { ...srg, components: [...srg.components, { id: 'SHOP', name: 'Shop', type: 'Process', c4Type: 'System', c4Level: 'L1', description: 'x' }] };
  assert.ok(visibleComponents(withSystem, 'L1').some((c) => c.id === 'SHOP'));
  assert.ok(!visibleComponents(withSystem, 'L2').some((c) => c.id === 'SHOP'));
  assert.equal(displayProtocol('Not specified'), undefined);
  assert.equal(displayProtocol('N/A'), undefined);
  assert.equal(displayProtocol('HTTPS'), 'HTTPS');
  const text = buildC4Mermaid(srg.components.map(toC4Element), [{ id: 'x', sourceId: 'USER', targetId: 'DB', label: 'Uses', protocol: 'Not specified' }]);
  assert.doesNotMatch(text, /Not specified/);
});

test('level filtering mirrors C4 drill-down', () => {
  assert.deepEqual(visibleComponents(srg, 'L1').map((c) => c.id), ['USER', 'PAY']);
  assert.deepEqual(visibleComponents(srg, 'L2').map((c) => c.id), ['USER', 'PAY', 'API-GW', 'DB']);
  assert.deepEqual(visibleComponents(srg, 'L3').map((c) => c.id), ['API-GW', 'DB', 'CTRL']);
});

test('elements infer C4 types and external status', () => {
  const [user, pay, gw, db] = srg.components.map(toC4Element);
  assert.equal(user.c4Type, 'Person');
  assert.equal(pay.external, true);
  assert.equal(gw.technology, 'AWS API Gateway');
  assert.equal(db.c4Type, 'Database');
});

test('mermaid output uses C4 shapes, boundary and escaped labels', () => {
  const elements = visibleComponents(srg, 'L2').map(toC4Element);
  const text = buildC4Mermaid(elements, srg.edges, { direction: 'LR', boundaryLabel: 'Shop' });
  assert.match(text, /^flowchart LR/);
  assert.match(text, /n_USER\(\[".*\*\*Customer\*\*/);
  assert.match(text, /n_DB\[\(/);
  assert.match(text, /:::external/);
  assert.match(text, /subgraph boundary\["`\*\*Shop\*\*/);
  assert.match(text, /n_API_GW -\.->\|"`Reads\/writes\n\[JDBC TLS\]`"\| n_DB/);
  // Quotes, angle brackets, pipes and backticks from data must never reach the Mermaid syntax.
  const labels = text.split('\n').filter((l) => l.includes('Customer') || l.includes('Routes'));
  for (const l of labels) assert.doesNotMatch(l.replace(/^[^"]*"`|`"[^"]*$/g, ''), /["<>|`]/);
});
