import test from 'node:test';
import assert from 'node:assert/strict';
import {createBossHandRange, BOSS_HAND_CATEGORIES} from '../src/boss-hand-range.mjs';

const PLAYER = ['As', 'Kh'], BOARD = ['2s', '7h', 'Qc'];
const DECK = [...'23456789TJQKA'].flatMap(rank => [...'shdc'].map(suit => rank + suit));
const near = (actual, expected, tolerance = 1e-12) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const probabilities = result => Object.fromEntries(result.distribution.map(item => [item.category, item.probability]));

// Independent oracle: classify each five-card subset, rather than sharing the
// production evaluator's direct five-to-seven-card classification algorithm.
function fiveCardCategory(cards) {
  const ranks = cards.map(card => '23456789TJQKA'.indexOf(card[0]) + 2).sort((a, b) => a - b);
  const counts = ranks.map(rank => ranks.filter(value => value === rank).length);
  const groups = [...new Set(ranks)].map(rank => ranks.filter(value => value === rank).length).sort((a, b) => b - a);
  const straight = new Set(ranks).size === 5 && (ranks[4] - ranks[0] === 4 || ranks.join(',') === '2,3,4,5,14');
  const flush = cards.every(card => card[1] === cards[0][1]);
  if (straight && flush) return 8;
  if (counts.includes(4)) return 7;
  if (groups.join(',') === '3,2') return 6;
  if (flush) return 5;
  if (straight) return 4;
  if (counts.includes(3)) return 3;
  if (groups.join(',') === '2,2,1') return 2;
  if (counts.includes(2)) return 1;
  return 0;
}
function bestCategory(cards) {
  let best = 0;
  for (let a = 0; a < cards.length - 4; a++) for (let b = a + 1; b < cards.length - 3; b++)
    for (let c = b + 1; c < cards.length - 2; c++) for (let d = c + 1; d < cards.length - 1; d++)
      for (let e = d + 1; e < cards.length; e++) best = Math.max(best, fiveCardCategory([cards[a], cards[b], cards[c], cards[d], cards[e]]));
  return best;
}
function referenceCounts(player, board) {
  const pool = DECK.filter(card => !player.includes(card) && !board.includes(card)), counts = Array(9).fill(0);
  for (let a = 0; a < pool.length; a++) for (let b = a + 1; b < pool.length; b++) counts[bestCategory([pool[a], pool[b], ...board])]++;
  return counts;
}
function assertCounts(result, expected) {
  const total = expected.reduce((sum, value) => sum + value, 0);
  assert.equal(result.status, 'ready');
  assert.equal(result.exact, true);
  assert.equal(result.candidateCount, total);
  assert.equal(result.distribution.length, 9);
  assert.equal(new Set(result.distribution.map(item => item.category)).size, 9);
  near(result.distribution.reduce((sum, item) => sum + item.probability, 0), 1);
  expected.forEach((count, category) => near(probabilities(result)[category], count / total));
}
function poison(object, properties) {
  for (const property of properties) Object.defineProperty(object, property, {get() {throw new Error(`unexpected ${property} read`);}});
  return object;
}

test('standard Holdem enumerates exactly C(47,2), C(46,2) and C(45,2) equally likely BOSS hands', () => {
  assert.equal(BOSS_HAND_CATEGORIES.length, 9);
  const range = createBossHandRange({playerHole: PLAYER});
  const boards = [BOARD, [...BOARD, 'Jd'], [...BOARD, 'Jd', '4c']];
  for (const [index, board] of boards.entries()) {
    const result = range.update({board});
    assert.equal(result.candidateCount, [1081, 1035, 990][index]);
    assertCounts(result, referenceCounts(PLAYER, board));
  }
});

test('the screenshot flop has exact independent combinatorial counts and multiple possible categories', () => {
  const result = createBossHandRange({playerHole: ['2h', '3d']}).update({board: ['7h', '6s', 'Ks']});
  // Matching one board rank or holding a pocket pair: 9*38 + 2*C(3,2) + 8*C(4,2).
  // Two pair: 3*(3*3). Trips: 3*C(3,2). The remaining combinations are high card.
  assertCounts(result, [649, 396, 27, 9, 0, 0, 0, 0, 0]);
  assert.ok(probabilities(result)[0] < 1);
});

