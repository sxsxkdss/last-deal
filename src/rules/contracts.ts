import type { Game } from './game.ts';

// ---- deals: the angel (light, by day) and the demon (dark, by night). One active at a time, one of each per match. ----
// ids kept from the old set where the deal stayed; 'wind' is Ascension now, 'sharp' the Cardsharp
export const LIGHT_DEALS = [
  'confess',
  'candle',
  'penance',
  'wind',
  'clean',
  'grace',
  'alms',
  'guardian',
  'halo',
  'rosary',
];
export const DARK_DEALS = [
  'usury',
  'double',
  'chains',
  'exactor',
  'bail',
  'mark',
  'blood',
  'nighttax',
  'drum',
  'desecrate',
  'puppet',
  'sharp',
  'devour',
];
// strength 1-4, for balance only (the bots use it to rank); deals are offered evenly at random
export const DEAL_TIER = {
  confess: 1,
  candle: 2,
  penance: 2,
  wind: 2,
  clean: 3,
  grace: 3,
  alms: 3,
  guardian: 4,
  halo: 4,
  rosary: 4,
  usury: 1,
  double: 2,
  chains: 2,
  exactor: 2,
  bail: 3,
  mark: 3,
  blood: 3,
  nighttax: 3,
  drum: 3,
  desecrate: 3,
  puppet: 3,
  sharp: 4,
  devour: 4,
};
export const DEAL_TARGET = ['mark', 'exactor']; // deals that name a rival when signed
// per-turn debt: at the start of your turn you pay for every card past the free ones
export const DEBT_TURN = { free: 10, rate: 0.5, cap: 4 };
// the angel: +0.5% a quiet day turn up to 25%; an attack halves it and stalls it for 2 turns; taking a 5+ stack +1%
export const ANGEL_STEP = 0.5,
  ANGEL_CAP = 25,
  ANGEL_BLOCK = 2,
  ANGEL_STACK = 1;
// the demon: a rival takes 5+ cards from your attack: 8% + 2% per card past 5; +1% each night; +2% a turn with 15+ cards; +3% per 25% of the limit in debt
export const DEMON_BASE = 8,
  DEMON_STEP = 2,
  DEMON_MIN = 5,
  DEMON_NIGHT = 1,
  DEMON_BIG = 2,
  DEMON_DEBT = 3,
  FALL_DEMON = 5;
export const CROSS_TURNS = 15,
  DJ_VALUE = 35;
