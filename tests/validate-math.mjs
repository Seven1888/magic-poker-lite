import {mkdirSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createSession, startHand, legalActions, applyAction, getActionDistribution, simulate} from '../src/engine.mjs';

const out = fileURLToPath(new URL('../output/heads-up-two-blinds-v1/', import.meta.url));
mkdirSync(out, {recursive: true});
const natural = {rerollChance: 0, maxRerolls: 0, targetScore: 0.48, manual: []};
const runs = [
  {id: 'natural-balanced', config: {deal: {player: natural, npc: natural}}, hands: 100000, seed: 20260929, policy: 'balanced'},
  {id: 'redraw-balanced', config: {}, hands: 100000, seed: 20260930, policy: 'balanced'},
  {id: 'redraw-call', config: {}, hands: 20000, seed: 20260931, policy: 'call'},
  {id: 'redraw-aggressive', config: {}, hands: 20000, seed: 20260932, policy: 'aggressive'},
  {id: 'redraw-tight', config: {}, hands: 20000, seed: 20260933, policy: 'tight'}
].map(run => {
  const result = simulate({...run.config, jackpotEnabled: false}, run);
  console.log(`${run.id}: RTP ${(result.rtp * 100).toFixed(4)}%, CI ${result.ci95.map(n => (n * 100).toFixed(4)).join('–')}%, conservation ${result.conservationError}`);
  return {id: run.id, ...result};
});
writeFileSync(out + 'math-validation.json', JSON.stringify({
  version: 'heads-up-two-blinds-v1', generatedAt: new Date().toISOString(), command: 'node tests/validate-math.mjs',
  economicRule: '小盲自動投入0.5 BET、大盲自動投入1 BET；每手未跟注款項退款。小盲開局棄牌仍損失小盲，雙方已匹配投注形成競爭底池；底池勝方或平手各方按 gross × 0.96 領回。4% 從 gross 收取，雙方對稱。',
  reference: '對稱手牌分布＋相同策略＋輪替大小盲時，玩家grossRTP期望100%，netRTP期望96%。實際玩家策略或不對稱重抽設定會改变玩家RTP。',
  dealOrder: '每手先發給小盲；大小盲輪替，因此玩家與NPC輪流先進行弱起手重抽。',
  runs
}, null, 2), 'utf8');

function example(id, title, seed, config = {}, actions = null) {
  const session = createSession({...config, jackpotEnabled: false}, seed);
  const hand = startHand(session);
  const steps = [];
  let index = 0;
  while (hand.status === 'playing') {
    const legal = legalActions(hand);
    const selected = actions ? actions[index++] : legal.find(item => item.type === 'call' || item.type === 'check').type;
    steps.push({actor: hand.actor, street: hand.street, board: [...hand.board], potBefore: hand.pot,
      stacksBefore: {...hand.stacks}, legal, npcDistribution: hand.actor === 'npc' ? getActionDistribution(hand) : null, action: selected});
    applyAction(hand, selected);
  }
  return {id, title, seed, config: session.config, note: '規則案例使用列出的指定操作序列；npcDistribution供對照，這些示例不是抽籤決策樣本。',
    holes: hand.holes, board: hand.board, steps, history: hand.history, result: hand.result};
}
let tie;
for (let seed = 1; seed < 10000; seed++) {
  const candidate = example('tie', '公牌或共同最佳五張平手，雙方分池並收費', seed);
  if (candidate.result.winner === 'tie') { tie = candidate; break; }
}
const examples = [
  example('fold-refund', '小盲投入5後棄牌；大盲未被跟注的5退回，匹配底池10', 101, {}, ['fold']),
  example('raise-fold-refund', '玩家加注至20，NPC棄牌；玩家未被跟注的10退回', 102, {}, ['raise', 'fold']),
  example('showdown', '雙方過牌或跟注至河牌，攤牌分配競爭底池', 103),
  example('all-in', '雙方帶入20；玩家加注All-in，NPC跟注後自動開完', 104, {minBuyIn: 10, maxBuyIn: 2000, buyIn: 20}, ['allin', 'call']),
  tie
];
writeFileSync(out + 'example-hands.json', JSON.stringify({version: 'heads-up-two-blinds-v1', command: 'node tests/validate-math.mjs', examples}, null, 2), 'utf8');
console.log(`Wrote ${examples.length} rule examples and ${runs.reduce((sum, run) => sum + run.hands, 0)} simulated hands.`);
