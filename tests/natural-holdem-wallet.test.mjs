import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSession, startHand, applyAction, getActionDistribution, sampleDistribution} from '../src/engine.mjs';
import {snapshotTableSession, restoreTableSession, closeSavedTable} from '../src/table-wallet.mjs';
import {normalizePlayerProfile, savePlayerProfile, loadPlayerProfile} from '../src/outcome-profile.mjs';
import {createOutcomePools} from '../src/outcome-pools.mjs';

const create = seed => createSession({smallBlind:1, outcome:{mode:'natural-holdem'}},seed,
  {firstSmallBlind:'player',outcomePools:createOutcomePools({paidAction:[11,22,33],paidActionCooldown:4})});
const record = session => ({version:2,balance:9900,outcomePools:session.outcomePools,
  table:snapshotTableSession(session),lastBossProfileId:session.lastBossProfileId});

test('natural saved table preserves locked cards, rules and next BOSS draw across JSON restore',()=>{
 for(let seed=0;seed<12;seed++){
  const session=create(seed),hand=startHand(session);
  applyAction(hand,'raise:2x');
  const saved=JSON.parse(JSON.stringify(record(session))),restored=restoreTableSession(saved.table);
  assert.deepEqual(snapshotTableSession(restored),snapshotTableSession(session));
  assert.ok(Object.isFrozen(restored.activeHand.rulesSnapshot));
  const action=sampleDistribution(getActionDistribution(hand),session.rng);
  const replay=sampleDistribution(getActionDistribution(restored.activeHand),restored.rng);
  assert.deepEqual(replay,action);
  applyAction(hand,action);applyAction(restored.activeHand,replay);
  assert.deepEqual(snapshotTableSession(restored),snapshotTableSession(session));
  assert.deepEqual(restored.outcomePools,saved.outcomePools,'historical pools remain archived');
 }
});

test('closing a natural table pays only real chips once and preserves archived pools',()=>{
 const session=create(9);startHand(session);
 const saved=record(session),before=structuredClone(saved),closed=closeSavedTable(saved);
 assert.equal(closed.balance,9999);assert.equal(closed.table,null);
 assert.deepEqual(closed.outcomePools,saved.outcomePools);
 assert.equal(closeSavedTable(closed),closed);assert.deepEqual(saved,before);
 const map=new Map(),storage={setItem:(key,value)=>map.set(key,value),getItem:key=>map.get(key)};
 assert.equal(savePlayerProfile(closed,storage),true);
 assert.deepEqual(loadPlayerProfile(storage),normalizePlayerProfile(closed));
});

test('invalid locked cards or rules refuse restored settlement without modifying the saved wallet',()=>{
 for(const change of [
  hand=>{hand.holes.player[0]=hand.holes.npc[0];},
  hand=>{hand.deck.reverse();},
  hand=>{hand.rulesSnapshot.id='unsupported-rules';}
 ]){
  const session=create(3);startHand(session);
  const saved=record(session);change(saved.table.hand);const before=structuredClone(saved);
  assert.throws(()=>closeSavedTable(saved));assert.deepEqual(saved,before);
 }
});

const legacyFixtures=JSON.parse(readFileSync(new URL('./fixtures/v59-natural-migration.json',import.meta.url),'utf8'));
for(const {scenario,profile,expected} of legacyFixtures.fixtures) test(`v59 ${scenario} table pays exactly its published contract before natural entry`,()=>{
 const saved=structuredClone(profile),loaded=normalizePlayerProfile(saved);
 assert.deepEqual(loaded,saved);
 const closed=closeSavedTable(loaded);
 assert.deepEqual(closed,expected,`reference produced by ${legacyFixtures.revision}`);
 assert.deepEqual(saved,profile);assert.equal(closeSavedTable(closed),closed);
 const next=createSession({smallBlind:1,outcome:{mode:'natural-holdem'}},42,{outcomePools:closed.outcomePools});
 const hand=startHand(next);applyAction(hand,'fold');
 assert.deepEqual(next.outcomePools,closed.outcomePools,'new play never spends or creates archived pool credit');
});
