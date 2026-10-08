import {makeDeck, createRng, shuffle, normalizeCard, evaluateBest, compareRanks, holeScore} from './poker.mjs?v=60';
import {getJackpotAward, classifyJackpot, quoteJackpot} from './jackpot.mjs?v=60';
import {normalizeBossConfig, selectBossProfile, getBossProfileDistribution, lockBossStreetStrength} from './boss-profiles.mjs?v=60';
import {isFixedHoldem, isPooledHoldem, isNaturalHoldem, isHoldemBetting, legalHoldemActions, resolveHoldemAction, markHoldemAction, HOLDEM_SIZE_WEIGHTS, PLAYER_HOLDEM_SIZE_WEIGHTS} from './holdem-betting.mjs?v=60';
import {initializePooledHoldem, preparePooledHoldemAction} from './pooled-holdem.mjs?v=60';
import {NATURAL_HOLDEM_RULES, createNaturalHoldemDeal, assertNaturalHoldemIntegrity, lockNaturalHoldemDeal} from './natural-holdem.mjs?v=60';
import {createBossDecisionView, getNaturalBossDistribution} from './boss-policy.mjs?v=60';
import {assertHandEntryAssets} from './hand-entry.mjs?v=60';
import {DEFAULT_OUTCOME_POOL_CONFIG, normalizeOutcomePoolConfig, createOutcomePools, normalizeOutcomePools, compactOutcomePools, migrateOutcomePoolsWithoutJackpot,
  drawRootPoolOutcome, drawPaidPoolOutcome, applyBranchPools, settleOutcomePools, isSpecialPoolLayout} from './outcome-pools.mjs?v=60';
import {buildPrebuiltOutcomeTree, lookupPrebuiltOutcomeTransition} from './prebuilt-outcome-tree.mjs?v=60';
import {createOutcomeLayout} from './outcome-layout.mjs?v=60';
export {makeDeck, createRng, shuffle, evaluateBest, compareHands, holeScore, normalizeCard} from './poker.mjs?v=60';

const SEATS = ['player', 'npc'];
export const STREETS = ['preflop', 'flop', 'turn', 'river'];
const other = actor => actor === 'player' ? 'npc' : 'player';
const round = number => Math.round((number + Number.EPSILON) * 1e6) / 1e6;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const number = (n, fallback) => Number.isFinite(Number(n)) ? Number(n) : fallback;
const epsilon = 1e-7;
export const DEFAULT_CONFIG = Object.freeze({
  targetRtp: 1, jackpotEnabled: false, smallBlind: 5, bigBlind: 10,
  // Entry transfers 100 small blinds; later hands continue with any positive stack.
  minBuyIn: 500, maxBuyIn: 10000, buyIn: 500,
  betSize: Object.freeze({preflop: 10, flop: 20, turn: 40, river: 40}),
  maxRaises: null, animationMs: 850,
  npc: Object.freeze({fold: 0.2, call: 0.6, raise: 0.2, check: 0.65, bet: 0.35, strengthInfluence: 1, priceInfluence: 0.6}),
  boss: Object.freeze({mode: 'random', profileId: 'caller'}),
  outcome: Object.freeze({mode: 'natural-holdem', ...DEFAULT_OUTCOME_POOL_CONFIG, paidActionBudgetShare: 1, specialUseChance: 0,
    initialPaidActionPools: Object.freeze([0, 0, 0]), initialSpecialPools: Object.freeze([0, 0, 0]),
    initialPaidActionCooldown: 0, stateLimit: 10000, maxLayoutAttempts: 2000}),
  deal: Object.freeze({
    player: Object.freeze({rerollMode: 'unpaired', rerollChance: 0, maxRerolls: 0, manual: Object.freeze([])}),
    npc: Object.freeze({rerollMode: 'unpaired', rerollChance: 0, maxRerolls: 0, manual: Object.freeze([])})
  })
});

/** Explicit historical APIs keep their original money/deal assumptions. */
export const HISTORICAL_DEFAULT_CONFIG = Object.freeze({...DEFAULT_CONFIG, jackpotEnabled: true, minBuyIn: 50, buyIn: 10000, maxRaises: 1,
  boss: Object.freeze({mode: 'rotate', profileId: 'caller'}),
  outcome: Object.freeze({...DEFAULT_CONFIG.outcome, ...DEFAULT_OUTCOME_POOL_CONFIG, mode: 'prebuilt-pools'}),
  deal: Object.freeze({
    player: Object.freeze({rerollMode: 'unpaired', rerollChance: .5, maxRerolls: 50, manual: Object.freeze([])}),
    npc: Object.freeze({rerollMode: 'unpaired', rerollChance: .25, maxRerolls: 50, manual: Object.freeze([])})
  })});

