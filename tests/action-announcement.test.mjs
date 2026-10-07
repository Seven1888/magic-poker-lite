import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {actionAnnouncement, createActionAnnouncements} from '../src/action-announcement.mjs';

const flush = async () => { for (let i = 0; i < 24; i++) await Promise.resolve(); };
function fixture({audio = true, failFetch = false, stuckFetch = false, voiceMs = 550, speechMs = 700,
  speechVoices = [{lang:'zh-TW'}, {lang:'en-US', name:'Microsoft Zira'}, {lang:'en-US', name:'Microsoft David'}]} = {}) {
  let now = 0, serial = 0;
  const timers = new Map(), sources = [], utterances = [], fetches = [], contexts = [];
  const setTimeout = (fn, ms) => { const id = ++serial; timers.set(id, {fn, at: now + ms}); return id; };
  const clearTimeout = id => timers.delete(id);
  class Target {
    constructor() { this.listeners = new Map(); }
    addEventListener(name, fn) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(fn); }
    removeEventListener(name, fn) { this.listeners.get(name)?.delete(fn); }
    emit(name) { for (const fn of this.listeners.get(name) || []) fn(); }
  }
  class Element {
    constructor() { this.children = []; this.dataset = {}; this.attrs = {}; this.hidden = false; this.text = ''; }
    append(...nodes) { nodes.forEach(node => { node.parent = this; this.children.push(node); }); }
    setAttribute(name, value) { this.attrs[name] = value; }
    remove() { this.parent.children = this.parent.children.filter(node => node !== this); }
    set textContent(value) { this.text = value; this.children = []; }
    get textContent() { return this.text + this.children.map(node => node.textContent).join(' '); }
  }
  class AudioContext {
    constructor() { this.state = 'suspended'; this.destination = {}; contexts.push(this); }
    createGain() { return {gain: {value: 0}, connect(){}}; }
    async resume() { this.state = 'running'; }
    async suspend() { this.state = 'suspended'; }
    async close() { this.state = 'closed'; }
    async decodeAudioData(bytes) { return {duration: voiceMs / 1000, url: bytes.url}; }
    createBufferSource() {
      const source = {connect(){}, disconnect(){}, stopped: false,
        start() { this.startedAt = now; this.timer = setTimeout(() => this.onended?.(), voiceMs); },
        stop() { this.stopped = true; clearTimeout(this.timer); }};
      sources.push(source); return source;
    }
  }
  const view = Object.assign(new Target(), {setTimeout, clearTimeout,
    ...(audio ? {AudioContext} : {}),
    fetch: async url => { fetches.push(url); if (stuckFetch) return new Promise(() => {}); return {ok: !failFetch, arrayBuffer: async () => Object.assign(new ArrayBuffer(4), {url})}; },
    SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
    speechSynthesis: {
      cancellations: 0, getVoices: () => speechVoices,
      speak(utterance) { utterance.startedAt = now; utterances.push(utterance); utterance.timer = setTimeout(() => utterance.onend?.(), speechMs); },
      cancel() { this.cancellations++; for (const utterance of utterances) clearTimeout(utterance.timer); }
    }
  });
  const stage = new Element(); stage.id = 'game';
  const doc = Object.assign(new Target(), {defaultView: view, hidden: false,
    createElement: () => new Element(), getElementById: id => id === 'game' ? stage : null});
  const announcements = createActionAnnouncements({root: doc});
  return {announcements, doc, view, stage, sources, utterances, fetches, timers, contexts,
    get card() { return stage.children[0]; },
    async tick(ms) {
      const target = now + ms;
      await flush();
      for (;;) {
        const next = [...timers].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = next[1].at; timers.delete(next[0]); next[1].fn(); await flush();
      }
      now = target; await flush();
    }
  };
}

