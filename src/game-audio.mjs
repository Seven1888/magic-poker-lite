import {atGameSpeed} from './presentation-timing.mjs?v=59';

// Original score: a D-minor / extended-chord lounge groove, followed by a
// faster cinematic showdown arrangement. All synthesis is local and musical
// variation follows the score counter; neither cards nor gameplay RNG enter here.
const PHASES = new Set(['off', 'table', 'showdown', 'win', 'loss', 'tie']);
const midi = note => 440 * 2 ** ((note - 69) / 12);
const CHORDS = [
  {root: 38, keys: [53, 57, 60, 64, 69], lead: [74, 77, 81, 84]}, // Dm9
  {root: 34, keys: [53, 57, 60, 62, 65], lead: [74, 77, 81, 86]}, // Bbmaj9
  {root: 31, keys: [53, 57, 58, 62, 67], lead: [74, 77, 79, 82]}, // Gm9
  {root: 33, keys: [55, 58, 61, 64, 69], lead: [73, 76, 79, 82]}  // A7(b9)
];
const SOUND_NOTES = {
  click: [[640, 0, .045, 'triangle', .08]],
  chip: [[1320, 0, .045, 'sine', .12], [1760, .03, .06, 'sine', .075]],
  chips: [[1480, 0, .045, 'triangle', .12], [2170, .008, .035, 'sine', .07],
    [1120, .064, .05, 'triangle', .11], [1880, .102, .04, 'sine', .08],
    [1560, .166, .045, 'triangle', .11], [2410, .195, .035, 'sine', .06],
    [1280, .25, .055, 'triangle', .1], [1960, .286, .04, 'sine', .07]],
  'chip-arrival': [[720, 0, .065, 'triangle', .11], [1660, .008, .055, 'sine', .1],
    [2280, .032, .04, 'sine', .07], [1210, .068, .065, 'triangle', .075]],
  win: [[523.25, 0, .11, 'triangle', .13], [659.25, .075, .11, 'triangle', .12], [783.99, .15, .18, 'triangle', .12]],
  loss: [[392, 0, .12, 'triangle', .1], [293.66, .09, .16, 'triangle', .095]],
  'lead-up': [[587.33, 0, .13, 'sine', .14], [880, .07, .18, 'sine', .12], [1174.66, .14, .36, 'triangle', .1]],
  'lead-down': [[587.33, 0, .14, 'sine', .1], [440, .1, .24, 'triangle', .1]],
  suspense: [[146.83, 0, .42, 'sine', .18], [220, .08, .32, 'triangle', .08]]
};

