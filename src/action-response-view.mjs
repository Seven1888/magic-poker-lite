import {previewResponse} from './engine.mjs?v=56';
import {pct,esc} from './shared.mjs?v=56';
import {icon} from './ui-icons.mjs?v=56';

/** Table-facing vocabulary only; the underlying action type stays unchanged. */
export const responseActionLabel = type => ({fold:'FOLD',check:'CHECK',call:'CALL',bet:'BET',raise:'RAISE'}[type] || String(type).toUpperCase());

/** Presentation only: certainty is based on raw action odds, never rounded labels.
 * Multiple legal sizes of the same BET / RAISE are still one certain behavior.
 * The caller must sample the original distribution as usual to preserve RNG.
 */
export function isCertainResponse(distribution = []) {
  if (!distribution.length || distribution.some(row => !Number.isFinite(row.probability) || row.probability < 0)) return false;
  const positive = distribution.filter(row => row.probability > 0);
  return new Set(positive.map(row => row.type)).size === 1
    && Math.abs(positive.reduce((sum, row) => sum + row.probability, 0) - 1) <= Number.EPSILON * 8;
}

/** Show a sole response, or project mixed fold/aggressive outcomes without rescaling. */
export function responseBadges(distribution = []) {
  const grouped = new Map();
  for(const outcome of distribution)if(Number.isFinite(outcome.probability)&&outcome.probability>0)grouped.set(outcome.type,(grouped.get(outcome.type)||0)+outcome.probability);
  const positive = [...grouped].map(([type,probability])=>({type,probability}));
  const visible = positive.length === 1 ? positive
    : ['fold', 'raise', 'bet'].flatMap(type => positive.filter(outcome => outcome.type === type));
  return visible.map(({type, probability}) => ({type, probability,
    label: probability === 1 ? '100%' : probability < .001 ? '<0.1%' : pct(probability)}));
}

export function responseBadgeView(distribution, {phase = 'preview', selected = null} = {}) {
  const badges = responseBadges(distribution);
  if (!badges.length) return {markup: '', description: ''};
  const state = ['preview', 'drawing', 'result'].includes(phase) ? phase : 'preview';
  return {
    markup: `<span class="action-response-badges" data-phase="${state}" aria-hidden="true">${badges.map(badge => `<span class="action-response-badge${state === 'result' && selected === badge.type ? ' is-selected' : ''}" data-response="${badge.type}" data-probability="${badge.probability}"><span class="response-badge-label">${icon(badge.type==='bet'?'raise':badge.type)}${responseActionLabel(badge.type)}</span><b class="response-badge-percent">${esc(badge.label)}</b></span>`).join('')}</span>`,
    description: badges.map(badge => `opponent ${responseActionLabel(badge.type)} ${badge.label === '<0.1%' ? 'less than 0.1%' : badge.label}`).join(', ')
  };
}

/** Bind a preview to exactly the next same-street response to this player action. */
export function captureResponseSource(hand, action) {
  if (!hand || hand.status !== 'playing' || hand.actor !== 'player') return null;
  const distribution = previewResponse(hand, action).distribution;
  if (!responseBadges(distribution).length) return null;
  return {hand, street: hand.street, historyLength: hand.history.length + 1,
    action: {...action}, distribution: distribution.map(outcome => ({...outcome}))};
}

export function responseSourceMatches(source, hand) {
  return !!source && source.hand === hand && hand.status === 'playing' && hand.actor === 'npc'
    && source.street === hand.street && source.historyLength === hand.history.length;
}
