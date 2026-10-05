import {createRng,normalizeConfig,STREETS} from './engine.mjs?v=45';
import {buildActionTree} from './action-tree.mjs?v=45';
import {BOSS_PROFILE_IDS} from './boss-profiles.mjs?v=35';

const TYPES=['fold','check','call','bet','raise'];
const TIERS=['royal','straightFlush','quads'];
const ratio=(numerator,denominator)=>denominator>0?numerator/denominator:null;
const emptyTiers=()=>Object.fromEntries(TIERS.map(tier=>[tier,0]));

/** Ratio uncertainty uses one integrated (wager, return) pair per sampled deal. */
function ratioInterval(samples,totals,xKey,yKey) {
  const estimate=ratio(totals[yKey],totals[xKey]);
  if(samples.length<2||estimate===null)return {estimate,standardError:null,ci95:[null,null]};
  const residual=samples.reduce((sum,sample)=>sum+(sample[yKey]-estimate*sample[xKey])**2,0);
  const standardError=Math.sqrt(samples.length/(samples.length-1)*residual)/totals[xKey];
  return {estimate,standardError,ci95:[estimate-1.96*standardError,estimate+1.96*standardError]};
}

/**
 * Sample independent shared-engine deals and integrate every legal action path
 * for each deal. A sample is a complete deal/tree, never one of its leaves.
 * Player policies share exactly the same seed schedule and alternating blinds.
 * This estimates expectations over deals; it does not enumerate the 52-card
 * deal space or change the game's dealing, outcome, RNG or settlement model.
 */
