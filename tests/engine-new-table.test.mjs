import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession, createRng, beginNewTable, startHand, applyAction} from '../src/engine.mjs';
import {snapshotTableSession, restoreTableSession} from '../src/table-wallet.mjs';

const config = mode => ({smallBlind: 5, outcome: {mode, conversionRate: 0}, boss: {mode: 'rotate'}});
const close = session => { const hand = startHand(session); applyAction(hand, 'fold'); return hand; };
const state = session => ({session: JSON.stringify(session), hand: JSON.stringify(session.activeHand), rng: session.rng.state()});

for (const mode of ['fixed-holdem', 'pooled-holdem']) {
  test(`${mode}: re-entry consumes one new blind draw and preserves the player's cumulative accounts`, () => {
    const session = createSession(config(mode), 19, {firstSmallBlind: 'random'});
    const firstDraw = createRng(19); firstDraw();
    assert.equal(session.rng.state(), firstDraw.state(), 'the first table reserves exactly one opening blind draw');
    const closed = close(session), oldStacks = {...closed.stacks}, oldRng = closed.rng;
    session.stacks = {...session.stacks, player: 0};
    session.fees = 7; session.jackpotAwards = 11; session.jackpotTierCounts.quads = 1;
    const pools = session.outcomePools, poolsBefore = structuredClone(pools), priorBoss = session.lastBossProfileId;
    const counters = {handNumber: session.handNumber, fees: session.fees, jackpotAwards: session.jackpotAwards,
      jackpotTierCounts: {...session.jackpotTierCounts}, refreshes: structuredClone(session.opponentBankrollRefreshes)};
    const expectedRng = session.rng.clone(), expectedBlind = expectedRng() < .5 ? 'player' : 'npc';
    const event = beginNewTable(session);
    assert.equal(session.rng.state(), expectedRng.state());
    assert.deepEqual(event, {type: 'table-buy-in', tableNumber: 2, openingHandNumber: 2,
      buyIn: 500, firstSmallBlind: expectedBlind, probability: .5});
    assert.ok(Object.isFrozen(event)); assert.deepEqual(session.stacks, {player: 500, npc: 500});
    assert.equal(session.outcomePools, pools); assert.deepEqual(pools, poolsBefore);
    assert.equal(session.lastBossProfileId, priorBoss);
    assert.equal(session.handNumber, counters.handNumber); assert.equal(session.fees, counters.fees);
    assert.equal(session.jackpotAwards, counters.jackpotAwards); assert.deepEqual(session.jackpotTierCounts, counters.jackpotTierCounts);
    assert.deepEqual(session.opponentBankrollRefreshes, counters.refreshes);
    assert.deepEqual(closed.stacks, oldStacks); assert.equal(closed.rng, oldRng);
    const opening = startHand(session);
    assert.equal(opening.smallBlind, expectedBlind, 'new table opens on the reserved seat even at even global hand numbers');
    assert.notEqual(opening.bossProfile.id, priorBoss);
    applyAction(opening, 'fold');
    const following = startHand(session);
    assert.notEqual(following.smallBlind, expectedBlind, 'alternation uses the new table origin');
    assert.equal(following.handNumber, 3);
  });

  test(`${mode}: reload preserves the new table origin and future blind alternation`, () => {
    const session = createSession(config(mode), 31, {firstSmallBlind: 'random'});
    close(session); close(session);
    const entry = beginNewTable(session, {buyIn: 1000});
    const hand = startHand(session);
    assert.equal(hand.smallBlind, entry.firstSmallBlind);
    assert.deepEqual(hand.stacksBefore, {player: 1000, npc: 1000});
    const restored = restoreTableSession(JSON.parse(JSON.stringify(snapshotTableSession(session))));
    assert.equal(restored.tableNumber, 2); assert.equal(restored.tableStartHandNumber, 3);
    applyAction(hand, 'fold'); applyAction(restored.activeHand, 'fold');
    const next = startHand(session), replay = startHand(restored);
    assert.equal(replay.smallBlind, next.smallBlind); assert.notEqual(replay.smallBlind, entry.firstSmallBlind);
    assert.deepEqual(replay.holes, next.holes); assert.equal(restored.rng.state(), session.rng.state());
    assert.deepEqual(restored.outcomePools, session.outcomePools);
  });

  test(`${mode}: invalid, premature and duplicate table entries leave all state unchanged`, () => {
    const session = createSession(config(mode), 91, {firstSmallBlind: 'random'});
    const initial = state(session);
    assert.throws(() => beginNewTable(session), /completed previous table/); assert.deepEqual(state(session), initial);
    const hand = startHand(session), playing = state(session);
    assert.throws(() => beginNewTable(session), /completed previous table/); assert.deepEqual(state(session), playing);
    applyAction(hand, 'fold');
    for (const buyIn of [0, -1, NaN, Infinity, '500', 1e20, 0.00000001]) {
      const before = state(session), rng = session.rng, money = session.stacks;
      assert.throws(() => beginNewTable(session, {buyIn}), /positive finite chip amount/);
      assert.deepEqual(state(session), before); assert.equal(session.rng, rng); assert.equal(session.stacks, money);
    }
    beginNewTable(session);
    const entered = state(session);
    assert.throws(() => beginNewTable(session), /completed previous table/); assert.deepEqual(state(session), entered);
  });
}

test('historical sessions do not acquire the new table lifecycle', () => {
  for (const mode of ['prebuilt-pools', 'legacy-deck']) {
    const session = createSession({outcome: {mode}}, 12), before = state(session);
    assert.equal(session.tableNumber, undefined); assert.equal(session.tableStartHandNumber, undefined);
    assert.throws(() => beginNewTable(session), /Holdem session/); assert.deepEqual(state(session), before);
  }
});
