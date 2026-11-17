import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { db, type ThreatModel } from '@/lib/db';
import { saveAssessmentReview } from '@/lib/backend/assessmentStore';
import { getErrorMessage } from '@/lib/backend/inputUtils';
import { sanitiseSection } from '@/lib/backend/analysisContext';
import { assessmentSummary, changeAssessmentScope, makeEvidenceSource, rateRisk, resetRiskReview, riskDefinition, riskIssues, LIKELIHOOD_LEVELS, IMPACT_LEVELS,
  type AssessmentQuality, type EvidenceSource, type RiskRating, type RiskRecord } from '@/lib/backend/assessmentQuality';

const fieldClass = 'w-full rounded-lg border border-border bg-background p-2 text-sm';
const Field = ({ label, value, onChange, multiline = false }: { label: string; value?: string; onChange: (value: string) => void; multiline?: boolean }) => (
  <label className="block space-y-1 text-sm"><span className="font-medium">{label}</span>
    {multiline ? <textarea className={fieldClass} rows={3} value={value || ''} onChange={event => onChange(event.target.value)} />
      : <input className={fieldClass} value={value || ''} onChange={event => onChange(event.target.value)} />}</label>
);
const lines = (value: string) => value.split('\n').map(item => item.trim()).filter(Boolean);

function RatingEditor({ label, rating, onChange }: { label: string; rating: RiskRating; onChange: (rating: RiskRating) => void }) {
  return <fieldset className="rounded-xl border border-border p-3 space-y-3"><legend className="px-1 font-semibold">{label}: {rateRisk(rating).band}</legend>
    <div className="grid gap-3 md:grid-cols-2">{(['likelihood', 'impact'] as const).map(dimension => <label key={dimension} className="text-sm space-y-1">
      <span className="block capitalize">{dimension}</span><select className={fieldClass} value={rating[dimension] ?? ''}
        onChange={event => onChange({ ...rating, [dimension]: event.target.value ? Number(event.target.value) : null })}>
        <option value="">Not rated / unknown</option>
        {(dimension === 'likelihood' ? LIKELIHOOD_LEVELS : IMPACT_LEVELS).map((level, index) => <option key={level} value={index + 1}>{index + 1}: {level}</option>)}
      </select></label>)}</div>
    <Field label="Rating rationale and applicable control evidence" value={rating.rationale} multiline onChange={rationale => onChange({ ...rating, rationale })} />
    <Field label="Rating reviewer (person or role)" value={rating.reviewer} onChange={reviewer => onChange({ ...rating, reviewer })} />
  </fieldset>;
}

