import {responseBadges} from './action-response-view.mjs?v=38';
import {pct} from './shared.mjs?v=35';

/** An explicit allowlist for the analysis worker; never pass a hand/session. */
export function bossRangeContext({playerHole,smallBlind,bossProfileId,config}) {
 const deal={};
 for(const seat of ['player','npc']) {
  const source=config.deal[seat];
  deal[seat]={rerollMode:source.rerollMode,rerollChance:source.rerollChance,maxRerolls:source.maxRerolls,
   ...(source.rerollMode==='legacy-score'?{targetScore:source.targetScore}:{}),
   manualProvided:!!source.manual?.length};
 }
 const npc={};
 for(const key of ['fold','call','raise','check','bet','strengthInfluence','priceInfluence'])npc[key]=config.npc[key];
 return {playerHole:[...playerHole],smallBlind,bossProfileId,
  config:{deal,npc,boss:{mode:config.boss.mode}}};
}

/** Keep the displayed labels, never a distribution's unrounded probabilities. */
export function publicBossEvidence({id,street,board,distribution,owed,pot,shownMode='badges'}) {
 const shown=shownMode==='badges'?responseBadges(distribution).map(({type,label})=>({type,label}))
  :distribution.filter(item=>item.probability>0).map(({type,probability})=>({type,label:probability<.001?'<0.1%':pct(probability)}));
 return {id,street,board:[...board],actions:distribution.map(({type})=>({type})),owed,pot,shownMode,shown};
}
