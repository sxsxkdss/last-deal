import { hasDeal } from './contracts.ts';
import type { Game } from './game.ts';

export function ability(this: Game, pi, k, cards) {
  const p = this.players[pi];
  if (
    !p ||
    p.out ||
    this.turn !== pi ||
    this.winner !== null ||
    this.offer ||
    this.roulette !== null ||
    this.debt ||
    (this.pending > 0 && k !== 'puppet') ||
    this.owes(pi)
  )
    return false;
  if (k === 'confess' && this.hasL(p, 'confess') && !p.used.confess && Array.isArray(cards)) {
    const pick = [];
    for (const id of cards.slice(0, 3)) {
      const c = p.hand.find((x) => x.id === id && !x.lock && !x.uniq && !pick.includes(x));
      if (c) pick.push(c);
    }
    if (!pick.length || p.hand.length - pick.length < 1) return false;
    p.hand = p.hand.filter((c) => !pick.includes(c));
    p.used.confess = true;
    this.addLog(`${p.name} confesses: ${pick.length} cards are let go.`, 'win', 'confess', {
      n: p.name,
      k: pick.length,
    });
    this.ev('confess', { pi, k: pick.length });
    this.seq++;
    return true;
  }
  // Ascension: once a deal, with 6+ cards, two thirds of the hand turn into jokers
  if (k === 'wind' && this.hasL(p, 'wind') && !p.used.wind && p.hand.length >= 6) {
    const free = p.hand
      .filter((c) => !c.lock && !c.uniq && this.f(c).c !== 'w')
      .sort(() => this.random() - 0.5);
    const n2 = Math.min(free.length, Math.round((p.hand.length * 2) / 3));
    for (const c of free.slice(0, n2)) {
      c.L = { c: 'w', v: 'wild' };
      c.D = { c: 'w', v: 'wild' };
    }
    p.used.wind = true;
    this.addLog(`${p.name} ascends: ${n2} cards turn into jokers.`, 'win', 'swind', {
      n: p.name,
      k: n2,
    });
    this.ev('swind', { pi, k: n2 });
    this.seq++;
    return true;
  }
  // the Puppeteer: block the next player's turn, any number of times, never the same player twice running; 5 debt each
  if (k === 'puppet' && hasDeal(p, 'puppet')) {
    const t = this.nextIdx(pi, 1);
    if (t === pi || p.puppetLast === t || this.players[t].skipNext) return false;
    this.players[t].skipNext = true;
    p.puppetLast = t;
    this.payDebt(pi, 5, 'puppet');
    this.addLog(
      `${p.name} pulls the strings: ${this.players[t].name} will miss a turn.`,
      'bad',
      'puppet',
      { n: p.name, t: this.players[t].name },
    );
    this.ev('puppet', { pi, t });
    this.seq++;
    return true;
  }
  if (k === 'burn' && hasDeal(p, 'sharp')) {
    this.next = this.newCard();
    this.payDebt(pi, 5, 'sharp');
    this.addLog(`${p.name} burns the top card.`, 'stk', 'burn', { n: p.name });
    this.ev('burn', { pi });
    this.seq++;
    return true;
  }
  return false;
}
// bad cards in the hand of whoever starts a turn: leeches feed, fuses burn down (both only on the side showing)
