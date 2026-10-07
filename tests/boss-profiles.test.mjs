import test from 'node:test';
import assert from 'node:assert/strict';
import {BOSS_PROFILES, BOSS_PROFILE_VERSION, BOSS_PROFILE_IDS, BOSS_PROFILE_BY_ID, BOSS_BANDS_BY_STREET,
  BOSS_RAISE_SIZE_WEIGHTS, normalizeBossConfig, selectBossProfile, classifyBossStrength, lockBossStreetStrength,
  getBossProfileDistribution, getBossProbabilityScenarios} from '../src/boss-profiles.mjs';
import {renderBossProbabilityTables, bossProbabilityScenariosHtml} from '../src/boss-probability-view.mjs';
import {createRng, normalizeConfig, createSession, startHand, applyAction, getActionDistribution,
  previewResponse, cloneHand, sampleDistribution, simulate} from '../src/engine.mjs';
import {buildActionTree} from '../src/action-tree.mjs';
import {simulateTreeStudy} from '../src/tree-study.mjs';
import {simulateStudy} from '../src/simulation-study.mjs';

const near = (a, b, tolerance = 1e-10) => assert.ok(Math.abs(a-b) <= tolerance, `${a} != ${b}`);
const manual = {player: {manual: ['As', 'Ah']}, npc: {manual: ['2s', '7c']}};
const fixed = (profileId, config = {}, firstSmallBlind = 'player') => startHand(createSession({outcome:{mode:'legacy-deck'},boss: {mode: 'fixed', profileId}, deal: manual, ...config}, 1729, {firstSmallBlind}));
const sampleHand = (hole, board = [], extra = {}) => ({holes: {npc: hole}, board,
  street: board.length === 5 ? 'river' : board.length === 4 ? 'turn' : board.length === 3 ? 'flop' : 'preflop', ...extra});
const classified = (profileId, band = 'strong') => ({bossProfile: {id: profileId}, street: 'flop', bossStreetStrength: {street: 'flop', band}});
const simpleActions = types => types.map(type => ({type, amount: type === 'fold' || type === 'check' ? 0 : 10}));
const raiseActions = ['half', 'pot', 'allin'].map((sizeKey, index) => ({type: 'raise', id: `raise:${sizeKey}`, sizeKey, sizeKeys:[sizeKey], amount: [20, 30, 100][index]}));

test('the two profiles cover both bands on every street with exact immutable percentages', () => {
  assert.equal(BOSS_PROFILE_VERSION, 'two-boss-price-response-v4');
  assert.deepEqual(BOSS_PROFILE_IDS, ['caller', 'maniac']);
  assert.deepEqual(BOSS_PROFILES.map(p => `${p.name}|${p.nickname}`), ['不激進|PASSIVE', '激進|AGGRESSIVE']);
  for (const profile of BOSS_PROFILES) for (const [street, bands] of Object.entries(BOSS_BANDS_BY_STREET)) {
    assert.deepEqual(Object.keys(profile.tables[street]), bands);
    for (const weights of Object.values(profile.tables[street])) {
      assert.deepEqual(Object.keys(weights), ['fold', 'call', 'raise']);
      assert.equal(weights.fold + weights.call + weights.raise, 100);
      assert.ok(Object.values(weights).every(value => value >= 0 && value <= 100));
      assert.ok(Object.isFrozen(weights));
    }
  }
  assert.deepEqual(BOSS_PROFILE_BY_ID.maniac.weights, {weak:{fold:45,call:55,raise:0},strong:{fold:5,call:25,raise:70}});
  assert.deepEqual(BOSS_PROFILE_BY_ID.caller.weights, {weak:{fold:25,call:75,raise:0},strong:{fold:5,call:65,raise:30}});
  assert.deepEqual(BOSS_RAISE_SIZE_WEIGHTS, {half:.5,pot:.35,allin:.15});
});

test('configuration migrates removed profiles and keeps explicit research modes', () => {
  assert.deepEqual(normalizeConfig().boss, {mode:'rotate',profileId:'caller'});
  assert.deepEqual(normalizeConfig({npc:{fold:1}}).boss, {mode:'rotate',profileId:'caller'});
  assert.equal(normalizeConfig({boss:{mode:'legacy'}}).boss.mode, 'legacy');
  for (const profileId of ['sniper','trapper']) assert.deepEqual(normalizeBossConfig({mode:'fixed',profileId}), {mode:'fixed',profileId:'caller'});
  for (const value of [null,[],{mode:'random'},{profileId:'unknown'}]) assert.throws(() => normalizeBossConfig(value));
});

