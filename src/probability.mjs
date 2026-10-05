import {renderBossProbabilityTables,renderBossStudy} from './boss-probability-view.mjs?v=46';
import {DEFAULT_CONFIG,normalizeConfig,holeScore} from './engine.mjs?v=46';
import {JACKPOT_MULTIPLIERS,quoteJackpot} from './jackpot.mjs?v=35';
import {CONFIG_KEY,loadConfig,money,pct,esc,cardMarkup,download} from './shared.mjs?v=46';
import {LAB_LABELS as LABELS,LAB_STREETS as STREETS,LAB_POLICIES as policyNames,LAB_JACKPOTS as jackpotNames,translateLabError as translateError} from './probability-text.mjs?v=46';
import {renderStudyDetails,renderActionTree,poolSummaryTable} from './probability-report-view.mjs?v=46';
const $=id=>document.getElementById(id);
let worker=null,reports=[],selectedIndex=0,startedAt=0,toastTimer,runSnapshot=null,runState='等待模擬',settingsDirty=false;
let actionTree=null,treeStudy=null,activeTask='simulation',formConfig=structuredClone(DEFAULT_CONFIG);
const jackpotTiers=[
  {key:'royal',cards:['As','Ks','Qs','Js','Ts']},
  {key:'straightFlush',cards:['9h','8h','7h','6h','5h']},
  {key:'quads',cards:['Qs','Qh','Qd','Qc','As']}
].map(tier=>({...tier,label:jackpotNames[tier.key],multiplier:JACKPOT_MULTIPLIERS[tier.key]}));
const get=(o,path)=>path.split('.').reduce((v,k)=>v?.[k],o);
function set(o,path,value){const keys=path.split('.');let p=o;for(let i=0;i<keys.length-1;i++)p=p[keys[i]]??=(/^\d+$/.test(keys[i+1])?[]:{});p[keys.at(-1)]=value;}
function toast(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3500);}
function showError(error){$('error').textContent=translateError(error);$('error').focus();}
function settingsChanged(message='設定已變更・尚未儲存'){
  settingsDirty=Boolean(runSnapshot);$('settings-state').textContent=message;
  if(runSnapshot)$('run-label').textContent='設定已變更・報表仍顯示上次結果，請重新執行以更新。';
  if(actionTree)$('tree-context').textContent='參數已變更；下方完整樹仍屬先前參數，請重新建立。';
  if(treeStudy)$('tree-study-state').textContent='參數已變更；下方樹統計仍屬先前參數，請重新執行。';
  refreshDerived();updateReportContext();
}
function updateReportContext(){
  $('report-state').textContent=runState;
  const r=reports[selectedIndex]||reports[0];
  $('report-context-note').textContent=r?`${money(r.hands)} 手・種子 ${r.seed}${settingsDirty?'・仍為先前設定，請重新執行以更新':''}`:'執行模擬後，即可查看本次設定與結果。';
}
function numberField(path,label,min,max,step='0.01',scale='',help=''){const id=path.replaceAll('.','-');return `<div class="field"><label for="${id}">${label}</label><input id="${id}" data-config="${path}" ${scale?`data-scale="${scale}"`:''} type="number" min="${min}" ${max==null?'':`max="${max}"`} step="${step}">${help?`<small class="field-help">${help}</small>`:''}</div>`;}
$('street-fields').innerHTML=Object.entries(STREETS).map(([key,label])=>numberField(`betSize.${key}`,`${label}下注增額`,.02,null)).join('');
$('outcome-fields').innerHTML=numberField('outcome.conversionRate','付費轉贏計分係數 %',0,100,.1,100,'預設 99%；與底池返還係數分開，不保證實測總 RTP。')
 +numberField('outcome.paidActionBudgetShare','投入計分分配至付費池 %',0,100,.1,100,'預設 80%；剩餘部分進特殊牌型池。')
 +numberField('outcome.paidActionCooldownMin','付費池冷卻最小值',0,null,1)
 +numberField('outcome.paidActionCooldownMax','付費池冷卻最大值',0,null,1)
 +numberField('outcome.specialUseChance','特殊牌型池使用機率 %',0,100,.1,100,'預設 20%；實際資格、池額與牌面均須符合。')
 +numberField('outcome.initialPaidActionCooldown','初始付費池冷卻',0,null,1)
 +[0,1,2].map(index=>numberField(`outcome.initialPaidActionPools.${index}`,`第 ${index+1} 桶初始付費池`,0,null,.000001)+numberField(`outcome.initialSpecialPools.${index}`,`第 ${index+1} 桶初始特殊牌型池`,0,null,.000001)).join('');
