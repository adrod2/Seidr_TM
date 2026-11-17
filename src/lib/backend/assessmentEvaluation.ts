import { z } from 'zod';
import { qualitySchema, referenceIssue, type AssessmentQuality, type EvidenceSource } from './assessmentQuality.ts';
import { assessmentReadiness, riskReviewValidationIssues } from './assessmentWorkflow.ts';

export const evaluationCaseSchema = z.object({
  id: z.string().min(1), cohort: z.enum(['web-api', 'multi-repository', 'ai', 'consequential-decision', 'asynchronous', 'incomplete-conflicting']),
  authorizedSourceInventory: z.array(z.string()).min(1), materialScenarioIds: z.array(z.string()),
  requiredInventoryIds: z.array(z.string()), seededConflictIds: z.array(z.string()),
});
export const independentReviewSchema = z.object({
  reviewer: z.string().min(1), independent: z.boolean(), authorizedInputs: z.boolean(), protocolFrozenBeforeRun: z.boolean(),
  scenarioMappings: z.array(z.object({ expectedId: z.string(), riskId: z.string(), support: z.enum(['Supported', 'Unsupported', 'Unclear']),
    decisionAgrees: z.boolean().nullable(), reason: z.string().min(1) })),
  additionalClaimReviews: z.array(z.object({ riskId: z.string(), support: z.enum(['Supported', 'Unsupported', 'Unclear']), reason: z.string().min(1) })).default([]),
  conflictMappings: z.array(z.object({ expectedId: z.string(), conflictId: z.string() })),
  incorrectMergeRiskIds: z.array(z.string()), duplicateRiskIds: z.array(z.string()),
  ownerTaskSuccesses: z.number().int().min(0).nullable(), ownerTaskAttempts: z.number().int().min(0).nullable(),
  ownerMinutes: z.number().min(0).nullable(), inferenceRequests: z.number().int().min(0).nullable(), inputCharacters: z.number().int().min(0).nullable(),
});
const ratio = (count: number, total: number) => total ? count / total : null;

export function evaluateAssessment(input: AssessmentQuality, sources: readonly EvidenceSource[], caseInput: unknown, reviewInput?: unknown) {
  const quality = qualitySchema.parse(input);
  const fixture = evaluationCaseSchema.parse(caseInput);
  const review = reviewInput === undefined ? undefined : independentReviewSchema.parse(reviewInput);
  if (new Set(fixture.materialScenarioIds).size !== fixture.materialScenarioIds.length
    || new Set(fixture.requiredInventoryIds).size !== fixture.requiredInventoryIds.length
    || new Set(fixture.seededConflictIds).size !== fixture.seededConflictIds.length) throw new Error('Evaluation expectations must have unique IDs.');
  if (review) {
    if (review.scenarioMappings.some(item => !fixture.materialScenarioIds.includes(item.expectedId) || !quality.risks.some(risk => risk.id === item.riskId))
      || new Set(review.scenarioMappings.map(item => item.expectedId)).size !== review.scenarioMappings.length
      || review.conflictMappings.some(item => !fixture.seededConflictIds.includes(item.expectedId) || !quality.conflicts.some(conflict => conflict.id === item.conflictId))
      || [...review.incorrectMergeRiskIds, ...review.duplicateRiskIds, ...review.additionalClaimReviews.map(item => item.riskId)].some(id => !quality.risks.some(risk => risk.id === id))) throw new Error('Independent review mappings contain unknown or duplicate IDs.');
    if (review.ownerTaskSuccesses !== null && (review.ownerTaskAttempts === null || review.ownerTaskSuccesses > review.ownerTaskAttempts)) throw new Error('Owner task counts are inconsistent.');
  }
  const references = quality.risks.flatMap(risk => risk.references);
  const closed = quality.risks.filter(risk => risk.disposition === 'Closed with evidence');
  const actions = quality.risks.flatMap(risk => risk.actions);
  const examined = fixture.requiredInventoryIds.filter(id => quality.coverage.some(row => row.id === id && row.state === 'Examined'
    && row.owner.trim() && row.rationale.trim() && row.references.length && row.references.every(reference => !referenceIssue(reference, sources)))).length;
  const approvedReview = !!review?.independent && review.authorizedInputs && review.protocolFrozenBeforeRun;
  const claims = review ? [...review.scenarioMappings, ...review.additionalClaimReviews] : [];
  return {
    protocol: 'seidr-quality-evaluation-v1', caseId: fixture.id, cohort: fixture.cohort,
    comparativeClaimSupported: false,
    comparisonEligibility: approvedReview ? 'Independent review supplied; matched comparator, held-out verification and repeatability still required.' : 'Not eligible: independent authorized review and a predeclared protocol are required.',
    structural: {
      canonicalRisks: quality.risks.length, retainedObservations: quality.observations.length,
      locatedReferenceReproducibility: ratio(references.filter(reference => !referenceIssue(reference, sources)).length, references.length),
      examinedInventoryFraction: ratio(examined, fixture.requiredInventoryIds.length),
      actionProposalCompleteness: ratio(actions.filter(action => [action.description, action.proposedOwner, action.milestone, action.acceptanceTest, action.expectedArtifact, action.incompleteRisk]
        .every(value => value.trim())).length, actions.length),
      confirmedActionOwnership: ratio(actions.filter(action => action.owner.trim()).length, actions.length),
      closureIntegrity: ratio(closed.filter(risk => !riskReviewValidationIssues(risk, quality, sources).length).length, closed.length),
      recommendation: assessmentReadiness(quality).recommendation,
    },
    independentlyReviewed: !approvedReview ? null : {
      materialScenarioRecall: ratio(review.scenarioMappings.filter(item => item.support === 'Supported').length, fixture.materialScenarioIds.length),
      unsupportedReviewedClaimFraction: ratio(claims.filter(item => item.support === 'Unsupported').length, claims.length),
      unclearReviewedClaims: claims.filter(item => item.support === 'Unclear').length,
      unreviewedCanonicalRiskIds: quality.risks.filter(risk => !claims.some(item => item.riskId === risk.id)).map(risk => risk.id),
      decisionAgreement: ratio(review.scenarioMappings.filter(item => item.decisionAgrees === true).length, review.scenarioMappings.filter(item => item.decisionAgrees !== null).length),
      conflictRecall: ratio(new Set(review.conflictMappings.map(item => item.expectedId)).size, fixture.seededConflictIds.length),
      incorrectMerges: new Set(review.incorrectMergeRiskIds).size, duplicateCanonicalRisks: new Set(review.duplicateRiskIds).size,
      ownerTaskCompletion: review.ownerTaskAttempts === null || review.ownerTaskSuccesses === null ? null : ratio(review.ownerTaskSuccesses, review.ownerTaskAttempts),
      ownerMinutes: review.ownerMinutes, inferenceRequests: review.inferenceRequests, inputCharacters: review.inputCharacters,
      confidenceCalibration: 'Requires held-out outcomes; confidence labels alone are not calibration evidence.',
    },
    interpretation: 'Null means not measured/not applicable, never a passing score. Structural checks do not establish semantic support, exploitability, legal compliance or commercial superiority.',
  };
}
