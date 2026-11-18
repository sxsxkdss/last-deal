import test from 'node:test';
import assert from 'node:assert/strict';
import reference from './legacy-server.json' with { type: 'json' };
import * as match from '../src/match/match.ts';
import { serverFlow } from './server-cases.mjs';
import { Table } from '../src/match/table.ts';
import { Clock, seeded } from '../src/match/clock.ts';
import { PRESETS, TOKENS } from '../src/rules/cards.ts';
const members = ['А', 'Б', 'В'].map((name) => ({ name, bot: false }));
const make = (mode = 'debt', seats = members, seed = 1) =>
  new Table({ members: seats, mode, limit: 250, ...PRESETS.mayhem }, seeded(seed));
test('pinned server: draft, settlement, shop prices, carryover, collectors, champion', () =>
  assert.deepEqual(serverFlow(match), reference));
test('stable schedule and cancellation', () => {
  const c = new Clock(),
    out = [];
  const id = c.after(() => out.push(0), 2);
  c.after(() => {
    out.push(1);
    c.after(() => out.push(3), 0);
  }, 2);
  c.after(() => out.push(2), 2);
  c.cancel(id);
  c.advance(2);
  assert.deepEqual(out, [1, 2, 3]);
  assert.throws(() => c.advance(-1));
});
test('draft 30s and shop 45s; duplicate cards, stale buys and private views', () => {
  const t = make(),
    g = t.G,
    h = g.players[0].hand;
  assert.equal(t.dispatch(0, { k: 'draft', cards: [h[0].id, h[0].id] }), false);
  assert.equal(t.dispatch(0, { k: 'draft', cards: h.slice(0, 2).map((c) => c.id) }), true);
  assert.equal(t.view(1).match.passed, false);
  t.clock.advance(29999);
  assert.equal(t.phase, 'draft');
  t.clock.advance(1);
  assert.equal(t.phase, 'play');
  const v = t.view(0);
  assert.ok(v.hand.every((c) => !('L' in c) && !('D' in c)));
  assert.equal(v.nextFace, null);
  assert.deepEqual(
    v.players[1].backs,
    g.players[1].hand.map((c) => g.back(c)),
  );
  v.hand[0].face.v = 'changed';
  assert.notEqual(g.f(g.players[0].hand[0]).v, 'changed');
  g.offer = { pi: 1, kind: 'dark', opts: ['blood', 'chains'] };
  assert.equal(t.view(0).offer, null);
  g.players[0].deals = ['sharp'];
  assert.deepEqual(t.view(0).nextFace, g.f(g.next));
  g.offer = null;
  g.winner = 0;
  t.sync();
  assert.equal(t.phase, 'shop');
  assert.equal(t.view(0).match.dark.length, 3);
  t.clock.advance(44999);
  assert.equal(t.phase, 'shop');
  t.clock.advance(1);
  assert.equal(t.phase, 'draft');
  assert.equal(t.dispatch(0, { k: 'buy', kind: 'item', id: 'oven' }), false);
});
test('nine tokens: purchase, capacity, safe, debtor, lender, license, light hand', () => {
  const t = make(),
    m = t.M;
  match.endDraft(t);
  m.chips[0] = 200;
  t.G.winner = 0;
  t.sync();
  assert.equal(m.offers[0].length, 3);
  for (const id of TOKENS) {
    m.done[0] = false;
    m.tokens[0] = [];
    m.offers[0] = [id];
    m.chips[0] = 20;
    assert.ok(t.dispatch(0, { k: 'buy', kind: 'token', id }));
    assert.equal(m.chips[0], 0);
    assert.deepEqual(m.tokens[0], [id]);
    assert.equal(t.dispatch(0, { k: 'buy', kind: 'token', id }), false);
  }
  m.tokens = [
    ['light', 'license', 'usurer'],
    ['safe', 'debtor'],
    ['sharp', 'pad', 'counter'],
  ];
  m.offers[0] = ['safe'];
  m.chips[0] = 100;
  assert.equal(t.dispatch(0, { k: 'buy', kind: 'token', id: 'safe' }), false);
  match.endShop(t);
  const g = t.G;
  assert.equal(g.players[0].hand.length, 7);
  assert.equal(g.hasPerk(2, 'sharp'), true);
  assert.equal(g.players[0].hand.at(-1).uniq, undefined);
  m.tokens[0] = ['light'];
  match.newDeal(t);
  assert.equal(t.G.players[0].hand.length, 6);
  m.tokens[0] = ['usurer'];
  match.endDraft(t);
  const n = t.G;
  n.players[1].debt = 0;
  n.players[1].deals = [];
  n.players[1].hand = ['9', 'd1', 'd4', 'wd4', 'wild', 'skip'].map((v, i) => ({
    id: i,
    L: { v, c: v === 'wd4' || v === 'wild' ? 'w' : 'r' },
    D: { c: 'p', v: '1' },
  }));
  n.winner = 0;
  const before = m.chips[0];
  n.dir = 1;
  t.sync();
  assert.equal(m.last.rows.find((r) => r.i === 1).paid, 24);
  assert.equal(
    m.chips[0] - before,
    5 + Math.round(m.last.rows.reduce((s, r) => s + r.paid, 0) * 0.1) + 2,
  );
});
test('War clock, idle turn, visitor timeout and away seat', () => {
  const t = make('one'),
    g = t.G,
    i = g.turn;
  g.horse = { k: 'war', v: 'timer', left: 10, curses: [] };
  t.sync();
  t.clock.advance(4999);
  assert.equal(g.turn, i);
  t.clock.advance(1);
  assert.notEqual(g.turn, i);
  assert.ok(g.players[i].oweN >= 3);
  const idle = make('one'),
    who = idle.G.turn;
  idle.clock.advance(60000);
  assert.notEqual(idle.G.turn, who);
  const t2 = make('one');
  t2.G.offer = { pi: 0, kind: 'dark', opts: ['drum'] };
  t2.sync();
  t2.clock.advance(45000);
  assert.equal(t2.G.offer, null);
  assert.deepEqual(t2.G.players[0].deals, []);
  const t3 = make('one'),
    actor = t3.G.turn;
  t3.setAway(actor, true);
  t3.clock.advance(15000);
  assert.notEqual(t3.G.turn, actor);
  t3.clock.advance(45000);
  assert.equal(t3.G.players[actor].out, true);
});
test('full seeded matches finish with one champion, including next deals', () => {
  for (const seed of [6, 20, 98]) {
    const t = make(
      'debt',
      members.map((m) => ({ ...m, bot: true })),
      seed,
    );
    let n = 0;
    while (t.phase !== 'over' && n++ < 40000) {
      assert.ok(Number.isFinite(t.clock.next));
      t.clock.advance(t.clock.next - t.clock.now);
    }
    assert.equal(t.phase, 'over');
    assert.ok(Number.isInteger(t.M.champ));
    assert.ok(t.M.round >= 1);
  }
});
