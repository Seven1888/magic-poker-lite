import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_CONFIG, normalizeConfig, createSession, startHand, applyAction, legalActions, cloneHand,
  getActionDistribution, previewResponse, stepNpc, endHandForTableExit, createRng, makeDeck, shuffle,
  compareHands, playAutomatedHand, beginNewTable, simulate} from '../src/engine.mjs';
import {isNaturalHoldem, isHoldemBetting} from '../src/holdem-betting.mjs';
import {NATURAL_HOLDEM_RULES, assertNaturalHoldemIntegrity, lockNaturalHoldemDeal} from '../src/natural-holdem.mjs';

const settings = (extra = {}) => ({smallBlind: 1, ...extra, outcome: {mode: 'natural-holdem', ...extra.outcome},
  boss: {mode: 'fixed', profileId: 'maniac', ...extra.boss}});
const sessionFor = (extra = {}, seed = 0, options) => createSession(settings(extra), seed, options);
const open = (extra = {}, seed = 0, options) => startHand(sessionFor(extra, seed, options));
const choose = (hand, type, size) => {
  const action = legalActions(hand).find(action => action.type === type && (!size || action.sizeKeys?.includes(size)));
  assert.ok(action, `missing ${type}:${size} on ${hand.actor}/${hand.street}`);
  return action;
};
const take = (hand, type, size) => applyAction(hand, choose(hand, type, size));
const passive = hand => {
  let steps = 0;
  while (hand.status === 'playing') {
    assert.ok(++steps < 30);
    applyAction(hand, legalActions(hand).find(action => ['check', 'call'].includes(action.type)));
  }
  return hand;
};
const snapshot = session => ({session: JSON.stringify(session), hand: JSON.stringify(session.activeHand), rng: session.rng.state()});
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.000003, `${actual} != ${expected}`);
const ledger = hand => {
  const r = hand.result;
  near(r.player.stackAfter + r.npc.stackAfter, r.player.stackBefore + r.npc.stackBefore);
  near(r.player.stackAfter - r.player.stackBefore, r.player.totalReturn - r.player.matchedWager);
  assert.equal(r.fee, 0); assert.equal(r.jackpot, null); assert.equal(r.outcomePoolAudit, null);
  assert.equal(r.player.jackpotAward, 0); assert.equal(r.npc.jackpotAward, 0);
  assert.deepEqual(r.rulesSnapshot, NATURAL_HOLDEM_RULES);
  assertNaturalHoldemIntegrity(hand);
};

test('natural Holdem is the default with explicit versioned full-pot rules and no outcome controller', () => {
  assert.equal(DEFAULT_CONFIG.outcome.mode, 'natural-holdem');
  const config = normalizeConfig({targetRtp: .5, jackpotEnabled: true});
  assert.ok(isNaturalHoldem(config)); assert.ok(isHoldemBetting(config));
  assert.equal(config.targetRtp, 1); assert.equal(config.jackpotEnabled, false);
  assert.equal(config.maxRaises, null); assert.equal(config.buyIn, 500);
  const hand = startHand(createSession());
  assert.deepEqual(hand.rulesSnapshot, NATURAL_HOLDEM_RULES);
  for (const key of ['outcomeDecision', 'outcomeHandId', 'outcomePoolsBefore', 'pooledHoldem', '_outcomeTree']) {
    assert.equal(Object.hasOwn(hand, key), false);
  }
  assert.ok(Object.isFrozen(hand.rulesSnapshot)); assert.ok(Object.isFrozen(hand.naturalHoldem.order));
  assert.ok(Object.isFrozen(hand.config)); assert.ok(Object.isFrozen(hand.holes.player));
});

test('each opening uses exactly one seeded full-deck shuffle and never redraws for a winner', () => {
  const prefixes = new Set(), outcomes = new Set();
  for (let seed = 0; seed < 256; seed++) {
    const hand = open({}, seed), expectedRng = createRng(seed), expectedDeck = shuffle(makeDeck(), expectedRng);
    assert.deepEqual(hand.naturalHoldem.order, expectedDeck);
    assert.equal(hand.rng.state(), expectedRng.state());
    assert.equal(new Set([...hand.holes.player, ...hand.holes.npc, ...hand.deck]).size, 52);
    assert.equal(hand.dealAudit.player.rerolls, 0); assert.equal(hand.dealAudit.npc.rerolls, 0);
    prefixes.add(hand.naturalHoldem.order.slice(0, 9).join(','));
    outcomes.add(Math.sign(compareHands([...hand.holes.player, ...hand.deck.slice(0, 5)], [...hand.holes.npc, ...hand.deck.slice(0, 5)])));
  }
  assert.equal(prefixes.size, 256); assert.deepEqual([...outcomes].sort(), [-1, 0, 1]);
});

