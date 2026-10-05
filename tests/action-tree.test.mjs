import test from 'node:test';
import assert from 'node:assert/strict';
import {buildActionTree} from '../src/action-tree.mjs';
import {createSession,startHand,legalActions,applyAction,getActionDistribution,evaluateBest} from '../src/engine.mjs';

const near=(actual,expected,tolerance=1e-8)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);
const natural={rerollMode:'unpaired',rerollChance:0,maxRerolls:0,manual:[]};
const config={boss:{mode:'legacy'},deal:{player:natural,npc:natural}};
const passive={fold:0,call:1,raise:0,check:1,bet:0};

test('both blind positions enumerate every legal fixed-deck path, including zero-probability branches, without RNG draws',()=>{
  for(const firstSmallBlind of ['player','npc']){
    const tree=buildActionTree(config,{seed:20261005,firstSmallBlind,policy:'call'});
    assert.equal(tree.complete,true);assert.equal(tree.mode,'fixed-deal-full-action-tree');
    assert.equal(tree.summary.nodes,1312);assert.equal(tree.summary.decisionNodes,562);assert.equal(tree.summary.terminalNodes,750);
    assert.equal(tree.summary.maxDepth,15);
    assert.deepEqual(tree.summary.decisionsByStreet,{preflop:4,flop:18,turn:90,river:450});
    assert.ok(tree.summary.zeroProbabilityEdges>0);
    near(tree.summary.terminalProbabilityMass,1);near(tree.summary.conservationError,0,1e-6);
    assert.equal(tree.meta.rngStateAfterDeal,tree.meta.rngStateAfterTraversal);
    const byId=new Map(tree.nodes.map(node=>[node.id,node]));
    for(const node of tree.nodes){
      assert.deepEqual(node.board,tree.cards.boardRunout.slice(0,node.board.length));
      assert.equal(node.path.length,node.depth);
      if(node.terminal){
        assert.equal(node.edges.length,0);assert.equal(node.result.player.refund+node.result.player.matchedWager,node.result.player.totalContribution);
        continue;
      }
      near(node.edges.reduce((sum,edge)=>sum+edge.probability,0),1);
      for(const edge of node.edges){
        const child=byId.get(edge.childId);assert.equal(child.parentId,node.id);
        near(child.reachProbability,node.reachProbability*edge.probability);
        assert.equal(child.path.at(-1).type,edge.type);
        assert.equal(child.path.at(-1).actor,node.actor);
      }
    }
    // Replay an entire actual route through the independent engine API. The
    // tree's counterfactual branches must not alter this deal or its actions.
    const hand=startHand(createSession(config,20261005,{firstSmallBlind}));let node=byId.get(tree.rootId);
    while(hand.status==='playing'){
      const legal=legalActions(hand);
      assert.deepEqual(node.edges.map(({type,amount,to,allIn})=>({type,amount,to,allIn})),legal.map(({type,amount,to,allIn})=>({type,amount,to,allIn})));
      const dist=getActionDistribution(hand,hand.actor,hand.actor==='player'?'call':'balanced');
      node.edges.forEach((edge,i)=>near(edge.probability,dist[i].probability));
      const selected=legal.find(action=>action.type==='raise'||action.type==='bet')||legal.find(action=>action.type==='call'||action.type==='check');
      node=byId.get(node.edges.find(edge=>edge.type===selected.type).childId);applyAction(hand,selected.type);
    }
    assert.deepEqual(node.result,hand.result);
  }
});

test('weighted outcomes equal the probability-weighted leaves and root action values remain conditional even at zero reach',()=>{
  const tree=buildActionTree({...config,npc:passive},{seed:190,policy:'call'}),leaves=tree.nodes.filter(node=>node.terminal);
  const totals=Object.fromEntries(Object.keys(tree.summary.weighted).map(key=>[key,0]));
  for(const leaf of leaves)for(const key of Object.keys(totals))totals[key]+=leaf.reachProbability*leaf.expected[key];
  for(const key of Object.keys(totals))near(totals[key],tree.summary.weighted[key],1e-6);
  assert.equal(leaves.filter(node=>node.reachProbability>0).length,1,'deterministic passive play follows one leaf, but keeps the full tree');
  near(tree.summary.weighted.winProbability+tree.summary.weighted.tieProbability+tree.summary.weighted.lossProbability,1);
  const fold=tree.rootOptions.find(option=>option.type==='fold');
  assert.equal(fold.probability,0);near(fold.expected.lossProbability,1);near(fold.expected.profit,-5);
  assert.notEqual(tree.summary.weighted.lossProbability,leaves.filter(node=>node.result.winner==='npc').length/leaves.length,'leaf counts are not probabilities');
  near(tree.summary.weighted.totalContribution-tree.summary.weighted.refund,tree.summary.weighted.matchedWager);
  near(tree.summary.weighted.totalReturn-tree.summary.weighted.matchedWager,tree.summary.weighted.profit);
});

test('all-in trees shrink through the shared engine and retain real JP, fee and refund accounting',()=>{
  const manualConfig={minBuyIn:10,maxBuyIn:20,buyIn:20,deal:{player:{manual:['As','Ah']},npc:{manual:['Ks','Kh']}}};
  let seed=1;
  for(;seed<5000;seed++){
    const hand=startHand(createSession(manualConfig,seed));
    if(evaluateBest([...hand.holes.player,...hand.deck.slice(0,5)]).category===7)break;
  }
  assert.ok(seed<5000,'a deterministic quads deal is available for the JP contract');
  const tree=buildActionTree(manualConfig,{seed,policy:'aggressive'});
  assert.ok(tree.summary.nodes<1312);
  const jpLeaves=tree.nodes.filter(node=>node.terminal&&node.result.player.jackpotAward>0);
  assert.ok(jpLeaves.length>0);
  for(const node of jpLeaves){
    const r=node.result;assert.equal(r.reason,'showdown');assert.equal(r.jackpot.tier,'quads');
    near(node.expected.jackpotAward,200);near(node.expected.totalReturn,r.player.netReturn+200);
    near(r.player.stackAfter+r.npc.stackAfter+r.fee,40+200);
  }
  const raised=tree.rootOptions.find(option=>option.type==='raise');
  const afterRaise=tree.nodes.find(node=>node.id===raised.childId);
  const folded=tree.nodes.find(node=>node.id===afterRaise.edges.find(edge=>edge.type==='fold').childId);
  near(folded.result.player.refund,10);near(folded.result.player.matchedWager,10);
  near(folded.result.player.netReturn,19.2);assert.equal(folded.result.player.jackpotAward,0);
});

test('invalid options and state limits fail instead of publishing an incomplete tree; repeated seeds reproduce the full result',()=>{
  assert.throws(()=>buildActionTree(config,{stateLimit:100}),/超過.*未產生截斷結果/);
  assert.throws(()=>buildActionTree(config,{stateLimit:0}),/正整數/);
  assert.throws(()=>buildActionTree(config,{firstSmallBlind:'random'}),/指定/);
  assert.throws(()=>buildActionTree(config,{policy:'clairvoyant'}),/策略/);
  const small={...config,minBuyIn:10,maxBuyIn:10,buyIn:10};
  const before=JSON.stringify(small),first=buildActionTree(small,{seed:'tree-replay'});
  assert.equal(JSON.stringify(small),before);
  assert.deepEqual(buildActionTree(small,{seed:'tree-replay'}),first);
  assert.doesNotThrow(()=>JSON.stringify(first));
});
