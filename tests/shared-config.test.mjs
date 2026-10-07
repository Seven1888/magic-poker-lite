import test from 'node:test';
import assert from 'node:assert/strict';
import {loadConfig,CONFIG_KEY} from '../src/shared.mjs';

test('saved settings adopt pooled Holdem and 100 small blinds while preserving saved parameters and assets',()=>{
 const before=globalThis.localStorage;
 try{
  const values=new Map([['magic-poker-lite.config.v1',JSON.stringify({bigBlind:10,minBuyIn:200,buyIn:875.6,targetRtp:.97,outcome:{mode:'prebuilt-pools',conversionRate:.98,initialPaidActionPools:[12,23,34]},boss:{mode:'legacy'},jackpotEnabled:true})]]);
  globalThis.localStorage={getItem:key=>values.get(key)??null};
  const loaded=loadConfig();
  assert.equal(loaded.minBuyIn,500);assert.equal(loaded.buyIn,875.6);assert.equal(loaded.targetRtp,1);
  assert.equal(loaded.outcome.mode,'pooled-holdem');assert.equal(loaded.boss.mode,'random');
  assert.equal(loaded.outcome.conversionRate,.98);assert.equal(loaded.jackpotEnabled,false);
  assert.deepEqual(loaded.outcome.initialPaidActionPools,[12,23,34]);
  assert.equal(values.size,1,'loading does not write storage');
  values.set('magic-poker-lite.config.v1',JSON.stringify({bigBlind:10,minBuyIn:350,buyIn:875.6}));
  assert.equal(loadConfig().minBuyIn,500,'formal entry minimum is 100 small blinds');
  values.set(CONFIG_KEY,JSON.stringify({bigBlind:10,minBuyIn:200,buyIn:875.6}));
  assert.equal(loadConfig().minBuyIn,500,'v2 settings use the same formal entry rule');
 }finally{if(before===undefined)delete globalThis.localStorage;else globalThis.localStorage=before;}
});

test('blocked or invalid saved settings fall back to pooled Holdem defaults',()=>{
 const before=globalThis.localStorage;
 try{
  globalThis.localStorage={getItem:()=>{throw new Error('blocked');}};
  assert.equal(loadConfig().minBuyIn,500);assert.equal(loadConfig().outcome.mode,'pooled-holdem');
  globalThis.localStorage={getItem:()=>'{broken'};
  assert.equal(loadConfig().minBuyIn,500);assert.equal(loadConfig().outcome.mode,'pooled-holdem');
 }finally{if(before===undefined)delete globalThis.localStorage;else globalThis.localStorage=before;}
});