// several deals can be held at once: up to 2 from the angel, up to 3 from the demon
export const DEAL_MAX = { light: 2, dark: 3 };
export function hasDeal(p, id) {
  return !!(p && p.deals && p.deals.includes(id));
}
export function nLight(p) {
  return p && p.deals ? p.deals.filter((d) => LIGHT_DEALS.includes(d)).length : 0;
}
// Desecration takes no slot
export function nDark(p) {
  return p && p.deals ? p.deals.filter((d) => DARK_DEALS.includes(d) && d !== 'desecrate').length : 0;
}
export function canLight(p) {
  return !p.fallen && !p.noAngel && nLight(p) < DEAL_MAX.light;
}
// what the demon can offer: Desecration only to someone who never took a light deal
export function darkPool(p) {
  return DARK_DEALS.filter((d) => !hasDeal(p, d) && (d !== 'desecrate' || !p.tookLight));
}
// attack multipliers add up instead of multiplying: x2 and x2 make x3
export const multSum = (ms) => 1 + ms.reduce((a, m) => a + (m - 1), 0);
// one deal signed per hand dealt: after that the visitors wait for the next deal
export function offerOpen(p) {
  return !p.signedNow;
}
export function canDark(p) {
  return nDark(p) < DEAL_MAX.dark;
}
export function hasL(this: Game, p, id) {
  return hasDeal(p, id) && !(this.crossLeft > 0);
}
// the attacker's multiplier (Heavy Hand; the Fangs of the fallen on the first attack that lands in a deal)
export function dmul(this: Game, pi, landing = undefined) {
  const p = this.players[pi];
  if (!p) return 1;
  const ms = [];
  if (hasDeal(p, 'double')) ms.push(2);
  if (landing && p.fallen && !p.used.fangs) ms.push(2);
  return multSum(ms);
}
// the first attack of a deal that really lands spends the Fangs
export function spendFangs(this: Game, pi) {
  const p = this.players[pi];
  if (p && p.fallen && !p.used.fangs) {
    p.used.fangs = true;
    this.ev('fangs', { pi });
  }
}
// "+X% of your debt (at least N)"
export function pctDebt(this: Game, p, x, min) {
  return Math.max(min, Math.ceil((p.debt || 0) * x));
}
// chained cards: never more than half the hand
export function chainUp(this: Game, p, cards, turns = undefined) {
  const cap = Math.floor(p.hand.length / 2) - p.hand.filter((c) => c.lock || c.chain).length;
  let n = 0;
  for (const c of cards) {
    if (n >= cap) break;
    if (c.lock || c.chain) continue;
    if (turns) c.chain = turns;
    else c.lock = true;
    n++;
  }
  return n;
}
// the deal starts: Eternal Debtor and the Exactor collect
export function dealStart(this: Game) {
  this.players.forEach((p, i) => {
    if (p.out || !(p.limit > 0)) return;
    if (hasDeal(p, 'usury')) {
      this.payDebt(i, 5, 'usury');
      this.players.forEach((q, j) => {
        if (j !== i && !q.out && q.limit > 0) this.payDebt(j, 10, 'usury');
      });
    }
    if (
      hasDeal(p, 'exactor') &&
      Number.isInteger(p.exT) &&
      this.players[p.exT] &&
      !this.players[p.exT].out
    ) {
      const t = this.players[p.exT];
      this.payDebt(p.exT, this.pctDebt(t, 0.1, 15), 'exactor');
    }
  });
}
// Alms: 8 off your debt for every card you give away, 2 cards an action at most, 32 a deal
export function alms(this: Game, pi, n) {
  const p = this.players[pi];
  if (!p || !this.hasL(p, 'alms')) return 0;
  const left = 32 - (p.used.alms || 0),
    k = Math.min(left, 8 * Math.min(2, n));
  if (k <= 0) return 0;
  p.used.alms = (p.used.alms || 0) + k;
  this.payDebt(pi, -k, 'alms');
  return k;
}
export function payDebt(this: Game, pi, amt, why) {
  const p = this.players[pi];
  if (!p) return 0;
  if (amt > 0 && this.hasL(p, 'rosary')) amt = Math.round(amt * 0.7);
  p.debt = Math.max(0, Math.round((p.debt || 0) + amt));
  if (amt) this.ev('debt', { pi, k: amt, why });
  return amt;
}
// a player used an attack card: the angel turns away, Double Strike charges its price
export function attacked(this: Game, pi) {
  const p = this.players[pi];
  if (!p) return;
  p.peace = false;
  p.angel = (p.angel || 0) / 2;
  p.angelBlock = ANGEL_BLOCK;
  if (hasDeal(p, 'double')) this.payDebt(pi, this.pctDebt(p, 0.05, 5), 'double');
}
// cards forced on someone by an attack: deals bend the number, then the demon and friends take note
export function hit(this: Game, from, to, n) {
  const a = this.players[from],
    t = this.players[to];
  if (!t || t.out || n <= 0) return 0;
  if (from === to || !a) {
    t.oweN = (t.oweN || 0) + n;
    return n;
  }
  const ms = [this.dmul(from, true)];
  if (hasDeal(t, 'chains')) ms.push(1.5);
  n = Math.ceil(n * multSum(ms));
  if (this.horseOn('war', 'fury', to)) n += 3;
  if (hasDeal(a, 'mark') && a.markT === to) n += 2;
  if (hasDeal(t, 'mark') && t.markT === from) n += 2;
  if (this.hasL(t, 'guardian') && !t.used.guardian) {
    t.used.guardian = true;
    a.oweN = (a.oweN || 0) + n;
    this.addLog(`${t.name}'s guardian turns the hit back on ${a.name}: +${n}.`, 'win', 'guardian', {
      n: t.name,
      t: a.name,
      k: n,
    });
    this.ev('guardian', { pi: to, t: from, k: n });
    return 0;
  }
  t.oweN = (t.oweN || 0) + n;
  this.spendFangs(from);
  this.afterHit(from, to, n);
  return n;
}
export function afterHit(this: Game, from, to, n) {
  const a = this.players[from];
  if (!a || from === to || from < 0) return;
  if (n >= DEMON_MIN && canDark(a) && !a.out) {
    const ch = DEMON_BASE + (n - DEMON_MIN) * DEMON_STEP;
    if (ch > (a.demon || 0)) {
      a.demon = ch;
      this.ev('demonCharge', { pi: from, k: this.demonChance(from) });
    }
  }
  if (hasDeal(a, 'blood')) {
    if (this.chipsWon) this.chipsWon[from] += n;
    this.payDebt(to, 2 * n, 'blood');
  }
  if (n >= 10)
    this.players.forEach((q, i) => {
      if (i !== to && !q.out && hasDeal(q, 'devour')) this.payDebt(i, -10, 'devour');
    });
}
// a stack lands on pi; returns true if a guardian bounced it back to whoever sent it
export function takeStack(this: Game, pi, sf) {
  const p = this.players[pi],
    a = sf >= 0 ? this.players[sf] : null;
  if (this.horseOn('war', 'fury', pi)) this.pending += 3;
  if (a && sf !== pi) {
    if (hasDeal(p, 'chains')) this.pending = Math.ceil(this.pending * 1.5);
    // the Fangs: the stack is the attack landing; the attacker's first of the deal doubles (added to Heavy Hand, never multiplied)
    if (a.fallen && !a.used.fangs) {
      this.pending = Math.ceil(this.pending * (hasDeal(a, 'double') ? 1.5 : 2));
      this.spendFangs(sf);
    }
    if (hasDeal(a, 'mark') && a.markT === pi) this.pending += 2;
    if (hasDeal(p, 'mark') && p.markT === sf) this.pending += 2;
    if (this.hasL(p, 'guardian') && !p.used.guardian && !a.out) {
      p.used.guardian = true;
      const n = this.pending;
      a.oweN = (a.oweN || 0) + n;
      this.addLog(`${p.name}'s guardian turns the +${n} stack back on ${a.name}.`, 'win', 'guardian', {
        n: p.name,
        t: a.name,
        k: n,
      });
      this.ev('guardian', { pi, t: sf, k: n });
      this.pending = 0;
      this.stackMin = 0;
      this.stackFrom = -1;
      this.drewBy = -1;
      this.turn = this.nextIdx(pi, 1);
      this.applyShield();
      this.checkFlipBack();
      return true;
    }
  }
  if (this.hasL(p, 'halo') && !p.used.halo) {
    p.used.halo = true;
    this.pending = Math.ceil(this.pending / 2);
    this.addLog(`${p.name}'s halo takes half the hit: +${this.pending}.`, 'win', 'halo', {
      n: p.name,
      k: this.pending,
    });
    this.ev('halo', { pi, k: this.pending });
  }
  // the Burning Veil of the fallen: the first stack of the deal that reaches you splits, the rest goes to a random rival
  if (p.fallen && !p.used.veil && this.pending > 1) {
    const rivals = this.players.map((q, i) => i).filter((i) => i !== pi && !this.players[i].out);
    if (rivals.length) {
      p.used.veil = true;
      const half = Math.floor(this.pending / 2),
        to = rivals[Math.floor(this.random() * rivals.length)];
      this.pending -= half;
      this.players[to].oweN = (this.players[to].oweN || 0) + half;
      this.addLog(
        `${p.name}'s burning veil throws ${half} of the stack on ${this.players[to].name}.`,
        'bad',
        'veilBurn',
        { n: p.name, t: this.players[to].name, k: half },
      );
      this.ev('veilBurn', { pi, t: to, k: half });
    }
  }
  // taking a big stack moves the angel a little
  if (this.pending >= 5 && canLight(p) && !(this.crossLeft > 0))
    p.angel = Math.min(ANGEL_CAP, (p.angel || 0) + ANGEL_STACK);
  return false;
}
// per-turn debt for pi's hand right now
export function turnDebt(this: Game, pi) {
  const p = this.players[pi];
  const counted = p.hand.filter((c) => {
    if (c.uniq) return false;
    if (!this.hasL(p, 'clean')) return true;
    const f = this.f(c);
    return !(/^\d$/.test(f.v) && f.c !== 'w');
  }).length;
  let d = Math.min(DEBT_TURN.cap, Math.max(0, counted - DEBT_TURN.free) * DEBT_TURN.rate);
  if (this.players.some((q, i) => i !== pi && !q.out && hasDeal(q, 'usury'))) d *= 1.5;
  // Blood Chips and the Exactor both cost 1.25x: added, not multiplied
  d *= multSum([hasDeal(p, 'blood') ? 1.25 : 1, hasDeal(p, 'exactor') ? 1.25 : 1]);
  if (p.fx.shell) d *= 0.8;
  if (p.fx.veil && this.side === 'D') d *= 0.6;
  if (p.fx.dawn && this.side === 'L') d *= 0.6;
  return Math.round(d);
}
// Called after every action (server, simulator): runs the start of the current player's turn once.
// Debt for the hand, chains, the angel's patience, the demon's charge, a puppet's skip.
