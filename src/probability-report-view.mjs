import {esc} from './shared.mjs?v=58';
import {JACKPOT_MULTIPLIERS} from './jackpot.mjs?v=58';
import {LAB_STREETS as STREETS, LAB_POLICIES as POLICIES, LAB_JACKPOTS as JACKPOTS} from './probability-text.mjs?v=58';

const SEATS = {player: '玩家', npc: 'BOSS'};
const ACTIONS = {fold: 'FOLD（棄牌）', check: 'CHECK（過牌）', call: 'CALL（跟注）', bet: 'BET（開注）', raise: 'RAISE（加注）'};
const MODES = {independent: '每手重設資產', continuous: '連續資產', cashout: '達標／資產不足研究'};
const STATUSES = {completed: '完成指定手數', target: '達標', insufficient: '資產不足', censored: '達上限截尾'};
const DEAL_MODES = {unpaired: '未成對重抽（兩張牌適配）', 'legacy-score': '舊版分數重抽'};
const STOP_REASONS = {manual: '指定底牌', pair: '已成對', 'score-threshold': '達到舊分數門檻', limit: '達重抽上限', probability: '未命中重抽機率'};
const finite = value => typeof value === 'number' && Number.isFinite(value);
const num = (value, digits = 6) => finite(value) ? value.toLocaleString('en-US', {maximumFractionDigits: digits}) : '—';
const percent = value => !finite(value) ? '—' : value > 0 && value < 1e-8
  ? `${(value * 100).toExponential(3)}%`
  : `${(value * 100).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 6})}%`;
