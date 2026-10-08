import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSession, startHand, applyAction, legalActions, normalizeConfig, makeDeck, evaluateBest} from '../src/engine.mjs';
import {legalHoldemActions} from '../src/holdem-betting.mjs';
import {selectBossProfile} from '../src/boss-profiles.mjs';
import {initializePooledHoldem} from '../src/pooled-holdem.mjs';
import {createOutcomePools, migrateOutcomePoolsWithoutJackpot} from '../src/outcome-pools.mjs';
import {normalizePlayerProfile} from '../src/outcome-profile.mjs';
import {closeSavedTable, restoreTableSession} from '../src/table-wallet.mjs';
import {createEntryEncounter, previewNextEncounter} from '../src/entry-encounter.mjs';

const state = session => ({data:JSON.stringify(session),rng:session.rng.state()});
const quote = (hand,key) => legalHoldemActions(hand).find(action=>action.sizeKeys?.includes(key));

test('player 2x and 4x pay exactly the current pot multiple, with calls already inside the payment', () => {
  const hand = startHand(createSession({},0));
  assert.equal(hand.pot,15); assert.equal(quote(hand,'2x').amount,30); assert.equal(quote(hand,'4x').amount,60);
  assert.deepEqual(legalActions(hand).filter(action=>action.sizeKey).map(action=>action.sizeKey),['2x','4x','allin']);
  for (const [pot,paid,currentBet,lastFullRaise,stack] of [
    [100,0,0,10,1000], [125,25,50,25,1000], [150,100,125,25,1000], [10,0,0,50,1000], [100,25,50,25,120]
  ]) {
    const draft = {...hand,pot,currentBet,lastFullRaise,actedSinceFullRaise:[],streetBets:{player:paid,npc:currentBet},stacks:{player:stack,npc:1000}};
    for (const [key,multiple] of [['2x',2],['4x',4]]) {
      const action=quote(draft,key), minimumPayment=currentBet+lastFullRaise-paid;
      assert.equal(action.amount,Math.min(stack,Math.max(minimumPayment,pot*multiple)));
      assert.equal(action.to,paid+action.amount);
    }
  }
});

test('NPC sizes retain half-pot, full-pot and all-in after a 2x player raise', () => {
  const hand=startHand(createSession({},0)); applyAction(hand,quote(hand,'2x'));
  assert.equal(hand.actor,'npc');
  const sizes=legalActions(hand).filter(action=>action.sizeKey);
  assert.deepEqual(sizes.map(action=>action.sizeKey),['half','pot','allin']);
  assert.equal(sizes[0].amount,60); assert.equal(sizes[1].amount,95);
});

test('each random BOSS encounter consumes one independent 50/50 draw and permits repetition', () => {
  for (const previous of [null,'caller','maniac']) for (const roll of [0,.499999,.5,.999999]) {
    let calls=0;
    const result=selectBossProfile(()=>{calls++;return roll;},previous);
    assert.equal(calls,1); assert.equal(result.selection.probability,.5);
    assert.equal(result.profile.id,roll<.5?'caller':'maniac');
    assert.deepEqual(result.selection.eligibleIds,['caller','maniac']);
  }
  assert.equal(normalizeConfig({boss:{mode:'rotate'}}).boss.mode,'random');
});

test('entry and next previews match random encounters without consuming live RNG; only the entry blind is drawn', () => {
  const session=createSession({},13,{firstSmallBlind:'random',lastBossProfileId:'caller'});
  const entry=createEntryEncounter(session.config,13,{lastBossProfileId:'caller'});
  let hand=startHand(session); assert.deepEqual(hand.bossProfile,entry.bossProfile);
  const blindDraw=structuredClone(session.blindDraw); let repeats=0;
  for(let turn=0;turn<20;turn++) {
    applyAction(hand,legalActions(hand).some(action=>action.type==='fold')?'fold':'check');
    if(hand.status!=='settled') applyAction(hand,'fold');
    const before=state(session), preview=previewNextEncounter(session), old=hand;
    assert.deepEqual(state(session),before);
    hand=startHand(session);
    assert.deepEqual(hand.bossProfile,preview.bossProfile);
    assert.notEqual(hand.smallBlind,old.smallBlind); assert.deepEqual(session.blindDraw,blindDraw);
    assert.equal(hand.bossSelection.probability,.5); repeats+=hand.bossProfile.id===old.bossProfile.id?1:0;
  }
  assert.ok(repeats>0);
});

