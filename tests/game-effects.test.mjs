import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameEffects} from '../src/game-effects.mjs';
import {atGameSpeed} from '../src/presentation-timing.mjs';

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

function fixture() {
  let time = 0, nextTimer = 0;
  const timers = new Map(), animations = [], nodes = new Map();
  const doc = {
    defaultView: {
      setTimeout(fn, ms) { const id = ++nextTimer; timers.set(id, {fn, at: time + ms}); return id; },
      clearTimeout(id) { timers.delete(id); }
    },
    getElementById: id => nodes.get(id)
  };
  function card(name) {
    return {
      name, face: 'back', style: {transform: 'rotate(-6deg)', visibility: '', scale: ''}, dataset: {},
      getBoundingClientRect: () => ({left: 60, top: 200, width: 40, height: 40}),
      animate(keyframes, options) {
        let resolve, reject, complete = false;
        const animation = {card: this, face: this.face, keyframes, options, cancelled: false,
          finished: new Promise((yes, no) => { resolve = yes; reject = no; }),
          finish() { if (!complete) { complete = true; resolve(); } },
          cancel() { this.cancelled = true; if (!complete) { complete = true; reject(new Error('cancelled')); } }
        };
        animations.push(animation); return animation;
      }
    };
  }
  nodes.set('game', {offsetWidth: 400, offsetHeight: 860, getBoundingClientRect: () => ({left: 10, top: 20, width: 200, height: 430})});
  nodes.set('deck-button', {getBoundingClientRect: () => ({left: 160, top: 85, width: 40, height: 30})});
  return {doc, nodes, timers, animations, card,
    async tick(ms) {
      time += ms;
      for (const [id, timer] of [...timers]) if (timer.at <= time) { timers.delete(id); timer.fn(); }
      await flush();
    }
  };
}

test('deal hides pending cards, preserves caller order and awaits every landing callback', async () => {
  const f = fixture(), effects = createGameEffects({root: f.doc});
  const cards = ['player1', 'npc1', 'player2', 'npc2'].map(f.card), landed = [];
  let releaseFirst;
  const pending = effects.deal(cards, {onLand: async (card, index) => {
    assert.ok(f.animations.at(-1).cancelled, 'flight record is cleaned before onLand');
    landed.push([card.name, index]);
    if (index === 0) await new Promise(resolve => { releaseFirst = resolve; });
  }});
  assert.equal(cards[0].style.visibility, 'visible');
  assert.ok(cards.slice(1).every(card => card.style.visibility === 'hidden'));
  assert.equal(f.animations.length, 1);
  assert.equal(f.animations[0].options.duration, atGameSpeed(280));
  f.animations[0].finish(); await flush();
  assert.deepEqual(landed, [['player1', 0]]);
  assert.equal(f.animations.length, 1);
  releaseFirst(); await flush();
  await f.tick(atGameSpeed(50) - 1); assert.equal(f.animations.length, 1);
  await f.tick(1); assert.equal(f.animations.length, 2);
  for (let index = 1; index < cards.length; index++) {
    assert.equal(f.animations[index].card, cards[index]);
    f.animations[index].finish(); await flush();
    if (index < cards.length - 1) await f.tick(atGameSpeed(50));
  }
  await pending;
  assert.deepEqual(landed, cards.map((card, index) => [card.name, index]));
  assert.ok(cards.every(card => card.style.visibility === '' && card.dataset.motion === undefined));
});

test('deal starts at the right deck in stage coordinates without replacing fan transforms', async () => {
  const f = fixture(), effects = createGameEffects({root: f.doc}), card = f.card('player');
  const pending = effects.deal([card]);
  assert.equal(f.animations[0].keyframes[0].translate, '200px -240px');
  assert.equal(f.animations[0].keyframes.at(-1).translate, '0px 0px');
  assert.ok(f.animations[0].keyframes.every(frame => !Object.hasOwn(frame, 'transform')));
  f.animations[0].finish(); await pending;
  assert.equal(card.style.transform, 'rotate(-6deg)');
});

test('reveal swaps each back only at the midpoint and finishes the first card before the second', async () => {
  const f = fixture(), effects = createGameEffects({root: f.doc}), cards = [f.card('first'), f.card('second')], revealed = [];
  const pending = effects.reveal(cards, {onReveal(card, index) {
    assert.equal(card.style.scale, '0 1');
    revealed.push(index); card.face = 'front';
  }});
  assert.equal(f.animations.length, 1); assert.equal(f.animations[0].face, 'back');
  assert.equal(f.animations[0].options.duration, atGameSpeed(130)); assert.deepEqual(revealed, []);
  f.animations[0].finish(); await flush();
  assert.deepEqual(revealed, [0]); assert.equal(cards[1].face, 'back');
  assert.equal(f.animations[1].face, 'front'); assert.equal(f.animations[1].options.duration, atGameSpeed(170));
  f.animations[1].finish(); await flush();
  await f.tick(atGameSpeed(170) - 1); assert.equal(f.animations.length, 2);
  await f.tick(1); assert.equal(f.animations.length, 3); assert.equal(f.animations[2].face, 'back');
  f.animations[2].finish(); await flush();
  assert.deepEqual(revealed, [0, 1]);
  f.animations[3].finish(); await flush(); await f.tick(atGameSpeed(170)); await pending;
  assert.ok(cards.every(card => card.style.scale === '' && card.dataset.motion === undefined));
});

