import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession, startHand, legalActions, applyAction, previewResponse, cloneHand, getActionDistribution} from '../src/engine.mjs';
import {snapshotTableSession} from '../src/table-wallet.mjs';
import {actionResponsePreview, actionResponseMarkup, raiseMenuChoices, raiseSizeLabel} from '../src/action-options-view.mjs';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);
const create = (profileId = 'maniac', {mode = 'fixed-holdem', seed = 42, chips, outcome = {}} = {}) => {
  const session = createSession({smallBlind: 5, outcome: {mode, ...outcome}, boss: {mode: 'fixed', profileId},
    ...(mode === 'fixed-holdem' ? {deal: {player: {manual: ['2s', '7d']}, npc: {manual: ['As', 'Ah']}}} : {})
  }, seed, {firstSmallBlind: 'player'});
  if (chips !== undefined) session.stacks = {player: chips, npc: chips};
  return startHand(session);
};
const raises = hand => legalActions(hand).filter(action => ['bet', 'raise'].includes(action.type));
const choose = (hand, type, size) => {
  const action = legalActions(hand).find(item => item.type === type && (!size || item.sizeKeys?.includes(size)));
  assert.ok(action, `missing ${type}:${size}`); return action;
};
const grouped = distribution => distribution.reduce((result, action) => {
  if (action.probability > 0) result[action.type] = (result[action.type] || 0) + action.probability;
  return result;
}, {});

test('raise menu presents all-in, full pot, half pot from top to bottom without mutating actions or their identity', () => {
  const hand = create(), actions = raises(hand), before = structuredClone(actions);
  for (const action of actions) { Object.freeze(action.sizeKeys); Object.freeze(action); }
  Object.freeze(actions);
  const menu = raiseMenuChoices(actions);
  assert.notEqual(menu, actions);
  assert.deepEqual(menu.map(action => action.id), ['raise:allin', 'raise:pot', 'raise:half']);
  assert.deepEqual(menu.map(raiseSizeLabel), ['ALL IN', '1× POT', '0.5× POT']);
  assert.deepEqual(actions, before);
  for (const action of menu) assert.equal(action, actions.find(original => original.id === action.id));
});

test('stack-capped legal sizes stay merged once and retain the engine-selected action ID', () => {
  for (const [chips, ids, labels] of [
    [20, ['raise:half'], ['ALL IN']],
    [25, ['raise:pot', 'raise:half'], ['ALL IN', '0.5× POT']]
  ]) {
    const hand = create('maniac', {chips}), actions = raises(hand), before = structuredClone(actions);
    const menu = raiseMenuChoices(actions);
    assert.deepEqual(menu.map(action => action.id), ids);
    assert.deepEqual(menu.map(raiseSizeLabel), labels);
    assert.equal(new Set(menu.map(action => action.amount)).size, menu.length);
    assert.equal(menu.length, actions.length);
    assert.deepEqual(actions, before);
    const draft = cloneHand(hand);
    applyAction(draft, menu[0]);
    assert.equal(draft.stacks.player, 0);
    assert.equal(draft.history.at(-1).id, ids[0]);
  }
});

test('every selected size reports the same legal grouped response as the engine and its applied clone', () => {
  for (const mode of ['fixed-holdem', 'pooled-holdem']) for (const profileId of ['maniac', 'caller']) {
    const hand = create(profileId, {mode, seed: 0});
    for (const action of raises(hand)) {
      const preview = actionResponsePreview(hand, action), expected = previewResponse(hand, action);
      const draft = cloneHand(hand); applyAction(draft, action);
      assert.equal(draft.actor, 'npc');
      const probabilities = Object.fromEntries(preview.outcomes.map(row => [row.type, row.probability]));
      assert.deepEqual(probabilities, grouped(expected.distribution));
      assert.deepEqual(probabilities, grouped(getActionDistribution(draft)));
      near(preview.outcomes.reduce((total, row) => total + row.probability, 0), 1);
      assert.equal(preview.note, '');
      for (const row of preview.outcomes) assert.equal(row.label, `${Number((row.probability * 100).toFixed(2))}%`);
    }
  }
});

