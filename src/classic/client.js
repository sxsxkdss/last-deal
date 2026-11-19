import { createMusic, tracks } from './music.ts';
// Presentation from sxsxkdss/last-deal-legacy at 98d0478. Game actions go through the local TypeScript table.
import { playCue } from './cues.ts';
import { localConnection } from './connection.ts';
import { webConnection } from './websocket.ts';
import { Game } from '../rules/game.ts';
import { Bot } from '../rules/bot.ts';
import { ALPHA, EXTRA_CARDS, FACES, PRESETS, RULE_ALL, SIDE_COLORS, cardCode, other } from '../rules/cards.ts';
import { LIGHT_DEALS, canDark, canLight, hasDeal } from '../rules/contracts.ts';
import { COMBOS, COMBO_RANK, comboCands, comboOf, comboWorth, isJoker } from '../rules/poker.ts';
import { ITEMS, ITEM_AUTO, ITEM_PRICE, canUseItem } from '../rules/items.ts';
import { HORSEMEN, horseOn, warded } from '../rules/horsemen.ts';
let music;
let CARD_ID = 1;
const codeCard = code => ({ id: CARD_ID++, L: {...FACES.L[ALPHA.indexOf(code[0])]}, D: {...FACES.D[ALPHA.indexOf(code[1])]} });
function deserialize(st) {
  const g = Object.assign(Object.create(Game.prototype), { horseOn, warded, canUseItem });
  g.gid = String(st.gid); g.rules = st.ru; g.side = st.sd === 'D' ? 'D' : 'L';
  const ob = other(g.side);
  g.players = st.p.map(a => {
    const hs = String(a[3] || '');
    let hand;
    if (hs[0] === '!') hand = [...hs.slice(1)].map(ch => { const c = { id: CARD_ID++, hidden: true }; c[ob] = Object.assign({}, FACES[ob][ALPHA.indexOf(ch)] || { c: 'w', v: 'wild' }); return c; });
    else { hand = []; for (let i = 0; i + 1 < hs.length; i += 2) hand.push(codeCard(hs.slice(i, i + 2))); }
    return { name: String(a[0]).slice(0, 20), av: String(a[1]).slice(0, 8), peer: String(a[2] || ''), hand,
      out: !!(a[4] & 1), elim: !!(a[4] & 2), human: !!(a[4] & 16), shield: !!(a[4] & 32), left: !!(a[4] & 64), oweN: a[5] || 0, owed: [], loan: a[6] || 0,
      ...(() => { const d = Array.isArray(a[8]) ? a[8] : []; return { angel: d[0] || 0, demon: d[1] || 0, deals: String(d[2] || '').split('+').filter(Boolean), fallen: !!(d[3] & 4), broke: !!(d[3] & 8), skipNext: !!(d[3] & 16), signedNow: !!(d[3] & 32), debt: d[4] || 0, limit: d[5] || 0, markT: d[6] >= 0 ? d[6] : null, used: Object.fromEntries(String(d[7] || '').split(',').filter(Boolean).map(k => [k, true])), exT: d[8] >= 0 ? d[8] : null, puppetLast: d[9] >= 0 ? d[9] : null, angelBlock: d[10] || 0, noAngel: !!(d[3] & 64), tookLight: !!(d[3] & 128) }; })(),
      ...(() => { const d = Array.isArray(a[10]) ? a[10] : []; return { inv: String(d[0] || '').split(',').filter(Boolean), fx: Object.fromEntries(String(d[1] || '').split(',').filter(Boolean).map(x => { const [k, v] = x.split(':'); return [k, v === undefined ? true : +v]; })), buff: d[2] || 0 }; })() };
  });
  // chains and unique cards travel by position in the hand
  st.p.forEach((a, i) => {
    const h = g.players[i].hand;
    if (Array.isArray(a[7])) for (const [k, ch, lk] of a[7]) if (h[k]) { h[k].chain = ch; h[k].lock = !!lk; }
    const u = String(a[9] || ''); for (let k = 0; k < u.length; k++) if (u[k] === '1' && h[k]) h[k].uniq = true;
    if (Array.isArray(a[11])) a[11].forEach((w, k) => { if (h[k]) h[k].wid = w; });
  });
  g.horse = Array.isArray(st.hz) ? { k: st.hz[0], v: st.hz[1], left: st.hz[2], curses: String(st.hz[3] || '').split(',').filter(Boolean) } : null;
  g.offer = Array.isArray(st.of) ? { pi: st.of[0], kind: st.of[1], opts: st.of[2] || [] } : null;
  g.top = codeCard(st.t); g.top.wid = st.ti; if (Array.isArray(st.cx)) { g.chaosIn = st.cx[0]; g.inflate = st.cx[1]; g.lock = st.cx[2]; g.multNext = st.cx[3] || 1; g.maze = st.cx[4] || 0; g.potatoState = st.cx[5] || 0; g.turnNo = st.cx[6] || 0; g.crossLeft = st.cx[7] || 0; } g.debt = Array.isArray(st.db) ? { pi: st.db[0], n: st.db[1], until: st.db[2] || null, got: st.db[3], kind: st.db[4] } : null; g.pile = Array.isArray(st.pl) ? st.pl.map(String) : []; g.pileN = st.pn || 1;
  g.next = { id: 0, hidden: true }; g.next[ob] = Object.assign({}, FACES[ob][ALPHA.indexOf(st.nb)] || { c: 'w', v: 'wild' });
  if (typeof st.nf === 'string' && st.nf.length === 2) g.next = codeCard(st.nf);
  g.color = st.c; g.dir = st.d; g.turn = st.u; g.pending = st.k; g.stackMin = st.m; g.stackFrom = typeof st.sf === 'number' ? st.sf : -1; if (Array.isArray(st.dr)) { g.drawRunPi = st.dr[0]; g.drawRun = st.dr[1]; } g.flipBack = Array.isArray(st.fb) ? { pi: st.fb[0], seq: st.fb[1] } : null;
  g.roulette = st.o < 0 ? null : st.o; g.drewBy = st.w; g.winner = st.x < 0 ? null : st.x; g.seq = st.s;
  g.log = (st.l || []).map(([msg, cls, k, a]) => ({ msg: String(msg), cls: String(cls || ''), k: typeof k === 'string' ? k : null, a: a && typeof a === 'object' ? a : null }));
  g.events = Array.isArray(st.ev) ? st.ev : []; g.evSeq = st.es || 0;
  return g;
}


// ===== TEXT: English + Russian. The House talks: short, dry, a little threatening. =====
const LANGS = { en: 'English', ru: 'Русский' };
let LANG = (() => {
  try { const s = JSON.parse(localStorage.getItem('unoFlipNoMercy') || 'null'); if (s && LANGS[s.lang]) return s.lang; } catch (e) {}
  return /^ru\b/i.test(navigator.language || '') ? 'ru' : 'en';
})();
// Russian plural: 1 карта, 2 карты, 5 карт
function plural(n, one, few, many) { if (LANG !== 'ru') return n === 1 ? one : few; const a = Math.abs(n) % 100, b = a % 10; if (a > 10 && a < 20) return many; if (b > 1 && b < 5) return few; if (b === 1) return one; return many; }
const cardsW = n => LANG === 'ru' ? plural(n, 'карта', 'карты', 'карт') : (n === 1 ? 'card' : 'cards');
const cardsAcc = n => LANG === 'ru' ? plural(n, 'карту', 'карты', 'карт') : (n === 1 ? 'card' : 'cards');

// ---------- card names ----------
const NAMES = {
  en: {
    colors: { r: 'Red', y: 'Yellow', g: 'Green', b: 'Blue', p: 'Pink', t: 'Teal', o: 'Orange', v: 'Purple', w: 'Wild', x: 'Dead' },
    values: {
      skip: 'Skip', rev: 'Reverse', d1: 'Draw 1', d2: 'Draw 2', d4: 'Draw 4', d5: 'Draw 5', flip: 'Shift', dflip: 'Eclipse', discall: 'Discard All', skipall: 'Skip Everyone',
      mirror: 'Mirror', shield: 'Vest', wild: 'Wild', wd2: 'Wild +2', wd4: 'Wild +4', wrd4: 'Wild Reverse +4', wd6: 'Wild +6', wd10: 'Wild +10', wd15: 'Wild +15', wrd8: 'Wild Reverse +8',
      wdc: 'Draw Till Color', roul: 'Color Roulette', mul2: 'Double Down', mul3: 'Triple Down', lucky: 'Horseshoe', glass: 'Shot Glass',
      spin: 'Jackpot', loan: 'Loan', gift: 'Tip', echo: 'Encore', freeze: 'Handcuffs', bomb: 'Shotgun', d6: 'Redeal',
      pill: 'Scratch Card', maze: 'Spinner', deal: 'Contract',
      swind: 'Second Wind', sacr: 'Sacrifice', djoker: 'Demonic Joker', lead: 'Lead', leech: 'Leech', fuse: 'Lit Fuse'
    }
  },
  ru: {
    colors: { r: 'Красный', y: 'Жёлтый', g: 'Зелёный', b: 'Синий', p: 'Розовый', t: 'Бирюзовый', o: 'Оранжевый', v: 'Фиолетовый', w: 'Джокер', x: 'Мёртвая' },
    values: {
      skip: 'Пропуск', rev: 'Разворот', d1: 'Возьми 1', d2: 'Возьми 2', d4: 'Возьми 4', d5: 'Возьми 5', flip: 'Смена', dflip: 'Затмение', discall: 'Сброс цвета', skipall: 'Пропуск всех',
      mirror: 'Зеркало', shield: 'Бронежилет', wild: 'Джокер', wd2: 'Джокер +2', wd4: 'Джокер +4', wrd4: 'Джокер разворот +4', wd6: 'Джокер +6', wd10: 'Джокер +10', wd15: 'Джокер +15', wrd8: 'Джокер разворот +8',
      wdc: 'Тяни до цвета', roul: 'Цветная рулетка', mul2: 'Дабл', mul3: 'Трипл', lucky: 'Подкова', glass: 'Рюмка',
      spin: 'Джекпот', loan: 'Займ', gift: 'Чаевые', echo: 'Бис', freeze: 'Наручники', bomb: 'Обрез', d6: 'Пересдача',
      pill: 'Лотерейка', maze: 'Вертушка', deal: 'Контракт',
      swind: 'Второе дыхание', sacr: 'Жертва', djoker: 'Демонический джокер', lead: 'Свинец', leech: 'Пиявка', fuse: 'Фитиль'
    }
  }
};
const colorName = c => NAMES[LANG].colors[c] || c;
const cardName = f => !f ? '' : ((f.c === 'w' || f.c === 'x') ? NAMES[LANG].values[f.v] : colorName(f.c) + ' ' + (NAMES[LANG].values[f.v] || f.v));
// short labels printed on the cards themselves
const CARD_TXT = {
  en: { flip: 'shift', dflip: 'eclipse', discall: 'discard', skipall: 'everyone', mirror: 'mirror', shield: 'vest', wild: 'wild', reverse: 'reverse', wdc: 'till color', roul: 'roulette',
    mult: 'double', mult3: 'triple', lucky: 'horseshoe', glass: 'shot', spin: 'jackpot', loan: 'loan', gift: 'tip', echo: 'encore', freeze: 'cuffs',
    bomb: 'shotgun', d6: 'redeal', pill: 'scratch',
    maze: 'spinner', deal: 'contract', swind: 'second wind', sacr: 'sacrifice', djoker: 'demonic joker', lead: 'lead', leech: 'leech', fuse: 'fuse' },
  ru: { flip: 'смена', dflip: 'затмение', discall: 'сброс', skipall: 'всех', mirror: 'зеркало', shield: 'жилет', wild: 'джокер', reverse: 'разворот', wdc: 'до цвета', roul: 'рулетка',
    mult: 'дабл', mult3: 'трипл', lucky: 'подкова', glass: 'рюмка', spin: 'джекпот', loan: 'займ', gift: 'чаевые', echo: 'бис', freeze: 'наручники',
    bomb: 'обрез', d6: 'пересдача', pill: 'лотерейка',
    maze: 'вертушка', deal: 'контракт', swind: 'второе дыхание', sacr: 'жертва', djoker: 'демонический джокер', lead: 'свинец', leech: 'пиявка', fuse: 'фитиль' }
};

// ---------- interface text ----------
const STR = {};
STR.en = {
  // start screen and lobby
  lede: 'A card table in the basement of a casino. Days on the floor, nights in the back room. Rooms for friends, no sign-up.',
  codePh: 'CODE', name: 'Name', createRoom: 'Open a room', haveCode: 'Got a code?', joinRoom: 'Join', howTo: 'How to play', language: 'Language',
  roomCode: 'Room code', copyLink: 'Copy link', copied: 'Copied', codeCopied: 'Code copied.', yourName: 'Your name', players: 'Players', rules: 'Rules',
  extraCards: 'House cards', startGame: 'Deal', tableRules: 'Table rules (the host decides)', leaveRoom: 'Leave the room', on: 'on', off: 'off',
  host: 'Host', player: 'Player', away: 'away', addBot: 'Add a bot', rmBot: 'Remove bot', botTag: 'Bot',
  hintHost: 'Send your friends the code or the link.',
  hintGuest: "You're in. The host deals.",
  needMore: 'One more player, at least.',
  ready: n => `${n} at the table. Room for 6.`,
  inProgress: "A match is on. You'll be dealt in next deal.",
  waitHost: 'Waiting for the host.',
  presets: 'Table', presetClassic: 'Classic', presetClassicD: 'Plain cards and stacking. No House cards.',
  presetDen: 'Back room', presetDenD: 'How the House plays it.',
  presetMayhem: 'No limits', presetMayhemD: 'Every rule, every card.',
  presetCustom: 'Custom', fineTune: 'Change the rules',
  matchMode: 'Match', modeOne: 'Single deal', modeOneD: 'One deal. First to empty their hand wins.',
  modeDebt: 'Debt match', modeDebtD: 'Cards left in your hand become debt. Go over the limit and you work for the House.',
  debtLimit: 'Debt limit',

  // connection
  connecting: 'Connecting…', connServer: 'Connecting to the server…', enterCode: 'The room code is 4 characters.', enterName: 'Name first, then Join.',
  rejoining: c => `Back to room ${c}…`, cantReach: "Can't reach the server.", reconnecting: 'Reconnecting…', connLost: 'Connection lost. Reconnecting…',
  otherTab: 'This room is open in another tab.', room: c => `Room ${c}`, hostLeft: 'The host left.', noRoom: 'No room with that code. It may have closed.',
  badReq: 'The server refused that.',

  // table
  log: 'Log', soundOn: 'Sound on', soundOff: 'Sound off', draw: 'Draw', passDeck: 'Keep it and pass', leave: 'Leave', menu: 'Menu',
  sort: m => `Sort: ${({ color: 'colour', value: 'number', none: 'off', manual: 'by hand' })[m]}`,
  take: k => `Take +${k}`, pickUpLeft: k => `Pick up (${k} left)`, drawUntil: (c, k) => `Draw till ${c} (${k})`, penalty: k => `Pick up ${k}`, drawAgain: k => `Draw again (${k})`,
  lightSide: 'Day · the floor', darkSide: 'Night · the back room', colorPending: 'Colour not called yet', cw: 'Clockwise', ccw: 'Anticlockwise', stack: 'Stack',
  youWin: 'You win', wins: n => `${n} wins`, youLeft: "You left the match. You can still watch.",
  oweBanner: k => `Picking up ${k} ${cardsW(k)}…`, myStackDebt: k => `Picking up the stack: ${k} to go`, myColorDebt: (c, k) => `Drawing till ${c}: ${k} so far`,
  otherDebtN: (n, k) => `${n} is picking up (${k} to go)`, otherDebtC: (n, c) => `${n} is drawing till ${c}`,
  rouletteMe: 'Call a colour', rouletteOther: n => `${n} is calling a colour`,
  stackOrTake: (m, k) => `Put +${m} or more on it, reflect it, or click the deck to take +${k}`,
  playOrPass: 'Play the card you drew, or click the deck to keep it',
  yourTurn: 'Your turn. Click a card or drag it to the pile.',
  keepDrawing: c => `Nothing fits. Click the deck till you get ${c} or a wild.`,
  drawOne: 'Nothing fits. Click the deck.',
  turnOf: (n, aw) => `${n}'s turn${aw ? ' (away, skipped soon)' : ''}`,
  tagLeft: 'Left', tagAway: 'Away', tagOwes: k => `Owes ${k}`, tagNext: 'Next', tagShield: 'Vest', tagWinner: 'Winner', tagPlayer: 'Player', tagTurn: 'their turn',
  yourTurnStamp: 'YOUR TURN', tAgain: 'Go again',
  phaseDayRules: 'Slots running · poker hands pay you · revolver from +8',
  phaseNightRules: 'Slots off · poker hands hit the next player · revolver from +4 · dynamite under the table',
  slotsClosed: 'Slots closed till morning', comboNightSlap: (n, k) => `${n} +${k}`,
  lastCallIn: k => `Last call in ${k}`, lastCallNow: 'Last call', tLastCall: 'LAST CALL',
  chaosIn: n => `Slots in ${n}`, inflated: n => `Draws ×2 · ${n}`, locked: n => `Colour locked · ${n}`, chaosTitle: 'Slots',
  potatoOn: 'Dynamite under the table', potatoHot: 'Dynamite: any second now', mazeLeft: k => `Spinner: ${k}`,

  // pop-ups over the table
  tStack: k => `Stack +${k}`, tSkipped: 'Skipped', tSkipAll: 'Everyone skipped', tReverse: 'Reverse', tSwap: 'Hands swapped', tRotate: 'Hands passed round',
  tRoulette: 'Roulette', tMulti: k => `${k} at once`, tMirror: n => `Back to ${n}`, tShieldUp: 'Vest on', tShield: k => `Vest stops +${k}`,
  tMult: x => `×${x}`, tArm: x => `×${x} loaded`, tLucky: 'Lucky', tLuckyDebt: k => `Debt −${k}`, tMiss: 'Nothing', tGlass: 'Shattered', tGlassHit: 'Shot',
  tLoan: 'Loan', tDue: 'Pay up', tFire: 'ON FIRE', gambleBtn: 'Roulette',
  tShot: (n, k) => `Click. ${n} +${k}`, tBang: k => `BANG. +${k}`,
  gambleQ: 'Who do you aim at?', gambleSub: k => `Click, 50%: they take the whole +${k}. Bang: you take it doubled.`,
  tPotato: n => `Dynamite: ${n}`,
  pill_wipe: 'Ticket: debt −10', pill_fine: 'Ticket: debt +10', pill_draw: 'Ticket: pick up 2', pill_toss: 'Ticket: drop 2', pill_chips: 'Ticket: 10¢',
  pill_health: 'Ticket: drop 2', pill_badtrip: 'Ticket: pick up 3', pill_steel: 'Ticket: vest', pill_drowsy: 'Ticket: next player cuffed', pill_telepills: 'Ticket: hands swapped', pill_wizard: 'Ticket: reverse',
  tD6: 'REDEAL', tMaze: 'SPINNER', tDeal: 'CONTRACT',
  tGift: n => `Tip for ${n}`, tEcho: 'ENCORE', tEchoNone: 'Nothing to repeat',
  tBomb: 'BOOM', tDark: 'NIGHT', tLight: 'DAY', tagLoan: n => `loan ${n}`,
  multNext: x => `next draw ×${x}`, tColGive: n => `${n} +2`,
  tBad_lead: (n, k) => `Lead: ${n} +${k}`, tBad_leech: (n, k, full) => full ? `The leech lets go of ${n}` : `Leech: ${n} +1`, tBad_fuse: (n, k) => `BOOM: ${n} +${k}`,

  // poker hands
  combo_pair: 'Pair', combo_twopair: 'Two Pair', combo_three: 'Three of a Kind', combo_straight: 'Straight', combo_flush: 'Flush', combo_fullhouse: 'Full House',
  combo_four: 'Four of a Kind', combo_straightflush: 'Straight Flush', combo_five: 'Five of a Kind',
  comboToss: n => `−${n} ${n === 1 ? 'card' : 'cards'}`, comboHit: n => `everyone +${n}`, comboRelief: n => `debt −${n}`,
  noCombo: 'Not a hand', togetherN: n => `${n} together`, multiOff: 'No multi-drops at this table',
  comboQ: 'Play a hand?', comboSub: 'Number cards that make a poker hand. They go down left to right. Drag to reorder, click to drop one.',
  selectOn: 'Picking', selectOff: 'Pick several', selectShort: 'Pick', selectOnShort: 'Pick ✓',
  refTitle: 'Poker hands', refColHand: 'Hand', refColToss: 'Drop', refColHit: 'All', refColDebt: 'Debt',
  refTossTip: 'Extra cards that go with the hand. By day they leave your hand. At night the next player takes them.',
  refHitTip: 'Every other player picks up this many.', refDebtTip: 'Debt the House lets go. Days only.',
  refShort: 'Day: extras leave your hand and debt is forgiven · Night: the next player takes them · a straight is 4+ in a row, any colours, (+1) at 6+; a straight flush is 3+ in a row of one colour, (+2) and −10 at 5+; a full house is a set and a pair, or two sets · a plain Wild is any number · n is the run’s length',

  // dialogs
  pickColor: 'Call a colour', rouletteTitle: 'Colour roulette', rouletteSub: 'Call a colour. You draw till it turns up and keep everything you drew.',
  flipWild: 'The shift turns up a wild', flipWildSub: n => `The other side of this card is ${n}. Call its colour.`,
  giftQ: 'Who gets the tip?', giftSub: k => `${k} random cards from your hand go to them.`,
  togetherQ: 'Play them together?', togetherSub: 'They go down left to right. Drag to reorder, click a card to take it out or put it back. The last one sets the colour.',
  firstMustFit: 'The first card has to fit the pile by itself.', playN: k => `Play ${k} ${cardsAcc(k)}`, clearOrder: 'Clear', selectAll: 'All', cancel: 'Cancel', close: 'Close', modalBack: 'Back to the choice',
  leaveQ: 'Leave the match?', leaveSub: "You're out and the rest play on. If your connection just dropped, you have a minute to get back to your seat.", stay: 'Stay',
  handEmptied: 'Hand empty.', finalCounts: 'Cards left:', winner: 'winner', cardsN: k => `${k} ${cardsW(k)}`,
  playAgain: 'Again', backLobby: 'Back to the lobby', waitNext: 'Waiting for the host to deal.',

  // menu and settings
  menuSort: 'Sort hand', menuLog: 'Log', menuRules: 'How to play', menuSound: 'Sound', menuLeave: 'Leave the match', menuLang: 'Language', menuFx: 'Effects', gameLog: 'Log',
  fx: m => `Effects: ${m === 'full' ? 'full' : 'light'}`, fxFull: 'Full', fxLite: 'Light',
  settings: 'Settings', setSound: 'Sound', setVolume: 'Effects volume', setAmbient: 'Music', setAmbVol: 'Music volume', setShake: 'Screen shake',
  setBg: 'Background', bgMoving: 'Moving', bgStill: 'Still', setTips: 'Card tooltips', setMusicFx: 'Table moves with the music',
  setCactus: 'Cactus on the table', cactusFound: 'You found the cactus.', tipBack: 'Other side',

  // debt match
  tagDebt: (d, l) => `debt ${d}/${l}`, tagChips: c => `${c}¢`, tagCollector: 'collector', roundN: k => `deal ${k}`, secsLeft: s => `${s} s`,
  draftTitle: 'Pass two', draftSub: n => `Pick two cards for ${n}. Two more come from the other side.`, draftGo: k => `Pass ${k}/2`,
  draftWait: 'Passed. Waiting for the rest…', draftCol: "The others are passing cards. Collectors don't.",
  draftBadHint: 'Grey hatched cards are bad. Get rid of them now.',
  shopTitle: k => `Deal ${k}: settling up`, dealWon: 'WON', outCollector: 'OUT', debtTot: (d, l) => `debt ${d}/${l}`,
  youCollector: "You're over the limit. You work for the House now: once a deal you can slip someone two cards or pull the slot lever.",
  shopWait: 'Done. Waiting for the rest…', walletChips: c => `Chips: ${c}¢`, walletDebt: (d, l) => `Debt: ${d} / ${l}`,
  shopPay: 'Pay off debt', payBtn: (p, a) => `${p}¢ → debt −${a}`, shopTricks: 'Dirty tricks',
  trickSetup: p => `Stack the deck: +3 cards next deal (${p}¢)`, trickInterest: p => `Interest: +10% debt (${p}¢)`, shopDone: "I'm done",
  matchWon: 'You beat the House', matchWins: n => `${n} beats the House`, matchOverSub: k => `${k} deals. The rest are working off their debt.`,
  colReady: 'Collector: one job this deal', colUsed: 'Collector: job done', colGive: 'Slip 2 cards', colLever: 'Pull the lever',
  colGiveQ: 'Who gets two cards?', colGiveSub: 'Compliments of the House.',
  turnDebt: k => `+${k} turns`, handDebt: k => `+${k} hand`,

  // House tokens
  tok_safe: 'Safe', tokD_safe: 'Your 3 most expensive cards never count as debt.',
  tok_sharp: 'Loaded Pair', tokD_sharp: 'A pair counts as three of a kind.',
  tok_pad: 'Padding', tokD_pad: 'The first stack you take each deal is halved.',
  tok_counter: 'Bookkeeper', tokD_counter: '+1¢ for every action card you play.',
  tok_light: 'Light Hand', tokD_light: 'Start every deal with one card fewer.',
  tok_debtor: 'Debtor', tokD_debtor: 'Number cards never count as debt.',
  tok_license: 'Licence', tokD_license: 'Start every deal with a House card.',
  tok_luck: 'Luck', tokD_luck: 'The revolver clicks for you 2 times out of 3.',
  tok_usurer: 'Usurer', tokD_usurer: 'You get 10.0% of what the player on your right pays.',

  // the angel and the demon
  angelTitle: 'The angel', angelSub: 'The angel left a note. It wants nothing back, but you have to pick one.', angelMust: "You don't say no to the angel.",
  demonTitle: 'The demon', demonSub: 'The demon puts a contract on the table. Sign one clause or tear it up.', tearUp: 'Tear it up', price: 'Price',
  fallWarn: d => `Signing burns your light deals (${d}): each gives back 10 debt and 10¢. The angel never comes back, the demon +5.0% for good. You get the seal of the fallen and a demonic joker.`,
  angelChance: 'Chance the angel comes', demonChance: 'Chance the demon comes tonight', oddsAngel: 'angel', oddsDemon: 'demon tonight',
  oddsWait: 'One deal per hand. The visitors come back next deal.',
  tipLightDeal: 'Light deal · the angel', tipDarkDeal: 'Dark deal · the demon',
  abConfess: 'Redemption', abWind: 'Ascend', abWindTip: 'Two thirds of your hand turn into jokers (needs 6+ cards). Once a deal.', abPuppetTip: "The next player misses their turn and can't answer an attack. Strings first, then the attack. 5 debt.", exactorQ: 'Who does the Exactor collect from?', exactorSub: 'They get +10.0% debt at the start of every deal (at least +15).', tDjoker: n => `${n}: DEMONIC JOKER`, tCross: n => `${n}: THE CROSS`, crossOn: k => `Cross: no angel for ${k} more turns.`, abConfessGo: k => `Let go ${k}/3`, abConfessHint: 'Mark up to 3 cards, then press again', abPuppet: 'Pull the strings', abBurn: 'Burn the top card',
  markQ: 'Who gets the Mark?', markSub: 'Your attacks on them +2. Theirs on you too.', sacrQ: 'Who is the sacrifice?', sacrSub: '10 cards in chains. Nothing stops it.',
  tAngelCame: n => `The angel visits ${n}`, tDemonCame: n => `The demon visits ${n}`, tDealTaken: (n, d) => `${n}: ${d}`, tFall: n => `${n} falls`,
  tGuardian: n => `${n}'s guardian`, tSacr: n => `${n}: SACRIFICE`, tSwind: n => `${n}: second wind`, tBroke: n => `${n} is broke`, tChained: k => `${k} in chains`,
  tPuppet: n => `${n} on strings`, signed: 'SIGNED', blessed: 'BLESSED', tOverLimit: 'OVER THE LIMIT',
  shopVisitors: 'Call a visitor', buyCandle: p => `Light a candle: angel +5.0% (${p}¢)`, buyBlood: p => `Bleed a little: demon +10.0% (${p}¢)`,
  deal_rosary: 'Rosary', dealD_rosary: 'All debt coming your way is 30.0% smaller.', dealP_rosary: '',
  deal_candle: 'Undying Flame', dealD_candle: 'Every quiet turn takes 5 off your debt.', dealP_candle: '',
  deal_wind: 'Ascension', dealD_wind: 'Once a deal, with 6+ cards in hand: two thirds of your hand turn into jokers.', dealP_wind: '',
  deal_halo: 'Halo', dealD_halo: 'The first stack that reaches you each deal is 50.0% smaller.', dealP_halo: '',
  deal_confess: 'Redemption', dealD_confess: 'Once a deal: let go of 3 cards you choose.', dealP_confess: '',
  deal_alms: 'Alms', dealD_alms: '−8 debt for every card you give away (2 a time at most), up to −32 a deal.', dealP_alms: '',
  deal_clean: 'Clean Hands', dealD_clean: 'Number cards never count toward your per-turn debt.', dealP_clean: '',
  deal_grace: 'Grace', dealD_grace: 'At the end of a deal your 4 most expensive cards are free.', dealP_grace: '',
  deal_guardian: 'Guardian', dealD_guardian: 'The first attack on you each deal goes back to whoever sent it.', dealP_guardian: '',
  deal_penance: 'Penance', dealD_penance: 'An item: any time, 40.0% of your debt goes.', dealP_penance: '',
  deal_double: 'Heavy Hand', dealD_double: 'Your attacks hit twice as hard.', dealP_double: 'every attack adds 5.0% to your debt (at least 5)',
  deal_usury: 'Eternal Debtor', dealD_usury: 'Rivals pay 1.5× per-turn debt, and each gets +10 debt at the start of every deal.', dealP_usury: 'your debt +15.0% now (at least +20) and +5 to you at the start of every deal',
  deal_chains: 'Shackles', dealD_chains: 'At the start of each rival\'s turn, 20.0% of their hand is chained.', dealP_chains: 'attacks on you hit 1.5× harder',
  deal_exactor: 'Exactor', dealD_exactor: 'A rival you pick gets +10.0% debt at the start of every deal (at least +15).', dealP_exactor: 'your per-turn debt ×1.25',
  deal_blood: 'Blood Chips', dealD_blood: 'Every card a rival takes from your attacks: a chip for you, +2 debt for them.', dealP_blood: 'per-turn debt ×1.25',
  deal_bail: 'Bail', dealD_bail: 'An item: any time, 40.0% of your debt goes.', dealP_bail: 'your debt limit drops 15.0% for good',
  deal_devour: 'Glutton', dealD_devour: 'When a rival takes 10+ cards at once, 10 of your debt goes.', dealP_devour: 'poker hands stop paying you chips',
  deal_mark: 'The Mark', dealD_mark: 'Pick a rival: your attacks on them +2.', dealP_mark: 'their attacks on you +2',
  deal_nighttax: 'Night Tax', dealD_nighttax: 'Rivals pay +3 debt at the start of each of their night turns.', dealP_nighttax: '+3 to you on each of your day turns',
  deal_drum: 'Cursed Drum', dealD_drum: 'The revolver clicks for you 2 times out of 3.', dealP_drum: 'a shot triples the stack',
  deal_desecrate: 'Desecration', dealD_desecrate: 'The Inverted Cross item. Takes no dark deal slot.', dealP_desecrate: 'the angel never comes again (unless you already hold a dark deal)',
  deal_puppet: 'Puppeteer', dealD_puppet: 'On your turn: the next player misses their turn and can\'t answer an attack. Never the same player twice running.', dealP_puppet: '5 debt each time',
  deal_sharp: 'Cardsharp', dealD_sharp: 'You see both sides of the next card in the deck and can burn it.', dealP_sharp: '5 debt per burned card',

  // the horsemen
  horseRides: 'A HORSEMAN RIDES IN', horseLeft: k => `${k}/10 turns`, horseGone: k => `${k} rides off`,
  horse_death: 'Death', horse_war: 'War', horse_famine: 'Famine', horse_plague: 'Plague',
  horseD_death_curse: 'Everyone is cursed until he leaves.',
  horseD_war_timer: '4 seconds a turn. Too slow and the turn is over, plus 3 cards.',
  horseD_war_fury: 'Every attack hits for 3 more.',
  horseD_war_arms: 'Each turn, two of your quiet cards (not wilds) turn into attacks.',
  horseD_famine_two: 'One card a turn. No multi-drops, no poker hands. Discard All takes itself and one card of its colour.',
  horseD_famine_tithe: 'After each turn, two random cards go to whoever holds the fewest. Discard All takes itself and one card of its colour.',
  horseD_plague_blank: 'Wilds and House cards go down and do nothing.',
  horseD_plague_rot: 'At the start of each turn, 3 random cards in your hand rot and are replaced.',
  curse_dark: 'Darkness', curse_fever: 'Fever', curse_mirror: 'Mirror World', curse_static: 'Static',
  curseD_dark: 'You see only what is near your cursor.', curseD_fever: 'Your hand shakes and reshuffles every second.',
  curseD_mirror: 'The table is flipped left to right. The log stays put.', curseD_static: 'Interference, and the screen keeps crashing.',

  // the Dark shop
  darkShop: 'The Dark shop', invHave: 'Yours', itemAuto: 'auto', itemUsed: (n, it) => `${n}: ${it}`,
  eclipseBuff: 'Breaker: better odds of a visitor until your next deal',
  twofaceSub: "Both visitors put their papers down. Take any one: no fall, no limits, and it doesn't count as this hand's deal.",
  item_rent: 'Rent', item_veil: 'Night Cover', item_dawn: 'Day Cover', item_shell: 'Shell', item_oven: 'Oven', item_eclipse: 'Breaker', item_twoface: 'Two-Faced', item_ward: 'Ward', item_penance: 'Penance', item_bail: 'Bail', item_cross: 'Inverted Cross',
  itemD_penance: 'From the angel. Any time: 40.0% of your debt goes.', itemD_bail: 'From the demon. Any time: 40.0% of your debt goes.', itemD_cross: "From Desecration. Any time, even on someone else's turn: for 15 table turns every angel deal and angel chance is off, for everyone.",
  itemKind_penance: 'Use · at once', itemKind_bail: 'Use · at once', itemKind_cross: 'Use · 15 turns',
  itemD_rent: '+3¢ every time day turns to night or back, up to 10 times. Till the end of the hand.',
  itemD_veil: 'At night: hand debt −40.0% and the demon +2.0%. Till the end of the hand.',
  itemD_dawn: 'By day: hand debt −40.0% and the angel +2.0%. Till the end of the hand.',
  itemD_shell: 'Hand debt −20.0%, day or night. Till the end of the hand.',
  itemD_oven: 'Only with 30+ cards in hand: half of them (rounded down) burn.',
  itemD_eclipse: 'Day turns to night, or night to day, like a Shift. 25.0%: that side’s visitor comes at once. Otherwise both visitors +5.0% until your next deal.',
  itemD_twoface: 'Goes off by itself when a visitor comes: both lay out their deals and you take one. No fall, no limits, not this hand’s deal.',
  itemD_ward: 'Goes off by itself when a horseman rides in (or use it early): no horseman touches you till the end of the hand.',
  itemKind_rent: 'Use · till end of hand', itemKind_veil: 'Use · till end of hand', itemKind_dawn: 'Use · till end of hand', itemKind_shell: 'Use · till end of hand',
  itemKind_oven: 'Use · at once', itemKind_eclipse: 'Use · at once', itemKind_twoface: 'Automatic', itemKind_ward: 'Automatic · till end of hand',

  // the slot machine
  ev: {
    inflation: ['Inflation', 'Draw cards count double for 6 plays'],
    tax: ['Leader tax', 'Whoever has the fewest cards picks up 2'],
    revolution: ['Revolution', 'Every hand moves one seat along'],
    storm: ['Shift change', 'Day and night swap'],
    lock: ['Colour lock', 'Colour or a wild only, for 4 plays'],
    bleed: ['Ante', 'Everyone picks up 1'],
    jackpot: ['Payout', 'Someone lucky drops 2 random cards'],
    mirrorworld: ['U-turn', 'Direction reverses']
  }
};

STR.ru = {
  // стартовый экран и лобби
  lede: 'Карточный стол в подвале казино. Днём играют в зале, ночью в подсобке. Комната для своих, без регистрации.',
  codePh: 'КОД', name: 'Имя', createRoom: 'Открыть комнату', haveCode: 'Есть код?', joinRoom: 'Войти', howTo: 'Как играть', language: 'Язык',
  roomCode: 'Код комнаты', copyLink: 'Скопировать ссылку', copied: 'Скопировано', codeCopied: 'Код скопирован.', yourName: 'Ваше имя', players: 'Игроки', rules: 'Правила',
  extraCards: 'Карты Дома', startGame: 'Сдать', tableRules: 'Правила стола (решает хозяин)', leaveRoom: 'Уйти из комнаты', on: 'вкл', off: 'выкл',
  host: 'Хозяин', player: 'Игрок', away: 'отошёл', addBot: 'Посадить бота', rmBot: 'Убрать бота', botTag: 'Бот',
  hintHost: 'Отправьте друзьям код или ссылку.',
  hintGuest: 'Вы за столом. Сдаёт хозяин.',
  needMore: 'Нужен ещё хотя бы один игрок.',
  ready: n => `За столом: ${n}. Мест — 6.`,
  inProgress: 'Идёт матч. Вас сдадут со следующей раздачи.',
  waitHost: 'Ждём хозяина.',
  presets: 'Стол', presetClassic: 'Классика', presetClassicD: 'Обычные карты и стопки. Без карт Дома.',
  presetDen: 'Подсобка', presetDenD: 'Как играет Дом.',
  presetMayhem: 'Без тормозов', presetMayhemD: 'Все правила, все карты.',
  presetCustom: 'Своё', fineTune: 'Поменять правила',
  matchMode: 'Матч', modeOne: 'Одна раздача', modeOneD: 'Одна раздача. Кто первым скинул руку, тот и выиграл.',
  modeDebt: 'Матч на долг', modeDebtD: 'Карты, оставшиеся в руке, идут в долг. Вышли за лимит — работаете на Дом.',
  debtLimit: 'Лимит долга',

  // связь
  connecting: 'Подключаемся…', connServer: 'Подключаемся к серверу…', enterCode: 'В коде комнаты 4 символа.', enterName: 'Сначала имя, потом «Войти».',
  rejoining: c => `Возвращаемся в комнату ${c}…`, cantReach: 'Сервер не отвечает.', reconnecting: 'Переподключаемся…', connLost: 'Связь пропала. Переподключаемся…',
  otherTab: 'Эта комната открыта в другой вкладке.', room: c => `Комната ${c}`, hostLeft: 'Хозяин ушёл.', noRoom: 'Комнаты с таким кодом нет. Возможно, её уже закрыли.',
  badReq: 'Сервер это не принял.',

  // стол
  log: 'Журнал', soundOn: 'Звук вкл', soundOff: 'Звук выкл', draw: 'Взять', passDeck: 'Оставить и пасовать', leave: 'Выйти', menu: 'Меню',
  sort: m => `Сортировка: ${({ color: 'цвет', value: 'число', none: 'нет', manual: 'вручную' })[m]}`,
  take: k => `Взять +${k}`, pickUpLeft: k => `Брать (ещё ${k})`, drawUntil: (c, k) => `Тянуть до «${c}» (${k})`, penalty: k => `Взять ${k}`, drawAgain: k => `Тянуть ещё (${k})`,
  lightSide: 'День · зал', darkSide: 'Ночь · подсобка', colorPending: 'Цвет ещё не назван', cw: 'По часовой', ccw: 'Против часовой', stack: 'Стопка',
  youWin: 'Вы выиграли', wins: n => `Выиграл(а) ${n}`, youLeft: 'Вы вышли из матча. Можно досмотреть.',
  oweBanner: k => `Берёте ${k} ${cardsAcc(k)}…`, myStackDebt: k => `Берёте стопку: ещё ${k}`, myColorDebt: (c, k) => `Тянете до «${c}»: уже ${k}`,
  otherDebtN: (n, k) => `${n} берёт карты (ещё ${k})`, otherDebtC: (n, c) => `${n} тянет до «${c}»`,
  rouletteMe: 'Назовите цвет', rouletteOther: n => `${n} называет цвет`,
  stackOrTake: (m, k) => `Положите +${m} или больше, отразите или нажмите на колоду и возьмите +${k}`,
  playOrPass: 'Сыграйте взятую карту или нажмите на колоду, чтобы оставить её',
  yourTurn: 'Ваш ход. Нажмите на карту или перетащите её в сброс.',
  keepDrawing: c => `Ходить нечем. Тяните из колоды до «${c}» или джокера.`,
  drawOne: 'Ходить нечем. Берите из колоды.',
  turnOf: (n, aw) => `Ходит ${n}${aw ? ' (отошёл, скоро пропуск)' : ''}`,
  tagLeft: 'Ушёл', tagAway: 'Отошёл', tagOwes: k => `Должен ${k}`, tagNext: 'Следующий', tagShield: 'Жилет', tagWinner: 'Победитель', tagPlayer: 'Игрок', tagTurn: 'ходит',
  yourTurnStamp: 'ВАШ ХОД', tAgain: 'Ещё ход',
  phaseDayRules: 'Слоты крутятся · комбинации платят вам · рулетка от +8',
  phaseNightRules: 'Слоты выключены · комбинации бьют следующего · рулетка от +4 · под столом динамит',
  slotsClosed: 'Слоты закрыты до утра', comboNightSlap: (n, k) => `${n} +${k}`,
  lastCallIn: k => `Последний звонок через ${k}`, lastCallNow: 'Последний звонок', tLastCall: 'ПОСЛЕДНИЙ ЗВОНОК',
  chaosIn: n => `Слоты через ${n}`, inflated: n => `«Возьми» ×2 · ${n}`, locked: n => `Цвет на замке · ${n}`, chaosTitle: 'Слоты',
  potatoOn: 'Под столом динамит', potatoHot: 'Динамит: вот-вот', mazeLeft: k => `Вертушка: ${k}`,

  // всплывашки над столом
  tStack: k => `Стопка +${k}`, tSkipped: 'Пропуск', tSkipAll: 'Пропускают все', tReverse: 'Разворот', tSwap: 'Обмен руками', tRotate: 'Руки по кругу',
  tRoulette: 'Рулетка', tMulti: k => `${k} разом`, tMirror: n => `Обратно: ${n}`, tShieldUp: 'Жилет надет', tShield: k => `Жилет держит +${k}`,
  tMult: x => `×${x}`, tArm: x => `×${x} заряжен`, tLucky: 'Повезло', tLuckyDebt: k => `Долг −${k}`, tMiss: 'Пусто', tGlass: 'Вдребезги', tGlassHit: 'Рюмка',
  tLoan: 'Займ', tDue: 'Плати', tFire: 'В УДАРЕ', gambleBtn: 'Рулетка',
  tShot: (n, k) => `Щёлк. ${n} +${k}`, tBang: k => `БАХ. +${k}`,
  gambleQ: 'В кого целитесь?', gambleSub: k => `Щелчок, 50%: он забирает всю стопку +${k}. Выстрел: берёте её сами вдвое.`,
  tPotato: n => `Динамит: ${n}`,
  pill_wipe: 'Лотерейка: долг −10', pill_fine: 'Лотерейка: долг +10', pill_draw: 'Лотерейка: взять 2', pill_toss: 'Лотерейка: скинуть 2', pill_chips: 'Лотерейка: 10¢',
  pill_health: 'Лотерейка: скинуть 2', pill_badtrip: 'Лотерейка: взять 3', pill_steel: 'Лотерейка: жилет', pill_drowsy: 'Лотерейка: наручники следующему', pill_telepills: 'Лотерейка: обмен руками', pill_wizard: 'Лотерейка: разворот',
  tD6: 'ПЕРЕСДАЧА', tMaze: 'ВЕРТУШКА', tDeal: 'КОНТРАКТ',
  tGift: n => `Чаевые: ${n}`, tEcho: 'БИС', tEchoNone: 'Повторять нечего',
  tBomb: 'БАХ', tDark: 'НОЧЬ', tLight: 'ДЕНЬ', tagLoan: n => `займ ${n}`,
  multNext: x => `след. «Возьми» ×${x}`, tColGive: n => `${n} +2`,
  tBad_lead: (n, k) => `Свинец: ${n} +${k}`, tBad_leech: (n, k, full) => full ? `Пиявка отстала от ${n}` : `Пиявка: ${n} +1`, tBad_fuse: (n, k) => `БАХ: ${n} +${k}`,

  // покерные комбинации
  combo_pair: 'Пара', combo_twopair: 'Две пары', combo_three: 'Сет', combo_straight: 'Стрит', combo_flush: 'Флеш', combo_fullhouse: 'Фулл-хаус',
  combo_four: 'Каре', combo_straightflush: 'Стрит-флеш', combo_five: 'Покер',
  comboToss: n => `−${n} ${cardsAcc(n)}`, comboHit: n => `всем +${n}`, comboRelief: n => `долг −${n}`,
  noCombo: 'Не комбинация', togetherN: n => `${n} вместе`, multiOff: 'За этим столом мультисброса нет',
  comboQ: 'Сыграть комбинацию?', comboSub: 'Числовые карты, которые складываются в покерную комбинацию. Ложатся слева направо. Перетащите, чтобы переставить, нажмите, чтобы убрать.',
  selectOn: 'Выбор', selectOff: 'Выбрать несколько', selectShort: 'Выбор', selectOnShort: 'Выбор ✓',
  refTitle: 'Покерные комбинации', refColHand: 'Комбинация', refColToss: 'Сброс', refColHit: 'Всем', refColDebt: 'Долг',
  refTossTip: 'Сколько лишних карт уходит вместе с комбинацией. Днём уходят из вашей руки, ночью их берёт следующий.',
  refHitTip: 'Столько берёт каждый соперник.', refDebtTip: 'Сколько долга Дом списывает. Только днём.',
  refShort: 'День: лишние уходят из руки, долг списывается · Ночь: лишние берёт следующий · стрит — от 4 подряд любых цветов, (+1) от 6 карт; стрит-флеш — от 3 подряд одного цвета, (+2) и −10 от 5 карт; фулл-хаус — сет и пара или два сета · простой джокер заменяет любую цифру · n — длина ряда',

  // диалоги
  pickColor: 'Назовите цвет', rouletteTitle: 'Цветная рулетка', rouletteSub: 'Назовите цвет. Тянете, пока он не выпадет, и всё вытянутое остаётся у вас.',
  flipWild: 'Смена открыла джокера', flipWildSub: n => `На обороте этой карты ${n}. Назовите цвет.`,
  giftQ: 'Кому чаевые?', giftSub: k => `${k} ${cardsAcc(k)} из вашей руки наугад уйдут ему.`,
  togetherQ: 'Сыграть вместе?', togetherSub: 'Ложатся слева направо. Перетащите, чтобы переставить, нажмите на карту, чтобы убрать или вернуть. Цвет задаёт последняя.',
  firstMustFit: 'Первая карта должна подходить к сбросу сама.', playN: k => `Сыграть ${k} ${cardsAcc(k)}`, clearOrder: 'Снять', selectAll: 'Все', cancel: 'Отмена', close: 'Закрыть', modalBack: 'Вернуться к выбору',
  leaveQ: 'Уйти из матча?', leaveSub: 'Вы выбываете, остальные играют дальше. Если просто отвалилась связь, у вас минута, чтобы вернуться на место.', stay: 'Остаться',
  handEmptied: 'Рука пуста.', finalCounts: 'Осталось карт:', winner: 'победитель', cardsN: k => `${k} ${cardsW(k)}`,
  playAgain: 'Ещё раз', backLobby: 'В лобби', waitNext: 'Ждём, пока хозяин сдаст.',

  // меню и настройки
  menuSort: 'Сортировка', menuLog: 'Журнал', menuRules: 'Как играть', menuSound: 'Звук', menuLeave: 'Уйти из матча', menuLang: 'Язык', menuFx: 'Эффекты', gameLog: 'Журнал',
  fx: m => `Эффекты: ${m === 'full' ? 'все' : 'лёгкие'}`, fxFull: 'Все', fxLite: 'Лёгкие',
  settings: 'Настройки', setSound: 'Звук', setVolume: 'Громкость эффектов', setAmbient: 'Музыка', setAmbVol: 'Громкость музыки', setShake: 'Тряска экрана',
  setBg: 'Фон', bgMoving: 'Живой', bgStill: 'Неподвижный', setTips: 'Подсказки к картам', setMusicFx: 'Стол в такт музыке',
  setCactus: 'Кактус на столе', cactusFound: 'Вы нашли кактус.', tipBack: 'Обратная сторона',

  // матч на долг
  tagDebt: (d, l) => `долг ${d}/${l}`, tagChips: c => `${c}¢`, tagCollector: 'коллектор', roundN: k => `раздача ${k}`, secsLeft: s => `${s} с`,
  draftTitle: 'Передайте две', draftSub: n => `Выберите две карты для ${n}. Ещё две придут с другой стороны.`, draftGo: k => `Отдать ${k}/2`,
  draftWait: 'Отдано. Ждём остальных…', draftCol: 'Остальные передают карты. Коллекторы не передают.',
  draftBadHint: 'Серые карты в штриховку — плохие. Избавьтесь от них сейчас.',
  shopTitle: k => `Раздача ${k}: расчёт`, dealWon: 'ВЫИГРАЛ', outCollector: 'ВЫБЫЛ', debtTot: (d, l) => `долг ${d}/${l}`,
  youCollector: 'Вы за лимитом и теперь работаете на Дом. Раз за раздачу можно подкинуть кому-нибудь две карты или дёрнуть рычаг слотов.',
  shopWait: 'Готово. Ждём остальных…', walletChips: c => `Фишки: ${c}¢`, walletDebt: (d, l) => `Долг: ${d} / ${l}`,
  shopPay: 'Погасить долг', payBtn: (p, a) => `${p}¢ → долг −${a}`, shopTricks: 'Пакости',
  trickSetup: p => `Подстава: +3 карты в следующей раздаче (${p}¢)`, trickInterest: p => `Проценты: +10% долга (${p}¢)`, shopDone: 'Хватит',
  matchWon: 'Вы обыграли Дом', matchWins: n => `${n} обыгрывает Дом`, matchOverSub: k => `Раздач: ${k}. Остальные отрабатывают долг.`,
  colReady: 'Коллектор: одно дело за раздачу', colUsed: 'Коллектор: дело сделано', colGive: 'Подкинуть 2', colLever: 'Дёрнуть рычаг',
  colGiveQ: 'Кому две карты?', colGiveSub: 'Привет от Дома.',
  turnDebt: k => `+${k} за ходы`, handDebt: k => `+${k} за руку`,

  // жетоны Дома
  tok_safe: 'Сейф', tokD_safe: '3 самые дорогие карты в руке не идут в долг.',
  tok_sharp: 'Подтасовка', tokD_sharp: 'Пара считается сетом.',
  tok_pad: 'Подкладка', tokD_pad: 'Первая стопка, которую вы берёте за раздачу, вдвое меньше.',
  tok_counter: 'Счетовод', tokD_counter: '+1¢ за каждую сыгранную карту действия.',
  tok_light: 'Лёгкая рука', tokD_light: 'Каждая раздача начинается с картой меньше.',
  tok_debtor: 'Должник', tokD_debtor: 'Цифры не идут в долг.',
  tok_license: 'Лицензия', tokD_license: 'В начале каждой раздачи у вас карта Дома.',
  tok_luck: 'Фарт', tokD_luck: 'Револьвер щёлкает вхолостую 2 раза из 3.',
  tok_usurer: 'Ростовщик', tokD_usurer: 'Вам идёт 10,0% от того, что платит игрок справа.',

  // ангел и демон
  angelTitle: 'Ангел', angelSub: 'Ангел оставил записку. Взамен ничего не просит, но выбрать придётся.', angelMust: 'Ангелу не отказывают.',
  demonTitle: 'Демон', demonSub: 'Демон кладёт на стол контракт. Подпишите один пункт или порвите.', tearUp: 'Порвать', price: 'Цена',
  fallWarn: d => `Подпись сожжёт ваши светлые сделки (${d}): за каждую −10 долга и 10¢. Ангел больше не придёт, демон +5,0% навсегда. Вы получите печать падшего и демонического джокера.`,
  angelChance: 'Шанс, что придёт ангел', demonChance: 'Шанс, что ночью придёт демон', oddsAngel: 'ангел', oddsDemon: 'демон ночью',
  oddsWait: 'Одна сделка за раздачу. Гости вернутся в следующей.',
  tipLightDeal: 'Светлая сделка · ангел', tipDarkDeal: 'Тёмная сделка · демон',
  abConfess: 'Искупление', abWind: 'Вознестись', abWindTip: 'Две трети руки станут джокерами (нужно 6+ карт). Раз за раздачу.', abPuppetTip: 'Следующий игрок пропустит ход и не сможет ответить на атаку. Сначала нитки, потом атака. 5 долга.', exactorQ: 'С кого взыскивать?', exactorSub: 'Ему +10,0% долга в начале каждой раздачи (мин. +15).', tDjoker: n => `${n}: ДЕМОНИЧЕСКИЙ ДЖОКЕР`, tCross: n => `${n}: КРЕСТ`, crossOn: k => `Крест: ангела нет ещё ${k} ход.`, abConfessGo: k => `Отпустить ${k}/3`, abConfessHint: 'Отметьте до 3 карт и нажмите ещё раз', abPuppet: 'Дёрнуть нитки', abBurn: 'Сжечь верхнюю',
  markQ: 'Кому Метку?', markSub: 'Ваши атаки на него +2. Его на вас тоже.', sacrQ: 'Кого в жертву?', sacrSub: '10 карт в цепях. Защиты нет.',
  tAngelCame: n => `К ${n} пришёл ангел`, tDemonCame: n => `К ${n} пришёл демон`, tDealTaken: (n, d) => `${n}: ${d}`, tFall: n => `${n} падает`,
  tGuardian: n => `Хранитель ${n}`, tSacr: n => `${n}: ЖЕРТВА`, tSwind: n => `${n}: второе дыхание`, tBroke: n => `${n} разорён`, tChained: k => `${k} в цепях`,
  tPuppet: n => `${n} на нитках`, signed: 'ПОДПИСАНО', blessed: 'БЛАГОСЛОВЛЕНО', tOverLimit: 'ЗА ЛИМИТОМ',
  shopVisitors: 'Позвать гостя', buyCandle: p => `Поставить свечку: ангел +5,0% (${p}¢)`, buyBlood: p => `Пустить кровь: демон +10,0% (${p}¢)`,
  deal_rosary: 'Чётки', dealD_rosary: 'Весь долг, который на вас падает, меньше на 30,0%.', dealP_rosary: '',
  deal_candle: 'Негасимая', dealD_candle: 'Каждый тихий ход списывает 5 долга.', dealP_candle: '',
  deal_wind: 'Вознесение', dealD_wind: 'Раз за раздачу, при 6+ картах в руке: две трети руки становятся джокерами.', dealP_wind: '',
  deal_halo: 'Нимб', dealD_halo: 'Первая стопка за раздачу, дошедшая до вас, на 50,0% меньше.', dealP_halo: '',
  deal_confess: 'Искупление', dealD_confess: 'Раз за раздачу: отпустить 3 карты на выбор.', dealP_confess: '',
  deal_alms: 'Милостыня', dealD_alms: '−8 долга за каждую отданную карту (до 2 карт за раз), не больше −32 за раздачу.', dealP_alms: '',
  deal_clean: 'Чистые руки', dealD_clean: 'Цифры не идут в долг за ход.', dealP_clean: '',
  deal_grace: 'Благодать', dealD_grace: 'В конце раздачи 4 самые дорогие карты бесплатно.', dealP_grace: '',
  deal_guardian: 'Хранитель', dealD_guardian: 'Первая атака на вас за раздачу возвращается тому, кто её послал.', dealP_guardian: '',
  deal_penance: 'Покаяние', dealD_penance: 'Предмет: в любой момент долг −40,0%.', dealP_penance: '',
  deal_double: 'Тяжёлая длань', dealD_double: 'Ваши атаки вдвое сильнее.', dealP_double: 'каждая атака +5,0% долга (мин. +5)',
  deal_usury: 'Вечный должник', dealD_usury: 'Соперники платят за ход ×1,5, и в начале каждой раздачи каждому +10 долга.', dealP_usury: 'долг сразу +15,0% (мин. +20) и +5 вам в начале каждой раздачи',
  deal_chains: 'Кандалы', dealD_chains: 'В начале хода соперника 20,0% его руки в цепях.', dealP_chains: 'атаки на вас ×1,5',
  deal_exactor: 'Взыскатель', dealD_exactor: 'Выбранному сопернику +10,0% долга в начале каждой раздачи (мин. +15).', dealP_exactor: 'ваш долг за ход ×1,25',
  deal_blood: 'Кровавые фишки', dealD_blood: 'За каждую карту от вашей атаки: вам фишка, сопернику +2 долга.', dealP_blood: 'долг за ход ×1,25',
  deal_bail: 'Залог', dealD_bail: 'Предмет: в любой момент долг −40,0%.', dealP_bail: 'лимит навсегда −15,0%',
  deal_devour: 'Обжора', dealD_devour: 'Соперник взял 10+ карт за раз: ваш долг −10.', dealP_devour: 'комбинации не платят вам фишки',
  deal_mark: 'Метка', dealD_mark: 'Выберите соперника: ваши атаки на него +2.', dealP_mark: 'его атаки на вас +2',
  deal_nighttax: 'Налог на ночь', dealD_nighttax: 'Соперникам +3 долга в начале каждого их ночного хода.', dealP_nighttax: '+3 вам в каждый ваш дневной ход',
  deal_drum: 'Проклятый барабан', dealD_drum: 'Револьвер щёлкает вхолостую 2 раза из 3.', dealP_drum: 'выстрел утраивает стопку',
  deal_desecrate: 'Осквернение', dealD_desecrate: 'Предмет «Перевёрнутый крест». Не занимает слот тёмной сделки.', dealP_desecrate: 'ангел больше не придёт (если тёмных сделок ещё нет)',
  deal_puppet: 'Кукловод', dealD_puppet: 'В свой ход: следующий игрок пропускает ход и не может ответить на атаку. Одного и того же два раза подряд нельзя.', dealP_puppet: '5 долга за каждый раз',
  deal_sharp: 'Шулер', dealD_sharp: 'Вы видите обе стороны следующей карты колоды и можете её сжечь.', dealP_sharp: '5 долга за каждую сожжённую',

  // всадники
  horseRides: 'ВЪЕЗЖАЕТ ВСАДНИК', horseLeft: k => `${k}/10 ходов`, horseGone: k => `${k} уезжает`,
  horse_death: 'Смерть', horse_war: 'Война', horse_famine: 'Голод', horse_plague: 'Чума',
  horseD_death_curse: 'Все прокляты, пока он не уедет.',
  horseD_war_timer: '4 секунды на ход. Не успели — ход окончен и ещё 3 карты.',
  horseD_war_fury: 'Каждая атака бьёт на 3 карты больше.',
  horseD_war_arms: 'Каждый ход две ваши тихие карты (не джокеры) превращаются в атаки.',
  horseD_famine_two: 'Одна карта за ход. Ни мультисброса, ни комбинаций. Сброс цвета забирает себя и ещё одну карту.',
  horseD_famine_tithe: 'После каждого хода две случайные карты уходят тому, у кого меньше всех. Сброс цвета забирает себя и ещё одну карту.',
  horseD_plague_blank: 'Джокеры и карты Дома ложатся и ничего не делают.',
  horseD_plague_rot: 'В начале каждого хода 3 случайные карты в руке гниют и меняются на другие.',
  curse_dark: 'Мрак', curse_fever: 'Лихорадка', curse_mirror: 'Зазеркалье', curse_static: 'Помехи',
  curseD_dark: 'Видно только то, что рядом с курсором.', curseD_fever: 'Руку трясёт, карты перемешиваются каждую секунду.',
  curseD_mirror: 'Стол отражён слева направо. Журнал на месте.', curseD_static: 'Помехи, и экран то и дело падает.',

  // Тёмная лавка
  darkShop: 'Тёмная лавка', invHave: 'У вас', itemAuto: 'само', itemUsed: (n, it) => `${n}: ${it}`,
  eclipseBuff: 'Рубильник: гости приходят чаще до вашей следующей сделки',
  twofaceSub: 'Оба гостя кладут бумаги на стол. Берите любую: без падения, без лимитов, и она не считается сделкой этой раздачи.',
  item_rent: 'Рента', item_veil: 'Ночная крыша', item_dawn: 'Дневная крыша', item_shell: 'Панцирь', item_oven: 'Печь', item_eclipse: 'Рубильник', item_twoface: 'Двуличие', item_ward: 'Оберег', item_penance: 'Покаяние', item_bail: 'Залог', item_cross: 'Перевёрнутый крест',
  itemD_penance: 'От ангела. В любой момент: долг −40,0%.', itemD_bail: 'От демона. В любой момент: долг −40,0%.', itemD_cross: 'От Осквернения. В любой момент, даже в чужой ход: на 15 ходов стола у всех выключены ангельские сделки и шансы ангела.',
  itemKind_penance: 'Включить · сразу', itemKind_bail: 'Включить · сразу', itemKind_cross: 'Включить · 15 ходов',
  itemD_rent: '+3¢ каждый раз, когда день сменяется ночью или обратно, до 10 раз. До конца раздачи.',
  itemD_veil: 'Ночью: долг за руку −40,0% и демон +2,0%. До конца раздачи.',
  itemD_dawn: 'Днём: долг за руку −40,0% и ангел +2,0%. До конца раздачи.',
  itemD_shell: 'Долг за руку −20,0%, днём и ночью. До конца раздачи.',
  itemD_oven: 'Только при 30+ картах в руке: половина из них (с округлением вниз) сгорает.',
  itemD_eclipse: 'День сменяется ночью или ночь днём, как от Смены. 25,0%: гость этой стороны приходит сразу. Иначе оба гостя +5,0% до вашей следующей сделки.',
  itemD_twoface: 'Срабатывает само, когда приходит гость: оба выкладывают сделки, вы берёте одну. Без падения, без лимитов, не считается сделкой раздачи.',
  itemD_ward: 'Срабатывает само, когда въезжает всадник (можно и заранее): до конца раздачи всадники вас не трогают.',
  itemKind_rent: 'Включить · до конца раздачи', itemKind_veil: 'Включить · до конца раздачи', itemKind_dawn: 'Включить · до конца раздачи', itemKind_shell: 'Включить · до конца раздачи',
  itemKind_oven: 'Включить · сразу', itemKind_eclipse: 'Включить · сразу', itemKind_twoface: 'Само', itemKind_ward: 'Само · до конца раздачи',

  // слот-машина
  ev: {
    inflation: ['Инфляция', 'Карты «Возьми» считаются вдвойне 6 ходов'],
    tax: ['Налог на лидера', 'У кого меньше всех карт, тот берёт 2'],
    revolution: ['Революция', 'Все руки уходят на место дальше'],
    storm: ['Пересменка', 'День и ночь меняются'],
    lock: ['Цвет на замке', '4 хода только этот цвет или джокер'],
    bleed: ['Взнос', 'Каждый берёт 1'],
    jackpot: ['Выплата', 'Кому-то везёт: 2 случайные карты долой'],
    mirrorworld: ['Задний ход', 'Направление меняется']
  }
};
function t(key, ...args) { const v = (STR[LANG] && STR[LANG][key]) ?? STR.en[key]; return typeof v === 'function' ? v(...args) : (v ?? key); }

// ---------- lobby switches: table rules and House cards ----------
const RULES_I18N = {
  en: [
    ['flip', 'Day and night', 'Shift cards turn every card over. Day becomes night and the table rules change with it.'],
    ['stacking', 'Stacking', 'Answer a draw card with one of the same value or higher.'],
    ['multi', 'Multi-drops', 'Play every card with the same number or symbol at once: a red 7, then the blue and green 7s on top. Matching wilds can go together too.'],
    ['drawUntil', 'Draw till colour', "Nothing to play? Draw one at a time. You can't pass until the colour or a wild turns up."],
    ['combos', 'Poker hands', 'Number cards can go down together as poker hands. The better the hand, the more extra cards go with it. Four of a kind and up hit everyone else.'],
    ['chaos', 'Slots', 'By day the slot machine spins every few plays and does something to the table.'],
    ['gamble', 'Russian roulette', 'Facing a stack (+8 by day, +4 at night), aim at a rival instead. Click: they take the lot. Bang: you take it doubled.'],
    ['potato', 'Dynamite', 'At night a hidden fuse burns down one play at a time. Whoever is up when it blows picks up 3.'],
    ['lastCall', 'Last call', 'After 150 turns the House closes the table. Fewest cards wins.']
  ],
  ru: [
    ['flip', 'День и ночь', 'Карта «Смена» переворачивает все карты. День становится ночью, и правила стола меняются вместе с ним.'],
    ['stacking', 'Стопки', 'На «Возьми» можно ответить картой того же номинала или старше.'],
    ['multi', 'Мультисброс', 'Все карты с одним числом или символом можно сыграть разом: красная 7, сверху синяя и зелёная. Одинаковые джокеры тоже.'],
    ['drawUntil', 'Тянуть до цвета', 'Ходить нечем — тяните по одной. Пасовать нельзя, пока не выпадет нужный цвет или джокер.'],
    ['combos', 'Покерные комбинации', 'Числовые карты можно класть комбинациями. Чем сильнее комбинация, тем больше лишних карт уходит с ней. С каре и выше достаётся всем остальным.'],
    ['chaos', 'Слоты', 'Днём каждые несколько ходов крутится слот-машина и что-нибудь делает со столом.'],
    ['gamble', 'Русская рулетка', 'Перед стопкой (днём от +8, ночью от +4) можно навести ствол на соперника. Щелчок: стопка его. Выстрел: берёте её сами вдвое.'],
    ['potato', 'Динамит', 'Ночью под столом горит невидимый фитиль, по ходу за раз. На ком рванёт, тот берёт 3.'],
    ['lastCall', 'Последний звонок', 'Через 150 ходов Дом закрывает стол. Выигрывает тот, у кого меньше карт.']
  ]
};
const EXTRA_I18N = {
  en: [
    ['mirror', 'Mirror', 'Throws anything back. A stack goes to whoever fed it. With no stack, the last card hits the one who played it.'],
    ['shield', 'Vest', 'The next stack that reaches you stops here.'],
    ['dflip', 'Eclipse', 'Day turns to night, or night to day, for one turn. Then back.'],
    ['wd15', 'Wild +15', 'Night only. The biggest card you can stack.'],
    ['mul2', 'Double Down', 'Doubles the stack on the table (up to +60), or the next draw card. Can answer a stack.'],
    ['mul3', 'Triple Down', 'Night only. The same, times three.'],
    ['lucky', 'Horseshoe', 'Heads: debt −15. Tails: two random cards leave your hand.'],
    ['glass', 'Shot Glass', 'The next player picks up 2. One time in four it breaks in your hand and you do.'],
    ['spin', 'Jackpot', 'Pulls the slot lever right now.'],
    ['loan', 'Loan', '20¢ now. Three plays later, 30 debt.'],
    ['gift', 'Tip', 'Two random cards from your hand go to a player you pick.'],
    ['echo', 'Encore', 'Repeats the card under it: a draw, Skip, Skip Everyone, Reverse or Handcuffs.'],
    ['freeze', 'Handcuffs', 'Night only. The next two players miss a turn.'],
    ['bomb', 'Shotgun', 'Night only. The next player picks up 3, their neighbours 1 each. That can be you.'],
    ['d6', 'Redeal', 'Your whole hand goes. You get as many new cards.'],
    ['pill', 'Scratch Card', 'Debt −10, debt +10, pick up 2, drop 2, or 10¢.'],
    ['maze', 'Spinner', 'Night only. For 6 plays the direction may flip after any card.'],
    ['deal', 'Contract', 'Night only. Half your hand burns, and the demon notices: +15% to its charge.']
  ],
  ru: [
    ['mirror', 'Зеркало', 'Отбивает что угодно. Стопка уходит тому, кто её кормил. Без стопки последняя карта бьёт того, кто её сыграл.'],
    ['shield', 'Бронежилет', 'Следующая стопка, дошедшая до вас, на нём и остановится.'],
    ['dflip', 'Затмение', 'День становится ночью или ночь днём на один ход. Потом обратно.'],
    ['wd15', 'Джокер +15', 'Только ночью. Самая большая карта для стопки.'],
    ['mul2', 'Дабл', 'Удваивает стопку на столе (до +60) или следующую «Возьми». Можно класть на стопку.'],
    ['mul3', 'Трипл', 'Только ночью. То же, но втрое.'],
    ['lucky', 'Подкова', 'Орёл: долг −15. Решка: две случайные карты уходят из руки.'],
    ['glass', 'Рюмка', 'Следующий берёт 2. Раз из четырёх она бьётся у вас в руке, и берёте вы.'],
    ['spin', 'Джекпот', 'Сразу дёргает рычаг слотов.'],
    ['loan', 'Займ', '20¢ сейчас. Через три хода 30 долга.'],
    ['gift', 'Чаевые', 'Две случайные карты из руки уходят игроку, которого вы выберете.'],
    ['echo', 'Бис', 'Повторяет карту под собой: «Возьми», пропуск, пропуск всех, разворот или наручники.'],
    ['freeze', 'Наручники', 'Только ночью. Двое следующих пропускают ход.'],
    ['bomb', 'Обрез', 'Только ночью. Следующий берёт 3, его соседи по 1. Сосед может оказаться вами.'],
    ['d6', 'Пересдача', 'Вся рука уходит. Взамен столько же новых карт.'],
    ['pill', 'Лотерейка', 'Долг −10, долг +10, взять 2, скинуть 2 или 10¢.'],
    ['maze', 'Вертушка', 'Только ночью. 6 ходов направление может смениться после любой карты.'],
    ['deal', 'Контракт', 'Только ночью. Половина руки сгорает, а демон берёт вас на заметку: +15% к его заряду.']
  ]
};

// ---------- card tooltips ----------
const CARD_DESC = {
  en: {
    num: 'Goes on the same colour or the same number.',
    skip: 'The next player misses a turn.',
    rev: 'Play changes direction. With two players it works as a Skip.',
    skipall: 'Everyone else misses a turn. You go again.',
    d1: 'The next player picks up 1 and misses a turn, unless they stack a draw of the same value or higher.',
    d2: 'The next player picks up 2 and misses a turn, unless they stack.',
    d4: 'The next player picks up 4 and misses a turn, unless they stack.',
    d5: 'The next player picks up 5 and misses a turn, unless they stack.',
    flip: 'Every card turns over. Day becomes night, or night day.',
    dflip: 'Day becomes night, or night day, for one turn. The table rules switch with it, then switch back.',
    discall: 'Every other card of this colour leaves your hand with it.',
    mirror: 'Throws anything back. A stack goes to whoever fed it. With no stack, the last card hits the one who played it: draws, skips and reverses as they are, anything else for +2.',
    shield: 'The next stack that reaches you stops on the vest.',
    wild: 'Goes on anything. You call the colour.',
    wd2: 'Call the colour. The next player picks up 2, unless they stack.',
    wd4: 'Call the colour. The next player picks up 4, unless they stack.',
    wrd4: 'Call the colour and reverse play. Whoever is next now picks up 4, unless they stack.',
    wrd8: 'Call the colour and reverse play. Whoever is next now picks up 8, unless they stack.',
    wd6: 'Call the colour. The next player picks up 6, unless they stack.',
    wd10: 'Call the colour. The next player picks up 10, unless they stack.',
    wd15: 'Call the colour. The next player picks up 15, unless they stack. Nothing stacks higher.',
    wdc: 'Call the colour. The next player draws till it turns up.',
    roul: 'The next player calls a colour and draws till it turns up.',
    mul2: 'Doubles the stack on the table (up to +60). With no stack, doubles the next draw card. Can answer a stack.',
    mul3: 'Triples the stack on the table (up to +60). With no stack, triples the next draw card. Can answer a stack.',
    lucky: 'Heads: debt −15. Tails: two random cards leave your hand.',
    glass: 'The next player picks up 2. One time in four it breaks in your hand and you pick them up.',
    spin: 'Pulls the slot lever. Something happens right now.',
    loan: '20¢ now. Three of your plays later, 30 debt.',
    gift: 'Two random cards from your hand go to a player you pick.',
    echo: 'Repeats the card under it: a draw card (it can carry on a stack), Skip, Skip Everyone, Reverse or Handcuffs. On anything else it does nothing.',
    freeze: 'The next two players miss a turn.',
    bomb: 'The next player picks up 3. Their neighbours on both sides pick up 1. One of them can be you.',
    d6: 'Your whole hand goes. You get as many new random cards.',
    pill: 'Scratch it: debt −10, debt +10, pick up 2, drop 2, or 10¢.',
    maze: 'For the next 6 plays the direction may flip after any card.',
    deal: 'Half your hand burns. The demon notices: +15% to its charge.',
    swind: 'A one-off from the angel. Half the rest of your hand (rounded up) turns wild.',
    djoker: 'From the fall, one a match. A joker of any colour, day and night, good in poker hands and multi-drops. Played: everyone gets 3 random cards chained for 2 turns (not if it is your last card). Stays with you between deals, can\'t be burned or passed, counts 35 in debt.',
    sacr: 'A one-off from the fall. A player you pick takes 10 cards, chained for 2 of their turns. Nothing stops it.',
    lead: 'Bad card. Goes on anything on your turn, except a stack. The colour stays and you pick up 2. Left in hand: 30 debt. Pass it on at the start of a deal.',
    leech: 'Bad card. Only goes down as your last card. While you hold it, each of your turns starts with +1. After 3 it lets go. Left in hand: 25 debt.',
    fuse: "Bad card. Can't be played. Three of your turns later it goes off in your hand: +4, and it's gone. Pass it on and it keeps burning. Left in hand: 25 debt."
  },
  ru: {
    num: 'Кладётся на тот же цвет или то же число.',
    skip: 'Следующий игрок пропускает ход.',
    rev: 'Направление игры меняется. Вдвоём работает как пропуск.',
    skipall: 'Все остальные пропускают ход. Вы ходите ещё раз.',
    d1: 'Следующий берёт 1 и пропускает ход, если не положит «Возьми» того же номинала или старше.',
    d2: 'Следующий берёт 2 и пропускает ход, если не продолжит стопку.',
    d4: 'Следующий берёт 4 и пропускает ход, если не продолжит стопку.',
    d5: 'Следующий берёт 5 и пропускает ход, если не продолжит стопку.',
    flip: 'Все карты переворачиваются. День становится ночью или ночь днём.',
    dflip: 'День становится ночью или ночь днём на один ход. Правила стола меняются вместе с ним, потом возвращаются.',
    discall: 'Все остальные карты этого цвета уходят из руки вместе с ней.',
    mirror: 'Отбивает что угодно. Стопка уходит тому, кто её кормил. Без стопки последняя карта бьёт того, кто её сыграл: «Возьми», пропуски и развороты как есть, всё остальное на +2.',
    shield: 'Следующая стопка, дошедшая до вас, останавливается на жилете.',
    wild: 'Кладётся на что угодно. Цвет называете вы.',
    wd2: 'Назовите цвет. Следующий берёт 2, если не продолжит стопку.',
    wd4: 'Назовите цвет. Следующий берёт 4, если не продолжит стопку.',
    wrd4: 'Назовите цвет и разверните игру. Тот, кто теперь следующий, берёт 4, если не продолжит стопку.',
    wrd8: 'Назовите цвет и разверните игру. Тот, кто теперь следующий, берёт 8, если не продолжит стопку.',
    wd6: 'Назовите цвет. Следующий берёт 6, если не продолжит стопку.',
    wd10: 'Назовите цвет. Следующий берёт 10, если не продолжит стопку.',
    wd15: 'Назовите цвет. Следующий берёт 15, если не продолжит стопку. Старше в стопке ничего нет.',
    wdc: 'Назовите цвет. Следующий тянет, пока он не выпадет.',
    roul: 'Следующий сам называет цвет и тянет, пока он не выпадет.',
    mul2: 'Удваивает стопку на столе (до +60). Если стопки нет, удваивает следующую «Возьми». Можно класть на стопку.',
    mul3: 'Утраивает стопку на столе (до +60). Если стопки нет, утраивает следующую «Возьми». Можно класть на стопку.',
    lucky: 'Орёл: долг −15. Решка: две случайные карты уходят из руки.',
    glass: 'Следующий берёт 2. Раз из четырёх рюмка бьётся у вас в руке, и берёте вы.',
    spin: 'Дёргает рычаг слотов. Что-то случится прямо сейчас.',
    loan: '20¢ сейчас. Через три ваших хода 30 долга.',
    gift: 'Две случайные карты из руки уходят игроку, которого вы выберете.',
    echo: 'Повторяет карту под собой: «Возьми» (можно продолжить стопку), пропуск, пропуск всех, разворот или наручники. На остальных ничего не делает.',
    freeze: 'Двое следующих пропускают ход.',
    bomb: 'Следующий берёт 3. Его соседи с обеих сторон берут по 1. Сосед может оказаться вами.',
    d6: 'Вся рука уходит. Взамен столько же новых случайных карт.',
    pill: 'Сотрите слой: долг −10, долг +10, взять 2, скинуть 2 или 10¢.',
    maze: 'Следующие 6 ходов направление может смениться после любой карты.',
    deal: 'Половина руки сгорает. Демон берёт вас на заметку: +15% к его заряду.',
    swind: 'Разовая, от ангела. Половина остальной руки (с округлением вверх) становится джокерами.',
    djoker: 'За падение, один на матч. Джокер любого цвета днём и ночью, годится в комбинации и мультисброс. Сыгран: всем по 3 случайные карты в цепях на 2 хода (если он последний, цепей нет). Переходит из раздачи в раздачу, не сгорает и не передаётся, в долг идёт 35.',
    sacr: 'Разовая, за падение. Выбранный игрок берёт 10 карт в цепях на 2 его хода. Защиты нет.',
    lead: 'Плохая карта. Кладётся на что угодно в ваш ход, кроме стопки. Цвет не меняется, а вы берёте 2. Осталась в руке: долг 30. Отдайте её в начале раздачи.',
    leech: 'Плохая карта. Сыграть можно только последней. Пока она у вас, каждый ваш ход начинается с +1. После трёх раз отстаёт сама. Осталась в руке: долг 25.',
    fuse: 'Плохая карта. Сыграть нельзя. Через три ваших хода взрывается в руке: +4, и её больше нет. Отдадите — горит дальше у другого. Осталась в руке: долг 25.'
  }
};
const cardDesc = f => { const D = CARD_DESC[LANG] || CARD_DESC.en; if (!f) return ''; if (D[f.v]) return D[f.v] + (/^\d$/.test(f.v) ? ' ' + D.num : ''); return /^\d$/.test(f.v) ? D.num : ''; };

// ---------- the log: the server sends a key and arguments, each screen words it in its own language ----------
function fmtLog(l) {
  const a = l.a || {}, C = c => colorName(c), N = n => n;
  const itemName = id => (STR[LANG]['item_' + id] || id);
  const L = LANG === 'ru' ? {
    first: () => `Первая карта: ${cardName(a.f)}. Начинает ${N(a.n)}.`,
    play: () => `${N(a.n)} кладёт ${(a.cards || []).map(cardName).join(', ')}${a.c ? ' → ' + C(a.c) : ''}${a.d ? `, и ещё ${a.d} ${cardsAcc(a.d)} уходят из руки` : ''}.`,
    win: () => `${N(a.n)} скидывает последнюю карту и выигрывает.`,
    again: () => `${N(a.n)} ходит ещё раз.`,
    pass: () => `${N(a.n)} пасует.`,
    drawOne: () => `${N(a.n)} берёт карту.`,
    takes: () => `${N(a.n)} забирает стопку +${a.k}.`,
    pickedUp: () => `${N(a.n)} забрал(а) все ${a.k} ${cardsAcc(a.k)}. Теперь в руке ${a.h}.`,
    drewUntil: () => `${N(a.n)} вытянул(а) ${a.k} ${cardsAcc(a.k)}, пока не пришёл «${C(a.c)}».`,
    drawRun: () => `${N(a.n)} вытянул(а) ${a.k} ${cardsAcc(a.k)}, пока не пришёл «${C(a.c)}».`,
    stack: () => `Стопка уже +${a.k}. ${N(a.n)} добавляет или забирает.`,
    stackGone: () => `Стопка +${a.k} для ${N(a.n)} ушла в сброс.`,
    wdc: () => `${N(a.n)} тянет, пока не придёт «${C(a.c)}».`,
    roulette: () => `${N(a.n)} называет «${C(a.c)}» и тянет до него.`,
    flip: () => `Смена. ${a.dk ? 'Ночь' : 'День'}. Сверху ${cardName(a.f)}${a.c ? ' → ' + C(a.c) : ''}.`,
    flipsCancel: () => `${a.k} смены гасят друг друга. На столе по-прежнему ${a.dk ? 'ночь' : 'день'}.`,
    dflip: () => `Затмение. Всё вернётся после хода ${N(a.n)}.`,
    dflipOff: () => `Затмение прошло. Снова ${a.dk ? 'ночь' : 'день'}: ${cardName(a.f)}${a.c ? ' → ' + C(a.c) : ''}.`,
    mirror: () => `${N(a.n)} отбивает стопку +${a.k}. Её получает ${N(a.t)}.`,
    mirrorAny: () => `Зеркало ${N(a.n)} возвращает ${cardName(a.f)}. Получает ${N(a.t)}.`,
    shieldUp: () => `${N(a.n)} надевает бронежилет.`,
    shieldBreak: () => `Бронежилет ${N(a.n)} держит стопку +${a.k}.`,
    mult: () => `${N(a.n)} умножает стопку: +${a.a} ×${a.x} = +${a.b}.`,
    multArm: () => `${N(a.n)} заряжает ×${a.x}. Следующая «Возьми» умножится.`,
    combo: () => `${N(a.n)}: ${STR.ru['combo_' + a.h] || a.h}, ${a.c} × ${a.x}.${a.d ? ` Ещё ${a.d} ${cardsAcc(a.d)} из руки.` : ''}${a.s ? ` ${N(a.s)} берёт ${a.sd}.` : ''}${a.m ? ` Остальные берут по ${a.m}.` : ''}`,
    gambleWin: () => `${N(a.n)} целится в ${N(a.t)}. Щелчок. Стопка +${a.k} уходит к ${N(a.t)}.`,
    gambleLose: () => `${N(a.n)} целится в ${N(a.t)}. Выстрел. ${N(a.n)} берёт стопку сам: +${a.k}.`,
    lucky2: () => `Подкова ${N(a.n)}: ${[a.w ? `долг −${a.w}` : '', a.h ? `${a.h} ${cardsAcc(a.h)} из руки` : ''].filter(Boolean).join(', ') || 'пусто'}.`,
    glass: () => a.a ? `Рюмка ${N(a.n)} летит в ${N(a.t)}: +${a.a}${a.b ? `. Осколок достаётся и ${N(a.n)}: +${a.b}` : ''}.` : `Рюмка бьётся в руке у ${N(a.n)}: +${a.b}.`,
    spin: () => `${N(a.n)} дёргает рычаг.`,
    loan2: () => `${N(a.n)} берёт займ: ${a.c}¢ сейчас, ${a.d} долга через три хода.`,
    loanDue2: () => `Займ ${N(a.n)}: время платить. Долг +${a.d}.`,
    gift: () => `${N(a.n)} оставляет ${N(a.t)} чаевые: ${a.g} ${cardsAcc(a.g)}.`,
    echo: () => `Бис. ${N(a.n)} повторяет ${cardName(a.f)}.`,
    echoNone: () => `Бис у ${N(a.n)} не вышел: повторять нечего.`,
    freeze: () => `${N(a.n)} надевает наручники. Пропускают ход: ${a.k}.`,
    bomb: () => `Обрез ${N(a.n)}: ${N(a.t)} +${a.a}, ${(a.l || []).map(N).join(' и ')} +${a.b}.`,
    d6: () => `Пересдача: у ${N(a.n)} новая рука из ${a.k} ${cardsAcc(a.k)}.`,
    pill2: () => `${N(a.n)} стирает лотерейку: ${({ wipe: 'долг −10', fine: 'долг +10', draw: 'взять 2', toss: 'скинуть 2', chips: '10¢' })[a.p] || a.p}.`,
    maze: () => `${N(a.n)} раскручивает вертушку. ${a.k} ходов направление может смениться.`,
    mazeTwist: () => 'Вертушка дёрнулась. Направление сменилось.',
    deal2: () => `${N(a.n)} подписывает контракт. Сгорает ${a.g} ${cardsAcc(a.g)}. Демон это запомнил.`,
    potato: () => `Динамит рвётся у ${N(a.n)}: +3.`,
    potatoLit: () => 'Под столом поджигают новый фитиль.',
    lead: () => `Свинец тянет ${N(a.n)} вниз: +${a.k}.`,
    leech: () => a.full ? `Пиявка в последний раз присосалась к ${N(a.n)} (+1) и отстала.` : `Пиявка сосёт ${N(a.n)}: +1.`,
    fuse: () => `Фитиль догорел в руке у ${N(a.n)}: +${a.k}.`,
    chaos: () => `Слоты: ${(STR.ru.ev[a.e] || [a.e])[0]}${(a.w || []).length ? ' (' + a.w.join(', ') + ')' : ''}. ${(STR.ru.ev[a.e] || ['', ''])[1]}.`,
    lastCall: () => `Последний звонок. Дом закрывает стол. Меньше всех карт у ${N(a.n)} (${a.k}), победа.`,
    lastLeft: () => `${N(a.n)} остаётся один и выигрывает.`,
    left: () => `${N(a.n)} ${a.aw ? 'слишком долго не возвращался и выбывает' : 'уходит из матча'}. Остальные играют дальше.`,
    awayColor: () => `${N(a.n)} отошёл. Цвет выбран наугад.`, awayStack: () => `${N(a.n)} отошёл. Стопку забрали за него.`, awaySkip: () => `${N(a.n)} отошёл. Ход пропущен.`,
    draftDone: () => 'Все передали по две карты. Раздача началась.',
    colGive: () => `Коллектор ${N(a.n)} подкидывает ${N(a.t)} две карты.`, colLever: () => `Коллектор ${N(a.n)} дёргает рычаг.`,
    pad: () => `Подкладка ${N(a.n)} забирает половину: +${a.k}.`,
    broke: () => `${N(a.n)} за лимитом (${a.d}/${a.l}). Место переходит Дому.`,
    angelCome: () => `К ${N(a.n)} приходит ангел.`, demonCome: () => `К ${N(a.n)} приходит демон.`, demonNo: () => `${N(a.n)} рвёт контракт демона.`,
    dealTaken: () => `${N(a.n)} берёт ${a.kind === 'dark' ? 'тёмную' : 'светлую'} сделку: ${STR.ru['deal_' + a.d] || a.d}${a.t ? ` (Метка на ${N(a.t)})` : ''}.`,
    fall: () => `${N(a.n)} падает: светлые сделки сгорели (${a.k || 0}). В руке демонический джокер.`,
    veilBurn: () => `Пылающий покров ${N(a.n)}: ${a.k} из стопки уходит ${N(a.t)}.`, puppetTake: () => `${N(a.n)} на нитках и забирает стопку +${a.k}.`,
    djoker: () => `${N(a.n)} играет демонического джокера: цепи на всех руках.`, crossEnd: () => 'Перевёрнутый крест догорел. Ангел снова слышит.',
    swind: () => `${N(a.n)} возносится: ${a.k} ${cardsW(a.k)} становятся джокерами.`,
    sacr: () => `${N(a.n)} приносит жертву: ${N(a.t)} берёт 10 карт в цепях.`,
    guardian: () => `Хранитель ${N(a.n)} отбивает удар: ${N(a.t)} берёт ${a.k}.`, halo: () => `Нимб ${N(a.n)} забирает половину: +${a.k}.`,
    confess: () => `Искупление ${N(a.n)}: ${a.k} ${cardsAcc(a.k)} отпущены.`,
    puppet: () => `${N(a.n)} дёргает за нитки: ${N(a.t)} пропустит ход.`, puppetSkip: () => `${N(a.n)} пляшет на нитках и пропускает ход.`,
    burn: () => `${N(a.n)} сжигает верхнюю карту колоды.`,
    horse: () => `Въезжает всадник: ${STR.ru['horse_' + a.k] || a.k}. ${STR.ru['horseD_' + a.k + '_' + a.v] || ''}`, horseEnd: () => 'Всадник уехал. Стол как был.',
    tithe: () => `Голод: ${N(a.n)} отдаёт две карты ${N(a.t)}.`, arms: () => `Война вооружает ${N(a.n)}: карта стала атакой.`,
    rot: () => `Чума: у ${N(a.n)} сгнило ${a.k} ${cardsW(a.k)}, пришли другие.`, warTime: () => `Война: ${N(a.n)} не успел(а). +3 карты.`,
    item: () => `${N(a.n)}: ${itemName(a.it)}.`,
    oven: () => `Печь сжигает ${a.k} ${cardsAcc(a.k)} из руки ${N(a.n)}.`,
    eclipse: () => `${N(a.n)} дёргает рубильник. Теперь ${a.dk ? 'ночь' : 'день'}.`,
    twoface: () => `${N(a.n)} ведёт двойную игру: оба гостя выкладывают бумаги.`,
    ward: () => `Оберег ${N(a.n)} держит всадника на расстоянии.`,
  } : {
    first: () => `First card: ${cardName(a.f)}. ${N(a.n)} starts.`,
    play: () => `${N(a.n)} plays ${(a.cards || []).map(cardName).join(', ')}${a.c ? ' → ' + C(a.c) : ''}${a.d ? `, and ${a.d} more ${cardsAcc(a.d)} leave the hand` : ''}.`,
    win: () => `${N(a.n)} drops the last card and wins.`,
    again: () => `${N(a.n)} goes again.`,
    pass: () => `${N(a.n)} passes.`,
    drawOne: () => `${N(a.n)} draws.`,
    takes: () => `${N(a.n)} takes the +${a.k}.`,
    pickedUp: () => `${N(a.n)} picked up all ${a.k}. Holding ${a.h} now.`,
    drewUntil: () => `${N(a.n)} drew ${a.k} ${cardsW(a.k)} before ${C(a.c)} came.`,
    drawRun: () => `${N(a.n)} drew ${a.k} ${cardsW(a.k)} before ${C(a.c)} came.`,
    stack: () => `The stack is +${a.k}. ${N(a.n)} adds to it or takes it.`,
    stackGone: () => `The +${a.k} meant for ${N(a.n)} goes in the bin.`,
    wdc: () => `${N(a.n)} draws till ${C(a.c)} comes.`,
    roulette: () => `${N(a.n)} calls ${C(a.c)} and draws till it comes.`,
    flip: () => `Shift. ${a.dk ? 'Night' : 'Day'}. On top: ${cardName(a.f)}${a.c ? ' → ' + C(a.c) : ''}.`,
    flipsCancel: () => `${a.k} shifts cancel out. Still ${a.dk ? 'night' : 'day'}.`,
    dflip: () => `Eclipse. It turns back after ${N(a.n)}'s turn.`,
    dflipOff: () => `The eclipse is over. ${a.dk ? 'Night' : 'Day'} again: ${cardName(a.f)}${a.c ? ' → ' + C(a.c) : ''}.`,
    mirror: () => `${N(a.n)} throws the +${a.k} back. ${N(a.t)} gets it.`,
    mirrorAny: () => `${N(a.n)}'s mirror throws back ${cardName(a.f)}. ${N(a.t)} gets it.`,
    shieldUp: () => `${N(a.n)} puts on a vest.`,
    shieldBreak: () => `${N(a.n)}'s vest stops the +${a.k}.`,
    mult: () => `${N(a.n)} multiplies the stack: +${a.a} ×${a.x} = +${a.b}.`,
    multArm: () => `${N(a.n)} loads ×${a.x}. The next draw card gets multiplied.`,
    combo: () => `${N(a.n)}: ${STR.en['combo_' + a.h] || a.h}, ${a.c} × ${a.x}.${a.d ? ` ${a.d} more ${cardsAcc(a.d)} gone.` : ''}${a.s ? ` ${N(a.s)} picks up ${a.sd}.` : ''}${a.m ? ` Everyone else picks up ${a.m}.` : ''}`,
    gambleWin: () => `${N(a.n)} aims at ${N(a.t)}. Click. The +${a.k} goes to ${N(a.t)}.`,
    gambleLose: () => `${N(a.n)} aims at ${N(a.t)}. Bang. ${N(a.n)} takes it: +${a.k}.`,
    lucky2: () => `${N(a.n)}'s horseshoe: ${[a.w ? `debt −${a.w}` : '', a.h ? `${a.h} ${cardsAcc(a.h)} gone` : ''].filter(Boolean).join(', ') || 'nothing'}.`,
    glass: () => a.a ? `${N(a.n)}'s shot glass hits ${N(a.t)}: +${a.a}${a.b ? `. A shard comes back: ${N(a.n)} +${a.b}` : ''}.` : `The shot glass breaks in ${N(a.n)}'s hand: +${a.b}.`,
    spin: () => `${N(a.n)} pulls the lever.`,
    loan2: () => `${N(a.n)} takes a loan: ${a.c}¢ now, ${a.d} debt in three plays.`,
    loanDue2: () => `${N(a.n)}'s loan is due. Debt +${a.d}.`,
    gift: () => `${N(a.n)} tips ${N(a.t)} ${a.g} ${cardsAcc(a.g)}.`,
    echo: () => `Encore. ${N(a.n)} repeats ${cardName(a.f)}.`,
    echoNone: () => `${N(a.n)}'s encore has nothing to repeat.`,
    freeze: () => `${N(a.n)} hands out cuffs. ${a.k} players miss a turn.`,
    bomb: () => `${N(a.n)}'s shotgun: ${N(a.t)} +${a.a}, ${(a.l || []).map(N).join(' and ')} +${a.b}.`,
    d6: () => `Redeal: ${N(a.n)} gets ${a.k} new ${cardsAcc(a.k)}.`,
    pill2: () => `${N(a.n)} scratches a ticket: ${({ wipe: 'debt −10', fine: 'debt +10', draw: 'pick up 2', toss: 'drop 2', chips: '10¢' })[a.p] || a.p}.`,
    maze: () => `${N(a.n)} spins the Spinner. For ${a.k} plays the direction may flip.`,
    mazeTwist: () => 'The Spinner kicks. Direction flips.',
    deal2: () => `${N(a.n)} signs a contract. ${a.g} ${cardsAcc(a.g)} burn. The demon takes note.`,
    potato: () => `The dynamite goes off on ${N(a.n)}: +3.`,
    potatoLit: () => 'Someone lights a new fuse under the table.',
    lead: () => `The lead drags ${N(a.n)} down: +${a.k}.`,
    leech: () => a.full ? `The leech takes one last drink from ${N(a.n)} (+1) and lets go.` : `The leech drinks from ${N(a.n)}: +1.`,
    fuse: () => `The fuse burns down in ${N(a.n)}'s hand: +${a.k}.`,
    chaos: () => `Slots: ${(STR.en.ev[a.e] || [a.e])[0]}${(a.w || []).length ? ' (' + a.w.join(', ') + ')' : ''}. ${(STR.en.ev[a.e] || ['', ''])[1]}.`,
    lastCall: () => `Last call. The House closes the table. ${N(a.n)} holds the fewest (${a.k}) and wins.`,
    lastLeft: () => `${N(a.n)} is the last one standing and wins.`,
    left: () => `${N(a.n)} ${a.aw ? 'was gone too long and is out' : 'leaves the match'}. The rest play on.`,
    awayColor: () => `${N(a.n)} is away. The colour is picked at random.`, awayStack: () => `${N(a.n)} is away. The stack is taken for them.`, awaySkip: () => `${N(a.n)} is away. Turn skipped.`,
    draftDone: () => 'Everyone passed two cards. The deal is on.',
    colGive: () => `Collector ${N(a.n)} slips ${N(a.t)} two cards.`, colLever: () => `Collector ${N(a.n)} pulls the lever.`,
    pad: () => `${N(a.n)}'s padding takes half: +${a.k}.`,
    broke: () => `${N(a.n)} is over the limit (${a.d}/${a.l}). The House takes the seat.`,
    angelCome: () => `The angel comes to ${N(a.n)}.`, demonCome: () => `The demon comes to ${N(a.n)}.`, demonNo: () => `${N(a.n)} tears up the demon's contract.`,
    dealTaken: () => `${N(a.n)} takes a ${a.kind === 'dark' ? 'dark' : 'light'} deal: ${STR.en['deal_' + a.d] || a.d}${a.t ? ` (Mark on ${N(a.t)})` : ''}.`,
    fall: () => `${N(a.n)} falls: the light deals burn (${a.k || 0}). A demonic joker is left in the hand.`,
    veilBurn: () => `${N(a.n)}'s burning veil throws ${a.k} of the stack on ${N(a.t)}.`, puppetTake: () => `${N(a.n)} is on strings and takes the +${a.k} stack.`,
    djoker: () => `${N(a.n)} plays the demonic joker: chains on every hand.`, crossEnd: () => 'The inverted cross burns out. The angel can hear again.',
    swind: () => `${N(a.n)} ascends: ${a.k} ${cardsW(a.k)} turn into jokers.`,
    sacr: () => `${N(a.n)} makes a sacrifice: ${N(a.t)} takes 10 chained cards.`,
    guardian: () => `${N(a.n)}'s guardian sends it back: ${N(a.t)} takes ${a.k}.`, halo: () => `${N(a.n)}'s halo takes half: +${a.k}.`,
    confess: () => `${N(a.n)} is redeemed: ${a.k} ${cardsAcc(a.k)} let go.`,
    puppet: () => `${N(a.n)} pulls the strings: ${N(a.t)} will miss a turn.`, puppetSkip: () => `${N(a.n)} dances on strings and misses the turn.`,
    burn: () => `${N(a.n)} burns the top card of the deck.`,
    horse: () => `A horseman rides in: ${STR.en['horse_' + a.k] || a.k}. ${STR.en['horseD_' + a.k + '_' + a.v] || ''}`, horseEnd: () => 'The horseman is gone. The table is back to normal.',
    tithe: () => `Famine: ${N(a.n)} hands two cards to ${N(a.t)}.`, arms: () => `War arms ${N(a.n)}: a card turns into an attack.`,
    rot: () => `Plague: ${a.k} of ${N(a.n)}'s cards rot and get replaced.`, warTime: () => `War: ${N(a.n)} was too slow. +3 cards.`,
    item: () => `${N(a.n)}: ${itemName(a.it)}.`,
    oven: () => `The oven burns ${a.k} of ${N(a.n)}'s cards.`,
    eclipse: () => `${N(a.n)} throws the breaker. It's ${a.dk ? 'night' : 'day'} now.`,
    twoface: () => `${N(a.n)} plays both sides: both visitors lay out their papers.`,
    ward: () => `${N(a.n)}'s ward keeps the horseman off.`,
  };
  try { if (l.k && L[l.k]) return L[l.k](); } catch (e) {}
  return l.msg;
}

// ---------- how to play ----------
const RULES_HTML = {};
RULES_HTML.en = `<p class="rulestag">The House deals one endless deck. Every card has two faces: day and night. Days are played on the casino floor, nights in the back room.</p>
  <h3>Basics</h3><ul>
    <li>Put down a card of the same colour or the same symbol, or a wild. Empty your hand to win.</li>
    <li>Click a card or drag it to the pile. Drag cards sideways to reorder your hand. Hover a card (long-press on a phone) to read it. To draw, click the deck (or press <b>D</b> or <b>Space</b>). If the card you drew fits but you'd rather keep it, click the deck again to pass. A card that doesn't fit passes by itself.</li>
    <li>The host picks the rules and the House cards in the lobby.</li></ul>
  <h3>Day and night</h3><ul>
    <li><b>Shift</b> turns every card over. Day becomes night and the table rules change.</li>
    <li><b>Day, the floor</b>: the slots run, poker hands pay <i>you</i>, the revolver needs a stack of +8.</li>
    <li><b>Night, the back room</b>: no slots, poker hands hit the next player, the revolver works from +4, dynamite under the table.</li>
    <li><b>Eclipse</b> switches day and night for one turn only.</li>
    <li>You see the other face of everyone else's cards and of the next card in the deck. Never your own.</li></ul>
  <h3>Drawing</h3><ul>
    <li>A stack you take and every penalty come in by themselves, one card at a time.</li>
    <li>Drawing till a colour comes (nothing to play, Colour Roulette, Draw Till Colour) is by hand, one click on the deck per card.</li>
    <li>While you owe cards, you can't play.</li></ul>
  <h3>Stacks</h3><ul>
    <li>Answer a draw card with one of the same value or higher: +1, +2, +4, +5, +6, +8, +10, +15. Can't? Click the deck and take the whole stack.</li>
    <li><b>Double Down</b> and <b>Triple Down</b> multiply the stack, up to +60. <b>Mirror</b> sends it back. <b>Vest</b> stops the next one that reaches you. <b>Encore</b> repeats the draw card under it.</li>
    <li><b>Russian roulette</b>: facing a big enough stack, press Roulette and pick a rival. Click (50%): they take the whole stack and play moves on. Bang: you take it doubled.</li></ul>
  <h3>Poker hands</h3><ul>
    <li><b>Picking cards</b>: right-click them (or Ctrl/Shift+click; on a phone press <b>Pick several</b> and tap). The name of the hand shows above your cards. Left-click any picked card, or drag it to the pile, to play them all. A left click on an unpicked card plays only that one.</li>
    <li>Hands are made of number cards. A <b>straight</b> is 4+ numbers in a row in any colours; at 6+ it hits everyone too. A <b>straight flush</b> is 3+ in a row of one colour; at 5+ it hits everyone and forgives more. A <b>full house</b> is a set and a pair, or two sets. <b>Four of a kind</b> is four of one number in any colours. A <b>flush</b> is 5+ cards of one colour. One plain <b>Wild</b> can stand in for any number. The first card has to fit the pile. The last one sets the colour.</li>
    <li>The panel under the log shows every hand and what it pays. <b>Drop</b> is how many extra cards go with it. <b>All</b> is what every rival picks up. <b>Debt</b> is what the House lets go.</li>
    <li>By day the extra cards leave your hand and debt is forgiven. At night the next player takes the extras and nothing is forgiven.</li></ul>
  <h3>House cards</h3><ul>
    <li><b>Luck</b>: Horseshoe (debt −15, or two cards out of your hand), Scratch Card (a random win or loss), Jackpot (pulls the slot lever), Redeal (a new hand).</li>
    <li><b>Money</b>: Loan (20¢ now, 30 debt three plays later), Tip (two cards to a player you pick), Contract (half your hand burns, the demon notices).</li>
    <li><b>Violence</b>: Shot Glass (+2 to the next player, or it breaks in your hand), Shotgun (+3 to the next player, +1 to their neighbours), Handcuffs (the next two miss a turn), Spinner (6 plays of random direction changes).</li></ul>
  <h3>Bad cards</h3><ul>
    <li>Rare, grey and hatched, no colour. They never go into poker hands or multi-drops. Pass them on at the start of a deal, or get rid of them with Tip, the Oven or a Redeal.</li>
    <li><b>Lead</b>: goes on anything on your turn, except a stack. The colour stays and you pick up 2. Left in hand: 30 debt.</li>
    <li><b>Leech</b>: only goes down as your last card. Each of your turns starts with +1. After 3 it lets go. Left in hand: 25 debt.</li>
    <li><b>Lit fuse</b>: can't be played. Three of your turns later it goes off in your hand (+4) and is gone. Pass it on and it keeps burning. Left in hand: 25 debt.</li></ul>
  <h3>Slots and dynamite</h3><ul>
    <li>By day the slot machine spins every 8 to 12 plays: Inflation, Shift change, Colour lock, Ante, Payout or U-turn.</li>
    <li>At night a hidden fuse burns down one play at a time. Whoever is up when it blows picks up 3. The table tells you when it is close.</li></ul>
  <h3>Debt match</h3><ul>
    <li>A match is a run of deals. Before each one you pass two cards to the player on one side and get two from the other.</li>
    <li>When someone empties their hand, everyone else <b>pays the House</b> for what they still hold: numbers at face value, action cards 12, big draws and Skip Everyone 20, wilds 25, wild draws and House cards 35, bad cards 25 to 30.</li>
    <li>Every turn costs too: at the start of your turn you pay <b>½ for every card past 10</b>, <b>4 at most</b>.</li>
    <li>Go over the <b>debt limit</b> (250, 500 or 1000, the host picks) and you work for the House as a <b>collector</b>. You can't win any more, but once a deal you can slip someone two cards or pull the slot lever.</li>
    <li>The last player under the limit beats the House.</li>
    <li><b>Chips</b>: the deal's winner gets 5¢ plus 10% of what the others paid. Poker hands pay chips too. Between deals, spend them in the <b>House shop</b>: tokens for the whole match (3 slots), paying off debt, or dirty tricks on a rival.</li></ul>
  <h3>The angel and the demon</h3><ul>
    <li><b>The angel</b> comes by day. Every quiet day turn (no attack played) adds <b>0.5%</b> to the chance it shows up at the start of your turn, up to <b>25.0%</b>. Any attack halves the chance and stalls it for 2 turns. Taking a stack of 5+ cards adds 1.0%. After an angel deal the chance grows half as fast for 2 deals. The angel offers 2 light deals and you have to take one.</li>
    <li><b>The demon</b> comes at night. A rival takes <b>5+ cards</b> from your attack: it charges 8.0% plus 2.0% for every card past 5. Every turn of the table to night +1.0%, every turn you start with 15+ cards +2.0%, and +3.0% for every 25% of your limit in debt. The charge is rolled at the start of your first night turn; an unused charge carries into the next deal at half. The demon offers 2 dark deals with a price. Sign one or tear both up.</li>
    <li>An <b>attack</b> is any card that makes someone else pick up. Attack multipliers add up instead of multiplying: ×2 and ×2 make ×3.</li>
    <li>You can hold up to <b>2 light</b> and <b>3 dark</b> deals, all different, for the whole match. <b>One deal per hand</b>. Once you sign a dark deal, the angel never comes to you again. A price like "+X% debt (at least N)" takes whichever is bigger.</li>
    <li><b>Desecration</b> takes no dark slot and is never offered to someone who took a light deal. Its price: the angel never comes again (free if you already hold a dark deal). It gives the <b>Inverted Cross</b>: any time, even on someone else's turn, every angel deal and angel chance is off for everyone for 15 table turns. One cross at a time.</li>
    <li><b>The fall</b>: sign a dark deal while holding light ones. They burn (each gives back 10 debt and 10¢; an unused Penance only 5 and 5¢), the angel never comes back, the demon +5.0% for good. Dark items stay.</li>
    <li>The fallen carry a <b>seal</b> every deal: <b>Fangs</b> (the first attack of the deal that lands hits twice as hard) and the <b>Burning Veil</b> (the first stack of the deal that reaches you splits, half goes to a random rival).</li>
    <li>The fall leaves a <b>demonic joker</b>, one a match: a joker of any colour, day and night, good in poker hands and multi-drops. Played, it chains 3 random cards in every hand for 2 turns (not if it's your last card). It stays with you between deals, can't be burned or passed on, and counts 35 in debt.</li>
    <li>Chained cards (never more than half a hand) can't be played or dropped, but you still pay debt on them.</li></ul>
  <h3>The Dark shop</h3><ul>
    <li>After every deal each player gets their own Dark shop with 3 random items. Buy as many as you can afford: 25¢ each, Rent 10¢, Two-Faced 40¢.</li>
    <li>Items wait in your inventory from deal to deal. Use one whenever you like, even on someone else's turn. It works till the end of the hand or at once, then it's gone. Two-Faced and Ward go off by themselves.</li>
    <li>Everyone can see your inventory and what you have running.</li></ul>
  <h3>The Horsemen</h3><ul>
    <li>The first time anyone's debt reaches <b>70% of their limit</b>, one of four horsemen rides in for <b>10 turns</b> (every player's turn counts). If the deal ends first, he stays for the next one.</li>
    <li>After that, every turn has a <b>5% chance</b> of another horseman, once the last one has gone.</li>
    <li><b>Death</b> curses everyone: Darkness, Fever, Mirror World or Static. <b>War</b>: 4 seconds a turn (+3 cards if you're late), or every attack +3, or two quiet cards a turn turning into attacks. <b>Famine</b>: one card a turn, or two cards a turn handed to the smallest hand. <b>Plague</b>: wilds and House cards do nothing, or 3 cards a turn rot and get replaced.</li></ul>
  <h3>Table rules</h3><ul>
    <li><b>Multi-drops</b>: every card with the same symbol goes down together.</li>
    <li><b>Last call</b>: after 150 turns the House closes the table and the fewest cards wins. The table counts down the last 10.</li></ul>
  <h3>Rooms</h3><ul>
    <li>Up to 6 players, no accounts. The host can add bots. The server runs the match, so everyone sees the same table.</li>
    <li>Lose your connection and you have 60 seconds to get back to your seat. Players who step away are skipped after 15 seconds.</li></ul>`;

RULES_HTML.ru = `<p class="rulestag">Дом сдаёт одну бесконечную колоду. У каждой карты два лица: дневное и ночное. Днём играют в зале казино, ночью в подсобке.</p>
  <h3>Основы</h3><ul>
    <li>Кладите карту того же цвета или того же символа, или джокера. Скинули все карты — выиграли.</li>
    <li>Нажмите на карту или перетащите её в сброс. Тащите карты вбок, чтобы переставить их в руке. Наведите на карту (на телефоне подержите палец), чтобы прочитать её. Чтобы взять карту, нажмите на колоду (или <b>D</b>, <b>пробел</b>). Если взятая карта подходит, но вы хотите её придержать, нажмите на колоду ещё раз: это пас. Неподходящая карта пасует сама.</li>
    <li>Правила и карты Дома выбирает хозяин в лобби.</li></ul>
  <h3>День и ночь</h3><ul>
    <li><b>Смена</b> переворачивает все карты. День становится ночью, и правила стола меняются.</li>
    <li><b>День, зал</b>: крутятся слоты, комбинации платят <i>вам</i>, рулетка доступна от стопки +8.</li>
    <li><b>Ночь, подсобка</b>: слотов нет, комбинации бьют следующего, рулетка от +4, под столом динамит.</li>
    <li><b>Затмение</b> меняет день и ночь только на один ход.</li>
    <li>Вы видите обратную сторону чужих карт и следующей карты колоды. Своих — никогда.</li></ul>
  <h3>Как брать карты</h3><ul>
    <li>Взятая стопка и любые штрафы приходят сами, по одной карте.</li>
    <li>Тянуть до цвета (ходить нечем, «Цветная рулетка», «Тяни до цвета») нужно руками: одно нажатие на колоду — одна карта.</li>
    <li>Пока вы должны карты, ходить нельзя.</li></ul>
  <h3>Стопки</h3><ul>
    <li>На «Возьми» отвечайте картой того же номинала или старше: +1, +2, +4, +5, +6, +8, +10, +15. Нечем — нажмите на колоду и забирайте всю стопку.</li>
    <li><b>Дабл</b> и <b>Трипл</b> умножают стопку, до +60. <b>Зеркало</b> отправляет её обратно. <b>Бронежилет</b> держит следующую стопку, дошедшую до вас. <b>Бис</b> повторяет «Возьми» под собой.</li>
    <li><b>Русская рулетка</b>: перед большой стопкой нажмите «Рулетка» и выберите соперника. Щелчок (50%): он забирает всю стопку, и ход идёт дальше. Выстрел: берёте её сами вдвое.</li></ul>
  <h3>Покерные комбинации</h3><ul>
    <li><b>Как выбрать карты</b>: правой кнопкой (или Ctrl/Shift+клик; на телефоне кнопка <b>Выбрать несколько</b> и нажатия). Над рукой появится название комбинации. Левый клик по любой выбранной карте или перетаскивание в сброс играет их все. Левый клик по невыбранной карте играет только её.</li>
    <li>Комбинации собираются из цифр. <b>Стрит</b> — от 4 цифр подряд любых цветов, от 6 он бьёт ещё и всех. <b>Стрит-флеш</b> — от 3 подряд одного цвета, от 5 карт он бьёт всех и списывает больше. <b>Фулл-хаус</b> — сет и пара или два сета. <b>Каре</b> — четыре одинаковые цифры любых цветов. <b>Флеш</b> — от 5 карт одного цвета. Один простой <b>джокер</b> может заменить любую цифру. Первая карта должна подходить к сбросу, последняя задаёт цвет.</li>
    <li>Под журналом есть таблица всех комбинаций и того, что они дают. <b>Сброс</b> — сколько лишних карт уходит вместе с ней. <b>Всем</b> — сколько берёт каждый соперник. <b>Долг</b> — сколько Дом списывает.</li>
    <li>Днём лишние карты уходят из руки и долг списывается. Ночью лишние берёт следующий, и ничего не списывается.</li></ul>
  <h3>Карты Дома</h3><ul>
    <li><b>Удача</b>: Подкова (долг −15 или две карты из руки), Лотерейка (случайный выигрыш или проигрыш), Джекпот (дёргает рычаг слотов), Пересдача (новая рука).</li>
    <li><b>Деньги</b>: Займ (20¢ сейчас, 30 долга через три хода), Чаевые (две карты выбранному игроку), Контракт (половина руки сгорает, демон берёт на заметку).</li>
    <li><b>Насилие</b>: Рюмка (следующему +2 или бьётся у вас в руке), Обрез (следующему +3, его соседям по 1), Наручники (двое следующих пропускают ход), Вертушка (6 ходов случайных разворотов).</li></ul>
  <h3>Плохие карты</h3><ul>
    <li>Редкие, серые, в штриховку, без цвета. В комбинации и мультисброс не идут. Отдайте их в начале раздачи или избавьтесь Чаевыми, Печью или Пересдачей.</li>
    <li><b>Свинец</b>: кладётся на что угодно в ваш ход, кроме стопки. Цвет не меняется, а вы берёте 2. Осталась в руке: долг 30.</li>
    <li><b>Пиявка</b>: сыграть можно только последней картой. Каждый ваш ход начинается с +1. После трёх раз отстаёт. Осталась в руке: долг 25.</li>
    <li><b>Фитиль</b>: сыграть нельзя. Через три ваших хода взрывается в руке (+4) и пропадает. Отдадите — горит дальше. Осталась в руке: долг 25.</li></ul>
  <h3>Слоты и динамит</h3><ul>
    <li>Днём слот-машина крутится каждые 8–12 ходов: Инфляция, Пересменка, Цвет на замке, Взнос, Выплата или Задний ход.</li>
    <li>Ночью невидимый фитиль горит по ходу за раз. На ком рванёт, тот берёт 3. Когда фитиль почти догорел, стол предупредит.</li></ul>
  <h3>Матч на долг</h3><ul>
    <li>Матч — это несколько раздач. Перед каждой вы передаёте две карты соседу с одной стороны и получаете две с другой.</li>
    <li>Когда кто-то скинул руку, остальные <b>платят Дому</b> за то, что осталось: цифры по номиналу, карты действия 12, большие «Возьми» и пропуск всех 20, джокеры 25, джокеры «Возьми» и карты Дома 35, плохие карты 25–30.</li>
    <li>Ходы тоже стоят денег: в начале своего хода вы платите <b>½ за каждую карту сверх 10</b>, но <b>не больше 4</b>.</li>
    <li>Вышли за <b>лимит долга</b> (250, 500 или 1000, выбирает хозяин) — работаете на Дом <b>коллектором</b>. Выиграть уже нельзя, но раз за раздачу можно подкинуть кому-нибудь две карты или дёрнуть рычаг слотов.</li>
    <li>Последний, кто остался под лимитом, обыгрывает Дом.</li>
    <li><b>Фишки</b>: победитель раздачи получает 5¢ и 10% от того, что заплатили остальные. Комбинации тоже платят фишками. Между раздачами их тратят в <b>лавке Дома</b>: жетоны на весь матч (3 места), погашение долга или пакости сопернику.</li></ul>
  <h3>Ангел и демон</h3><ul>
    <li><b>Ангел</b> приходит днём. Каждый тихий дневной ход (без атак) прибавляет <b>0,5%</b> к шансу, что он появится в начале вашего хода, но не выше <b>25,0%</b>. Любая атака делит шанс пополам и на 2 хода останавливает рост. Взяли стопку 5+ карт: +1,0%. После сделки с ангелом шанс 2 раздачи растёт вдвое медленнее. Ангел предлагает 2 светлые сделки, и одну нужно взять.</li>
    <li><b>Демон</b> приходит ночью. Соперник взял от вашей атаки <b>5+ карт</b>: заряд 8,0% и ещё 2,0% за каждую карту сверх 5. Каждая смена стола на ночь +1,0%, каждый ход с 15+ картами в руке +2,0%, и +3,0% за каждые 25% лимита в долге. Заряд проверяется в начале вашего первого ночного хода; неиспользованный переходит в следующую раздачу вдвое меньше. Демон предлагает 2 тёмные сделки с ценой. Подпишите одну или порвите обе.</li>
    <li><b>Атака</b> — любая карта, из-за которой кто-то другой берёт карты. Множители атак не перемножаются: ×2 и ×2 дают ×3.</li>
    <li>Можно держать до <b>2 светлых</b> и <b>3 тёмных</b> сделок, все разные, на весь матч. <b>Одна сделка за раздачу</b>. Подписали тёмную сделку — ангел к вам больше не придёт. Цена вида «+X% долга (мин. +N)» берёт большее из двух.</li>
    <li><b>Осквернение</b> не занимает слот тёмной сделки и не предлагается тому, кто брал светлую. Цена: ангел больше не придёт (бесплатно, если тёмная сделка уже есть). Даёт <b>Перевёрнутый крест</b>: в любой момент, даже в чужой ход, на 15 ходов стола у всех выключены ангельские сделки и шансы ангела. Одновременно горит только один крест.</li>
    <li><b>Падение</b>: подписали тёмную, держа светлые. Они сгорают (каждая возвращает 10 долга и 10¢, неиспользованное Покаяние только 5 и 5¢), ангел больше не придёт, демон +5,0% навсегда. Тёмные предметы остаются.</li>
    <li>У падших каждую раздачу есть <b>печать</b>: <b>Клыки</b> (первая атака за раздачу, которая дошла, вдвое сильнее) и <b>Пылающий покров</b> (первая стопка за раздачу, дошедшая до вас, делится: половина уходит случайному сопернику).</li>
    <li>После падения остаётся <b>демонический джокер</b>, один на матч: джокер любого цвета днём и ночью, годится в комбинации и мультисброс. Сыгран: на каждой руке 3 случайные карты в цепях на 2 хода (если он последний, цепей нет). Переходит из раздачи в раздачу, не сгорает и не передаётся, в долг идёт 35.</li>
    <li>Карты в цепях (не больше половины руки) нельзя сыграть или скинуть, но долг за них идёт.</li></ul>
  <h3>Тёмная лавка</h3><ul>
    <li>После каждой раздачи у каждого своя Тёмная лавка: 3 случайных предмета. Покупайте сколько хватит: 25¢ за штуку, Рента 10¢, Двуличие 40¢.</li>
    <li>Предметы лежат в инвентаре и переходят из раздачи в раздачу. Включайте когда угодно, хоть в чужой ход. Действует до конца раздачи или сразу, потом пропадает. Двуличие и Оберег срабатывают сами.</li>
    <li>Ваш инвентарь и включённые предметы видят все.</li></ul>
  <h3>Всадники</h3><ul>
    <li>Когда чей-то долг впервые доходит до <b>70% лимита</b>, въезжает один из четырёх всадников на <b>10 ходов</b> (считается ход любого игрока). Кончилась раздача раньше — он остаётся на следующую.</li>
    <li>Дальше каждый ход есть <b>шанс 5%</b>, что приедет ещё один, если прежний уже уехал.</li>
    <li><b>Смерть</b> проклинает всех: Мрак, Лихорадка, Зазеркалье или Помехи. <b>Война</b>: 4 секунды на ход (опоздали — +3 карты), или каждая атака +3, или каждый ход две тихие карты становятся атаками. <b>Голод</b>: одна карта за ход, или каждый ход две карты уходят самой маленькой руке. <b>Чума</b>: джокеры и карты Дома ничего не делают, или каждый ход 3 карты гниют и меняются.</li></ul>
  <h3>Правила стола</h3><ul>
    <li><b>Мультисброс</b>: все карты с одним символом ложатся вместе.</li>
    <li><b>Последний звонок</b>: через 150 ходов Дом закрывает стол, и выигрывает тот, у кого меньше карт. Последние 10 ходов стол отсчитывает.</li></ul>
  <h3>Комнаты</h3><ul>
    <li>До 6 игроков, без аккаунтов. Хозяин может посадить ботов. Матч ведёт сервер, поэтому стол у всех один.</li>
    <li>Если пропала связь, у вас 60 секунд, чтобы вернуться на место. Отошедших пропускают через 15 секунд.</li></ul>`;

// ===== ASSETS: an optional pack of card sprites, fonts, sounds and a background, loaded from /assets =====
// Anything missing falls back to the built-in look and synthesized sounds. See template/README.md.
const ASSETS = (() => {
  let cfg = {};
  const cards = new Set();
  const sounds = {};      // name -> [file]
  const buffers = {};     // file -> AudioBuffer | 'loading' | 'bad'
  const keyOf = (f, side) => `${side}-${f.c}-${f.v}`;
  const cls = k => 'spr-' + k.replace(/[^a-z0-9-]/gi, '_');
  function cardClass(f, side) { const k = keyOf(f, side); return cards.has(k) ? cls(k) : ''; }
  function css(text) { const s = document.createElement('style'); s.textContent = text; document.head.appendChild(s); }

  async function load() {
    let man;
    try {
      if (location.protocol === 'file:') return;
      const response = await fetch('assets/manifest.json', { cache: 'no-cache' });
      if (!response.ok) return;
      man = await response.json();
    } catch { return; }
    cfg = man.config || {};
    const rules = [];
    // cards: assets/cards/<side>-<color>-<value>.png, e.g. L-r-7.png, D-w-bhole.png
    for (const file of man.cards || []) {
      const k = file.replace(/\.[^.]+$/, '');
      if (!/^[LD]-[a-z]-[a-z0-9]+$/i.test(k)) continue;
      cards.add(k); rules.push(`.${cls(k)}{background-image:url("assets/cards/${encodeURIComponent(file)}")}`);
    }
    if (cards.size) rules.push(`.card.spr{background-color:transparent;background-position:center;background-size:100% 100%;background-repeat:no-repeat;border:0;border-radius:${cfg.cardRadius ?? 0}px;box-shadow:none${cfg.pixelated ? ';image-rendering:pixelated' : ''}}`,
      `.card.spr .oval,.card.spr .cor,.card.spr .suit,.card.spr::before,.card.spr::after{display:none}`);
    // fonts: assets/font/ui.* replaces all text, assets/font/display.* replaces titles, numbers, buttons and toasts
    const F = man.font || {};
    if (F.ui) rules.push(`@font-face{font-family:'PackUI';src:url("assets/font/${encodeURIComponent(F.ui)}");font-display:swap}`,
      `:root{--f-ui:'PackUI',system-ui,sans-serif;--f-type:'PackUI',ui-monospace,monospace;--f-chalk:'PackUI',system-ui,sans-serif}`);
    if (F.display || F.ui) rules.push(`@font-face{font-family:'PackDisplay';src:url("assets/font/${encodeURIComponent(F.display || F.ui)}");font-display:swap}`,
      `:root{--f-stamp:'PackDisplay',system-ui,sans-serif;--f-card:'PackDisplay',system-ui,sans-serif}`);
    if (cfg.pixelated && (F.ui || F.display)) rules.push(`*{-webkit-font-smoothing:none;font-synthesis:none}`);
    // background: assets/bg.png (or .jpg/.webp/.gif) replaces the animated swirl
    if (man.bg) rules.push(`#bg{display:none}html{background:#07070a url("assets/${encodeURIComponent(man.bg)}") center/cover fixed${cfg.pixelated ? ';image-rendering:pixelated' : ''}}`);
    if (cfg.crt === false) rules.push(`#crt,#grain{display:none}`);
    if (rules.length) css(rules.join('\n'));
    // sounds: assets/sounds/<name>.ogg; play-2.ogg, play-3.ogg ... are variants picked at random
    Object.assign(sounds, man.sounds || {});
    if (typeof G !== 'undefined' && G) render();
  }

  function decode(file) {
    if (buffers[file] || !SFX.ctx) return;
    buffers[file] = 'loading';
    fetch('assets/sounds/' + encodeURIComponent(file)).then(r => r.arrayBuffer()).then(b => SFX.ctx.decodeAudioData(b))
      .then(buf => { buffers[file] = buf; }).catch(() => { buffers[file] = 'bad'; });
  }
  // returns true when a pack sound handled it (the synth then stays quiet)
  function playSound(name, k = 1) {
    const files = sounds[name]; if (!files || !files.length || !SFX.ctx) return false;
    files.forEach(decode);
    const ready = files.filter(f => buffers[f] && typeof buffers[f] === 'object');
    if (!ready.length) return false; // still decoding: the synth covers this one
    const buf = buffers[ready[Math.floor(Math.random() * ready.length)]];
    const src = SFX.ctx.createBufferSource(), g = SFX.ctx.createGain();
    src.buffer = buf;
    // combos and bigger stacks ring higher, like the built-in sounds
    if (['play', 'stack', 'draw'].includes(name) && cfg.pitchCombos !== false) src.playbackRate.value = Math.pow(2, Math.min(k - 1, 12) / 24);
    g.gain.value = (cfg.volume ?? 1) * ((cfg.volumes || {})[name] ?? 1);
    src.connect(g); g.connect(SFX.out ? SFX.out.dry : SFX.ctx.destination); src.start();
    return true;
  }
  return { load, cardClass, playSound };
})();

// ===== JUICE: shader background, ash and embers, shake, lamp dropout, card tilt, chaos slot machine =====
const JUICE = (() => {
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const state = { side: 0, sideT: 0, heat: 0, heatT: 0, gl: null };
  const full = () => (S.fx || (reduce ? 'lite' : 'full')) === 'full';

  // ---- swirling background (WebGL, rendered at low resolution for a chunky look) ----
  function startBg() {
    const cv = document.getElementById('bg'); if (!cv) return;
    let gl; try { gl = cv.getContext('webgl', { antialias: false, alpha: false }); } catch (e) {}
    if (!gl) { cv.classList.add('nogl'); return; }
    const vs = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
    // The back room, seen from above: a worn felt table with a wooden rail under one hanging lamp,
    // darkness all around, slow smoke in the light. Day = a warm bulb, night = a red bulb. Big stacks make it flicker.
    // Two passes: the room itself (felt, rail, floor: lots of noise, never moves) is baked into a texture
    // whenever the layout changes; every frame only lights it, adds the smoke and dithers.
    const NOISE = `float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
      float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n(p);p=p*2.03+vec2(17.,9.);a*=.5;}return v;}`;
    const fsRoom = `precision mediump float;uniform vec2 r;uniform vec4 tb;${NOISE}
      void main(){
        vec2 px=gl_FragCoord.xy;
        vec2 c=tb.xy, rad=tb.zw;
        vec2 q=(px-c)/rad;
        float sq=pow(pow(abs(q.x),4.)+pow(abs(q.y),4.),.25);
        float felt=1.-smoothstep(.93,.95,sq);
        float rail=smoothstep(.93,.95,sq)*(1.-smoothstep(1.04,1.07,sq));
        vec2 fp=px/min(r.x,r.y)*7.;
        float nap=fbm(fp*6.)*.5+fbm(fp*1.3)*.5;
        float scuff=smoothstep(.55,.85,fbm(fp*.8+3.))*.35;
        float wear=smoothstep(.9,.0,length(q*vec2(.9,1.2)))*.18;
        vec3 feltC=vec3(.07,.19,.14)*(.7+.45*nap)-scuff*.06+wear*vec3(.07,.07,.04);
        feltC=mix(feltC,vec3(dot(feltC,vec3(.33))),.35);
        float grain=fbm(vec2(atan(q.y,q.x)*22.,sq*40.));
        vec3 woodC=vec3(.13,.075,.045)*(.6+.6*grain);
        vec3 floorC=vec3(.035,.03,.027)*(.7+.5*fbm(vec2(px.x/r.x*3.,px.y/r.y*40.)));
        vec3 col=mix(floorC,woodC,rail+felt);
        col=mix(col,feltC,felt);
        gl_FragColor=vec4(col*4.,1.);   // stored x4 so the dark tones keep their steps in 8 bits
      }`;
    const fs = `precision mediump float;uniform float t;uniform vec2 r;uniform float side;uniform float heat;uniform float beat;uniform sampler2D room;${NOISE}
      void main(){
        vec2 px=gl_FragCoord.xy;
        vec3 col=texture2D(room,px/r).rgb*.25;
        float sway=sin(t*.35)*.015;
        vec2 lp=vec2(.5+sway,.52)*r;
        float d=length((px-lp)/min(r.x,r.y));
        float buzz=step(.985,n(vec2(floor(t*6.),3.)));
        float fl=1.-heat*.22*step(.88,n(vec2(t*6.,1.)))-.025*n(vec2(t*2.,7.))-.22*buzz;
        float spread=mix(2.2,2.7,side);
        float lamp=exp(-d*d*spread)*mix(1.45,1.35,side)*fl*(1.+beat*.16)+mix(.07,.055,side);
        vec3 bulb=mix(vec3(1.,.88,.66),vec3(1.,.18,.14),side);
        col*=lamp*bulb*mix(1.9,2.4,side);
        float sm=fbm(px/min(r.x,r.y)*2.5+vec2(t*.03,-t*.05));
        col+=bulb*smoothstep(.45,.9,sm)*exp(-d*d*1.8)*(.06+beat*.05);
        col*=smoothstep(mix(1.6,1.45,side),mix(.1,.12,side),d);
        vec2 ip=floor(mod(gl_FragCoord.xy,4.));
        float bay=mod(ip.x*2.+ip.y*3.,4.)/4.;
        col=floor(col*48.+bay)/48.;
        gl_FragColor=vec4(col,1.);
      }`;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = src => { const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, src)); gl.linkProgram(pr); return gl.getProgramParameter(pr, gl.LINK_STATUS) ? pr : null; };
    const prRoom = prog(fsRoom), pr = prog(fs);
    if (!prRoom || !pr) { cv.classList.add('nogl'); return; }
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const bindQuad = p => { const loc = gl.getAttribLocation(p, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0); };
    const U = { t: gl.getUniformLocation(pr, 't'), r: gl.getUniformLocation(pr, 'r'), side: gl.getUniformLocation(pr, 'side'), heat: gl.getUniformLocation(pr, 'heat'), beat: gl.getUniformLocation(pr, 'beat'), room: gl.getUniformLocation(pr, 'room') };
    const UR = { r: gl.getUniformLocation(prRoom, 'r'), tb: gl.getUniformLocation(prRoom, 'tb') };
    // the baked room
    const tex = gl.createTexture(), fbo = gl.createFramebuffer();
    let roomKey = '';
    const K = 3;
    const bakeRoom = () => {
      const T = state.table || { x: innerWidth * 0.4, y: innerHeight * 0.5, w: innerWidth * 0.38, h: innerHeight * 0.42 };
      const key = [cv.width, cv.height, Math.round(T.x), Math.round(T.y), Math.round(T.w), Math.round(T.h)].join(',');
      if (key === roomKey) return; roomKey = key;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cv.width, cv.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.useProgram(prRoom); bindQuad(prRoom);
      gl.uniform2f(UR.r, cv.width, cv.height); gl.uniform4f(UR.tb, T.x / K, (innerHeight - T.y) / K, T.w / K, T.h / K);
      gl.viewport(0, 0, cv.width, cv.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.useProgram(pr); bindQuad(pr); gl.uniform1i(U.room, 0);
    };
    const size = () => { cv.width = Math.ceil(innerWidth / K); cv.height = Math.ceil(innerHeight / K); gl.viewport(0, 0, cv.width, cv.height); };
    size(); addEventListener('resize', size);
    gl.useProgram(pr); bindQuad(pr);
    state.gl = gl;
    const t0 = performance.now(); let last = 0;
    (function frame(now) {
      requestAnimationFrame(frame);
      if (!full() || document.hidden) return;
      if (now - last < 33) return; last = now; // ~30 fps is plenty for a background
      bakeRoom();
      state.side += (state.sideT - state.side) * 0.06;
      state.heat += (state.heatT - state.heat) * 0.05;
      if (typeof S === 'undefined' || S.bgMotion !== false) state.tAcc = (state.tAcc || 0) + Math.min(0.05, (now - (state.tLast || now)) / 1000); state.tLast = now;
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1f(U.t, 20 + (state.tAcc || 0)); gl.uniform2f(U.r, cv.width, cv.height);
      gl.uniform1f(U.side, state.side); gl.uniform1f(U.heat, Math.min(1, state.heat)); gl.uniform1f(U.beat, state.beat || 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    })(t0);
  }

  // ---- particles: no confetti in this room. Ash and dust drift down, a few embers rise and die. ----
  // Callers may still pass colours; only their brightness matters (bright = more embers).
  const ASH = ['#6d665c', '#8a8274', '#4e4942', '#a59c8b', '#3a3632'], EMBER = ['#c2531c', '#8e2a12', '#e07a2e'];
  let pc, px, parts = [], looping = false;
  function burst(x, y, n, colors, power = 1) {
    if (!full()) return;
    if (!pc) { pc = document.getElementById('fxc'); px = pc.getContext('2d'); const fit = () => { pc.width = innerWidth; pc.height = innerHeight; }; fit(); addEventListener('resize', fit); }
    if (!looping) { looping = true; requestAnimationFrame(loop); }
    n = Math.round(n * 0.6);
    const hot = Math.min(0.35, 0.08 + power * 0.08);
    for (let i = 0; i < n; i++) {
      const ember = Math.random() < hot, a = Math.random() * Math.PI * 2, s = (0.6 + Math.random() * 2.6) * Math.sqrt(power);
      parts.push(ember
        ? { x, y, vx: Math.cos(a) * s * 0.7, vy: -1 - Math.random() * 2.2 * power, g: -0.015, drag: 0.97, life: 50 + Math.random() * 50, c: EMBER[i % 3], sz: 1 + Math.random() * 2, ember: true, ph: Math.random() * 6 }
        : { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.2 * power, g: 0.045, drag: 0.94, life: 60 + Math.random() * 60, c: ASH[i % ASH.length], sz: 1 + Math.random() * 3, ph: Math.random() * 6 });
    }
  }
  // a few sparks off a smouldering number
  function sparks(el, k = 3) {
    if (!full() || !el || !el.isConnected) return;
    const r = el.getBoundingClientRect(); if (!r.width) return;
    burst(r.left + r.width * (0.2 + Math.random() * 0.6), r.top + r.height * 0.4, k * 2, null, 2.5);
  }
  function loop() {
    if (!parts.length) { looping = false; px.clearRect(0, 0, pc.width, pc.height); return; }
    requestAnimationFrame(loop);
    px.clearRect(0, 0, pc.width, pc.height);
    parts = parts.filter(p => p.life-- > 0);
    for (const p of parts) {
      p.ph += 0.08; p.vy += p.g; p.vx = p.vx * p.drag + Math.sin(p.ph) * 0.05; p.vy *= p.drag; p.x += p.vx; p.y += p.vy;
      px.globalAlpha = Math.min(p.ember ? 1 : 0.75, p.life / 30) * (p.ember ? 0.6 + 0.4 * Math.sin(p.ph * 3) : 1);
      px.fillStyle = p.c;
      px.fillRect(Math.round(p.x), Math.round(p.y), p.sz, p.ember ? p.sz : p.sz * 0.7);
    }
    px.globalAlpha = 1;
    if (!parts.length) px.clearRect(0, 0, pc.width, pc.height);
  }

  // ---- screen shake + chromatic glitch ----
  function shake(power = 1) {
    if (typeof S !== 'undefined' && S.shake === false) return;
    if (!full()) return;
    const g = document.getElementById('game'); if (!g) return;
    g.style.setProperty('--shk', Math.min(18, 4 + power * 3) + 'px');
    g.classList.remove('shake2'); void g.offsetWidth; g.classList.add('shake2');
    setTimeout(() => g.classList.remove('shake2'), 420);
  }
  // a glitch looks like old software falling over: the picture drops to a 16-colour palette and tears in bands,
  // and an error box gets stuck and smears across the screen like a dragged window on a frozen desktop
  let crash = null, crashT = 0;
  function errBox() {
    return '<div class="ewin"><div class="etitle"><i></i><b>×</b></div><div class="ebody"><span class="eicon">×</span><span class="elines"><i></i><i></i></span></div><div class="ebtn"></div></div>';
  }
  function glitch(force) {
    if (!force && !full()) return;
    const g = document.getElementById('game'); if (!g) return;
    if (!crash) {
      crash = document.createElement('div'); crash.id = 'crash'; document.body.appendChild(crash);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.style.position = 'absolute';
      svg.innerHTML = '<filter id="oldpal" color-interpolation-filters="sRGB"><feComponentTransfer><feFuncR type="discrete" tableValues="0 .5 .75 1"/><feFuncG type="discrete" tableValues="0 .5 .75 1"/><feFuncB type="discrete" tableValues="0 .5 1"/></feComponentTransfer></filter>';
      document.body.appendChild(svg);
    }
    // the trail: one box, stamped again and again along a drag path
    const n = 9, x0 = 15 + Math.random() * 40, y0 = 15 + Math.random() * 35, dx = (Math.random() < 0.5 ? -1 : 1) * (2.2 + Math.random() * 1.6), dy = 2 + Math.random() * 2.4;
    let html = ''; for (let i = 0; i < n; i++) html += `<div class="estamp" style="left:${(x0 + dx * i).toFixed(1)}%;top:${(y0 + dy * i).toFixed(1)}%;animation-delay:${i * 45}ms">${errBox()}</div>`;
    crash.innerHTML = html;
    g.classList.remove('glitch'); crash.classList.remove('on'); void g.offsetWidth; g.classList.add('glitch'); crash.classList.add('on');
    clearTimeout(crashT); crashT = setTimeout(() => { g.classList.remove('glitch'); crash.classList.remove('on'); crash.innerHTML = ''; }, 720);
  }

  // ---- card tilt toward the pointer (desktop) ----
  function tilt(el, e) {
    if (!full() || e.pointerType !== 'mouse') return;
    const r = el.getBoundingClientRect(), dx = (e.clientX - r.left) / r.width - 0.5, dy = (e.clientY - r.top) / r.height - 0.5;
    const ang = Math.min(16, Math.hypot(dx, dy) * 26).toFixed(1);
    // each card tilts around its own centre with its own perspective, so cards at the ends of a fan don't skew
    el.style.setProperty('--tilt', `translateY(-50%) perspective(520px) rotate3d(${(-dy).toFixed(3)}, ${dx.toFixed(3)}, 0, ${ang}deg) translateY(50%)`);
    el.style.setProperty('--gx', ((dx + 0.5) * 100).toFixed(0) + '%');
    el.style.setProperty('--gy', ((dy + 0.5) * 100).toFixed(0) + '%');
    el.style.setProperty('--sheen', '.22');
  }
  function untilt(el) { el.style.removeProperty('--tilt'); el.style.removeProperty('--sheen'); }

  // ---- chaos slot machine ----
  const GLYPH = { inflation: '×2', tax: 'TAX', revolution: 'REV', storm: 'D/N', lock: 'LOCK', bleed: '−1', jackpot: '$$$', mirrorworld: 'MIR' };
  let slotBusy = null;
  function slot(ev) {
    const el = document.getElementById('slot'); if (!el) return;
    const keys = Object.keys(GLYPH), [title, sub] = (STR[LANG].ev[ev] || STR.en.ev[ev] || [ev, '']);
    el.innerHTML = `<div class="slotbox"><div class="slottitle">${esc(t('chaosTitle'))}</div><div class="reels"><b></b><b></b><b></b></div><div class="slotres"><span class="slotname">${esc(title)}</span><span class="slotsub">${esc(sub)}</span></div></div>`;
    el.classList.remove('hidden', 'done'); void el.offsetWidth; el.classList.add('show');
    const reels = [...el.querySelectorAll('.reels b')];
    const spinMs = full() ? [700, 950, 1200] : [150, 200, 250];
    const t0 = performance.now();
    let nextTick = 0;
    clearTimeout(slotBusy);
    const tickR = () => {
      const now = performance.now() - t0; let spinning = false;
      reels.forEach((r, k) => {
        if (now < spinMs[k]) { spinning = true; r.textContent = GLYPH[keys[Math.floor(Math.random() * keys.length)]]; r.classList.add('spin'); }
        else if (r.classList.contains('spin')) { r.classList.remove('spin'); r.textContent = GLYPH[ev] || '?'; r.classList.add('stop'); SFX.play('reel', k + 1); }
      });
      if (spinning) {
        if (now >= nextTick) {
          SFX.play('slotRatchet');
          nextTick = now + 44 + 36 * now / spinMs[2];
        }
        requestAnimationFrame(tickR);
      }
      else { el.classList.add('done'); SFX.play('slotLatch'); shake(3); burst(innerWidth / 2, innerHeight / 2, 40, null, 1); slotBusy = setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.classList.add('hidden'), 220); }, 1700); }
    };
    requestAnimationFrame(tickR);
  }

  // ---- the room listens to the music: the bulb, the smoke and the chalk pulse on the beat ----
  // Onsets come from spectral flux (how much the low and mid spectrum jumped since last frame) against an
  // adaptive threshold. The gaps between onsets vote for a tempo; a phase-locked clock then predicts each
  // beat, so the room hits on the beat instead of a few frames after it, shifted by the audio output latency.
  // Works when the music is a file the page can hear (assets/sounds/music.*). A YouTube embed can't be listened to.
  const TEMPO = { bpm: 0, period: 0, next: 0, conf: 0 };
  (function listen() {
    let env = 0, prev = null, flux = [], lastOn = 0, lastKick = 0, idle = true, curBin = 0, lastTempo = 0;
    const env10 = new Float32Array(600);
    const root = document.documentElement;
    function kick() {
      env = 1; lastKick = performance.now();
      document.body.classList.remove('kick'); void document.body.offsetWidth; document.body.classList.add('kick');
    }
    (function tick(now) {
      requestAnimationFrame(tick);
      const lv = music?.level();
      if (!lv || !full() || S.musicFx === false) { if (!idle) { idle = true; env = 0; state.beat = 0; root.style.setProperty('--beat', '0'); } return; }
      idle = false;
      const sp = lv.spec, n = sp.length, lo = Math.max(1, Math.round(35 / lv.hz)), hi = Math.min(n - 1, Math.round(2500 / lv.hz));
      // spectral flux, low end counted double
      let f = 0;
      if (prev) for (let i = lo; i <= hi; i++) { const d = sp[i] - prev[i]; if (d > 0) f += d * (i * lv.hz < 200 ? 2 : 1); }
      prev = prev || new Uint8Array(n); prev.set(sp);
      flux.push(f); if (flux.length > 50) flux.shift();
      const mean = flux.reduce((a, b) => a + b, 0) / flux.length, sd = Math.sqrt(flux.reduce((a, b) => a + (b - mean) * (b - mean), 0) / flux.length);
      // onset-strength envelope in 10 ms bins over the last 6 s; its autocorrelation gives the tempo
      const bin = Math.floor(now / 10);
      if (bin !== curBin) { for (let k = curBin + 1; k <= bin && k - curBin < 600; k++) env10[k % 600] = 0; curBin = bin; }
      env10[bin % 600] = Math.max(env10[bin % 600], Math.max(0, f - mean));
      if (now - lastTempo > 500) {
        lastTempo = now;
        const seq = new Float32Array(600); for (let k = 0; k < 600; k++) seq[k] = env10[(bin - 599 + k + 6000) % 600];
        let best = 0, bestL = 0, sum = 0, cnt = 0;
        for (let L = 33; L <= 100; L++) {
          let ac = 0; for (let k = L; k < 600; k++) ac += seq[k] * seq[k - L];
          ac /= (600 - L);
          const bpm = 6000 / L, w = Math.exp(-Math.pow(Math.log2(bpm / 115), 2) * 1.5); // gently prefer 80–160
          const sc = ac * w; sum += sc; cnt++;
          if (sc > best) { best = sc; bestL = L; }
        }
        const conf = cnt && sum ? best / (sum / cnt) : 0;
        if (bestL && conf > 1.6) {
          const bpm = 6000 / bestL;
          TEMPO.bpm = TEMPO.bpm && Math.abs(TEMPO.bpm - bpm) < 4 ? TEMPO.bpm * 0.7 + bpm * 0.3 : bpm;
          TEMPO.period = 60000 / TEMPO.bpm; TEMPO.conf = Math.min(1, (conf - 1.6) / 1.5 + 0.6);
        } else TEMPO.conf *= 0.8;
      }
      if (f > mean + 1.4 * sd && f > 40 && now - lastOn > 140) {
        lastOn = now;
        // phase lock: pull the predicted beat toward this onset when they're close
        if (TEMPO.period && TEMPO.conf > 0.6) {
          if (!TEMPO.next) TEMPO.next = now + TEMPO.period;
          let err = now - (TEMPO.next - TEMPO.period);
          if (err > TEMPO.period / 2) err -= TEMPO.period;
          if (Math.abs(err) < TEMPO.period * 0.2) TEMPO.next += err * 0.4;
        } else kick(); // no tempo yet: react to the onset itself
      }
      // fire on the predicted beat, late by the output latency so it lands with what you hear
      const lat = (lv.lat || 0.03) * 1000;
      if (TEMPO.period && TEMPO.conf > 0.6) {
        while (TEMPO.next + lat < now - TEMPO.period) TEMPO.next += TEMPO.period;
        if (now >= TEMPO.next + lat) { if (now - lastKick > TEMPO.period * 0.5) kick(); TEMPO.next += TEMPO.period; }
      }
      env *= 0.88;
      const b = Math.max(env, lv.bass * 0.18);
      if (Math.abs(b - state.beat) > 0.01) { state.beat = b; root.style.setProperty('--beat', b.toFixed(2)); }
    })(0);
  })();
  const tempo = () => (TEMPO.conf > 0.6 ? TEMPO.bpm : 0);
  function setSide(d) { state.sideT = d ? 1 : 0; }
  // where the table sits on screen (centre and half-size in CSS px)
  function setTable(rc) { if (rc) state.table = rc; }
  function setHeat(h) { state.heatT = Math.max(0, Math.min(1, h)); }
  // ---- embers: the stack counter and an armed multiplier smoulder, hotter as they grow ----
  // (CSS does the glow from --emb; this only sets the level and throws the odd spark.)
  const EMB = { stack: 0, arm: 0, burstT: 0 };
  function setEmber(el, v) { if (!el) return; el.classList.toggle('ember', v > 0.05); el.style.setProperty('--emb', Math.min(1, v).toFixed(2)); }
  function fireLevel(pending, multNext) {
    const lite = document.body.classList.contains('lite');
    EMB.stack = lite ? 0 : (pending >= 8 ? Math.min(1, 0.25 + (pending - 8) / 30) : 0);
    EMB.arm = lite ? 0 : (multNext > 1 ? Math.min(1, 0.3 + Math.log2(multNext) * 0.25) : 0);
    setEmber(document.querySelector('#hud .stack'), Math.max(EMB.stack, EMB.burstT > performance.now() ? 1 : 0));
    setEmber(document.querySelector('#hud .multchip'), EMB.arm);
  }
  setInterval(() => {
    if (document.hidden) return;
    if (EMB.stack > 0 && Math.random() < EMB.stack) sparks(document.querySelector('#hud .stack'), 1 + Math.round(EMB.stack * 2));
    if (EMB.arm > 0 && Math.random() < EMB.arm * 0.6) sparks(document.querySelector('#hud .multchip'), 1);
  }, 700);
  function comboFlame(el, amount, ms) {
    if (document.body.classList.contains('lite') || !el) return;
    setEmber(el, Math.min(1, amount / 4)); sparks(el, 3);
    setTimeout(() => setEmber(el, 0), ms);
  }
  function ignite(power = 1) {
    if (document.body.classList.contains('lite')) return;
    EMB.burstT = performance.now() + 900;
    const el = document.querySelector('#hud .stack');
    if (el) { setEmber(el, 1); sparks(el, 3 + Math.round(power * 3)); setTimeout(() => setEmber(el, EMB.stack), 900); }
  }
  // ---- a visitor at the table: warm light pours in for the angel, the room goes red and close for the demon ----
  function visit(kind) {
    let el = document.getElementById('visit');
    if (!el) { el = document.createElement('div'); el.id = 'visit'; document.body.appendChild(el); }
    el.className = ''; void el.offsetWidth; el.className = kind === 'dark' ? 'demon' : 'angel';
    if (kind === 'dark') { shake(5); }
    if (full()) burst(innerWidth / 2, innerHeight * 0.35, kind === 'dark' ? 40 : 24, null, kind === 'dark' ? 2 : 0.6);
  }
  return { tempo, visit, startBg, burst, shake, glitch, tilt, untilt, slot, setSide, setHeat, full, fireLevel, ignite, comboFlame, setTable };
})();

// ===== CLIENT: talks to the game server; the server runs every match =====
// When the page is hosted somewhere other than the server (for example GitHub Pages),
// put the server address here, e.g. 'wss://your-app.onrender.com/ws'. Leave empty when the server serves this page.

let ME = 0;
const RULES_L = () => RULES_I18N[LANG].filter(r => RULE_ALL.includes(r[0])), EXTRA_L = () => EXTRA_I18N[LANG].filter(r => EXTRA_CARDS.includes(r[0]));
const IDLE_MS = 60000, AWAY_MS = 15000;
const CVAR = { r: 'var(--r)', y: 'var(--y)', g: 'var(--g)', b: 'var(--b)', p: 'var(--p)', t: 'var(--t)', o: 'var(--o)', v: 'var(--v)' };
const S = loadSettings();
let G = null, busy = false, sortMode = 'color', lastHandIds = new Set();
let handOrder = []; // card ids in the order you dragged them (sortMode 'manual')
let lastLogKey = '', lastLogMsgs = [], lastEvN = 0, lastPlayRect = null, dragging = false, turnKey = '', turnStartedAt = 0;
let roomCode = '', isHost = false, lastLobby = null, lastGid = null, rouletteOpen = false, roulettePrompted = -1, away = [];
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cleanName = s => String(s || '').replace(/[\u0000-\u001f\u007f​-‏‪-‮⁠-⁯]/g, '').trim().slice(0, 14);

function loadSettings() {
  const d = { vol: 0.8, ambient: 'on', ambVol: 0.35, shake: true, bgMotion: true, tips: true, name: 'Player', sound: true, fx: ((window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4 && (navigator.deviceMemory || 8) <= 4)) ? 'lite' : 'full', lang: LANG, rules: Object.assign({}, PRESETS.den.rules), cards: Object.assign({}, PRESETS.den.cards) };
  try {
    const s = JSON.parse(localStorage.getItem('unoFlipNoMercy') || 'null');
    if (s) {
      const r = Object.assign({}, s.rules || {});
      if ('sevenZero' in r) { if (!('seven' in r)) r.seven = r.sevenZero; if (!('zero' in r)) r.zero = r.sevenZero; delete r.sevenZero; }
      return Object.assign(d, { vol: typeof s.vol === 'number' ? s.vol : 0.8, ambient: s.ambient === 'off' ? 'off' : 'on', ambVol: typeof s.ambVol === 'number' ? s.ambVol : 0.35, shake: s.shake !== false, musicFx: s.musicFx !== false, mode: s.mode === 'one' ? 'one' : 'debt', limit: [250, 500, 1000].includes(s.limit) ? s.limit : 250, bgMotion: s.bgMotion !== false, tips: s.tips !== false }, { name: s.name || d.name, sound: s.sound !== false, fx: s.fx === 'lite' ? 'lite' : (s.fx === 'full' ? 'full' : d.fx), lang: LANGS[s.lang] ? s.lang : d.lang, rules: Object.assign(d.rules, r), cards: Object.assign(d.cards, s.cards || {}) });
    }
  } catch (e) {}
  return d;
}
function saveSettings() { try { localStorage.setItem('unoFlipNoMercy', JSON.stringify(S)); } catch (e) {} }
// a private id for this browser: it is what lets you rejoin your seat


// chances on screen always carry one decimal: 10.0%, 2.5%
const pct = x => { const v = (+x || 0).toFixed(1) + '%'; return LANG === 'ru' ? v.replace('.', ',') : v; };

// ================= SOUND (synthesized, no files) =================
const SFX = {
  ctx: null, out: null, noise: null,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const ctx = this.ctx = arguments[0] || new (window.AudioContext || window.webkitAudioContext)();
      // Keep tabletop transients close, with a short, damp room reflection.
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3;
      const master = ctx.createGain(); master.gain.value = 0.9 * (S.vol ?? 0.8); this.master = master;
      const dry = ctx.createGain(), wet = ctx.createGain(); wet.gain.value = 0.24;
      const ir = ctx.createBuffer(2, ctx.sampleRate * 0.68, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d2 = ir.getChannelData(ch); for (let i = 0; i < d2.length; i++) d2[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d2.length, 3.2); }
      const dl = ctx.createConvolver(); dl.buffer = ir;
      const damp = ctx.createBiquadFilter(); damp.type = 'lowpass'; damp.frequency.value = 1650;
      dl.connect(damp); damp.connect(wet);
      dry.connect(comp); wet.connect(comp); comp.connect(master); master.connect(ctx.destination);
      this.out = { dry, send: dl };
      const len = ctx.sampleRate; const buf = ctx.createBuffer(1, len, ctx.sampleRate); const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
    } catch (e) { this.ctx = null; }
  },
  // Filtered noise supplies both surface texture and the damped body of an impact.
  rustle(t, dur, f1, f2, q, vol, type = 'bandpass') {
    const c = this.ctx, src = c.createBufferSource(); src.buffer = this.noise; src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const flt = c.createBiquadFilter(); flt.type = type; flt.Q.value = q;
    flt.frequency.setValueAtTime(f1, t); flt.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.01, dur / 7)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const send = c.createGain(); send.gain.value = 0.15;
    src.connect(flt); flt.connect(g); g.connect(this.out.dry);
    g.connect(send); send.connect(this.out.send);
    const availableOffset = this.noise.duration - dur * src.playbackRate.value;
    src.start(t, Math.random() * Math.max(0, availableOffset)); src.stop(t + dur);
  },
  play(name, k = 1) {
    if (!S.sound || !this.ctx || (this.ctx.state !== 'running' && !this.offline)) return;
    if (!this.offline && ASSETS.playSound(name, k)) return; // a sound file from the asset pack wins
    try { playCue(this, name, this.ctx.currentTime + 0.005, k); } catch (e) {}
  }
};
document.addEventListener('pointerdown', () => SFX.init(), { capture: true });


// ================= FX (short, ease-out, no overshoot) =================
function rectOf(el) { return el ? el.getBoundingClientRect() : null; }
function centerRect(r, w, h) { return { left: r.left + r.width / 2 - w / 2, top: r.top + r.height / 2 - h / 2, width: w, height: h }; }
function fly(html, from, to, { dur = 120, delay = 0, onDone } = {}) {
  if (!from || !to) { if (onDone) onDone(); return; }
  const wrap = document.createElement('div'); wrap.innerHTML = html; const el = wrap.firstElementChild;
  if (!el) return;
  el.style.width = from.width + 'px'; el.style.height = from.height + 'px';
  $('fx').appendChild(el);
  const sx = to.width / from.width, sy = to.height / from.height;
  const tx = to.left + (to.width - from.width) / 2, ty = to.top + (to.height - from.height) / 2;
  const a = el.animate([
    { transform: `translate(${from.left}px,${from.top}px)` },
    { transform: `translate(${tx}px,${ty}px) scale(${sx},${sy})` }
  ], { duration: dur, delay, easing: 'ease-out', fill: 'backwards' });
  a.onfinish = () => { el.remove(); if (onDone) onDone(); };
  setTimeout(() => { if (el.isConnected) el.remove(); }, dur + delay + 400);
}
let toastTimer;
function toast(text) {
  const t = $('toast'); t.textContent = text; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 900);
}
const UI_ICON = {
  gear: '<svg class="uico" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M6.8 1h2.4l.4 2 1.3.6 1.7-1.2 1.7 1.7-1.2 1.7.6 1.3 2 .4v2.4l-2 .4-.6 1.3 1.2 1.7-1.7 1.7-1.7-1.2-1.3.6-.4 2H6.8l-.4-2-1.3-.6-1.7 1.2-1.7-1.7 1.2-1.7L2.4 9.6l-2-.4V6.8l2-.4.6-1.3-1.2-1.7 1.7-1.7 1.7 1.2 1.3-.6zM8 5.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8z"/></svg>',
  cw: '<svg class="uico" viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.5-3.6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M13.6 1.5v4.4H9.2z" fill="currentColor"/></svg>',
  ccw: '<svg class="uico" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8a5 5 0 1 0 1.5-3.6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M2.4 1.5v4.4h4.4z" fill="currentColor"/></svg>'
};
function floatText(pi, txt, html) {
  const host = pi === ME ? $('hand') : $('opp' + pi); if (!host) return;
  host.style.position = 'relative';
  const f = document.createElement('div'); f.className = 'float'; if (html) f.innerHTML = html; else f.textContent = txt;
  host.appendChild(f);
  requestAnimationFrame(() => f.classList.add('in'));
  setTimeout(() => f.classList.remove('in'), 900);
  setTimeout(() => f.remove(), 1100);
}
function initials(name) {
  const w = String(name || '?').trim().split(/\s+/);
  return esc((w.length > 1 ? w[0][0] + w[1][0] : w[0].slice(0, 2)).toUpperCase());
}


// ================= TABLE CONNECTION =================
const local = localConnection(onServer);
const online = webConnection(onServer);
let conn = local, listedRooms = [], opponentSelection = new Map();
let networkDeadline = null;
const networkText = (ru, en) => LANG === 'ru' ? ru : en;
function setNet(t) { $('netTag').textContent = t || (roomCode ? STR[LANG].room(roomCode) : ''); $('netBanner').textContent = t; $('netBanner').classList.toggle('hidden', !t); }
function onServer(m) {
  switch (m.t) {
    case 'joined': roomCode = m.code; startMsg(''); setNet(''); break;
    case 'directory': listedRooms = m.rooms; drawDirectory(); break;
    case 'disconnected': setNet(networkText('Восстанавливаем соединение…', 'Reconnecting…')); break;
    case 'error':
      { const txt = ({
          'no-room': t('noRoom'), start: t('needMore'), bad: t('badReq'),
          expired: networkText('Место больше недоступно.', 'Your seat has expired.'),
          offline: networkText('Сервер недоступен.', 'The server is unavailable.'),
          unavailable: networkText('Комната недоступна или заполнена.', 'The room is unavailable or full.'),
          maintenance: networkText('Обновление сервера. Новые матчи временно отключены.', 'Server update pending. New matches are paused.'),
          forbidden: networkText('Действие недоступно.', 'This action is unavailable.'),
          'room-failed': networkText('Комната закрылась из-за ошибки.', 'The room closed after an error.'),
        })[m.code] || m.msg || t('badReq');
        if (m.code === 'expired' || m.code === 'room-failed') { roomCode = ''; G = MATCH = null; closeModal(); show('start'); }
        if ($('start').classList.contains('hidden')) { $('lbWait').textContent = txt; toast(txt); } else startMsg(txt); }
      break;
    case 'replaced': conn.close(); roomCode = ''; show('start'); startMsg(t('otherTab')); break;
    case 'left': break;
    case 'lobby': onLobby(m.lobby); break;
    case 'state': onState(m); break;
    case 'rejected': SFX.play('bad'); toast(LANG === 'ru' ? 'Ход уже изменился или действие недоступно' : 'The turn changed or the action is unavailable'); break;
  }
}
function onLobby(l) {
  lastLobby = l; isHost = !!l.host;
  if (G) { G = null; MATCH = null; busy = false; rouletteOpen = false; closeModal(); }
  renderLobby(l);
  show('lobby');
}
let MATCH = null, lastHandHTML = '';
let controls = null, playableIds = new Set();
let handPage = 0, handPageCount = 1;
// the hand sways in 4-beat breaths when the room can hear the music's tempo
let swayDur = 0;
setInterval(() => {
  const bpm = JUICE.tempo && JUICE.tempo(), d = bpm ? (4 * 60 / bpm) : 3.6;
  if (Math.abs(d - swayDur) / (swayDur || 1) > 0.03) { swayDur = d; const h = document.getElementById('hand'); if (h) h.style.setProperty('--sway', d.toFixed(2) + 's'); }
}, 1500);
// write HTML only when it changed: keeps the DOM, hover state and running animations, and saves layout work
const setHTML = (el, html) => { if (el && el.__html !== html) { el.__html = html; el.innerHTML = html; return true; } return false; };
function onState(m) {
  let g; try { g = deserialize(m.st); } catch (e) { return; }
  isHost = !!m.host; lastLobby = m.lobby || lastLobby; away = m.st.aw || [];
  opponentSelection = new Map(m.selection || []);
  networkDeadline = m.deadline == null ? null : Date.now() + Math.max(0, m.deadline - m.serverTime);
  MATCH = m.match || null; if (MATCH) MATCH.until = Date.now() + (MATCH.left || 0);
  // keep card ids stable so only genuinely new cards animate in
  if (G && G.players[ME] && g.gid === lastGid && m.seat === ME) {
    const kOf = c => c.wid != null ? 'w' + c.wid : cardCode(c);
    const pool = {}; for (const c of G.players[ME].hand) (pool[kOf(c)] = pool[kOf(c)] || []).push(c.id);
    for (const c of g.players[m.seat].hand) { const l = pool[kOf(c)]; if (l && l.length) c.id = l.shift(); }
  }
  const fresh = g.gid !== lastGid || $('game').classList.contains('hidden');
  G = g; ME = m.seat; lastGid = g.gid;
  controls = m.controls; playableIds = new Set(controls.playable);
  WID.clear(); if (g.players[ME]) for (const c of g.players[ME].hand) if (c.wid != null) WID.set(String(c.id), c.wid);
  if (fresh) beginGameView(); else tick();
}


// ================= START + LOBBY =================
function seg(el, opts, key, fmt, after) {
  el.innerHTML = '';
  for (const o of opts) {
    const b = document.createElement('button'); b.textContent = fmt ? fmt(o) : o;
    if (S[key] === o) b.className = 'on';
    b.onclick = () => { S[key] = o; SFX.play('click'); seg(el, opts, key, fmt, after); if (after) after(); };
    el.appendChild(b);
  }
}
// presets: one tap sets the whole table; the fine-tune list stays folded away
function presetOf(rules, cards) {
  for (const k of ['classic', 'den', 'mayhem']) {
    const P = PRESETS[k];
    if (RULE_ALL.every(r => !!rules[r] === P.rules[r]) && EXTRA_CARDS.every(c => (cards[c] !== false) === P.cards[c])) return k;
  }
  return 'custom';
}
const PRESET_T = { classic: ['presetClassic', 'presetClassicD'], den: ['presetDen', 'presetDenD'], mayhem: ['presetMayhem', 'presetMayhemD'] };
function drawMode() {
  $('lbMode').innerHTML = [['one', 'modeOne', 'modeOneD'], ['debt', 'modeDebt', 'modeDebtD']].map(([k, a, b]) => `<button class="preset ${S.mode === k ? 'on' : ''}" data-mode="${k}"><b>${t(a)}</b><span>${t(b)}</span></button>`).join('');
  $('lbLimitRow').classList.toggle('hidden', S.mode !== 'debt');
  $('lbLimit').innerHTML = [250, 500, 1000].map(v => `<button class="${S.limit === v ? 'on' : ''}" data-limit="${v}">${v}</button>`).join('');
}
const pushSettings = () => { saveSettings(); drawMode(); if (isHost) conn.send({ t: 'settings', rules: S.rules, cards: S.cards, mode: S.mode, limit: S.limit }); };
$('lbMode').addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (!b) return; S.mode = b.dataset.mode; SFX.play('click'); pushSettings(); });
$('lbLimit').addEventListener('click', e => { const b = e.target.closest('[data-limit]'); if (!b) return; S.limit = +b.dataset.limit; SFX.play('click'); pushSettings(); });
function drawPresets() {
  const cur = presetOf(S.rules, S.cards);
  $('lbPresets').innerHTML = Object.keys(PRESET_T).map(k => `<button class="preset ${cur === k ? 'on' : ''}" data-preset="${k}"><b>${t(PRESET_T[k][0])}</b><span>${t(PRESET_T[k][1])}</span></button>`).join('');
  $('lbFineSum').textContent = t('fineTune') + (cur === 'custom' ? ' · ' + t('presetCustom') : '');
}
$('lbPresets').addEventListener('click', e => {
  const b = e.target.closest('[data-preset]'); if (!b) return;
  const P = PRESETS[b.dataset.preset];
  S.rules = Object.assign({}, S.rules, P.rules); S.cards = Object.assign({}, S.cards, P.cards);
  SFX.play('click'); saveSettings(); drawToggles();
  if (isHost) conn.send({ t: 'settings', rules: S.rules, cards: S.cards, mode: S.mode, limit: S.limit });
});
function drawToggles(dis) {
  const rules = RULES_L().map(([k, t, d]) => `<label class="opt"><input type="checkbox" data-rule="${k}" ${S.rules[k] ? 'checked' : ''}><div><b>${t}</b><span>${d}</span></div></label>`).join('');
  const cards = EXTRA_L().map(([k, t, d]) => `<label class="opt"><input type="checkbox" data-card="${k}" ${S.cards[k] ? 'checked' : ''}><div><b>${t}</b><span>${d}</span></div></label>`).join('');
  $('lbRules').innerHTML = rules; $('lbCards').innerHTML = cards;
  drawPresets(); drawMode();
}
drawToggles();
function onToggle(e) {
  const t = e.target; let hit = false;
  if (t.dataset.rule) { S.rules[t.dataset.rule] = t.checked; hit = true; }
  if (t.dataset.card) { S.cards[t.dataset.card] = t.checked; hit = true; }
  if (!hit) return;
  saveSettings(); drawPresets();
  if (isHost) conn.send({ t: 'settings', rules: S.rules, cards: S.cards, mode: S.mode, limit: S.limit });
}
for (const id of ['lbRules', 'lbCards']) $(id).addEventListener('change', onToggle);
$('pname').value = S.name;
document.querySelectorAll('[data-rules]').forEach(b => b.onclick = showRules);
$('btnSound').onclick = () => { S.sound = !S.sound; saveSettings(); setTimeout(() => AMB.apply(), 0); $('btnSound').textContent = S.sound ? t('soundOn') : t('soundOff'); if (S.sound) { SFX.init(); SFX.play('turn'); } };
const musicControls = () => `<div class="music-player" data-music-player>
  <div class="music-meta">
    <div class="music-caption"><span class="label" data-music-label></span><small data-music-status></small></div>
    <span data-music-title aria-live="polite"></span>
  </div>
  <div class="music-buttons">
    <button type="button" class="btn quiet" data-music-action="prev">⏮</button>
    <button type="button" class="btn quiet" data-music-action="toggle">▶</button>
    <button type="button" class="btn quiet" data-music-action="next">⏭</button>
  </div></div>`;
function updateMusicControls() {
  const ru = LANG === 'ru';
  const track = music?.track ?? tracks[0];
  const playing = music?.status === 'playing' || music?.status === 'loading';
  const states = ru
    ? { paused: 'Пауза', error: 'Ошибка воспроизведения' }
    : { paused: 'Paused', error: 'Playback error' };
  for (const panel of document.querySelectorAll('[data-music-player]')) {
    panel.setAttribute('aria-busy', String(music?.status === 'loading'));
    panel.querySelector('[data-music-label]').textContent = ru ? 'Музыка' : 'Music';
    const name = track ? [track.artist, track.title].filter(Boolean).join(' · ') : (ru ? 'Нет треков' : 'No tracks');
    const title = panel.querySelector('[data-music-title]');
    title.textContent = name;
    title.title = name;
    panel.querySelector('[data-music-status]').textContent =
      S.sound ? states[music?.status] ?? '' : (ru ? 'Звук выключен' : 'Sound off');
    for (const button of panel.querySelectorAll('[data-music-action]')) {
      const action = button.dataset.musicAction;
      const label = action === 'toggle'
        ? (playing ? (ru ? 'Пауза' : 'Pause') : (ru ? 'Воспроизвести' : 'Play'))
        : action === 'next' ? (ru ? 'Следующий трек' : 'Next track') : (ru ? 'Предыдущий трек' : 'Previous track');
      button.setAttribute('aria-label', label);
      button.title = label;
      button.disabled = !track || (action === 'toggle' ? !S.sound : tracks.length < 2);
      if (action === 'toggle') button.textContent = playing ? 'Ⅱ' : '▶';
    }
  }
}
function applyStatic() {
  document.documentElement.lang = LANG;
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = el.id === 'btnCreate' ? (LANG === 'ru' ? 'Открыть стол' : 'Open table') : t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  $('btnSound').textContent = S.sound ? t('soundOn') : t('soundOff');
  $('btnFx').innerHTML = UI_ICON.gear + ' ' + esc(t('settings'));
  seg($('segLang'), Object.keys(LANGS), 'lang', k => LANGS[k], () => setLang(S.lang));
  drawToggles();
  updateMusicControls();
  $('onlineTitle').textContent = networkText('Играть по сети', 'Play online');
  $('btnCreateOnline').textContent = networkText('Создать комнату', 'Create room');
  $('btnListRooms').textContent = networkText('Открытые комнаты', 'Public rooms');
  $('joinLabel').textContent = networkText('Код комнаты', 'Room code');
  $('btnJoinOnline').textContent = networkText('Войти', 'Join');
  $('lbPublicLabel').textContent = networkText('Публичная комната', 'Public room');
  $('lbCapacityLabel').textContent = networkText('Мест за столом', 'Seats');
  $('lbBotProfileLabel').textContent = networkText('Стратегия нового бота', 'New bot strategy');
  const botProfiles = LANG === 'ru' ? ['Обычная', 'Осторожная', 'Агрессивная', 'Комбинации', 'Контроль долга'] : ['Standard', 'Cautious', 'Aggressive', 'Combinations', 'Debt management'];
  [...$('lbBotProfile').options].forEach((option, i) => { option.textContent = botProfiles[i]; });
  drawDirectory();
}
function setFx(m) { S.fx = m; saveSettings(); document.body.classList.toggle('lite', m !== 'full'); }
$('btnFx').onclick = showSettings;
function setLang(l) {
  if (!LANGS[l]) return;
  LANG = l; S.lang = l; saveSettings();
  applyStatic();
  if (lastLobby && !$('lobby').classList.contains('hidden')) renderLobby(lastLobby);
  if (G) { lastLogKey = ''; render(); }
}
$('musicLobby').innerHTML = musicControls();
$('musicTable').innerHTML = musicControls();
applyStatic();
document.body.classList.toggle('lite', S.fx !== 'full');
ASSETS.load();
JUICE.startBg();
function readName() { S.name = cleanName($('pname').value) || 'Player'; saveSettings(); $('lbName').value = S.name; return S.name; }
function show(screen) { for (const id of ['start', 'lobby', 'game']) $(id).classList.toggle('hidden', id !== screen); if (screen !== 'game') document.body.classList.remove('dark'); }
function startMsg(t) { $('startMsg').textContent = t; }
function createRoom(transport) { readName(); startMsg(t('connServer')); roomCode = ''; if (conn !== transport) conn.close(); conn = transport; conn.open({ t: 'create', name: S.name, rules: S.rules, cards: S.cards, mode: S.mode, limit: S.limit }); }
function joinRoom(code) {
  code = code.trim().toUpperCase();
  if (!/^[A-Z2-9]{6}$/.test(code)) { startMsg(t('badReq')); return; }
  if (conn !== online) conn.close();
  conn = online;
  conn.open({ t: 'join', name: readName(), code });
}
function drawDirectory() {
  setHTML($('publicRooms'), listedRooms.map(r => `<div class="seatrow"><span>${esc(r.code)} · ${r.players}/${r.capacity} · ${t(r.mode === 'debt' ? 'modeDebt' : 'modeOne')}${r.live ? ' · ' + t('inProgress') : ''}</span><button class="btn quiet" type="button" data-room-code="${esc(r.code)}" ${!r.joinable ? 'disabled' : ''}>${networkText('Войти', 'Join')}</button></div>`).join(''));
}
$('btnCreate').onclick = () => createRoom(local);
$('btnCreateOnline').onclick = () => createRoom(online);
$('btnListRooms').onclick = () => online.open({ t: 'list' });
$('joinOnline').onsubmit = (event) => { event.preventDefault(); joinRoom($('joinCode').value); };
$('publicRooms').onclick = (event) => { const button = event.target.closest('[data-room-code]'); if (button) joinRoom(button.dataset.roomCode); };
$('lbPublic').onchange = (event) => conn.send({ t: 'settings', public: event.target.checked });
$('lbCapacity').onchange = (event) => conn.send({ t: 'settings', capacity: +event.target.value });
if (location.protocol === 'https:' || location.protocol === 'http:') {
  $('onlineRooms').classList.remove('hidden');
  queueMicrotask(() => { if (online.resume()) conn = online; });
}
function leaveRoom() {
  conn.close();
  roomCode = ''; G = null; busy = false; lastGid = null; closeModal(); show('start'); setNet('');
}
$('btnLeave').onclick = leaveRoom;
let renameTimer;
$('lbName').addEventListener('input', () => {
  clearTimeout(renameTimer);
  renameTimer = setTimeout(() => {
    const nm = cleanName($('lbName').value); if (!nm || nm === S.name) return;
    S.name = nm; saveSettings(); $('pname').value = nm;
    conn.send({ t: 'rename', name: nm });
  }, 350);
});
$('btnRoomStart').onclick = () => conn.send({ t: 'start' });
$('btnAddBot').onclick = () => conn.send({ t: 'addbot', profile: $('lbBotProfile').value });
$('btnRmBot').onclick = () => conn.send({ t: 'rmbot' });
function renderLobby(l) {
  $('lbHint').textContent = l.code ? networkText('Код комнаты: ', 'Room code: ') + l.code : networkText('Добавьте ботов и начните игру.', 'Add bots to start playing.');
  $('lbOnlineConfig').classList.toggle('hidden', !l.code);
  $('lbPublic').checked = !!l.public;
  $('lbCapacity').value = l.capacity || 6;
  $('lbHost').classList.toggle('hidden', !l.host);
  $('lbGuest').classList.toggle('hidden', !!l.host);
  if (document.activeElement !== $('lbName')) $('lbName').value = S.name;
  $('lbSeats').innerHTML = l.players.map(([name, on, host, me, bot]) => `<div class="seatrow ${me ? 'me' : ''}"><span class="who"><span class="ini">${bot ? 'AI' : initials(name)}</span>${esc(name)}</span><span class="label ${bot ? 'bot' : ''}">${bot ? t('botTag') : host ? t('host') : t('player')}${on ? '' : ' · ' + t('away')}</span></div>`).join('');
  $('btnAddBot').disabled = l.players.length >= (l.capacity || 6);
  $('btnRmBot').disabled = !l.players.some(p => p[4]);
  if (l.host) {
    // the host's own toggles drive the room; keep them in step with what the server holds
    let changed = false;
    for (const k in l.rules) if (S.rules[k] !== l.rules[k]) { S.rules[k] = l.rules[k]; changed = true; }
    for (const k in l.cards) if (S.cards[k] !== l.cards[k]) { S.cards[k] = l.cards[k]; changed = true; }
    if (l.mode && (S.mode !== l.mode || S.limit !== l.limit)) { S.mode = l.mode; S.limit = l.limit; changed = true; }
    if (changed) { drawToggles(); saveSettings(); }
    const online = l.players.filter(p => p[1]).length;
    $('btnRoomStart').disabled = online < 2;
    $('lbWait').textContent = online < 2 ? t('needMore') : t('ready', Math.min(online, 6));
  } else {
    const row = (name, on) => `<div class="rv ${on ? '' : 'off'}"><span>${esc(name)}</span><span class="mono">${on ? t('on') : t('off')}</span></div>`;
    const pk = presetOf(l.rules, l.cards);
    $('lbRulesView').innerHTML = `<div class="rv"><span>${t('matchMode')}</span><span class="mono">${l.mode === 'one' ? t('modeOne') : t('modeDebt') + ' · ' + l.limit}</span></div><div class="rv"><span>${t('presets')}</span><span class="mono">${pk === 'custom' ? t('presetCustom') : t(PRESET_T[pk][0])}</span></div>`
      + `<details class="fine"><summary>${t('fineTune')}</summary>` + RULES_L().map(([k, t]) => row(t, !!l.rules[k])).join('') + EXTRA_L().map(([k, t]) => row(t, l.cards[k] !== false)).join('') + `</details>`;
    $('lbWait').textContent = l.live ? t('inProgress') : t('waitHost');
  }
}
function beginGameView() {
  handPage = 0;
  lastHandIds = new Set(); busy = false; lastEvN = Math.max(0, G.evSeq - 1);
  show('game'); closeModal(); setNet('');
  tick();
}



// ================= ACTIONS + LOOP =================
function act(k, a = {}) { conn.send({ t: 'act', a: Object.assign({ k }, a) }); }
function tick() {
  render();
  if (!G) return;
  if (MATCH) { matchOverlay(); if (MATCH.phase !== 'play') return; }
  if (G.winner !== null) { if (!MATCH) setTimeout(showEnd, 1400); return; }
  if (G.roulette === ME && roulettePrompted !== G.seq && !busy) {
    roulettePrompted = G.seq; busy = true; rouletteOpen = true;
    pickColor(t('rouletteTitle'), t('rouletteSub'), G.side, true).then(c => { busy = false; rouletteOpen = false; act('roul', { color: c }); });
  }
  if (rouletteOpen && G.roulette !== ME) { rouletteOpen = false; busy = false; closeModal(); }
}

// ================= INPUT =================
function myTurnNow() { return !!(G && G.turn === ME && G.roulette === null && G.winner === null && G.players[ME] && !G.players[ME].out); }
// could this card go down right now (ignores whether a choice dialog is open)
function fits(card) { return playableIds.has(card.wid); }
function usable(card) { return !busy && fits(card); }
async function useCard(card, el, fromRect, extrasIn) {
  if (!usable(card)) { if (el) { el.classList.remove('nope'); void el.offsetWidth; el.classList.add('nope'); } SFX.play('bad'); return; }
  const me = G.players[ME];
  let face = G.f(card), back = G.back(card);
  busy = true;
  let color = null, flipColor = null, target = null, extra = [];
  if (Array.isArray(extrasIn) && extrasIn.length) extra = extrasIn;
  const cancel = () => { busy = false; render(); };
  if (face.c === 'w' && face.v !== 'roul' && !(G.horseOn('plague', 'blank', ME) && !card.uniq)) { color = await pickColor(t('pickColor'), cardName(face), G.side); if (!color) return cancel(); }
  if ((face.v === 'flip' || face.v === 'dflip') && (back.c === 'w' || back.c === 'x')) { flipColor = await pickColor(t('flipWild'), t('flipWildSub', cardName(back)), G.side === 'L' ? 'D' : 'L'); if (!flipColor) return cancel(); }
  const keep = me.hand.length - 1 - extra.length;
  if (face.v === 'sacr' && G.active().length > 2) { target = await pickTarget(t('sacrQ'), t('sacrSub')); if (target === null) return cancel(); }
  if (face.v === 'gift' && G.active().length > 2) { target = await pickTarget(t('giftQ'), t('giftSub', Math.min(2 * (extra.length + 1), Math.max(0, keep)))); if (target === null) return cancel(); }
  busy = false;
  if (!G || !G.players[ME].hand.some(c => cardCode(c) === cardCode(card))) { tick(); return; }
  lastPlayRect = fromRect || rectOf(el);
  act('play', { card: cardCode(card), id: card.wid, color, flipColor, target, extra: extra.map(cardCode), extraIds: extra.map(c => c.wid) });
}
function overDiscard(x, y) { const r = rectOf($('discard')); return r && x > r.left - 40 && x < r.right + 40 && y > r.top - 40 && y < r.bottom + 40; }
// ---------- several cards at once: pick them in the hand (right click, Ctrl/Shift+click, or the Select button), then play ----------
let selIds = [], selMode = false;
const isNumF = f => /^\d$/.test(f.v) && f.c !== 'w';
function selCards() { const h = G && G.players[ME] ? G.players[ME].hand : []; return selIds.map(id => h.find(c => c.id === id)).filter(c => c && !c.lock); }
function toggleSel(card) {
  if (!G || !card || card.lock) return;
  if (!controls?.canGroup) { toast(G.horseOn('famine', 'two', ME) ? (LANG === 'ru' ? 'Голод: только одна карта' : 'Famine: one card only') : t('multiOff')); return; }
  const i = selIds.indexOf(card.id);
  if (i >= 0) selIds.splice(i, 1); else selIds.push(card.id);
  SFX.play('click'); render();
}
function clearSel() { if (selIds.length) { selIds = []; render(); } }
// what the picked cards make: a poker hand (numbers + one plain Wild), or cards of the same value; and which one leads
function selInfo(list) {
  const cards = list || selCards(), n = cards.length;
  if (!n) return null;
  const faces = cards.map(c => G.f(c));
  if (n === 1) return { cards, lead: cards[0], extra: [], ok: fits(cards[0]), kind: 'one' };
  let kind = null, cb = null;
  if (G.rules.combos !== false && faces.every(f => isNumF(f) || isJoker(f))) { cb = comboOf(faces); if (cb) kind = 'combo'; }
  if (!kind && faces.every(f => f.v === faces[0].v && (f.c === 'w') === (faces[0].c === 'w'))) kind = 'same';
  if (!kind) return { cards, ok: false, kind: 'none' };
  const lead = conn === online ? cards.find(fits) : (() => {
    const ordered = local.selection(cards.map(c => c.wid));
    return ordered && cards.find(c => c.wid === ordered[0]);
  })();
  if (!lead) return { cards, ok: false, kind, cb, why: 'lead' };
  return { cards, lead, extra: cards.filter(c => c !== lead), ok: true, kind, cb };
}
// the best poker hand you could lay down right now (for the hint)
function bestCombo(hand) {
  if (!G || G.rules.combos === false || !controls?.canGroup) return null;
  let best = null, bestScore = -1;
  for (const cs of comboCands(hand, c => G.f(c))) {
    const cb = comboOf(cs.map(c => G.f(c))); if (!cb) continue;
    const sc = (cs.some(c => fits(c)) ? 10000 : 0) + comboWorth(cb, cs.length, G.side, 1) * 10 + COMBO_RANK.indexOf(cb.key);
    if (sc > bestScore) { bestScore = sc; best = { cards: cs, cb }; }
  }
  return best;
}
// every poker hand, always on view next to the log; the one your picked cards make lights up
// example hands for the reference, as mini cards: [value, colour slot 0..3]
const COMBO_EX = {
  five: [[7, 0], [7, 1], [7, 2], [7, 3], [7, 0]], flush: [[1, 3], [4, 3], [6, 3], [8, 3], [9, 3]], four: [[5, 0], [5, 1], [5, 2], [5, 3]],
  straightflush: [[3, 2], [4, 2], [5, 2], ['+', 2]], fullhouse: [[2, 0], [2, 1], [2, 3], [8, 2], [8, 0]],
  straight: [[3, 1], [4, 3], [5, 0], [6, 2], ['+', 1]], three: [[6, 0], [6, 2], [6, 3]], twopair: [[4, 1], [4, 3], [9, 0], [9, 2]], pair: [[7, 2], [7, 0]]
};
// what the runs (and a full house of two sets) pay depends on their length: shown as a formula
const COMBO_VAR = { straight: ['n−3', '(+1)', '−' + COMBOS.straight.r], straightflush: ['n−2', '(+2)', '−' + COMBOS.straightflush.r + '/−10'], fullhouse: ['−2/−3', '+1', '−6/−8'] };
let comboRefKey = '';
function comboRefHTML(active) {
  const cols = SIDE_COLORS[G ? G.side : 'L'];
  const mini = k => COMBO_EX[k].map(([v, c]) => `<i class="mc c-${cols[c]}${v === '+' ? ' more' : ''}">${v === '+' ? '…' : v}</i>`).join('');
  const num = (n, cls) => n ? `<span class="${cls}">${n}</span>` : '<span class="nil">·</span>';
  const vr = (v, cls) => v ? `<span class="${cls}">${v}</span>` : '<span class="nil">·</span>';
  const rows = COMBO_RANK.slice().reverse().map(k => { const c = COMBOS[k], vv = COMBO_VAR[k];
    return `<div class="cr${k === active ? ' on' : ''}"><b class="cnm">${t('combo_' + k)}</b><span class="mcs">${mini(k)}</span>`
      + (vv ? vr(vv[0], 'toss') + vr(vv[1], 'hit') + vr(vv[2], 'debt')
        : `${num(c.d ? '−' + c.d : 0, 'toss')}${num(c.m ? '+' + c.m : 0, 'hit')}${num(c.r ? '−' + c.r : 0, 'debt')}`) + `</div>`; }).join('');
  return `<div class="crhead"><span class="label">${t('refTitle')}</span>${active ? `<span class="crnow">${t('combo_' + active)}</span>` : ''}</div>`
    + `<div class="cr crcols"><span>${t('refColHand')}</span><span></span><span title="${esc(t('refTossTip'))}">${t('refColToss')}</span><span title="${esc(t('refHitTip'))}">${t('refColHit')}</span><span title="${esc(t('refDebtTip'))}">${t('refColDebt')}</span></div>`
    + rows
    + `<div class="crfoot">${t('refShort')}</div>`;
}
function drawComboRef(active) {
  const el = $('comboRef'); if (!el || !G) return;
  const on = G.rules.combos !== false && G.rules.multi;
  const key = LANG + ':' + on + ':' + (active || '') + ':' + G.side;
  if (key === comboRefKey) return; comboRefKey = key;
  if (!on) { el.innerHTML = ''; el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  el.innerHTML = comboRefHTML(active);
}
function drawSelBar() {
  const bar = $('selBar'); if (!G || !G.players[ME]) { bar.classList.add('hidden'); return; }
  const me = G.players[ME];
  selIds = selIds.filter(id => me.hand.some(c => c.id === id && !c.lock));
  const info = selInfo(), myTurn = myTurnNow(), canGo = info && info.ok && myTurn && !busy;
  drawComboRef(info && info.kind === 'combo' ? info.cb.key : null);
  let html = '';
  // just the name of what the picked cards make; the buttons only in tap-to-pick mode (phones)
  if (info && info.cards.length > 1) {
    const name = info.kind === 'combo' ? t('combo_' + info.cb.key) : info.kind === 'same' ? t('togetherN', info.cards.length) : t('noCombo');
    html = `<b class="${info.ok ? '' : 'bad'}">${name}</b>${selMode ? `<button class="btn primary" id="selGo" ${canGo ? '' : 'disabled'}>${t('playN', info.cards.length)}</button><button class="btn quiet" id="selClear">${t('cancel')}</button>` : ''}`;
  } else if (info && selMode) {
    html = `<button class="btn primary" id="selGo" ${canGo ? '' : 'disabled'}>${t('playN', 1)}</button><button class="btn quiet" id="selClear">${t('cancel')}</button>`;
  }
  setHTML(bar, html); bar.classList.toggle('hidden', !html);
  if ($('selGo')) $('selGo').onclick = () => playSelection();
  if ($('selClear')) $('selClear').onclick = () => clearSel();
  if ($('selHint')) $('selHint').onclick = () => { const b = bestCombo(me.hand); if (b) { selIds = b.cards.map(c => c.id); SFX.play('click'); render(); } };
  // sit just above the hand, out of the layout flow
  // sits on the felt just above your strip, so it never covers the buttons or the cards
  // measured on the next frame, when the browser lays the page out anyway, not in the middle of render()
  if (html && !selBarRaf) selBarRaf = requestAnimationFrame(() => {
    selBarRaf = 0;
    const mr = $('bottom').querySelector('.me').getBoundingClientRect(), br = $('bottom').getBoundingClientRect();
    bar.style.top = (mr.top - br.top - 44) + 'px';
  });
}
let selBarRaf = 0;
function playSelection() {
  const info = selInfo(); if (!info || !info.ok || !myTurnNow()) { SFX.play('bad'); return false; }
  const el = $('hand').querySelector(`.card[data-id="${info.lead.id}"]`);
  selIds = []; useCard(info.lead, el, null, info.extra); return true;
}

// ---------- drag to reorder, Balatro style: the others slide apart to open a gap ----------
function slotRects(els) { return els.map(e => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, t: r.top }; }); }
function nearestSlot(rects, x, y, allowed) {
  let best = -1, bd = Infinity;
  rects.forEach((r, i) => { if (allowed && !allowed(i)) return; const d = Math.abs(r.x - x) + Math.abs(r.y - y) * 1.6; if (d < bd) { bd = d; best = i; } });
  return best;
}
// move element src to slot `to` (visually only), returns the new order of indices
function previewOrder(els, rects, src, to) {
  const order = els.map((_, i) => i); order.splice(src, 1); order.splice(to, 0, src);
  order.forEach((oi, ni) => { const e = els[oi]; const dx = rects[ni].l - rects[oi].l, dy = rects[ni].t - rects[oi].t; e.style.translate = (dx || dy) ? `${dx}px ${dy}px` : ''; });
  return order;
}
function clearPreview(els) { els.forEach(e => { e.style.translate = ''; }); }


// Patch a container of cards to match new markup, reusing elements whose face is unchanged (matched by data-id).
const PARSE = document.createElement('template');
function cardSig(el) { // everything that decides how the face is drawn, except state classes and layout style
  return el.dataset.f + '|' + el.dataset.id + '|' + [...el.classList].filter(c => !STATE_CLS.has(c) && !/^(sel\d|ch\d)$/.test(c)).sort().join(' ') + '|' + el.innerHTML.length;
}
const STATE_CLS = new Set(['ok', 'dim', 'jump', 'locked', 'picked', 'sel', 'new', 'flipin', 'nope', 'lifted', 'uniq', 'topc', 'under']);
// With parts (one markup string per element, in order) a card whose own markup is unchanged is kept without
// parsing anything; only the cards that changed are parsed. A big hand where one card got picked costs one parse, not fifty.
function patchCards(wrap, html, byId, wire = true, parts = null) {
  const old = new Map(); for (const el of wrap.children) if (el.dataset && el.dataset.id) old.set(el.dataset.id, el);
  let next;
  if (parts) {
    next = parts.map(h => {
      const m = /data-id="([^"]*)"/.exec(h), o = m && old.get(m[1]);
      if (o && o.__html === h && !o.classList.contains('lifted')) return o;
      PARSE.innerHTML = h; const n = PARSE.content.firstElementChild; n.__html = h; return n;
    });
  } else { PARSE.innerHTML = html; next = [...PARSE.content.children]; }
  const keep = [];
  for (const n of next) {
    const id = n.dataset && n.dataset.id;
    const o = id ? old.get(id) : null;
    if (o === n) { old.delete(id); keep.push(o); continue; }
    if (o && !o.classList.contains('lifted') && cardSig(o) === cardSig(n)) {
      o.__html = n.__html;
      old.delete(id);
      const cls = n.className.replace(/\bnew\b/, '').trim();
      const want = o.classList.contains('flipin') ? cls + ' flipin' : cls;
      if (o.className !== want) o.className = want;
      const st = n.getAttribute('style').replace(/;?animation-delay:[^;]*/, '');
      if (o.getAttribute('style') !== st) o.setAttribute('style', st);
      keep.push(o);
    } else keep.push(n);
  }
  for (const el of old.values()) el.remove();
  for (const el of [...wrap.children]) if ((!el.dataset || !el.dataset.id) && !keep.includes(el)) el.remove(); // row breaks are rebuilt
  let prev = null;
  for (const el of keep) {
    const at = prev ? prev.nextSibling : wrap.firstChild;
    if (el !== at) wrap.insertBefore(el, at);
    prev = el;
  }
  if (wire) for (const el of keep) if (el.dataset && el.dataset.id) attachCard(el, byId[el.dataset.id]);
}
// Patch a list of keyed blocks (seats, badges): a block is replaced only when its own markup changed.
function patchBlocks(wrap, items) {
  const old = new Map(); for (const el of wrap.children) if (el.__key != null) old.set(el.__key, el);
  const keep = items.map(({ key, html }) => {
    const o = old.get(key);
    if (o && o.__html === html) { old.delete(key); return o; }
    PARSE.innerHTML = html; const n = PARSE.content.firstElementChild; n.__key = key; n.__html = html; return n;
  });
  for (const el of [...wrap.children]) if (!keep.includes(el)) el.remove();
  let prev = null;
  for (const el of keep) { const at = prev ? prev.nextSibling : wrap.firstChild; if (el !== at) wrap.insertBefore(el, at); prev = el; }
  wrap.__html = null;
}

// the card behind an element is looked up when it is touched: elements are reused across states, card objects are not
function attachCard(el, card) {
  el._card = card;
  if (el._wired) return; el._wired = true;
  el.addEventListener('contextmenu', e => { e.preventDefault(); if (!confessSel) toggleSel(el._card); });
  el.addEventListener('pointermove', e => { if (!dragging && !el.parentNode.classList.contains('big')) JUICE.tilt(el, e); });
  el.addEventListener('pointerleave', () => JUICE.untilt(el));
  el.onpointerdown = e => {
    if (e.button > 0) return;
    const card = el._card; if (!card) return;
    const sx = e.clientX, sy = e.clientY, r0 = el.getBoundingClientRect();
    let ghost = null, els = null, rects = null, src = -1, target = -1, order = null, lastOrder = -Infinity;
    const handBox = $('hand').getBoundingClientRect();
    const inHand = y => y > handBox.top - 40;
    try { el.setPointerCapture(e.pointerId); } catch (x) {}
    // the dragged card hangs from the pointer: it trails a little behind and swings with the motion
    const grab = { x: sx - r0.left, y: sy - r0.top }, lever = (0.5 - grab.y / r0.height) * 2;
    let want = { x: r0.left, y: r0.top }, pos = { x: r0.left, y: r0.top }, swing = 0, raf = 0;
    const paint = () => {
      const px = pos.x;
      pos.x += (want.x - pos.x) * 0.42; pos.y += (want.y - pos.y) * 0.42;
      const vx = pos.x - px;
      swing += (Math.max(-24, Math.min(24, vx * 1.6 * lever)) - swing) * 0.22;
      if (ghost) ghost.style.transform = `translate(${pos.x}px,${pos.y}px) rotate(${swing.toFixed(2)}deg) scale(1.06)`;
      raf = requestAnimationFrame(paint);
    };
    const move = ev => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!ghost && Math.hypot(dx, dy) > 10) {
        dragging = true;
        els = [...$('hand').querySelectorAll('.card[data-id]')]; rects = slotRects(els); src = target = els.indexOf(el);
        $('hand').classList.add('reorder'); TIP.hide(); JUICE.untilt(el);
        const w = document.createElement('div'); w.innerHTML = el.outerHTML; ghost = w.firstElementChild;
        ghost.className = ghost.className.replace(/\b(ok|dim|jump|new|flipin|nope)\b/g, '') + ' held';
        Object.assign(ghost.style, { margin: '0', width: r0.width + 'px', height: r0.height + 'px', zIndex: 99, transition: 'none', transformOrigin: `${grab.x}px ${grab.y}px` });
        $('fx').appendChild(ghost); el.classList.add('lifted');
        raf = requestAnimationFrame(paint);
      }
      if (ghost) {
        want = { x: r0.left + dx, y: r0.top + dy };
        const onPile = (usable(card) || (selIds.includes(card.id) && selInfo() && selInfo().ok)) && overDiscard(ev.clientX, ev.clientY);
        $('discard').classList.toggle('drop', onPile);
        const t2 = !onPile && inHand(ev.clientY) && src >= 0 ? nearestSlot(rects, r0.left + dx + r0.width / 2, r0.top + dy + r0.height / 2) : src;
        if (t2 !== target) {
          target = t2; order = previewOrder(els, rects, src, target);
          if (target !== src) SFX.play('click');
          const now = performance.now();
          if (conn === online && order && now - lastOrder >= 90) {
            lastOrder = now;
            const shown = new Set(els.map(node => String(node._card?.wid)));
            const preview = order.map(i => els[i]._card?.wid);
            const cards = sortedHand(G.players[ME].hand).map(c => shown.has(String(c.wid)) ? preview.shift() : c.wid);
            online.order(cards, [...new Set([card.wid, ...selCards().map(c => c.wid)])]);
          }
        }
      }
    };
    const up = ev => {
      cancelAnimationFrame(raf);
      el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      $('discard').classList.remove('drop');
      if (ghost) {
        const gr = ghost.getBoundingClientRect(), hit = ev.type === 'pointerup' && (usable(card) || (selIds.includes(card.id) && selInfo() && selInfo().ok)) && overDiscard(ev.clientX, ev.clientY);
        dragging = false; $('hand').classList.remove('reorder');
        if (hit) { clearPreview(els); ghost.remove(); el.classList.remove('lifted'); if (selIds.includes(card.id) && selIds.length > 1) playSelection(); else { selIds = []; useCard(card, el, gr); } }
        else if (ev.type === 'pointerup' && target >= 0 && target !== src) {
          // keep the new order: from now on the hand is sorted by hand
          const visible = new Set(els.map(node => node.dataset.id));
          const rearranged = order.map(i => els[i].dataset.id);
          handOrder = sortedHand(G.players[ME].hand).map(c => visible.has(String(c.id)) ? rearranged.shift() : String(c.id));
          sortMode = 'manual';
          const dest = rects[target];
          const a = ghost.animate([{ transform: ghost.style.transform }, { transform: `translate(${dest.l}px,${dest.t}px)` }], { duration: 90, easing: 'ease-out' });
          a.onfinish = () => { ghost.remove(); clearPreview(els); el.classList.remove('lifted'); render(); };
        }
        else {
          clearPreview(els);
          const a = ghost.animate([{ transform: ghost.style.transform }, { transform: `translate(${r0.left}px,${r0.top}px)` }], { duration: 110, easing: 'ease-out' });
          a.onfinish = () => { ghost.remove(); el.classList.remove('lifted'); render(); };
        }
      } else if (ev.type === 'pointerup' && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 10) {
        if (confessSel) { if (!card.lock) { confessSel.has(card.id) ? confessSel.delete(card.id) : confessSel.size < 3 && confessSel.add(card.id); SFX.play('click'); render(); } }
        else if (selMode || ev.ctrlKey || ev.shiftKey || ev.metaKey) toggleSel(card);
        // picked with the right button, thrown with the left: a click on a picked card plays them all
        else if (selIds.includes(card.id)) playSelection();
        else { if (selIds.length) { selIds = []; } useCard(card, el); }
      }
    };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  };
}
let canDrawNow = false, canPassNow = false;
// the deck draws; after a draw with a card you'd rather keep, the same click passes
function drawNow() { if (busy || !G) return; if (canDrawNow) act('draw'); else if (canPassNow) act('pass'); }
$('btnGamble').onclick = async () => {
  if (busy || !G || !controls?.canGamble) return;
  const rivals = G.players.map((p, i) => i).filter(i => i !== ME && !G.players[i].out);
  const tg = rivals.length > 1 ? await pickTarget(t('gambleQ'), t('gambleSub', G.pending), t('cancel')) : rivals[0];
  if (tg === null || tg === undefined || !controls?.canGamble) return;
  act('gamble', { target: tg });
};
$('drawpile').onclick = drawNow;
$('btnSelect').onclick = () => { selMode = !selMode; if (!selMode) selIds = []; SFX.play('click'); render(); };
$('discard').addEventListener('click', () => { if (selIds.length) playSelection(); });
$('handPrev').onclick = () => { if (!dragging && handPage > 0) { handPage--; TIP.hide(); render(); } };
$('handNext').onclick = () => { if (!dragging && handPage + 1 < handPageCount) { handPage++; TIP.hide(); render(); } };
$('btnSort').onclick = () => { handPage = 0; sortMode = { color: 'value', value: 'none', none: 'color', manual: 'color' }[sortMode]; render(); };
$('btnQuit').onclick = () => {
  openModal(`<h2>${t('leaveQ')}</h2><p>${t('leaveSub')}</p><button class="btn primary wide" id="lvGo">${t('leave')}</button><button class="textlink" id="lvNo">${t('stay')}</button>`);
  $('lvGo').onclick = leaveRoom; $('lvNo').onclick = closeModal;
};
$('btnMenu').onclick = () => {
  openModal(`<h2>${t('menu')}</h2><div class="list">
    <button id="mSort"><span>${t('menuSort')}</span><span class="mono">${t('sort', sortMode).split(': ')[1]}</span></button>
    <button id="mLog"><span>${t('menuLog')}</span><span class="mono">${G ? G.log.length : 0}</span></button>
    <button id="mRules"><span>${t('menuRules')}</span><span class="mono"></span></button>
    ${G && G.rules.combos !== false && G.rules.multi ? `<button id="mCombos"><span>${t('refTitle')}</span><span class="mono"></span></button>` : ''}
    <button id="mSound"><span>${t('menuSound')}</span><span class="mono">${S.sound ? t('on') : t('off')}</span></button>
    <button id="mLang"><span>${t('menuLang')}</span><span class="mono">${LANGS[LANG]}</span></button>
    <button id="mSet"><span>${t('settings')}</span><span class="mono">${UI_ICON.gear}</span></button>
    <button id="mLeave"><span>${t('menuLeave')}</span><span class="mono">${esc(roomCode)}</span></button>
  </div>${musicControls()}<button class="btn wide" id="mClose">${t('close')}</button>`);
  updateMusicControls();
  $('mSort').onclick = () => { $('btnSort').onclick(); $('btnMenu').onclick(); };
  $('mLog').onclick = () => {
    openModal(`<h2>${t('gameLog')}</h2><div class="rulestext mono" style="font-size:12px;line-height:16px">${(G ? G.log.slice(-60).reverse() : []).map(l => `<div style="padding:8px 0;border-top:1px solid var(--line)">${esc(youify(fmtLog(l)))}</div>`).join('')}</div><button class="btn wide" id="mClose2">${t('close')}</button>`);
    $('mClose2').onclick = closeModal;
  };
  $('mRules').onclick = showRules;
  if ($('mCombos')) $('mCombos').onclick = () => { openModal(`<div class="comboref modalref">${comboRefHTML(null)}</div><button class="btn wide" id="mClose3" style="margin-top:16px">${t('close')}</button>`); $('mClose3').onclick = closeModal; };
  $('mSound').onclick = () => { $('btnSound').onclick(); $('btnMenu').onclick(); };
  $('mLang').onclick = () => { setLang(LANG === 'ru' ? 'en' : 'ru'); $('btnMenu').onclick(); };
  $('mSet').onclick = showSettings;
  $('mLeave').onclick = () => $('btnQuit').onclick();
  $('mClose').onclick = closeModal;
};
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('modal').classList.contains('hidden')) { e.preventDefault(); dismissModal(); return; }
  if (!G || $('game').classList.contains('hidden') || e.target.closest?.('button, input, select, textarea')) return;
  if (e.key === 'd' || e.key === ' ') { e.preventDefault(); drawNow(); }
});


// ================= RENDER =================
// card symbols: crude stencilled icons, drawn as thick strokes and roughened by an SVG filter
const ICON = (() => {
  const s = (inner, fill) => `<svg class="ico" viewBox="0 0 24 24" fill="${fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2.7" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">${inner}</svg>`;
  const dot = (x, y, r = 1.7) => `<circle cx="${x}" cy="${y}" r="${r}" fill="currentColor" stroke="none"/>`;
  return {
    skip: s('<circle cx="12" cy="12" r="8.3"/><path d="M6.3 17.7 17.7 6.3"/>'),
    skipall: s('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.2"/><path d="M5.6 18.4 18.4 5.6"/>'),
    rev: s('<path d="M3.5 8.5h14M14 5l3.5 3.5L14 12M20.5 15.5h-14M10 12l-3.5 3.5L10 19"/>'),
    flip: s('<path d="M18.5 13A6.8 6.8 0 1 1 16.5 7.2"/><path d="M18.5 3.5v5h-5"/>'),
    dflip: s('<circle cx="12" cy="12" r="8.2"/><path d="M12 3.8a8.2 8.2 0 0 0 0 16.4z" fill="currentColor"/>'),
    mirror: s('<path d="M10.5 5 3.5 12l7 7zM13.5 5l7 7-7 7z"/>'),
    shield: s('<path d="M8 3 4.5 6.5V21h15V6.5L16 3l-4 4.5z"/><path d="M12 7.5V21M8.5 13h1M14.5 13h1"/>'),
    lucky: s('<path d="M6 20.5V11a6 6 0 0 1 12 0v9.5"/><path d="M3.5 20.5h5M15.5 20.5h5"/>' + dot(6, 13.5, 1) + dot(18, 13.5, 1) + dot(8, 8, 1) + dot(16, 8, 1)),
    glass: s('<path d="M5.5 3.5h13l-2.3 17H7.8z"/><path d="M6.8 10h10.4"/>'),
    spin: s('<path d="M4 4h16v16H4zM9.3 4v16M14.7 4v16"/>'),
    loan: s('<path d="M16.5 7.5C15.5 5 8.5 5 8 8.3S16.5 11.5 16.5 15.5 9 19.5 7.5 16.5M12 2.5v19"/>'),
    gift: s('<ellipse cx="12" cy="6.5" rx="7" ry="2.6"/><path d="M5 6.5v11c0 1.5 3.1 2.7 7 2.7s7-1.2 7-2.7v-11M5 12c0 1.5 3.1 2.7 7 2.7s7-1.2 7-2.7"/>'),
    echo: s('<path d="M4 5.5l6.5 6.5L4 18.5M12.5 5.5 19 12l-6.5 6.5"/>'),
    freeze: s('<circle cx="7" cy="15" r="4.5"/><circle cx="17" cy="15" r="4.5"/><path d="M9 9.5l3-3 3 3"/>'),
    bomb: s('<path d="M4.5 21V10l2.5-5 2.5 5v11zM14.5 21V10l2.5-5 2.5 5v11z"/><path d="M4.5 16.5h5M14.5 16.5h5"/>'),
    lead: s('<path d="M3 19.5 6.5 9h11L21 19.5z"/><path d="M9 9 10 5h4l1 4"/>'),
    leech: s('<path d="M5 18c-1.8-3 .2-6.5 3.5-6.5s3.4 3.5 6.5 3.5 4.5-3 3-6"/>' + dot(18.4, 7.4, 2.3) + dot(5.6, 18.6, 1.6)),
    fuse: s('<circle cx="10" cy="14.5" r="6.2"/><path d="M14.5 10 17 7.5M17 7.5c1-1.6 2.4-1.6 3.5-.5"/>' + dot(21, 4.2, 1.5)),
    d6: s('<path d="M4 4h16v16H4z"/>' + dot(8.3, 8.3) + dot(15.7, 15.7) + dot(15.7, 8.3) + dot(8.3, 15.7) + dot(12, 12)),
    pill: s('<path d="M3 6.5h18v11H3z"/><path d="M7 10.5h3M12.5 10.5h4.5M7 14h10" stroke-width="1.8"/>'),
    maze: s('<path d="M12 12.2a1.8 1.8 0 1 1 1.8 1.8 4 4 0 1 1-4-4 6.2 6.2 0 1 1 6.2 6.2 8.2 8.2 0 0 1-8.2-8.2"/>'),
    deal: s('<path d="M5.5 3h9.5l3.5 3.5V21h-13z"/><path d="M8.5 9h7M8.5 12.5h7"/>' + dot(14.5, 17, 2.2)),
    swind: s('<path d="M3 9h11a3 3 0 1 0-3-3M3 14h15a3 3 0 1 1-3 3M3 19h6"/>'),
    sacr: s('<path d="M12 2.5v13M8.5 6.5h7M9.5 15.5h5L12 21.5z"/>'),
    djoker: s('<path d="M6 20 4 6l5 5 3-7 3 7 5-5-2 14z"/><path d="M8 4 6.5 1.5M16 4l1.5-2.5"/>' + dot(12, 15, 1.6)),
  };
})();
// deals: small stencil glyphs, one per deal
const DEAL_ICON = (() => {
  // 32×32 stencil glyphs: a solid body (fill) with cut-out detail (stroke in the paper colour), drawn for this game
  const s = inner => `<svg class="dico" viewBox="0 0 32 32" aria-hidden="true"><g fill="currentColor" stroke="none">${inner}</g></svg>`;
  const cut = d => `<path d="${d}" fill="none" stroke="var(--cut, #000)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/>`;
  return {
    angel: s('<circle cx="16" cy="6" r="3.4"/><path d="M16 11c-3 0-4.5 2.2-4.5 5.2V28h9V16.2C20.5 13.2 19 11 16 11z"/><path d="M11.5 15C6 14 3 17 2 21c4 0 7-1 9.5-3zM20.5 15c5.5-1 8.5 2 9.5 6-4 0-7-1-9.5-3z"/>' + cut('M14 20h4M16 18v6')),
    demon: s('<path d="M16 4 4 28h24z"/><path d="M8 7c-1 3 0 5 2 6M24 7c1 3 0 5-2 6" stroke="currentColor" stroke-width="2.4" fill="none"/>' + cut('M12.5 20.5l2 1.5M19.5 20.5l-2 1.5M13 25h6')),
    rosary: s('<circle cx="16" cy="4" r="1.8"/><circle cx="21.5" cy="5.8" r="1.8"/><circle cx="25" cy="10.5" r="1.8"/><circle cx="25" cy="16" r="1.8"/><circle cx="10.5" cy="5.8" r="1.8"/><circle cx="7" cy="10.5" r="1.8"/><circle cx="7" cy="16" r="1.8"/><circle cx="10.5" cy="20.5" r="1.8"/><circle cx="21.5" cy="20.5" r="1.8"/><path d="M14.6 22h2.8v3h3v2.6h-3V31h-2.8v-3.4h-3V25h3z"/>'),
    candle: s('<path d="M16 2c3 3.4 3.4 6.2 0 8.4-3.4-2.2-3-5 0-8.4z"/><rect x="11.5" y="12" width="9" height="15" rx="1"/><path d="M8 27h16v3H8z"/>' + cut('M14 16v7M18 14c0 2-1 2-1 4')),
    wind: s('<path d="M3 10h14a4 4 0 1 0-4-4h-3a7 7 0 1 1 7 7H3zM3 16h20a4.5 4.5 0 1 1-4.5 4.5h3a1.5 1.5 0 1 0 1.5-1.5H3zM3 22h9v3H3z"/>'),
    halo: s('<path d="M16 3c7 0 12 1.8 12 4.2S23 11.4 16 11.4 4 9.6 4 7.2 9 3 16 3zm0 2.6c-5 0-8.4 1-8.4 1.6S11 8.8 16 8.8s8.4-1 8.4-1.6S21 5.6 16 5.6z" fill-rule="evenodd"/><path d="M16 14c-4 0-6.5 3-6.5 7v9h13v-9c0-4-2.5-7-6.5-7z"/>' + cut('M13 22h6')),
    confess: s('<path d="M5 3h22v26H5z"/>' + cut('M16 3v26M5 11h22M5 19h22M9 7h3M20 7h3') + '<circle cx="16" cy="30" r="1.2"/>'),
    alms: s('<path d="M3 15h26c0 6.5-5.8 11-13 11S3 21.5 3 15z"/><circle cx="16" cy="9" r="4.5"/><circle cx="23" cy="11" r="2.5"/>' + cut('M14.5 9h3M16 7.5v3M8 19c2 2.6 5 3.6 8 3.6')),
    clean: s('<path d="M16 2c6 7 9 11.5 9 16a9 9 0 0 1-18 0c0-4.5 3-9 9-16z"/>' + cut('M12 19c0 2.6 1.8 4.4 4 4.8')),
    grace: s('<path d="M27 3C14 3 6.5 10 5 25l2.5 2C9.5 18 15 12 21 10c-4 3.5-6.5 7.5-7.5 12.5 7-1.5 12-7.5 13.5-19.5z"/>' + cut('M10 22l7-8')),
    guardian: s('<path d="M16 2 4.5 6.5V15c0 7 4.7 12.3 11.5 15 6.8-2.7 11.5-8 11.5-15V6.5z"/>' + cut('M10.5 15.5l4 4 7.5-8')),
    penance: s('<path d="M9 13V9a7 7 0 0 1 14 0v4h-3V9a4 4 0 0 0-8 0v4z"/><rect x="6" y="13" width="20" height="16" rx="1.5"/>' + cut('M16 18v5M13 27h6')),
    double: s('<path d="M7 29 22 5l3 2L10 31zM12 29 27 5l3 2L15 31z" opacity=".95"/><path d="M4 22h9v3H4zM9 22h9v3H9z"/>'),
    usury: s('<ellipse cx="16" cy="7" rx="10" ry="3.5"/><path d="M6 7v4.5c0 1.9 4.5 3.5 10 3.5s10-1.6 10-3.5V7c0 1.9-4.5 3.5-10 3.5S6 8.9 6 7zM6 13.5V18c0 1.9 4.5 3.5 10 3.5s10-1.6 10-3.5v-4.5c0 1.9-4.5 3.5-10 3.5s-10-1.6-10-3.5zM6 20v4.5C6 26.4 10.5 28 16 28s10-1.6 10-3.5V20c0 1.9-4.5 3.5-10 3.5S6 21.9 6 20z"/>'),
    chains: s('<path d="M3 13a5 5 0 0 1 5-5h6a5 5 0 0 1 0 10H8a5 5 0 0 1-5-5zm5-2.2a2.2 2.2 0 0 0 0 4.4h6a2.2 2.2 0 0 0 0-4.4z" fill-rule="evenodd"/><path d="M13 19a5 5 0 0 1 5-5h6a5 5 0 0 1 0 10h-6a5 5 0 0 1-5-5zm5-2.2a2.2 2.2 0 0 0 0 4.4h6a2.2 2.2 0 0 0 0-4.4z" fill-rule="evenodd"/>'),
    blood: s('<path d="M16 2c6.5 7.5 9.5 12 9.5 16.5a9.5 9.5 0 0 1-19 0C6.5 14 9.5 9.5 16 2z"/><circle cx="25" cy="27" r="2.5"/><circle cx="6" cy="29" r="1.6"/>' + cut('M11.5 18.5c0 2.6 1.8 4.6 4.5 5')),
    bail: s('<circle cx="10" cy="16" r="7"/><path d="M15 14.5h14v3h-3v4h-3v-4h-2v3h-3v-3h-3z"/>' + cut('M10 16m-2.4 0a2.4 2.4 0 1 0 4.8 0 2.4 2.4 0 1 0-4.8 0')),
    devour: s('<path d="M3 6h26v8c0 3-2 5-5 5H8c-3 0-5-2-5-5z"/><path d="M5 21h22v3c0 3-2.5 5-5.5 5h-11C7.5 29 5 27 5 24z"/>' + cut('M7 6l2.5 6L12 6l2.5 6L17 6l2.5 6L22 6l2.5 6L27 6M8 29l2-5 2 5 2-5 2 5 2-5 2 5 2-5 2 5')),
    mark: s('<path d="M16 2a14 14 0 1 0 0 28 14 14 0 0 0 0-28zm0 4.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19z" fill-rule="evenodd"/><circle cx="16" cy="16" r="3"/><path d="M14.8 0h2.4v8h-2.4zM14.8 24h2.4v8h-2.4zM0 14.8h8v2.4H0zM24 14.8h8v2.4h-8z"/>'),
    drum: s('<path d="M16 3a13 13 0 1 0 0 26 13 13 0 0 0 0-26z"/>' + cut('M16 9.2m-2.6 0a2.6 2.6 0 1 0 5.2 0 2.6 2.6 0 1 0-5.2 0M22.2 13.8m-2.6 0a2.6 2.6 0 1 0 5.2 0 2.6 2.6 0 1 0-5.2 0M9.8 13.8m-2.6 0a2.6 2.6 0 1 0 5.2 0 2.6 2.6 0 1 0-5.2 0M19.8 21.4m-2.6 0a2.6 2.6 0 1 0 5.2 0 2.6 2.6 0 1 0-5.2 0M12.2 21.4m-2.6 0a2.6 2.6 0 1 0 5.2 0 2.6 2.6 0 1 0-5.2 0') + '<circle cx="16" cy="16" r="1.4"/>'),
    puppet: s('<path d="M4 3h24v3H4z"/><path d="M9 6h1v9H9zM22 6h1v7h-1zM15.5 6h1v5h-1z"/><circle cx="16" cy="14" r="3.2"/><path d="M12.5 18.5h7l1.5 6h-3v6h-1.5v-5h-1v5H14v-6h-3z"/><path d="M8.5 15h2l2 4-1.6.8zM21.5 13h2l-2.5 6.5-1.6-.8z"/>'),
    exactor: s('<path d="M6 3h16l4 4v22H6z"/><path d="M20 15c3 0 5 2 5 5s-2 5-5 5" stroke="currentColor" stroke-width="2.4" fill="none"/>' + cut('M10 9h9M10 13h6M10 17h4M19 25l-2 3')),
    nighttax: s('<path d="M14 2A10 10 0 1 0 23 15 8 8 0 1 1 14 2z"/><circle cx="22" cy="23" r="7"/>' + cut('M22 19.5v7M19.8 21.2c.8-1 4.4-1 4.4.6s-4.4 1.2-4.4 2.8 3.6 1.6 4.4.6')),
    desecrate: s('<path d="M16 3c7 0 12 1.8 12 4.2S23 11.4 16 11.4 4 9.6 4 7.2 9 3 16 3zm0 2.6c-5 0-8.4 1-8.4 1.6S11 8.8 16 8.8s8.4-1 8.4-1.6S21 5.6 16 5.6z" fill-rule="evenodd"/><path d="M14.5 13h3v4h5v3h-5v10h-3V20h-5v-3h5z"/>' + cut('M17 3l-2 3 2 2')),
    sharp: s('<path d="M2 16S7.5 6 16 6s14 10 14 10-5.5 10-14 10S2 16 2 16z"/>' + cut('M16 16m-4.6 0a4.6 4.6 0 1 0 9.2 0 4.6 4.6 0 1 0-9.2 0') + '<circle cx="16" cy="16" r="1.8" fill="var(--cut, #000)" opacity=".55"/>')
  };
})();
const isLightDeal = d => LIGHT_DEALS.includes(d);
// iron chain across a locked card: links alternate face-on and edge-on, shaded like old metal
// chained cards: thorned chains of black iron lit red from behind, thin barbed strands under them, a red haze over the face
const CHAIN_SVGS = [0, 1, 2, 3, 4, 5].map(vi => {
  let seed = 977 + vi * 7919; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const thorns = (len, w, n, big) => { let d = ''; for (let i = 0; i < n; i++) { const x = -len / 2 + (i + 0.5) * len / n + (r() - 0.5) * 2, side = i % 2 ? 1 : -1, h = big * (0.6 + r() * 0.8), lean = (r() - 0.5) * 3; d += `M${(x - 1.4).toFixed(1)} ${(side * w).toFixed(1)}L${(x + lean).toFixed(1)} ${(side * (w + h)).toFixed(1)}L${(x + 1.4).toFixed(1)} ${(side * w).toFixed(1)}Z`; } return d; };
  // a heavy chain: long rectangular links, alternating face-on and edge-on, thorns on the edge-on ones
  const chain = (x0, y0, ang, n, L, W, t) => {
    const rad = ang * Math.PI / 180, dx = Math.cos(rad) * L * 0.78, dy = Math.sin(rad) * L * 0.78; let body = '', rim = '';
    for (let k = 0; k < n; k++) {
      const x = (x0 + k * dx).toFixed(1), y = (y0 + k * dy).toFixed(1), g = `transform="translate(${x} ${y}) rotate(${ang})"`;
      if (k % 2 === 0) {
        const sh = `<rect x="${-L / 2}" y="${-W / 2}" width="${L}" height="${W}" rx="1.6" fill="none" stroke-width="${t}"/>`;
        body += `<g ${g}>${sh}</g>`; rim += `<g ${g}>${sh}</g>`;
      } else {
        const bar = `<rect x="${-L / 2}" y="${-t * 0.6}" width="${L}" height="${t * 1.2}" rx="1"/>`, th = `<path d="${thorns(L * 0.9, t * 0.6, 5, t * 1.5)}"/>`;
        body += `<g ${g}>${bar}${th}</g>`; rim += `<g ${g}>${bar}${th}</g>`;
      }
    }
    return { body, rim };
  };
  // a thin barbed strand
  const strand = (x0, y0, x1, y1, n) => {
    const len = Math.hypot(x1 - x0, y1 - y0), ang = Math.atan2(y1 - y0, x1 - x0) * 180 / Math.PI;
    return `<g transform="translate(${((x0 + x1) / 2).toFixed(1)} ${((y0 + y1) / 2).toFixed(1)}) rotate(${ang.toFixed(1)})"><rect x="${(-len / 2).toFixed(1)}" y="-.5" width="${len.toFixed(1)}" height="1"/><path d="${thorns(len, 0.4, n, 2.6)}"/></g>`;
  };
  // never a mirrored pair: each variant throws its chains at its own angles and offsets
  const rr = (a, b) => a + r() * (b - a), flip = vi % 2 ? -1 : 1, cx = x => flip > 0 ? x : 100 - x, ca = a => flip > 0 ? a : -180 - a;
  const a1 = rr(-72, -48), a2 = rr(-150, -128), t1 = rr(4.6, 5.4), t2 = rr(2.8, 3.6);
  const A = chain(cx(rr(-14, 18)), rr(150, 175), ca(a1), 14, rr(23, 27), rr(9.5, 11), t1);
  const B = chain(cx(rr(95, 118)), rr(118, 150), ca(a2), 13, rr(15, 18), rr(6, 7.5), t2);
  const wires = strand(-5, rr(20, 60), 105, rr(40, 90), 26) + strand(-5, rr(90, 130), 105, rr(70, 120), 24) + (r() < 0.6 ? strand(rr(10, 90), -5, rr(0, 100), 152, 22) : '');
  return `<svg viewBox="0 0 100 147" preserveAspectRatio="none"><defs><filter id="chg" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.1"/></filter></defs>`
    + `<g fill="#1a0507" stroke="#1a0507" opacity=".8">${wires}</g><g fill="#c41e1a" stroke="none" opacity=".35" filter="url(#chg)">${wires}</g>`
    + `<g stroke="#e0281e" fill="#e0281e" opacity=".75" filter="url(#chg)">${A.rim}${B.rim}</g>`
    + `<g stroke="#0c0203" fill="#0c0203">${A.body}${B.body}</g>`
    + `<g stroke="#ff4a30" fill="none" stroke-width=".35" opacity=".55">${A.rim.replace(/stroke-width="[\d.]+"/g, '')}${B.rim.replace(/stroke-width="[\d.]+"/g, '')}</g></svg>`;
});
// ================= BAKED TEXTURES =================
// SVG noise (feTurbulence) and the blurred chains are drawn once into bitmaps at start-up; the page then only
// stretches pictures instead of re-running SVG filters for every card size (Firefox re-ran them constantly).
const BAKE = (() => {
  const svgURL = svg => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  const toBlobURL = (src, w, h) => new Promise(res => {
    const img = new Image();
    img.onload = () => { try { const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h); c.toBlob(b => res(b ? URL.createObjectURL(b) : null), 'image/png'); } catch (e) { res(null); } };
    img.onerror = () => res(null);
    img.src = src;
  });
  const set2x = typeof CSS !== 'undefined' && CSS.supports && CSS.supports('background-image', 'image-set(url("x.png") 2x)');
  const css = []; const st = document.createElement('style'); document.head.appendChild(st);
  // chains: vector first (works at once), bitmaps as soon as they're baked
  CHAIN_SVGS.forEach((svg, k) => { css[k] = `.card .chainov.cv${k}{background:url("${svgURL(svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '))}") center / 100% 100% no-repeat}`; });
  st.textContent = css.join('\n');
  async function run() {
    const root = getComputedStyle(document.documentElement);
    for (const v of ['--noise', '--tex-grain', '--tex-ink', '--tex-static']) {
      const m = /url\(\s*"(data:[\s\S]*)"\s*\)\s*$/.exec(root.getPropertyValue(v).trim()); if (!m) continue;
      const src = m[1], w = +(/width=(?:'|%27)(\d+)/.exec(src) || [])[1] || 140, h = +(/height=(?:'|%27)(\d+)/.exec(src) || [])[1] || w;
      const u = await toBlobURL(src, set2x ? w * 2 : w, set2x ? h * 2 : h); if (!u) continue;
      document.documentElement.style.setProperty(v, set2x ? `image-set(url("${u}") 2x)` : `url("${u}")`);
    }
    await Promise.all(CHAIN_SVGS.map(async (svg, k) => {
      const u = await toBlobURL(svgURL(svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')), 300, 441);
      if (u) css[k] = `.card .chainov.cv${k}{background:url("${u}") center / 100% 100% no-repeat}`;
    }));
    st.textContent = css.join('\n');
  }
  (window.requestIdleCallback || (f => setTimeout(f, 200)))(() => run());
  return { run };
})();
const LOCK_SVG = `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" fill="#120807" stroke="#2c1612" stroke-width="3"/>`
  + `<g fill="#120807" stroke="#2c1612" stroke-width="1.2">${[0, 45, 90, 135, 180, 225, 270, 315].map(a => `<path transform="rotate(${a} 20 20)" d="M18 4.5 20 0l2 4.5z"/>`).join('')}</g>`
  + `<circle cx="20" cy="20" r="12.5" fill="none" stroke="#ff3d1a" stroke-width="1" stroke-opacity=".8"/>`
  + `<g stroke="#ff3d1a" stroke-width=".8" stroke-opacity=".7">${[0, 60, 120, 180, 240, 300].map(a => `<path transform="rotate(${a} 20 20)" d="M20 7.5v3"/>`).join('')}</g></svg>`;
// [center, label key, small] ; text faces stay typographic, action faces use the vector icons
const SYM = {
  skip: [ICON.skip], rev: [ICON.rev], d1: ['+1'], d2: ['+2'], d4: ['+4'], d5: ['+5'], flip: [ICON.flip, 'flip'], dflip: [ICON.dflip, 'dflip', 'sm'],
  discall: ['ALL', 'discall', 'sm'], skipall: [ICON.skipall, 'skipall'], mirror: [ICON.mirror, 'mirror'], shield: [ICON.shield, 'shield'],
  wild: ['', 'wild'], wd2: ['+2'], wd4: ['+4'], wrd4: ['+4', 'reverse'], wd6: ['+6'], wd10: ['+10'], wd15: ['+15'],
  wrd8: ['+8', 'reverse'], wdc: ['+?', 'wdc'], roul: ['?', 'roul'],
  mul2: ['×2', 'mult'], mul3: ['×3', 'mult3'], lucky: [ICON.lucky, 'lucky'], glass: [ICON.glass, 'glass'], spin: ['777', 'spin', 'sm'], loan: [ICON.loan, 'loan'],
  gift: [ICON.gift, 'gift'], echo: [ICON.echo, 'echo'], freeze: [ICON.freeze, 'freeze'], bomb: [ICON.bomb, 'bomb'],
  lead: [ICON.lead, 'lead'], leech: [ICON.leech, 'leech'], fuse: [ICON.fuse, 'fuse'],
  d6: [ICON.d6, 'd6'], pill: [ICON.pill, 'pill', 'sm'], maze: [ICON.maze, 'maze'], deal: [ICON.deal, 'deal'], swind: [ICON.swind, 'swind'], sacr: [ICON.sacr, 'sacr'], djoker: [ICON.djoker, 'djoker'],
};
const CORNER = { lead: ICON.lead, leech: ICON.leech, fuse: ICON.fuse, swind: ICON.swind, sacr: ICON.sacr, djoker: ICON.djoker, skip: ICON.skip, rev: ICON.rev, d1: '+1', d2: '+2', d4: '+4', d5: '+5', flip: ICON.flip, dflip: ICON.dflip, discall: 'A', skipall: ICON.skipall, mirror: ICON.mirror, shield: ICON.shield, wild: 'W', wd2: '+2', wd4: '+4', wrd4: '+4', wd6: '+6', wd10: '+10', wd15: '+15', wrd8: '+8', wdc: '+?', roul: '?', mul2: '×2', mul3: '×3', lucky: ICON.lucky, glass: ICON.glass, spin: '7', loan: '$', gift: ICON.gift, echo: ICON.echo, freeze: ICON.freeze, bomb: ICON.bomb, d6: ICON.d6, pill: ICON.pill, maze: ICON.maze, deal: ICON.deal };
// every colour also has a shape, so a card never depends on colour alone
const SUIT_PATH = { r: 'M5 1L9.5 9H.5z', y: 'M5 .8a4.2 4.2 0 1 0 0 8.4A4.2 4.2 0 1 0 5 .8z', g: 'M1.3 1.3h7.4v7.4H1.3z', b: 'M5 .3L9.7 5 5 9.7.3 5z',
  p: 'M3.6 .8h2.8v2.8h2.8v2.8H6.4v2.8H3.6V6.4H.8V3.6h2.8z', t: 'M5 .6a4.4 4.4 0 1 0 0 8.8A4.4 4.4 0 1 0 5 .6zm0 2.5a1.9 1.9 0 1 1 0 3.8 1.9 1.9 0 1 1 0-3.8z', o: 'M1 .8h8L5 5zM1 9.2h8L5 5z', v: 'M6.3.6A4.4 4.4 0 1 0 9.4 7.3 3.5 3.5 0 1 1 6.3.6z' };
const suitSVG = (c, cls = '') => SUIT_PATH[c] ? `<svg class="suit ${cls}" viewBox="0 0 10 10" aria-hidden="true"><path fill-rule="evenodd" d="${SUIT_PATH[c]}"/></svg>` : '';
// ================= WEAR: every card is beaten up in its own way =================
// A seeded random per card decides its stains, burns, creases, scratches, faded ink and the shape of its torn edge.
const WEAR = (() => {
  const N = 40; // torn-edge outlines, generated once
  const rng = seed => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  function outline(r) {
    // walk around a 100×147 card: fibrous roughness everywhere, rounded worn corners, a chipped corner now and then, a tear or two
    const W = 100, H = 147, pts = [];
    const rad = [0, 1, 2, 3].map(() => 3 + r() * 7), chip = [0, 1, 2, 3].map(() => r() < 0.28);
    const tears = []; const nT = r() < 0.55 ? 1 + (r() < 0.35 ? 1 : 0) : 0;
    for (let k = 0; k < nT; k++) tears.push({ side: Math.floor(r() * 4), at: 0.15 + r() * 0.7, w: 0.03 + r() * 0.07, d: 2.5 + r() * 6 });
    const rough = () => r() * 1.5;
    const edge = (x0, y0, x1, y1, nx, ny, side, len) => {
      const steps = Math.max(6, Math.round(len / 2.6));
      for (let k = 0; k <= steps; k++) {
        const t = k / steps; let d = rough();
        for (const tr of tears) if (tr.side === side) { const u = Math.abs(t - tr.at) / tr.w; if (u < 1) d += tr.d * (1 - u) * (0.6 + r() * 0.8); }
        pts.push([x0 + (x1 - x0) * t + nx * d, y0 + (y1 - y0) * t + ny * d]);
      }
    };
    const corner = (cx, cy, a0, i) => {
      const R = rad[i];
      if (chip[i]) { const c = R * 1.4; pts.push([cx + Math.cos(a0) * c, cy + Math.sin(a0) * c]); pts.push([cx + Math.cos(a0 + Math.PI / 2) * c, cy + Math.sin(a0 + Math.PI / 2) * c]); return; }
      for (let k = 0; k <= 5; k++) { const a = a0 + (Math.PI / 2) * (k / 5); const rr = R + rough() * 0.8; pts.push([cx + Math.cos(a) * rr - Math.cos(a0 + Math.PI / 4) * 0, cy + Math.sin(a) * rr]); }
    };
    // top edge, top-right corner, right edge, ... (corner centres sit inside by the radius)
    edge(rad[0], 0, W - rad[1], 0, 0, 1, 0, W); corner(W - rad[1], rad[1], -Math.PI / 2, 1);
    edge(W, rad[1], W, H - rad[2], -1, 0, 1, H); corner(W - rad[2], H - rad[2], 0, 2);
    edge(W - rad[2], H, rad[3], H, 0, -1, 2, W); corner(rad[3], H - rad[3], Math.PI / 2, 3);
    edge(0, H - rad[3], 0, rad[0], 1, 0, 3, H); corner(rad[0], rad[0], Math.PI, 0);
    return 'M' + pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L') + 'Z';
  }
  const css = [];
  for (let i = 0; i < N; i++) {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 147' preserveAspectRatio='none'><path d='${outline(rng(i * 7919 + 13))}' fill='black'/></svg>`;
    const url = `url("data:image/svg+xml;utf8,${svg.replace(/#/g, '%23')}")`;
    css.push(`.card.tear${i}{--tear:${url}}`);
  }
  // burn marks: ragged char in dark tones, drawn once as sprites. Soot halo, a scorched ring, a black char core with cracks;
  // the same core shape is the hole when a burn has eaten through the edge.
  const NB = 16;
  const blob = (r, R, rough, max = 48) => {
    const h = [1, 2, 3, 5, 8, 13].map(k => ({ k, a: r() * rough / Math.sqrt(k), p: r() * Math.PI * 2 }));
    const pts = []; for (let i = 0; i < 72; i++) { const t = i / 72 * Math.PI * 2; let f = 1; for (const q of h) f += q.a * Math.sin(q.k * t + q.p); f += (r() - 0.5) * rough * 0.2; const rr = Math.min(max, R * f); pts.push([50 + Math.cos(t) * rr, 50 + Math.sin(t) * rr]); }
    return 'M' + pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L') + 'Z';
  };
  const enc = svg => `url("data:image/svg+xml;utf8,${svg.replace(/#/g, '%23')}")`;
  for (let i = 0; i < NB; i++) {
    const r = rng(i * 104729 + 7);
    const halo = blob(r, 38, 0.3), scorch = blob(r, 31, 0.26, 44), sear = blob(r, 27, 0.22, 40), core = blob(r, 23, 0.32, 36);
    const cracks = Array.from({ length: 3 + Math.floor(r() * 3) }, () => { const a = r() * 6.28, l = 7 + r() * 10; let x = 50 + Math.cos(a) * 3, y = 50 + Math.sin(a) * 3, d = `M${x.toFixed(1)} ${y.toFixed(1)}`; for (let k = 0; k < 3; k++) { const b = a + (r() - 0.5) * 1.2; x += Math.cos(b) * l / 3; y += Math.sin(b) * l / 3; d += `L${x.toFixed(1)} ${y.toFixed(1)}`; } return d; }).join('');
    const mot = Array.from({ length: 5 }, (_, k) => { const a = r() * 6.28, d = r() * 11, sub = rng(i * 31 + k * 977 + 3); const pth = blob(sub, 4 + r() * 5, 0.5, 14).replace(/(\d+\.\d) (\d+\.\d)/g, (m, x, y) => (+x - 50 + 50 + Math.cos(a) * d).toFixed(1) + ' ' + (+y - 50 + 50 + Math.sin(a) * d).toFixed(1)); return `<path d='${pth}' fill='rgb(${k % 2 ? 70 : 24},${k % 2 ? 56 : 15},${k % 2 ? 46 : 10})' opacity='${k % 2 ? 0.45 : 0.5}'/>`; }).join('');
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs>`
      + `<radialGradient id='h'><stop offset='.5' stop-color='rgb(46,28,16)' stop-opacity='.6'/><stop offset='.78' stop-color='rgb(60,40,24)' stop-opacity='.28'/><stop offset='1' stop-color='rgb(44,30,20)' stop-opacity='0'/></radialGradient>`
      + `<clipPath id='k'><path d='${core}'/></clipPath></defs>`
      + `<path d='${halo}' fill='url(#h)'/><path d='${scorch}' fill='rgb(58,30,14)' opacity='.72'/><path d='${sear}' fill='rgb(92,44,18)' opacity='.42'/>`
      + `<path d='${core}' fill='rgb(40,26,18)' opacity='.82'/><g clip-path='url(#k)'>${mot}</g><path d='${core}' fill='none' stroke='rgb(22,13,8)' stroke-width='1.4' opacity='.75'/><path d='${cracks}' fill='none' stroke='rgb(96,80,66)' stroke-width='.6' stroke-linecap='round' opacity='.4'/></svg>`;
    const hole = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><path d='${core}' transform='translate(50 50) scale(.84) translate(-50 -50)' fill='black'/></svg>`;
    css.push(`.card .burn.b${i}{background-image:${enc(svg)}}`, `.card.burnt.h${i}{--hole:${enc(hole)}}`);
  }
  const st = document.createElement('style'); st.textContent = css.join('\n'); document.head.appendChild(st);
  const pc = x => (x * 100).toFixed(0) + '%';
  const memo = new Map();
  return function wear(key) {
    const hit = memo.get(key); if (hit) return hit;
    if (memo.size > 4000) memo.clear();
    const out = wearOf(key); memo.set(key, out); return out;
  };
  function wearOf(key) {
    let h = 2166136261; for (const ch of String(key)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
    const r = rng(h), on = p => (r() < p ? 1 : 0);
    const v = {
      '--rx': pc(0.15 + r() * 0.7), '--ry': pc(0.15 + r() * 0.7), '--rs': (14 + r() * 14).toFixed(0) + '%', '--ro': (on(0.45) * (0.18 + r() * 0.2)).toFixed(2),

      '--kx': pc(0.1 + r() * 0.8), '--ky': pc(0.1 + r() * 0.8), '--ks': (16 + r() * 22).toFixed(0) + '%', '--ko': (on(0.4) * (0.15 + r() * 0.25)).toFixed(2),
      // dried water: a pale patch where the dye lifted, with a darker tide line at its edge
      '--wx': pc(0.1 + r() * 0.8), '--wy': pc(0.1 + r() * 0.8), '--ws': (14 + r() * 24).toFixed(0) + '%', '--wh': (0.6 + r() * 0.8).toFixed(2), '--wo': (on(0.55) * (0.5 + r() * 0.5)).toFixed(2),
      '--vx': pc(0.1 + r() * 0.8), '--vy': pc(0.1 + r() * 0.8), '--vs': (8 + r() * 14).toFixed(0) + '%', '--vo': (on(0.3) * (0.5 + r() * 0.5)).toFixed(2),
      '--ca': (r() * 180).toFixed(0) + 'deg', '--cp': pc(0.25 + r() * 0.5), '--co': (on(0.38) * (0.25 + r() * 0.3)).toFixed(2),
      '--ga': (r() * 360).toFixed(0) + 'deg', '--go': (0.35 + r() * 0.4).toFixed(2),
      '--sx2': pc(r()), '--sy2': pc(r()), '--ss': (90 + r() * 120).toFixed(0) + '%', '--so': (r() * 0.25).toFixed(2),
      '--mx': (r() * 90).toFixed(0) + 'px', '--my': (r() * 90).toFixed(0) + 'px', '--ms': (60 + r() * 80).toFixed(0) + 'px'
    };
    // a burn is very rare; when it sits on the edge the card is burnt right through there
    const burn = r() < 0.03, edge = burn && r() < 0.55, bs = 0.24 + r() * 0.14;
    let bx = 0.2 + r() * 0.6, by = 0.2 + r() * 0.6, ax = 0, ay = 0;
    if (edge) {
      const sd = Math.floor(r() * 4), at = 0.15 + r() * 0.7, k = bs * 0.62;
      if (sd === 0) { bx = at; by = (r() - 0.5) * 0.03; ay = k / 1.47; } else if (sd === 2) { bx = at; by = 1 + (r() - 0.5) * 0.03; ay = -k / 1.47; }
      else if (sd === 1) { by = at; bx = 1 + (r() - 0.5) * 0.04; ax = -k; } else { by = at; bx = (r() - 0.5) * 0.04; ax = k; }
    }
    if (burn) Object.assign(v, { '--bx': pc(bx), '--by': pc(by), '--bxn': bx.toFixed(3), '--byn': by.toFixed(3), '--bs': bs.toFixed(3), '--bj': ((r() - 0.5) * 7).toFixed(1) + '%', '--bk': ((r() - 0.5) * 7).toFixed(1) + '%', '--ax': pc(bx + ax), '--ay': pc(by + ay) });
    const bi = Math.floor(r() * NB);
    return { cls: 'tear' + Math.floor(r() * N) + (edge ? ' burnt h' + bi : ''), burn: burn ? 'b' + bi : '', style: Object.entries(v).map(([k, x]) => k + ':' + x).join(';') };
  }
})();
// wear follows the real card: WID maps a hand card's local id to the server's card id
const WID = new Map();
function faceHTML(f, side, cls = '', id = '', wk = null) {
  // a drawn sprite from the asset pack wins; otherwise the built-in card
  const spr = ASSETS.cardClass(f, side);
  const tip = `data-f="${side}|${esc(f.c)}|${esc(f.v)}"`;
  const wkey = wk != null ? wk : (id !== '' && WID.has(String(id)) ? WID.get(String(id)) : null);
  const W = WEAR(wkey != null ? 'w' + wkey : id !== '' ? 'c' + id : f.c + f.v + side), stain = ' ' + W.cls;
  if (spr) return `<div class="card s-${side} c-${esc(f.c)} spr ${spr} ${cls}" style="" ${tip} ${id !== '' ? `data-id="${id}"` : ''}></div>`;
  const [m, subKey, sz] = SYM[f.v] || [esc(f.v)];
  const sub = subKey ? CARD_TXT[LANG][subKey] : '';
  const cor = CORNER[f.v] || esc(f.v);
  const uniq = f.v === 'swind' || f.v === 'sacr' || f.v === 'djoker' || /\buniq\b/.test(cls) ? ' uniq' : '';
  // how rare the face is decides its shine: plain lacquer, a gold foil for wilds, prism for house cards, a living opal for the unique ones
  const tier = uniq ? ' tier-u' : EXTRA_CARDS.includes(f.v) ? ' tier-h' : f.c === 'w' ? ' tier-w' : '';
  const chainN = (cls.match(/\bch(\d)\b/) || [])[1];
  const chains = /\blocked\b/.test(cls) ? `<i class="chainglow"></i><i class="chainov cv${(parseInt(id, 10) || 0) % CHAIN_SVGS.length}"></i><i class="lock">${LOCK_SVG}${chainN ? `<b>${chainN}</b>` : ''}</i>` : '';
  return `<div class="card s-${side} c-${esc(f.c)}${stain}${uniq}${tier} ${cls}" style="${W.style}" ${tip} ${id !== '' ? `data-id="${id}"` : ''}>${tier ? '<i class="sheen"><b></b></i>' : ''}${W.burn ? `<i class="burn ${W.burn}"></i>` : ''}${chains}<span class="cor tl">${cor}</span><div class="oval"><span class="mid ${sz || ''}">${m}${sub ? `<em>${sub}</em>` : ''}</span></div><span class="cor br">${cor}</span>${suitSVG(f.c, 'tr')}${suitSVG(f.c, 'bl')}</div>`;
}
const otherSide = () => G.side === 'L' ? 'D' : 'L';
function sortedHand(h) {
  const order = { r: 0, y: 1, g: 2, b: 3, p: 0, t: 1, o: 2, v: 3, w: 4, x: 5 }, keys = Object.keys(SYM);
  const vr = v => isNaN(+v) ? 10 + keys.indexOf(v) : +v;
  const a = h.slice(), F = c => G.f(c);
  if (sortMode === 'manual') {
    const pos = new Map(handOrder.map((id, i) => [String(id), i]));
    const known = a.filter(c => pos.has(String(c.id))).sort((x, y) => pos.get(String(x.id)) - pos.get(String(y.id)));
    const fresh = a.filter(c => !pos.has(String(c.id)));   // newly drawn cards go to the right end
    handOrder = known.concat(fresh).map(c => String(c.id));
    return curseOn === 'fever' ? feverShuffle(known.concat(fresh)) : known.concat(fresh);
  }
  if (sortMode === 'color') a.sort((x, y) => order[F(x).c] - order[F(y).c] || vr(F(x).v) - vr(F(y).v));
  else if (sortMode === 'value') a.sort((x, y) => vr(F(x).v) - vr(F(y).v) || order[F(x).c] - order[F(y).c]);
  if (curseOn === 'fever') return feverShuffle(a);
  return a;
}

// stable little offsets per card on the pile, so it looks like a real heap
function pileSpot(i) { return { rot: ((i * 47) % 25) - 12, dx: ((i * 31) % 13) - 6, dy: ((i * 17) % 11) - 5 }; }
function discardHTML() {
  const codes = (G.pile && G.pile.length ? G.pile : [cardCode(G.top)]).slice(-5);
  const base = (G.pileN || codes.length) - codes.length;
  return codes.map((code, k) => {
    const card = codeCard(code), sp = pileSpot(base + k), top = k === codes.length - 1, w = String(code).length > 2 ? String(code).slice(3) : null;
    return faceHTML(card[G.side], G.side, top ? 'topc' : 'under', 'p' + (base + k), w != null ? w : top && G.top.wid != null ? G.top.wid : null).replace('style="', `style="--rot:${sp.rot}deg;--dx:${sp.dx}px;--dy:${sp.dy}px;transform:translate(${sp.dx}px,${sp.dy}px) rotate(${sp.rot}deg);z-index:${k};`);
  }).join('');
}
// Sizes render() needs (pile width, hand width, where the felt goes) are read after the browser has laid the page out,
// by a ResizeObserver, instead of in the middle of render(), where every read forced a full synchronous layout.
const LAY = { ready: false, discardW: 0, handW: 0 };
function measureLayout() {
  const d = $('discard'), h = $('hand'); if (!d || !h) return;
  LAY.discardW = parseFloat(getComputedStyle(d).width) || 0; LAY.handW = h.clientWidth;
  const tr = $('table').getBoundingClientRect(), hr = $('bottom').getBoundingClientRect(), orr = $('opps').getBoundingClientRect();
  const top = orr.top + orr.height * 0.55, bottom = hr.bottom - 6;
  JUICE.setTable({ x: tr.left + tr.width / 2, y: (top + bottom) / 2, w: tr.width / 2 - 8, h: (bottom - top) / 2 });
  LAY.ready = LAY.discardW > 0 && LAY.handW > 0;
}
let layRerender = 0;
const layObs = new ResizeObserver(() => {
  const was = [LAY.discardW, LAY.handW]; measureLayout();
  // the hand is sized from these numbers: if they moved, lay the hand out again (once per frame at most)
  if ((was[0] !== LAY.discardW || was[1] !== LAY.handW) && G && !layRerender) layRerender = requestAnimationFrame(() => { layRerender = 0; lastHandHTML = ''; render(); });
});
['discard', 'hand', 'table', 'bottom', 'opps'].forEach(id => { const el = $(id); if (el) layObs.observe(el); });
function render() {
  if (!G) return;
  const me = G.players[ME];
  document.body.classList.toggle('dark', G.side === 'D');
  const ob = otherSide();
  const tk = `${G.turn}:${G.roulette}:${conn === online ? G.turnNo : G.seq}:${G.gid}`;
  if (tk !== turnKey) { const was = turnKey.split(':')[0]; turnKey = tk; turnStartedAt = Date.now(); if (myTurnNow()) { SFX.play('turn'); if (was !== String(ME)) toast(t('yourTurnStamp')); } }
  const elapsed = (Date.now() - turnStartedAt) / 1000;
  const cc = G.roulette !== null ? 'var(--muted)' : CVAR[G.color];
  document.documentElement.style.setProperty('--cc-now', cc);
  // seats
  const n0 = G.players.length, playOrder = [];
  for (let k = 1; k < n0; k++) playOrder.push((ME + k) % n0); // seats as they come after you, clockwise
  const upNext = G.winner === null ? (G.roulette !== null ? G.nextIdx(G.roulette, 1) : G.nextIdx(G.turn, 1)) : -1;
  const arrow = `<span class="sep">${G.dir === 1 ? '›' : '‹'}</span>`;
  const seatHTML = i => {
    const p = G.players[i];
    const n = p.hand.length, fanN = Math.min(n, 12);
    const picked = opponentSelection.get(i) || [];
    const fan = p.hand.slice(-fanN).map((c, k) => {
      const bf = c[ob] || { c: 'w' };
      const selected = picked.includes(n - fanN + k);
      const label = conn === online ? cardName(bf) : '';
      return `<i class="${ob} ${bf.c === 'w' ? 'w' : ''}" title="${esc(label)}" style="left:${k * 9}px;${selected ? 'translate:0 -5px;' : ''}${bf.c !== 'w' ? `background:${CVAR[bf.c]}` : ''}">${conn === online ? esc(/^\d$/.test(bf.v) ? bf.v : '') : ''}</i>`;
    }).join('');
    const turn = (G.roulette !== null ? G.roulette === i : G.turn === i) && G.winner === null;
    const tags = [];
    if (G.winner === i) tags.push(`<b>${t('tagWinner')}</b>`);
    if (p.shield) tags.push(`<b>${t('tagShield')}</b>`);
    if (p.loan > 0) tags.push(`<b class="next">${t('tagLoan', p.loan)}</b>`);
    if (p.left) tags.push(`<b>${t('tagLeft')}</b>`); else if (away[i]) tags.push(`<b>${t('tagAway')}</b>`);
    if (p.oweN > 0) tags.push(`<b>${t('tagOwes', p.oweN)}</b>`);
    if (i === upNext && !turn && !p.out) tags.push(`<b class="next">${t('tagNext')}</b>`);
    if (MATCH) {
      if (MATCH.col[i]) tags.unshift(`<b class="next">${t('tagCollector')}</b>`);
      else tags.unshift(`<b>${t('tagDebt', p.debt, p.limit || MATCH.limit)}</b>`, `${t('tagChips', MATCH.chips[i])}`);
    }
    if (!tags.length) tags.push(t('tagPlayer'));
    const limit = conn === online && networkDeadline != null ? Math.max(1, networkDeadline - turnStartedAt) : away[i] ? AWAY_MS : IDLE_MS;
    const timer = turn ? `<div class="timer" data-ts="${turnStartedAt}" style="animation-duration:${limit / 1000}s"></div>` : ''; // the delay is set once, below, so the seat markup stays the same all turn
    const dealRow = MATCH && !MATCH.col[i] ? dealBadges(p) : '';
    return `<div class="opp ${turn ? 'turn' : ''} ${p.out && G.winner !== i ? 'out' : ''} ${MATCH && MATCH.col[i] ? 'collector' : ''}" id="opp${i}">
      ${turn ? `<span class="turnflag">${t('tagTurn')}</span>` : ''}<div class="top"><span class="ini">${initials(p.name)}</span><span class="nm">${esc(p.name)}</span></div>
      <div class="fan">${fan}</div>
      <div class="meta"><span class="cnt">${n}</span><span class="tags">${tags.join(' · ')}</span></div>${dealRow}
      ${timer}
</div>`;
  };
  { const items = [{ key: 'a0', html: arrow }]; playOrder.forEach((i, k) => { items.push({ key: 'o' + i, html: seatHTML(i) }, { key: 'a' + (k + 1), html: arrow }); }); patchBlocks($('opps'), items);
    for (const tm of $('opps').querySelectorAll('.timer:not([data-set])')) { tm.dataset.set = 1; tm.style.animationDelay = -((Date.now() - +tm.dataset.ts) / 1000) + 's'; } }
  // piles: the draw pile shows the back of the next card (its other side)
  const nb = G.next && G.next[ob] ? G.next[ob] : { c: 'w', v: 'wild' };
  const back = me && hasDeal(me, 'sharp') && G.next && G.next[G.side] ? faceHTML(G.next[G.side], G.side, 'peek') : faceHTML(nb, ob);
  setHTML($('drawpile'), back + back + back);
  const myTurn = myTurnNow();
  $('bottom').classList.toggle('myturn', myTurn && !me.out && G.winner === null);
  const owe = G.owes(ME), myDebt = G.debt && G.debt.pi === ME && myTurn;
  const canDraw = controls.canDraw;
  $('drawpile').classList.toggle('can', canDraw && (owe || myDebt || G.pending > 0 || playableIds.size === 0));
  patchCards($('discard'), discardHTML(), null, false);
  // hud
  const lcLeft = G.lastCallLeft ? G.lastCallLeft() : null;
  setHTML($('hud'), `<span class="phase ${G.side === 'L' ? 'day' : 'night'}"><b>${G.side === 'L' ? '<svg viewBox="0 0 16 16" width="14" height="14"><circle cx="8" cy="8" r="3.2" fill="currentColor"/><g stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M8 1.2v2M8 12.8v2M1.2 8h2M12.8 8h2M3.2 3.2l1.4 1.4M11.4 11.4l1.4 1.4M3.2 12.8l1.4-1.4M11.4 4.6l1.4-1.4"/></g></svg>' : '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M10.8 2.2A6 6 0 1 0 13.8 11 5 5 0 0 1 10.8 2.2z" fill="currentColor"/></svg>'}</b>${G.side === 'L' ? t('lightSide') : t('darkSide')}</span>
    <span class="phaserules">${G.side === 'L' ? t('phaseDayRules') : t('phaseNightRules')}</span>
    <span class="row"><span class="chip">${suitSVG(G.color)}</span><span>${G.roulette !== null ? t('colorPending') : colorName(G.color)}</span></span>
    <span class="row dirtxt">${G.dir === 1 ? UI_ICON.cw : UI_ICON.ccw} ${t(G.dir === 1 ? 'cw' : 'ccw')}</span>
    ${G.rules.chaos ? (G.side === 'L' || G.inflate || G.lock ? `<span class="chaosline ${G.inflate || G.lock || G.chaosIn <= 2 ? 'warn' : ''}">${G.inflate ? t('inflated', G.inflate) : G.lock ? t('locked', G.lock) : t('chaosIn', G.chaosIn)}</span>` : `<span class="chaosline dim">${t('slotsClosed')}</span>`) : ''}
    ${G.crossLeft > 0 ? `<span class="chaosline warn">${t('crossOn', G.crossLeft)}</span>` : ''}
    ${G.potatoState && G.side === 'D' ? `<span class="chaosline ${G.potatoState === 2 ? 'warn potato hot' : 'potato'}">${t(G.potatoState === 2 ? 'potatoHot' : 'potatoOn')}</span>` : ''}
    ${lcLeft !== null && lcLeft <= 10 && G.winner === null ? `<span class="chaosline warn lastcall">${lcLeft ? t('lastCallIn', lcLeft) : t('lastCallNow')}</span>` : ''}
    ${G.maze > 0 ? `<span class="chaosline warn">${t('mazeLeft', G.maze)}</span>` : ''}
    ${G.multNext > 1 ? `<span class="chaosline warn multchip">${t('multNext', G.multNext)}</span>` : ''}
    ${G.pending > 0 ? `<span class="label" style="margin-top:8px">${t('stack')}</span><span class="stack${G.pending >= 8 ? ' burning' : ''}" style="--heat:${Math.min(1, G.pending / 20).toFixed(2)}">+${G.pending}</span>` : ''}`);
  JUICE.setSide(G.side === 'D'); AMB.setSide(G.side);
  if (!LAY.ready) measureLayout(); // the felt under the piles follows the layout; measured by the observer below, not here
  JUICE.setHeat(Math.max(G.pending / 22, lcLeft !== null && lcLeft <= 10 ? (10 - lcLeft) / 15 : 0)); JUICE.fireLevel(G.pending, G.multNext || 1);
  const debtColor = G.debt?.until;
  const debtColorLabel = debtColor ? colorName(debtColor) + (SIDE_COLORS[G.side].includes(debtColor) ? '' :
    (LANG === 'ru' ? (G.side === 'L' ? ' (ночная сторона)' : ' (дневная сторона)') :
      (G.side === 'L' ? ' (night face)' : ' (day face)'))) : '';
  // banner
  const ban = $('banner');
  let txt, you = false;
  if (G.winner !== null) txt = G.winner === ME ? t('youWin') : t('wins', G.players[G.winner].name);
  else if (me.out) txt = t('youLeft');
  else if (owe) txt = t('oweBanner', me.oweN);
  else if (G.debt) txt = G.debt.pi === ME
    ? (G.debt.n ? t('myStackDebt', G.debt.n) : t('myColorDebt', debtColorLabel, G.debt.got))
    : (G.debt.n ? t('otherDebtN', G.players[G.debt.pi].name, G.debt.n) : t('otherDebtC', G.players[G.debt.pi].name, debtColorLabel));
  else if (G.roulette !== null) txt = G.roulette === ME ? t('rouletteMe') : t('rouletteOther', G.players[G.roulette].name);
  else if (myTurn) { you = true; txt = G.pending > 0 ? (playableIds.size ? t('stackOrTake', G.stackMin, G.pending) : t('take', G.pending)) : (G.drewBy === ME ? t('playOrPass') : (playableIds.size ? t('yourTurn') : (G.rules.drawUntil ? t('keepDrawing', colorName(G.color)) : t('drawOne')))); }
  else txt = t('turnOf', G.players[G.turn].name, away[G.turn]);
  ban.textContent = txt; ban.className = you ? 'you' : '';
  // me
  setHTML($('meIni'), initials(me.name));
  $('meName').textContent = me.name;
  $('meCnt').textContent = me.hand.length;
  $('meTags').textContent = [MATCH ? (MATCH.col[ME] ? t('tagCollector') : t('tagDebt', me.debt, me.limit || MATCH.limit) + ' · ' + t('tagChips', MATCH.chips[ME])) : '', me.left ? t('tagLeft') : '', me.shield ? t('tagShield') : '', me.loan > 0 ? t('tagLoan', me.loan) : '', upNext === ME && !myTurn ? t('tagNext') : ''].filter(Boolean).join(' · ');
  // no Draw button: the deck itself is clicked; its tooltip says what a click does
  const digging = myTurn && G.rules.drawUntil && G.pending === 0 && G.drewBy !== ME && playableIds.size === 0 && (G.drawRunPi === ME && G.drawRun > 0);
  canDrawNow = !!canDraw;
  canPassNow = controls.canPass;
  $('drawpile').classList.toggle('pass', canPassNow);
  $('drawpile').title = canPassNow ? t('passDeck') : !canDraw ? '' : owe ? t('penalty', me.oweN)
    : myDebt ? (G.debt.n ? t('pickUpLeft', G.debt.n) : t('drawUntil', debtColorLabel, G.debt.got))
    : G.pending > 0 && myTurn ? t('take', G.pending) : (digging ? t('drawAgain', G.drawRun) : t('draw'));
  const gb = $('btnGamble'), canG = controls.canGamble;
  gb.classList.toggle('hidden', !canG); gb.textContent = t('gambleBtn');
  // a collector works for the house: once per deal, slip someone two cards or pull the lever
  const isCol = !!(MATCH && MATCH.col[ME] && MATCH.phase === 'play' && G.winner === null);
  $('colBar').classList.toggle('hidden', !isCol);
  if (isCol) {
    $('colTxt').textContent = MATCH.colUsed ? t('colUsed') : t('colReady');
    $('btnColGive').textContent = t('colGive'); $('btnColLever').textContent = t('colLever');
    $('btnColGive').disabled = $('btnColLever').disabled = !!MATCH.colUsed;
  }
  // deals you use by hand
  const ab = $('abBar'), free = myTurn && G.pending === 0 && !G.debt && !G.offer && !G.owes(ME);
  const abBtns = [], visibleAbilities = new Set();
  const addAbility = (deal, action, text, available, hint = '') => {
    visibleAbilities.add(deal);
    abBtns.push(`<button class="btn ab" data-ab="${action}" data-tipdeal="${deal}" ${available ? '' : 'disabled'}${hint ? ' title="' + esc(hint) + '"' : ''}>${DEAL_ICON[deal]}${text}</button>`);
  };
  const crossed = G.crossLeft > 0;
  if (hasDeal(me, 'wind') && !me.used.wind)
    addAbility('wind', 'wind', t('abWind'), free && !crossed && me.hand.length >= 6, t('abWindTip'));
  if (hasDeal(me, 'confess') && !me.used.confess && !crossed)
    addAbility('confess', 'confess', confessSel ? t('abConfessGo', confessSel.size) : t('abConfess'), free);
  if (hasDeal(me, 'puppet')) {
    const next = G.nextIdx(ME, 1);
    const available = myTurn && !G.debt && !G.offer && !G.owes(ME)
      && next !== ME && me.puppetLast !== next && !G.players[next].skipNext;
    addAbility('puppet', 'puppet', t('abPuppet'), available, t('abPuppetTip'));
  }
  if (hasDeal(me, 'sharp')) addAbility('sharp', 'burn', t('abBurn'), free);
  setHTML(ab, abBtns.join('')); ab.classList.toggle('hidden', !abBtns.length || !!(MATCH && MATCH.col[ME]));
  setHTML($('meDeals'), MATCH && !MATCH.col[ME] ? dealBadges(me, true, visibleAbilities) : '');
  // the Dark shop's items: a separate inventory, usable at any moment
  const inv = $('invBar'), mineInv = (me.inv || []);
  const counts = {}; for (const id of mineInv) counts[id] = (counts[id] || 0) + 1;
  const invBtns = Object.keys(counts).map(id => {
    const ok = G.canUseItem(ME, id);
    return `<button class="item use" data-use="${id}" data-tipitem="${id}" ${ok ? '' : 'disabled'}>${ITEM_ICON[id]}<b>${t('item_' + id)}</b>${counts[id] > 1 ? `<em>×${counts[id]}</em>` : ''}${ITEM_AUTO[id] ? `<i>${t('itemAuto')}</i>` : ''}</button>`;
  });
  setHTML(inv, invBtns.join('')); inv.classList.toggle('hidden', !invBtns.length || !!(MATCH && MATCH.col[ME]));
  if (!free && confessSel) confessSel = null;
  dealOffer();
  drawHorse();
  $('btnSort').textContent = t('sort', sortMode);
  if (innerWidth > 820 && selMode) selMode = false; // tap-to-pick is a phone thing; on a computer the right click picks
  $('btnSelect').textContent = innerWidth <= 820 ? (selMode ? t('selectOnShort') : t('selectShort')) : (selMode ? t('selectOn') : t('selectOff')); $('btnSelect').classList.toggle('on', selMode); $('btnSelect').classList.toggle('hidden', !controls.canGroup);
  $('btnQuit').textContent = t('leave');
  // hand (left alone while a card is being dragged)
  if (!dragging) {
    const allCards = sortedHand(me.hand);
    if (conn === online && allCards.length <= 1200) online.order(allCards.map(c => c.wid), selCards().map(c => c.wid));
    const wrap = $('hand');
    const rootCw = LAY.discardW / 1.3 || 76;
    const mobile = innerWidth <= 820;
    const MAX_TILT = 8;
    const minimum = mobile ? 34 : 44;
    const maxRows = mobile && innerHeight < 720 ? 2 : 3;
    const base = Math.max(minimum, Math.round(Math.min(rootCw * (mobile ? 1.12 : 1.15), (innerHeight * (mobile ? 0.16 : 0.18)) / 1.47)));
    const pad = 16, tiltRoom = c => c * 1.47 * Math.sin(MAX_TILT * Math.PI / 180) + 4;
    const room = c => LAY.handW - 2 * pad - 2 * tiltRoom(c);
    const minFrac = 0.2;
    const minPerRow = Math.max(1, 1 + Math.floor((room(minimum) - minimum) / (minimum * minFrac)));
    const pageSize = minPerRow * maxRows;
    handPageCount = Math.max(1, Math.ceil(allCards.length / pageSize));
    handPage = Math.min(handPage, handPageCount - 1);
    const hand = allCards.slice(handPage * pageSize, (handPage + 1) * pageSize);
    const pager = $('handPager');
    pager.classList.toggle('hidden', handPageCount === 1);
    $('handPrev').disabled = !handPage;
    $('handNext').disabled = handPage + 1 >= handPageCount;
    $('handPrev').setAttribute('aria-label', LANG === 'ru' ? 'Предыдущие карты' : 'Previous cards');
    $('handNext').setAttribute('aria-label', LANG === 'ru' ? 'Следующие карты' : 'Next cards');
    $('handPage').textContent = (handPage + 1) + ' / ' + handPageCount;
    const n = Math.max(hand.length, 1);
    const fitsRow = (per, c) => c + (per - 1) * c * minFrac <= room(c);
    let rows = 1, per = n;
    while (rows < maxRows && !fitsRow(per, base)) { rows++; per = Math.ceil(n / rows); }
    // room(c) is linear. Solve it directly instead of rounding up into an overflowing row.
    const cw = fitsRow(per, base) ? base : Math.max(minimum, Math.floor(
      (LAY.handW - 2 * pad - 8) / (1 + (per - 1) * minFrac + 2 * 1.47 * Math.sin(MAX_TILT * Math.PI / 180)),
    ));
    const availRow = room(cw);
    const strip = per > 1 ? Math.min(cw + 8, Math.max(0, (availRow - cw) / (per - 1))) : 0;
    const ch = cw * 1.47, rowLift = ch * 0.42;
    wrap.style.setProperty('--hcw', cw.toFixed(1) + 'px');
    wrap.style.setProperty('--cw', cw.toFixed(1) + 'px');
    wrap.style.setProperty('--ch', ch.toFixed(1) + 'px');
    wrap.style.minHeight = Math.ceil(ch * rows - (rows - 1) * rowLift + (mobile ? 40 : 44)) + 'px';
    wrap.style.flexWrap = rows > 1 ? 'wrap' : 'nowrap';
    wrap.style.justifyContent = 'center';
    let newIdx = 0;
    const handParts = [];
    hand.forEach((c, k) => {
      const row = Math.floor(k / per), col = k % per, inRow = Math.min(per, n - row * per);
      let cls = '';
      if (myTurn) cls = fits(c) ? 'ok' : 'dim';
      if (c.lock) cls += ' locked' + (c.chain ? ' ch' + (c.chain + 1) : '');
      if (c.uniq) cls += ' uniq';
      if (confessSel && confessSel.has(c.id)) cls += ' picked';
      { const si = selIds.indexOf(c.id); if (si >= 0) cls += ' sel sel' + Math.min(si, 9); }
      const off = col - (inRow - 1) / 2, step = inRow > 1 ? Math.min(3, (2 * MAX_TILT) / (inRow - 1)) : 0;
      let st = `--i:${k};margin-left:${col ? (strip - cw).toFixed(1) : 0}px;z-index:${k};--rot:${(off * step).toFixed(2)}deg;--dy:${Math.min(12, off * off * step * 0.1).toFixed(1)}px`;
      if (row > 0) st += `;margin-top:${(-rowLift).toFixed(1)}px`;
      if (!lastHandIds.has(c.id)) { cls += ' new'; st += `;animation-delay:${Math.min(newIdx++, 7) * 20}ms`; }
      const html = faceHTML(G.f(c), G.side, cls, c.id).replace('style="', `style="${st};`);
      if (row > 0 && col === 0) handParts.push('<i class="brk"></i>');
      handParts.push(html);
    });
    const handHTML = handParts.join('');
    // nothing about the hand changed: keep the DOM (and the hover/tilt) as it is.
    // Otherwise patch it: a card already on screen keeps its element (no repaint of its texture, no restarted sway),
    // only its classes and position change; new cards are added, gone ones removed.
    if (handHTML !== lastHandHTML || !wrap.firstElementChild) {
      lastHandHTML = handHTML;
      patchCards(wrap, handHTML, Object.fromEntries(me.hand.map(c => [c.id, c])), true, handParts);
    }
    lastHandIds = new Set(allCards.map(c => c.id));
    drawSelBar();
    wrap.classList.toggle('big', hand.length > 24);
  }
  // log
  const logKey = LANG + ':' + G.gid + ':' + (G.log.length ? G.log[G.log.length - 1].msg : '') + ':' + G.log.length;
  if (logKey !== lastLogKey) {
    const prev = new Set(lastLogMsgs); lastLogKey = logKey;
    const rows = G.log.slice(-60);
    lastLogMsgs = rows.map(l => l.msg);
    $('log').innerHTML = rows.slice().reverse().map(l => `<div class="${l.cls === 'win' ? 'win' : ''}${prev.has(l.msg) ? '' : ' n'}">${esc(youify(fmtLog(l)))}</div>`).join('');
  }
  const lastMsg = G.log.length ? youify(fmtLog(G.log[G.log.length - 1])) : '';
  if ($('ticker').textContent !== lastMsg) $('ticker').textContent = lastMsg;
  processEvents();
}
function youify(m) {
  if (LANG !== 'en' || !G.players[ME] || G.players[ME].name !== 'You' || !/^You /.test(m)) return m.replace(/You starts/, 'You start');
  return m.replace(/\bYou (plays|takes|draws|passes|calls|swaps|flips|empties|hit|is|jumps|must|mirrors|raises|duels|ran|drops|goes|throws|puts|loads|aims|pulls|signs|spins|scratches|tips|hands|gets|burns|confesses|makes|tears|leaves|was|holds|repeats|picked|drew)\b/g, (a, v) =>
    'You ' + ({ drops: 'drop', goes: 'go', throws: 'throw', puts: 'put', loads: 'load', aims: 'aim', pulls: 'pull', signs: 'sign', spins: 'spin', scratches: 'scratch', tips: 'tip', hands: 'hand', gets: 'get', burns: 'burn', confesses: 'confess', makes: 'make', tears: 'tear', leaves: 'leave', was: 'were', holds: 'hold', repeats: 'repeat', picked: 'picked', drew: 'drew', plays: 'play', takes: 'take', draws: 'draw', passes: 'pass', calls: 'call', swaps: 'swap', flips: 'flip', empties: 'empty', hit: 'hit', is: 'are', jumps: 'jump', must: 'must', mirrors: 'mirror', raises: 'raise', duels: 'duel', ran: 'ran' }[v]))
    .replace(/(You (?:play|draw|flip|empty|swap)[^.]*?)\btheir\b/g, '$1your').replace(/until they can/g, 'until you can').replace(/reaches them/, 'reaches you');
}


// ================= EVENTS → FEEDBACK =================
const TOAST_PRI = { bad: 8, lastcall: 10, gamble: 10, potato: 9, deal: 9, maze: 9, d6: 7, pill: 7, bomb: 8, gift: 6, echo: 6, fire: 8, mult: 7, glass: 6, lucky: 5, loan: 5, multi: 5, win: 9, flip: 8, took: 6, mirror: 6, shield: 6, stack: 5, skipall: 4, rotate: 4, swap: 4, roulette: 4, reverse: 2 };
function seatRect(pi) { return pi === ME ? rectOf($('hand')) : rectOf($('opp' + pi)); }
function nm(pi) { return pi === ME ? (LANG === 'ru' ? 'Вы' : 'You') : (G.players[pi] ? G.players[pi].name : ''); }
function processEvents() {
  const evs = (G.events || []).filter(e => e.n > lastEvN);
  if (!evs.length) return;
  lastEvN = evs[evs.length - 1].n;
  const recent = evs.slice(-8);
  const cw = rectOf($('discard'));
  let best = null; const bump = (pri, text) => { if (!best || pri > best.pri) best = { pri, text }; };
  const lastPlay = [...recent].reverse().find(e => e.type === 'play');
  for (const e of recent) {
    switch (e.type) {
      case 'play': {
        SFX.play('play', (e.k || 1) + Math.floor((G.pending || 0) / 4));
        { const r = rectOf($('discard')), f = codeCard(e.code)[e.side]; const col = CVAR[f.c] ? getComputedStyle(document.documentElement).getPropertyValue('--' + f.c).trim() : '#fff';
          setTimeout(() => JUICE.burst(r.left + r.width / 2, r.top + r.height / 2, 14 + (e.k || 1) * 10, [col || '#fff', '#fff', '#141414'], 0.8 + (e.k || 1) * 0.2), 190);
          if ((e.k || 1) > 1) setTimeout(() => JUICE.shake(e.k), 200);
          if ((e.k || 1) >= 3) { JUICE.ignite(1); bump(TOAST_PRI.fire, t('tFire')); } }
        if (e !== lastPlay) break;
        const k = Math.max(1, Math.min(e.k || 1, 5));
        const els = [...document.querySelectorAll('#discard .card')].slice(-k);
        const codes = (G.pile || []).slice(-k);
        const from = e.pi === ME && lastPlayRect ? lastPlayRect : centerRect(seatRect(e.pi) || cw, cw.width * 0.6, cw.height * 0.6);
        els.forEach(el => el.style.opacity = '0');
        codes.forEach((code, j) => {
          const card = codeCard(code), el = els[j], w = String(code).length > 2 ? String(code).slice(3) : null;
          fly(faceHTML(card[e.side], e.side, '', '', w != null ? w : null), from, el ? rectOf(el) : cw, { delay: j * 60, onDone: () => {
            if (!el) return; el.style.opacity = ''; el.classList.remove('land'); void el.offsetWidth; el.classList.add('land');
            if (j) SFX.play('play');
          } });
        });
        lastPlayRect = null;
        break;
      }
      case 'draw': {
        SFX.play('draw', e.k);
        const p = G.players[e.pi]; if (!p) break;
        const to = seatRect(e.pi), from = rectOf($('drawpile'));
        if (!to || !from) break;
        const ob = otherSide(), tail = p.hand.slice(-Math.min(e.k, 5));
        tail.forEach((c, k) => fly(faceHTML(c[ob] || { c: 'w', v: 'wild' }, ob), from, centerRect(to, from.width * 0.5, from.height * 0.5), { delay: k * 18 }));
        floatText(e.pi, '+' + e.k);
        break;
      }
      case 'took': SFX.play('took'); if (e.k >= 10) JUICE.shake(4); if (e.k >= 10) bump(TOAST_PRI.took, `+${e.k}`); break;
      case 'stack': SFX.play('stack', e.k); JUICE.shake(Math.min(4, 1 + e.k / 8)); bump(TOAST_PRI.stack, t('tStack', e.k)); if (e.k >= 15) { JUICE.ignite(Math.min(1, e.k / 30)); bump(TOAST_PRI.fire, t('tFire')); } break;
      case 'mult': SFX.play('mult', e.x); JUICE.shake(3); if (e.k) { JUICE.ignite(1); bump(TOAST_PRI.mult, `${t('tMult', e.x)} → +${e.k}`); } else bump(TOAST_PRI.mult, t('tArm', e.x)); break;
      case 'lucky': SFX.play(e.h || e.w ? 'lucky' : 'bad'); if (e.h || e.w) { const r = seatRect(e.pi) || cw; JUICE.burst(r.left + r.width / 2, r.top + r.height / 2, 60, ['#22c55e', '#a3e635', '#ffd23f', '#fff'], 1.4); } bump(TOAST_PRI.lucky, e.w ? t('tLuckyDebt', e.w) : e.h ? t('tLucky') : t('tMiss')); break;
      case 'glass': SFX.play('glass'); JUICE.burst(cw.left + cw.width / 2, cw.top + cw.height / 2, 70, ['#e0f2fe', '#7dd3fc', '#ffffff', '#94a3b8'], 1.6); JUICE.shake(2); bump(TOAST_PRI.glass, e.broke ? t('tGlass') : t('tGlassHit')); break;
      case 'loan': SFX.play('coin'); floatText(e.pi, t('tLoan')); break;
      case 'gift': SFX.play('swap'); floatText(e.b, '+' + e.g); bump(TOAST_PRI.gift, t('tGift', nm(e.b))); break;
      case 'echo': SFX.play(e.ok ? 'mult' : 'bad', 2); bump(TOAST_PRI.echo, e.ok ? t('tEcho') : t('tEchoNone')); break;
      case 'bomb': SFX.play('devil'); JUICE.shake(6); { const r = seatRect(e.v) || cw; JUICE.burst(r.left + r.width / 2, r.top + r.height / 2, 90, ['#fff', '#ffd23f', '#ff7814', '#e63c0a', '#222'], 2); } bump(TOAST_PRI.bomb, t('tBomb')); break;
      case 'loanDue': SFX.play('bad'); JUICE.shake(2); floatText(e.pi, t('tDue')); bump(TOAST_PRI.loan, `${nm(e.pi)}: ${t('tDue')}`); break;
      case 'skip': SFX.play('skip'); floatText(e.pi, t('tSkipped')); break;
      case 'skipall': SFX.play('skip'); bump(TOAST_PRI.skipall, t('tSkipAll')); break;
      case 'reverse': SFX.play('skip'); bump(TOAST_PRI.reverse, t('tReverse')); break;
      case 'swap': SFX.play('swap'); bump(TOAST_PRI.swap, t('tSwap')); break;
      case 'rotate': SFX.play('swap'); bump(TOAST_PRI.rotate, t('tRotate')); break;
      case 'roulette': SFX.play('stack', 3); bump(TOAST_PRI.roulette, t('tRoulette')); break;
      case 'multi': bump(TOAST_PRI.multi, t('tMulti', e.k)); break;
      case 'combo': showCombo(e); break;
      case 'gamble': SFX.play('spin'); setTimeout(() => { SFX.play(e.ok ? 'click2' : 'bang'); if (!e.ok) { JUICE.shake(8); JUICE.ignite(1); } if (e.ok && e.t !== undefined) floatText(e.t, '+' + e.k); else if (!e.ok) floatText(e.pi, '+' + e.k); }, 380); setTimeout(() => bump(TOAST_PRI.gamble, e.ok ? t('tShot', G.players[e.t] ? G.players[e.t].name : '', e.k) : t('tBang', e.k)), 380); break;
      case 'lastcall': SFX.play('lastcall'); JUICE.shake(4); bump(TOAST_PRI.lastcall, t('tLastCall')); break;
      case 'bad': {
        const r = seatRect(e.pi) || cw;
        if (e.v === 'fuse') { SFX.play('devil'); JUICE.shake(7); JUICE.burst(r.left + r.width / 2, r.top + r.height / 2, 80, ['#fff', '#ffd23f', '#ff7814', '#3a3632'], 2); }
        else SFX.play('bad');
        floatText(e.pi, '+' + e.k); bump(TOAST_PRI.bad, t('tBad_' + e.v, nm(e.pi), e.k, e.full)); break;
      }
      case 'potato': SFX.play('devil'); JUICE.shake(6); { const r = seatRect(e.pi) || cw; JUICE.burst(r.left + r.width / 2, r.top + r.height / 2, 70, ['#c9a227', '#7a5230', '#ff7814', '#fff'], 1.8); } floatText(e.pi, '+3'); bump(TOAST_PRI.potato, t('tPotato', nm(e.pi))); break;
      case 'potatoLit': SFX.play('tick'); break;
      case 'd6': SFX.play('shuffle'); floatText(e.pi, '', ICON.d6); bump(TOAST_PRI.d6, t('tD6')); break;
      case 'pill': SFX.play(e.p === 'fine' || e.p === 'draw' ? 'bad' : 'lucky'); bump(TOAST_PRI.pill, t('pill_' + e.p)); break;
      case 'maze': SFX.play('chaos'); bump(TOAST_PRI.maze, t('tMaze')); break;
      case 'deal': SFX.play('devil'); JUICE.ignite(1); bump(TOAST_PRI.deal, t('tDeal')); break;
      case 'win': SFX.play('win'); JUICE.burst(innerWidth / 2, innerHeight * 0.4, 160, ['#ff2d55', '#ffd23f', '#22d3ee', '#a3e635', '#fff'], 2); bump(TOAST_PRI.win, e.pi === ME ? t('youWin') : t('wins', nm(e.pi))); break;
      case 'mirror': SFX.play('swap'); bump(TOAST_PRI.mirror, t('tMirror', nm(e.b))); break;
      case 'shieldup': SFX.play('click'); floatText(e.pi, t('tShieldUp')); break;
      case 'shield': SFX.play('swap'); bump(TOAST_PRI.shield, t('tShield', e.k)); break;
      case 'chaos': JUICE.slot(e.e); break;
      case 'colgive': SFX.play('bad'); floatText(e.t, '+2'); bump(5, t('tColGive', nm(e.t))); break;
      case 'pad': case 'halo': SFX.play('click'); floatText(e.pi, '½'); break;
      case 'debt': if (e.k) floatText(e.pi, (e.k > 0 ? '+' : '−') + Math.abs(e.k) + '$'); break;
      case 'offer': JUICE.visit(e.kind); if (e.pi !== ME) bump(4, e.kind === 'dark' ? t('tDemonCame', nm(e.pi)) : t('tAngelCame', nm(e.pi))); break;
      case 'overLimit': if (e.pi === ME) bump(7, t('tOverLimit')); break;
      case 'item': if (e.pi !== ME) floatText(e.pi, '', ITEM_ICON[e.id]); bump(6, t('itemUsed', nm(e.pi), t('item_' + e.id))); break;
      case 'oven': SFX.play('flip'); JUICE.shake(3); break;
      case 'rent': if (e.pi === ME) { SFX.play('coin'); floatText(e.pi, '+3¢'); } break;
      case 'eclipseMiss': if (e.pi === ME) floatText(e.pi, '', ITEM_ICON.eclipse + ' +' + pct(e.k)); break;
      case 'again': if (e.pi === ME) { SFX.play('turn'); bump(7, t('tAgain')); } break;
      case 'horse': SFX.play('lastcall'); JUICE.shake(8); setTimeout(() => horsePop(e.k, e.v), 30); break;
      case 'horseEnd': SFX.play('lucky'); bump(8, t('horseGone', t('horse_' + e.k))); break;
      case 'warTime': SFX.play('bad'); JUICE.shake(4); floatText(e.pi, '+2'); break;
      case 'arms': case 'rot': SFX.play('swap'); break;
      case 'tithe': SFX.play('swap'); floatText(e.t, '+1'); break;
      case 'dealTaken': SFX.play(e.kind === 'dark' ? 'devil' : 'win'); bump(6, t('tDealTaken', nm(e.pi), t('deal_' + e.d))); break;
      case 'fall': SFX.play('devil'); JUICE.shake(6); bump(8, t('tFall', nm(e.pi))); break;
      case 'guardian': SFX.play('swap'); bump(6, t('tGuardian', nm(e.pi))); break;
      case 'veilBurn': SFX.play('bad'); floatText(e.t, '', '+' + e.k); break;
      case 'fangs': floatText(e.pi, '', '×2'); break;
      case 'djoker': SFX.play('devil'); JUICE.shake(6); bump(8, t('tDjoker', nm(e.pi))); break;
      case 'cross': SFX.play('devil'); bump(8, t('tCross', nm(e.pi))); break;
      case 'sacr': SFX.play('bang'); JUICE.shake(8); bump(9, t('tSacr', nm(e.t))); break;
      case 'swind': SFX.play('win'); bump(6, t('tSwind', nm(e.pi))); break;
      case 'broke': SFX.play('ko'); bump(9, t('tBroke', nm(e.pi))); break;
      case 'chained': if (e.pi === ME) floatText(e.pi, t('tChained', e.k)); break;
      case 'puppet': SFX.play('chaos'); bump(5, t('tPuppet', nm(e.t))); break;
      case 'demonCharge': if (e.pi === ME) floatText(e.pi, '', DEAL_ICON.demon + ' ' + pct(e.k)); break;
      case 'flip':
        SFX.play('flip'); JUICE.shake(2); bump(TOAST_PRI.flip, e.side === 'D' ? t('tDark') : t('tLight'));
        document.querySelectorAll('#hand .card').forEach(el => { el.classList.remove('new'); el.classList.add('flipin'); });
        break;
    }
  }
  if (best) toast(best.text);
}
window.addEventListener('resize', () => render());


// ================= DIALOGS =================
// Every dialog can be closed (× in the corner, Esc, or a click outside it).
// A choice you started yourself (a wild's colour, a target) is cancelled by closing.
// A choice the game is waiting for (colour roulette, the angel, passing cards, the shop) is only tucked away:
// a "Back to the choice" tab stays on screen and brings it back.
let modalState = { mode: 'close', onCancel: null, min: false, key: '' }, modalNext = null;
function openModal(html, o) {
  o = o || modalNext || {}; modalNext = null;
  const key = o.key || '', stayMin = modalState.min && key && key === modalState.key;
  $('modalBody').innerHTML = `<button class="modalx" id="modalX" title="${esc(t('close'))}"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="square"><path d="M5 5l14 14M19 5L5 19"/></svg></button>` + html;
  modalState = { mode: o.mode || 'close', onCancel: o.onCancel || null, min: !!stayMin, key, fit: !!o.fit };
  $('modalBody').className = 'dialog' + (o.cls ? ' ' + o.cls : '');
  $('modalX').onclick = dismissModal;
  $('modal').classList.toggle('hidden', !!stayMin); $('modalBack').classList.toggle('hidden', !stayMin);
  fitModal();
}
// a dialog that asks to fit (the shop) shrinks as a whole until it fits the window, down to 62%;
// past that it scrolls as before
function fitModal() {
  const d = $('modalBody');
  if (!modalState.fit || $('modal').classList.contains('hidden')) { d.style.zoom = ''; return; }
  d.style.zoom = '';
  const cs = getComputedStyle($('modal')), avail = innerHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 4;
  const z = Math.max(innerWidth <= 820 ? 0.86 : 0.62, Math.min(1, avail / d.offsetHeight)); // on a phone it scrolls rather than shrinking to unreadable
  if (z < 1) d.style.zoom = z.toFixed(3);
}
addEventListener('resize', () => { if (modalState.fit) fitModal(); });
function closeModal() { $('modal').classList.add('hidden'); $('modalBack').classList.add('hidden'); modalState.min = false; }
function dismissModal() {
  if ($('modal').classList.contains('hidden')) return;
  SFX.play('click');
  if (modalState.mode === 'min') { $('modal').classList.add('hidden'); $('modalBack').classList.remove('hidden'); modalState.min = true; return; }
  const cb = modalState.onCancel; modalState.onCancel = null; closeModal(); if (cb) cb();
}
$('modal').addEventListener('click', e => { if (e.target === $('modal')) dismissModal(); });
$('modalBack').onclick = () => { $('modal').classList.remove('hidden'); $('modalBack').classList.add('hidden'); modalState.min = false; fitModal(); };
const ON_COLOR = { y: 'var(--ink)', t: 'var(--ink)', o: 'var(--ink)' };
function pickColor(title, sub, side, forced) {
  return new Promise(res => {
    modalNext = forced ? { mode: 'min', key: 'roul' } : { onCancel: () => res(null) };
    openModal(`<h2>${esc(title)}</h2><p>${esc(sub)}</p><div class="colors">${SIDE_COLORS[side].map(c => `<button data-c="${c}" style="background:${CVAR[c]};color:${ON_COLOR[c] || '#fff'}">${suitSVG(c)}${colorName(c)}</button>`).join('')}</div>`);
    $('modalBody').querySelectorAll('[data-c]').forEach(b => b.onclick = () => { SFX.play('click'); closeModal(); res(b.dataset.c); });
  });
}
function pickTarget(title, sub, skipLabel, forced) {
  return new Promise(res => {
    modalNext = forced ? { mode: 'min', key: 'target' } : { onCancel: () => res(null) };
    const list = G.players.map((p, i) => ({ p, i })).filter(o => o.i !== ME && !o.p.out);
    openModal(`<h2>${esc(title)}</h2><p>${esc(sub)}</p>
      <div class="list">${list.map(o => `<button data-t="${o.i}"><span style="display:flex;gap:8px;align-items:center"><span class="ini">${initials(o.p.name)}</span>${esc(o.p.name)}</span><span class="mono">${t('cardsN', o.p.hand.length)}</span></button>`).join('')}</div>
      ${skipLabel ? `<button class="btn wide" id="skipT" style="margin-top:16px">${esc(skipLabel)}</button>` : ''}`);
    $('modalBody').querySelectorAll('[data-t]').forEach(b => b.onclick = () => { SFX.play('click'); closeModal(); res(+b.dataset.t); });
    if (skipLabel) $('skipT').onclick = () => { SFX.play('click'); closeModal(); res(null); };
  });
}
// choose which matching cards go down together, and in what order; resolves to the cards, or null to cancel
function pickExtras(card, same, pre) {
  return new Promise(res => {
    // The cards start in the order they sit in your hand. Play order is simply their order here, left to right:
    // drag to rearrange, tap to switch a card off or on (it stays where it is).
    const handPos = new Map(sortedHand(G.players[ME].hand).map((c, i) => [c, i]));
    let list = [card, ...same].sort((a, b) => handPos.get(a) - handPos.get(b));
    let sel = new Set([card, ...(pre || same)]), warn = '';
    const numbers = /^\d$/.test(G.f(card).v) && G.f(card).c !== 'w' && G.rules.combos !== false;
    const order = () => list.filter(c => sel.has(c));
    const comboLine = ord => {
      if (!numbers || ord.length < 2) return '';
      const cb = comboOf(ord.map(c => G.f(c)));
      if (!cb) return `<div class="pickcombo bad">${t('noCombo')}</div>`;
      const night = G.side === 'D', nx = night && cb.d ? nm(G.nextIdx(ME, 1)) : '';
      const pay = [cb.d ? (night ? t('comboNightSlap', nx, cb.d) : t('comboToss', cb.d)) : '', cb.m ? t('comboHit', cb.m) : ''].filter(Boolean).join(' · ');
      return `<div class="pickcombo"><b>${t('combo_' + cb.key)}</b><span class="chips">${cb.chips}</span><i>×</i><span class="mult">${cb.mult}</span>${pay ? `<em>${pay}</em>` : ''}</div>`;
    };
    const draw = () => {
      const ord = order();
      const valid = !numbers || ord.length < 2 || !!comboOf(ord.map(c => G.f(c)));
      const slot = (c, k) => { const at = ord.indexOf(c); return `<div class="slot" data-k="${k}">${at >= 0 ? `<span class="ord">${at + 1}</span>` : ''}${faceHTML(G.f(c), G.side, at >= 0 ? 'on' : 'off')}</div>`; };
      modalNext = { onCancel: () => res(null) };
      openModal(`<h2>${t(numbers ? 'comboQ' : 'togetherQ')}</h2><p>${t(numbers ? 'comboSub' : 'togetherSub')}</p>
        <div class="pick${list.length > 16 ? ' lots' : list.length > 9 ? ' many' : ''}" id="pickRow">${list.map(slot).join('')}</div>
        ${comboLine(ord)}
        ${warn ? `<p class="pickwarn">${esc(warn)}</p>` : ''}
        <button class="btn primary wide" id="pxGo" ${ord.length && valid ? '' : 'disabled'}>${t('playN', ord.length)}</button>
        <button class="btn wide" id="pxClear" style="margin-top:8px">${ord.length === list.length ? t('clearOrder') : t('selectAll')}</button>
        <button class="textlink" id="pxCancel">${t('cancel')}</button>`);
      const slots = [...$('pickRow').querySelectorAll('.slot[data-k]')];
      slots.forEach(el => el.onpointerdown = e => {
        if (e.button > 0) return;
        const sx = e.clientX, sy = e.clientY, k = +el.dataset.k;
        let moving = false, rects = null, target = k, ord2 = null;
        try { el.setPointerCapture(e.pointerId); } catch (x) {}
        const move = ev => {
          const dx = ev.clientX - sx, dy = ev.clientY - sy;
          if (!moving && Math.hypot(dx, dy) > 8) { moving = true; TIP.hide(); rects = slotRects(slots); $('pickRow').classList.add('reorder'); el.classList.add('held'); }
          if (!moving) return;
          const r = rects[k];
          const t2 = nearestSlot(rects, r.x + dx, r.y + dy);
          if (t2 !== target) { target = t2; ord2 = previewOrder(slots, rects, k, target); SFX.play('click'); }
          el.style.translate = `${dx}px ${dy}px`;
        };
        const up = () => {
          el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
          warn = '';
          if (!moving) { const c = list[k]; if (sel.has(c)) sel.delete(c); else sel.add(c); SFX.play('click'); }
          else if (ord2 && target !== k) list = ord2.map(i => list[i]);
          draw();
        };
        el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
      });
      $('pxClear').onclick = () => { sel = ord.length === list.length ? new Set() : new Set(list); warn = ''; draw(); };
      $('pxGo').onclick = () => {
        let o = order(); if (!o.length) return;
        // the first card has to fit the pile: if it doesn't, the first one that does goes in front automatically
        if (!fits(o[0])) {
          const f = o.find(fits);
          if (!f) { warn = t('firstMustFit'); SFX.play('bad'); draw(); return; }
          o = [f, ...o.filter(c => c !== f)];
        }
        closeModal(); res({ lead: o[0], extra: o.slice(1) });
      };
      $('pxCancel').onclick = () => { closeModal(); res(null); };
    };
    draw();
  });
}
function showEnd() {
  if (!G || G.winner === null || !$('modal').classList.contains('hidden') && $('modalBody').querySelector('#again,#menu')) return;
  const w = G.players[G.winner], meP = G.players[ME];
  const ranked = G.players.map((p, i) => ({ p, i })).sort((a, b) => (a.i === G.winner ? -1 : b.i === G.winner ? 1 : 0) || (a.p.elim - b.p.elim) || a.p.hand.length - b.p.hand.length);
  const won = G.winner === ME;
  modalNext = { mode: 'min', key: 'end' };
  const controls = !isHost
    ? `<p style="margin:16px 0 0">${t('waitNext')}</p><button class="textlink" id="menu">${t('leaveRoom')}</button>`
    : `<button class="btn primary wide" id="again">${t('playAgain')}</button><button class="textlink" id="menu">${t('backLobby')}</button>`;
  openModal(`<h2>${won ? t('youWin') : esc(t('wins', w.name))}</h2>
    <p>${won ? t('handEmptied') : t('finalCounts')}</p>
    <div class="list">${ranked.map((o, k) => `<div class="li"><span>${k + 1}. ${esc(o.p.name)}</span><span class="mono">${o.i === G.winner ? t('winner') : t('cardsN', o.p.hand.length)}</span></div>`).join('')}</div>
    ${controls}`);
  if ($('again')) $('again').onclick = () => { closeModal(); conn.send({ t: 'start' }); };
  $('menu').onclick = () => { closeModal(); if (isHost) conn.send({ t: 'tolobby' }); else leaveRoom(); };
}

// ================= DEALS: the angel and the demon =================
let confessSel = null, offerKey = '';
function dealBadges(p, mine, visibleAbilities) {
  const out = [];
  const ds = p.deals || [], compact = false;
  for (const d of ds) if (!visibleAbilities?.has(d)) out.push(`<span class="dealb ${isLightDeal(d) ? 'light' : 'dark'}${compact ? ' ico' : ''}" data-tipdeal="${d}">${DEAL_ICON[d] || ''}${compact ? '' : `<b>${t('deal_' + d)}</b>`}</span>`);
  for (const [k, v] of Object.entries(p.fx || {})) out.push(`<span class="itemb on" data-tipitem="${k}">${ITEM_ICON[k] || ''}${mine ? `<b>${t('item_' + k)}${k === 'rent' ? ' ' + v + '/10' : ''}</b>` : ''}</span>`);
  if (!mine && (p.inv || []).length) out.push(`<span class="itemb bag" title="${esc(p.inv.map(id => t('item_' + id)).join(', '))}">${ITEM_ICON.bag}${p.inv.length}</span>`);
  if (mine && (p.buff || 0) > 0) out.push(`<span class="chance buff" title="${t('eclipseBuff')}">${ITEM_ICON.eclipse}+${pct(p.buff)}</span>`);
  if (mine && canLight(p)) out.push(`<span class="chance light${(p.angel || 0) >= 20 && !p.signedNow ? ' hot' : ''}${p.signedNow ? ' wait' : ''}" title="${p.signedNow ? t('oddsWait') : t('angelChance')}">${DEAL_ICON.angel}${mine ? t('oddsAngel') + ' ' : ''}${pct(p.angel || 0)}</span>`);
  if (mine && canDark(p) && (p.demon || 0) > 0) out.push(`<span class="chance dark${p.demon >= 30 && !p.signedNow ? ' hot' : ''}${p.signedNow ? ' wait' : ''}" title="${p.signedNow ? t('oddsWait') : t('demonChance')}">${DEAL_ICON.demon}${mine ? t('oddsDemon') + ' ' : ''}${pct(Math.min(100, p.demon))}</span>`);

  return out.length ? `<div class="deals${mine ? ' mine' : ''}">${out.join('')}</div>` : '';
}
function dealOffer() {
  const o = G && G.offer;
  if (!o || o.pi !== ME) { if (offerKey) { offerKey = ''; if ($('modalBody').querySelector('.contract')) closeModal(); } return; }
  const key = G.gid + ':' + G.seq + ':' + o.kind;
  if (offerKey === key && (!$('modal').classList.contains('hidden') || modalState.min)) return;
  offerKey = key;
  const dark = o.kind === 'dark', me = G.players[ME], both = o.kind === 'both';
  const clause = id => `<button class="clause" data-deal="${id}">${DEAL_ICON[id] || ''}<b>${t('deal_' + id)}</b><span>${t('dealD_' + id)}</span>${dark && t('dealP_' + id) ? `<i>${t('price')}: ${t('dealP_' + id)}</i>` : ''}</button>`;
  const lit = (me.deals || []).filter(isLightDeal), fallWarn = dark && lit.length ? `<p class="fallwarn">${t('fallWarn', lit.map(d => t('deal_' + d)).join(', '))}</p>` : '';
  modalNext = { mode: 'min', key: 'offer' };
  if (both) {
    const cl = (id, dk) => `<button class="clause" data-deal="${id}">${DEAL_ICON[id] || ''}<b>${t('deal_' + id)}</b><span>${t('dealD_' + id)}</span>${dk && t('dealP_' + id) ? `<i>${t('price')}: ${t('dealP_' + id)}</i>` : ''}</button>`;
    openModal(`<div class="contract both"><div class="cHead">${ITEM_ICON.twoface}<h2>${t('item_twoface')}</h2></div><p>${t('twofaceSub')}</p>
      <div class="bothcols"><div class="contract light"><div class="cHead">${DEAL_ICON.angel}<h2>${t('angelTitle')}</h2></div><div class="clauses">${o.opts.filter(isLightDeal).map(id => cl(id, false)).join('')}</div></div>
      <div class="contract dark"><div class="cHead">${DEAL_ICON.demon}<h2>${t('demonTitle')}</h2></div><div class="clauses">${o.opts.filter(id => !isLightDeal(id)).map(id => cl(id, true)).join('')}</div></div></div></div>`);
  } else
  openModal(`<div class="contract ${dark ? 'dark' : 'light'}">
    <div class="cHead">${dark ? DEAL_ICON.demon : DEAL_ICON.angel}<h2>${dark ? t('demonTitle') : t('angelTitle')}</h2></div>
    <p>${dark ? t('demonSub') : t('angelSub')}</p>${fallWarn}
    <div class="clauses">${o.opts.map(clause).join('')}</div>
    ${dark ? `<button class="btn wide tear" id="dealNo">${t('tearUp')}</button>` : `<p class="mono small">${t('angelMust')}</p>`}</div>`);
  SFX.play(dark ? 'devil' : 'chaos');
  let done = false;
  $('modalBody').querySelectorAll('[data-deal]').forEach(b => b.onclick = async () => {
    if (done) return; done = true;
    const id = b.dataset.deal; let target = null;
    // the chosen clause gets signed (dark) or blessed (light) before the paper goes away
    b.classList.add('signed'); b.insertAdjacentHTML('beforeend', `<em class="sig">${dark ? t('signed') : t('blessed')}</em>`);
    SFX.play(dark ? 'bad' : 'win'); await new Promise(r => setTimeout(r, 650));
    if (id === 'mark') { closeModal(); target = await pickTarget(t('markQ'), t('markSub'), null, true); }
    if (id === 'exactor') { closeModal(); target = await pickTarget(t('exactorQ'), t('exactorSub'), null, true); }
    closeModal(); offerKey = ''; act('deal', { id, target });
  });
  if ($('dealNo')) $('dealNo').onclick = async () => {
    if (done) return; done = true;
    $('modalBody').querySelector('.contract').classList.add('burning'); SFX.play('flip');
    await new Promise(r => setTimeout(r, 900));
    closeModal(); offerKey = ''; act('deal', { id: null });
  };
}

// ================= ITEMS =================
const ITEM_ICON = (() => {
  const s = inner => `<svg class="dico" viewBox="0 0 32 32" aria-hidden="true"><g fill="currentColor" stroke="none">${inner}</g></svg>`;
  const cut = d => `<path d="${d}" fill="none" stroke="var(--cut, #000)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/>`;
  return {
    rent: s('<circle cx="12" cy="18" r="9"/><circle cx="20" cy="13" r="9" opacity=".8"/>' + cut('M20 8v10M17 10.5c1-1.2 5-1.2 5 .8s-5 1.4-5 3.4 4 2 5 .8')),
    veil: s('<path d="M20 3A13 13 0 1 0 29 22 10.5 10.5 0 1 1 20 3z"/><path d="M2 27h28v3H2z"/>' + cut('M6 24c4-2 8-2 12 0s8 2 12 0')),
    dawn: s('<path d="M4 24a12 12 0 0 1 24 0z"/><path d="M2 26h28v3H2z"/><path d="M16 3v6M6 8l3.5 4M26 8l-3.5 4" stroke="currentColor" stroke-width="2.4" fill="none"/>' + cut('M10 24a6 6 0 0 1 12 0')),
    shell: s('<path d="M16 2 28 7v9c0 7-5.6 12-12 14C9.6 28 4 23 4 16V7z"/>' + cut('M16 6v20M9 10l7 4 7-4M9 18l7 4 7-4')),
    oven: s('<rect x="4" y="6" width="24" height="23" rx="2"/><path d="M9 2h3v4H9zM20 2h3v4h-3z"/>' + cut('M8 13h16v12H8zM12 22c0-3 2-3 2-6 2 2 4 3 4 6a3 3 0 0 1-6 0z')),
    eclipse: s('<circle cx="16" cy="16" r="12"/><path d="M16 1v3M16 28v3M1 16h3M28 16h3M5.4 5.4l2.1 2.1M24.5 24.5l2.1 2.1M5.4 26.6l2.1-2.1M24.5 7.5l2.1-2.1" stroke="currentColor" stroke-width="2" fill="none"/>' + cut('M20 6a10 10 0 0 1 0 20 12 12 0 0 0 0-20z')),
    twoface: s('<path d="M16 3C9 3 5 8.5 5 15s4 14 11 14z"/><path d="M16 3c7 0 11 5.5 11 12s-4 14-11 14z" opacity=".55"/>' + cut('M9 13h4M19 13h4M11 21c2 1.5 3 1.5 5 0M16 21c2 2 4 2 6 0M16 3v26')),
    ward: s('<path d="M16 2c3 4 9 5 12 5 0 12-5 19-12 23C9 26 4 19 4 7c3 0 9-1 12-5z"/>' + cut('M16 9v14M10 15h12M12 12l8 8M20 12l-8 8')),
    penance: s('<path d="M9 13V9a7 7 0 0 1 14 0v4h-3V9a4 4 0 0 0-8 0v4z"/><rect x="6" y="13" width="20" height="16" rx="1.5"/>' + cut('M16 18v5M13 27h6')),
    bail: s('<circle cx="10" cy="16" r="7"/><path d="M15 14.5h14v3h-3v4h-3v-4h-2v3h-3v-3h-3z"/>' + cut('M10 16m-2.4 0a2.4 2.4 0 1 0 4.8 0 2.4 2.4 0 1 0-4.8 0')),
    cross: s('<path d="M14.5 2h3v18h6v3h-6v7h-3v-7h-6v-3h6z"/>' + cut('M12 26h8')),
    bag: s('<path d="M10 9h12l5 20H5z"/><path d="M12 9c0-6 8-6 8 0" stroke="currentColor" stroke-width="2.2" fill="none"/>' + cut('M9 16h14'))
  };
})();

// ================= THE HORSEMEN =================
const HORSE_ICON = (() => {
  const s = inner => `<svg class="dico" viewBox="0 0 32 32" aria-hidden="true"><g fill="currentColor" stroke="none">${inner}</g></svg>`;
  const cut = d => `<path d="${d}" fill="none" stroke="var(--cut, #000)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/>`;
  return {
    death: s('<path d="M6 30 24 4l2.6 1.8L8.6 31.6z"/><path d="M22.5 6.5C17 3 9 3.5 3 9c6-2 12-1.4 17.4 2.6z"/>' + cut('M8 8.4c3.6-1.6 7.6-1.6 11 .4')),
    war: s('<path d="M4 4l3 0 17 17-3 3L4 7z"/><path d="M28 4l-3 0L8 21l3 3L28 7z"/><path d="M5 23l4 4-3 3-4-4zM27 23l-4 4 3 3 4-4z"/>' + cut('M7 7l12 12M25 7 13 19')),
    famine: s('<path d="M3 14h26c0 7-5.6 12-13 12S3 21 3 14z"/><path d="M11 26h10v3H11z"/>' + cut('M7.5 17.5c1.5 3 4.6 5 8.5 5M16 14l-2 5 3 2-1.6 4')),
    plague: s('<ellipse cx="16" cy="19" rx="5" ry="8"/><circle cx="16" cy="9" r="3.6"/><path d="M11.5 15C6 8 2 11 3 15c1 3 5 3 8.5 2zM20.5 15C26 8 30 11 29 15c-1 3-5 3-8.5 2z" opacity=".75"/><path d="M13 5 10 2M19 5l3-3" stroke="currentColor" stroke-width="1.6" fill="none"/>' + cut('M12 18h8M12.5 22h7')),
    dark: s('<path d="M2 16C7 8 25 8 30 16 25 24 7 24 2 16z"/>' + cut('M6 16c5 4 15 4 20 0M10 20l-1.5 3M16 21.4V25M22 20l1.5 3')),
    fever: s('<path d="M13 4a3 3 0 0 1 6 0v14.6a6 6 0 1 1-6 0z"/>' + cut('M16 8v13M19.5 8h2M19.5 12h2M19.5 16h2')),
    mirror: s('<ellipse cx="16" cy="12" rx="9" ry="10"/><path d="M14 21h4v9h-4z"/>' + cut('M11 8c1-2 3-3 5-3M19 15l-5 3')),
    static: s('<rect x="3" y="7" width="26" height="19" rx="2"/><path d="M11 2l5 5 5-5" stroke="currentColor" stroke-width="1.8" fill="none"/>' + cut('M7 16l3-4 3 7 3-6 3 5 3-4 3 3'))
  };
})();
function myCurse() { const h = G && G.horse; return h && h.k === 'death' && h.left > 0 && !G.warded(ME) ? h.curses[ME] || null : null; }
let curseOn = '', feverSeed = 1, warEnd = 0, warMine = false;
function drawHorse() {
  const h = G && G.horse && G.horse.left > 0 && (!MATCH || MATCH.phase === 'play') ? G.horse : null;
  const bar = $('horseBar');
  if (!h) { bar.classList.add('hidden'); setCurse(''); warMine = false; $('warClock').classList.add('hidden'); return; }
  const c = myCurse();
  bar.classList.remove('hidden'); bar.className = 'hb-' + h.k;
  setHTML(bar, `${HORSE_ICON[h.k]}<b>${t('horse_' + h.k)}</b><span>${c ? `${HORSE_ICON[c]}<em>${t('curse_' + c)}</em> · ${t('curseD_' + c)}` : t('horseD_' + h.k + '_' + h.v)}</span><i>${t('horseLeft', h.left)}</i>`);
  setCurse(c || '');
  const w = MATCH && MATCH.war;
  warMine = !!(w && w[0] === ME && G.turn === ME && G.winner === null && !G.warded(ME));
  if (warMine) warEnd = performance.now() + w[1];
}
// Static: the old-software crash keeps hitting while the curse lasts
setInterval(() => { if (curseOn === 'static' && !document.hidden && Math.random() < 0.55) { JUICE.glitch(true); if (Math.random() < 0.35) setTimeout(() => JUICE.glitch(true), 260); } }, 2200);
function setCurse(c) {
  if (c === curseOn) return;
  document.body.classList.remove('curse-' + curseOn);
  curseOn = c;
  if (c) document.body.classList.add('curse-' + c);
  $('curseDark').classList.toggle('hidden', c !== 'dark');
  $('curseStatic').classList.toggle('hidden', c !== 'static');
  if (c === 'dark' && !curseDarkMoved) { const r = $('hand').getBoundingClientRect(); moveDark(r.left + r.width / 2, r.top + r.height / 2); }
}
let curseDarkMoved = false, darkRaf = 0, darkXY = [0, 0];
function moveDark(x, y) { darkXY = [x, y]; if (darkRaf) return; darkRaf = requestAnimationFrame(() => { darkRaf = 0; const el = $('curseDark'); el.style.setProperty('--mx', darkXY[0] + 'px'); el.style.setProperty('--my', darkXY[1] + 'px'); }); }
addEventListener('pointermove', e => { if (curseOn === 'dark') { curseDarkMoved = true; moveDark(e.clientX, e.clientY); } }, { passive: true });
addEventListener('pointerdown', e => { if (curseOn === 'dark') { curseDarkMoved = true; moveDark(e.clientX, e.clientY); } }, { passive: true });
// Fever: the hand reshuffles itself every 2 seconds (never while you hold a card)
setInterval(() => { if (curseOn === 'fever' && !dragging && G && !document.hidden) { feverSeed++; render(); } }, 1000);
function feverShuffle(a) {
  let x = feverSeed * 9301 + 49297; const r = () => (x = (x * 9301 + 49297) % 233280) / 233280;
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// War: the turn clock, shown big for the player whose turn it is
setInterval(() => {
  const el = $('warClock');
  if (!warMine) { if (!el.classList.contains('hidden')) el.classList.add('hidden'); return; }
  const left = warEnd - performance.now(), n = Math.max(0, Math.ceil(left / 1000));
  el.classList.toggle('hidden', n <= 0);
  if (el.textContent !== String(n)) { el.textContent = n; el.classList.toggle('hot', n <= 2); el.classList.remove('tick'); void el.offsetWidth; el.classList.add('tick'); }
}, 100);
function horsePop(k, v) {
  const el = $('horsePop'), c = myCurse();
  el.className = 'hp-' + k;
  el.innerHTML = `<div class="hpIn"><small>${t('horseRides')}</small>${HORSE_ICON[k]}<h2>${t('horse_' + k)}</h2><p>${t('horseD_' + k + '_' + v)}</p>${c ? `<p class="hpCurse">${HORSE_ICON[c]}<b>${t('curse_' + c)}</b> ${t('curseD_' + c)}</p>` : ''}</div>`;
  clearTimeout(horsePop.tm); horsePop.tm = setTimeout(() => el.classList.add('hidden'), 4200);
}
document.addEventListener('click', e => {
  const u = e.target.closest && e.target.closest('[data-use]');
  if (u && !u.disabled) { SFX.play('lucky'); act('item', { id: u.dataset.use }); }
});
document.addEventListener('click', e => {
  const b = e.target.closest('[data-ab]'); if (!b || b.disabled || !G) return;
  const k = b.dataset.ab;
  if (k === 'confess') {
    if (!confessSel) { confessSel = new Set(); toast(t('abConfessHint')); render(); return; }
    const ids = G.players[ME].hand.filter(c => confessSel.has(c.id)).map(c => c.wid); confessSel = null;
    if (ids.length) act('ability', { ab: 'confess', ids }); else render();
    return;
  }
  act('ability', { ab: k });
});

// ================= DEBT MATCH: draft, settlement + shop, final =================
let overlayKey = '', draftSel = new Set();
const secsLeft = () => MATCH ? Math.max(0, Math.ceil((MATCH.until - Date.now()) / 1000)) : 0;
setInterval(() => { const el = document.getElementById('phaseClock'); if (el) el.textContent = t('secsLeft', secsLeft()); }, 500);
const TOKEN_T = id => [t('tok_' + id), t('tokD_' + id)];
function matchOverlay() {
  const M = MATCH; if (!M || !G) return;
  const rulesOpen = !$('modal').classList.contains('hidden') && $('modalBody').querySelector('#closeR');
  if (rulesOpen) return;
  if (M.phase === 'play') { if (overlayKey) { overlayKey = ''; closeModal(); } return; }
  // re-render only when something the dialog shows has changed
  const key = JSON.stringify([M.phase, M.round, M.passed, M.chips, M.debt, M.done, M.setup, M.hope, M.dark, M.inv, G.players[ME].hand.length, [...draftSel]]);
  if (key === overlayKey) return; overlayKey = key;
  modalNext = { mode: 'min', key: 'phase:' + M.phase + ':' + M.round };
  if (M.phase === 'draft') return drawDraft(M);
  if (M.phase === 'shop') return drawShop(M);
  if (M.phase === 'over') return drawOver(M);
}
function drawDraft(M) {
  if (M.withdrawn?.[ME]) return openModal(`<h2>${t('draftTitle')}</h2><p>${networkText('Вы выбыли из матча.', 'You are out of this match.')}</p>`);
  if (M.col[ME]) return openModal(`<h2>${t('draftTitle')}</h2><p>${t('draftCol')}</p><p class="mono" id="phaseClock">${t('secsLeft', secsLeft())}</p>`);
  if (M.passed) return openModal(`<h2>${t('draftTitle')}</h2><p>${t('draftWait')}</p><p class="mono" id="phaseClock">${t('secsLeft', secsLeft())}</p>`);
  const hand = sortedHand(G.players[ME].hand), to = G.players[G.nextIdx(ME, 1)];
  for (const id of [...draftSel]) if (!hand.some(c => c.id === id)) draftSel.delete(id);
  openModal(`<h2>${t('draftTitle')} · ${t('roundN', M.round)}</h2><p>${t('draftSub', esc(to ? to.name : ''))}${hand.some(c => G.f(c).c === 'x') ? `<br><b class="badhint">${t('draftBadHint')}</b>` : ''}</p>
    <div class="pick draftpick">${hand.map(c => `<div class="slot">${faceHTML(G.f(c), G.side, draftSel.has(c.id) ? 'lead' : 'off', c.id)}</div>`).join('')}</div>
    <button class="btn primary wide" id="draftGo" ${draftSel.size === Math.min(2, hand.length) ? '' : 'disabled'}>${t('draftGo', draftSel.size)}</button>
    <p class="mono" id="phaseClock">${t('secsLeft', secsLeft())}</p>`);
  $('modalBody').querySelectorAll('.draftpick .card').forEach(el => el.onclick = () => {
    const id = +el.dataset.id || el.dataset.id; const c = hand.find(x => String(x.id) === String(el.dataset.id)); if (!c) return;
    if (draftSel.has(c.id)) draftSel.delete(c.id); else if (draftSel.size < 2) draftSel.add(c.id);
    SFX.play('click'); overlayKey = ''; matchOverlay();
  });
  $('draftGo').onclick = () => { const ids = hand.filter(c => draftSel.has(c.id)).map(c => c.wid); draftSel.clear(); SFX.play('play'); conn.send({ t: 'draft', ids }); };
}
// a small line of a player's debt after each deal, with the limit drawn across the top
function debtSpark(M, i) {
  const h = (M.hist || [])[i] || [0], lim = ((M.limits || [])[i] || M.limit), W = 84, H = 22;
  const top = Math.max(lim, ...h) * 1.05, x = k => h.length < 2 ? W : (k / (h.length - 1)) * W, y = v => H - (v / top) * H;
  const pts = h.map((v, k) => `${x(k).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="-2 -2 ${W + 4} ${H + 4}" aria-hidden="true"><line x1="0" x2="${W}" y1="${y(lim).toFixed(1)}" y2="${y(lim).toFixed(1)}" class="lim"/><polyline points="${pts}"/>${h.map((v, k) => `<circle cx="${x(k).toFixed(1)}" cy="${y(v).toFixed(1)}" r="1.6"/>`).join('')}</svg>`;
}
function settleTable(M) {
  const L = M.last; if (!L) return '';
  return `<div class="list settle">${L.rows.slice().sort((a, b) => M.debt[a.i] - M.debt[b.i]).map(r => `<div class="li ${L.out.includes(r.i) ? 'outrow' : ''}">
    <span>${debtSpark(M, r.i)}${esc(G.players[r.i].name)}${r.i === L.winner ? ` <b class="stampmini">${t('dealWon')}</b>` : ''}${L.out.includes(r.i) ? ` <b class="stampmini">${t('outCollector')}</b>` : ''}</span>
    <span class="mono">${(r.i === L.winner ? '—' : t('cardsN', r.cards)) + ` · ${t('turnDebt', r.turn || 0)} · ${t('handDebt', r.paid)}`} · ${t('debtTot', M.debt[r.i], (M.limits || [])[r.i] || M.limit)} · +${r.chips}¢</span></div>`).join('')}</div>`;
}
function drawShop(M) {
  const L = M.last, won = L && L.winner === ME;
  modalNext = Object.assign(modalNext || {}, { cls: 'shop', fit: true });
  const head = `<h2>${t('shopTitle', M.round)}</h2>${settleTable(M)}`;
  if (M.col[ME]) return openModal(head + `<p>${t('youCollector')}</p><p class="mono" id="phaseClock">${t('secsLeft', secsLeft())}</p>`);
  if (M.done[ME]) return openModal(head + `<p>${t('shopWait')}</p><p class="mono" id="phaseClock">${t('secsLeft', secsLeft())}</p>`);
  const chips = M.chips[ME], P = { token: 20, pay: 10, payAmount: 25, setup: 15, interest: 25, candle: 10, blood: 10 };
  const rivals = G.players.map((p, i) => i).filter(i => i !== ME && !M.col[i]);
  const mine = M.tokens[ME].map(id => `<div class="tok own"><b>${TOKEN_T(id)[0]}</b><span>${TOKEN_T(id)[1]}</span></div>`).join('');
  const offers = M.offers.map(id => `<button class="tok" data-tok="${id}" ${chips < P.token || M.tokens[ME].length >= 3 ? 'disabled' : ''}><b>${TOKEN_T(id)[0]}</b><span>${TOKEN_T(id)[1]}</span><i>${P.token}¢</i></button>`).join('');
  openModal(`<h2>${t('shopTitle', M.round)}</h2><div class="shopgrid"><div class="shopl">${settleTable(M)}
    <div class="wallet"><span>${t('walletChips', chips)}</span><span>${t('walletDebt', M.debt[ME], M.limit)}</span></div>
    <span class="label sublabel">${t('shopPay')}</span>
    <button class="btn" id="shopPay" ${chips < P.pay || M.debt[ME] <= 0 ? 'disabled' : ''}>${t('payBtn', P.pay, P.payAmount)}</button>
    </div><div class="shopr">
    ${M.hope ? `<span class="label sublabel">${t('shopVisitors')}</span><div class="goods">
      <button class="btn good light" id="buyCandle" ${chips < P.candle || M.hope[2] ? 'disabled' : ''}>${DEAL_ICON.candle}<span>${t('buyCandle', P.candle)}</span><i>${M.hope[2] ? '—' : pct(M.hope[0])}</i></button>
      <button class="btn good dark" id="buyBlood" ${chips < P.blood || M.hope[3] ? 'disabled' : ''}>${DEAL_ICON.blood}<span>${t('buyBlood', P.blood)}</span><i>${M.hope[3] ? '—' : pct(Math.min(100, M.hope[1]))}</i></button></div>` : ''}
    ${(M.dark || []).length || (M.inv && M.inv[ME] && M.inv[ME].length) ? `<span class="label sublabel">${t('darkShop')}</span>
      ${(M.dark || []).length ? `<div class="darkshop">${M.dark.map(id => `<button class="item buy" data-item="${id}" data-tipitem="${id}" ${chips < ITEM_PRICE[id] ? 'disabled' : ''}>${ITEM_ICON[id]}<b>${t('item_' + id)}</b><span>${t('itemD_' + id)}</span><i>${ITEM_PRICE[id]}¢</i></button>`).join('')}</div>` : ''}
      ${M.inv && M.inv[ME] && M.inv[ME].length ? `<p class="mono small">${t('invHave')}: ${M.inv[ME].map(id => t('item_' + id)).join(', ')}</p>` : ''}` : ''}
    <span class="label sublabel">${t('shopTricks')}</span>
    <div class="tricks">${rivals.map(i => `<div class="trick"><span>${esc(G.players[i].name)}${M.setup[i] ? ` · +${M.setup[i]}` : ''}</span>
      <button class="btn" data-trick="setup" data-t="${i}" ${chips < P.setup ? 'disabled' : ''}>${t('trickSetup', P.setup)}</button>
      <button class="btn" data-trick="interest" data-t="${i}" ${chips < P.interest ? 'disabled' : ''}>${t('trickInterest', P.interest)}</button></div>`).join('')}</div>
    </div></div>
    <button class="btn primary wide" id="shopDone">${t('shopDone')}</button>
    <p class="mono" id="phaseClock">${t('secsLeft', secsLeft())}</p>`);
  $('modalBody').querySelectorAll('[data-tok]').forEach(b => b.onclick = () => { SFX.play('coin'); conn.send({ t: 'shop', a: { k: 'token', id: b.dataset.tok } }); });
  $('modalBody').querySelectorAll('[data-item]').forEach(b => b.onclick = () => { SFX.play('coin'); conn.send({ t: 'shop', a: { k: 'item', id: b.dataset.item } }); });
  $('shopPay').onclick = () => { SFX.play('coin'); conn.send({ t: 'shop', a: { k: 'pay' } }); };
  if ($('buyCandle')) $('buyCandle').onclick = () => { SFX.play('coin'); conn.send({ t: 'shop', a: { k: 'candle' } }); };
  if ($('buyBlood')) $('buyBlood').onclick = () => { SFX.play('devil'); conn.send({ t: 'shop', a: { k: 'blood' } }); };
  $('modalBody').querySelectorAll('[data-trick]').forEach(b => b.onclick = () => { SFX.play('bad'); conn.send({ t: 'shop', a: { k: b.dataset.trick, target: +b.dataset.t } }); });
  $('shopDone').onclick = () => { SFX.play('click'); conn.send({ t: 'shop', a: { k: 'done' } }); };
}
function drawOver(M) {
  const champ = M.champ, won = champ === ME;
  const order = G.players.map((p, i) => i).sort((a, b) => (a === champ ? -1 : b === champ ? 1 : M.debt[a] - M.debt[b]));
  const controls = !isHost
    ? `<p style="margin:16px 0 0">${t('waitNext')}</p><button class="textlink" id="menu">${t('leaveRoom')}</button>`
    : `<button class="btn primary wide" id="again">${t('playAgain')}</button><button class="textlink" id="menu">${t('backLobby')}</button>`;
  openModal(`<h2>${won ? t('matchWon') : esc(t('matchWins', G.players[champ].name))}</h2><p>${t('matchOverSub', M.round)}</p>${settleTable(M)}
    <div class="list">${order.map((i, k) => `<div class="li"><span>${k + 1}. ${esc(G.players[i].name)}</span><span class="mono">${t('debtTot', M.debt[i], M.limit)}</span></div>`).join('')}</div>${controls}`);
  if ($('again')) $('again').onclick = () => { closeModal(); overlayKey = ''; conn.send({ t: 'start' }); };
  $('menu').onclick = () => { closeModal(); overlayKey = ''; if (isHost) conn.send({ t: 'tolobby' }); else leaveRoom(); };
}
$('btnColGive').onclick = async () => { if (!MATCH || MATCH.colUsed) return; const tg = await pickTarget(t('colGiveQ'), t('colGiveSub'), t('cancel')); if (tg === null) return; conn.send({ t: 'col', k: 'give', target: tg }); };
$('btnColLever').onclick = () => { if (!MATCH || MATCH.colUsed) return; SFX.play('chaos'); conn.send({ t: 'col', k: 'lever' }); };
function showRules() {
  modalNext = { onCancel: () => { if (MATCH) { overlayKey = ''; matchOverlay(); } else if (G && G.winner !== null) showEnd(); } };
  openModal(`<h2>${t('howTo')}</h2><div class="rulestext">${RULES_HTML[LANG]}</div><button class="btn primary wide" id="closeR">${t('close')}</button>`);
  $('closeR').onclick = () => { closeModal(); if (MATCH) { overlayKey = ''; matchOverlay(); } else if (G && G.winner !== null) showEnd(); };
}



// ---------- card tooltip: name + what it does, on hover (mouse) or long-press (touch) ----------
const TIP = (() => {
  const el = document.createElement('div'); el.id = 'cardtip'; el.setAttribute('role', 'tooltip'); document.body.appendChild(el);
  let cur = null, pressT = 0, suppressClick = false;
  const faceOf = card => { const [side, c, v] = (card.dataset.f || '').split('|'); return v ? { side, f: { c, v } } : null; };
  function showDeal(b) {
    const id = b.dataset.tipdeal, light = isLightDeal(id); cur = b;
    const pr = t('dealP_' + id);
    el.innerHTML = `<span class="tipdealhead">${DEAL_ICON[id] || ''}<b>${esc(t('deal_' + id))}</b></span><span class="tipside">${esc(light ? t('tipLightDeal') : t('tipDarkDeal'))}</span><p>${esc(t('dealD_' + id))}</p>${pr ? `<p class="tipprice">${esc(pr)}</p>` : ''}`;
    el.className = 'show tipdeal ' + (light ? 'light' : 'dark');
    place(b);
  }
  function showItem(b) {
    const id = b.dataset.tipitem; cur = b;
    el.innerHTML = `<span class="tipdealhead">${ITEM_ICON[id] || ''}<b>${esc(t('item_' + id))}</b></span><span class="tipside">${esc(t('itemKind_' + id))} · ${ITEM_PRICE[id]}¢</span><p>${esc(t('itemD_' + id))}</p>`;
    el.className = 'show tipdeal dark tipitem';
    place(b);
  }
  function place(card) {
    const r = card.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
    let x = r.left + r.width / 2 - w / 2, y = r.top - h - 10;
    if (y < 6) y = r.bottom + 10;
    x = Math.max(6, Math.min(innerWidth - w - 6, x));
    el.style.left = x + 'px'; el.style.top = Math.min(innerHeight - h - 6, y) + 'px';
  }
  function show(card) {
    if (card.dataset.tipdeal) { if (!dragging && S.tips !== false) showDeal(card); return; }
    if (card.dataset.tipitem) { if (!dragging && S.tips !== false) showItem(card); return; }
    const d = faceOf(card); if (!d || dragging || S.tips === false) return;
    cur = card;
    const side = d.side === 'D' ? t('tDark') : t('tLight');
    // your own cards also show what's printed on their other side
    let backHTML = '';
    const mine = G && G.players[ME] && card.dataset.id && card.closest('#hand') ? G.players[ME].hand.find(c => String(c.id) === card.dataset.id) : null;
    if (mine) {
      const os = d.side === 'L' ? 'D' : 'L', bf = mine[os];
      if (bf) backHTML = `<div class="tipback"><div class="tipmini">${faceHTML(bf, os, 'mini')}</div><div><span class="tipside">${esc(t('tipBack'))} · ${esc(os === 'D' ? t('tDark') : t('tLight'))}</span><b>${esc(cardName(bf))}</b>${cardDesc(bf) ? `<p>${esc(cardDesc(bf))}</p>` : ''}</div></div>`;
    }
    el.innerHTML = `<b>${esc(cardName(d.f))}</b><span class="tipside">${esc(side)}</span>${cardDesc(d.f) ? `<p>${esc(cardDesc(d.f))}</p>` : ''}${backHTML}`;
    el.className = 'show s-' + d.side;
    place(card);
  }
  function hide() { cur = null; el.className = ''; }
  document.addEventListener('pointerover', e => {
    if (e.pointerType !== 'mouse') return;
    if (dragging || document.querySelector('.pick.reorder')) { if (cur) hide(); return; }
    const card = e.target.closest && e.target.closest('.card[data-f], [data-tipdeal], [data-tipitem]');
    if (card && card !== cur) show(card); else if (!card && cur) hide();
  });
  document.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') { hide(); return; }
    const card = e.target.closest && e.target.closest('.card[data-f], [data-tipdeal], [data-tipitem]');
    clearTimeout(pressT); hide();
    if (card) { const x0 = e.clientX, y0 = e.clientY; pressT = setTimeout(() => { show(card); suppressClick = true; }, 450);
      const mv = ev => { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 8) { clearTimeout(pressT); document.removeEventListener('pointermove', mv, true); } };
      document.addEventListener('pointermove', mv, true); setTimeout(() => document.removeEventListener('pointermove', mv, true), 600); }
  }, true);
  document.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') hide(); }, true);
  const end = () => { clearTimeout(pressT); if (cur && suppressClick) setTimeout(hide, 1600); };
  document.addEventListener('pointerup', end, true);
  document.addEventListener('pointercancel', end, true);
  // a long-press to read a card must not also play it
  document.addEventListener('click', e => { if (suppressClick) { suppressClick = false; e.stopPropagation(); e.preventDefault(); } }, true);
  document.addEventListener('contextmenu', e => { if (e.target.closest && e.target.closest('.card[data-f]')) e.preventDefault(); });
  addEventListener('scroll', hide, true);
  return { hide };
})();


// ---------- combo score panel, Balatro style: name, chips × mult, payout ----------
let comboTimer = 0;
function showCombo(e) {
  let el = $('combo');
  if (!el) { el = document.createElement('div'); el.id = 'combo'; $('game').appendChild(el); }
  const pay = [e.d ? t('comboToss', e.d) : '', e.slap >= 0 && e.sd ? t('comboNightSlap', nm(e.slap), e.sd) : '', e.m ? t('comboHit', e.m) : '', e.r ? t('comboRelief', e.r) : ''].filter(Boolean).join(' · ');
  el.innerHTML = `<span class="cwho">${esc(nm(e.pi))}</span><b class="cname">${t('combo_' + e.key)}</b><div class="cscore"><span class="chips">${e.chips}</span><i>×</i><span class="mult">${e.mult}</span></div>${pay ? `<span class="cpay">${esc(pay)}</span>` : ''}`;
  // sits on the top edge of the pile area, never over the day/night panel next to it
  // over the draw pile and the discard, no wider than them, so it never covers the day/night panel
  { const pr = document.querySelector('.piles'); if (pr) { const r = pr.getBoundingClientRect(); el.style.left = (r.left + r.width / 2) + 'px'; el.style.top = Math.max(8, r.top + 8) + 'px'; el.style.maxWidth = Math.max(220, r.width - 16) + 'px'; } }
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  const big = e.m > 0 || e.mult >= 3;
  SFX.play('mult', Math.min(4, e.mult)); setTimeout(() => SFX.play('lucky'), 180);
  JUICE.shake(big ? 4 : 2);
  JUICE.comboFlame(el.querySelector('.mult'), Math.min(8, 1.5 + e.mult * 1.2), 1700);
  const r = el.getBoundingClientRect(); JUICE.burst(r.left + r.width / 2, r.top + r.height / 2, 40 + e.mult * 10, ['#009dff', '#fe5f55', '#ffd23f', '#fff'], 1.2);
  clearTimeout(comboTimer); comboTimer = setTimeout(() => el.classList.remove('show'), 1900);
}


// ================= MUSIC =================
const AMB = {
  apply() {
    if (!tracks.length || !SFX.ctx) { updateMusicControls(); return; }
    music ??= createMusic(SFX.ctx, updateMusicControls);
    this.volume();
    this.setSide(document.body.classList.contains('dark') ? 'D' : 'L');
    void music.apply(S.sound && S.ambient !== 'off');
  },
  volume() { music?.setVolume(S.ambVol ?? 0.35); },
  setSide(side) { music?.setNight(side === 'D'); },
};

document.addEventListener('pointerdown', () => { SFX.init(); AMB.apply(); }, { once: true });
document.addEventListener('click', event => {
  const button = event.target.closest('[data-music-action]');
  if (!button || button.disabled) return;
  SFX.init();
  if (button.dataset.musicAction === 'toggle') {
    const playing = music?.status === 'playing' || music?.status === 'loading';
    S.ambient = playing ? 'off' : 'on';
    saveSettings();
    AMB.apply();
  } else {
    if (!music) AMB.apply();
    music?.move(button.dataset.musicAction === 'next' ? 1 : -1);
  }
  updateMusicControls();
});

// ================= SETTINGS =================
function showSettings() {
  const seg = (id, val, opts) => `<div class="seg" id="${id}">${opts.map(([v, label]) => `<button data-v="${v}" class="${String(val) === String(v) ? 'on' : ''}">${label}</button>`).join('')}</div>`;
  const slider = (id, val) => `<input type="range" id="${id}" min="0" max="100" value="${Math.round((val ?? 0.5) * 100)}">`;
  openModal(`<h2>${t('settings')}</h2><div class="settings">
    <div class="set"><span>${t('menuLang')}</span>${seg('stLang', LANG, Object.entries(LANGS))}</div>
    <div class="set"><span>${t('setSound')}</span>${seg('stSound', S.sound ? 1 : 0, [[1, t('on')], [0, t('off')]])}</div>
    <div class="set"><span>${t('setVolume')}</span>${slider('stVol', S.vol)}</div>
    <div class="set"><span>${t('setAmbient')}</span>${seg('stAmb', S.ambient === 'off' ? 'off' : 'on', [['on', t('on')], ['off', t('off')]])}</div>
    <div class="set"><span>${t('setAmbVol')}</span>${slider('stAmbVol', S.ambVol)}</div>
    <div class="set"><span>${t('menuFx')}</span>${seg('stFx', S.fx, [['full', t('fxFull')], ['lite', t('fxLite')]])}</div>
    <div class="set"><span>${t('setMusicFx')}</span>${seg('stMusicFx', S.musicFx !== false ? 1 : 0, [[1, t('on')], [0, t('off')]])}</div>
    <div class="set"><span>${t('setShake')}</span>${seg('stShake', S.shake !== false ? 1 : 0, [[1, t('on')], [0, t('off')]])}</div>
    <div class="set"><span>${t('setBg')}</span>${seg('stBg', S.bgMotion !== false ? 1 : 0, [[1, t('bgMoving')], [0, t('bgStill')]])}</div>
    <div class="set"><span>${t('setTips')}</span>${seg('stTips', S.tips !== false ? 1 : 0, [[1, t('on')], [0, t('off')]])}</div>
    ${S.cactusFound ? `<div class="set cactusset"><span>${t('setCactus')}</span>${seg('stCactus', S.cactus ? 1 : 0, [[1, t('on')], [0, t('off')]])}</div>` : ''}
  </div>${musicControls()}<button class="btn primary wide" id="stClose" style="margin-top:16px">${t('close')}</button>`);
  updateMusicControls();
  const bindSeg = (id, fn) => $(id).querySelectorAll('button').forEach(b => b.onclick = () => { fn(b.dataset.v); SFX.play('click'); showSettings(); });
  bindSeg('stLang', v => setLang(v));
  bindSeg('stSound', v => { S.sound = v === '1'; saveSettings(); if (S.sound) SFX.init(); $('btnSound').textContent = S.sound ? t('soundOn') : t('soundOff'); AMB.apply(); });
  bindSeg('stAmb', v => { S.ambient = v; saveSettings(); SFX.init(); AMB.apply(); });
  bindSeg('stFx', v => setFx(v));
  bindSeg('stShake', v => { S.shake = v === '1'; saveSettings(); });
  bindSeg('stMusicFx', v => { S.musicFx = v === '1'; saveSettings(); });
  bindSeg('stBg', v => { S.bgMotion = v === '1'; saveSettings(); });
  bindSeg('stTips', v => { S.tips = v === '1'; saveSettings(); });
  if ($('stCactus')) bindSeg('stCactus', v => { S.cactus = v === '1'; saveSettings(); drawCactus(); });
  // the secret: knock on the title five times
  let knocks = 0; const h2 = $('modalBody').querySelector('h2');
  if (h2 && !S.cactusFound) h2.onclick = () => { if (++knocks >= 5) { S.cactusFound = true; S.cactus = true; saveSettings(); SFX.play('lucky'); drawCactus(); showSettings(); toast(t('cactusFound')); } else SFX.play('tick'); };
  $('stVol').oninput = e => { S.vol = e.target.value / 100; saveSettings(); if (SFX.master) SFX.master.gain.value = 0.9 * S.vol; };
  $('stVol').onchange = () => SFX.play('stack', 6);
  $('stAmbVol').oninput = e => { S.ambVol = e.target.value / 100; saveSettings(); AMB.volume(); };
  $('stClose').onclick = closeModal;
}
document.querySelectorAll('[data-settings]').forEach(b => b.onclick = showSettings);
// a small potted cactus at the corner of the felt; poke it and it wobbles
const CACTUS_SVG = `<svg viewBox="0 0 32 32" aria-hidden="true"><g shape-rendering="crispEdges"><rect x="11" y="1" width="3" height="1" fill="#7f4529"/><rect x="14" y="1" width="4" height="1" fill="#bb7650"/><rect x="18" y="1" width="3" height="1" fill="#7f4529"/><rect x="8" y="2" width="2" height="1" fill="#7f4529"/><rect x="10" y="2" width="12" height="1" fill="#bb7650"/><rect x="22" y="2" width="2" height="1" fill="#7f4529"/><rect x="7" y="3" width="1" height="1" fill="#7f4529"/><rect x="8" y="3" width="4" height="1" fill="#bb7650"/><rect x="12" y="3" width="8" height="1" fill="#6e3d27"/><rect x="20" y="3" width="2" height="1" fill="#bb7650"/><rect x="22" y="3" width="2" height="1" fill="#a35f3d"/><rect x="24" y="3" width="1" height="1" fill="#7f4529"/><rect x="6" y="4" width="1" height="1" fill="#7f4529"/><rect x="7" y="4" width="3" height="1" fill="#bb7650"/><rect x="10" y="4" width="1" height="1" fill="#6e3d27"/><rect x="11" y="4" width="2" height="1" fill="#3b2a1e"/><rect x="13" y="4" width="1" height="1" fill="#4e3828"/><rect x="14" y="4" width="7" height="1" fill="#3b2a1e"/><rect x="21" y="4" width="1" height="1" fill="#6e3d27"/><rect x="22" y="4" width="3" height="1" fill="#a35f3d"/><rect x="25" y="4" width="1" height="1" fill="#7f4529"/><rect x="5" y="5" width="1" height="1" fill="#7f4529"/><rect x="6" y="5" width="2" height="1" fill="#bb7650"/><rect x="8" y="5" width="1" height="1" fill="#6e3d27"/><rect x="9" y="5" width="10" height="1" fill="#3b2a1e"/><rect x="19" y="5" width="1" height="1" fill="#4e3828"/><rect x="20" y="5" width="3" height="1" fill="#3b2a1e"/><rect x="23" y="5" width="1" height="1" fill="#6e3d27"/><rect x="24" y="5" width="2" height="1" fill="#a35f3d"/><rect x="26" y="5" width="1" height="1" fill="#7f4529"/><rect x="4" y="6" width="1" height="1" fill="#7f4529"/><rect x="5" y="6" width="2" height="1" fill="#bb7650"/><rect x="7" y="6" width="1" height="1" fill="#6e3d27"/><rect x="8" y="6" width="6" height="1" fill="#3b2a1e"/><rect x="14" y="6" width="1" height="1" fill="#7c9c5a"/><rect x="15" y="6" width="2" height="1" fill="#e4dcbb"/><rect x="17" y="6" width="1" height="1" fill="#7c9c5a"/><rect x="18" y="6" width="6" height="1" fill="#3b2a1e"/><rect x="24" y="6" width="1" height="1" fill="#6e3d27"/><rect x="25" y="6" width="2" height="1" fill="#a35f3d"/><rect x="27" y="6" width="1" height="1" fill="#7f4529"/><rect x="3" y="7" width="1" height="1" fill="#7f4529"/><rect x="4" y="7" width="2" height="1" fill="#bb7650"/><rect x="6" y="7" width="1" height="1" fill="#6e3d27"/><rect x="7" y="7" width="2" height="1" fill="#3b2a1e"/><rect x="9" y="7" width="1" height="1" fill="#4e3828"/><rect x="10" y="7" width="3" height="1" fill="#3b2a1e"/><rect x="13" y="7" width="1" height="1" fill="#3a5230"/><rect x="14" y="7" width="4" height="1" fill="#7c9c5a"/><rect x="18" y="7" width="1" height="1" fill="#3a5230"/><rect x="19" y="7" width="1" height="1" fill="#3b2a1e"/><rect x="20" y="7" width="1" height="1" fill="#4e3828"/><rect x="21" y="7" width="4" height="1" fill="#3b2a1e"/><rect x="25" y="7" width="1" height="1" fill="#6e3d27"/><rect x="26" y="7" width="2" height="1" fill="#a35f3d"/><rect x="28" y="7" width="1" height="1" fill="#7f4529"/><rect x="2" y="8" width="1" height="1" fill="#7f4529"/><rect x="3" y="8" width="2" height="1" fill="#bb7650"/><rect x="5" y="8" width="1" height="1" fill="#6e3d27"/><rect x="6" y="8" width="3" height="1" fill="#3b2a1e"/><rect x="9" y="8" width="3" height="1" fill="#7c9c5a"/><rect x="12" y="8" width="2" height="1" fill="#3a5230"/><rect x="14" y="8" width="4" height="1" fill="#7c9c5a"/><rect x="18" y="8" width="2" height="1" fill="#3a5230"/><rect x="20" y="8" width="2" height="1" fill="#4d6a3c"/><rect x="22" y="8" width="1" height="1" fill="#6b8a4e"/><rect x="23" y="8" width="3" height="1" fill="#3b2a1e"/><rect x="26" y="8" width="1" height="1" fill="#6e3d27"/><rect x="27" y="8" width="2" height="1" fill="#a35f3d"/><rect x="29" y="8" width="1" height="1" fill="#7f4529"/><rect x="2" y="9" width="1" height="1" fill="#7f4529"/><rect x="3" y="9" width="2" height="1" fill="#bb7650"/><rect x="5" y="9" width="3" height="1" fill="#3b2a1e"/><rect x="8" y="9" width="1" height="1" fill="#7c9c5a"/><rect x="9" y="9" width="1" height="1" fill="#e4dcbb"/><rect x="10" y="9" width="2" height="1" fill="#7c9c5a"/><rect x="12" y="9" width="2" height="1" fill="#3a5230"/><rect x="14" y="9" width="3" height="1" fill="#7c9c5a"/><rect x="17" y="9" width="1" height="1" fill="#4d6a3c"/><rect x="18" y="9" width="2" height="1" fill="#3a5230"/><rect x="20" y="9" width="1" height="1" fill="#4d6a3c"/><rect x="21" y="9" width="1" height="1" fill="#6b8a4e"/><rect x="22" y="9" width="1" height="1" fill="#e4dcbb"/><rect x="23" y="9" width="1" height="1" fill="#6b8a4e"/><rect x="24" y="9" width="3" height="1" fill="#3b2a1e"/><rect x="27" y="9" width="2" height="1" fill="#a35f3d"/><rect x="29" y="9" width="1" height="1" fill="#7f4529"/><rect x="2" y="10" width="2" height="1" fill="#bb7650"/><rect x="4" y="10" width="1" height="1" fill="#6e3d27"/><rect x="5" y="10" width="1" height="1" fill="#4e3828"/><rect x="6" y="10" width="2" height="1" fill="#3b2a1e"/><rect x="8" y="10" width="5" height="1" fill="#7c9c5a"/><rect x="13" y="10" width="2" height="1" fill="#3a5230"/><rect x="15" y="10" width="1" height="1" fill="#7c9c5a"/><rect x="16" y="10" width="1" height="1" fill="#6b8a4e"/><rect x="17" y="10" width="2" height="1" fill="#3a5230"/><rect x="19" y="10" width="1" height="1" fill="#4d6a3c"/><rect x="20" y="10" width="3" height="1" fill="#6b8a4e"/><rect x="23" y="10" width="1" height="1" fill="#4d6a3c"/><rect x="24" y="10" width="3" height="1" fill="#3b2a1e"/><rect x="27" y="10" width="1" height="1" fill="#6e3d27"/><rect x="28" y="10" width="2" height="1" fill="#a35f3d"/><rect x="1" y="11" width="1" height="1" fill="#7f4529"/><rect x="2" y="11" width="2" height="1" fill="#bb7650"/><rect x="4" y="11" width="4" height="1" fill="#3b2a1e"/><rect x="8" y="11" width="3" height="1" fill="#7c9c5a"/><rect x="11" y="11" width="1" height="1" fill="#e4dcbb"/><rect x="12" y="11" width="1" height="1" fill="#7c9c5a"/><rect x="13" y="11" width="2" height="1" fill="#3a5230"/><rect x="15" y="11" width="2" height="1" fill="#6b8a4e"/><rect x="17" y="11" width="2" height="1" fill="#3a5230"/><rect x="19" y="11" width="1" height="1" fill="#6b8a4e"/><rect x="20" y="11" width="1" height="1" fill="#e4dcbb"/><rect x="21" y="11" width="1" height="1" fill="#6b8a4e"/><rect x="22" y="11" width="2" height="1" fill="#4d6a3c"/><rect x="24" y="11" width="4" height="1" fill="#3b2a1e"/><rect x="28" y="11" width="2" height="1" fill="#a35f3d"/><rect x="30" y="11" width="1" height="1" fill="#7f4529"/><rect x="1" y="12" width="1" height="1" fill="#7f4529"/><rect x="2" y="12" width="1" height="1" fill="#bb7650"/><rect x="3" y="12" width="1" height="1" fill="#6e3d27"/><rect x="4" y="12" width="2" height="1" fill="#3b2a1e"/><rect x="6" y="12" width="1" height="1" fill="#4e3828"/><rect x="7" y="12" width="1" height="1" fill="#3b2a1e"/><rect x="8" y="12" width="2" height="1" fill="#3a5230"/><rect x="10" y="12" width="4" height="1" fill="#7c9c5a"/><rect x="14" y="12" width="1" height="1" fill="#3a5230"/><rect x="15" y="12" width="2" height="1" fill="#4d6a3c"/><rect x="17" y="12" width="1" height="1" fill="#3a5230"/><rect x="18" y="12" width="1" height="1" fill="#4d6a3c"/><rect x="19" y="12" width="2" height="1" fill="#6b8a4e"/><rect x="21" y="12" width="1" height="1" fill="#4d6a3c"/><rect x="22" y="12" width="2" height="1" fill="#3a5230"/><rect x="24" y="12" width="4" height="1" fill="#3b2a1e"/><rect x="28" y="12" width="1" height="1" fill="#6e3d27"/><rect x="29" y="12" width="1" height="1" fill="#a35f3d"/><rect x="30" y="12" width="1" height="1" fill="#7f4529"/><rect x="1" y="13" width="1" height="1" fill="#7f4529"/><rect x="2" y="13" width="1" height="1" fill="#bb7650"/><rect x="3" y="13" width="1" height="1" fill="#6e3d27"/><rect x="4" y="13" width="3" height="1" fill="#3b2a1e"/><rect x="7" y="13" width="5" height="1" fill="#3a5230"/><rect x="12" y="13" width="1" height="1" fill="#7c9c5a"/><rect x="13" y="13" width="1" height="1" fill="#e4dcbb"/><rect x="14" y="13" width="4" height="1" fill="#4d6a3c"/><rect x="18" y="13" width="1" height="1" fill="#e4dcbb"/><rect x="19" y="13" width="1" height="1" fill="#4d6a3c"/><rect x="20" y="13" width="5" height="1" fill="#3a5230"/><rect x="25" y="13" width="3" height="1" fill="#3b2a1e"/><rect x="28" y="13" width="1" height="1" fill="#6e3d27"/><rect x="29" y="13" width="1" height="1" fill="#a35f3d"/><rect x="30" y="13" width="1" height="1" fill="#7f4529"/><rect x="1" y="14" width="2" height="1" fill="#bb7650"/><rect x="3" y="14" width="1" height="1" fill="#6e3d27"/><rect x="4" y="14" width="2" height="1" fill="#3b2a1e"/><rect x="6" y="14" width="4" height="1" fill="#7c9c5a"/><rect x="10" y="14" width="3" height="1" fill="#3a5230"/><rect x="13" y="14" width="1" height="1" fill="#4d6a3c"/><rect x="14" y="14" width="4" height="1" fill="#b8475a"/><rect x="18" y="14" width="1" height="1" fill="#4d6a3c"/><rect x="19" y="14" width="3" height="1" fill="#3a5230"/><rect x="22" y="14" width="3" height="1" fill="#4d6a3c"/><rect x="25" y="14" width="1" height="1" fill="#2f4527"/><rect x="26" y="14" width="2" height="1" fill="#3b2a1e"/><rect x="28" y="14" width="1" height="1" fill="#6e3d27"/><rect x="29" y="14" width="2" height="1" fill="#a35f3d"/><rect x="1" y="15" width="2" height="1" fill="#bb7650"/><rect x="3" y="15" width="1" height="1" fill="#6e3d27"/><rect x="4" y="15" width="2" height="1" fill="#3b2a1e"/><rect x="6" y="15" width="1" height="1" fill="#e4dcbb"/><rect x="7" y="15" width="4" height="1" fill="#7c9c5a"/><rect x="11" y="15" width="1" height="1" fill="#6b8a4e"/><rect x="12" y="15" width="2" height="1" fill="#4d6a3c"/><rect x="14" y="15" width="1" height="1" fill="#b8475a"/><rect x="15" y="15" width="2" height="1" fill="#e8a0ae"/><rect x="17" y="15" width="1" height="1" fill="#b8475a"/><rect x="18" y="15" width="2" height="1" fill="#4d6a3c"/><rect x="20" y="15" width="4" height="1" fill="#6b8a4e"/><rect x="24" y="15" width="1" height="1" fill="#3a5230"/><rect x="25" y="15" width="1" height="1" fill="#e4dcbb"/><rect x="26" y="15" width="2" height="1" fill="#3b2a1e"/><rect x="28" y="15" width="1" height="1" fill="#6e3d27"/><rect x="29" y="15" width="2" height="1" fill="#a35f3d"/><rect x="1" y="16" width="2" height="1" fill="#bb7650"/><rect x="3" y="16" width="1" height="1" fill="#6e3d27"/><rect x="4" y="16" width="2" height="1" fill="#3b2a1e"/><rect x="6" y="16" width="1" height="1" fill="#e4dcbb"/><rect x="7" y="16" width="3" height="1" fill="#7c9c5a"/><rect x="10" y="16" width="2" height="1" fill="#6b8a4e"/><rect x="12" y="16" width="2" height="1" fill="#4d6a3c"/><rect x="14" y="16" width="1" height="1" fill="#b8475a"/><rect x="15" y="16" width="2" height="1" fill="#e8a0ae"/><rect x="17" y="16" width="1" height="1" fill="#b8475a"/><rect x="18" y="16" width="2" height="1" fill="#4d6a3c"/><rect x="20" y="16" width="3" height="1" fill="#6b8a4e"/><rect x="23" y="16" width="2" height="1" fill="#3a5230"/><rect x="25" y="16" width="1" height="1" fill="#e4dcbb"/><rect x="26" y="16" width="2" height="1" fill="#3b2a1e"/><rect x="28" y="16" width="1" height="1" fill="#6e3d27"/><rect x="29" y="16" width="2" height="1" fill="#a35f3d"/><rect x="1" y="17" width="2" height="1" fill="#bb7650"/><rect x="3" y="17" width="1" height="1" fill="#6e3d27"/><rect x="4" y="17" width="2" height="1" fill="#3b2a1e"/><rect x="6" y="17" width="3" height="1" fill="#7c9c5a"/><rect x="9" y="17" width="1" height="1" fill="#4d6a3c"/><rect x="10" y="17" width="3" height="1" fill="#3a5230"/><rect x="13" y="17" width="1" height="1" fill="#4d6a3c"/><rect x="14" y="17" width="4" height="1" fill="#b8475a"/><rect x="18" y="17" width="1" height="1" fill="#4d6a3c"/><rect x="19" y="17" width="2" height="1" fill="#3a5230"/><rect x="21" y="17" width="5" height="1" fill="#2f4527"/><rect x="26" y="17" width="2" height="1" fill="#3b2a1e"/><rect x="28" y="17" width="1" height="1" fill="#6e3d27"/><rect x="29" y="17" width="2" height="1" fill="#a35f3d"/><rect x="1" y="18" width="1" height="1" fill="#7f4529"/><rect x="2" y="18" width="1" height="1" fill="#bb7650"/><rect x="3" y="18" width="1" height="1" fill="#6e3d27"/><rect x="4" y="18" width="3" height="1" fill="#3b2a1e"/><rect x="7" y="18" width="5" height="1" fill="#3a5230"/><rect x="12" y="18" width="1" height="1" fill="#4d6a3c"/><rect x="13" y="18" width="1" height="1" fill="#e4dcbb"/><rect x="14" y="18" width="4" height="1" fill="#4d6a3c"/><rect x="18" y="18" width="1" height="1" fill="#e4dcbb"/><rect x="19" y="18" width="1" height="1" fill="#4d6a3c"/><rect x="20" y="18" width="5" height="1" fill="#2f4527"/><rect x="25" y="18" width="3" height="1" fill="#3b2a1e"/><rect x="28" y="18" width="1" height="1" fill="#6e3d27"/><rect x="29" y="18" width="1" height="1" fill="#a35f3d"/><rect x="30" y="18" width="1" height="1" fill="#7f4529"/><rect x="1" y="19" width="1" height="1" fill="#7f4529"/><rect x="2" y="19" width="1" height="1" fill="#bb7650"/><rect x="3" y="19" width="1" height="1" fill="#6e3d27"/><rect x="4" y="19" width="1" height="1" fill="#4e3828"/><rect x="5" y="19" width="3" height="1" fill="#3b2a1e"/><rect x="8" y="19" width="2" height="1" fill="#3a5230"/><rect x="10" y="19" width="1" height="1" fill="#4d6a3c"/><rect x="11" y="19" width="2" height="1" fill="#6b8a4e"/><rect x="13" y="19" width="1" height="1" fill="#4d6a3c"/><rect x="14" y="19" width="1" height="1" fill="#3a5230"/><rect x="15" y="19" width="2" height="1" fill="#4d6a3c"/><rect x="17" y="19" width="1" height="1" fill="#3a5230"/><rect x="18" y="19" width="1" height="1" fill="#4d6a3c"/><rect x="19" y="19" width="1" height="1" fill="#6b8a4e"/><rect x="20" y="19" width="1" height="1" fill="#3a5230"/><rect x="21" y="19" width="3" height="1" fill="#2f4527"/><rect x="24" y="19" width="2" height="1" fill="#3b2a1e"/><rect x="26" y="19" width="1" height="1" fill="#4e3828"/><rect x="27" y="19" width="1" height="1" fill="#3b2a1e"/><rect x="28" y="19" width="1" height="1" fill="#6e3d27"/><rect x="29" y="19" width="1" height="1" fill="#a35f3d"/><rect x="30" y="19" width="1" height="1" fill="#7f4529"/><rect x="1" y="20" width="1" height="1" fill="#7f4529"/><rect x="2" y="20" width="2" height="1" fill="#bb7650"/><rect x="4" y="20" width="4" height="1" fill="#3b2a1e"/><rect x="8" y="20" width="2" height="1" fill="#4d6a3c"/><rect x="10" y="20" width="1" height="1" fill="#6b8a4e"/><rect x="11" y="20" width="1" height="1" fill="#e4dcbb"/><rect x="12" y="20" width="1" height="1" fill="#6b8a4e"/><rect x="13" y="20" width="2" height="1" fill="#3a5230"/><rect x="15" y="20" width="2" height="1" fill="#6b8a4e"/><rect x="17" y="20" width="1" height="1" fill="#3a5230"/><rect x="18" y="20" width="1" height="1" fill="#2f4527"/><rect x="19" y="20" width="1" height="1" fill="#3a5230"/><rect x="20" y="20" width="1" height="1" fill="#e4dcbb"/><rect x="21" y="20" width="1" height="1" fill="#3a5230"/><rect x="22" y="20" width="2" height="1" fill="#2f4527"/><rect x="24" y="20" width="4" height="1" fill="#3b2a1e"/><rect x="28" y="20" width="2" height="1" fill="#a35f3d"/><rect x="30" y="20" width="1" height="1" fill="#7f4529"/><rect x="2" y="21" width="2" height="1" fill="#bb7650"/><rect x="4" y="21" width="1" height="1" fill="#6e3d27"/><rect x="5" y="21" width="1" height="1" fill="#4e3828"/><rect x="6" y="21" width="2" height="1" fill="#3b2a1e"/><rect x="8" y="21" width="1" height="1" fill="#4d6a3c"/><rect x="9" y="21" width="3" height="1" fill="#6b8a4e"/><rect x="12" y="21" width="1" height="1" fill="#4d6a3c"/><rect x="13" y="21" width="2" height="1" fill="#3a5230"/><rect x="15" y="21" width="2" height="1" fill="#6b8a4e"/><rect x="17" y="21" width="3" height="1" fill="#2f4527"/><rect x="20" y="21" width="3" height="1" fill="#3a5230"/><rect x="23" y="21" width="1" height="1" fill="#2f4527"/><rect x="24" y="21" width="3" height="1" fill="#3b2a1e"/><rect x="27" y="21" width="1" height="1" fill="#6e3d27"/><rect x="28" y="21" width="2" height="1" fill="#a35f3d"/><rect x="2" y="22" width="1" height="1" fill="#7f4529"/><rect x="3" y="22" width="2" height="1" fill="#a35f3d"/><rect x="5" y="22" width="3" height="1" fill="#3b2a1e"/><rect x="8" y="22" width="1" height="1" fill="#6b8a4e"/><rect x="9" y="22" width="1" height="1" fill="#e4dcbb"/><rect x="10" y="22" width="1" height="1" fill="#6b8a4e"/><rect x="11" y="22" width="1" height="1" fill="#4d6a3c"/><rect x="12" y="22" width="2" height="1" fill="#3a5230"/><rect x="14" y="22" width="1" height="1" fill="#4d6a3c"/><rect x="15" y="22" width="2" height="1" fill="#6b8a4e"/><rect x="17" y="22" width="4" height="1" fill="#2f4527"/><rect x="21" y="22" width="1" height="1" fill="#3a5230"/><rect x="22" y="22" width="1" height="1" fill="#e4dcbb"/><rect x="23" y="22" width="1" height="1" fill="#3a5230"/><rect x="24" y="22" width="3" height="1" fill="#3b2a1e"/><rect x="27" y="22" width="2" height="1" fill="#a35f3d"/><rect x="29" y="22" width="1" height="1" fill="#7f4529"/><rect x="2" y="23" width="1" height="1" fill="#7f4529"/><rect x="3" y="23" width="2" height="1" fill="#a35f3d"/><rect x="5" y="23" width="1" height="1" fill="#6e3d27"/><rect x="6" y="23" width="1" height="1" fill="#4e3828"/><rect x="7" y="23" width="2" height="1" fill="#3b2a1e"/><rect x="9" y="23" width="1" height="1" fill="#6b8a4e"/><rect x="10" y="23" width="2" height="1" fill="#4d6a3c"/><rect x="12" y="23" width="2" height="1" fill="#3a5230"/><rect x="14" y="23" width="1" height="1" fill="#4d6a3c"/><rect x="15" y="23" width="1" height="1" fill="#6b8a4e"/><rect x="16" y="23" width="1" height="1" fill="#3a5230"/><rect x="17" y="23" width="5" height="1" fill="#2f4527"/><rect x="22" y="23" width="1" height="1" fill="#3a5230"/><rect x="23" y="23" width="3" height="1" fill="#3b2a1e"/><rect x="26" y="23" width="1" height="1" fill="#6e3d27"/><rect x="27" y="23" width="2" height="1" fill="#a35f3d"/><rect x="29" y="23" width="1" height="1" fill="#7f4529"/><rect x="3" y="24" width="1" height="1" fill="#7f4529"/><rect x="4" y="24" width="2" height="1" fill="#a35f3d"/><rect x="6" y="24" width="1" height="1" fill="#6e3d27"/><rect x="7" y="24" width="5" height="1" fill="#3b2a1e"/><rect x="12" y="24" width="1" height="1" fill="#4e3828"/><rect x="13" y="24" width="1" height="1" fill="#3a5230"/><rect x="14" y="24" width="1" height="1" fill="#4d6a3c"/><rect x="15" y="24" width="2" height="1" fill="#3a5230"/><rect x="17" y="24" width="2" height="1" fill="#2f4527"/><rect x="19" y="24" width="4" height="1" fill="#3b2a1e"/><rect x="23" y="24" width="1" height="1" fill="#4e3828"/><rect x="24" y="24" width="1" height="1" fill="#3b2a1e"/><rect x="25" y="24" width="1" height="1" fill="#6e3d27"/><rect x="26" y="24" width="2" height="1" fill="#a35f3d"/><rect x="28" y="24" width="1" height="1" fill="#7f4529"/><rect x="4" y="25" width="1" height="1" fill="#7f4529"/><rect x="5" y="25" width="2" height="1" fill="#a35f3d"/><rect x="7" y="25" width="1" height="1" fill="#6e3d27"/><rect x="8" y="25" width="6" height="1" fill="#3b2a1e"/><rect x="14" y="25" width="1" height="1" fill="#2f4527"/><rect x="15" y="25" width="2" height="1" fill="#e4dcbb"/><rect x="17" y="25" width="1" height="1" fill="#2f4527"/><rect x="18" y="25" width="1" height="1" fill="#4e3828"/><rect x="19" y="25" width="5" height="1" fill="#3b2a1e"/><rect x="24" y="25" width="1" height="1" fill="#6e3d27"/><rect x="25" y="25" width="2" height="1" fill="#a35f3d"/><rect x="27" y="25" width="1" height="1" fill="#7f4529"/><rect x="5" y="26" width="1" height="1" fill="#7f4529"/><rect x="6" y="26" width="2" height="1" fill="#a35f3d"/><rect x="8" y="26" width="1" height="1" fill="#6e3d27"/><rect x="9" y="26" width="4" height="1" fill="#3b2a1e"/><rect x="13" y="26" width="1" height="1" fill="#4e3828"/><rect x="14" y="26" width="9" height="1" fill="#3b2a1e"/><rect x="23" y="26" width="1" height="1" fill="#6e3d27"/><rect x="24" y="26" width="2" height="1" fill="#a35f3d"/><rect x="26" y="26" width="1" height="1" fill="#7f4529"/><rect x="6" y="27" width="1" height="1" fill="#7f4529"/><rect x="7" y="27" width="3" height="1" fill="#a35f3d"/><rect x="10" y="27" width="1" height="1" fill="#6e3d27"/><rect x="11" y="27" width="8" height="1" fill="#3b2a1e"/><rect x="19" y="27" width="1" height="1" fill="#4e3828"/><rect x="20" y="27" width="1" height="1" fill="#3b2a1e"/><rect x="21" y="27" width="1" height="1" fill="#6e3d27"/><rect x="22" y="27" width="3" height="1" fill="#a35f3d"/><rect x="25" y="27" width="1" height="1" fill="#7f4529"/><rect x="7" y="28" width="1" height="1" fill="#7f4529"/><rect x="8" y="28" width="4" height="1" fill="#a35f3d"/><rect x="12" y="28" width="8" height="1" fill="#6e3d27"/><rect x="20" y="28" width="4" height="1" fill="#a35f3d"/><rect x="24" y="28" width="1" height="1" fill="#7f4529"/><rect x="8" y="29" width="2" height="1" fill="#7f4529"/><rect x="10" y="29" width="12" height="1" fill="#a35f3d"/><rect x="22" y="29" width="2" height="1" fill="#7f4529"/><rect x="11" y="30" width="3" height="1" fill="#7f4529"/><rect x="14" y="30" width="4" height="1" fill="#a35f3d"/><rect x="18" y="30" width="3" height="1" fill="#7f4529"/></g></svg>`;
function drawCactus() {
  let el = document.getElementById('cactus');
  if (!S.cactus) { if (el) el.remove(); return; }
  if (el) return;
  el = document.createElement('div'); el.id = 'cactus'; el.innerHTML = CACTUS_SVG;
  el.onclick = () => { el.classList.remove('poke'); void el.offsetWidth; el.classList.add('poke'); SFX.play('tick'); };
  $('table').appendChild(el);
}
drawCactus();
