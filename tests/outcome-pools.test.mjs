import test from 'node:test';
import assert from 'node:assert/strict';
import {OUTCOME_POOL_SCALE, OUTCOME_BET_BUCKETS, DEFAULT_OUTCOME_POOL_CONFIG,
  normalizeOutcomePoolConfig, outcomeBetBucketIndex, createOutcomePools, normalizeOutcomePools, cloneOutcomePools, compactOutcomePools,
  drawOutcomeTicket, createOutcomePoolBranch, quoteRootPoolOutcome, reserveSpecialQualification,
  drawRootPoolOutcome, quotePaidPoolOutcome, drawPaidPoolOutcome, isSpecialPoolLayout,
  applyBranchPools, settleOutcomePools} from '../src/outcome-pools.mjs';

const sequence = (...values) => {
  let index = 0;
  const rng = () => {
    assert.ok(index < values.length, 'unexpected extra RNG draw');
    return values[index++];
  };
  rng.count = () => index;
  return rng;
};
const neverDraw = () => { throw new Error('RNG must not be used'); };
const moneyHand = (extra = {}) => ({actor: 'player', config: {bigBlind: 1, targetRtp: 0.96, jackpotEnabled: true},
  contributions: {player: 0.5, npc: 1}, stacks: {player: 99.5, npc: 99},
  stacksBefore: {player: 100, npc: 100}, ...extra});
const call = {type: 'call', amount: 0.5, to: 1};
const decision = (pools = createOutcomePools(), target = 'nonWin', bet = 1) => ({target,
  poolBranch: createOutcomePoolBranch(pools, bet), qualification: null});
const settle = (pools, selected, extra = {}) => settleOutcomePools({pools, decision: selected,
  matchedWager: 1, reason: 'showdown', winner: selected.target === 'win' ? 'player' : 'npc',
  actualTier: null, handId: String(pools.handSequence + 1), ...extra});

test('the current Hands Up constants and three exact stake buckets are retained with a single RTP score coefficient', () => {
  assert.equal(OUTCOME_POOL_SCALE, 1_000_000);
  assert.deepEqual(DEFAULT_OUTCOME_POOL_CONFIG, {conversionRate: 0.99, paidActionBudgetShare: 0.8,
    paidActionCooldownMin: 0, paidActionCooldownMax: 0, specialUseChance: 0.2});
  assert.deepEqual(OUTCOME_BET_BUCKETS, [[1, 2, 5, 10], [20, 50, 100, 200, 500], [800, 1000, 1200, 1500, 1800, 2000]]);
  for (const [index, bucket] of OUTCOME_BET_BUCKETS.entries()) {
    for (const bet of bucket) assert.equal(outcomeBetBucketIndex(bet), index);
  }
  assert.throws(() => outcomeBetBucketIndex(3), /BET/);
  assert.throws(() => normalizeOutcomePoolConfig({conversionRate: 1.01}), /conversionRate/);
  assert.throws(() => normalizeOutcomePoolConfig({paidActionCooldownMin: 3, paidActionCooldownMax: 2}), /CD/);
});

test('pool snapshots preserve six-decimal money, sequence and cooldown without aliasing caller data', () => {
  const pools = createOutcomePools({paidAction: [1.00000049, 2, 3], special: [4, 5, 6],
    paidActionCooldown: 4, qualificationSequence: 7, handSequence: 9});
  assert.equal(pools.buckets[0].paidAction, 1);
  const copy = cloneOutcomePools(pools);
  copy.buckets[0].paidAction = 99;
  assert.equal(pools.buckets[0].paidAction, 1);
  assert.equal(copy.paidActionCooldown, 4); assert.equal(copy.handSequence, 9);
  assert.throws(() => normalizeOutcomePools({version: 1, buckets: []}), /桶數/);
  assert.throws(() => createOutcomePools({special: [-1, 0, 0]}), /金額/);
  assert.throws(() => createOutcomePools({paidActionCooldown: 0.1}), /整數/);
});

