import {BOSS_PROFILES, BOSS_BANDS, BOSS_RESPONSE_PRESSURES, getBossProbabilityScenarios} from './boss-profiles.mjs?v=60';
import {esc,money} from './shared.mjs?v=60';
import {NATURAL_BOSS_POLICY_VERSION, NATURAL_BOSS_PROFILES, createBossDecisionView, getNaturalBossDistribution} from './boss-policy.mjs?v=60';
import {legalHoldemActions} from './holdem-betting.mjs?v=60';
const pct=(v,digits=2)=>Number.isFinite(v)?`${(v*100).toFixed(digits)}%`:'—';
const ratio=(a,b)=>b>0?pct(a/b):'—';
export function renderBossProbabilityTables(root=document, mode='natural-holdem'){
 const el=root.getElementById('boss-profile-tables');if(!el)return;
 if(mode==='natural-holdem'){el.innerHTML=naturalBossTablesHtml();return;}
 el.innerHTML=`<p class="hint">每手兩種 BOSS 各 50%，獨立隨機遇到，允許連續同型。研究可固定對手。每街開始先按對手底牌、已揭公共牌及前一街紀錄判定並鎖定強／不強；回應機率依玩家本次實際下注壓力選列。下列為遊戲設計參數，不是真人統計平均。</p><div class="boss-profile-grid">${BOSS_PROFILES.map(p=>`<details class="boss-profile-card" data-profile="${p.id}" ${p.id==='caller'?'open':''}><summary><b>${esc(p.name)}｜${esc(p.nickname)}</b><span>查看強／不強與下注壓力機率</span></summary><p>${esc(p.description)}</p><div class="table-scroll"><table><thead><tr><th>分類</th><th>實際壓力</th><th>FOLD 棄牌</th><th>CALL 跟注</th><th>RAISE 加注</th><th>不能加注 FOLD／CALL</th></tr></thead><tbody>${['strong','weak'].flatMap(band=>Object.entries(BOSS_RESPONSE_PRESSURES).map(([key,label])=>{
 const row=p.pressureWeights[key][band],den=row.fold+row.call;
 return `<tr><td>${BOSS_BANDS[band].label}</td><td>${label}</td><td>${pct(row.fold/100)}</td><td>${pct(row.call/100)}</td><td class="boss-raise-prob">${pct(row.raise/100)}</td><td>${ratio(row.fold,den)}／${ratio(row.call,den)}</td></tr>`;
 })).join('')}</tbody></table></div><p class="hint">免費時 CHECK／BET 或 RAISE：${['strong','weak'].map(band=>{const row=p.weights[band];return `${BOSS_BANDS[band].label} ${pct((row.fold+row.call)/100)}／${pct(row.raise/100)}`;}).join('；')}。</p></details>`).join('')}</div><details class="boss-band-notes"><summary>明確判定條件與金額抽選</summary><ul><li>Preflop：底牌對子、兩張均至少為 10、或同花且含 A，任一成立即為強。</li><li>Flop／Turn／River：對子以上為強，包含公共牌本身的對子。</li><li>Flop／Turn：四張同花、雙頭順亦為強。卡順需至少一個必要點數只由底牌提供，且有一張底牌大於公牌最高點數。</li><li>雙頭順必須兩端都能補成：2345、TJQK 算；A234、JQKA 不算。</li><li>River 高牌詐唬：NPC 在 Turn 曾 BET／RAISE，並且符合其一：Turn 有涉及底牌但沒補成的四花／雙頭順；或公牌恰好三張同花且 NPC 持該花色 A。</li></ul><p class="hint">每街只判定一次強／不強，玩家再加注或結果切換 NPC 配對均不重判；下一街才依當時配對重判。每次輪到 NPC 重新抽行動。可以 CHECK 時採半池基準列合併 FOLD＋CALL；不能 RAISE 時將當次壓力列的 FOLD／CALL 按比例換算。</p><p class="hint">實際壓力＝NPC 本次可跟注差額 ÷（玩家行動後底池－NPC 未補差額）。分母等於玩家本次先補 CALL 後、增加新注額前的底池；再加注使用新增差額，不使用累計注額或按鈕名稱。半池以下／超過半池至全池／超過全池分別使用三列。短碼 ALL IN 依實際壓力，同額選項機率相同；對手無法再加注時移除 RAISE 並正規化。</p><p class="hint">抽中 BET／RAISE 後，0.5 倍底池 50%、1 倍底池 35%、ALL IN 15%。本次追加＝待補額＋倍率×（目前底池＋待補額）；依最小合法加注及剩餘籌碼修正，相同金額合併機率。15% 是直接抽中 ALL IN 選項的機率，不包含其他尺寸因籌碼不足轉成 ALL IN。三種壓力與免費情境均可事先公開，不透露實際成牌或詐唬原因。</p></details>`;
}

