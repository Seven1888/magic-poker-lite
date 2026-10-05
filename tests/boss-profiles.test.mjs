import test from 'node:test';
import assert from 'node:assert/strict';
import {BOSS_PROFILES, BOSS_PROFILE_IDS, BOSS_PROFILE_BY_ID, BOSS_BANDS_BY_STREET, normalizeBossConfig,
  selectBossProfile, classifyBossStrength, getBossProfileDistribution} from '../src/boss-profiles.mjs';
import {createRng, normalizeConfig, createSession, startHand, applyAction, legalActions, getActionDistribution,
  previewResponse, cloneHand, sampleDistribution, simulate} from '../src/engine.mjs';
import {buildActionTree} from '../src/action-tree.mjs';
import {simulateTreeStudy} from '../src/tree-study.mjs';
import {simulateStudy} from '../src/simulation-study.mjs';

const near = (a, b, tolerance = 1e-10) => assert.ok(Math.abs(a-b) <= tolerance, `${a} != ${b}`);
const manual = {player: {manual: ['As', 'Ah']}, npc: {manual: ['2s', '7c']}};
const fixed = (profileId, config = {}, firstSmallBlind = 'player') => startHand(createSession({boss: {mode: 'fixed', profileId}, deal: manual, ...config}, 1729, {firstSmallBlind}));
const sampleHand = (hole, board = [], street = board.length === 5 ? 'river' : board.length === 4 ? 'turn' : board.length === 3 ? 'flop' : 'preflop') => ({holes: {npc: hole}, board, street});

test('four published immutable profile tables have complete street/band coverage and exact percentages', () => {
  assert.deepEqual(BOSS_PROFILE_IDS, ['caller', 'maniac', 'sniper', 'trapper']);
  assert.deepEqual(BOSS_PROFILES.map(p => `${p.name}｜${p.nickname}`), ['死跟型｜不信邪', '狂攻型｜瘋狗', '狙擊型｜冷面殺手', '設局型｜狐狸']);
  for (const profile of BOSS_PROFILES) for (const [street, bands] of Object.entries(BOSS_BANDS_BY_STREET)) {
    assert.deepEqual(Object.keys(profile.tables[street]), bands);
    for (const weights of Object.values(profile.tables[street])) {
      assert.deepEqual(Object.keys(weights), ['fold', 'call', 'raise']);
      assert.equal(weights.fold + weights.call + weights.raise, 100);
      assert.ok(Object.values(weights).every(value => value >= 0 && value <= 100));
      assert.ok(Object.isFrozen(weights));
    }
  }
});

test('new defaults rotate, fixed and legacy are explicit, and invalid profile configuration fails', () => {
  assert.deepEqual(normalizeConfig().boss, {mode: 'rotate', profileId: 'caller'});
  assert.deepEqual(normalizeConfig({npc: {fold: 1}}).boss, {mode: 'rotate', profileId: 'caller'});
  assert.equal(normalizeConfig({boss: {mode: 'legacy'}}).boss.mode, 'legacy');
  assert.deepEqual(normalizeBossConfig({mode: 'fixed', profileId: 'sniper'}), {mode: 'fixed', profileId: 'sniper'});
  for (const value of [null, [], {mode: 'random'}, {profileId: 'unknown'}]) assert.throws(() => normalizeBossConfig(value));
});

test('first encounter is one uniform four-way draw; later encounters are one uniform draw among the other three', () => {
  for (let index = 0; index < 4; index++) {
    let calls = 0;
    const selected = selectBossProfile(() => {calls++; return (index + .5) / 4;});
    assert.equal(selected.profile.id, BOSS_PROFILE_IDS[index]); assert.equal(calls, 1);
    assert.equal(selected.selection.probability, .25);
  }
  for (const previous of BOSS_PROFILE_IDS) {
    const eligible = BOSS_PROFILE_IDS.filter(id => id !== previous);
    for (let index = 0; index < 3; index++) {
      let calls = 0;
      const selected = selectBossProfile(() => {calls++; return (index + .5) / 3;}, previous);
      assert.equal(selected.profile.id, eligible[index]); assert.equal(calls, 1);
      assert.deepEqual(selected.selection.eligibleIds, eligible);
      assert.equal(selected.selection.probability, 1 / 3);
    }
  }
  assert.throws(() => selectBossProfile(() => 1), /亂數/);
  assert.throws(() => selectBossProfile(() => NaN), /亂數/);
});

