import {BOSS_PROFILES, BOSS_BANDS, getBossProbabilityScenarios} from './boss-profiles.mjs?v=55';
import {esc,money} from './shared.mjs?v=55';
const pct=(v,digits=2)=>Number.isFinite(v)?`${(v*100).toFixed(digits)}%`:'—';
const ratio=(a,b)=>b>0?pct(a/b):'—';
export function renderBossProbabilityTables(root=document){
 const el=root.getElementById('boss-profile-tables');if(!el)return;
 el.innerHTML=`<p class="hint">首次兩種各 50%；同一玩家的下一手必定換成另一種。固定對手研究可重複同一種。每街開始先按對手底牌、已揭公共牌及前一街紀錄判定強／不強，再公布並鎖定機率；玩家本街下注金額及再加注次數不改變分類。下列為遊戲設計參數，不是真人統計平均。</p><div class="boss-profile-grid">${BOSS_PROFILES.map(p=>`<details class="boss-profile-card" data-profile="${p.id}" ${p.id==='caller'?'open':''}><summary><b>${esc(p.name)}｜${esc(p.nickname)}</b><span>查看強／不強機率</span></summary><p>${esc(p.description)}</p><div class="table-scroll"><table><thead><tr><th>分類</th><th>FOLD 棄牌</th><th>CALL 跟注</th><th>RAISE 加注</th><th>免費 CHECK／BET 或 RAISE</th><th>不能加注 FOLD／CALL</th></tr></thead><tbody>${['strong','weak'].map(band=>{
 const row=p.weights[band],den=row.fold+row.call;
 return `<tr><td>${BOSS_BANDS[band].label}</td><td>${pct(row.fold/100)}</td><td>${pct(row.call/100)}</td><td class="boss-raise-prob">${pct(row.raise/100)}</td><td>${pct(den/100)}／${pct(row.raise/100)}</td><td>${ratio(row.fold,den)}／${ratio(row.call,den)}</td></tr>`;
 }).join('')}</tbody></table></div></details>`).join('')}</div><details class="boss-band-notes"><summary>明確判定條件與金額抽選</summary><ul><li>Preflop：底牌對子、兩張均至少為 10、或同花且含 A，任一成立即為強。</li><li>Flop／Turn／River：對子以上為強，包含公共牌本身的對子。</li><li>Flop／Turn：四張同花、雙頭順亦為強。卡順需至少一個必要點數只由底牌提供，且有一張底牌大於公牌最高點數。</li><li>雙頭順必須兩端都能補成：2345、TJQK 算；A234、JQKA 不算。</li><li>River 高牌詐唬：NPC 在 Turn 曾 BET／RAISE，並且符合其一：Turn 有涉及底牌但沒補成的四花／雙頭順；或公牌恰好三張同花且 NPC 持該花色 A。</li></ul><p class="hint">每街只判定一次，每次輪到 NPC 重新抽行動；本街玩家下注或結果切換 NPC 配對均不改機率，下一街才依當時配對重判。可以 CHECK 時合併 FOLD＋CALL；不能 RAISE 時將 FOLD／CALL 按比例換算。三種情境均可事先公開，不透露實際成牌或詐唬原因。</p><p class="hint">抽中 BET／RAISE 後，0.5 倍底池 50%、1 倍底池 35%、ALL IN 15%。本次追加＝待補額＋倍率×（目前底池＋待補額）；依最小合法加注及剩餘籌碼修正，相同金額合併機率。15% 是直接抽中 ALL IN 選項的機率，不包含其他尺寸因籌碼不足轉成 ALL IN。</p></details>`;
}

/** In-game view exposes all three numeric scenarios before the player acts, never the private class. */
export function bossProbabilityScenariosHtml(hand) {
 const scenarios=getBossProbabilityScenarios(hand),f=scenarios.facing,c=scenarios.free,n=scenarios.noRaise;
 return `<table class="boss-scenario-table"><thead><tr><th>Situation</th><th>FOLD</th><th>CALL / CHECK</th><th>RAISE / BET</th></tr></thead><tbody><tr><td>Facing a bet</td><td>${pct(f.fold)}</td><td>${pct(f.call)}</td><td>${pct(f.raise)}</td></tr><tr><td>Free to check</td><td>—</td><td>${pct(c.check)}</td><td>${pct(c.raise)}</td></tr><tr><td>No raise available</td><td>${pct(n.fold)}</td><td>${pct(n.call)}</td><td>—</td></tr></tbody></table><p class="boss-scenario-note">Locked for this street. Raise sizes: ½ pot 50% · pot 35% · all in 15%.</p>`;
}
export function renderBossStudy(report,root=document){
 const el=root.getElementById('boss-study-results');if(!el)return;
 if(!report?.byBoss){el.innerHTML='';return;}
 const rows=Object.entries(report.byBoss).filter(([,r])=>r.hands>0).map(([id,r])=>{const p=BOSS_PROFILES.find(p=>p.id===id);return `<tr><td>${esc(p?`${p.name}｜${p.nickname}`:'舊版權重')}</td><td>${money(r.hands)}</td><td>${ratio(r.wins,r.hands)}</td><td>${ratio(r.showdownWins,r.showdowns)}</td><td>${ratio(r.netReturns,r.wagers)}</td><td>${ratio(r.totalReturns,r.wagers)}</td></tr>`;}).join('');
 el.innerHTML=`<section class="report-block"><h3>各類 BOSS 實際統計</h3><p class="hint">各類型分別以自己的手數、攤牌數、有效投入計算；有限樣本的遇到次數不必相同。</p><div class="table-scroll"><table><thead><tr><th>對手</th><th>遇到手數</th><th>玩家贏池率</th><th>玩家攤牌勝率</th><th>底池 RTP</th><th>總 RTP</th></tr></thead><tbody>${rows||'<tr><td colspan="6">尚無完成手數。</td></tr>'}</tbody></table></div><p class="hint">輪替核對：首手選取 ${money(report.bossEncounterAudit?.firstSelections)} 次；相鄰檢查 ${money(report.bossEncounterAudit?.checkedTransitions)} 次；違規連續同型 ${money(report.bossEncounterAudit?.unexpectedRepeats)} 次。</p><details class="report-json"><summary>對手輪替原始資料 JSON</summary><pre>${esc(JSON.stringify(report.bossEncounterAudit||{},null,2))}</pre></details></section>`;
}
