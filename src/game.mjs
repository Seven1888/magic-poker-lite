import {createSession,startHand,legalActions,applyAction,getActionDistribution,sampleDistribution} from './engine.mjs?v=60';
import {loadConfig,CONFIG_KEY,money,pct,esc,cardMarkup,cardText} from './shared.mjs?v=60';
import {GAME_LABELS as LABELS,GAME_STREETS as STREETS,handName,translateError} from './game-text.mjs?v=60';
import {createPotView} from './pot-view.mjs?v=60';
import {fitStage} from './stage-fit.mjs?v=60';
import {getHudSnapshot} from './hud-state.mjs?v=60';
import {createGameEffects} from './game-effects.mjs?v=60';
import {renderBetPresets,updateBetSelection,setupEntryFeatures} from './entry-view.mjs?v=60';
import {betOptions,tableConfig} from './entry-model.mjs?v=60';
import {handEntryStatus} from './hand-entry.mjs?v=60';
import {loadPlayerProfile,savePlayerProfile} from './outcome-profile.mjs?v=60';
import {createOutcomePools,normalizeOutcomePools} from './outcome-pools.mjs?v=60';
import {createEntryEncounter} from './entry-encounter.mjs?v=60';
import {icon} from './ui-icons.mjs?v=60';
import {getCurrentHandView} from './hand-view.mjs?v=60';
import {decisionMotion} from './decision-motion.mjs?v=60';
import {getShowdownView} from './showdown-view.mjs?v=60';
import {GAME_SPEED,atGameSpeed} from './presentation-timing.mjs?v=60';
import {createBankrollView} from './bankroll-view.mjs?v=60';
import {renderWinRate,equityPercent} from './win-rate-view.mjs?v=60';
import {createHoldemEquityController} from './holdem-equity-controller.mjs?v=60';
import {responseActionLabel,captureResponseSource,responseSourceMatches,isCertainResponse} from './action-response-view.mjs?v=60';
import {boardCardView,nextBoardReveal,tableDeckCounts} from './board-presentation.mjs?v=60';
import {createResponseFlight} from './response-flight-view.mjs?v=60';
import {createActionFlow} from './action-flow-view.mjs?v=60';
import {createBlindDraw} from './blind-draw-view.mjs?v=60';
import {createTotalWin} from './total-win-view.mjs?v=60';
import {createBossActionView} from './boss-action-view.mjs?v=60';
import {renderBossIdentity,preloadBossScenes,waitForBossScene} from './boss-scene-view.mjs?v=60';
import {createEquityMomentum} from './equity-momentum.mjs?v=60';
import {renderCardRow} from './card-row-view.mjs?v=60';
import {getBossProbabilityScenarios} from './boss-profiles.mjs?v=60';
import {bossProbabilityScenariosHtml} from './boss-probability-view.mjs?v=60';
import {buyInFromWallet,cashOutToWallet,snapshotTableSession,closeSavedTable} from './table-wallet.mjs?v=60';
import {playBuyInFlight} from './buyin-flight.mjs?v=60';
import {createActionAnnouncements} from './action-announcement.mjs?v=60';
import {totalBalance} from './balance-display.mjs?v=60';
import {ACTION_ART,chipIcon,actionResponsePreview,actionResponseMarkup,raiseMenuChoices,raiseSizeLabel} from './action-options-view.mjs?v=60';
document.documentElement.style.setProperty('--game-speed',String(GAME_SPEED));
const $=id=>document.getElementById(id);
// Stable player controls; engine actions and opponent response types stay unchanged.
const PLAYER_ACTION_LABELS={fold:'FOLD',check:'CHECK',call:'CALL',bet:'BET',raise:'RAISE'};
let config=loadConfig(),session=null,hand=null,busy=false,drawLog=[],lastResponse=null,handArchive=[],toastTimer,closedTable=null,phase='';
let selectedBet=1,entryBase=config,betValues=[...new Set([1,...betOptions(config)])].sort((a,b)=>a-b),demoAssets=10000;
const savedPlayer=loadPlayerProfile();
let previousBossProfileId=savedPlayer?.lastBossProfileId??savedPlayer?.table?.session?.lastBossProfileId??null,buyInPending=false,buyInDisplay={player:0,npc:0};
let personalPools=savedPlayer?.outcomePools??createOutcomePools({paidAction:config.outcome.initialPaidActionPools,
 special:config.outcome.initialSpecialPools,paidActionCooldown:config.outcome.initialPaidActionCooldown});
