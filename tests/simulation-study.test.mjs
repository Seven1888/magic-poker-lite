import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession, playAutomatedHand, syncOpponentBankroll} from '../src/engine.mjs';
import {simulateStudy, studyPlayerSeed} from '../src/simulation-study.mjs';
import {renderStudyDetails} from '../src/probability-report-view.mjs';

const near = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const passive = {
  outcome: {mode: 'legacy-deck'},
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
  const report = simulateStudy({outcome: {mode: 'legacy-deck'}, boss: {mode: 'legacy'}}, {players: 3, entries: 19, seed: 'study-ledger', policy: 'aggressive', sliceSize: 7});
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

test('historical continuous mode keeps its entry minimum and ledger when exported in study schema v4', () => {
  const report = simulateStudy({...passive, targetRtp: .5}, {players: 3, entries: 100, seed: 20261005, policy: 'call', mode: 'continuous'});
  assert.equal(report.methodMeta.blindMode, 'random-each-hand');
  assert.equal(report.playerSummary.insufficient, 3);
  assert.ok(report.hands >= 3 && report.hands < 300);
  // This is a legacy-deck rule regression in the current report format, not a
  // frozen v3 fixture. The v4 size/buy-in fields do not change its hand ledger.
  assert.equal(report.studyVersion, 4);
  assert.equal(report.outcomeModel, 'legacy-deck');
  assert.match(report.modelVersion, /\+study-v4$/);
  assert.deepEqual(report.actionSizeStats, []);
  assert.equal(report.tableEntries, 0);
  assert.equal(report.tableBuyIns, 0);
  assert.equal(report.methodMeta.insufficientThreshold, 10);
  assert.equal(report.methodMeta.entryMinimumMultiplier, 10);
  assert.equal(report.methodMeta.minimumEntryOnly, false);
  assert.equal(report.npcRefreshCount, report.hands);
  for (const player of report.playerResults) {
    assert.ok(player.hands >= 1); // Exactly the minimum can start; a lower settled balance cannot.
    assert.ok(player.end > 0 && player.end < report.config.minBuyIn);
    near(player.end, player.start + player.totalReturns - player.wagers);
    near(2 * player.end + player.fees, 2 * player.start + player.jackpotAwards + player.npcRefreshAdjustment);
    assert.equal(player.npcRefreshCount, player.hands);
    near(player.npcRefreshAdjustment, player.npcRefreshAdded - player.npcRefreshRemoved);
    const session = createSession(report.config, player.seed, {firstSmallBlind: 'random'});
    let hands = 0;
    while (session.stacks.player >= report.config.minBuyIn && session.stacks.npc >= report.config.minBuyIn) {
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
  const report = simulateStudy({...passive, buyIn: 100, targetRtp: 1}, {mode: 'continuous', entries: 20, policy: 'call'});
  assert.equal(report.hands, 20);
  assert.deepEqual(report.ci95, [null, null]); assert.deepEqual(report.baseCi95, [null, null]);
  assert.equal(report.standardError, null); assert.equal(report.baseStandardError, null);
  assert.equal(report.playerSummary.completed, 1);
});

test('cashout distinguishes attained targets, insufficient funds, and safety-limit censoring', () => {
  const common = {mode: 'cashout', players: 3, policy: 'call'};
  const censored = simulateStudy({...passive, minBuyIn: 1, targetRtp: .5}, {...common, targetAsset: 1000, maxHandsPerPlayer: 3});
  assert.deepEqual(censored.playerSummary, {completed: 0, target: 0, insufficient: 0, censored: 3});
  assert.equal(censored.hands, 9);
  assert.ok(censored.playerResults.every(player => player.censored && !player.reachedTarget && !player.insufficient));
  const insufficient = simulateStudy({...passive, targetRtp: .5}, {...common, targetAsset: 1000, maxHandsPerPlayer: 100});
  assert.equal(insufficient.playerSummary.insufficient, 3); assert.equal(insufficient.playerSummary.censored, 0);
  assert.ok(insufficient.playerResults.every(player => player.end > 0 && player.end < insufficient.config.minBuyIn));
  const targets = simulateStudy({...passive, targetRtp: 1}, {...common, targetAsset: 11, maxHandsPerPlayer: 80});
  const reached = targets.playerResults.filter(player => player.reachedTarget);
  assert.ok(reached.length > 0);
  assert.equal(targets.playerSummary.target, reached.length);
  assert.equal(targets.methodMeta.blindMode, 'random-each-hand');
  for (const player of targets.playerResults) {
    assert.equal(player.reachedTarget, player.end >= 11);
    assert.equal(player.insufficient, !player.reachedTarget && player.end < targets.config.minBuyIn);
    assert.equal(player.censored, !player.reachedTarget && !player.insufficient);
    if (player.censored) assert.equal(player.hands, 80);
  }
  assert.equal(targets.npcRefreshCount, targets.hands); // Includes the final successful hand.
  const already = simulateStudy(passive, {...common, targetAsset: 10});
  assert.equal(already.hands, 0); assert.equal(already.playerSummary.target, 3);
  assert.equal(already.wagers, 0); assert.deepEqual(already.ci95, [null, null]);
});

test('study reports render the saved current or historical threshold rather than a fixed value', () => {
  const report = simulateStudy({...passive, targetRtp: .5}, {mode: 'continuous', entries: 5, policy: 'call'});
  const target = {id: 'study-reports', innerHTML: '', querySelector: () => ({innerHTML: ''})};
  renderStudyDetails(report, null, target);
  assert.match(target.innerHTML, /目前 BET 的每手開局門檻 10（10 × BET）/);
  const historical = {...report, studyVersion: 1, methodMeta: {...report.methodMeta, minimumEntryOnly: true, insufficientThreshold: .01,
    stopRule: '完成指定手數或同桌可用資產低於 0.01；低於最低帶入仍可繼續短籌碼牌局。'}};
  renderStudyDetails(historical, null, target);
  assert.match(target.innerHTML, /可用資產低於本次報表的續玩門檻 0\.01/);
  assert.doesNotMatch(target.innerHTML, /目前 BET 的每手開局門檻/);
});

test('slice trends use cumulative paid wagers, not an average of slice RTPs', () => {
  const progress = [];
  const report = simulateStudy({outcome:{mode:'legacy-deck'}}, {players: 2, entries: 23, seed: 'different-wagers', sliceSize: 9,
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

test('無限資產連續研究即使持續虧損也完成指定手數，沒有額外安全上限', () => {
  const config = {...passive, targetRtp: .5};
  const options = {mode: 'continuous', players: 2, entries: 80, policy: 'call', seed: 20261005};
  const limited = simulateStudy(config, options), progress = [];
  const unlimited = simulateStudy(config, {...options, unlimitedBankroll: true, maxHandsPerPlayer: 1,
    onProgress: value => progress.push(value)});
  assert.ok(limited.hands < 160);
  assert.equal(unlimited.hands, 160);
  assert.deepEqual(unlimited.playerSummary, {completed: 2, target: 0, insufficient: 0, censored: 0});
  assert.equal(unlimited.maxHandsPerPlayer, null);
  assert.equal(unlimited.targetAsset, null);
  assert.equal(unlimited.methodMeta.insufficientThreshold, null);
  assert.ok(unlimited.playerResults.every(player => player.start === null && player.end === null && player.hands === 80));
  assert.ok([unlimited.wagers, unlimited.totalReturns, unlimited.profit, unlimited.baseRtp, unlimited.totalRtp].every(Number.isFinite));
  near(unlimited.profit, unlimited.totalReturns - unlimited.wagers);
  assert.ok(unlimited.conservationError < 1e-8);
  assert.equal(progress.at(-1).completed, 160);
  assert.equal(progress.at(-1).totalIsUpperBound, false);
  const largerAssets = simulateStudy({...config, minBuyIn: 100000, maxBuyIn: 100000, buyIn: 100000}, {...options, unlimitedBankroll: true});
  for (const key of ['hands', 'wagers', 'totalReturns', 'wins', 'losses', 'profit']) assert.equal(unlimited[key], largerAssets[key]);
});

test('無限資產沿用真實連續引擎、隨機盲位、BOSS 輪替及跨手雙池', () => {
  const options = {mode: 'continuous', unlimitedBankroll: true, entries: 4, policy: 'call', seed: 'unlimited-pools'};
  const report = simulateStudy({outcome: {mode: 'prebuilt-pools'}}, options);
  const session = createSession(report.config, studyPlayerSeed(options.seed, 0), {firstSmallBlind: 'random'});
  let wagers = 0, returns = 0, small = 0;
  const bosses = [];
  for (let index = 0; index < 4; index++) {
    session.stacks = {player: 10000, npc: 10000};
    const hand = playAutomatedHand(session, 'call');
    wagers += hand.result.player.matchedWager; returns += hand.result.player.totalReturn;
    small += Number(hand.smallBlind === 'player'); bosses.push(hand.bossProfile.id);
    syncOpponentBankroll(session);
  }
  near(report.wagers, wagers); near(report.totalReturns, returns);
  assert.equal(report.byBlind.small.hands, small);
  assert.deepEqual(report.playerResults[0].bossProfileSequence, bosses);
  assert.equal(report.bossEncounterAudit.unexpectedRepeats, 0);
  assert.deepEqual(report.playerResults[0].outcomePoolSummary.end, session.outcomePools);
  assert.equal(report.playerResults[0].outcomePoolSummary.end.handSequence, 4);
  assert.equal(report.methodMeta.blindMode, 'random-each-hand');
  const target = {id: 'study-reports', innerHTML: '', querySelector() { return {innerHTML: ''}; }};
  renderStudyDetails(report, null, target);
  assert.match(target.innerHTML, /研究資產<\/td><td>無限/);
  assert.doesNotMatch(target.innerHTML, /資產不足率|每人手數上限|玩家資產、達標與截尾/);
});
