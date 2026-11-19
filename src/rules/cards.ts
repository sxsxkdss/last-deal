import { DJ_VALUE } from './contracts.ts';
export const SIDE_COLORS = { L: ['r', 'y', 'g', 'b'], D: ['p', 't', 'o', 'v'] };
export const COLOR_NAME = {
  r: 'Red',
  y: 'Yellow',
  g: 'Green',
  b: 'Blue',
  p: 'Pink',
  t: 'Teal',
  o: 'Orange',
  v: 'Purple',
  w: 'Wild',
  x: 'Dead',
};
export const VALUE_NAME = {
  skip: 'Skip',
  rev: 'Reverse',
  d1: 'Draw 1',
  d2: 'Draw 2',
  d4: 'Draw 4',
  d5: 'Draw 5',
  flip: 'Flip',
  discall: 'Discard All',
  skipall: 'Skip Everyone',
  wild: 'Wild',
  wd2: 'Wild Draw 2',
  wd4: 'Wild Draw 4',
  wrd4: 'Wild Reverse Draw 4',
  wd6: 'Wild Draw 6',
  wd10: 'Wild Draw 10',
  wrd8: 'Wild Reverse Draw 8',
  wdc: 'Wild Draw Color',
  roul: 'Wild Color Roulette',
  mirror: 'Mirror',
  shield: 'Vest',
  dflip: 'Eclipse',
  wd15: 'Wild Draw 15',
  mul2: 'Wild Double Down',
  mul3: 'Wild Triple Down',
  lucky: 'Horseshoe',
  glass: 'Shot Glass',
  spin: 'Wild Jackpot',
  loan: 'Loan',
  gift: 'Tip',
  echo: 'Wild Encore',
  freeze: 'Handcuffs',
  bomb: 'Shotgun',
  d6: 'Wild Redeal',
  pill: 'Scratch Card',
  maze: 'Spinner',
  deal: 'Wild Contract',
  lead: 'Lead',
  leech: 'Leech',
  fuse: 'Lit Fuse',
};
// The House's own cards. Each has one job; overlapping ones were cut.
export const EXTRA_CARDS = [
  'mirror',
  'shield',
  'dflip',
  'wd15',
  'mul2',
  'mul3',
  'lucky',
  'glass',
  'spin',
  'loan',
  'gift',
  'echo',
  'freeze',
  'bomb',
  'd6',
  'pill',
  'maze',
  'deal',
];
export const LAST_CALL = 150;
export const MAX_STACK = 60;
// ---- debt match: what a card left in your hand costs you at the end of a deal ----
export function debtValue(f) {
  if (BAD_VALUE[f.v]) return BAD_VALUE[f.v];
  if (f.v === 'djoker') return DJ_VALUE;
  if (/^\d$/.test(f.v) && f.c !== 'w') return +f.v;
  if (f.c === 'w') return ['wild'].includes(f.v) ? 25 : 35;
  if (['d4', 'd5', 'skipall'].includes(f.v)) return 20;
  if (['skip', 'rev', 'd1', 'd2', 'flip', 'discall'].includes(f.v)) return 12;
  return 35; // house cards (and the unique ones)
}
// ---- bad cards: rare colourless dead weight. Reasons to pass cards along when a deal starts. ----
// Lead: plays on anything (never on a stack), the colour stays, you pick up 2.
// Leech: only goes down as your very last card; it feeds at the start of your turns (+1) and drops off after 3 meals.
// Lit fuse: can't be played at all; after 3 of your turns it blows up in your hand (+4) and is gone.
export const BAD = ['lead', 'leech', 'fuse'];
export const BAD_VALUE = { lead: 30, leech: 25, fuse: 25 };
export const FUSE_TURNS = 3,
  LEAD_DRAW = 2,
  FUSE_HIT = 4,
  LEECH_MEALS = 3;
