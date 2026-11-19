import { DEBT_LIMITS, PRESETS, SIDE_COLORS, other } from '../rules/cards.ts';
import { hasDeal } from '../rules/contracts.ts';
import { Game } from '../rules/game.ts';
import { selection } from '../rules/selection.ts';
import { nextBotJob } from './bots.ts';
import { Clock } from './clock.ts';
import { afterChange, buy, collector, matchFor, maybeEndDraft, maybeEndShop, settle, startGame } from './match.ts';
import type { MatchState } from './state.ts';
import { visibleEvents } from './visibility.ts';
import type { BotProfile } from '../rules/bot.ts';

export interface Seat {
  name: string;
  bot: boolean;
  profile?: BotProfile;
}
export interface Settings {
  members: Seat[];
  mode: 'one' | 'debt';
  limit: number;
  rules: Record<string, boolean>;
  cards: Record<string, boolean>;
}
export type Action =
  | { k: 'play'; cards: number[]; color?: string; flipColor?: string; target?: number }
  | { k: 'draw' | 'pass' | 'done' }
  | { k: 'gamble'; target: number }
  | { k: 'roul'; color: string }
  | { k: 'deal'; id: string | null; target?: number }
  | { k: 'item'; id: string }
  | { k: 'ability'; id: string; cards: number[] }
  | { k: 'draft'; cards: number[] }
  | { k: 'buy'; kind: string; id?: string; target?: number }
  | { k: 'collector'; kind: 'give' | 'lever'; target?: number };

