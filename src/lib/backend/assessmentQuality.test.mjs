import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEvidenceSource, referenceIssue, rateRisk, unknownRating, unknownRisk, actionIssues, scenarioIdentity, initialCoverage, assessmentSummary, createAssessmentQuality, graphSchema, riskIssues, evidenceAttestationIssues, changeAssessmentScope, resetRiskReview, reviewChangeIssues, primaryEvidenceExcerpts, architectureDefinition, parseThreats } from './assessmentQuality.ts';

test('unknown is never low and 5x5 ratings remain separate from CVSS/DREAD', () => {
  assert.deepEqual(rateRisk(unknownRating()), { band: 'Not rated', score: null });
  assert.equal(rateRisk({ likelihood: 5, impact: 5, rationale: '', reviewer: '' }).band, 'Critical');
  assert.equal(rateRisk({ likelihood: 1, impact: 5, rationale: '', reviewer: '' }).score, 5);
  assert.throws(() => rateRisk({ likelihood: 0, impact: 5, rationale: '', reviewer: '' }));
  assert.throws(() => rateRisk({ likelihood: 2.5, impact: 5, rationale: '', reviewer: '' }));
});

test('evidence references reproduce exact recorded lines, not merely a source title', async () => {
  const source = await makeEvidenceSource({ name: 'design.md', kind: 'document', text: 'Overview\nTLS required\nEnd',
    collectedAt: '2026-11-18', version: 'v1', derived: false, status: 'Complete', note: '' });
  const reference = { sourceId: source.id, startLine: 2, endLine: 2, quote: 'TLS required' };
  assert.equal(referenceIssue(reference, [source]), undefined);
  assert.equal(referenceIssue({ ...reference, startLine: 1, quote: 'Overview\r\nTLS required' }, [source]), undefined);
  assert.match(referenceIssue({ ...reference, quote: 'TLS enabled' }, [source]), /does not match/);
  assert.match(referenceIssue({ ...reference, endLine: 20 }, [source]), /invalid/);
  const changed = await makeEvidenceSource({ ...source, text: 'Overview\nTLS planned\nEnd' });
  assert.notEqual(changed.id, source.id);
  assert.match(referenceIssue(reference, [changed]), /unavailable/);
});

test('scope, version and treatment changes cannot silently inherit prior verification or acceptance', async () => {
  const { quality } = await assessment([finding]);
  const previous = structuredClone(quality);
  const risk = previous.risks[0];
  risk.current = { likelihood: 1, impact: 2, rationale: 'Scoped test', reviewer: 'Reviewer' };
  risk.disposition = 'Accepted risk';
  risk.decision = { owner: 'Owner', rationale: 'Scoped acceptance', at: '2026-01-01', expiresAt: '2027-01-01', reviewTrigger: 'Change' };
  const changed = structuredClone(previous);
  changed.systemVersion = 'deployment-v2';
  assert.ok(reviewChangeIssues(previous, changed).length);
  const reset = changeAssessmentScope(previous, { systemVersion: 'deployment-v2' });
  assert.deepEqual(reviewChangeIssues(previous, reset), []);
  assert.equal(reset.risks[0].disposition, 'Owner acceptance required');
  assert.equal(rateRisk(reset.risks[0].current).score, null);
  assert.equal(rateRisk(previous.risks[0].current).score, 2);
  const scenarioChanged = structuredClone(previous);
  scenarioChanged.risks[0].scenario.asset = 'Different asset';
  assert.ok(reviewChangeIssues(previous, scenarioChanged).length);
  resetRiskReview(scenarioChanged.risks[0]);
  assert.deepEqual(reviewChangeIssues(previous, scenarioChanged), []);
});

test('proof attestations are rejected even before a risk is rated or closed', async () => {
  const { quality } = await assessment([finding]);
  const risk = quality.risks[0];
  risk.controls.push({ description: 'Claimed ACL', state: 'Current', verified: true, artifactSourceIds: ['not-retained'] });
  risk.missingEvidence.push({ question: 'Does isolation hold?', supplier: '', verification: '', resolved: true, artifactSourceIds: [] });
  assert.equal(evidenceAttestationIssues(risk, quality, []).length, 2);
  assert.equal(rateRisk(risk.current).score, null);
});