test('first encounter is 50/50 and later rotating encounters alternate without rejection draws', () => {
  for (let index = 0; index < 2; index++) {
    let calls = 0;
    const selected = selectBossProfile(() => {calls++; return (index+.5)/2;});
    assert.equal(selected.profile.id, BOSS_PROFILE_IDS[index]); assert.equal(calls, 1);
    assert.equal(selected.selection.probability, .5);
  }
  for (const previous of BOSS_PROFILE_IDS) for (const roll of [0,.5,.99999]) {
    let calls = 0;
    const selected = selectBossProfile(() => {calls++; return roll;}, previous);
    assert.notEqual(selected.profile.id, previous); assert.equal(calls, 1);
    assert.deepEqual(selected.selection.eligibleIds, BOSS_PROFILE_IDS.filter(id => id !== previous));
    assert.equal(selected.selection.probability, 1);
  }
  assert.throws(() => selectBossProfile(() => 1), /亂數/);
  assert.throws(() => selectBossProfile(() => NaN), /亂數/);
});

test('fixed and legacy encounter modes consume no selection RNG', () => {
  const forbidden = () => {throw Error('unexpected RNG');};
  assert.equal(selectBossProfile(forbidden, 'caller', {mode:'fixed',profileId:'caller'}).profile.id, 'caller');
  assert.equal(selectBossProfile(forbidden, 'caller', {mode:'legacy'}).profile, null);
});

test('long rotating sequences are reproducible, balanced and never repeat', () => {
  const run = () => {
    const rng=createRng('boss-encounters'), counts={caller:0,maniac:0}; let previous=null;
    for(let i=0;i<20000;i++) {const {profile}=selectBossProfile(rng,previous);assert.notEqual(profile.id,previous);counts[profile.id]++;previous=profile.id;}
    return counts;
  };
  assert.deepEqual(run(),{caller:10000,maniac:10000}); assert.deepEqual(run(),run());
});

test('startHand owns profile selection and preserves encounter history across stack resets', () => {
  const session=createSession({outcome:{mode:'legacy-deck'},deal:manual},7182); let previous=null;
  for(let turn=0;turn<15;turn++) {
    session.stacks={player:10000,npc:10000}; const hand=startHand(session);
    assert.equal(session.lastBossProfileId,hand.bossProfile.id); assert.notEqual(hand.bossProfile.id,previous);
    assert.equal(hand.bossSelection.probability,turn===0?.5:1); previous=hand.bossProfile.id; applyAction(hand,'fold');
  }
});

test('preflop strong conditions are pair, two broadway cards, or suited ace only', () => {
  for(const hole of [['2s','2h'],['Ts','Jh'],['As','2s']]) assert.equal(classifyBossStrength(sampleHand(hole)).band,'strong');
  for(const hole of [['As','2h'],['Ks','9s'],['9s','8s'],['2s','7c']]) assert.equal(classifyBossStrength(sampleHand(hole)).band,'weak');
});

test('postflop made hands include board-only pairs and draws include board-only four-flush and open ends', () => {
  for(const hand of [sampleHand(['2c','7d'],['As','Ah','9c']),sampleHand(['As','Kd'],['2h','5h','8h','Jh']),
    sampleHand(['As','Kd'],['4h','5c','6h','7c']),sampleHand(['2c','2d'],['2s','Kh','9c'])]) {
    assert.equal(classifyBossStrength(hand).band,'strong');
  }
  const boardDraw=classifyBossStrength(sampleHand(['As','Kd'],['4h','5c','6h','7c']));
  assert.equal(boardDraw.openEndedStraightDraw,true);assert.equal(boardDraw.holeOpenEndedStraightDraw,false);
});

test('open ends handle ace boundaries without treating A234 or JQKA as double-ended', () => {
  const cases=[
    [sampleHand(['2s','3h'],['4c','5d','Kh']),true], [sampleHand(['Ts','Jh'],['Qc','Kd','2h']),true],
    [sampleHand(['As','2h'],['3c','4d','Kh']),false], [sampleHand(['As','Jh'],['Qc','Kd','2h']),false]
  ];
  for(const [hand,expected] of cases) assert.equal(classifyBossStrength(hand).openEndedStraightDraw,expected);
});

