import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession, playAutomatedHand, syncOpponentBankroll} from '../src/engine.mjs';
import {simulateStudy, studyPlayerSeed} from '../src/simulation-study.mjs';

const near = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const passive = {
  boss: {mode: 'legacy'},
  bigBlind: 1, buyIn: 10, minBuyIn: 10, jackpotEnabled: false,
  npc: {fold: 0, call: 1, raise: 0, check: 1, bet: 0, strengthInfluence: 0, priceInfluence: 0},
  betSize: {preflop: 1, flop: 1, turn: 1, river: 1}
};
function referenceError(rows, key) {
  const wager = rows.reduce((sum, row) => sum + row.wagers, 0);
  const estimate = rows.reduce((sum, row) => sum + row[key], 0) / wager;
  return Math.sqrt(rows.length / (rows.length - 1) * rows.reduce((sum, row) => sum + (row[key] - estimate * row.wagers) ** 2, 0)) / wager;
}

test('independent studies preserve the shared engine ledger, blind alternation, and hand-level ratio CI', () => {
  const report = simulateStudy({boss: {mode: 'legacy'}}, {players: 3, entries: 19, seed: 'study-ledger', policy: 'aggressive', sliceSize: 7});
  const rows = [], totals = {wagers: 0, refunds: 0, grossReturns: 0, netReturns: 0, totalReturns: 0, jackpotAwards: 0, fees: 0, playerFees: 0};
  for (const player of report.playerResults) {
    const session = createSession(report.config, player.seed);
    for (let index = 0; index < 19; index++) {
      session.stacks = {player: report.config.buyIn, npc: report.config.buyIn};
      const hand = playAutomatedHand(session, 'aggressive'), settled = hand.result, p = settled.player;
      rows.push({wagers: p.matchedWager, netReturns: p.netReturn, totalReturns: p.totalReturn});
      totals.wagers += p.matchedWager; totals.refunds += p.refund; totals.grossReturns += p.gross;
      totals.netReturns += p.netReturn; totals.totalReturns += p.totalReturn; totals.jackpotAwards += p.jackpotAward;
      totals.fees += settled.fee; totals.playerFees += p.fee;
      near(p.stackBefore + settled.npc.stackBefore + p.jackpotAward, p.stackAfter + settled.npc.stackAfter + settled.fee);
    }
    near(player.end, session.stacks.player);
  }
  for (const [key, expected] of Object.entries(totals)) near(report[key], expected);
  assert.equal(report.hands, 57); assert.equal(report.byBlind.small.hands, 30); assert.equal(report.byBlind.big.hands, 27);
  assert.equal(report.methodMeta.ciUnit, 'hand'); assert.equal(report.methodMeta.ciSamples, 57);
  assert.equal(report.methodMeta.blindMode, 'alternating');
  near(report.standardError, referenceError(rows, 'totalReturns'));
  near(report.baseStandardError, referenceError(rows, 'netReturns'));
  near(report.totalRtp, report.totalReturns / report.wagers);
  near(report.conservationError, 0);
  assert.equal(report.npcRefreshCount, 0);
});

test('player seeds are reproducible, independent, and stable when the requested player count grows', () => {
  const options = {players: 3, entries: 17, seed: 'repeatable', policy: 'balanced'};
  const first = simulateStudy(passive, options);
  assert.deepEqual(first, simulateStudy(passive, options));
  assert.deepEqual(first.playerResults, simulateStudy(passive, {...options, players: 4}).playerResults.slice(0, 3));
  assert.equal(new Set(first.playerResults.map(player => player.seed)).size, 3);
  assert.equal(new Set(Array.from({length: 1000}, (_, index) => studyPlayerSeed('repeatable', index))).size, 1000);
  assert.notEqual(studyPlayerSeed(1, 0), studyPlayerSeed('1', 0));
});

