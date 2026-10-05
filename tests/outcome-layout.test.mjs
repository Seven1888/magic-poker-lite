import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDeck, createRng, shuffle, compareHands, evaluateBest} from '../src/poker.mjs';
import {createOutcomeLayout, layoutMatchesQualification} from '../src/outcome-layout.mjs';
import {validateOutcomeLayout} from '../src/prebuilt-outcome-tree.mjs';

const fixedBoard = ['2c', '3d', '7h', '9s', 'Jc'];
function dealer(player = ['As', 'Ad'], npc = ['Qc', 'Qd'], board = fixedBoard) {
  return () => ({holes: {player: [...player], npc: [...npc]},
    deck: [...board, ...makeDeck().filter(card => ![...player, ...npc, ...board].includes(card))],
    audit: {player: {manual: true, marker: 'preserved-player-audit'}, npc: {marker: 'placeholder-boss-audit'}}});
}
function normalDealer(config, rng) {
  const player = config.deal?.player?.manual || [], npc = config.deal?.npc?.manual || [];
  const rest = shuffle(makeDeck().filter(card => ![...player, ...npc].includes(card)), rng);
  return {holes: {player: player.length ? [...player] : rest.splice(0, 2), npc: npc.length ? [...npc] : rest.splice(0, 2)}, deck: rest};
}
const options = extra => ({config: {deal: {player: {manual: ['As', 'Ad']}}}, rng: createRng(192),
  dealHoles: dealer(), ...extra});

test('one layout fixes player and board while realizing both true poker targets with all 52 unique cards', () => {
  const input = options({}), before = structuredClone(input.config);
  const layout = createOutcomeLayout(input);
  assert.deepEqual(input.config, before);
  assert.deepEqual(layout.player, ['As', 'Ad']); assert.deepEqual(layout.board, fixedBoard);
  assert.equal(layout.dealAudit.player.marker, 'preserved-player-audit');
  assert.ok(compareHands([...layout.player, ...layout.board], [...layout.boss.win, ...layout.board]) > 0);
  assert.ok(compareHands([...layout.player, ...layout.board], [...layout.boss.nonWin, ...layout.board]) <= 0);
  validateOutcomeLayout(layout);
  for (const target of ['win', 'nonWin']) {
    const used = [...layout.player, ...layout.boss[target], ...layout.board];
    const remaining = layout.deckOrder.filter(card => !used.includes(card));
    assert.equal(remaining.length, 43); assert.equal(new Set([...used, ...remaining]).size, 52);
    assert.equal(layout.dealAudit.npcByTarget[target].stopReason, 'outcome-target');
  }
});

test('ties satisfy nonWin and an impossible fixed board returns null without changing its player cards', () => {
  const board = ['As', 'Ks', 'Qs', 'Js', 'Ts'];
  const base = {config: {}, dealHoles: dealer(['2c', '3d'], ['4c', '5d'], board)};
  const layout = createOutcomeLayout(options({...base, requiredTargets: ['nonWin']}));
  assert.equal(compareHands([...layout.player, ...board], [...layout.boss.nonWin, ...board]), 0);
  assert.equal(createOutcomeLayout(options({...base, requiredTargets: ['win', 'nonWin']})), null);
});

test('manual Boss cards are never replaced, and contradictory targets fail explicitly before dealing', () => {
  const config = {deal: {player: {manual: ['As', 'Ad']}, npc: {manual: ['Qc', 'Qd']}}};
  const rng = createRng(3), before = rng.state(); let calls = 0;
  assert.throws(() => createOutcomeLayout(options({config, rng, dealHoles: () => { calls++; }})),
    error => error.code === 'MANUAL_BOSS_TARGET_CONFLICT');
  assert.equal(calls, 0); assert.equal(rng.state(), before);
  const layout = createOutcomeLayout(options({config, requiredTargets: ['win']}));
  assert.deepEqual(layout.boss.win, ['Qc', 'Qd']);
  assert.equal(layout.dealAudit.npcByTarget.win.stopReason, 'manual');
  assert.equal(createOutcomeLayout(options({config, requiredTargets: ['nonWin']})), null);
  assert.throws(() => createOutcomeLayout(options({config, requiredTargets: ['win'],
    dealHoles: dealer(['Ah', 'Ac'])})), error => error.code === 'MANUAL_CARDS_CHANGED');
});

test('qualification builds exact royal, straight-flush and quads layouts with player participation', () => {
  for (const [tier, player] of [['royal', ['As', '7d']], ['straightFlush', ['5s', '9d']], ['quads', ['As', 'Ad']]]) {
    const config = {deal: {player: {manual: player}}}, qualification = {tier, award: 100, bucketIndex: 2};
    let layout;
    const rng = createRng('special-' + tier);
    for (let attempt = 0; attempt < 20 && !layout; attempt++) layout = createOutcomeLayout({config, qualification,
      rng, dealHoles: normalDealer, requiredTargets: ['win']});
    assert.ok(layout, tier); assert.deepEqual(layout.player, player);
    assert.equal(layoutMatchesQualification({...layout, qualification}), true);
    assert.deepEqual(layout.qualification, qualification);
    validateOutcomeLayout(layout, {requiredTargets: ['win']});
    assert.ok(evaluateBest(layout.board).category < 7);
  }
});

test('qualification rejects board-only awards and quads with only a player kicker', () => {
  assert.equal(layoutMatchesQualification({player: ['As', 'Kd'], board: ['2s', '2h', '2d', '2c', '3d'],
    qualification: {tier: 'quads'}}), false);
  assert.equal(layoutMatchesQualification({player: ['2c', '3d'], board: ['As', 'Ks', 'Qs', 'Js', 'Ts'],
    qualification: {tier: 'royal'}}), false);
  assert.equal(createOutcomeLayout({config: {deal: {player: {manual: ['2c', '3d']}}}, qualification: {tier: 'royal'},
    rng: createRng(23), dealHoles: normalDealer, requiredTargets: ['win']}), null);
});

test('caller qualification predicate can exclude all unpaid special layouts without touching shared config', () => {
  const board = ['As', 'Ks', 'Qs', 'Js', 'Ts']; let calls = 0;
  assert.equal(createOutcomeLayout(options({config: {}, dealHoles: dealer(['2c', '3d'], ['4c', '5d'], board),
    requiredTargets: ['nonWin'], qualifyLayout: ({playerEvaluation, qualification}) => {
      calls++; assert.equal(qualification, null); return playerEvaluation.category < 7;
    }})), null);
  assert.equal(calls, 1);
});

test('layout draws are reproducible on independent RNG clones and corrupt deals are rejected', () => {
  const rng = createRng(9082), state = rng.state();
  const one = createOutcomeLayout(options({rng: rng.clone()}));
  const two = createOutcomeLayout(options({rng: rng.clone()}));
  assert.deepEqual(one, two); assert.equal(rng.state(), state);
  assert.throws(() => createOutcomeLayout(options({dealHoles: () => ({holes: {player: ['As', 'Ad'], npc: ['Qc', 'Qd']},
    deck: makeDeck().slice(0, 48)})})), error => error.code === 'INVALID_DEAL');
});
