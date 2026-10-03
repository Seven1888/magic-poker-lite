import {pct,esc} from './shared.mjs';
import {icon} from './ui-icons.mjs';

/** The central draw shows every real outcome; button previews stay FOLD/RAISE only. */
export function responseDistributionView(distribution=[],{phase='preview',selected=null}={}){
 const outcomes=distribution.filter(outcome=>Number.isFinite(outcome.probability)&&outcome.probability>0);
 const state=['preview','drawing','result'].includes(phase)?phase:'preview';
 return {count:outcomes.length,markup:outcomes.length?`<span class="action-response-badges" data-phase="${state}" aria-hidden="true">${outcomes.map(outcome=>{
  const type=esc(outcome.type),label=outcome.probability<.001?'<0.1%':pct(outcome.probability);
  return `<span class="action-response-badge${state==='result'&&selected===outcome.type?' is-selected':''}" data-response="${type}" data-probability="${outcome.probability}"><span class="response-badge-label">${icon(outcome.type==='call'?'chip':outcome.type)}${type.toUpperCase()}</span><b class="response-badge-percent">${esc(label)}</b></span>`;
 }).join('')}</span>`:''};
}

/** Move an existing public preview, without sampling or reading game state. */
export function createResponseFlight({root=globalThis.document,effects,reducedMotion=false}={}) {
 const stage=root.getElementById('game');
 let layer=null,panel=null,epoch=0;
 function clear(){
  epoch++;layer?.remove();layer=null;panel=null;
  if(stage)delete stage.dataset.responseFlight;
 }
 function update(distribution,decision={}){
  if(!panel)return;
  const view=responseDistributionView(distribution,decision);
  panel.innerHTML=view.markup;
  panel.style.width=view.count<=1?'146px':view.count===2?'290px':'304px';
  panel.dataset.outcomeCount=String(view.count);
  if(stage.dataset.responseFlight!=='flying')stage.dataset.responseFlight=decision.phase||'ready';
 }
 async function launch(source,distribution){
  clear();
  if(!source||!stage)return false;
  const cards=[...source.querySelectorAll('.action-response-badge')];
  if(!cards.length)return false;
  const rects=cards.map(card=>card.getBoundingClientRect());
  const from={left:Math.min(...rects.map(r=>r.left)),top:Math.min(...rects.map(r=>r.top)),right:Math.max(...rects.map(r=>r.right)),bottom:Math.max(...rects.map(r=>r.bottom))};
  const stageRect=stage.getBoundingClientRect(),scale=stageRect.width/stage.offsetWidth;
  if(!(scale>0)||from.right<=from.left||from.bottom<=from.top)return false;
  const current=epoch;
  layer=root.createElement('div');layer.id='response-flight-layer';layer.setAttribute('aria-hidden','true');
  panel=root.createElement('div');panel.className='response-flyout';
  layer.append(panel);stage.append(layer);stage.dataset.responseFlight='flying';update(distribution);
  const to=panel.getBoundingClientRect();
  const dx=(from.left+from.right-to.left-to.right)/2/scale,dy=(from.top+from.bottom-to.top-to.bottom)/2/scale;
  const sx=(from.right-from.left)/to.width,sy=(from.bottom-from.top)/to.height;
  if(!reducedMotion)await effects.animate(panel,[
   {transform:`translate(-50%,-50%) translate(${dx}px,${dy}px) scale(${sx},${sy})`,opacity:1},
   {transform:'translate(-50%,-50%) translate(0,0) scale(1,1)',opacity:1}
  ],{duration:650,easing:'cubic-bezier(.18,.75,.25,1)',fill:'both'});
  if(current!==epoch)return false;
  stage.dataset.responseFlight='ready';return true;
 }
 return {launch,update,clear,target:()=>panel?.querySelector('.action-response-badges')||null};
}
