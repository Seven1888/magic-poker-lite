const CATEGORIES = [
  ['HIGH CARD', 'High Card'], ['PAIR', 'One Pair'], ['TWO PAIR', 'Two Pair'],
  ['TRIPS', 'Three of a Kind'], ['STRAIGHT', 'Straight'], ['FLUSH', 'Flush'],
  ['FULL HOUSE', 'Full House'], ['QUADS', 'Four of a Kind'], ['STR. FLUSH', 'Straight Flush']
];
const STARTING_DESCRIPTION = 'Preflop, the BOSS has two starting cards: a pair or unpaired high cards. These percentages describe that current two-card hand, based on your known cards. Other categories need community cards. This is not your win chance or a forecast of future cards.';
const MADE_DESCRIPTION = 'What could the BOSS have right now? These are the chances of each current best hand category, based on the cards you can see. Updates on the FLOP, TURN and RIVER. This is not your win chance or a forecast of future cards.';

function readDistribution(distribution) {
  if (!Array.isArray(distribution) || distribution.length !== CATEGORIES.length) return null;
  const rows = [], seen = new Set();
  for (const entry of distribution) {
    const category = entry?.category, probability = entry?.probability;
    if (!Number.isInteger(category) || category < 0 || category >= CATEGORIES.length || seen.has(category)
      || typeof probability !== 'number' || !Number.isFinite(probability) || probability < 0 || probability > 1) return null;
    seen.add(category);
    rows.push({category, probability});
  }
  if (Math.abs(rows.reduce((sum, row) => sum + row.probability, 0) - 1) > 1e-7) return null;
  return rows;
}

function percent(probability) {
  if (probability === 0) return '0%';
  if (probability === 1) return '100%';
  if (probability < .001) return '<0.1%';
  // A rounded near-certainty must not imply that other possible hands are impossible.
  const rounded = Math.min(99.9, Math.round(probability * 1000) / 10);
  return `${rounded}%`;
}