test('million-ticket draw boundaries exactly match the original inclusive ticket comparison', () => {
  assert.equal(drawOutcomeTicket(0.000001, sequence(0)).hit, true);
  assert.equal(drawOutcomeTicket(0.000001, sequence(0.000001)).hit, false);
  assert.equal(drawOutcomeTicket(0, sequence(0)).hit, false);
  assert.equal(drawOutcomeTicket(1, sequence(0.999999999)).hit, true);
  const drawn = drawOutcomeTicket(0.1234567, sequence(0.2));
  assert.equal(drawn.winningNumbers, 123457); assert.equal(drawn.probability, 0.123457);
  assert.equal(drawn.roll, 200001);
});

test('root uses matched blinds and an independent .99 score; it never earns either pool', () => {
  const quote = quoteRootPoolOutcome({hand: moneyHand()});
  assert.equal(quote.matchedWager, 0.5); assert.equal(quote.score, 0.495);
  assert.equal(quote.denominator, 1); assert.equal(quote.probability, 0.495);
  const alternateFactor = quoteRootPoolOutcome({hand: moneyHand({config: {bigBlind: 1, targetRtp: 1}})});
  assert.equal(alternateFactor.probability, 0.495);
  const pools = createOutcomePools(), root = drawRootPoolOutcome({hand: moneyHand(), pools, rng: sequence(0)});
  assert.equal(root.target, 'win'); assert.deepEqual(root.poolBranch.pendingWinPaidCredits, []);
  assert.equal(root.qualification, null);
  const final = settle(pools, root);
  assert.deepEqual(final.pools.buckets, pools.buckets);
  assert.equal(final.pools.handSequence, 1);
});

test('paid quote uses full matchable pot after the action, independent of whether Boss has already matched', () => {
  const branch = createOutcomePoolBranch(createOutcomePools(), 1);
  const raised = {type: 'raise', amount: 4.5};
  const quote = quotePaidPoolOutcome({hand: moneyHand(), action: raised, previousTarget: 'nonWin', branch});
  assert.equal(quote.matchedAfterAction, 5); assert.equal(quote.denominator, 10);
  const alreadyMatched = quotePaidPoolOutcome({hand: moneyHand({contributions: {player: 0.5, npc: 5}}),
    action: raised, previousTarget: 'nonWin', branch});
  assert.equal(alreadyMatched.probability, quote.probability);
  const shortBoss = quotePaidPoolOutcome({hand: moneyHand({stacksBefore: {player: 100, npc: 3}}),
    action: raised, previousTarget: 'nonWin', branch});
  assert.equal(shortBoss.denominator, 6);
});

test('a nonWin paid action can consume only enough pool to reach 100%, then earns deferred 80/20 credits', () => {
  const pools = createOutcomePools({paidAction: [2, 0, 0]}), before = JSON.stringify(pools);
  const paid = drawPaidPoolOutcome({hand: moneyHand(), action: call, previousDecision: decision(pools), rng: sequence(0.999)});
  assert.equal(paid.target, 'win'); assert.equal(paid.denominator, 2);
  assert.equal(paid.paidActionBudgetUsed, 1.505);
  assert.equal(paid.poolBranch.paidAction, 0.495);
  assert.equal(paid.poolBranch.special, 0);
  assert.equal(paid.poolBranch.pendingWinPaidCredits.length, 1);
  const live = applyBranchPools({pools, decision: paid, handId: '1'});
  assert.equal(live.buckets[0].paidAction, 0.495);
  assert.equal(live.buckets[0].special, 0); assert.equal(live.handSequence, 0);
  const final = settle(pools, paid);
  assert.equal(final.audit.paidActionAdded, 0.396); assert.equal(final.audit.specialAdded, 0.099);
  assert.equal(final.pools.buckets[0].paidAction, 0.891); assert.equal(final.pools.buckets[0].special, 0.099);
  assert.equal(JSON.stringify(pools), before);
});

