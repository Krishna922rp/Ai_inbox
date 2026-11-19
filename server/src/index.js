import './config.js';
import express from 'express';
import cors from 'cors';
import { db } from './db.js';
import { ingestSource } from './ingest.js';
import { createEmbeddings, generateAnswer } from './openai.js';
import { cosineSimilarity } from './text.js';
import { listItems } from './items.js';

const app = express();
app.disable('x-powered-by');

const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(JSON.stringify({
      level: 'info',
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: Date.now() - start
    }));
  });
  next();
});

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.get('/api/items', (req, res, next) => {
  try {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (query.length > 200) {
      return res.status(400).json({ error: 'Search must be 200 characters or fewer.' });
    }
    res.json(listItems(db, query));
  } catch (error) {
    next(error);
  }
});

app.post('/api/ingest', async (req, res, next) => {
  try {
    const { type, title, content, url } = req.body || {};
    if (!['note', 'url'].includes(type)) {
      return res.status(400).json({ error: 'type must be note or url' });
    }
    if (type === 'note' && (
      typeof title !== 'string' || typeof content !== 'string' ||
      !title.trim() || !content.trim()
    )) {
      return res.status(400).json({ error: 'Notes require a title and content.' });
    }
    if (type === 'url' && (typeof url !== 'string' || !url.trim())) {
      return res.status(400).json({ error: 'A URL is required.' });
    }
    if (title !== undefined && title !== null &&
      (typeof title !== 'string' || title.length > 160)) {
      return res.status(400).json({ error: 'Title must be 160 characters or fewer.' });
    }

    const item = await ingestSource({ type, title, content, url });
    res.status(201).json({ item });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/items/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: 'Invalid item id.' });
  }

  const result = db.prepare('DELETE FROM items WHERE id = ?').run(id);
  if (!result.changes) return res.status(404).json({ error: 'Source not found.' });
  res.status(204).end();
});

app.post('/api/query', async (req, res, next) => {
  try {
    const question = typeof req.body?.question === 'string'
      ? req.body.question.trim()
      : '';
    if (!question) return res.status(400).json({ error: 'Enter a question.' });
    if (question.length > 2000) {
      return res.status(400).json({ error: 'Question must be 2,000 characters or fewer.' });
    }

    const rows = db.prepare(
      'SELECT c.id AS chunk_id, c.content, c.embedding, i.id AS item_id, i.title, i.url ' +
      'FROM chunks c JOIN items i ON i.id = c.item_id WHERE c.embedding IS NOT NULL'
    ).all();

    if (!rows.length) {
      return res.json({
        answer: 'Your library has no indexed sources yet. Add a note or web page first.',
        sources: []
      });
    }

    const [questionVector] = await createEmbeddings([question]);
    const ranked = rows
      .map((row) => ({
        ...row,
        score: cosineSimilarity(questionVector, JSON.parse(row.embedding))
      }))
      .sort((a, b) => b.score - a.score)
      .filter((row) => row.score > 0.12)
      .slice(0, 4);

    if (!ranked.length) {
      return res.json({
        answer: 'I could not find relevant information in your saved knowledge.',
        sources: []
      });
    }

    const answer = await generateAnswer(question, ranked);
    const sources = ranked.map(({ content: excerpt, ...source }) => ({
      ...source,
      snippet: excerpt.slice(0, 240),
      score: Number(source.score.toFixed(3))
    }));
    res.json({ answer, sources });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  const status = error.status || 500;
  console.error(JSON.stringify({
    level: 'error',
    message: error.message,
    status
  }));
  res.status(status).json({
    error: status >= 500 && status !== 503
      ? 'Something went wrong while processing your request.'
      : error.message
  });
});

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => console.log('Recall API listening on ' + port));
