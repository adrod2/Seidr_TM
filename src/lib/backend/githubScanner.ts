import { mapLimit } from './asyncUtils.ts';
import { getErrorMessage } from './inputUtils.ts';
import type { RepositorySource, ScannedFile } from './types.ts';
import { fetchGitHubResource } from './githubClient.ts';

const IGNORED_PATHS = new Set([
  'node_modules', 'vendor', '.git', 'dist', 'build', 'out', 'bin', 'obj', '.next', '.nuxt', 'coverage', '.cache',
]);
const CODE_PATTERNS = [
  /(^|\/)(package\.json|pom\.xml|requirements\.txt|go\.mod|Cargo\.toml)$/,
  /(^|\/)(Dockerfile|docker-compose)/i, /\.(tf|ya?ml|proto)$/i,
  /swagger|openapi|graphql|auth|jwt|middleware|permission|rbac|oauth|routes|controllers|handlers|migrations/i,
  /(^|\/)(api|models|entities|helm|kubernetes|k8s)(\/|$)/i,
];
const CODE_EXTENSIONS = /\.(json|ya?ml|tf|hcl|proto|graphql|gql|[cm]?[jt]sx?|py|go|mod|java|cs|rb|rs|php|sh|toml|xml|txt|properties)$/i;
const DOCUMENT_EXTENSIONS = /\.(md|mdx|markdown|rst|adoc|asciidoc|txt|html?)$/i;

export const GITHUB_SCAN_LIMITS = {
  codeFiles: 15,
  documentationFiles: 60,
  codeCharsPerFile: 3_000,
  documentationCharsPerFile: 100_000,
  documentationCharsTotal: 600_000,
};

interface TreeFile {
  type: string;
  path: string;
  size?: number;
}

export interface GitHubScan {
  contextString: string;
  scannedFiles: ScannedFile[];
  contextSources: RepositorySource[];
  collectionNotes: string[];
}

export const parseGitHubUrl = (value: string) => {
  try {
    const url = new URL(value);
    if (url.hostname !== 'github.com' || !['https:', 'http:'].includes(url.protocol)) return null;
    const [owner, name] = url.pathname.split('/').filter(Boolean);
    const repo = name?.replace(/\.git$/i, '');
    if (owner && repo) return { owner, repo };
  } catch {
    // Non-GitHub URLs are handled separately by the repository agent.
  }
  return null;
};

const request = async (url: string): Promise<Response> => {
  const response = await fetchGitHubResource(url);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(`GitHub returned HTTP ${response.status}: ${body.error || 'Repository resource could not be read.'}`);
  }
  return response;
};

