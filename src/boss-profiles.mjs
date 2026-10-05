import {evaluateBest, holeScore, RANKS} from './poker.mjs?v=35';

const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const row = (fold, call, raise) => ({fold, call, raise});
export const BOSS_PROFILE_VERSION = 'four-boss-v1';
export const BOSS_BANDS = freeze({
  weak: {label: '弱起手', description: '翻牌前兩張起手分數低於 0.42。'},
  playable: {label: '可玩起手', description: '翻牌前起手分數介於 0.42（含）至 0.66。'},
  premium: {label: '強起手', description: '翻牌前起手分數至少 0.66；分數是策略分類，不是勝率。'},
  high: {label: '高牌', description: '尚未成對，也沒有四張同花或四張順子聽牌。'},
  pair: {label: '一對', description: '最佳五張恰好一對，包含公牌形成的一對；沒有聽牌。'},
  draw: {label: '聽牌', description: '翻牌或轉牌時，最多一對，且可見牌有四張同花或五張順子窗口中的四個不同點數。'},
  strong: {label: '強成牌', description: '目前最佳五張為兩對或以上，優先於聽牌分類。'}
});
export const BOSS_BANDS_BY_STREET = freeze({preflop: ['weak', 'playable', 'premium'],
  flop: ['high', 'pair', 'draw', 'strong'], turn: ['high', 'pair', 'draw', 'strong'], river: ['high', 'pair', 'strong']});

/** Published percentages before legal-action filtering; every row sums to 100. */
export const BOSS_PROFILES = freeze([
  {id: 'caller', name: '死跟型', nickname: '不信邪', description: '弱對子和聽牌也願意跟，較少主動加注。', tables: {
    preflop: {weak: row(8,88,4), playable: row(3,91,6), premium: row(0,85,15)},
    flop: {high: row(12,83,5), pair: row(3,92,5), draw: row(3,90,7), strong: row(0,85,15)},
    turn: {high: row(18,77,5), pair: row(6,88,6), draw: row(8,85,7), strong: row(0,82,18)},
    river: {high: row(24,71,5), pair: row(8,86,6), strong: row(0,78,22)}
  }},
  {id: 'maniac', name: '狂攻型', nickname: '瘋狗', description: '弱牌也常開注加注，持續施壓。', tables: {
    preflop: {weak: row(8,22,70), playable: row(4,21,75), premium: row(0,15,85)},
    flop: {high: row(10,20,70), pair: row(3,22,75), draw: row(2,18,80), strong: row(0,15,85)},
    turn: {high: row(14,21,65), pair: row(5,20,75), draw: row(5,20,75), strong: row(0,12,88)},
    river: {high: row(20,20,60), pair: row(8,27,65), strong: row(0,10,90)}
  }},
  {id: 'sniper', name: '狙擊型', nickname: '冷面殺手', description: '弱牌多棄牌，強成牌才大幅提高攻擊機率。', tables: {
    preflop: {weak: row(70,27,3), playable: row(22,63,15), premium: row(0,20,80)},
    flop: {high: row(75,23,2), pair: row(28,62,10), draw: row(12,73,15), strong: row(0,20,80)},
    turn: {high: row(82,17,1), pair: row(42,50,8), draw: row(28,62,10), strong: row(0,15,85)},
    river: {high: row(92,7,1), pair: row(55,40,5), strong: row(0,10,90)}
  }},
  {id: 'trapper', name: '設局型', nickname: '狐狸', description: '強牌在前段常過牌或跟注，轉牌、河牌再提高攻擊。', tables: {
    preflop: {weak: row(35,58,7), playable: row(12,75,13), premium: row(0,85,15)},
    flop: {high: row(45,48,7), pair: row(12,78,10), draw: row(8,82,10), strong: row(0,88,12)},
    turn: {high: row(55,38,7), pair: row(22,66,12), draw: row(15,73,12), strong: row(0,70,30)},
    river: {high: row(70,20,10), pair: row(35,50,15), strong: row(0,35,65)}
  }}
]);
export const BOSS_PROFILE_IDS = freeze(BOSS_PROFILES.map(profile => profile.id));
export const BOSS_PROFILE_BY_ID = freeze(Object.fromEntries(BOSS_PROFILES.map(profile => [profile.id, profile])));

