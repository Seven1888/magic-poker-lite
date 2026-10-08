import {evaluateBest, normalizeCard, holeScore, makeDeck, compareRanks, RANKS} from './poker.mjs?v=60';

export const NATURAL_BOSS_POLICY_VERSION = 'natural-boss-pressure-v1';
const EVALUATION_CACHE_CAPACITY = 128;
// Only the mathematical certainty result is memoized. Keys contain sorted own
// cards and the revealed river board, never an engine hand, RNG, price or target.
const certaintyCache = new Map();
let cacheHits = 0, cacheMisses = 0, cacheEvictions = 0, opponentEvaluations = 0;

/** Card-free diagnostics for performance tests/research; not saved with a hand. */
export function getNaturalBossEvaluationCacheInfo() {
  return {capacity: EVALUATION_CACHE_CAPACITY, size: certaintyCache.size,
    hits: cacheHits, misses: cacheMisses, evictions: cacheEvictions, opponentEvaluations};
}
export function clearNaturalBossEvaluationCache() {
  certaintyCache.clear(); cacheHits = 0; cacheMisses = 0; cacheEvictions = 0; opponentEvaluations = 0;
}
const STREETS = {preflop: 0, flop: 3, turn: 4, river: 5};
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const rankOf = card => RANKS.indexOf(card[0]) + 2;
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
export const NATURAL_BOSS_PROFILES = freeze({
  caller: {name: '不激進', nickname: 'PASSIVE', fold: .7, call: 2.6, aggression: .42, pressure: 1.8,
    sizes: {half: .6, pot: .3, allin: .1}},
  maniac: {name: '激進', nickname: 'AGGRESSIVE', fold: 1, call: 1.8, aggression: 1.15, pressure: 1.6,
    sizes: {half: .35, pot: .4, allin: .25}}
});
const ACTION_FIELDS = ['id', 'type', 'label', 'amount', 'to', 'allIn', 'fullRaise', 'raiseIncrement', 'sizeKey'];
const HISTORY_FIELDS = ['actor', 'type', 'amount', 'to', 'street', 'allIn', 'fullRaise'];
function pick(source, keys) {
  const result = {};
  for (const key of keys) if (source[key] !== undefined) result[key] = source[key];
  return result;
}

/** Trusted boundary: copy only information the acting BOSS is allowed to know.
 * Never spread/serialize hand, holes, history entries or action objects here.
 * The pure policy below is given this frozen view, never the engine's hand.
 */
export function createBossDecisionView(hand, actions) {
  const street = hand.street, count = STREETS[street];
  if (count === undefined) throw new TypeError('Unknown BOSS decision street.');
  const ownCards = hand.holes.npc.map(normalizeCard);
  const board = hand.board.slice(0, count).map(normalizeCard);
  if (ownCards.length !== 2 || board.length !== count || new Set([...ownCards, ...board]).size !== count + 2) {
    throw new TypeError('BOSS requires valid own cards and the revealed board.');
  }
  const profileId = hand.bossProfile?.id;
  if (!NATURAL_BOSS_PROFILES[profileId]) throw new TypeError('Unknown natural BOSS profile.');
  const ownStack = hand.stacks.npc, opponentStack = hand.stacks.player;
  const currentBet = hand.currentBet, ownStreetBet = hand.streetBets.npc, pot = hand.pot;
  if (![ownStack, opponentStack, currentBet, ownStreetBet, pot].every(value => Number.isFinite(value) && value >= 0)) {
    throw new TypeError('BOSS prices and stacks must be finite and nonnegative.');
  }
  const owed = Math.max(0, currentBet - ownStreetBet);
  const callAmount = Math.min(owed, ownStack), basePot = Math.max(0, pot - owed);
  const legalActions = actions.map(action => ({...pick(action, ACTION_FIELDS),
    ...(action.sizeKeys ? {sizeKeys: [...action.sizeKeys]} : {})}));
  return freeze({version: NATURAL_BOSS_POLICY_VERSION, profileId, street, ownCards, board,
    ownStack, opponentStack, pot, callAmount, basePot,
    history: (hand.history ?? []).map(action => pick(action, HISTORY_FIELDS)), legalActions});
}

