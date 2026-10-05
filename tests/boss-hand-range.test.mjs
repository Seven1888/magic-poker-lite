import test from 'node:test';
import assert from 'node:assert/strict';
import {createBossHandRange, BOSS_HAND_CATEGORIES} from '../src/boss-hand-range.mjs';
import {makeDeck, evaluateBest, holeScore} from '../src/poker.mjs';

const PLAYER = ['As', 'Kh'], BOARD = ['2s', '7h', 'Qc'];
const DECK = makeDeck();
const near = (actual, expected, tolerance = 1e-11) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const uniform = {deal: {player: {rerollChance: 0}, npc: {rerollChance: 0}}};
const context = (config = {}, smallBlind = 'player', playerHole = PLAYER) => ({playerHole, smallBlind, config});
const distribution = result => Object.fromEntries(result.distribution.map(item => [item.category, item.probability]));
const pairs = pool => pool.flatMap((card, index) => pool.slice(index + 1).map(next => [card, next]));
const key = pair => [...pair].sort().join('');
const eligible = (pair, spec) => spec.rerollMode === 'legacy-score' ? holeScore(pair) < spec.targetScore : pair[0][0] !== pair[1][0];

// Independent finite-state oracle: split stop/continue mass for every candidate
// at each attempt, then spread the continued mass uniformly over the whole pool.
// It does not use the production closed-form kernel or degree-removal shortcut.
function bruteDeal(pool, spec) {
  const combinations = pairs(pool), values = new Map(combinations.map(pair => [key(pair), 0]));
  let reach = 1;
  for (let attempt = 0; attempt <= spec.maxRerolls; attempt++) {
    let continued = 0;
    for (const pair of combinations) {
      const mass = reach / combinations.length;
      const retry = attempt < spec.maxRerolls && eligible(pair, spec) ? spec.rerollChance : 0;
      values.set(key(pair), values.get(key(pair)) + mass * (1 - retry));
      continued += mass * retry;
    }
    reach = continued;
  }
  near([...values.values()].reduce((a, b) => a + b, 0), 1);
  return values;
}

function bruteAcceptedKnownPair(pool, pair, spec) {
  const combinations = pairs(pool), retryCount = combinations.filter(candidate => eligible(candidate, spec)).length;
  let reach = 1, accepted = 0;
  for (let attempt = 0; attempt <= spec.maxRerolls; attempt++) {
    const retry = attempt < spec.maxRerolls && eligible(pair, spec) ? spec.rerollChance : 0;
    accepted += reach / combinations.length * (1 - retry);
    reach = attempt < spec.maxRerolls ? reach * retryCount / combinations.length * spec.rerollChance : 0;
  }
  return accepted;
}

function expectedFromWeights(player, board, weightForPair) {
  const possible = pairs(DECK.filter(card => !player.includes(card) && !board.includes(card)));
  const totals = Array(9).fill(0);
  for (const hole of possible) totals[evaluateBest([...hole, ...board]).category] += weightForPair(hole);
  const total = totals.reduce((sum, value) => sum + value, 0);
  return Object.fromEntries(totals.map((value, category) => [category, value / total]));
}

function assertDistribution(result, expected) {
  assert.equal(result.status, 'ready');
  assert.equal(result.exact, true);
  assert.equal(result.distribution.length, 9);
  near(result.distribution.reduce((sum, item) => sum + item.probability, 0), 1);
  for (const [category, probability] of Object.entries(expected)) near(distribution(result)[category], probability);
}

