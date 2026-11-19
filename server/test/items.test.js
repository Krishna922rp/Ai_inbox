import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { listItems } from '../src/items.js';

function createDatabase() {
  const db = new Database(':memory:');
  db.exec(
    "CREATE TABLE items (" +
    "id INTEGER PRIMARY KEY, type TEXT NOT NULL, title TEXT NOT NULL, " +
    "url TEXT, content TEXT NOT NULL, created_at TEXT NOT NULL)"
  );
  const insert = db.prepare(
    'INSERT INTO items(type, title, url, content, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  insert.run('note', 'Project notes', null, 'A saved note with a unique keyword near the end: starling', '2026-01-01');
  insert.run('url', 'Example article', 'https://example.com', 'Article body text', '2026-01-02');
  return db;
}

test('searches the full source content, not only the preview', () => {
  const db = createDatabase();
  try {
    const result = listItems(db, 'STARLING');
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].title, 'Project notes');
  } finally {
    db.close();
  }
});

test('returns total library counts independently of the search filter', () => {
  const db = createDatabase();
  try {
    const result = listItems(db, 'article');
    assert.deepEqual(result.counts, { total: 2, notes: 1, links: 1 });
    assert.equal(result.items.length, 1);
  } finally {
    db.close();
  }
});

test('returns all items when the search is empty', () => {
  const db = createDatabase();
  try {
    const result = listItems(db);
    assert.equal(result.items.length, 2);
  } finally {
    db.close();
  }
});
