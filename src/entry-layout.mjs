/** Keep the original balance dock visible while the entry dialog is open.
 * Moving this same node outside the scaled stage makes CSS fixed positioning
 * relative to the viewport. No amounts, identifiers or game state are changed.
 */
const activeLayouts = new WeakMap();

export function setupEntryLayout(root = globalThis.document) {
  const doc = root?.ownerDocument || root;
  const dialog = root?.querySelector?.('#buyin-dialog');
  if (dialog && activeLayouts.has(dialog)) return activeLayouts.get(dialog);
  const dock = root?.querySelector?.('.asset-dock') || doc?.querySelector?.('.asset-dock');
  if (!dialog || !dock || !doc?.body || !doc.documentElement) return () => {};
  const MutationObserverClass = doc.defaultView?.MutationObserver || globalThis.MutationObserver;
  let placeholder = null, originalParent = null, originalNext = null, disposed = false;

  function restore() {
    if (placeholder) {
      if (placeholder.parentNode) placeholder.parentNode.replaceChild(dock, placeholder);
      else if (originalParent) originalParent.insertBefore(dock, originalNext?.parentNode === originalParent ? originalNext : null);
      placeholder = null;
    }
    delete doc.documentElement.dataset.entryOpen;
  }

  function sync() {
    if (disposed) return;
    if (!dialog.open) { restore(); return; }
    if (!placeholder) {
      originalParent = dock.parentNode;
      originalNext = dock.nextSibling;
      if (!originalParent) return;
      placeholder = doc.createComment('original balance dock position');
      originalParent.insertBefore(placeholder, dock);
      doc.body.append(dock);
    }
    doc.documentElement.dataset.entryOpen = 'true';
  }

  const observer = MutationObserverClass ? new MutationObserverClass(sync) : null;
  observer?.observe(dialog, {attributes: true, attributeFilter: ['open']});
  dialog.addEventListener('toggle', sync);
  dialog.addEventListener('close', sync);
  function cleanup() {
    if (disposed) return;
    disposed = true;
    observer?.disconnect();
    dialog.removeEventListener('toggle', sync);
    dialog.removeEventListener('close', sync);
    restore();
    activeLayouts.delete(dialog);
  }
  activeLayouts.set(dialog, cleanup);
  sync();
  return cleanup;
}
