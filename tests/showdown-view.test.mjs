import test from 'node:test';
import assert from 'node:assert/strict';
import {getShowdownView} from '../src/showdown-view.mjs';

const visible={playerHole:['As','Ad'],visibleBoard:['2c','7d','9h','Js','Qc'],revealedNpcHole:['Kc']};

test('incomplete board or unrevealed opponent returns no showdown view',()=>{
  for(const length of [0,1,2,3,4]) assert.equal(getShowdownView({...visible,visibleBoard:visible.visibleBoard.slice(0,length)}),null);
  assert.equal(getShowdownView({...visible,revealedNpcHole:[]}),null);
});

test('one revealed card enumerates exactly 44 unknown cards and cannot read the actual second card',()=>{
  const input={...visible};
  for(const key of ['hand','deck','seed','actualNpcHole','rng']) Object.defineProperty(input,key,{get(){throw new Error('Hidden state read: '+key);}});
  const view=getShowdownView(input);
  // Only the four tens give Kc a straight; all other unknown cards lose to AA.
  assert.equal(view.outcomes,44); assert.equal(view.wins,40); assert.equal(view.losses,4); assert.equal(view.ties,0);
  assert.equal(view.equity,40/44); assert.equal(view.npcHandName,'High Card');
  assert.deepEqual(new Set(view.npcBest5),new Set(['Kc','Qc','Js','9h','7d']));
  assert.equal(getShowdownView({...visible,revealedNpcHole:['Kc','Ts']}).equity,0);
  assert.equal(getShowdownView({...visible,revealedNpcHole:['Kc','3s']}).equity,1);
  assert.deepEqual(getShowdownView(input),view,'actual second-card alternatives never change the one-card view');
});

test('both revealed cards give exact win, loss or half-value tie',()=>{
  const win=getShowdownView({...visible,revealedNpcHole:['Kc','3s']});
  const loss=getShowdownView({...visible,revealedNpcHole:['Kc','Ts']});
  const tie=getShowdownView({playerHole:['2c','3d'],visibleBoard:['As','Kh','Qd','Jc','Ts'],revealedNpcHole:['4c','5d']});
  assert.deepEqual([win.equity,loss.equity,tie.equity],[1,0,.5]);
  for(const view of [win,loss,tie]){assert.equal(view.outcomes,1);assert.equal(view.revealedCount,2);assert.equal(view.wins+view.ties+view.losses,1);}
});

test('one-card board-only ties count as half across all 44 alternatives',()=>{
  const view=getShowdownView({playerHole:['2c','3d'],visibleBoard:['As','Ks','Qs','Js','Ts'],revealedNpcHole:['4c']});
  assert.equal(view.outcomes,44);assert.equal(view.ties,44);assert.equal(view.equity,.5);
  assert.equal(view.npcHandName,'Royal Flush');
});

test('opponent best five include all comparison kickers and only revealed cards',()=>{
  const input={playerHole:['Qh','Qd'],visibleBoard:['Ah','Ad','7c','5d','2s'],revealedNpcHole:['As','Kc']};
  const one=getShowdownView({...input,revealedNpcHole:['As']});
  assert.equal(one.npcHandName,'Three of a Kind');assert.deepEqual(new Set(one.npcBest5),new Set(['As','Ah','Ad','7c','5d']));
  const two=getShowdownView(input);
  assert.deepEqual(new Set(two.npcBest5),new Set(['As','Ah','Ad','Kc','7c']));
  assert.equal(two.npcBest5.length,5);assert.ok(two.npcBest5.includes('Kc'));
});

test('visible inputs are immutable, deterministic and validated for legal unique cards',()=>{
  const input=Object.freeze(Object.fromEntries(Object.entries(visible).map(([key,value])=>[key,Object.freeze([...value])])));
  const snapshot=JSON.stringify(input),a=getShowdownView(input),b=getShowdownView(input);
  assert.equal(JSON.stringify(input),snapshot);assert.deepEqual(a,b);
  a.npcBest5[0]='edited';assert.notDeepEqual(a.npcBest5,getShowdownView(input).npcBest5);
  assert.throws(()=>getShowdownView({...visible,revealedNpcHole:['As']}),/unique/);
  assert.throws(()=>getShowdownView({...visible,revealedNpcHole:['JOKER']}),/無效/);
  assert.throws(()=>getShowdownView({...visible,revealedNpcHole:['Kc','Ts','3s']}),/zero, one or two/);
  assert.throws(()=>getShowdownView({...visible,visibleBoard:[...visible.visibleBoard,'3s']}),/exactly five/);
  assert.throws(()=>getShowdownView({...visible,playerHole:['As']}),/two visible/);
});
