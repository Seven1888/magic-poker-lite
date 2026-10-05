# Engine API contract · v39 entry BOSS identity / v35 four-BOSS math · 2026-10-05

## v39 入場 BOSS 身份契約

玩家入場時顯示的角色就是首手 BOSS。控制器為同一入口保存 `entryBase` 與 `entryEncounter.seed`，調整 BET、關閉後重開入口、FIGHT 及抽盲演出均保留該身份；選 BET 不重選。離桌或 Reset demo chips 才清除並準備新入口；同桌 NEXT HAND 仍由原本 `startHand` 依上一型延續輪替。

`createEntryEncounter(config,seed)` 從 `./src/entry-encounter.mjs` 匯入，回傳凍結的 `{seed,bossProfile}`。它在隔離的 `createSession(config,seed,{firstSmallBlind:'random'})` 上，先沿用一次抽盲，再以 `selectBossProfile(preview.rng,null,preview.config.boss)` 取得公開 `bossProfile`；不呼叫 `startHand`、不發牌、不扣款，不回傳暗牌、牌庫、盲位亂數或秘密牌力。這個隔離 RNG 不會成為正式 session 的 RNG，也不改變正式牌序。

FIGHT 以已保存的 `entryBase`、選定 BET 與實際資產建立桌面設定，再用同一 seed 執行原本的 `createSession(...,{firstSmallBlind:'random'})` 與 `startHand`。因此正式引擎依原順序選到入口所示身份；不覆寫 `hand.bossProfile`、不重抽直到符合角色。正式 session 的抽盲、選型、發牌與行動 RNG 流程保持原樣。BOSS 固定表、引擎、結算與 JP 未改，數學證據仍是 v35；驗證及發布以 [docs/06](docs/06-mobile-and-deployment.md) 對應版本紀錄為準。

## v38 單一回應預覽契約

玩家行動若在同一手、同一街留下 BOSS 直接回應，按鈕上方的 preview 包含只有一個正機率動作的情況，顯示 **BOSS CALL 100%／RAISE 100%／FOLD 100%**。`check`／`call` 映射 CALL，`bet`／`raise` 映射 RAISE，底層 `type` 不變。混合分布仍只顯示原始 FOLD／RAISE 機率，不補列 CALL、不重新正規化；中央完整分布沿用既有契約。

行動直接換街、結束牌局或沒有同街回應時不顯示 preview，不以未公開下一街或上一次分布填空。此修正只改唯讀預覽的篩選及呈現，不改變引擎決策、RNG 次數、必然動作／中央抽選演出、`applyAction` 或帳務。以下 v37 局間 BET 與其他呈現契約繼續適用；數學證據仍是 v35，非 v38 新 RTP 驗證。

v37 增加局間 BET 設定並更新呈現；保留 v35 四型固定街道／牌力表、排除上一型的輪替、完整行動樹與玩家統計。勝負仍由真實共享牌庫決定，Hands Up 只提供固定 BET 級距，不移入其先定輸贏或 RTP 目標。`output/math-v35-validation.json` 仍是 v35 證據，不是 v37 新 RTP 試跑。

## v37 呈現契約

結算與派彩演出完成後，左側較小 BET 開啟局間調整小窗，右側 NEXT HAND 為主按鈕。＋／−只變更草稿，CONFIRM BET 只更新下一手的 `session.config`；關閉取消草稿，NEXT HAND 才呼叫 `startHand`、扣盲與發牌。BOSS 牌型文字由 14 放大至 17.5 舞台 px（＋25%），底板由 170×25 放大至 214×30，top 保持 326；玩家／BOSS 最佳五張分別為 4px `#ffe019` 金框／`#259dff` 藍框，共用牌金內藍外。以下 v36 公開資訊與演出順序繼續適用。

BOSS 名稱／副標不再生成於牌桌；`hand.bossProfile`、固定表及型別稽核欄位不變。角色與桌前底牌上移，畫面順序為角色牌→當前行動→公共牌→POT→玩家手牌；行動底板位於公共牌上方，TOTAL WIN 沿用 POT 區及原本來源籌碼到達才清空的契約。

每顆玩家按鈕的 preview 為左側單一 BOSS／右側原機率的異色合併塊；同手同街有效來源、玩家籌碼先抵達 POT 再飛標籤、中央完整真比例及單次 `sampleDistribution`／`applyAction` 維持。實色 4px 金／藍框標玩家／已揭 BOSS 最佳五張（含 kicker），深色分隔，共用牌金內藍外，完整揭牌後才調暗未入選牌。

`createGameEffects().reveal(targets,{onReveal,onVisible,holdMs,staggerMs})` 中，`onReveal` 在側邊換牌面，`onVisible` 在正面展開完成後執行；可見張數、牌型、亮框與公開資料估算只由後者推進。玩家兩張底牌可見後才顯示牌型，BOSS 依真正揭開的底牌逐張更新；換手清空舊牌型。減少動態仍保持換面→可見通知順序，取消不送出過期通知。

`preloadBossScenes(root)` 只預載四型 neutral，不選下一型。NEXT HAND 仍由 `startHand` 做唯一抽型，`renderBossIdentity(hand,root)` 同步套用其公開型別、清掉前手表情並使用 neutral。`waitForBossScene(hand,root,{timeoutMs=4000})` 只在首次發牌前等圖片解碼；已快取直接完成，慢圖顯示角色區轉場，超時／失敗使用無型名替身並解除等待。晚到圖片不可覆蓋別手角色，所有呈現均不讀暗牌或追加 RNG。以上契約優先於下方歷史版展示描述；本輪驗證與發布狀態以 [docs/06](docs/06-mobile-and-deployment.md) 為準。

