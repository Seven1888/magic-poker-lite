import test from 'node:test';
import assert from 'node:assert/strict';
import {buildActionTree} from '../src/action-tree.mjs';
import {simulateStudy, studyPlayerSeed} from '../src/simulation-study.mjs';
import {simulateRefundStudy} from '../src/refund-study.mjs';
import {createSession, startHand, legalActions, getActionDistribution, applyAction, playAutomatedHand, beginNewTable} from '../src/engine.mjs';
import {refundReportMarkup} from '../src/refund-report-view.mjs';
import {renderStudyDetails} from '../src/probability-report-view.mjs';

const config = {outcome: {mode: 'fixed-holdem'}, smallBlind: 1};
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

test('完整德州研究樹以 action id 保留三個加注尺寸，機率與實際引擎重播一致', () => {
  const source = {...config, buyIn: 8};
  const tree = buildActionTree(source, {seed: 53, policy: 'balanced'});
  const byId = new Map(tree.nodes.map(node => [node.id, node]));
  const root = byId.get(tree.rootId);
  const raises = root.edges.filter(edge => edge.type === 'raise');
  assert.deepEqual(raises.map(edge => edge.id), ['raise:half', 'raise:pot', 'raise:allin']);
  assert.deepEqual(raises.map(edge => edge.to), [4, 6, 8]);
  const raiseTotal = raises.reduce((sum, edge) => sum + edge.probability, 0);
  raises.forEach((edge, index) => near(edge.probability / raiseTotal, [.5, .35, .15][index]));
  near(tree.summary.terminalProbabilityMass, 1);
  for (const rootChoice of raises) {
    const hand = startHand(createSession(source, 53));
    let node = root;
    while (hand.status === 'playing') {
      const actions = legalActions(hand);
      assert.deepEqual(node.edges.map(edge => edge.id), actions.map(action => action.id));
      const distribution = getActionDistribution(hand, hand.actor, 'balanced');
      for (const edge of node.edges) near(edge.probability, distribution.find(action => action.id === edge.id).probability);
      const chosen = node === root ? actions.find(action => action.id === rootChoice.id)
        : actions.find(action => action.type === 'check' || action.type === 'call');
      node = byId.get(node.edges.find(edge => edge.id === chosen.id).childId);
      applyAction(hand, chosen);
    }
    assert.deepEqual(node.result, hand.result);
  }
});

test('無限外部錢包保留有限桌籌碼增減，只在歸零後重新帶入 100 小盲', () => {
  const options = {mode: 'continuous', unlimitedBankroll: true, players: 2, entries: 100, seed: 'nl', policy: 'aggressive'};
  const report = simulateStudy(config, options);
  assert.equal(report.hands, 200);
  assert.equal(report.outcomeModel, 'fixed-holdem');
  assert.equal(report.methodMeta.blindMode, 'alternating');
  assert.equal(report.outcomePoolSummary, null);
  for (const row of report.playerResults) {
    const session = createSession(report.config, studyPlayerSeed(options.seed, row.playerIndex), {firstSmallBlind: 'random'});
    session.stacks = {player: 0, npc: 0};
    let entries = 0, wager = 0, returns = 0, changedDepth = false;
    for (let handIndex = 0; handIndex < options.entries; handIndex++) {
      if (session.stacks.player <= 0) {
        if (entries > 0) beginNewTable(session, {buyIn: 100});
        else session.stacks = {player: 100, npc: 100};
        entries++;
      }
      const before = session.stacks.player;
      changedDepth ||= before !== 100;
      const hand = playAutomatedHand(session, options.policy);
      assert.equal(hand.result.npc.stackBefore, before);
      assert.ok(hand.result.player.totalContribution <= before + 1e-6);
      wager += hand.result.player.matchedWager; returns += hand.result.player.totalReturn;
    }
    assert.ok(changedDepth, '持續同桌必須保留上一手籌碼，不能逐手重設');
    assert.equal(row.tableEntries, entries);
    assert.equal(row.tableBuyIns, entries * 100);
    near(row.tableClosingChips, session.stacks.player);
    near(row.wagers, wager); near(row.totalReturns, returns);
    near(row.profit, row.tableClosingChips - row.tableBuyIns);
    assert.equal(row.start, null); assert.equal(row.end, null);
  }
  const target = {id: 'study-reports', innerHTML: '', querySelector() { return {innerHTML: ''}; }};
  renderStudyDetails(report, null, target);
  assert.match(target.innerHTML, /外部錢包無限，桌籌碼有限/);
  assert.doesNotMatch(target.innerHTML, /四型|每街各牌力列等權平均|三桶水池開始、累積與支出/);
});

test('退幣研究拆分錢包與桌籌碼，用總資產達標且帶入不計作賭注', () => {
  // Covers both terminal states and a target reached after a genuine new table.
  const report = simulateRefundStudy(config, {players: 3, initialAsset: 250, targetAsset: 400, seed: 53053, policy: 'aggressive'});
  assert.equal(report.tableBuyIn, 100);
  assert.equal(report.assetModel, 'external-wallet-plus-table-chips');
  assert.ok(report.targetPlayers > 0 && report.insufficientPlayers > 0);
  assert.ok(report.playerResults.some(row => row.status === 'target' && row.tableEntries > 1));
  for (const row of report.playerResults) {
    const session = createSession(report.config, row.seed, {firstSmallBlind: 'random'});
    session.stacks = {player: 0, npc: 0};
    let wallet = 250, entries = 0, hands = 0, wager = 0, returns = 0;
    while (wallet + session.stacks.player < 400) {
      assert.ok(hands < 1000);
      if (session.stacks.player <= 0) {
        if (wallet < 100) break;
        wallet -= 100;
        if (entries > 0) beginNewTable(session, {buyIn: 100});
        else session.stacks = {player: 100, npc: 100};
        entries++;
      }
      const hand = playAutomatedHand(session, report.policy);
      wager += hand.result.player.matchedWager; returns += hand.result.player.totalReturn; hands++;
    }
    near(row.wallet, wallet); near(row.tableClosingChips, session.stacks.player);
    near(row.end, wallet + session.stacks.player);
    near(row.end, row.start + returns - wager);
    near(row.matchedWagers, wager); near(row.totalReturns, returns);
    assert.equal(row.tableEntries, entries); assert.equal(row.hands, hands);
    assert.equal(row.status, row.end >= report.targetAsset ? 'target' : 'insufficient');
    if (row.status === 'insufficient') { assert.equal(row.tableClosingChips, 0); assert.ok(row.wallet < 100); }
  }
  const html = refundReportMarkup([report]);
  assert.match(html, /外部錢包/); assert.match(html, /桌籌碼/); assert.match(html, /入桌次數/);
});

test('退幣不足一次帶入保留外部錢包，已達標仍先於入桌判定', () => {
  for (const initialAsset of [0, 99.999999]) {
    const report = simulateRefundStudy(config, {players: 1, initialAsset, targetAsset: 200});
    assert.equal(report.hands, 0); assert.equal(report.tableEntries, 0);
    assert.equal(report.insufficientPlayers, 1);
    assert.equal(report.playerResults[0].wallet, initialAsset);
    assert.equal(report.playerResults[0].end, initialAsset);
  }
  const reached = simulateRefundStudy(config, {players: 1, initialAsset: 50, targetAsset: 40});
  assert.equal(reached.targetPlayers, 1); assert.equal(reached.hands, 0); assert.equal(reached.tableEntries, 0);
});