/** Present only an already calculated, public-information category distribution. */
export function createBossRangeView({root = globalThis.document} = {}) {
  const doc = root?.ownerDocument || root;
  const stage = root?.getElementById?.('game') || root?.querySelector?.('#game');
  if (!stage || !doc?.body || !doc?.createElement) return {render() {}, clear() {}, close() {}};
  const make = (tag, className, text) => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = make('button', 'boss-hand-range');
  button.id = 'boss-hand-range'; button.type = 'button'; button.hidden = true; button.disabled = true;
  button.setAttribute('aria-haspopup', 'dialog'); button.setAttribute('aria-controls', 'boss-range-dialog');
  button.setAttribute('aria-expanded', 'false');
  const heading = make('span', 'boss-range-heading');
  const headingLabel = make('span', '', 'POSSIBLE HANDS');
  const hint = make('span', 'boss-range-info', 'ⓘ'); hint.setAttribute('aria-hidden', 'true'); heading.append(headingLabel, hint);
  const summary = make('span', 'boss-range-summary');
  button.append(heading, summary); stage.append(button);

  const dialog = make('dialog', 'boss-range-dialog'); dialog.id = 'boss-range-dialog';
  dialog.setAttribute('aria-labelledby', 'boss-range-title');
  dialog.setAttribute('aria-describedby', 'boss-range-description');
  const closeButton = make('button', 'dialog-close', '×'); closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Close BOSS hand distribution');
  const eyebrow = make('span', 'eyebrow', 'READ THE BOARD');
  const title = make('h2', '', 'POSSIBLE BOSS HANDS'); title.id = 'boss-range-title';
  const description = make('p', 'boss-range-description', MADE_DESCRIPTION);
  description.id = 'boss-range-description';
  const list = make('dl', 'boss-range-list');
  const method = make('p', 'boss-range-method', 'Uses your hand and the revealed board. Every possible pair of unseen cards is equally likely, as in standard Texas Hold’em. Betting actions and action percentages do not affect these estimates. It never reads hidden BOSS cards or unrevealed board cards.');
  const note = make('p', 'boss-range-note', 'The table shows up to three most likely categories, ordered from strongest to weakest. Each percentage keeps its share of all possible hands, so the three shown may total less than 100%. The complete distribution totals 100% before rounding.');
  dialog.append(closeButton, eyebrow, title, description, list, method, note); doc.body.append(dialog);
  let current = null, paintedKey = null;
  const attribute = (node, name, value) => {
    if (node.getAttribute(name) !== value) node.setAttribute(name, value);
  };

  function close() {
    if (dialog.open) dialog.close();
    attribute(button, 'aria-expanded', 'false');
  }
  function clear() {
    close(); current = null;
    if (!button.hidden) button.hidden = true;
    if (!button.disabled) button.disabled = true;
    if (button.getAttribute('aria-label') !== null) button.removeAttribute('aria-label');
    if (button.getAttribute('aria-busy') !== null) button.removeAttribute('aria-busy');
    delete button.dataset.state;
    delete button.dataset.basis;
    if (paintedKey !== null) { summary.replaceChildren(); list.replaceChildren(); }
    paintedKey = null;
  }
  function row(label, probability, className = 'boss-range-row') {
    const result = make('span', className);
    result.append(make('span', 'boss-range-label', label), make('b', 'boss-range-percent', percent(probability)));
    return result;
  }
  function render({visible = false, busy = false, calculating = false, distribution = null, unavailable = false, basis = 'made-hand'} = {}) {
    if (!visible) { clear(); return; }
    const starting = basis === 'starting-hand';
    const distributionName = starting ? 'starting hand' : 'current hand';
    if (button.dataset.basis !== basis) {
      button.dataset.basis = basis;
      headingLabel.textContent = starting ? 'STARTING HAND' : 'POSSIBLE HANDS';
      eyebrow.textContent = starting ? 'PREFLOP' : 'READ THE BOARD';
      title.textContent = starting ? 'BOSS STARTING HAND' : 'POSSIBLE BOSS HANDS';
      description.textContent = starting ? STARTING_DESCRIPTION : MADE_DESCRIPTION;
    }
    const parsed = !calculating && !unavailable ? readDistribution(distribution) : null;
    if (button.hidden) button.hidden = false;
    const disabled = busy || !parsed;
    if (button.disabled !== disabled) button.disabled = disabled;
    attribute(button, 'aria-busy', String(Boolean(calculating)));
    if (busy || !parsed) close();
    current = parsed;
    if (!current) {
      const nextKey = `${basis}:${calculating ? 'calculating' : 'unavailable'}`;
      if (paintedKey === nextKey) return;
      paintedKey = nextKey;
      list.replaceChildren();
      const message = calculating ? 'CALCULATING…' : 'UNAVAILABLE';
      summary.replaceChildren(make('span', 'boss-range-status', message));
      button.dataset.state = calculating ? 'calculating' : 'unavailable';
      button.setAttribute('aria-label', `BOSS ${distributionName} distribution: ${message.toLowerCase()}`);
      return;
    }
    // Canonical public values catch in-place updates as well as equivalent new
    // arrays, while keeping all twelve summary/detail rows stable across actions.
    const nextKey = `${basis}:` + [...current].sort((a,b) => a.category - b.category).map(entry => entry.probability).join(',');
    if (paintedKey === nextKey) return;
    paintedKey = nextKey;
    button.dataset.state = 'ready';
    const ranked = [...current].filter(entry => entry.probability > 0)
      .sort((a, b) => b.probability - a.probability || b.category - a.category);
    const top = ranked.slice(0, 3).sort((a, b) => b.category - a.category);
    const summaryRows = top.map(entry => row(CATEGORIES[entry.category][0], entry.probability));
    summary.replaceChildren(...summaryRows);
    button.setAttribute('aria-label', `BOSS ${distributionName} distribution. ${top.map(entry => `${CATEGORIES[entry.category][1]} ${percent(entry.probability)}`).join(', ')}. View all nine categories.`);
    list.replaceChildren(...[...current].sort((a, b) => b.category - a.category).map(entry => {
      const detail = make('div', 'boss-range-detail-row');
      if (entry.probability === 0) detail.className += ' is-zero';
      detail.append(make('dt', '', CATEGORIES[entry.category][1]), make('dd', '', percent(entry.probability)));
      return detail;
    }));
  }

  button.addEventListener('click', () => {
    if (button.disabled || button.hidden || !current || dialog.open) return;
    dialog.showModal(); button.setAttribute('aria-expanded', 'true');
  });
  closeButton.addEventListener('click', close);
  dialog.addEventListener('close', () => button.setAttribute('aria-expanded', 'false'));
  dialog.addEventListener('cancel', close);
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
  });
  return {render, clear, close};
}
