import {normalizeOutcomePools} from './outcome-pools.mjs?v=51';

export const OUTCOME_PROFILE_KEY = 'magic-poker-lite.player.v1';

export function normalizePlayerProfile(value) {
  if (!value || value.version !== 1 || !Number.isFinite(value.balance) || value.balance < 0
    || !Number.isSafeInteger(Math.round(value.balance * 1e6)) || !value.outcomePools) throw new TypeError('Invalid player profile.');
  return {version: 1, balance: Math.round(value.balance * 1e6) / 1e6,
    outcomePools: normalizeOutcomePools(value.outcomePools)};
}

// A whole hand is one saved transaction. Refreshing an unfinished demo hand
// restores the preceding settled wallet and pools together, never half a payment.
export function loadPlayerProfile(storage) {
  try {
    if(storage === undefined)storage = globalThis.localStorage;
    const saved = storage?.getItem(OUTCOME_PROFILE_KEY);
    return saved ? normalizePlayerProfile(JSON.parse(saved)) : null;
  } catch { return null; }
}

export function savePlayerProfile(profile, storage) {
  const normalized = normalizePlayerProfile(profile);
  try {
    if(storage === undefined)storage = globalThis.localStorage;
    if(typeof storage?.setItem !== 'function')return false;
    storage.setItem(OUTCOME_PROFILE_KEY, JSON.stringify(normalized)); return true;
  }
  catch { return false; }
}
