import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession, startHand, legalActions, applyAction, getActionDistribution, sampleDistribution} from '../src/engine.mjs';
import {buyInFromWallet, cashOutToWallet, snapshotTableSession, restoreTableSession} from '../src/table-wallet.mjs';

const fixed = {outcome: {mode: 'fixed-holdem'}, smallBlind: 10, boss: {mode: 'fixed', profileId: 'maniac'}};
const create = seed => createSession(fixed, seed, {firstSmallBlind: 'player'});
const choose = (hand, type, size) => legalActions(hand).find(action => action.type === type && (!size || action.sizeKeys?.includes(size)));
const reload = session => restoreTableSession(JSON.parse(JSON.stringify(snapshotTableSession(session))));
const state = session => snapshotTableSession(session);

test('SB 10 entry transfers exactly 1,000 wallet units into table chips', () => {
  assert.deepEqual(buyInFromWallet(10000, 10), {balance: 9000, chips: 1000, buyIn: 1000});
  assert.deepEqual(buyInFromWallet(1000, 10), {balance: 0, chips: 1000, buyIn: 1000});
  assert.deepEqual(buyInFromWallet(123.5, .25), {balance: 98.5, chips: 25, buyIn: 25});
  assert.throws(() => buyInFromWallet(999.999999, 10), /Not enough balance/);
  for (const amount of [NaN, Infinity, -1]) assert.throws(() => buyInFromWallet(amount, 10));
  for (const smallBlind of [0, -1, NaN, Infinity]) assert.throws(() => buyInFromWallet(10000, smallBlind));
});

test('cash-out combines the remaining table chips with the uncommitted wallet', () => {
  const entry = buyInFromWallet(10000, 10);
  assert.equal(cashOutToWallet(entry.balance, entry.chips), 10000);
  assert.equal(cashOutToWallet(entry.balance, 975), 9975);
  assert.equal(cashOutToWallet(entry.balance, 0), entry.balance);
  assert.equal(cashOutToWallet(.1, .2), .3);
  for (const amount of [NaN, Infinity, -1]) assert.throws(() => cashOutToWallet(9000, amount));
});

test('saving an entry before its first hand retains chips and resumes the exact opening deal', () => {
  const original = create(893), restored = reload(original);
  assert.deepEqual(state(original), state(restored));
  assert.equal(restored.activeHand, undefined);
  startHand(original); startHand(restored);
  assert.deepEqual(state(original), state(restored));
});

test('active-hand JSON reload retains RNG, fixed cards, locked classification and the exact next NPC sample', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const original = create(seed), hand = startHand(original);
    applyAction(hand, choose(hand, 'raise', 'half'));
    const restored = reload(original), copy = restored.activeHand;
    assert.deepEqual(state(original), state(restored));
    assert.notEqual(original, restored); assert.notEqual(hand, copy);
    assert.equal(copy.session, restored); assert.equal(copy.stacks, restored.stacks);
    assert.equal(copy.rng, restored.rng);
    assert.deepEqual(copy.bossStreetStrength, hand.bossStreetStrength);
    const first = getActionDistribution(hand), second = getActionDistribution(copy);
    assert.deepEqual(first, second);
    const selected = sampleDistribution(first, original.rng), repeated = sampleDistribution(second, restored.rng);
    assert.deepEqual(selected, repeated);
    applyAction(hand, selected); applyAction(copy, repeated);
    assert.deepEqual(state(original), state(restored));
  }
});

test('reload after multiple reraises preserves reopening rights, next quotes and settlement', () => {
  const original = create(984), hand = startHand(original);
  for (let index = 0; index < 3; index++) applyAction(hand, choose(hand, 'raise', 'half'));
  const restored = reload(original), copy = restored.activeHand;
  assert.equal(copy.raises, 3);
  assert.equal(copy.lastFullRaise, hand.lastFullRaise);
  assert.deepEqual(copy.actedSinceFullRaise, hand.actedSinceFullRaise);
  assert.deepEqual(legalActions(copy), legalActions(hand));
  applyAction(hand, choose(hand, 'raise', 'allin'));
  applyAction(copy, choose(copy, 'raise', 'allin'));
  applyAction(hand, 'call'); applyAction(copy, 'call');
  assert.deepEqual(state(original), state(restored));
  assert.equal(copy.result.reason, 'showdown');
  assert.deepEqual(copy.holes, hand.holes); assert.deepEqual(copy.board, hand.board);
});

