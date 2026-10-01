import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_CONFIG} from '../src/engine.mjs';
import {betOptions,minimumAssets,tableConfig} from '../src/entry-model.mjs';
test('BET scales required assets, the sole big blind and all streets; the other seat auto-post stays zero',()=>{
 assert.deepEqual(betOptions(DEFAULT_CONFIG),[1,2,5,10,20,50]);
 assert.equal(minimumAssets(DEFAULT_CONFIG,50),1000);
 const c=tableConfig(DEFAULT_CONFIG,20,875.6);
 assert.equal(c.smallBlind,0);assert.equal(c.bigBlind,20);assert.equal(c.buyIn,875.6);
 assert.equal(tableConfig({...DEFAULT_CONFIG,smallBlind:5},20,875.6).smallBlind,0);
 assert.deepEqual(c.betSize,{preflop:20,flop:40,turn:80,river:80});
});
test('entry rejects insufficient assets instead of normalizing or topping up',()=>{
 assert.throws(()=>tableConfig(DEFAULT_CONFIG,50,999.99),/Not enough chips/);
 assert.throws(()=>tableConfig(DEFAULT_CONFIG,10,0),/Not enough chips/);
 assert.equal(tableConfig(DEFAULT_CONFIG,1,65).buyIn,65);
});
test('earned balance above old maximum is preserved on re-entry',()=>{
 const c=tableConfig(DEFAULT_CONFIG,10,3600.55);assert.equal(c.buyIn,3600.55);assert.equal(c.maxBuyIn,3600.55);
});
