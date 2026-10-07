import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession,startHand,legalActions,applyAction,getActionDistribution,stepNpc,previewResponse} from './legacy-engine.mjs';
import {responseBadges,responseBadgeView,captureResponseSource,responseSourceMatches,isCertainResponse} from '../src/action-response-view.mjs';

test('certainty uses actual complete odds and aggregates only the same behavior, never rounded labels', () => {
  for (const type of ['fold','check','call','bet','raise']) {
    assert.equal(isCertainResponse([{type,probability:1},{type:'other',probability:0}]), true);
  }
  assert.equal(isCertainResponse([{type:'raise',probability:.5},{type:'raise',probability:.35},{type:'raise',probability:.15}]), true);
  assert.equal(isCertainResponse([{type:'call',probability:.999999},{type:'fold',probability:.000001}]), false);
  assert.equal(isCertainResponse([{type:'call',probability:.999999}]), false);
  assert.equal(isCertainResponse([{type:'call',probability:.4}]), false);
  assert.equal(isCertainResponse([{type:'call',probability:1},{type:'fold',probability:NaN}]), false);
  assert.equal(isCertainResponse([{type:'call',probability:1.1},{type:'fold',probability:-.1}]), false);
  assert.equal(isCertainResponse([]), false);
});

test('badges preserve raw FOLD/RAISE probabilities and tiny positives without displaying CALL or rescaling', () => {
  const distribution=Object.freeze([{type:'fold',probability:.0004},{type:'call',probability:.7996},{type:'raise',probability:.2}].map(Object.freeze));
  assert.deepEqual(responseBadges(distribution),[
    {type:'fold',probability:.0004,label:'<0.1%'},{type:'raise',probability:.2,label:'20.0%'}
  ]);
  const view=responseBadgeView(distribution,{phase:'result',selected:'call'});
  assert.ok(view.markup.includes('&lt;0.1%'));
  assert.ok(view.markup.includes('data-probability="0.2"'));
  assert.ok(!view.markup.includes('CALL')&&!view.description.includes('CALL'));
  assert.ok(!view.markup.includes('is-selected'),'an omitted CALL result cannot highlight another outcome');
  assert.ok(responseBadgeView(distribution,{phase:'result',selected:'raise'}).markup.includes('is-selected" data-response="raise"'));
});

