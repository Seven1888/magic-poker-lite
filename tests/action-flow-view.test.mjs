import test from 'node:test';
import assert from 'node:assert/strict';
import {actionFlowState,createActionFlow} from '../src/action-flow-view.mjs';

test('turn panel identifies the current actor and retains actual NPC action names',()=>{
 for(const [input,step,name,verb] of [
  [{mode:'hole-deal'},'deal','DEALING','HOLE CARDS'],
  [{mode:'hole-deal',label:'DRAWING YOUR BLIND'},'deal','','DRAWING YOUR BLIND'],
  [{mode:'board-deal',label:'FLOP'},'deal','DEALING','FLOP'],
  [{mode:'board-deal',label:'TURN'},'deal','DEALING','TURN'],
  [{mode:'board-deal',label:'RIVER'},'deal','DEALING','RIVER'],
  [{mode:'board-deal',label:'SETTING THE BOARD'},'deal','DEALING','SETTING THE BOARD'],
  [{mode:'showdown'},'deal','DEALING','SHOWDOWN'],
  [{mode:'action',seat:'player',label:'YOU CALL 0.5'},'you','YOUR TURN','CALL'],
  [{mode:'action',label:'OPPONENT CHECK'},'boss','BOSS TURN','CHECK'],
  [{mode:'action',label:'OPPONENT BET'},'boss','BOSS TURN','BET'],
  [{mode:'action',seat:'npc',label:'OPPONENT DECIDING'},'boss','BOSS TURN','DECIDING'],
  [{playing:true,actor:'player'},'you','YOUR TURN','CHOOSE YOUR MOVE'],
  [{playing:true,actor:'npc'},'boss','BOSS TURN','DECIDING'],
  [{playing:false},'deal','READY TO PLAY','CHOOSE YOUR BET']]){
  const state=actionFlowState(Object.freeze(input));assert.equal(state.step,step);assert.equal(state.name,name);assert.equal(state.verb,verb);
 }
});

test('chip contributions retain the acting seat even after the engine advances or settles',()=>{
 const chosen=Object.freeze(actionFlowState({mode:'action',seat:'player',label:'YOU RAISE 0.015',detail:'CHIPS TO THE POT'}));
 const transfer={mode:'contribution',label:'YOU RAISE',detail:'0.015 → POT',seat:'player',actor:'npc',playing:true};
 assert.equal(actionFlowState(transfer,chosen),chosen);
 assert.equal(actionFlowState({...transfer,playing:false,settled:true},chosen),chosen);
 const boss=actionFlowState({mode:'action',seat:'npc',label:'OPPONENT CALL'});
 assert.equal(actionFlowState({mode:'contribution',seat:'npc',label:'CHIPS TO POT',detail:'1,234.56789 → POT',actor:'player'},boss),boss);
 const fresh=actionFlowState({mode:'contribution',seat:'npc',label:'OPPONENT CALL',detail:'1,234.56789 → POT',actor:'player'},chosen);
 assert.equal(fresh.step,'boss');assert.equal(fresh.verb,'CALL');
 assert.doesNotMatch(fresh.message,/POT/);
 for(const label of ['POST BLINDS','BOTH PLAYERS POST BLINDS','YOU SMALL BLIND','OPPONENT BIG BLIND']){
  const blind=actionFlowState({mode:'contribution',label,seat:'npc'},boss);
  assert.equal(blind.step,'deal');assert.equal(blind.verb,'POSTING BLINDS');
 }
});

test('settlement has no POT turn and does not announce refunds, bonuses or asset refreshes as actions',()=>{
 for(const mode of ['refund','payout','bonus','refresh']){
  const state=actionFlowState({mode,label:'CHIPS TO POT',seat:'npc',detail:'YOU +1,234.56789'});
  assert.equal(state.step,'complete');assert.equal(state.name,'HAND COMPLETE');assert.doesNotMatch(state.message,/POT|1,234|NPC|CHIPS/);
 }
 for(const [label,verb] of [['YOU WIN','YOU WIN'],['OPPONENT WINS','BOSS WINS'],['SPLIT POT','SPLIT HAND'],['HAND COMPLETE','READY FOR NEXT HAND']]){
  const result=Object.freeze(actionFlowState({mode:'payout',label}));assert.equal(result.verb,verb);
  for(const mode of ['refund','bonus','refresh',''])assert.equal(actionFlowState({mode,settled:true},result),result);
  assert.equal(actionFlowState({playing:false,settled:false},result).name,'READY TO PLAY');
  assert.equal(actionFlowState({mode:'hole-deal',playing:true},result).name,'DEALING');
 }
});

