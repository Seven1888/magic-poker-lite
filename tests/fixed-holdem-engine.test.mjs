import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession, normalizeConfig, startHand, legalActions, applyAction, cloneHand,
  getActionDistribution, sampleDistribution, createRng, playAutomatedHand, syncOpponentBankroll} from '../src/engine.mjs';
import {handEntryStatus} from '../src/hand-entry.mjs';
import {legalHoldemActions} from '../src/holdem-betting.mjs';

const config = extra => ({...extra, outcome: {mode: 'fixed-holdem'}, boss: {mode: 'fixed', profileId: 'maniac'}});
const handWith = (extra = {}, seed = 1, firstSmallBlind = 'player') => startHand(createSession(config(extra), seed, {firstSmallBlind}));
const take = (hand, type, sizeKey) => {
  const chosen = legalActions(hand).find(item => item.type === type && (!sizeKey || item.sizeKeys?.includes(sizeKey)));
  assert.ok(chosen, `missing ${type}:${sizeKey}`);
  applyAction(hand, chosen);
};
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

test('fixed Holdem derives 2:1 blinds and a 100 SB first buy-in, with full pot settlement', () => {
  const settings = normalizeConfig(config({smallBlind: 7, targetRtp: .96, jackpotEnabled: true}));
  assert.equal(settings.smallBlind, 7); assert.equal(settings.bigBlind, 14);
  assert.equal(settings.buyIn, 700); assert.equal(settings.minBuyIn, 700);
  assert.equal(settings.maxRaises, null); assert.equal(settings.targetRtp, 1);
  assert.equal(settings.jackpotEnabled, false);
});

test('opening quotes use C + x(P+C), unique ids, and the entire stack for all-in', () => {
  const hand = handWith();
  assert.equal(hand.board.length, 0); assert.equal(hand.pot, 15);
  assert.deepEqual(legalActions(hand).map(({id, amount, to}) => [id, amount, to]), [
    ['fold', 0, 0], ['call', 5, 10], ['raise:half', 15, 20], ['raise:pot', 25, 30], ['raise:allin', 495, 500]
  ]);
  applyAction(hand, 'raise:pot');
  assert.equal(hand.currentBet, 30); assert.equal(hand.pot, 40);
  assert.equal(hand.lastFullRaise, 20);
  assert.deepEqual(legalActions(hand).filter(item => item.sizeKeys).map(({amount, to}) => [amount, to]), [[50, 60], [80, 90], [490, 500]]);
});

test('both seats may repeatedly reraise and a call closes the street', () => {
  const hand = handWith();
  const hole = structuredClone(hand.holes), deck = [...hand.deck];
  for (let index = 0; index < 4; index++) take(hand, 'raise', 'half');
  assert.equal(hand.raises, 4); assert.equal(hand.street, 'preflop');
  assert.equal(hand.currentBet, 160);
  take(hand, 'call');
  assert.equal(hand.street, 'flop'); assert.equal(hand.actor, 'npc');
  assert.deepEqual(hand.board, deck.slice(0, 3)); assert.deepEqual(hand.holes, hole);
  assert.equal(hand.lastFullRaise, hand.config.bigBlind);
});

test('SB completion preserves the BB check option, then streets reveal 3, 1, 1 cards', () => {
  for (const smallBlind of ['player', 'npc']) {
    const hand = handWith({}, 9, smallBlind), bigBlind = smallBlind === 'player' ? 'npc' : 'player';
    take(hand, 'call');
    assert.equal(hand.actor, bigBlind); assert.equal(hand.street, 'preflop');
    assert.equal(legalActions(hand)[0].type, 'check');
    take(hand, 'check');
    assert.equal(hand.actor, bigBlind); assert.equal(hand.board.length, 3);
    for (const count of [4, 5]) {
      take(hand, 'check'); take(hand, 'check');
      assert.equal(hand.board.length, count); assert.equal(hand.actor, bigBlind);
    }
    take(hand, 'check'); take(hand, 'check');
    assert.equal(hand.result.reason, 'showdown');
  }
});

