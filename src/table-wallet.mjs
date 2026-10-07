import {createRng} from './poker.mjs?v=58';
import {endHandForTableExit} from './engine.mjs?v=58';
import {migrateOutcomePoolsWithoutJackpot} from './outcome-pools.mjs?v=58';

const round = value => Math.round((value + Number.EPSILON) * 1e6) / 1e6;
const validMoney = value => Number.isFinite(value) && value >= 0 && Number.isSafeInteger(Math.round(value * 1e6));

/** An entry is a transfer, never a wager or an additional source of chips. */
export function buyInFromWallet(balance, smallBlind) {
  const buyIn = round(smallBlind * 100);
  if (!validMoney(balance) || !validMoney(buyIn) || smallBlind <= 0) throw new RangeError('Invalid buy-in.');
  if (balance < buyIn) throw new RangeError('Not enough balance for this buy-in. Choose a lower small blind.');
  return {balance: round(balance - buyIn), chips: buyIn, buyIn};
}

export function cashOutToWallet(balance, chips) {
  if (!validMoney(balance) || !validMoney(chips) || !validMoney(round(balance + chips))) throw new RangeError('Invalid cash-out.');
  return round(balance + chips);
}

/** Close a saved table once; callers must save this entire profile before exposing its returned balance. */
export function closeSavedTable(profile) {
  if (!profile?.table) return profile;
  const session = restoreTableSession(profile.table);
  if (session.activeHand) endHandForTableExit(session.activeHand);
  return {version: 2, balance: cashOutToWallet(profile.balance, session.stacks.player),
    outcomePools: migrateOutcomePoolsWithoutJackpot(session.outcomePools), table: null,
    lastBossProfileId: session.lastBossProfileId ?? profile.lastBossProfileId ?? null};
}

/** Save the committed hand and RNG together; animation never becomes an account transaction. */
export function snapshotTableSession(session) {
  if (!session) return null;
  if (!['fixed-holdem', 'pooled-holdem'].includes(session.config.outcome.mode)) throw new TypeError('This table model does not support active-hand saves.');
  const {activeHand, rng, ...state} = session;
  const hand = activeHand ? Object.fromEntries(Object.entries(activeHand).filter(([key]) => !['session', 'rng'].includes(key))) : null;
  return structuredClone({version: 1, rngState: rng.state(), session: state, hand});
}

export function restoreTableSession(snapshot) {
  if (!snapshot || snapshot.version !== 1 || !Number.isInteger(snapshot.rngState)
    || !['fixed-holdem', 'pooled-holdem'].includes(snapshot.session?.config?.outcome?.mode)) throw new TypeError('Invalid table snapshot.');
  const data = structuredClone(snapshot), session = data.session;
  if (!['player', 'npc'].every(seat => validMoney(session.stacks?.[seat]))) throw new TypeError('Invalid saved chips.');
  session.rng = createRng(data.rngState);
  if (data.hand) {
    const hand = data.hand;
    if (!['playing', 'settled'].includes(hand.status) || !Array.isArray(hand.deck) || !Array.isArray(hand.board)
      || !['player', 'npc'].every(seat => hand.holes?.[seat]?.length === 2 && validMoney(hand.stacks?.[seat]))) {
      throw new TypeError('Invalid saved hand.');
    }
    hand.session = session;
    hand.rng = session.rng;
    hand.stacks = session.stacks;
    session.activeHand = hand;
  }
  return session;
}
