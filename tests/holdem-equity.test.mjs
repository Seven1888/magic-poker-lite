import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateHoldemEquity} from '../src/holdem-equity.mjs';
import {rankEncodedHand, HOLDEM_CATEGORY_UNIT} from '../src/holdem-rank.mjs';
import {makeDeck, evaluateBest, compareRanks, createRng, normalizeCard} from '../src/poker.mjs';

const deck = makeDeck();
const encode = cards => cards.map(card => deck.indexOf(normalizeCard(card)));
const referenceScore = rank => Array.from({length: 6}, (_, index) => rank[index] || 0)
  .reduce((score, digit) => score * 15 + digit, 0);

test('numeric evaluator matches every category, kickers, wheel, two trips and three pairs', () => {
  const examples = [
    ['Ts Js Qs Ks As 2h 3d', 8], ['As 2s 3s 4s 5s Kh Kd', 8],
    ['2s 3s 4s 5s 6s Ac Ad', 8], ['As Ah Ad Ac Ks Qh Jh', 7],
    ['As Ah Ad Ks Kh Kd 2c', 6], ['As Ah Ks Kh Kd 2d 3c', 6],
    ['Ac Kc Qc 9c 8c 7c 2c', 5], ['As 2d 3s 4h 5s 9d Kc', 4],
    ['As 2d 3s 4h 5s 6c Kd', 4], ['As Ah Ad Ks Qh 9c 2d', 3],
    ['As Ah Ks Kh Qs Qh 2d', 2], ['As Ah Ks Qh 9s 8c 2d', 1],
    ['As Kh Qd 9c 8s 7d 2c', 0], ['2s 3s 4s 5s 6h 7h 8h', 4],
    ['As Ks Qs Js 9s 8s 7s', 5], ['Ac Ad Ah 2s 2d 3s 3d', 6],
    ['As Ah Ad Ac 2s 2h 2d', 7], ['Ks Kh Kd Kc As Ah Ad', 7]
  ];
  for (const [text, category] of examples) {
    const cards = text.split(' '), score = rankEncodedHand(encode(cards));
    assert.equal(Math.floor(score / HOLDEM_CATEGORY_UNIT), category, text);
    assert.equal(score, referenceScore(evaluateBest(cards).rank), text);
  }
  assert.ok(rankEncodedHand(encode(examples[2][0].split(' '))) > rankEncodedHand(encode(examples[1][0].split(' '))));
});

test('numeric evaluator agrees with independent string evaluator and comparisons on 18,000 seeded hands', () => {
  const rng = createRng('holdem-rank-independent-18000');
  let previous = null;
  for (const count of [5, 6, 7]) for (let sample = 0; sample < 6000; sample++) {
    const pool = [...deck];
    for (let index = 0; index < count; index++) {
      const chosen = index + Math.floor(rng() * (52 - index));
      [pool[index], pool[chosen]] = [pool[chosen], pool[index]];
    }
    const cards = pool.slice(0, count), reference = evaluateBest(cards).rank;
    const score = rankEncodedHand(encode(cards));
    assert.equal(score, referenceScore(reference), cards.join(' '));
    if (previous) assert.equal(Math.sign(score - previous.score), compareRanks(reference, previous.reference));
    previous = {score, reference};
  }
});

// Independent oracle enumerates opponent cards first, then the river. It uses
// the existing string-card evaluator, not the new numeric ranking or loops.
function referenceEquity(playerHole, board) {
  const remaining = deck.filter(card => !playerHole.includes(card) && !board.includes(card));
  const heroRanks = new Map();
  let wins = 0, ties = 0, losses = 0;
  function visit(first, second, river) {
    const complete = river === null ? board : [...board, river];
    const key = river || 'river-complete';
    if (!heroRanks.has(key)) heroRanks.set(key, evaluateBest([...playerHole, ...complete]).rank);
    const result = compareRanks(heroRanks.get(key), evaluateBest([first, second, ...complete]).rank);
    if (result > 0) wins++; else if (result < 0) losses++; else ties++;
  }
  for (let first = 0; first < remaining.length - 1; first++) for (let second = first + 1; second < remaining.length; second++) {
    if (board.length === 5) visit(remaining[first], remaining[second], null);
    else for (let river = 0; river < remaining.length; river++) {
      if (river !== first && river !== second) visit(remaining[first], remaining[second], remaining[river]);
    }
  }
  return {wins, ties, losses, outcomes: wins + ties + losses};
}

