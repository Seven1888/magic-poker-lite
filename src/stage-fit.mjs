/** Fit a fixed portrait stage without changing game state. Returns listener cleanup. */
export function fitStage({shell, stage, width = 400, height = 860} = {}) {
  if (!shell?.style || !stage?.style) throw new TypeError('fitStage needs shell and stage elements.');
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new RangeError('Stage width and height must be positive finite numbers.');
  }
  const doc = shell.ownerDocument || stage.ownerDocument;
  const view = doc?.defaultView || globalThis.window;
  if (!view?.addEventListener) throw new TypeError('fitStage needs a browser window.');
  const viewport = view.visualViewport;
  const positive = (...values) => values.find(value => Number.isFinite(value) && value > 0);

  function resize() {
    const viewportWidth = positive(doc?.documentElement?.clientWidth, view.innerWidth, width);
    const viewportHeight = positive(viewport?.height, view.innerHeight, doc?.documentElement?.clientHeight, height);
    const inset = viewportWidth <= 720 ? 0 : 32;
    // On an unusually short viewport, fitting the whole stage takes priority over margins.
    const availableWidth = viewportWidth > inset * 2 ? viewportWidth - inset * 2 : viewportWidth;
    const availableHeight = viewportHeight > inset * 2 ? viewportHeight - inset * 2 : viewportHeight;
    const scale = Math.min(1, availableWidth / width, availableHeight / height);
    shell.style.width = `${width * scale}px`;
    shell.style.height = `${height * scale}px`;
    stage.style.setProperty('--stage-scale', String(scale));
  }

  resize();
  view.addEventListener('resize', resize);
  viewport?.addEventListener?.('resize', resize);
  return function cleanup() {
    view.removeEventListener('resize', resize);
    viewport?.removeEventListener?.('resize', resize);
  };
}
