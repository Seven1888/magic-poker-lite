import {renderBossProbabilityTables,renderBossStudy} from './boss-probability-view.mjs?v=59';
import {DEFAULT_CONFIG,normalizeConfig,holeScore} from './engine.mjs?v=59';
import {CONFIG_KEY,loadConfig,money,pct,esc,cardMarkup,download} from './shared.mjs?v=59';
import {LAB_LABELS as LABELS,LAB_STREETS as STREETS,LAB_POLICIES as policyNames,translateLabError as translateError} from './probability-text.mjs?v=59';
import {renderStudyDetails} from './probability-report-view.mjs?v=59';
import {refundReportMarkup} from './refund-report-view.mjs?v=59';
import {currentLabConfig} from './probability-config.mjs?v=59';
const $=id=>document.getElementById(id);
let worker=null,reports=[],selectedIndex=0,startedAt=0,toastTimer,runSnapshot=null,runState='等待模擬',settingsDirty=false;
let formConfig=structuredClone(DEFAULT_CONFIG);
let refundReports=[],refundSnapshot=null,refundStartedAt=0;
const REFUND_SETTINGS_KEY='magic-poker-lite.refund-settings.v1';
const refundDefaults={players:100,initialAsset:10000,targetAsset:20000};
const refundFields={players:'refund-players',initialAsset:'refund-initial-asset',targetAsset:'refund-target-asset'};
function refundParams(value={}){
  const result={...refundDefaults,...value};
  if(!Number.isSafeInteger(result.players)||result.players<1||result.players>1000)throw new Error('退幣率玩家數須為 1 至 1,000。');
  for(const key of ['initialAsset','targetAsset'])if(!Number.isFinite(result[key])||result[key]<0||result[key]>Number.MAX_SAFE_INTEGER/1e6)throw new Error('退幣資產須為有效的非負金額。');
  return Object.fromEntries(Object.keys(refundFields).map(key=>[key,result[key]]));
}
function fillRefund(value=refundDefaults){const settings=refundParams(value);for(const [key,id]of Object.entries(refundFields))$(id).value=settings[key];}
function readRefundControls(){
  for(const id of Object.values(refundFields))if(!$(id).checkValidity()||$(id).value===''){$('refund-config').closest('details').open=true;throw new Error('請填入有效的退幣率玩家數與資產。');}
  return refundParams(Object.fromEntries(Object.entries(refundFields).map(([key,id])=>[key,Number($(id).value)])));
}
function refundSettings(settings){
  return {...readRefundControls(),seed:settings.seed,policies:settings.policies};
}
function readSeed(randomize=false){
  if(!$('seed').checkValidity())throw new Error('請填入有效的固定亂數種子，或留空使用隨機種子。');
  if($('seed').value==='')return randomize?crypto.getRandomValues(new Uint32Array(1))[0]:null;
  return Number($('seed').value);
}
const get=(o,path)=>path.split('.').reduce((v,k)=>v?.[k],o);
function set(o,path,value){const keys=path.split('.');let p=o;for(let i=0;i<keys.length-1;i++)p=p[keys[i]]??=(/^\d+$/.test(keys[i+1])?[]:{});p[keys.at(-1)]=value;}
function toast(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3500);}
function showError(error){$('error').textContent=translateError(error);$('error').focus();}
function settingsChanged(message='設定已變更・尚未儲存'){
  settingsDirty=Boolean(runSnapshot);$('settings-state').textContent=message;
  if(runSnapshot)$('run-label').textContent='設定已變更・報表仍顯示上次結果，請重新執行以更新。';
  if(refundReports.length)$('refund-state').textContent='設定已變更・顯示上次退幣結果';
  refreshDerived();updateReportContext();
}
function updateReportContext(){
  $('report-state').textContent=runState;
  const r=reports[selectedIndex]||reports[0];
  $('report-context-note').textContent=r?`${money(r.hands)} 手・種子 ${r.seed}${settingsDirty?'・仍為先前設定，請重新執行以更新':''}`:'執行模擬後，即可查看本次設定與結果。';
}
function numberField(path,label,min,max,step='0.01',scale='',help=''){const id=path.replaceAll('.','-');return `<div class="field"><label for="${id}">${label}</label><input id="${id}" data-config="${path}" ${scale?`data-scale="${scale}"`:''} type="number" min="${min}" ${max==null?'':`max="${max}"`} step="${step}">${help?`<small class="field-help">${help}</small>`:''}</div>`;}
$('street-fields').innerHTML=Object.entries(STREETS).map(([key,label])=>numberField(`betSize.${key}`,`${label}下注增額`,.02,null)).join('');
const settingGroup=(title,fields)=>`<section class="setting-group"><h3>${title}</h3><div class="setting-rows">${fields}</div></section>`;
const poolBuckets=['第一桶 · 0 < 大盲 ≤ 10','第二桶 · 10 < 大盲 ≤ 500','第三桶 · 大盲 > 500'];
$('outcome-fields').innerHTML='<div class="setting-column">'+settingGroup('勝率與預算規則',
 numberField('outcome.conversionRate','結果計分係數 %',0,100,.1,100)
 +numberField('outcome.paidActionCooldownMin','付費池 CD 最小值',0,null,1)
 +numberField('outcome.paidActionCooldownMax','付費池 CD 最大值',0,null,1))
 +settingGroup('正式初始值','<div class="field"><label>個人付費池</label><strong>三個大盲分桶皆為 0</strong></div><div class="field"><label>付費池 CD</label><strong>0</strong></div>')+'</div><div class="setting-column">'
 +settingGroup('模擬起始個人付費池',poolBuckets.map((label,index)=>numberField('outcome.initialPaidActionPools.'+index,label,0,null,.000001)).join('')
 +numberField('outcome.initialPaidActionCooldown','模擬起始 CD',0,null,1))+'</div>'
 +'<details class="control-notes grid-span-2"><summary>水池運行規則</summary><p>開局勝率＝匹配盲注 × RTP ÷ 匹配底池。付費前已贏就繼承；付費前輸，轉贏勝率＝（實付 × RTP＋可用付費池）÷ 本次付費後可匹配底池，最多補到 100%。</p><p>只有玩家實際走到的贏節點付費才入池；有效匹配付費 × RTP 全數進同級付費池，未跟注退款不入池。三桶付費池跨手、跨桌保存，CD 跨大盲分桶。底池全額派彩，不另打折。</p></details>';
