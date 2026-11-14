import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractDocument } from './documentExtractor.ts';
import { getErrorMessage, hashImageInput, looksBinaryDocument, readAsDataUrl } from './inputUtils.ts';

test('images sharing prefixes, suffixes and lengths still have distinct cache hashes', async () => {
  const prefix = 'data:image/png;base64,' + 'a'.repeat(2500);
  const suffix = 'z'.repeat(2500);
  const first = `${prefix}ONE${suffix}`;
  const second = `${prefix}TWO${suffix}`;
  assert.equal(first.length, second.length);
  assert.notEqual(await hashImageInput(first), await hashImageInput(second));
  assert.notEqual(await hashImageInput(first, 'Page 1'), await hashImageInput(first, 'Page 2'));
  assert.equal(await hashImageInput(first, 'Page 1'), await hashImageInput(first, 'Page 1'));
});

test('unreadable document detection is shared across PDF and legacy ZIP uploads', () => {
  assert.equal(looksBinaryDocument('%PDF-1.7\nbinary data'), true);
  assert.equal(looksBinaryDocument('  PK\x03\x04binary data'), true);
  assert.equal(looksBinaryDocument('stored fragment\nendobj\nFlateDecode'), true);
  assert.equal(looksBinaryDocument('The server retains warehouse footage for 90 days.'), false);
  assert.equal(looksBinaryDocument(), false);
});

test('text extraction preserves content and reports partial and unsupported inputs', async () => {
  const text = await extractDocument(new File(['Heading\r\nRobot\u0000control'], 'scope.md'));
  assert.equal(text.status, 'ok');
  assert.equal(text.text, 'Heading\nRobot control');
  const partial = await extractDocument(new File(['warehouse operations'], 'scope.txt'), { maxChars: 9 });
  assert.equal(partial.status, 'partial');
  assert.equal(partial.text, 'warehouse');
  assert.match(partial.note, /Truncated/);
  const empty = await extractDocument(new File([' \n '], 'blank.txt'));
  assert.equal(empty.status, 'empty');
  const unsupported = await extractDocument(new File(['binary'], 'archive.zip'));
  assert.equal(unsupported.status, 'failed');
  assert.match(unsupported.note, /Unsupported file type/);
});

test('file reading surfaces failures and cancellation instead of leaving uploads pending', async t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'FileReader');
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'FileReader', original);
    else delete globalThis.FileReader;
  });
  let event = 'load';
  let result = 'data:text/plain;base64,cm9ib3Q=';
  globalThis.FileReader = class {
    result = result;
    error = new Error('disk read failed');
    readAsDataURL() { queueMicrotask(() => this[`on${event}`]()); }
  };
  assert.equal(await readAsDataUrl(new Blob(['robot'])), result);
  event = 'error';
  await assert.rejects(readAsDataUrl(new Blob()), /disk read failed/);
  event = 'abort';
  await assert.rejects(readAsDataUrl(new Blob()), /cancelled/);
  event = 'load';
  result = null;
  await assert.rejects(readAsDataUrl(new Blob()), /did not return a data URL/);
});

test('thrown non-Error values remain visible in ingestion errors', () => {
  assert.equal(getErrorMessage(new Error('read failed')), 'read failed');
  assert.equal(getErrorMessage('provider unavailable'), 'provider unavailable');
  assert.equal(getErrorMessage(null), 'Unknown error');
});
