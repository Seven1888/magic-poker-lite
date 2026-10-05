import {makeDeck, normalizeCard, holeScore, evaluateBest} from './poker.mjs?v=35';
import {BOSS_PROFILE_BY_ID, classifyBossStrength, getBossProfileDistribution} from './boss-profiles.mjs?v=35';

export const BOSS_HAND_CATEGORIES = Object.freeze([
  ['high-card', 'High Card'], ['pair', 'Pair'], ['two-pair', 'Two Pair'],
  ['three-of-a-kind', 'Three of a Kind'], ['straight', 'Straight'], ['flush', 'Flush'],
  ['full-house', 'Full House'], ['four-of-a-kind', 'Four of a Kind'], ['straight-flush', 'Straight Flush']
].map(([key, label], category) => Object.freeze({category, key, label})));

const DECK = makeDeck();
const ACTIONS = ['fold', 'check', 'call', 'bet', 'raise'];
const STREET_SIZE = {preflop: 0, flop: 3, turn: 4, river: 5};
const LEGACY_DEFAULTS = {fold: .2, call: .6, raise: .2, check: .65, bet: .35, strengthInfluence: 1, priceInfluence: .6};
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

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

function normalizeObservation(input, index) {
  if (!input || typeof input !== 'object') throw new TypeError('公開證據須為物件。');
  const board = cards(input.board ?? [], null, '公開證據公共牌');
  const street = input.street ?? Object.keys(STREET_SIZE).find(key => STREET_SIZE[key] === board.length);
  if (!(street in STREET_SIZE) || STREET_SIZE[street] !== board.length) throw new TypeError('公開證據的街道與公牌數不符。');
  if (!Array.isArray(input.actions) || !input.actions.length) throw new TypeError('公開證據須包含當時的合法動作。');
  // Deliberately project only type: actual private-card probabilities are never read.
  const actions = input.actions.map(action => ({type: typeof action === 'string' ? action : action.type}));
  if (actions.some(action => !ACTIONS.includes(action.type)) || new Set(actions.map(action => action.type)).size !== actions.length) {
    throw new TypeError('公開證據的合法動作無效。');
  }
  const owed = input.owed ?? 0, pot = input.pot ?? 0;
  if (![owed, pot].every(value => Number.isFinite(value) && value >= 0)) throw new TypeError('公開投入金額無效。');
  const shownMode = input.shownMode ?? 'partial';
  if (!['badges', 'all', 'partial'].includes(shownMode)) throw new TypeError('公開機率的呈現模式無效。');
  const shown = (input.shown ?? []).map(item => {
    if (!actions.some(action => action.type === item.type)) throw new TypeError('公開機率不是合法動作。');
    if (typeof item.label === 'string') {
      const label = item.label.trim();
      if (label !== '<0.1%' && !/^\d+(?:\.\d+)?%$/.test(label)) throw new TypeError('公開機率標籤無效。');
      if (label !== '<0.1%' && Number(label.slice(0, -1)) > 100) throw new TypeError('公開機率不可大於 100%。');
      return {type: item.type, label};
    }
    if (!Number.isFinite(item.percent) || item.percent < 0 || item.percent > 100
      || !Number.isInteger(item.decimals ?? 1) || (item.decimals ?? 1) < 0 || (item.decimals ?? 1) > 6) {
      throw new TypeError('公開機率須提供實際可見標籤或百分比與精度。');
    }
    return {type: item.type, percent: item.percent, decimals: item.decimals ?? 1};
  });
  if (new Set(shown.map(item => item.type)).size !== shown.length) throw new TypeError('公開機率不可重複。');
  const selectedType = input.selectedType ?? null;
  if (selectedType !== null && !actions.some(action => action.type === selectedType)) throw new TypeError('已公開動作不是合法動作。');
  const id = String(input.id ?? index);
  const coreKey = JSON.stringify({street, board, actions, owed, pot, shownMode, shown});
  return {id, street, board, actions, owed, pot, shownMode, shown, selectedType, coreKey};
}

function normalizeEvidence(input, board) {
  if (!Array.isArray(input)) throw new TypeError('公開證據須為陣列。');
  const unique = new Map();
  input.forEach((value, index) => {
    const event = normalizeObservation(value, index);
    if (event.board.length > board.length || event.board.some((card, position) => card !== board[position])) {
      throw new TypeError('不能使用尚未揭開或不同牌局的公共牌證據。');
    }
    const previous = unique.get(event.id);
    if (previous && (previous.coreKey !== event.coreKey
      || (previous.selectedType && event.selectedType && previous.selectedType !== event.selectedType))) {
      throw new TypeError('同一公開事件的資料互相矛盾。');
    }
    if (!previous || event.selectedType || !previous.selectedType) unique.set(event.id, event);
  });
  return [...unique.values()];
}

