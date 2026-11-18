import test from 'node:test';
import assert from 'node:assert/strict';
import golden from './legacy-results.json' with { type: 'json' };
import { cases, runCase } from './scenarios.mjs';
import { Game } from '../src/rules/game.ts';
import { Bot } from '../src/rules/bot.ts';
for (const name of cases.keys())
  if (!name.startsWith('server/'))
    test(name, () => assert.equal(runCase(name, { Game, Bot }), golden[name]));
