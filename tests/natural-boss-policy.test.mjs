import test from 'node:test';
import assert from 'node:assert/strict';
import {createBossDecisionView, getNaturalBossDistribution, getNaturalBossFeatures,
  NATURAL_BOSS_POLICY_VERSION, NATURAL_BOSS_PROFILES, clearNaturalBossEvaluationCache,
  getNaturalBossEvaluationCacheInfo} from '../src/boss-policy.mjs';
import {getBossProfileDistribution, getBossPolicyVersion, BOSS_PROFILE_VERSION} from '../src/boss-profiles.mjs';
import {legalHoldemActions} from '../src/holdem-betting.mjs';
import {createSession, startHand, applyAction, previewResponse, cloneHand, getActionDistribution,
  sampleDistribution, createRng} from '../src/engine.mjs';
import {renderBossProbabilityTables, bossProbabilityScenariosHtml} from '../src/boss-probability-view.mjs';

const near = (left, right, tolerance = 1e-12) => assert.ok(Math.abs(left - right) <= tolerance, `${left} != ${right}`);
function pricedHand({profileId = 'caller', call = 20, basePot = 20, ownStack = 1000,
  opponentStack = 1000, hole = ['Kc', 'Qd'], board = [], history = [], acted = []} = {}) {
  return {config: {outcome: {mode: 'natural-holdem'}, bigBlind: 2}, status: 'playing', actor: 'npc',
    street: ({0: 'preflop', 3: 'flop', 4: 'turn', 5: 'river'})[board.length],
    bossProfile: {id: profileId}, holes: {npc: hole}, board, stacks: {npc: ownStack, player: opponentStack},
    streetBets: {npc: 0, player: call}, currentBet: call, pot: basePot + call,
    lastFullRaise: call || 2, actedSinceFullRaise: acted, history};
}
const distribution = hand => getNaturalBossDistribution(createBossDecisionView(hand, legalHoldemActions(hand)));
const family = (actions, type) => actions.filter(action => action.type === type).reduce((sum, action) => sum + action.probability, 0);

test('natural policy version is separate while historical versions remain unchanged', () => {
  assert.equal(NATURAL_BOSS_POLICY_VERSION, 'natural-boss-pressure-v1');
  assert.equal(getBossPolicyVersion('natural-holdem'), NATURAL_BOSS_POLICY_VERSION);
  for (const mode of ['fixed-holdem', 'pooled-holdem', 'legacy-deck', 'prebuilt-pools']) {
    assert.equal(getBossPolicyVersion({outcome: {mode}}), BOSS_PROFILE_VERSION);
  }
  assert.deepEqual(Object.keys(NATURAL_BOSS_PROFILES), ['caller', 'maniac']);
});

test('decision boundary never reads opposing cards, future layout, RNG, targets, pools or old classifications', () => {
  const hand = pricedHand({board: ['2s', '8d', 'Jh']});
  const forbidden = label => ({get() {throw new Error(`forbidden ${label}`);}});
  Object.defineProperty(hand.holes, 'player', forbidden('player holes'));
  for (const key of ['deck', 'naturalHoldem', 'rng', 'session', 'outcomeDecision', 'outcomePoolsBefore', 'bossStreetStrength']) {
    Object.defineProperty(hand, key, forbidden(key));
  }
  Object.defineProperty(hand.config, 'npc', forbidden('legacy NPC settings'));
  const event = {actor: 'player', type: 'raise', amount: 20, to: 20, street: 'flop'};
  Object.defineProperty(event, 'hiddenCards', forbidden('history extra'));
  hand.history.push(event);
  const actions = legalHoldemActions(hand);
  Object.defineProperty(actions[0], 'outcome', forbidden('action extra'));
  const view = createBossDecisionView(hand, actions);
  assert.ok(Object.isFrozen(view)); assert.ok(Object.isFrozen(view.ownCards));
  assert.ok(Object.isFrozen(view.history[0])); assert.ok(Object.isFrozen(view.legalActions));
  assert.doesNotMatch(JSON.stringify(view), /hiddenCards|outcome|deck|session|rng|bossStreet/);
  near(getNaturalBossDistribution(view).reduce((sum, action) => sum + action.probability, 0), 1);
  assert.throws(() => getNaturalBossDistribution(hand), /dedicated decision view/);
  assert.throws(() => getNaturalBossDistribution({...view, deck: []}), /dedicated decision view/);
});