All modules are dependency-free ESM. Import from `./src/engine.mjs`. All currency values are chip units, rounded internally to six decimals; the UI preserves up to six fractional digits so .03 BB / .015 SB and their payments remain consistent. Card identifiers are `As`, `Kh`, `Td`, `2c` (`s h d c`; ace is `A`, ten is `T`).

## Config

`DEFAULT_CONFIG`, `normalizeConfig(input)`:

```js
{
  targetRtp: 0.96, jackpotEnabled: true, smallBlind: 5, bigBlind: 10,
  minBuyIn: 200, maxBuyIn: 10000, buyIn: 10000,
  betSize: {preflop:10, flop:20, turn:40, river:40},
  maxRaises: 1, animationMs: 850,
  boss: {mode:"rotate", profileId:"caller"},
  npc: {fold:0.2, call:0.6, raise:0.2, check:0.65, bet:0.35,
        strengthInfluence:1, priceInfluence:0.6},
  deal: {
    player:{rerollMode:'unpaired',rerollChance:0.5,maxRerolls:50,manual:[]},
    npc:{rerollMode:'unpaired',rerollChance:0.25,maxRerolls:50,manual:[]}
  }
}
```

`normalizeConfig` always derives `smallBlind` as half of the normalized `bigBlind`, ignoring any independently saved value, including the previous single-blind value of zero. Small blind is not separately adjustable. Each hand the SB seat automatically posts half a BET and the BB seat posts one BET, each capped by that seat's available stack. At BET 10 the opening payments are 5 and 10. Game and simulations share this engine rule.

New rerolls use `unpaired`: a pair stops immediately; otherwise another independent `rerollChance` test may replace the candidate until `maxRerolls`. The limit counts redraws after the initial draw (50 means at most 51 candidates). Rejected candidates stay in the available pool; the last candidate is accepted even if weaker. Manual cards override sampling for that seat. `legacy-score` instead tests `holeScore < targetScore`; a saved config with targetScore but no rerollMode is explicitly normalized to legacy-score, preserving old semantics. Missing legacy defaults are .75 / 2 / .48. Neither mode examines the future board, final winner or JP. Each hand exposes `dealAudit[seat]={manual,rerollMode,initialClass,finalClass,initialScore,finalScore,attempts,rerolls,stopReason}`. Stop reasons are manual / pair / score-threshold / limit / probability. Manual attempts are zero.

`jackpotEnabled` is strictly boolean (strings are rejected), defaults to true, and is shared by game and tool. Target RTP controls POT settlement: net = contested gross × targetRtp. Uncalled refunds are excluded. The 96% player-side symmetric reference does not directly apply to the new asymmetric .5/.25 redraw defaults; strategy, unequal dealing and external JP change observed RTP. The 4% settlement fee is a prototype modeling choice, not an approved commercial rake model.

## Entry and available assets

Import from `./src/entry-model.mjs`. These functions are pure configuration helpers, not a wallet service.

首手公開身份由上方 v39 的 `createEntryEncounter` 預先準備。控制器在整個入口期間保留基礎設定，避免 BET 或重開入口時改變這次遭遇；只有 FIGHT 才建立正式 session。隔離身份準備與選 BET 均不扣款或發牌。

- `betOptions(config)` returns a fresh array of the 15 fixed Hands Up BET levels: `[1,2,5,10,20,50,100,200,500,800,1000,1200,1500,1800,2000]`. `config` does not change this ladder. Entry defaults to 1; both entry and between-hand UI move to the adjacent level rather than adding a fixed step. Source: the read-only `Hands Up/simulation-engine.js` `FIXED_STAKES` table.
- `minimumAssets(config,bet)` returns `config.minBuyIn/config.bigBlind × bet` (default 20 BB).
- `tableConfig(config,bet,assets)` validates affordable entry, makes `bigBlind=bet` and `smallBlind=bet/2`, scales all `betSize` values by `bet/config.bigBlind`, and sets `buyIn=assets`. Its `maxBuyIn` becomes at least the actual assets, so it does not silently discard a player's accumulated balance. The result goes through `normalizeConfig`.

Selecting BET and creating the session do not charge chips. `startHand` automatically posts each seat's blind once; subsequent call/bet/raise actions deduct only their actual incremental amounts. At BET 1 the SB is .5; there is no whole-chip rounding. The blind UI shows opening first/second order and each seat's starting payment, using the one already-determined draw. This opening order is preflop only; the big blind acts first postflop.

The UI initializes its in-page assets once from `config.buyIn` (default 10000). The v30 default `maxBuyIn` is also 10000 so normalization does not cap that starting amount. `loadConfig()` continues to preserve saved custom settings; the update does not overwrite saved buy-ins, an active session or an existing in-page balance. A fresh page without saved settings uses 10000, and Probability Lab's Restore defaults loads that default configuration.

On leaving a table the UI retains the actual player stack, including credited Jackpot, and uses that balance at the next entry. Both seats start that new session with the same full available asset amount. The entry UI asks only for BET, never a manual buy-in; it rejects insufficient assets and never silently refills them. In-play chips committed to the pot are not available balance. This is an in-page prototype balance, not a persistent external account; page reload initializes it again. The explicit “Reset demo chips” action, available only outside a playing hand and when not busy, clears the session and resets assets to current `loadConfig().buyIn`; it therefore respects a saved custom buy-in. Ordinary re-entry does not reset assets.

### 局間 BET 設定

從 `./src/next-hand-bet.mjs` 匯入 `nextHandBetConfig(session,bet)`。此純 helper 只接受 `session.activeHand` 屬於同一 session、局號相符且具有 `settled`／`result` 的狀態；BET 必須是有限值且至少 0.02。固定 15 級是遊戲 UI 的選值規則，helper 保留六位小數設定的相容性。

