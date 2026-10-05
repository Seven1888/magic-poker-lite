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
