import test from 'node:test';
import assert from 'node:assert/strict';
import {setupEntryLayout} from '../src/entry-layout.mjs';

function fixture({open = false} = {}) {
  const observers = [];
  const node = name => ({name, parentNode: null, children: [],
    get nextSibling() { const siblings = this.parentNode?.children || []; return siblings[siblings.indexOf(this) + 1] || null; },
    append(child) { this.insertBefore(child, null); },
    insertBefore(child, next) {
      if (child.parentNode) child.parentNode.children.splice(child.parentNode.children.indexOf(child), 1);
      const at = next ? this.children.indexOf(next) : this.children.length;
      this.children.splice(at, 0, child); child.parentNode = this;
    },
    replaceChild(child, previous) {
      this.insertBefore(child, previous); this.children.splice(this.children.indexOf(previous), 1); previous.parentNode = null;
    }
  });
  const body = node('body'), stage = node('game'), before = node('controls'), dock = node('asset-dock'), after = node('extra');
  dock.balance = '999.5'; dock.id = 'original-dock';
  body.append(stage); stage.append(before); stage.append(dock); stage.append(after);
  const events = new Map(), dialog = {open,
    addEventListener(type, listener) { events.set(type, listener); },
    removeEventListener(type, listener) { if (events.get(type) === listener) events.delete(type); }
  };
  class Observer {
    constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
    observe(target, options) { this.target = target; this.options = options; }
    disconnect() { this.disconnected = true; }
  }
  const doc = {body, documentElement: {dataset: {}}, defaultView: {MutationObserver: Observer},
    createComment: text => node(text), querySelector: selector => selector === '#buyin-dialog' ? dialog : selector === '.asset-dock' ? dock : null};
  return {doc, body, stage, dock, before, after, dialog, observers, events,
    setOpen(value) { dialog.open = value; observers.filter(o => !o.disconnected).forEach(o => o.callback()); }
  };
}

test('entry moves the same original dock outside the scaled stage and restores its exact sibling position', () => {
  const f = fixture(), cleanup = setupEntryLayout(f.doc);
  assert.deepEqual(f.stage.children, [f.before, f.dock, f.after]);
  f.setOpen(true);
  assert.equal(f.dock.parentNode, f.body);
  assert.equal(f.doc.documentElement.dataset.entryOpen, 'true');
  assert.equal(f.stage.children.length, 3, 'a placeholder keeps the original location');
  assert.equal(f.dock.balance, '999.5'); assert.equal(f.dock.id, 'original-dock');
  f.setOpen(false);
  assert.deepEqual(f.stage.children, [f.before, f.dock, f.after]);
  assert.equal(f.doc.documentElement.dataset.entryOpen, undefined);
  cleanup();
});

test('initially open dialogs, repeated setup and repeated open mutations never duplicate the dock or observer', () => {
  const f = fixture({open: true}), cleanup = setupEntryLayout(f.doc);
  assert.equal(f.dock.parentNode, f.body);
  assert.equal(setupEntryLayout(f.doc), cleanup);
  f.setOpen(true); f.setOpen(true);
  assert.equal(f.observers.length, 1);
  assert.equal(f.body.children.filter(n => n === f.dock).length, 1);
  assert.equal(f.stage.children.length, 3);
  f.setOpen(false); f.setOpen(true);
  cleanup(); cleanup();
  assert.deepEqual(f.stage.children, [f.before, f.dock, f.after]);
  assert.equal(f.events.size, 0); assert.equal(f.observers[0].disconnected, true);
  f.setOpen(true); assert.equal(f.dock.parentNode, f.stage, 'disposed observer cannot move the dock');
});

test('cleanup restores the dock even if a renderer removed its placeholder', () => {
  const f = fixture({open: true}), cleanup = setupEntryLayout(f.doc);
  const placeholder = f.stage.children[1];
  f.stage.children.splice(1, 1); placeholder.parentNode = null;
  cleanup();
  assert.deepEqual(f.stage.children, [f.before, f.dock, f.after]);
  assert.equal(f.doc.documentElement.dataset.entryOpen, undefined);
});
