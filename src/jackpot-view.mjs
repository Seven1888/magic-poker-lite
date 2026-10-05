import {cardMarkup,money} from './shared.mjs?v=45';
const TIER_NAMES={royal:'Royal Flush',straightFlush:'Straight Flush',quads:'Four of a Kind'};
/** Presentation only. Engine settlement has already credited the award exactly once. */
export function renderJackpotWin(root,result){
 const jp=result.jackpot;
 if(!jp||!(jp.award>0))throw new Error('No Jackpot award to display.');
 root.getElementById('jackpot-win-tier').textContent=TIER_NAMES[jp.tier];
 root.getElementById('jackpot-win-amount').textContent=`+${money(jp.award)}`;
 root.getElementById('jackpot-win-cards').innerHTML=result.evaluations.player.best5.map(c=>cardMarkup(c,{best:true})).join('');
}
