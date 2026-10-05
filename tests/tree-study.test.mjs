import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateTreeStudy} from '../src/tree-study.mjs';
import {buildActionTree} from '../src/action-tree.mjs';
import {createRng,createSession,startHand} from '../src/engine.mjs';

const near=(actual,expected,tolerance=1e-8)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);
const natural={rerollMode:'unpaired',rerollChance:0,maxRerolls:0,manual:[]};
const config={boss:{mode:'legacy'},deal:{player:natural,npc:natural}};

test('tree study preserves probability and accounting mass, with deal-based denominators and progress',()=>{
  const progress=[],result=simulateTreeStudy(config,{deals:13,seed:210,policy:'aggressive',onProgress:value=>progress.push(value)});
  assert.equal(result.kind,'tree-study');assert.equal(result.complete,true);
  assert.deepEqual(progress.map(value=>value.completed),[10,13]);
  assert.equal(result.totalNodes,13*1312);assert.equal(result.totalTerminals,13*750);
  near(result.averageTerminalProbabilityMass,1);near(result.maxMassError,0);near(result.maxConservationError,0,1e-6);
  const w=result.weighted;
  near(w.winProbability+w.tieProbability+w.lossProbability,1);
  near(w.showdownProbability+w.playerFoldProbability+w.npcFoldProbability,1);
  near(w.totalContribution-w.refund,w.matchedWager);
  near(w.baseReturn+w.jackpotAward,w.totalReturn);near(w.totalReturn-w.matchedWager,w.profit);
  near(w.playerClosingStack+w.npcClosingStack+w.systemFee,2*result.config.buyIn+w.jackpotAward,1e-6);
  near(result.baseRtp,result.totals.baseReturn/result.totals.matchedWager);
  near(result.totalRtp,result.totals.totalReturn/result.totals.matchedWager);
  near(w.showdownConditionalWinProbability,w.showdownWinProbability/w.showdownProbability);
  const decisions=result.byStreet.reduce((sum,row)=>sum+row.weightedVisits,0);
  assert.ok(decisions>13&&decisions<result.totalDecisionNodes,'visits count reachable actions, not all structural nodes');
  for(const street of ['preflop','flop','turn','river'])for(const actor of ['player','npc']){
    const rows=result.byStreet.filter(row=>row.street===street&&row.actor===actor);
    near(rows.reduce((sum,row)=>sum+(row.conditionalActionProbability||0),0),1);
  }
});

test('seed schedule is independent of policy and reruns reproduce exactly, including paired card deals',()=>{
  const first=simulateTreeStudy(config,{deals:4,seed:'paired-card-study',policy:'call'});
  const other=simulateTreeStudy(config,{deals:4,seed:'paired-card-study',policy:'tight'});
  assert.deepEqual(other.dealSeeds,first.dealSeeds);
  const rng=createRng('paired-card-study');
  assert.deepEqual(first.dealSeeds,Array.from({length:4},()=>Math.floor(rng()*0x100000000)));
  for(let index=0;index<first.deals;index++){
    const firstSmallBlind=index%2===0?'player':'npc';
    const a=buildActionTree(config,{seed:first.dealSeeds[index],firstSmallBlind,policy:'call'});
    const b=buildActionTree(config,{seed:other.dealSeeds[index],firstSmallBlind,policy:'tight'});
    assert.deepEqual(a.cards,b.cards);
  }
  assert.deepEqual(simulateTreeStudy(config,{deals:4,seed:'paired-card-study',policy:'call'}),first);
});

test('confidence intervals use per-deal integrated samples, and one deal has no uncertainty estimate',()=>{
  const single=simulateTreeStudy(config,{deals:1,seed:931});
  assert.deepEqual(single.winCi95,[null,null]);assert.deepEqual(single.baseCi95,[null,null]);assert.deepEqual(single.totalCi95,[null,null]);
  assert.equal(single.winStandardError,null);
  const result=simulateTreeStudy(config,{deals:6,seed:931});
  const values=result.dealSeeds.map((seed,index)=>buildActionTree(config,{seed,firstSmallBlind:index%2?'npc':'player'}).summary.weighted);
  const mean=values.reduce((sum,value)=>sum+value.winProbability,0)/6;
  const se=Math.sqrt(values.reduce((sum,value)=>sum+(value.winProbability-mean)**2,0)/5/6);
  near(result.winStandardError,se);near(result.winCi95[0],Math.max(0,mean-1.96*se));
  const residual=values.reduce((sum,value)=>sum+(value.totalReturn-result.totalRtp*value.matchedWager)**2,0);
  const totalSe=Math.sqrt(6/5*residual)/values.reduce((sum,value)=>sum+value.matchedWager,0);
  near(result.totalStandardError,totalSe);near(result.totalCi95[1],result.totalRtp+1.96*totalSe);
  assert.throws(()=>simulateTreeStudy(config,{deals:0}),/1 至 10,000/);
  assert.throws(()=>simulateTreeStudy(config,{deals:10001}),/1 至 10,000/);
  assert.throws(()=>simulateTreeStudy(config,{deals:1.5}),/1 至 10,000/);
});

test('Monte Carlo draws through tree branches agree with the full weighted integration',()=>{
  const result=simulateTreeStudy(config,{deals:4,seed:113,policy:'aggressive'});
  const rng=createRng('tree-branch-comparison'),runsPerDeal=20000;
  let wins=0,wager=0,returns=0;
  for(let index=0;index<result.deals;index++){
    const tree=buildActionTree(config,{seed:result.dealSeeds[index],firstSmallBlind:index%2?'npc':'player',policy:'aggressive'});
    const byId=new Map(tree.nodes.map(node=>[node.id,node]));
    for(let run=0;run<runsPerDeal;run++){
      let node=byId.get(tree.rootId);
      while(!node.terminal){
        const roll=rng();let cumulative=0;
        const edge=node.edges.find(item=>(cumulative+=item.probability)>roll)||node.edges.at(-1);
        node=byId.get(edge.childId);
      }
      wins+=Number(node.result.winner==='player');wager+=node.result.player.matchedWager;returns+=node.result.player.totalReturn;
    }
  }
  near(wins/(result.deals*runsPerDeal),result.weighted.winProbability,.008);
  near(returns/wager,result.totalRtp,.025);
});

test('tier probabilities and zero-weight paths use conditional masses, not jackpot leaf counts',()=>{
  const small={minBuyIn:10,maxBuyIn:20,buyIn:20,deal:{player:{manual:['As','Ah']},npc:{manual:['Ks','Kh']}}};
  let seed=1,chosen;
  // Find a repeatable quads deal using exactly the study's seed derivation.
  for(;seed<5000;seed++){
    const dealSeed=Math.floor(createRng(seed)()*0x100000000);
    const hand=startHand(createSession(small,dealSeed));
    if(hand.deck.slice(0,5).filter(card=>card[0]==='A').length===2){chosen=seed;break;}
  }
  assert.ok(chosen);
  const report=simulateTreeStudy(small,{deals:1,seed:chosen,policy:'call'});
  const tree=buildActionTree(small,{seed:report.dealSeeds[0],policy:'call'});
  const probability=tree.nodes.filter(node=>node.terminal&&node.result.jackpot?.tier==='quads').reduce((sum,node)=>sum+node.reachProbability,0);
  near(report.tierProbabilities.quads,probability);near(report.weighted.jackpotAward,probability*200);
  assert.ok(report.zeroProbabilityEdges>0);
  assert.equal(report.tierProbabilities.royal,0);assert.equal(report.tierProbabilities.straightFlush,0);
});
