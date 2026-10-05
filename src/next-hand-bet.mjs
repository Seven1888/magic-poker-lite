import {assertHandEntryAssets, minimumAssetsForBet} from './hand-entry.mjs?v=46';

const STREETS = ['preflop', 'flop', 'turn', 'river'];
const round = value => Math.round((value + Number.EPSILON) * 1e6) / 1e6;

/** Quote the next hand's stakes without restarting or funding the current table. */
export function nextHandBetConfig(session, bet) {
  const hand = session?.activeHand;
  if (!hand || hand.session !== session || hand.handNumber !== session.handNumber
    || hand.status !== 'settled' || !hand.result) {
    throw new Error('BET can change only after the current hand has settled.');
  }
  if (!Number.isFinite(bet) || bet < 0.02) {
    throw new RangeError('BET must be a finite number of at least 0.02.');
  }
  const bigBlind = round(bet);
  if (!Number.isFinite(bigBlind)) throw new RangeError('BET is too large.');
  const config = session.config;
  if (bigBlind === config.bigBlind) {
    assertHandEntryAssets(session, config);
    return config;
  }

  const ratio = bigBlind / config.bigBlind;
  const minBuyIn = minimumAssetsForBet(config, bigBlind);
  const maxBuyIn = round(config.maxBuyIn * ratio);
  const smallBlind = round(bigBlind / 2);
  const betSize = {...config.betSize};
  for (const street of STREETS) betSize[street] = round(config.betSize[street] * ratio);
  if (![smallBlind, minBuyIn, maxBuyIn, ...STREETS.map(street => betSize[street])]
    .every(value => Number.isFinite(value) && value > 0)) {
    throw new RangeError('BET is outside the supported range.');
  }
  assertHandEntryAssets(session, {...config, minBuyIn});
  // buyIn is the original table-profit baseline, even if the new limits differ.
  // Never normalize here: normalization would clamp that baseline to the limits.
  return {...config, bigBlind, smallBlind, minBuyIn, maxBuyIn, betSize};
}