export function normalizeConfig(source = {}) {
  const requestedMode = source.outcome?.mode ?? DEFAULT_CONFIG.outcome.mode;
  const d = ['prebuilt-pools', 'legacy-deck'].includes(requestedMode) ? HISTORICAL_DEFAULT_CONFIG : DEFAULT_CONFIG;
  const holdem = isHoldemBetting({outcome: {mode: requestedMode}});
  if (source.jackpotEnabled !== undefined && typeof source.jackpotEnabled !== 'boolean') throw new TypeError('jackpotEnabled 必須為布林值。');
  const bigBlind = round(Math.max(0.02, holdem && source.smallBlind !== undefined
    ? number(source.smallBlind, d.smallBlind) * 2 : number(source.bigBlind, d.bigBlind)));
  const minBuyIn = holdem ? round(bigBlind * 50) : round(Math.max(bigBlind, number(source.minBuyIn, d.minBuyIn)));
  const maxBuyIn = round(Math.max(minBuyIn, number(source.maxBuyIn, d.maxBuyIn)));
  const config = {
    targetRtp: clamp(number(source.targetRtp, d.targetRtp), 0.5, 1),
    jackpotEnabled: source.jackpotEnabled ?? d.jackpotEnabled,
    // Derive the small blind, including for imported settings from the single-blind version.
    smallBlind: round(bigBlind / 2), bigBlind,
    minBuyIn, maxBuyIn, buyIn: round(clamp(number(source.buyIn, holdem ? minBuyIn : d.buyIn), holdem ? 0.000001 : minBuyIn, maxBuyIn)),
    betSize: {}, maxRaises: holdem ? null : 1, animationMs: Math.round(clamp(number(source.animationMs, d.animationMs), 0, 3000)),
    npc: {}, boss: normalizeBossConfig(source.boss === undefined ? d.boss : source.boss), deal: {}
  };
  for (const street of STREETS) config.betSize[street] = round(Math.max(bigBlind, number(source.betSize?.[street], d.betSize[street])));
  for (const key of ['fold', 'call', 'raise', 'check', 'bet']) config.npc[key] = clamp(number(source.npc?.[key], d.npc[key]), 0, 1);
  for (const key of ['strengthInfluence', 'priceInfluence']) config.npc[key] = clamp(number(source.npc?.[key], d.npc[key]), 0, 4);
  for (const seat of SEATS) {
    const input = source.deal?.[seat] || {};
    let manual = input.manual || [];
    if (typeof manual === 'string') manual = manual.trim() ? manual.trim().split(/[\s,，]+/) : [];
    if (!Array.isArray(manual) || (manual.length !== 0 && manual.length !== 2)) throw new Error(`${seat} 指定手牌必須留空或填兩張。`);
    // Imported score-based settings retain their old meaning under an explicit mode.
    // New two-card deals adapt Boss Duel's high-card condition to an unpaired hand.
    const rerollMode = input.rerollMode ?? (input.targetScore !== undefined ? 'legacy-score' : d.deal[seat].rerollMode);
    if (!['unpaired', 'legacy-score'].includes(rerollMode)) throw new TypeError(`${seat} 起手重抽模式必須為 unpaired 或 legacy-score。`);
    const legacy = rerollMode === 'legacy-score';
    config.deal[seat] = {
      rerollMode,
      rerollChance: clamp(number(input.rerollChance, legacy ? 0.75 : d.deal[seat].rerollChance), 0, 1),
      maxRerolls: Math.round(clamp(number(input.maxRerolls, legacy ? 2 : d.deal[seat].maxRerolls), 0, 50)),
      ...(legacy ? {targetScore: clamp(number(input.targetScore, 0.48), 0, 1)} : {}),
      manual: manual.map(normalizeCard)
    };
    if (holdem) {
      config.deal[seat].rerollChance = 0;
      config.deal[seat].maxRerolls = 0;
    }
  }
  const manualCards = SEATS.flatMap(seat => config.deal[seat].manual);
  if (new Set(manualCards).size !== manualCards.length) throw new Error('雙方指定手牌不可重複。');
  const outcome = source.outcome ?? {};
  const mode = outcome.mode ?? d.outcome.mode;
  if (!['prebuilt-pools', 'legacy-deck', 'fixed-holdem', 'pooled-holdem', 'natural-holdem'].includes(mode)) throw new TypeError('未知結果模型。');
  // Current pooled outcomes use one score coefficient and pay the full pot.
  // A saved prototype pot fee must not reappear when old settings are loaded.
  if (mode === 'prebuilt-pools' || holdem) config.targetRtp = 1;
  if (holdem) config.jackpotEnabled = false;
  if (mode === 'pooled-holdem' && config.boss.mode === 'rotate') config.boss.mode = 'random';
  if (mode === 'natural-holdem') {
    if (manualCards.length) throw new TypeError('Natural Holdem uses a uniform deck and does not accept manual cards.');
    if (['legacy', 'rotate'].includes(config.boss.mode)) config.boss.mode = 'random';
  }
  let initial = createOutcomePools({paidAction: outcome.initialPaidActionPools,
    special: outcome.initialSpecialPools, paidActionCooldown: outcome.initialPaidActionCooldown});
  if (mode === 'pooled-holdem') initial = migrateOutcomePoolsWithoutJackpot(initial);
  config.outcome = {mode, ...normalizeOutcomePoolConfig(mode === 'pooled-holdem'
    ? {...outcome, paidActionBudgetShare: 1, specialUseChance: 0} : outcome),
    initialPaidActionPools: initial.buckets.map(bucket => bucket.paidAction),
    initialSpecialPools: initial.buckets.map(bucket => bucket.special), initialPaidActionCooldown: initial.paidActionCooldown};
  for (const key of ['stateLimit', 'maxLayoutAttempts']) {
    const value = outcome[key] ?? d.outcome[key];
    if (!Number.isSafeInteger(value) || value < 1 || value > 100000) throw new RangeError(key + ' 必須為 1 至 100000 的整數。');
    config.outcome[key] = value;
  }
  return config;
}

export function createSession(config = {}, seed = 123, options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)
    || Object.keys(options).some(key => !['firstSmallBlind', 'outcomePools', 'lastBossProfileId'].includes(key))) {
    throw new TypeError('Session 選項僅接受 firstSmallBlind、outcomePools 與 lastBossProfileId。');
  }
  const choice = options.firstSmallBlind === undefined ? 'player' : options.firstSmallBlind;
  if (!['random', 'player', 'npc'].includes(choice)) {
    throw new RangeError('firstSmallBlind 必須是 random、player 或 npc。');
  }
  const lastBossProfileId = options.lastBossProfileId === undefined ? null : options.lastBossProfileId;
  if (![null, 'caller', 'maniac'].includes(lastBossProfileId)) {
    throw new RangeError('lastBossProfileId 必須是 null、caller 或 maniac。');
  }
  const normalized = normalizeConfig(config);
  const rng = createRng(seed);
  // Reserve the opening draw on entry. Later random hands draw only in startHand;
  // explicit research positions retain alternating blinds and their RNG stream.
  const firstSmallBlind = choice === 'random' ? (rng() < 0.5 ? 'player' : 'npc') : choice;
  const blindDraw = choice === 'random' ? {smallBlind: firstSmallBlind, probability: 0.5} : null;
  const blindMode = choice === 'random' && !isHoldemBetting(normalized) ? 'random' : 'alternate';
  return {config: normalized, seed, rng, firstSmallBlind, blindMode, blindDraw, lastBossProfileId,
    ...(isHoldemBetting(normalized) ? {tableNumber: 1, tableStartHandNumber: 1} : {}),
    outcomePools: options.outcomePools ? (isPooledHoldem(normalized) ? migrateOutcomePoolsWithoutJackpot : normalizeOutcomePools)(options.outcomePools)
      : createOutcomePools({paidAction: normalized.outcome.initialPaidActionPools,
        special: normalized.outcome.initialSpecialPools, paidActionCooldown: normalized.outcome.initialPaidActionCooldown}),
    stacks: {player: normalized.buyIn, npc: normalized.buyIn}, handNumber: 0, fees: 0,
    jackpotAwards: 0, jackpotTierCounts: {royal: 0, straightFlush: 0, quads: 0},
    opponentBankrollRefreshes: []};
}

/** Re-enter after a completed table while keeping the same player's accounts and RNG stream. */
export function beginNewTable(session, {buyIn = session?.config?.smallBlind * 100} = {}) {
  if (!isHoldemBetting(session?.config)) throw new TypeError('New table entry requires a Holdem session.');
  if (!(session.handNumber > 0) || session.activeHand?.status !== 'settled'
    || !session.activeHand.result || session.activeHand.handNumber !== session.handNumber
    || (session.tableStartHandNumber ?? 1) > session.handNumber) {
    throw new Error('New table entry requires a completed previous table.');
  }
  const chips = round(buyIn);
  if (!Number.isFinite(buyIn) || !(chips > 0) || !Number.isSafeInteger(Math.round(buyIn * 1e6))) {
    throw new RangeError('New table buy-in must be a positive finite chip amount.');
  }
  // Commit only after every check and the single opening-blind draw succeeds.
  const rng = session.rng.clone(), firstSmallBlind = rng() < 0.5 ? 'player' : 'npc';
  const event = Object.freeze({type: 'table-buy-in', tableNumber: (session.tableNumber ?? 1) + 1,
    openingHandNumber: session.handNumber + 1, buyIn: chips, firstSmallBlind, probability: 0.5});
  Object.assign(session, {rng, stacks: {player: chips, npc: chips}, firstSmallBlind, blindMode: 'alternate',
    blindDraw: {smallBlind: firstSmallBlind, probability: 0.5}, tableNumber: event.tableNumber,
    tableStartHandNumber: event.openingHandNumber});
  return event;
}

