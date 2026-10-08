import test from 'node:test';
import assert from 'node:assert/strict';
import {essentialActionFlowState,createActionFlow} from '../src/action-flow-view.mjs';
import {decisionMotion} from '../src/decision-motion.mjs';

test('central guidance keeps streets and results while seat cards own actions',()=>{
 for(const mode of ['action','contribution','refund','refresh','bonus']){
  assert.equal(essentialActionFlowState({mode,label:'YOU CALL',seat:'player'}),null);
 }
 for(const street of ['FLOP','TURN','RIVER']){
  assert.equal(essentialActionFlowState({mode:'board-deal',label:street,detail:'DEAL SHARED CARDS'}).message,`DEAL ${street}`);
 }
 assert.equal(essentialActionFlowState({mode:'showdown'}).message,'SHOWDOWN');
 assert.equal(essentialActionFlowState({playing:true,actor:'player'}).message,'YOUR TURN');
 assert.equal(essentialActionFlowState({playing:true,actor:'npc'}),null);
 const win=essentialActionFlowState({mode:'payout',label:'YOU WIN'});
 assert.equal(win.message,'YOU WIN');
 assert.equal(essentialActionFlowState({mode:'refund',settled:true},win),win);
});

test('compact guidance keeps the blind draw readable then hides routine transfers',()=>{
 const element={dataset:{},hidden:false,classList:{add(){}},setAttribute(){},innerHTML:''};
 const panel=createActionFlow({root:{getElementById:()=>element},compact:true});
 panel.setBlindDraw({phase:'drawing'});
 panel.render({mode:'contribution',label:'POST BLINDS'});
 assert.equal(element.hidden,false);
 assert.match(element.innerHTML,/DRAWING YOUR BLIND/);
 panel.setBlindDraw({phase:'revealed',isSmall:true,smallBlind:1,bigBlind:2});
 assert.match(element.innerHTML,/YOU · SMALL BLIND/);
 panel.setBlindDraw(null);
 assert.equal(element.hidden,true);
 panel.render({mode:'board-deal',label:'FLOP'});
 assert.equal(element.hidden,false);assert.match(element.innerHTML,/DEAL FLOP/);
 panel.render({mode:'action',label:'OPPONENT CHECK',seat:'npc'});
 assert.equal(element.hidden,true);
 panel.render({playing:true,actor:'player'});
 assert.equal(element.hidden,false);assert.match(element.innerHTML,/YOUR TURN/);
});

test('compact decision choreography bounds waiting without altering the sampled marker',()=>{
 for(const duration of [0,100,850,30000]){
  const motion=decisionMotion(duration,.731,{compact:true});
  assert.ok(motion.duration>=0&&motion.duration<=450);
  assert.equal(motion.keyframes.at(-1).left,'73.1%');
 }
 assert.equal(decisionMotion(850,.731,{compact:true,reducedMotion:true}).duration,0);
 assert.equal(decisionMotion(0,.731,{compact:true}).duration,0);
});
