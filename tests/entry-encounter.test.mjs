import test from 'node:test';
import assert from 'node:assert/strict';
import {createEntryEncounter} from '../src/entry-encounter.mjs';
import {BOSS_PROFILE_IDS} from '../src/boss-profiles.mjs';
import {createSession, startHand, applyAction, normalizeConfig} from './legacy-engine.mjs';
import {betOptions, tableConfig} from '../src/entry-model.mjs';

const seeds = [0, 1, 2, 22, 30, 72, 188, 246, 7182, 0xffffffff, 'entry-encounter-v39'];
const modes = [
  {mode: 'rotate'},
  ...BOSS_PROFILE_IDS.map(profileId => ({mode: 'fixed', profileId})),
  {mode: 'legacy'}
];
const options = {firstSmallBlind: 'random'};

test('explicit historical pooled model commits the reserved identity at both BET bucket extremes', () => {
  for (const boss of modes) for (const bet of [1, 2000]) {
    const config = tableConfig(normalizeConfig({boss}), bet, 100000);
    const entry = createEntryEncounter(config, 72);
    const session = createSession(config, entry.seed, options);
    const before = session.rng.state();
    assert.equal(createEntryEncounter(config, 72).bossProfile?.id, entry.bossProfile?.id);
    assert.equal(session.rng.state(), before);
    const hand = startHand(session);
    assert.equal(hand._outcomeTree.complete, true);
    assert.deepEqual(hand.bossProfile, entry.bossProfile);
  }
});

