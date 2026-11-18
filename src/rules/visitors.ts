import {
  ANGEL_CAP,
  ANGEL_STEP,
  DEMON_BIG,
  DEMON_DEBT,
  FALL_DEMON,
  LIGHT_DEALS,
  canDark,
  canLight,
  darkPool,
  hasDeal,
  nDark,
  nLight,
  offerOpen,
} from './contracts.ts';
import type { Game } from './game.ts';

export function beginTurn(this: Game) {
  if (this.winner !== null || this.roulette !== null || this.debt || this.offer) return false;
  const pi = this.turn,
    p = this.players[pi];
  if (!p || p.out) return false;
  const key = (this.turnNo || 0) + ':' + pi;
  if (this.turnKey === key) return false;
  this.turnKey = key;
  this.horseCheck();
  this.wardCheck();
  this.horseTurn(pi);
  this.prevTurnPi = pi;
  if (this.crossLeft > 0) {
    this.crossLeft--;
    if (!this.crossLeft) {
      this.addLog('The inverted cross burns out.', 'n', 'crossEnd', {});
      this.ev('crossEnd', {});
    }
  }
  // the angel counts the turn you just finished: peaceful, and by day; an attack stalls it for two turns
  if (p.angelBlock > 0) p.angelBlock--;
  else if (p.peace === true && p.dayAt === 'L' && canLight(p) && !(this.crossLeft > 0))
    p.angel = Math.min(ANGEL_CAP, (p.angel || 0) + ANGEL_STEP * (p.angelSlow > 0 ? 0.5 : 1));
  if (p.peace === true && this.hasL(p, 'candle') && p.debt > 0) this.payDebt(pi, -5, 'candle');
  // the demon notices a fat hand
  if (p.hand.length >= 15 && canDark(p)) p.demonX = (p.demonX || 0) + DEMON_BIG;
  // Night Tax: rivals pay 3 at the start of their night turns, its owner 3 on their own day turns
  if (p.limit > 0)
    this.players.forEach((q, i) => {
      if (q.out || !hasDeal(q, 'nighttax')) return;
      if (this.side === 'D' && i !== pi) this.payDebt(pi, 3, 'nighttax');
      if (this.side === 'L' && i === pi) this.payDebt(pi, 3, 'nighttax');
    });
  // chains: cards from a Sacrifice count down; anything else from last turn falls off
  for (const c of p.hand) {
    if (c.chain > 0) {
      c.lock = true;
      c.chain--;
    } else c.lock = false;
  }
  this.badTurn(pi);
  // debt for the hand you hold
  if (p.limit > 0) {
    const d = this.turnDebt(pi);
    if (d) this.payDebt(pi, d, 'turn');
    if (p.debt > p.limit && !p.overWarned) {
      p.overWarned = true;
      this.ev('overLimit', { pi, d: p.debt, l: p.limit });
    }
  }
  // the demon's chains on an opponent's hand, for this turn
  if (this.players.some((q, i) => i !== pi && !q.out && hasDeal(q, 'chains')) && p.hand.length > 1) {
    const free = p.hand.filter((c) => !c.lock).sort(() => this.random() - 0.5);
    const n = this.chainUp(p, free.slice(0, Math.max(1, Math.floor(p.hand.length * 0.2))));
    if (n) this.ev('chained', { pi, k: n });
  }
  // a puppet's string: the turn is lost, and a stack waiting for this player can't be answered: it's all taken
  if (p.skipNext) {
    p.skipNext = false;
    if (this.pending > 0) {
      const k = this.pending;
      p.oweN = (p.oweN || 0) + k;
      this.afterHit(this.stackFrom, pi, k);
      this.pending = 0;
      this.stackMin = 0;
      this.stackFrom = -1;
      this.addLog(`${p.name} is on a string and takes the +${k} stack.`, 'bad', 'puppetTake', {
        n: p.name,
        k,
      });
    }
    this.addLog(`${p.name} dances on a string and misses the turn.`, 'stk', 'puppetSkip', { n: p.name });
    this.ev('skip', { pi });
    p.peace = null;
    this.turn = this.nextIdx(pi, 1);
    return true;
  }
  // the visitors: the demon only by night, the angel only by day
  const roll = (x) => this.random() * 100 < x;
  if (!(p.limit > 0)) {
    /* single deal: no house, no visitors */
  }
  // the demon: once a night, on your first night turn, the whole charge is rolled and spent
  else if (
    this.side === 'D' &&
    p.nightSeen !== this.nightNo &&
    ((canDark(p) && offerOpen(p)) || p.inv.includes('twoface'))
  ) {
    p.nightSeen = this.nightNo;
    const ch = Math.min(100, this.demonChance(pi) + this.dealBonus(pi));
    if (ch > 0) {
      p.demon = 0;
      p.demonX = 0;
      if (roll(ch)) this.offer = { pi, kind: 'dark', opts: this.pickTwo(darkPool(p)) };
      else this.ev('demonMiss', { pi, k: ch });
    }
  } else if (
    this.side === 'L' &&
    !(this.crossLeft > 0) &&
    ((canLight(p) && offerOpen(p)) || (p.inv.includes('twoface') && !p.fallen && !p.noAngel)) &&
    (p.angel || 0) > 0 &&
    roll(p.angel + this.dealBonus(pi))
  ) {
    this.offer = { pi, kind: 'light', opts: this.pickTwo(LIGHT_DEALS.filter((d) => !hasDeal(p, d))) };
  }
  this.twoFace();
  if (this.offer) {
    this.addLog(
      `${this.offer.kind === 'dark' ? 'The demon' : 'The angel'} comes to ${p.name}.`,
      'n',
      this.offer.kind === 'dark' ? 'demonCome' : 'angelCome',
      { n: p.name },
    );
    this.ev('offer', { pi, kind: this.offer.kind });
  }
  p.peace = true;
  p.dayAt = this.side;
  this.seq++;
  return true;
}
// choose a deal (or tear up the demon's contract with id = null)
export function resolveDeal(this: Game, pi, id, target) {
  const o = this.offer,
    p = this.players[pi];
  if (!o || o.pi !== pi) return false;
  if (o.kind === 'light' && !o.opts.includes(id)) return false;
  if (o.kind === 'dark' && id !== null && !o.opts.includes(id)) return false;
  if (o.kind === 'both' && !o.opts.includes(id)) return false;
  this.offer = null;
  this.seq++;
  p.buff = 0;
  if (o.kind === 'both') {
    // Two-faced: whichever is picked, no fall, no limits, and it doesn't count as this hand's deal
    const lightPick = LIGHT_DEALS.includes(id);
    if (lightPick) {
      p.angel = 0;
      p.tookLight = true;
    } else {
      p.demon = 0;
      p.demonX = 0;
      p.noAngel = true;
      p.angel = 0;
    } // a dark signature closes the door on the angel
    p.deals.push(id);
    this.dealEffect(pi, id, target);
    this.addLog(
      `${p.name} takes a ${lightPick ? 'light' : 'dark'} deal: ${id}.`,
      lightPick ? 'win' : 'bad',
      'dealTaken',
      {
        n: p.name,
        d: id,
        kind: lightPick ? 'light' : 'dark',
        t: p.markT != null && id === 'mark' ? this.players[p.markT].name : null,
      },
    );
    this.ev('dealTaken', { pi, d: id, kind: lightPick ? 'light' : 'dark' });
    return true;
  }
  if (o.kind === 'dark' && id === null) {
    this.addLog(`${p.name} tears up the demon's contract.`, 'n', 'demonNo', { n: p.name });
    this.ev('dealNo', { pi });
    return true;
  }
  if (o.kind === 'light') {
    p.angel = 0;
    p.angelSlow = 2;
    p.tookLight = true;
  } else {
    if (nLight(p) && id !== 'desecrate') this.fall(pi);
    // once you sign with the demon, the angel never comes again
    p.demon = 0;
    p.demonX = 0;
    p.noAngel = true;
    p.angel = 0;
  }
  p.deals.push(id);
  p.signedNow = true;
  this.dealEffect(pi, id, target);
  this.addLog(
    `${p.name} takes a ${o.kind} deal: ${id}.`,
    o.kind === 'dark' ? 'bad' : 'win',
    'dealTaken',
    {
      n: p.name,
      d: id,
      kind: o.kind,
      t: p.markT != null && id === 'mark' ? this.players[p.markT].name : null,
    },
  );
  this.ev('dealTaken', { pi, d: id, kind: o.kind });
  return true;
}
export function dealEffect(this: Game, pi, id, target) {
  const p = this.players[pi];
  const pickT = () => {
    const ok =
      Number.isInteger(target) && target !== pi && this.players[target] && !this.players[target].out;
    return ok
      ? target
      : (this.players
          .map((q, i) => i)
          .filter((i) => i !== pi && !this.players[i].out)
          .sort((a, b) => this.players[a].hand.length - this.players[b].hand.length)[0] ?? null);
  };
  switch (id) {
    case 'penance':
      p.inv.push('penance');
      break;
    case 'usury':
      this.payDebt(pi, this.pctDebt(p, 0.15, 20), 'usury');
      break;
    case 'bail':
      p.limit = Math.round(p.limit * 0.85);
      p.inv.push('bail');
      this.ev('debt', { pi, k: 0, why: 'bail' });
      break;
    case 'mark':
      p.markT = pickT();
      break;
    case 'exactor':
      p.exT = pickT();
      break;
    case 'desecrate': {
      // the price: the angel never comes again, unless a dark deal is already signed
      if (!(nDark(p) > 0)) {
        p.noAngel = true;
        p.angel = 0;
      }
      p.inv.push('cross');
      break;
    }
  }
}
// signing a dark deal while holding light ones
export function fall(this: Game, pi) {
  const p = this.players[pi];
  const burnt = p.deals.filter((d) => LIGHT_DEALS.includes(d));
  let relief = 0,
    chips = 0;
  for (const d of burnt) {
    if (d === 'penance') {
      if (p.inv.includes('penance')) {
        p.inv.splice(p.inv.indexOf('penance'), 1);
        relief += 5;
        chips += 5;
      }
    } else {
      relief += 10;
      chips += 10;
    }
  }
  p.deals = p.deals.filter((d) => !LIGHT_DEALS.includes(d));
  p.fallen = true;
  p.angel = 0;
  if (relief) this.payDebt(pi, -relief, 'fall');
  if (chips && this.chipsWon) this.chipsWon[pi] += chips;
  // the demonic joker, once a match
  if (!p.djGiven) {
    p.djGiven = true;
    p.hand.push(this.uniqueCard('djoker'));
  }
  this.addLog(
    `${p.name} falls: ${burnt.length} light deal${burnt.length === 1 ? '' : 's'} burn. A demonic joker is left behind.`,
    'bad',
    'fall',
    { n: p.name, k: burnt.length },
  );
  this.ev('fall', { pi, r: relief, c: chips });
}
// the demon's chance at your next night roll
export function demonChance(this: Game, pi) {
  const p = this.players[pi];
  if (!p || !canDark(p)) return 0;
  const debt = p.limit > 0 ? Math.floor((p.debt || 0) / (p.limit * 0.25)) * DEMON_DEBT : 0;
  return Math.round(((p.demon || 0) + (p.demonX || 0) + (p.fallen ? FALL_DEMON : 0) + debt) * 10) / 10;
}
// ================= ITEMS =================
