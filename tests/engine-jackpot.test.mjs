import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession, startHand, legalActions, applyAction, normalizeConfig, evaluateBest, previewResponse, simulate} from '../src/engine.mjs';
import {classifyJackpot, quoteJackpot, getJackpotAward} from '../src/jackpot.mjs';

const near = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const ROYAL_BOARD = ['As', 'Ks', 'Qs', 'Js', 'Ts'];
const QUADS_BOARD = ['Qs', 'Qh', 'Qd', 'Qc', 'As'];

function fixture({board = ROYAL_BOARD, player = ['2c', '3d'], npc = ['4c', '5d'], config = {}} = {}) {
  const session = createSession({buyIn: 1000, ...config, deal: {player: {manual: player}, npc: {manual: npc}}}, 73);
  const hand = startHand(session);
  assert.equal(new Set([...player, ...npc, ...board]).size, 9);
  hand.deck = [...board, ...hand.deck.filter(card => !board.includes(card))];
  return hand;
}

function passive(hand, stopAtStreet = null) {
  let guard = 0;
  while (hand.status === 'playing' && (!stopAtStreet || hand.street !== stopAtStreet)) {
    assert.ok(++guard < 40);
    applyAction(hand, legalActions(hand).find(action => action.type === 'call' || action.type === 'check').type);
  }
  return hand;
}

function assertLedger(hand) {
  const r = hand.result, award = r.jackpot?.award ?? 0;
  near(r.player.stackAfter + r.npc.stackAfter + r.fee, r.player.stackBefore + r.npc.stackBefore + award);
  near(r.player.profit + r.npc.profit, award - r.fee);
  near(r.player.baseProfit + r.npc.baseProfit, -r.fee);
  for (const seat of ['player', 'npc']) {
    const p = r[seat];
    near(p.totalReturn, p.netReturn + p.jackpotAward);
    near(p.profit, p.totalReturn - p.matchedWager);
    near(p.stackAfter, p.stackBefore - p.totalContribution + p.refund + p.totalReturn);
  }
  near(r.net, r.player.netReturn + r.npc.netReturn);
  near(r.totalReturn, r.net + award);
}

test('JP defaults on, accepts an explicit off switch, and matches the verified BET multipliers', () => {
  assert.equal(normalizeConfig({}).jackpotEnabled, true);
  assert.equal(normalizeConfig({jackpotEnabled: false}).jackpotEnabled, false);
  assert.throws(() => normalizeConfig({jackpotEnabled: 'false'}), /布林/);
  for (const [bet, expected] of [[500, [100000, 25000, 10000]], [1000, [200000, 50000, 20000]]]) {
    assert.deepEqual(['royal', 'straightFlush', 'quads'].map(tier => quoteJackpot(tier, bet).award), expected);
  }
  assert.throws(() => quoteJackpot('pair', 10), /未知/);
  assert.throws(() => quoteJackpot('royal', 0), /正數/);
});

test('JP tiers are mutually exclusive and ordinary flushes, straights and full houses do not qualify', () => {
  assert.equal(classifyJackpot(evaluateBest(ROYAL_BOARD)), 'royal');
  assert.equal(classifyJackpot(evaluateBest(['5s', '6s', '7s', '8s', '9s'])), 'straightFlush');
  assert.equal(classifyJackpot(evaluateBest(QUADS_BOARD)), 'quads');
  for (const cards of [['Ah', 'Jh', '8h', '5h', '2h'], ['9s', '8h', '7d', '6c', '5s'], ['Ks', 'Kh', 'Kd', 'Qs', 'Qh']]) {
    assert.equal(classifyJackpot(evaluateBest(cards)), null);
  }
});

