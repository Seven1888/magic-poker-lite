import test from 'node:test';
import assert from 'node:assert/strict';
import {currentLabConfig} from '../src/probability-config.mjs';
import {createSession, playAutomatedHand, beginNewTable, syncOpponentBankroll} from '../src/engine.mjs';
import {simulateStudy} from '../src/simulation-study.mjs';
import {simulateRefundStudy} from '../src/refund-study.mjs';
import {refundReportMarkup} from '../src/refund-report-view.mjs';
import {NATURAL_HOLDEM_RULES} from '../src/natural-holdem.mjs';
import {buildActionTree} from '../src/action-tree.mjs';
import {simulateTreeStudy} from '../src/tree-study.mjs';
import {renderActionTree} from '../src/probability-report-view.mjs';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

test('public config removes imported manual cards and inactive result controls without converting old pools', () => {
  const source = {smallBlind: 1, outcome: {mode: 'pooled-holdem', conversionRate: .7,
    initialPaidActionPools: [10, 20, 30], initialSpecialPools: [40, 50, 60], initialPaidActionCooldown: 9},
    deal: {player: {manual: ['As', 'Ah']}, npc: {manual: ['Ks', 'Kh']}}, jackpotEnabled: true};
  const before = structuredClone(source), config = currentLabConfig(source);
  assert.deepEqual(source, before);
  assert.deepEqual(config.outcome, {mode: 'natural-holdem'});
  assert.deepEqual(config.deal.player.manual, []);
  assert.deepEqual(config.deal.npc.manual, []);
  assert.equal(config.buyIn, 100);
  assert.equal(config.jackpotEnabled, false);
  assert.deepEqual(currentLabConfig(JSON.parse(JSON.stringify(config))), config);
});

test('natural continuous sample ledger replays with finite table chips and player-clustered uncertainty', () => {
  const config = currentLabConfig({smallBlind: 1});
  const options = {mode: 'continuous', unlimitedBankroll: true, players: 3, entries: 30,
    policy: 'aggressive', seed: 0, sliceSize: 8};
  const report = simulateStudy(config, options);
  assert.equal(report.outcomeModel, 'natural-holdem');
  assert.deepEqual(report.rulesSnapshot, NATURAL_HOLDEM_RULES);
  assert.equal(report.bossProfileVersion, NATURAL_HOLDEM_RULES.bossPolicy);
  assert.equal(report.ruleSet, NATURAL_HOLDEM_RULES.id);
  assert.equal(report.seed, 0);
  assert.equal(report.hands, 90);
  assert.equal(report.methodMeta.ciUnit, 'player');
  assert.equal(report.methodMeta.ciSamples, 3);
  assert.equal(report.outcomePoolSummary, null);
  assert.equal(report.jackpotAwards, 0);
  assert.equal(report.fees, 0);
  assert.equal(report.rtpTarget, null);
  assert.deepEqual(report.config.outcome, {mode: 'natural-holdem'});
  assert.match(report.methodMeta.limitation, /有限樣本.*長期 RTP/);
  assert.match(report.methodMeta.rtpDefinition, /BOSS 投入不列分母/);
  near(report.totalRtp, report.totalReturns / report.wagers);
  for (const row of report.playerResults) {
    const session = createSession(report.config, row.seed, {firstSmallBlind: 'random'});
    session.stacks = {player: 0, npc: 0};
    let tables = 0, wagers = 0, returns = 0;
    for (let index = 0; index < options.entries; index++) {
      if (session.stacks.player <= 0) {
        if (tables) beginNewTable(session, {buyIn: 100});
        else session.stacks = {player: 100, npc: 100};
        tables++;
      }
      const hand = playAutomatedHand(session, options.policy);
      assert.equal(hand.result.outcomePoolAudit, null);
      wagers += hand.result.player.matchedWager;
      returns += hand.result.player.totalReturn;
      syncOpponentBankroll(session);
    }
    near(row.wagers, wagers); near(row.totalReturns, returns);
    assert.equal(row.tableEntries, tables);
    near(row.tableClosingChips, tables * 100 + returns - wagers);
  }
  assert.deepEqual(report, simulateStudy(config, options));
});

