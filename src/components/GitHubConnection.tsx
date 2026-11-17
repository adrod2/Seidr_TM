import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Github, Loader2, LockKeyhole, RefreshCw } from 'lucide-react';
import { getGitHubStatus, listGitHubRepositories, type GitHubRepository, type GitHubStatus } from '@/lib/backend/githubClient';
import { getErrorMessage } from '@/lib/backend/inputUtils';
import { parseRepositoryUrl } from '@/lib/backend/repositoryInputs';

interface GitHubConnectionProps {
  selectedUrls?: string[];
  onAddRepository?: (url: string) => void;
}

export const GitHubConnection = ({ selectedUrls = [], onAddRepository }: GitHubConnectionProps) => {
  const [status, setStatus] = useState<GitHubStatus | null>(null);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(true);
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [filter, setFilter] = useState('');

  const checkConnection = useCallback(async () => {
    setChecking(true);
    setError('');
    setStatus(null);
    setRepositories([]);
    setPage(0);
    setFilter('');
    setListError('');
    setHasMore(false);
    try {
      setStatus(await getGitHubStatus());
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => { void checkConnection(); }, [checkConnection]);

  const loadRepositories = async () => {
    setLoading(true);
    setListError('');
    try {
      const result = await listGitHubRepositories(page + 1);
      setRepositories(previous => [...new Map([...previous, ...result.repositories].map(repo => [repo.fullName, repo])).values()]);
      setPage(result.page);
      setHasMore(result.hasMore);
    } catch (error) {
      setListError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const visible = repositories.filter(repo =>
    `${repo.fullName} ${repo.description}`.toLowerCase().includes(filter.toLowerCase()));
  const selectedKeys = new Set(selectedUrls.flatMap(url => {
    const parsed = parseRepositoryUrl(url);
    return 'key' in parsed ? [parsed.key] : [];
  }));

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-3">
          <Github className="h-6 w-6 shrink-0 text-primary mt-1" />
          <div>
            <h4 className="font-semibold flex items-center gap-2">
              GitHub
              {status && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
            </h4>
            <p className="text-sm text-muted-foreground" role="status">
              {checking ? 'Checking GitHub access...' : status ? `Connected as ${status.login}` : 'GitHub is not connected'}
            </p>
          </div>
        </div>
        <button type="button" onClick={checkConnection} disabled={checking || loading}
          className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-sm font-medium disabled:opacity-50">
          {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Check Connection
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Read-only access through this machine's GitHub CLI sign-in. Credentials stay on the local server.
        Private repositories require repository read permissions; organization access may also require SSO (single sign-on) authorization.
      </p>
      {error && <p role="alert" className="text-sm text-destructive break-words">{error}</p>}
      {status && onAddRepository && (
        <div className="space-y-3">
          {page > 0 && (
            <>
              <label className="block text-sm font-medium" htmlFor="github-repository-filter">Filter loaded repositories</label>
              <input id="github-repository-filter" value={filter} onChange={event => setFilter(event.target.value)}
                className="w-full rounded-lg border border-border bg-secondary/30 p-2 text-sm"
                placeholder="Repository or organization name" />
              <div className="max-h-72 overflow-y-auto space-y-2" aria-label="Accessible GitHub repositories">
                {visible.map(repo => {
                  const parsed = parseRepositoryUrl(repo.url);
                  const selected = 'key' in parsed && selectedKeys.has(parsed.key);
                  return (
                    <div key={repo.fullName} className="flex items-center justify-between gap-3 rounded-lg border border-border/50 p-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm font-medium">
                          <span className="truncate">{repo.fullName}</span>
                          {repo.private && <span className="flex items-center gap-1 text-xs text-muted-foreground"><LockKeyhole className="h-3 w-3" />Private</span>}
                        </p>
                        {repo.description && <p className="truncate text-xs text-muted-foreground">{repo.description}</p>}
                      </div>
                      <button type="button" disabled={selected} onClick={() => onAddRepository(repo.url)}
                        aria-label={`${selected ? 'Added' : 'Add'} ${repo.fullName}`}
                        className="rounded-lg bg-primary/10 px-3 py-1.5 text-sm text-primary disabled:opacity-50">
                        {selected ? 'Added' : 'Add'}
                      </button>
                    </div>
                  );
                })}
                {!visible.length && <p className="text-sm text-muted-foreground">No matching repositories in the loaded results.</p>}
              </div>
            </>
          )}
          {listError && <p role="alert" className="text-sm text-destructive">{listError}</p>}
          {(page === 0 || hasMore) && (
            <button type="button" disabled={loading} onClick={loadRepositories}
              className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-sm font-medium disabled:opacity-50">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {page === 0 ? 'Browse GitHub Repositories' : 'Load More Repositories'}
            </button>
          )}
          <p className="text-xs text-muted-foreground">Only repositories available to the active CLI account and token are listed. You can also paste a repository URL below.</p>
        </div>
      )}
    </div>
  );
};
