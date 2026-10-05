import test from 'node:test';
import assert from 'node:assert/strict';
import {BOSS_PROFILES, BOSS_PROFILE_VERSION, BOSS_PROFILE_IDS, BOSS_PROFILE_BY_ID, BOSS_BANDS_BY_STREET, normalizeBossConfig,
  selectBossProfile, classifyBossStrength, getBossProfileDistribution} from '../src/boss-profiles.mjs';
import {renderBossProbabilityTables} from '../src/boss-probability-view.mjs';
import {createRng, normalizeConfig, createSession, startHand, applyAction, legalActions, getActionDistribution,
  previewResponse, cloneHand, sampleDistribution, simulate} from '../src/engine.mjs';
import {buildActionTree} from '../src/action-tree.mjs';
import {simulateTreeStudy} from '../src/tree-study.mjs';
import {simulateStudy} from '../src/simulation-study.mjs';

const near = (a, b, tolerance = 1e-10) => assert.ok(Math.abs(a-b) <= tolerance, `${a} != ${b}`);
const manual = {player: {manual: ['As', 'Ah']}, npc: {manual: ['2s', '7c']}};
const fixed = (profileId, config = {}, firstSmallBlind = 'player') => startHand(createSession({outcome:{mode:'legacy-deck'},boss: {mode: 'fixed', profileId}, deal: manual, ...config}, 1729, {firstSmallBlind}));
const sampleHand = (hole, board = [], street = board.length === 5 ? 'river' : board.length === 4 ? 'turn' : board.length === 3 ? 'flop' : 'preflop') => ({holes: {npc: hole}, board, street});

