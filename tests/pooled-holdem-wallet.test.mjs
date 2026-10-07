import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession,startHand,applyAction,legalActions,getActionDistribution,sampleDistribution} from '../src/engine.mjs';
import {snapshotTableSession,restoreTableSession,buyInFromWallet,cashOutToWallet} from '../src/table-wallet.mjs';
import {normalizePlayerProfile} from '../src/outcome-profile.mjs';
import {outcomeBlindBucketIndex,outcomeBetBucketIndex,OUTCOME_BET_BUCKETS} from '../src/outcome-pools.mjs';
import {tableConfig,betOptions} from '../src/entry-model.mjs';

const config={outcome:{mode:'pooled-holdem'},smallBlind:10,boss:{mode:'rotate'}};
const serial=session=>JSON.parse(JSON.stringify(snapshotTableSession(session)));

test('new BB range buckets preserve every legacy stake and accept every new small blind',()=>{
 for(const [index,bucket] of OUTCOME_BET_BUCKETS.entries())for(const value of bucket){assert.equal(outcomeBlindBucketIndex(value),index);assert.equal(outcomeBetBucketIndex(value),index);}
 for(const [value,index] of [[.02,0],[4,0],[10,0],[10.01,1],[40,1],[500,1],[500.01,2],[4000,2]])assert.equal(outcomeBlindBucketIndex(value),index);
 for(const bad of [0,-1,Infinity,NaN,'10'])assert.throws(()=>outcomeBlindBucketIndex(bad));
 assert.throws(()=>outcomeBetBucketIndex(4));
 for(const smallBlind of betOptions(config)){
  const c=tableConfig(config,smallBlind,1000000),s=createSession(c,7),h=startHand(s);
  assert.equal(c.buyIn,smallBlind*100);assert.equal(c.bigBlind,smallBlind*2);
  assert.equal(h.outcomeDecision.poolBranch.bucketIndex,outcomeBlindBucketIndex(c.bigBlind));
 }
});

test('pooled active snapshot resumes the same selected cards, next draw and pool transaction',()=>{
 for(let seed=0;seed<12;seed++){
  const s=createSession(config,seed),h=startHand(s);applyAction(h,legalActions(h).find(a=>a.type==='raise'));
  const record=normalizePlayerProfile({version:2,balance:9000,outcomePools:s.outcomePools,table:serial(s)});
  const restored=restoreTableSession(record.table),copy=restored.activeHand;
  assert.deepEqual(serial(restored),serial(s));
  assert.equal(copy.stacks,restored.stacks);assert.equal(copy.rng,restored.rng);
  const chosen=sampleDistribution(getActionDistribution(h),s.rng);
  const replay=sampleDistribution(getActionDistribution(copy),restored.rng);
  assert.deepEqual(replay,chosen);applyAction(h,chosen);applyAction(copy,replay);
  assert.deepEqual(serial(restored),serial(s));
 }
});

test('pooled saved settlement cannot repay pot or spend pools again on reload',()=>{
 const entry=buyInFromWallet(10000,10),s=createSession(config,30),h=startHand(s);
 applyAction(h,legalActions(h).find(a=>a.sizeKeys?.includes('allin')));applyAction(h,'call');
 const restored=restoreTableSession(serial(s)),before=serial(restored),pools=JSON.stringify(restored.outcomePools);
 assert.equal(restored.activeHand.status,'settled');assert.throws(()=>applyAction(restored.activeHand,'call'));
 assert.deepEqual(serial(restored),before);assert.equal(JSON.stringify(restored.outcomePools),pools);
 assert.equal(cashOutToWallet(entry.balance,restored.stacks.player),cashOutToWallet(entry.balance,s.stacks.player));
});
