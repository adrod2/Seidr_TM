import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { createCopilotServer } from './copilotServer.mjs';
import { crawlSite, extractPage, fetchPage, isPublicAddress, validateRootUrl } from './crawler.mjs';

const site = {
  'https://example.com/robots.txt': 'User-agent: *\nDisallow: /private',
  'https://example.com/': `<html><head><title>Acme &amp; Co</title><script>alert(1)</script></head><body>
    <nav><a href="/blog/post">Blog</a></nav>
    <h1>Acme Platform</h1><p>Acme is a SaaS product that stores customer invoices and integrates via a REST API.</p>
    <a href="/security">Security overview</a> <a href="/careers">Careers</a> <a href="https://evil.example.net/x">Partner</a>
    <a href="/private/secret">Private</a> <a href="/docs/architecture">Architecture docs</a></body></html>`,
  'https://example.com/security': `<html><title>Security</title><body><h2>Encryption</h2>
    <p>All data is encrypted with AES-256 at rest and TLS 1.2+ in transit. We hold SOC 2 Type II and ISO 27001 certifications.
    SSO via SAML and MFA are supported. Report vulnerabilities through our bug bounty program.</p></body></html>`,
  'https://example.com/docs/architecture': `<html><title>Architecture</title><body><p>Services run in AWS us-east-1 behind an API gateway
    with OAuth 2.0 tokens. PostgreSQL stores tenant data; webhooks deliver events to customers.</p></body></html>`,
};

const fakeFetcher = (requested) => async (url) => {
  requested.push(url.href);
  const body = site[url.href];
  if (body === undefined) throw new Error('HTTP 404');
  return { url, contentType: url.pathname.endsWith('.txt') ? 'text/plain' : 'text/html', body };
};

test('address classification blocks private, loopback, link-local and mapped addresses', () => {
  for (const address of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '::1', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '0.0.0.0']) {
    assert.equal(isPublicAddress(address), false, address);
  }
  assert.equal(isPublicAddress('8.8.8.8'), true);
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
});

test('root URL validation rejects unsafe targets', () => {
  for (const url of ['file:///etc/passwd', 'ftp://example.com', 'http://localhost/', 'http://127.0.0.1/', 'http://[::1]/',
    'http://169.254.169.254/latest/meta-data', 'http://user:pw@example.com/', 'http://example.com:8080/', 'http://db.internal/']) {
    assert.throws(() => validateRootUrl(url), undefined, url);
  }
  assert.equal(validateRootUrl('https://example.com/docs#x').href, 'https://example.com/docs');
});

test('HTML extraction drops scripts and navigation and resolves links', () => {
  const page = extractPage(site['https://example.com/'], new URL('https://example.com/'));
  assert.equal(page.title, 'Acme & Co');
  assert.doesNotMatch(page.text, /alert|Blog/);
  assert.match(page.text, /# Acme Platform/);
  assert.ok(page.links.some(link => link.url.href === 'https://example.com/security'));
});

test('crawler stays on-site, honours robots.txt, skips low-value pages and ranks security content first', async () => {
  const requested = [];
  const result = await crawlSite('https://example.com/', { fetcher: fakeFetcher(requested) });
  assert.ok(!requested.some(url => url.includes('evil.example.net')));
  assert.ok(!requested.some(url => url.includes('/private')));
  assert.ok(!requested.some(url => url.includes('/careers') || url.includes('/blog')));
  assert.equal(result.pages[0].url, 'https://example.com/security');
  assert.deepEqual(new Set(result.pages.map(page => page.url)),
    new Set(['https://example.com/', 'https://example.com/security', 'https://example.com/docs/architecture']));
});

test('crawler enforces page budgets and reports unreachable sites', async () => {
  const requested = [];
  const limits = { maxPages: 2, maxDepth: 2, concurrency: 1, totalTimeoutMs: 5000, maxTextPerPage: 50, maxTotalText: 80 };
  const result = await crawlSite('https://example.com/', { fetcher: fakeFetcher(requested), limits });
  assert.equal(result.attempted, 2);
  assert.ok(result.pages.reduce((sum, page) => sum + page.text.length, 0) <= 80);
  await assert.rejects(crawlSite('https://nothing.example/', { fetcher: async () => { throw new Error('down'); } }), /No readable pages/);
});

test('fetchPage refuses hosts that resolve to private addresses (DNS rebinding)', async () => {
  const target = createServer((req, res) => res.end('should never be reached'));
  await new Promise(resolve => target.listen(0, '127.0.0.1', resolve));
  try {
    const port = target.address().port;
    // localhost resolves to loopback, so the default resolver guard must refuse it.
    await assert.rejects(fetchPage(new URL(`http://localhost:${port}/`)), /private or reserved/);
    await assert.rejects(fetchPage(new URL(`http://127.0.0.1:${port}/`)), /private or reserved/);
  } finally {
    target.close();
  }
});

test('bridge exposes /api/crawl with origin checks and maps crawl errors', async t => {
  const client = { start: async () => {}, stop: async () => {}, getAuthStatus: async () => ({ isAuthenticated: true }), listModels: async () => [] };
  const server = createCopilotServer({ client, crawl: async (url) => {
    if (url === 'bad') { const { CrawlError } = await import('./crawler.mjs'); throw new CrawlError(400, 'bad url'); }
    return { rootUrl: url, pages: [], attempted: 1, errors: [] };
  } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const endpoint = `http://127.0.0.1:${server.address().port}/api/crawl`;
  const post = (url, headers = {}) => fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ url }) });
  const ok = await post('https://example.com/');
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).rootUrl, 'https://example.com/');
  const bad = await post('bad');
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error, 'bad url');
  assert.equal((await post('https://example.com/', { Origin: 'https://evil.example' })).status, 403);
});
