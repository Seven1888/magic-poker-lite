const ACTIONS = Object.freeze({check: 'CHECK', call: 'CALL', bet: 'BET', raise: 'RAISE', allin: 'ALL IN', fold: 'FOLD'});
const FILES = Object.freeze(Object.fromEntries(['player', 'npc'].map(actor => [actor,
  Object.freeze(Object.fromEntries(Object.keys(ACTIONS).map(type => [type,
    new URL(`../assets/action-voice-v59/${actor === 'player' ? 'player' : 'boss'}/${type}.wav`, import.meta.url).href])))
])));

/** Accept committed voluntary actions only; blinds, board reveals and previews have no announcement. */
export function actionAnnouncement(event) {
  if (!event || !['player', 'npc'].includes(event.actor)) return null;
  let type = event.type;
  if (!Object.hasOwn(ACTIONS, type)) return null;
  if (event.allIn && ['call', 'bet', 'raise'].includes(type)) type = 'allin';
  return {actor: event.actor, actorLabel: event.actor === 'player' ? 'YOU' : 'BOSS', type, label: ACTIONS[type]};
}

/**
 * Presentation-only feedback. Call announce once after applyAction commits history.
 * Pass a per-table hand/history key, never the reusable legal action event.id.
 * announce resolves immediately; neither the card nor speech gates the game.
 * A new action replaces the preceding card and voice, avoiding a stale backlog.
 * unlock must run in a user gesture; setEnabled follows the sound-effects toggle.
 */
