import {makeDeck, shuffle, holeScore} from './poker.mjs?v=60';

const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};

/** Versioned mechanics, not an RTP certification or a promise of a particular winner. */
export const NATURAL_HOLDEM_RULES = freeze({
  id: 'natural-holdem-v1', dealModel: 'uniform-deck-locked-v1',
  bossPolicy: 'natural-boss-pressure-v1', bettingModel: 'heads-up-nl-player-2p-4p-v1',
  settlementModel: 'matched-pot-full-return-v1', poolModel: 'none', jackpotModel: 'none'
});

function invalid(message) {
  const error = new Error(`Natural Holdem integrity: ${message}`);
  error.code = 'NATURAL_HOLDEM_INTEGRITY';
  throw error;
}

const sameCards = (left, right) => Array.isArray(left) && left.length === right.length
  && left.every((card, index) => card === right[index]);
const sameData = (left, right) => {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object'
    || Array.isArray(left) !== Array.isArray(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && sameData(left[key], right[key]));
};

/** Exactly one Fisher-Yates shuffle. No result selection, retries, or private-card replacement. */
export function createNaturalHoldemDeal(config, rng, firstSeat) {
  if (!['player', 'npc'].includes(firstSeat)) invalid('unknown first seat');
  if (['player', 'npc'].some(seat => config.deal?.[seat]?.manual?.length
    || config.deal?.[seat]?.rerollChance || config.deal?.[seat]?.maxRerolls)) {
    invalid('uniform dealing does not accept manual cards or rerolls');
  }
  const order = shuffle(makeDeck(), () => {
    const value = rng();
    if (!Number.isFinite(value) || value < 0 || value >= 1) invalid('invalid deal RNG');
    return value;
  });
  const secondSeat = firstSeat === 'player' ? 'npc' : 'player';
  const holes = {[firstSeat]: [order[0], order[2]], [secondSeat]: [order[1], order[3]]};
  const audit = Object.fromEntries(['player', 'npc'].map(seat => {
    const cards = holes[seat], cardClass = cards[0][0] === cards[1][0] ? 'pair' : 'unpaired';
    return [seat, {manual: false, initialClass: cardClass, finalClass: cardClass,
      initialScore: holeScore(cards), finalScore: holeScore(cards), attempts: 1, rerolls: 0, stopReason: 'natural-deal'}];
  }));
  return {holes, deck: order.slice(4), audit,
    naturalHoldem: {model: NATURAL_HOLDEM_RULES.id, firstSeat, order, configSnapshot: structuredClone(config)},
    rulesSnapshot: structuredClone(NATURAL_HOLDEM_RULES)};
}

/** Validate before committing an action or restored snapshot. This is an integrity check, not cryptographic attestation. */
export function assertNaturalHoldemIntegrity(hand) {
  if (hand?.config?.outcome?.mode !== 'natural-holdem') invalid('wrong hand model');
  const rules = hand.rulesSnapshot;
  if (!rules || Object.keys(rules).length !== Object.keys(NATURAL_HOLDEM_RULES).length
    || Object.entries(NATURAL_HOLDEM_RULES).some(([key, value]) => rules[key] !== value)) invalid('unknown rules snapshot');
  if (hand.config.targetRtp !== 1 || hand.config.jackpotEnabled !== false) invalid('settlement rules changed');
  if (['player', 'npc'].some(seat => hand.config.deal?.[seat]?.manual?.length
    || hand.config.deal?.[seat]?.rerollChance || hand.config.deal?.[seat]?.maxRerolls)) invalid('deal rules changed');
  for (const key of ['outcomeDecision', 'outcomePlanning', 'pooledHoldem', '_outcomeTree', '_outcomeNodeId', 'outcomeHandId', 'outcomePoolsBefore']) {
    if (Object.hasOwn(hand, key)) invalid(`forbidden result controller: ${key}`);
  }
  const deal = hand.naturalHoldem;
  if (!deal || deal.model !== rules.id || deal.firstSeat !== hand.smallBlind
    || !['player', 'npc'].includes(deal.firstSeat)) invalid('missing or inconsistent locked deal');
  if (!sameData(hand.config, deal.configSnapshot)) invalid('hand configuration changed from its opening snapshot');
  if (!['random', 'fixed'].includes(hand.config.boss?.mode)
    || !['caller', 'maniac'].includes(hand.bossProfile?.id)) invalid('unknown BOSS configuration');
  const order = deal.order, fullDeck = makeDeck();
  if (!Array.isArray(order) || order.length !== 52 || new Set(order).size !== 52
    || order.some(card => !fullDeck.includes(card))) invalid('locked deal must contain all 52 cards once');
  const secondSeat = deal.firstSeat === 'player' ? 'npc' : 'player';
  if (!sameCards(hand.holes?.[deal.firstSeat], [order[0], order[2]])
    || !sameCards(hand.holes?.[secondSeat], [order[1], order[3]])) invalid('private cards changed');
  const count = {preflop: 0, flop: 3, turn: 4, river: 5}[hand.street];
  if (count === undefined || !sameCards(hand.board, order.slice(4, 4 + count))
    || !sameCards(hand.deck, order.slice(4 + count))) invalid('public cards or remaining order changed');
  if (hand.result && (hand.result.jackpot !== null || hand.result.outcomePoolAudit !== null
    || hand.result.fee !== 0 || hand.result.player?.jackpotAward !== 0 || hand.result.npc?.jackpotAward !== 0)) {
    invalid('unexpected fee, pool payment, or jackpot');
  }
  return true;
}

/** Freeze an existing valid deal/rules snapshot, including after JSON restore. Never deals or repairs missing data. */
export function lockNaturalHoldemDeal(hand) {
  assertNaturalHoldemIntegrity(hand);
  freeze(hand.naturalHoldem);
  freeze(hand.rulesSnapshot);
  freeze(hand.config);
  freeze(hand.holes);
  return hand;
}
