import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {Worker, isMainThread, parentPort, workerData} from 'node:worker_threads';

// Offline calibration only. The real next hand never determines its entry price.
const SOURCE_PATHS = ['scripts/calibrate-entry-budget.mjs', 'src/engine.mjs', 'src/poker.mjs',
  'src/jackpot.mjs', 'src/boss-profiles.mjs', 'src/hand-entry.mjs', 'src/outcome-pools.mjs',
  'src/prebuilt-outcome-tree.mjs', 'src/outcome-layout.mjs', 'src/action-tree.mjs',
  'src/tree-study.mjs', 'src/probability-pools.mjs'];
const sourceHashes = () => Object.fromEntries(SOURCE_PATHS.map(path => [path,
  createHash('sha256').update(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
    .replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')).digest('hex')]));
function assertSources(expected) {
  const actual = sourceHashes();
  for (const path of SOURCE_PATHS) if (actual[path] !== expected[path]) {
    throw new Error(`Calibration source changed during execution: ${path}. Report was not replaced.`);
  }
}

if (!isMainThread) {
  assertSources(workerData.sourceHashes);
  const {simulateTreeStudy} = await import('../src/tree-study.mjs');
  const started = Date.now();
  const study = simulateTreeStudy({outcome: {mode: 'prebuilt-pools',
    initialPaidActionPools: [0, 0, 0], initialSpecialPools: [0, 0, 0], initialPaidActionCooldown: 0}},
  {deals: workerData.deals, seed: workerData.seed, policy: 'balanced',
    onProgress: progress => parentPort.postMessage({kind: 'progress', cohort: workerData.index, ...progress})});
  assertSources(workerData.sourceHashes);
  parentPort.postMessage({kind: 'complete', index: workerData.index, elapsedMs: Date.now() - started,
    sourceVerified: true, study});
} else {
  const options = Object.fromEntries(process.argv.slice(2).map(arg => {
    const match = /^--(deals|workers|output)=(.+)$/.exec(arg);
    if (!match) throw new Error(`Unknown argument: ${arg}`);
    return [match[1], match[2]];
  }));
  const seed = 2026100546, deals = Number(options.deals ?? 1000), workers = Number(options.workers ?? 4);
  if (!Number.isSafeInteger(deals) || deals < 2 || deals > 10000 || !Number.isSafeInteger(workers)
    || workers < 1 || workers > 4 || deals % workers || deals / workers < 2) {
    throw new RangeError('Use 2..10000 deals, 1..4 workers, equal cohorts with at least two deals each.');
  }
  const started = Date.now(), hashes = sourceHashes();
  const {createRng} = await import('../src/engine.mjs');
  const {combinePoolStudySummaries} = await import('../src/probability-pools.mjs');
  assertSources(hashes);
  const rng = createRng(seed), seeds = [];
  while (seeds.length < workers) {
    const candidate = Math.floor(rng() * 0x100000000) >>> 0;
    if (!seeds.includes(candidate)) seeds.push(candidate);
  }
  const liveWorkers = [];
  let cohorts;
  try {
    cohorts = await Promise.all(seeds.map((cohortSeed, index) => new Promise((resolve, reject) => {
      const worker = new Worker(new URL(import.meta.url), {workerData: {index, seed: cohortSeed,
        deals: deals / workers, sourceHashes: hashes}});
      liveWorkers.push(worker);
      let finished = false;
      worker.on('message', message => {
        if (message.kind === 'complete') { finished = true; resolve(message); }
        else console.log(JSON.stringify({...message, elapsedMs: Date.now() - started}));
      });
      worker.on('error', reject);
      worker.on('exit', code => { if (code !== 0 || !finished) reject(new Error(`Cohort ${index} exited ${code} without a complete result.`)); });
    })));
  } catch (error) {
    await Promise.allSettled(liveWorkers.map(worker => worker.terminate()));
    throw error;
  }
  assertSources(hashes);
  cohorts.sort((a, b) => a.index - b.index);
  const studies = cohorts.map(cohort => cohort.study), config = studies[0].config;
  if (studies.some(study => JSON.stringify(study.config) !== JSON.stringify(config))) throw new Error('Cohort config mismatch.');
  const meanContribution = studies.reduce((sum, study) => sum + study.deals * study.weighted.totalContribution, 0) / deals;
  // Merge centered sample sums of squares, preserving both within- and between-cohort variance.
  const m2 = studies.reduce((sum, study) => sum + study.contributionStandardError ** 2 * study.deals * (study.deals - 1)
    + study.deals * (study.weighted.totalContribution - meanContribution) ** 2, 0);
  const standardError = Math.sqrt(m2 / (deals - 1) / deals);
  const meanBetMultiple = meanContribution / config.bigBlind;
  const contributionCi95 = [meanContribution - 1.96 * standardError, meanContribution + 1.96 * standardError];
  const checks = {complete: studies.every(study => study.complete), sourceUnchangedDuringExecution: true,
    cohortSeedsDistinct: new Set(seeds).size === workers,
    probabilityMass: studies.reduce((sum, study) => sum + study.averageTerminalProbabilityMass * study.deals, 0) / deals,
    maxProbabilityMassError: Math.max(...studies.map(study => study.maxMassError)),
    maxConservationError: Math.max(...studies.map(study => study.maxConservationError)),
    maxPoolLedgerError: Math.max(...studies.map(study => study.outcomePoolSummary.maxLedgerError))};
  if (!checks.complete || checks.maxProbabilityMassError > 1e-9 || checks.maxConservationError > 1e-5 || checks.maxPoolLedgerError > 1e-5) {
    throw new Error(`Calibration audit failed: ${JSON.stringify(checks)}`);
  }
  const report = {kind: 'entry-budget-calibration', version: 2, clientDate: '2026-10-05',
    command: `node scripts/calibrate-entry-budget.mjs${process.argv.slice(2).length ? ` ${process.argv.slice(2).join(' ')}` : ''}`,
    seed, deals, workers, cohortSeeds: seeds, policy: 'balanced', config,
    model: studies[0].meta.cardModel, modelVersion: studies[0].meta.modelVersion,
    measure: '玩家整手原始實扣 totalContribution，含後來退回的下注；不使用有效投入、淨損益或 RTP。',
    method: '主 seed 以 createRng 派生互異 cohort seed；每副牌完整預建全部合法結果分支，按 balanced 玩家與每街固定 BOSS 機率加權。每副均從零水池開始。',
    sampleUnit: 'one-cold-start-deal-one-full-action-tree',
    uncertainty: '以各副完整樹的加權投入為獨立樣本，合併 cohort 內與 cohort 間平方差；95% 常態近似區間為平均 ±1.96 SE。分支不是獨立樣本。',
    meanContribution, contributionStandardError: standardError, contributionCi95,
    meanBetMultiple, betMultipleStandardError: standardError / config.bigBlind,
    betMultipleCi95: contributionCi95.map(value => value / config.bigBlind),
    recommendedMinimumBetMultiple: Math.max(1, Math.ceil(meanBetMultiple)),
    currentMinimumBetMultiple: config.minBuyIn / config.bigBlind, minimumIsEveryHand: true,
    blindCounts: {player: studies.reduce((sum, study) => sum + study.blindCounts.player, 0),
      npc: studies.reduce((sum, study) => sum + study.blindCounts.npc, 0)},
    totalNodes: studies.reduce((sum, study) => sum + study.totalNodes, 0),
    totalTerminals: studies.reduce((sum, study) => sum + study.totalTerminals, 0),
    outcomePoolSummary: combinePoolStudySummaries(studies.map(study => study.outcomePoolSummary), {unit: 'cohorts'}),
    limitations: ['balanced 為門檻的固定參考策略，不代表所有玩家的實際平均。',
      '平均預算不保證每條昂貴分支都付得起；合法局中全下仍保留。',
      '每副零水池；這不是跨手池平穩分布、長期 RTP 或 99% 回報承諾。',
      '門檻由離線樣本決定，不按秘密牌面或玩家近期輸贏浮動。',
      '區間只反映此模型與策略下的抽樣誤差，不包含模型選擇或玩家策略差異。'],
    sourceHashAlgorithm: 'sha256 UTF-8, BOM removed, LF normalized', sourceHashes: hashes,
    checks, cohorts, elapsedMs: Date.now() - started};
  assertSources(hashes);
  const output = options.output ?? 'output/entry-budget-v46.json';
  writeFileSync(new URL(`../${output}`, import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({kind: 'calibration-complete', output, model: report.model, deals,
    meanBetMultiple, betMultipleCi95: report.betMultipleCi95,
    recommendedMinimumBetMultiple: report.recommendedMinimumBetMultiple, checks, elapsedMs: report.elapsedMs}));
}
