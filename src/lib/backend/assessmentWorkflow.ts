import {
  actionIssues, evidenceAttestationIssues, qualitySchema, rateRisk, referenceIssue, riskIssues,
  type AssessmentQuality, type EvidenceSource, type RiskRecord,
} from './assessmentQuality.ts';

const validDate = (value: string) => Number.isFinite(Date.parse(value));
const proofIds = (quality: AssessmentQuality, sources: readonly EvidenceSource[]) =>
  sources.filter(source => quality.sourceIds.includes(source.id) && source.kind === 'verification-artifact'
    && source.status === 'Complete' && !source.derived && source.text.trim()).map(source => source.id);

export function riskReviewValidationIssues(risk: RiskRecord, quality: AssessmentQuality, sources: readonly EvidenceSource[], now = new Date()): string[] {
  const issues = evidenceAttestationIssues(risk, quality, sources).map(issue => `${risk.id}: ${issue}`);
  const artifacts = proofIds(quality, sources);
  for (const action of risk.actions) {
    if (action.requirements.some(id => quality.requirements.filter(requirement => requirement.id === id || (requirement.externalId && requirement.externalId === id)).length !== 1)) {
      issues.push(`${action.id}: a linked requirement is not present in the sourced requirement register.`);
    }
    if (action.status === 'Verified') {
      issues.push(...actionIssues(action, artifacts).map(issue => `${action.id}: ${issue}`));
      if (action.verification.environment !== quality.environment) issues.push(`${action.id}: verification does not match the assessed environment.`);
      if (Date.parse(action.verification.at) > now.getTime() + 60_000) issues.push(`${action.id}: verification cannot be dated in the future.`);
    }
  }
  if (rateRisk(risk.current).score !== null || ['Closed with evidence', 'Accepted risk'].includes(risk.disposition)) {
    issues.push(...riskIssues(risk, quality, sources, now).map(issue => `${risk.id}: ${issue}`));
    if (!quality.rubric.approvedBy.trim() || !validDate(quality.rubric.approvedAt)) issues.push('Approve the business rubric before recording current risk.');
  }
  if (['Closed with evidence', 'Accepted risk'].includes(risk.disposition) && Date.parse(risk.decision.at) > now.getTime() + 60_000) issues.push(`${risk.id}: a recorded owner decision cannot be dated in the future.`);
  return [...new Set(issues)];
}

export function reviewValidationIssues(quality: AssessmentQuality, sources: readonly EvidenceSource[], now = new Date()): string[] {
  const issues: string[] = [];
  const artifacts = proofIds(quality, sources);
  const scopedSources = sources.filter(source => quality.sourceIds.includes(source.id));
  if (new Set(quality.requirements.map(requirement => requirement.id)).size !== quality.requirements.length) issues.push('Requirement IDs must be unique.');
  for (const item of [...quality.requirements, ...quality.conflicts, ...quality.coverage]) {
    if (item.references.some(reference => referenceIssue(reference, scopedSources))) issues.push('A registered source quote is invalid or outside this assessment.');
  }
  if (quality.conflicts.some(conflict => conflict.references.length < 2 || new Set(conflict.references.map(reference => JSON.stringify(reference))).size < 2
    || conflict.riskIds.some(id => !quality.risks.some(risk => risk.id === id)))) issues.push('Conflicts require two distinct located claims and valid affected risks.');
  for (const row of quality.coverage) {
    if (!['Not assessed', 'Blocked'].includes(row.state)) {
      if (!row.owner.trim() || !row.rationale.trim()) issues.push(`${row.name}: classification needs a reviewer and rationale.`);
      if (['Examined', 'Not applicable'].includes(row.state) && (!row.references.length || row.references.some(reference => referenceIssue(reference, sources)))) {
        issues.push(`${row.name}: examined coverage needs a resolvable source quote.`);
      }
    }
    for (const request of row.requests || []) if (request.resolved && (!request.supplier.trim() || !request.verification.trim()
      || !request.artifactSourceIds.length || request.artifactSourceIds.some(id => !artifacts.includes(id)))) {
      issues.push(`${row.name}: resolved coverage questions need a supplier, check and retained verification artifacts.`);
    }
  }
  for (const conflict of quality.conflicts) if (conflict.resolved) {
    if (!conflict.owner.trim() || !conflict.verification.trim() || !conflict.resolution.trim()
      || conflict.references.length < 2 || conflict.references.some(reference => referenceIssue(reference, sources))
      || !conflict.artifactSourceIds.length || conflict.artifactSourceIds.some(id => !artifacts.includes(id))) {
      issues.push(`${conflict.id}: conflict resolution needs both located claims, an owner, rationale, check and retained verification proof.`);
    }
  }
  for (const risk of quality.risks) issues.push(...riskReviewValidationIssues(risk, quality, sources, now));
  return [...new Set(issues)];
}

