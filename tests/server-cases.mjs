import { PRESETS } from '../src/rules/cards.ts';
import { seeded } from '../src/match/clock.ts';
/** Inputs shared by the pinned server and the local match. Timers fire in separate clock tests. */
export function serverFlow(api, legacy = false) {
  const names = ['A', 'B', 'C'],
    rng = seeded(404),
    room = {
      random: rng,
      members: names.map((name) => ({ name, token: name, bot: false })),
      order: names,
      clock: {
        now: 0,
        after() {
          return 1;
        },
        cancel() {},
      },
      sync() {},
      mode: 'debt',
      limit: 250,
      ...PRESETS.den,
    };
  if (legacy) room.members = new Map(room.members.map((m) => [m.token, m]));
  api.startGame(room);
  const { G, M } = room,
    result = {};
  const hands = (g) => g.players.map((p) => p.hand.map((c) => [c.L, c.D, !!c.uniq]));
  result.deal = hands(G);
  M.pass = G.players.map((p, i) => api.botPass(G, i));
  api.endDraft(room);
  result.draft = hands(G);
  G.winner = 0;
  G.players[0].hand = [];
  G.players[1].debt = 40;
  G.players[2].debt = 260;
  G.players[1].deals = ['grace', 'rosary'];
  G.players[1].inv = ['ward'];
  G.players[1].hand.push({
    L: { c: 'w', v: 'djoker' },
    D: { c: 'w', v: 'djoker' },
    id: 1001,
    uniq: true,
  });
  G.horse = { k: 'death', v: 'curse', left: 3, fresh: false, curses: ['dark', 'mirror', 'static'] };
  G.horseUsed = true;
  api.settle(room);
  result.settlement = {
    last: M.last,
    history: M.hist.map((h) => [...h]),
    debt: [...M.debt],
    chips: [...M.chips],
    carry: M.carry.map((h) => [...h]),
    col: [...M.col],
    phase: M.phase,
  };
  M.chips[0] = 150;
  M.dark[0] = ['rent', 'oven', 'eclipse'];
  result.buys = ['item', 'item', 'setup', 'interest', 'candle', 'blood', 'pay'].map((k) =>
    api.buy(M, 0, { k, id: 'rent', target: 1 }),
  );
  result.accounts = {
    balances: M.chips.slice(),
    debt: M.debt.slice(),
    setup: M.setup.slice(),
    inv: M.inv.map((a) => [...a]),
  };
  api.endShop(room);
  const next = room.G;
  result.next = {
    round: M.round,
    phase: M.phase,
    count: next.players.map((p) => p.hand.length),
    horse: next.horse,
    inv: next.players.map((p) => p.inv.slice()),
    unique: next.players[1].hand.filter((c) => c.uniq).map((c) => c.L.v),
    out: next.players.map((p) => p.out),
  };
  M.phase = 'play';
  api.collector(room, 2, 'give', 1);
  api.collector(room, 2, 'give', 1);
  result.collector = { owe: next.players[1].oweN, used: M.colUsed.slice() };
  next.winner = 0;
  next.players[1].debt = 500;
  api.settle(room);
  result.final = { champ: M.champ, phase: M.phase, col: M.col.slice() };
  return result;
}