test('all-in call runs out the board; all-in fold refunds every unmatched chip', () => {
  for (const response of ['call', 'fold']) {
    const hand = handWith();
    take(hand, 'raise', 'allin');
    assert.deepEqual(legalActions(hand).map(item => item.type), ['fold', 'call']);
    take(hand, response);
    assert.equal(hand.status, 'settled');
    assert.equal(hand.board.length, response === 'call' ? 5 : 0);
    assert.equal(hand.result.player.refund, response === 'call' ? 0 : 490);
    assert.equal(hand.result.player.matchedWager, response === 'call' ? 500 : 10);
    assert.equal(hand.result.fee, 0); assert.equal(hand.result.jackpot, null);
    near(hand.stacks.player + hand.stacks.npc, 1000);
  }
});

test('short stack sizes merge without losing their configured size weights', () => {
  const hand = handWith({buyIn: 15});
  const raises = legalActions(hand).filter(item => item.type === 'raise');
  assert.equal(raises.length, 1); assert.equal(raises[0].to, 15);
  assert.deepEqual(raises[0].sizeKeys, ['half', 'pot', 'allin']);
  assert.equal(raises[0].fullRaise, false); assert.equal(raises[0].allIn, true);
  take(hand, 'raise', 'allin');
  assert.equal(hand.lastFullRaise, 10, 'short all-in does not replace the full raise size');
  assert.deepEqual(legalActions(hand).map(item => item.type), ['fold', 'call']);
  take(hand, 'call');
  assert.equal(hand.result.pot, 30);
});

test('minimum opening bet and reopening rights are enforced in the shared quote helper', () => {
  const hand = handWith();
  Object.assign(hand, {street: 'flop', pot: 10, currentBet: 0, streetBets: {player: 0, npc: 0}, lastFullRaise: 10});
  const sizes = legalHoldemActions(hand).filter(item => item.sizeKeys);
  assert.equal(sizes[0].amount, 10); assert.deepEqual(sizes[0].sizeKeys, ['half', 'pot']);
  Object.assign(hand, {currentBet: 25, lastFullRaise: 20, actedSinceFullRaise: ['player']});
  assert.deepEqual(legalHoldemActions(hand).map(item => item.type), ['fold', 'call']);
});

test('stale explicit quotes reject without changing money, cards, history or RNG', () => {
  const hand = handWith(), quote = legalActions(hand).find(item => item.id === 'raise:pot');
  const before = JSON.stringify(hand), state = hand.rng.state();
  assert.throws(() => applyAction(hand, {...quote, amount: quote.amount + 1}));
  assert.equal(JSON.stringify(hand), before); assert.equal(hand.rng.state(), state);
  applyAction(hand, 'raise');
  assert.equal(hand.currentBet, 20, 'type-only compatibility chooses half pot');
});

test('opponent buy-in happens at next hand start and settled stack snapshots stay intact', () => {
  const hand = handWith(), session = hand.session;
  take(hand, 'fold');
  assert.deepEqual(session.stacks, {player: 495, npc: 505});
  assert.equal(syncOpponentBankroll(session), null);
  assert.deepEqual(session.stacks, {player: 495, npc: 505});
  const settled = {...hand.stacks}, next = startHand(session);
  assert.deepEqual(next.stacksBefore, {player: 495, npc: 495});
  assert.deepEqual(hand.stacks, settled);
  assert.equal(session.opponentBankrollRefreshes.at(-1).adjustment, -10);
});

test('any positive table stack may post short blinds and finish, while zero rejects atomically', () => {
  for (const amount of [0.000001, 1, 5, 7]) {
    const session = createSession(config(), 18);
    session.stacks = {player: amount, npc: 0};
    assert.equal(handEntryStatus(session).canStart, true);
    const hand = startHand(session);
    while (hand.status === 'playing') take(hand, 'call');
    assert.equal(hand.result.pot, amount * 2);
    near(hand.stacks.player + hand.stacks.npc, amount * 2);
  }
  const session = createSession(config(), 18);
  session.stacks.player = 0;
  const before = JSON.stringify(session), state = session.rng.state();
  assert.throws(() => startHand(session), {code: 'INSUFFICIENT_HAND_ASSETS'});
  assert.equal(JSON.stringify(session), before); assert.equal(session.rng.state(), state);
});

