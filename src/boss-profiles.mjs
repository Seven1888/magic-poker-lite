import {evaluateBest, normalizeCard, RANKS} from './poker.mjs?v=58';

const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const row = (fold, call, raise) => ({fold, call, raise});
const STREETS = ['preflop', 'flop', 'turn', 'river'];
const rankOf = card => RANKS.indexOf(card[0]) + 2;
export const BOSS_PROFILE_VERSION = 'two-boss-price-response-v4';
export const BOSS_RAISE_SIZE_WEIGHTS = freeze({half: .5, pot: .35, allin: .15});
export const BOSS_RESPONSE_PRESSURES = freeze({half: '半池以下', pot: '超過半池至全池', large: '超過全池'});
export const BOSS_BANDS = freeze({
  weak: {label: '不強', description: '沒有符合本階段的成牌、聽牌或明確詐唬條件。'},
  strong: {label: '強', description: '符合本階段的成牌、聽牌或明確詐唬條件；同一街道鎖定分類。'}
});
export const BOSS_BANDS_BY_STREET = freeze(Object.fromEntries(STREETS.map(street => [street, ['weak', 'strong']])));
export const BOSS_PROFILES = freeze([
  {id: 'caller', name: '不激進', nickname: 'PASSIVE', description: '較少主動下注或加注，不強時也比較願意跟注。',
    weights: {weak: row(25, 75, 0), strong: row(5, 65, 30)},
    pressureWeights: {pot: {weak: row(40, 60, 0), strong: row(10, 70, 20)},
      large: {weak: row(55, 45, 0), strong: row(15, 85, 0)}}},
  {id: 'maniac', name: '激進', nickname: 'AGGRESSIVE', description: '符合成牌、聽牌或詐唬條件時，較常主動下注或加注。',
    weights: {weak: row(45, 55, 0), strong: row(5, 25, 70)},
    pressureWeights: {pot: {weak: row(55, 45, 0), strong: row(10, 40, 50)},
      large: {weak: row(70, 30, 0), strong: row(20, 80, 0)}}}
].map(profile => ({...profile, pressureWeights: {half: profile.weights, ...profile.pressureWeights},
  tables: Object.fromEntries(STREETS.map(street => [street, profile.weights]))})));
export const BOSS_PROFILE_IDS = freeze(BOSS_PROFILES.map(profile => profile.id));
export const BOSS_PROFILE_BY_ID = freeze(Object.fromEntries(BOSS_PROFILES.map(profile => [profile.id, profile])));

export function normalizeBossConfig(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('BOSS 設定須為物件。');
  const mode = input.mode ?? 'random';
  const importedId = input.profileId ?? 'caller';
  const profileId = ['sniper', 'trapper'].includes(importedId) ? 'caller' : importedId;
  if (!['random', 'rotate', 'fixed', 'legacy'].includes(mode)) throw new TypeError('BOSS 模式須為 random、rotate、fixed 或 legacy。');
  if (!BOSS_PROFILE_BY_ID[profileId]) throw new TypeError('未知 BOSS 類型。');
  return {mode, profileId};
}

/** Independent 50/50 encounters; explicit historical rotate retains its exclusion rule. */
export function selectBossProfile(rng, previousId = null, input = {}) {
  const {mode, profileId} = normalizeBossConfig(input);
  if (mode === 'legacy') return {profile: null, selection: {mode, probability: 1, previousId, eligibleIds: []}};
  if (mode === 'fixed') return {profile: BOSS_PROFILE_BY_ID[profileId], selection: {mode, probability: 1, previousId, eligibleIds: [profileId]}};
  const eligibleIds = mode === 'random' ? [...BOSS_PROFILE_IDS] : BOSS_PROFILE_IDS.filter(id => id !== previousId);
  const roll = rng();
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new RangeError('BOSS 選取亂數須介於 0（含）與 1（不含）。');
  const id = eligibleIds[Math.floor(roll * eligibleIds.length)];
  return {profile: BOSS_PROFILE_BY_ID[id], selection: {mode, probability: 1 / eligibleIds.length, previousId, eligibleIds}};
}