test('a paired flop has only pair-or-better categories with independently counted quads and full houses', () => {
  const result = createBossHandRange({playerHole: ['2h', '3d']}).update({board: ['7h', '7s', 'Kd']});
  // Quads: both remaining sevens. Full house: 2*3 seven/king pairs or C(3,2) kings.
  // Trips: 2*42. Two pair: 3*42 plus 2*C(3,2) + 9*C(4,2) unrelated pocket pairs.
  assertCounts(result, [0, 801, 186, 84, 0, 0, 9, 1, 0]);
});

test('independent five-card-subset oracle agrees on straight, flush, full-house and wheel possibilities', () => {
  const cases = [
    {player: ['2c', '3d'], board: ['8s', '9s', 'Ts']},
    {player: ['Ac', 'Kd'], board: ['2s', '3s', '4s', '5h']},
    {player: ['2c', '3d'], board: ['Ah', 'Ad', 'Kh', 'Kd', '7s']},
    {player: ['2c', '3d'], board: ['Ah', 'Ad', 'Ac', 'Kh', 'Kd']}
  ];
  for (const {player, board} of cases) assertCounts(createBossHandRange({playerHole: player}).update({board}), referenceCounts(player, board));
});

test('turn and river recompute current made hands when a newly revealed card changes the board', () => {
  const range = createBossHandRange({playerHole: ['2h', '3d']});
  const flop = ['7h', '6s', 'Ks'], turn = [...flop, '7d'], river = [...turn, '7c'];
  const results = [flop, turn, river].map(board => range.update({board}));
  assert.ok(probabilities(results[0])[0] > 0);
  near(probabilities(results[1])[0], 0);
  assert.ok(probabilities(results[1])[1] > 0);
  near(probabilities(results[2])[1], 0);
  assert.ok(probabilities(results[2])[3] > 0);
  assert.notDeepEqual(results[0].distribution, results[1].distribution);
  assert.notDeepEqual(results[1].distribution, results[2].distribution);
});

test('deal redraws, blind positions, manual cards, BOSS profiles and action evidence cannot affect the standard model', () => {
  const expected = createBossHandRange({playerHole: PLAYER}).update({board: BOARD});
  for (const smallBlind of ['player', 'npc', 'unknown']) for (const bossProfileId of ['caller', 'maniac', 'sniper', 'trapper']) {
    const config = {deal: {player: {rerollChance: 1, maxRerolls: 50, manualProvided: true}, npc: {rerollChance: 1, maxRerolls: 50, manualProvided: true, manual: ['2h', '2d']}}, boss: {mode: 'fixed', profileId: bossProfileId}};
    const range = createBossHandRange({playerHole: PLAYER, smallBlind, bossProfileId, config});
    assert.deepEqual(range.update({board: BOARD, evidence: [{selectedType: 'raise', shown: [{type: 'raise', label: '100%'}]}]}), expected);
  }
});

test('private and legacy properties are never read, including the entire config and blind position', () => {
  const input = poison({playerHole: PLAYER}, ['config', 'smallBlind', 'manualProvided', 'manual', 'bossProfileId', 'actions', 'odds', 'evidence', 'holes', 'deck', 'seed', 'rng', 'dealAudit']);
  const request = poison({board: BOARD}, ['config', 'smallBlind', 'evidence', 'actions', 'odds', 'selectedType', 'bossProfileId', 'npcHole', 'deck', 'rng']);
  assert.deepEqual(createBossHandRange(input).update(request), createBossHandRange({playerHole: PLAYER}).update({board: BOARD}));
});

test('repeated, replaced and shortened boards do not retain stale blockers or category results', () => {
  const range = createBossHandRange({playerHole: PLAYER}), first = range.update({board: BOARD});
  for (let index = 0; index < 3; index++) assert.deepEqual(range.update({board: BOARD}), first);
  range.update({board: [...BOARD, 'Jd', '4c']});
  assert.deepEqual(range.update({board: BOARD}), first);
  const replacement = ['Ts', 'Tc', '4d'];
  assert.deepEqual(range.update({board: replacement}), createBossHandRange({playerHole: PLAYER}).update({board: replacement}));
  assert.deepEqual(range.update({board: []}), createBossHandRange({playerHole: PLAYER}).update({board: []}));
  assert.deepEqual(range.update({board: BOARD}), first);
});

