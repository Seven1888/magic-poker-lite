import test from 'node:test';
import assert from 'node:assert/strict';
import {createPotView} from '../src/pot-view.mjs';
import {createSession, startHand, applyAction, legalActions} from '../src/engine.mjs';
import {atGameSpeed} from '../src/presentation-timing.mjs';

function fakeDocument() {
  let time = 1000;
  const created = [], elements = new Map();
  const doc = {
    defaultView: {performance: {now: () => time}},
    getElementById: id => elements.get(id),
    createElement: tag => new Element(tag),
    tick: delta => { time += delta; }, created, elements
  };
  class Element {
    constructor(tag, id = '') {
      this.tagName = tag; this.id = id; this.ownerDocument = doc; this.textContent = '';
      this.className = ''; this.dataset = {}; this.children = []; this.attributes = {};
      this.style = {setProperty(key, value) { this[key] = value; }};
      this.rect = {left: 50, top: 400, width: 200, height: 80}; this.animations = [];
      created.push(this);
    }
    append(...items) { this.children.push(...items); for (const child of items) child.parent = this; }
    replaceChildren(...items) { for (const child of this.children) child.parent = null; this.children = []; this.append(...items); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); this.parent = null; this.removed = true; }
    setAttribute(key, value) { this.attributes[key] = value; }
    getBoundingClientRect() { return this.rect; }
    animate(keyframes, options) {
      let finish, reject;
      const animation = {keyframes, options,
        finished: new Promise((resolve, fail) => { finish = resolve; reject = fail; }),
        finish() { this.completed = true; finish(); },
        cancel() { this.cancelled = true; reject(new Error('Animation cancelled')); }};
      this.animations.push(animation); return animation;
    }
  }
  for (const id of ['pot-display', 'pot-value', 'pot-label', 'pot-detail', 'pot-chips', 'pot-event', 'contribution-player', 'contribution-npc', 'pot-flight-layer', 'player-stack', 'npc-stack']) elements.set(id, new Element('div', id));
  elements.get('pot-flight-layer').rect = {left: 10, top: 20, width: 390, height: 800};
  elements.get('player-stack').rect = {left: 200, top: 650, width: 100, height: 30};
  elements.get('npc-stack').rect = {left: 200, top: 160, width: 100, height: 30};
  return doc;
}

const flights = doc => doc.created.filter(element => element.className === 'flying-chip');
const finishFlights = doc => flights(doc).forEach(flight => flight.animations[0]?.finish());
async function finishMotion(doc) {
  // Completion may start arrival feedback, then refunds, then payouts.
  for (let pass = 0; pass < 8; pass++) {
    for (const element of doc.created) for (const animation of element.animations) {
      if (!animation.completed && !animation.cancelled) animation.finish();
    }
    await Promise.resolve();
  }
}
const text = (doc, id) => doc.getElementById(id).textContent;

test('small blind reaches the pot before the big blind starts, without another charge or draw',async()=>{
  const doc=fakeDocument(),events=[],view=createPotView({root:doc,onPhase:event=>events.push(event)});
  const hand=startHand(createSession({},20)),before=JSON.stringify(hand),rng=hand.rng.state();
  view.render(hand);
  const [small,big]=flights(doc);
  assert.equal(small.dataset.seat,hand.smallBlind);assert.equal(big.dataset.seat,hand.bigBlind);
  assert.equal(small.animations[0].options.delay,0);
  assert.ok(big.animations[0].options.delay>=small.animations[0].options.duration+atGameSpeed(240));
  assert.deepEqual(events.map(event=>event.seats),[[hand.smallBlind]]);
  small.animations[0].finish();await Promise.resolve();
  assert.equal(text(doc,'pot-value'),String(hand.config.smallBlind));
  assert.equal(events.at(-1).flow,'arrival');
  big.animations[0].finish();await Promise.resolve();await finishMotion(doc);await view.whenIdle();
  assert.deepEqual(events.map(event=>[event.flow,event.seats[0]]),[['contribution',hand.smallBlind],['arrival',hand.smallBlind],['contribution',hand.bigBlind],['arrival',hand.bigBlind]]);
  assert.equal(text(doc,'pot-value'),String(hand.config.smallBlind+hand.config.bigBlind));
  assert.equal(JSON.stringify(hand),before);assert.equal(hand.rng.state(),rng);
});

function passive(hand) {
  while (hand.status === 'playing') applyAction(hand, legalActions(hand).find(action => action.type === 'check' || action.type === 'call').type);
}

function splitHand(config = {}) {
  // Pin the original split-pot fixture independently of the current default deal model.
  const setting = {rerollMode: 'legacy-score', rerollChance: .75, maxRerolls: 2, targetScore: .48};
  return startHand(createSession({...config, outcome:{mode:'legacy-deck'}, boss: {mode: 'legacy'}, deal: {player: {...setting}, npc: {...setting}}}, 20));
}

