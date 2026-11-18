import { hint, selection } from '../rules/selection.ts';
import { Table, type Action, type Settings } from './table.ts';
/** Renderers only receive detached seat views. Time is driven by frames or a replay. */
export function localGame(settings: Settings, random: () => number) {
  const table = new Table(settings, random);
  const listeners = new Set<() => void>();
  table.changed = () => {
    for (const notify of listeners) notify();
  };
  type View = ReturnType<Table['view']>;
  return {
    subscribe(seat: number, receive: (view: View, events: View['events']) => void) {
      let gameId = '',
        last = 0;
      const notify = () => {
        const view = table.view(seat);
        if (view.gameId !== gameId) {
          gameId = view.gameId;
          last = 0;
        }
        const events = view.events.filter((e) => e.n > last);
        if (events.length) last = events.at(-1).n;
        receive(view, events);
      };
      listeners.add(notify);
      notify();
      return () => listeners.delete(notify);
    },
    view: (seat: number) => table.view(seat),
    dispatch: (seat: number, action: Action) => table.dispatch(seat, action),
    selection: (seat: number, ids: number[]) => selection(table.G, seat, ids),
    hint: (seat: number) => hint(table.G, seat),
    advance: (milliseconds: number) => table.clock.advance(milliseconds),
    get revision() {
      return table.revision;
    },
    get remaining() {
      const deadline = table.M?.deadline || (table.warAt ? table.warAt - 1000 : 0);
      return deadline ? Math.max(0, deadline - table.clock.now) : null;
    },
    get seconds() {
      return Math.floor(table.clock.now / 1000);
    },
  };
}
