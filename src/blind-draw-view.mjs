import {atGameSpeed} from './presentation-timing.mjs?v=59';
import {createActionFlow} from './action-flow-view.mjs?v=59';

// The left icon slot of the action ribbon (326–394 px), above the board and POT.
const RIBBON = {x: 46, y: 360, size: 50};
const SEAT = {x: 359, y: 667, size: 38};

/** Present the engine's already chosen blind. Never draws or posts chips. */
export function createBlindDraw({root = globalThis.document, effects, reducedMotion = false, actionFlow = createActionFlow({root})} = {}) {
  const doc = root.ownerDocument || root, view = doc.defaultView || globalThis;
  const stage = root.getElementById?.('game') || root.querySelector?.('#game');
  const schedule = view.setTimeout?.bind(view) || globalThis.setTimeout;
  const unschedule = view.clearTimeout?.bind(view) || globalThis.clearTimeout;
  let layer = null, coin = null, active = null;

  function element(tag, className, text) {
    const node = doc.createElement(tag); node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function createLayer() {
    layer = element('div', 'blind-draw-layer'); layer.id = 'blind-draw-layer';
    stage.append(layer);
    coin = element('div', 'blind-coin'); coin.setAttribute('role', 'img');
    layer.append(coin);
  }
  function position(point, seated) {
    coin.style.left = `${point.x}px`; coin.style.top = `${point.y}px`;
    coin.dataset.position = seated ? 'seat' : 'ribbon';
    coin.setAttribute('aria-hidden', seated ? 'false' : 'true');
  }
  function identify(isSmall) {
    const identity = `You: ${isSmall ? 'SMALL BLIND' : 'BIG BLIND'}. Boss: ${isSmall ? 'BIG BLIND' : 'SMALL BLIND'}.`;
    coin.dataset.blind = isSmall ? 'small' : 'big';
    coin.textContent = isSmall ? 'SB' : 'BB';
    coin.setAttribute('aria-label', identity);
    coin.title = identity;
  }
  function clear() {
    active?.cancel(); active = null;
    for (const animation of coin?.getAnimations?.() || []) animation.cancel();
    layer?.remove(); layer = null; coin = null;
    actionFlow.setBlindDraw(null);
    if (stage) delete stage.dataset.blindDraw;
  }

  /** Call after a new hand establishes its blind, and with null on leaving. */
  function renderSeat(result) {
    if (result && typeof result.isSmall !== 'boolean') throw new TypeError('A known blind position is required.');
    if (result && !active && coin?.dataset.position === 'seat') {
      identify(result.isSmall); return;
    }
    clear();
    if (!result || !stage) return;
    createLayer(); identify(result.isSmall); position(SEAT, true);
    stage.dataset.blindDraw = 'seated';
  }

  async function play({isSmall, smallBlind, bigBlind}) {
    if (typeof isSmall !== 'boolean' || ![smallBlind, bigBlind].every(n => Number.isFinite(n) && n > 0)) {
      throw new TypeError('The chosen blind and exact positive blind amounts are required.');
    }
    clear();
    if (!stage) return false;
    createLayer(); position(RIBBON, false);
    coin.textContent = '?'; coin.setAttribute('aria-label', 'Drawing your blind position');
    actionFlow.setBlindDraw({phase:'drawing'});
    let cancel, stopTimer = null;
    const cancelled = new Promise(resolve => { cancel = () => { stopTimer?.(); resolve(false); }; });
    const run = {cancel}; active = run;
    const alive = () => active === run;
    const animate = (frames, options) => Promise.race([
      Promise.resolve(effects?.animate?.(coin, frames, options)).then(() => alive()), cancelled
    ]);
    const hold = ms => Promise.race([new Promise(resolve => {
      const timer = schedule(() => { stopTimer = null; resolve(alive()); }, atGameSpeed(ms));
      stopTimer = () => { unschedule(timer); stopTimer = null; resolve(false); };
    }), cancelled]);
    try {
      stage.dataset.blindDraw = 'drawing';
      if (!reducedMotion && !await animate([
        {transform: 'translate(-50%,-50%) perspective(550px) rotateY(0deg) translateY(0)'},
        {transform: 'translate(-50%,-50%) perspective(550px) rotateY(630deg) translateY(-4px)', offset: .52},
        {transform: 'translate(-50%,-50%) perspective(550px) rotateY(1170deg) translateY(0)'}
      ], {duration: 1050, easing: 'cubic-bezier(.2,.65,.3,1)', fill: 'both'})) return false;
      if (!alive()) return false;
      identify(isSmall);
      actionFlow.setBlindDraw({phase:'revealed',isSmall,smallBlind,bigBlind});
      stage.dataset.blindDraw = 'revealed'; effects?.play?.('chip');
      if (!reducedMotion && !await animate([
        {transform: 'translate(-50%,-50%) perspective(550px) rotateY(-90deg)'},
        {transform: 'translate(-50%,-50%) perspective(550px) rotateY(0deg)'}
      ], {duration: 210, easing: 'ease-out', fill: 'both'})) return false;
      // Reduced motion still leaves the result and precise payment readable.
      if (!await hold(reducedMotion ? 1800 : 2400)) return false;
      stage.dataset.blindDraw = 'flying';
      if (!reducedMotion && !await animate([
        {left: `${RIBBON.x}px`, top: `${RIBBON.y}px`, transform: 'translate(-50%,-50%) scale(1)'},
        {left: `${SEAT.x}px`, top: `${SEAT.y}px`, transform: `translate(-50%,-50%) scale(${SEAT.size / RIBBON.size})`}
      ], {duration: 650, easing: 'cubic-bezier(.3,.05,.25,1)', fill: 'both'})) return false;
      if (!alive()) return false;
      position(SEAT, true); stage.dataset.blindDraw = 'seated'; active = null;
      actionFlow.setBlindDraw(null,{restore:false});
      return true;
    } catch (error) {
      if (alive()) clear();
      throw error;
    }
  }
  return {play, renderSeat, clear};
}
