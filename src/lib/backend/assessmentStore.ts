import { db, type ThreatModel } from '../db';
import { hashInput } from './inputUtils';
import { architectureDefinition, emptyReleaseDecision, graphSchema, makeEvidenceSource, qualitySchema, resetRiskReview, reviewChangeIssues, type AssessmentQuality, type EvidenceSource } from './assessmentQuality';
import { buildReviewInventory } from './assessmentAnalysis';
import type { SystemRepresentationGraph } from './types';
import { recordedDecisionLabel, releaseDecisionIssues, reviewValidationIssues } from './assessmentWorkflow';
import { invalidateAssessment, linkReassessmentRisk, reconcileAssessment, type ReconciliationCommand } from './assessmentLifecycle';

export async function loadAssessmentParent(model: ThreatModel): Promise<ThreatModel | undefined> {
  if (!model.quality?.parentAssessmentId) return undefined;
  const parent = await db.threatModels.get(model.quality.parentAssessmentId);
  const revision = model.quality.parentAssessmentRevision;
  if (!revision || parent?.quality?.revision === revision) return parent;
  return (await db.assessmentRevisions.get(`${model.quality.parentAssessmentId}:${revision}`))?.model;
}

async function saveLifecycleChange(previous: ThreatModel, next: ThreatModel): Promise<void> {
  const sources = (await db.evidenceSources.bulkGet(next.quality!.sourceIds)).filter(source => source !== undefined);
  const issues = reviewValidationIssues(next.quality!, sources);
  if (issues.length) throw new Error(issues.join(' '));
  await db.transaction('rw', db.threatModels, db.assessmentRevisions, async () => {
    const current = await db.threatModels.get(previous.id);
    if (current?.quality?.revision !== previous.quality!.revision) throw new Error('The assessment changed. Reload before recording this change.');
    const id = `${previous.id}:${previous.quality!.revision}`;
    if (!await db.assessmentRevisions.get(id)) await db.assessmentRevisions.add({
      id, modelId: previous.id, revision: previous.quality!.revision, recordedAt: new Date().toISOString(), model: current,
    });
    await db.threatModels.put({ ...next, srg: current.srg });
  });
}

export async function saveReconciliation(modelId: string, revision: number, command: ReconciliationCommand, actor: string): Promise<void> {
  const model = await db.threatModels.get(modelId);
  if (model?.quality?.revision !== revision) throw new Error('Reload the latest saved assessment before reconciliation.');
  await saveLifecycleChange(model, await reconcileAssessment(model, command, actor));
}

export async function saveLifecycleEvent(modelId: string, revision: number, event: string, reason: string, actor: string): Promise<void> {
  const model = await db.threatModels.get(modelId);
  if (model?.quality?.revision !== revision) throw new Error('Reload the latest saved assessment before recording a change.');
  await saveLifecycleChange(model, await invalidateAssessment(model, event, reason, actor));
}

export async function saveReassessmentLink(modelId: string, revision: number, riskId: string, previousRiskId: string, reason: string, actor: string): Promise<void> {
  const model = await db.threatModels.get(modelId);
  if (model?.quality?.revision !== revision) throw new Error('Reload the latest saved assessment before linking lineage.');
  const parent = await loadAssessmentParent(model);
  if (!parent) throw new Error('The parent assessment is not retained.');
  await saveLifecycleChange(model, await linkReassessmentRisk(model, parent, riskId, previousRiskId, reason, actor));
}

