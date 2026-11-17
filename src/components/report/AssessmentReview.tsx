import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { db, type ThreatModel } from '@/lib/db';
import { loadAssessmentParent, saveAssessmentReview, saveLifecycleEvent, saveReconciliation, saveReassessmentLink } from '@/lib/backend/assessmentStore';
import { compareAssessments, type ReconciliationCommand } from '@/lib/backend/assessmentLifecycle';
import { buildAssessmentExport } from '@/lib/reportExport';
import { getErrorMessage } from '@/lib/backend/inputUtils';
import { sanitiseSection } from '@/lib/backend/analysisContext';
import { assessmentSummary, changeAssessmentScope, emptyReleaseDecision, makeEvidenceSource, qualitySchema, rateRisk, resetRiskReview, riskDefinition, riskIssues, LIKELIHOOD_LEVELS, IMPACT_LEVELS,
  type AssessmentQuality, type EvidenceSource, type RiskRating, type RiskRecord } from '@/lib/backend/assessmentQuality';
import { assessmentReadiness, recordedDecisionLabel, releaseDecisionIssues } from '@/lib/backend/assessmentWorkflow';
import { generatePendingTreatment } from '@/lib/backend/assessmentJobs';

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

function EvidenceRequests({ requests, sources, onChange, prefix = 'Evidence request' }: {
  requests: RiskRecord['missingEvidence']; sources: EvidenceSource[];
  onChange: (requests: RiskRecord['missingEvidence']) => void; prefix?: string;
}) {
  const update = (index: number, change: (request: RiskRecord['missingEvidence'][number]) => void) => {
    const next = structuredClone(requests); change(next[index]); onChange(next);
  };
  return <div className="space-y-3">{requests.map((request, index) => <div className="grid gap-3 md:grid-cols-3 border rounded-lg p-3" key={index}>
    {(['question', 'supplier', 'verification'] as const).map(key => <Field key={key} label={`${prefix}: ${key}`} value={request[key]} multiline={key !== 'supplier'}
      onChange={value => update(index, item => { item[key] = value; item.resolved = false; })} />)}
    <label className="text-sm"><input type="checkbox" checked={request.resolved} onChange={event => update(index, item => { item.resolved = event.target.checked; })} /> Request resolved by retained proof</label>
    <select multiple aria-label={`${prefix} artifacts ${index + 1}`} className={fieldClass} value={request.artifactSourceIds}
      onChange={event => { const ids = Array.from(event.target.selectedOptions, option => option.value); update(index, item => { item.artifactSourceIds = ids; }); }}>
      {sources.filter(source => source.kind === 'verification-artifact').map(source => <option key={source.id} value={source.id}>{source.name}</option>)}</select>
  </div>)}</div>;
}

