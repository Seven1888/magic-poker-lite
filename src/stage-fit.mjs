const positive = (...values) => values.find(value => Number.isFinite(value) && value > 0);
const nonnegative = value => Number.isFinite(value) && value > 0 ? value : 0;

/** Pure viewport layout. A short screen scrolls instead of shrinking the action buttons below 45px. */
export function stageLayout({viewportWidth, viewportHeight, width = 400, height = 860, insets = {}} = {}) {
  if (![viewportWidth, viewportHeight, width, height].every(value => Number.isFinite(value) && value > 0)) {
    throw new RangeError('Stage and viewport dimensions must be positive finite numbers.');
  }
  const availableWidth = Math.max(1, viewportWidth - nonnegative(insets.left) - nonnegative(insets.right));
  const availableHeight = Math.max(1, viewportHeight - nonnegative(insets.top) - nonnegative(insets.bottom));
  const widthScale = Math.min(1, availableWidth / width);
  // Width always wins on narrow / split-screen windows; never force horizontal scrolling.
  const scale = Math.min(widthScale, Math.max(availableHeight / height, Math.min(.75, widthScale)));
  return {scale, width: width * scale, height: height * scale, scroll: height * scale > availableHeight + .5};
}

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
  let frame = null;

  function resize() {
    frame = null;
    const viewportWidth = positive(doc?.documentElement?.clientWidth, view.innerWidth, width);
    // Keep the existing geometry while the user magnifies/pans the page.
    if (viewport?.scale > 1.01) return;
    const viewportHeight = positive(viewport?.height, view.innerHeight, doc?.documentElement?.clientHeight, height);
    const offsetTop = nonnegative(viewport?.offsetTop);
    const root = doc?.documentElement;
    root?.style?.setProperty('--viewport-height', `${viewportHeight}px`);
    root?.style?.setProperty('--viewport-offset-top', `${offsetTop}px`);
    // CSS resolves env(safe-area-inset-*) and the desktop gutter to actual pixels.
    const padding = doc?.body && view.getComputedStyle?.(doc.body);
    const layout = stageLayout({viewportWidth, viewportHeight, width, height, insets: {
      top: parseFloat(padding?.paddingTop), right: parseFloat(padding?.paddingRight),
      bottom: parseFloat(padding?.paddingBottom), left: parseFloat(padding?.paddingLeft)
    }});
    shell.style.width = `${layout.width}px`;
    shell.style.height = `${layout.height}px`;
    stage.style.setProperty('--stage-scale', String(layout.scale));
    if (root?.dataset) root.dataset.stageScroll = String(layout.scroll);
  }

  function schedule() {
    if (frame !== null) return;
    if (view.requestAnimationFrame) frame = view.requestAnimationFrame(resize);
    else resize();
  }

  resize();
  view.addEventListener('resize', schedule);
  view.addEventListener('orientationchange', schedule);
  viewport?.addEventListener?.('resize', schedule);
  viewport?.addEventListener?.('scroll', schedule);
  return function cleanup() {
    view.removeEventListener('resize', schedule);
    view.removeEventListener('orientationchange', schedule);
    viewport?.removeEventListener?.('resize', schedule);
    viewport?.removeEventListener?.('scroll', schedule);
    if (frame !== null) view.cancelAnimationFrame?.(frame);
  };
}
