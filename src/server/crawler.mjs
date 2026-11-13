import http from 'node:http';
import https from 'node:https';
import { lookup as dnsLookup } from 'node:dns';
import { BlockList, isIP } from 'node:net';

export class CrawlError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const CRAWL_LIMITS = Object.freeze({
  maxPages: 25,
  maxDepth: 2,
  concurrency: 4,
  pageTimeoutMs: 10_000,
  totalTimeoutMs: 60_000,
  maxPageBytes: 2 * 1024 * 1024,
  maxRedirects: 5,
  maxTextPerPage: 8_000,
  maxTotalText: 120_000,
});

const blocked4 = new BlockList();
const blocked6 = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
]) blocked4.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of [
  ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['100::', 64],
  ['2001::', 32], ['2001:db8::', 32], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
]) blocked6.addSubnet(network, prefix, 'ipv6');

export function isPublicAddress(address) {
  const family = isIP(address);
  if (!family) return false;
  const mapped = family === 6 && /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return !blocked4.check(mapped[1], 'ipv4');
  const hexMapped = family === 6 && /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(address);
  if (hexMapped) {
    const [hi, lo] = [parseInt(hexMapped[1], 16), parseInt(hexMapped[2], 16)];
    return !blocked4.check(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`, 'ipv4');
  }
  return family === 4 ? !blocked4.check(address, 'ipv4') : !blocked6.check(address, 'ipv6');
}

// Resolve and validate every address before connecting so DNS rebinding cannot reach internal hosts.
function safeLookup(hostname, options, callback) {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error);
    const list = Array.isArray(addresses) ? addresses : [{ address: addresses, family: options.family }];
    if (!list.length || list.some(({ address }) => !isPublicAddress(address))) {
      return callback(new CrawlError(400, `Refusing to crawl ${hostname}: it resolves to a private or reserved address.`));
    }
    if (options.all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
}

export function normalizeUrl(raw, base) {
  let url;
  try {
    url = new URL(raw, base);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
  if (url.port && !['80', '443'].includes(url.port)) return null;
  url.hash = '';
  return url;
}

export function validateRootUrl(raw) {
  if (typeof raw !== 'string' || raw.length > 2048) throw new CrawlError(400, 'url must be a string up to 2048 characters.');
  const url = normalizeUrl(raw.trim());
  if (!url) throw new CrawlError(400, 'Only public http(s) URLs on the default ports are supported.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') ||
      (isIP(host) && !isPublicAddress(host))) {
    throw new CrawlError(400, 'Private, loopback, and internal hosts cannot be crawled.');
  }
  return url;
}

export function fetchPage(url, { lookup = safeLookup, timeoutMs = CRAWL_LIMITS.pageTimeoutMs,
  maxBytes = CRAWL_LIMITS.maxPageBytes, redirects = CRAWL_LIMITS.maxRedirects } = {}) {
  const literal = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(literal) && !isPublicAddress(literal)) {
    return Promise.reject(new CrawlError(400, 'Refusing to fetch a private or reserved address.'));
  }
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const timer = setTimeout(() => request.destroy(new CrawlError(504, 'Page request timed out.')), timeoutMs);
    const done = (fn) => (value) => { clearTimeout(timer); fn(value); };
    resolve = done(resolve);
    reject = done(reject);
    const request = transport.get(url, {
      lookup,
      timeout: timeoutMs,
      headers: {
        'User-Agent': 'SeidrThreatModelCrawler/1.0 (+security documentation discovery)',
        Accept: 'text/html,application/xhtml+xml,text/plain,text/markdown;q=0.9,*/*;q=0.1',
      },
    }, (response) => {
      const status = response.statusCode || 0;
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        const next = normalizeUrl(response.headers.location, url);
        if (!next || redirects <= 0) return reject(new CrawlError(502, 'Invalid or excessive redirect.'));
        return fetchPage(next, { lookup, timeoutMs, maxBytes, redirects: redirects - 1 }).then(resolve, reject);
      }
      if (status < 200 || status >= 300) {
        response.resume();
        return reject(new CrawlError(502, `HTTP ${status}`));
      }
      const contentType = String(response.headers['content-type'] || '').toLowerCase();
      if (!/text\/html|application\/xhtml|text\/plain|text\/markdown/.test(contentType)) {
        response.resume();
        return reject(new CrawlError(415, `Unsupported content type ${contentType || 'unknown'}`));
      }
      let size = 0;
      const chunks = [];
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > maxBytes) {
          request.destroy(new CrawlError(413, 'Page exceeds size limit.'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolve({ url, contentType, body: Buffer.concat(chunks).toString('utf8') }));
      response.on('error', reject);
    });
    request.on('timeout', () => request.destroy(new CrawlError(504, 'Page request timed out.')));
    request.on('error', reject);
  });
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decodeEntities = (text) => text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, code) => {
  if (code[0] === '#') {
    const value = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return Number.isFinite(value) && value > 0 && value < 0x110000 ? String.fromCodePoint(value) : ' ';
  }
  return ENTITIES[code.toLowerCase()] ?? match;
});

export function extractPage(html, baseUrl, contentType = 'text/html') {
  if (!/html/.test(contentType)) {
    return { title: baseUrl.pathname, text: html.replace(/\s+\n/g, '\n').trim(), links: [] };
  }
  const title = decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || '').replace(/\s+/g, ' ').trim();
  const links = [];
  for (const match of html.matchAll(/<a\b[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = decodeEntities(match[1] ?? match[2] ?? match[3] ?? '');
    const url = normalizeUrl(href, baseUrl);
    if (url) links.push({ url, text: decodeEntities(match[4].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim() });
  }
  const text = decodeEntities(html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe|canvas)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(nav|footer|header)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/section|\/article)\b[^>]*>/gi, '\n')
    .replace(/<h([1-6])\b[^>]*>/gi, (_, level) => `\n${'#'.repeat(Number(level))} `)
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { title, text, links };
}

const RELEVANCE = [
  [/security|secure|vulnerab|pentest|penetration|bug.?bounty|responsible.?disclosure|security\.txt/i, 5],
  [/privacy|gdpr|ccpa|hipaa|personal.?data|data.?protection|dpa\b|subprocessor|cookie/i, 5],
  [/trust|compliance|soc.?2|iso.?27001|pci|fedramp|certif|audit/i, 4],
  [/encrypt|tls|ssl|authenticat|authoriz|oauth|saml|sso|mfa|2fa|rbac|iam|identity|token|api.?key/i, 3],
  [/architecture|infrastructure|hosting|data.?center|region|network|integration|webhook|api|sdk|docs?|documentation|developer/i, 2],
  [/incident|status|backup|retention|disaster|availability|sla|terms|legal|policy/i, 2],
];
const LOW_VALUE = /\/(blog|news|press|careers|jobs|events|customers|customer-stories|case-studies|pricing|tag|category|author|login|signup|sign-up|join)\b|\.(png|jpe?g|gif|svg|webp|ico|css|js|zip|gz|mp4|mp3|woff2?|pdf)$/i;

export function scoreText(text) {
  return RELEVANCE.reduce((total, [pattern, weight]) => total + (pattern.test(text) ? weight : 0), 0);
}

function countMatches(text) {
  let score = 0;
  for (const [pattern, weight] of RELEVANCE) {
    const matches = text.match(new RegExp(pattern.source, 'gi'));
    if (matches) score += Math.min(matches.length, 10) * weight;
  }
  return score;
}

const sameSite = (a, b) => a.hostname.replace(/^www\./, '') === b.hostname.replace(/^www\./, '');
// Query strings (locale, tracking) and www/redirect variants usually serve the same document.
const siteKey = (url) => `${url.hostname.replace(/^www\./, '')}${url.pathname.replace(/\/$/, '')}`;

async function parseRobots(root, fetcher) {
  try {
    const { body } = await fetcher(new URL('/robots.txt', root));
    const rules = [];
    let applies = false;
    for (const line of body.split(/\r?\n/)) {
      const [key, ...rest] = line.split('#')[0].split(':');
      const value = rest.join(':').trim();
      if (/^user-agent$/i.test(key.trim())) applies = value === '*' || /seidr/i.test(value);
      else if (applies && /^disallow$/i.test(key.trim()) && value) rules.push(value);
    }
    return (url) => !rules.some((rule) => url.pathname.startsWith(rule));
  } catch {
    return () => true;
  }
}

export async function crawlSite(rawUrl, { fetcher = (url) => fetchPage(url), limits = CRAWL_LIMITS, now = Date.now } = {}) {
  const root = validateRootUrl(rawUrl);
  const deadline = now() + limits.totalTimeoutMs;
  const allowed = await parseRobots(root, fetcher);
  const seen = new Set();
  const queue = [];
  const enqueue = (url, depth, priority) => {
    const key = siteKey(url);
    if (seen.has(key) || !sameSite(url, root) || LOW_VALUE.test(url.pathname) || !allowed(url)) return;
    seen.add(key);
    queue.push({ url, depth, priority });
  };
  enqueue(root, 0, 100);
  for (const path of ['/.well-known/security.txt', '/security', '/privacy', '/trust']) {
    enqueue(new URL(path, root), 1, 20);
  }

  const pages = [];
  const fetched = new Set();
  const errors = [];
  let attempted = 0;
  let inFlight = 0;
  const worker = async () => {
    while (attempted < limits.maxPages && now() < deadline && (queue.length || inFlight)) {
      if (!queue.length) {
        await new Promise((resolve) => setTimeout(resolve, 25));
        continue;
      }
      queue.sort((a, b) => b.priority - a.priority || a.depth - b.depth);
      const item = queue.shift();
      attempted++;
      inFlight++;
      try {
        const page = await fetcher(item.url);
        const { title, text, links } = extractPage(page.body, page.url, page.contentType);
        if (text.length > 80 && !fetched.has(siteKey(page.url))) {
          fetched.add(siteKey(page.url));
          pages.push({ url: page.url.href, title: title || page.url.pathname, depth: item.depth,
            score: countMatches(`${title}\n${text}`) + scoreText(page.url.pathname) * 3, text });
        }
        if (item.depth < limits.maxDepth) {
          for (const link of links) {
            enqueue(link.url, item.depth + 1, scoreText(`${link.url.pathname} ${link.text}`) * 3 - item.depth);
          }
        }
      } catch (error) {
        if (item.depth === 0) errors.unshift(`${item.url.href}: ${error.message}`);
        else errors.push(`${item.url.href}: ${error.message}`);
      } finally {
        inFlight--;
      }
    }
  };
  await Promise.all(Array.from({ length: limits.concurrency }, worker));

  if (!pages.length) {
    throw new CrawlError(502, `No readable pages could be retrieved from ${root.href}. ${errors[0] || ''}`.trim());
  }
  pages.sort((a, b) => b.score - a.score);
  let budget = limits.maxTotalText;
  const result = [];
  for (const page of pages) {
    if (budget <= 0) break;
    const text = page.text.slice(0, Math.min(limits.maxTextPerPage, budget));
    budget -= text.length;
    result.push({ ...page, text });
  }
  return { rootUrl: root.href, pages: result, attempted, errors: errors.slice(0, 10) };
}
