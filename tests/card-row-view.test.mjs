import test from 'node:test';
import assert from 'node:assert/strict';
import {renderCardRow} from '../src/card-row-view.mjs';
import {cardMarkup} from '../src/shared.mjs';

function fixture() {
  let templates = 0;
  const doc = {createElement(tag) {
    assert.equal(tag, 'template');
    templates++;
    return {content:{}, set innerHTML(markup) { this.content.firstElementChild = parse(markup); }};
  }};
  function node() {
    const n = {ownerDocument:doc, parentElement:null, className:'', attributes:{}, childNodes:[],
      dataset:{}, style:{visibility:'', transform:'rotate(-2deg)', translate:'', rotate:'', scale:''},
      get children() { return this.childNodes.filter(child => child.element); },
      get lastElementChild() { return this.children.at(-1); },
      setAttribute(name, value) { this.attributes[name] = value; },
      getAttribute(name) { return this.attributes[name] ?? null; },
      append(...children) { for (const child of children) { child.remove?.(); child.parentElement = this; this.childNodes.push(child); } },
      replaceChildren(...children) { for (const child of this.childNodes) child.parentElement = null; this.childNodes = []; this.append(...children); },
      remove() { if (this.parentElement) { const siblings = this.parentElement.childNodes; siblings.splice(siblings.indexOf(this),1); this.parentElement = null; } },
      element:true,
    };
    n.classList = {
      contains(value) { return n.className.split(/\s+/).includes(value); },
      toggle(value, enabled) { const classes = new Set(n.className.split(/\s+/).filter(Boolean)); if (enabled) classes.add(value); else classes.delete(value); n.className = [...classes].join(' '); },
    };
    return n;
  }
  function parse(markup) {
    const n = node();
    n.className = markup.match(/^<div class="([^"]*)"/)[1];
    n.setAttribute('aria-label', markup.match(/aria-label="([^"]*)"/)[1]);
    const src = markup.match(/<img src="([^"]*)"/);
    if (src) { const image = node(); image.src = src[1]; n.append(image); }
    else n.childNodes.push({text:'♠'});
    return n;
  }
  const row = node();
  return {row, get templates() { return templates; },
    reveal(index, card) { const target = row.children[index], face = parse(cardMarkup(card)); target.className = face.className; target.setAttribute('aria-label',face.getAttribute('aria-label')); target.replaceChildren(...face.childNodes); },
  };
}

test('unchanged public cards retain their elements, images and opponent highlights', () => {
  const f = fixture(), models = [{card:'As',back:false,best:true,visible:true},{card:'Kd',back:false,visible:true}];
  renderCardRow(f.row, models);
  const cards = [...f.row.children], images = cards.map(card => card.children[0]);
  cards[0].classList.toggle('npc-best',true);
  for (let i = 0; i < 5; i++) renderCardRow(f.row, models.map(model => ({...model})));
  assert.deepEqual(f.row.children,cards);
  assert.deepEqual(f.row.children.map(card => card.children[0]),images);
  assert.equal(cards[0].classList.contains('npc-best'),true);
  assert.equal(f.templates,2,'unchanged renders never parse replacement faces');
});

test('a face already swapped by the reveal animation is not recreated afterward', () => {
  const f = fixture();
  renderCardRow(f.row,[{back:true,visible:true},{back:true,visible:true}]);
  const card = f.row.children[0];
  card.style.rotate = 'y -28deg'; card.style.scale = '1 1'; card.style.translate = '0 -4px'; card.dataset.motion = 'turning';
  f.reveal(0,'Qh');
  const image = card.children[0], templates = f.templates;
  renderCardRow(f.row,[{card:'Qh',back:false,visible:true},{back:true,visible:true}]);
  assert.equal(f.row.children[0],card);
  assert.equal(card.children[0],image);
  assert.equal(f.templates,templates);
  assert.equal(card.style.rotate,'y -28deg');
  assert.equal(card.style.scale,'1 1');
  assert.equal(card.style.translate,'0 -4px');
  assert.equal(card.dataset.motion,'turning');
});

test('a genuine face change replaces only its content and keeps animation ownership', () => {
  const f = fixture();
  renderCardRow(f.row,[{card:'As',back:false,best:true,visible:true}]);
  const card = f.row.children[0], oldImage = card.children[0];
  card.classList.toggle('npc-best',true);card.dataset.motion='dealing';card.style.translate='30px 50px';
  renderCardRow(f.row,[{card:'Kh',back:false,best:false,visible:false}]);
  assert.equal(f.row.children[0],card);
  assert.notEqual(card.children[0],oldImage);
  assert.equal(card.getAttribute('aria-label'),'♥K');
  assert.equal(card.classList.contains('best'),false);
  assert.equal(card.classList.contains('npc-best'),false);
  assert.equal(card.dataset.motion,'dealing');
  assert.equal(card.style.translate,'30px 50px');
  assert.equal(card.style.transform,'rotate(-2deg)');
  assert.equal(card.style.visibility,'hidden');
});

test('concealed models never read their card values or publish hidden metadata', () => {
  const f = fixture();
  const concealed = {back:true,visible:true};
  Object.defineProperty(concealed,'card',{get(){throw new Error('secret card read');}});
  renderCardRow(f.row,[concealed]);
  renderCardRow(f.row,[concealed]);
  const card = f.row.children[0];
  assert.equal(card.getAttribute('aria-label'),'Face-down card');
  assert.equal(card.children[0].src,'assets/cards/back-blue.png');
  assert.deepEqual(card.dataset,{});
  assert.equal(f.templates,1);
});

test('row length changes retain existing slots, and blank/back/public states stay distinct', () => {
  const f = fixture();
  renderCardRow(f.row,[{card:null,back:false},{card:null,back:false}]);
  const first = f.row.children[0], second = f.row.children[1];
  assert.equal(first.classList.contains('blank'),true);
  renderCardRow(f.row,Array.from({length:5},()=>({back:true,visible:false})));
  assert.equal(f.row.children.length,5);
  assert.equal(f.row.children[0],first);assert.equal(f.row.children[1],second);
  assert.equal(first.classList.contains('blank'),false);assert.equal(first.classList.contains('covered'),true);
  const removed = f.row.children.slice(2);
  renderCardRow(f.row,[{card:'2c',back:false,best:true,visible:true},{back:true,visible:true}]);
  assert.equal(f.row.children.length,2);
  assert.equal(first.getAttribute('aria-label'),'♣2');
  assert.equal(first.style.visibility,'');
  assert.equal(first.classList.contains('best'),true);
  renderCardRow(f.row,[{card:'2c',back:false},{back:true}]);
  assert.equal(first.classList.contains('best'),true,'unspecified best does not erase an external highlight');
  assert.ok(removed.every(card=>card.parentElement===null));
});
