import test from 'node:test';
import assert from 'node:assert/strict';
import {loadConfig,CONFIG_KEY} from '../src/shared.mjs';

test('saved legacy defaults adopt the calibrated ratio and remove obsolete pot fees without changing assets',()=>{
 const before=globalThis.localStorage;
 try{
  const values=new Map([['magic-poker-lite.config.v1',JSON.stringify({bigBlind:10,minBuyIn:200,buyIn:875.6,targetRtp:.97})]]);
  globalThis.localStorage={getItem:key=>values.get(key)??null};
  const loaded=loadConfig();
  assert.equal(loaded.minBuyIn,50);assert.equal(loaded.buyIn,875.6);assert.equal(loaded.targetRtp,1);
  assert.equal(values.size,1,'loading does not write storage');
  values.set('magic-poker-lite.config.v1',JSON.stringify({bigBlind:10,minBuyIn:350,buyIn:875.6}));
  assert.equal(loadConfig().minBuyIn,350,'custom legacy ratios stay intact');
  values.set(CONFIG_KEY,JSON.stringify({bigBlind:10,minBuyIn:200,buyIn:875.6}));
  assert.equal(loadConfig().minBuyIn,200,'explicit new settings are not migrated');
 }finally{if(before===undefined)delete globalThis.localStorage;else globalThis.localStorage=before;}
});

test('blocked or invalid saved settings fall back to calibrated defaults',()=>{
 const before=globalThis.localStorage;
 try{
  globalThis.localStorage={getItem:()=>{throw new Error('blocked');}};
  assert.equal(loadConfig().minBuyIn,50);
  globalThis.localStorage={getItem:()=>'{broken'};
  assert.equal(loadConfig().minBuyIn,50);
 }finally{if(before===undefined)delete globalThis.localStorage;else globalThis.localStorage=before;}
});
