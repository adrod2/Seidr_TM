import type { ThreatModel } from '../db.ts';
import {
  emptyReleaseDecision, parseThreats, qualitySchema, resetRiskReview, riskIssues, type EvidenceSource,
} from './assessmentQuality.ts';
import { hashInput } from './inputUtils.ts';

export type ReconciliationCommand =
  | { kind: 'merge' | 'separate'; riskIds: string[]; reason: string }
  | { kind: 'split'; riskId: string; observationIds: string[]; reason: string };

export async function reconcileAssessment(model: ThreatModel, command: ReconciliationCommand, actor: string): Promise<ThreatModel> {
  if (!model.quality || !actor.trim() || !command.reason.trim()) throw new Error('Reconciliation requires a versioned assessment, reviewer and reason.');
  const quality = qualitySchema.parse(model.quality);
  const affected = command.kind === 'split' ? [command.riskId] : [...new Set(command.riskIds)];
  if (affected.some(id => !quality.risks.some(risk => risk.id === id))) throw new Error('Select existing canonical risks.');
  if (command.kind !== 'split' && affected.length < 2) throw new Error('Select at least two risks.');
  const threats = structuredClone(model.threats);
  if (command.kind === 'merge') {
    const first = quality.risks.find(risk => risk.id === affected[0])!;
    const others = quality.risks.filter(risk => affected.slice(1).includes(risk.id));
    const unique = <T>(values: T[]) => [...new Map(values.map(value => [JSON.stringify(value), value])).values()];
    first.references = unique([first, ...others].flatMap(risk => risk.references));
    first.controls = unique([first, ...others].flatMap(risk => risk.controls));
    first.missingEvidence = unique([first, ...others].flatMap(risk => risk.missingEvidence));
    first.actions = [first, ...others].flatMap(risk => risk.actions);
    first.frameworkTags = [...new Set([first, ...others].flatMap(risk => risk.frameworkTags))];
    first.issues = unique([first, ...others].flatMap(risk => risk.issues));
    first.treatmentNarrative = [first, ...others].map(risk => risk.treatmentNarrative).filter(Boolean).join('\n\n');
    for (const observation of quality.observations) if (affected.includes(observation.riskId)) observation.riskId = first.id;
    quality.risks = quality.risks.filter(risk => !affected.slice(1).includes(risk.id));
    for (const conflict of quality.conflicts) conflict.riskIds = [...new Set(conflict.riskIds.map(id => affected.includes(id) ? first.id : id))];
  } else if (command.kind === 'split') {
    const original = quality.risks.find(risk => risk.id === command.riskId)!;
    const observations = quality.observations.filter(observation => observation.riskId === original.id);
    const selected = [...new Set(command.observationIds)];
    if (!selected.length || selected.length >= observations.length || selected.some(id => !observations.some(observation => observation.id === id))) {
      throw new Error('Split a nonempty proper subset of the original observations; both risks must retain an observation.');
    }
    const child = structuredClone(original);
    child.id = `RISK-${crypto.randomUUID()}`;
    child.actions.forEach(action => { action.id = `ACTION-${crypto.randomUUID()}`; });
    quality.risks.push(child); affected.push(child.id);
    for (const observation of observations) if (selected.includes(observation.id)) observation.riskId = child.id;
    for (const conflict of quality.conflicts) if (conflict.riskIds.includes(original.id)) conflict.riskIds.push(child.id);
  }
  if (command.kind !== 'separate') for (const risk of quality.risks.filter(risk => affected.includes(risk.id))) {
    const observations = quality.observations.filter(observation => observation.riskId === risk.id);
    if (!observations.length) throw new Error('A canonical risk cannot lose all original observations.');
    const originals = parseThreats(observations.map(observation => observation.finding));
    const first = originals[0];
    if (first.qualityProposal) risk.scenario = structuredClone(first.qualityProposal.scenario);
    risk.observationIds = observations.map(observation => observation.id);
    risk.frameworkTags = [...new Set(originals.flatMap(threat => threat.qualityProposal?.frameworkTags || [threat.category]))];
    risk.owner = '';
    resetRiskReview(risk);
    risk.evidenceStatus = 'Hypothesis';
    risk.confidence = { level: 'Low', reason: 'Human reconciliation changed the boundary; reconfirm evidence applicability and confidence.' };
    risk.issues.push('Human reconciliation changed the risk boundary. Reconfirm scenario, evidence applicability, ownership and treatment before a fresh decision.');
    const components = [...new Set(originals.flatMap(threat => threat.affectedComponentIds || [threat.componentId]))];
    const flows = [...new Set(originals.flatMap(threat => threat.affectedFlowIds || []))];
    const rank = { Critical: 4, High: 3, Medium: 2, Low: 1 };
    const strongest = [...originals].sort((a, b) => rank[b.severity] - rank[a.severity] || b.cvssScore - a.cvssScore)[0];
    const updated = { ...first, id: risk.id, componentId: components[0], affectedComponentIds: components, affectedFlowIds: flows,
      severity: strongest.severity, cvssScore: strongest.cvssScore, cvssVersion: strongest.cvssVersion,
      cvssVector: strongest.cvssVector, cvssRationale: strongest.cvssRationale };
    const index = threats.findIndex(threat => threat.id === risk.id);
    if (index >= 0) threats[index] = updated; else threats.push(updated);
  }
  quality.releaseDecision = emptyReleaseDecision();
  quality.reconciliation = quality.risks.map(risk => ({
    ...quality.reconciliation.find(item => item.riskId === risk.id),
    riskId: risk.id, observationIds: quality.observations.filter(observation => observation.riskId === risk.id).map(observation => observation.id),
    reason: affected.includes(risk.id) ? `Human ${command.kind} by ${actor.trim()}: ${command.reason.trim()}`
      : quality.reconciliation.find(item => item.riskId === risk.id)?.reason || 'Retained mapping.',
    ...(affected.includes(risk.id) ? { decision: command.kind === 'merge' ? 'Merge' as const : command.kind === 'split' ? 'Split' as const : 'Separate' as const,
      relatedRiskIds: command.kind === 'split' ? [command.riskId] : command.riskIds } : {}),
  }));
  quality.history.push({ at: new Date().toISOString(), actor: actor.trim(), event: `Human ${command.kind}: ${affected.join(', ')}. ${command.reason.trim()}`,
    riskId: '', previousHash: await hashInput(JSON.stringify(model.quality)) });
  quality.revision++;
  return { ...model, quality, status: 'Review required', threats: threats.filter(threat => quality.risks.some(risk => risk.id === threat.id)) };
}

