const interpolate = (value, progress) => Number((value * progress).toFixed((value.toFixed(6).replace(/0+$/, '').split('.')[1] || '').length));

/** Presentation only: the wallet/table transfer has already been committed once.
 * onProgress receives the two visible balances; it must never transfer money.
 */
export async function playBuyInFlight({root = globalThis.document, reducedMotion = false,
  amounts = {player: 0, npc: 0}, duration = 1400, onProgress} = {}) {
  if (!root) return;
  const doc = root.ownerDocument || root, view = doc.defaultView || globalThis;
  const lookup = id => root.getElementById?.(id) || root.querySelector?.(`#${id}`);
  const schedule = view.setTimeout?.bind(view) || globalThis.setTimeout;
  const unschedule = view.clearTimeout?.bind(view) || globalThis.clearTimeout;
  const now = () => view.performance?.now?.() ?? Date.now();
  const frame = view.requestAnimationFrame?.bind(view) || (callback => schedule(callback, 16));
  const cancelFrame = view.cancelAnimationFrame?.bind(view) || unschedule;
  // This readable entrance uses real wall time, never the game's speed factor.
  const milliseconds = Math.max(1000, Number(duration) || 1400);
  const values = Object.fromEntries(['player', 'npc'].map(seat => [seat, Math.max(0, Number(amounts[seat]) || 0)]));
  const layer = doc.createElement('div'); layer.className = 'buyin-flight-layer';
  layer.setAttribute('aria-hidden', 'true'); doc.body.append(layer);
  const animations = [], started = now();
  let pendingFrame, watchdog, completed = false;
  const flightTime = reducedMotion ? 0 : milliseconds * .36;
  function report(progress, complete = false) {
    try { onProgress?.({progress, values: Object.fromEntries(Object.entries(values).map(([seat, value]) => [seat, complete ? value : interpolate(value, progress)])), complete}); }
    catch { /* A view observer cannot interrupt an already committed buy-in. */ }
  }
  report(0);
  try {
    for (const seat of ['player', 'npc']) {
      const target = lookup(`${seat}-bankroll-chips`)?.getBoundingClientRect?.();
      const wallet = lookup('balance-button')?.getBoundingClientRect?.();
      if (!target || !wallet || !target.width || !target.height || reducedMotion) continue;
      const source = seat === 'player'
        ? {x: wallet.left + wallet.width / 2, y: wallet.top + wallet.height / 2}
        : {x: target.left + target.width / 2, y: Math.max(18, target.top - 125)};
      const count = 12;
      for (let index = 0; index < count; index++) {
        const chip = doc.createElement('i'); chip.className = 'buyin-flight-chip'; chip.dataset.seat = seat;
        chip.style.left = `${source.x}px`; chip.style.top = `${source.y}px`; layer.append(chip);
        const column = index % 3, level = Math.floor(index / 3);
        const dx = target.left + target.width / 2 - source.x + (column - 1) * 18;
        const dy = target.top + target.height * .72 - source.y - level * 3;
        const transform = (x, y, scale = 1) => `translate(calc(-50% + ${x}px),calc(-50% + ${y}px)) scale(${scale})`;
        if (typeof chip.animate !== 'function') continue;
        try {
          const animation = chip.animate([
            {transform: transform(0, 0, .8), opacity: 0, offset: 0},
            {transform: transform(dx * .16, dy * .16 - 18, 1), opacity: 1, offset: .15},
            {transform: transform(dx * .55, dy * .6 - 24, 1.12), opacity: 1, offset: .55},
            {transform: transform(dx, dy, 1), opacity: 1, offset: 1}
          ], {duration: flightTime, delay: (milliseconds - flightTime) * index / (count - 1), easing: 'cubic-bezier(.22,.7,.24,1)', fill: 'both'});
          animation.finished?.catch?.(() => {}); animations.push(animation);
        } catch { /* Counters and the destination pile still finish normally. */ }
      }
    }
    await new Promise(resolve => {
      function finish() {
        if (completed) return;
        completed = true; cancelFrame(pendingFrame); unschedule(watchdog);
        report(1, true); resolve();
      }
      function update() {
        if (completed) return;
        const elapsed = now() - started;
        if (elapsed >= milliseconds) { finish(); return; }
        const progress = Math.max(0, Math.min(1, (elapsed - flightTime) / (milliseconds - flightTime)));
        report(progress); pendingFrame = frame(update);
      }
      pendingFrame = frame(update);
      // Hidden tabs can suppress frames; the final value still arrives once.
      watchdog = schedule(finish, milliseconds);
    });
  } finally {
    cancelFrame(pendingFrame); unschedule(watchdog);
    for (const animation of animations) animation.cancel?.();
    // The observer has built the full real piles before the stand-ins leave.
    layer.remove();
  }
}
