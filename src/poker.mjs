export const SUITS = ['s', 'h', 'd', 'c'];
export const RANKS = '23456789TJQKA';
const NAMES = ['高牌', '一對', '兩對', '三條', '順子', '同花', '葫蘆', '四條', '同花順'];

export function normalizeCard(value) {
  const card = String(value).trim().replace(/^10/, 'T');
  const normalized = card.slice(0, -1).toUpperCase() + card.slice(-1).toLowerCase();
  if (!/^[2-9TJQKA][shdc]$/.test(normalized)) throw new Error(`無效牌張：${value}`);
  return normalized;
}

export function makeDeck() {
  return SUITS.flatMap(suit => [...RANKS].map(rank => rank + suit));
}

export function createRng(seed = 123) {
  let value;
  if (typeof seed === 'number' && Number.isFinite(seed)) value = seed >>> 0;
  else {
    value = 2166136261;
    for (const c of String(seed)) value = Math.imul(value ^ c.charCodeAt(0), 16777619) >>> 0;
  }
  const rng = () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.state = () => value;
  rng.clone = () => createRng(value);
  return rng;
}

export function shuffle(cards, rng) {
  const result = [...cards];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

const rankOf = card => RANKS.indexOf(card[0]) + 2;
function straightHigh(ranks) {
  const set = new Set(ranks);
  if (set.has(14)) set.add(1);
  for (let high = 14; high >= 5; high--) {
    if ([0, 1, 2, 3, 4].every(offset => set.has(high - offset))) return high;
  }
  return 0;
}
function straightCards(cards, high) {
  return [0, 1, 2, 3, 4].map(offset => cards.find(c => rankOf(c) === (high - offset === 1 ? 14 : high - offset)));
}

/** Evaluate the best five cards, preserving which exact cards form the result. */
export function evaluateBest(input) {
  if (!Array.isArray(input) || input.length < 5 || input.length > 7) throw new Error('牌型評估需要 5 至 7 張牌。');
  const cards = input.map(normalizeCard).sort((a, b) => rankOf(b) - rankOf(a));
  if (new Set(cards).size !== cards.length) throw new Error('牌型評估不可有重複牌。');
  const ranks = cards.map(rankOf);
  const groups = new Map();
  for (const card of cards) {
    const rank = rankOf(card);
    if (!groups.has(rank)) groups.set(rank, []);
    groups.get(rank).push(card);
  }
  const multiples = [...groups.keys()].sort((a, b) => groups.get(b).length - groups.get(a).length || b - a);
  const suited = SUITS.map(suit => cards.filter(card => card[1] === suit)).find(group => group.length >= 5);
  const finish = (category, values, best5) => ({
    category, name: category === 8 && values[0] === 14 ? '皇家同花順' : NAMES[category],
    rank: [category, ...values], best5, royal: category === 8 && values[0] === 14
  });
  if (suited) {
    const high = straightHigh(suited.map(rankOf));
    if (high) return finish(8, [high], straightCards(suited, high));
  }
  const four = multiples.find(rank => groups.get(rank).length === 4);
  if (four) {
    const kicker = cards.find(card => rankOf(card) !== four);
    return finish(7, [four, rankOf(kicker)], [...groups.get(four), kicker]);
  }
  const trips = multiples.filter(rank => groups.get(rank).length >= 3).sort((a, b) => b - a);
  if (trips.length) {
    const pair = [...groups.keys()].filter(rank => rank !== trips[0] && groups.get(rank).length >= 2).sort((a, b) => b - a)[0];
    if (pair) return finish(6, [trips[0], pair], [...groups.get(trips[0]).slice(0, 3), ...groups.get(pair).slice(0, 2)]);
  }
  if (suited) return finish(5, suited.slice(0, 5).map(rankOf), suited.slice(0, 5));
  const high = straightHigh(ranks);
  if (high) return finish(4, [high], straightCards(cards, high));
  if (trips.length) {
    const kickers = cards.filter(card => rankOf(card) !== trips[0]).slice(0, 2);
    return finish(3, [trips[0], ...kickers.map(rankOf)], [...groups.get(trips[0]).slice(0, 3), ...kickers]);
  }
  const pairs = [...groups.keys()].filter(rank => groups.get(rank).length >= 2).sort((a, b) => b - a);
  if (pairs.length >= 2) {
    const kicker = cards.find(card => !pairs.slice(0, 2).includes(rankOf(card)));
    return finish(2, [pairs[0], pairs[1], rankOf(kicker)], [...groups.get(pairs[0]).slice(0, 2), ...groups.get(pairs[1]).slice(0, 2), kicker]);
  }
  if (pairs.length) {
    const kickers = cards.filter(card => rankOf(card) !== pairs[0]).slice(0, 3);
    return finish(1, [pairs[0], ...kickers.map(rankOf)], [...groups.get(pairs[0]).slice(0, 2), ...kickers]);
  }
  return finish(0, ranks.slice(0, 5), cards.slice(0, 5));
}

export function compareRanks(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const difference = (a[i] || 0) - (b[i] || 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
}
export function compareHands(a, b) { return compareRanks(evaluateBest(a).rank, evaluateBest(b).rank); }

/** Deliberately simple opening-hand quality score, not a win probability. */
export function holeScore(input) {
  if (!Array.isArray(input) || input.length !== 2) throw new Error('起手牌必須是兩張。');
  const cards = input.map(normalizeCard);
  if (cards[0] === cards[1]) throw new Error('起手牌不可重複。');
  const [hi, lo] = cards.map(rankOf).sort((a, b) => b - a);
  if (hi === lo) return Math.min(1, 0.57 + (hi - 2) / 12 * 0.43);
  const gap = hi - lo;
  const suited = cards[0][1] === cards[1][1] ? 0.12 : 0;
  const connected = gap === 1 ? 0.12 : gap === 2 ? 0.07 : gap === 3 ? 0.03 : 0;
  return Math.min(0.94, Math.max(0.02, (hi - 2) / 12 * 0.44 + (lo - 2) / 12 * 0.20 + suited + connected));
}
