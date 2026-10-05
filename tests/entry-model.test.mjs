import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_CONFIG,createSession,startHand,normalizeConfig} from '../src/engine.mjs';
import {betOptions,minimumAssets,tableConfig} from '../src/entry-model.mjs';
import {renderBetPresets,updateBetSelection} from '../src/entry-view.mjs';
test('new demo sessions start at 10,000 without changing the deal or overriding configured assets',()=>{
 const session=createSession({},42),reference=createSession({buyIn:1000},42);
 assert.deepEqual(session.stacks,{player:10000,npc:10000});
 assert.equal(normalizeConfig({buyIn:875.6,maxBuyIn:2000}).buyIn,875.6);
 const hand=startHand(session),original=startHand(reference);
 assert.deepEqual(hand.holes,original.holes);assert.equal(session.rng.state(),reference.rng.state());
 assert.equal(hand.pot,15);assert.deepEqual(hand.stacks,{player:9995,npc:9990});
 assert.equal(tableConfig(DEFAULT_CONFIG,1,10000).buyIn,10000);
});
test('BET scales required assets, both blinds and all streets without charging entry assets',()=>{
 assert.equal(minimumAssets(DEFAULT_CONFIG,50),250);
 const c=tableConfig(DEFAULT_CONFIG,20,875.6);
 assert.equal(c.smallBlind,10);assert.equal(c.bigBlind,20);assert.equal(c.buyIn,875.6);
 assert.equal(tableConfig({...DEFAULT_CONFIG,smallBlind:0},20,875.6).smallBlind,10);
 assert.deepEqual(c.betSize,{preflop:20,flop:40,turn:80,river:80});
});
test('entry rejects insufficient assets instead of normalizing or topping up',()=>{
 assert.throws(()=>tableConfig(DEFAULT_CONFIG,50,249.999999),/Not enough chips/);
 assert.equal(tableConfig(DEFAULT_CONFIG,50,250).buyIn,250);
 assert.throws(()=>tableConfig(DEFAULT_CONFIG,10,0),/Not enough chips/);
 assert.equal(tableConfig(DEFAULT_CONFIG,1,65).buyIn,65);
});
test('earned balance above the configured maximum is preserved on re-entry',()=>{
 const c=tableConfig(DEFAULT_CONFIG,10,13600.55);assert.equal(c.buyIn,13600.55);assert.equal(c.maxBuyIn,13600.55);
});

test('the +/- picker uses the Hands Up fixed BET ladder independently of probability settings',()=>{
 const expected=[1,2,5,10,20,50,100,200,500,800,1000,1200,1500,1800,2000];
 for(const config of [DEFAULT_CONFIG,{...DEFAULT_CONFIG,bigBlind:.15},{...DEFAULT_CONFIG,bigBlind:2000},undefined]){
  const options=betOptions(config);
  assert.deepEqual(options,expected);
  assert.equal(renderBetPresets(options),'');
 }
 const changedOptions=betOptions(DEFAULT_CONFIG);
 changedOptions[0]=.02;
 assert.deepEqual(betOptions(DEFAULT_CONFIG),expected,'callers cannot mutate subsequent picker options');
});
test('the shared entry calculations preserve fractional BET settings outside the fixed UI ladder',()=>{
 const base={...DEFAULT_CONFIG,bigBlind:.15};
 const input={value:''};
 updateBetSelection(.075,{querySelector:()=>input,querySelectorAll:()=>[]});
 assert.equal(input.value,'0.075');
 const c=tableConfig(base,.075,1000);
 assert.equal(c.bigBlind,.075);assert.equal(c.smallBlind,.0375);assert.equal(c.buyIn,1000);
});
