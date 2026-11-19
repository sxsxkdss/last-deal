import type { GameEvent } from '../rules/model.ts';

const personalEvents = new Set(['demonMiss', 'demonCharge', 'eclipseMiss']);

export function visibleEvents(events: readonly GameEvent[], seat: number) {
  return events.filter((event) => !personalEvents.has(event.type) || event.pi === seat);
}
