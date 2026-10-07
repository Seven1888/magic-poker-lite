import {cardMarkup, cardText} from './shared.mjs?v=56';

/** Keep card/animation nodes stable; models contain only already-public faces. */
export function renderCardRow(element, models = []) {
  if (!element?.ownerDocument || !Array.isArray(models)) {
    throw new TypeError('renderCardRow needs a DOM row and public card models.');
  }
  const doc = element.ownerDocument;
  const makeFace = (card, back) => {
    const template = doc.createElement('template');
    template.innerHTML = cardMarkup(card, {back});
    return template.content.firstElementChild;
  };
  models.forEach((model, index) => {
    const back = Boolean(model.back);
    // Do not even read a concealed model's card value. A back has no identity.
    const card = back ? null : model.card || null;
    const blank = !back && !card;
    const label = back ? 'Face-down card' : blank ? 'Unrevealed community card' : cardText(card);
    let node = element.children[index];
    if (!node) {
      node = makeFace(card, back);
      element.append(node);
    } else if (node.classList.contains('covered') !== back
      || node.classList.contains('blank') !== blank
      || node.getAttribute('aria-label') !== label) {
      const face = makeFace(card, back);
      // A reveal may already have changed this face. Compare actual public DOM,
      // not a cached model, so its finished image is retained on the next render.
      node.className = face.className;
      node.setAttribute('aria-label', face.getAttribute('aria-label'));
      node.replaceChildren(...face.childNodes);
    }
    if (typeof model.best === 'boolean') node.classList.toggle('best', model.best);
    const visibility = model.visible === false ? 'hidden' : '';
    if (node.style.visibility !== visibility) node.style.visibility = visibility;
  });
  while (element.children.length > models.length) element.lastElementChild.remove();
  return element;
}
