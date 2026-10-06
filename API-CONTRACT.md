# Magic Poker Lite API 契約 · 現行 v51 模型 · 2026-10-06

本輪為 v51 發布準備，使用者已授權提交並推送 main；既有 GitHub Actions 負責建置與 Pages 部署，實際結果以 Actions 為準。實際驗證見 [docs/06](docs/06-mobile-and-deployment.md)。遊戲英文，工具與文件繁體中文；原三款永久唯讀。

## Config 與模型識別

`normalizeConfig(source)` 回傳驗證後設定。底池、結果、水池參數分開：

```js
{
  targetRtp: 1, jackpotEnabled: true,
  bigBlind: 10, smallBlind: 5,
  minBuyIn: 50, maxBuyIn: 10000, buyIn: 10000,
  betSize: {preflop:10, flop:20, turn:40, river:40},
  maxRaises: 1, animationMs: 850,
  boss: {mode:'rotate', profileId:'caller'},
  outcome: {
    mode:'prebuilt-pools',
    conversionRate:0.99, paidActionBudgetShare:0.8,
    paidActionCooldownMin:0, paidActionCooldownMax:0, specialUseChance:0.2,
    initialPaidActionPools:[0,0,0], initialSpecialPools:[0,0,0],
    initialPaidActionCooldown:0, stateLimit:10000, maxLayoutAttempts:2000
  },
  npc: {fold:.2,call:.6,raise:.2,check:.65,bet:.35,strengthInfluence:1,priceInfluence:.6},
  deal: {
    player:{rerollMode:'unpaired',rerollChance:.5,maxRerolls:50,manual:[]},
    npc:{rerollMode:'unpaired',rerollChance:.25,maxRerolls:50,manual:[]}
  }
}
```

上列 `minBuyIn=50`、`bigBlind=10` 對應已採用的 **5×BET** 門檻。新模型 1,000 棵完整樹平均原始投入為 4.5021886189627605 BET，95% CI [4.412775222367272,4.591602015558248]；平均向上取整為 5，預設設定不需變更。

現行 `outcome.mode` 為 `prebuilt-pools`，BOSS 表版本 `four-boss-fixed-street-v2`。一般研究與樹的模型 metadata 為 `prebuilt-pools-v2-full-pot`；報告保存設定、seed、結果模型與統計模式，不能只以 ruleSet 判斷。

`outcome.conversionRate` 是唯一 RTP 計分係數，預設 .99，開局與付費抽籤共用。現行模型正規化 `targetRtp` 為 1，即使載入 .96 等先前參數也不恢復底池費；此鍵保留供資料相容，工具不提供第二係數。匹配底池全額派彩。池金額保存六位小數，抽票尺度 1,000,000；個人雙池跨手保存。

設定鍵為 `magic-poker-lite.config.v2`。無 v2 時才遷移舊設定；舊預設 20 BET 比例遷至本輪預設，自訂比例保留。設定與個人餘額／池資料分開。

## Entry 與每手門檻

`minimumAssetsForBet(config,bet)` 位於 `src/hand-entry.mjs`，公式為 `round6(config.minBuyIn/config.bigBlind × round6(bet))`。入口報價、同 BET、改 BET 使用同一精度及判斷。

`handEntryStatus(session,config=session.config)` 回傳 `{canStart,minimumAssets,insufficientSeats}`。`assertHandEntryAssets` 不足時拋 RangeError，附：

```js
{code:'INSUFFICIENT_HAND_ASSETS', minimumAssets, insufficientSeats:['player' /* and/or npc */]}
```

此檢查先於 startHand 的正式手數、RNG、扣盲與牌面提交，雙方等於門檻可以開局。門檻只限制開手，局中仍可正常全下及退款。

`minimumAssets`／`tableConfig`（src/entry-model.mjs） 依固定 BET 級距縮放兩盲、注額與門檻；`nextHandBetConfig(session,bet)` 只接受本手已結算狀態。同 BET 也檢查資產，不再保留 .01 續手例外。確認 BET 只保存下一手設定，不發牌、不重建 session、不重設原損益基準、歷史或個人池。NEXT HAND 不足時由 UI 打開 BET 視窗，玩家手動降低或離桌。

## Session 與原子開局

```js
const session = createSession(config, seed, {
  firstSmallBlind:'random', // 或 player / npc；缺省 player
  outcomePools: savedPools // 可省略：只在新研究玩家初始化三桶
});
const hand = startHand(session);
```

