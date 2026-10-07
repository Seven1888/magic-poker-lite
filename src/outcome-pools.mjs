import {evaluateBest, normalizeCard, RANKS} from './poker.mjs?v=59';
import {classifyJackpot, JACKPOT_MULTIPLIERS} from './jackpot.mjs?v=59';

export const OUTCOME_POOL_SCALE = 1_000_000;
export const OUTCOME_BET_BUCKETS = Object.freeze([
  Object.freeze([1, 2, 5, 10]),
  Object.freeze([20, 50, 100, 200, 500]),
  Object.freeze([800, 1000, 1200, 1500, 1800, 2000])
]);
export const DEFAULT_OUTCOME_POOL_CONFIG = Object.freeze({conversionRate: 0.99,
  paidActionBudgetShare: 0.8, paidActionCooldownMin: 0, paidActionCooldownMax: 0,
  specialUseChance: 0.2});
const SPECIAL_PRIORITY = ['royal', 'straightFlush', 'quads'];
const PAID_ACTIONS = new Set(['call', 'bet', 'raise']);
const clone = value => JSON.parse(JSON.stringify(value));
const clampChance = value => Math.max(0, Math.min(1, value));

function amount(value, label = '金額') {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0
    || !Number.isSafeInteger(Math.round(value * OUTCOME_POOL_SCALE))) {
    throw new RangeError(label + ' 必須是可用六位小數保存的非負有限金額。');
  }
  return Math.round(value * OUTCOME_POOL_SCALE) / OUTCOME_POOL_SCALE;
}

function units(value) { return Math.round(amount(value) * OUTCOME_POOL_SCALE); }
function plus(...values) { return amount(values.reduce((sum, value) => sum + units(value), 0) / OUTCOME_POOL_SCALE); }
function minus(left, right) {
  const difference = units(left) - units(right);
  if (difference < 0) throw new RangeError('水池預算不足，不得透支。');
  return difference / OUTCOME_POOL_SCALE;
}
function integer(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(label + ' 必須為非負整數。');
  return value;
}
function chance(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(label + ' 必須介於 0 至 1。');
  }
  return value;
}
function readRoll(rng) {
  if (typeof rng !== 'function') throw new TypeError('須提供建樹專用 RNG。');
  const roll = rng();
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new RangeError('RNG 必須回傳 0（含）至 1（不含）。');
  return roll;
}
function ensureTarget(target) {
  if (!['win', 'nonWin'].includes(target)) throw new RangeError('目標須為 win 或 nonWin。');
  return target;
}

/** The .99 conversion score is independent of the pot-return coefficient. */
export function normalizeOutcomePoolConfig(input = {}) {
  const defaults = DEFAULT_OUTCOME_POOL_CONFIG;
  const output = {
    conversionRate: chance(input.conversionRate ?? defaults.conversionRate, 'conversionRate'),
    paidActionBudgetShare: chance(input.paidActionBudgetShare ?? defaults.paidActionBudgetShare, 'paidActionBudgetShare'),
    paidActionCooldownMin: integer(input.paidActionCooldownMin ?? defaults.paidActionCooldownMin, 'paidActionCooldownMin'),
    paidActionCooldownMax: integer(input.paidActionCooldownMax ?? defaults.paidActionCooldownMax, 'paidActionCooldownMax'),
    specialUseChance: chance(input.specialUseChance ?? defaults.specialUseChance, 'specialUseChance')
  };
  if (output.paidActionCooldownMax < output.paidActionCooldownMin) throw new RangeError('CD 最大值不可小於最小值。');
  return output;
}

export function outcomeBetBucketIndex(bet) {
  const index = OUTCOME_BET_BUCKETS.findIndex(bucket => bucket.includes(bet));
  if (index < 0) throw new RangeError('BET 不屬於三個正式水池桶。');
  return index;
}

