import test from 'node:test';
import assert from 'node:assert/strict';
import {createTotalWin, totalWinModel} from '../src/total-win-view.mjs';

const result = (amount = 19.234567, profit = 9.234567, winner = 'player') => Object.freeze({winner,
  player: Object.freeze({totalReturn: amount, profit, netReturn: 18, jackpotAward: 1.234567, refund: 500})});

function fixture(options = {}) {
  let time = 0, sequence = 0;
  const pending = new Map(), sounds = [], nodes = [], events = new Map();
  const schedule = (callback, delay = 0, kind = 'timer') => { const id = ++sequence; pending.set(id, {callback, at: time + delay, kind}); return id; };
  const cancel = id => pending.delete(id);
  const element = tag => {
    let text = '';
    const node = {tag, dataset: {}, attributes: {}, children: [], writes: [], hidden: false,
      style: {values: {}, setProperty(key, value) { this.values[key] = value; }},
      setAttribute(key, value) { this.attributes[key] = value; },
      append(...children) { this.children.push(...children); children.forEach(child => { child.parentNode = this; }); },
      remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this); this.removed = true; },
      get textContent() { return text; }, set textContent(value) { text = value; this.children = []; this.writes.push(value); }};
    nodes.push(node); return node;
  };
  const stage = element('main');
  const root = {hidden: false, getElementById: id => id === 'game' ? stage : null, createElement: element,
    addEventListener(type, callback) { events.set(type, callback); }, removeEventListener(type) { events.delete(type); },
    defaultView: {performance: {now: () => time}, setTimeout: (fn, delay) => schedule(fn, delay), clearTimeout: cancel,
      requestAnimationFrame: fn => schedule(fn, 16, 'frame'), cancelAnimationFrame: cancel}};
  const effects = {play: name => { sounds.push({name, time}); }};
  const api = createTotalWin({root, effects, ...options});
  function advance(milliseconds, {frames = true} = {}) {
    const end = time + milliseconds;
    while (true) {
      const item = [...pending.entries()].filter(([, value]) => value.at <= end && (frames || value.kind !== 'frame')).sort((a, b) => a[1].at - b[1].at)[0];
      if (!item) break;
      pending.delete(item[0]); time = item[1].at; item[1].callback(time);
    }
    time = end;
  }
  return {root, stage, nodes, pending, sounds, events, api, advance,
    get panel() { return nodes.find(node => node.id === 'total-win-display'); },
    get moneyLayer() { return nodes.find(node => node.className === 'win-money-layer'); },
    get amount() { return nodes.find(node => node.className === 'total-win-amount'); },
    get announcement() { return nodes.find(node => node.className === 'total-win-announcement'); }};
}

test('return uses totalReturn exactly, including JP but never adds the separate refund', () => {
  const settled = result(), before = JSON.stringify(settled);
  assert.deepEqual(totalWinModel(settled), {amount: 19.234567, outcome: 'win', label: 'TOTAL WIN', formatted: '19.234567'});
  assert.equal(JSON.stringify(settled), before);
  assert.equal(totalWinModel(result(1000000.123456)).formatted, '1,000,000.123456');
  assert.equal(totalWinModel(result(.000001)).formatted, '0.000001');
  assert.equal(totalWinModel(result(NaN)), null);
});

test('positive profit, split, returned funds and losses have truthful separate labels', () => {
  assert.equal(totalWinModel(result(20, 1, 'tie')).label, 'TOTAL WIN', 'a JP may make a split profitable');
  assert.equal(totalWinModel(result(9.6, -.4, 'tie')).label, 'SPLIT POT');
  assert.equal(totalWinModel(result(10, 0)).label, 'RETURNED');
  assert.equal(totalWinModel(result(0, -10, 'npc')).label, 'BOSS WIN');
  assert.equal(totalWinModel(result(0, -10, '')).label, 'HAND COMPLETE');
});

test('a winning label stacks TOTAL and WIN beside an exact amount; neutral labels stay truthful', async () => {
  const f = fixture({reducedMotion:true});
  await f.api.start(result(1000000.123456));
  const label = f.nodes.find(node => node.className === 'total-win-label');
  assert.deepEqual(label.children.map(node => node.textContent), ['TOTAL','WIN']);
  assert.equal(f.amount.textContent, '1,000,000.123456');
  assert.equal(f.announcement.textContent, 'TOTAL WIN 1,000,000.123456');
  assert.equal(f.panel.style.values['--total-win-font'], '17.5px');
  await f.api.start(result(9.6,-.4,'tie'));
  assert.equal(label.textContent,'SPLIT POT');
  assert.equal(label.children.length,0);
  assert.equal(f.amount.textContent,'9.6');
});

