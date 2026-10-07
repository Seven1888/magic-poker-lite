import {DEFAULT_CONFIG, normalizeConfig} from './engine.mjs?v=54';

export const CURRENT_LAB_OUTCOME_MODE = 'pooled-holdem';

/** Public tool imports migrate rules only; no player wallet/profile is read or written. */
export function currentLabConfig(source = DEFAULT_CONFIG) {
  const smallBlind = Number(source.smallBlind ?? Number(source.bigBlind ?? DEFAULT_CONFIG.bigBlind) / 2);
  const tableBuyIn = Math.round(smallBlind * 100 * 1e6) / 1e6;
  return normalizeConfig({...source, smallBlind, bigBlind: smallBlind * 2,
    buyIn: tableBuyIn, minBuyIn: tableBuyIn, maxBuyIn: Math.max(tableBuyIn, Number(source.maxBuyIn) || 0),
    targetRtp: 1, outcome: {...source.outcome, mode: CURRENT_LAB_OUTCOME_MODE},
    boss: source.boss?.mode === 'legacy' ? {...source.boss, mode: 'rotate'} : source.boss});
}
