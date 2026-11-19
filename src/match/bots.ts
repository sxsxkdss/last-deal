import { Bot } from '../rules/bot.ts';
import type { Game } from '../rules/game.ts';

function botView(g: Game, seat: number) {
  const own = g.players[seat];
  return {
    players: g.players.map((p, i) => i === seat ? own : {
      out: p.out, deals: p.deals, skipNext: p.skipNext, hand: { length: p.hand.length },
    }),
    side: g.side,
    top: g.top,
    pending: g.pending,
    rules: { multi: g.rules.multi, combos: g.rules.combos },
    turn: g.turn,
    offer: g.offer?.pi === seat ? g.offer : null,
    random: g.random,
    f: g.f.bind(g),
    back: g.back.bind(g),
    nextIdx: g.nextIdx.bind(g),
    horseOn: (kind, variant, player = seat) => player === seat && g.horseOn(kind, variant, seat),
    hasL: (player, id) => player === own && g.hasL(own, id),
    canUseItem: (player, id) => player === seat && g.canUseItem(seat, id),
    playable: (player) => player === seat ? g.playable(seat) : [],
  };
}

export function nextBotJob(room) {
  const G = room.G,
    isBot = (i) => {
      const m = room.members[i];
      return !!(m && m.bot) && !G.players[i].out;
    };
  const rnd = (a, b) => a + room.random() * (b - a);
  // cards anyone owes are drawn automatically and quickly, one at a time, so everybody sees each card land
  // (stack pickups and penalties). Drawing until a color shows up stays by hand.
  const pace = (got) => Math.max(70, 170 - (got || 0) * 8);
  for (let i = 0; i < G.players.length; i++)
    if (!isBot(i) && G.owes(i)) return { wait: pace(0), run: () => G.draw(i) };
  if (G.debt && G.debt.n && !isBot(G.debt.pi) && G.roulette === null) {
    const v = G.debt.pi,
      got = G.debt.got;
    return { wait: pace(got), run: () => G.draw(v) };
  }
  // owed cards first (chaos tax, lost duel)
  for (let i = 0; i < G.players.length; i++)
    if (isBot(i) && G.owes(i)) return { wait: rnd(160, 260), run: () => G.draw(i) };
  if (G.roulette !== null && isBot(G.roulette)) {
    const v = G.roulette;
    return {
      wait: rnd(700, 1100),
      run: () => G.resolveRoulette(Bot.bestColor(botView(G, v), G.players[v].hand, G.side)),
    };
  }
  if (G.debt && isBot(G.debt.pi)) {
    const v = G.debt.pi;
    return { wait: rnd(140, 240), run: () => G.draw(v) };
  }
  if (G.offer) {
    if (!isBot(G.offer.pi)) return null; // a human is reading the contract
    const v = G.offer.pi;
    return {
      wait: rnd(1400, 2400),
      run: () => {
        const r = Bot.deal(botView(G, v), v);
        if (r) G.resolveDeal(v, r.id, r.target);
      },
    };
  }
  const pi = G.turn;
  if (!isBot(pi)) return null;
  return {
    wait: rnd(650, 1150),
    run: () => {
      const view = botView(G, pi);
      const it = Bot.item(view, pi);
      if (it && G.useItem(pi, it)) return;
      const ab = Bot.ability(view, pi);
      if (ab && G.ability(pi, ab.k, ab.cards)) return;
      const m = Bot.choose(view, pi, room.members[pi].profile);
      if (m) {
        G.play(pi, m.cardId, m);
        return;
      }
      if (G.drewBy === pi) {
        G.pass(pi);
        return;
      }
      if (G.canGamble(pi) && room.random() < 0.4) {
        G.gamble(pi, Bot.gambleTarget(view, pi));
        return;
      }
      G.draw(pi);
    },
  };
}