test('only committed voluntary seat actions become English cards, including short all-in calls', () => {
  for (const type of ['check', 'call', 'bet', 'raise', 'allin', 'fold']) {
    for (const actor of ['player', 'npc']) {
      const result = actionAnnouncement(Object.freeze({actor, type}));
      assert.equal(result.actorLabel, actor === 'player' ? 'YOU' : 'BOSS');
      assert.equal(result.label, type === 'allin' ? 'ALL IN' : type.toUpperCase());
    }
  }
  assert.equal(actionAnnouncement({actor: 'npc', type: 'call', allIn: true}).label, 'ALL IN');
  for (const event of [null, {}, {actor:'preview', type:'raise'}, {actor:'player', type:'small-blind'}, {type:'reveal'}, {actor:'npc', type:'big-blind'}]) assert.equal(actionAnnouncement(event), null);
});

test('each action has valid local mono speech assets with distinct player and BOSS recordings', async () => {
  for (const name of ['check', 'call', 'bet', 'raise', 'allin', 'fold']) {
    const recordings = [];
    for (const actor of ['player', 'boss']) {
    const bytes = await readFile(new URL(`../assets/action-voice-v59/${actor}/${name}.wav`, import.meta.url));
    recordings.push(bytes);
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF'); assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
    assert.equal(bytes.readUInt32LE(4), bytes.length - 8);
    let position = 12, format, samples;
    while (position + 8 <= bytes.length) {
      const size = bytes.readUInt32LE(position + 4), type = bytes.toString('ascii', position, position + 4);
      if (type === 'fmt ') format = bytes.subarray(position + 8, position + 8 + size);
      if (type === 'data') samples = bytes.subarray(position + 8, position + 8 + size);
      position += 8 + size + size % 2;
    }
    assert.equal(format.readUInt16LE(0), 1); assert.equal(format.readUInt16LE(2), 1);
    assert.equal(format.readUInt32LE(4), 22050); assert.equal(format.readUInt16LE(14), 16);
    const duration = samples.length / 44100;
    assert.ok(duration > .25 && duration < 2, `${name} has a short, complete utterance`);
    let energy = 0;
    for (let i = 0; i < samples.length; i += 2) energy += samples.readInt16LE(i) ** 2;
    assert.ok(Math.sqrt(energy / (samples.length / 2)) > 250, `${name} is not a silent placeholder`);
    }
    assert.notDeepEqual(recordings[0], recordings[1], `${name} must not reuse one voice for both seats`);
  }
});

test('announcements return immediately; new actions replace speech without a queue and select the correct seat recording', async () => {
  const f = fixture({voiceMs: 2500}); await f.announcements.unlock(); await flush();
  const a = {actor:'player', type:'check', id:'check'}, b = {actor:'npc', type:'check', id:'check'};
  const first = f.announcements.announce(a, {key:'table1:hand1:2'});
  assert.equal(await first, true, 'accepted actions do not wait for their card or voice');
  assert.equal(f.announcements.announce({...a}, {key:'table1:hand1:2'}), first);
  assert.equal(f.announcements.announce(a), first);
  await flush();
  assert.equal(f.card.textContent, 'YOU CHECK'); assert.equal(f.sources.length, 1);
  assert.match(f.sources[0].buffer.url, /action-voice-v59\/player\/check\.wav$/);
  await f.tick(100);
  const second = f.announcements.announce(b, {key:'table1:hand1:3'});
  assert.equal(await second, true);
  await flush();
  assert.equal(f.card.textContent, 'BOSS CHECK'); assert.equal(f.sources.length, 2);
  assert.equal(f.sources[0].stopped, true, 'outdated speech stops before the next speaker starts');
  assert.match(f.sources[1].buffer.url, /action-voice-v59\/boss\/check\.wav$/);
  assert.equal(f.sources[1].startedAt, 100); assert.equal(f.announcements.getState().queued, 0);
  await f.tick(999); assert.equal(f.card.hidden, false);
  await f.tick(1); assert.equal(f.card.hidden, true);
  assert.equal(f.sources[1].stopped, false, 'the readable card timer is independent of a longer voice');
  assert.equal(f.stage.dataset.actionAnnouncement, undefined); assert.equal(f.announcements.getState().announced, 2);
  assert.equal(f.utterances.length, 0); assert.equal(f.fetches.length, 12);
  await f.tick(1500); assert.equal(f.timers.size, 0); assert.equal(f.announcements.getState().active, null);
});