for(const seat of ['player','npc']){
 $(seat+'-deal').innerHTML='<div class="field"><label for="'+seat+'-manual">指定起手牌</label><input id="'+seat+'-manual" data-config="deal.'+seat+'.manual" type="text" placeholder="空白＝自動建牌，例如 As Ks" spellcheck="false" autocapitalize="off"></div><div id="'+seat+'-preview" class="deal-preview"></div>';
}
$('npc-fields').innerHTML=['fold','call','raise','check','bet'].map(k=>numberField(`npc.${k}`,`${LABELS[k]}基礎權重`,0,1,.01)).join('')+numberField('npc.strengthInfluence','牌力影響係數',0,4,.1)+numberField('npc.priceInfluence','跟注成本影響係數',0,4,.1);
function fill(config){formConfig=currentLabConfig(config);config=formConfig;for(const el of document.querySelectorAll('[data-config]')){const value=get(config,el.dataset.config);if(el.type==='checkbox'){el.checked=Boolean(value);continue;}if(el.type==='number')el.required=true;el.value=Array.isArray(value)?value.join(' '):el.type==='number'?Number(value??(el.dataset.config.endsWith('targetScore') ? 0.48 : 0))*(Number(el.dataset.scale)||1):value??'';}refreshDerived();}
function readConfig(){
  const raw=structuredClone(formConfig);for(const el of document.querySelectorAll('[data-config]')){if(el.closest('[hidden]'))continue;if(!el.checkValidity()){el.closest('details').open=true;throw new Error(`${el.closest('.field').querySelector('label').textContent}：請輸入允許範圍內的數值。`);}set(raw,el.dataset.config,el.type==='checkbox'?el.checked:el.type==='number'?Number(el.value)/(Number(el.dataset.scale)||1):el.value.trim());}
  raw.targetRtp=1;raw.outcome.mode=formConfig.outcome.mode;
  if(['fixed-holdem','pooled-holdem'].includes(raw.outcome.mode)){
    raw.bigBlind=raw.smallBlind*2;
    raw.buyIn=raw.minBuyIn=raw.smallBlind*100;
    raw.maxBuyIn=Math.max(raw.buyIn,raw.maxBuyIn);
    return normalizeConfig(raw);
  }
  raw.smallBlind=raw.bigBlind/2;
  if(raw.minBuyIn<raw.bigBlind)throw new Error('每手最低開局資產不得低於大盲。');
  if(raw.maxBuyIn<raw.minBuyIn||raw.buyIn<raw.minBuyIn||raw.buyIn>raw.maxBuyIn)throw new Error('入桌資產須符合：最低資產 ≤ 起始資產 ≤ 最高資產。');
  if(Object.values(raw.betSize).some(v=>v<raw.bigBlind))throw new Error('每街下注增額不得低於大盲。');
  return normalizeConfig(raw);
}
function simSettings(randomize=false){
  for(const id of ['players','entries','slice-size'])if(!$(id).checkValidity()||$(id).value==='')throw new Error('請填入有效的玩家數與手數。');
  const players=Number($('players').value),entries=Number($('entries').value),hands=players*entries;
  if(hands<1||hands>1000000)throw new Error('每種策略的統計手數須介於 1 至 1,000,000 手。');
  return {hands,players,groups:players,entries,mode:'continuous',unlimitedBankroll:true,sliceSize:Number($('slice-size').value),seed:readSeed(randomize),policies:$('policy').value==='compare'?Object.keys(policyNames):[$('policy').value]};
}
function refreshDerived(){
  const fixedHoldem=formConfig.outcome.mode==='fixed-holdem';
  const holdem=['fixed-holdem','pooled-holdem'].includes(formConfig.outcome.mode);
  $('outcome-config').hidden=fixedHoldem;$('legacy-asset-fields').hidden=holdem;$('street-fields').hidden=holdem;
  [...document.querySelectorAll('#config-form > .control-card')].filter(section=>!section.hidden).forEach((section,index)=>section.querySelector('summary > b').textContent=String(index+1).padStart(2,'0'));
  $('big-blind').readOnly=holdem;$('small-blind').readOnly=!holdem;
  document.querySelector('label[for="small-blind"]').textContent=holdem?'小盲（SB）':'小盲（½ BET）';
  document.querySelector('label[for="big-blind"]').textContent=holdem?'大盲（2 倍小盲）':'大盲／BET';
  if(holdem)$('big-blind').value=Number($('small-blind').value)*2;
  const tableBuyIn=Number($('small-blind').value)*100;
  $('entry-config-state').textContent=holdem?`每次入桌帶入 ${money(tableBuyIn)}（100 小盲／50 大盲）。桌籌碼逐手增減，歸零才可重新帶入。一般研究外部錢包無限；退幣以錢包＋桌籌碼判斷達標。`:'一般統計資產無限；退幣初始資產另設。';
  $('betting-config-state').textContent=holdem?'玩家使用 2× POT、4× POT 及 ALL IN；倍數依行動前當前 POT 計算本次支付，再套合法最小額與籌碼上限。BOSS 使用半池、全池及全下，尺寸權重為 50%／35%／15%。可反覆再加注。':'';
  $('game-rules-note').textContent='匹配底池全額派彩，未匹配下注全額退回。水池以大盲分桶；玩家底牌與公牌序固定，付費結果可切換對手未公開底牌。首次入場抽盲，同桌後續交替；每手隨機遇到 BOSS，允許連續遇到同型。';
  const report=reports[selectedIndex]||reports[0];$('metric-conversion').innerHTML=`${(report?report.config.outcome.conversionRate*100:Number($('outcome-conversionRate').value)).toFixed(2)}<em>%</em>`;
  $('metric-conversion').closest('article').hidden=fixedHoldem;
  const bigBlind=Number($('big-blind').value);
  if(!holdem)$('small-blind').value=Number.isFinite(bigBlind)&&bigBlind>=.02?Math.round((bigBlind/2+Number.EPSILON)*1e6)/1e6:'';
  const n=Number($('players').value)*Number($('entries').value);$('hand-count').textContent=`每種策略 ${money(n)} 手${$('policy').value==='compare'?`・合計 ${money(n*4)} 手`:''}・連續遊玩・${holdem?'外部錢包無限，桌籌碼有限':'資產無限'}`;
  for(const seat of ['player','npc']){try{const source={deal:{[seat]:{manual:$(seat+'-manual').value}}};const cards=normalizeConfig(source).deal[seat].manual;$(seat+'-preview').innerHTML=cards.length?cards.map(c=>cardMarkup(c)).join('')+`<span>指定起手牌<br>牌力分數 ${holeScore(cards).toFixed(3)}</span>`:'<div class="card blank">♠</div><div class="card blank">♠</div><span>未手動指定<br>依所選結果模型建立</span>';}catch(e){$(seat+'-preview').innerHTML=`<span style="color:var(--red)">${esc(translateError(e))}</span>`;}}
}
$('config-form').onsubmit=e=>e.preventDefault();$('config-form').addEventListener('input',()=>settingsChanged());
$('policy').addEventListener('change',refreshDerived);
$('reset').onclick=()=>{fill(DEFAULT_CONFIG);fillRefund();settingsChanged('已還原預設值・儲存後套用');$('error').textContent='';};
$('save').onclick=()=>{try{const config=readConfig(),refund=readRefundControls();localStorage.setItem(CONFIG_KEY,JSON.stringify(config));localStorage.setItem(REFUND_SETTINGS_KEY,JSON.stringify(refund));$('error').textContent='';$('settings-state').textContent='設定已儲存・重新入桌後套用';toast('已儲存參數，包含退幣率設定。');}catch(e){showError(e);}};
$('export').onclick=()=>{try{download('magic-poker-lite-config.json',{version:7,config:readConfig(),simulation:simSettings(),refund:readRefundControls()});}catch(e){showError(e);}};
$('import').onclick=()=>$('import-file').click();
$('import-file').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>1000000)throw new Error('設定檔過大，請使用不超過 1 MB 的檔案。');const data=JSON.parse(await file.text());if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('設定檔須包含 JSON 物件。');const input=data.config||data.run?.config||data;if(!['targetRtp','deal','npc','buyIn','jackpotEnabled','outcome'].some(k=>k in input))throw new Error('找不到遊戲設定。');const imported=normalizeConfig(input);fill(imported);if(data.refund||data.run?.refund)fillRefund(data.refund||data.run.refund);const settings=data.simulation||data.run?.simulation;if(!settings){const refund=data.refund||data.run?.refund;if(refund?.seed!==undefined)$('seed').value=refund.seed;if(refund?.policies?.length)$('policy').value=refund.policies.length>1?'compare':refund.policies[0];}if(settings){$('players').value=settings.players||settings.groups||4;$('entries').value=settings.entries||settings.hands||8;$('seed').value=settings.seed??'';$('slice-size').value=settings.sliceSize||250;$('policy').value=settings.policies?.length>1?'compare':settings.policies?.[0]||'balanced';}settingsChanged('設定已匯入・尚未儲存');$('error').textContent='';toast('設定已匯入。');}catch(error){showError(`匯入失敗：${translateError(error)}`);}e.target.value='';};
function setRunning(on){
  $('config-form').querySelectorAll('input,select,button').forEach(el=>el.disabled=on);
  for(const id of ['save','reset','import','export','copy-config'])$(id).disabled=on;
  $('stop').hidden=!on;
  $('run').disabled=on;$('stop').disabled=!on;
  $('run').classList.toggle('is-running',on);
  $('run-button-label').textContent=on?'執行中・0%':'開始統計';
  $('config-form').setAttribute('aria-busy',String(on));
}
function updateProgress(n){$('progress').value=n;$('progress-percent').textContent=`${n.toFixed(1)}%`;$('run').style.setProperty('--run-progress',`${n}%`);if(worker)$('run-button-label').textContent=`執行中・${n.toFixed(1)}%`;}
$('run').onclick=()=>{
  if(worker)return;
  let launching=false;
  try{
    const config=readConfig(),settings=simSettings(true),refund=refundSettings(settings);reports=[];selectedIndex=0;settingsDirty=false;runState='一般統計中';
    runSnapshot={config,simulation:settings,refund,startedAt:new Date().toISOString()};startedAt=performance.now();$('error').textContent='';updateProgress(0);$('progress-text').textContent='正在啟動統計…';$('run-label').textContent=`種子 ${settings.seed}・一般統計＋退幣率`;
    refundReports=[];refundSnapshot={config,refund,startedAt:runSnapshot.startedAt};refundStartedAt=0;
    $('refund-report').hidden=false;$('refund-state').textContent='等待一般統計';$('refund-content').innerHTML='';refundExports(false);refundProgress(0,'一般統計完成後自動計算退幣率。');
    launching=true;setRunning(true);renderResults();worker=new Worker(new URL('./simulation-worker.mjs?v=59',import.meta.url),{type:'module'});
    const runWorker=worker;
    worker.onmessage=event=>{
      if(worker!==runWorker)return;
      const m=event.data;
      if(m.type==='progress'){
        updateProgress((m.policyIndex+Math.min(1,m.completed/m.total))/m.policyCount*50);
        $('progress-text').textContent=`一般統計・${policyNames[m.policy]}・已完成 ${money(m.completed)} / ${money(m.total)} 手`;
      }else if(m.type==='partial'){
        reports.push(m.report);
        if(reports.length===settings.policies.length){
          refundStartedAt=performance.now();runState='退幣統計中';$('refund-state').textContent='退幣統計中';
          updateProgress(50);refundProgress(0,'正在計算退幣率…');$('progress-text').textContent='一般統計已完成・正在計算退幣率…';
        }
        renderResults();
      }
      else if(m.type==='refundProgress'){
        if(!refundStartedAt)refundStartedAt=performance.now();
        const percent=(m.policyIndex+m.completedPlayers/m.totalPlayers)/m.policyCount*100;
        const text=`${policyNames[m.policy]}・已完成 ${money(m.completedPlayers)} / ${money(m.totalPlayers)} 位・累計 ${money(m.completedHands)} 手${m.completedPlayers<m.totalPlayers?`・目前玩家 ${money(m.currentPlayerHands)} 手`:''}`;
        runState='退幣統計中';updateReportContext();$('refund-state').textContent='退幣統計中';
        refundProgress(percent,text);updateProgress(50+percent/2);$('progress-text').textContent=`退幣統計・${text}`;
      }else if(m.type==='result'){reports=m.reports;refundReports=m.refundReports;finish(false);}
      else if(m.type==='error'){finish(true,m.message);}
    };
    worker.onerror=e=>{if(worker===runWorker)finish(true,e.message||'模擬程序啟動失敗。');};worker.postMessage({type:'run',config,...settings,refund});
  }catch(e){if(launching)finish(true,e);else showError(e);}
};
$('stop').onclick=()=>{if(!worker)return;worker.terminate();worker=null;setRunning(false);finishRefund({stopped:true});runState='已手動停止';$('progress-text').textContent=`已停止・保留 ${reports.length} 種已完成的一般策略結果；本輪退幣統計已取消。`;$('run-label').textContent='已手動停止';renderResults();};
function finish(failed=false,message=''){worker?.terminate();worker=null;setRunning(false);if(failed){finishRefund({message});runState='執行失敗';showError(message);$('progress-text').textContent='執行失敗，統計已停止；本輪退幣統計已取消。';}else{finishRefund();runState=`已完成・${reports.length} 種策略`;updateProgress(100);$('progress-text').textContent=`一般統計 ${money(reports.reduce((n,r)=>n+r.hands,0))} 手・退幣統計 ${money(refundReports.reduce((n,r)=>n+r.completedPlayers,0))} 位玩家・${((performance.now()-startedAt)/1000).toFixed(1)} 秒`;$('run-label').textContent=`已完成・種子 ${runSnapshot.simulation.seed}`;}renderResults();}
const ci=(r,key='ci95')=>!r[key]?.every(Number.isFinite)?'樣本不足':`${pct(r[key][0])}–${pct(r[key][1])}`;
const ratio=(numerator,denominator)=>denominator>0?pct(numerator/denominator):'—';
function renderResults(){
  const r=reports[selectedIndex]||reports[0];$('empty-results').hidden=!!r;$('result-body').hidden=!r;
  $('metric-conversion').closest('article').hidden=false;
  renderStudyDetails(r,runSnapshot);renderBossStudy(r);
  for(const id of ['copy-results','export-results','export-csv'])$(id).disabled=!r;
  $('result-select').disabled=reports.length<2;$('result-select').innerHTML=reports.length?reports.map((x,i)=>`<option value="${i}" ${i===selectedIndex?'selected':''}>${policyNames[x.policy]}</option>`).join(''):'<option>尚無已完成策略</option>';updateReportContext();
  if(!r){
    $('metric-conversion').innerHTML=`${((runSnapshot?.config.outcome.conversionRate??Number($('outcome-conversionRate').value)/100)*100).toFixed(2)}<em>%</em>`;
    for(const id of ['metric-rtp','metric-wager','metric-return'])$(id).textContent='—';
    $('metric-ci').textContent='等待計算 95% 信賴區間';
    $('comparison-table').innerHTML='<tr><td colspan="5" class="table-empty">等待策略執行完成。</td></tr>';
    $('batch-table').innerHTML='<tr><td colspan="6" class="table-empty">尚無統計資料。</td></tr>';return;
  }
  $('metric-conversion').innerHTML=`${(r.config.outcome.conversionRate*100).toFixed(2)}<em>%</em>`;
  $('metric-rtp').innerHTML=r.wagers>0?`${(r.totalRtp*100).toFixed(2)}<em>%</em>`:'—';
  $('metric-wager').textContent=money(r.wagers);$('metric-return').textContent=money(r.totalReturns);
  $('metric-ci').textContent=`RTP 95% 信賴區間 ${ci(r)}・${policyNames[r.policy]}`;
  $('flow-cards').innerHTML=[['有效投入',r.wagers],['底池返還',r.netReturns],['總收益',r.totalReturns-r.wagers]].map(([label,n])=>`<div><small>${label}</small><b>${money(n)}</b></div>`).join('');
  const stats=[
    ['完成手數',money(r.hands),'同桌籌碼逐手保留，歸零才重新帶入'],
    ['玩家贏得底池',`${money(r.wins)} / ${ratio(r.wins,r.hands)}`,'包含對手棄牌及攤牌勝出'],
    ['玩家輸掉底池',`${money(r.losses)} / ${ratio(r.losses,r.hands)}`,'包含玩家棄牌及攤牌落敗'],
    ['平分底池',`${money(r.ties)} / ${ratio(r.ties,r.hands)}`,'雙方最佳五張相同，匹配底池平分；nonWin 目標容許平手'],
    ['玩家棄牌',money(r.folds),'放棄底池'],['對手棄牌',money(r.npcFolds),'玩家直接贏得底池'],
    ['攤牌手數',money(r.showdowns),'河牌結束，或全下跟注後補完公共牌'],
    ['總收益',money(r.totalReturns-r.wagers),'實際底池返還 − 有效匹配投入'],
    ['平均動作次數',r.hands?(r.totalActions/r.hands).toFixed(2):'—','雙方全部操作；同街可反覆再加注'],
    ['未匹配下注退款',money(r.refunds),'不列 RTP 分子或分母'],
    ['入桌次數／帶入總額',`${money(r.tableEntries)} / ${money(r.tableBuyIns)}`,'錢包轉為桌籌碼，不計賭注或派彩'],
    ['RTP 標準誤',r.standardError===null?'—':`${(r.standardError*100).toFixed(3)} 個百分點`,`估計單位：${r.methodMeta.ciUnit==='player'?'玩家':'牌局'}；不是勝率的誤差`]
  ];
  $('stats-table').innerHTML=stats.map(row=>`<tr>${row.map(v=>`<td>${v}</td>`).join('')}</tr>`).join('');
  $('conservation').textContent=`最大資金守恆誤差 ${r.conservationError.toExponential(2)}・每手：雙方結束資產＝雙方起始資產。`;
  $('comparison-table').innerHTML=reports.map(x=>`<tr><td>${policyNames[x.policy]}</td><td>${money(x.hands)}</td><td class="total-rtp-value">${pct(x.totalRtp)}</td><td>${ci(x)}</td><td>${money(x.totalReturns-x.wagers)}</td></tr>`).join('');
  let wager=0,total=0;$('batch-table').innerHTML=r.batches.map((b,i)=>{wager+=b.wagers;total+=b.totalReturns;return `<tr><td>${i+1}</td><td>${b.hands}</td><td>${money(b.wagers)}</td><td>${money(b.netReturns)}</td><td>${ratio(b.totalReturns,b.wagers)}</td><td>${ratio(total,wager)}</td></tr>`;}).join('');
}
$('result-select').onchange=()=>{selectedIndex=Number($('result-select').value);renderResults();};
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-tab]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});document.querySelectorAll('.tab-panel').forEach(panel=>panel.hidden=panel.id!==b.dataset.tab+'-tab');});
const bundle=()=>({version:10,model:reports[0]?.modelVersion??DEFAULT_CONFIG.outcome.mode,outcomeModels:[...new Set(reports.map(report=>report.outcomeModel))],run:runSnapshot,reports,refundReports});
$('export-results').onclick=()=>download('magic-poker-lite-results.json',bundle());
$('copy-results').onclick=async()=>{try{await navigator.clipboard.writeText(JSON.stringify(bundle(),null,2));toast('已複製完整設定與統計資料。');}catch{toast('無法使用剪貼簿，請改用 JSON 匯出。');}};
$('export-csv').onclick=()=>{const lines=['ruleSet,outcomeModel,bossProfileVersion,paidActionBudgetUsed,paidActionAdded,bossMode,bossProfile,callerHands,maniacHands,mode,unlimitedBankroll,players,ciUnit,blindMode,netWinningHands,showdownWins,smallBlind,bigBlind,policy,hands,seed,baseSettlementCoefficient,rtp,standardError,ci95Low,ci95High,wagers,refunds,returns,profit,wins,losses,ties,poolBucketPolicy,poolBaseUnit,tableEntries,tableBuyIns'];for(const r of reports)lines.push([r.ruleSet,r.outcomeModel,r.bossProfileVersion,r.outcomePoolSummary?.paidActionBudgetUsed??0,r.outcomePoolSummary?.paidActionAdded??0,r.config.boss.mode,r.config.boss.profileId,r.byBoss?.caller?.hands??0,r.byBoss?.maniac?.hands??0,r.mode,r.unlimitedBankroll??false,r.players,r.methodMeta.ciUnit,r.methodMeta.blindMode??'historical',r.netWinningHands,r.showdownWins,r.config.smallBlind,r.config.bigBlind,r.policy,r.hands,r.seed,r.config.targetRtp,r.totalRtp,r.standardError,...r.ci95,r.wagers,r.refunds,r.totalReturns,r.totalReturns-r.wagers,r.wins,r.losses,r.ties,r.outcomePoolSummary?.bucketPolicy??'',r.outcomePoolSummary?.baseUnit??'',r.tableEntries??0,r.tableBuyIns??0].join(','));download('magic-poker-lite-results.csv','\uFEFF'+lines.join('\r\n'),'text/csv;charset=utf-8');};
renderBossProbabilityTables();fill(loadConfig());renderResults();
try{const saved=localStorage.getItem(REFUND_SETTINGS_KEY);if(saved)fillRefund(JSON.parse(saved));}catch{fillRefund();}
try{if(localStorage.getItem(CONFIG_KEY))$('settings-state').textContent='已載入儲存的設定';}
catch{$('settings-state').textContent='瀏覽器無法存取儲存空間・已載入預設值';}


