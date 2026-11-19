import express from 'express';
import cors from 'cors';
import { createEmbeddings as defaultCreateEmbeddings, generateAnswer as defaultGenerateAnswer } from './openai.js';
import { cosineSimilarity } from './text.js';
import { listItems } from './items.js';
import { validateIngestPayload } from './validation.js';

export function createApp({
  database,
  ingestSource,
  createEmbeddings = defaultCreateEmbeddings,
  generateAnswer = defaultGenerateAnswer
} = {}) {
  if (!database || typeof database.prepare !== 'function') {
    throw new TypeError('createApp requires a SQLite database.');
  }
  if (typeof ingestSource !== 'function') {
    throw new TypeError('createApp requires an ingestion function.');
  }

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
      const rawQuery = req.query.q ?? '';
      if (typeof rawQuery !== 'string') {
        return res.status(400).json({ error: 'Search must be a single text value.' });
      }
      const query = rawQuery.trim();
      if (query.length > 200) {
        return res.status(400).json({ error: 'Search must be 200 characters or fewer.' });
      }
      res.json(listItems(database, query));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/ingest', async (req, res, next) => {
    try {
      const validation = validateIngestPayload(req.body);
      if (validation.error) {
        return res.status(validation.status).json({ error: validation.error });
      }

      const item = await ingestSource(validation.value);
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

    const result = database.prepare('DELETE FROM items WHERE id = ?').run(id);
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

      const rows = database.prepare(
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
      if (!Array.isArray(questionVector) || questionVector.length === 0) {
        throw Object.assign(new Error('The embedding service returned an invalid vector.'), {
          status: 503
        });
      }

      const ranked = rows.flatMap((row) => {
        try {
          const storedVector = JSON.parse(row.embedding);
          if (!Array.isArray(storedVector)) return [];
          const score = cosineSimilarity(questionVector, storedVector);
          return Number.isFinite(score) && score > 0.12
            ? [{ ...row, score }]
            : [];
        } catch {
          return [];
        }
      })
        .sort((a, b) => b.score - a.score)
        .slice(0, 4);

      if (!ranked.length) {
        return res.json({
          answer: 'I could not find relevant information in your saved knowledge.',
          sources: []
        });
      }

      const answer = await generateAnswer(question, ranked);
      const sources = ranked.map((source) => ({
        chunk_id: source.chunk_id,
        item_id: source.item_id,
        title: source.title,
        url: source.url,
        snippet: source.content.slice(0, 240),
        score: Number(source.score.toFixed(3))
      }));

      res.json({ answer, sources });
    } catch (error) {
      next(error);
    }
  });

  app.use((error, _req, res, _next) => {
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status <= 599
      ? error.status
      : 500;

    console.error(JSON.stringify({
      level: 'error',
      name: error.name || 'Error',
      status
    }));

    res.status(status).json({
      error: status >= 500 && status !== 503
        ? 'Something went wrong while processing your request.'
        : error.message
    });
  });

  return app;
}
