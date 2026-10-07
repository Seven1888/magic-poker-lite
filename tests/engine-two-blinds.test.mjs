import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_CONFIG,normalizeConfig,createSession,startHand,legalActions,applyAction,simulate} from './legacy-engine.mjs';

const other = seat => seat === 'player' ? 'npc' : 'player';
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function rejectsEntryUnchanged(session) {
  const before=JSON.stringify(session),state=session.rng.state(),hand=session.activeHand;
  assert.throws(()=>startHand(session),{code:'INSUFFICIENT_HAND_ASSETS'});
  assert.equal(JSON.stringify(session),before);
  assert.equal(session.rng.state(),state);
  assert.equal(session.handNumber,0);
  assert.equal(session.activeHand,hand);
}

test('legacy small-blind settings derive half of BET without changing entry assets or the deal RNG', () => {
  assert.equal(DEFAULT_CONFIG.smallBlind,5);
  for(const bigBlind of [.02,.03,1,10,25]) for(const smallBlind of [undefined,0,5,10,100,-1]) {
    assert.equal(normalizeConfig({smallBlind,bigBlind}).smallBlind,bigBlind/2);
  }
  const old=createSession({buyIn:1000,smallBlind:0},42),current=createSession({buyIn:1000},42);
  assert.deepEqual(old.stacks,{player:1000,npc:1000});
  assert.equal(JSON.stringify(startHand(old)),JSON.stringify(startHand(current)));
  assert.equal(old.rng.state(),current.rng.state());
});

test('either small blind loses its posted half-BET on folding; only the unmatched big-blind half is refunded', () => {
  for(const firstSmallBlind of ['player','npc']) {
    const session=createSession({buyIn:1000},20,{firstSmallBlind}),hand=startHand(session),bb=other(firstSmallBlind);
    assert.equal(hand.pot,15); assert.equal(hand.contributions[firstSmallBlind],5);
    assert.equal(hand.stacks[firstSmallBlind],995); assert.equal(hand.stacks[bb],990);
    assert.deepEqual(hand.history.map(event=>event.type),['smallBlind','bigBlind']);
    applyAction(hand,'fold');
    assert.equal(hand.result[bb].refund,5); assert.equal(hand.result[bb].matchedWager,5);
    assert.equal(hand.result[firstSmallBlind].profit,-5);
    assert.equal(hand.result.pot,10); assert.equal(hand.result.fee,0); assert.equal(hand.result.net,10);
    assert.equal(hand.result.jackpot,null);
    assert.equal(session.stacks[firstSmallBlind],995); assert.equal(session.stacks[bb],1005);
    near(session.stacks.player+session.stacks.npc+session.fees,2000);
  }
});

test('a small-blind raise pays fifteen once to reach twenty; opponent fold refunds ten and awards the matched pot', () => {
  const session=createSession({buyIn:1000},102),hand=startHand(session);
  const raise=legalActions(hand).find(action=>action.type==='raise');
  assert.equal(raise.amount,15); assert.equal(raise.to,20);
  applyAction(hand,'raise'); assert.equal(hand.pot,30); assert.equal(hand.stacks.player,980);
  applyAction(hand,'fold'); const r=hand.result;
  assert.equal(r.player.totalContribution,20); assert.equal(r.player.refund,10);
  assert.equal(r.player.matchedWager,10); assert.equal(r.npc.matchedWager,10);
  assert.equal(r.pot,20); assert.equal(r.fee,0); assert.equal(r.player.netReturn,20);
  assert.deepEqual(session.stacks,{player:1010,npc:990});
  near(session.stacks.player+session.stacks.npc+session.fees,2000);
});

test('a seven-chip big blind cannot start below the hand minimum or post a partial blind', () => {
  for(const bb of ['player','npc']) {
    const session=createSession({minBuyIn:50,buyIn:1000,jackpotEnabled:false},33,{firstSmallBlind:other(bb)});
    session.stacks[bb]=7;
    rejectsEntryUnchanged(session);
    assert.equal(session.stacks[bb],7); assert.equal(session.stacks[other(bb)],1000);
  }
});

test('a big blind holding at most half a BET is rejected without forcing a runout', () => {
  for(const bb of ['player','npc']) for(const chips of [.01,3,5]) {
    const session=createSession({minBuyIn:50,buyIn:1000,jackpotEnabled:false},33,{firstSmallBlind:other(bb)});
    session.stacks[bb]=chips;
    rejectsEntryUnchanged(session);
    near(session.stacks.player+session.stacks.npc,1000+chips);
  }
});

