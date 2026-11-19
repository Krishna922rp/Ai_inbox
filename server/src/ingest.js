import { db } from './db.js';
import { splitIntoChunks } from './text.js';
import { createEmbeddings } from './openai.js';
import { fetchPage } from './url-fetch.js';

export async function ingestSource({ type, title, content, url }, dependencies = {}) {
  const database = dependencies.database || db;
  const pageFetcher = dependencies.fetchPage || fetchPage;
  const embeddingGenerator = dependencies.createEmbeddings || createEmbeddings;
  if (type === 'url') {
    const page = await pageFetcher(url);
    title = title?.trim() || page.title;
    content = page.content;
    url = page.url;
  }

  title = title?.trim();
  content = content?.trim();
  if (!title || !content) {
    throw Object.assign(new Error('A title and readable content are required.'), { status: 400 });
  }

  const chunks = splitIntoChunks(content);
  if (!chunks.length) {
    throw Object.assign(new Error('No readable text was found in this source.'), { status: 422 });
  }

  // Generate vectors before writing the item so an AI/API failure cannot leave
  // an orphaned source with no chunks. The database writes remain atomic.
  const vectors = dependencies.createEmbeddings
    ? await embeddingGenerator(chunks)
    : process.env.OPENAI_API_KEY
      ? await embeddingGenerator(chunks)
      : chunks.map(() => null);

  if (vectors.length !== chunks.length) {
    throw new Error('Embedding response count did not match the source chunks.');
  }

  const insertItem = database.prepare(
    'INSERT INTO items(type, title, url, content) VALUES (?, ?, ?, ?)'
  );
  const insertChunk = database.prepare(
    'INSERT INTO chunks(item_id, chunk_index, content, embedding) VALUES (?, ?, ?, ?)'
  );

  const itemId = database.transaction(() => {
    const result = insertItem.run(type, title, type === 'url' ? url : null, content);
    const id = Number(result.lastInsertRowid);
    chunks.forEach((chunk, index) => {
      insertChunk.run(id, index, chunk, vectors[index] ? JSON.stringify(vectors[index]) : null);
    });
    return id;
  })();

  const saved = database.prepare('SELECT created_at FROM items WHERE id = ?').get(itemId);

  return {
    id: itemId,
    type,
    title,
    url: type === 'url' ? url : null,
    created_at: saved.created_at,
    chunks: chunks.length
  };
}
