import {normalizeOutcomePools, OUTCOME_BET_BUCKETS} from './outcome-pools.mjs?v=58';

const FIELDS = ['paidActionBudgetUsed', 'paidActionAdded', 'specialAdded', 'specialAward'];
const totals = () => Object.fromEntries(FIELDS.map(key => [key, 0]));

export function createPoolStudySummary(pools, {bucketPolicy = 'exact-stakes'} = {}) {
  if (!pools) throw new Error('預建結果研究缺少初始水池。');
  if (!['exact-stakes','blind-ranges'].includes(bucketPolicy)) throw new Error('未知研究水池分桶規則。');
  const start = normalizeOutcomePools(pools);
  const ranges = [{minimumExclusive:0,maximumInclusive:10}, {minimumExclusive:10,maximumInclusive:500}, {minimumExclusive:500,maximumInclusive:null}];
  const labels = ['0 < 大盲 ≤ 10','10 < 大盲 ≤ 500','大盲 > 500'];
  return {bucketPolicy, baseUnit: 'big-blind', start, end: null, hands: 0, ...totals(), maxLedgerError: 0,
    byBucket: start.buckets.map((bucket, bucketIndex) => ({bucketIndex,
      ...(bucketPolicy === 'blind-ranges' ? {label:labels[bucketIndex],range:ranges[bucketIndex],bets:[]}
        : {bets:[...OUTCOME_BET_BUCKETS[bucketIndex]]}),
      paidActionStart: bucket.paidAction, specialStart: bucket.special, paidActionEnd: null, specialEnd: null,
      hands: 0, ...totals()}))};
}

/** Record real settled audits, or probability-weighted terminal audits for a cold-start tree. */
export function collectPoolStudyAudit(summary, audit, weight = 1) {
  if (!summary) return;
  if (!Number.isFinite(weight) || weight < 0) throw new Error('水池稽核權重須為有限非負數。');
  if (!audit || !Number.isInteger(audit.bucketIndex) || !summary.byBucket[audit.bucketIndex]
    || !FIELDS.every(key => Number.isFinite(audit[key]) && audit[key] >= 0)) {
    throw new Error('預建結果研究缺少完整水池結算稽核。');
  }
  const bucket = summary.byBucket[audit.bucketIndex];
  summary.hands += weight; bucket.hands += weight;
  for (const key of FIELDS) { summary[key] += audit[key] * weight; bucket[key] += audit[key] * weight; }
  const paidError = Math.abs(audit.before.paidAction + audit.paidActionAdded - audit.paidActionBudgetUsed - audit.after.paidAction);
  const specialError = Math.abs(audit.before.special + audit.specialAdded - audit.specialAward - audit.after.special);
  if (![paidError, specialError].every(Number.isFinite)) throw new Error('水池結算稽核含無效餘額。');
  summary.maxLedgerError = Math.max(summary.maxLedgerError, paidError, specialError);
}

export function finishPoolStudySummary(summary, endPools = null) {
  if (!summary) return null;
  summary.end = endPools ? normalizeOutcomePools(endPools) : null;
  for (const bucket of summary.byBucket) {
    const expectedPaid = bucket.paidActionStart + bucket.paidActionAdded - bucket.paidActionBudgetUsed;
    const expectedSpecial = bucket.specialStart + bucket.specialAdded - bucket.specialAward;
    bucket.paidActionEnd = summary.end?.buckets[bucket.bucketIndex].paidAction ?? expectedPaid;
    bucket.specialEnd = summary.end?.buckets[bucket.bucketIndex].special ?? expectedSpecial;
    summary.maxLedgerError = Math.max(summary.maxLedgerError,
      Math.abs(bucket.paidActionEnd - expectedPaid), Math.abs(bucket.specialEnd - expectedSpecial));
  }
  return summary;
}

export function combinePoolStudySummaries(summaries, {unit = 'players'} = {}) {
  const enabled = summaries.filter(Boolean);
  if (!enabled.length) return null;
  if (enabled.some(summary => summary.bucketPolicy !== enabled[0].bucketPolicy)) throw new Error('不可合併不同分桶規則的水池研究。');
  const combined = {bucketPolicy:enabled[0].bucketPolicy,baseUnit:'big-blind',[unit]: enabled.length, hands: 0, ...totals(), maxLedgerError: 0,
    byBucket: enabled[0].byBucket.map(bucket => ({bucketIndex: bucket.bucketIndex, bets: [...bucket.bets],
      ...(bucket.range ? {range:{...bucket.range},label:bucket.label} : {}),
      hands: 0, paidActionStart: 0, specialStart: 0, paidActionEnd: 0, specialEnd: 0, ...totals()}))};
  for (const summary of enabled) {
    combined.hands += summary.hands;
    combined.maxLedgerError = Math.max(combined.maxLedgerError, summary.maxLedgerError);
    for (const key of FIELDS) combined[key] += summary[key];
    for (const bucket of summary.byBucket) for (const key of ['hands', 'paidActionStart', 'specialStart', 'paidActionEnd', 'specialEnd', ...FIELDS]) {
      combined.byBucket[bucket.bucketIndex][key] += bucket[key];
    }
  }
  return combined;
}
