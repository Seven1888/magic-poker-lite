import {esc} from './shared.mjs';

const STEPS=[['deal','DEAL'],['you','YOU'],['boss','BOSS'],['pot','POT']];
const clean=value=>String(value??'').replace(/\s+/g,' ').trim();
const actorStep=actor=>actor==='npc'?'boss':'you';
const amounts=detail=>(detail.match(/[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g)||[]).map(value=>value.replace(/^\+/,''));

/** Describe existing presentation state without consulting or changing a hand. */
export function actionFlowState({mode='',label='',seat='',detail='',actor='',playing=false}={}){
 label=clean(label);detail=clean(detail);
 let step='deal',verb='READY';
 if(['hole-deal','board-deal','showdown'].includes(mode)){
  verb=mode==='hole-deal'?'HOLE CARDS':mode==='showdown'?'SHOWDOWN':/\b(FLOP|TURN|RIVER)\b/i.exec(label)?.[1].toUpperCase()||'BOARD';
 }else if(mode==='action'){
  step=seat?actorStep(seat):/^(OPPONENT|BOSS)\b/i.test(label)?'boss':/^YOU\b/i.test(label)?'you':actorStep(actor);
  verb=label.replace(/^(YOU|OPPONENT|BOSS)\s+/i,'')||(step==='boss'?'THINKING':'CHOOSE');
  if(/^(DECIDING|THINKING)$/i.test(verb))verb='THINKING';
 }else if(['contribution','refund','payout','bonus'].includes(mode)){
  step='pot';
  const amount=amounts(detail).join('+');
  verb=`${{contribution:'IN',refund:'BACK',payout:'PAID',bonus:'JP'}[mode]}${amount?' '+amount:''}`;
  if(mode==='contribution'&&/\b(SMALL|BIG) BLIND\b/i.test(label))verb=`${/SMALL BLIND/i.test(label)?'SB':'BB'}${amount?' '+amount:''}`;
  if(!amount)verb=mode==='contribution'&&/BLIND/i.test(label)?'BLINDS':mode==='payout'&&/SPLIT/i.test(label)?'SPLIT':mode==='payout'&&/COMPLETE/i.test(label)?'COMPLETE':verb;
 }else if(mode==='refresh'){
  step='boss';verb='READY';
 }else if(playing){
  step=actorStep(actor);verb=step==='boss'?'THINKING':'CHOOSE';
 }
 const name=STEPS.find(([key])=>key===step)[1];
 return {step,verb,message:`${name}: ${label||verb}${detail?' · '+detail:''}`};
}

/** Persistent, read-only progress strip; unchanged renders do not re-announce. */
export function createActionFlow({root=globalThis.document}={}){
 const element=root.getElementById('action-flow');
 let previous='';
 function render(input={}){
  if(!element)return;
  const view=actionFlowState(input),key=JSON.stringify(view);
  if(key===previous)return;
  previous=key;
  element.classList.add('action-flow-strip');
  element.setAttribute('role','status');element.setAttribute('aria-live','polite');element.setAttribute('aria-atomic','true');
  element.setAttribute('aria-label',view.message);element.setAttribute('title',view.message);
  element.dataset.step=view.step;
  element.innerHTML=`<span class="action-flow-rail" aria-hidden="true">${STEPS.map(([step,name],index)=>`${index?'<span class="action-flow-arrow">→</span>':''}<span class="action-flow-step${view.step===step?' action-flow-current':''}"><span class="action-flow-name">${name}</span>${view.step===step?`<strong class="action-flow-verb">${esc(view.verb)}</strong>`:''}</span>`).join('')}</span><span class="action-flow-announcement">${esc(view.message)}</span>`;
 }
 return {render};
}
