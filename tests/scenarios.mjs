import { createHash } from 'node:crypto';
import { seeded } from '../src/match/clock.ts';
import { FACES, PRESETS } from '../src/rules/cards.ts';
import { LIGHT_DEALS, DARK_DEALS } from '../src/rules/contracts.ts';
import { HORSEMEN } from '../src/rules/horsemen.ts';
import { ITEMS, DEAL_ITEMS } from '../src/rules/items.ts';
export const cases = new Map();
const add = (name, run) => cases.set(name, run);
const card = (g, side, f) => {
  const c = g.newCard();
  c[side] = { ...f };
  return c;
};
for (const side of ['L', 'D'])
  for (const f of FACES[side]) {
    add('face/' + side + '/' + f.c + '/' + f.v, (g) => {
      g.side = side;
      g.turn = 0;
      g.color = f.c;
      const c = card(g, side, f);
      g.players[0].hand.unshift(c);
      if (['sacr', 'djoker', 'swind'].includes(f.v)) c.uniq = true;
      if (f.v === 'leech') g.players[0].hand = [c];
      g.play(0, c.id, { target: 2, color: g.colors()[1], flipColor: side === 'L' ? 't' : 'g' });
      g.beginTurn();
    });
  }
for (const d of [...LIGHT_DEALS, ...DARK_DEALS])
  add('contract/' + d, (g) => {
    const p = g.players[0];
    g.turn = 0;
    p.debt = 100;
    const light = LIGHT_DEALS.includes(d);
    if (!light && d !== 'desecrate') {
      p.deals = ['rosary', 'penance'];
      p.inv = ['penance'];
      p.tookLight = true;
    }
    g.offer = { pi: 0, kind: light ? 'light' : 'dark', opts: [d] };
    g.resolveDeal(0, d, 2);
    g.dealStart();
    g.side = 'D';
    g.beginTurn();
    g.attacked(0);
    g.hit(0, 2, 12);
    g.hit(1, 0, 7);
    g.alms(0, 2);
    g.payDebt(0, 10, 'test');
    g.ability(
      0,
      d === 'sharp' ? 'burn' : d,
      p.hand.slice(0, 3).map((c) => c.id),
    );
  });
for (const id of [...ITEMS, ...DEAL_ITEMS])
  add('item/' + id, (g) => {
    const p = g.players[0];
    p.inv = [id];
    p.debt = 99;
    g.turn = 0;
    if (id === 'oven') while (p.hand.length < 32) p.hand.push(g.newCard());
    if (id === 'twoface') {
      g.offer = { pi: 0, kind: 'light', opts: ['grace'] };
      g.twoFace();
      g.resolveDeal(0, g.offer.opts.at(-1), 1);
    } else if (id === 'ward') {
      g.horse = { k: 'war', v: 'arms', left: 5, curses: [] };
      g.wardCheck();
      g.horseTurn(0);
    } else {
      g.useItem(0, id);
      g.ev('flip', { side: 'D' });
      g.beginTurn();
    }
  });
for (const [k, variants] of Object.entries(HORSEMEN))
  for (const v of variants)
    add('horse/' + k + '/' + v, (g) => {
      g.horse = { k, v, left: 10, fresh: true, curses: ['dark', 'fever', 'static'] };
      g.horseUsed = true;
      for (let i = 0; i < 12; i++) {
        g.turn = i % 3;
        g.beginTurn();
        g.hit(0, 1, 2);
        if (v === 'timer') g.warTimeout(g.turn);
      }
    });
for (const def of [
  'mirror',
  'shield',
  'guardian',
  'halo',
  'pad',
  'fallen',
  'chains',
  'mul2',
  'mul3',
  'echo',
  'gamble',
  'drum',
])
  add('stack/' + def, (g) => {
    g.turn = 1;
    g.pending = 12;
    g.stackMin = 4;
    g.stackFrom = 0;
    g.side = 'D';
    g.flipBack = { pi: 0, seq: g.seq - 1 };
    const p = g.players[1];
    g.players[0].deals = ['double', 'mark', 'blood'];
    g.players[0].markT = 1;
    if (['mirror', 'mul2', 'mul3', 'echo'].includes(def)) {
      g.top.D = { c: 'p', v: 'd5' };
      const c = card(g, 'D', { c: 'w', v: def });
      p.hand.push(c);
      g.play(1, c.id, { color: 't' });
    } else if (def === 'shield') {
      p.shield = true;
      g.applyShield();
    } else if (def === 'gamble' || def === 'drum') {
      p.deals = [def];
      g.gamble(1, 2);
    } else {
      p.deals = [def];
      p.fallen = def === 'fallen';
      g.perks = { 1: [def] };
      g.draw(1);
    }
    for (let n = 0; n < 100 && g.debt; n++) g.draw(g.debt.pi);
    g.checkFlipBack();
  });
for (const side of ['L', 'D'])
  for (const [key, nums] of Object.entries({
    pair: [2, 2],
    twopair: [2, 2, 3, 3],
    three: [3, 3, 3],
    straight: [2, 3, 4, 5],
    straightflush: [1, 2, 3, 4, 5],
    fullhouse: [1, 1, 1, 2, 2],
    flush: [1, 3, 4, 7, 9],
    four: [4, 4, 4, 4],
    five: [5, 5, 5, 5, 5],
    joker: [5, 5, -1],
  }))
    add('combo/' + side + '/' + key, (g) => {
      g.side = side;
      g.turn = 0;
      const colors = g.colors();
      const cs = nums.map((n, i) =>
        card(
          g,
          side,
          n === -1
            ? { c: 'w', v: 'wild' }
            : { c: colors[['flush', 'straightflush'].includes(key) ? 0 : i % 4], v: String(n) },
        ),
      );
      g.color = colors[0];
      g.players[0].debt = 100;
      g.players[0].hand.push(...cs);
      g.play(0, cs[0].id, { extra: cs.slice(1).map((c) => c.id) });
    });