/** Optional demo-only inter-hand adjustment; never part of pot settlement or simulation. */
export function syncOpponentBankroll(session) {
  const hand = session?.activeHand;
  if (!hand || hand.session !== session || hand.handNumber !== session.handNumber
    || hand.status !== 'settled' || !hand.result) {
    throw new Error('Opponent chips can refresh only after the current hand has settled.');
  }
  // In fixed Hold'em the next opponent buys in only when the next hand starts.
  if (isHoldemBetting(session.config)) return null;
  const previous = session.opponentBankrollRefreshes.at(-1);
  if (previous?.handNumber === hand.handNumber) return previous;
  const before = session.stacks.npc, after = session.stacks.player;
  if (![before, after].every(value => Number.isFinite(value) && value >= 0)) {
    throw new RangeError('Opponent chip refresh requires finite, nonnegative balances.');
  }
  const event = Object.freeze({type: 'demo-opponent-bankroll-refresh', handNumber: hand.handNumber,
    before, after, adjustment: round(after - before)});
  // The settled hand keeps its closing balances even as the next hand is played.
  session.stacks = {...session.stacks, npc: after};
  session.opponentBankrollRefreshes.push(event);
  return event;
}

function pickPair(available, rng) {
  const first = Math.floor(rng() * available.length);
  let second = Math.floor(rng() * (available.length - 1));
  if (second >= first) second++;
  return [available[first], available[second]];
}

function dealHoles(config, rng, firstSeat) {
  const reserved = SEATS.flatMap(seat => config.deal[seat].manual);
  let available = makeDeck().filter(card => !reserved.includes(card));
  const holes = {}, audit = {};
  for (const seat of [firstSeat, other(firstSeat)]) {
    const setting = config.deal[seat];
    let cards = setting.manual.length ? [...setting.manual] : pickPair(available, rng);
    let rerolls = 0;
    const initialScore = holeScore(cards);
    const classify = pair => pair[0][0] === pair[1][0] ? 'pair' : 'unpaired';
    const initialClass = classify(cards);
    let stopReason = 'manual';
    if (!setting.manual.length && !isHoldemBetting(config)) {
      while (true) {
        const eligible = setting.rerollMode === 'legacy-score'
          ? holeScore(cards) < setting.targetScore : classify(cards) === 'unpaired';
        if (!eligible) { stopReason = setting.rerollMode === 'legacy-score' ? 'score-threshold' : 'pair'; break; }
        if (rerolls >= setting.maxRerolls) { stopReason = 'limit'; break; }
        if (rng() >= setting.rerollChance) { stopReason = 'probability'; break; }
        // Rejected candidates remain in the pool; accept the final candidate,
        // even if it is worse. Never inspect the board or the opponent's result.
        cards = pickPair(available, rng);
        rerolls++;
      }
      available = available.filter(card => !cards.includes(card));
    }
    if (!setting.manual.length && isHoldemBetting(config)) {
      available = available.filter(card => !cards.includes(card));
      stopReason = 'natural-deal';
    }
    holes[seat] = cards;
    audit[seat] = {manual: !!setting.manual.length, rerollMode: setting.rerollMode,
      initialClass, finalClass: classify(cards), initialScore, finalScore: holeScore(cards),
      attempts: setting.manual.length ? 0 : rerolls + 1, rerolls, stopReason};
  }
  return {holes, audit, deck: shuffle(available, rng)};
}

function pay(hand, seat, amount, type) {
  const actual = round(Math.min(amount, hand.stacks[seat]));
  hand.stacks[seat] = round(hand.stacks[seat] - actual);
  hand.streetBets[seat] = round(hand.streetBets[seat] + actual);
  hand.contributions[seat] = round(hand.contributions[seat] + actual);
  hand.pot = round(hand.pot + actual);
  hand.history.push({actor: seat, type, amount: actual, to: hand.streetBets[seat], street: hand.street});
  return actual;
}

function startHandRaw(session) {
  if (session.activeHand?.status === 'playing') throw new Error('目前牌局尚未結束。');
  assertHandEntryAssets(session);
  if (isHoldemBetting(session.config)) {
    const before = session.stacks.npc, after = session.stacks.player;
    session.stacks = {...session.stacks, npc: after};
    session.opponentBankrollRefreshes.push(Object.freeze({type: 'opponent-hand-buy-in', handNumber: session.handNumber + 1,
      before, after, adjustment: round(after - before)}));
  }
  session.handNumber++;
  const firstSmallBlind = session.firstSmallBlind ?? 'player';
  const randomBlind = session.blindMode === 'random';
  const tableHandNumber = session.handNumber - (session.tableStartHandNumber ?? 1) + 1;
  const smallBlind = randomBlind
    ? session.handNumber === 1 ? firstSmallBlind : session.rng() < 0.5 ? 'player' : 'npc'
    : tableHandNumber % 2 === 1 ? firstSmallBlind : other(firstSmallBlind);
  if (randomBlind) session.blindDraw = {smallBlind, probability: 0.5};
  const bigBlind = other(smallBlind);
  const boss = selectBossProfile(session.rng, session.lastBossProfileId, session.config.boss);
  session.lastBossProfileId = boss.profile?.id ?? null;
  // Pooled Holdem posts its money first, then constructs the actual layout
  // around the one root result before classifying or resolving short blinds.
  const deal = isPooledHoldem(session.config)
    ? {holes: {player: [], npc: []}, deck: [], audit: undefined}
    : isNaturalHoldem(session.config) ? createNaturalHoldemDeal(session.config, session.rng, smallBlind)
    : dealHoles(session.config, session.rng, smallBlind);
  const hand = {
    session, config: session.config, rng: session.rng, handNumber: session.handNumber, smallBlind, bigBlind,
    bossProfile: boss.profile, bossSelection: boss.selection,
    street: 'preflop', status: 'playing', actor: smallBlind,
    holes: deal.holes, deck: deal.deck, dealAudit: deal.audit, board: [],
    stacks: session.stacks, stacksBefore: {...session.stacks},
    streetBets: {player: 0, npc: 0}, contributions: {player: 0, npc: 0},
    currentBet: 0, raises: 0, pending: [smallBlind, bigBlind], pot: 0, history: [], result: null
  };
  if (isNaturalHoldem(hand.config)) {
    hand.naturalHoldem = deal.naturalHoldem;
    hand.rulesSnapshot = deal.rulesSnapshot;
    lockNaturalHoldemDeal(hand);
  }
  if (isHoldemBetting(hand.config)) {
    hand.lastFullRaise = hand.config.bigBlind;
    hand.actedSinceFullRaise = [];
  }
  if (!isNaturalHoldem(hand.config)) {
    hand.outcomePoolsBefore = normalizeOutcomePools(session.outcomePools);
    hand.outcomeHandId = String((session.outcomePools.handSequence ?? 0) + 1);
  }
  // Non-enumerable pointer prevents JSON snapshots from acquiring circular references.
  Object.defineProperty(session, 'activeHand', {value: hand, writable: true, configurable: true, enumerable: false});
  // Choosing BET is free. Both seats post only when the hand starts.
  pay(hand, smallBlind, session.config.smallBlind, 'smallBlind');
  pay(hand, bigBlind, session.config.bigBlind, 'bigBlind');
  hand.currentBet = Math.max(...Object.values(hand.streetBets));
  if (!isPooledHoldem(hand.config)) {
    if (isFixedHoldem(hand.config)) lockBossStreetStrength(hand);
    resolveForcedState(hand);
  }
  return hand;
}

