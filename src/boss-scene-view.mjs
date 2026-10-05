export const BOSS_SCENE_ASSETS = Object.freeze({
 caller: {neutral:'assets/duel-scene-v34-table-neutral.png',smile:'assets/duel-scene-v34-table-smile.png',frown:'assets/duel-scene-v34-table-frown.png'},
 maniac: {neutral:'assets/duel-scene-v35-maniac-neutral.png',smile:'assets/duel-scene-v35-maniac-smile.png',frown:'assets/duel-scene-v35-maniac-frown.png'},
 sniper: {neutral:'assets/duel-scene-v35-sniper-neutral.png',smile:'assets/duel-scene-v35-sniper-smile.png',frown:'assets/duel-scene-v35-sniper-frown.png'},
 trapper: {neutral:'assets/duel-scene-v35-trapper-neutral.png',smile:'assets/duel-scene-v35-trapper-smile.png',frown:'assets/duel-scene-v35-trapper-frown.png'}
});
const views = new WeakMap();
function viewFor(root) {
 let view = views.get(root);
 if (!view) { view = {images:new Map(),hand:null,asset:null,selectedAssets:new Set()}; views.set(root,view); }
 return view;
}
function loadScene(asset, root, {retryFailed=false} = {}) {
 const images = viewFor(root).images;
 const cached = images.get(asset);
 if (cached && !(retryFailed && cached.failed)) return cached;
 const Image = root.defaultView?.Image;
 if (!Image) {
  const ready = {ready:true,failed:false,promise:Promise.resolve(true)};
  images.set(asset,ready); return ready;
 }
 let finish;
 const record = {image:new Image(),ready:false,failed:false,promise:new Promise(resolve=>{finish=resolve;})};
 images.set(asset,record);
 const complete = ready => {
  if (record.ready || record.failed) return;
  record.ready = ready; record.failed = !ready;
  record.image.onload = record.image.onerror = null;
  finish(ready);
 };
 const decode = () => {
  if (typeof record.image.decode !== 'function') { complete(true); return; }
  record.image.decode().then(()=>complete(true),()=>complete(record.image.naturalWidth>0));
 };
 record.image.onload = decode; record.image.onerror = ()=>complete(false);
 record.image.decoding = 'async'; record.image.src = asset;
 if (record.image.complete && record.image.naturalWidth>0) decode();
 return record;
}

/** Warm every possible next opponent without choosing one or consuming RNG. */
export function preloadBossScenes(root = document) {
 const view = viewFor(root);
 if (!view.neutralPreload) view.neutralPreload = Promise.all(Object.values(BOSS_SCENE_ASSETS).map(scenes=>loadScene(scenes.neutral,root).promise));
 return view.neutralPreload;
}

/** Identity is public; the private strength band never enters this view. */
export function renderBossIdentity(hand, root = document) {
 const game = root.getElementById('game'); if (!game) return;
 const view = viewFor(root);
 const newHand = view.hand !== hand;
 if (newHand) { view.hand = hand; game.dataset.winner = ''; }
 const id = hand?.bossProfile?.id || 'caller';
 if (newHand || view.profileId !== id) {
  view.selectedAssets.clear(); view.timedOutAsset = null; view.profileId = id;
 }
 const scenes = BOSS_SCENE_ASSETS[id] || BOSS_SCENE_ASSETS.caller;
 const winner = game.dataset.winner;
 const mood = winner === 'player' ? 'frown' : winner === 'npc' ? 'smile' : 'neutral';
 const asset = scenes[mood];
 // A failed warm-up may retry when selected. Further renders in this encounter
 // reuse that attempt, so an unavailable image cannot trigger a request loop.
 const retryFailed = !!hand && !view.selectedAssets.has(asset);
 if (hand) view.selectedAssets.add(asset);
 const record = loadScene(asset,root,{retryFailed});
 // Start all neutral portraits at entry; then warm this opponent's expressions.
 preloadBossScenes(root);
 for (const src of Object.values(scenes)) loadScene(src,root);
 game.dataset.bossProfile = id;
 // Names no longer belong on the table, including a node from an earlier render.
 root.getElementById('boss-identity')?.remove();
 if (view.asset === asset && view.record === record) { view.showState?.(); return; }
 view.asset = asset; view.record = record;
 view.timedOutAsset = null;
 game.dataset.bossScene = asset;
 const sceneUrl = new URL(asset, root.baseURI || root.defaultView?.location?.href).href;
 game.style.setProperty('--duel-art', `url('${sceneUrl}')`);
 const art = game.querySelector('.scene-art');
 if (art) { art.src = asset; art.alt = 'Poker opponent seated behind the table'; }
 let transition = root.getElementById('boss-scene-transition');
 if (!transition) {
  transition = root.createElement('div'); transition.id = 'boss-scene-transition';
  transition.className = 'boss-scene-transition'; transition.setAttribute('role','status');
  game.append(transition);
 }
 const showState = () => {
  if (view.asset !== asset || view.record !== record) return; // Ignore old opponents and superseded attempts.
  const state = record.ready ? 'ready' : record.failed || view.timedOutAsset === asset ? 'unavailable' : 'loading';
  game.dataset.bossSceneState = state;
  transition.hidden = !view.hand || state === 'ready';
  transition.textContent = state === 'loading' ? 'BOSS INCOMING' : state === 'unavailable' ? 'BOSS' : '';
 };
 view.showState = showState;
 showState(); record.promise.then(showState);
}

/** Hold the opening deal briefly for its committed portrait; failures cannot lock play. */
export function waitForBossScene(hand, root = document, {timeoutMs = 4000} = {}) {
 const view = viewFor(root), game = root.getElementById('game');
 if (view.hand !== hand || !game) return Promise.resolve(false);
 const asset = view.asset, record = view.images.get(asset);
 if (!record || record.ready || record.failed) return Promise.resolve(!!record?.ready);
 const clock = root.defaultView || globalThis;
 return new Promise(resolve=>{
  const timeout = clock.setTimeout(()=>{
   if (view.hand === hand && view.asset === asset) { view.timedOutAsset = asset; view.showState?.(); }
   resolve(false);
  },timeoutMs);
  record.promise.then(ready=>{clock.clearTimeout(timeout);resolve(ready);});
 });
}