test('a landing callback can await a short reveal before the next card leaves the deck', async () => {
  const f = fixture(), effects = createGameEffects({root: f.doc}), cards = [f.card('first'), f.card('second')];
  const pending = effects.deal(cards, {onLand: card => effects.reveal([card], {holdMs: 35, onReveal: target => { target.face = 'front'; }})});
  f.animations[0].finish(); await flush();
  assert.equal(f.animations[1].options.duration, atGameSpeed(130)); assert.equal(f.animations[1].cancelled, false);
  f.animations[1].finish(); await flush(); f.animations[2].finish(); await flush();
  await f.tick(atGameSpeed(35)); assert.equal(f.animations.length, 3);
  await f.tick(atGameSpeed(50)); assert.equal(f.animations[3].card, cards[1]);
  f.animations[3].finish(); await flush(); f.animations[4].finish(); await flush(); f.animations[5].finish(); await flush();
  await f.tick(atGameSpeed(35)); await pending;
  assert.ok(cards.every(card => card.face === 'front'));
});

test('reduced motion still commits ordered landing and reveal callbacks without animations or timers', async () => {
  const f = fixture(), effects = createGameEffects({root: f.doc, reducedMotion: true});
  const cards = [f.card('first'), f.card('second')], order = [];
  await effects.deal(cards, {onLand: async (card, index) => {
    order.push(`land${index}`);
    await effects.reveal([card], {onReveal: target => { target.face = 'front'; order.push(`reveal${index}`); }});
  }});
  assert.deepEqual(order, ['land0', 'reveal0', 'land1', 'reveal1']);
  assert.equal(f.animations.length, 0); assert.equal(f.timers.size, 0);
  assert.ok(cards.every(card => card.face === 'front' && card.style.visibility === ''));
});

test('cancelled animation promises continue through the swap without hanging', async () => {
  const f = fixture(), effects = createGameEffects({root: f.doc}), card = f.card('first');
  const pending = effects.reveal([card], {holdMs: 0, onReveal: target => { target.face = 'front'; }});
  f.animations[0].cancel(); await flush();
  assert.equal(card.face, 'front'); assert.equal(f.animations.length, 2);
  f.animations[1].cancel(); await pending;
  assert.equal(card.style.scale, ''); assert.equal(f.timers.size, 0);
});

test('a watchdog lands the card when animation.finished never settles', async () => {
  const f = fixture(), effects = createGameEffects({root: f.doc}), card = f.card('first');
  let landed = false;
  const pending = effects.deal([card], {onLand() { landed = true; }});
  assert.equal(f.timers.size, 1);
  await f.tick(atGameSpeed(280) + 79); assert.equal(landed, false);
  await f.tick(1); await pending;
  assert.equal(landed, true); assert.equal(f.animations[0].cancelled, true); assert.equal(f.timers.size, 0);
});

test('destroy releases an active flight and a blocked async landing callback', async () => {
  for (const blockedCallback of [false, true]) {
    const f = fixture(), effects = createGameEffects({root: f.doc}), cards = [f.card('first'), f.card('second')];
    const calls = [];
    const pending = effects.deal(cards, {onLand(card, index) { calls.push(index); return new Promise(() => {}); }});
    if (blockedCallback) { f.animations[0].finish(); await flush(); }
    effects.destroy(); await pending;
    assert.deepEqual(calls, blockedCallback ? [0] : []);
    assert.equal(f.animations.length, 1); assert.ok(f.animations[0].cancelled);
    assert.ok(cards.every(card => card.style.visibility === '' && card.dataset.motion === undefined));
  }
});

test('destroy releases the between-card hold and missing animation support still reveals faces', async () => {
  const f = fixture(), effects = createGameEffects({root: f.doc}), cards = [f.card('first'), f.card('second')];
  const pending = effects.reveal(cards, {onReveal: card => { card.face = 'front'; }});
  f.animations[0].finish(); await flush(); f.animations[1].finish(); await flush();
  assert.equal(f.timers.size, 1); effects.destroy(); await pending;
  assert.equal(f.timers.size, 0); assert.equal(cards[1].face, 'back');
  const noMotion = fixture(), card = noMotion.card('fallback');
  delete card.animate; noMotion.nodes.delete('deck-button');
  const fallback = createGameEffects({root: noMotion.doc});
  await fallback.deal([card], {onLand: target => fallback.reveal([target], {holdMs: 0, onReveal: item => { item.face = 'front'; }})});
  assert.equal(card.face, 'front'); assert.equal(card.style.scale, '');
});

