import test from 'node:test';
import assert from 'node:assert/strict';
import {createBossRangeView} from '../src/boss-range-view.mjs';

function fixture() {
  const nodes = [];
  const doc = {
    createElement(tag) {
      const attributes = new Map(), listeners = new Map();
      const node = {tag, attributes, listeners, children: [], dataset: {}, ownText: '', hidden: false, open: false,
        set textContent(value) { this.ownText = value; this.children = []; },
        get textContent() { return this.ownText + this.children.map(child => child.textContent).join(''); },
        append(...children) { this.children.push(...children); },
        replaceChildren(...children) { this.ownText = ''; this.children = children; },
        setAttribute(name, value) { attributes.set(name, value); },
        removeAttribute(name) { attributes.delete(name); },
        addEventListener(name, handler) { listeners.set(name, handler); },
        emit(name, event = {}) { listeners.get(name)?.(event); },
        showModal() { this.open = true; }, close() { this.open = false; this.emit('close'); },
        getBoundingClientRect() { return {left: 10, top: 10, right: 300, bottom: 600}; }};
      nodes.push(node); return node;
    },
    getElementById(id) { return nodes.find(node => node.id === id); }
  };
  doc.body = doc.createElement('body');
  const stage = doc.createElement('main'); stage.id = 'game'; doc.body.append(stage);
  const view = createBossRangeView({root: doc});
  return {view, stage, doc, button: doc.getElementById('boss-hand-range'), dialog: doc.getElementById('boss-range-dialog'),
    get summary() { return nodes.find(node => node.className === 'boss-range-summary'); },
    get list() { return nodes.find(node => node.className === 'boss-range-list'); }};
}
const distribution = values => Array.from({length: 9}, (_, category) => ({category, probability: values[category] ?? 0}));

test('top two retain their original probabilities, OTHER totals the rest and the full view retains nine categories', () => {
  const f = fixture(), input = distribution([.394, .513, .059, .034]);
  Object.freeze(input); input.forEach(Object.freeze);
  f.view.render({visible: true, distribution: input});
  assert.equal(f.button.hidden, false); assert.equal(f.button.disabled, false);
  assert.deepEqual(f.summary.children.map(node => node.textContent), ['PAIR51.3%', 'HIGH CARD39.4%', 'OTHER9.3%']);
  f.button.emit('click'); assert.equal(f.dialog.open, true);
  assert.equal(f.doc.body.children.includes(f.dialog), true, 'modal must remain outside the scaled stage');
  assert.equal(f.stage.children.includes(f.button), true);
  assert.equal(f.list.children.length, 9);
  assert.equal(f.list.children[0].textContent, 'Straight Flush0%');
  assert.equal(f.list.children.at(-1).textContent, 'High Card39.4%');
  assert.match(f.dialog.textContent, /current best hand category/);
  assert.match(f.dialog.textContent, /not your win chance/);
  assert.match(f.dialog.textContent, /never reads hidden BOSS cards/);
  assert.deepEqual(input, distribution([.394, .513, .059, .034]));
});

test('zero-mass categories are not invented in the summary; tiny possible hands stay distinguishable from zero or certainty', () => {
  const f = fixture();
  f.view.render({visible: true, distribution: distribution([0, 1])});
  assert.deepEqual(f.summary.children.map(node => node.textContent), ['PAIR100%']);
  f.view.render({visible: true, distribution: distribution([0, .9998, .0002])});
  assert.deepEqual(f.summary.children.map(node => node.textContent), ['PAIR99.9%', 'TWO PAIR<0.1%']);
});

test('new pending or unavailable data clears old percentages and closes the modal, never fabricating an all-zero distribution', () => {
  const f = fixture();
  const invalid = [null, [], distribution([.5]), distribution([1.01, -.01]), distribution([NaN, 1]),
    [...distribution([1]).slice(0, 8), {category: 7, probability: 0}], distribution([.99])];
  for (const state of [{calculating: true}, {unavailable: true}, ...invalid.map(value => ({distribution: value}))]) {
    f.view.render({visible: true, distribution: distribution([0, 1])}); f.button.emit('click');
    f.view.render({visible: true, ...state});
    assert.equal(f.dialog.open, false); assert.equal(f.button.disabled, true);
    assert.equal(f.list.children.length, 0); assert.equal(f.summary.textContent.includes('%'), false);
    assert.equal(f.summary.textContent, state.calculating ? 'CALCULATING…' : 'UNAVAILABLE');
    f.button.emit('click'); assert.equal(f.dialog.open, false);
  }
});

test('busy state prevents opening; clear removes stale street data, closes the modal and resets accessibility state', () => {
  const f = fixture(), data = distribution([.4, .6]);
  f.view.render({visible: true, distribution: data}); f.button.emit('click');
  f.view.render({visible: true, busy: true, distribution: data});
  assert.equal(f.dialog.open, false); assert.equal(f.button.disabled, true);
  f.button.emit('click'); assert.equal(f.dialog.open, false);
  f.view.render({visible: true, distribution: data}); f.button.emit('click');
  f.view.clear();
  assert.equal(f.dialog.open, false); assert.equal(f.button.hidden, true); assert.equal(f.button.disabled, true);
  assert.equal(f.summary.textContent, ''); assert.equal(f.list.textContent, '');
  assert.equal(f.button.attributes.get('aria-expanded'), 'false');
  assert.equal(f.button.attributes.has('aria-label'), false);
  assert.equal(f.button.dataset.state, undefined);
  f.view.render({visible: true, distribution: data}); f.button.emit('click');
  f.view.render({visible: false, distribution: data});
  assert.equal(f.dialog.open, false); assert.equal(f.summary.textContent, '');
});

test('close control, Escape and outside click dismiss the details without changing displayed probabilities', () => {
  const f = fixture(); f.view.render({visible: true, distribution: distribution([.4, .6])});
  const before = f.summary.textContent;
  f.button.emit('click'); f.dialog.children[0].emit('click'); assert.equal(f.dialog.open, false);
  f.button.emit('click'); f.dialog.emit('cancel'); assert.equal(f.dialog.open, false);
  f.button.emit('click'); f.dialog.emit('click', {target: f.dialog, clientX: 100, clientY: 100});
  assert.equal(f.dialog.open, true, 'clicking dialog padding does not dismiss it');
  f.dialog.emit('click', {target: f.dialog, clientX: 1, clientY: 1}); assert.equal(f.dialog.open, false);
  assert.equal(f.button.attributes.get('aria-expanded'), 'false');
  assert.equal(f.summary.textContent, before);
});