test('fixed cards never reroll, and action quotation or cloning cannot consume RNG', () => {
  const hand = handWith({deal: {player: {rerollChance: 1, maxRerolls: 50}, npc: {rerollChance: 1, maxRerolls: 50}}});
  for (const seat of ['player', 'npc']) {
    assert.equal(hand.config.deal[seat].rerollChance, 0);
    assert.equal(hand.config.deal[seat].maxRerolls, 0);
    assert.equal(hand.dealAudit[seat].stopReason, 'natural-deal');
    assert.equal(hand.dealAudit[seat].attempts, 1);
  }
  assert.equal(hand.dealAudit.player.rerolls, 0); assert.equal(hand.dealAudit.npc.rerolls, 0);
  const state = hand.rng.state(), before = JSON.stringify(hand), copy = cloneHand(hand);
  legalActions(hand); getActionDistribution(hand, hand.actor, 'aggressive');
  assert.equal(hand.rng.state(), state); assert.equal(JSON.stringify(hand), before);
  copy.actedSinceFullRaise.push('player');
  assert.deepEqual(hand.actedSinceFullRaise, []);
  assert.deepEqual(copy.holes, hand.holes);
});

test('natural fixed-card defaults disable all candidate rerolls without disabling designated research hands', () => {
  const normalized = normalizeConfig(config());
  for (const seat of ['player', 'npc']) {
    assert.equal(normalized.deal[seat].rerollChance, 0);
    assert.equal(normalized.deal[seat].maxRerolls, 0);
  }
  const hand = handWith({deal: {player: {manual: ['As', 'Kh'], rerollChance: 1, maxRerolls: 50}}});
  assert.deepEqual(hand.holes.player, ['As', 'Kh']);
  assert.equal(hand.dealAudit.player.manual, true);
  assert.equal(hand.dealAudit.player.rerolls, 0);
  assert.equal(hand.dealAudit.player.attempts, 0);
  assert.equal(hand.dealAudit.npc.rerolls, 0);
});

test('first blind may be random and every later hand alternates the button', () => {
  const session = createSession(config(), 22, {firstSmallBlind: 'random'});
  let previous;
  for (let index = 0; index < 5; index++) {
    const hand = startHand(session);
    if (previous) assert.notEqual(hand.smallBlind, previous);
    previous = hand.smallBlind;
    take(hand, 'fold');
  }
});

test('a carried last opponent is validated and prevents a repeat on the first actual hand of a new table', () => {
  const settings = {outcome: {mode: 'fixed-holdem'}, boss: {mode: 'rotate'}};
  for (const lastBossProfileId of [null, 'caller', 'maniac']) {
    const session = createSession(settings, 22, {firstSmallBlind: 'random', lastBossProfileId});
    const baseline = createSession(settings, 22, {firstSmallBlind: 'random'});
    assert.equal(session.lastBossProfileId, lastBossProfileId);
    assert.equal(session.rng.state(), baseline.rng.state(), 'carrying identity uses no draw');
    const hand = startHand(session);
    if (lastBossProfileId) assert.notEqual(hand.bossProfile.id, lastBossProfileId);
    assert.equal(session.lastBossProfileId, hand.bossProfile.id);
    assert.equal(hand.bossSelection.previousId, lastBossProfileId);
  }
  for (const lastBossProfileId of ['sniper', 'trapper', '', 'CALLER', 0, false, [], {}]) {
    assert.throws(() => createSession(settings, 22, {lastBossProfileId}), /lastBossProfileId/);
  }
  assert.equal(createSession(settings, 22, {lastBossProfileId: undefined}).lastBossProfileId, null);
});

