// Numeric best-five ranking for already validated 5–7 card inputs. Cards use
// suit * 13 + rank, with rank 0 = deuce and rank 12 = ace. This helper never
// draws cards or accesses a game/session. Larger scores always rank higher.
export const HOLDEM_CATEGORY_UNIT = 15 ** 5;
const R1 = 15 ** 4, R2 = 15 ** 3, R3 = 15 ** 2, R4 = 15;
const HIGH = new Uint8Array(8192), STRAIGHT = new Uint8Array(8192);
const COUNT = new Uint8Array(8192), TOP_FIVE = new Uint32Array(8192);
for (let mask = 1; mask < 8192; mask++) {
  COUNT[mask] = COUNT[mask >>> 1] + (mask & 1);
  let digits = 0, place = R1;
  for (let rank = 12; rank >= 0; rank--) if (mask & (1 << rank)) {
    if (!HIGH[mask]) HIGH[mask] = rank + 2;
    if (place >= 1) { digits += (rank + 2) * place; place /= 15; }
  }
  TOP_FIVE[mask] = digits;
  for (let high = 12; high >= 4; high--) if (((mask >>> (high - 4)) & 31) === 31) {
    STRAIGHT[mask] = high + 2; break;
  }
  if (!STRAIGHT[mask] && (mask & 0x100f) === 0x100f) STRAIGHT[mask] = 5;
}

/** Internal hot path: callers validate card count, range and uniqueness once. */
export function rankEncodedHand(cards) {
  let ranks = 0, pairs = 0, trips = 0, quads = 0;
  let spades = 0, hearts = 0, diamonds = 0, clubs = 0;
  for (let index = 0; index < cards.length; index++) {
    const card = cards[index], rank = card % 13, bit = 1 << rank;
    quads |= trips & bit; trips |= pairs & bit; pairs |= ranks & bit; ranks |= bit;
    if (card < 13) spades |= bit;
    else if (card < 26) hearts |= bit;
    else if (card < 39) diamonds |= bit;
    else clubs |= bit;
  }
  const flush = COUNT[spades] >= 5 ? spades : COUNT[hearts] >= 5 ? hearts
    : COUNT[diamonds] >= 5 ? diamonds : COUNT[clubs] >= 5 ? clubs : 0;
  if (flush && STRAIGHT[flush]) return 8 * HOLDEM_CATEGORY_UNIT + STRAIGHT[flush] * R1;
  if (quads) {
    const four = HIGH[quads];
    return 7 * HOLDEM_CATEGORY_UNIT + four * R1 + HIGH[ranks & ~(1 << (four - 2))] * R2;
  }
  const three = HIGH[trips], remainingPairs = pairs & ~(three ? 1 << (three - 2) : 0);
  if (three && remainingPairs) return 6 * HOLDEM_CATEGORY_UNIT + three * R1 + HIGH[remainingPairs] * R2;
  if (flush) return 5 * HOLDEM_CATEGORY_UNIT + TOP_FIVE[flush];
  if (STRAIGHT[ranks]) return 4 * HOLDEM_CATEGORY_UNIT + STRAIGHT[ranks] * R1;
  if (three) {
    let kickers = ranks & ~(1 << (three - 2));
    const first = HIGH[kickers]; kickers &= ~(1 << (first - 2));
    return 3 * HOLDEM_CATEGORY_UNIT + three * R1 + first * R2 + HIGH[kickers] * R3;
  }
  const firstPair = HIGH[pairs];
  if (firstPair) {
    const secondPair = HIGH[pairs & ~(1 << (firstPair - 2))];
    let kickers = ranks & ~(1 << (firstPair - 2));
    if (secondPair) {
      kickers &= ~(1 << (secondPair - 2));
      return 2 * HOLDEM_CATEGORY_UNIT + firstPair * R1 + secondPair * R2 + HIGH[kickers] * R3;
    }
    const first = HIGH[kickers]; kickers &= ~(1 << (first - 2));
    const second = HIGH[kickers]; kickers &= ~(1 << (second - 2));
    return HOLDEM_CATEGORY_UNIT + firstPair * R1 + first * R2 + second * R3 + HIGH[kickers] * R4;
  }
  return TOP_FIVE[ranks];
}
