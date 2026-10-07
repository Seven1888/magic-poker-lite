import {makeDeck, normalizeCard, evaluateBest, compareRanks} from './poker.mjs?v=54';

const TARGETS = ['win', 'nonWin'];
const ACTIONS = ['fold', 'check', 'call', 'bet', 'raise'];
const PAID_ACTIONS = new Set(['call', 'bet', 'raise']);

/** A build error never authorizes publication of a partial tree. */
export class OutcomeTreeBuildError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'OutcomeTreeBuildError';
    this.code = code;
    this.details = details;
  }
}

function fail(message, code, details) {
  throw new OutcomeTreeBuildError(message, code, details);
}

function probability(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(label + ' 必須明確指定為 0 至 1 的有限數值。');
  }
  return value;
}

function positiveLimit(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(label + ' 必須為正整數。');
  return value;
}

function requireFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError(label + ' 必須為函式。');
}

// Clone data nested inside engine.cloneHand as well: its configuration, history
// entries and deal audit are otherwise shared with the caller. RNG functions
// are cloned separately by cloneHand; this helper never calls them.
function copyData(value, seen = new Map()) {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);
  const result = Array.isArray(value) ? [] : {};
  seen.set(value, result);
  for (const [key, item] of Object.entries(value)) result[key] = copyData(item, seen);
  return result;
}

function isolatedHand(hand, cloneHand, trustedInternalClone = false) {
  const clone = cloneHand(hand);
  if (!clone || clone === hand || clone.session === hand.session || clone.stacks === hand.stacks
    || clone.rng === hand.rng) {
    throw new TypeError('cloneHand 必須隔離 hand、session、stacks 與 RNG。');
  }
  return trustedInternalClone ? clone : copyData(clone);
}

function cloneRng(rng) {
  if (typeof rng !== 'function' || typeof rng.clone !== 'function' || typeof rng.state !== 'function') {
    throw new TypeError('rng 必須提供 clone() 與 state()。');
  }
  const clone = rng.clone();
  if (clone === rng || typeof clone !== 'function' || typeof clone.clone !== 'function'
    || typeof clone.state !== 'function') throw new TypeError('rng.clone() 必須回傳獨立 RNG。');
  return clone;
}

function drawTarget(rng, chance, kind, previousTarget = null) {
  const roll = rng();
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new RangeError('RNG 抽樣必須介於 0（含）與 1（不含）。');
  return {kind, previousTarget, target: roll < chance ? 'win' : 'nonWin', probability: chance, roll, inherited: false};
}

function inheritedTarget(previousDecision, kind) {
  const target = previousDecision.target;
  return {...copyData(previousDecision), kind, previousTarget: target, target,
    probability: null, roll: null, inherited: true};
}

function callbackDecision(value, kind, previousTarget = null) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !TARGETS.includes(value.target)) {
    fail('結果 callback 必須回傳帶有 win/nonWin target 的 decision。', 'INVALID_DECISION');
  }
  if (previousTarget === 'win' && value.target !== 'win') {
    fail('付費操作不得把已贏節點改成未贏。', 'WIN_INHERITANCE');
  }
  return {kind, previousTarget, probability: null, roll: null, inherited: false, ...copyData(value)};
}

function actionsFor(hand, legalActions) {
  const actions = legalActions(hand).map(action => ({...action}));
  if (!actions.length || actions.some(action => !ACTIONS.includes(action.type)
    || !Number.isFinite(action.amount) || action.amount < 0)
    || new Set(actions.map(action => action.type)).size !== actions.length) {
    fail('未結算節點的合法動作不完整或不唯一。', 'INVALID_ACTIONS');
  }
  return actions;
}

function applyWithoutRng(hand, type, applyActionRaw) {
  const before = hand.rng.state();
  applyActionRaw(hand, type);
  if (hand.rng.state() !== before) fail('applyActionRaw 不得抽樣或消耗牌局 RNG。', 'RAW_ACTION_RNG');
}

/**
 * Plan every target before selecting any unpublished layout. There are no
 * default result probabilities or implicit budget rules. The supplied money
 * hand has posted blinds and must still be unpublished (empty board).
 * New pool callbacks receive isolated hands, decisions and RNG cursors. Every
 * paid player action calls drawPaidOutcome, including a previously won node.
 * The legacy probability callbacks remain available without implicit pools.
 */