test('historical v1 source tables retain complete street/band coverage and exact percentages', () => {
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

test('v2 fixed street weights equally average every historical row without rounding the inputs', () => {
  assert.equal(BOSS_PROFILE_VERSION, 'four-boss-fixed-street-v2');
  for (const profile of BOSS_PROFILES) {
    assert.deepEqual(Object.keys(profile.streetWeights), ['preflop','flop','turn','river']);
    assert.ok(Object.isFrozen(profile.streetWeights));
    for (const [street, bands] of Object.entries(BOSS_BANDS_BY_STREET)) {
      const weights = profile.streetWeights[street];
      assert.ok(Object.isFrozen(weights));
      assert.deepEqual(Object.keys(weights), ['fold','call','raise']);
      assert.equal(weights.fold + weights.call + weights.raise, 100);
      for (const action of ['fold','call','raise']) {
        near(weights[action], bands.reduce((sum, band) => sum + profile.tables[street][band][action], 0) / bands.length);
      }
    }
  }
  assert.deepEqual(BOSS_PROFILE_BY_ID.caller.streetWeights.flop, {fold:4.5,call:87.5,raise:8});
  assert.deepEqual(BOSS_PROFILE_BY_ID.maniac.streetWeights.turn, {fold:6,call:18.25,raise:75.75});
  assert.deepEqual(BOSS_PROFILE_BY_ID.sniper.streetWeights.river, {fold:49,call:19,raise:32});
  near(BOSS_PROFILE_BY_ID.trapper.streetWeights.preflop.call, 218 / 3);
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
  const seed = 7182, session = createSession({outcome:{mode:'legacy-deck'},deal: manual}, seed), reference = createRng(seed);
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

test('historical strength classifier remains available for v1 research', () => {
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

test('facing a wager uses fixed street percentages; no-cost fold is zero and remaining weights renormalize', () => {
  for (const profileId of BOSS_PROFILE_IDS) {
    const hand = fixed(profileId, {}, 'npc'), table = BOSS_PROFILE_BY_ID[profileId].streetWeights.preflop;
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
  const distribution = getActionDistribution(hand), weights = BOSS_PROFILE_BY_ID.maniac.streetWeights.preflop;
  near(distribution[0].probability, weights.fold / (weights.fold + weights.call));
  near(distribution[1].probability, weights.call / (weights.fold + weights.call));
});

test('fixed street personalities retain calling, attacking, folding and later-street aggression', () => {
  const p = BOSS_PROFILE_BY_ID;
  for (const street of ['preflop','flop','turn','river']) {
    assert.ok(p.caller.streetWeights[street].call > 75);
    assert.ok(p.maniac.streetWeights[street].raise > 70);
    assert.ok(p.sniper.streetWeights[street].fold > p.caller.streetWeights[street].fold);
  }
  assert.ok(p.trapper.streetWeights.flop.call > p.trapper.streetWeights.flop.raise);
  assert.ok(p.trapper.streetWeights.river.raise > p.trapper.streetWeights.turn.raise);
  assert.ok(p.trapper.streetWeights.turn.raise > p.trapper.streetWeights.flop.raise);
});

test('fixed distributions never read any card, bankroll, betting or RNG fields', () => {
  const actions = [{type:'fold',amount:0},{type:'call',amount:5},{type:'raise',amount:15}];
  const beforeActions = structuredClone(actions);
  for (const profile of BOSS_PROFILES) for (const street of Object.keys(BOSS_BANDS_BY_STREET)) {
    const hand = {bossProfile:{id:profile.id},street};
    for (const key of ['holes','board','deck','currentBet','streetBets','stacks','rng']) {
      Object.defineProperty(hand,key,{get() {throw new Error(`unexpected ${key} read`);}});
    }
    const actual = getBossProfileDistribution(hand,actions);
    for (const item of actual) near(item.probability,profile.streetWeights[street][item.type]/100);
    assert.deepEqual(actions,beforeActions);
  }
});

test('changing both private hands and public cards leaves same-street Boss decisions unchanged', () => {
  for (const profileId of BOSS_PROFILE_IDS) {
    const hand = fixed(profileId, {}, 'npc');
    for (const street of ['preflop','flop','turn','river']) {
      hand.street = street;
      const baseline = getActionDistribution(hand);
      for (const [npc,player,board] of [
        [['As','Ah'],['2c','7d'],[]],
        [['2c','7d'],['As','Ah'],['Ks','Qh','Tc']],
        [['Js','9s'],['2c','2d'],['Ts','8s','3d','Kh']],
        [['2c','7d'],['3c','4d'],['As','Ks','Qs','Js','Ts']]
      ]) {
        hand.holes = {npc,player}; hand.board = board;
        assert.deepEqual(getActionDistribution(hand),baseline);
      }
    }
  }
});

test('all fixed street rows filter and normalize every legal action boundary consistently', () => {
  const scenarios = [
    [['fold','call','raise'],['fold','call','raise']],
    [['fold','call'],['fold','call']],
    [['check','bet'],['call','raise']],
    [['check','raise'],['call','raise']],
    [['check'],['call']],
    [['call'],['call']]
  ];
  for (const profile of BOSS_PROFILES) for (const street of Object.keys(BOSS_BANDS_BY_STREET)) {
    const hand = {bossProfile:{id:profile.id},street}, weights = profile.streetWeights[street];
    assert.deepEqual(getBossProfileDistribution(hand,[]),[]);
    for (const [types,keys] of scenarios) {
      const actions = types.map((type,index)=>({type,amount:index*5,to:index*10,allIn:index===types.length-1}));
      const distribution = getBossProfileDistribution(hand,actions);
      const sum = keys.reduce((total,key)=>total+weights[key],0);
      distribution.forEach(({probability,...action},index)=>{
        assert.deepEqual(action,actions[index]);
        near(probability,weights[keys[index]]/sum);
      });
      near(distribution.reduce((total,item)=>total+item.probability,0),1);
    }
  }
});

test('probability tables show one fixed row per street and explain averaging without strength classifications', () => {
  const element = {innerHTML:''};
  renderBossProbabilityTables({getElementById:id=>id==='boss-profile-tables'?element:null});
  const bodies = [...element.innerHTML.matchAll(/<tbody>(.*?)<\/tbody>/gs)];
  assert.equal(bodies.length,4);
  for (const body of bodies) assert.equal([...body[1].matchAll(/<tr>/g)].length,4);
  assert.match(element.innerHTML,/等權算術平均/);
  assert.match(element.innerHTML,/翻牌前與河牌各除以 3，翻牌與轉牌各除以 4/);
  assert.match(element.innerHTML,/不是實測行動頻率/);
  assert.match(element.innerHTML,/不因雙方底牌或公牌改變/);
  assert.match(element.innerHTML,/非法欄位移除後，其餘欄位按比例正規化/);
  assert.doesNotMatch(element.innerHTML,/<th>當下牌力|弱起手|可玩起手|強起手|強成牌|牌力分級/);
});

test('player model weights and Boss profile weights are separate while legacy mode reproduces the old weights', () => {
  const caller = fixed('caller'), maniac = fixed('maniac');
  assert.deepEqual(caller.holes, maniac.holes);
  assert.deepEqual(getActionDistribution(caller), getActionDistribution(maniac)); // Player turn.
  const configured = fixed('caller', {npc: {fold:1,call:0,raise:0,check:1,bet:0}});
  assert.notDeepEqual(getActionDistribution(configured), getActionDistribution(caller));
  applyAction(configured, 'raise'); applyAction(caller, 'raise');
  assert.deepEqual(getActionDistribution(configured), getActionDistribution(caller));
  const legacy = startHand(createSession({outcome:{mode:'legacy-deck'},boss:{mode:'legacy'},npc:{fold:0,call:1,raise:0,check:1,bet:0}},1729));
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
  const result = simulateStudy({outcome:{mode:'legacy-deck'}}, {players:4,entries:30,seed:'profile-audit'});
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
  const fixedStudy = simulateStudy({outcome:{mode:'legacy-deck'},boss:{mode:'fixed',profileId:'caller'}},{players:2,entries:5});
  assert.equal(fixedStudy.byBoss.caller.hands,10);
  assert.equal(fixedStudy.bossEncounterAudit.consecutiveRepeats,8);
  assert.equal(fixedStudy.bossEncounterAudit.unexpectedRepeats,0);
  assert.equal(fixedStudy.methodMeta.ciUnit,'hand'); assert.equal(fixedStudy.methodMeta.ciSamples,10);
  assert.deepEqual(simulateStudy({outcome:{mode:'legacy-deck'}}, {players:1,entries:40}).ci95,[null,null]);
  assert.deepEqual(simulate({outcome:{mode:'legacy-deck'}}, {hands:40}).ci95,[null,null]);
});

test('complete trees lock one Boss for all counterfactual paths and tree-study samples disclose independent encounters', () => {
  const tree = buildActionTree({outcome:{mode:'legacy-deck'}}, {seed:6612}), actual = startHand(createSession({outcome:{mode:'legacy-deck'},},6612));
  assert.equal(tree.bossProfileId,actual.bossProfile.id);
  assert.deepEqual(tree.bossSelection,actual.bossSelection);
  assert.equal(tree.meta.rngStateAfterDeal,tree.meta.rngStateAfterTraversal);
  assert.equal(tree.complete,true); near(tree.summary.terminalProbabilityMass,1);
  const study = simulateTreeStudy({outcome:{mode:'legacy-deck'}}, {deals:8,seed:441});
  const paired = simulateTreeStudy({outcome:{mode:'legacy-deck'}}, {deals:8,seed:441,policy:'call'});
  assert.deepEqual(study.dealSeeds,paired.dealSeeds); assert.deepEqual(study.bossProfileIds,paired.bossProfileIds);
  assert.match(study.meta.bossSampling,/獨立新牌桌/);
  assert.equal(Object.values(study.byBoss).reduce((sum, item) => sum+item.deals,0),8);
  near(Object.values(study.byBoss).reduce((sum,item)=>sum+(item.totals.winProbability||0),0),study.totals.winProbability);
  const fixedStudy = simulateTreeStudy({outcome:{mode:'legacy-deck'},boss:{mode:'fixed',profileId:'sniper'}},{deals:3,seed:54});
  assert.equal(fixedStudy.byBoss.sniper.deals,3);
});
