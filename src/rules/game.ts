import { ability } from './abilities.ts';
import { Bot } from './bot.ts';
import type { Card, Face, Side } from './cards.ts';
import {
  DRAW_VAL,
  EXTRA_CARDS,
  FACES,
  FACE_W,
  FUSE_HIT,
  FUSE_TURNS,
  LAST_CALL,
  MAX_STACK,
  LEECH_MEALS,
  SIDE_COLORS,
  cardCode,
  faceName,
  isBad,
  other,
} from './cards.ts';
import {
  DEMON_NIGHT,
  afterHit,
  alms,
  attacked,
  canDark,
  chainUp,
  dealStart,
  dmul,
  hasDeal,
  hasL,
  hit,
  payDebt,
  pctDebt,
  spendFangs,
  takeStack,
  turnDebt,
} from './contracts.ts';
import { applyShield, checkFlipBack, draw, pass, resolveRoulette } from './draw.ts';
import { horseCheck, horseOn, horseTurn, warTimeout, warded } from './horsemen.ts';
import { canUseItem, dealBonus, rentPay, twoFace, useItem, wardCheck } from './items.ts';
import type { GameEvent, Player } from './model.ts';
import { play } from './play.ts';
import { rollChaos } from './slots.ts';
import { beginTurn, dealEffect, demonChance, fall, resolveDeal } from './visitors.ts';

export class Game {
  declare againN: number;
  declare chaosIn: number;
  declare chipsWon: number[];
  declare color: string;
  declare crossLeft: number;
  declare debt: { pi: number; n?: number; until?: string; got: number; kind: string };
  declare dir: number;
  declare drawRun: number;
  declare drawRunPi: number;
  declare drewBy: number;
  declare evSeq: number;
  declare events: GameEvent[];
  declare flipBack: { pi: number; seq: number };
  declare gid: string;
  declare horse: { k: string; v: string; left: number; fresh?: boolean; curses: string[] };
  declare horseCount: number;
  declare horseUsed: boolean;
  declare inflate: number;
  declare lastChaos: { e: string; who?: number[] };
  declare lock: number;
  declare log: { msg: string; cls: string; k: string; a: any }[];
  declare maze: number;
  declare multNext: number;
  declare nightNo: number;
  declare offer: { pi: number; kind: string; opts: string[] };
  declare padUsed: boolean[];
  declare pending: number;
  declare perks: Record<number, string[]>;
  declare pile: string[];
  declare pileN: number;
  declare potato: { fuse: number; cool: number };
  declare prevTurnPi: number;
  declare roulette: number;
  declare seq: number;
  declare stackFrom: number;
  declare stackMin: number;
  declare topBy: number;
  declare turnKey: string;
  declare turnNo: number;
  declare winner: number | null;
  random: () => number;
  nextId = 1;
  players: Player[];
  rules: Record<string, any>;
  declare side: Side;
  declare turn: number;
  next: Card;
  top: Card;
  declare _side: Side;
  declare _turn: number;
  horseOn = horseOn;
  warded = warded;
  horseCheck = horseCheck;
  horseTurn = horseTurn;
  warTimeout = warTimeout;
  hasL = hasL;
  dmul = dmul;
  spendFangs = spendFangs;
  pctDebt = pctDebt;
  chainUp = chainUp;
  dealStart = dealStart;
  alms = alms;
  payDebt = payDebt;
  attacked = attacked;
  hit = hit;
  afterHit = afterHit;
  takeStack = takeStack;
  turnDebt = turnDebt;
  beginTurn = beginTurn;
  resolveDeal = resolveDeal;
  dealEffect = dealEffect;
  fall = fall;
  demonChance = demonChance;
  dealBonus = dealBonus;
  canUseItem = canUseItem;
  useItem = useItem;
  twoFace = twoFace;
  wardCheck = wardCheck;
  rentPay = rentPay;
  ability = ability;
  play = play;
  checkFlipBack = checkFlipBack;
  applyShield = applyShield;
  draw = draw;
  pass = pass;
  resolveRoulette = resolveRoulette;
  rollChaos = rollChaos;

