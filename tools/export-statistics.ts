import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(process.argv[2] || 'last-deal.sqlite', { readOnly: true });
try {
  const query = db.prepare('SELECT version, data FROM matches ORDER BY rowid');
  for (const row of query.iterate()) {
    const record = JSON.parse(String(row.data));
    process.stdout.write(JSON.stringify({ version: row.version, ...record }) + '\n');
  }
} finally {
  db.close();
}
