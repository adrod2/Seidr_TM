import { db } from '../db';
import { agentMitigationStrategist } from './agents';
import { mapLimit } from './asyncUtils';
import { getErrorMessage } from './inputUtils';
import { emptyReleaseDecision, qualitySchema, registeredRequirementIds, resetRiskReview } from './assessmentQuality';
import { saveAssessmentReview } from './assessmentStore';

export async function generatePendingTreatment(modelId: string, signal: AbortSignal, onProgress: (done: number, total: number) => void): Promise<void> {
  const model = await db.threatModels.get(modelId);
  if (!model?.quality || model.quality.run?.state === 'Running') throw new Error('Finish the assessment analysis before generating treatment.');
  const quality = qualitySchema.parse(model.quality);
  const pending = quality.risks.filter(risk => !risk.actions.length);
  if (!pending.length) throw new Error('No missing treatment plans remain. Existing edited plans are never overwritten.');
  let done = 0;
  const results = await mapLimit(pending, 2, async risk => {
    if (signal.aborted) return { riskId: risk.id, state: 'Canceled' as const };
    const threat = model.threats.find(threat => threat.id === risk.id);
    if (!threat) throw new Error(`${risk.id}: canonical finding is unavailable.`);
    try {
      const proposal = await agentMitigationStrategist(threat, `${model.description.slice(0, 60_000)}\nSourced requirements:\n${JSON.stringify(quality.requirements)}`, registeredRequirementIds(quality.requirements));
      onProgress(++done, pending.length);
      return { riskId: risk.id, state: 'Generated' as const, proposal };
    } catch (error) {
      console.error(`Treatment retry failed for ${risk.id}`, error);
      onProgress(++done, pending.length);
      return { riskId: risk.id, state: 'Failed' as const, error: getErrorMessage(error) };
    }
  });
  quality.releaseDecision = emptyReleaseDecision();
  for (const result of results) {
    const risk = quality.risks.find(risk => risk.id === result.riskId)!;
    const prefix = `Action generation failed for ${risk.id}:`;
    risk.issues = risk.issues.filter(issue => !issue.startsWith(prefix));
    quality.stageIssues = quality.stageIssues.filter(issue => !issue.startsWith(prefix));
    risk.treatmentState = result.state;
    if (result.state === 'Generated') {
      resetRiskReview(risk);
      risk.actions = result.proposal.actions.map(action => ({
        ...action, id: `ACTION-${crypto.randomUUID()}`, owner: '', status: 'Open' as const,
        verification: { result: 'Not run' as const, artifactSourceIds: [], reviewer: '', at: '', environment: '' },
      }));
      risk.treatmentNarrative = result.proposal.narrative;
    } else if (result.state === 'Failed') {
      const issue = `${prefix} ${result.error}. Retry or record treatment before a decision.`;
      risk.issues.push(issue); quality.stageIssues.push(issue);
    }
  }
  await saveAssessmentReview(modelId, model.quality.revision, quality, 'Local treatment generation', [],
    `Treatment generation: ${results.filter(result => result.state === 'Generated').length} generated, ${results.filter(result => result.state === 'Failed').length} failed, ${results.filter(result => result.state === 'Canceled').length} canceled. Proposed roles and tests are not verified controls.`);
}
