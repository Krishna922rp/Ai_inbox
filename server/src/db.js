import Database from 'better-sqlite3'; import fs from 'node:fs'; import path from 'node:path';
const file=process.env.DATABASE_PATH||'./data/recall.db'; fs.mkdirSync(path.dirname(path.resolve(file)),{recursive:true});
export const db=new Database(file); db.pragma('journal_mode = WAL'); db.pragma('foreign_keys = ON');
db.exec(`CREATE TABLE IF NOT EXISTS items(id INTEGER PRIMARY KEY AUTOINCREMENT,type TEXT NOT NULL CHECK(type IN ('note','url')),title TEXT NOT NULL,url TEXT,content TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS chunks(id INTEGER PRIMARY KEY AUTOINCREMENT,item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,chunk_index INTEGER NOT NULL,content TEXT NOT NULL,embedding TEXT,UNIQUE(item_id,chunk_index));`);