/** New small-blind choices can produce BB values between historical stake levels. */
export function outcomeBlindBucketIndex(bigBlind) {
  const blind = amount(bigBlind, '大盲');
  if (!(blind > 0)) throw new RangeError('大盲必須大於 0。');
  return blind <= 10 ? 0 : blind <= 500 ? 1 : 2;
}

export function createOutcomePools({paidAction = [0, 0, 0], special = [0, 0, 0],
  paidActionCooldown = 0, qualificationSequence = 0, handSequence = 0} = {}) {
  if (!Array.isArray(paidAction) || paidAction.length !== 3 || !Array.isArray(special) || special.length !== 3) {
    throw new TypeError('兩種水池都須有三個 BET 桶。');
  }
  return {version: 1, buckets: paidAction.map((paid, index) => ({paidAction: amount(paid), special: amount(special[index])})),
    paidActionCooldown: integer(paidActionCooldown, 'paidActionCooldown'),
    qualificationSequence: integer(qualificationSequence, 'qualificationSequence'),
    handSequence: integer(handSequence, 'handSequence'), lastSettlement: null};
}

/** Safe copy for persistence and branching; malformed saved balances fail closed. */
export function normalizeOutcomePools(input) {
  if (input === undefined || input === null) return createOutcomePools();
  if (input.version !== 1 || !Array.isArray(input.buckets) || input.buckets.length !== 3) {
    throw new TypeError('水池資料版本或桶數無效。');
  }
  const result = createOutcomePools({paidAction: input.buckets.map(bucket => bucket.paidAction),
    special: input.buckets.map(bucket => bucket.special), paidActionCooldown: input.paidActionCooldown,
    qualificationSequence: input.qualificationSequence, handSequence: input.handSequence ?? 0});
  if (input.lastSettlement !== null && input.lastSettlement !== undefined) {
    if (typeof input.lastSettlement.id !== 'string' || !input.lastSettlement.id || !input.lastSettlement.audit) {
      throw new TypeError('水池結算去重資料無效。');
    }
    result.lastSettlement = clone(input.lastSettlement);
  }
  return result;
}

export function cloneOutcomePools(pools) { return normalizeOutcomePools(pools); }

/** New tables keep every saved pool unit while retiring the special pool. */
export function migrateOutcomePoolsWithoutJackpot(pools) {
  const next = normalizeOutcomePools(pools);
  next.buckets = next.buckets.map(bucket => ({paidAction: plus(bucket.paidAction, bucket.special), special: 0}));
  return next;
}

/** Branches only need the preceding transaction identity, not its full audit. */
export function compactOutcomePools(pools) {
  if (pools === undefined || pools === null) return createOutcomePools();
  return normalizeOutcomePools({...pools, lastSettlement: pools.lastSettlement
    ? {id: pools.lastSettlement.id, audit: {}} : null});
}

/** Hands Up's exact million-ticket rule, including one draw at 0% and 100%. */
export function drawOutcomeTicket(probability, rng) {
  const winningNumbers = Math.round(chance(probability, '抽籤機率') * OUTCOME_POOL_SCALE);
  const random = readRoll(rng), roll = 1 + Math.floor(random * OUTCOME_POOL_SCALE);
  return {hit: roll <= winningNumbers, roll, winningNumbers, ticketScale: OUTCOME_POOL_SCALE,
    probability: winningNumbers / OUTCOME_POOL_SCALE, random};
}

export function createOutcomePoolBranch(pools, bet, {bucketMode = 'exact-stakes'} = {}) {
  if (!['exact-stakes', 'blind-ranges'].includes(bucketMode)) throw new TypeError('未知水池分桶方式。');
  const basePools = compactOutcomePools(pools), bucketIndex = bucketMode === 'blind-ranges' ? outcomeBlindBucketIndex(bet) : outcomeBetBucketIndex(bet);
  const bucket = basePools.buckets[bucketIndex];
  return {version: 1, bet, bucketIndex, ...(bucketMode === 'blind-ranges' ? {bucketMode} : {}), basePools, handId: String(basePools.handSequence + 1),
    paidAction: bucket.paidAction, special: bucket.special,
    paidActionCooldown: basePools.paidActionCooldown, qualificationSequence: basePools.qualificationSequence,
    paidActionBudgetUsed: 0, pendingWinPaidCredits: [], paidEvents: [], qualification: null};
}