options 僅接受 firstSmallBlind／outcomePools。random 設 `blindMode:'random'`；首手使用 createSession 已保留的 50/50 盲位，後手成功開手再抽，允許連續同位。player／npc 採受控交替。session 保存 config、rng、stacks、handNumber、firstSmallBlind、blindMode、blindDraw、lastBossProfileId、fees、jackpotAwards、jackpotTierCounts、outcomePools 與 opponentBankrollRefreshes。

hand 保存公開／私有引擎狀態、history、result，以及：

```js
{
  outcomePoolsBefore, // 本手開始前完整池快照
  outcomeHandId,      // String(outcomePools.handSequence + 1)，跨桌不重設
  outcomeDecision     // 私有目標、qualification、poolBranch
}
```

內部 `_outcomeTree`／`_outcomeNodeId` 為非列舉欄位；前端公開資料不可帶出整棵樹、暗牌、未揭牌、target、池決策或原始結果票。

prebuilt-pools 的 startHand 先在隔離 session／RNG 完成全部目標、水池分支、布局與合法路徑結算，再一次提交。布局重試保留全部 target／特殊資格。節點或布局超限必須失敗，不回傳不完整樹、不扣正式盲注、不耗正式 session。不得在失敗後偷偷換成自然牌或重抽目標。

`syncOpponentBankroll(session)` 僅在本手正式結算後作明示 demo 對手資產刷新；以手數去重，保存 before／after／adjustment。此調整不算玩家收益、池收入、POT 或 RTP。

## 動作、分布與 preview

`legalActions(hand,actor=hand.actor)` 回傳 `{type,label,amount,to,allIn}`。type 為 fold／check／call／bet／raise，amount 是本次實付，to 是本街累計投入。最多一次 raise；stack 不足時依匹配上限合法全下。

`applyAction(hand,type)` 在新模型只讀已存 edge／node，採用該節點牌面、帳務與池狀態，不臨時抽 target、配牌或重新結算。allin 別名選合法 allIn 分支。`applyActionRaw` 是建樹的下注／結算核心，不能自行產生結果 RNG。

`getActionDistribution(hand,actor,policy)` 提供合法分布；正式 BOSS 只讀 profile.streetWeights[street]，不讀私牌牌力。check／call 合併 CALL，bet／raise 合併 RAISE；先剔除非法動作再正規化，免費狀態不給 BOSS fold。全零合法權重以 check／call 保底。原牌力列保留作固定表來源，不代表正式仍按牌力選表。

`sampleDistribution(distribution,rng)` 只抽一次，回傳包含 probability／roll／index 的選中動作；BOSS 抽籤消耗正式行動 RNG，但不重抽結果目標。動畫不得抽第二次。`stepNpc` 封裝此流程。

`previewResponse(hand,type)` 在 clone 上查該玩家動作是否有同街直接 BOSS 回應，回傳 `{distribution,actor,status,street}`；跨街／終局回傳空回應，不推進正式 RNG、餘額、池或手數。`cloneHand` 隔離可變牌局資料及 RNG；研究遍歷與 preview 不能提交反事實分支。

## 預建結果樹核心

`src/prebuilt-outcome-tree.mjs` 不依賴 engine。正式整合使用：

```js
buildPrebuiltOutcomeTree({
  hand, rng, cloneHand, legalActions, applyActionRaw,
  drawRootOutcome: ({hand,rng}) => drawRootPoolOutcome({hand,rng,pools,config}),
  drawPaidOutcome: ({hand,action,previousDecision,nodeId,rng}) =>
    drawPaidPoolOutcome({hand,action,previousDecision,nodeId,rng,config}),
  createLayout,
  stateLimit:10000, maxLayoutAttempts:2000
})
```

全部玩家付費動作都呼叫 drawPaidOutcome，包含父目標 win，因為仍需記錄待入池付費。免費與 BOSS 非棄牌動作繼承整份 decision；fold 的正式 winner 覆蓋 target。`nonWin` 包含平手。

createLayout 在全部 target 完成後取得隔離 hand／rng、attempt、requiredTargets 及 plan，回傳固定 player[2]、board[5]、boss.win／boss.nonWin（僅需實際目標）、相關稽核或 null。布局須真實符合各目標，個別分支不能重複牌；不同反事實暗牌組可重疊。qualified layout 必須符合特殊池資格；普通無資格布局排除玩家特殊牌。

成功回傳 complete、rootId、nodes（含 decision、edges、state）、layout、statistics、meta 及 rngAfterBuild。呼叫方只在成功後提交 RNG。`lookupPrebuiltOutcomeTransition(tree,nodeId,type)` 只回傳既存 edge／node，無 callback、抽樣或牌面搜尋。`OutcomeTreeBuildError.code` 區別 STATE_LIMIT／LAYOUT_LIMIT 等建構失敗。