if(savedPlayer)demoAssets=savedPlayer.balance;
let restoreError='';
if(savedPlayer?.table)try{
 const closed=closeSavedTable(savedPlayer);
 if(!savePlayerProfile(closed))throw new Error('Could not save table cash-out.');
 demoAssets=closed.balance;personalPools=closed.outcomePools;previousBossProfileId=closed.lastBossProfileId;
 selectedBet=savedPlayer.table.session.config.smallBlind;
}catch(error){restoreError='The saved table could not be closed. Your saved balance and table are unchanged. Reload to try again.';}
let raiseMenuOpen=false;
function saveSettledPlayer(){
 if(restoreError)return;
 if(session){personalPools=normalizeOutcomePools(session.outcomePools);previousBossProfileId=session.lastBossProfileId??previousBossProfileId;}
 const table=session&&['natural-holdem','fixed-holdem','pooled-holdem'].includes(session.config.outcome.mode)?snapshotTableSession(session):null;
 if(!savePlayerProfile({version:2,balance:demoAssets,outcomePools:personalPools,table,lastBossProfileId:previousBossProfileId}))toast('Progress could not be saved on this device.');
}
let entryEncounter=null;
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const potView=createPotView({root:document,reducedMotion:reduceMotion,locale:'en',onPhase:presentTransferPhase,onProgress:presentTransferProgress});
const effects=createGameEffects({root:document,reducedMotion:reduceMotion});
const equityMomentum=createEquityMomentum({root:$('game'),effects,reducedMotion:reduceMotion});
const responseFlight=createResponseFlight({root:document,effects,reducedMotion:reduceMotion});
const actionFlow=createActionFlow({root:document});
const announcements=createActionAnnouncements({root:document,reducedMotion:reduceMotion});
const blindDraw=createBlindDraw({root:document,effects,reducedMotion:reduceMotion,actionFlow});
const totalWin=createTotalWin({root:document,effects,reducedMotion:reduceMotion});
const bossAction=createBossActionView({root:document,reducedMotion:reduceMotion});
const playerEquity=createHoldemEquityController({render:renderPlayerEquity});
preloadBossScenes(document);
const bankrollView=createBankrollView({root:document});
let soundOn=true,musicOn=true;
try{soundOn=localStorage.getItem('magic-poker-lite:sound')!=='off';musicOn=(localStorage.getItem('magic-poker-lite:music')??(soundOn?'on':'off'))!=='off';}catch{}
function updateAudioSettings({save=false}={}){
 announcements.setEnabled(soundOn);effects.setEffectsEnabled(soundOn);effects.setMusicEnabled(musicOn);
 $('sound-toggle').checked=soundOn;$('music-toggle').checked=musicOn;
 const audible=soundOn||musicOn,button=$('audio-button');
 button.dataset.muted=String(!audible);button.setAttribute('aria-label',audible?'Mute all audio':'Enable music and sound');button.title=audible?'Mute all audio':'Enable music and sound';
 button.setAttribute('aria-pressed',String(audible));
 if(save)try{localStorage.setItem('magic-poker-lite:sound',soundOn?'on':'off');localStorage.setItem('magic-poker-lite:music',musicOn?'on':'off');}catch{}
}
function setMusicPhase(phase){effects.setMusicPhase(phase);$('game').dataset.musicPhase=phase;}
updateAudioSettings();setMusicPhase('table');
// Touch release/click are user activations on mobile Safari. Retry after every
// gesture because an app switch or phone call can suspend an unlocked context.
document.addEventListener('pointerup',()=>{if(soundOn)announcements.unlock();if(soundOn||musicOn)effects.unlock();},{passive:true});
document.addEventListener('keydown',e=>{if(soundOn&&!e.repeat)announcements.unlock();if((soundOn||musicOn)&&!e.repeat)effects.unlock();});
document.addEventListener('click',e=>{if(soundOn)announcements.unlock();if((soundOn||musicOn)&&e.target.closest('button:not(:disabled)'))effects.unlock().then(ready=>{if(ready&&soundOn)effects.play('click');});});
document.addEventListener('visibilitychange',()=>{if(document.hidden){effects.suspendAudio();equityMomentum.clear();}});
window.addEventListener('pagehide',()=>effects.suspendAudio());
fitStage({shell:$('game-shell'),stage:$('game')});
let shownHand=null,shownBoard=0,boardDealt=0,shownReveal=0,dealt={player:0,npc:0},settlementReleased=false;
let presentedCredits={player:0,npc:0};
let pendingPlayerAction=null;
let responseSource=null,responseDecision=null,activeNpcDistribution=null;
let showdownViewCache={key:'',value:null};
const delay=(ms,{speed}={})=>new Promise(r=>setTimeout(r,atGameSpeed(ms,speed)));
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),atGameSpeed(3500));}
function show(id){if(!$(id).open)$(id).showModal();}
const hud=()=>getHudSnapshot({session,hand,config,closedTable,busy});
const visibleDeck=()=>tableDeckCounts(hand?{...dealt,board:boardDealt}:{});
const amount=value=>value===null||value===undefined?'—':money(value);
const signed=value=>value===null?'—':`${value>0?'+':''}${money(value)}`;
const bankroll=()=>session?.stacks.player??0;
function renderBankrolls({refreshNpc=false,beforeBlinds=false}={}){
 const pending=hand?.result&&!settlementReleased;
 const values=beforeBlinds&&hand?hand.stacksBefore:pending?Object.fromEntries(['player','npc'].map(seat=>[seat,hand.stacksBefore[seat]-hand.contributions[seat]+presentedCredits[seat]]))
  :{player:bankroll(),npc:session?.stacks.npc??bankroll()};
 const counting=buyInPending||!!pending;
 // A buy-in is a transfer, so its full value stays in the total while the pile grows.
 const visibleTotal=totalBalance(demoAssets,buyInPending?session?.stacks.player:values.player);
 bankrollView.render(buyInPending?buyInDisplay:values,{baseBet:hand?.config.bigBlind??selectedBet*2,refreshNpc,walletBalance:visibleTotal,
  counting,pileTargets:counting?{player:session?.stacks.player??0,npc:session?.stacks.npc??0}:null});
}
function presentTransferProgress(event){
 if(!hand?.result)return;
 presentedCredits={...event.credits};renderBankrolls();
 if(event.flow==='payout'||event.flow==='bonus')totalWin.setAmount(hand.result,event.returns,{complete:event.complete});
}
function presentTransferPhase(event){
 const {flow,seats,amounts}=event;
 if(!hand)return;
 bossAction.onTransfer(event);
 if(flow==='arrival'){effects.play('chip-arrival');return;}
 if(['contribution','refund','payout'].includes(flow))effects.play('chips');
 const who=seats.length===1?(seats[0]==='player'?'YOU':'OPPONENT'):'BOTH PLAYERS';
 const detail=seats.map(seat=>`${seat==='player'?'YOU':'OPPONENT'} +${money(amounts[seat])}`).join(' · ');
 if(flow==='contribution'){
  const event=hand.history.slice().reverse().find(item=>seats.includes(item.actor)&&item.amount>0);
  const isBlind=event?.type==='bigBlind'||event?.type==='smallBlind';
  const action=isBlind?(seats.length>1?'POST BLINDS':LABELS[event.type]):event?.type?responseActionLabel(event.type):'RAISE';
  const label=`${who} ${action}`;
  setTableCue('contribution',label,{seat:seats.length===1?seats[0]:'',detail:'CHIPS TO THE POT'});
 }else if(flow==='refund')setTableCue('refund','UNCALLED CHIPS BACK',{seat:seats.length===1?seats[0]:'',detail});
 else if(flow==='payout'){
  totalWin.start(hand.result,{followProgress:true});
  const label=hand.result.pot<=0?'HAND COMPLETE':hand.result.winner==='tie'?'SPLIT POT':hand.result.winner==='player'?'YOU WIN':'OPPONENT WINS';
  setTableCue('payout',label,{seat:seats.length===1?seats[0]:'',detail:detail||'NO MATCHED POT'});
 }else if(flow==='bonus')setTableCue('bonus','JACKPOT BONUS',{seat:'player',detail});
 else if(flow==='complete'){
  for(const seat of ['player','npc'])presentedCredits[seat]=hand.result[seat].refund+hand.result[seat].totalReturn;
  renderBankrolls();
 }
}
$('blind-dialog').addEventListener('cancel',e=>e.preventDefault());
function decorateMenu(){
 const map={'help-dialog':'rules','menu-ranks':'cards','menu-history':'history','menu-balance':'wallet','result-details':'chip','leave-button':'leave'};
 document.querySelectorAll('.menu-grid>button').forEach(b=>{const key=b.dataset.open||b.id;b.insertAdjacentHTML('afterbegin',icon(map[key]||'cards'));});
 document.querySelector('.sound-setting>span').insertAdjacentHTML('afterbegin',icon('sound'));
 const reset=document.createElement('button');reset.id='reset-demo';reset.className='text-button wide';reset.textContent='↻ Reset demo chips';reset.onclick=()=>{if(busy||session)return;session=null;hand=null;closedTable=null;config=loadConfig();demoAssets=10000;saveSettledPlayer();selectedBet=1;handArchive=[];drawLog=[];lastResponse=null;entryEncounter=null;prepareEntry();$('menu-dialog').close();render();setupBuyin();};
 $('menu-dialog').append(reset);
 const rules=document.querySelector('#help-dialog .rules');
 rules.innerHTML=`<li>Choose your SMALL BLIND. The BIG BLIND is twice that amount. Buy-in is 100 small blinds. FIGHT moves wallet funds to the table without changing TOTAL BALANCE. No top-ups at this table.</li><li>The deck is shuffled once at the start of each hand. Both players' hole cards and the remaining card order stay fixed. Reveal FLOP (3), TURN (1), RIVER (1), with a betting round at each stage.</li><li>CHECK when nothing is owed; CALL to match. BET opens the betting; RAISE increases it. Tap BET or RAISE to choose an amount. Re-raises are allowed while legal.</li><li>The first blind is drawn 50/50, then positions alternate. Small blind acts first preflop; big blind acts first on later streets.</li><li>The opponent uses its own cards, revealed community cards, betting history and the actual price to choose a move. It does not know your cards or unrevealed community cards. Response odds are shown above your actions and beside each bet size.</li><li>A fold ends the hand. Otherwise, the best five of seven wins at showdown. Ties split the matched pot; unmatched chips are returned.</li>`;
 const fees=document.createElement('details');fees.className='rules-details';fees.innerHTML='<summary>Table chips, opponents & payouts ⓘ</summary><p>The opponent starts every hand with the same table chips as you. Each hand independently draws an AGGRESSIVE or PASSIVE opponent with equal chance. The same type may appear again. Your chips keep actual winnings and losses. TOTAL BALANCE includes wallet funds and your remaining table chips. Bets reduce it; refunds and winnings increase it.</p><p>2× POT and 4× POT use the current pot before your action. Amounts show the chips you add now, with no extra call added. The minimum legal raise and your remaining stack apply. Equal amounts are combined.</p><p>Gold edges mark your best five; blue edges show the opponent’s revealed best five. Action odds are not your chance to win the pot.</p><p id="help-fee"></p>';
 rules.after(fees);
 document.querySelector('#help-dialog>p.muted').textContent='A 52-card heads-up poker game. Reloading returns to the buy-in screen and cashes out your remaining table chips. An unfinished hand is folded; an already all-in hand finishes normally. Returns depend on the cards and play; there is no fixed 99% return guarantee.';
 const ledger=$('settlement'),details=document.createElement('details');details.className='result-accounting';details.innerHTML=`<summary>${icon('wallet')}Chip details <span>⌄</span></summary>`;ledger.replaceWith(details);details.append(ledger);
 const overview=document.createElement('div');overview.id='result-overview';overview.className='result-overview';details.before(overview);
}
decorateMenu();
setupEntryFeatures();
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).close()));
const openHelp=()=>{$('help-fee').textContent='The matched pot is paid in full. Uncalled chips are returned in full.';show('help-dialog');};
const openHistory=()=>{renderHistory();show('history-dialog');};
$('menu-button').onclick=()=>show('menu-dialog');
$('sound-toggle').onchange=e=>{soundOn=e.target.checked;updateAudioSettings({save:true});if(soundOn)effects.unlock().then(ready=>{if(ready)effects.play('click');});};
$('music-toggle').onchange=e=>{musicOn=e.target.checked;updateAudioSettings({save:true});if(musicOn)effects.unlock();};
$('audio-button').onclick=()=>{const enable=!(soundOn||musicOn);soundOn=enable;musicOn=enable;updateAudioSettings({save:true});if(enable)effects.unlock().then(ready=>{if(ready)effects.play('click');});};
document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{$('menu-dialog').close();if(b.dataset.open==='help-dialog')openHelp();else show(b.dataset.open);});
$('menu-history').onclick=()=>{$('menu-dialog').close();openHistory();};
$('menu-balance').onclick=()=>{$('menu-dialog').close();$('balance-button').click();};
$('menu-ranks').onclick=()=>{$('menu-dialog').close();openRanks();};
$('table-rank-button').onclick=()=>openRanks();
$('deck-button').onclick=()=>{const deck=visibleDeck();$('deck-remaining-detail').textContent=deck.deckRemaining;$('dealt-count').textContent=`${deck.dealtCards} cards`;show('deck-dialog');};
$('balance-button').onclick=()=>{const h=hud();$('balance-ledger').innerHTML=[['TOTAL BALANCE',totalBalance(demoAssets,bankroll())],['WALLET',demoAssets],['TABLE CHIPS',bankroll()],[session||hand?'TABLE BUY-IN':closedTable?'LAST BUY-IN':'STARTING CHIPS',h.buyIn],['TOTAL BET',h.playerCommitted],['TABLE PROFIT',h.settledTableProfit],['OPPONENT CHIPS',h.npcBalance]].map(([label,value])=>`<div class="info-pair"><span>${label}</span><b>${label==='TABLE PROFIT'?signed(value):amount(value)}</b></div>`).join('');show('balance-dialog');};
const ranks=[['Straight Flush',['As','Ks','Qs','Js','Ts']],['Four of a Kind',['As','Ah','Ad','Ac','Ks']],['Full House',['Ks','Kh','Kd','Qs','Qh']],['Flush',['Ah','Jh','8h','5h','2h']],['Straight',['9s','8h','7d','6c','5s']],['Three of a Kind',['Qs','Qh','Qd','9s','5h']],['Two Pair',['Js','Jh','8s','8d','As']],['Pair',['Ts','Th','As','8d','4c']],['High Card',['As','Jh','9d','6s','3h']]];
const openRanks=()=>{$('rank-list').innerHTML=ranks.map(([name,cards],i)=>`<div class="rank-row"><i>${i+1}</i><b>${name}</b><div class="rank-example">${cards.map(c=>cardMarkup(c)).join('')}</div></div>`).join('');show('ranks-dialog');};
$('result-details').onclick=showResult;
$('pot-info-button').onclick=()=>{
 const r=hand?.result;
 const h=hud();const rows=r?[['Total bet',r.player.totalContribution,r.npc.totalContribution],['Uncalled refund',r.player.refund,r.npc.refund],['Matched wager',r.player.matchedWager,r.npc.matchedWager],['Pot return',r.player.netReturn,r.npc.netReturn]]:[['Bet this hand',h.playerCommitted,h.npcCommitted],['Chips remaining',h.playerBalance,h.npcBalance]];
 $('pot-ledger').innerHTML='<div class="ledger-head"><span>Chip details</span><span>You</span><span>Opponent</span></div>'+rows.map(([label,a,b])=>'<div class="ledger-row"><span>'+label+'</span><span>'+amount(a)+'</span><span>'+amount(b)+'</span></div>').join('')+'<p class="pot-ledger-total">'+(r?'SETTLED POT':'CURRENT POT')+' <b>'+money(r?.pot??hand?.pot??0)+'</b></p>';
 show('pot-dialog');
};
$('leave-button').onclick=()=>{$('menu-dialog').close();leaveTable();};$('result-leave').onclick=()=>{$('result-dialog').close();leaveTable();};
function prepareEntry(){
  if(entryEncounter)return;
  entryBase={...loadConfig(),boss:{mode:'random',profileId:'caller'}};
  entryBase.deal=Object.fromEntries(['player','npc'].map(seat=>[seat,{...entryBase.deal[seat],manual:[],rerollChance:0,maxRerolls:0}]));
  entryEncounter=createEntryEncounter(entryBase,crypto.getRandomValues(new Uint32Array(1))[0],{lastBossProfileId:previousBossProfileId});
}
function setupBuyin(){
  if(session)return;
  prepareEntry();betValues=[...new Set([1,...betOptions(entryBase)])].sort((a,b)=>a-b);if(!betValues.includes(selectedBet))selectedBet=1;
  $('bet-presets').innerHTML=renderBetPresets(betValues);
  $('bet-presets').querySelectorAll('[data-bet]').forEach(b=>b.onclick=()=>{selectedBet=Number(b.dataset.bet);updateEntry();});
  updateEntry();show('buyin-dialog');updateExpression();
}
function updateEntry(){
 const available=demoAssets,minimum=selectedBet*100,index=betValues.indexOf(selectedBet);
 updateBetSelection(selectedBet);$('entry-minimum').textContent=money(minimum);
 $('entry-blinds').textContent=blindAmount(selectedBet*2);
 $('entry-bet').style.fontSize=selectedBet>=1000?'16px':'21px';
 $('entry-blinds').style.fontSize=selectedBet>=500?'19px':'23px';
 $('entry-minimum').style.fontSize=minimum>=100000?'16px':minimum>=10000?'18px':'21px';
 $('bet-minus').disabled=index<=0;$('bet-plus').disabled=index===betValues.length-1;
 $('entry-start').disabled=available<minimum||busy||!!restoreError;$('buyin-error').textContent=restoreError||(available<minimum?'Not enough balance. Choose a lower small blind.':'');
 $('fee-notice').textContent=`Small blind ${money(selectedBet)} · Big blind ${money(selectedBet*2)}. Buy in with ${money(selectedBet*100)} chips (100 small blinds). FIGHT brings this amount to the table. TOTAL BALANCE stays the same until you bet. No top-ups at the table. The first blind position is drawn, then positions alternate each hand. The opponent starts each hand with the same table chips as you. Leaving cashes out your remaining chips.`;
}
$('bet-minus').onclick=()=>{selectedBet=betValues[Math.max(0,betValues.indexOf(selectedBet)-1)];updateEntry();};
$('bet-plus').onclick=()=>{selectedBet=betValues[Math.min(betValues.length-1,betValues.indexOf(selectedBet)+1)];updateEntry();};
$('buyin-form').onsubmit=async e=>{e.preventDefault();if(busy||session||restoreError)return;
  try{
   const transfer=buyInFromWallet(demoAssets,selectedBet);
   const nextConfig=tableConfig(entryBase,selectedBet,demoAssets),seed=entryEncounter.seed;
   const nextSession=createSession(nextConfig,seed,{firstSmallBlind:'random',outcomePools:personalPools,lastBossProfileId:previousBossProfileId});
   if(nextConfig.outcome.mode!=='natural-holdem'||nextSession.stacks.player!==transfer.chips)throw new Error('Table buy-in does not match the selected blinds. No balance was charged.');
   busy=true;config=nextConfig;session=nextSession;demoAssets=transfer.balance;hand=null;handArchive=[];closedTable=null;lastResponse=null;drawLog=[];
   saveSettledPlayer();buyInPending=true;buyInDisplay={player:0,npc:0};$('buyin-dialog').close();render();
   setTableCue('buyin','BUYING IN',{detail:'CHIPS TO THE TABLE'});
   await playBuyInFlight({root:document,reducedMotion:reduceMotion,amounts:{player:transfer.chips,npc:transfer.chips},
    onProgress:event=>{buyInDisplay={...event.values};renderBankrolls();}});
   buyInPending=false;renderBankrolls();busy=false;await newHand();
  }catch(error){buyInPending=false;busy=false;phase='';blindDraw.clear();$('buyin-error').textContent=translateError(error);if(!session)show('buyin-dialog');render();}
};

