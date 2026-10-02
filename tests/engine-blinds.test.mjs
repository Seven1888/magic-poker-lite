import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRng, createSession, startHand, legalActions, applyAction,
  previewResponse, getActionDistribution
} from '../src/engine.mjs';

const other = seat => seat === 'player' ? 'npc' : 'player';
const types = hand => legalActions(hand).map(action => action.type);

test('default and fixed opening blinds do not consume RNG; the existing seed-20 deal is unchanged', () => {
  const defaultSession = createSession({}, 20);
  const fixedPlayer = createSession({}, 20, {firstSmallBlind: 'player'});
  const fixedNpc = createSession({}, 20, {firstSmallBlind: 'npc'});
  for (const session of [defaultSession, fixedPlayer, fixedNpc]) {
    assert.equal(session.rng.state(), createRng(20).state());
    assert.equal(session.blindDraw, null);
  }
  assert.equal(defaultSession.firstSmallBlind, 'player');
  assert.equal(fixedNpc.firstSmallBlind, 'npc');
  const hand = startHand(defaultSession), explicit = startHand(fixedPlayer);
  assert.deepEqual(hand.holes, {player: ['Kd', '7c'], npc: ['9h', 'Kc']});
  assert.deepEqual(hand.deck.slice(0, 5), ['3s', 'Qc', '6h', 'Ad', '3d']);
  assert.equal(hand.rng.state(), 1320036257);
  assert.deepEqual(hand.holes, explicit.holes); assert.deepEqual(hand.deck, explicit.deck);
});

test('random opening position consumes exactly one seeded draw, is reproducible, and exposes no roll', () => {
  let playerStarts = 0;
  for (let seed = 0; seed < 4000; seed++) {
    const reference = createRng(seed), firstSmallBlind = reference() < 0.5 ? 'player' : 'npc';
    const session = createSession({}, seed, {firstSmallBlind: 'random'});
    assert.equal(session.firstSmallBlind, firstSmallBlind);
    assert.equal(session.rng.state(), reference.state());
    assert.deepEqual(session.blindDraw, {smallBlind: firstSmallBlind, probability: 0.5});
    assert.equal(Object.hasOwn(session.blindDraw, 'roll'), false);
    playerStarts += firstSmallBlind === 'player';
  }
  assert.ok(playerStarts > 1800 && playerStarts < 2200, `unexpected seeded split: ${playerStarts}/4000`);
  for (const seed of [0, 1, 20, 'entry-draw']) {
    const a = createSession({}, seed, {firstSmallBlind: 'random'});
    const b = createSession({}, seed, {firstSmallBlind: 'random'});
    const one = startHand(a), two = startHand(b);
    assert.equal(one.smallBlind, two.smallBlind);
    assert.deepEqual(one.holes, two.holes); assert.deepEqual(one.deck, two.deck);
    assert.equal(one.rng.state(), two.rng.state());
  }
});

test('either opening seat follows legal preflop order, keeps the big-blind option, and acts second after the flop', () => {
  for (const [firstSmallBlind, seed] of [['player', 20], ['npc', 20], ['random', 0], ['random', 1]]) {
    const session = createSession({}, seed, {firstSmallBlind});
    const hand = startHand(session), small = session.firstSmallBlind, big = other(small);
    assert.equal(hand.smallBlind, small); assert.equal(hand.bigBlind, big); assert.equal(hand.actor, small);
    assert.deepEqual(types(hand), ['fold', 'call', 'raise']);
    assert.deepEqual(legalActions(hand, big), []);
    assert.equal(legalActions(hand).find(action => action.type === 'call').amount, 5);
    assert.equal(hand.contributions[small], 5); assert.equal(hand.contributions[big], 10);
    assert.equal(hand.stacks[small], 995); assert.equal(hand.stacks[big], 990);
    assert.deepEqual(hand.history.map(event => [event.actor, event.type, event.amount]), [[small, 'smallBlind', 5], [big, 'bigBlind', 10]]);
    applyAction(hand, 'call');
    assert.equal(hand.actor, big); assert.equal(hand.street, 'preflop');
    assert.deepEqual(types(hand), ['check', 'raise']);
    applyAction(hand, 'check');
    assert.equal(hand.street, 'flop'); assert.equal(hand.actor, big);
    assert.deepEqual(types(hand), ['check', 'bet']);
    applyAction(hand, 'check'); assert.equal(hand.actor, small);
    applyAction(hand, 'check'); assert.equal(hand.street, 'turn'); assert.equal(hand.actor, big);
  }
});

test('the entry choice stays fixed while successive hands alternate and carry balances', () => {
  for (const firstSmallBlind of ['player', 'npc', 'random']) {
    const session = createSession({}, 1, {firstSmallBlind}), initial = session.firstSmallBlind;
    const initialDraw = structuredClone(session.blindDraw);
    let previousStacks = {...session.stacks};
    for (let index = 0; index < 6; index++) {
      const hand = startHand(session), expected = index % 2 === 0 ? initial : other(initial);
      assert.equal(hand.smallBlind, expected); assert.equal(hand.actor, expected);
      assert.deepEqual(hand.stacksBefore, previousStacks);
      assert.equal(hand.stacks[expected], Math.round((previousStacks[expected] - 5) * 1e6) / 1e6);
      assert.equal(hand.stacks[other(expected)], previousStacks[other(expected)] - 10);
      applyAction(hand, 'fold');
      assert.equal(session.firstSmallBlind, initial); assert.deepEqual(session.blindDraw, initialDraw);
      assert.ok(Math.abs(session.stacks.player + session.stacks.npc + session.fees - 2000) < 1e-6);
      previousStacks = {...session.stacks};
    }
  }
});

test('previews retain the chosen opening blind and leave its metadata and RNG untouched', () => {
  for (const firstSmallBlind of ['npc', 'random']) {
    const session = createSession({}, 1, {firstSmallBlind}), hand = startHand(session);
    if (hand.actor === 'npc') applyAction(hand, 'call');
    const snapshot = JSON.stringify(hand), state = session.rng.state();
    const preview = previewResponse(hand, 'raise');
    assert.equal(JSON.stringify(hand), snapshot); assert.equal(session.rng.state(), state);
    assert.equal(session.firstSmallBlind, 'npc');
    applyAction(hand, 'raise');
    assert.deepEqual(getActionDistribution(hand), preview.distribution);
  }
});

test('opening-blind options reject unsupported modes, keys and non-object input', () => {
  for (const firstSmallBlind of ['PLAYER', 'coin', '', false, 0, null, {}, []]) {
    assert.throws(() => createSession({}, 1, {firstSmallBlind}), /firstSmallBlind/);
  }
  for (const options of [null, true, 'random', [], {firstSmallBlind: 'player', unknown: true}]) {
    assert.throws(() => createSession({}, 1, options), /選項/);
  }
  assert.equal(createSession({}, 1, {}).firstSmallBlind, 'player');
  assert.equal(createSession({}, 1, {firstSmallBlind: undefined}).firstSmallBlind, 'player');
});
