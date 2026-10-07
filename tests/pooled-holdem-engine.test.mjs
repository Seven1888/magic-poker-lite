import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_CONFIG, normalizeConfig, createSession, startHand, applyAction, legalActions, cloneHand, getActionDistribution,
  sampleDistribution, playAutomatedHand, compareHands, previewResponse, evaluateBest, simulate, beginNewTable} from '../src/engine.mjs';
import {classifyBossStrength, getBossProbabilityScenarios} from '../src/boss-profiles.mjs';
import {drawPaidPoolOutcome} from '../src/outcome-pools.mjs';
import {classifyJackpot} from '../src/jackpot.mjs';
import {isHoldemBetting} from '../src/holdem-betting.mjs';

const config = (extra = {}) => ({...extra, outcome: {mode: 'pooled-holdem', ...extra.outcome},
  boss: {mode: 'fixed', profileId: 'maniac', ...extra.boss}});
const create = (extra = {}, seed = 0, options) => createSession(config(extra), seed, options);
const open = (extra = {}, seed = 0, options) => startHand(create(extra, seed, options));
const choose = (hand, type, size) => {
  const chosen = legalActions(hand).find(item => item.type === type && (!size || item.sizeKeys?.includes(size)));
  assert.ok(chosen, `missing ${type}:${size}`); return chosen;
};
const take = (hand, type, size) => applyAction(hand, choose(hand, type, size));
const passive = hand => {
  let count = 0;
  while (hand.status === 'playing') {
    assert.ok(++count < 40);
    applyAction(hand, legalActions(hand).find(action => ['check', 'call'].includes(action.type)));
  }
  return hand;
};
const snapshot = session => ({session: JSON.stringify(session), hand: JSON.stringify(session.activeHand), rng: session.rng.state()});
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < .000003, `${actual} != ${expected}`);
function assertConservation(hand) {
  const r = hand.result, audit = r.outcomePoolAudit;
  near(r.player.stackAfter + r.npc.stackAfter, r.player.stackBefore + r.npc.stackBefore + r.player.jackpotAward);
  near(audit.after.paidAction, audit.before.paidAction - audit.paidActionBudgetUsed + audit.paidActionAdded);
  near(audit.after.special, audit.before.special - audit.specialAward + audit.specialAdded);
  assert.equal(r.fee, 0); assert.equal(r.player.netReturn, r.player.gross);
  assert.equal(r.npc.netReturn, r.npc.gross);
}

test('the production default and raw API use pooled Holdem, including a big-blind-only override', () => {
  assert.equal(DEFAULT_CONFIG.outcome.mode, 'pooled-holdem');
  assert.equal(DEFAULT_CONFIG.buyIn, 500); assert.equal(DEFAULT_CONFIG.minBuyIn, 500);
  assert.equal(DEFAULT_CONFIG.maxRaises, null);
  const settings = normalizeConfig({bigBlind: 20});
  assert.equal(settings.bigBlind, 20); assert.equal(settings.smallBlind, 10);
  assert.equal(settings.buyIn, 1000); assert.equal(settings.minBuyIn, 1000);
  assert.equal(settings.outcome.mode, 'pooled-holdem');
  const session = createSession();
  assert.deepEqual(session.stacks, {player: 500, npc: 500});
  const hand = startHand(session);
  assert.equal(hand.pooledHoldem.model, 'pooled-holdem-v1'); assert.equal(hand._outcomeTree, undefined);
});

