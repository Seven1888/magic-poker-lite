import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateRefundStudy} from '../src/refund-study.mjs';
import {createSession, playAutomatedHand, syncOpponentBankroll} from '../src/engine.mjs';
import {handEntryStatus} from '../src/hand-entry.mjs';
import {studyPlayerSeed} from '../src/simulation-study.mjs';
import {createPoolStudySummary, collectPoolStudyAudit, finishPoolStudySummary} from '../src/probability-pools.mjs';

const near = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const passive = {outcome: {mode: 'legacy-deck'}, boss: {mode: 'legacy'},
  bigBlind: 1, minBuyIn: 1, buyIn: 10, targetRtp: .5, jackpotEnabled: false,
  npc: {fold: 0, call: 1, raise: 0, check: 1, bet: 0, strengthInfluence: 0, priceInfluence: 0},
  betSize: {preflop: 1, flop: 1, turn: 1, river: 1}};

function replay(report, row) {
  const session = createSession(report.config, row.seed, {firstSmallBlind: 'random'});
  session.stacks = {player: report.initialAsset, npc: report.initialAsset};
  const pool = report.outcomeModel === 'prebuilt-pools' ? createPoolStudySummary(session.outcomePools) : null;
  let hands = 0, priorBoss = null, repeats = 0;
  while (session.stacks.player < report.targetAsset && handEntryStatus(session).canStart) {
    // 測試防卡住，並非正式研究的停止條件。
    assert.ok(hands < 2000, '受控重播須能在測試範圍內終止');
    const hand = playAutomatedHand(session, report.policy);
    const boss = hand.bossProfile?.id;
    if (priorBoss !== null && boss === priorBoss) repeats++;
    priorBoss = boss;
    if (pool) collectPoolStudyAudit(pool, hand.result.outcomePoolAudit);
    syncOpponentBankroll(session); hands++;
  }
  if (pool) finishPoolStudySummary(pool, session.outcomePools);
  assert.equal(row.hands, hands);
  assert.equal(row.end, session.stacks.player);
  assert.equal(row.status, row.end >= report.targetAsset ? 'target' : 'insufficient');
  assert.deepEqual(row.outcomePoolSummary, pool);
  assert.equal(session.blindMode, 'random');
  if (report.config.boss.mode === 'rotate') assert.equal(repeats, 0);
  return session;
}

test('退幣研究接受零及不足門檻初資產，不因遊戲帶入下限補資', () => {
  for (const initialAsset of [0, 4.999999]) {
    const report = simulateRefundStudy({outcome: {mode: 'prebuilt-pools'}, minBuyIn: 5, bigBlind: 1}, {players: 2, initialAsset, targetAsset: 20});
    assert.equal(report.hands, 0); assert.equal(report.insufficientPlayers, 2);
    assert.equal(report.completedPlayers, 2); assert.equal(report.refundRate, 0);
    assert.equal(report.averageHands, 0); assert.equal(report.minHands, 0); assert.equal(report.maxHands, 0);
    assert.ok(report.config.buyIn >= report.config.minBuyIn);
    for (const row of report.playerResults) {
      assert.equal(row.start, initialAsset); assert.equal(row.end, initialAsset);
      assert.equal(row.status, 'insufficient');
      assert.deepEqual(row.outcomePoolSummary.start, row.outcomePoolSummary.end);
    }
  }
});

test('退幣目標先於開手門檻判斷，零目標與已達標玩家都零手成功', () => {
  for (const [initialAsset, targetAsset] of [[0, 0], [4, 3], [100, 100]]) {
    const report = simulateRefundStudy({}, {players: 3, initialAsset, targetAsset});
    assert.equal(report.hands, 0); assert.equal(report.targetPlayers, 3);
    assert.equal(report.insufficientPlayers, 0); assert.equal(report.refundRate, 1);
    assert.ok(report.playerResults.every(row => row.status === 'target' && row.end === initialAsset));
  }
});

