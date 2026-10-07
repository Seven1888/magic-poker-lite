import test from 'node:test';
import assert from 'node:assert/strict';
import {BOSS_PROFILE_BY_ID, getBossResponsePressure, getBossProfileDistribution, getBossProbabilityScenarios} from '../src/boss-profiles.mjs';
import {createSession, startHand, legalActions, applyAction, cloneHand, previewResponse, getActionDistribution, sampleDistribution} from '../src/engine.mjs';
import {legalHoldemActions} from '../src/holdem-betting.mjs';
import {actionResponsePreview} from '../src/action-options-view.mjs';
import {snapshotTableSession} from '../src/table-wallet.mjs';

const expected = {
  maniac: {strong: [[5,25,70],[10,40,50],[20,80,0]], weak: [[45,55,0],[55,45,0],[70,30,0]]},
  caller: {strong: [[5,65,30],[10,70,20],[15,85,0]], weak: [[25,75,0],[40,60,0],[55,45,0]]}
};
const near = (actual, value) => assert.ok(Math.abs(actual-value) < 1e-10, `${actual} != ${value}`);
const grouped = distribution => distribution.reduce((result, action) => {
  result[action.type] = (result[action.type] || 0) + action.probability; return result;
}, {fold:0,call:0,raise:0});
const open = (profileId = 'maniac', band = 'strong', {mode = 'pooled-holdem', chips = 500, seed = 0} = {}) => {
  const session = createSession({smallBlind:5,outcome:{mode},boss:{mode:'fixed',profileId}},seed,{firstSmallBlind:'player'});
  session.stacks = {player:chips,npc:chips};
  const hand = startHand(session);
  // Hold the chosen policy fixture constant even when pooled outcome pairs switch.
  hand.bossStreetStrength = Object.freeze({street:hand.street,band});
  return hand;
};
const action = (hand, size) => {
  const quote = legalActions(hand).find(row => row.sizeKeys?.includes(size));
  assert.ok(quote, `missing size ${size}`); return quote;
};

test('all approved price rows are exact, immutable, normalized and publicly numeric', () => {
  for (const [id,bands] of Object.entries(expected)) for (const [band,rows] of Object.entries(bands)) {
    const hand = open(id,band), scenarios = getBossProbabilityScenarios(hand);
    for (const [index,key] of ['half','pot','large'].entries()) {
      const weights = BOSS_PROFILE_BY_ID[id].pressureWeights[key][band];
      assert.deepEqual(Object.values(weights),rows[index]); assert.ok(Object.isFrozen(weights));
      assert.equal(Object.values(weights).reduce((sum,value)=>sum+value,0),100);
      const current = scenarios.byPressure[key], [fold,call,raise] = rows[index];
      assert.deepEqual(current.facing,{fold:fold/100,call:call/100,raise:raise/100});
      near(current.noRaise.fold,fold/(fold+call)); near(current.noRaise.call,call/(fold+call));
    }
    assert.doesNotMatch(JSON.stringify(scenarios),/strong|weak|band|reasons|cards|category/);
  }
});

test('all selected-size previews use the approved row and match the committed response without changing the live hand', () => {
  for (const mode of ['fixed-holdem','pooled-holdem']) for (const [id,bands] of Object.entries(expected)) {
    for (const [band,rows] of Object.entries(bands)) {
      const hand = open(id,band,{mode}), before = snapshotTableSession(hand.session), locked = hand.bossStreetStrength;
      for (const [index,key] of (mode === 'pooled-holdem' ? ['2x','4x','allin'] : ['half','pot','allin']).entries()) {
        const quote = action(hand,key), preview = previewResponse(hand,quote), visual = actionResponsePreview(hand,quote);
        const actual = grouped(preview.distribution), [fold,call,raise] = rows[mode === 'pooled-holdem' ? 2 : index];
        near(actual.fold,fold/100); near(actual.call,call/100); near(actual.raise,raise/100);
        const draft = cloneHand(hand); applyAction(draft,quote);
        assert.deepEqual(getActionDistribution(draft),preview.distribution);
        assert.deepEqual(visual.outcomes.map(row=>[row.type,row.probability]),Object.entries(actual).filter(([,p])=>p>0));
        assert.deepEqual(draft.bossStreetStrength,locked);
        assert.deepEqual(snapshotTableSession(hand.session),before);
        assert.equal(hand.bossStreetStrength,locked);
      }
    }
  }
});

test('repeated raises classify the new unpaid increment against the call-completed pot', () => {
  const hand = open('maniac','strong',{mode:'fixed-holdem'}), locked = hand.bossStreetStrength;
  applyAction(hand,action(hand,'pot'));
  assert.deepEqual(getBossResponsePressure(hand),{key:'pot',callAmount:20,basePot:20});
  applyAction(hand,action(hand,'half'));
  assert.equal(hand.actor,'player'); assert.equal(hand.currentBet,60); assert.equal(hand.pot,90);
  for (const [key,owed,base] of [['half',60,120],['pot',120,120]]) {
    const draft = cloneHand(hand), quote = action(draft,key);
    applyAction(draft,quote);
    assert.deepEqual(getBossResponsePressure(draft),{key,callAmount:owed,basePot:base});
    assert.deepEqual(draft.bossStreetStrength,locked);
    const row = getBossProbabilityScenarios(draft).byPressure[key].facing;
    for (const [type,value] of Object.entries(grouped(getActionDistribution(draft)))) near(value,row[type]);
  }
});

