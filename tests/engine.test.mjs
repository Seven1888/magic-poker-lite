import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRng, shuffle, makeDeck, evaluateBest, compareHands, holeScore, normalizeConfig,
  createSession, startHand, legalActions, applyAction, getActionDistribution, sampleDistribution,
  previewResponse, stepNpc, equityEstimate, playAutomatedHand, simulate
} from '../src/engine.mjs';

const near = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) <= tolerance, `${a} ≠ ${b}`);
const types = hand => legalActions(hand).map(action => action.type);
const passive = hand => {
  let guard = 0;
  while (hand.status === 'playing') {
    assert.ok(++guard <= 32);
    applyAction(hand, types(hand).includes('call') ? 'call' : 'check');
  }
  return hand;
};
const cards = text => text.split(' ');

test('all categories, wheel, ace-high straight flush, kicker comparison, and board-only ties', () => {
  const cases = [
    ['As Jd 9h 5c 3d', 0, '高牌'], ['As Ad 9h 5c 3d', 1, '一對'],
    ['As Ad 9h 9c 3d', 2, '兩對'], ['As Ad Ah 5c 3d', 3, '三條'],
    ['As 2d 3h 4c 5d', 4, '順子'], ['As Js 9s 5s 3s', 5, '同花'],
    ['As Ad Ah 5c 5d', 6, '葫蘆'], ['As Ad Ah Ac 3d', 7, '四條'],
    ['5s 6s 7s 8s 9s', 8, '同花順'], ['As Ks Qs Js Ts', 8, '皇家同花順']
  ];
  for (const [text, category, name] of cases) {
    const result = evaluateBest(cards(text));
    assert.equal(result.category, category); assert.equal(result.name, name);
    assert.equal(result.best5.length, 5);
  }
  assert.equal(evaluateBest(cards('As 2d 3h 4c 5d')).rank[1], 5);
  assert.equal(evaluateBest(cards('As 2d 3h 4c Kd')).category, 0);
  assert.equal(evaluateBest(cards('As Ad Ah Ks Kd Kh 2c')).rank[1], 14);
  assert.equal(evaluateBest(cards('As Ad Ah Ks Kd Kh 2c')).rank[2], 13);
  assert.equal(compareHands(cards('As Ad Qc 7h 2s'), cards('Ah Ac Jc 7d 2h')), 1);
  assert.equal(compareHands(cards('2s 3s As Kh Qd Jc Ts'), cards('4d 5d As Kh Qd Jc Ts')), 0);
  assert.throws(() => evaluateBest(cards('As As 2s 3s 4s')), /重複/);
});

test('seven-card evaluator agrees with exhaustive five-card subsets on 700 independent deals', () => {
  const rng = createRng(39);
  for (let iteration = 0; iteration < 700; iteration++) {
    const seven = shuffle(makeDeck(), rng).slice(0, 7);
    let best = null;
    for (let a = 0; a < 7; a++) for (let b = a + 1; b < 7; b++) {
      const five = seven.filter((_, index) => index !== a && index !== b);
      if (!best || compareHands(five, best) > 0) best = five;
    }
    assert.equal(compareHands(seven, best), 0);
  }
});

test('seeded RNG and deck shuffling are deterministic and preserve uniqueness', () => {
  const a = createRng('magic-poker'), b = createRng('magic-poker');
  assert.deepEqual(Array.from({length: 100}, a), Array.from({length: 100}, b));
  const c = a.clone();
  assert.equal(a(), c());
  const deck = shuffle(makeDeck(), a);
  assert.equal(deck.length, 52); assert.equal(new Set(deck).size, 52);
  assert.deepEqual(playAutomatedHand(createSession({}, 44)).result, playAutomatedHand(createSession({}, 44)).result);
});

test('manual hand validation rejects duplicate cards and impossible card names', () => {
  assert.throws(() => normalizeConfig({deal: {player: {manual: ['As', 'As']}}}), /重複/);
  assert.throws(() => normalizeConfig({deal: {player: {manual: ['As', 'Kh']}, npc: {manual: ['As', 'Qd']}}}), /重複/);
  assert.throws(() => normalizeConfig({deal: {player: {manual: ['As']}}}), /兩張/);
  assert.throws(() => normalizeConfig({deal: {player: {manual: ['JOKER', 'As']}}}), /無效/);
  assert.deepEqual(normalizeConfig({deal: {player: {manual: 'as 10H'}}}).deal.player.manual, ['As', 'Th']);
});

