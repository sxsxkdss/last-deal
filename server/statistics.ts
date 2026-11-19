import { DatabaseSync } from 'node:sqlite';
import type { CompletedMatch } from './game-server.ts';

export function openStatistics(path: string) {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY,
      version INTEGER NOT NULL,
      data TEXT NOT NULL
    );
  `);
  const insert = db.prepare('INSERT INTO matches (id, version, data) VALUES (?, ?, ?)');
  return {
    record: (match: CompletedMatch) => insert.run(match.id, 1, JSON.stringify(match)),
    close: () => db.close(),
  };
}
