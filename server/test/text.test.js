import test from 'node:test'; import assert from 'node:assert/strict'; import {splitIntoChunks,cosineSimilarity} from '../src/text.js';
test('splits long text into overlapping chunks',()=>{const text='word '.repeat(500);const chunks=splitIntoChunks(text,300,40);assert.ok(chunks.length>1);assert.ok(chunks.every(x=>x.length<=300));});
test('returns no chunks for empty input',()=>assert.deepEqual(splitIntoChunks('  '),[]));
test('calculates cosine similarity',()=>assert.equal(cosineSimilarity([1,0],[1,0]),1));
test('rejects mismatched vector dimensions safely',()=>assert.equal(cosineSimilarity([1],[1,2]),0));