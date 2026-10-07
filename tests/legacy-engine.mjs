// Existing scenario fixtures intentionally exercise the v52 money/action model.
// New-model tests import the production engine directly. Explicit modes are never overwritten.
import * as engine from '../src/engine.mjs';
export * from '../src/engine.mjs';
export const DEFAULT_CONFIG = engine.HISTORICAL_DEFAULT_CONFIG;
export const historicalConfig = (source = {}) => ({...source, outcome: {mode: 'prebuilt-pools', ...source.outcome}});
export const normalizeConfig = (source = {}) => engine.normalizeConfig(historicalConfig(source));
export const createSession = (source = {}, seed, options) => engine.createSession(historicalConfig(source), seed, options);
export const simulate = (source = {}, options) => engine.simulate(historicalConfig(source), options);