test('count reaches the precise terminal amount once, retains it and emits at most five ticks plus one tail', async () => {
  const f = fixture(), settled = result(), before = JSON.stringify(settled);
  const done = f.api.start(settled);
  assert.equal(f.amount.textContent, '0'); assert.equal(f.panel.dataset.phase, 'counting');
  f.advance(800);
  assert.ok(Number(f.amount.textContent) > 0 && Number(f.amount.textContent) < 19.234567);
  assert.equal(f.announcement.textContent, '', 'screen readers do not receive intermediate counts');
  f.advance(1200); assert.equal(await done, true); assert.equal(await f.api.whenIdle(), true);
  assert.equal(f.amount.textContent, '19.234567'); assert.equal(f.panel.dataset.phase, 'settled');
  assert.deepEqual(f.announcement.writes.filter(Boolean), ['TOTAL WIN 19.234567']);
  assert.equal(f.sounds.filter(sound => sound.name === 'chip-arrival').length, 5);
  assert.equal(f.sounds.filter(sound => sound.name === 'win').length, 1);
  assert.equal(f.pending.size, 0); f.advance(5000);
  assert.equal(f.amount.textContent, '19.234567'); assert.equal(f.panel.hidden, false);
  assert.equal(JSON.stringify(settled), before);
});

test('the same result coalesces while counting and after completion without replaying sound', async () => {
  const f = fixture(), settled = result();
  const first = f.api.start(settled);
  assert.equal(f.api.start(settled), first); f.advance(2000); await first;
  assert.equal(f.api.start(settled), first); f.advance(2000);
  assert.equal(f.sounds.length, 6); assert.equal(f.stage.children.length, 2);
});

test('clear releases old waits, cancels callbacks and restores the original pot visibility hook', async () => {
  const f = fixture(), first = f.api.start(result()), idle = f.api.whenIdle();
  f.advance(250); const oldCallback = [...f.pending.values()].find(item => item.kind === 'frame').callback;
  f.api.clear(); const sounds = f.sounds.length;
  assert.equal(await first, false); assert.equal(await idle, false);
  assert.equal(f.stage.dataset.totalWin, undefined); assert.equal(f.panel.hidden, true);
  oldCallback(); f.advance(3000);
  assert.equal(f.sounds.length, sounds); assert.equal(f.pending.size, 0);
});

test('a new result cancels the previous count so stale completion cannot overwrite it', async () => {
  const f = fixture(), first = f.api.start(result(200)), oldCallback = [...f.pending.values()].find(item => item.kind === 'frame').callback;
  f.advance(600); const second = f.api.start(result(1.234567));
  assert.equal(await first, false); assert.equal(f.amount.textContent, '0');
  oldCallback(); f.advance(2200); assert.equal(await second, true);
  assert.equal(f.amount.textContent, '1.234567'); assert.equal(f.announcement.textContent, 'TOTAL WIN 1.234567');
});

test('reduced motion, neutral returns and losses settle immediately without celebratory sounds', async () => {
  const f = fixture({reducedMotion: true});
  assert.equal(await f.api.start(result(.000001)), true);
  assert.equal(f.amount.textContent, '0.000001'); assert.equal(f.panel.dataset.motion, 'reduced');
  assert.equal(f.pending.size, 0); assert.equal(f.sounds.length, 0);
  const neutral = fixture();
  await neutral.api.start(result(9.6, -.4, 'tie'));
  assert.equal(neutral.panel.dataset.outcome, 'split'); assert.equal(neutral.amount.textContent, '9.6');
  await neutral.api.start(result(0, -10, 'npc'));
  assert.equal(neutral.panel.dataset.outcome, 'boss'); assert.equal(neutral.sounds.length, 0);
});

test('a hidden page or stalled animation frame still finishes exactly without delayed sound bursts', async () => {
  const f = fixture(), first = f.api.start(result()); f.advance(200);
  f.root.hidden = true; const count = f.sounds.length; f.events.get('visibilitychange')();
  assert.equal(await first, true); assert.equal(f.amount.textContent, '19.234567'); f.advance(3000);
  assert.equal(f.sounds.length, count); assert.equal(f.pending.size, 0);
  const stalled = fixture(), second = stalled.api.start(result(.000123));
  stalled.advance(2200, {frames: false}); assert.equal(await second, true);
  assert.equal(stalled.amount.textContent, '0.000123'); assert.equal(stalled.sounds.length, 0);
});

test('destroy is idempotent and cannot recreate a display or leave an unresolved wait', async () => {
  const f = fixture(), pending = f.api.start(result()); f.api.destroy(); f.api.destroy();
  assert.equal(await pending, false); assert.equal(f.stage.children.length, 0);
  assert.equal(f.events.size, 0); assert.equal(f.pending.size, 0);
  assert.equal(await f.api.start(result()), false);
});

test('coin celebration never draws randomness or changes the ledger and is cleared on completion', async () => {
  const f = fixture(), settled = result(), before = JSON.stringify(settled);
  const savedRandom = Math.random;
  Math.random = () => { throw new Error('Presentation must not draw randomness'); };
  try {
    const first = f.api.start(settled);
    assert.equal(f.moneyLayer.hidden, false);
    assert.ok(f.moneyLayer.children.length > 0);
    const coins = [...f.moneyLayer.children];
    f.api.start(settled);
    assert.deepEqual(f.moneyLayer.children, coins, 'same result must not respawn the celebration');
    f.advance(2200); await first;
    assert.equal(f.moneyLayer.hidden, true);
    assert.equal(f.moneyLayer.children.length, 0);
    assert.equal(JSON.stringify(settled), before);
  } finally { Math.random = savedRandom; }
});

