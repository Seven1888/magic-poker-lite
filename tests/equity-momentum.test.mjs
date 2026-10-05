import test from 'node:test';
import assert from 'node:assert/strict';
import {createEquityMomentum, equityMomentumChange} from '../src/equity-momentum.mjs';

function harness(options = {}) {
  const elements = [], sounds = [], timers = new Map(), cancelled = [];
  let sequence = 0;
  const document = {createElement(tag) {
    const element = {tag, children:[], dataset:{}, attributes:{}, hidden:false, textContent:'', offsetWidth:286,
      setAttribute(key,value) { this.attributes[key] = value; },
      removeAttribute(key) { delete this.attributes[key]; },
      append(...children) { this.children.push(...children); },
      remove() { this.removed = true; },
    };
    elements.push(element);
    return element;
  }};
  const ring = document.createElement('output');
  const root = {ownerDocument:document, append(element) { this.cue = element; }, querySelector() { return ring; }};
  const momentum = createEquityMomentum({root, effects:{play:name=>sounds.push(name)}, timers:{
    setTimeout(callback,ms) { const id = ++sequence; timers.set(id,{callback,ms}); return id; },
    clearTimeout(id) { cancelled.push(id); },
  }, ...options});
  return {momentum, root, ring, sounds, timers, cancelled, elements};
}

test('lead changes use equity advantage with a neutral 50% boundary, not winner language', () => {
  assert.equal(equityMomentumChange(null,.8), null);
  assert.equal(equityMomentumChange(.45,.49), null);
  assert.equal(equityMomentumChange(.4,.5).title, 'EQUITY UP');
  assert.equal(equityMomentumChange(.5,.51).title, 'TAKE THE LEAD');
  assert.equal(equityMomentumChange(.51,.5), null);
  assert.equal(equityMomentumChange(.5,.49), null);
  assert.equal(equityMomentumChange(.5,.49,1).title, 'BOSS TAKES LEAD');
  const down = equityMomentumChange(.72,.42);
  assert.equal(down.title, 'BOSS TAKES LEAD');
  assert.equal(down.detail, 'EQUITY 42% · −30 PP');
  assert.equal(down.direction, 'down');
  assert.equal(equityMomentumChange(.7,.8).kind, 'swing');
});

test('first sample is silent and a repeated/stale public key cannot replay or change the baseline', () => {
  const {momentum,root,sounds} = harness();
  assert.equal(momentum.update({key:'0:0',equity:.45}), null);
  assert.equal(root.cue.hidden,true);
  const lead = momentum.update({key:'3:0',equity:.65});
  assert.equal(lead.title,'TAKE THE LEAD');
  assert.deepEqual(sounds,['lead-up']);
  assert.equal(momentum.update({key:'3:0',equity:.35}),null);
  assert.equal(momentum.update({key:'0:0',equity:.1}),null);
  assert.equal(momentum.update({key:'4:0',equity:.62}),null);
  assert.deepEqual(sounds,['lead-up']);
});

test('a neutral intermediate sample preserves the last strict leader for a subsequent overtake', () => {
  const {momentum,sounds} = harness();
  momentum.update({key:'3:0',equity:.55});
  assert.equal(momentum.update({key:'4:0',equity:.5}),null);
  assert.equal(momentum.update({key:'5:0',equity:.45}).title,'BOSS TAKES LEAD');
  assert.deepEqual(sounds,['lead-down']);
});

test('new street clear retains baseline while reset prevents events across different hands', () => {
  const {momentum,root,ring,sounds} = harness();
  momentum.update({key:'0:0',equity:.4});
  momentum.clear();
  momentum.update({key:'3:0',equity:.7});
  assert.equal(root.cue.hidden,false);
  assert.equal(ring.dataset.momentum,'up');
  momentum.reset();
  assert.equal(root.cue.hidden,true);
  assert.equal(ring.dataset.momentum,undefined);
  assert.equal(root.cue.attributes['aria-label'],undefined);
  assert.equal(momentum.update({key:'0:0',equity:.25}),null);
  assert.deepEqual(sounds,['lead-up']);
});

test('cancelled timers cannot erase a later cue and the final reveal closes momentum until reset', () => {
  const {momentum,root,timers,sounds} = harness();
  momentum.update({key:0,equity:.4});
  momentum.update({key:3,equity:.7});
  const first = timers.get(1);
  assert.ok(first.ms <= 1050);
  momentum.update({key:4,equity:.3});
  first.callback();
  assert.equal(root.cue.hidden,false);
  assert.equal(root.cue.dataset.direction,'down');
  momentum.update({key:'boss2',equity:1,final:true});
  assert.equal(root.cue.hidden,true);
  assert.equal(momentum.update({key:5,equity:.9}),null);
  assert.deepEqual(sounds,['lead-up','lead-down']);
  momentum.reset();
  assert.equal(momentum.update({key:0,equity:.9}),null);
});

test('reduced motion supports a boolean or dynamic preference and clears on expiry', () => {
  for (const preference of [true,()=>true]) {
    const {momentum,root,ring,timers} = harness({reducedMotion:preference});
    momentum.update({key:0,equity:.2});
    momentum.update({key:3,equity:.6});
    assert.equal(root.cue.dataset.reducedMotion,'true');
    assert.equal(ring.dataset.momentumReduced,'true');
    assert.equal(timers.get(1).ms,850);
    timers.get(1).callback();
    assert.equal(root.cue.hidden,true);
    assert.equal(ring.dataset.momentum,undefined);
  }
});

test('invalid, hidden and final samples do not produce cues or read extra private fields', () => {
  const {momentum,root,sounds} = harness();
  momentum.update({key:0,equity:.4});
  for (const equity of [undefined,null,NaN,Infinity,-1,2,'0.8']) {
    assert.equal(momentum.update({key:'pending',equity}),null);
  }
  assert.equal(momentum.update({key:3,equity:.8,visible:false}),null);
  const input = {key:3,equity:.8};
  for (const name of ['hand','bossHole','board','seed','rng','result']) {
    Object.defineProperty(input,name,{get(){throw new Error(`private ${name} read`);}});
  }
  const event = momentum.update(input);
  assert.equal(event.title,'TAKE THE LEAD');
  assert.match(root.cue.attributes['aria-label'],/Player equity 80%/);
  assert.deepEqual(sounds,['lead-up']);
  momentum.destroy();
  assert.equal(root.cue.removed,true);
  assert.equal(momentum.update({key:4,equity:.1}),null);
});