test('a small blind below one BET cannot bypass the entry minimum through a partial post', () => {
  for(const sb of ['player','npc']) for(const chips of [.01,3,5,7]) {
    const session=createSession({minBuyIn:50,buyIn:1000,jackpotEnabled:false},33,{firstSmallBlind:sb});
    session.stacks[sb]=chips;
    rejectsEntryUnchanged(session);
    near(session.stacks.player+session.stacks.npc,1000+chips);
  }
});

test('two stacks below the blind amounts reject atomically without posting either blind', () => {
  for(const sb of ['player','npc']) for(const [smallChips,bigChips] of [[3,4],[7,3],[.01,.02]]) {
    const bb=other(sb),session=createSession({minBuyIn:50,jackpotEnabled:false},33,{firstSmallBlind:sb});
    session.stacks[sb]=smallChips; session.stacks[bb]=bigChips;
    rejectsEntryUnchanged(session);
    near(session.stacks.player+session.stacks.npc,smallChips+bigChips);
  }
});

test('a seat admitted at the minimum may raise all-in later, with matched calls or unmatched refunds', () => {
  for(const sb of ['player','npc']) for(const response of ['call','fold']) {
    const bb=other(sb),session=createSession({minBuyIn:50,buyIn:1000,jackpotEnabled:false},33,{firstSmallBlind:sb});
    session.stacks[sb]=50;
    const hand=startHand(session);
    applyAction(hand,'call'); applyAction(hand,'check');
    applyAction(hand,'bet');
    const raise=legalActions(hand).find(action=>action.type==='raise');
    assert.equal(raise.amount,40); assert.equal(raise.allIn,true);
    applyAction(hand,'allin');
    assert.equal(hand.stacks[sb],0);
    assert.deepEqual(legalActions(hand).map(action=>action.type),['fold','call']);
    assert.equal(legalActions(hand).find(action=>action.type==='call').amount,20);
    applyAction(hand,response);
    assert.equal(hand.status,'settled');
    assert.equal(hand.result.reason,response==='call'?'showdown':'fold');
    assert.equal(hand.board.length,response==='call'?5:3);
    assert.equal(hand.result[sb].refund,response==='call'?0:20);
    assert.equal(hand.result[sb].matchedWager,response==='call'?50:30);
    assert.equal(hand.result.pot,response==='call'?100:60);
    near(hand.stacks.player+hand.stacks.npc+hand.result.fee,1050);
  }
});

test('fractional BET keeps its exact half-blind, call and refund amounts without rounding to cents', () => {
  for(const sb of ['player','npc']) {
    const session=createSession({outcome:{mode:'legacy-deck'},targetRtp:.96,buyIn:1000,bigBlind:.03,smallBlind:0,jackpotEnabled:false},42,{firstSmallBlind:sb});
    const hand=startHand(session),bb=other(sb);
    assert.equal(hand.config.smallBlind,.015); assert.equal(hand.pot,.045);
    assert.equal(hand.contributions[sb],.015); assert.equal(hand.contributions[bb],.03);
    assert.equal(legalActions(hand).find(action=>action.type==='call').amount,.015);
    applyAction(hand,'fold');
    assert.equal(hand.result[sb].profit,-.015); assert.equal(hand.result[bb].refund,.015);
    assert.equal(hand.result.pot,.03); assert.equal(hand.result.fee,.0012);
    near(hand.stacks.player+hand.stacks.npc+hand.result.fee,2000);
  }
});

test('opening folds produce matched half-blind wagers and preserve simulated refunds, fees and RTP denominator', () => {
  const result=simulate({outcome:{mode:'legacy-deck'},targetRtp:.96,boss:{mode:'legacy'},jackpotEnabled:false,npc:{fold:1,call:0,raise:0,check:1,bet:0,strengthInfluence:0,priceInfluence:0}},
    {hands:100,seed:20260930,policy:'balanced'});
  assert.equal(result.ruleSet,'heads-up-two-blinds-v1');
  assert.equal(result.wagers,500); assert.equal(result.fees,40); assert.equal(result.netReturns,480);
  assert.equal(result.refunds,250); assert.equal(result.folds,50); assert.equal(result.npcFolds,50);
  near(result.baseRtp,.96); assert.ok(result.ci95.every(Number.isFinite)); assert.equal(result.conservationError,0);
});