- BET 與目前值相同時直接回傳原 `config`，保留既有短籌碼續手規則。
- 變更時依 `bet/config.bigBlind` 縮放 `smallBlind`、四街 `betSize`、`minBuyIn` 與 `maxBuyIn`；雙方 `session.stacks` 都須達新 `minBuyIn`，預設等於 20 倍新 BET。超出可表示範圍或資產不足時擲出錯誤。
- 回傳新設定，不直接修改 session。`buyIn` 保留原桌損益基準，不以新資產或新門檻覆蓋，也不經會鉗制此基準的 `normalizeConfig`。
- 控制器在 CONFIRM BET 時才指派 `session.config`；不呼叫 `createSession`、`startHand`、RNG、扣款或入帳。資產、歷史、局號、盲位與 BOSS 輪替延續；已結算 `hand.config` 和 JP 結果不變。下一次 `startHand` 才使用新注額與新 JP 基準。

## Session / hand

`createSession(config={}, seed=123, options={})` accepts only `options.firstSmallBlind: 'random'|'player'|'npc'`. Default `'player'` preserves deterministic simulation/test positioning. The game explicitly passes `'random'`: exactly one seeded RNG call chooses player SB (NPC BB) for u<.5, otherwise NPC SB (player BB), so each seat has a 50/50 chance to be BB. The UI animates that chosen result before calling `startHand`, without another random draw or payment. Invalid options/unknown option keys are rejected.

```js
session = {
  config, seed, rng, firstSmallBlind:'player'|'npc',
  blindDraw:{smallBlind:'player'|'npc',probability:0.5}|null,
  stacks:{player:config.buyIn,npc:config.buyIn}, handNumber:0, fees:0,
  jackpotAwards:0, jackpotTierCounts:{royal:0,straightFlush:0,quads:0},
  opponentBankrollRefreshes:[]
}
```

Fixed player/NPC choice consumes no blind RNG draw and sets `blindDraw=null`. RNG is callable and has `.clone()` and `.state()`. No raw blind roll is returned. Seed/RNG/deck/deal audit are engine debug state and must not be exposed in player history.

`startHand(session)` mutates session.handNumber; returns hand. It alternates from `session.firstSmallBlind` (odd hand uses first choice, even hand uses the other seat). Throws if either stack is below .01. Buy-in is matched once at session creation; following hands use the current session balances. The public demo explicitly refreshes the opponent after each settlement using `syncOpponentBankroll`; `startHand` itself never refills either seat. It posts from both `hand.smallBlind` and `hand.bigBlind`, using the smaller of that blind's configured amount and its seat's available stack. Opening history records one `smallBlind` and one `bigBlind` payment. Short stacks use the normal all-in/uncalled-refund rules. For simulations each sample starts an independent equal-stack hand, begins with player SB, and alternates positions; these are not continuous-wallet simulations.

### Demo opponent bankroll refresh（局間對手資產刷新）

`syncOpponentBankroll(session)` 為遊戲控制器明確呼叫的局間 DEMO API。每手退款／底池派彩／JP 演出完成後，包含玩家或 NPC 棄牌，將對手可用資產調整成玩家當下的實際資產，再顯示本手結果。它只接受 `session.activeHand` 已 `settled`、具有 `result`、屬於同一 session 且 `handNumber` 等於目前局號；未開局、進行中或不符身分時擲出錯誤。玩家資產不變；玩家為 0 時對手也調為 0，`startHand` 仍拒絕開新手，不自動補資。

回傳並在 `session.opponentBankrollRefreshes` 附加一筆凍結事件，金額沿用六位小數精度；零差額仍記錄一次。同一手重複呼叫回傳原事件，不再修改資產或增加紀錄：

```js
{
  type:'demo-opponent-bankroll-refresh',
  handNumber:1,
  before:990,             // NPC 真正牌局結算後、刷新前資產
  after:1009.2,           // 玩家當下資產，含正常已入帳的 JP
  adjustment:19.2         // after - before；可正、負或零
}
```

刷新會建立新的 `session.stacks` 物件；已結手牌的 `hand.stacks` 保留本手原始結算資產，不會被刷新或下一手下注覆寫。`hand.result`、`history`、所有退款／派彩／JP／費用欄位及 RNG 均不變。後續 `startHand` 從新的 session 資產建立 `stacksBefore`，雙方各扣一次對應盲注並輪替位置。

`adjustment` 是獨立的 DEMO NPC 資金補入／收回事件，不屬於底池返還、玩家收入、JP 或 RTP。每手原有結算守恆仍以 `result.*.stackAfter` 驗算；採用刷新的連續 session 則應核對：`目前雙方 session.stacks 總和 + session.fees = 初始雙方 buyIn 總和 + session.jackpotAwards + Σ adjustment`。不得把刷新後的 NPC 資產當成本手牌局派彩，或用未納入 adjustment 的舊連續資產公式對帳。

引擎結算、`playAutomatedHand`、`simulate`、預覽及 Probability Lab 不會自動呼叫此 API；工具仍是原本的獨立等資產模擬算法。此功能也不更動 `targetRtp`、發牌、NPC 行動分布或任何隨機抽樣。

Example below: BET 10, player SB, both seats start with 1000. Player has posted 5 and NPC has posted 10.

```js
hand = {
  config, rng, session, handNumber, smallBlind:'player'|'npc', bigBlind:'player'|'npc',
  street:'preflop'|'flop'|'turn'|'river',
  status:'playing'|'settled', actor:'player'|'npc'|null,
  holes:{player:[...],npc:[...]}, board:[...], deck:[...],
  stacks:{player:995,npc:990}, stacksBefore:{player:1000,npc:1000},
  streetBets:{player:5,npc:10}, contributions:{player:5,npc:10},
  currentBet:10, raises:0, pot:15,
  history:[{actor,type,amount,to,street}], dealAudit:{player:{...},npc:{...}},
  result:null
}
```

