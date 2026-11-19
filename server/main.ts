import { createGameServer } from './game-server.ts';
import { openStatistics } from './statistics.ts';

const port = Number(process.env.LAST_DEAL_PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid LAST_DEAL_PORT');
const stats = openStatistics(process.env.LAST_DEAL_DB || 'last-deal.sqlite');
const app = createGameServer({
  drainFile: process.env.LAST_DEAL_DRAIN_FILE,
  grace: duration('LAST_DEAL_RECONNECT_MS', 60_000),
  awaySkip: duration('LAST_DEAL_AWAY_SKIP_MS', 15_000),
  hostGrace: duration('LAST_DEAL_HOST_GRACE_MS', 20_000),
  roomTtl: duration('LAST_DEAL_ROOM_TTL_MS', 30 * 60_000),
  onMatch: stats.record,
});
app.http.listen(port, '127.0.0.1', () => console.log(`Last Deal listening on 127.0.0.1:${port}`));
const shutdown = async () => {
  await app.close();
  stats.close();
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

function duration(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value <= 0 || value > 2_147_483_647)
    throw Error(`Invalid ${name}`);
  return value;
}