test('no audio before a gesture or with Sound effects off; cards still appear', async () => {
  const f = fixture(); const first = f.announcements.announce({actor:'player', type:'raise'});
  assert.equal(f.contexts.length, 0); await f.tick(1000); assert.equal(await first, true);
  assert.equal(f.sources.length, 0); assert.equal(f.utterances.length, 0);
  await f.announcements.unlock(); f.announcements.setEnabled(false);
  const second = f.announcements.announce({actor:'npc', type:'fold'});
  await f.tick(1000); assert.equal(await second, true); assert.equal(f.card.textContent, 'BOSS FOLD');
  assert.equal(f.sources.length, 0); assert.equal(f.utterances.length, 0);
  f.announcements.setEnabled(true);
  const third = f.announcements.announce({actor:'player', type:'bet'}); await flush();
  assert.equal(f.sources.length, 1); await f.tick(1000); assert.equal(await third, true);
});

test('muting during speech stops only speech and preserves the readable card duration', async () => {
  const f = fixture(); await f.announcements.unlock();
  const pending = f.announcements.announce({actor:'player', type:'raise', allIn:true}); await flush();
  assert.equal(f.card.textContent, 'YOU ALL IN'); f.announcements.setEnabled(false);
  assert.equal(f.sources[0].stopped, true); assert.equal(f.card.hidden, false);
  await f.tick(999); assert.equal(f.card.hidden, false);
  await f.tick(1); assert.equal(await pending, true); assert.equal(f.card.hidden, true);
});

test('hidden/pagehide cancels active feedback with no late replay; unlock resumes only fresh actions', async () => {
  const f = fixture(); await f.announcements.unlock();
  const first = f.announcements.announce({actor:'player',type:'call'}, {key:'1:1'});
  await flush();
  f.doc.hidden = true; f.doc.emit('visibilitychange');
  assert.equal(await first, true); assert.equal(f.card.hidden, true);
  assert.equal(f.contexts[0].state, 'suspended'); assert.equal(f.sources[0].stopped, true);
  assert.equal(await f.announcements.announce({actor:'player',type:'fold'}, {key:'1:3'}), false);
  f.doc.hidden = false; await f.announcements.unlock(); await f.tick(5000);
  assert.equal(f.sources.length, 1); assert.equal(f.announcements.getState().queued, 0);
  assert.equal(await f.announcements.announce({actor:'player',type:'call'}, {key:'1:1'}), true);
  assert.equal(f.sources.length, 1, 'an accepted action key stays deduplicated after background cancellation');
  const fresh = f.announcements.announce({actor:'player',type:'check'}, {key:'2:1'}); await flush();
  f.view.emit('pagehide'); assert.equal(await fresh, true); assert.equal(f.sources[1].stopped, true);
  assert.equal(f.timers.size, 0);
});

for (const options of [{audio:false}, {failFetch:true}, {stuckFetch:true}]) test(`English fallback has distinct voices and never queues obsolete actions (${JSON.stringify(options)})`, async () => {
  const f = fixture(options); await f.announcements.unlock();
  const first = f.announcements.announce({actor:'player',type:'call'});
  assert.equal(await first, true); await f.tick(options.stuckFetch ? 350 : 0);
  assert.equal(f.utterances.length, 1); assert.equal(f.utterances[0].text, 'CALL');
  assert.equal(f.utterances[0].lang, 'en-US'); assert.equal(f.utterances[0].voice.lang, 'en-US');
  const second = f.announcements.announce({actor:'npc',type:'raise'});
  assert.equal(await second, true); await f.tick(options.stuckFetch ? 350 : 0);
  assert.equal(f.utterances.length, 2); assert.equal(f.utterances[1].text, 'RAISE');
  assert.notEqual(f.utterances[0].voice.name, f.utterances[1].voice.name);
  assert.equal(f.view.speechSynthesis.cancellations, 1, 'a new action cancels the preceding utterance instead of queuing');
  await f.tick(1000); assert.equal(f.timers.size, 0);
});

