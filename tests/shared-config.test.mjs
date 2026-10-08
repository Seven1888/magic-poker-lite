import test from 'node:test';
import assert from 'node:assert/strict';
import {loadConfig,CONFIG_KEY} from '../src/shared.mjs';

test('saved settings adopt natural Holdem without importing outcome controls or changing saved assets',()=>{
 const before=globalThis.localStorage;
 try{
  const values=new Map([['magic-poker-lite.config.v1',JSON.stringify({bigBlind:10,minBuyIn:200,buyIn:875.6,targetRtp:.97,outcome:{mode:'prebuilt-pools',conversionRate:.98,initialPaidActionPools:[12,23,34]},boss:{mode:'legacy'},jackpotEnabled:true})]]);
  globalThis.localStorage={getItem:key=>values.get(key)??null};
  const loaded=loadConfig();
  assert.equal(loaded.minBuyIn,500);assert.equal(loaded.buyIn,875.6);assert.equal(loaded.targetRtp,1);
  assert.equal(loaded.outcome.mode,'natural-holdem');assert.equal(loaded.boss.mode,'random');
  assert.equal(loaded.jackpotEnabled,false);
  assert.deepEqual(loaded.outcome.initialPaidActionPools,[0,0,0]);
  assert.equal(values.size,1,'loading does not write storage');
  values.set('magic-poker-lite.config.v1',JSON.stringify({bigBlind:10,minBuyIn:350,buyIn:875.6}));
  assert.equal(loadConfig().minBuyIn,500,'formal entry minimum is 100 small blinds');
  values.set(CONFIG_KEY,JSON.stringify({bigBlind:10,minBuyIn:200,buyIn:875.6}));
  assert.equal(loadConfig().minBuyIn,500,'v2 settings use the same formal entry rule');
 }finally{if(before===undefined)delete globalThis.localStorage;else globalThis.localStorage=before;}
});

test('blocked or invalid saved settings fall back to natural Holdem defaults',()=>{
 const before=globalThis.localStorage;
 try{
  globalThis.localStorage={getItem:()=>{throw new Error('blocked');}};
  assert.equal(loadConfig().minBuyIn,500);assert.equal(loadConfig().outcome.mode,'natural-holdem');
  globalThis.localStorage={getItem:()=>'{broken'};
  assert.equal(loadConfig().minBuyIn,500);assert.equal(loadConfig().outcome.mode,'natural-holdem');
 }finally{if(before===undefined)delete globalThis.localStorage;else globalThis.localStorage=before;}
});

test('old manual card settings cannot turn a new natural table into a rigged deal',()=>{
 const before=globalThis.localStorage;
 try{
  const saved={outcome:{mode:'pooled-holdem'},deal:{player:{manual:['As','Ah'],rerollChance:1},npc:{manual:['Ks','Kh']}}};
  globalThis.localStorage={getItem:key=>key===CONFIG_KEY?JSON.stringify(saved):null};
  const loaded=loadConfig();
  assert.equal(loaded.outcome.mode,'natural-holdem');
  for(const seat of ['player','npc']){
   assert.deepEqual(loaded.deal[seat].manual,[]);
   assert.equal(loaded.deal[seat].rerollChance,0);assert.equal(loaded.deal[seat].maxRerolls,0);
  }
 }finally{if(before===undefined)delete globalThis.localStorage;else globalThis.localStorage=before;}
});
