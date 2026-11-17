import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAssessmentQuality, makeEvidenceSource, parseMitigationProposal, qualitySchema } from './assessmentQuality.ts';
import { assessmentReadiness, recordedDecisionLabel, releaseDecisionIssues, reviewValidationIssues } from './assessmentWorkflow.ts';
import { buildReviewInventory, parseAssessmentAnalysis, selectedProfiles } from './assessmentAnalysis.ts';
import { compareAssessments, invalidateAssessment, linkReassessmentRisk, reconcileAssessment } from './assessmentLifecycle.ts';
import { encodeModelInputs, decodeModelInputs, validateAssessmentBackup } from './assessmentBackupFormat.ts';
import { hashBytes } from './inputUtils.ts';
import { evaluateAssessment } from './assessmentEvaluation.ts';

const now = new Date('2026-06-01T12:00:00Z');
const graph = { components: [{ id: 'api', name: 'API', type: 'Process', description: '' }], edges: [], trustBoundaries: [] };
const finding = { id: 'T1', title: 'Tenant record disclosure', description: 'Modeled cross-tenant exposure.', category: 'Disclosure',
  componentId: 'api', cvssScore: 8, severity: 'High', qualityProposal: {
    scenario: { actor: 'Tenant', preconditions: 'Signed in', action: 'Changes record ID', asset: 'Other tenant record', consequence: 'Disclosure' },
    frameworkTags: ['STRIDE'], evidenceStatus: 'Hypothesis', confidence: { level: 'Low', reason: 'Unverified deployment.' },
    references: [], controls: [], missingEvidence: [],
  } };
async function fixture(findings = [finding]) {
  const source = await makeEvidenceSource({ name: 'Scoped checks', kind: 'verification-artifact', text: 'Tenant isolation tests passed.\nIsolation is disabled.',
    collectedAt: '2026-01-01', version: 'v1', derived: false, status: 'Complete', note: 'Synthetic proof.' });
  const generated = await createAssessmentQuality(findings, graph, [source], { systemId: 'system', scope: 'API', environment: 'staging', systemVersion: 'v1' });
  const model = { id: 'TM-FIXTURE', name: 'Fixture', description: 'Synthetic fixture', date: '2026-01-01', riskScore: 0, status: 'Review required',
    srg: graph, threats: generated.threats, complianceGaps: [], quality: generated.quality };
  return { model, quality: model.quality, source, reference: { sourceId: source.id, startLine: 1, endLine: 1, quote: 'Tenant isolation tests passed.' } };
}
function closeRisk(quality, source) {
  quality.rubric.approvedBy = 'Business owner'; quality.rubric.approvedAt = '2026-01-01';
  const risk = quality.risks[0];
  risk.owner = 'API owner'; risk.current = { likelihood: 1, impact: 2, rationale: 'Scoped test', reviewer: 'Reviewer' };
  risk.missingEvidence.forEach(request => Object.assign(request, { resolved: true, supplier: 'API owner', verification: 'Scoped negative case', artifactSourceIds: [source.id] }));
  risk.actions = [{ id: 'A1', description: 'Enforce record isolation', proposedOwner: 'API team', owner: 'API owner', priority: 'Before launch',
    milestone: 'Release gate', dependencies: [], requirements: [], acceptanceTest: 'Other tenant gets 403', expectedArtifact: 'Test output',
    incompleteRisk: 'Disclosure', status: 'Verified', verification: { result: 'Pass', reviewer: 'Reviewer', at: '2026-01-01', environment: 'staging', artifactSourceIds: [source.id] } }];
  risk.disposition = 'Closed with evidence'; risk.decision = { owner: 'Owner', rationale: 'Scoped passing proof', at: '2026-01-01', expiresAt: '', reviewTrigger: 'Change' };
}

test('offline closure integrity uses the same future-proof and owner-decision guards as review saves', async () => {
  const { quality, source } = await fixture();
  closeRisk(quality, source);
  const reference = { id: 'closure', cohort: 'web-api', authorizedSourceInventory: [source.name], materialScenarioIds: [], requiredInventoryIds: [], seededConflictIds: [] };
  const integrity = () => evaluateAssessment(quality, [source], reference).structural.closureIntegrity;
  assert.equal(integrity(), 1);
  const future = new Date(Date.now() + 86_400_000).toISOString();
  quality.risks[0].actions[0].verification.at = future;
  assert.equal(integrity(), 0);
  quality.risks[0].actions[0].verification.at = '2026-01-01';
  quality.risks[0].decision.at = future;
  assert.equal(integrity(), 0);
});