function scaleLayout(doc, scaleX, scaleY) {
  const layer = doc.getElementById('pot-flight-layer'), origin = {...layer.rect};
  layer.offsetWidth = origin.width; layer.offsetHeight = origin.height;
  for (const element of doc.elements.values()) {
    const rect = element.rect;
    element.rect = {
      left: origin.left + (rect.left - origin.left) * scaleX,
      top: origin.top + (rect.top - origin.top) * scaleY,
      width: rect.width * scaleX, height: rect.height * scaleY
    };
  }
}

function assertFlightPoint(flight, frame, expectedX, expectedY) {
  const match = /translate3d\(([^,]+)px,([^,]+)px,0\)/.exec(flight.animations[0].keyframes[frame].transform);
  assert.ok(match, 'flight keyframe contains a position');
  assert.ok(Math.abs(Number(match[1]) - expectedX) < 1e-8, `expected x=${expectedX}, got ${match[1]}`);
  assert.ok(Math.abs(Number(match[2]) - expectedY) < 1e-8, `expected y=${expectedY}, got ${match[2]}`);
}

test('pot view renders both blinds and never changes the hand, balances or RNG', async () => {
  const doc = fakeDocument(), view = createPotView({root: doc});
  const hand = startHand(createSession({}, 20));
  const snapshot = JSON.stringify(hand), seed = hand.rng.state();
  view.render(hand, hand.config);
  assert.equal(text(doc, 'pot-value'), '0'); await finishMotion(doc); await view.whenIdle();
  assert.equal(text(doc, 'pot-label'), '底池 POT'); assert.equal(text(doc, 'pot-value'), '15');
  assert.equal(text(doc, 'contribution-player'), '5'); assert.equal(text(doc, 'contribution-npc'), '10');
  assert.match(text(doc, 'pot-event'), /你小盲 \+5/); assert.match(text(doc, 'pot-event'), /對手大盲 \+10/);
  assert.equal(flights(doc).length, 2);
  assert.ok(flights(doc).every(flight => flight.dataset.flow === 'contribution'));
  assert.ok(flights(doc).every(flight => flight.children[0].className === 'flying-chip-group'
    && flight.children[0].children.length >= 3 && flight.children[0].children.length <= 5));
  assert.ok(flights(doc).every(flight => flight.children.length === 2 && flight.children[1].className === 'amount'));
  assert.equal(JSON.stringify(hand), snapshot); assert.equal(hand.rng.state(), seed);
});

test('fractional blinds show the exact pot, posted chips, uncalled refund and net payout', async () => {
  const doc = fakeDocument(), view = createPotView({root: doc, locale: 'en'});
  const hand = startHand(createSession({outcome:{mode:'legacy-deck'}, bigBlind: .03, jackpotEnabled: false}, 42));
  view.render(hand);
  await finishMotion(doc); await view.whenIdle();
  assert.equal(hand.pot, .045); assert.equal(text(doc, 'pot-value'), '0.045');
  assert.equal(text(doc, 'contribution-player'), '0.015'); assert.equal(text(doc, 'contribution-npc'), '0.03');
  assert.match(text(doc, 'pot-event'), /Small blind \+0\.015/);
  const posted = Object.fromEntries(flights(doc).map(flight => [flight.dataset.seat, flight.children[1].textContent]));
  assert.deepEqual(posted, {player: '+0.015', npc: '+0.03'});
  applyAction(hand, 'fold');
  const snapshot = JSON.stringify(hand);
  view.render(hand);
  await finishMotion(doc); await view.whenIdle();
  assert.equal(text(doc, 'pot-value'), '0');
  assert.match(text(doc, 'pot-detail'), /Matched: 0\.015 each/);
  assert.match(text(doc, 'pot-detail'), /Opponent: refund 0\.015/);
  assert.equal(flights(doc).find(flight => flight.dataset.flow === 'refund').children[1].textContent, 'Refund 0.015');
  assert.equal(flights(doc).find(flight => flight.dataset.flow === 'payout').children[1].textContent, '+0.03');
  assert.equal(text(doc, 'pot-event'), 'Opponent receives 0.03');
  assert.equal(JSON.stringify(hand), snapshot);
});

test('missing or hidden stack labels use visible card groups for chip flights at a scaled viewport', async () => {
  for (const mode of ['missing', 'hidden']) {
    const doc = fakeDocument();
    for (const [seat, top] of [['player', 580], ['npc', 220]]) {
      const cards = doc.createElement('div');
      cards.rect = {left: 160, top, width: 140, height: 90};
      doc.elements.set(`${seat}-cards`, cards);
      if (mode === 'missing') doc.elements.delete(`${seat}-stack`);
      else doc.elements.get(`${seat}-stack`).rect = {left: 0, top: 0, width: 0, height: 0};
    }
    scaleLayout(doc, .75, .75);
    const view = createPotView({root: doc}), hand = splitHand();
    view.render(hand);
    const contributions = flights(doc).filter(flight => flight.dataset.flow === 'contribution');
    assert.equal(contributions.length, 2);
    for (const flight of contributions) assertFlightPoint(flight, 0, 220, flight.dataset.seat === 'player' ? 605 : 245);
    passive(hand); view.render(hand);
    await finishMotion(doc); await view.whenIdle();
    const payouts = flights(doc).filter(flight => flight.dataset.flow === 'payout');
    assert.equal(payouts.length, 2);
    for (const flight of payouts) assertFlightPoint(flight, 3, 220, flight.dataset.seat === 'player' ? 605 : 245);
  }
});