test('small blind acts preflop; a half-BET call retains the big blind option; postflop reverses order', () => {
  const hand = startHand(createSession({}, 20));
  assert.equal(hand.actor, 'player');
  assert.deepEqual(types(hand), ['fold', 'call', 'raise']);
  assert.equal(legalActions(hand).find(a => a.type === 'call').amount, 5);
  applyAction(hand, 'call');
  assert.equal(hand.street, 'preflop'); assert.equal(hand.actor, 'npc');
  assert.deepEqual(types(hand), ['check', 'raise']);
  applyAction(hand, 'check');
  assert.equal(hand.street, 'flop'); assert.equal(hand.board.length, 3); assert.equal(hand.actor, 'npc');
  assert.deepEqual(types(hand), ['check', 'bet']);
});

test('one raise per street, no free fold, and fixed sizes are enforced', () => {
  const hand = startHand(createSession({}, 77));
  applyAction(hand, 'call'); applyAction(hand, 'check');
  assert.throws(() => applyAction(hand, 'fold'), /不能/);
  assert.equal(legalActions(hand).find(a => a.type === 'bet').amount, 20);
  applyAction(hand, 'bet');
  assert.equal(hand.actor, 'player');
  const raise = legalActions(hand).find(a => a.type === 'raise');
  assert.equal(raise.amount, 40); assert.equal(raise.to, 40);
  applyAction(hand, 'raise');
  assert.deepEqual(types(hand), ['fold', 'call']);
  assert.throws(() => applyAction(hand, 'raise'), /不能/);
  applyAction(hand, 'call');
  assert.equal(hand.street, 'turn'); assert.equal(hand.raises, 0);
});

test('uncalled raises and blinds are refunded, excluded from wagers, and settlement conserves wallets', () => {
  const session = createSession({buyIn: 1000}, 17);
  const hand = startHand(session);
  applyAction(hand, 'fold');
  assert.equal(hand.result.player.matchedWager, 5);
  assert.equal(hand.result.npc.totalContribution, 10);
  assert.equal(hand.result.npc.refund, 5);
  assert.equal(hand.result.npc.gross, 10);
  assert.equal(hand.result.npc.netReturn, 9.6);
  assert.equal(hand.result.npc.profit, 4.6);
  assert.equal(hand.result.pot, 10); assert.equal(hand.result.fee, .4);
  assert.deepEqual(session.stacks, {player: 995, npc: 1004.6});
  near(session.stacks.player + session.stacks.npc + session.fees, 2000);
  assert.throws(() => applyAction(hand, 'call'), /不能/);
});

test('settled balances carry to the next hand and blinds alternate', () => {
  const session = createSession({}, 72);
  const one = startHand(session);
  assert.throws(() => startHand(session), /尚未結束/);
  applyAction(one, 'fold');
  const closing = {...session.stacks};
  const two = startHand(session);
  assert.equal(two.smallBlind, 'npc'); assert.equal(two.actor, 'npc');
  assert.deepEqual(two.stacksBefore, closing);
  assert.equal(two.stacks.player, closing.player - 10);
  assert.equal(two.stacks.npc, closing.npc - 5);
});

test('matched all-in runs out once, caps effective wager, and never offers raising against an all-in', () => {
  const session = createSession({minBuyIn: 10, buyIn: 20}, 99);
  session.stacks.npc = 100;
  const hand = startHand(session);
  const allIn = legalActions(hand).find(a => a.type === 'raise');
  assert.equal(allIn.to, 20); assert.equal(allIn.allIn, true);
  applyAction(hand, 'allin');
  assert.deepEqual(types(hand), ['fold', 'call']);
  applyAction(hand, 'call');
  assert.equal(hand.status, 'settled'); assert.equal(hand.board.length, 5);
  assert.equal(hand.result.player.matchedWager, 20);
  assert.equal(hand.result.npc.matchedWager, 20);
  near(hand.stacks.player + hand.stacks.npc + hand.result.fee, 120);
});

