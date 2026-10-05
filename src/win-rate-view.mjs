/** Present an already calculated public equity; this view never reads cards or RNG. */
export function equityPercent(equity) {
  const value = equity === 1 ? '100' : equity === 0 ? '0' : equity < .001 ? '<0.1' : String(Math.min(99.9, Math.round(equity * 1000) / 10));
  return `${value}%`;
}
export function renderWinRate(element, equity = null, {description = '', title = ''} = {}) {
  if (!element) return;
  const visible = typeof equity === 'number' && Number.isFinite(equity) && equity >= 0 && equity <= 1;
  element.hidden = !visible;
  if (!visible) {
    element.textContent = '';
    element.style.removeProperty('--win-rate-turn');
    delete element.dataset.equity;
    delete element.dataset.method;
    delete element.dataset.outcomes;
    element.removeAttribute('aria-label');
    element.removeAttribute('title');
    return;
  }
  const percent = equityPercent(equity).slice(0,-1);
  element.innerHTML = `<span class="win-rate-value${percent.includes('.')?' is-fractional':''}">${percent.replace('<','&lt;')}<small>%</small></span>`;
  element.style.setProperty('--win-rate-turn', `${equity}turn`);
  element.dataset.equity = String(equity);
  element.setAttribute('aria-label', description || `${percent}% equity; ties count as half a win.`);
  element.title = title;
}
