import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGitHubService, GitHubError, resolveGitHubResource } from './github.mjs';
import { createCopilotServer } from './copilotServer.mjs';
import { fetchGitHubResource, getGitHubStatus, listGitHubRepositories } from '../lib/backend/githubClient.ts';

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers });

test('authenticated status and paginated private repositories use server-only credentials and read operations', async () => {
  const calls = [];
  const service = createGitHubService({
    getToken: async () => 'test-only-credential',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/user')) return json({ login: 'example-user' }, 200, { 'x-oauth-scopes': 'repo, read:org' });
      return json([{ full_name: 'org/private-app', private: true, description: 'Private project' }], 200, {
        link: '<https://api.github.com/user/repos?page=3>; rel="next"',
      });
    },
  });
  assert.deepEqual(await service.status(), { connected: true, login: 'example-user', scopes: ['repo', 'read:org'] });
  const result = await service.repositories(2);
  assert.deepEqual(result, {
    repositories: [{ fullName: 'org/private-app', private: true, url: 'https://github.com/org/private-app', description: 'Private project' }],
    page: 2, hasMore: true,
  });
  assert.ok(calls[1].url.includes('page=2'));
  assert.ok(calls[1].url.includes('affiliation=owner,collaborator,organization_member'));
  assert.ok(calls.every(call => call.options.method === 'GET' && call.options.redirect === 'manual'));
  assert.ok(calls.every(call => call.options.headers.Authorization === 'Bearer test-only-credential'));
  assert.ok(!JSON.stringify(result).includes('test-only-credential'));
});

test('private raw files are read through authenticated Contents API, with encoded references and paths', async () => {
  const service = createGitHubService({
    getToken: async () => 'test-only-credential',
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://api.github.com/repos/org/private-app/contents/docs/Privacy%20%26%20Data.md?ref=release%2Fnext');
      assert.equal(options.headers.Accept, 'application/vnd.github.raw+json');
      return new Response('PRIVATE_DOCUMENT_FACT');
    },
  });
  const result = await service.resource('https://raw.githubusercontent.com/org/private-app/release%2Fnext/docs/Privacy%20%26%20Data.md');
  assert.equal(result.body, 'PRIVATE_DOCUMENT_FACT');
  assert.match(result.contentType, /text\/plain/);
});

test('the resource allowlist rejects other hosts, account endpoints, credentials, query injection and writes', () => {
  for (const url of [
    'https://evil.example/repos/org/repo', 'https://api.github.com/user', 'https://api.github.com/user/repos',
    'http://api.github.com/repos/org/repo', 'https://secret@api.github.com/repos/org/repo',
    'https://api.github.com/repos/org/repo/issues', 'https://api.github.com/repos/org/repo?secret=1',
    'https://api.github.com/repos/org/repo/git/trees/main?recursive=1&extra=2',
    'https://api.github.com/repos/org/repo/git/trees/main?recursive=0',
    'https://raw.githubusercontent.com/org/repo/main/docs%2F..%2Fsecret.txt',
    'https://raw.githubusercontent.com/org/repo/main/README.md?token=secret',
    'https://api.github.com:444/repos/org/repo', 'https://api.github.com/repos/org/repo#fragment',
    'https://api.github.com/repos/org/repo/git/trees/%00', null, '%invalid',
  ]) {
    assert.throws(() => resolveGitHubResource(url), { status: 400 }, String(url));
  }
  for (const url of [
    'https://api.github.com/repos/org/repo', 'https://api.github.com/repos/org/repo/languages',
    'https://api.github.com/repos/org/repo/releases/latest',
    'https://api.github.com/repos/org/repo/git/trees/release%2Fnext?recursive=1',
  ]) assert.equal(resolveGitHubResource(url).url, url);
});

test('access errors distinguish authentication, SSO, permissions, rate limits and missing resources', async () => {
  for (const [status, headers, expectedStatus, message] of [
    [401, {}, 401, /authentication expired/],
    [403, { 'x-github-sso': 'required; url=https://github.com/org/sso' }, 403, /SSO/],
    [403, { 'x-ratelimit-remaining': '0' }, 429, /rate limit/],
    [403, {}, 403, /denied access/],
    [404, {}, 404, /not found or/],
    [301, { location: 'https://evil.example' }, 409, /canonical repository/],
  ]) {
    const service = createGitHubService({
      getToken: async () => 'test-only-credential',
      fetchImpl: async () => json({ message: 'Never forward upstream bodies or secrets' }, status, headers),
    });
    await assert.rejects(service.status(), error => error.status === expectedStatus && message.test(error.message));
  }
});

