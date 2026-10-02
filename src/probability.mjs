import {DEFAULT_CONFIG,normalizeConfig,holeScore} from './engine.mjs';
import {JACKPOT_MULTIPLIERS,quoteJackpot} from './jackpot.mjs';
const jackpotNames={royal:'Royal Flush',straightFlush:'Straight Flush',quads:'Four of a Kind'};
import {CONFIG_KEY,loadConfig,money,pct,esc,cardMarkup,download} from './shared.mjs';
import {GAME_LABELS as LABELS,GAME_STREETS as STREETS,translateError} from './game-text.mjs';
const $=id=>document.getElementById(id),policyNames={balanced:'Balanced',call:'Always call',aggressive:'Aggressive',tight:'Tight'};
let worker=null,reports=[],selectedIndex=0,startedAt=0,toastTimer,runSnapshot=null,runState='Awaiting simulation',settingsDirty=false;
const jackpotTiers=[
  {key:'royal',cards:['As','Ks','Qs','Js','Ts']},
  {key:'straightFlush',cards:['9h','8h','7h','6h','5h']},
  {key:'quads',cards:['Qs','Qh','Qd','Qc','As']}
].map(tier=>({...tier,label:jackpotNames[tier.key],multiplier:JACKPOT_MULTIPLIERS[tier.key]}));
const get=(o,path)=>path.split('.').reduce((v,k)=>v?.[k],o);
function set(o,path,value){const keys=path.split('.');const last=keys.pop();let p=o;for(const k of keys)p=p[k]??={};p[last]=value;}
function toast(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3500);}
function showError(error){$('error').textContent=translateError(error);$('error').focus();}
function settingsChanged(message='Settings changed · Not saved'){
  settingsDirty=Boolean(runSnapshot);$('settings-state').textContent=message;
  if(runSnapshot)$('run-label').textContent='Settings changed · Reports still show the previous run. Rerun to update.';
  refreshDerived();updateReportContext();
}
function updateReportContext(){
  $('report-state').textContent=runState;
  const r=reports[selectedIndex]||reports[0];
  $('report-context-note').textContent=r?`${money(r.hands)} hands · Seed ${r.seed}${settingsDirty?' · Previous settings — rerun to update':''}`:'Run a simulation to inspect its settings and results.';
}
function numberField(path,label,min,max,step='0.01',scale='',help=''){const id=path.replaceAll('.','-');return `<div class="field"><label for="${id}">${label}</label><input id="${id}" data-config="${path}" ${scale?`data-scale="${scale}"`:''} type="number" min="${min}" ${max==null?'':`max="${max}"`} step="${step}">${help?`<small class="field-help">${help}</small>`:''}</div>`;}
$('street-fields').innerHTML=Object.entries(STREETS).map(([key,label])=>numberField(`betSize.${key}`,`${label} increment`,.02,null)).join('');
for(const seat of ['player','npc']){
  $(seat+'-deal').innerHTML=numberField(`deal.${seat}.rerollChance`,'Weak-hand redraw %',0,100,1,100,'0–100% chance to redraw a hand below the threshold.')+numberField(`deal.${seat}.maxRerolls`,'Maximum redraws',0,50,1,'','0–50 attempts per weak starting hand.')+numberField(`deal.${seat}.targetScore`,'Strength threshold',0,1,.01,'','0–1 score. Stop redrawing at or above this score.')+`<div class="field"><label for="${seat}-manual">Fixed hole cards</label><input id="${seat}-manual" data-config="deal.${seat}.manual" type="text" placeholder="Optional: As Ks" spellcheck="false" autocapitalize="off"><small class="field-help">Optional two-card override. Leave empty for a random deal.</small></div><div id="${seat}-preview" class="deal-preview"></div><div class="deal-preset"><button type="button" data-seat="${seat}" data-preset="natural">Natural</button><button type="button" data-seat="${seat}" data-preset="boosted">Default boost</button><button type="button" data-seat="${seat}" data-preset="strong">Strong boost</button></div><p class="hint">Fixed cards skip this seat’s redraws. As = ace of spades, Th = ten of hearts, c = clubs, d = diamonds. No duplicate cards across players.</p>`;
}
$('npc-fields').innerHTML=['fold','call','raise','check','bet'].map(k=>numberField(`npc.${k}`,`${LABELS[k]} base weight`,0,1,.01)).join('')+numberField('npc.strengthInfluence','Strength influence',0,4,.1)+numberField('npc.priceInfluence','Call-cost influence',0,4,.1)+'<p class="hint">Weights are not final probabilities. The engine adjusts them for its own hand strength and call cost, then normalizes legal actions. All-zero weights default to check or call.</p>';
function fill(config){for(const el of document.querySelectorAll('[data-config]')){const value=get(config,el.dataset.config);if(el.type==='checkbox'){el.checked=Boolean(value);continue;}if(el.type==='number')el.required=true;el.value=Array.isArray(value)?value.join(' '):Number(value)*(Number(el.dataset.scale)||1);}refreshDerived();}
function readConfig(){
  const raw={};for(const el of document.querySelectorAll('[data-config]')){if(!el.checkValidity()){el.closest('details').open=true;throw new Error(`${el.closest('.field').querySelector('label').textContent}: enter a value within the allowed range.`);}set(raw,el.dataset.config,el.type==='checkbox'?el.checked:el.type==='text'?el.value.trim():Number(el.value)/(Number(el.dataset.scale)||1));}
  raw.smallBlind=raw.bigBlind/2; // The small blind always follows the selected BET.
  if(raw.minBuyIn<raw.bigBlind)throw new Error('Minimum buy-in cannot be below the big blind.');
  if(raw.maxBuyIn<raw.minBuyIn||raw.buyIn<raw.minBuyIn||raw.buyIn>raw.maxBuyIn)throw new Error('Buy-in must satisfy: minimum ≤ starting ≤ maximum.');
  if(Object.values(raw.betSize).some(v=>v<raw.bigBlind))throw new Error('Each street increment must be at least the big blind.');
  return normalizeConfig(raw);
}
function simSettings(){
  for(const id of ['players','entries','seed'])if(!$(id).checkValidity()||$(id).value==='')throw new Error('Enter valid integers for simulation size and seed.');
  const hands=Number($('players').value)*Number($('entries').value);if(hands<2||hands>1000000)throw new Error('Each policy requires between 2 and 1,000,000 hands.');
  return {hands,seed:Number($('seed').value),policies:$('policy').value==='compare'?Object.keys(policyNames):[$('policy').value],groups:Number($('players').value),entries:Number($('entries').value)};
}
function refreshDerived(){
  const target=Number($('target-rtp').value)||96;$('fee-formula').textContent=`Pot fee ${(100-target).toFixed(1)}% · Base return = gross pot share × ${(target/100).toFixed(3)}. JP is added separately.`;
  const report=reports[selectedIndex]||reports[0];$('metric-target').innerHTML=`${(report?report.config.targetRtp*100:target).toFixed(2)}<em>%</em>`;
  const bigBlind=Number($('big-blind').value),enabled=$('jackpot-enabled').checked;
  $('small-blind').value=Number.isFinite(bigBlind)&&bigBlind>=.02?Math.round((bigBlind/2+Number.EPSILON)*1e6)/1e6:'';
  $('jackpot-tiers').classList.toggle('off',!enabled);
  $('jackpot-tiers').innerHTML=jackpotTiers.map(t=>`<div class="jackpot-tier"><div><b>${t.label}</b><span>${t.multiplier} × big blind</span></div><div><span class="jackpot-example">${t.cards.map(c=>cardMarkup(c)).join('')}</span><strong>${Number.isFinite(bigBlind)&&bigBlind>0?money(quoteJackpot(t.key,bigBlind).award):'—'}</strong></div></div>`).join('');
  $('jackpot-config-state').textContent=enabled?'ON · No extra wager; bonus funded separately':'OFF · Base-pot returns only';
  const n=Number($('players').value)*Number($('entries').value);$('hand-count').textContent=`${money(n)} hands / policy${$('policy').value==='compare'?` · ${money(n*4)} hands total`:''}`;
  for(const seat of ['player','npc']){try{const source={deal:{[seat]:{manual:$(seat+'-manual').value}}};const cards=normalizeConfig(source).deal[seat].manual;$(seat+'-preview').innerHTML=cards.length?cards.map(c=>cardMarkup(c)).join('')+`<span>Fixed hole cards<br>Strength score ${holeScore(cards).toFixed(3)}</span>`:'<div class="card blank">♠</div><div class="card blank">♠</div><span>Random deal<br>No fixed outcome</span>';}catch(e){$(seat+'-preview').innerHTML=`<span style="color:var(--red)">${esc(translateError(e))}</span>`;}}
}
$('config-form').onsubmit=e=>e.preventDefault();$('config-form').addEventListener('input',()=>settingsChanged());
$('policy').addEventListener('change',refreshDerived);
document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>{const {seat,preset}=b.dataset;const p=preset==='natural'?{rerollChance:0,maxRerolls:0,targetScore:.48}:preset==='strong'?{rerollChance:1,maxRerolls:5,targetScore:.65}:DEFAULT_CONFIG.deal[seat];for(const [key,value] of Object.entries(p))if(key!=='manual')document.querySelector(`[data-config="deal.${seat}.${key}"]`).value=value*(key==='rerollChance'?100:1);$(seat+'-manual').value='';settingsChanged();});
$('reset').onclick=()=>{fill(DEFAULT_CONFIG);settingsChanged('Defaults restored · Save to apply');$('error').textContent='';};
$('save').onclick=()=>{try{const config=readConfig();localStorage.setItem(CONFIG_KEY,JSON.stringify(config));$('error').textContent='';$('settings-state').textContent='Settings saved · Rejoin the game to apply';toast('Saved. Leave and rejoin the game to apply. The current hand is unchanged.');}catch(e){showError(e);}};
$('export').onclick=()=>{try{download('magic-poker-lite-config.json',{version:2,config:readConfig(),simulation:simSettings()});}catch(e){showError(e);}};
$('import').onclick=()=>$('import-file').click();
$('import-file').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>1000000)throw new Error('The settings file is too large.');const data=JSON.parse(await file.text());if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('The settings file must contain a JSON object.');const input=data.config||data.run?.config||data;if(!['targetRtp','deal','npc','buyIn','jackpotEnabled'].some(k=>k in input))throw new Error('No game settings found.');const imported=normalizeConfig(input);fill(imported);const settings=data.simulation||data.run?.simulation;if(settings){$('players').value=settings.groups||1;$('entries').value=settings.entries||settings.hands||10000;$('seed').value=settings.seed??20260929;$('policy').value=settings.policies?.length>1?'compare':settings.policies?.[0]||'balanced';}settingsChanged('Settings imported · Not saved');$('error').textContent='';toast('Settings imported, including the Jackpot toggle.');}catch(error){showError(`Import failed: ${translateError(error)}`);}e.target.value='';};
function setRunning(on){
  $('config-form').querySelectorAll('input,select,button').forEach(el=>el.disabled=on);
  for(const id of ['save','reset','import','export'])$(id).disabled=on;
  $('run').disabled=on;$('stop').disabled=!on;$('run').classList.toggle('is-running',on);
  $('run-button-label').textContent=on?'Running · 0%':'Run simulation';
  $('config-form').setAttribute('aria-busy',String(on));
}
function updateProgress(n){$('progress').value=n;$('progress-percent').textContent=`${n.toFixed(1)}%`;$('run').style.setProperty('--run-progress',`${n}%`);if(worker)$('run-button-label').textContent=`Running · ${n.toFixed(1)}%`;}
$('run').onclick=()=>{
  if(worker)return;
  let launching=false;
  try{
    const config=readConfig(),settings=simSettings();reports=[];selectedIndex=0;settingsDirty=false;runState='Simulation running';
    runSnapshot={config,simulation:settings,startedAt:new Date().toISOString()};startedAt=performance.now();$('error').textContent='';updateProgress(0);$('progress-text').textContent='Starting simulation worker…';$('run-label').textContent=`Seed ${settings.seed} · ${money(settings.hands)} hands / policy`;
    launching=true;setRunning(true);renderResults();worker=new Worker(new URL('./simulation-worker.mjs',import.meta.url),{type:'module'});
    worker.onmessage=event=>{const m=event.data;if(m.type==='progress'){updateProgress(m.completed/m.total*100);$('progress-text').textContent=`${policyNames[m.policy]} · ${money(m.completed)} / ${money(m.total)} hands overall`;}else if(m.type==='partial'){reports.push(m.report);renderResults();}else if(m.type==='result'){reports=m.reports;finish(false);}else if(m.type==='error'){finish(true,m.message);}};
    worker.onerror=e=>finish(true,e.message||'Simulation worker failed.');worker.postMessage({type:'run',config,...settings});
  }catch(e){if(launching)finish(true,e);else showError(e);}
};
$('stop').onclick=()=>{if(!worker)return;worker.terminate();worker=null;setRunning(false);runState='Stopped by user';$('progress-text').textContent=`Stopped · ${reports.length} completed policy results kept; partial policies excluded.`;$('run-label').textContent='Stopped by user';renderResults();};
function finish(failed=false,message=''){worker?.terminate();worker=null;setRunning(false);if(failed){runState='Run failed';showError(message);$('progress-text').textContent='Run failed and stopped.';}else{runState=`Completed · ${reports.length} ${reports.length===1?'policy':'policies'}`;updateProgress(100);$('progress-text').textContent=`Completed ${money(reports.reduce((n,r)=>n+r.hands,0))} hands · ${((performance.now()-startedAt)/1000).toFixed(1)} s`;$('run-label').textContent=`Completed · Seed ${runSnapshot.simulation.seed}`;}renderResults();}
const ci=(r,key='ci95')=>!r[key]?.every(Number.isFinite)?'Insufficient samples':`${pct(r[key][0])}–${pct(r[key][1])}`;
const ratio=(numerator,denominator)=>denominator>0?pct(numerator/denominator):'—';
const frequency=(hits,hands)=>hands>0?(100*hits/hands).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:6})+'%':'—';
function renderResults(){
  const r=reports[selectedIndex]||reports[0];$('empty-results').hidden=!!r;$('result-body').hidden=!r;
  for(const id of ['copy-results','export-results','export-csv'])$(id).disabled=!r;
  $('result-select').disabled=reports.length<2;$('result-select').innerHTML=reports.length?reports.map((x,i)=>`<option value="${i}" ${i===selectedIndex?'selected':''}>${policyNames[x.policy]}</option>`).join(''):'<option>No completed policy</option>';updateReportContext();
  if(!r){$('metric-target').innerHTML=`${((runSnapshot?.config.targetRtp??Number($('target-rtp').value)/100)*100).toFixed(2)}<em>%</em>`;for(const id of ['metric-base-rtp','metric-rtp','metric-wager','metric-jackpot','metric-return'])$(id).textContent='—';$('metric-ci').textContent='95% confidence interval pending';$('metric-base-ci').textContent='Base-pot return only; excludes JP';$('metric-jackpot-note').textContent='Highest tier only · No stacked awards';$('comparison-table').innerHTML='<tr><td colspan="7" class="table-empty">Waiting for a completed policy result.</td></tr>';$('batch-table').innerHTML='<tr><td colspan="9" class="table-empty">No statistics yet.</td></tr>';return;}
  $('metric-target').innerHTML=`${(r.config.targetRtp*100).toFixed(2)}<em>%</em>`;
  $('metric-base-rtp').innerHTML=`${(r.baseRtp*100).toFixed(2)}<em>%</em>`;
  $('metric-rtp').innerHTML=`${(r.totalRtp*100).toFixed(2)}<em>%</em>`;
  $('metric-wager').textContent=money(r.wagers);$('metric-return').textContent=money(r.totalReturns);$('metric-jackpot').textContent=money(r.jackpotAwards);
  $('metric-base-ci').textContent=`Base 95% CI ${ci(r,'baseCi95')}`;
  $('metric-ci').textContent=`Total RTP 95% CI ${ci(r)} · ${policyNames[r.policy]}`;
  const hits=Object.values(r.tierCounts).reduce((sum,count)=>sum+count,0);
  $('metric-jackpot-note').textContent=r.config.jackpotEnabled?`${money(hits)} hands hit · ${frequency(hits,r.hands)}`:'JP disabled for this run';
  $('flow-cards').innerHTML=[['Matched pot wagers',r.wagers],['Extra JP wagers',0],['Base-pot return',r.netReturns],['JP awards',r.jackpotAwards],['Player pot fees',r.playerFees],['Total profit (incl. JP)',r.totalReturns-r.wagers]].map(([label,n])=>`<div><small>${label}</small><b>${money(n)}</b></div>`).join('');
  $('jackpot-counts').innerHTML=jackpotTiers.map(t=>`<article><span class="jackpot-count-title">${t.label}<small>${t.multiplier} × big blind</small></span><strong>${money(r.tierCounts[t.key])}<small>hands</small></strong><span>Awards ${money(r.tierCounts[t.key]*quoteJackpot(t.key,r.config.bigBlind).award)}</span><small>Share of all hands: ${frequency(r.tierCounts[t.key],r.hands)}</small></article>`).join('');
  $('jackpot-sample-note').textContent=!r.config.jackpotEnabled?'Jackpot is off. Total return equals base-pot return.':hits===0?'No Jackpot hit in this run. Zero hits do not mean zero probability. This total RTP estimate and interval may not capture the full effect of rare awards.':'JP is included in total return and total RTP. Rare prizes may still be undersampled. This 95% interval is a simulation estimate, not calibration or certification of an overall 96% RTP.';
  const stats=[['Completed hands',money(r.hands),'Independent hands with identical starting stacks'],['Jackpot',r.config.jackpotEnabled?'ON':'OFF','Based on the player’s best five at showdown; highest tier only'],['Player pot wins',`${money(r.wins)} / ${pct(r.wins/r.hands)}`,'Includes opponent folds; independent of Jackpot hits'],['Player pot losses',`${money(r.losses)} / ${pct(r.losses/r.hands)}`,'A lost pot can still qualify for a Jackpot award'],['Tied pots',`${money(r.ties)} / ${pct(r.ties/r.hands)}`,'Split by best-five rank; JP is independent of the pot result'],['Player folds',money(r.folds),'Pot forfeited; no Jackpot triggered'],['Opponent folds',money(r.npcFolds),'No showdown, so no Jackpot triggered'],['Showdown hands',money(r.showdowns),'JP checked after river betting or a matched all-in runout'],['Jackpot hit hands',`${money(hits)} / ${frequency(hits,r.hands)}`,'Denominator is all simulated hands, not only showdowns'],['Extra JP wagers','0','No extra Jackpot wager in this version'],['Total JP awards',money(r.jackpotAwards),'Externally funded; no deduction from the pot or pot fee'],['JP contribution to RTP',ratio(r.jackpotAwards,r.wagers),'JP awards ÷ matched pot wagers'],['Base-pot profit',money(r.netReturns-r.wagers),'Base-pot return − matched pot wagers'],['Total profit',money(r.totalReturns-r.wagers),'Base-pot return + JP awards − matched pot wagers'],['Average actions',(r.totalActions/r.hands).toFixed(2),'Both players per hand; blinds excluded'],['Uncalled refunds',money(r.refunds),'Player refunds; excluded from both RTP numerator and denominator'],['Gross base RTP',pct(r.grossRtp),'Gross base-pot return ÷ matched wagers; excludes JP'],['Total pot fees',money(r.fees),'Includes both players'],['Base RTP standard error',r.baseStandardError===null?'—':`${(r.baseStandardError*100).toFixed(3)} percentage points`,'Ratio estimator using base-pot returns'],['Total RTP standard error',r.standardError===null?'—':`${(r.standardError*100).toFixed(3)} percentage points`,'Uses each hand’s base return plus JP; not a win-rate error']];
  $('stats-table').innerHTML=stats.map(row=>`<tr>${row.map(v=>`<td>${v}</td>`).join('')}</tr>`).join('');
  $('conservation').textContent=`Maximum conservation error ${r.conservationError.toExponential(2)} · Per hand: final stacks + fees = starting stacks + external JP awards.`;
  $('comparison-table').innerHTML=reports.map(x=>`<tr><td>${policyNames[x.policy]}</td><td>${money(x.hands)}</td><td>${pct(x.baseRtp)}</td><td class="total-rtp-value">${pct(x.totalRtp)}</td><td>${ci(x)}</td><td>${money(x.jackpotAwards)}</td><td>${money(x.totalReturns-x.wagers)}</td></tr>`).join('');
  let wager=0,total=0;$('batch-table').innerHTML=r.batches.map((b,i)=>{wager+=b.wagers;total+=b.totalReturns;return `<tr><td>${i+1}</td><td>${b.hands}</td><td>${money(b.wagers)}</td><td>${money(b.netReturns)}</td><td>${money(b.jackpotAwards)}</td><td>${money(b.totalReturns)}</td><td>${ratio(b.netReturns,b.wagers)}</td><td>${ratio(b.totalReturns,b.wagers)}</td><td>${ratio(total,wager)}</td></tr>`;}).join('');
}
$('result-select').onchange=()=>{selectedIndex=Number($('result-select').value);renderResults();};
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-tab]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});document.querySelectorAll('.tab-panel').forEach(x=>x.hidden=x.id!==b.dataset.tab+'-tab');});
const bundle=()=>({version:4,model:'heads-up-two-blinds+base-pot+showdown-jackpot',run:runSnapshot,reports});
$('export-results').onclick=()=>download('magic-poker-lite-results.json',bundle());
$('copy-results').onclick=async()=>{try{await navigator.clipboard.writeText(JSON.stringify(bundle(),null,2));toast('Full settings and statistics copied.');}catch{toast('Clipboard unavailable. Use JSON export.');}};
$('export-csv').onclick=()=>{const lines=['ruleSet,smallBlind,bigBlind,policy,hands,seed,jackpotEnabled,baseSettlementCoefficient,baseRtp,totalRtp,baseStandardError,totalStandardError,baseCi95Low,baseCi95High,totalCi95Low,totalCi95High,wagers,jackpotWagers,refunds,grossReturns,netReturns,jackpotAwards,totalReturns,baseProfit,totalProfit,playerFees,systemFees,royalCount,straightFlushCount,quadsCount,wins,losses,ties'];for(const r of reports)lines.push([r.ruleSet,r.config.smallBlind,r.config.bigBlind,r.policy,r.hands,r.seed,r.config.jackpotEnabled,r.config.targetRtp,r.baseRtp,r.totalRtp,r.baseStandardError,r.standardError,...r.baseCi95,...r.ci95,r.wagers,0,r.refunds,r.grossReturns,r.netReturns,r.jackpotAwards,r.totalReturns,r.netReturns-r.wagers,r.totalReturns-r.wagers,r.playerFees,r.fees,r.tierCounts.royal,r.tierCounts.straightFlush,r.tierCounts.quads,r.wins,r.losses,r.ties].join(','));download('magic-poker-lite-results.csv','\uFEFF'+lines.join('\r\n'),'text/csv;charset=utf-8');};
async function loadReference(){try{const response=await fetch('output/math-validation.json');if(!response.ok)throw new Error('No validation file available');const data=await response.json();const names={'natural-balanced':'Natural · Balanced','boosted-balanced':'Symmetric redraw · Balanced'};$('reference-table').innerHTML=data.runs.map(r=>`<tr><td>${names[r.id]||`${r.id.includes('natural')?'Natural':'Redraw'} · ${policyNames[r.policy]}`}</td><td>${money(r.hands)}</td><td>${pct(r.rtp)}</td><td>${ci(r)}</td></tr>`).join('');}catch(e){$('reference-table').innerHTML=`<tr><td colspan="4">${esc(translateError(e))}</td></tr>`;}}
fill(loadConfig());renderResults();
try{if(localStorage.getItem(CONFIG_KEY))$('settings-state').textContent='Saved settings loaded';}
catch{$('settings-state').textContent='Browser storage unavailable · Defaults loaded';}
loadReference();