function checkedBranch(branch) {
  if (!branch || branch.version !== 1 || ![undefined, 'exact-stakes', 'blind-ranges'].includes(branch.bucketMode)
    || branch.bucketIndex !== (branch.bucketMode === 'blind-ranges' ? outcomeBlindBucketIndex(branch.bet) : outcomeBetBucketIndex(branch.bet))) {
    throw new TypeError('水池分支資料無效。');
  }
  if (!Array.isArray(branch.pendingWinPaidCredits) || !Array.isArray(branch.paidEvents)) {
    throw new TypeError('分支須保存延後入池與付費事件。');
  }
  const result = {...branch, basePools: compactOutcomePools(branch.basePools),
    pendingWinPaidCredits: branch.pendingWinPaidCredits.map(credit => ({...credit})),
    paidEvents: branch.paidEvents.map(event => ({...event,
      cooldownDraw: event.cooldownDraw ? {...event.cooldownDraw} : null})),
    qualification: branch.qualification ? {...branch.qualification} : null};
  amount(result.paidAction); amount(result.special); amount(result.paidActionBudgetUsed);
  integer(result.paidActionCooldown, '分支 CD'); integer(result.qualificationSequence, '資格序號');
  return result;
}

/** Root score uses matched blind money, not a wallet debit or special-pool balance. */
export function quoteRootPoolOutcome({hand, config = {}} = {}) {
  const settings = normalizeOutcomePoolConfig(config);
  const matchedWager = Math.min(amount(hand?.contributions?.player), amount(hand?.contributions?.npc));
  const denominator = amount(2 * matchedWager);
  if (!(denominator > 0)) throw new RangeError('Root 必須已有正數匹配盲注。');
  const score = amount(matchedWager * settings.conversionRate);
  const rawProbability = clampChance(score / denominator);
  return {matchedWager, score, denominator, conversionRate: settings.conversionRate,
    rawProbability, probability: Math.round(rawProbability * OUTCOME_POOL_SCALE) / OUTCOME_POOL_SCALE};
}

/**
 * Reserve the highest affordable special tier only after a winning root.
 * Reservation never spends the special pool; only a successful showdown does.
 */
export function reserveSpecialQualification({branch, rootTarget, rng, config = {}, enabled = true} = {}) {
  const next = checkedBranch(branch), settings = normalizeOutcomePoolConfig(config);
  ensureTarget(rootTarget);
  if (!enabled || rootTarget !== 'win') {
    return {branch: next, qualification: null, draw: null, reason: enabled ? 'root-nonWin' : 'disabled'};
  }
  const tier = SPECIAL_PRIORITY.find(candidate => units(next.special) >= units(next.bet * JACKPOT_MULTIPLIERS[candidate]));
  if (!tier) return {branch: next, qualification: null, draw: null, reason: 'insufficient-special-pool'};
  const draw = drawOutcomeTicket(settings.specialUseChance, rng);
  if (!draw.hit) return {branch: next, qualification: null, draw, reason: 'use-chance-missed', affordableTier: tier};
  next.qualificationSequence++;
  const qualification = {id: next.qualificationSequence, tier, award: amount(next.bet * JACKPOT_MULTIPLIERS[tier]),
    multiplier: JACKPOT_MULTIPLIERS[tier], baseBet: next.bet, bucketIndex: next.bucketIndex,
    specialBefore: next.special, status: 'reserved', useRoll: draw.roll, useWinningNumbers: draw.winningNumbers};
  next.qualification = qualification;
  return {branch: next, qualification, draw, reason: 'reserved'};
}