test('coins cannot survive cancellation, a hidden page or a switch to a non-winning result', async () => {
  const f = fixture();
  const first = f.api.start(result()); f.advance(150); f.api.clear();
  assert.equal(await first, false); assert.equal(f.moneyLayer.children.length, 0);
  const second = f.api.start(result()); f.root.hidden = true; f.events.get('visibilitychange')();
  assert.equal(await second, true); assert.equal(f.moneyLayer.children.length, 0);
  f.root.hidden = false; const third = f.api.start(result());
  await f.api.start(result(9.6, -.4, 'tie'));
  assert.equal(await third, false); assert.equal(f.moneyLayer.children.length, 0);
  assert.equal(f.moneyLayer.hidden, true);
  const reduced = fixture({reducedMotion: true}); await reduced.api.start(result());
  assert.equal(reduced.moneyLayer.children.length, 0); assert.equal(reduced.moneyLayer.hidden, true);
});

test('controlled TOTAL WIN follows credited returns exactly and never runs ahead on a second clock', async () => {
  const f = fixture(), settled = result(20, 10), before = JSON.stringify(settled);
  const waiting = f.api.start(settled, {followProgress: true});
  assert.equal(f.amount.textContent, '0'); assert.equal(f.pending.size, 0);
  f.advance(5000); assert.equal(f.amount.textContent, '0');
  for (const value of [1, 2.25, 10, 18]) {
    f.api.setAmount(settled, value); assert.equal(f.amount.textContent, String(value));
  }
  f.api.setAmount(settled, 2); assert.equal(f.amount.textContent, '18', 'late progress cannot roll back an arrived return');
  f.root.hidden = true; f.events.get('visibilitychange')();
  assert.equal(f.amount.textContent, '18', 'hidden pages still follow payout progress, including a later JP');
  f.api.setAmount(settled, 20, {complete: true}); assert.equal(await waiting, true);
  assert.equal(f.amount.textContent, '20'); assert.equal(f.panel.dataset.phase, 'settled');
  assert.equal(f.api.start(settled), waiting, 'the controller finishing settlement cannot restart the count');
  assert.equal(JSON.stringify(settled), before);
});

test('controlled split returns also count with their bankroll and clear releases pending external work', async () => {
  const f = fixture({reducedMotion: true}), settled = result(10, 0, 'tie');
  const waiting = f.api.start(settled, {followProgress: true});
  f.api.setAmount(settled, 4); assert.equal(f.amount.textContent, '4');
  assert.equal(f.panel.dataset.outcome, 'split');
  f.api.setAmount(settled, 10, {complete: true}); assert.equal(await waiting, true);
  const next = f.api.start(result(200), {followProgress: true}); f.api.clear(); assert.equal(await next, false);
});

test('BOSS WIN shows the NPC return immediately and follows only its credited chips', async () => {
  const f = fixture(), settled = Object.freeze({winner: 'npc',
    player: Object.freeze({totalReturn: 0, profit: -20, refund: 5}),
    npc: Object.freeze({netReturn: 40, totalReturn: 40, profit: 20, refund: 7})});
  const before = JSON.stringify(settled);
  const waiting = f.api.start(settled, {followProgress: true});
  assert.equal(f.panel.hidden, false); assert.equal(f.amount.hidden, false);
  assert.equal(f.panel.dataset.outcome, 'boss'); assert.equal(f.panel.dataset.phase, 'counting');
  assert.equal(f.amount.textContent, '0');
  assert.deepEqual(f.nodes.find(node => node.className === 'total-win-label').children.map(node => node.textContent), ['BOSS', 'WIN']);
  assert.equal(f.moneyLayer.children.length, 0, 'the transfer owns the chip stream; no unrelated fountain is started');
  f.api.setAmount(settled, {player: 0, npc: 15}); assert.equal(f.amount.textContent, '15');
  f.api.setAmount(settled, {player: 999, npc: 30}); assert.equal(f.amount.textContent, '30');
  f.api.setAmount(settled, {player: 0, npc: 40}, {complete: true});
  assert.equal(await waiting, true); assert.equal(f.amount.textContent, '40');
  assert.equal(f.announcement.textContent, 'BOSS WIN 40');
  assert.equal(JSON.stringify(settled), before);
});

test('standalone PLAYER and BOSS counters last two real seconds without game-speed shortening', async () => {
  for (const settled of [result(), {winner: 'npc', npc: {totalReturn: 40}, player: {totalReturn: 0, profit: -20}}]) {
    const f = fixture(), waiting = f.api.start(settled);
    f.advance(1900); assert.equal(f.panel.dataset.phase, 'counting');
    f.advance(116); assert.equal(await waiting, true); assert.equal(f.panel.dataset.phase, 'settled');
  }
});
