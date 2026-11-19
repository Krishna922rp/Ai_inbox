import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initializeSchema } from '../src/db.js';
import { ingestSource } from '../src/ingest.js';

function createDatabase() {
  return initializeSchema(new Database(':memory:'));
}

test('persists note metadata, original content, chunks and embeddings atomically', async () => {
  const database = createDatabase();
  try {
    const original = 'A saved knowledge note. '.repeat(100);
    const result = await ingestSource(
      { type: 'note', title: '  Project notes  ', content: original },
      { database, createEmbeddings: async (chunks) => chunks.map(() => [0.25, 0.75]) }
    );

    const item = database.prepare('SELECT * FROM items WHERE id = ?').get(result.id);
    const chunks = database.prepare(
      'SELECT * FROM chunks WHERE item_id = ? ORDER BY chunk_index'
    ).all(result.id);

    assert.equal(item.type, 'note');
    assert.equal(item.title, 'Project notes');
    assert.equal(item.url, null);
    assert.equal(item.content, original.trim());
    assert.ok(chunks.length > 1);
    assert.deepEqual(JSON.parse(chunks[0].embedding), [0.25, 0.75]);
    assert.equal(result.chunks, chunks.length);
    assert.equal(result.created_at, item.created_at);
  } finally {
    database.close();
  }
});

test('fetches a URL on the server and stores the canonical source metadata', async () => {
  const database = createDatabase();
  try {
    const result = await ingestSource(
      { type: 'url', url: 'https://example.com/article' },
      {
        database,
        fetchPage: async () => ({
          title: 'Fetched title',
          content: 'Fetched page content for retrieval.',
          url: 'https://example.com/article'
        }),
        createEmbeddings: async (chunks) => chunks.map(() => [1, 0])
      }
    );

    const item = database.prepare('SELECT * FROM items WHERE id = ?').get(result.id);
    assert.equal(item.type, 'url');
    assert.equal(item.title, 'Fetched title');
    assert.equal(item.url, 'https://example.com/article');
    assert.equal(item.content, 'Fetched page content for retrieval.');
  } finally {
    database.close();
  }
});

test('does not leave a source row when embedding generation fails', async () => {
  const database = createDatabase();
  try {
    await assert.rejects(
      ingestSource(
        { type: 'note', title: 'Atomic note', content: 'Do not save partial state.' },
        {
          database,
          createEmbeddings: async () => {
            throw new Error('simulated embedding outage');
          }
        }
      ),
      /simulated embedding outage/
    );

    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM items').get().count, 0);
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM chunks').get().count, 0);
  } finally {
    database.close();
  }
});