test('unchanged choices and chip flights do not rewrite the live region or show inactive turns',()=>{
 let writes=0,markup='';const attrs={},element={dataset:{},classList:{add(){}},setAttribute(name,value){attrs[name]=value;},
  set innerHTML(value){writes++;markup=value;},get innerHTML(){return markup;}};
 const panel=createActionFlow({root:{getElementById:id=>id==='action-flow'?element:null}});
 const input={mode:'action',label:'YOU RAISE 0.015',detail:'CHIPS TO THE POT',seat:'player'};
 panel.render(input);panel.render({...input});
 panel.render({mode:'contribution',label:'YOU RAISE',detail:'0.015 → POT',seat:'player'});
 assert.equal(writes,1);
 assert.equal(attrs.role,'status');assert.equal(attrs['aria-live'],'polite');assert.equal(attrs['aria-label'],'YOUR TURN: RAISE · CHIPS TO THE POT');
 assert.equal(attrs.title,attrs['aria-label']);assert.match(markup,/RAISE/);assert.doesNotMatch(markup,/0\.015/);
 assert.doesNotMatch(markup,/action-flow-arrow|action-flow-rail|BOSS TURN|DEALING/);
 assert.equal((markup.match(/action-flow-current/g)||[]).length,1);
 panel.render({mode:'action',label:'YOU <CALL>',seat:'player'});assert.equal(writes,2);assert.match(markup,/&lt;CALL&gt;/);
 panel.render({mode:'action',label:'OPPONENT CHECK',seat:'npc'});assert.equal(writes,3);assert.equal(element.dataset.step,'boss');
 assert.doesNotMatch(markup,/YOUR TURN/);
 assert.doesNotThrow(()=>createActionFlow({root:{getElementById:()=>null}}).render(input));
});

test('blind presentation owns one live ribbon, survives re-renders and resumes the latest phase',()=>{
 let writes=0,markup='';const attrs={},element={dataset:{},classList:{add(){}},setAttribute(name,value){attrs[name]=value;},
  set innerHTML(value){writes++;markup=value;},get innerHTML(){return markup;}};
 const panel=createActionFlow({root:{getElementById:()=>element}});
 panel.render({mode:'hole-deal',label:'DRAWING YOUR BLIND'});
 panel.setBlindDraw({phase:'drawing'});
 const drawingWrites=writes;
 panel.setBlindDraw({phase:'drawing'});
 panel.render({mode:'hole-deal',label:'DRAWING YOUR BLIND'});
 assert.equal(writes,drawingWrites,'unchanged drawing is not re-announced');
 assert.equal(element.dataset.blindDraw,'drawing');
 assert.doesNotMatch(markup,/<svg/,'the spinning coin replaces the generic icon');
 panel.setBlindDraw({phase:'revealed',isSmall:false,smallBlind:50,bigBlind:100});
 assert.match(markup,/YOU · BIG BLIND/);assert.match(markup,/YOU 100 · BOSS 50/);
 assert.equal(attrs['aria-label'],'YOU · BIG BLIND: YOU 100 · BOSS 50');
 const revealedWrites=writes;
 panel.setBlindDraw({phase:'revealed',isSmall:false,smallBlind:50,bigBlind:100});
 panel.render({mode:'contribution',label:'POST BLINDS'});
 assert.equal(writes,revealedWrites,'ordinary rendering leaves the revealed result readable');
 panel.setBlindDraw(null);
 assert.equal(element.dataset.blindDraw,undefined);assert.match(markup,/POSTING BLINDS/);
 assert.match(markup,/<svg/,'the next phase restores its normal icon');
});

test('changing the drawing icon preserves the existing accessible announcement node',()=>{
 let mounted=false,announcementWrites=0;const visible={innerHTML:''},announcement={set textContent(value){announcementWrites++;this.text=value;}};
 const element={dataset:{},classList:{add(){}},setAttribute(){},set innerHTML(value){mounted=true;this.markup=value;},
  querySelector(selector){return mounted?(selector==='.action-flow-current'?visible:announcement):null;}};
 const panel=createActionFlow({root:{getElementById:()=>element}});
 panel.render({mode:'hole-deal',label:'DRAWING YOUR BLIND'});
 panel.setBlindDraw({phase:'drawing'});
 assert.equal(announcementWrites,0,'moving from the ordinary icon to the coin does not reinsert live text');
 panel.setBlindDraw({phase:'revealed',isSmall:true,smallBlind:50,bigBlind:100});
 assert.equal(announcementWrites,1);assert.match(announcement.text,/YOU · SMALL BLIND/);
 panel.setBlindDraw({phase:'revealed',isSmall:true,smallBlind:50,bigBlind:100});
 panel.setBlindDraw(null,{restore:false});
 assert.equal(announcementWrites,1,'unchanged results and the flight endpoint do not repeat the result');
 panel.render({mode:'contribution',label:'POST BLINDS'});
 assert.equal(announcementWrites,2);assert.match(announcement.text,/POSTING BLINDS/);
});