test('gutshot bluff requires a hole-exclusive rank and a hole overcard', () => {
  const bluff=classifyBossStrength(sampleHand(['As','5d'],['2c','3h','Kh']));
  assert.equal(bluff.band,'strong');assert.ok(bluff.reasons.includes('gutshot-overcard-bluff'));
  const noOvercard=classifyBossStrength(sampleHand(['5s','2d'],['3c','7h','6h']));
  assert.equal(noOvercard.gutshot,true);assert.equal(noOvercard.band,'weak');
  const boardOnly=classifyBossStrength(sampleHand(['As','Kd'],['5c','6h','8d','9c']));
  assert.equal(boardOnly.gutshot,true);assert.equal(boardOnly.holeGutshot,false);assert.equal(boardOnly.band,'weak');
});

test('river missed draws require previous Turn aggression and hole participation', () => {
  const hand=sampleHand(['8s','9d'],['Tc','Jh','2c','5s','3h']);
  assert.equal(classifyBossStrength(hand).band,'weak');
  hand.history=[{street:'turn',actor:'npc',type:'bet'}];
  assert.ok(classifyBossStrength(hand).reasons.includes('missed-turn-draw-bluff'));
  hand.history=[{street:'river',actor:'npc',type:'raise'},{street:'turn',actor:'player',type:'bet'}];
  assert.equal(classifyBossStrength(hand).band,'weak');
  const boardOnly=sampleHand(['As','Kd'],['4c','5h','6d','7s','2h'],{history:[{street:'turn',actor:'npc',type:'raise'}]});
  assert.equal(classifyBossStrength(boardOnly).band,'weak');
});

test('river ace-flush blocker requires exactly three suited board cards and Turn aggression', () => {
  const hand=sampleHand(['As','7d'],['Ks','9s','4h','2c','3s']);
  assert.equal(classifyBossStrength(hand).band,'weak');
  hand.history=[{street:'turn',actor:'npc',type:'raise'}];
  const result=classifyBossStrength(hand);
  assert.equal(result.band,'strong');assert.deepEqual(result.reasons,['ace-flush-blocker-bluff']);
  hand.holes.npc=['Qs','7d'];assert.equal(classifyBossStrength(hand).band,'weak');
});

test('classification reads neither player cards, future cards, current betting, stack sizes nor RNG', () => {
  const hand=sampleHand(['As','5d'],['2c','3h','Kh']);
  Object.defineProperty(hand.holes,'player',{get(){throw Error('private player read');}});
  for(const key of ['deck','rng','stacks','currentBet','streetBets','pot'])Object.defineProperty(hand,key,{get(){throw Error(`unexpected ${key}`);}});
  assert.equal(classifyBossStrength(hand).band,'strong');
});

test('a street snapshot is locked before player action and survives reraises and card-field mutation', () => {
  const hand=sampleHand(['As','5d'],['2c','3h','Kh'],{bossProfile:{id:'maniac'}});
  const state=lockBossStreetStrength(hand), before=getBossProbabilityScenarios(hand);
  assert.ok(Object.isFrozen(state));assert.ok(Object.isFrozen(hand.bossStreetStates));
  hand.holes.npc=['6s','9h'];hand.pot=100000;hand.currentBet=50000;
  hand.history=[{street:'flop',actor:'player',type:'raise'}];
  assert.equal(lockBossStreetStrength(hand),state);assert.deepEqual(getBossProbabilityScenarios(hand),before);
  hand.street='turn';hand.board.push('Jc');
  assert.equal(lockBossStreetStrength(hand).band,'weak');assert.equal(hand.bossStreetStates.flop,state);
});

test('Turn snapshot records own draw for River and keeps completed-street evidence independent', () => {
  const hand=sampleHand(['8s','9d'],['Tc','Jh','2c','5s'],{bossProfile:{id:'maniac'}});
  const turn=lockBossStreetStrength(hand);assert.equal(turn.holeOpenEndedStraightDraw,true);
  hand.history=[{street:'turn',actor:'npc',type:'bet'}];hand.street='river';hand.board.push('3h');
  assert.ok(lockBossStreetStrength(hand).reasons.includes('missed-turn-draw-bluff'));
  assert.equal(hand.bossStreetStates.turn,turn);
});

