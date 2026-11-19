import './config.js';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { projectRoot } from './config.js';

const configuredPath = process.env.DATABASE_PATH || './data/recall.db';
const databaseFile = path.isAbsolute(configuredPath)
  ? configuredPath
  : path.resolve(projectRoot, configuredPath);

fs.mkdirSync(path.dirname(databaseFile), { recursive: true });

export function initializeSchema(database) {
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');

  database.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK (type IN ('note', 'url')),
      title TEXT NOT NULL CHECK (length(trim(title)) > 0),
      url TEXT,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
      content TEXT NOT NULL,
      embedding TEXT,
      UNIQUE (item_id, chunk_index)
    );

    CREATE INDEX IF NOT EXISTS idx_items_created_at
      ON items(created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_chunks_with_embeddings
      ON chunks(id) WHERE embedding IS NOT NULL;
  `);

  return database;
}

export const db = initializeSchema(new Database(databaseFile));
