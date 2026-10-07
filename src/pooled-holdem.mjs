import {createOutcomeLayout} from './outcome-layout.mjs?v=53';
import {validateOutcomeLayout} from './prebuilt-outcome-tree.mjs?v=53';
import {drawRootPoolOutcome, drawPaidPoolOutcome, applyBranchPools, isSpecialPoolLayout} from './outcome-pools.mjs?v=53';

export const POOLED_HOLDEM_MODEL = 'pooled-holdem-v1';
const PAID = new Set(['call', 'bet', 'raise']);

export class PooledHoldemBuildError extends Error {
  constructor(message, code, details = {}) { super(message); this.name = 'PooledHoldemBuildError'; this.code = code; this.details = details; }
}

/** Install one already constructed private pair; public cards and order never change. */
export function installPooledHoldemLayout(hand) {
  const layout = hand.pooledHoldem?.layout, target = hand.outcomeDecision?.target;
  const revealed = hand.board.length, npc = layout?.boss?.[target];
  if (!layout || !Array.isArray(npc) || npc.length !== 2 || ![0, 3, 4, 5].includes(revealed)) {
    throw new Error('The saved pooled Holdem layout does not contain the selected result.');
  }
  hand.holes = {player: [...layout.player], npc: [...npc]};
  hand.board = layout.board.slice(0, revealed);
  const reserved = new Set([...layout.player, ...layout.board, ...npc]);
  hand.deck = [...layout.board.slice(revealed), ...layout.deckOrder.filter(card => !reserved.has(card))];
  if (layout.dealAudit) hand.dealAudit = {player: structuredClone(layout.dealAudit.player),
    npc: structuredClone(layout.dealAudit.npcByTarget[target])};
}

/**
 * Compact selected-path controller, not an enumerated full action tree.
 * Invoke only on an unpublished isolated hand whose blinds are already posted.
 * Targets are fixed before layout retries; every possible later win pair is
 * built here, so paid actions never search for or redeal cards during play.
 */
export function initializePooledHoldem(hand, {dealHoles}) {
  const decision = drawRootPoolOutcome({hand, rng: hand.rng, pools: hand.outcomePoolsBefore, config: hand.config.outcome});
  const requiredTargets = decision.target === 'win' ? ['win'] : ['win', 'nonWin'];
  let layout = null, layoutAttempts = 0;
  for (let attempt = 1; attempt <= hand.config.outcome.maxLayoutAttempts; attempt++) {
    const candidate = createOutcomeLayout({config: hand.config, rng: hand.rng, requiredTargets, dealHoles,
      firstSeat: hand.smallBlind, qualification: decision.qualification, qualifyLayout: isSpecialPoolLayout});
    if (!candidate) continue;
    layout = validateOutcomeLayout(candidate, {requiredTargets});
    layoutAttempts = attempt;
    break;
  }
  if (!layout) throw new PooledHoldemBuildError('未能建立完整固定牌面；尚未提交任何牌局。', 'LAYOUT_LIMIT',
    {attempts: hand.config.outcome.maxLayoutAttempts, rootTarget: decision.target});
  hand.pooledHoldem = {version: 1, model: POOLED_HOLDEM_MODEL, layout,
    rootTarget: decision.target, layoutAttempts, transitionIndex: 0};
  hand.outcomeDecision = decision;
  installPooledHoldemLayout(hand);
  hand.session.outcomePools = applyBranchPools({pools: hand.outcomePoolsBefore, decision, handId: hand.outcomeHandId});
}

/** A paid draw is performed on an isolated action clone and committed only with its resulting action. */
export function preparePooledHoldemAction(hand, action) {
  if (!hand.pooledHoldem || hand.pooledHoldem.version !== 1 || hand.pooledHoldem.model !== POOLED_HOLDEM_MODEL) {
    throw new Error('Missing pooled Holdem path state.');
  }
  hand.pooledHoldem.transitionIndex++;
  if (hand.actor === 'player' && PAID.has(action.type) && action.amount > 0) {
    hand.outcomeDecision = drawPaidPoolOutcome({hand, action, previousDecision: hand.outcomeDecision,
      rng: hand.rng, config: hand.config.outcome,
      nodeId: `${hand.outcomeHandId}:${hand.pooledHoldem.transitionIndex}:${action.id ?? action.type}`});
    installPooledHoldemLayout(hand);
  }
}
