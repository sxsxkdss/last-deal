import { EXTRA_CARDS, PRICES, TOKENS, debtValue } from '../rules/cards.ts';
import { canDark, canLight, hasDeal } from '../rules/contracts.ts';
import { Game } from '../rules/game.ts';
import { ITEMS, ITEM_PRICE } from '../rules/items.ts';
import type { MatchState } from './state.ts';
import type { Table } from './table.ts';
export function startGame(room: Table) {
  const players = room.members;
  if (players.length < 2) return 'Need at least 2 connected players.';
  const used = new Set();
  const names = players.map((m) => {
    let n = m.name,
      k = 2;
    while (used.has(n)) n = m.name.slice(0, 11) + ' ' + k++;
    used.add(n);
    return n;
  });

  room.M = null;
  if (room.mode === 'debt') {
    const n = names.length;
    room.M = {
      names,
      limit: room.limit,
      round: 0,
      phase: 'play',
      debt: Array(n).fill(0),
      chips: Array(n).fill(0),
      tokens: names.map(() => []),
      col: Array(n).fill(false),
      withdrawn: Array(n).fill(false),
      colUsed: Array(n).fill(false),
      setup: Array(n).fill(0),
      offers: names.map(() => []),
      done: Array(n).fill(false),
      pass: names.map(() => null),
      last: null,
      champ: null,
      deadline: 0,
      ds: names.map(() => ({ angel: 0, demon: 0, deals: [], fallen: false, markT: null })),
      carry: names.map(() => []),
      hist: names.map(() => [0]),
      horse: null,
      horseUsed: false,
      inv: names.map(() => []),
      dark: names.map(() => []),
      purchases: {},
      marketDebt: {},
    };
    newDeal(room);
    return null;
  }
  room.G = new Game(
    names,
    names.map((_, i) => i),
    { ...room.rules, cards: { ...room.cards } },
    room.random,
  );
  if (room.network) room.G.gid = room.network.gameId();
  return null;
}

// ================= DEBT MATCH =================
// draft -> deal -> settle (cards left = debt) -> shop -> next draft. Over the limit: you become the house's collector.
const DRAFT_MS = 30000,
  SHOP_MS = 45000;
