import {simulateStudy} from './simulation-study.mjs?v=45';
import {buildActionTree} from './action-tree.mjs?v=45';
import {simulateTreeStudy} from './tree-study.mjs?v=45';
self.onmessage=event=>{
  const {type,config,policies,...settings}=event.data||{};
  try{
   if(type==='tree'){self.postMessage({type:'treeResult',tree:buildActionTree(config,settings)});return;}
   if(type==='treeStudy'){self.postMessage({type:'treeStudyResult',report:simulateTreeStudy(config,{...settings,onProgress:p=>self.postMessage({type:'treeProgress',...p})})});return;}
   if(type!=='run')return;
   if(!Array.isArray(policies)||!policies.length)throw new Error('請選擇玩家策略。');
   const reports=[];for(let i=0;i<policies.length;i++){
    const report=simulateStudy(config,{...settings,policy:policies[i],onProgress:p=>self.postMessage({type:'progress',...p,policy:policies[i],policyIndex:i,policyCount:policies.length})});
    reports.push(report);self.postMessage({type:'partial',report});
  }self.postMessage({type:'result',reports});}catch(error){self.postMessage({type:'error',message:error.message});}
};