test('same-hand rerenders do not replay payments; a raise animates only its additional amount', async () => {
  const doc = fakeDocument(), view = createPotView({root: doc});
  const hand = startHand(createSession({}, 102));
  view.render(hand); view.render(hand); view.render({...hand});
  assert.equal(flights(doc).length, 2);
  await finishMotion(doc); await view.whenIdle(); assert.equal(text(doc, 'pot-value'), '15');
  applyAction(hand, 'raise'); view.render(hand);
  assert.equal(flights(doc).length, 3);
  assert.equal(flights(doc).at(-1).children[1].textContent, '+15');
  assert.equal(text(doc, 'pot-value'), '15'); await finishMotion(doc); await view.whenIdle();
  assert.equal(text(doc, 'pot-value'), '30'); assert.equal(text(doc, 'pot-event'), '你加注 +15');
  view.render(hand); assert.equal(flights(doc).length, 3);
  assert.ok(flights(doc).every(flight => flight.animations[0].options.duration === atGameSpeed(1000)));
  assert.equal(flights(doc).at(-1).animations[0].options.delay,0,'the later raise starts immediately after the completed blinds');
});

test('fold settlement separates refund from net award and shows matched contributions', async () => {
  const doc = fakeDocument(), view = createPotView({root: doc});
  const hand = startHand(createSession({}, 102));
  view.render(hand); applyAction(hand, 'raise'); view.render(hand); applyAction(hand, 'fold'); view.render(hand);
  await finishMotion(doc); await view.whenIdle();
  assert.equal(text(doc, 'pot-value'), '0'); assert.equal(text(doc, 'pot-label'), '底池 POT');
  assert.equal(hand.result.pot, 20, 'the historical pot stays available to accounting');
  assert.equal(text(doc, 'contribution-player'), '10'); assert.equal(text(doc, 'contribution-npc'), '10');
  assert.match(text(doc, 'pot-detail'), /你退回 10/);
  assert.equal(text(doc, 'pot-event'), '你領回 20');
  const refund = flights(doc).filter(flight => flight.dataset.flow === 'refund');
  const payouts = flights(doc).filter(flight => flight.dataset.flow === 'payout');
  assert.equal(refund.length, 1); assert.equal(refund[0].children[1].textContent, '退款 10');
  assert.equal(payouts.length, 1); assert.equal(payouts[0].children[1].textContent, '+20');
  assert.equal(refund[0].animations[0].options.duration, atGameSpeed(1100));
  assert.equal(payouts[0].animations[0].options.duration, atGameSpeed(1100));
  assert.equal(payouts[0].dataset.seat, 'player');
  const count = flights(doc).length, delay = view.settledDelay();
  assert.equal(delay, 0);
  view.render(hand); assert.equal(flights(doc).length, count); assert.equal(view.settledDelay(), delay);
  doc.tick(100); assert.equal(view.settledDelay(), 0);
  doc.tick(1000); assert.equal(view.settledDelay(), 0);
});

test('1.2x refunds wait for contribution and arrival, then payouts wait for refunds; watchdogs keep 80ms', async t => {
  const timers = new Map(); let timerId = 0;
  t.mock.method(globalThis, 'setTimeout', (callback, delay) => {timers.set(++timerId, {callback, delay});return timerId;});
  t.mock.method(globalThis, 'clearTimeout', id => timers.delete(id));
  const doc = fakeDocument(), view = createPotView({root: doc});
  const hand = startHand(createSession({}, 102));
  view.render(hand); applyAction(hand, 'raise'); view.render(hand);
  doc.tick(200); applyAction(hand, 'fold');
  const snapshot = JSON.stringify(hand), rng = hand.rng.state();
  view.render(hand);
  assert.ok(flights(doc).every(flight => flight.dataset.flow === 'contribution'));
  finishFlights(doc); await Promise.resolve();
  assert.equal(flights(doc).some(flight => flight.dataset.flow === 'refund'), false, 'arrival has not finished');
  doc.getElementById('pot-display').animations.at(-1).finish(); await Promise.resolve();
  const refund = flights(doc).find(flight => flight.dataset.flow === 'refund').animations[0].options;
  assert.equal(flights(doc).some(flight => flight.dataset.flow === 'payout'), false);
  const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9);
  near(refund.delay, 0); near(refund.duration, 1100 / 1.2);
  near([...timers.values()][0].delay, refund.duration + 80);
  [...timers.values()][0].callback(); await Promise.resolve();
  const payout = flights(doc).find(flight => flight.dataset.flow === 'payout').animations[0].options;
  near(payout.delay, 0); near(payout.duration, 1100 / 1.2);
  near([...timers.values()][0].delay, payout.duration + 80);
  await finishMotion(doc); await view.whenIdle();
  assert.equal(timers.size, 0);
  assert.equal(JSON.stringify(hand), snapshot); assert.equal(hand.rng.state(), rng);
});

