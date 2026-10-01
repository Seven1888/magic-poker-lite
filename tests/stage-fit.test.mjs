import test from 'node:test';
import assert from 'node:assert/strict';
import {fitStage, stageLayout} from '../src/stage-fit.mjs';

test('portrait layout fits safe areas and preserves the scene aspect ratio', () => {
  const layout = stageLayout({viewportWidth: 390, viewportHeight: 844, insets: {top: 47, bottom: 34}});
  assert.equal(layout.height, 763);
  assert.ok(layout.width <= 390);
  assert.ok(Math.abs(layout.width / layout.height - 400 / 860) < 1e-12);
  assert.equal(layout.scroll, false);
});

test('short portrait and landscape keep primary buttons usable and allow vertical scrolling', () => {
  for (const [viewportWidth, viewportHeight] of [[320, 568], [360, 540], [844, 390]]) {
    const layout = stageLayout({viewportWidth, viewportHeight});
    assert.ok(60 * layout.scale >= 45);
    assert.ok(layout.width <= viewportWidth);
    assert.ok(layout.height > viewportHeight);
    assert.equal(layout.scroll, true);
  }
});

test('narrow windows never gain horizontal overflow and large screens never enlarge the scene', () => {
  const narrow = stageLayout({viewportWidth: 240, viewportHeight: 400});
  assert.equal(narrow.width, 240);
  assert.equal(narrow.scale, .6);
  const desktop = stageLayout({viewportWidth: 1440, viewportHeight: 1080, insets: {top: 32, right: 32, bottom: 32, left: 32}});
  assert.deepEqual(desktop, {scale: 1, width: 400, height: 860, scroll: false});
  assert.throws(() => stageLayout({viewportWidth: NaN, viewportHeight: 800}), RangeError);
});

function browser() {
  const listeners = () => ({
    events: new Map(),
    addEventListener(name, fn) { this.events.set(name, fn); },
    removeEventListener(name, fn) { if (this.events.get(name) === fn) this.events.delete(name); }
  });
  const style = () => ({values: {}, setProperty(name, value) {this.values[name] = value;}});
  const viewport = {...listeners(), height: 812, scale: 1, offsetTop: 0};
  const frames = new Map();
  let nextFrame = 0;
  const view = {...listeners(), visualViewport: viewport, innerWidth: 375, innerHeight: 812,
    getComputedStyle: () => ({paddingTop: '0px', paddingRight: '0px', paddingBottom: '0px', paddingLeft: '0px'}),
    requestAnimationFrame(fn) {frames.set(++nextFrame, fn); return nextFrame;},
    cancelAnimationFrame(id) {frames.delete(id);}
  };
  const root = {clientWidth: 375, clientHeight: 812, style: style(), dataset: {}};
  const doc = {defaultView: view, documentElement: root, body: {}};
  const shell = {ownerDocument: doc, style: style()}, stage = {ownerDocument: doc, style: style()};
  return {view, viewport, root, shell, stage, frames,
    flush() {for (const [id, fn] of frames) {frames.delete(id); fn();}}
  };
}

test('dynamic address bars and orientation update together; pinch zoom does not shrink the scene', () => {
  const b = browser();
  const cleanup = fitStage(b);
  assert.equal(b.shell.style.width, '375px');
  b.viewport.height = 667;
  b.viewport.events.get('resize')();
  b.view.events.get('resize')();
  assert.equal(b.frames.size, 1);
  b.flush();
  assert.equal(b.shell.style.height, '667px');
  assert.equal(b.root.style.values['--viewport-height'], '667px');

  b.viewport.scale = 2;
  b.viewport.height = 333;
  b.viewport.events.get('resize')(); b.flush();
  assert.equal(b.shell.style.height, '667px');
  assert.equal(b.root.style.values['--viewport-height'], '667px');

  b.viewport.scale = 1; b.viewport.height = 375;
  b.root.clientWidth = 812; b.view.innerHeight = 375;
  b.view.events.get('orientationchange')(); b.flush();
  assert.equal(b.root.dataset.stageScroll, 'true');
  assert.equal(b.shell.style.height, '645px');
  cleanup();
});

test('visual viewport scroll keeps dialogs reachable and cleanup removes pending work', () => {
  const b = browser();
  const cleanup = fitStage(b);
  b.viewport.offsetTop = 90;
  b.viewport.events.get('scroll')(); b.flush();
  assert.equal(b.root.style.values['--viewport-offset-top'], '90px');
  b.view.events.get('resize')();
  cleanup();
  assert.equal(b.frames.size, 0);
  assert.equal(b.view.events.size, 0);
  assert.equal(b.viewport.events.size, 0);
});

test('browsers without visualViewport use their layout viewport', () => {
  const b = browser();
  delete b.view.visualViewport;
  const cleanup = fitStage(b);
  assert.equal(b.shell.style.height, '806.25px');
  assert.equal(b.root.style.values['--viewport-height'], '812px');
  cleanup();
});