test('a browser with one English voice still uses distinguishable fallback pitch and rate', async () => {
  const f = fixture({audio:false, speechVoices:[{lang:'en-US', name:'English'}]}); await f.announcements.unlock();
  await f.announcements.announce({actor:'player',type:'check'}); await flush();
  await f.announcements.announce({actor:'npc',type:'check'}); await flush();
  assert.equal(f.utterances.length, 2);
  assert.notEqual(f.utterances[0].pitch, f.utterances[1].pitch); assert.notEqual(f.utterances[0].rate, f.utterances[1].rate);
  f.announcements.destroy();
});

test('fallback chooses another available voice even when preferred Zira is second and David is unavailable', async () => {
  const f = fixture({audio:false, speechVoices:[{lang:'en-GB',name:'British English'}, {lang:'en-US',name:'Microsoft Zira'}]});
  await f.announcements.unlock();
  await f.announcements.announce({actor:'player',type:'check'}); await flush();
  await f.announcements.announce({actor:'npc',type:'check'}); await flush();
  assert.equal(f.utterances[0].voice.name, 'Microsoft Zira');
  assert.equal(f.utterances[1].voice.name, 'British English');
  f.announcements.destroy();
});

test('slow loading cannot hold the caller, and a superseded voice cannot start after its replacement', async () => {
  const f = fixture({stuckFetch:true}); await f.announcements.unlock();
  await f.announcements.announce({actor:'player',type:'call'}); await f.tick(100);
  await f.announcements.announce({actor:'npc',type:'raise'}); await f.tick(350);
  assert.deepEqual(f.utterances.map(utterance => utterance.text), ['RAISE']);
  assert.equal(f.announcements.getState().queued, 0);
  f.announcements.destroy(); assert.equal(f.timers.size, 0);
});

test('failed browser synthesis remains bounded and does not extend the independent card duration', async () => {
  const f = fixture({audio:false, speechMs:10000}); await f.announcements.unlock();
  await f.announcements.announce({actor:'npc',type:'fold'}); await flush();
  await f.tick(1000); assert.equal(f.card.hidden, true);
  await f.tick(3500); assert.equal(f.view.speechSynthesis.cancellations, 1); assert.equal(f.timers.size, 0);
});

test('destroy releases timers, audio and listeners and cannot be restarted', async () => {
  const f = fixture(); await f.announcements.unlock();
  const first = f.announcements.announce({actor:'player',type:'call'}), second = f.announcements.announce({actor:'npc',type:'fold'}); await flush();
  f.announcements.destroy();
  assert.equal(await first, true); assert.equal(await second, true); assert.equal(f.stage.children.length, 0);
  assert.equal(f.sources[0].stopped, true); assert.equal(f.contexts[0].state, 'closed'); assert.equal(f.timers.size, 0);
  assert.equal(f.doc.listeners.get('visibilitychange').size, 0); assert.equal(f.view.listeners.get('pagehide').size, 0);
  assert.equal(await f.announcements.unlock(), false);
  assert.equal(await f.announcements.announce({actor:'player',type:'check'}), false);
});

test('new-table cancellation can reset hand/history keys without replaying the old table', async () => {
  const f = fixture();
  const old = f.announcements.announce({actor:'player',type:'check'}, {key:'1:2'});
  await f.tick(1000); assert.equal(await old, true);
  f.announcements.cancel({resetKeys:true});
  const fresh = f.announcements.announce({actor:'player',type:'call'}, {key:'1:2'});
  assert.notEqual(fresh, old); assert.equal(f.card.textContent, 'YOU CALL');
  await f.tick(1000); assert.equal(await fresh, true); assert.equal(f.announcements.getState().announced, 2);
});
