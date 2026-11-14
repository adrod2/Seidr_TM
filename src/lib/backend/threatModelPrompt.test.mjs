import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildThreatModelPrompt } from './threatModelPrompt.ts';

const method = readFileSync(new URL('./hybrid-method.md', import.meta.url), 'utf8');

test('Hybrid uses the complete bundled protocol while preserving context and JSON output', () => {
  const prompt = buildThreatModelPrompt('Hybrid TM', method);
  assert.ok(prompt.includes(method));
  assert.match(prompt, /review EVERY section and every source/);
  assert.match(prompt, /ONLY a valid JSON array/);
  assert.match(prompt, /"componentId"/);
  assert.match(prompt, /"cvssScore"/);
});

test('Hybrid grounds the example stack and keeps DREAD separate from CVSS', () => {
  const prompt = buildThreatModelPrompt('Hybrid TM', method);
  const rules = prompt.slice(prompt.indexOf('Application rules'));
  assert.match(rules, /examples, not required technologies/);
  assert.match(rules, /Never invent their presence, versions/);
  assert.match(rules, /missing information as an uncertainty/);
  assert.match(rules, /STRIDE: Spoofing/);
  assert.match(rules, /LINDDUN: Linkability/);
  assert.match(rules, /arithmetic mean/);
  assert.match(rules, /do not substitute the DREAD mean for CVSS/);
});

test('existing frameworks do not run the Hybrid method', () => {
  for (const framework of ['STRIDE', 'PASTA', 'MAESTRO']) {
    const prompt = buildThreatModelPrompt(framework, method);
    assert.ok(prompt.includes(`using the ${framework} framework`));
    assert.ok(!prompt.includes(method));
    assert.doesNotMatch(prompt, /HYBRID THREAT MODELING METHODOLOGY|DREAD|LINDDUN:/);
    assert.match(prompt, /review EVERY section and every source/);
  }
});

test('editing the method changes only the Hybrid prompt used in the cache key', () => {
  const revised = `${method}\nAdditional protocol guidance.`;
  assert.notEqual(buildThreatModelPrompt('Hybrid TM', method), buildThreatModelPrompt('Hybrid TM', revised));
  assert.equal(buildThreatModelPrompt('STRIDE', method), buildThreatModelPrompt('STRIDE', revised));
});