/** Stop downloading large files once the text budget is exhausted. */
const readBoundedText = async (response: Response, maxChars: number) => {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('GitHub returned an unreadable response body.');
  const decoder = new TextDecoder();
  let text = '';
  try {
    while (text.length <= maxChars) {
      const { done, value } = await reader.read();
      if (done) {
        text += decoder.decode();
        return { text: text.slice(0, maxChars), truncated: text.length > maxChars };
      }
      text += decoder.decode(value, { stream: true });
    }
    return { text: text.slice(0, maxChars), truncated: true };
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
};

const isDocumentation = (path: string) =>
  !/(^|\/)requirements[^/]*\.txt$/i.test(path)
  && (DOCUMENT_EXTENSIONS.test(path) || /(^|\/)(LICENSE|NOTICE|COPYING)(\.[^/]*)?$/i.test(path));

const documentationRank = (path: string) => {
  if (/^readme\./i.test(path)) return 0;
  if (/(^|\/)(security|privacy|architecture|threat[-_]?model)/i.test(path)) return 1;
  if (/(^|\/)(docs?|documentation|adrs?|decisions)\//i.test(path)) return 2;
  return 3;
};

export const scanGitHubRepository = async (owner: string, repo: string): Promise<GitHubScan> => {
  const api = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const metadata: Record<string, unknown> = await (await request(api)).json();
  if (typeof metadata.default_branch !== 'string' || !metadata.default_branch) {
    throw new Error('Repository metadata does not specify a default branch.');
  }
  const branch = metadata.default_branch;
  const scannedFiles: ScannedFile[] = [];
  const contextSources: RepositorySource[] = [{
    kind: 'metadata', name: 'Repository metadata', url: api, text: JSON.stringify(metadata, null, 2),
  }];
  const collectionNotes: string[] = [];
  const [tree] = await Promise.all([
    (async () => {
      const treeUrl = `${api}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
      try {
        const data: { tree: TreeFile[]; truncated?: boolean } = await (await request(treeUrl)).json();
        if (!Array.isArray(data.tree)) throw new Error('GitHub returned an invalid file tree.');
        if (data.truncated) collectionNotes.push('GitHub truncated the repository tree; some files could not be discovered.');
        return data.tree;
      } catch (error) {
        const note = `File discovery failed: ${getErrorMessage(error)}`;
        console.warn(note);
        collectionNotes.push(note);
        return [];
      }
    })(),
    ...['languages', 'releases/latest'].map(async endpoint => {
      const url = `${api}/${endpoint}`;
      const name = endpoint === 'languages' ? 'Languages' : 'Latest release and release notes';
      try {
        const response = await fetchGitHubResource(url);
        if (endpoint === 'releases/latest' && response.status === 404) return;
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(`HTTP ${response.status}: ${body.error || 'Metadata could not be read.'}`);
        }
        const body = await readBoundedText(response, GITHUB_SCAN_LIMITS.documentationCharsPerFile);
        contextSources.push({
          kind: 'metadata', name, url, text: body.text, status: body.truncated ? 'truncated' : 'included',
          note: body.truncated ? 'Metadata response exceeded the per-source text limit.' : undefined,
        });
      } catch (error) {
        console.warn(`Could not collect ${name} for ${owner}/${repo}.`, error);
        contextSources.push({ kind: 'metadata', name, url, text: '', status: 'failed', note: getErrorMessage(error) });
      }
    }),
  ]);
  // Optional requests may complete out of order; keep the context deterministic.
  contextSources.sort((a, b) => a.url.localeCompare(b.url));
  const files = tree.filter(item => item.type === 'blob'
    && !item.path.split('/').some(part => IGNORED_PATHS.has(part))
    && !item.path.startsWith('public/assets/'));
  const documents = files.filter(file => isDocumentation(file.path))
    .sort((a, b) => documentationRank(a.path) - documentationRank(b.path) || a.path.localeCompare(b.path));
  const code = files.filter(file => !isDocumentation(file.path)
    && (CODE_EXTENSIONS.test(file.path) || /(^|\/)Dockerfile[^/]*$/i.test(file.path))
    && CODE_PATTERNS.some(pattern => pattern.test(file.path)));
  const binaryDocuments = files.filter(file => /\.(pdf|docx?|pptx?|xlsx?|odt|ods)$/i.test(file.path));
  if (binaryDocuments.length) {
    collectionNotes.push(`Binary documents are not collected by the repository text scanner (${binaryDocuments.length} files, including ${binaryDocuments.slice(0, 5).map(file => file.path).join(', ')}). Attach these as Supporting Documents to analyze them.`);
  }
  if (documents.length > GITHUB_SCAN_LIMITS.documentationFiles) {
    collectionNotes.push(`Documentation limit: reading ${GITHUB_SCAN_LIMITS.documentationFiles} of ${documents.length} text documentation files.`);
  }
  if (code.length > GITHUB_SCAN_LIMITS.codeFiles) {
    collectionNotes.push(`Static code sample: reading ${GITHUB_SCAN_LIMITS.codeFiles} of ${code.length} priority files.`);
  }
  const selectedDocuments = documents.slice(0, GITHUB_SCAN_LIMITS.documentationFiles);
  const docChars = Math.min(GITHUB_SCAN_LIMITS.documentationCharsPerFile,
    Math.floor(GITHUB_SCAN_LIMITS.documentationCharsTotal / Math.max(1, selectedDocuments.length)));
  const selected = [
    ...selectedDocuments.map(file => ({ file, kind: 'documentation' as const, limit: docChars })),
    ...code.slice(0, GITHUB_SCAN_LIMITS.codeFiles).map(file => ({ file, kind: 'code' as const, limit: GITHUB_SCAN_LIMITS.codeCharsPerFile })),
  ];
  const contents = await mapLimit(selected, 4, async ({ file, kind, limit }) => {
    const encodedPath = file.path.split('/').map(encodeURIComponent).join('/');
    const url = `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/${encodedPath}`;
    try {
      const content = await readBoundedText(await request(url), limit);
      return { file, kind, url, ...content };
    } catch (error) {
      console.warn(`Could not read repository file ${file.path}.`, error);
      return { file, kind, url, text: '', truncated: false, error: getErrorMessage(error) };
    }
  });
  const codeParts: string[] = [];
  for (const content of contents) {
    const { file, kind, url, text, truncated } = content;
    const note = content.error || (truncated ? `Text shortened to ${kind === 'code' ? GITHUB_SCAN_LIMITS.codeCharsPerFile : docChars} characters during collection.` : undefined);
    if (!content.error) scannedFiles.push({ path: file.path, size: file.size ?? new TextEncoder().encode(text).length, kind });
    if (kind === 'documentation') {
      contextSources.push({
        kind, name: file.path, url, text, sourceChars: text.length,
        status: content.error ? 'failed' : !text.trim() ? 'empty' : truncated ? 'truncated' : 'included', note,
      });
    } else if (content.error) {
      collectionNotes.push(`${file.path}: ${content.error}`);
    } else {
      codeParts.push(`File: ${file.path}\nSource: ${url}\n${text}${note ? `\n[${note}]` : ''}`);
    }
  }
  collectionNotes.push('Repository scope: default-branch text files, repository metadata, languages and latest release; external linked sites, wiki, issues and older releases are not crawled. No live DAST was performed.');
  return {
    contextString: [
      `Repository: ${owner}/${repo}\nDefault branch: ${branch}`,
      `--- FILE TREE (first 400 of ${files.length} files) ---\n${files.slice(0, 400).map(file => file.path).join('\n')}`,
      `--- STATIC CODE AND CONFIGURATION SAMPLE (SAST/SCA, NOT DAST) ---\n${codeParts.join('\n\n')}`,
    ].join('\n\n'),
    scannedFiles,
    contextSources,
    collectionNotes,
  };
};
