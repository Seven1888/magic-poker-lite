import {createSession,startHand,cloneHand,legalActions,applyAction,getActionDistribution} from './engine.mjs?v=55';
import {BOSS_PROFILE_VERSION} from './boss-profiles.mjs?v=55';
import {createPoolStudySummary, collectPoolStudyAudit, finishPoolStudySummary} from './probability-pools.mjs?v=55';

const POLICIES = ['balanced','call','aggressive','tight'];
const MEASURES = [
  'winProbability','tieProbability','lossProbability','matchedWager','totalContribution','refund',
  'grossReturn','baseReturn','jackpotAward','totalReturn','baseProfit','profit','playerFee','systemFee',
  'playerClosingStack','npcClosingStack'
];
const emptyExpected = () => Object.fromEntries(MEASURES.map(key => [key,0]));
const addExpected = (total,value,weight) => {
  for (const key of MEASURES) total[key] += value[key] * weight;
};
function terminalExpected(result) {
  const p = result.player;
  return {
    winProbability:Number(result.winner==='player'),tieProbability:Number(result.winner==='tie'),
    lossProbability:Number(result.winner==='npc'),matchedWager:p.matchedWager,totalContribution:p.totalContribution,
    refund:p.refund,grossReturn:p.gross,baseReturn:p.netReturn,jackpotAward:p.jackpotAward,totalReturn:p.totalReturn,
    baseProfit:p.baseProfit,profit:p.profit,playerFee:p.fee,systemFee:result.fee,
    playerClosingStack:p.stackAfter,npcClosingStack:result.npc.stackAfter
  };
}

/**
 * Inspect every legal action of the shared engine's hand. Historical prebuilt
 * pools read stored targets without new RNG. Compact pooled holdem samples its
 * paid outcomes on isolated branch RNGs; it does not enumerate outcome draws.
 * Every expected value is conditional on reaching its node, then following the
 * selected player policy and the existing NPC policy. Zero-probability edges
 * remain in the structural tree. This is not enumeration of every card deal.
 */
