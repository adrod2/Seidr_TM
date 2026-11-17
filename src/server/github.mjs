import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const API = 'https://api.github.com';
const PAGE_SIZE = 30;
const SIGN_IN = 'Run gh auth login --hostname github.com --web on the machine running Seidr, then check the connection again.';

export class GitHubError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function readGitHubToken() {
  try {
    const { stdout } = await execute('gh', ['auth', 'token', '--hostname', 'github.com'], {
      encoding: 'utf8', windowsHide: true, timeout: 10_000, maxBuffer: 16_384,
    });
    const token = stdout.trim();
    if (!token || token.length > 4096 || /\s/.test(token)) throw new Error('Invalid credential.');
    return token;
  } catch (error) {
    if (error.code === 'ENOENT') throw new GitHubError(503, 'GitHub CLI is not installed on the Seidr server. Install gh, then sign in.');
    // CLI errors may contain credentials; never relay stdout, stderr or command details.
    throw new GitHubError(401, `GitHub CLI authentication is unavailable. ${SIGN_IN}`);
  }
}

const validRepository = (owner, repo) =>
  typeof owner === 'string' && typeof repo === 'string'
  && /^[a-z\d][a-z\d-]{0,38}$/i.test(owner)
  && /^[a-z\d_.-]{1,100}$/i.test(repo) && !['.', '..'].includes(repo);

function decodePart(part) {
  try {
    const decoded = decodeURIComponent(part);
    if (!decoded || /[\u0000-\u001f\u007f]/.test(decoded)) throw new Error('Invalid path.');
    return decoded;
  } catch {
    throw new GitHubError(400, 'Invalid GitHub resource path.');
  }
}

/** Only repository read endpoints are allowed; never forward credentials to a supplied host. */
export function resolveGitHubResource(value) {
  let url;
  try {
    if (typeof value !== 'string' || value.length > 8192) throw new Error('Invalid URL.');
    url = new URL(value);
  } catch {
    throw new GitHubError(400, 'A valid GitHub resource URL is required.');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) {
    throw new GitHubError(400, 'Only HTTPS GitHub repository resources are supported.');
  }
  const parts = url.pathname.slice(1).split('/').map(decodePart);
  if (url.hostname === 'api.github.com') {
    const [root, owner, repo, ...path] = parts;
    const metadata = path.length === 0;
    const languages = path.length === 1 && path[0] === 'languages';
    const release = path.length === 2 && path[0] === 'releases' && path[1] === 'latest';
    const tree = path.length === 3 && path[0] === 'git' && path[1] === 'trees' && path[2].length <= 256;
    const query = [...url.searchParams];
    if (root !== 'repos' || !validRepository(owner, repo) || !(metadata || languages || release || tree)
      || (query.length && !(tree && query.length === 1 && query[0][0] === 'recursive' && query[0][1] === '1'))) {
      throw new GitHubError(400, 'Unsupported GitHub repository resource.');
    }
    return { url: url.href, raw: false };
  }
  if (url.hostname === 'raw.githubusercontent.com' && !url.search) {
    const [owner, repo, ref, ...path] = parts;
    if (!validRepository(owner, repo) || !ref || ref.length > 256 || !path.length
      || path.some(part => part.includes('/') || part === '.' || part === '..')) {
      throw new GitHubError(400, 'Invalid GitHub file resource.');
    }
    return {
      url: `${API}/repos/${owner}/${repo}/contents/${path.map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`,
      raw: true,
    };
  }
  throw new GitHubError(400, 'Only GitHub repository API resources and repository files are supported.');
}

async function readResponse(response, { raw = false } = {}) {
  const reader = response.body?.getReader();
  if (!reader) throw new GitHubError(502, 'GitHub returned an unreadable response.');
  const chunks = [];
  let size = 0;
  const limit = raw ? 400_004 : 16 * 1024 * 1024;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (size + value.length > limit) {
        if (!raw) throw new GitHubError(413, 'GitHub metadata exceeded the response-size limit.');
        chunks.push(value.subarray(0, limit - size));
        break;
      }
      chunks.push(value);
      size += value.length;
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString('utf8');
}

