/** Card possibilities only: no identity, betting history or action-odds evidence. */
export function bossRangeContext({playerHole,smallBlind,config}) {
 const deal={};
 for(const seat of ['player','npc']) {
  const source=config.deal[seat];
  deal[seat]={rerollMode:source.rerollMode,rerollChance:source.rerollChance,maxRerolls:source.maxRerolls,
   ...(source.rerollMode==='legacy-score'?{targetScore:source.targetScore}:{}),
   manualProvided:!!source.manual?.length};
 }
 return {playerHole:[...playerHole],smallBlind,config:{deal}};
}