test('primary retrieval reaches relevant late document lines within its exact size budget', async () => {
  const source = await makeEvidenceSource({ name: 'design', kind: 'document', text: 'General design notes.\n'.repeat(300) + 'Tenant isolation requires a negative authorization test.',
    collectedAt: '2026-11-18', version: 'v1', derived: false, status: 'Complete', note: '' });
  const generated = await makeEvidenceSource({ ...source, name: 'Generated digest', derived: true, text: 'Tenant isolation is confirmed.' });
  const excerpt = primaryEvidenceExcerpts([source, generated], 'Tenant isolation');
  assert.ok(excerpt.includes('L301: Tenant isolation'));
  assert.ok(excerpt.includes(source.id));
  assert.ok(!excerpt.includes(generated.id));
  assert.ok(excerpt.length <= 24000);
  assert.equal(primaryEvidenceExcerpts([source], 'Tenant isolation', 10), '');
  const digest = await makeEvidenceSource({ ...generated, parentSourceIds: [source.id] });
  assert.notEqual(digest.id, generated.id);
  assert.deepEqual(digest.parentSourceIds, [source.id]);
});

test('layout-only edits preserve review applicability; component, flow and trust changes do not', () => {
  const arranged = structuredClone(graph);
  arranged.components[0].metadata = { positions: { L2: { x: 200, y: 500 } } };
  assert.equal(architectureDefinition(graph), architectureDefinition(arranged));
  arranged.components[0].description = 'New data handling';
  assert.notEqual(architectureDefinition(graph), architectureDefinition(arranged));
  const boundary = { ...graph, trustBoundaries: ['External service'] };
  assert.notEqual(architectureDefinition(graph), architectureDefinition(boundary));
});

test('risk identities survive source order but never merge incomplete scenarios or different systems', async () => {
  const scenario = { actor: 'Tenant', preconditions: 'Signed in', action: 'Changes object ID', asset: 'Other tenant record', consequence: 'Disclosure' };
  const id = await scenarioIdentity('system-a', scenario, ['b', 'a'], ['f1']);
  assert.equal(id, await scenarioIdentity('system-a', scenario, ['a', 'b'], ['f1']));
  assert.equal(id, await scenarioIdentity('system-a', { consequence: scenario.consequence, ...scenario }, ['a', 'b'], ['f1']));
  assert.notEqual(id, await scenarioIdentity('system-b', scenario, ['a', 'b'], ['f1']));
  assert.notEqual(await scenarioIdentity('system-a', scenario, [], [], 'production'), await scenarioIdentity('system-a', scenario, [], [], 'staging'));
  assert.equal(await scenarioIdentity('system-a', { ...scenario, actor: '' }, [], []), undefined);
  assert.equal(await scenarioIdentity('system-a', { ...scenario, actor: 'Unknown actor' }, [], []), undefined);
});

const finding = {
  id: 'T-1', title: 'Cross-tenant disclosure', description: 'Another tenant can read records.', category: 'STRIDE: Disclosure',
  componentId: 'API', affectedComponentIds: ['API'], affectedFlowIds: [], cvssScore: 8.1, severity: 'High',
  qualityProposal: {
    scenario: { actor: 'Tenant', preconditions: 'Signed in', action: 'Changes object ID', asset: 'Other tenant record', consequence: 'Disclosure' },
    frameworkTags: ['STRIDE: Disclosure'], evidenceStatus: 'Hypothesis', confidence: { level: 'Low', reason: 'Implementation is not available.' },
    references: [], controls: [], missingEvidence: [],
  },
};
const graph = { components: [{ id: 'API', name: 'API', type: 'Process', description: '' }], edges: [], trustBoundaries: [] };
const assessment = threats => createAssessmentQuality(threats, graph, [], { systemId: 'system-a', scope: 'API', environment: 'staging' });

test('exact scenarios reconcile once while preserving every observation and framework lens', async () => {
  const second = { ...finding, id: 'T-1', title: 'Renamed privacy lens', category: 'LINDDUN: Disclosure',
    qualityProposal: { ...finding.qualityProposal, frameworkTags: ['LINDDUN: Disclosure'] } };
  const { threats, quality } = await assessment([finding, second]);
  assert.equal(threats.length, 1);
  assert.equal(quality.risks.length, 1);
  assert.equal(quality.observations.length, 2);
  assert.equal(quality.observations[1].finding.title, second.title);
  assert.deepEqual(quality.risks[0].frameworkTags, ['STRIDE: Disclosure', 'LINDDUN: Disclosure']);
  assert.equal(quality.reconciliation[0].observationIds.length, 2);
  const renamed = await assessment([{ ...finding, title: 'Changed title' }]);
  assert.equal(threats[0].id, renamed.threats[0].id);
  const separated = await assessment([finding, { ...finding, qualityProposal: { ...finding.qualityProposal, scenario: { ...finding.qualityProposal.scenario, preconditions: 'Anonymous' } } }]);
  assert.equal(separated.threats.length, 2);
});

