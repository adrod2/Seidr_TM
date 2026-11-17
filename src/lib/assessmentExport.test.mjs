import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import Ajv from 'ajv';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { assessmentExportSchema, createAssessmentQuality, makeEvidenceSource } from './backend/assessmentQuality.ts';
import { buildAssessmentExport, buildFindingsCsv, mergeReportTranslation, reportTranslationPayload } from './reportExport.ts';

const graph = { components: [{ id: 'api', name: 'API', type: 'Process', description: 'Tenant records' }], edges: [], trustBoundaries: [] };
const input = { id: 'T-1', title: 'Read another tenant', description: 'Cross-tenant disclosure.',
  category: 'STRIDE: Disclosure', componentId: 'api', cvssScore: 8, severity: 'High' };
const fixture = async () => {
  const source = await makeEvidenceSource({ name: 'Design', kind: 'document', text: 'Tenant records', collectedAt: '2026-11-18T00:00:00Z',
    version: 'v1', derived: false, status: 'Complete', note: '' });
  const { threats, quality } = await createAssessmentQuality([input], graph, [source], { systemId: 'system-a', scope: 'API' });
  const { text: _text, ...metadata } = source;
  return { id: 'TM-1', name: 'Tenant API', date: '2026-11-18', description: 'Tenant records',
    framework: 'STRIDE', riskScore: 0, status: 'Review required', quality, threats, srg: graph, complianceGaps: [], evidenceManifest: [metadata] };
};

test('published JSON schema is generated from runtime contracts and validates the real export', async () => {
  const schema = JSON.parse(await readFile(new URL('../../public/schemas/assessment-v1.schema.json', import.meta.url), 'utf8'));
  assert.deepEqual(schema, zodToJsonSchema(assessmentExportSchema, { name: 'SeidrAssessment', target: 'jsonSchema7' }), 'Regenerate schema after changing runtime contracts');
  const validate = new Ajv({ strict: false }).compile(schema);
  const exported = buildAssessmentExport(await fixture());
  assert.ok(validate(exported), JSON.stringify(validate.errors));
  assert.equal(exported.sourceManifest[0].text, undefined, 'Routine reports must not embed private full-source text');
  const invalid = structuredClone(exported);
  invalid.assessment.risks[0].current.likelihood = 0;
  assert.equal(validate(invalid), false);
  invalid.assessment.risks[0].current.likelihood = null;
  invalid.assessment.risks[0].evidenceStatus = 'Proven secure';
  assert.equal(validate(invalid), false);
});

test('exports fail explicitly when canonical IDs or retained source manifests are incomplete', async () => {
  const model = await fixture();
  assert.throws(() => buildAssessmentExport({ ...model, evidenceManifest: [] }), /manifest is incomplete/);
  assert.throws(() => buildAssessmentExport({ ...model, threats: [] }), /disagree/);
  assert.throws(() => buildAssessmentExport({ ...model, quality: undefined }), /Legacy/);
});

test('CSV exposes unknown business risk and complete decisions/actions without a legacy zero score', async () => {
  const model = await fixture();
  const csv = buildFindingsCsv(model);
  assert.match(csv, /Current likelihood \/ 5/);
  assert.match(csv, /Conditional target business risk/);
  assert.match(csv, /Not rated/);
  assert.match(csv, /Owner acceptance required|Blocker/);
  assert.ok(csv.includes(model.threats[0].id));
  assert.ok(!csv.includes('Overall risk score'));
});

test('translation cannot rewrite evidence locations, business-risk states, owners or decision history', async () => {
  const model = await fixture();
  const payload = reportTranslationPayload(model);
  payload.name = 'API traducida';
  payload.assessment = { risks: [{ disposition: 'Closed with evidence' }] };
  const translated = mergeReportTranslation(model, payload);
  assert.deepEqual(translated.quality, model.quality);
  assert.deepEqual(translated.evidenceManifest, model.evidenceManifest);
  assert.equal(translated.threats[0].id, model.threats[0].id);
  assert.equal(buildAssessmentExport(translated).assessment.risks[0].disposition, 'Blocker');
});