純研究也可提供 rootWinProbability 與 paidConversionProbability，兩者都必填且沒有經濟預設。這個低階介面不是正式雙池模式的替代設定。

## 水池 API 與分支提交

`src/outcome-pools.mjs` 的預設來自現行 Hands Up：conversionRate=.99、paidActionBudgetShare=.8、CD 0..0、specialUseChance=.2。BET 桶固定為 [1,2,5,10]／[20,50,100,200,500]／[800,1000,1200,1500,1800,2000]。

```js
createOutcomePools({
  paidAction:[0,0,0], special:[0,0,0],
  paidActionCooldown:0, qualificationSequence:0, handSequence:0
})
// -> {version:1,buckets:[{paidAction,special},...],
//     paidActionCooldown,qualificationSequence,handSequence,lastSettlement:null}
```

normalizeOutcomePools／cloneOutcomePools 驗證並隔離資料。compactOutcomePools 供內部分支複製，只保留前手 lastSettlement.id 與空 audit，不丟棄正式對外結算 audit。設定的初始池欄位由 engine 映射到 factory。

drawRootPoolOutcome 及 drawPaidPoolOutcome 回傳 decision，含 target、kind、inherited、probability、roll、winningNumbers、qualification、poolBranch。poolBranch 保存 basePools、handId、bet、bucketIndex、當前兩池、CD、pendingWinPaidCredits、paidEvents 與資格。

```js
applyBranchPools({pools:hand.outcomePoolsBefore, decision, handId})
// -> 本手已選路徑的池快照；只反映池使用/CD/資格，未加入 pending 收入

settleOutcomePools({
  pools:hand.outcomePoolsBefore, decision,
  matchedWager, reason, winner, actualTier, handId
})
// -> {pools, audit, specialAward, alreadySettled}
```

中途及結算都由手前快照推導，不能把已套用過的中途池再當手前池。只有選中終局提交；反事實節點只存自己的結果。每次成功結算 handSequence 加 1；同一已結算池再交相同 handId 時 alreadySettled=true、specialAward=0，不重複入池或派獎。

付費 nonWin 分母為 `D=round6(2×min(玩家本次付費後累計投入,BOSS本手起始資產))`；s=round6(實付×.99)，CD=0 時 U=min(付費池,max(0,D-s))，p=clamp((s+U)/D)。結果票按百萬尺度量化。win 繼承不抽結果、不用池、不扣 CD，但記待入池區間。

pendingWinPaidCredits 的 from／to 是玩家累計投入區間。結算 effectivePaid=max(0,min(to,matchedWager)-from)，只對此部分按 α 計分並分 80%／20%，退款部分不入池。初始盲注不入池。

audit 含 handId、bet、bucketIndex、matchedWager、before／after、paidActionBudgetUsed、paidActionAdded、specialAdded、specialAward、cooldownBefore／After、credits、paidEvents、qualification；credits 分列 matchedPaidAmount 與 refundablePaidAmount。池金額不是玩家錢包返還，不能加入 totalReturn。

## 特殊資格與 JP

reserveSpecialQualification 只在 root win、JP 啟用且本桶特殊池足額時選最高可負擔項，再抽 20%。順序 royal 200×BET、straightFlush 50×BET、quads 20×BET；不足時不抽資格票。資格包含 tier、award、baseBet、bucketIndex、id、status、useRoll 等；保留 target 與資格重建布局，不降級替代。

isSpecialPoolLayout 要求精確 tier、玩家底牌參與特殊牌、公牌本身非特殊牌。無資格時要求玩家非 JP 牌型。正常下注不關閉資格；showdown 且 winner='player'、actualTier 完全相同才扣池派一次。fold 不扣池、不派 JP；這次資格不跨手延用。當手新增特殊池不能補足開局資格。

`classifyJackpot(evaluation)`、`quoteJackpot(tier,baseBet)` 為純分類／報價；新模型派獎權限來自 settleOutcomePools，不可直接用自然牌型 getJackpotAward 自動派。

## 單手帳務與結果欄位

m=min(雙方 contributions)，refund_i=C_i-m，匹配 POT=2m。勝方 gross=2m，平手各 m，負方 0；netReturn=gross，fee=0。特殊獎由個人特殊池支付；totalReturn=netReturn+jackpotAward；profit=totalReturn-m。餘額更新為 stackBefore-C_i+refund+totalReturn。