const blindAmount=value=>Number(value).toLocaleString('en-US',{maximumFractionDigits:6});
async function showTurnDraw(){
 const isSmall=hand.smallBlind==='player';
 await blindDraw.play({isSmall,smallBlind:session.config.smallBlind,bigBlind:session.config.bigBlind});
}
function leaveTable(){
 if(busy||hand?.status==='playing'){toast('Finish this hand first.');return;}
 if(!session)return;
 announcements.cancel({resetKeys:true});
 const chips=session.stacks.player;demoAssets=cashOutToWallet(demoAssets,chips);
 closedTable={playerBalance:chips,npcBalance:session.stacks.npc,buyIn:session.config.buyIn,settledTableProfit:chips-session.config.buyIn,jackpotAwards:session.jackpotAwards};
 personalPools=normalizeOutcomePools(session.outcomePools);session=null;hand=null;lastResponse=null;drawLog=[];entryEncounter=null;raiseMenuOpen=false;saveSettledPlayer();prepareEntry();render();toast(`Cashed out ${money(chips)}. Balance: ${money(demoAssets)}.`);
}
async function newHand(){
  if(busy||!session||hand?.status==='playing')return;
  $('result-dialog').close();
  if(!handEntryStatus(session).canStart){
   toast('No table chips left. Leave this table to buy in again.');
   return;
  }
  try{
   announcements.cancel();busy=true;phase='PREPARING HAND';render();await delay(0);hand=startHand(session);saveSettledPlayer();raiseMenuOpen=false;phase='YOUR BLIND POSITION';
   entryEncounter=null;drawLog=[];lastResponse=null;pendingPlayerAction=null;
   delete $('game').dataset.chosenAction;paintDistribution([]);
   // Show this hand's committed blind before presenting its payments or cards.
   render({beforeBlinds:true});
   if(hand.handNumber===(session.tableStartHandNumber??1)){
    setTableCue('hole-deal','DRAWING YOUR BLIND');await showTurnDraw();
   }else blindDraw.renderSeat({isSmall:hand.smallBlind==='player'});
   phase='DEALING';setTableCue('contribution','POST BLINDS');
   await presentHand();await continuePlay();
  }catch(error){busy=false;phase='';blindDraw.clear();bossAction.clear();setTableCue();toast(translateError(error));render();}
}
$('next-hand').onclick=newHand;
const visibleStreet=()=>shownBoard>=5?'river':shownBoard===4?'turn':shownBoard>0?'flop':'preflop';
function renderPlayerEquity({visible,calculating,result,error}){
 if(shownReveal>0&&hand?.result?.reason==='showdown')return;
 const ring=$('player-win-rate');
 if(!visible||!playerEquityReady()){renderWinRate(ring);equityMomentum.clear();$('equity').textContent='';$('equity').title='';return;}
 if(!result){renderWinRate(ring);equityMomentum.clear();$('equity').textContent=calculating?'Calculating Hold’em equity…':error?'Equity unavailable.':'';$('equity').title='';return;}
 const rate=equityPercent(result.equity),method=result.exact?'Exact enumeration':`${result.outcomes.toLocaleString('en-US')} simulated deals`;
 const description=`${rate} ${result.exact?'':'estimated '}equity against one random hand. Ties count as half a win.`;
 renderWinRate(ring,result.equity,{description,title:`${method}. All unknown cards are equally likely. Ties count as half a win.`});
 ring.dataset.method=result.method;ring.dataset.outcomes=String(result.outcomes);
 $('equity').textContent=`${result.exact?'':'Estimated '}Hold’em equity: ${rate}`;
 $('equity').title=`${method}. Win ${equityPercent(result.winRate)}, tie ${equityPercent(result.tieRate)}, loss ${equityPercent(result.lossRate)}. Equity = wins + half of ties.`;
 equityMomentum.update({key:`board-${shownBoard}`,equity:result.equity});
}
function playerEquityReady(){
 return !!hand&&dealt.player===2&&shownReveal===0&&!settlementReleased
  &&(hand.status==='playing'||hand.result?.reason==='showdown')
  &&[0,3,4,5].includes(shownBoard)
  &&(hand.status==='settled'||shownBoard===hand.board.length);
}
function updatePlayerEquity(){
 if(shownReveal>0&&hand?.result?.reason==='showdown')return;
 const ready=playerEquityReady();
 playerEquity.update({visible:!!ready,playerHole:ready?hand.holes.player.slice(0,dealt.player):[],board:ready?hand.board.slice(0,shownBoard):[]});
}
function setTableCue(mode='',label='',{seat='',detail=''}={}){
  $('game').dataset.presentation=mode;$('game').dataset.activeSeat=seat;const cue=$('table-cue');cue.hidden=!mode;
  actionFlow.render({mode,label,seat,detail,actor:hand?.actor,playing:hand?.status==='playing',settled:hand?.status==='settled'});
  if(!mode||mode==='action')bankrollView.clearChanges();
  cue.innerHTML=mode?`${icon(['payout','contribution','refund','refresh','bonus'].includes(mode)?'chip':'cards')}<span class="cue-copy"><strong>${esc(label)}</strong>${detail?`<small>${esc(detail)}</small>`:''}</span>`:'';
}
function replaceCardFace(element,card,options={}){
  const template=document.createElement('template');template.innerHTML=cardMarkup(card,options);
  const face=template.content.firstElementChild;
  element.className=face.className;element.setAttribute('aria-label',face.getAttribute('aria-label'));
  element.replaceChildren(...face.childNodes);
}
function updateShowdownView(){
  const panel=$('showdown-preview');
  $('game').dataset.revealed=String(shownReveal);
  if(!hand||hand.result?.reason!=='showdown'||shownReveal===0||shownBoard!==5){
    panel.hidden=true;panel.style.backgroundImage='';panel.setAttribute('aria-label','Opponent best five revealed cards');
    $('npc-hand-type').textContent='';$('npc-reveal-count').textContent='';
    document.querySelectorAll('.card.npc-best').forEach(el=>el.classList.remove('npc-best'));showdownViewCache={key:'',value:null};return null;
  }
  const playerHole=hand.holes.player.slice(0,dealt.player),visibleBoard=hand.board.slice(0,shownBoard),revealedNpcHole=hand.holes.npc.slice(0,shownReveal);
  const key=[...playerHole,...visibleBoard,'|',...revealedNpcHole].join('');
  if(showdownViewCache.key!==key){
    const view=getShowdownView({playerHole,visibleBoard,revealedNpcHole});
    showdownViewCache={key,value:view};
    if(!view){panel.hidden=true;return null;}
    $('npc-hand-type').textContent=view.npcHandName;
    panel.style.backgroundImage=`url('assets/legacy/type${view.npcEvaluation.royal?10:view.npcEvaluation.category+1}-base.png')`;
    $('npc-reveal-count').textContent=`${view.revealedCount} / 2 REVEALED`;
    panel.setAttribute('aria-label',`Opponent ${view.npcHandName}. Best five from revealed cards. ${view.revealedCount} of 2 hole cards revealed.`);
  }
  const view=showdownViewCache.value;if(!view){panel.hidden=true;return null;}
  panel.hidden=false;
  document.querySelector('.response-panel').hidden=true;
  for(const [id,cards] of [['npc-cards',revealedNpcHole],['board',visibleBoard]])[...$(id).children].forEach((el,index)=>el.classList.toggle('npc-best',!!cards[index]&&view.npcBest5.includes(cards[index])));
  playerEquity.reset();
  const rate=equityPercent(view.equity);
  renderWinRate($('player-win-rate'),view.equity,{description:`${rate} equity using ${view.revealedCount} revealed opponent cards; ties count as half a win.`,title:view.revealedCount===1?'Equity from the revealed opponent card; the second card is still unknown.':'Both hands revealed: win 100%, tie 50%, loss 0%.'});
  $('player-win-rate').dataset.method='revealed-enumeration';$('player-win-rate').dataset.outcomes=String(view.outcomes);
  $('equity').textContent=`Equity after ${view.revealedCount} revealed opponent cards: ${rate}`;
  $('equity').title=view.revealedCount===1?'Exact enumeration of all 44 possible remaining opponent cards. Hidden cards are not used. Ties count as half a win.':'Both hands are revealed. Win 100%, tie 50%, loss 0%.';
  equityMomentum.update({key:`boss-${view.revealedCount}`,equity:view.equity,final:view.revealedCount===2});
  return view;
}
function updateExpression(winner=''){
  const encounter=entryEncounter||hand;
  const shownWinner=encounter===hand?winner:'';
  $('game').dataset.winner=shownWinner;
  renderBossIdentity(encounter,document);
  // Returning from a cancelled next-hand preview restores this hand's result.
  if(shownWinner&&$('game').dataset.winner!==shownWinner){$('game').dataset.winner=shownWinner;renderBossIdentity(encounter,document);}
  $('game').dataset.bossPreview=String(!!hand&&encounter!==hand);
}
function updateVisibleCards(){
  const holes=hand?.holes.player.slice(0,dealt.player)||[],board=hand?.board.slice(0,shownBoard)||[];
  const view=getCurrentHandView(holes,board),best=view.highlighted;
  for(const [id,cards] of [['player-cards',holes],['board',board]])[...$(id).children].forEach((el,i)=>el.classList.toggle('best',!!cards[i]&&best.includes(cards[i])));
  // A hidden/edge-on hole card is not ready for a visible hand-rank label.
  const ready=!!hand&&dealt.player===2,rankButton=$('table-rank-button');
  $('hand-type').textContent=ready?view.name:'No cards dealt';$('table-hand-type').textContent=ready?view.name:'';
  rankButton.hidden=!ready;
  rankButton.style.backgroundImage=ready?`url('assets/legacy/type${view.royal?10:view.category+1}-base.png')`:'';
  rankButton.setAttribute('aria-label',ready?`Current hand: ${view.name}. View hand rankings.`:'View hand rankings');
  const remaining=visibleDeck().deckRemaining;
  $('deck-count').textContent=remaining;
  $('deck-button').setAttribute('aria-label',`Deck: ${remaining} of 52 cards remaining. View deck details`);
  $('game').dataset.street=hand?visibleStreet():'';
  const current=Object.keys(STREETS).indexOf(visibleStreet());
  document.querySelectorAll('#streets [data-street]').forEach((el,i)=>{el.classList.toggle('current',!!hand&&i===current);el.classList.toggle('past',!!hand&&i<current);});
  document.querySelectorAll('[data-board-group]').forEach(el=>{const i=['preflop','flop','turn','river'].indexOf(el.dataset.boardGroup);el.classList.toggle('current',!!hand&&i===current);el.classList.toggle('past',!!hand&&i<current);});
  updateShowdownView();
  updatePlayerEquity();
}
/** Play only changes already committed by the engine, in visible table order. */
async function presentHand({releaseResponse=false}={}){
  render();
  // NEXT HAND commits its new neutral portrait synchronously in render. Cached
  // portraits need no transition; cold loads cannot deal over the previous boss.
  if(dealt.player===0&&dealt.npc===0)await waitForBossScene(hand,document);
  await potView.whenIdle();
  // The reply badge belongs to the completed action, not the next visible street.
  if(releaseResponse){clearResponseSource();renderActions();}
  if(dealt.player<2||dealt.npc<2){
    setTableCue('hole-deal','DEALING');
    const order=[];
    for(let i=0;i<2;i++)for(const seat of [hand.bigBlind,hand.smallBlind])order.push({seat,index:i,element:$(seat+'-cards').children[i]});
    await effects.deal(order.map(x=>x.element),{onLand:async(element,index)=>{
      const item=order[index];
      if(item.seat==='player')await effects.reveal([element],{holdMs:35,
        onReveal:()=>replaceCardFace(element,hand.holes.player[item.index]),
        onVisible:()=>{dealt.player=item.index+1;updateVisibleCards();}});
      else{dealt.npc=item.index+1;updateVisibleCards();}
    }});
    render();await delay(reduceMotion?0:350);
  }
  // Empty dashed slots receive physical cards only as their street begins.
  while(shownBoard<hand.board.length){
    equityMomentum.clear();renderWinRate($('player-win-rate'));$('equity').textContent='';$('equity').title='';
    const {start,end,street}=nextBoardReveal(shownBoard,hand.board.length);
    setTableCue('board-deal',street.toUpperCase(),{detail:street==='flop'?'DEAL 3 SHARED CARDS':'DEAL 1 SHARED CARD'});
    const cards=[...$('board').children].slice(start,end);
    for(const element of cards)replaceCardFace(element,null,{back:true});
    await effects.deal(cards,{onLand:(element,index)=>{boardDealt=start+index+1;updateVisibleCards();}});
    await effects.reveal(cards,{holdMs:35,staggerMs:105,
      onReveal:(element,index)=>replaceCardFace(element,hand.board[start+index]),
      onVisible:(element,index)=>{shownBoard=start+index+1;updateVisibleCards();}});
    render();await delay(reduceMotion?0:700);
  }

  if(hand.result?.reason==='showdown'&&shownReveal<2){
    equityMomentum.clear();setMusicPhase('showdown');
    setTableCue('showdown','SHOWDOWN');
    await delay(reduceMotion?0:450);
    const start=shownReveal;
    await effects.reveal([...$('npc-cards').children].slice(start),{holdMs:900,
      onReveal:(element,index)=>replaceCardFace(element,hand.holes.npc[start+index]),
      onVisible:(element,index)=>{shownReveal=start+index+1;updateShowdownView();}});
    await delay(reduceMotion?0:700);
  }
  if(hand.status==='playing')setTableCue();
  render();
}
function render({beforeBlinds=false}={}){
  if(hand!==shownHand){equityMomentum.reset();setMusicPhase('table');playerEquity.reset();shownHand=hand;shownBoard=0;boardDealt=0;shownReveal=0;dealt={player:0,npc:0};settlementReleased=false;presentedCredits={player:0,npc:0};responseSource=null;responseDecision=null;activeNpcDistribution=null;responseFlight.clear();totalWin.clear();bossAction.clear();delete $('game').dataset.npcFolded;bankrollView.clearChanges();}
  const active=hand?.status==='playing';const handView=getCurrentHandView(hand?.holes.player.slice(0,dealt.player)||[],hand?.board.slice(0,shownBoard)||[]);const best=handView.highlighted;
  if(hand)blindDraw.renderSeat({isSmall:hand.smallBlind==='player'});else if(!session)blindDraw.clear();
  const h=hud();$('game').dataset.busy=String(busy);
  $('game').dataset.state=hand?.result&&!settlementReleased?'playing':hand?.status||'idle';$('game').dataset.actor=busy?'':hand?.actor||'';$('game').dataset.street=hand?visibleStreet():'';updateExpression(settlementReleased?hand?.result?.winner||'':'');
  renderBankrolls({beforeBlinds});
 $('balance-label').textContent='TOTAL BALANCE';
  $('total-bet').textContent=money(beforeBlinds?0:h.playerCommitted);
  for(const seat of ['player','npc'])$(seat+'-blind').hidden=true;
  renderCardRow($('npc-cards'),hand?Array.from({length:2},(_,i)=>({card:i<shownReveal?hand.holes.npc[i]:null,back:i>=shownReveal,visible:i<dealt.npc})):[]);
  renderCardRow($('player-cards'),hand?Array.from({length:2},(_,i)=>({card:i<dealt.player?hand.holes.player[i]:null,back:i>=dealt.player,best:i<dealt.player&&best.includes(hand.holes.player[i]),visible:i<dealt.player})):[]);
  const boardViews=Array.from({length:5},(_,i)=>boardCardView(i,{cards:hand?.board??null,dealt:boardDealt,revealed:shownBoard}));
  renderCardRow($('board'),boardViews.map(view=>({...view,best:!!view.card&&best.includes(view.card)})));
  potView.render(beforeBlinds?null:hand,hand?.config||session?.config||config,{deferSettlement:!settlementReleased});
  if(!hand){$('game').dataset.npcState='';$('pot-label').textContent='POT';$('pot-value').textContent='0';$('pot-event').textContent='';}
  $('pot-value').classList.toggle('compact-amount',$('pot-value').textContent.length>6);
  $('leave-button').disabled=!session||active||busy;
  $('reset-demo').disabled=!!session||busy||!!restoreError;
  updateVisibleCards();
  if(!hand){$('equity').textContent='Two cards. Your next move.';$('equity').title='';}
  else if(!active&&shownReveal===0&&!playerEquityReady()){$('equity').textContent=hand.result.reason==='showdown'?'Made-hand cards are highlighted. Kickers still break ties.':'This hand ended before showdown.';$('equity').title='';}
  renderActions();paintDistribution();
}
function renderActions(){
 const root=$('action-buttons'),h=hud(),playing=hand?.status==='playing',settled=hand?.status==='settled';
 for(const id of ['menu-button','deck-button','balance-button','pot-info-button','table-rank-button'])$(id).disabled=busy;
 $('game').dataset.busy=String(busy);$('round-cta').hidden=!!hand&&(!settled||busy);$('result-details').hidden=false;$('result-details').disabled=!settled||busy;
 $('round-cta').classList.remove('has-bet-picker');$('round-bet').hidden=true;$('result-bet').hidden=true;
 const canContinue=!!session&&handEntryStatus(session).canStart;
 $('sit-button').disabled=busy||!!session&&!canContinue;$('next-hand').disabled=busy||!settled||!canContinue;
 $('next-hand').title=canContinue?'Start next hand':'No chips left. Leave the table to buy in again.';
 if(!hand){$('sit-button').innerHTML=`${icon('play')}<b>FIGHT</b>`;$('sit-button').onclick=session?newHand:setupBuyin;}
 else if(settled){$('sit-button').innerHTML=`${icon('play')}<b>${canContinue?'NEXT HAND':'NO CHIPS LEFT'}</b>`;$('sit-button').onclick=newHand;}
 const actions=h.actions,passive=actions.find(a=>a.type==='call'||a.type==='check'),raises=actions.filter(a=>a.type==='raise'||a.type==='bet');
 if(busy||!playing||hand.actor!=='player')raiseMenuOpen=false;
 const slots=[{type:'fold',a:actions.find(a=>a.type==='fold')},{type:passive?.type||'check',a:passive},{type:raises[0]?.type||(playing&&hand.currentBet>0?'raise':'bet'),a:raises[0],sizing:true}];
 root.innerHTML=slots.map(({type,a,sizing})=>{
  const name=PLAYER_ACTION_LABELS[type],cost=!sizing&&a&&['call','check'].includes(type)?`${chipIcon}${a.amount>0?money(a.amount):'FREE'}`:'';
  const preview=a?actionResponseMarkup(actionResponsePreview(hand,a)):'';
  const choices=sizing&&raiseMenuOpen?`<div id="raise-options" class="raise-options" role="group" aria-label="Choose ${name.toLowerCase()} amount">${raiseMenuChoices(raises).map(choice=>`<div class="raise-option-row">${actionResponseMarkup(actionResponsePreview(hand,choice),{compact:true})}<button type="button" data-size-action="${esc(choice.id||choice.type)}" aria-label="${name} ${money(choice.amount)} ${raiseSizeLabel(choice)}"><strong>${chipIcon}${money(choice.amount)}</strong><small>${raiseSizeLabel(choice)}</small></button></div>`).join('')}</div>`:'';
  return `<div class="action-slot${sizing?' raise-slot':''}" data-action-slot="${type}">${raiseMenuOpen&&sizing?'':preview}${choices}<button type="button" class="action art-action ${type} ${['check','call'].includes(type)?'main-action':'side-action'}" data-action="${sizing?'choose-size':type}" ${a?'':'disabled'} ${sizing?'aria-expanded="'+raiseMenuOpen+'" aria-controls="raise-options"':''} aria-label="${name}${sizing?' choose amount':a?.amount?' '+money(a.amount):''}"><img class="action-art" src="${ACTION_ART[type]}" alt="" draggable="false"><span class="action-face"><span class="action-name">${name}</span>${sizing?'<span class="action-arrow" aria-hidden="true">▲</span>':''}</span><b class="action-cost">${cost}</b></button></div>`;
 }).join('');
 root.querySelectorAll('[data-action]').forEach(button=>button.onclick=()=>{if(button.dataset.action==='choose-size'){raiseMenuOpen=!raiseMenuOpen;renderActions();}else playerAct(button.dataset.action);});
 root.querySelectorAll('[data-size-action]').forEach(button=>button.onclick=()=>{const id=button.dataset.sizeAction;raiseMenuOpen=false;playerAct(id);});
 responseFlight.update(activeNpcDistribution||responseSource?.distribution||[],responseDecision||{});
 renderStreetOdds();
}
function renderStreetOdds(){
 const button=$('street-odds-button');
 const visible=hand?.status==='playing'&&shownBoard===hand.board.length;
 button.hidden=true;
 if(hand?.config.outcome.mode==='natural-holdem')return;
 if(!visible)return;
 const scenarios=getBossProbabilityScenarios(hand),p=scenarios.facing;
 const percentage=value=>Number((value*100).toFixed(2))+'%';
 const name=hand.bossProfile.id==='maniac'?'AGGRESSIVE':'PASSIVE';
 button.innerHTML=`<b>${name}<small>VS BET</small></b><span>FOLD ${percentage(p.fold)}</span><span>CALL ${percentage(p.call)}</span><span>RAISE ${percentage(p.raise)}</span><i>ⓘ</i>`;
 button.setAttribute('aria-label',`${name}. Facing a bet: fold ${percentage(p.fold)}, call ${percentage(p.call)}, raise ${percentage(p.raise)}. View all response odds.`);
 $('street-odds-title').textContent=name+' · '+hand.street.toUpperCase();
 $('street-odds-content').innerHTML=bossProbabilityScenariosHtml(hand);
}
$('street-odds-button').onclick=()=>{renderStreetOdds();show('street-odds-dialog');};
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&raiseMenuOpen){raiseMenuOpen=false;renderActions();}});
document.addEventListener('pointerdown',event=>{if(raiseMenuOpen&&!event.target.closest('#action-buttons')){raiseMenuOpen=false;renderActions();}});