test('view copies only revealed board and owns its card, history and size arrays', () => {
  const hand = pricedHand({board: ['2s', '8d', 'Jh']});
  hand.board.push('As', 'Ah'); // A future-containing upstream array must still be sliced to this street.
  hand.history.push({actor: 'player', type: 'raise', street: 'flop', amount: 20, to: 20});
  const actions = legalHoldemActions(hand), view = createBossDecisionView(hand, actions);
  const before = JSON.stringify(view);
  hand.holes.npc[0] = '3c'; hand.board[0] = '4s'; hand.history[0].amount = 999;
  actions.find(action => action.sizeKeys).sizeKeys.push('surprise');
  assert.equal(JSON.stringify(view), before); assert.equal(view.board.length, 3);
});

test('actual price changes continuously rather than reusing one large-bet row', () => {
  for (const profileId of ['caller', 'maniac']) {
    const two = distribution(pricedHand({profileId, call: 40}));
    const four = distribution(pricedHand({profileId, call: 80}));
    assert.ok(family(four, 'fold') > family(two, 'fold'));
    assert.ok(family(four, 'raise') < family(two, 'raise'));
    const above = distribution(pricedHand({profileId, call: 40.000001}));
    assert.ok(Math.abs(family(above, 'fold') - family(two, 'fold')) < 1e-7);
  }
});

test('player action labels do not affect identical actual-price distributions', () => {
  const first = pricedHand({history: [{actor: 'player', type: 'raise', amount: 40, to: 40, street: 'preflop', id: 'raise:2x', sizeKey: '2x'}]});
  const second = pricedHand({history: [{actor: 'player', type: 'raise', amount: 40, to: 40, street: 'preflop', id: 'raise:4x', sizeKey: '4x'}]});
  assert.deepEqual(distribution(first), distribution(second));
});

test('stronger own cards and the aggressive profile produce more aggression at an equal price', () => {
  for (const profileId of ['caller', 'maniac']) {
    const weak = distribution(pricedHand({profileId, hole: ['7c', '2d']}));
    const strong = distribution(pricedHand({profileId, hole: ['As', 'Ah']}));
    assert.ok(family(strong, 'raise') > family(weak, 'raise'));
    assert.ok(family(strong, 'fold') < family(weak, 'fold'));
  }
  assert.ok(family(distribution(pricedHand({profileId: 'maniac'})), 'raise')
    > family(distribution(pricedHand()), 'raise'));
});

test('a normal 50BB heads-up shove does not price premium pairs out as if they were weak hands', () => {
  for (const profileId of ['caller', 'maniac']) {
    // SB raises 99 to 100; BB has paid 2 and owes 98 against the previous matched pot of 4.
    const premium = distribution(pricedHand({profileId, hole: ['As', 'Ah'], call: 98, basePot: 4, ownStack: 98, opponentStack: 0}));
    const weak = distribution(pricedHand({profileId, hole: ['7c', '2d'], call: 98, basePot: 4, ownStack: 98, opponentStack: 0}));
    assert.ok(family(premium, 'call') > .9);
    assert.ok(family(weak, 'fold') > .95);
  }
});

test('unbeatable river hands never fold, while a strong but beatable flush is not called certain', () => {
  const board = ['As', 'Qs', '8s', '4d', '2c'];
  for (const profileId of ['caller', 'maniac']) {
    const nuts = pricedHand({profileId, hole: ['Ks', '3s'], board, call: 980, basePot: 20, ownStack: 980, opponentStack: 0});
    const view = createBossDecisionView(nuts, legalHoldemActions(nuts));
    assert.equal(getNaturalBossFeatures(view).unbeatable, true);
    assert.equal(family(getNaturalBossDistribution(view), 'fold'), 0);
    assert.equal(family(getNaturalBossDistribution(view), 'call'), 1);
  }
  const beatable = pricedHand({hole: ['Js', '3s'], board});
  assert.equal(getNaturalBossFeatures(createBossDecisionView(beatable, [])).unbeatable, false);
});