function observedLabelsMatch(distribution, event) {
  const positive = distribution.filter(action => action.probability > 0);
  const visible = event.shownMode === 'badges' && positive.length !== 1
    ? positive.filter(action => ['fold', 'raise', 'bet'].includes(action.type)) : positive;
  if (event.shownMode !== 'partial'
    && (visible.length !== event.shown.length || visible.some(action => !event.shown.some(item => item.type === action.type)))) return false;
  return event.shown.every(item => {
    const probability = distribution.find(action => action.type === item.type)?.probability;
    if (!Number.isFinite(probability) || probability <= 0) return false;
    if (item.label !== undefined) {
      if (item.label === '<0.1%') return probability < .001;
      // The badge's special whole-number 100% appears only for an exact certainty.
      if (event.shownMode === 'badges' && item.label === '100%') return probability === 1;
      const decimals = item.label.includes('.') ? item.label.split('.')[1].length - 1 : 0;
      return `${(probability * 100).toFixed(decimals)}%` === item.label;
    }
    return Number((probability * 100).toFixed(item.decimals)) === item.percent;
  });
}

function legacyDistribution(feature, event, settings) {
  const price = event.owed / Math.max(.01, event.pot + event.owed);
  const s = settings.strengthInfluence, p = settings.priceInfluence, strength = feature.strength;
  const weights = event.actions.map(({type}) => {
    let weight = settings[type];
    if (type === 'fold') weight *= Math.exp(s * (.5 - strength) * 3 + p * (price - .2) * 2);
    if (type === 'call') weight *= Math.exp(s * (strength - .5) * .6);
    if (type === 'raise' || type === 'bet') weight *= Math.exp(s * (strength - .5) * 2.5 - p * price);
    if (type === 'check') weight *= Math.exp(-s * (strength - .5));
    return weight;
  });
  let total = weights.reduce((sum, value) => sum + value, 0);
  if (!total) {
    const passive = event.actions.findIndex(action => ['check', 'call'].includes(action.type));
    weights[passive < 0 ? 0 : passive] = 1;
    total = 1;
  }
  const distribution = event.actions.map((action, index) => ({...action, probability: weights[index] / total}));
  const last = distribution.findLastIndex(action => action.probability > 0);
  distribution[last].probability = 1 - distribution.reduce((sum, action, index) => sum + (index === last ? 0 : action.probability), 0);
  return distribution;
}

/**
 * Exact public-information posterior for the BOSS's CURRENT made-hand category.
 * Pass a sanitized config, never a hand/session. No hidden cards, deck, seed,
 * deal audit, game RNG or future board belong in this interface. manualProvided
 * records whether a manual NPC prior exists without sending its secret values.
 *
 * Each observation supplies only public street/board/actions/owed/pot, displayed
 * {type,label} values and, after it occurs, selectedType. Repeating an id does not
 * multiply its likelihood again. Full evidence is supplied on each update; a
 * changed prefix is replayed from the cached prior. Player actions are treated
 * as interventions, not as random draws from a guessed player strategy.
 */
