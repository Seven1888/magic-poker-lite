import test from 'node:test';
import assert from 'node:assert/strict';
import {getHudSnapshot} from '../src/hud-state.mjs';
import {createSession, startHand, applyAction, legalActions} from '../src/engine.mjs';
import {money} from '../src/shared.mjs';

function passiveAction(hand) {
  applyAction(hand, legalActions(hand).find(action => action.type === 'check' || action.type === 'call').type);
}

test('idle HUD shows no fictional account balance and separates the intended buy-in', () => {
  const hud = getHudSnapshot({config: {buyIn: 800}});
  assert.equal(hud.playerBalance, null); assert.equal(hud.npcBalance, null);
  assert.equal(hud.balanceLabel, '尚未入座'); assert.equal(hud.buyInLabel, '預備帶入');
  assert.equal(hud.buyIn, 800); assert.equal(hud.settledTableProfit, null);
  assert.equal(hud.deckRemaining, 52); assert.equal(hud.dealtCards, 0);
  assert.equal(hud.dealerSeat, null); assert.equal(hud.callAmount, 0);
  assert.deepEqual(hud.actions, []);
});

test('deck counter follows real draws 48 to 45 to 44 to 43 and keeps 52 cards accounted for', () => {
  const session = createSession({}, 20), hand = startHand(session);
  for (const [boardLength, remaining, name] of [[0, 48, '翻牌前'], [3, 45, '翻牌'], [4, 44, '轉牌'], [5, 43, '河牌']]) {
    while (hand.board.length < boardLength) passiveAction(hand);
    const hud = getHudSnapshot({session, hand});
    assert.equal(hud.deckRemaining, remaining); assert.equal(hud.dealtCards, 4 + boardLength);
    assert.equal(hud.deckRemaining + hud.dealtCards, 52); assert.equal(hud.streetName, name);
  }
  while (hand.status === 'playing') passiveAction(hand);
  assert.equal(getHudSnapshot({session, hand}).deckRemaining, 43);
});

test('live commitments reduce available funds without pretending that unsettled bets are losses', () => {
  const session = createSession({buyIn: 1000}, 102), hand = startHand(session);
  let hud = getHudSnapshot({session, hand});
  assert.equal(hud.playerBalance, 995); assert.equal(hud.npcBalance, 990);
  assert.equal(hud.playerCommitted, 5); assert.equal(hud.npcCommitted, 10);
  assert.equal(hud.playerStreetPaid, 5); assert.equal(hud.npcStreetPaid, 10);
  assert.equal(hud.settledTableProfit, 0); assert.equal(hud.npcSettledTableProfit, 0);
  assert.equal(hud.callAmount, 5); assert.equal(hud.maxStreetTotal, 1000);
  assert.equal(hud.dealerSeat, 'player'); assert.equal(hud.playerSeat, 'SB'); assert.equal(hud.npcSeat, 'BB');
  const raise = hud.actions.find(action => action.type === 'raise');
  assert.equal(raise.amount, 15); assert.equal(raise.to, 20);
  applyAction(hand, 'raise'); hud = getHudSnapshot({session, hand});
  assert.equal(hud.playerBalance, 980); assert.equal(hud.playerCommitted, 20);
  assert.equal(hud.settledTableProfit, 0); assert.deepEqual(hud.actions, []);
  assert.equal(hud.turnLabel, '面具客行動中');
});

test('fractional blind HUD and money labels agree with opening commitments, calls and the settled ledger', () => {
  const session = createSession({outcome:{mode:'legacy-deck'}, buyIn: 1000, bigBlind: .03, jackpotEnabled: false}, 42), hand = startHand(session);
  const opening = getHudSnapshot({session, hand});
  assert.equal(opening.playerSeat, 'SB'); assert.equal(opening.npcSeat, 'BB');
  assert.equal(opening.smallBlind, .015); assert.equal(opening.bigBlind, .03);
  assert.equal(opening.playerCommitted, .015); assert.equal(money(opening.playerCommitted), '0.015');
  assert.equal(opening.playerBalance, 999.985); assert.equal(money(opening.playerBalance), '999.985');
  assert.equal(opening.callAmount, .015); assert.equal(opening.turnLabel, '輪到你 · 跟注需 0.015');
  assert.equal(money(opening.actions.find(action => action.type === 'call').amount), '0.015');
  applyAction(hand, 'fold');
  const settled = getHudSnapshot({session, hand});
  assert.equal(money(settled.playerBalance), '999.985');
  assert.equal(money(settled.npcBalance), '1,000.015');
  assert.equal(money(hand.result.npc.refund), '0.015');
  assert.equal(money(hand.result.npc.netReturn), '0.03');
  assert.equal(money(hand.result.fee), '0');
  assert.equal(money(settled.settledTableProfit), '-0.015');
});

