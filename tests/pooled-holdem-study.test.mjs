import test from 'node:test';
import assert from 'node:assert/strict';
import {currentLabConfig} from '../src/probability-config.mjs';
import {simulateStudy, studyPlayerSeed} from '../src/simulation-study.mjs';
import {simulateRefundStudy} from '../src/refund-study.mjs';
import {buildActionTree} from '../src/action-tree.mjs';
import {simulateTreeStudy} from '../src/tree-study.mjs';
import {createSession, startHand, playAutomatedHand, legalActions, applyAction, beginNewTable} from '../src/engine.mjs';
import {createPoolStudySummary, collectPoolStudyAudit, finishPoolStudySummary} from '../src/probability-pools.mjs';
import {renderStudyDetails, renderActionTree} from '../src/probability-report-view.mjs';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
const config={smallBlind:5,outcome:{mode:'pooled-holdem'}};
function target(id){const children=new Map();return {id,innerHTML:'',children,querySelector(selector){if(!children.has(selector))children.set(selector,{innerHTML:''});return children.get(selector);}};}

test('工具匯入遷移至正式雙池德州，保留 RTP、池額、CD、JP 與指定牌',()=>{
  for(const mode of ['legacy-deck','prebuilt-pools','fixed-holdem','pooled-holdem']){
    const source={smallBlind:20,bigBlind:40,buyIn:10000,targetRtp:.96,jackpotEnabled:true,
      boss:{mode:'legacy',profileId:'sniper'},deal:{player:{manual:['As','Kd']}},
      outcome:{mode,conversionRate:.97,initialPaidActionPools:[1,2,3],initialSpecialPools:[4,5,6],initialPaidActionCooldown:3}};
    const before=structuredClone(source),migrated=currentLabConfig(source);
    assert.deepEqual(source,before);
    assert.equal(migrated.outcome.mode,'pooled-holdem');assert.equal(migrated.targetRtp,1);
    assert.equal(migrated.smallBlind,20);assert.equal(migrated.bigBlind,40);assert.equal(migrated.buyIn,2000);
    assert.equal(migrated.jackpotEnabled,true);assert.equal(migrated.outcome.conversionRate,.97);
    assert.deepEqual(migrated.outcome.initialPaidActionPools,[1,2,3]);assert.deepEqual(migrated.outcome.initialSpecialPools,[4,5,6]);
    assert.equal(migrated.outcome.initialPaidActionCooldown,3);assert.equal(migrated.boss.mode,'rotate');assert.equal(migrated.boss.profileId,'caller');
    assert.deepEqual(migrated.deal.player.manual,['As','Kd']);assert.equal(migrated.deal.player.rerollChance,0);
  }
});

test('雙池德州一般研究保留桌籌碼和跨手池，可用共用引擎完整重播',()=>{
  const options={mode:'continuous',unlimitedBankroll:true,players:2,entries:12,seed:53001,policy:'aggressive'};
  const report=simulateStudy(config,options);
  assert.equal(report.outcomeModel,'pooled-holdem');assert.match(report.modelVersion,/pooled-holdem-v1/);
  assert.equal(report.hands,24);assert.equal(report.outcomePoolSummary.bucketPolicy,'blind-ranges');
  assert.equal(report.methodMeta.blindMode,'alternating');assert.equal(report.methodMeta.ciUnit,'player');
  for(const row of report.playerResults){
    const session=createSession(report.config,studyPlayerSeed(options.seed,row.playerIndex),{firstSmallBlind:'random'});
    const pools=createPoolStudySummary(session.outcomePools,{bucketPolicy:'blind-ranges'});
    session.stacks={player:0,npc:0};let entries=0,wagers=0,returns=0;
    for(let index=0;index<options.entries;index++){
      if(session.stacks.player<=0){
        if(entries>0)beginNewTable(session,{buyIn:500});else session.stacks={player:500,npc:500};
        entries++;
      }
      const before=session.stacks.player,hand=playAutomatedHand(session,options.policy),r=hand.result;
      assert.equal(r.npc.stackBefore,before);assert.ok(r.player.totalContribution<=before+1e-6);
      collectPoolStudyAudit(pools,r.outcomePoolAudit);wagers+=r.player.matchedWager;returns+=r.player.totalReturn;
    }
    finishPoolStudySummary(pools,session.outcomePools);
    assert.deepEqual(row.outcomePoolSummary,pools);assert.equal(row.tableEntries,entries);
    near(row.wagers,wagers);near(row.totalReturns,returns);near(row.tableClosingChips,session.stacks.player);
    near(row.profit,row.tableClosingChips-row.tableBuyIns);
  }
  near(report.outcomePoolSummary.specialAward,report.jackpotAwards);near(report.outcomePoolSummary.maxLedgerError,0);
  assert.ok(report.actionSizeStats.length>0);assert.ok(report.bossStrengthStats.length>0);
  const view=target('study-reports');renderStudyDetails(report,null,view);
  assert.match(view.innerHTML,/三桶水池開始、累積與支出/);assert.match(view.innerHTML,/BOSS 逐街鎖定分類/);
  assert.match(view.innerHTML,/下注與加注尺寸/);assert.match(view.innerHTML,/0 &lt; 大盲 ≤ 10/);
  assert.doesNotMatch(view.innerHTML,/固定牌序德州|每街各牌力列等權平均|下注不更換手牌/);
});