function attachOutcomeTree(hand, tree, nodeId) {
  Object.defineProperties(hand, {
    _outcomeTree: {value: tree, writable: true, configurable: true},
    _outcomeNodeId: {value: nodeId, writable: true, configurable: true}
  });
  return hand;
}

/** Build privately; only a complete tree may change the live wallet or RNG. */
export function startHand(session) {
  if (session.activeHand?.status === 'playing') throw new Error('目前牌局尚未結束。');
  assertHandEntryAssets(session);
  if (session.config.outcome.mode === 'legacy-deck' || isFixedHoldem(session.config)) return startHandRaw(session);
  const working = {...session, rng: session.rng.clone(), stacks: {...session.stacks},
    ...((isPooledHoldem(session.config) || isNaturalHoldem(session.config)) ? {config: normalizeConfig(session.config)} : {}),
    outcomePools: (isPooledHoldem(session.config) ? migrateOutcomePoolsWithoutJackpot : normalizeOutcomePools)(session.outcomePools),
    jackpotTierCounts: {...session.jackpotTierCounts},
    opponentBankrollRefreshes: [...session.opponentBankrollRefreshes]};
  const draft = startHandRaw(working);
  if (isNaturalHoldem(session.config)) {
    lockNaturalHoldemDeal(draft);
    return publishPooledHand(session, draft);
  }
  if (isPooledHoldem(session.config)) {
    initializePooledHoldem(draft, {dealHoles});
    lockBossStreetStrength(draft);
    resolveForcedState(draft);
    return publishPooledHand(session, draft);
  }
  const tree = buildPrebuiltOutcomeTree({hand: draft, rng: working.rng,
    cloneHand: hand => cloneHand(hand, {compactPools: true}), trustedInternalClone: true, legalActions, applyActionRaw,
    stateLimit: draft.config.outcome.stateLimit, maxLayoutAttempts: draft.config.outcome.maxLayoutAttempts,
    drawRootOutcome: ({hand, rng}) => drawRootPoolOutcome({hand, rng, pools: hand.outcomePoolsBefore, config: hand.config.outcome}),
    drawPaidOutcome: options => drawPaidPoolOutcome({...options, config: draft.config.outcome}),
    createLayout: ({hand, rng, requiredTargets, plan}) => createOutcomeLayout({config: hand.config, rng,
      requiredTargets, dealHoles, firstSeat: hand.smallBlind,
      qualification: plan.nodes[0].decision.qualification, qualifyLayout: isSpecialPoolLayout})});
  const root = tree.nodes.find(node => node.id === tree.rootId);
  const hand = cloneHand(root.state);
  hand.session.outcomePools = applyBranchPools({pools: hand.outcomePoolsBefore,
    decision: hand.outcomeDecision, handId: hand.outcomeHandId});
  Object.assign(session, working, {rng: tree.rngAfterBuild.clone(), stacks: hand.stacks,
    outcomePools: normalizeOutcomePools(hand.session.outcomePools)});
  hand.session = session; hand.rng = session.rng; hand.config = session.config;
  attachOutcomeTree(hand, tree, tree.rootId);
  Object.defineProperty(session, 'activeHand', {value: hand, writable: true, configurable: true, enumerable: false});
  return hand;
}

function action(type, amount = 0, to = 0, allIn = false) {
  const labels = {fold: '棄牌', check: '過牌', call: '跟注', bet: '下注', raise: '加注'};
  return {type, label: labels[type], amount: round(amount), to: round(to), allIn};
}

export function legalActions(hand, actor = hand.actor) {
  if (isHoldemBetting(hand.config)) return legalHoldemActions(hand, actor);
  if (hand.status !== 'playing' || actor !== hand.actor || !SEATS.includes(actor)) return [];
  const opponent = other(actor);
  const owed = round(Math.max(0, hand.currentBet - hand.streetBets[actor]));
  const stack = hand.stacks[actor];
  if (stack <= epsilon) return [];
  const actions = [];
  if (owed > epsilon) {
    actions.push(action('fold'));
    const amount = Math.min(owed, stack);
    actions.push(action('call', amount, hand.streetBets[actor] + amount, amount >= stack - epsilon));
  } else actions.push(action('check', 0, hand.streetBets[actor]));
  const maximum = Math.min(hand.streetBets[actor] + stack, hand.streetBets[opponent] + hand.stacks[opponent]);
  if (hand.stacks[opponent] > epsilon && maximum > hand.currentBet + epsilon) {
    const isRaise = hand.currentBet > epsilon;
    if (!isRaise || hand.raises < hand.config.maxRaises) {
      const to = round(Math.min(maximum, hand.currentBet + hand.config.betSize[hand.street]));
      const amount = round(to - hand.streetBets[actor]);
      actions.push(action(isRaise ? 'raise' : 'bet', amount, to, amount >= stack - epsilon));
    }
  }
  return actions;
}