test('manual cards are rejected and imported reroll settings cannot bias natural dealing', () => {
  assert.throws(() => sessionFor({deal: {player: {manual: ['As', 'Ah']}}}), /uniform deck/);
  const left = open(), right = open({deal: {player: {rerollChance: 1, maxRerolls: 50}, npc: {rerollChance: 1, maxRerolls: 50}}});
  assert.deepEqual(left.naturalHoldem.order, right.naturalHoldem.order);
});

test('player 2P and 4P quotes, NPC half/pot quotes and BB option preserve the full action tree', () => {
  const hand = open();
  assert.deepEqual(legalActions(hand).map(action => action.id), ['fold', 'call', 'raise:2x', 'raise:4x', 'raise:allin']);
  assert.equal(choose(hand, 'raise', '2x').amount, 6); assert.equal(choose(hand, 'raise', '4x').amount, 12);
  take(hand, 'call');
  assert.equal(hand.actor, 'npc'); assert.equal(hand.street, 'preflop');
  assert.deepEqual(legalActions(hand).map(action => action.id), ['check', 'raise:half', 'raise:pot', 'raise:allin']);
  take(hand, 'raise', 'half'); take(hand, 'raise', '2x');
  assert.ok(legalActions(hand).some(action => action.type === 'raise'));
  take(hand, 'call'); assert.equal(hand.street, 'flop'); assert.equal(hand.actor, hand.bigBlind);
  passive(hand); ledger(hand);
});

test('all paid and free actions preserve both private hands, the board sequence and result RNG state', () => {
  const hand = open(), locked = structuredClone(hand.naturalHoldem), rng = hand.rng.state();
  take(hand, 'raise', '2x'); take(hand, 'raise', 'pot'); take(hand, 'call');
  while (hand.status === 'playing') {
    assert.equal(hand.rng.state(), rng);
    assert.deepEqual(hand.naturalHoldem, locked); assertNaturalHoldemIntegrity(hand);
    applyAction(hand, legalActions(hand).find(action => ['check', 'call'].includes(action.type)));
  }
  assert.deepEqual(hand.board, locked.order.slice(4, 9)); assert.equal(hand.rng.state(), rng); ledger(hand);
});

test('historical pools remain untouched and cannot change a new deal, action, payout or RNG', () => {
  const extras = {outcome: {conversionRate: 0, initialPaidActionPools: [1000, 2000, 3000], initialSpecialPools: [5000, 6000, 7000], initialPaidActionCooldown: 5}};
  const left = open(), right = open(extras), pools = structuredClone(right.session.outcomePools);
  assert.deepEqual(left.naturalHoldem.order, right.naturalHoldem.order);
  take(left, 'raise', '4x'); take(right, 'raise', '4x');
  take(left, 'call'); take(right, 'call'); passive(left); passive(right);
  assert.deepEqual(left.result, right.result); assert.equal(left.rng.state(), right.rng.state());
  assert.deepEqual(right.session.outcomePools, pools); ledger(right);
});

test('previews and cloned branches never advance the live RNG, cards or accounts', () => {
  const hand = open(), before = snapshot(hand.session);
  for (const action of legalActions(hand)) previewResponse(hand, action.id);
  const copy = cloneHand(hand); take(copy, 'raise', '4x'); stepNpc(copy);
  assert.deepEqual(snapshot(hand.session), before);
  assert.notEqual(copy.naturalHoldem, hand.naturalHoldem);
  assert.throws(() => copy.naturalHoldem.order.reverse(), TypeError);
  assert.throws(() => copy.rulesSnapshot.bossPolicy = 'unknown', TypeError);
});

test('invalid commands and corrupted deals reject atomically, including NPC sampling', () => {
  const hand = open();
  const rejectWithoutMutation = (operation, pattern) => {
    const before = snapshot(hand.session), rng = hand.rng, stacks = hand.stacks;
    assert.throws(operation, pattern);
    assert.deepEqual(snapshot(hand.session), before); assert.equal(hand.rng, rng); assert.equal(hand.stacks, stacks);
  };
  rejectWithoutMutation(() => applyAction(hand, {...choose(hand, 'raise', '2x'), amount: 0}), /合法動作/);
  hand.deck.reverse();
  rejectWithoutMutation(() => take(hand, 'call'), /integrity/);
  hand.deck.reverse(); take(hand, 'call');
  hand.outcomeDecision = {target: 'win'};
  rejectWithoutMutation(() => stepNpc(hand), /forbidden result controller/);
  delete hand.outcomeDecision;
  hand.rulesSnapshot = {...NATURAL_HOLDEM_RULES, bossPolicy: 'unrecognized'};
  rejectWithoutMutation(() => stepNpc(hand), /unknown rules snapshot/);
});

