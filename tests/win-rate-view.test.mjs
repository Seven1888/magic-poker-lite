import test from 'node:test';
import assert from 'node:assert/strict';
import {renderWinRate} from '../src/win-rate-view.mjs';

function output() {
  const properties = new Map(), attributes = new Map();
  return {hidden: true, textContent: '', innerHTML: '', dataset: {},
    style: {setProperty: (key, value) => properties.set(key, value), removeProperty: key => properties.delete(key)},
    setAttribute: (key, value) => attributes.set(key, value), removeAttribute: key => attributes.delete(key),
    properties, attributes};
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