/** Independent, lazy Web Audio mixer. A user gesture must call unlock(). */
export function createGameAudio({doc = globalThis.document, view = doc?.defaultView || globalThis, _offlineContext, _rawScore = false} = {}) {
  const schedule = view.setTimeout?.bind(view) || globalThis.setTimeout;
  const unschedule = view.clearTimeout?.bind(view) || globalThis.clearTimeout;
  let context, master, musicOutput, effectsOutput, reverb, delay, noiseBuffer;
  let unlocked = false, destroyed = false, muted = false, musicEnabled = true, effectsEnabled = true;
  let phase = 'off', activePhase = 'off', segment, timer, nextBeat = 0, step = 0;
  let scheduledSteps = 0, phaseStarts = 0;
  let musicBackend = 'off';
  const loopCache = new Map();
  const voices = new Set(), connections = new Set(), retireTimers = new Set();
  const running = () => !destroyed && !doc?.hidden && unlocked && context?.state === 'running';
  const musicAllowed = () => running() && !muted && musicEnabled && phase !== 'off';

  const connect = (node, target) => { node.connect(target); connections.add(node); return node; };
  function ramp(param, value, at, duration = .08) {
    param.cancelScheduledValues(at);
    param.setValueAtTime(Math.max(.0001, param.value || .0001), at);
    if (param.linearRampToValueAtTime) param.linearRampToValueAtTime(value, at + duration);
    else param.setValueAtTime(value, at + duration);
  }

  function buildMixer() {
    master = context.createGain(); master.gain.value = muted ? 0 : _rawScore ? 1 : .72;
    musicOutput = context.createGain(); musicOutput.gain.value = musicEnabled ? _rawScore ? 1 : .68 : 0;
    effectsOutput = context.createGain(); effectsOutput.gain.value = effectsEnabled ? .9 : 0;
    connect(musicOutput, master); connect(effectsOutput, master);
    // A gentle bus compressor catches coincident kick/chord/card transients.
    if (!_rawScore && context.createDynamicsCompressor) {
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -10; limiter.knee.value = 16;
      limiter.ratio.value = 4; limiter.attack.value = .006; limiter.release.value = .2;
      connect(master, limiter); connect(limiter, context.destination);
    } else connect(master, context.destination);
    if (!context.createBuffer) return;
    let noiseState = 0x19ad837f;
    const noise = () => {
      noiseState = (Math.imul(noiseState, 1664525) + 1013904223) >>> 0;
      return noiseState / 2147483648 - 1;
    };
    noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const paper = noiseBuffer.getChannelData(0);
    for (let i = 0; i < paper.length; i++) paper[i] = noise();
    if (context.createConvolver) {
      reverb = context.createConvolver();
      const length = Math.floor(context.sampleRate * 1.65);
      const impulse = context.createBuffer(2, length, context.sampleRate);
      for (let channel = 0; channel < 2; channel++) {
        const data = impulse.getChannelData(channel);
        for (let i = 0; i < length; i++) {
          const envelope = 1 - i / length;
          data[i] = noise() * envelope * envelope * envelope * .26;
        }
      }
      reverb.buffer = impulse;
      const wet = context.createGain(); wet.gain.value = .24;
      connect(reverb, wet); connect(wet, musicOutput);
    }
    if (context.createDelay) {
      delay = context.createDelay(1); delay.delayTime.value = .28125;
      const feedback = context.createGain(); feedback.gain.value = .2;
      const wet = context.createGain(); wet.gain.value = .19;
      connect(delay, feedback); connect(feedback, delay); connect(delay, wet); connect(wet, musicOutput);
    }
  }

  function release(voice) {
    if (!voices.delete(voice)) return;
    voice.source.onended = null;
    for (const node of voice.nodes) { try { node.disconnect(); } catch { /* Already detached. */ } }
  }
  function stopVoices(channel, ownedSegment) {
    for (const voice of [...voices]) {
      if (channel && voice.channel !== channel) continue;
      if (ownedSegment && voice.segment !== ownedSegment) continue;
      try { voice.source.stop(); } catch { /* A completed source is harmless. */ }
      release(voice);
    }
  }
  function sourceVoice(source, {at, duration, peak, attack = .007, pan = 0, cutoff, filterType = 'lowpass', channel = 'music', send = 0, echo = false} = {}) {
    if (!_offlineContext && voices.size >= 160) { source.disconnect(); return; }
    const gain = context.createGain(), nodes = [source, gain];
    const voice = {source, nodes, channel, segment};
    let tail = source;
    if (cutoff && context.createBiquadFilter) {
      const filter = context.createBiquadFilter(); filter.type = filterType;
      filter.frequency.setValueAtTime(cutoff, at); filter.Q.value = .5;
      tail.connect(filter); tail = filter; nodes.push(filter);
    }
    tail.connect(gain); tail = gain;
    const floor = .0001, end = at + duration;
    gain.gain.setValueAtTime(floor, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(floor, peak), at + Math.min(attack, duration * .4));
    gain.gain.exponentialRampToValueAtTime(floor, end);
    if (pan && context.createStereoPanner) {
      const panner = context.createStereoPanner(); panner.pan.setValueAtTime(pan, at);
      tail.connect(panner); tail = panner; nodes.push(panner);
    }
    tail.connect(channel === 'music' ? segment : effectsOutput);
    if (channel === 'music' && send && reverb) {
      const wet = context.createGain(); wet.gain.value = send;
      tail.connect(wet); wet.connect(reverb); nodes.push(wet);
    }
    if (channel === 'music' && echo && delay) {
      const wet = context.createGain(); wet.gain.value = .3;
      tail.connect(wet); wet.connect(delay); nodes.push(wet);
    }
    voices.add(voice); source.onended = () => release(voice);
    source.start(at); source.stop(end + .0125);
  }
  function tone(frequency, at, duration, peak, options = {}) {
    const source = context.createOscillator(); source.type = options.type || 'sine';
    source.frequency.setValueAtTime(frequency, at);
    if (options.to) source.frequency.exponentialRampToValueAtTime(options.to, at + duration * .9);
    sourceVoice(source, {at, duration, peak, ...options});
  }
  function texture(at, duration, peak, options = {}) {
    if (!noiseBuffer || !context.createBufferSource) {
      tone(410, at, duration, peak * .3, {type: 'triangle', ...options}); return;
    }
    const source = context.createBufferSource(); source.buffer = noiseBuffer;
    sourceVoice(source, {at, duration, peak, ...options});
  }
  function keys(notes, at, duration, intensity = 1) {
    notes.forEach((note, i) => {
      const pan = (i - 2) * .17, frequency = midi(note);
      tone(frequency, at + i * .006, duration, .034 * intensity, {type: 'triangle', cutoff: 2300, pan, send: .8, attack: .012});
      tone(frequency * 2.001, at + i * .006, duration * .42, .012 * intensity, {pan, send: .35, attack: .004});
    });
  }
  function pad(notes, at, duration, intensity = 1) {
    notes.slice(0, 4).forEach((note, i) => tone(midi(note - 12) * (i % 2 ? 1.002 : .998), at, duration,
      .02 * intensity, {type: 'triangle', cutoff: 720, attack: .3, pan: (i - 1.5) * .3, send: 1}));
  }
  function bass(note, at, duration, hot = false) {
    tone(midi(note), at, duration, hot ? .16 : .13, {type: 'triangle', cutoff: 420, attack: .012});
    tone(midi(note - 12), at, duration * .95, .07, {attack: .012});
  }
  function kick(at, hot = false) {
    tone(hot ? 155 : 110, at, .24, hot ? .3 : .22, {to: 44, attack: .002});
    texture(at, .024, hot ? .055 : .025, {cutoff: 1600, attack: .001});
  }
  function snare(at, hot = false) {
    texture(at, hot ? .18 : .11, hot ? .18 : .072, {cutoff: 1400, filterType: 'highpass', pan: .12, send: .1, attack: .002});
    tone(185, at, .095, hot ? .11 : .036, {to: 110, attack: .002});
  }
  function hat(at, open = false, accent = 1) {
    texture(at, open ? .14 : .041, .039 * accent, {cutoff: 6800, filterType: 'highpass', pan: -.32, attack: .002});
  }

  function score(index, at) {
    const hot = activePhase === 'showdown', beat = 60 / (hot ? 128 : 96);
    const bar = Math.floor(index / 16), position = index % 16;
    const chord = CHORDS[(Math.floor(bar / (hot ? 1 : 2))) % 4];
    if (position === 0) {
      keys(chord.keys, at, beat * (hot ? 2.3 : 3.3), hot ? 1.25 : 1);
      if (bar % 2 === 0 || hot) pad(chord.keys, at, beat * (hot ? 3.6 : 7.6), hot ? 1.2 : 1);
    }
    if (!hot) {
      // Spacious syncopation, a brushed backbeat and a lightly swung ride.
      if ([0, 6, 10, 14].includes(position)) bass(chord.root + (position === 10 ? 7 : position === 14 ? 12 : 0), at, beat * .68);
      if ([0, 8, 11].includes(position)) kick(at);
      if ([4, 12].includes(position)) snare(at);
      if (position % 2 === 0) hat(at + (position % 4 === 2 ? .034 : 0), false, position % 4 === 0 ? .8 : 1);
      if (position === 10 && bar % 2 === 1) keys(chord.keys.slice(1), at, beat * 1.5, .58);
      if ([3, 7, 14].includes(position) && bar % 2 === 1) {
        const note = chord.lead[[3, 7, 14].indexOf(position)];
        tone(midi(note), at, beat * 1.5, .029, {type: 'sine', pan: .3, send: .85, echo: true, attack: .018});
      }
    } else {
      // The opening hit is immediate; a driving pulse continues under both cards.
      if (position % 4 === 0 || position === 14) kick(at, true);
      if ([4, 12].includes(position)) snare(at, true);
      if (position % 2 === 0) bass(chord.root + (position % 8 === 6 ? 12 : 0), at, beat * .37, true);
      hat(at, position === 7 || position === 15, position % 2 ? .72 : 1.35);
      if ([0, 3, 6, 8, 10, 12, 14].includes(position)) {
        const melody = [0, 0, 1, 2, 1, 2, 3], rank = [0, 3, 6, 8, 10, 12, 14].indexOf(position);
        const note = chord.lead[melody[rank]];
        tone(midi(note), at, beat * .65, .059, {type: 'triangle', cutoff: 3600, pan: .16, send: .55, echo: true, attack: .009});
        tone(midi(note - 12) * 1.004, at, beat * .6, .024, {type: 'sawtooth', cutoff: 1300, pan: -.22, send: .35});
      }
    }
  }

  function opening(at) {
    if (activePhase === 'showdown') {
      texture(at, .85, .17, {cutoff: 4600, filterType: 'highpass', pan: -.12, send: .8, attack: .004});
      tone(82.4, at, .85, .22, {to: 36.7, attack: .002});
      // Rising notes bridge into the fast arrangement without a silent beat.
      [62, 65, 69, 74].forEach((note, i) => tone(midi(note), at + i * .09, .4, .057,
        {type: 'triangle', cutoff: 2500, pan: (i - 1.5) * .18, send: .9, echo: true}));
    } else if (['win', 'loss', 'tie'].includes(activePhase)) {
      const notes = activePhase === 'win' ? [50, 57, 62, 66, 69, 74] : activePhase === 'loss' ? [38, 53, 57, 60, 64] : [43, 53, 57, 62, 67];
      keys(notes, at, 2.5, 1.35); pad(notes, at, 3.8, 1.4);
      if (activePhase === 'win') {
        texture(at, .65, .11, {cutoff: 6000, filterType: 'highpass', send: .7, attack: .008});
        [74, 78, 81, 86].forEach((note, i) => tone(midi(note), at + i * .12, .9, .06, {send: .9, pan: .2, echo: true}));
      }
    }
  }
  function cancelScheduler() {
    if (timer !== undefined) unschedule(timer);
    timer = undefined;
  }
  function retireSegment(fade = true) {
    const previous = segment;
    if (!previous) return;
    segment = undefined;
    if (fade && context?.state === 'running') {
      ramp(previous.gain, 0, context.currentTime, .22);
      const id = schedule(() => {
        retireTimers.delete(id); stopVoices('music', previous); previous.disconnect(); connections.delete(previous);
      }, 250);
      retireTimers.add(id);
    } else { stopVoices('music', previous); previous.disconnect(); connections.delete(previous); }
  }
  function tick() {
    timer = undefined;
    if (!musicAllowed()) { stopMusic(false); return; }
    // Audio clocks can jump on resume. Never replay a backlog of missed beats.
    if (nextBeat < context.currentTime - .05) nextBeat = context.currentTime + .018;
    const interval = 60 / (activePhase === 'showdown' ? 128 : 96) / 4;
    while (nextBeat < context.currentTime + .12) {
      score(step++, nextBeat); scheduledSteps++; nextBeat += interval;
    }
    timer = schedule(tick, 45);
  }
  function stopMusic(fade = true) {
    cancelScheduler(); retireSegment(fade); activePhase = 'off'; musicBackend = 'off';
  }
  function loopPhase() { return phase === 'showdown' ? 'showdown' : 'table'; }
  function startLoop(buffer, at, offset = 0) {
    const source = context.createBufferSource(); source.buffer = buffer; source.loop = true;
    source.loopStart = 0; source.loopEnd = buffer.duration;
    const voice = {source, nodes: [source], channel: 'music', segment};
    source.connect(segment); voices.add(voice); source.onended = () => release(voice);
    source.start(at, offset % buffer.duration);
    musicBackend = 'buffer'; cancelScheduler();
  }
  function useReadyLoop() {
    if (!musicAllowed() || activePhase !== phase || musicBackend !== 'synthesis') return;
    if (!['table', 'showdown'].includes(phase)) return;
    const buffer = loopCache.get(loopPhase())?.buffer;
    if (!buffer) return;
    const interval = 60 / (phase === 'showdown' ? 128 : 96) / 4;
    const position = Math.max(0, step * interval - (nextBeat - context.currentTime));
    cancelScheduler(); retireSegment(true);
    segment = context.createGain(); segment.gain.value = .0001;
    connect(segment, musicOutput); ramp(segment.gain, 1, context.currentTime, .22);
    startLoop(buffer, context.currentTime + .015, position + .015);
  }
  function decodeLoop(record) {
    if (destroyed || !record.bytes || record.decode || record.buffer || !context?.decodeAudioData) return;
    record.decode = Promise.resolve().then(() => context.decodeAudioData(record.bytes)).then(buffer => {
      record.bytes = null;
      if (destroyed) return;
      record.buffer = buffer; useReadyLoop();
    }, () => { record.bytes = null; record.failed = true; });
  }
  function preloadLoops() {
    if (_offlineContext || !view.fetch) return;
    for (const name of ['table', 'showdown']) {
      const record = {bytes: null, buffer: null, failed: false}; loopCache.set(name, record);
      // Fetching is silent and does not create an AudioContext. Decoding waits
      // for gesture activation; the live score remains a no-network fallback.
      Promise.resolve().then(() => view.fetch(new URL(`../assets/audio/${name}-v44.wav`, import.meta.url)))
        .then(response => { if (!response.ok) throw new Error('Score unavailable'); return response.arrayBuffer(); })
        .then(bytes => { if (destroyed) return; record.bytes = bytes; decodeLoop(record); })
        .catch(() => { record.failed = true; });
    }
  }
  function startMusic() {
    if (!musicAllowed() || activePhase === phase) return;
    cancelScheduler(); retireSegment(true);
    segment = context.createGain(); segment.gain.value = .0001;
    connect(segment, musicOutput); ramp(segment.gain, 1, context.currentTime, .12);
    activePhase = phase; musicBackend = 'synthesis'; phaseStarts++; step = 0; nextBeat = context.currentTime + .025;
    opening(nextBeat);
    // Resolution cadences breathe before the lounge groove returns underneath.
    if (['win', 'loss', 'tie'].includes(phase)) nextBeat += 1.6;
    const buffer = loopCache.get(loopPhase())?.buffer;
    if (buffer) startLoop(buffer, nextBeat); else tick();
  }

  async function unlock() {
    if (destroyed || doc?.hidden) return false;
    try {
      if (!context || context.state === 'closed') {
        const AudioContextClass = view.AudioContext || view.webkitAudioContext;
        if (!AudioContextClass) return false;
        if (context) {
          stopMusic(false); stopVoices();
          for (const node of connections) { try { node.disconnect(); } catch { /* Closed graph. */ } }
          connections.clear();
        }
        context = new AudioContextClass(); buildMixer();
        for (const record of loopCache.values()) decodeLoop(record);
      }
      if (context.state === 'suspended' || context.state === 'interrupted') await context.resume();
      unlocked = !destroyed && !doc?.hidden && context.state === 'running';
      if (unlocked) startMusic();
      return unlocked;
    } catch { unlocked = false; return false; }
  }
  function suspendAudio() {
    unlocked = false; stopMusic(false); stopVoices();
    if (context && context.state !== 'closed') {
      try { Promise.resolve(context.suspend()).catch(() => {}); } catch { /* Browser lifecycle. */ }
    }
  }
  function setMuted(value) {
    muted = Boolean(value);
    if (destroyed) return;
    if (muted) { stopMusic(false); stopVoices(); }
    if (master && context?.state !== 'closed') {
      master.gain.cancelScheduledValues(context.currentTime); master.gain.setValueAtTime(muted ? 0 : .72, context.currentTime);
    }
    if (!muted) startMusic();
  }
  function setMusicEnabled(value) {
    musicEnabled = Boolean(value);
    if (destroyed) return;
    if (!musicEnabled) { stopMusic(false); stopVoices('music'); }
    if (musicOutput) { musicOutput.gain.cancelScheduledValues(context.currentTime); musicOutput.gain.setValueAtTime(musicEnabled ? .68 : 0, context.currentTime); }
    if (musicEnabled) startMusic();
  }
  function setEffectsEnabled(value) {
    effectsEnabled = Boolean(value);
    if (destroyed) return;
    if (!effectsEnabled) stopVoices('effects');
    if (effectsOutput) effectsOutput.gain.setValueAtTime(effectsEnabled ? .9 : 0, context.currentTime);
  }
  function setMusicPhase(value) {
    if (destroyed || !PHASES.has(value)) return false;
    if (phase === value) return true;
    phase = value;
    if (phase === 'off') stopMusic(true); else startMusic();
    return true;
  }
  function play(name) {
    if (!running() || muted || !effectsEnabled) return false;
    const at = context.currentTime;
    try {
      if (name === 'deal' || name === 'reveal') {
        // Paper friction followed by the low, dry tap of a card hitting felt.
        const reveal = name === 'reveal';
        texture(at, atGameSpeed(reveal ? .12 : .17), reveal ? .27 : .3,
          {channel: 'effects', cutoff: reveal ? 2100 : 1250, filterType: 'bandpass', attack: .009});
        tone(reveal ? 620 : 310, at + atGameSpeed(.055), atGameSpeed(.07), .11,
          {channel: 'effects', type: 'triangle', to: reveal ? 260 : 115, cutoff: 1800, attack: .002});
        return true;
      }
      const notes = Object.hasOwn(SOUND_NOTES, name) ? SOUND_NOTES[name] : null;
      if (!notes) return false;
      for (const [frequency, offset, duration, type, peak] of notes) {
        tone(frequency, at + atGameSpeed(offset), atGameSpeed(duration), peak,
          {channel: 'effects', type, attack: atGameSpeed(.008)});
      }
      return true;
    } catch { stopVoices('effects'); return false; }
  }
  function getAudioState() {
    return {unlocked, muted, musicEnabled, effectsEnabled, phase, activePhase,
      contextState: context?.state || 'uninitialized', scheduledSteps, phaseStarts,
      activeVoices: voices.size, schedulerActive: timer !== undefined, musicBackend,
      cachedLoops: [...loopCache].filter(([, record]) => record.buffer).map(([name]) => name)};
  }
  // The QA renderer schedules the same instruments and score into a separate
  // offline context. It never changes the live mixer or starts a timer.
  function renderOffline(previewPhase, seconds, loop = false) {
    if (!_offlineContext || context) throw new Error('An unused offline renderer is required.');
    context = _offlineContext; buildMixer();
    phase = previewPhase; activePhase = previewPhase;
    segment = context.createGain(); segment.gain.value = 1; connect(segment, musicOutput);
    const start = loop ? 0 : .04, beat = 60 / (phase === 'showdown' ? 128 : 96) / 4;
    if (!loop) opening(start);
    const firstBeat = start + (['win', 'loss', 'tie'].includes(phase) ? 1.6 : 0);
    for (let index = 0, at = firstBeat; at < seconds; index++, at = firstBeat + index * beat) score(index, at);
    return context.startRendering();
  }
  function destroy() {
    if (destroyed) return;
    destroyed = true; unlocked = false; stopMusic(false); stopVoices();
    for (const id of retireTimers) unschedule(id);
    retireTimers.clear();
    for (const node of connections) { try { node.disconnect(); } catch { /* Already detached. */ } }
    connections.clear();
    loopCache.clear();
    if (context && context.state !== 'closed') {
      try { Promise.resolve(context.close()).catch(() => {}); } catch { /* Browser lifecycle. */ }
    }
  }
  preloadLoops();
  return {unlock, suspendAudio, setMuted, setMusicEnabled, setEffectsEnabled, setMusicPhase, getAudioState, play, destroy, renderOffline};
}

