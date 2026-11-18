/** Rebuild the expectations from the pinned checkout, without loading its network server. */
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { cases, seedOf, runCase } from './scenarios.mjs';
import { seeded } from '../src/match/clock.ts';
const source = readFileSync(process.argv[2], 'utf8');
const actual = createHash('sha256').update(source.replace(/\r\n/g, '\n')).digest('hex');
if (actual !== 'beb65afd99e5419053d730b8747d0bce9d98266e8c688ddd233bd37651df8408')
  throw Error('Wrong legacy engine: ' + actual);
const script = new vm.Script(source),
  out = {};
for (const name of cases.keys()) {
  if (name.startsWith('server/')) continue;
  const random = seeded(seedOf(name)),
    math = Object.create(Math);
  math.random = random;
  const box = { Math: math, module: { exports: {} } };
  script.runInNewContext(box);
  out[name] = runCase(name, { ...box.module.exports, random });
}
writeFileSync(new URL('./legacy-results.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