test('JP configuration cannot reopen production payouts and pool migration preserves every unit exactly once', () => {
  const pools=createOutcomePools({paidAction:[1.123456,2,3],special:[4,5.654321,6],paidActionCooldown:7,qualificationSequence:8,handSequence:9});
  const before=structuredClone(pools),migrated=migrateOutcomePoolsWithoutJackpot(pools);
  assert.deepEqual(pools,before); assert.deepEqual(migrated.buckets,[{paidAction:5.123456,special:0},{paidAction:7.654321,special:0},{paidAction:9,special:0}]);
  assert.equal(migrated.paidActionCooldown,7); assert.equal(migrated.handSequence,9); assert.equal(migrated.qualificationSequence,8);
  assert.deepEqual(migrateOutcomePoolsWithoutJackpot(migrated),migrated);
  const config=normalizeConfig({jackpotEnabled:true,outcome:{mode:'pooled-holdem',paidActionBudgetShare:0,specialUseChance:1,initialSpecialPools:[2000,5000,10000]}});
  assert.equal(config.jackpotEnabled,false); assert.equal(config.outcome.paidActionBudgetShare,1); assert.equal(config.outcome.specialUseChance,0);
  assert.deepEqual(config.outcome.initialPaidActionPools,[2000,5000,10000]); assert.deepEqual(config.outcome.initialSpecialPools,[0,0,0]);
  assert.deepEqual(createSession(config,0,{outcomePools:pools}).outcomePools,migrated);
});

test('natural royal flushes are no longer removed from a pooled layout without a JP qualification', () => {
  const hand=startHand(createSession({outcome:{mode:'pooled-holdem'}},0));
  hand.rng=()=>0;
  const player=['As','Ks'],npc=['2c','3c'],board=['Qs','Js','Ts','9d','8h'];
  const used=new Set([...player,...npc,...board]);
  initializePooledHoldem(hand,{dealHoles:()=>({holes:{player,npc},deck:[...board,...makeDeck().filter(card=>!used.has(card))]})});
  assert.equal(hand.outcomeDecision.qualification,null);
  assert.equal(evaluateBest([...hand.pooledHoldem.layout.player,...hand.pooledHoldem.layout.board]).royal,true);
});

for (const stage of ['reserved','settled','allin','allin-call']) test(`a v57 ${stage} table closes under its old contract before pools migrate`, () => {
  const {profile,expected}=JSON.parse(readFileSync(new URL(`./fixtures/v57-jackpot-${stage}.json`,import.meta.url)));
  const original=structuredClone(profile),loaded=normalizePlayerProfile(profile);
  assert.deepEqual(loaded,profile,'loading an active or settled snapshot does not alter its old pool transaction');
  const closed=closeSavedTable(loaded);
  assert.equal(closed.balance,expected.balance); assert.equal(closed.table,null);
  assert.deepEqual(closed.outcomePools,migrateOutcomePoolsWithoutJackpot(expected.outcomePools));
  if(stage==='allin-call') {
    assert.equal(closed.balance,12500); assert.equal(closed.outcomePools.lastSettlement.audit.specialAward,2000);
    assert.deepEqual(closed.outcomePools.buckets,[{paidAction:490.05,special:0},{paidAction:3,special:0},{paidAction:4,special:0}]);
  }
  assert.deepEqual(closeSavedTable(closed),closed); assert.deepEqual(normalizePlayerProfile(closed),closed);
  assert.deepEqual(profile,original);
});

test('an API-restored old settled session also adopts no-JP accounting before its next new hand', () => {
  const {profile}=JSON.parse(readFileSync(new URL('./fixtures/v57-jackpot-settled.json',import.meta.url)));
  const session=restoreTableSession(profile.table), oldResult=structuredClone(session.activeHand.result);
  const expected=migrateOutcomePoolsWithoutJackpot(session.outcomePools),hand=startHand(session);
  assert.equal(hand.config.jackpotEnabled,false);assert.equal(hand.config.outcome.paidActionBudgetShare,1);
  assert.equal(hand.config.outcome.specialUseChance,0);assert.deepEqual(hand.outcomePoolsBefore,expected);
  assert.equal(hand.outcomeDecision.qualification,null);assert.deepEqual(profile.table.hand.result,oldResult);
});
