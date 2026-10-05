import {evaluateBest,RANKS} from './poker.mjs?v=35';
import {handName} from './game-text.mjs?v=46';

/** Reads only the player's cards and already-revealed board. Never accesses the deck or NPC. */
export function getCurrentHandView(holes=[],board=[]){
 if(holes.length!==2)return {category:0,royal:false,name:'Your Hand',highlighted:[]};
 const visible=[...holes,...board];
 if(board.length<3){
  const byRank=new Map();
  for(const card of visible){
   const group=byRank.get(card[0])||[];group.push(card);byRank.set(card[0],group);
  }
  const groups=[...byRank.values()].sort((a,b)=>b.length-a.length||RANKS.indexOf(b[0][0])-RANKS.indexOf(a[0][0]));
  const category=groups[0].length===4?7:groups[0].length===3?3:groups[0].length===2?(groups[1]?.length===2?2:1):0;
  return {category,royal:false,name:handName({category}),highlighted:visible};
 }
 const evaluation=evaluateBest(visible);
 // The glow includes the complete best five, including every tie-breaking kicker.
 return {category:evaluation.category,royal:evaluation.royal,name:handName(evaluation),highlighted:[...evaluation.best5]};
}
