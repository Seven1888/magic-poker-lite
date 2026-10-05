import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createBossHandRange} from '../src/boss-hand-range.mjs';
import {bossRangeContext, publicBossEvidence} from '../src/boss-range-public.mjs';
import {makeDeck, evaluateBest, holeScore} from '../src/poker.mjs';
import {getBossProfileDistribution} from '../src/boss-profiles.mjs';
import {createSession, startHand, legalActions, applyAction, getActionDistribution,
  previewResponse, stepNpc} from '../src/engine.mjs';

// Independent functional/math checks. This is not an RTP simulation, empirical
// dealing-frequency study, browser visibility test, or physical-device test.
const output = new URL('../output/math-v41-range-validation.json', import.meta.url);
const sourceFiles = ['src/boss-hand-range.mjs', 'src/boss-range-public.mjs', 'src/engine.mjs',
  'src/poker.mjs', 'src/boss-profiles.mjs', 'scripts/validate-range-v41.mjs'];
const sourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async path => [path,
  createHash('sha256').update((await readFile(new URL(`../${path}`, import.meta.url), 'utf8')).replace(/\r\n/g, '\n'), 'utf8').digest('hex')])));
const profiles = ['caller', 'maniac', 'sniper', 'trapper'];
const deck = makeDeck(), player = ['As', 'Kd'];
const available = deck.filter(card => !player.includes(card));
const boards = [
  ['2s', '5h', '9c'], ['2s', '2h', '9c'], ['2s', '3s', '4s', '5s'],
  ['2s', '2h', '2c', '9s', '9h'], ['Ts', 'Js', 'Qs', 'Ks', '9s']
];
const streetFor = board => ({0: 'preflop', 3: 'flop', 4: 'turn', 5: 'river'})[board.length];
const tolerance = 1e-12;
const report = {
  version: 41, generatedAt: new Date().toISOString(), clientDate: '2026-10-05', timezone: 'Asia/Taipei',
  sourceHashFormat: 'sha256 of UTF-8 source with LF line endings', sourceHashes, status: 'running',
  scope: '公開資訊牌型後驗的獨立枚舉、有限次重抽及引擎隔離驗證；不是 RTP、發牌頻率校準、瀏覽器揭牌時序或實體手機驗收。',
  oracleTolerance: tolerance,
  directEnumeration: {cases: 0, maximumAbsoluteDifference: 0,
    method: '逐一枚舉剩餘兩張候選，直接 evaluateBest 分類；有 CALL 證據時直接使用公開角色表的動作 likelihood。'},
  finiteCapExtremes: {cases: 0},
  legacyProbabilityBounds: {cases: 0, minimumProbability: 1, maximumProbability: 0, maximumSumError: 0},
  reverseOrderOracle: {cases: 0, maximumAbsoluteDifference: 0,
    method: '每個候選獨立枚舉移除兩牌後的 50 張池 eligible 組合，以倒推遞迴求有限次接受率，不使用模組 degree 修正公式。'},
  manualPlayerReservation: {cases: 0},
  naturalEngineIsolation: {hands: 0, actions: 0, rangeUpdates: 0, posteriorChecks: 0,
    minimumTrueCategoryProbability: 1, maximumDistributionSumError: 0,
    seeds: [1, 7, 30], results: [],
    method: '4 型 × 2 個首手小盲位置 × 3 seeds；玩家選免費 CHECK 或 CALL。原引擎自然發牌及抽 BOSS 動作，逐動作與完全未呼叫 range 的同 seed 對照局比較。'}
};

function compareDistribution(actual, totals, denominator, target) {
  assert.equal(actual.status, 'ready');
  for (const row of actual.distribution) {
    const difference = Math.abs(row.probability - totals[row.category] / denominator);
    target.maximumAbsoluteDifference = Math.max(target.maximumAbsoluteDifference, difference);
    assert.ok(difference < tolerance, `category ${row.category}: difference ${difference}`);
  }
}

