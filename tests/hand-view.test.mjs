import test from 'node:test';
import assert from 'node:assert/strict';
import {getCurrentHandView} from '../src/hand-view.mjs';
import {decisionMotion} from '../src/decision-motion.mjs';

test('current pair glows before showdown with all three kickers',()=>{
 const view=getCurrentHandView(['Ah','Kc'],['As','8d','3s']);
 assert.equal(view.name,'Pair');assert.deepEqual(new Set(view.highlighted),new Set(['Ah','As','Kc','8d','3s']));
 const boardPair=getCurrentHandView(['Ah','Kc'],['8s','8d','3s']);
 assert.deepEqual(new Set(boardPair.highlighted),new Set(['8s','8d','Ah','Kc','3s']));
});
test('every complete named hand highlights exactly five cards, including its kickers',()=>{
 const cases=[
  [['Ah','Kd'],['As','Kc','2d'],'Two Pair',5],
  [['Ah','Ad'],['As','Kc','2d'],'Three of a Kind',5],
  [['Ah','Ad'],['As','Ac','2d'],'Four of a Kind',5],
  [['Ah','Ad'],['As','Kc','Kd'],'Full House',5],
  [['Ah','2d'],['3s','4c','5d'],'Straight',5],
  [['Ah','Jh'],['8h','5h','2h'],'Flush',5],
  [['9h','8h'],['7h','6h','5h'],'Straight Flush',5],
  [['Ah','Kh'],['Qh','Jh','Th'],'Royal Flush',5],
 ];
 for(const [holes,board,name,count] of cases){const v=getCurrentHandView(holes,board);assert.equal(v.name,name);assert.equal(v.highlighted.length,count);assert.ok(v.highlighted.every(c=>[...holes,...board].includes(c)));}
});
test('only visible cards upgrade the highlight and inputs remain unchanged',()=>{
 const holes=Object.freeze(['Ah','Ad']),flop=Object.freeze(['8s','Kc','2d']);
 assert.equal(getCurrentHandView(holes,flop).name,'Pair');
 assert.equal(getCurrentHandView(holes,[...flop,'As']).name,'Three of a Kind');
 assert.deepEqual(getCurrentHandView(['As','Ks'],[]).highlighted,['As','Ks']);
 assert.deepEqual(getCurrentHandView(['8h','8c'],[]).highlighted,['8h','8c']);
 assert.deepEqual(getCurrentHandView().highlighted,[]);
 assert.equal(getCurrentHandView(['2d','3c'],['As','Ks','Qs','Js','Ts']).highlighted.length,5);
});
test('partial flops evaluate only the three or four visible cards without requiring a complete flop',()=>{
 const cases=[
  [['Ah','Ad'],['As'],3,'Three of a Kind',['Ah','Ad','As']],
  [['Ah','Ad'],['As','Ac'],7,'Four of a Kind',['Ah','Ad','As','Ac']],
  [['Kh','Ah'],['Ks','Ad'],2,'Two Pair',['Kh','Ah','Ks','Ad']],
  [['2h','3d'],['As'],0,'High Card',['2h','3d','As']],
  [['2h','3d'],['Qs','Ad'],0,'High Card',['2h','3d','Qs','Ad']],
  [['Ah','Kd'],['As','2c'],1,'Pair',['Ah','Kd','As','2c']],
  [['Ah','Kh'],['Qh','Jh'],0,'High Card',['Ah','Kh','Qh','Jh']],
 ];
 for(const [holeCards,boardCards,category,name,highlighted] of cases){
  const holes=Object.freeze([...holeCards]),board=Object.freeze([...boardCards]);
  const view=getCurrentHandView(holes,board);
  assert.equal(view.category,category);assert.equal(view.name,name);assert.equal(view.royal,false);
  assert.deepEqual(view.highlighted,highlighted);
  assert.deepEqual(holes,holeCards);assert.deepEqual(board,boardCards);
 }
 assert.deepEqual(getCurrentHandView(Object.freeze(['Ah']),Object.freeze(['As','Ad'])),{category:0,royal:false,name:'Your Hand',highlighted:[]});
});

test('highlights grow through each visible deal then stay at five on turn and river',()=>{
 const holes=Object.freeze(['Ah','Ad']),publicCards=['Ks','Qc','8d','3c','2s'];
 for(let revealed=0;revealed<=5;revealed++){
  const board=Object.freeze(publicCards.slice(0,revealed)),view=getCurrentHandView(holes,board);
  const expected=['Ah','Ad',...publicCards.slice(0,Math.min(revealed,3))];
  assert.equal(view.name,'Pair');
  assert.equal(view.highlighted.length,Math.min(2+revealed,5));
  assert.equal(new Set(view.highlighted).size,view.highlighted.length);
  assert.deepEqual(new Set(view.highlighted),new Set(expected));
  assert.ok(view.highlighted.every(card=>[...holes,...board].includes(card)));
  assert.deepEqual(holes,['Ah','Ad']);
  assert.deepEqual(board,publicCards.slice(0,revealed));
 }
});

test('river best five include only the strongest required kickers for each rank',()=>{
 const cases=[
  [['Ah','Kd'],['Qs','Jc','9d','3c','2s'],'High Card',['Ah','Kd','Qs','Jc','9d']],
  [['Ah','Ad'],['Ks','Qc','8d','3c','2s'],'Pair',['Ah','Ad','Ks','Qc','8d']],
  [['Ah','Kd'],['As','Kc','Qd','3c','2s'],'Two Pair',['Ah','As','Kd','Kc','Qd']],
  [['Ah','Ad'],['As','Kc','Qd','3c','2s'],'Three of a Kind',['Ah','Ad','As','Kc','Qd']],
  [['Ah','Ad'],['As','Ac','Kd','3c','2s'],'Four of a Kind',['Ah','Ad','As','Ac','Kd']],
  [['2d','3c'],['As','Ks','Qs','Js','Ts'],'Royal Flush',['As','Ks','Qs','Js','Ts']],
 ];
 for(const [holes,board,name,expected] of cases){
  const view=getCurrentHandView(holes,board);
  assert.equal(view.name,name);
  assert.equal(view.highlighted.length,5);
  assert.deepEqual(new Set(view.highlighted),new Set(expected));
 }
});
test('decision sweep adds half a second, reverses repeatedly and ends at the sampled position',()=>{
 for(const ms of [0,850,3000]){
  const motion=decisionMotion(ms,.703);
  assert.equal(motion.duration,ms+500);
  assert.ok(motion.keyframes.filter(x=>x.left==='98%').length>=4);
  assert.equal(motion.keyframes.at(-1).left,'70.3%');
  assert.ok(motion.keyframes.every((frame,i,frames)=>!i||frame.offset>=frames[i-1].offset));
 }
 assert.equal(decisionMotion(850,.2,{reducedMotion:true}).duration,0);
 assert.throws(()=>decisionMotion(850,1),/Invalid/);
});
