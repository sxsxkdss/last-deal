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
  const create = async (name, viewport) => {
    const context = await browser.newContext({
      locale: 'ru-RU',
      reducedMotion: 'reduce',
      viewport,
      permissions: ['clipboard-read', 'clipboard-write'],
    });
    await context.route('https://**/*', (route) => route.abort());
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(url);
    await page.locator('#pname').fill(name);
    return page;
  };
  const a = await create('Audit A'),
    b = await create('Audit B', { width: 360, height: 760 });
  const orders = [];
  const replies = new Map();
  let hostSocket;
  a.on('websocket', (socket) => {
    hostSocket = socket;
    socket.on('framesent', ({ payload }) => {
      const message = JSON.parse(payload);
      if (message.command.t === 'order') orders.push(message);
    });
    socket.on('framereceived', ({ payload }) => {
      const message = JSON.parse(payload);
      if (message.t === 'ack') replies.set(message.n, message);
    });
  });
  await a.locator('#btnCreate').click();
  await a.locator('#lobby').waitFor({ state: 'visible' });
  const code = await a.locator('#lbCode').textContent();
  assert.match(code, /^[A-Z2-9]{6}$/);
  await a.locator('#lbCode').click();
  assert.equal(await a.evaluate(() => navigator.clipboard.readText()), code);
  await a.locator('#btnCopyLink').click();
  const invitation = await a.evaluate(() => navigator.clipboard.readText());
  assert.equal(invitation, url + '#join-' + code);
  await a.locator('#lbPublic').check();
  await b.locator('#roomDirectoryTitle').click();
  await b.locator('.room-directory-code').getByText(code, { exact: true }).waitFor();
  await b.goto(invitation);
  assert.equal(await b.locator('#joinCode').inputValue(), code);
  await b.locator('#btnJoinOnline').click();
  await b.locator('#lobby').waitFor({ state: 'visible' });
  for (const profile of ['cautious', 'debt']) {
    await a.locator(`#lbBotProfile label:has([value="${profile}"])`).click();
    await a.locator('#btnAddBot').click();
  }
  for (const page of [a, b]) {
    const strategies = page.locator('#lbSeats .seat-strategy');
    await strategies.nth(1).waitFor();
    assert.match(await strategies.nth(0).textContent(), /Осторожная.*картами добора/);
    assert.match(await strategies.nth(1).textContent(), /Контроль долга.*принесут больше долга/);
  }
  for (let count = 3; count >= 2; count--) {
    await a.locator('#btnRmBot').click();
    await b.waitForFunction((expected) => document.querySelectorAll('#lbSeats .seatrow').length === expected, count);
  }
  await a.locator('[data-mode="one"]').click();
  await a.locator('#btnRoomStart').click();
  await Promise.all([a, b].map((page) => page.locator('#game').waitFor({ state: 'visible' })));
  const preSort = orders.length;
  for (let i = 0; i < 3; i++) await a.locator('#btnSort').click();
  const sorted = orders.slice(preSort);
  assert.ok(sorted.length > 0, 'Sorting sends the new hand order');
  for (const { n, command } of sorted) {
    assert.equal(command.cards.length, 7);
    assert.ok(command.cards.every(Number.isSafeInteger));
    const reply = replies.get(n) ?? JSON.parse((await hostSocket.waitForEvent('framereceived', {
      timeout: 5000,
      predicate: ({ payload }) => {
        const message = JSON.parse(payload);
        return message.t === 'ack' && message.n === n;
      },
    })).payload);
    assert.equal(reply.ok, true, 'The server accepts the sorted order');
  }
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
  console.log('Online browser: room code, public list, invitation, bot profiles, sorting, play and resume.');
} finally {
  await browser?.close();
  if (vite) await new Promise((resolve) => vite.httpServer.close(resolve));
  await app.close();
}