test('a short small blind is all-in on posting, runs out once and receives the matched pot only', () => {
  const session = createSession({buyIn: 1000}, 33);
  session.stacks.player = 3;
  const hand = startHand(session);
  assert.equal(hand.status, 'settled'); assert.equal(hand.board.length, 5);
  assert.equal(hand.contributions.player, 3); assert.deepEqual(types(hand), []);
  assert.deepEqual(hand.history.filter(event => event.amount).map(event => [event.type, event.amount]), [['smallBlind', 3], ['bigBlind', 10]]);
  assert.equal(hand.result.npc.refund, 7);
  assert.equal(hand.result.player.matchedWager, 3);
  near(hand.stacks.player + hand.stacks.npc + hand.result.fee, 1003);
});

test('common board tie splits contested gross and applies symmetric fee', () => {
  const hand = startHand(createSession({buyIn: 1000, jackpotEnabled: false, deal: {player: {manual: ['2c', '3d']}, npc: {manual: ['4c', '5d']}}}, 1));
  const board = ['As', 'Ks', 'Qs', 'Js', 'Ts'];
  hand.deck = [...board, ...hand.deck.filter(card => !board.includes(card))];
  passive(hand);
  assert.equal(hand.result.winner, 'tie'); assert.equal(hand.result.pot, 20);
  assert.equal(hand.result.player.gross, 10); assert.equal(hand.result.npc.gross, 10);
  assert.equal(hand.result.player.netReturn, 9.6); assert.equal(hand.result.player.fee, 0.4);
  near(hand.stacks.player + hand.stacks.npc + hand.result.fee, 2000);
});

test('redraws only choose starting cards, respect limit, improve aggregate quality, and preserve deck integrity', () => {
  let natural = 0, enhanced = 0;
  const low = {rerollChance: 0, maxRerolls: 0};
  const high = {rerollChance: 1, maxRerolls: 6, targetScore: 0.75};
  for (let seed = 0; seed < 300; seed++) {
    const plain = startHand(createSession({deal: {player: low, npc: low}}, seed));
    const boosted = startHand(createSession({deal: {player: high, npc: high}}, seed));
    natural += holeScore(plain.holes.player); enhanced += holeScore(boosted.holes.player);
    for (const seat of ['player', 'npc']) assert.ok(boosted.dealAudit[seat].rerolls <= 6);
    assert.equal(new Set([...boosted.holes.player, ...boosted.holes.npc, ...boosted.board, ...boosted.deck]).size, 52);
  }
  assert.ok(enhanced > natural * 1.10, '有限次弱牌重抽應提高平均起手品質，但不保證每手達標。');
  const fixed = startHand(createSession({deal: {player: {...high, manual: ['2c', '7d']}}}, 12));
  assert.deepEqual(fixed.holes.player, ['2c', '7d']); assert.equal(fixed.dealAudit.player.rerolls, 0);
});

test('NPC action distribution ignores player hole cards and future cards', () => {
  const hand = startHand(createSession({}, 781));
  applyAction(hand, 'raise');
  const before = getActionDistribution(hand);
  hand.holes.player = ['As', 'Ah'];
  hand.deck.reverse();
  assert.deepEqual(getActionDistribution(hand), before);
  near(before.reduce((sum, a) => sum + a.probability, 0), 1, 1e-12);
});

test('all-zero action weights fall back to a legal passive action', () => {
  const hand = startHand(createSession({npc: {fold: 0, call: 0, raise: 0, check: 0, bet: 0}}, 123));
  applyAction(hand, 'raise');
  assert.equal(getActionDistribution(hand).find(a => a.type === 'call').probability, 1);
});

test('preview does not mutate cards, balances, RNG or session; selected response matches actual distribution', () => {
  const hand = startHand(createSession({}, 111));
  const serialized = JSON.stringify(hand); const state = hand.rng.state();
  const preview = previewResponse(hand, 'raise');
  assert.equal(JSON.stringify(hand), serialized); assert.equal(hand.rng.state(), state);
  applyAction(hand, 'raise');
  assert.deepEqual(getActionDistribution(hand), preview.distribution);
});