test('short all-ins use half or pot pressure and normalize only their selected fold/call row', () => {
  for (const [chips,key,fold,call] of [[15,'half',5,25],[20,'half',5,25],[25,'pot',10,40],[30,'pot',10,40]]) {
    const hand = open('maniac','strong',{chips}), quotes = legalActions(hand).filter(row=>row.sizeKeys);
    const allIn = action(hand,'allin'), preview = previewResponse(hand,allIn), actual = grouped(preview.distribution);
    near(actual.fold,fold/(fold+call)); near(actual.call,call/(fold+call)); assert.equal(actual.raise,0);
    const draft = cloneHand(hand); applyAction(draft,allIn);
    assert.equal(getBossResponsePressure(draft).key,key);
    assert.deepEqual(getActionDistribution(draft),preview.distribution);
    for (const sizeKey of allIn.sizeKeys) assert.deepEqual(previewResponse(hand,{type:'raise',sizeKey}),preview);
    assert.equal(new Set(quotes.map(row=>row.amount)).size,quotes.length);
  }
});

test('equal minimum-adjusted quotes use the same pot-pressure row even when labelled half pot', () => {
  const hand = open('maniac','strong',{mode:'fixed-holdem'});
  Object.assign(hand,{street:'flop',pot:10,currentBet:0,streetBets:{player:0,npc:0},lastFullRaise:10,
    actedSinceFullRaise:[],bossStreetStrength:{street:'flop',band:'strong'}});
  const merged = action(hand,'half'); assert.deepEqual(merged.sizeKeys,['half','pot']);
  assert.equal(merged.amount,10);
  const half = previewResponse(hand,{type:'bet',sizeKey:'half'}), pot = previewResponse(hand,{type:'bet',sizeKey:'pot'});
  assert.deepEqual(half,pot);
  const actual = grouped(half.distribution); near(actual.fold,.10); near(actual.call,.40); near(actual.raise,.50);
});

test('six-decimal quote rounding cannot push a legal half-pot or pot quote over its threshold', () => {
  for (const priorPot of [10.000001,10.000003,10.333333,10.999999]) {
    const hand = {status:'playing',actor:'player',config:{bigBlind:.000001,outcome:{mode:'fixed-holdem'}},
      pot:priorPot,currentBet:0,streetBets:{player:0,npc:0},stacks:{player:100,npc:100},lastFullRaise:.000001};
    for (const sizeKey of ['half','pot']) {
      const chosen = legalHoldemActions(hand).find(row=>row.sizeKeys?.includes(sizeKey));
      const after = {...hand,pot:Math.round((priorPot+chosen.amount)*1e6)/1e6,currentBet:chosen.to,
        streetBets:{player:chosen.to,npc:0}};
      assert.equal(getBossResponsePressure(after).key,sizeKey);
    }
  }
});

test('pressure uses callable chips, treats zero pots explicitly, and never reads cards or RNG', () => {
  const hand = {config:{outcome:{mode:'pooled-holdem'}},pot:210,currentBet:200,streetBets:{npc:0},stacks:{npc:5}};
  for (const key of ['holes','board','rng','history']) Object.defineProperty(hand,key,{get(){throw Error(`unexpected ${key}`);}});
  assert.deepEqual(getBossResponsePressure(hand),{key:'half',callAmount:5,basePot:10});
  hand.stacks.npc=20; assert.equal(getBossResponsePressure(hand).key,'large');
  hand.pot=0; hand.currentBet=0; assert.equal(getBossResponsePressure(hand).key,'half');
  hand.pot=10; hand.currentBet=10; assert.equal(getBossResponsePressure(hand).key,'large');
});

test('free checks use the baseline row and price changes never reclassify the locked hand', () => {
  const hand = open(); applyAction(hand,'call');
  assert.equal(hand.actor,'npc');
  const locked = hand.bossStreetStrength;
  const actual = getActionDistribution(hand), groupedFree = Object.fromEntries(['check','raise'].map(type=>
    [type,actual.filter(row=>row.type===type).reduce((sum,row)=>sum+row.probability,0)]));
  near(groupedFree.check,.30); near(groupedFree.raise,.70);
  for (const key of ['holes','board','rng','history']) Object.defineProperty(hand,key,{get(){throw Error(`unexpected ${key}`);}});
  getBossProfileDistribution(hand,legalActions(hand)); assert.equal(hand.bossStreetStrength,locked);
});

test('full-pot aggression keeps the separate 50/35/15 sizing draw and sampling never adds a price draw', () => {
  const hand = open('maniac','strong',{mode:'fixed-holdem'}); applyAction(hand,action(hand,'pot'));
  const distribution = getActionDistribution(hand), aggressive = distribution.filter(row=>row.type==='raise');
  for (const [index,weight] of [.5,.35,.15].entries()) near(aggressive[index].probability,.5*weight);
  for (const [roll,sizeRoll,key] of [[.6,.1,'half'],[.6,.6,'pot'],[.6,.9,'allin']]) {
    let draws=0; const result=sampleDistribution(distribution,()=>[roll,sizeRoll][draws++]);
    assert.equal(draws,2); assert.ok(result.sizeKeys.includes(key));
  }
  let draws=0; assert.equal(sampleDistribution(distribution,()=>{draws++;return .05;}).type,'fold');
  assert.equal(draws,1);
});