test('fixed and legacy encounter modes consume no selection RNG and fixed deliberately permits repeats', () => {
  const forbidden = () => {throw new Error('unexpected RNG');};
  const chosen = selectBossProfile(forbidden, 'caller', {mode: 'fixed', profileId: 'caller'});
  assert.equal(chosen.profile.id, 'caller'); assert.equal(chosen.selection.probability, 1);
  assert.equal(selectBossProfile(forbidden, 'caller', {mode: 'legacy'}).profile, null);
});

test('a long rotating profile sequence is reproducible, approximately uniform, and never repeats consecutively', () => {
  const run = () => {
    const rng = createRng('boss-encounters'), counts = Object.fromEntries(BOSS_PROFILE_IDS.map(id => [id, 0]));
    let previous = null;
    for (let i = 0; i < 20000; i++) {
      const {profile} = selectBossProfile(rng, previous);
      assert.notEqual(profile.id, previous); counts[profile.id]++; previous = profile.id;
    }
    return counts;
  };
  const counts = run(); assert.deepEqual(run(), counts);
  for (const count of Object.values(counts)) assert.ok(count > 4700 && count < 5300);
});

test('startHand owns the sole profile draw and preserves no-repeat history across stack resets', () => {
  const seed = 7182, session = createSession({deal: manual}, seed), reference = createRng(seed);
  let previous = null;
  for (let turn = 0; turn < 15; turn++) {
    session.stacks = {player: 10000, npc: 10000};
    const expected = selectBossProfile(reference, previous);
    for (let i = 0; i < 47; i++) reference(); // Both manual pairs reserve four cards; remaining deck shuffles once.
    const hand = startHand(session);
    assert.equal(hand.bossProfile.id, expected.profile.id);
    assert.deepEqual(hand.bossSelection, expected.selection);
    assert.equal(hand.rng.state(), reference.state());
    assert.equal(session.lastBossProfileId, hand.bossProfile.id);
    assert.notEqual(hand.bossProfile.id, previous);
    previous = hand.bossProfile.id;
    applyAction(hand, 'fold');
  }
});

test('strength bands use only currently visible own cards and detect weak pairs, flush draws, gutshots and strong made hands', () => {
  const cases = [
    [sampleHand(['2s','7c']), 'weak'], [sampleHand(['2s','2h']), 'playable'], [sampleHand(['As','Ah']), 'premium'],
    [sampleHand(['2c','7d'],['As','Kh','9c']), 'high'], [sampleHand(['2c','2d'],['As','Kh','9c']), 'pair'],
    [sampleHand(['As','Qs'],['Js','2s','7h']), 'draw'], [sampleHand(['As','5d'],['2c','3h','Kh']), 'draw'],
    [sampleHand(['2c','2d'],['2s','Kh','9c']), 'strong'],
    [sampleHand(['As','Qs'],['Js','2s','7h','Kd','9c']), 'high']
  ];
  for (const [hand, band] of cases) {
    Object.defineProperty(hand.holes, 'player', {get() {throw new Error('opponent cards read');}});
    Object.defineProperty(hand, 'deck', {get() {throw new Error('future deck read');}});
    hand.rng = () => {throw new Error('classification RNG');};
    assert.equal(classifyBossStrength(hand).band, band);
  }
});

