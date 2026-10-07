import {makeDeck, normalizeCard, evaluateBest, compareRanks, shuffle, holeScore} from './poker.mjs?v=59';

const TARGETS = ['win', 'nonWin'];
const SUITS = ['s', 'h', 'd', 'c'];
const RANKS = '23456789TJQKA';

export class OutcomeLayoutError extends Error {
  constructor(message, code) { super(message); this.name = 'OutcomeLayoutError'; this.code = code; }
}

function pair(value, label) {
  if (!Array.isArray(value) || value.length !== 2) throw new TypeError(label + ' must contain two cards.');
  const result = value.map(normalizeCard);
  if (new Set(result).size !== 2) throw new TypeError(label + ' contains duplicate cards.');
  return result;
}

function manualPair(config, seat) {
  const input = config.deal?.[seat]?.manual;
  return Array.isArray(input) && input.length ? pair(input, seat + ' manual') : null;
}

function samePair(a, b) { return a.every(card => b.includes(card)); }

function targetOf(playerRank, boss, board) {
  return compareRanks(playerRank, evaluateBest([...boss, ...board]).rank) > 0 ? 'win' : 'nonWin';
}

function specialSets(tier) {
  if (tier === 'royal') return SUITS.map(suit => [...'TJQKA'].map(rank => rank + suit));
  if (tier === 'straightFlush') return SUITS.flatMap(suit => Array.from({length: 9}, (_, i) => {
    const ranks = i === 0 ? 'A2345' : RANKS.slice(i - 1, i + 4);
    return [...ranks].map(rank => rank + suit);
  }));
  if (tier === 'quads') return [...RANKS].map(rank => SUITS.map(suit => rank + suit));
  throw new TypeError('Unknown special qualification tier.');
}

function qualifiedBoard(player, manualBoss, deal, qualification, rng) {
  const choices = specialSets(qualification.tier).filter(cards => cards.some(card => player.includes(card))
    && !cards.some(card => manualBoss?.includes(card)));
  if (!choices.length) return null;
  const special = choices[Math.floor(rng() * choices.length)];
  const missing = special.filter(card => !player.includes(card));
  const reserved = new Set([...player, ...missing, ...(manualBoss || [])]);
  const fillers = deal.deck.filter(card => !reserved.has(card));
  return shuffle([...missing, ...fillers.slice(0, 5 - missing.length)], rng);
}

/** Exact qualification, including the player's special cards rather than a quads kicker. */
export function layoutMatchesQualification({player, board, qualification, playerEvaluation = evaluateBest([...player, ...board])}) {
  if (!qualification) return true;
  const boardEvaluation = evaluateBest(board);
  if (boardEvaluation.category >= 7) return false;
  const tier = playerEvaluation.royal ? 'royal' : playerEvaluation.category === 8 ? 'straightFlush'
    : playerEvaluation.category === 7 ? 'quads' : null;
  if (tier !== qualification.tier) return false;
  if (tier === 'quads') return player.some(card => RANKS.indexOf(card[0]) + 2 === playerEvaluation.rank[1]);
  return player.some(card => playerEvaluation.best5.includes(card));
}

function targetAudit(cards, manual) {
  const score = holeScore(cards), classification = cards[0][0] === cards[1][0] ? 'pair' : 'unpaired';
  return {manual, rerollMode: 'prebuilt-outcome', initialClass: classification, finalClass: classification,
    initialScore: score, finalScore: score, attempts: manual ? 0 : 1, rerolls: 0,
    stopReason: manual ? 'manual' : 'outcome-target'};
}

/**
 * Produce one unpublished layout candidate. The tree builder owns retries.
 * dealHoles(config,rng,firstSeat) preserves the engine's configured player deal.
 * No engine/session is imported or committed here; pass a private build RNG.
 */
export function createOutcomeLayout({config, rng, requiredTargets = TARGETS, dealHoles,
  firstSeat = 'player', qualification = null, qualifyLayout} = {}) {
  if (!config || typeof rng !== 'function' || typeof dealHoles !== 'function') {
    throw new TypeError('Layout requires config, a build RNG and dealHoles callback.');
  }
  if (!Array.isArray(requiredTargets) || !requiredTargets.length
    || requiredTargets.some(target => !TARGETS.includes(target))) throw new TypeError('Invalid layout targets.');
  if (qualifyLayout !== undefined && typeof qualifyLayout !== 'function') throw new TypeError('qualifyLayout must be a function.');
  const playerManual = manualPair(config, 'player'), bossManual = manualPair(config, 'npc');
  if (bossManual && new Set(requiredTargets).size > 1) {
    throw new OutcomeLayoutError('Fixed Boss cards cannot realize both win and nonWin on one fixed board.', 'MANUAL_BOSS_TARGET_CONFLICT');
  }
  const deal = dealHoles(config, rng, firstSeat);
  const player = pair(deal?.holes?.player, 'Dealt player cards');
  const originalBoss = pair(deal?.holes?.npc, 'Dealt Boss cards');
  const deck = Array.isArray(deal?.deck) ? deal.deck.map(normalizeCard) : [];
  if (deck.length !== 48 || new Set([...player, ...originalBoss, ...deck]).size !== 52) {
    throw new OutcomeLayoutError('dealHoles must return one unique 52-card deal.', 'INVALID_DEAL');
  }
  if ((playerManual && !samePair(player, playerManual)) || (bossManual && !samePair(originalBoss, bossManual))) {
    throw new OutcomeLayoutError('dealHoles did not preserve configured manual cards.', 'MANUAL_CARDS_CHANGED');
  }
  const normalizedDeal = {...deal, deck};
  const board = qualification ? qualifiedBoard(player, bossManual, normalizedDeal, qualification, rng) : deck.slice(0, 5);
  if (!board) return null;
  const playerEvaluation = evaluateBest([...player, ...board]);
  const candidate = {player: [...player], board: [...board], qualification, config, playerEvaluation};
  if (!layoutMatchesQualification(candidate) || (qualifyLayout && !qualifyLayout(candidate))) return null;
  const fixed = new Set([...player, ...board]);
  const available = makeDeck().filter(card => !fixed.has(card));
  const matches = Object.fromEntries(requiredTargets.map(target => [target, []]));
  if (bossManual) {
    if (bossManual.some(card => fixed.has(card))) return null;
    const target = targetOf(playerEvaluation.rank, bossManual, board);
    if (matches[target]) matches[target].push(bossManual);
  } else {
    for (let i = 0; i < available.length - 1; i++) for (let j = i + 1; j < available.length; j++) {
      const cards = [available[i], available[j]], target = targetOf(playerEvaluation.rank, cards, board);
      if (matches[target]) matches[target].push(cards);
    }
  }
  if (requiredTargets.some(target => !matches[target].length)) return null;
  const boss = {}, npcByTarget = {};
  for (const target of requiredTargets) {
    const choices = matches[target];
    boss[target] = [...choices[bossManual ? 0 : Math.floor(rng() * choices.length)]];
    npcByTarget[target] = targetAudit(boss[target], !!bossManual);
  }
  return {player, board, boss, deckOrder: shuffle(available, rng),
    dealAudit: {player: deal.audit?.player ? structuredClone(deal.audit.player) : targetAudit(player, !!playerManual), npcByTarget},
    qualification: qualification ? structuredClone(qualification) : null};
}
