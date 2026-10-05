import test from 'node:test';
import assert from 'node:assert/strict';
import {createHoldemEquityController} from '../src/holdem-equity-controller.mjs';

function setup(){
 const workers=[],paints=[];
 const controller=createHoldemEquityController({render:state=>paints.push(state),workerFactory:()=>{
  const worker={messages:[],terminated:false,postMessage(data){this.messages.push(data);},terminate(){this.terminated=true;}};
  workers.push(worker);return worker;
 }});
 return {controller,workers,paints};
}
const flop={visible:true,playerHole:['As','Kd'],board:['2h','7d','Tc']};
test('new board cancels old computation; late output cannot overwrite the current board or hand',()=>{
 const {controller,workers,paints}=setup();
 controller.update(flop);const old=workers[0],first=old.messages[0];
 controller.update({...flop,board:[...flop.board,'Jh']});const current=workers[1],next=current.messages[0];
 assert.equal(old.terminated,true);assert.equal(paints.at(-1).result,null);
 old.onmessage({data:{request:first.request,result:{equity:.9}}});assert.equal(paints.at(-1).calculating,true);
 current.onmessage({data:{request:next.request,result:{equity:.6}}});assert.equal(paints.at(-1).result.equity,.6);
 controller.reset();current.onmessage({data:{request:next.request,result:{equity:1}}});assert.equal(paints.at(-1).visible,false);
 controller.update(flop);assert.notEqual(workers[2].messages[0].request,first.request);
});
test('same visible cards retain the result regardless of betting and workers receive only copied known cards',()=>{
 const {controller,workers,paints}=setup();
 const input={...flop};Object.defineProperty(input,'hand',{get(){throw Error('private hand read');}});
 controller.update(input);const task=workers[0],request=task.messages[0];
 assert.deepEqual(Object.keys(request),['request','playerHole','board']);
 assert.notEqual(request.playerHole,flop.playerHole);assert.notEqual(request.board,flop.board);
 task.onmessage({data:{request:request.request,result:{equity:.6}}});
 controller.update({...flop,evidence:[{selectedType:'raise'}]});
 assert.equal(workers.length,1);assert.equal(paints.at(-1).result.equity,.6);
 controller.update({...flop,visible:false});assert.equal(paints.at(-1).result,null);
});
test('worker failure clears equity instead of retaining a stale percentage',()=>{
 const {controller,workers,paints}=setup();controller.update(flop);workers[0].onerror();
 assert.equal(paints.at(-1).error,'calculation-unavailable');assert.equal(paints.at(-1).result,null);
 assert.equal(workers[0].terminated,true);
});
