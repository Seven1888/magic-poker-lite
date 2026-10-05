import test from 'node:test';
import assert from 'node:assert/strict';
import {BOSS_SCENE_ASSETS,preloadBossScenes,renderBossIdentity,waitForBossScene} from '../src/boss-scene-view.mjs';
import {createSession,startHand,applyAction,syncOpponentBankroll} from '../src/engine.mjs';

function fixture() {
 const elements = new Map(), images = [], timers = new Map(); let serial = 0;
 const node = () => ({dataset:{},style:{setProperty(name,value){this[name]=value;}},hidden:false,
  setAttribute(){},append(child){elements.set(child.id,child);},remove(){elements.delete(this.id);}});
 const game = node(), art = node(); game.querySelector = ()=>art; elements.set('game',game);
 const root = {baseURI:'https://example.test/game/',getElementById:id=>elements.get(id),createElement:node,
  defaultView:{Image:class {
   constructor(){images.push(this);this.complete=false;this.naturalWidth=0;}
   decode(){return Promise.resolve();}
   load(){this.complete=true;this.naturalWidth=400;this.onload?.();}
   fail(){this.onerror?.();}
  },setTimeout(callback,delay){const id=++serial;timers.set(id,{callback,delay});return id;},clearTimeout(id){timers.delete(id);}}};
 const flush = async()=>{for(let i=0;i<4;i++)await Promise.resolve();};
 return {root,game,art,images,timers,elements,flush,
  image:(id,mood='neutral')=>images.findLast(image=>image.src===BOSS_SCENE_ASSETS[id][mood]),
  get transition(){return elements.get('boss-scene-transition');}};
}

test('preloading warms all four neutral bosses once per document without drawing an encounter',async()=>{
 const f=fixture(), original=Math.random; Math.random=()=>{throw new Error('Presentation must not use RNG');};
 try {
  const done=preloadBossScenes(f.root);preloadBossScenes(f.root);
  assert.deepEqual(f.images.map(image=>image.src),Object.values(BOSS_SCENE_ASSETS).map(scenes=>scenes.neutral));
  assert.equal(f.game.dataset.bossProfile,undefined);
  f.images.forEach(image=>image.load());assert.deepEqual(await done,[true,true,true,true]);
  const other=fixture();preloadBossScenes(other.root);assert.equal(other.images.length,4);
 } finally {Math.random=original;}
});

test('the committed next hand switches immediately to neutral, hides the name, and does not mutate RNG or private cards',async()=>{
 const f=fixture(), session=createSession({},72), previous=startHand(session);
 renderBossIdentity(previous,f.root);
 applyAction(previous,'fold');syncOpponentBankroll(session);
 f.game.dataset.winner='npc';renderBossIdentity(previous,f.root);
 assert.match(f.art.src,/-smile\.png$/);
 const next=startHand(session), rng=session.rng.state(), before=JSON.stringify(next);
 const oldName={id:'boss-identity',remove(){f.elements.delete(this.id);}};f.elements.set(oldName.id,oldName);
 const publicOnly=new Proxy(next,{get(target,key){
  if(key!=='bossProfile')throw new Error(`Scene tried to inspect ${String(key)}`);
  return target[key];
 }});
 renderBossIdentity(publicOnly,f.root);
 assert.notEqual(next.bossProfile.id,previous.bossProfile.id);
 assert.equal(f.game.dataset.bossProfile,next.bossProfile.id);
 assert.equal(f.game.dataset.winner,'');
 assert.equal(f.art.src,BOSS_SCENE_ASSETS[next.bossProfile.id].neutral);
 assert.equal(f.game.dataset.bossSceneState,'loading');assert.equal(f.transition.hidden,false);
 assert.equal(f.transition.textContent,'BOSS INCOMING');assert.equal(f.elements.has('boss-identity'),false);
 const ready=waitForBossScene(publicOnly,f.root);
 f.image(next.bossProfile.id).load();assert.equal(await ready,true);await f.flush();
 assert.equal(f.game.dataset.bossSceneState,'ready');assert.equal(f.transition.hidden,true);
 assert.equal(session.rng.state(),rng);assert.equal(JSON.stringify(next),before);
});