// 40 direct oracles + 2 finite-cap cases retain the original 42-check audit.
const uniformConfig = {deal: {player: {rerollChance: 0}, npc: {rerollChance: 0}}, boss: {mode: 'fixed'}};
for (const profile of profiles) for (const board of boards) for (const selected of [null, 'call']) {
  const event = {id: 'one', street: streetFor(board), board,
    actions: [{type: 'fold'}, {type: 'call'}, {type: 'raise'}], owed: 10, pot: 30,
    shownMode: 'partial', shown: [], selectedType: selected};
  const totals = Array(9).fill(0); let denominator = 0;
  for (let a = 0; a < available.length; a++) for (let b = a + 1; b < available.length; b++) {
    const hole = [available[a], available[b]];
    if (hole.some(card => board.includes(card))) continue;
    const weight = selected ? getBossProfileDistribution({holes: {npc: hole}, board,
      street: event.street, bossProfile: {id: profile}, currentBet: 10, streetBets: {npc: 0}}, event.actions)
      .find(action => action.type === selected).probability : 1;
    totals[evaluateBest([...hole, ...board]).category] += weight; denominator += weight;
  }
  const tracker = createBossHandRange({playerHole: player, smallBlind: 'player', bossProfileId: profile, config: uniformConfig});
  const result = tracker.update({board, evidence: selected ? [event] : []});
  compareDistribution(result, totals, denominator, report.directEnumeration);
  assert.deepEqual(tracker.update({board, evidence: selected ? [event, event] : []}), result);
  report.directEnumeration.cases++;
}
for (const smallBlind of ['player', 'npc']) {
  const tracker = createBossHandRange({playerHole: player, smallBlind, bossProfileId: 'caller',
    config: {boss: {mode: 'fixed'}, deal: {
      player: {rerollChance: 1, rerollMode: 'legacy-score', targetScore: 1, maxRerolls: 50},
      npc: {rerollChance: 1, rerollMode: 'legacy-score', targetScore: 1, maxRerolls: 50}
    }}});
  const result = tracker.update({board: boards[0]});
  for (const row of result.distribution) assert.ok(Number.isFinite(row.probability) && row.probability >= 0 && row.probability <= 1);
  report.finiteCapExtremes.cases++;
}
assert.equal(report.directEnumeration.cases + report.finiteCapExtremes.cases, 42);

const extremePlayers = [['Js', 'Th'], ['As', 'Kd'], ['2s', '3d']];
const extremeBoards = [
  ['2s', '2h', '2c', 'Kh', 'Qc'], ['3s', '3h', '3c', 'Kh', 'Qc'],
  ['4s', '5s', '6s', 'Jh', 'Qc'], ['As', 'Ks', 'Qs', '8h', '7c'], ['8s', '9s', 'Ts', '2h', '3c']
];
for (const playerHole of extremePlayers) for (const board of extremeBoards) {
  for (const targetScore of [.1, .2, .3, .4, .48, .55, .57, .6, .7, .9]) {
    if (board.some(card => playerHole.includes(card))) continue;
    const result = createBossHandRange({playerHole, smallBlind: 'player', bossProfileId: 'caller',
      config: {boss: {mode: 'fixed'}, deal: {npc: {rerollMode: 'legacy-score', rerollChance: 1, maxRerolls: 50, targetScore}}}})
      .update({board});
    assert.equal(result.status, 'ready');
    const bounds = report.legacyProbabilityBounds;
    for (const {probability} of result.distribution) {
      assert.ok(Number.isFinite(probability) && probability >= 0 && probability <= 1);
      bounds.minimumProbability = Math.min(bounds.minimumProbability, probability);
      bounds.maximumProbability = Math.max(bounds.maximumProbability, probability);
    }
    bounds.maximumSumError = Math.max(bounds.maximumSumError,
      Math.abs(result.distribution.reduce((sum, row) => sum + row.probability, 0) - 1));
    bounds.cases++;
  }
}
assert.equal(report.legacyProbabilityBounds.cases, 130);

const eligible = (hole, setting) => setting.rerollMode === 'legacy-score'
  ? holeScore(hole) < setting.targetScore : hole[0][0] !== hole[1][0];