test('public scenarios expose price contexts without secret classification fields', () => {
  for(const profileId of BOSS_PROFILE_IDS)for(const band of ['weak','strong']) {
    const hand=classified(profileId,band), s=getBossProbabilityScenarios(hand),w=BOSS_PROFILE_BY_ID[profileId].weights[band];
    assert.deepEqual(Object.keys(s),['facing','free','noRaise','sizes','byPressure']);
    near(s.facing.fold,w.fold/100);near(s.facing.call,w.call/100);near(s.facing.raise,w.raise/100);
    near(s.free.check,(w.fold+w.call)/100);near(s.free.raise,w.raise/100);
    near(s.noRaise.fold,w.fold/(w.fold+w.call));near(s.noRaise.call,w.call/(w.fold+w.call));
    assert.doesNotMatch(JSON.stringify(s),/strong|weak|band|reasons|cards|category/);
  }
});

test('legal distributions preserve fixed class weights and merge free fold probability into CHECK', () => {
  for(const profileId of BOSS_PROFILE_IDS)for(const band of ['weak','strong']) {
    const hand=classified(profileId,band),w=BOSS_PROFILE_BY_ID[profileId].weights[band];
    for(const item of getBossProfileDistribution(hand,simpleActions(['fold','call','raise'])))near(item.probability,w[item.type]/100);
    const free=getBossProfileDistribution(hand,simpleActions(['fold','check','bet']));
    assert.equal(free[0].probability,0);near(free[1].probability,(w.fold+w.call)/100);near(free[2].probability,w.raise/100);
    const noRaise=getBossProfileDistribution(hand,simpleActions(['fold','call']));
    near(noRaise[0].probability,w.fold/(w.fold+w.call));near(noRaise[1].probability,w.call/(w.fold+w.call));
    assert.deepEqual(getBossProfileDistribution(hand,[]),[]);
    assert.equal(getBossProfileDistribution(hand,simpleActions(['check']))[0].probability,1);
    assert.equal(getBossProfileDistribution(hand,simpleActions(['call']))[0].probability,1);
  }
});

test('aggression sizes use 50/35/15 and equal legal amounts merge probability mass', () => {
  const hand=classified('maniac'), actions=[...simpleActions(['fold','call']),...raiseActions];
  const before=structuredClone(actions),distribution=getBossProfileDistribution(hand,actions);
  distribution.forEach((action,index)=>near(action.probability,[.05,.25,.35,.245,.105][index]));
  assert.deepEqual(actions,before);
  const merged=getBossProfileDistribution(hand,[...simpleActions(['fold','call']),
    {type:'raise',id:'raise:half',sizeKeys:['half','pot'],amount:20},
    {type:'raise',id:'raise:allin',sizeKeys:['allin'],amount:25}]);
  near(merged[2].probability,.595);near(merged[3].probability,.105);
  const allIn=getBossProfileDistribution(hand,[...simpleActions(['fold','call']),{type:'raise',sizeKeys:['half','pot','allin'],allIn:true,amount:20}]);
  near(allIn[2].probability,.7);
});

test('historical distribution does not inspect cards or betting fields after the street lock', () => {
  for(const profileId of BOSS_PROFILE_IDS)for(const band of ['weak','strong']) {
    const hand=classified(profileId,band);
    for(const key of ['holes','board','deck','currentBet','streetBets','stacks','rng','history'])Object.defineProperty(hand,key,{get(){throw Error(`unexpected ${key}`);}});
    near(getBossProfileDistribution(hand,simpleActions(['fold','call','raise'])).reduce((sum,a)=>sum+a.probability,0),1);
  }
});

test('both current Holdem NPC models request the real two-stage sizing draw', () => {
  const hand=classified('maniac'),actions=[...simpleActions(['fold','call']),...raiseActions];
  for(const mode of ['fixed-holdem','pooled-holdem']){
    hand.config={outcome:{mode}};
    assert.ok(getBossProfileDistribution(hand,actions).every(item=>item.bossSizing===true));
  }
  for(const mode of ['legacy-deck','prebuilt-pools']){
    hand.config.outcome.mode=mode;
    assert.ok(getBossProfileDistribution(hand,actions).every(item=>!Object.hasOwn(item,'bossSizing')));
  }
});