/** Callback for the tree builder. Its RNG must be the builder's isolated RNG. */
export function drawRootPoolOutcome({hand, rng, pools, config = {}} = {}) {
  const quote = quoteRootPoolOutcome({hand, config}), draw = drawOutcomeTicket(quote.probability, rng);
  const target = draw.hit ? 'win' : 'nonWin';
  const selection = reserveSpecialQualification({branch: createOutcomePoolBranch(pools, hand.config.bigBlind,
    {bucketMode: hand.config.outcome?.mode === 'pooled-holdem' ? 'blind-ranges' : 'exact-stakes'}),
    rootTarget: target, rng, config, enabled: hand.config.outcome?.mode !== 'pooled-holdem' && hand.config.jackpotEnabled !== false});
  if (hand.outcomeHandId !== undefined && hand.outcomeHandId !== selection.branch.handId) {
    throw new Error('牌局水池交易序號與持續保存序號不一致。');
  }
  return {kind: 'root', previousTarget: null, target, inherited: false,
    ...quote, ...draw, poolBranch: selection.branch, qualification: selection.qualification,
    specialSelection: {reason: selection.reason, draw: selection.draw, affordableTier: selection.affordableTier ?? null}};
}

/** Monetary quote only; no RNG, pool spending or credits happen here. */
export function quotePaidPoolOutcome({hand, action, previousTarget, branch, config = {}} = {}) {
  ensureTarget(previousTarget);
  const current = checkedBranch(branch), settings = normalizeOutcomePoolConfig(config);
  return paidQuoteWithState(hand, action, previousTarget, current, settings);
}

function paidQuoteWithState(hand, action, previousTarget, current, settings) {
  if (hand?.actor !== 'player' || !PAID_ACTIONS.has(action?.type) || !(action.amount > 0)) {
    throw new TypeError('付費水池事件只接受玩家有實付的 CALL／BET／RAISE。');
  }
  if (hand.config.bigBlind !== current.bet) throw new Error('牌局 BET 與水池分支不一致。');
  const paidPrice = amount(action.amount), contributionBefore = amount(hand.contributions.player);
  if (units(paidPrice) > units(hand.stacks.player)) throw new RangeError('實付額超過玩家可用資產。');
  const contributionAfter = plus(contributionBefore, paidPrice);
  const matchedAfterAction = Math.min(contributionAfter, amount(hand.stacksBefore.npc));
  const denominator = amount(2 * matchedAfterAction);
  if (!(denominator > 0)) throw new RangeError('付費轉贏分母必須為正數匹配 POT。');
  const score = amount(paidPrice * settings.conversionRate);
  const paidActionBudgetUsed = previousTarget === 'nonWin' && current.paidActionCooldown === 0
    ? Math.min(current.paidAction, amount(Math.max(0, denominator - score))) : 0;
  const totalScore = plus(score, paidActionBudgetUsed);
  const rawProbability = previousTarget === 'win' ? null : clampChance(totalScore / denominator);
  return {paidPrice, contributionBefore, contributionAfter, matchedAfterAction, denominator, score, totalScore,
    conversionRate: settings.conversionRate, paidActionBudgetShare: settings.paidActionBudgetShare,
    paidActionBudgetBefore: current.paidAction, paidActionBudgetUsed,
    paidActionCooldownBefore: current.paidActionCooldown,
    rawProbability, probability: rawProbability === null ? null : Math.round(rawProbability * OUTCOME_POOL_SCALE) / OUTCOME_POOL_SCALE};
}

/**
 * All paid actions call this, including paid actions after win. Winning credits
 * are pending contribution intervals: refundable chips do not earn pool money.
 */
