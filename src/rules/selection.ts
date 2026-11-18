import type { Game } from './game.ts';
import { COMBO_RANK, comboCands, comboOf, comboWorth } from './poker.ts';
export function selection(g: Game, pi: number, ids: number[]) {
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) return null;
  const hand = g.players[pi].hand;
  const cards = ids.map((id) => hand.find((c) => c.id === id));
  if (cards.some((c) => !c || c.lock) || g.turn !== pi) return null;
  const faces = cards.map((c) => g.f(c)),
    first = faces[0],
    lead = cards.find((c) => g.canPlay(c));
  if (!lead) return null;
  if (ids.length > 1) {
    if (!g.rules.multi || g.horseOn('famine', 'two', pi)) return null;
    const combo = g.rules.combos && comboOf(faces);
    const same =
      first.c !== 'x' && faces.every((f) => f.v === first.v && (f.c === 'w') === (first.c === 'w'));
    if (!same && !combo) return null;
  }
  return [lead.id, ...ids.filter((id) => id !== lead.id)];
}
export function hint(g: Game, pi: number) {
  if (!g.rules.multi || !g.rules.combos || g.turn !== pi || g.horseOn('famine', 'two', pi)) return [];
  let best: number[] = [],
    value = -Infinity;
  for (const cs of comboCands(g.players[pi].hand, (c) => g.f(c))) {
    const combo = comboOf(cs.map((c) => g.f(c)));
    if (!combo) continue;
    const score =
      (cs.some((c) => g.canPlay(c)) ? 10000 : 0) +
      10 * comboWorth(combo, cs.length, g.side, 1) +
      COMBO_RANK.indexOf(combo.key);
    if (score > value) {
      value = score;
      best = cs.map((c) => c.id);
    }
  }
  return best;
}
