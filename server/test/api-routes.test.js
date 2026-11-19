import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import Database from 'better-sqlite3';
import { initializeSchema } from '../src/db.js';
import { createApp } from '../src/app.js';

function createDatabase() {
  return initializeSchema(new Database(':memory:'));
}

async function withServer(app, callback) {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  try {
    return await callback('http://127.0.0.1:' + address.port);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

function insertItem(database, { type = 'note', title, url = null, content, chunks = [] }) {
  const result = database.prepare(
    'INSERT INTO items(type, title, url, content) VALUES (?, ?, ?, ?)'
  ).run(type, title, url, content);
  const itemId = Number(result.lastInsertRowid);
  const insertChunk = database.prepare(
    'INSERT INTO chunks(item_id, chunk_index, content, embedding) VALUES (?, ?, ?, ?)'
  );
  chunks.forEach((chunk, index) => {
    insertChunk.run(itemId, index, chunk.content, JSON.stringify(chunk.embedding));
  });
  return itemId;
}

function appFor(database, overrides = {}) {
  return createApp({
    database,
    ingestSource: async (payload) => ({ id: 99, ...payload, created_at: '2026-01-01 00:00:00', chunks: 1 }),
    createEmbeddings: async () => [[1, 0]],
    generateAnswer: async () => 'A grounded answer [1].',
    ...overrides
  });
}

test('GET /api/items returns source previews and complete library counts', async () => {
  const database = createDatabase();
  try {
    insertItem(database, {
      title: 'Policy notes',
      content: 'A short preview followed by a distinctive word: starling'
    });
    insertItem(database, {
      type: 'url',
      title: 'Operations page',
      url: 'https://example.com/operations',
      content: 'Fetched page content'
    });

    await withServer(appFor(database), async (baseUrl) => {
      const response = await fetch(baseUrl + '/api/items');
      const data = await response.json();

      assert.equal(response.status, 200);
      assert.equal(data.items.length, 2);
      assert.deepEqual(data.counts, { total: 2, notes: 1, links: 1 });
      assert.equal(data.items[0].title, 'Operations page');
      assert.equal(data.items[0].content_preview, 'Fetched page content');
    });
  } finally {
    database.close();
  }
});

test('GET /api/items?q searches full saved content and preserves unfiltered counts', async () => {
  const database = createDatabase();
  try {
    insertItem(database, {
      title: 'Policy notes',
      content: 'A short preview followed by a distinctive word: starling'
    });
    insertItem(database, {
      type: 'url',
      title: 'Operations page',
      url: 'https://example.com/operations',
      content: 'Fetched page content'
    });

    await withServer(appFor(database), async (baseUrl) => {
      const response = await fetch(baseUrl + '/api/items?q=STARLING');
      const data = await response.json();

      assert.equal(response.status, 200);
      assert.equal(data.items.length, 1);
      assert.equal(data.items[0].title, 'Policy notes');
      assert.deepEqual(data.counts, { total: 2, notes: 1, links: 1 });
    });
  } finally {
    database.close();
  }
});

test('POST /api/query ranks persisted vectors and returns numbered source snippets without embeddings', async () => {
  const database = createDatabase();
  try {
    const relevantText = 'The renewal policy includes general liability coverage up to two million dollars.';
    insertItem(database, {
      type: 'url',
      title: 'Renewal policy',
      url: 'https://example.com/policy',
      content: relevantText,
      chunks: [
        { content: relevantText, embedding: [1, 0] },
        { content: 'The office coffee machine is serviced every Friday.', embedding: [0, 1] }
      ]
    });

    let generatedWith;
    const app = appFor(database, {
      createEmbeddings: async (texts) => {
        assert.deepEqual(texts, ['What is the general liability limit?']);
        return [[1, 0]];
      },
      generateAnswer: async (question, sources) => {
        assert.equal(question, 'What is the general liability limit?');
        generatedWith = sources;
        return 'The limit is two million dollars [1].';
      }
    });

    await withServer(app, async (baseUrl) => {
      const response = await fetch(baseUrl + '/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: 'What is the general liability limit?' })
      });
      const data = await response.json();

      assert.equal(response.status, 200);
      assert.equal(data.answer, 'The limit is two million dollars [1].');
      assert.equal(data.sources.length, 1);
      assert.equal(data.sources[0].title, 'Renewal policy');
      assert.equal(data.sources[0].url, 'https://example.com/policy');
      assert.equal(data.sources[0].snippet, relevantText);
      assert.equal(data.sources[0].score, 1);
      assert.equal('embedding' in data.sources[0], false);
      assert.equal(generatedWith.length, 1);
      assert.equal(generatedWith[0].content, relevantText);
    });
  } finally {
    database.close();
  }
});

test('POST /api/query returns an empty-source answer without calling the LLM when nothing is relevant', async () => {
  const database = createDatabase();
  try {
    insertItem(database, {
      title: 'Unrelated note',
      content: 'Coffee machine maintenance.',
      chunks: [{ content: 'Coffee machine maintenance.', embedding: [0, 1] }]
    });
    let answerCalls = 0;
    const app = appFor(database, {
      createEmbeddings: async () => [[1, 0]],
      generateAnswer: async () => {
        answerCalls += 1;
        return 'Should not be called.';
      }
    });

    await withServer(app, async (baseUrl) => {
      const response = await fetch(baseUrl + '/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: 'Tell me about insurance.' })
      });
      const data = await response.json();

      assert.equal(response.status, 200);
      assert.deepEqual(data.sources, []);
      assert.match(data.answer, /could not find relevant information/i);
      assert.equal(answerCalls, 0);
    });
  } finally {
    database.close();
  }
});

