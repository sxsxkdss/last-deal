import { other } from './cards.ts';
import type { Game } from './game.ts';

export function rollChaos(this: Game) {
  this.chaosIn = 8 + Math.floor(this.random() * 5);
  const act = this.players.map((p, i) => i).filter((i) => !this.players[i].out);
  const pool = ['inflation', 'storm', 'lock', 'bleed', 'jackpot', 'mirrorworld'];
  if (!this.rules.flip) pool.splice(pool.indexOf('storm'), 1);
  const e = pool[Math.floor(this.random() * pool.length)];
  const data: { e: string; who?: number[] } = { e };
  switch (e) {
    case 'inflation':
      this.inflate = 6;
      break; // draw cards count double for the next 6 plays
    case 'lock':
      this.lock = 4;
      break; // only the color (or a wild) can be played for 4 plays
    case 'tax': {
      // whoever is closest to winning pays 2
      const min = Math.min(...act.map((i) => this.players[i].hand.length));
      data.who = act.filter((i) => this.players[i].hand.length === min);
      for (const i of data.who) this.players[i].oweN = (this.players[i].oweN || 0) + 2;
      break;
    }
    case 'bleed':
      for (const i of act) this.players[i].oweN = (this.players[i].oweN || 0) + 1;
      break; // everyone pays 1
    case 'storm': {
      // the table flips
      this.side = other(this.side);
      const nf = this.f(this.top);
      this.color = nf.c === 'w' || nf.c === 'x' ? this.colors()[Math.floor(this.random() * 4)] : nf.c;
      this.ev('flip', { side: this.side });
      break;
    }
    case 'jackpot': {
      // one lucky player throws away 2 random cards
      const cands = act.filter((i) => this.players[i].hand.length > 2);
      if (cands.length) {
        const w = cands[Math.floor(this.random() * cands.length)],
          h = this.players[w].hand;
        for (let k = 0; k < 2; k++) h.splice(Math.floor(this.random() * h.length), 1);
        data.who = [w];
      }
      break;
    }
    case 'mirrorworld':
      this.dir *= -1;
      this.ev('reverse', { dir: this.dir });
      break;
  }
  this.lastChaos = data;
  const names = data.who ? data.who.map((i) => this.players[i].name) : [];
  this.addLog(`Chaos: ${e}${names.length ? ' (' + names.join(', ') + ')' : ''}.`, 'flip', 'chaos', {
    e,
    w: names,
  });
  this.ev('chaos', data);
}
// A player who leaves (or stays disconnected too long) is out of this match; everyone else plays on.