test('tie settlement splits net awards to both stack endpoints, after final matched call', async () => {
  const doc = fakeDocument(), view = createPotView({root: doc});
  const hand = splitHand();
  view.render(hand); passive(hand); assert.equal(hand.result.winner, 'tie'); view.render(hand);
  assert.equal(flights(doc).some(flight => flight.dataset.flow === 'payout'), false);
  await finishMotion(doc); await view.whenIdle();
  const payouts = flights(doc).filter(flight => flight.dataset.flow === 'payout');
  assert.equal(payouts.length, 2); assert.deepEqual(payouts.map(p => p.dataset.seat), ['player', 'npc']);
  assert.ok(payouts.every(p => p.children[1].textContent === '+10'));
  assert.match(text(doc, 'pot-event'), /^平分/); assert.match(text(doc, 'pot-detail'), /無未跟注退款/);
  assert.deepEqual(payouts.map(p => p.animations[0].options.delay), [0, atGameSpeed(40)]);
  assert.ok(view.settledDelay() <= Math.ceil(atGameSpeed(1000)));
});

test('reduced motion renders all accounting immediately without flying chips or wait', () => {
  const doc = fakeDocument(), view = createPotView({root: doc, reducedMotion: true});
  const hand = startHand(createSession({}, 101));
  view.render(hand); applyAction(hand, 'fold'); view.render(hand);
  assert.equal(flights(doc).length, 0); assert.equal(view.settledDelay(), 0);
  assert.equal(text(doc, 'pot-value'), '0'); assert.match(text(doc, 'pot-detail'), /對手退回 5/);
  assert.equal(text(doc, 'pot-event'), '對手領回 10');
});

test('new hands cancel old flights; leaving the table resets the pot and animation deadline', () => {
  const doc = fakeDocument(), view = createPotView({root: doc});
  const session = createSession({}, 66); const first = startHand(session);
  view.render(first); applyAction(first, 'fold'); view.render(first);
  const old = [...flights(doc)]; const next = startHand(session); view.render(next);
  assert.ok(old.every(flight => flight.removed && flight.animations[0].cancelled));
  assert.equal(text(doc, 'pot-value'), '0', 'new blind chips have not arrived yet'); assert.equal(view.settledDelay(), 0);
  view.render(null, session.config);
  assert.equal(text(doc, 'pot-value'), '0'); assert.equal(text(doc, 'pot-event'), '');
  assert.equal(doc.getElementById('pot-flight-layer').children.length, 0);
});

test('chip stacks are capped and flight coordinates are relative to the supplied layer', async () => {
  const doc = fakeDocument(), view = createPotView({root: doc});
  const hand = startHand(createSession({}, 40, {firstSmallBlind: 'npc'}));
  hand.pot = 1000000; view.render(hand);
  await finishMotion(doc); await view.whenIdle();
  const stacks = doc.getElementById('pot-chips').children;
  assert.equal(stacks.length, 5); assert.ok(stacks.every(stack => stack.children.length <= 10));
  assert.equal(stacks.reduce((sum, stack) => sum + stack.children.length, 0), 50);
  const inbound = flights(doc).find(flight => flight.dataset.seat === 'player');
  assert.match(inbound.animations[0].keyframes[0].transform, /translate3d\(240px,645px,0\)/);
  assert.equal(inbound.style.pointerEvents, 'none');
});

test('hidden or missing endpoints skip motion while keeping accounting and a zero wait', () => {
  const doc = fakeDocument(); doc.getElementById('pot-flight-layer').rect.width = 0;
  const view = createPotView({root: doc}); const hand = startHand(createSession({}, 99));
  view.render(hand); applyAction(hand, 'fold'); view.render(hand);
  assert.equal(flights(doc).length, 0); assert.equal(view.settledDelay(), 0);
  assert.equal(text(doc, 'pot-value'), '0');
});

test('scale(.8) converts viewport centers back to stage coordinates for inbound chips', async () => {
  const doc = fakeDocument(); scaleLayout(doc, .8, .8);
  const hand = startHand(createSession({}, 102, {firstSmallBlind: 'npc'}));
  const snapshot = JSON.stringify(hand);
  createPotView({root: doc}).render(hand);
  const inbound = flights(doc).find(flight => flight.dataset.seat === 'player');
  assertFlightPoint(inbound, 0, 240, 645);
  assertFlightPoint(inbound, 3, 140, 420);
  await finishMotion(doc);
  assert.equal(text(doc, 'pot-value'), '15');
  assert.equal(JSON.stringify(hand), snapshot);
});

