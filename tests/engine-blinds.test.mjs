import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRng, createSession as createEngineSession, startHand, legalActions, applyAction,
  previewResponse, getActionDistribution
} from './legacy-engine.mjs';

// Preserve the exact historical blind/deal RNG reference; current default
// prebuilt-pool execution and random blinds are covered in outcome-engine.test.
const createSession = (config = {}, seed, options) => createEngineSession(
  {...config, outcome: {mode: 'legacy-deck', ...config.outcome}}, seed, options);

const other = seat => seat === 'player' ? 'npc' : 'player';
const types = hand => legalActions(hand).map(action => action.type);

test('default and fixed opening blinds do not consume RNG; legacy score imports preserve the seed-20 deal', () => {
  const legacy = {boss: {mode: 'legacy'}, deal: {player: {targetScore: 0.48}, npc: {targetScore: 0.48}}};
  const defaultSession = createSession(legacy, 20);
  const fixedPlayer = createSession(legacy, 20, {firstSmallBlind: 'player'});
  const fixedNpc = createSession(legacy, 20, {firstSmallBlind: 'npc'});
  assert.equal(createSession({}, 20).rng.state(), createRng(20).state());
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
    const session = createSession({buyIn: 1000}, seed, {firstSmallBlind});
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

test('explicit research positions keep alternating hands and carry balances without blind RNG', () => {
  for (const firstSmallBlind of ['player', 'npc']) {
    const session = createSession({buyIn: 1000}, 1, {firstSmallBlind}), initial = session.firstSmallBlind;
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

test('every random next hand consumes one fresh blind draw before BOSS selection and dealing', () => {
  let repeats = 0, changed = 0, playerStarts = 0, draws = 0;
  for (let seed = 0; seed < 80; seed++) {
    const session = createSession({buyIn: 1000}, seed, {firstSmallBlind: 'random'});
    const reference = createSession({buyIn: 1000}, seed, {firstSmallBlind: 'random'});
    const initial = session.firstSmallBlind;
    let previousSeat = null, previousStacks = {...session.stacks};
    for (let index = 0; index < 6; index++) {
      const expected = index === 0 ? initial : reference.rng() < 0.5 ? 'player' : 'npc';
      // Having consumed precisely the one expected draw, use the deterministic
      // path to verify that all later BOSS/deal draws match with no extra draw.
      reference.blindMode = 'alternate';
      reference.firstSmallBlind = index % 2 === 0 ? expected : other(expected);
      const hand = startHand(session), control = startHand(reference);
      assert.equal(hand.smallBlind, expected);
      assert.equal(hand.actor, expected);
      assert.deepEqual(hand.stacksBefore, previousStacks);
      assert.equal(hand.contributions[expected], 5);
      assert.equal(hand.contributions[other(expected)], 10);
      assert.deepEqual(hand.bossSelection, control.bossSelection);
      assert.deepEqual(hand.holes, control.holes);
      assert.deepEqual(hand.deck, control.deck);
      assert.equal(session.rng.state(), reference.rng.state());
      assert.equal(session.firstSmallBlind, initial, 'the first hand metadata remains stable');
      assert.deepEqual(session.blindDraw, {smallBlind: expected, probability: 0.5});
      assert.equal(Object.hasOwn(session.blindDraw, 'roll'), false);
      if (index > 0) {
        draws++; playerStarts += expected === 'player';
        if (expected === previousSeat) repeats++; else changed++;
      }
      applyAction(hand, 'call'); applyAction(control, 'call');
      applyAction(hand, 'check'); applyAction(control, 'check');
      assert.equal(hand.actor, other(expected), 'the freshly drawn BB acts first postflop');
      applyAction(hand, 'bet'); applyAction(control, 'bet');
      applyAction(hand, 'fold'); applyAction(control, 'fold');
      assert.deepEqual(session.stacks, reference.stacks);
      assert.ok(Math.abs(session.stacks.player + session.stacks.npc + session.fees - 2000) < 1e-6);
      previousSeat = expected; previousStacks = {...session.stacks};
    }
  }
  assert.ok(repeats > 100 && changed > 100, `next hands allow repeat/switch: ${repeats}/${changed}`);
  assert.ok(playerStarts > draws * 0.4 && playerStarts < draws * 0.6, `seeded split ${playerStarts}/${draws}`);
});

test('failed or duplicate starts cannot consume another blind draw or change the current result', () => {
  const session = createSession({}, 72, {firstSmallBlind: 'random'});
  const first = startHand(session);
  const snapshot = () => ({state: session.rng.state(), session: JSON.stringify(session), hand: JSON.stringify(session.activeHand)});
  const playing = snapshot();
  assert.throws(() => startHand(session), /尚未結束/);
  assert.deepEqual(snapshot(), playing);
  applyAction(first, 'fold');
  session.stacks.player = 0;
  const insufficient = snapshot();
  assert.throws(() => startHand(session), {code: 'INSUFFICIENT_HAND_ASSETS'});
  assert.deepEqual(snapshot(), insufficient);
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