for(const seat of ['player','npc']){
  $(seat+'-deal').innerHTML=`<div class="field"><label for="${seat}-reroll-mode">起手重抽規則</label><select id="${seat}-reroll-mode" data-config="deal.${seat}.rerollMode"><option value="unpaired">BOSS DUEL 流程 · 未成對才重抽</option><option value="legacy-score">舊版相容 · 牌力分數門檻</option></select><small class="field-help">兩張牌適配：成對立即停止；未成對包含 AK 同花。</small></div>`+numberField(`deal.${seat}.rerollChance`,'未達停止條件時重抽機率 %',0,100,1,100,`預設${seat==='player'?'玩家 50':'對手 25'}%。每次候選分別判斷。`)+numberField(`deal.${seat}.maxRerolls`,'額外重抽次數上限',0,50,1,'','預設額外 50 次，最多 51 副候選，只保留最後一副。')+numberField(`deal.${seat}.targetScore`,'舊版牌力門檻',0,1,.01,'','僅舊版相容模式使用，不是 BOSS DUEL 重抽條件。')+`<div class="field"><label for="${seat}-manual">指定起手牌</label><input id="${seat}-manual" data-config="deal.${seat}.manual" type="text" placeholder="選填：As Ks" spellcheck="false" autocapitalize="off"><small class="field-help">兩張底牌；指定時跳過該座位的重抽。</small></div><div id="${seat}-preview" class="deal-preview"></div><div class="deal-preset"><button type="button" data-seat="${seat}" data-preset="natural">自然發牌</button><button type="button" data-seat="${seat}" data-preset="boosted">BOSS DUEL 預設</button><button type="button" data-seat="${seat}" data-preset="strong">100% 重抽</button></div><p class="hint">每次重抽整副兩張，落選牌回池，不挑候選中的最好牌。沿用原作的條件與機率流程；歷史牌庫模式依此自然發牌；預建模式先規劃結果，再固定玩家／公牌布局，BOSS 暗牌依預存節點選取，可能重建未公開布局。兩種模式都禁止重複牌。</p>`;
}
$('npc-fields').innerHTML=['fold','call','raise','check','bet'].map(k=>numberField(`npc.${k}`,`${LABELS[k]}基礎權重`,0,1,.01)).join('')+numberField('npc.strengthInfluence','牌力影響係數',0,4,.1)+numberField('npc.priceInfluence','跟注成本影響係數',0,4,.1)+'<p class="hint">平衡、積極、保守的模擬玩家亦以此權重作策略基底；始終跟注除外。權重不是最終機率。引擎依行動者自身牌力與跟注成本調整，再將合法動作正規化；全部權重為零時，預設過牌或跟注。</p>';
function fill(config){formConfig=structuredClone(config);for(const el of document.querySelectorAll('[data-config]')){const value=get(config,el.dataset.config);if(el.type==='checkbox'){el.checked=Boolean(value);continue;}if(el.type==='number')el.required=true;el.value=Array.isArray(value)?value.join(' '):el.type==='number'?Number(value??(el.dataset.config.endsWith('targetScore') ? 0.48 : 0))*(Number(el.dataset.scale)||1):value??'';}refreshDerived();}
function readConfig(){
  const raw=structuredClone(formConfig);for(const el of document.querySelectorAll('[data-config]')){if(el.closest('.field')?.hidden)continue;if(!el.checkValidity()){el.closest('details').open=true;throw new Error(`${el.closest('.field').querySelector('label').textContent}：請輸入允許範圍內的數值。`);}set(raw,el.dataset.config,el.type==='checkbox'?el.checked:el.type==='number'?Number(el.value)/(Number(el.dataset.scale)||1):el.value.trim());}
  raw.smallBlind=raw.bigBlind/2; // The small blind always follows the selected BET.
  if(raw.minBuyIn<raw.bigBlind)throw new Error('每手最低開局資產不得低於大盲。');
  if(raw.maxBuyIn<raw.minBuyIn||raw.buyIn<raw.minBuyIn||raw.buyIn>raw.maxBuyIn)throw new Error('入桌資產須符合：最低資產 ≤ 起始資產 ≤ 最高資產。');
  if(Object.values(raw.betSize).some(v=>v<raw.bigBlind))throw new Error('每街下注增額不得低於大盲。');
  return normalizeConfig(raw);
}
function simSettings(){
  for(const id of ['players','entries','seed','slice-size','target-asset','player-hand-limit'])if(!$(id).checkValidity()||$(id).value==='')throw new Error('請填入有效的手數、種子與資產範圍。');
  const players=Number($('players').value),entries=Number($('entries').value),mode=$('study-mode').value,maxHandsPerPlayer=Number($('player-hand-limit').value);
  const hands=players*(mode==='cashout'?maxHandsPerPlayer:entries);if(hands<1||hands>1000000)throw new Error('每種策略的手數上限須介於 1 至 1,000,000 手。');
  return {hands,players,groups:players,entries,mode,sliceSize:Number($('slice-size').value),targetAsset:Number($('target-asset').value),maxHandsPerPlayer,seed:Number($('seed').value),policies:$('policy').value==='compare'?Object.keys(policyNames):[$('policy').value]};
}
function refreshDerived(){
  const target=Number($('target-rtp').value)||96;$('fee-formula').textContent=`底池費用 ${(100-target).toFixed(1)}%・底池返還＝分得底池 × ${(target/100).toFixed(3)}；彩金另行加計。`;
  const report=reports[selectedIndex]||reports[0];$('metric-target').innerHTML=`${(report?report.config.targetRtp*100:target).toFixed(2)}<em>%</em>`;
  const bigBlind=Number($('big-blind').value),enabled=$('jackpot-enabled').checked;
  $('small-blind').value=Number.isFinite(bigBlind)&&bigBlind>=.02?Math.round((bigBlind/2+Number.EPSILON)*1e6)/1e6:'';
  $('jackpot-tiers').classList.toggle('off',!enabled);
  $('jackpot-tiers').innerHTML=jackpotTiers.map(t=>`<div class="jackpot-tier"><div><b>${t.label}</b><span>最高一獎，不累加</span></div><div><span class="jackpot-example">${t.cards.map(c=>cardMarkup(c)).join('')}</span><strong>${t.multiplier}× BET</strong></div></div>`).join('');
  $('jackpot-config-state').textContent=enabled?($('outcome-mode').value==='prebuilt-pools'?'開啟・特殊池資格，玩家獲勝攤牌才派發':'開啟・歷史自然牌型獎，彩金另行提供'):'關閉・僅計底池返還';
  const n=Number($('players').value)*Number($($('study-mode').value==='cashout'?'player-hand-limit':'entries').value);$('hand-count').textContent=`每種策略最多 ${money(n)} 手${$('policy').value==='compare'?`・合計最多 ${money(n*4)} 手`:''}`;
  $('study-mode-note').textContent=({independent:'每手只重設相同資產；每位玩家的水池與冷卻仍跨手保存，區間按玩家聚類。',continuous:'保留真實餘額，直到手數用完或不足目前 BET 的每手開局門檻；不自動降低 BET。',cashout:'資產達標優先停止；否則不足目前 BET 的每手開局門檻即停止，安全上限列為截尾。'})[$('study-mode').value];
  for(const seat of ['player','npc']){const field=document.querySelector(`[data-config="deal.${seat}.targetScore"]`);field.closest('.field').hidden=$(seat+'-reroll-mode').value!=='legacy-score';}
  for(const seat of ['player','npc']){try{const source={deal:{[seat]:{manual:$(seat+'-manual').value}}};const cards=normalizeConfig(source).deal[seat].manual;$(seat+'-preview').innerHTML=cards.length?cards.map(c=>cardMarkup(c)).join('')+`<span>指定起手牌<br>牌力分數 ${holeScore(cards).toFixed(3)}</span>`:'<div class="card blank">♠</div><div class="card blank">♠</div><span>未手動指定<br>依所選結果模型建立</span>';}catch(e){$(seat+'-preview').innerHTML=`<span style="color:var(--red)">${esc(translateError(e))}</span>`;}}
}
$('config-form').onsubmit=e=>e.preventDefault();$('config-form').addEventListener('input',()=>settingsChanged());
$('policy').addEventListener('change',refreshDerived);
document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>{const {seat,preset}=b.dataset;const p=preset==='natural'?{rerollMode:'unpaired',rerollChance:0,maxRerolls:0}:preset==='strong'?{rerollMode:'unpaired',rerollChance:1,maxRerolls:50}:DEFAULT_CONFIG.deal[seat];for(const [key,value] of Object.entries(p))if(key!=='manual')document.querySelector(`[data-config="deal.${seat}.${key}"]`).value=typeof value==='number'?value*(key==='rerollChance'?100:1):value;$(seat+'-manual').value='';settingsChanged();});
$('reset').onclick=()=>{fill(DEFAULT_CONFIG);settingsChanged('已還原預設值・儲存後套用');$('error').textContent='';};
$('save').onclick=()=>{try{const config=readConfig();localStorage.setItem(CONFIG_KEY,JSON.stringify(config));$('error').textContent='';$('settings-state').textContent='設定已儲存・重新入桌後套用';toast('已儲存，離桌後重新入桌即可套用；目前牌局維持不變。');}catch(e){showError(e);}};
$('export').onclick=()=>{try{download('magic-poker-lite-config.json',{version:4,config:readConfig(),simulation:simSettings()});}catch(e){showError(e);}};
$('import').onclick=()=>$('import-file').click();
$('import-file').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>1000000)throw new Error('設定檔過大，請使用不超過 1 MB 的檔案。');const data=JSON.parse(await file.text());if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('設定檔須包含 JSON 物件。');const input=data.config||data.run?.config||data;if(!['targetRtp','deal','npc','buyIn','jackpotEnabled','outcome'].some(k=>k in input))throw new Error('找不到遊戲設定。');const imported=normalizeConfig(input);fill(imported);const settings=data.simulation||data.run?.simulation;if(settings){$('players').value=settings.players||settings.groups||4;$('entries').value=settings.entries||settings.hands||8;$('seed').value=settings.seed??20260929;$('study-mode').value=settings.mode||'independent';$('slice-size').value=settings.sliceSize||250;$('target-asset').value=settings.targetAsset??20000;$('player-hand-limit').value=settings.maxHandsPerPlayer||8;$('policy').value=settings.policies?.length>1?'compare':settings.policies?.[0]||'balanced';}settingsChanged('設定已匯入・尚未儲存');$('error').textContent='';toast('設定已匯入，包含彩金開關。');}catch(error){showError(`匯入失敗：${translateError(error)}`);}e.target.value='';};
function setRunning(on){
  $('config-form').querySelectorAll('input,select,button').forEach(el=>el.disabled=on);
  for(const id of ['save','reset','import','export','header-run','header-tree','run-tree-study','tree-deals','tree-study-policy','copy-config'])$(id).disabled=on;
  $('header-stop').disabled=!on;
  $('run').disabled=on;$('stop').disabled=!on;$('run').classList.toggle('is-running',on);
  $('run-button-label').textContent=on?'執行中・0%':'執行模擬';
  $('config-form').setAttribute('aria-busy',String(on));
}
function updateProgress(n){$('progress').value=n;$('progress-percent').textContent=`${n.toFixed(1)}%`;$('run').style.setProperty('--run-progress',`${n}%`);if(worker)$('run-button-label').textContent=`執行中・${n.toFixed(1)}%`;}
$('run').onclick=()=>{
  if(worker)return;
  let launching=false;
  try{
    const config=readConfig(),settings=simSettings();activeTask='simulation';reports=[];selectedIndex=0;settingsDirty=false;runState='模擬執行中';
    runSnapshot={config,simulation:settings,startedAt:new Date().toISOString()};startedAt=performance.now();$('error').textContent='';updateProgress(0);$('progress-text').textContent='正在啟動模擬程序…';$('run-label').textContent=`種子 ${settings.seed}・每種策略 ${money(settings.hands)} 手`;
    launching=true;setRunning(true);renderResults();worker=new Worker(new URL('./simulation-worker.mjs?v=46',import.meta.url),{type:'module'});
    worker.onmessage=event=>{const m=event.data;if(m.type==='progress'){updateProgress((m.policyIndex+Math.min(1,m.completed/m.total))/m.policyCount*100);$('progress-text').textContent=`${policyNames[m.policy]}・已完成 ${money(m.completed)} 手（上限 ${money(m.total)}）`;}else if(m.type==='partial'){reports.push(m.report);renderResults();}else if(m.type==='result'){reports=m.reports;finish(false);}else if(m.type==='error'){finish(true,m.message);}};
    worker.onerror=e=>finish(true,e.message||'模擬程序啟動失敗。');worker.postMessage({type:'run',config,...settings});
  }catch(e){if(launching)finish(true,e);else showError(e);}
};
$('stop').onclick=()=>{if(!worker)return;worker.terminate();worker=null;setRunning(false);if(activeTask==='simulation'){runState='已手動停止';$('progress-text').textContent=`已停止・保留 ${reports.length} 種已完成策略的結果，未完成策略不計入。`;$('run-label').textContent='已手動停止';renderResults();}else{const id=activeTask==='tree'?'tree-run-state':'tree-study-state';$(id).textContent='已停止；未完成的樹不作結果。';}};
function finish(failed=false,message=''){worker?.terminate();worker=null;setRunning(false);if(failed){runState='執行失敗';showError(message);$('progress-text').textContent='執行失敗，模擬已停止。';}else{runState=`已完成・${reports.length} 種策略`;updateProgress(100);$('progress-text').textContent=`已完成 ${money(reports.reduce((n,r)=>n+r.hands,0))} 手・${((performance.now()-startedAt)/1000).toFixed(1)} 秒`;$('run-label').textContent=`已完成・種子 ${runSnapshot.simulation.seed}`;}renderResults();}
const ci=(r,key='ci95')=>!r[key]?.every(Number.isFinite)?'樣本不足':`${pct(r[key][0])}–${pct(r[key][1])}`;
const ratio=(numerator,denominator)=>denominator>0?pct(numerator/denominator):'—';
const frequency=(hits,hands)=>hands>0?(100*hits/hands).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:6})+'%':'—';
function renderResults(){
  const r=reports[selectedIndex]||reports[0];$('empty-results').hidden=!!r;$('result-body').hidden=!r;
  renderStudyDetails(r,runSnapshot);renderBossStudy(r);
  for(const id of ['copy-results','export-results','export-csv'])$(id).disabled=!r;
  $('result-select').disabled=reports.length<2;$('result-select').innerHTML=reports.length?reports.map((x,i)=>`<option value="${i}" ${i===selectedIndex?'selected':''}>${policyNames[x.policy]}</option>`).join(''):'<option>尚無已完成策略</option>';updateReportContext();
  if(!r){$('metric-target').innerHTML=`${((runSnapshot?.config.targetRtp??Number($('target-rtp').value)/100)*100).toFixed(2)}<em>%</em>`;for(const id of ['metric-base-rtp','metric-rtp','metric-wager','metric-jackpot','metric-return'])$(id).textContent='—';$('metric-ci').textContent='等待計算 95% 信賴區間';$('metric-base-ci').textContent='僅計底池返還，不含彩金';$('metric-jackpot-note').textContent='僅取最高獎級・獎金不疊加';$('comparison-table').innerHTML='<tr><td colspan="7" class="table-empty">等待策略執行完成。</td></tr>';$('batch-table').innerHTML='<tr><td colspan="9" class="table-empty">尚無統計資料。</td></tr>';return;}
  $('metric-target').innerHTML=`${(r.config.targetRtp*100).toFixed(2)}<em>%</em>`;
  $('metric-base-rtp').innerHTML=r.wagers>0?`${(r.baseRtp*100).toFixed(2)}<em>%</em>`:'—';
  $('metric-rtp').innerHTML=r.wagers>0?`${(r.totalRtp*100).toFixed(2)}<em>%</em>`:'—';
  $('metric-wager').textContent=money(r.wagers);$('metric-return').textContent=money(r.totalReturns);$('metric-jackpot').textContent=money(r.jackpotAwards);
  $('metric-base-ci').textContent=`底池 RTP 95% 信賴區間 ${ci(r,'baseCi95')}`;
  $('metric-ci').textContent=`總 RTP 95% 信賴區間 ${ci(r)}・${policyNames[r.policy]}`;
  const hits=Object.values(r.tierCounts).reduce((sum,count)=>sum+count,0);
  $('metric-jackpot-note').textContent=r.config.jackpotEnabled?`${money(hits)} 手中獎・${frequency(hits,r.hands)}`:'本次模擬已關閉彩金';
  $('flow-cards').innerHTML=[['有效投入',r.wagers],['彩金額外投注',0],['底池返還',r.netReturns],['彩金獎金',r.jackpotAwards],['玩家底池費用',r.playerFees],['總收益（含彩金）',r.totalReturns-r.wagers]].map(([label,n])=>`<div><small>${label}</small><b>${money(n)}</b></div>`).join('');
  $('jackpot-counts').innerHTML=jackpotTiers.map(t=>`<article><span class="jackpot-count-title">${t.label}<small>${t.multiplier} × 大盲</small></span><strong>${money(r.tierCounts[t.key])}<small>手</small></strong><span>獎金 ${money(r.tierCounts[t.key]*quoteJackpot(t.key,r.config.bigBlind).award)}</span><small>占全部手數：${frequency(r.tierCounts[t.key],r.hands)}</small></article>`).join('');
  $('jackpot-sample-note').textContent=!r.config.jackpotEnabled?'彩金已關閉，總返還等於底池返還。':hits===0?'本次模擬沒有彩金中獎。零次中獎不代表機率為零；本次總 RTP 估計與區間可能尚未涵蓋稀有獎項的完整影響。':'總返還與總 RTP 已包含彩金，但稀有獎項仍可能取樣不足。此 95% 信賴區間是模擬估計，不代表整體 RTP 96% 的校準或認證。';
  const stats=[['完成手數',money(r.hands),r.mode==='independent'?'每手重設資產':'同桌連續，玩家餘額保留'],['彩金',r.config.jackpotEnabled?'開啟':'關閉',r.outcomeModel==='prebuilt-pools'?'特殊池資格且玩家正常獲勝攤牌，僅取最高獎級':'歷史模式依玩家攤牌最佳五張判定'],['玩家贏得底池',`${money(r.wins)} / ${ratio(r.wins,r.hands)}`,'包含對手棄牌，與彩金中獎分開計算'],['玩家輸掉底池',`${money(r.losses)} / ${ratio(r.losses,r.hands)}`,r.outcomeModel==='prebuilt-pools'?'輸掉底池不派特殊池 JP':'歷史模式輸掉底池仍可能符合彩金條件'],['平分底池',`${money(r.ties)} / ${ratio(r.ties,r.hands)}`,r.outcomeModel==='prebuilt-pools'?'目標模式沒有平手結算':'依最佳五張牌型平分；彩金另行判定'],['玩家棄牌',money(r.folds),'放棄底池，不觸發彩金'],['對手棄牌',money(r.npcFolds),'未攤牌，不觸發彩金'],['攤牌手數',money(r.showdowns),'河牌下注結束或雙方全下匹配並發完公牌後檢查彩金'],['彩金中獎手數',`${money(hits)} / ${frequency(hits,r.hands)}`,'分母為全部模擬手數，並非僅攤牌手數'],['彩金額外投注','0','本版不另收彩金投注'],['彩金獎金總額',money(r.jackpotAwards),r.outcomeModel==='prebuilt-pools'?'特殊池支出，不從 POT 扣除；已計入總返還':'由外部提供，不從底池或底池費用扣除'],['彩金對 RTP 的貢獻',ratio(r.jackpotAwards,r.wagers),'彩金獎金 ÷ 有效投入'],['底池收益',money(r.netReturns-r.wagers),'底池返還 − 有效投入'],['總收益',money(r.totalReturns-r.wagers),'底池返還＋彩金獎金 − 有效投入'],['平均動作次數',r.hands?(r.totalActions/r.hands).toFixed(2):'—','每手雙方動作合計，不含盲注'],['未跟注退款',money(r.refunds),'玩家退款；不計入 RTP 分子與分母'],['費用前底池 RTP',pct(r.grossRtp),'費用前底池返還 ÷ 有效投入，不含彩金'],['底池費用總額',money(r.fees),'包含雙方'],['底池 RTP 標準誤',r.baseStandardError===null?'—':`${(r.baseStandardError*100).toFixed(3)} 個百分點`,'以底池返還計算的比率估計量'],['總 RTP 標準誤',r.standardError===null?'—':`${(r.standardError*100).toFixed(3)} 個百分點`,`估計單位：${r.methodMeta.ciUnit==='player'?'玩家':'牌局'}；不是勝率的誤差`]];
  $('stats-table').innerHTML=stats.map(row=>`<tr>${row.map(v=>`<td>${v}</td>`).join('')}</tr>`).join('');
  $('conservation').textContent=`最大資金守恆誤差 ${r.conservationError.toExponential(2)}・每手：結束資產＋費用＝起始資產＋外部彩金獎金。`;
  $('comparison-table').innerHTML=reports.map(x=>`<tr><td>${policyNames[x.policy]}</td><td>${money(x.hands)}</td><td>${pct(x.baseRtp)}</td><td class="total-rtp-value">${pct(x.totalRtp)}</td><td>${ci(x)}</td><td>${money(x.jackpotAwards)}</td><td>${money(x.totalReturns-x.wagers)}</td></tr>`).join('');
  let wager=0,total=0;$('batch-table').innerHTML=r.batches.map((b,i)=>{wager+=b.wagers;total+=b.totalReturns;return `<tr><td>${i+1}</td><td>${b.hands}</td><td>${money(b.wagers)}</td><td>${money(b.netReturns)}</td><td>${money(b.jackpotAwards)}</td><td>${money(b.totalReturns)}</td><td>${ratio(b.netReturns,b.wagers)}</td><td>${ratio(b.totalReturns,b.wagers)}</td><td>${ratio(total,wager)}</td></tr>`;}).join('');
}
$('result-select').onchange=()=>{selectedIndex=Number($('result-select').value);renderResults();};
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-tab]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});const panel=$(b.dataset.tab+'-tab');panel.hidden=false;panel.scrollIntoView({behavior:'smooth',block:'start'});});
const bundle=()=>({version:7,model:'mp-study-v3+four-boss-fixed-street-v2+pool-study-v1',outcomeModels:[...new Set(reports.map(report=>report.outcomeModel))],run:runSnapshot,reports,treeStudy});
$('export-results').onclick=()=>download('magic-poker-lite-results.json',bundle());
$('copy-results').onclick=async()=>{try{await navigator.clipboard.writeText(JSON.stringify(bundle(),null,2));toast('已複製完整設定與統計資料。');}catch{toast('無法使用剪貼簿，請改用 JSON 匯出。');}};
$('export-csv').onclick=()=>{const lines=['ruleSet,outcomeModel,bossProfileVersion,paidActionBudgetUsed,paidActionAdded,specialAdded,specialAward,bossMode,bossProfile,callerHands,maniacHands,sniperHands,trapperHands,mode,players,ciUnit,blindMode,netWinningHands,showdownWins,smallBlind,bigBlind,policy,hands,seed,jackpotEnabled,baseSettlementCoefficient,baseRtp,totalRtp,baseStandardError,totalStandardError,baseCi95Low,baseCi95High,totalCi95Low,totalCi95High,wagers,jackpotWagers,refunds,grossReturns,netReturns,jackpotAwards,totalReturns,baseProfit,totalProfit,playerFees,systemFees,royalCount,straightFlushCount,quadsCount,wins,losses,ties'];for(const r of reports)lines.push([r.ruleSet,r.outcomeModel,r.bossProfileVersion,r.outcomePoolSummary?.paidActionBudgetUsed??0,r.outcomePoolSummary?.paidActionAdded??0,r.outcomePoolSummary?.specialAdded??0,r.outcomePoolSummary?.specialAward??0,r.config.boss.mode,r.config.boss.profileId,r.byBoss?.caller?.hands??0,r.byBoss?.maniac?.hands??0,r.byBoss?.sniper?.hands??0,r.byBoss?.trapper?.hands??0,r.mode,r.players,r.methodMeta.ciUnit,r.methodMeta.blindMode??'historical',r.netWinningHands,r.showdownWins,r.config.smallBlind,r.config.bigBlind,r.policy,r.hands,r.seed,r.config.jackpotEnabled,r.config.targetRtp,r.baseRtp,r.totalRtp,r.baseStandardError,r.standardError,...r.baseCi95,...r.ci95,r.wagers,0,r.refunds,r.grossReturns,r.netReturns,r.jackpotAwards,r.totalReturns,r.netReturns-r.wagers,r.totalReturns-r.wagers,r.playerFees,r.fees,r.tierCounts.royal,r.tierCounts.straightFlush,r.tierCounts.quads,r.wins,r.losses,r.ties].join(','));download('magic-poker-lite-results.csv','\uFEFF'+lines.join('\r\n'),'text/csv;charset=utf-8');};
async function loadReference(){try{const response=await fetch('output/math-validation.json');if(!response.ok)throw new Error('目前無法取得歷史驗證檔');const data=await response.json();const names={'natural-balanced':'自然發牌・平衡','boosted-balanced':'雙方對稱重抽・平衡'};$('reference-table').innerHTML=data.runs.map(r=>`<tr><td>${names[r.id]||`${r.id.includes('natural')?'自然發牌':'重抽'}・${policyNames[r.policy]}`}</td><td>${money(r.hands)}</td><td>${pct(r.rtp)}</td><td>${ci(r)}</td></tr>`).join('');}catch(e){$('reference-table').innerHTML=`<tr><td colspan="4">${esc(translateError(e))}</td></tr>`;}}
renderBossProbabilityTables();fill(loadConfig());renderResults();
try{if(localStorage.getItem(CONFIG_KEY))$('settings-state').textContent='已載入儲存的設定';}
catch{$('settings-state').textContent='瀏覽器無法存取儲存空間・已載入預設值';}
loadReference();