test('nonuniform scale uses separate axes for contributions, refunds and payout destinations', async () => {
  const doc = fakeDocument(); scaleLayout(doc, .8, .6);
  const view = createPotView({root: doc});
  const hand = startHand(createSession({}, 102));
  view.render(hand);
  const npcInbound = flights(doc).find(flight => flight.dataset.seat === 'npc');
  assertFlightPoint(npcInbound, 0, 240, 155);
  assertFlightPoint(npcInbound, 3, 140, 420);
  applyAction(hand, 'raise'); view.render(hand);
  applyAction(hand, 'fold'); view.render(hand);
  await finishMotion(doc); await view.whenIdle();
  for (const flow of ['refund', 'payout']) {
    const outbound = flights(doc).find(flight => flight.dataset.flow === flow);
    assertFlightPoint(outbound, 0, 140, 420);
    assertFlightPoint(outbound, 3, 240, 645);
  }
  await finishMotion(doc); await view.whenIdle();
  assert.equal(text(doc, 'pot-value'), '0');
  assert.equal(text(doc, 'pot-event'), '你領回 20');
});

test('deferred final call finishes before payouts; repeated renders never replay or mutate the hand', async () => {
  const doc = fakeDocument(), view = createPotView({root: doc});
  const hand = splitHand({jackpotEnabled: false});
  while (hand.street !== 'river') applyAction(hand, legalActions(hand).find(action => ['check', 'call'].includes(action.type)).type);
  applyAction(hand, 'bet'); view.render(hand); await finishMotion(doc); await view.whenIdle();
  applyAction(hand, 'call'); assert.equal(hand.status, 'settled');
  const before = JSON.stringify(hand), rngBefore = hand.rng.state(), previousCount = flights(doc).length;
  view.render(hand, hand.config, {deferSettlement: true});
  view.render({...hand}, hand.config, {deferSettlement: true});
  assert.equal(flights(doc).length, previousCount + 1, 'only the final actual call enters the pot');
  const incoming = flights(doc).at(-1);
  assert.equal(incoming.dataset.flow, 'contribution'); assert.equal(incoming.children[1].textContent, '+40');
  assert.equal(text(doc, 'pot-label'), '底池 POT');
  assert.equal(doc.getElementById('pot-display').dataset.settled, 'false');
  assert.doesNotMatch(text(doc, 'pot-event'), /領回|費用|平分/);
  let incomingDone = false;
  const incomingWait = view.whenIdle().then(() => { incomingDone = true; });
  await Promise.resolve(); assert.equal(incomingDone, false);
  incoming.animations[0].finish(); await Promise.resolve(); assert.equal(incomingDone, false, 'arrival pulse is part of idle');
  await finishMotion(doc); await incomingWait; assert.equal(incomingDone, true);

  view.render(hand, hand.config, {deferSettlement: false});
  const payouts = flights(doc).filter(flight => flight.dataset.flow === 'payout');
  assert.equal(payouts.length, 2); assert.ok(payouts.every(flight => flight.animations[0].options.delay < 100));
  const settledCount = flights(doc).length; view.render(hand); view.render(hand, hand.config, {deferSettlement: true});
  assert.equal(flights(doc).length, settledCount); assert.equal(text(doc, 'pot-label'), '已結算底池');
  let paidOut = false; const payoutWait = view.whenIdle().then(() => { paidOut = true; });
  payouts[0].animations[0].finish(); await Promise.resolve(); assert.equal(paidOut, false);
  payouts[1].animations[0].finish(); await payoutWait; assert.equal(paidOut, true);
  assert.equal(text(doc, 'pot-value'), '0');
  view.render(hand); view.render(hand, hand.config, {deferSettlement: true});
  assert.equal(text(doc, 'pot-value'), '0', 'completed settlement never repopulates the table pot');
  assert.equal(doc.getElementById('pot-flight-layer').children.length, 0);
  assert.equal(JSON.stringify(hand), before); assert.equal(hand.rng.state(), rngBefore);
});

test('deferring a fold keeps unmatched chips in the displayed pot until distinct refund and payout flights', async () => {
  const doc = fakeDocument(), view = createPotView({root: doc});
  const hand = startHand(createSession({}, 102));
  applyAction(hand, 'raise'); view.render(hand); await finishMotion(doc); await view.whenIdle();
  applyAction(hand, 'fold'); const snapshot = JSON.stringify(hand);
  view.render(hand, hand.config, {deferSettlement: true}); await view.whenIdle();
  assert.equal(text(doc, 'pot-value'), '30'); assert.equal(text(doc, 'contribution-player'), '20');
  assert.equal(text(doc, 'contribution-npc'), '10'); assert.doesNotMatch(text(doc, 'pot-detail'), /退回/);
  assert.ok(flights(doc).every(flight => flight.dataset.flow === 'contribution'));
  view.render(hand);
  assert.equal(text(doc, 'pot-value'), '30'); assert.equal(text(doc, 'contribution-player'), '10');
  assert.equal(flights(doc).filter(flight => flight.dataset.flow === 'refund').length, 1);
  assert.equal(flights(doc).filter(flight => flight.dataset.flow === 'payout').length, 0);
  flights(doc).find(flight => flight.dataset.flow === 'refund').animations[0].finish(); await Promise.resolve();
  assert.equal(text(doc, 'pot-value'), '20');
  assert.equal(flights(doc).filter(flight => flight.dataset.flow === 'payout').length, 1);
  finishFlights(doc); await view.whenIdle(); assert.equal(JSON.stringify(hand), snapshot);
  assert.equal(text(doc, 'pot-value'), '0');
});

