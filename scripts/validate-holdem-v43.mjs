import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {createBossHandRange} from '../src/boss-hand-range.mjs';
import {bossRangeContext} from '../src/boss-range-public.mjs';
import {calculateHoldemEquity} from '../src/holdem-equity.mjs';
import {compareHands, compareRanks, evaluateBest} from '../src/poker.mjs';
import {createSession, startHand, legalActions, applyAction, previewResponse, stepNpc} from '../src/engine.mjs';

// Functional validation of the standard Hold'em displays. No RTP simulation,
// dealing-frequency calibration, browser timing or device acceptance is claimed.
const started = performance.now(), tolerance = 1e-12;
const output = new URL('../output/math-v43-holdem-validation.json', import.meta.url);
const sourceFiles = ['src/holdem-equity.mjs', 'src/holdem-rank.mjs', 'src/boss-hand-range.mjs',
  'src/boss-range-public.mjs', 'src/engine.mjs', 'src/poker.mjs', 'scripts/validate-holdem-v43.mjs'];
const hashSources = async () => Object.fromEntries(await Promise.all(sourceFiles.map(async path => [path,
  createHash('sha256').update((await readFile(new URL(`../${path}`, import.meta.url), 'utf8')).replace(/\r\n/g, '\n'), 'utf8').digest('hex')])));
const sourceHashes = await hashSources();
const deck = [...'23456789TJQKA'].flatMap(rank => [...'shdc'].map(suit => rank + suit));
const profiles = ['caller', 'maniac', 'sniper', 'trapper'];
const report = {
  version: 43, generatedAt: new Date().toISOString(), clientDate: '2026-10-05', timezone: 'Asia/Taipei',
  sourceHashFormat: 'sha256 of UTF-8 source with LF line endings', sourceHashes, status: 'running',
  scope: '標準德州撲克顯示模型：所有未知牌等可能。BOSS 為目前最佳牌型；玩家 equity 為補齊五張公牌後的勝率加半數平手率。兩者不使用發牌重抽、指定暗牌、盲位、BOSS 身份或行動機率。引擎發牌及帳務不變；本報告不是 RTP、發牌頻率校準、瀏覽器揭牌時序或實體手機驗收。',
  estimatorInputs: ['playerHole', 'board'], oracleTolerance: tolerance,
  bossUniformOracle: {cases: 0, maximumAbsoluteDifference: 0,
    method: '獨立建立 52 張牌組，逐一枚舉未知兩張組合；對每組 5–7 張牌枚舉所有五張子集，以獨立 rank/suit 分類器求最佳類別，不使用 production evaluateBest 或 BOSS range 分類。', results: []},
  excludedInputs: {cases: 0, unreadFieldChecks: 0},
  screenshotBoardExample: {}, streetUpdates: [],
  equityRiverOracle: {cases: 0, method: '逐一枚舉 990 個未知對手底牌，使用既有 poker.compareHands 與新數值 rank helper 交叉核對 wins/ties/losses。', results: []},
  equityFlopOracle: {cases: 0, method: '先枚舉 1,081 個 BOSS 底牌，再枚舉每組剩餘 45 張中的 990 種 TURN/RIVER；使用既有 evaluateBest + compareRanks 逐一核對 1,070,190 個非平凡 FLOP 最終結果，不使用新數值 rank helper。', results: []},
  equityLockedRoyal: {cases: 0, results: []},
  equityPreflopApproximation: {cases: 0, exact: false, samplesPerCase: 100000,
    note: '翻牌前是獨立且可重現的均勻 Monte Carlo；本檢查僅確認抽樣數、輸入順序不變性、標示、勝率合理範圍，不冒稱精確枚舉或外部真值校準。', results: []},
  naturalEngineIsolation: {hands: 0, actions: 0, rangeUpdates: 0, equityCalculations: 0, sameBoardChecks: 0,
    categorySupportChecks: 0, minimumTrueCategoryProbability: 1, maximumDistributionSumError: 0,
    seeds: [7], method: '4 型 × 2 個首手小盲位置 × seed 7；玩家採 CHECK/CALL，BOSS 原引擎自然抽選。每個新公牌集合呼叫兩種顯示算法，每動作比對完全不呼叫算法的同 seed 對照局之整份手牌、session、RNG、牌面與最終帳務。', results: []}
};

