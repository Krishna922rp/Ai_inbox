import test from 'node:test';
import assert from 'node:assert/strict';
import { formatGroundingPrompt } from '../src/openai.js';

test('formats the question and numbered source excerpts with real line breaks', () => {
  const prompt = formatGroundingPrompt('What is the retention period?', [
    { title: 'Policy notes', content: 'Keep records for seven years.' },
    { title: 'Operations guide', content: 'Archive after closure.' }
  ]);

  assert.equal(
    prompt,
    'Question: What is the retention period?\n\n' +
      '[1] Policy notes\nKeep records for seven years.\n\n' +
      '[2] Operations guide\nArchive after closure.'
  );
});
