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
        : 'text/html; charset=utf-8',
  );
  fs.createReadStream(file).pipe(res);
});
async function check(browser, mode, seed) {
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
  await page.goto('http://127.0.0.1:' + server.address().port);
  await page.selectOption('#mode', mode);
  await page.selectOption('#limit', '1000');
  await page.locator('[data-do=start]').click();
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
      args: ['--disable-gpu', '--disable-crash-reporter', '--disable-background-networking'],
    });
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
