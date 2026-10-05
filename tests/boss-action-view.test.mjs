import test from 'node:test';
import assert from 'node:assert/strict';
import {createBossActionView} from '../src/boss-action-view.mjs';
import {createPotView} from '../src/pot-view.mjs';
import {createSession, startHand, applyAction} from '../src/engine.mjs';
import {atGameSpeed} from '../src/presentation-timing.mjs';

function fixture({reducedMotion = false, animate = true, scaleX = 1, scaleY = 1} = {}) {
  let next = 0;
  const elements = new Map(), created = [], timers = new Map(), listeners = new Map(), starts = [];
  const rect = (left, top, width, height) => ({left: 10 + left * scaleX, top: 20 + top * scaleY,
    width: width * scaleX, height: height * scaleY});
  const root = {hidden: false, getElementById: id => elements.get(id),
    createElement(tag) {
      const el = {tag, children: [], animations: [], dataset: {}, attributes: {}, hidden: false, textContent: '',
        style: {setProperty(name, value) { this[name] = value; }},
        classList: {toggle() {}}, rect: rect(100, 400, 200, 80),
        getBoundingClientRect() { return this.rect; },
        append(...items) { this.children.push(...items); items.forEach(item => { item.parent = this; }); },
        replaceChildren(...items) { this.children.forEach(item => { item.parent = null; }); this.children = []; this.append(...items); },
        remove() { if (this.parent) this.parent.children = this.parent.children.filter(item => item !== this); this.parent = null; this.removed = true; },
        setAttribute(name, value) { this.attributes[name] = value; }};
      if (animate) el.animate = (keyframes, options) => {
        let finish, reject;
        const animation = {keyframes, options, finished: new Promise((resolve, fail) => { finish = resolve; reject = fail; }),
          finish() { this.completed = true; finish(); }, cancel() { this.cancelled = true; reject(new Error('cancelled')); }};
        el.animations.push(animation); starts.push({node: el, animation}); return animation;
      };
      created.push(el); return el;
    },
    addEventListener(type, callback) { listeners.set(type, callback); },
    removeEventListener(type) { listeners.delete(type); },
    defaultView: {performance: {now: () => 0},
      setTimeout(callback, delay) { const id = ++next; timers.set(id, {callback, delay}); return id; },
      clearTimeout(id) { timers.delete(id); },
      addEventListener(type, callback) { listeners.set(type, callback); },
      removeEventListener(type) { listeners.delete(type); }}};
  for (const id of ['game', 'npc-cards', 'board', 'pot-display', 'pot-value', 'pot-label', 'pot-detail', 'pot-chips',
    'pot-event', 'contribution-player', 'contribution-npc', 'pot-flight-layer', 'player-stack', 'npc-stack']) {
    const el = root.createElement('div'); el.id = id; elements.set(id, el);
  }
  const stage = elements.get('game'); stage.rect = rect(0, 0, 400, 850); stage.offsetWidth = 400; stage.offsetHeight = 850;
  elements.get('npc-cards').rect = rect(127, 262, 146, 86);
  elements.get('board').rect = rect(10, 370, 380, 100);
  elements.get('pot-flight-layer').rect = rect(0, 0, 400, 850);
  elements.get('pot-flight-layer').offsetWidth = 400; elements.get('pot-flight-layer').offsetHeight = 850;
  elements.get('npc-stack').rect = rect(286, 340, 104, 22);
  const api = createBossActionView({root, reducedMotion});
  async function finishMotion() {
    for (let pass = 0; pass < 10; pass++) {
      for (const {animation} of starts) if (!animation.completed && !animation.cancelled) animation.finish();
      await Promise.resolve();
    }
  }
  return {root, stage, elements, created, starts, timers, listeners, api, finishMotion,
    get panel() { return created.filter(el => el.className === 'boss-action-pop').at(-1); }};
}

function npcEvent(hand, type) {
  assert.equal(hand.actor, 'npc');
  const from = hand.history.length;
  applyAction(hand, type);
  return hand.history.slice(from).find(event => event.actor === 'npc');
}
function npcOption() { const hand = startHand(createSession({}, 42)); applyAction(hand, 'call'); return hand; }

test('paid NPC actions wait for actual chip departure, then start in the same render without changing the committed hand', async () => {
  const f = fixture({scaleX: .75, scaleY: .6}), hand = npcOption();
  const pot = createPotView({root: f.root, onPhase: event => f.api.onTransfer(event)});
  pot.render(hand); await f.finishMotion(); await pot.whenIdle();
  const event = npcEvent(hand, 'raise'), before = JSON.stringify(hand), rng = hand.rng.state();
  const savedRandom = Math.random; Math.random = () => { throw new Error('Visual effects must not draw randomness'); };
  try {
    const done = f.api.commit(event);
    assert.equal(f.panel, undefined, 'committing alone does not lead the chip movement');
    f.api.onTransfer({flow: 'refund', seats: ['npc']});
    f.api.onTransfer({flow: 'contribution', seats: ['player']});
    assert.equal(f.panel, undefined);
    const start = f.starts.length; pot.render(hand);
    const starts = f.starts.slice(start);
    assert.deepEqual(starts.map(item => item.node.className), ['flying-chip', 'boss-action-pop']);
    assert.equal(starts[0].animation.options.delay, 0);
    assert.equal(f.panel.children[1].textContent, 'RAISE');
    assert.equal(f.panel.dataset.type, 'raise');
    assert.equal(f.panel.style.left, '200px'); assert.equal(f.panel.style.top, '210px');
    assert.equal(f.stage.dataset.bossAction, 'raise');
    pot.render(hand); assert.equal(f.starts.length - start, 2, 'rerenders cannot replay the float');
    await f.finishMotion(); await pot.whenIdle(); assert.equal(await done, true);
    assert.equal(f.stage.dataset.bossAction, undefined);
    assert.equal(JSON.stringify(hand), before); assert.equal(hand.rng.state(), rng);
  } finally { Math.random = savedRandom; f.api.destroy(); }
});

