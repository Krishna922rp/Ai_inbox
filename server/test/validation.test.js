import test from 'node:test';
import assert from 'node:assert/strict';
import { validateIngestPayload } from '../src/validation.js';

test('accepts and trims a valid text note', () => {
  assert.deepEqual(
    validateIngestPayload({ type: 'note', title: '  Notes  ', content: '  Saved text  ' }),
    { value: { type: 'note', title: 'Notes', content: 'Saved text' } }
  );
});

test('rejects missing, empty and unsupported payloads', () => {
  assert.equal(validateIngestPayload(null).status, 400);
  assert.equal(validateIngestPayload({ type: 'file' }).status, 400);
  assert.equal(validateIngestPayload({ type: 'note', title: 'Title', content: '  ' }).status, 400);
  assert.equal(validateIngestPayload({ type: 'url', url: '  ' }).status, 400);
});

test('enforces title, note and URL length limits', () => {
  assert.equal(validateIngestPayload({
    type: 'note',
    title: 'x'.repeat(161),
    content: 'text'
  }).status, 400);

  assert.equal(validateIngestPayload({
    type: 'note',
    title: 'Title',
    content: 'x'.repeat(100_001)
  }).status, 413);

  assert.equal(validateIngestPayload({
    type: 'url',
    url: 'https://example.com/' + 'x'.repeat(2048)
  }).status, 400);
});

test('allows an optional URL title but requires a URL', () => {
  assert.deepEqual(
    validateIngestPayload({ type: 'url', url: ' https://example.com ' }),
    { value: { type: 'url', title: undefined, url: 'https://example.com' } }
  );
});