test('facing a wager uses the exact table percentages; no-cost fold is zero and passive/aggressive weights renormalize', () => {
  for (const profileId of BOSS_PROFILE_IDS) {
    const hand = fixed(profileId, {}, 'npc'), table = BOSS_PROFILE_BY_ID[profileId].tables.preflop.weak;
    const facing = getActionDistribution(hand);
    for (const action of facing) near(action.probability, table[action.type] / 100);
    const free = {...hand, currentBet: hand.streetBets.npc};
    const actions = [{type:'fold',amount:0},{type:'check',amount:0},{type:'bet',amount:10}];
    const distribution = getBossProfileDistribution(free, actions);
    assert.equal(distribution[0].probability, 0);
    near(distribution[1].probability, table.call / (table.call + table.raise));
    near(distribution[2].probability, table.raise / (table.call + table.raise));
    near(distribution.reduce((sum, action) => sum + action.probability, 0), 1);
  }
});

test('when raising is unavailable only the remaining fold/call weights are normalized', () => {
  const hand = fixed('maniac'); applyAction(hand, 'raise');
  assert.deepEqual(legalActions(hand).map(action => action.type), ['fold','call']);
  const distribution = getActionDistribution(hand), weights = BOSS_PROFILE_BY_ID.maniac.tables.preflop.weak;
  near(distribution[0].probability, weights.fold / (weights.fold + weights.call));
  near(distribution[1].probability, weights.call / (weights.fold + weights.call));
});

test('caller keeps weak pairs and draws, sniper differentiates strength, and fox traps early with strong hands', () => {
  const p = BOSS_PROFILE_BY_ID;
  assert.ok(p.caller.tables.flop.pair.call >= 90 && p.caller.tables.flop.draw.call >= 90);
  assert.ok(p.maniac.tables.flop.high.raise > p.caller.tables.flop.strong.raise);
  assert.ok(p.sniper.tables.river.high.fold > 80 && p.sniper.tables.river.strong.raise > 80);
  assert.ok(p.trapper.tables.flop.strong.call > p.trapper.tables.flop.strong.raise);
  assert.ok(p.trapper.tables.river.strong.raise > p.trapper.tables.flop.strong.raise);
});

test('player model weights and Boss profile weights are separate while legacy mode reproduces the old weights', () => {
  const caller = fixed('caller'), maniac = fixed('maniac');
  assert.deepEqual(caller.holes, maniac.holes);
  assert.deepEqual(getActionDistribution(caller), getActionDistribution(maniac)); // Player turn.
  const configured = fixed('caller', {npc: {fold:1,call:0,raise:0,check:1,bet:0}});
  assert.notDeepEqual(getActionDistribution(configured), getActionDistribution(caller));
  applyAction(configured, 'raise'); applyAction(caller, 'raise');
  assert.deepEqual(getActionDistribution(configured), getActionDistribution(caller));
  const legacy = startHand(createSession({boss:{mode:'legacy'},npc:{fold:0,call:1,raise:0,check:1,bet:0}},1729));
  applyAction(legacy, 'raise'); assert.equal(getActionDistribution(legacy).find(a => a.type === 'call').probability, 1);
});

test('previews and clones retain the locked profile, consume no RNG and match the actual response distribution', () => {
  for (const profileId of BOSS_PROFILE_IDS) {
    const hand = fixed(profileId), before = JSON.stringify(hand), rng = hand.rng.state();
    const preview = previewResponse(hand, 'raise'), clone = cloneHand(hand);
    assert.equal(clone.bossProfile, hand.bossProfile);
    assert.deepEqual(clone.bossSelection, hand.bossSelection);
    assert.equal(JSON.stringify(hand), before); assert.equal(hand.rng.state(), rng);
    applyAction(hand, 'raise');
    assert.deepEqual(preview.distribution, getActionDistribution(hand));
    const beforeHidden = getActionDistribution(hand);
    hand.holes.player = ['3s','4h']; hand.deck.reverse();
    assert.deepEqual(getActionDistribution(hand), beforeHidden);
    let calls = 0; sampleDistribution(beforeHidden, () => {calls++; return .7;}); assert.equal(calls, 1);
  }
});