test('credential failures cannot produce a connected status and concurrent requests share only in-flight credential reads', async () => {
  const missing = createGitHubService({
    getToken: async () => { throw new GitHubError(401, 'Sign in using gh auth login'); },
    fetchImpl: async () => assert.fail('No request without credentials'),
  });
  await assert.rejects(missing.status(), { status: 401 });
  let credentials = 0;
  const service = createGitHubService({
    getToken: async () => { credentials++; return `credential-${credentials}`; },
    fetchImpl: async () => json({ login: 'example-user' }),
  });
  await Promise.all([service.status(), service.status()]);
  assert.equal(credentials, 1);
  await service.status();
  assert.equal(credentials, 2, 'Account switches are not hidden by a credential cache');
});

test('file bodies are bounded, metadata cannot be silently truncated and upstream failures do not expose secrets', async () => {
  const service = createGitHubService({
    getToken: async () => 'test-only-credential',
    fetchImpl: async () => new Response('x'.repeat(500_000)),
  });
  const result = await service.resource('https://raw.githubusercontent.com/org/repo/main/README.md');
  assert.equal(result.body.length, 400_004);
  const oversized = createGitHubService({
    getToken: async () => 'test-only-credential',
    fetchImpl: async () => new Response('x'.repeat(16 * 1024 * 1024 + 1)),
  });
  await assert.rejects(oversized.status(), { status: 413 });
  const offline = createGitHubService({
    getToken: async () => 'test-only-credential',
    fetchImpl: async () => { throw Error('Request headers included test-only-credential'); },
  });
  await assert.rejects(offline.status(), error => error.status === 502 && !error.message.includes('test-only-credential'));
});

test('local routes require trusted origin, an application header, read-only methods and no Copilot login', async t => {
  const client = {
    start: async () => assert.fail('GitHub access must not require Copilot'),
    stop: async () => {},
  };
  const github = createGitHubService({
    getToken: async () => 'test-only-credential',
    fetchImpl: async () => json({ login: 'example-user' }),
  });
  const server = createCopilotServer({ client, github });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/github`;
  const headers = { 'X-Seidr-Client': '1' };
  assert.equal((await fetch(`${base}/status`)).status, 403);
  assert.equal((await fetch(`${base}/status`, { headers: { ...headers, Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await fetch(`${base}/status`, { headers: { ...headers, 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  assert.equal((await fetch(`${base}/status`, { method: 'POST', headers })).status, 405);
  const status = await fetch(`${base}/status`, { headers });
  assert.deepEqual(await status.json(), { connected: true, login: 'example-user', scopes: [] });
  assert.equal(status.headers.get('cache-control'), 'no-store');
  assert.equal((await fetch(`${base}/repositories?page=1.5`, { headers })).status, 400);
  assert.equal((await fetch(`${base}/resource?url=${encodeURIComponent('https://evil.example')}`, { headers })).status, 400);
});

test('browser integration never handles credentials, preserves raw responses, and surfaces actionable failures', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    if (url.includes('resource?')) return new Response('Private documentation');
    if (url.includes('repositories')) return json({ repositories: [], page: 2, hasMore: false });
    return json({ connected: true, login: 'example-user', scopes: [] });
  });
  assert.equal((await getGitHubStatus()).login, 'example-user');
  assert.equal((await listGitHubRepositories(2)).page, 2);
  assert.equal(await (await fetchGitHubResource('https://api.github.com/repos/org/repo')).text(), 'Private documentation');
  assert.ok(calls.every(call => call.url.startsWith('/api/github/')));
  assert.ok(calls.every(call => call.options.headers['X-Seidr-Client'] === '1' && !call.options.headers.Authorization));
  t.mock.method(globalThis, 'fetch', async () => json({ error: 'Organization SSO authorization required' }, 403));
  await assert.rejects(getGitHubStatus(), /SSO/);
  t.mock.method(globalThis, 'fetch', async () => new Response('<html>Static server</html>'));
  await assert.rejects(getGitHubStatus(), /Restart pnpm copilot:server/);
});

test('browser integration rejects malformed successful responses rather than inventing connection or repository state', async t => {
  for (const body of [
    null, {}, { connected: false, login: 'example-user', scopes: [] },
    { connected: true, login: '', scopes: [] }, { connected: true, login: 'example-user', scopes: 'repo' },
  ]) {
    t.mock.method(globalThis, 'fetch', async () => json(body));
    await assert.rejects(getGitHubStatus(), /invalid response/);
  }
  for (const body of [
    { repositories: [], page: '1', hasMore: false },
    { repositories: [{ fullName: 'org/repo', url: 'https://evil.example/repo', private: true, description: '' }], page: 1, hasMore: false },
    { repositories: [{ fullName: 'org/repo', url: 'https://github.com/org/repo', private: 'yes', description: '' }], page: 1, hasMore: false },
  ]) {
    t.mock.method(globalThis, 'fetch', async () => json(body));
    await assert.rejects(listGitHubRepositories(), /invalid response/);
  }
});
