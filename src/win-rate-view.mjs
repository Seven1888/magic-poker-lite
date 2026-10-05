/** Present an already calculated public equity; this view never reads cards or RNG. */
const rendered = new WeakMap();
export function equityPercent(equity) {
  const value = equity === 1 ? '100' : equity === 0 ? '0' : equity < .001 ? '<0.1' : String(Math.min(99.9, Math.round(equity * 1000) / 10));
  return `${value}%`;
}
export function renderWinRate(element, equity = null, {description = '', title = ''} = {}) {
  if (!element) return;
  const previous = rendered.get(element);
  const visible = typeof equity === 'number' && Number.isFinite(equity) && equity >= 0 && equity <= 1;
  if (element.hidden !== !visible) element.hidden = !visible;
  if (!visible) {
    if (previous?.visible !== false) {
      element.textContent = '';
      element.style.removeProperty('--win-rate-turn');
      element.removeAttribute('aria-label');
      element.removeAttribute('title');
    }
    delete element.dataset.equity;
    delete element.dataset.method;
    delete element.dataset.outcomes;
    rendered.set(element, {visible:false});
    return;
  }
  const percent = equityPercent(equity).slice(0,-1);
  const label = description || `${percent}% equity; ties count as half a win.`;
  // Keep the existing number node and any transient momentum decoration on a
  // same-result repaint. Public odds updates need not rebuild the ring on every action.
  if (!previous?.visible || previous.equity !== equity) {
    element.innerHTML = `<span class="win-rate-value${percent.includes('.')?' is-fractional':''}">${percent.replace('<','&lt;')}<small>%</small></span>`;
    element.style.setProperty('--win-rate-turn', `${equity}turn`);
    element.dataset.equity = String(equity);
  }
  if (!previous?.visible || previous.label !== label) element.setAttribute('aria-label', label);
  if (!previous?.visible || previous.title !== title) element.title = title;
  rendered.set(element, {visible:true,equity,label,title});
}