export function buildOutcomeTargetPlan({hand, rng, rootWinProbability, paidConversionProbability, drawRootOutcome, drawPaidOutcome,
  cloneHand, legalActions, applyActionRaw, stateLimit = 10000, trustedInternalClone = false} = {}) {
  if (typeof trustedInternalClone !== 'boolean') throw new TypeError('trustedInternalClone 必須為布林值。');
  const decisionCallbacks = drawRootOutcome !== undefined || drawPaidOutcome !== undefined;
  if (decisionCallbacks) {
    requireFunction(drawRootOutcome, 'drawRootOutcome');
    requireFunction(drawPaidOutcome, 'drawPaidOutcome');
  } else {
    probability(rootWinProbability, 'rootWinProbability');
    requireFunction(paidConversionProbability, 'paidConversionProbability');
  }
  requireFunction(cloneHand, 'cloneHand');
  requireFunction(legalActions, 'legalActions');
  requireFunction(applyActionRaw, 'applyActionRaw');
  positiveLimit(stateLimit, 'stateLimit');
  if (!hand || hand.status !== 'playing' || !Array.isArray(hand.board) || hand.board.length) {
    throw new TypeError('建樹須使用尚未公開公共牌且未結算的開局 hand。');
  }
  let workingRng = cloneRng(rng);
  const root = isolatedHand(hand, cloneHand);
  const nodes = [];
  const statistics = {nodes: 0, terminalNodes: 0, rootDraws: 0, paidDraws: 0, paidDecisions: 0,
    paidWinInheritances: 0, freeInheritances: 0, bossInheritances: 0, foldOverrides: 0};
  let rootDecision;
  if (decisionCallbacks) {
    const callbackRng = cloneRng(workingRng);
    rootDecision = callbackDecision(drawRootOutcome({hand: isolatedHand(root, cloneHand), rng: callbackRng}), 'root');
    workingRng = cloneRng(callbackRng);
  } else rootDecision = drawTarget(workingRng, rootWinProbability, 'root');
  statistics.rootDraws = Number.isFinite(rootDecision.roll) ? 1 : 0;
  root.outcomeDecision = copyData(rootDecision);
  root.outcomePlanning = true;

  function visit(state, parentId, incoming, decision, forcedWinner = null) {
    if (nodes.length >= stateLimit) fail('完整結果樹超過節點上限；未產生截斷結果。', 'STATE_LIMIT', {stateLimit});
    if (!['playing', 'settled'].includes(state.status)) fail('分支含未知牌局狀態。', 'INVALID_STATE');
    const node = {id: 'n' + nodes.length, parentId, incoming, actor: state.actor, street: state.street,
      terminal: state.status === 'settled', target: decision.target, decision: copyData(decision), forcedWinner, edges: []};
    nodes.push(node);
    if (node.terminal) {
      statistics.terminalNodes++;
      return node;
    }
    for (const action of actionsFor(state, legalActions)) {
      const actor = state.actor;
      let childDecision;
      let winner = null;
      if (action.type === 'fold') {
        childDecision = inheritedTarget(node.decision, 'fold');
        winner = actor === 'player' ? 'npc' : 'player';
        statistics.foldOverrides++;
      } else if (actor === 'npc') {
        childDecision = inheritedTarget(node.decision, 'boss');
        statistics.bossInheritances++;
      } else if (actor === 'player' && PAID_ACTIONS.has(action.type) && action.amount > 0) {
        statistics.paidDecisions++;
        if (decisionCallbacks) {
          const callbackRng = cloneRng(workingRng);
          childDecision = callbackDecision(drawPaidOutcome({hand: isolatedHand(state, cloneHand),
            action: {...action}, previousDecision: copyData(node.decision), nodeId: node.id, rng: callbackRng}),
          node.target === 'win' ? 'paid-win' : 'paid', node.target);
          workingRng = cloneRng(callbackRng);
          if (node.target === 'win') statistics.paidWinInheritances++;
          if (Number.isFinite(childDecision.roll)) statistics.paidDraws++;
        } else if (node.target === 'win') {
          childDecision = inheritedTarget(node.decision, 'paid-win');
          statistics.paidWinInheritances++;
        } else {
          const chance = probability(paidConversionProbability({hand: isolatedHand(state, cloneHand),
            action: {...action}, previousTarget: node.target, nodeId: node.id}), 'paidConversionProbability');
          childDecision = drawTarget(workingRng, chance, 'paid', node.target);
          statistics.paidDraws++;
        }
      } else {
        childDecision = inheritedTarget(node.decision, 'free');
        statistics.freeInheritances++;
      }
      const next = isolatedHand(state, cloneHand, trustedInternalClone);
      next.outcomeDecision = copyData(childDecision);
      next.outcomePlanning = true;
      applyWithoutRng(next, action.type, applyActionRaw);
      const incomingAction = {...action, actor, street: state.street};
      const child = visit(next, node.id, incomingAction, childDecision, winner);
      node.edges.push({...action, actor, childId: child.id});
    }
    return node;
  }

  const rootNode = visit(root, null, null, rootDecision);
  statistics.nodes = nodes.length;
  return {version: 1, mode: 'prebuilt-outcome-target-plan', complete: true, rootId: rootNode.id, nodes,
    requiredTargets: TARGETS.filter(target => nodes.some(node => node.target === target)), statistics,
    rngStateBefore: rng.state(), rngStateAfterPlanning: workingRng.state(), rngAfterPlanning: workingRng.clone()};
}