function upstreamError(response) {
  if (response.status === 401) return new GitHubError(401, `GitHub authentication expired or is invalid. ${SIGN_IN}`);
  if (response.headers.get('x-github-sso')?.includes('required')) {
    return new GitHubError(403, 'GitHub organization SSO (single sign-on) authorization is required. Authorize the CLI credential in GitHub for this organization, then retry.');
  }
  if (response.status === 429 || response.headers.get('x-ratelimit-remaining') === '0') {
    return new GitHubError(429, 'GitHub API rate limit reached. Wait before retrying.');
  }
  if (response.status === 403) return new GitHubError(403, 'GitHub denied access. Check repository permissions, token Contents/Metadata read access, and organization restrictions.');
  if (response.status === 404) return new GitHubError(404, 'GitHub resource not found or the active account does not have access.');
  if ([301, 302, 307, 308].includes(response.status)) return new GitHubError(409, 'GitHub redirected this resource. Use the current canonical repository URL.');
  return new GitHubError(502, `GitHub request failed (HTTP ${response.status}).`);
}

export function createGitHubService({ getToken = readGitHubToken, fetchImpl = fetch } = {}) {
  let credentialRequest;
  const credential = () => {
    if (!credentialRequest) {
      credentialRequest = Promise.resolve().then(getToken).finally(() => { credentialRequest = undefined; });
    }
    return credentialRequest;
  };
  const request = async (url, raw = false) => {
    const token = await credential();
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(30_000),
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Seidr-local',
        },
      });
    } catch {
      throw new GitHubError(502, 'Cannot reach GitHub. Check the server network connection and retry.');
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw upstreamError(response);
    }
    let body;
    try {
      body = await readResponse(response, { raw });
    } catch (error) {
      if (error instanceof GitHubError) throw error;
      throw new GitHubError(502, 'GitHub response could not be read. Retry the request.');
    }
    if (raw) return { body, response };
    try {
      return { data: JSON.parse(body), body, response };
    } catch {
      throw new GitHubError(502, 'GitHub returned invalid JSON.');
    }
  };

  return {
    async status() {
      const { data, response } = await request(`${API}/user`);
      if (typeof data?.login !== 'string' || !data.login) throw new GitHubError(502, 'GitHub did not return an authenticated account.');
      return {
        connected: true, login: data.login,
        scopes: (response.headers.get('x-oauth-scopes') || '').split(',').map(scope => scope.trim()).filter(Boolean),
      };
    },
    async repositories(page) {
      if (!Number.isInteger(page) || page < 1 || page > 10000) throw new GitHubError(400, 'Repository page must be an integer between 1 and 10000.');
      const { data, response } = await request(`${API}/user/repos?affiliation=owner,collaborator,organization_member&sort=pushed&direction=desc&per_page=${PAGE_SIZE}&page=${page}`);
      if (!Array.isArray(data)) throw new GitHubError(502, 'GitHub returned an invalid repository list.');
      const repositories = data.map(repo => {
        const [owner, name, extra] = typeof repo?.full_name === 'string' ? repo.full_name.split('/') : [];
        if (extra !== undefined || !validRepository(owner, name) || typeof repo.private !== 'boolean') {
          throw new GitHubError(502, 'GitHub returned invalid repository details.');
        }
        return {
          fullName: repo.full_name, url: `https://github.com/${repo.full_name}`, private: repo.private,
          description: typeof repo.description === 'string' ? repo.description : '',
        };
      });
      return { repositories, page, hasMore: /;\s*rel="next"/.test(response.headers.get('link') || '') };
    },
    async resource(value) {
      const target = resolveGitHubResource(value);
      const { body } = await request(target.url, target.raw);
      return { body, contentType: target.raw ? 'text/plain; charset=utf-8' : 'application/json' };
    },
  };
}
