import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameEffects} from '../src/game-effects.mjs';

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
  assert.equal(f.animations[0].options.duration, 280);
  f.animations[0].finish(); await flush();
  assert.deepEqual(landed, [['player1', 0]]);
  assert.equal(f.animations.length, 1);
  releaseFirst(); await flush();
  await f.tick(49); assert.equal(f.animations.length, 1);
  await f.tick(1); assert.equal(f.animations.length, 2);
  for (let index = 1; index < cards.length; index++) {
    assert.equal(f.animations[index].card, cards[index]);
    f.animations[index].finish(); await flush();
    if (index < cards.length - 1) await f.tick(50);
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
  assert.equal(f.animations[0].options.duration, 130); assert.deepEqual(revealed, []);
  f.animations[0].finish(); await flush();
  assert.deepEqual(revealed, [0]); assert.equal(cards[1].face, 'back');
  assert.equal(f.animations[1].face, 'front'); assert.equal(f.animations[1].options.duration, 170);
  f.animations[1].finish(); await flush();
  await f.tick(169); assert.equal(f.animations.length, 2);
  await f.tick(1); assert.equal(f.animations.length, 3); assert.equal(f.animations[2].face, 'back');
  f.animations[2].finish(); await flush();
  assert.deepEqual(revealed, [0, 1]);
  f.animations[3].finish(); await flush(); await f.tick(170); await pending;
  assert.ok(cards.every(card => card.style.scale === '' && card.dataset.motion === undefined));
});

test('a landing callback can await a short reveal before the next card leaves the deck', async () => {
  const f = fixture(), effects = createGameEffects({root: f.doc}), cards = [f.card('first'), f.card('second')];
  const pending = effects.deal(cards, {onLand: card => effects.reveal([card], {holdMs: 35, onReveal: target => { target.face = 'front'; }})});
  f.animations[0].finish(); await flush();
  assert.equal(f.animations[1].options.duration, 130); assert.equal(f.animations[1].cancelled, false);
  f.animations[1].finish(); await flush(); f.animations[2].finish(); await flush();
  await f.tick(35); assert.equal(f.animations.length, 3);
  await f.tick(50); assert.equal(f.animations[3].card, cards[1]);
  f.animations[3].finish(); await flush(); f.animations[4].finish(); await flush(); f.animations[5].finish(); await flush();
  await f.tick(35); await pending;
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
  await f.tick(359); assert.equal(landed, false);
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