test('sampled Boss actions follow the published distribution', () => {
  const hand = fixed('caller', {}, 'npc'), distribution = getActionDistribution(hand), rng = createRng(5231);
  const counts = {fold:0,call:0,raise:0};
  for (let i = 0; i < 30000; i++) counts[sampleDistribution(distribution, rng).type]++;
  for (const action of distribution) near(counts[action.type] / 30000, action.probability, .008);
});

test('profile studies reconcile per-Boss summaries and audit every no-repeat transition across independent stack resets', () => {
  const result = simulateStudy({}, {players:4,entries:30,seed:'profile-audit'});
  assert.equal(result.bossEncounterAudit.checkedTransitions, 116);
  assert.equal(result.bossEncounterAudit.firstSelections, 4);
  assert.equal(result.bossEncounterAudit.unexpectedRepeats, 0);
  assert.equal(result.bossEncounterAudit.consecutiveRepeats, 0);
  assert.equal(result.bossEncounterAudit.selectionProbabilityCounts['0.25'], 4);
  assert.equal(result.bossEncounterAudit.selectionProbabilityCounts[String(1/3)], 116);
  for (const player of result.playerResults) {
    assert.equal(player.bossProfileSequence.length, 30);
    assert.ok(player.bossProfileSequence.every((id,index,sequence) => index === 0 || id !== sequence[index-1]));
  }
  for (const key of ['hands','wagers','netReturns','totalReturns','wins','showdowns','showdownWins','jackpotAwards']) {
    near(Object.values(result.byBoss).reduce((sum, item) => sum + item[key], 0), result[key], 1e-6);
  }
  assert.equal(result.methodMeta.ciUnit, 'player'); assert.equal(result.methodMeta.ciSamples, 4);
  const residual = result.playerResults.reduce((sum,p) => sum+(p.totalReturns-result.totalRtp*p.wagers)**2,0);
  near(result.standardError,Math.sqrt(4/3*residual)/result.wagers);
});

test('fixed-profile studies intentionally repeat and keep hand CI; one rotating sequence cannot claim independent-hand CI', () => {
  const fixedStudy = simulateStudy({boss:{mode:'fixed',profileId:'caller'}},{players:2,entries:5});
  assert.equal(fixedStudy.byBoss.caller.hands,10);
  assert.equal(fixedStudy.bossEncounterAudit.consecutiveRepeats,8);
  assert.equal(fixedStudy.bossEncounterAudit.unexpectedRepeats,0);
  assert.equal(fixedStudy.methodMeta.ciUnit,'hand'); assert.equal(fixedStudy.methodMeta.ciSamples,10);
  assert.deepEqual(simulateStudy({}, {players:1,entries:40}).ci95,[null,null]);
  assert.deepEqual(simulate({}, {hands:40}).ci95,[null,null]);
});

test('complete trees lock one Boss for all counterfactual paths and tree-study samples disclose independent encounters', () => {
  const tree = buildActionTree({}, {seed:6612}), actual = startHand(createSession({},6612));
  assert.equal(tree.bossProfileId,actual.bossProfile.id);
  assert.deepEqual(tree.bossSelection,actual.bossSelection);
  assert.equal(tree.meta.rngStateAfterDeal,tree.meta.rngStateAfterTraversal);
  assert.equal(tree.complete,true); near(tree.summary.terminalProbabilityMass,1);
  const study = simulateTreeStudy({}, {deals:8,seed:441});
  const paired = simulateTreeStudy({}, {deals:8,seed:441,policy:'call'});
  assert.deepEqual(study.dealSeeds,paired.dealSeeds); assert.deepEqual(study.bossProfileIds,paired.bossProfileIds);
  assert.match(study.meta.bossSampling,/獨立新牌桌/);
  assert.equal(Object.values(study.byBoss).reduce((sum, item) => sum+item.deals,0),8);
  near(Object.values(study.byBoss).reduce((sum,item)=>sum+(item.totals.winProbability||0),0),study.totals.winProbability);
  const fixedStudy = simulateTreeStudy({boss:{mode:'fixed',profileId:'sniper'}},{deals:3,seed:54});
  assert.equal(fixedStudy.byBoss.sniper.deals,3);
});