test('each size shows its actual pressure response, with no raise against a large all-in', () => {
  for (const [profileId, rows] of [['maniac', [[5,25,70],[10,40,50],[20,80,0]]], ['caller', [[5,65,30],[10,70,20],[15,85,0]]]]) {
    const hand = create(profileId);
    assert.equal(hand.bossStreetStrength.band, 'strong');
    for (const [index,size] of ['half', 'pot'].entries()) {
      const preview = actionResponsePreview(hand, choose(hand, 'raise', size));
      const actual = Object.fromEntries(preview.outcomes.map(row => [row.type, row.probability]));
      near(actual.fold, rows[index][0]/100); near(actual.call, rows[index][1]/100); near(actual.raise, rows[index][2]/100);
    }
    const allIn = actionResponsePreview(hand, choose(hand, 'raise', 'allin'));
    const actual = Object.fromEntries(allIn.outcomes.map(row => [row.type, row.probability]));
    assert.deepEqual(Object.keys(actual).sort(), ['call', 'fold']);
    near(actual.fold, rows[2][0]/100);
    near(actual.call, rows[2][1]/100);
    const markup = actionResponseMarkup(allIn, {compact: true});
    assert.match(markup, /data-response="call"><span>CALL<\/span>/);
    assert.doesNotMatch(markup, /data-response="raise"/);
  }
});

test('previews cannot commit paid result draws, changed NPC cards, pools, RNG or live session state', () => {
  const hand = create('maniac', {mode: 'pooled-holdem', seed: 0,
    outcome: {conversionRate: 0, initialPaidActionPools: [1000, 0, 0]}});
  assert.equal(hand.outcomeDecision.target, 'nonWin');
  const session = hand.session, before = snapshotTableSession(session);
  const references = {rng: hand.rng, pools: session.outcomePools, stacks: session.stacks, holes: hand.holes, controller: hand.pooledHoldem};
  const draft = cloneHand(hand);
  applyAction(draft, choose(draft, 'raise', 'half'));
  assert.equal(draft.outcomeDecision.target, 'win');
  assert.notDeepEqual(draft.holes.npc, hand.holes.npc, 'the fixture must exercise a real private-pair conversion');
  for (let repeat = 0; repeat < 3; repeat++) {
    for (const action of legalActions(hand)) actionResponsePreview(hand, action);
  }
  assert.deepEqual(snapshotTableSession(session), before);
  assert.equal(hand.rng, references.rng);
  assert.equal(session.outcomePools, references.pools);
  assert.equal(session.stacks, references.stacks);
  assert.equal(hand.holes, references.holes);
  assert.equal(hand.pooledHoldem, references.controller);
  assert.equal(session.activeHand, hand);
});

test('a street-closing CHECK says DEAL TURN without exposing the next street NPC distribution', () => {
  const hand = create();
  applyAction(hand, 'call'); applyAction(hand, 'check');
  assert.equal(hand.street, 'flop'); assert.equal(hand.actor, 'npc');
  applyAction(hand, 'check');
  assert.equal(hand.actor, 'player');
  const check = choose(hand, 'check'), before = snapshotTableSession(hand.session);
  const draft = cloneHand(hand); applyAction(draft, check);
  assert.equal(draft.street, 'turn'); assert.equal(draft.actor, 'npc');
  assert.ok(getActionDistribution(draft).some(row => row.probability > 0));
  const preview = actionResponsePreview(hand, check);
  assert.deepEqual(preview, {outcomes: [], note: 'DEAL TURN'});
  const markup = actionResponseMarkup(preview);
  assert.match(markup, /Next phase: DEAL TURN/);
  assert.doesNotMatch(markup, />BOSS<|Opponent response/);
  assert.doesNotMatch(markup, /data-response=|%/);
  assert.deepEqual(snapshotTableSession(hand.session), before);
});

