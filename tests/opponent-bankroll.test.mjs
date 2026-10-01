import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession, startHand, legalActions, applyAction, syncOpponentBankroll, previewResponse, playAutomatedHand} from '../src/engine.mjs';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);
function fixture({player = ['As', 'Ah'], npc = ['Ks', 'Kh'], board = ['2s', '3h', '7d', '9c', 'Jd'], config = {}} = {}) {
  const session = createSession({...config, deal: {player: {manual: player}, npc: {manual: npc}}}, 73);
  const hand = startHand(session);
  assert.equal(new Set([...player, ...npc, ...board]).size, 9);
  hand.deck = [...board, ...hand.deck.filter(card => !board.includes(card))];
  return hand;
}
function passive(hand) {
  while (hand.status === 'playing') applyAction(hand, legalActions(hand).find(action => ['call', 'check'].includes(action.type)).type);
  return hand;
}
function assertRefresh(hand) {
  const session = hand.session, closingStacks = {...hand.stacks}, oldStacks = hand.stacks;
  const snapshot = JSON.stringify({result: hand.result, history: hand.history, board: hand.board, holes: hand.holes});
  const player = session.stacks.player, rng = session.rng.state(), fees = session.fees, jp = session.jackpotAwards;
  const event = syncOpponentBankroll(session);
  assert.deepEqual(event, {type: 'demo-opponent-bankroll-refresh', handNumber: hand.handNumber,
    before: closingStacks.npc, after: player, adjustment: Math.round((player - closingStacks.npc) * 1e6) / 1e6});
  assert.ok(Object.isFrozen(event));
  assert.deepEqual(session.stacks, {player, npc: player});
  assert.equal(hand.stacks, oldStacks); assert.notEqual(session.stacks, oldStacks);
  assert.deepEqual(hand.stacks, closingStacks);
  assert.equal(JSON.stringify({result: hand.result, history: hand.history, board: hand.board, holes: hand.holes}), snapshot);
  assert.equal(session.rng.state(), rng); assert.equal(session.fees, fees); assert.equal(session.jackpotAwards, jp);
  const syncedStacks = session.stacks, records = session.opponentBankrollRefreshes.length;
  assert.equal(syncOpponentBankroll(session), event);
  assert.equal(session.stacks, syncedStacks); assert.equal(session.opponentBankrollRefreshes.length, records);
  near(hand.result.player.stackAfter + hand.result.npc.stackAfter + hand.result.fee,
    hand.stacksBefore.player + hand.stacksBefore.npc + hand.result.player.jackpotAward);
  near(session.stacks.player + session.stacks.npc + session.fees,
    session.config.buyIn * 2 + session.jackpotAwards + session.opponentBankrollRefreshes.reduce((sum, item) => sum + item.adjustment, 0));
  return event;
}

test('showdown wins, losses and ties refresh only opponent demo chips, preserving settlement and RNG', () => {
  const scenarios = [
    {winner: 'player', expectedAdjustment: 19.2},
    {winner: 'npc', expectedAdjustment: -19.2, player: ['Ks', 'Kh'], npc: ['As', 'Ah']},
    {winner: 'tie', expectedAdjustment: 0, player: ['2c', '3d'], npc: ['4c', '5d'], board: ['As', 'Kh', 'Qd', 'Jc', 'Ts']}
  ];
  for (const scenario of scenarios) {
    const hand = passive(fixture(scenario));
    assert.equal(hand.result.winner, scenario.winner);
    near(assertRefresh(hand).adjustment, scenario.expectedAdjustment);
  }
});

test('both player and opponent folds refresh, including a zero-cost opening fold', () => {
  for (const folded of ['player', 'npc', 'opening']) {
    const hand = fixture();
    if (folded === 'npc') {applyAction(hand, 'raise'); applyAction(hand, 'fold');}
    else if (folded === 'player') {applyAction(hand, 'call'); applyAction(hand, 'raise'); applyAction(hand, 'fold');}
    else applyAction(hand, 'fold');
    assert.equal(hand.result.reason, 'fold');
    assert.equal(hand.result.folded, folded === 'npc' ? 'npc' : 'player');
    near(assertRefresh(hand).adjustment, folded === 'npc' ? 19.2 : folded === 'player' ? -19.2 : 0);
  }
});

test('refresh matches the player balance after Jackpot, without relabelling it as opponent payout', () => {
  const hand = passive(fixture({player: ['2c', '3d'], npc: ['4c', '5d'], board: ['As', 'Ks', 'Qs', 'Js', 'Ts']}));
  assert.equal(hand.result.player.jackpotAward, 2000);
  const event = assertRefresh(hand);
  assert.equal(event.after, 2999.6); assert.equal(event.adjustment, 2000);
  assert.equal(hand.result.npc.jackpotAward, 0); assert.equal(hand.result.npc.totalReturn, 9.6);
});

test('zero player chips refresh opponent to zero and cannot silently start or fund another hand', () => {
  const hand = fixture({player: ['Ks', 'Kh'], npc: ['As', 'Ah'], config: {minBuyIn: 20, buyIn: 20}});
  applyAction(hand, 'raise'); applyAction(hand, 'call');
  assert.equal(hand.result.player.stackAfter, 0); assert.equal(hand.result.npc.stackAfter, 38.4);
  assert.equal(assertRefresh(hand).adjustment, -38.4);
  assert.throws(() => startHand(hand.session), /不足/);
  assert.deepEqual(hand.session.stacks, {player: 0, npc: 0});
});

test('only the current settled hand may refresh; the next hand uses refreshed stacks and alternates position', () => {
  const session = createSession({}, 102), rng = session.rng.state();
  assert.throws(() => syncOpponentBankroll(session), /current hand has settled/);
  assert.equal(session.rng.state(), rng);
  const first = startHand(session), before = JSON.stringify(first);
  assert.throws(() => syncOpponentBankroll(session), /current hand has settled/);
  assert.equal(JSON.stringify(first), before);
  applyAction(first, 'raise'); applyAction(first, 'fold');
  const firstEvent = assertRefresh(first), settledStacks = {...first.stacks};
  const next = startHand(session);
  assert.deepEqual(next.stacksBefore, {player: firstEvent.after, npc: firstEvent.after});
  assert.equal(next.smallBlind, 'npc'); assert.equal(next.bigBlind, 'player');
  near(next.stacks.player, firstEvent.after - 10); assert.equal(next.stacks.npc, firstEvent.after);
  assert.deepEqual(first.stacks, settledStacks, 'the old hand retains its final chip snapshot');
  assert.throws(() => syncOpponentBankroll(session), /current hand has settled/);
  applyAction(next, 'raise'); applyAction(next, 'fold');
  const nextEvent = assertRefresh(next);
  assert.equal(nextEvent.handNumber, 2); assert.equal(session.opponentBankrollRefreshes.length, 2);
  assert.equal(session.opponentBankrollRefreshes[0], firstEvent);
});

test('previews and automated hands do not apply the optional between-hand demo refresh', () => {
  const hand = fixture(), session = hand.session, before = JSON.stringify(hand);
  previewResponse(hand, 'raise');
  assert.equal(JSON.stringify(hand), before); assert.deepEqual(session.opponentBankrollRefreshes, []);
  passive(hand);
  assert.notEqual(session.stacks.player, session.stacks.npc);
  assert.deepEqual(session.opponentBankrollRefreshes, []);
  const automated = playAutomatedHand(session);
  assert.equal(automated.status, 'settled');
  assert.deepEqual(session.opponentBankrollRefreshes, []);
});
