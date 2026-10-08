import {DEFAULT_CONFIG, normalizeConfig} from './engine.mjs?v=60';

export const CURRENT_LAB_OUTCOME_MODE = 'natural-holdem';

/** Omit inactive historical controls from public natural-mode exports and reports. */
export function labConfigSnapshot(config) {
  return config.outcome?.mode === CURRENT_LAB_OUTCOME_MODE
    ? {...config, outcome: {mode: CURRENT_LAB_OUTCOME_MODE}} : config;
}

/** Public tool imports migrate rules only; no player wallet/profile is read or written. */
export function currentLabConfig(source = DEFAULT_CONFIG) {
  const smallBlind = Number(source.smallBlind ?? Number(source.bigBlind ?? DEFAULT_CONFIG.bigBlind) / 2);
  const tableBuyIn = Math.round(smallBlind * 100 * 1e6) / 1e6;
  return labConfigSnapshot(normalizeConfig({...source, smallBlind, bigBlind: smallBlind * 2,
    buyIn: tableBuyIn, minBuyIn: tableBuyIn, maxBuyIn: Math.max(tableBuyIn, Number(source.maxBuyIn) || 0),
    targetRtp: 1, jackpotEnabled: false, outcome: {mode: CURRENT_LAB_OUTCOME_MODE},
    deal: {player: {manual: [], rerollChance: 0, maxRerolls: 0}, npc: {manual: [], rerollChance: 0, maxRerolls: 0}},
    boss: source.boss?.mode === 'fixed' ? source.boss : {...source.boss, mode: 'random'}}));
}
