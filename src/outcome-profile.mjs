import {normalizeOutcomePools, migrateOutcomePoolsWithoutJackpot} from './outcome-pools.mjs?v=59';

export const OUTCOME_PROFILE_KEY = 'magic-poker-lite.player.v1';

export function normalizePlayerProfile(value) {
  if (!value || ![1, 2].includes(value.version) || !Number.isFinite(value.balance) || value.balance < 0
    || !Number.isSafeInteger(Math.round(value.balance * 1e6)) || !value.outcomePools) throw new TypeError('Invalid player profile.');
  const profile = {version: value.version, balance: Math.round(value.balance * 1e6) / 1e6,
    outcomePools: normalizeOutcomePools(value.outcomePools)};
  if (value.version === 2) {
    if (value.table !== null && value.table !== undefined
      && (value.table.version !== 1 || !Number.isInteger(value.table.rngState)
        || !value.table.session || !['fixed-holdem', 'pooled-holdem'].includes(value.table.session.config?.outcome?.mode))) {
      throw new TypeError('Invalid saved table.');
    }
    profile.table = value.table ? structuredClone(value.table) : null;
    if (value.lastBossProfileId !== undefined) {
      if (value.lastBossProfileId !== null && !['caller', 'maniac'].includes(value.lastBossProfileId)) throw new TypeError('Invalid previous opponent.');
      profile.lastBossProfileId = value.lastBossProfileId;
    }
  }
  // An existing table must settle under its saved accounting contract first.
  // Profiles outside a table can migrate now; repeating the merge is harmless.
  if (!profile.table) profile.outcomePools = migrateOutcomePoolsWithoutJackpot(profile.outcomePools);
  return profile;
}

// Wallet, pools and the optional active table form one saved transaction.
// Version two retains committed actions so a saved table can be settled and cashed out on the next page load.
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
