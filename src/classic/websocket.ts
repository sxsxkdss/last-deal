import { EXTRA_CARDS, RULE_ALL } from '../rules/cards.ts';
import { PROTOCOL } from '../shared/protocol.ts';

const storageKey = 'last-deal.resume.v1';
const selectionKey = (cards: number[], selected: number[]) => cards.join(',') + '/' + selected.join(',');

export function webConnection(receive: (message: any) => void) {
  let socket: WebSocket | undefined;
  let token: string | undefined;
  let n = 0;
  let revision: number | undefined;
  let game: string | undefined;
  let phase: string | undefined;
  let lastRoomRevision = -1;
  let first: Record<string, unknown> | undefined;
  let reconnect: ReturnType<typeof setTimeout> | undefined;
  let retries = 0;
  let orderKey = '';
  let intentional = false;
  const silentCommands = new Set<number>();

  function save(value?: string) {
    token = value;
    try {
      if (value) sessionStorage.setItem(storageKey, value);
      else sessionStorage.removeItem(storageKey);
    } catch {
      /* private browsing can deny storage */
    }
  }
  function send(command: Record<string, unknown>, quiet = false) {
    if (socket?.readyState !== WebSocket.OPEN) return false;
    const id = n++;
    if (quiet) {
      silentCommands.add(id);
      if (silentCommands.size > 64) silentCommands.delete(silentCommands.values().next().value);
    }
    const message = { ...command };
    for (const [key, allowed] of [
      ['rules', RULE_ALL],
      ['cards', EXTRA_CARDS],
    ] as const) {
      if (message[key] && typeof message[key] === 'object') {
        message[key] = Object.fromEntries(
          Object.entries(message[key]).filter(([k]) => allowed.includes(k)),
        );
      }
    }
    socket.send(JSON.stringify({ v: PROTOCOL, n: id, revision, game, phase, command: message }));
    return true;
  }
  function connect() {
    if (socket && socket.readyState < WebSocket.CLOSING) return;
    intentional = false;
    const current = (socket = new WebSocket(
      (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws',
    ));
    current.onopen = () => {
      if (socket !== current) return;
      if (token) send({ t: 'resume', token });
      else if (first) {
        send(first);
        first = undefined;
      }
    };
    current.onmessage = ({ data }) => {
      if (socket !== current) return;
      let m;
      try {
        m = JSON.parse(data);
      } catch {
        return;
      }
      if (m.t === 'joined') {
        save(m.token);
        n = m.next;
        retries = 0;
        lastRoomRevision = -1;
        orderKey = '';
        silentCommands.clear();
      } else if (m.t === 'state' || m.t === 'lobby') {
        if (m.revision < lastRoomRevision) return;
        lastRoomRevision = m.revision;
        if (game !== m.game) orderKey = '';
        revision = m.tableRevision;
        game = m.game;
        phase = m.phase;
      } else if (m.t === 'ack') {
        const quiet = silentCommands.delete(m.n);
        if (m.ok || quiet) return;
        if (m.error === 'rejected' || m.error === 'stale') receive({ t: 'rejected' });
        else receive({ t: 'error', code: m.error });
        return;
      } else if (
        m.t === 'replaced' ||
        (m.t === 'error' && ['expired', 'room-failed'].includes(m.code))
      ) {
        close(false);
      }
      receive(m);
    };
    current.onclose = () => {
      if (socket !== current) return;
      socket = undefined;
      if (intentional) return;
      if (!token) {
        receive({ t: 'error', code: 'offline' });
        return;
      }
      receive({ t: 'disconnected' });
      const backoff = Math.min(8000, 500 * 2 ** retries++);
      reconnect = setTimeout(connect, backoff + Math.random() * 250);
    };
  }
  function open(command: Record<string, unknown>) {
    if (send(command)) return;
    first = command;
    connect();
  }
  function close(leave = true) {
    intentional = true;
    clearTimeout(reconnect);
    if (leave && token) send({ t: 'leave' });
    save();
    socket?.close();
    socket = undefined;
    first = undefined;
    game = undefined;
    phase = undefined;
    revision = undefined;
    lastRoomRevision = -1;
    orderKey = '';
  }
  return {
    open,
    close,
    send,
    resume() {
      try {
        token = sessionStorage.getItem(storageKey) ?? undefined;
      } catch {}
      if (!token) return false;
      connect();
      return true;
    },
    order(cards: number[], selected: number[]) {
      if (phase !== 'play') return;
      const key = selectionKey(cards, selected);
      if (key === orderKey) return;
      if (send({ t: 'order', cards, selected: selected.slice(0, 21) }, true)) orderKey = key;
    },
  };
}
