import assert from 'node:assert/strict';
import { test } from 'node:test';
import { db } from '../db.ts';
import { getCachedResult, setCachedResult } from './agentCache.ts';

test('private analysis cache stays local, respects expiry, and isolates provider/model configurations', async t => {
  const rows = new Map();
  let config = { provider: 'copilot', copilotModel: 'model-one' };
  t.mock.method(db.aiConfig, 'get', async () => config);
  t.mock.method(db.agentResults, 'get', async key => rows.get(key));
  t.mock.method(db.agentResults, 'put', async row => { rows.set(row.key, row); return row.key; });
  t.mock.method(globalThis, 'fetch', async () => assert.fail('Analysis cache must not use a remote service'));
  const result = { context: 'PRIVATE_REPOSITORY_FACT' };
  await setCachedResult('repoAnalysis', 'hash', result);
  assert.deepEqual(await getCachedResult('repoAnalysis', 'hash'), result);
  config = { provider: 'copilot', copilotModel: 'model-two' };
  assert.equal(await getCachedResult('repoAnalysis', 'hash'), null);
  config = { provider: 'ollama' };
  assert.equal(await getCachedResult('repoAnalysis', 'hash'), null);
  config = { provider: 'copilot', copilotModel: 'model-one' };
  rows.get('copilot_model-one_repoAnalysis_hash').expiresAt = Date.now() - 1;
  assert.equal(await getCachedResult('repoAnalysis', 'hash'), null);
});
