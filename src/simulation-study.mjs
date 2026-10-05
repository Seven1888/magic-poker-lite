import {normalizeConfig, createSession, playAutomatedHand, syncOpponentBankroll} from './engine.mjs?v=35';
import {BOSS_PROFILE_IDS} from './boss-profiles.mjs?v=35';

const SEATS = ['player', 'npc'];
const STREETS = ['preflop', 'flop', 'turn', 'river'];
const ACTIONS = ['fold', 'check', 'call', 'bet', 'raise'];
const MONEY = ['wagers', 'refunds', 'grossReturns', 'netReturns', 'jackpotAwards', 'totalReturns', 'fees', 'playerFees'];
const COUNTS = ['hands', 'wins', 'losses', 'ties', 'folds', 'npcFolds', 'showdowns', 'showdownWins', 'showdownTies', 'netWinningHands', 'totalActions'];
const round = value => Math.round((value + Number.EPSILON) * 1e6) / 1e6;
const tiers = () => ({royal: 0, straightFlush: 0, quads: 0});
const summary = () => ({...Object.fromEntries([...MONEY, ...COUNTS].map(key => [key, 0])), tierCounts: tiers()});
const ratio = (numerator, denominator) => denominator > 0 ? numerator / denominator : 0;

function positiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${name} 必須是正整數。`);
  return value;
}

/** Stable independent streams: changing the requested player count cannot change earlier players. */
export function studyPlayerSeed(seed, playerIndex) {
  let hash = 2166136261;
  for (const char of `${typeof seed}:${String(seed)}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  // Multiplication by odd constants and xor-shifts are bijective over uint32.
  let value = (hash + Math.imul(playerIndex + 1, 0x9e3779b9)) >>> 0;
  value = Math.imul(value ^ value >>> 16, 0x85ebca6b) >>> 0;
  value = Math.imul(value ^ value >>> 13, 0xc2b2ae35) >>> 0;
  return (value ^ value >>> 16) >>> 0;
}

/** Centered sufficient statistics avoid storing every hand or subtracting huge raw squares. */
function moments() {
  return {n: 0, meanX: 0, meanBase: 0, meanTotal: 0, xx: 0, baseYY: 0, totalYY: 0, baseXY: 0, totalXY: 0};
}
function observe(stats, x, base, total) {
  stats.n++;
  const dx = x - stats.meanX, db = base - stats.meanBase, dt = total - stats.meanTotal;
  stats.meanX += dx / stats.n; stats.meanBase += db / stats.n; stats.meanTotal += dt / stats.n;
  stats.xx += dx * (x - stats.meanX);
  stats.baseYY += db * (base - stats.meanBase); stats.totalYY += dt * (total - stats.meanTotal);
  stats.baseXY += dx * (base - stats.meanBase); stats.totalXY += dx * (total - stats.meanTotal);
}
function uncertainty(stats, estimate, wager, kind) {
  if (stats.n < 2 || wager <= 0) return {standardError: null, ci95: [null, null]};
  const residual = Math.max(0, stats[`${kind}YY`] - 2 * estimate * stats[`${kind}XY`] + estimate ** 2 * stats.xx);
  const standardError = Math.sqrt(stats.n / (stats.n - 1) * residual) / wager;
  return {standardError, ci95: [estimate - 1.96 * standardError, estimate + 1.96 * standardError]};
}