test('original-speed decisions preserve the watchdog and fallback while other motion stays at 1.2x', async () => {
  for (const {speed, duration, delay, deadline} of [
    {speed: undefined, duration: 375, delay: 100, deadline: 555},
    {speed: 1, duration: 450, delay: 120, deadline: 650}
  ]) {
    const f = fixture(), effects = createGameEffects({root: f.doc}), marker = f.card('marker');
    let finished = false;
    const pending = effects.animate(marker, [{left: '0%'}, {left: '40%'}], {duration: 450, delay: 120, fill: 'forwards'}, {speed}).then(() => { finished = true; });
    assert.equal(f.animations[0].options.duration, duration);
    assert.equal(f.animations[0].options.delay, delay);
    await f.tick(deadline - 1); assert.equal(finished, false);
    await f.tick(1); await pending;
    assert.equal(finished, true); assert.equal(f.animations[0].cancelled, true);
    marker.animate = undefined;
    await effects.animate(marker, [], {duration: 450}, {speed});
    assert.equal(f.timers.size, 0);
  }
  assert.equal(atGameSpeed(900, 1), 900, 'opponent result reading time is not accelerated');
  assert.equal(atGameSpeed(900), 750, 'other presentation retains its faster default');
});

function audioFixture() {
  const f = fixture(), contexts = [], oscillators = [], gains = [];
  const parameter = () => ({value: 0, changes: [], cancelScheduledValues() {}, setValueAtTime(value, time) {this.changes.push({value, time});}, exponentialRampToValueAtTime(value, time) {this.changes.push({value, time});}});
  class FakeAudioContext {
    constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = {}; this.resumes = 0; this.suspends = 0; contexts.push(this); }
    createGain() { const gain = {gain: parameter(), connect() {}, disconnect() {}};gains.push(gain);return gain; }
    createOscillator() {
      const oscillator = {frequency: parameter(), onended: null, disconnects: 0, connect() {}, start(time) {this.startTime = time;}, stop(time) {this.stopTime = time;}, disconnect() { this.disconnects++; }};
      oscillators.push(oscillator); return oscillator;
    }
    resume() { this.resumes++; if(this.blocked)return Promise.reject(new Error('Gesture required'));this.state = 'running'; return Promise.resolve(); }
    suspend() { this.suspends++; this.state = 'suspended'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
  }
  f.doc.defaultView.AudioContext = FakeAudioContext;
  return {...f, contexts, oscillators, gains};
}

test('audio beats and envelopes run at 1.2x while pitches and the audio clock are unchanged', async () => {
  const f = audioFixture(), effects = createGameEffects({root: f.doc});
  await effects.unlock(); f.contexts[0].currentTime = 10;
  assert.equal(effects.play('win'), true);
  const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12);
  assert.deepEqual(f.oscillators.map(note => note.frequency.changes[0].value), [523.25, 659.25, 783.99]);
  near(f.oscillators[0].startTime, 10);
  near(f.oscillators[1].startTime, 10.0625);
  near(f.oscillators[2].startTime, 10.125);
  near(f.gains[3].gain.changes[1].time, 10.125 + .008 / 1.2);
  near(f.gains[3].gain.changes[2].time, 10.275);
  near(f.oscillators[2].stopTime, 10.2875);
  effects.destroy();
});

test('audio remains lazy, pauses for app switches and resumes on a later gesture', async () => {
  const f = audioFixture(), effects = createGameEffects({root: f.doc});
  assert.equal(effects.play('deal'), false); assert.equal(f.contexts.length, 0);
  assert.equal(await effects.unlock(), true);
  const context = f.contexts[0];
  assert.equal(context.resumes, 1); assert.equal(effects.play('deal'), true);
  f.doc.hidden = true;
  effects.suspendAudio();
  assert.equal(context.suspends, 1); assert.ok(f.oscillators.every(oscillator => oscillator.disconnects === 1));
  assert.equal(effects.play('win'), false); assert.equal(await effects.unlock(), false);
  assert.equal(context.resumes, 1, 'background callbacks cannot reactivate audio');
  f.doc.hidden = false;
  assert.equal(effects.play('click'), false, 'restoring a page still requires a gesture');
  assert.equal(await effects.unlock(), true); assert.equal(context.resumes, 2);
  assert.equal(effects.play('click'), true); assert.equal(f.contexts.length, 1);
  context.state = 'interrupted';
  assert.equal(effects.play('deal'), false);
  assert.equal(await effects.unlock(), true); assert.equal(context.resumes, 3);
  effects.destroy();
});

test('blocked audio can retry and muting survives app-switch recovery', async () => {
  const f = audioFixture(), effects = createGameEffects({root: f.doc});
  await effects.unlock();
  const context = f.contexts[0];
  context.state = 'suspended'; context.blocked = true;
  assert.equal(await effects.unlock(), false); assert.equal(effects.play('click'), false);
  context.blocked = false; effects.setMuted(true);
  assert.equal(await effects.unlock(), true); assert.equal(effects.play('click'), false);
  effects.setMuted(false); assert.equal(effects.play('click'), true);
  effects.destroy();
  assert.equal(await effects.unlock(), false); assert.equal(effects.play('click'), false);
});
