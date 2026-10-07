import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_CONFIG, normalizeConfig, makeDeck, createSession as createEngineSession, startHand, cloneHand, applyAction} from './legacy-engine.mjs';

// These fixtures specify the historical deal RNG and reroll acceptance rules.
const createSession = (config = {}, seed, options) => createEngineSession(
  {...config, outcome: {mode: 'legacy-deck', ...config.outcome}}, seed, options);

const bossManual = ['As', 'Ah'];
const available = makeDeck().filter(card => !bossManual.includes(card));

// Choose points inside the uniform ranges for a known candidate, leaving all
// later shuffle draws fixed. These fixtures test exact acceptance/RNG boundaries.
function candidateDraws(cards, pool = available) {
  const first = pool.indexOf(cards[0]), second = pool.indexOf(cards[1]);
  assert.ok(first >= 0 && second >= 0 && first !== second);
  return [(first + 0.25) / pool.length, (second - (second > first ? 1 : 0) + 0.25) / (pool.length - 1)];
}

function scriptedHand(draws, player = {}, extra = {}) {
  let calls = 0;
  const session = createSession({boss: {mode: 'legacy'}, ...extra, deal: {player, npc: {manual: bossManual}}}, 1);
  session.rng = () => calls < draws.length ? draws[calls++] : (++calls, 0.731);
  const hand = startHand(session);
  return {hand, calls};
}

test('new deal defaults use independent Boss-style unpaired redraw rates and 50 additional candidates', () => {
  const config = normalizeConfig();
  for (const seat of ['player', 'npc']) {
    assert.deepEqual(config.deal[seat], DEFAULT_CONFIG.deal[seat]);
    assert.equal(config.deal[seat].rerollMode, 'unpaired');
    assert.equal(config.deal[seat].maxRerolls, 50);
    assert.equal(Object.hasOwn(config.deal[seat], 'targetScore'), false);
  }
  assert.equal(config.deal.player.rerollChance, 0.5);
  assert.equal(config.deal.npc.rerollChance, 0.25);
  assert.deepEqual(normalizeConfig(config), config);
});

test('legacy score imports have an explicit mode; selecting unpaired removes score semantics', () => {
  const imported = normalizeConfig({deal: {player: {targetScore: 0.8}}});
  assert.deepEqual(imported.deal.player, {rerollMode: 'legacy-score', rerollChance: 0.75,
    maxRerolls: 2, targetScore: 0.8, manual: []});
  assert.equal(imported.deal.npc.rerollMode, 'unpaired');
  assert.deepEqual(normalizeConfig(imported), imported);
  const migrated = normalizeConfig({deal: {player: {...imported.deal.player, rerollMode: 'unpaired'}}});
  assert.equal(Object.hasOwn(migrated.deal.player, 'targetScore'), false);
  assert.equal(migrated.deal.player.rerollMode, 'unpaired');
  assert.throws(() => normalizeConfig({deal: {player: {rerollMode: 'score'}}}), /起手重抽模式/);
  assert.equal(normalizeConfig({deal: {npc: {maxRerolls: 999}}}).deal.npc.maxRerolls, 50);
  assert.equal(normalizeConfig({deal: {npc: {maxRerolls: -1}}}).deal.npc.maxRerolls, 0);
});

test('an initial pair is accepted without consuming a probability draw, regardless of its score', () => {
  const {hand, calls} = scriptedHand(candidateDraws(['2s', '2h']), {rerollChance: 1, targetScore: 1, rerollMode: 'unpaired'});
  assert.deepEqual(hand.holes.player, ['2s', '2h']);
  assert.equal(calls, 2 + 47);
  assert.equal(hand.dealAudit.player.initialClass, 'pair');
  assert.equal(hand.dealAudit.player.finalClass, 'pair');
  assert.equal(hand.dealAudit.player.attempts, 1);
  assert.equal(hand.dealAudit.player.rerolls, 0);
  assert.equal(hand.dealAudit.player.stopReason, 'pair');
});

test('unpaired candidates return completely to the pool and a new pair stops further attempts', () => {
  const draws = [...candidateDraws(['2s', '7c']), 0.49, ...candidateDraws(['2s', '2h'])];
  const {hand, calls} = scriptedHand(draws);
  assert.deepEqual(hand.holes.player, ['2s', '2h']);
  assert.ok(hand.deck.includes('7c'));
  assert.equal(calls, draws.length + 47);
  assert.equal(hand.dealAudit.player.initialClass, 'unpaired');
  assert.equal(hand.dealAudit.player.finalClass, 'pair');
  assert.equal(hand.dealAudit.player.attempts, 2);
  assert.equal(hand.dealAudit.player.rerolls, 1);
  assert.equal(hand.dealAudit.player.stopReason, 'pair');
  assert.equal(new Set([...hand.holes.player, ...hand.holes.npc, ...hand.deck]).size, 52);
});

test('a failed probability draw accepts the current unpaired candidate including an exact boundary', () => {
  for (const roll of [0.5, 0.99]) {
    const {hand, calls} = scriptedHand([...candidateDraws(['Ks', 'Qs']), roll]);
    assert.deepEqual(hand.holes.player, ['Ks', 'Qs']);
    assert.equal(hand.dealAudit.player.stopReason, 'probability');
    assert.equal(hand.dealAudit.player.rerolls, 0);
    assert.equal(calls, 3 + 47);
  }
});

