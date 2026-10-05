const ENGLISH = Object.freeze({
 caller: ['CALLER', 'STUBBORN'], maniac: ['MANIAC', 'WILD DOG'],
 sniper: ['SNIPER', 'COLD KILLER'], trapper: ['TRAPPER', 'FOX']
});
export const BOSS_SCENE_ASSETS = Object.freeze({
 caller: {neutral:'assets/duel-scene-v34-table-neutral.png',smile:'assets/duel-scene-v34-table-smile.png',frown:'assets/duel-scene-v34-table-frown.png'},
 maniac: {neutral:'assets/duel-scene-v35-maniac-neutral.png',smile:'assets/duel-scene-v35-maniac-smile.png',frown:'assets/duel-scene-v35-maniac-frown.png'},
 sniper: {neutral:'assets/duel-scene-v35-sniper-neutral.png',smile:'assets/duel-scene-v35-sniper-smile.png',frown:'assets/duel-scene-v35-sniper-frown.png'},
 trapper: {neutral:'assets/duel-scene-v35-trapper-neutral.png',smile:'assets/duel-scene-v35-trapper-smile.png',frown:'assets/duel-scene-v35-trapper-frown.png'}
});
const preloaded = new Set();

/** Identity is public; the private strength band never enters this view. */
export function renderBossIdentity(hand, root = document) {
 const game = root.getElementById('game'); if (!game) return;
 const id = hand?.bossProfile?.id || 'caller', names = ENGLISH[id] || ENGLISH.caller;
 const winner = game.dataset.winner;
 const mood = winner === 'player' ? 'frown' : winner === 'npc' ? 'smile' : 'neutral';
 const asset = BOSS_SCENE_ASSETS[id]?.[mood] || BOSS_SCENE_ASSETS.caller[mood];
 if (!preloaded.has(id) && root.defaultView?.Image) {
  for (const src of Object.values(BOSS_SCENE_ASSETS[id] || BOSS_SCENE_ASSETS.caller)) { const image = new root.defaultView.Image(); image.src = src; }
  preloaded.add(id);
 }
 game.dataset.bossProfile = id;
 if (game.dataset.bossScene !== asset) {
  game.dataset.bossScene = asset;
  const sceneUrl = new URL(asset, root.baseURI || root.defaultView?.location?.href).href;
  game.style.setProperty('--duel-art', `url('${sceneUrl}')`);
  const art = game.querySelector('.scene-art');
  if (art) { art.src = asset; art.alt = `${names[0]} poker opponent seated behind the table`; }
 }
 let identity = root.getElementById('boss-identity');
 if (!identity) { identity = root.createElement('div'); identity.id = 'boss-identity'; identity.className = 'boss-identity'; game.append(identity); }
 identity.hidden = !hand;
 const text = `${names[0]} · ${names[1]}`;
 if (identity.textContent !== text) identity.textContent = text;
 identity.title = text;
}
