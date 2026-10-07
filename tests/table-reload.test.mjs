import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession, startHand, legalActions, applyAction, stepNpc, endHandForTableExit} from '../src/engine.mjs';
import {buyInFromWallet, snapshotTableSession, restoreTableSession, closeSavedTable} from '../src/table-wallet.mjs';

const modes = ['pooled-holdem', 'fixed-holdem'];
const create = (mode = 'pooled-holdem', seed = 0, options = {}, extra = {}) => createSession({
  smallBlind: 10, ...extra, outcome: {mode, ...extra.outcome}, boss: {mode: 'fixed', profileId: 'maniac'}
}, seed, {firstSmallBlind: 'player', ...options});
const choose = (hand, type, size) => {
  const action = legalActions(hand).find(item => item.type === type && (!size || item.sizeKeys?.includes(size)));
  assert.ok(action, `missing ${type}:${size}`);
  return action;
};
const savedProfile = session => ({version: 2,
  balance: buyInFromWallet(10000, session.config.smallBlind).balance,
  outcomePools: structuredClone(session.outcomePools),
  lastBossProfileId: 'caller', table: snapshotTableSession(session)});
const passive = hand => {
  let steps = 0;
  while (hand.status === 'playing') {
    assert.ok(++steps < 40);
    applyAction(hand, legalActions(hand).find(action => ['check', 'call'].includes(action.type)));
  }
};

test('profiles without a table remain unchanged, including legacy version 1 balances and pools', () => {
  const session = create();
  for (const profile of [
    {version: 1, balance: 321.25, outcomePools: structuredClone(session.outcomePools)},
    {version: 2, balance: 321.25, outcomePools: structuredClone(session.outcomePools), table: null, lastBossProfileId: 'caller'}
  ]) {
    const before = structuredClone(profile);
    assert.equal(closeSavedTable(profile), profile);
    assert.deepEqual(profile, before);
  }
});

test('reload before the first deal returns the full buy-in once and preserves existing pools and opponent', () => {
  for (const mode of modes) {
    const session = create(mode, 0, {}, {outcome: {initialPaidActionPools: [3, 4, 5], initialSpecialPools: [6, 7, 8]}});
    const profile = savedProfile(session), before = structuredClone(profile);
    const closed = closeSavedTable(profile);
    assert.equal(closed.version, 2);
    assert.equal(closed.balance, 10000);
    assert.equal(closed.table, null);
    assert.equal(closed.lastBossProfileId, 'caller');
    assert.deepEqual(closed.outcomePools, session.outcomePools);
    assert.equal(closeSavedTable(closed), closed);
    assert.deepEqual(profile, before);
    assert.equal(session.activeHand, undefined);
  }
});

test('a player-turn exit settles the existing blind loss without another result draw or card change', () => {
  for (const mode of modes) {
    const session = create(mode, 0, {}, {outcome: {conversionRate: 0, initialPaidActionPools: [0, 1000, 0]}});
    const hand = startHand(session), rng = hand.rng.state(), cards = structuredClone(hand.holes);
    const board = [...hand.board], deck = [...hand.deck], decision = structuredClone(hand.outcomeDecision);
    endHandForTableExit(hand);
    assert.equal(hand.status, 'settled');
    assert.equal(hand.result.reason, 'fold');
    assert.equal(hand.result.folded, 'player');
    assert.equal(hand.result.winner, 'npc');
    assert.equal(hand.result.player.matchedWager, 10);
    assert.equal(hand.result.player.totalContribution, 10);
    assert.equal(hand.result.player.stackAfter, 990);
    assert.equal(hand.result.npc.refund, 10);
    assert.equal(hand.rng.state(), rng);
    assert.deepEqual(hand.holes, cards);
    assert.deepEqual(hand.board, board);
    assert.deepEqual(hand.deck, deck);
    assert.deepEqual(hand.outcomeDecision, decision);
    assert.equal(session.activeHand, hand);
    assert.equal(session.stacks, hand.stacks);
  }
});

test('leaving during an NPC turn folds the player and refunds the unmatched big blind', () => {
  for (const mode of modes) {
    const session = create(mode, 15, {firstSmallBlind: 'npc'}), hand = startHand(session);
    assert.equal(hand.actor, 'npc');
    const profile = savedProfile(session), before = structuredClone(profile);
    endHandForTableExit(hand);
    assert.equal(hand.result.folded, 'player');
    assert.equal(hand.result.player.totalContribution, 20);
    assert.equal(hand.result.player.matchedWager, 10);
    assert.equal(hand.result.player.refund, 10);
    assert.equal(hand.result.player.stackAfter, 990);
    const closed = closeSavedTable(profile);
    assert.equal(closed.balance, 9990);
    assert.equal(closed.table, null);
    assert.equal(closed.lastBossProfileId, 'maniac');
    assert.deepEqual(closed.outcomePools, session.outcomePools);
    assert.deepEqual(profile, before);
  }
});

test('a free CHECK opportunity still exits as a player fold without placing another wager', () => {
  for (const mode of modes) {
    const session = create(mode, 0, {firstSmallBlind: 'npc'}), hand = startHand(session);
    applyAction(hand, 'call');
    assert.equal(hand.actor, 'player');
    assert.ok(legalActions(hand).some(action => action.type === 'check'));
    assert.ok(!legalActions(hand).some(action => action.type === 'fold'));
    const contributions = {...hand.contributions}, rng = hand.rng.state();
    const closed = closeSavedTable(savedProfile(session));
    endHandForTableExit(hand);
    assert.equal(hand.result.folded, 'player');
    assert.equal(hand.result.player.matchedWager, 20);
    assert.deepEqual(hand.contributions, contributions);
    assert.equal(hand.stacks.player, 980);
    assert.equal(hand.rng.state(), rng);
    assert.equal(closed.balance, 9980);
    assert.deepEqual(closed.outcomePools, session.outcomePools);
  }
});