test('all three JP tiers award board-only best-five hands without requiring a pot win', () => {
  for (const [tier, board, award] of [
    ['royal', ROYAL_BOARD, 2000],
    ['straightFlush', ['5s', '6s', '7s', '8s', '9s'], 500],
    ['quads', QUADS_BOARD, 200]
  ]) {
    const hand = passive(fixture({board})), r = hand.result;
    assert.equal(r.winner, 'tie');
    assert.ok(r.evaluations.player.best5.every(card => board.includes(card)));
    assert.equal(r.jackpot.tier, tier); assert.equal(r.jackpot.award, award);
    assert.equal(r.jackpot.baseBet, 10); assert.equal(r.player.jackpotAward, award);
    assert.equal(r.player.netReturn, 9.6); assert.equal(r.player.gross, 10); assert.equal(r.player.fee, .4);
    assert.equal(r.npc.jackpotAward, 0); assert.equal(r.npc.totalReturn, 9.6);
    assert.equal(hand.session.jackpotAwards, award);
    assert.equal(Object.values(hand.session.jackpotTierCounts).reduce((a, b) => a + b, 0), 1);
    assert.equal(hand.session.jackpotTierCounts[tier], 1);
    assertLedger(hand);
  }
});

test('a royal using one hole card receives only the royal tier and uses bigBlind as base BET', () => {
  const hand = passive(fixture({player: ['As', '2d'], npc: ['8d', '9h'], board: ['Ks', 'Qs', 'Js', 'Ts', '3c'],
    config: {bigBlind: 25, smallBlind: 5, betSize: {preflop: 100, flop: 200, turn: 400, river: 400}}}));
  assert.equal(hand.result.evaluations.player.best5.filter(card => hand.holes.player.includes(card)).length, 1);
  assert.deepEqual(hand.result.jackpot, {tier: 'royal', multiplier: 200, baseBet: 25, award: 5000});
  assert.equal(hand.session.jackpotTierCounts.royal, 1); assert.equal(hand.session.jackpotTierCounts.straightFlush, 0);
  assertLedger(hand);
});

test('losing quads still pay the player JP while the NPC receives only its pot award', () => {
  const hand = passive(fixture({player: ['7d', '7c'], npc: ['8d', '8c'], board: ['7s', '7h', '8s', '8h', '2c']}));
  const r = hand.result;
  assert.equal(r.winner, 'npc'); assert.equal(r.evaluations.player.category, 7);
  assert.equal(r.player.netReturn, 0); assert.equal(r.player.baseProfit, -10);
  assert.equal(r.player.jackpotAward, 200); assert.equal(r.player.profit, 190); assert.equal(r.player.stackAfter, 1190);
  assert.equal(r.npc.jackpotAward, 0); assert.equal(r.npc.stackAfter, 1009.2);
  assertLedger(hand);
});

test('folding on a qualifying river awards no JP and still refunds the uncalled amount', () => {
  const hand = passive(fixture(), 'river');
  assert.equal(evaluateBest([...hand.holes.player, ...hand.board]).royal, true);
  applyAction(hand, 'bet'); applyAction(hand, 'fold');
  assert.equal(hand.result.reason, 'fold'); assert.equal(hand.result.jackpot, null);
  assert.equal(hand.result.npc.refund, 40); assert.equal(hand.result.player.jackpotAward, 0);
  assert.equal(hand.session.jackpotAwards, 0); assert.deepEqual(hand.session.jackpotTierCounts, {royal: 0, straightFlush: 0, quads: 0});
  assert.equal(getJackpotAward({reason: 'fold', evaluation: evaluateBest(ROYAL_BOARD), baseBet: 10}), null);
  assertLedger(hand);
});

test('JP disabled leaves the original pot-only settlement intact even with a royal', () => {
  const hand = passive(fixture({config: {jackpotEnabled: false}}));
  assert.equal(hand.result.jackpot, null); assert.equal(hand.result.player.jackpotAward, 0);
  assert.equal(hand.result.player.totalReturn, 9.6); assert.equal(hand.result.player.baseProfit, -.4);
  assert.equal(hand.result.player.profit, -.4); assert.equal(hand.session.jackpotAwards, 0);
  assertLedger(hand);
});

