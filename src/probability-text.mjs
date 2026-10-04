/** Traditional Chinese text for the probability workbench only. */
export const LAB_LABELS=Object.freeze({fold:'棄牌',check:'過牌',call:'跟注',bet:'下注',raise:'加注',smallBlind:'小盲',bigBlind:'大盲'});
export const LAB_STREETS=Object.freeze({preflop:'翻牌前',flop:'翻牌',turn:'轉牌',river:'河牌'});
export const LAB_POLICIES=Object.freeze({balanced:'平衡',call:'始終跟注',aggressive:'積極',tight:'保守'});
export const LAB_JACKPOTS=Object.freeze({royal:'皇家同花順',straightFlush:'同花順',quads:'四條'});

const nativeErrors=[
  [/JSON\.parse|Unexpected (?:token|end)|Expected (?:property|double-quoted|','|':'|'\}')|(?:not valid|invalid|malformed) JSON|JSON.*(?:parse|unexpected)/i,'JSON 資料格式不正確，請檢查檔案內容後重試。'],
  [/quota|storage.*(?:full|exceed)|NS_ERROR_DOM_QUOTA_REACHED/i,'瀏覽器儲存空間不足，請先匯出設定備份，再清出空間後重試。'],
  [/clipboard|writeText|readText/i,'無法使用剪貼簿，請改用 JSON 匯出。'],
  [/localStorage|sessionStorage|(?:storage|access).*(?:denied|disabled)|(?:denied|disabled).*storage/i,'瀏覽器不允許儲存設定，請檢查網站權限，或先匯出設定備份。'],
  [/worker|模擬程序啟動失敗/i,'無法啟動或完成模擬程序，請重新載入頁面後再試。'],
  [/failed to fetch|fetch failed|network|load failed|loading.*module|ERR_(?:CONNECTION|NETWORK|NAME|INTERNET)/i,'無法載入所需資料，請檢查連線後重試。'],
  [/not.?allowed|permission|securityerror|operation is insecure/i,'瀏覽器權限或安全設定阻止此操作，請檢查網站權限後重試。'],
];

/** Preserve actionable engine validation, while hiding untranslated native errors. */
export function translateLabError(error){
  const message=String(error?.message??error??'').trim().split(/\r?\n\s*at\s/)[0];
  // A bad card may itself say "worker" or "quota". It is still a card error.
  if(/^無效牌張[：:]/u.test(message))return message;
  const isValidation=/^(?:[\u3400-\u9fff]|(?:(?:player|npc|jackpotEnabled|Jackpot|baseBet|firstSmallBlind|Session)\s+)+[\u3400-\u9fff])/u.test(message);
  const translated=message
    .replace(/\bplayer\b/g,'玩家').replace(/\bnpc\b/g,'對手')
    .replace(/\bjackpotEnabled\b/g,'彩金開關').replace(/\bJackpot\b/g,'彩金')
    .replace(/\bbaseBet\b/g,'基準投注額')
    .replace(/\bfirstSmallBlind\b/g,'首手小盲設定').replace(/\brandom\b/g,'隨機')
    .replace(/\bSession\b/g,'牌桌')
    .replace(/目前不能執行 (fold|check|call|bet|raise)/g,(_,action)=>`目前不能執行${LAB_LABELS[action]}`);
  if(isValidation)return translated;
  const native=String(error?.name??'')+' '+message;
  const match=nativeErrors.find(([pattern])=>pattern.test(native));
  if(match)return match[1];
  return '無法完成操作，請檢查設定後重試。';
}
