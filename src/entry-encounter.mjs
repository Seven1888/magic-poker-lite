import {createSession} from './engine.mjs?v=35';
import {selectBossProfile} from './boss-profiles.mjs?v=35';

/** Reserve the entry seed and public identity without dealing or charging chips.
 * This isolated session mirrors the opening blind draw before the boss draw.
 * FIGHT uses the same seed in the real session; its RNG stream is untouched.
 */
export function createEntryEncounter(config, seed) {
 const preview = createSession(config, seed, {firstSmallBlind:'random'});
 const {profile} = selectBossProfile(preview.rng, null, preview.config.boss);
 return Object.freeze({seed, bossProfile:profile});
}

/** Read the next public identity from an isolated copy of the current stream. */
export function previewNextEncounter(session) {
 const hand = session?.activeHand;
 if (!hand || hand.session !== session || hand.handNumber !== session.handNumber
   || hand.status !== 'settled' || !hand.result) {
  throw new Error('The next BOSS can be previewed only after this hand has settled.');
 }
 const {profile} = selectBossProfile(session.rng.clone(), session.lastBossProfileId, session.config.boss);
 return Object.freeze({bossProfile:profile});
}