test('seeded automated games use all size identities and conserve the matched pot', () => {
  const a = createSession(config(), 827), b = createSession(config(), 827);
  let multiRaises = 0;
  for (let index = 0; index < 100; index++) {
    if (!(a.stacks.player > 0)) { a.stacks.player = 500; b.stacks.player = 500; }
    const hand = playAutomatedHand(a, 'aggressive'), reference = playAutomatedHand(b, 'aggressive');
    assert.deepEqual(hand.result, reference.result);
    near(hand.stacks.player + hand.stacks.npc, hand.stacksBefore.player + hand.stacksBefore.npc);
    const raises = hand.history.filter(event => event.type === 'raise');
    if (raises.length > 1) multiRaises++;
    for (const event of hand.history.filter(event => event.sizeKey)) assert.ok(event.id.includes(':'));
  }
  assert.ok(multiRaises > 0);
});

const sizingDistribution = () => [
  {type: 'fold', probability: .05}, {type: 'call', probability: .25},
  {type: 'raise', id: 'raise:half', sizeKeys: ['half'], probability: .35},
  {type: 'raise', id: 'raise:pot', sizeKeys: ['pot'], probability: .245},
  {type: 'raise', id: 'raise:allin', sizeKeys: ['allin'], probability: .105}
].map(item => ({...item, bossSizing: true}));

test('NPC samples its action first and consumes a second independent draw only for raise sizing', () => {
  const cases = [
    {rolls: [.01], index: 0}, {rolls: [.2], index: 1},
    {rolls: [.8, .2], index: 2}, {rolls: [.8, .65], index: 3}, {rolls: [.8, .9], index: 4}
  ];
  for (const {rolls, index} of cases) {
    let draws = 0;
    const distribution = sizingDistribution();
    const selected = sampleDistribution(distribution, () => rolls[draws++]);
    assert.equal(draws, rolls.length); assert.equal(selected.index, index);
    assert.equal(selected.roll, rolls[0]); assert.equal(selected.sizeRoll, rolls[1]);
    assert.equal(selected.probability, distribution[index].probability, 'report retains the joint action probability');
  }
});

test('a merged all-in size still draws its sizing ticket, while players retain one action draw', () => {
  let draws = 0;
  const merged = [{type: 'call', probability: .3, bossSizing: true},
    {type: 'raise', id: 'raise:half', sizeKeys: ['half', 'pot', 'allin'], probability: .7, bossSizing: true}];
  const selected = sampleDistribution(merged, () => [ .8, .4 ][draws++]);
  assert.equal(draws, 2); assert.equal(selected.sizeRoll, .4); assert.equal(selected.index, 1);
  draws = 0;
  const player = sampleDistribution(sizingDistribution().map(({bossSizing, ...item}) => item), () => { draws++; return .8; });
  assert.equal(draws, 1); assert.equal(player.sizeRoll, undefined);
});

test('only fixed Holdem NPC distributions request two-stage sampling', () => {
  const hand = handWith({deal: {npc: {manual: ['As', 'Ah']}}});
  assert.ok(getActionDistribution(hand, 'player').every(item => item.bossSizing === undefined));
  take(hand, 'raise', 'half');
  const distribution = getActionDistribution(hand);
  assert.ok(distribution.every(item => item.bossSizing === true));
  let draws = 0;
  const result = sampleDistribution(distribution, () => [ .8, .7 ][draws++]);
  assert.equal(draws, 2); assert.equal(result.type, 'raise');
  assert.ok(result.sizeKeys.includes('pot'));
});

test('seeded two-stage draws reproduce the 70 percent aggression and 50/35/15 conditional size split', () => {
  const one = createRng(537), two = createRng(537), counts = [0, 0, 0, 0, 0];
  let draws = 0;
  const rng = () => { draws++; return one(); };
  for (let index = 0; index < 30000; index++) {
    const selected = sampleDistribution(sizingDistribution(), rng);
    assert.deepEqual(selected, sampleDistribution(sizingDistribution(), two));
    counts[selected.index]++;
  }
  const raises = counts.slice(2).reduce((sum, count) => sum + count, 0);
  assert.equal(draws, 30000 + raises);
  assert.ok(Math.abs(raises / 30000 - .7) < .015);
  [.5, .35, .15].forEach((expected, index) => assert.ok(Math.abs(counts[index + 2] / raises - expected) < .015));
  assert.equal(one.state(), two.state());
});