test('an unbeatable shared board checks or calls without folding or raising', () => {
  for (const call of [0, 980]) {
    const hand = pricedHand({hole: ['2c', '3d'], board: ['Ts', 'Js', 'Qs', 'Ks', 'As'], call, ownStack: 1000});
    const view = createBossDecisionView(hand, legalHoldemActions(hand)), features = getNaturalBossFeatures(view);
    assert.equal(features.boardPlays, true); assert.equal(features.unbeatable, true);
    const actions = getNaturalBossDistribution(view);
    assert.equal(family(actions, call ? 'call' : 'check'), 1);
    assert.equal(family(actions, 'fold'), 0); assert.equal(family(actions, 'raise'), 0); assert.equal(family(actions, 'bet'), 0);
  }
});

test('certainty memo reuses only the same known cards, without caching action prices or profiles', () => {
  clearNaturalBossEvaluationCache();
  const board = ['As', 'Qs', '8s', '4d', '2c'], hole = ['Ks', '3s'];
  const first = pricedHand({hole, board, call: 10});
  const cold = distribution(first), afterCold = getNaturalBossEvaluationCacheInfo();
  assert.equal(afterCold.misses, 1); assert.equal(afterCold.opponentEvaluations, 990);
  const warm = distribution(first);
  assert.deepEqual(warm, cold);
  assert.equal(getNaturalBossEvaluationCacheInfo().opponentEvaluations, 990);
  const repriced = distribution(pricedHand({hole: [...hole].reverse(), board: [...board].reverse(), call: 80, profileId: 'maniac'}));
  assert.notDeepEqual(repriced, warm);
  const afterRepriced = getNaturalBossEvaluationCacheInfo();
  assert.equal(afterRepriced.misses, 1); assert.equal(afterRepriced.hits, 2);
  const changedCards = pricedHand({hole: ['Js', '3s'], board});
  assert.equal(getNaturalBossFeatures(createBossDecisionView(changedCards, [])).unbeatable, false);
  assert.equal(getNaturalBossEvaluationCacheInfo().misses, 2);
  assert.deepEqual(Object.keys(afterCold), ['capacity', 'size', 'hits', 'misses', 'evictions', 'opponentEvaluations']);
});

test('certainty memo has a fixed bound, keeps recently reused entries and recomputes evicted ones', () => {
  clearNaturalBossEvaluationCache();
  const board = ['9s', 'Td', 'Jh', 'Qc', 'Ks'];
  const candidates = ['s', 'h', 'd', 'c'].flatMap(suit => [...'234567'].map(rank => rank + suit));
  const views = [];
  for (let first = 0; first < candidates.length - 1 && views.length < 129; first++) {
    for (let second = first + 1; second < candidates.length && views.length < 129; second++) {
      views.push(createBossDecisionView(pricedHand({board, hole: [candidates[first], candidates[second]]}), []));
    }
  }
  for (const view of views.slice(0, 128)) assert.equal(getNaturalBossFeatures(view).unbeatable, false);
  assert.equal(getNaturalBossEvaluationCacheInfo().size, 128);
  getNaturalBossFeatures(views[0]); // Keep entry 0 most recently used before exceeding the bound.
  getNaturalBossFeatures(views[128]);
  const info = getNaturalBossEvaluationCacheInfo();
  assert.equal(info.size, 128); assert.equal(info.evictions, 1);
  getNaturalBossFeatures(views[0]);
  assert.equal(getNaturalBossEvaluationCacheInfo().misses, 129);
  getNaturalBossFeatures(views[1]); // Entry 1 was the least recently used.
  assert.equal(getNaturalBossEvaluationCacheInfo().misses, 130);
  assert.equal(getNaturalBossEvaluationCacheInfo().size, 128);
});

