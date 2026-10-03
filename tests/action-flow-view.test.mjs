import test from 'node:test';
import assert from 'node:assert/strict';
import {actionFlowState,createActionFlow} from '../src/action-flow-view.mjs';

test('flow uses actual presentation stages and action seats, without remapping NPC action names',()=>{
 for(const [input,step,verb] of [
  [{mode:'hole-deal'},'deal','HOLE CARDS'],[{mode:'board-deal',label:'FLOP'},'deal','FLOP'],
  [{mode:'board-deal',label:'SETTING THE BOARD'},'deal','BOARD'],[{mode:'showdown'},'deal','SHOWDOWN'],
  [{mode:'action',seat:'player',label:'YOU CALL 0.5'},'you','CALL 0.5'],
  [{mode:'action',label:'OPPONENT CHECK'},'boss','CHECK'],
  [{mode:'action',seat:'npc',label:'OPPONENT DECIDING'},'boss','THINKING'],
  [{mode:'refresh',label:'OPPONENT READY'},'boss','READY'],
  [{playing:true,actor:'player'},'you','CHOOSE'],[{playing:true,actor:'npc'},'boss','THINKING'],
  [{playing:false},'deal','READY']]){
  const state=actionFlowState(Object.freeze(input));assert.equal(state.step,step);assert.equal(state.verb,verb);
 }
});

test('flow keeps exact transfer amounts and full details while using short POT verbs',()=>{
 for(const [mode,label,detail,verb] of [
  ['contribution','BOTH PLAYERS POST BLINDS','0.015 + 0.03 → POT','IN 0.015+0.03'],
  ['refund','UNCALLED CHIPS BACK','YOU +0.015','BACK 0.015'],
  ['payout','SPLIT POT','YOU +1,234.56789 · OPPONENT +1,234.56789','PAID 1,234.56789+1,234.56789'],
  ['bonus','JACKPOT BONUS','+200 TO YOUR CHIPS','JP 200']]){
  const state=actionFlowState({mode,label,detail});assert.equal(state.step,'pot');assert.equal(state.verb,verb);
  assert.ok(state.message.includes(label));assert.ok(state.message.includes(detail));
 }
});

test('unchanged renders do not rewrite the live region and the accessible message remains complete',()=>{
 let writes=0,markup='';const attrs={},element={dataset:{},classList:{add(){}},setAttribute(name,value){attrs[name]=value;},
  set innerHTML(value){writes++;markup=value;},get innerHTML(){return markup;}};
 const view=createActionFlow({root:{getElementById:id=>id==='action-flow'?element:null}});
 const input={mode:'contribution',label:'YOU RAISE',detail:'0.015 → POT',seat:'player'};
 view.render(input);view.render({...input});assert.equal(writes,1);
 assert.equal(attrs.role,'status');assert.equal(attrs['aria-live'],'polite');assert.equal(attrs['aria-label'],'POT: YOU RAISE · 0.015 → POT');
 assert.equal(attrs.title,attrs['aria-label']);assert.match(markup,/IN 0.015/);
 assert.equal((markup.match(/class="action-flow-arrow"/g)||[]).length,3);
 assert.equal((markup.match(/action-flow-current/g)||[]).length,1);
 view.render({mode:'action',label:'YOU <CALL>',seat:'player'});assert.equal(writes,2);assert.match(markup,/&lt;CALL&gt;/);
 assert.doesNotThrow(()=>createActionFlow({root:{getElementById:()=>null}}).render(input));
});
