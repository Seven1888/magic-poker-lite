const ACTIONS = Object.freeze({check: 'CHECK', call: 'CALL', bet: 'BET', raise: 'RAISE', allin: 'ALL IN', fold: 'FOLD'});
const FILES = Object.freeze({
  check: new URL('../assets/action-voice-v58/check.wav', import.meta.url).href,
  call: new URL('../assets/action-voice-v58/call.wav', import.meta.url).href,
  bet: new URL('../assets/action-voice-v58/bet.wav', import.meta.url).href,
  raise: new URL('../assets/action-voice-v58/raise.wav', import.meta.url).href,
  allin: new URL('../assets/action-voice-v58/allin.wav', import.meta.url).href,
  fold: new URL('../assets/action-voice-v58/fold.wav', import.meta.url).href
});

/** Accept committed voluntary actions only; blinds, board reveals and previews have no announcement. */
export function actionAnnouncement(event) {
  if (!event || !['player', 'npc'].includes(event.actor)) return null;
  let type = event.type;
  if (!Object.hasOwn(ACTIONS, type)) return null;
  if (event.allIn && ['call', 'bet', 'raise'].includes(type)) type = 'allin';
  return {actor: event.actor, actorLabel: event.actor === 'player' ? 'YOU' : 'BOSS', type, label: ACTIONS[type]};
}

/**
 * Presentation-only FIFO. Call announce once after applyAction commits history.
 * Pass a per-table hand/history key, never the reusable legal action event.id.
 * Await announce before dealing the next street or starting the next decision.
 * unlock must run in a user gesture; setEnabled follows the sound-effects toggle.
 */
export function createActionAnnouncements({root = globalThis.document, reducedMotion = false, holdMs = 1000} = {}) {
  if (!root) throw new TypeError('Action announcements need a document or DOM root.');
  const doc = root.ownerDocument || root, view = doc.defaultView || globalThis;
  const lookup = id => root.getElementById?.(id) || root.querySelector?.(`#${id}`);
  const stage = root.id === 'game' ? root : lookup('game');
  const schedule = view.setTimeout?.bind(view) || globalThis.setTimeout;
  const unschedule = view.clearTimeout?.bind(view) || globalThis.clearTimeout;
  const buffers = new Map(), queue = [], seenKeys = new Map(), seenEvents = new WeakMap();
  let context, output, element, active = null, enabled = true, unlocked = false, destroyed = false;
  let played = 0, announced = 0;
  const canSpeak = record => !destroyed && !record.aborted && enabled && unlocked && !doc.hidden && record.voiceAllowed;

  function wait(record, ms) {
    return new Promise(resolve => {
      let timer;
      const finish = () => { unschedule(timer); record.cleanups.delete(finish); resolve(); };
      record.cleanups.add(finish); timer = schedule(finish, ms);
    });
  }
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
  function loadBuffer(type) {
    if (!context?.decodeAudioData || !view.fetch) return Promise.resolve(null);
    if (!buffers.has(type)) {
      buffers.set(type, Promise.resolve().then(() => view.fetch(FILES[type])).then(response => {
        if (!response.ok) throw new Error('Action voice unavailable.');
        return response.arrayBuffer();
      }).then(bytes => context.decodeAudioData(bytes)).catch(() => null));
    }
    return buffers.get(type);
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
      utterance.lang = 'en-US'; utterance.rate = .95; utterance.pitch = 1; utterance.volume = 1;
      const voice = speech.getVoices?.().find(item => /^en[-_]US$/i.test(item.lang)) || speech.getVoices?.().find(item => /^en\b/i.test(item.lang));
      if (voice) utterance.voice = voice;
      utterance.onend = finish; utterance.onerror = finish;
      record.cleanups.add(stop); record.stopVoice = stop;
      timer = schedule(stop, 4500);
      try { speech.speak(utterance); played++; } catch { finish(); }
    });
  }
  async function speak(record) {
    if (!canSpeak(record)) return;
    // Preloaded local recordings are consistent across devices. A failed/slow
    // download falls back to the browser's English voice without blocking play.
    let loadingTimer;
    const loadingTimeout = new Promise(resolve => { loadingTimer = schedule(() => resolve(null), 1200); });
    const stopLoading = () => unschedule(loadingTimer);
    record.cleanups.add(stopLoading);
    const buffer = await Promise.race([loadBuffer(record.action.type), loadingTimeout, record.cancelled]);
    stopLoading(); record.cleanups.delete(stopLoading);
    if (!canSpeak(record)) return;
    if (buffer && context?.state === 'running' && await playBuffer(record, buffer)) return;
    await speakFallback(record);
  }
  function pump() {
    if (destroyed || active || !queue.length) return;
    const record = queue.shift(); active = record; show(record);
    Promise.race([Promise.all([wait(record, Math.max(800, Number(holdMs) || 1000)), speak(record)]), record.cancelled])
      .then(() => {
        if (active !== record) return;
        for (const cleanup of [...record.cleanups]) cleanup();
        active = null; hide(); record.resolve(!record.aborted); pump();
      }).catch(() => {
        // Audio support must never strand the game after its action committed.
        if (active !== record) return;
        for (const cleanup of [...record.cleanups]) cleanup();
        active = null; hide(); record.resolve(false); pump();
      });
  }
  function announce(event, {key} = {}) {
    const action = actionAnnouncement(event);
    if (!action || destroyed) return Promise.resolve(false);
    if (key !== undefined && seenKeys.has(String(key))) return seenKeys.get(String(key));
    if (seenEvents.has(event)) return seenEvents.get(event);
    let resolve, abort;
    const promise = new Promise(done => { resolve = done; });
    const record = {action, resolve, voiceAllowed: enabled && unlocked, aborted: false, cleanups: new Set(),
      cancelled: new Promise(done => { abort = done; }), abort: () => abort(null)};
    seenEvents.set(event, promise);
    if (key !== undefined) seenKeys.set(String(key), promise);
    // Returning from the background never replays actions performed while hidden.
    if (doc.hidden) { resolve(false); return promise; }
    queue.push(record); pump(); return promise;
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
      if (unlocked) for (const type of Object.keys(FILES)) loadBuffer(type);
    } catch { unlocked = !!view.speechSynthesis; }
    return unlocked;
  }
  function setEnabled(value) {
    enabled = !!value;
    if (!enabled) {
      if (active) { active.voiceAllowed = false; active.stopVoice?.(); }
      for (const record of queue) record.voiceAllowed = false;
    }
  }
  function cancel({resetKeys = false} = {}) {
    const records = active ? [active, ...queue] : [...queue];
    active = null; queue.length = 0; hide();
    for (const record of records) {
      record.aborted = true; record.abort();
      for (const cleanup of [...record.cleanups]) cleanup();
      record.resolve(false);
    }
    if (resetKeys) seenKeys.clear();
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
    getState: () => ({enabled, unlocked, active: active?.action || null, queued: queue.length, announced, played, destroyed})};
}