test('system Go requires reviewed coverage and decisions; conditional go is an owned expiring gate', async () => {
  const { quality, source, reference } = await fixture();
  assert.equal(assessmentReadiness(quality, now).recommendation, 'Hold');
  closeRisk(quality, source);
  quality.coverage.forEach(row => Object.assign(row, { state: 'Examined', owner: 'Reviewer', rationale: 'Scoped review', references: [reference] }));
  assert.deepEqual(reviewValidationIssues(quality, [source], now), []);
  assert.equal(assessmentReadiness(quality, now).recommendation, 'Go');
  quality.scope = 'Scope and exclusions require owner confirmation.';
  assert.equal(assessmentReadiness(quality, now).recommendation, 'Hold');
  quality.scope = 'API';
  quality.releaseDecision = { state: 'Go', owner: 'Release owner', rationale: 'Reviewed', at: '2026-01-01', expiresAt: '', reviewTrigger: 'Change', conditions: [] };
  assert.deepEqual(releaseDecisionIssues(quality, now), []);
  quality.stageIssues.push('Unverified route');
  assert.ok(releaseDecisionIssues(quality, now).length);
  assert.match(recordedDecisionLabel(quality, now), /stale/);
  quality.releaseDecision.state = 'Conditional go';
  assert.ok(releaseDecisionIssues(quality, now).length);
  quality.releaseDecision.expiresAt = '2027-01-01';
  quality.releaseDecision.conditions = [{ requirement: 'Verify route before launch', owner: 'Service owner', riskId: quality.risks[0].id, actionId: 'A1' }];
  assert.deepEqual(releaseDecisionIssues(quality, now), []);
  assert.match(recordedDecisionLabel(quality, new Date('2028-01-01')), /expired/);
});

test('proposed treatment rejects blank tests and invented requirement links before caching', () => {
  const proposal = { narrative: 'Use scoped isolation checks.', actions: [{ description: 'Enforce isolation', proposedOwner: 'API team', priority: 'Before launch',
    milestone: 'Gate', dependencies: [], requirements: ['REQ-1'], acceptanceTest: 'Other tenant gets 403', expectedArtifact: 'Output', incompleteRisk: 'Disclosure' }] };
  assert.throws(() => parseMitigationProposal(proposal), /requirement IDs/);
  assert.doesNotThrow(() => parseMitigationProposal(proposal, ['REQ-1']));
  proposal.actions[0].acceptanceTest = ' ';
  assert.throws(() => parseMitigationProposal(proposal, ['REQ-1']), /concrete action/);
});

test('conflicts, orphan requirements and fake proof cannot bypass review', async () => {
  const { quality, source, reference } = await fixture();
  closeRisk(quality, source);
  const conflict = { id: 'C1', riskIds: [], description: 'Contradictory claims', references: [reference,
    { sourceId: source.id, startLine: 2, endLine: 2, quote: 'Isolation is disabled.' }], owner: '', verification: '', resolved: false, resolution: '', artifactSourceIds: [] };
  quality.conflicts.push(conflict);
  assert.ok(reviewValidationIssues(quality, [source], now).some(issue => /conflicting/.test(issue)));
  conflict.resolved = true;
  assert.ok(reviewValidationIssues(quality, [source], now).some(issue => /conflict resolution/.test(issue)));
  Object.assign(conflict, { owner: 'Owner', verification: 'Check deployment', resolution: 'Evidence establishes the scoped configuration', artifactSourceIds: [source.id] });
  assert.deepEqual(reviewValidationIssues(quality, [source], now), []);
  quality.risks[0].actions[0].requirements = ['made-up-control'];
  assert.ok(reviewValidationIssues(quality, [source], now).some(issue => /requirement/.test(issue)));
});

test('profile selection uses late primary evidence, not generated claims or absent documentation', async () => {
  const source = await makeEvidenceSource({ name: 'Design', kind: 'document', text: 'Overview\n'.repeat(500) + 'LLM handles patient eligibility and personal data.',
    collectedAt: '2026-01-01', version: 'v1', derived: false, status: 'Complete', note: '' });
  assert.ok(selectedProfiles([source]).every(profile => profile.references[0].startLine === 501));
  assert.ok(selectedProfiles([{ ...source, derived: true }]).every(profile => !profile.references.length));
  const inventory = buildReviewInventory(graph, []);
  assert.ok(inventory.some(row => row.id === 'profile:ai:applicability'));
  assert.ok(inventory.every(row => row.state === 'Not assessed'));
  const review = { coverage: inventory.map(row => ({ id: row.id, result: 'Unknown', rationale: 'Not supplied', references: [], requests: row.requests.length ? row.requests : [
    { question: 'Does the scoped control exist?', supplier: 'Owner role', verification: 'Provide scoped test', resolved: false, artifactSourceIds: [] }] })),
    conflicts: [], inventoryAdditions: [], additionalFindings: [], requirements: [] };
  assert.doesNotThrow(() => parseAssessmentAnalysis(review, inventory, [source], graph));
  assert.throws(() => parseAssessmentAnalysis({ ...review, coverage: review.coverage.slice(1) }, inventory, [source], graph), /omitted/);
  const duplicate = structuredClone(review); duplicate.coverage.push(duplicate.coverage[0]);
  assert.throws(() => parseAssessmentAnalysis(duplicate, inventory, [source], graph), /duplicate/);
  const fabricated = structuredClone(review); fabricated.coverage[0].requests[0].resolved = true;
  assert.throws(() => parseAssessmentAnalysis(fabricated, inventory, [source], graph), /cannot assert/);
});