test('pooled Holdem retains 99 percent, JP and pools with standard NL entry rules', () => {
  const normalized = normalizeConfig(config({smallBlind: 5, targetRtp: .96}));
  assert.ok(isHoldemBetting(normalized)); assert.equal(normalized.bigBlind, 10);
  assert.equal(normalized.buyIn, 500); assert.equal(normalized.maxRaises, null);
  assert.equal(normalized.outcome.conversionRate, .99); assert.equal(normalized.targetRtp, 1);
  assert.equal(normalized.jackpotEnabled, true);
  for (const seat of ['player', 'npc']) {
    assert.equal(normalized.deal[seat].rerollChance, 0); assert.equal(normalized.deal[seat].maxRerolls, 0);
  }
  const hand = open();
  assert.equal(hand.board.length, 0); assert.equal(hand.outcomeDecision.probability, .495);
  assert.equal(hand.outcomeDecision.score, 4.95); assert.equal(hand.outcomeDecision.denominator, 10);
  assert.equal(hand._outcomeTree, undefined);
  assert.equal(hand.pooledHoldem.model, 'pooled-holdem-v1');
  assert.ok(Object.keys(hand).includes('pooledHoldem'));
  assert.ok(Object.keys(hand).includes('outcomeDecision'));
});

test('opening stores only necessary fixed private pairs and matches each result target', () => {
  for (const [extra, seed, expected] of [[{}, 0, 'win'], [{outcome: {conversionRate: 0}}, 0, 'nonWin']]) {
    const hand = open(extra, seed), layout = hand.pooledHoldem.layout;
    assert.equal(hand.outcomeDecision.target, expected);
    assert.deepEqual(Object.keys(layout.boss).sort(), expected === 'win' ? ['win'] : ['nonWin', 'win']);
    for (const [target, pair] of Object.entries(layout.boss)) {
      const comparison = compareHands([...layout.player, ...layout.board], [...pair, ...layout.board]);
      assert.equal(comparison > 0, target === 'win');
      assert.equal(new Set([...layout.player, ...layout.board, ...pair]).size, 9);
    }
    assert.equal(new Set([...hand.holes.player, ...hand.holes.npc, ...hand.board, ...hand.deck]).size, 52);
    assert.equal(classifyJackpot(evaluateBest([...layout.player, ...layout.board])), null);
  }
});

test('nonWin paid draw follows the original formula and switches only to the saved win pair', () => {
  const hand = open({outcome: {conversionRate: 0, initialPaidActionPools: [1000, 0, 0]}});
  const layout = structuredClone(hand.pooledHoldem.layout), oldPair = [...hand.holes.npc], beforeRng = hand.rng.state();
  const action = choose(hand, 'raise', 'pot'), draft = cloneHand(hand);
  const expected = drawPaidPoolOutcome({hand: draft, action, previousDecision: draft.outcomeDecision,
    rng: draft.rng, config: draft.config.outcome, nodeId: `1:1:${action.id}`});
  applyAction(hand, action);
  assert.deepEqual(hand.outcomeDecision, expected);
  assert.equal(hand.outcomeDecision.target, 'win'); assert.equal(hand.outcomeDecision.denominator, 60);
  assert.equal(hand.outcomeDecision.paidActionBudgetUsed, 60);
  assert.deepEqual(hand.holes.npc, layout.boss.win); assert.notDeepEqual(hand.holes.npc, oldPair);
  assert.deepEqual(hand.holes.player, layout.player); assert.deepEqual(hand.pooledHoldem.layout, layout);
  assert.equal(hand.board.length, 0); assert.equal(hand.rng.state(), draft.rng.state());
  assert.notEqual(hand.rng.state(), beforeRng);
  passive(hand); assert.equal(hand.result.winner, 'player'); assert.deepEqual(hand.board, layout.board);
  assertConservation(hand);
});

test('same-street public odds stay locked after private pair conversion; the next street locks the new pair', () => {
  const hand = open({outcome: {conversionRate: 0, initialPaidActionPools: [1000, 0, 0]}});
  const before = structuredClone(hand.bossStreetStrength), odds = getBossProbabilityScenarios(hand);
  take(hand, 'raise', 'half');
  assert.equal(hand.outcomeDecision.target, 'win');
  assert.deepEqual(hand.bossStreetStrength, before); assert.deepEqual(getBossProbabilityScenarios(hand), odds);
  take(hand, 'call');
  assert.equal(hand.street, 'flop');
  assert.deepEqual(hand.bossStreetStrength, {street: 'flop', ...classifyBossStrength(hand)});
  assert.deepEqual(hand.bossStreetStates.preflop, before);
});