test('a settlement preview can compute JP only on its clone; actual settlement credits exactly once', () => {
  const hand = passive(fixture(), 'river');
  applyAction(hand, 'check');
  assert.equal(hand.actor, 'player');
  const snapshot = JSON.stringify(hand), rng = hand.rng.state();
  const preview = previewResponse(hand, 'check');
  assert.equal(preview.status, 'settled'); assert.equal(JSON.stringify(hand), snapshot);
  assert.equal(hand.rng.state(), rng); assert.equal(hand.session.jackpotAwards, 0);
  assert.equal(hand.session.jackpotTierCounts.royal, 0);
  applyAction(hand, 'check');
  const paid = JSON.stringify(hand), balance = hand.stacks.player;
  assert.equal(hand.session.jackpotAwards, 2000); assert.equal(hand.session.jackpotTierCounts.royal, 1);
  assert.throws(() => applyAction(hand, 'check'), /不能/);
  previewResponse(hand, 'check'); quoteJackpot('royal', 10);
  assert.equal(hand.stacks.player, balance); assert.equal(JSON.stringify(hand), paid);
  assertLedger(hand);
});

test('JP credit consumes no RNG, and subsequent hands carry the bonus and cumulative ledger', () => {
  const enabled = passive(fixture()), disabled = passive(fixture({config: {jackpotEnabled: false}}));
  assert.equal(enabled.rng.state(), disabled.rng.state());
  assert.deepEqual(enabled.board, disabled.board); assert.deepEqual(enabled.deck, disabled.deck);
  near(enabled.stacks.player - disabled.stacks.player, 2000);
  const before = {...enabled.stacks}, session = enabled.session, next = startHand(session);
  assert.deepEqual(next.stacksBefore, before); assert.equal(next.smallBlind, 'npc');
  applyAction(next, 'fold');
  assert.equal(session.jackpotAwards, 2000); assert.equal(session.jackpotTierCounts.royal, 1);
  near(session.stacks.player + session.stacks.npc + session.fees, 2000 + session.jackpotAwards);
});

test('simulation reports base and total returns separately with correct JP counts, batches and uncertainty', () => {
  const config = {deal: {player: {manual: ['As', 'Ah']}, npc: {manual: ['2c', '3d']}},
    npc: {fold: 0, call: 1, raise: 0, check: 1, bet: 0, strengthInfluence: 0, priceInfluence: 0}};
  const options = {hands: 5000, seed: 19, policy: 'call'};
  const report = simulate(config, options), base = simulate({...config, jackpotEnabled: false}, options);
  assert.ok(report.tierCounts.quads > 0); assert.ok(report.jackpotAwards > 0);
  assert.equal(report.config.jackpotEnabled, true); assert.equal(base.jackpotAwards, 0);
  near(report.jackpotAwards, 10 * (200 * report.tierCounts.royal + 50 * report.tierCounts.straightFlush + 20 * report.tierCounts.quads));
  near(report.totalReturns, report.netReturns + report.jackpotAwards);
  near(report.baseRtp, report.netReturns / report.wagers); near(report.totalRtp, report.totalReturns / report.wagers);
  assert.equal(report.rtp, report.totalRtp); assert.equal(report.baseRtp, base.totalRtp);
  assert.equal(report.netReturns, base.netReturns); assert.equal(report.wagers, base.wagers);
  assert.deepEqual(report.baseCi95, base.ci95); assert.equal(report.baseStandardError, base.standardError);
  near(report.totalRtp - report.baseRtp, report.jackpotAwards / report.wagers);
  assert.equal(report.jackpotHits, Object.values(report.tierCounts).reduce((a, b) => a + b, 0));
  near(report.jackpotHitRate, report.jackpotHits / report.hands);
  near(report.jackpotShowdownHitRate, report.jackpotHits / report.showdowns);
  near(report.ci95[0], report.totalRtp - 1.96 * report.standardError);
  near(report.ci95[1], report.totalRtp + 1.96 * report.standardError);
  for (const field of ['netReturns', 'totalReturns', 'jackpotAwards', 'wagers']) {
    near(report.batches.reduce((sum, batch) => sum + batch[field], 0), report[field]);
  }
  for (const tier of ['royal', 'straightFlush', 'quads']) {
    assert.equal(report.batches.reduce((sum, batch) => sum + batch.tierCounts[tier], 0), report.tierCounts[tier]);
  }
  assert.ok(report.batches.every(batch => Math.abs(batch.totalRtp - batch.totalReturns / batch.wagers) < 1e-10));
  near(report.conservationError, 0, .000003);
});
