import {DEFAULT_CONFIG, legalActions} from './engine.mjs?v=53';

const STREET_NAMES = Object.freeze({preflop: '翻牌前', flop: '翻牌', turn: '轉牌', river: '河牌'});
const round = value => Math.round((value + Number.EPSILON) * 1e6) / 1e6;
const amountText = value => value.toLocaleString('en-US', {maximumFractionDigits:6});

/** Public, read-only HUD values. Never returns hidden cards, seeds or game objects. */
export function getHudSnapshot({session = null, hand = null, config = DEFAULT_CONFIG, closedTable = null, busy = false} = {}) {
  const activeSession = session || hand?.session || null;
  const tableConfig = hand?.config || activeSession?.config || config || DEFAULT_CONFIG;
  const closed = !activeSession && !hand ? closedTable : null;
  const playing = hand?.status === 'playing';
  const buyIn = activeSession?.config?.buyIn ?? closed?.buyIn ?? config?.buyIn ?? DEFAULT_CONFIG.buyIn;
  const playerBalance = activeSession?.stacks.player ?? hand?.stacks.player ?? closed?.playerBalance ?? null;
  const npcBalance = activeSession?.stacks.npc ?? hand?.stacks.npc ?? closed?.npcBalance ?? null;
  const playerBase = playing ? hand.stacksBefore.player : playerBalance;
  const npcBase = playing ? hand.stacksBefore.npc : npcBalance;
  // Bets still on the table are unsettled, not losses. Use the hand's opening stack.
  const settledTableProfit = closed?.settledTableProfit ?? (playerBase === null ? null : round(playerBase - buyIn));
  const npcSettledTableProfit = npcBase === null ? null : round(npcBase - buyIn);
  const playerActions = playing && hand.actor === 'player' ? legalActions(hand, 'player') : [];
  const actions = busy ? [] : playerActions;
  const callAmount = playerActions.find(action => action.type === 'call')?.amount ?? 0;
  const street = hand?.street || 'preflop';
  const maxStreetTotal = playing ? round(Math.min(
    hand.streetBets.player + hand.stacks.player,
    hand.streetBets.npc + hand.stacks.npc
  )) : 0;

  let turnLabel;
  if (!hand) turnLabel = activeSession ? '準備下一手' : closed ? '已離桌 · 可重新入座' : '先選擇帶入籌碼';
  else if (hand.status === 'settled') turnLabel = '本手已結算';
  else if (hand.actor === 'npc') turnLabel = '面具客行動中';
  else if (busy) turnLabel = '牌局處理中';
  else if (callAmount > 0) turnLabel = `輪到你 · 跟注需 ${amountText(callAmount)}`;
  else turnLabel = playerActions.some(action => action.type === 'raise') ? '輪到你 · 可過牌或加注'
    : playerActions.some(action => action.type === 'bet') ? '輪到你 · 可過牌或下注' : '輪到你 · 可過牌';

  return {
    deckRemaining: hand ? hand.deck.length : 52,
    dealtCards: hand ? 4 + hand.board.length : 0,
    playerBalance, npcBalance,
    balanceLabel: activeSession || hand ? '桌上可用' : closed ? '上桌帶出' : '尚未入座',
    buyIn,
    buyInLabel: activeSession || hand ? '本桌帶入' : closed ? '上桌帶入' : '預備帶入',
    playerCommitted: hand?.contributions.player ?? 0,
    npcCommitted: hand?.contributions.npc ?? 0,
    playerStreetPaid: hand?.streetBets.player ?? 0,
    npcStreetPaid: hand?.streetBets.npc ?? 0,
    settledTableProfit, npcSettledTableProfit,
    smallBlind: tableConfig.smallBlind ?? DEFAULT_CONFIG.smallBlind,
    bigBlind: tableConfig.bigBlind ?? DEFAULT_CONFIG.bigBlind,
    increment: tableConfig.betSize?.[street] ?? DEFAULT_CONFIG.betSize[street],
    dealerSeat: hand?.smallBlind ?? null,
    playerSeat: hand ? hand.smallBlind === 'player' ? 'SB' : 'BB' : null,
    npcSeat: hand ? hand.smallBlind === 'npc' ? 'SB' : 'BB' : null,
    streetName: hand ? STREET_NAMES[street] : '尚未發牌',
    turnLabel, callAmount, maxStreetTotal, actions
  };
}