test('a failed paid conversion still spends its quoted pool and earns no credits', () => {
  const pools = createOutcomePools({paidAction: [0.1, 0, 0]});
  const paid = drawPaidPoolOutcome({hand: moneyHand(), action: call, previousDecision: decision(pools), rng: sequence(0.99)});
  assert.equal(paid.target, 'nonWin'); assert.equal(paid.paidActionBudgetUsed, 0.1);
  assert.equal(paid.poolBranch.paidAction, 0);
  assert.deepEqual(paid.poolBranch.pendingWinPaidCredits, []);
  const final = settle(pools, paid);
  assert.equal(final.audit.paidActionAdded, 0); assert.equal(final.audit.specialAdded, 0);
});

test('paid actions after win inherit without RNG, pool spending or cooldown decrement but still earn credits', () => {
  const pools = createOutcomePools({paidAction: [10, 0, 0], paidActionCooldown: 4});
  const paid = drawPaidPoolOutcome({hand: moneyHand(), action: call, previousDecision: decision(pools, 'win'), rng: neverDraw});
  assert.equal(paid.target, 'win'); assert.equal(paid.inherited, true); assert.equal(paid.roll, null);
  assert.equal(paid.poolBranch.paidAction, 10); assert.equal(paid.poolBranch.paidActionCooldown, 4);
  const final = settle(pools, paid);
  assert.equal(final.pools.buckets[0].paidAction, 10.396); assert.equal(final.pools.buckets[0].special, 0.099);
});

test('global cooldown decrements only on paid actions after nonWin and inclusive cooldown draws occur before the target', () => {
  const pools = createOutcomePools({paidAction: [10, 20, 30], paidActionCooldown: 2});
  const blocked = drawPaidPoolOutcome({hand: moneyHand(), action: call, previousDecision: decision(pools), rng: sequence(0.99)});
  assert.equal(blocked.paidActionBudgetUsed, 0); assert.equal(blocked.poolBranch.paidActionCooldown, 1);
  const committed = settle(pools, blocked).pools;
  assert.equal(createOutcomePoolBranch(committed, 20).paidActionCooldown, 1);
  assert.equal(createOutcomePoolBranch(committed, 800).paidActionCooldown, 1);
  const ready = createOutcomePools({paidAction: [10, 0, 0]}), rng = sequence(0.999, 0.9);
  const used = drawPaidPoolOutcome({hand: moneyHand(), action: call, previousDecision: decision(ready), rng,
    config: {paidActionCooldownMin: 2, paidActionCooldownMax: 4}});
  assert.equal(used.cooldownDraw.result, 4); assert.equal(used.target, 'win'); assert.equal(rng.count(), 2);
});

test('pending credits are clipped to final matched contribution intervals; a refunded raise never farms pool money', () => {
  const pools = createOutcomePools();
  const hand = moneyHand({contributions: {player: 1, npc: 1}});
  const paid = drawPaidPoolOutcome({hand, action: {type: 'raise', amount: 5}, previousDecision: decision(pools, 'win'), rng: neverDraw});
  const partial = settle(pools, paid, {matchedWager: 2, reason: 'fold', winner: 'player'});
  assert.equal(partial.audit.credits[0].matchedPaidAmount, 1);
  assert.equal(partial.audit.credits[0].refundablePaidAmount, 4);
  assert.equal(partial.audit.paidActionAdded, 0.792); assert.equal(partial.audit.specialAdded, 0.198);
  const fullyRefunded = settle(pools, paid, {matchedWager: 1, reason: 'fold', winner: 'player'});
  assert.equal(fullyRefunded.audit.paidActionAdded, 0); assert.equal(fullyRefunded.audit.specialAdded, 0);
  const first = drawPaidPoolOutcome({hand: moneyHand(), action: call, previousDecision: decision(pools, 'win'), rng: neverDraw});
  const second = drawPaidPoolOutcome({hand: moneyHand({contributions: {player: 1, npc: 1}}),
    action: {type: 'bet', amount: 2}, previousDecision: first, rng: neverDraw});
  const clipped = settle(pools, second, {matchedWager: 1.5});
  assert.deepEqual(clipped.audit.credits.map(row => row.matchedPaidAmount), [0.5, 0.5]);
  assert.equal(clipped.audit.paidActionAdded + clipped.audit.specialAdded, 0.99);
});

