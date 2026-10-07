import test from 'node:test';
import assert from 'node:assert/strict';
import {createOutcomePools} from '../src/outcome-pools.mjs';
import {createPoolStudySummary,collectPoolStudyAudit,finishPoolStudySummary,combinePoolStudySummaries} from '../src/probability-pools.mjs';
import {simulateStudy} from '../src/simulation-study.mjs';
import {simulateTreeStudy} from '../src/tree-study.mjs';
import {buildActionTree} from '../src/action-tree.mjs';
import {createSession,startHand,playAutomatedHand,syncOpponentBankroll,legalActions,applyAction} from '../src/engine.mjs';
import {renderStudyDetails,renderActionTree} from '../src/probability-report-view.mjs';

const near=(a,b,tolerance=1e-7)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} != ${b}`);
const fields=['paidActionBudgetUsed','paidActionAdded','specialAdded','specialAward'];
const config={boss:{mode:'fixed',profileId:'caller'},outcome:{mode:'prebuilt-pools',initialPaidActionPools:[100,20,30],initialSpecialPools:[0,4,5],initialPaidActionCooldown:2}};
function fakeTarget(id){const children=new Map();return {id,innerHTML:'',children,querySelector(selector){if(!children.has(selector))children.set(selector,{innerHTML:''});return children.get(selector);}};}

test('pool summaries retain full probability precision and reject missing or invalid audits',()=>{
  const pools=createOutcomePools({paidAction:[10,0,0],special:[20,0,0]});
  const summary=createPoolStudySummary(pools),weight=1/3;
  const audit={bucketIndex:0,before:{paidAction:10,special:20},after:{paidAction:8,special:19},paidActionBudgetUsed:3,paidActionAdded:1,specialAdded:2,specialAward:3};
  collectPoolStudyAudit(summary,audit,weight);finishPoolStudySummary(summary);
  assert.equal(summary.paidActionAdded,weight);near(summary.byBucket[0].paidActionEnd,10-2/3);
  near(summary.byBucket[0].specialEnd,20-1/3);near(summary.maxLedgerError,0);
  const combined=combinePoolStudySummaries([summary,summary],{unit:'deals'});
  assert.equal(combined.deals,2);near(combined.byBucket[0].paidActionStart,20);near(combined.specialAward,2);
  assert.deepEqual(pools.buckets[0],{paidAction:10,special:20});
  assert.throws(()=>createPoolStudySummary(null),/初始水池/);
  assert.throws(()=>collectPoolStudyAudit(summary,null),/稽核/);
  assert.throws(()=>collectPoolStudyAudit(summary,audit,-1),/權重/);
});

for(const mode of ['independent','continuous','cashout'])test(`default pooled ${mode} keeps each player's pools across hands and clusters its ratio uncertainty`,()=>{
  const options={mode,players:2,entries:3,maxHandsPerPlayer:3,targetAsset:1e6,seed:46021,policy:'call'};
  const report=simulateStudy(config,options);
  assert.equal(report.hands,6);assert.equal(report.outcomeModel,'prebuilt-pools');
  assert.match(report.modelVersion,/prebuilt-pools-v2-full-pot/);assert.equal(report.methodMeta.ciUnit,'player');assert.equal(report.methodMeta.ciSamples,2);
  assert.equal(report.outcomePoolSummary.players,2);assert.equal(report.outcomePoolSummary.hands,6);
  near(report.outcomePoolSummary.maxLedgerError,0,1e-6);
  for(const player of report.playerResults){
    const s=player.outcomePoolSummary;
    assert.equal(s.start.handSequence,0);assert.equal(s.end.handSequence,3);
    assert.equal(s.start.paidActionCooldown,2);assert.ok(s.end.paidActionCooldown>=0&&s.end.paidActionCooldown<=2);
    assert.deepEqual(s.start.buckets,[{paidAction:100,special:0},{paidAction:20,special:4},{paidAction:30,special:5}]);
    assert.equal(s.hands,3);near(s.specialAward,player.jackpotAwards);
    near(player.totalReturns,player.netReturns+player.jackpotAwards);
    for(const b of s.byBucket){near(b.paidActionStart+b.paidActionAdded-b.paidActionBudgetUsed,b.paidActionEnd,1e-6);near(b.specialStart+b.specialAdded-b.specialAward,b.specialEnd,1e-6);}
  }
  // Reproduce one player's sequence through the actual engine. Only stacks reset
  // in independent mode; neither its pools nor its cooldown get re-created.
  const p=report.playerResults[0],session=createSession(report.config,p.seed,{firstSmallBlind:mode==='independent'?'player':'random'});
  const totals=Object.fromEntries(fields.map(key=>[key,0]));
  for(let hand=0;hand<3;hand++){
    if(mode==='independent')session.stacks={player:report.config.buyIn,npc:report.config.buyIn};
    const result=playAutomatedHand(session,'call').result;
    for(const key of fields)totals[key]+=result.outcomePoolAudit[key];
    if(mode!=='independent')syncOpponentBankroll(session);
  }
  assert.deepEqual(p.outcomePoolSummary.end,session.outcomePools);
  for(const key of fields)near(p.outcomePoolSummary[key],totals[key]);
  const target=fakeTarget('study-reports');renderStudyDetails(report,null,target);
  assert.match(target.innerHTML,/三桶水池開始、累積與支出/);assert.match(target.innerHTML,/特殊池支出已包含在 JP/);
  assert.match(target.children.get('[data-player-results]').innerHTML,/handSequence/);
});