test('weak and royal hands use cheap certainty bounds without an opponent search', () => {
  clearNaturalBossEvaluationCache();
  for (const options of [{hole: ['Kc', 'Qd'], board: ['2s', '8d', 'Jh', '4c', '6s']},
    {hole: ['2c', '3d'], board: ['Ts', 'Js', 'Qs', 'Ks', 'As']}]) {
    distribution(pricedHand(options));
  }
  assert.equal(getNaturalBossEvaluationCacheInfo().opponentEvaluations, 0);
  assert.equal(getNaturalBossEvaluationCacheInfo().size, 0);
});

test('cold and repeatedly warmed caches produce the same seeded natural River actions, cards and settlement', () => {
  const run = warmed => {
    clearNaturalBossEvaluationCache();
    const hand = startHand(createSession({outcome: {mode: 'natural-holdem'}, boss: {mode: 'fixed', profileId: 'caller'}}, 6, {firstSmallBlind: 'player'}));
    while (hand.street !== 'river') {
      const actions = legalHoldemActions(hand);
      applyAction(hand, actions.find(action => action.type === 'check') ?? actions.find(action => action.type === 'call'));
    }
    assert.equal(getNaturalBossFeatures(createBossDecisionView(hand, [])).unbeatable, true);
    while (hand.status === 'playing') {
      const actions = legalHoldemActions(hand);
      if (hand.actor === 'player') {
        applyAction(hand, actions.find(action => action.type === 'check') ?? actions.find(action => action.type === 'call'));
        continue;
      }
      if (!warmed) clearNaturalBossEvaluationCache();
      const view = createBossDecisionView(hand, actions);
      const before = hand.rng.state(), cards = JSON.stringify({holes: hand.holes, board: hand.board, deck: hand.deck});
      if (warmed) for (let index = 0; index < 25; index++) getNaturalBossDistribution(view);
      const choices = getNaturalBossDistribution(view);
      assert.equal(hand.rng.state(), before);
      assert.equal(JSON.stringify({holes: hand.holes, board: hand.board, deck: hand.deck}), cards);
      applyAction(hand, sampleDistribution(choices, hand.rng));
    }
    return {history: hand.history, holes: hand.holes, board: hand.board, result: hand.result, rng: hand.rng.state()};
  };
  assert.deepEqual(run(false), run(true));
});

test('shared community pairs do not count as privately improved pairs and river has no draw bonus', () => {
  const feature = options => getNaturalBossFeatures(createBossDecisionView(pricedHand(options), []));
  const weak = feature({hole: ['7c', '2d'], board: ['As', 'Ah', '9c']});
  const strong = feature({hole: ['Ac', '2d'], board: ['As', 'Ah', '9c']});
  assert.ok(strong.strength > weak.strength);
  const turn = feature({hole: ['Ks', 'Qd'], board: ['2s', '8s', 'Js', '4h']});
  const river = feature({hole: ['Ks', 'Qd'], board: ['2s', '8s', 'Js', '4h', '6c']});
  assert.equal(turn.flushDraw, true); assert.equal(river.flushDraw, false); assert.equal(river.draw, 0);
});

test('free check, exhausted raising rights and short all-in use only legal actions', () => {
  const free = distribution(pricedHand({call: 0}));
  assert.ok(free.some(action => action.type === 'check')); assert.ok(!free.some(action => action.type === 'fold'));
  for (const options of [{opponentStack: 0}, {acted: ['npc']}, {ownStack: 5}]) {
    const actions = distribution(pricedHand(options));
    assert.deepEqual(actions.map(action => action.type), ['fold', 'call']);
    near(actions.reduce((sum, action) => sum + action.probability, 0), 1);
    if (options.ownStack) {assert.equal(actions[1].amount, 5); assert.equal(actions[1].allIn, true);}
  }
});

