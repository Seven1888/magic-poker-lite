const SEATS = ['player', 'npc'];
const round = value => Math.round((value + Number.EPSILON) * 1e6) / 1e6;

/** Use one calculation for the displayed minimum and both entry paths. */
export function minimumAssetsForBet(config, bet) {
  return round(config.minBuyIn / config.bigBlind * round(bet));
}

/** Read the next hand's asset requirement without changing the table or RNG. */
export function handEntryStatus(session, config = session?.config) {
  const minimumAssets = config?.minBuyIn ?? null;
  const validMinimum = Number.isFinite(minimumAssets) && minimumAssets > 0;
  const insufficientSeats = SEATS.filter(seat => !validMinimum
    || !Number.isFinite(session?.stacks?.[seat]) || session.stacks[seat] < minimumAssets);
  return {canStart: insufficientSeats.length === 0, minimumAssets, insufficientSeats};
}

/** Enforce the same gate for an unchanged BET, a new BET and engine entry. */
export function assertHandEntryAssets(session, config = session?.config) {
  const status = handEntryStatus(session, config);
  if (!status.canStart) {
    const error = new RangeError('Not enough chips. Choose a lower BET to start the next hand.');
    error.code = 'INSUFFICIENT_HAND_ASSETS';
    error.minimumAssets = status.minimumAssets;
    error.insufficientSeats = status.insufficientSeats;
    throw error;
  }
  return status;
}