test('POST /api/query validates questions and reports missing AI configuration safely', async () => {
  const database = createDatabase();
  try {
    insertItem(database, {
      title: 'Indexed note',
      content: 'A useful indexed note.',
      chunks: [{ content: 'A useful indexed note.', embedding: [1, 0] }]
    });
    const app = appFor(database, {
      createEmbeddings: async () => {
        throw Object.assign(new Error('AI is not configured. Set OPENAI_API_KEY on the server.'), {
          status: 503
        });
      }
    });

    await withServer(app, async (baseUrl) => {
      const emptyResponse = await fetch(baseUrl + '/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: '   ' })
      });
      assert.equal(emptyResponse.status, 400);
      assert.deepEqual(await emptyResponse.json(), { error: 'Enter a question.' });

      const missingKeyResponse = await fetch(baseUrl + '/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: 'What did I save?' })
      });
      assert.equal(missingKeyResponse.status, 503);
      assert.deepEqual(await missingKeyResponse.json(), {
        error: 'AI is not configured. Set OPENAI_API_KEY on the server.'
      });
    });
  } finally {
    database.close();
  }
});

test('POST /api/ingest validates the payload before calling the ingestion service', async () => {
  const database = createDatabase();
  try {
    let ingestCalls = 0;
    const app = appFor(database, {
      ingestSource: async (payload) => {
        ingestCalls += 1;
        assert.deepEqual(payload, {
          type: 'note',
          title: 'A note',
          content: 'Saved content'
        });
        return { id: 7, type: 'note', title: 'A note', chunks: 1 };
      }
    });

    await withServer(app, async (baseUrl) => {
      const invalidResponse = await fetch(baseUrl + '/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'note', title: 'Missing content' })
      });
      assert.equal(invalidResponse.status, 400);
      assert.equal(ingestCalls, 0);

      const validResponse = await fetch(baseUrl + '/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'note', title: ' A note ', content: ' Saved content ' })
      });
      const data = await validResponse.json();

      assert.equal(validResponse.status, 201);
      assert.equal(data.item.id, 7);
      assert.equal(ingestCalls, 1);
    });
  } finally {
    database.close();
  }
});