export function drawPaidPoolOutcome({hand, action, previousDecision, rng, config = {}, nodeId = null} = {}) {
  const previousTarget = ensureTarget(previousDecision?.target);
  const next = checkedBranch(previousDecision.poolBranch), settings = normalizeOutcomePoolConfig(config);
  const quote = paidQuoteWithState(hand, action, previousTarget, next, settings);
  let cooldownDraw = null;
  let cooldownAfter = next.paidActionCooldown;
  if (previousTarget === 'nonWin') {
    if (quote.paidActionBudgetUsed > 0) {
      const min = settings.paidActionCooldownMin, max = settings.paidActionCooldownMax;
      const roll = max > min ? readRoll(rng) : null;
      cooldownAfter = roll === null ? min : min + Math.floor(roll * (max - min + 1));
      cooldownDraw = {roll, result: cooldownAfter, min, max};
    } else if (cooldownAfter > 0) cooldownAfter--;
  }
  const draw = previousTarget === 'win' ? null : drawOutcomeTicket(quote.probability, rng);
  const target = previousTarget === 'win' || draw.hit ? 'win' : 'nonWin';
  next.paidAction = minus(next.paidAction, quote.paidActionBudgetUsed);
  next.paidActionBudgetUsed = plus(next.paidActionBudgetUsed, quote.paidActionBudgetUsed);
  next.paidActionCooldown = cooldownAfter;
  const event = {...quote, nodeId, type: action.type, previousTarget, target,
    paidActionBudgetAfter: next.paidAction, paidActionCooldownAfter: cooldownAfter, cooldownDraw,
    roll: draw?.roll ?? null, winningNumbers: draw?.winningNumbers ?? null};
  next.paidEvents.push(event);
  if (target === 'win') next.pendingWinPaidCredits.push({from: quote.contributionBefore, to: quote.contributionAfter,
    conversionRate: settings.conversionRate, paidActionBudgetShare: settings.paidActionBudgetShare, nodeId});
  return {kind: previousTarget === 'win' ? 'paid-win' : 'paid', previousTarget, target,
    inherited: previousTarget === 'win', ...quote,
    roll: draw?.roll ?? null, winningNumbers: draw?.winningNumbers ?? null,
    ticketScale: OUTCOME_POOL_SCALE, paidActionCooldownAfter: cooldownAfter, cooldownDraw,
    poolBranch: next, qualification: next.qualification};
}

/** Exact Hands Up participation constraint for a pool-funded special layout. */
export function isSpecialPoolLayout({player, board, qualification} = {}) {
  if (!Array.isArray(player) || player.length !== 2 || !Array.isArray(board) || board.length !== 5) return false;
  try {
    const hole = player.map(normalizeCard), shared = board.map(normalizeCard);
    const evaluation = evaluateBest([...hole, ...shared]), tier = classifyJackpot(evaluation);
    if (!qualification) return tier === null;
    if (tier !== qualification.tier || classifyJackpot(evaluateBest(shared))) return false;
    if (tier === 'quads') return hole.some(card => RANKS.indexOf(card[0]) + 2 === evaluation.rank[1]);
    return evaluation.best5.some(card => hole.includes(card));
  } catch { return false; }
}

function comparablePools(pools) {
  return JSON.stringify({buckets: pools.buckets, paidActionCooldown: pools.paidActionCooldown,
    qualificationSequence: pools.qualificationSequence, handSequence: pools.handSequence,
    lastSettlementId: pools.lastSettlement?.id ?? null});
}

/**
 * Intermediate view/commit for a selected path, always derived from the hand's
 * original pool snapshot. Pending win credits remain excluded. The integrator
 * persists only settled transactions and keeps this live view in the session.
 */
export function applyBranchPools({pools, decision, handId} = {}) {
  const current = normalizeOutcomePools(pools), branch = checkedBranch(decision?.poolBranch);
  if (typeof handId !== 'string' || handId !== branch.handId) throw new Error('水池分支交易序號不一致。');
  if (comparablePools(current) !== comparablePools(branch.basePools)) {
    throw new Error('中途水池套用必須使用該手開始前的原始快照。');
  }
  current.buckets[branch.bucketIndex] = {paidAction: branch.paidAction, special: branch.special};
  current.paidActionCooldown = branch.paidActionCooldown;
  current.qualificationSequence = branch.qualificationSequence;
  return current;
}

