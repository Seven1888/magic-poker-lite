import {createRng,normalizeConfig,STREETS} from './engine.mjs?v=56';
import {buildActionTree} from './action-tree.mjs?v=56';
import {BOSS_PROFILE_IDS,BOSS_PROFILE_VERSION} from './boss-profiles.mjs?v=56';
import {combinePoolStudySummaries} from './probability-pools.mjs?v=56';

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
  const normalized=normalizeConfig(config),seedRng=createRng(seed),pooled=['prebuilt-pools','pooled-holdem'].includes(normalized.outcome?.mode);
  const compactPooled=normalized.outcome?.mode==='pooled-holdem';
  const fixedHoldem=normalized.outcome?.mode==='fixed-holdem';
  const dealSeeds=Array.from({length:deals},()=>Math.floor(seedRng()*0x100000000));
  const totals={},samples=[],tierMass=emptyTiers(),actionRows=new Map();
  const byBoss=Object.fromEntries([...BOSS_PROFILE_IDS,'legacy'].map(id=>[id,{deals:0,totals:{}}]));
  const bossProfileIds=[],poolSummaries=[];
  let totalNodes=0,totalTerminals=0,totalDecisionNodes=0,zeroProbabilityEdges=0,maxConservationError=0,maxMassError=0,totalMass=0;
  for(let index=0;index<deals;index++) {
    const firstSmallBlind=index%2===0?'player':'npc';
    const tree=buildActionTree(normalized,{seed:dealSeeds[index],firstSmallBlind,policy});
    if(tree.summary.outcomePoolSummary)poolSummaries.push(tree.summary.outcomePoolSummary);
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
        const key=`${node.street}:${node.actor}:${edge.type}:${edge.sizeKeys?.join('+')||''}`;
        if(!actionRows.has(key))actionRows.set(key,{street:node.street,actor:node.actor,type:edge.type,
          ...(edge.sizeKeys ? {sizeKey:edge.sizeKey,sizeKeys:[...edge.sizeKeys]} : {}),weightedVisits:0,weightedAmount:0});
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
  const contributionVariance=deals>1?samples.reduce((sum,sample)=>sum+(sample.totalContribution-weighted.totalContribution)**2,0)/(deals-1):null;
  const contributionStandardError=contributionVariance===null?null:Math.sqrt(contributionVariance/deals);
  const contributionCi95=contributionStandardError===null?[null,null]:[weighted.totalContribution-1.96*contributionStandardError,weighted.totalContribution+1.96*contributionStandardError];
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
    version:3,kind:'tree-study',complete:true,deals,seed,policy,config:normalized,dealSeeds,
    outcomePoolSummary:combinePoolStudySummaries(poolSummaries,{unit:'deals'}),
    meta:{modelVersion:`${compactPooled?'pooled-holdem-v1':fixedHoldem?'fixed-holdem-v1':pooled?'prebuilt-pools-v2-full-pot':'legacy-deck-v1'}+${BOSS_PROFILE_VERSION}+tree-study-v3`,cardModel:compactPooled?'shared-engine-pooled-holdem':fixedHoldem?'shared-engine-fixed-holdem':pooled?'shared-engine-prebuilt-pools':'shared-engine-fixed-deck',bossProfileVersion:BOSS_PROFILE_VERSION,
      sampling:compactPooled?'cold-start-layouts-sampled-outcome-full-action-integration':pooled?'cold-start-prebuilt-layouts-full-action-integration':'sampled-deals-full-action-integration',
      firstSmallBlind:'alternating-player-npc',sampleUnit:'one-deal-one-full-action-tree',
      bossSampling:normalized.boss.mode==='rotate'?`每副取樣是獨立新牌桌，${BOSS_PROFILE_IDS.length} 型等機率；副與副之間不是同桌連續牌局，因此允許相同。遊戲及玩家序列研究則同桌不連續重複。`:normalized.boss.mode==='fixed'?'全部獨立牌序固定同一 BOSS，刻意允許重複。':'全部牌序採歷史對手權重模型。',
      description:compactPooled?'每副從初始三桶冷啟動，固定玩家／公牌布局與對手候選暗牌；各合法下注路徑在隔離的亂數狀態取樣付費結果，再依動作機率積分並跨樣本平均。未精確枚舉全部結果抽籤；不能當成預先建好完整結果樹。':fixedHoldem?'每副固定自然牌序，依玩家策略與兩型逐街強弱分布積分所有合法下注尺寸及再加注，再跨牌序平均。':pooled?'每副樣本都從設定的初始三桶冷啟動，開局預建目標與全部合法分支，再依玩家策略及 BOSS 機率積分。玩家／公牌布局固定，BOSS 暗牌隨預存節點變化；不在遍歷時重抽。':'歷史牌庫模式：取樣牌序後展開全部合法分支，依玩家策略及對手機率積分，再跨牌序平均。',
      poolSampling:pooled?'每副牌是全新初始水池，沒有跨手累積。此結果是冷啟動單手期望，不是長期水池 RTP；長期研究須使用玩家連續序列。':fixedHoldem?'自然牌序依真實勝負結算，無結果水池。':'歷史牌庫模式，無結果水池。',
      outcomeRng:compactPooled?'sampled-on-isolated-branches':pooled?'prebuilt-stored-targets':'fixed-deal',
      outcomeRngEnumerated:false,
      uncertainty:`95% 區間以每副牌${compactPooled?'取樣結果後的動作加權估計':'完整樹的條件期望'}為一個樣本，使用樣本均值及比率估計量的常態近似。葉子不是獨立樣本；單副牌不提供區間；稀有 JP 仍可能取樣不足。`,
      actionVisits:'行為次數依到達機率加權；同一方同街可多次行動，conditionalActionProbability 的分母為該方該街全部決策的加權到達次數。',
      winDefinition:'winProbability 為全部牌局的贏池機率；showdownWinProbability 為攤牌且贏池的聯合機率；showdownConditionalWinProbability 才是攤牌條件勝率。',
      moneyDefinition:'weighted 金額為每副牌的平均條件期望；RTP 使用全部牌序的返還總和除以有效投入總和，退款不列 RTP 分子或分母。'},
    totalNodes,totalDecisionNodes,totalTerminals,zeroProbabilityEdges,maxConservationError,maxMassError,byBoss,bossProfileIds,
    blindCounts:{player:Math.ceil(deals/2),npc:Math.floor(deals/2)},
    averageTerminalProbabilityMass:totalMass/deals,weighted,totals,
    baseRtp:base.estimate,totalRtp:total.estimate,winStandardError,baseStandardError:base.standardError,totalStandardError:total.standardError,
    winCi95,baseCi95:base.ci95,totalCi95:total.ci95,contributionStandardError,contributionCi95,
    tierProbabilities:Object.fromEntries(TIERS.map(tier=>[tier,tierMass[tier]/deals])),
    byStreet,progress:{completed:deals,total:deals}
  };
}