export async function saveAssessmentArchitecture(modelId: string, graph: SystemRepresentationGraph): Promise<boolean> {
  const previous = await db.threatModels.get(modelId);
  if (!previous) throw new Error('The assessment no longer exists.');
  if (!previous.quality || architectureDefinition(previous.srg) === architectureDefinition(graph)) {
    return db.transaction('rw', db.threatModels, async () => {
      const current = await db.threatModels.get(modelId);
      if (!current || current.quality?.revision !== previous.quality?.revision
        || architectureDefinition(current.srg) !== architectureDefinition(previous.srg)) throw new Error('The assessment architecture changed. Reload before saving diagram positions.');
      return !!await db.threatModels.update(modelId, { srg: graph });
    });
  }
  graphSchema.parse(graph);
  const quality = qualitySchema.parse(previous.quality);
  quality.releaseDecision = emptyReleaseDecision();
  quality.risks.forEach(resetRiskReview);
  quality.conflicts.forEach(conflict => { conflict.resolved = false; conflict.resolution = ''; });
  const sources = (await db.evidenceSources.bulkGet(quality.sourceIds)).filter(source => source !== undefined);
  quality.coverage = buildReviewInventory(graph, sources);
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

export async function saveAssessmentReview(modelId: string, expectedRevision: number, draft: AssessmentQuality, actor: string, addedSources: EvidenceSource[] = [], reviewNote = ''): Promise<void> {
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
    || quality.parentAssessmentRevision !== (previous.quality.parentAssessmentRevision || 0)
    || JSON.stringify(quality.sourceIds) !== JSON.stringify(allowedSourceIds)) throw new Error('Assessment lineage and existing source snapshots cannot be replaced by a review.');
  if (JSON.stringify(quality.risks.map(risk => risk.id)) !== JSON.stringify(previous.quality.risks.map(risk => risk.id))) {
    throw new Error('Risk identities cannot be changed by a review.');
  }
  for (const key of ['observations', 'reconciliation', 'generation', 'run', 'requirements'] as const) {
    if (JSON.stringify(quality[key]) !== JSON.stringify(qualitySchema.parse(previous.quality)[key])) throw new Error(`${key} cannot be replaced by a review.`);
  }
  if (JSON.stringify(quality.coverage.map(row => row.id)) !== JSON.stringify(previous.quality.coverage.map(row => row.id))) throw new Error('Review the complete inventory; coverage rows cannot be removed or replaced.');
  if (JSON.stringify(quality.conflicts.map(({ id, riskIds, description, references }) => ({ id, riskIds, description, references })))
    !== JSON.stringify(previous.quality.conflicts.map(({ id, riskIds, description, references }) => ({ id, riskIds, description, references })))) {
    throw new Error('Material conflicting claims cannot be removed or replaced by a review. Record their resolution and proof.');
  }
  const removedIssues = previous.quality.stageIssues.some(issue => !quality.stageIssues.includes(issue))
    || previous.quality.risks.some(risk => risk.issues.some(issue => !quality.risks.find(item => item.id === risk.id)!.issues.includes(issue)));
  if (removedIssues && !reviewNote.trim()) throw new Error('Record how outstanding limitations or generation issues were resolved in the review note.');
  const oldDecision = previous.quality.releaseDecision;
  if (oldDecision && oldDecision.state !== 'Not recorded' && JSON.stringify(quality.releaseDecision) === JSON.stringify(oldDecision)
    && JSON.stringify({ ...quality, revision: 0, history: [], releaseDecision: undefined })
      !== JSON.stringify({ ...qualitySchema.parse(previous.quality), revision: 0, history: [], releaseDecision: undefined })) {
    throw new Error('Risk, coverage or conflict changes require a fresh system decision.');
  }
  const changedIssues = reviewChangeIssues(previous.quality, quality);
  if (changedIssues.length) throw new Error(changedIssues.join(' '));
  const sources = [...(await db.evidenceSources.bulkGet(previous.quality.sourceIds)).filter(source => source !== undefined), ...addedSources];
  const validationIssues = [...reviewValidationIssues(quality, sources), ...releaseDecisionIssues(quality)];
  if (validationIssues.length) throw new Error(validationIssues.join(' '));
  const previousHash = await hashInput(JSON.stringify(previous.quality));
  quality.revision = expectedRevision + 1;
  quality.history = [...previous.quality.history, {
    at: new Date().toISOString(), actor: actor.trim(), event: `Assessment review recorded (local self-attestation)${reviewNote.trim() ? `: ${reviewNote.trim()}` : ''}`, riskId: '', previousHash,
  }];
  const model: ThreatModel = { ...previous, quality, status: recordedDecisionLabel(quality) };
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
