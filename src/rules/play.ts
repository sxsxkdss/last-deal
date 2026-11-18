import {
  ATTACK_FACES,
  COLOR_NAME,
  DRAW_VAL,
  EXTRA_CARDS,
  LEAD_DRAW,
  MAX_STACK,
  cardCode,
  faceName,
  isBad,
  other,
} from './cards.ts';
import { canDark, hasDeal } from './contracts.ts';
import type { Game } from './game.ts';
import { COMBOS, comboOf, isJoker } from './poker.ts';

export function play(
  this: Game,
  pi,
  cardId,
  opts: { extra?: number[]; color?: string; flipColor?: string; target?: number } = {},
) {
  const p = this.players[pi];
  const idx = p.hand.findIndex((c) => c.id === cardId);
  if (idx < 0 || this.winner !== null) return false;
  const card = p.hand[idx];
  if (pi !== this.turn || !this.canPlay(card)) return false;
  const startingTurn = this.turnNo || 0;
  const face = this.f(card);
  const blank =
    (face.c === 'w' || EXTRA_CARDS.includes(face.v)) &&
    !card.uniq &&
    this.horseOn('plague', 'blank', pi); // Plague: wilds go down as blank paper
  if (this.horseOn('famine', 'two', pi) && Array.isArray(opts.extra))
    opts = Object.assign({}, opts, { extra: [] });
  // Same-number drop: extra cards with the same value (never wilds) go down with the first one.
  const chain = [card];
  if (this.rules.multi && Array.isArray(opts.extra)) {
    if (this.rules.combos !== false && ((/^\d$/.test(face.v) && face.c !== 'w') || isJoker(face))) {
      const want = [card];
      for (const id of opts.extra) {
        const c = p.hand.find((x) => x.id === id);
        if (c && !c.lock && !want.includes(c)) want.push(c);
      }
      if (want.length > 1 && comboOf(want.map((c) => this.f(c)))) {
        // a joker never ends the hand: the pile shows a real number and colour
        if (want.length > 2 && isJoker(this.f(want[want.length - 1]))) {
          const j = want.pop();
          want.splice(want.length - 1, 0, j);
        }
        chain.push(...want.slice(1));
      }
    }
    if (chain.length === 1)
      for (const id of opts.extra) {
        const c = p.hand.find((x) => x.id === id);
        // same value; a wild only goes with wilds, a colored card only with colored cards
        if (
          c &&
          !c.lock &&
          !chain.includes(c) &&
          !isBad(face) &&
          this.f(c).v === face.v &&
          (this.f(c).c === 'w') === (face.c === 'w')
        )
          chain.push(c);
      }
  }
  const k = chain.length;
  p.hand = p.hand.filter((c) => !chain.includes(c));
  if (p.loan > 0 && face.v !== 'loan' && --p.loan === 0) {
    this.payDebt(pi, p.loanAmt || 30, 'loan');
    this.addLog(`${p.name}'s loan comes due: +${p.loanAmt || 30} debt.`, 'bad', 'loanDue2', {
      n: p.name,
      d: p.loanAmt || 30,
    });
    this.ev('loanDue', { pi });
  }
  const last = chain[k - 1];
  const prevFace = this.top ? this.f(this.top) : null; // what Echo copies (and what a Mirror throws back)
  const prevBy = this.topBy != null ? this.topBy : -1;
  this.top = last;
  this.topBy = pi;
  for (const c of chain) {
    this.pile.push(cardCode(c) + '!' + c.id);
    this.pileN++;
  }
  if (this.pile.length > 6) this.pile.splice(0, this.pile.length - 6);
  if (!blank && !isBad(face))
    this.color =
      k > 1 && this.f(last).c !== 'w'
        ? this.f(last).c
        : this.f(last).c === 'w' || face.c === 'w'
          ? this.validColor(opts.color || (face.c !== 'w' ? face.c : null), pi)
          : this.f(last).c;
  this.seq++;
  this.drawRun = 0;
  let extra = '';
  if (face.v === 'discall') {
    const cols = new Set(chain.map((c) => this.f(c).c));
    let same = p.hand.filter((c) => cols.has(this.f(c).c));
    if (this.horseOn('famine', null, pi)) same = same.filter((c) => !c.lock).slice(0, 1); // Famine: the purge only takes one more card of its colour
    p.handDumped = same.length;
    p.hand = p.hand.filter((c) => !same.includes(c));
    if (same.length)
      extra = ` and discards ${same.length} more card${same.length > 1 ? 's' : ''} of ${k > 1 ? 'those colors' : 'that color'}`;
  }
  const showColor = face.c === 'w' && face.v !== 'roul' && !blank;
  const what = k > 1 ? chain.map((c) => faceName(this.f(c))).join(', ') : faceName(face);
  this.addLog(
    `${p.name} plays ${what}${showColor ? ' → ' + COLOR_NAME[this.color] : ''}${extra}.`,
    '',
    'play',
    {
      n: p.name,
      cards: chain.map((c) => this.f(c)),
      c: showColor ? this.color : null,
      d: face.v === 'discall' ? p.handDumped || 0 : 0,
    },
  );
  this.ev('play', { pi, code: cardCode(last), side: this.side, k });
  if (k > 1) this.ev('multi', { pi, k });
  let combo = k > 1 && this.rules.combos !== false ? comboOf(chain.map((c) => this.f(c))) : null;
  if (combo && combo.key === 'pair' && this.hasPerk(pi, 'sharp'))
    combo = Object.assign({}, combo, {
      key: 'three',
      d: COMBOS.three.d,
      r: COMBOS.three.r,
      mult: Math.max(1, COMBOS.three.d),
    }); // Sharp: a pair plays as three of a kind
  if (combo && this.chipsWon && !hasDeal(p, 'devour'))
    this.chipsWon[pi] += Math.max(1, Math.round((combo.chips * combo.mult) / 10));
  if (
    (!blank && (DRAW_VAL[face.v] || ATTACK_FACES.has(face.v))) ||
    (combo && (combo.m || (this.side === 'D' && combo.d)))
  )
    this.attacked(pi);
  if (this.chipsWon && !/^\d$/.test(face.v) && this.hasPerk(pi, 'counter')) this.chipsWon[pi] += 1; // Bookkeeper
  if (showColor) this.ev('color', { c: this.color });
  this.turn = pi;
  this.drewBy = -1;
  if (p.hand.length === 0) {
    this.winner = pi;
    p.out = true;
    this.addLog(`${p.name} empties their hand and wins.`, 'win', 'win', { n: p.name });
    this.ev('win', { pi });
    return true;
  }
  let steps = 1;
  const n = this.active().length;
  if (combo) {
    // Balatro scoring, UNO payout: throw away extra cards, and the big hands hit everyone
    let tossed = 0,
      slap = -1;
    if (this.side === 'D' && combo.d) {
      slap = this.nextIdx(pi, 1);
      this.hit(pi, slap, combo.d);
    } // by night a hand hurts the next player
    else
      for (let r = 0; r < combo.d && p.hand.length > 1; r++) {
        const free = p.hand.filter((c) => !c.lock);
        if (!free.length) break;
        p.hand.splice(p.hand.indexOf(free[Math.floor(this.random() * free.length)]), 1);
        tossed++;
      }
    let relief = 0;
    if (this.side === 'L' && combo.r && p.limit > 0 && p.debt > 0) {
      relief = Math.min(p.debt, combo.r);
      this.payDebt(pi, -relief, 'combo');
    }
    const hit = combo.m
      ? this.players.map((q, i) => i).filter((i) => i !== pi && !this.players[i].out)
      : [];
    for (const i of hit) this.hit(pi, i, combo.m);
    this.addLog(
      `${p.name} plays a ${combo.key}: ${combo.chips} × ${combo.mult}.${tossed ? ` ${tossed} more cards gone.` : ''}${hit.length ? ` Everyone else picks up ${combo.m}.` : ''}`,
      'stack',
      'combo',
      {
        n: p.name,
        h: combo.key,
        c: combo.chips,
        x: combo.mult,
        d: tossed,
        m: hit.length ? combo.m : 0,
        s: slap >= 0 ? this.players[slap].name : null,
        sd: slap >= 0 ? combo.d : 0,
      },
    );
    this.ev('combo', {
      pi,
      key: combo.key,
      chips: combo.chips,
      mult: combo.mult,
      d: tossed,
      m: hit.length ? combo.m : 0,
      slap,
      sd: slap >= 0 ? combo.d : 0,
      r: relief,
      j: combo.joker ? 1 : 0,
    });
  }
  switch (blank ? '' : face.v) {
    case 'lead':
      p.oweN = (p.oweN || 0) + LEAD_DRAW;
      this.addLog(`The lead drags ${p.name} down: +${LEAD_DRAW}.`, 'bad', 'lead', {
        n: p.name,
        k: LEAD_DRAW,
      });
      this.ev('bad', { pi, v: 'lead', k: LEAD_DRAW });
      break;
    case 'skip':
      steps = 1 + k;
      for (let s = 1; s <= k; s++) this.ev('skip', { pi: this.nextIdx(pi, s) });
      break;
    case 'rev':
      if (k % 2) {
        this.dir *= -1;
        steps = n === 2 ? 2 : 1;
        this.ev('reverse', { dir: this.dir });
      }
      break;
    case 'skipall':
      steps = 0;
      this.ev('skipall', { pi });
      break;
    case 'd1':
    case 'd2':
    case 'd4':
    case 'd5':
    case 'wd2':
    case 'wd4':
    case 'wd6':
    case 'wd10':
    case 'wd15':
      this.pending +=
        DRAW_VAL[face.v] * k * (this.inflate > 0 ? 2 : 1) * this.multNext * this.dmul(pi, false);
      this.multNext = 1;
      this.stackMin = DRAW_VAL[face.v];
      this.stackFrom = pi;
      break;
    case 'wrd4':
    case 'wrd8':
      if (k % 2) {
        this.dir *= -1;
        this.ev('reverse', { dir: this.dir });
      }
      this.pending +=
        DRAW_VAL[face.v] * k * (this.inflate > 0 ? 2 : 1) * this.multNext * this.dmul(pi, false);
      this.multNext = 1;
      this.stackMin = DRAW_VAL[face.v];
      this.stackFrom = pi;
      break;
    case 'mirror':
      if (this.pending > 0) {
        const back = this.stackFrom;
        if (back >= 0 && back !== pi && !this.players[back].out) {
          this.addLog(
            `${p.name} mirrors the +${this.pending} stack back to ${this.players[back].name}.`,
            'swap',
            'mirror',
            { n: p.name, k: this.pending, t: this.players[back].name },
          );
          this.ev('mirror', { a: pi, b: back, k: this.pending });
          this.stackFrom = pi;
          this.turn = back;
          steps = -1;
        }
      } else if (prevFace && prevBy >= 0 && prevBy !== pi && !this.players[prevBy].out) {
        // no stack: the Mirror throws whatever the last card did straight back at whoever played it
        const v = prevFace.v,
          q = this.players[prevBy];
        let what = null;
        if (DRAW_VAL[v]) {
          this.hit(pi, prevBy, DRAW_VAL[v]);
          what = '+' + DRAW_VAL[v];
        } else if (v === 'wdc') {
          this.hit(pi, prevBy, 4);
          what = '+4';
        } else if (v === 'skip' || v === 'skipall' || v === 'freeze') {
          q.skipNext = true;
          what = 'skip';
        } else if (v === 'rev') {
          this.dir *= -1;
          this.ev('reverse', { dir: this.dir });
          what = 'reverse';
        } else if (!/^\d$/.test(v) && v !== 'wild' && v !== 'flip' && v !== 'mirror') {
          this.hit(pi, prevBy, 2);
          what = '+2';
        }
        if (what) {
          this.addLog(
            `${p.name}'s mirror throws ${faceName(prevFace)} back at ${q.name}.`,
            'swap',
            'mirrorAny',
            { n: p.name, t: q.name, f: prevFace },
          );
          this.ev('mirror', { a: pi, b: prevBy, k: DRAW_VAL[v] || 0 });
        }
      }
      break;
    case 'shield':
      if (!p.shield) {
        p.shield = true;
        this.addLog(
          `${p.name} raises a shield. The next stack that reaches them breaks.`,
          'swap',
          'shieldUp',
          { n: p.name },
        );
        this.ev('shieldup', { pi });
      }
      break;
    case 'mul2':
    case 'mul3': {
      const m = face.v === 'mul2' ? 2 : 3;
      const x = Math.pow(m, k);
      if (this.pending > 0) {
        const before = this.pending;
        this.pending = Math.min(MAX_STACK, this.pending * x);
        this.stackFrom = pi;
        this.addLog(
          `${p.name} multiplies the stack: +${before} ×${x} = +${this.pending}.`,
          'stack',
          'mult',
          { n: p.name, a: before, x, b: this.pending },
        );
        this.ev('mult', { pi, x, k: this.pending });
      } else {
        this.multNext *= x;
        this.addLog(
          `${p.name} arms ×${this.multNext}: the next draw card is multiplied.`,
          'stack',
          'multArm',
          { n: p.name, x: this.multNext },
        );
        this.ev('mult', { pi, x: this.multNext, k: 0 });
      }
      break;
    }
    case 'lucky': {
      // a horseshoe: heads, 15 debt is written off; tails, you throw away 2 random cards (never chained ones)
      let wipe = 0,
        toss = 0;
      for (let r = 0; r < k; r++) {
        if (this.random() < 0.5) {
          wipe += 15;
        } else {
          for (let q = 0; q < 2 && p.hand.length > 1; q++) {
            const free = p.hand.filter((c) => !c.lock);
            if (!free.length) break;
            p.hand.splice(p.hand.indexOf(free[Math.floor(this.random() * free.length)]), 1);
            toss++;
          }
        }
      }
      if (wipe) this.payDebt(pi, -wipe, 'lucky');
      this.addLog(
        `${p.name}'s horseshoe: ${wipe ? `−${wipe} debt` : ''}${wipe && toss ? ', ' : ''}${toss ? `${toss} cards gone` : ''}.`,
        'win',
        'lucky2',
        { n: p.name, w: wipe, h: toss },
      );
      this.ev('lucky', { pi, h: toss, w: wipe });
      break;
    }
    case 'glass': {
      // fragile: the next player picks up 2, unless the glass breaks in your hand (1 in 4)
      const vi = this.nextIdx(pi, 1);
      let mine = 0,
        theirs = 0;
      for (let r = 0; r < k; r++) this.random() < 0.25 ? mine++ : theirs++;
      if (theirs) this.hit(pi, vi, 2 * theirs);
      if (mine) p.oweN = (p.oweN || 0) + 2 * mine;
      this.addLog(
        mine && !theirs
          ? `${p.name}'s glass shatters: ${p.name} picks up ${2 * mine}.`
          : `${p.name}'s glass hits ${this.players[vi].name}: +${2 * theirs}${mine ? `, but a shard cuts back: ${p.name} picks up ${2 * mine}` : ''}.`,
        'bad',
        'glass',
        { n: p.name, t: this.players[vi].name, a: 2 * theirs, b: 2 * mine },
      );
      this.ev('glass', { pi, broke: mine > 0 });
      break;
    }
    case 'gift': {
      // give 2 random cards per Gift to a chosen player (never your last card)
      const tgt =
        opts.target != null &&
        opts.target !== pi &&
        this.players[opts.target] &&
        !this.players[opts.target].out
          ? opts.target
          : this.nextIdx(pi, 1);
      let given = 0;
      for (let r = 0; r < 2 * k && p.hand.length > 1; r++) {
        const free = p.hand.filter((c) => !c.lock && !c.uniq);
        if (!free.length) break;
        const c = free[Math.floor(this.random() * free.length)];
        p.hand.splice(p.hand.indexOf(c), 1);
        this.players[tgt].hand.push(c);
        given++;
      }
      if (given) this.alms(pi, given);
      this.addLog(`${p.name} gives ${this.players[tgt].name} ${given} cards.`, 'swap', 'gift', {
        n: p.name,
        t: this.players[tgt].name,
        g: given,
      });
      this.ev('gift', { a: pi, b: tgt, g: given });
      break;
    }
    case 'echo': {
      // repeats the card it was played on: draw cards, skips and reverses
      const pv = prevFace ? prevFace.v : null;
      if (pv && DRAW_VAL[pv]) {
        this.pending +=
          DRAW_VAL[pv] * k * (this.inflate > 0 ? 2 : 1) * this.multNext * this.dmul(pi, false);
        this.multNext = 1;
        this.stackMin = DRAW_VAL[pv];
        this.stackFrom = pi;
        if (pv === 'wrd4' || pv === 'wrd8') {
          if (k % 2) {
            this.dir *= -1;
            this.ev('reverse', { dir: this.dir });
          }
        }
      } else if (pv === 'skip' || pv === 'freeze') {
        steps = 1 + k * (pv === 'freeze' ? 2 : 1);
        for (let s = 1; s < steps; s++) this.ev('skip', { pi: this.nextIdx(pi, s) });
      } else if (pv === 'skipall') {
        steps = 0;
        this.ev('skipall', { pi });
      } else if (pv === 'rev') {
        if (k % 2) {
          this.dir *= -1;
          steps = n === 2 ? 2 : 1;
          this.ev('reverse', { dir: this.dir });
        }
      }
      const copied = pv && (DRAW_VAL[pv] || ['skip', 'freeze', 'skipall', 'rev'].includes(pv));
      this.addLog(
        copied
          ? `${p.name}'s echo repeats ${faceName(prevFace)}.`
          : `${p.name}'s echo fades: nothing to repeat.`,
        copied ? 'stack' : '',
        copied ? 'echo' : 'echoNone',
        { n: p.name, f: prevFace },
      );
      this.ev('echo', { pi, ok: copied ? 1 : 0 });
      break;
    }
    case 'freeze':
      // skips the next two players per card
      steps = Math.min(n, 1 + 2 * k);
      for (let s = 1; s < steps; s++) this.ev('skip', { pi: this.nextIdx(pi, s) });
      this.addLog(`${p.name} freezes the next ${steps - 1} players.`, 'flip', 'freeze', {
        n: p.name,
        k: steps - 1,
      });
      break;
    case 'bomb': {
      // the next player takes the blast (+3), both of their neighbours catch shrapnel (+1), you included
      const v = this.nextIdx(pi, 1),
        after = this.nextIdx(v, 1);
      this.hit(pi, v, 3 * k);
      const shr = [...new Set([pi, after])].filter((i) => i !== v);
      for (const i of shr) this.hit(pi, i, k);
      this.addLog(
        `${p.name}'s bomb goes off on ${this.players[v].name}: +${3 * k}; ${shr.map((i) => this.players[i].name).join(' and ')} +${k}.`,
        'bad',
        'bomb',
        { n: p.name, t: this.players[v].name, a: 3 * k, l: shr.map((i) => this.players[i].name), b: k },
      );
      this.ev('bomb', { pi, v });
      break;
    }
    case 'spin': {
      this.addLog(`${p.name} pulls the lever.`, 'flip', 'spin', { n: p.name });
      for (let r = 0; r < k; r++) this.rollChaos();
      break;
    }
    case 'd6': {
      // reroll: your whole hand is replaced by the same number of fresh cards
      const keep = p.hand.filter((c) => c.lock || c.chain || c.uniq),
        cnt = p.hand.length - keep.length;
      p.hand = keep;
      for (let r = 0; r < cnt; r++) p.hand.push(this.newCard());
      this.addLog(`${p.name} rolls the D6: a fresh hand of ${cnt}.`, 'flip', 'd6', {
        n: p.name,
        k: cnt,
      });
      this.ev('d6', { pi, k: cnt });
      break;
    }
    case 'pill': {
      // a scratch card: −10 debt, +10 debt, pick up 2, throw away 2, or 10 chips
      for (let r = 0; r < k; r++) {
        const pl = ['wipe', 'fine', 'draw', 'toss', 'chips'][Math.floor(this.random() * 5)];
        if (pl === 'wipe') this.payDebt(pi, -10, 'pill');
        else if (pl === 'fine') this.payDebt(pi, 10, 'pill');
        else if (pl === 'draw') p.oweN = (p.oweN || 0) + 2;
        else if (pl === 'toss') {
          for (let q = 0; q < 2 && p.hand.length > 1; q++) {
            const free = p.hand.filter((c) => !c.lock);
            if (!free.length) break;
            p.hand.splice(p.hand.indexOf(free[Math.floor(this.random() * free.length)]), 1);
          }
        } else if (this.chipsWon) this.chipsWon[pi] += 10;
        this.addLog(
          `${p.name} scratches a ticket: ${pl}.`,
          pl === 'fine' || pl === 'draw' ? 'bad' : 'win',
          'pill2',
          { n: p.name, p: pl },
        );
        this.ev('pill', { pi, p: pl });
      }
      break;
    }
    case 'maze':
      this.maze = 6 * k;
      this.addLog(
        `${p.name} curses the table: Curse of the Maze for ${this.maze} plays.`,
        'flip',
        'maze',
        { n: p.name, k: this.maze },
      );
      this.ev('maze', { pi, k: this.maze });
      break;
    case 'deal': {
      // a contract: half your hand burns (chained cards stay), and the demon takes notice: +15% to its charge
      const gone = Math.floor(p.hand.filter((c) => !c.lock && !c.uniq).length / 2);
      for (let r = 0; r < gone; r++) {
        const free = p.hand.filter((c) => !c.lock && !c.uniq);
        p.hand.splice(p.hand.indexOf(free[Math.floor(this.random() * free.length)]), 1);
      }
      if (canDark(p)) p.demon = (p.demon || 0) + 15;
      this.addLog(
        `${p.name} signs a contract: ${gone} cards burn. The demon takes notice.`,
        'bad',
        'deal2',
        { n: p.name, g: gone },
      );
      this.ev('deal', { pi, g: gone });
      break;
    }
    case 'djoker': {
      // the demonic joker: everyone gets 3 random cards chained for 2 turns (never past half a hand)
      let tot = 0;
      this.players.forEach((q, i) => {
        if (q.out) return;
        const free = q.hand.filter((c) => !c.lock && !c.chain).sort(() => this.random() - 0.5);
        tot += this.chainUp(q, free.slice(0, 3), 2);
      });
      this.addLog(`${p.name} plays the demonic joker: chains on every hand.`, 'bad', 'djoker', {
        n: p.name,
        k: tot,
      });
      this.ev('djoker', { pi, k: tot });
      break;
    }
    case 'swind': {
      // Second Wind: half of the rest of your hand (rounded up) turns into wilds
      const free = p.hand.filter((c) => !c.lock && this.f(c).c !== 'w').sort(() => this.random() - 0.5);
      const n2 = Math.ceil(p.hand.length / 2);
      for (const c of free.slice(0, n2)) {
        c.L = { c: 'w', v: 'wild' };
        c.D = { c: 'w', v: 'wild' };
      }
      this.addLog(
        `${p.name} catches a second wind: ${Math.min(n2, free.length)} cards turn wild.`,
        'win',
        'swind',
        { n: p.name, k: Math.min(n2, free.length) },
      );
      this.ev('swind', { pi, k: Math.min(n2, free.length) });
      break;
    }
    case 'sacr': {
      // Sacrifice: the target takes 10 cards, chained for 2 of their turns. Nothing blocks it.
      const tgt =
        opts.target != null &&
        opts.target !== pi &&
        this.players[opts.target] &&
        !this.players[opts.target].out
          ? opts.target
          : this.nextIdx(pi, 1);
      const t = this.players[tgt];
      const add = [];
      for (let r = 0; r < 10; r++) {
        const c = this.next;
        this.next = this.newCard();
        t.hand.push(c);
        add.push(c);
      }
      this.chainUp(t, add, 2);
      this.addLog(`${p.name} offers a sacrifice: ${t.name} takes 10 chained cards.`, 'bad', 'sacr', {
        n: p.name,
        t: t.name,
      });
      this.ev('sacr', { pi, t: tgt });
      this.ev('draw', { pi: tgt, k: 10 });
      if (this.chipsWon && hasDeal(p, 'blood')) this.chipsWon[pi] += 10;
      break;
    }
    case 'loan': {
      // 20 chips now; after 3 more of your plays, 30 debt
      if (this.chipsWon) this.chipsWon[pi] += 20 * k;
      p.loan = 3;
      p.loanAmt = 30 * k;
      this.addLog(
        `${p.name} takes a loan: ${20 * k}¢ now, ${30 * k} debt after 3 plays.`,
        'swap',
        'loan2',
        { n: p.name, c: 20 * k, d: 30 * k },
      );
      this.ev('loan', { pi });
      break;
    }
    case 'roul':
      this.roulette = this.nextIdx(pi, 1);
      this.ev('roulette', { pi: this.roulette });
      break;
    case 'wdc': {
      const vi = this.nextIdx(pi, 1),
        col = this.color;
      this.debt = { pi: vi, until: col, got: 0, kind: 'wdc' };
      this.addLog(
        `${this.players[vi].name} must draw until they hit ${COLOR_NAME[col]}.`,
        'bad',
        'wdc',
        { n: this.players[vi].name, c: col },
      );
      this.turn = vi;
      steps = -1;
      break;
    }
    case 'dflip':
    case 'flip': {
      if (k % 2 === 0) {
        this.addLog(
          `${k} flips cancel out. The table stays on the ${this.side === 'D' ? 'dark' : 'light'} side.`,
          'flip',
          'flipsCancel',
          { k, dk: this.side === 'D' ? 1 : 0 },
        );
        break;
      }
      this.side = other(this.side);
      this.flipBack = face.v === 'dflip' ? { pi: this.nextIdx(pi, 1), seq: this.seq } : null;
      const nf = this.f(this.top);
      this.color = nf.c === 'w' || nf.c === 'x' ? this.validColor(opts.flipColor, pi) : nf.c;
      this.addLog(
        `Flip. Everything turns to the ${this.side === 'D' ? 'dark' : 'light'} side. Top card is now ${faceName(nf)}${nf.c === 'w' || nf.c === 'x' ? ' → ' + COLOR_NAME[this.color] : ''}.`,
        'flip',
        'flip',
        { dk: this.side === 'D' ? 1 : 0, f: nf, c: nf.c === 'w' || nf.c === 'x' ? this.color : null },
      );
      this.ev('flip', { side: this.side });
      if (face.v === 'dflip')
        this.addLog(
          `Double flip: it turns back after ${this.players[this.nextIdx(pi, 1)].name}'s turn.`,
          'flip',
          'dflip',
          { n: this.players[this.nextIdx(pi, 1)].name },
        );
      break;
    }
  }
  this.pending = Math.min(MAX_STACK, this.pending);
  if (face.v === 'roul' && !blank) this.turn = this.roulette;
  else if (steps >= 0) this.turn = steps === 0 ? pi : this.nextIdx(pi, steps);
  if (steps === 0 && this.turn === pi) {
    this.againN = (this.againN || 0) + 1;
    this.drewBy = -1;
    this.addLog(`${p.name} goes again.`, 'stk', 'again', { n: p.name });
    this.ev('again', { pi });
  }
  this.applyShield();
  this.checkFlipBack(steps >= 0 ? pi : undefined);
  if (this.inflate > 0) this.inflate--;
  if (this.lock > 0) this.lock--;
  if (this.rules.potato !== false && this.winner === null && this.potato && this.side === 'D') {
    // the dynamite only burns at night
    const pt = this.potato;
    if (pt.fuse > 0 && --pt.fuse === 0) {
      const v = this.turn;
      this.hit(pi, v, 3);
      this.addLog(`The hot potato blows up on ${this.players[v].name}: +3.`, 'bad', 'potato', {
        n: this.players[v].name,
      });
      this.ev('potato', { pi: v });
      pt.cool = 10 + Math.floor(this.random() * 8);
    } else if (pt.fuse === 0 && pt.cool > 0 && --pt.cool === 0) {
      pt.fuse = 10 + Math.floor(this.random() * 10);
      this.addLog('A new hot potato starts ticking.', 'flip', 'potatoLit', {});
      this.ev('potatoLit', {});
    }
  }
  if (this.maze > 0 && face.v !== 'maze') {
    this.maze--;
    if (this.random() < 0.5 && steps >= 0 && face.v !== 'roul') {
      this.dir *= -1;
      this.turn = steps === 0 ? pi : this.nextIdx(pi, steps);
      this.ev('reverse', { dir: this.dir });
      this.addLog('The maze twists: direction flips.', 'flip', 'mazeTwist', {});
    }
  }
  if (this.rules.chaos && this.winner === null && this.side === 'L' && --this.chaosIn <= 0)
    this.rollChaos(); // the slot machine only runs by day
  if (this.pending > 0 && DRAW_VAL[face.v] && !blank) {
    this.addLog(
      `Stack is now +${this.pending}. ${this.players[this.turn].name} must stack or take it.`,
      'stack',
      'stack',
      { k: this.pending, n: this.players[this.turn].name },
    );
    this.ev('stack', { k: this.pending, pi: this.turn });
  }
  // Skips and extra turns can return play to the same seat, without triggering the turn setter.
  if (steps >= 0 && this.roulette === null && this.turn === pi && (this.turnNo || 0) === startingTurn)
    this.turnNo = startingTurn + 1;
  this.standingCheck();
  return true;
}
// Double Flip: once the player after the flipper has acted, the table turns back.
