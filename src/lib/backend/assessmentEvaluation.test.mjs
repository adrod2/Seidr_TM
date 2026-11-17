import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAssessmentQuality, makeEvidenceSource } from './assessmentQuality.ts';
import { buildReviewInventory, selectedProfiles } from './assessmentAnalysis.ts';
import { evaluateAssessment } from './assessmentEvaluation.ts';

const graph = { components: [{ id: 'api', name: 'API', type: 'Process', description: '' }, { id: 'worker', name: 'Worker', type: 'Process', description: '' }],
  edges: [{ id: 'job', sourceId: 'api', targetId: 'worker', label: 'Submits job' }], trustBoundaries: [] };
for (const [cohort, text, profiles] of [
  ['web-api', 'Tenant record API uses OAuth and customer records.', ['privacy']],
  ['multi-repository', 'Frontend and worker repositories use incompatible authorization contracts.', []],
  ['ai', 'LLM accepts untrusted documents and invokes tools.', ['ai']],
  ['consequential-decision', 'Eligibility and hiring decisions require human appeals.', ['decision']],
  ['asynchronous', 'Queue redelivery changes the system of record twice unless idempotency is enforced.', []],
  ['incomplete-conflicting', 'Encryption is disabled.\nEncryption is enforced.\nDeployment region is unknown.', []],
]) test(`evaluation cohort ${cohort} preserves unknowns and evidence-selected review inventory`, async () => {
  const source = await makeEvidenceSource({ name: 'Authorized synthetic design', kind: 'document', text, version: 'fixture-v1',
    collectedAt: '2026-01-01', derived: false, status: 'Complete', note: '' });
  const { quality } = await createAssessmentQuality([], graph, [source], { systemId: 'fixture', scope: 'Synthetic cohort' });
  quality.coverage = buildReviewInventory(graph, [source]);
  for (const id of profiles) assert.ok(selectedProfiles([source]).find(profile => profile.id === id).references.length);
  const result = evaluateAssessment(quality, [source], { id: cohort, cohort, authorizedSourceInventory: [source.name], materialScenarioIds: ['expected-risk'],
    requiredInventoryIds: ['integration:job', 'destination:backups / recovery'], seededConflictIds: cohort === 'incomplete-conflicting' ? ['expected-conflict'] : [] });
  assert.equal(result.structural.recommendation, 'Hold');
  assert.equal(result.structural.examinedInventoryFraction, 0);
  assert.equal(result.structural.closureIntegrity, null);
  assert.equal(result.independentlyReviewed, null);
  assert.equal(result.comparativeClaimSupported, false);
});

test('independent evaluation includes unmatched false positives and refuses invalid reviewer mappings', async () => {
  const finding = { id: 'raw', title: 'Synthetic risk', description: 'Unverified', category: 'Disclosure', componentId: 'api', cvssScore: 7, severity: 'High' };
  const { quality } = await createAssessmentQuality([finding, { ...finding, title: 'Unmatched claim' }], graph, [], { systemId: 'fixture', scope: 'API' });
  const reference = { id: 'matched', cohort: 'web-api', authorizedSourceInventory: ['approved fixture'], materialScenarioIds: ['gold'],
    requiredInventoryIds: [], seededConflictIds: [] };
  const review = { reviewer: 'Independent fixture reviewer', independent: true, authorizedInputs: true, protocolFrozenBeforeRun: true,
    scenarioMappings: [{ expectedId: 'gold', riskId: quality.risks[0].id, support: 'Supported', decisionAgrees: true, reason: 'Matches reference case' }],
    additionalClaimReviews: [{ riskId: quality.risks[1].id, support: 'Unsupported', reason: 'Not supported by the fixture' }],
    conflictMappings: [], incorrectMergeRiskIds: [], duplicateRiskIds: [], ownerTaskSuccesses: 1, ownerTaskAttempts: 2,
    ownerMinutes: null, inferenceRequests: null, inputCharacters: null };
  const result = evaluateAssessment(quality, [], reference, review);
  assert.equal(result.independentlyReviewed.materialScenarioRecall, 1);
  assert.equal(result.independentlyReviewed.unsupportedReviewedClaimFraction, 0.5);
  assert.equal(result.independentlyReviewed.ownerTaskCompletion, 0.5);
  assert.equal(result.comparativeClaimSupported, false);
  assert.equal(evaluateAssessment(quality, [], reference, { ...review, independent: false }).independentlyReviewed, null);
  assert.throws(() => evaluateAssessment(quality, [], reference, { ...review, scenarioMappings: [{ ...review.scenarioMappings[0], riskId: 'not-recorded' }] }), /mappings/);
});
