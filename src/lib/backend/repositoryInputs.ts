import { type ContextInput, sanitiseSection } from './analysisContext.ts';
import { mapLimit } from './asyncUtils.ts';
import { getErrorMessage } from './inputUtils.ts';
import { prepareSourceText, type DocumentDigest } from './documentContext.ts';
import type { RepositoryAnalysis, RepositorySource, ScannedFile, Threat } from './types.ts';

/** Parsing also serves the picker, where an unfinished form row need not be a valid URL yet. */
export function parseRepositoryUrl(value: string): { url: string; key: string } | { error: string } {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return { error: `Invalid repository URL: ${value.trim()}` };
  }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    return { error: 'Repository URLs must use HTTP or HTTPS and must not contain credentials.' };
  }
  url.hash = '';
  url.pathname = url.pathname.replace(/\/+$/, '').replace(/\.git$/i, '') || '/';
  const normalized = url.href.replace(/\/$/, '');
  return { url: normalized, key: url.hostname === 'github.com' ? normalized.toLowerCase() : normalized };
}

/** Accepts old single-repository payloads while ignoring empty rows and duplicate URLs. */
export function getRepositoryUrls(urls?: string[], legacyUrl?: string): string[] {
  const unique = new Map<string, string>();
  for (const raw of urls ?? (legacyUrl ? [legacyUrl] : [])) {
    if (!raw.trim()) continue;
    const parsed = parseRepositoryUrl(raw);
    if ('error' in parsed) throw new Error(parsed.error);
    if (!unique.has(parsed.key)) unique.set(parsed.key, parsed.url);
  }
  return [...unique.values()];
}

interface RepositoryInput extends ContextInput {
  threats: Threat[];
  scannedFiles: ScannedFile[];
  sources: ContextInput[];
  evidenceSources: RepositorySource[];
}

export const prepareRepositorySources = (
  sources: RepositorySource[],
  digest: DocumentDigest,
): Promise<RepositorySource[]> => mapLimit(sources, 3, async source => {
  if (source.status === 'failed' || source.status === 'excluded') return { ...source, text: '', originalText: '' };
  const prepared = await prepareSourceText(`${source.url} (${source.name})`, source.text, digest);
  const original = sanitiseSection(source.originalText ?? source.text);
  return {
    ...source, text: prepared.text, sourceChars: source.sourceChars ?? source.text.length,
    originalText: original.passed ? original.text : '',
    status: prepared.status === 'included' ? source.status || 'included'
      : prepared.status === 'digested' && source.status === 'truncated' ? 'truncated' : prepared.status,
    note: [source.note, prepared.note].filter(Boolean).join(' ') || undefined,
  };
});

const sourceInput = (source: RepositorySource): ContextInput => {
  const name = `Repository ${source.kind}: ${source.url}`;
  const clean = sanitiseSection(source.text);
  const status = source.status === 'failed' || source.status === 'excluded'
    ? source.status : !clean.passed ? 'excluded' : !clean.text ? 'empty' : source.status || 'included';
  return {
    section: ['failed', 'excluded', 'empty'].includes(status) ? undefined
      : { kind: 'repository', name, detail: source.name, text: clean.text },
    status: {
      kind: 'repository', name, status, chars: 0, sourceChars: source.sourceChars ?? source.text.length,
      method: source.kind, note: clean.passed ? source.note : clean.reason,
    },
  };
};

/** One failure must not discard the other repositories or their source attribution. */
export const analyseRepositories = (
  urls: string[],
  context: string,
  analyse: (url: string, context: string) => Promise<RepositoryAnalysis>,
): Promise<RepositoryInput[]> => mapLimit(urls, 3, async (url, index) => {
  const base = { kind: 'repository' as const, name: url, chars: 0 };
  try {
    const result = await analyse(url, context);
    const findings = result.inherentVulnerabilities || [];
    const files = result.scannedFiles || [];
    const sources = (result.contextSources || []).map(sourceInput);
    const evidenceSources = result.contextSources || [];
    const note = result.collectionNotes?.join(' ');
    if (result.codeAnalysisError) {
      return {
        status: { ...base, status: 'failed', note: [result.codeAnalysisError, note].filter(Boolean).join(' ') },
        threats: [], scannedFiles: files.map(file => ({ ...file, repositoryUrl: url })), sources, evidenceSources,
      };
    }
    const summary = findings.map(t => `- ${t.title} (${t.severity}): ${t.evidence || t.description}`).join('\n');
    const clean = sanitiseSection(`Inferred purpose and architecture:\n${result.inferredPurpose}${summary ? `\n\nCode-level findings:\n${summary}` : ''}`);
    if (!clean.passed) {
      return { status: { ...base, status: 'excluded', note: clean.reason }, threats: [], scannedFiles: [], sources, evidenceSources };
    }
    return {
      section: { kind: 'repository', name: `Repository: ${url}`, detail: `${files.length} file(s) scanned`, text: clean.text },
      status: { ...base, status: 'included', sourceChars: clean.text.length, method: 'static code analysis', note },
      threats: findings.map(threat => ({
        ...threat,
        id: urls.length > 1 ? `REPO-${index + 1}-${threat.id}` : threat.id,
        evidence: `Repository: ${url}\n${threat.evidence || threat.description}`,
      })),
      scannedFiles: files.map(file => ({ ...file, repositoryUrl: url })),
      sources,
      evidenceSources,
    };
  } catch (error) {
    console.warn(`Repository analysis failed for ${url}; continuing with other inputs.`, error);
    return { status: { ...base, status: 'failed', note: getErrorMessage(error) }, threats: [], scannedFiles: [], sources: [], evidenceSources: [] };
  }
});
