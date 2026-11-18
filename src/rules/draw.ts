import { Bot } from './bot.ts';
import { COLOR_NAME, faceName, other } from './cards.ts';
import type { Game } from './game.ts';

export function checkFlipBack(this: Game) {
  const fb = this.flipBack;
  if (!fb || this.winner !== null) return;
  if (this.seq > fb.seq && this.turn !== fb.pi) {
    this.flipBack = null;
    this.side = other(this.side);
    const nf = this.f(this.top);
    this.color =
      nf.c === 'w' || nf.c === 'x' ? Bot.bestColor(this, this.players[this.turn].hand, this.side) : nf.c;
    this.addLog(
      `The double flip wears off. Back to the ${this.side === 'D' ? 'dark' : 'light'} side: ${faceName(nf)}${nf.c === 'w' || nf.c === 'x' ? ' → ' + COLOR_NAME[this.color] : ''}.`,
      'flip',
      'dflipOff',
      { dk: this.side === 'D' ? 1 : 0, f: nf, c: nf.c === 'w' || nf.c === 'x' ? this.color : null },
    );
    this.ev('flip', { side: this.side });
  }
}
export function applyShield(this: Game) {
  const t = this.players[this.turn];
  if (this.pending > 0 && t && t.shield && !t.out && !t.skipNext) {
    // a player on the Puppeteer's strings can't raise the vest
    t.shield = false;
    this.addLog(`${t.name}'s shield breaks the +${this.pending} stack.`, 'swap', 'shieldBreak', {
      n: t.name,
      k: this.pending,
    });
    this.ev('shield', { pi: this.turn, k: this.pending });
    this.pending = 0;
    this.stackMin = 0;
    this.stackFrom = -1;
  }
}
// Every draw is one card by hand. Owed cards (a lost duel, chaos tax) can be paid any time;
// a debt (a taken stack, roulette, draw-color) has to be paid before play moves on.
export function draw(this: Game, pi) {
  const p = this.players[pi];
  if (!p || p.out || this.winner !== null) return null;
  if (this.owes(pi)) {
    let got;
    if (p.owed && p.owed.length) {
      const c = p.owed.shift();
      p.hand.push(c);
      got = [c];
      this.ev('draw', { pi, k: 1 });
    } else {
      got = this.give(pi, 1);
      p.oweN--;
    }
    this.seq++;
    this.standingCheck();
    return got;
  }
  if (pi !== this.turn || this.roulette !== null) return null;
  const d = this.debt;
  if (d && d.pi === pi) {
    const got = this.give(pi, 1);
    this.seq++;
    d.got += got.length;
    let done = false;
    if (d.n) {
      d.n--;
      done = d.n <= 0;
    } else if (d.until) done = !!(got[0] && this.f(got[0]).c === d.until);
    if (d.got >= 300) done = true;
    if (done) {
      this.addLog(
        d.kind === 'stack'
          ? `${p.name} picked up all ${d.got} cards (now ${p.hand.length}).`
          : `${p.name} drew ${d.got} card${d.got > 1 ? 's' : ''} before hitting ${COLOR_NAME[d.until]}.`,
        'bad',
        d.kind === 'stack' ? 'pickedUp' : 'drewUntil',
        { n: p.name, k: d.got, h: p.hand.length, c: d.until || null },
      );
      if (d.got >= 10) this.ev('took', { pi, k: d.got });
      this.debt = null;
      this.drewBy = -1;
      this.drawRun = 0;
      this.turn = this.nextIdx(pi, 1);
      this.applyShield();
      this.checkFlipBack();
    }
    this.standingCheck();
    return got;
  }
  if (this.pending > 0) {
    // taking the stack: the cards are picked up one by one
    const sf = this.stackFrom;
    if (this.takeStack && this.takeStack(pi, sf)) return true; // the guardian sent it back
    if (this.hasPerk(pi, 'pad') && this.padUsed && !this.padUsed[pi]) {
      this.padUsed[pi] = true;
      this.pending = Math.ceil(this.pending / 2);
      this.addLog(`${p.name}'s padding takes half the hit: +${this.pending}.`, 'win', 'pad', {
        n: p.name,
        k: this.pending,
      });
      this.ev('pad', { pi, k: this.pending });
    }
    this.debt = { pi, n: this.pending, got: 0, kind: 'stack' };
    this.afterHit(sf, pi, this.pending);
    this.addLog(`${p.name} takes the +${this.pending} stack.`, 'bad', 'takes', {
      n: p.name,
      k: this.pending,
    });
    this.pending = 0;
    this.stackMin = 0;
    this.stackFrom = -1;
    return this.draw(pi);
  }
  if (this.drewBy === pi) return null;
  const got = this.give(pi, 1);
  this.seq++;
  if (!this.rules.drawUntil) {
    this.drewBy = pi;
    this.addLog(`${p.name} draws a card.`, '', 'drawOne', { n: p.name });
  } else {
    // one card per draw: the player keeps drawing by hand until something is playable
    this.drawRun = (this.drawRunPi === pi ? this.drawRun || 0 : 0) + got.length;
    this.drawRunPi = pi;
    // the run only ends on the current color (or a wild); a matching number or symbol doesn't count
    const f = got[0] && this.f(got[0]);
    if (f && (f.c === 'w' || f.c === this.color)) {
      this.drewBy = pi;
      this.addLog(
        `${p.name} draws ${this.drawRun} card${this.drawRun > 1 ? 's' : ''} before hitting ${COLOR_NAME[this.color]}.`,
        '',
        'drawRun',
        { n: p.name, k: this.drawRun, c: this.color },
      );
      this.drawRun = 0;
    }
  }
  // nothing fits after the draw: the turn passes by itself
  if (this.drewBy === pi && !this.playable(pi).length) this.pass(pi);
  this.standingCheck();
  return got;
}
export function pass(this: Game, pi) {
  if (pi !== this.turn || this.drewBy !== pi || this.pending > 0 || this.debt || this.owes(pi))
    return false;
  this.addLog(`${this.players[pi].name} passes.`, '', 'pass', { n: this.players[pi].name });
  this.drewBy = -1;
  this.drawRun = 0;
  this.seq++;
  this.turn = this.nextIdx(pi, 1);
  this.checkFlipBack();
  this.lastCallCheck();
  return true;
}
export function resolveRoulette(this: Game, color) {
  const vi = this.roulette;
  if (vi === null) return null;
  if (!this.colors().includes(color)) color = Bot.bestColor(this, this.players[vi].hand, this.side);
  this.color = color;
  this.addLog(
    `${this.players[vi].name} calls ${COLOR_NAME[color]} and must draw until it shows up.`,
    'bad',
    'roulette',
    { n: this.players[vi].name, c: color },
  );
  this.ev('color', { c: color });
  this.roulette = null;
  this.seq++;
  this.turn = vi;
  this.debt = { pi: vi, until: color, got: 0, kind: 'roulette' };
  return [];
}
// ---- Chaos events ----
