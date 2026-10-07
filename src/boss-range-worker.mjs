import {createBossHandRange} from './boss-hand-range.mjs?v=59';

let currentEpoch=null,currentPlayer='',tracker=null;
self.onmessage=({data})=>{
 const {epoch,request,context,board}=data;
 try {
  const playerKey=JSON.stringify(context?.playerHole);
  if(currentEpoch!==epoch||currentPlayer!==playerKey){
   tracker=createBossHandRange(context);currentEpoch=epoch;currentPlayer=playerKey;
  }
  self.postMessage({epoch,request,result:tracker.update({board})});
 } catch {
  self.postMessage({epoch,request,result:{status:'unavailable',unavailable:'calculation-unavailable',distribution:[]}});
 }
};