test('human merge and split preserve observations and prior records, and invalidate consequential decisions', async () => {
  const different = structuredClone(finding); different.qualityProposal.scenario.preconditions = 'Anonymous';
  const { model } = await fixture([finding, different]);
  const before = JSON.stringify(model);
  const merged = await reconcileAssessment(model, { kind: 'merge', riskIds: model.quality.risks.map(risk => risk.id), reason: 'Reviewed equivalent business exposure; retain both sub-cases' }, 'Reviewer');
  assert.equal(merged.threats.length, 1); assert.equal(merged.quality.observations.length, 2);
  assert.equal(merged.quality.risks[0].current.likelihood, null);
  assert.equal(JSON.stringify(model), before);
  const split = await reconcileAssessment(merged, { kind: 'split', riskId: merged.threats[0].id,
    observationIds: [merged.quality.observations[0].id], reason: 'Separate authentication boundaries' }, 'Reviewer');
  assert.equal(split.threats.length, 2);
  assert.equal(new Set(split.quality.observations.map(observation => observation.id)).size, 2);
  assert.equal(new Set(split.quality.observations.map(observation => observation.riskId)).size, 2);
  await assert.rejects(reconcileAssessment(split, { kind: 'split', riskId: split.threats[0].id, observationIds: [], reason: 'Bad split' }, 'Reviewer'));
  const changed = await invalidateAssessment(model, 'Incident', 'Recheck exposure', 'Owner');
  assert.equal(changed.quality.revision, model.quality.revision + 1);
  assert.equal(changed.quality.releaseDecision.state, 'Not recorded');
});

test('reassessment absence is not resolution and different system/environment comparisons fail', async () => {
  const { model } = await fixture(); const next = structuredClone(model);
  next.quality.risks = []; next.threats = [];
  assert.equal(compareAssessments(model, next).rows[0].state, 'Not re-observed');
  next.quality.systemId = 'different';
  assert.throws(() => compareAssessments(model, next), /same system/);
});

test('reviewed reassessment matching reuses only parent identity, not parent proof or decisions', async () => {
  const { model: parent, source } = await fixture(); closeRisk(parent.quality, source);
  parent.quality.revision = 2;
  const { model } = await fixture(); model.id = 'TM-REASSESSMENT';
  const originalId = model.quality.risks[0].id;
  model.quality.risks[0].id = 'RISK-NEW'; model.threats[0].id = 'RISK-NEW';
  model.quality.observations.forEach(observation => { observation.riskId = 'RISK-NEW'; });
  model.quality.reconciliation[0].riskId = 'RISK-NEW';
  model.quality.parentAssessmentId = parent.id; model.quality.parentAssessmentRevision = 2;
  const linked = await linkReassessmentRisk(model, parent, 'RISK-NEW', originalId, 'Same reviewed scenario with renamed component', 'Reviewer');
  assert.equal(linked.threats[0].id, originalId);
  assert.equal(linked.quality.risks[0].current.likelihood, null);
  assert.notEqual(linked.quality.risks[0].disposition, 'Closed with evidence');
  assert.equal(linked.quality.reconciliation[0].decision, 'Link');
  assert.equal(parent.quality.risks[0].disposition, 'Closed with evidence');
  model.quality.parentAssessmentRevision = 1;
  await assert.rejects(linkReassessmentRisk(model, parent, 'RISK-NEW', originalId, 'Stale parent', 'Reviewer'), /retained parent/);
});
test('private backup round-trips original bytes and rejects altered evidence, files and lineage', async () => {
  const { model, source } = await fixture();
  const bytes = new Uint8Array([0, 255, 37]); const version = `file-sha256:${await hashBytes(bytes.buffer)}`;
  const metadata = await makeEvidenceSource({ ...source, name: 'Original attachment: original.bin', kind: 'attachment-metadata', version, text: version });
  model.quality.sourceIds.push(metadata.id);
  const inputs = await encodeModelInputs({ modelId: model.id, version: 1, payload: { name: model.name, description: 'Original description', frameworks: ['STRIDE'],
    inputFiles: { documents: [{ name: 'original.bin', type: 'application/octet-stream', lastModified: 1, contents: new Blob([bytes]) }], diagrams: [] } } });
  assert.deepEqual(new Uint8Array(await decodeModelInputs(inputs).payload.inputFiles.documents[0].contents.arrayBuffer()), bytes);
  const backup = { schemaVersion: 'seidr-local-backup-v1', exportedAt: now.toISOString(), models: [model], sources: [source, metadata], inputs: [inputs],
    revisions: [], documents: [], businessRisks: [] };
  await validateAssessmentBackup(backup);
  const badSource = structuredClone(backup); badSource.sources[0].text = 'Changed';
  await assert.rejects(validateAssessmentBackup(badSource), /fingerprint/);
  const badFile = structuredClone(backup); badFile.inputs[0].payload.inputFiles.documents[0].contents.data = btoa('different');
  await assert.rejects(validateAssessmentBackup(badFile), /attachment bytes/);
  const missing = structuredClone(backup); missing.sources = [];
  await assert.rejects(validateAssessmentBackup(missing), /missing retained evidence/);
  assert.equal(qualitySchema.parse(model.quality).run.state, 'Ready for review');
});