function oraclePairProbability(hole, pool, setting) {
  let eligibleCount = 0, combinations = 0;
  for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) {
    combinations++; if (eligible([pool[i], pool[j]], setting)) eligibleCount++;
  }
  const continuation = eligibleCount / combinations * setting.rerollChance;
  const stop = eligible(hole, setting) ? 1 - setting.rerollChance : 1;
  let probability = 1 / combinations;
  for (let remaining = 0; remaining < setting.maxRerolls; remaining++) probability = stop / combinations + continuation * probability;
  return probability;
}
for (const legacy of [false, true]) {
  const deal = {
    player: legacy ? {rerollMode: 'legacy-score', targetScore: .7, rerollChance: .75, maxRerolls: 2}
      : {rerollMode: 'unpaired', rerollChance: .5, maxRerolls: 50},
    npc: legacy ? {rerollMode: 'legacy-score', targetScore: .6, rerollChance: .65, maxRerolls: 3}
      : {rerollMode: 'unpaired', rerollChance: .25, maxRerolls: 50}
  };
  const board = boards[0], totals = Array(9).fill(0), bossBase = new Map(); let denominator = 0;
  for (let i = 0; i < available.length; i++) for (let j = i + 1; j < available.length; j++) {
    const hole = [available[i], available[j]];
    if (hole.some(card => board.includes(card))) continue;
    const group = eligible(hole, deal.npc);
    if (!bossBase.has(group)) bossBase.set(group, oraclePairProbability(hole, deck, deal.npc));
    const weight = bossBase.get(group) * oraclePairProbability(player, deck.filter(card => !hole.includes(card)), deal.player);
    totals[evaluateBest([...hole, ...board]).category] += weight; denominator += weight;
  }
  const result = createBossHandRange({playerHole: player, smallBlind: 'npc', bossProfileId: 'caller', config: {boss: {mode: 'fixed'}, deal}}).update({board});
  compareDistribution(result, totals, denominator, report.reverseOrderOracle);
  report.reverseOrderOracle.cases++;
  const config = {boss: {mode: 'fixed'}, deal: {...deal, player: {...deal.player, manualProvided: true}}};
  const playerFirst = createBossHandRange({playerHole: player, smallBlind: 'player', bossProfileId: 'caller', config}).update({board});
  const bossFirst = createBossHandRange({playerHole: player, smallBlind: 'npc', bossProfileId: 'caller', config}).update({board});
  assert.deepEqual(playerFirst, bossFirst); report.manualPlayerReservation.cases++;
}