const rate = (hits, total) => finite(hits) && finite(total) && total > 0 ? percent(hits / total) : '—';
const quotient = (amount, total) => finite(amount) && finite(total) && total > 0 ? num(amount / total) : '—';
const yesNo = value => value === true ? '開啟' : value === false ? '關閉' : '—';
const label = (labels, key) => labels[key] || String(key ?? '—');
const getTarget = (root, id) => root?.id === id ? root : root?.querySelector?.(`#${id}`);
const table = (headers, rows, empty = '尚無資料。') => `<div class="table-scroll"><table><thead><tr>${headers.map(value => `<th scope="col">${esc(value)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map(row => `<tr>${row.map(value => `<td>${value}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}" class="table-empty">${esc(empty)}</td></tr>`}</tbody></table></div>`;
const block = (id, title, description, content) => `<section class="report report-block" id="${id}" aria-labelledby="${id}-heading"><div class="report-heading"><div><h3 id="${id}-heading">${esc(title)}</h3><p class="hint">${esc(description)}</p></div><a href="#study-report-nav">回到報表索引 ↑</a></div>${content}</section>`;
const cards = values => values?.length ? `<span class="tree-cards">${values.map(card => {
  const text = String(card), suit = {s: '♠', h: '♥', d: '♦', c: '♣'}[text[1]] || '';
  return `<span class="tree-card${'hd'.includes(text[1]) ? ' red' : ''}">${esc(suit + (text[0] === 'T' ? '10' : text[0] || ''))}</span>`;
}).join('')}</span>` : '<span class="hint">尚未翻開</span>';
const metric = (title, value, description = '') => `<article><small>${esc(title)}</small><strong>${String(value).replace(/\d+\.\d{3,}%/g,match=>`${Number(match.slice(0,-1)).toFixed(2)}%`)}</strong><span>${esc(description)}</span></article>`;
const pager = (kind, page, pages, total, pageSize) => `<div class="report-pager"><span>共 ${num(total)} 筆 · 第 ${num(total ? page * pageSize + 1 : 0)}–${num(Math.min((page + 1) * pageSize, total))} 筆</span><button type="button" data-page-kind="${kind}" data-page="${page - 1}" ${page <= 0 ? 'disabled' : ''}>上一頁</button><label>頁碼 <input data-page-input="${kind}" type="number" min="1" max="${pages}" value="${page + 1}" aria-label="${{players: '玩家', batches: '切片', nodes: '節點', terminals: '終端'}[kind]}表頁碼"></label><span>/ ${num(pages)}</span><button type="button" data-page-kind="${kind}" data-page="${page + 1}" ${page + 1 >= pages ? 'disabled' : ''}>下一頁</button></div>`;
const ci = values => values?.length === 2 && values.every(finite) ? `${percent(values[0])}–${percent(values[1])}` : '—（有效樣本不足）';

export function poolSummaryTable(summary, {includeSpecial = true} = {}) {
  if (!summary) return '<p class="hint">此歷史模型未使用結果水池。</p>';
  return table(['大盲分桶', '付費池開始', '付費池使用', '付費池增加', '付費池結束', ...(includeSpecial ? ['特殊池開始', '特殊池增加', '特殊池支出', '特殊池結束'] : [])],
    summary.byBucket.map(bucket => [esc(bucket.label || bucket.bets.join('／')), ...['paidActionStart','paidActionBudgetUsed','paidActionAdded','paidActionEnd', ...(includeSpecial ? ['specialStart','specialAdded','specialAward','specialEnd'] : [])].map(key=>num(bucket[key]))])) +
    `<p class="hint">${summary.deals ? '池額按冷啟動牌局樣本加總' : summary.players ? '池額依研究玩家加總' : '各桶開始與結束金額'}；完整樹列為終端機率加權期望。${includeSpecial ? '特殊池支出已包含在 JP 與總返還，不再重複加計。' : '三桶付費池跨手保留，水池餘額不是玩家資產。'}最大池守恆誤差 ${num(summary.maxLedgerError, 12)}。</p>`;
}

function rtpChart(batches, {current = false} = {}) {
  const available = (batches || []).filter(item => item.cumulativeWagers > 0 && finite(item.cumulativeHands)
    && finite(item.cumulativeBaseRtp) && finite(item.cumulativeTotalRtp));
  if (!available.length) return '<p class="status-note">尚無有效累計投入，無法繪製 RTP 走勢。</p>';
  const limit = 400, sampled = available.length > limit;
  const points = sampled ? Array.from({length: limit}, (_, index) => available[Math.round(index * (available.length - 1) / (limit - 1))]) : available;
  // Derive bounds from ALL slices: omitted visual points must not shrink the axis.
  const {minimum: yMin, maximum: yMax} = available.reduce((bounds, item) => ({
    minimum: Math.min(bounds.minimum, item.cumulativeBaseRtp, item.cumulativeTotalRtp),
    maximum: Math.max(bounds.maximum, item.cumulativeBaseRtp, item.cumulativeTotalRtp)
  }), {minimum: 0, maximum: 1});
  const left = 65, right = 690, top = 20, bottom = 226, width = right - left;
  const lastHands = Math.max(1, available.at(-1).cumulativeHands), span = yMax - yMin || 1;
  const x = value => left + value / lastHands * width;
  const y = value => bottom - (value - yMin) / span * (bottom - top);
  const line = key => points.map(item => `${x(item.cumulativeHands).toFixed(2)},${y(item[key]).toFixed(2)}`).join(' ');
  const ticks = Array.from({length: 6}, (_, index) => {
    const value = yMin + span * index / 5, position = y(value);
    return `<line x1="${left}" y1="${position}" x2="${right}" y2="${position}" stroke="currentColor" opacity=".13"/><text x="${left - 8}" y="${position + 4}" text-anchor="end" fill="currentColor">${num(value * 100, 2)}%</text>`;
  }).join('');
  const xTicks = [0, lastHands / 2, lastHands].map(value => `<text x="${x(value)}" y="247" text-anchor="middle" fill="currentColor">${num(value, 0)}</text>`).join('');
  const last = available.at(-1);
  const description = `依 ${num(available.length)} 個實際切片繪製。最後累計 ${num(last.cumulativeHands)} 手，${current ? `RTP ${percent(last.cumulativeTotalRtp)}` : `底池 RTP ${percent(last.cumulativeBaseRtp)}，含 JP 總 RTP ${percent(last.cumulativeTotalRtp)}`}。${sampled ? `均勻抽取 ${limit} 個顯示點，完整切片保留在 JSON。` : '顯示所有切片。'}`;
  return `<figure class="study-rtp-chart"><svg viewBox="0 0 720 280" width="100%" role="img" aria-labelledby="study-rtp-chart-title study-rtp-chart-desc" font-size="11"><title id="study-rtp-chart-title">${current ? '累積 RTP 走勢' : '累積底池與含 JP 總 RTP 走勢'}</title><desc id="study-rtp-chart-desc">${esc(description)}橫軸為累計完成手數，縱軸為返還率；高於 100% 的數值完整保留。</desc>${ticks}${xTicks}
    <text x="377" y="270" text-anchor="middle" fill="currentColor">累計完成手數</text>
    <polyline points="${line('cumulativeBaseRtp')}" fill="none" stroke="#68c9eb" stroke-width="2.5"><title>底池 RTP：${percent(last.cumulativeBaseRtp)}</title></polyline>
    ${current ? '' : `<polyline points="${line('cumulativeTotalRtp')}" fill="none" stroke="#f2bf5f" stroke-width="2.5"><title>含 JP 總 RTP：${percent(last.cumulativeTotalRtp)}</title></polyline>`}
    <circle cx="${x(last.cumulativeHands)}" cy="${y(last.cumulativeBaseRtp)}" r="3" fill="#68c9eb"/><circle cx="${x(last.cumulativeHands)}" cy="${y(last.cumulativeTotalRtp)}" r="3" fill="#f2bf5f"/></svg>
    <figcaption><span class="rtp-chart-base">● ${current ? 'RTP' : '底池 RTP'}</span>${current ? '' : ' · <span class="rtp-chart-total">● 含 JP 總 RTP</span>'}<p class="hint">${esc(description)}切片連線是累積比值走勢，並非信賴帶；少量樣本不能證明模型已收斂。</p></figcaption></figure>`;
}

const reportJson = (value, current) => JSON.stringify(value, current ? (key, entry) =>
  /jackpot|special|tierCounts/i.test(key) || key === 'paidActionBudgetShare' ? undefined : entry : null, 2);

/** Render the saved run, never live form values. No mathematical state is changed here. */
export function renderStudyDetails(report, runSnapshot, root = document) {
  const target = getTarget(root, 'study-reports');
  if (!target) return;
  target.onclick = null; target.onchange = null;
  if (!report) { target.innerHTML = '<p class="empty-results">完成模擬後，這裡會依序顯示本次參數、勝率、行動、水池與玩家統計。</p>'; return; }
  const r = report, c = r.config || runSnapshot?.config || {}, method = r.methodMeta || {};
  const pooled = ['prebuilt-pools','pooled-holdem'].includes(r.outcomeModel), fixedHoldem = r.outcomeModel === 'fixed-holdem';
  const current = r.outcomeModel === 'pooled-holdem', holdem = fixedHoldem || current;
  const mode = r.mode || 'independent', independent = mode === 'independent', unlimited = r.unlimitedBankroll === true;
  const playerRows = r.playerResults || [], playerSummary = r.playerSummary || {};
  const entryMinimum = method.minimumEntryOnly === false;
  const insufficientThreshold = finite(method.insufficientThreshold) ? method.insufficientThreshold : null;
  const thresholdDescription = holdem ? '桌籌碼歸零' : entryMinimum ? `目前 BET 的每手開局門檻 ${num(insufficientThreshold)}（${num(method.entryMinimumMultiplier)} × BET）` : `本次報表的續玩門檻 ${num(insufficientThreshold)}`;
  const sections = [['run-parameters', '本次參數'], ['win-rates', '勝率分母'], ['blind-street', '盲位與街道'], ['action-coverage', '所有動作'],
    ...(pooled||fixedHoldem?[]:[['deal-audit', '起手重抽']]), ['return-distribution', holdem ? '返還倍數' : '返還與 JP'], ['player-assets', '玩家資產'], ...(pooled ? [['outcome-pools', '跨手水池']] : []), ['study-accounting', '切片與守恆']];
  const configRows = [
    ['研究模式', unlimited ? '連續遊玩' : esc(label(MODES, mode)), unlimited ? esc(method.bankroll) : independent ? '每手重設雙方帶入，末手餘額不是累積資產。' : '同一玩家逐手保留資產，對手資產調整另外記錄。'],
    ['玩家策略', esc(label(POLICIES, r.policy)), '統計與期望使用本次執行的策略。'],
    ['主種子', esc(r.seed ?? '—'), esc(method.seedDerivation || '依設定種子重現。')],
    ['要求玩家數／完成紀錄', `${num(r.players)} / ${num(playerRows.length)}`, unlimited ? '每位玩家完成指定連續手數。' : '達標與資產不足率以全部研究玩家為分母。'],
    [unlimited ? '每人統計手數' : '每人手數上限', num(mode === 'cashout' ? r.maxHandsPerPlayer : r.entries), esc(method.stopRule || '')],
    ['實際完成手數', num(r.hands), '不是要求手數或預估手數。'],
    ...(unlimited ? [['研究資產', '無限', holdem ? '依固定小盲完成指定手數；外部錢包無限，桌籌碼按實際投入與返還增減。' : '依固定 BET 完成指定手數，淨利仍按實際投入與返還計算。']] : [
      ['起始資產', num(c.buyIn), '每位玩家入桌資產；獨立模式每手重設此值。'],
      [holdem ? '桌籌碼歸零停止' : entryMinimum ? '每手最低開局資產' : '續玩停止門檻', num(insufficientThreshold), holdem ? '低於首次帶入仍可續手及全下，不逐手檢查 100 小盲。' : entryMinimum ? `目前 BET 的 ${num(method.entryMinimumMultiplier)} 倍；每手開始前雙方都須達標，已開局全下仍正常完成。` : '依本次歷史報表設定顯示，不套用目前的每手開局門檻。']
    ]),
    [holdem ? '小盲（SB）／大盲（BB）' : '小盲／大盲（BET）', `${num(c.smallBlind)} / ${num(c.bigBlind)}`, esc(method.initialBlind || '')],
    holdem ? ['入桌與加注', `帶入 ${num(c.smallBlind * 100)}（100 小盲／50 大盲）`, current ? '玩家 2× POT／4× POT 為當前底池倍數的本次支付，另有 ALL IN；BOSS 半池／全池／全下權重 50%／35%／15%。合法最小額與籌碼上限由引擎統一計算。' : '桌籌碼連續增減；半池／全池／全下共用合法金額與 50%／35%／15% 尺寸權重。'] : ['各街下注增額', Object.keys(STREETS).map(street => `${esc(STREETS[street])} ${num(c.betSize?.[street])}`).join(' · '), '顯示本次引擎正規化後的實際參數。'],
    ['底池派彩', '全額返還', holdem ? '匹配底池全額派彩，未匹配下注退回。' : '不另扣底池費；JP 由個人特殊池另計。'],
    ['BOSS 模式',esc(({random:'每手隨機遇到',rotate:'歷史兩型輪替',fixed:'固定對手研究',legacy:'歷史權重'})[c.boss?.mode]||'歷史權重'),esc(method.bossSelection||'')],
    ...(holdem ? [] : [['JP（彩金）', yesNo(c.jackpotEnabled), '皇家同花順 200×、同花順 50×、四條 20× 大盲，只領最高一獎。']]),
    ['玩家策略基礎權重', Object.keys(ACTIONS).map(action => `${esc(ACTIONS[action])} ${num(c.npc?.[action])}`).join(' · '), '供模擬玩家策略使用；BOSS 使用兩型逐街強弱分布。'],
    ['玩家牌力與成本影響', `${num(c.npc?.strengthInfluence)} / ${num(c.npc?.priceInfluence)}`, '行動者只使用自己的底牌、已揭公共牌及下注狀態。'],
    ['信賴區間單位', `${method.ciUnit === 'player' ? '玩家整段聚類' : '獨立牌局'} · ${num(method.ciSamples)} 個樣本`, esc(method.uncertainty || '')],
    ['執行開始時間', esc(runSnapshot?.startedAt || '未提供'), '報表對應此執行快照；修改表單不會改寫本次結果。']
  ];
  if(fixedHoldem) configRows.push(['結果模型', '固定牌序德州', '各街只依已發牌判斷，下注不更換手牌或公共牌序。']);
  if(holdem) configRows.push(['入桌次數／帶入總額', `${num(r.tableEntries)} / ${num(r.tableBuyIns)}`, '帶入是錢包與桌籌碼轉移，不是賭注，不列 RTP。']);
  if (pooled) configRows.push(
    ['結果模型', esc(r.outcomeModel), esc(method.outcomeSampling || method.poolContinuity)],
    ['BOSS 行為表版本', esc(r.bossProfileVersion), '激進／不激進依本街鎖定的強／不強分類取表；同街再加注不重判分類。'],
    ['全系統 RTP／付費池分配', `${percent(c.outcome.conversionRate)} / ${percent(c.outcome.paidActionBudgetShare)}`, current ? '.99 為操作計分係數，並非整體 RTP 保證；有效贏節點付費分數全數進同級付費池。' : '.99 為操作計分係數，並非整體 RTP 保證；餘額分配至特殊池。'],
    ['付費池冷卻範圍／初始冷卻', `${num(c.outcome.paidActionCooldownMin)}–${num(c.outcome.paidActionCooldownMax)} / ${num(c.outcome.initialPaidActionCooldown)}`, '冷卻跨手與大盲分桶共用。'],
    ...(current ? [['三桶初始付費池', c.outcome.initialPaidActionPools.map(value=>num(value)).join('／'), '每位玩家各自建立一次，跨手、跨桌保留。']] : [
      ['特殊池使用機率', percent(c.outcome.specialUseChance), 'root win 時依最高可負擔級別抽取資格，正常獲勝攤牌才支出。'],
      ['三桶初始付費池／特殊池', `${c.outcome.initialPaidActionPools.map(value=>num(value)).join('／')} · ${c.outcome.initialSpecialPools.map(value=>num(value)).join('／')}`, '每位玩家各自建立一次，重設資產模式仍跨手保留。']])
  );
  if (mode === 'cashout') configRows.splice(6, 0, ['目標資產', num(r.targetAsset), '達到目標即停止；手數上限截尾另列。']);
  for (const seat of Object.keys(SEATS)) {
    const deal = c.deal?.[seat] || {};
    if (pooled || fixedHoldem) {configRows.push([`${SEATS[seat]}指定研究牌`,deal.manual?.length?cards(deal.manual):'自動發牌',fixedHoldem?'只保留指定兩張底牌，未指定部分自然發牌。':r.outcomeModel==='pooled-holdem'?'不進行起手重抽；依 root 目標與可能的後續目標建立可用暗牌候選。指定牌不得暗換。':'依預建目標建立牌面。']);continue;}
    configRows.push([`${SEATS[seat]}起手設定`, `${esc(label(DEAL_MODES, deal.rerollMode))} · ${percent(deal.rerollChance)} · 最多 ${num(deal.maxRerolls)} 次`,
      deal.manual?.length ? `指定底牌 ${cards(deal.manual)}；略過重抽。` : deal.rerollMode === 'legacy-score' ? `舊分數門檻 ${num(deal.targetScore)}；此設定不是未成對重抽。` : '兩張未成對才判斷重抽；成對即停，最多次數不包含第一副。']);
  }
  const snapshot = {config: c, simulation: {...runSnapshot?.simulation, mode, policy: r.policy, seed: r.seed, players: r.players, entries: r.entries,
    unlimitedBankroll: unlimited, targetAsset: r.targetAsset, maxHandsPerPlayer: r.maxHandsPerPlayer}, methodMeta: method};
  const rates = `<div class="metrics study-win-metrics">${metric('全手贏池率', rate(r.wins, r.hands), `${num(r.wins)} / ${num(r.hands)} 手；包含對手棄牌`)}${metric('攤牌贏池率', rate(r.showdownWins, r.showdowns), `${num(r.showdownWins)} / ${num(r.showdowns)} 次攤牌；平手另列`)}${metric('淨獲利手率', rate(r.netWinningHands, r.hands), `${num(r.netWinningHands)} / ${num(r.hands)} 手；${current ? '本手' : '含 JP'}淨利大於 0`)}${metric('全手平手率', rate(r.ties, r.hands), `${num(r.ties)} 次平分底池`)}${metric('攤牌平手率', rate(r.showdownTies, r.showdowns), '未將平手直接算成贏牌')}${metric('攤牌到達率', rate(r.showdowns, r.hands), `${num(r.showdowns)} / ${num(r.hands)} 手`)}</div>` +
    table(['統計項目', '分子', '分母', '比例'], [
      ['玩家贏得底池', num(r.wins), num(r.hands), rate(r.wins, r.hands)], ['玩家輸掉底池', num(r.losses), num(r.hands), rate(r.losses, r.hands)],
      ['玩家棄牌', num(r.folds), num(r.hands), rate(r.folds, r.hands)], ['BOSS 棄牌', num(r.npcFolds), num(r.hands), rate(r.npcFolds, r.hands)],
      ['攤牌權益（勝＋半數平）', finite(r.showdownWins) && finite(r.showdownTies) ? num(r.showdownWins + r.showdownTies / 2) : '—', num(r.showdowns),
        rate(finite(r.showdownWins) && finite(r.showdownTies) ? r.showdownWins + r.showdownTies / 2 : null, r.showdowns)]
    ]);
  const blindTable = table(['玩家盲位', '手數', '全手贏池率', '攤牌贏池率', '淨獲利手率', '底池 RTP', '總 RTP', current ? '淨利' : '含 JP 淨利'], ['small', 'big'].map(blind => {
    const item = r.byBlind?.[blind] || {};
    return [blind === 'small' ? '小盲（翻牌前先行）' : '大盲（翻牌後先行）', num(item.hands), rate(item.wins, item.hands), rate(item.showdownWins, item.showdowns),
      rate(item.netWinningHands, item.hands), rate(item.netReturns, item.wagers), rate(item.totalReturns, item.wagers), num(item.profit)];
  }));
  const streetTable = table(['到達街道', '到達手數', '占全部手數', '這些手最終贏池率', '這些手最終淨獲利率'], Object.keys(STREETS).map(street => {
    const item = r.streetReach?.[street] || {};
    return [STREETS[street], num(item.hands), rate(item.hands, r.hands), rate(item.wins, item.hands), rate(item.netWinningHands, item.hands)];
  }), '本報表版本未提供逐街到達統計。');
  const actionRows = [];
  for (const street of Object.keys(STREETS)) for (const seat of Object.keys(SEATS)) for (const action of Object.keys(ACTIONS)) {
    const item = r.actionStats?.[street]?.[seat]?.[action] || {};
    actionRows.push([STREETS[street], SEATS[seat], `${esc(ACTIONS[action])}<small class="report-raw-type">${action}</small>`, num(item.count), num(item.amount), num(item.hands),
      rate(item.hands, r.hands), rate(item.handWins, item.hands), rate(item.handNetWins, item.hands), item.count === 0 ? '本次未觀測' : '已觀測']);
  }
  const auditRows = [], auditStops = [];
  for (const seat of Object.keys(SEATS)) {
    const audit = r.dealAudit?.[seat] || {}, naturalHands = finite(audit.hands) && finite(audit.manualHands) ? audit.hands - audit.manualHands : null;
    auditRows.push([SEATS[seat], num(audit.hands), num(audit.manualHands), num(audit.rerolledHands), rate(audit.rerolledHands, naturalHands), num(audit.totalRerolls),
      quotient(audit.totalRerolls, naturalHands), rate(audit.initialClasses?.pair ?? 0, audit.hands), rate(audit.finalClasses?.pair ?? 0, audit.hands)]);
    for (const reason of Object.keys(STOP_REASONS)) auditStops.push([SEATS[seat], STOP_REASONS[reason], num(audit.stopReasons?.[reason] ?? 0), rate(audit.stopReasons?.[reason] ?? 0, audit.hands)]);
  }
  const hits = Object.values(r.tierCounts || {}).reduce((sum, value) => sum + value, 0);
  const jackpotRows = Object.keys(JACKPOTS).map(tier => {
    const count = r.tierCounts?.[tier];
    return [esc(JACKPOTS[tier]), `${num(JACKPOT_MULTIPLIERS[tier])}× 大盲`, num(count), rate(count, r.hands), rate(count, r.showdowns),
      finite(count) && finite(c.bigBlind) ? num(count * c.bigBlind * JACKPOT_MULTIPLIERS[tier]) : '—'];
  });
  const countPlayers = r.players, summaryMetrics = unlimited
    ? metric('研究玩家', num(countPlayers), '每人使用獨立亂數流') + metric('完成玩家', num(playerSummary.completed ?? 0), '完成指定連續手數') + metric('研究資產', '無限', holdem ? '外部錢包無限，桌籌碼有限' : '雙池與 CD 跨手保留')
    : independent
    ? metric('研究玩家群組', num(countPlayers), pooled ? '每位玩家有自己的連續水池；每手重設錢包，區間按玩家聚類' : '每列為一位模擬玩家的樣本集合；沒有累積錢包')
    : metric('全部研究玩家', num(countPlayers), '每人使用獨立亂數流、連續保留資產') +
      (mode === 'cashout' ? metric('達標率', rate(playerSummary.target ?? 0, countPlayers), `${num(playerSummary.target ?? 0)} / ${num(countPlayers)} 位`) : '') +
      metric('資產不足率', rate(playerSummary.insufficient ?? 0, countPlayers), `${num(playerSummary.insufficient ?? 0)} 位；可用資產低於${thresholdDescription}`) +
      metric('截尾率', mode === 'cashout' ? rate(playerSummary.censored ?? 0, countPlayers) : '不適用', '達手數上限仍未達標／資產不足；不能算作失敗');
  target.innerHTML = `<nav class="study-anchor-nav" id="study-report-nav" aria-label="完整報表索引">${sections.map(([id, title]) => `<a href="#${id}">${esc(title)}</a>`).join('')}</nav>` +
    block('run-parameters', '本次實際參數與估計方式', '以下全部讀取已完成報表的參數，不讀取現在表單值。', table(['參數', '本次值', '說明'], configRows) +
      `<details class="report-json"><summary>本次完整參數 JSON</summary><pre>${esc(reportJson(snapshot, current))}</pre></details>`) +
    block('win-rates', '勝率：三種分母分開看', '贏得底池、攤牌勝出、單手淨獲利是不同事件；沒有分母時顯示 —。', rates) +
    block('blind-street', '盲位與逐街到達', '街道列會包含同一手的不同階段；各街不能相加當成總手數。', blindTable + '<h4>逐街實際到達</h4>' + streetTable) +
    (holdem ? block('boss-strength', 'BOSS 逐街鎖定分類', '同一手每街只列一次；這是離線研究稽核，遊戲畫面不顯示對手當前分類。',
      table(['對手', '街道', '本街分類', '手數'], (r.bossStrengthStats || []).map(row=>[
        esc(({caller:'不激進',maniac:'激進'})[row.bossProfileId]||row.bossProfileId),esc(STREETS[row.street]),esc(row.band==='strong'?'強':'不強'),num(row.hands)
      ]))) : '') +
    block('action-coverage', '雙方每街所有動作與後續結果', 'CHECK／CALL 與 BET／RAISE 分開統計。結果均從研究玩家視角計算，這是觀測條件結果，不能解讀為因果效果或固定動作勝率。',
      table(['街道', '座位', '真實動作', '執行次數', '實付合計', '含此動作的手數', '全手覆蓋率', '這些手玩家贏池率', '這些手玩家淨獲利率', '覆蓋狀態'], actionRows) +
      (holdem ? '<h4>下注與加注尺寸</h4>' + table(['街道', '座位', '動作', '尺寸', '執行次數', '實付合計', '實際全下次數'], (r.actionSizeStats || []).map(row => [
        esc(STREETS[row.street]), esc(SEATS[row.actor]), esc(ACTIONS[row.type]),
        esc(row.sizeKeys.map(key => ({half:'半池',pot:'全池','2x':'2× POT','4x':'4× POT',allin:'全下'})[key] || key).join('／')), num(row.count), num(row.amount), num(row.allIns)
      ])) + '<p class="hint">受最低加注或剩餘籌碼限制，同額選項合併顯示及累加權重；不把同一筆下注重複計次。</p>' : '') +
      `<p class="hint">${esc(method.actionOutcomeUnit || '同手同街同座位同動作只計一個結果樣本；執行次數可以大於手數。')}零次表示這次沒有觀測到；不能據此判定為非法動作。</p>`) +
    (pooled||fixedHoldem?'':block('deal-audit', '起手重抽與對子率', '重抽手率以非手動發牌手數為分母；起始／最終對子率包含指定底牌。未成對不等於低勝率，例如 AK 同花仍可重抽。',
      table(['座位', '發牌手數', '指定手數', '有重抽手數', '自然發牌重抽手率', '重抽總次數', '自然發牌平均重抽', '初始對子率', '最終對子率'], auditRows) +
      '<h4>最後停止原因</h4>' + table(['座位', '停止原因', '手數', '占該座位全部手數'], auditStops))) +
    block('return-distribution', holdem ? '返還倍數' : '返還倍數與 JP 獎項', method.returnDenominator || (current ? '單手倍數＝底池返還 ÷ 有效投入；未跟注退款不計入。' : '單手倍數＝含 JP 總返還 ÷ 有效投入；未跟注退款不計入。'),
      table(['單手返還倍數', '手數', '占全部手數'], (r.returnDistribution || []).map(item => [esc(item.label), num(item.hands), rate(item.hands, r.hands)])) +
      (holdem ? '' : '<h4>JP（彩金）：牌型與倍數</h4>' + table(['牌型', '獎金倍數', '中獎手數', '全部手數命中率', '攤牌命中率', '獎金合計'], jackpotRows) +
      `<p class="status-note${hits ? '' : ' warning'}">${c.jackpotEnabled === false ? '本次 JP 關閉。' : hits ? `共有 ${num(hits)} 手符合獎項，僅取最高一獎。` : '本次 JP 零次命中；不代表真實機率為零。'} ${pooled ? '需有特殊池資格且玩家正常獲勝攤牌；普通無資格布局排除特殊牌。' : '歷史牌庫模式：玩家正常攤牌檢查牌型，彩金與底池勝負分開。'} 總 RTP 的稀有獎影響仍需足夠樣本。</p>`)) +
    block('player-assets', unlimited ? '玩家連續統計' : '玩家資產、達標與截尾', method.bankroll || '', `<div class="metrics">${summaryMetrics}</div>` +
      (mode === 'cashout' ? `<p class="status-note">達標 ${num(playerSummary.target ?? 0)} 位、資產不足 ${num(playerSummary.insufficient ?? 0)} 位、截尾 ${num(playerSummary.censored ?? 0)} 位；三者分母均為 ${num(countPlayers)} 位。目標資產 ${num(r.targetAsset)}，每人最多 ${num(r.maxHandsPerPlayer)} 手。</p>` : '') +
      `<p class="hint">每頁 100 位，全部玩家均可翻頁檢查，完整資料也包含在 JSON 匯出。${unlimited ? '資產為無限，連續淨利依實際結算累計。' : independent ? '「末手結束餘額」只代表最後一手；「樣本淨利合計」不可當作持續錢包餘額。' : '結束餘額是同一位玩家實際連續資產。'}</p><div data-player-results></div>`) +
    (pooled ? block('outcome-pools', '三桶水池開始、累積與支出', method.poolContinuity || '依本次模型顯示。', poolSummaryTable(r.outcomePoolSummary, {includeSpecial: !current})) : '') +
    block('study-accounting', 'RTP、切片與資金守恆', current ? '投入與返還採比值的總和統計；退款、底池返還與對手資產調整分開。' : '投入與返還採比值的總和統計；退款、底池返還、彩金、對手資產調整分開。',
      `<div class="flow-cards">${[['有效投入', r.wagers], ['未跟注退款', r.refunds], ['底池返還', r.netReturns], ...(current ? [] : [['特殊池派獎', r.jackpotAwards]]), [current ? '總返還' : '含 JP 總返還', r.totalReturns], [current ? '淨利' : '含 JP 淨利', r.profit ?? r.totalReturns - r.wagers]].map(([name, value]) => `<div><small>${esc(name)}</small><b>${num(value)}</b></div>`).join('')}</div>` +
      table(['項目', '本次結果', '定義'], [
        ['底池 RTP', rate(r.netReturns, r.wagers), '底池返還／有效投入'], ['底池 RTP 95% 區間', ci(r.baseCi95), `${method.ciUnit === 'player' ? '玩家聚類' : '獨立手'}，${num(method.ciSamples)} 個樣本`],
        [current ? '總 RTP' : '總 RTP（含 JP）', rate(r.totalReturns, r.wagers), current ? '底池返還／有效投入' : '（底池返還＋JP）／有效投入'], ['總 RTP 95% 區間', ci(r.ci95), esc(method.uncertainty || '')],

        ['對手資產刷新次數', num(r.npcRefreshCount), holdem ? '每手開始匹配玩家桌籌碼；不在結算後刷新，不計派彩。' : unlimited ? '有限單手帳務的結算刷新，下一手使用足額研究額度，不計作派彩' : '每手結算後與玩家資產匹配，不計作派彩'],
        ['對手資產增加／移出', `${num(r.npcRefreshAdded)} / ${num(r.npcRefreshRemoved)}`, current ? '對手結算調整，與下注、退款分列' : '對手結算調整，與下注、退款、JP 完全分列'],
        ['對手資產淨調整', num(r.npcRefreshAdjustment), '增加 − 移出；不納入玩家 RTP 分子或分母'],
        ['最大單手守恆誤差', finite(r.conservationError) ? r.conservationError.toExponential(3) : '—', current ? '結算後雙方資產＝結算前雙方資產；不含結算後刷新' : '結算後雙方資產＝結算前雙方資產＋JP；不含結算後刷新']
      ]) + '<h4>累積 RTP 走勢</h4>' + rtpChart(r.batches, {current}) + '<h4>逐段統計</h4><div data-batch-results></div>' +
      `<p class="status-note warning">${esc(method.limitation || '模擬估計不等於 RTP 校準；需要足夠樣本才能評估。')}</p>`);

  const playerTarget = target.querySelector('[data-player-results]'), pageSize = 100;
  const pages = Math.max(1, Math.ceil(playerRows.length / pageSize));
  function showPlayers(requested) {
    const page = Math.max(0, Math.min(pages - 1, Math.trunc(requested) || 0));
    playerTarget.innerHTML = pager('players', page, pages, playerRows.length, pageSize) + table(
      ['玩家', '獨立種子', '起始資產', independent ? '末手結束餘額' : '結束資產', '完成手數', '停止狀態', independent ? '樣本淨利合計' : '連續淨利', '對手刷新次數', '對手資產淨調整', '個人水池快照'],
      playerRows.slice(page * pageSize, (page + 1) * pageSize).map(item => [num(item.playerIndex + 1), esc(item.seed), unlimited ? '無限' : num(item.start), unlimited ? '無限' : num(item.end), num(item.hands),
        esc(label(STATUSES, item.status)), num(item.profit), num(item.npcRefreshCount), num(item.npcRefreshAdjustment), item.outcomePoolSummary ? `<details><summary>開始／結束與稽核</summary><pre>${esc(reportJson(item.outcomePoolSummary, current))}</pre></details>` : '不適用']));
  }
  function showBatches(requested) {
    const batches = r.batches || [], count = Math.max(1, Math.ceil(batches.length / pageSize));
    const page = Math.max(0, Math.min(count - 1, Math.trunc(requested) || 0));
    target.querySelector('[data-batch-results]').innerHTML = pager('batches', page, count, batches.length, pageSize) +
      table(['切片', '手數', '有效投入', '底池返還', ...(current ? [] : ['JP']), current ? '總返還' : '含 JP 返還', '本段總 RTP', '累計手數', '累計總 RTP'],
        batches.slice(page * pageSize, (page + 1) * pageSize).map((item, index) => [num(item.index ?? page * pageSize + index + 1), num(item.hands), num(item.wagers), num(item.netReturns), ...(current ? [] : [num(item.jackpotAwards)]), num(item.totalReturns),
          rate(item.totalReturns, item.wagers), num(item.cumulativeHands), finite(item.cumulativeWagers) && item.cumulativeWagers > 0 ? percent(item.cumulativeTotalRtp) : '—']));
  }
  showPlayers(0); showBatches(0);
  const showPage = (kind, page) => { if (kind === 'players') showPlayers(page); if (kind === 'batches') showBatches(page); };
  target.onclick = event => { const button = event.target.closest('[data-page-kind]'); if (button && target.contains(button)) showPage(button.dataset.pageKind, Number(button.dataset.page)); };
  target.onchange = event => { if (event.target.dataset.pageInput) showPage(event.target.dataset.pageInput, Number(event.target.value) - 1); };
}

const winnerName = winner => winner === 'tie' ? '平手' : winner === 'player' ? '玩家贏池' : winner === 'npc' ? 'BOSS 贏池' : '—';
const pathText = node => node.path?.map(step => `${label(STREETS, step.street)} ${label(SEATS, step.actor)} ${label(ACTIONS, step.type)} ${num(step.amount)}`).join(' → ') || '發牌與盲注後';

/** Browse every node and terminal; pagination limits DOM size, never analysis coverage. */
export function renderActionTree(tree, root = document) {
  const target = getTarget(root, 'tree-detail');
  if (!target) return;
  target.onclick = null; target.onchange = null; target.oninput = null; target.onkeydown = null;
  if (!tree?.nodes?.length) { target.innerHTML = '<p class="empty-results">建立完整行動樹後，可逐節點查看所有合法選擇、條件期望與精確結算。</p>'; return; }
  const nodes = tree.nodes, byId = new Map(nodes.map(node => [node.id, node])), terminals = nodes.filter(node => node.terminal);
  let selectedId = byId.has(tree.rootId) ? tree.rootId : nodes[0].id, nodePage = 0, terminalPage = 0;
  let streetFilter = '', actorFilter = '', search = '', winnerFilter = '';
  const searchable = new Map(nodes.map(node => [node.id, `${node.id} ${pathText(node)} ${winnerName(node.result?.winner)}`.toLowerCase()]));
  const weighted = tree.summary?.weighted || byId.get(selectedId).expected || {};
  const sampled = tree.meta?.cardModel === 'shared-engine-pooled-holdem';
  const pooled = sampled || tree.meta?.cardModel === 'shared-engine-prebuilt-pools';
  target.innerHTML = `<section class="report report-block"><div class="report-heading"><div><h3>完整行動樹 · ${sampled ? '逐路徑結果取樣與合法下注積分' : pooled ? '預建目標與固定玩家／公牌布局' : '固定牌序'}</h3><p class="hint">種子 ${esc(tree.seed)} · 玩家策略 ${esc(label(POLICIES, tree.policy))} · ${tree.firstSmallBlind === 'player' ? '玩家' : 'BOSS'}先行</p></div></div>
    <p class="status-note warning">${esc(tree.meta?.description || '雙方全部合法動作分析，不是全部發牌組合。')} ${esc(tree.meta?.poolSampling || '')} 雙方暗牌與未來公共牌只在此離線分析公開。勝率與 EV 依沿途機率加權，不能用贏牌葉數 ÷ 葉數。</p>
    <div class="metrics">${metric('全部節點', num(nodes.length), '所有合法動作；零機率邊仍保留')}${metric(sampled?'取樣路徑終端':'精確終端', num(terminals.length), '可於下方逐頁探索全部終端')}${metric('加權玩家贏池率', percent(weighted.winProbability), '包含對手棄牌')}${metric('加權平手率', percent(weighted.tieProbability))}${metric(sampled?'本手加權淨利估計':'本手期望淨利', num(weighted.profit), '含 JP 與整手有效投入')}${metric('終端到達機率總和', percent(tree.summary?.terminalProbabilityMass), tree.complete ? '合法動作完整展開' : '資料未標記完整')}</div>
    <p class="hint">本副對手：${esc(tree.bossProfile?`${tree.bossProfile.name}｜${tree.bossProfile.nickname}`:'舊版權重')} · 類型選中機率 ${percent(tree.bossSelection?.probability)}；展開全樹期間不更換。</p><div class="tree-offline-cards"><p>玩家底牌 ${cards(tree.cards?.player)}</p><p>BOSS 底牌 ${cards(tree.cards?.npc)}</p><p>固定公牌順序 ${cards(tree.cards?.boardRunout)}</p></div>
    ${pooled ? `<p class="hint">上方 BOSS 為根節點暗牌；各分支以目前節點暗牌為準。${sampled?'付費結果在隔離 RNG 上取樣，未精確枚舉全部結果抽籤。':''}</p>${poolSummaryTable(tree.summary.outcomePoolSummary)}` : ''}<nav class="study-anchor-nav" aria-label="行動樹索引"><a href="#tree-node-panel">目前節點</a><a href="#tree-node-browser">全部節點</a><a href="#tree-terminal-browser">全部終端</a></nav></section>
    <section class="report report-block" id="tree-node-panel" tabindex="-1"><div data-tree-selected></div></section>
    <section class="report report-block" id="tree-node-browser"><div class="report-heading"><div><h3>全部節點瀏覽</h3><p class="hint">每頁 25 筆；可搜尋完整路徑、篩選街道／行動者，或直接輸入節點編號。</p></div></div>
    <div class="report-filters"><label>街道 <select data-tree-filter="street"><option value="">所有街道</option>${Object.entries(STREETS).map(([key, value]) => `<option value="${key}">${value}</option>`).join('')}</select></label>
    <label>行動者 <select data-tree-filter="actor"><option value="">所有節點</option><option value="player">玩家</option><option value="npc">BOSS</option><option value="terminal">終端結算</option></select></label>
    <label>搜尋 <input type="search" data-tree-search placeholder="節點或路徑，例如 n120、跟注"></label>
    <label>節點編號 <input type="text" data-tree-jump placeholder="例如 n120" aria-label="直接跳到節點"></label><button type="button" data-tree-jump-button>跳轉節點</button><span data-tree-jump-status role="status"></span></div><div data-tree-node-list></div></section>
    <section class="report report-block" id="tree-terminal-browser"><div class="report-heading"><div><h3>全部終端與精確金流</h3><p class="hint">每頁 50 筆。到達機率包含玩家策略及 BOSS 的每一步；零機率終端仍可查閱。</p></div></div>
    <div class="report-filters"><label>終端勝負 <select data-tree-filter="winner"><option value="">全部結果</option><option value="player">玩家贏池</option><option value="npc">BOSS 贏池</option><option value="tie">平手</option></select></label></div><div data-tree-terminal-list></div></section>`;
  const current = target.querySelector('[data-tree-selected]'), nodeList = target.querySelector('[data-tree-node-list]'), terminalList = target.querySelector('[data-tree-terminal-list]');
  const matchingNodes = () => nodes.filter(node => (!streetFilter || node.street === streetFilter) && (!actorFilter || (actorFilter === 'terminal' ? node.terminal : !node.terminal && node.actor === actorFilter)) && (!search || searchable.get(node.id).includes(search)));
  const matchingTerminals = () => terminals.filter(node => !winnerFilter || node.result?.winner === winnerFilter);
  function showNode(id, focus = false) {
    const node = byId.get(id); if (!node) return false;
    selectedId = id;
    const ancestors = []; let ancestor = node;
    while (ancestor) { ancestors.unshift(ancestor); ancestor = byId.get(ancestor.parentId); }
    const e = node.expected || {};
    const branchRows = node.edges.map(edge => {
      const child = byId.get(edge.childId), expected = child?.expected || {};
      return [`<button type="button" data-tree-node="${esc(edge.childId)}">${esc(label(ACTIONS, edge.type))} → ${esc(edge.childId)}</button>`, percent(edge.probability), num(edge.amount), num(edge.to), edge.allIn ? '是' : '否',
        percent(child?.reachProbability), num(expected.profit), percent(expected.winProbability), num(expected.matchedWager), num(expected.totalReturn), num(expected.jackpotAward)];
    });
    let settlement = '';
    if (node.terminal && node.result) {
      const result = node.result;
      const fields = [['stackBefore', '本手起始資產'], ['totalContribution', '原始投入'], ['refund', '未跟注退款'], ['matchedWager', '有效投入'],
         ['netReturn', '底池返還'], ['jackpotAward', 'JP 加獎'], ['totalReturn', '含 JP 總返還'], ['profit', '本手淨利'], ['stackAfter', '結束資產']];
      settlement = `<h4>精確終端結算：${winnerName(result.winner)}</h4><p class="hint">${result.reason === 'showdown' ? '攤牌' : `${esc(label(SEATS, result.folded))}棄牌`} · 有效底池 ${num(result.pot)}</p>` +
        table(['結算欄位', '玩家', 'BOSS'], fields.map(([key, name]) => [name, num(result.player?.[key]), num(result.npc?.[key])])) +
        (result.evaluations?.player ? `<p class="hint">玩家最佳牌型：${esc(result.evaluations.player.name)}；BOSS：${esc(result.evaluations.npc?.name || '—')}。</p>` : '');
    }
    current.innerHTML = `<div class="report-heading"><div><h3>節點 ${esc(node.id)} · ${node.terminal ? '已結算' : `${esc(label(SEATS, node.actor))}行動`}</h3><p class="hint">${esc(label(STREETS, node.street))} · 深度 ${num(node.depth)} · 從根節點到達機率 ${percent(node.reachProbability)}</p></div><div><button type="button" data-tree-node="${esc(tree.rootId)}">回到根節點</button><button type="button" data-tree-node="${esc(node.parentId || '')}" ${node.parentId ? '' : 'disabled'}>上一層</button></div></div>
      <nav class="tree-breadcrumb" aria-label="節點路徑">${ancestors.map((item, index) => `<button type="button" data-tree-node="${esc(item.id)}" ${item.id === node.id ? 'aria-current="location"' : ''}>${esc(item.id)}${index ? ` · ${esc(label(ACTIONS, item.path.at(-1)?.type))}` : ' · 開始'}</button>`).join('<span aria-hidden="true"> → </span>')}</nav>
      <p class="tree-path-description">${esc(pathText(node))}</p><div class="tree-node-context"><p>當前已揭公共牌 ${cards(node.board)}</p><p>玩家資產 ${num(node.stacks?.player)} · BOSS 資產 ${num(node.stacks?.npc)} · ${node.terminal ? '結算前有效底池' : '當前 POT'} ${num(node.terminal ? node.result?.pot : node.pot)}</p><p>本街投入：玩家 ${num(node.streetBets?.player)} / BOSS ${num(node.streetBets?.npc)}；本手原始投入：玩家 ${num(node.contributions?.player)} / BOSS ${num(node.contributions?.npc)}。</p></div>
      ${pooled ? `<p>${sampled?'取樣目標':'預存目標'} ${esc(node.target)} · 結果節點 ${esc(node.outcomeNodeId)} · 玩家 ${cards(node.holes?.player)} · BOSS ${cards(node.holes?.npc)}</p><details><summary>本節點目標／水池稽核</summary><pre>${esc(JSON.stringify({decision:node.outcomeDecision,audit:node.result?.outcomePoolAudit}, null, 2))}</pre></details>` : ''}<div class="metrics">${metric('本手條件期望淨利', num(e.profit), '到達此節點後，按選定策略繼續；整手口徑')}${metric('條件贏池率', percent(e.winProbability))}${metric('條件平手率', percent(e.tieProbability))}${metric('期望有效投入', num(e.matchedWager))}${metric('期望總返還', num(e.totalReturn), '含 JP，不含未跟注退款')}${metric('期望 JP 加獎', num(e.jackpotAward))}</div>
      ${node.terminal ? settlement : `<h4>每一個合法動作</h4><p class="hint">實付是本次新增籌碼，「本街累積到」是動作後目標，兩者不能混用。各列 EV 是強制採此動作後再依策略繼續的整手條件期望；不是相對現在資產的增量。機率為 0 的動作仍保留。</p>${table(['動作／子節點', '本節點動作機率', '本次實付', '本街累積到', '全下', '子節點到達機率', '本手期望淨利', '條件贏池率', '期望有效投入', '期望總返還', '期望 JP'], branchRows)}`}`;
    if (focus) target.querySelector('#tree-node-panel').focus();
    return true;
  }
  function showNodes() {
    const items = matchingNodes(), size = 25, pages = Math.max(1, Math.ceil(items.length / size));
    nodePage = Math.max(0, Math.min(nodePage, pages - 1));
    nodeList.innerHTML = pager('nodes', nodePage, pages, items.length, size) + table(['節點', '街道／行動者', '深度', '到達機率', '本手期望淨利', '完整路徑'],
      items.slice(nodePage * size, (nodePage + 1) * size).map(node => [`<button type="button" data-tree-node="${esc(node.id)}" ${node.id === selectedId ? 'aria-current="location"' : ''}>${esc(node.id)}</button>`,
        `${esc(label(STREETS, node.street))}／${node.terminal ? '結算' : esc(label(SEATS, node.actor))}`, num(node.depth), percent(node.reachProbability), num(node.expected?.profit), esc(pathText(node))]), '沒有符合篩選的節點。');
  }
  function showTerminals() {
    const items = matchingTerminals(), size = 50, pages = Math.max(1, Math.ceil(items.length / size));
    terminalPage = Math.max(0, Math.min(terminalPage, pages - 1));
    terminalList.innerHTML = pager('terminals', terminalPage, pages, items.length, size) + table(['終端', '到達機率', '勝負／原因', '玩家原始投入', '玩家有效投入', '玩家退款', 'BOSS 退款', '底池返還', 'JP', '含 JP 返還', '玩家淨利'],
      items.slice(terminalPage * size, (terminalPage + 1) * size).map(node => { const r = node.result, p = r.player; return [
        `<button type="button" data-tree-node="${esc(node.id)}">${esc(node.id)}</button>`, percent(node.reachProbability), `${winnerName(r.winner)}／${r.reason === 'showdown' ? '攤牌' : `${esc(label(SEATS, r.folded))}棄牌`}`,
        num(p.totalContribution), num(p.matchedWager), num(p.refund), num(r.npc.refund), num(p.netReturn), num(p.jackpotAward), num(p.totalReturn), num(p.profit)]; }), '沒有符合篩選的終端。');
  }
  function jump() {
    const input = target.querySelector('[data-tree-jump]'), raw = input.value.trim(), id = /^\d+$/.test(raw) ? `n${raw}` : raw;
    const found = showNode(id, true);
    target.querySelector('[data-tree-jump-status]').textContent = found ? `已顯示 ${id}` : `找不到節點 ${raw || '（空白）'}。`;
    if (found) showNodes();
  }
  function changePage(kind, value) {
    const page = Math.max(0, Math.trunc(value) || 0);
    if (kind === 'nodes') { nodePage = page; showNodes(); }
    if (kind === 'terminals') { terminalPage = page; showTerminals(); }
  }
  target.onclick = event => {
    const button = event.target.closest('button'); if (!button || !target.contains(button)) return;
    if (button.hasAttribute('data-tree-node')) { if (showNode(button.dataset.treeNode, true)) showNodes(); }
    else if (button.hasAttribute('data-page-kind')) changePage(button.dataset.pageKind, Number(button.dataset.page));
    else if (button.hasAttribute('data-tree-jump-button')) jump();
  };
  target.onchange = event => {
    const input = event.target;
    if (input.dataset.treeFilter === 'street') { streetFilter = input.value; nodePage = 0; showNodes(); }
    if (input.dataset.treeFilter === 'actor') { actorFilter = input.value; nodePage = 0; showNodes(); }
    if (input.dataset.treeFilter === 'winner') { winnerFilter = input.value; terminalPage = 0; showTerminals(); }
    if (input.dataset.pageInput) changePage(input.dataset.pageInput, Number(input.value) - 1);
  };
  target.oninput = event => { if (event.target.hasAttribute('data-tree-search')) { search = event.target.value.trim().toLowerCase(); nodePage = 0; showNodes(); } };
  target.onkeydown = event => { if (event.key === 'Enter' && event.target.hasAttribute('data-tree-jump')) { event.preventDefault(); jump(); } };
  showNode(selectedId); showNodes(); showTerminals();
}
