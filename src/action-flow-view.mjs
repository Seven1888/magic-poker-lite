import {esc} from './shared.mjs?v=58';

const clean=value=>String(value??'').replace(/\s+/g,' ').trim();
const blindAmount=value=>value.toLocaleString('en-US',{maximumFractionDigits:6});
const actorStep=actor=>actor==='npc'?'boss':'you';
const actorFromLabel=label=>/^(OPPONENT|BOSS)\b/i.test(label)?'boss':/^YOU\b/i.test(label)?'you':'';
const actionVerb=label=>{
 const verb=label.replace(/^(YOU|OPPONENT|BOSS)\s+/i,'');
 return /^(FOLD|CHECK|CALL|BET|RAISE)\b/i.exec(verb)?.[1]||verb;
};
const concreteAction=verb=>/^(FOLD|CHECK|CALL|BET|RAISE)\b/i.test(verb);
const ICONS={
 deal:'<rect x="3" y="5" width="12" height="16" rx="2"/><path d="M9 3h10a2 2 0 0 1 2 2v12M7 11h4m-2-2v4"/>',
 you:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
 boss:'<path d="m3 7 4 3 5-6 5 6 4-3-2 11H5L3 7Zm3 14h12"/>',
 complete:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>'
};
const view=(step,name,verb,detail='')=>({step,name,verb,message:name+(verb?(name?': ':'')+verb:'')+(detail?' · '+detail:'')});

/** Describe the current actor only; chip transfers do not become another turn. */
export function actionFlowState({mode='',label='',seat='',detail='',actor='',playing=false,settled=false}={},previous=null){
 label=clean(label);detail=clean(detail);
 if(mode==='buyin')return view('deal','','BUYING IN');
 if(mode==='hole-deal'&&label==='DRAWING YOUR BLIND')return view('deal','','DRAWING YOUR BLIND');
 if(['hole-deal','board-deal','showdown'].includes(mode)){
  const verb=mode==='hole-deal'?'HOLE CARDS':mode==='showdown'?'SHOWDOWN':/\b(FLOP|TURN|RIVER)\b/i.exec(label)?.[1].toUpperCase()||'SETTING THE BOARD';
  return view('deal','DEALING',verb,detail);
 }
 if(mode==='contribution'&&/\bBLINDS?\b/i.test(label))return view('deal','DEALING','POSTING BLINDS');
 if(mode==='action'||mode==='contribution'){
  const step=seat?actorStep(seat):actorFromLabel(label)||actorStep(actor);
  let verb=actionVerb(label);
  if(mode==='contribution'){
   // Keep the action word through its chip flight. Exact amounts remain in the
   // controls and ledger; the engine may already have advanced or settled.
   if(previous?.step===step&&concreteAction(previous.verb)&&(!concreteAction(verb)||previous.verb.split(' ')[0]===verb.split(' ')[0]))return previous;
   if(!concreteAction(verb))verb='ACTING';
   return view(step,step==='boss'?'BOSS TURN':'YOUR TURN',verb);
  }
  if(/^(DECIDING|THINKING)$/i.test(verb))verb='DECIDING';
  if(!verb)verb=step==='boss'?'DECIDING':'CHOOSE YOUR MOVE';
  return view(step,step==='boss'?'BOSS TURN':'YOUR TURN',verb,detail);
 }
 if(['refund','payout','bonus','refresh'].includes(mode)||settled){
  if(mode==='payout'){
   const result=/^YOU WIN\b/i.test(label)?'YOU WIN':/^(OPPONENT|BOSS) WINS\b/i.test(label)?'BOSS WINS':/\bSPLIT\b/i.test(label)?'SPLIT HAND':'READY FOR NEXT HAND';
   return view('complete','HAND COMPLETE',result);
  }
  if(previous?.step==='complete')return previous;
  return view('complete','HAND COMPLETE',mode==='refund'?'SETTLING HAND':'READY FOR NEXT HAND');
 }
 if(playing){
  const step=actorStep(actor);
  return view(step,step==='boss'?'BOSS TURN':'YOUR TURN',step==='boss'?'DECIDING':'CHOOSE YOUR MOVE');
 }
 return view('deal','READY TO PLAY','CHOOSE YOUR BET');
}

/** Persistent, read-only turn panel; unchanged renders do not re-announce. */
export function createActionFlow({root=globalThis.document}={}){
 const element=root.getElementById('action-flow');
 let previous=null,previousKey='',previousMessage='',blind=null;
 function paint(current){
  if(!element)return;
  const key=JSON.stringify(current);
  if(key===previousKey)return;
  previousKey=key;
  element.classList.add('action-flow-strip');
  element.setAttribute('role','status');element.setAttribute('aria-live','polite');element.setAttribute('aria-atomic','true');
  const messageChanged=current.message!==previousMessage;
  if(messageChanged){element.setAttribute('aria-label',current.message);element.setAttribute('title',current.message);}
  element.dataset.step=current.step;
  if(current.blindDraw)element.dataset.blindDraw=current.blindDraw;else delete element.dataset.blindDraw;
  // The animated coin occupies this icon slot from the presentation layer.
  const icon=current.blindDraw?'':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'+ICONS[current.step]+'</svg>';
  const copy='<span class="action-flow-icon">'+icon+'</span><span class="action-flow-copy">'+(current.name?'<span class="action-flow-name">'+esc(current.name)+'</span>':'')+'<strong class="action-flow-verb">'+esc(current.verb)+'</strong></span>';
  const visible=element.querySelector?.('.action-flow-current'),announcement=element.querySelector?.('.action-flow-announcement');
  if(visible&&announcement){
   visible.innerHTML=copy;
   // Icon/layout changes stay inside aria-hidden; keep the live text node so an
   // already announced DRAWING YOUR BLIND is not inserted and read twice.
   if(messageChanged)announcement.textContent=current.message;
  }else element.innerHTML='<span class="action-flow-current" aria-hidden="true">'+copy+'</span><span class="action-flow-announcement">'+esc(current.message)+'</span>';
  previousMessage=current.message;
 }
 function render(input={}){
  previous=actionFlowState(input,previous);
  if(!blind)paint(previous);
 }
 /** Hold the same ribbon through the draw; ordinary re-renders cannot erase it. */
 function setBlindDraw(result,{restore=true}={}){
  if(!result){
   blind=null;
   // At a successful flight endpoint the next game phase updates the ribbon in
   // the same task. Do not briefly announce DRAWING YOUR BLIND a second time.
   if(restore)paint(previous||actionFlowState());
   return;
  }
  if(result.phase==='drawing')blind={...view('deal','','DRAWING YOUR BLIND'),blindDraw:'drawing'};
  else{
   const {isSmall,smallBlind,bigBlind}=result;
   const title=isSmall?'YOU · SMALL BLIND':'YOU · BIG BLIND';
   const payment=`YOU ${blindAmount(isSmall?smallBlind:bigBlind)} · BOSS ${blindAmount(isSmall?bigBlind:smallBlind)}`;
   blind={...view('deal',title,payment),blindDraw:'revealed'};
  }
  paint(blind);
 }
 return {render,setBlindDraw};
}
