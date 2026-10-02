/** Present an already calculated public equity; this view never reads cards or RNG. */
export function renderWinRate(element, equity = null, {description = '', title = ''} = {}) {
  if (!element) return;
  const visible = typeof equity === 'number' && Number.isFinite(equity) && equity >= 0 && equity <= 1;
  element.hidden = !visible;
  if (!visible) {
    element.textContent = '';
    element.style.removeProperty('--win-rate-turn');
    delete element.dataset.equity;
    element.removeAttribute('aria-label');
    element.removeAttribute('title');
    return;
  }
  const percent = Math.round(equity * 100);
  element.innerHTML = `<span class="win-rate-value">${percent}<small>%</small></span>`;
  element.style.setProperty('--win-rate-turn', `${equity}turn`);
  element.dataset.equity = String(equity);
  element.setAttribute('aria-label', description || `${percent}% equity; ties count as half a win.`);
  element.title = title;
}
