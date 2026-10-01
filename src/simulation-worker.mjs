import {simulate} from './engine.mjs';
self.onmessage=event=>{
  if(event.data?.type!=='run')return;
  const {config,hands,seed,policies}=event.data;
  try{const reports=[];for(let i=0;i<policies.length;i++){
    const report=simulate(config,{hands,seed,policy:policies[i],onProgress:p=>self.postMessage({type:'progress',completed:i*hands+p.completed,total:hands*policies.length,policy:policies[i]})});
    reports.push(report);self.postMessage({type:'partial',report});
  }self.postMessage({type:'result',reports});}catch(error){self.postMessage({type:'error',message:error.message});}
};