/** Render an audition of the actual score, independently of an active game. */
export async function renderGameAudioPreview({phase = 'table', seconds = 8, sampleRate = 44100,
  OfflineAudioContext = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext} = {}) {
  if (!PHASES.has(phase) || phase === 'off') throw new TypeError('Choose an audible score phase.');
  if (!Number.isFinite(seconds) || seconds < 1 || seconds > 30) throw new RangeError('Preview duration must be between 1 and 30 seconds.');
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 96000) throw new RangeError('Invalid audio sample rate.');
  if (!OfflineAudioContext) throw new Error('Offline Web Audio is unavailable.');
  const context = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  const audio = createGameAudio({doc: {hidden: false}, view: {}, _offlineContext: context});
  try { return await audio.renderOffline(phase, seconds); } finally { audio.destroy(); }
}

/** Asset authoring: take a stable middle cycle so reverb/delay wrap naturally.
 * Returns raw premix audio; the live mixer applies channel/master gain once. */
export async function renderGameAudioLoop({phase = 'table', sampleRate = 32000,
  OfflineAudioContext = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext} = {}) {
  if (!['table', 'showdown'].includes(phase)) throw new TypeError('Only table and showdown have score loops.');
  if (!OfflineAudioContext) throw new Error('Offline Web Audio is unavailable.');
  const seconds = phase === 'table' ? 20 : 7.5;
  const context = new OfflineAudioContext(2, Math.ceil(seconds * 3 * sampleRate), sampleRate);
  const audio = createGameAudio({doc: {hidden: false}, view: {}, _offlineContext: context, _rawScore: true});
  try {
    const rendered = await audio.renderOffline(phase, seconds * 3, true);
    const length = Math.round(seconds * sampleRate);
    return {sampleRate, length, channels: [0, 1].map(channel => rendered.getChannelData(channel).slice(length, length * 2))};
  } finally { audio.destroy(); }
}