result 保存 reason、winner、folded、pot、gross、fee、net、totalReturn、jackpot、outcomePoolAudit、board、evaluations，以及 player／npc 的 totalContribution、matchedWager、refund、gross、fee、netReturn、jackpotAward、totalReturn、baseProfit、profit、stackBefore／After。

錢包守恆：雙邊 stackAfter＋fee＝雙邊 stackBefore＋player.jackpotAward。池單獨以 before－使用／派出＋有效收入對帳。預建節點結算不等於正式入帳；只有被選路徑的已存狀態能提交。

## 個人 profile 的儲存交易

`src/outcome-profile.mjs` 的 OUTCOME_PROFILE_KEY 為 `magic-poker-lite.player.v1`。

- normalizePlayerProfile 接受 version=1、有限非負 balance 及完整 outcomePools，輸出六位小數且深度隔離；缺池的損壞 profile 不可無聲初始化為零。
- loadPlayerProfile(storage) 回傳合法 profile 或 null；JSON 損壞、storage 禁用或讀取失敗不能讓遊戲崩潰。
- savePlayerProfile(profile,storage) 以一次 setItem 同時寫 balance＋outcomePools；成功 true，無儲存能力／配額／安全錯誤 false。
- 只保存已結算整手交易；重整未完手恢復上一筆，不能保存半扣款或半個池。換桌、改 BET、正常 reload 保留；Reset demo chips 只重設 balance，保留既有池。
- 這是同瀏覽器的 demo 保存，不是伺服器錢包、多裝置同步或後端續局。

## 公開牌參考算法與呈現契約

`calculateHoldemEquity({playerHole,board},{preflopSamples:100000})` 只用已知兩張玩家牌與 0／3／4／5 公牌。FLOP／TURN／RIVER 精確等權枚舉，PREFLOP 固定獨立抽樣；equity=(wins+ties/2)/outcomes，回傳 exact／method。這是標準德州參考，不使用結果目標／池／BOSS 暗牌，不等於新模型真實後驗。

`createBossHandRange({playerHole}).update({board})` 枚舉 BOSS 當前兩張未知牌，不補未來公牌；ready 回完整九類 distribution、candidateCount、exact:true。bossRangeContext 只含 playerHole。Worker 不收 config、hand、session、seed、target、池或暗牌。

`getShowdownView({playerHole,visibleBoard,revealedNpcHole})` 只讀已揭 BOSS 牌；一張已揭枚舉剩餘 44 張，兩張已揭顯示實際輸贏／平手。暗牌不因 highlight、aria 或 CSS 提前公開。

TOTAL WIN 讀 player.totalReturn、排除退款；BOSS WINS 用金色無框文字且不顯示金額。座位 SB／BB 不附 YOU，STARTING BET 保留 YOU／BOSS 盲注。createGameEffects、equity momentum、BGM／音效只做呈現，不讀目標或推進正式 RNG；音訊由使用者手勢啟動，公開揭牌才切換結果演出。

## 研究 API、報告與 Worker

```js
buildActionTree(config, {
  seed:123, firstSmallBlind:'player', policy:'balanced', stateLimit:100000
});
simulateTreeStudy(config, {deals:100, seed:20261005, policy:'balanced', onProgress});
simulateStudy(config, {
  players:1, entries:1000, seed:20261005, policy:'balanced',
  mode:'continuous', unlimitedBankroll:true, sliceSize:250,
  onProgress
});
```

玩家策略為 balanced／call／aggressive／tight。樹分析只接受受控 player／npc 首盲；完整樹保留零機率合法 edge，條件期望按路徑機率積分，不按葉子數計率。prebuilt 模式標記 `prebuilt-outcome-full-action-tree`、cardModel=`shared-engine-prebuilt-pools`。不足上限不能以截斷結果標 complete。

單手樹及 treeStudy 每副從設定初始三桶冷啟動，沒有跨手累積；只能代表冷啟動單手期望。一般工具研究固定無限資產連續遊玩，保留同一玩家跨手水池、CD、BOSS 與逐手隨機盲位，完成指定 entries。退幣使用有限起始資產，直到達標或不足開手門檻。對手刷新另列，不算 RTP。