export const isBad = (f) => !!f && f.c === 'x';
// tokens sold in the shop; price in chips
export const ATTACK_FACES = new Set(['mul2', 'mul3', 'glass', 'bomb', 'gift', 'sacr']);
export const TOKENS = [
  'safe',
  'sharp',
  'pad',
  'counter',
  'light',
  'debtor',
  'license',
  'luck',
  'usurer',
];
export const PRICES = {
  token: 20,
  pay: 10,
  payAmount: 25,
  setup: 15,
  interest: 25,
  candle: 10,
  blood: 10,
};
export const DEBT_LIMITS = [250, 500, 1000];
// Lobby presets. Every rule key the server knows, every house card.
export const RULE_ALL = [
  'flip',
  'stacking',
  'multi',
  'combos',
  'gamble',
  'lastCall',
  'potato',
  'drawUntil',
  'chaos',
];
export const PRESETS = (() => {
  const on = (keys, all) => Object.fromEntries(all.map((k) => [k, keys.includes(k)]));
  const base = ['flip', 'stacking', 'multi', 'drawUntil', 'lastCall'];
  return {
    classic: { rules: on(base, RULE_ALL), cards: on([], EXTRA_CARDS) },
    den: {
      rules: on(base.concat(['combos', 'gamble', 'potato', 'chaos']), RULE_ALL),
      cards: on(
        EXTRA_CARDS.filter((k) => !['deal', 'wd15'].includes(k)),
        EXTRA_CARDS,
      ),
    },
    mayhem: { rules: on(RULE_ALL, RULE_ALL), cards: on(EXTRA_CARDS, EXTRA_CARDS) },
  };
})();
export const DRAW_VAL = {
  d1: 1,
  d2: 2,
  wd2: 2,
  d4: 4,
  wd4: 4,
  wrd4: 4,
  d5: 5,
  wd6: 6,
  wrd8: 8,
  wd10: 10,
  wd15: 15,
};
// Weights for each side. Light = classic UNO + Flip light side + No Mercy. Dark = Flip dark side, nastier.
export const SIDE_WEIGHTS: Record<string, Record<string, Record<string, number>>> = {
  L: {
    colored: {
      '0': 2,
      '1': 4,
      '2': 4,
      '3': 4,
      '4': 4,
      '5': 4,
      '6': 4,
      '7': 4,
      '8': 4,
      '9': 4,
      skip: 2,
      rev: 2,
      d1: 2,
      d2: 2,
      flip: 2,
      d4: 1,
      discall: 2,
      skipall: 1,
      mirror: 1.5,
      shield: 1,
      dflip: 1,
      lucky: 1,
      glass: 1,
      loan: 1,
      gift: 1,
      pill: 1,
    },
    wild: {
      wild: 4,
      wd2: 2,
      wd4: 2,
      wrd4: 2,
      wd6: 1,
      wd10: 0.5,
      roul: 1.5,
      mul2: 1.5,
      spin: 2,
      echo: 2,
      d6: 1,
      swind: 0,
      sacr: 0,
      djoker: 0,
    },
    bad: { lead: 1.2, leech: 1, fuse: 1 },
  },
  D: {
    colored: {
      '1': 4,
      '2': 4,
      '3': 4,
      '4': 4,
      '5': 4,
      '6': 4,
      '7': 4,
      '8': 4,
      '9': 4,
      skipall: 2,
      rev: 2,
      d5: 1.5,
      flip: 2,
      discall: 2,
      dflip: 1,
      glass: 1,
      freeze: 1,
      bomb: 1,
      maze: 1,
    },
    wild: {
      wild: 4,
      wdc: 2,
      wd6: 1.5,
      wd10: 1,
      wrd8: 1,
      roul: 1.5,
      wd15: 0.5,
      mul3: 1,
      deal: 1,
      swind: 0,
      sacr: 0,
      djoker: 0,
    },
    bad: { lead: 1.2, leech: 1, fuse: 1 },
  },
};
export interface PrintedFace {
  side: Side;
  color: string;
  effect: string;
  title: string;
  weight: number;
}
export const PRINTED_FACES: PrintedFace[] = [];
export const ATTACK_VALS = { L: ['d1', 'd2', 'd4'], D: ['d5'] };
export const FACES: Record<string, Face[]> = {},
  FACE_W: Record<string, number[]> = {};
for (const s of ['L', 'D']) {
  FACES[s] = [];
  FACE_W[s] = [];
  for (const c of SIDE_COLORS[s])
    for (const [v, w] of Object.entries(SIDE_WEIGHTS[s].colored)) {
      FACES[s].push({ c, v });
      FACE_W[s].push(w);
    }
  for (const [v, w] of Object.entries(SIDE_WEIGHTS[s].wild)) {
    FACES[s].push({ c: 'w', v });
    FACE_W[s].push(w);
  }
  for (const [v, w] of Object.entries(SIDE_WEIGHTS[s].bad)) {
    FACES[s].push({ c: 'x', v });
    FACE_W[s].push(w);
  }
}
for (const definition of PRINTED_FACES) {
  FACES[definition.side].push({ c: definition.color, v: definition.effect, title: definition.title });
  FACE_W[definition.side].push(definition.weight);
}
// War can arm a curse card. These faces can be encoded but are not drawn.
export const WIRE_FACES: Record<Side, Face[]> = {
  L: [...FACES.L, ...ATTACK_VALS.L.map((v) => ({ c: 'x', v }))],
  D: [...FACES.D, ...ATTACK_VALS.D.map((v) => ({ c: 'x', v }))],
};
// Safe printable chars ('#'..'~' minus backslash, then Latin-1 ¡..ÿ) index faces on the wire: 1 char per side.
export const ALPHA =
  Array.from({ length: 92 }, (_, i) => String.fromCharCode(35 + i))
    .filter((ch) => ch !== '\\')
    .join('') + Array.from({ length: 95 }, (_, i) => String.fromCharCode(161 + i)).join('');
export const faceIdx = (s, f) =>
  WIRE_FACES[s].findIndex((x) => x.c === f.c && x.v === f.v && x.title === f.title);
export const cardCode = (card) => ALPHA[faceIdx('L', card.L)] + ALPHA[faceIdx('D', card.D)];
export const other = (s) => (s === 'L' ? 'D' : 'L');
export function faceName(f) {
  return f.c === 'w' ? VALUE_NAME[f.v] : COLOR_NAME[f.c] + ' ' + (VALUE_NAME[f.v] || f.v);
}

export type Side = 'L' | 'D';
export interface Face {
  c: string;
  v: string;
  title?: string;
}
export interface Card {
  id: number;
  L: Face;
  D: Face;
  uniq?: boolean;
  lock?: boolean;
  chain?: number;
  hidden?: boolean;
  meals?: number;
  fuse?: number;
}