test('all sizing alternatives merged by stack limits receive their full combined probability', () => {
  const hand = pricedHand({call: 20, ownStack: 30}), actions = legalHoldemActions(hand);
  const aggressive = actions.filter(action => action.type === 'raise');
  assert.equal(aggressive.length, 1); assert.deepEqual(aggressive[0].sizeKeys, ['half', 'pot', 'allin']);
  const actual = distribution(hand);
  assert.equal(actual.filter(action => action.type === 'raise').length, 1);
  assert.ok(actual.every(action => action.bossSizing));
  near(actual.reduce((sum, action) => sum + action.probability, 0), 1);
});

test('both profiles remain finite and normalized across streets, prices and stack limits', () => {
  for (const profileId of ['caller', 'maniac']) for (const board of [[], ['2s', '8d', 'Jh'], ['2s', '8d', 'Jh', 'Ts'], ['2s', '8d', 'Jh', 'Ts', '3s']]) {
    for (const call of [0, .000001, .5, 20, 40, 80, 1000, 1000000]) for (const ownStack of [.000001, 1, 100, 1000]) {
      const actions = distribution(pricedHand({profileId, board, call, ownStack}));
      assert.ok(actions.every(action => Number.isFinite(action.probability) && action.probability >= 0 && action.probability <= 1));
      near(actions.reduce((sum, action) => sum + action.probability, 0), 1);
    }
  }
});

test('engine previews match live BOSS distributions without changing RNG, cards or history', () => {
  for (const profileId of ['caller', 'maniac']) {
    const hand = startHand(createSession({outcome: {mode: 'natural-holdem'}, boss: {mode: 'fixed', profileId}}, 610, {firstSmallBlind: 'player'}));
    const before = JSON.stringify(hand), rng = hand.rng.state();
    for (const choice of ['raise:2x', 'raise:4x', 'raise:allin']) {
      const preview = previewResponse(hand, choice), clone = cloneHand(hand);
      applyAction(clone, choice);
      assert.deepEqual(preview.distribution, getActionDistribution(clone));
      assert.deepEqual(getActionDistribution(clone), getBossProfileDistribution(clone, legalHoldemActions(clone)));
    }
    assert.equal(hand.rng.state(), rng); assert.equal(JSON.stringify(hand), before);
  }
});

test('sampling uses one action draw and only adds a sizing draw for aggression', () => {
  const actions = distribution(pricedHand());
  let calls = 0;
  const passive = sampleDistribution(actions, () => {calls++; return 0;});
  assert.equal(passive.type, 'fold'); assert.equal(calls, 1);
  calls = 0;
  const aggressive = sampleDistribution(actions, () => {calls++; return calls === 1 ? .999999 : .2;});
  assert.equal(aggressive.type, 'raise'); assert.equal(calls, 2);
  const rng = createRng(611), counts = new Map();
  for (let index = 0; index < 30000; index++) {
    const action = sampleDistribution(actions, rng); counts.set(action.id, (counts.get(action.id) ?? 0) + 1);
  }
  for (const action of actions) near((counts.get(action.id) ?? 0) / 30000, action.probability, .008);
});

test('natural probability table uses live-policy examples and explicit historical table remains available', () => {
  const el = {innerHTML: ''}, root = {getElementById: () => el};
  renderBossProbabilityTables(root);
  assert.equal((el.innerHTML.match(/class="boss-raise-prob"/g) ?? []).length, 18);
  assert.match(el.innerHTML, /natural-boss-pressure-v1/); assert.match(el.innerHTML, /不是勝率或 RTP 保證/);
  assert.match(el.innerHTML, /同額合併全部尺寸權重/);
  assert.doesNotMatch(el.innerHTML, /每街開始先|強／不強分類/);
  renderBossProbabilityTables(root, 'pooled-holdem');
  assert.equal((el.innerHTML.match(/class="boss-raise-prob"/g) ?? []).length, 12);
  const naturalHtml = bossProbabilityScenariosHtml(pricedHand());
  assert.match(naturalHtml, /Current legal response/); assert.doesNotMatch(naturalHtml, /Kc|Qd|strong|weak/);
});
