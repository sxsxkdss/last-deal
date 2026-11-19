import assert from 'node:assert/strict';
import { once } from 'node:events';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { setTimeout as wait } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server/game-server.ts';

const rooms = Number(process.argv[2] ?? 24);
const actions = Number(process.argv[3] ?? 12);
if (
  !Number.isInteger(rooms) ||
  rooms < 1 ||
  rooms > 256 ||
  !Number.isInteger(actions) ||
  actions < 1 ||
  actions > 20
)
  throw Error('Usage: node tools/load-network.mjs [1–256 rooms] [1–20 commands per room]');

const app = createGameServer({ roomTtl: 300 });
const sockets = new Set();
const latencies = [];
const reconnects = [];
const delay = monitorEventLoopDelay({ resolution: 10 });
const memory = () => {
  const { rss, heapUsed } = process.memoryUsage();
  return { rss, heapUsed };
};
const percentile = (data, n) => {
  const sorted = data.slice().sort((a, b) => a - b);
  return +sorted[Math.max(0, Math.ceil(sorted.length * n) - 1)].toFixed(2);
};

async function connect(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  sockets.add(ws);
  ws.once('close', () => sockets.delete(ws));
  const queue = [];
  let state,
    sequence = 0,
    incoming;
  ws.on('message', (raw) => {
    const message = JSON.parse(raw);
    if (message.t === 'state') state = message;
    if (message.t === 'joined') sequence = message.next;
    queue.push(message);
    incoming?.();
  });
  await once(ws, 'open');
  return {
    ws,
    get state() {
      return state;
    },
    send(command) {
      const n = sequence++;
      ws.send(
        JSON.stringify({
          v: 1,
          n,
          command,
          game: state?.game,
          phase: state?.phase,
          revision: state?.tableRevision,
        }),
      );
      return n;
    },
    async next(predicate) {
      const end = performance.now() + 10000;
      while (performance.now() < end) {
        const at = queue.findIndex(predicate);
        if (at >= 0) return queue.splice(at, 1)[0];
        await new Promise((resolve) => {
          const alarm = setTimeout(resolve, 200);
          incoming = () => {
            clearTimeout(alarm);
            resolve();
          };
        });
        incoming = undefined;
      }
      throw Error('Timed out waiting for a network response');
    },
  };
}

const baseline = memory();
let peak = baseline;
const samples = setInterval(() => {
  const now = memory();
  peak = { rss: Math.max(peak.rss, now.rss), heapUsed: Math.max(peak.heapUsed, now.heapUsed) };
}, 20);
try {
  delay.enable();
  app.http.listen(0, '127.0.0.1');
  await once(app.http, 'listening');
  const { port } = app.http.address();
  const groups = await Promise.all(
    Array.from({ length: rooms }, async () => {
      const a = await connect(port),
        b = await connect(port);
      a.send({
        t: 'create',
        name: 'Load A',
        mode: 'one',
        rules: { drawUntil: false, chaos: false, potato: false },
      });
      const { code } = await a.next((m) => m.t === 'joined');
      b.send({ t: 'join', code, name: 'Load B' });
      const { token } = await b.next((m) => m.t === 'joined');
      await a.next((m) => m.t === 'lobby' && m.lobby.players.length === 2);
      a.send({ t: 'start' });
      await Promise.all([a, b].map((peer) => peer.next((m) => m.t === 'state')));
      return { a, b, token };
    }),
  );
  assert.equal(app.counts().active, rooms);
  for (let i = 0; i < actions; i++) {
    await Promise.all(
      groups.map(async ({ a, b }) => {
        const actor = [a, b][a.state.st.u];
        const other = actor === a ? b : a;
        const expected = actor.state.tableRevision;
        const start = performance.now();
        const n = actor.send({ t: 'act', a: { k: actor.state.controls.canDraw ? 'draw' : 'pass' } });
        const ack = await actor.next((m) => m.t === 'ack' && m.n === n);
        assert.ok(ack.ok);
        latencies.push(performance.now() - start);
        await other.next((m) => m.t === 'state' && m.tableRevision > expected);
      }),
    );
  }
  await Promise.all(
    groups.map(async ({ b }) => {
      b.ws.close();
      await once(b.ws, 'close');
    }),
  );
  await Promise.all(
    groups.map(async (group) => {
      const start = performance.now();
      group.b = await connect(port);
      group.b.send({ t: 'resume', token: group.token });
      assert.equal((await group.b.next((m) => m.t === 'state')).seat, 1);
      reconnects.push(performance.now() - start);
    }),
  );
  for (const group of groups) {
    group.a.send({ t: 'leave' });
    group.b.send({ t: 'leave' });
  }
  await wait(150);
  for (const ws of sockets) ws.close();
  await wait(450);
  assert.deepEqual(app.counts(), { rooms: 0, peers: 0, active: 0 });
  console.log(
    JSON.stringify(
      {
        node: process.version,
        rooms,
        connections: rooms * 2,
        commands: latencies.length,
        ackMs: {
          p50: percentile(latencies, 0.5),
          p95: percentile(latencies, 0.95),
          p99: percentile(latencies, 0.99),
        },
        resumeMs: {
          p50: percentile(reconnects, 0.5),
          p95: percentile(reconnects, 0.95),
          p99: percentile(reconnects, 0.99),
        },
        eventLoopP95Ms: +(delay.percentile(95) / 1e6).toFixed(2),
        baseline,
        peak,
        afterClose: memory(),
        remaining: app.counts(),
      },
      null,
      2,
    ),
  );
} finally {
  clearInterval(samples);
  delay.disable();
  await app.close();
}