/** In-game view exposes each numeric price scenario, never the private class. */
export function bossProbabilityScenariosHtml(hand) {
 if(hand.config?.outcome?.mode==='natural-holdem') {
  const {distribution}=getBossProbabilityScenarios(hand);
  return `<p class="muted">Responses use the exact legal call price, your opponent’s own cards, revealed board and action history. The action previews show the distribution after each selected action. Future cards and your private cards are unavailable to this policy.</p>${distribution.length?`<section class="odds-scenario"><h3>Current legal response</h3>${distribution.map(action=>`<div><span>${esc(action.type.toUpperCase())}${action.amount?' · '+money(action.amount):''}</span><b>${pct(action.probability)}</b></div>`).join('')}</section>`:''}`;
 }
 const scenarios=getBossProbabilityScenarios(hand),c=scenarios.free;
 const labels={half:'Up to ½ pot',pot:'Over ½ to 1 pot',large:'Over 1 pot'};
 const section=(title,rows)=>`<section class="odds-scenario"><h3>${title}</h3>${rows.map(([label,value])=>`<div><span>${label}</span><b>${pct(value)}</b></div>`).join('')}</section>`;
 return `${Object.entries(scenarios.byPressure).map(([key,{facing:f}])=>section(`Facing a bet · ${labels[key]}`,[['FOLD',f.fold],['CALL',f.call],['RAISE',f.raise]])).join('')}${section('Free to check',[['CHECK',c.check],['BET / RAISE',c.raise]])}${Object.entries(scenarios.byPressure).map(([key,{noRaise:n}])=>section(`No raise available · ${labels[key]}`,[['FOLD',n.fold],['CALL',n.call]])).join('')}<p class="muted">Responses follow the actual call price relative to the pot before your new raise. Short all-ins use their actual pressure. Raise sizes: ½ pot 50% · pot 35% · all in 15%.</p>`;
}
function naturalBossTablesHtml() {
 const examples=[['低張非同花',['7c','2d']],['同花連張',['Jd','Td']],['高對子',['As','Ah']]];
 const rows=profileId=>examples.flatMap(([label,hole])=>[.5,2,4].map(pressure=>{
  const owed=20*pressure;
  const hand={config:{outcome:{mode:'natural-holdem'},bigBlind:2},status:'playing',actor:'npc',street:'preflop',
   holes:{npc:hole},board:[],bossProfile:{id:profileId},stacks:{npc:1000,player:1000-owed},
   streetBets:{npc:0,player:owed},pot:20+owed,currentBet:owed,lastFullRaise:owed,actedSinceFullRaise:[],history:[]};
  const distribution=getNaturalBossDistribution(createBossDecisionView(hand,legalHoldemActions(hand)));
  const family=type=>distribution.filter(action=>action.type===type).reduce((sum,action)=>sum+action.probability,0);
  return `<tr><td>${label} ${hole.join(' ')}</td><td>${pressure}×</td><td>${pct(family('fold'))}</td><td>${pct(family('call'))}</td><td class="boss-raise-prob">${pct(family('raise'))}</td></tr>`;
 })).join('');
 return `<p class="hint">每手兩種 BOSS 各 50%，獨立隨機遇到，允許連續同型。自然固定牌政策 ${NATURAL_BOSS_POLICY_VERSION} 只使用自己的兩張牌、已揭公牌、公開價格、籌碼與行動紀錄。下面是同一正式策略算出的示例，不是固定強／弱機率表，也不是勝率或 RTP 保證。</p><div class="boss-profile-grid">${Object.entries(NATURAL_BOSS_PROFILES).map(([id,profile])=>`<details class="boss-profile-card" data-profile="${id}" ${id==='caller'?'open':''}><summary><b>${profile.name}｜${profile.nickname}</b><span>查看連續價格回應示例</span></summary><div class="table-scroll"><table><thead><tr><th>示例底牌</th><th>跟注額／基準底池</th><th>FOLD 棄牌</th><th>CALL 跟注</th><th>RAISE 加注</th></tr></thead><tbody>${rows(id)}</tbody></table></div><p class="hint">基準底池 20、BOSS 剩碼 1,000、Preflop，無先前加注紀錄。各列是分開的定價示例；實際對局另計既有行動與合法權限。</p></details>`).join('')}</div><details class="boss-band-notes"><summary>連續回應與合法尺寸的計算方式</summary><ul><li>底牌品質與當前成牌、涉及自身底牌的聽牌構成啟發強度 s；s 不是玩家或 BOSS 勝率。公牌單獨成一對不視為自身成對，River 不再增加聽牌強度。</li><li>壓力 x＝BOSS 實際可跟金額 ÷（目前底池－尚未補的差額），分母最小為 0.000001。以 log(1+x) 連續影響 FOLD／CALL／RAISE，沒有半池、全池、大額三檔切換。相同實際報價及相同公開歷史得到相同分布。</li><li>PASSIVE 的原始 FOLD／CALL／進攻係數為 0.7／2.6／0.42；AGGRESSIVE 為 1／1.8／1.15。跟注成本越高，棄牌權重上升、跟注與進攻權重下降；自身成牌／聽牌及此前進攻紀錄可提高進攻權重。強牌的價格敏感度較低，不會因大額全下就與弱牌一樣幾乎全棄。當街加注次數抑制持續再加注。</li><li>若已知牌可證明不可能輸，FOLD 權重為零；若同時完全使用公共牌，則只 CHECK／CALL。River 順子以上以自己的牌和已揭公牌，檢查所有合法未知對手底牌是否可能更高，不讀真實玩家暗牌。這只判斷是否確定不敗，不估計未知對手持牌機率。</li><li>只分配給引擎當下合法動作：免費可 CHECK 時 FOLD 權重為零；短全下未重開加注權、對方已全下時不生成 RAISE；剩餘權重再正規化為 100%。</li><li>進攻尺寸基礎權重：PASSIVE 半池／全池／ALL IN＝60／30／10；AGGRESSIVE＝35／40／25。ALL IN 權重再乘 exp(2×(s−0.5))，三項正規化。最小合法額與籌碼上限仍由引擎計算，同額合併全部尺寸權重。</li><li>預覽與正式行動共用同一個純函式；預覽不抽亂數。正式先抽動作，選到 BET／RAISE 再抽尺寸。政策不讀玩家暗牌、未揭牌、牌局勝負目標、結果水池或返還缺口。</li></ul><p class="hint">本政策是可重現的遊戲行為設計，不是真人統計平均，也未校準為任意玩家策略皆達 99% RTP。</p></details>`;
}
export function renderBossStudy(report,root=document){
 const el=root.getElementById('boss-study-results');if(!el)return;
 if(!report?.byBoss){el.innerHTML='';return;}
 const rows=Object.entries(report.byBoss).filter(([,r])=>r.hands>0).map(([id,r])=>{const p=BOSS_PROFILES.find(p=>p.id===id);return `<tr><td>${esc(p?`${p.name}｜${p.nickname}`:'舊版權重')}</td><td>${money(r.hands)}</td><td>${ratio(r.wins,r.hands)}</td><td>${ratio(r.showdownWins,r.showdowns)}</td><td>${ratio(r.netReturns,r.wagers)}</td><td>${ratio(r.totalReturns,r.wagers)}</td></tr>`;}).join('');
 el.innerHTML=`<section class="report-block"><h3>各類 BOSS 實際統計</h3><p class="hint">各類型分別以自己的手數、攤牌數、有效投入計算；有限樣本的遇到次數不必相同。</p><div class="table-scroll"><table><thead><tr><th>對手</th><th>遇到手數</th><th>玩家贏池率</th><th>玩家攤牌勝率</th><th>底池 RTP</th><th>總 RTP</th></tr></thead><tbody>${rows||'<tr><td colspan="6">尚無完成手數。</td></tr>'}</tbody></table></div><p class="hint">遇到紀錄：首手選取 ${money(report.bossEncounterAudit?.firstSelections)} 次；相鄰紀錄 ${money(report.bossEncounterAudit?.checkedTransitions)} 次；連續同型 ${money(report.bossEncounterAudit?.consecutiveRepeats)} 次。${report.bossEncounterAudit?.mode==='random'?'每手獨立抽選，連續同型是合法結果。':'依本次研究對手模式統計。'}</p><details class="report-json"><summary>對手遇到原始資料 JSON</summary><pre>${esc(JSON.stringify(report.bossEncounterAudit||{},null,2))}</pre></details></section>`;
}