`legalActions(hand, actor=hand.actor)` -> `[{type,label,amount,to,allIn}]`. Actions are fold/check/call/bet/raise. All-in is a status of a capped call/bet/raise (no extra button). `amount` is incremental cost, `to` is total this street. `applyAction(hand, type)` mutates hand and returns it; accepts `allin` as an alias only when a legal capped bet/raise/call is actually all-in. Bet/raise sizes are fixed; one raise per street. The small blind/button acts first preflop; big blind acts first postflop. Engine advances a completed street immediately and runs out remaining board on matched all-in. Since v27 (2026-10-03), player button labels stay FOLD/CALL/RAISE: engine check/call maps to CALL, and bet/raise maps to RAISE. This is a simplified UI mapping, not standard poker terminology; engine action types and NPC distribution types keep their actual meanings. Paid CALL/RAISE actions show a chip icon and the precise incremental `amount`; free CALL (check) and FOLD omit both the icon and amount. NPC response probabilities remain visible, and accessible labels, tooltips and accounting retain precise amounts. This is a presentation change only.

v28（2026-10-03）展示契約：玩家按鈕 badge 只篩選 FOLD／RAISE，中央抽選則保留完整分布所有正機率的實際 `type`，包括 call／check／bet，不能套用玩家按鈕的簡化名稱。CALL 區域顯示籌碼圖、名稱與原始百分比，結果按真實 `selected.type` 高亮；沒有重新正規化或額外抽樣。`createActionFlow({root}).render({mode,label,seat,detail,actor,playing})` 僅將現有演出狀態投影至 DEAL／YOU／BOSS／POT 流程列，保留完整提示與無障礙訊息，相同內容不重複播報；舊 table-cue／decision-veil 不顯示。上述皆不改本節引擎介面、賠率或結算公式。

v29（2026-10-04，本地完整流程驗證通過）展示覆蓋：中央以完整分布呈現連續真比例長條，區寬忠於原始機率。機率至少 10% 的區段將名稱與百分比留在格內；只有低於 10% 的小區段使用對應邊緣 caption，不把大區文字一併移出，真實區寬維持不變。marker 使用真實 `selected.roll`，不以選中區塊中心代替、不重新正規化或重抽。單顆牌桌 coin 只演出既有玩家 SB／BB 結果並飛至座位，盲注依 SB→BB 串行顯示入 POT，不能重做引擎扣款。令 `p = hand.result.player`，牌桌 TOTAL WIN 最終顯示 `p.totalReturn = p.netReturn + p.jackpotAward`，排除 `p.refund`，且不等同 `p.profit`；精確跑分只讀結算結果，不追加派彩。自動結算 modal 改由此桌上呈現取代，完整明細仍可手動查看。POT 示意籌碼置左、精確值置右，依顯示字數縮字並保留最多六位小數，不截斷或改成近似值。TOTAL WIN 在 POT 實體籌碼仍在時避開籌碼，真正派出後才回到中央；不能為排版提前清空可視籌碼或更動派彩。引擎 API、規則、賠率、RNG 與所有帳務公式維持不變。`npm test` 165／165 與本地完整流程驗證已通過。驗證證據與發布狀態另見 [手機與部署紀錄](docs/06-mobile-and-deployment.md)；本地通過不代表已提交或上線。

Settlement:

```js
hand.result = {
  reason:'fold'|'showdown', winner:'player'|'npc'|'tie',
  pot, fee, gross, net, totalReturn, board:[...],
  jackpot:{tier:'royal'|'straightFlush'|'quads',multiplier,baseBet,award}|null,
  player:{totalContribution,matchedWager,refund,gross,fee,netReturn,
          jackpotAward,totalReturn,baseProfit,profit,stackBefore,stackAfter},
  npc:{totalContribution,matchedWager,refund,gross,fee,netReturn,
       jackpotAward:0,totalReturn,baseProfit,profit,stackBefore,stackAfter},
  evaluations:{player:evaluation|null,npc:evaluation|null}
}
```

`netReturn` remains POT-only and excludes refunds. `totalReturn=netReturn+jackpotAward`; `baseProfit=netReturn-matchedWager`; `profit=totalReturn-matchedWager`. `stackAfter=stackBefore-totalContribution+refund+totalReturn` includes the extra award. Top-level `net` sums both POT returns; top-level `totalReturn` sums both total returns. `gross + refunds == all paid contributions`; total final stacks + fee == total initial stacks + Jackpot award. `session.fees` and `session.jackpotAwards` accumulate separately. Settlement is guarded against paying twice; cloned preview sessions also clone Jackpot tier counters.

From that opening state, independent examples below report the hand's settlement balances before the optional demo opponent refresh:

- Player `call`: deduct another 5, contributions become 10/10, POT 20, stacks 990/990; NPC retains its preflop check/raise option.
- Player `raise`, then NPC `fold`: player pays another 15, contributions are 20/10; refund player 10, matched wagers 10 each, settled POT 20, fee .8, player `netReturn` 19.2, final stacks 1009.2/990.
- Player immediately `fold`: contributions are 5/10; refund NPC 5, matched wagers 5 each, settled POT 10, fee .4, NPC `netReturn` 9.6, final stacks 995/1004.6. Player loses the posted small blind. The fold grants no Jackpot.

### v30 return presentation

