import test from 'node:test';
import assert from 'node:assert/strict';
import {createOutcomePools} from '../src/outcome-pools.mjs';
import {OUTCOME_PROFILE_KEY, normalizePlayerProfile, loadPlayerProfile, savePlayerProfile} from '../src/outcome-profile.mjs';

function storageWith(initial = null) {
  const values = new Map(initial === null ? [] : [[OUTCOME_PROFILE_KEY, initial]]), writes = [];
  return {values, writes, getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { writes.push({key, value}); values.set(key, value); }};
}
const profile = (extra = {}) => ({version: 1, balance: 100,
  outcomePools: createOutcomePools({paidAction: [1, 2, 3], special: [4, 5, 6],
    paidActionCooldown: 2, qualificationSequence: 7, handSequence: 9}), ...extra});

test('normalization keeps wallet and all three persistent pools in one isolated six-decimal profile', () => {
  const source = profile({balance: 100.1234567}), result = normalizePlayerProfile(source);
  assert.equal(result.balance, 100.123457);
  assert.equal(result.outcomePools.handSequence, 9);
  assert.equal(result.outcomePools.paidActionCooldown, 2);
  assert.equal(result.outcomePools.qualificationSequence, 7);
  result.outcomePools.buckets[0].paidAction = 999;
  assert.equal(source.outcomePools.buckets[0].paidAction, 1);
});

test('one storage write saves wallet, pools, global cooldown and cross-table sequence atomically', () => {
  const storage = storageWith(), source = profile();
  assert.equal(savePlayerProfile(source, storage), true);
  assert.equal(storage.writes.length, 1); assert.equal(storage.writes[0].key, OUTCOME_PROFILE_KEY);
  const saved = JSON.parse(storage.writes[0].value);
  assert.deepEqual(saved, normalizePlayerProfile(source));
  source.balance = 0; source.outcomePools.buckets[0].special = 0;
  const loaded = loadPlayerProfile(storage);
  assert.equal(loaded.balance, 100); assert.equal(loaded.outcomePools.buckets[0].special, 0);
  assert.equal(loaded.outcomePools.buckets[0].paidAction, 5);
  loaded.balance = 5; loaded.outcomePools.buckets[1].paidAction = 80;
  assert.equal(loadPlayerProfile(storage).balance, 100);
  assert.equal(loadPlayerProfile(storage).outcomePools.buckets[1].paidAction, 7);
});

test('unsaved unfinished-hand changes cannot partially overwrite the last complete wallet/pool transaction', () => {
  const storage = storageWith(); savePlayerProfile(profile(), storage);
  const live = loadPlayerProfile(storage);
  live.balance -= 20; live.outcomePools.buckets[0].paidAction = 0;
  live.outcomePools.paidActionCooldown = 0;
  const restored = loadPlayerProfile(storage);
  assert.equal(restored.balance, 100); assert.equal(restored.outcomePools.buckets[0].paidAction, 5);
  assert.equal(restored.outcomePools.paidActionCooldown, 2);
  const settled = profile({balance: 130}); settled.outcomePools.handSequence = 10;
  settled.outcomePools.lastSettlement = {id: '10', audit: {handId: '10', paidActionAdded: 0.792, specialAdded: 0.198}};
  assert.equal(savePlayerProfile(settled, storage), true);
  assert.deepEqual(loadPlayerProfile(storage), normalizePlayerProfile(settled));
  assert.equal(storage.writes.length, 2);
});

test('missing or corrupted version-one pool state is rejected instead of silently resetting personal pools', () => {
  const invalid = [null, {}, {...profile(), version: 3}, {...profile(), balance: -1},
    {...profile(), balance: '100'}, {...profile(), balance: Number.MAX_SAFE_INTEGER},
    {version: 1, balance: 100}, {...profile(), outcomePools: null},
    {...profile(), outcomePools: {version: 1, buckets: []}}];
  for (const value of invalid) {
    assert.throws(() => normalizePlayerProfile(value));
    assert.equal(loadPlayerProfile(storageWith(JSON.stringify(value))), null);
  }
  assert.equal(loadPlayerProfile(storageWith('{broken')), null);
  assert.equal(loadPlayerProfile(storageWith()), null);
});

test('version two retains wallet and an isolated table snapshot without discarding legacy pools', () => {
  const source=profile({version:2,balance:9000,table:{version:1,rngState:42,session:{config:{outcome:{mode:'fixed-holdem'}},stacks:{player:990,npc:980}},hand:null}});
  const storage=storageWith();assert.equal(savePlayerProfile(source,storage),true);
  const saved=loadPlayerProfile(storage);assert.deepEqual(saved,source);
  source.table.session.stacks.player=0;
  assert.equal(saved.table.session.stacks.player,990);
  assert.deepEqual(saved.outcomePools,profile().outcomePools);
  assert.throws(()=>normalizePlayerProfile(profile({version:2,table:{version:1,rngState:0,session:{config:{outcome:{mode:'prebuilt-pools'}}}}})));
});

test('unavailable or throwing storage reports failure and preserves the previous saved transaction', () => {
  assert.equal(savePlayerProfile(profile(), null), false);
  assert.equal(savePlayerProfile(profile(), {}), false);
  assert.equal(loadPlayerProfile(null), null);
  assert.equal(loadPlayerProfile({getItem: () => { throw new Error('blocked'); }}), null);
  const previous = JSON.stringify(profile()), storage = storageWith(previous);
  storage.setItem = () => { throw new Error('quota'); };
  assert.equal(savePlayerProfile(profile({balance: 999}), storage), false);
  assert.equal(storage.values.get(OUTCOME_PROFILE_KEY), previous);
});

test('version two keeps the previous opponent across cash-out and reload', () => {
  const storage=storageWith();
  for(const lastBossProfileId of [null,'caller','maniac']){
    const source=profile({version:2,table:null,lastBossProfileId});
    assert.equal(savePlayerProfile(source,storage),true);
    assert.deepEqual(loadPlayerProfile(storage),normalizePlayerProfile(source));
  }
  assert.throws(()=>normalizePlayerProfile(profile({version:2,table:null,lastBossProfileId:'other'})));
});

test('a browser that throws while accessing localStorage does not crash profile load or save', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {configurable: true, get: () => { throw new Error('security'); }});
  try {
    assert.equal(loadPlayerProfile(), null);
    assert.equal(savePlayerProfile(profile()), false);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  }
});