test('preview never reveals a next-street distribution', () => {
  const hand = startHand(createSession({}, 222));
  applyAction(hand, 'call'); applyAction(hand, 'check');
  applyAction(hand, 'bet');
  const preview = previewResponse(hand, 'call');
  assert.equal(preview.street, 'turn'); assert.deepEqual(preview.distribution, []);
  assert.equal(hand.street, 'flop'); assert.equal(hand.board.length, 3);
});

test('one RNG draw locks one action; a 30/70 distribution samples as displayed', () => {
  const distribution = [{type: 'fold', probability: 0.3}, {type: 'call', probability: 0.7}];
  let calls = 0;
  assert.equal(sampleDistribution(distribution, () => { calls++; return 0.29; }).type, 'fold');
  assert.equal(calls, 1);
  assert.equal(sampleDistribution(distribution, () => 0.3).type, 'call');
  assert.equal(sampleDistribution(distribution, () => 0.99999).type, 'call');
  const rng = createRng(88); let folds = 0;
  for (let i = 0; i < 50000; i++) folds += sampleDistribution(distribution, rng).type === 'fold';
  near(folds / 50000, 0.3, 0.007);
  assert.throws(() => sampleDistribution([{type: 'fold', probability: 0.9}], rng), /總和/);
  const hand = startHand(createSession({}, 345)); applyAction(hand, 'raise');
  const expected = hand.rng.clone(); expected();
  stepNpc(hand); assert.equal(hand.rng.state(), expected.state());
});

test('equity estimates use only actor-visible cards, never mutate game RNG, and are reproducible', () => {
  const hand = startHand(createSession({}, 12));
  const before = hand.rng.state();
  const first = equityEstimate(hand, {samples: 200, seed: 9});
  hand.holes.npc = ['2s', '3s']; hand.deck.reverse();
  assert.deepEqual(equityEstimate(hand, {samples: 200, seed: 9}), first);
  assert.equal(hand.rng.state(), before);
  near(first.win + first.tie + first.loss, 1);
});

test('2,000 varied strategy hands preserve wallets, cards, contribution accounting and termination', () => {
  for (let seed = 0; seed < 2000; seed++) {
    const session = createSession({targetRtp: 0.96, jackpotEnabled: false, buyIn: seed % 2 ? 230.15 : 1000}, seed);
    const hand = playAutomatedHand(session, ['balanced', 'call', 'tight', 'aggressive'][seed % 4]);
    const r = hand.result;
    assert.equal(hand.status, 'settled');
    assert.equal(new Set([...hand.holes.player, ...hand.holes.npc, ...hand.board, ...hand.deck]).size, 52);
    near(r.player.stackAfter + r.npc.stackAfter + r.fee, r.player.stackBefore + r.npc.stackBefore, 0.000003);
    near(r.player.gross + r.npc.gross + r.player.refund + r.npc.refund, r.player.totalContribution + r.npc.totalContribution);
    near(r.player.profit + r.npc.profit, -r.fee, 0.000003);
    near(r.player.stackBefore + r.player.profit, r.player.stackAfter, 0.000003);
    assert.ok(r.player.stackAfter >= 0 && r.npc.stackAfter >= 0);
  }
});

test('symmetric reference simulation brackets 96%; fees and refunds use correct denominator; reproducible CI', () => {
  const result = simulate({jackpotEnabled: false}, {hands: 30000, seed: 1984});
  assert.ok(result.ci95[0] < 0.96 && result.ci95[1] > 0.96);
  near(result.netReturns / result.wagers, result.rtp, 1e-10);
  near(result.netReturns / result.grossReturns, 0.96, 1e-10);
  near(result.fees / (result.wagers * 2), 0.04, 1e-10);
  assert.equal(result.wins + result.losses + result.ties, result.hands);
  assert.equal(result.folds + result.npcFolds + result.showdowns, result.hands);
  assert.ok(result.refunds > 0); near(result.conservationError, 0, 0.000003);
  const a = simulate({}, {hands: 100, seed: 'repeat', policy: 'aggressive'});
  const b = simulate({}, {hands: 100, seed: 'repeat', policy: 'aggressive'});
  assert.deepEqual(a, b);
  assert.deepEqual(simulate({}, {hands: 1}).ci95, [null, null]);
});