function collect(target, hand) {
  const result = hand.result, player = result.player;
  target.hands++;
  target.wagers += player.matchedWager; target.refunds += player.refund;
  target.grossReturns += player.gross; target.netReturns += player.netReturn;
  target.jackpotAwards += player.jackpotAward; target.totalReturns += player.totalReturn;
  target.fees += result.fee; target.playerFees += player.fee;
  target.wins += Number(result.winner === 'player'); target.losses += Number(result.winner === 'npc');
  target.ties += Number(result.winner === 'tie'); target.folds += Number(result.folded === 'player');
  target.npcFolds += Number(result.folded === 'npc'); target.showdowns += Number(result.reason === 'showdown');
  target.showdownWins += Number(result.reason === 'showdown' && result.winner === 'player');
  target.showdownTies += Number(result.reason === 'showdown' && result.winner === 'tie');
  target.netWinningHands += Number(player.profit > 0);
  target.totalActions += hand.history.filter(event => ACTIONS.includes(event.type)).length;
  if (result.jackpot) target.tierCounts[result.jackpot.tier]++;
}
function finishSummary(target) {
  target.baseRtp = ratio(target.netReturns, target.wagers);
  target.totalRtp = ratio(target.totalReturns, target.wagers);
  target.grossRtp = ratio(target.grossReturns, target.wagers);
  target.rtp = target.totalRtp;
  target.profit = round(target.totalReturns - target.wagers);
  target.jackpotHits = Object.values(target.tierCounts).reduce((sum, value) => sum + value, 0);
  target.jackpotHitRate = ratio(target.jackpotHits, target.hands);
  target.jackpotShowdownHitRate = ratio(target.jackpotHits, target.showdowns);
  for (const key of MONEY) target[key] = round(target[key]);
  return target;
}

function newActionStats() {
  return Object.fromEntries(STREETS.map(street => [street, Object.fromEntries(SEATS.map(seat => [seat,
    Object.fromEntries(ACTIONS.map(action => [action, {count: 0, amount: 0, hands: 0, handWins: 0, handLosses: 0, handTies: 0, handNetWins: 0}]))
  ]))]));
}
function collectActions(stats, hand) {
  const seen = new Set(), result = hand.result;
  for (const event of hand.history) {
    if (!ACTIONS.includes(event.type)) continue;
    const cell = stats[event.street][event.actor][event.type], key = `${event.street}/${event.actor}/${event.type}`;
    cell.count++; cell.amount += event.amount;
    if (seen.has(key)) continue;
    seen.add(key); cell.hands++;
    // Outcomes always describe the study's player, including rows containing NPC actions.
    cell.handWins += Number(result.winner === 'player'); cell.handLosses += Number(result.winner === 'npc');
    cell.handTies += Number(result.winner === 'tie'); cell.handNetWins += Number(result.player.profit > 0);
  }
}
function newDealAudit() {
  return Object.fromEntries(SEATS.map(seat => [seat, {hands: 0, manualHands: 0, totalRerolls: 0, rerolledHands: 0,
    totalAttempts: 0, initialClasses: {}, finalClasses: {}, stopReasons: {}, modes: {}}]));
}
function collectAudit(stats, hand) {
  const increment = (target, key) => { if (key !== undefined && key !== null) target[key] = (target[key] || 0) + 1; };
  for (const seat of SEATS) {
    const audit = hand.dealAudit?.[seat];
    if (!audit) continue;
    const target = stats[seat]; target.hands++; target.manualHands += Number(audit.manual);
    target.totalRerolls += audit.rerolls || 0; target.rerolledHands += Number(audit.rerolls > 0);
    target.totalAttempts += audit.attempts || 0;
    increment(target.initialClasses, audit.initialClass); increment(target.finalClasses, audit.finalClass);
    increment(target.stopReasons, audit.stopReason); increment(target.modes, audit.rerollMode);
  }
}
function returnBuckets() {
  return [ ['zero', '0 倍'], ['below-one', '大於 0、未滿 1 倍'], ['one', '1 倍'],
    ['one-to-two', '大於 1、未滿 2 倍'], ['two-to-five', '2 至未滿 5 倍'], ['five-plus', '5 倍以上'] ]
    .map(([key, label]) => ({key, label, hands: 0}));
}
function collectReturn(buckets, player) {
  const value = ratio(player.totalReturn, player.matchedWager);
  const index = value === 0 ? 0 : Math.abs(value - 1) < 1e-10 ? 2 : value < 1 ? 1 : value < 2 ? 3 : value < 5 ? 4 : 5;
  buckets[index].hands++;
}

