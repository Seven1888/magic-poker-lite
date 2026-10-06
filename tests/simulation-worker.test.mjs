import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {simulateStudy, studyPlayerSeed} from '../src/simulation-study.mjs';
import {simulateRefundStudy} from '../src/refund-study.mjs';
import {buildActionTree} from '../src/action-tree.mjs';
import {simulateTreeStudy} from '../src/tree-study.mjs';

// 只替換瀏覽器 Worker 外殼；訊息處理及研究計算均使用正式程式與真實引擎。
const source = readFileSync(new URL('../src/simulation-worker.mjs', import.meta.url), 'utf8');
const workerScript = new Script(source.split(/\r?\n/).filter(line => !line.startsWith('import ')).join('\n'),
  {filename: 'simulation-worker.mjs'});
function runWorker(data, onMessage) {
  const messages = [];
  const self = {postMessage(message) {
    const copied = structuredClone(message);
    messages.push(copied);
    onMessage?.(copied);
  }};
  workerScript.runInNewContext({self, simulateStudy, simulateRefundStudy, buildActionTree, simulateTreeStudy});
  self.onmessage({data: structuredClone(data)});
  return messages;
}
const general = {players: 1, entries: 1, hands: 1, mode: 'independent', sliceSize: 1, seed: 1};
const policies = ['balanced', 'call', 'aggressive', 'tight'];
const legacy = {outcome: {mode: 'legacy-deck'}, jackpotEnabled: false};
const terminalResult = messages => {
  assert.equal(messages.filter(message => message.type === 'error').length, 0);
  assert.equal(messages.filter(message => message.type === 'result').length, 1);
  assert.equal(messages.at(-1).type, 'result');
  return messages.at(-1);
};

test('一次開始統計沿用真實預建引擎，最後同時發布一般及退幣報表', () => {
  const config = {}, refund = {players: 1, initialAsset: 50, targetAsset: 51};
  const messages = runWorker({type: 'run', config, ...general, policies: ['call'], refund});
  const result = terminalResult(messages);
  assert.equal(result.reports.length, 1);
  assert.equal(result.refundReports.length, 1);
  assert.deepEqual(result.reports[0], simulateStudy(config, {...general, policy: 'call'}));
  assert.deepEqual(result.refundReports[0], simulateRefundStudy(config, {...refund, seed: general.seed, policy: 'call'}));
  const report = result.refundReports[0];
  assert.equal(report.outcomeModel, 'prebuilt-pools');
  assert.equal(report.hands, 1);
  assert.equal(report.refundRate, 1);
  assert.equal(report.playerResults[0].end, 100);
  assert.equal(report.outcomePoolSummary.hands, 1);
  const firstRefund = messages.findIndex(message => message.type === 'refundProgress');
  assert.ok(firstRefund > messages.findIndex(message => message.type === 'partial'));
  assert.ok(messages.slice(0, -1).every(message => !('refundReports' in message) && message.type !== 'refundResult'));
});

test('四策略共用頂層種子，退幣玩家數獨立且全數完成後才發布', () => {
  const refund = {players: 2, initialAsset: 0, targetAsset: 0, seed: 999, policies: ['call']};
  const messages = runWorker({type: 'run', config: legacy, ...general, policies, refund});
  const result = terminalResult(messages);
  assert.deepEqual(result.reports.map(report => report.policy), policies);
  assert.deepEqual(result.refundReports.map(report => report.policy), policies);
  for (const report of result.reports) {
    assert.equal(report.players, general.players);
    assert.equal(report.seed, general.seed);
  }
  for (const report of result.refundReports) {
    assert.equal(report.players, refund.players);
    assert.equal(report.completedPlayers, refund.players);
    assert.equal(report.seed, general.seed);
    assert.equal(report.refundRate, 1);
    assert.equal(report.hands, 0);
    assert.deepEqual(report.playerResults.map(player => player.seed),
      [studyPlayerSeed(general.seed, 0), studyPlayerSeed(general.seed, 1)]);
  }
  const firstRefund = messages.findIndex(message => message.type === 'refundProgress');
  assert.equal(messages.slice(0, firstRefund).filter(message => message.type === 'partial').length, policies.length);
  const progress = messages.filter(message => message.type === 'refundProgress');
  assert.deepEqual([...new Set(progress.map(message => message.policy))], policies);
  assert.ok(progress.every(message => message.policyCount === policies.length && message.totalPlayers === refund.players));
  assert.equal(progress.at(-1).policyIndex, policies.length - 1);
  assert.equal(progress.at(-1).completedPlayers, refund.players);
  assert.ok(messages.slice(0, -1).every(message => !('refundReports' in message) && message.type !== 'refundResult'));
});

test('退幣參數失敗時只保留已完成的一般策略，不發布完成或退幣報表', () => {
  const messages = runWorker({type: 'run', config: legacy, ...general, policies: ['call'],
    refund: {players: 1, initialAsset: 50, targetAsset: -1}});
  assert.equal(messages.filter(message => message.type === 'partial').length, 1);
  assert.equal(messages.at(-1).type, 'error');
  assert.match(messages.at(-1).message, /退幣目標資產/);
  assert.ok(messages.every(message => message.type !== 'result' && message.type !== 'refundResult'
    && !('refundReports' in message)));
});

test('比較策略中途退幣失敗，不洩出先完成策略的退幣比例', () => {
  const messages = runWorker({type: 'run', config: legacy, ...general, policies,
    refund: {players: 2, initialAsset: 0, targetAsset: 0}}, message => {
    if (message.type === 'refundProgress' && message.policyIndex === 1) throw new Error('受控退幣階段失敗');
  });
  assert.equal(messages.filter(message => message.type === 'partial').length, policies.length);
  assert.equal(messages.filter(message => message.type === 'refundProgress' && message.policyIndex === 0).at(-1).completedPlayers, 2);
  assert.equal(messages.at(-1).type, 'error');
  assert.equal(messages.at(-1).message, '受控退幣階段失敗');
  assert.ok(messages.every(message => message.type !== 'result' && message.type !== 'refundResult'
    && !('refundReports' in message) && !('refundRate' in message)));
});

test('未附退幣設定的舊 run 保留一般統計行為', () => {
  const messages = runWorker({type: 'run', config: legacy, ...general, policies: ['call']});
  const result = terminalResult(messages);
  assert.deepEqual(result.reports, [simulateStudy(legacy, {...general, policy: 'call'})]);
  assert.deepEqual(result.refundReports, []);
  assert.ok(messages.some(message => message.type === 'progress'));
  assert.equal(messages.filter(message => message.type === 'partial').length, 1);
  assert.ok(messages.every(message => !message.type.startsWith('refund')));
});