test('a closing CALL or CHECK names the exact next street instead of a BOSS response', () => {
  const hand = startHand(createSession({smallBlind: 5, outcome: {mode:'fixed-holdem'}}, 42, {firstSmallBlind:'npc'}));
  applyAction(hand, 'call');
  for (const [street, label] of [['preflop','DEAL FLOP'], ['flop','DEAL TURN'], ['turn','DEAL RIVER']]) {
    assert.equal(hand.street, street);
    if (street !== 'preflop') {
      applyAction(hand, choose(hand, 'bet', 'half'));
      // Keep the next closing action on the player's seat to exercise CALL.
      applyAction(hand, choose(hand, 'raise', 'half'));
    }
    assert.equal(hand.actor, 'player');
    const action = choose(hand, street === 'preflop' ? 'check' : 'call');
    const before = snapshotTableSession(hand.session);
    const preview = actionResponsePreview(hand, action);
    assert.deepEqual(preview, {outcomes:[], note:label});
    assert.match(actionResponseMarkup(preview), new RegExp(`Next phase: ${label}`));
    assert.doesNotMatch(actionResponseMarkup(preview), />BOSS<|Opponent response|data-response=/);
    assert.deepEqual(snapshotTableSession(hand.session), before);
    applyAction(hand, action);
  }
});

test('the final river CHECK says SHOWDOWN and does not settle the real hand', () => {
  const hand = create();
  let steps = 0;
  while (hand.street !== 'river' || hand.actor !== 'player') {
    assert.ok(++steps < 15);
    applyAction(hand, legalActions(hand).find(action => ['call', 'check'].includes(action.type)));
  }
  const before = snapshotTableSession(hand.session);
  const preview = actionResponsePreview(hand, choose(hand, 'check'));
  assert.deepEqual(preview, {outcomes: [], note: 'SHOWDOWN'});
  assert.match(actionResponseMarkup(preview), /SHOWDOWN/);
  assert.equal(hand.status, 'playing');
  assert.deepEqual(snapshotTableSession(hand.session), before);
});

test('fold, missing state, NPC turns and settled hands do not advertise a new opponent response', () => {
  const hand = create();
  assert.equal(actionResponsePreview(null, {type: 'call'}), null);
  assert.equal(actionResponsePreview(hand, null), null);
  assert.equal(actionResponsePreview(hand, choose(hand, 'fold')), null);
  applyAction(hand, 'call');
  assert.equal(actionResponsePreview(hand, legalActions(hand)[0]), null);
  applyAction(hand, 'check'); applyAction(hand, 'check');
  applyAction(hand, choose(hand, 'bet', 'allin')); applyAction(hand, 'call');
  assert.equal(hand.status, 'settled');
  assert.equal(actionResponsePreview(hand, {type: 'call'}), null);
  assert.equal(actionResponseMarkup(null), '');
});

test('response markup spells CALL in full and safely escapes attributes, outcome text and notes', () => {
  const normal = actionResponseMarkup({outcomes: [{type: 'call', probability: 1, label: '100%'}], note: ''}, {compact: true});
  assert.match(normal, /class="button-response size-response"/);
  assert.match(normal, /Opponent response: CALL 100%/);
  assert.match(normal, /<span>CALL<\/span><b>100%<\/b>/);
  const unsafe = actionResponseMarkup({outcomes: [{type: 'call"><img src=x>', label: '<svg onload="bad()">&\''}], note: ''});
  assert.doesNotMatch(unsafe, /<img\b|<svg\b/i);
  assert.match(unsafe, /&lt;IMG SRC=X&gt;/);
  assert.match(unsafe, /&lt;svg onload=&quot;bad\(\)&quot;&gt;&amp;&#39;/);
  const note = actionResponseMarkup({outcomes: [], note: '<script>bad()</script>&"\''});
  assert.doesNotMatch(note, /<script\b/i);
  assert.match(note, /&lt;script&gt;bad\(\)&lt;\/script&gt;&amp;&quot;&#39;/);
});
