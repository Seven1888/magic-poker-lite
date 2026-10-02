import {makeDeck, createRng, shuffle, normalizeCard, evaluateBest, compareRanks, holeScore} from './poker.mjs';
import {getJackpotAward} from './jackpot.mjs';
export {makeDeck, createRng, shuffle, evaluateBest, compareHands, holeScore, normalizeCard} from './poker.mjs';

const SEATS = ['player', 'npc'];
export const STREETS = ['preflop', 'flop', 'turn', 'river'];
const other = actor => actor === 'player' ? 'npc' : 'player';
const round = number => Math.round((number + Number.EPSILON) * 1e6) / 1e6;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const number = (n, fallback) => Number.isFinite(Number(n)) ? Number(n) : fallback;
const epsilon = 1e-7;
export const DEFAULT_CONFIG = Object.freeze({
  targetRtp: 0.96, jackpotEnabled: true, smallBlind: 5, bigBlind: 10,
  minBuyIn: 200, maxBuyIn: 2000, buyIn: 1000,
  betSize: Object.freeze({preflop: 10, flop: 20, turn: 40, river: 40}),
  maxRaises: 1, animationMs: 850,
  npc: Object.freeze({fold: 0.2, call: 0.6, raise: 0.2, check: 0.65, bet: 0.35, strengthInfluence: 1, priceInfluence: 0.6}),
  deal: Object.freeze({
    player: Object.freeze({rerollChance: 0.75, maxRerolls: 2, targetScore: 0.48, manual: Object.freeze([])}),
    npc: Object.freeze({rerollChance: 0.75, maxRerolls: 2, targetScore: 0.48, manual: Object.freeze([])})
  })
});

export function normalizeConfig(source = {}) {
  const d = DEFAULT_CONFIG;
  if (source.jackpotEnabled !== undefined && typeof source.jackpotEnabled !== 'boolean') throw new TypeError('jackpotEnabled 必須為布林值。');
  const bigBlind = round(Math.max(0.02, number(source.bigBlind, d.bigBlind)));
  const minBuyIn = round(Math.max(bigBlind, number(source.minBuyIn, d.minBuyIn)));
  const maxBuyIn = round(Math.max(minBuyIn, number(source.maxBuyIn, d.maxBuyIn)));
  const config = {
    targetRtp: clamp(number(source.targetRtp, d.targetRtp), 0.5, 1),
    jackpotEnabled: source.jackpotEnabled ?? d.jackpotEnabled,
    // Derive the small blind, including for imported settings from the single-blind version.
    smallBlind: round(bigBlind / 2), bigBlind,
    minBuyIn, maxBuyIn, buyIn: round(clamp(number(source.buyIn, d.buyIn), minBuyIn, maxBuyIn)),
    betSize: {}, maxRaises: 1, animationMs: Math.round(clamp(number(source.animationMs, d.animationMs), 0, 3000)),
    npc: {}, deal: {}
  };
  for (const street of STREETS) config.betSize[street] = round(Math.max(bigBlind, number(source.betSize?.[street], d.betSize[street])));
  for (const key of ['fold', 'call', 'raise', 'check', 'bet']) config.npc[key] = clamp(number(source.npc?.[key], d.npc[key]), 0, 1);
  for (const key of ['strengthInfluence', 'priceInfluence']) config.npc[key] = clamp(number(source.npc?.[key], d.npc[key]), 0, 4);
  for (const seat of SEATS) {
    const input = source.deal?.[seat] || {};
    let manual = input.manual || [];
    if (typeof manual === 'string') manual = manual.trim() ? manual.trim().split(/[\s,，]+/) : [];
    if (!Array.isArray(manual) || (manual.length !== 0 && manual.length !== 2)) throw new Error(`${seat} 指定手牌必須留空或填兩張。`);
    config.deal[seat] = {
      rerollChance: clamp(number(input.rerollChance, d.deal[seat].rerollChance), 0, 1),
      maxRerolls: Math.round(clamp(number(input.maxRerolls, d.deal[seat].maxRerolls), 0, 50)),
      targetScore: clamp(number(input.targetScore, d.deal[seat].targetScore), 0, 1),
      manual: manual.map(normalizeCard)
    };
  }
  const manualCards = SEATS.flatMap(seat => config.deal[seat].manual);
  if (new Set(manualCards).size !== manualCards.length) throw new Error('雙方指定手牌不可重複。');
  return config;
}