export class Table {
  G: Game;
  M: MatchState | null;
  phaseTimer = 0;
  members: Seat[];
  rules: Settings['rules'];
  cards: Settings['cards'];
  mode: Settings['mode'];
  limit: number;
  random: () => number;
  clock = new Clock();
  revision = 0;
  warAt = 0;
  warPi = -1;
  private warKey = '';
  private timer = 0;
  private idleKey = '';
  decisionAt = 0;
  private botTimer = 0;
  private away = new Map<number, number>();
  readonly network?: {
    gameId: () => string;
    grace: number;
    awaySkip: number;
  };
  constructor(settings: Settings, random: () => number, network?: Table['network']) {
    this.network = network;
    const { members, mode, limit, rules, cards } = structuredClone(settings);
    if (
      members.length < 2 ||
      members.length > 6 ||
      !DEBT_LIMITS.includes(limit) ||
      !['debt', 'one'].includes(mode)
    )
      throw new RangeError('Invalid table');
    this.members = members;
    this.rules = { ...PRESETS.den.rules, ...rules };
    this.cards = { ...PRESETS.den.cards, ...cards };
    this.mode = mode;
    this.limit = limit;
    this.random = random;
    startGame(this);
    this.sync();
  }
  setAway(seat: number, away: boolean) {
    if (!this.members[seat] || this.members[seat].bot) return;
    if (this.network && away === this.away.has(seat)) return;
    this.clock.cancel(this.away.get(seat));
    this.away.delete(seat);
    if (away)
      this.away.set(
        seat,
        this.clock.after(() => {
          if (this.network) {
            this.forfeit(seat, 'away');
          } else if (this.phase === 'play') {
            this.G.removePlayer(seat, 'away');
            this.sync();
          }
        }, this.network?.grace ?? 60000),
      );
    this.sync();
  }
  forfeit(seat: number, reason: 'away' | 'left') {
    if (this.phase === 'over' || !this.G.players[seat] || this.M?.withdrawn[seat]) return;
    this.clock.cancel(this.away.get(seat));
    this.away.delete(seat);
    if (this.M) this.M.withdrawn[seat] = true;
    if (this.phase === 'play') {
      this.G.removePlayer(seat, reason);
      if (this.M && this.G.winner === null && this.G.active().length === 0)
        afterChange(this, () => {});
      this.sync();
    } else if (this.M) {
      const phase = this.phase;
      const p = this.G.players[seat];
      p.out = true;
      p.left = true;
      p.hand = [];
      this.M.done[seat] = true;
      if (this.G.turn === seat) this.G.turn = this.G.nextIdx(seat, 1);
      const ended = afterChange(this, () => {
        if (phase === 'draft') maybeEndDraft(this);
        if (phase === 'shop') maybeEndShop(this);
      });
      if (ended) this.sync();
    }
  }
  get phase(): 'play' | 'over' | 'draft' | 'shop' {
    return this.M?.phase ?? (this.G.winner === null ? 'play' : 'over');
  }
  changed?: () => void;
  sync() {
    this.update();
    this.changed?.();
  }
  private update() {
    this.revision++;
    const g = this.G;
    this.clock.cancel(this.timer);
    this.clock.cancel(this.botTimer);
    if (this.phase !== 'play') {
      this.idleKey = '';
      this.decisionAt = 0;
      return;
    }
    for (let n = 0; n < 8 && g.beginTurn(); n++) {}
    if (g.winner !== null) {
      this.idleKey = '';
      this.decisionAt = 0;
      if (this.M) settle(this);
      return;
    }
    const actor = g.offer?.pi ?? g.roulette ?? g.turn;
    const bot = this.members[actor].bot;
    const after = (delay: number, act: () => void) =>
      this.clock.after(() => {
        act();
        this.sync();
      }, delay);
    if (!bot && g.horseOn('war', 'timer') && !g.offer && g.roulette === null) {
      this.idleKey = '';
      const key = [g.gid, g.turnKey, g.turn, g.againN || 0].join('/');
      if (key !== this.warKey || g.owes(actor) || !this.warAt) {
        this.warAt = this.clock.now + 5000;
        this.warKey = key;
        this.warPi = actor;
      }
      this.timer = after(Math.max(1, this.warAt - this.clock.now), () => {
        this.warAt = 0;
        g.warTimeout(actor);
      });
      this.decisionAt = this.warAt;
    } else {
      this.warAt = 0;
      if (!bot) {
        const kind = g.offer ? 'offer' : g.roulette !== null ? 'roulette' : 'turn';
        const away = this.away.has(actor);
        const key = [g.gid, g.turnNo, actor, kind, kind === 'offer' ? g.offer.kind : away].join('/');
        if (!this.network || this.idleKey !== key) {
          this.idleKey = key;
          this.decisionAt = this.clock.now + (g.offer ? 45000 : away ? this.network?.awaySkip ?? 15000 : 60000);
        }
        this.timer = after(Math.max(1, this.decisionAt - this.clock.now), () => {
          this.idleKey = '';
          if (g.offer) g.resolveDeal(actor, g.offer.kind === 'dark' ? null : g.offer.opts[0], null);
          else g.skipTurn(actor);
        });
      } else {
        this.idleKey = '';
        this.decisionAt = 0;
      }
    }
    const job = nextBotJob(this);
    if (job) this.botTimer = after(job.wait, () => nextBotJob(this)?.run());
  }
  dispatch(seat: number, a: Action): boolean {
    if (
      !Number.isInteger(seat) ||
      !this.members[seat] || this.M?.withdrawn[seat] ||
      !a ||
      ('cards' in a && !Array.isArray(a.cards))
    )
      return false;
    const g = this.G,
      p = g.players[seat],
      m = this.M,
      phase = this.phase;
    if (phase === 'draft' && a.k === 'draft' && !m.col[seat] && !m.pass[seat]) {
      const ids = new Set(a.cards),
        free = p.hand.filter((c) => !c.uniq);
      const cards = free.filter((c) => ids.has(c.id));
      if (ids.size !== cards.length || cards.length !== Math.min(2, free.length)) return false;
      m.pass[seat] = cards;
      maybeEndDraft(this);
      return true;
    }
    if (phase === 'shop' && !m.col[seat] && !m.done[seat]) {
      if (a.k === 'done') {
        m.done[seat] = true;
        maybeEndShop(this);
        return true;
      }
      if (a.k === 'buy' && buy(m, seat, { k: a.kind, id: a.id, target: a.target })) {
        this.sync();
        return true;
      }
    }
    if (phase !== 'play' || g.winner !== null) return false;
    if (a.k === 'collector' && m?.col[seat] && !m.colUsed[seat]) {
      if (a.target != null && (!g.players[a.target] || g.players[a.target].out)) return false;
      collector(this, seat, a.kind, a.target);
      this.sync();
      return true;
    }
    if (p.out || (g.offer && !['deal', 'item'].includes(a.k))) return false;
    const seq = g.seq,
      ev = g.evSeq;
    const target =
      'target' in a && Number.isInteger(a.target) && g.players[a.target] && !g.players[a.target].out
        ? a.target
        : null;
    switch (a.k) {
      case 'play': {
        const ids = selection(g, seat, a.cards);
        if (!ids) return false;
        g.play(seat, ids[0], {
          extra: ids.slice(1, 21),
          color: a.color,
          flipColor: a.flipColor,
          target,
        });
        break;
      }
      case 'draw':
        g.draw(seat);
        break;
      case 'pass':
        g.pass(seat);
        break;
      case 'gamble':
        g.gamble(seat, target);
        break;
      case 'roul':
        if (g.roulette === seat && g.colors().includes(a.color)) g.resolveRoulette(a.color);
        break;
      case 'deal':
        g.resolveDeal(seat, a.id, target);
        break;
      case 'ability':
        g.ability(seat, a.id, a.cards);
        break;
      case 'item':
        g.useItem(seat, a.id);
        break;
      default:
        return false;
    }
    if (seq === g.seq && ev === g.evSeq) return false;
    this.sync();
    return true;
  }
  controls(seat: number) {
    const g = this.G;
    const p = g.players[seat];
    const active = !!p && !p.out && this.phase === 'play' && g.winner === null && !g.offer;
    const ownTurn = active && g.turn === seat && g.roulette === null;
    return {
      playable: ownTurn ? p.hand.filter((card) => g.canPlay(card)).map((card) => card.id) : [],
      canDraw:
        active &&
        (g.owes(seat) ||
          (ownTurn && (g.debt ? g.debt.pi === seat : g.pending > 0 || g.drewBy !== seat))),
      canPass: ownTurn && g.drewBy === seat && !g.pending && !g.debt && !g.owes(seat),
      canGamble: active && g.canGamble(seat),
      canGroup: active && g.rules.multi && !g.horseOn('famine', 'two', seat),
    };
  }
  previewSelection(seat: number, cards: number[]) {
    if (this.phase !== 'play' || this.G.winner !== null || !this.members[seat]) return null;
    return selection(this.G, seat, cards);
  }
  view(seat: number) {
    if (!Number.isInteger(seat) || !this.members[seat]) throw new RangeError('Unknown seat');
    const g = this.G,
      p = g.players[seat],
      lc = g.lastCallLeft(),
      phase = this.phase;
    const controls = this.controls(seat);
    const playable = new Set(controls.playable);
    const own = p.hand.map((c) => ({
      id: c.id,
      face: g.f(c),
      unique: !!c.uniq,
      locked: !!c.lock,
      playable: playable.has(c.id),
    }));
    if (phase === 'play' && g.horseOn('death', null, seat) && g.horse.curses[seat] === 'fever') {
      let x = (1 + Math.floor(this.clock.now / 1000)) * 9301 + 49297;
      for (let i = own.length - 1; i > 0; i--) {
        x = (x * 9301 + 49297) % 233280;
        const j = Math.floor((x / 233280) * (i + 1));
        [own[i], own[j]] = [own[j], own[i]];
      }
    }
    const players = g.players.map((q, i) => ({
      name: q.name,
      bot: this.members[i].bot,
      out: q.out,
      loan: q.loan || 0,
      shield: q.shield,
      owe: q.oweN + q.owed.length,
      debt: phase === 'play' ? q.debt : this.M?.debt[i] || 0,
      chips: (this.M?.chips[i] || 0) + (phase === 'play' ? g.chipsWon[i] : 0),
      limit: q.limit,
      deals: q.deals,
      inventory: phase === 'shop' ? this.M.inv[i] : q.inv,
      fx: q.fx,
      fallen: q.fallen,
      count: q.hand.length,
      backs: i === seat ? [] : q.hand.map((c) => g.back(c)),
      tokens: this.M?.tokens[i] || [],
    }));
    return structuredClone({
      revision: this.revision,
      seat,
      phase,
      side: g.side,
      color: g.color,
      colors: g.colors(),
      flipColors: SIDE_COLORS[other(g.side)],
      players,
      hand: own,
      top: g.f(g.top),
      nextBack: g.back(g.next),
      nextFace: hasDeal(p, 'sharp') ? g.f(g.next) : null,
      turn: g.turn,
      dir: g.dir,
      pending: g.pending,
      stackMin: g.stackMin,
      winner: g.winner,
      owe: g.owes(seat),
      debt: g.debt,
      roulette: g.roulette,
      canGamble: controls.canGamble,
      canPass: controls.canPass,
      offer: g.offer?.pi === seat ? g.offer : null,
      visitor: g.offer?.pi,
      rules: { multi: g.rules.multi, combos: g.rules.combos },
      drawRun: g.drawRunPi === seat ? g.drawRun : 0,
      canDraw: controls.canDraw,
      hope: [p.angel, g.demonChance(seat)],
      effects: {
        horse: g.horse,
        curse: phase === 'play' && g.horseOn('death', null, seat) ? g.horse.curses[seat] : null,
        cross: g.crossLeft,
        slots: g.rules.chaos ? g.chaosIn : null,
        lock: g.lock,
        inflate: g.inflate,
        maze: g.maze,
        mult: g.multNext,
        flipBack: g.flipBack,
        dynamite: g.rules.potato && g.side === 'D' && g.potato.fuse > 0 && g.potato.fuse <= 2,
        lastCall: lc !== null && lc <= 10 ? lc : null,
      },
      items: (p.inv || []).map((id) => ({ id, enabled: g.canUseItem(seat, id) })),
      match: matchFor(this, seat),
      events: visibleEvents(g.events, seat),
      log: g.log.slice(-25),
      gameId: g.gid,
    });
  }
}