`src/total-win-view.mjs` remains a read-only projection of the settled result: displayed amount is `player.totalReturn = player.netReturn + player.jackpotAward`, excluding `refund`, while a positive `profit` selects the TOTAL WIN outcome. The navy-and-gold plaque retains source-stack avoidance and re-centres only after the real POT source clears. Normal-motion positive-profit counting emits 32 decorative gold coins on deterministic paths behind the amount; finish, cancellation, a new result, page hiding and destruction remove them. Re-rendering the same result does not replay, and reduced motion, splits, non-profit returns and losses emit no coins. Coin animation never samples RNG or credits funds. Existing count and finish audio still respects mute. Current QA and release status are recorded in [mobile and deployment QA](docs/06-mobile-and-deployment.md).

The [probability model document](docs/04-game-flow-and-math.html) and [Probability Lab](probability.html) remain separate public entry points. NPC weights, legal-action normalization, RNG, settlement and JP formulas are unchanged; the new default starting stack is not an RTP recalibration.

## Jackpot rules and pure quote API

Import from `./src/jackpot.mjs`:

- `JACKPOT_MULTIPLIERS = {royal:200,straightFlush:50,quads:20}` and `JACKPOT_LABELS`.
- `classifyJackpot(evaluation)` returns a tier or null. Category 8 with royal flag / A-high comparison rank is royal; remaining category 8 is straightFlush; category 7 is quads. Only the highest tier applies.
- `quoteJackpot(tier,baseBet)` returns `{tier,multiplier,baseBet,award}`; validates a known tier and positive finite BET. This pure function never pays, alters cards, or consumes RNG.
- `getJackpotAward({reason,evaluation,baseBet,enabled=true})` returns that quote or null. Only `reason==='showdown'` qualifies; engine calls it with the player's evaluation and `hand.config.bigBlind`.

The official Hands Up amounts were checked at BET 500 (100000/25000/10000) and BET 1000 (200000/50000/20000), giving 200/50/20 × BET. The following eligibility is **this prototype's adaptation**, not a claim about all official rules: normal game showdown (including automatic matched-all-in runout), player's best five of seven, zero/one/two hole cards permitted, pot victory not required, one highest award only. A fold never awards, even if the exposed board already forms a qualifying hand. NPC receives no Jackpot. Controlled test/debug cards can exercise the same showdown rule; they are not natural-frequency samples. No extra RNG, progressive pool, additional JP wager, or 4% fee on the JP award is introduced.

## Distribution and preview

`getActionDistribution(hand, actor=hand.actor, policy='balanced')` -> array of action objects with `probability` in 0..1. Uses actor's own cards + exposed board + public betting state only. **balanced, aggressive and tight player policies use config.npc as their base; call is the check/call-only exception. Four-profile NPCs use their fixed street/strength tables, and legacy NPCs use the balanced weight formula.** Display maps check/call to CALL and bet/raise to RAISE without changing type or probability.

`previewResponse(hand, playerActionType)` -> `{distribution,actor,status,street}` after a side-effect-free simulated player action. Distribution is populated only if the NPC must respond *on the same street*. If call completes the street, return an empty distribution; do not reveal a future-board distribution. Actual next-street NPC actions use the updated real hand.

`sampleDistribution(distribution, rng)` -> `{...selectedAction,roll,index}`. Exactly one RNG draw. UI locks distribution, calls sample once, animates, then `applyAction(hand, selected.type)`; do not call stepNpc as well.

`stepNpc(hand)` -> `{distribution, selected, roll}` and applies once.

## Cards / simulations

`holeScore(cards)` -> 0..1 heuristic. `evaluateBest(cards)` requires 5..7 cards; returns `{category:0..8,name,rank:[...],best5:[...],royal:boolean}`. `compareHands(cardsA,cardsB)` -> -1/0/1. `makeDeck()`, `createRng(seed)`, `shuffle(cards,rng)` also exported.

`equityEstimate(hand,{samples=300,seed=1,actor='player'})` -> `{win,tie,loss,equity,samples,assumption}` in fractions. Uniform unknown opponent cards; future board sampled from cards not visible to actor; explicitly ignores both actual opponent hole cards and undealt deck order. Separate RNG never consumes game RNG.

Import `getShowdownView({playerHole,visibleBoard,revealedNpcHole=[]})` from `./src/showdown-view.mjs` for progressive showdown disclosure. With fewer than five visible board cards or no revealed NPC cards it returns null; otherwise it returns `{revealedCount,npcEvaluation,npcHandName,npcBest5,equity,wins,ties,losses,outcomes}`. Exactly five board cards and one/two revealed NPC cards are required for a result. `npcEvaluation`/`npcBest5` use only revealed NPC cards plus the board and include all best-five kickers. One revealed card enumerates all 44 uniformly possible second cards, with `equity=(wins+ties/2)/44`; two revealed cards give `outcomes:1` and equity 0/.5/1. This is a pure public-card calculation with no hand/deck/RNG input, no hidden-card access and no redraw correction. It is distinct from the UI's 250-sample unrevealed-opponent estimate. Module verification does not claim the progressive reveal browser flow has passed QA.

`playAutomatedHand(session, policy='balanced')` -> settled hand; NPC uses the locked profile table (or balanced in legacy mode), player uses selected policy.

`simulate(config,{hands=10000,seed=123,policy='balanced',onProgress})` returns:

```js
{
 ruleSet:'heads-up-two-blinds-v1',
 hands,seed,policy,config,wagers,refunds,grossReturns,netReturns,totalReturns,
 jackpotAwards,tierCounts:{royal,straightFlush,quads},
 jackpotHits,jackpotHitRate,jackpotShowdownHitRate,
 fees,playerFees,grossRtp,baseRtp,totalRtp,rtp,
 baseStandardError,baseCi95:[lo,hi],standardError,ci95:[lo,hi],
 wins,losses,ties,folds,npcFolds,showdowns,totalActions,conservationError,batches,method
}
```

