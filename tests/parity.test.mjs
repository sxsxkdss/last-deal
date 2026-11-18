import test from 'node:test';
import assert from 'node:assert/strict';
import golden from './legacy-results.json' with { type: 'json' };
import revised from './updated-rule-results.json' with { type: 'json' };
import { cases, runCase } from './scenarios.mjs';
import { Game } from '../src/rules/game.ts';
import { Bot } from '../src/rules/bot.ts';
for (const name of cases.keys())
  if (!name.startsWith('server/'))
    // Intentional deviations: a repeated turn starts a new turn and Mirror is peaceful.
    test(name, () => assert.equal(runCase(name, { Game, Bot }), revised[name] ?? golden[name]));
