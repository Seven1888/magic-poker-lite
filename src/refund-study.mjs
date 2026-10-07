import {normalizeConfig, createSession, playAutomatedHand, syncOpponentBankroll, beginNewTable} from './engine.mjs?v=59';
import {handEntryStatus} from './hand-entry.mjs?v=59';
import {studyPlayerSeed} from './simulation-study.mjs?v=59';
import {createPoolStudySummary, collectPoolStudyAudit, finishPoolStudySummary, combinePoolStudySummaries} from './probability-pools.mjs?v=59';

const POLICIES = ['balanced', 'call', 'aggressive', 'tight'];

function asset(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0
    || !Number.isSafeInteger(Math.round(value * 1e6))) {
    throw new RangeError(`${label} 必須是可用六位小數保存的非負有限金額。`);
  }
  return Math.round(value * 1e6) / 1e6;
}

/** 獨立玩家達標研究；每手只使用共用引擎，不設手數截尾或計算 RTP。 */
export function simulateRefundStudy(config = {}, {
  players = 100, initialAsset = 100, targetAsset = 200, seed = 20260929,
  policy = 'balanced', onProgress
} = {}) {
  if (!Number.isSafeInteger(players) || players < 1 || players > 1000) {
    throw new RangeError('退幣率玩家數必須為 1 至 1,000 的整數。');
  }
  initialAsset = asset(initialAsset, '初始資產');
  targetAsset = asset(targetAsset, '退幣目標資產');
  if (!POLICIES.includes(policy)) throw new TypeError('未知玩家策略。');
  if (!(typeof seed === 'string' || typeof seed === 'number' && Number.isFinite(seed))) {
    throw new TypeError('種子須為文字或有限數字。');
  }
  if (onProgress !== undefined && typeof onProgress !== 'function') throw new TypeError('進度回呼須為函式。');

  const normalized = normalizeConfig(config), pooled = ['prebuilt-pools','pooled-holdem'].includes(normalized.outcome.mode);
  const holdem = ['fixed-holdem','pooled-holdem'].includes(normalized.outcome.mode);
  const tableBuyIn = Math.round(normalized.smallBlind * 100 * 1e6) / 1e6;
  const report = {players, completedPlayers: 0, targetPlayers: 0, insufficientPlayers: 0,
    refundRate: 0, hands: 0, averageHands: 0, minHands: Infinity, maxHands: 0,
    seed, policy, initialAsset, targetAsset, config: normalized,
    outcomeModel: normalized.outcome.mode, playerResults: [], outcomePoolSummary: null,
    ...(holdem ? {tableBuyIn, tableEntries: 0, tableBuyIns: 0,
      assetModel: 'external-wallet-plus-table-chips',
      assetDefinition: '總資產＝外部錢包＋桌籌碼；每次帶入 100 小盲，桌籌碼歸零才重新帶入。帶入、離桌不計賭注或返還。'} : {})};
  const progress = currentPlayerHands => onProgress?.({completedPlayers: report.completedPlayers,
    totalPlayers: players, completedHands: report.hands, currentPlayerHands});

  for (let playerIndex = 0; playerIndex < players; playerIndex++) {
    const playerSeed = studyPlayerSeed(seed, playerIndex);
    const session = createSession(normalized, playerSeed, {firstSmallBlind: 'random'});
    // 研究起始餘額與遊戲帶入範圍分開；低於開手門檻時直接記為資產不足。
    session.stacks = holdem ? {player: 0, npc: 0} : {player: initialAsset, npc: initialAsset};
    let wallet = holdem ? initialAsset : 0;
    const player = {playerIndex, seed: playerSeed, status: null, start: initialAsset, end: initialAsset,
      hands: 0, outcomePoolSummary: pooled ? createPoolStudySummary(session.outcomePools, {bucketPolicy:normalized.outcome.mode==='pooled-holdem'?'blind-ranges':'exact-stakes'}) : null,
      ...(holdem ? {tableEntries: 0, tableBuyIns: 0, matchedWagers: 0, totalReturns: 0} : {})};
    const totalAssets = () => Math.round((wallet + session.stacks.player) * 1e6) / 1e6;
    const terminal = () => totalAssets() >= targetAsset ? 'target'
      : holdem ? session.stacks.player <= 0 && wallet < tableBuyIn ? 'insufficient' : null
      : !handEntryStatus(session).canStart ? 'insufficient' : null;

    let status = terminal();
    while (!status) {
      if (holdem && session.stacks.player <= 0) {
        wallet = Math.round((wallet - tableBuyIn) * 1e6) / 1e6;
        if (player.tableEntries > 0) beginNewTable(session, {buyIn: tableBuyIn});
        else session.stacks = {player: tableBuyIn, npc: tableBuyIn};
        player.tableEntries++; player.tableBuyIns += tableBuyIn;
        report.tableEntries++; report.tableBuyIns += tableBuyIn;
      }
      const hand = playAutomatedHand(session, policy);
      if (holdem) {
        player.matchedWagers += hand.result.player.matchedWager;
        player.totalReturns += hand.result.player.totalReturn;
      }
      if (pooled) collectPoolStudyAudit(player.outcomePoolSummary, hand.result.outcomePoolAudit);
      // 與正式連續遊玩相同：結算後刷新對手，包含最後一手，保留玩家餘額與池。
      syncOpponentBankroll(session);
      // 引擎只需最後一筆刷新做單手去重；不保存無限長的研究歷史。
      session.opponentBankrollRefreshes = session.opponentBankrollRefreshes.slice(-1);
      player.hands++; report.hands++; player.end = totalAssets();
      status = terminal();
      progress(player.hands);
    }

    player.status = status;
    if (holdem) {
      player.wallet = wallet; player.tableClosingChips = session.stacks.player;
      player.matchedWagers = Math.round(player.matchedWagers * 1e6) / 1e6;
      player.totalReturns = Math.round(player.totalReturns * 1e6) / 1e6;
    }
    if (pooled) finishPoolStudySummary(player.outcomePoolSummary, session.outcomePools);
    report.playerResults.push(player);
    report.completedPlayers++;
    if (status === 'target') report.targetPlayers++;
    else report.insufficientPlayers++;
    report.minHands = Math.min(report.minHands, player.hands);
    report.maxHands = Math.max(report.maxHands, player.hands);
    progress(player.hands);
  }

  report.refundRate = report.targetPlayers / players;
  report.averageHands = report.hands / players;
  report.outcomePoolSummary = combinePoolStudySummaries(report.playerResults.map(player => player.outcomePoolSummary));
  return report;
}