export function createBossHandRange({playerHole, smallBlind, config = {}, bossProfileId} = {}) {
  const player = cards(playerHole, 2, '玩家手牌');
  if (!['player', 'npc'].includes(smallBlind)) throw new TypeError('須提供本手公開小盲位置。');
  const mode = config.boss?.mode ?? 'rotate';
  if (!['rotate', 'fixed', 'legacy'].includes(mode)) throw new TypeError('BOSS 模式無效。');
  const profileId = bossProfileId ?? config.boss?.profileId;
  if (mode !== 'legacy' && !BOSS_PROFILE_BY_ID[profileId]) throw new TypeError('須提供本手公開 BOSS 類型。');
  const manualBoss = config.deal?.npc?.manualProvided === true;
  const manualPlayer = config.deal?.player?.manualProvided === true || (config.deal?.player?.manual?.length ?? 0) > 0;
  const playerSetting = setting(config.deal?.player, .5), bossSetting = setting(config.deal?.npc, .25);
  const legacySettings = Object.fromEntries(Object.entries(LEGACY_DEFAULTS).map(([key, value]) => {
    const configured = config.npc?.[key] ?? value;
    if (!Number.isFinite(configured) || configured < 0 || configured > (key.endsWith('Influence') ? 4 : 1)) {
      throw new TypeError('舊版 BOSS 權重須使用已正規化的公開設定。');
    }
    return [key, configured];
  }));
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
  let weights = prior.slice(), previousBoard = [], previousEvents = [];
  const featuresByBoard = new Map(), distributionsByContext = new Map();

  function features(board) {
    const key = board.join('');
    if (!featuresByBoard.has(key)) featuresByBoard.set(key, candidates.map(hole => {
      if (hole.some(card => board.includes(card))) return null;
      if (mode !== 'legacy') {
        const classified = classifyBossStrength({holes: {npc: hole}, board});
        return {category: classified.category, band: classified.band};
      }
      if (board.length < 3) return {category: null, strength: holeScore(hole)};
      const evaluation = evaluateBest([...hole, ...board]);
      const base = [.18, .40, .57, .67, .76, .82, .89, .96, .995][evaluation.category];
      return {category: evaluation.category, strength: clamp(base + ((evaluation.rank[1] || 7) - 8) * .008, .03, .999)};
    }));
    return featuresByBoard.get(key);
  }

  function applyEvidence(event, shown, action) {
    const boardFeatures = features(event.board);
    const contextKey = JSON.stringify([event.street, event.board, event.actions, event.owed, event.pot]);
    if (!distributionsByContext.has(contextKey)) distributionsByContext.set(contextKey, new Map());
    const context = distributionsByContext.get(contextKey), likelihoods = new Map();
    for (let index = 0; index < candidates.length; index++) {
      if (!weights[index]) continue;
      const feature = boardFeatures[index];
      if (!feature) { weights[index] = 0; continue; }
      const key = mode === 'legacy' ? feature.strength : feature.band;
      if (!context.has(key)) context.set(key, mode === 'legacy' ? legacyDistribution(feature, event, legacySettings)
        : getBossProfileDistribution({holes: {npc: candidates[index]}, board: event.board, street: event.street,
          bossProfile: {id: profileId}, currentBet: event.owed, streetBets: {npc: 0}}, event.actions));
      if (!likelihoods.has(key)) {
        const distribution = context.get(key);
        const compatible = !shown || observedLabelsMatch(distribution, event);
        likelihoods.set(key, !compatible ? 0 : action && event.selectedType
          ? distribution.find(item => item.type === event.selectedType).probability : 1);
      }
      weights[index] *= likelihoods.get(key);
    }
  }

  return Object.freeze({update({board = [], evidence = []} = {}) {
    const visible = cards(board, null, '已揭公共牌');
    if (visible.length > 5 || visible.some(card => player.includes(card))) throw new TypeError('已揭公共牌無效。');
    const events = normalizeEvidence(evidence, visible);
    const replay = previousBoard.some((card, index) => visible[index] !== card)
      || previousEvents.length > events.length || previousEvents.some((old, index) => {
        const current = events[index];
        return !current || old.id !== current.id || old.coreKey !== current.coreKey
          || (old.selectedType && old.selectedType !== current.selectedType);
      });
    if (replay) { weights = prior.slice(); previousEvents = []; }
    for (let index = 0; index < candidates.length; index++) {
      if (weights[index] && candidates[index].some(card => visible.includes(card))) weights[index] = 0;
    }
    if (!manualBoss) for (let index = 0; index < events.length; index++) {
      const old = previousEvents[index], event = events[index];
      if (!old) applyEvidence(event, true, true);
      else if (!old.selectedType && event.selectedType) applyEvidence(event, false, true);
    }
    previousBoard = visible;
    previousEvents = events;
    const candidateCount = weights.reduce((sum, weight) => sum + Number(weight > 0), 0);
    const metadata = {candidateCount, evidenceCount: events.length, exact: true};
    if (manualBoss) return {status: 'unavailable', unavailable: 'manual-boss-prior', distribution: [], ...metadata};
    const denominator = weights.reduce((sum, weight) => sum + weight, 0);
    if (!denominator) return {status: 'inconsistent', unavailable: 'inconsistent-public-evidence', distribution: [], ...metadata};
    if (visible.length < 3) return {status: 'waiting-for-flop', distribution: [], ...metadata};
    const totals = new Float64Array(9), currentFeatures = features(visible);
    for (let index = 0; index < weights.length; index++) if (weights[index]) totals[currentFeatures[index].category] += weights[index];
    const distribution = BOSS_HAND_CATEGORIES.map(item => ({...item, probability: totals[item.category] / denominator}));
    // Put floating-point closure on the largest bin. A vanishing rare-category
    // probability must never become negative merely because other sums round up.
    const pivot = distribution.reduce((best, item, index) => item.probability > distribution[best].probability ? index : best, 0);
    distribution[pivot].probability = 1 - distribution.reduce((sum, item, index) => sum + (index === pivot ? 0 : item.probability), 0);
    distribution.sort((a, b) => b.probability - a.probability || b.category - a.category);
    return {status: 'ready', distribution, ...metadata};
  }});
}
