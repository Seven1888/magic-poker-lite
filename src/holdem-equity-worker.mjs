import {calculateHoldemEquity} from './holdem-equity.mjs?v=59';

self.onmessage=({data})=>{
 const {request,playerHole,board}=data;
 try {
  self.postMessage({request,result:calculateHoldemEquity({playerHole,board})});
 }catch{
  self.postMessage({request,error:'calculation-unavailable'});
 }
};
