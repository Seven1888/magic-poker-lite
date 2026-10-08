/** Each calculation sees only visible cards; superseded work is cancelled. */
export function createHoldemEquityController({render,workerFactory=()=>new Worker(new URL('./holdem-equity-worker.mjs?v=60',import.meta.url),{type:'module'})}) {
 let request=0,key='',worker=null,result=null,pending=false,error=null;
 const paint=()=>render({visible:!!key,calculating:pending,result,error});
 function reset(){request++;key='';worker?.terminate();worker=null;result=null;pending=false;error=null;paint();}
 function update({visible,playerHole,board=[]}){
  if(!visible){if(key)reset();else paint();return;}
  const nextKey=JSON.stringify([playerHole,board]);
  if(nextKey===key){paint();return;}
  worker?.terminate();worker=null;key=nextKey;result=null;pending=true;error=null;
  const current=++request;
  paint();
  try{
   const task=workerFactory();worker=task;
   task.onmessage=({data})=>{
    if(current!==request||data.request!==current)return;
    result=data.result??null;error=data.error??null;pending=false;
    task.terminate();worker=null;paint();
   };
   task.onerror=()=>{
    if(current!==request)return;
    result=null;error='calculation-unavailable';pending=false;task.terminate();worker=null;paint();
   };
   task.postMessage({request:current,playerHole:[...playerHole],board:[...board]});
  }catch{worker?.terminate();worker=null;result=null;error='calculation-unavailable';pending=false;paint();}
 }
 return {update,reset};
}
