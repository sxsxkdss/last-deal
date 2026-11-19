import { DEBT_LIMITS, EXTRA_CARDS, RULE_ALL } from '../rules/cards.ts';
import type { Action, Settings } from '../match/table.ts';
import { BOT_PROFILES, type BotProfile } from '../rules/bot.ts';

export const PROTOCOL = 1;
export type LobbySettings = Partial<Omit<Settings, 'members'>> & { capacity?: number; public?: boolean };
export type LobbyPlayer = [
  name: string,
  online: boolean,
  host: boolean,
  self: boolean,
  bot: boolean,
  profile?: BotProfile | null,
];
type Command =
  | ({ t: 'create'; name: string } & LobbySettings)
  | ({ t: 'settings' } & LobbySettings)
  | { t: 'join'; name: string; code: string }
  | { t: 'resume'; token: string }
  | { t: 'rename'; name: string }
  | { t: 'list' | 'start' | 'rmbot' | 'tolobby' | 'leave' | 'sync' }
  | { t: 'addbot'; profile?: BotProfile }
  | { t: 'action'; action: Action }
  | { t: 'order'; cards: number[]; selected: number[] };
export interface Request {
  n: number;
  revision?: number;
  game?: string;
  phase?: string;
  command: Command;
}
type ObjectValue = Record<string, unknown>;
const object = (x: unknown): x is ObjectValue =>
  x !== null && typeof x === 'object' && !Array.isArray(x);
const str = (x: unknown, max = 32): x is string =>
  typeof x === 'string' && x.length > 0 && x.length <= max;
const integer = (x: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): x is number =>
  typeof x === 'number' && Number.isSafeInteger(x) && x >= min && x <= max;
const ids = (x: unknown, max: number): x is number[] =>
  Array.isArray(x) && x.length <= max && x.every((id) => integer(id, 1)) && new Set(x).size === x.length;
const optional = <T>(x: unknown, check: (x: unknown) => x is T): x is T | undefined =>
  x == null || check(x);
const target = (x: unknown): x is number => integer(x, 0, 5);
const color = (x: unknown): x is string => typeof x === 'string' && /^[rygbptov]$/.test(x);
const flag = (x: unknown): x is boolean => typeof x === 'boolean';
const code = (x: unknown): x is string => typeof x === 'string' && /^[A-Z2-9]{6}$/.test(x);
const token = (x: unknown): x is string => typeof x === 'string' && /^[A-Za-z0-9_-]{43}$/.test(x);
const toggles = (x: unknown, keys: readonly string[]): x is Record<string, boolean> =>
  object(x) && Object.entries(x).every(([key, on]) => keys.includes(key) && flag(on));

function settings(x: ObjectValue): LobbySettings | null {
  const { rules, cards, mode, limit, capacity, public: listed } = x;
  if (
    (mode !== undefined && mode !== 'one' && mode !== 'debt') ||
    (limit !== undefined && (!integer(limit) || !DEBT_LIMITS.includes(limit))) ||
    (capacity !== undefined && !integer(capacity, 2, 6)) ||
    (listed !== undefined && !flag(listed)) ||
    (rules !== undefined && !toggles(rules, RULE_ALL)) ||
    (cards !== undefined && !toggles(cards, EXTRA_CARDS))
  )
    return null;
  return { rules, cards, mode, limit, capacity, public: listed } as LobbySettings;
}

/** Parse the classic client's intents at the transport boundary. */
export function actionOf(x: ObjectValue): Action | null {
  if (x.t === 'draft') return ids(x.ids, 2) ? { k: 'draft', cards: x.ids } : null;
  if (x.t === 'shop' && object(x.a)) {
    const { k, id, target: seat } = x.a;
    if (k === 'done') return { k };
    if (
      typeof k !== 'string' ||
      !['pay', 'token', 'item', 'candle', 'blood', 'setup', 'interest'].includes(k)
    )
      return null;
    if (!optional(id, str) || !optional(seat, target)) return null;
    return { k: 'buy', kind: k, id, target: seat };
  }
  if (x.t === 'col' && (x.k === 'give' || x.k === 'lever') && optional(x.target, target))
    return { k: 'collector', kind: x.k, target: x.target };
  if (x.t !== 'act' || !object(x.a)) return null;
  const a = x.a;
  switch (a.k) {
    case 'draw':
    case 'pass':
      return { k: a.k };
    case 'play':
      if (
        !integer(a.id, 1) ||
        (a.extraIds !== undefined && !ids(a.extraIds, 20)) ||
        !optional(a.color, color) ||
        !optional(a.flipColor, color) ||
        !optional(a.target, target)
      )
        return null;
      if ((a.extraIds as number[] | undefined)?.includes(a.id)) return null;
      return {
        k: 'play',
        cards: [a.id, ...((a.extraIds as number[]) ?? [])],
        color: a.color,
        flipColor: a.flipColor,
        target: a.target,
      };
    case 'gamble':
      return target(a.target) ? { k: a.k, target: a.target } : null;
    case 'roul':
      return color(a.color) ? { k: a.k, color: a.color } : null;
    case 'deal':
      return (a.id === null || str(a.id)) && optional(a.target, target)
        ? { k: a.k, id: a.id as string | null, target: a.target }
        : null;
    case 'item':
      return str(a.id) ? { k: a.k, id: a.id } : null;
    case 'ability':
      return str(a.ab) && (a.ids === undefined || ids(a.ids, 3))
        ? { k: a.k, id: a.ab, cards: (a.ids as number[]) ?? [] }
        : null;
    default:
      return null;
  }
}

export function decodeRequest(value: unknown): Request | null {
  if (!object(value) || value.v !== PROTOCOL || !integer(value.n) || !object(value.command)) return null;
  const { n, revision, game, phase } = value;
  if (
    (revision !== undefined && !integer(revision)) ||
    (game !== undefined && !str(game, 64)) ||
    (phase !== undefined && !str(phase, 8))
  )
    return null;
  const x = value.command;
  let command: Command;
  switch (x.t) {
    case 'create':
    case 'settings': {
      const config = settings(x);
      if (!config) return null;
      if (x.t === 'create') {
        if (!str(x.name, 64)) return null;
        command = { t: 'create', name: x.name, ...config };
      } else command = { t: 'settings', ...config };
      break;
    }
    case 'join':
      if (!code(x.code) || !str(x.name, 64)) return null;
      command = { t: 'join', code: x.code, name: x.name };
      break;
    case 'resume':
      if (!token(x.token)) return null;
      command = { t: 'resume', token: x.token };
      break;
    case 'rename':
      if (!str(x.name, 64)) return null;
      command = { t: 'rename', name: x.name };
      break;
    case 'addbot':
      if (x.profile !== undefined && !BOT_PROFILES.includes(x.profile as BotProfile)) return null;
      command = { t: 'addbot', profile: x.profile as BotProfile | undefined };
      break;
    case 'list':
    case 'start':
    case 'rmbot':
    case 'tolobby':
    case 'leave':
    case 'sync':
      command = { t: x.t };
      break;
    case 'order':
      if (!ids(x.cards, 1200) || !ids(x.selected, 21)) return null;
      command = { t: 'order', cards: x.cards, selected: x.selected };
      break;
    default: {
      const action = actionOf(x);
      if (!action) return null;
      command = { t: 'action', action };
    }
  }
  return {
    n,
    revision: revision as number | undefined,
    game: game as string | undefined,
    phase: phase as string | undefined,
    command,
  };
}
