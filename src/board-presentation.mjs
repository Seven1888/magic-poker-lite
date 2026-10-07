/** Physical cards placed on the table, independent of engine draw/reveal timing. */
export function tableDeckCounts({player = 0, npc = 0, board = 0} = {}) {
  const dealtCards = player + npc + board;
  return {dealtCards, deckRemaining: 52 - dealtCards};
}

/** Empty slots are not dealt cards. Only this street's cards receive a back before revealing. */
export function boardCardView(index, {cards = null, dealt = 0, revealed = 0} = {}) {
  const active = cards !== null, onTable = active && index < dealt;
  const faceUp = onTable && index < revealed;
  return {card: faceUp ? cards[index] : null, back: onTable && !faceUp, visible: true};
}

/** Even a committed all-in runout is presented as three distinct streets. */
export function nextBoardReveal(shown, available) {
  if (shown >= available) return null;
  const end = Math.min(available, shown < 3 ? 3 : shown + 1);
  return {start: shown, end, street: end <= 3 ? 'flop' : end === 4 ? 'turn' : 'river'};
}