test('preflop exactly counts paired and unpaired starting hands after excluding both player cards', () => {
  for (const [playerHole, pairs] of [[['As', 'Kh'], 11 * 6 + 2 * 3], [['As', 'Ah'], 12 * 6 + 1]]) {
    const range = createBossHandRange({playerHole}), result = range.update({board: []});
    assert.equal(result.basis, 'starting-hand');
    assertCounts(result, [1225 - pairs, pairs, 0, 0, 0, 0, 0, 0, 0]);
    assert.deepEqual(createBossHandRange({playerHole: [...playerHole].reverse()}).update({board: []}), result);
    result.distribution[0].probability = -1;
    assertCounts(range.update({board: []}), [1225 - pairs, pairs, 0, 0, 0, 0, 0, 0, 0]);
  }
});

test('preflop does not read hidden BOSS cards, future board cards, betting evidence or the game RNG', () => {
  const forbidden = ['config', 'smallBlind', 'bossProfileId', 'actions', 'evidence', 'holes', 'npcHole', 'deck', 'seed', 'rng'];
  const input = poison({playerHole: PLAYER}, forbidden), request = poison({board: []}, forbidden);
  assert.deepEqual(createBossHandRange(input).update(request), createBossHandRange({playerHole: PLAYER}).update({board: []}));
});

test('partial flop reveal has no distribution until all three cards are visible', () => {
  const range = createBossHandRange({playerHole: PLAYER});
  assert.equal(range.update({board: []}).status, 'ready');
  for (let count = 1; count < 3; count++) {
    const result = range.update({board: BOARD.slice(0, count)});
    assert.equal(result.status, 'waiting-for-flop');
    assert.deepEqual(result.distribution, []);
    assert.equal(result.candidateCount, (50 - count) * (49 - count) / 2);
  }
  assert.equal(range.update({board: BOARD}).status, 'ready');
  assert.equal(range.update({board: BOARD}).basis, 'made-hand');
});

test('known cards are normalized and invalid or impossible public cards are rejected', () => {
  const range = createBossHandRange({playerHole: PLAYER});
  assert.throws(() => range.update({board: [...BOARD, 'As']}), /公共牌/);
  assert.throws(() => range.update({board: [...BOARD, BOARD[0]]}), /重複/);
  assert.throws(() => range.update({board: [...BOARD, 'Jd', '4c', '5s']}), /公共牌/);
  assert.throws(() => range.update({board: '2s7hQc'}), /數量/);
  assert.throws(() => createBossHandRange({playerHole: ['As', 'As']}), /重複/);
  assert.throws(() => createBossHandRange({playerHole: ['As']}), /數量/);
  assert.throws(() => createBossHandRange({playerHole: ['As', 'XX']}), /無效/);
  assert.deepEqual(createBossHandRange({playerHole: [' aS ', 'kH']}).update({board: ['2S', '7H', 'qC']}), range.update({board: BOARD}));
});

test('input arrays and returned distributions cannot mutate a later update', () => {
  const input = {playerHole: [...PLAYER]}, board = [...BOARD], range = createBossHandRange(input);
  const expected = createBossHandRange({playerHole: PLAYER}).update({board: BOARD}), result = range.update({board});
  input.playerHole[0] = '3s';
  board[0] = '4s';
  result.distribution[0].probability = -1;
  result.distribution[0].label = 'changed';
  assert.deepEqual(range.update({board: BOARD}), expected);
});

test('a royal board is exactly Straight Flush 100% and a quads board is exactly Four of a Kind 100%', () => {
  const range = createBossHandRange({playerHole: ['2c', '3d']});
  assertCounts(range.update({board: ['Ts', 'Js', 'Qs', 'Ks', 'As']}), [0, 0, 0, 0, 0, 0, 0, 0, 990]);
  assertCounts(range.update({board: ['7s', '7h', '7d', '7c', 'Ks']}), [0, 0, 0, 0, 0, 0, 0, 990, 0]);
});