function settle(hand, folded = null) {
  if (hand.status !== 'playing' || hand.result) return hand;
  if (isNaturalHoldem(hand.config)) assertNaturalHoldemIntegrity(hand);
  const contributions = {...hand.contributions};
  const matched = Math.min(contributions.player, contributions.npc);
  const refunds = {player: round(contributions.player - matched), npc: round(contributions.npc - matched)};
  for (const seat of SEATS) hand.stacks[seat] = round(hand.stacks[seat] + refunds[seat]);
  const pot = round(matched * 2);
  const evaluations = {player: null, npc: null};
  let winner;
  if (folded) winner = other(folded);
  else {
    evaluations.player = evaluateBest([...hand.holes.player, ...hand.board]);
    evaluations.npc = evaluateBest([...hand.holes.npc, ...hand.board]);
    const comparison = compareRanks(evaluations.player.rank, evaluations.npc.rank);
    winner = comparison > 0 ? 'player' : comparison < 0 ? 'npc' : 'tie';
  }
  const reason = folded ? 'fold' : 'showdown';
  let jackpot = null, outcomePoolAudit = null;
  if ((hand.config.outcome.mode === 'prebuilt-pools' || isPooledHoldem(hand.config)) && !hand.outcomePlanning && hand.outcomeDecision?.poolBranch) {
    const poolResult = settleOutcomePools({pools: hand.outcomePoolsBefore, decision: hand.outcomeDecision,
      matchedWager: matched, reason, winner, actualTier: classifyJackpot(evaluations.player), handId: hand.outcomeHandId});
    hand.session.outcomePools = poolResult.pools;
    outcomePoolAudit = poolResult.audit;
    if (poolResult.specialAward > 0) jackpot = quoteJackpot(hand.outcomeDecision.qualification.tier, hand.config.bigBlind);
  } else if (hand.config.outcome.mode === 'legacy-deck') {
    jackpot = getJackpotAward({reason, evaluation: evaluations.player, baseBet: hand.config.bigBlind, enabled: hand.config.jackpotEnabled});
  }
  const result = {reason, winner, folded, pot, gross: pot, fee: 0, net: 0, totalReturn: 0,
    ...(isNaturalHoldem(hand.config) ? {rulesSnapshot: structuredClone(hand.rulesSnapshot)} : {}),
    jackpot, outcomePoolAudit, board: [...hand.board], evaluations};
  for (const seat of SEATS) {
    const gross = winner === seat ? pot : winner === 'tie' ? round(pot / 2) : 0;
    const netReturn = round(gross * hand.config.targetRtp);
    const fee = round(gross - netReturn);
    const jackpotAward = seat === 'player' ? jackpot?.award ?? 0 : 0;
    const totalReturn = round(netReturn + jackpotAward);
    const baseProfit = round(netReturn - matched);
    hand.stacks[seat] = round(hand.stacks[seat] + totalReturn);
    result[seat] = {totalContribution: contributions[seat], matchedWager: matched, refund: refunds[seat], gross, fee,
      netReturn, jackpotAward, totalReturn, baseProfit, profit: round(totalReturn - matched),
      stackBefore: hand.stacksBefore[seat], stackAfter: hand.stacks[seat]};
    result.fee = round(result.fee + fee);
    result.net = round(result.net + netReturn);
    result.totalReturn = round(result.totalReturn + totalReturn);
  }
  hand.session.fees = round(hand.session.fees + result.fee);
  if (jackpot) {
    hand.session.jackpotAwards = round(hand.session.jackpotAwards + jackpot.award);
    hand.session.jackpotTierCounts[jackpot.tier]++;
  }
  hand.pot = 0;
  hand.actor = null;
  hand.pending = [];
  hand.status = 'settled';
  hand.result = result;
  return hand;
}

function revealStreet(hand) {
  const index = STREETS.indexOf(hand.street);
  if (index === 3) return settle(hand);
  hand.street = STREETS[index + 1];
  const numberToReveal = hand.street === 'flop' ? 3 : 1;
  hand.board.push(...hand.deck.splice(0, numberToReveal));
  hand.streetBets = {player: 0, npc: 0};
  hand.currentBet = 0;
  hand.raises = 0;
  if (isHoldemBetting(hand.config)) {
    hand.lastFullRaise = hand.config.bigBlind;
    hand.actedSinceFullRaise = [];
    if (!isNaturalHoldem(hand.config)) lockBossStreetStrength(hand);
  }
  hand.pending = [hand.bigBlind, hand.smallBlind];
  hand.actor = hand.bigBlind;
  hand.history.push({type: 'reveal', street: hand.street, cards: hand.board.slice(-numberToReveal)});
  return hand;
}

function runOut(hand) {
  while (hand.status === 'playing') revealStreet(hand);
}

function resolveForcedState(hand) {
  if (hand.status !== 'playing') return;
  const allInSeat = SEATS.find(seat => hand.stacks[seat] <= epsilon);
  if (allInSeat) {
    const opponent = other(allInSeat);
    const opponentOwes = hand.streetBets[allInSeat] - hand.streetBets[opponent];
    if (hand.stacks[opponent] <= epsilon || opponentOwes <= epsilon) return runOut(hand);
    hand.actor = opponent;
    hand.pending = [opponent];
    return;
  }
  if (!hand.pending.length) return revealStreet(hand);
  if (!hand.pending.includes(hand.actor)) hand.actor = hand.pending[0];
}

function applyActionRaw(hand, requested) {
  let type = typeof requested === 'string' ? requested : requested?.type;
  const actions = legalActions(hand);
  if (type === 'allin') type = [...actions].reverse().find(item => item.allIn)?.type;
  const chosen = isHoldemBetting(hand.config) ? resolveHoldemAction(actions, requested) : actions.find(item => item.type === type);
  if (!chosen) throw new Error(`目前不能執行 ${String(type)}。`);
  type = chosen.type;
  const actor = hand.actor;
  if (type === 'fold') {
    hand.history.push({actor, type, amount: 0, to: hand.streetBets[actor], street: hand.street});
    return settle(hand, actor);
  }
  if (type === 'check') hand.history.push({actor, type, amount: 0, to: hand.streetBets[actor], street: hand.street});
  else pay(hand, actor, chosen.amount, type);
  if (isHoldemBetting(hand.config)) {
    Object.assign(hand.history.at(-1), {id: chosen.id, ...(chosen.sizeKey ? {sizeKey: chosen.sizeKey, sizeKeys: [...chosen.sizeKeys]} : {}),
      allIn: chosen.allIn, ...(chosen.fullRaise !== undefined ? {fullRaise: chosen.fullRaise} : {})});
    markHoldemAction(hand, actor, chosen);
  }
  hand.pending = hand.pending.filter(seat => seat !== actor);
  if (type === 'bet' || type === 'raise') {
    hand.currentBet = chosen.to;
    if (type === 'raise') hand.raises++;
    hand.pending = [other(actor)];
  }
  hand.actor = other(actor);
  resolveForcedState(hand);
  if ((hand.config.outcome.mode === 'prebuilt-pools' || isPooledHoldem(hand.config)) && hand.status === 'playing' && !hand.outcomePlanning && hand.outcomeDecision?.poolBranch) {
    hand.session.outcomePools = applyBranchPools({pools: hand.outcomePoolsBefore,
      decision: hand.outcomeDecision, handId: hand.outcomeHandId});
  }
  return hand;
}

function publishPooledHand(session, draft, existing = null) {
  const natural = isNaturalHoldem(draft.config), config = draft.config;
  if (natural) lockNaturalHoldemDeal(draft);
  Object.assign(session, draft.session);
  const hand = existing ? Object.assign(existing, draft) : draft;
  Object.assign(hand, {session, rng: session.rng, stacks: session.stacks, config: natural ? config : session.config});
  Object.defineProperty(session, 'activeHand', {value: hand, writable: true, configurable: true, enumerable: false});
  return hand;
}

