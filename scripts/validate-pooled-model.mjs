import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {Worker, isMainThread, parentPort, workerData} from 'node:worker_threads';

const SOURCE_PATHS = ['scripts/validate-pooled-model.mjs', 'src/engine.mjs', 'src/poker.mjs',
  'src/jackpot.mjs', 'src/boss-profiles.mjs', 'src/hand-entry.mjs', 'src/next-hand-bet.mjs',
  'src/outcome-pools.mjs', 'src/prebuilt-outcome-tree.mjs', 'src/outcome-layout.mjs',
  'src/simulation-study.mjs', 'src/probability-pools.mjs'];
const sourceHashes = () => Object.fromEntries(SOURCE_PATHS.map(path => [path,
  createHash('sha256').update(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
    .replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')).digest('hex')]));
function assertSources(expected) {
  const actual = sourceHashes();
  for (const path of SOURCE_PATHS) assert.equal(actual[path], expected[path], `Source changed during validation: ${path}`);
}
const poolState = pools => ({buckets: pools.buckets, paidActionCooldown: pools.paidActionCooldown,
  qualificationSequence: pools.qualificationSequence, handSequence: pools.handSequence,
  lastSettlementId: pools.lastSettlement?.id ?? null});
const near = (left, right, label) => assert.ok(Math.abs(left - right) < 0.00001, `${label}: ${left} != ${right}`);
const SCENARIOS = [
  {id: 'default', players: 8, hands: 8, seed: 2026100547, policy: 'balanced', config: {}},
  {id: 'warm-controlled', players: 8, hands: 4, seed: 2026100548, policy: 'call',
    config: {outcome: {initialPaidActionPools: [50, 50, 50], initialSpecialPools: [2000, 2000, 2000],
      paidActionCooldownMin: 2, paidActionCooldownMax: 2}}},
  {id: 'bucket-switch-controlled', players: 1, hands: 6, seed: 2026100549, policy: 'call',
    bets: [10, 20, 800, 10, 20, 800], config: {buyIn: 100000, maxBuyIn: 100000,
      outcome: {initialPaidActionPools: [50, 50, 50], initialSpecialPools: [2000, 2000, 2000],
        paidActionCooldownMin: 2, paidActionCooldownMax: 2}}}
];

async function runPlayer(scenario, index) {
  const {createSession, startHand, getActionDistribution, sampleDistribution, applyAction,
    syncOpponentBankroll} = await import('../src/engine.mjs');
  const {studyPlayerSeed} = await import('../src/simulation-study.mjs');
  const {handEntryStatus} = await import('../src/hand-entry.mjs');
  const {nextHandBetConfig} = await import('../src/next-hand-bet.mjs');
  const {applyBranchPools, isSpecialPoolLayout} = await import('../src/outcome-pools.mjs');
  const {createPoolStudySummary, collectPoolStudyAudit, finishPoolStudySummary} = await import('../src/probability-pools.mjs');
  const seed = studyPlayerSeed(scenario.seed, index), session = createSession(scenario.config, seed, {firstSmallBlind: 'random'});
  const poolSummary = createPoolStudySummary(session.outcomePools), hands = [];
  let stop = 'completed', maxConservationError = 0, totalNodes = 0, paidEvents = 0, cooldownDecrements = 0;
  for (let handIndex = 0; handIndex < scenario.hands; handIndex++) {
    if (scenario.bets && handIndex > 0) session.config = nextHandBetConfig(session, scenario.bets[handIndex]);
    if (!handEntryStatus(session).canStart) { stop = 'insufficient-assets'; break; }
    const before = structuredClone(session.outcomePools), hand = startHand(session), tree = hand._outcomeTree;
    assert.equal(tree.complete, true); assert.equal(tree.nodes.length, 1312);
    totalNodes += tree.nodes.length;
    assert.deepEqual(poolState(hand.outcomePoolsBefore), poolState(before), 'prior hand pool balance persists');
    assert.deepEqual(poolState(session.outcomePools), poolState(applyBranchPools({pools: before,
      decision: hand.outcomeDecision, handId: hand.outcomeHandId})), 'tree creation commits root only');
    if (hand.outcomeDecision.qualification) {
      assert.equal(hand.outcomeDecision.qualification.id, before.qualificationSequence + 1,
        'a new hand reserves a fresh qualification instead of carrying an old fold reservation');
    } else assert.equal(session.outcomePools.qualificationSequence, before.qualificationSequence);
    const board = [...tree.layout.board], player = [...hand.holes.player];
    assert.ok(isSpecialPoolLayout({player, board, qualification: hand.outcomeDecision.qualification}),
      'root qualification exactly controls special tier and player participation');
    const nodes = new Map(tree.nodes.map(node => [node.id, node])), path = [], visited = new Set([hand._outcomeNodeId]);
    while (hand.status === 'playing') {
      assert.ok(path.length < 40);
      const from = hand._outcomeNodeId, actor = hand.actor;
      const selected = sampleDistribution(getActionDistribution(hand, actor,
        actor === 'player' ? scenario.policy : 'balanced'), hand.rng);
      const rngAfterSampling = hand.rng.state();
      applyAction(hand, selected.type);
      assert.equal(hand.rng.state(), rngAfterSampling, 'runtime transition uses no extra RNG');
      assert.deepEqual(hand.holes.player, player); assert.deepEqual(hand.board, board.slice(0, hand.board.length));
      assert.equal(new Set([...hand.holes.player, ...hand.holes.npc, ...hand.board, ...hand.deck]).size, 52);
      path.push({from, to: hand._outcomeNodeId, actor, action: selected.type, amount: selected.amount,
        probability: selected.probability, roll: selected.roll});
      visited.add(hand._outcomeNodeId);
      assert.deepEqual(poolState(session.outcomePools), poolState(nodes.get(hand._outcomeNodeId).state.session.outcomePools),
        'real pool state is exactly the selected prebuilt branch');
    }
    const result = hand.result, audit = result.outcomePoolAudit, branch = hand.outcomeDecision.poolBranch;
    const conservation = Math.abs(result.player.stackAfter + result.npc.stackAfter + result.fee
      - result.player.stackBefore - result.npc.stackBefore - result.player.jackpotAward);
    near(conservation, 0, 'chip conservation'); maxConservationError = Math.max(maxConservationError, conservation);
    assert.equal(session.outcomePools.handSequence, before.handSequence + 1);
    assert.equal(session.outcomePools.lastSettlement.id, hand.outcomeHandId);
    near(audit.specialAward, result.player.jackpotAward, 'pool award equals player award');
    near(audit.paidActionBudgetUsed, branch.paidActionBudgetUsed, 'selected branch spend');
    if (result.reason === 'fold') assert.equal(audit.specialAward, 0);
    if (result.reason === 'showdown') assert.equal(result.winner === 'player', hand.outcomeDecision.target === 'win');
    for (const event of audit.paidEvents) {
      assert.ok(visited.has(event.nodeId), 'an unvisited branch must not spend or earn');
      assert.ok(path.some(step => step.from === event.nodeId && step.actor === 'player' && step.action === event.type));
      if (event.paidActionCooldownBefore > 0) {
        assert.equal(event.paidActionBudgetUsed, 0);
        if (event.previousTarget === 'nonWin') {
          assert.equal(event.paidActionCooldownAfter, event.paidActionCooldownBefore - 1); cooldownDecrements++;
        }
      }
      paidEvents++;
    }
    for (const credit of audit.credits) {
      assert.ok(audit.paidEvents.some(event => event.nodeId === credit.nodeId && event.target === 'win'),
        'credit must originate at a paid winning node, including later player folds');
      near(credit.matchedPaidAmount, Math.max(0, Math.min(credit.to, result.player.matchedWager) - credit.from), 'refund clipping');
      near(credit.matchedPaidAmount + credit.refundablePaidAmount, credit.to - credit.from, 'credit interval');
    }
    for (let bucket = 0; bucket < 3; bucket++) if (bucket !== audit.bucketIndex) {
      assert.deepEqual(session.outcomePools.buckets[bucket], before.buckets[bucket], 'inactive BET bucket remains unchanged');
    }
    collectPoolStudyAudit(poolSummary, audit);
    const refresh = syncOpponentBankroll(session);
    hands.push({hand: hand.handNumber, bet: hand.config.bigBlind, smallBlind: hand.smallBlind,
      boss: hand.bossProfile.id, target: hand.outcomeDecision.target, winner: result.winner, reason: result.reason,
      path, terminalNodeId: hand._outcomeNodeId, nodeCount: tree.nodes.length, player: result.player,
      fee: result.fee, poolAudit: audit, endPools: structuredClone(session.outcomePools), npcRefresh: refresh});
    parentPort?.postMessage({kind: 'progress', scenario: scenario.id, player: index, hands: hands.length});
  }
  finishPoolStudySummary(poolSummary, session.outcomePools);
  near(poolSummary.maxLedgerError, 0, 'pool ledger conservation');
  return {scenario: scenario.id, index, seed, config: session.config, stop, start: session.config.buyIn,
    end: session.stacks.player, wagers: hands.reduce((sum, hand) => sum + hand.player.matchedWager, 0),
    baseReturns: hands.reduce((sum, hand) => sum + hand.player.netReturn, 0),
    totalReturns: hands.reduce((sum, hand) => sum + hand.player.totalReturn, 0),
    maxConservationError, totalNodes, paidEvents, cooldownDecrements, poolSummary, hands};
}

function ratioEstimate(players, field) {
  const wager = players.reduce((sum, player) => sum + player.wagers, 0);
  const estimate = players.reduce((sum, player) => sum + player[field], 0) / wager;
  if (players.length < 2) return {estimate, standardError: null, ci95: [null, null], samples: players.length};
  const residual = players.reduce((sum, player) => sum + (player[field] - estimate * player.wagers) ** 2, 0);
  const standardError = Math.sqrt(players.length / (players.length - 1) * residual) / wager;
  return {estimate, standardError, ci95: [estimate - 1.96 * standardError, estimate + 1.96 * standardError], samples: players.length};
}

if (!isMainThread) {
  assertSources(workerData.hashes);
  const results = [];
  for (const task of workerData.tasks) results.push(await runPlayer(SCENARIOS[task.scenario], task.index));
  assertSources(workerData.hashes);
  parentPort.postMessage({kind: 'complete', results});
} else {
  const started = Date.now(), hashes = sourceHashes();
  const taskGroups = Array.from({length: 4}, () => []);
  let count = 0;
  for (const [scenario, item] of SCENARIOS.entries()) for (let index = 0; index < item.players; index++) {
    taskGroups[count++ % 4].push({scenario, index});
  }
  const workers = [];
  let players;
  try {
    players = (await Promise.all(taskGroups.map(tasks => new Promise((resolve, reject) => {
      const worker = new Worker(new URL(import.meta.url), {workerData: {tasks, hashes}});
      workers.push(worker); let finished = false;
      worker.on('message', message => {
        if (message.kind === 'complete') { finished = true; resolve(message.results); }
        else console.log(JSON.stringify({...message, elapsedMs: Date.now() - started}));
      });
      worker.on('error', reject);
      worker.on('exit', code => { if (code !== 0 || !finished) reject(new Error(`Worker exited ${code} without completion.`)); });
    })))).flat();
  } catch (error) {
    await Promise.allSettled(workers.map(worker => worker.terminate())); throw error;
  }
  assertSources(hashes);
  const {combinePoolStudySummaries} = await import('../src/probability-pools.mjs');
  const scenarios = SCENARIOS.map(scenario => {
    const results = players.filter(player => player.scenario === scenario.id).sort((a, b) => a.index - b.index);
    const allHands = results.flatMap(player => player.hands);
    return {...scenario, actualHands: allHands.length, playerResults: results,
      outcomePoolSummary: combinePoolStudySummaries(results.map(player => player.poolSummary)),
      baseRtp: ratioEstimate(results, 'baseReturns'), totalRtp: ratioEstimate(results, 'totalReturns'),
      specialQualifications: allHands.filter(hand => hand.poolAudit.qualification).length,
      specialPayouts: allHands.filter(hand => hand.poolAudit.specialAward > 0).length,
      cooldownDecrements: results.reduce((sum, player) => sum + player.cooldownDecrements, 0),
      paidEvents: results.reduce((sum, player) => sum + player.paidEvents, 0),
      totalPrebuiltNodes: results.reduce((sum, player) => sum + player.totalNodes, 0),
      maxConservationError: Math.max(...results.map(player => player.maxConservationError))};
  });
  const report = {kind: 'pooled-model-validation', version: 1, clientDate: '2026-10-05',
    command: 'node scripts/validate-pooled-model.mjs', model: 'shared-engine-prebuilt-pools',
    method: '每位玩家獨立 seed；同一玩家連續保留資產、三桶水池與冷卻。雙方每手後以既有 demo 規則同步資產，調整另列。每手先建立全部 1312 節點，運行僅提交實走路徑。',
    uncertainty: 'base/total RTP 為返還總和除以有效投入總和；以每位玩家整段為群集計算 95% 常態近似區間。僅 8 位玩家，區間屬描述性檢查，非長期 RTP 校準。',
    limitations: ['warm-controlled 與 bucket-switch-controlled 的非零初始池、固定 CD=2、call 策略是受控驗證，不代表正式預設頻率。',
      '全樹節點、同玩家各手均非獨立 CI 樣本；BET 桶切換只有一位玩家，不報區間。',
      '池起始資金可暫時拉高實現返還；本報告不證明 99% RTP、穩態、尾部收斂或商業可部署帳本。'],
    checks: {sourceUnchangedDuringExecution: true, completeTreesBeforePlay: true,
      runtimeApplyConsumesNoRng: true, fixedPlayerAndPublicCards: true, unique52Cards: true,
      chosenBranchOnly: true, unvisitedCreditsExcluded: true, refundCreditsClipped: true,
      crossHandPoolPersistence: true, inactiveBucketsUnchanged: true,
      maxConservationError: Math.max(...scenarios.map(scenario => scenario.maxConservationError)),
      maxPoolLedgerError: Math.max(...scenarios.map(scenario => scenario.outcomePoolSummary.maxLedgerError))},
    sourceHashAlgorithm: 'sha256 UTF-8, BOM removed, LF normalized', sourceHashes: hashes,
    scenarios, elapsedMs: Date.now() - started};
  assertSources(hashes);
  writeFileSync(new URL('../output/math-v46-pooled-validation.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({kind: 'validation-complete', elapsedMs: report.elapsedMs, checks: report.checks,
    scenarios: scenarios.map(({id, actualHands, specialQualifications, specialPayouts, cooldownDecrements, outcomePoolSummary}) =>
      ({id, actualHands, specialQualifications, specialPayouts, cooldownDecrements, outcomePoolSummary}))}));
}