test('退幣研究不受一般手數或八手安全上限截尾，且可由共用引擎完整重播', () => {
  const progress = [];
  const report = simulateRefundStudy(passive, {players: 2, initialAsset: 12, targetAsset: 100,
    seed: 'refund-no-eight-hand-limit', policy: 'call', entries: 1, maxHandsPerPlayer: 8,
    onProgress: value => progress.push(value)});
  assert.equal(report.insufficientPlayers, 2); assert.equal(report.targetPlayers, 0);
  assert.ok(report.playerResults.every(row => row.hands > 8 && row.end < report.config.minBuyIn));
  for (const row of report.playerResults) replay(report, row);
  assert.equal(report.hands, report.playerResults.reduce((sum, row) => sum + row.hands, 0));
  assert.equal(report.averageHands, report.hands / 2);
  assert.equal(report.minHands, Math.min(...report.playerResults.map(row => row.hands)));
  assert.equal(report.maxHands, Math.max(...report.playerResults.map(row => row.hands)));
  assert.equal(report.outcomePoolSummary, null);
  assert.equal(progress.length, report.hands + report.players);
  assert.equal(progress.at(-1).completedPlayers, 2); assert.equal(progress.at(-1).totalPlayers, 2);
  assert.equal(progress.at(-1).completedHands, report.hands);
  assert.ok(progress.every((value, index) => index === 0 || value.completedHands >= progress[index - 1].completedHands));
  assert.ok(progress.every((value, index) => index === 0 || value.completedPlayers >= progress[index - 1].completedPlayers));
  assert.ok(progress.some(value => value.completedPlayers === 0 && value.currentPlayerHands > 8));
  assert.ok(!('rtp' in report) && !('totalRtp' in report) && !('baseRtp' in report));
});

test('退幣研究沿用逐手隨機盲位、四型輪替及跨手雙池和冷卻', () => {
  const config = {bigBlind: 1, minBuyIn: 5, targetRtp: .5,
    betSize: {preflop: 1, flop: 1, turn: 1, river: 1},
    outcome: {mode: 'prebuilt-pools', conversionRate: 0, initialPaidActionPools: [.5, 20, 30],
      initialSpecialPools: [0, 4, 5], initialPaidActionCooldown: 2}};
  const report = simulateRefundStudy(config, {players: 1, initialAsset: 40, targetAsset: 80,
    seed: 46021, policy: 'call'});
  assert.equal(report.completedPlayers, 1); assert.equal(report.outcomeModel, 'prebuilt-pools');
  const row = report.playerResults[0];
  assert.ok(row.hands > 1);
  const session = replay(report, row), pool = row.outcomePoolSummary;
  assert.equal(pool.start.paidActionCooldown, 2);
  assert.equal(pool.start.handSequence, 0); assert.equal(pool.end.handSequence, row.hands);
  assert.deepEqual(pool.end, session.outcomePools);
  assert.equal(pool.hands, row.hands); near(pool.maxLedgerError, 0);
  for (const bucket of pool.byBucket) {
    near(bucket.paidActionStart + bucket.paidActionAdded - bucket.paidActionBudgetUsed, bucket.paidActionEnd);
    near(bucket.specialStart + bucket.specialAdded - bucket.specialAward, bucket.specialEnd);
  }
  assert.equal(report.outcomePoolSummary.players, 1);
  assert.equal(report.outcomePoolSummary.hands, report.hands);
});

test('退幣率只按達標玩家計算且獨立種子不受玩家總數影響', () => {
  const options = {players: 3, initialAsset: 5, targetAsset: 6, seed: 'refund-seed', policy: 'call'};
  const report = simulateRefundStudy({...passive, targetRtp: 1}, options);
  assert.deepEqual(report, simulateRefundStudy({...passive, targetRtp: 1}, options));
  const larger = simulateRefundStudy({...passive, targetRtp: 1}, {...options, players: 4});
  assert.deepEqual(report.playerResults, larger.playerResults.slice(0, 3));
  assert.equal(report.targetPlayers + report.insufficientPlayers, report.players);
  assert.equal(report.refundRate, report.playerResults.filter(row => row.status === 'target').length / report.players);
  for (const row of report.playerResults) {
    assert.equal(row.seed, studyPlayerSeed(options.seed, row.playerIndex));
    replay(report, row);
  }
});

test('退幣進度回呼中止時直接拋出，不回傳未完成報表', () => {
  const stopped = new Error('受控中止');
  let returned, calls = 0;
  assert.throws(() => {
    returned = simulateRefundStudy(passive, {players: 2, initialAsset: 12, targetAsset: 100, policy: 'call',
      onProgress: () => { calls++; throw stopped; }});
  }, error => error === stopped);
  assert.equal(returned, undefined); assert.equal(calls, 1);
});

test('退幣研究拒絕無效玩家數、資產、策略、種子與回呼', () => {
  for (const options of [{players: 0}, {players: 1.5}, {players: 1001}, {players: Infinity},
    {initialAsset: -1}, {initialAsset: Infinity}, {initialAsset: '10'}, {initialAsset: Number.MAX_VALUE},
    {targetAsset: -1}, {targetAsset: NaN}, {targetAsset: '20'}, {policy: 'oracle'}, {seed: {}}, {onProgress: true}]) {
    assert.throws(() => simulateRefundStudy(passive, options));
  }
});