test('all four street locks survive reload without reclassifying or consuming another draw', () => {
  const original = create(357), hand = startHand(original);
  for (const street of ['preflop', 'flop', 'turn', 'river']) {
    assert.equal(hand.street, street);
    const restored = reload(original), copy = restored.activeHand;
    assert.deepEqual(copy.bossStreetStates, hand.bossStreetStates);
    assert.equal(copy.bossStreetStrength.street, street);
    const before = restored.rng.state();
    getActionDistribution(copy);
    assert.equal(restored.rng.state(), before);
    while (hand.status === 'playing' && hand.street === street) {
      const action = legalActions(hand).find(item => item.type === 'call' || item.type === 'check');
      applyAction(hand, action); applyAction(copy, action);
    }
    assert.deepEqual(state(original), state(restored));
  }
});

test('reloading a settled hand cannot pay it again or change its available cash-out', () => {
  const entry = buyInFromWallet(10000, 10), original = create(191), hand = startHand(original);
  applyAction(hand, choose(hand, 'raise', 'allin')); applyAction(hand, 'call');
  const restored = reload(original), copy = restored.activeHand;
  const before = state(restored), cashOut = cashOutToWallet(entry.balance, restored.stacks.player);
  assert.equal(copy.status, 'settled'); assert.deepEqual(legalActions(copy), []);
  assert.throws(() => applyAction(copy, 'call'));
  assert.deepEqual(state(restored), before);
  assert.equal(cashOutToWallet(entry.balance, restored.stacks.player), cashOut);
  assert.equal(cashOutToWallet(entry.balance, original.stacks.player), cashOut);
});

test('saving and mutating a restored hand never mutate the source or saved snapshot', () => {
  const session = create(655), hand = startHand(session), saved = state(session);
  const baseline = structuredClone(saved), copy = restoreTableSession(saved);
  applyAction(copy.activeHand, choose(copy.activeHand, 'raise', 'pot'));
  assert.deepEqual(saved, baseline); assert.deepEqual(state(session), baseline);
  assert.equal(hand.history.length, 2);
});

test('every later sample and settlement matches after repeated in-hand reloads', () => {
  for (let seed = 0; seed < 30; seed++) {
    const original = create(seed), hand = startHand(original);
    let restored = reload(original), steps = 0;
    while (hand.status === 'playing') {
      assert.ok(++steps < 100);
      const distribution = getActionDistribution(hand, hand.actor, 'aggressive');
      const reference = getActionDistribution(restored.activeHand, restored.activeHand.actor, 'aggressive');
      assert.deepEqual(distribution, reference);
      const action = sampleDistribution(distribution, original.rng), copied = sampleDistribution(reference, restored.rng);
      assert.deepEqual(action, copied);
      applyAction(hand, action); applyAction(restored.activeHand, copied);
      assert.deepEqual(state(original), state(restored));
      restored = reload(restored);
    }
    assert.deepEqual(hand.result, restored.activeHand.result);
  }
});

test('unsupported snapshots and invalid stored stacks reject before returning a session', () => {
  for (const value of [null, {}, {version: 2}, {version: 1, rngState: 1, session: {config: {outcome: {mode: 'prebuilt-pools'}}}}]) {
    assert.throws(() => restoreTableSession(value));
  }
  const session = create(15); startHand(session);
  for (const value of [NaN, Infinity, -1]) {
    const saved = state(session); saved.session.stacks.player = value;
    assert.throws(() => restoreTableSession(saved));
  }
});
