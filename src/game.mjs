import {createSession,startHand,legalActions,applyAction,getActionDistribution,sampleDistribution,previewResponse,equityEstimate,holeScore} from './engine.mjs';
import {loadConfig,CONFIG_KEY,money,pct,esc,cardMarkup,cardText} from './shared.mjs';
import {GAME_LABELS as LABELS,GAME_STREETS as STREETS,handName,translateError} from './game-text.mjs';
import {createPotView} from './pot-view.mjs';
import {fitStage} from './stage-fit.mjs';
import {getHudSnapshot} from './hud-state.mjs';
import {createGameEffects} from './game-effects.mjs';
import {renderBetPresets,updateBetSelection,setupEntryFeatures} from './entry-view.mjs';
import {betOptions,minimumAssets,tableConfig} from './entry-model.mjs';
import {icon} from './ui-icons.mjs';
import {JACKPOT_MULTIPLIERS,quoteJackpot} from './jackpot.mjs';
import {renderJackpotWin} from './jackpot-view.mjs';
import {getCurrentHandView} from './hand-view.mjs';
import {decisionMotion} from './decision-motion.mjs';
import {getShowdownView} from './showdown-view.mjs';
const $=id=>document.getElementById(id);
let config=loadConfig(),session=null,hand=null,busy=false,drawLog=[],lastResponse=null,handArchive=[],equityCache='',toastTimer,closedTable=null,phase='';
let selectedBet=config.bigBlind,entryBase=config,betValues=betOptions(config),demoAssets=config.buyIn;
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const potView=createPotView({root:document,reducedMotion:reduceMotion,locale:'en'});
const effects=createGameEffects({root:document,reducedMotion:reduceMotion});
let soundOn=true;
try{soundOn=localStorage.getItem('magic-poker-lite:sound')!=='off';}catch{}
effects.setMuted(!soundOn);$('sound-toggle').checked=soundOn;
document.addEventListener('pointerdown',()=>{effects.unlock();},{once:true});
document.addEventListener('keydown',()=>{effects.unlock();},{once:true});
document.addEventListener('click',e=>{if(e.target.closest('button:not(:disabled)'))effects.play('click');});
fitStage({shell:$('game-shell'),stage:$('game')});
let shownHand=null,shownBoard=0,shownReveal=0,dealt={player:0,npc:0},settlementReleased=false;
let showdownViewCache={key:'',value:null};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3500);}
function show(id){if(!$(id).open)$(id).showModal();}
const hud=()=>getHudSnapshot({session,hand,config,closedTable,busy});
const amount=value=>value===null||value===undefined?'—':money(value);
const signed=value=>value===null?'—':`${value>0?'+':''}${money(value)}`;
const bankroll=()=>session?.stacks.player??closedTable?.playerBalance??demoAssets;
const tierNames={royal:'Royal Flush',straightFlush:'Straight Flush',quads:'Four of a Kind'};
const tierCards={royal:['As','Ks','Qs','Js','Ts'],straightFlush:['9h','8h','7h','6h','5h'],quads:['As','Ah','Ad','Ac','Ks']};
function renderJackpot(){
 const c=hand?.config||session?.config||{...config,bigBlind:selectedBet},enabled=c.jackpotEnabled!==false;
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
 document.querySelector('.workbench-link').insertAdjacentHTML('afterbegin',icon('settings'));
 const reset=document.createElement('button');reset.id='reset-demo';reset.className='text-button wide';reset.textContent='↻ Reset demo chips';reset.onclick=()=>{if(busy||hand?.status==='playing')return;session=null;hand=null;closedTable=null;config=loadConfig();demoAssets=config.buyIn;selectedBet=config.bigBlind;handArchive=[];drawLog=[];lastResponse=null;$('menu-dialog').close();render();setupBuyin();};
 $('menu-dialog').append(reset);
 const rules=document.querySelector('#help-dialog .rules');
 rules.innerHTML=`<li>${icon('chip')}<b>Choose BET · Draw blinds</b><span>Only BIG BLIND posts BET. The other seat starts at 0. First draw: 50/50; seats alternate each hand.</span></li><li>${icon('cards')}<b>2 hole cards + 5 board cards</b><div class="rule-card-flow"><span>2</span><i>＋</i><span>3</span><i>→</i><span>1</span><i>→</i><span>1</span></div><span>PREFLOP → FLOP → TURN → RIVER</span></li><li>${icon('call')}<b>Your move · Their response</b><span>Fold, call or raise. Check when no bet is due. One raise per street.</span></li><li>${icon('crown')}<b>Best 5 of 7</b><span>A fold ends the hand. Otherwise, compare at showdown. Special hands earn a Jackpot bonus.</span></li>`;
 const fees=document.createElement('details');fees.className='rules-details';fees.innerHTML='<summary>Hand highlights, turn order & pot fee ⓘ</summary><p>Gold edges mark your complete best five, including kickers. Before five cards are visible, all your visible cards glow. Red edges mark the opponent’s best five using only their revealed hole cards and the board. Shared cards can carry both gold and red edges.</p><p>CHECK costs 0. If the opponent has not acted, they may still CHECK or BET in the same street. Two CHECKs close the street; after the next card is dealt, the new street begins.</p><p>This demo uses a single forced big blind. SB acts first preflop and posts 0; BB posts BET and acts first after the flop. Choosing a BET level does not charge chips. Both seats follow the same rule. The bar shows opponent action odds, not your win chance.</p><p id="help-fee"></p>';
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
$('sound-toggle').onchange=e=>{soundOn=e.target.checked;effects.setMuted(!soundOn);if(soundOn){effects.unlock();effects.play('click');}try{localStorage.setItem('magic-poker-lite:sound',soundOn?'on':'off');}catch{}};
document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{$('menu-dialog').close();if(b.dataset.open==='help-dialog')openHelp();else show(b.dataset.open);});
$('menu-history').onclick=()=>{$('menu-dialog').close();openHistory();};
$('menu-balance').onclick=()=>{$('menu-dialog').close();$('balance-button').click();};
$('menu-ranks').onclick=()=>{$('menu-dialog').close();openRanks();};
$('table-rank-button').onclick=()=>openRanks();
$('deck-button').onclick=()=>{const h=hud();$('deck-remaining-detail').textContent=h.deckRemaining;$('dealt-count').textContent=`${h.dealtCards} cards`;show('deck-dialog');};
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
  entryBase=loadConfig();betValues=betOptions(entryBase);if(!betValues.includes(selectedBet))selectedBet=entryBase.bigBlind;
  $('bet-presets').innerHTML=renderBetPresets(betValues);
  $('bet-presets').querySelectorAll('[data-bet]').forEach(b=>b.onclick=()=>{selectedBet=Number(b.dataset.bet);updateEntry();});
  updateEntry();show('buyin-dialog');
}
function updateEntry(){
 const available=bankroll(),minimum=minimumAssets(entryBase,selectedBet),index=betValues.indexOf(selectedBet);
 updateBetSelection(selectedBet);$('entry-assets').textContent=money(available);$('entry-minimum').textContent=money(minimum);
 $('entry-blinds').textContent='ONLY BB POSTS';
 const jackpotOn=entryBase.jackpotEnabled!==false;
 $('entry-jp-award').textContent=jackpotOn?money(quoteJackpot('royal',selectedBet).award):'OFF';
 $('entry-jp-label').textContent=jackpotOn?'ROYAL FLUSH · 200× BET':'JACKPOT DISABLED';
 $('entry-jp-caption').innerHTML=jackpotOn?'Special hands at showdown.<br>Highest bonus paid on top of the pot return.':'Jackpot is off for this table.<br>Win the pot with the best hand or a fold.';
 document.querySelector('.feature-jp-tiers').hidden=!jackpotOn;
 $('bet-minus').disabled=index<=0;$('bet-plus').disabled=index===betValues.length-1;
 $('entry-start').disabled=available<minimum||busy;$('buyin-error').textContent=available<minimum?'Not enough chips. Choose a lower BET.':'';
 $('fee-notice').textContent=`Choosing BET does not charge chips. Minimum balance: ${money(minimum)}. Both players start with the same balance. Blinds are first drawn 50/50, then alternate. Only BB automatically posts ${money(selectedBet)}; SB starts at 0 and pays only when calling or raising. Pot fee: ${pct(1-entryBase.targetRtp)}. Uncalled bets are refunded in full. Demo chips only.`;
}
$('bet-minus').onclick=()=>{selectedBet=betValues[Math.max(0,betValues.indexOf(selectedBet)-1)];updateEntry();};
$('bet-plus').onclick=()=>{selectedBet=betValues[Math.min(betValues.length-1,betValues.indexOf(selectedBet)+1)];updateEntry();};
$('buyin-form').onsubmit=async e=>{e.preventDefault();if(busy)return;
  try{
   config=tableConfig(entryBase,selectedBet,bankroll());const seed=crypto.getRandomValues(new Uint32Array(1))[0];
   session=createSession(config,seed,{firstSmallBlind:'random'});hand=null;handArchive=[];closedTable=null;lastResponse=null;drawLog=[];
   $('buyin-dialog').close();busy=true;render();await showBlindDraw();busy=false;await newHand();
  }catch(error){busy=false;phase='';$('blind-dialog').close();$('buyin-error').textContent=translateError(error);show('buyin-dialog');render();}
};
async function showBlindDraw(){
 const sb=session.firstSmallBlind;
 $('blind-dialog').dataset.draw='drawing';$('blind-name').textContent='DRAWING YOUR POSITION';$('blind-result').textContent='';$('draw-player').textContent='?';delete $('draw-player').dataset.blind;show('blind-dialog');
 await delay(reduceMotion?0:1200);
 const small=sb==='player';$('draw-player').textContent=small?'SB':'BB';$('draw-player').dataset.blind=small?'small':'big';
 $('blind-dialog').dataset.draw='revealed';$('blind-name').textContent=small?'SMALL BLIND':'BIG BLIND';
 $('blind-result').textContent=small?'NO AUTO BET · YOU ACT FIRST':`POST ${money(config.bigBlind)} · OPPONENT ACTS FIRST`;
 effects.play('chip');await delay(reduceMotion?150:1800);$('blind-dialog').close();
}
function leaveTable(){
  if(busy||hand?.status==='playing'){toast('Finish this hand first.');return;}
  if(!session)return;const balance=session.stacks.player;closedTable={playerBalance:balance,npcBalance:session.stacks.npc,buyIn:session.config.buyIn,settledTableProfit:balance-session.config.buyIn,jackpotAwards:session.jackpotAwards};session=null;hand=null;lastResponse=null;drawLog=[];equityCache='';render();toast(`Left the table. Balance kept: ${money(balance)}.`);
}
async function newHand(){
  if(busy)return;
  $('result-dialog').close();
  if(session&&Math.min(...Object.values(session.stacks))<.01){setupBuyin();return;}
  try{busy=true;phase='DEALING';hand=startHand(session);drawLog=[];lastResponse=null;equityCache='';paintDistribution([]);setTableCue('contribution','BLINDS');await presentHand();await continuePlay();}catch(error){busy=false;phase='';setTableCue();toast(translateError(error));render();setupBuyin();}
}
$('next-hand').onclick=newHand;
const visibleStreet=()=>shownBoard>=5?'river':shownBoard===4?'turn':shownBoard>0?'flop':'preflop';
function setTableCue(mode='',label=''){
  $('game').dataset.presentation=mode;const cue=$('table-cue');cue.hidden=!mode;
  cue.innerHTML=mode?`${icon(mode==='payout'||mode==='contribution'?'chip':'cards')}<strong>${esc(label)}</strong>`:'';
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
    panel.hidden=true;document.querySelectorAll('.card.npc-best').forEach(el=>el.classList.remove('npc-best'));showdownViewCache={key:'',value:null};return null;
  }
  const playerHole=hand.holes.player.slice(0,dealt.player),visibleBoard=hand.board.slice(0,shownBoard),revealedNpcHole=hand.holes.npc.slice(0,shownReveal);
  const key=[...playerHole,...visibleBoard,'|',...revealedNpcHole].join('');
  if(showdownViewCache.key!==key){
    const view=getShowdownView({playerHole,visibleBoard,revealedNpcHole});
    showdownViewCache={key,value:view};
    if(!view){panel.hidden=true;return null;}
    $('npc-hand-type').textContent=view.npcHandName;
    $('npc-reveal-count').textContent=`${view.revealedCount} / 2 REVEALED`;
    panel.setAttribute('aria-label',`Opponent ${view.npcHandName}. Best five from revealed cards. ${view.revealedCount} of 2 hole cards revealed.`);
  }
  const view=showdownViewCache.value;if(!view){panel.hidden=true;return null;}
  panel.hidden=false;
  document.querySelector('.response-panel').hidden=true;
  for(const [id,cards] of [['npc-cards',revealedNpcHole],['board',visibleBoard]])[...$(id).children].forEach((el,index)=>el.classList.toggle('npc-best',!!cards[index]&&view.npcBest5.includes(cards[index])));
  const rate=`${Math.round(view.equity*100)}%`,winRate=$('player-win-rate');
  winRate.textContent=rate;winRate.hidden=false;
  winRate.setAttribute('aria-label',`${rate} equity using ${view.revealedCount} revealed opponent cards; ties count as half a win.`);
  $('equity').textContent=`Equity after ${view.revealedCount} revealed opponent cards: ${pct(view.equity)}`;
  $('equity').title=view.revealedCount===1?'Exact enumeration of all 44 possible remaining opponent cards. Hidden cards are not used. Ties count as half a win.':'Both hands are revealed. Win 100%, tie 50%, loss 0%.';
  return view;
}
function updateExpression(winner=''){
  $('game').dataset.winner=winner;
  document.querySelector('.scene-art').alt=winner==='player'?'Cartoon monster holding its cards with a disappointed, downturned mouth after losing':winner==='npc'?'Cartoon monster holding its cards and smiling after winning':'Red and purple cartoon monster holding two poker cards with vacant eyes';
}
function updateVisibleCards(){
  const holes=hand?.holes.player.slice(0,dealt.player)||[],board=hand?.board.slice(0,shownBoard)||[];
  const view=getCurrentHandView(holes,board),best=view.highlighted;
  for(const [id,cards] of [['player-cards',holes],['board',board]])[...$(id).children].forEach((el,i)=>el.classList.toggle('best',!!cards[i]&&best.includes(cards[i])));
  $('hand-type').textContent=view.name;$('table-hand-type').textContent=view.name;
  $('table-rank-button').style.backgroundImage=`url('assets/legacy/type${view.royal?10:view.category+1}-base.png')`;
  $('table-rank-button').setAttribute('aria-label',`Current hand: ${view.name}. View hand rankings.`);
  $('deck-count').textContent=hand?52-dealt.player-dealt.npc-shownBoard:52;
  $('game').dataset.street=hand?visibleStreet():'';
  const current=Object.keys(STREETS).indexOf(visibleStreet());
  document.querySelectorAll('#streets [data-street]').forEach((el,i)=>{el.classList.toggle('current',!!hand&&i===current);el.classList.toggle('past',!!hand&&i<current);});
  updateShowdownView();
}
/** Play only changes already committed by the engine, in visible table order. */
async function presentHand(){
  render();await potView.whenIdle();
  if(dealt.player<2||dealt.npc<2){
    setTableCue('hole-deal','DEALING');
    const order=[];
    for(let i=0;i<2;i++)for(const seat of [hand.bigBlind,hand.smallBlind])order.push({seat,index:i,element:$(seat+'-cards').children[i]});
    await effects.deal(order.map(x=>x.element),{onLand:async(element,index)=>{
      const item=order[index];
      if(item.seat==='player')await effects.reveal([element],{holdMs:35,onReveal:()=>{replaceCardFace(element,hand.holes.player[item.index]);dealt.player=item.index+1;updateVisibleCards();}});
      else{dealt.npc=item.index+1;updateVisibleCards();}
    }});
    render();await delay(reduceMotion?0:350);
  }
  // An all-in runout still shows FLOP, TURN and RIVER separately.
  while(shownBoard<hand.board.length){
    const end=Math.min(hand.board.length,shownBoard<3?3:shownBoard+1),start=shownBoard;
    setTableCue('board-deal',end<=3?'FLOP':end===4?'TURN':'RIVER');
    const cards=[];
    for(let i=start;i<end;i++){const el=$('board').children[i];replaceCardFace(el,null,{back:true});el.style.visibility='hidden';cards.push(el);}
    await effects.deal(cards,{onLand:(element,index)=>effects.reveal([element],{holdMs:35,onReveal:()=>{
      const i=start+index;replaceCardFace(element,hand.board[i]);shownBoard=i+1;updateVisibleCards();
    }})});
    render();await delay(reduceMotion?0:700);
  }
  if(hand.result?.reason==='showdown'&&shownReveal<2){
    setTableCue('showdown','SHOWDOWN');
    await delay(reduceMotion?0:450);
    const start=shownReveal;
    await effects.reveal([...$('npc-cards').children].slice(start),{holdMs:900,onReveal:(element,index)=>{
      replaceCardFace(element,hand.holes.npc[start+index]);shownReveal=start+index+1;
      updateShowdownView();
    }});
    await delay(reduceMotion?0:700);
  }
  if(hand.status==='playing')setTableCue();
  render();
}
function render(){
  if(hand!==shownHand){shownHand=hand;shownBoard=0;shownReveal=0;dealt={player:0,npc:0};settlementReleased=false;}
  const active=hand?.status==='playing';const handView=getCurrentHandView(hand?.holes.player.slice(0,dealt.player)||[],hand?.board.slice(0,shownBoard)||[]);const best=handView.highlighted;
  const h=hud();$('game').dataset.busy=String(busy);
  $('game').dataset.state=hand?.result&&!settlementReleased?'playing':hand?.status||'idle';$('game').dataset.actor=busy?'':hand?.actor||'';$('game').dataset.street=hand?visibleStreet():'';updateExpression(settlementReleased?hand?.result?.winner||'':'');
  $('player-stack').textContent=money(hand?.result&&!settlementReleased?hand.stacksBefore.player-hand.contributions.player:bankroll());
  $('balance-label').textContent='BALANCE';
  $('total-bet').textContent=money(h.playerCommitted);
  $('bring-in-label').textContent=`${session||hand?'TABLE BUY-IN':closedTable?'LAST BUY-IN':'STARTING CHIPS'} ${money(h.buyIn)}`;
  for(const seat of ['player','npc'])$(seat+'-blind').hidden=true;
  $('npc-cards').innerHTML=(hand?.holes.npc||[null,null]).map((c,i)=>cardMarkup(c,{back:i>=shownReveal})).join('');
  $('player-cards').innerHTML=(hand?.holes.player||[null,null]).map((c,i)=>cardMarkup(c,{back:!hand||i>=dealt.player,best:i<dealt.player&&best.includes(c)})).join('');
  for(const seat of ['player','npc'])[...$(seat+'-cards').children].forEach((el,i)=>{el.style.visibility=hand&&i>=dealt[seat]?'hidden':'';});
  $('board').innerHTML=Array.from({length:5},(_,i)=>cardMarkup(i<shownBoard?hand?.board[i]:null,{best:i<shownBoard&&best.includes(hand?.board[i])})).join('');
  potView.render(hand,hand?.config||session?.config||config,{deferSettlement:!settlementReleased});
  if(!hand){$('game').dataset.npcState='';$('pot-label').textContent='POT';$('pot-value').textContent='0';$('pot-event').textContent='';}
  $('pot-value').classList.toggle('compact-amount',$('pot-value').textContent.length>6);
  $('leave-button').disabled=!session||active||busy;
  $('reset-demo').disabled=active||busy;
  updateVisibleCards();
  const winRate=$('player-win-rate');
  const readyForEquity=active&&dealt.player===2&&shownBoard===hand.board.length;
  const revealedEquity=hand?.result?.reason==='showdown'&&shownReveal>0;
  if(!readyForEquity&&!revealedEquity){winRate.hidden=true;winRate.textContent='';}
  if(hand){
    $('hand-type').textContent=handView.name;
    const key=`${hand.handNumber}:${hand.street}:${hand.board.join('')}`;
    if(!active&&!revealedEquity){$('equity').textContent=hand.result.reason==='showdown'?'Made-hand cards are highlighted. Kickers still break ties.':'This hand ended before showdown.';$('equity').title='';}
    else if(readyForEquity&&equityCache!==key){equityCache=key;winRate.hidden=true;winRate.textContent='';const captured=hand,capturedStreet=hand.street,capturedBoard=hand.board.join('');setTimeout(()=>{
      if(hand!==captured||hand.status!=='playing'||hand.street!==capturedStreet||hand.board.join('')!==capturedBoard||shownBoard!==hand.board.length||dealt.player!==2)return;
      const e=equityEstimate(hand,{samples:250,seed:hand.handNumber*131+hand.board.length}),rate=`${Math.round(e.equity*100)}%`;
      winRate.textContent=rate;winRate.setAttribute('aria-label',`${rate} estimated win rate versus a random unknown hand; ties count as half a win.`);winRate.hidden=false;
      $('equity').textContent=`Equity vs. a random hand: ${pct(e.equity)}`;$('equity').title='Ties count as half a win. 250 samples against a uniformly random unknown hand. No hidden opponent cards or redraw adjustment.';
    },0);}
  }else{$('hand-type').textContent=handView.name;$('equity').textContent='Two cards. Your next move.';}
  $('table-hand-type').textContent=handView.name;
  const plaque=handView.royal?10:handView.category+1;
  $('table-rank-button').style.backgroundImage=`url('assets/legacy/type${plaque}-base.png')`;
  $('table-rank-button').setAttribute('aria-label',`Current hand: ${$('table-hand-type').textContent}. View hand rankings.`);
  renderJackpot();renderActions();if(!busy)renderDefaultResponse();
}
function renderActions(){
  const root=$('action-buttons'),h=hud(),playing=hand?.status==='playing',settled=hand?.status==='settled';
  for(const id of ['menu-button','deck-button','balance-button','pot-info-button','jackpot-button','table-rank-button'])$(id).disabled=busy;
  $('game').dataset.busy=String(busy);$('round-cta').hidden=!!hand&&(!settled||busy);$('result-details').hidden=false;$('result-details').disabled=!settled||busy;
  if(!hand){$('sit-button').innerHTML=`${icon('play')}<b>PLAY</b>`;$('sit-button').onclick=setupBuyin;}
  else if(settled){$('sit-button').innerHTML=`${icon('play')}<b>${Math.min(...Object.values(session.stacks))<.01?'CHOOSE BET':'NEXT HAND'}</b>`;$('sit-button').onclick=newHand;}
  const actions=h.actions,passive=actions.find(a=>a.type==='call'||a.type==='check'),aggressive=actions.find(a=>a.type==='raise'||a.type==='bet');
  const owed=playing?Math.max(0,hand.currentBet-hand.streetBets.player):0;
  const slots=[{type:'fold',a:actions.find(a=>a.type==='fold')},{type:passive?.type||(owed?'call':'check'),a:passive},{type:aggressive?.type||(playing&&hand.currentBet>0?'raise':'bet'),a:aggressive}];
  root.innerHTML=slots.map(({type,a})=>{
    const disabled=!a;let hint;
    if(disabled)hint=!hand?'Join the table first':settled?'Hand complete':busy?'Please wait':type==='fold'?'You can check for free':'No further raise this street';
    else hint=type==='fold'?'Fold this hand':a.allIn?'All remaining chips':a.to?`Street total: ${money(a.to)}`:type==='check'?'No chips required':'Add chips to the pot';
    const cost=a?.amount?`+${money(a.amount)}`:type==='check'&&!disabled?'0':'';
    return `<button class="action ${type} ${type==='fold'?'side-action':type==='call'||type==='check'?'main-action':'side-action'}" data-action="${type}" ${disabled?'disabled':''} aria-label="${LABELS[type]}${a?.amount?' '+money(a.amount):''}" title="${esc(hint)}"><span class="action-face">${icon(type)}<span class="action-name">${LABELS[type]}</span></span><b class="action-cost">${cost||'&nbsp;'}</b></button>`;
  }).join('');
  root.querySelectorAll('[data-action]').forEach(b=>{b.onclick=()=>playerAct(b.dataset.action);});
  if(busy||!playing||hand.actor!=='player'){const previews=$('preview-actions');previews.hidden=true;previews.replaceChildren();}
}
function renderPreviewActions(){
  const actions=!busy&&hand?.status==='playing'&&hand.actor==='player'?legalActions(hand):[];
  const options=actions.map(action=>({action,distribution:previewResponse(hand,action.type).distribution.filter(outcome=>outcome.probability>0)})).filter(option=>option.distribution.length>=2);
  if(!options.length){paintDistribution([]);return;}
  const root=$('preview-actions'),panel=document.querySelector('.response-panel');
  panel.hidden=false;panel.dataset.mode='preview';delete panel.dataset.action;root.hidden=false;
  $('response-title').textContent='YOUR MOVE → OPPONENT';$('response-status').textContent='ODDS';$('response-caption').textContent='';
  $('probability-track').replaceChildren();$('probability-legend').replaceChildren();
  root.innerHTML=options.map(({action,distribution})=>{
    const probabilityLabel=outcome=>outcome.probability<.001?'&lt;0.1%':pct(outcome.probability);
    const accessible=distribution.map(outcome=>`${LABELS[outcome.type]} ${outcome.probability<.001?'less than 0.1%':pct(outcome.probability)}`).join(', ');
    return `<div class="preview-option" data-player-action="${action.type}" aria-label="After your ${LABELS[action.type]}: opponent ${accessible}"><div class="preview-option-title"><strong>${LABELS[action.type]}</strong></div><div class="preview-distribution"><div class="preview-outcomes">${distribution.map(outcome=>`<span class="preview-outcome ${outcome.type}" style="--probability:${outcome.probability*100}%"><span>${LABELS[outcome.type]}</span><b>${probabilityLabel(outcome)}</b></span>`).join('')}</div></div></div>`;
  }).join('');
}
function paintDistribution(distribution,{title='OPPONENT ODDS',status='ACTION ODDS',caption='',selected=null,roll=null,mode='preview',resultAction=null}={}){
  const panel=document.querySelector('.response-panel'),previews=$('preview-actions');
  previews.hidden=true;previews.replaceChildren();
  delete panel.dataset.action;
  if(!distribution?.length){
    panel.hidden=true;panel.dataset.mode='hidden';
    $('response-title').textContent='';$('response-status').textContent='';$('response-caption').textContent='';
    $('probability-track').replaceChildren();$('probability-legend').replaceChildren();return;
  }
  panel.hidden=false;panel.dataset.mode=mode;
  $('response-title').textContent=title;$('response-status').textContent=status;$('response-caption').textContent=caption;
  if(resultAction){panel.dataset.action=resultAction.type;$('response-title').innerHTML=`<span class="decision-result-action">${icon(resultAction.type)}<strong>${LABELS[resultAction.type]}</strong>${resultAction.amount?`<b>+${money(resultAction.amount)}</b>`:''}</span>`;}
  $('probability-track').innerHTML=distribution.map(x=>`<div class="prob-segment ${x.type}" style="width:${x.probability*100}%" title="${LABELS[x.type]} ${pct(x.probability)}"></div>`).join('');
  if(roll!==null)$('probability-track').insertAdjacentHTML('beforeend',`<div class="draw-marker" style="left:${roll*100}%"></div>`);
  $('probability-legend').innerHTML=distribution.map(x=>`<span class="legend-item ${x.type}${selected===x.type?' selected':''}">${icon(x.type)}${LABELS[x.type]} <b>${pct(x.probability)}</b></span>`).join('');
}
function renderDefaultResponse(){
  if(busy)return;
  if(hand?.status==='playing'&&hand.actor==='player'){renderPreviewActions();return;}
  paintDistribution([]);
}
async function playerAct(type){
  if(busy||hand?.actor!=='player'||hand.status!=='playing')return;
  try{busy=true;phase='YOUR MOVE';lastResponse=null;const chosen=legalActions(hand).find(a=>a.type===type);if(!chosen)throw new Error('This action is not available.');
    const before=hand.board.length;
    if(type==='check'||type==='fold'){renderActions();paintDistribution([]);setTableCue('action',`YOU ${LABELS[type]}`);await delay(reduceMotion?0:550);}
    applyAction(hand,type);if(chosen.amount)effects.play('chip');phase=hand.board.length===5&&before<4?'ALL-IN · RUNNING THE BOARD':hand.board.length>before?`DEAL ${STREETS[hand.street]}`:hand.status==='settled'?'SETTLING':'CHIPS TO POT';
    paintDistribution([],{title:`YOU ${LABELS[type]}${chosen.amount?' +'+money(chosen.amount):''}`,status:phase});
    if(chosen.amount)setTableCue('contribution',`YOU ${LABELS[type]}`);
    await presentHand();if(hand.status==='playing')await delay(reduceMotion?0:350);await continuePlay();
  }catch(error){busy=false;phase='';setTableCue();$('game').dataset.deciding='false';toast(translateError(error));render();}
}
async function continuePlay(){
  while(hand?.status==='playing'&&hand.actor==='npc'){
    busy=true;const distribution=getActionDistribution(hand);const selected=sampleDistribution(distribution,hand.rng);const beforeStreet=hand.street;
    const entry={street:beforeStreet,distribution:distribution.map(a=>({...a})),selected:{...selected},roll:selected.roll};
    const hasDraw=distribution.filter(a=>a.probability>0).length>1;
    phase=hasDraw?'OPPONENT DECIDING':'OPPONENT ACTION';$('game').dataset.npcState=hasDraw?'thinking':selected.type;$('game').dataset.deciding=String(hasDraw);
    renderActions();
    if(hasDraw){
      paintDistribution(distribution,{title:'OPPONENT DECIDING…',status:STREETS[hand.street],caption:'',mode:'drawing'});
      const marker=document.createElement('div');marker.className='draw-marker';$('probability-track').append(marker);
      const motion=decisionMotion(hand.config.animationMs,selected.roll,{reducedMotion:reduceMotion}),sweepMs=Math.min(450,motion.duration);
      if(sweepMs>0){const animation=marker.animate(motion.keyframes,{duration:sweepMs,easing:'linear',fill:'forwards'});await animation.finished.catch(()=>{});}
      lastResponse=entry;
      paintDistribution(distribution,{status:'RESULT',selected:selected.type,roll:selected.roll,mode:'result',resultAction:selected});
      await delay(Math.max(0,motion.duration-sweepMs));
    }else{lastResponse=null;paintDistribution([]);setTableCue('action',`OPPONENT ${LABELS[selected.type]}`);await delay(reduceMotion?0:550);}
    const before=hand.board.length;
    applyAction(hand,selected.type);drawLog.push(entry);if(selected.amount)effects.play('chip');$('game').dataset.npcState=selected.type;
    $('game').dataset.deciding='false';$('decision-emblem').innerHTML='<span class="decision-orbit"></span><i>♠</i><span class="thinking-dots"><i></i><i></i><i></i></span>';paintDistribution([]);
    phase=hand.board.length===5&&before<4?'ALL-IN · RUNNING THE BOARD':hand.board.length>before?`DEAL ${STREETS[hand.street]}`:hand.status==='settled'?'SETTLING':'CHIPS TO POT';
    setTableCue(selected.amount?'contribution':'action',`OPPONENT ${LABELS[selected.type]}`);
    await presentHand();
    if(hand.status==='playing')await delay(reduceMotion?0:350);
  }
  if(hand?.status==='settled'){
    phase='SETTLING PAYOUT';renderActions();const completed=hand;
    if(!handArchive.some(x=>x.number===hand.handNumber))handArchive.push({number:hand.handNumber,time:new Date().toLocaleTimeString('en-US',{hour12:false}),history:structuredClone(hand.history),draws:structuredClone(drawLog),result:structuredClone(hand.result)});
    setTableCue('payout',hand.result.winner==='player'?'YOU WIN':hand.result.winner==='tie'?'SPLIT POT':'OPPONENT WINS');
    updateExpression(hand.result.winner);
    potView.render(hand,hand.config,{deferSettlement:false});await potView.whenIdle();
    settlementReleased=true;render();await delay(reduceMotion?0:1000);busy=false;phase='';setTableCue();render();
    effects.play(hand.result.player.profit>0?'win':'loss');if(hand===completed){if(hand.result.jackpot)showJackpotWin();else showResult();}
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
  $('result-note').textContent='Matched wager = chips matched by your opponent. Uncalled chips are returned in full, with no fee.';
  $('next-hand').innerHTML=`${icon('play')}${Math.min(...Object.values(session.stacks))<.01?'CHOOSE BET':'NEXT HAND'}`;show('result-dialog');
  if(!reduceMotion&&p.profit>0)$('result-award-value').animate([{transform:'scale(.65)',filter:'brightness(2.4)'},{transform:'scale(1.1)',filter:'brightness(1.3)',offset:.65},{transform:'scale(1)',filter:'brightness(1)'}],{duration:1100,easing:'cubic-bezier(.2,.9,.3,1)'});
}
function renderHistory(){
  function steps(rows,draws){let html='';for(const street of Object.keys(STREETS)){const group=rows.filter(x=>x.street===street);if(!group.length)continue;html+=`<div class="history-header">${STREETS[street]}</div>`;
    for(const a of group){if(a.type==='reveal'){html+=`<div class="history-row"><span>Deal ${STREETS[street]}</span><em>${(a.cards||[]).map(cardText).join(' ')}</em></div>`;continue;}html+=`<div class="history-row"><span>${a.actor==='player'?'You':'Opponent'} · ${LABELS[a.type]||esc(a.type)}</span><em>${a.amount?`+${money(a.amount)}`:'—'}</em></div>`;}
    for(const d of draws.filter(x=>x.street===street))html+=`<div class="history-row"><small>Opponent action odds: ${d.distribution.map(x=>`${LABELS[x.type]} ${pct(x.probability)}`).join(' / ')}<br>Result: ${LABELS[d.selected.type]}</small></div>`;}return html;}
  let html=hand?.status==='playing'?`<details class="history-card" open><summary><span>Hand ${String(hand.handNumber).padStart(2,'0')}<small>Playing · ${STREETS[hand.street]}</small></span><b>Unsettled</b></summary>${steps(hand.history,drawLog)}</details>`:'';
  for(const item of handArchive.slice(-20).reverse()){const r=item.result;html+=`<details class="history-card"><summary><span>Hand ${String(item.number).padStart(2,'0')} · ${r.reason==='fold'?'FOLD':'SHOWDOWN'}<small>${item.time} · ${r.winner==='player'?'You win':r.winner==='tie'?'Tie':'Opponent wins'}</small></span><b class="${r.player.profit<0?'negative':''}">${signed(r.player.profit)}</b></summary><p>Bet ${money(r.player.totalContribution)} / Refund ${money(r.player.refund)} / Pot return ${money(r.player.netReturn)}<br>Jackpot +${money(r.player.jackpotAward)} / Closing balance ${money(r.player.stackAfter)}</p>${steps(item.history,item.draws)}</details>`;}
  $('history-content').innerHTML=html?`<p class="muted">${handArchive.length} hands completed · Latest 20 shown<br>Values show net profit per hand. Tap for actions and payouts.</p>${html}`:'<div class="history-empty"><b>No hands yet</b>Complete your first hand to start this table history.</div>';
}
window.addEventListener('storage',e=>{if(e.key===CONFIG_KEY)toast('Settings saved. Rejoin the table to apply them.');});
window.addEventListener('error',e=>{toast(translateError(e.error||e.message));});
render();
setupBuyin();

