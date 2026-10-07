import {atGameSpeed} from './presentation-timing.mjs?v=53';

const labels = {fold: 'FOLD', check: 'CHECK', call: 'CALL', bet: 'BET', raise: 'RAISE'};

/** Shows committed NPC history events. Paid actions wait for their chip departure. */
export function createBossActionView({root = globalThis.document, reducedMotion = false} = {}) {
  const doc = root?.ownerDocument || root;
  const lookup = id => root?.getElementById?.(id) || root?.querySelector?.(`#${id}`) || null;
  const stage = lookup('game'), view = doc?.defaultView || globalThis;
  const schedule = view.setTimeout?.bind(view) || globalThis.setTimeout;
  const cancelTimer = view.clearTimeout?.bind(view) || globalThis.clearTimeout;
  const seen = new WeakMap();
  let layer = null, active = null, destroyed = false;

  function finish(job, completed) {
    if (job.finished) return;
    job.finished = true;
    cancelTimer(job.timer);
    try { job.animation?.cancel(); } catch { /* Already completed or unavailable. */ }
    if (active === job) {
      active = null;
      layer?.replaceChildren();
      if (layer) layer.hidden = true;
      if (stage) { delete stage.dataset.bossAction; delete stage.dataset.bossActionType; }
    }
    job.resolve(completed);
  }

  function clear() { if (active) finish(active, false); }

  function position() {
    const rect = stage?.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    const width = stage.offsetWidth || rect.width, height = stage.offsetHeight || rect.height;
    const scaleX = rect.width / width, scaleY = rect.height / height;
    const cards = lookup('npc-cards')?.getBoundingClientRect?.();
    const board = lookup('board')?.getBoundingClientRect?.();
    const x = cards?.width > 0 ? (cards.left + cards.width / 2 - rect.left) / scaleX : width / 2;
    // Keep the floating word above the permanent BOSS identity at y=235.
    const y = cards?.height > 0 ? (cards.top - rect.top) / scaleY - 52 : height * .247;
    const ceiling = board?.height > 0 ? (board.top - rect.top) / scaleY - 35 : height * .44;
    return {x: Math.max(96, Math.min(width - 96, x)), y: Math.max(120, Math.min(y, ceiling))};
  }

  function show(job) {
    if (job !== active || job.started || job.finished) return;
    job.started = true;
    const point = position();
    if (destroyed || doc.hidden || !stage || !point) { finish(job, false); return; }
    if (!layer) {
      layer = doc.createElement('div'); layer.id = 'boss-action-layer'; layer.className = 'boss-action-layer';
      layer.setAttribute('aria-hidden', 'true'); stage.append(layer);
    }
    const panel = doc.createElement('div'); panel.className = 'boss-action-pop';
    panel.dataset.action = job.action; panel.dataset.type = job.type;
    panel.dataset.motion = reducedMotion ? 'reduced' : 'normal';
    panel.style.left = `${point.x}px`; panel.style.top = `${point.y}px`;
    const owner = doc.createElement('span'); owner.className = 'boss-action-owner'; owner.textContent = 'BOSS';
    const word = doc.createElement('strong'); word.className = 'boss-action-word'; word.textContent = job.label;
    panel.append(owner, word); layer.replaceChildren(panel); layer.hidden = false;
    stage.dataset.bossAction = job.action; stage.dataset.bossActionType = job.type;
    const duration = atGameSpeed(reducedMotion ? 720 : 1100);
    if (!reducedMotion && typeof panel.animate === 'function') {
      try {
        job.animation = panel.animate([
          {opacity: 0, transform: 'translate(-50%,-100%) translateY(0) scale(.68)', offset: 0},
          {opacity: 1, transform: 'translate(-50%,-100%) translateY(-5px) scale(1.08)', offset: .15},
          {opacity: 1, transform: 'translate(-50%,-100%) translateY(-10px) scale(1)', offset: .3},
          {opacity: 1, transform: 'translate(-50%,-100%) translateY(-20px) scale(1)', offset: .78},
          {opacity: 0, transform: 'translate(-50%,-100%) translateY(-32px) scale(.98)', offset: 1}
        ], {duration, easing: 'cubic-bezier(.2,.7,.25,1)', fill: 'both'});
        Promise.resolve(job.animation.finished).then(() => finish(job, true), () => finish(job, false));
      } catch { /* Static text remains readable when animation is unavailable. */ }
    }
    // A watchdog also clears static/reduced-motion displays and stalled animations.
    job.timer = schedule(() => finish(job, true), duration + (job.animation ? 80 : 0));
  }

  function commit(event) {
    if (destroyed || !event || event.actor !== 'npc' || !labels[event.type]) return Promise.resolve(false);
    if (seen.has(event)) return seen.get(event);
    clear();
    let resolve;
    const done = new Promise(complete => { resolve = complete; });
    const label = labels[event.type];
    const job = {type: event.type, label, action: label.toLowerCase(), amount: Number(event.amount) || 0,
      resolve, done, started: false, finished: false, animation: null, timer: null};
    active = job; seen.set(event, done);
    if (doc.hidden) finish(job, false);
    else if (job.amount <= 0) show(job);
    return done;
  }

  function onTransfer(event) {
    if (active && !active.started && event?.flow === 'contribution' && event.seats?.includes('npc')) show(active);
  }
  const onHidden = () => { if (doc.hidden) clear(); };
  doc?.addEventListener?.('visibilitychange', onHidden);
  view.addEventListener?.('pagehide', clear);
  function destroy() {
    if (destroyed) return;
    destroyed = true; clear(); layer?.remove(); layer = null;
    doc?.removeEventListener?.('visibilitychange', onHidden);
    view.removeEventListener?.('pagehide', clear);
  }
  return {commit, onTransfer, clear, destroy, whenIdle: () => active?.done || Promise.resolve(true)};
}