test('uniform no-redraw baseline enumerates exactly the nonblocked hole pairs and nine exclusive current categories', () => {
  assert.equal(BOSS_HAND_CATEGORIES.length, 9);
  const range = createBossHandRange(context(uniform));
  const waiting = range.update({board: []});
  assert.equal(waiting.status, 'waiting-for-flop');
  assert.equal(waiting.candidateCount, 1225);
  assert.deepEqual(waiting.distribution, []);
  const flop = range.update({board: BOARD});
  assert.equal(flop.candidateCount, 1081); // C(47, 2): player's two plus three board blockers.
  assertDistribution(flop, expectedFromWeights(PLAYER, BOARD, () => 1));
  const turn = [...BOARD, 'Jd'], river = [...turn, '4c'];
  assert.equal(range.update({board: turn}).candidateCount, 1035);
  const result = range.update({board: river});
  assert.equal(result.candidateCount, 990);
  assertDistribution(result, expectedFromWeights(PLAYER, river, () => 1));
});

test('player-first prior exactly integrates stop probabilities and the accepted final candidate after redraw cap', () => {
  const spec = {rerollMode: 'unpaired', rerollChance: .7, maxRerolls: 2};
  const expected = bruteDeal(DECK.filter(card => !PLAYER.includes(card)), spec);
  const result = createBossHandRange(context({deal: {npc: spec}})).update({board: BOARD});
  assertDistribution(result, expectedFromWeights(PLAYER, BOARD, hole => expected.get(key(hole))));
  const baseline = createBossHandRange(context(uniform)).update({board: BOARD});
  assert.ok(Math.abs(distribution(result)[1] - distribution(baseline)[1]) > .01);
});

test('NPC-first prior conditions on the subsequently drawn player hand, including its legacy redraw pool', () => {
  const npc = {rerollMode: 'unpaired', rerollChance: .8, maxRerolls: 2};
  const player = {rerollMode: 'legacy-score', targetScore: .66, rerollChance: .9, maxRerolls: 2};
  const npcPrior = bruteDeal(DECK, npc);
  const config = {deal: {npc, player}};
  const expected = expectedFromWeights(PLAYER, BOARD, hole => npcPrior.get(key(hole))
    * bruteAcceptedKnownPair(DECK.filter(card => !hole.includes(card)), PLAYER, player));
  const result = createBossHandRange(context(config, 'npc')).update({board: BOARD});
  assertDistribution(result, expected);
  const wrongUniformReverse = expectedFromWeights(PLAYER, BOARD, hole => npcPrior.get(key(hole)));
  assert.ok(Object.keys(expected).some(category => Math.abs(expected[category] - wrongUniformReverse[category]) > 1e-6));
});

test('the shipped 50%/25% and 50-redraw defaults agree with an independent NPC-first prior', () => {
  const npc = {rerollMode: 'unpaired', rerollChance: .25, maxRerolls: 50};
  const player = {rerollMode: 'unpaired', rerollChance: .5, maxRerolls: 50};
  const npcPrior = bruteDeal(DECK, npc);
  const expected = expectedFromWeights(PLAYER, BOARD, hole => npcPrior.get(key(hole))
    * bruteAcceptedKnownPair(DECK.filter(card => !hole.includes(card)), PLAYER, player));
  assertDistribution(createBossHandRange(context({}, 'npc')).update({board: BOARD}), expected);
});

test('manual player cards are reserved before either seat draws; a secret manual NPC prior is explicitly unavailable', () => {
  const config = {deal: {player: {manualProvided: true}, npc: {rerollMode: 'legacy-score', targetScore: .58, rerollChance: .8, maxRerolls: 2}}};
  const expected = bruteDeal(DECK.filter(card => !PLAYER.includes(card)), config.deal.npc);
  const first = createBossHandRange(context(config, 'player')).update({board: BOARD});
  const second = createBossHandRange(context(config, 'npc')).update({board: BOARD});
  assert.deepEqual(first, second);
  assertDistribution(first, expectedFromWeights(PLAYER, BOARD, hole => expected.get(key(hole))));
  const hiddenManual = {manualProvided: true};
  Object.defineProperty(hiddenManual, 'manual', {get() { throw new Error('secret manual values read'); }});
  const unavailable = createBossHandRange(context({deal: {npc: hiddenManual}})).update({board: BOARD});
  assert.equal(unavailable.unavailable, 'manual-boss-prior');
  assert.deepEqual(unavailable.distribution, []);
});

