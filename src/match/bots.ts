import { Bot } from '../rules/bot.ts';
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
      run: () => G.resolveRoulette(Bot.bestColor(G, G.players[v].hand, G.side)),
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
        const r = Bot.deal(G, v);
        if (r) G.resolveDeal(v, r.id, r.target);
      },
    };
  }
  const pi = G.turn;
  if (!isBot(pi)) return null;
  return {
    wait: rnd(650, 1150),
    run: () => {
      const it = Bot.item(G, pi);
      if (it && G.useItem(pi, it)) return;
      const ab = Bot.ability(G, pi);
      if (ab && G.ability(pi, ab.k, ab.cards)) return;
      const m = Bot.choose(G, pi);
      if (m) {
        G.play(pi, m.cardId, m);
        return;
      }
      if (G.drewBy === pi) {
        G.pass(pi);
        return;
      }
      if (G.canGamble(pi) && room.random() < 0.4) {
        G.gamble(pi, Bot.gambleTarget(G, pi));
        return;
      }
      G.draw(pi);
    },
  };
}
