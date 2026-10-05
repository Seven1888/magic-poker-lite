import test from 'node:test';
import assert from 'node:assert/strict';
import {createBossHandRange, BOSS_HAND_CATEGORIES} from '../src/boss-hand-range.mjs';
import {makeDeck, evaluateBest, holeScore} from '../src/poker.mjs';
import {BOSS_PROFILE_BY_ID, getBossProfileDistribution} from '../src/boss-profiles.mjs';
import {createSession, startHand, legalActions, getActionDistribution, normalizeConfig} from '../src/engine.mjs';
import {responseBadges} from '../src/action-response-view.mjs';

const PLAYER = ['As', 'Kh'], BOARD = ['2s', '7h', 'Qc'];
const DECK = makeDeck();
const near = (actual, expected, tolerance = 1e-11) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const uniform = {deal: {player: {rerollChance: 0}, npc: {rerollChance: 0}}};
const context = (config = {}, smallBlind = 'player', playerHole = PLAYER, bossProfileId = 'sniper') => ({playerHole, smallBlind, config, bossProfileId});
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

function profileDistribution(hole, event, profileId = 'sniper') {
  return getBossProfileDistribution({holes: {npc: hole}, board: event.board, street: event.street,
    bossProfile: BOSS_PROFILE_BY_ID[profileId], currentBet: event.owed, streetBets: {npc: 0}}, event.actions);
}