test('natural cashout report keeps wallet plus chips, marks policy/sample limits, and does not release imported pools', () => {
  const report = simulateRefundStudy({smallBlind: 1, outcome: {mode: 'natural-holdem',
    initialPaidActionPools: [100000, 0, 0], initialSpecialPools: [100000, 0, 0]}},
  {players: 3, initialAsset: 150, targetAsset: 200, seed: 60031, policy: 'aggressive'});
  assert.equal(report.completedPlayers, 3);
  assert.equal(report.assetModel, 'external-wallet-plus-table-chips');
  assert.deepEqual(report.rulesSnapshot, NATURAL_HOLDEM_RULES);
  assert.equal(report.outcomePoolSummary, null);
  for (const row of report.playerResults) {
    near(row.end, row.wallet + row.tableClosingChips);
    near(row.end, row.start + row.totalReturns - row.matchedWagers);
    assert.ok(['target', 'insufficient'].includes(row.status));
  }
  const markup = refundReportMarkup([report]);
  assert.match(markup, /natural-holdem-v1/);
  assert.match(markup, /natural-boss-pressure-v1/);
  assert.match(markup, /種子 60031/);
  assert.match(markup, /實際完成.*手/);
  assert.match(markup, /不是 RTP/);
  assert.doesNotMatch(markup, /跨手水池明細/);
});

test('natural short-stack action research preserves locked cards, version metadata and explicit node bounds', () => {
  const config = {outcome: {mode: 'natural-holdem'}, smallBlind: 1, buyIn: 2};
  const tree = buildActionTree(config, {seed: 60044, stateLimit: 100});
  assert.equal(tree.outcomeModel, 'natural-holdem');
  assert.deepEqual(tree.rulesSnapshot, NATURAL_HOLDEM_RULES);
  assert.equal(tree.meta.cardModel, 'shared-engine-natural-holdem');
  assert.equal(tree.meta.bossProfileVersion, NATURAL_HOLDEM_RULES.bossPolicy);
  assert.equal(tree.meta.rngStateAfterDeal, tree.meta.rngStateAfterTraversal);
  const children = new Map(), target = {id: 'tree-detail', innerHTML: '', querySelector(selector) {
    if (!children.has(selector)) children.set(selector, {innerHTML: ''});
    return children.get(selector);
  }};
  renderActionTree(tree, target);
  const markup = target.innerHTML + [...children.values()].map(child => child.innerHTML).join('');
  assert.match(markup, /牌序樣本 1 副/);
  assert.match(markup, /natural-boss-pressure-v1/);
  assert.doesNotMatch(markup, /JP|含 JP 返還/);
  near(tree.summary.terminalProbabilityMass, 1);
  for (const node of tree.nodes) {
    assert.deepEqual(node.holes.player, tree.cards.player);
    assert.deepEqual(node.holes.npc, tree.cards.npc);
    assert.deepEqual(node.board, tree.cards.boardRunout.slice(0, node.board.length));
  }
  assert.throws(() => buildActionTree(config, {stateLimit: 1}), /未產生截斷結果/);
  assert.throws(() => simulateTreeStudy(config, {deals: 2, stateLimit: 1}), /未產生截斷結果/);
  const report = simulateTreeStudy(config, {deals: 2, seed: 60044, stateLimit: 100});
  assert.equal(report.outcomeModel, 'natural-holdem');
  assert.equal(report.meta.cardModel, 'shared-engine-natural-holdem');
  assert.equal(report.meta.bossProfileVersion, NATURAL_HOLDEM_RULES.bossPolicy);
  assert.match(report.meta.description, /有限牌序樣本/);
  assert.equal(report.outcomePoolSummary, null);
});