test('the last candidate is retained even if worse, with no gate draw after the additional limit', () => {
  const draws = [...candidateDraws(['Ks', 'Qs']), 0.1, ...candidateDraws(['2s', '7c'])];
  const {hand, calls} = scriptedHand(draws, {maxRerolls: 1});
  assert.deepEqual(hand.holes.player, ['2s', '7c']);
  assert.ok(hand.dealAudit.player.finalScore < hand.dealAudit.player.initialScore);
  assert.equal(hand.dealAudit.player.stopReason, 'limit');
  assert.equal(hand.dealAudit.player.rerolls, 1);
  assert.equal(calls, draws.length + 47);
});

test('zero limit skips the gate; zero chance still consumes the eligible probability draw', () => {
  const zeroLimit = scriptedHand(candidateDraws(['2s', '7c']), {maxRerolls: 0, rerollChance: 1});
  assert.equal(zeroLimit.calls, 2 + 47);
  assert.equal(zeroLimit.hand.dealAudit.player.stopReason, 'limit');
  const zeroChance = scriptedHand([...candidateDraws(['2s', '7c']), 0], {rerollChance: 0});
  assert.equal(zeroChance.calls, 3 + 47);
  assert.equal(zeroChance.hand.dealAudit.player.stopReason, 'probability');
  assert.equal(zeroChance.hand.dealAudit.player.rerolls, 0);
});

test('100 percent with a 50 redraw limit permits exactly 51 unpaired candidates', () => {
  const draws = [...candidateDraws(['2s', '7c'])];
  for (let index = 0; index < 50; index++) draws.push(0.99, ...candidateDraws(['2s', '7c']));
  const {hand, calls} = scriptedHand(draws, {rerollChance: 1});
  assert.equal(hand.dealAudit.player.attempts, 51);
  assert.equal(hand.dealAudit.player.rerolls, 50);
  assert.equal(hand.dealAudit.player.stopReason, 'limit');
  assert.equal(calls, 2 * 51 + 50 + 47);
  assert.equal(hand.deck.length, 48);
  assert.equal(new Set([...hand.holes.player, ...hand.holes.npc, ...hand.deck]).size, 52);
});

test('manual cards are reserved across both seats and bypass all candidate and gate draws', () => {
  const {hand, calls} = scriptedHand([], {manual: ['2s', '7c'], rerollChance: 1});
  assert.deepEqual(hand.holes, {player: ['2s', '7c'], npc: bossManual});
  assert.equal(calls, 47);
  for (const seat of ['player', 'npc']) {
    assert.equal(hand.dealAudit[seat].attempts, 0);
    assert.equal(hand.dealAudit[seat].rerolls, 0);
    assert.equal(hand.dealAudit[seat].stopReason, 'manual');
    assert.equal(hand.dealAudit[seat].manual, true);
  }
  assert.equal(new Set([...hand.holes.player, ...hand.holes.npc, ...hand.deck]).size, 52);
});

test('player and NPC rates act independently and both seats use the same unpaired condition', () => {
  for (const firstSeat of ['player', 'npc']) {
    const secondSeat = firstSeat === 'player' ? 'npc' : 'player';
    const firstCards = ['2s', '7c'];
    const remaining = makeDeck().filter(card => !firstCards.includes(card));
    const draws = [...candidateDraws(firstCards, makeDeck()), 0.5,
      ...candidateDraws(['Ks', 'Qs'], remaining), 0.5,
      ...candidateDraws(['3s', '3h'], remaining)];
    const session = createSession({boss: {mode: 'legacy'}, deal: {[firstSeat]: {rerollChance: 0}, [secondSeat]: {rerollChance: 1}}}, 1,
      {firstSmallBlind: firstSeat});
    let calls = 0;
    session.rng = () => calls < draws.length ? draws[calls++] : (++calls, 0.731);
    const hand = startHand(session);
    assert.equal(hand.dealAudit[firstSeat].rerolls, 0);
    assert.equal(hand.dealAudit[secondSeat].rerolls, 1);
    assert.deepEqual(hand.holes[firstSeat], firstCards);
    assert.deepEqual(hand.holes[secondSeat], ['3s', '3h']);
    assert.equal(calls, draws.length + 47);
    assert.equal(new Set([...hand.holes.player, ...hand.holes.npc, ...hand.deck]).size, 52);
  }
});

test('deal and audit are repeatable and independent of payout, betting, jackpot, and NPC policy settings', () => {
  for (const seed of [0, 20, 72, 123, 'boss-style']) {
    const one = startHand(createSession({}, seed));
    const two = startHand(createSession({targetRtp: 1, jackpotEnabled: false, npc: {fold: 1, call: 0, raise: 0},
      betSize: {preflop: 30, flop: 30, turn: 50, river: 100}}, seed));
    assert.deepEqual(one.holes, two.holes);
    assert.deepEqual(one.deck, two.deck);
    assert.deepEqual(one.dealAudit, two.dealAudit);
    assert.equal(one.rng.state(), two.rng.state());
  }
});

test('the exported hand clone supports independent action branches without changing the source state or RNG', () => {
  const original = startHand(createSession({}, 41));
  const snapshot = JSON.stringify(original), rngState = original.rng.state();
  const branch = cloneHand(original);
  applyAction(branch, 'fold');
  assert.equal(branch.status, 'settled');
  assert.equal(original.status, 'playing');
  assert.equal(JSON.stringify(original), snapshot);
  assert.equal(original.rng.state(), rngState);
});
