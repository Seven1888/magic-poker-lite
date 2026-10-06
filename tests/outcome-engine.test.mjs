import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_CONFIG, normalizeConfig, createSession, startHand, legalActions, applyAction, previewResponse,
  cloneHand, stepNpc, getActionDistribution, compareHands, syncOpponentBankroll} from '../src/engine.mjs';
import {classifyJackpot} from '../src/jackpot.mjs';

const near = (a, b) => assert.ok(Math.abs(a - b) < 0.000003, `${a} != ${b}`);
const snapshot = session => ({session: JSON.stringify(session), hand: JSON.stringify(session.activeHand), rng: session.rng.state()});
function poolState(pools) {
  const state = structuredClone(pools);
  if (state.lastSettlement) state.lastSettlement = {id: state.lastSettlement.id};
  return state;
}
const quick = (config = {}, seed = 2, options) => createSession({buyIn: 50, ...config}, seed, options);
const winningConfig = (extra = {}) => ({outcome: {conversionRate: 1, ...extra}});

test('current settings migrate old pot discounts and pay the full matched pot with one RTP score coefficient', () => {
  assert.equal(DEFAULT_CONFIG.targetRtp, 1);
  for (const targetRtp of [.5, .96, .97, 1]) {
    const config = normalizeConfig({targetRtp});
    assert.equal(config.targetRtp, 1);
    assert.equal(config.outcome.conversionRate, .99);
    const hand = startHand(createSession(config, 0));
    const root = hand.outcomeDecision;
    assert.equal(root.score, 4.95);assert.equal(root.denominator, 10);
    assert.equal(root.probability, .495);
    applyAction(hand, 'raise');applyAction(hand, 'fold');
    assert.equal(hand.result.player.refund, 10);
    assert.equal(hand.result.player.netReturn, 20);
    assert.equal(hand.result.player.fee, 0);
    assert.equal(hand.result.npc.fee, 0);
    near(hand.result.player.profit, 10);
  }
});
function passive(hand) {
  let steps = 0;
  while (hand.status === 'playing') {
    assert.ok(++steps < 40);
    applyAction(hand, legalActions(hand).find(action => ['check', 'call'].includes(action.type)).type);
  }
  return hand;
}
function followNode(hand, destination) {
  const nodes = new Map(hand._outcomeTree.nodes.map(node => [node.id, node]));
  const path = [];
  for (let node = destination; node.parentId !== null; node = nodes.get(node.parentId)) path.unshift(node.incoming.type);
  for (const type of path) applyAction(hand, type);
  assert.equal(hand._outcomeNodeId, destination.id);
}

test('the official default builds all 1,312 nodes before publishing and every stored branch conserves cards and money', () => {
  assert.equal(DEFAULT_CONFIG.outcome.mode, 'prebuilt-pools');
  const session = createSession({}, 0), initialPools = structuredClone(session.outcomePools);
  const hand = startHand(session), tree = hand._outcomeTree;
  assert.equal(tree.complete, true); assert.equal(tree.nodes.length, 1312); assert.equal(tree.statistics.terminalNodes, 750);
  assert.equal(hand._outcomeNodeId, tree.rootId); assert.equal(hand.outcomePlanning, undefined);
  assert.deepEqual(session.outcomePools.buckets, initialPools.buckets);
  assert.ok(tree.nodes.some(node => node.decision.poolBranch.pendingWinPaidCredits.length > 0));
  const player = [...hand.holes.player], board = [...tree.layout.board];
  for (const node of tree.nodes) {
    const state = node.state;
    assert.deepEqual(state.holes.player, player); assert.deepEqual(state.board, board.slice(0, state.board.length));
    assert.equal(state.deck.length, 48 - state.board.length);
    assert.equal(new Set([...state.holes.player, ...state.holes.npc, ...state.board, ...state.deck]).size, 52);
    assert.equal(state.outcomePlanning, undefined);
    if (!node.terminal) continue;
    const r = state.result;
    assert.equal(r.fee,0);assert.equal(r.player.netReturn,r.player.gross);assert.equal(r.npc.netReturn,r.npc.gross);
    near(r.player.stackAfter + r.npc.stackAfter + r.fee, r.player.stackBefore + r.npc.stackBefore + r.player.jackpotAward);
    if (node.forcedWinner) assert.equal(r.winner, node.forcedWinner);
    else {
      assert.equal(r.winner === 'player', node.target === 'win');
      assert.equal(classifyJackpot(r.evaluations.player), null, 'unqualified ordinary layouts do not pay or show special hands');
    }
  }
});