test('cached scenes switch without a wait; same-profile first entry still shows its loading transition',async()=>{
 const f=fixture();renderBossIdentity(null,f.root);assert.equal(f.transition.hidden,true);
 const caller={bossProfile:{id:'caller'}};renderBossIdentity(caller,f.root);
 assert.equal(f.transition.hidden,false,'entry to the existing neutral asset must refresh visibility');
 f.image('sniper').load();await f.flush();
 const next={bossProfile:{id:'sniper'}};renderBossIdentity(next,f.root);
 assert.equal(f.art.src,BOSS_SCENE_ASSETS.sniper.neutral);assert.equal(f.transition.hidden,true);
 assert.equal(await waitForBossScene(next,f.root),true);assert.equal(f.timers.size,0);
 const count=f.images.length;renderBossIdentity(next,f.root);assert.equal(f.images.length,count);
});

test('late previous-scene loads and wait timeouts cannot replace the current opponent',async()=>{
 const f=fixture(), caller={bossProfile:{id:'caller'}}, maniac={bossProfile:{id:'maniac'}};
 renderBossIdentity(caller,f.root);const oldWait=waitForBossScene(caller,f.root);
 renderBossIdentity(maniac,f.root);
 [...f.timers.values()][0].callback();assert.equal(await oldWait,false);
 assert.equal(f.game.dataset.bossSceneState,'loading');
 f.image('caller').load();await f.flush();
 assert.equal(f.game.dataset.bossProfile,'maniac');assert.equal(f.game.dataset.bossSceneState,'loading');
 f.image('maniac').load();await f.flush();assert.equal(f.game.dataset.bossSceneState,'ready');
});

test('a stalled or failed portrait has a bounded opening wait and a late success recovers the scene',async()=>{
 const f=fixture(), hand={bossProfile:{id:'trapper'}};renderBossIdentity(hand,f.root);
 const done=waitForBossScene(hand,f.root), timer=[...f.timers.values()][0];
 assert.equal(timer.delay,4000);timer.callback();assert.equal(await done,false);
 assert.equal(f.game.dataset.bossSceneState,'unavailable');assert.equal(f.transition.textContent,'BOSS');
 f.image('trapper').load();await f.flush();assert.equal(f.game.dataset.bossSceneState,'ready');assert.equal(f.transition.hidden,true);
 const next={bossProfile:{id:'sniper'}};renderBossIdentity(next,f.root);
 const failed=waitForBossScene(next,f.root);f.image('sniper').fail();assert.equal(await failed,false);await f.flush();
 assert.equal(f.game.dataset.bossSceneState,'unavailable');assert.equal(f.transition.hidden,false);
 assert.equal(await waitForBossScene(next,f.root),false);
});

test('a failed preload retries when selected, but repeated renders never retry a failed encounter',async()=>{
 const f=fixture();preloadBossScenes(f.root);
 f.image('sniper').fail();await f.flush();
 const hand={bossProfile:{id:'sniper'}};renderBossIdentity(hand,f.root);
 const requests=()=>f.images.filter(image=>image.src===BOSS_SCENE_ASSETS.sniper.neutral).length;
 assert.equal(requests(),2,'selection retries the failed background request');
 assert.equal(f.game.dataset.bossSceneState,'loading');
 const retry=f.image('sniper');
 for(let i=0;i<3;i++)renderBossIdentity(hand,f.root);
 assert.equal(requests(),2,'a pending retry is reused');
 retry.fail();await f.flush();
 for(let i=0;i<3;i++)renderBossIdentity(hand,f.root);
 assert.equal(requests(),2,'the selected retry may fail without a render-driven request loop');
 assert.equal(f.game.dataset.bossSceneState,'unavailable');
 assert.equal(await waitForBossScene(hand,f.root),false);
});

test('a new encounter can recover the same failed asset and stale failure callbacks cannot cover it',async()=>{
 const f=fixture(), first={bossProfile:{id:'caller'}};
 renderBossIdentity(first,f.root);f.image('caller').fail();
 // Enter again before the old failure continuation runs, including fixed-mode repeats.
 const next={bossProfile:{id:'caller'}};renderBossIdentity(next,f.root);
 assert.equal(f.images.filter(image=>image.src===BOSS_SCENE_ASSETS.caller.neutral).length,2);
 await f.flush();
 assert.equal(f.game.dataset.bossSceneState,'loading');assert.equal(f.transition.hidden,false);
 const ready=waitForBossScene(next,f.root);f.image('caller').load();
 assert.equal(await ready,true);await f.flush();
 assert.equal(f.game.dataset.bossSceneState,'ready');assert.equal(f.transition.hidden,true);
 const count=f.images.length;
 renderBossIdentity({bossProfile:{id:'caller'}},f.root);
 assert.equal(f.images.length,count,'a successful scene stays cached across encounters');
});