const snapshot = session => ({
  session: JSON.stringify(session),
  hand: JSON.stringify(session.activeHand),
  rngState: session.rng.state()
});
function freezeDeep(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

for (const boss of modes) {
  test(`entry identity matches the first real hand without changing blind, deal or RNG: ${boss.mode}/${boss.profileId || 'all'}`, () => {
    const seen = new Set();
    for (const seed of seeds) {
      const config = {boss, outcome:{mode:'legacy-deck'}};
      const baseline = createSession(config, seed, options);
      const baselineOpening = snapshot(baseline);
      const expected = startHand(baseline);
      const entry = createEntryEncounter(config, seed);
      const session = createSession(config, entry.seed, options);
      assert.deepEqual(snapshot(session), baselineOpening, `entry must leave the real opening untouched for seed ${seed}`);
      assert.equal(session.handNumber, 0);
      assert.equal(session.activeHand, undefined);
      assert.deepEqual(session.stacks, {player: 10000, npc: 10000});
      const hand = startHand(session);
      assert.deepEqual(entry.bossProfile, hand.bossProfile, `identity for seed ${seed}`);
      assert.deepEqual(hand.bossSelection, expected.bossSelection);
      assert.equal(hand.smallBlind, expected.smallBlind);
      assert.equal(hand.bigBlind, expected.bigBlind);
      assert.deepEqual(hand.holes, expected.holes);
      assert.deepEqual(hand.deck, expected.deck);
      assert.deepEqual(hand.dealAudit, expected.dealAudit);
      assert.deepEqual(snapshot(session), snapshot(baseline));
      if (entry.bossProfile) seen.add(entry.bossProfile.id);

      // Starting the following encounter must keep the original stream and
      // previous-opponent exclusion, including after an early first-hand fold.
      applyAction(hand, 'fold');
      applyAction(expected, 'fold');
      const next = startHand(session);
      startHand(baseline);
      assert.deepEqual(snapshot(session), snapshot(baseline));
      if (boss.mode === 'rotate') {
        assert.equal(hand.bossSelection.probability, 0.5);
        assert.equal(next.bossSelection.probability, 1);
        assert.notEqual(next.bossProfile.id, entry.bossProfile.id);
      }
    }
    if (boss.mode === 'rotate') assert.deepEqual([...seen].sort(), [...BOSS_PROFILE_IDS].sort());
    if (boss.mode === 'fixed') assert.deepEqual([...seen], [boss.profileId]);
    if (boss.mode === 'legacy') assert.equal(seen.size, 0);
  });
}

test('all entry BET levels retain the reserved identity and seed in every boss mode', () => {
  for (const boss of modes) {
    const base = normalizeConfig({boss, outcome:{mode:'legacy-deck'}});
    for (const seed of [0, 22, 30, 188, 246]) {
      const entry = createEntryEncounter(base, seed);
      for (const bet of betOptions(base)) {
        const config = tableConfig(base, bet, 100000);
        const scaledEntry = createEntryEncounter(config, seed);
        assert.equal(scaledEntry.seed, entry.seed);
        assert.deepEqual(scaledEntry.bossProfile, entry.bossProfile);
        const session = createSession(config, entry.seed, options);
        assert.deepEqual(session.stacks, {player: 100000, npc: 100000});
        assert.equal(session.handNumber, 0);
        assert.equal(session.activeHand, undefined);
        assert.deepEqual(startHand(session).bossProfile, entry.bossProfile);
      }
    }
  }
});

test('entry reservations are frozen public identity records and leave nested configuration unchanged', () => {
  for (const boss of modes) {
    const config = normalizeConfig({boss, buyIn: 875.6, maxBuyIn: 2000,
      betSize: {preflop: 15, flop: 30, turn: 80, river: 120},
      deal: {player: {rerollChance: 0.37}, npc: {rerollChance: 0.19}}});
    const original = JSON.stringify(config);
    freezeDeep(config);
    const entry = createEntryEncounter(config, 72);
    assert.deepEqual(Object.keys(entry).sort(), ['bossProfile', 'seed']);
    assert.ok(Object.isFrozen(entry));
    assert.equal(entry.seed, 72);
    if (entry.bossProfile) assert.ok(Object.isFrozen(entry.bossProfile));
    else assert.equal(entry.bossProfile, null);
    assert.throws(() => {entry.seed = 1;}, TypeError);
    assert.equal(JSON.stringify(config), original);
  }
});

test('repeated entry previews cannot mutate a live session, its hand, bankroll or RNG', () => {
  const session = createSession({}, 246, options);
  startHand(session);
  const before = snapshot(session);
  const first = createEntryEncounter(session.config, session.seed);
  for (let i = 0; i < 8; i++) {
    assert.deepEqual(createEntryEncounter(session.config, session.seed), first);
    createEntryEncounter(session.config, seeds[i]);
    assert.deepEqual(snapshot(session), before);
  }
});

test('entry previews and real deals agree with a carried opponent identity across table re-entry', () => {
  for (const mode of ['fixed-holdem', 'legacy-deck']) for (const lastBossProfileId of [null, 'caller', 'maniac']) {
    for (const seed of seeds) {
      const config = {outcome: {mode}, boss: {mode: 'rotate'}};
      const previous = {lastBossProfileId};
      const entry = createEntryEncounter(config, seed, previous);
      const session = createSession(config, seed, {...options, ...previous}), opening = snapshot(session);
      assert.deepEqual(createEntryEncounter(config, seed, previous), entry);
      assert.deepEqual(snapshot(session), opening, 'preview does not mutate the live entry');
      assert.equal(session.handNumber, 0); assert.equal(session.activeHand, undefined);
      const hand = startHand(session);
      assert.equal(hand.bossProfile.id, entry.bossProfile.id);
      if (lastBossProfileId) assert.notEqual(hand.bossProfile.id, lastBossProfileId);
      applyAction(hand, 'fold');
      const reentry = createEntryEncounter(config, `${seed}:next-table`, {lastBossProfileId: session.lastBossProfileId});
      const nextSession = createSession(config, reentry.seed, {...options, lastBossProfileId: session.lastBossProfileId});
      const next = startHand(nextSession);
      assert.equal(next.bossProfile.id, reentry.bossProfile.id);
      assert.notEqual(next.bossProfile.id, hand.bossProfile.id);
    }
  }
});

test('entry validates carried identities and omitted history keeps the original first selection', () => {
  for (const lastBossProfileId of ['sniper', 'trapper', false, 0, '', [], {}]) {
    assert.throws(() => createEntryEncounter({}, 1, {lastBossProfileId}), /lastBossProfileId/);
  }
  for (const seed of seeds) {
    assert.deepEqual(createEntryEncounter({}, seed), createEntryEncounter({}, seed, {lastBossProfileId: null}));
    assert.deepEqual(createEntryEncounter({}, seed), createEntryEncounter({}, seed, {lastBossProfileId: undefined}));
  }
});