test('whenIdle resolves cancelled work independently from the next hand and leaving clears all flights', async () => {
  const doc = fakeDocument(), view = createPotView({root: doc});
  const session = createSession({}, 66), first = startHand(session);
  view.render(first); const oldWait = view.whenIdle(); const oldFlights = [...flights(doc)];
  applyAction(first, 'fold'); const next = startHand(session); view.render(next);
  await oldWait;
  assert.ok(oldFlights.every(flight => flight.removed && flight.animations[0].cancelled));
  assert.equal(doc.getElementById('pot-flight-layer').children.length, 2, 'old wait does not cancel new flights');
  const nextWait = view.whenIdle(); view.render(null); await nextWait; await view.whenIdle();
  assert.equal(doc.getElementById('pot-flight-layer').children.length, 0);
});

test('no WAAPI and reduced motion never block whenIdle while deferred accounting remains explicit', async () => {
  for (const mode of ['no-waapi', 'reduced']) {
    const doc = fakeDocument();
    if (mode === 'no-waapi') {
      const create = doc.createElement;
      doc.createElement = tag => { const element = create(tag); element.animate = undefined; return element; };
    }
    const phases = [];
    const view = createPotView({root: doc, reducedMotion: mode === 'reduced', onPhase: phase => phases.push(phase.flow)});
    const hand = startHand(createSession({}, 20));
    view.render(hand); await view.whenIdle(); passive(hand);
    view.render(hand, hand.config, {deferSettlement: true}); await view.whenIdle();
    assert.equal(text(doc, 'pot-label'), '底池 POT');
    view.render(hand); await view.whenIdle();
    assert.equal(text(doc, 'pot-label'), '底池 POT'); assert.equal(view.settledDelay(), 0);
    assert.equal(text(doc, 'pot-value'), '0');
    assert.deepEqual(phases.filter(flow => flow !== 'arrival').slice(-2), ['payout', 'complete']);
    assert.ok(phases.includes('arrival'), 'motion fallback still emits semantic arrival');
    assert.equal(doc.getElementById('pot-flight-layer').children.length, 0);
  }
});

test('chip piles are preferred flight endpoints, including scaled outbound refund and payout routes', async () => {
  const doc = fakeDocument();
  for (const [seat, left, top] of [['player', 250, 620], ['npc', 80, 180]]) {
    const chips = doc.createElement('div');
    chips.rect = {left, top, width: 80, height: 50}; doc.elements.set(`${seat}-bankroll-chips`, chips);
  }
  doc.getElementById('pot-chips').rect = {left: 175, top: 400, width: 60, height: 50};
  scaleLayout(doc, .8, .6);
  const view = createPotView({root: doc}), hand = startHand(createSession({}, 102));
  view.render(hand);
  const incoming = flights(doc).find(flight => flight.dataset.seat === 'npc');
  assertFlightPoint(incoming, 0, 110, 185); assertFlightPoint(incoming, 3, 195, 405);
  applyAction(hand, 'raise'); applyAction(hand, 'fold'); view.render(hand);
  await finishMotion(doc); await view.whenIdle();
  for (const flow of ['refund', 'payout']) {
    const flight = flights(doc).find(item => item.dataset.flow === flow);
    assertFlightPoint(flight, 0, 195, 405); assertFlightPoint(flight, 3, 280, 625);
  }
});

