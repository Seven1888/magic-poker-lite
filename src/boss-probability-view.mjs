import {BOSS_PROFILES, BOSS_BANDS, BOSS_RESPONSE_PRESSURES, getBossProbabilityScenarios} from './boss-profiles.mjs?v=59';
import {esc,money} from './shared.mjs?v=59';
const pct=(v,digits=2)=>Number.isFinite(v)?`${(v*100).toFixed(digits)}%`:'—';
const ratio=(a,b)=>b>0?pct(a/b):'—';
export function renderBossProbabilityTables(root=document){
 const el=root.getElementById('boss-profile-tables');if(!el)return;
 el.innerHTML=`<p class="hint">每手兩種 BOSS 各 50%，獨立隨機遇到，允許連續同型。研究可固定對手。每街開始先按對手底牌、已揭公共牌及前一街紀錄判定並鎖定強／不強；回應機率依玩家本次實際下注壓力選列。下列為遊戲設計參數，不是真人統計平均。</p><div class="boss-profile-grid">${BOSS_PROFILES.map(p=>`<details class="boss-profile-card" data-profile="${p.id}" ${p.id==='caller'?'open':''}><summary><b>${esc(p.name)}｜${esc(p.nickname)}</b><span>查看強／不強與下注壓力機率</span></summary><p>${esc(p.description)}</p><div class="table-scroll"><table><thead><tr><th>分類</th><th>實際壓力</th><th>FOLD 棄牌</th><th>CALL 跟注</th><th>RAISE 加注</th><th>不能加注 FOLD／CALL</th></tr></thead><tbody>${['strong','weak'].flatMap(band=>Object.entries(BOSS_RESPONSE_PRESSURES).map(([key,label])=>{
 const row=p.pressureWeights[key][band],den=row.fold+row.call;
 return `<tr><td>${BOSS_BANDS[band].label}</td><td>${label}</td><td>${pct(row.fold/100)}</td><td>${pct(row.call/100)}</td><td class="boss-raise-prob">${pct(row.raise/100)}</td><td>${ratio(row.fold,den)}／${ratio(row.call,den)}</td></tr>`;
 })).join('')}</tbody></table></div><p class="hint">免費時 CHECK／BET 或 RAISE：${['strong','weak'].map(band=>{const row=p.weights[band];return `${BOSS_BANDS[band].label} ${pct((row.fold+row.call)/100)}／${pct(row.raise/100)}`;}).join('；')}。</p></details>`).join('')}</div><details class="boss-band-notes"><summary>明確判定條件與金額抽選</summary><ul><li>Preflop：底牌對子、兩張均至少為 10、或同花且含 A，任一成立即為強。</li><li>Flop／Turn／River：對子以上為強，包含公共牌本身的對子。</li><li>Flop／Turn：四張同花、雙頭順亦為強。卡順需至少一個必要點數只由底牌提供，且有一張底牌大於公牌最高點數。</li><li>雙頭順必須兩端都能補成：2345、TJQK 算；A234、JQKA 不算。</li><li>River 高牌詐唬：NPC 在 Turn 曾 BET／RAISE，並且符合其一：Turn 有涉及底牌但沒補成的四花／雙頭順；或公牌恰好三張同花且 NPC 持該花色 A。</li></ul><p class="hint">每街只判定一次強／不強，玩家再加注或結果切換 NPC 配對均不重判；下一街才依當時配對重判。每次輪到 NPC 重新抽行動。可以 CHECK 時採半池基準列合併 FOLD＋CALL；不能 RAISE 時將當次壓力列的 FOLD／CALL 按比例換算。</p><p class="hint">實際壓力＝NPC 本次可跟注差額 ÷（玩家行動後底池－NPC 未補差額）。分母等於玩家本次先補 CALL 後、增加新注額前的底池；再加注使用新增差額，不使用累計注額或按鈕名稱。半池以下／超過半池至全池／超過全池分別使用三列。短碼 ALL IN 依實際壓力，同額選項機率相同；對手無法再加注時移除 RAISE 並正規化。</p><p class="hint">抽中 BET／RAISE 後，0.5 倍底池 50%、1 倍底池 35%、ALL IN 15%。本次追加＝待補額＋倍率×（目前底池＋待補額）；依最小合法加注及剩餘籌碼修正，相同金額合併機率。15% 是直接抽中 ALL IN 選項的機率，不包含其他尺寸因籌碼不足轉成 ALL IN。三種壓力與免費情境均可事先公開，不透露實際成牌或詐唬原因。</p></details>`;
}

