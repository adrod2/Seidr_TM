import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapThreats, visibleThreatTargets, threatColor } from './threatMap.ts';

const srg = {
  components: [
    { id: 'api', name: 'API' }, { id: 'db', name: 'Database' },
    { id: 'a', name: 'Shared service' }, { id: 'b', name: 'Shared service' },
    { id: 'vendor', name: 'Vendor, Inc' },
  ],
  edges: [{ id: 'f1', sourceId: 'api', targetId: 'db' }],
};
const threat = (id, fields = {}) => ({ id, title: id, severity: 'High', componentId: '', ...fields });

test('threat map resolves exact IDs and unique legacy names without inventing affected flows', () => {
  const result = mapThreats(srg, [
    threat('one', { componentId: 'API' }), threat('two', { componentId: 'api; Database' }),
    threat('three', { componentId: 'API Gateway' }), threat('four', { componentId: 'Vendor, Inc' }),
  ]);
  assert.deepEqual(result[0].componentIds, ['api']);
  assert.deepEqual(result[0].flowIds, []);
  assert.deepEqual(result[1].componentIds, ['api', 'db']);
  assert.deepEqual(result[2].componentIds, []);
  assert.deepEqual(result[3].componentIds, ['vendor']);
  assert.equal(result[2].unresolved.length, 1);
});

test('explicit flow mappings and component mappings remain independent and deduplicated', () => {
  const [result] = mapThreats(srg, [threat('one', {
    componentId: 'api', affectedComponentIds: [], affectedFlowIds: ['f1', 'f1', 'missing'],
  })]);
  assert.deepEqual(result.componentIds, []);
  assert.deepEqual(result.flowIds, ['f1']);
  assert.deepEqual(result.unresolved, ['Flow: missing']);
  assert.deepEqual(visibleThreatTargets(result, srg, new Set(['api'])), { componentIds: [], flowIds: [] });
  assert.deepEqual(visibleThreatTargets(result, srg, new Set(['api', 'db'])), { componentIds: [], flowIds: ['f1'] });
});

test('ambiguous and missing references stay visible, and one target may retain multiple distinct threats', () => {
  const results = mapThreats(srg, [
    threat('one', { componentId: 'Shared service' }), threat('two'),
    threat('three', { affectedComponentIds: ['api', 'api'] }),
    threat('four', { affectedComponentIds: ['api'] }),
  ]);
  assert.match(results[0].unresolved[0], /ambiguous/);
  assert.match(results[1].unresolved[0], /No affected/);
  assert.equal(results.filter(result => result.componentIds.includes('api')).length, 2);
  assert.equal(threatColor([threat('a', { severity: 'Low' }), threat('b', { severity: 'Critical' })]), '#dc2626');
});
