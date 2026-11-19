import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { WebSocket } from 'ws';
import { createGameServer } from '../server/game-server.ts';
import { openStatistics } from '../server/statistics.ts';
import { Table } from '../src/match/table.ts';
import { PRESETS, SIDE_COLORS, other } from '../src/rules/cards.ts';
import { serialize } from '../src/classic/snapshot.ts';
import { seeded } from '../src/match/clock.ts';

async function open(port, sockets) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  sockets.push(ws);
  const messages = [];
  ws.on('message', (raw) => messages.push(JSON.parse(raw)));
  await once(ws, 'open');
  let n = 0;
  return {
    ws,
    send(command, state, sequence = n++) {
      ws.send(
        JSON.stringify({
          v: 1,
          n: sequence,
          command,
          game: state?.game,
          phase: state?.phase,
          revision: state?.tableRevision,
        }),
      );
      return sequence;
    },
    async next(predicate) {
      for (let attempt = 0; attempt < 120; attempt++) {
        const at = messages.findIndex(predicate);
        if (at >= 0) return messages.splice(at, 1)[0];
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.fail(`Timed out: ${predicate}`);
    },
  };
}

test('WebSocket room, hand order, idempotent draw, resume, and maintenance', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'last-deal-test-'));
  const drainFile = join(dir, 'drain');
  const dbPath = join(dir, 'matches.sqlite');
  const stats = openStatistics(dbPath);
  const completed = [];
  const app = createGameServer({
    drainFile,
    onMatch: (match) => {
      completed.push(match);
      stats.record(match);
    },
  });
  const sockets = [];
  try {
    app.http.listen(0, '127.0.0.1');
    await once(app.http, 'listening');
    const { port } = app.http.address();
    const a = await open(port, sockets),
      b = await open(port, sockets),
      list = await open(port, sockets);
    list.send({ t: 'list' });
    assert.deepEqual((await list.next((m) => m.t === 'directory')).rooms, []);
    a.send({ t: 'create', name: 'A', mode: 'one', public: false });
    const { code } = await a.next((m) => m.t === 'joined');
    await a.next((m) => m.t === 'lobby');
    a.send({ t: 'settings', public: true, capacity: 2 });
    await list.next(
      (m) => m.t === 'directory' && m.rooms.some((r) => r.code === code && r.capacity === 2),
    );
    b.send({ t: 'join', code, name: 'B' });
    const { token } = await b.next((m) => m.t === 'joined');
    await a.next((m) => m.t === 'lobby' && m.lobby.players.length === 2);
    const bad = b.send({ t: 'start' });
    assert.equal((await b.next((m) => m.t === 'ack' && m.n === bad)).ok, false);
    a.send({ t: 'start' });
    const initial = await Promise.all([a.next((m) => m.t === 'state'), b.next((m) => m.t === 'state')]);
    assert.equal(initial[0].game, initial[1].game);
    assert.equal(initial[0].st.p[1][11], null);
    assert.ok(initial[0].st.p[1][3].startsWith('!'));
    assert.equal(initial[0].st.nf, null);
    const cards = initial[1].st.p[1][11].slice().reverse();
    b.send({ t: 'order', cards, selected: [cards[0]] }, initial[1]);
    const ordered = await a.next((m) => m.t === 'state' && m.selection[0]?.[1]?.[0] === 0);
    assert.equal(ordered.st.p[1][3], '!' + initial[0].st.p[1][3].slice(1).split('').reverse().join(''));

    const turn = ordered.st.u;
    const actor = [a, b][turn];
    const n = actor.send({ t: 'act', a: { k: 'draw' } }, initial[turn]);
    const ack = await actor.next((m) => m.t === 'ack' && m.n === n);
    assert.equal(ack.ok, true);
    actor.send({ t: 'act', a: { k: 'draw' } }, initial[turn], n);
    assert.deepEqual(await actor.next((m) => m.t === 'ack' && m.n === n), ack);

    await writeFile(drainFile, '');
    b.ws.close();
    await a.next((m) => m.t === 'state' && m.st.aw[1] === 1);
    const resumed = await open(port, sockets);
    resumed.send({ t: 'resume', token });
    const joined = await resumed.next((m) => m.t === 'joined');
    const current = await resumed.next((m) => m.t === 'state');
    assert.equal(current.seat, 1);
    assert.equal(current.game, initial[1].game);
    assert.equal(current.st.aw[1], 0);
    resumed.send({ t: 'leave' }, current, joined.next);
    await a.next((m) => m.t === 'state' && m.phase === 'over');
    const restart = a.send({ t: 'start' });
    assert.equal((await a.next((m) => m.t === 'ack' && m.n === restart)).error, 'maintenance');
    assert.equal(completed.length, 1);
    assert.deepEqual(completed[0].withdrawn, [1]);
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const stored = JSON.parse(db.prepare('SELECT data FROM matches').get().data);
      assert.deepEqual(stored.withdrawn, [1]);
      assert.ok(!('players' in stored) && !('room' in stored) && !('token' in stored));
    } finally {
      db.close();
    }
  } finally {
    sockets.forEach((ws) => ws.terminate());
    await app.close();
    stats.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('presence does not shift another deadline, and forfeited debt seats stay out', () => {
  const table = new Table(
    {
      ...PRESETS.den,
      mode: 'debt',
      limit: 250,
      members: ['A', 'B', 'C'].map((name) => ({ name, bot: false })),
    },
    seeded(42),
    { gameId: () => 'round', grace: 60000, awaySkip: 15000 },
  );
  table.clock.advance(30000);
  const turn = table.G.turn;
  table.setAway(turn, true);
  const deadline = table.decisionAt;
  table.clock.advance(1000);
  const other = (turn + 1) % 3;
  table.setAway(other, true);
  assert.equal(table.decisionAt, deadline);
  table.setAway(turn, false);
  table.forfeit(other, 'away');
  assert.equal(table.G.players[other].out, true);
  const winner = table.G.turn;
  table.G.winner = winner;
  table.sync();
  assert.equal(table.phase, 'shop');
  table.clock.advance(45000);
  assert.equal(table.phase, 'draft');
  assert.equal(table.G.players[other].out, true);
  assert.equal(table.G.players[other].hand.length, 0);
  assert.equal(table.M.col[other], false);
  table.G.ev('demonCharge', { pi: other, k: 13 });
  assert.ok(!serialize(table.G, winner).ev.some((e) => e.type === 'demonCharge'));
});

test('host transfers during a draft and an expired session cannot resume', async () => {
  const app = createGameServer({ grace: 300, hostGrace: 25, roomTtl: 100 });
  const sockets = [];
  try {
    app.http.listen(0, '127.0.0.1');
    await once(app.http, 'listening');
    const { port } = app.http.address();
    const a = await open(port, sockets),
      b = await open(port, sockets);
    a.send({ t: 'create', name: 'A', mode: 'debt' });
    const { code, token } = await a.next((m) => m.t === 'joined');
    b.send({ t: 'join', name: 'B', code });
    await b.next((m) => m.t === 'joined');
    a.send({ t: 'start' });
    await b.next((m) => m.t === 'state' && m.phase === 'draft');
    a.ws.close();
    await b.next((m) => m.t === 'state' && m.host && m.phase === 'draft');
    const over = await b.next((m) => m.t === 'state' && m.phase === 'over');
    assert.deepEqual(over.match.withdrawn, [true, false]);
    assert.deepEqual(over.match.col, [false, false]);
    const stale = await open(port, sockets);
    stale.send({ t: 'resume', token });
    assert.equal((await stale.next((m) => m.t === 'error')).code, 'expired');
    b.send({ t: 'tolobby' });
    const lobby = await b.next((m) => m.t === 'lobby' && m.lobby.players.length === 1);
    assert.equal(lobby.lobby.host, true);
  } finally {
    sockets.forEach((ws) => ws.terminate());
    await app.close();
  }
});

test('two network seats complete a debt round and start the next draft', async () => {
  const app = createGameServer({ random: seeded(54) });
  const sockets = [];
  try {
    app.http.listen(0, '127.0.0.1');
    await once(app.http, 'listening');
    const { port } = app.http.address();
    const a = await open(port, sockets),
      b = await open(port, sockets);
    const peers = [a, b];
    a.send({ t: 'create', name: 'A', mode: 'debt', ...PRESETS.classic });
    const { code } = await a.next((m) => m.t === 'joined');
    b.send({ t: 'join', name: 'B', code });
    await b.next((m) => m.t === 'joined');
    a.send({ t: 'start' });
    let view = await a.next((m) => m.t === 'state' && m.phase === 'draft');
    const guest = await b.next((m) => m.t === 'state' && m.game === view.game);
    assert.equal(guest.match.dark.length, 0);
    a.send({ t: 'draft', ids: view.st.p[0][11].slice(0, 2) }, view);
    b.send({ t: 'draft', ids: guest.st.p[1][11].slice(0, 2) }, guest);
    view = await a.next((m) => m.t === 'state' && m.phase === 'play');
    for (let i = 0; i < 180 && view.phase === 'play'; i++) {
      const seat = view.st.of?.[0] ?? (view.st.o >= 0 ? view.st.o : view.st.u);
      const player = peers[seat];
      const state =
        seat === 0
          ? view
          : await b.next((m) => m.t === 'state' && m.tableRevision === view.tableRevision);
      const color = SIDE_COLORS[state.st.sd][0];
      const flipColor = SIDE_COLORS[other(state.st.sd)][0];
      let action;
      if (state.st.of) action = { k: 'deal', id: state.st.of[1] === 'dark' ? null : state.st.of[2][0] };
      else if (state.st.o >= 0) action = { k: 'roul', color };
      else if (state.controls.playable.length)
        action = { k: 'play', id: state.controls.playable[0], color, flipColor };
      else action = { k: state.controls.canDraw ? 'draw' : 'pass' };
      const n = player.send({ t: 'act', a: action }, state);
      const ack = await player.next((m) => m.t === 'ack' && m.n === n);
      assert.equal(ack.ok, true, JSON.stringify({ action, ack }));
      view = await a.next((m) => m.t === 'state' && m.tableRevision > view.tableRevision);
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    assert.equal(view.phase, 'shop');
    assert.equal(view.match.last.round, 1);
    const guestShop = await b.next((m) => m.t === 'state' && m.phase === 'shop');
    a.send({ t: 'shop', a: { k: 'done' } }, view);
    b.send({ t: 'shop', a: { k: 'done' } }, guestShop);
    const next = await a.next((m) => m.t === 'state' && m.phase === 'draft' && m.match.round === 2);
    assert.notEqual(next.game, view.game);
  } finally {
    sockets.forEach((ws) => ws.terminate());
    await app.close();
  }
});