test('special selection happens only on a winning root with enough money, selects the highest affordable tier, and reserves without spending', () => {
  for (const [special, tier] of [[19, null], [20, 'quads'], [49, 'quads'], [50, 'straightFlush'], [199, 'straightFlush'], [200, 'royal']]) {
    const pools = createOutcomePools({special: [special, 0, 0]});
    const rng = special >= 20 ? sequence(0) : neverDraw;
    const selected = reserveSpecialQualification({branch: createOutcomePoolBranch(pools, 1), rootTarget: 'win', rng});
    assert.equal(selected.qualification?.tier ?? null, tier);
    assert.equal(selected.branch.special, special);
    assert.equal(selected.branch.qualificationSequence, tier ? 1 : 0);
  }
  const branch = createOutcomePoolBranch(createOutcomePools({special: [500, 0, 0]}), 1);
  assert.equal(reserveSpecialQualification({branch, rootTarget: 'nonWin', rng: neverDraw}).qualification, null);
  assert.equal(reserveSpecialQualification({branch, rootTarget: 'win', enabled: false, rng: neverDraw}).qualification, null);
  assert.equal(reserveSpecialQualification({branch, rootTarget: 'win', rng: sequence(0.2)}).qualification, null);
  assert.equal(reserveSpecialQualification({branch, rootTarget: 'win', rng: sequence(0.199999)}).qualification.tier, 'royal');
});

test('pool-funded layouts use the reserved exact special tier and player cards; ordinary layouts cannot sneak in a JP', () => {
  const royal = {player: ['As', 'Ks'], board: ['Qs', 'Js', 'Ts', '2d', '3h']};
  assert.equal(isSpecialPoolLayout({...royal, qualification: {tier: 'royal'}}), true);
  assert.equal(isSpecialPoolLayout({...royal, qualification: {tier: 'straightFlush'}}), false);
  assert.equal(isSpecialPoolLayout(royal), false);
  assert.equal(isSpecialPoolLayout({player: ['2c', '3d'], board: ['As', 'Ks', 'Qs', 'Js', 'Ts'], qualification: {tier: 'royal'}}), false);
  assert.equal(isSpecialPoolLayout({player: ['As', 'Ad'], board: ['Ah', 'Ac', '5s', '7c', '9h'], qualification: {tier: 'quads'}}), true);
  assert.equal(isSpecialPoolLayout({player: ['Ks', '2d'], board: ['As', 'Ad', 'Ah', 'Ac', '5s'], qualification: {tier: 'quads'}}), false);
  assert.equal(isSpecialPoolLayout({player: ['As', 'Kd'], board: ['2c', '4h', '7s', '9d', 'Jh']}), true);
});

test('special pool pays and deducts exactly once on matching winning showdown; a fold preserves the pool', () => {
  const pools = createOutcomePools({special: [220, 0, 0]}), before = JSON.stringify(pools);
  const root = drawRootPoolOutcome({hand: moneyHand(), pools, rng: sequence(0, 0)});
  assert.equal(root.qualification.tier, 'royal'); assert.equal(root.poolBranch.special, 220);
  const folded = settle(pools, root, {reason: 'fold', winner: 'npc'});
  assert.equal(folded.specialAward, 0); assert.equal(folded.pools.buckets[0].special, 220);
  assert.equal(folded.audit.qualification.status, 'deferred');
  const final = settle(pools, root, {actualTier: 'royal'});
  assert.equal(final.specialAward, 200); assert.equal(final.pools.buckets[0].special, 20);
  assert.equal(final.audit.qualification.status, 'completed');
  assert.equal(final.pools.handSequence, 1); assert.equal(final.pools.qualificationSequence, 1);
  const twice = settleOutcomePools({pools: final.pools, handId: '1'});
  assert.equal(twice.alreadySettled, true); assert.equal(twice.specialAward, 0);
  assert.deepEqual(twice.pools, final.pools);
  assert.equal(JSON.stringify(pools), before);
  assert.throws(() => settle(pools, root, {actualTier: 'quads'}), /不一致/);
});

