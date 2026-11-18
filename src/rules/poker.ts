import { SIDE_COLORS } from './cards.ts';

// ---------- Balatro combos: number cards played together in one drop ----------
// d: cards thrown away by day / slapped on the next player by night; m: everyone else picks up; r: debt the House forgives by day.
// Ordered by how rare the hand is in a real hand (rarer pays more). The runs pay by length, see comboPlain.
export const COMBOS = {
  pair: { d: 0, m: 0, r: 1 },
  twopair: { d: 1, m: 0, r: 2 },
  three: { d: 1, m: 0, r: 3 },
  straight: { d: 1, m: 0, r: 3 }, // 4+ in a row, any colours: drop n-3, at 6+ everyone picks up 1
  fullhouse: { d: 2, m: 1, r: 6 }, // a set and a pair (drop 2), or two sets (drop 3)
  straightflush: { d: 1, m: 0, r: 4 }, // 3+ in a row of one colour: drop n-2, at 5+ everyone picks up 2 and debt -10
  flush: { d: 2, m: 1, r: 7 }, // 5+ cards of one colour
  four: { d: 2, m: 1, r: 9 }, // four of one number, any colours (rarer than a flush)
  five: { d: 3, m: 2, r: 12 },
};
export const COMBO_RANK = [
  'pair',
  'twopair',
  'three',
  'straight',
  'fullhouse',
  'straightflush',
  'flush',
  'four',
  'five',
];
// a plain Wild (no draw on it) can stand in for any number in a hand, one per hand
export const isJoker = (f) => f && f.c === 'w' && (f.v === 'wild' || f.v === 'djoker');
export function comboPlain(faces) {
  if (!faces || faces.length < 2 || faces.some((f) => !/^\d$/.test(f.v) || f.c === 'w')) return null;
  const n = faces.length,
    nums = faces.map((f) => +f.v),
    chips = nums.reduce((a, b) => a + b, 0);
  const cnt = (Object.values(nums.reduce((o, x) => ((o[x] = (o[x] || 0) + 1), o), {})) as number[]).sort(
    (a, b) => b - a,
  );
  const oneColor = faces.every((f) => f.c === faces[0].c);
  const sorted = nums.slice().sort((a, b) => a - b);
  const run = cnt[0] === 1 && sorted.every((x, i) => !i || x === sorted[i - 1] + 1);
  const shape = cnt.join('');
  let key = null;
  if (cnt[0] === n && n <= 5) key = n === 2 ? 'pair' : n === 3 ? 'three' : n === 4 ? 'four' : 'five';
  else if (run && oneColor && n >= 3) key = 'straightflush';
  else if (run && n >= 4) key = 'straight';
  else if (shape === '22') key = 'twopair';
  else if (shape === '32' || shape === '33') key = 'fullhouse';
  else if (oneColor && n >= 5) key = 'flush';
  if (!key) return null;
  const C = COMBOS[key];
  let d = C.d,
    m = C.m,
    r = C.r;
  if (key === 'straight') {
    d = n - 3;
    m = n >= 6 ? 1 : 0;
  } else if (key === 'straightflush') {
    d = n - 2;
    if (n >= 5) {
      m = 2;
      r = 10;
    }
  } else if (key === 'fullhouse' && n === 6) {
    d = 3;
    r = 8;
  }
  return { key, d, m, r, chips: chips + n * 5, mult: Math.max(1, d + m * 2) };
}
// faces: [{c, v}] in play order. Returns { key, d, m, r, chips, mult } for a valid hand, null otherwise.
export function comboOf(faces) {
  if (!faces || faces.length < 2) return null;
  const jokers = faces.filter(isJoker);
  if (!jokers.length) return comboPlain(faces);
  if (jokers.length > 1) return null;
  const rest = faces.filter((f) => !isJoker(f));
  if (!rest.length || rest.some((f) => !/^\d$/.test(f.v) || f.c === 'w')) return null;
  const side = SIDE_COLORS.L.includes(rest[0].c) ? 'L' : 'D';
  let best = null;
  for (const c of SIDE_COLORS[side])
    for (let v = 0; v <= 9; v++) {
      if (side === 'D' && v === 0) continue;
      const cb = comboPlain(rest.concat([{ c, v: String(v) }]));
      if (
        cb &&
        (!best ||
          COMBO_RANK.indexOf(cb.key) > COMBO_RANK.indexOf(best.key) ||
          (cb.key === best.key && cb.chips * cb.mult > best.chips * best.mult))
      )
        best = cb;
    }
  return best ? Object.assign(best, { joker: true }) : null;
}
// Candidate poker hands in a hand of cards (f gives a card's face). Not every one is valid: comboOf decides.
// Used by the bots and by the hint button, so both see the same hands.
export function comboCands(cards, f) {
  const isNum = (x) => /^\d$/.test(x.v) && x.c !== 'w';
  const nums = cards.filter((c) => !c.lock && isNum(f(c))),
    jok = cards.find((c) => !c.lock && isJoker(f(c)));
  const out = [],
    byV: Record<string, any[]> = {},
    byC: Record<string, any[]> = {};
  for (const c of nums) {
    const x = f(c);
    (byV[x.v] = byV[x.v] || []).push(c);
    (byC[x.c] = byC[x.c] || []).push(c);
  }
  const add = (cs) => {
    if (cs.length >= 2) {
      out.push(cs);
      if (jok && cs.length < 6) out.push(cs.concat([jok]));
    }
  };
  const groups = Object.values(byV).sort((a, b) => b.length - a.length || +f(b[0]).v - +f(a[0]).v);
  for (const g of groups) {
    for (let k = 2; k <= Math.min(5, g.length); k++) add(g.slice(0, k));
    if (jok && g.length === 1) out.push([g[0], jok]);
    const cols = [],
      seen = new Set();
    for (const c of g)
      if (!seen.has(f(c).c)) {
        seen.add(f(c).c);
        cols.push(c);
      }
    if (cols.length >= 3) add(cols.slice(0, 4));
  }
  const pairs = groups.filter((g) => g.length >= 2),
    trips = groups.filter((g) => g.length >= 3),
    singles = groups.filter((g) => g.length === 1);
  if (pairs.length >= 2) add(pairs[0].slice(0, 2).concat(pairs[1].slice(0, 2)));
  if (pairs.length && singles.length) add(pairs[0].slice(0, 2).concat(singles[0])); // + joker: two pair
  for (const t3 of trips)
    for (const p2 of pairs)
      if (p2 !== t3) {
        add(t3.slice(0, 3).concat(p2.slice(0, 2)));
        if (p2.length >= 3) add(t3.slice(0, 3).concat(p2.slice(0, 3)));
      }
  for (const t3 of trips)
    for (const p2 of pairs) if (p2 !== t3) add(t3.slice(0, 3).concat(p2.slice(0, 2))); // + joker: a full house of two sets
  if (pairs.length >= 2) add(pairs[0].slice(0, 2).concat(pairs[1].slice(0, 2)).slice(0, 4)); // + joker: full house
  // runs: the longest stretch of values, with the joker filling one gap
  const runs = (by) => {
    for (let lo = 0; lo <= 9; lo++) {
      const run = [];
      let used = false;
      for (let v = lo; v <= 9; v++) {
        if (by[v]) run.push(by[v]);
        else if (jok && !used && run.length) {
          run.push(jok);
          used = true;
        } else break;
      }
      if (run.length >= 3) out.push(run);
    }
  };
  for (const g of Object.values(byC)) {
    if (g.length >= 5 || (jok && g.length >= 4))
      out.push(jok && g.length < 5 ? g.concat([jok]) : g.slice());
    const by = {};
    for (const c of g) by[+f(c).v] = by[+f(c).v] || c;
    runs(by);
  }
  const any = {};
  for (const c of nums) any[+f(c).v] = any[+f(c).v] || c;
  runs(any);
  return out;
}
// how much a hand is worth to the one laying it down: cards out of the hand, plus what it does to the others
export function comboWorth(cb, n, side, rivals) {
  return n * 3 + (side === 'L' ? cb.d * 3 : cb.d * 2) + cb.m * rivals * 2 + cb.r * 0.3;
}
