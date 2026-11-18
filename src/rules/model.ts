import type { Card } from './cards.ts';
export interface GameEvent {
  type: string;
  n: number;
  [key: string]: unknown;
}
export interface Player {
  name: string;
  hand: Card[];
  human: boolean;
  out: boolean;
  elim: boolean;
  shield: boolean;
  oweN: number;
  owed: Card[];
  av: string;
  peer: string;
  inv?: string[];
  deals?: string[];
  fx?: Record<string, any>;
  used?: { alms?: number; [key: string]: number | boolean };
  [key: string]: any;
}