test('committed free checks and folds show CALL/FOLD immediately, retaining their exact engine types', async () => {
  for (const [type, label] of [['check', 'CALL'], ['fold', 'FOLD']]) {
    const f = fixture(), hand = startHand(createSession({}, 21));
    applyAction(hand, type === 'fold' ? 'raise' : 'call');
    const event = npcEvent(hand, type), before = JSON.stringify(hand);
    const done = f.api.commit(event);
    assert.equal(f.panel.children[0].textContent, 'BOSS'); assert.equal(f.panel.children[1].textContent, label);
    assert.equal(f.panel.dataset.type, type); assert.equal(event.amount, 0);
    assert.equal(f.starts.length, 1, 'no chip event is required for a free action');
    if (type === 'fold') assert.equal(hand.result.reason, 'fold', 'the action is already committed before its visual starts');
    await f.finishMotion(); assert.equal(await done, true);
    assert.equal(JSON.stringify(hand), before); f.api.destroy();
  }
});

test('opening bets display RAISE and paid calls display CALL without replaying the same event', async () => {
  for (const [type, label] of [['bet', 'RAISE'], ['call', 'CALL']]) {
    const f = fixture(), hand = startHand(createSession({}, 21));
    applyAction(hand, type === 'call' ? 'raise' : 'call');
    if (type === 'bet') npcEvent(hand, 'check');
    const event = npcEvent(hand, type), done = f.api.commit(event);
    assert.equal(f.api.commit(event), done);
    f.api.onTransfer({flow: 'contribution', seats: ['npc']});
    assert.equal(f.panel.children[1].textContent, label); assert.equal(f.panel.dataset.type, type);
    assert.equal(f.api.commit(event), done);
    f.api.onTransfer({flow: 'contribution', seats: ['npc']}); assert.equal(f.starts.length, 1);
    await f.finishMotion(); assert.equal(await done, true);
    assert.equal(f.api.commit(event), done); assert.equal(f.starts.length, 1); f.api.destroy();
  }
});

test('player actions, reveals and automatic blinds cannot invent a BOSS action', async () => {
  const f = fixture();
  for (const event of [null, {actor: 'player', type: 'raise'}, {actor: 'npc', type: 'bigBlind'}, {type: 'reveal'}]) {
    assert.equal(await f.api.commit(event), false);
  }
  f.api.onTransfer({flow: 'contribution', seats: ['npc']});
  assert.equal(f.panel, undefined); f.api.destroy();
});

test('replacement and clearing cancel pending/running actions; stale completion cannot remove the next action', async () => {
  const f = fixture(), first = f.api.commit({actor: 'npc', type: 'call', amount: 10});
  f.api.clear(); assert.equal(await first, false); assert.equal(f.panel, undefined);
  const second = f.api.commit({actor: 'npc', type: 'check', amount: 0}), old = f.starts.at(-1).animation;
  const third = f.api.commit({actor: 'npc', type: 'fold', amount: 0});
  assert.equal(await second, false); old.finish(); await Promise.resolve();
  assert.equal(f.stage.dataset.bossAction, 'fold');
  f.api.clear(); assert.equal(await third, false); await f.finishMotion();
  assert.equal(f.stage.dataset.bossAction, undefined); assert.equal(f.timers.size, 0);
  f.api.destroy(); assert.equal(f.stage.children.length, 0);
});

test('reduced motion keeps a brief static word, then clears; unsupported and stalled animations cannot linger', async () => {
  for (const options of [{reducedMotion: true}, {animate: false}, {}]) {
    const f = fixture(options), done = f.api.commit({actor: 'npc', type: 'fold', amount: 0});
    assert.equal(f.panel.children[1].textContent, 'FOLD');
    assert.equal(f.starts.length, options.reducedMotion || options.animate === false ? 0 : 1);
    const timer = [...f.timers.values()][0];
    if (options.reducedMotion) assert.equal(timer.delay, atGameSpeed(720));
    timer.callback(); assert.equal(await done, true);
    assert.equal(f.stage.dataset.bossAction, undefined); assert.equal(f.timers.size, 0); f.api.destroy();
  }
});

test('page hiding, navigation and destroy release waits and suppress late effects', async () => {
  const f = fixture(), first = f.api.commit({actor: 'npc', type: 'check', amount: 0});
  f.root.hidden = true; f.listeners.get('visibilitychange')(); assert.equal(await first, false);
  assert.equal(await f.api.commit({actor: 'npc', type: 'check', amount: 0}), false);
  f.root.hidden = false;
  const pending = f.api.commit({actor: 'npc', type: 'raise', amount: 10});
  f.listeners.get('pagehide')(); assert.equal(await pending, false);
  const last = f.api.commit({actor: 'npc', type: 'fold', amount: 0});
  f.api.destroy(); f.api.destroy(); assert.equal(await last, false);
  await f.finishMotion(); assert.equal(f.listeners.size, 0); assert.equal(f.timers.size, 0);
  assert.equal(await f.api.commit({actor: 'npc', type: 'fold'}), false);
});