const isBotSeat = (room: Table, i: number) => room.members[i].bot;
const alive = (M: MatchState) => M.col.map((c, i) => (c || M.withdrawn[i] ? -1 : i)).filter((i) => i >= 0);
export function matchFor(room: Table, seat) {
  const M = room.M;
  if (!M) return null;
  return {
    round: M.round,
    limit: M.limit,
    phase: M.phase,
    left: Math.max(0, M.deadline - room.clock.now),
    debt: M.debt,
    chips: M.chips,
    tokens: M.tokens,
    col: M.col,
    withdrawn: M.withdrawn,
    colUsed: seat !== null ? M.colUsed[seat] : true,
    setup: M.setup,
    offers: seat !== null ? M.offers[seat] : [],
    dark: seat !== null && M.dark ? M.dark[seat] : [],
    inv: M.inv,
    done: M.done,
    passed: seat !== null && !!M.pass[seat],
    last: M.last,
    champ: M.champ,
    limits: M.ds.map((d) => d.limitAdj || M.limit),
    hist: M.hist,
    war:
      room.warAt && room.G && room.G.horseOn('war', 'timer')
        ? [room.warPi, Math.max(0, room.warAt - room.clock.now - 1000)]
        : null,
    hope:
      seat !== null && M.ds[seat]
        ? [M.ds[seat].angel || 0, M.ds[seat].demon || 0, !canLight(M.ds[seat]), !canDark(M.ds[seat])]
        : null,
  };
}
export function phaseTimer(room: Table, ms, fn) {
  room.clock.cancel(room.phaseTimer);
  room.M.deadline = room.clock.now + ms;
  room.phaseTimer = room.clock.after(fn, ms);
}
export function houseCard(G: Game) {
  for (let k = 0; k < 80; k++) {
    const c = G.newCard();
    if (EXTRA_CARDS.includes(c.L.v) || EXTRA_CARDS.includes(c.D.v)) return c;
  }
  return G.newCard();
}
export function newDeal(room: Table) {
  const M = room.M,
    n = M.names.length;
  M.round++;
  const deals = M.ds.map((d, i) =>
    Object.assign({}, d, {
      inv: (M.inv || [])[i] || [],
      debt: M.debt[i],
      limit: hasDeal(d, 'bail') && d.limitAdj ? d.limitAdj : M.limit,
    }),
  );

  const G = new Game(
    M.names,
    M.names.map((_, i) => i),
    Object.assign({}, room.rules, {
      cards: Object.assign({}, room.cards),
      deals,
      perks: M.tokens,
      horse: M.horse,
      horseUsed: M.horseUsed,
      horseCount: M.horseCount || 0,
    }),
    room.random,
  );
  if (room.network) G.gid = room.network.gameId();
  for (let i = 0; i < n; i++) {
    const p = G.players[i];
    if (M.col[i] || M.withdrawn[i]) {
      p.hand = [];
      p.out = true;
      p.elim = true;
      p.collector = M.col[i] && !M.withdrawn[i];
      p.left = M.withdrawn[i];
      continue;
    }
    if (M.tokens[i].includes('light')) p.hand.pop();
    if (M.tokens[i].includes('license')) p.hand.push(houseCard(G));
    for (let k = 0; k < M.setup[i]; k++) p.hand.push(G.newCard());
    for (const v of M.carry[i] || []) {
      const c = G.newCard();
      c.L = { c: 'w', v };
      c.D = { c: 'w', v };
      c.uniq = true;
      p.hand.push(c);
    }
    M.carry[i] = [];
  }
  M.setup = Array(n).fill(0);
  if (G.players[G.turn].out) G.turn = G.nextIdx(G.turn, 1);
  G.turnNo = 0;
  room.G = G;
  M.colUsed = Array(n).fill(false);
  M.pass = M.names.map(() => null);
  M.done = Array(n).fill(false);
  M.phase = 'draft';
  // bots pass two cards they need least: numbers of their thinnest colour
  for (const i of alive(M))
    if (isBotSeat(room, i))
      room.clock.after(
        () => {
          if (room.M === M && room.G === G && M.phase === 'draft' && !M.pass[i]) {
            M.pass[i] = botPass(G, i);
            maybeEndDraft(room);
          }
        },
        1200 + room.random() * 2500,
      );
  phaseTimer(room, DRAFT_MS, () => endDraft(room));
  // bot collectors strike once, somewhere in the deal
  for (let i = 0; i < n; i++)
    if (M.col[i] && !M.withdrawn[i] && isBotSeat(room, i))
      room.clock.after(
        () => {
          if (room.M === M && room.G === G && M.phase === 'play' && G.winner === null && !M.colUsed[i]) {
            collector(room, i, room.random() < 0.6 ? 'give' : 'lever', null);
            room.sync();
          }
        },
        25000 + room.random() * 50000,
      );
}
export function botPass(G: Game, i: number) {
  const h = G.players[i].hand.filter((c) => !c.uniq);
  const cnt = {};
  for (const c of h) {
    const f = G.f(c);
    cnt[f.c] = (cnt[f.c] || 0) + 1;
  }
  // bad cards go first, then numbers of the thinnest colour
  h.sort((a, b) => {
    const fa = G.f(a),
      fb = G.f(b);
    const ba = fa.c === 'x' ? 0 : 1,
      bb = fb.c === 'x' ? 0 : 1;
    const na = /^\d$/.test(fa.v) ? 0 : 1,
      nb = /^\d$/.test(fb.v) ? 0 : 1;
    return ba - bb || na - nb || (cnt[fa.c] || 0) - (cnt[fb.c] || 0);
  });
  return h.slice(0, 2);
}
export function maybeEndDraft(room: Table) {
  const M = room.M;
  if (alive(M).every((i) => M.pass[i])) endDraft(room);
  else room.sync();
}
export function endDraft(room: Table) {
  const M = room.M,
    G = room.G;
  if (!M || M.phase !== 'draft') return;
  const live = alive(M);
  for (const i of live)
    if (!M.pass[i])
      M.pass[i] = G.players[i].hand
        .filter((c) => !c.uniq)
        .sort(() => room.random() - 0.5)
        .slice(0, 2);
  // the demonic joker (and every unique card) never changes hands
  const give = live.map((i) => ({
    to: G.nextIdx(i, 1),
    cards: M.pass[i].filter((c) => G.players[i].hand.includes(c) && !c.uniq),
  }));
  live.forEach((i, k) => {
    G.players[i].hand = G.players[i].hand.filter((c) => !give[k].cards.includes(c));
  });
  for (const g of give) G.players[g.to].hand.push(...g.cards);
  for (let k = 0; k < live.length; k++) if (give[k].cards.length) G.alms(live[k], give[k].cards.length);
  G.addLog('Everyone passes two cards along. The deal begins.', 'n', 'draftDone', {});
  M.phase = 'play';
  room.clock.cancel(room.phaseTimer);
  M.deadline = 0;
  room.sync();
}
export function settle(room: Table) {
  const M = room.M,
    G = room.G,
    live = alive(M);
  const rows = [];
  const paid = Array(M.names.length).fill(0),
    turnD = Array(M.names.length).fill(0);
  for (const i of live) {
    const p = G.players[i];
    turnD[i] = Math.max(0, (p.debt || 0) - M.debt[i]);
    M.carry[i] = p.hand.filter((c) => c.uniq).map((c) => G.f(c).v);
    // the demonic joker counts 35; every other unique card is free
    let vals = p.hand.filter((c) => !c.uniq || G.f(c).v === 'djoker').map((c) => debtValue(G.f(c)));
    if (M.tokens[i].includes('debtor'))
      vals = p.hand
        .filter((c) => (!c.uniq || G.f(c).v === 'djoker') && !/^\d$/.test(G.f(c).v))
        .map((c) => debtValue(G.f(c)));
    if (M.tokens[i].includes('safe')) vals.sort((a, b) => b - a).splice(0, 3);
    if (G.hasL(p, 'grace')) vals = vals.sort((a, b) => b - a).slice(4);
    paid[i] = i === G.winner ? 0 : vals.reduce((a, b) => a + b, 0);
    if (G.hasL(p, 'rosary')) paid[i] = Math.round(paid[i] * 0.7);
  }
  const total = paid.reduce((a, b) => a + b, 0);
  for (const i of live) {
    const p = G.players[i];
    let chips = (G.chipsWon && G.chipsWon[i]) || 0;
    if (i === G.winner) chips += 5 + Math.round(total * 0.1);
    if (M.tokens[i].includes('usurer'))
      chips += Math.round(paid[live[(live.indexOf(i) + 1) % live.length]] * 0.1);
    M.chips[i] += chips;
    M.debt[i] = (p.debt || 0) + paid[i];
    M.ds[i] = {
      angel: p.angel,
      demon: p.demon,
      demonX: p.demonX || 0,
      deals: (p.deals || []).slice(),
      fallen: p.fallen,
      markT: p.markT,
      exT: p.exT,
      buff: p.buff || 0,
      limitAdj: hasDeal(p, 'bail') ? p.limit : 0,
      angelSlow: p.angelSlow || 0,
      tookLight: !!p.tookLight,
      noAngel: !!p.noAngel,
      djGiven: !!p.djGiven,
    };
    M.inv[i] = (p.inv || []).slice();
    rows.push({ i, cards: p.hand.length, paid: paid[i], turn: turnD[i], chips });
    M.hist[i].push(M.debt[i]);
  }
  M.horse = G.horse && G.horse.left > 0 ? G.horse : null;
  M.horseUsed = !!G.horseUsed;
  M.horseCount = G.horseCount || 0;
  const out = live.filter((i) => M.debt[i] > (M.ds[i].limitAdj || M.limit));
  for (const i of out) M.col[i] = true;
  M.last = { round: M.round, winner: G.winner, rows, out };
  afterChange(room, () => openShop(room));
}
// the match ends when one player (or none) is left under the limit
export function afterChange(room: Table, next) {
  const M = room.M,
    live = alive(M);
  if (live.length <= 1) {
    M.phase = 'over';
    room.clock.cancel(room.phaseTimer);
    M.deadline = 0;
    const eligible = M.debt.map((_, i) => i).filter((i) => !M.withdrawn[i]);
    M.champ = live[0] ?? eligible.reduce<number | null>((best, i) => best === null || M.debt[i] < M.debt[best] ? i : best, null);
    return true;
  }
  next();
  return false;
}
export function openShop(room: Table) {
  const M = room.M;
  M.phase = 'shop';
  M.done = M.names.map((_, i) => M.col[i] || M.withdrawn[i]);
  M.offers = M.tokens.map((owned) =>
    TOKENS.filter((id) => !owned.includes(id))
      .sort(() => room.random() - 0.5)
      .slice(0, 3),
  );
  // the Dark shop: after every deal, three fresh items of its own for each player
  M.dark = M.names.map(() =>
    ITEMS.slice()
      .sort(() => room.random() - 0.5)
      .slice(0, 3),
  );
  const stock = M.dark;
  for (const i of alive(M))
    if (isBotSeat(room, i))
      room.clock.after(
        () => {
          if (room.M === M && M.dark === stock && M.phase === 'shop') {
            botShop(M, i);
            M.done[i] = true;
            maybeEndShop(room);
          }
        },
        2500 + room.random() * 4000,
      );
  phaseTimer(room, SHOP_MS, () => endShop(room));
}
export function botShop(M: MatchState, i: number) {
  for (const id of M.dark[i].slice()) buy(M, i, { k: 'item', id });
  while (
    M.offers[i].length &&
    M.chips[i] >= PRICES.token &&
    M.tokens[i].length < 3 &&
    M.debt[i] < M.limit * 0.6
  )
    buy(M, i, { k: 'token', id: M.offers[i][0] });
  while (M.chips[i] >= PRICES.pay && M.debt[i] > 0) buy(M, i, { k: 'pay' });
}
export function buy(M: MatchState, i: number, a: { k: string; id?: string; target?: number }) {
  const affected = a.k === 'interest' ? a.target : i;
  const before = M.debt[affected];
  if (!applyPurchase(M, i, a)) return false;
  const key = a.id && (a.k === 'token' || a.k === 'item') ? a.k + ':' + a.id : a.k;
  M.purchases[key] = (M.purchases[key] ?? 0) + 1;
  const change = M.debt[affected] - before;
  if (change) {
    const debt = M.marketDebt[a.k] ??= { added: 0, removed: 0 };
    debt.added += Math.max(0, change);
    debt.removed += Math.max(0, -change);
  }
  return true;
}

