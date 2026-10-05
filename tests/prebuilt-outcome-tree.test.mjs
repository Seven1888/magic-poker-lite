import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession, startHand, cloneHand, legalActions, applyAction, createRng, compareHands} from '../src/engine.mjs';
import {OutcomeTreeBuildError, buildOutcomeTargetPlan, buildPrebuiltOutcomeTree,
  validateOutcomeLayout, lookupPrebuiltOutcomeTransition} from '../src/prebuilt-outcome-tree.mjs';

const natural = {rerollMode: 'unpaired', rerollChance: 0, maxRerolls: 0, manual: []};
const layout = {player: ['As', 'Ad'], board: ['2c', '3d', '7h', '9s', 'Jc'],
  boss: {win: ['Ks', 'Kd'], nonWin: ['Js', 'Jd']}};
const tieLayout = {player: ['2c', '3d'], board: ['As', 'Ks', 'Qs', 'Js', 'Ts'],
  boss: {nonWin: ['4c', '5d']}};
const callbacks = {cloneHand, legalActions, applyActionRaw: applyAction};
const fresh = () => startHand(createSession({bigBlind: 10, minBuyIn: 50, buyIn: 50,
  outcome: {mode: 'legacy-deck'},
  betSize: {preflop: 10, flop: 20, turn: 40, river: 40}, jackpotEnabled: true,
  deal: {player: natural, npc: natural}}, 41052));
const inputs = (extra = {}) => ({hand: fresh(), rng: createRng('result-plan'), rootWinProbability: 0,
  paidConversionProbability: () => 0.4, ...callbacks, ...extra});
const build = (extra = {}) => buildPrebuiltOutcomeTree({...inputs(), createLayout: () => layout, ...extra});
const snapshot = hand => ({json: JSON.stringify(hand), rng: hand.rng.state()});

test('probabilities and pure engine callbacks are explicit; invalid values never silently choose an economic rule', () => {
  assert.throws(() => buildOutcomeTargetPlan({...inputs(), rootWinProbability: undefined}), /rootWinProbability/);
  assert.throws(() => buildOutcomeTargetPlan({...inputs(), paidConversionProbability: undefined}), /paidConversionProbability/);
  for (const value of [-0.1, 1.1, NaN, Infinity, '0.5']) {
    assert.throws(() => buildOutcomeTargetPlan({...inputs(), rootWinProbability: value}), /rootWinProbability/);
    assert.throws(() => buildOutcomeTargetPlan({...inputs(), paidConversionProbability: () => value}), /paidConversionProbability/);
  }
  assert.throws(() => buildOutcomeTargetPlan({...inputs(), rng: Math.random}), /clone/);
  assert.throws(() => buildOutcomeTargetPlan({...inputs(), cloneHand: hand => hand}), /隔離/);
  assert.throws(() => buildOutcomeTargetPlan({...inputs(), stateLimit: 0}), /正整數/);
  assert.throws(() => buildPrebuiltOutcomeTree({...inputs(), createLayout: () => layout, maxLayoutAttempts: 0}), /正整數/);
  const published = fresh(); published.board = ['2c', '3d', '7h'];
  assert.throws(() => buildOutcomeTargetPlan({...inputs(), hand: published}), /尚未公開/);
});

test('the complete target plan draws only the root and paid player actions after nonWin', () => {
  let calls = 0;
  const plan = buildOutcomeTargetPlan(inputs({paidConversionProbability: ({hand, action, previousTarget}) => {
    calls++;
    assert.equal(hand.actor, 'player'); assert.equal(previousTarget, 'nonWin');
    assert.ok(action.amount > 0); assert.ok(['call', 'bet', 'raise'].includes(action.type));
    return 0.4;
  }}));
  assert.equal(plan.complete, true);
  assert.equal(plan.statistics.paidDraws, calls);
  assert.equal(plan.nodes.filter(node => !node.decision.inherited).length, calls + 1);
  assert.deepEqual(plan.requiredTargets, ['win', 'nonWin']);
  const byId = new Map(plan.nodes.map(node => [node.id, node]));
  let free = 0, boss = 0, winningPaid = 0;
  for (const node of plan.nodes) {
    if (!node.parentId) continue;
    const parent = byId.get(node.parentId), action = node.incoming;
    if (action.type === 'fold') {
      assert.equal(node.terminal, true);
      assert.equal(node.forcedWinner, action.actor === 'player' ? 'npc' : 'player');
    } else if (action.actor === 'npc') {
      boss++; assert.equal(node.target, parent.target); assert.equal(node.decision.roll, null);
    } else if (!action.amount) {
      free++; assert.equal(node.target, parent.target); assert.equal(node.decision.roll, null);
    } else if (parent.target === 'win') {
      winningPaid++; assert.equal(node.target, 'win'); assert.equal(node.decision.kind, 'paid-win');
    } else {
      assert.equal(node.decision.kind, 'paid'); assert.equal(typeof node.decision.roll, 'number');
    }
  }
  assert.ok(free > 0 && boss > 0 && winningPaid > 0);
});