function paintDistribution(){
  const panel=document.querySelector('.response-panel'),previews=$('preview-actions');
  previews.hidden=true;previews.replaceChildren();
  delete panel.dataset.action;
  panel.hidden=true;panel.dataset.mode='hidden';
  $('response-title').textContent='';$('response-status').textContent='';$('response-caption').textContent='';
  $('probability-track').replaceChildren();$('probability-legend').replaceChildren();
  $('decision-emblem').hidden=true;
}
function clearResponseSource(){
  pendingPlayerAction=null;responseSource=null;responseDecision=null;activeNpcDistribution=null;responseFlight.clear();delete $('game').dataset.chosenAction;
}
function actionOddsText(distribution,separator=' · '){
 const grouped=new Map();
 for(const action of distribution)if(action.probability>0)grouped.set(action.type,(grouped.get(action.type)||0)+action.probability);
 return [...grouped].map(([type,probability])=>`${responseActionLabel(type)} ${pct(probability)}`).join(separator);
}
async function playerAct(requested){
  if(busy||hand?.actor!=='player'||hand.status!=='playing')return;
  try{busy=true;phase='YOUR MOVE';lastResponse=null;const chosen=legalActions(hand).find(a=>a.id===requested||a.type===requested);const type=chosen?.type;if(!chosen)throw new Error('This action is not available.');
    const before=hand.board.length,historyStart=hand.history.length;
    pendingPlayerAction={...chosen};responseSource=captureResponseSource(hand,chosen);responseDecision=null;$('game').dataset.chosenAction=type;renderActions();paintDistribution();
    setTableCue('action',`YOU ${PLAYER_ACTION_LABELS[type]}`,{seat:'player',detail:chosen.amount?'CHIPS TO THE POT':type==='check'?'NO CHIPS REQUIRED':'END THIS HAND'});
    applyAction(hand,chosen);saveSettledPlayer();phase=hand.board.length===5&&before<4?'ALL-IN · RUNNING THE BOARD':hand.board.length>before?`DEAL ${STREETS[hand.street]}`:hand.status==='settled'?'SETTLING':'CHIPS TO POT';
    paintDistribution();
    const actionEvent=hand.history.slice(historyStart).find(event=>event.actor==='player');
    announcements.announce(actionEvent,{key:`${hand.handNumber}:${historyStart}`});
    if(chosen.amount)setTableCue('contribution',`YOU ${PLAYER_ACTION_LABELS[type]}`,{seat:'player',detail:'CHIPS TO THE POT'});
    // Commit once, then finish the player's chip arrival before presenting the
    // opponent's decision. Re-rendered chosen-slot badges retain this preview.
    await presentHand();
    if(responseSourceMatches(responseSource,hand)){
      phase='OPPONENT RESPONSE';setTableCue('action','OPPONENT RESPONSE',{seat:'npc'});
      if(!isCertainResponse(responseSource.distribution))responseFlight.show(responseSource.distribution);
    }else clearResponseSource();
    if(hand.status==='playing')await delay(reduceMotion?0:350);await continuePlay();
  }catch(error){busy=false;phase='';clearResponseSource();bossAction.clear();setTableCue();$('game').dataset.deciding='false';toast(translateError(error));render();}
}
async function continuePlay(){
  while(hand?.status==='playing'&&hand.actor==='npc'){
    setTableCue();$('game').dataset.activeSeat='npc';
    const source=responseSourceMatches(responseSource,hand)?responseSource:null;
    if(!source)clearResponseSource();
    busy=true;const distribution=getActionDistribution(hand);
    const decisionRng=hand.config.outcome.mode==='natural-holdem'?hand.rng.clone():hand.rng;
    const selected=sampleDistribution(distribution,decisionRng);const beforeStreet=hand.street;
    const entry={street:beforeStreet,distribution:distribution.map(a=>({...a})),selected:{...selected},roll:selected.roll};
    const hasDraw=!isCertainResponse(distribution);
    phase=hasDraw?'OPPONENT DECIDING':'OPPONENT ACTION';$('game').dataset.npcState=hasDraw?'thinking':selected.type;$('game').dataset.deciding=String(hasDraw);
    activeNpcDistribution=distribution;
    responseDecision={phase:hasDraw?'drawing':'result',selected:hasDraw?null:selected.type};
    if(hasDraw&&!source)responseFlight.show(distribution,responseDecision);if(!hasDraw)responseFlight.clear();
    renderActions();paintDistribution();
    if(hasDraw){
      const target=responseFlight.target();
      const marker=target?document.createElement('span'):null;
      if(marker){marker.className='action-response-sweep';target.append(marker);}
      setTableCue('action','OPPONENT DECIDING',{seat:'npc',detail:actionOddsText(distribution)});
      const motion=decisionMotion(hand.config.animationMs,selected.roll,{reducedMotion:reduceMotion}),sweepMs=Math.min(450,motion.duration);
      // Opponent decisions keep their original reading time; other presentation stays at 1.2x.
      if(sweepMs>0){
        if(marker)await effects.animate(marker,[{left:'0%'},{left:'100%',offset:.25},{left:'0%',offset:.5},{left:'100%',offset:.75},{left:`${selected.roll*100}%`}],{duration:sweepMs,easing:'linear',fill:'forwards'},{speed:1});
        else await delay(sweepMs,{speed:1});
      }
      marker?.remove();
      lastResponse=entry;
      responseDecision={phase:'result',selected:selected.type,roll:selected.roll};renderActions();
      setTableCue('action',`OPPONENT ${responseActionLabel(selected.type)}`,{seat:'npc'});
      await delay(Math.max(0,motion.duration-sweepMs),{speed:1});
    }else{lastResponse=null;setTableCue('action',`OPPONENT ${responseActionLabel(selected.type)}`,{seat:'npc'});}
    const before=hand.board.length,historyStart=hand.history.length;
    applyAction(hand,selected);
    if(hand.config.outcome.mode==='natural-holdem')hand.rng=hand.session.rng=decisionRng;
    saveSettledPlayer();drawLog.push(entry);$('game').dataset.npcState=selected.type;
    // Use only the committed history event. Paid action text starts from the
    // same contribution notification as the actual chips; free actions start now.
    const actionEvent=hand.history.slice(historyStart).find(event=>event.actor==='npc');
    announcements.announce(actionEvent,{key:`${hand.handNumber}:${historyStart}`});
    const actionPresentation=bossAction.commit(actionEvent);
    $('game').dataset.deciding='false';paintDistribution();
    if(selected.type==='fold'){await effects.discardCards([...$('npc-cards').children]);$('game').dataset.npcFolded='true';}
    phase=hand.board.length===5&&before<4?'ALL-IN · RUNNING THE BOARD':hand.board.length>before?`DEAL ${STREETS[hand.street]}`:hand.status==='settled'?'SETTLING':'CHIPS TO POT';
    setTableCue(selected.amount?'contribution':'action',`OPPONENT ${responseActionLabel(selected.type)}`,{seat:'npc',detail:selected.amount?'CHIPS TO THE POT':selected.type==='check'?'NO CHIPS REQUIRED':'END THIS HAND'});
    await presentHand({releaseResponse:true});
    await actionPresentation;
    if(hand.status==='playing')await delay(reduceMotion?0:350);
  }
  if(hand?.status==='settled'){
    phase='SETTLING PAYOUT';renderActions();const completed=hand;
    if(!handArchive.some(x=>x.number===hand.handNumber))handArchive.push({number:hand.handNumber,time:new Date().toLocaleTimeString('en-US',{hour12:false}),history:structuredClone(hand.history),draws:structuredClone(drawLog),result:structuredClone(hand.result)});
    setTableCue('payout',hand.result.winner==='player'?'YOU WIN':hand.result.winner==='tie'?'SPLIT POT':'OPPONENT WINS');
    equityMomentum.clear();setMusicPhase(hand.result.winner==='player'?'win':hand.result.winner==='tie'?'tie':'loss');
    updateExpression(hand.result.winner);
    potView.render(hand,hand.config,{deferSettlement:false});await potView.whenIdle();
    settlementReleased=true;render();
    await totalWin.whenIdle();
    if(hand!==completed)return;
    await delay(reduceMotion?0:1000);
    // Opponent chips are matched only when the next hand starts.
    saveSettledPlayer();

    busy=false;phase='';setMusicPhase('table');setTableCue();render();
    if(hand.result.player.profit<0)effects.play('loss');
    if(session.stacks.player<=0){leaveTable();setupBuyin();}
  }else{busy=false;phase='';render();}
}
function showResult(){
  if(!hand?.result||busy)return;document.querySelectorAll('dialog[open]').forEach(d=>{if(d.id!=='result-dialog')d.close();});const r=hand.result;const p=r.player;
  $('result-kicker').textContent=`HAND ${String(hand.handNumber).padStart(2,'0')} / ${r.reason==='fold'?'FOLD':'SHOWDOWN'}`;
  $('result-dialog').dataset.outcome=p.profit>0?'win':r.winner==='tie'?'tie':r.winner==='player'?'returned':'loss';
  $('result-title').textContent=r.winner==='player'?(p.profit>0?'YOU WIN':'POT RETURNED'):r.winner==='tie'?'SPLIT POT':'OPPONENT WINS';
  $('result-reason').textContent=r.reason==='fold'?`${r.winner==='player'?'Opponent':'You'} folded. The pot is settled.`:`Best five · ${handName(r.evaluations.player)} vs. ${handName(r.evaluations.npc)}`;
  $('result-profit').textContent=`${p.profit>0?'+':''}${money(p.profit)}`;$('result-profit').classList.toggle('negative',p.profit<0);
  $('result-award-value').textContent=money(p.totalReturn);$('result-award-value').dataset.amount=String(p.totalReturn);$('result-award-value').classList.toggle('compact',money(p.totalReturn).length>7);
  $('result-overview').innerHTML=[[icon('chip'),'TOTAL BET',p.totalContribution],[icon('wallet'),'CHIPS',p.stackAfter]].map(([visual,label,value])=>`<div>${visual}<small>${label}</small><b>${money(value)}</b></div>`).join('');
  document.querySelector('.result-accounting').open=false;
  document.querySelector('.result-hand-details').open=false;
  $('result-hands').innerHTML=['player','npc'].map(seat=>{const evaluation=r.evaluations[seat],concealed=seat==='npc'&&r.reason==='fold';return `<div><span>${seat==='player'?'You':'Opponent'}</span><div class="result-best5">${(evaluation?.best5||hand.holes[seat]).map(c=>cardMarkup(c,{back:concealed})).join('')}</div><b>${concealed?'Not shown':evaluation?handName(evaluation):'No showdown'}</b><small>${evaluation?'BEST FIVE':r.reason==='fold'?'FOLD':''}</small></div>`;}).join('');
  const rows=[['Total bet','totalContribution'],['Uncalled refund','refund'],['Matched wager','matchedWager'],['Gross pot share','gross'],['Pot return','netReturn'],['Total return','totalReturn'],['Net profit','profit'],['Closing balance','stackAfter']];
  $('settlement').innerHTML='<div class="ledger-head"><span>Chip details</span><span>You</span><span>Opponent</span></div>'+rows.map(([label,key])=>`<div class="ledger-row ${key==='profit'?'total':''}"><span>${label}</span><span>${money(r.player[key])}</span><span>${money(r.npc[key])}</span></div>`).join('');
  $('result-note').textContent=`Next hand the opponent will start with ${money(session.stacks.player)} chips, matching yours. No top-ups at this table.`;
  $('next-hand').innerHTML=`${icon('play')}NEXT HAND`;show('result-dialog');
  if(!reduceMotion&&p.profit>0)effects.animate($('result-award-value'),[{transform:'scale(.65)',filter:'brightness(2.4)'},{transform:'scale(1.1)',filter:'brightness(1.3)',offset:.65},{transform:'scale(1)',filter:'brightness(1)'}],{duration:1100,easing:'cubic-bezier(.2,.9,.3,1)'});
}
function renderHistory(){
  function steps(rows,draws){let html='';for(const street of Object.keys(STREETS)){const group=rows.filter(x=>x.street===street);if(!group.length)continue;html+=`<div class="history-header">${STREETS[street]}</div>`;
    for(const a of group){if(a.type==='reveal'){html+=`<div class="history-row"><span>Deal ${STREETS[street]}</span><em>${(a.cards||[]).map(cardText).join(' ')}</em></div>`;continue;}html+=`<div class="history-row"><span>${a.actor==='player'?'You':'Opponent'} · ${LABELS[a.type]||esc(a.type)}</span><em>${a.amount?`+${money(a.amount)}`:'—'}</em></div>`;}
    for(const d of draws.filter(x=>x.street===street))html+=`<div class="history-row"><small>Opponent action odds: ${actionOddsText(d.distribution,' / ')}<br>Result: ${responseActionLabel(d.selected.type)}${d.selected.amount?' '+money(d.selected.amount):''}</small></div>`;}return html;}
  let html=hand?.status==='playing'?`<details class="history-card" open><summary><span>Hand ${String(hand.handNumber).padStart(2,'0')}<small>Playing · ${STREETS[hand.street]}</small></span><b>Unsettled</b></summary>${steps(hand.history,drawLog)}</details>`:'';
  for(const item of handArchive.slice(-20).reverse()){const r=item.result;html+=`<details class="history-card"><summary><span>Hand ${String(item.number).padStart(2,'0')} · ${r.reason==='fold'?'FOLD':'SHOWDOWN'}<small>${item.time} · ${r.winner==='player'?'You win':r.winner==='tie'?'Tie':'Opponent wins'}</small></span><b class="${r.player.profit<0?'negative':''}">${signed(r.player.profit)}</b></summary><p>Bet ${money(r.player.totalContribution)} / Refund ${money(r.player.refund)} / Pot return ${money(r.player.netReturn)}<br>Closing balance ${money(r.player.stackAfter)}</p>${item.opponentRefresh?`<p>Opponent demo chips refreshed: ${money(item.opponentRefresh.before)} → ${money(item.opponentRefresh.after)}<br>Separate from this hand’s payout.</p>`:''}${steps(item.history,item.draws)}</details>`;}
  $('history-content').innerHTML=html?`<p class="muted">${handArchive.length} hands completed · Latest 20 shown<br>Values show net profit per hand. Tap for actions and payouts.</p>${html}`:'<div class="history-empty"><b>No hands yet</b>Complete your first hand to start this table history.</div>';
}
window.addEventListener('storage',e=>{if(e.key===CONFIG_KEY)toast('Settings saved. Rejoin the table to apply them.');});
window.addEventListener('error',e=>{toast(translateError(e.error||e.message));});
if(!session)prepareEntry();
render();setTableCue();
if(restoreError)toast(restoreError);
setupBuyin();

