/** Standard Hold'em analysis only needs the player's known cards. */
export function bossRangeContext({playerHole}) {
 return {playerHole:[...playerHole]};
}