function fiveCategory(cards) {
  const ranks = cards.map(card => '23456789TJQKA'.indexOf(card[0]) + 2).sort((a, b) => a - b);
  const groups = [...new Set(ranks)].map(rank => ranks.filter(value => value === rank).length).sort((a, b) => b - a);
  const straight = new Set(ranks).size === 5 && (ranks[4] - ranks[0] === 4 || ranks.join(',') === '2,3,4,5,14');
  const flush = cards.every(card => card[1] === cards[0][1]);
  if (straight && flush) return 8;
  if (groups[0] === 4) return 7;
  if (groups.join(',') === '3,2') return 6;
  if (flush) return 5;
  if (straight) return 4;
  if (groups[0] === 3) return 3;
  if (groups.join(',') === '2,2,1') return 2;
  return groups[0] === 2 ? 1 : 0;
}
function independentCategory(cards) {
  let best = 0;
  for (let a = 0; a < cards.length - 4; a++) for (let b = a + 1; b < cards.length - 3; b++)
    for (let c = b + 1; c < cards.length - 2; c++) for (let d = c + 1; d < cards.length - 1; d++)
      for (let e = d + 1; e < cards.length; e++) best = Math.max(best, fiveCategory([cards[a], cards[b], cards[c], cards[d], cards[e]]));
  return best;
}
function enumeratePairs(playerHole, board, inspect) {
  const pool = deck.filter(card => !playerHole.includes(card) && !board.includes(card));
  let count = 0;
  for (let a = 0; a < pool.length; a++) for (let b = a + 1; b < pool.length; b++) { inspect([pool[a], pool[b]]); count++; }
  return count;
}
function assertEquity(result) {
  assert.equal(result.outcomes, result.wins + result.ties + result.losses);
  assert.equal(result.equity, (result.wins + result.ties / 2) / result.outcomes);
  assert.equal(result.winRate, result.wins / result.outcomes);
  assert.equal(result.tieRate, result.ties / result.outcomes);
  assert.equal(result.lossRate, result.losses / result.outcomes);
  assert.ok(result.equity >= 0 && result.equity <= 1);
}
const boards = [
  ['2s', '5h', '9c'], ['2s', '2h', '9c'], ['2s', '3s', '4s', '5s'],
  ['2s', '2h', '2c', '9s', '9h'], ['Ts', 'Js', 'Qs', 'Ks', '9s']
];
for (const playerHole of [['As', 'Kd'], ['Ah', 'Qd'], ['Ac', 'Jh']]) for (const board of boards) {
  const counts = Array(9).fill(0), candidateCount = enumeratePairs(playerHole, board, hole => counts[independentCategory([...hole, ...board])]++);
  const result = createBossHandRange({playerHole}).update({board});
  assert.equal(result.status, 'ready'); assert.equal(result.candidateCount, candidateCount);
  for (const row of result.distribution) {
    const difference = Math.abs(row.probability - counts[row.category] / candidateCount);
    assert.ok(difference < tolerance);
    report.bossUniformOracle.maximumAbsoluteDifference = Math.max(report.bossUniformOracle.maximumAbsoluteDifference, difference);
  }
  report.bossUniformOracle.cases++;
  report.bossUniformOracle.results.push({playerHole, board, candidateCount, categoryCounts: counts});
}