`netReturns` stays POT-only; `totalReturns=netReturns+jackpotAwards`. `baseRtp=netReturns/wagers`; `totalRtp=totalReturns/wagers`; **`rtp` aliases totalRtp**. With full BET 10 blinds, an immediate opening SB fold contributes matched wager 5, zero player POT return and system fee .4; the BB's uncalled 5 is refunded. If a whole sample has zero wagers, ratios return 0 and SE/CI return null values; this is no measured return ratio. `standardError/ci95` describe total return; `baseStandardError/baseCi95` describe POT return. Tier counts are mutually exclusive player award counts. `jackpotHitRate=hits/hands`, `jackpotShowdownHitRate=hits/showdowns` (zero when no showdowns). RTP/CI are fractions, all scalar economic totals are player-side except `fees` (system fees). `conservationError` includes external JP funding.

The older version:4 bundles describe the previous basic simulate() path. The v35 tool uses the study APIs below; consumers must inspect bundle version, study mode, config and method metadata rather than assuming the same ruleSet implies identical data. `simulate()` remains a legacy independent-hand API.

Independent hands reset equal stacks and alternate positions. Progress callback every completed batch receives `{completed,total}`; worker may run synchronously. Each batch (250 hands or final remainder) contains `{hands,wagers,netReturns,totalReturns,jackpotAwards,tierCounts,baseRtp,totalRtp}`. Fixed/legacy CI uses independent-hand ratio-estimator variance, not a binomial win-rate approximation. Rotating bosses form a correlated single sequence here, so simulate() returns null errors and [null,null] intervals; use multi-player simulateStudy() instead. Rare JP with no observed hits is not proven impossible; normal-approximation intervals may underrepresent rare-award uncertainty. Initial-card redraw and strategy-dependent arrival at showdown change JP frequencies; don't substitute natural seven-card frequencies for this game.

## Exact model formulas for documentation

Starting-hand score (`H` = high rank, `L` = low rank, A = 14):

- Pair: `0.57 + (H - 2) / 12 × 0.43`.
- Non-pair: `(H - 2)/12 × 0.44 + (L - 2)/12 × 0.20 + suitedBonus + gapBonus`, clamped to `[0.02, 0.94]`.
- Same-suit bonus `0.12`; gap 1/2/3 bonus `0.12/0.07/0.03`, otherwise zero.
- Default unpaired mode redraws only unpaired candidates; legacy-score mode alone uses the score threshold. Each continuation independently tests rerollChance until maxRerolls; final candidates are accepted even if weaker. Rejected candidates remain in the pool; only accepted holes are removed. Manual cards are reserved before either seat is sampled. The small blind is dealt first, rotating each hand. No future board or winner is inspected.

NPC private-card strength `s` is the opening score before flop. Postflop it uses best-five category base `[.18,.40,.57,.67,.76,.82,.89,.96,.995]` for high-card through straight-flush, plus `(highest comparison rank - 8) × .008`, clamped to `[.03,.999]`. This is an action-policy heuristic, not equity.

Let `S=strengthInfluence`, `P=priceInfluence`, `q=amountToCall/(currentPot+amountToCall)`. Each legal action starts with its configured weight and applies:

```text
fold  × exp(S × (0.5-s) × 3 + P × (q-0.2) × 2)
call  × exp(S × (s-0.5) × 0.6)
raise × exp(S × (s-0.5) × 2.5 - P × q)
bet   × exp(S × (s-0.5) × 2.5 - P × q)
check × exp(-S × (s-0.5))
```

Normalize *only legal actions* to sum to one. If all configured legal weights are zero, use check/call with probability one. Fixed-policy stress tests modify these weights: aggressive fold ×0.15, bet/raise ×3.5; tight fold ×3, bet/raise ×1.5 if s>.72 otherwise ×.25. `call` always checks/calls. The player policy is a simulation model, not the player's actual choices or an optimal strategy.

RTP denominator is `Σ matchedWager_player`, excluding uncalled refunds. Base numerator is `Σ netReturn_player`, including return of the matched original stake; total numerator adds `Σ jackpotAward_player`. For one hand, equalize total contributions via refunds; contested pot = `2 × min(playerContribution,npcContribution)`. Winner receives `pot × targetRtp`; ties each receive `pot/2 × targetRtp`. Fee = gross minus net. The *combined two-seat POT-only* return ratio is 96% by settlement construction; a single player's base return ratio is only 96% in expectation under symmetric dealing and policies. Jackpot is external extra funding and is not taken from the opponent's balance. Total RTP is not guaranteed to be 96%. `targetRtp` controls a settlement coefficient, not outcome rigging or guaranteed player return.

For independent-hand pairs `(x_i=matchedWager, y_i=netReturn)` for base or `y_i=totalReturn` for total, `R=Σy/Σx`; `SE=sqrt[n/(n-1) × Σ(y_i-R×x_i)²] / Σx`; 95% CI = `R ± 1.96×SE`. The interval is an asymptotic simulation interval, not a certification or an optimized-strategy bound.

## Complete action-tree API

Import `buildActionTree` from `src/action-tree.mjs`:

```js
buildActionTree(config={}, {
  seed:123, firstSmallBlind:'player', policy:'balanced', stateLimit:100000
})
// firstSmallBlind must be player or npc, never random; stateLimit positive integer.
// policy: balanced | call | aggressive | tight.
```

It deals once through the shared engine, fixes holes and remaining deck, then clones/applyAction across **every legal edge**, including probability-zero edges. No action RNG is consumed. A limit overflow throws; no truncated tree is marked complete. The default full-stack tree has 1312 nodes, 562 decisions and 750 terminals; changed stack/bet conditions may alter those counts.

