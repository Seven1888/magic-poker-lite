import {normalizeConfig} from './engine.mjs?v=45';
const round=n=>Math.round((n+Number.EPSILON)*1e6)/1e6;
// Match Hands Up's fixed BET levels; probability-tool settings do not move the UI ladder.
const BET_LEVELS=Object.freeze([1,2,5,10,20,50,100,200,500,800,1000,1200,1500,1800,2000]);
export function betOptions(_config){return [...BET_LEVELS];}
export function minimumAssets(config,bet){return round(config.minBuyIn/config.bigBlind*bet);}
export function tableConfig(config,bet,assets){
 if(!Number.isFinite(bet)||bet<.02||!Number.isFinite(assets)||assets<minimumAssets(config,bet))throw new Error('Not enough chips. Choose a lower BET.');
 const ratio=bet/config.bigBlind;
 return normalizeConfig({...config,bigBlind:bet,smallBlind:round(bet/2),buyIn:assets,minBuyIn:minimumAssets(config,bet),maxBuyIn:Math.max(assets,round(config.maxBuyIn*ratio)),betSize:Object.fromEntries(Object.entries(config.betSize).map(([k,v])=>[k,round(v*ratio)]))});
}