function cardGroup(value, length, label) {
  if (!Array.isArray(value) || value.length !== length) throw new TypeError(label + ' 牌數錯誤。');
  return value.map(normalizeCard);
}

/** Validate each counterfactual branch separately; boss alternatives may overlap. */
export function validateOutcomeLayout(input, {requiredTargets = TARGETS} = {}) {
  if (!input || !Array.isArray(requiredTargets) || !requiredTargets.length
    || requiredTargets.some(target => !TARGETS.includes(target))) throw new TypeError('布局與目標集合無效。');
  const player = cardGroup(input.player, 2, 'player');
  const board = cardGroup(input.board, 5, 'board');
  const fixed = [...player, ...board];
  if (new Set(fixed).size !== fixed.length) throw new Error('玩家牌與公牌不可重複。');
  const playerRank = evaluateBest(fixed).rank;
  const boss = {}, comparisons = {};
  for (const target of requiredTargets) {
    boss[target] = cardGroup(input.boss?.[target], 2, 'boss.' + target);
    const cards = [...fixed, ...boss[target]];
    if (new Set(cards).size !== cards.length) throw new Error('布局分支含重複牌：' + target);
    const comparison = compareRanks(playerRank, evaluateBest([...boss[target], ...board]).rank);
    if (target === 'win' ? comparison <= 0 : comparison > 0) throw new Error('布局不符合預定目標：' + target);
    comparisons[target] = comparison;
  }
  const deckOrder = input.deckOrder === undefined
    ? makeDeck().filter(card => !fixed.includes(card)) : cardGroup(input.deckOrder, 45, 'deckOrder');
  if (new Set(deckOrder).size !== 45 || deckOrder.some(card => fixed.includes(card))) {
    throw new Error('布局剩餘牌序必須是玩家牌與完整公牌以外的 45 張唯一牌。');
  }
  return {player, board, boss, comparisons, deckOrder,
    ...(input.dealAudit ? {dealAudit: copyData(input.dealAudit)} : {}),
    ...(input.qualification ? {qualification: copyData(input.qualification)} : {})};
}

function installLayout(state, layout, decision) {
  delete state.outcomePlanning;
  const target = decision.target;
  const revealed = state.board.length;
  if (![0, 3, 4, 5].includes(revealed)) fail('公牌公開張數無效。', 'INVALID_BOARD');
  state.holes = {player: [...layout.player], npc: [...layout.boss[target]]};
  state.outcomeDecision = copyData(decision);
  state.board = layout.board.slice(0, revealed);
  const reserved = new Set([...layout.player, ...layout.board, ...layout.boss[target]]);
  state.deck = [...layout.board.slice(revealed), ...layout.deckOrder.filter(card => !reserved.has(card))];
  if (layout.dealAudit) state.dealAudit = {player: copyData(layout.dealAudit.player),
    npc: copyData(layout.dealAudit.npcByTarget[target])};
  // Only real replayed reveals survive. Placeholder opening deal records must
  // name the final layout, never the private temporary cards used for planning.
  for (const event of state.history || []) {
    if (['deal', 'hole-deal', 'dealHoles'].includes(event.type)) {
      if (event.actor === 'player' || event.actor === 'npc') {
        if (event.cards) event.cards = [...state.holes[event.actor]];
        if (event.holes) event.holes = [...state.holes[event.actor]];
      } else if (event.holes) event.holes = copyData(state.holes);
    }
  }
}