test('duplicate agent IDs and missing scenarios never create ambiguous canonical navigation', async () => {
  const { quality, threats } = await assessment([{ ...finding, qualityProposal: undefined }, { ...finding, qualityProposal: undefined }]);
  assert.notEqual(threats[0].id, threats[1].id);
  assert.equal(quality.risks.length, 2);
});

test('malformed scores and graph identities are rejected before finalization', async () => {
  await assert.rejects(assessment([{ ...finding, cvssScore: 22 }]));
  assert.throws(() => graphSchema.parse({ ...graph, components: [...graph.components, ...graph.components] }));
  assert.throws(() => graphSchema.parse({ ...graph, edges: [{ id: 'f1', sourceId: 'API', targetId: 'missing' }] }));
  assert.throws(() => parseThreats([{ ...finding, qualityProposal: undefined }], true));
});

test('unsupported observation claims are downgraded and cannot erase verification requests', async () => {
  const { quality } = await assessment([{ ...finding, qualityProposal: { ...finding.qualityProposal, evidenceStatus: 'Observed' } }]);
  assert.equal(quality.risks[0].evidenceStatus, 'Hypothesis');
  assert.ok(quality.risks[0].issues.length);
  assert.ok(quality.risks[0].missingEvidence.length);
});

test('planned controls cannot lower current risk or attest their own effectiveness', async () => {
  const { quality } = await assessment([finding]);
  const risk = quality.risks[0];
  risk.inherent = { likelihood: 5, impact: 5, rationale: 'Impact', reviewer: 'Owner' };
  risk.current = { likelihood: 1, impact: 1, rationale: 'Planned fix', reviewer: 'Owner' };
  risk.controls = [{ description: 'Future ACL', state: 'Planned', verified: true, artifactSourceIds: [] }];
  const issues = riskIssues(risk, quality, []);
  assert.ok(issues.some(issue => /cannot be verified/.test(issue)));
  assert.ok(issues.some(issue => /cannot be reduced/.test(issue)));
  const generated = await assessment([{ ...finding, qualityProposal: { ...finding.qualityProposal, controls: risk.controls } }]);
  assert.equal(generated.quality.risks[0].controls[0].verified, false);
});

test('expired acceptance and unverifiable closure remain explicit blockers', async () => {
  const { quality } = await assessment([finding]);
  const risk = quality.risks[0];
  risk.disposition = 'Accepted risk';
  risk.decision = { owner: 'Business owner', rationale: 'Limited scope', at: '2026-01-01', expiresAt: '2026-02-01', reviewTrigger: 'Source change' };
  assert.ok(riskIssues(risk, quality, [], new Date('2026-11-18')).some(issue => /expired/.test(issue)));
  risk.disposition = 'Closed with evidence';
  assert.ok(riskIssues(risk, quality, []).some(issue => /passing verification/.test(issue)));
});

test('verified treatment requires ownership, test and actual passing evidence, not ticket completion', () => {
  const action = {
    id: 'A1', description: 'Enforce authorization', owner: 'API team', priority: 'Before launch', milestone: 'Launch gate',
    dependencies: [], requirements: ['REQ-1'], acceptanceTest: 'Tenant A request for tenant B record returns 403',
    expectedArtifact: 'Authorization test run', incompleteRisk: 'Cross-tenant disclosure remains',
    status: 'Verified', verification: { result: 'Not run', artifactSourceIds: [], reviewer: '', at: '', environment: '' },
  };
  assert.ok(actionIssues(action, []).length >= 3);
  action.verification = { result: 'Pass', artifactSourceIds: ['proof'], reviewer: 'Security reviewer', at: '2026-11-18', environment: 'staging' };
  assert.deepEqual(actionIssues(action, ['proof']), []);
  assert.ok(actionIssues(action, []).length);
});

test('legacy findings and unexamined inventory are not presented as verified or covered', () => {
  const risk = unknownRisk({ id: 'old', category: 'STRIDE', severity: 'Critical' });
  assert.equal(risk.evidenceStatus, 'Hypothesis');
  assert.equal(risk.disposition, 'Blocker');
  assert.equal(rateRisk(risk.current).band, 'Not rated');
  assert.equal(assessmentSummary().label, 'Legacy / unverified');
  const coverage = initialCoverage({ components: [{ id: 'API', name: 'API' }], edges: [{ id: 'f1', sourceId: 'API', targetId: 'DB' }] });
  assert.equal(coverage.length, 2);
  assert.ok(coverage.every(row => row.state === 'Not assessed'));
});
