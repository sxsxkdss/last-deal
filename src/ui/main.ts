import { seeded } from '../match/clock.ts';
import { localGame } from '../match/local.ts';
import { botNick } from '../match/names.ts';
import type { Action, Settings } from '../match/table.ts';
import { PRESETS, PRICES } from '../rules/cards.ts';
import { ITEM_PRICE } from '../rules/items.ts';
import { COMBOS, comboOf } from '../rules/poker.ts';
import { CARD_DESC, EXTRA_I18N, NAMES, RULES_I18N, TEXT } from './labels.ts';
import { fmtLog } from './log.ts';
import './style.css';

const root = document.querySelector<HTMLElement>('#app')!;
const escape = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const val = (id: string) => (document.getElementById(id) as HTMLInputElement)?.value;
const colors = NAMES.ru.colors,
  names = NAMES.ru.values;
const label = (prefix: string, id: string) => TEXT[prefix + '_' + id] || id;
const face = (f: { c: string; v: string; title?: string }) =>
  [colors[f.c], f.title || names[f.v] || f.v].join(' · ');
const disabled = (b: boolean) => (b ? ' disabled' : '');
const button = (key: string, title: string, off = false) =>
  `<button data-do="${escape(key)}"${disabled(off)}>${escape(title)}</button>`;
const option = (id: string, name: string) => `<option value="${escape(id)}">${escape(name)}</option>`;
const mast = '<header><span class="brand">LAST DEAL</span><span>Карточный стол</span></header>';
let table: ReturnType<typeof localGame>,
  feverSecond = -1,
  seat = 0,
  selected: number[] = [],
  curtain = false,
  message = '',
  lastRevision = -1,
  lastTick = 0;
let preset = 'den',
  rules,
  cards;