export function buildActionTree(config = {}, {
  seed=123,firstSmallBlind='player',policy='balanced',stateLimit=100000
} = {}) {
  if (!['player','npc'].includes(firstSmallBlind)) throw new RangeError('完整樹分析須指定玩家或對手為小盲。');
  if (!POLICIES.includes(policy)) throw new RangeError('未知的完整樹玩家策略。');
  if (!Number.isSafeInteger(stateLimit)||stateLimit<1) throw new RangeError('完整樹節點上限須為正整數。');
  const session=createSession(config,seed,{firstSmallBlind}),rootHand=startHand(session);
  const compactPooled=session.config.outcome?.mode==='pooled-holdem';
  const prebuilt=session.config.outcome?.mode==='prebuilt-pools';
  const pooled=prebuilt||compactPooled;
  const fixedHoldem=session.config.outcome?.mode==='fixed-holdem';
  if(prebuilt&&!rootHand._outcomeTree?.nodes?.length)throw new Error('預建結果研究缺少開局結果樹。');
  const storedNodes=new Map((rootHand._outcomeTree?.nodes||[]).map(node=>[node.id,node]));
  const initialRngState=rootHand.rng.state();
  const nodes=[];
  const summary={nodes:0,decisionNodes:0,terminalNodes:0,maxDepth:0,
    decisionsByStreet:{preflop:0,flop:0,turn:0,river:0},zeroProbabilityEdges:0,
    terminalProbabilityMass:0,conservationError:0,weighted:emptyExpected(),
    outcomePoolSummary:pooled?createPoolStudySummary(rootHand.outcomePoolsBefore||session.outcomePools,{bucketPolicy:compactPooled?'blind-ranges':'exact-stakes'}):null};
  function visit(hand,parentId,path,reachProbability) {
    if (nodes.length>=stateLimit) throw new RangeError(`完整行動樹超過 ${stateLimit} 個節點；未產生截斷結果，請提高上限。`);
    if (!compactPooled&&hand.rng.state()!==initialRngState) throw new Error('完整樹展開意外消耗牌局亂數。');
    const stored=storedNodes.get(hand._outcomeNodeId);
    const node={id:`n${nodes.length}`,parentId,depth:path.length,path,actor:hand.actor,street:hand.street,
      outcomeNodeId:hand._outcomeNodeId??null,target:stored?.target??hand.outcomeDecision?.target??null,
      outcomeDecision:hand.outcomeDecision?structuredClone(hand.outcomeDecision):null,
      holes:{player:[...hand.holes.player],npc:[...hand.holes.npc]},
      reachProbability,board:[...hand.board],stacks:{...hand.stacks},pot:hand.pot,
      contributions:{...hand.contributions},streetBets:{...hand.streetBets},currentBet:hand.currentBet,
      raises:hand.raises,pending:[...hand.pending],terminal:hand.status==='settled',edges:[],expected:emptyExpected()};
    nodes.push(node);summary.maxDepth=Math.max(summary.maxDepth,node.depth);
    if (node.terminal) {
      node.result=hand.result;
      node.expected=terminalExpected(hand.result);
      summary.terminalNodes++;
      summary.terminalProbabilityMass+=reachProbability;
      if(pooled)collectPoolStudyAudit(summary.outcomePoolSummary,hand.result.outcomePoolAudit,reachProbability);
      const r=hand.result;
      summary.conservationError=Math.max(summary.conservationError,
        Math.abs(r.player.stackAfter+r.npc.stackAfter+r.fee-r.player.stackBefore-r.npc.stackBefore-r.player.jackpotAward));
      return node;
    }
    summary.decisionNodes++;
    summary.decisionsByStreet[hand.street]++;
    const actions=legalActions(hand),distribution=getActionDistribution(hand,hand.actor,hand.actor==='player'?policy:'balanced');
    // NL permits several amounts for the same action type. Matching only `type`
    // collapses those branches and silently assigns the last size's probability.
    const actionKey=action=>action.id??`${action.type}:${action.to}:${action.amount}`;
    const probabilities=new Map(distribution.map(action=>[actionKey(action),action.probability]));
    if (!actions.length||distribution.length!==actions.length
      ||distribution.some(action=>!Number.isFinite(action.probability)||action.probability<0)
      ||Math.abs(distribution.reduce((sum,action)=>sum+action.probability,0)-1)>1e-9) {
      throw new Error('完整樹節點的合法動作或機率不完整。');
    }
    for (const action of actions) {
      const probability=probabilities.get(actionKey(action));
      if (!Number.isFinite(probability)) throw new Error('完整樹合法動作缺少對應機率。');
      if (probability===0) summary.zeroProbabilityEdges++;
      const step={actor:hand.actor,street:hand.street,...action};
      const childHand=cloneHand(hand);
      applyAction(childHand,action);
      const child=visit(childHand,node.id,[...path,step],reachProbability*probability);
      node.edges.push({...action,probability,childId:child.id});
      addExpected(node.expected,child.expected,probability);
    }
    return node;
  }
  const root=visit(rootHand,null,[],1);
  if (rootHand.rng.state()!==initialRngState) throw new Error('完整樹分析不得改變原始牌局亂數。');
  if (Math.abs(summary.terminalProbabilityMass-1)>1e-8) throw new Error('完整樹終端機率質量不守恆。');
  summary.nodes=nodes.length;summary.weighted={...root.expected};
  if(pooled)finishPoolStudySummary(summary.outcomePoolSummary);
  const byId=new Map(nodes.map(node=>[node.id,node]));
  return {
    version:3,mode:compactPooled?'sampled-outcome-full-action-tree':pooled?'prebuilt-outcome-full-action-tree':'fixed-deal-full-action-tree',complete:true,
    meta:{modelVersion:`${compactPooled?'pooled-holdem-v1':fixedHoldem?'fixed-holdem-v1':pooled?'prebuilt-pools-v2-full-pot':'legacy-deck-v1'}+${BOSS_PROFILE_VERSION}+action-tree-v3`,cardModel:compactPooled?'shared-engine-pooled-holdem':fixedHoldem?'shared-engine-fixed-holdem':pooled?'shared-engine-prebuilt-pools':'shared-engine-fixed-deck',
      bossProfileVersion:BOSS_PROFILE_VERSION,scope:compactPooled?'one-layout-all-legal-actions-with-sampled-outcomes':pooled?'one-prebuilt-layout-all-stored-actions':'one-fixed-deck-all-legal-actions',
      description:compactPooled?'固定玩家底牌、公牌序與對手候選暗牌，逐一展開全部合法下注路徑；每條分支在隔離 RNG 上取樣付費目標。這是結果取樣樹，不是事先預建全部結果，也不是精確枚舉每次結果抽籤。':fixedHoldem?'固定本手雙方底牌與公牌序，依共用德州引擎展開全部合法下注尺寸及再加注；每條分支依真實最佳牌型結算。':pooled?'開局已預建全部目標與合法操作分支；玩家底牌及公牌布局固定，BOSS 暗牌由各節點預存目標決定。分析僅讀已建分支，不抽新目標或新牌。':'歷史牌庫模式：發牌後固定牌序，展開雙方所有合法動作；不是枚舉全部發牌組合。',
      policyInformation:'玩家策略只使用自己的底牌、已揭公共牌及下注狀態；對手依該街鎖定強弱與 BOSS 類型的機率表；legacy 模式才使用原權重模型。',
      expectation:compactPooled?'依沿途動作機率加權已取樣的分支結果；只完整積分合法動作，未窮舉 outcome RNG，不能解讀為全部結果的精確條件期望。':'每節點為到達後的策略條件期望；全樹統計依沿途動作機率加權，不以終端數量比例計算勝率。',
      outcomeRng:compactPooled?'sampled-on-isolated-branches':prebuilt?'prebuilt-stored-targets':'fixed-deal',
      outcomeRngEnumerated:false,
      holeCardsVisibility:'暗牌、分支目標及完整公共牌序僅供離線分析；各節點 holes 為該分支當下牌組，board 只列當下已揭公牌。',
      poolSampling:pooled?'單手冷啟動：使用設定的初始三桶；沒有跨手水池歷史，不能當作長期 RTP。':fixedHoldem?'依固定牌序自然勝負，無結果水池。':'歷史牌庫模式，無結果水池。',
      rngStateAfterDeal:initialRngState,rngStateAfterTraversal:rootHand.rng.state()},
    config:session.config,seed,firstSmallBlind,policy,rootId:root.id,
    bossProfileId:rootHand.bossProfile?.id ?? 'legacy',bossProfile:rootHand.bossProfile,bossSelection:rootHand.bossSelection,
    cards:{player:[...rootHand.holes.player],npc:[...rootHand.holes.npc],
      npcByTarget:pooled?structuredClone((rootHand._outcomeTree?.layout||rootHand.pooledHoldem?.layout)?.boss):null,
      boardRunout:pooled?[...(rootHand._outcomeTree?.layout||rootHand.pooledHoldem?.layout).board]:[...rootHand.board,...rootHand.deck.slice(0,5-rootHand.board.length)]},
    nodes,summary,rootOptions:root.edges.map(edge=>({...edge,expected:{...byId.get(edge.childId).expected}}))
  };
}
