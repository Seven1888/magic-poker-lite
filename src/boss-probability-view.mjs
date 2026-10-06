import {BOSS_PROFILES} from './boss-profiles.mjs?v=46';
import {esc,money} from './shared.mjs?v=51';
const STREETS={preflop:'起手／翻牌前',flop:'翻牌',turn:'轉牌',river:'河牌'};
const pct=(v,digits=2)=>Number.isFinite(v)?`${(v*100).toFixed(digits)}%`:'—';
const ratio=(a,b)=>b>0?pct(a/b):'—';
export function renderBossProbabilityTables(root=document){
 const el=root.getElementById('boss-profile-tables');if(!el)return;
 el.innerHTML=`<p class="hint">首次四種各 25%；同一玩家的下一手排除上一種，其餘各 33⅓%。固定對手研究可重複同一種。下表每街一組固定百分比，只由 BOSS 身份、街道與合法動作決定，不因雙方底牌或公牌改變。免費時 FOLD 不抽選，CALL 代表過牌，RAISE 代表開注；非法欄位移除後，其餘欄位按比例正規化。</p><div class="boss-profile-grid">${BOSS_PROFILES.map(p=>`<details class="boss-profile-card" data-profile="${p.id}" ${p.id==='caller'?'open':''}><summary><b>${esc(p.name)}｜${esc(p.nickname)}</b><span>查看四街機率</span></summary><p>${esc(p.description)}</p><div class="table-scroll"><table><thead><tr><th>階段</th><th>FOLD 棄牌</th><th>CALL 跟注</th><th>RAISE 加注</th><th>免費 CALL／RAISE</th></tr></thead><tbody>${Object.keys(STREETS).map(street=>{
 const row=p.streetWeights[street],den=row.call+row.raise;
 return `<tr><td>${STREETS[street]}</td><td>${pct(row.fold/100)}</td><td>${pct(row.call/100)}</td><td class="boss-raise-prob">${pct(row.raise/100)}</td><td>${ratio(row.call,den)}／${ratio(row.raise,den)}</td></tr>`;
 }).join('')}</tbody></table></div></details>`).join('')}</div><details class="boss-band-notes"><summary>固定機率的產生方式與合法動作換算</summary><p class="hint">每格為原歷史表同一街道各牌力列的等權算術平均：翻牌前與河牌各除以 3，翻牌與轉牌各除以 4。這是設定值的平均，不是牌型出現率加權，也不是實測行動頻率；正式決策不再判斷牌力。顯示取小數點後兩位，實際計算保留完整平均值，因此顯示加總可能有四捨五入差異。</p><p class="hint">每街最多加注一次的規則不變；無法再加注時將該欄剔除，依剩餘合法權重計算。固定的是各街的基礎權重，合法選項改變時顯示比例仍會改變。零機率合法邊仍保留在完整行動樹。</p></details>`;
}
export function renderBossStudy(report,root=document){
 const el=root.getElementById('boss-study-results');if(!el)return;
 if(!report?.byBoss){el.innerHTML='';return;}
 const rows=Object.entries(report.byBoss).filter(([,r])=>r.hands>0).map(([id,r])=>{const p=BOSS_PROFILES.find(p=>p.id===id);return `<tr><td>${esc(p?`${p.name}｜${p.nickname}`:'舊版權重')}</td><td>${money(r.hands)}</td><td>${ratio(r.wins,r.hands)}</td><td>${ratio(r.showdownWins,r.showdowns)}</td><td>${ratio(r.netReturns,r.wagers)}</td><td>${ratio(r.totalReturns,r.wagers)}</td></tr>`;}).join('');
 el.innerHTML=`<section class="report-block"><h3>各類 BOSS 實際統計</h3><p class="hint">各類型分別以自己的手數、攤牌數、有效投入計算；有限樣本的遇到次數不必相同。</p><div class="table-scroll"><table><thead><tr><th>對手</th><th>遇到手數</th><th>玩家贏池率</th><th>玩家攤牌勝率</th><th>底池 RTP</th><th>總 RTP</th></tr></thead><tbody>${rows||'<tr><td colspan="6">尚無完成手數。</td></tr>'}</tbody></table></div><p class="hint">輪替核對：首手選取 ${money(report.bossEncounterAudit?.firstSelections)} 次；相鄰檢查 ${money(report.bossEncounterAudit?.checkedTransitions)} 次；違規連續同型 ${money(report.bossEncounterAudit?.unexpectedRepeats)} 次。</p><details class="report-json"><summary>對手輪替原始資料 JSON</summary><pre>${esc(JSON.stringify(report.bossEncounterAudit||{},null,2))}</pre></details></section>`;
}
