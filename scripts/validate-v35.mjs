import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {simulateStudy} from '../src/simulation-study.mjs';
import {simulateTreeStudy} from '../src/tree-study.mjs';
import {BOSS_PROFILE_IDS} from '../src/boss-profiles.mjs';

// Reproduce the v35 validation sample; this is not an RTP calibration run.
const seed = 2026100535, started = Date.now();
const root = new URL('../', import.meta.url);
const output = new URL('output/math-v35-validation.json', root);
const sourcePaths = [
  'src/engine.mjs', 'src/boss-profiles.mjs', 'src/action-tree.mjs',
  'src/tree-study.mjs', 'src/simulation-study.mjs'
];
const sourceHashEncoding = 'SHA-256 of UTF-8 source text; remove a leading BOM and normalize CRLF or CR to LF.';
const hashes = () => Object.fromEntries(sourcePaths.map(path => {
  const source = readFileSync(new URL(path, root), 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  return [path, createHash('sha256').update(source, 'utf8').digest('hex')];
}));
const sourceHashes = hashes();

const configurations = [
  ...BOSS_PROFILE_IDS.map(profileId => ({id: profileId, config: {boss: {mode: 'fixed', profileId}}})),
  {id: 'rotate', config: {boss: {mode: 'rotate'}}}
];
const runs = configurations.map(({id, config}) => {
  const result = simulateStudy(config, {players: 20, entries: 250, seed, policy: 'balanced', mode: 'independent'});
  const counts = {fold: 0, check: 0, call: 0, bet: 0, raise: 0};
  for (const street of Object.values(result.actionStats)) {
    for (const [type, stats] of Object.entries(street.npc)) counts[type] += stats.count;
  }
  const decisions = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const actionFrequency = Object.fromEntries(Object.entries(counts)
    .map(([type, count]) => [type, {count, probability: count / decisions}]));
  const summary = {
    id, hands: result.hands,
    playerWinPoolRate: result.wins / result.hands,
    playerShowdownWinRate: result.showdowns ? result.showdownWins / result.showdowns : null,
    playerNetWinningRate: result.netWinningHands / result.hands,
    baseRtp: result.baseRtp, totalRtp: result.totalRtp, totalCi95: result.ci95,
    ciUnit: result.methodMeta.ciUnit, ciSamples: result.methodMeta.ciSamples,
    conservationError: result.conservationError, bossDecisions: decisions,
    actionFrequency, bossEncounterAudit: result.bossEncounterAudit
  };
  console.log(JSON.stringify(summary));
  return {summary, result};
});

const tree = simulateTreeStudy({boss: {mode: 'rotate'}}, {deals: 1000, seed, policy: 'balanced'});
const treeSummary = {
  deals: tree.deals, totalNodes: tree.totalNodes, totalTerminals: tree.totalTerminals,
  playerWinPoolRate: tree.weighted.winProbability,
  playerShowdownWinRate: tree.weighted.showdownConditionalWinProbability,
  playerNetWinningRate: tree.weighted.profitableHandProbability,
  baseRtp: tree.baseRtp, totalRtp: tree.totalRtp, totalCi95: tree.totalCi95,
  ciUnit: tree.meta.sampleUnit, ciSamples: tree.deals,
  maxConservationError: tree.maxConservationError, maxProbabilityMassError: tree.maxMassError,
  counts: Object.fromEntries(Object.entries(tree.byBoss).map(([id, stats]) => [id, stats.deals]))
};
console.log(JSON.stringify({treeSummary}));
if (JSON.stringify(sourceHashes) !== JSON.stringify(hashes())) {
  throw new Error('Source changed while validation was running; report was not overwritten.');
}
mkdirSync(new URL('output/', root), {recursive: true});
writeFileSync(output, JSON.stringify({
  validationVersion: 2, clientDate: '2026-10-05', timezone: 'Asia/Taipei', seed,
  command: 'node scripts/validate-v35.mjs', sourceHashEncoding, sourceHashes,
  elapsedMs: Date.now() - started,
  purpose: '四型 BOSS 的小樣本功能與數學複核；不是 RTP 校準或稀有彩金認證。',
  scope: {
    simulation: {profiles: [...BOSS_PROFILE_IDS, 'rotate'], players: 20, entries: 250,
      handsPerRun: 5000, policy: 'balanced', mode: 'independent'},
    tree: {deals: 1000, policy: 'balanced', bossMode: 'rotate'}
  },
  limitations: [
    '模擬各固定 BOSS 使用相同主種子，但動作消耗不同 RNG，不是完全相同牌序的配對測試。',
    '固定 BOSS 每手重設資產，採每手 CI；輪替 BOSS 跨手不重複，採 20 位玩家群集 CI。',
    '完整樹每副是獨立新桌、首遇四型各 1/4，副間可重複；同桌遊戲與玩家序列每手排除上一型、其餘各 1/3。',
    '動作頻率分母是實際 BOSS 決策次數，混合各街、牌力、面臨下注與合法動作，不能直接等同單格公開表。',
    'FOLD 為棄牌；CHECK/CALL 為過牌／跟注；BET/RAISE 為開注／加注，保留真實類型以免混淆。',
    '總 RTP 含 JP；0.96 是結算底池返還係數，不是玩家勝率，也不是固定觀測 RTP。',
    '稀有 JP 小樣本不穩定；零次命中不等於機率為零；CI 為常態近似。'
  ],
  summaries: runs.map(run => run.summary), treeSummary, simulation: runs, tree
}, null, 2), 'utf8');
console.log(`Wrote ${output.pathname}: 25,000 hands and 1,000 complete action trees.`);
