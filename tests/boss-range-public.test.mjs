import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_CONFIG} from '../src/engine.mjs';
import {bossRangeContext} from '../src/boss-range-public.mjs';
import {createBossRangeController} from '../src/boss-range-controller.mjs';

test('worker context contains only known cards and public settings, never reserved NPC cards',()=>{
 const secret={get 0(){throw new Error('Hidden card read');},get 1(){throw new Error('Hidden card read');},length:2};
 const config={...DEFAULT_CONFIG,deal:{...DEFAULT_CONFIG.deal,npc:{...DEFAULT_CONFIG.deal.npc,manual:secret}},
  get seed(){throw new Error('Seed read');},get deck(){throw new Error('Deck read');}};
 const result=bossRangeContext({playerHole:['As','Kd'],smallBlind:'npc',bossProfileId:'caller',config});
 assert.equal(result.config.deal.npc.manualProvided,true);
 assert.deepEqual(result.playerHole,['As','Kd']);
 assert.equal(JSON.stringify(result).includes('manual"'),false);
 assert.deepEqual(Object.keys(result),['playerHole','smallBlind','config']);
 assert.deepEqual(Object.keys(result.config),['deal']);
});

test('card-only context never reads BOSS identity, action tables or displayed odds',()=>{
 const config={deal:DEFAULT_CONFIG.deal};
 for(const key of ['boss','npc'])Object.defineProperty(config,key,{get(){throw Error('Action model read');}});
 const input={playerHole:['As','Kd'],smallBlind:'player',config};
 for(const key of ['bossProfileId','evidence','distribution','history'])Object.defineProperty(input,key,{get(){throw Error('Action evidence read');}});
 assert.deepEqual(bossRangeContext(input),bossRangeContext({playerHole:['As','Kd'],smallBlind:'player',config:DEFAULT_CONFIG}));
});

function setup(){
 const messages=[],paints=[];
 const worker={postMessage:data=>messages.push(structuredClone(data)),terminate(){}};
 const view={render:data=>paints.push(data),clear(){paints.push({visible:false});},close(){}};
 return {controller:createBossRangeController({view,workerFactory:()=>worker}),worker,messages,paints};
}
test('late worker output cannot restore an old street or hand',()=>{
 const {controller,worker,messages,paints}=setup();
 const context={playerHole:['As','Kd']};
 const initial={visible:true,busy:false,context,board:['2s','5h','9c'],evidence:[]};
 controller.update(initial);const first=messages.at(-1);
 controller.update({...initial,board:[...initial.board,'3h']});const revised=messages.at(-1);
 worker.onmessage({data:{...first,result:{distribution:[{category:8,probability:1}]}}});
 assert.equal(paints.at(-1).calculating,true);
 worker.onmessage({data:{...revised,result:{distribution:[{category:1,probability:1}]}}});
 assert.equal(paints.at(-1).distribution[0].category,1);
 controller.update({...initial,visible:false,board:[...initial.board,'3h','4c']});
 assert.deepEqual(paints.at(-1).distribution,[]);
 controller.reset();
 worker.onmessage({data:{...messages.at(-1),result:{distribution:[{category:8,probability:1}]}}});
 assert.equal(paints.at(-1).visible,false);
 controller.update(initial);const next=messages.at(-1);
 assert.notEqual(next.epoch,first.epoch);
 worker.onmessage({data:{...revised,result:{distribution:[{category:8,probability:1}]}}});
 assert.equal(paints.at(-1).calculating,true);
});

test('same-street actions and odds do not recompute or enter the worker; failures never become invented odds',()=>{
 const {controller,worker,messages,paints}=setup();
 const state={visible:true,busy:false,context:{},board:['2s','5h','9c'],evidence:[]};
 controller.update(state);controller.update({...state,busy:true});
 controller.update({...state,evidence:[{id:'new-action',selectedType:'raise',shown:[{type:'fold',label:'75.0%'}]}]});
 assert.equal(messages.length,1);
 assert.deepEqual(Object.keys(messages[0]),['epoch','request','context','board']);
 worker.onerror();
 assert.equal(paints.at(-1).unavailable,'calculation-unavailable');
 assert.deepEqual(paints.at(-1).distribution,[]);
});