$('copy-config').onclick=async()=>{try{await navigator.clipboard.writeText(JSON.stringify({version:7,config:readConfig(),simulation:simSettings(),refund:readRefundControls()},null,2));toast('已複製完整參數。');}catch(e){showError(e);}};
function refundExports(enabled){for(const id of ['copy-refund','export-refund','export-refund-csv'])$(id).disabled=!enabled;}
function refundProgress(percent,text){
  $('refund-progress').value=percent;$('refund-progress-percent').textContent=`${percent.toFixed(1)}%`;
  $('refund-progress-text').textContent=text;
}
function finishRefund({stopped=false,message=''}={}){
  if(stopped||message){
    refundReports=[];refundExports(false);$('refund-content').innerHTML='';
    $('refund-state').textContent=stopped?'已停止':'執行失敗';
    $('refund-progress-text').textContent=stopped?'本輪已取消，未產生退幣率結果。':'本輪失敗，未產生退幣率結果。';
    return;
  }
  const finishedAt=new Date().toISOString();
  refundReports=refundReports.map(report=>({...report,finishedAt}));
  $('refund-content').innerHTML=refundReportMarkup(refundReports);refundExports(true);
  $('refund-state').textContent='已完成';
  refundProgress(100,`已完成 ${money(refundReports.reduce((sum,r)=>sum+r.completedPlayers,0))} 位玩家・${money(refundReports.reduce((sum,r)=>sum+r.hands,0))} 手・${((performance.now()-refundStartedAt)/1000).toFixed(1)} 秒`);
}
const refundBundle=()=>({version:2,kind:'magic-poker-lite-refund-study',run:refundSnapshot,reports:refundReports});
$('export-refund').onclick=()=>download('magic-poker-lite-refund-results.json',refundBundle());
$('copy-refund').onclick=async()=>{try{await navigator.clipboard.writeText(JSON.stringify(refundBundle(),null,2));toast('已複製退幣率統計。');}catch{toast('無法使用剪貼簿，請改用 JSON 匯出。');}};
$('export-refund-csv').onclick=()=>{
  const headers=['outcomeModel','assetModel','policy','seed','players','initialAsset','targetAsset','tableBuyIn','tableEntries','tableBuyIns','targetPlayers','insufficientPlayers','refundRate','hands','averageHands','minHands','maxHands'];
  const rows=refundReports.map(report=>headers.map(key=>report[key]).join(','));
  download('magic-poker-lite-refund-results.csv','\uFEFF'+[headers.join(','),...rows].join('\r\n'),'text/csv;charset=utf-8');
};