test('pooled NPC card switches keep all published street odds until the next board reveal', () => {
  const hand=sampleHand(['2c','2d'],['As','Kh','9c'],{
    bossProfile:{id:'maniac'},config:{outcome:{mode:'pooled-holdem'}}});
  const opening=lockBossStreetStrength(hand),odds=getBossProbabilityScenarios(hand);
  const facing=getBossProfileDistribution(hand,[...simpleActions(['fold','call']),...raiseActions]);
  assert.equal(opening.band,'strong');
  // A selected paid-result transition changes the hidden layout, not this street's already-published policy.
  hand.holes.npc=['6s','4h'];
  hand.history=[{actor:'player',street:'flop',type:'raise',amount:75}];
  assert.equal(classifyBossStrength(hand).band,'weak');
  assert.equal(lockBossStreetStrength(hand),opening);
  assert.deepEqual(getBossProbabilityScenarios(hand),odds);
  assert.deepEqual(getBossProfileDistribution(hand,[...simpleActions(['fold','call']),...raiseActions]),facing);
  hand.street='turn';hand.board.push('Jc');
  const next=lockBossStreetStrength(hand);
  assert.equal(next.band,'weak');assert.equal(hand.bossStreetStates.flop,opening);
  assert.deepEqual(getBossProbabilityScenarios(hand).facing,{fold:.45,call:.55,raise:0});
});

test('pooled card replacement cannot rewrite the completed Turn draw evidence', () => {
  const hand=sampleHand(['8s','9d'],['Tc','Jh','2c','5s'],{
    bossProfile:{id:'caller'},config:{outcome:{mode:'pooled-holdem'}}});
  const turn=lockBossStreetStrength(hand);
  assert.equal(turn.holeOpenEndedStraightDraw,true);
  hand.history=[{actor:'npc',street:'turn',type:'bet'}];
  hand.holes.npc=['As','7d'];
  assert.equal(lockBossStreetStrength(hand),turn);
  hand.street='river';hand.board.push('3h');
  const river=lockBossStreetStrength(hand);
  assert.equal(river.category,0);
  assert.ok(river.reasons.includes('missed-turn-draw-bluff'));
  assert.equal(hand.bossStreetStates.turn,turn);
});

test('probability tool explains explicit conditions and in-game table does not expose class or cards', () => {
  const element={innerHTML:''};renderBossProbabilityTables({getElementById:id=>id==='boss-profile-tables'?element:null});
  assert.equal([...element.innerHTML.matchAll(/<tbody>/g)].length,2);
  assert.match(element.innerHTML,/首次兩種各 50%/);assert.match(element.innerHTML,/每街開始/);assert.match(element.innerHTML,/不是.*統計平均/);
  assert.match(element.innerHTML,/25.00%/);assert.match(element.innerHTML,/70.00%/);assert.match(element.innerHTML,/A234、JQKA 不算/);
  assert.doesNotMatch(element.innerHTML,/等權算術平均|每街最多加注一次|狙擊型|設局型/);
  const html=bossProbabilityScenariosHtml(classified('maniac'));
  assert.match(html,/Facing a bet/);assert.match(html,/Free to check/);assert.match(html,/No raise available/);
  assert.match(html,/16.67%/);assert.doesNotMatch(html,/strong|weak|As|band|reason/);
});

test('player model weights stay independent from Boss profiles and legacy has explicit old weights', () => {
  const caller=fixed('caller'),maniac=fixed('maniac');assert.deepEqual(caller.holes,maniac.holes);
  assert.deepEqual(getActionDistribution(caller),getActionDistribution(maniac));
  const configured=fixed('caller',{npc:{fold:1,call:0,raise:0,check:1,bet:0}});
  assert.notDeepEqual(getActionDistribution(configured),getActionDistribution(caller));
  applyAction(configured,'raise');applyAction(caller,'raise');assert.deepEqual(getActionDistribution(configured),getActionDistribution(caller));
  const legacy=startHand(createSession({outcome:{mode:'legacy-deck'},boss:{mode:'legacy'},npc:{fold:0,call:1,raise:0,check:1,bet:0}},1729));
  applyAction(legacy,'raise');assert.equal(getActionDistribution(legacy).find(a=>a.type==='call').probability,1);
});

test('previews preserve profile and lock, consume no RNG and match actual responses', () => {
  for(const profileId of BOSS_PROFILE_IDS) {
    const hand=fixed(profileId);lockBossStreetStrength(hand);const before=JSON.stringify(hand),rng=hand.rng.state();
    const preview=previewResponse(hand,'raise'),clone=cloneHand(hand);
    assert.equal(clone.bossProfile,hand.bossProfile);assert.deepEqual(clone.bossStreetStrength,hand.bossStreetStrength);
    assert.equal(JSON.stringify(hand),before);assert.equal(hand.rng.state(),rng);
    applyAction(hand,'raise');assert.deepEqual(preview.distribution,getActionDistribution(hand));
    const distribution=getActionDistribution(hand);hand.holes.player=['3s','4h'];hand.deck.reverse();
    assert.deepEqual(getActionDistribution(hand),distribution);
    let calls=0;sampleDistribution(distribution,()=>{calls++;return .7;});assert.equal(calls,1);
  }
});