export function AssessmentReview({ model, initialRiskId, onDirtyChange }: { model: ThreatModel; initialRiskId?: string | null; onDirtyChange?: (dirty: boolean) => void }) {
  const [draft, setDraft] = useState<AssessmentQuality>(() => structuredClone(model.quality!));
  const [selectedId, setSelectedId] = useState(initialRiskId || draft.risks[0]?.id || '');
  const [actor, setActor] = useState('');
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [pendingSources, setPendingSources] = useState<EvidenceSource[]>([]);
  const [artifactName, setArtifactName] = useState('');
  const [artifactText, setArtifactText] = useState('');
  const sourceDrawer = React.useRef<HTMLDetailsElement>(null);
  const viewSource = (id: string) => {
    setSourceId(id);
    if (sourceDrawer.current) { sourceDrawer.current.open = true; sourceDrawer.current.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  };
  const dirty = JSON.stringify(draft) !== JSON.stringify(model.quality) || !!pendingSources.length || !!artifactText || !!artifactName;
  useEffect(() => {
    onDirtyChange?.(dirty);
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const beforeNavigate = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (link && !window.confirm('Leave without saving this review draft?')) {
        event.preventDefault(); event.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', beforeNavigate, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', beforeNavigate, true);
      onDirtyChange?.(false);
    };
  }, [dirty, onDirtyChange]);
  const storedSources = useLiveQuery(() => db.evidenceSources.bulkGet(model.quality!.sourceIds), [model.id, model.quality?.revision]);
  const revisions = useLiveQuery(() => db.assessmentRevisions.where('modelId').equals(model.id).toArray(), [model.id, model.quality?.revision]);
  const sources = [...(storedSources || []).filter(source => source !== undefined), ...pendingSources];
  const selectedSource = sources.find(source => source.id === sourceId);
  const visibleRisks = draft.risks.filter(item => `${item.id} ${item.owner} ${item.disposition} ${item.evidenceStatus} ${item.frameworkTags.join(' ')} ${rateRisk(item.current).band}`.toLowerCase().includes(filter.toLowerCase()));
  const risk = visibleRisks.find(item => item.id === selectedId);
  const summary = assessmentSummary(draft);
  const updateRisk = (change: (risk: RiskRecord) => void) => setDraft(previous => {
    const next = structuredClone(previous);
    const selected = next.risks.find(item => item.id === selectedId);
    if (selected) {
      const definition = riskDefinition(selected);
      change(selected);
      if (riskDefinition(selected) !== definition) resetRiskReview(selected);
    }
    return next;
  });
  const save = async () => {
    setSaving(true);
    try {
      await saveAssessmentReview(model.id, draft.revision, draft, actor, pendingSources);
      const saved = await db.threatModels.get(model.id);
      setDraft(structuredClone(saved!.quality!));
      setPendingSources([]);
      toast.success('Review saved. Decisions are local self-attestations, not authenticated approvals.');
    } catch (error) { console.error('Assessment review save failed', error); toast.error(getErrorMessage(error)); }
    finally { setSaving(false); }
  };
  const addArtifact = async () => {
    try {
      if (!artifactName.trim() || !artifactText.trim()) throw new Error('Provide an artifact name and the actual verification result.');
      const clean = sanitiseSection(artifactText);
      if (!clean.passed || !clean.text) throw new Error('Verification text was empty or excluded by the input security checks.');
      const source = await makeEvidenceSource({ name: artifactName.trim(), kind: 'verification-artifact', text: clean.text,
        collectedAt: new Date().toISOString(), version: 'user-supplied-verification-v1', derived: false, status: 'Complete',
        note: 'User-supplied result. Authenticity and applicability are locally self-attested, not independently verified.' });
      setPendingSources(previous => [...previous, source]);
      setDraft(previous => ({ ...previous, sourceIds: [...previous.sourceIds, source.id] }));
      setSourceId(source.id);
      setArtifactName(''); setArtifactText('');
      toast.info('Artifact added to the draft. Save the review to retain it.');
    } catch (error) { console.error('Verification artifact rejected', error); toast.error(getErrorMessage(error)); }
  };
  const issues = risk ? riskIssues(risk, draft, sources) : [];
  return <div className="flex-1 overflow-y-auto p-6 space-y-6">
    <header className="space-y-2"><h3 className="text-xl font-bold">Evidence &amp; Risk Review</h3>
      {dirty && <p role="status" className="text-sm text-amber-600">Unsaved review draft</p>}
      <p className="text-sm text-muted-foreground">Review required. {summary.blockers} blockers; {summary.unrated} unrated risks; {summary.accepted} active acceptances; {summary.closed} recorded evidence-based closures. CVSS/DREAD are technical assessments, not this business-risk matrix.</p>
      <p className="text-xs text-muted-foreground">Rubric seidr-5x5-v1: likelihood × impact, 1–5 each. Low 1–5; Medium 6–11; High 12–19; Critical 20–25. Unknown is never low. Adjusting business thresholds requires a new rubric version. Local records are not tamper-proof.</p>
      <p className="text-xs text-muted-foreground">Changing scope, environment, version, scenarios, source references or treatment definitions resets affected ratings and verification. Save those changes before recording a fresh review. Retained artifacts remain available.</p>
    </header>
    <div className="grid gap-3 md:grid-cols-2">
      <Field label="Scope and exclusions" value={draft.scope} multiline onChange={scope => setDraft(previous => changeAssessmentScope(previous, { scope }))} />
      <Field label="Assessed environment" value={draft.environment} onChange={environment => setDraft(previous => changeAssessmentScope(previous, { environment }))} />
      <Field label="System / deployment version" value={draft.systemVersion} onChange={systemVersion => setDraft(previous => changeAssessmentScope(previous, { systemVersion }))} />
      <Field label="Business rubric approved by (person or role)" value={draft.rubric.approvedBy}
        onChange={approvedBy => setDraft(previous => ({ ...previous, rubric: { ...previous.rubric, approvedBy, approvedAt: new Date().toISOString() } }))} />
    </div>
    <details className="rounded-xl border border-border p-3"><summary className="font-semibold cursor-pointer">Collection and generation limitations ({draft.stageIssues.length})</summary>
      <Field label="Outstanding limitations (one per line; record resolution in your review before removing)" value={draft.stageIssues.join('\n')} multiline
        onChange={value => setDraft(previous => ({ ...previous, stageIssues: lines(value) }))} />
    </details>
    <Field label="Filter risks by ID, owner, state, evidence or framework" value={filter} onChange={setFilter} />
    <label className="block text-sm font-medium">Risk<select className={fieldClass} value={risk ? selectedId : ''} onChange={event => setSelectedId(event.target.value)}>
      <option value="">Select a matching risk</option>{visibleRisks
        .map(item => <option key={item.id} value={item.id}>{model.threats.find(threat => threat.id === item.id)?.title || item.id} — {item.disposition} — {item.owner || 'Owner unconfirmed'}</option>)}
    </select></label>
    {risk ? <section className="space-y-4 rounded-2xl border border-border p-4">
      <p className="font-mono text-xs break-all">{risk.id}</p>
      <div className="grid gap-3 md:grid-cols-2">{(['actor', 'preconditions', 'action', 'asset', 'consequence'] as const).map(key =>
        <Field key={key} label={`Scenario: ${key}`} value={risk.scenario[key]} onChange={value => updateRisk(item => { item.scenario[key] = value; })} />)}
        <Field label="Confirmed accountable owner (person or role)" value={risk.owner} onChange={owner => updateRisk(item => { item.owner = owner; })} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm">Evidence status<select className={fieldClass} value={risk.evidenceStatus}
          onChange={event => updateRisk(item => { item.evidenceStatus = event.target.value as RiskRecord['evidenceStatus']; })}>
          {['Observed', 'Documented but unverified', 'Hypothesis', 'Not assessed'].map(state => <option key={state}>{state}</option>)}</select></label>
        <label className="text-sm">Confidence<select className={fieldClass} value={risk.confidence.level}
          onChange={event => updateRisk(item => { item.confidence.level = event.target.value as RiskRecord['confidence']['level']; })}>
          {['Low', 'Medium', 'High'].map(level => <option key={level}>{level}</option>)}</select></label>
      </div>
      <Field label="Confidence rationale" value={risk.confidence.reason} multiline onChange={reason => updateRisk(item => { item.confidence.reason = reason; })} />
      <div className="space-y-2"><h4 className="font-semibold">Located evidence</h4>
        {risk.references.map((reference, index) => <div className="rounded-lg border border-border p-3 space-y-2" key={`${index}:${reference.sourceId}`}>
          <select aria-label={`Evidence source ${index + 1}`} className={fieldClass} value={reference.sourceId}
            onChange={event => updateRisk(item => { item.references[index].sourceId = event.target.value; })}>
            <option value="">Select retained source</option>{sources.map(source => <option key={source.id} value={source.id}>{source.name}</option>)}</select>
          <Field label="Exact source quote" value={reference.quote} multiline onChange={quote => updateRisk(item => { item.references[index].quote = quote; })} />
          <div className="flex gap-3">{(['startLine', 'endLine'] as const).map(key => <label key={key} className="text-sm">{key}<input className={fieldClass} type="number" min={1}
            value={reference[key]} onChange={event => updateRisk(item => { item.references[index][key] = Number(event.target.value); })} /></label>)}</div>
          <button type="button" className="text-sm text-primary underline" onClick={() => viewSource(reference.sourceId)}>View retained source</button>
          <button type="button" className="text-sm text-destructive ml-4" onClick={() => updateRisk(item => { item.references.splice(index, 1); })}>Remove reference</button>
        </div>)}
        <button type="button" className="text-sm text-primary underline" onClick={() => updateRisk(item => { item.references.push({ sourceId: sources[0]?.id || '', startLine: 1, endLine: 1, quote: '' }); })}>Add source reference</button>
      </div>
      {risk.missingEvidence.map((request, index) => <div className="grid gap-3 md:grid-cols-3" key={index}>
        {(['question', 'supplier', 'verification'] as const).map(key => <Field key={key} label={`Evidence request: ${key}`} value={request[key]}
          onChange={value => updateRisk(item => { item.missingEvidence[index][key] = value; })} />)}
        <label className="text-sm"><input type="checkbox" checked={request.resolved} onChange={event => updateRisk(item => { item.missingEvidence[index].resolved = event.target.checked; })} /> Request resolved by retained proof</label>
        <select multiple aria-label={`Evidence request artifacts ${index + 1}`} className={fieldClass} value={request.artifactSourceIds}
          onChange={event => { const ids = Array.from(event.target.selectedOptions, option => option.value); updateRisk(item => { item.missingEvidence[index].artifactSourceIds = ids; }); }}>
          {sources.filter(source => source.kind === 'verification-artifact').map(source => <option key={source.id} value={source.id}>{source.name}</option>)}</select></div>)}
      <button type="button" className="text-sm text-primary underline" onClick={() => updateRisk(item => {
        item.missingEvidence.push({ question: '', supplier: '', verification: '', resolved: false, artifactSourceIds: [] });
      })}>Add evidence request</button>
      <div className="grid gap-4 lg:grid-cols-3">{(['inherent', 'current', 'target'] as const).map(key =>
        <RatingEditor key={key} label={key === 'target' ? 'Conditional target (not current)' : `${key} risk`}
          rating={risk[key]} onChange={rating => updateRisk(item => { item[key] = rating; })} />)}</div>
      {risk.controls.length > 0 && <div className="space-y-2"><h4 className="font-semibold">Recorded controls</h4>{risk.controls.map((control, index) =>
        <div key={index} className="p-3 border rounded-xl space-y-2"><p>{control.description} — {control.state}</p>
          <Field label="Control description" value={control.description} onChange={description => updateRisk(item => { item.controls[index].description = description; })} />
          <label className="text-sm">Control state<select className={fieldClass} value={control.state} onChange={event => updateRisk(item => {
            item.controls[index].state = event.target.value as typeof control.state; item.controls[index].verified = false;
          })}>{['Current', 'Proposed', 'Planned', 'Assumed'].map(state => <option key={state}>{state}</option>)}</select></label>
          <p className="text-xs">Current effectiveness needs applicable verification artifacts; planned controls cannot reduce current risk.</p>
          <select multiple aria-label={`Control artifacts ${index + 1}`} className={fieldClass} value={control.artifactSourceIds}
            onChange={event => { const ids = Array.from(event.target.selectedOptions, option => option.value); updateRisk(item => { item.controls[index].artifactSourceIds = ids; }); }}>
            {sources.filter(source => source.kind === 'verification-artifact').map(source => <option key={source.id} value={source.id}>{source.name}</option>)}</select>
          <label className="text-sm"><input type="checkbox" checked={control.verified} disabled={control.state !== 'Current'}
            onChange={event => updateRisk(item => { item.controls[index].verified = event.target.checked; })} /> Reviewer attests current effectiveness for this environment</label>
        </div>)}</div>}
      <button type="button" className="text-sm text-primary underline" onClick={() => updateRisk(item => {
        item.controls.push({ description: '', state: 'Proposed', verified: false, artifactSourceIds: [] });
      })}>Add control for review</button>
      <h4 className="font-semibold">Actions and verification ({risk.actions.length})</h4>
      {risk.actions.map((action, index) => <fieldset className="rounded-xl border border-border p-4 space-y-3" key={action.id}>
        <legend className="text-xs font-mono">{action.id}</legend><p className="text-sm text-muted-foreground">Suggested owner: {action.proposedOwner || 'Not proposed'} (unconfirmed)</p>
        <div className="grid gap-3 md:grid-cols-2">{(['description', 'owner', 'milestone', 'acceptanceTest', 'expectedArtifact', 'incompleteRisk'] as const).map(key =>
          <Field key={key} label={key} value={action[key]} multiline={key === 'acceptanceTest'} onChange={value => updateRisk(item => { item.actions[index][key] = value; })} />)}
          <Field label="Dependencies (one per line)" value={action.dependencies.join('\n')} multiline onChange={value => updateRisk(item => { item.actions[index].dependencies = lines(value); })} />
          <Field label="Linked requirements (one per line)" value={action.requirements.join('\n')} multiline onChange={value => updateRisk(item => { item.actions[index].requirements = lines(value); })} />
          <label className="text-sm">Action priority<select className={fieldClass} value={action.priority}
            onChange={event => updateRisk(item => { item.actions[index].priority = event.target.value as typeof action.priority; })}>
            {['Before launch', 'High', 'Normal'].map(priority => <option key={priority}>{priority}</option>)}</select></label>
          <label className="text-sm">Action status<select className={fieldClass} value={action.status}
            onChange={event => updateRisk(item => { item.actions[index].status = event.target.value as typeof action.status; })}>
            {['Open', 'In Progress', 'Awaiting verification', 'Verified'].map(status => <option key={status}>{status}</option>)}</select></label>
          <label className="text-sm">Verification result<select className={fieldClass} value={action.verification.result}
            onChange={event => updateRisk(item => { item.actions[index].verification.result = event.target.value as typeof action.verification.result; })}>
            {['Not run', 'Pass', 'Fail'].map(result => <option key={result}>{result}</option>)}</select></label>
          {(['reviewer', 'at', 'environment'] as const).map(key => <Field key={key} label={`Verification ${key}${key === 'at' ? ' (ISO date)' : ''}`} value={action.verification[key]}
            onChange={value => updateRisk(item => { item.actions[index].verification[key] = value; })} />)}
        </div>
        <label className="block text-sm">Verification artifacts (select applicable retained results)<select multiple className={fieldClass} value={action.verification.artifactSourceIds}
          onChange={event => { const ids = Array.from(event.target.selectedOptions, option => option.value); updateRisk(item => { item.actions[index].verification.artifactSourceIds = ids; }); }}>
          {sources.filter(source => source.kind === 'verification-artifact').map(source => <option key={source.id} value={source.id}>{source.name}</option>)}</select></label>
      </fieldset>)}
      <button type="button" className="text-sm text-primary underline" onClick={() => updateRisk(item => { item.actions.push({
        id: `ACTION-${crypto.randomUUID()}`, description: '', owner: '', proposedOwner: '', priority: 'Before launch', milestone: '', dependencies: [], requirements: [],
        acceptanceTest: '', expectedArtifact: '', incompleteRisk: '', status: 'Open',
        verification: { result: 'Not run', artifactSourceIds: [], reviewer: '', at: '', environment: '' },
      }); })}>Add treatment action</button>
      <label className="block text-sm">Disposition (decision state)<select className={fieldClass} value={risk.disposition}
        onChange={event => updateRisk(item => { item.disposition = event.target.value as RiskRecord['disposition']; })}>
        {['Blocker', 'Owner acceptance required', 'Proposed acceptance', 'Accepted risk', 'Closed with evidence'].map(state => <option key={state}>{state}</option>)}</select></label>
      <div className="grid gap-3 md:grid-cols-2">{(['owner', 'rationale', 'at', 'expiresAt', 'reviewTrigger'] as const).map(key =>
        <Field key={key} label={`Decision ${key}${['at', 'expiresAt'].includes(key) ? ' (ISO date)' : ''}`} value={risk.decision[key]}
          onChange={value => updateRisk(item => { item.decision[key] = value; })} />)}</div>
      <Field label="Open generation/review issues (remove only after recording resolution)" value={risk.issues.join('\n')} multiline
        onChange={value => updateRisk(item => { item.issues = lines(value); })} />
      <Field label="Risk review trigger" value={risk.reviewTrigger} onChange={reviewTrigger => updateRisk(item => { item.reviewTrigger = reviewTrigger; })} />
      {issues.length > 0 && <div role="status" className="rounded-xl border border-amber-500/30 p-3 text-sm"><h4 className="font-semibold">Outstanding review checks</h4>
        <ul className="list-disc pl-5">{issues.map(issue => <li key={issue}>{issue}</li>)}</ul></div>}
    </section> : <p>No risks recorded. This does not establish safety or completed coverage.</p>}
    <details className="rounded-xl border border-border p-4"><summary className="font-semibold cursor-pointer">Architecture / flow coverage (not a safety score)</summary>
      <p className="text-sm my-3">{draft.coverage.filter(row => row.state === 'Examined').length} / {draft.coverage.length} recorded items marked examined. Unknown is not examined.</p>
      {draft.coverage.map((row, index) => <div key={row.id} className="grid gap-3 border-t py-3 md:grid-cols-3"><p className="text-sm">{row.kind}: {row.name}</p>
        <select aria-label={`Coverage ${row.id}`} className={fieldClass} value={row.state} onChange={event => setDraft(previous => {
          const next = structuredClone(previous); next.coverage[index].state = event.target.value as typeof row.state; return next;
        })}>{['Examined', 'Not applicable', 'Out of scope', 'Blocked', 'Not assessed'].map(state => <option key={state}>{state}</option>)}</select>
        <Field label="Coverage rationale" value={row.rationale} onChange={rationale => setDraft(previous => {
          const next = structuredClone(previous); next.coverage[index].rationale = rationale; return next;
        })} />
        <Field label="Coverage reviewer" value={row.owner} onChange={owner => setDraft(previous => {
          const next = structuredClone(previous); next.coverage[index].owner = owner; return next;
        })} />
        <select aria-label={`Coverage source ${row.id}`} className={fieldClass} value={row.references[0]?.sourceId || ''} onChange={event => {
          const id = event.target.value; setDraft(previous => { const next = structuredClone(previous);
            next.coverage[index].references = id ? [{ sourceId: id, startLine: 1, endLine: 1, quote: '' }] : []; return next; });
        }}><option value="">Select coverage evidence</option>{sources.map(source => <option key={source.id} value={source.id}>{source.name}</option>)}</select>
        {row.references[0] && <><Field label="Coverage source quote" value={row.references[0].quote} multiline onChange={quote => setDraft(previous => {
          const next = structuredClone(previous); next.coverage[index].references[0].quote = quote; return next;
        })} />{(['startLine', 'endLine'] as const).map(key => <label key={key} className="text-sm">{key}<input className={fieldClass} type="number" min={1}
          value={row.references[0][key]} onChange={event => { const value = Number(event.target.value); setDraft(previous => {
            const next = structuredClone(previous); next.coverage[index].references[0][key] = value; return next;
          }); }} /></label>)}</>}</div>)}
    </details>
    <details ref={sourceDrawer} className="rounded-xl border border-border p-4"><summary className="font-semibold cursor-pointer">Retained sources &amp; verification artifacts</summary>
      <select aria-label="Retained source" className={`${fieldClass} my-3`} value={sourceId} onChange={event => setSourceId(event.target.value)}>
        <option value="">Select source</option>{sources.map(source => <option key={source.id} value={source.id}>{source.name} {source.derived ? '(generated)' : ''}</option>)}</select>
      {selectedSource && <div className="space-y-2 text-xs"><p className="break-all">{selectedSource.id}<br />SHA-256: {selectedSource.contentHash}<br />
        Collected: {selectedSource.collectedAt}; version: {selectedSource.version}; {selectedSource.status}; {selectedSource.derived ? 'Generated, not primary evidence' : 'Retained source'}</p>
        <p>{selectedSource.note}</p>
        {(selectedSource.parentSourceIds || []).map(id => <button key={id} type="button" className="block text-primary underline break-all text-left" onClick={() => viewSource(id)}>
          Original source: {sources.find(source => source.id === id)?.name || id}
        </button>)}
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-secondary p-3">{selectedSource.text.split(/\r?\n/).map((line, index) => `${index + 1}: ${line}`).join('\n')}</pre></div>}
      <div className="space-y-3 mt-4"><Field label="Verification artifact name" value={artifactName} onChange={setArtifactName} />
        <Field label="Actual verification output (sanitized, retained locally)" value={artifactText} multiline onChange={setArtifactText} />
        <button type="button" onClick={addArtifact} className="text-sm text-primary underline">Add artifact to draft</button></div>
    </details>
    <details className="rounded-xl border border-border p-4"><summary className="font-semibold cursor-pointer">Local revision history</summary>
      {(revisions || []).map(revision => <p key={revision.id} className="text-sm">Revision {revision.revision}: {revision.recordedAt}</p>)}
      {draft.history.map((event, index) => <p className="text-xs my-2" key={index}>{event.at}: {event.actor} — {event.event}</p>)}
    </details>
    <div className="sticky bottom-0 bg-card border rounded-xl p-4 flex flex-wrap items-end gap-3">
      <div className="flex-1"><Field label="Recording reviewer (local self-attestation)" value={actor} onChange={setActor} /></div>
      <button type="button" disabled={saving || storedSources === undefined} onClick={save} className="rounded-lg bg-primary text-primary-foreground px-4 py-2 disabled:opacity-50">{saving ? 'Saving...' : 'Save review'}</button>
      {model.quality!.revision !== draft.revision && <><p role="alert" className="text-sm text-destructive">A newer revision exists. Your draft is retained.</p>
        <button type="button" className="text-sm underline" onClick={() => {
          if (window.confirm('Replace this unsaved draft with the latest saved revision?')) {
            setDraft(structuredClone(model.quality!)); setPendingSources([]);
          }
        }}>Reload latest revision</button></>}
    </div>
  </div>;
}
