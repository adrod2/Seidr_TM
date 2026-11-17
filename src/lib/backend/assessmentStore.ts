import { db, type ThreatModel } from '../db';
import { hashInput } from './inputUtils';
import { actionIssues, architectureDefinition, evidenceAttestationIssues, graphSchema, initialCoverage, makeEvidenceSource, qualitySchema, rateRisk, referenceIssue, resetRiskReview, reviewChangeIssues, riskIssues, type AssessmentQuality, type EvidenceSource } from './assessmentQuality';
import type { SystemRepresentationGraph } from './types';

export async function saveAssessmentArchitecture(modelId: string, graph: SystemRepresentationGraph): Promise<boolean> {
  const previous = await db.threatModels.get(modelId);
  if (!previous) throw new Error('The assessment no longer exists.');
  if (!previous.quality || architectureDefinition(previous.srg) === architectureDefinition(graph)) {
    return !!await db.threatModels.update(modelId, { srg: graph });
  }
  graphSchema.parse(graph);
  const quality = structuredClone(previous.quality);
  quality.risks.forEach(resetRiskReview);
  quality.coverage = initialCoverage(graph);
  quality.revision++;
  quality.stageIssues.push('Architecture changed after analysis. Reassess coverage, evidence applicability and finding mappings before recording fresh decisions.');
  quality.history.push({ at: new Date().toISOString(), actor: 'Local diagram editor',
    event: 'Architecture changed; ratings, coverage and verification reset for review.', riskId: '',
    previousHash: await hashInput(JSON.stringify(previous.quality)) });
  await db.transaction('rw', db.threatModels, db.assessmentRevisions, async () => {
    const current = await db.threatModels.get(modelId);
    if (current?.quality?.revision !== previous.quality!.revision) throw new Error('The assessment changed. Reload before saving architecture edits.');
    const revisionId = `${modelId}:${previous.quality!.revision}`;
    if (!await db.assessmentRevisions.get(revisionId)) {
      await db.assessmentRevisions.add({ id: revisionId, modelId, revision: previous.quality!.revision, recordedAt: new Date().toISOString(), model: current });
    }
    await db.threatModels.put({ ...current, srg: graph, quality, status: 'Review required' });
  });
  return true;
}

export async function saveAssessmentReview(modelId: string, expectedRevision: number, draft: AssessmentQuality, actor: string, addedSources: EvidenceSource[] = []): Promise<void> {
  if (!actor.trim()) throw new Error('Record the person or role making this review.');
  const quality = qualitySchema.parse(draft);
  const previous = await db.threatModels.get(modelId);
  if (!previous?.quality) throw new Error('This assessment has no versioned quality register. Redo it to collect reproducible sources.');
  if (previous.quality.revision !== expectedRevision) throw new Error('The assessment changed. Reload the latest revision before saving.');
  for (const source of addedSources) {
    const expected = await makeEvidenceSource(source);
    if (expected.id !== source.id || expected.contentHash !== source.contentHash || source.kind !== 'verification-artifact' || source.derived || !source.text.trim()) {
      throw new Error('Verification artifact identity or content is invalid.');
    }
  }
  const allowedSourceIds = [...new Set([...previous.quality.sourceIds, ...addedSources.map(source => source.id)])];
  if (quality.systemId !== previous.quality.systemId || quality.parentAssessmentId !== previous.quality.parentAssessmentId
    || JSON.stringify(quality.sourceIds) !== JSON.stringify(allowedSourceIds)) throw new Error('Assessment lineage and existing source snapshots cannot be replaced by a review.');
  if (JSON.stringify(quality.risks.map(risk => risk.id)) !== JSON.stringify(previous.quality.risks.map(risk => risk.id))) {
    throw new Error('Risk identities cannot be changed by a review.');
  }
  const changedIssues = reviewChangeIssues(previous.quality, quality);
  if (changedIssues.length) throw new Error(changedIssues.join(' '));
  const sources = [...(await db.evidenceSources.bulkGet(previous.quality.sourceIds)).filter(source => source !== undefined), ...addedSources];
  const verificationIds = sources.filter(source => source.kind === 'verification-artifact' && !source.derived && source.status === 'Complete').map(source => source.id);
  for (const row of quality.coverage) {
    if (row.state === 'Not assessed' || row.state === 'Blocked') continue;
    if (!row.owner.trim() || !row.rationale.trim()) throw new Error(`${row.name}: coverage classification needs a reviewer and rationale.`);
    if (row.state === 'Examined' && (!row.references.length || row.references.some(reference => referenceIssue(reference, sources)))) {
      throw new Error(`${row.name}: examined coverage needs a resolvable evidence reference.`);
    }
  }
  for (const risk of quality.risks) {
    const proofIssues = evidenceAttestationIssues(risk, quality, sources);
    if (proofIssues.length) throw new Error(`${risk.id}: ${proofIssues.join(' ')}`);
    for (const action of risk.actions) if (action.status === 'Verified') {
      const issues = actionIssues(action, verificationIds);
      if (action.verification.environment !== quality.environment) issues.push('Verification does not match the assessed environment.');
      if (issues.length) throw new Error(`${action.id}: ${issues.join(' ')}`);
    }
    if (rateRisk(risk.current).score !== null) {
      const issues = riskIssues(risk, quality, sources);
      if (!quality.rubric.approvedBy.trim()) issues.push('Approve the business risk rubric before rating current risk.');
      if (issues.length) throw new Error(`${risk.id}: ${issues.join(' ')}`);
    }
    if (['Closed with evidence', 'Accepted risk'].includes(risk.disposition)) {
      const issues = riskIssues(risk, quality, sources);
      if (issues.length) throw new Error(`${risk.id}: ${issues.join(' ')}`);
    }
  }
  const previousHash = await hashInput(JSON.stringify(previous.quality));
  quality.revision = expectedRevision + 1;
  quality.history = [...previous.quality.history, {
    at: new Date().toISOString(), actor: actor.trim(), event: 'Assessment review recorded (local self-attestation)', riskId: '', previousHash,
  }];
  const model: ThreatModel = { ...previous, quality, status: 'Review required' };
  await db.transaction('rw', db.threatModels, db.assessmentRevisions, db.evidenceSources, async () => {
    const current = await db.threatModels.get(modelId);
    if (current?.quality?.revision !== expectedRevision) throw new Error('A concurrent edit was detected. Reload before saving.');
    const revisionId = `${modelId}:${expectedRevision}`;
    if (!await db.assessmentRevisions.get(revisionId)) {
      await db.assessmentRevisions.add({ id: revisionId, modelId, revision: expectedRevision, recordedAt: new Date().toISOString(), model: current });
    }
    await db.evidenceSources.bulkPut(addedSources);
    // Keep independently saved diagram positions and presentation edits.
    await db.threatModels.put({ ...current, quality, status: model.status });
  });
}
