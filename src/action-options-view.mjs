import {previewResponse} from './engine.mjs?v=56';
import {esc} from './shared.mjs?v=56';

export const ACTION_ART = Object.freeze({fold:'assets/action-buttons-v54/fold.png',
  check:'assets/action-buttons-v54/check.png',call:'assets/action-buttons-v54/call.png',
  bet:'assets/action-buttons-v54/bet.png',raise:'assets/action-buttons-v54/raise.png'});
export const chipIcon = '<img class="action-cost-chip" src="assets/chip-face-v24.svg" alt="" aria-hidden="true">';
const percent = value => `${Number((value * 100).toFixed(2))}%`;

/** Preview the exact selected size on an isolated engine clone, without advancing the real hand. */
export function actionResponsePreview(hand, action) {
  if (!hand || !action || action.type === 'fold' || hand.actor !== 'player' || hand.status !== 'playing') return null;
  const result = previewResponse(hand, action), grouped = new Map();
  for (const row of result.distribution) if (row.probability > 0) {
    grouped.set(row.type, (grouped.get(row.type) || 0) + row.probability);
  }
  const outcomes = [...grouped].map(([type, probability]) => ({type, probability, label:percent(probability)}));
  const nextPhase = result.status === 'settled' ? 'SHOWDOWN' : `DEAL ${String(result.street).toUpperCase()}`;
  return {outcomes, note:outcomes.length ? '' : nextPhase};
}

export function actionResponseMarkup(preview, {compact = false} = {}) {
  if (!preview) return '';
  const isPhase = preview.outcomes.length === 0;
  const description = preview.outcomes.map(row => `${row.type.toUpperCase()} ${row.label}`).join(', ') || preview.note;
  const probability = row => Number.isFinite(row.probability) ? Math.max(0, Math.min(1, row.probability)) : 0;
  // Keep tiny slices proportional; move their text to a separate legend instead of widening them.
  const needsLegend = preview.outcomes.length > 1;
  const copy = row => `<span>${esc(row.type.toUpperCase())}</span><b>${esc(row.label)}</b>`;
  const track = `<span class="button-response-outcomes">${preview.outcomes.map(row => `<span class="button-response-outcome" style="flex:0 0 ${probability(row)*100}%" data-probability="${probability(row)}" data-response="${esc(row.type)}">${copy(row)}</span>`).join('') || `<span class="button-response-note">${esc(preview.note)}</span>`}</span>`;
  const content = needsLegend ? `<span class="button-response-body">${track}<span class="button-response-legend">${preview.outcomes.map(row => `<span class="button-response-key" data-response="${esc(row.type)}">${copy(row)}</span>`).join('')}</span></span>` : track;
  return `<span class="button-response${compact?' size-response':''}${isPhase?' phase-response':''}${needsLegend?' has-response-legend':''}" data-outcome-count="${preview.outcomes.length}" aria-label="${isPhase?'Next phase':'Opponent response'}: ${esc(description)}">${isPhase?'':'<small class="button-response-title">BOSS</small>'}${content}</span>`;
}

/** Visual top-to-bottom order: all-in, full pot, half pot. Never alter engine action identity. */
export function raiseMenuChoices(actions) {
  return [...actions].sort((a,b) => {
    const rank = action => action.allIn ? 2 : action.sizeKeys?.includes('pot') ? 1 : 0;
    return rank(b)-rank(a) || b.amount-a.amount;
  });
}

export function raiseSizeLabel(action) {
  return action.allIn ? 'ALL IN' : action.sizeKeys?.includes('pot') ? '1× POT' : '0.5× POT';
}
