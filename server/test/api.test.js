import test from 'node:test';
import assert from 'node:assert/strict';
import { splitIntoChunks, cosineSimilarity } from '../src/text.js';

test('chunk boundaries preserve all source text', () => {
  const input = 'alpha '.repeat(600);
  const chunks = splitIntoChunks(input, 500, 60);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every(chunk => chunk.length <= 500));
  assert.ok(chunks.join(' ').includes('alpha'));
});

test('cosine similarity ranks identical vectors above orthogonal vectors', () => {
  assert.ok(cosineSimilarity([1, 0, 0], [1, 0, 0]) > cosineSimilarity([1, 0, 0], [0, 1, 0]));
});

test('cosine similarity handles zero vectors', () => {
  assert.equal(cosineSimilarity([0, 0], [1, 0]), 0);
});