const natural = report.naturalEngineIsolation;
function exactEngineMatch(hand, control) {
  assert.equal(JSON.stringify(hand), JSON.stringify(control), 'range must not change any serialized hand/session field');
  assert.equal(hand.rng.state(), control.rng.state(), 'range must not consume the game RNG');
  const cards = [...hand.holes.player, ...hand.holes.npc, ...hand.board, ...hand.deck];
  assert.equal(cards.length, 52); assert.equal(new Set(cards).size, 52);
  assert.ok([0, 3, 4, 5].includes(hand.board.length));
}
for (const profileId of profiles) for (const smallBlind of ['player', 'npc']) for (const seed of natural.seeds) {
  const config = {boss: {mode: 'fixed', profileId}};
  const hand = startHand(createSession(config, seed, {firstSmallBlind: smallBlind}));
  const control = startHand(createSession(config, seed, {firstSmallBlind: smallBlind}));
  const tracker = createBossHandRange(bossRangeContext({playerHole: hand.holes.player, smallBlind,
    bossProfileId: profileId, config: hand.config}));
  const evidence = new Map(); let actions = 0, posteriorChecks = 0, minimumTrueProbability = 1;
  function inspect() {
    const before = JSON.stringify(hand), rng = hand.rng.state();
    const result = tracker.update({board: [...hand.board], evidence: [...evidence.values()]});
    assert.equal(JSON.stringify(hand), before); assert.equal(hand.rng.state(), rng);
    exactEngineMatch(hand, control); natural.rangeUpdates++;
    if (hand.board.length >= 3) {
      assert.equal(result.status, 'ready', `${profileId}/${smallBlind}/${seed}`);
      // Truth is used only by this test oracle, never passed into the estimator.
      const trueCategory = evaluateBest([...hand.holes.npc, ...hand.board]).category;
      const probability = result.distribution.find(row => row.category === trueCategory).probability;
      assert.ok(probability > 0, 'the real natural hand must remain in posterior support');
      minimumTrueProbability = Math.min(minimumTrueProbability, probability);
      natural.minimumTrueCategoryProbability = Math.min(natural.minimumTrueCategoryProbability, probability);
      const sumError = Math.abs(result.distribution.reduce((sum, row) => sum + row.probability, 0) - 1);
      natural.maximumDistributionSumError = Math.max(natural.maximumDistributionSumError, sumError);
      assert.ok(sumError < tolerance); posteriorChecks++; natural.posteriorChecks++;
    }
  }
  inspect();
  while (hand.status === 'playing') {
    assert.ok(actions < 30);
    if (hand.actor === 'player') {
      for (const action of legalActions(hand)) {
        const distribution = previewResponse(hand, action.type).distribution;
        if (!distribution.length) continue;
        const id = `preview:${hand.history.length}:${action.type}`;
        evidence.set(id, publicBossEvidence({id, street: hand.street, board: hand.board, distribution,
          owed: Math.max(0, Math.max(hand.currentBet, action.to || 0) - hand.streetBets.npc),
          pot: Math.round((hand.pot + action.amount) * 1e6) / 1e6, shownMode: 'badges'}));
      }
      inspect();
      const action = legalActions(hand).find(item => item.type === 'check' || item.type === 'call');
      assert.ok(action); applyAction(hand, action.type); applyAction(control, action.type);
    } else {
      const distribution = getActionDistribution(hand), id = `action:${hand.history.length}`;
      const event = publicBossEvidence({id, street: hand.street, board: hand.board, distribution,
        owed: Math.max(0, hand.currentBet - hand.streetBets.npc), pot: hand.pot, shownMode: 'all'});
      evidence.set(id, event); inspect();
      const selected = stepNpc(hand), baseline = stepNpc(control);
      assert.deepEqual(selected, baseline);
      evidence.set(id, {...event, selectedType: selected.selected.type});
    }
    actions++; natural.actions++; inspect();
  }
  const result = hand.result;
  const accountError = Math.abs(hand.stacks.player + hand.stacks.npc + result.fee
    - hand.stacksBefore.player - hand.stacksBefore.npc - result.player.jackpotAward);
  assert.ok(accountError < 1e-6, `accounting conservation error ${accountError}`);
  natural.results.push({profileId, smallBlind, seed, actions, posteriorChecks, minimumTrueCategoryProbability: minimumTrueProbability,
    endingStreet: hand.street, result: result.reason, winner: result.winner, board: hand.board,
    playerClosing: hand.stacks.player, bossClosing: hand.stacks.npc, fee: result.fee,
    jackpotAward: result.player.jackpotAward, accountingError: accountError, rngState: hand.rng.state()});
  natural.hands++;
}
assert.equal(natural.hands, 24);
report.status = 'passed';
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({status: report.status, output: fileURLToPath(output),
  originalOracleChecks: report.directEnumeration.cases + report.finiteCapExtremes.cases,
  legacyBoundsChecks: report.legacyProbabilityBounds.cases,
  reverseOrderAndManualChecks: report.reverseOrderOracle.cases + report.manualPlayerReservation.cases,
  maximumOracleDifference: Math.max(report.directEnumeration.maximumAbsoluteDifference, report.reverseOrderOracle.maximumAbsoluteDifference),
  naturalHands: natural.hands, naturalActions: natural.actions, posteriorChecks: natural.posteriorChecks,
  minimumTrueCategoryProbability: natural.minimumTrueCategoryProbability}));
