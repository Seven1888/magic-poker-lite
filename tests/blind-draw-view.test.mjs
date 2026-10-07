import test from 'node:test';
import assert from 'node:assert/strict';
import {createBlindDraw} from '../src/blind-draw-view.mjs';
import {createSession} from './legacy-engine.mjs';
import {atGameSpeed} from '../src/presentation-timing.mjs';

const flush = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
function fixture() {
  let now = 0, serial = 0;
  const timers = new Map(), animations = [], sounds = [];
  class Node {
    constructor() { this.children = []; this.dataset = {}; this.style = {}; this.attrs = {}; this.text = ''; }
    setAttribute(name, value) { this.attrs[name] = value; }
    append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this); this.parent = null; }
    set textContent(value) { this.text = value; this.children = []; }
    get textContent() { return this.text + this.children.map(node => node.textContent).join(' '); }
    getAnimations() { return animations.filter(animation => animation.node === this && !animation.done); }
  }
  const stage = new Node();
  const root = {
    defaultView: {
      setTimeout(fn, ms) { const id = ++serial; timers.set(id, {fn, at: now + ms}); return id; },
      clearTimeout(id) { timers.delete(id); }
    },
    getElementById: id => id === 'game' ? stage : null,
    createElement: () => new Node()
  };
  const effects = {
    play: sound => sounds.push(sound),
    animate(node, frames, options) {
      let resolve;
      const pending = new Promise(done => { resolve = done; });
      const record = {node, frames, options, done: false,
        finish() { this.done = true; resolve(); }, cancel() { this.cancelled = true; this.finish(); }};
      animations.push(record); return pending;
    }
  };
  const find = (className, node = stage) => node.className === className ? node : node.children.map(child => find(className, child)).find(Boolean);
  return {root, stage, effects, animations, sounds, timers, find,
    async tick(ms) {
      now += ms;
      for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); }
      await flush();
    }
  };
}

for (const isSmall of [true, false]) test(`preselected ${isSmall ? 'SB' : 'BB'} keeps exact stakes and remains readable with reduced motion`, async t => {
  const f = fixture(), draw = createBlindDraw({...f, reducedMotion: true});
  const session = createSession({bigBlind: .246912}, 43, {firstSmallBlind: isSmall ? 'player' : 'npc'});
  const before = {rng: session.rng.state(), stacks: {...session.stacks}, handNumber: session.handNumber};
  const result = Object.freeze({isSmall, smallBlind: session.config.smallBlind, bigBlind: session.config.bigBlind});
  t.mock.method(Math, 'random', () => { throw new Error('Presentation cannot draw another outcome.'); });
  const pending = draw.play(result);
  assert.equal(f.stage.dataset.blindDraw, 'revealed');
  assert.equal(f.find('blind-draw-name').textContent, isSmall ? 'YOU · SMALL BLIND' : 'YOU · BIG BLIND');
  assert.match(f.find('blind-draw-payment').textContent, isSmall ? /YOU 0\.123456 BOSS 0\.246912/ : /YOU 0\.246912 BOSS 0\.123456/);
  assert.equal(f.find('blind-draw-stakes').textContent, 'STARTING BET');
  assert.equal(f.animations.length, 0);
  await f.tick(atGameSpeed(1800) - 1);
  assert.equal(f.stage.dataset.blindDraw, 'revealed', 'a reduced-motion user still has time to read');
  await f.tick(1); assert.equal(await pending, true);
  const coin = f.find('blind-coin');
  assert.equal(coin.textContent, isSmall ? 'SB' : 'BB');
  assert.equal(coin.attrs['aria-label'], `You: ${isSmall ? 'SMALL BLIND' : 'BIG BLIND'}. Boss: ${isSmall ? 'BIG BLIND' : 'SMALL BLIND'}.`);
  assert.equal(coin.dataset.position, 'seat');
  assert.equal(f.find('blind-draw-copy'), undefined);
  assert.deepEqual({rng: session.rng.state(), stacks: session.stacks, handNumber: session.handNumber}, before);
  draw.renderSeat({isSmall: !isSmall});
  assert.equal(f.find('blind-coin'), coin, 'next hand updates the single seated coin');
  assert.equal(coin.textContent, isSmall ? 'BB' : 'SB');
  draw.renderSeat(null); assert.equal(f.stage.children.length, 0);
});

test('normal draw reveals the known side before flying, then retains a coin at the flight endpoint', async () => {
  const f = fixture(), draw = createBlindDraw(f);
  const pending = draw.play({isSmall: true, smallBlind: .5, bigBlind: 1});
  const coin = f.find('blind-coin');
  assert.equal(coin.textContent, '?'); assert.equal(f.stage.dataset.blindDraw, 'drawing');
  f.animations[0].finish(); await flush();
  assert.equal(coin.textContent, 'SB'); assert.equal(f.stage.dataset.blindDraw, 'revealed');
  assert.equal(f.animations.length, 2);
  f.animations[1].finish(); await flush();
  await f.tick(atGameSpeed(2400));
  assert.equal(f.stage.dataset.blindDraw, 'flying'); assert.equal(coin.dataset.position, 'center');
  const flight = f.animations.at(-1), start = flight.frames[0], destination = flight.frames.at(-1);
  assert.ok(parseFloat(destination.left) > parseFloat(start.left), 'flies toward the player’s right');
  assert.ok(parseFloat(destination.top) > parseFloat(start.top), 'flies down to the player');
  flight.finish(); assert.equal(await pending, true);
  assert.equal(coin.style.left, destination.left); assert.equal(coin.style.top, destination.top);
  assert.equal(coin.dataset.position, 'seat'); assert.equal(f.stage.dataset.blindDraw, 'seated');
  assert.deepEqual(f.sounds, ['chip']); assert.equal(f.timers.size, 0);
});

test('clearing or replacing a pending draw releases it without a stale coin or timer', async () => {
  const f = fixture(), draw = createBlindDraw(f);
  const pending = draw.play({isSmall: true, smallBlind: .5, bigBlind: 1});
  draw.clear();
  assert.equal(await pending, false); assert.equal(f.stage.children.length, 0);
  assert.equal(f.animations[0].cancelled, true); assert.equal(f.stage.dataset.blindDraw, undefined);
  f.animations[0].finish(); await flush();
  assert.equal(f.stage.children.length, 0); assert.equal(f.sounds.length, 0);
  const reduced = createBlindDraw({...f, reducedMotion: true});
  const second = reduced.play({isSmall: true, smallBlind: .5, bigBlind: 1});
  assert.equal(f.timers.size, 1);
  reduced.renderSeat({isSmall: false});
  assert.equal(await second, false); assert.equal(f.timers.size, 0);
  await f.tick(10000);
  assert.equal(f.find('blind-coin').textContent, 'BB');
  assert.equal(f.stage.children.length, 1); assert.equal(f.stage.dataset.blindDraw, 'seated');
});