test('runtime follows an already planned nonWin-to-win branch without RNG and keeps every public card fixed', () => {
  const hand = startHand(quick({outcome: {initialPaidActionPools: [1000, 0, 0]}}, 2));
  assert.equal(hand.outcomeDecision.target, 'nonWin');
  const tree = hand._outcomeTree, originalCards = [...hand.holes.player], future = [...tree.layout.board], rng = hand.rng.state();
  const converted = tree.nodes.find(node => node.incoming?.actor === 'player'
    && node.decision.previousTarget === 'nonWin' && node.target === 'win');
  assert.ok(converted); followNode(hand, converted);
  assert.equal(hand.outcomeDecision.target, 'win');
  assert.ok(hand.session.outcomePools.buckets[0].paidAction < 1000, 'only the selected branch budget is reflected live');
  assert.equal(hand.session.outcomePools.buckets[0].paidAction, hand.outcomeDecision.poolBranch.paidAction);
  while (hand.status === 'playing') {
    assert.deepEqual(hand.holes.player, originalCards); assert.deepEqual(hand.board, future.slice(0, hand.board.length));
    applyAction(hand, legalActions(hand).find(action => ['check', 'call'].includes(action.type)).type);
  }
  assert.equal(hand.rng.state(), rng); assert.equal(hand.result.winner, 'player');
  assert.ok(compareHands([...hand.holes.player, ...hand.board], [...hand.holes.npc, ...hand.board]) > 0);
});

test('both fold overrides settle their actual winners while unchosen paid branches never fund the live pools', () => {
  const playerSession = quick(winningConfig(), 0), player = startHand(playerSession);
  assert.equal(player.outcomeDecision.target, 'win');
  const pools = structuredClone(playerSession.outcomePools);
  assert.ok(player._outcomeTree.nodes.some(node => node.decision.poolBranch.pendingWinPaidCredits.length));
  applyAction(player, 'fold'); assert.equal(player.result.winner, 'npc'); assert.equal(player.result.reason, 'fold');
  assert.deepEqual(playerSession.outcomePools.buckets, pools.buckets);
  assert.equal(player.result.outcomePoolAudit.paidActionAdded, 0);
  const boss = startHand(quick(winningConfig(), 0, {firstSmallBlind: 'npc'}));
  applyAction(boss, 'fold'); assert.equal(boss.result.winner, 'player'); assert.equal(boss.result.jackpot, null);
  assert.equal(boss.result.outcomePoolAudit.paidEvents.length, 0);
});

test('preview and cloned actions cannot change live funds, private nodes, cards, history or RNG', () => {
  const hand = startHand(quick({outcome: {initialPaidActionPools: [1000, 0, 0]}}, 2));
  const before = snapshot(hand.session), treeBefore = JSON.stringify(hand._outcomeTree.nodes);
  previewResponse(hand, 'raise');
  const clone = cloneHand(hand); applyAction(clone, 'raise');
  assert.notDeepEqual(clone.outcomeDecision, hand.outcomeDecision);
  assert.deepEqual(snapshot(hand.session), before); assert.equal(JSON.stringify(hand._outcomeTree.nodes), treeBefore);
  applyAction(clone, 'fold'); const resultCopy = cloneHand(clone);
  resultCopy.result.player.profit = -99999;
  resultCopy.result.outcomePoolAudit.after.paidAction = -99999;
  assert.notEqual(clone.result.player.profit, -99999);
  assert.notEqual(clone.result.outcomePoolAudit.after.paidAction, -99999);
  assert.equal(JSON.stringify(hand._outcomeTree.nodes), treeBefore);
});

test('the BOSS samples exactly one action draw while player and stored-node actions use none', () => {
  const hand = startHand(quick({}, 2));
  const before = hand.rng.state(); applyAction(hand, 'raise'); assert.equal(hand.rng.state(), before);
  const expected = hand.rng.clone(); expected();
  const selected = stepNpc(hand);
  assert.ok(selected.distribution.length); assert.equal(hand.rng.state(), expected.state());
  assert.equal(hand.session.rng, hand.rng);
});

test('a tree limit or contradictory manual Boss layout rejects without charging, reserving pools or changing the session', () => {
  for (const [config, code, seed = 0] of [
    [{outcome: {stateLimit: 1}}, 'STATE_LIMIT'],
    [{outcome: {conversionRate: 0, initialPaidActionPools: [1000, 0, 0]},
      deal: {npc: {manual: ['As', 'Ah']}}}, 'MANUAL_BOSS_TARGET_CONFLICT'],
    [{...winningConfig({initialSpecialPools: [2000, 0, 0], specialUseChance: 1, maxLayoutAttempts: 2}),
      deal: {player: {manual: ['2c', '3d']}}}, 'LAYOUT_LIMIT', 1]
  ]) {
    const session = quick(config, seed), before = snapshot(session);
    const stacks = session.stacks, pools = session.outcomePools, rng = session.rng;
    assert.throws(() => startHand(session), error => error.code === code);
    assert.deepEqual(snapshot(session), before); assert.equal(session.stacks, stacks);
    assert.equal(session.outcomePools, pools); assert.equal(session.rng, rng); assert.equal(session.activeHand, undefined);
  }
});

