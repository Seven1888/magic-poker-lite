import {previewResponse} from './engine.mjs';
import {pct,esc} from './shared.mjs';
import {icon} from './ui-icons.mjs';

/** Project only the two requested outcomes, retaining each original probability. */
export function responseBadges(distribution = []) {
  const positive = distribution.filter(outcome => Number.isFinite(outcome.probability) && outcome.probability > 0);
  if (positive.length < 2) return [];
  return ['fold', 'raise'].flatMap(type => {
    const outcome = positive.find(item => item.type === type);
    return outcome ? [{type, probability: outcome.probability,
      label: outcome.probability < .001 ? '<0.1%' : pct(outcome.probability)}] : [];
  });
}

export function responseBadgeView(distribution, {phase = 'preview', selected = null} = {}) {
  const badges = responseBadges(distribution);
  if (!badges.length) return {markup: '', description: ''};
  const state = ['preview', 'drawing', 'result'].includes(phase) ? phase : 'preview';
  return {
    markup: `<span class="action-response-badges" data-phase="${state}" aria-hidden="true">${badges.map(badge => `<span class="action-response-badge${state === 'result' && selected === badge.type ? ' is-selected' : ''}" data-response="${badge.type}" data-probability="${badge.probability}"><span class="response-badge-label">${icon(badge.type)}${badge.type.toUpperCase()}</span><b class="response-badge-percent">${esc(badge.label)}</b></span>`).join('')}</span>`,
    description: badges.map(badge => `opponent ${badge.type.toUpperCase()} ${badge.label === '<0.1%' ? 'less than 0.1%' : badge.label}`).join(', ')
  };
}

/** Bind a preview to exactly the next same-street response to this player action. */
export function captureResponseSource(hand, action) {
  if (!hand || hand.status !== 'playing' || hand.actor !== 'player') return null;
  const distribution = previewResponse(hand, action.type).distribution;
  if (!responseBadges(distribution).length) return null;
  return {hand, street: hand.street, historyLength: hand.history.length + 1,
    action: {...action}, distribution: distribution.map(outcome => ({...outcome}))};
}

export function responseSourceMatches(source, hand) {
  return !!source && source.hand === hand && hand.status === 'playing' && hand.actor === 'npc'
    && source.street === hand.street && source.historyLength === hand.history.length;
}