for (let seed = 1; seed <= 25; seed++)
  add('bots/' + seed, (g, Bot, trace) => {
    for (let i = 0; i < 6000 && g.winner === null; i++) {
      g.beginTurn();
      const owing = g.players.findIndex((_, j) => g.owes(j));
      if (owing >= 0) g.draw(owing);
      else if (g.offer) {
        const r = Bot.deal(g, g.offer.pi);
        g.resolveDeal(g.offer.pi, r.id, r.target);
      } else if (g.roulette !== null)
        g.resolveRoulette(Bot.bestColor(g, g.players[g.roulette].hand, g.side));
      else if (g.debt) g.draw(g.debt.pi);
      else {
        const pi = g.turn,
          m = Bot.choose(g, pi);
        if (m) g.play(pi, m.cardId, m);
        else if (g.drewBy === pi) g.pass(pi);
        else g.draw(pi);
      }
      trace.push([
        g.seq,
        g.evSeq,
        g.turn,
        g.pending,
        g.side,
        g.winner,
        g.players.map((p) => p.hand.length),
      ]);
    }
    if (g.winner === null) throw Error('Unfinished hand');
  });

for (let s = 0; s < 20; s++)
  add('slots/' + s, (g) => {
    for (let i = 0; i <= s; i++) g.rollChaos();
  });
for (const side of ['L', 'D'])
  for (const value of ['flip', 'dflip'])
    add('shift/' + side + '/' + value, (g) => {
      g.side = side;
      g.turn = 0;
      g.inflate = 3;
      g.lock = 3;
      g.multNext = 2;
      g.maze = 2;
      g.potato = { fuse: 1, cool: 0 };
      g.players[0].fx.rent = 0;
      g.players[0].deals = ['chains'];
      g.players[1].shield = true;
      const c = card(g, side, { c: g.colors()[0], v: value });
      g.color = g.colors()[0];
      g.players[0].hand.push(c);
      g.play(0, c.id, { color: g.colors()[0], flipColor: side === 'L' ? 'v' : 'y' });
      g.beginTurn();
      g.skipTurn(g.turn);
      g.checkFlipBack();
    });
for (const kind of [
  'angel',
  'demon',
  'blocked',
  'cross',
  'cap',
  'twoface',
  'fall',
  'threshold',
  'repeat',
  'bad',
  'dynamite',
  'lastCall',
])
  add('turn/' + kind, (g) => {
    g.turn = 0;
    const p = g.players[0];
    if (['angel', 'demon', 'blocked', 'cross', 'cap', 'twoface'].includes(kind)) {
      g.side = ['demon', 'twoface'].includes(kind) ? 'D' : 'L';
      p.angel = 100;
      p.demonX = 100;
      p.peace = true;
      p.dayAt = 'L';
      if (kind === 'blocked') p.angelBlock = 2;
      if (kind === 'cap') p.deals = ['rosary', 'grace'];
      if (kind === 'twoface') p.inv = ['twoface'];
      if (kind === 'cross') g.crossLeft = 3;
      g.beginTurn();
      if (g.offer) g.resolveDeal(0, g.offer.opts[0], 2);
    } else if (kind === 'fall') {
      p.deals = ['rosary', 'candle'];
      g.offer = { kind: 'dark', pi: 0, opts: ['double'] };
      g.resolveDeal(0, 'double', 1);
      g.hit(0, 1, 7);
      g.pending = 12;
      g.stackFrom = 1;
      g.draw(0);
    } else if (kind === 'threshold' || kind === 'repeat') {
      p.debt = 350;
      g.horseUsed = kind === 'repeat';
      for (let i = 0; i < 50; i++) {
        g.turn = i % 3;
        g.beginTurn();
      }
    } else if (kind === 'bad') {
      for (const v of ['leech', 'fuse']) p.hand.push(card(g, 'L', { c: 'x', v }));
      for (let i = 0; i < 3; i++) g.badTurn(0);
    } else if (kind === 'dynamite') {
      g.side = 'D';
      g.potato = { fuse: 1, cool: 0 };
      const c = card(g, 'D', { c: 't', v: '1' });
      p.hand.push(c);
      g.color = 't';
      g.play(0, c.id);
    } else {
      g.turnNo = 149;
      g.turn = 1;
      g.lastCallCheck();
    }
  });

export function seedOf(name) {
  return name.startsWith('bots/') ? +name.split('/')[1] : 5731;
}
export function runCase(name, api) {
  const random = api.random || seeded(seedOf(name)),
    names = ['A', 'B', 'C'],
    rules = {
      ...PRESETS.mayhem.rules,
      cards: { ...PRESETS.mayhem.cards },
      deals: names.map(() => ({ limit: 500, debt: 25 })),
    };
  const g = new api.Game(names, [0, 1, 2], rules, random),
    trace = [];
  cases.get(name)(g, api.Bot, trace);
  const snapshot = { ...g };
  for (const key of Object.keys(snapshot))
    if (typeof snapshot[key] === 'function' || key === 'nextId') delete snapshot[key];
  return digest({ trace, snapshot });
}
export function digest(value) {
  const normalize = (v) =>
    Array.isArray(v)
      ? v.map(normalize)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
              .map(([k, x]) => [k, normalize(x)]),
          )
        : v;
  return createHash('sha256')
    .update(JSON.stringify(normalize(value)))
    .digest('hex');
}
