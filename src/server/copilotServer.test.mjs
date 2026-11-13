import assert from 'node:assert/strict';
import { test } from 'node:test';
import { request as httpRequest } from 'node:http';
import { createCopilotServer } from './copilotServer.mjs';
import { extractJson } from '../lib/backend/llmResponse.ts';
import { generateWithCopilot, getCopilotModels } from '../lib/backend/copilotClient.ts';

const models = [
  { id: 'text-model', name: 'Text', capabilities: { supports: { vision: false } } },
  { id: 'vision-model', name: 'Vision', capabilities: { supports: { vision: true } } },
];
const request = { systemPrompt: 'Return threats.', userPrompt: 'Example architecture.', format: 'json' };

async function fixture(t, options = {}) {
  const calls = { sessions: [], messages: [], aborted: 0, disconnected: 0, started: 0, stopped: 0 };
  const client = {
    start: async () => { calls.started++; },
    stop: async () => { calls.stopped++; },
    getAuthStatus: async () => ({ isAuthenticated: options.authenticated !== false }),
    listModels: async () => models,
    createSession: async (config) => {
      calls.sessions.push(config);
      return {
        sendAndWait: async (message, timeout) => {
          calls.messages.push({ ...message, timeout });
          if (options.fail) throw new Error('Model request failed');
          if (options.delay) await new Promise(resolve => setTimeout(resolve, options.delay));
          return { data: { content: options.content ?? '[{"id":"T-001"}]' } };
        },
        abort: async () => { calls.aborted++; },
        disconnect: async () => { calls.disconnected++; },
      };
    },
  };
  const server = createCopilotServer({ client, timeout: 1000 });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    assert.equal(calls.stopped, 1);
  });
  const url = `http://127.0.0.1:${server.address().port}/api/copilot`;
  const post = (body = request, headers = {}) => fetch(`${url}/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
  return { url, post, calls };
}

test('status checks authentication and lists real model capabilities without generating', async t => {
  const { url, calls } = await fixture(t);
  const response = await fetch(`${url}/status`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { models: [
    { id: 'text-model', name: 'Text', vision: false },
    { id: 'vision-model', name: 'Vision', vision: true },
  ] });
  assert.equal(calls.sessions.length, 0);
});

test('missing authentication is an actionable error, not a successful connection', async t => {
  const { post, calls } = await fixture(t, { authenticated: false });
  const response = await post();
  assert.equal(response.status, 401);
  assert.match((await response.json()).error, /copilot login/);
  assert.equal(calls.sessions.length, 0);
});

test('structured generation preserves JSON arrays and disables coding tools', async t => {
  const { post, calls } = await fixture(t);
  const response = await post({ ...request, model: 'text-model' });
  assert.equal(response.status, 200);
  assert.deepEqual(extractJson((await response.json()).content), [{ id: 'T-001' }]);
  const config = calls.sessions[0];
  assert.equal(config.model, 'text-model');
  assert.equal(config.systemMessage.mode, 'replace');
  assert.match(config.systemMessage.content, /valid JSON/);
  assert.deepEqual(config.availableTools, []);
  assert.deepEqual(config.excludedTools, ['builtin:*', 'mcp:*', 'custom:*']);
  assert.match(config.onPermissionRequest().kind, /^denied/);
  assert.equal(config.enableConfigDiscovery, false);
  assert.deepEqual(config.infiniteSessions, { enabled: false });
  assert.equal(calls.messages[0].prompt, request.userPrompt);
  assert.equal(calls.disconnected, 1);
  assert.equal(calls.aborted, 0);
});

test('mitigations and chat support raw text without JSON parsing', async t => {
  const { post, calls } = await fixture(t, { content: 'Enable mutual TLS.' });
  const response = await post({ ...request, format: 'text' });
  assert.equal((await response.json()).content, 'Enable mutual TLS.');
  assert.match(calls.sessions[0].systemMessage.content, /not JSON/);
});

test('vision uses an image blob and automatically selects a vision model', async t => {
  const { post, calls } = await fixture(t);
  const response = await post({ ...request, format: 'text', image: 'data:image/png;base64,aGVsbG8=' });
  assert.equal(response.status, 200);
  assert.equal(calls.sessions[0].model, 'vision-model');
  assert.deepEqual(calls.messages[0].attachments, [{
    type: 'blob', mimeType: 'image/png', data: 'aGVsbG8=', displayName: 'architecture-diagram',
  }]);
});

test('invalid input and unavailable or non-vision models fail before session creation', async t => {
  const { post, calls } = await fixture(t);
  for (const invalid of [
    null, [], { ...request, userPrompt: '' }, { ...request, format: 'xml' },
    { ...request, image: 'file:///private.png' }, { ...request, model: 'missing' },
    { ...request, model: 'text-model', image: 'data:image/png;base64,aGVsbG8=' },
  ]) {
    assert.equal((await post(invalid)).status, 400);
  }
  assert.equal(calls.sessions.length, 0);
});

test('foreign origins, DNS rebinding hosts, and non-JSON requests are refused', async t => {
  const { url, post, calls } = await fixture(t);
  assert.equal((await post(request, { Origin: 'https://untrusted.example' })).status, 403);
  const reboundStatus = await new Promise((resolve, reject) => {
    const req = httpRequest(`${url}/status`, { headers: { Host: 'untrusted.example' } }, response => {
      response.resume();
      resolve(response.statusCode);
    });
    req.on('error', reject);
    req.end();
  });
  assert.equal(reboundStatus, 403);
  assert.equal((await post(request, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal(calls.started, 0);
});

test('provider failures abort and disconnect the failed session', async t => {
  const { post, calls } = await fixture(t, { fail: true });
  const response = await post();
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /Model request failed/);
  assert.equal(calls.aborted, 1);
  assert.equal(calls.disconnected, 1);
});

test('empty output is a provider error', async t => {
  const { post, calls } = await fixture(t, { content: '' });
  assert.equal((await post()).status, 502);
  assert.equal(calls.aborted, 1);
  assert.equal(calls.disconnected, 1);
});

test('all ten parallel pipeline mitigations can complete', async t => {
  const { post, calls } = await fixture(t, { delay: 20 });
  const responses = await Promise.all(Array.from({ length: 10 }, () => post()));
  assert.ok(responses.every(response => response.status === 200));
  assert.equal(calls.started, 1);
  assert.equal(calls.disconnected, 10);
});

test('JSON response parser accepts objects, arrays, and fenced JSON, but not invalid output', () => {
  assert.deepEqual(extractJson('{"components":[]}'), { components: [] });
  assert.deepEqual(extractJson('```json\r\n[{"id":"T-1"}]\r\n```'), [{ id: 'T-1' }]);
  assert.deepEqual(extractJson('```\n{"threats":[]}\n```'), { threats: [] });
  assert.throws(() => extractJson('not JSON'), SyntaxError);
});

test('browser client sends no credentials and propagates service errors', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    return Response.json({ content: 'Configure TLS.' });
  });
  assert.equal(await generateWithCopilot('System', 'User', 'text', 'text-model'), 'Configure TLS.');
  assert.equal(calls[0].url, '/api/copilot/generate');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    systemPrompt: 'System', userPrompt: 'User', format: 'text', model: 'text-model',
  });
  assert.deepEqual(calls[0].options.headers, { 'Content-Type': 'application/json' });
  globalThis.fetch = async () => Response.json({ error: 'Sign in first.' }, { status: 401 });
  await assert.rejects(getCopilotModels(), /Sign in first/);
});

test('browser client reports an offline bridge and static-host HTML instead of success', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Offline'); });
  await assert.rejects(getCopilotModels(), /pnpm copilot:server/);
  globalThis.fetch = async () => new Response('<html>Seidr</html>');
  await assert.rejects(getCopilotModels(), /service is unavailable/);
});
