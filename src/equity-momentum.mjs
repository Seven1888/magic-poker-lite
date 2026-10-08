import {equityPercent} from './win-rate-view.mjs?v=60';

const validEquity = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
const side = value => value > .5 ? 1 : value < .5 ? -1 : 0;
const signedPoints = delta => `${delta >= 0 ? '+' : '−'}${Math.round(Math.abs(delta) * 1000) / 10}`;

/** A public equity change is an advantage cue, never a declaration of the winner. */
export function equityMomentumChange(previous, equity, previousLeader = side(previous)) {
  if (!validEquity(previous) || !validEquity(equity) || previous === equity) return null;
  const delta = equity - previous;
  const up = previous <= .5 && equity > .5;
  // Reaching exactly 50% is neutral. Preserve the previous strict leader across it.
  const down = previousLeader > 0 && equity < .5;
  if (!up && !down && Math.abs(delta) + 1e-12 < .1) return null;
  const direction = delta > 0 ? 'up' : 'down';
  const kind = up || down ? 'lead' : 'swing';
  return {
    kind, direction, previous, equity, delta,
    title: up ? 'TAKE THE LEAD' : down ? 'BOSS TAKES LEAD' : `EQUITY ${direction === 'up' ? 'UP' : 'DOWN'}`,
    detail: `EQUITY ${equityPercent(equity)} · ${signedPoints(delta)} PP`,
  };
}

/**
 * Consumes already-visible equity only; the caller owns calculation/street freshness.
 * key identifies one public street/reveal within the hand. clear() hides the cue while
 * retaining its baseline; reset() starts a new hand. A final update closes the hand.
 */
export function createEquityMomentum({root, effects, reducedMotion = false,
  timers = {setTimeout: (...args) => setTimeout(...args), clearTimeout: id => clearTimeout(id)}} = {}) {
  const doc = root?.ownerDocument;
  const cue = doc?.createElement('div');
  let title, detail, icon;
  if (cue) {
    cue.className = 'equity-momentum';
    cue.hidden = true;
    cue.setAttribute('role', 'status');
    cue.setAttribute('aria-live', 'polite');
    cue.setAttribute('aria-atomic', 'true');
    icon = doc.createElement('span');
    icon.className = 'equity-momentum-icon';
    icon.setAttribute('aria-hidden', 'true');
    title = doc.createElement('strong');
    title.className = 'equity-momentum-title';
    detail = doc.createElement('span');
    detail.className = 'equity-momentum-detail';
    cue.append(icon, title, detail);
    root.append(cue);
  }
  const ring = root?.querySelector('#player-win-rate');
  let previous = null, leader = 0, timer = null, revision = 0, closed = false, destroyed = false;
  const seen = new Set();

  function clear() {
    ++revision;
    if (timer !== null) timers.clearTimeout(timer);
    timer = null;
    if (cue) {
      cue.hidden = true;
      title.textContent = '';
      detail.textContent = '';
      icon.textContent = '';
      cue.removeAttribute('aria-label');
      delete cue.dataset.direction;
      delete cue.dataset.kind;
      delete cue.dataset.reducedMotion;
    }
    if (ring) {
      delete ring.dataset.momentum;
      delete ring.dataset.momentumKind;
      delete ring.dataset.momentumReduced;
    }
  }

  function reset() {
    clear();
    previous = null;
    leader = 0;
    closed = false;
    seen.clear();
  }

  function update({key, equity, final = false, visible = true} = {}) {
    if (destroyed) return null;
    if (final) {
      closed = true;
      clear();
      return null;
    }
    if (closed) return null;
    if (!visible || !validEquity(equity) || !['string', 'number'].includes(typeof key)) {
      clear();
      return null;
    }
    if (seen.has(key)) return null;
    seen.add(key);
    const change = equityMomentumChange(previous, equity, leader);
    previous = equity;
    leader = side(equity) || leader;
    clear();
    if (!change) return null;
    const reduced = typeof reducedMotion === 'function' ? Boolean(reducedMotion()) : Boolean(reducedMotion);
    if (cue) {
      // Flush the hidden state to restart a second cue without scheduling stale frames.
      void cue.offsetWidth;
      cue.dataset.direction = change.direction;
      cue.dataset.kind = change.kind;
      cue.dataset.reducedMotion = String(reduced);
      icon.textContent = change.direction === 'up' ? '↗' : '↘';
      title.textContent = change.title;
      detail.textContent = change.detail;
      cue.setAttribute('aria-label', `${change.title}. Player equity ${equityPercent(equity)}, ${signedPoints(change.delta)} percentage points. Ties count as half a win.`);
      cue.hidden = false;
    }
    if (ring) {
      void ring.offsetWidth;
      ring.dataset.momentum = change.direction;
      ring.dataset.momentumKind = change.kind;
      ring.dataset.momentumReduced = String(reduced);
    }
    if (change.kind === 'lead') effects?.play?.(`lead-${change.direction}`);
    const active = revision;
    timer = timers.setTimeout(() => { if (active === revision) clear(); }, reduced ? 850 : 1050);
    return change;
  }

  function destroy() {
    reset();
    destroyed = true;
    cue?.remove();
  }

  return {update, clear, reset, destroy};
}
