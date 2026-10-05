import {DEFAULT_CONFIG,normalizeConfig} from './engine.mjs?v=35';
export const CONFIG_KEY='magic-poker-lite.config.v1';
export const LABELS={fold:'棄牌',check:'過牌',call:'跟注',bet:'下注',raise:'加注',smallBlind:'小盲',bigBlind:'大盲'};
export const STREETS={preflop:'翻牌前',flop:'翻牌',turn:'轉牌',river:'河牌'};
export const money=n=>Number(n||0).toLocaleString('en-US',{maximumFractionDigits:6});
export const pct=n=>`${(100*n).toFixed(1)}%`;
export const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function loadConfig(){try{return normalizeConfig(JSON.parse(localStorage.getItem(CONFIG_KEY)||'null')||DEFAULT_CONFIG);}catch{return normalizeConfig(DEFAULT_CONFIG);}}
export function cardText(card){return card?`${({s:'♠',h:'♥',d:'♦',c:'♣'})[card[1]]}${card[0]==='T'?'10':card[0]}`:'暗牌';}
export function cardMarkup(card,{back=false,best=false}={}){
  if(!card&&!back)return '<div class="card blank" aria-label="Unrevealed community card">♠</div>';
  const rank=card?({A:1,T:10,J:11,Q:12,K:13}[card[0]]||Number(card[0])):null;
  const file=back?'back-blue':`${card[1]==='c'?'f':card[1]}${rank}`;
  return `<div class="card original-card${best?' best':''}${back?' covered':''}" aria-label="${back?'Face-down card':cardText(card)}"><img src="assets/cards/${file}.png" alt="${back?'Face-down card':cardText(card)}" draggable="false"></div>`;
}
export function download(name,value,type='application/json'){
  const blob=new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
