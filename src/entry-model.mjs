import {normalizeConfig} from './engine.mjs?v=35';
const round=n=>Math.round((n+Number.EPSILON)*1e6)/1e6;
export function betOptions(config){return [...new Set([.1,.2,.5,1,2,5].map(x=>round(Math.max(.02,config.bigBlind*x))))];}
export function minimumAssets(config,bet){return round(config.minBuyIn/config.bigBlind*bet);}
export function tableConfig(config,bet,assets){
 if(!Number.isFinite(bet)||bet<.02||!Number.isFinite(assets)||assets<minimumAssets(config,bet))throw new Error('Not enough chips. Choose a lower BET.');
 const ratio=bet/config.bigBlind;
 return normalizeConfig({...config,bigBlind:bet,smallBlind:round(bet/2),buyIn:assets,minBuyIn:minimumAssets(config,bet),maxBuyIn:Math.max(assets,round(config.maxBuyIn*ratio)),betSize:Object.fromEntries(Object.entries(config.betSize).map(([k,v])=>[k,round(v*ratio)]))});
}