test('matching only part of a winning paid raise clips refund credits before splitting the pool deposit', () => {
  const hand = startHand(quick(winningConfig(), 0));
  applyAction(hand, 'raise'); applyAction(hand, 'fold');
  const audit = hand.result.outcomePoolAudit;
  assert.equal(hand.result.player.refund, 10); assert.equal(hand.result.player.matchedWager, 10);
  assert.equal(audit.credits.length, 1); assert.equal(audit.credits[0].matchedPaidAmount, 5);
  assert.equal(audit.credits[0].refundablePaidAmount, 10);
  assert.equal(audit.paidActionAdded, 4); assert.equal(audit.specialAdded, 1);
  assert.deepEqual(hand.session.outcomePools.buckets[0], {paidAction: 4, special: 1});
});

test('qualified special payouts consume only their saved bucket once and folds preserve the reserved award', () => {
  for (const [tier, award] of [['royal', 2000], ['straightFlush', 500], ['quads', 200]]) {
    const config = winningConfig({initialSpecialPools: [award, 30, 40], specialUseChance: 1});
    const hand = startHand(quick(config, 5));
    assert.equal(hand.outcomeDecision.qualification.tier, tier);
    const folded = cloneHand(hand); applyAction(folded, 'fold');
    assert.equal(folded.result.jackpot, null); assert.equal(folded.session.outcomePools.buckets[0].special, award);
    assert.equal(hand.session.outcomePools.buckets[0].special, award, 'unselected fold clone does not mutate the live hand');
    passive(hand);
    assert.equal(hand.result.jackpot.tier, tier); assert.equal(hand.result.player.jackpotAward, award);
    assert.equal(hand.result.outcomePoolAudit.specialAward, award);
    near(hand.session.outcomePools.buckets[0].special, hand.result.outcomePoolAudit.specialAdded);
    assert.deepEqual(hand.session.outcomePools.buckets.slice(1), [{paidAction: 0, special: 30}, {paidAction: 0, special: 40}]);
    const settled = snapshot(hand.session); assert.throws(() => applyAction(hand, 'check'), /合法分支/);
    assert.deepEqual(snapshot(hand.session), settled);
    near(hand.result.player.stackAfter + hand.result.npc.stackAfter + hand.result.fee,
      hand.result.player.stackBefore + hand.result.npc.stackBefore + award);
  }
});

test('settled pools and transaction IDs persist through next hands and restoration into a new session', () => {
  const config = winningConfig(), session = quick(config, 0), first = startHand(session);
  applyAction(first, 'raise'); applyAction(first, 'fold');
  const prior = structuredClone(session.outcomePools); assert.equal(prior.handSequence, 1);
  const priorAudit = structuredClone(first.result.outcomePoolAudit);
  syncOpponentBankroll(session);
  const next = startHand(session); assert.deepEqual(poolState(next.outcomePoolsBefore), poolState(prior)); assert.equal(next.outcomeHandId, '2');
  assert.deepEqual(first.result.outcomePoolAudit, priorAudit, 'compacting next-hand snapshots preserves the original result audit');
  applyAction(next, 'fold'); assert.equal(session.outcomePools.handSequence, 2);
  const persisted = structuredClone(session.outcomePools), restored = quick(config, 9, {outcomePools: persisted});
  assert.deepEqual(restored.outcomePools, persisted); assert.notEqual(restored.outcomePools, persisted);
  const third = startHand(restored); assert.equal(third.outcomeHandId, '3');
  assert.deepEqual(poolState(third.outcomePoolsBefore), poolState(persisted));
  applyAction(third, 'fold'); assert.equal(restored.outcomePools.handSequence, 3);
  assert.deepEqual(session.outcomePools, persisted);
});

test('new random-blind sessions remain reproducible and fixed BOSS probabilities ignore private cards', () => {
  const left = startHand(quick({}, 3, {firstSmallBlind: 'random'}));
  const right = startHand(quick({}, 3, {firstSmallBlind: 'random'}));
  assert.equal(left.smallBlind, right.smallBlind); assert.deepEqual(left.holes, right.holes);
  assert.equal(left.rng.state(), right.rng.state());
  const candidate = cloneHand(left);
  if (candidate.actor === 'player') applyAction(candidate, 'raise');
  const distribution = getActionDistribution(candidate);
  candidate.holes.npc = ['As', 'Ah']; candidate.holes.player = ['2c', '3d'];
  assert.deepEqual(getActionDistribution(candidate), distribution);
});