function requireView(view) {
  // Reject accidental use of an engine hand or a view extended with hidden data.
  const allowed = ['version', 'profileId', 'street', 'ownCards', 'board', 'ownStack', 'opponentStack',
    'pot', 'callAmount', 'basePot', 'history', 'legalActions'];
  if (view?.version !== NATURAL_BOSS_POLICY_VERSION || Object.keys(view).some(key => !allowed.includes(key))
    || !NATURAL_BOSS_PROFILES[view.profileId]) throw new TypeError('Natural BOSS policy requires a dedicated decision view.');
}

function draws(ownCards, board) {
  if (board.length === 5 || board.length === 0) return {flushDraw: false, straightDraw: false, gutshot: false};
  const visible = [...ownCards, ...board], ranks = new Set(visible.map(rankOf));
  const boardRanks = new Set(board.map(rankOf));
  if (ranks.has(14)) ranks.add(1);
  if (boardRanks.has(14)) boardRanks.add(1);
  const contributes = rank => ranks.has(rank) && !boardRanks.has(rank);
  const flushDraw = ownCards.some(card => visible.filter(other => other[1] === card[1]).length === 4);
  let straightDraw = false, gutshot = false;
  for (let low = 1; low <= 10; low++) {
    const window = Array.from({length: 5}, (_, index) => low + index);
    const present = window.filter(rank => ranks.has(rank)), missing = window.filter(rank => !ranks.has(rank));
    if (present.length !== 4 || !present.some(contributes)) continue;
    if (missing[0] > low && missing[0] < low + 4) gutshot = true;
  }
  for (let low = 2; low <= 10; low++) {
    const window = Array.from({length: 4}, (_, index) => low + index);
    if (window.every(rank => ranks.has(rank)) && window.some(contributes)) straightDraw = true;
  }
  return {flushDraw, straightDraw, gutshot};
}

/** A certainty check, not an opponent-range estimate. Only known cards are
 * excluded; the actual opposing hand and remaining deck are unavailable.
 * On the river, a straight-or-better hand is unbeatable only if no legal
 * unknown two-card holding can rank above it. The early exit is intentional.
 */
function cannotLose(ownCards, board, evaluated) {
  if (evaluated.category === 8 && evaluated.rank[1] === 14) return true;
  if (board.length !== 5 || evaluated.category < 4) return false;
  const key = ownCards.slice().sort().join(',') + '|' + board.slice().sort().join(',');
  if (certaintyCache.has(key)) {
    const cached = certaintyCache.get(key);
    certaintyCache.delete(key); certaintyCache.set(key, cached); cacheHits++;
    return cached;
  }
  cacheMisses++;
  const known = new Set([...ownCards, ...board]);
  const unknown = makeDeck().filter(card => !known.has(card));
  let unbeatable = true;
  search: for (let first = 0; first < unknown.length - 1; first++) {
    for (let second = first + 1; second < unknown.length; second++) {
      opponentEvaluations++;
      if (compareRanks(evaluateBest([unknown[first], unknown[second], ...board]).rank, evaluated.rank) > 0) {
        unbeatable = false; break search;
      }
    }
  }
  if (certaintyCache.size >= EVALUATION_CACHE_CAPACITY) {
    certaintyCache.delete(certaintyCache.keys().next().value); cacheEvictions++;
  }
  certaintyCache.set(key, unbeatable);
  return unbeatable;
}