const examplePlayer = ['2h', '3d'], exampleBoard = ['7h', '6s', 'Ks'];
const exampleTracker = createBossHandRange({playerHole: examplePlayer}), exampleResult = exampleTracker.update({board: exampleBoard});
const exampleCounts = [649, 396, 27, 9, 0, 0, 0, 0, 0];
for (const row of exampleResult.distribution) assert.ok(Math.abs(row.probability - exampleCounts[row.category] / 1081) < tolerance);
report.screenshotBoardExample = {note: '公牌採使用者截圖的 7h 6s Ks；玩家 2h 3d 是明示示例假設，並非重播截圖原手牌。盲位／角色／重抽設定不影響此標準模型。',
  playerHole: examplePlayer, board: exampleBoard, candidateCount: exampleResult.candidateCount,
  independentCombinatorialCounts: exampleCounts, distribution: exampleResult.distribution};
for (const board of [exampleBoard, [...exampleBoard, '7c'], [...exampleBoard, '7c', 'Kd']]) {
  const result = exampleTracker.update({board});
  assert.deepEqual(result, createBossHandRange({playerHole: examplePlayer}).update({board}));
  report.streetUpdates.push({board, candidateCount: result.candidateCount, distribution: result.distribution});
}
assert.notDeepEqual(report.streetUpdates[0].distribution, report.streetUpdates[1].distribution);
assert.notDeepEqual(report.streetUpdates[1].distribution, report.streetUpdates[2].distribution);
assert.deepEqual(exampleTracker.update({board: exampleBoard}), exampleResult);
for (const bossProfileId of profiles) for (const smallBlind of ['player', 'npc']) {
  const config = {deal: {player: {rerollChance: 1, manualProvided: true}, npc: {rerollChance: 1, manualProvided: true}}, boss: {profileId: bossProfileId}};
  assert.deepEqual(createBossHandRange({playerHole: examplePlayer, smallBlind, bossProfileId, config})
    .update({board: exampleBoard, evidence: [{selectedType: 'raise', probability: 1}]}), exampleResult);
  report.excludedInputs.cases++;
}
const poison = object => {
  for (const key of ['config', 'smallBlind', 'bossProfileId', 'manual', 'manualProvided', 'evidence', 'holes', 'npcHole', 'deck', 'seed', 'rng', 'dealAudit']) {
    Object.defineProperty(object, key, {get() { throw new Error(`Excluded input read: ${key}`); }}); report.excludedInputs.unreadFieldChecks++;
  }
  return object;
};
const privateContext = poison({playerHole: examplePlayer}), privateUpdate = poison({board: exampleBoard});
assert.deepEqual(bossRangeContext(privateContext), {playerHole: examplePlayer});
assert.deepEqual(createBossHandRange(privateContext).update(privateUpdate), exampleResult);
const privateEquityInput = poison({playerHole: examplePlayer, board: ['Ts', 'Js', 'Qs', 'Ks', 'As']});
assert.equal(calculateHoldemEquity(privateEquityInput).equity, .5);

