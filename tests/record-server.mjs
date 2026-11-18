import vm from 'node:vm';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { serverFlow } from './server-cases.mjs';
import { seeded } from '../src/match/clock.ts';
const math = Object.create(Math);
math.random = seeded(404);
const box = {
  module: { exports: {} },
  Math: math,
  setTimeout() {},
  clearTimeout() {},
  process: { env: {} },
  sync() {},
  online: () => true,
  MAX_SEATS: 6,
};
vm.createContext(box);
for (const [path, expected] of [
  [process.argv[2], 'beb65afd99e5419053d730b8747d0bce9d98266e8c688ddd233bd37651df8408'],
  [process.argv[3], '3e8848f031a0398a82dff0cfcb4089dd200d709eefdc02e1573f9c4e79657e47'],
]) {
  const source = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  if (createHash('sha256').update(source).digest('hex') !== expected)
    throw Error('Unexpected source file: ' + path);
  const code =
    path === process.argv[2]
      ? source
      : source.slice(source.indexOf('function startGame'), source.indexOf('function applyAct'));
  vm.runInContext(code, box);
}
writeFileSync(
  new URL('./legacy-server.json', import.meta.url),
  JSON.stringify(serverFlow(box, true), null, 2) + '\n',
);