test('continuous mode preserves balances below entry minimum and separates every NPC refresh from payouts', () => {
  const report = simulateStudy({...passive, targetRtp: .5}, {players: 3, entries: 100, seed: 20261005, policy: 'call', mode: 'continuous'});
  assert.equal(report.methodMeta.blindMode, 'random-each-hand');
  assert.equal(report.playerSummary.insufficient, 3);
  assert.ok(report.hands > 3 && report.hands < 300);
  assert.equal(report.npcRefreshCount, report.hands);
  for (const player of report.playerResults) {
    assert.ok(player.hands > 1); // All seats fall below entry minimum long before stopping.
    assert.ok(player.end < .01);
    near(player.end, player.start + player.totalReturns - player.wagers);
    near(2 * player.end + player.fees, 2 * player.start + player.jackpotAwards + player.npcRefreshAdjustment);
    assert.equal(player.npcRefreshCount, player.hands);
    near(player.npcRefreshAdjustment, player.npcRefreshAdded - player.npcRefreshRemoved);
    const session = createSession(report.config, player.seed, {firstSmallBlind: 'random'});
    let hands = 0;
    while (session.stacks.player >= .01) {
      playAutomatedHand(session, 'call'); syncOpponentBankroll(session); hands++;
      assert.ok(hands <= 100);
    }
    assert.equal(player.hands, hands); near(player.end, session.stacks.player);
  }
  near(report.standardError, referenceError(report.playerResults, 'totalReturns'));
  assert.equal(report.methodMeta.ciUnit, 'player'); assert.equal(report.methodMeta.ciSamples, 3);
  near(report.conservationError, 0);
});

test('one continuous player has no cluster interval even after many hands', () => {
  const report = simulateStudy({...passive, targetRtp: 1}, {mode: 'continuous', entries: 20, policy: 'call'});
  assert.equal(report.hands, 20);
  assert.deepEqual(report.ci95, [null, null]); assert.deepEqual(report.baseCi95, [null, null]);
  assert.equal(report.standardError, null); assert.equal(report.baseStandardError, null);
  assert.equal(report.playerSummary.completed, 1);
});

test('cashout distinguishes attained targets, insufficient funds, and safety-limit censoring', () => {
  const common = {mode: 'cashout', players: 3, policy: 'call'};
  const censored = simulateStudy({...passive, targetRtp: .5}, {...common, targetAsset: 1000, maxHandsPerPlayer: 3});
  assert.deepEqual(censored.playerSummary, {completed: 0, target: 0, insufficient: 0, censored: 3});
  assert.equal(censored.hands, 9);
  assert.ok(censored.playerResults.every(player => player.censored && !player.reachedTarget && !player.insufficient));
  const busted = simulateStudy({...passive, targetRtp: .5}, {...common, targetAsset: 1000, maxHandsPerPlayer: 100});
  assert.equal(busted.playerSummary.insufficient, 3); assert.equal(busted.playerSummary.censored, 0);
  const targets = simulateStudy({...passive, targetRtp: 1}, {...common, targetAsset: 11, maxHandsPerPlayer: 80});
  const reached = targets.playerResults.filter(player => player.reachedTarget);
  assert.ok(reached.length > 0);
  assert.equal(targets.playerSummary.target, reached.length);
  assert.equal(targets.methodMeta.blindMode, 'random-each-hand');
  for (const player of targets.playerResults) {
    assert.equal(player.reachedTarget, player.end >= 11);
    assert.equal(player.insufficient, player.end < .01);
    assert.equal(player.censored, !player.reachedTarget && !player.insufficient);
    if (player.censored) assert.equal(player.hands, 80);
  }
  assert.equal(targets.npcRefreshCount, targets.hands); // Includes the final successful hand.
  const already = simulateStudy(passive, {...common, targetAsset: 10});
  assert.equal(already.hands, 0); assert.equal(already.playerSummary.target, 3);
  assert.equal(already.wagers, 0); assert.deepEqual(already.ci95, [null, null]);
});