/** Leaving forfeits an unfinished hand, but an already all-in player keeps the pending showdown. */
export function endHandForTableExit(hand) {
  if (hand.status === 'settled') return hand;
  if (hand.status !== 'playing' || !isHoldemBetting(hand.config)) {
    throw new TypeError('This hand cannot be closed on table exit.');
  }
  if (isNaturalHoldem(hand.config)) assertNaturalHoldemIntegrity(hand);
  const draft = cloneHand(hand);
  if (draft.stacks.player <= epsilon) {
    stepNpc(draft);
    if (draft.status !== 'settled') throw new Error('The all-in hand could not be settled.');
  } else {
    if (isPooledHoldem(draft.config)) preparePooledHoldemAction(draft, {type: 'fold', amount: 0});
    draft.history.push({actor: 'player', type: 'fold', amount: 0, to: draft.streetBets.player,
      street: draft.street, source: 'table-exit'});
    settle(draft, 'player');
  }
  return publishPooledHand(hand.session, draft, hand);
}

/** Pooled Holdem advances an atomic selected path; the historical model reads its stored tree. */
export function applyAction(hand, requested) {
  if (isNaturalHoldem(hand.config)) {
    assertNaturalHoldemIntegrity(hand);
    const chosen = resolveHoldemAction(legalActions(hand), requested);
    if (!chosen) throw new Error('目前沒有指定的合法動作。');
    const draft = cloneHand(hand);
    applyActionRaw(draft, chosen);
    lockNaturalHoldemDeal(draft);
    return publishPooledHand(hand.session, draft, hand);
  }
  if (isPooledHoldem(hand.config)) {
    const chosen = resolveHoldemAction(legalActions(hand), requested);
    if (!chosen) throw new Error('目前沒有指定的合法動作。');
    const draft = cloneHand(hand);
    preparePooledHoldemAction(draft, chosen);
    applyActionRaw(draft, chosen);
    return publishPooledHand(hand.session, draft, hand);
  }
  if (!hand._outcomeTree) return applyActionRaw(hand, requested);
  const {node} = lookupPrebuiltOutcomeTransition(hand._outcomeTree, hand._outcomeNodeId, requested);
  const snapshot = cloneHand(node.state), session = hand.session, rng = hand.rng;
  const tree = hand._outcomeTree;
  Object.assign(session, {stacks: snapshot.stacks, fees: snapshot.session.fees,
    jackpotAwards: snapshot.session.jackpotAwards, jackpotTierCounts: {...snapshot.session.jackpotTierCounts},
    outcomePools: normalizeOutcomePools(snapshot.session.outcomePools)});
  Object.assign(hand, snapshot, {session, rng, stacks: session.stacks, config: hand.config});
  attachOutcomeTree(hand, tree, node.id);
  return hand;
}

function knownStrength(hand, actor) {
  if (hand.board.length < 3) return holeScore(hand.holes[actor]);
  const evaluation = evaluateBest([...hand.holes[actor], ...hand.board]);
  const base = [0.18, 0.40, 0.57, 0.67, 0.76, 0.82, 0.89, 0.96, 0.995][evaluation.category];
  return clamp(base + ((evaluation.rank[1] || 7) - 8) * 0.008, 0.03, 0.999);
}

export function getActionDistribution(hand, actor = hand.actor, policy = 'balanced') {
  const actions = legalActions(hand, actor);
  if (!actions.length) return [];
  if (actor === 'npc' && isNaturalHoldem(hand.config)) {
    return getNaturalBossDistribution(createBossDecisionView(hand, actions));
  }
  if (actor === 'npc' && hand.config.boss.mode !== 'legacy') return getBossProfileDistribution(hand, actions);
  if (policy === 'call') {
    const chosen = actions.find(a => a.type === 'call') || actions.find(a => a.type === 'check') || actions[0];
    return actions.map(a => ({...a, probability: a.type === chosen.type ? 1 : 0}));
  }
  if (!['balanced', 'aggressive', 'tight'].includes(policy)) throw new Error('未知模擬策略。');
  const settings = hand.config.npc;
  const strength = knownStrength(hand, actor);
  const owed = Math.max(0, hand.currentBet - hand.streetBets[actor]);
  const price = owed / Math.max(0.01, hand.pot + owed);
  const s = settings.strengthInfluence, p = settings.priceInfluence;
  const weights = actions.map(item => {
    let weight = settings[item.type] ?? 1;
    if (item.type === 'fold') weight *= Math.exp(s * (0.5 - strength) * 3 + p * (price - 0.2) * 2);
    if (item.type === 'call') weight *= Math.exp(s * (strength - 0.5) * 0.6);
    if (item.type === 'raise' || item.type === 'bet') weight *= Math.exp(s * (strength - 0.5) * 2.5 - p * price);
    if (item.type === 'check') weight *= Math.exp(-s * (strength - 0.5));
    if (policy === 'aggressive') weight *= item.type === 'fold' ? 0.15 : ['bet', 'raise'].includes(item.type) ? 3.5 : 1;
    if (policy === 'tight') weight *= item.type === 'fold' ? 3 : ['bet', 'raise'].includes(item.type) ? (strength > 0.72 ? 1.5 : 0.25) : 1;
    if (isHoldemBetting(hand.config) && item.sizeKeys) {
      const sizes = actor === 'player' && (isPooledHoldem(hand.config) || isNaturalHoldem(hand.config)) ? PLAYER_HOLDEM_SIZE_WEIGHTS : HOLDEM_SIZE_WEIGHTS;
      weight *= item.sizeKeys.reduce((sum, key) => sum + (sizes[key] || 0), 0);
    }
    return weight;
  });
  let total = weights.reduce((a, b) => a + b, 0);
  if (!total) {
    const passiveIndex = actions.findIndex(a => a.type === 'check' || a.type === 'call');
    weights[passiveIndex < 0 ? 0 : passiveIndex] = 1;
    total = 1;
  }
  const distribution = actions.map((item, index) => ({...item, probability: weights[index] / total}));
  const positive = distribution.map((item, index) => item.probability > 0 ? index : -1).filter(i => i >= 0);
  const last = positive[positive.length - 1];
  distribution[last].probability = 1 - distribution.reduce((sum, item, index) => sum + (index === last ? 0 : item.probability), 0);
  return distribution;
}