test('phase notifications follow chip accounting once and reentrant or failing observers cannot strand settlement', async () => {
  const doc = fakeDocument(), hand = startHand(createSession({}, 102)), phases = [];
  let phaseIdle = false, phaseWait;
  applyAction(hand, 'raise'); applyAction(hand, 'fold');
  const snapshot = JSON.stringify(hand), rng = hand.rng.state();
  const view = createPotView({root: doc, onPhase(event) {
    phases.push(event);
    view.render(hand);
    if (event.flow === 'refund') {
      phaseWait = view.whenIdle().then(() => {phaseIdle = true;});
      throw new Error('Cue unavailable');
    }
    if (event.flow === 'payout') return Promise.reject(new Error('Async cue unavailable'));
  }});
  view.render(hand); view.render(hand);
  assert.deepEqual(phases, [{flow: 'contribution', seats: ['player', 'npc'], amounts: {player: 20, npc: 10}}]);
  let idle = false; const waiting = view.whenIdle().then(() => {idle = true;});
  finishFlights(doc); await Promise.resolve(); assert.equal(idle, false);
  assert.equal(phases.filter(event => event.flow !== 'arrival').length, 1, 'arrival pulse still belongs to the inbound phase');
  doc.getElementById('pot-display').animations.at(-1).finish();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(phaseIdle, false, 'whenIdle requested at a phase boundary includes the whole sequence');
  await finishMotion(doc); await waiting; await phaseWait;
  assert.deepEqual(phases.filter(event => event.flow !== 'arrival'), [
    {flow: 'contribution', seats: ['player', 'npc'], amounts: {player: 20, npc: 10}},
    {flow: 'refund', seats: ['player'], amounts: {player: 10}},
    {flow: 'payout', seats: ['player'], amounts: {player: 20}},
    {flow: 'complete', seats: [], amounts: {}}
  ]);
  assert.equal(idle, true); assert.equal(phaseIdle, true); assert.equal(text(doc, 'pot-value'), '0');
  assert.equal(doc.getElementById('pot-chips').children.every(stack => stack.children.length === 0), true);
  view.render(hand); view.render(hand, hand.config, {deferSettlement: true}); await view.whenIdle();
  assert.deepEqual(phases.filter(event => event.flow === 'arrival'), [
    {flow: 'arrival', seats: ['player'], amounts: {player: 20}},
    {flow: 'arrival', seats: ['npc'], amounts: {npc: 10}},
    {flow: 'arrival', seats: ['player'], amounts: {player: 10}},
    {flow: 'arrival', seats: ['player'], amounts: {player: 20}}
  ]);
  assert.equal(phases.length, 8); assert.equal(text(doc, 'pot-value'), '0');
  assert.equal(JSON.stringify(hand), snapshot); assert.equal(hand.rng.state(), rng);
  assert.equal(hand.result.player.refund + hand.result.player.netReturn + hand.result.fee, 30);
});

test('a new hand cancels every pending settlement phase without releasing old refunds, awards or completion', async () => {
  for (const phase of ['contribution', 'refund', 'payout']) {
    const doc = fakeDocument(), phases = [], session = createSession({}, 102);
    const hand = startHand(session), view = createPotView({root: doc, onPhase: event => phases.push(event.flow)});
    applyAction(hand, 'raise'); applyAction(hand, 'fold'); view.render(hand);
    if (phase !== 'contribution') {
      finishFlights(doc); await Promise.resolve();
      doc.getElementById('pot-display').animations.at(-1).finish(); await Promise.resolve();
    }
    if (phase === 'payout') {
      flights(doc).find(flight => flight.dataset.flow === 'refund').animations[0].finish(); await Promise.resolve();
    }
    assert.equal(phases.at(-1), phase);
    const old = [...flights(doc)], oldWait = view.whenIdle(), previousNotifications = phases.length;
    const next = startHand(session); view.render(next);
    await oldWait;
    assert.ok(old.every(flight => flight.removed));
    assert.deepEqual(phases.slice(previousNotifications), ['contribution']);
    await finishMotion(doc); await view.whenIdle();
    assert.deepEqual(phases.slice(previousNotifications), ['contribution', 'arrival', 'contribution', 'arrival'], 'only the next hand contributes its two sequential blind notifications');
    assert.equal(text(doc, 'pot-value'), '15');
    view.render(null); assert.equal(text(doc, 'pot-value'), '0');
  }
});

test('five decorative stacks grow with pot-to-bet ratio, within 15 to 50 chips', () => {
  const doc = fakeDocument(), view = createPotView({root: doc, reducedMotion: true});
  const hand = startHand(createSession({}, 40));
  const count = () => doc.getElementById('pot-chips').children.reduce((sum, stack) => sum + stack.children.length, 0);
  hand.pot = .01; view.render(hand); assert.equal(count(), 15);
  hand.pot = 100; view.render(hand); const mid = count(); assert.ok(mid > 15 && mid < 50);
  view.render(hand, {...hand.config, bigBlind: 100}); assert.ok(count() < mid);
  hand.pot = 1e6; view.render(hand); assert.equal(count(), 50);
  view.render(null); assert.equal(count(), 0);
});

test('each inbound route joins the visible pot on arrival; idle includes one final arrival pulse', async () => {
  const doc = fakeDocument(), view = createPotView({root: doc});
  const hand = startHand(createSession({}, 20)), pot = doc.getElementById('pot-display');
  const chipCount = () => doc.getElementById('pot-chips').children.reduce((sum, stack) => sum + stack.children.length, 0);
  applyAction(hand, 'call'); view.render(hand); view.render(hand);
  assert.equal(text(doc, 'pot-value'), '0'); assert.equal(chipCount(), 0);
  assert.equal(pot.dataset.flow, 'contribution'); assert.equal(flights(doc).length, 2);
  let idle = false; const waiting = view.whenIdle().then(() => { idle = true; });
  flights(doc)[0].animations[0].finish(); await Promise.resolve(); view.render(hand);
  assert.equal(text(doc, 'pot-value'), '10'); assert.ok(chipCount() >= 15);
  assert.equal(pot.dataset.flow, 'contribution'); assert.equal(pot.animations.length, 0);
  flights(doc)[1].animations[0].finish(); await Promise.resolve();
  assert.equal(text(doc, 'pot-value'), '20'); assert.ok(chipCount() >= 15);
  assert.equal(pot.dataset.flow, undefined); assert.equal(pot.animations.length, 1);
  assert.equal(pot.animations[0].options.duration, 200);
  assert.equal(idle, false, 'numeric update happens before idle is allowed to resolve');
  view.render(hand); assert.equal(pot.animations.length, 1);
  pot.animations[0].finish(); await waiting; assert.equal(idle, true);
});