```js
{
 version:1, mode:'fixed-deal-full-action-tree', complete:true,
 meta:{cardModel,scope,description,policyInformation,expectation,
       holeCardsVisibility,rngStateAfterDeal,rngStateAfterTraversal},
 config,seed,firstSmallBlind,policy,rootId,
 cards:{player:[...],npc:[...],boardRunout:[...]},
 nodes:[{
   id,parentId,depth,path,actor,street,reachProbability,board,stacks,pot,
   contributions,streetBets,currentBet,raises,pending,terminal,
   edges:[{type,amount,to,allIn,probability,childId}],expected,
   result // terminal nodes only
 }],
 summary:{nodes,decisionNodes,terminalNodes,maxDepth,decisionsByStreet,
   zeroProbabilityEdges,terminalProbabilityMass,conservationError,weighted},
 rootOptions:[{type,amount,to,allIn,probability,childId,expected}]
}
```

`expected` and summary.weighted contain winProbability/tieProbability/lossProbability, matchedWager, totalContribution, refund, grossReturn, baseReturn, jackpotAward, totalReturn, baseProfit, profit, playerFee, systemFee, playerClosingStack and npcClosingStack. Each node expected value is conditional on reaching it and following the selected policy thereafter. Child reach probability is parent reach × edge probability. Sum of terminal mass must be 1. Leaf counts are never win probabilities. Revealed node board remains a visible prefix, while cards.boardRunout is offline-only full-deal disclosure.

## Sampled-deal full-tree study

Import `simulateTreeStudy` from `src/tree-study.mjs`:

```js
simulateTreeStudy(config={}, {deals:100,seed:20261005,policy:'balanced',onProgress})
```

deals must be an integer 1..10000 (UI requires at least 2). A fixed master-seed schedule supplies independent deals; firstSmallBlind alternates player/npc. The same schedule supports same-deal strategy comparison. Each sampled deal integrates all legal action paths. This samples card deals; it does **not** enumerate all 52-card permutations.

Output: `{version:1,kind:'tree-study',complete:true,deals,seed,policy,config,dealSeeds,meta,totalNodes,totalDecisionNodes,totalTerminals,zeroProbabilityEdges,maxConservationError,maxMassError,blindCounts,averageTerminalProbabilityMass,weighted,totals,baseRtp,totalRtp,winStandardError,baseStandardError,totalStandardError,winCi95,baseCi95,totalCi95,tierProbabilities,byStreet,progress}`.

weighted contains average tree expectations and showdownProbability, showdownWinProbability (joint), showdownConditionalWinProbability (joint divided by showdown mass), playerFoldProbability, npcFoldProbability, profitableHandProbability. byStreet rows have `{street,actor,type,weightedVisits,weightedAmount,visitsPerDeal,amountPerDeal,conditionalActionProbability}`. The conditional denominator is all weighted action visits for that actor/street; multiple visits in one deal are possible.

CI sample unit is one deal/tree, not one leaf. RTP uses total expected return / total expected wager. For deal-level (X,Y), SE is `sqrt[N/(N-1)*Σ(Y-rX)^2]/ΣX`. Win CI uses sample variance of deal-level winProbability. One deal or no wager yields null uncertainty. Ratios with zero denominator are null in tree-study. Rare JP remains subject to card-sampling uncertainty.

## Player study API

Import `simulateStudy` and `studyPlayerSeed` from `src/simulation-study.mjs`:

```js
simulateStudy(config={}, {
 players:1,entries:1000,seed:20261005,policy:'balanced',mode:'independent',
 sliceSize:250,targetAsset:undefined,maxHandsPerPlayer:10000,onProgress
})
```

players/entries/sliceSize/maxHandsPerPlayer must be positive safe integers; policies as above; seed a string or finite number. modes: independent resets equal stacks each hand with player SB then alternating; continuous preserves player balance and randomly draws the first blind once; cashout preserves balance until target (default buyIn×2), insufficient stack (<.01) or safety limit. Entry minimum is not an in-session stop threshold. Initial target attainment permits zero hands. Cashout hitting the limit is censored, not success or failure.

Each player gets a stable derived seed. Increasing player count does not alter earlier players. Ordinary policy simulations may consume different RNG counts; equal starting seed is not a matched card-deal guarantee. Continuous/cashout call syncOpponentBankroll after every settled hand, including the final one; NPC adjustment is excluded from payout and RTP.

Output includes `studyVersion:1,ruleSet,mode,players,entries,seed,policy,config,sliceSize,targetAsset,maxHandsPerPlayer`, economic totals and counts, `playerResults,playerSummary,byBlind,actionStats,dealAudit,streetReach,returnDistribution,batches,conservationError,methodMeta,method,npcRefreshCount,npcRefreshAdjustment,npcRefreshAdded,npcRefreshRemoved`, and base/total RTP with uncertainty. `rtp` aliases totalRtp. `standardError/ci95` apply to total RTP; baseStandardError/baseCi95 to base RTP.

playerResults rows have playerIndex/seed/start/end/endMeaning/status/reachedTarget/insufficient/censored plus per-player counters and money. In independent mode endMeaning is last-independent-hand; never treat end as accumulated wealth. playerSummary counts completed/target/insufficient/censored players. Action rows use count for events and hands for unique hand/street/actor/action combinations; handWins/handLosses/handTies/handNetWins always refer to **the player**, even when actor=npc. Return buckets use totalReturn/matchedWager, excluding refunds.

Fixed/legacy independent RTP CI uses one hand per observation. Rotating BOSS independent mode retains per-player sequences and clusters by player. Continuous/cashout CI clusters X/Y totals by player; fewer than two players yields null CI regardless of hand count. methodMeta.ciUnit and ciSamples identify the actual unit. Zero denominator yields ratio 0 as a sentinel and null uncertainty; UI should show unavailable, not measured 0% return. CIs are normal approximations, not rare-JP certification.