test('a winning root never calls the paid-conversion callback, including future paid raises', () => {
  const tree = build({rootWinProbability: 1, paidConversionProbability: () => {
    throw new Error('must not draw after win');
  }, createLayout: ({requiredTargets}) => {
    assert.deepEqual(requiredTargets, ['win']);
    return {...layout, boss: {win: layout.boss.win}};
  }});
  assert.equal(tree.statistics.paidDraws, 0);
  assert.ok(tree.statistics.paidWinInheritances > 0);
  assert.ok(tree.nodes.every(node => node.target === 'win'));
  const folded = lookupPrebuiltOutcomeTransition(tree, tree.rootId, 'fold').node;
  assert.equal(folded.target, 'win'); assert.equal(folded.state.result.winner, 'npc');
  assert.equal(folded.state.result.reason, 'fold');
});

test('layouts validate real poker outcomes, permit ties for nonWin, and do not constrain counterfactual overlap', () => {
  assert.deepEqual(validateOutcomeLayout(layout).player, layout.player);
  const tie = validateOutcomeLayout(tieLayout, {requiredTargets: ['nonWin']});
  assert.equal(tie.comparisons.nonWin, 0);
  assert.throws(() => validateOutcomeLayout({...layout, boss: {...layout.boss, win: layout.boss.nonWin}}), /預定目標/);
  assert.throws(() => validateOutcomeLayout({...layout, boss: {...layout.boss, nonWin: ['As', 'Js']}}), /重複/);
  const overlapping = {...layout, boss: {win: ['Kd', '2d'], nonWin: ['Jd', '2d']}};
  assert.doesNotThrow(() => validateOutcomeLayout(overlapping));
  assert.throws(() => validateOutcomeLayout({...layout, player: ['As', 'As']}), /重複/);
});

test('every materialized branch has fixed public cards, correct showdown/fold results and conserved money', () => {
  const tree = build({paidConversionProbability: ({hand, action}) =>
    Number(hand.street === 'preflop' && action.type === 'raise')});
  assert.equal(tree.complete, true); assert.equal(tree.mode, 'prebuilt-outcome-tree');
  let playerFolds = 0, bossFolds = 0, wins = 0, losses = 0;
  for (const node of tree.nodes) {
    const hand = node.state;
    assert.deepEqual(hand.holes.player, layout.player);
    assert.deepEqual(hand.board, layout.board.slice(0, hand.board.length));
    assert.deepEqual(hand.deck.slice(0, 5 - hand.board.length), layout.board.slice(hand.board.length));
    assert.equal(new Set([...hand.holes.player, ...hand.holes.npc, ...hand.board, ...hand.deck]).size, 52);
    if (!node.terminal) continue;
    const r = hand.result;
    assert.ok(Math.abs(r.player.stackAfter + r.npc.stackAfter + r.fee
      - r.player.stackBefore - r.npc.stackBefore - r.player.jackpotAward) < 1e-6);
    if (node.forcedWinner) {
      assert.equal(r.winner, node.forcedWinner);
      if (r.folded === 'player') playerFolds++; else bossFolds++;
      continue;
    }
    assert.equal(hand.board.length, 5);
    const actual = compareHands([...hand.holes.player, ...hand.board], [...hand.holes.npc, ...hand.board]);
    if (node.target === 'win') { wins++; assert.ok(actual > 0); assert.equal(r.winner, 'player'); }
    else { losses++; assert.ok(actual <= 0); assert.ok(['npc', 'tie'].includes(r.winner)); }
  }
  assert.ok(playerFolds > 0 && bossFolds > 0 && wins > 0 && losses > 0);
});

