import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSession, startHand, legalActions, applyAction,
  previewResponse, getActionDistribution
} from '../src/engine.mjs';

const types = hand => legalActions(hand).map(action => action.type);
const actionEvents = hand => hand.history.filter(event => ['call', 'check', 'bet', 'raise', 'fold'].includes(event.type));
const createHand = smallBlind => startHand(createSession({jackpotEnabled: false}, 20260930, {firstSmallBlind: smallBlind}));

function checkedPreview(hand) {
  const snapshot = JSON.stringify(hand), rng = hand.rng.state();
  const preview = previewResponse(hand, 'check');
  assert.equal(JSON.stringify(hand), snapshot, 'Preview must not advance the live street or post chips.');
  assert.equal(hand.rng.state(), rng, 'Preview must not draw an NPC action.');
  return preview;
}

test('free first-position postflop check allows an opponent bet on the same street, then requires a paid call', () => {
  const hand = createHand('npc'); // Player posts the sole big blind and acts first after the flop.
  applyAction(hand, 'call'); // NPC completes the opening bet.
  assert.equal(hand.actor, 'player');
  const opening = checkedPreview(hand);
  assert.equal(opening.street, 'flop');
  assert.equal(opening.actor, 'player');
  assert.deepEqual(opening.distribution, []);
  applyAction(hand, 'check');
  assert.equal(hand.street, 'flop');
  assert.equal(hand.actor, 'player');

  const preview = checkedPreview(hand), contributions = {...hand.contributions}, stacks = {...hand.stacks};
  assert.equal(preview.street, 'flop');
  assert.equal(preview.actor, 'npc');
  assert.deepEqual(preview.distribution.map(outcome => outcome.type), ['check', 'bet']);
  assert.ok(preview.distribution.every(outcome => outcome.probability > 0));
  applyAction(hand, 'check');
  assert.equal(hand.street, 'flop');
  assert.equal(hand.board.length, 3);
  assert.equal(hand.actor, 'npc');
  assert.deepEqual(hand.pending, ['npc']);
  assert.deepEqual(hand.contributions, contributions);
  assert.deepEqual(hand.stacks, stacks);
  assert.deepEqual(getActionDistribution(hand), preview.distribution);

  applyAction(hand, 'bet');
  assert.equal(hand.street, 'flop');
  assert.equal(hand.actor, 'player');
  assert.deepEqual(types(hand), ['fold', 'call', 'raise']);
  assert.equal(legalActions(hand).find(action => action.type === 'call').amount, 20);
  assert.throws(() => applyAction(hand, 'check'), /不能/);
  assert.deepEqual(actionEvents(hand).slice(-2).map(event => [event.actor, event.type, event.street]), [
    ['player', 'check', 'flop'], ['npc', 'bet', 'flop']
  ]);
});

test('free second-position check closes its street; opponent action after dealing belongs to the next street', () => {
  const hand = createHand('player');
  applyAction(hand, 'call');
  applyAction(hand, 'check'); // NPC preflop option closes preflop; NPC now opens flop.
  assert.equal(hand.actor, 'npc');
  assert.equal(hand.street, 'flop');
  applyAction(hand, 'check');
  assert.equal(hand.actor, 'player');
  assert.deepEqual(hand.pending, ['player']);
  const before = {...hand.contributions}, stacks = {...hand.stacks};
  const preview = checkedPreview(hand);
  assert.deepEqual(preview.distribution, [], 'A new-street NPC action is not a same-street CHECK response.');
  assert.equal(preview.street, 'turn');
  assert.equal(preview.actor, 'npc');
  applyAction(hand, 'check');
  assert.equal(hand.street, 'turn');
  assert.equal(hand.board.length, 4);
  assert.equal(hand.actor, 'npc');
  assert.deepEqual(hand.pending, ['npc', 'player']);
  assert.deepEqual(hand.contributions, before);
  assert.deepEqual(hand.stacks, stacks);
  assert.equal(hand.history.at(-1).type, 'reveal');
  assert.equal(hand.history.at(-1).street, 'turn');

  applyAction(hand, 'bet');
  assert.equal(hand.history.at(-1).actor, 'npc');
  assert.equal(hand.history.at(-1).street, 'turn');
  assert.equal(hand.history.at(-1).amount, 40);
  assert.equal(legalActions(hand).find(action => action.type === 'call').amount, 40);
  assert.equal(actionEvents(hand).filter(event => event.actor === 'npc' && event.street === 'flop').length, 1);
});

test('opponent check after the player first-position check ends the street without a second same-street decision', () => {
  const hand = createHand('npc');
  applyAction(hand, 'call');
  applyAction(hand, 'check');
  applyAction(hand, 'check'); // Player opens flop with CHECK FREE.
  assert.equal(hand.actor, 'npc');
  applyAction(hand, 'check');
  assert.equal(hand.street, 'turn');
  assert.equal(hand.actor, 'player');
  assert.deepEqual(hand.pending, ['player', 'npc']);
  assert.deepEqual(actionEvents(hand).filter(event => event.street === 'flop').map(event => [event.actor, event.type]), [
    ['player', 'check'], ['npc', 'check']
  ]);
  assert.equal(hand.pot, 20);
});

test('a final river check goes directly to showdown and cannot offer or execute another opponent action', () => {
  for (const smallBlind of ['player', 'npc']) {
    const hand = createHand(smallBlind);
    applyAction(hand, 'call');
    applyAction(hand, 'check');
    while (hand.street !== 'river') {
      applyAction(hand, 'check');
      applyAction(hand, 'check');
    }
    applyAction(hand, 'check');
    if (hand.actor === 'player') {
      const preview = checkedPreview(hand);
      assert.deepEqual(preview.distribution, []);
      assert.equal(preview.status, 'settled');
      assert.equal(preview.actor, null);
    }
    const rng = hand.rng.state();
    applyAction(hand, 'check');
    assert.equal(hand.status, 'settled');
    assert.equal(hand.result.reason, 'showdown');
    assert.equal(hand.actor, null);
    assert.deepEqual(hand.pending, []);
    assert.deepEqual(getActionDistribution(hand), []);
    assert.deepEqual(legalActions(hand), []);
    assert.equal(hand.rng.state(), rng);
    assert.equal(actionEvents(hand).filter(event => event.street === 'river').length, 2);
    assert.throws(() => applyAction(hand, 'check'), /不能/);
  }
});
