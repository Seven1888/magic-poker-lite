import test from 'node:test';
import assert from 'node:assert/strict';
import {refundReportMarkup} from '../src/refund-report-view.mjs';

const report = overrides => ({
  players: 2, policy: 'balanced', seed: 123, initialAsset: 10, targetAsset: 20,
  config: {bigBlind: 1},
  playerResults: [
    {status: 'target', start: 10, end: 20, hands: 2},
    {status: 'insufficient', start: 10, end: 4, hands: 4},
  ],
  ...overrides,
});

test('完整玩家資料計算 50% 退幣率與分組平均', () => {
  const html = refundReportMarkup([report({refundRate: 1, averageHands: 999})]);
  assert.match(html, /退幣率<\/small><strong>50\.00%<\/strong>/);
  assert.match(html, /1 \/ 2 位玩家/);
  assert.match(html, /平均手數<\/small><strong>3<\/strong>/);
  assert.match(html, /存活平均手數<\/small><strong>2<\/strong>/);
  assert.match(html, /停止平均手數<\/small><strong>4<\/strong>/);
  assert.doesNotMatch(html, /退幣率＝/);
});

test('初始即達標保留零手，沒有不足玩家時不假造平均', () => {
  const html = refundReportMarkup([report({players: 1, playerResults: [
    {status: 'target', start: 20, end: 20, hands: 0},
  ]})]);
  assert.match(html, /退幣率<\/small><strong>100\.00%<\/strong>/);
  assert.match(html, /存活平均手數<\/small><strong>0<\/strong>/);
  assert.match(html, /停止平均手數<\/small><strong>—<\/strong>/);
});

test('缺少玩家或仍有未完成玩家時不顯示退幣率', () => {
  const base = report();
  for (const incomplete of [
    report({playerResults: base.playerResults.slice(0, 1)}),
    report({playerResults: [base.playerResults[0], {status: 'censored', hands: 8}]}),
    report({playerResults: [...base.playerResults, {status: 'running', hands: 1}]}),
  ]) {
    const html = refundReportMarkup([incomplete]);
    assert.match(html, /退幣統計尚未完成/);
    assert.doesNotMatch(html, /退幣率|class="metrics"|%/);
  }
});

test('設定文字經 HTML 轉義，渲染不修改輸入', () => {
  const input = report({policy: '<img src=x onerror=alert(1)>', seed: '<seed>&"'});
  const before = JSON.stringify(input);
  const html = refundReportMarkup([input]);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /&lt;seed&gt;&amp;&quot;/);
  assert.doesNotMatch(html, /<img|<seed>/);
  assert.equal(JSON.stringify(input), before);
});
