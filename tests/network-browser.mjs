import assert from 'node:assert/strict';
import { once } from 'node:events';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { createGameServer } from '../server/game-server.ts';
import { seeded } from '../src/match/clock.ts';

const app = createGameServer({ random: seeded(54) });
let vite, browser;
try {
  app.http.listen(0, '127.0.0.1');
  await once(app.http, 'listening');
  vite = await preview({
    configFile: false,
    preview: {
      host: '127.0.0.1',
      port: 0,
      proxy: { '/ws': { target: `ws://127.0.0.1:${app.http.address().port}`, ws: true } },
    },
  });
  const url = `http://127.0.0.1:${vite.httpServer.address().port}/`;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  const errors = [];
  const create = async (name) => {
    const context = await browser.newContext({ locale: 'ru-RU', reducedMotion: 'reduce' });
    await context.route('https://**/*', (route) => route.abort());
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(url);
    await page.locator('#pname').fill(name);
    await page.locator('#onlineTitle').click();
    return page;
  };
  const a = await create('Audit A'),
    b = await create('Audit B');
  await a.locator('#btnCreateOnline').click();
  await a.locator('#lobby').waitFor({ state: 'visible' });
  const code = (await a.locator('#lbHint').textContent()).match(/[A-Z2-9]{6}$/)[0];
  await b.locator('#joinCode').fill(code);
  await b.locator('#btnJoinOnline').click();
  await b.locator('#lobby').waitFor({ state: 'visible' });
  await a.locator('[data-mode="one"]').click();
  await a.locator('#btnRoomStart').click();
  await Promise.all([a, b].map((page) => page.locator('#game').waitFor({ state: 'visible' })));
  const actor = (await a.locator('#bottom').evaluate((el) => el.classList.contains('myturn'))) ? a : b;
  const opponent = actor === a ? b : a;
  await actor.locator('#drawpile').click();
  await opponent.waitForFunction(() => +document.querySelector('#opps .cnt').textContent === 8);
  await b.reload();
  await b.locator('#game').waitFor({ state: 'visible' });
  assert.equal(await b.locator('#meName').textContent(), 'Audit B');
  assert.equal(await b.locator('#hand .card').count(), actor === b ? 8 : 7);
  const received = opponent.waitForFunction(
    () => Number(document.querySelector('#opps .cnt').textContent) < 8,
  );
  await actor
    .locator('#hand .card.ok')
    .last()
    .click({ position: { x: 8, y: 18 } });
  await received;
  assert.deepEqual(errors, []);
  console.log('Online browser: create, join by code, start, draw, play and resume after reload.');
} finally {
  await browser?.close();
  if (vite) await new Promise((resolve) => vite.httpServer.close(resolve));
  await app.close();
}