export function normalizeBossConfig(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('BOSS 設定須為物件。');
  const mode = input.mode ?? 'rotate', profileId = input.profileId ?? 'caller';
  if (!['rotate', 'fixed', 'legacy'].includes(mode)) throw new TypeError('BOSS 模式須為 rotate、fixed 或 legacy。');
  if (!BOSS_PROFILE_BY_ID[profileId]) throw new TypeError('未知 BOSS 類型。');
  return {mode, profileId};
}

/** Exactly one uniform draw for a rotating encounter; no rejection loop. */
export function selectBossProfile(rng, previousId = null, input = {}) {
  const {mode, profileId} = normalizeBossConfig(input);
  if (mode === 'legacy') return {profile: null, selection: {mode, probability: 1, previousId, eligibleIds: []}};
  if (mode === 'fixed') return {profile: BOSS_PROFILE_BY_ID[profileId], selection: {mode, probability: 1, previousId, eligibleIds: [profileId]}};
  const eligibleIds = BOSS_PROFILE_IDS.filter(id => id !== previousId);
  const roll = rng();
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new RangeError('BOSS 選取亂數須介於 0（含）與 1（不含）。');
  const id = eligibleIds[Math.floor(roll * eligibleIds.length)];
  return {profile: BOSS_PROFILE_BY_ID[id], selection: {mode, probability: 1 / eligibleIds.length, previousId, eligibleIds}};
}

/** No opponent cards, future board, deck or RNG are read by this classifier. */
export function classifyBossStrength(hand) {
  const hole = hand.holes.npc, board = hand.board;
  if (board.length < 3) {
    const score = holeScore(hole);
    return {band: score < 0.42 ? 'weak' : score < 0.66 ? 'playable' : 'premium', score, category: null, flushDraw: false, straightDraw: false};
  }
  const visible = [...hole, ...board], evaluation = evaluateBest(visible);
  const category = evaluation.category;
  if (category >= 2) return {band: 'strong', score: null, category, flushDraw: false, straightDraw: false};
  let flushDraw = false, straightDraw = false;
  if (board.length < 5) {
    const suits = visible.reduce((counts, card) => ((counts[card[1]] = (counts[card[1]] || 0) + 1), counts), {});
    flushDraw = Object.values(suits).some(count => count === 4);
    const ranks = new Set(visible.map(card => RANKS.indexOf(card[0]) + 2));
    if (ranks.has(14)) ranks.add(1);
    for (let low = 1; low <= 10; low++) {
      if (Array.from({length: 5}, (_, index) => low + index).filter(rank => ranks.has(rank)).length === 4) { straightDraw = true; break; }
    }
  }
  return {band: flushDraw || straightDraw ? 'draw' : category === 1 ? 'pair' : 'high', score: null, category, flushDraw, straightDraw};
}

/** Keep raw engine types; only map their table weights, then normalize legal choices. */
export function getBossProfileDistribution(hand, actions) {
  if (!actions.length) return [];
  const profile = BOSS_PROFILE_BY_ID[hand.bossProfile?.id];
  if (!profile) throw new Error('牌局缺少已鎖定的 BOSS 類型。');
  const {band} = classifyBossStrength(hand), weights = profile.tables[hand.street]?.[band];
  if (!weights) throw new Error('BOSS 行為表缺少目前街道與牌力分組。');
  const owed = Math.max(0, hand.currentBet - hand.streetBets.npc);
  const keys = {fold: 'fold', call: 'call', check: 'call', bet: 'raise', raise: 'raise'};
  const raw = actions.map(action => action.type === 'fold' && owed <= 1e-7 ? 0 : weights[keys[action.type]] || 0);
  let total = raw.reduce((sum, value) => sum + value, 0);
  if (!total) {
    const passive = actions.findIndex(action => action.type === 'check' || action.type === 'call');
    if (passive < 0) throw new Error('BOSS 沒有可用的被動動作。');
    raw[passive] = 1; total = 1;
  }
  const distribution = actions.map((action, index) => ({...action, probability: raw[index] / total}));
  const last = raw.findLastIndex(value => value > 0);
  distribution[last].probability = 1 - distribution.reduce((sum, action, index) => sum + (index === last ? 0 : action.probability), 0);
  return distribution;
}
