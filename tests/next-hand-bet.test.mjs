import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession, startHand, legalActions, applyAction, syncOpponentBankroll} from './legacy-engine.mjs';
import {nextHandBetConfig} from '../src/next-hand-bet.mjs';
import {minimumAssets, tableConfig} from '../src/entry-model.mjs';

function settledSession(config = {}, seed = 7182) {
  const session = createSession({minBuyIn: 200, ...config}, seed, {firstSmallBlind: 'random'});
  applyAction(startHand(session), 'fold');
  return session;
}

function snapshot(session) {
  return {session: JSON.stringify(session), hand: JSON.stringify(session.activeHand), rng: session.rng.state()};
}

function passive(hand) {
  let turns = 0;
  while (hand.status === 'playing') {
    assert.ok(++turns < 40);
    applyAction(hand, legalActions(hand).find(action => ['call', 'check'].includes(action.type)).type);
  }
  return hand;
}

test('BET changes require the actual current settled hand and a result', () => {
  const session = createSession({}, 72);
  assert.throws(() => nextHandBetConfig(session, 20), /current hand has settled/);
  assert.throws(() => nextHandBetConfig(null, 20), /current hand has settled/);
  const first = startHand(session), playing = snapshot(session);
  assert.throws(() => nextHandBetConfig(session, 10), /current hand has settled/);
  assert.deepEqual(snapshot(session), playing);
  applyAction(first, 'fold');
  const result = first.result;
  first.result = null;
  assert.throws(() => nextHandBetConfig(session, 20), /current hand has settled/);
  first.result = result;
  const foreign = {...session};
  foreign.activeHand = first;
  assert.throws(() => nextHandBetConfig(foreign, 20), /current hand has settled/);
  const second = startHand(session);
  applyAction(second, 'fold');
  session.activeHand = first;
  assert.throws(() => nextHandBetConfig(session, 20), /current hand has settled/);
  session.activeHand = second;
  assert.equal(nextHandBetConfig(session, 20).bigBlind, 20);
});

test('invalid BET values reject without changing the session, hand or RNG', () => {
  const session = settledSession(), before = snapshot(session);
  for (const bet of [NaN, Infinity, -Infinity, -1, 0, 0.0199999, '20', null, undefined, Number.MAX_VALUE]) {
    assert.throws(() => nextHandBetConfig(session, bet), RangeError);
    assert.deepEqual(snapshot(session), before);
  }
});

test('a pure quote scales current street stakes and limits while retaining the original buy-in', () => {
  const session = settledSession({betSize: {preflop: 15, flop: 30, turn: 80, river: 120}});
  const original = session.config, before = snapshot(session);
  Object.freeze(original.betSize);
  Object.freeze(original);
  const config = nextHandBetConfig(session, 2);
  assert.notEqual(config, original);
  assert.notEqual(config.betSize, original.betSize);
  assert.equal(config.bigBlind, 2);
  assert.equal(config.smallBlind, 1);
  assert.equal(config.minBuyIn, 40);
  assert.equal(config.maxBuyIn, 2000);
  assert.equal(config.buyIn, 10000, 'buyIn must not be clamped to the smaller maximum');
  assert.deepEqual(config.betSize, {preflop: 3, flop: 6, turn: 16, river: 24});
  for (const key of Object.keys(original).filter(key => !['bigBlind', 'smallBlind', 'minBuyIn', 'maxBuyIn', 'betSize'].includes(key))) {
    assert.equal(config[key], original[key], `${key} remains unchanged`);
  }
  assert.equal(session.config, original);
  assert.equal(session.activeHand.config, original);
  assert.deepEqual(snapshot(session), before);
});

test('BET, blinds, limits and all street stakes use the engine six-decimal precision', () => {
  const session = settledSession();
  const config = nextHandBetConfig(session, 0.0333333);
  assert.equal(config.bigBlind, 0.033333);
  assert.equal(config.smallBlind, 0.016667);
  assert.equal(config.minBuyIn, 0.66666);
  assert.equal(config.maxBuyIn, 33.333);
  assert.deepEqual(config.betSize, {preflop: 0.033333, flop: 0.066666, turn: 0.133332, river: 0.133332});
  assert.equal(nextHandBetConfig(session, 0.02).smallBlind, 0.01);
  session.config = config;
  assert.equal(nextHandBetConfig(session, 0.0333331), config, 'equivalent rounded BET is unchanged');
});

test('entry display, first-hand config and next-hand quote agree at fractional minimum boundaries', () => {
  for (const [minBuyIn, bet, expected] of [[10.000001, 5, 5], [200, 0.0333333, 0.66666], [200, 5.0000004, 100]]) {
    const session = settledSession({minBuyIn, ...(bet<1?{outcome:{mode:'legacy-deck'}}:{})}), base = session.config;
    assert.equal(minimumAssets(base, bet), expected);
    const entry = tableConfig(base, bet, expected);
    session.stacks = {player: expected, npc: expected};
    const before = snapshot(session), next = nextHandBetConfig(session, bet);
    assert.deepEqual(snapshot(session), before);
    assert.equal(entry.minBuyIn, expected);
    assert.equal(next.minBuyIn, expected);
    assert.equal(entry.bigBlind, next.bigBlind);
    assert.deepEqual(entry.betSize, next.betSize);
    session.stacks.player = Math.round((expected - 0.000001) * 1e6) / 1e6;
    assert.throws(() => nextHandBetConfig(session, bet), {code: 'INSUFFICIENT_HAND_ASSETS'});
    assert.throws(() => tableConfig(base, bet, session.stacks.player), /Not enough chips/);
    session.stacks.player = expected;
    session.config = next;
    const hand = startHand(session);
    assert.equal(hand.stacksBefore.player, expected);
    assert.equal(hand.stacksBefore.npc, expected);
  }
});