export function AssessmentReview({ model, initialRiskId, onDirtyChange }: { model: ThreatModel; initialRiskId?: string | null; onDirtyChange?: (dirty: boolean) => void }) {
  const [draft, writeDraft] = useState<AssessmentQuality>(() => qualitySchema.parse(model.quality));
  const setDraft = React.useCallback<React.Dispatch<React.SetStateAction<AssessmentQuality>>>(update => writeDraft(previous => {
    const next = typeof update === 'function' ? update(previous) : update;
    if (typeof update === 'function' && JSON.stringify(next.releaseDecision) === JSON.stringify(previous.releaseDecision)
      && JSON.stringify({ ...next, releaseDecision: undefined }) !== JSON.stringify({ ...previous, releaseDecision: undefined })) {
      return { ...next, releaseDecision: emptyReleaseDecision() };
    }
    return next;
  }), []);
  const [selectedId, setSelectedId] = useState(initialRiskId || draft.risks[0]?.id || '');
  const [actor, setActor] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [jobProgress, setJobProgress] = useState('');
  const [reconcileIds, setReconcileIds] = useState<string[]>([]);
  const [splitIds, setSplitIds] = useState<string[]>([]);
  const [lineageRiskId, setLineageRiskId] = useState('');
  const [changeReason, setChangeReason] = useState('');
  const [changeEvent, setChangeEvent] = useState('Provider/model change');
  const [revisionView, setRevisionView] = useState('');
  const jobController = React.useRef<AbortController | null>(null);
  useEffect(() => () => jobController.current?.abort(), []);
  const [filter, setFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [ratingFilter, setRatingFilter] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [pendingSources, setPendingSources] = useState<EvidenceSource[]>([]);
  const [artifactName, setArtifactName] = useState('');
  const [artifactText, setArtifactText] = useState('');
  const sourceDrawer = React.useRef<HTMLDetailsElement>(null);
  const viewSource = (id: string) => {
    setSourceId(id);
    if (sourceDrawer.current) { sourceDrawer.current.open = true; sourceDrawer.current.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  };
  const dirty = JSON.stringify(draft) !== JSON.stringify(qualitySchema.parse(model.quality)) || !!pendingSources.length || !!artifactText || !!artifactName || !!reviewNote || generating;
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
  const comparison = useLiveQuery(async () => {
    if (!model.quality?.parentAssessmentId) return null;
    const parent = await loadAssessmentParent(model);
    if (!parent?.quality || parent.quality.systemId !== model.quality.systemId || parent.quality.environment !== model.quality.environment) return null;
    const allSources = (await db.evidenceSources.bulkGet([...new Set([...parent.quality.sourceIds, ...model.quality.sourceIds])])).filter(source => source !== undefined);
    return { ...compareAssessments(parent, model, allSources), parentRisks: parent.quality.risks.map(risk => ({
      id: risk.id, title: parent.threats.find(threat => threat.id === risk.id)?.title || risk.id,
    })) };
  }, [model.id, model.quality?.revision]);
  const sources = [...(storedSources || []).filter(source => source !== undefined), ...pendingSources];
  const selectedSource = sources.find(source => source.id === sourceId);
  const visibleRisks = draft.risks.filter(item => {
    const threat = model.threats.find(threat => threat.id === item.id);
    return (!severityFilter || threat?.severity === severityFilter)
      && (!ratingFilter || rateRisk(item.current).band === ratingFilter) && (!stateFilter || item.disposition === stateFilter)
      && `${item.id} ${item.owner} ${item.actions.map(action => `${action.proposedOwner} ${action.owner} ${action.status}`).join(' ')}
        ${item.disposition} ${item.evidenceStatus} ${item.frameworkTags.join(' ')} ${rateRisk(item.current).band} ${threat?.severity}
        ${draft.scope} ${draft.environment} ${draft.systemVersion}`.toLowerCase().includes(filter.toLowerCase());
  });
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
      await saveAssessmentReview(model.id, draft.revision, draft, actor, pendingSources, reviewNote);
      const saved = await db.threatModels.get(model.id);
      setDraft(structuredClone(saved!.quality!));
      setPendingSources([]);
      setReviewNote('');
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
  const readiness = assessmentReadiness(draft);
  const generateTreatment = async () => {
    if (dirty || draft.revision !== model.quality!.revision) { toast.error('Save or reload the review draft before generating missing treatment.'); return; }
    jobController.current = new AbortController();
    setGenerating(true); setJobProgress('Starting missing treatment plans...');
    try {
      await generatePendingTreatment(model.id, jobController.current.signal, (done, total) => setJobProgress(`${done} / ${total} plans processed`));
      setDraft(qualitySchema.parse((await db.threatModels.get(model.id))?.quality));
      toast.info('Treatment generation saved. Review proposed owners and tests; verification has not been performed.');
    } catch (error) { console.error('Treatment generation failed', error); toast.error(getErrorMessage(error)); }
    finally { setGenerating(false); setJobProgress(''); jobController.current = null; }
  };
  const recordChange = async (command?: ReconciliationCommand, linkParentRisk = false) => {
    if (dirty || draft.revision !== model.quality!.revision) { toast.error('Save or reload the review draft before recording a lifecycle or reconciliation change.'); return; }
    if (!actor.trim() || !changeReason.trim()) { toast.error('Provide the recording reviewer and change reason.'); return; }
    if (!window.confirm('Record this change as a new revision? Relevant ratings, verification and the system decision will require fresh review. Prior revisions and observations remain retained.')) return;
    setSaving(true);
    try {
      if (linkParentRisk) await saveReassessmentLink(model.id, draft.revision, selectedId, lineageRiskId, changeReason, actor);
      else if (command) await saveReconciliation(model.id, draft.revision, command, actor);
      else await saveLifecycleEvent(model.id, draft.revision, changeEvent, changeReason, actor);
      const saved = await db.threatModels.get(model.id);
      setDraft(qualitySchema.parse(saved?.quality)); setSelectedId(saved?.quality?.risks[0]?.id || '');
      setReconcileIds([]); setSplitIds([]); setChangeReason(''); setLineageRiskId('');
      toast.success('Change recorded. Review the affected risks and coverage before a fresh decision.');
    } catch (error) { console.error('Assessment change failed', error); toast.error(getErrorMessage(error)); }
    finally { setSaving(false); }
  };
  const downloadRevision = async (snapshot: ThreatModel) => {
    try {
      const evidenceManifest = (await db.evidenceSources.bulkGet(snapshot.quality!.sourceIds)).filter(source => source !== undefined)
        .map(({ text: _text, ...metadata }) => metadata);
      const url = URL.createObjectURL(new Blob([JSON.stringify(buildAssessmentExport({ ...snapshot, evidenceManifest }), null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `${snapshot.id}-revision-${snapshot.quality!.revision}.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { toast.error(`Revision export failed: ${getErrorMessage(error)}`); }
  };
  return <div className="flex-1 overflow-y-auto p-6 space-y-6">
    <header className="space-y-2"><h3 className="text-xl font-bold">Evidence &amp; Risk Review</h3>
      {dirty && <p role="status" className="text-sm text-amber-600">Unsaved review draft</p>}
      <p className="text-sm text-muted-foreground">{recordedDecisionLabel(draft)}. {summary.blockers} blockers; {summary.unrated} unrated risks; {summary.accepted} active acceptances; {summary.closed} recorded evidence-based closures. CVSS/DREAD are technical assessments, not this business-risk matrix.</p>
      <p className="text-xs text-muted-foreground">Rubric seidr-5x5-v1: likelihood × impact, 1–5 each. Low 1–5; Medium 6–11; High 12–19; Critical 20–25. Unknown is never low. Adjusting business thresholds requires a new rubric version. Local records are not tamper-proof.</p>
      <p className="text-xs text-muted-foreground">Changing scope, environment, version, scenarios, source references or treatment definitions resets affected ratings and verification. Save those changes before recording a fresh review. Retained artifacts remain available.</p>
      <div className="flex flex-wrap gap-3 items-center text-sm">
        <button type="button" className="text-primary underline disabled:opacity-50" disabled={generating || saving || !draft.risks.some(risk => !risk.actions.length)}
          onClick={generateTreatment}>Generate / retry missing treatment</button>
        {generating && <><span role="status">{jobProgress}</span><button type="button" className="underline" onClick={() => jobController.current?.abort()}>Cancel remaining plans (active calls finish)</button></>}
      </div>
    </header>
    <fieldset disabled={generating || saving} className="contents">
    <details className="rounded-xl border border-border p-4" open>
      <summary className="font-semibold cursor-pointer">System decision: {recordedDecisionLabel(draft)} / application recommendation: {readiness.recommendation}</summary>
      <p className="text-sm my-2">{readiness.ownerDecisions} risk decisions outstanding; {readiness.unanswered} unanswered evidence questions. Conditional go records pending gates, not clearance to launch before they pass.</p>
      <details><summary className="text-sm cursor-pointer">Decision-impact checks ({readiness.reasons.length})</summary>
        <ul className="text-xs list-disc pl-5 max-h-52 overflow-auto">{readiness.reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul>
      </details>
      <label className="block text-sm my-3">Owner release decision<select className={fieldClass} value={draft.releaseDecision.state}
        onChange={event => setDraft(previous => ({ ...previous, releaseDecision: { ...previous.releaseDecision,
          state: event.target.value as AssessmentQuality['releaseDecision']['state'], at: previous.releaseDecision.at || new Date().toISOString() } }))}>
        {['Not recorded', 'Go', 'Conditional go', 'Hold'].map(state => <option key={state}>{state}</option>)}</select></label>
      <div className="grid gap-3 md:grid-cols-2">{(['owner', 'rationale', 'at', 'expiresAt', 'reviewTrigger'] as const).map(key =>
        <Field key={key} label={`Release decision ${key}${['at', 'expiresAt'].includes(key) ? ' (ISO date)' : ''}`} value={draft.releaseDecision[key]}
          onChange={value => setDraft(previous => ({ ...previous, releaseDecision: { ...previous.releaseDecision, [key]: value } }))} />)}</div>
      {draft.releaseDecision.conditions.map((condition, index) => <div key={index} className="grid gap-3 md:grid-cols-2 border-t my-3 pt-3">
        {(['requirement', 'owner'] as const).map(key => <Field key={key} label={`Release gate ${key}`} value={condition[key]} onChange={value => setDraft(previous => {
          const next = structuredClone(previous); next.releaseDecision.conditions[index][key] = value; return next;
        })} />)}
        <select className={fieldClass} aria-label={`Release gate risk ${index + 1}`} value={condition.riskId} onChange={event => setDraft(previous => {
          const next = structuredClone(previous); next.releaseDecision.conditions[index].riskId = event.target.value; next.releaseDecision.conditions[index].actionId = ''; return next;
        })}><option value="">Global scope / evidence gate</option>{draft.risks.map(item => <option key={item.id} value={item.id}>{model.threats.find(threat => threat.id === item.id)?.title || item.id}</option>)}</select>
        <select className={fieldClass} aria-label={`Release gate action ${index + 1}`} value={condition.actionId} onChange={event => setDraft(previous => {
          const next = structuredClone(previous); next.releaseDecision.conditions[index].actionId = event.target.value; return next;
        })}><option value="">Decision / verification gate</option>{draft.risks.find(item => item.id === condition.riskId)?.actions.map(action => <option key={action.id} value={action.id}>{action.description}</option>)}</select>
        <button type="button" className="text-sm underline" onClick={() => setDraft(previous => ({ ...previous,
          releaseDecision: { ...previous.releaseDecision, conditions: previous.releaseDecision.conditions.filter((_, position) => position !== index) } }))}>Remove release gate</button>
      </div>)}
      <button type="button" className="text-sm text-primary underline mt-3" onClick={() => setDraft(previous => ({ ...previous,
        releaseDecision: { ...previous.releaseDecision, conditions: [...previous.releaseDecision.conditions, { requirement: '', owner: '', riskId: '', actionId: '' }] } }))}>Add owned release gate</button>
      {releaseDecisionIssues(draft).map(issue => <p role="status" key={issue} className="text-sm text-amber-600">{issue}</p>)}
    </details>
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
    <Field label="Search ID, confirmed/proposed owner, action state, evidence, scope or framework" value={filter} onChange={setFilter} />
    <div className="grid gap-3 md:grid-cols-3 text-sm">
      <label>Technical severity<select className={fieldClass} value={severityFilter} onChange={event => setSeverityFilter(event.target.value)}>
        <option value="">All technical severities</option>{['Critical', 'High', 'Medium', 'Low'].map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Current business risk<select className={fieldClass} value={ratingFilter} onChange={event => setRatingFilter(event.target.value)}>
        <option value="">All current ratings</option>{['Critical', 'High', 'Medium', 'Low', 'Not rated'].map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Owner disposition<select className={fieldClass} value={stateFilter} onChange={event => setStateFilter(event.target.value)}>
        <option value="">All owner states</option>{['Blocker', 'Owner acceptance required', 'Proposed acceptance', 'Accepted risk', 'Closed with evidence'].map(value => <option key={value}>{value}</option>)}</select></label>
    </div>
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
      <EvidenceRequests requests={risk.missingEvidence} sources={sources} onChange={requests => updateRisk(item => { item.missingEvidence = requests; })} />
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
      <p className="text-xs text-muted-foreground">Treatment generation: {risk.treatmentState || (risk.actions.length ? 'Generated' : 'Pending')}. No proposal confirms ownership or verification.</p>
      {risk.treatmentNarrative && <details><summary className="text-sm cursor-pointer">Technical treatment narrative</summary><p className="text-sm whitespace-pre-wrap mt-2">{risk.treatmentNarrative}</p></details>}
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
    </section> : <p>{draft.risks.length ? 'Select a matching risk. Filters do not change assessment totals.' : 'No risks recorded. This does not establish safety or completed coverage.'}</p>}
    <details className="rounded-xl border border-border p-4"><summary className="font-semibold cursor-pointer">Material source conflicts ({draft.conflicts.length})</summary>
      {!draft.conflicts.length && <p className="text-sm mt-2">No conflicting claims were recorded. Check generation limitations; this is not proof that the sources agree.</p>}
      {draft.conflicts.map((conflict, index) => <section key={conflict.id} className="border-t py-4 space-y-3">
        <p className="font-mono text-xs break-all">{conflict.id}</p><p className="text-sm">{conflict.description}</p>
        {conflict.references.map((reference, position) => <div key={position} className="text-sm border rounded-lg p-2">
          <p>Claim {position + 1}: {reference.quote}</p><p className="text-xs">Lines {reference.startLine}-{reference.endLine}; {sources.find(source => source.id === reference.sourceId)?.kind}; version {sources.find(source => source.id === reference.sourceId)?.version}; collected {sources.find(source => source.id === reference.sourceId)?.collectedAt}. Review applicability to {draft.environment || 'unknown environment'} / {draft.systemVersion || 'unknown version'}.</p>
          <button type="button" className="text-primary underline" onClick={() => viewSource(reference.sourceId)}>View conflict source</button>
        </div>)}
        {(['owner', 'verification', 'resolution'] as const).map(key => <Field key={key} label={`Conflict ${key}`} value={conflict[key]} multiline={key !== 'owner'} onChange={value => setDraft(previous => {
          const next = structuredClone(previous); next.conflicts[index][key] = value; next.conflicts[index].resolved = false; return next;
        })} />)}
        <select multiple className={fieldClass} aria-label={`Conflict artifacts ${index + 1}`} value={conflict.artifactSourceIds || []} onChange={event => {
          const ids = Array.from(event.target.selectedOptions, option => option.value); setDraft(previous => {
            const next = structuredClone(previous); next.conflicts[index].artifactSourceIds = ids; next.conflicts[index].resolved = false; return next;
          });
        }}>{sources.filter(source => source.kind === 'verification-artifact').map(source => <option key={source.id} value={source.id}>{source.name}</option>)}</select>
        <label className="text-sm"><input type="checkbox" checked={conflict.resolved} onChange={event => setDraft(previous => {
          const next = structuredClone(previous); next.conflicts[index].resolved = event.target.checked; return next;
        })} /> Reviewer attests the conflict is resolved by recorded proof</label>
      </section>)}
    </details>
    <details className="rounded-xl border border-border p-4"><summary className="font-semibold cursor-pointer">Sourced requirements ({draft.requirements.length})</summary>
      <p className="text-xs my-2">Only registered IDs can be linked to treatment actions. A documented requirement does not prove implementation or legal applicability.</p>
      {draft.requirements.map(requirement => <div key={requirement.id} className="border-t py-3 text-sm">
        <p className="font-mono text-xs break-all">{requirement.id}{requirement.externalId ? ` / ${requirement.externalId}` : ''}</p>
        <p>{requirement.description}</p>{requirement.references.map((reference, index) =>
          <button key={index} type="button" className="block text-left text-primary underline" onClick={() => viewSource(reference.sourceId)}>{reference.quote}</button>)}
      </div>)}
    </details>
    <details className="rounded-xl border border-border p-4"><summary className="font-semibold cursor-pointer">Architecture / flow coverage (not a safety score)</summary>
      <p className="text-sm my-3">{draft.coverage.filter(row => row.state === 'Examined').length} / {draft.coverage.length} recorded items marked examined. Unknown is not examined.</p>
      {draft.coverage.map((row, index) => <div key={row.id} className="grid gap-3 border-t py-3 md:grid-cols-3"><p className="text-sm">{row.kind}: {row.name}</p>
        {row.proposal && <div className="md:col-span-2 text-sm rounded-lg bg-secondary p-3">
          <p className="font-medium">AI review proposal: {row.proposal.result} (not examined or verified)</p><p>{row.proposal.rationale}</p>
          {row.proposal.references.map((reference, position) => <button key={position} type="button" className="text-primary underline block text-left" onClick={() => viewSource(reference.sourceId)}>{reference.quote}</button>)}
        </div>}
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
          }); }} /></label>)}</>}
        {!!row.requests?.length && <div className="md:col-span-3"><EvidenceRequests prefix={`Coverage question ${row.id}`} requests={row.requests} sources={sources} onChange={requests => setDraft(previous => {
          const next = structuredClone(previous); next.coverage[index].requests = requests; return next;
        })} /></div>}
      </div>)}
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
      <p className="text-xs my-2">Saved revisions are read-only original-language records. Downloads omit source bodies and attachments; use a private backup for full recovery.</p>
      {(revisions || []).map(revision => <div key={revision.id} className="text-sm flex flex-wrap gap-3 my-2">
        <button type="button" className="text-primary underline" onClick={() => setRevisionView(revisionView === revision.id ? '' : revision.id)}>View revision {revision.revision}: {revision.recordedAt}</button>
        <button type="button" className="text-primary underline" onClick={() => void downloadRevision(revision.model)}>Download recorded revision</button>
        {revisionView === revision.id && <pre className="w-full max-h-80 overflow-auto whitespace-pre-wrap text-xs bg-secondary p-3">{JSON.stringify(revision.model, null, 2)}</pre>}
      </div>)}
      {draft.history.map((event, index) => <p className="text-xs my-2" key={index}>{event.at}: {event.actor} — {event.event}</p>)}
    </details>
    <details className="rounded-xl border border-border p-4"><summary className="font-semibold cursor-pointer">Reassessment comparison</summary>
      <p className="text-xs my-2">Stable scenario IDs only; changed source boundaries require review. Missing findings are not automatically resolved. Prior decisions never transfer to a new run.</p>
      {comparison ? <><p className="text-sm">{comparison.scopeChanged ? 'Scope or deployment version changed; interpret comparisons within the new boundary.' : 'Same recorded scope and deployment version.'}</p>
        {comparison.rows.map(row => <p key={row.riskId} className="text-xs my-2 break-all">{row.riskId}: {row.state} / {row.decision}. {row.reason}</p>)}</>
        : <p className="text-sm">No retained parent assessment of the same system and environment is available.</p>}
    </details>
    <details className="rounded-xl border border-border p-4"><summary className="font-semibold cursor-pointer">Human reconciliation &amp; lifecycle changes</summary>
      <p className="text-xs my-2">Save the review draft first. Merge only the same risk scenario; keep distinct boundaries separate. Split selects observations from one risk. Merge/split retains original observations and all previous mappings in read-only revisions, but resets affected decisions. A recorded separation keeps the existing risks distinct.</p>
      <Field label="Change / reconciliation reason" value={changeReason} onChange={setChangeReason} multiline />
      {comparison && <div className="my-3 text-sm space-y-2"><p>Ambiguous reassessment match: link the currently selected risk to an unused parent identity only after reviewing the scenario and boundary. Keep current evidence; never inherit parent approvals.</p>
        <select aria-label="Parent risk identity" className={fieldClass} value={lineageRiskId} onChange={event => setLineageRiskId(event.target.value)}>
          <option value="">Select a reviewed parent scenario</option>{comparison.parentRisks.filter(item => !draft.risks.some(risk => risk.id === item.id))
            .map(item => <option key={item.id} value={item.id}>{item.id}: {item.title}</option>)}</select>
        <button disabled={saving} type="button" className="text-primary underline" onClick={() => void recordChange(undefined, true)}>Record reviewed reassessment link</button>
      </div>}
      <select multiple aria-label="Risks to merge or keep separate" className={`${fieldClass} my-3`} value={reconcileIds} onChange={event => setReconcileIds(Array.from(event.target.selectedOptions, option => option.value))}>
        {draft.risks.map(item => <option key={item.id} value={item.id}>{item.id}: {model.threats.find(threat => threat.id === item.id)?.title}</option>)}</select>
      <div className="flex gap-4 text-sm">
        <button disabled={saving} type="button" className="text-primary underline" onClick={() => void recordChange({ kind: 'merge', riskIds: reconcileIds, reason: changeReason })}>Record merge</button>
        <button disabled={saving} type="button" className="text-primary underline" onClick={() => void recordChange({ kind: 'separate', riskIds: reconcileIds, reason: changeReason })}>Record keeping separate</button>
      </div>
      <p className="text-sm mt-4">Split observations from the currently selected risk:</p>
      <select multiple aria-label="Observations to split" className={`${fieldClass} my-3`} value={splitIds} onChange={event => setSplitIds(Array.from(event.target.selectedOptions, option => option.value))}>
        {draft.observations.filter(observation => observation.riskId === selectedId).map(observation => <option key={observation.id} value={observation.id}>{observation.id}: {observation.origin} / {observation.originalId} / {observation.category}</option>)}</select>
      <button disabled={saving} type="button" className="text-sm text-primary underline" onClick={() => void recordChange({ kind: 'split', riskId: selectedId, observationIds: splitIds, reason: changeReason })}>Record split</button>
      <label className="block text-sm mt-4">Invalidate review for a material change<select className={fieldClass} value={changeEvent} onChange={event => setChangeEvent(event.target.value)}>
        {['Provider/model change', 'Control/deployment change', 'Incident', 'Production drift', 'Policy/business change'].map(event => <option key={event}>{event}</option>)}</select></label>
      <button disabled={saving} type="button" className="text-sm text-primary underline mt-3" onClick={() => void recordChange()}>Record change and invalidate review</button>
    </details>
    <div className="sticky bottom-0 bg-card border rounded-xl p-4 flex flex-wrap items-end gap-3">
      <div className="flex-1"><Field label="Recording reviewer (local self-attestation)" value={actor} onChange={setActor} /></div>
      <div className="flex-1"><Field label="Review note / limitation resolution" value={reviewNote} onChange={setReviewNote} /></div>
      <button type="button" disabled={saving || storedSources === undefined} onClick={save} className="rounded-lg bg-primary text-primary-foreground px-4 py-2 disabled:opacity-50">{saving ? 'Saving...' : 'Save review'}</button>
      {model.quality!.revision !== draft.revision && <><p role="alert" className="text-sm text-destructive">A newer revision exists. Your draft is retained.</p>
        <button type="button" className="text-sm underline" onClick={() => {
          if (window.confirm('Replace this unsaved draft with the latest saved revision?')) {
            setDraft(structuredClone(model.quality!)); setPendingSources([]);
          }
        }}>Reload latest revision</button></>}
    </div>
    </fieldset>
  </div>;
}
