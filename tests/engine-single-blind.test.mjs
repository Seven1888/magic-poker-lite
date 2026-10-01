import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_CONFIG,normalizeConfig,createSession,startHand,legalActions,applyAction,simulate} from '../src/engine.mjs';

const other = seat => seat === 'player' ? 'npc' : 'player';
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);

test('legacy small-blind settings normalize to zero without changing entry assets or the deal RNG', () => {
  assert.equal(DEFAULT_CONFIG.smallBlind,0);
  for(const smallBlind of [undefined,5,10,100,-1]) assert.equal(normalizeConfig({smallBlind}).smallBlind,0);
  const old=createSession({smallBlind:5},42),current=createSession({smallBlind:0},42);
  assert.deepEqual(old.stacks,{player:1000,npc:1000});
  assert.equal(JSON.stringify(startHand(old)),JSON.stringify(startHand(current)));
  assert.equal(old.rng.state(),current.rng.state());
});

test('either unposted seat can fold for free and the sole big blind is returned with zero fee', () => {
  for(const firstSmallBlind of ['player','npc']) {
    const session=createSession({},20,{firstSmallBlind}),hand=startHand(session),bb=other(firstSmallBlind);
    assert.equal(hand.pot,10); assert.equal(hand.contributions[firstSmallBlind],0);
    assert.equal(hand.stacks[firstSmallBlind],1000); assert.equal(hand.stacks[bb],990);
    assert.equal(hand.history.length,1); assert.equal(hand.history[0].type,'bigBlind');
    applyAction(hand,'fold');
    assert.equal(hand.result[bb].refund,10); assert.equal(hand.result[bb].matchedWager,0);
    assert.equal(hand.result.pot,0); assert.equal(hand.result.fee,0); assert.equal(hand.result.net,0);
    assert.equal(hand.result.jackpot,null); assert.deepEqual(session.stacks,{player:1000,npc:1000});
  }
});

test('a first-seat raise pays twenty once; opponent fold refunds ten and awards the matched pot', () => {
  const session=createSession({},102),hand=startHand(session);
  const raise=legalActions(hand).find(action=>action.type==='raise');
  assert.equal(raise.amount,20); assert.equal(raise.to,20);
  applyAction(hand,'raise'); assert.equal(hand.pot,30); assert.equal(hand.stacks.player,980);
  applyAction(hand,'fold'); const r=hand.result;
  assert.equal(r.player.totalContribution,20); assert.equal(r.player.refund,10);
  assert.equal(r.player.matchedWager,10); assert.equal(r.npc.matchedWager,10);
  assert.equal(r.pot,20); assert.equal(r.fee,.8); assert.equal(r.player.netReturn,19.2);
  assert.deepEqual(session.stacks,{player:1009.2,npc:990});
  near(session.stacks.player+session.stacks.npc+session.fees,2000);
});

test('a short big blind still waits for the unposted opponent to fold or call before running out', () => {
  for(const bb of ['player','npc']) {
    const session=createSession({jackpotEnabled:false},33,{firstSmallBlind:other(bb)});
    session.stacks[bb]=3;
    const hand=startHand(session);
    assert.equal(hand.status,'playing'); assert.equal(hand.board.length,0); assert.equal(hand.actor,other(bb));
    assert.deepEqual(legalActions(hand).map(a=>a.type),['fold','call']);
    assert.equal(legalActions(hand).find(a=>a.type==='call').amount,3);
    applyAction(hand,'call');
    assert.equal(hand.status,'settled'); assert.equal(hand.board.length,5); assert.equal(hand.result.pot,6);
    assert.equal(hand.result.player.refund,0); assert.equal(hand.result.npc.refund,0);
    near(hand.stacks.player+hand.stacks.npc+hand.result.fee,1003);
  }
});

test('all opening folds create no effective wagers, no fees and no fabricated RTP interval', () => {
  const result=simulate({jackpotEnabled:false,npc:{fold:1,call:0,raise:0,check:1,bet:0,strengthInfluence:0,priceInfluence:0}},
    {hands:100,seed:20260930,policy:'balanced'});
  assert.equal(result.ruleSet,'single-big-blind-v1');
  assert.equal(result.wagers,0); assert.equal(result.fees,0); assert.equal(result.netReturns,0);
  assert.equal(result.refunds,500); assert.equal(result.folds,50); assert.equal(result.npcFolds,50);
  assert.deepEqual(result.ci95,[null,null]); assert.equal(result.conservationError,0);
});
