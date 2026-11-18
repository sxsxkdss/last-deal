import { seeded } from '../match/clock.ts';
import { matchFor } from '../match/match.ts';
import { botNick } from '../match/names.ts';
import { Table, type Action, type Settings } from '../match/table.ts';
import { DEBT_LIMITS, PRESETS } from '../rules/cards.ts';
import { serialize } from './snapshot.ts';

type WireAction =
  | { k: 'play'; id: number; extraIds?: number[]; color?: string; flipColor?: string; target?: number }
  | { k: 'ability'; ab: string; ids?: number[] }
  | Extract<Action, { k: 'gamble' | 'roul' | 'deal' | 'item' }>
  | { k: 'draw' | 'pass' };
type SettingsMessage = Partial<Omit<Settings, 'members'>>;
type Message =
  | ({ t: 'create'; name: string } & SettingsMessage)
  | ({ t: 'settings' } & SettingsMessage)
  | { t: 'rename'; name: string }
  | { t: 'start' | 'addbot' | 'rmbot' | 'tolobby' | 'leave' }
  | { t: 'act'; a: WireAction }
  | { t: 'draft'; ids: number[] }
  | { t: 'shop'; a: { k: string; id?: string; target?: number } }
  | { t: 'col'; k: 'give' | 'lever'; target?: number };

function fromWire(action: WireAction): Action {
  if (action.k === 'play') {
    const { id, extraIds, color, flipColor, target } = action;
    return { k: 'play', cards: [id, ...(extraIds ?? [])], color, flipColor, target };
  }
  if (action.k === 'ability') return { k: 'ability', id: action.ab, cards: action.ids ?? [] };
  return action;
}

/** In-process transport for the classic view. The TypeScript table owns every match. */
export function localConnection(receive: (message: object) => void) {
  let game: Table | undefined;
  let timer = 0;
  let settings: Settings | undefined;
  const close = () => {
    clearInterval(timer);
    game = undefined;
    settings = undefined;
  };
  const lobby = () => ({
    code: '',
    host: true,
    live: game !== undefined && game.phase !== 'over',
    players: settings.members.map(({ name, bot }, i) => [name, 1, i === 0, i === 0, bot]),
    rules: settings.rules,
    cards: settings.cards,
    mode: settings.mode,
    limit: settings.limit,
  });
  const publish = () => {
    if (!settings) return;
    const current = game;
    const room = lobby();
    if (!current) receive({ t: 'lobby', lobby: room });
    else
      receive({
        t: 'state',
        seat: 0,
        host: true,
        lobby: room,
        st: serialize(current.G, 0),
        controls: current.controls(0),
        match: structuredClone(matchFor(current, 0)),
      });
  };
  function configure(message: SettingsMessage) {
    if (message.mode === 'one' || message.mode === 'debt') settings.mode = message.mode;
    if (DEBT_LIMITS.includes(message.limit)) settings.limit = message.limit;
    if (message.rules) settings.rules = { ...settings.rules, ...message.rules };
    if (message.cards) settings.cards = { ...settings.cards, ...message.cards };
  }
  function start() {
    if (settings.members.length < 2) return;
    clearInterval(timer);
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    game = new Table(settings, seeded(seed));
    const current = game;
    let last = performance.now();
    timer = window.setInterval(() => {
      const now = performance.now();
      const revision = current.revision;
      current.clock.advance(now - last);
      last = now;
      if (current.revision !== revision) publish();
    }, 50);
    publish();
  }
  function handle(message: Message) {
    if (message.t === 'create') {
      close();
      settings = {
        members: [{ name: message.name, bot: false }],
        mode: 'debt',
        limit: 250,
        rules: { ...PRESETS.den.rules },
        cards: { ...PRESETS.den.cards },
      };
      configure(message);
      receive({ t: 'joined', code: '' });
      publish();
      return;
    }
    if (!settings) return;
    let accepted = true;
    switch (message.t) {
      case 'leave':
        close();
        return;
      case 'tolobby':
        clearInterval(timer);
        game = undefined;
        break;
      case 'start':
        if (!game || game.phase === 'over') start();
        return;
      case 'settings':
        configure(message);
        break;
      case 'rename':
        settings.members[0].name = message.name;
        break;
      case 'addbot':
        if (settings.members.length < 6)
          settings.members.push({ name: botNick(Math.random), bot: true });
        break;
      case 'rmbot':
        if (settings.members.length > 1) settings.members.pop();
        break;
      case 'act':
        accepted = !!game?.dispatch(0, fromWire(message.a));
        break;
      case 'draft':
        accepted = !!game?.dispatch(0, { k: 'draft', cards: message.ids });
        break;
      case 'shop': {
        const { k, id, target } = message.a;
        accepted = !!game?.dispatch(0, k === 'done' ? { k } : { k: 'buy', kind: k, id, target });
        break;
      }
      case 'col':
        accepted = !!game?.dispatch(0, { k: 'collector', kind: message.k, target: message.target });
        break;
    }
    publish();
    if (!accepted) receive({ t: 'rejected' });
  }
  const send = (message: Message) => queueMicrotask(() => handle(message));
  return {
    open: send,
    send,
    close,
    selection: (cards: number[]) => game?.previewSelection(0, cards) ?? null,
  };
}