test('winning paid actions inherit without RNG, and only matched paid chips earn 80/20 credits', () => {
  const hand = open(), before = hand.rng.state();
  assert.equal(hand.outcomeDecision.target, 'win');
  take(hand, 'raise', 'half');
  assert.equal(hand.rng.state(), before); assert.equal(hand.outcomeDecision.kind, 'paid-win');
  assert.equal(hand.outcomeDecision.inherited, true); assert.equal(hand.outcomeDecision.roll, null);
  take(hand, 'fold');
  const audit = hand.result.outcomePoolAudit;
  assert.equal(hand.result.player.refund, 10);
  assert.equal(audit.credits[0].matchedPaidAmount, 5); assert.equal(audit.credits[0].refundablePaidAmount, 10);
  assert.equal(audit.paidActionAdded, 3.96); assert.equal(audit.specialAdded, .99);
  assertConservation(hand);
});

test('CD decreases only on paid nonWin actions and an available pool can convert a later reraise', () => {
  const hand = open({outcome: {conversionRate: 0, initialPaidActionPools: [2000, 0, 0], initialPaidActionCooldown: 2,
    paidActionCooldownMin: 3, paidActionCooldownMax: 3}});
  for (const expectedCD of [1, 0]) {
    take(hand, 'raise', 'half');
    assert.equal(hand.outcomeDecision.target, 'nonWin');
    assert.equal(hand.session.outcomePools.paidActionCooldown, expectedCD);
    assert.equal(hand.outcomeDecision.paidActionBudgetUsed, 0);
    const before = hand.rng.state(); take(hand, 'raise', 'half');
    assert.equal(hand.rng.state(), before, 'NPC raise does not draw a paid outcome');
  }
  take(hand, 'raise', 'half');
  assert.equal(hand.raises, 5); assert.equal(hand.outcomeDecision.target, 'win');
  assert.equal(hand.session.outcomePools.paidActionCooldown, 3);
  assert.ok(hand.outcomeDecision.paidActionBudgetUsed > 0);
  take(hand, 'call'); passive(hand); assertConservation(hand);
});

test('free checks never use pools, reduce cooldown or draw another result', () => {
  const hand = open({outcome: {conversionRate: 0, initialPaidActionCooldown: 3}}, 0, {firstSmallBlind: 'npc'});
  take(hand, 'call');
  const before = hand.rng.state(), decision = structuredClone(hand.outcomeDecision), pools = structuredClone(hand.session.outcomePools);
  take(hand, 'check');
  assert.equal(hand.street, 'flop'); assert.equal(hand.rng.state(), before);
  assert.deepEqual(hand.outcomeDecision, decision); assert.deepEqual(hand.session.outcomePools, pools);
});

test('funded root special qualification is paid once only on its matching winning showdown', () => {
  for (const [tier, award] of [['royal', 2000], ['straightFlush', 500], ['quads', 200]]) {
    const hand = open({outcome: {initialSpecialPools: [award, 3, 4], specialUseChance: 1}});
    assert.equal(hand.outcomeDecision.qualification.tier, tier);
    const folded = cloneHand(hand); take(folded, 'fold');
    assert.equal(folded.result.player.jackpotAward, 0); assert.equal(folded.session.outcomePools.buckets[0].special, award);
    assert.equal(hand.session.outcomePools.buckets[0].special, award);
    passive(hand);
    assert.equal(hand.result.jackpot.tier, tier); assert.equal(hand.result.player.jackpotAward, award);
    assert.equal(hand.result.outcomePoolAudit.specialAward, award); assertConservation(hand);
    const before = snapshot(hand.session);
    assert.throws(() => applyAction(hand, 'check')); assert.deepEqual(snapshot(hand.session), before);
    assert.deepEqual(hand.session.outcomePools.buckets.slice(1), [{paidAction: 0, special: 3}, {paidAction: 0, special: 4}]);
  }
});