test('tie layouts preserve normal split-pot settlement, without rewriting nonWin into a forced loss', () => {
  const tree = build({paidConversionProbability: () => 0, createLayout: () => tieLayout});
  const showdowns = tree.nodes.filter(node => node.terminal && !node.forcedWinner);
  assert.ok(showdowns.length > 0);
  for (const node of showdowns) {
    assert.equal(node.state.result.winner, 'tie');
    assert.equal(node.state.result.player.gross, node.state.result.npc.gross);
    assert.equal(node.target, 'nonWin');
  }
});

test('layout retries occur after all target draws and never redraw the target plan', () => {
  const finalCallCount = buildOutcomeTargetPlan(inputs()).statistics.paidDraws;
  let calls = 0, attempts = 0;
  const first = build({paidConversionProbability: () => { calls++; return 0.4; }, createLayout: ({attempt, rng}) => {
    assert.equal(calls, finalCallCount);
    attempts++; rng();
    if (attempt === 1) return null;
    if (attempt === 2) return {...layout, boss: {...layout.boss, win: layout.boss.nonWin}};
    return layout;
  }});
  function decisions(tree) { return tree.nodes.map(({id, target, decision}) => ({id, target, decision})); }
  assert.equal(calls, finalCallCount); assert.equal(attempts, 3);
  const once = build();
  assert.deepEqual(decisions(first), decisions(once));
  assert.equal(first.meta.rngStateAfterPlanning, once.meta.rngStateAfterPlanning);
  assert.notEqual(first.meta.rngStateAfterBuild, once.meta.rngStateAfterBuild);
});

test('successful and failed builds never mutate the input hand/session/config/history/RNG', () => {
  const hand = fresh(), rng = createRng('isolation'), before = snapshot(hand), beforeRng = rng.state();
  const opts = {...inputs(), hand, rng, paidConversionProbability: ({hand: candidate}) => {
    candidate.config.buyIn = -100;
    candidate.history[0].amount = -100;
    candidate.session.fees = -100;
    return 0.4;
  }};
  const result = buildPrebuiltOutcomeTree({...opts, createLayout: ({hand: candidate, rng: local}) => {
    candidate.config.buyIn = -200; candidate.history[0].amount = -200; local();
    return layout;
  }});
  assert.deepEqual(snapshot(hand), before); assert.equal(rng.state(), beforeRng);
  assert.notEqual(result.rngAfterBuild.state(), beforeRng);
  assert.throws(() => buildPrebuiltOutcomeTree({...opts, maxLayoutAttempts: 2,
    createLayout: ({rng: local}) => { local(); return null; }}), error => {
    assert.ok(error instanceof OutcomeTreeBuildError); assert.equal(error.code, 'LAYOUT_LIMIT');
    assert.equal(error.details.attempts, 2); return true;
  });
  assert.deepEqual(snapshot(hand), before); assert.equal(rng.state(), beforeRng);
  assert.throws(() => buildOutcomeTargetPlan({...opts, stateLimit: 1}), error => error.code === 'STATE_LIMIT');
  assert.deepEqual(snapshot(hand), before); assert.equal(rng.state(), beforeRng);
});

test('unexpected action RNG and mismatched settlement fail atomically instead of accepting an incomplete tree', () => {
  const hand = fresh(), before = snapshot(hand);
  assert.throws(() => buildOutcomeTargetPlan({...inputs(), hand,
    applyActionRaw: (candidate, action) => { candidate.rng(); applyAction(candidate, action); }}),
  error => error.code === 'RAW_ACTION_RNG');
  assert.deepEqual(snapshot(hand), before);
  assert.throws(() => build({applyActionRaw: (candidate, action) => {
    applyAction(candidate, action);
    if (candidate.result?.reason === 'showdown') candidate.result.winner = 'invalid';
  }}), error => error.code === 'SETTLEMENT_TARGET_MISMATCH');
});