function drawFeatures(hole, board) {
  const visible = [...hole, ...board];
  const suits = Object.fromEntries(['s', 'h', 'd', 'c'].map(suit => [suit, visible.filter(card => card[1] === suit).length]));
  const flushSuits = Object.keys(suits).filter(suit => suits[suit] === 4);
  const ranks = new Set(visible.map(rankOf)), boardRanks = new Set(board.map(rankOf));
  if (ranks.has(14)) ranks.add(1);
  if (boardRanks.has(14)) boardRanks.add(1);
  const exclusiveHole = rank => ranks.has(rank) && !boardRanks.has(rank);
  let openEndedStraightDraw = false, holeOpenEndedStraightDraw = false, gutshot = false, holeGutshot = false;
  // The endpoints must both exist as card ranks: A234 and JQKA have only one out rank.
  for (let low = 2; low <= 10; low++) {
    const required = Array.from({length: 4}, (_, index) => low + index);
    if (required.every(rank => ranks.has(rank))) {
      openEndedStraightDraw = true;
      holeOpenEndedStraightDraw ||= required.some(exclusiveHole);
    }
  }
  for (let low = 1; low <= 10; low++) {
    const window = Array.from({length: 5}, (_, index) => low + index);
    const missing = window.filter(rank => !ranks.has(rank));
    if (missing.length === 1 && missing[0] !== low && missing[0] !== low + 4) {
      gutshot = true;
      holeGutshot ||= window.filter(rank => ranks.has(rank)).some(exclusiveHole);
    }
  }
  return {flushDraw: flushSuits.length > 0, holeFlushDraw: hole.some(card => flushSuits.includes(card[1])),
    openEndedStraightDraw, holeOpenEndedStraightDraw, gutshot, holeGutshot};
}

/** Pure classifier: own hole cards, revealed board and completed Turn actions only. No RNG or bet price. */
export function classifyBossStrength(hand) {
  const hole = hand.holes.npc.map(normalizeCard);
  const street = hand.street;
  if (!STREETS.includes(street)) throw new Error('未知 BOSS 判定階段。');
  const count = {preflop: 0, flop: 3, turn: 4, river: 5}[street];
  const board = hand.board.slice(0, count).map(normalizeCard);
  if (hole.length !== 2 || board.length !== count || new Set([...hole, ...board]).size !== hole.length + board.length) {
    throw new Error('BOSS 判定需要本階段有效且不重複的底牌與已揭公共牌。');
  }
  const reasons = [];
  if (street === 'preflop') {
    if (hole[0][0] === hole[1][0]) reasons.push('pocket-pair');
    if (hole.every(card => rankOf(card) >= 10)) reasons.push('two-broadway');
    if (hole[0][1] === hole[1][1] && hole.some(card => card[0] === 'A')) reasons.push('suited-ace');
    return {band: reasons.length ? 'strong' : 'weak', category: null, reasons,
      flushDraw: false, holeFlushDraw: false, openEndedStraightDraw: false, holeOpenEndedStraightDraw: false,
      straightDraw: false, gutshot: false, holeGutshot: false};
  }
  const category = evaluateBest([...hole, ...board]).category;
  const features = street === 'river'
    ? {flushDraw: false, holeFlushDraw: false, openEndedStraightDraw: false, holeOpenEndedStraightDraw: false, gutshot: false, holeGutshot: false}
    : drawFeatures(hole, board);
  if (category >= 1) reasons.push('made-pair-plus');
  if (features.flushDraw) reasons.push('four-flush');
  if (features.openEndedStraightDraw) reasons.push('open-ended-straight');
  if (features.holeGutshot && hole.some(card => rankOf(card) > Math.max(...board.map(rankOf)))) reasons.push('gutshot-overcard-bluff');
  if (street === 'river' && category === 0) {
    const turnAggression = (hand.history ?? []).some(action => action.street === 'turn' && action.actor === 'npc'
      && (action.type === 'bet' || action.type === 'raise'));
    if (turnAggression) {
      // The Turn snapshot matters even for historical engines with branch-dependent private cards.
      const turn = hand.bossStreetStates?.turn ?? drawFeatures(hole, board.slice(0, 4));
      if (turn.holeFlushDraw || turn.holeOpenEndedStraightDraw) reasons.push('missed-turn-draw-bluff');
      if (hole.some(card => card[0] === 'A' && board.filter(publicCard => publicCard[1] === card[1]).length === 3)) reasons.push('ace-flush-blocker-bluff');
    }
  }
  return {band: reasons.length ? 'strong' : 'weak', category, reasons, ...features,
    straightDraw: features.openEndedStraightDraw};
}

/** Call at street entry, before either player acts. Each immutable snapshot is replaced only on a new street. */
export function lockBossStreetStrength(hand) {
  if (hand.bossStreetStrength?.street === hand.street) return hand.bossStreetStrength;
  const snapshot = freeze({street: hand.street, ...classifyBossStrength(hand)});
  hand.bossStreetStrength = snapshot;
  hand.bossStreetStates = freeze({...hand.bossStreetStates, [hand.street]: snapshot});
  return snapshot;
}

