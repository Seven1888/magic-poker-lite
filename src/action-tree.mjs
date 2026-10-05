import {createSession,startHand,cloneHand,legalActions,applyAction,getActionDistribution} from './engine.mjs?v=45';

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
 * Enumerate every legal action for one deal from the shared engine. The cards
 * and remaining deck are fixed after startHand; traversal does not sample RNG.
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
  const initialRngState=rootHand.rng.state();
  const nodes=[];
  const summary={nodes:0,decisionNodes:0,terminalNodes:0,maxDepth:0,
    decisionsByStreet:{preflop:0,flop:0,turn:0,river:0},zeroProbabilityEdges:0,
    terminalProbabilityMass:0,conservationError:0,weighted:emptyExpected()};
  function visit(hand,parentId,path,reachProbability) {
    if (nodes.length>=stateLimit) throw new RangeError(`完整行動樹超過 ${stateLimit} 個節點；未產生截斷結果，請提高上限。`);
    if (hand.rng.state()!==initialRngState) throw new Error('完整樹展開意外消耗牌局亂數。');
    const node={id:`n${nodes.length}`,parentId,depth:path.length,path,actor:hand.actor,street:hand.street,
      reachProbability,board:[...hand.board],stacks:{...hand.stacks},pot:hand.pot,
      contributions:{...hand.contributions},streetBets:{...hand.streetBets},currentBet:hand.currentBet,
      raises:hand.raises,pending:[...hand.pending],terminal:hand.status==='settled',edges:[],expected:emptyExpected()};
    nodes.push(node);summary.maxDepth=Math.max(summary.maxDepth,node.depth);
    if (node.terminal) {
      node.result=hand.result;
      node.expected=terminalExpected(hand.result);
      summary.terminalNodes++;
      summary.terminalProbabilityMass+=reachProbability;
      const r=hand.result;
      summary.conservationError=Math.max(summary.conservationError,
        Math.abs(r.player.stackAfter+r.npc.stackAfter+r.fee-r.player.stackBefore-r.npc.stackBefore-r.player.jackpotAward));
      return node;
    }
    summary.decisionNodes++;
    summary.decisionsByStreet[hand.street]++;
    const actions=legalActions(hand),distribution=getActionDistribution(hand,hand.actor,hand.actor==='player'?policy:'balanced');
    const probabilities=new Map(distribution.map(action=>[action.type,action.probability]));
    if (!actions.length||distribution.length!==actions.length
      ||distribution.some(action=>!Number.isFinite(action.probability)||action.probability<0)
      ||Math.abs(distribution.reduce((sum,action)=>sum+action.probability,0)-1)>1e-9) {
      throw new Error('完整樹節點的合法動作或機率不完整。');
    }
    for (const action of actions) {
      const probability=probabilities.get(action.type);
      if (!Number.isFinite(probability)) throw new Error('完整樹合法動作缺少對應機率。');
      if (probability===0) summary.zeroProbabilityEdges++;
      const step={actor:hand.actor,street:hand.street,type:action.type,amount:action.amount,to:action.to,allIn:action.allIn};
      const childHand=cloneHand(hand);
      applyAction(childHand,action.type);
      const child=visit(childHand,node.id,[...path,step],reachProbability*probability);
      node.edges.push({type:action.type,amount:action.amount,to:action.to,allIn:action.allIn,probability,childId:child.id});
      addExpected(node.expected,child.expected,probability);
    }
    return node;
  }
  const root=visit(rootHand,null,[],1);
  if (rootHand.rng.state()!==initialRngState) throw new Error('完整樹分析不得改變原始牌局亂數。');
  if (Math.abs(summary.terminalProbabilityMass-1)>1e-8) throw new Error('完整樹終端機率質量不守恆。');
  summary.nodes=nodes.length;summary.weighted={...root.expected};
  const byId=new Map(nodes.map(node=>[node.id,node]));
  return {
    version:1,mode:'fixed-deal-full-action-tree',complete:true,
    meta:{cardModel:'shared-engine-fixed-deck',scope:'one-fixed-deck-all-legal-actions',
      description:'依現行共用引擎的起手規則發一副牌，固定牌序後展開雙方所有合法動作；不是先定輸贏，也不是枚舉全部發牌組合。',
      policyInformation:'玩家策略只使用自己的底牌、已揭公共牌及下注狀態；對手依該手鎖定的 BOSS 機率表；legacy 模式才使用原權重模型。',
      expectation:'每節點為到達後的策略條件期望；全樹統計依沿途動作機率加權，不以終端數量比例計算勝率。',
      holeCardsVisibility:'雙方底牌與完整公共牌序只供離線分析；節點 board 僅列當下已揭公共牌。',
      rngStateAfterDeal:initialRngState,rngStateAfterTraversal:rootHand.rng.state()},
    config:session.config,seed,firstSmallBlind,policy,rootId:root.id,
    bossProfileId:rootHand.bossProfile?.id ?? 'legacy',bossProfile:rootHand.bossProfile,bossSelection:rootHand.bossSelection,
    cards:{player:[...rootHand.holes.player],npc:[...rootHand.holes.npc],
      boardRunout:[...rootHand.board,...rootHand.deck.slice(0,5-rootHand.board.length)]},
    nodes,summary,rootOptions:root.edges.map(edge=>({...edge,expected:{...byId.get(edge.childId).expected}}))
  };
}
