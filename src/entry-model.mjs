import {normalizeConfig} from './engine.mjs?v=58';
import {minimumAssetsForBet} from './hand-entry.mjs?v=58';
export {minimumAssetsForBet as minimumAssets} from './hand-entry.mjs?v=58';
const round=n=>Math.round((n+Number.EPSILON)*1e6)/1e6;
// Small-blind choices stay stable; pool budgets use the corresponding big blind.
const BET_LEVELS=Object.freeze([1,2,5,10,20,50,100,200,500,800,1000,1200,1500,1800,2000]);
export function betOptions(_config){return [...BET_LEVELS];}
export function tableConfig(config,bet,assets){
 if(['fixed-holdem','pooled-holdem'].includes(config.outcome?.mode)){
  const smallBlind=round(bet),bigBlind=round(smallBlind*2),buyIn=round(smallBlind*100);
  if(!Number.isFinite(smallBlind)||smallBlind<=0||!Number.isFinite(assets)||assets<buyIn)throw new Error('Not enough balance. Choose a lower small blind.');
  return normalizeConfig({...config,smallBlind,bigBlind,buyIn,minBuyIn:buyIn,maxBuyIn:Math.max(buyIn,config.maxBuyIn)});
 }
 if(!Number.isFinite(bet)||bet<.02||!Number.isFinite(assets))throw new Error('Not enough chips. Choose a lower BET.');
 const bigBlind=round(bet),minBuyIn=minimumAssetsForBet(config,bigBlind);
 if(!Number.isFinite(bigBlind)||!Number.isFinite(minBuyIn)||assets<minBuyIn)throw new Error('Not enough chips. Choose a lower BET.');
 const ratio=bigBlind/config.bigBlind;
 return normalizeConfig({...config,bigBlind,smallBlind:round(bigBlind/2),buyIn:assets,minBuyIn,maxBuyIn:Math.max(assets,round(config.maxBuyIn*ratio)),betSize:Object.fromEntries(Object.entries(config.betSize).map(([k,v])=>[k,round(v*ratio)]))});
}