/** Actual callable price, independent of the selected button label or private cards.
 * P is the pot after the player's call but before their raise increment. The engine
 * rounds chip amounts to 1e-6; one chip quantum prevents half/pot rounding drift.
 * Historical non-Holdem modes retain their original single response table.
 */
export function getBossResponsePressure(hand) {
  if (!['fixed-holdem', 'pooled-holdem'].includes(hand.config?.outcome?.mode)
    || !Number.isFinite(hand.pot) || !Number.isFinite(hand.currentBet) || !Number.isFinite(hand.streetBets?.npc)) {
    return {key: 'half', callAmount: 0, basePot: 0};
  }
  const owed = Math.max(0, hand.currentBet - hand.streetBets.npc);
  const callAmount = Math.min(owed, Math.max(0, hand.stacks?.npc ?? owed));
  const basePot = Math.max(0, hand.pot - owed), tolerance = .000001;
  const key = callAmount <= basePot * .5 + tolerance ? 'half'
    : callAmount <= basePot + tolerance ? 'pot' : 'large';
  return {key, callAmount, basePot};
}

function lockedWeights(hand, pressure = getBossResponsePressure(hand).key) {
  const profile = BOSS_PROFILE_BY_ID[hand.bossProfile?.id];
  if (!profile) throw new Error('牌局缺少已鎖定的 BOSS 類型。');
  const state = hand.bossStreetStrength?.street === hand.street ? hand.bossStreetStrength : lockBossStreetStrength(hand);
  const weights = profile.pressureWeights[pressure]?.[state.band];
  if (!weights) throw new Error('BOSS 行為表缺少目前分類。');
  return weights;
}

/** Public numeric contract. It deliberately omits classification, reasons and all card data. */
export function getBossProbabilityScenarios(hand) {
  const scenarios = weights => {
    const passive = weights.fold + weights.call;
    return {facing: {fold: weights.fold / 100, call: weights.call / 100, raise: weights.raise / 100},
      noRaise: {fold: weights.fold / passive, call: weights.call / passive}};
  };
  const base = lockedWeights(hand, 'half'), current = scenarios(lockedWeights(hand));
  return {facing: current.facing, free: {check: (base.fold + base.call) / 100, raise: base.raise / 100},
    noRaise: current.noRaise, sizes: {...BOSS_RAISE_SIZE_WEIGHTS},
    byPressure: Object.fromEntries(Object.keys(BOSS_RESPONSE_PRESSURES).map(key => [key, scenarios(lockedWeights(hand, key))]))};
}

/** Apply public context rules, then distribute aggression over the legal, merged size choices. */
export function getBossProfileDistribution(hand, actions) {
  if (!actions.length) return [];
  const canCheck = actions.some(action => action.type === 'check');
  const weights = canCheck ? lockedWeights(hand, 'half') : lockedWeights(hand);
  const aggressive = actions.filter(action => action.type === 'bet' || action.type === 'raise');
  const sizeMass = action => {
    const keys = action.sizeKeys ?? (action.sizeKey ? [action.sizeKey] : null);
    return keys ? [...new Set(keys)].reduce((sum, key) => sum + (BOSS_RAISE_SIZE_WEIGHTS[key] ?? 0), 0) : 1 / aggressive.length;
  };
  const aggressionTotal = aggressive.reduce((sum, action) => sum + sizeMass(action), 0);
  const raw = actions.map(action => {
    if (action.type === 'fold') return canCheck ? 0 : weights.fold;
    if (action.type === 'check') return weights.fold + weights.call;
    if (action.type === 'call') return weights.call;
    if (action.type === 'bet' || action.type === 'raise') return aggressionTotal ? weights.raise * sizeMass(action) / aggressionTotal : 0;
    return 0;
  });
  let total = raw.reduce((sum, value) => sum + value, 0);
  if (!total) {
    const passive = actions.findIndex(action => action.type === 'check' || action.type === 'call');
    if (passive < 0) throw new Error('BOSS 沒有可用的被動動作。');
    raw[passive] = 1; total = 1;
  }
  const twoStageSizing = ['fixed-holdem', 'pooled-holdem'].includes(hand.config?.outcome?.mode);
  const distribution = actions.map((action, index) => ({...action, probability: raw[index] / total,
    ...(twoStageSizing ? {bossSizing: true} : {})}));
  const last = raw.findLastIndex(value => value > 0);
  distribution[last].probability = 1 - distribution.reduce((sum, action, index) => sum + (index === last ? 0 : action.probability), 0);
  return distribution;
}