test('runtime transitions only read stored nodes and consume no RNG or callbacks', () => {
  let layoutCalls = 0, paidCalls = 0;
  const tree = build({paidConversionProbability: () => { paidCalls++; return 0.4; },
    createLayout: () => { layoutCalls++; return layout; }});
  const before = {layoutCalls, paidCalls, rng: tree.rngAfterBuild.state()};
  let current = tree.nodes[0];
  while (!current.terminal) {
    const edge = current.edges.find(item => ['call', 'check'].includes(item.type));
    const next = lookupPrebuiltOutcomeTransition(tree, current.id, edge.type);
    assert.equal(next.node, tree.nodes.find(item => item.id === edge.childId));
    current = next.node;
  }
  assert.deepEqual({layoutCalls, paidCalls, rng: tree.rngAfterBuild.state()}, before);
  assert.throws(() => lookupPrebuiltOutcomeTransition(tree, current.id, 'call'), /合法分支/);
  assert.throws(() => lookupPrebuiltOutcomeTransition(tree, 'absent', 'call'), /未知/);
  assert.throws(() => lookupPrebuiltOutcomeTransition({...tree, complete: false}, tree.rootId, 'call'), /已完成/);
});

test('pool callbacks run on every paid player action, including win, and inherit isolated branch metadata', () => {
  const calls = [], callbackRngs = [];
  const tree = build({rootWinProbability: undefined, paidConversionProbability: undefined,
    drawRootOutcome: ({hand, rng}) => {
      assert.equal(hand.board.length, 0); callbackRngs.push(rng);
      return {target: 'win', inherited: false, poolBranch: {paid: 10, pendingCredits: [], ledger: [{amount: 1}]},
        qualification: {tier: 'quads', nested: {source: 'root'}}};
    },
    drawPaidOutcome: ({hand, action, previousDecision, nodeId, rng}) => {
      callbackRngs.push(rng); calls.push({nodeId, amount: action.amount});
      assert.equal(hand.actor, 'player'); assert.equal(previousDecision.target, 'win');
      const before = previousDecision.poolBranch.paid;
      const decision = {target: 'win', inherited: true, roll: null, poolBefore: {paid: before},
        poolBranch: {...previousDecision.poolBranch, paid: before + action.amount,
          pendingCredits: [...previousDecision.poolBranch.pendingCredits, action.amount]},
        qualification: previousDecision.qualification};
      previousDecision.poolBranch.ledger[0].amount = 500;
      return decision;
    }});
  const paid = tree.nodes.filter(node => node.incoming?.actor === 'player'
    && ['call', 'bet', 'raise'].includes(node.incoming.type) && node.incoming.amount > 0);
  assert.equal(calls.length, paid.length); assert.ok(calls.length > 0);
  assert.equal(tree.statistics.paidDecisions, calls.length); assert.equal(tree.statistics.paidDraws, 0);
  assert.equal(new Set(callbackRngs).size, callbackRngs.length);
  assert.equal(tree.nodes[0].decision.poolBranch.ledger[0].amount, 1);
  assert.equal(tree.meta.rngStateBefore, tree.meta.rngStateAfterPlanning);
  const byId = new Map(tree.nodes.map(node => [node.id, node]));
  for (const node of tree.nodes) {
    assert.notEqual(node.decision.poolBranch, node.state.outcomeDecision.poolBranch);
    assert.deepEqual(node.state.outcomeDecision, node.decision);
    if (!node.parentId) continue;
    const parent = byId.get(node.parentId);
    assert.notEqual(node.decision.poolBranch, parent.decision.poolBranch);
    assert.notEqual(node.decision.qualification, parent.decision.qualification);
    if (!paid.includes(node)) assert.deepEqual(node.decision.poolBranch, parent.decision.poolBranch);
    else assert.equal(node.decision.poolBefore.paid, parent.decision.poolBranch.paid);
    assert.deepEqual(node.state.board, layout.board.slice(0, node.state.board.length));
  }
});