/** Heuristic hand quality, deliberately NOT an equity/win-probability estimate. */
export function getNaturalBossFeatures(view) {
  requireView(view);
  const {ownCards, board} = view, features = draws(ownCards, board);
  const ownRanks = ownCards.map(rankOf), high = Math.max(...ownRanks);
  let strength = holeScore(ownCards), category = null, unbeatable = false, boardPlays = false;
  if (board.length) {
    const evaluated = evaluateBest([...ownCards, ...board]); category = evaluated.category;
    unbeatable = cannotLose(ownCards, board, evaluated);
    const boardRanks = board.map(rankOf), top = Math.max(...boardRanks);
    const pairedOwnRanks = ownRanks.filter(rank => ownRanks.filter(r => r === rank).length === 2 || boardRanks.includes(rank));
    // A community pair by itself does not make an unpaired private hand strong.
    if (category <= 1) strength = pairedOwnRanks.length
      ? .43 + .2 * clamp(Math.max(...pairedOwnRanks) / top, 0, 1) + (high - 2) / 12 * .04
      : .14 + (high - 2) / 12 * .16;
    else strength = [0, 0, .70, .79, .85, .90, .95, .98, .995][category];
    if (board.length === 5) {
      const boardRank = evaluateBest(board).rank;
      boardPlays = compareRanks(evaluated.rank, boardRank) === 0;
      if (boardPlays) strength = .35;
    }
    // Draw bonuses require own-card participation, and disappear on the river.
    strength += features.flushDraw ? .15 : 0;
    strength += features.straightDraw ? .11 : features.gutshot ? .045 : 0;
  }
  const draw = Number(features.flushDraw) + Number(features.straightDraw) * .7 + Number(features.gutshot) * .25;
  const previousAggression = view.history.some(action => action.actor === 'npc'
    && ['bet', 'raise'].includes(action.type) && action.street !== view.street);
  const blocker = ownCards.some(card => card[0] === 'A' && board.filter(publicCard => publicCard[1] === card[1]).length >= 3);
  const bluff = Number(previousAggression && (blocker || draw > 0));
  return {strength: unbeatable ? .995 : clamp(strength, .02, .995), category, ...features, draw, bluff, unbeatable, boardPlays};
}

/** The sole distribution used by both previews and actual BOSS action sampling. */
export function getNaturalBossDistribution(view) {
  requireView(view);
  const actions = view.legalActions;
  if (!actions.length) return [];
  const profile = NATURAL_BOSS_PROFILES[view.profileId];
  const {strength, draw, bluff, unbeatable, boardPlays} = getNaturalBossFeatures(view);
  const pressure = view.callAmount / Math.max(.000001, view.basePot);
  const logPressure = Math.log1p(pressure);
  const reraises = view.history.filter(action => action.street === view.street && action.type === 'raise').length;
  const canCheck = actions.some(action => action.type === 'check');
  const aggression = unbeatable && boardPlays ? 0 : profile.aggression
    * Math.exp(3 * (strength - .5) - .9 * logPressure * (1 - strength))
    * (1 + .6 * draw + .3 * bluff) / (1 + .25 * reraises);
  const weights = {
    fold: canCheck || unbeatable ? 0 : profile.fold * Math.exp(3 * (.5 - strength)
      + profile.pressure * logPressure * (.05 + .95 * (1 - strength) ** 2)),
    call: profile.call * Math.exp(1.3 * (strength - .5) - .25 * logPressure * (1 - strength)),
    check: profile.call * Math.exp(.8 * (.5 - strength)), aggressive: aggression
  };
  const aggressiveActions = actions.filter(action => ['bet', 'raise'].includes(action.type));
  const sizeWeight = action => {
    const keys = [...new Set(action.sizeKeys ?? (action.sizeKey ? [action.sizeKey] : []))];
    return keys.length ? keys.reduce((sum, key) => sum + (profile.sizes[key] ?? 0)
      * (key === 'allin' ? Math.exp(2 * (strength - .5)) : 1), 0) : 1;
  };
  const sizeTotal = aggressiveActions.reduce((sum, action) => sum + sizeWeight(action), 0);
  const raw = actions.map(action => ['bet', 'raise'].includes(action.type)
    ? (sizeTotal ? weights.aggressive * sizeWeight(action) / sizeTotal : 0) : (weights[action.type] ?? 0));
  const total = raw.reduce((sum, weight) => sum + weight, 0);
  if (!(total > 0) || !Number.isFinite(total)) throw new Error('No finite legal BOSS distribution.');
  const distribution = actions.map((action, index) => ({...action, probability: raw[index] / total, bossSizing: true}));
  const last = raw.findLastIndex(value => value > 0);
  distribution[last].probability = 1 - distribution.reduce((sum, action, index) => sum + (index === last ? 0 : action.probability), 0);
  return distribution;
}
