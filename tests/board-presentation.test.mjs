import test from 'node:test';
import assert from 'node:assert/strict';
import {boardCardView, nextBoardReveal, tableDeckCounts} from '../src/board-presentation.mjs';

test('deck count follows landings, including five unrevealed board backs', () => {
  assert.deepEqual(tableDeckCounts(), {dealtCards: 0, deckRemaining: 52});
  assert.deepEqual(tableDeckCounts({player: 2, npc: 2}), {dealtCards: 4, deckRemaining: 48});
  for (let board = 0; board <= 5; board++) {
    assert.deepEqual(tableDeckCounts({player: 2, npc: 2, board}), {dealtCards: 4 + board, deckRemaining: 48 - board});
  }
  // Revealing, folding or settling cannot consume another physical card.
  for (const revealed of [0, 3, 4, 5]) {
    const views = Array.from({length: 5}, (_, index) => boardCardView(index, {cards: ['As', 'Kh', 'Qd', 'Jc', 'Ts'], dealt: 5, revealed}));
    assert.equal(views.filter(card => card.back).length, 5 - revealed);
    assert.equal(tableDeckCounts({player: 2, npc: 2, board: 5}).deckRemaining, 43);
  }
});

test('pending and face-down board positions never read an unseen card value', () => {
  const unreadable = new Proxy([], {get() { throw new Error('hidden card read'); }});
  assert.deepEqual(boardCardView(0, {cards: unreadable}), {card: null, back: true, visible: false});
  for (let index = 0; index < 5; index++) {
    assert.deepEqual(boardCardView(index, {cards: unreadable, dealt: 5}), {card: null, back: true, visible: true});
  }
  assert.deepEqual(boardCardView(0), {card: null, back: false, visible: true});
});

test('only the flipped prefix becomes face-up; a folded hand keeps the rest concealed', () => {
  const cards = new Proxy(['As', 'Kh', 'Qd'], {get(target, key) {
    if (Number(key) >= 3) throw new Error('unrevealed turn or river read');
    return target[key];
  }});
  const views = Array.from({length: 5}, (_, index) => boardCardView(index, {cards, dealt: 5, revealed: 3}));
  assert.deepEqual(views.map(card => card.card), ['As', 'Kh', 'Qd', null, null]);
  assert.deepEqual(views.map(card => card.back), [false, false, false, true, true]);
  assert.equal(nextBoardReveal(3, 3), null);
});

test('all-in reveal remains flop, turn, river and can resume a partial flop', () => {
  let shown = 0;
  const batches = [];
  while (shown < 5) {
    const batch = nextBoardReveal(shown, 5);
    batches.push(batch); shown = batch.end;
  }
  assert.deepEqual(batches, [{start: 0, end: 3, street: 'flop'}, {start: 3, end: 4, street: 'turn'}, {start: 4, end: 5, street: 'river'}]);
  assert.deepEqual(nextBoardReveal(1, 5), {start: 1, end: 3, street: 'flop'});
  assert.equal(nextBoardReveal(0, 0), null);
  assert.equal(nextBoardReveal(5, 5), null);
});
