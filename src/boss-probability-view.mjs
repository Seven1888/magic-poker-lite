import {BOSS_PROFILES,BOSS_BANDS,BOSS_BANDS_BY_STREET} from './boss-profiles.mjs?v=35';
import {esc,money} from './shared.mjs?v=45';
const STREETS={preflop:'起手／翻牌前',flop:'翻牌',turn:'轉牌',river:'河牌'};
const pct=(v,digits=2)=>Number.isFinite(v)?`${(v*100).toFixed(digits)}%`:'—';
const ratio=(a,b)=>b>0?pct(a/b):'—';
export function renderBossProbabilityTables(root=document){
 const el=root.getElementById('boss-profile-tables');if(!el)return;
 el.innerHTML=`<p class="hint">首次四種各 25%；同一玩家的下一手排除上一種，其餘各 33⅓%。固定對手研究可重複同一種。下表是各街、各牌力的固定百分比；行動仍逐次抽樣，不保證每次符合性格。免費時 FOLD 不抽選，CALL 代表過牌，RAISE 代表開注；非法欄位移除後，其餘欄位按比例正規化。</p><div class="boss-profile-grid">${BOSS_PROFILES.map(p=>`<details class="boss-profile-card" data-profile="${p.id}" ${p.id==='caller'?'open':''}><summary><b>${esc(p.name)}｜${esc(p.nickname)}</b><span>查看四街機率</span></summary><p>${esc(p.description)}</p><div class="table-scroll"><table><thead><tr><th>階段</th><th>當下牌力</th><th>FOLD 棄牌</th><th>CALL 跟注</th><th>RAISE 加注</th><th>免費 CALL／RAISE</th></tr></thead><tbody>${Object.keys(STREETS).flatMap(street=>BOSS_BANDS_BY_STREET[street].map(band=>{
 const row=p.tables[street][band],den=row.call+row.raise;
 return `<tr><td>${STREETS[street]}</td><td title="${esc(BOSS_BANDS[band].description)}">${esc(BOSS_BANDS[band].label)}</td><td>${row.fold}%</td><td>${row.call}%</td><td class="boss-raise-prob">${row.raise}%</td><td>${ratio(row.call,den)}／${ratio(row.raise,den)}</td></tr>`;
 })).join('')}</tbody></table></div></details>`).join('')}</div><details class="boss-band-notes"><summary>牌力分級與合法動作換算</summary><ul>${Object.entries(BOSS_BANDS).map(([key,band])=>`<li><b>${esc(band.label)}</b>：${esc(band.description)}</li>`).join('')}</ul><p class="hint">表內牌力只讀 BOSS 自己底牌及已公開公牌，不讀玩家暗牌或未來公牌。遊戲只顯示對手身份，不顯示秘密牌力級別。每街最多加注一次的規則不變；無法再加注時將該欄剔除，依剩餘合法權重計算。零機率合法邊仍保留在完整行動樹。</p></details>`;
}
export function renderBossStudy(report,root=document){
 const el=root.getElementById('boss-study-results');if(!el)return;
 if(!report?.byBoss){el.innerHTML='';return;}
 const rows=Object.entries(report.byBoss).filter(([,r])=>r.hands>0).map(([id,r])=>{const p=BOSS_PROFILES.find(p=>p.id===id);return `<tr><td>${esc(p?`${p.name}｜${p.nickname}`:'舊版權重')}</td><td>${money(r.hands)}</td><td>${ratio(r.wins,r.hands)}</td><td>${ratio(r.showdownWins,r.showdowns)}</td><td>${ratio(r.netReturns,r.wagers)}</td><td>${ratio(r.totalReturns,r.wagers)}</td></tr>`;}).join('');
 el.innerHTML=`<section class="report-block"><h3>各類 BOSS 實際統計</h3><p class="hint">各類型分別以自己的手數、攤牌數、有效投入計算；有限樣本的遇到次數不必相同。</p><div class="table-scroll"><table><thead><tr><th>對手</th><th>遇到手數</th><th>玩家贏池率</th><th>玩家攤牌勝率</th><th>底池 RTP</th><th>總 RTP</th></tr></thead><tbody>${rows||'<tr><td colspan="6">尚無完成手數。</td></tr>'}</tbody></table></div><p class="hint">輪替核對：首手選取 ${money(report.bossEncounterAudit?.firstSelections)} 次；相鄰檢查 ${money(report.bossEncounterAudit?.checkedTransitions)} 次；違規連續同型 ${money(report.bossEncounterAudit?.unexpectedRepeats)} 次。</p><details class="report-json"><summary>對手輪替原始資料 JSON</summary><pre>${esc(JSON.stringify(report.bossEncounterAudit||{},null,2))}</pre></details></section>`;
}
