/** Fixed extra awards, quoted from the base BET. No RNG, cards or wallets are changed. */
export const JACKPOT_MULTIPLIERS = Object.freeze({royal: 200, straightFlush: 50, quads: 20});
export const JACKPOT_LABELS = Object.freeze({royal: '皇家同花順', straightFlush: '同花順', quads: '四條'});

export function classifyJackpot(evaluation) {
  if (evaluation?.category === 8) return evaluation.royal || evaluation.rank?.[1] === 14 ? 'royal' : 'straightFlush';
  return evaluation?.category === 7 ? 'quads' : null;
}

/** Pure quote for award tables and presentation previews; this function never pays. */
export function quoteJackpot(tier, baseBet) {
  if (!Object.hasOwn(JACKPOT_MULTIPLIERS, tier)) throw new RangeError('未知的 Jackpot 牌型。');
  if (!Number.isFinite(baseBet) || baseBet <= 0) throw new RangeError('Jackpot baseBet 必須是正數。');
  const multiplier = JACKPOT_MULTIPLIERS[tier];
  const award = Math.round((baseBet * multiplier + Number.EPSILON) * 1e6) / 1e6;
  return {tier, multiplier, baseBet, award};
}

/** The best five may use zero, one or two hole cards. Pot victory is not required. */
export function getJackpotAward({reason, evaluation, baseBet, enabled = true} = {}) {
  if (!enabled || reason !== 'showdown') return null;
  const tier = classifyJackpot(evaluation);
  return tier ? quoteJackpot(tier, baseBet) : null;
}
