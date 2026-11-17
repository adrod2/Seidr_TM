import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GITHUB_SCAN_LIMITS, parseGitHubUrl, scanGitHubRepository } from './githubScanner.ts';

const api = 'https://api.github.com/repos/org/service';
const metadata = {
  full_name: 'org/service', default_branch: 'main', description: 'Warehouse robotics service',
  topics: ['robotics', 'warehouse'], homepage: 'https://docs.example.test', license: { spdx_id: 'MIT' },
  archived: false, pushed_at: '2026-11-17T00:00:00Z',
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

const mockGitHub = (t, files, options = {}) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    assert.ok(String(input).startsWith('/api/github/resource?url='));
    assert.equal(init.headers['X-Seidr-Client'], '1');
    const url = new URL(String(input), 'http://localhost').searchParams.get('url');
    calls.push(url);
    assert.ok(init.signal instanceof AbortSignal);
    if (url === api) return json(metadata, options.metadataStatus || 200);
    if (url === `${api}/languages`) return json({ Python: 12345, TypeScript: 6789 }, options.languagesStatus || 200);
    if (url === `${api}/releases/latest`) return options.release
      ? json({ tag_name: 'v4.3', body: 'Release notes: device identity changed.' }) : json({}, 404);
    if (url.startsWith(`${api}/git/trees/`)) {
      return json({ tree: files.map(file => ({ type: 'blob', path: file.path, size: file.text.length })), truncated: options.truncated }, options.treeStatus || 200);
    }
    const prefix = 'https://raw.githubusercontent.com/org/service/main/';
    if (url.startsWith(prefix)) {
      const path = url.slice(prefix.length).split('/').map(decodeURIComponent).join('/');
      const file = files.find(file => file.path === path);
      if (file) return new Response(file.text, { status: file.status || 200 });
    }
    assert.fail(`Unexpected fetch ${url}`);
  });
  t.mock.method(console, 'warn', () => {});
  return calls;
};

