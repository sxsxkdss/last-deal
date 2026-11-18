import type { Game } from '../rules/game.ts';
import { ALPHA, faceIdx, cardCode, other } from '../rules/cards.ts';
import { hasDeal } from '../rules/contracts.ts';

// Adapt the TypeScript table to the original renderer’s seat-specific snapshot.
export function serialize(g: Game, viewer: number, logN = 12) {
  const ob = other(g.side);
  return {
    gid: g.gid,
    ru: g.rules,
    sd: g.side,
    p: g.players.map((p, i) => [
      p.name,
      p.av || '',
      p.peer || '',
      i === viewer
        ? p.hand.map(cardCode).join('')
        : '!' + p.hand.map((c) => ALPHA[faceIdx(ob, c[ob])]).join(''),
      (p.out ? 1 : 0) | (p.elim ? 2 : 0) | (p.human ? 16 : 0) | (p.shield ? 32 : 0) | (p.left ? 64 : 0),
      (p.oweN || 0) + ((p.owed && p.owed.length) || 0),
      p.loan || 0,
      p.hand
        .map((c, k) => (c.lock || c.chain ? [k, c.chain || 0, c.lock ? 1 : 0] : null))
        .filter(Boolean),
      [
        i === viewer ? Math.round((p.angel || 0) * 10) / 10 : 0,
        i === viewer ? g.demonChance(i) : 0,
        (p.deals || []).join('+'),
        (p.fallen ? 4 : 0) |
          (p.broke ? 8 : 0) |
          (p.skipNext ? 16 : 0) |
          (p.signedNow ? 32 : 0) |
          (p.noAngel ? 64 : 0) |
          (p.tookLight ? 128 : 0),
        p.debt || 0,
        p.limit || 0,
        p.markT ?? -1,
        Object.keys(p.used || {}).join(','),
        p.exT ?? -1,
        p.puppetLast ?? -1,
        p.angelBlock || 0,
      ],
      p.hand.map((c) => (c.uniq ? 1 : 0)).join(''),
      [
        (p.inv || []).join(','),
        Object.entries(p.fx || {})
          .map(([k, v]) => (v === true ? k : k + ':' + v))
          .join(','),
        p.buff || 0,
      ],
      i === viewer ? p.hand.map((c) => c.id) : null,
    ]),
    of: g.offer ? [g.offer.pi, g.offer.kind, viewer === g.offer.pi ? g.offer.opts : []] : null,
    hz:
      g.horse && g.horse.left > 0
        ? [g.horse.k, g.horse.v, g.horse.left, (g.horse.curses || []).join(',')]
        : null,
    nf:
      viewer >= 0 && g.players[viewer] && hasDeal(g.players[viewer], 'sharp') ? cardCode(g.next) : null,
    t: cardCode(g.top),
    ti: g.top.id,
    cx: [
      g.chaosIn || 0,
      g.inflate || 0,
      g.lock || 0,
      g.multNext || 1,
      g.maze || 0,
      g.potato && g.potato.fuse > 0 ? (g.potato.fuse <= 2 ? 2 : 1) : 0,
      g.turnNo || 0,
      g.crossLeft || 0,
    ],
    db: g.debt ? [g.debt.pi, g.debt.n || 0, g.debt.until || '', g.debt.got || 0, g.debt.kind] : null,
    pl: (g.pile || []).slice(-5),
    pn: g.pileN || 1,
    nb: ALPHA[faceIdx(ob, g.next[ob])],
    c: g.color,
    d: g.dir,
    u: g.turn,
    k: g.pending,
    m: g.stackMin,
    sf: g.stackFrom,
    dr: [g.drawRunPi == null ? -1 : g.drawRunPi, g.drawRun || 0],
    fb: g.flipBack ? [g.flipBack.pi, g.flipBack.seq] : null,
    o: g.roulette === null ? -1 : g.roulette,
    w: g.drewBy,
    x: g.winner === null ? -1 : g.winner,
    s: g.seq,
    l: g.log.slice(-logN).map((l) => [String(l.msg).slice(0, 200), l.cls, l.k || null, l.a || null]),
    ev: g.events.slice(-12),
    es: g.evSeq,
  };
}