function applyPurchase(M: MatchState, i: number, a: { k: string; id?: string; target?: number }) {
  if (M.phase !== 'shop' || M.col[i] || M.withdrawn[i] || M.done[i]) return false;
  if (a.k === 'token') {
    if (!M.offers[i].includes(a.id) || M.chips[i] < PRICES.token || M.tokens[i].length >= 3)
      return false;
    M.chips[i] -= PRICES.token;
    M.tokens[i].push(a.id);
    M.offers[i] = M.offers[i].filter((x) => x !== a.id);
    return true;
  }
  if (a.k === 'pay') {
    if (M.chips[i] < PRICES.pay || M.debt[i] <= 0) return false;
    M.chips[i] -= PRICES.pay;
    M.debt[i] = Math.max(0, M.debt[i] - PRICES.payAmount);
    return true;
  }
  if (a.k === 'item') {
    if (!M.dark[i].includes(a.id) || M.chips[i] < ITEM_PRICE[a.id]) return false;
    M.chips[i] -= ITEM_PRICE[a.id];
    M.inv[i].push(a.id);
    M.dark[i] = M.dark[i].filter((x) => x !== a.id);
    return true;
  }
  if (a.k === 'candle') {
    const d = M.ds[i];
    if (M.chips[i] < PRICES.candle || !canLight(d)) return false;
    M.chips[i] -= PRICES.candle;
    d.angel = Math.min(25, (d.angel || 0) + 5);
    return true;
  }
  if (a.k === 'blood') {
    const d = M.ds[i];
    if (M.chips[i] < PRICES.blood || !canDark(d)) return false;
    M.chips[i] -= PRICES.blood;
    d.demonX = (d.demonX || 0) + 10;
    d.fresh = true;
    return true;
  }
  if (a.k === 'setup' || a.k === 'interest') {
    const t = a.target;
    if (!Number.isInteger(t) || t === i || !M.names[t] || M.col[t] || M.withdrawn[t] || M.chips[i] < PRICES[a.k])
      return false;
    M.chips[i] -= PRICES[a.k];
    if (a.k === 'setup') M.setup[t] += 3;
    else M.debt[t] += Math.max(10, Math.ceil(M.debt[t] * 0.1));
    return true;
  }
  return false;
}
export function maybeEndShop(room: Table) {
  const M = room.M;
  if (M.done.every(Boolean)) endShop(room);
  else room.sync();
}
export function endShop(room: Table) {
  const M = room.M;
  if (!M || M.phase !== 'shop') return;
  for (const i of alive(M))
    if (M.debt[i] > (M.ds[i].limitAdj || M.limit)) {
      M.col[i] = true;
      M.last.out.push(i);
    }
  afterChange(room, () => newDeal(room));
  room.sync();
}
export function collector(room: Table, i, k, target) {
  const M = room.M,
    G = room.G;
  if (!M || !G || M.phase !== 'play' || G.winner !== null || !M.col[i] || M.colUsed[i]) return;
  if (k === 'give') {
    if (!Number.isInteger(target) || M.col[target] || G.players[target].out) {
      const l = alive(M).filter((j) => !G.players[j].out);
      if (!l.length) return;
      target = l.reduce((a, b) => (G.players[b].hand.length < G.players[a].hand.length ? b : a));
    }
    G.players[target].oweN = (G.players[target].oweN || 0) + 2;
    G.addLog(`The collector ${M.names[i]} slips ${M.names[target]} two cards.`, 'bad', 'colGive', {
      n: M.names[i],
      t: M.names[target],
    });
    G.ev('colgive', { pi: i, t: target });
  } else {
    G.addLog(`The collector ${M.names[i]} pulls the lever.`, 'n', 'colLever', { n: M.names[i] });
    G.rollChaos();
  }
  M.colUsed[i] = true;
  G.seq++;
}