test('refund settlement and the following hand retain genuine cumulative table profit', () => {
  const session = createSession({buyIn: 1000}, 102), hand = startHand(session);
  applyAction(hand, 'raise'); applyAction(hand, 'fold');
  const hud = getHudSnapshot({session, hand});
  assert.equal(hand.result.player.refund, 10);
  assert.equal(hud.playerCommitted, 20); assert.equal(hud.npcCommitted, 10);
  assert.equal(hud.playerBalance, 1010); assert.equal(hud.npcBalance, 990);
  assert.equal(hud.settledTableProfit, 10); assert.equal(hud.npcSettledTableProfit, -10);
  assert.equal(hud.balanceLabel, '桌上可用'); assert.equal(hud.turnLabel, '本手已結算');
  assert.equal(hud.maxStreetTotal, 0); assert.deepEqual(hud.actions, []);
  const next = startHand(session), nextHud = getHudSnapshot({session, hand: next});
  assert.equal(nextHud.playerBalance, 1000); assert.equal(nextHud.npcBalance, 985);
  assert.equal(nextHud.settledTableProfit, 10); assert.equal(nextHud.npcSettledTableProfit, -10);
  assert.equal(nextHud.dealerSeat, 'npc'); assert.equal(nextHud.playerSeat, 'BB');
  assert.equal(nextHud.buyIn, 1000); assert.equal(nextHud.deckRemaining, 48);
});

test('closed-table snapshot preserves carried-out balances and its original buy-in', () => {
  const closedTable = {playerBalance: 1010, npcBalance: 990, buyIn: 1000, settledTableProfit: 10};
  const before = structuredClone(closedTable);
  const hud = getHudSnapshot({config: {buyIn: 2000}, closedTable});
  assert.equal(hud.balanceLabel, '上桌帶出'); assert.equal(hud.buyInLabel, '上桌帶入');
  assert.equal(hud.playerBalance, 1010); assert.equal(hud.npcBalance, 990);
  assert.equal(hud.buyIn, 1000); assert.equal(hud.settledTableProfit, 10);
  assert.equal(hud.npcSettledTableProfit, -10); assert.equal(hud.playerCommitted, 0);
  assert.equal(hud.deckRemaining, 52); assert.equal(hud.dealtCards, 0);
  assert.deepEqual(hud.actions, []); assert.deepEqual(closedTable, before);
});

test('active hand settings and live stacks take priority over pending config and old table snapshots', () => {
  const session = createSession({outcome:{mode:'legacy-deck'}, buyIn: 800, smallBlind: 3, bigBlind: 6, betSize: {preflop: 12, flop: 24}}, 33);
  const hand = startHand(session);
  const args = {session, hand, config: {buyIn: 2000, smallBlind: 50, bigBlind: 100}, closedTable: {playerBalance: 12, npcBalance: 13, buyIn: 100, settledTableProfit: -88}};
  let hud = getHudSnapshot(args);
  assert.equal(hud.buyIn, 800); assert.equal(hud.playerBalance, 797);
  assert.equal(hud.smallBlind, 3); assert.equal(hud.bigBlind, 6); assert.equal(hud.increment, 12);
  assert.equal(hud.settledTableProfit, 0); assert.equal(hud.balanceLabel, '桌上可用');
  while (hand.street === 'preflop') passiveAction(hand);
  hud = getHudSnapshot(args); assert.equal(hud.increment, 24); assert.equal(hud.playerStreetPaid, 0);
});

test('action list follows legal player actions and busy state without inventing all-in controls', () => {
  const session = createSession({minBuyIn: 20, maxBuyIn: 20, buyIn: 20}, 104), hand = startHand(session);
  let hud = getHudSnapshot({session, hand});
  assert.deepEqual(hud.actions, legalActions(hand));
  assert.equal(hud.actions.find(action => action.type === 'raise').allIn, true);
  assert.ok(hud.actions.every(action => action.type !== 'allin'));
  hud = getHudSnapshot({session, hand, busy: true});
  assert.deepEqual(hud.actions, []); assert.equal(hud.callAmount, 5); assert.equal(hud.turnLabel, '牌局處理中');
  applyAction(hand, 'raise'); hud = getHudSnapshot({session, hand});
  assert.deepEqual(hud.actions, []); assert.equal(hud.callAmount, 0);
  applyAction(hand, 'call'); hud = getHudSnapshot({session, hand});
  assert.equal(hud.deckRemaining, 43); assert.deepEqual(hud.actions, []);
});

test('HUD reads do not mutate the game or RNG and return no hidden state or mutable game references', () => {
  const session = createSession({}, 51), hand = startHand(session);
  const snapshot = JSON.stringify(hand), rngState = hand.rng.state();
  const first = getHudSnapshot({session, hand}), second = getHudSnapshot({session, hand});
  assert.deepEqual(first, second);
  first.actions[0].type = 'edited';
  assert.notEqual(getHudSnapshot({session, hand}).actions[0].type, 'edited');
  assert.equal(JSON.stringify(hand), snapshot); assert.equal(hand.rng.state(), rngState);
  const forbidden = new Set(['seed', 'holes', 'deck', 'dealAudit', 'rng', 'session', 'hand', 'config']);
  function inspect(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      assert.ok(!forbidden.has(key), `hidden or live state key ${key} must not be returned`);
      inspect(item);
    }
  }
  inspect(second);
});
