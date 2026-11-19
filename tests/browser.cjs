const path = require('node:path'),
  fs = require('node:fs'),
  http = require('node:http'),
  assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../dist');
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.join(root, pathname === '/' ? 'index.html' : pathname);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) {
    res.writeHead(404);
    return res.end();
  }
  res.setHeader(
    'Content-Type',
    file.endsWith('.js')
      ? 'application/javascript'
      : file.endsWith('.css')
        ? 'text/css'
        : file.endsWith('.mp3')
          ? 'audio/mpeg'
          : 'text/html; charset=utf-8',
  );
  const size = fs.statSync(file).size;
  res.setHeader('Content-Length', size);
  if (file.endsWith('.mp3')) {
    res.setHeader('Accept-Ranges', 'bytes');
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '');
    if (range) {
      const start = +range[1];
      const end = Math.min(range[2] ? +range[2] : size - 1, size - 1);
      if (start > end) {
        res.writeHead(416, { 'Content-Range': 'bytes */' + size, 'Content-Length': 0 });
        res.end();
        return;
      }
      res.writeHead(206, {
        'Content-Range': 'bytes ' + start + '-' + end + '/' + size,
        'Content-Length': end - start + 1,
      });
      fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }
  }
  fs.createReadStream(file).pipe(res);
});
async function classicTable(browser, mode) {
  const page = await browser.newPage({
    locale: 'ru-RU',
    reducedMotion: 'reduce',
    viewport: { width: 1440, height: 900 },
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://**/*', (route) => route.abort());
  await page.addInitScript(() => {
    Object.defineProperty(crypto, 'getRandomValues', {
      value: (array) => {
        array[0] = 54;
        return array;
      },
    });
  });
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
  await page.goto('http://127.0.0.1:' + server.address().port);
  await page.locator('#btnCreateLocal').click();
  const add = page.locator('#btnAddBot'),
    remove = page.locator('#btnRmBot');
  await add.click();
  await add.click();
  assert.equal(await page.locator('#lbSeats .seatrow').count(), 3);
  await remove.click();
  assert.equal(await page.locator('#lbSeats .seatrow').count(), 2);
  await page.locator('[data-mode="' + mode + '"]').click();
  await page.locator('[data-preset="mayhem"]').click();
  await page.locator('#btnRoomStart').click();
  const cards = page.locator('#hand .card');
  assert.equal(await cards.count(), 7);
  if (mode === 'debt') {
    const draft = page.locator('#modalBody .draftpick .card');
    await draft.first().click();
    await draft.nth(1).click();
    await page.locator('#draftGo').click();
    await page.clock.fastForward(4200);
    assert.equal(await page.locator('#draftGo').count(), 0);
    assert.equal(await cards.count(), 7);
  } else {
    await page.locator('#drawpile').click();
    assert.equal(await cards.count(), 8);
    const flip = cards.filter({ hasText: 'СМЕНА' }).first();
    const originalLayer = await flip.evaluate((card) => getComputedStyle(card).zIndex);
    await flip.click({ button: 'right' });
    assert.ok(await flip.evaluate((card) => card.classList.contains('sel')));
    assert.equal(await flip.evaluate((card) => getComputedStyle(card).zIndex), originalLayer);
    await flip.click({ button: 'right' });
    const start = await flip.boundingBox(),
      end = await page.locator('#discard').boundingBox();
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 3);
    await page.mouse.down();
    await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 12 });
    await page.mouse.up();
    await page.clock.runFor(200);
    assert.ok(await page.locator('body.dark').count(), 'Dragged Shift changes the side');
    assert.equal(await cards.count(), 7);
    let finished = false;
    for (let i = 0; i < 350; i++) {
      if (errors.length) throw Error(errors.join(' | '));
      if (await page.locator('#again').isVisible()) {
        finished = true;
        break;
      }
      const color = page.locator('#modal:not(.hidden) #modalBody [data-c]').first();
      if (await color.isVisible()) await color.click({ force: true });
      else {
        const point = await page.locator('#hand .card.ok').evaluateAll((cards) => {
          for (const card of cards) {
            const rect = card.getBoundingClientRect();
            for (const offset of [0.12, 0.22, 0.36, 0.5]) {
              const x = rect.left + rect.width * offset;
              const y = rect.top + rect.height * 0.44;
              if (card.contains(document.elementFromPoint(x, y))) return { x, y };
            }
          }
          return null;
        });
        const next = page.locator('#handNext');
        const previous = page.locator('#handPrev');
        if (point) await page.mouse.click(point.x, point.y);
        else if ((await next.isVisible()) && (await next.isEnabled())) await next.click();
        else {
          await page.locator('#drawpile').click({ force: true });
          while ((await previous.isVisible()) && (await previous.isEnabled())) await previous.click();
        }
      }
      await page.clock.fastForward(1250);
    }
    assert.ok(
      finished,
      'Classic round reached its result: ' + (await page.locator('#banner').textContent()),
    );
  }
  assert.deepEqual(errors, []);
  await page.close();
}

