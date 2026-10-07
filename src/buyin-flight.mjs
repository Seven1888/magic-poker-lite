const interpolate = (value, progress) => Number((value * progress).toFixed((value.toFixed(6).replace(/0+$/, '').split('.')[1] || '').length));

/** Build the real piles in place. The wallet/table transfer is already committed.
 * Retains its public name for callers; there is no asset-to-table chip flight.
 * onProgress receives the two visible balances; it must never transfer money.
 */
export async function playBuyInFlight({root = globalThis.document, reducedMotion = false,
  amounts = {player: 0, npc: 0}, duration = 1400, onProgress} = {}) {
  if (!root) return;
  const doc = root.ownerDocument || root, view = doc.defaultView || globalThis;
  const schedule = view.setTimeout?.bind(view) || globalThis.setTimeout;
  const unschedule = view.clearTimeout?.bind(view) || globalThis.clearTimeout;
  const now = () => view.performance?.now?.() ?? Date.now();
  const frame = view.requestAnimationFrame?.bind(view) || (callback => schedule(callback, 16));
  const cancelFrame = view.cancelAnimationFrame?.bind(view) || unschedule;
  // This readable entrance uses real wall time, never the game's speed factor.
  const milliseconds = Math.max(1000, Number(duration) || 1400);
  const values = Object.fromEntries(['player', 'npc'].map(seat => [seat, Math.max(0, Number(amounts[seat]) || 0)]));
  const started = now();
  let pendingFrame, watchdog, completed = false;
  function report(progress, complete = false) {
    try { onProgress?.({progress, values: Object.fromEntries(Object.entries(values).map(([seat, value]) => [seat, complete ? value : interpolate(value, progress)])), complete}); }
    catch { /* A view observer cannot interrupt an already committed buy-in. */ }
  }
  report(0);
  try {
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
        const progress = Math.max(0, Math.min(1, elapsed / milliseconds));
        report(progress); pendingFrame = frame(update);
      }
      pendingFrame = frame(update);
      // Hidden tabs can suppress frames; the final value still arrives once.
      watchdog = schedule(finish, milliseconds);
    });
  } finally {
    cancelFrame(pendingFrame); unschedule(watchdog);
  }
}