test('slice trends use cumulative paid wagers, not an average of slice RTPs', () => {
  const progress = [];
  const report = simulateStudy({}, {players: 2, entries: 23, seed: 'different-wagers', sliceSize: 9,
    onProgress: value => progress.push(value)});
  let wagers = 0, totalReturns = 0, hands = 0;
  for (const batch of report.batches) {
    wagers += batch.wagers; totalReturns += batch.totalReturns; hands += batch.hands;
    near(batch.cumulativeWagers, wagers); near(batch.cumulativeTotalReturns, totalReturns);
    near(batch.cumulativeRtp, totalReturns / wagers); assert.equal(batch.cumulativeHands, hands);
  }
  assert.equal(report.batches.at(-1).hands, 1);
  near(report.batches.at(-1).cumulativeRtp, report.totalRtp);
  assert.equal(hands, report.hands); near(wagers, report.wagers);
  assert.ok(progress.every((entry, index) => index === 0 || entry.completed >= progress[index - 1].completed));
  assert.equal(progress.at(-1).completedPlayers, 2); assert.equal(progress.at(-1).completed, 46);
});

test('JP tier totals, actual hand outcomes, return buckets, and blind summaries reconcile', () => {
  const report = simulateStudy({...passive, deal: {player: {manual: ['Qs', 'Qh']}, npc: {manual: ['2c', '3d']}},
    jackpotEnabled: true}, {entries: 500, policy: 'call', seed: 333});
  assert.ok(report.tierCounts.quads > 0);
  near(report.jackpotAwards, report.tierCounts.royal * 200 + report.tierCounts.straightFlush * 50 + report.tierCounts.quads * 20);
  near(report.totalReturns, report.netReturns + report.jackpotAwards);
  assert.equal(report.jackpotHits, Object.values(report.tierCounts).reduce((sum, count) => sum + count, 0));
  assert.equal(report.returnDistribution.reduce((sum, bucket) => sum + bucket.hands, 0), report.hands);
  assert.ok(report.returnDistribution.find(bucket => bucket.key === 'five-plus').hands >= report.jackpotHits);
  assert.equal(report.showdowns, report.hands); assert.equal(report.showdownWins, report.wins); assert.equal(report.showdownTies, report.ties);
  for (const key of ['hands', 'wagers', 'netReturns', 'totalReturns', 'jackpotAwards', 'netWinningHands']) near(report.byBlind.small[key] + report.byBlind.big[key], report[key]);
  for (const street of Object.values(report.streetReach)) assert.equal(street.hands, report.hands);
  const preflop = report.actionStats.preflop;
  assert.equal(preflop.player.call.hands, 250); assert.equal(preflop.player.check.hands, 250);
  for (const street of Object.values(report.actionStats)) for (const seat of Object.values(street)) for (const cell of Object.values(seat)) {
    assert.equal(cell.hands, cell.handWins + cell.handLosses + cell.handTies);
    assert.ok(cell.hands <= cell.count); assert.ok(cell.handNetWins <= cell.hands);
  }
  assert.equal(report.dealAudit.player.manualHands, report.hands);
  assert.equal(report.dealAudit.player.totalRerolls, 0);
});

test('deal audit reports real unpaired redraw attempts and accepts the capped final hand', () => {
  const report = simulateStudy({...passive, deal: {player: {rerollMode: 'unpaired', rerollChance: 1, maxRerolls: 1}}},
    {entries: 60, policy: 'call', seed: 'audit'});
  const audit = report.dealAudit.player;
  assert.equal(audit.totalRerolls, audit.initialClasses.unpaired);
  assert.equal(audit.totalAttempts, report.hands + audit.totalRerolls);
  assert.equal(audit.rerolledHands, audit.totalRerolls);
  assert.ok(audit.finalClasses.unpaired > 0); assert.ok(audit.stopReasons.limit > 0);
  assert.equal(Object.values(audit.stopReasons).reduce((sum, count) => sum + count, 0), report.hands);
});

test('invalid study controls fail clearly instead of silently changing the requested experiment', () => {
  for (const options of [{players: 0}, {entries: 1.5}, {sliceSize: 0}, {maxHandsPerPlayer: 0},
    {mode: 'unknown'}, {policy: 'oracle'}, {seed: {}}, {mode: 'cashout', targetAsset: Infinity}]) {
    assert.throws(() => simulateStudy(passive, options));
  }
});