test('pool target decisions finish before layout, persist across retries, and never commit unchosen branches', () => {
  const pool = {paid: 11, pendingCredits: [], ledger: []}, paidCalls = [];
  const drawRootOutcome = ({rng}) => ({target: 'nonWin', roll: rng(), poolBranch: pool});
  const drawPaidOutcome = ({action, previousDecision, nodeId, rng}) => {
    paidCalls.push(nodeId);
    return {target: 'win', roll: previousDecision.target === 'win' ? null : rng(),
      inherited: previousDecision.target === 'win', poolBranch: {paid: previousDecision.poolBranch.paid + action.amount,
        pendingCredits: [...previousDecision.poolBranch.pendingCredits, action.amount], ledger: []}};
  };
  let countAtLayout = null;
  const tree = build({drawRootOutcome, drawPaidOutcome, createLayout: ({attempt, plan}) => {
    countAtLayout ??= paidCalls.length; assert.equal(paidCalls.length, countAtLayout);
    assert.equal(plan.nodes[0].decision.poolBranch.paid, 11);
    plan.nodes[0].decision.poolBranch.paid = 9999;
    return attempt < 3 ? null : layout;
  }});
  assert.equal(tree.statistics.layoutAttempts, 3);
  assert.deepEqual(pool, {paid: 11, pendingCredits: [], ledger: []});
  assert.equal(tree.nodes[0].decision.poolBranch.paid, 11);
  const folded = lookupPrebuiltOutcomeTransition(tree, tree.rootId, 'fold').node;
  assert.deepEqual(folded.decision.poolBranch, pool);
  const paid = lookupPrebuiltOutcomeTransition(tree, tree.rootId, 'call').node;
  assert.ok(paid.decision.poolBranch.paid > folded.decision.poolBranch.paid);
  paid.decision.poolBranch.pendingCredits.push(-1);
  assert.deepEqual(folded.decision.poolBranch.pendingCredits, []);
  assert.deepEqual(paid.state.outcomeDecision.poolBranch.pendingCredits, [5]);
});

test('callback target contracts fail atomically and raw settlement receives each node decision', () => {
  assert.throws(() => buildOutcomeTargetPlan({...inputs(), drawRootOutcome: () => ({target: 'win'})}), /drawPaidOutcome/);
  assert.throws(() => buildOutcomeTargetPlan({...inputs(), drawRootOutcome: () => ({target: 'bad'}),
    drawPaidOutcome: () => ({target: 'win'})}), error => error.code === 'INVALID_DECISION');
  assert.throws(() => buildOutcomeTargetPlan({...inputs(), drawRootOutcome: () => ({target: 'win'}),
    drawPaidOutcome: () => ({target: 'nonWin'})}), error => error.code === 'WIN_INHERITANCE');
  let settled = 0;
  const hand = fresh();
  hand.history.push({type: 'deal', actor: 'player', cards: [...hand.holes.player]});
  const before = snapshot(hand);
  const tree = build({hand, drawRootOutcome: () => ({target: 'win', poolBranch: {paid: 1}}),
    drawPaidOutcome: ({previousDecision}) => ({...previousDecision, inherited: true}),
    applyActionRaw: (candidate, type) => {
      assert.equal(candidate.outcomeDecision.target, 'win');
      applyAction(candidate, type);
      if (candidate.status === 'settled') settled++;
    }});
  assert.ok(settled > 0); assert.deepEqual(snapshot(hand), before);
  for (const node of tree.nodes) assert.deepEqual(node.state.history.find(event => event.type === 'deal').cards, layout.player);
});

test('trusted engine clones preserve exact trees and RNG while external callback data stays isolated', () => {
  const ordinary = build(), trusted = build({trustedInternalClone: true});
  assert.deepEqual(JSON.parse(JSON.stringify(trusted)), JSON.parse(JSON.stringify(ordinary)));
  assert.equal(trusted.rngAfterBuild.state(), ordinary.rngAfterBuild.state());
  const hand = fresh(), before = snapshot(hand);
  const tree = build({hand, trustedInternalClone: true, paidConversionProbability: ({hand: candidate}) => {
    candidate.config.buyIn = -123; candidate.config.betSize.flop = -123;
    candidate.history[0].amount = -123; candidate.dealAudit.player.rerolls = -123;
    return 0.4;
  }, createLayout: ({hand: candidate, plan}) => {
    candidate.config.buyIn = -456; plan.nodes[0].decision.target = 'invalid';
    return layout;
  }});
  assert.deepEqual(snapshot(hand), before);
  for (const node of tree.nodes) {
    assert.ok(node.state.config.buyIn > 0); assert.ok(node.state.config.betSize.flop > 0);
    assert.ok(node.state.history[0].amount > 0); assert.ok(node.state.dealAudit.player.rerolls >= 0);
  }
});
