import {normalizeConfig} from './engine.mjs?v=46';
import {minimumAssetsForBet} from './hand-entry.mjs?v=46';
export {minimumAssetsForBet as minimumAssets} from './hand-entry.mjs?v=46';
const round=n=>Math.round((n+Number.EPSILON)*1e6)/1e6;
// Match Hands Up's fixed BET levels; probability-tool settings do not move the UI ladder.
const BET_LEVELS=Object.freeze([1,2,5,10,20,50,100,200,500,800,1000,1200,1500,1800,2000]);
export function betOptions(_config){return [...BET_LEVELS];}
export function tableConfig(config,bet,assets){
 if(!Number.isFinite(bet)||bet<.02||!Number.isFinite(assets))throw new Error('Not enough chips. Choose a lower BET.');
 const bigBlind=round(bet),minBuyIn=minimumAssetsForBet(config,bigBlind);
 if(!Number.isFinite(bigBlind)||!Number.isFinite(minBuyIn)||assets<minBuyIn)throw new Error('Not enough chips. Choose a lower BET.');
 const ratio=bigBlind/config.bigBlind;
 return normalizeConfig({...config,bigBlind,smallBlind:round(bigBlind/2),buyIn:assets,minBuyIn,maxBuyIn:Math.max(assets,round(config.maxBuyIn*ratio)),betSize:Object.fromEntries(Object.entries(config.betSize).map(([k,v])=>[k,round(v*ratio)]))});
}
