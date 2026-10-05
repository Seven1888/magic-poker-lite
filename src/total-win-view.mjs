import {atGameSpeed} from './presentation-timing.mjs?v=35';

const money = value => value.toLocaleString('en-US', {maximumFractionDigits: 6});

/** A return is a win only when the player's settled profit is positive. */
export function totalWinModel(result) {
  const amount = result?.player?.totalReturn;
  if (!Number.isFinite(amount) || amount < 0) return null;
  const outcome = result.player.profit > 0 ? 'win' : result.winner === 'tie' ? 'split' : amount > 0 ? 'returned' : 'loss';
  const label = {win: 'TOTAL WIN', split: 'SPLIT POT', returned: 'RETURNED', loss: result.winner === 'npc' ? 'BOSS WINS' : 'HAND COMPLETE'}[outcome];
  return {amount, outcome, label, formatted: money(amount)};
}

/** Presentation only: start at payout, await whenIdle(), clear at the next hand.
 * The result's totalReturn already includes JP and excludes uncalled refunds.
 * No balance, pot, cards, result fields or random-number sources are modified.
 */
export function createTotalWin({root = globalThis.document, effects, reducedMotion = false} = {}) {
  if (!root) throw new TypeError('createTotalWin needs a document or DOM root.');
  const doc = root.ownerDocument || root, view = doc.defaultView || globalThis;
  const stage = root.getElementById?.('game') || root.querySelector?.('#game');
  const schedule = view.setTimeout?.bind(view) || globalThis.setTimeout;
  const unschedule = view.clearTimeout?.bind(view) || globalThis.clearTimeout;
  const now = () => view.performance?.now?.() ?? Date.now();
  const frame = view.requestAnimationFrame?.bind(view) || (callback => schedule(() => callback(now()), 16));
  const cancelFrame = view.cancelAnimationFrame?.bind(view) || unschedule;
  let panel, label, amount, announcement, moneyLayer, coins = [], active = null, lastResult = null, lastDone = Promise.resolve(false), destroyed = false;

  function mount() {
    if (panel || !stage) return;
    panel = doc.createElement('div'); panel.id = 'total-win-display'; panel.className = 'table-total-win'; panel.hidden = true;
    panel.setAttribute('role', 'group'); panel.setAttribute('aria-label', 'Hand return');
    label = doc.createElement('span'); label.className = 'total-win-label'; label.setAttribute('aria-hidden', 'true');
    amount = doc.createElement('strong'); amount.className = 'total-win-amount'; amount.setAttribute('aria-hidden', 'true');
    announcement = doc.createElement('span'); announcement.className = 'total-win-announcement';
    announcement.setAttribute('role', 'status'); announcement.setAttribute('aria-live', 'polite'); announcement.setAttribute('aria-atomic', 'true');
    panel.append(label, amount, announcement); stage.append(panel);
    moneyLayer = doc.createElement('div'); moneyLayer.className = 'win-money-layer'; moneyLayer.hidden = true;
    moneyLayer.setAttribute('aria-hidden', 'true'); stage.append(moneyLayer);
  }

  function clearMoney() {
    for (const coin of coins) coin.remove();
    coins = [];
    if (moneyLayer) moneyLayer.hidden = true;
  }

  // Fixed, staggered fountain paths are decoration, never another random draw.
  // All coins finish within the count-up and sit behind its readable plaque.
  function sprayMoney() {
    clearMoney(); moneyLayer.hidden = false;
    for (let i = 0; i < 32; i++) {
      const coin = doc.createElement('i'), face = doc.createElement('span');
      coin.className = 'win-money-coin'; face.className = 'win-money-face';
      const side = i % 2 ? 1 : -1, lane = Math.floor(i / 2);
      const x = 200 + side * (24 + lane % 4 * 10);
      const end = 200 + side * (28 + lane * 8);
      const apex = 400 + (lane * 17 % 65);
      const size = 17 + (lane * 7 % 17);
      const duration = atGameSpeed(1320 + lane % 4 * 70);
      const delay = atGameSpeed(Math.floor(lane / 4) * 65);
      for (const [key, value] of Object.entries({
        '--coin-x': `${x}px`, '--coin-end': `${end}px`, '--coin-apex': `${apex}px`,
        '--coin-size': `${size}px`, '--coin-turn': `${side * (240 + lane * 31)}deg`,
        '--coin-duration': `${duration}ms`, '--coin-delay': `${delay}ms`,
        '--coin-spin': `${atGameSpeed(330 + lane % 5 * 70)}ms`
      })) coin.style.setProperty(key, value);
      coin.append(face); moneyLayer.append(coin); coins.push(coin);
    }
  }

  function sound(name) {
    if (doc.hidden || reducedMotion) return;
    try { effects?.play?.(name); } catch { /* Sound cannot interrupt a completed return. */ }
  }

  function cancel() {
    clearMoney();
    if (!active) return;
    const previous = active; active = null;
    cancelFrame(previous.frame); unschedule(previous.watchdog); previous.resolve(false);
  }

  function clear() {
    cancel(); lastResult = null; lastDone = Promise.resolve(false);
    if (panel) { panel.hidden = true; delete panel.dataset.phase; announcement.textContent = ''; }
    if (stage) delete stage.dataset.totalWin;
  }

  function finish(record, audible = true) {
    if (active !== record) return;
    active = null; cancelFrame(record.frame); unschedule(record.watchdog);
    clearMoney();
    amount.textContent = record.model.formatted;
    panel.dataset.phase = 'settled';
    announcement.textContent = `${record.model.label} ${record.model.formatted}`;
    if (audible && record.model.outcome === 'win') sound('win');
    record.resolve(true);
  }

  function start(result) {
    if (destroyed || !stage) return Promise.resolve(false);
    if (result === lastResult) return lastDone;
    const model = totalWinModel(result);
    if (!model) { clear(); return Promise.resolve(false); }
    cancel(); mount(); lastResult = result;
    label.textContent = model.label; announcement.textContent = '';
    panel.hidden = false; panel.dataset.outcome = model.outcome;
    panel.dataset.motion = reducedMotion ? 'reduced' : 'normal';
    stage.dataset.totalWin = model.outcome;
    // Size from the final value so grouped digits and six decimals never jump.
    panel.style.setProperty('--total-win-font', `${Math.min(46, 460 / model.formatted.length)}px`);
    amount.dataset.amount = String(model.amount);
    let resolve;
    lastDone = new Promise(done => { resolve = done; });
    const record = {model, resolve, frame: null, watchdog: null, started: now(), tick: 0};
    active = record;
    if (reducedMotion || doc.hidden || model.outcome !== 'win' || model.amount === 0) {
      finish(record, false); return lastDone;
    }
    panel.dataset.phase = 'counting'; amount.textContent = '0';
    sprayMoney();
    const duration = atGameSpeed(1800), ticks = [.1, .24, .41, .61, .81];
    const decimals = Math.min(6, (model.amount.toFixed(6).replace(/0+$/, '').split('.')[1] || '').length);
    function update() {
      if (active !== record) return;
      if (doc.hidden) { finish(record, false); return; }
      const progress = Math.min(1, Math.max(0, (now() - record.started) / duration));
      if (progress >= 1) { finish(record); return; }
      const value = Math.min(model.amount, Number((model.amount * (1 - (1 - progress) ** 2.4)).toFixed(decimals)));
      amount.textContent = money(value);
      // A delayed frame may skip beats, but must not play a burst of old ticks.
      if (record.tick < ticks.length && progress >= ticks[record.tick]) {
        while (record.tick < ticks.length && progress >= ticks[record.tick]) record.tick++;
        sound('chip-arrival');
      }
      record.frame = frame(update);
    }
    record.frame = frame(update);
    record.watchdog = schedule(() => finish(record, false), duration + 120);
    return lastDone;
  }

  const onVisibility = () => { if (doc.hidden && active) finish(active, false); };
  doc.addEventListener?.('visibilitychange', onVisibility);
  function destroy() { if (destroyed) return; clear(); destroyed = true; panel?.remove(); moneyLayer?.remove(); doc.removeEventListener?.('visibilitychange', onVisibility); }
  return {start, whenIdle: () => active ? lastDone : Promise.resolve(true), clear, destroy};
}