export function createActionAnnouncements({root = globalThis.document, reducedMotion = false, holdMs = 1000} = {}) {
  if (!root) throw new TypeError('Action announcements need a document or DOM root.');
  const doc = root.ownerDocument || root, view = doc.defaultView || globalThis;
  const lookup = id => root.getElementById?.(id) || root.querySelector?.(`#${id}`);
  const stage = root.id === 'game' ? root : lookup('game');
  const schedule = view.setTimeout?.bind(view) || globalThis.setTimeout;
  const unschedule = view.clearTimeout?.bind(view) || globalThis.clearTimeout;
  const buffers = new Map(), seenKeys = new Map();
  let seenEvents = new WeakMap();
  let context, output, element, active = null, enabled = true, unlocked = false, destroyed = false;
  let played = 0, announced = 0;
  const canSpeak = record => active === record && !destroyed && !record.aborted && enabled && unlocked && !doc.hidden && record.voiceAllowed;
  function show(record) {
    if (!stage || !doc.createElement) return;
    if (!element) {
      element = doc.createElement('div'); element.id = 'action-announcement';
      element.className = 'action-announcement';
      element.setAttribute('role', 'status'); element.setAttribute('aria-live', 'polite');
      element.setAttribute('aria-atomic', 'true'); stage.append(element);
    }
    element.textContent = '';
    const actor = doc.createElement('span'), action = doc.createElement('strong');
    actor.className = 'action-announcement-actor'; actor.textContent = record.action.actorLabel;
    action.className = 'action-announcement-verb'; action.textContent = record.action.label;
    element.append(actor, action); element.dataset.action = record.action.type;
    element.dataset.actor = record.action.actor; element.dataset.reducedMotion = String(reducedMotion);
    element.hidden = false; stage.dataset.actionAnnouncement = record.action.type;
    announced++;
  }
  function hide() {
    if (element) element.hidden = true;
    if (stage?.dataset) delete stage.dataset.actionAnnouncement;
  }
  function loadBuffer(actor, type) {
    if (!context?.decodeAudioData || !view.fetch) return Promise.resolve(null);
    const key = `${actor}:${type}`;
    if (!buffers.has(key)) {
      buffers.set(key, Promise.resolve().then(() => view.fetch(FILES[actor][type])).then(response => {
        if (!response.ok) throw new Error('Action voice unavailable.');
        return response.arrayBuffer();
      }).then(bytes => context.decodeAudioData(bytes)).catch(() => null));
    }
    return buffers.get(key);
  }
  function playBuffer(record, buffer) {
    if (!canSpeak(record) || context?.state !== 'running') return Promise.resolve(false);
    return new Promise(resolve => {
      let source, timer, finished = false, started = false;
      const finish = () => {
        if (finished) return; finished = true;
        unschedule(timer); record.cleanups.delete(finish);
        if (record.stopVoice === finish) record.stopVoice = null;
        if (source) { source.onended = null; try { source.stop(); source.disconnect(); } catch {} }
        resolve(started);
      };
      record.cleanups.add(finish); record.stopVoice = finish;
      try {
        source = context.createBufferSource(); source.buffer = buffer; source.connect(output);
        source.onended = finish; source.start(); started = true; played++;
        timer = schedule(finish, Math.min(5000, Math.max(500, buffer.duration * 1000 + 250)));
      } catch { finish(); }
    });
  }
  function speakFallback(record) {
    if (!canSpeak(record) || !view.speechSynthesis || !view.SpeechSynthesisUtterance) return Promise.resolve();
    return new Promise(resolve => {
      const speech = view.speechSynthesis, utterance = new view.SpeechSynthesisUtterance(record.action.label);
      let timer, finished = false;
      const finish = () => {
        if (finished) return; finished = true;
        unschedule(timer); record.cleanups.delete(stop);
        if (record.stopVoice === stop) record.stopVoice = null;
        utterance.onend = null; utterance.onerror = null; resolve();
      };
      const stop = () => { if (!finished) { try { speech.cancel(); } catch {} finish(); } };
      const isPlayer = record.action.actor === 'player';
      utterance.lang = 'en-US'; utterance.rate = isPlayer ? 1 : .94; utterance.pitch = isPlayer ? 1.12 : .78; utterance.volume = 1;
      const englishVoices = (speech.getVoices?.() || []).filter(item => /^en(?:[-_]|$)/i.test(item.lang));
      const playerVoice = englishVoices.find(item => /zira/i.test(item.name || '')) || englishVoices[0];
      const voiceId = item => item?.voiceURI || item?.name;
      const otherVoices = englishVoices.filter(item => item !== playerVoice && (!voiceId(item) || voiceId(item) !== voiceId(playerVoice)));
      const bossVoice = otherVoices.find(item => /david/i.test(item.name || '')) || otherVoices[0] || playerVoice;
      const voice = isPlayer ? playerVoice : bossVoice;
      if (voice) utterance.voice = voice;
      utterance.onend = finish; utterance.onerror = finish;
      record.cleanups.add(stop); record.stopVoice = stop;
      timer = schedule(stop, 4500);
      try { speech.speak(utterance); played++; } catch { finish(); }
    });
  }
  async function speak(record) {
    if (!canSpeak(record)) return;
    // Preloaded seat-specific recordings stay consistent across devices. A slow
    // download gets a bounded fallback; a replaced action can never speak later.
    let loadingTimer;
    const loadingTimeout = new Promise(resolve => { loadingTimer = schedule(() => resolve(null), 350); });
    const stopLoading = () => unschedule(loadingTimer);
    record.cleanups.add(stopLoading);
    const buffer = await Promise.race([loadBuffer(record.action.actor, record.action.type), loadingTimeout, record.cancelled]);
    stopLoading(); record.cleanups.delete(stopLoading);
    if (!canSpeak(record)) return;
    if (buffer && context?.state === 'running' && await playBuffer(record, buffer)) return;
    await speakFallback(record);
  }
  function releaseIfFinished(record) {
    if (active === record && record.cardDone && record.voiceDone) active = null;
  }
  function present(record) {
    active = record; show(record);
    let timer;
    const clearCardTimer = () => { unschedule(timer); record.cleanups.delete(clearCardTimer); };
    record.cleanups.add(clearCardTimer);
    timer = schedule(() => {
      clearCardTimer(); record.cardDone = true;
      if (active === record) hide();
      releaseIfFinished(record);
    }, Math.max(800, Number(holdMs) || 1000));
    // This task is detached from the caller: audio failures and durations cannot
    // retain the game's busy state or delay cards, actions, and settlement.
    speak(record).catch(() => {}).finally(() => {
      record.voiceDone = true; releaseIfFinished(record);
    });
  }
  function announce(event, {key} = {}) {
    const action = actionAnnouncement(event);
    if (!action || destroyed) return Promise.resolve(false);
    if (key !== undefined && seenKeys.has(String(key))) return seenKeys.get(String(key));
    if (seenEvents.has(event)) return seenEvents.get(event);
    const promise = Promise.resolve(!doc.hidden);
    seenEvents.set(event, promise);
    if (key !== undefined) seenKeys.set(String(key), promise);
    // Returning from the background never replays actions performed while hidden.
    if (doc.hidden) return promise;
    cancel();
    let abort;
    const record = {action, voiceAllowed: enabled && unlocked, aborted: false, cardDone: false, voiceDone: false, cleanups: new Set(),
      cancelled: new Promise(done => { abort = done; }), abort: () => abort(null)};
    present(record); return promise;
  }
  async function unlock() {
    if (destroyed || doc.hidden) return false;
    const AudioContext = view.AudioContext || view.webkitAudioContext;
    try {
      if (AudioContext && (!context || context.state === 'closed')) {
        context = new AudioContext(); output = context.createGain(); output.gain.value = .95;
        output.connect(context.destination); buffers.clear();
      }
      if (context?.state === 'suspended') await context.resume();
      unlocked = context?.state === 'running' || !!view.speechSynthesis;
      if (unlocked) for (const actor of Object.keys(FILES)) for (const type of Object.keys(ACTIONS)) loadBuffer(actor, type);
    } catch { unlocked = !!view.speechSynthesis; }
    return unlocked;
  }
  function setEnabled(value) {
    enabled = !!value;
    if (!enabled) {
      if (active) { active.voiceAllowed = false; active.stopVoice?.(); }
    }
  }
  function cancel({resetKeys = false} = {}) {
    const records = active ? [active] : [];
    active = null; hide();
    for (const record of records) {
      record.aborted = true; record.abort();
      for (const cleanup of [...record.cleanups]) cleanup();
    }
    if (resetKeys) { seenKeys.clear(); seenEvents = new WeakMap(); }
  }
  function suspend() {
    cancel(); unlocked = false;
    if (context?.state === 'running') { try { Promise.resolve(context.suspend()).catch(() => {}); } catch {} }
  }
  const visibility = () => { if (doc.hidden) suspend(); };
  doc.addEventListener?.('visibilitychange', visibility); view.addEventListener?.('pagehide', suspend);
  function destroy() {
    if (destroyed) return;
    destroyed = true; cancel(); unlocked = false;
    doc.removeEventListener?.('visibilitychange', visibility); view.removeEventListener?.('pagehide', suspend);
    element?.remove(); element = null; buffers.clear(); seenKeys.clear();
    if (context && context.state !== 'closed') { try { Promise.resolve(context.close()).catch(() => {}); } catch {} }
  }
  return {announce, unlock, setEnabled, cancel, destroy,
    getState: () => ({enabled, unlocked, active: active?.action || null, queued: 0, announced, played, destroyed})};
}
