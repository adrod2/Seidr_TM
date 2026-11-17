import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getRedoInputs, restoreInputFile, snapshotModelInputs, storeInputFile } from './modelInputs.ts';
import { assembleContext } from './analysisContext.ts';

const model = {
  id: 'TM-original', name: 'Warehouse', description: 'Derived agent context, NOT the original form',
  framework: 'Hybrid TM', date: '2026-11-17', riskScore: 50, status: 'Completed', srg: {}, threats: [], complianceGaps: [],
};
const payload = {
  name: 'Warehouse', description: 'Original description.', userDescription: '  Original description.\n',
  frameworks: ['Hybrid TM'], repositoryUrls: ['https://github.com/org/api', 'https://github.com/org/ui'],
  sourceUrl: 'https://docs.example.test',
  documents: [{ name: 'policy.pdf', method: 'pdf', status: 'ok', text: 'Complete document before digest.', size: 100 }],
  diagrams: [{ name: 'network.png', description: 'Original vision analysis, not a C4 rendering.' }],
  webIntelligence: { summary: 'Old website briefing' },
};

test('redo restores the original inputs, not the derived report; edits cannot mutate the source snapshot', () => {
  const saved = snapshotModelInputs(model.id, payload);
  const original = JSON.stringify(saved);
  const { payload: draft, warnings } = getRedoInputs(model, saved);
  assert.equal(draft.userDescription, '  Original description.\n');
  assert.equal(draft.documents[0].text, 'Complete document before digest.');
  assert.equal(draft.diagrams[0].description, payload.diagrams[0].description);
  assert.deepEqual(draft.repositoryUrls, payload.repositoryUrls);
  assert.equal(draft.frameworks[0], 'Hybrid TM');
  assert.equal(draft.sourceUrl, payload.sourceUrl);
  assert.equal(draft.webIntelligence, undefined, 'A redo must fetch current external context');
  draft.frameworks[0] = 'STRIDE';
  draft.documents[0].text = 'Changed policy';
  draft.repositoryUrls.pop();
  assert.equal(JSON.stringify(saved), original);
  assert.equal(model.description, 'Derived agent context, NOT the original form');
  assert.ok(warnings.some(warning => warning.includes('original files were not saved')));
});

test('original document and image bytes and file metadata survive structured storage and restoration', async () => {
  const document = new File([new Uint8Array([37, 80, 68, 70, 0, 255])], 'policy.pdf', { type: 'application/pdf', lastModified: 1000 });
  const diagram = new File([new Uint8Array([137, 80, 78, 71, 0, 254])], 'network.png', { type: 'image/png', lastModified: 2000 });
  const saved = snapshotModelInputs(model.id, {
    ...payload, inputFiles: { documents: [storeInputFile(document)], diagrams: [storeInputFile(diagram)] },
  });
  const { payload: draft, warnings } = getRedoInputs(model, saved);
  assert.deepEqual(warnings, []);
  for (const [source, stored] of [[document, draft.inputFiles.documents[0]], [diagram, draft.inputFiles.diagrams[0]]]) {
    const { file, originalUnavailable } = restoreInputFile(stored, source.name);
    assert.equal(originalUnavailable, false);
    assert.equal(file.name, source.name);
    assert.equal(file.type, source.type);
    assert.equal(file.lastModified, source.lastModified);
    assert.deepEqual(new Uint8Array(await file.arrayBuffer()), new Uint8Array(await source.arrayBuffer()));
  }
});

test('blank original descriptions stay blank instead of being replaced by fallback or analysed context', () => {
  const saved = snapshotModelInputs(model.id, { ...payload, userDescription: '', usedDefaultDescription: true });
  assert.equal(getRedoInputs(model, saved).payload.userDescription, '');
});

test('legacy reports recover available input sections and explicitly warn that originals are unavailable', () => {
  const repositoryUrls = ['https://github.com/org/api', 'https://github.com/org/ui'];
  const description = assembleContext([
    { kind: 'description', name: 'System description', text: `Original system text.\nRepositories:\n${repositoryUrls.join('\n')}` },
    { kind: 'diagram', name: 'Diagram: network.png', text: 'Vision facts.' },
    { kind: 'document', name: 'Document: policy.pdf', detail: 'PDF, 3 pages, security digest', text: 'Recovered security digest.' },
    { kind: 'repository', name: 'Repository: org/api', text: 'Must not become the user description.' },
  ]).text;
  const legacy = {
    ...model, description, assessmentMeta: {
      repositoryUrls, sourceUrl: payload.sourceUrl, localDocuments: ['policy.pdf', 'missing.docx'],
      diagramsCount: 2, inputs: [{ kind: 'diagram', name: 'network.png' }, { kind: 'diagram', name: 'failed.png' }],
    },
  };
  const { payload: draft, warnings } = getRedoInputs(legacy);
  assert.equal(draft.userDescription, 'Original system text.');
  assert.deepEqual(draft.repositoryUrls, repositoryUrls);
  assert.equal(draft.documents[0].text, 'Recovered security digest.');
  assert.equal(draft.documents[0].status, 'partial');
  assert.equal(draft.documents[1].status, 'failed');
  assert.equal(draft.diagrams[0].description, 'Vision facts.');
  assert.equal(draft.diagrams[1].description, undefined);
  assert.ok(warnings[0].includes('possibly shortened or redacted'));
  assert.ok(warnings[0].includes('reattach original files'));
});

test('very old single-repository reports remain usable and missing files are never represented as recovered originals', () => {
  const { payload: draft } = getRedoInputs({ ...model, description: 'Old system description', assessmentMeta: { repositoryUrl: 'https://github.com/org/api' } });
  assert.equal(draft.userDescription, 'Old system description');
  assert.deepEqual(draft.repositoryUrls, ['https://github.com/org/api']);
  const recovered = restoreInputFile(null, 'missing.png');
  assert.equal(recovered.originalUnavailable, true);
  assert.equal(recovered.file.size, 0);
});

test('mismatched or unsupported snapshots fail clearly instead of loading another model or silently dropping inputs', () => {
  assert.throws(() => getRedoInputs(model, snapshotModelInputs('TM-other', payload)), /do not match/);
  assert.throws(() => getRedoInputs(model, { ...snapshotModelInputs(model.id, payload), version: 99 }), /do not match/);
});