function observation(hole, overrides = {}, profileId = 'sniper') {
  const event = {id: 'flop-preview', street: 'flop', board: BOARD, actions: ['fold', 'call', 'raise'].map(type => ({type})),
    owed: 2, pot: 5, shownMode: 'badges', ...overrides};
  const probabilities = profileDistribution(hole, event, profileId);
  return {...event, shown: event.shown ?? (event.shownMode === 'badges' ? responseBadges(probabilities)
    : probabilities.filter(item => item.probability > 0).map(item => ({...item, label: `${(item.probability * 100).toFixed(1)}%`})))
    .map(({type, label}) => ({type, label}))};
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

test('currently displayed badge percentages constrain the range without reading a hidden strength band', () => {
  const pair = observation(['2c', '9d']);
  assert.deepEqual(pair.shown, [{type: 'fold', label: '28.0%'}, {type: 'raise', label: '10.0%'}]);
  const result = createBossHandRange(context(uniform)).update({board: BOARD, evidence: [pair]});
  near(distribution(result)[1], 1);
  assert.ok(result.candidateCount < 1081);
  const strong = observation(['2c', '2d']);
  assert.deepEqual(strong.shown, [{type: 'raise', label: '80.0%'}]);
  const strongResult = createBossHandRange(context(uniform)).update({board: BOARD, evidence: [strong]});
  near(distribution(strongResult)[0] + distribution(strongResult)[1], 0);
});

test('rounded public labels preserve indistinguishable candidates and do not accidentally use raw probability precision', () => {
  const config = {...uniform, boss: {mode: 'legacy'}, npc: {strengthInfluence: .000001, priceInfluence: 0}};
  const actions = ['fold', 'call', 'raise'].map(type => {
    const item = {type};
    Object.defineProperty(item, 'probability', {get() {throw new Error('raw private probability read');}});
    return item;
  });
  const event = {id: 'rounded', street: 'flop', board: BOARD, actions, owed: 2, pot: 5, shownMode: 'all',
    shown: [{type: 'fold', label: '20.0%'}, {type: 'call', label: '60.0%'}, {type: 'raise', label: '20.0%'}]};
  const result = createBossHandRange(context(config)).update({board: BOARD, evidence: [event]});
  assert.equal(result.candidateCount, 1081);
  assertDistribution(result, expectedFromWeights(PLAYER, BOARD, () => 1));
  const tiny = {...config, npc: {...config.npc, fold: .000001}};
  event.shown = [{type: 'fold', label: '<0.1%'}, {type: 'call', label: '75.0%'}, {type: 'raise', label: '25.0%'}];
  assert.equal(createBossHandRange(context(tiny)).update({board: BOARD, evidence: [event]}).candidateCount, 1081);
});

test('single certain responses accept badge 100% and central 100.0% and visible action sets are evidence', () => {
  const base = {id: 'certain', street: 'flop', board: BOARD, actions: [{type: 'check'}], owed: 0, pot: 5};
  for (const [shownMode, label] of [['badges', '100%'], ['all', '100.0%']]) {
    const result = createBossHandRange(context(uniform)).update({board: BOARD,
      evidence: [{...base, shownMode, shown: [{type: 'check', label}]}]});
    assert.equal(result.candidateCount, 1081);
  }
  const impossible = {...observation(['2c', '2d']), shown: [{type: 'fold', label: '0.0%'}, {type: 'raise', label: '80.0%'}]};
  const result = createBossHandRange(context(uniform)).update({board: BOARD, evidence: [impossible]});
  assert.equal(result.unavailable, 'inconsistent-public-evidence');
  assert.deepEqual(result.distribution, []);
});

test('an executed NPC action multiplies likelihood once, even after repeated updates and duplicate ids', () => {
  const event = {id: 'decision', street: 'flop', board: BOARD,
    actions: ['fold', 'call', 'raise'].map(type => ({type})), owed: 2, pot: 5, shown: [], shownMode: 'partial'};
  const range = createBossHandRange(context(uniform));
  range.update({board: BOARD, evidence: [event]});
  event.selectedType = 'raise';
  const first = range.update({board: BOARD, evidence: [event]});
  const expected = expectedFromWeights(PLAYER, BOARD, hole => profileDistribution(hole, event).find(action => action.type === 'raise').probability);
  assertDistribution(first, expected);
  for (let index = 0; index < 4; index++) assert.deepEqual(range.update({board: BOARD, evidence: [event]}), first);
  assert.deepEqual(range.update({board: BOARD, evidence: [event, {...event}]}), first);
  assert.deepEqual(createBossHandRange(context(uniform)).update({board: BOARD, evidence: [event]}), first);
});

test('preflop public evidence is accumulated before showing a flop distribution and stays conditioned on the earlier board', () => {
  const preflop = observation(['2c', '9d'], {id: 'preflop', street: 'preflop', board: [], shownMode: 'all'});
  const range = createBossHandRange(context(uniform));
  const before = range.update({board: [], evidence: [preflop]});
  assert.equal(before.status, 'waiting-for-flop');
  assert.equal(before.evidenceCount, 1);
  assert.ok(before.candidateCount < 1225);
  const after = range.update({board: BOARD, evidence: [preflop]});
  assert.deepEqual(after, createBossHandRange(context(uniform)).update({board: BOARD, evidence: [preflop]}));
  const expected = expectedFromWeights(PLAYER, BOARD, hole => {
    const observed = profileDistribution(hole, preflop).filter(item => item.probability > 0)
      .map(item => `${item.type}:${(item.probability * 100).toFixed(1)}%`).join('|');
    return observed === preflop.shown.map(item => `${item.type}:${item.label}`).join('|') ? 1 : 0;
  });
  assertDistribution(after, expected);
});

test('evidence replacement, withdrawal and a shorter visible board replay the prior without stale zero weights', () => {
  const range = createBossHandRange(context(uniform));
  const evidence = [observation(['2c', '9d'])];
  range.update({board: BOARD, evidence});
  range.update({board: [...BOARD, 'Jd'], evidence});
  assert.deepEqual(range.update({board: BOARD, evidence: []}), createBossHandRange(context(uniform)).update({board: BOARD}));
  const replacement = [observation(['2c', '2d'])];
  range.update({board: BOARD, evidence});
  assert.deepEqual(range.update({board: BOARD, evidence: replacement}),
    createBossHandRange(context(uniform)).update({board: BOARD, evidence: replacement}));
});

test('legacy action likelihoods match the actual engine at every street with public legal-action filtering', () => {
  const config = normalizeConfig({...uniform, boss: {mode: 'legacy'}, npc: {strengthInfluence: 1.3, priceInfluence: .7}});
  const session = createSession(config, 128);
  const real = startHand(session);
  const initialRng = session.rng.state(), initial = JSON.stringify(real);
  for (const board of [[], BOARD, [...BOARD, 'Jd'], [...BOARD, 'Jd', '4c']]) {
    const street = Object.keys({preflop: 0, flop: 3, turn: 4, river: 5}).find(key => ({preflop: 0, flop: 3, turn: 4, river: 5})[key] === board.length);
    const synthetic = {...real, actor: 'npc', street, board, currentBet: 20, streetBets: {player: 20, npc: 0},
      stacks: {player: 990, npc: 1000}, pot: 40, raises: 0, config};
    const event = {id: street, street, board, actions: legalActions(synthetic).map(({type}) => ({type})),
      owed: 20, pot: 40, shownMode: 'partial', shown: [], selectedType: 'raise'};
    const current = board.length ? board : BOARD;
    const expected = expectedFromWeights(PLAYER, current, hole => getActionDistribution({...synthetic, holes: {npc: hole}})
      .find(action => action.type === 'raise').probability);
    assertDistribution(createBossHandRange(context(config)).update({board: current, evidence: [event]}), expected);
  }
  assert.equal(session.rng.state(), initialRng);
  assert.equal(JSON.stringify(real), initial);
});

test('privacy boundary ignores private state properties and validates cards, future evidence and contradictory actions', () => {
  const input = context(uniform);
  for (const property of ['holes', 'deck', 'seed', 'rng', 'dealAudit']) {
    Object.defineProperty(input, property, {get() {throw new Error(`private ${property} read`);}});
  }
  const range = createBossHandRange(input);
  const request = {board: BOARD};
  for (const property of ['npcHole', 'deck', 'rng']) Object.defineProperty(request, property, {get() {throw new Error(`private ${property} read`);}});
  assert.equal(range.update(request).status, 'ready');
  assert.throws(() => range.update({board: [...BOARD, 'As']}), /公共牌/);
  assert.throws(() => range.update({board: [], evidence: [observation(['2c', '9d'])]}), /尚未揭開/);
  assert.throws(() => createBossHandRange(context({}, 'player', ['As', 'As'])), /重複/);
  const event = {...observation(['2c', '9d']), selectedType: 'call'};
  assert.throws(() => range.update({board: BOARD, evidence: [event, {...event, selectedType: 'raise'}]}), /矛盾/);
});

test('a royal flush on the board belongs wholly to Straight Flush, never to an overlapping extra category', () => {
  const result = createBossHandRange(context(uniform, 'player', ['2c', '3d'])).update({board: ['Ts', 'Js', 'Qs', 'Ks', 'As']});
  near(distribution(result)[8], 1);
  assert.equal(result.distribution.filter(item => item.probability > 0).length, 1);
});
