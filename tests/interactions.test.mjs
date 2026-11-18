import assert from 'node:assert/strict';
import test from 'node:test';
import { Game } from '../src/rules/game.ts';
import { EXTRA_CARDS, PRESETS, FACES } from '../src/rules/cards.ts';
import { seeded } from '../src/match/clock.ts';
import { selection } from '../src/rules/selection.ts';
import { localGame } from '../src/match/local.ts';
import { Table } from '../src/match/table.ts';
import { endDraft, newDeal } from '../src/match/match.ts';
const make = () => new Game(['a', 'b', 'c'], [0, 1, 2], PRESETS.mayhem, seeded(432));
test('classic, den, mayhem and individual card/rule toggles', () => {
  for (const [name, preset] of Object.entries(PRESETS)) {
    const g = new Game(['a', 'b'], [0, 1], { ...preset.rules, cards: preset.cards }, seeded(1431));
    assert.deepEqual(g.rules.cards, preset.cards);
    assert.equal(g.rules.combos, name !== 'classic');
    const disabled = new Set(
      Object.entries(preset.cards)
        .filter(([, b]) => !b)
        .map(([k]) => k),
    );
    for (let i = 0; i < 250; i++) {
      const c = g.newCard();
      assert.ok(!disabled.has(c.L.v) && !disabled.has(c.D.v));
    }
  }
  const g = new Game(['a', 'b'], [0, 1], { flip: false, stacking: false }, seeded(4321));
  for (let i = 0; i < 300; i++) {
    const c = g.newCard();
    assert.ok(![c.L.v, c.D.v].some((v) => ['flip', 'dflip'].includes(v)));
  }
});
test('description tokens are wired to the round: license, padding, counter, rigged pair, luck', () => {
  const t = new Table(
    {
      mode: 'debt',
      limit: 1000,
      ...PRESETS.den,
      members: [
        { name: 'a', bot: false },
        { name: 'b', bot: false },
      ],
    },
    seeded(424),
  );
  t.M.tokens[0] = ['license', 'light', 'counter'];
  newDeal(t);
  const g = t.G;
  assert.equal(g.players[0].hand.length, 7);
  const bonus = g.players[0].hand.at(-1);
  assert.ok(EXTRA_CARDS.includes(bonus.L.v) || EXTRA_CARDS.includes(bonus.D.v));
  endDraft(t);
  g.turn = 0;
  g.pending = 0;
  g.color = 'r';
  const card = g.newCard();
  card.L = { c: 'r', v: 'rev' };
  g.players[0].hand.push(card);
  const before = g.chipsWon[0];
  g.play(0, card.id);
  assert.equal(g.chipsWon[0], before + 1);
  const s = make();
  s.turn = 0;
  s.perks = { 0: ['pad', 'sharp', 'luck'] };
  s.pending = 8;
  s.stackFrom = 1;
  s.draw(0);
  assert.equal(s.debt.n, 3);
  assert.ok(s.padUsed[0]);
  while (s.debt) s.draw(0);
  s.turn = 0;
  s.pending = 8;
  s.stackFrom = 1;
  s.draw(0);
  assert.equal(s.debt.n, 7);
  while (s.debt) s.draw(0);
  s.turn = 0;
  s.pending = 8;
  s.random = () => 0.6;
  s.gamble(0, 1);
  assert.equal(s.pending, 0);
  assert.ok(s.players[1].oweN >= 8);
  s.turn = 0;
  s.color = 'r';
  const pair = ['r', 'g'].map((c) => {
    const k = s.newCard();
    k.L = { c, v: '2' };
    s.players[0].hand.push(k);
    return k.id;
  });
  s.play(0, pair[0], { extra: [pair[1]] });
  assert.ok(s.events.find((e) => e.type === 'combo' && e.key === 'three'));
});
test('seat projection, stable events, no mutation on invalid selection', () => {
  const config = {
    members: [
      { name: 'a', bot: false },
      { name: 'b', bot: false },
    ],
    mode: 'one',
    limit: 500,
    ...PRESETS.mayhem,
  };
  const t = localGame(config, seeded(21)),
    pi = t.view(0).turn,
    received = [];
  const stop = t.subscribe(pi, (v, events) =>
    received.push(...events.map((e) => [v.gameId, e.n].join('/'))),
  );
  const state = t.view(pi),
    r = t.revision;
  assert.equal(t.dispatch(pi, { k: 'play', cards: [-1] }), false);
  assert.equal(r, t.revision);
  t.dispatch(pi, { k: 'draw' });
  stop();
  assert.ok(received.length > 1);
  assert.equal(new Set(received).size, received.length);
  const g = make();
  g.turn = 0;
  const [a, b] = g.players[0].hand;
  a.L = { c: 'r', v: '1' };
  b.L = { c: 'r', v: 'skip' };
  g.color = 'r';
  assert.equal(selection(g, 0, [a.id, b.id]), null);
  assert.ok(!state.players[1 - pi].backs.some((c) => 'id' in c));
});
test('Death targets, Fever order and ward expiration per round', () => {
  const t = new Table(
    {
      members: [
        { name: 'a', bot: false },
        { name: 'b', bot: false },
      ],
      mode: 'debt',
      limit: 500,
      ...PRESETS.den,
    },
    seeded(1),
  );
  endDraft(t);
  t.G.horse = { k: 'death', v: 'curse', left: 8, curses: ['fever', 'dark'] };
  const ids = t.view(0).hand.map((c) => c.id),
    actual = t.G.players[0].hand.map((c) => c.id);
  t.clock.advance(1000);
  assert.notDeepEqual(
    t.view(0).hand.map((c) => c.id),
    ids,
  );
  assert.deepEqual(
    t.G.players[0].hand.map((c) => c.id),
    actual,
  );
  assert.equal(t.view(1).effects.curse, 'dark');
  t.G.players[1].inv = ['ward'];
  t.G.wardCheck();
  assert.equal(t.view(1).effects.curse, null);
});
