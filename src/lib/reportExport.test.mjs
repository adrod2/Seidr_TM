import assert from 'node:assert/strict';
import { test } from 'node:test';
import XLSX from 'xlsx';
import { buildFindingsCsv, dreadMean, mitigationActions, prioritizeThreats, reportArchitecture,
  reportFindings, reportOverview, reportTranslationPayload, mergeReportTranslation, scoreLabel } from './reportExport.ts';

const finding = (id, severity = 'High', cvssScore = 7.5) => ({
  id, severity, cvssScore, title: `Finding ${id}`, category: 'STRIDE: Spoofing', componentId: 'AUTH',
  description: 'Unauthorized access to tenant records.',
  evidence: 'Document: architecture.md [Section 3]\n"tenant_id" is user supplied.',
  reasoning: '1. Authenticate as tenant A.\n2. Request a tenant B record.',
});
const model = (threats = []) => ({
  id: 'TM-EXPORT', name: 'Assessment', date: '2026-11-17', status: 'Completed', riskScore: 75,
  framework: 'Hybrid TM', description: 'System description',
  threats, complianceGaps: [], srg: {
    components: [
      { id: 'API', name: 'API container', type: 'Process', c4Type: 'Container', c4Level: 'L2', description: 'Receives HTTPS.' },
      { id: 'AUTH', name: 'Authorization service', type: 'Process', c4Type: 'Component', c4Level: 'L3', description: 'Authorizes tenant access.' },
      { id: 'SYSTEM', name: 'Overall system', type: 'Process', c4Type: 'System', c4Level: 'L1', description: 'System context.' },
    ],
    edges: [{ id: 'e1', sourceId: 'API', targetId: 'AUTH', label: 'Authorizes request' }, { id: 'e2', sourceId: 'AUTH', targetId: 'MISSING' }],
    trustBoundaries: ['Internet', 'Private network'],
  },
});

test('findings rank by severity, then numeric CVSS, without mutating saved order', () => {
  const threats = [finding('LOW', 'Low', 3), finding('HIGH-1', 'High', 7), finding('UNKNOWN', 'Unknown', 10),
    finding('CRITICAL', 'Critical', 8), finding('HIGH-2', 'High', 9), finding('INVALID', 'High', NaN)];
  assert.deepEqual(prioritizeThreats(threats).map(t => t.id), ['CRITICAL', 'HIGH-2', 'HIGH-1', 'INVALID', 'LOW', 'UNKNOWN']);
  assert.equal(threats[0].id, 'LOW');
  assert.equal(scoreLabel(0, 'Missing'), '0.0');
  for (const invalid of [undefined, null, NaN, -1, 11]) assert.equal(scoreLabel(invalid, 'Missing'), 'Missing');
});

test('exports retain all finding details, mitigation representations, scores and source references', () => {
  const high = { ...finding('HIGH'), mitigation: 'Reject cross-tenant access.',
    mitigations: ['Reject cross-tenant access.', ' Test authorization boundaries. '],
    exploitationRisk: 'Authenticated low-privilege users could cross tenant boundaries; validate enforcement.',
    dread: { damage: 8, reproducibility: 7, exploitability: 6, affectedUsers: 9, discoverability: 5 },
    status: 'In Progress', justification: 'Owner assigned.' };
  const report = model([finding('LOW', 'Low', 0), high]);
  const csv = buildFindingsCsv(report);
  const workbook = XLSX.read(csv, { type: 'string', raw: true });
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
  assert.equal(rows[0].length, rows[1].length);
  assert.equal(rows[1][1], 'HIGH');
  for (const value of [high.evidence, high.reasoning, high.description, high.exploitationRisk, high.justification, high.status, high.category, report.framework]) {
    assert.ok(rows[1].includes(value), `Missing export field: ${value}`);
  }
  assert.ok(rows[1].includes('Authorization service [AUTH]'));
  assert.ok(rows[1].includes('Reject cross-tenant access.\n\nTest authorization boundaries.'));
  assert.ok(rows[1].includes('7.0'));
  assert.ok(rows[2].includes('0.0'));
  assert.deepEqual(mitigationActions(high), ['Reject cross-tenant access.', 'Test authorization boundaries.']);
  assert.equal(reportFindings(report)[0].anchor, 'report-finding-1');
});

test('CSV preserves complete long text and neutralizes spreadsheet formulas', () => {
  const threat = { ...finding('T-1'), title: '=HYPERLINK("https://example.test")',
    evidence: 'record, "quoted"\n'.repeat(1000) + 'FINAL-EVIDENCE-MARKER' };
  const csv = buildFindingsCsv(model([threat]));
  const workbook = XLSX.read(csv, { type: 'string', raw: true });
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
  assert.ok(rows[1].includes(`'${threat.title}`));
  assert.ok(rows[1].includes(threat.evidence));
  assert.ok(rows[1].some(value => String(value).includes('No separate exploitation-likelihood assessment')));
});

