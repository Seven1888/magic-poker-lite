import {esc} from './shared.mjs?v=59';
import {LAB_POLICIES} from './probability-text.mjs?v=59';
import {poolSummaryTable} from './probability-report-view.mjs?v=59';

const finite = value => typeof value === 'number' && Number.isFinite(value);
const number = (value, digits = 6) => finite(value)
  ? value.toLocaleString('en-US', {maximumFractionDigits: digits}) : '—';
const percent = value => finite(value)
  ? `${(value * 100).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}%` : '—';
const metric = (title, value, detail = '') => `<article><small>${esc(title)}</small><strong>${esc(value)}</strong>${detail ? `<span>${esc(detail)}</span>` : ''}</article>`;
const averageHands = players => players.length && players.every(player => finite(player.hands))
  ? players.reduce((sum, player) => sum + player.hands, 0) / players.length : null;

function completionDate(report) {
  const value = report.completedAt || report.finishedAt || report.startedAt;
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleString('zh-TW', {timeZone: 'Asia/Taipei', hour12: false});
}

function playerTable(players) {
  const walletModel = players.some(({player}) => finite(player.wallet));
  const rows = players.map(({player, index}) => `<tr><td>${number(index + 1, 0)}</td><td>${number(player.hands, 0)}</td><td>${number(player.start)}</td><td>${number(player.end)}</td>${walletModel ? `<td>${number(player.wallet)}</td><td>${number(player.tableClosingChips)}</td><td>${number(player.tableEntries)}</td>` : ''}<td>${player.status === 'target' ? '達標' : '資產不足'}</td></tr>`).join('');
  return `<details class="model-summary"><summary>每位玩家明細（${number(players.length, 0)} 位）</summary><div class="table-scroll"><table><thead><tr><th scope="col">玩家</th><th scope="col">手數</th><th scope="col">初始資產</th><th scope="col">最終資產</th>${walletModel ? '<th scope="col">外部錢包</th><th scope="col">桌籌碼</th><th scope="col">入桌次數</th>' : ''}<th scope="col">結果</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="table-empty">尚無已完成玩家。</td></tr>'}</tbody></table></div></details>`;
}

function reportMarkup(report) {
  // 全部玩家都結束後才呈現比例，避免排除未完成玩家而縮小分母。
  const playerResults = Array.isArray(report.playerResults) ? report.playerResults : [];
  const indexedPlayers = playerResults.map((player, index) => ({player, index}))
    .filter(({player}) => player?.status === 'target' || player?.status === 'insufficient');
  if (!Number.isInteger(report.players) || report.players < 0
    || indexedPlayers.length !== report.players || playerResults.length !== report.players) {
    return '<p class="status-note">退幣統計尚未完成</p>';
  }
  const players = indexedPlayers.map(({player}) => player);
  const targets = players.filter(player => player.status === 'target');
  const insufficient = players.filter(player => player.status === 'insufficient');
  const policy = LAB_POLICIES[report.policy] || String(report.policy ?? '—');
  const date = completionDate(report);
  const settings = [
    `策略 ${policy}`,
    `種子 ${report.seed ?? '—'}`,
    `初始資產 ${number(report.initialAsset)}`,
    `目標資產 ${number(report.targetAsset)}`,
    ['fixed-holdem','pooled-holdem'].includes(report.outcomeModel) ? `固定小盲 ${number(report.config?.smallBlind)}（不自動降低）` : `固定 BET ${number(report.config?.bigBlind)}（不自動降低）`,
    ...(report.assetModel === 'external-wallet-plus-table-chips' ? [`每次帶入 ${number(report.tableBuyIn)}（100 小盲）`, '總資產＝外部錢包＋桌籌碼；歸零才重新帶入'] : []),
    ...(date ? [`時間 ${date}`] : []),
  ];
  const metrics = [
    metric('退幣率', percent(players.length ? targets.length / players.length : null), `${number(targets.length, 0)} / ${number(players.length, 0)} 位玩家`),
    metric('達標人數', number(targets.length, 0)),
    metric('資產不足人數', number(insufficient.length, 0)),
    metric('平均手數', number(averageHands(players), 2)),
    metric('存活平均手數', number(averageHands(targets), 2), '達標玩家'),
    metric('停止平均手數', number(averageHands(insufficient), 2), '資產不足玩家'),
  ].join('');
  const pools = report.outcomePoolSummary
    ? `<details class="model-summary"><summary>跨手水池明細</summary>${poolSummaryTable(report.outcomePoolSummary, {includeSpecial: report.outcomeModel !== 'pooled-holdem'})}</details>` : '';
  return `<section class="report"><div class="report-heading"><h3>${esc(policy)}</h3></div><div class="report-context">${settings.map(value => `<small>${esc(value)}</small>`).join('')}</div><div class="metrics">${metrics}</div>${playerTable(indexedPlayers)}${pools}</section>`;
}

/** 產生獨立退幣率報表；僅回傳 HTML，不操作 DOM 或改寫模擬結果。 */
export function refundReportMarkup(reports) {
  const completedReports = Array.isArray(reports) ? reports.filter(Boolean) : [];
  if (!completedReports.length) return '<p class="empty-results">尚無退幣率統計。</p>';
  return completedReports.map(reportMarkup).join('');
}
