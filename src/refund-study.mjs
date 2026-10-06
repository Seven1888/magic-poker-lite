import {normalizeConfig, createSession, playAutomatedHand, syncOpponentBankroll} from './engine.mjs?v=46';
import {handEntryStatus} from './hand-entry.mjs?v=46';
import {studyPlayerSeed} from './simulation-study.mjs?v=46';
import {createPoolStudySummary, collectPoolStudyAudit, finishPoolStudySummary, combinePoolStudySummaries} from './probability-pools.mjs?v=46';

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

  const normalized = normalizeConfig(config), pooled = normalized.outcome.mode === 'prebuilt-pools';
  const report = {players, completedPlayers: 0, targetPlayers: 0, insufficientPlayers: 0,
    refundRate: 0, hands: 0, averageHands: 0, minHands: Infinity, maxHands: 0,
    seed, policy, initialAsset, targetAsset, config: normalized,
    outcomeModel: normalized.outcome.mode, playerResults: [], outcomePoolSummary: null};
  const progress = currentPlayerHands => onProgress?.({completedPlayers: report.completedPlayers,
    totalPlayers: players, completedHands: report.hands, currentPlayerHands});

  for (let playerIndex = 0; playerIndex < players; playerIndex++) {
    const playerSeed = studyPlayerSeed(seed, playerIndex);
    const session = createSession(normalized, playerSeed, {firstSmallBlind: 'random'});
    // 研究起始餘額與遊戲帶入範圍分開；低於開手門檻時直接記為資產不足。
    session.stacks = {player: initialAsset, npc: initialAsset};
    const player = {playerIndex, seed: playerSeed, status: null, start: initialAsset, end: initialAsset,
      hands: 0, outcomePoolSummary: pooled ? createPoolStudySummary(session.outcomePools) : null};
    const terminal = () => session.stacks.player >= targetAsset ? 'target'
      : !handEntryStatus(session).canStart ? 'insufficient' : null;

    let status = terminal();
    while (!status) {
      const hand = playAutomatedHand(session, policy);
      if (pooled) collectPoolStudyAudit(player.outcomePoolSummary, hand.result.outcomePoolAudit);
      // 與正式連續遊玩相同：結算後刷新對手，包含最後一手，保留玩家餘額與池。
      syncOpponentBankroll(session);
      // 引擎只需最後一筆刷新做單手去重；不保存無限長的研究歷史。
      session.opponentBankrollRefreshes = session.opponentBankrollRefreshes.slice(-1);
      player.hands++; report.hands++; player.end = session.stacks.player;
      status = terminal();
      progress(player.hands);
    }

    player.status = status;
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
