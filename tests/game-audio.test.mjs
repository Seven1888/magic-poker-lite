import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameAudio, renderGameAudioPreview} from '../src/game-audio.mjs';

function fixture({fetch, decode} = {}) {
  let time = 0, nextId = 0;
  const timers = new Map(), contexts = [], sources = [], buffers = [], nodes = [];
  const param = () => ({value: 0, changes: [],
    setValueAtTime(value, at) { this.value = value; this.changes.push(['set', value, at]); },
    exponentialRampToValueAtTime(value, at) { this.changes.push(['exp', value, at]); },
    linearRampToValueAtTime(value, at) { this.changes.push(['linear', value, at]); },
    cancelScheduledValues() {}
  });
  const node = () => {
    const value = {outputs: [], disconnected: false, connect(target) { this.outputs.push(target); }, disconnect() { this.disconnected = true; this.outputs = []; }};
    nodes.push(value); return value;
  };
  class AudioContext {
    constructor() { this.state = 'suspended'; this.currentTime = 0; this.sampleRate = 8000; this.destination = node(); contexts.push(this); }
    createGain() { return Object.assign(node(), {gain: param()}); }
    createStereoPanner() { return Object.assign(node(), {pan: param()}); }
    createBiquadFilter() { return Object.assign(node(), {frequency: param(), Q: param()}); }
    createConvolver() { return node(); }
    createDelay() { return Object.assign(node(), {delayTime: param()}); }
    createDynamicsCompressor() { return Object.assign(node(), Object.fromEntries(['threshold', 'knee', 'ratio', 'attack', 'release'].map(name => [name, param()]))); }
    createBuffer(channels, length, sampleRate) {
      const data = Array.from({length: channels}, () => new Float32Array(length));
      const buffer = {sampleRate, getChannelData: i => data[i]}; buffers.push(buffer); return buffer;
    }
    createOscillator() { return this.source('oscillator'); }
    createBufferSource() { return this.source('texture'); }
    source(kind) {
      const source = Object.assign(node(), {kind, frequency: param(),
        start(at) { this.startTime = at; }, stop(at) { this.stopTime = at ?? time / 1000; }
      });
      sources.push(source); return source;
    }
    resume() { if (this.blocked) return Promise.reject(new Error('Gesture required')); this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
    decodeAudioData(bytes) { return decode ? decode(bytes) : Promise.resolve({duration: bytes.phase === 'showdown' ? 7.5 : 20}); }
  }
  const doc = {hidden: false};
  const view = {AudioContext, fetch,
    setTimeout(fn, ms) { const id = ++nextId; timers.set(id, {fn, at: time + ms}); return id; },
    clearTimeout(id) { timers.delete(id); }
  };
  const audio = createGameAudio({doc, view});
  function tick(ms) {
    const until = time + ms;
    while (time < until) {
      time = Math.min(until, time + 20);
      for (const context of contexts) if (context.state === 'running') context.currentTime = time / 1000;
      for (const source of sources) if (source.onended && source.stopTime <= time / 1000) source.onended();
      for (const [id, item] of [...timers]) if (item.at <= time) { timers.delete(id); item.fn(); }
    }
  }
  return {audio, doc, view, contexts, sources, buffers, nodes, timers, tick};
}

test('score is lazy, unlock starts the requested arrangement once, and repeated gestures never stack it', async () => {
  const f = fixture();
  assert.equal(f.audio.setMusicPhase('table'), true);
  assert.equal(f.audio.play('deal'), false);
  assert.equal(f.contexts.length, 0);
  assert.equal(await f.audio.unlock(), true);
  assert.equal(f.audio.getAudioState().activePhase, 'table');
  assert.equal(f.audio.getAudioState().phaseStarts, 1);
  assert.equal(f.timers.size, 1);
  const count = f.sources.length;
  f.audio.setMusicPhase('table'); await f.audio.unlock(); await f.audio.unlock();
  assert.equal(f.audio.getAudioState().phaseStarts, 1);
  assert.equal(f.sources.length, count);
  assert.equal(f.timers.size, 1);
  f.audio.destroy();
});

test('showdown starts an immediate impact and rising motif, has a faster denser score, then resolves', async () => {
  const f = fixture();
  f.audio.setMusicPhase('table'); await f.audio.unlock(); f.tick(1000);
  const tableSteps = f.audio.getAudioState().scheduledSteps;
  const before = f.sources.length;
  f.audio.setMusicPhase('showdown');
  const onset = f.sources.slice(before);
  assert.ok(onset.some(source => source.kind === 'texture' && source.startTime <= 1.03));
  const rising = onset.filter(source => source.kind === 'oscillator' && source.startTime >= 1.025 && source.startTime < 1.4);
  assert.ok(rising.some(source => Math.abs(source.startTime - 1.295) < .001), 'the opening motif climbs immediately');
  const startSteps = f.audio.getAudioState().scheduledSteps;
  f.tick(1000);
  assert.ok(f.audio.getAudioState().scheduledSteps - startSteps > tableSteps - 1);
  f.audio.setMusicPhase('win');
  assert.equal(f.audio.getAudioState().activePhase, 'win');
  assert.equal(f.audio.getAudioState().phaseStarts, 3);
  f.tick(300); assert.equal(f.timers.size, 1);
  f.audio.setMusicPhase('table');
  assert.equal(f.audio.getAudioState().activePhase, 'table');
  assert.equal(f.audio.setMusicPhase('private-hand-data'), false);
  f.audio.destroy();
});

test('music and effects switches are independent, and master mute cancels all voices', async () => {
  const f = fixture();
  f.audio.setMusicPhase('table'); await f.audio.unlock();
  f.audio.setEffectsEnabled(false);
  assert.equal(f.audio.play('deal'), false);
  assert.equal(f.audio.getAudioState().activePhase, 'table');
  f.audio.setEffectsEnabled(true); f.audio.setMusicEnabled(false);
  assert.equal(f.audio.getAudioState().activePhase, 'off');
  assert.equal(f.audio.getAudioState().schedulerActive, false);
  assert.equal(f.audio.play('deal'), true);
  f.audio.setMusicEnabled(true);
  assert.equal(f.audio.getAudioState().activePhase, 'table');
  f.audio.setMuted(true);
  assert.equal(f.audio.getAudioState().activeVoices, 0);
  assert.equal(f.audio.getAudioState().schedulerActive, false);
  assert.equal(f.audio.play('win'), false);
  f.audio.setMuted(false);
  assert.equal(f.audio.getAudioState().activePhase, 'table');
  f.audio.destroy(); assert.equal(f.timers.size, 0);
});

test('hidden/interrupted pages are silent, preserve channel preferences, and resume one score after a gesture', async () => {
  const f = fixture();
  f.audio.setMusicPhase('showdown'); await f.audio.unlock();
  f.audio.setEffectsEnabled(false);
  f.doc.hidden = true; f.audio.suspendAudio();
  assert.equal(f.audio.getAudioState().activeVoices, 0);
  assert.equal(f.audio.getAudioState().schedulerActive, false);
  assert.equal(await f.audio.unlock(), false);
  f.doc.hidden = false;
  assert.equal(f.audio.getAudioState().activePhase, 'off');
  assert.equal(await f.audio.unlock(), true);
  assert.equal(f.audio.getAudioState().activePhase, 'showdown');
  assert.equal(f.audio.play('click'), false);
  assert.equal(f.audio.getAudioState().phaseStarts, 2);
  f.contexts[0].state = 'interrupted'; f.tick(80);
  assert.equal(f.audio.getAudioState().schedulerActive, false);
  await f.audio.unlock();
  assert.equal(f.audio.getAudioState().phaseStarts, 3);
  assert.equal(f.contexts.length, 1);
  f.audio.destroy();
});

test('an unlock failure is retryable, and destruction permanently releases voices, graph and timers', async () => {
  const f = fixture();
  await f.audio.unlock(); f.contexts[0].state = 'suspended'; f.contexts[0].blocked = true;
  f.audio.setMusicPhase('table');
  assert.equal(await f.audio.unlock(), false);
  assert.equal(f.audio.getAudioState().schedulerActive, false);
  f.contexts[0].blocked = false; await f.audio.unlock();
  f.audio.setMusicPhase('showdown');
  f.audio.destroy(); f.audio.destroy();
  assert.equal(f.audio.getAudioState().activeVoices, 0);
  assert.equal(f.contexts[0].state, 'closed');
  assert.equal(f.timers.size, 0);
  assert.equal(await f.audio.unlock(), false);
  assert.equal(f.audio.setMusicPhase('table'), false);
  assert.equal(f.audio.play('deal'), false);
  assert.ok(f.nodes.slice(1).every(node => node.disconnected));
});

test('continuous play stays bounded and phase transitions never leave a second scheduler running', async () => {
  const f = fixture();
  f.audio.setMusicPhase('table'); await f.audio.unlock();
  let maxVoices = 0;
  for (let i = 0; i < 120; i++) {
    if (i % 11 === 0) f.audio.setMusicPhase(i % 22 === 0 ? 'showdown' : 'table');
    f.audio.play('chips'); f.tick(500);
    maxVoices = Math.max(maxVoices, f.audio.getAudioState().activeVoices);
    assert.equal(f.timers.size, 1);
  }
  assert.ok(maxVoices < 120, `live voice maximum was ${maxVoices}`);
  f.audio.setMusicPhase('off'); f.tick(300);
  assert.equal(f.audio.getAudioState().activeVoices, 0);
  assert.equal(f.timers.size, 0);
  f.audio.destroy();
});

test('card sounds have paper texture and a felt tap; reveal, chips and lead cues stay separate', async () => {
  const f = fixture(); await f.audio.unlock();
  for (const name of ['deal', 'reveal']) {
    const first = f.sources.length;
    assert.equal(f.audio.play(name), true);
    assert.deepEqual(f.sources.slice(first).map(source => source.kind), ['texture', 'oscillator']);
  }
  for (const name of ['chips', 'chip-arrival', 'lead-up', 'lead-down', 'suspense']) assert.equal(f.audio.play(name), true);
  assert.equal(f.audio.play('unknown'), false);
  f.audio.setEffectsEnabled(false);
  assert.equal(f.audio.getAudioState().activeVoices, 0);
  f.audio.destroy();
});

test('score/noise are deterministic and never call Math.random', async () => {
  const original = Math.random;
  Math.random = () => { throw new Error('Presentation must not consume random state'); };
  const a = fixture(), b = fixture();
  try {
    for (const f of [a, b]) { f.audio.setMusicPhase('table'); await f.audio.unlock(); f.tick(2000); }
    assert.deepEqual(a.buffers[0].getChannelData(0), b.buffers[0].getChannelData(0));
    const score = f => f.sources.map(source => ({kind: source.kind, start: source.startTime, frequency: source.frequency.changes}));
    assert.deepEqual(score(a), score(b));
  } finally { Math.random = original; a.audio.destroy(); b.audio.destroy(); }
});

test('preview validates duration and phase before allocating Web Audio', async () => {
  await assert.rejects(renderGameAudioPreview({seconds: 31}), RangeError);
  await assert.rejects(renderGameAudioPreview({phase: 'off'}), TypeError);
  await assert.rejects(renderGameAudioPreview({OfflineAudioContext: null}), /unavailable/);
});

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const scoreResponse = url => Promise.resolve({ok: true, arrayBuffer: () => Promise.resolve({phase: String(url).includes('showdown') ? 'showdown' : 'table'})});

test('score prefetch is silent, then a cached loop replaces sustained synthesis with one source and no timer', async () => {
  const requests = [];
  const f = fixture({fetch: url => { requests.push(String(url)); return scoreResponse(url); }});
  await flush();
  assert.equal(requests.length, 2); assert.equal(f.contexts.length, 0, 'fetch does not activate audio');
  f.audio.setMusicPhase('table'); await f.audio.unlock(); await flush(); f.tick(300);
  assert.deepEqual(f.audio.getAudioState().cachedLoops, ['table', 'showdown']);
  assert.equal(f.audio.getAudioState().musicBackend, 'buffer');
  assert.equal(f.audio.getAudioState().activeVoices, 1);
  assert.equal(f.audio.getAudioState().schedulerActive, false);
  const count = f.sources.length;
  f.tick(30000);
  assert.equal(f.sources.length, count, 'steady playback allocates no note sources');
  assert.equal(f.timers.size, 0);
  assert.equal(f.audio.getAudioState().phaseStarts, 1, 'cache readiness does not restart the score');
  f.audio.destroy();
});

test('cached arrangements retain the showdown opening, share decoding, and respect every channel/lifecycle control', async () => {
  const f = fixture({fetch: scoreResponse});
  await flush(); f.audio.setMusicPhase('table'); await f.audio.unlock(); await flush(); f.tick(300);
  const before = f.sources.length;
  f.audio.setMusicPhase('showdown');
  assert.ok(f.sources.length - before >= 7, 'one loop plus the immediate impact and rising motif');
  assert.equal(f.sources.at(-1).loop, true); assert.equal(f.sources.at(-1).loopEnd, 7.5);
  const count = f.sources.length; f.audio.setMusicPhase('showdown'); await f.audio.unlock();
  assert.equal(f.sources.length, count, 'same-phase gestures never duplicate a loop');
  f.tick(1500); assert.equal(f.audio.getAudioState().activeVoices, 1);
  f.audio.setMusicEnabled(false); assert.equal(f.audio.getAudioState().activeVoices, 0);
  assert.equal(f.audio.play('deal'), true);
  f.audio.setMuted(true); assert.equal(f.audio.getAudioState().activeVoices, 0);
  f.audio.setMusicEnabled(true); f.audio.setMuted(false); f.tick(1500);
  assert.equal(f.audio.getAudioState().activeVoices, 1);
  f.doc.hidden = true; f.audio.suspendAudio();
  assert.equal(f.audio.getAudioState().activeVoices, 0);
  f.doc.hidden = false; await f.audio.unlock(); f.tick(1500);
  assert.equal(f.audio.getAudioState().activeVoices, 1);
  await f.contexts[0].close(); await f.audio.unlock(); f.tick(1500);
  assert.equal(f.contexts.length, 2, 'a browser-closed context rebuilds the graph');
  assert.equal(f.audio.getAudioState().activeVoices, 1);
  assert.equal(f.audio.getAudioState().musicBackend, 'buffer');
  f.audio.destroy(); assert.equal(f.timers.size, 0);
});

test('network/decode failure falls back to the same original score without blocking the first gesture', async () => {
  for (const options of [
    {fetch: () => Promise.reject(new Error('offline'))},
    {fetch: scoreResponse, decode: () => Promise.reject(new Error('decode failed'))},
    {fetch: scoreResponse, decode: () => { throw new Error('invalid buffer'); }}
  ]) {
    const f = fixture(options); await flush(); f.audio.setMusicPhase('table');
    assert.equal(await f.audio.unlock(), true); await flush();
    assert.equal(f.audio.getAudioState().musicBackend, 'synthesis');
    assert.equal(f.audio.getAudioState().schedulerActive, true);
    assert.equal(f.audio.play('deal'), true);
    f.audio.destroy();
  }
});

test('a late decode after destruction cannot start a loop or restore an audio graph', async () => {
  const pending = [];
  const f = fixture({fetch: scoreResponse, decode: () => new Promise(resolve => pending.push(resolve))});
  await flush(); f.audio.setMusicPhase('table'); await f.audio.unlock(); await flush();
  f.audio.destroy(); const count = f.sources.length;
  pending.forEach(resolve => resolve({duration: 20})); await flush();
  assert.equal(f.sources.length, count);
  assert.equal(f.audio.getAudioState().activeVoices, 0);
  assert.equal(f.audio.getAudioState().musicBackend, 'off');
  assert.equal(f.timers.size, 0);
});