test('both balances must meet the scaled configured minimum and rejection never replenishes chips', () => {
  for (const seat of ['player', 'npc']) {
    const session = settledSession();
    session.stacks = {player: 400, npc: 400, [seat]: 399.999999};
    const before = snapshot(session);
    assert.throws(() => nextHandBetConfig(session, 20), /Not enough chips/);
    assert.deepEqual(snapshot(session), before);
    session.stacks[seat] = 400;
    assert.equal(nextHandBetConfig(session, 20).minBuyIn, 400);
  }
  const custom = settledSession({minBuyIn: 350});
  custom.stacks = {player: 69.999999, npc: 70};
  assert.throws(() => nextHandBetConfig(custom, 2), /Not enough chips/);
  custom.stacks.player = 70;
  assert.equal(nextHandBetConfig(custom, 2).minBuyIn, 70, 'retain a configured minimum other than 20 BB');
});

test('retaining the original BET uses the same exact minimum as changing BET', () => {
  for (const seat of ['player', 'npc']) {
    const session = settledSession(), config = session.config;
    session.stacks = {player: 200, npc: 200, [seat]: 199.999999};
    const before = snapshot(session);
    assert.throws(() => nextHandBetConfig(session, 10), {code: 'INSUFFICIENT_HAND_ASSETS'});
    assert.deepEqual(snapshot(session), before);
    assert.throws(() => startHand(session), {code: 'INSUFFICIENT_HAND_ASSETS'});
    assert.deepEqual(snapshot(session), before);
    session.stacks[seat] = 200;
    assert.equal(nextHandBetConfig(session, 10), config);
    const next = startHand(session);
    assert.deepEqual(next.stacksBefore, {player: 200, npc: 200});
  }
});

test('lowering BET can restore hand eligibility without replenishing the session', () => {
  const session = settledSession(), original = session.config;
  session.stacks = {player: 100, npc: 100};
  const before = snapshot(session);
  assert.throws(() => nextHandBetConfig(session, 10), {code: 'INSUFFICIENT_HAND_ASSETS'});
  const config = nextHandBetConfig(session, 5);
  assert.equal(config.minBuyIn, 100);
  assert.equal(session.config, original);
  assert.deepEqual(snapshot(session), before);
  session.config = config;
  assert.deepEqual(startHand(session).stacksBefore, {player: 100, npc: 100});
});

test('accepted stakes affect only the next hand, retaining RNG, boss rotation and the fresh blind draw', () => {
  const changed = settledSession(), reference = settledSession();
  const priorHand = changed.activeHand, priorConfig = priorHand.config;
  syncOpponentBankroll(changed);
  syncOpponentBankroll(reference);
  const prior = JSON.stringify({config: priorHand.config, result: priorHand.result, history: priorHand.history,
    stacks: priorHand.stacks, holes: priorHand.holes, board: priorHand.board});
  const before = snapshot(changed), balance = {...changed.stacks};
  const config = nextHandBetConfig(changed, 20);
  assert.deepEqual(snapshot(changed), before);
  changed.config = config;
  const next = startHand(changed), control = startHand(reference);
  assert.equal(next.config, config);
  assert.equal(priorHand.config, priorConfig);
  assert.equal(JSON.stringify({config: priorHand.config, result: priorHand.result, history: priorHand.history,
    stacks: priorHand.stacks, holes: priorHand.holes, board: priorHand.board}), prior);
  assert.equal(next.handNumber, 2);
  assert.equal(next.smallBlind, control.smallBlind);
  assert.deepEqual(changed.blindDraw, reference.blindDraw);
  assert.equal(next.bossProfile.id, control.bossProfile.id);
  assert.notEqual(next.bossProfile.id, priorHand.bossProfile.id);
  assert.deepEqual(next.bossSelection, control.bossSelection);
  assert.deepEqual(next.holes, control.holes);
  assert.deepEqual(next.deck, control.deck);
  assert.equal(changed.rng.state(), reference.rng.state());
  assert.deepEqual(next.stacksBefore, balance);
  assert.equal(next.contributions[next.smallBlind], 10);
  assert.equal(next.contributions[next.bigBlind], 20);
  assert.equal(next.pot, 30);
  assert.equal(legalActions(next).find(action => action.type === 'raise').to, 40);
});

test('the next hand pays Jackpot using its new BET while the previous result keeps its old BET', () => {
  const session = createSession({outcome:{mode:'legacy-deck'}, deal: {player: {manual: ['2c', '3d']}, npc: {manual: ['4c', '5d']}}}, 73);
  const royal = ['As', 'Ks', 'Qs', 'Js', 'Ts'];
  function royalHand() {
    const hand = startHand(session);
    hand.deck = [...royal, ...hand.deck.filter(card => !royal.includes(card))];
    return passive(hand);
  }
  const priorHand = royalHand(), oldResult = JSON.stringify(priorHand.result), oldConfig = priorHand.config;
  assert.equal(priorHand.result.jackpot.award, 2000);
  session.config = nextHandBetConfig(session, 20);
  const next = royalHand();
  assert.deepEqual(next.result.jackpot, {tier: 'royal', multiplier: 200, baseBet: 20, award: 4000});
  assert.equal(JSON.stringify(priorHand.result), oldResult);
  assert.equal(priorHand.config, oldConfig);
  assert.equal(priorHand.config.bigBlind, 10);
  assert.equal(session.config.buyIn, 10000);
});
