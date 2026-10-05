import test from 'node:test';
import assert from 'node:assert/strict';
import {renderWinRate} from '../src/win-rate-view.mjs';

function output() {
  const properties = new Map(), attributes = new Map();
  const writes = {html:0,text:0,style:0,attribute:0,title:0};
  let html='', text='', title='', node=null;
  return {hidden:true, dataset:{},
    get innerHTML(){return html;}, set innerHTML(value){html=value;text='';node={markup:value};writes.html++;},
    get textContent(){return text;}, set textContent(value){text=value;html='';node=null;writes.text++;},
    get title(){return title;}, set title(value){title=value;attributes.set('title',value);writes.title++;},
    get valueNode(){return node;},
    style:{setProperty:(key,value)=>{writes.style++;properties.set(key,value);},removeProperty:key=>{writes.style++;properties.delete(key);}},
    setAttribute:(key,value)=>{writes.attribute++;attributes.set(key,value);},removeAttribute:key=>{writes.attribute++;attributes.delete(key);},
    properties,attributes,writes};
}

test('the ring preserves equity with one decimal and never rounds a possible loss to certain victory', () => {
  const element = output();
  for (const [equity,label] of [[0,'0'],[.5,'50'],[.624,'62.4'],[40/44,'90.9'],[.9998,'99.9'],[.0002,'&lt;0.1'],[1,'100']]) {
    renderWinRate(element, equity, {description: 'Public cards only', title: 'Estimated equity'});
    assert.equal(element.hidden, false);
    assert.equal(element.properties.get('--win-rate-turn'), `${equity}turn`);
    assert.equal(element.dataset.equity, String(equity));
    assert.ok(element.innerHTML.includes(`>${label}<small>%</small>`));
    assert.equal(element.attributes.get('aria-label'), 'Public cards only');
  }
});

test('same-equity renders keep the number node and momentum while independent accessible descriptions can change', () => {
  const element=output(), options={description:'Public equity',title:'Known cards only'};
  renderWinRate(element,.625,options);
  element.dataset.momentum='up'; element.dataset.momentumKind='lead';
  const node=element.valueNode, writes={...element.writes};
  for(let i=0;i<25;i++)renderWinRate(element,.625,options);
  assert.equal(element.valueNode,node);
  assert.deepEqual(element.writes,writes);
  assert.equal(element.dataset.momentum,'up');
  assert.equal(element.dataset.momentumKind,'lead');
  renderWinRate(element,.625,{description:'One opponent card revealed',title:'44 remaining cards'});
  assert.equal(element.valueNode,node);
  assert.equal(element.attributes.get('aria-label'),'One opponent card revealed');
  assert.equal(element.title,'44 remaining cards');
  renderWinRate(element,.65,options);
  assert.notEqual(element.valueNode,node);
  assert.equal(element.properties.get('--win-rate-turn'),'0.65turn');
});

test('hidden render clears once and returning with the same equity restores its number and attributes', () => {
  const element=output();
  renderWinRate(element,.4,{title:'Exact enumeration'});
  element.dataset.method='exact-enumeration'; element.dataset.outcomes='990';
  renderWinRate(element);
  const writes={...element.writes};
  for(let i=0;i<10;i++)renderWinRate(element);
  assert.deepEqual(element.writes,writes);
  assert.equal(element.valueNode,null);
  assert.equal(element.attributes.has('title'),false);
  assert.equal('method' in element.dataset,false);
  assert.equal('outcomes' in element.dataset,false);
  renderWinRate(element,.4,{title:'Exact enumeration'});
  assert.equal(element.hidden,false);
  assert.ok(element.innerHTML.includes('>40<small>'));
  assert.equal(element.properties.get('--win-rate-turn'),'0.4turn');
  assert.equal(element.attributes.get('title'),'Exact enumeration');
});

test('unavailable or invalid equity clears the previous ring, label and accessibility value', () => {
  const element = output();
  for (const equity of [null, undefined, NaN, Infinity, -.1, 1.1, '0.62']) {
    renderWinRate(element, .62);
    renderWinRate(element, equity);
    assert.equal(element.hidden, true);
    assert.equal(element.textContent, '');
    assert.equal(element.properties.has('--win-rate-turn'), false);
    assert.equal('equity' in element.dataset, false);
    assert.equal(element.attributes.has('aria-label'), false);
  }
});
