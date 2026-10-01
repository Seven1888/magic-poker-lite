/** Presentation only: no game state, card markup, or random-number access. */
export function createGameEffects({root = globalThis.document, reducedMotion = false} = {}) {
  if (!root) throw new TypeError('createGameEffects needs a document or DOM root.');
  const doc = root.ownerDocument || root;
  const view = doc.defaultView || globalThis;
  const lookup = id => root.getElementById?.(id) || root.querySelector?.(`#${id}`) || null;
  const voices = new Set();
  const flights = new Map();
  const sequences = new Set(), pauses = new Set();
  const schedule = view.setTimeout?.bind(view) || globalThis.setTimeout;
  const unschedule = view.clearTimeout?.bind(view) || globalThis.clearTimeout;
  let context = null, master = null, muted = false, unlocked = false, destroyed = false;

  // [frequency, start offset, duration, waveform, envelope peak]. The master
  // keeps these deliberately quiet; every sound is deterministic and short.
  const sounds = {
    click: [[640, 0, .045, 'triangle', .08]],
    deal: [[430, 0, .045, 'triangle', .08], [690, .025, .045, 'triangle', .05]],
    chip: [[1320, 0, .045, 'sine', .08], [1760, .03, .06, 'sine', .045]],
    win: [[523.25, 0, .11, 'triangle', .09], [659.25, .075, .11, 'triangle', .08], [783.99, .15, .18, 'triangle', .08]],
    loss: [[392, 0, .12, 'triangle', .07], [293.66, .09, .16, 'triangle', .065]]
  };

  function stopVoices() {
    for (const voice of voices) {
      voice.oscillator.onended = null;
      try { voice.oscillator.stop(); } catch { /* It may have already ended. */ }
      voice.oscillator.disconnect();
      voice.gain.disconnect();
    }
    voices.clear();
  }

  /** Call from a user gesture. Returns false when audio is unavailable/blocked. */
  async function unlock() {
    if (destroyed || doc.hidden) return false;
    try {
      if (!context || context.state === 'closed') {
        const AudioContextClass = view.AudioContext || view.webkitAudioContext;
        if (!AudioContextClass) return false;
        context = new AudioContextClass();
        master = context.createGain();
        master.gain.value = muted ? 0 : .12;
        master.connect(context.destination);
      }
      if (context.state === 'suspended' || context.state === 'interrupted') await context.resume();
      unlocked = !destroyed && !doc.hidden && context.state === 'running';
      return unlocked;
    } catch {
      unlocked = false;
      return false;
    }
  }

  /** Mobile app switches can interrupt Web Audio without unloading the page. */
  function suspendAudio() {
    unlocked = false;
    stopVoices();
    if (context && context.state !== 'closed') {
      try { Promise.resolve(context.suspend()).catch(() => {}); } catch { /* Unavailable while the page is suspended. */ }
    }
  }

  function setMuted(value) {
    muted = Boolean(value);
    if (destroyed) return;
    if (muted) stopVoices();
    if (master && context?.state !== 'closed') {
      master.gain.cancelScheduledValues(context.currentTime);
      master.gain.setValueAtTime(muted ? 0 : .12, context.currentTime);
    }
  }

  /** Does not create or resume AudioContext; unlock() owns gesture activation. */
  function play(name) {
    const notes = Object.hasOwn(sounds, name) ? sounds[name] : null;
    if (!notes || destroyed || doc.hidden || muted || !unlocked || context?.state !== 'running') return false;
    const start = context.currentTime;
    try {
      for (const [frequency, offset, duration, type, peak] of notes) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const voice = {oscillator, gain};
        const at = start + offset;
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, at);
        gain.gain.setValueAtTime(.0001, at);
        gain.gain.exponentialRampToValueAtTime(peak, at + .008);
        gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
        oscillator.connect(gain);
        gain.connect(master);
        voices.add(voice);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
          voices.delete(voice);
        };
        oscillator.start(at);
        oscillator.stop(at + duration + .015);
      }
      return true;
    } catch {
      stopVoices();
      return false;
    }
  }

  const uniqueCards = targets => [...new Set(Array.from(targets || []))].filter(card => card?.style);

  function beginSequence() {
    let stopped = false, stop;
    const cancelled = new Promise(resolve => { stop = resolve; });
    const sequence = {
      alive: () => !destroyed && !stopped,
      cancel() { stopped = true; stop(); },
      async wait(promise) { await Promise.race([promise, cancelled]); return sequence.alive(); }
    };
    sequences.add(sequence);
    return sequence;
  }

  function pause(ms) {
    if (destroyed || reducedMotion || ms <= 0) return Promise.resolve();
    return new Promise(resolve => {
      let timer;
      const record = {finish() { unschedule(timer); pauses.delete(record); resolve(); }};
      pauses.add(record); timer = schedule(record.finish, ms);
    });
  }

  /** Always release the flight record before the caller's next phase/callback. */
  function animateCard(card, keyframes, options) {
    flights.get(card)?.finish();
    if (destroyed || reducedMotion || typeof card.animate !== 'function') return Promise.resolve();
    let animation;
    try { animation = card.animate(keyframes, options); } catch { return Promise.resolve(); }
    return new Promise(resolve => {
      let done = false, timer;
      const record = {finish() {
        if (done) return;
        done = true; unschedule(timer);
        try { animation.cancel?.(); } catch { /* Detached/cancelled animation. */ }
        if (flights.get(card) === record) flights.delete(card);
        resolve();
      }};
      flights.set(card, record);
      // A broken/throttled finished promise must not strand the presentation flow.
      timer = schedule(record.finish, options.duration + (options.delay || 0) + 80);
      if (animation.finished?.then) animation.finished.then(record.finish, record.finish);
    });
  }

  /** Caller supplies backs. Pending cards stay hidden; each landing may await a flip. */
  async function deal(targets = [], {onLand} = {}) {
    if (destroyed) return;
    const cards = uniqueCards(targets), sequence = beginSequence();
    const visibility = cards.map(card => card.style.visibility || '');
    cards.forEach(card => { card.style.visibility = 'hidden'; });
    try {
      for (let index = 0; index < cards.length && sequence.alive(); index++) {
        const card = cards[index], deckRect = lookup('deck-button')?.getBoundingClientRect?.();
        const stage = lookup('game'), stageRect = stage?.getBoundingClientRect?.();
        const rect = card.getBoundingClientRect?.();
        const scaleX = stageRect?.width / stage?.offsetWidth;
        const scaleY = stage?.offsetHeight > 0 ? stageRect?.height / stage.offsetHeight : scaleX;
        card.style.visibility = 'visible';
        if (card.dataset) card.dataset.motion = 'dealing';
        play('deal');
        if (rect?.width > 0 && rect.height > 0 && deckRect?.width > 0 && deckRect.height > 0
          && Number.isFinite(scaleX) && scaleX > 0 && Number.isFinite(scaleY) && scaleY > 0) {
          const x = (deckRect.left + deckRect.width / 2 - rect.left - rect.width / 2) / scaleX;
          const y = (deckRect.top + deckRect.height / 2 - rect.top - rect.height / 2) / scaleY;
          // Individual transforms preserve the CSS fan angle and table perspective.
          if (!await sequence.wait(animateCard(card, [
            {translate: `${x}px ${y}px`, rotate: '-12deg', opacity: 0, offset: 0},
            {translate: `${x * .84}px ${y * .84}px`, rotate: '-9deg', opacity: 1, offset: .16},
            {translate: '0px 0px', rotate: '0deg', opacity: 1, offset: 1}
          ], {duration: 280, easing: 'cubic-bezier(.2,.75,.25,1)', fill: 'both'}))) break;
        }
        if (!sequence.alive()) break;
        if (card.dataset) delete card.dataset.motion;
        if (onLand && !await sequence.wait(onLand(card, index))) break;
        if (index < cards.length - 1 && !await sequence.wait(pause(50))) break;
      }
    } finally {
      cards.forEach((card, index) => { card.style.visibility = visibility[index]; if (card.dataset?.motion === 'dealing') delete card.dataset.motion; });
      sequences.delete(sequence);
    }
  }

  /** Contract the back, swap at zero width, expand the face, then pause before the next card. */
  async function reveal(targets = [], {onReveal, holdMs = 170} = {}) {
    if (destroyed) return;
    const cards = uniqueCards(targets), sequence = beginSequence();
    const scales = cards.map(card => card.style.scale || '');
    const hold = Math.max(0, Number(holdMs) || 0);
    try {
      for (let index = 0; index < cards.length && sequence.alive(); index++) {
        const card = cards[index];
        if (card.dataset) card.dataset.motion = 'turning';
        if (!reducedMotion) {
          // Keep the card collapsed while an async onReveal callback updates its face.
          card.style.scale = '0 1';
          if (!await sequence.wait(animateCard(card, [
            {scale: '1 1', offset: 0}, {scale: '0 1', offset: 1}
          ], {duration: 130, easing: 'ease-in', fill: 'both'}))) break;
        }
        if (!sequence.alive()) break;
        if (onReveal && !await sequence.wait(onReveal(card, index))) break;
        if (!reducedMotion) {
          card.style.scale = '1 1';
          if (!await sequence.wait(animateCard(card, [
            {scale: '0 1', offset: 0}, {scale: '1.025 1', offset: .84}, {scale: '1 1', offset: 1}
          ], {duration: 170, easing: 'cubic-bezier(.16,.7,.25,1)', fill: 'both'}))) break;
        }
        card.style.scale = scales[index];
        if (card.dataset) delete card.dataset.motion;
        if (!await sequence.wait(pause(hold))) break;
      }
    } finally {
      cards.forEach((card, index) => { card.style.scale = scales[index]; if (card.dataset?.motion === 'turning') delete card.dataset.motion; });
      sequences.delete(sequence);
    }
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    unlocked = false;
    for (const sequence of sequences) sequence.cancel();
    for (const flight of flights.values()) flight.finish();
    flights.clear();
    for (const wait of pauses) wait.finish();
    pauses.clear();
    stopVoices();
    master?.disconnect();
    if (context && context.state !== 'closed') {
      try { Promise.resolve(context.close()).catch(() => {}); } catch { /* Already closing. */ }
    }
    master = null;
  }

  return {unlock, suspendAudio, setMuted, play, deal, reveal, animate: animateCard, destroy};
}