test('a replaced hand config cannot silently change an existing hand contract', () => {
  const hand = open();
  hand.config = {...hand.config, bigBlind: 20};
  const before = snapshot(hand.session);
  assert.throws(() => take(hand, 'call'), /configuration changed/);
  assert.deepEqual(snapshot(hand.session), before);
});

test('failed opening commits no hand number, blind, money, opponent refill or RNG', () => {
  const session = sessionFor(), rng = session.rng;
  session.rng = Object.assign(() => NaN, {state: () => rng.state(), clone: () => Object.assign(() => NaN, {state: () => rng.state()})});
  const before = snapshot(session), stacks = session.stacks, pools = session.outcomePools;
  assert.throws(() => startHand(session), /invalid deal RNG/);
  assert.deepEqual(snapshot(session), before); assert.equal(session.stacks, stacks); assert.equal(session.outcomePools, pools);
});

test('short blinds, merged all-ins and short calls settle without replacement cards or pool activity', () => {
  for (const chips of [.000001, .5, 1, 1.5, 2, 3]) for (const firstSmallBlind of ['player', 'npc']) {
    const session = sessionFor({}, 7, {firstSmallBlind}); session.stacks = {player: chips, npc: 0};
    const hand = startHand(session), rng = hand.rng.state();
    assert.deepEqual(hand.stacksBefore, {player: chips, npc: chips});
    if (hand.status === 'playing') passive(hand);
    assert.equal(hand.rng.state(), rng); assert.equal(hand.board.length, 5); ledger(hand);
  }
  const hand = open({buyIn: 3});
  const aggressive = legalActions(hand).filter(action => action.type === 'raise');
  assert.equal(aggressive.length, 1); assert.deepEqual(aggressive[0].sizeKeys, ['2x', '4x', 'allin']);
  assert.equal(aggressive[0].fullRaise, false);
  applyAction(hand, aggressive[0]); assert.deepEqual(legalActions(hand).map(action => action.type), ['fold', 'call']);
  take(hand, 'call'); ledger(hand);
});

test('fold refunds only unmatched chips and closing an all-in hand completes the locked deal', () => {
  const folded = open(); take(folded, 'raise', '4x'); take(folded, 'fold');
  assert.equal(folded.result.player.refund, 11); assert.equal(folded.result.player.matchedWager, 2);
  assert.equal(folded.result.player.totalReturn, 4); ledger(folded);
  const exiting = open(); take(exiting, 'raise', 'allin'); endHandForTableExit(exiting);
  assert.equal(exiting.status, 'settled'); ledger(exiting);
  const settled = snapshot(exiting.session); endHandForTableExit(exiting); assert.deepEqual(snapshot(exiting.session), settled);
});

test('a restored snapshot validates and refreezes its existing cards without consuming RNG', () => {
  const original = open({}, 991); take(original, 'call'); take(original, 'check');
  const data = JSON.parse(JSON.stringify(original)), rng = original.rng.clone();
  const session = {...data.session, rng, stacks: {...data.stacks}};
  const restored = {...data, session, rng, stacks: session.stacks};
  Object.defineProperty(session, 'activeHand', {value: restored, writable: true, configurable: true});
  lockNaturalHoldemDeal(restored); assert.equal(restored.rng.state(), original.rng.state());
  assert.ok(Object.isFrozen(restored.naturalHoldem.order));
  while (original.status === 'playing') {
    assert.deepEqual(getActionDistribution(restored), getActionDistribution(original));
    const chosen = legalActions(original).find(action => ['call', 'check'].includes(action.type));
    applyAction(original, chosen); applyAction(restored, chosen);
  }
  assert.deepEqual(restored.result, original.result); assert.equal(restored.rng.state(), original.rng.state());
});

test('multi-hand play preserves chips, alternate blinds, NPC matching and seeded reproducibility', () => {
  const left = sessionFor({}, 884), right = sessionFor({}, 884); let lastBlind = null;
  for (let index = 0; index < 60; index++) {
    if (left.stacks.player <= 0) { beginNewTable(left); beginNewTable(right); lastBlind = null; }
    const before = left.stacks.player, hand = playAutomatedHand(left, 'aggressive'), copy = playAutomatedHand(right, 'aggressive');
    assert.deepEqual(hand.result, copy.result); assert.equal(left.rng.state(), right.rng.state());
    assert.deepEqual(hand.stacksBefore, {player: before, npc: before});
    if (lastBlind) assert.notEqual(hand.smallBlind, lastBlind);
    lastBlind = hand.smallBlind; ledger(hand);
  }
  const report = simulate(settings(), {seed: 9, hands: 10, policy: 'call'});
  assert.equal(report.ruleSet, NATURAL_HOLDEM_RULES.id); assert.deepEqual(report.ci95, [null, null]);
  assert.equal(report.conservationError, 0); assert.equal(report.jackpotAwards, 0);
});