test('zero redraw cap is uniform even at chance one, and a nonzero cap retains last unpaired candidates', () => {
  for (const smallBlind of ['player', 'npc']) {
    const config = {deal: {player: {rerollChance: 1, maxRerolls: 0}, npc: {rerollChance: 1, maxRerolls: 0}}};
    assert.deepEqual(createBossHandRange(context(config, smallBlind)).update({board: BOARD}),
      createBossHandRange(context(uniform, smallBlind)).update({board: BOARD}));
  }
  const spec = {rerollMode: 'unpaired', rerollChance: 1, maxRerolls: 1};
  const expected = bruteDeal(DECK.filter(card => !PLAYER.includes(card)), spec);
  const result = createBossHandRange(context({deal: {npc: spec}})).update({board: BOARD});
  assert.equal(result.candidateCount, 1081);
  assertDistribution(result, expectedFromWeights(PLAYER, BOARD, hole => expected.get(key(hole))));
});

test('the reported 7h 6s Ks flop has several possible made hands instead of inverting BOSS action odds', () => {
  const player = ['2h', '3d'], board = ['7h', '6s', 'Ks'];
  for (const smallBlind of ['player', 'npc']) {
    const range = createBossHandRange(context({}, smallBlind, player));
    const result = range.update({board, evidence: [{shown: [{type: 'fold', label: '12%'}, {type: 'raise', label: '5%'}]}]});
    assert.equal(result.status, 'ready');
    assert.equal(result.candidateCount, 1081);
    assert.ok(result.distribution.filter(item => item.probability > 0).length > 1);
    assert.ok(distribution(result)[0] > 0 && distribution(result)[0] < 1);
    assert.ok(distribution(result)[1] > 0 && distribution(result)[1] < 1);
    assert.ok(distribution(result)[2] > 0 && distribution(result)[3] > 0);
  }
});

test('turn and river reevaluate current categories against the newly revealed board', () => {
  const player = ['2h', '3d'], flop = ['7h', '6s', 'Ks'], turn = [...flop, '7d'], river = [...turn, '7c'];
  const range = createBossHandRange(context(uniform, 'player', player));
  const flopResult = range.update({board: flop}), turnResult = range.update({board: turn}), riverResult = range.update({board: river});
  for (const [board, result] of [[flop, flopResult], [turn, turnResult], [river, riverResult]]) {
    assertDistribution(result, expectedFromWeights(player, board, () => 1));
  }
  assert.ok(distribution(flopResult)[0] > 0);
  near(distribution(turnResult)[0], 0);
  assert.ok(distribution(turnResult)[1] > 0);
  near(distribution(riverResult)[1], 0);
  assert.ok(distribution(riverResult)[3] > 0);
  assert.notDeepEqual(flopResult.distribution, turnResult.distribution);
  assert.notDeepEqual(turnResult.distribution, riverResult.distribution);
});

test('BOSS identity, behavior settings, visible odds and executed actions cannot condition the board distribution', () => {
  const expected = createBossHandRange(context(uniform)).update({board: BOARD});
  for (const bossProfileId of ['caller', 'maniac', 'sniper', 'trapper', 'unknown']) {
    for (const selectedType of ['fold', 'call', 'raise']) {
      const input = {...context({...uniform, boss: {mode: 'fixed', profileId: bossProfileId}, npc: {fold: 1, raise: 0}}), bossProfileId};
      const event = {id: 'same-event', board: BOARD, selectedType, shown: [{type: selectedType, label: '100%'}]};
      const range = createBossHandRange(input);
      assert.deepEqual(range.update({board: BOARD, evidence: [event]}), expected);
      assert.deepEqual(range.update({board: BOARD, evidence: [event, {...event, selectedType: 'contradictory'}]}), expected);
      assert.deepEqual(range.update({board: BOARD, evidence: null}), expected);
    }
  }
});

