import {makeDeck, normalizeCard, holeScore, evaluateBest} from './poker.mjs?v=35';

export const BOSS_HAND_CATEGORIES = Object.freeze([
  ['high-card', 'High Card'], ['pair', 'Pair'], ['two-pair', 'Two Pair'],
  ['three-of-a-kind', 'Three of a Kind'], ['straight', 'Straight'], ['flush', 'Flush'],
  ['full-house', 'Full House'], ['four-of-a-kind', 'Four of a Kind'], ['straight-flush', 'Straight Flush']
].map(([key, label], category) => Object.freeze({category, key, label})));

const DECK = makeDeck();

function cards(input, length, name) {
  if (!Array.isArray(input) || (length !== null && input.length !== length)) throw new TypeError(`${name} 的牌張數量無效。`);
  const result = input.map(normalizeCard);
  if (new Set(result).size !== result.length) throw new TypeError(`${name} 不可有重複牌。`);
  return result;
}

function setting(input = {}, chance) {
  const mode = input.rerollMode ?? (input.targetScore === undefined ? 'unpaired' : 'legacy-score');
  const legacy = mode === 'legacy-score';
  const result = {mode, chance: input.rerollChance ?? (legacy ? .75 : chance),
    limit: input.maxRerolls ?? (legacy ? 2 : 50), target: input.targetScore ?? .48};
  if (!['unpaired', 'legacy-score'].includes(result.mode) || !Number.isFinite(result.chance)
    || result.chance < 0 || result.chance > 1 || !Number.isInteger(result.limit) || result.limit < 0 || result.limit > 50
    || !Number.isFinite(result.target) || result.target < 0 || result.target > 1) {
    throw new TypeError('起手參數須使用已正規化的公開重抽設定。');
  }
  return result;
}

const isEligible = (pair, spec) => spec.mode === 'unpaired' ? pair[0][0] !== pair[1][0] : holeScore(pair) < spec.target;

/** Rejected pairs stay in the pool. The final candidate is accepted at the cap. */
function kernel(pool, spec) {
  const degree = new Map(pool.map(card => [card, 0]));
  let eligible = 0;
  for (let a = 0; a < pool.length; a++) for (let b = a + 1; b < pool.length; b++) {
    if (!isEligible([pool[a], pool[b]], spec)) continue;
    eligible++;
    degree.set(pool[a], degree.get(pool[a]) + 1);
    degree.set(pool[b], degree.get(pool[b]) + 1);
  }
  return {size: pool.length, eligible, degree};
}

function acceptedPairProbability(eligiblePair, size, eligibleCount, spec) {
  const combinations = size * (size - 1) / 2;
  const continuation = spec.chance * eligibleCount / combinations;
  // Iteration avoids loss of precision near continuation=1 and handles limit=0.
  let reach = 1, earlier = 0;
  for (let attempt = 0; attempt < spec.limit; attempt++) {
    earlier += reach;
    reach *= continuation;
  }
  const stop = eligiblePair ? 1 - spec.chance : 1;
  return (stop * earlier + reach) / combinations;
}

/**
 * Exact distribution of the BOSS's CURRENT made-hand category from known cards
 * and the public deal prior. This helps read the board: BOSS identity, displayed
 * action odds and action history do not condition or narrow the distribution.
 *
 * Pass a sanitized config, never a hand/session. Only playerHole, smallBlind and
 * config.deal are read. manualProvided flags identify manual deals without
 * sending their values. Updates read only revealed board cards; until all three
 * flop cards are visible they return waiting-for-flop. No future board, deck, seed, deal
 * audit, game RNG, behavior settings or observations belong in this interface.
 */
export function createBossHandRange({playerHole, smallBlind, config = {}} = {}) {
  const player = cards(playerHole, 2, '玩家手牌');
  if (!['player', 'npc'].includes(smallBlind)) throw new TypeError('須提供本手公開小盲位置。');
  const manualBoss = config.deal?.npc?.manualProvided === true;
  const manualPlayer = config.deal?.player?.manualProvided === true;
  const playerSetting = setting(config.deal?.player, .5), bossSetting = setting(config.deal?.npc, .25);
  const available = DECK.filter(card => !player.includes(card));
  const candidates = [];
  for (let first = 0; first < available.length; first++) for (let second = first + 1; second < available.length; second++) {
    candidates.push([available[first], available[second]]);
  }
  const bossFirst = smallBlind === 'npc' && !manualPlayer;
  const bossKernel = kernel(bossFirst ? DECK : available, bossSetting);
  const playerKernel = bossFirst ? kernel(DECK, playerSetting) : null;
  const playerEligible = isEligible(player, playerSetting);
  const prior = Float64Array.from(candidates, hole => {
    const probability = acceptedPairProbability(isEligible(hole, bossSetting), bossKernel.size, bossKernel.eligible, bossSetting);
    if (!bossFirst) return probability;
    // NPC is dealt first. Condition its prior on the subsequently accepted
    // player pair; removal changes the player's eligible-pair population.
    const remainingEligible = playerKernel.eligible - playerKernel.degree.get(hole[0]) - playerKernel.degree.get(hole[1])
      + Number(isEligible(hole, playerSetting));
    return probability * acceptedPairProbability(playerEligible, 50, remainingEligible, playerSetting);
  });
  const priorSum = prior.reduce((sum, value) => sum + value, 0);
  for (let index = 0; index < prior.length; index++) prior[index] /= priorSum;
  const categoriesByBoard = new Map();

  function categories(board) {
    const key = board.join('');
    if (!categoriesByBoard.has(key)) categoriesByBoard.set(key, Int8Array.from(candidates, hole =>
      hole.some(card => board.includes(card)) ? -1 : evaluateBest([...hole, ...board]).category));
    return categoriesByBoard.get(key);
  }

  return Object.freeze({update({board = []} = {}) {
    const visible = cards(board, null, '已揭公共牌');
    if (visible.length > 5 || visible.some(card => player.includes(card))) {
      throw new TypeError('已揭公共牌無效。');
    }
    // Always derive blockers from the immutable prior. Replacing or shortening
    // a board cannot retain exclusions from a previously displayed street.
    const weights = prior.map((weight, index) => candidates[index].some(card => visible.includes(card)) ? 0 : weight);
    const candidateCount = weights.reduce((sum, weight) => sum + Number(weight > 0), 0);
    const metadata = {candidateCount, exact: true};
    if (manualBoss) return {status: 'unavailable', unavailable: 'manual-boss-prior', distribution: [], ...metadata};
    if (visible.length < 3) return {status: 'waiting-for-flop', distribution: [], ...metadata};
    const denominator = weights.reduce((sum, weight) => sum + weight, 0);
    const totals = new Float64Array(9), currentCategories = categories(visible);
    for (let index = 0; index < weights.length; index++) if (weights[index]) totals[currentCategories[index]] += weights[index];
    const distribution = BOSS_HAND_CATEGORIES.map(item => ({...item, probability: totals[item.category] / denominator}));
    // Put floating-point closure on the largest bin. A vanishing rare-category
    // probability must never become negative merely because other sums round up.
    const pivot = distribution.reduce((best, item, index) => item.probability > distribution[best].probability ? index : best, 0);
    distribution[pivot].probability = 1 - distribution.reduce((sum, item, index) => sum + (index === pivot ? 0 : item.probability), 0);
    distribution.sort((a, b) => b.probability - a.probability || b.category - a.category);
    return {status: 'ready', distribution, ...metadata};
  }});
}
