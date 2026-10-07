import {makeDeck,normalizeCard,evaluateBest,compareRanks} from './poker.mjs?v=54';
import {handName} from './game-text.mjs?v=54';

/** Public showdown information only. No hand, hidden-card, deck or RNG input. */
export function getShowdownView({playerHole,visibleBoard,revealedNpcHole=[]}={}) {
  if(!Array.isArray(visibleBoard)) throw new TypeError('visibleBoard must be an array.');
  if(visibleBoard.length<5) return null;
  if(visibleBoard.length!==5) throw new RangeError('Showdown requires exactly five visible board cards.');
  if(!Array.isArray(playerHole)||playerHole.length!==2) throw new RangeError('playerHole must contain two visible cards.');
  if(!Array.isArray(revealedNpcHole)||revealedNpcHole.length>2) throw new RangeError('reveal zero, one or two opponent cards.');
  const player=playerHole.map(normalizeCard),board=visibleBoard.map(normalizeCard),npc=revealedNpcHole.map(normalizeCard);
  const visible=[...player,...board,...npc];
  if(new Set(visible).size!==visible.length) throw new Error('Visible cards must be unique.');
  if(!npc.length) return null;
  const playerEvaluation=evaluateBest([...player,...board]);
  const npcEvaluation=evaluateBest([...npc,...board]);
  // One revealed card leaves 44 equally possible second cards. Do not condition
  // this public estimate on the actual hidden card or on the redraw mechanism.
  const possibilities=npc.length===1
    ? makeDeck().filter(card=>!visible.includes(card)).map(card=>[...npc,card])
    : [npc];
  let wins=0,ties=0,losses=0;
  for(const holes of possibilities) {
    const comparison=compareRanks(playerEvaluation.rank,evaluateBest([...holes,...board]).rank);
    if(comparison>0) wins++;
    else if(comparison===0) ties++;
    else losses++;
  }
  const outcomes=possibilities.length;
  return {revealedCount:npc.length,npcEvaluation,npcHandName:handName(npcEvaluation),
    npcBest5:[...npcEvaluation.best5],equity:(wins+ties/2)/outcomes,wins,ties,losses,outcomes};
}
