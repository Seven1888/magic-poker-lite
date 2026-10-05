import {normalizeCard, RANKS, SUITS} from './poker.mjs?v=35';
import {rankEncodedHand} from './holdem-rank.mjs?v=43';

const DEFAULT_PREFLOP_SAMPLES = 100000;
const encode = card => SUITS.indexOf(card[1]) * 13 + RANKS.indexOf(card[0]);

function knownCards({playerHole, board = []} = {}) {
  if (!Array.isArray(playerHole) || playerHole.length !== 2) throw new TypeError('Player hole cards must contain exactly two cards.');
  if (!Array.isArray(board) || ![0, 3, 4, 5].includes(board.length)) throw new TypeError('The revealed board must contain 0, 3, 4 or 5 cards.');
  const hole = playerHole.map(normalizeCard).map(encode).sort((a, b) => a - b);
  const community = board.map(normalizeCard).map(encode).sort((a, b) => a - b);
  if (new Set([...hole, ...community]).size !== hole.length + community.length) throw new TypeError('Known cards must be unique.');
  return {hole, community};
}

// This separate generator belongs only to the preflop estimator. Its seed is
// derived from normalized, sorted known cards; it never receives a game seed.
function localUint32(cards) {
  let state = 2166136261;
  for (const card of cards) state = Math.imul(state ^ (card + 1), 16777619) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return (value ^ (value >>> 14)) >>> 0;
  };
}

/**
 * Heads-up standard Texas Hold'em equity against a uniformly random unknown
 * opponent: (wins + ties / 2) / outcomes. Every completion of the remaining
 * deck is equally likely. No BOSS identity, action, redraw rule, hidden card,
 * engine, session or game RNG is an input.
 *
 * FLOP/TURN/RIVER enumerate all disjoint future-board/opponent combinations.
 * PREFLOP uses deterministic uniform Monte Carlo because full enumeration is
 * impractical. preflopSamples affects only that approximation (default 100k).
 */
export function calculateHoldemEquity(input, {preflopSamples = DEFAULT_PREFLOP_SAMPLES} = {}) {
  const {hole, community} = knownCards(input);
  if (!Number.isSafeInteger(preflopSamples) || preflopSamples < 1 || preflopSamples > 10000000) {
    throw new RangeError('preflopSamples must be an integer from 1 through 10000000.');
  }
  const remaining = Array.from({length: 52}, (_, card) => card)
    .filter(card => !hole.includes(card) && !community.includes(card));
  // Reused arrays keep the million-outcome flop hot path allocation-free.
  const hero = [hole[0], hole[1], ...community], opponent = [0, 0, ...community];
  hero.length = opponent.length = 7;
  let wins = 0, ties = 0, losses = 0;
  function count(heroRank, opponentRank) {
    if (heroRank > opponentRank) wins++;
    else if (heroRank < opponentRank) losses++;
    else ties++;
  }
  function opponents(heroRank, excludedFirst = -1, excludedSecond = -1) {
    for (let first = 0; first < remaining.length - 1; first++) {
      if (first === excludedFirst || first === excludedSecond) continue;
      opponent[0] = remaining[first];
      for (let second = first + 1; second < remaining.length; second++) {
        if (second === excludedFirst || second === excludedSecond) continue;
        opponent[1] = remaining[second];
        count(heroRank, rankEncodedHand(opponent));
      }
    }
  }
  const exact = community.length > 0;
  if (community.length === 5) {
    opponents(rankEncodedHand(hero));
  } else if (community.length === 4) {
    for (let river = 0; river < remaining.length; river++) {
      hero[6] = opponent[6] = remaining[river];
      opponents(rankEncodedHand(hero), river);
    }
  } else if (community.length === 3) {
    for (let turn = 0; turn < remaining.length - 1; turn++) {
      hero[5] = opponent[5] = remaining[turn];
      for (let river = turn + 1; river < remaining.length; river++) {
        hero[6] = opponent[6] = remaining[river];
        opponents(rankEncodedHand(hero), turn, river);
      }
    }
  } else {
    const next = localUint32(hole), swaps = new Uint8Array(7);
    const limits = Array.from({length: 7}, (_, index) => Math.floor(4294967296 / (50 - index)) * (50 - index));
    for (let sample = 0; sample < preflopSamples; sample++) {
      // Partial Fisher–Yates, with rejection to avoid integer modulo bias.
      for (let index = 0; index < 7; index++) {
        let value; do { value = next(); } while (value >= limits[index]);
        const chosen = index + value % (50 - index), card = remaining[index];
        swaps[index] = chosen; remaining[index] = remaining[chosen]; remaining[chosen] = card;
      }
      for (let index = 0; index < 5; index++) hero[index + 2] = opponent[index + 2] = remaining[index];
      opponent[0] = remaining[5]; opponent[1] = remaining[6];
      count(rankEncodedHand(hero), rankEncodedHand(opponent));
      for (let index = 6; index >= 0; index--) {
        const chosen = swaps[index], card = remaining[index];
        remaining[index] = remaining[chosen]; remaining[chosen] = card;
      }
    }
  }
  const outcomes = wins + ties + losses, equity = (wins + ties / 2) / outcomes;
  const variance = Math.max(0, (wins + ties / 4) / outcomes - equity ** 2);
  return {wins, ties, losses, outcomes, equity,
    winRate: wins / outcomes, tieRate: ties / outcomes, lossRate: losses / outcomes,
    exact, method: exact ? 'exact-enumeration' : 'deterministic-monte-carlo',
    standardError: exact ? 0 : Math.sqrt(variance / outcomes)};
}
