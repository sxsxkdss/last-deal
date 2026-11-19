import { strict as assert } from 'node:assert';
import test from 'node:test';
import { seeded } from '../src/match/clock.ts';
import { Table } from '../src/match/table.ts';
import { ALPHA, LAST_CALL, MAX_STACK, PRESETS, WIRE_FACES } from '../src/rules/cards.ts';
import { serialize } from '../src/classic/snapshot.ts';

function table() {
  return new Table(
    {
      ...PRESETS.mayhem,
      mode: 'one',
      limit: 250,
      members: [
        { name: 'A', bot: false },
        { name: 'B', bot: false },
      ],
    },
    seeded(9),
  );
}

test('War keeps the wire faces and card IDs aligned after arming a curse', () => {
  const { G: g } = table();
  g.side = 'D';
  g.horse = { k: 'war', v: 'arms', left: 10 };
  const curse = { ...g.newCard(), D: { c: 'x', v: 'lead' } };
  const attack = { ...g.newCard(), D: { c: 'p', v: 'd5' } };
  g.players[0].hand = [curse, attack];
  g.horseTurn(0);
  assert.deepEqual(curse.D, { c: 'x', v: 'd5' });
  const own = serialize(g, 0).p[0];
  assert.equal(own[3].length, 4);
  assert.deepEqual(own[11], [curse.id, attack.id]);
  assert.deepEqual(WIRE_FACES.D[ALPHA.indexOf(own[3][1])], curse.D);
});

test('draw to a night color still resolves when Eclipse has returned the day', () => {
  const t = table();
  const g = t.G;
  g.side = 'D';
  g.turn = 0;
  const shift = g.newCard();
  shift.D = { c: 'v', v: 'wdc' };
  shift.L = { c: 'r', v: '4' };
  g.players[0].hand.push(shift);
  g.color = 'v';
  g.flipBack = { pi: 0, seq: g.seq };
  assert.ok(t.dispatch(0, { k: 'play', cards: [shift.id], color: 'v' }));
  assert.equal(g.side, 'L');
  assert.equal(g.debt?.until, 'v');
  g.next.D = { c: 'p', v: '4' };
  assert.ok(t.dispatch(1, { k: 'draw' }));
  assert.equal(g.debt?.got, 1);
  g.next.D = { c: 'v', v: '2' };
  assert.ok(t.dispatch(1, { k: 'draw' }));
  assert.equal(g.debt, null);
  assert.equal(g.turn, 0);
  assert.equal(g.side, 'L');
});

test('the table rejects a Famine group preview and hides draw during an offer', () => {
  const t = table();
  const g = t.G;
  g.turn = 0;
  const cards = [g.newCard(), g.newCard()];
  for (const card of cards) card.L = { c: 'r', v: '3' };
  g.side = 'L';
  g.color = 'r';
  g.players[0].hand.push(...cards);
  const ids = cards.map((c) => c.id);
  assert.deepEqual(t.previewSelection(0, ids), ids);
  g.horse = { k: 'famine', v: 'two', left: 8, curses: [] };
  assert.equal(t.controls(0).canGroup, false);
  assert.equal(t.previewSelection(0, ids), null);
  assert.deepEqual(t.previewSelection(0, [ids[0]]), [ids[0]]);
  assert.equal(t.dispatch(0, { k: 'play', cards: ids }), false);

  g.offer = { pi: 0, kind: 'light', opts: ['wind'] };
  assert.equal(t.view(0).canDraw, false);
  assert.equal(t.controls(0).canPass, false);
  assert.deepEqual(t.controls(0).playable, []);
  assert.equal(t.dispatch(0, { k: 'draw' }), false);
});

test('stack modifiers and a lost roulette respect the existing +60 ceiling', () => {
  const t = table();
  const g = t.G;
  g.side = 'D';
  g.turn = 0;
  g.multNext = 9;
  const wild = g.newCard();
  wild.D = { c: 'w', v: 'wd15' };
  g.players[0].hand.push(wild);
  assert.ok(t.dispatch(0, { k: 'play', cards: [wild.id], color: 'o' }));
  assert.equal(g.pending, MAX_STACK);
  assert.equal(g.stackMin, 15);
  g.random = () => 0.91;
  assert.ok(t.dispatch(1, { k: 'gamble', target: 0 }));
  assert.equal(g.debt?.kind, 'stack');
  assert.equal(g.debt.n + g.debt.got, MAX_STACK);
});

test('Skip All, Skip and Reverse start a full turn even when play returns to the same seat', () => {
  for (const value of ['skipall', 'skip', 'rev']) {
    const t = table();
    const g = t.G;
    g.turn = 0;
    g.side = 'D';
    g.color = 'p';
    g.horse = { k: 'war', v: 'timer', left: 7, curses: [] };
    const card = g.newCard();
    card.D = { c: 'p', v: value };
    const chained = g.players[0].hand[0];
    chained.chain = 1;
    g.players[0].hand.push(card);
    t.sync();
    const before = g.turnNo;
    assert.ok(chained.lock);
    t.clock.advance(250);
    assert.ok(t.dispatch(0, { k: 'play', cards: [card.id] }));
    assert.equal(g.turn, 0);
    assert.equal(g.turnNo, before + 1);
    assert.equal(g.horse.left, 5);
    assert.equal(chained.lock, false);
    assert.equal(t.warAt, t.clock.now + 5000);
    t.sync();
    assert.equal(g.horse.left, 5);
  }
});

test('Eclipse ends when its temporary turn finishes with Skip All', () => {
  const t = table();
  const g = t.G;
  g.turn = 0;
  g.side = 'D';
  g.color = 'p';
  g.flipBack = { pi: 0, seq: g.seq };
  const card = g.newCard();
  card.D = { c: 'p', v: 'skipall' };
  card.L = { c: 'r', v: '5' };
  g.players[0].hand.push(card);
  assert.ok(t.dispatch(0, { k: 'play', cards: [card.id] }));
  assert.equal(g.turn, 0);
  assert.equal(g.side, 'L');
  assert.equal(g.flipBack, null);
});

test('Echo and Mirror can affect a stack without charging the Double deal', () => {
  for (const value of ['echo', 'mirror']) {
    const t = table();
    const g = t.G;
    g.turn = 0;
    g.color = 'r';
    g.top.L = { c: 'r', v: 'd2' };
    g.pending = 2;
    g.stackMin = 2;
    g.stackFrom = 1;
    const player = g.players[0];
    player.peace = true;
    player.deals = ['double'];
    const card = g.newCard();
    card.L = { c: 'w', v: value };
    player.hand.push(card);
    const debt = player.debt;
    assert.ok(t.dispatch(0, { k: 'play', cards: [card.id], color: 'r' }));
    assert.equal(player.peace, true);
    assert.equal(player.debt, debt);
    assert.equal(g.stackFrom, 0);
    assert.equal(g.pending, value === 'mirror' ? 2 : 6);
  }
});

test('an extra turn counts toward Last Call', () => {
  const t = table();
  const g = t.G;
  g.turn = 0;
  g.turnNo = LAST_CALL - 1;
  g.color = 'r';
  const card = g.newCard();
  card.L = { c: 'r', v: 'skipall' };
  g.players[0].hand.push(card);
  assert.ok(t.dispatch(0, { k: 'play', cards: [card.id] }));
  assert.equal(g.turnNo, LAST_CALL);
  assert.equal(t.phase, 'over');
  assert.ok(g.events.some((event) => event.type === 'lastcall'));
});
