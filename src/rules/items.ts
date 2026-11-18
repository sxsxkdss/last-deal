import { Bot } from './bot.ts';
import { cardCode, other } from './cards.ts';
import {
  CROSS_TURNS,
  LIGHT_DEALS,
  canDark,
  canLight,
  darkPool,
  hasDeal,
  offerOpen,
} from './contracts.ts';
import type { Game } from './game.ts';

// ---- the Dark shop's items: kept in a separate inventory, used by hand at any moment (two trigger on their own) ----
export const ITEMS = ['rent', 'veil', 'dawn', 'shell', 'oven', 'eclipse', 'twoface', 'ward'];
export const ITEM_PRICE = {
  rent: 10,
  veil: 25,
  dawn: 25,
  shell: 25,
  oven: 25,
  eclipse: 25,
  twoface: 40,
  ward: 25,
  penance: 0,
  bail: 0,
  cross: 0,
};
// items that come from deals, never from the shop
export const DEAL_ITEMS = ['penance', 'bail', 'cross'];
export const ITEM_AUTO = { twoface: true }; // fires by itself when a deal is offered
export function dealBonus(this: Game, pi) {
  const p = this.players[pi];
  return (
    (p.buff || 0) + (p.fx.veil && this.side === 'D' ? 2 : 0) + (p.fx.dawn && this.side === 'L' ? 2 : 0)
  );
}
export function canUseItem(this: Game, pi, id) {
  const p = this.players[pi];
  if (!p || p.out || this.winner !== null || this.offer || !p.inv.includes(id) || ITEM_AUTO[id])
    return false;
  if (p.fx[id] !== undefined && id !== 'eclipse' && id !== 'oven' && !DEAL_ITEMS.includes(id))
    return false; // already running this hand
  if (id === 'oven' && p.hand.length < 30) return false;
  if (id === 'cross' && this.crossLeft > 0) return false; // one cross at a time
  if (id === 'penance' && this.crossLeft > 0) return false; // an angel's gift
  if ((id === 'penance' || id === 'bail') && !(p.debt > 0)) return false;
  return true;
}
export function useItem(this: Game, pi, id) {
  if (!this.canUseItem(pi, id)) return false;
  const p = this.players[pi];
  p.inv.splice(p.inv.indexOf(id), 1);
  this.seq++;
  this.addLog(`${p.name} uses ${id}.`, 'n', 'item', { n: p.name, it: id });
  this.ev('item', { pi, id });
  switch (id) {
    case 'rent':
      p.fx.rent = 0;
      break;
    case 'penance':
    case 'bail':
      this.payDebt(pi, -Math.round(p.debt * 0.4), id);
      break;
    case 'cross':
      this.crossLeft = CROSS_TURNS;
      this.ev('cross', { pi, k: CROSS_TURNS });
      break;
    case 'veil':
    case 'dawn':
    case 'shell':
    case 'ward':
      p.fx[id] = true;
      break;
    case 'oven': {
      const pool = p.hand.filter((c) => !c.uniq),
        n = Math.floor(p.hand.length / 2);
      const burn = pool.sort(() => this.random() - 0.5).slice(0, n);
      p.hand = p.hand.filter((c) => !burn.includes(c));
      for (const c of burn) {
        this.pile.splice(Math.max(0, this.pile.length - 1), 0, cardCode(c) + '!' + c.id);
        this.pileN++;
      }
      if (this.pile.length > 6) this.pile.splice(0, this.pile.length - 6);
      this.addLog(`The oven eats ${burn.length} of ${p.name}'s cards.`, 'win', 'oven', {
        n: p.name,
        k: burn.length,
      });
      this.ev('oven', { pi, k: burn.length });
      break;
    }
    case 'eclipse': {
      this.side = other(this.side);
      const nf = this.f(this.top);
      this.color = nf.c === 'w' || nf.c === 'x' ? Bot.bestColor(this, p.hand, this.side) : nf.c;
      this.addLog(
        `Eclipse: ${p.name} turns the table to the ${this.side === 'D' ? 'dark' : 'light'} side.`,
        'flip',
        'eclipse',
        { n: p.name, dk: this.side === 'D' ? 1 : 0 },
      );
      this.ev('flip', { side: this.side });
      const dark = this.side === 'D',
        tf = p.inv.includes('twoface');
      const ok = dark
        ? (canDark(p) && offerOpen(p)) || tf
        : !(this.crossLeft > 0) && ((canLight(p) && offerOpen(p)) || (tf && !p.fallen && !p.noAngel));
      if (ok && this.random() < 0.25) {
        this.offer = {
          pi,
          kind: dark ? 'dark' : 'light',
          opts: this.pickTwo(dark ? darkPool(p) : LIGHT_DEALS.filter((d) => !hasDeal(p, d))),
        };
        this.addLog(
          `${dark ? 'The demon' : 'The angel'} comes to ${p.name}.`,
          'n',
          dark ? 'demonCome' : 'angelCome',
          { n: p.name },
        );
        this.ev('offer', { pi, kind: this.offer.kind });
        this.twoFace();
      } else {
        p.buff = (p.buff || 0) + 5;
        this.ev('eclipseMiss', { pi, k: p.buff });
      }
      break;
    }
  }
  return true;
}
// Two-faced fires by itself on an offer: both visitors lay out their deals, pick any one
export function twoFace(this: Game) {
  const o = this.offer;
  if (!o || o.kind === 'both') return;
  const p = this.players[o.pi];
  if (!p.inv.includes('twoface')) return;
  p.inv.splice(p.inv.indexOf('twoface'), 1);
  o.kind = 'both';
  o.opts = (p.noAngel ? [] : this.pickTwo(LIGHT_DEALS.filter((d) => !hasDeal(p, d)))).concat(
    this.pickTwo(darkPool(p)),
  );
  this.addLog(`${p.name} is two-faced: both visitors lay out their deals.`, 'n', 'twoface', {
    n: p.name,
  });
  this.ev('item', { pi: o.pi, id: 'twoface' });
}
// Ward fires by itself while a horseman rides, and keeps its owner out of reach for the rest of the hand
export function wardCheck(this: Game) {
  if (!this.horse || this.horse.left <= 0) return;
  this.players.forEach((p, i) => {
    if (p.out || p.fx.ward || !p.inv.includes('ward')) return;
    p.inv.splice(p.inv.indexOf('ward'), 1);
    p.fx.ward = true;
    this.addLog(`${p.name}'s ward holds the horseman off.`, 'win', 'ward', { n: p.name });
    this.ev('item', { pi: i, id: 'ward' });
  });
}
// Rent: +3 chips for every change of day and night, up to 10 times a hand
export function rentPay(this: Game) {
  this.players.forEach((p, i) => {
    if (p.fx && p.fx.rent !== undefined && p.fx.rent < 10 && this.chipsWon) {
      p.fx.rent++;
      this.chipsWon[i] += 3;
      this.ev('rent', { pi: i, k: p.fx.rent });
    }
  });
}
// the deals you use by hand, on your own turn