export function sampleDistribution(distribution, rng) {
  if (!distribution.length || distribution.some(a => !Number.isFinite(a.probability) || a.probability < 0)) throw new Error('無效的行動機率。');
  const total = distribution.reduce((sum, item) => sum + item.probability, 0);
  if (Math.abs(total - 1) > 1e-8) throw new Error('行動機率總和必須等於 1。');
  const draw = () => {
    const value = rng();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('隨機數必須介於 0（含）與 1（不含）。');
    return value;
  };
  const roll = draw();
  if (distribution.some(item => item.bossSizing === true)) {
    // BOSS first chooses the action family. Only an aggressive choice draws
    // the separate conditional sizing ticket; collapsed sizes still draw it.
    const groups = [];
    for (let index = 0; index < distribution.length; index++) {
      const item = distribution[index];
      if (!(item.probability > 0)) continue;
      const key = item.type === 'bet' || item.type === 'raise' ? 'aggressive' : item.type;
      let group = groups.find(candidate => candidate.key === key);
      if (!group) { group = {key, probability: 0, indexes: []}; groups.push(group); }
      group.probability += item.probability; group.indexes.push(index);
    }
    let cumulative = 0, selectedGroup = groups.at(-1);
    for (const group of groups) {
      cumulative += group.probability;
      if (roll < cumulative) { selectedGroup = group; break; }
    }
    if (selectedGroup.key !== 'aggressive') {
      const index = selectedGroup.indexes[0];
      return {...distribution[index], roll, index};
    }
    const sizeRoll = draw();
    cumulative = 0;
    for (let position = 0; position < selectedGroup.indexes.length; position++) {
      const index = selectedGroup.indexes[position], item = distribution[index];
      cumulative += item.probability / selectedGroup.probability;
      if (sizeRoll < cumulative || position === selectedGroup.indexes.length - 1) {
        return {...item, roll, sizeRoll, index};
      }
    }
  }
  let cumulative = 0;
  for (let index = 0; index < distribution.length; index++) {
    cumulative += distribution[index].probability;
    if (roll < cumulative || index === distribution.length - 1) return {...distribution[index], roll, index};
  }
}

export function cloneHand(hand, {compactPools = false} = {}) {
  const copyPools = compactPools ? compactOutcomePools : normalizeOutcomePools;
  const session = {...hand.session, rng: hand.rng.clone(), stacks: {...hand.stacks},
    outcomePools: copyPools(hand.session.outcomePools),
    blindDraw: hand.session.blindDraw ? {...hand.session.blindDraw} : null,
    jackpotTierCounts: {...hand.session.jackpotTierCounts}};
  const copy = {...hand, session, rng: session.rng, stacks: session.stacks,
    stacksBefore: {...hand.stacksBefore}, streetBets: {...hand.streetBets}, contributions: {...hand.contributions},
    holes: {player: [...hand.holes.player], npc: [...hand.holes.npc]}, board: [...hand.board], deck: [...hand.deck],
    pending: [...hand.pending], history: structuredClone(hand.history), result: hand.result ? structuredClone(hand.result) : null,
    dealAudit: hand.dealAudit ? structuredClone(hand.dealAudit) : undefined,
    ...(hand.outcomeDecision ? {outcomeDecision: structuredClone(hand.outcomeDecision)} : {}),
    ...(hand.outcomePoolsBefore ? {outcomePoolsBefore: copyPools(hand.outcomePoolsBefore)} : {})};
  if (hand.actedSinceFullRaise) copy.actedSinceFullRaise = [...hand.actedSinceFullRaise];
  if (hand.bossStreetStrength) copy.bossStreetStrength = structuredClone(hand.bossStreetStrength);
  if (hand.bossStreetStates) copy.bossStreetStates = structuredClone(hand.bossStreetStates);
  if (hand.pooledHoldem) copy.pooledHoldem = structuredClone(hand.pooledHoldem);
  if (isNaturalHoldem(hand.config)) {
    copy.naturalHoldem = structuredClone(hand.naturalHoldem);
    copy.rulesSnapshot = structuredClone(hand.rulesSnapshot);
    lockNaturalHoldemDeal(copy);
  }
  if (hand._outcomeTree) attachOutcomeTree(copy, hand._outcomeTree, hand._outcomeNodeId);
  return copy;
}

export function previewResponse(hand, playerActionType) {
  if (hand.actor !== 'player') return {distribution: [], actor: hand.actor, status: hand.status, street: hand.street};
  const clone = cloneHand(hand);
  const originalStreet = hand.street;
  applyAction(clone, playerActionType);
  return {distribution: clone.status === 'playing' && clone.actor === 'npc' && clone.street === originalStreet ? getActionDistribution(clone) : [],
    actor: clone.actor, status: clone.status, street: clone.street};
}

export function stepNpc(hand) {
  if (hand.actor !== 'npc') throw new Error('目前不是電腦行動。');
  if (isNaturalHoldem(hand.config)) {
    assertNaturalHoldemIntegrity(hand);
    const draft = cloneHand(hand), distribution = getActionDistribution(draft);
    const selected = sampleDistribution(distribution, draft.rng);
    applyActionRaw(draft, selected);
    lockNaturalHoldemDeal(draft);
    publishPooledHand(hand.session, draft, hand);
    return {distribution, selected, roll: selected.roll};
  }
  const distribution = getActionDistribution(hand);
  const selected = sampleDistribution(distribution, hand.rng);
  applyAction(hand, selected);
  return {distribution, selected, roll: selected.roll};
}

export function equityEstimate(hand, {samples = 300, seed = 1, actor = 'player'} = {}) {
  if (!SEATS.includes(actor)) throw new Error('未知座位。');
  samples = Math.round(clamp(number(samples, 300), 1, 100000));
  const rng = createRng(seed);
  const visible = [...hand.holes[actor], ...hand.board];
  const available = makeDeck().filter(card => !visible.includes(card));
  const missing = 5 - hand.board.length;
  let wins = 0, ties = 0;
  for (let i = 0; i < samples; i++) {
    const pool = [...available];
    for (let j = 0; j < 2 + missing; j++) {
      const pick = j + Math.floor(rng() * (pool.length - j));
      [pool[j], pool[pick]] = [pool[pick], pool[j]];
    }
    const opponent = pool.slice(0, 2);
    const board = [...hand.board, ...pool.slice(2, 2 + missing)];
    const comparison = compareRanks(evaluateBest([...hand.holes[actor], ...board]).rank, evaluateBest([...opponent, ...board]).rank);
    if (comparison > 0) wins++;
    else if (comparison === 0) ties++;
  }
  return {win: wins / samples, tie: ties / samples, loss: (samples - wins - ties) / samples,
    equity: (wins + ties / 2) / samples, samples,
    assumption: '只用自己的手牌與已揭公共牌；假設對手從未知牌均勻持牌，未納入對手重抽／下注範圍，為蒙地卡羅估計。'};
}

export function playAutomatedHand(session, policy = 'balanced') {
  const hand = startHand(session);
  let count = 0;
  while (hand.status === 'playing') {
    if (++count > (isHoldemBetting(hand.config) ? 1000 : 40)) throw new Error('下注輪未正常終止。');
    const distribution = getActionDistribution(hand, hand.actor, hand.actor === 'player' ? policy : 'balanced');
    const selected = sampleDistribution(distribution, hand.rng);
    applyAction(hand, selected);
  }
  return hand;
}