test('short blind all-ins resolve only after root layout, classification and pool state exist', () => {
  for (const amount of [.000001, 1, 5, 7]) for (const seed of [0, 1]) {
    const session = create({}, seed); session.stacks = {player: amount, npc: 0};
    const hand = startHand(session);
    assert.deepEqual(hand.stacksBefore, {player: amount, npc: amount});
    assert.ok(hand.pooledHoldem.layout); assert.ok(hand.outcomeDecision.poolBranch);
    if (hand.status === 'playing') passive(hand);
    assert.equal(hand.board.length, 5); assert.equal(hand.result.winner === 'player', hand.outcomeDecision.target === 'win');
    assert.equal(hand.result.outcomePoolAudit.paidEvents.length, amount <= 5 ? 0 : 1);
    assert.equal(hand.session.outcomePools.handSequence, 1); assertConservation(hand);
  }
});

test('impossible manual layouts and exhausted layout retries fail before any money or RNG is committed', () => {
  const cases = [
    [config({outcome: {conversionRate: 0}, deal: {npc: {manual: ['As', 'Ah']}}}), 'MANUAL_BOSS_TARGET_CONFLICT'],
    [config({outcome: {initialSpecialPools: [2000, 0, 0], specialUseChance: 1, maxLayoutAttempts: 2},
      deal: {player: {manual: ['2c', '3d']}}}), 'LAYOUT_LIMIT']
  ];
  for (const [settings, code] of cases) {
    const session = createSession(settings, 0), before = snapshot(session), money = session.stacks, pools = session.outcomePools, rng = session.rng;
    assert.throws(() => startHand(session), error => error.code === code);
    assert.deepEqual(snapshot(session), before); assert.equal(session.stacks, money);
    assert.equal(session.outcomePools, pools); assert.equal(session.rng, rng);
  }
});

test('a paid transition failure leaves the live target, RNG, accounts and controller unchanged', () => {
  const hand = open({outcome: {conversionRate: 0, initialPaidActionPools: [1000, 0, 0]}});
  delete hand.pooledHoldem.layout.boss.win;
  const before = snapshot(hand.session), rng = hand.rng, layout = hand.pooledHoldem, decision = hand.outcomeDecision;
  assert.throws(() => take(hand, 'raise', 'half'), /saved pooled Holdem layout/);
  assert.deepEqual(snapshot(hand.session), before); assert.equal(hand.rng, rng);
  assert.equal(hand.pooledHoldem, layout); assert.equal(hand.outcomeDecision, decision);
});

test('cloned paths, previews and samples do not mutate the source controller or its RNG', () => {
  const hand = open({outcome: {conversionRate: 0, initialPaidActionPools: [1000, 0, 0]}}), before = snapshot(hand.session);
  previewResponse(hand, 'raise:half');
  const copy = cloneHand(hand); take(copy, 'raise', 'half');
  assert.deepEqual(snapshot(hand.session), before); assert.equal(hand.outcomeDecision.target, 'nonWin');
  assert.equal(copy.outcomeDecision.target, 'win'); assert.notEqual(copy.pooledHoldem.layout, hand.pooledHoldem.layout);
  copy.pooledHoldem.layout.board.reverse(); assert.deepEqual(snapshot(hand.session), before);
});

