import {createSession,startHand,legalActions,applyAction,getActionDistribution,sampleDistribution,previewResponse,equityEstimate,holeScore,syncOpponentBankroll} from './engine.mjs?v=35';
import {loadConfig,CONFIG_KEY,money,pct,esc,cardMarkup,cardText} from './shared.mjs?v=35';
import {GAME_LABELS as LABELS,GAME_STREETS as STREETS,handName,translateError} from './game-text.mjs?v=35';
import {createPotView} from './pot-view.mjs?v=35';
import {fitStage} from './stage-fit.mjs?v=35';
import {getHudSnapshot} from './hud-state.mjs?v=35';
import {createGameEffects} from './game-effects.mjs?v=36';
import {renderBetPresets,updateBetSelection,setupEntryFeatures} from './entry-view.mjs?v=35';
import {betOptions,minimumAssets,tableConfig} from './entry-model.mjs?v=37';
import {nextHandBetConfig} from './next-hand-bet.mjs?v=37';
import {icon} from './ui-icons.mjs?v=35';
import {JACKPOT_MULTIPLIERS,quoteJackpot} from './jackpot.mjs?v=35';
import {renderJackpotWin} from './jackpot-view.mjs?v=35';
import {getCurrentHandView} from './hand-view.mjs?v=35';
import {decisionMotion} from './decision-motion.mjs?v=35';
import {getShowdownView} from './showdown-view.mjs?v=35';
import {GAME_SPEED,atGameSpeed} from './presentation-timing.mjs?v=35';
import {createBankrollView} from './bankroll-view.mjs?v=35';
import {renderWinRate} from './win-rate-view.mjs?v=35';
import {responseBadgeView,responseActionLabel,captureResponseSource,responseSourceMatches} from './action-response-view.mjs?v=38';
import {boardCardView,nextBoardReveal,tableDeckCounts} from './board-presentation.mjs?v=35';
import {createResponseFlight} from './response-flight-view.mjs?v=38';
import {createActionFlow} from './action-flow-view.mjs?v=35';
import {createBlindDraw} from './blind-draw-view.mjs?v=35';
import {createTotalWin} from './total-win-view.mjs?v=35';
import {createBossActionView} from './boss-action-view.mjs?v=35';
import {renderBossIdentity,preloadBossScenes,waitForBossScene} from './boss-scene-view.mjs?v=36';
document.documentElement.style.setProperty('--game-speed',String(GAME_SPEED));
const $=id=>document.getElementById(id);
// Stable player controls; engine actions and opponent response types stay unchanged.
const PLAYER_ACTION_LABELS={fold:'FOLD',check:'CALL',call:'CALL',bet:'RAISE',raise:'RAISE'};
let config=loadConfig(),session=null,hand=null,busy=false,drawLog=[],lastResponse=null,handArchive=[],equityCache='',toastTimer,closedTable=null,phase='';
let selectedBet=1,entryBase=config,betValues=[...new Set([1,...betOptions(config)])].sort((a,b)=>a-b),demoAssets=config.buyIn;
let nextBetDraft=1,nextBetValues=[];
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const potView=createPotView({root:document,reducedMotion:reduceMotion,locale:'en',onPhase:presentTransferPhase});
const effects=createGameEffects({root:document,reducedMotion:reduceMotion});
const responseFlight=createResponseFlight({root:document,effects,reducedMotion:reduceMotion});
const actionFlow=createActionFlow({root:document});
const blindDraw=createBlindDraw({root:document,effects,reducedMotion:reduceMotion});
const totalWin=createTotalWin({root:document,effects,reducedMotion:reduceMotion});
const bossAction=createBossActionView({root:document,reducedMotion:reduceMotion});
preloadBossScenes(document);
const bankrollView=createBankrollView({root:document});
let soundOn=true;
try{soundOn=localStorage.getItem('magic-poker-lite:sound')!=='off';}catch{}
effects.setMuted(!soundOn);$('sound-toggle').checked=soundOn;
// Touch release/click are user activations on mobile Safari. Retry after every
// gesture because an app switch or phone call can suspend an unlocked context.
document.addEventListener('pointerup',()=>{if(soundOn)effects.unlock();},{passive:true});
document.addEventListener('keydown',e=>{if(soundOn&&!e.repeat)effects.unlock();});
document.addEventListener('click',e=>{if(soundOn&&e.target.closest('button:not(:disabled)'))effects.unlock().then(ready=>{if(ready)effects.play('click');});});
document.addEventListener('visibilitychange',()=>{if(document.hidden)effects.suspendAudio();});
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
const bankroll=()=>session?.stacks.player??closedTable?.playerBalance??demoAssets;
function renderBankrolls({refreshNpc=false}={}){
 const pending=hand?.result&&!settlementReleased;
 const values=pending?Object.fromEntries(['player','npc'].map(seat=>[seat,hand.stacksBefore[seat]-hand.contributions[seat]+presentedCredits[seat]]))
  :{player:bankroll(),npc:session?.stacks.npc??bankroll()};
 bankrollView.render(values,{baseBet:hand?.config.bigBlind??selectedBet,refreshNpc});
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
  setTableCue('contribution',label,{seat:seats.length===1?seats[0]:'',detail:`${seats.map(seat=>money(amounts[seat])).join(' + ')} → POT`});
 }else if(flow==='refund')setTableCue('refund','UNCALLED CHIPS BACK',{seat:seats.length===1?seats[0]:'',detail});
 else if(flow==='payout'){
  totalWin.start(hand.result);
  for(const seat of ['player','npc'])presentedCredits[seat]=hand.result[seat].refund;
  renderBankrolls();
  const label=hand.result.pot<=0?'HAND COMPLETE':hand.result.winner==='tie'?'SPLIT POT':hand.result.winner==='player'?'YOU WIN':'OPPONENT WINS';
  setTableCue('payout',label,{seat:seats.length===1?seats[0]:'',detail:detail||'NO MATCHED POT'});
 }else if(flow==='complete'){
  for(const seat of ['player','npc'])presentedCredits[seat]=hand.result[seat].refund+hand.result[seat].netReturn;
  renderBankrolls();
 }
}
const tierNames={royal:'Royal Flush',straightFlush:'Straight Flush',quads:'Four of a Kind'};
const tierCards={royal:['As','Ks','Qs','Js','Ts'],straightFlush:['9h','8h','7h','6h','5h'],quads:['As','Ah','Ad','Ac','Ks']};
function renderJackpot(){
 const c=(hand?.status==='settled'&&!busy?session?.config:hand?.config)||session?.config||{...config,bigBlind:selectedBet},enabled=c.jackpotEnabled!==false;
 $('jackpot-amount').textContent=enabled?money(quoteJackpot('royal',c.bigBlind).award):'—';
 $('jackpot-button').setAttribute('aria-label',enabled?`View Jackpot prizes, up to ${money(quoteJackpot('royal',c.bigBlind).award)}`:'Jackpot is off for this table');
 $('jackpot-tiers').innerHTML=Object.entries(JACKPOT_MULTIPLIERS).map(([tier,multiplier])=>`<div class="jp-tier jp-tier-${tier}"><div class="jp-tier-name">${icon('crown')}<b>${tierNames[tier]}</b><small>${multiplier}× BET</small></div><div class="jp-cards">${tierCards[tier].map(c=>cardMarkup(c)).join('')}</div><strong>${enabled?money(quoteJackpot(tier,c.bigBlind).award):'OFF'}</strong></div>`).join('');
 const wins=handArchive.filter(x=>x.result.jackpot);
 $('jackpot-history').innerHTML=wins.length?wins.slice(-10).reverse().map(x=>`<div class="jp-record"><span>#${x.number} · ${tierNames[x.result.jackpot.tier]}</span><b>+${money(x.result.jackpot.award)}</b></div>`).join(''):'<div class="jp-empty">No Jackpot wins yet</div>';
}
$('jackpot-button').onclick=()=>{renderJackpot();show('jackpot-dialog');};
$('jackpot-win-continue').onclick=()=>{$('jackpot-win-dialog').close();showResult();};
$('blind-dialog').addEventListener('cancel',e=>e.preventDefault());
function decorateMenu(){
 const map={'help-dialog':'rules','menu-ranks':'cards','menu-history':'history','menu-balance':'wallet','result-details':'chip','leave-button':'leave'};
 document.querySelectorAll('.menu-grid>button').forEach(b=>{const key=b.dataset.open||b.id;b.insertAdjacentHTML('afterbegin',icon(map[key]||'cards'));});
 document.querySelector('.sound-setting>span').insertAdjacentHTML('afterbegin',icon('sound'));
 const reset=document.createElement('button');reset.id='reset-demo';reset.className='text-button wide';reset.textContent='↻ Reset demo chips';reset.onclick=()=>{if(busy||hand?.status==='playing')return;session=null;hand=null;closedTable=null;config=loadConfig();demoAssets=config.buyIn;selectedBet=1;handArchive=[];drawLog=[];lastResponse=null;$('menu-dialog').close();render();setupBuyin();};
 $('menu-dialog').append(reset);
 const rules=document.querySelector('#help-dialog .rules');
 rules.innerHTML=`<li>${icon('chip')}<b>Choose BET · Draw your blind</b><span>SMALL BLIND posts ½ BET; BIG BLIND posts 1 BET. Your first blind is drawn 50/50; positions alternate each hand. Small blind acts first preflop; big blind acts first after the flop.</span></li><li>${icon('cards')}<b>2 hole cards + 5 board cards</b><div class="rule-card-flow"><span>2</span><i>＋</i><span>3</span><i>→</i><span>1</span><i>→</i><span>1</span></div><span>PREFLOP → FLOP → TURN → RIVER</span></li><li>${icon('call')}<b>Your move · Their response</b><span>CALL matches the current bet, or checks for free when nothing is due. RAISE opens betting or increases an existing bet. The amount is what you add now. One raise per street.</span></li><li>${icon('crown')}<b>Best 5 of 7</b><span>A fold ends the hand. Otherwise, compare at showdown. Special hands earn a Jackpot bonus.</span></li>`;
 const fees=document.createElement('details');fees.className='rules-details';fees.innerHTML='<summary>Hand highlights, turn order & pot fee ⓘ</summary><p>Gold edges mark your complete best five, including kickers. Before five cards are visible, all your visible cards glow. Blue edges mark the opponent’s best five using only their revealed hole cards and the board. Shared cards can carry both gold and blue edges.</p><p>Your controls and BOSS responses always read FOLD, CALL and RAISE. A free CALL performs a check; RAISE opens betting when no bet exists yet. These are simplified display names for both seats. If the opponent has not acted, they may still check or bet in the same street. Two checks close the street; the next shared cards are then revealed for the new street.</p><p>Both seats post before cards are dealt: SMALL BLIND pays ½ BET and BIG BLIND pays 1 BET. Small blind acts first preflop and can fold, call the remaining ½ BET, or raise. Big blind acts first after the flop. Folding forfeits chips already committed, except any uncalled excess. Choosing a BET level does not charge chips. Both seats follow the same rule. The floating BOSS badges above your buttons show opponent responses, not your win chance. A certain same-street response is shown as 100%, including CALL. Mixed responses show FOLD and RAISE only, so their percentages need not total 100%. Actions that end the hand or move to the next street have no same-street response badge.</p><p>After every hand, including folds, the opponent’s demo chips reset to match your remaining chips. Your own balance keeps the actual winnings and losses. After settlement, use BET to set the next hand’s amount, then NEXT HAND to deal. Changing BET costs no chips; closing the picker cancels unsaved changes.</p><p id="help-fee"></p>';
 rules.after(fees);
 document.querySelector('#help-dialog>p.muted').textContent='Standard 52-card deck, no jokers. Starting-hand boosts only redraw weak hole cards during the deal. Jackpot awards use the actual showdown hand.';
 const ledger=$('settlement'),details=document.createElement('details');details.className='result-accounting';details.innerHTML=`<summary>${icon('wallet')}Chip details <span>⌄</span></summary>`;ledger.replaceWith(details);details.append(ledger);
 const overview=document.createElement('div');overview.id='result-overview';overview.className='result-overview';details.before(overview);
}
decorateMenu();
setupEntryFeatures();
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).close()));
const openHelp=()=>{const c=hand?.config||session?.config||config;$('help-fee').textContent=`A ${pct(1-c.targetRtp)} fee is taken from the matched pot before payout, including ties. Uncalled chips are returned in full, with no fee.`;show('help-dialog');};
const openHistory=()=>{renderHistory();show('history-dialog');};
$('menu-button').onclick=()=>show('menu-dialog');
$('sound-toggle').onchange=e=>{soundOn=e.target.checked;effects.setMuted(!soundOn);if(soundOn)effects.unlock().then(ready=>{if(ready)effects.play('click');});try{localStorage.setItem('magic-poker-lite:sound',soundOn?'on':'off');}catch{}};
document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{$('menu-dialog').close();if(b.dataset.open==='help-dialog')openHelp();else show(b.dataset.open);});
$('menu-history').onclick=()=>{$('menu-dialog').close();openHistory();};
$('menu-balance').onclick=()=>{$('menu-dialog').close();$('balance-button').click();};
$('menu-ranks').onclick=()=>{$('menu-dialog').close();openRanks();};
$('table-rank-button').onclick=()=>openRanks();
$('deck-button').onclick=()=>{const deck=visibleDeck();$('deck-remaining-detail').textContent=deck.deckRemaining;$('dealt-count').textContent=`${deck.dealtCards} cards`;show('deck-dialog');};
$('balance-button').onclick=()=>{const h=hud();$('balance-ledger').innerHTML=[['BALANCE',bankroll()],[session||hand?'TABLE BUY-IN':closedTable?'LAST BUY-IN':'STARTING CHIPS',h.buyIn],['TOTAL BET',h.playerCommitted],['TABLE PROFIT',h.settledTableProfit],['TABLE JACKPOT',session?.jackpotAwards??closedTable?.jackpotAwards??0],['OPPONENT CHIPS',h.npcBalance]].map(([label,value])=>`<div class="info-pair"><span>${label}</span><b>${label==='TABLE PROFIT'?signed(value):amount(value)}</b></div>`).join('');show('balance-dialog');};
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
function setupBuyin(){
  if(session&&hand?.status==='playing')return;
  entryBase=loadConfig();betValues=[...new Set([1,...betOptions(entryBase)])].sort((a,b)=>a-b);if(!betValues.includes(selectedBet))selectedBet=1;
  $('bet-presets').innerHTML=renderBetPresets(betValues);
  $('bet-presets').querySelectorAll('[data-bet]').forEach(b=>b.onclick=()=>{selectedBet=Number(b.dataset.bet);updateEntry();});
  updateEntry();show('buyin-dialog');
}
function updateEntry(){
 const available=bankroll(),minimum=minimumAssets(entryBase,selectedBet),index=betValues.indexOf(selectedBet);
 updateBetSelection(selectedBet);$('entry-minimum').textContent=money(minimum);
 $('entry-blinds').textContent=`SB ${blindAmount(selectedBet/2)} · BB ${blindAmount(selectedBet)}`;
 const jackpotOn=entryBase.jackpotEnabled!==false;
 $('entry-jp-award').textContent=jackpotOn?money(quoteJackpot('royal',selectedBet).award):'OFF';
 $('entry-jp-label').textContent=jackpotOn?'ROYAL FLUSH · 200× BET':'JACKPOT DISABLED';
 $('entry-jp-caption').innerHTML=jackpotOn?'Special hands at showdown.<br>Highest bonus paid on top of the pot return.':'Jackpot is off for this table.<br>Win the pot with the best hand or a fold.';
 document.querySelector('.feature-jp-tiers').hidden=!jackpotOn;
 $('bet-minus').disabled=index<=0;$('bet-plus').disabled=index===betValues.length-1;
 $('entry-start').disabled=available<minimum||busy;$('buyin-error').textContent=available<minimum?'Not enough chips. Choose a lower BET.':'';
 $('fee-notice').textContent=`Choosing BET does not charge chips. Minimum balance: ${money(minimum)}. Each hand, SMALL BLIND automatically posts ${blindAmount(selectedBet/2)} and BIG BLIND posts ${blindAmount(selectedBet)}. The first blind position is drawn 50/50; positions alternate each hand. Small blind acts first preflop; big blind acts first after the flop. The opponent matches your balance after every hand, including folds. Pot fee: ${pct(1-entryBase.targetRtp)}. Uncalled bets are refunded in full. Demo chips only.`;
}
$('bet-minus').onclick=()=>{selectedBet=betValues[Math.max(0,betValues.indexOf(selectedBet)-1)];updateEntry();};
$('bet-plus').onclick=()=>{selectedBet=betValues[Math.min(betValues.length-1,betValues.indexOf(selectedBet)+1)];updateEntry();};
$('buyin-form').onsubmit=async e=>{e.preventDefault();if(busy)return;
  try{
   config=tableConfig(entryBase,selectedBet,bankroll());const seed=crypto.getRandomValues(new Uint32Array(1))[0];
   session=createSession(config,seed,{firstSmallBlind:'random'});hand=null;handArchive=[];closedTable=null;lastResponse=null;drawLog=[];
   $('buyin-dialog').close();busy=true;render();await showTurnDraw();busy=false;await newHand();
  }catch(error){busy=false;phase='';blindDraw.clear();$('buyin-error').textContent=translateError(error);show('buyin-dialog');render();}
};
const blindAmount=value=>Number(value).toLocaleString('en-US',{maximumFractionDigits:6});
async function showTurnDraw(){
 const isSmall=session.firstSmallBlind==='player';
 await blindDraw.play({isSmall,smallBlind:session.config.smallBlind,bigBlind:session.config.bigBlind});
}
function leaveTable(){
  if(busy||hand?.status==='playing'){toast('Finish this hand first.');return;}
  if(!session)return;const balance=session.stacks.player;closedTable={playerBalance:balance,npcBalance:session.stacks.npc,buyIn:session.config.buyIn,settledTableProfit:balance-session.config.buyIn,jackpotAwards:session.jackpotAwards};session=null;hand=null;lastResponse=null;drawLog=[];equityCache='';render();toast(`Left the table. Balance kept: ${money(balance)}.`);
}
function openNextBet(){
 if(busy||!session||hand?.status!=='settled')return;
 nextBetDraft=session.config.bigBlind;
 nextBetValues=[...new Set([...betValues,nextBetDraft])].sort((a,b)=>a-b);
 document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
 updateNextBet();show('next-bet-dialog');
}
function updateNextBet(){
 if(!session)return;
 const index=nextBetValues.indexOf(nextBetDraft);
 $('next-bet-value').textContent=money(nextBetDraft);
 $('next-bet-minus').disabled=index<=0;
 $('next-bet-plus').disabled=index>=nextBetValues.length-1;
 $('next-bet-balance').textContent=money(session.stacks.player);
 $('next-bet-minimum').textContent=money(minimumAssets(session.config,nextBetDraft));
 $('next-bet-blinds').textContent=`SMALL BLIND ${blindAmount(nextBetDraft/2)} · BIG BLIND ${blindAmount(nextBetDraft)}`;
 $('next-bet-jackpot').textContent=session.config.jackpotEnabled!==false?`ROYAL FLUSH ${money(quoteJackpot('royal',nextBetDraft).award)}`:'JACKPOT OFF';
 let error='';
 try{
  if(busy||Math.min(...Object.values(session.stacks))<.01)throw new Error('Not enough chips to start another hand.');
  nextHandBetConfig(session,nextBetDraft);
 }catch(cause){error=translateError(cause);}
 $('next-bet-error').textContent=error;$('next-bet-confirm').disabled=!!error;
}
$('round-bet').onclick=openNextBet;
$('result-bet').onclick=openNextBet;
$('next-bet-minus').onclick=()=>{nextBetDraft=nextBetValues[Math.max(0,nextBetValues.indexOf(nextBetDraft)-1)];updateNextBet();};
$('next-bet-plus').onclick=()=>{nextBetDraft=nextBetValues[Math.min(nextBetValues.length-1,nextBetValues.indexOf(nextBetDraft)+1)];updateNextBet();};
$('next-bet-form').onsubmit=e=>{
 e.preventDefault();if(busy||!session||hand?.status!=='settled')return;
 updateNextBet();if($('next-bet-confirm').disabled)return;
 try{
  // Replace only the next hand's settings; the settled hand keeps its own config.
  session.config=nextHandBetConfig(session,nextBetDraft);selectedBet=session.config.bigBlind;
  $('next-bet-dialog').close();renderActions();renderJackpot();
  toast(`Next hand · BET ${money(selectedBet)}`);
 }catch(error){$('next-bet-error').textContent=translateError(error);}
};
async function newHand(){
  if(busy||!session||hand?.status==='playing'||$('next-bet-dialog').open)return;
  $('result-dialog').close();
  if(session&&Math.min(...Object.values(session.stacks))<.01){setupBuyin();return;}
  try{busy=true;phase='DEALING';hand=startHand(session);drawLog=[];lastResponse=null;equityCache='';pendingPlayerAction=null;delete $('game').dataset.chosenAction;paintDistribution([]);setTableCue('contribution','POST BLINDS');await presentHand();await continuePlay();}catch(error){busy=false;phase='';bossAction.clear();setTableCue();toast(translateError(error));render();setupBuyin();}
}
$('next-hand').onclick=newHand;
const visibleStreet=()=>shownBoard>=5?'river':shownBoard===4?'turn':shownBoard>0?'flop':'preflop';
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
  const rate=`${Math.round(view.equity*100)}%`;
  renderWinRate($('player-win-rate'),view.equity,{description:`${rate} equity using ${view.revealedCount} revealed opponent cards; ties count as half a win.`,title:view.revealedCount===1?'Equity from the revealed opponent card; the second card is still unknown.':'Both hands revealed: win 100%, tie 50%, loss 0%.'});
  $('equity').textContent=`Equity after ${view.revealedCount} revealed opponent cards: ${pct(view.equity)}`;
  $('equity').title=view.revealedCount===1?'Exact enumeration of all 44 possible remaining opponent cards. Hidden cards are not used. Ties count as half a win.':'Both hands are revealed. Win 100%, tie 50%, loss 0%.';
  return view;
}
function updateExpression(winner=''){
  $('game').dataset.winner=winner;
  renderBossIdentity(hand,document);
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
  // These are anonymous backs only. The engine keeps its original reveal-time
  // draw order; no pending board value or unseen deck entry is read here.
  if(boardDealt<5){
    const start=boardDealt,cards=[...$('board').children].slice(start);
    setTableCue('board-deal','SETTING THE BOARD',{detail:'5 CARDS FACE DOWN'});
    await effects.deal(cards,{onLand:()=>{boardDealt++;updateVisibleCards();}});
    render();await delay(reduceMotion?0:350);
  }
  // A committed all-in runout still flips FLOP, TURN and RIVER separately.
  while(shownBoard<hand.board.length){
    const {start,end,street}=nextBoardReveal(shownBoard,hand.board.length);
    setTableCue('board-deal',street.toUpperCase(),{detail:street==='flop'?'REVEAL 3 SHARED CARDS':'REVEAL 1 SHARED CARD'});
    const cards=[...$('board').children].slice(start,end);
    await effects.reveal(cards,{holdMs:35,staggerMs:105,
      onReveal:(element,index)=>replaceCardFace(element,hand.board[start+index]),
      onVisible:(element,index)=>{shownBoard=start+index+1;updateVisibleCards();}});
    render();await delay(reduceMotion?0:700);
  }
  if(hand.result?.reason==='showdown'&&shownReveal<2){
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
function render(){
  if(hand!==shownHand){shownHand=hand;shownBoard=0;boardDealt=0;shownReveal=0;dealt={player:0,npc:0};settlementReleased=false;presentedCredits={player:0,npc:0};responseSource=null;responseDecision=null;activeNpcDistribution=null;responseFlight.clear();totalWin.clear();bossAction.clear();delete $('game').dataset.npcFolded;bankrollView.clearChanges();}
  const active=hand?.status==='playing';const handView=getCurrentHandView(hand?.holes.player.slice(0,dealt.player)||[],hand?.board.slice(0,shownBoard)||[]);const best=handView.highlighted;
  if(hand)blindDraw.renderSeat({isSmall:hand.smallBlind==='player'});else if(!session)blindDraw.clear();
  const h=hud();$('game').dataset.busy=String(busy);
  $('game').dataset.state=hand?.result&&!settlementReleased?'playing':hand?.status||'idle';$('game').dataset.actor=busy?'':hand?.actor||'';$('game').dataset.street=hand?visibleStreet():'';updateExpression(settlementReleased?hand?.result?.winner||'':'');
  renderBankrolls();
 $('balance-label').textContent='BALANCE';
  $('total-bet').textContent=money(h.playerCommitted);
  for(const seat of ['player','npc'])$(seat+'-blind').hidden=true;
  $('npc-cards').innerHTML=(hand?.holes.npc||[null,null]).map((c,i)=>cardMarkup(c,{back:i>=shownReveal})).join('');
  $('player-cards').innerHTML=(hand?.holes.player||[null,null]).map((c,i)=>cardMarkup(c,{back:!hand||i>=dealt.player,best:i<dealt.player&&best.includes(c)})).join('');
  for(const seat of ['player','npc'])[...$(seat+'-cards').children].forEach((el,i)=>{el.style.visibility=hand&&i>=dealt[seat]?'hidden':'';});
  const boardViews=Array.from({length:5},(_,i)=>boardCardView(i,{cards:hand?.board??null,dealt:boardDealt,revealed:shownBoard}));
  $('board').innerHTML=boardViews.map(view=>cardMarkup(view.card,{back:view.back,best:!!view.card&&best.includes(view.card)})).join('');
  [...$('board').children].forEach((el,i)=>{el.style.visibility=boardViews[i].visible?'':'hidden';});
  potView.render(hand,hand?.config||session?.config||config,{deferSettlement:!settlementReleased});
  if(!hand){$('game').dataset.npcState='';$('pot-label').textContent='POT';$('pot-value').textContent='0';$('pot-event').textContent='';}
  $('pot-value').classList.toggle('compact-amount',$('pot-value').textContent.length>6);
  $('leave-button').disabled=!session||active||busy;
  $('reset-demo').disabled=active||busy;
  updateVisibleCards();
  const winRate=$('player-win-rate');
  const readyForEquity=active&&dealt.player===2&&shownBoard===hand.board.length;
  const revealedEquity=hand?.result?.reason==='showdown'&&shownReveal>0;
  if(!readyForEquity&&!revealedEquity)renderWinRate(winRate);
  if(hand){
    const key=`${hand.handNumber}:${hand.street}:${hand.board.join('')}`;
    if(!active&&!revealedEquity){$('equity').textContent=hand.result.reason==='showdown'?'Made-hand cards are highlighted. Kickers still break ties.':'This hand ended before showdown.';$('equity').title='';}
    else if(readyForEquity&&equityCache!==key){equityCache=key;renderWinRate(winRate);const captured=hand,capturedStreet=hand.street,capturedBoard=hand.board.join('');setTimeout(()=>{
      if(hand!==captured||hand.status!=='playing'||hand.street!==capturedStreet||hand.board.join('')!==capturedBoard||shownBoard!==hand.board.length||dealt.player!==2)return;
      const visibleHand={holes:{player:hand.holes.player.slice(0,dealt.player)},board:hand.board.slice(0,shownBoard)};
      const e=equityEstimate(visibleHand,{samples:250,seed:hand.handNumber*131+hand.board.length}),rate=`${Math.round(e.equity*100)}%`;
      renderWinRate(winRate,e.equity,{description:`${rate} estimated win rate versus a random unknown hand; ties count as half a win.`,title:'Estimated equity versus a random unknown hand. Ties count as half a win; opponent redraws are not included.'});
      $('equity').textContent=`Equity vs. a random hand: ${pct(e.equity)}`;$('equity').title='Ties count as half a win. 250 samples against a uniformly random unknown hand. No hidden opponent cards or redraw adjustment.';
    },0);}
  }else{$('equity').textContent='Two cards. Your next move.';}
  renderJackpot();renderActions();paintDistribution();
}
function renderActions(){
  const root=$('action-buttons'),h=hud(),playing=hand?.status==='playing',settled=hand?.status==='settled';
  for(const id of ['menu-button','deck-button','balance-button','pot-info-button','jackpot-button','table-rank-button'])$(id).disabled=busy;
  $('game').dataset.busy=String(busy);$('round-cta').hidden=!!hand&&(!settled||busy);$('result-details').hidden=false;$('result-details').disabled=!settled||busy;
  $('round-cta').classList.toggle('has-bet-picker',settled);
  $('round-bet').hidden=!settled;$('round-bet').disabled=busy||!settled;
  const nextBet=session?.config.bigBlind??selectedBet,canContinue=!!session&&Math.min(...Object.values(session.stacks))>=.01;
  $('round-bet-value').textContent=money(nextBet);
  $('round-bet').setAttribute('aria-label',`Change next hand BET, currently ${money(nextBet)}`);
  $('result-bet').innerHTML=`BET <b>${money(nextBet)}</b>`;$('result-bet').disabled=busy||!settled;
  $('sit-button').disabled=busy||(settled&&!canContinue);$('next-hand').disabled=busy||!settled||!canContinue;
  if(!hand){$('sit-button').innerHTML=`${icon('play')}<b>FIGHT</b>`;$('sit-button').onclick=setupBuyin;}
  else if(settled){$('sit-button').innerHTML=`${icon('play')}<b>NEXT HAND</b>`;$('sit-button').onclick=newHand;}
  const actions=h.actions,passive=actions.find(a=>a.type==='call'||a.type==='check'),aggressive=actions.find(a=>a.type==='raise'||a.type==='bet');
  const owed=playing?Math.max(0,hand.currentBet-hand.streetBets.player):0;
  const slots=[{type:'fold',a:actions.find(a=>a.type==='fold')},{type:passive?.type||(owed?'call':'check'),a:passive},{type:aggressive?.type||(playing&&hand.currentBet>0?'raise':'bet'),a:aggressive}];
  root.innerHTML=slots.map(({type,a})=>{
    const sameSlot=pendingPlayerAction&&(pendingPlayerAction.type==='fold'?type==='fold':['call','check'].includes(pendingPlayerAction.type)?['call','check'].includes(type):['bet','raise'].includes(type));
    const choice=busy&&sameSlot?pendingPlayerAction:null;if(choice)type=choice.type;
    const displayed=choice||a;
    const disabled=!a;let hint;
    if(disabled)hint=!hand?'Join the table first':settled?'Hand complete':busy?'Please wait':type==='fold'?'You can check for free':'No further raise this street';
    else hint=type==='fold'?'Fold this hand':a.allIn?'All remaining chips':a.to?`Street total: ${money(a.to)}`:type==='check'?'No chips required':'Add chips to the pot';
    const foldLoss=type==='fold'&&(a||choice)?h.playerCommitted:null;
    if(foldLoss!==null)hint=`Forfeit ${money(foldLoss)} chips already committed this hand; no additional chips charged`;
    const chip='<img class="action-cost-chip" src="assets/chip-face-v24.svg" alt="" aria-hidden="true">';
    const cost=['call','bet','raise'].includes(type)&&displayed?.amount>0?`${chip}<span>${money(displayed.amount)}</span>`:'';
    const distribution=choice?responseSource?.distribution||[]:a?previewResponse(hand,type).distribution:[];
    const badge=responseBadgeView(distribution,choice?responseDecision||{}:{});
    const name=PLAYER_ACTION_LABELS[type];
    const semantics=displayed?(type==='check'?'; check for free':type==='bet'?'; opens betting this round':''):'';
    const accessible=`${name}${displayed?.amount?' '+money(displayed.amount):''}${semantics}${foldLoss!==null?'; forfeit '+money(foldLoss)+' already committed chips':''}${badge.description?'; '+badge.description:''}`;
    const preview=badge.markup?`<div class="action-response-preview" aria-hidden="true"><span class="action-response-owner">BOSS</span>${badge.markup}</div>`:'';
    return `<div class="action-slot${choice?' chosen-slot':''}" data-action-slot="${type}">${preview}<button class="action ${type} ${type==='fold'?'side-action':type==='call'||type==='check'?'main-action':'side-action'}${choice?' chosen-action':''}" data-action="${type}" ${disabled?'disabled':''} aria-label="${esc(accessible)}" title="${esc(hint)}"><span class="action-face"><span class="action-name">${name}</span></span><b class="action-cost">${cost||'&nbsp;'}</b></button></div>`;
  }).join('');
  root.querySelectorAll('[data-action]').forEach(b=>{b.onclick=()=>playerAct(b.dataset.action);});
  responseFlight.update(activeNpcDistribution||responseSource?.distribution||[],responseDecision||{});
  if(busy||!playing||hand.actor!=='player'){const previews=$('preview-actions');previews.hidden=true;previews.replaceChildren();}
}
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
async function playerAct(type){
  if(busy||hand?.actor!=='player'||hand.status!=='playing')return;
  try{busy=true;phase='YOUR MOVE';lastResponse=null;const chosen=legalActions(hand).find(a=>a.type===type);if(!chosen)throw new Error('This action is not available.');
    const before=hand.board.length;
    pendingPlayerAction={...chosen};responseSource=captureResponseSource(hand,chosen);responseDecision=null;$('game').dataset.chosenAction=type;renderActions();paintDistribution();
    setTableCue('action',`YOU ${PLAYER_ACTION_LABELS[type]}${chosen.amount?' '+money(chosen.amount):''}`,{seat:'player',detail:chosen.amount?'CHIPS TO THE POT':type==='check'?'NO CHIPS REQUIRED':'END THIS HAND'});
    applyAction(hand,type);phase=hand.board.length===5&&before<4?'ALL-IN · RUNNING THE BOARD':hand.board.length>before?`DEAL ${STREETS[hand.street]}`:hand.status==='settled'?'SETTLING':'CHIPS TO POT';
    paintDistribution();
    if(chosen.amount)setTableCue('contribution',`YOU ${PLAYER_ACTION_LABELS[type]}`,{seat:'player',detail:`${money(chosen.amount)} → POT`});
    // Commit once, then finish the player's chip arrival before presenting the
    // opponent's decision. Re-rendered chosen-slot badges retain this preview.
    await presentHand();
    if(responseSourceMatches(responseSource,hand)){
      phase='OPPONENT RESPONSE';setTableCue('action','OPPONENT RESPONSE',{seat:'npc'});
      await responseFlight.launch($('action-buttons').querySelector(`[data-action-slot="${type}"] > .action-response-preview`),responseSource.distribution);
    }else clearResponseSource();
    if(hand.status==='playing')await delay(reduceMotion?0:350);await continuePlay();
  }catch(error){busy=false;phase='';clearResponseSource();bossAction.clear();setTableCue();$('game').dataset.deciding='false';toast(translateError(error));render();}
}
async function continuePlay(){
  while(hand?.status==='playing'&&hand.actor==='npc'){
    setTableCue();$('game').dataset.activeSeat='npc';
    const source=responseSourceMatches(responseSource,hand)?responseSource:null;
    if(!source)clearResponseSource();
    busy=true;const distribution=getActionDistribution(hand);const selected=sampleDistribution(distribution,hand.rng);const beforeStreet=hand.street;
    const entry={street:beforeStreet,distribution:distribution.map(a=>({...a})),selected:{...selected},roll:selected.roll};
    const hasDraw=distribution.filter(a=>a.probability>0).length>1;
    phase=hasDraw?'OPPONENT DECIDING':'OPPONENT ACTION';$('game').dataset.npcState=hasDraw?'thinking':selected.type;$('game').dataset.deciding=String(hasDraw);
    activeNpcDistribution=distribution;
    responseDecision={phase:hasDraw?'drawing':'result',selected:hasDraw?null:selected.type};
    if(!source)responseFlight.show(distribution,responseDecision);
    renderActions();paintDistribution();
    if(hasDraw){
      const target=responseFlight.target();
      const marker=target?document.createElement('span'):null;
      if(marker){marker.className='action-response-sweep';target.append(marker);}
      setTableCue('action','OPPONENT DECIDING',{seat:'npc'});
      const motion=decisionMotion(hand.config.animationMs,selected.roll,{reducedMotion:reduceMotion}),sweepMs=Math.min(450,motion.duration);
      // Opponent decisions keep their original reading time; other presentation stays at 1.2x.
      if(sweepMs>0){
        if(marker)await effects.animate(marker,[{left:'0%'},{left:'100%',offset:.25},{left:'0%',offset:.5},{left:'100%',offset:.75},{left:`${selected.roll*100}%`}],{duration:sweepMs,easing:'linear',fill:'forwards'},{speed:1});
        else await delay(sweepMs,{speed:1});
      }
      marker?.remove();
      lastResponse=entry;
      responseDecision={phase:'result',selected:selected.type,roll:selected.roll};renderActions();
      setTableCue('action',`OPPONENT ${responseActionLabel(selected.type)}${selected.amount?' '+money(selected.amount):''}`,{seat:'npc'});
      await delay(Math.max(0,motion.duration-sweepMs),{speed:1});
    }else{lastResponse=null;setTableCue('action',`OPPONENT ${responseActionLabel(selected.type)}${selected.amount?' '+money(selected.amount):''}`,{seat:'npc'});await delay(reduceMotion?0:550,{speed:1});}
    const before=hand.board.length,historyStart=hand.history.length;
    applyAction(hand,selected.type);drawLog.push(entry);$('game').dataset.npcState=selected.type;
    // Use only the committed history event. Paid action text starts from the
    // same contribution notification as the actual chips; free actions start now.
    const actionEvent=hand.history.slice(historyStart).find(event=>event.actor==='npc');
    const actionPresentation=bossAction.commit(actionEvent);
    $('game').dataset.deciding='false';paintDistribution();
    if(selected.type==='fold'){await effects.discardCards([...$('npc-cards').children]);$('game').dataset.npcFolded='true';}
    phase=hand.board.length===5&&before<4?'ALL-IN · RUNNING THE BOARD':hand.board.length>before?`DEAL ${STREETS[hand.street]}`:hand.status==='settled'?'SETTLING':'CHIPS TO POT';
    setTableCue(selected.amount?'contribution':'action',`OPPONENT ${responseActionLabel(selected.type)}`,{seat:'npc',detail:selected.amount?`${money(selected.amount)} → POT`:selected.type==='check'?'NO CHIPS REQUIRED':'END THIS HAND'});
    await presentHand({releaseResponse:true});
    await actionPresentation;
    if(hand.status==='playing')await delay(reduceMotion?0:350);
  }
  if(hand?.status==='settled'){
    phase='SETTLING PAYOUT';renderActions();const completed=hand;
    if(!handArchive.some(x=>x.number===hand.handNumber))handArchive.push({number:hand.handNumber,time:new Date().toLocaleTimeString('en-US',{hour12:false}),history:structuredClone(hand.history),draws:structuredClone(drawLog),result:structuredClone(hand.result)});
    setTableCue('payout',hand.result.winner==='player'?'YOU WIN':hand.result.winner==='tie'?'SPLIT POT':'OPPONENT WINS');
    updateExpression(hand.result.winner);
    potView.render(hand,hand.config,{deferSettlement:false});await potView.whenIdle();
    settlementReleased=true;render();
    totalWin.start(hand.result);await totalWin.whenIdle();
    if(hand!==completed)return;
    if(hand.result.player.jackpotAward)setTableCue('bonus','JACKPOT BONUS',{seat:'player',detail:`+${money(hand.result.player.jackpotAward)} TO YOUR CHIPS`});
    await delay(reduceMotion?0:1000);
    const refresh=syncOpponentBankroll(session);
    const archived=handArchive.find(item=>item.number===hand.handNumber);if(archived)archived.opponentRefresh={...refresh};
    setTableCue('refresh','OPPONENT READY',{seat:'npc',detail:`CHIPS MATCH YOURS · ${money(refresh.after)}`});
    renderBankrolls({refreshNpc:true});
    if($('npc-asset-panel'))await effects.animate($('npc-asset-panel'),[{filter:'brightness(1)'},{filter:'brightness(1.5)',offset:.4},{filter:'brightness(1)'}],{duration:850,easing:'ease-out'});
    busy=false;phase='';setTableCue();render();
    if(hand.result.player.profit<0)effects.play('loss');
  }else{busy=false;phase='';render();}
}
function showJackpotWin(){
 renderJackpotWin(document,hand.result);show('jackpot-win-dialog');
}
function showResult(){
  if(!hand?.result||busy)return;document.querySelectorAll('dialog[open]').forEach(d=>{if(d.id!=='result-dialog')d.close();});const r=hand.result;const p=r.player;
  $('result-kicker').textContent=`HAND ${String(hand.handNumber).padStart(2,'0')} / ${r.reason==='fold'?'FOLD':'SHOWDOWN'}`;
  $('result-dialog').dataset.outcome=p.profit>0?'win':r.winner==='tie'?'tie':r.winner==='player'?'returned':'loss';
  $('result-title').textContent=r.winner==='player'?(p.profit>0?'YOU WIN':'POT RETURNED'):r.winner==='tie'?'SPLIT POT':'OPPONENT WINS';
  $('result-reason').textContent=r.reason==='fold'?`${r.winner==='player'?'Opponent':'You'} folded. The pot is settled.`:`Best five · ${handName(r.evaluations.player)} vs. ${handName(r.evaluations.npc)}`;
  $('result-profit').textContent=`${p.profit>0?'+':''}${money(p.profit)}`;$('result-profit').classList.toggle('negative',p.profit<0);
  $('result-award-value').textContent=money(p.totalReturn);$('result-award-value').dataset.amount=String(p.totalReturn);$('result-award-value').classList.toggle('compact',money(p.totalReturn).length>7);
  $('result-overview').innerHTML=[[icon('chip'),'TOTAL BET',p.totalContribution],[icon('wallet'),'BALANCE',p.stackAfter],...(p.jackpotAward>0?[[icon('crown'),'JACKPOT',p.jackpotAward]]:[])].map(([visual,label,value])=>`<div>${visual}<small>${label}</small><b>${money(value)}</b></div>`).join('');
  document.querySelector('.result-accounting').open=false;
  document.querySelector('.result-hand-details').open=false;
  $('result-hands').innerHTML=['player','npc'].map(seat=>{const evaluation=r.evaluations[seat],concealed=seat==='npc'&&r.reason==='fold';return `<div><span>${seat==='player'?'You':'Opponent'}</span><div class="result-best5">${(evaluation?.best5||hand.holes[seat]).map(c=>cardMarkup(c,{back:concealed})).join('')}</div><b>${concealed?'Not shown':evaluation?handName(evaluation):'No showdown'}</b><small>${evaluation?'BEST FIVE':r.reason==='fold'?'FOLD':''}</small></div>`;}).join('');
  const rows=[['Total bet','totalContribution'],['Uncalled refund','refund'],['Matched wager','matchedWager'],['Gross pot share','gross'],[`Pot fee ${pct(1-hand.config.targetRtp)}`,'fee'],['Pot return','netReturn'],['Jackpot bonus','jackpotAward'],['Total return','totalReturn'],['Net profit','profit'],['Closing balance','stackAfter']];
  $('settlement').innerHTML=(r.jackpot?`<div class="result-jp">${icon('crown')}${tierNames[r.jackpot.tier]} <b>+${money(r.jackpot.award)}</b></div>`:'')+'<div class="ledger-head"><span>Chip details</span><span>You</span><span>Opponent</span></div>'+rows.map(([label,key])=>`<div class="ledger-row ${key==='profit'?'total':''}"><span>${label}</span><span>${money(r.player[key])}</span><span>${money(r.npc[key])}</span></div>`).join('');
  $('result-note').textContent=`Opponent chips now match yours: ${money(session.stacks.player)}. This demo refresh is separate from the payout.`;
  $('next-hand').innerHTML=`${icon('play')}NEXT HAND`;show('result-dialog');
  if(!reduceMotion&&p.profit>0)effects.animate($('result-award-value'),[{transform:'scale(.65)',filter:'brightness(2.4)'},{transform:'scale(1.1)',filter:'brightness(1.3)',offset:.65},{transform:'scale(1)',filter:'brightness(1)'}],{duration:1100,easing:'cubic-bezier(.2,.9,.3,1)'});
}
function renderHistory(){
  function steps(rows,draws){let html='';for(const street of Object.keys(STREETS)){const group=rows.filter(x=>x.street===street);if(!group.length)continue;html+=`<div class="history-header">${STREETS[street]}</div>`;
    for(const a of group){if(a.type==='reveal'){html+=`<div class="history-row"><span>Deal ${STREETS[street]}</span><em>${(a.cards||[]).map(cardText).join(' ')}</em></div>`;continue;}html+=`<div class="history-row"><span>${a.actor==='player'?'You':'Opponent'} · ${LABELS[a.type]||esc(a.type)}</span><em>${a.amount?`+${money(a.amount)}`:'—'}</em></div>`;}
    for(const d of draws.filter(x=>x.street===street))html+=`<div class="history-row"><small>Opponent action odds: ${d.distribution.map(x=>`${LABELS[x.type]} ${pct(x.probability)}`).join(' / ')}<br>Result: ${LABELS[d.selected.type]}</small></div>`;}return html;}
  let html=hand?.status==='playing'?`<details class="history-card" open><summary><span>Hand ${String(hand.handNumber).padStart(2,'0')}<small>Playing · ${STREETS[hand.street]}</small></span><b>Unsettled</b></summary>${steps(hand.history,drawLog)}</details>`:'';
  for(const item of handArchive.slice(-20).reverse()){const r=item.result;html+=`<details class="history-card"><summary><span>Hand ${String(item.number).padStart(2,'0')} · ${r.reason==='fold'?'FOLD':'SHOWDOWN'}<small>${item.time} · ${r.winner==='player'?'You win':r.winner==='tie'?'Tie':'Opponent wins'}</small></span><b class="${r.player.profit<0?'negative':''}">${signed(r.player.profit)}</b></summary><p>Bet ${money(r.player.totalContribution)} / Refund ${money(r.player.refund)} / Pot return ${money(r.player.netReturn)}<br>Jackpot +${money(r.player.jackpotAward)} / Closing balance ${money(r.player.stackAfter)}</p>${item.opponentRefresh?`<p>Opponent demo chips refreshed: ${money(item.opponentRefresh.before)} → ${money(item.opponentRefresh.after)}<br>Separate from this hand’s payout.</p>`:''}${steps(item.history,item.draws)}</details>`;}
  $('history-content').innerHTML=html?`<p class="muted">${handArchive.length} hands completed · Latest 20 shown<br>Values show net profit per hand. Tap for actions and payouts.</p>${html}`:'<div class="history-empty"><b>No hands yet</b>Complete your first hand to start this table history.</div>';
}
window.addEventListener('storage',e=>{if(e.key===CONFIG_KEY)toast('Settings saved. Rejoin the table to apply them.');});
window.addEventListener('error',e=>{toast(translateError(e.error||e.message));});
render();
setTableCue();
setupBuyin();

