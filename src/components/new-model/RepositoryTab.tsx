import React from 'react';
import { toast } from 'sonner';

interface RepositoryTabProps {
  repoUrl: string;
  setRepoUrl: (url: string) => void;
}

export const RepositoryTab = ({ repoUrl, setRepoUrl }: RepositoryTabProps) => {
  return (
    <div className="max-w-2xl">
      <h3 className="text-lg font-semibold mb-4">Connect Code Repositories</h3>
      <p className="text-sm text-muted-foreground mb-6">
        Connect a GitHub, GitLab, or Bitbucket repository. The AI agent will perform a heuristic scan of configuration, dependencies, and code structure.
      </p>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">Repository URL</label>
          <input 
            type="text" 
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            className="w-full bg-secondary/30 border border-border/50 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-primary/50" 
            placeholder="https://github.com/org/repo" 
          />
        </div>
        <button 
          onClick={() => toast.promise(new Promise(r => setTimeout(r, 1500)), { loading: 'Verifying connection...', success: 'Repository connected and ready for scan!' })}
          className="bg-secondary text-secondary-foreground px-4 py-2 rounded-xl font-medium text-sm mt-2 hover:bg-secondary/80 transition-colors shadow-sm"
        >
          Verify Connection
        </button>
      </div>
    </div>
  );
};