/** In-game view exposes each numeric price scenario, never the private class. */
export function bossProbabilityScenariosHtml(hand) {
 const scenarios=getBossProbabilityScenarios(hand),c=scenarios.free;
 const labels={half:'Up to ½ pot',pot:'Over ½ to 1 pot',large:'Over 1 pot'};
 const section=(title,rows)=>`<section class="odds-scenario"><h3>${title}</h3>${rows.map(([label,value])=>`<div><span>${label}</span><b>${pct(value)}</b></div>`).join('')}</section>`;
 return `${Object.entries(scenarios.byPressure).map(([key,{facing:f}])=>section(`Facing a bet · ${labels[key]}`,[['FOLD',f.fold],['CALL',f.call],['RAISE',f.raise]])).join('')}${section('Free to check',[['CHECK',c.check],['BET / RAISE',c.raise]])}${Object.entries(scenarios.byPressure).map(([key,{noRaise:n}])=>section(`No raise available · ${labels[key]}`,[['FOLD',n.fold],['CALL',n.call]])).join('')}<p class="muted">Responses follow the actual call price relative to the pot before your new raise. Short all-ins use their actual pressure. Raise sizes: ½ pot 50% · pot 35% · all in 15%.</p>`;
}
export function renderBossStudy(report,root=document){
 const el=root.getElementById('boss-study-results');if(!el)return;
 if(!report?.byBoss){el.innerHTML='';return;}
 const rows=Object.entries(report.byBoss).filter(([,r])=>r.hands>0).map(([id,r])=>{const p=BOSS_PROFILES.find(p=>p.id===id);return `<tr><td>${esc(p?`${p.name}｜${p.nickname}`:'舊版權重')}</td><td>${money(r.hands)}</td><td>${ratio(r.wins,r.hands)}</td><td>${ratio(r.showdownWins,r.showdowns)}</td><td>${ratio(r.netReturns,r.wagers)}</td><td>${ratio(r.totalReturns,r.wagers)}</td></tr>`;}).join('');
 el.innerHTML=`<section class="report-block"><h3>各類 BOSS 實際統計</h3><p class="hint">各類型分別以自己的手數、攤牌數、有效投入計算；有限樣本的遇到次數不必相同。</p><div class="table-scroll"><table><thead><tr><th>對手</th><th>遇到手數</th><th>玩家贏池率</th><th>玩家攤牌勝率</th><th>底池 RTP</th><th>總 RTP</th></tr></thead><tbody>${rows||'<tr><td colspan="6">尚無完成手數。</td></tr>'}</tbody></table></div><p class="hint">遇到紀錄：首手選取 ${money(report.bossEncounterAudit?.firstSelections)} 次；相鄰紀錄 ${money(report.bossEncounterAudit?.checkedTransitions)} 次；連續同型 ${money(report.bossEncounterAudit?.consecutiveRepeats)} 次。${report.bossEncounterAudit?.mode==='random'?'每手獨立抽選，連續同型是合法結果。':'依本次研究對手模式統計。'}</p><details class="report-json"><summary>對手遇到原始資料 JSON</summary><pre>${esc(JSON.stringify(report.bossEncounterAudit||{},null,2))}</pre></details></section>`;
}