test('reload refunds an unmatched raise and credits only its matched paid interval to pools', () => {
  const session = create(), hand = startHand(session);
  assert.equal(hand.outcomeDecision.target, 'win');
  applyAction(hand, choose(hand, 'raise', 'half'));
  assert.equal(hand.actor, 'npc');
  assert.deepEqual(hand.contributions, {player: 40, npc: 20});
  const profile = savedProfile(session), before = structuredClone(profile), rng = hand.rng.state();
  const closed = closeSavedTable(profile);
  endHandForTableExit(hand);
  const audit = hand.result.outcomePoolAudit;
  assert.equal(hand.result.folded, 'player');
  assert.equal(hand.result.player.refund, 20);
  assert.equal(hand.result.player.matchedWager, 20);
  assert.equal(hand.stacks.player, 980);
  assert.equal(audit.credits[0].matchedPaidAmount, 10);
  assert.equal(audit.credits[0].refundablePaidAmount, 20);
  assert.equal(audit.paidActionAdded, 7.92);
  assert.equal(audit.specialAdded, 1.98);
  assert.equal(audit.specialAward, 0);
  assert.equal(hand.rng.state(), rng);
  assert.equal(closed.balance, 9980);
  assert.deepEqual(closed.outcomePools, session.outcomePools);
  assert.equal(closed.outcomePools.handSequence, 1);
  assert.equal(closeSavedTable(closed), closed);
  assert.deepEqual(profile, before);
});

test('a reserved jackpot survives an unfinished-table exit without being awarded', () => {
  const session = create('pooled-holdem', 0, {}, {smallBlind: 5,
    outcome: {initialSpecialPools: [2000, 3, 4], specialUseChance: 1}});
  const hand = startHand(session);
  assert.equal(hand.outcomeDecision.qualification.tier, 'royal');
  const closed = closeSavedTable(savedProfile(session));
  assert.equal(closed.balance, 9995);
  assert.deepEqual(closed.outcomePools.buckets, [{paidAction: 0, special: 2000}, {paidAction: 0, special: 3}, {paidAction: 0, special: 4}]);
  assert.equal(closed.outcomePools.lastSettlement.audit.specialAward, 0);
  assert.equal(closed.outcomePools.lastSettlement.audit.qualification.status, 'deferred');
});

test('a settled winning jackpot is returned exactly once with no repeated settlement', () => {
  const session = create('pooled-holdem', 0, {}, {smallBlind: 5,
    outcome: {initialSpecialPools: [2000, 3, 4], specialUseChance: 1}});
  const hand = startHand(session);
  passive(hand);
  assert.equal(hand.result.player.jackpotAward, 2000);
  assert.equal(hand.stacks.player, 2510);
  const profile = savedProfile(session), before = structuredClone(profile), state = snapshotTableSession(session);
  assert.equal(endHandForTableExit(hand), hand);
  assert.deepEqual(snapshotTableSession(session), state);
  const closed = closeSavedTable(profile);
  assert.equal(closed.balance, 12010);
  assert.equal(closed.table, null);
  assert.deepEqual(closed.outcomePools, session.outcomePools);
  assert.equal(closed.outcomePools.handSequence, 1);
  assert.equal(closed.outcomePools.buckets[0].special, .99);
  assert.equal(closeSavedTable(closed), closed);
  assert.equal(closeSavedTable(closed).balance, 12010);
  assert.deepEqual(profile, before);
});

test('an all-in player awaiting NPC action keeps the normal seeded NPC decision and payout on reload', () => {
  for (const mode of modes) {
    const reasons = new Set();
    for (let seed = 0; seed < 30; seed++) {
      const session = create(mode, seed), hand = startHand(session);
      applyAction(hand, choose(hand, 'raise', 'allin'));
      assert.equal(hand.stacks.player, 0);
      assert.equal(hand.actor, 'npc');
      const profile = savedProfile(session), before = structuredClone(profile);
      const reference = restoreTableSession(profile.table);
      stepNpc(reference.activeHand);
      assert.equal(reference.activeHand.status, 'settled');
      reasons.add(reference.activeHand.result.reason);
      const closed = closeSavedTable(profile);
      endHandForTableExit(hand);
      assert.deepEqual(snapshotTableSession(session), snapshotTableSession(reference));
      assert.equal(closed.balance, profile.balance + reference.stacks.player);
      assert.deepEqual(closed.outcomePools, reference.outcomePools);
      assert.equal(closed.table, null);
      assert.deepEqual(profile, before);
    }
    assert.deepEqual([...reasons].sort(), ['fold', 'showdown']);
  }
});

test('failed exit settlement cannot commit a partial refund, history, pool balance or RNG state', () => {
  const session = create(), hand = startHand(session);
  applyAction(hand, choose(hand, 'raise', 'half'));
  hand.outcomeDecision.poolBranch.handId = 'invalid-transaction';
  const before = snapshotTableSession(session), stacks = session.stacks, pools = session.outcomePools, rng = session.rng;
  assert.throws(() => endHandForTableExit(hand), /序號/);
  assert.deepEqual(snapshotTableSession(session), before);
  assert.equal(session.stacks, stacks);
  assert.equal(session.outcomePools, pools);
  assert.equal(session.rng, rng);
  const profile = savedProfile(session), stored = structuredClone(profile);
  assert.throws(() => closeSavedTable(profile), /序號/);
  assert.deepEqual(profile, stored);
});