test('controller, locked odds and result draws survive complete JSON snapshot restoration', () => {
  const original = open({outcome: {conversionRate: 0, initialPaidActionPools: [1000, 0, 0]}});
  const encoded = JSON.parse(JSON.stringify(original));
  const restoredSession = createSession(encoded.config, 0, {outcomePools: encoded.session.outcomePools});
  const rng = original.rng.clone();
  Object.assign(restoredSession, encoded.session, {rng, stacks: {...encoded.stacks}});
  const restored = {...encoded, session: restoredSession, rng, stacks: restoredSession.stacks};
  Object.defineProperty(restoredSession, 'activeHand', {value: restored, writable: true, configurable: true});
  while (original.status === 'playing') {
    const distribution = getActionDistribution(original, original.actor, 'aggressive');
    const copyDistribution = getActionDistribution(restored, restored.actor, 'aggressive');
    assert.deepEqual(distribution, copyDistribution);
    const chosen = sampleDistribution(distribution, original.rng), copied = sampleDistribution(copyDistribution, restored.rng);
    assert.deepEqual(chosen, copied);
    applyAction(original, chosen); applyAction(restored, copied);
    assert.deepEqual(snapshot(original.session), snapshot(restoredSession));
  }
});

test('cross-hand pools, hand ids, alternating blinds and opponent start buy-ins persist', () => {
  const session = create(); let previous = null, pools = structuredClone(session.outcomePools);
  for (let index = 0; index < 6; index++) {
    const playerBefore = session.stacks.player, hand = startHand(session);
    assert.equal(hand.outcomeHandId, String(index + 1)); assert.deepEqual(hand.outcomePoolsBefore, pools);
    assert.deepEqual(hand.stacksBefore, {player: playerBefore, npc: playerBefore});
    if (previous) assert.notEqual(hand.smallBlind, previous);
    previous = hand.smallBlind;
    take(hand, 'fold'); assertConservation(hand);
    assert.equal(session.outcomePools.handSequence, index + 1); pools = structuredClone(session.outcomePools);
  }
});

test('seeded pooled NL play is reproducible and preserves wallet and pool ledgers over many paths', () => {
  const settings = {outcome: {initialPaidActionPools: [100, 0, 0], initialSpecialPools: [2000, 0, 0]}};
  const left = create(settings, 38), right = create(settings, 38);
  let reraises = 0;
  for (let index = 0; index < 40; index++) {
    if (!(left.stacks.player > 0)) { left.stacks.player = 500; right.stacks.player = 500; }
    const hand = playAutomatedHand(left, 'aggressive'), comparison = playAutomatedHand(right, 'aggressive');
    assert.deepEqual(hand.result, comparison.result); assert.equal(left.rng.state(), right.rng.state());
    assertConservation(hand);
    reraises += hand.history.filter(action => action.type === 'raise').length > 1 ? 1 : 0;
    assert.equal(hand.result.winner === 'player', hand.result.reason === 'fold' ? hand.result.folded === 'npc' : hand.outcomeDecision.target === 'win');
  }
  assert.ok(reraises > 0);
});

test('raw simulation keeps table chips between hands and reports the new single-sequence method', () => {
  const settings = config({outcome: {conversionRate: 0}}), seed = 452;
  const report = simulate(settings, {hands: 20, seed, policy: 'aggressive'});
  const session = createSession(settings, seed, {firstSmallBlind: 'random'});
  let wagers = 0, returns = 0, entries = 1;
  for (let index = 0; index < 20; index++) {
    if (!(session.stacks.player > 0)) { beginNewTable(session, {buyIn: session.config.buyIn}); entries++; }
    const hand = playAutomatedHand(session, 'aggressive');
    wagers += hand.result.player.matchedWager; returns += hand.result.player.totalReturn;
  }
  assert.equal(report.ruleSet, 'pooled-holdem-v1'); assert.equal(report.tableEntries, entries);
  near(report.wagers, wagers); near(report.totalReturns, returns); near(report.conservationError, 0);
  assert.match(report.method, /同桌籌碼跨手延續/); assert.match(report.method, /兩型輪替|固定類型/);
  assert.doesNotMatch(report.method, /四型/); assert.deepEqual(report.ci95, [null, null]);
});