export function createSession(config = {}, seed = 123, options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)
    || Object.keys(options).some(key => key !== 'firstSmallBlind')) {
    throw new TypeError('Session 選項僅接受 firstSmallBlind。');
  }
  const choice = options.firstSmallBlind === undefined ? 'player' : options.firstSmallBlind;
  if (!['random', 'player', 'npc'].includes(choice)) {
    throw new RangeError('firstSmallBlind 必須是 random、player 或 npc。');
  }
  const normalized = normalizeConfig(config);
  const rng = createRng(seed);
  // Draw once on entry, before dealing. Fixed positions preserve the old RNG stream.
  const firstSmallBlind = choice === 'random' ? (rng() < 0.5 ? 'player' : 'npc') : choice;
  const blindDraw = choice === 'random' ? {smallBlind: firstSmallBlind, probability: 0.5} : null;
  return {config: normalized, seed, rng, firstSmallBlind, blindDraw,
    stacks: {player: normalized.buyIn, npc: normalized.buyIn}, handNumber: 0, fees: 0,
    jackpotAwards: 0, jackpotTierCounts: {royal: 0, straightFlush: 0, quads: 0},
    opponentBankrollRefreshes: []};
}

/** Optional demo-only inter-hand adjustment; never part of pot settlement or simulation. */
export function syncOpponentBankroll(session) {
  const hand = session?.activeHand;
  if (!hand || hand.session !== session || hand.handNumber !== session.handNumber
    || hand.status !== 'settled' || !hand.result) {
    throw new Error('Opponent chips can refresh only after the current hand has settled.');
  }
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
    if (!setting.manual.length) {
      while (holeScore(cards) < setting.targetScore && rerolls < setting.maxRerolls && rng() < setting.rerollChance) {
        cards = pickPair(available, rng);
        rerolls++;
      }
      available = available.filter(card => !cards.includes(card));
    }
    holes[seat] = cards;
    audit[seat] = {manual: !!setting.manual.length, initialScore, finalScore: holeScore(cards), rerolls};
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

export function startHand(session) {
  if (SEATS.some(seat => session.stacks[seat] < 0.01)) throw new Error('其中一方籌碼不足，請重新帶入。');
  if (session.activeHand?.status === 'playing') throw new Error('目前牌局尚未結束。');
  session.handNumber++;
  const firstSmallBlind = session.firstSmallBlind ?? 'player';
  const smallBlind = session.handNumber % 2 === 1 ? firstSmallBlind : other(firstSmallBlind);
  const bigBlind = other(smallBlind);
  const deal = dealHoles(session.config, session.rng, smallBlind);
  const hand = {
    session, config: session.config, rng: session.rng, handNumber: session.handNumber, smallBlind, bigBlind,
    street: 'preflop', status: 'playing', actor: smallBlind,
    holes: deal.holes, deck: deal.deck, dealAudit: deal.audit, board: [],
    stacks: session.stacks, stacksBefore: {...session.stacks},
    streetBets: {player: 0, npc: 0}, contributions: {player: 0, npc: 0},
    currentBet: 0, raises: 0, pending: [smallBlind, bigBlind], pot: 0, history: [], result: null
  };
  // Non-enumerable pointer prevents JSON snapshots from acquiring circular references.
  Object.defineProperty(session, 'activeHand', {value: hand, writable: true, configurable: true, enumerable: false});
  // Choosing BET is free. Both seats post only when the hand starts.
  pay(hand, smallBlind, session.config.smallBlind, 'smallBlind');
  pay(hand, bigBlind, session.config.bigBlind, 'bigBlind');
  hand.currentBet = Math.max(...Object.values(hand.streetBets));
  resolveForcedState(hand);
  return hand;
}

function action(type, amount = 0, to = 0, allIn = false) {
  const labels = {fold: '棄牌', check: '過牌', call: '跟注', bet: '下注', raise: '加注'};
  return {type, label: labels[type], amount: round(amount), to: round(to), allIn};
}

export function legalActions(hand, actor = hand.actor) {
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
  const jackpot = getJackpotAward({reason, evaluation: evaluations.player, baseBet: hand.config.bigBlind, enabled: hand.config.jackpotEnabled});
  const result = {reason, winner, folded, pot, gross: pot, fee: 0, net: 0, totalReturn: 0,
    jackpot, board: [...hand.board], evaluations};
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

export function applyAction(hand, requested) {
  let type = typeof requested === 'string' ? requested : requested?.type;
  const actions = legalActions(hand);
  if (type === 'allin') type = [...actions].reverse().find(item => item.allIn)?.type;
  const chosen = actions.find(item => item.type === type);
  if (!chosen) throw new Error(`目前不能執行 ${String(type)}。`);
  const actor = hand.actor;
  if (type === 'fold') {
    hand.history.push({actor, type, amount: 0, to: hand.streetBets[actor], street: hand.street});
    return settle(hand, actor);
  }
  if (type === 'check') hand.history.push({actor, type, amount: 0, to: hand.streetBets[actor], street: hand.street});
  else pay(hand, actor, chosen.amount, type);
  hand.pending = hand.pending.filter(seat => seat !== actor);
  if (type === 'bet' || type === 'raise') {
    hand.currentBet = chosen.to;
    if (type === 'raise') hand.raises++;
    hand.pending = [other(actor)];
  }
  hand.actor = other(actor);
  resolveForcedState(hand);
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
  const roll = rng();
  if (roll < 0 || roll >= 1) throw new Error('隨機數必須介於 0（含）與 1（不含）。');
  let cumulative = 0;
  for (let index = 0; index < distribution.length; index++) {
    cumulative += distribution[index].probability;
    if (roll < cumulative || index === distribution.length - 1) return {...distribution[index], roll, index};
  }
}

function cloneHand(hand) {
  const session = {...hand.session, rng: hand.rng.clone(), stacks: {...hand.stacks},
    blindDraw: hand.session.blindDraw ? {...hand.session.blindDraw} : null,
    jackpotTierCounts: {...hand.session.jackpotTierCounts}};
  return {...hand, session, rng: session.rng, stacks: session.stacks,
    stacksBefore: {...hand.stacksBefore}, streetBets: {...hand.streetBets}, contributions: {...hand.contributions},
    holes: {player: [...hand.holes.player], npc: [...hand.holes.npc]}, board: [...hand.board], deck: [...hand.deck],
    pending: [...hand.pending], history: [...hand.history]};
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
  const distribution = getActionDistribution(hand);
  const selected = sampleDistribution(distribution, hand.rng);
  applyAction(hand, selected.type);
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
    if (++count > 40) throw new Error('下注輪未正常終止。');
    const distribution = getActionDistribution(hand, hand.actor, hand.actor === 'player' ? policy : 'balanced');
    const selected = sampleDistribution(distribution, hand.rng);
    applyAction(hand, selected.type);
  }
  return hand;
}

/** Independent equal-stack hands, alternating blinds; ratio-estimator normal CI. */
export function simulate(config = {}, {hands = 10000, seed = 123, policy = 'balanced', onProgress} = {}) {
  hands = Math.round(clamp(number(hands, 10000), 1, 1000000));
  const normalized = normalizeConfig(config);
  const session = createSession(normalized, seed);
  const emptyTiers = () => ({royal: 0, straightFlush: 0, quads: 0});
  const newBatch = () => ({hands: 0, wagers: 0, netReturns: 0, totalReturns: 0, jackpotAwards: 0, tierCounts: emptyTiers()});
  const result = {ruleSet: 'heads-up-two-blinds-v1', hands, seed, policy, config: normalized, wagers: 0, refunds: 0, grossReturns: 0, netReturns: 0,
    totalReturns: 0, jackpotAwards: 0, tierCounts: emptyTiers(),
    fees: 0, playerFees: 0, wins: 0, losses: 0, ties: 0, folds: 0, npcFolds: 0, showdowns: 0, totalActions: 0,
    conservationError: 0, batches: [],
    method: '每手雙方重設相同帶入、輪替大小盲；小盲自動投入0.5 BET、大盲自動投入1 BET，短籌碼按可用額投入。NPC 使用 balanced，玩家使用選定策略。有效投注排除未跟注退款；小盲開局棄牌仍損失已付小盲，雙方匹配底池依返還係數結算。96% 僅為底池對稱條件參考，含JP總RTP另外計算，策略或手牌不對稱亦會改變RTP。95% CI 為獨立牌局比值近似；JP稀有，零命中不代表機率為零，少量樣本不能確認稀有JP尾端。'};
  let sumX2 = 0, sumBaseY2 = 0, sumBaseXY = 0, sumTotalY2 = 0, sumTotalXY = 0;
  let batch = newBatch();
  for (let i = 0; i < hands; i++) {
    session.stacks = {player: normalized.buyIn, npc: normalized.buyIn};
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
    result.conservationError = Math.max(result.conservationError, Math.abs(r.player.stackAfter + r.npc.stackAfter + r.fee - 2 * normalized.buyIn - p.jackpotAward));
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
    const standardError = hands > 1 && result.wagers > 0 ? Math.sqrt(hands / (hands - 1) * residual) / result.wagers : null;
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