## Worker protocol

`src/simulation-worker.mjs` accepts:

```js
{type:'run',config,policies:['balanced'],...studySettings}
{type:'tree',config,...treeSettings}
{type:'treeStudy',config,...treeStudySettings}
```

run emits progress (including policyIndex/policyCount), partial `{report}`, then result `{reports}`. tree emits treeResult `{tree}`. treeStudy emits treeProgress and treeStudyResult `{report}`. All failures emit `{type:'error',message}`. The UI stops by terminating its worker; incomplete work is not a complete report. Game presentation remains single apply/sample and independent from these offline workers.

## Reproducible validation artifacts

v34 checks are recorded in docs/06 and `output/math-v34-validation.json` (seed 2026100527, source hashes, 1000 integrated trees and four policies ×5000 independent hands). They validate structure/accounting and small-sample math, not fixed RTP or high player win-rate calibration. The v35 four-BOSS validation is separately recorded in output/math-v35-validation.json and docs/06; the v34 numbers do not validate it.

The v26 validation record is maintained in [mobile and deployment QA](docs/06-mobile-and-deployment.md). `tests/engine-jackpot.test.mjs` contains controlled card fixtures for board-only royal/SF/quads, losing quads, folds, preview isolation, exact-once payout and separate base/total simulation accounting. The former 90-test single-blind count, 58-test early dual-blind count and v5–v25 browser evidence retain their historical versions; none is a claim about v26 verification or total-RTP calibration.

[V26 rule cases](output/playwright/blinds-v26/rule-cases.json) contains 12 controlled cases covering both blind positions, opening fold, call/check, raise/fold, short stacks and fractional blinds. [V26 accounting smoke](output/playwright/blinds-v26/math-smoke.json), generated by `node tests/smoke-two-blinds.mjs`, records 2500 hands each for balanced, call, aggressive and tight, seeds 20261002–20261005, with default redraw and JP enabled. All four report zero conservation error. These are accounting/function checks, not RTP or rare-award calibration.

[Historical single-blind cases](output/single-big-blind-v1/rule-cases.json) and [historical single-blind smoke](output/single-big-blind-v1/smoke.json) retain the v14 model. The latter's 5000 balanced hands, seed 20260930, had base RTP 94.7631%, total RTP 95.0344%, two JP hits/400 awarded and conservation error 0. Those are not v26 results.

`node tests/validate-math.mjs` uses the current two-blind engine with JP explicitly disabled and writes to `output/heads-up-two-blinds-v1/math-validation.json` and `output/heads-up-two-blinds-v1/example-hands.json`. It does not overwrite the retained historical artifacts. This large run was not executed for v26. Matching the former blind amounts does not turn a historical report into a new run; reproducing that report requires its matching historical engine/configuration.

The retained `output/math-validation.json` and `output/example-hands.json` are **historical SB 5 / BB 10 dual-blind, POT-only artifacts without Jackpot**. The 260k report contains 100k natural symmetric hands, 100k symmetric redraw hands, and 20k each for check/call, aggressive, and tight strategies. It was not rerun for v26 or as a JP-total report. At its recorded seeds, aggressive measured above 100% base RTP; this historical exploitable-policy finding must remain visible but is not a measurement of the revised model. This prototype is not a strategy-proof 96% commercial model; current total RTP is not asserted to be 96%.

## v35 BOSS profile contract

Import BOSS_PROFILES, BOSS_PROFILE_BY_ID, BOSS_PROFILE_IDS, BOSS_BANDS, BOSS_BANDS_BY_STREET and BOSS_PROFILE_VERSION from src/boss-profiles.mjs. Version four-boss-v1. Profile records are immutable {id,name,nickname,description,tables}; tables[street][band] contains percentages {fold,call,raise} summing to 100. The full published values are in docs/04 section 4. Free actions discard FOLD and map CALL to check, RAISE to bet/raise; unavailable actions are removed before normalization. The one-raise-per-street rule still applies.

config.boss.mode is rotate (default), fixed or legacy. profileId is caller (default), maniac, sniper or trapper. Missing boss uses the new rotating model; reproduce old RNG/golden fixtures with explicit legacy mode. Within the gameplay session, startHand makes the only profile draw: first eligible four each 1/4, following eligible three each 1/3. The v39 entry helper mirrors the first blind/profile draws in an isolated session with the reserved seed, exposing only the public identity without advancing gameplay RNG or dealing cards. Fixed/legacy consume no encounter RNG. session.lastBossProfileId stores continuity, hand.bossProfile the immutable record, hand.bossSelection={mode,probability,previousId,eligibleIds}. clone and action-tree traversal retain the chosen profile. No private strength band is exposed in the live game UI.

New profiles use their own tables; config.npc weights continue to control balanced/aggressive/tight player policies and legacy BOSS only. Never alter player strategy from the private BOSS cards.

simulateStudy adds byBoss[id] aggregate ledgers/wins/showdowns, bossEncounterAudit={mode,counts,firstSelections,checkedTransitions,consecutiveRepeats,unexpectedRepeats,selectionProbabilityCounts}, and per-player bossProfileSequence/bossEncounterCounts/bossConsecutiveRepeats. Even independent bankroll-reset mode retains the per-player profile sequence. rotate CI clusters whole players because adjacent hands are dependent; fixed/legacy independent studies retain hand-level CI.

buildActionTree adds bossProfileId, bossProfile and bossSelection. simulateTreeStudy adds byBoss, bossProfileIds and meta.bossSampling. Each sampled tree starts an independent table, therefore rotate draws each of four with 1/4 and adjacent sampled trees may match; this is not the gameplay encounter sequence. CI remains at the independent-deal level.