test('compact amount tracks the displayed string and clears when leaving the table', async () => {
  const doc = fakeDocument(), view = createPotView({root: doc});
  const toggles = new Map();
  doc.getElementById('pot-value').classList = {toggle: (key, enabled) => toggles.set(key, enabled)};
  const hand = startHand(createSession({}, 20)); hand.pot = 1234567;
  view.render(hand); assert.equal(toggles.get('compact-amount'), false);
  await finishMotion(doc); await view.whenIdle();
  assert.equal(text(doc, 'pot-value'), '1,234,567'); assert.equal(toggles.get('compact-amount'), true);
  view.render(null); assert.equal(toggles.get('compact-amount'), false);
});

test('opaque arriving chips join the actual pot before removal without revealing the other blind early', async () => {
  for (const firstSeat of ['player', 'npc']) {
    const doc = fakeDocument(), phases = [];
    const view = createPotView({root: doc, onPhase: event => phases.push(event)});
    const hand = startHand(createSession({}, 20)), snapshot = JSON.stringify(hand), rng = hand.rng.state();
    view.render(hand);
    const incoming = flights(doc), first = incoming.find(flight => flight.dataset.seat === firstSeat);
    const second = incoming.find(flight => flight !== first), expected = firstSeat === 'player' ? '5' : '10';
    for (const flight of incoming) assert.equal(flight.animations[0].keyframes.at(-1).opacity, 1);
    const originalRemove = first.remove.bind(first);
    first.remove = () => {
      assert.equal(text(doc, 'pot-value'), expected, 'the arrived payment is already in the pot when the stand-in is removed');
      assert.ok(doc.getElementById('pot-chips').children.some(stack => stack.children.length > 0), 'the physical pot has no empty frame');
      originalRemove();
    };
    first.animations[0].finish(); await Promise.resolve();
    assert.equal(text(doc, 'pot-value'), expected);
    assert.equal(second.removed, undefined, 'the other blind is still in flight');
    view.render(hand); view.render({...hand});
    assert.equal(text(doc, 'pot-value'), expected); assert.equal(flights(doc).length, 2);
    second.animations[0].finish(); await finishMotion(doc); await view.whenIdle();
    assert.equal(text(doc, 'pot-value'), '15');
    assert.deepEqual(phases.filter(event => event.flow === 'arrival').map(event => event.seats[0]), [firstSeat, second.dataset.seat]);
    assert.equal(JSON.stringify(hand), snapshot); assert.equal(hand.rng.state(), rng);
  }
});

test('a missing animation route arrives immediately while the visible route remains pending', async () => {
  const doc = fakeDocument(), create = doc.createElement, phases = [];
  doc.createElement = tag => {
    const element = create(tag), animate = element.animate.bind(element);
    element.animate = (...args) => {
      if (element.dataset.seat === 'npc') throw new Error('Animation unavailable');
      return animate(...args);
    };
    return element;
  };
  const view = createPotView({root: doc, onPhase: event => phases.push(event)}), hand = startHand(createSession({}, 20));
  view.render(hand);
  assert.equal(text(doc, 'pot-value'), '10');
  assert.deepEqual(phases.map(event => event.flow), ['contribution', 'contribution', 'arrival']);
  assert.deepEqual(phases[2], {flow: 'arrival', seats: ['npc'], amounts: {npc: 10}});
  await finishMotion(doc); await view.whenIdle();
  assert.equal(text(doc, 'pot-value'), '15');
  assert.equal(phases.filter(event => event.flow === 'arrival').length, 2);
});

test('arrival watchdog updates each payment and notifies once even if its animation finishes later', async t => {
  const timers = new Map(); let timerId = 0;
  t.mock.method(globalThis, 'setTimeout', (callback, delay) => {timers.set(++timerId, {callback, delay});return timerId;});
  t.mock.method(globalThis, 'clearTimeout', id => timers.delete(id));
  const doc = fakeDocument(), phases = [], view = createPotView({root: doc, onPhase: event => phases.push(event)});
  view.render(startHand(createSession({}, 20)));
  [...timers.values()][0].callback();
  assert.equal(text(doc, 'pot-value'), '5');
  assert.equal(phases.filter(event => event.flow === 'arrival').length, 1);
  finishFlights(doc); await finishMotion(doc); await view.whenIdle();
  assert.equal(text(doc, 'pot-value'), '15');
  assert.equal(phases.filter(event => event.flow === 'arrival').length, 2);
  assert.equal(timers.size, 0);
});