for (const {playerHole, board} of [
  {playerHole: ['As', 'Kd'], board: ['2s', '5h', '9c', 'Ts', 'Jd']},
  {playerHole: ['2h', '3d'], board: ['Ts', 'Js', 'Qs', 'Ks', 'As']},
  {playerHole: ['Ah', 'Ad'], board: ['2s', '2h', '2c', 'Kh', 'Kd']},
  {playerHole: ['8s', '7h'], board: ['4s', '5s', '6s', '9d', 'Tc']}
]) {
  const expected = {wins: 0, ties: 0, losses: 0};
  enumeratePairs(playerHole, board, hole => {
    const compared = compareHands([...playerHole, ...board], [...hole, ...board]);
    expected[compared > 0 ? 'wins' : compared < 0 ? 'losses' : 'ties']++;
  });
  const result = calculateHoldemEquity({playerHole, board}); assertEquity(result);
  for (const key of ['wins', 'ties', 'losses']) assert.equal(result[key], expected[key]);
  assert.equal(result.exact, true); assert.equal(result.method, 'exact-enumeration'); assert.equal(result.outcomes, 990);
  report.equityRiverOracle.cases++;
  report.equityRiverOracle.results.push({playerHole, board, independentCounts: expected, ...result});
}
{
  const oracleStarted = performance.now(), playerHole = ['As', 'Kd'], board = ['7h', '6s', 'Ks'];
  const expected = {wins: 0, ties: 0, losses: 0}, heroRanks = new Map();
  const unknown = deck.filter(card => !playerHole.includes(card) && !board.includes(card));
  enumeratePairs(playerHole, board, hole => {
    const future = unknown.filter(card => !hole.includes(card));
    for (let first = 0; first < future.length; first++) for (let second = first + 1; second < future.length; second++) {
      const runout = [future[first], future[second]], key = runout.join('');
      if (!heroRanks.has(key)) heroRanks.set(key, evaluateBest([...playerHole, ...board, ...runout]).rank);
      const compared = compareRanks(heroRanks.get(key), evaluateBest([...hole, ...board, ...runout]).rank);
      expected[compared > 0 ? 'wins' : compared < 0 ? 'losses' : 'ties']++;
    }
  });
  const result = calculateHoldemEquity({playerHole, board}); assertEquity(result);
  for (const key of ['wins', 'ties', 'losses']) assert.equal(result[key], expected[key]);
  assert.equal(result.exact, true); assert.equal(result.outcomes, 1070190);
  assert.ok(result.wins > 0 && result.ties > 0 && result.losses > 0);
  report.equityFlopOracle.cases++;
  report.equityFlopOracle.results.push({playerHole, board, independentCounts: expected, ...result,
    measuredDurationMs: Math.round((performance.now() - oracleStarted) * 1000) / 1000});
}
for (const board of [['Qs', 'Js', 'Ts'], ['Qs', 'Js', 'Ts', '2h']]) {
  const playerHole = ['As', 'Ks'], result = calculateHoldemEquity({playerHole, board}); assertEquity(result);
  assert.equal(result.exact, true); assert.equal(result.equity, 1); assert.equal(result.ties, 0); assert.equal(result.losses, 0);
  assert.equal(result.outcomes, board.length === 3 ? 1070190 : 45540);
  report.equityLockedRoyal.cases++; report.equityLockedRoyal.results.push({playerHole, board, ...result});
}
for (const {playerHole, bounds} of [{playerHole: ['As', 'Ah'], bounds: [.84, .87]}, {playerHole: ['7s', '2h'], bounds: [.32, .37]}]) {
  const result = calculateHoldemEquity({playerHole, board: []}); assertEquity(result);
  assert.deepEqual(calculateHoldemEquity({playerHole: [...playerHole].reverse(), board: []}), result);
  assert.equal(result.outcomes, 100000); assert.equal(result.exact, false); assert.equal(result.method, 'deterministic-monte-carlo');
  assert.ok(result.standardError > 0); assert.ok(result.equity > bounds[0] && result.equity < bounds[1]);
  report.equityPreflopApproximation.cases++; report.equityPreflopApproximation.results.push({playerHole, plausibleBounds: bounds, ...result});
}

