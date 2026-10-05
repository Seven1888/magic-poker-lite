import test from 'node:test';
import assert from 'node:assert/strict';
import {handEntryStatus, assertHandEntryAssets, minimumAssetsForBet} from '../src/hand-entry.mjs';
import {minimumAssets} from '../src/entry-model.mjs';
import {createSession, startHand, applyAction, legalActions} from '../src/engine.mjs';

function snapshot(session) {
  return {session: JSON.stringify(session), hand: JSON.stringify(session.activeHand), rng: session.rng.state()};
}

test('displayed and enforced BET minimums share six-decimal scaling and rounded BET input', () => {
  const precise = Object.freeze({minBuyIn: 10.000001, bigBlind: 10});
  for (const bet of [5, 10, 0.0333333, 5.0000004]) {
    assert.equal(minimumAssets(precise, bet), minimumAssetsForBet(precise, bet));
  }
  assert.equal(minimumAssetsForBet(precise, 5), 5);
  assert.equal(minimumAssetsForBet(precise, 10), 10.000001);
  assert.equal(minimumAssetsForBet({minBuyIn: 200, bigBlind: 10}, 0.0333333), 0.66666);
  assert.equal(minimumAssetsForBet({minBuyIn: 200, bigBlind: 10}, 5.0000004), 100);
  assert.equal(minimumAssetsForBet({minBuyIn: 200, bigBlind: 10}, 5.0000006), 100.00002);
});

test('both seats must meet the exact configured hand minimum without a rounding allowance', () => {
  const session = {config: {minBuyIn: 50}, stacks: {player: 50, npc: 50}};
  const accepted = {canStart: true, minimumAssets: 50, insufficientSeats: []};
  assert.deepEqual(handEntryStatus(session), accepted);
  assert.deepEqual(assertHandEntryAssets(session), accepted);
  for (const seat of ['player', 'npc']) {
    session.stacks = {player: 50, npc: 50, [seat]: 49.999999};
    assert.deepEqual(handEntryStatus(session), {canStart: false, minimumAssets: 50, insufficientSeats: [seat]});
    assert.throws(() => assertHandEntryAssets(session), error => error instanceof RangeError
      && error.code === 'INSUFFICIENT_HAND_ASSETS' && error.minimumAssets === 50
      && error.insufficientSeats.length === 1 && error.insufficientSeats[0] === seat);
  }
});

test('the hand gate rejects invalid balances and reads a quoted minimum without mutation', () => {
  const session = {config: {minBuyIn: 50}, stacks: {player: 10, npc: 10}};
  Object.freeze(session.config);
  Object.freeze(session.stacks);
  Object.freeze(session);
  assert.equal(handEntryStatus(session).canStart, false);
  assert.deepEqual(handEntryStatus(session, {minBuyIn: 10}), {canStart: true, minimumAssets: 10, insufficientSeats: []});
  assert.equal(session.config.minBuyIn, 50);
  for (const seat of ['player', 'npc']) {
    for (const balance of [NaN, Infinity, -Infinity, -1, '50', null, undefined]) {
      const invalid = {config: session.config, stacks: {player: 50, npc: 50, [seat]: balance}};
      assert.deepEqual(handEntryStatus(invalid).insufficientSeats, [seat]);
    }
  }
  assert.equal(handEntryStatus(null).canStart, false);
  for (const minimum of [NaN, Infinity, -1, 0, '5', null, undefined]) {
    assert.equal(handEntryStatus(session, {minBuyIn: minimum}).canStart, false);
  }
});

test('first and subsequent hands reject insufficient assets before RNG, blinds or any session mutation', () => {
  for (const previousHand of [false, true]) {
    for (const seat of ['player', 'npc']) {
      const session = createSession({minBuyIn: 50}, 9182, {firstSmallBlind: 'random'});
      if (previousHand) applyAction(startHand(session), 'fold');
      session.stacks = {player: 50, npc: 50, [seat]: 49.999999};
      const before = snapshot(session), hand = session.activeHand, stacks = session.stacks;
      const config = session.config, blindDraw = session.blindDraw;
      assert.throws(() => startHand(session), {code: 'INSUFFICIENT_HAND_ASSETS'});
      assert.deepEqual(snapshot(session), before);
      assert.equal(session.activeHand, hand);
      assert.equal(session.stacks, stacks);
      assert.equal(session.config, config);
      assert.equal(session.blindDraw, blindDraw);
    }
  }
});

test('engine entry rejects nonfinite seat balances without advancing RNG', () => {
  for (const seat of ['player', 'npc']) {
    for (const balance of [NaN, Infinity, -Infinity, '50', null, undefined]) {
      const session = createSession({minBuyIn: 50}, 38, {firstSmallBlind: 'random'});
      session.stacks[seat] = balance;
      const before = snapshot(session);
      assert.throws(() => startHand(session), {code: 'INSUFFICIENT_HAND_ASSETS'});
      assert.deepEqual(snapshot(session), before);
      assert.equal(session.stacks[seat], balance);
    }
  }
});

test('a hand starting at the minimum may fall below it and complete a matched all-in', () => {
  const session = createSession({minBuyIn: 50, buyIn: 50, jackpotEnabled: false}, 731);
  const hand = startHand(session);
  assert.deepEqual(hand.stacksBefore, {player: 50, npc: 50});
  assert.equal(handEntryStatus(session).canStart, false, 'posting blinds already lowers both balances below the gate');
  assert.equal(hand.status, 'playing');
  let steps = 0;
  while (hand.status === 'playing') {
    assert.ok(++steps < 20);
    const legal = legalActions(hand);
    const action = legal.find(item => ['raise', 'bet'].includes(item.type))
      ?? legal.find(item => ['call', 'check'].includes(item.type));
    applyAction(hand, action.type);
  }
  assert.equal(hand.board.length, 5);
  assert.deepEqual(hand.contributions, {player: 50, npc: 50});
  assert.equal(hand.result.pot, 100);
  assert.equal(hand.result.player.stackAfter + hand.result.npc.stackAfter + hand.result.fee, 100);
});
