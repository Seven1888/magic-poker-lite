import test from 'node:test';
import assert from 'node:assert/strict';
import {responseDistributionView,createResponseFlight} from '../src/response-flight-view.mjs';
import {responseBadgeView} from '../src/action-response-view.mjs';

const distribution=Object.freeze([
 {type:'fold',probability:.143},{type:'call',probability:.571},{type:'raise',probability:.286}
].map(Object.freeze));

test('central draw includes the missing CALL probability and only highlights the actual CALL result',()=>{
 const before=JSON.stringify(distribution);
 const view=responseDistributionView(distribution,{phase:'result',selected:'call',roll:.5});
 assert.equal(view.count,3);
 assert.match(view.markup,/data-response="call" data-probability="0.571"/);
 assert.match(view.markup,/>57.1%<\/b>/);
 assert.match(view.markup,/is-selected" data-response="call"/);
 assert.equal((view.markup.match(/is-selected/g)||[]).length,1);
 assert.match(view.markup,/r="10"/,'CALL has a chip icon');
 assert.match(view.markup,/style="flex:0 0 57.099999999999994%"/,'segment uses its raw probability rather than equal widths');
 assert.match(view.markup,/response-result-marker" style="left:50%"/);
 assert.doesNotMatch(responseBadgeView(distribution).markup,/data-response="call"/,'button previews retain FOLD/RAISE only');
 assert.equal(JSON.stringify(distribution),before);
});

test('central draw displays CHECK/BET using exact names, widths and selection',()=>{
 const view=responseDistributionView([{type:'check',probability:.0004},{type:'bet',probability:.3996},
  {type:'fold',probability:0},{type:'call',probability:-.1},{type:'raise',probability:NaN}],{phase:'result',selected:'bet'});
 assert.equal(view.count,2);
 assert.match(view.markup,/>CHECK<\/span>/);
 assert.match(view.markup,/>BET<\/span>/);
 assert.match(view.markup,/data-probability="0.0004"/);
 assert.match(view.markup,/&lt;0.1%/);
 assert.match(view.markup,/>40.0%<\/b>/,'the raw .3996 is formatted, never rescaled to the positive sum');
 assert.match(view.markup,/is-selected" data-response="bet"/);
 assert.match(view.markup,/style="flex:0 0 0.04%"/,'tiny segments keep their true width');
 assert.match(view.markup,/is-tiny" data-response="check"/,'tiny sections hide their own text while preserving their colour');
 assert.doesNotMatch(view.markup,/response-track-legend/,'tiny outcomes do not create external captions');
 const narrow=responseDistributionView([{type:'fold',probability:.03},{type:'call',probability:.92},{type:'raise',probability:.05}]);
 assert.match(narrow.markup,/is-tiny" data-response="fold" data-probability="0.03" style="flex:0 0 3%"/);
 assert.match(narrow.markup,/is-tiny" data-response="raise" data-probability="0.05" style="flex:0 0 5%"/);
 assert.match(narrow.markup,/action-response-badge" data-response="call" data-probability="0.92" style="flex:0 0 92%"/);
 assert.doesNotMatch(narrow.markup,/response-track-legend/);
 assert.doesNotMatch(view.markup,/>CALL<|>RAISE</);
 assert.deepEqual(responseDistributionView([]),{count:0,markup:''});
});

test('three raise sizes animate as one action segment without mutating engine probabilities',()=>{
 const sized=Object.freeze([{type:'fold',probability:.05},{type:'call',probability:.25},
  {type:'raise',id:'raise:half',amount:30,probability:.35},
  {type:'raise',id:'raise:pot',amount:50,probability:.245},
  {type:'raise',id:'raise:allin',amount:100,probability:.105}].map(Object.freeze));
 const before=JSON.stringify(sized),view=responseDistributionView(sized,{phase:'result',selected:'raise',roll:.6});
 assert.equal(view.count,3);
 assert.equal((view.markup.match(/data-response="raise"/g)||[]).length,1);
 assert.match(view.markup,/>70.0%<\/b>/);
 assert.match(view.markup,/response-result-marker" style="left:60%"/);
 assert.equal((view.markup.match(/is-selected/g)||[]).length,1);
 assert.equal(JSON.stringify(sized),before);
});

function fixture(){
 const nodes=[],animations=[];
 const stage={dataset:{},offsetWidth:400,children:[],
  getBoundingClientRect:()=>({left:0,top:0,width:400,height:860}),append(node){this.children.push(node);}};
 const root={getElementById:()=>stage,createElement(){
  const node={dataset:{},style:{},children:[],innerHTML:'',removed:false,setAttribute(){},
   append(child){this.children.push(child);},remove(){this.removed=true;},
   querySelector(selector){return selector==='.action-response-badges'&&this.innerHTML?this:null;},
   getBoundingClientRect(){const width=parseFloat(this.style.width);return {left:200-width/2,right:200+width/2,top:320,bottom:384,width,height:64};}};
  nodes.push(node);return node;
 }};
 const source={querySelectorAll:()=>[
  {getBoundingClientRect:()=>({left:30,right:70,top:700,bottom:727})},
  {getBoundingClientRect:()=>({left:80,right:120,top:700,bottom:727})}
 ]};
 const effects={animate(node,frames,options){let resolve;const done=new Promise(r=>{resolve=r;});animations.push({node,frames,options,resolve});return done;}};
 return {root,stage,nodes,source,effects,animations};
}

test('three central outcomes grow from the full floating BOSS preview and await flight before readiness',async()=>{
 const f=fixture(),flight=createResponseFlight(f);
 f.source.matches=selector=>selector==='.action-response-preview';
 f.source.getBoundingClientRect=()=>({left:30,right:120,top:689,bottom:727});
 const pending=flight.launch(f.source,distribution),panel=f.nodes[1];
 assert.equal(f.stage.dataset.responseFlight,'flying');
 assert.equal(panel.style.width,'360px');
 assert.equal(panel.dataset.outcomeCount,'3');
 assert.match(panel.innerHTML,/data-response="call"/);
 assert.match(f.animations[0].frames[0].transform,/translate\(-125px,356px\)/);
 assert.ok(f.animations[0].frames[0].transform.includes(`scale(${90/360},${38/64})`),'the source bounds include its BOSS heading');
 f.animations[0].resolve();assert.equal(await pending,true);
 assert.equal(f.stage.dataset.responseFlight,'ready');
 flight.update(distribution,{phase:'drawing'});
 assert.equal(f.stage.dataset.responseFlight,'drawing');
 assert.equal(flight.target(),panel,'the existing sweep target API still points to all outcomes');
 flight.update(distribution,{phase:'result',selected:'call'});
 assert.match(panel.innerHTML,/is-selected" data-response="call"/);
 assert.equal(f.stage.dataset.responseFlight,'result');
});

test('clearing an old flight prevents readiness and reduced motion still shows the full distribution',async()=>{
 const f=fixture(),flight=createResponseFlight(f);
 const pending=flight.launch(f.source,distribution);
 flight.clear();f.animations[0].resolve();
 assert.equal(await pending,false);assert.equal(f.stage.dataset.responseFlight,undefined);assert.equal(flight.target(),null);
 const reduced=createResponseFlight({...f,reducedMotion:true});
 assert.equal(await reduced.launch(f.source,distribution),true);
 assert.equal(f.animations.length,1,'reduced motion does not start another animation');
 assert.equal(f.stage.dataset.responseFlight,'ready');
 assert.match(reduced.target().innerHTML,/>57.1%<\/b>/);
});

test('an NPC first action can show its full raw distribution synchronously without a preview or animation',()=>{
 const f=fixture(),flight=createResponseFlight(f),before=JSON.stringify(distribution);
 const decision=Object.freeze({phase:'result',selected:'call',roll:.62});
 assert.equal(flight.show(distribution,decision),true);
 const panel=f.nodes[1];
 assert.equal(f.stage.dataset.responseFlight,'result');
 assert.equal(panel.style.width,'360px');
 assert.equal(panel.dataset.outcomeCount,'3');
 assert.equal(flight.target(),panel);
 assert.match(panel.innerHTML,/data-response="call" data-probability="0.571"/);
 assert.match(panel.innerHTML,/style="flex:0 0 57.099999999999994%"/);
 assert.match(panel.innerHTML,/response-result-marker" style="left:62%"/,'direct display retains the sampled roll rather than centring the selected outcome');
 assert.equal(f.animations.length,0);
 assert.equal(JSON.stringify(distribution),before);
 assert.deepEqual(decision,{phase:'result',selected:'call',roll:.62});
});

test('a direct new-street decision replaces an in-flight preview without its old completion taking over',async()=>{
 const f=fixture(),flight=createResponseFlight(f);
 const pending=flight.launch(f.source,distribution),oldLayer=f.nodes[0];
 const next=Object.freeze([{type:'check',probability:.7},{type:'bet',probability:.3}].map(Object.freeze));
 assert.equal(flight.show(next,{phase:'drawing'}),true);
 const panel=flight.target();
 assert.equal(oldLayer.removed,true);
 assert.equal(f.stage.dataset.responseFlight,'drawing');
 assert.match(panel.innerHTML,/>CHECK<\/span>/);
 assert.doesNotMatch(panel.innerHTML,/data-response="call"/);
 f.animations[0].resolve();
 assert.equal(await pending,false);
 assert.equal(f.stage.dataset.responseFlight,'drawing');
 assert.equal(flight.target(),panel);
 assert.equal(f.animations.length,1,'show does not add a second flight');
});

test('empty direct displays and updates remove prior decisions instead of leaving a misleading active panel',async()=>{
 const f=fixture(),flight=createResponseFlight(f);
 assert.equal(flight.show(distribution),true);
 assert.equal(f.stage.dataset.responseFlight,'ready');
 const oldLayer=f.nodes[0];
 assert.equal(flight.show([{type:'fold',probability:0},{type:'raise',probability:NaN}]),false);
 assert.equal(oldLayer.removed,true);
 assert.equal(flight.target(),null);
 assert.equal(f.stage.dataset.responseFlight,undefined);
 assert.equal(flight.show(distribution),true);
 flight.update([]);
 assert.equal(flight.target(),null);
 assert.equal(f.stage.dataset.responseFlight,undefined);
 assert.equal(await flight.launch(f.source,[]),false);
 assert.equal(flight.target(),null);
 assert.equal(f.stage.dataset.responseFlight,undefined);
 assert.equal(f.animations.length,0);
 const absent=createResponseFlight({root:{getElementById:()=>null}});
 assert.equal(absent.show(distribution),false);
});

test('a forced NPC outcome is a single static 100 percent result with no invented sweep',()=>{
 const f=fixture(),flight=createResponseFlight(f);
 assert.equal(flight.show([{type:'check',probability:1}],{phase:'result',selected:'check'}),true);
 assert.equal(f.stage.dataset.responseFlight,'result');
 assert.equal(flight.target().dataset.outcomeCount,'1');
 assert.match(flight.target().innerHTML,/is-selected" data-response="check" data-probability="1" style="flex:0 0 100%"/);
 assert.match(flight.target().innerHTML,/>100.0%<\/b>/);
 assert.doesNotMatch(flight.target().innerHTML,/action-response-sweep/);
 assert.equal(f.animations.length,0);
});