const natural = report.naturalEngineIsolation;
for (const profileId of profiles) for (const smallBlind of ['player', 'npc']) for (const seed of natural.seeds) {
  const config = {boss: {mode: 'fixed', profileId}}, options = {firstSmallBlind: smallBlind};
  const session = createSession(config, seed, options), baselineSession = createSession(config, seed, options);
  const hand = startHand(session), control = startHand(baselineSession);
  const context = bossRangeContext({playerHole: hand.holes.player}), tracker = createBossHandRange(context);
  assert.deepEqual(Object.keys(context), ['playerHole']);
  const resultsByBoard = new Map();
  let actions = 0, minimumTrueProbability = 1, equityCalculations = 0;
  function inspect() {
    const before = JSON.stringify(hand), sessionBefore = JSON.stringify(session), rng = hand.rng.state();
    const result = tracker.update({board: [...hand.board]}), boardKey = hand.board.join(',');
    if (resultsByBoard.has(boardKey)) { assert.deepEqual(result, resultsByBoard.get(boardKey).range); natural.sameBoardChecks++; }
    else {
      const equity = calculateHoldemEquity({playerHole: [...hand.holes.player], board: [...hand.board]}); assertEquity(equity);
      resultsByBoard.set(boardKey, {range: result, equity}); natural.equityCalculations++; equityCalculations++;
    }
    assert.equal(JSON.stringify(hand), before); assert.equal(JSON.stringify(session), sessionBefore);
    assert.equal(hand.rng.state(), rng); assert.equal(JSON.stringify(hand), JSON.stringify(control));
    assert.equal(JSON.stringify(session), JSON.stringify(baselineSession)); assert.equal(hand.rng.state(), control.rng.state());
    const cards = [...hand.holes.player, ...hand.holes.npc, ...hand.board, ...hand.deck];
    assert.equal(cards.length, 52); assert.equal(new Set(cards).size, 52);
    natural.rangeUpdates++;
    if (hand.board.length >= 3) {
      assert.equal(result.status, 'ready');
      // Test truth is only used here; neither calculator receives it.
      const actual = evaluateBest([...hand.holes.npc, ...hand.board]).category;
      const probability = result.distribution.find(row => row.category === actual).probability;
      assert.ok(probability > 0); natural.categorySupportChecks++;
      minimumTrueProbability = Math.min(minimumTrueProbability, probability);
      natural.minimumTrueCategoryProbability = Math.min(natural.minimumTrueCategoryProbability, probability);
      const sumError = Math.abs(result.distribution.reduce((sum, row) => sum + row.probability, 0) - 1);
      assert.ok(sumError < tolerance); natural.maximumDistributionSumError = Math.max(natural.maximumDistributionSumError, sumError);
    }
  }
  inspect();
  while (hand.status === 'playing') {
    assert.ok(actions < 30);
    if (hand.actor === 'player') {
      for (const action of legalActions(hand)) assert.deepEqual(previewResponse(hand, action.type), previewResponse(control, action.type));
      inspect();
      const action = legalActions(hand).find(item => item.type === 'check' || item.type === 'call');
      assert.ok(action); applyAction(hand, action.type); applyAction(control, action.type);
    } else {
      inspect(); assert.deepEqual(stepNpc(hand), stepNpc(control));
    }
    actions++; natural.actions++; inspect();
  }
  const result = hand.result;
  const accountingError = Math.abs(hand.stacks.player + hand.stacks.npc + result.fee
    - hand.stacksBefore.player - hand.stacksBefore.npc - result.player.jackpotAward);
  assert.ok(accountingError < 1e-6);
  natural.results.push({profileId, smallBlind, seed, actions, equityCalculations, minimumTrueCategoryProbability: minimumTrueProbability,
    endingStreet: hand.street, result: result.reason, winner: result.winner, board: hand.board, playerClosing: hand.stacks.player,
    bossClosing: hand.stacks.npc, fee: result.fee, jackpotAward: result.player.jackpotAward, accountingError, rngState: hand.rng.state()});
  natural.hands++;
}
assert.equal(natural.hands, 8);
assert.deepEqual(await hashSources(), sourceHashes, 'Source files changed during validation; rerun for consistent evidence.');
report.status = 'passed'; report.measuredDurationMs = Math.round((performance.now() - started) * 1000) / 1000;
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({status: report.status, output: fileURLToPath(output), durationMs: report.measuredDurationMs,
  bossOracleCases: report.bossUniformOracle.cases, maximumOracleDifference: report.bossUniformOracle.maximumAbsoluteDifference,
  exactRiverCases: report.equityRiverOracle.cases, ordinaryFlopOracleCases: report.equityFlopOracle.cases,
  lockedRoyalCases: report.equityLockedRoyal.cases,
  preflopApproximationCases: report.equityPreflopApproximation.cases, naturalHands: natural.hands,
  naturalActions: natural.actions, rangeUpdates: natural.rangeUpdates, equityCalculations: natural.equityCalculations,
  categorySupportChecks: natural.categorySupportChecks, sameBoardChecks: natural.sameBoardChecks}));