test('mixed FOLD/CALL and CHECK/BET keep only their raw fold/aggressive outcomes', () => {
  assert.deepEqual(responseBadges([{type:'fold',probability:.3},{type:'call',probability:.7}]),[{type:'fold',probability:.3,label:'30.0%'}]);
  const betting=Object.freeze([{type:'check',probability:.6},{type:'bet',probability:.4}].map(Object.freeze));
  assert.deepEqual(responseBadges(betting),[{type:'bet',probability:.4,label:'40.0%'}]);
  const view=responseBadgeView(betting,{phase:'result',selected:'bet'});
  assert.match(view.markup,/is-selected" data-response="bet" data-probability="0.4"/);
  assert.match(view.markup,/>BET<\/span>/);
  assert.doesNotMatch(view.markup,/>RAISE<|>CHECK<|>CALL</);
  assert.equal(view.description,'opponent BET 40.0%');
  for(const distribution of [[], [{type:'fold',probability:0},{type:'call',probability:NaN}]]) {
    assert.deepEqual(responseBadgeView(distribution),{markup:'',description:''});
  }
});

test('sole responses include passive CALL and retain original types, probability and selection', () => {
  for(const type of ['fold','call','check','bet','raise']) {
    const distribution=Object.freeze([{type,probability:1},{type:'fold',probability:0}].map(Object.freeze));
    const label=type.toUpperCase();
    assert.deepEqual(responseBadges(distribution),[{type,probability:1,label:'100%'}]);
    const view=responseBadgeView(distribution,{phase:'result',selected:type});
    assert.ok(view.markup.includes(`is-selected" data-response="${type}" data-probability="1"`));
    assert.ok(view.markup.includes(`>${label}</span>`));
    assert.equal(view.description,`opponent ${label} 100%`);
  }
  assert.deepEqual(responseBadges([{type:'call',probability:.4}]),[{type:'call',probability:.4,label:'40.0%'}],
    'a sole positive value is never silently normalized to 100%');
});

test('button previews aggregate three raise sizes as one public action without changing individual edges', () => {
  const distribution=Object.freeze([{type:'fold',probability:.05},{type:'call',probability:.25},
    {type:'raise',id:'raise:half',probability:.35},{type:'raise',id:'raise:pot',probability:.245},
    {type:'raise',id:'raise:allin',probability:.105}].map(Object.freeze));
  const before=JSON.stringify(distribution),badges=responseBadges(distribution);
  assert.equal(badges.length,2);assert.equal(badges[1].type,'raise');assert.equal(badges[1].label,'70.0%');
  assert.ok(Math.abs(badges[1].probability-.7)<1e-12);
  assert.equal(JSON.stringify(distribution),before);
});

test('sized player action previews retain the selected id and do not substitute the first raise option', () => {
  const hand=startHand(createSession({outcome:{mode:'fixed-holdem'},smallBlind:10,bigBlind:20,buyIn:1000,
    boss:{mode:'fixed',profileId:'maniac'}},101));
  const action=legalActions(hand).find(item=>item.sizeKey==='pot');
  const before=JSON.stringify(hand),rng=hand.rng.state(),source=captureResponseSource(hand,action);
  assert.ok(source);assert.equal(source.action.id,action.id);assert.equal(source.action.amount,action.amount);
  assert.equal(JSON.stringify(hand),before);assert.equal(hand.rng.state(),rng);
  applyAction(hand,action);
  assert.equal(responseSourceMatches(source,hand),true);assert.deepEqual(source.distribution,getActionDistribution(hand));
});

test('a guaranteed CALL source does not mutate RNG, while CHECK still changes street', () => {
  const config={bigBlind:100,betSize:{preflop:100,flop:200,turn:400,river:400},
    boss:{mode:'legacy'},npc:{fold:0,call:1,raise:0,check:1,bet:0,strengthInfluence:0,priceInfluence:0}};
  const make=()=>{const hand=startHand(createSession(config,22,{firstSmallBlind:'random'}));assert.equal(stepNpc(hand).selected.type,'call');return hand;};
  const hand=make(),control=make(),before=JSON.stringify(hand),rng=hand.rng.state();
  assert.equal(hand.actor,'player');
  assert.deepEqual(previewResponse(hand,'check').distribution,[]);
  assert.equal(captureResponseSource(hand,{type:'check',amount:0}),null);
  const source=captureResponseSource(hand,legalActions(hand).find(a=>a.type==='raise'));
  assert.ok(source);
  assert.deepEqual(responseBadges(source.distribution),[{type:'call',probability:1,label:'100%'}]);
  assert.equal(JSON.stringify(hand),before);assert.equal(hand.rng.state(),rng);
  applyAction(hand,'raise');applyAction(control,'raise');
  assert.equal(responseSourceMatches(source,hand),true);
  assert.deepEqual(source.distribution,getActionDistribution(hand));
  assert.deepEqual(stepNpc(hand),stepNpc(control));
  assert.equal(JSON.stringify(hand),JSON.stringify(control),'preview adds no game action, chip movement or RNG draw');
  assert.equal(responseSourceMatches(source,hand),false,'the old source cannot cross the street');
});

test('capturing a player choice does not mutate the hand/RNG and matches only its immediate same-street NPC response', () => {
  const hand=startHand(createSession({},101));
  const before=JSON.stringify(hand),rng=hand.rng.state();
  const action=legalActions(hand).find(item=>item.type==='raise');
  const source=captureResponseSource(hand,action);
  assert.ok(source);assert.equal(JSON.stringify(hand),before);assert.equal(hand.rng.state(),rng);
  assert.equal(responseSourceMatches(source,hand),false);
  applyAction(hand,action.type);
  assert.equal(responseSourceMatches(source,hand),true);
  assert.deepEqual(source.distribution,getActionDistribution(hand));
  const other=startHand(createSession({},101));
  applyAction(other,'raise');
  assert.equal(responseSourceMatches(source,other),false,'equal hand numbers cannot cross sessions');
  applyAction(hand,'call');
  assert.equal(responseSourceMatches(source,hand),false,'a new street cannot reuse the preceding action button');
});

test('an opening NPC turn and actions with no visible same-street response never borrow a player button', () => {
  const npcFirst=startHand(createSession({},22,{firstSmallBlind:'npc'}));
  assert.equal(npcFirst.actor,'npc');
  assert.equal(captureResponseSource(npcFirst,{type:'raise'}),null);
  assert.equal(responseSourceMatches(null,npcFirst),false);
  const hand=startHand(createSession({},23));
  assert.equal(captureResponseSource(hand,legalActions(hand).find(item=>item.type==='fold')),null);
  applyAction(hand,'call');applyAction(hand,'check');
  // Player SB acts second after the flop: a check then closes this street.
  applyAction(hand,'check');
  assert.equal(hand.actor,'player');
  assert.equal(captureResponseSource(hand,legalActions(hand).find(item=>item.type==='check')),null);
});