test('documentation and metadata have their own collection stream, independent of the code sample', async t => {
  const files = [
    ...Array.from({ length: 20 }, (_, i) => ({ path: `api/handler-${i}.ts`, text: `export const handler${i} = () => {};` })),
    { path: 'README.md', text: 'README_FACT: the product controls warehouse robots.' },
    { path: 'SECURITY.md', text: 'SECURITY_FACT: vendor remote support requires MFA.' },
    { path: 'docs/architecture.adoc', text: 'ARCHITECTURE_FACT: on-site controllers use SQLite.' },
    { path: 'docs/privacy.mdx', text: 'PRIVACY_FACT: employee video retained for 90 days.' },
    { path: 'docs/adr/001-network.rst', text: 'ADR_FACT: robots use isolated wireless networks.' },
    { path: 'LICENSE', text: 'MIT License' },
    { path: 'node_modules/vendor/README.md', text: 'Do not collect dependency docs.' },
    { path: 'dist/api.js', text: 'Do not collect built output.' },
  ];
  mockGitHub(t, files, { release: true });
  const result = await scanGitHubRepository('org', 'service');
  assert.equal(result.scannedFiles.filter(file => file.kind === 'code').length, 15);
  assert.equal(result.scannedFiles.filter(file => file.kind === 'documentation').length, 6);
  for (const fact of ['README_FACT', 'SECURITY_FACT', 'ARCHITECTURE_FACT', 'PRIVACY_FACT', 'ADR_FACT']) {
    assert.ok(result.contextSources.some(source => source.text.includes(fact)), `Missing ${fact}`);
  }
  const meta = result.contextSources.find(source => source.url === api);
  assert.deepEqual(JSON.parse(meta.text), metadata);
  assert.ok(result.contextSources.some(source => source.name === 'Languages' && source.text.includes('Python')));
  assert.ok(result.contextSources.some(source => source.text.includes('device identity changed')));
  assert.ok(result.contextSources.filter(source => source.kind === 'documentation').every(source => source.url.includes('raw.githubusercontent.com')));
  assert.ok(!result.scannedFiles.some(file => /node_modules|^dist\//.test(file.path)));
  assert.match(result.contextString, /SAST\/SCA, NOT DAST/);
  assert.ok(result.collectionNotes.some(note => note.includes('15 of 20')));
});

test('only successfully read files are counted and documentation failures stay visible', async t => {
  mockGitHub(t, [
    { path: 'README.md', text: 'Product overview' },
    { path: 'docs/missing.md', text: 'Not found', status: 404 },
    { path: 'api/missing.ts', text: 'Not found', status: 404 },
    { path: 'docs/empty.md', text: '' },
    { path: 'docs/architecture.pdf', text: 'binary document' },
  ], { languagesStatus: 403, truncated: true });
  const result = await scanGitHubRepository('org', 'service');
  assert.deepEqual(result.scannedFiles.map(file => file.path), ['README.md', 'docs/empty.md']);
  assert.equal(result.contextSources.find(source => source.name === 'docs/missing.md').status, 'failed');
  assert.equal(result.contextSources.find(source => source.name === 'docs/empty.md').status, 'empty');
  assert.equal(result.contextSources.find(source => source.name === 'Languages').status, 'failed');
  assert.ok(!result.contextSources.some(source => source.name === 'Latest release and release notes'));
  assert.ok(result.collectionNotes.some(note => note.includes('truncated the repository tree')));
  assert.ok(result.collectionNotes.some(note => note.includes('api/missing.ts')));
  assert.ok(result.collectionNotes.some(note => note.includes('architecture.pdf') && note.includes('Supporting Documents')));
});

test('documentation limits cover multiple files fairly and disclose incomplete collection', async t => {
  mockGitHub(t, Array.from({ length: 65 }, (_, i) => ({
    path: `docs/doc-${String(i).padStart(2, '0')}.md`, text: 'x'.repeat(20000),
  })));
  const result = await scanGitHubRepository('org', 'service');
  const docs = result.contextSources.filter(source => source.kind === 'documentation');
  assert.equal(docs.length, GITHUB_SCAN_LIMITS.documentationFiles);
  assert.ok(docs.every(source => source.text.length === 10000 && source.status === 'truncated'));
  assert.equal(docs.reduce((sum, source) => sum + source.text.length, 0), GITHUB_SCAN_LIMITS.documentationCharsTotal);
  assert.ok(docs.every(source => source.note.includes('10000')));
  assert.ok(result.collectionNotes.some(note => note.includes('60 of 65')));
});

test('a tree failure preserves metadata but is never reported as a successful file scan', async t => {
  mockGitHub(t, [], { treeStatus: 403 });
  const result = await scanGitHubRepository('org', 'service');
  assert.deepEqual(result.scannedFiles, []);
  assert.ok(result.contextSources.some(source => source.url === api));
  assert.ok(result.collectionNotes.some(note => note.includes('File discovery failed')));
});

test('an inaccessible repository fails explicitly instead of inventing URL-only findings', async t => {
  mockGitHub(t, [], { metadataStatus: 404 });
  await assert.rejects(scanGitHubRepository('org', 'service'), /HTTP 404/);
});

test('file paths are encoded and documentation inside nested directories is discovered', async t => {
  const calls = mockGitHub(t, [{ path: 'docs/design notes/Privacy & Data.md', text: 'Personal data flows' }]);
  const result = await scanGitHubRepository('org', 'service');
  assert.ok(calls.some(url => url.includes('design%20notes/Privacy%20%26%20Data.md')));
  assert.equal(result.contextSources.find(source => source.kind === 'documentation').text, 'Personal data flows');
});

test('dependency manifests stay in the static review while README uses the documentation stream', async t => {
  mockGitHub(t, [
    { path: 'requirements.txt', text: 'requests==2.32.0' },
    { path: 'go.mod', text: 'module warehouse' },
    { path: 'README.txt', text: 'Warehouse robotics API' },
  ]);
  const result = await scanGitHubRepository('org', 'service');
  assert.deepEqual(result.scannedFiles.filter(file => file.kind === 'code').map(file => file.path), ['requirements.txt', 'go.mod']);
  assert.match(result.contextString, /requests==2.32.0/);
  assert.match(result.contextString, /module warehouse/);
  assert.equal(result.contextSources.find(source => source.name === 'README.txt').kind, 'documentation');
});

test('GitHub parser accepts repository URLs and rejects unsupported providers', () => {
  assert.deepEqual(parseGitHubUrl('https://github.com/org/service.git/'), { owner: 'org', repo: 'service' });
  assert.equal(parseGitHubUrl('not a URL'), null);
  assert.equal(parseGitHubUrl('https://gitlab.com/org/service'), null);
  assert.equal(parseGitHubUrl('ftp://github.com/org/service'), null);
});
