import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_CONFIG} from '../src/engine.mjs';
import {betOptions,minimumAssets,tableConfig} from '../src/entry-model.mjs';
import {renderBetPresets} from '../src/entry-view.mjs';
test('BET scales required assets, both blinds and all streets without charging entry assets',()=>{
 assert.deepEqual(betOptions(DEFAULT_CONFIG),[1,2,5,10,20,50]);
 assert.equal(minimumAssets(DEFAULT_CONFIG,50),1000);
 const c=tableConfig(DEFAULT_CONFIG,20,875.6);
 assert.equal(c.smallBlind,10);assert.equal(c.bigBlind,20);assert.equal(c.buyIn,875.6);
 assert.equal(tableConfig({...DEFAULT_CONFIG,smallBlind:0},20,875.6).smallBlind,10);
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

test('fractional preset text and its accessible label preserve the actual offered BET and derived blind',()=>{
 const base={...DEFAULT_CONFIG,bigBlind:.15};
 const options=betOptions(base);
 assert.ok(options.includes(.075));
 const preset=renderBetPresets(options).match(/<button[^>]*data-bet="0\.075"[^>]*>[\s\S]*?<\/button>/)?.[0];
 assert.ok(preset);
 assert.match(preset,/aria-label="Big blind 0\.075"/);
 assert.match(preset,/<strong>0\.075<\/strong>/);
 const c=tableConfig(base,.075,1000);
 assert.equal(c.bigBlind,.075);assert.equal(c.smallBlind,.0375);assert.equal(c.buyIn,1000);
});
