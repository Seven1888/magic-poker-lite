import test from 'node:test';
import assert from 'node:assert/strict';
import {playBuyInFlight} from '../src/buyin-flight.mjs';
import {createBankrollView} from '../src/bankroll-view.mjs';

function fixture() {
  let time = 0, sequence = 0;
  const tasks = new Map(), nodes = new Map(), animations = [], created = [];
  const schedule = (fn, delay) => { const id = ++sequence; tasks.set(id, {fn, at: time + delay}); return id; };
  const cancel = id => tasks.delete(id);
  const element = () => {
    const node = {dataset: {}, children: [], textContent: '', style: {setProperty() {}},
      rect: {left: 30, top: 300, width: 80, height: 40},
      setAttribute() {}, getBoundingClientRect() { return this.rect; },
      append(...children) { this.children.push(...children); for (const child of children) child.parent = this; },
      remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); this.removed = true; },
      animate(keyframes, options) {
        let resolve; const finished = new Promise(done => { resolve = done; });
        const id = schedule(resolve, options.duration + (options.delay || 0));
        const animation = {keyframes, options, finished, cancel() { cancel(id); resolve(); }};
        animations.push(animation); return animation;
      }};
    created.push(node); return node;
  };
  const root = {body: element(), createElement: element, getElementById: id => nodes.get(id),
    defaultView: {performance: {now: () => time}, setTimeout: schedule, clearTimeout: cancel,
      requestAnimationFrame: fn => schedule(fn, 16), cancelAnimationFrame: cancel}};
  for (const id of ['balance-button', 'npc-asset-panel', 'player-stack', 'npc-stack', 'player-bankroll-value',
    'player-bankroll-chips', 'npc-bankroll-chips', 'player-chip-change', 'npc-chip-change']) nodes.set(id, element());
  nodes.get('balance-button').rect.top = 760;
  nodes.get('player-bankroll-chips').rect.top = 630;
  function advance(delta) {
    const end = time + delta;
    while (true) {
      const next = [...tasks].filter(([, item]) => item.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      const [id, item] = next; tasks.delete(id); time = item.at; item.fn(time);
    }
    time = end;
  }
  return {root, nodes, animations, created, advance, tasks, now: () => time};
}

test('buy-in flies to both seats for at least one real second and ends only after exact counters land', async () => {
  const f = fixture(), events = [], amounts = Object.freeze({player: 1000, npc: 1000});
  const view = createBankrollView({root: f.root});
  const done = playBuyInFlight({root: f.root, amounts, duration: 100,
    onProgress: event => { events.push({...event, time: f.now()}); view.render(event.values, {pileTargets: amounts, counting: true}); }});
  let finished = false; done.then(() => { finished = true; });
  assert.deepEqual(events[0].values, {player: 0, npc: 0});
  assert.equal(f.animations.length, 24);
  assert.deepEqual(new Set(f.created.filter(node => node.className === 'buyin-flight-chip').map(node => node.dataset.seat)), new Set(['player', 'npc']));
  assert.ok(f.animations.every(animation => animation.keyframes.at(-1).opacity === 1));
  f.advance(700); await Promise.resolve();
  assert.equal(finished, false);
  assert.ok(events.at(-1).values.player > 0 && events.at(-1).values.player < 1000);
  const pile = f.nodes.get('player-bankroll-chips'), oldChips = pile.children.flatMap(stack => stack.children);
  assert.ok(oldChips.length > 0 && oldChips.length < 18);
  f.advance(299); await Promise.resolve(); assert.equal(finished, false);
  f.advance(1); await done;
  assert.equal(events.at(-1).complete, true); assert.equal(events.at(-1).time, 1000);
  assert.deepEqual(events.at(-1).values, amounts);
  assert.equal(f.nodes.get('player-bankroll-value').textContent, '1,000');
  assert.equal(f.nodes.get('npc-stack').textContent, '1,000');
  assert.ok(oldChips.every(chip => pile.children.some(stack => stack.children.includes(chip))), 'already landed chips remain in the pile');
  assert.equal(f.root.body.children.length, 0); assert.equal(f.tasks.size, 0);
});

test('reduced buy-in still builds both balances over one second without moving chips or extra RNG', async () => {
  const f = fixture(), events = [], originalRandom = Math.random;
  Math.random = () => { throw new Error('The animation cannot draw a game ticket'); };
  try {
    const done = playBuyInFlight({root: f.root, reducedMotion: true, duration: 500, amounts: {player: 1.234567, npc: 1.234567}, onProgress: event => events.push(event)});
    f.advance(500); assert.ok(events.at(-1).values.player > 0 && events.at(-1).values.player < 1.234567);
    f.advance(500); await done;
    assert.equal(events.at(-1).values.player, 1.234567); assert.equal(f.animations.length, 0);
    assert.equal(events.filter(event => event.complete).length, 1);
  } finally { Math.random = originalRandom; }
});

test('bankroll increments append physical chips and never refresh the external wallet during count-up', () => {
  const f = fixture(), view = createBankrollView({root: f.root}), options = {walletBalance: 9000, pileTargets: {player: 1000, npc: 1000}, counting: true};
  const pile = f.nodes.get('player-bankroll-chips');
  let previous = [];
  for (const value of [0, 50, 100, 250, 500, 750, 1000]) {
    view.render({player: value, npc: value}, options);
    const chips = pile.children.flatMap(stack => stack.children);
    assert.ok(previous.every(chip => chips.includes(chip))); previous = chips;
    assert.equal(f.nodes.get('player-stack').textContent, '9,000');
    assert.equal(f.nodes.get('player-chip-change').textContent, '');
  }
  assert.equal(previous.length, 18);
  view.render({player: 0, npc: 0}, options);
  assert.equal(pile.children.flatMap(stack => stack.children).length, 0);
});

test('a later payout grows the existing pile without rescaling or losing already landed chips', () => {
  const f = fixture(), view = createBankrollView({root: f.root});
  view.render({player: 1000, npc: 1000});
  const pile = f.nodes.get('player-bankroll-chips'), startingChips = pile.children.flatMap(stack => stack.children);
  const options = {pileTargets: {player: 2000, npc: 1000}, counting: true};
  view.render({player: 1000, npc: 1000}, options);
  assert.deepEqual(pile.children.flatMap(stack => stack.children), startingChips);
  view.render({player: 1500, npc: 1000}, options);
  assert.ok(startingChips.every(chip => pile.children.some(stack => stack.children.includes(chip))));
  assert.ok(pile.children.flatMap(stack => stack.children).length > startingChips.length);
  view.render({player: 2000, npc: 1000}, options);
  const landed = pile.children.flatMap(stack => stack.children);
  view.render({player: 2000, npc: 1000});
  assert.deepEqual(pile.children.flatMap(stack => stack.children), landed, 'ending a count cannot collapse its pile');
});