  constructor(names: string[], humans: number[], rules: Record<string, any>, random: () => number) {
    this.random = random;
    rules = Object.assign({}, rules);
    this.rules = Object.assign(
      {
        stacking: true,
        drawUntil: true,
        multi: true,
        combos: true,
        gamble: true,
        lastCall: true,
        potato: true,
        handSize: 7,
        flip: true,
        chaos: true,
      },
      rules,
    );
    this.rules.cards = Object.assign(Object.fromEntries(EXTRA_CARDS.map((k) => [k, true])), rules.cards);
    // card values that never get dealt at this table
    this.rules.off = EXTRA_CARDS.filter((k) => !this.rules.cards[k]).concat(
      this.rules.flip ? [] : ['flip', 'dflip'],
    );
    const hum = Array.isArray(humans) ? humans : [humans];
    this.gid = this.random().toString(36).slice(2, 8);
    this.side = 'L';
    this.next = this.newCard();
    this.players = names.map((n, i) => ({
      name: n,
      hand: [],
      human: hum.includes(i),
      out: false,
      elim: false,
      shield: false,
      oweN: 0,
      owed: [],
      av: '',
      peer: '',
    }));
    for (const p of this.players)
      for (let i = 0; i < this.rules.handSize; i++) p.hand.push(this.newCard());
    // debt match: house tokens bought in the shop (seat -> ids) and the chips earned this deal
    this.perks = rules.perks || {};
    this.offer = null;
    this.turnKey = '';
    // deal state carries over from deal to deal in a match (the server passes it in and reads it back)
    const ds = Array.isArray(rules.deals) ? rules.deals : [];
    this.players.forEach((p, i) => {
      const d = ds[i] || {};
      // an unused demon charge carries into the next deal at half
      Object.assign(p, {
        angel: d.angel || 0,
        demon: (d.demon || 0) / (d.fresh ? 1 : 2),
        demonX: (d.demonX || 0) / (d.fresh ? 1 : 2),
        inv: Array.isArray(d.inv) ? d.inv.slice() : [],
        fx: {},
        buff: d.buff || 0,
        deals: Array.isArray(d.deals) ? d.deals.slice() : d.deal ? [d.deal] : [],
        fallen: !!d.fallen,
        markT: d.markT ?? null,
        exT: d.exT ?? null,
        debt: d.debt || 0,
        limit: d.limit || 0,
        used: {},
        peace: null,
        dayAt: null,
        skipNext: false,
        broke: false,
        angelBlock: 0,
        angelSlow: Math.max(0, (d.angelSlow || 0) - (d.fresh ? 0 : 1)),
        tookLight: !!d.tookLight,
        noAngel: !!d.noAngel,
        puppetLast: null,
        nightSeen: -1,
        djGiven: !!d.djGiven,
      });
    });
    delete this.rules.deals;
    this.crossLeft = 0;
    this.nightNo = 0;
    this.horse = rules.horse && rules.horse.left > 0 ? JSON.parse(JSON.stringify(rules.horse)) : null;
    this.horseCount = rules.horseCount || 0;
    this.horseUsed = !!rules.horseUsed || !!this.horse;
    delete this.rules.horse;
    delete this.rules.horseUsed;
    delete this.rules.horseCount;
    this.chipsWon = this.players.map(() => 0);
    this.padUsed = this.players.map(() => false);
    let top;
    do {
      top = this.newCard();
    } while (top.L.c === 'w' || isNaN(+top.L.v));
    this.top = top;
    this.color = top.L.c;
    this.dir = 1;
    this.pile = [cardCode(top) + '!' + top.id];
    this.pileN = 1; // recent discards, so the pile can show a few cards underneath
    this.turn = Math.floor(this.random() * names.length);
    this.pending = 0;
    this.stackMin = 0;
    this.stackFrom = -1;
    this.roulette = null;
    this.flipBack = null;
    this.debt = null; // cards someone must draw by hand before play moves on: { pi, n | until, got, kind }
    // Chaos: every few plays the table rolls a random event
    this.chaosIn = 9;
    this.inflate = 0;
    this.lock = 0;
    this.lastChaos = null;
    this.maze = 0;
    this.potato = { fuse: 12 + Math.floor(this.random() * 10), cool: 0 }; // Hot Potato: a hidden fuse ticking down with every play
    this.multNext = 1; // a multiplier played with no stack waits for the next draw card
    this.drewBy = -1;
    this.winner = null;
    this.log = [];
    this.seq = 0;
    this.events = [];
    this.evSeq = 0;
    this.addLog(`First card: ${faceName(top.L)}. ${this.players[this.turn].name} starts.`, '', 'first', {
      f: top.L,
      n: this.players[this.turn].name,
    });
    this.ev('start');
    this.dealStart();
  }
  pickTwo(list: string[]) {
    return list
      .slice()
      .sort(() => this.random() - 0.5)
      .slice(0, 2);
  }
  uniqueCard(v: string): Card {
    return { id: this.nextId++, L: { c: 'w', v }, D: { c: 'w', v }, uniq: true };
  }
  randFace(s: Side): Face {
    const weights = FACE_W[s];
    let x = this.random() * weights.reduce((a, b) => a + b, 0);
    const index = weights.findIndex((w) => (x -= w) < 0);
    return { ...FACES[s][Math.max(0, index)] };
  }
  newCard() {
    const c: Card = { id: this.nextId++, L: this.randFace('L'), D: this.randFace('D') },
      off = this.rules.off || [];
    for (const s of ['L', 'D'] as const) {
      let g = 0;
      while (off.includes(c[s].v) && g++ < 60) c[s] = this.randFace(s);
    }
    return c;
  }
  f(card) {
    return card[this.side];
  }
  back(card) {
    return card[other(this.side)];
  }
  colors() {
    return SIDE_COLORS[this.side];
  }
  addLog(msg, cls = '', k = null, a = null) {
    this.log.push({ msg, cls, k, a });
    if (this.log.length > 200) this.log.shift();
    this.observeLog?.(k, a);
  }
  observeLog?: (key: string, args: unknown) => void;
  observeEvent?: (event: GameEvent) => void;
  ev(type, data = {}) {
    const event = Object.assign({ type, n: ++this.evSeq }, data);
    this.events.push(event);
    if (this.events.length > 24) this.events.shift();
    this.observeEvent?.(event);
    if (type === 'flip') this.rentPay();
  }
  active() {
    return this.players.filter((p) => !p.out);
  }
  nextIdx(from, steps = 1) {
    let i = from;
    const n = this.players.length;
    for (let s = 0; s < steps; s++) {
      let g = 0;
      do {
        i = (i + this.dir + n) % n;
      } while (this.players[i].out && ++g < n);
    }
    return i;
  }
  owes(pi) {
    const p = this.players[pi];
    return !!p && !p.out && ((p.oweN || 0) > 0 || (p.owed && p.owed.length > 0));
  }
  canPlay(card) {
    if (
      this.roulette !== null ||
      this.debt ||
      this.offer ||
      card.hidden ||
      card.lock ||
      this.owes(this.turn)
    )
      return false;
    const f = this.f(card),
      t = this.f(this.top);
    if (isBad(f)) {
      if (this.pending > 0) return false;
      if (f.v === 'lead') return true;
      if (f.v === 'leech') {
        const h = this.players[this.turn] && this.players[this.turn].hand;
        return !!h && h.length === 1 && h[0] === card;
      }
      return false; // the fuse only leaves by being passed on, given away or blowing up
    }
    if (
      this.pending > 0 &&
      (f.c === 'w' || EXTRA_CARDS.includes(f.v)) &&
      !card.uniq &&
      this.horseOn('plague', 'blank', this.turn)
    )
      return false;
    if (this.pending > 0)
      return (
        f.v === 'mirror' ||
        f.v === 'mul2' ||
        f.v === 'mul3' ||
        (f.v === 'echo' && (DRAW_VAL[this.f(this.top).v] || 0) >= this.stackMin) ||
        (this.rules.stacking && (DRAW_VAL[f.v] || 0) >= this.stackMin)
      );
    if (this.lock > 0) return f.c === 'w' || f.c === this.color;
    return f.c === 'w' || f.c === this.color || f.v === t.v;
  }
  playable(pi) {
    return this.players[pi].hand.filter((c) => this.canPlay(c));
  }
  validColor(c, pi) {
    return this.colors().includes(c) ? c : Bot.bestColor(this, this.players[pi].hand, this.side);
  }
  give(pi, k, until = null) {
    const p = this.players[pi];
    const got = [];
    while (true) {
      if (until) {
        if (got.length && until(got[got.length - 1])) break;
      } else if (got.length >= k) break;
      const c = this.next;
      this.next = this.newCard();
      p.hand.push(c);
      got.push(c);
      if (got.length > 300) break;
    }
    if (got.length) this.ev('draw', { pi, k: got.length });
    return got;
  }
  standingCheck() {
    const act = this.active();
    if (act.length === 1 && this.winner === null) {
      this.winner = this.players.indexOf(act[0]);
      this.addLog(`${act[0].name} is the last one standing.`, 'win', 'lastLeft', { n: act[0].name });
      this.ev('win', { pi: this.winner });
    }
    if (this.winner === null && this.players[this.turn].out) this.turn = this.nextIdx(this.turn, 1);
    this.lastCallCheck();
    if (this.roulette !== null && this.players[this.roulette].out) {
      this.roulette = null;
    }
    if (this.debt && this.players[this.debt.pi].out) this.debt = null;
  }
  // ================= THE HORSEMEN =================
  badTurn(pi) {
    const p = this.players[pi];
    // a leech feeds (+1) at the start of each of your turns; after LEECH_MEALS meals it is full and drops off
    for (const c of p.hand.slice()) {
      if (!(this.f(c).v === 'leech' && this.f(c).c === 'x') || p.hand.length < 2) continue;
      c.meals = (c.meals || 0) + 1;
      p.oweN = (p.oweN || 0) + 1;
      const full = c.meals >= LEECH_MEALS;
      if (full) p.hand.splice(p.hand.indexOf(c), 1);
      this.addLog(
        full
          ? `The leech feeds on ${p.name} one last time (+1) and drops off.`
          : `The leech feeds on ${p.name}: +1.`,
        'bad',
        'leech',
        { n: p.name, k: 1, full: full ? 1 : 0 },
      );
      this.ev('bad', { pi, v: 'leech', k: 1, full: full ? 1 : 0 });
    }
    for (const c of p.hand.slice()) {
      if (!(this.f(c).v === 'fuse' && this.f(c).c === 'x')) continue;
      c.fuse = (c.fuse == null ? FUSE_TURNS : c.fuse) - 1;
      if (c.fuse > 0) continue;
      p.hand.splice(p.hand.indexOf(c), 1);
      p.oweN = (p.oweN || 0) + FUSE_HIT;
      this.addLog(`The fuse burns down in ${p.name}'s hand: BOOM, +${FUSE_HIT}.`, 'bad', 'fuse', {
        n: p.name,
        k: FUSE_HIT,
      });
      this.ev('bad', { pi, v: 'fuse', k: FUSE_HIT });
    }
  }
  hasPerk(pi, id) {
    const l = this.perks && this.perks[pi];
    return !!(l && l.includes(id));
  }
  // Last Call: after LAST_CALL handovers the house closes. Fewest cards wins; a tie goes to whoever sits soonest in turn order.
  lastCallLeft() {
    return this.rules.lastCall === false ? null : Math.max(0, LAST_CALL - (this.turnNo || 0));
  }
  lastCallCheck() {
    if (this.winner !== null || this.rules.lastCall === false || (this.turnNo || 0) < LAST_CALL) return;
    if (this.pending > 0 || this.debt || this.roulette !== null) return; // let the stack land first
    let best = -1,
      i = this.turn;
    for (
      let k = 0;
      k < this.players.length;
      k++, i = (i + this.dir + this.players.length) % this.players.length
    ) {
      const p = this.players[i];
      if (p.out) continue;
      if (
        best < 0 ||
        p.hand.length + (p.oweN || 0) < this.players[best].hand.length + (this.players[best].oweN || 0)
      )
        best = i;
    }
    if (best < 0) return;
    this.winner = best;
    this.addLog(
      `Last call. The house closes the table: ${this.players[best].name} holds the fewest cards and wins.`,
      'win',
      'lastCall',
      { n: this.players[best].name, k: this.players[best].hand.length },
    );
    this.ev('lastcall', { pi: best });
    this.ev('win', { pi: best });
  }
  removePlayer(pi, why = 'left') {
    const p = this.players[pi];
    if (!p || p.out || this.winner !== null) return false;
    p.out = true;
    p.left = why !== 'broke';
    p.shield = false;
    if (why !== 'broke')
      this.addLog(
        `${p.name} ${why === 'left' ? 'left the match' : 'was away too long and is out of the match'}. Everyone else plays on.`,
        'bad',
        'left',
        { n: p.name, aw: why === 'left' ? 0 : 1 },
      );
    if (this.offer && this.offer.pi === pi) this.offer = null;
    this.ev('ko', { pi });
    if (this.roulette === pi) this.roulette = null;
    if (this.debt && this.debt.pi === pi) this.debt = null;
    p.oweN = 0;
    p.owed = [];
    if (this.stackFrom === pi) this.stackFrom = -1;
    if (this.flipBack && this.flipBack.pi === pi) this.flipBack.pi = this.nextIdx(pi, 1);
    if (this.turn === pi) {
      if (this.pending > 0) {
        this.addLog(`The +${this.pending} stack aimed at ${p.name} is discarded.`, 'stk', 'stackGone', {
          n: p.name,
          k: this.pending,
        });
        this.pending = 0;
        this.stackMin = 0;
        this.stackFrom = -1;
      }
      this.drewBy = -1;
      this.drawRun = 0;
      this.turn = this.nextIdx(pi, 1);
    }
    this.seq++;
    const act = this.active();
    if (act.length === 1) {
      this.winner = this.players.indexOf(act[0]);
      this.addLog(`${act[0].name} is the last player left and wins.`, 'win', 'lastLeft', {
        n: act[0].name,
      });
      this.ev('win', { pi: this.winner });
    }
    return true;
  }
  // A player who is away (disconnected, or idle too long) has their turn skipped.
  // If a stack is waiting on them, they take it, so nobody else is punished for their absence.
  skipTurn(pi) {
    if (this.winner !== null) return false;
    const p = this.players[pi];
    if (this.roulette === pi) {
      const cols = this.colors();
      this.addLog(`${p.name} is away. A random color is called for them.`, 'stk', 'awayColor', {
        n: p.name,
      });
      this.resolveRoulette(cols[Math.floor(this.random() * cols.length)]);
      return true;
    }
    if (this.turn !== pi) return false;
    if (this.pending > 0 || (this.debt && this.debt.pi === pi)) {
      if (this.pending > 0)
        this.addLog(`${p.name} is away and takes the stack.`, 'stk', 'awayStack', { n: p.name });
      let g = 0;
      while (this.turn === pi && this.winner === null && ++g < 400 && this.draw(pi));
      return true;
    }
    while (this.owes(pi)) this.draw(pi);
    this.addLog(`${p.name} is away. Turn skipped.`, 'stk', 'awaySkip', { n: p.name });
    this.drewBy = -1;
    this.drawRun = 0;
    this.seq++;
    this.ev('skip', { pi });
    this.turn = this.nextIdx(pi, 1);
    this.applyShield();
    this.checkFlipBack();
    return true;
  }
  // Russian roulette: facing a stack (+8 by day, +4 at night), aim the revolver at a rival instead of answering it.
  // Click: the whole stack goes to them and play moves on. Bang: you take it doubled (tripled with the Cursed Drum).
  canGamble(pi) {
    return (
      this.rules.gamble !== false &&
      pi === this.turn &&
      this.pending >= (this.side === 'D' ? 4 : 8) &&
      !this.debt &&
      this.roulette === null &&
      !this.owes(pi) &&
      this.winner === null
    );
  }
  gamble(pi, target) {
    if (!this.canGamble(pi)) return null;
    const p = this.players[pi],
      k = this.pending;
    let tg = Number.isInteger(target) ? target : -1;
    if (tg === pi || !this.players[tg] || this.players[tg].out) tg = this.nextIdx(pi, 1);
    const t = this.players[tg];
    this.seq++;
    const drum = hasDeal(p, 'drum');
    if (this.random() < (drum || this.hasPerk(pi, 'luck') ? 2 / 3 : 0.5)) {
      this.pending = 0;
      this.stackMin = 0;
      this.stackFrom = -1;
      this.drewBy = -1;
      const got = this.hit(pi, tg, k);
      this.addLog(
        `${p.name} aims at ${t.name}… click. ${t.name} takes the +${got} stack.`,
        'win',
        'gambleWin',
        { n: p.name, t: t.name, k: got },
      );
      this.ev('gamble', { pi, t: tg, ok: 1, k: got });
      this.turn = this.nextIdx(pi, 1);
      this.applyShield();
      this.checkFlipBack();
      return true;
    }
    this.pending = Math.min(MAX_STACK, this.pending * (drum ? 3 : 2));
    this.addLog(
      `${p.name} aims at ${t.name}… BANG. ${p.name} takes the stack doubled: +${this.pending}.`,
      'bad',
      'gambleLose',
      { n: p.name, t: t.name, k: this.pending },
    );
    this.ev('gamble', { pi, t: tg, ok: 0, k: this.pending });
    this.draw(pi);
    return false;
  }
}
// every time the table turns to night: a new night (the demon rolls once per night) and +1% to every demon charge
Object.defineProperty(Game.prototype, 'side', {
  get() {
    return this._side;
  },
  set(v) {
    const was = this._side;
    this._side = v;
    if (was === 'L' && v === 'D' && Array.isArray(this.players)) {
      this.nightNo = (this.nightNo || 0) + 1;
      for (const p of this.players)
        if (!p.out && p.limit > 0 && canDark(p)) p.demonX = (p.demonX || 0) + DEMON_NIGHT;
    }
  },
  configurable: true,
});
// every handover of the turn ticks the Last Call clock
Object.defineProperty(Game.prototype, 'turn', {
  get() {
    return this._turn;
  },
  set(v) {
    if (v !== this._turn) {
      if (this._turn !== undefined) this.turnNo = (this.turnNo || 0) + 1;
      this._turn = v;
    }
  },
  configurable: true,
});
