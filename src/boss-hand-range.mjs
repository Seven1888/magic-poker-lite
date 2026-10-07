import {makeDeck, normalizeCard, evaluateBest} from './poker.mjs?v=59';

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

/**
 * Standard Texas Hold'em possibilities for the BOSS's CURRENT made-hand category.
 * Only the known player cards and the revealed board are read. Every unordered
 * pair among the remaining cards has equal weight; deal settings, manual cards,
 * blind positions, BOSS identity and betting behavior do not affect this model.
 * Preflop classifies the two starting cards as paired or unpaired. From the flop
 * onward it classifies the best five currently available cards. Neither stage
 * forecasts unrevealed cards. A partly revealed flop is not a complete street.
 */
export function createBossHandRange({playerHole} = {}) {
  const player = cards(playerHole, 2, '玩家手牌');
  const available = DECK.filter(card => !player.includes(card));
  const countsByBoard = new Map();

  return Object.freeze({update({board = []} = {}) {
    const visible = cards(board, null, '已揭公共牌');
    if (visible.length > 5 || visible.some(card => player.includes(card))) {
      throw new TypeError('已揭公共牌無效。');
    }
    const remaining = available.filter(card => !visible.includes(card));
    const candidateCount = remaining.length * (remaining.length - 1) / 2;
    const metadata = {candidateCount, exact: true, basis: visible.length === 0 ? 'starting-hand' : 'made-hand'};
    if (visible.length > 0 && visible.length < 3) return {status: 'waiting-for-flop', distribution: [], ...metadata};
    const key = [...visible].sort().join('');
    if (!countsByBoard.has(key)) {
      const counts = new Uint16Array(9);
      for (let first = 0; first < remaining.length; first++) for (let second = first + 1; second < remaining.length; second++) {
        const category = visible.length === 0
          ? Number(remaining[first][0] === remaining[second][0])
          : evaluateBest([remaining[first], remaining[second], ...visible]).category;
        counts[category]++;
      }
      countsByBoard.set(key, counts);
    }
    const counts = countsByBoard.get(key);
    const distribution = BOSS_HAND_CATEGORIES.map(item => ({...item, probability: counts[item.category] / candidateCount}));
    // Put floating-point closure on the largest bin, preserving exact zero bins.
    const pivot = distribution.reduce((best, item, index) => item.probability > distribution[best].probability ? index : best, 0);
    distribution[pivot].probability = 1 - distribution.reduce((sum, item, index) => sum + (index === pivot ? 0 : item.probability), 0);
    distribution.sort((a, b) => b.probability - a.probability || b.category - a.category);
    return {status: 'ready', distribution, ...metadata};
  }});
}
