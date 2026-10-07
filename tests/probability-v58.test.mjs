import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {currentLabConfig} from '../src/probability-config.mjs';
import {simulateStudy} from '../src/simulation-study.mjs';
import {renderStudyDetails} from '../src/probability-report-view.mjs';
import {refundReportMarkup} from '../src/refund-report-view.mjs';
import {renderBossProbabilityTables, renderBossStudy} from '../src/boss-probability-view.mjs';

function target(id) {
  const children = new Map();
  return {id, innerHTML: '', children, querySelector(selector) {
    if (!children.has(selector)) children.set(selector, {innerHTML: ''});
    return children.get(selector);
  }};
}

test('正式機率工具匯入遷移冪等，固定研究型保留，其他舊型轉隨機', () => {
  const source = {jackpotEnabled: true, boss: {mode: 'rotate', profileId: 'caller'},
    outcome: {mode: 'prebuilt-pools', paidActionBudgetShare: .8, specialUseChance: 1,
      initialPaidActionPools: [1, 2, 3], initialSpecialPools: [4, 5, 6], initialPaidActionCooldown: 2}};
  const before = structuredClone(source), migrated = currentLabConfig(source);
  assert.deepEqual(source, before);
  assert.equal(migrated.jackpotEnabled, false);
  assert.equal(migrated.boss.mode, 'random');
  assert.equal(migrated.outcome.paidActionBudgetShare, 1);
  assert.deepEqual(migrated.outcome.initialPaidActionPools, [5, 7, 9]);
  assert.deepEqual(migrated.outcome.initialSpecialPools, [0, 0, 0]);
  assert.equal(migrated.outcome.initialPaidActionCooldown, 2);
  assert.deepEqual(currentLabConfig(migrated), migrated);
  assert.equal(currentLabConfig({...source, boss: {mode: 'fixed', profileId: 'maniac'}}).boss.mode, 'fixed');
});

test('正式完成研究畫面與退款水池不呈現已移除的獎勵，JSON保留零相容欄位', () => {
  const config = currentLabConfig({smallBlind: 5, outcome: {initialPaidActionPools: [200, 0, 0]}});
  const report = simulateStudy(config, {mode: 'continuous', unlimitedBankroll: true,
    players: 2, entries: 6, policy: 'aggressive', seed: 58010, sliceSize: 2});
  const view = target('study-reports');
  renderStudyDetails(report, null, view);
  const markup = view.innerHTML + [...view.children.values()].map(child => child.innerHTML).join('');
  assert.doesNotMatch(markup, /JP|彩金|特殊池|jackpot|specialAward|specialStart|兩型輪替|排除上一型/);
  assert.match(markup, /2× POT／4× POT/);
  assert.match(markup, /每手隨機遇到/);
  assert.match(markup, /三桶付費池跨手保留/);
  assert.equal(report.jackpotAwards, 0);
  assert.equal(report.outcomePoolSummary.specialAward, 0);
  assert.equal(report.totalReturns, report.netReturns);
  const refund = refundReportMarkup([{...report, players: 1, playerResults: [{status: 'target', hands: 1,
    start: 100, end: 200}], initialAsset: 100, targetAsset: 200}]);
  assert.doesNotMatch(refund, /JP|彩金|特殊池/);
});

test('正式表單與對手文案顯示獨立隨機，機率表仍有十二列', () => {
  const html = readFileSync(new URL('../probability.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /jackpot|JP|特殊牌型獎勵|兩型輪替/);
  assert.match(html, /value="random">每手隨機遇到/);
  const el = {innerHTML: ''}, root = {getElementById: () => el};
  renderBossProbabilityTables(root);
  assert.equal((el.innerHTML.match(/class="boss-raise-prob"/g) || []).length, 12);
  assert.match(el.innerHTML, /每手兩種 BOSS 各 50%/);
  renderBossStudy({byBoss: {}, bossEncounterAudit: {mode: 'random', consecutiveRepeats: 2}}, root);
  assert.match(el.innerHTML, /連續同型 2 次/);
  assert.match(el.innerHTML, /連續同型是合法結果/);
  assert.doesNotMatch(el.innerHTML, /違規連續同型/);
});