test('sampled Boss actions and all three sizes follow published probabilities', () => {
  const distribution=getBossProfileDistribution(classified('maniac'),[...simpleActions(['fold','call']),...raiseActions]);
  const rng=createRng(5231),counts=new Map();
  for(let i=0;i<50000;i++){const chosen=sampleDistribution(distribution,rng),key=chosen.id??chosen.type;counts.set(key,(counts.get(key)??0)+1);}
  for(const action of distribution)near((counts.get(action.id??action.type)??0)/50000,action.probability,.008);
});

test('profile studies reconcile per-Boss statistics and audit every alternating transition', () => {
  const result=simulateStudy({outcome:{mode:'legacy-deck'}},{players:4,entries:30,seed:'profile-audit'});
  assert.equal(result.bossEncounterAudit.checkedTransitions,116);assert.equal(result.bossEncounterAudit.firstSelections,4);
  assert.equal(result.bossEncounterAudit.unexpectedRepeats,0);assert.equal(result.bossEncounterAudit.consecutiveRepeats,0);
  assert.equal(result.bossEncounterAudit.selectionProbabilityCounts['0.5'],4);assert.equal(result.bossEncounterAudit.selectionProbabilityCounts['1'],116);
  for(const player of result.playerResults)assert.ok(player.bossProfileSequence.every((id,index,sequence)=>index===0||id!==sequence[index-1]));
  for(const key of ['hands','wagers','netReturns','totalReturns','wins','showdowns','showdownWins','jackpotAwards'])near(Object.values(result.byBoss).reduce((sum,item)=>sum+item[key],0),result[key],1e-6);
  assert.equal(result.methodMeta.ciUnit,'player');assert.equal(result.methodMeta.ciSamples,4);
  const residual=result.playerResults.reduce((sum,p)=>sum+(p.totalReturns-result.totalRtp*p.wagers)**2,0);
  near(result.standardError,Math.sqrt(4/3*residual)/result.wagers);
});

test('fixed-profile studies intentionally repeat and preserve the documented CI unit', () => {
  const study=simulateStudy({outcome:{mode:'legacy-deck'},boss:{mode:'fixed',profileId:'caller'}},{players:2,entries:5});
  assert.equal(study.byBoss.caller.hands,10);assert.equal(study.bossEncounterAudit.consecutiveRepeats,8);
  assert.equal(study.bossEncounterAudit.unexpectedRepeats,0);assert.equal(study.methodMeta.ciUnit,'hand');
  assert.deepEqual(simulateStudy({outcome:{mode:'legacy-deck'}},{players:1,entries:40}).ci95,[null,null]);
  assert.deepEqual(simulate({outcome:{mode:'legacy-deck'}},{hands:40}).ci95,[null,null]);
});

test('historical action trees keep one selected profile and independent-deal study accounting', () => {
  const tree=buildActionTree({outcome:{mode:'legacy-deck'}},{seed:6612}),actual=startHand(createSession({outcome:{mode:'legacy-deck'}},6612));
  assert.equal(tree.bossProfileId,actual.bossProfile.id);assert.deepEqual(tree.bossSelection,actual.bossSelection);
  assert.equal(tree.meta.rngStateAfterDeal,tree.meta.rngStateAfterTraversal);assert.equal(tree.complete,true);
  near(tree.summary.terminalProbabilityMass,1);
  const study=simulateTreeStudy({outcome:{mode:'legacy-deck'}},{deals:4,seed:441});
  const paired=simulateTreeStudy({outcome:{mode:'legacy-deck'}},{deals:4,seed:441,policy:'call'});
  assert.deepEqual(study.dealSeeds,paired.dealSeeds);assert.deepEqual(study.bossProfileIds,paired.bossProfileIds);
  assert.match(study.meta.bossSampling,/獨立新牌桌/);assert.equal(Object.values(study.byBoss).reduce((sum,item)=>sum+item.deals,0),4);
  near(Object.values(study.byBoss).reduce((sum,item)=>sum+(item.totals.winProbability||0),0),study.totals.winProbability);
  const migrated=simulateTreeStudy({outcome:{mode:'legacy-deck'},boss:{mode:'fixed',profileId:'sniper'}},{deals:2,seed:54});
  assert.equal(migrated.byBoss.caller.deals,2);
});