/**
 * Commit only the selected terminal branch. Pool spending is already planned;
 * earned credits are now clipped to final matchedWager. Returns the sole funded
 * special award separately, so the engine can keep POT and bonus accounting.
 */
export function settleOutcomePools({pools, decision, matchedWager, reason, winner, actualTier = null, handId} = {}) {
  if (typeof handId !== 'string' || !handId) throw new TypeError('水池結算須提供唯一 handId。');
  const current = normalizeOutcomePools(pools);
  if (current.lastSettlement?.id === handId) {
    return {pools: current, audit: clone(current.lastSettlement.audit), specialAward: 0, alreadySettled: true};
  }
  if (!['showdown', 'fold'].includes(reason) || !['player', 'npc', 'tie'].includes(winner)) {
    throw new TypeError('水池結算須使用正式終局結果。');
  }
  const branch = checkedBranch(decision?.poolBranch), matched = amount(matchedWager);
  if (handId !== branch.handId) throw new Error('水池結算交易序號不一致。');
  if (comparablePools(current) !== comparablePools(branch.basePools)) throw new Error('水池已改變，不能提交過期行動樹分支。');
  let paidAdd = 0, specialAdd = 0, previousEnd = 0;
  const credits = branch.pendingWinPaidCredits.map(credit => {
    const from = amount(credit.from), to = amount(credit.to);
    if (to <= from || from < previousEnd) throw new Error('延後入池投入區間重疊或無效。');
    previousEnd = to;
    const matchedPaidAmount = amount(Math.max(0, Math.min(to, matched) - from));
    const refundablePaidAmount = minus(minus(to, from), matchedPaidAmount);
    const score = amount(matchedPaidAmount * chance(credit.conversionRate, 'conversionRate'));
    const paidActionAdded = amount(score * chance(credit.paidActionBudgetShare, 'paidActionBudgetShare'));
    const specialAdded = minus(score, paidActionAdded);
    paidAdd = plus(paidAdd, paidActionAdded); specialAdd = plus(specialAdd, specialAdded);
    return {...credit, matchedPaidAmount, refundablePaidAmount, score, paidActionAdded, specialAdded};
  });
  let specialAward = 0;
  const qualification = branch.qualification;
  if (qualification && reason === 'showdown' && winner === 'player') {
    if (actualTier !== qualification.tier || qualification.baseBet !== branch.bet
      || qualification.bucketIndex !== branch.bucketIndex
      || qualification.award !== amount(branch.bet * JACKPOT_MULTIPLIERS[qualification.tier])) {
      throw new Error('特殊牌資格與正式攤牌牌型或派彩不一致。');
    }
    specialAward = amount(qualification.award);
    // Current-hand pending credits cannot retrospectively fund this reservation.
    if (units(branch.special) < units(specialAward)) throw new Error('特殊牌水池不足，停止派彩。');
  }
  const next = normalizeOutcomePools(current);
  next.buckets[branch.bucketIndex] = {paidAction: plus(branch.paidAction, paidAdd),
    special: plus(minus(branch.special, specialAward), specialAdd)};
  next.paidActionCooldown = branch.paidActionCooldown;
  next.qualificationSequence = branch.qualificationSequence;
  next.handSequence = integer(current.handSequence + 1, 'handSequence');
  const audit = {handId, bet: branch.bet, bucketIndex: branch.bucketIndex, matchedWager: matched,
    before: clone(current.buckets[branch.bucketIndex]), after: clone(next.buckets[branch.bucketIndex]),
    paidActionBudgetUsed: branch.paidActionBudgetUsed, paidActionAdded: paidAdd, specialAdded: specialAdd,
    specialAward, qualification: qualification ? {...qualification,
      status: specialAward > 0 ? 'completed' : 'deferred'} : null,
    cooldownBefore: current.paidActionCooldown, cooldownAfter: next.paidActionCooldown,
    credits, paidEvents: clone(branch.paidEvents)};
  next.lastSettlement = {id: handId, audit: clone(audit)};
  return {pools: next, audit, specialAward, alreadySettled: false};
}
