import type { Card } from '../rules/cards.ts';
import type { Game } from '../rules/game.ts';
export interface Account {
  angel: number;
  demon: number;
  deals: string[];
  fallen: boolean;
  markT: number | null;
  exT?: number;
  demonX?: number;
  limitAdj?: number;
  buff?: number;
  angelSlow?: number;
  tookLight?: boolean;
  noAngel?: boolean;
  djGiven?: boolean;
  fresh?: boolean;
}
export interface Settlement {
  round: number;
  winner: number;
  out: number[];
  rows: { i: number; cards: number; paid: number; turn: number; chips: number }[];
}
export interface MatchState {
  names: string[];
  limit: number;
  round: number;
  phase: 'draft' | 'play' | 'shop' | 'over';
  debt: number[];
  chips: number[];
  tokens: string[][];
  col: boolean[];
  withdrawn: boolean[];
  colUsed: boolean[];
  setup: number[];
  offers: string[][];
  done: boolean[];
  pass: (Card[] | null)[];
  last: Settlement | null;
  champ: number | null;
  deadline: number;
  ds: Account[];
  carry: string[][];
  hist: number[][];
  horse: Game['horse'];
  horseUsed: boolean;
  horseCount?: number;
  inv: string[][];
  dark: string[][];
  purchases: Record<string, number>;
  marketDebt: Record<string, { added: number; removed: number }>;
}
