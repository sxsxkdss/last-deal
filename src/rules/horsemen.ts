import { ATTACK_FACES, ATTACK_VALS, DRAW_VAL, faceName } from './cards.ts';
import type { Game } from './game.ts';

// ---- the Horsemen: once per match, when anyone's debt reaches 70% of their limit, one rides in for 10 table turns ----
export const HORSEMEN = {
  death: ['curse'],
  war: ['timer', 'fury', 'arms'],
  famine: ['two', 'tithe'],
  plague: ['blank', 'rot'],
};
export const CURSES = ['dark', 'fever', 'mirror', 'static'];
export const HORSE_TURNS = 10,
  HORSE_AT = 0.7,
  HORSE_AGAIN = 0.05,
  WAR_SECS = 4;
export function horseOn(this: Game, k, v = null, pi = null) {
  const h = this.horse;
  if (pi != null && this.players[pi] && this.players[pi].fx && this.players[pi].fx.ward) return false;
  return !!(h && h.left > 0 && h.k === k && (!v || h.v === v));
}
export function warded(this: Game, pi) {
  return !!(this.players[pi] && this.players[pi].fx && this.players[pi].fx.ward);
}
export function horseCheck(this: Game) {
  if (this.horse && this.horse.left > 0) return;
  let who;
  if (!this.horseUsed) {
    who = this.players.findIndex((p) => !p.out && p.limit > 0 && (p.debt || 0) >= p.limit * HORSE_AT);
    if (who < 0) return;
  } else {
    // after the first one, any turn may bring another (5%)
    if (!this.players.some((p) => p.limit > 0) || this.random() >= HORSE_AGAIN) return;
    who = this.turn;
  }
  const ks = Object.keys(HORSEMEN),
    k = ks[Math.floor(this.random() * ks.length)];
  const vs = HORSEMEN[k],
    v = vs[Math.floor(this.random() * vs.length)];
  this.horse = {
    k,
    v,
    left: HORSE_TURNS,
    fresh: true,
    curses:
      k === 'death' ? this.players.map(() => CURSES[Math.floor(this.random() * CURSES.length)]) : [],
  };
  this.horseUsed = true;
  this.horseCount = (this.horseCount || 0) + 1;
  this.addLog(`A horseman rides in: ${k}. ${HORSE_TURNS} turns.`, 'bad', 'horse', {
    k,
    v,
    n: this.players[who].name,
  });
  this.ev('horse', { k, v, pi: who });
  this.wardCheck();
}
// the horseman's work at the start of pi's turn
export function horseTurn(this: Game, pi) {
  const h = this.horse;
  if (!h || h.left <= 0) return;
  if (h.fresh) h.fresh = false;
  else if (--h.left <= 0) {
    this.addLog(`The horseman rides off. The table is back to normal.`, 'win', 'horseEnd', { k: h.k });
    this.ev('horseEnd', { k: h.k });
    return;
  }
  const p = this.players[pi],
    rnd = (a) => a[Math.floor(this.random() * a.length)];
  if (
    h.k === 'famine' &&
    h.v === 'tithe' &&
    this.prevTurnPi != null &&
    this.prevTurnPi !== pi &&
    !this.warded(this.prevTurnPi)
  ) {
    const gi = this.prevTurnPi,
      g = this.players[gi];
    if (g && !g.out && g.hand.length > 1) {
      const live = this.players.map((q, i) => i).filter((i) => !this.players[i].out);
      const min = Math.min(...live.map((i) => this.players[i].hand.length));
      const to = live.filter((i) => i !== gi && !this.warded(i) && this.players[i].hand.length === min);
      const free = g.hand.filter((c) => !c.lock && !c.uniq);
      if (to.length && free.length && !(g.hand.length === min && to.length === 0)) {
        const ti = rnd(to);
        for (let r = 0; r < 2 && free.length && g.hand.length > 1; r++) {
          const c = free.splice(Math.floor(this.random() * free.length), 1)[0];
          g.hand.splice(g.hand.indexOf(c), 1);
          this.players[ti].hand.push(c);
        }
        this.addLog(`Famine: ${g.name} hands two cards to ${this.players[ti].name}.`, 'swap', 'tithe', {
          n: g.name,
          t: this.players[ti].name,
        });
        this.ev('tithe', { pi: gi, t: ti });
      }
    }
  }
  if (h.k === 'war' && h.v === 'arms' && !this.warded(pi)) {
    const calm = p.hand.filter((c) => {
      const f = this.f(c);
      return !c.lock && !c.uniq && f.c !== 'w' && !DRAW_VAL[f.v] && !ATTACK_FACES.has(f.v);
    });
    for (let r = 0; r < 2 && calm.length; r++) {
      const c = calm.splice(Math.floor(this.random() * calm.length), 1)[0],
        f = this.f(c);
      c[this.side] = { c: f.c, v: rnd(ATTACK_VALS[this.side]) };
      this.addLog(`War arms ${p.name}: a card turns into ${faceName(c[this.side])}.`, 'bad', 'arms', {
        n: p.name,
        f: c[this.side],
      });
      this.ev('arms', { pi });
    }
  }
  if (h.k === 'plague' && h.v === 'rot' && !this.warded(pi)) {
    const pool = p.hand.filter((c) => !c.uniq && !c.lock);
    let n = 0;
    for (let r = 0; r < 3 && pool.length; r++) {
      const c = pool.splice(Math.floor(this.random() * pool.length), 1)[0];
      p.hand[p.hand.indexOf(c)] = this.newCard();
      n++;
    }
    if (n) {
      this.addLog(`Plague: ${n} of ${p.name}'s cards rot and are replaced.`, 'bad', 'rot', {
        n: p.name,
        k: n,
      });
      this.ev('rot', { pi, k: n });
    }
  }
}
// War (timer): the clock ran out on pi's turn. The turn ends and pi picks up 2 more.
export function warTimeout(this: Game, pi) {
  if (
    !this.horseOn('war', 'timer', pi) ||
    this.turn !== pi ||
    this.winner !== null ||
    this.offer ||
    this.roulette !== null
  )
    return false;
  const p = this.players[pi];
  if (!p || p.out) return false;
  if (this.debt && this.debt.pi === pi) {
    if (this.debt.n) p.oweN = (p.oweN || 0) + this.debt.n;
    this.debt = null;
  } else if (this.pending > 0) {
    p.oweN = (p.oweN || 0) + this.pending;
    this.afterHit(this.stackFrom, pi, this.pending);
    this.pending = 0;
    this.stackMin = 0;
    this.stackFrom = -1;
  }
  p.oweN = (p.oweN || 0) + 3;
  this.drewBy = -1;
  this.drawRun = 0;
  this.seq++;
  this.addLog(`War: ${p.name} ran out of time and picks up 3.`, 'bad', 'warTime', { n: p.name });
  this.ev('warTime', { pi });
  this.turn = this.nextIdx(pi, 1);
  this.applyShield();
  this.checkFlipBack();
  this.lastCallCheck();
  return true;
}
// ================= DEALS =================
