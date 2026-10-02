import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createSession, startHand, legalActions, applyAction, simulate} from '../src/engine.mjs';

const out = fileURLToPath(new URL('../output/playwright/blinds-v26/', import.meta.url));
mkdirSync(out, {recursive: true});
const command = 'node tests/smoke-two-blinds.mjs';
const note = '雙盲功能與帳務試跑，不是RTP校準。每手重設相同帶入、輪替大小盲；JP預設開啟。四策略各2500手不足以確認稀有JP尾端，不能把實測RTP當成商用保證。';
const runs = ['balanced', 'call', 'aggressive', 'tight'].map((policy, index) => {
  const result = simulate({}, {hands: 2500, seed: 20261002 + index, policy});
  assert.equal(result.ruleSet, 'heads-up-two-blinds-v1');
  assert.equal(result.config.smallBlind, 5);
  assert.equal(result.config.bigBlind, 10);
  assert.equal(result.wins + result.losses + result.ties, result.hands);
  assert.equal(result.showdowns + result.folds + result.npcFolds, result.hands);
  assert.ok(result.conservationError < 1e-6);
  assert.ok(Math.abs(result.totalReturns - result.netReturns - result.jackpotAwards) < 1e-6);
  console.log(`${policy}: hands=${result.hands}, baseRtp=${result.baseRtp}, totalRtp=${result.totalRtp}, JP=${result.jackpotHits}, conservation=${result.conservationError}`);
  return result;
});
writeFileSync(out + 'math-smoke.json', JSON.stringify({version: 'heads-up-two-blinds-v1',
  generatedAt: new Date().toISOString(), command, note, hands: 10000, runs}, null, 2), 'utf8');

const cases = [];
function scenario(id, firstSmallBlind, {config = {}, stacks = null, actions = [], expectedPot, expectedRefunds} = {}) {
  const session = createSession({...config, jackpotEnabled: false}, 20, {firstSmallBlind});
  if (stacks) session.stacks = {...stacks};
  const hand = startHand(session);
  const snapshot = () => ({status: hand.status, actor: hand.actor, street: hand.street, pot: hand.pot,
    stacks: {...hand.stacks}, contributions: {...hand.contributions}, legal: legalActions(hand)});
  const opening = snapshot(), steps = [];
  for (const action of actions) {
    const before = snapshot();
    applyAction(hand, action);
    steps.push({action, before, after: snapshot()});
  }
  while (hand.status === 'playing') {
    const action = legalActions(hand).find(item => ['call', 'check'].includes(item.type)).type;
    const before = snapshot();
    applyAction(hand, action);
    steps.push({action, before, after: snapshot()});
  }
  assert.equal(hand.result.pot, expectedPot);
  for (const seat of ['player', 'npc']) assert.equal(hand.result[seat].refund, expectedRefunds[seat]);
  assert.ok(Math.abs(hand.stacks.player + hand.stacks.npc + hand.result.fee
    - hand.stacksBefore.player - hand.stacksBefore.npc) < 1e-6);
  cases.push({id, seed: 20, firstSmallBlind, config: hand.config, opening, steps, history: hand.history, result: hand.result});
}
for (const sb of ['player', 'npc']) {
  const bb = sb === 'player' ? 'npc' : 'player';
  scenario(`opening-fold-sb-${sb}`, sb, {actions: ['fold'], expectedPot: 10, expectedRefunds: {[sb]: 0, [bb]: 5}});
  scenario(`call-check-sb-${sb}`, sb, {expectedPot: 20, expectedRefunds: {player: 0, npc: 0}});
  scenario(`raise-fold-sb-${sb}`, sb, {actions: ['raise', 'fold'], expectedPot: 20, expectedRefunds: {[sb]: 10, [bb]: 0}});
  scenario(`short-sb-${sb}`, sb, {stacks: {[sb]: 3, [bb]: 1000}, expectedPot: 6, expectedRefunds: {[sb]: 0, [bb]: 7}});
  scenario(`short-bb-${bb}`, sb, {stacks: {[sb]: 1000, [bb]: 7}, expectedPot: 14, expectedRefunds: {player: 0, npc: 0}});
  scenario(`fractional-sb-${sb}`, sb, {config: {bigBlind: .03}, actions: ['fold'], expectedPot: .03, expectedRefunds: {[sb]: 0, [bb]: .015}});
}
writeFileSync(out + 'rule-cases.json', JSON.stringify({version: 'heads-up-two-blinds-v1', command,
  note: '12個受控操作案例用於核對雙盲、補差額、未跟注退款、短籌碼與六位小數帳務；不是自然玩家策略或機率估計。案例關閉JP以獨立驗證底池。', cases}, null, 2), 'utf8');
console.log(`Wrote ${runs.length} simulations and ${cases.length} controlled rule cases to ${out}`);