function materialize(plan, hand, layout, {cloneHand, legalActions, applyActionRaw, trustedInternalClone = false}) {
  const states = new Map();
  const nodes = [];
  for (const planned of plan.nodes) {
    // The root always owns a private config. Trusted engine-only descendants
    // may share that immutable config; public callbacks still get deep copies.
    const state = isolatedHand(planned.parentId === null ? hand : states.get(planned.parentId), cloneHand,
      planned.parentId !== null && trustedInternalClone);
    installLayout(state, layout, planned.decision);
    if (planned.incoming) applyWithoutRng(state, planned.incoming.type, applyActionRaw);
    if ((state.status === 'settled') !== planned.terminal || state.actor !== planned.actor || state.street !== planned.street) {
      fail('布局重播與預建下注狀態不同。', 'PLAN_REPLAY_MISMATCH', {nodeId: planned.id});
    }
    if (!planned.terminal) {
      const current = actionsFor(state, legalActions);
      if (JSON.stringify(current.map(({type, amount, to, allIn}) => ({type, amount, to, allIn})))
        !== JSON.stringify(planned.edges.map(({type, amount, to, allIn}) => ({type, amount, to, allIn})))) {
        fail('布局重播與預建合法動作不同。', 'PLAN_REPLAY_MISMATCH', {nodeId: planned.id});
      }
    } else {
      const winner = state.result?.winner;
      if (planned.forcedWinner ? winner !== planned.forcedWinner
        : planned.target === 'win' ? winner !== 'player' : !['npc', 'tie'].includes(winner)) {
        fail('正式結算不符合預建目標或棄牌覆蓋。', 'SETTLEMENT_TARGET_MISMATCH', {nodeId: planned.id});
      }
      if (planned.forcedWinner && state.result?.reason !== 'fold') {
        fail('棄牌節點未依棄牌結算。', 'SETTLEMENT_TARGET_MISMATCH', {nodeId: planned.id});
      }
    }
    states.set(planned.id, state);
    nodes.push({...planned, decision: copyData(planned.decision), edges: planned.edges.map(edge => ({...edge})), state});
  }
  return nodes;
}

/**
 * createLayout({hand, rng, attempt, requiredTargets, plan}) is called only after the
 * complete target plan exists. Return {player:[2], board:[5], boss:{win:[2],
 * nonWin:[2]}} (only required targets are needed), or null to retry. Invalid
 * layouts retry without redrawing any target; thrown callback errors propagate.
 *
 * On success, callers may atomically commit rngAfterBuild and attach a cloned
 * node.state to their live session. No input session, hand or RNG is committed
 * here. The snapshots are private build data, not a public player API.
 */
export function buildPrebuiltOutcomeTree(options = {}) {
  const {hand, rng, cloneHand, legalActions, applyActionRaw, createLayout, maxLayoutAttempts = 100,
    trustedInternalClone = false} = options;
  requireFunction(createLayout, 'createLayout');
  positiveLimit(maxLayoutAttempts, 'maxLayoutAttempts');
  const plan = buildOutcomeTargetPlan(options);
  const workingRng = cloneRng(plan.rngAfterPlanning);
  let lastFailure = null;
  for (let attempt = 1; attempt <= maxLayoutAttempts; attempt++) {
    const input = createLayout({hand: isolatedHand(hand, cloneHand), rng: workingRng, attempt,
      requiredTargets: [...plan.requiredTargets], plan: copyData({rootId: plan.rootId,
        nodes: plan.nodes, statistics: plan.statistics, requiredTargets: plan.requiredTargets})});
    if (input == null) { lastFailure = '布局產生器未找到候選。'; continue; }
    let layout;
    try { layout = validateOutcomeLayout(input, {requiredTargets: plan.requiredTargets}); }
    catch (error) { lastFailure = error.message; continue; }
    const nodes = materialize(plan, hand, layout, {cloneHand, legalActions, applyActionRaw, trustedInternalClone});
    return {version: 1, mode: 'prebuilt-outcome-tree', complete: true, rootId: plan.rootId, nodes, layout,
      statistics: {...plan.statistics, layoutAttempts: attempt},
      meta: {targetBuildTiming: 'all-before-layout', execution: 'stored-node-lookup',
        rngStateBefore: rng.state(), rngStateAfterPlanning: plan.rngStateAfterPlanning,
        rngStateAfterBuild: workingRng.state()}, rngAfterBuild: workingRng.clone()};
  }
  fail('未能建立完整結果樹；尚未公開或提交任何牌局。', 'LAYOUT_LIMIT', {
    attempts: maxLayoutAttempts, targetDraws: plan.statistics.rootDraws + plan.statistics.paidDraws,
    rngStateAfterPlanning: plan.rngStateAfterPlanning, lastFailure});
}

/** Pure lookup: no callbacks, draws, settlement or layout search at execution. */
export function lookupPrebuiltOutcomeTransition(tree, nodeId, requested) {
  if (!tree?.complete || tree.mode !== 'prebuilt-outcome-tree') throw new TypeError('必須使用已完成的結果樹。');
  const node = tree.nodes.find(item => item.id === nodeId);
  if (!node) throw new RangeError('未知結果樹節點。');
  let type = typeof requested === 'string' ? requested : requested?.type;
  if (type === 'allin') type = [...node.edges].reverse().find(edge => edge.allIn)?.type;
  const edge = node.edges.find(item => item.type === type);
  if (!edge) throw new RangeError('此節點沒有指定的合法分支。');
  const next = tree.nodes.find(item => item.id === edge.childId);
  if (!next) throw new Error('完整結果樹遺失目標節點。');
  return {edge, node: next};
}
