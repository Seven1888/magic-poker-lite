import {previewResponse} from './engine.mjs?v=59';
import {esc} from './shared.mjs?v=59';

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
  // Fill the whole frame with raw odds. Only move labels off individual slices
  // when their size or precision would make that text unreadable.
  const needsLegend = preview.outcomes.length > 1;
  const longPercent = preview.outcomes.some(row => String(row.label).length > 4);
  const labelLayout = preview.outcomes.length > 2 || longPercent || preview.outcomes.some(row => probability(row) < .3) ? 'overlay' : 'segments';
  const copy = row => `<span>${esc(row.type.toUpperCase())}</span><b>${esc(row.label)}</b>`;
  const track = `<span class="button-response-outcomes">${preview.outcomes.map(row => `<span class="button-response-outcome" style="flex:0 0 ${probability(row)*100}%" data-probability="${probability(row)}" data-response="${esc(row.type)}">${copy(row)}</span>`).join('') || `<span class="button-response-note">${esc(preview.note)}</span>`}</span>`;
  const content = needsLegend ? `<span class="button-response-body" data-label-layout="${labelLayout}">${track}<span class="button-response-legend" aria-hidden="true">${preview.outcomes.map(row => `<span class="button-response-key" data-response="${esc(row.type)}">${copy(row)}</span>`).join('')}</span></span>` : track;
  return `<span class="button-response${compact?' size-response':''}${isPhase?' phase-response':''}${needsLegend?' has-response-legend':''}" data-outcome-count="${preview.outcomes.length}" data-long-percent="${longPercent}" aria-label="${isPhase?'Next phase':'Opponent response'}: ${esc(description)}">${isPhase?'':'<small class="button-response-title">BOSS</small>'}${content}</span>`;
}

/** Keep the largest choice on top without changing the quoted action identity. */
export function raiseMenuChoices(actions) {
  return [...actions].sort((a,b) => {
    const rank = action => action.allIn ? 2 : action.sizeKeys?.some(key => ['4x','pot'].includes(key)) ? 1 : 0;
    return rank(b)-rank(a) || b.amount-a.amount;
  });
}

export function raiseSizeLabel(action) {
  if (action.allIn) return 'ALL IN';
  if (action.sizeKeys?.includes('4x')) return '4× POT';
  if (action.sizeKeys?.includes('2x')) return '2× POT';
  return action.sizeKeys?.includes('pot') ? '1× POT' : '0.5× POT';
}