test('all normal continued betting preserves a reserved special award, and new hand credits cannot retroactively fund it', () => {
  const pools = createOutcomePools({special: [20, 0, 0]});
  const root = drawRootPoolOutcome({hand: moneyHand(), pools, rng: sequence(0, 0)});
  const paid = drawPaidPoolOutcome({hand: moneyHand(), action: call, previousDecision: root, rng: neverDraw});
  assert.deepEqual(paid.qualification, root.qualification);
  const final = settle(pools, paid, {actualTier: 'quads'});
  assert.equal(final.specialAward, 20); assert.equal(final.pools.buckets[0].special, 0.099);
  const tampered = structuredClone(paid); tampered.poolBranch.special = 19;
  assert.throws(() => settle(pools, tampered, {actualTier: 'quads'}), /不足/);
});

test('cross-hand and cross-table sequences never reset, and only the chosen branch is committed', () => {
  const pools = createOutcomePools({paidAction: [2, 3, 4], special: [0, 5, 6], handSequence: 18});
  const lost = drawPaidPoolOutcome({hand: moneyHand(), action: call,
    previousDecision: decision(pools), rng: sequence(0)});
  const alternate = drawPaidPoolOutcome({hand: moneyHand(), action: {type: 'raise', amount: 1.5},
    previousDecision: decision(pools), rng: sequence(0.99)});
  assert.notDeepEqual(lost.poolBranch, alternate.poolBranch);
  const selected = settle(pools, lost);
  assert.equal(selected.pools.handSequence, 19);
  assert.deepEqual(selected.pools.buckets.slice(1), pools.buckets.slice(1));
  const nextRoot = drawRootPoolOutcome({hand: moneyHand({outcomeHandId: '20'}),
    pools: selected.pools, rng: sequence(0.99)});
  assert.equal(nextRoot.poolBranch.handId, '20');
  const next = settle(selected.pools, nextRoot);
  assert.equal(next.pools.handSequence, 20);
  assert.throws(() => settleOutcomePools({pools: selected.pools, decision: alternate,
    matchedWager: 1, reason: 'fold', winner: 'player', handId: 'not-this-hand'}), /序號/);
  assert.throws(() => applyBranchPools({pools, decision: lost, handId: '1'}), /序號/);
});

test('counterfactual branches retain transaction identity and money but never duplicate the previous hand audit', () => {
  const pools = createOutcomePools({paidAction: [2, 3, 4], special: [0, 5, 6], handSequence: 12});
  pools.lastSettlement = {id: '12', audit: {handId: '12', oldDetails: Array(100).fill('previous-hand-only')}};
  const compact = compactOutcomePools(pools);
  assert.deepEqual(compact.buckets, pools.buckets);
  assert.equal(compact.handSequence, 12); assert.deepEqual(compact.lastSettlement, {id: '12', audit: {}});
  const root = decision(pools), paid = drawPaidPoolOutcome({hand: moneyHand(), action: call,
    previousDecision: root, rng: sequence(0)});
  assert.deepEqual(paid.poolBranch.basePools.lastSettlement, {id: '12', audit: {}});
  assert.equal(JSON.stringify(paid).includes('previous-hand-only'), false);
  const final = settle(pools, paid);
  assert.equal(final.pools.handSequence, 13);
  assert.equal(final.pools.buckets[0].paidAction, 0.891);
  assert.equal(pools.lastSettlement.audit.oldDetails.length, 100);
});