let form = { mode: 'debt', limit: '250', humans: '1', bots: '1' };
function resetPreset(key: string) {
  preset = key;
  rules = { ...PRESETS[key].rules };
  cards = { ...PRESETS[key].cards };
}
resetPreset('den');
function lobby() {
  const check = (row, group) =>
    `<label class="check" title="${escape(row[2])}"><input type="checkbox" data-group="${group}" value="${row[0]}" ${(group === 'rules' ? rules : cards)[row[0]] ? 'checked' : ''}> ${escape(row[1])}</label>`;
  root.innerHTML =
    mast +
    `<section class="lobby"><div><h1>Новый стол</h1><p>Одна раздача или матч до последнего игрока под лимитом долга.</p></div>
 <div class="setup"><div class="formgrid"><label>Режим<select id="mode">${option('debt', 'Матч на долг')}${option('one', 'Одна раздача')}</select></label><label>Лимит долга<select id="limit">${[250, 500, 1000].map((x) => option(String(x), String(x))).join('')}</select></label>
 <label>Игроки за экраном<input id="humans" type="number" min="1" max="6"></label><label>Боты<input id="bots" type="number" min="0" max="5"></label></div>
 <h2>Правила стола</h2><div class="presets">${Object.entries({
   classic: 'Классика',
   den: 'Подсобка',
   mayhem: 'Без тормозов',
 })
   .map(([k, v]) => `<button data-preset="${k}" aria-pressed="${k === preset}">${v}</button>`)
   .join('')}</div>
 <details><summary>Настроить правила и карты</summary><h3>Правила</h3><div class="checks">${RULES_I18N.ru.map((r) => check(r, 'rules')).join('')}</div><h3>Карты Дома</h3><div class="checks">${EXTRA_I18N.ru.map((r) => check(r, 'cards')).join('')}</div></details>
 <button class="primary" data-do="start">Начать игру</button><output>${escape(message)}</output></div></section>`;
  for (const [id, v] of Object.entries(form))
    (document.getElementById(id) as HTMLInputElement).value = v;
}
function keepForm() {
  for (const id of Object.keys(form)) form[id] = val(id);
}
function start() {
  keepForm();
  const human = +form.humans,
    bot = +form.bots,
    n = human + bot;
  if (!Number.isInteger(n) || !Number.isInteger(human) || human < 1 || bot < 0 || n < 2 || n > 6) {
    message = 'За столом должно быть от двух до шести участников.';
    lobby();
    return;
  }
  const seed = crypto.getRandomValues(new Uint32Array(1))[0],
    nickRandom = seeded(seed ^ 0x42);
  const settings: Settings = {
    members: Array.from({ length: n }, (_, i) => ({
      name: i < human ? 'Игрок ' + (i + 1) : botNick(nickRandom),
      bot: i >= human,
    })),
    mode: form.mode as Settings['mode'],
    limit: +form.limit,
    rules,
    cards,
  };
  table = localGame(settings, seeded(seed));
  seat = 0;
  selected = [];
  message = '';
  curtain = human > 1;
  lastTick = performance.now();
  render();
}
type View = ReturnType<ReturnType<typeof localGame>['view']>;
function target(v: View) {
  return (
    '<label>Цель<select id="target">' +
    v.players.map((p, i) => (i !== seat && !p.out ? option(String(i), p.name) : '')).join('') +
    '</select></label>'
  );
}
function selectColor(id: string, title: string, cols: string[]) {
  return `<label>${title}<select id="${id}">${cols.map((c) => option(c, colors[c])).join('')}</select></label>`;
}
function shop(v: View) {
  const m = v.match,
    me = v.players[seat],
    off = m.done[seat],
    funds = m.chips[seat];
  const offers = (ids: string[], kind: string, prefix: string) =>
    ids
      .map((id) => {
        const cost = kind === 'item' ? ITEM_PRICE[id] : PRICES.token;
        return `<button data-do="buy/${kind}/${id}" title="${escape(label(prefix + 'D', id))}"${disabled(off || funds < cost || (kind === 'token' && me.tokens.length >= 3))}>${escape(label(prefix, id))} · ${cost}¢</button>`;
      })
      .join('');
  return `<h2>Расчёт раздачи</h2><table><tr><th>Игрок</th><th>В руке</th><th>За карты</th><th>За ходы¹</th><th>Фишки</th></tr>${m.last.rows.map((r) => `<tr><td>${escape(v.players[r.i].name)}</td><td>${r.cards}</td><td>${r.paid}</td><td>${r.turn}</td><td>+${r.chips}¢</td></tr>`).join('')}</table><small>¹ Прирост долга до расчёта с учётом списаний.</small>
 <h2>Лавка Дома · ${funds}¢</h2><div class="actions">${offers(m.offers, 'token', 'tok')}${[
   ['pay', 'Погасить 25 долга'],
   ['setup', 'Подстава'],
   ['interest', 'Проценты'],
   ['candle', 'Свечка'],
   ['blood', 'Кровь'],
 ]
   .map(([k, t]) => button('buy/' + k, t + ' · ' + PRICES[k] + '¢', off || funds < PRICES[k]))
   .join(
     '',
   )}</div>${target(v)}<h2>Тёмная лавка</h2><div class="actions">${offers(m.dark, 'item', 'item')}</div>${button('done', off ? 'Готово' : 'Закончить покупки', off)}`;
}
function actions(v: View) {
  const my = v.turn === seat,
    me = v.players[seat];
  if (v.phase === 'over') {
    const w = v.match?.champ ?? v.winner;
    return '<h2>Победитель · ' + escape(v.players[w]?.name) + '</h2>' + button('lobby', 'Новый стол');
  }
  if (v.phase === 'draft')
    return (
      '<h2>Передача двух карт</h2><p>' +
      (v.match.passed
        ? 'Ваш выбор принят. Ожидаем остальных.'
        : 'Отметьте две обычные карты в своей руке и передайте соседу.') +
      '</p>' +
      button(
        'draft',
        'Передать карты',
        v.match.passed || selected.length !== Math.min(2, v.hand.filter((c) => !c.unique).length),
      )
    );
  if (v.phase === 'shop') return shop(v);
  const aim = target(v);
  if (v.match?.col[seat])
    return (
      '<h2>Ход коллектора</h2>' +
      aim +
      button('col/give', 'Подкинуть две карты', v.match.colUsed) +
      button('col/lever', 'Дёрнуть рычаг', v.match.colUsed)
    );
  if (v.offer)
    return (
      '<h2>' +
      { dark: 'Сделка с демоном', light: 'Сделка с ангелом', both: 'Двуличие' }[v.offer.kind] +
      '</h2>' +
      aim +
      v.offer.opts
        .map(
          (id) =>
            `<button class="contract" data-do="deal/${id}"><b>${escape(label('deal', id))}</b><span>${escape(label('dealD', id))} ${escape(TEXT['dealP_' + id] || '')}</span></button>`,
        )
        .join('') +
      (v.offer.kind === 'dark' ? button('decline', 'Порвать договор') : '')
    );
  const cols = selectColor('color', 'Цвет', v.colors);
  if (v.roulette === seat) return '<h2>Цветная рулетка</h2>' + cols + button('roul', 'Выбрать цвет');
  const chosen = selected.map((id) => v.hand.find((c) => c.id === id)).filter(Boolean);
  const combo = v.rules.multi && v.rules.combos && comboOf(chosen.map((c) => c.face));
  const lead = table.selection(seat, selected);
  return `<h2>${my ? 'Ваш ход' : 'Ходит ' + escape(v.players[v.turn].name)}</h2><div class="formgrid compact">${cols}${selectColor('flipColor', 'Цвет после смены', v.flipColors)}${aim}</div>
 <div class="actions">${v.rules.multi && v.rules.combos ? button('hint', 'Подсказать комбинацию', !my) : ''}${button('play', combo ? 'Сыграть · ' + label('combo', combo.key) : 'Сыграть' + (chosen.length ? ' · ' + chosen.length : ''), !my || !lead)}${button('draw', 'Взять карту', !v.canDraw)}${button('pass', 'Пас', !v.canPass)}${v.canGamble ? button('gamble', 'Рулетка') : ''}</div>
 <div class="actions">${['confess', 'wind', 'puppet', 'sharp']
   .filter((id) => me.deals.includes(id))
   .map((id) => button('ability/' + (id === 'sharp' ? 'burn' : id), label('deal', id), !my))
   .join(
     '',
   )}${v.items.map((it) => button('item/' + it.id, label('item', it.id), !it.enabled)).join('')}</div>`;
}
function render() {
  if (!table) return lobby();
  const prev = Object.fromEntries(['target', 'color', 'flipColor'].map((k) => [k, val(k)])),
    v = table.view(seat);
  lastRevision = v.revision;
  feverSecond = v.effects.curse === 'fever' ? table.seconds : -1;
  const humans = v.players.map((p, i) => (p.bot ? -1 : i)).filter((i) => i >= 0);
  if (curtain) {
    root.innerHTML =
      mast +
      `<section class="lobby"><h1>Передайте экран</h1><p>${escape(v.players[seat].name)}</p>${button('reveal', 'Открыть мою руку')}</section>`;
    return;
  }
  selected = selected.filter((id) => v.hand.some((c) => c.id === id));
  const me = v.players[seat],
    night = v.side === 'D',
    e = v.effects;
  const clock = v.phase === 'draft' || v.phase === 'shop' ? v.match.left : v.match?.war?.[1];
  const fx = [
    v.pending ? 'Стопка +' + v.pending + ' · минимум ' + v.stackMin : '',
    e.lastCall !== null ? 'До звонка ' + e.lastCall : '',
    e.dynamite ? 'Фитиль догорает' : '',
    e.horse
      ? label('horse', e.horse.k) +
        ' · ' +
        (TEXT['horseD_' + e.horse.k + '_' + e.horse.v] || e.horse.v) +
        ' · ' +
        e.horse.left +
        ' ходов'
      : '',
    e.curse ? 'Проклятие · ' + label('curse', e.curse) : '',
    e.cross ? 'Крест · ' + e.cross : '',
    e.lock ? 'Цвет на замке · ' + e.lock : '',
    e.inflate ? 'Инфляция · ' + e.inflate : '',
    e.maze ? 'Вертушка · ' + e.maze : '',
    e.mult > 1 ? 'Следующая атака ×' + e.mult : '',
    e.flipBack ? 'Затмение' : '',
    e.slots && !night ? 'Слоты через ' + e.slots : '',
    v.debt ? 'Добор · ' + (v.debt.until ? colors[v.debt.until] : v.debt.n) : '',
    me.loan ? 'Займ · осталось сыграть ' + me.loan : '',
    v.drawRun ? 'Добрано до цвета · ' + v.drawRun : '',
    me.owe ? 'К получению · ' + me.owe : '',
  ].filter(Boolean);
  root.innerHTML =
    mast +
    `<div class="tablehead"><h1>${v.match ? 'Раздача ' + v.match.round : 'Одна раздача'}</h1><div>${night ? 'Ночь' : 'День'} · ${v.dir === 1 ? 'по часовой' : 'против часовой'} <strong id="clock">${clock != null ? Math.ceil(clock / 1000) + ' с' : ''}</strong></div></div>
 <div class="layout"><section class="board"><div class="felt ${night ? 'night' : ''}"><div class="rivals">${v.players.map((p, i) => `<article class="${i === v.turn ? 'active' : ''}"><b>${escape(p.name)}</b> · ${p.count} карт${p.shield ? ' · Бронежилет' : ''}${v.match ? ' · ' + p.debt + '/' + p.limit + ' · ' + p.chips + '¢' : ''}${p.out ? ' · вышел' : ''}<small>${[...p.deals.map((d) => label('deal', d)), ...p.inventory.map((d) => label('item', d)), ...p.tokens.map((d) => label('tok', d)), ...Object.keys(p.fx || {}).map((d) => label('item', d))].map(escape).join(' · ')}</small>${p.backs.length ? '<details><summary>Рубашки</summary>' + p.backs.map((f) => escape(face(f))).join(', ') + '</details>' : ''}</article>`).join('')}</div>
 <div class="piles"><button class="pile deck" data-do="draw" ${disabled(!v.canDraw)}><small>КОЛОДА</small><b>${escape(v.nextBack.title || names[v.nextBack.v] || v.nextBack.v)}</b><span>${escape(colors[v.nextBack.c])}</span></button><div class="pile" data-color="${v.top.c}"><small>СБРОС</small><b>${escape(v.top.title || names[v.top.v] || v.top.v)}</b><span>${escape(colors[v.color])}</span></div></div><div class="fx">${fx.map(escape).join(' · ') || '&nbsp;'}</div></div>
 <section class="panel">${actions(v)}<output role="status">${escape(message)}</output></section>
 <section class="panel hand"><h2>${escape(me.name)} · рука</h2>${v.match ? '<small>Шанс ангела ' + v.hope[0] + '% · демона ' + v.hope[1] + '%</small>' : ''}${v.nextFace ? '<p>Шулер · ' + escape(face(v.nextFace)) + '</p>' : ''}
 <div class="handcards">${v.hand.map((c) => `<button data-card="${c.id}" data-color="${c.face.c}" aria-pressed="${selected.includes(c.id)}" title="${escape(CARD_DESC.ru[c.face.v] || CARD_DESC.ru.num)}" class="card ${c.playable ? 'fits' : ''}"${disabled(c.locked || (v.phase === 'draft' && c.unique))}><small>${escape(colors[c.face.c])}</small><strong>${escape(c.face.title || names[c.face.v] || c.face.v)}</strong><small>${c.locked ? 'Цепи' : c.unique ? 'Уникальная' : selected.includes(c.id) ? 'Выбрана' : ''}</small></button>`).join('')}</div>
 ${
   humans.length > 1
     ? humans
         .filter((i) => i !== seat)
         .map((i) => button('seat/' + i, 'Передать экран · ' + v.players[i].name))
         .join('')
     : ''
 }</section></section>
 <aside><h2>Журнал</h2><ol reversed>${v.log
   .slice()
   .reverse()
   .slice(0, 12)
   .map((l) => '<li>' + escape(fmtLog(l)) + '</li>')
   .join('')}</ol><details><summary>Покерные комбинации</summary><ul>${Object.entries(COMBOS)
   .map(
     ([id, c]) =>
       '<li>' + label('combo', id) + ' · ' + c.d + ' сброс / ' + c.m + ' всем / −' + c.r + ' долга</li>',
   )
   .join('')}</ul></details></aside></div>`;
  for (const [key, v] of Object.entries(prev)) {
    const el = document.getElementById(key) as HTMLSelectElement;
    if (el && [...el.options].some((o) => o.value === v)) el.value = v;
  }
}
root.addEventListener('change', (ev) => {
  const el = ev.target as HTMLInputElement;
  if (el.dataset.group) {
    (el.dataset.group === 'rules' ? rules : cards)[el.value] = el.checked;
    preset = 'custom';
    root.querySelectorAll('[data-preset]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
  }
});
root.addEventListener('click', (ev) => {
  const el = (ev.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!el || el.disabled) return;
  if (el.dataset.preset) {
    keepForm();
    resetPreset(el.dataset.preset);
    lobby();
    return;
  }
  if (el.dataset.card) {
    const id = +el.dataset.card;
    selected = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    message = '';
    render();
    return;
  }
  const [k, id, detail] = (el.dataset.do || '').split('/');
  if (k === 'start') {
    start();
    return;
  }
  if (k === 'hint') {
    selected = table.hint(seat);
    message = selected.length ? '' : 'Комбинаций в руке нет.';
    render();
    return;
  }
  if (k === 'lobby') {
    table = null;
    message = '';
    lobby();
    return;
  }
  if (k === 'seat' || k === 'reveal') {
    if (k === 'seat') {
      seat = +id;
      selected = [];
    }
    curtain = k === 'seat';
    message = '';
    render();
    return;
  }
  const v = table.view(seat),
    target = +val('target'),
    color = val('color');
  let a: Action;
  switch (k) {
    case 'play': {
      const first = selected.find((i) => v.hand.find((c) => c.id === i)?.playable);
      a = {
        k,
        cards: [first, ...selected.filter((i) => i !== first)],
        target,
        color,
        flipColor: val('flipColor'),
      };
      break;
    }
    case 'draft':
      a = { k, cards: selected };
      break;
    case 'draw':
    case 'pass':
    case 'done':
      a = { k };
      break;
    case 'gamble':
      a = { k, target };
      break;
    case 'roul':
      a = { k, color };
      break;
    case 'decline':
    case 'deal':
      a = { k: 'deal', id: id || null, target };
      break;
    case 'ability':
      a = { k, id, cards: selected };
      break;
    case 'item':
      a = { k, id };
      break;
    case 'buy':
      a = { k, kind: id, id: detail, target };
      break;
    case 'col':
      a = { k: 'collector', kind: id as 'give' | 'lever', target };
      break;
    default:
      return;
  }
  const ok = table.dispatch(seat, a);
  message = ok ? '' : 'Это действие сейчас недоступно.';
  if (ok) selected = [];
  render();
});
document.addEventListener('keydown', (ev) => {
  if (!table || curtain || /INPUT|SELECT|BUTTON/.test((ev.target as HTMLElement).tagName)) return;
  const action = ev.code === 'KeyP' ? 'pass' : ['Space', 'KeyD'].includes(ev.code) ? 'draw' : '';
  if (action) {
    ev.preventDefault();
    root.querySelector<HTMLButtonElement>('[data-do="' + action + '"]')?.click();
  }
});
setInterval(() => {
  if (!table) return;
  const now = performance.now();
  table.advance(now - lastTick);
  lastTick = now;
  if (table.revision !== lastRevision || (feverSecond >= 0 && table.seconds !== feverSecond)) {
    render();
    return;
  }
  const clock = document.getElementById('clock');
  if (clock) {
    const left = table.remaining;
    clock.textContent = left === null ? '' : Math.max(0, Math.ceil(left / 1000)) + ' с';
  }
}, 100);
lobby();
