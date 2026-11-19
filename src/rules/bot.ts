import { DRAW_VAL, SIDE_COLORS, debtValue, isBad, other } from './cards.ts';
import { DEAL_TIER, hasDeal, nDark, nLight } from './contracts.ts';
import { comboCands, comboOf, comboWorth } from './poker.ts';

export const BOT_PROFILES = ['standard', 'cautious', 'aggressive', 'combos', 'debt'] as const;
export type BotProfile = (typeof BOT_PROFILES)[number];
export const DEFAULT_BOT_PROFILE: BotProfile = 'standard';
const weights = {
  standard: { attack: 0, risk: 0, combination: 0, debt: 0 },
  cautious: { attack: -0.55, risk: 8, combination: 0, debt: 0.04 },
  aggressive: { attack: 1.45, risk: -3, combination: 0, debt: 0 },
  combos: { attack: 0, risk: 0, combination: 10, debt: 0 },
  debt: { attack: -0.2, risk: 4, combination: 4, debt: 0.24 },
} satisfies Record<BotProfile, { attack: number; risk: number; combination: number; debt: number }>;

export const Bot = {
  // who to aim the revolver at: whoever is closest to going out
  gambleTarget(G, pi) {
    let best = -1;
    G.players.forEach((q, i) => {
      if (i !== pi && !q.out && (best < 0 || q.hand.length < G.players[best].hand.length)) best = i;
    });
    return best;
  },
  // deals: light ones are always taken (best for the moment), dark ones while the debt is still manageable
  // bots and the Dark shop's items: simple habits
  item(g, pi) {
    const p = g.players[pi],
      has = (id) => g.canUseItem(pi, id);
    if (has('rent')) return 'rent';
    if (has('oven')) return 'oven';
    const big = p.hand.length > 12;
    if (big && has('shell')) return 'shell';
    if (big && g.side === 'D' && has('veil')) return 'veil';
    if (big && g.side === 'L' && has('dawn')) return 'dawn';
    if (has('eclipse') && g.random() < 0.1) return 'eclipse';
    const room = p.limit ? p.debt / p.limit : 0;
    if (room > 0.55 && has('penance')) return 'penance';
    if (room > 0.6 && has('bail')) return 'bail';
    // the cross: when a rival leans on light deals
    if (
      has('cross') &&
      g.players.some((q, i) => i !== pi && !q.out && nLight(q) > 0) &&
      g.random() < 0.3
    )
      return 'cross';
    return null;
  },
  deal(g, pi) {
    const o = g.offer,
      p = g.players[pi];
    if (!o || o.pi !== pi) return null;
    // the strongest first; Desecration is free for someone already dark, otherwise the bot weighs losing the angel
    const tier = (d) =>
      (DEAL_TIER[d] || 1) + (d === 'desecrate' ? (nDark(p) ? 1 : -1.5) : 0) + g.random() * 0.8;
    const best = o.opts.slice().sort((a, b) => tier(b) - tier(a))[0];
    if (o.kind === 'dark') {
      const room = p.limit ? p.debt / p.limit : 0;
      if (best !== 'bail' && (room > 0.65 || g.random() < 0.35)) return { id: null };
    }
    const tgt = g.players
      .map((q, i) => i)
      .filter((i) => i !== pi && !g.players[i].out)
      .sort((a, b) => g.players[a].hand.length - g.players[b].hand.length)[0];
    return { id: best, target: tgt };
  },
  // deals used by hand: Ascension with a fat hand, the Puppeteer before a stack hits the next player, Redemption on the worst cards
  ability(g, pi) {
    const p = g.players[pi];
    if (!p || g.turn !== pi) return null;
    if (g.hasL(p, 'wind') && !p.used.wind && p.hand.length >= 8) return { k: 'wind' };
    if (g.hasL(p, 'confess') && !p.used.confess && p.hand.length >= 6) {
      const worst = p.hand
        .filter((c) => !c.lock && !c.uniq)
        .sort((a, b) => debtValue(g.f(b)) - debtValue(g.f(a)))
        .slice(0, 3);
      if (worst.length) return { k: 'confess', cards: worst.map((c) => c.id) };
    }
    // the Puppeteer first, then the draw card: the next player can't answer it
    if (hasDeal(p, 'puppet') && g.pending === 0) {
      const t = g.nextIdx(pi, 1),
        q = g.players[t];
      if (
        t !== pi &&
        p.puppetLast !== t &&
        !q.skipNext &&
        q.hand.length <= 5 &&
        (p.debt || 0) < p.limit * 0.7 &&
        g.playable(pi).some((c) => DRAW_VAL[g.f(c).v])
      )
        return { k: 'puppet' };
    }
    return null;
  },
  strength(f) {
    if (!f) return 0;
    if (f.c === 'w') return 3 + (DRAW_VAL[f.v] || 0) / 2;
    if (DRAW_VAL[f.v]) return 1.5 + DRAW_VAL[f.v] / 2;
    return isNaN(+f.v) ? 2 : 1;
  },
  bestColor(g, hand, side) {
    const cols = SIDE_COLORS[side];
    const cnt = Object.fromEntries(cols.map((c) => [c, 0]));
    for (const c of hand) {
      if (c.hidden) continue;
      const f = c[side];
      if (f.c !== 'w') cnt[f.c] += 1 + (isNaN(+f.v) ? 0.5 : 0);
    }
    let best = cols[Math.floor(g.random() * 4)],
      bv = 0;
    for (const k of cols)
      if (cnt[k] > bv) {
        bv = cnt[k];
        best = k;
      }
    return best;
  },
  choose(g, pi, profile: BotProfile = DEFAULT_BOT_PROFILE) {
    const strategy = weights[profile];
    const p = g.players[pi];
    const opts = g.playable(pi);
    if (!opts.length) return null;
    const nextI = g.nextIdx(pi, 1),
      nl = g.players[nextI].hand.length;
    const others = g.players.map((q, i) => ({ q, i })).filter((o) => o.i !== pi && !o.q.out);
    const minOther = others.reduce((a, b) => (b.q.hand.length < a.q.hand.length ? b : a), others[0]);
    const colorCount = (c) => p.hand.filter((x) => g.f(x).c === c).length;
    let best = null,
      bestScore = -Infinity;
    for (const card of opts) {
      const f = g.f(card);
      let s = 10 + g.random() * 3;
      if (isBad(f)) {
        s = f.v === 'leech' ? 100 : opts.length === 1 ? 1 : -50;
        if (s > bestScore) {
          bestScore = s;
          best = card;
        }
        continue;
      }
      if (g.pending > 0) {
        if (f.v === 'mirror') s += g.pending >= 4 ? 30 : -2;
        else if (f.v === 'mul2' || f.v === 'mul3') s += g.pending >= 4 ? 18 : 4;
        else if (f.v === 'echo') s += 6;
        else {
          s -= DRAW_VAL[f.v];
          if (f.c === 'w') s -= 3;
        }
      } else {
        const dv = DRAW_VAL[f.v] || 0;
        s += strategy.attack * dv;
        if (p.limit > 0) s += strategy.debt * debtValue(f);
        if (f.v === 'glass' || f.v === 'pill' || f.v === 'loan') s -= strategy.risk;
        if (f.c === 'w') s -= p.hand.length > 3 ? 8 : 0;
        if (dv) s += dv * 1.5 + (nl <= 3 ? 20 : 0);
        if (f.v === 'skip' || f.v === 'rev') s += nl <= 3 ? 12 : 3;
        if (f.v === 'skipall') s += 6 + (nl <= 3 ? 10 : 0);
        if (f.v === 'discall') s += 5 * (colorCount(f.c) - 1);
        if (f.v === 'roul' || f.v === 'wdc') s += nl <= 3 ? 18 : 6;
        if (f.v === 'mirror') s -= 6; // save it for a stack
        if (f.v === 'shield') s += p.shield ? -8 : 4;
        if (f.v === 'mul2' || f.v === 'mul3') s -= 5; // better saved for a stack
        if (f.v === 'lucky') s += 3;
        if (f.v === 'glass') s += nl <= 3 ? 14 : 6;
        if (f.v === 'spin') s += 2;
        if (f.v === 'loan') s += p.loan ? -10 : p.hand.length >= 6 ? 6 : -2;
        if (f.v === 'swind') s += p.hand.length >= 6 ? 14 : -6;
        if (f.v === 'sacr') s += 16;
        if (f.v === 'gift') s += p.hand.length >= 4 ? 10 : 2;
        if (f.v === 'echo') {
          const tv = g.top ? g.f(g.top).v : null;
          s += DRAW_VAL[tv] ? 9 : ['skip', 'skipall'].includes(tv) ? 5 : -4;
        }
        if (f.v === 'freeze') s += nl <= 3 ? 12 : 5;
        if (f.v === 'bomb') s += nl <= 3 ? 14 : 6;
        if (f.v === 'd6') s += p.hand.length >= 8 ? 4 : -6;
        if (f.v === 'pill') s += 2;
        if (f.v === 'maze') s += 0;
        if (f.v === 'deal') s += p.hand.length >= 6 ? 12 : -4;
        if (f.v === 'dflip') s += nl <= 3 ? 8 : 1;
        if (f.v === 'flip') {
          const rest = p.hand.filter((c) => c !== card);
          const gain = rest.reduce((a, c) => a + Bot.strength(g.back(c)) - Bot.strength(g.f(c)), 0);
          s += gain * 0.7 + (nl <= 3 ? 5 : 0);
        }
        if (f.c !== 'w') s += colorCount(f.c) * 0.8;
      }
      if (s > bestScore) {
        bestScore = s;
        best = card;
      }
    }
    // a poker hand that can start with a card that fits beats the single card when it's worth more
    if (
      g.rules.multi &&
      g.rules.combos !== false &&
      g.pending === 0 &&
      !g.horseOn('famine', 'two', pi)
    ) {
      let top = null,
        topW = 0;
      for (const cs of comboCands(p.hand, (c) => g.f(c))) {
        const cb = comboOf(cs.map((c) => g.f(c)));
        if (!cb) continue;
        const lead = cs.find((c) => opts.includes(c));
        if (!lead) continue;
        const w = comboWorth(cb, cs.length, g.side, others.length);
        if (w > topW) {
          topW = w;
          top = { lead, cs };
        }
      }
      if (top && topW + 4 + strategy.combination >= bestScore - 10) {
        const extra = top.cs.filter((c) => c !== top.lead),
          lf = g.f(top.lead),
          rest = p.hand.filter((c) => !top.cs.includes(c));
        return {
          cardId: top.lead.id,
          extra: extra.map((c) => c.id),
          color: lf.c === 'w' ? this.bestColor(g, rest, g.side) : null,
          flipColor: null,
          target: null,
        };
      }
    }
    const bf = g.f(best);
    // drop every matching card when the table allows it
    let extra = g.rules.multi
      ? p.hand.filter((c) => c !== best && g.f(c).v === bf.v && (g.f(c).c === 'w') === (bf.c === 'w'))
      : [];
    const rest = p.hand.filter((c) => c !== best && !extra.includes(c));
    return {
      cardId: best.id,
      extra: extra.map((c) => c.id),
      color: bf.c === 'w' ? this.bestColor(g, rest, g.side) : null,
      flipColor: bf.v === 'flip' || bf.v === 'dflip' ? this.bestColor(g, rest, other(g.side)) : null,
      target: bf.v === 'gift' || bf.v === 'sacr' ? minOther.i : null,
    };
  },
};
