import {atGameSpeed} from './presentation-timing.mjs';

/** Read-only pot presentation. It never calls the game RNG or mutates a hand. */
export function createPotView({root = globalThis.document, reducedMotion = false, locale = 'zh', onPhase} = {}) {
  if (!root) throw new TypeError('createPotView needs a document or DOM root.');
  const doc = root.ownerDocument || root;
  const lookup = id => root.getElementById?.(id) || root.querySelector?.(`#${id}`) || null;
  const nodes = Object.fromEntries([
    'pot-display', 'pot-value', 'pot-label', 'pot-detail', 'pot-chips', 'pot-event',
    'contribution-player', 'contribution-npc', 'pot-flight-layer', 'player-stack', 'npc-stack',
    'player-cards', 'npc-cards', 'player-bankroll-chips', 'npc-bankroll-chips'
  ].map(id => [id, lookup(id)]));
  const clock = doc.defaultView?.performance || globalThis.performance;
  const now = () => clock?.now?.() ?? Date.now();
  const numeric = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
  const money = value => numeric(value).toLocaleString('en-US', {maximumFractionDigits: 2});
  const english = locale === 'en';
  const name = seat => english ? (seat === 'player' ? 'You' : 'Opponent') : (seat === 'player' ? '你' : '對手');
  const labels = english
    ? {smallBlind: 'Small blind', bigBlind: 'Big blind', call: 'Call', bet: 'Bet', raise: 'Raise'}
    : {smallBlind: '小盲', bigBlind: '大盲', call: '跟注', bet: '下注', raise: '加注'};
  const copy = english
    ? {pot: 'POT', settled: 'SETTLED POT', empty: 'Bets are collected here', refund: 'Refund ', noRefund: 'No uncalled refund', split: 'Split pot · ', ended: 'Hand complete', fee: 'Fee', divider: ' | '}
    : {pot: '底池 POT', settled: '已結算底池', empty: '雙方投入會集中到這裡', refund: '退款 ', noRefund: '無未跟注退款', split: '平分 · ', ended: '本手結束', fee: '費用', divider: '｜'};
  const seats = ['player', 'npc'];
  const motions = new Set();
  let currentSession = null, currentNumber = null, hasHand = false;
  let paid = {player: 0, npc: 0}, seenHistory = 0, settled = false;
  let settlementUntil = 0, chipSignature = '';
  let generation = 0, pendingPot = null, displayedTotal = 0;
  let settlementPlan = null, advancingSettlement = false;

  function notifyPhase(flow, entries = []) {
    if (typeof onPhase !== 'function') return;
    const event = {flow, seats: entries.map(item => item.seat), amounts: Object.fromEntries(entries.map(item => [item.seat, item.amount]))};
    try { Promise.resolve(onPhase(event)).catch(() => {}); } catch { /* A presentation observer cannot block chips or settlement. */ }
  }

  const write = (id, text) => {
    if (!nodes[id]) return;
    nodes[id].textContent = text;
    if (id === 'pot-value') nodes[id].classList?.toggle('compact-amount', text.length > 6);
  };
  function clearFlights() {
    generation++; pendingPot = null;
    settlementPlan?.finish(); settlementPlan = null;
    if (nodes['pot-display']) delete nodes['pot-display'].dataset.flow;
    for (const motion of [...motions]) {
      try { motion.animation.cancel?.(); } catch { /* An unavailable animation is already idle. */ }
      motion.complete();
    }
    settlementUntil = 0;
  }

  // Include arrival feedback spawned by a finishing flight. A new hand ends old waits.
  const whenIdle = async () => {
    const startedGeneration = generation;
    while (generation === startedGeneration && (motions.size || settlementPlan)) {
      await Promise.all([...motions].map(motion => motion.done).concat(settlementPlan ? [settlementPlan.done] : []));
    }
  };

  function drawChips(total, config) {
    const host = nodes['pot-chips'];
    if (!host) return;
    const base = Math.max(0.01, numeric(config?.bigBlind) || 10);
    // Decorative stacks show growth; the large pot number is the actual amount.
    const count = total > 0 ? Math.min(50, Math.max(15, 15 + Math.floor(5 * Math.log2(1 + total / base)))) : 0;
    const signature = String(count);
    if (signature === chipSignature) return;
    chipSignature = signature;
    host.replaceChildren();
    host.setAttribute('aria-hidden', 'true');
    for (let column = 0; column < 5; column++) {
      const stack = doc.createElement('span');
      stack.className = `chip-stack chip-stack-${column + 1}`;
      const height = Math.min(10, Math.ceil(Math.max(0, count - column) / 5));
      stack.style.setProperty('--chip-count', String(height));
      for (let level = 0; level < height; level++) {
        const chip = doc.createElement('i');
        chip.className = 'casino-chip';
        chip.style.setProperty('--chip-index', String(level));
        stack.append(chip);
      }
      host.append(stack);
    }
  }

  function center(element, layerRect, scaleX = 1, scaleY = 1) {
    const rect = element?.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    // DOM rectangles are viewport pixels; flight transforms use unscaled layer pixels.
    // The stage may translate and scale, but its flight layer must not rotate.
    return {
      x: (rect.left + rect.width / 2 - layerRect.left) / scaleX,
      y: (rect.top + rect.height / 2 - layerRect.top) / scaleY
    };
  }

  function trackAnimation(animation, {flow, duration, delay = 0, remove = () => {}}) {
    const epoch = generation;
    let resolveDone, timer, completed = false;
    const motion = {animation, flow, end: now() + delay + duration,
      done: new Promise(resolve => { resolveDone = resolve; }), complete: null};
    motion.complete = () => {
      if (completed) return;
      completed = true; clearTimeout(timer); remove(); motions.delete(motion);
      if (epoch === generation) {
        if (flow === 'contribution' && ![...motions].some(item => item.flow === 'contribution')) commitPot(true);
        advanceSettlement();
      }
      resolveDone();
    };
    motions.add(motion);
    // A missing/broken finished promise must not trap the gameplay controller.
    timer = setTimeout(motion.complete, delay + duration + 80);
    timer.unref?.();
    if (animation.finished?.then) animation.finished.then(motion.complete, motion.complete);
    else { animation.onfinish = motion.complete; animation.oncancel = motion.complete; }
    return motion;
  }

  function commitPot(arrived = false) {
    if (!pendingPot) return;
    const {total, config} = pendingPot; pendingPot = null;
    const changed = total !== displayedTotal; displayedTotal = total;
    write('pot-value', money(total)); drawChips(total, config);
    const pot = nodes['pot-display'];
    if (pot) delete pot.dataset.flow;
    if (!arrived || !changed || reducedMotion || typeof pot?.animate !== 'function') return;
    try {
      const duration = atGameSpeed(240);
      const animation = pot.animate([
        {filter: 'brightness(1)', transform: 'scale(1)'},
        {filter: 'brightness(1.35)', transform: 'scale(1.04)', offset: .35},
        {filter: 'brightness(1)', transform: 'scale(1)'}
      ], {duration, easing: 'ease-out'});
      trackAnimation(animation, {flow: 'arrival', duration});
    } catch { /* Numeric accounting is already visible when feedback is unavailable. */ }
  }

  function fly(seat, amount, flow, {delay = 0, duration = 1000} = {}) {
    if (reducedMotion || amount <= 0) return 0;
    const layer = nodes['pot-flight-layer'];
    const rect = layer?.getBoundingClientRect?.();
    if (!layer || !rect || rect.width <= 0 || rect.height <= 0) return 0;
    const scaleX = layer.offsetWidth > 0 ? rect.width / layer.offsetWidth : 1;
    const scaleY = layer.offsetHeight > 0 ? rect.height / layer.offsetHeight : 1;
    const stackPoint = center(nodes[`${seat}-bankroll-chips`], rect, scaleX, scaleY)
      || center(nodes[`${seat}-stack`], rect, scaleX, scaleY)
      || center(nodes[`${seat}-cards`], rect, scaleX, scaleY);
    const potPoint = center(nodes['pot-chips'], rect, scaleX, scaleY)
      || center(nodes['pot-display'], rect, scaleX, scaleY)
      || center(nodes['pot-value'], rect, scaleX, scaleY);
    if (!stackPoint || !potPoint) return 0;
    const inbound = flow === 'contribution';
    const from = inbound ? stackPoint : potPoint, to = inbound ? potPoint : stackPoint;
    const el = doc.createElement('span');
    el.className = 'flying-chip';
    el.dataset.flow = flow; el.dataset.seat = seat;
    el.setAttribute('aria-hidden', 'true');
    Object.assign(el.style, {position: 'absolute', left: '0', top: '0', pointerEvents: 'none', zIndex: '40'});
    const group = doc.createElement('span'); group.className = 'flying-chip-group';
    const chipCount = Math.min(5, Math.max(3, 3 + Math.floor(Math.log2(1 + amount / 10))));
    for (let index = 0; index < chipCount; index++) {
      const chip = doc.createElement('i'); chip.className = 'casino-chip';
      chip.style.setProperty('--chip-index', String(index)); group.append(chip);
    }
    const amountLabel = doc.createElement('b'); amountLabel.className = 'amount';
    amountLabel.textContent = `${flow === 'refund' ? copy.refund : '+'}${money(amount)}`;
    el.append(group, amountLabel); layer.append(el);
    if (typeof el.animate !== 'function') { el.remove(); return 0; }
    const transform = (point, scale) => `translate3d(${point.x}px,${point.y}px,0) translate(-50%,-50%) scale(${scale})`;
    const midpoint = {x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - 32};
    const actualDuration = atGameSpeed(duration), actualDelay = atGameSpeed(delay);
    let animation;
    try { animation = el.animate([
      {transform: transform(from, 0.72), opacity: 0, offset: 0},
      {transform: transform(from, 0.9), opacity: 1, offset: 0.1},
      {transform: transform(midpoint, 1.05), opacity: 1, offset: 0.52},
      {transform: transform(to, 0.82), opacity: 0, offset: 1}
    ], {duration: actualDuration, delay: actualDelay, easing: 'cubic-bezier(.22,.72,.25,1)', fill: 'both'}); }
    catch { el.remove(); return 0; }
    trackAnimation(animation, {flow, duration: actualDuration, delay: actualDelay, remove: () => el.remove()});
    return actualDelay + actualDuration;
  }

  // Advance synchronously at phase boundaries. Completed flights can create an
  // arrival pulse, and no refund/payout begins until every current motion ends.
  function advanceSettlement() {
    if (advancingSettlement || !settlementPlan || motions.size) return;
    advancingSettlement = true;
    try {
      while (settlementPlan && !motions.size) {
        const plan = settlementPlan;
        if (plan.generation !== generation) return;
        let flow, entries;
        if (plan.stage === 'contribution') {
          plan.stage = 'refund'; flow = 'refund'; entries = plan.refunds;
        } else if (plan.stage === 'refund') {
          pendingPot = {total: numeric(plan.result.pot), config: plan.config}; commitPot();
          plan.stage = 'payout'; flow = 'payout'; entries = plan.recipients;
        } else {
          pendingPot = {total: 0, config: plan.config}; commitPot();
          write('pot-label', copy.pot);
          settlementPlan = null; settlementUntil = 0; plan.finish();
          notifyPhase('complete');
          return;
        }
        if (entries.length) {
          if (nodes['pot-display']) nodes['pot-display'].dataset.flow = flow;
          notifyPhase(flow, entries);
          if (settlementPlan !== plan || plan.generation !== generation) return;
          entries.forEach(({seat, amount}, index) => fly(seat, amount, flow, {duration: 1100, delay: index * 40}));
          settlementUntil = Math.max(now(), ...[...motions].map(motion => motion.end));
        }
      }
    } finally { advancingSettlement = false; }
  }

  function render(hand, config = hand?.config, {deferSettlement = false} = {}) {
    if (!hand) {
      clearFlights(); hasHand = false; currentSession = currentNumber = null;
      paid = {player: 0, npc: 0}; seenHistory = 0; settled = false;
      displayedTotal = 0;
      write('pot-label', copy.pot); write('pot-value', '0');
      write('pot-detail', copy.empty); write('pot-event', '');
      for (const seat of seats) write(`contribution-${seat}`, '0');
      if (nodes['pot-display']) nodes['pot-display'].dataset.settled = 'false';
      drawChips(0, config);
      return;
    }
    const sessionIdentity = hand.session || hand;
    if (!hasHand || currentSession !== sessionIdentity || currentNumber !== hand.handNumber) {
      clearFlights(); currentSession = sessionIdentity; currentNumber = hand.handNumber; hasHand = true;
      paid = {player: 0, npc: 0}; seenHistory = 0; settled = false;
      displayedTotal = 0; write('pot-value', '0'); drawChips(0, config);
      write('pot-event', '');
    }
    // The terminal presentation owns its pot total through completion. A stale
    // or repeated render must neither launch another sequence nor refill it.
    if (settled) return;
    const pendingResult = hand.status === 'settled' ? hand.result : null;
    // Once displayed, settlement cannot be rolled back by a stale defer render.
    const result = pendingResult && (!deferSettlement || settled) ? pendingResult : null;
    const total = pendingResult
      ? seats.reduce((sum, seat) => sum + numeric(hand.contributions?.[seat]), 0)
      : numeric(result?.pot ?? hand.pot);
    write('pot-label', result ? copy.settled : copy.pot);
    if (nodes['pot-display']) nodes['pot-display'].dataset.settled = String(!!result);
    for (const seat of seats) write(`contribution-${seat}`, money(result ? result[seat]?.matchedWager : hand.contributions?.[seat]));

    const history = Array.isArray(hand.history) ? hand.history : [];
    const newPayments = history.slice(seenHistory).filter(event => labels[event.type] && numeric(event.amount) > 0);
    seenHistory = history.length;
    const additions = seats.map(seat => ({seat, amount: Math.max(0, numeric(hand.contributions?.[seat]) - paid[seat])})).filter(item => item.amount > 0.0000001);
    for (const seat of seats) paid[seat] = numeric(hand.contributions?.[seat]);
    pendingPot = {total, config};
    additions.forEach(({seat, amount}, index) => {
      fly(seat, amount, 'contribution', {duration: 1000, delay: index * 80});
    });
    if ([...motions].some(motion => motion.flow === 'contribution')) {
      if (nodes['pot-display']) nodes['pot-display'].dataset.flow = 'contribution';
    } else commitPot();

    if (!result) {
      write('pot-detail', `${name('player')} ${money(hand.contributions?.player)} + ${name('npc')} ${money(hand.contributions?.npc)} = ${money(total)}`);
      if (newPayments.length) {
        const isBlinds = newPayments.every(event => event.type === 'smallBlind' || event.type === 'bigBlind');
        const events = isBlinds ? newPayments : newPayments.slice(-1);
        write('pot-event', events.map(event => `${name(event.actor)}${english ? ' · ' : ''}${labels[event.type]} +${money(event.amount)}`).join(' · '));
      }
      if (additions.length) notifyPhase('contribution', additions);
      return;
    }

    const refunds = seats.filter(seat => numeric(result[seat]?.refund) > 0);
    const matchedText = english ? `Matched: ${money(result.player?.matchedWager)} each` : `雙方各匹配 ${money(result.player?.matchedWager)}`;
    const refundText = refunds.length
      ? refunds.map(seat => english ? `${name(seat)}: refund ${money(result[seat].refund)}` : `${name(seat)}退回 ${money(result[seat].refund)}`).join(english ? ' · ' : '、')
      : copy.noRefund;
    write('pot-detail', `${matchedText}${copy.divider}${refundText}`);
    const recipients = seats.filter(seat => numeric(result[seat]?.netReturn) > 0);
    const payoutText = recipients.map(seat => english
      ? `${seat === 'player' ? 'You receive' : 'Opponent receives'} ${money(result[seat].netReturn)}`
      : `${name(seat)}領回 ${money(result[seat].netReturn)}`).join(' · ');
    write('pot-event', `${result.winner === 'tie' ? copy.split : ''}${payoutText || copy.ended}${copy.divider}${copy.fee} ${money(result.fee)}`);
    settled = true;
    let finish;
    const done = new Promise(resolve => {finish = resolve;});
    settlementPlan = {generation, stage: 'contribution', result, config, done, finish,
      refunds: refunds.map(seat => ({seat, amount: numeric(result[seat].refund)})),
      recipients: recipients.map(seat => ({seat, amount: numeric(result[seat].netReturn)}))};
    settlementUntil = Math.max(now(), ...[...motions].map(motion => motion.end));
    if (additions.length) notifyPhase('contribution', additions);
    advanceSettlement();
  }

  return {render, whenIdle, settledDelay: () => reducedMotion ? 0 : Math.max(0, Math.min(Math.ceil(atGameSpeed(1000)), Math.ceil(settlementUntil - now())))};
}
