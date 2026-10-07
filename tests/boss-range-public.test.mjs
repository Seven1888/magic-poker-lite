import test from 'node:test';
import assert from 'node:assert/strict';
import {bossRangeContext} from '../src/boss-range-public.mjs';
import {createBossRangeController} from '../src/boss-range-controller.mjs';

test('worker context contains only a detached copy of the known player cards',()=>{
 const playerHole=['As','Kd'];
 const result=bossRangeContext({playerHole,smallBlind:'npc',bossProfileId:'caller',config:{deal:{npc:{manual:['2s','2h']}}}});
 assert.deepEqual(result,{playerHole:['As','Kd']});
 assert.notEqual(result.playerHole,playerHole);
 playerHole[0]='3s';
 assert.deepEqual(result.playerHole,['As','Kd']);
});

test('standard Holdem context never reads settings, blind position, manual cards, BOSS identity or action evidence',()=>{
 const input={playerHole:['As','Kd']};
 for(const key of ['config','smallBlind','manualProvided','manual','bossProfileId','evidence','distribution','history','deck','rng','seed'])Object.defineProperty(input,key,{get(){throw Error(`Private or model input read: ${key}`);}});
 assert.deepEqual(bossRangeContext(input),{playerHole:['As','Kd']});
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

test('preflop requests are asynchronous, reuse their result across actions and pass the starting-hand basis to the view',()=>{
 const {controller,worker,messages,paints}=setup();
 const context={playerHole:['As','Kd'],npcHole:['2s','2h'],deck:['3s'],rng:'private'};
 const state={visible:true,busy:false,context,board:[]};
 controller.update(state);
 assert.equal(messages.length,1);
 assert.deepEqual(messages[0].context,{playerHole:['As','Kd']});
 assert.deepEqual(messages[0].board,[]);
 assert.equal(paints.at(-1).calculating,true);
 assert.equal(paints.at(-1).basis,'starting-hand');
 const result={status:'ready',exact:true,candidateCount:1225,basis:'starting-hand',
  distribution:[{category:0,probability:1153/1225},{category:1,probability:72/1225}]};
 worker.onmessage({data:{...messages[0],result}});
 assert.equal(paints.at(-1).calculating,false);
 assert.equal(paints.at(-1).basis,'starting-hand');
 assert.deepEqual(paints.at(-1).distribution,result.distribution);
 controller.update({...state,busy:true});
 assert.equal(messages.length,1);
 assert.deepEqual(paints.at(-1).distribution,result.distribution);
 controller.update({...state,board:['2s','5h','9c']});
 assert.equal(messages.length,2);
 assert.equal(paints.at(-1).basis,'made-hand');
 assert.deepEqual(paints.at(-1).distribution,[]);
});

test('new player cards with the same empty board invalidate an old preflop calculation',()=>{
 const {controller,worker,messages,paints}=setup();
 const state={visible:true,busy:false,context:{playerHole:['As','Kd']},board:[]};
 controller.update(state);const first=messages.at(-1);
 controller.update({...state,context:{playerHole:['As','Ah']}});const second=messages.at(-1);
 assert.equal(messages.length,2);
 assert.notEqual(second.request,first.request);
 worker.onmessage({data:{...first,result:{basis:'starting-hand',distribution:[{category:1,probability:72/1225}]}}});
 assert.equal(paints.at(-1).calculating,true);
 worker.onmessage({data:{...second,result:{basis:'starting-hand',distribution:[{category:1,probability:73/1225}]}}});
 assert.equal(paints.at(-1).distribution[0].probability,73/1225);
});