async function checkScene(page, seed, flipCard) {
  const scene = page.locator('.table-scene[data-side]');
  const canvas = scene.locator('canvas');
  const hand = page.locator('.handcards .card');
  const discard = page.locator('.piles .pile').last();
  await canvas.waitFor();
  await page.clock.runFor(35);
  const size = await canvas.boundingBox();
  const before = await hand.count();
  const deckBefore = await page.locator('.piles .deck').innerText();
  const day = await canvas.screenshot();
  // Hit the projected deck at the default camera angle.
  await page.mouse.click(size.x + size.width * 0.418, size.y + size.height * 0.524);
  assert.equal(await hand.count(), before + 1, 'Canvas click draws a card');
  assert.notEqual(await page.locator('.piles .deck').innerText(), deckBefore);
  const oldDiscard = await discard.innerText();
  const card = hand.filter({ hasText: flipCard });
  await card.first().click();
  await page.locator('[data-do=play]').click();
  assert.equal(await scene.getAttribute('data-side'), 'D');
  assert.notEqual(await discard.innerText(), oldDiscard);
  await page.clock.runFor(35);
  const night = await canvas.screenshot();
  assert.notDeepEqual(night, day);
  if (process.env.SCENE_SCREENSHOTS) {
    fs.writeFileSync(path.join(process.env.SCENE_SCREENSHOTS, 'scene-day.png'), day);
    fs.writeFileSync(path.join(process.env.SCENE_SCREENSHOTS, 'scene-night.png'), night);
  }
  const names = await hand.allTextContents();
  await scene.getByRole('button', { name: 'Осмотреть лампу' }).click();
  await page.clock.runFor(480);
  assert.equal(await scene.getAttribute('data-inspect'), 'true');
  assert.notDeepEqual(await canvas.screenshot(), night);
  await scene.getByRole('button', { name: 'Выключить лампу' }).click();
  assert.equal(await scene.getAttribute('data-lamp'), 'off');
  assert.equal(await scene.getAttribute('data-side'), 'D');
  assert.deepEqual(await hand.allTextContents(), names);
  await page.keyboard.press('Escape');
  await page.clock.runFor(480);
  assert.equal(await scene.getAttribute('data-inspect'), 'false');
  if (seed === 81) {
    for (let i = 0; i < 20 && (await scene.getAttribute('data-side')) === 'D'; i++)
      await page.clock.runFor(150);
    assert.equal(await scene.getAttribute('data-side'), 'L', 'Eclipse returns to day after a turn');
  }
  const text = await discard.innerText();
  await page.locator('[data-do=view]').click();
  assert.equal(await canvas.count(), 0);
  assert.equal(await discard.innerText(), text);
  await page.locator('[data-do=view]').click();
  await canvas.waitFor();
  assert.equal(await discard.innerText(), text);
}