/** Single-sequence helper. Formal research uses simulateStudy's player-clustered confidence intervals. */
export function simulate(config = {}, {hands = 10000, seed = 123, policy = 'balanced', onProgress} = {}) {
  hands = Math.round(clamp(number(hands, 10000), 1, 1000000));
  const normalized = normalizeConfig(config);
  const session = createSession(normalized, seed, {firstSmallBlind: isHoldemBetting(normalized) ? 'random' : 'player'});
  const emptyTiers = () => ({royal: 0, straightFlush: 0, quads: 0});
  const newBatch = () => ({hands: 0, wagers: 0, netReturns: 0, totalReturns: 0, jackpotAwards: 0, tierCounts: emptyTiers()});
  const holdem = isHoldemBetting(normalized), pooled = normalized.outcome.mode === 'prebuilt-pools' || isPooledHoldem(normalized);
  const result = {ruleSet: isNaturalHoldem(normalized) ? NATURAL_HOLDEM_RULES.id : isPooledHoldem(normalized) ? 'pooled-holdem-v1' : isFixedHoldem(normalized) ? 'fixed-holdem-v1'
    : pooled ? 'hands-up-pooled-pot-v51' : 'heads-up-two-blinds-v1', hands, seed, policy, config: normalized, wagers: 0, refunds: 0, grossReturns: 0, netReturns: 0,
    totalReturns: 0, jackpotAwards: 0, tierCounts: emptyTiers(),
    fees: 0, playerFees: 0, wins: 0, losses: 0, ties: 0, folds: 0, npcFolds: 0, showdowns: 0, totalActions: 0,
    conservationError: 0, batches: [],
    ...(holdem ? {tableEntries: 1} : {}),
    method: `${holdem ? '同桌籌碼跨手延續；歸零後由無限外部研究錢包重新帶入設定的買入額。每手開始對手帶入與玩家目前桌籌碼相同金額。' : '歷史API：每手雙方重設相同帶入。'}大小盲輪替，BB為SB兩倍。BOSS 採 ${normalized.boss.mode === 'legacy' ? '舊版權重' : normalized.boss.mode === 'fixed' ? '固定類型' : normalized.boss.mode === 'random' ? '每手獨立50/50隨機遇到兩型' : '不連續重複的兩型輪替'}，玩家使用選定策略。有效投入排除退款。${normalized.jackpotEnabled ? 'JP另加。' : ''}${pooled ? '唯一RTP係數用於結果計分，匹配底池全額派彩。' : ''}${(holdem || pooled || ['rotate','random'].includes(normalized.boss.mode)) ? '本函式僅有一條玩家序列，因此不報CI；正式研究使用simulateStudy的多玩家聚類估計。' : '95% CI為獨立牌局比值的常態近似。'}${normalized.jackpotEnabled ? '稀有JP零命中不代表機率為零。' : ''}`};
  let sumX2 = 0, sumBaseY2 = 0, sumBaseXY = 0, sumTotalY2 = 0, sumTotalXY = 0;
  let batch = newBatch();
  for (let i = 0; i < hands; i++) {
    if (!holdem) session.stacks = {player: normalized.buyIn, npc: normalized.buyIn};
    else if (!(session.stacks.player > epsilon)) { beginNewTable(session, {buyIn: normalized.buyIn}); result.tableEntries++; }
    const hand = playAutomatedHand(session, policy);
    const r = hand.result, p = r.player;
    result.wagers += p.matchedWager;
    result.refunds += p.refund;
    result.grossReturns += p.gross;
    result.netReturns += p.netReturn;
    result.totalReturns += p.totalReturn;
    result.jackpotAwards += p.jackpotAward;
    if (r.jackpot) result.tierCounts[r.jackpot.tier]++;
    result.fees += r.fee;
    result.playerFees += p.fee;
    result.wins += Number(r.winner === 'player');
    result.losses += Number(r.winner === 'npc');
    result.ties += Number(r.winner === 'tie');
    result.folds += Number(r.folded === 'player');
    result.npcFolds += Number(r.folded === 'npc');
    result.showdowns += Number(r.reason === 'showdown');
    result.totalActions += hand.history.filter(event => ['fold', 'check', 'call', 'bet', 'raise'].includes(event.type)).length;
    result.conservationError = Math.max(result.conservationError, Math.abs(r.player.stackAfter + r.npc.stackAfter + r.fee
      - r.player.stackBefore - r.npc.stackBefore - p.jackpotAward));
    sumX2 += p.matchedWager ** 2;
    sumBaseY2 += p.netReturn ** 2;
    sumBaseXY += p.matchedWager * p.netReturn;
    sumTotalY2 += p.totalReturn ** 2;
    sumTotalXY += p.matchedWager * p.totalReturn;
    batch.hands++; batch.wagers += p.matchedWager; batch.netReturns += p.netReturn;
    batch.totalReturns += p.totalReturn; batch.jackpotAwards += p.jackpotAward;
    if (r.jackpot) batch.tierCounts[r.jackpot.tier]++;
    if ((i + 1) % 250 === 0 || i === hands - 1) {
      result.batches.push({...batch, wagers: round(batch.wagers), netReturns: round(batch.netReturns),
        totalReturns: round(batch.totalReturns), jackpotAwards: round(batch.jackpotAwards), tierCounts: {...batch.tierCounts},
        baseRtp: batch.wagers ? batch.netReturns / batch.wagers : 0,
        totalRtp: batch.wagers ? batch.totalReturns / batch.wagers : 0});
      batch = newBatch();
      onProgress?.({completed: i + 1, total: hands});
    }
  }
  result.baseRtp = result.wagers ? result.netReturns / result.wagers : 0;
  result.totalRtp = result.wagers ? result.totalReturns / result.wagers : 0;
  result.rtp = result.totalRtp;
  result.grossRtp = result.wagers ? result.grossReturns / result.wagers : 0;
  const uncertainty = (rtp, sumY2, sumXY) => {
    const residual = Math.max(0, sumY2 - 2 * rtp * sumXY + rtp ** 2 * sumX2);
    const standardError = normalized.outcome.mode === 'legacy-deck' && normalized.boss.mode !== 'rotate' && hands > 1 && result.wagers > 0 ? Math.sqrt(hands / (hands - 1) * residual) / result.wagers : null;
    return {standardError, ci95: standardError === null ? [null, null] : [rtp - 1.96 * standardError, rtp + 1.96 * standardError]};
  };
  const base = uncertainty(result.baseRtp, sumBaseY2, sumBaseXY);
  const total = uncertainty(result.totalRtp, sumTotalY2, sumTotalXY);
  result.baseStandardError = base.standardError; result.baseCi95 = base.ci95;
  result.standardError = total.standardError; result.ci95 = total.ci95;
  result.jackpotHits = Object.values(result.tierCounts).reduce((sum, count) => sum + count, 0);
  result.jackpotHitRate = result.jackpotHits / hands;
  result.jackpotShowdownHitRate = result.showdowns ? result.jackpotHits / result.showdowns : 0;
  for (const key of ['wagers', 'refunds', 'grossReturns', 'netReturns', 'totalReturns', 'jackpotAwards', 'fees', 'playerFees']) result[key] = round(result[key]);
  return result;
}