export function simulateTreeStudy(config={}, {deals=100,seed=20261005,policy='balanced',onProgress}={}) {
  if(!Number.isSafeInteger(deals)||deals<1||deals>10000)throw new RangeError('完整樹統計須設定 1 至 10,000 副牌序樣本。');
  if(!['balanced','call','aggressive','tight'].includes(policy))throw new RangeError('未知的完整樹玩家策略。');
  const normalized=normalizeConfig(config),seedRng=createRng(seed);
  const dealSeeds=Array.from({length:deals},()=>Math.floor(seedRng()*0x100000000));
  const totals={},samples=[],tierMass=emptyTiers(),actionRows=new Map();
  const byBoss=Object.fromEntries([...BOSS_PROFILE_IDS,'legacy'].map(id=>[id,{deals:0,totals:{}}]));
  const bossProfileIds=[];
  let totalNodes=0,totalTerminals=0,totalDecisionNodes=0,zeroProbabilityEdges=0,maxConservationError=0,maxMassError=0,totalMass=0;
  for(let index=0;index<deals;index++) {
    const firstSmallBlind=index%2===0?'player':'npc';
    const tree=buildActionTree(normalized,{seed:dealSeeds[index],firstSmallBlind,policy});
    totalNodes+=tree.summary.nodes;totalTerminals+=tree.summary.terminalNodes;totalDecisionNodes+=tree.summary.decisionNodes;
    zeroProbabilityEdges+=tree.summary.zeroProbabilityEdges;
    maxConservationError=Math.max(maxConservationError,tree.summary.conservationError);
    maxMassError=Math.max(maxMassError,Math.abs(tree.summary.terminalProbabilityMass-1));
    totalMass+=tree.summary.terminalProbabilityMass;
    const sample={...tree.summary.weighted,showdownProbability:0,showdownWinProbability:0,
      playerFoldProbability:0,npcFoldProbability:0,profitableHandProbability:0};
    for(const node of tree.nodes) {
      if(node.terminal) {
        const mass=node.reachProbability,result=node.result;
        if(result.reason==='showdown') {
          sample.showdownProbability+=mass;
          if(result.winner==='player')sample.showdownWinProbability+=mass;
        }
        if(result.folded==='player')sample.playerFoldProbability+=mass;
        if(result.folded==='npc')sample.npcFoldProbability+=mass;
        if(result.player.profit>0)sample.profitableHandProbability+=mass;
        if(result.jackpot)tierMass[result.jackpot.tier]+=mass;
        continue;
      }
      for(const edge of node.edges) {
        const key=`${node.street}:${node.actor}:${edge.type}`;
        if(!actionRows.has(key))actionRows.set(key,{street:node.street,actor:node.actor,type:edge.type,weightedVisits:0,weightedAmount:0});
        const row=actionRows.get(key),mass=node.reachProbability*edge.probability;
        row.weightedVisits+=mass;row.weightedAmount+=mass*edge.amount;
      }
    }
    samples.push(sample);
    const bossId=tree.bossProfileId,boss=byBoss[bossId];boss.deals++;bossProfileIds.push(bossId);
    for(const [key,value] of Object.entries(sample))boss.totals[key]=(boss.totals[key]||0)+value;
    for(const [key,value] of Object.entries(sample))totals[key]=(totals[key]||0)+value;
    if((index+1)%10===0||index===deals-1)onProgress?.({kind:'tree-study',completed:index+1,total:deals,policy});
  }
  const weighted=Object.fromEntries(Object.entries(totals).map(([key,value])=>[key,value/deals]));
  weighted.showdownConditionalWinProbability=ratio(totals.showdownWinProbability,totals.showdownProbability);
  const winVariance=deals>1?samples.reduce((sum,sample)=>sum+(sample.winProbability-weighted.winProbability)**2,0)/(deals-1):null;
  const winStandardError=winVariance===null?null:Math.sqrt(winVariance/deals);
  const winCi95=winStandardError===null?[null,null]:[
    Math.max(0,weighted.winProbability-1.96*winStandardError),
    Math.min(1,weighted.winProbability+1.96*winStandardError)
  ];
  const base=ratioInterval(samples,totals,'matchedWager','baseReturn');
  const total=ratioInterval(samples,totals,'matchedWager','totalReturn');
  const visitsByActorStreet=new Map();
  for(const row of actionRows.values()) {
    const key=`${row.street}:${row.actor}`;
    visitsByActorStreet.set(key,(visitsByActorStreet.get(key)||0)+row.weightedVisits);
  }
  const byStreet=[...actionRows.values()].sort((a,b)=>STREETS.indexOf(a.street)-STREETS.indexOf(b.street)
    ||['player','npc'].indexOf(a.actor)-['player','npc'].indexOf(b.actor)||TYPES.indexOf(a.type)-TYPES.indexOf(b.type))
    .map(row=>({...row,visitsPerDeal:row.weightedVisits/deals,amountPerDeal:row.weightedAmount/deals,
      conditionalActionProbability:ratio(row.weightedVisits,visitsByActorStreet.get(`${row.street}:${row.actor}`))}));
  for(const boss of Object.values(byBoss)) {
    boss.weighted=boss.deals?Object.fromEntries(Object.entries(boss.totals).map(([key,value])=>[key,value/boss.deals])):{};
    boss.weighted.showdownConditionalWinProbability=ratio(boss.totals.showdownWinProbability,boss.totals.showdownProbability);
    boss.baseRtp=ratio(boss.totals.baseReturn,boss.totals.matchedWager);boss.totalRtp=ratio(boss.totals.totalReturn,boss.totals.matchedWager);
  }
  return {
    version:1,kind:'tree-study',complete:true,deals,seed,policy,config:normalized,dealSeeds,
    meta:{cardModel:'shared-engine-fixed-deck',sampling:'sampled-deals-full-action-integration',
      firstSmallBlind:'alternating-player-npc',sampleUnit:'one-deal-one-full-action-tree',
      bossSampling:normalized.boss.mode==='rotate'?'每副取樣是獨立新牌桌，四型各 1/4；副與副之間不是同桌連續牌局，因此允許相同。遊戲及玩家序列研究則同桌不連續重複。':normalized.boss.mode==='fixed'?'全部獨立牌序固定同一 BOSS，刻意允許重複。':'全部牌序採舊版對手權重模型。',
      description:'按現行共用引擎取樣牌序；每副牌展開全部合法分支，依玩家策略及對手機率積分，再跨牌序平均。不是先定輸贏，也不是枚舉全部 52 張牌的組合。',
      uncertainty:'95% 區間以每副牌完整樹的條件期望為一個樣本，使用樣本均值及比率估計量的常態近似。葉子不是獨立樣本；單副牌不提供區間；稀有 JP 仍可能取樣不足。',
      actionVisits:'行為次數依到達機率加權；同一方同街可多次行動，conditionalActionProbability 的分母為該方該街全部決策的加權到達次數。',
      winDefinition:'winProbability 為全部牌局的贏池機率；showdownWinProbability 為攤牌且贏池的聯合機率；showdownConditionalWinProbability 才是攤牌條件勝率。',
      moneyDefinition:'weighted 金額為每副牌的平均條件期望；RTP 使用全部牌序的返還總和除以有效投入總和，退款不列 RTP 分子或分母。'},
    totalNodes,totalDecisionNodes,totalTerminals,zeroProbabilityEdges,maxConservationError,maxMassError,byBoss,bossProfileIds,
    blindCounts:{player:Math.ceil(deals/2),npc:Math.floor(deals/2)},
    averageTerminalProbabilityMass:totalMass/deals,weighted,totals,
    baseRtp:base.estimate,totalRtp:total.estimate,winStandardError,baseStandardError:base.standardError,totalStandardError:total.standardError,
    winCi95,baseCi95:base.ci95,totalCi95:total.ci95,
    tierProbabilities:Object.fromEntries(TIERS.map(tier=>[tier,tierMass[tier]/deals])),
    byStreet,progress:{completed:deals,total:deals}
  };
}
