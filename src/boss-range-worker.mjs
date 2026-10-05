import {createBossHandRange} from './boss-hand-range.mjs?v=43';

let currentEpoch=null,tracker=null;
self.onmessage=({data})=>{
 const {epoch,request,context,board}=data;
 try {
  if(currentEpoch!==epoch){tracker=createBossHandRange(context);currentEpoch=epoch;}
  self.postMessage({epoch,request,result:tracker.update({board})});
 } catch {
  self.postMessage({epoch,request,result:{status:'unavailable',unavailable:'calculation-unavailable',distribution:[]}});
 }
};