test('river equity exactly matches independent 990-opponent oracles, including board ties and kickers', () => {
  const fixtures = [
    {playerHole: ['Ah', 'Kd'], board: ['As', '7h', '7s', '9c', '2d']},
    {playerHole: ['2h', '3d'], board: ['Ts', 'Js', 'Qs', 'Ks', 'As']},
    {playerHole: ['3h', '4h'], board: ['2s', '2h', '2d', '2c', 'Ac']},
    {playerHole: ['As', '2d'], board: ['3s', '4h', '5s', '6c', 'Kd']}
  ];
  for (const fixture of fixtures) {
    const result = calculateHoldemEquity(fixture), expected = referenceEquity(fixture.playerHole, fixture.board);
    assert.deepEqual({wins: result.wins, ties: result.ties, losses: result.losses, outcomes: result.outcomes}, expected);
    assert.equal(result.outcomes, 990);
    assert.equal(result.equity, (expected.wins + expected.ties / 2) / expected.outcomes);
    assert.equal(result.exact, true); assert.equal(result.method, 'exact-enumeration');
    assert.equal(result.standardError, 0);
  }
  const tied = calculateHoldemEquity(fixtures[1]);
  assert.equal(tied.wins, 0); assert.equal(tied.losses, 0); assert.equal(tied.ties, 990);
  assert.equal(tied.winRate, 0); assert.equal(tied.tieRate, 1); assert.equal(tied.equity, .5);
});

test('turn equity exactly matches an independent opponent-first, 45,540-outcome oracle', () => {
  const fixture = {playerHole: ['As', 'Kd'], board: ['7h', '6s', 'Ks', '8s']};
  const result = calculateHoldemEquity(fixture), expected = referenceEquity(fixture.playerHole, fixture.board);
  assert.deepEqual({wins: result.wins, ties: result.ties, losses: result.losses, outcomes: result.outcomes}, expected);
  assert.equal(result.outcomes, 45540); assert.equal(result.exact, true);
  assert.ok(result.wins > 0 && result.ties > 0 && result.losses > 0);
});

test('flop enumerates all 1,070,190 disjoint combinations and an already-made royal always wins', () => {
  const result = calculateHoldemEquity({playerHole: ['As', 'Ks'], board: ['Qs', 'Js', 'Ts']});
  assert.equal(result.outcomes, 1070190);
  assert.equal(result.wins, 1070190); assert.equal(result.ties, 0); assert.equal(result.losses, 0);
  assert.equal(result.equity, 1); assert.equal(result.exact, true);
});

test('preflop uses 100,000 deterministic uniform samples without main randomness or private inputs', () => {
  const input = {playerHole: Object.freeze(['As', 'Ah']), board: Object.freeze([])};
  for (const key of ['npcHole', 'bossProfileId', 'config', 'rng', 'seed']) {
    Object.defineProperty(input, key, {get() { throw new Error(`Forbidden private input: ${key}`); }});
  }
  const originalRandom = Math.random;
  let result;
  try {
    Math.random = () => { throw new Error('The estimator must not use global randomness'); };
    result = calculateHoldemEquity(input);
  } finally { Math.random = originalRandom; }
  const repeated = calculateHoldemEquity({playerHole: ['ah', 'as'], board: []});
  assert.deepEqual(repeated, result);
  assert.equal(result.outcomes, 100000);
  assert.equal(result.wins + result.ties + result.losses, result.outcomes);
  assert.equal(result.exact, false); assert.equal(result.method, 'deterministic-monte-carlo');
  assert.ok(result.equity > .83 && result.equity < .87);
  assert.ok(result.standardError > 0 && result.standardError < .002);
  assert.equal(result.equity, (result.wins + result.ties / 2) / result.outcomes);
  assert.equal(calculateHoldemEquity(input, {preflopSamples: 1234}).outcomes, 1234);
});

test('known-card ordering and notation do not affect exact counts and inputs remain unchanged', () => {
  const playerHole = Object.freeze(['10H', 'ad']), board = Object.freeze(['Ts', '7h', '6s', 'Ks', '2c']);
  const first = calculateHoldemEquity({playerHole, board});
  const reordered = calculateHoldemEquity({playerHole: ['Ad', 'Th'], board: ['2c', 'Ks', '6s', '7h', 'Ts']});
  assert.deepEqual(first, reordered);
  assert.deepEqual(playerHole, ['10H', 'ad']); assert.deepEqual(board, ['Ts', '7h', '6s', 'Ks', '2c']);
});

test('invalid card counts, duplicates, card codes and sample counts fail before calculation', () => {
  for (const fixture of [
    {}, {playerHole: ['As']}, {playerHole: ['As', 'As']}, {playerHole: ['As', 'XX']},
    {playerHole: ['As', 'Kd'], board: ['As', '2s', '3s']},
    {playerHole: ['As', 'Kd'], board: ['2s']}, {playerHole: ['As', 'Kd'], board: ['2s', '3s']},
    {playerHole: ['As', 'Kd'], board: ['2s', '3s', '4s', '5s', '6s', '7s']}
  ]) assert.throws(() => calculateHoldemEquity(fixture));
  for (const preflopSamples of [0, -1, 1.5, Infinity, 10000001]) {
    assert.throws(() => calculateHoldemEquity({playerHole: ['As', 'Kd']}, {preflopSamples}));
  }
});
