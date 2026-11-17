import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Threat } from '@/lib/backend/types';
import { mitigationActions } from '@/lib/reportExport';

export const MitigationsTab = ({ threats = [], modelId }: { threats?: Threat[]; modelId?: string }) => {
  const [query, setQuery] = useState('');
  const filtered = threats.filter(threat => `${threat.id} ${threat.title} ${threat.category}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="flex-1 overflow-y-auto p-6 space-y-5">
    <header className="space-y-2"><h3 className="text-xl font-bold">Historical mitigation notes</h3>
      <p className="text-sm text-muted-foreground">This legacy assessment has no recorded proof-of-closure workflow. Historical Done/Exception statuses are declarations, not verified mitigation or authenticated risk approval. The original notes are retained read-only.</p>
      {modelId && <Link className="text-sm text-primary underline" to={`/models/new?redo=${encodeURIComponent(modelId)}`}>Redo with evidence, accountable owners and verification tests</Link>}
    </header>
    <label className="block text-sm">Filter historical findings<input className="block w-full mt-1 p-2 rounded-lg border bg-background" value={query} onChange={event => setQuery(event.target.value)} /></label>
    {!filtered.length && <p className="text-sm text-muted-foreground">No historical mitigation notes match.</p>}
    {filtered.map((threat, index) => <details className="rounded-xl border border-border p-4" key={`${threat.id}:${index}`}>
      <summary className="font-semibold cursor-pointer">{threat.title} - {threat.status || 'No historical task status'}</summary>
      <p className="text-xs font-mono my-2">{threat.id} | {threat.category}</p>
      <p className="text-sm whitespace-pre-wrap mb-3">{threat.description}</p>
      <h4 className="text-sm font-semibold">Recorded recommendations (not proof of implementation)</h4>
      {mitigationActions(threat).length ? <ul className="list-disc pl-5 text-sm">{mitigationActions(threat).map((action, index) =>
        <li key={index} className="whitespace-pre-wrap my-2">{action}</li>)}</ul> : <p className="text-sm text-muted-foreground">No mitigation was recorded.</p>}
      {threat.justification && <p className="text-sm mt-3 whitespace-pre-wrap">Historical justification (unverified): {threat.justification}</p>}
    </details>)}
    <p className="text-xs text-muted-foreground">Jira synchronization is not implemented. No tickets are created or updated.</p>
  </div>;
};
