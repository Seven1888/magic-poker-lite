import {normalizeConfig, createSession, playAutomatedHand, syncOpponentBankroll, beginNewTable} from './engine.mjs?v=59';
import {BOSS_PROFILE_IDS} from './boss-profiles.mjs?v=59';
import {handEntryStatus} from './hand-entry.mjs?v=59';
import {BOSS_PROFILE_VERSION} from './boss-profiles.mjs?v=59';
import {createPoolStudySummary, collectPoolStudyAudit, finishPoolStudySummary, combinePoolStudySummaries} from './probability-pools.mjs?v=59';

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
  targetAsset, maxHandsPerPlayer = 10000, unlimitedBankroll = false, onProgress
} = {}) {
  positiveInteger(players, '玩家數'); positiveInteger(entries, '每位玩家手數'); positiveInteger(sliceSize, '切片手數');
  if (typeof unlimitedBankroll !== 'boolean') throw new TypeError('無限資產設定必須為布林值。');
  if (!unlimitedBankroll) positiveInteger(maxHandsPerPlayer, '每位玩家安全手數上限');
  if (players > 0xffffffff) throw new RangeError('玩家數超過獨立種子範圍。');
  if (!['independent', 'continuous', 'cashout'].includes(mode)) throw new TypeError('未知模擬模式。');
  if (unlimitedBankroll && mode !== 'continuous') throw new TypeError('無限資產研究須使用連續遊玩。');
  if (!['balanced', 'call', 'aggressive', 'tight'].includes(policy)) throw new TypeError('未知玩家策略。');
  if (!(typeof seed === 'string' || typeof seed === 'number' && Number.isFinite(seed))) throw new TypeError('種子須為文字或有限數字。');
  const normalized = normalizeConfig(config), handLimit = mode === 'cashout' ? maxHandsPerPlayer : entries;
  const holdem = ['fixed-holdem','pooled-holdem'].includes(normalized.outcome?.mode);
  // 歷史限次模型仍以有限單手額度代替 Infinity；現行德州只在入桌時
  // 帶入 100 小盲，續手保留真實桌籌碼，不藉無限外部錢包抹平 ALL IN。
  const handBankroll = holdem ? round(normalized.smallBlind * 100) : unlimitedBankroll
    ? round(Math.max(normalized.minBuyIn, normalized.bigBlind + 2 * Object.values(normalized.betSize).reduce((sum, value) => sum + value, 0)) + normalized.bigBlind)
    : normalized.buyIn;
  if (unlimitedBankroll && !Number.isSafeInteger(Math.round(handBankroll * 1e6))) throw new RangeError('單手下注額度超過可精確計算範圍。');
  const totalBudget = players * handLimit;
  if (!Number.isSafeInteger(totalBudget)) throw new RangeError('模擬手數超過安全整數範圍。');
  const target = targetAsset === undefined ? round(normalized.buyIn * 2) : targetAsset;
  if (mode === 'cashout' && (!Number.isFinite(target) || target <= 0)) throw new RangeError('目標資產必須是有限正數。');
  const independent = mode === 'independent';
  const pooled = ['prebuilt-pools','pooled-holdem'].includes(normalized.outcome?.mode);
  const clustered = pooled || !independent || normalized.boss.mode === 'rotate';
  const encounterCounts = () => Object.fromEntries([...BOSS_PROFILE_IDS, 'legacy'].map(id => [id, 0]));
  const result = {...summary(), ruleSet: holdem ? 'heads-up-no-limit-v1' : 'heads-up-two-blinds-v1', studyVersion: 4,
    modelVersion: `${normalized.outcome.mode==='pooled-holdem'?'pooled-holdem-v1':holdem?'fixed-holdem-v1':pooled?'prebuilt-pools-v2-full-pot':'legacy-deck-v1'}+${BOSS_PROFILE_VERSION}+study-v4`,
    outcomeModel: normalized.outcome.mode, bossProfileVersion: BOSS_PROFILE_VERSION, mode, players, entries,
    seed, policy, config: normalized, sliceSize, unlimitedBankroll,
    targetAsset: mode === 'cashout' ? target : null, maxHandsPerPlayer: unlimitedBankroll ? null : maxHandsPerPlayer,
    playerResults: [], playerSummary: {completed: 0, target: 0, insufficient: 0, censored: 0},
    byBlind: {small: summary(), big: summary()}, actionStats: newActionStats(), actionSizeStats: [], bossStrengthStats: [], dealAudit: newDealAudit(),
    byBoss: Object.fromEntries([...BOSS_PROFILE_IDS, 'legacy'].map(id => [id, summary()])),
    bossEncounterAudit: {mode: normalized.boss.mode, counts: encounterCounts(), firstSelections: 0, checkedTransitions: 0,
      consecutiveRepeats: 0, unexpectedRepeats: 0, selectionProbabilityCounts: {}},
    streetReach: Object.fromEntries(STREETS.map(street => [street, {hands: 0, wins: 0, losses: 0, ties: 0, netWinningHands: 0}])),
    returnDistribution: returnBuckets(), batches: [], conservationError: 0, npcRefreshCount: 0,
    npcRefreshAdjustment: 0, npcRefreshAdded: 0, npcRefreshRemoved: 0,
    tableEntries: 0, tableBuyIns: 0,
    methodMeta: {mode, ciUnit: clustered ? 'player' : 'hand', ciSamples: 0,
      bossSelection: normalized.boss.mode === 'random' ? `每手從 ${BOSS_PROFILE_IDS.length} 型 BOSS 獨立等機率選取，允許連續遇到同型。` : normalized.boss.mode === 'rotate' ? `每位玩家首手 ${BOSS_PROFILE_IDS.length} 型等機率，之後排除上一型；換桌不重設對手序列。` : normalized.boss.mode === 'fixed' ? '研究固定指定 BOSS，刻意允許連續相同。' : '採用歷史對手權重模型。',
      seedDerivation: '每位玩家由主種子及零起算索引固定派生獨立亂數流；增加玩家數不改變既有玩家。',
      blindMode: holdem || independent ? 'alternating' : 'random-each-hand',
      initialBlind: independent ? '每位玩家首手固定小盲，之後逐手輪替。' : holdem ? '每桌首手隨機抽小盲／大盲，同桌之後交替盲位；桌籌碼歸零再帶入時重新抽新桌首盲，保留原亂數流、水池及 CD。' : '每位玩家入桌首手及每次下一手均以 50/50 重新抽盲位，允許連續同盲位。',
      bankroll: holdem && unlimitedBankroll ? '外部研究錢包無限，每次入桌帶入 100 小盲（50 大盲）。桌籌碼逐手真實增減，歸零才重新帶入；每手對手匹配目前桌籌碼。帶入不是賭注，不計入 RTP。' : unlimitedBankroll ? '連續遊玩，雙方研究資產無限；保留同一玩家的亂數流、BOSS 輪替、雙池與 CD，淨利按實際投入及返還累計。' : independent ? '每手只重設雙方相同帶入；同一玩家的水池與冷卻跨手保留。end 僅為最後一手結束餘額，不能當作連續資產。' : '同桌連續保留玩家餘額、水池與冷卻；每手結束包含最後一手，對手資產匹配玩家，調整另列且不計派彩。',
      outcomeModel: normalized.outcome.mode,
      outcomeSampling: normalized.outcome.mode === 'pooled-holdem' ? '開局鎖定玩家牌、公牌序及對手兩組候選暗牌；玩家實際付費時依 RTP 計分係數、付費池與 CD 決定目標，可切換對手暗牌。BOSS 本街強弱分類沿用該街鎖定結果。' : pooled ? '開局預建全部目標及合法分支，操作讀取已存結果。' : '本手自然牌序固定，依實際牌型結算。',
      poolContinuity: pooled ? '每位玩家開始時建立自己的初始三桶，之後所有研究模式均跨手保留；independent 只重設資產。玩家之間不共用水池。' : holdem ? '固定手牌與公共牌序依真實牌型結算，沒有結果水池。' : '歷史牌庫模式，沒有跨手結果水池。',
      insufficientThreshold: unlimitedBankroll ? null : holdem ? 0 : normalized.minBuyIn, minimumEntryOnly: false,
      entryMinimumMultiplier: normalized.minBuyIn / normalized.bigBlind,
      stopRule: unlimitedBankroll ? '每位玩家完成指定手數，沒有資產達標、資產不足或額外安全手數停止條件。' : holdem && !independent ? '完成指定手數或玩家桌籌碼歸零才停止；低於初次帶入仍可續手，對手於每手開始匹配玩家桌籌碼。' : mode === 'cashout' ? '達到目標優先停止；否則任一方資產不足目前 BET 的每手開局門檻即停止，不自動降低 BET。安全手數上限列為截尾。' : independent ? '每位玩家完成指定獨立手數；每手重設資產並符合目前 BET 的開局門檻。' : '完成指定手數或任一方資產不足目前 BET 的每手開局門檻即停止，不自動降低 BET；已開始的牌局正常完成。',
      actionOutcomeUnit: 'count 是動作次數；hands 與結果欄是含該街／座位／動作的手數，同手只計一次，勝負均指玩家。',
      returnDenominator: normalized.outcome.mode === 'pooled-holdem' ? '單手倍數＝底池返還／有效投入；退款不進分子或分母。' : '單手倍數＝含 JP 總返還／有效投入；退款不進分子或分母。',
      uncertainty: !clustered ? '以獨立牌局充分統計量計算比值的 95% 常態近似區間。' : `以每位玩家整段分子／分母聚類，計算比值的 95% 常態近似區間；少於兩位玩家不報區間。${pooled ? '水池與冷卻跨手相依，即使 independent 或固定 BOSS 也不能按單手當獨立樣本。' : independent ? '雖然每手重設資產，BOSS 不連續重複會產生跨手相關，因此仍須按玩家聚類。' : ''}`,
      limitation: normalized.outcome.mode === 'pooled-holdem' ? '不是後端玩家帳本或 RTP 認證；少量樣本不能證明模型已收斂。' : '不是後端玩家帳本或 RTP 認證；零次稀有 JP 不代表機率為零，少量樣本不能證明尾部已收斂。'},
  };
  result.method = [result.methodMeta.bankroll, result.methodMeta.stopRule, result.methodMeta.uncertainty, result.methodMeta.limitation].join(' ');
  const stats = moments(), actionSizes = new Map(), bossStrengths = new Map();
  let batch = summary(), completedPlayers = 0;
  const progress = () => onProgress?.({completed: result.hands, total: totalBudget, completedHands: result.hands,
    totalHands: totalBudget, completedPlayers, totalPlayers: players, totalIsUpperBound: !unlimitedBankroll && mode !== 'independent', mode});
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
    const player = {...summary(), playerIndex, seed: playerSeed, start: unlimitedBankroll ? null : normalized.buyIn, end: unlimitedBankroll ? null : normalized.buyIn,
      outcomePoolSummary: pooled ? createPoolStudySummary(session.outcomePools, {bucketPolicy:normalized.outcome.mode==='pooled-holdem'?'blind-ranges':'exact-stakes'}) : null,
      endMeaning: unlimitedBankroll ? 'unlimited-bankroll' : independent ? 'last-independent-hand' : 'continuous-balance', status: 'completed',
      reachedTarget: false, insufficient: false, censored: false, npcRefreshCount: 0,
      bossProfileSequence: [], bossEncounterCounts: encounterCounts(), bossConsecutiveRepeats: 0,
      npcRefreshAdjustment: 0, npcRefreshAdded: 0, npcRefreshRemoved: 0};
    player.tableEntries = 0; player.tableBuyIns = 0;
    if (holdem && unlimitedBankroll) session.stacks = {player: 0, npc: 0};
    else if (holdem && !independent) {
      player.tableEntries = 1; player.tableBuyIns = session.stacks.player;
      result.tableEntries++; result.tableBuyIns += session.stacks.player;
    }
    const terminal = () => {
      if (unlimitedBankroll) return null;
      if (mode === 'cashout' && session.stacks.player >= target) return 'target';
      if (!independent && !handEntryStatus(session).canStart) return 'insufficient';
      return null;
    };
    let status = terminal();
    while (!status && player.hands < handLimit) {
      if (independent || unlimitedBankroll && !holdem || holdem && unlimitedBankroll && session.stacks.player <= 0) {
        if (holdem && unlimitedBankroll && player.tableEntries > 0) beginNewTable(session, {buyIn: handBankroll});
        else session.stacks = {player: handBankroll, npc: handBankroll};
        if (holdem) {
          player.tableEntries++; player.tableBuyIns += handBankroll;
          result.tableEntries++; result.tableBuyIns += handBankroll;
        }
      }
      const hand = playAutomatedHand(session, policy), settled = hand.result, p = settled.player;
      if (pooled) collectPoolStudyAudit(player.outcomePoolSummary, settled.outcomePoolAudit);
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
      for (const event of hand.history) {
        if (!event.sizeKeys?.length) continue;
        const key = `${event.street}/${event.actor}/${event.type}/${event.sizeKeys.join('+')}`;
        if (!actionSizes.has(key)) actionSizes.set(key, {street: event.street, actor: event.actor, type: event.type,
          sizeKey: event.sizeKey, sizeKeys: [...event.sizeKeys], count: 0, amount: 0, allIns: 0});
        const row = actionSizes.get(key); row.count++; row.amount += event.amount; row.allIns += Number(event.allIn);
      }
      for (const [street, state] of Object.entries(hand.bossStreetStates || {})) {
        const key = `${bossId}/${street}/${state.band}`;
        if (!bossStrengths.has(key)) bossStrengths.set(key, {bossProfileId: bossId, street, band: state.band, hands: 0});
        bossStrengths.get(key).hands++;
      }
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
        for (const targetSummary of refresh ? [result, player] : []) {
          targetSummary.npcRefreshCount++; targetSummary.npcRefreshAdjustment += refresh.adjustment;
          targetSummary.npcRefreshAdded += Math.max(0, refresh.adjustment);
          targetSummary.npcRefreshRemoved += Math.max(0, -refresh.adjustment);
        }
        if (unlimitedBankroll) session.opponentBankrollRefreshes = session.opponentBankrollRefreshes.slice(-1);
      }
      player.end = unlimitedBankroll ? null : session.stacks.player;
      status = terminal();
      if (batch.hands >= sliceSize) { flushBatch(); progress(); }
    }
    player.status = status || (mode === 'cashout' ? 'censored' : 'completed');
    player.reachedTarget = player.status === 'target'; player.insufficient = player.status === 'insufficient';
    player.censored = player.status === 'censored';
    player.tableClosingChips = session.stacks.player;
    result.playerSummary[player.status]++;
    if (clustered) observe(stats, player.wagers, player.netReturns, player.totalReturns);
    for (const key of ['npcRefreshAdjustment', 'npcRefreshAdded', 'npcRefreshRemoved']) player[key] = round(player[key]);
    if (pooled) finishPoolStudySummary(player.outcomePoolSummary, session.outcomePools);
    result.playerResults.push(finishSummary(player)); completedPlayers++; progress();
  }
  flushBatch();
  result.methodMeta.ciSamples = stats.n;
  result.actionSizeStats = [...actionSizes.values()].map(row => ({...row, amount: round(row.amount)}));
  result.bossStrengthStats = [...bossStrengths.values()];
  result.outcomePoolSummary = combinePoolStudySummaries(result.playerResults.map(player => player.outcomePoolSummary));
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