test('exports retain every explicit component and data-flow target without translating their IDs', () => {
  const threat = { ...finding('MULTI'), affectedComponentIds: ['API', 'AUTH'], affectedFlowIds: ['e1'] };
  const report = model([threat]);
  assert.equal(reportFindings(report)[0].component, 'API container [API]; Authorization service [AUTH]');
  const csv = buildFindingsCsv(report);
  assert.match(csv, /Data flows affected/);
  const workbook = XLSX.read(csv, { type: 'string', raw: true });
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
  assert.equal(rows[1][rows[0].indexOf('Data flows affected')], 'e1');
  const payload = structuredClone(reportTranslationPayload(report));
  payload.threats[0].affectedComponentIds = ['WRONG'];
  payload.threats[0].affectedFlowIds = ['WRONG'];
  const translated = mergeReportTranslation(report, payload);
  assert.deepEqual(translated.threats[0].affectedComponentIds, ['API', 'AUTH']);
  assert.deepEqual(translated.threats[0].affectedFlowIds, ['e1']);
  assert.equal(reportFindings(model([{ ...threat, affectedComponentIds: [] }]))[0].component, 'Not recorded');
});

test('DREAD is independent of CVSS and requires all five valid dimensions for its mean', () => {
  const threat = { ...finding('T-1', 'Critical', 9.8),
    dread: { damage: 4, reproducibility: 5, exploitability: 6, affectedUsers: 7, discoverability: 8, mean: 10 } };
  assert.equal(dreadMean(threat), 6);
  assert.equal(threat.cvssScore, 9.8);
  assert.equal(dreadMean({ ...threat, dread: { ...threat.dread, damage: 0 } }), undefined);
  assert.equal(dreadMean(finding('LEGACY')), undefined);
});

test('C4 export includes L3 components and their real relationships, with explicit legacy and empty states', () => {
  const report = model();
  const architecture = reportArchitecture(report.srg);
  assert.deepEqual(architecture.elements.map(c => c.id), ['API', 'AUTH']);
  assert.deepEqual(architecture.relations.map(r => r.id), ['e1']);
  assert.equal(architecture.hasComponentDetail, true);
  assert.match(architecture.definition, /Authorization service/);
  const legacy = reportArchitecture({ components: [report.srg.components[2]], edges: [] });
  assert.equal(legacy.hasComponentDetail, false);
  assert.equal(legacy.elements[0].id, 'SYSTEM');
  assert.equal(reportArchitecture(undefined).definition, '');
});

test('overview does not leak appended source context into the executive summary', () => {
  const report = model();
  report.description = '=== SYSTEM DESCRIPTION (provided by the user) ===\nTenant API.\n\n=== SUPPORTING DOCUMENTS ===\nSENSITIVE APPENDED CONTEXT';
  assert.equal(reportOverview(report), 'Tenant API.');
  report.assessmentMeta = { descriptionSummary: 'Saved overview.' };
  assert.equal(reportOverview(report), 'Saved overview.');
});

test('translation preserves canonical ranking, all scores, categories, IDs and architecture', () => {
  const threat = { ...finding('T-1'), mitigations: ['Check tenant authorization.'], exploitationRisk: 'Requires an authenticated session.',
    dread: { damage: 8, reproducibility: 7, exploitability: 6, affectedUsers: 9, discoverability: 5 } };
  const report = model([threat]);
  report.complianceGaps = [{ controlId: 'AC-3', title: 'First control', description: 'First gap', status: 'Gap Identified' },
    { controlId: 'AC-3', title: 'Second control', description: 'Second gap', status: 'Partially Met' }];
  const payload = structuredClone(reportTranslationPayload(report));
  payload.threats[0] = { ...payload.threats[0], title: 'Translated finding', evidence: 'Translated evidence',
    severity: 'Low', cvssScore: 0, category: 'Changed taxonomy', componentId: 'WRONG', dread: {} };
  payload.complianceGaps[1].title = 'Translated second control';
  const translated = mergeReportTranslation(report, payload);
  assert.equal(translated.threats[0].title, 'Translated finding');
  assert.equal(translated.threats[0].evidence, 'Translated evidence');
  for (const key of ['severity', 'cvssScore', 'category', 'componentId']) assert.equal(translated.threats[0][key], threat[key]);
  assert.deepEqual(translated.threats[0].dread, threat.dread);
  assert.equal(translated.srg, report.srg);
  assert.equal(translated.complianceGaps[1].title, 'Translated second control');
  assert.equal(translated.complianceGaps[1].status, 'Partially Met');
  assert.equal(report.threats[0].title, 'Finding T-1');
  delete payload.threats[0].evidence;
  assert.throws(() => mergeReportTranslation(report, payload), /omitted required text/);
});

test('missing translated findings fail instead of silently exporting incomplete content', () => {
  const report = model([finding('T-1')]);
  const payload = reportTranslationPayload(report);
  payload.threats = [];
  assert.throws(() => mergeReportTranslation(report, payload), /omitted finding T-1/);
  const withActions = model([{ ...finding('T-2'), mitigations: ['First action', 'Second action'] }]);
  const translated = reportTranslationPayload(withActions);
  translated.threats[0].mitigations = ['Only one translated action'];
  assert.throws(() => mergeReportTranslation(withActions, translated), /omitted mitigation actions/);
});