export async function linkReassessmentRisk(model: ThreatModel, previous: ThreatModel, riskId: string, previousRiskId: string, reason: string, actor: string): Promise<ThreatModel> {
  if (!model.quality || !previous.quality || model.quality.parentAssessmentId !== previous.id
    || (model.quality.parentAssessmentRevision && model.quality.parentAssessmentRevision !== previous.quality.revision)
    || model.quality.systemId !== previous.quality.systemId || model.quality.environment !== previous.quality.environment) throw new Error('Review lineage only against the retained parent of this same system and environment.');
  if (!actor.trim() || !reason.trim() || !previous.quality.risks.some(risk => risk.id === previousRiskId)) throw new Error('Lineage needs an existing parent risk, reviewer and reason.');
  const quality = qualitySchema.parse(model.quality);
  const risk = quality.risks.find(risk => risk.id === riskId);
  if (!risk || quality.risks.some(risk => risk.id === previousRiskId)) throw new Error('Select an existing current risk and an unused parent identity; already-linked risks cannot be relinked.');
  risk.id = previousRiskId; risk.owner = ''; resetRiskReview(risk);
  risk.issues.push('Human-reviewed reassessment lineage: recheck current sources, ownership, treatment and ratings; prior approval was not inherited.');
  quality.observations.forEach(observation => { if (observation.riskId === riskId) observation.riskId = previousRiskId; });
  quality.conflicts.forEach(conflict => { conflict.riskIds = conflict.riskIds.map(id => id === riskId ? previousRiskId : id); });
  const mapping = quality.reconciliation.find(item => item.riskId === riskId);
  if (!mapping) throw new Error('The current risk has no retained observation mapping.');
  Object.assign(mapping, { riskId: previousRiskId, decision: 'Link', relatedRiskIds: [riskId, previousRiskId], reason: `Human reassessment link by ${actor.trim()}: ${reason.trim()}` });
  quality.releaseDecision = emptyReleaseDecision();
  quality.history.push({ at: new Date().toISOString(), actor: actor.trim(), event: `Linked ${riskId} to parent scenario ${previousRiskId}: ${reason.trim()}. No prior decisions inherited.`,
    riskId: previousRiskId, previousHash: await hashInput(JSON.stringify(model.quality)) });
  quality.revision++;
  return { ...model, quality, status: 'Review required', threats: model.threats.map(threat => threat.id === riskId ? { ...threat, id: previousRiskId } : threat) };
}

