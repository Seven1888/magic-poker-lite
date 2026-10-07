/** Async presentation coordinator. Old streets/hands can never publish late results. */
export function createBossRangeController({view,workerFactory=()=>new Worker(new URL('./boss-range-worker.mjs?v=53',import.meta.url),{type:'module'})}) {
 let worker=null,epoch=0,request=0,key='',state={visible:false,busy:false},result=null,pending=false,failed=false;
 function paint(){view.render({...state,calculating:pending,distribution:result?.distribution||[],
  unavailable:failed?'calculation-unavailable':result?.unavailable});}
 function reset(){epoch++;request=0;key='';result=null;pending=false;state={visible:false,busy:false};view.clear();}
 function update({visible,busy,context,board=[]}) {
  state={visible,busy};
  if(!context){paint();return;}
  const nextKey=JSON.stringify(board);
  if(key!==nextKey){
   key=nextKey;result=null;pending=true;request++;
   try {
    if(!worker&&!failed){
     worker=workerFactory();
     worker.onmessage=({data})=>{
      if(data.epoch!==epoch||data.request!==request)return;
      result=data.result;pending=false;paint();
     };
     worker.onerror=()=>{failed=true;pending=false;result=null;worker?.terminate();worker=null;paint();};
    }
    if(worker)worker.postMessage({epoch,request,context,board});
    else pending=false;
   }catch{failed=true;pending=false;worker?.terminate();worker=null;}
  }
  paint();
 }
 return {update,reset,close:()=>view.close()};
}
