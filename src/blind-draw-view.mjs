import {atGameSpeed} from './presentation-timing.mjs?v=35';

const amount = value => value.toLocaleString('en-US', {maximumFractionDigits: 6});
const CENTER = {x: 200, y: 427, size: 104};
const SEAT = {x: 359, y: 699, size: 38};

/** Present the engine's already chosen blind. Never draws or posts chips. */
export function createBlindDraw({root = globalThis.document, effects, reducedMotion = false} = {}) {
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
    coin.dataset.position = seated ? 'seat' : 'center';
  }
  function identify(isSmall) {
    const order = isSmall ? 'YOU FIRST · BOSS SECOND' : 'BOSS FIRST · YOU SECOND';
    coin.dataset.blind = isSmall ? 'small' : 'big';
    coin.textContent = isSmall ? '1ST' : '2ND';
    coin.setAttribute('aria-label', `Opening order: ${order}`);
    coin.title = `Opening order: ${order}`;
  }
  function clear() {
    active?.cancel(); active = null;
    for (const animation of coin?.getAnimations?.() || []) animation.cancel();
    layer?.remove(); layer = null; coin = null;
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
    createLayer(); position(CENTER, false);
    coin.textContent = '?'; coin.setAttribute('aria-label', 'Drawing the opening order');
    const title = element('strong', 'blind-draw-title', 'OPENING ORDER');
    const copy = element('div', 'blind-draw-copy');
    copy.setAttribute('role', 'status'); copy.setAttribute('aria-live', 'polite');
    const heading = element('strong', 'blind-draw-name', 'WHO GOES FIRST?');
    copy.append(heading); layer.append(title, copy);
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
        {transform: 'translate(-50%,-50%) perspective(550px) rotateY(630deg) translateY(-36px)', offset: .52},
        {transform: 'translate(-50%,-50%) perspective(550px) rotateY(1170deg) translateY(0)'}
      ], {duration: 1050, easing: 'cubic-bezier(.2,.65,.3,1)', fill: 'both'})) return false;
      if (!alive()) return false;
      identify(isSmall);
      heading.textContent = isSmall ? 'YOU FIRST · BOSS SECOND' : 'BOSS FIRST · YOU SECOND';
      const label = element('p', 'blind-draw-stakes', 'STARTING BET');
      const payment = element('div', 'blind-draw-payment');
      for (const [who, value] of [['YOU', isSmall ? smallBlind : bigBlind], ['BOSS', isSmall ? bigBlind : smallBlind]]) {
        const stake = element('div', 'blind-draw-stake');
        stake.append(element('span', 'blind-draw-player', who), element('strong', 'blind-draw-amount', amount(value)));
        payment.append(stake);
      }
      copy.append(label, payment);
      stage.dataset.blindDraw = 'revealed'; effects?.play?.('chip');
      if (!reducedMotion && !await animate([
        {transform: 'translate(-50%,-50%) perspective(550px) rotateY(-90deg)'},
        {transform: 'translate(-50%,-50%) perspective(550px) rotateY(0deg)'}
      ], {duration: 210, easing: 'ease-out', fill: 'both'})) return false;
      // Reduced motion still leaves the result and precise payment readable.
      if (!await hold(reducedMotion ? 1800 : 2400)) return false;
      title.remove(); copy.remove(); stage.dataset.blindDraw = 'flying';
      if (!reducedMotion && !await animate([
        {left: `${CENTER.x}px`, top: `${CENTER.y}px`, transform: 'translate(-50%,-50%) scale(1)'},
        {left: `${SEAT.x}px`, top: `${SEAT.y}px`, transform: `translate(-50%,-50%) scale(${SEAT.size / CENTER.size})`}
      ], {duration: 650, easing: 'cubic-bezier(.3,.05,.25,1)', fill: 'both'})) return false;
      if (!alive()) return false;
      position(SEAT, true); stage.dataset.blindDraw = 'seated'; active = null;
      return true;
    } catch (error) {
      if (alive()) clear();
      throw error;
    }
  }
  return {play, renderSeat, clear};
}
