import {createBossHandRange} from './boss-hand-range.mjs?v=41';

let currentEpoch=null,tracker=null;
self.onmessage=({data})=>{
 const {epoch,request,context,board,evidence}=data;
 try {
  if(currentEpoch!==epoch){tracker=createBossHandRange(context);currentEpoch=epoch;}
  self.postMessage({epoch,request,result:tracker.update({board,evidence})});
 } catch {
  self.postMessage({epoch,request,result:{status:'unavailable',unavailable:'calculation-unavailable',distribution:[]}});
 }
};