/** Uses the shared engine only; no alternate dealing, strategy oracle, or settlement. */
export function simulateStudy(config = {}, {
  players = 1, entries = 1000, seed = 20261005, policy = 'balanced', mode = 'independent', sliceSize = 250,
  targetAsset, maxHandsPerPlayer = 10000, onProgress
} = {}) {
  positiveInteger(players, '玩家數'); positiveInteger(entries, '每位玩家手數'); positiveInteger(sliceSize, '切片手數');
  positiveInteger(maxHandsPerPlayer, '每位玩家安全手數上限');
  if (players > 0xffffffff) throw new RangeError('玩家數超過獨立種子範圍。');
  if (!['independent', 'continuous', 'cashout'].includes(mode)) throw new TypeError('未知模擬模式。');
  if (!['balanced', 'call', 'aggressive', 'tight'].includes(policy)) throw new TypeError('未知玩家策略。');
  if (!(typeof seed === 'string' || typeof seed === 'number' && Number.isFinite(seed))) throw new TypeError('種子須為文字或有限數字。');
  const normalized = normalizeConfig(config), handLimit = mode === 'cashout' ? maxHandsPerPlayer : entries;
  const totalBudget = players * handLimit;
  if (!Number.isSafeInteger(totalBudget)) throw new RangeError('模擬手數超過安全整數範圍。');
  const target = targetAsset === undefined ? round(normalized.buyIn * 2) : targetAsset;
  if (mode === 'cashout' && (!Number.isFinite(target) || target <= 0)) throw new RangeError('目標資產必須是有限正數。');
  const independent = mode === 'independent';
  const clustered = !independent || normalized.boss.mode === 'rotate';
  const encounterCounts = () => Object.fromEntries([...BOSS_PROFILE_IDS, 'legacy'].map(id => [id, 0]));
  const result = {...summary(), ruleSet: 'heads-up-two-blinds-v1', studyVersion: 1, mode, players, entries,
    seed, policy, config: normalized, sliceSize, targetAsset: mode === 'cashout' ? target : null, maxHandsPerPlayer,
    playerResults: [], playerSummary: {completed: 0, target: 0, insufficient: 0, censored: 0},
    byBlind: {small: summary(), big: summary()}, actionStats: newActionStats(), dealAudit: newDealAudit(),
    byBoss: Object.fromEntries([...BOSS_PROFILE_IDS, 'legacy'].map(id => [id, summary()])),
    bossEncounterAudit: {mode: normalized.boss.mode, counts: encounterCounts(), firstSelections: 0, checkedTransitions: 0,
      consecutiveRepeats: 0, unexpectedRepeats: 0, selectionProbabilityCounts: {}},
    streetReach: Object.fromEntries(STREETS.map(street => [street, {hands: 0, wins: 0, losses: 0, ties: 0, netWinningHands: 0}])),
    returnDistribution: returnBuckets(), batches: [], conservationError: 0, npcRefreshCount: 0,
    npcRefreshAdjustment: 0, npcRefreshAdded: 0, npcRefreshRemoved: 0,
    methodMeta: {mode, ciUnit: clustered ? 'player' : 'hand', ciSamples: 0,
      bossSelection: normalized.boss.mode === 'rotate' ? '每位玩家首手四型各 1/4，之後排除上一型、其餘各 1/3；重設資產也不重設對手序列。' : normalized.boss.mode === 'fixed' ? '研究固定指定 BOSS，刻意允許連續相同。' : '採用舊版對手權重模型。',
      seedDerivation: '每位玩家由主種子及零起算索引固定派生獨立亂數流；增加玩家數不改變既有玩家。',
      initialBlind: independent ? '每位玩家首手固定小盲，之後逐手輪替。' : '每位玩家入桌先抽一次盲位，之後逐手輪替。',
      bankroll: independent ? '每手雙方重設相同帶入；end 僅為最後一手結束餘額，不能當作連續資產。' : '同桌連續保留玩家餘額；每手結束包含最後一手，對手資產匹配玩家，調整另列且不計派彩。',
      insufficientThreshold: 0.01, minimumEntryOnly: true,
      stopRule: mode === 'cashout' ? '達到目標、可用資產低於 0.01 或安全手數上限；截尾另列，不能算達標或失敗。' : independent ? '每位玩家完成指定獨立手數。' : '完成指定手數或同桌可用資產低於 0.01；低於最低帶入仍可繼續短籌碼牌局。',
      actionOutcomeUnit: 'count 是動作次數；hands 與結果欄是含該街／座位／動作的手數，同手只計一次，勝負均指玩家。',
      returnDenominator: '單手倍數＝含 JP 總返還／有效投入；退款不進分子或分母。',
      uncertainty: !clustered ? '以獨立牌局充分統計量計算比值的 95% 常態近似區間。' : `以每位玩家整段分子／分母聚類，計算比值的 95% 常態近似區間；少於兩位玩家不報區間。${independent ? '雖然每手重設資產，BOSS 不連續重複會產生跨手相關，因此仍須按玩家聚類。' : ''}`,
      limitation: '不是後端玩家帳本或 RTP 認證；零次稀有 JP 不代表機率為零，少量樣本不能證明尾部已收斂。'},
  };
  result.method = [result.methodMeta.bankroll, result.methodMeta.stopRule, result.methodMeta.uncertainty, result.methodMeta.limitation].join(' ');
  const stats = moments();
  let batch = summary(), completedPlayers = 0;
  const progress = () => onProgress?.({completed: result.hands, total: totalBudget, completedHands: result.hands,
    totalHands: totalBudget, completedPlayers, totalPlayers: players, totalIsUpperBound: mode !== 'independent', mode});
  function flushBatch() {
    if (!batch.hands) return;
    result.batches.push({...finishSummary(batch), index: result.batches.length + 1,
      cumulativeHands: result.hands, cumulativeWagers: round(result.wagers), cumulativeNetReturns: round(result.netReturns),
      cumulativeTotalReturns: round(result.totalReturns), cumulativeJackpotAwards: round(result.jackpotAwards),
      cumulativeBaseRtp: ratio(result.netReturns, result.wagers), cumulativeRtp: ratio(result.totalReturns, result.wagers),
      cumulativeTotalRtp: ratio(result.totalReturns, result.wagers)});
    batch = summary();
  }
  for (let playerIndex = 0; playerIndex < players; playerIndex++) {
    const playerSeed = studyPlayerSeed(seed, playerIndex);
    const session = createSession(normalized, playerSeed, {firstSmallBlind: independent ? 'player' : 'random'});
    const player = {...summary(), playerIndex, seed: playerSeed, start: normalized.buyIn, end: normalized.buyIn,
      endMeaning: independent ? 'last-independent-hand' : 'continuous-balance', status: 'completed',
      reachedTarget: false, insufficient: false, censored: false, npcRefreshCount: 0,
      bossProfileSequence: [], bossEncounterCounts: encounterCounts(), bossConsecutiveRepeats: 0,
      npcRefreshAdjustment: 0, npcRefreshAdded: 0, npcRefreshRemoved: 0};
    const terminal = () => {
      if (mode === 'cashout' && session.stacks.player >= target) return 'target';
      if (!independent && SEATS.some(seat => session.stacks[seat] < 0.01)) return 'insufficient';
      return null;
    };
    let status = terminal();
    while (!status && player.hands < handLimit) {
      if (independent) session.stacks = {player: normalized.buyIn, npc: normalized.buyIn};
      const hand = playAutomatedHand(session, policy), settled = hand.result, p = settled.player;
      const bossId = hand.bossProfile?.id ?? 'legacy';
      const priorBoss = player.bossProfileSequence.at(-1), repeated = priorBoss === bossId;
      player.bossProfileSequence.push(bossId); player.bossEncounterCounts[bossId]++;
      player.bossConsecutiveRepeats += Number(repeated);
      const encounters = result.bossEncounterAudit;
      encounters.counts[bossId]++; encounters.firstSelections += Number(priorBoss === undefined);
      encounters.checkedTransitions += Number(priorBoss !== undefined); encounters.consecutiveRepeats += Number(repeated);
      encounters.unexpectedRepeats += Number(repeated && normalized.boss.mode === 'rotate');
      const probabilityKey = String(hand.bossSelection.probability);
      encounters.selectionProbabilityCounts[probabilityKey] = (encounters.selectionProbabilityCounts[probabilityKey] || 0) + 1;
      for (const targetSummary of [result, player, batch, result.byBlind[hand.smallBlind === 'player' ? 'small' : 'big'], result.byBoss[bossId]]) collect(targetSummary, hand);
      collectActions(result.actionStats, hand); collectAudit(result.dealAudit, hand); collectReturn(result.returnDistribution, p);
      for (const street of STREETS.slice(0, STREETS.indexOf(hand.street) + 1)) {
        const reached = result.streetReach[street]; reached.hands++;
        reached.wins += Number(settled.winner === 'player'); reached.losses += Number(settled.winner === 'npc');
        reached.ties += Number(settled.winner === 'tie'); reached.netWinningHands += Number(p.profit > 0);
      }
      result.conservationError = Math.max(result.conservationError,
        Math.abs(p.stackAfter + settled.npc.stackAfter + settled.fee - p.stackBefore - settled.npc.stackBefore - p.jackpotAward));
      if (!clustered) observe(stats, p.matchedWager, p.netReturn, p.totalReturn);
      if (!independent) {
        const refresh = syncOpponentBankroll(session);
        for (const targetSummary of [result, player]) {
          targetSummary.npcRefreshCount++; targetSummary.npcRefreshAdjustment += refresh.adjustment;
          targetSummary.npcRefreshAdded += Math.max(0, refresh.adjustment);
          targetSummary.npcRefreshRemoved += Math.max(0, -refresh.adjustment);
        }
      }
      player.end = session.stacks.player;
      status = terminal();
      if (batch.hands >= sliceSize) { flushBatch(); progress(); }
    }
    player.status = status || (mode === 'cashout' ? 'censored' : 'completed');
    player.reachedTarget = player.status === 'target'; player.insufficient = player.status === 'insufficient';
    player.censored = player.status === 'censored';
    result.playerSummary[player.status]++;
    if (clustered) observe(stats, player.wagers, player.netReturns, player.totalReturns);
    for (const key of ['npcRefreshAdjustment', 'npcRefreshAdded', 'npcRefreshRemoved']) player[key] = round(player[key]);
    result.playerResults.push(finishSummary(player)); completedPlayers++; progress();
  }
  flushBatch();
  result.methodMeta.ciSamples = stats.n;
  const baseEstimate = ratio(result.netReturns, result.wagers), totalEstimate = ratio(result.totalReturns, result.wagers);
  const base = uncertainty(stats, baseEstimate, result.wagers, 'base'), total = uncertainty(stats, totalEstimate, result.wagers, 'total');
  result.baseStandardError = base.standardError; result.baseCi95 = base.ci95;
  result.standardError = total.standardError; result.ci95 = total.ci95;
  for (const blind of Object.values(result.byBlind)) finishSummary(blind);
  for (const boss of Object.values(result.byBoss)) finishSummary(boss);
  for (const street of Object.values(result.actionStats)) for (const seat of Object.values(street)) for (const cell of Object.values(seat)) cell.amount = round(cell.amount);
  for (const key of ['npcRefreshAdjustment', 'npcRefreshAdded', 'npcRefreshRemoved']) result[key] = round(result[key]);
  return finishSummary(result);
}