async function check(browser, mode, seed, flipCard) {
  const page = await browser.newPage(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(
    (s) =>
      Object.defineProperty(crypto, 'getRandomValues', {
        value: (a) => {
          a[0] = s;
          return a;
        },
      }),
    seed,
  );
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
  await page.goto('http://127.0.0.1:' + server.address().port + '/development.html');
  await page.selectOption('#mode', mode);
  await page.selectOption('#limit', '1000');
  if (flipCard) await page.locator('[data-preset=mayhem]').click();
  await page.locator('[data-do=start]').click();
  if (flipCard) await checkScene(page, seed, flipCard);
  else await page.locator('[data-do=view]').click();
  let drafted = 0,
    shop = 0,
    won = false,
    item = false,
    house = false,
    round2 = false,
    actions = 0,
    used = false;
  for (let i = 0; i < 1600; i++) {
    if (errors.length) throw Error(errors.join('\n'));
    const result = await page.evaluate(
      ({ item, house, round2 }) => {
        const one = (s) => document.querySelector(s),
          all = (s) => [...document.querySelectorAll(s)];
        const click = (s) => {
          const el = one(s);
          if (el && !el.disabled) {
            el.click();
            return true;
          }
          return false;
        };
        if (one('[data-do=lobby]')) return 'over';
        if (one('[data-do=draft]')) {
          if (!round2 && one('h1').textContent.endsWith('2')) return 'round2';
          if (one('[data-do=draft]').disabled && one('.panel p')?.textContent.includes('принят'))
            return 'wait';
          all('[data-card]:enabled')
            .slice(0, 2)
            .map((el) => el.dataset.card)
            .forEach((id) => click('[data-card="' + id + '"]'));
          return click('[data-do=draft]') ? 'draft' : 'wait';
        }
        if (one('[data-do=done]')) {
          if (!item && click('[data-do^="buy/item/"]:enabled')) return 'item';
          if (
            !house &&
            (click('[data-do^="buy/token/"]:enabled') ||
              click('[data-do="buy/candle"]:enabled') ||
              click('[data-do="buy/blood"]:enabled'))
          )
            return 'house';
          return click('[data-do=done]') ? 'shop' : 'wait';
        }
        if (round2 && item && click('[data-do^="item/"]:enabled')) return 'used';
        if (click('[data-do^="deal/"]') || click('[data-do=roul]')) return 'choice';
        if (one('.panel h2')?.textContent === 'Ваш ход') {
          if (click('[data-card].fits:enabled') && click('[data-do=play]')) return 'play';
          if (click('[data-do=pass]:enabled')) return 'pass';
          if (click('[data-do=draw]:enabled')) return 'draw';
        }
        return 'wait';
      },
      { item, house, round2 },
    );
    if (result === 'draft') drafted++;
    if (result === 'item') item = true;
    if (result === 'house') house = true;
    if (result === 'shop') shop++;
    if (result === 'round2') {
      round2 = true;
      if (!house || !item) break;
    }
    if (result === 'used') {
      used = true;
      break;
    }
    if (result === 'over') {
      won = true;
      break;
    }
    if (result !== 'wait') actions++;
    await page.clock.runFor(result === 'wait' ? 1400 : 200);
  }
  const out = { mode, seed, won, drafted, shop, round2, item, house, actions, used, errors };
  await page.close();
  return out;
}
(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH,
      headless: true,
      args: [
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--disable-crash-reporter',
        '--disable-background-networking',
      ],
    });
    await classicTable(browser, 'one');
    await classicTable(browser, 'debt');
    console.log('Classic table: lobby, drag and drop, night, full round and debt draft');
    for (const [seed, card] of [
      [54, 'Смена'],
      [81, 'Затмение'],
    ]) {
      const run = await check(browser, 'one', seed, card);
      console.log(card, run);
      assert.ok(run.won && run.actions);
    }
    const single = await check(browser, 'one', 7);
    console.log(single);
    assert.ok(single.won && single.actions);
    let matched = false;
    for (const seed of [437, 113, 365, 50]) {
      const r = await check(browser, 'debt', seed);
      console.log(r);
      if (r.drafted && r.shop && r.round2 && r.item && r.house && r.used) {
        matched = true;
        break;
      }
    }
    assert.ok(matched, 'No shop transaction in scenario');
  } finally {
    await browser?.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