`simulateRefundStudy(config,{players,initialAsset,targetAsset,seed,policy,onProgress})` 為退幣研究。v49 按「開始統計」即與一般統計一併執行，不再提供獨立退幣啟動按鈕；三項專用參數與分開展示、匯出的退幣報表維持。專用初始資產不經 `buyIn` 正規化補高，允許零；每人以獨立種子及個人初始池開始，逐手保留資產、雙池及 CD，沿用 `playAutomatedHand`／`syncOpponentBankroll`。先判餘額達標，再判 `handEntryStatus`，不設手數上限；不讀一般研究的 `entries` 或 `maxHandsPerPlayer`。全部玩家結束才回傳 `refundRate=targetPlayers/players`，另列 `insufficientPlayers`、手數與逐玩家最終餘額。剩餘資產不沒收，池額不直接算作錢包。這個比例不等於 RTP。

Worker 任務 `type:'run'` 新增 `refund` 專用參數（players／initialAsset／targetAsset），兩階段沿用同次 config、seed、policies。先完成全部一般策略，沿用 `progress`／`partial` 顯示一般進度與已完成策略；再完成全部退幣策略，發出 `refundProgress`（completedPlayers／totalPlayers／completedHands／currentPlayerHands）。兩階段全數完成後才發出最終 `result:{reports,refundReports}`，主按鈕此時才顯示完成。每個退幣策略完成後仍須等待全部退幣策略完成；不發出部分退幣報表或比例。主執行緒停止會 terminate Worker；停止或失敗保留本輪已完成的一般策略，取消本輪退幣結果。

`type:'refund'` 與其 `refundProgress`／`refundResult` 保留為既有介面相容，頁面不再單獨啟動此任務。退幣 JSON 匯出仍保存 `run.config`、`run.refund`（包含 seed／policies）及 reports，JSON／CSV／複製與一般報表分開。專用三項參數另存 `magic-poker-lite.refund-settings.v1`，不寫入遊戲的個人資產 profile。頁面只有單一「開始統計」流程。

baseRtp=ΣnetReturn/ΣmatchedWager，totalRtp=ΣtotalReturn/ΣmatchedWager，rtp 為 totalRtp 別名。池未派餘額不是回收；退款排除。新水池跨手相關，因此玩家研究按玩家聚類 CI，固定 BOSS 研究亦如此；樹研究按副樹。少於兩個獨立單位或零分母不可估 CI，罕見 JP 小樣本不作長期保證。

報告新增 outcomePoolSummary，分列開始／結束、使用、80%／20% 增加、特殊派出與 CD，並按三桶拆分；每玩家及每手的真實 audit 只算被選分支。完整欄位及實際版本以程式輸出為準。

simulation-worker 接受 type='run'／'refund'／'tree'／'treeStudy'；run 回 progress、partial、refundProgress、result，refund 回 refundProgress／refundResult，tree 回 treeResult，treeStudy 回 treeProgress／treeStudyResult，失敗回 error。停止以終止 Worker 實現；未完成樣本不能包裝為完整研究。

v51 一般工具固定 `mode:'continuous',unlimitedBankroll:true`，每位玩家完成指定 `entries`，沒有資產達標、資產不足或額外安全手數停止條件。無限資產選項只接受 continuous。其有限單手額度大於全部街道的最大合法累計投入，避免全下截斷及 Infinity 帳務；session、亂數、雙池與 CD 保留，額度不計入 RTP。報表 `unlimitedBankroll:true`、玩家 `start/end:null`、`endMeaning:'unlimited-bankroll'`、`maxHandsPerPlayer:null`。退幣研究仍使用有限初始資產及目標資產。

種子欄位空白時，主執行緒每次開始產生一個隨機 uint32，所有策略與兩種研究共用，執行快照及報表保存實際值；明確填入 0 仍為固定種子。設定匯出空白種子為 null，結果匯入還原實際種子。完整樹亦套用相同規則。

v51 一般統計的 JSON／複製資料為 version 9，包含 `reports` 與 `refundReports`，`run` 同時包含 `simulation` 與 `refund` 設定。參數匯出 version 6。退幣尚未完整完成、停止或失敗時 `refundReports` 為空；不將部分玩家包裝為退幣報表。既有退幣專用 JSON 格式維持 version 1。

## 本輪驗證

[門檻報告](output/entry-budget-local51.json) 完整運算 1,000 棵冷啟動樹，1,312,000 節點、750,000 終端。平均原始投入 4.5021886189627605 BET，95% CI [4.412775222367272,4.591602015558248]，向上取整維持 5 BET。機率質量、錢包守恆與池對帳均通過，來源雜湊在運算期間一致。

自動測試與瀏覽器檢查見 [docs/06](docs/06-mobile-and-deployment.md)。單手冷啟動校準不等於跨手池穩態或長期 RTP 認證；公開站是否已更新 v51，以本輪 Actions 部署結果為準。
