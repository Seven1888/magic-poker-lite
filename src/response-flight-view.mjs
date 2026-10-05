import {pct,esc} from './shared.mjs?v=45';
import {icon} from './ui-icons.mjs?v=35';
import {responseActionLabel} from './action-response-view.mjs?v=45';

/** Central decisions show every real outcome; mixed button previews stay FOLD/RAISE only. */
export function responseDistributionView(distribution=[],{phase='preview',selected=null,roll=null}={}){
 const outcomes=distribution.filter(outcome=>Number.isFinite(outcome.probability)&&outcome.probability>0);
 const state=['preview','drawing','result'].includes(phase)?phase:'preview';
 const marker=state==='result'&&Number.isFinite(roll)&&roll>=0&&roll<1?`<span class="action-response-sweep response-result-marker" style="left:${roll*100}%"></span>`:'';
 const labels=outcomes.map(outcome=>{
  const type=esc(outcome.type),label=outcome.probability<.001?'<0.1%':pct(outcome.probability);
  const name=responseActionLabel(outcome.type),visual=name==='CALL'?'chip':name.toLowerCase();
  return {outcome,type,copy:`<span class="response-badge-label">${icon(visual)}${esc(name)}</span><b class="response-badge-percent">${esc(label)}</b>`};
 });
 return {count:outcomes.length,markup:outcomes.length?`<span class="action-response-badges response-probability-track" data-phase="${state}" aria-hidden="true">${labels.map(({outcome,type,copy})=>
  `<span class="action-response-badge${outcome.probability<.2?' is-narrow':''}${outcome.probability<.1?' is-tiny':''}${state==='result'&&selected===outcome.type?' is-selected':''}" data-response="${type}" data-probability="${outcome.probability}" style="flex:0 0 ${outcome.probability*100}%">${copy}</span>`
 ).join('')}${marker}</span>`:''};
}

/** Show a public distribution, optionally flying from its preview, without sampling or reading game state. */
export function createResponseFlight({root=globalThis.document,effects,reducedMotion=false}={}) {
 const stage=root.getElementById('game');
 let layer=null,panel=null,epoch=0;
 function clear(){
  epoch++;layer?.remove();layer=null;panel=null;
  if(stage)delete stage.dataset.responseFlight;
 }
 function update(distribution=[],decision={}){
  if(!panel)return;
  const view=responseDistributionView(distribution,decision);
  if(!view.count){clear();return;}
  panel.innerHTML=view.markup;
  panel.style.width='360px';
  panel.dataset.outcomeCount=String(view.count);
  if(stage.dataset.responseFlight!=='flying')stage.dataset.responseFlight=decision.phase||'ready';
 }
 function mount(distribution,decision={}){
  if(!stage||!responseDistributionView(distribution,decision).count)return false;
  layer=root.createElement('div');layer.id='response-flight-layer';layer.setAttribute('aria-hidden','true');
  panel=root.createElement('div');panel.className='response-flyout';
  layer.append(panel);stage.append(layer);update(distribution,decision);
  return true;
 }
 function show(distribution=[],decision={}){
  clear();
  return mount(distribution,decision);
 }
 async function launch(source,distribution){
  clear();
  if(!source||!stage)return false;
  const cards=[...source.querySelectorAll('.action-response-badge')];
  if(!cards.length)return false;
  const rects=cards.map(card=>card.getBoundingClientRect());
  const from=source.matches?.('.action-response-preview')?source.getBoundingClientRect():{left:Math.min(...rects.map(r=>r.left)),top:Math.min(...rects.map(r=>r.top)),right:Math.max(...rects.map(r=>r.right)),bottom:Math.max(...rects.map(r=>r.bottom))};
  const stageRect=stage.getBoundingClientRect(),scale=stageRect.width/stage.offsetWidth;
  if(!(scale>0)||from.right<=from.left||from.bottom<=from.top)return false;
  const current=epoch;
  if(!mount(distribution))return false;
  stage.dataset.responseFlight='flying';
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
 return {launch,show,update,clear,target:()=>panel?.querySelector('.action-response-badges')||null};
}