export async function invalidateAssessment(model: ThreatModel, event: string, reason: string, actor: string): Promise<ThreatModel> {
  if (!model.quality || !event.trim() || !reason.trim() || !actor.trim()) throw new Error('Record a change, reason and accountable reviewer.');
  const quality = qualitySchema.parse(model.quality);
  quality.releaseDecision = emptyReleaseDecision();
  quality.risks.forEach(resetRiskReview);
  quality.coverage.forEach(row => { row.state = 'Not assessed'; row.owner = ''; row.requests.forEach(request => { request.resolved = false; }); });
  quality.conflicts.forEach(conflict => { conflict.resolved = false; conflict.resolution = ''; });
  quality.stageIssues.push(`${event.trim()}: ${reason.trim()}. Reassess sources, coverage, treatment and deployment evidence.`);
  quality.history.push({ at: new Date().toISOString(), actor: actor.trim(), event: `Review invalidated by ${event.trim()}: ${reason.trim()}`,
    riskId: '', previousHash: await hashInput(JSON.stringify(model.quality)) });
  quality.revision++;
  return { ...model, quality, status: 'Review required' };
}

export function compareAssessments(previous: ThreatModel, current: ThreatModel, sources: readonly EvidenceSource[] = []) {
  if (!previous.quality || !current.quality || previous.quality.systemId !== current.quality.systemId
    || previous.quality.environment !== current.quality.environment) throw new Error('Compare assessments of the same system and environment only.');
  const prior = qualitySchema.parse(previous.quality); const next = qualitySchema.parse(current.quality);
  const signature = (risk: typeof next.risks[number]) => JSON.stringify({
    scenario: risk.scenario, controls: risk.controls.map(control => [control.description, control.state]),
    references: risk.references.map(reference => {
      const source = sources.find(source => source.id === reference.sourceId);
      return [source ? [source.kind, source.name, source.version, source.contentHash] : reference.sourceId, reference.startLine, reference.endLine, reference.quote];
    }),
    treatment: risk.actions.map(action => [action.description, action.acceptanceTest, action.expectedArtifact, action.dependencies]),
  });
  return {
    scopeChanged: prior.scope !== next.scope || prior.systemVersion !== next.systemVersion,
    rows: [
      ...next.risks.map(risk => {
        const old = prior.risks.find(item => item.id === risk.id);
        const mapping = next.reconciliation.find(item => item.riskId === risk.id);
        const resolved = old && old.disposition !== 'Closed with evidence' && risk.disposition === 'Closed with evidence' && !riskIssues(risk, next, sources).length;
        return { riskId: risk.id, state: mapping?.decision === 'Merge' ? 'Merged' : mapping?.decision === 'Split' ? 'Split'
          : resolved ? 'Resolved with recorded evidence' : !old ? 'Added' : signature(old) === signature(risk) ? 'Unchanged' : 'Changed',
          decision: risk.disposition, reason: mapping?.decision !== 'Automatic' ? mapping?.reason || '' : risk.decision.rationale };
      }),
      ...prior.risks.filter(risk => !next.risks.some(item => item.id === risk.id))
        .map(risk => ({ riskId: risk.id, state: next.reconciliation.some(mapping => mapping.decision === 'Merge' && mapping.relatedRiskIds.includes(risk.id))
          ? 'Merged into a retained risk' : 'Not re-observed', decision: 'Not established as resolved; verify lineage and coverage.', reason: '' })),
    ],
  };
}
