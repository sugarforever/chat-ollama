import type { DatabaseSync } from 'node:sqlite';
export function migrate(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY, config TEXT NOT NULL,
    created_at TEXT NOT NULL, ready INTEGER NOT NULL DEFAULT 0
  )`);
}
