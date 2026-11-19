import { db } from './db.js';
import { splitIntoChunks } from './text.js';
import { createEmbeddings } from './openai.js';
import { fetchPage } from './url-fetch.js';

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168);
  }
  const value = ip.toLowerCase();
  return value === '::' || value === '::1' ||
    value.startsWith('fc') || value.startsWith('fd') ||
    value.startsWith('fe80:') || value.startsWith('::ffff:');
}

async function fetchPage(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw Object.assign(new Error('Enter a valid URL.'), { status: 400 });
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw Object.assign(new Error('Only public HTTP(S) URLs are supported.'), { status: 400 });
  }

  const addresses = await lookup(url.hostname, { all: true }).catch(() => []);
  if (!addresses.length || addresses.some(({ address }) => isPrivateIp(address))) {
    throw Object.assign(new Error('This URL host is not publicly reachable.'), { status: 400 });
  }

  const response = await fetch(url.href, {
    signal: AbortSignal.timeout(12000),
    redirect: 'error',
    headers: { 'User-Agent': 'RecallInbox/1.0' }
  });

  if (!response.ok) {
    throw Object.assign(new Error('Page returned HTTP ' + response.status), { status: 422 });
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
    throw Object.assign(new Error('URL must return readable HTML or text.'), { status: 422 });
  }

  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > 2_000_000) {
    throw Object.assign(new Error('Page exceeds the 2 MB limit.'), { status: 413 });
  }

  const source = await response.text();
  if (Buffer.byteLength(source, 'utf8') > 2_000_000) {
    throw Object.assign(new Error('Page exceeds the 2 MB limit.'), { status: 413 });
  }

  if (contentType.includes('text/plain')) {
    return { title: url.hostname, content: source, url: url.href };
  }

  const $ = load(source);
  const pageTitle = $('title').first().text().trim() || url.hostname;
  $('script, style, noscript, svg, nav, footer, header, form').remove();
  const content = ($('main').text() || $('article').text() || $('body').text())
    .replace(/\s+/g, ' ')
    .trim();

  return { title: pageTitle, content, url: url.href };
}

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
