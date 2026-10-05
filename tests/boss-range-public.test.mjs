import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_CONFIG} from '../src/engine.mjs';
import {bossRangeContext,publicBossEvidence} from '../src/boss-range-public.mjs';
import {createBossRangeController} from '../src/boss-range-controller.mjs';

test('worker context contains only known cards and public settings, never reserved NPC cards',()=>{
 const secret={get 0(){throw new Error('Hidden card read');},get 1(){throw new Error('Hidden card read');},length:2};
 const config={...DEFAULT_CONFIG,deal:{...DEFAULT_CONFIG.deal,npc:{...DEFAULT_CONFIG.deal.npc,manual:secret}},
  get seed(){throw new Error('Seed read');},get deck(){throw new Error('Deck read');}};
 const result=bossRangeContext({playerHole:['As','Kd'],smallBlind:'npc',bossProfileId:'caller',config});
 assert.equal(result.config.deal.npc.manualProvided,true);
 assert.deepEqual(result.playerHole,['As','Kd']);
 assert.equal(JSON.stringify(result).includes('manual"'),false);
 assert.deepEqual(Object.keys(result),['playerHole','smallBlind','bossProfileId','config']);
});

test('public evidence preserves rounded visible labels without hidden precision or draw result',()=>{
 const input={id:'a',street:'flop',board:['2s','5h','9c'],owed:1,pot:4,
  distribution:[{type:'fold',probability:.0005,roll:.123},{type:'call',probability:.77604},{type:'raise',probability:.22346}]};
 const badges=publicBossEvidence(input);
 assert.deepEqual(badges.shown,[{type:'fold',label:'<0.1%'},{type:'raise',label:'22.3%'}]);
 assert.deepEqual(badges.actions,[{type:'fold'},{type:'call'},{type:'raise'}]);
 assert.equal(JSON.stringify(badges).includes('probability'),false);
 assert.equal(JSON.stringify(badges).includes('roll'),false);
 const all=publicBossEvidence({...input,shownMode:'all'});
 assert.deepEqual(all.shown.map(item=>item.label),['<0.1%','77.6%','22.3%']);
});

function setup(){
 const messages=[],paints=[];
 const worker={postMessage:data=>messages.push(structuredClone(data)),terminate(){}};
 const view={render:data=>paints.push(data),clear(){paints.push({visible:false});},close(){}};
 return {controller:createBossRangeController({view,workerFactory:()=>worker}),worker,messages,paints};
}
test('late worker output cannot restore an old street, evidence revision, or hand',()=>{
 const {controller,worker,messages,paints}=setup();
 const context={playerHole:['As','Kd']};
 const initial={visible:true,busy:false,context,board:['2s','5h','9c'],evidence:[]};
 controller.update(initial);const first=messages.at(-1);
 controller.update({...initial,evidence:[{id:'action:3'}]});const revised=messages.at(-1);
 worker.onmessage({data:{...first,result:{distribution:[{category:8,probability:1}]}}});
 assert.equal(paints.at(-1).calculating,true);
 worker.onmessage({data:{...revised,result:{distribution:[{category:1,probability:1}]}}});
 assert.equal(paints.at(-1).distribution[0].category,1);
 controller.update({...initial,visible:false,board:[...initial.board,'3h']});
 assert.deepEqual(paints.at(-1).distribution,[]);
 controller.reset();
 worker.onmessage({data:{...messages.at(-1),result:{distribution:[{category:8,probability:1}]}}});
 assert.equal(paints.at(-1).visible,false);
 controller.update(initial);const next=messages.at(-1);
 assert.notEqual(next.epoch,first.epoch);
 worker.onmessage({data:{...revised,result:{distribution:[{category:8,probability:1}]}}});
 assert.equal(paints.at(-1).calculating,true);
});

test('ordinary busy renders do not recompute; worker failures never become invented odds',()=>{
 const {controller,worker,messages,paints}=setup();
 const state={visible:true,busy:false,context:{},board:['2s','5h','9c'],evidence:[]};
 controller.update(state);controller.update({...state,busy:true});
 assert.equal(messages.length,1);
 worker.onerror();
 assert.equal(paints.at(-1).unavailable,'calculation-unavailable');
 assert.deepEqual(paints.at(-1).distribution,[]);
});
