/** English presentation text. Engine values and saved configuration remain unchanged. */
export const GAME_LABELS=Object.freeze({fold:'FOLD',check:'CHECK',call:'CALL',bet:'BET',raise:'RAISE',smallBlind:'SMALL BLIND',bigBlind:'BIG BLIND'});
export const GAME_STREETS=Object.freeze({preflop:'PREFLOP',flop:'FLOP',turn:'TURN',river:'RIVER'});
const HAND_NAMES=['High Card','Pair','Two Pair','Three of a Kind','Straight','Flush','Full House','Four of a Kind','Straight Flush'];
export const handName=evaluation=>evaluation?.royal?'Royal Flush':HAND_NAMES[evaluation?.category]||'Your Hand';
const ERROR_TEXT=[
 [/未能建立完整結果樹|完整結果樹超過/,'This hand could not be prepared. No chips were charged. Please try again or check the settings.'],
 [/BET 不屬於三個正式水池桶/,'Choose a supported BET level.'],
 [/資產不足/,'Not enough chips. Select a lower BET.'],
 [/其中一方籌碼不足/,'A stack is empty. Select BET to enter a new table.'],
 [/目前牌局尚未結束/,'Finish the current hand first.'],
 [/指定手牌必須留空或填兩張/,'Leave the starting hand empty or enter exactly two cards.'],
 [/不可.*重複/,'Cards must be unique. Check both starting hands.'],
 [/無效牌張/,'Invalid card. Use a rank and suit, such as As or Th.'],
 [/評估需要/,'Hand evaluation requires five to seven cards.'],
 [/起手牌必須/,'A starting hand must contain two cards.'],
 [/目前不能執行|此動作目前無法/,'This action is not available right now.'],
 [/目前不是電腦行動/,'It is not the opponent’s turn.'],
 [/無效的行動機率|行動機率總和/,'Invalid action probabilities. Check the table settings.'],
 [/下注輪未正常終止/,'The betting round could not finish. Reset the demo to try again.'],
 [/jackpotEnabled/,'Jackpot must be enabled or disabled.'],
 [/未知模擬策略/,'Unknown player strategy.'],
 [/未知座位/,'Unknown seat.'],
 [/隨機數必須/,'Invalid random sample.'],
];
export function translateError(error){
 const message=String(error?.message??error??'');
 const match=ERROR_TEXT.find(([pattern])=>pattern.test(message));
 return match?match[1]:/[\u3400-\u9fff]/u.test(message)?'Unable to complete this action. Check the settings and try again.':message||'Unable to complete this action.';
}