test('default prebuilt action tree follows stored targets and cards without new RNG, and weighted pool payouts equal JP',()=>{
  const funded={outcome:{mode:'prebuilt-pools',initialPaidActionPools:[200,0,0],initialSpecialPools:[200,0,0],specialUseChance:1}};
  const tree=buildActionTree(funded,{seed:46022,policy:'aggressive'});
  assert.equal(tree.mode,'prebuilt-outcome-full-action-tree');assert.equal(tree.meta.rngStateAfterDeal,tree.meta.rngStateAfterTraversal);
  const byId=new Map(tree.nodes.map(node=>[node.id,node]));
  for(const node of tree.nodes){
    assert.deepEqual(node.holes.player,tree.cards.player);assert.deepEqual(node.board,tree.cards.boardRunout.slice(0,node.board.length));
    assert.ok(node.outcomeNodeId);assert.ok(['win','nonWin'].includes(node.target));
  }
  near(tree.summary.outcomePoolSummary.hands,1);near(tree.summary.outcomePoolSummary.specialAward,tree.summary.weighted.jackpotAward);
  near(tree.summary.outcomePoolSummary.maxLedgerError,0,1e-6);
  const hand=startHand(createSession(funded,46022));let node=byId.get(tree.rootId);
  while(hand.status==='playing'){
    assert.deepEqual(node.holes,hand.holes);assert.deepEqual(node.outcomeDecision,hand.outcomeDecision);
    const action=legalActions(hand).find(a=>a.type==='raise'||a.type==='bet')||legalActions(hand).find(a=>a.type==='call'||a.type==='check');
    node=byId.get(node.edges.find(edge=>edge.type===action.type).childId);applyAction(hand,action.type);
  }
  assert.deepEqual(node.result,hand.result);
  const target=fakeTarget('tree-detail');renderActionTree(tree,target);
  assert.match(target.innerHTML,/預建目標與固定玩家／公牌布局/);assert.match(target.children.get('[data-tree-selected]').innerHTML,/預存目標/);
});

test('tree studies cold start configured pools for every sampled deal and expose contribution mean uncertainty',()=>{
  const report=simulateTreeStudy(config,{deals:2,seed:46023});
  assert.equal(report.meta.cardModel,'shared-engine-prebuilt-pools');assert.match(report.meta.poolSampling,/不是長期水池 RTP/);
  const summary=report.outcomePoolSummary;
  assert.equal(summary.deals,2);near(summary.hands,2);
  assert.deepEqual(summary.byBucket.map(b=>b.paidActionStart),[200,40,60]);
  assert.deepEqual(summary.byBucket.map(b=>b.specialStart),[0,8,10]);
  near(summary.specialAward,report.totals.jackpotAward);near(summary.maxLedgerError,0,1e-6);
  assert.ok(Number.isFinite(report.contributionStandardError));assert.ok(report.contributionCi95[0]<=report.weighted.totalContribution);
  assert.ok(report.contributionCi95[1]>=report.weighted.totalContribution);
});
