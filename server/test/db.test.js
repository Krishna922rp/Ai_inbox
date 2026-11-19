import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initializeSchema } from '../src/db.js';

test('creates durable source and chunk tables with foreign-key enforcement', () => {
  const db = initializeSchema(new Database(':memory:'));
  try {
    assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('items', 'chunks')"
    ).all().map((row) => row.name).sort();
    assert.deepEqual(tables, ['chunks', 'items']);
  } finally {
    db.close();
  }
});

test('deleting a source cascades to its persisted chunks', () => {
  const db = initializeSchema(new Database(':memory:'));
  try {
    const item = db.prepare(
      "INSERT INTO items(type, title, content) VALUES ('note', 'Test note', 'Original content')"
    ).run();
    db.prepare(
      'INSERT INTO chunks(item_id, chunk_index, content, embedding) VALUES (?, 0, ?, ?)'
    ).run(item.lastInsertRowid, 'Original content', '[0.1,0.2]');

    db.prepare('DELETE FROM items WHERE id = ?').run(item.lastInsertRowid);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM chunks').get().count, 0);
  } finally {
    db.close();
  }
});

test('enforces valid source types, non-empty titles and non-negative chunk indexes', () => {
  const db = initializeSchema(new Database(':memory:'));
  try {
    assert.throws(() => db.prepare(
      "INSERT INTO items(type, title, content) VALUES ('image', 'Bad type', 'x')"
    ).run());
    assert.throws(() => db.prepare(
      "INSERT INTO items(type, title, content) VALUES ('note', '   ', 'x')"
    ).run());

    const item = db.prepare(
      "INSERT INTO items(type, title, content) VALUES ('note', 'Valid', 'x')"
    ).run();
    assert.throws(() => db.prepare(
      'INSERT INTO chunks(item_id, chunk_index, content) VALUES (?, -1, ?)'
    ).run(item.lastInsertRowid, 'bad'));
  } finally {
    db.close();
  }
});