$('header-run').onclick=()=>$('run').click();
$('header-stop').onclick=()=>$('stop').click();
$('header-tree').onclick=()=>$('build-tree').click();
$('copy-config').onclick=async()=>{try{await navigator.clipboard.writeText(JSON.stringify({version:4,config:readConfig(),simulation:simSettings()},null,2));toast('已複製完整參數。');}catch(e){showError(e);}};
$('build-tree').onclick=()=>runTreeTask('tree');
$('run-tree-study').onclick=()=>runTreeTask('treeStudy');
$('export-tree').onclick=()=>download('magic-poker-complete-action-tree.json',actionTree);
$('export-tree-study').onclick=()=>download('magic-poker-tree-study.json',treeStudy);
function runTreeTask(task){
 if(worker)return;
 const status=$(task==='tree'?'tree-run-state':'tree-study-state');
 try{
  const config=readConfig(),seed=Number($('seed').value);
  if(!$('seed').checkValidity())throw new Error('請輸入有效種子。');
  if(task==='treeStudy'&&!$('tree-deals').checkValidity())throw new Error('牌序樣本數須為 2 至 10,000。');
  const options=task==='tree'?{seed,policy:$('tree-policy').value,firstSmallBlind:$('tree-first').value}:{seed,policy:$('tree-study-policy').value,deals:Number($('tree-deals').value)};
  activeTask=task;setRunning(true);$('error').textContent='';status.textContent=task==='tree'?'正在建立每一條合法分支…':'正在逐副牌建立完整樹…';
  worker=new Worker(new URL('./simulation-worker.mjs?v=46',import.meta.url),{type:'module'});
  const finishTree=()=>{worker?.terminate();worker=null;setRunning(false);};
  worker.onmessage=({data:m})=>{
   if(m.type==='treeProgress'){status.textContent=`已完成 ${money(m.completed)} / ${money(m.total)} 副完整樹`;return;}
   if(m.type==='error'){finishTree();status.textContent='執行失敗，未發布未完成結果。';showError(m.message);return;}
   if(m.type==='treeResult'){
    actionTree=m.tree;renderActionTree(actionTree);$('export-tree').disabled=false;status.textContent=`完整樹已建立：${money(actionTree.summary.nodes)} 節點／${money(actionTree.summary.terminalNodes)} 終端`;
    $('tree-context').textContent=`種子 ${seed}・${policyNames[options.policy]}・${options.firstSmallBlind==='player'?'玩家':'BOSS'}先手。${actionTree.meta.description} 目標、暗牌與未來公牌只供離線分析。${actionTree.meta.poolSampling}`;
    $('tree-detail').classList.remove('empty-results');finishTree();$('tree-report').scrollIntoView({behavior:'smooth'});
   }else if(m.type==='treeStudyResult'){
    treeStudy=m.report;renderTreeStudy();$('export-tree-study').disabled=false;status.textContent=`已完成 ${money(treeStudy.deals)} 副牌、${money(treeStudy.totalNodes)} 節點`;finishTree();
   }
  };
  worker.onerror=e=>{finishTree();status.textContent='執行失敗';showError(e.message||'模擬程序啟動失敗。');};
  worker.postMessage({type:task,config,...options});
 }catch(error){worker?.terminate();worker=null;setRunning(false);showError(error);}
}
function renderTreeStudy(){
 const r=treeStudy,w=r.weighted;
 const metrics=[['玩家贏池率',pct(w.winProbability),'逐葉到達機率加權，再跨牌序平均'],['攤牌條件勝率',w.showdownProbability>0?pct(w.showdownConditionalWinProbability):'—','分母為攤牌機率'],['底池 RTP',pct(r.baseRtp),'加權底池返還 ÷ 加權有效投入'],['總 RTP',pct(r.totalRtp),'含 JP，退款另列'],['每手條件淨利',money(w.profit),'加權總返還 − 加權有效投入'],['牌序樣本',money(r.deals),'信賴區間單位為牌序，不是葉子']];
 const rows=[['贏池率 95% 信賴區間',ci(r,'winCi95')],['底池 RTP 95% 信賴區間',ci(r,'baseCi95')],['總 RTP 95% 信賴區間',ci(r,'totalCi95')],['每手平均原始實扣投入',money(w.totalContribution)],['原始實扣投入 95% 區間（籌碼）',r.contributionCi95?.every(Number.isFinite)?r.contributionCi95.map(value=>money(value)).join('–'):'—'],['每手平均有效投入',money(w.matchedWager)],['每手平均底池返還',money(w.baseReturn)],['每手平均 JP',money(w.jackpotAward)],['每手平均退款',money(w.refund)],['對手抽樣方式',r.meta.bossSampling],['水池樣本語意',r.meta.poolSampling],['總節點／終端',`${money(r.totalNodes)} / ${money(r.totalTerminals)}`],['零機率合法邊',money(r.zeroProbabilityEdges)],['最大機率質量誤差',r.maxMassError.toExponential(2)],['最大資金守恆誤差',r.maxConservationError.toExponential(2)]];
 if(r.outcomePoolSummary)for(const [label,key]of [['付費池使用','paidActionBudgetUsed'],['付費池增加','paidActionAdded'],['特殊池增加','specialAdded'],['特殊池支出（已含於 JP）','specialAward']])rows.push([`${label}／每副`,money(r.outcomePoolSummary[key]/r.deals)]);
 $('tree-study-results').innerHTML=poolSummaryTable(r.outcomePoolSummary)+`<p class="hint">種子 ${r.seed}・${policyNames[r.policy]}。每副牌以完整操作樹積分；其他牌序仍是抽樣。單副牌贏葉數不作勝率分母。</p><div class="metrics">${metrics.map(([title,value,note])=>`<article><small>${title}</small><strong>${value}</strong><span>${note}</span></article>`).join('')}</div><div class="table-scroll"><table><thead><tr><th>模型檢查</th><th>數值</th></tr></thead><tbody>${rows.map(row=>`<tr>${row.map(x=>`<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="jackpot-counts">${jackpotTiers.map(t=>`<article><span class="jackpot-count-title">${t.label} · ${t.multiplier}× BET</span><strong>${frequency(r.tierProbabilities[t.key],1)}</strong><small>每副牌 JP 命中機率的加權平均</small></article>`).join('')}</div>`;
}

