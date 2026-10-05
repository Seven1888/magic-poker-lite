import test from 'node:test';
import assert from 'node:assert/strict';
import {previewNextEncounter} from '../src/entry-encounter.mjs';
import {BOSS_PROFILE_IDS} from '../src/boss-profiles.mjs';
import {createSession, startHand, applyAction, syncOpponentBankroll} from '../src/engine.mjs';
import {nextHandBetConfig} from '../src/next-hand-bet.mjs';

const seeds = [0, 1, 2, 22, 30, 72, 188, 246, 7182, 0xffffffff, 'next-encounter-v40'];
const modes = [
  {mode: 'rotate'},
  ...BOSS_PROFILE_IDS.map(profileId => ({mode: 'fixed', profileId})),
  {mode: 'legacy'}
];
const snapshot = session => ({
  session: JSON.stringify(session),
  hand: JSON.stringify(session.activeHand),
  rngState: session.rng.state()
});
function settledSession(boss = {mode: 'rotate'}, seed = 72) {
  const session = createSession({boss, buyIn: 100000, maxBuyIn: 100000}, seed, {firstSmallBlind: 'random'});
  applyAction(startHand(session), 'fold');
  syncOpponentBankroll(session);
  return session;
}

for (const boss of modes) {
  test(`next opponent previews preserve the live stream and match successive real hands: ${boss.mode}/${boss.profileId || 'all'}`, () => {
    for (const seed of seeds) {
      const session = settledSession(boss, seed), baseline = settledSession(boss, seed);
      for (let turn = 0; turn < 3; turn++) {
        const previous = session.activeHand, before = snapshot(session);
        const preview = previewNextEncounter(session);
        assert.deepEqual(Object.keys(preview), ['bossProfile']);
        assert.ok(Object.isFrozen(preview));
        assert.throws(() => {preview.bossProfile = null;}, TypeError);
        for (let repeat = 0; repeat < 5; repeat++) {
          assert.deepEqual(previewNextEncounter(session), preview);
          assert.deepEqual(snapshot(session), before, `preview must not mutate seed ${seed}, turn ${turn}`);
        }
        const next = startHand(session), expected = startHand(baseline);
        assert.deepEqual(next.bossProfile, preview.bossProfile);
        assert.deepEqual(snapshot(session), snapshot(baseline));
        assert.equal(next.smallBlind, previous.bigBlind);
        if (boss.mode === 'rotate') {
          assert.notEqual(next.bossProfile.id, previous.bossProfile.id);
          assert.equal(next.bossSelection.probability, 1 / 3);
          assert.equal(next.bossSelection.eligibleIds.length, 3);
          assert.ok(!next.bossSelection.eligibleIds.includes(previous.bossProfile.id));
        } else if (boss.mode === 'fixed') {
          assert.equal(next.bossProfile.id, boss.profileId);
          assert.equal(next.bossProfile.id, previous.bossProfile.id);
        } else assert.equal(next.bossProfile, null);
        applyAction(next, 'fold');
        applyAction(expected, 'fold');
        syncOpponentBankroll(session);
        syncOpponentBankroll(baseline);
      }
    }
  });
}

test('BET drafts and confirmed changes retain the same next identity and baseline hand, cards and RNG', () => {
  for (const boss of modes) for (const seed of [0, 22, 30, 188, 246]) {
    for (const bet of [0.02, 10, 50, 2000]) {
      const session = settledSession(boss, seed), baseline = settledSession(boss, seed);
      const before = snapshot(session), previous = session.activeHand;
      const priorResult = JSON.stringify(previous.result), originalConfig = previous.config;
      const preview = previewNextEncounter(session);
      // Quoting and then cancelling a draft must not reserve or consume a draw.
      nextHandBetConfig(session, 2);
      nextHandBetConfig(session, 100);
      assert.deepEqual(previewNextEncounter(session), preview);
      assert.deepEqual(snapshot(session), before);

      session.config = nextHandBetConfig(session, bet);
      baseline.config = nextHandBetConfig(baseline, bet);
      const confirmed = snapshot(session);
      assert.deepEqual(previewNextEncounter(session), preview);
      assert.deepEqual(snapshot(session), confirmed);
      const next = startHand(session), expected = startHand(baseline);
      assert.deepEqual(next.bossProfile, preview.bossProfile);
      assert.deepEqual(next.holes, expected.holes);
      assert.deepEqual(next.deck, expected.deck);
      assert.deepEqual(next.dealAudit, expected.dealAudit);
      assert.deepEqual(snapshot(session), snapshot(baseline));
      assert.equal(next.config.bigBlind, bet);
      assert.equal(previous.config, originalConfig);
      assert.equal(JSON.stringify(previous.result), priorResult);
    }
  }
});

test('next identity rejects unopened, playing, missing-result, foreign and stale hands without RNG changes', () => {
  assert.throws(() => previewNextEncounter(null), Error);
  assert.throws(() => previewNextEncounter(undefined), Error);
  const session = createSession({}, 72, {firstSmallBlind: 'random'});
  const rejectUnchanged = target => {
    const before = snapshot(session);
    assert.throws(() => previewNextEncounter(target), Error);
    assert.deepEqual(snapshot(session), before);
  };
  rejectUnchanged(session);
  const first = startHand(session);
  rejectUnchanged(session);
  applyAction(first, 'fold');
  const result = first.result;
  first.result = null;
  rejectUnchanged(session);
  first.result = result;
  rejectUnchanged({...session, activeHand: first});
  const next = startHand(session);
  applyAction(next, 'fold');
  session.activeHand = first;
  rejectUnchanged(session);
  session.activeHand = next;
  assert.ok(Object.isFrozen(previewNextEncounter(session)));
});

test('next identity reads no seed, private cards or deck and never calls the live RNG', () => {
  const session = settledSession(), hand = session.activeHand;
  const expected = previewNextEncounter(session), rng = session.rng, state = rng.state();
  const forbidden = label => () => {throw new Error(`Preview read ${label}`);};
  Object.defineProperty(session, 'seed', {get: forbidden('seed'), configurable: true});
  for (const key of ['holes', 'deck', 'board']) {
    Object.defineProperty(hand, key, {get: forbidden(key), configurable: true});
  }
  const guardedRng = forbidden('live RNG');
  guardedRng.clone = rng.clone;
  guardedRng.state = rng.state;
  session.rng = guardedRng;
  assert.deepEqual(previewNextEncounter(session), expected);
  assert.equal(rng.state(), state);
  assert.equal(session.rng, guardedRng);
  assert.equal(session.activeHand, hand);
});