export function assessmentReadiness(input: AssessmentQuality, now = new Date()) {
  const quality = qualitySchema.parse(input);
  const reasons = [...quality.stageIssues];
  if (quality.run?.state !== 'Ready for review') reasons.push('Analysis is incomplete; resume by redoing its retained inputs.');
  const unspecified = (value: string) => !value.trim() || /^(unknown|tbd|not (provided|recorded|supplied)|scope( and exclusions)? require(s)? (owner )?confirmation)[.!]?$/i.test(value.trim());
  if ([quality.environment, quality.systemVersion, quality.scope].some(unspecified)) reasons.push('Confirm scope, environment and deployment version.');
  if (!quality.rubric.approvedBy.trim() || !validDate(quality.rubric.approvedAt)) reasons.push('The business rubric needs approval.');
  if (quality.generation?.configurationChanged) reasons.push('Provider/model configuration changed during generation; repeat a consistent assessment.');
  for (const risk of quality.risks) {
    if (!risk.owner.trim()) reasons.push(`${risk.id}: confirm an accountable owner.`);
    if (rateRisk(risk.current).score === null) reasons.push(`${risk.id}: current business risk is unknown.`);
    if (!['Accepted risk', 'Closed with evidence'].includes(risk.disposition)) reasons.push(`${risk.id}: owner disposition remains outstanding.`);
    if (risk.disposition === 'Accepted risk' && (!validDate(risk.decision.expiresAt) || Date.parse(risk.decision.expiresAt) <= now.getTime())) reasons.push(`${risk.id}: acceptance expiry is missing or expired.`);
    if ((rateRisk(risk.current).score || 0) >= 12 && risk.disposition !== 'Accepted risk') reasons.push(`${risk.id}: High/Critical current residual risk needs an explicit owner acceptance, not task closure.`);
    if (risk.issues.length) reasons.push(...risk.issues.map(issue => `${risk.id}: ${issue}`));
    if (risk.missingEvidence.some(request => !request.resolved)) reasons.push(`${risk.id}: evidence questions remain open.`);
    if (!risk.actions.length || risk.actions.some(action => actionIssues(action, action.verification.artifactSourceIds).length)) reasons.push(`${risk.id}: treatment definitions are incomplete.`);
    if (risk.disposition === 'Blocker' && !risk.actions.some(action => action.priority === 'Before launch')) reasons.push(`${risk.id}: record a before-launch gate.`);
  }
  for (const row of quality.coverage) {
    if (!['Examined', 'Not applicable', 'Out of scope'].includes(row.state) || !row.owner.trim() || !row.rationale.trim()) reasons.push(`${row.name}: coverage needs review.`);
    if (!['Not applicable', 'Out of scope'].includes(row.state) && (row.requests || []).some(request => !request.resolved)) reasons.push(`${row.name}: applicability or verification questions remain open.`);
  }
  if (!quality.coverage.some(row => row.state === 'Examined')) reasons.push('No examined architecture or workflow inventory is recorded.');
  if (quality.conflicts.some(conflict => !conflict.resolved)) reasons.push('Material conflicting claims need resolution.');
  const outstanding = [...new Set(reasons)];
  return {
    recommendation: outstanding.length ? 'Hold' as const
      : quality.risks.some(risk => risk.disposition === 'Accepted risk') ? 'Conditional go' as const : 'Go' as const,
    reasons: outstanding,
    accepted: quality.risks.filter(risk => risk.disposition === 'Accepted risk' && Date.parse(risk.decision.expiresAt) > now.getTime()).length,
    ownerDecisions: quality.risks.filter(risk => !['Accepted risk', 'Closed with evidence'].includes(risk.disposition)).length,
    unanswered: quality.risks.reduce((count, risk) => count + risk.missingEvidence.filter(request => !request.resolved).length, 0)
      + quality.coverage.reduce((count, row) => count + (row.requests || []).filter(request => !request.resolved).length, 0),
  };
}

export function releaseDecisionIssues(quality: AssessmentQuality, now = new Date()): string[] {
  const decision = quality.releaseDecision;
  if (!decision || decision.state === 'Not recorded') return [];
  const issues: string[] = [];
  if (!decision.owner.trim() || !decision.rationale.trim() || !validDate(decision.at) || !decision.reviewTrigger.trim()) {
    issues.push('The system decision needs an owner, rationale, valid date and review trigger.');
  }
  if (Date.parse(decision.at) > now.getTime() + 60_000) issues.push('The owner decision cannot be dated in the future.');
  if (decision.expiresAt && !validDate(decision.expiresAt)) issues.push('A supplied system-decision expiry must be a valid date.');
  if (decision.state === 'Go' && assessmentReadiness(quality, now).recommendation !== 'Go') issues.push('Unqualified Go is blocked by outstanding review checks or accepted residual risk.');
  if (decision.state === 'Conditional go') {
    if (!decision.conditions.length || !validDate(decision.expiresAt) || Date.parse(decision.expiresAt) <= now.getTime()) {
      issues.push('Conditional go needs explicit owned gates and a future expiry; it is not clearance before those gates pass.');
    }
    for (const condition of decision.conditions) {
      const risk = quality.risks.find(risk => risk.id === condition.riskId);
      if (!condition.requirement.trim() || !condition.owner.trim() || (condition.riskId && !risk)
        || (condition.actionId && !risk?.actions.some(action => action.id === condition.actionId))) issues.push('Each release gate needs a requirement, owner and valid linked risk/action when supplied.');
    }
    for (const risk of quality.risks.filter(risk => risk.disposition === 'Blocker')) {
      if (!decision.conditions.some(condition => condition.riskId === risk.id)) issues.push(`${risk.id}: a blocker needs an explicit release gate.`);
    }
  }
  return issues;
}

export function recordedDecisionLabel(quality?: AssessmentQuality, now = new Date()): string {
  if (!quality) return 'Legacy / unverified';
  const decision = quality.releaseDecision;
  if (!decision || decision.state === 'Not recorded') return 'Review required';
  if (decision.expiresAt && Date.parse(decision.expiresAt) <= now.getTime()) return 'Decision expired / review required';
  if (decision.state === 'Go' && assessmentReadiness(quality, now).recommendation !== 'Go') return 'Go stale / review required';
  return decision.state === 'Conditional go' ? 'Conditional go (pending gates)' : decision.state;
}