test('legacy and private extra properties are never read, including throwing getters', () => {
  const poison = (object, properties) => {
    for (const property of properties) Object.defineProperty(object, property, {get() {throw new Error(`unexpected ${property} read`);}});
    return object;
  };
  const config = poison({deal: {player: {rerollChance: 0}, npc: {rerollChance: 0}}}, ['boss', 'npc', 'rng', 'hand']);
  poison(config.deal.player, ['manual']);
  poison(config.deal.npc, ['manual']);
  const input = poison(context(config), ['bossProfileId', 'profileId', 'actions', 'odds', 'evidence', 'holes', 'deck', 'seed', 'rng', 'dealAudit']);
  const request = poison({board: BOARD}, ['evidence', 'actions', 'odds', 'selectedType', 'bossProfileId', 'npcHole', 'deck', 'rng']);
  assert.deepEqual(createBossHandRange(input).update(request), createBossHandRange(context(uniform)).update({board: BOARD}));
});

test('repeated, replaced and shortened boards rebuild blockers from the same immutable deal prior', () => {
  const range = createBossHandRange(context());
  const first = range.update({board: BOARD});
  for (let index = 0; index < 3; index++) assert.deepEqual(range.update({board: BOARD}), first);
  range.update({board: [...BOARD, 'Jd', '4c']});
  assert.deepEqual(range.update({board: BOARD}), first);
  const replacement = ['Ts', 'Tc', '4d'];
  assert.deepEqual(range.update({board: replacement}), createBossHandRange(context()).update({board: replacement}));
  assert.deepEqual(range.update({board: []}), createBossHandRange(context()).update({board: []}));
  assert.deepEqual(range.update({board: BOARD}), first);
});

test('partial flop reveal has no distribution until all three cards are visible', () => {
  const range = createBossHandRange(context());
  for (let count = 0; count < 3; count++) {
    const result = range.update({board: BOARD.slice(0, count)});
    assert.equal(result.status, 'waiting-for-flop');
    assert.deepEqual(result.distribution, []);
  }
  assert.equal(range.update({board: BOARD}).status, 'ready');
});

test('known cards and deal settings are validated without accepting impossible public boards', () => {
  const range = createBossHandRange(context());
  assert.throws(() => range.update({board: [...BOARD, 'As']}), /公共牌/);
  assert.throws(() => range.update({board: [...BOARD, BOARD[0]]}), /重複/);
  assert.throws(() => range.update({board: [...BOARD, 'Jd', '4c', '5s']}), /公共牌/);
  assert.throws(() => range.update({board: '2s7hQc'}), /數量/);
  assert.throws(() => createBossHandRange(context({}, 'player', ['As', 'As'])), /重複/);
  assert.throws(() => createBossHandRange(context({}, 'player', ['As'])), /數量/);
  assert.throws(() => createBossHandRange(context({}, 'other')), /小盲/);
  for (const npc of [{rerollChance: -1}, {maxRerolls: 51}, {maxRerolls: 1.2}, {rerollMode: 'unknown'}, {targetScore: 2}]) {
    assert.throws(() => createBossHandRange(context({deal: {npc}})), /重抽/);
  }
});

test('caller-owned input arrays and returned distributions cannot mutate a later update', () => {
  const input = context(uniform, 'player', [...PLAYER]), board = [...BOARD];
  const range = createBossHandRange(input);
  const expected = createBossHandRange(context(uniform)).update({board: BOARD});
  const result = range.update({board});
  input.playerHole[0] = '3s';
  board[0] = '4s';
  result.distribution[0].probability = -1;
  result.distribution[0].label = 'changed';
  assert.deepEqual(range.update({board: BOARD}), expected);
});
test('a royal flush on the board belongs wholly to Straight Flush, never to an overlapping extra category', () => {
  const result = createBossHandRange(context(uniform, 'player', ['2c', '3d'])).update({board: ['Ts', 'Js', 'Qs', 'Ks', 'As']});
  near(distribution(result)[8], 1);
  assert.equal(result.distribution.filter(item => item.probability > 0).length, 1);
});
