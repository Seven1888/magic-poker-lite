import {atGameSpeed} from './presentation-timing.mjs';

/** Presentation only: no game state, card markup, or random-number access. */
export function createGameEffects({root = globalThis.document, reducedMotion = false} = {}) {
  if (!root) throw new TypeError('createGameEffects needs a document or DOM root.');
  const doc = root.ownerDocument || root;
  const view = doc.defaultView || globalThis;
  const lookup = id => root.getElementById?.(id) || root.querySelector?.(`#${id}`) || null;
  const voices = new Set();
  const flights = new Map();
  const discards = new Map();
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
    chips: [[1480, 0, .045, 'triangle', .085], [2170, .008, .035, 'sine', .04],
      [1120, .064, .05, 'triangle', .075], [1880, .102, .04, 'sine', .05],
      [1560, .166, .045, 'triangle', .075], [2410, .195, .035, 'sine', .035],
      [1280, .25, .055, 'triangle', .065], [1960, .286, .04, 'sine', .04]],
    'chip-arrival': [[720, 0, .065, 'triangle', .075], [1660, .008, .055, 'sine', .065],
      [2280, .032, .04, 'sine', .04], [1210, .068, .065, 'triangle', .045]],
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
        const at = start + atGameSpeed(offset), noteDuration = atGameSpeed(duration);
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, at);
        gain.gain.setValueAtTime(.0001, at);
        gain.gain.exponentialRampToValueAtTime(peak, at + atGameSpeed(.008));
        gain.gain.exponentialRampToValueAtTime(.0001, at + noteDuration);
        oscillator.connect(gain);
        gain.connect(master);
        voices.add(voice);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
          voices.delete(voice);
        };
        oscillator.start(at);
        oscillator.stop(at + noteDuration + atGameSpeed(.015));
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
      pauses.add(record); timer = schedule(record.finish, atGameSpeed(ms));
    });
  }

  /** Always release the flight record before the caller's next phase/callback. */
  function animateCard(card, keyframes, options, {speed} = {}) {
    flights.get(card)?.finish();
    if (destroyed || reducedMotion || typeof card.animate !== 'function') return Promise.resolve();
    const timing = {...options, duration: atGameSpeed(options.duration, speed), delay: atGameSpeed(options.delay || 0, speed)};
    let animation;
    try { animation = card.animate(keyframes, timing); } catch { return Promise.resolve(); }
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
      timer = schedule(record.finish, timing.duration + timing.delay + 80);
      if (animation.finished?.then) animation.finished.then(record.finish, record.finish);
    });
  }

  function boardDealOffset(card, deckRect, fallback) {
    if (reducedMotion || card.parentElement?.id !== 'board') return fallback;
    // Viewport deltas are not local translations inside a tilted board. Fit the
    // actual projected card centre while hidden, including its departure angle.
    const original = {translate: card.style.translate, rotate: card.style.rotate, visibility: card.style.visibility};
    const target = {x: deckRect.left + deckRect.width / 2, y: deckRect.top + deckRect.height / 2};
    const measure = (x, y) => {
      card.style.translate = `${x}px ${y}px`;
      const rect = card.getBoundingClientRect();
      return {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2};
    };
    let {x, y} = fallback;
    try {
      card.style.visibility = 'hidden'; card.style.rotate = '-12deg';
      for (let step = 0; step < 4; step++) {
        const point = measure(x, y), dx = target.x - point.x, dy = target.y - point.y;
        if (Math.hypot(dx, dy) < .05) return {x, y};
        const alongX = measure(x + 1, y), alongY = measure(x, y + 1);
        const xx = alongX.x - point.x, xy = alongY.x - point.x;
        const yx = alongX.y - point.y, yy = alongY.y - point.y, determinant = xx * yy - xy * yx;
        if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-6) return fallback;
        x += (dx * yy - dy * xy) / determinant;
        y += (dy * xx - dx * yx) / determinant;
        if (!Number.isFinite(x) || !Number.isFinite(y) || Math.max(Math.abs(x), Math.abs(y)) > 100000) return fallback;
      }
      return {x, y};
    } finally {
      card.style.translate = original.translate || ''; card.style.rotate = original.rotate || '';
      card.style.visibility = original.visibility;
    }
  }

  function dealOrigin(stage, stageRect) {
    const anchor = lookup('deal-origin')?.getBoundingClientRect?.();
    if (anchor?.width > 0 && anchor.height > 0) return anchor;
    const deck = lookup('deck-button')?.getBoundingClientRect?.();
    if (deck?.width > 0 && deck.height > 0) return deck;
    if (!(stage?.offsetWidth > 0 && stage.offsetHeight > 0 && stageRect?.width > 0 && stageRect.height > 0)) return null;
    // The stock need not be visible. Keep its launch point in table coordinates,
    // then project it into the current (possibly scaled) viewport for both hands
    // and the perspective-corrected board path.
    return {left: stageRect.left + (stage.offsetWidth - 16) * stageRect.width / stage.offsetWidth,
      top: stageRect.top + 292 * stageRect.height / stage.offsetHeight, width: 0, height: 0};
  }

  /** Caller supplies backs. Pending cards stay hidden; each landing may await a flip. */
  async function deal(targets = [], {onLand} = {}) {
    if (destroyed) return;
    const cards = uniqueCards(targets), sequence = beginSequence();
    const visibility = cards.map(card => card.style.visibility || '');
    cards.forEach(card => { card.style.visibility = 'hidden'; });
    try {
      for (let index = 0; index < cards.length && sequence.alive(); index++) {
        const card = cards[index];
        const stage = lookup('game'), stageRect = stage?.getBoundingClientRect?.();
        const deckRect = dealOrigin(stage, stageRect);
        const rect = card.getBoundingClientRect?.();
        const scaleX = stageRect?.width / stage?.offsetWidth;
        const scaleY = stage?.offsetHeight > 0 ? stageRect?.height / stage.offsetHeight : scaleX;
        card.style.visibility = 'visible';
        if (card.dataset) card.dataset.motion = 'dealing';
        play('deal');
        if (rect?.width > 0 && rect.height > 0 && deckRect
          && Number.isFinite(scaleX) && scaleX > 0 && Number.isFinite(scaleY) && scaleY > 0) {
          const {x, y} = boardDealOffset(card, deckRect, {
            x: (deckRect.left + deckRect.width / 2 - rect.left - rect.width / 2) / scaleX,
            y: (deckRect.top + deckRect.height / 2 - rect.top - rect.height / 2) / scaleY
          });
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

  /** Turn through the edge; optional staggering overlaps motion, never face commits. */
  async function reveal(targets = [], {onReveal, holdMs = 170, staggerMs = 0} = {}) {
    if (destroyed) return;
    const cards = uniqueCards(targets), sequence = beginSequence();
    const properties = ['scale', 'rotate', 'translate', 'backfaceVisibility', 'willChange'];
    const originals = cards.map(card => Object.fromEntries(properties.map(key => [key, card.style[key] || ''])));
    const commits = cards.map(() => {
      let release;
      const ready = new Promise(resolve => { release = resolve; });
      return {ready, release};
    });
    const hold = Math.max(0, Number(holdMs) || 0);
    const stagger = Math.max(0, Number(staggerMs) || 0);
    const restore = (card, index) => {
      for (const key of properties) card.style[key] = originals[index][key];
      if (card.dataset?.motion === 'turning') delete card.dataset.motion;
    };
    async function turn(card, index) {
      if (!sequence.alive()) return;
      const animated = !reducedMotion && typeof card.animate === 'function';
      if (card.dataset) card.dataset.motion = 'turning';
      try {
        if (animated) {
          // The underlying zero-width state remains while an async face callback
          // runs. The animation itself keeps full scale and turns on its Y axis;
          // individual transforms leave the CSS fan and board perspective intact.
          card.style.scale = '0 1'; card.style.rotate = 'y 90deg';
          card.style.translate = '0px -7px'; card.style.backfaceVisibility = 'hidden';
          card.style.willChange = 'rotate, translate';
          if (!await sequence.wait(animateCard(card, [
            {rotate: 'y 0deg', translate: '0px 0px', scale: '1 1', offset: 0},
            {rotate: 'y 38deg', translate: '0px -5px', scale: '1 1', offset: .58},
            {rotate: 'y 90deg', translate: '0px -7px', scale: '1 1', offset: 1}
          ], {duration: 170, easing: 'cubic-bezier(.42,0,.7,.6)', fill: 'both'}))) return;
        }
        // A slow earlier callback cannot let a later public card become visible
        // first. Waiting cards remain edge-on and keep their original backs.
        if (index && !await sequence.wait(commits[index - 1].ready)) return;
        if (!sequence.alive()) return;
        if (onReveal && !await sequence.wait(onReveal(card, index))) return;
        commits[index].release();
        if (animated) {
          card.style.scale = '1 1'; card.style.rotate = 'y -90deg';
          if (!await sequence.wait(animateCard(card, [
            {rotate: 'y -90deg', translate: '0px -7px', scale: '1 1', offset: 0},
            {rotate: 'y -28deg', translate: '0px -4px', scale: '1 1', offset: .52},
            {rotate: 'y 0deg', translate: '0px 0px', scale: '1 1', offset: 1}
          ], {duration: 250, easing: 'cubic-bezier(.2,.55,.3,1)', fill: 'both'}))) return;
        }
        restore(card, index);
        await sequence.wait(pause(hold));
      } finally {
        commits[index].release();
        restore(card, index);
      }
    }
    try {
      if (stagger && !reducedMotion && cards.length > 1) {
        const turns = [];
        let failure;
        for (let index = 0; index < cards.length && sequence.alive(); index++) {
          turns.push(turn(cards[index], index).catch(error => { failure ||= error; sequence.cancel(); }));
          if (index < cards.length - 1 && !await sequence.wait(pause(stagger))) break;
        }
        await Promise.all(turns);
        if (failure) throw failure;
      } else {
        for (let index = 0; index < cards.length && sequence.alive(); index++) await turn(cards[index], index);
      }
    } finally {
      cards.forEach((card, index) => { flights.get(card)?.finish(); restore(card, index); });
      sequences.delete(sequence);
    }
  }

  /**
   * Slide caller-supplied backs to the table's left discard area, never the deck.
   * destination is in unscaled stage coordinates. Card faces/markup are untouched.
   * The caller owns persistent hiding after awaiting this transient presentation.
   * Repeated/overlapping requests join an existing discard instead of replaying it.
   */
  function discardCards(targets = [], {destination, duration = 700} = {}) {
    if (destroyed) return Promise.resolve();
    const cards = uniqueCards(targets);
    const pending = new Set(cards.map(card => discards.get(card)).filter(Boolean));
    const fresh = cards.filter(card => !discards.has(card));
    if (fresh.length) {
      const sequence = beginSequence(), record = {promise: null};
      fresh.forEach(card => discards.set(card, record));
      record.promise = (async () => {
        try {
          const stage = lookup('game'), stageRect = stage?.getBoundingClientRect?.();
          const sx = stageRect?.width / stage?.offsetWidth;
          const sy = stageRect?.height / stage?.offsetHeight;
          const scaleX = Number.isFinite(sx) && sx > 0 ? sx : 1;
          const scaleY = Number.isFinite(sy) && sy > 0 ? sy : scaleX;
          const centers = fresh.map(card => {
            const rect = card.getBoundingClientRect?.();
            return {x: ((rect?.left || 0) + (rect?.width || 0) / 2 - (stageRect?.left || 0)) / scaleX,
              y: ((rect?.top || 0) + (rect?.height || 0) / 2 - (stageRect?.top || 0)) / scaleY};
          });
          const center = {x: centers.reduce((n, p) => n + p.x, 0) / fresh.length,
            y: centers.reduce((n, p) => n + p.y, 0) / fresh.length};
          const target = {x: Number.isFinite(destination?.x) ? destination.x : stageRect ? 42 : center.x - 140,
            y: Number.isFinite(destination?.y) ? destination.y : stageRect ? 370 : center.y + 100};
          const time = Number.isFinite(duration) ? Math.max(0, duration) : 700;
          await sequence.wait(Promise.all(fresh.map((card, index) => {
            if (card.dataset) card.dataset.motion = 'discarding';
            const spread = (index - (fresh.length - 1) / 2) * 6;
            const gather = {x: center.x + spread - centers[index].x, y: center.y + 14 - centers[index].y};
            const end = {x: target.x + spread - centers[index].x, y: target.y - centers[index].y};
            return animateCard(card, [
              {translate: '0px 0px', rotate: '0deg', scale: '1', opacity: 1, offset: 0},
              {translate: `${gather.x}px ${gather.y}px`, rotate: `${-12 + index * 3}deg`, scale: '.96', opacity: 1, offset: .3},
              {translate: `${end.x * .88}px ${end.y * .88}px`, rotate: `${-22 + index * 4}deg`, scale: '.78', opacity: 1, offset: .78},
              {translate: `${end.x}px ${end.y}px`, rotate: `${-26 + index * 4}deg`, scale: '.7', opacity: 0, offset: 1}
            ], {duration: time, easing: 'cubic-bezier(.3,.05,.4,1)', fill: 'both'});
          })));
        } finally {
          fresh.forEach(card => {
            if (card.dataset?.motion === 'discarding') delete card.dataset.motion;
            if (discards.get(card) === record) discards.delete(card);
          });
          sequences.delete(sequence);
        }
      })();
      pending.add(record);
    }
    return Promise.all([...pending].map(record => record.promise)).then(() => undefined);
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

  return {unlock, suspendAudio, setMuted, play, deal, reveal, discardCards, animate: animateCard, destroy};
}