test('雙池德州退幣保留未帶入錢包，資金與池帳均可重播核對',()=>{
  const options={players:1,initialAsset:1000,targetAsset:1500,seed:53003,policy:'aggressive'};
  const report=simulateRefundStudy(config,options),row=report.playerResults[0];
  assert.equal(report.assetModel,'external-wallet-plus-table-chips');assert.equal(report.tableBuyIn,500);
  const session=createSession(report.config,row.seed,{firstSmallBlind:'random'});
  const pools=createPoolStudySummary(session.outcomePools,{bucketPolicy:'blind-ranges'});
  session.stacks={player:0,npc:0};let wallet=1000,hands=0,entries=0;
  while(wallet+session.stacks.player<1500){
    assert.ok(hands<1000);
    if(session.stacks.player<=0){
      if(wallet<500)break;wallet-=500;
      if(entries>0)beginNewTable(session,{buyIn:500});else session.stacks={player:500,npc:500};
      entries++;
    }
    const hand=playAutomatedHand(session,'aggressive');collectPoolStudyAudit(pools,hand.result.outcomePoolAudit);hands++;
  }
  finishPoolStudySummary(pools,session.outcomePools);
  assert.equal(row.tableEntries,entries);assert.equal(row.hands,hands);assert.equal(row.wallet,wallet);
  near(row.end,wallet+session.stacks.player);near(row.end,row.start+row.totalReturns-row.matchedWagers);
  assert.deepEqual(row.outcomePoolSummary,pools);
});

test('新水池研究以大盲區間分桶，SB 20 與 SB 2000 不落錯桶',()=>{
  for(const [smallBlind,bucketIndex] of [[20,1],[2000,2]]){
    const report=simulateStudy({...config,smallBlind},{mode:'continuous',unlimitedBankroll:true,entries:1,policy:'call',seed:53004});
    const summary=report.outcomePoolSummary;
    assert.equal(report.config.bigBlind,smallBlind*2);
    assert.deepEqual(summary.byBucket.map(bucket=>bucket.hands),[0,1,2].map(index=>Number(index===bucketIndex)));
    assert.equal(summary.baseUnit,'big-blind');assert.equal(summary.byBucket[2].range.maximumInclusive,null);
  }
});

test('離線雙池德州樹清楚標記逐路徑抽樣，保留尺寸、機率質量與池帳',()=>{
  const source={...config,buyIn:40};
  const tree=buildActionTree(source,{seed:53002}),byId=new Map(tree.nodes.map(node=>[node.id,node]));
  assert.equal(tree.mode,'sampled-outcome-full-action-tree');assert.equal(tree.meta.cardModel,'shared-engine-pooled-holdem');
  assert.equal(tree.meta.outcomeRng,'sampled-on-isolated-branches');assert.equal(tree.meta.outcomeRngEnumerated,false);
  assert.match(tree.meta.expectation,/未窮舉 outcome RNG/);
  near(tree.summary.terminalProbabilityMass,1);near(tree.summary.outcomePoolSummary.hands,1);
  near(tree.summary.weighted.jackpotAward,tree.summary.outcomePoolSummary.specialAward);
  assert.equal(tree.meta.rngStateAfterDeal,tree.meta.rngStateAfterTraversal);
  const hand=startHand(createSession(source,53002));let node=byId.get(tree.rootId);
  while(hand.status==='playing'){
    const actions=legalActions(hand),action=node.parentId===null?actions.find(item=>item.sizeKey==='pot'):actions.find(item=>item.type==='check'||item.type==='call');
    const edge=node.edges.find(item=>item.id===action.id);applyAction(hand,action);node=byId.get(edge.childId);
  }
  assert.deepEqual(node.result,hand.result);
  const view=target('tree-detail');renderActionTree(tree,view);assert.match(view.innerHTML,/逐路徑結果取樣/);
  assert.match(view.innerHTML,/取樣路徑終端/);assert.match(view.innerHTML,/未精確枚舉全部結果抽籤/);
  const study=simulateTreeStudy(source,{deals:2,seed:53002});
  assert.match(study.meta.sampling,/sampled-outcome/);assert.equal(study.outcomePoolSummary.bucketPolicy,'blind-ranges');
  assert.equal(study.meta.outcomeRngEnumerated,false);assert.match(study.meta.uncertainty,/取樣結果後的動作加權估計/);
  near(study.outcomePoolSummary.specialAward,study.totals.jackpotAward);
});
