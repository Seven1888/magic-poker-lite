const EPSILON = 1e-7;
const round = value => Math.round((value + Number.EPSILON) * 1e6) / 1e6;
const other = actor => actor === 'player' ? 'npc' : 'player';
const LABELS = {fold: '棄牌', check: '過牌', call: '跟注', bet: '下注', raise: '加注'};

export const HOLDEM_SIZE_WEIGHTS = Object.freeze({half: 0.5, pot: 0.35, allin: 0.15});
export const PLAYER_HOLDEM_SIZE_WEIGHTS = Object.freeze({'2x': 0.5, '4x': 0.35, allin: 0.15});
export const isFixedHoldem = config => config?.outcome?.mode === 'fixed-holdem';
export const isPooledHoldem = config => config?.outcome?.mode === 'pooled-holdem';
export const isHoldemBetting = config => isFixedHoldem(config) || isPooledHoldem(config);

function action(type, amount = 0, to = 0, extra = {}) {
  return {id: type, type, label: LABELS[type], amount: round(amount), to: round(to), allIn: false, ...extra};
}

/** Public legal quotes. P includes all chips already posted; C is the unpaid call. */
export function legalHoldemActions(hand, actor = hand.actor) {
  if (hand.status !== 'playing' || actor !== hand.actor || !['player', 'npc'].includes(actor)) return [];
  const opponent = other(actor), stack = hand.stacks[actor], paid = hand.streetBets[actor];
  if (!(stack > EPSILON)) return [];
  const owed = round(Math.max(0, hand.currentBet - paid));
  const actions = owed > EPSILON
    ? [action('fold'), action('call', Math.min(owed, stack), paid + Math.min(owed, stack), {allIn: owed >= stack - EPSILON})]
    : [action('check', 0, paid)];
  const maximum = round(paid + stack);
  const mayRaise = !hand.actedSinceFullRaise?.includes(actor);
  if (!(hand.stacks[opponent] > EPSILON) || maximum <= hand.currentBet + EPSILON || !mayRaise) return actions;
  const type = hand.currentBet > EPSILON ? 'raise' : 'bet';
  const minimumTo = round(hand.currentBet + (hand.lastFullRaise || hand.config.bigBlind));
  const quotes = actor === 'player' && isPooledHoldem(hand.config) ? [
    ['2x', round(paid + 2 * hand.pot)],
    ['4x', round(paid + 4 * hand.pot)],
    ['allin', maximum]
  ] : [
    ['half', round(paid + owed + 0.5 * (hand.pot + owed))],
    ['pot', round(paid + owed + hand.pot + owed)],
    ['allin', maximum]
  ];
  for (const [sizeKey, proposed] of quotes) {
    const to = round(Math.min(maximum, Math.max(minimumTo, proposed)));
    const amount = round(to - paid), allIn = amount >= stack - EPSILON;
    const existing = actions.find(candidate => candidate.type === type && Math.abs(candidate.to - to) < EPSILON);
    if (existing) { existing.sizeKeys.push(sizeKey); continue; }
    actions.push(action(type, amount, to, {id: `${type}:${sizeKey}`, sizeKey, sizeKeys: [sizeKey],
      allIn, fullRaise: to >= minimumTo - EPSILON, raiseIncrement: round(to - hand.currentBet)}));
  }
  return actions;
}

/** An explicit quote must resolve exactly; type-only callers select the smallest quote. */
export function resolveHoldemAction(actions, requested) {
  if (typeof requested === 'string') {
    if (requested === 'allin') return actions.find(item => item.sizeKeys?.includes('allin'))
      ?? actions.find(item => item.type === 'call' && item.allIn);
    return actions.find(item => item.id === requested)
      ?? actions.find(item => item.type === requested && item.sizeKeys?.includes('half'))
      ?? actions.find(item => item.type === requested);
  }
  if (!requested || typeof requested !== 'object') return undefined;
  const chosen = requested.id ? actions.find(item => item.id === requested.id)
    : requested.sizeKey ? actions.find(item => item.type === requested.type && item.sizeKeys?.includes(requested.sizeKey))
    : actions.find(item => item.type === requested.type && (requested.to === undefined || Math.abs(item.to - requested.to) < EPSILON));
  if (!chosen || ['amount', 'to'].some(key => requested[key] !== undefined
    && (!Number.isFinite(requested[key]) || Math.abs(requested[key] - chosen[key]) > EPSILON))) return undefined;
  return chosen;
}

export function markHoldemAction(hand, actor, chosen) {
  if (chosen.type === 'raise' || chosen.type === 'bet') {
    if (chosen.fullRaise) {
      hand.lastFullRaise = chosen.raiseIncrement;
      hand.actedSinceFullRaise = [actor];
    } else hand.actedSinceFullRaise = [...new Set([...(hand.actedSinceFullRaise || []), actor])];
  } else hand.actedSinceFullRaise = [...new Set([...(hand.actedSinceFullRaise || []), actor])];
}
