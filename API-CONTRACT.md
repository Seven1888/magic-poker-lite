# Magic Poker Lite v54 API 契約

2026-10-07，v54 已通過驗證並推送 Git／部署 Pages；包含 11 項呈現回饋及重整離桌修正。正式模式仍為 `pooled-holdem`，v53 遊戲數學及行為機率契約不改。呈現規格見 [docs/17](docs/17-v54-presentation-spec.md)，遊戲規格見 [docs/16](docs/16-v53-holdem-spec.md)，數學見 [docs/04](docs/04-game-flow-and-math.md)，驗證與發布見 [docs/06](docs/06-mobile-and-deployment.md)。

## Config 與 session

`normalizeConfig(source)` 預設正式模式；`targetRtp=1` 是帳務相容鍵，正式底池全額派彩。唯一結果計分係數是 `outcome.conversionRate`，預設0.99。正式模式保留JP設定；`fixed-holdem` 候選及明確 `prebuilt-pools`／`legacy-deck` 歷史API仍可供回歸，不能當工具目前預設。

指定SB時BB取兩倍；只提供BB時SB取其一半。最低買入設定取50BB／100SB，桌籌碼可因跨手輸贏與研究快照而使用正數有限值。正式入口另外以 `buyInFromWallet` 固定轉帳100SB，不能把通用config中的buyIn當允許同桌補碼。所有帳務保存六位小數。

`createSession(config,seed,{firstSmallBlind,outcomePools,lastBossProfileId})` 接受首盲random／player／npc，未指定為player以便可重現研究。正式入口用random；首手抽一次，其後HU輪替。上一型只能null／caller／maniac。session保存rng、stacks、handNumber、outcomePools、上一型、盲位、fees、jackpotAwards等。`activeHand` 是不可列舉指標，避免循環JSON。

`startHand(session)` 禁止未完手再開。正式模式只要求玩家有正數桌碼，每手扣盲前NPC匹配玩家。隔離session／RNG／資產中完成布局與root，成功才發布；布局失敗不提交盲注、池、手序或RNG。短盲強制跑完亦須先完成布局。

`beginNewTable(session,{buyIn=session.config.smallBlind*100}={})` 是一般／退幣研究的共用重入入口，只接受已結算舊桌的Holdem session；首桌由createSession保留首盲，不呼叫它。後續研究桌碼歸零、外部錢包允許買入時，由呼叫方處理錢包轉帳，再用本函式設定有限桌碼。它保留session身分、總handNumber、池／CD、累計費用／JP及lastBossProfileId，從同一條RNG序列抽一次新桌首盲，之後按桌內手序交替。回傳凍結事件`{type:'table-buy-in',tableNumber,openingHandNumber,buyIn,firstSmallBlind,probability:0.5}`。沒有已結算舊桌、牌局進行中或新桌尚未開手再次呼叫均拒絕；本函式不自行扣外部錢包，也不是局中補碼接口。

## 精簡結果控制器

`src/pooled-holdem.mjs` 匯出：

- `POOLED_HOLDEM_MODEL = 'pooled-holdem-v1'`。
- `initializePooledHoldem(hand,{dealHoles})`：只對尚未發布的hand使用；抽root一次，保留target及資格進行布局重試。
- `installPooledHoldemLayout(hand)`：從目前target讀既有配對，保留玩家牌、公牌序及已揭張數。
- `preparePooledHoldemAction(hand,action)`：正式動作隔離副本的路徑推進；玩家實付CALL/BET/RAISE才套用付費結果公式。
- `PooledHoldemBuildError`：布局超限code為LAYOUT_LIMIT，含attempts及rootTarget。

hand上的可序列化資料：

```js
pooledHoldem = {
  version: 1,
  model: 'pooled-holdem-v1',
  layout, // player、board、boss.win/nonWin、deckOrder、dealAudit
  rootTarget,
  layoutAttempts,
  transitionIndex
};
```

root win只需win配對；root nonWin同時需win與nonWin，因後續付款可能轉贏。nonWin包括輸或和。布局驗證確保牌不重複、玩家及公共牌一致、各配對符合目標。操作時不得再找牌；預建指候選牌面，並非預先物化所有動作的結果票與分支樹。

`outcomeDecision` 保存當前target、root／paid／inherited資料、資格及poolBranch；`outcomePoolsBefore` 是本手起始池。所有實際選中池路徑以同一個起始池還原，不把當前branch再扣一次。新街鎖定前先安裝當時選中NPC配對。

## 合法動作與原子提交

`legalActions(hand,actor=hand.actor)` 只為當前行動者回傳合法動作。正式模式委派 `legalHoldemActions`，每個動作包括：

```js
{
  id, type, label, amount, to, allIn,
  // BET/RAISE additionally:
  sizeKey, sizeKeys, fullRaise, raiseIncrement
}
```

amount為本次實付；to為本街累計。type為fold/check/call/bet/raise；尺寸ID如raise:half、raise:pot、raise:allin。同額合併後保留第一ID及所有sizeKeys。請傳完整物件或唯一ID；type-only相容入口預設半池，不能用於需要指定尺寸的UI或重播。物件指定amount/to必須吻合目前報價，過期金額拒絕。

P為行動前POT、C為尚需CALL差額、s為本街已付：

```text
half amount = C + 0.5 × (P + C)
pot amount  = C + 1.0 × (P + C)
to = s + amount
allin amount = remaining stack
minimumTo = currentBet + lastFullRaise
```

最小開注BB；lastFullRaise每街起始BB，完整進攻後改為實際完整增量。候選提高到minimumTo再以自己全下封頂。對方已無碼、自己不能超過currentBet或已行動且加注權未重開時不提供進攻。短全下不重開已行動者權限。`actedSinceFullRaise` 與 `lastFullRaise` 一起保存。HU未匹配款在結算全退。

`applyAction(hand,requested)` 在正式mode先解析合法動作，clone，推進結果／配對，再執行付款與街道變化，成功才發布至原hand/session。原hand物件身分保留。free／NPC動作不抽玩家付費結果。history存實際id、type、amount、to、street、allIn及尺寸來源。

Preflop SB先，後續BB先；SB補平盲注保留BB選擇權。合法完整加注可不限次數。FOLD立刻結算，雙方已無下注可進行時按街補牌。引擎可一次完成runout，UI仍按3/1/1呈現。

## 兩型與街道鎖定

`BOSS_PROFILE_IDS` 僅caller／maniac，版本 `two-boss-locked-street-v3`。正式rotate首型各0.5，之後排前型；fixed只供研究。sniper／trapper設定明確遷caller，舊自訂權重不恢復。

`classifyBossStrength` 只使用NPC底牌、已揭公牌及已完成街道歷史；完整強規則見docs/16。不得讀玩家暗牌、未來公牌或當前街價格。`lockBossStreetStrength(hand)` 於每街第一個動作前呼叫，同街冪等：

```js
hand.bossStreetStrength = {
  street, band, category, reasons,
  flushDraw, holeFlushDraw,
  openEndedStraightDraw, holeOpenEndedStraightDraw,
  gutshot, holeGutshot, straightDraw
};
hand.bossStreetStates = {preflop, flop, turn, river};
```

只有已到達的街存在。快照包含判定證據，深度隔離，禁止公開原因。換NPC配對不改當街快照；新街依目前配對重判。River所需Turn聽牌證據取已存Turn快照及實際Turn進攻歷史。

`getBossProbabilityScenarios(hand)` 是公開數字API，不回band、reasons或cards：

```js
{
  facing: {fold, call, raise},
  free: {check, raise},
  noRaise: {fold, call},
  sizes: {half: 0.5, pot: 0.35, allin: 0.15}
}
```

所有值為0..1。正常F/C/R依激進強5/25/70、不激進強5/65/30、激進不強45/55/0、不激進不強25/75/0。免費F+C合CHECK；不能加注F/C正規化；僅能CHECK時100%。

`getBossProfileDistribution(hand,legalActions)` 保留完整合法動作、各尺寸joint probability及bossSizing:true。按sizeKeys加總50/35/15，不能每個合法尺寸直接均分。尺寸受最小額／全下合併可能使實際ALL IN超過15%。

`getActionDistribution` 供玩家策略與NPC共用；NPC每回合重抽行為但不重判分類。`sampleDistribution(distribution,rng)` NPC先抽行為roll，選BET/RAISE再抽sizeRoll；單一合併進攻尺寸亦抽第二票。回傳完整動作、joint probability、roll、sizeRoll（若有）和原陣列index。一般玩家策略採自身分布，不套NPC雙段標記。

## Clone、預覽與恢復

`cloneHand(hand,{compactPools})` 隔離RNG、籌碼、牌、history、result、池、outcomeDecision、pooledHoldem、actedSinceFullRaise、bossStreetStrength及bossStreetStates。`previewResponse(hand,action)` 只在clone試動作；回傳同街NPC分布或空陣列，不提交正式RNG、分類、牌面、資產或池。`stepNpc`／`playAutomatedHand` 提交完整抽選動作，不丟尺寸。

`src/action-options-view.mjs` 的 `actionResponsePreview(hand,action)` 接受完整合法動作，依 `previewResponse` 結果聚合同 type 行為百分比供顯示，不能把不同尺寸輸入壓成 type。無同街回應時，跨街顯示 `NEXT STREET`，已結算顯示 `SHOWDOWN`，不提供未公開牌街的機率。`raiseMenuChoices(actions)` 只排序已有合法候選，畫面由上到下 ALL IN／1× POT／0.5× POT；`raiseSizeLabel` 沿用 `allIn`、`sizeKeys`，同額不另造重複動作。展開選單與逐項預覽不提交正式 RNG 或結果票。

`buyInFromWallet(balance,smallBlind)` 回傳balance、chips、buyIn；檢查有限非負金額及足額100SB。`cashOutToWallet(balance,chips)` 回傳總額，不自行決定可否離桌；一般離桌按鈕只允許非忙碌且非未完手。載入時另以舊桌結束流程處理保存中的牌局。

`snapshotTableSession(session)` 接受pooled-holdem／fixed-holdem，輸出 `{version:1,rngState,session,hand}`，移除hand的session/rng指標再深拷貝。plain pooledHoldem及街道快照自然包含其中。`restoreTableSession(snapshot)` 重建rng，重接hand/session/stacks，不重新布局或抽牌。兩者保留為底層帳務／研究API；遊戲UI在重整或重開頁面時結束舊桌並回買入入口，不接續舊牌局。

`endHandForTableExit(hand)` 由引擎結束離桌中的牌局。未完手按玩家棄牌處理，即使目前可免費CHECK或actor為NPC；沿用正常結算、未匹配退款及池帳。玩家已全下且待NPC回應時，使用保存RNG依正常NPC分布回應並完成結算，不改成玩家棄牌或重新抽牌。已結算手不重複派彩。

`closeSavedTable(profile)` 是table-wallet的純轉換，不讀寫storage，也不修改輸入profile。它從快照重建舊桌、必要時呼叫 `endHandForTableExit`，將剩餘玩家籌碼兌回BALANCE，保留結算後雙池／CD及上一對手，產生 `table: null` 的profile。尚未開手時兌回全部桌籌碼；空table不重複兌回。呼叫方須先以一次profile保存提交此結果，成功後才允許新買入；失敗時保留原存檔並阻止新買入。這是本機單瀏覽器帳務，非伺服器帳本或跨裝置／多分頁同步。

## 個人水池與特殊獎

`createOutcomePools`／`normalizeOutcomePools`／`compactOutcomePools` 保存version1、三桶paidAction／special、全域paidActionCooldown、qualificationSequence、handSequence和lastSettlement。以BB範圍歸桶：低≤10、中≤500、高>500，BB須正數；既有池存量不搬移。

`drawRootPoolOutcome({hand,rng,pools,config})`、`drawPaidPoolOutcome({hand,action,previousDecision,rng,config,nodeId})` 產出選中路徑決策。計分α與票量化詳見docs/04。原win繼承不抽結果、不用池、不減CD；nonWin實付才用公式。結果目標與特殊資格在布局重試間不重抽。

`applyBranchPools({pools,decision,handId})` 以本手起始pools套當前branch；pendingWinPaidCredits未到結算不能提前入池。`settleOutcomePools({pools,decision,matchedWager,reason,winner,actualTier,handId})` 回傳pools、audit、specialAward、alreadySettled。同一已結算池重交handId不重派。

credit的from/to是玩家累計投入區間，effectivePaid=max(0,min(to,matchedWager)-from)。有效計分80%進付費池、20%進特殊池；退款與盲注不入池。audit列before/after、實際使用、入池、JP、CD、credits、paidEvents及qualification，不把未選操作算入。

JP先root win+enabled+特殊池足額，選最高可負擔royal200、straightFlush50、quads20倍BB，再抽預設20%資格。布局需精確tier且玩家底牌參與、公牌本身非特殊；無資格布局不自行派自然JP。只有玩家獲勝showdown且實際tier吻合才扣池派獎；fold不派、當手收入不補開局資格。`quoteJackpot` 只報價，不授權派獎。

## 結算與profile

m=min(Cplayer,Cnpc)，各退款Ci-m；匹配POT=2m，勝方gross=2m、平手各m。fee=0、netReturn=gross、totalReturn=netReturn+JP、profit=totalReturn-m，stackAfter=stackBefore-Ci+refund+totalReturn。雙方桌碼總和只因實際JP增加；對手下一手配置另列，不混入派彩。

result保存reason、winner、folded、pot、gross、fee、net、totalReturn、jackpot、outcomePoolAudit、board、evaluations，及每座位totalContribution、matchedWager、refund、gross、fee、netReturn、jackpotAward、totalReturn、baseProfit、profit、stackBefore/After。

v54 POT 收回表演按每個收款者的 `netReturn` 播放一次整包移動；平手為雙方各自的一包。退款與 JP 保留獨立帳務及呈現階段，不併成另一筆底池收入。玩家籌碼、TOTAL WIN 與 POT 顯示由同一進度對應已提交的結算金額；動畫 callback 不修改引擎資產，不二次派彩。結算表演結束且玩家桌碼為 0 時，UI 自動執行離桌並返回選 SB／FIGHT 入口，不在同桌補碼、不自動扣下次買入。

`playBuyInFlight({root,reducedMotion,amounts,duration=1400,onProgress})` 僅呈現已提交的買入。實際時長 `max(1000,duration)` ms，不除以遊戲速度；`onProgress` 提供雙方由 0 至買入額的顯示值及完成旗標，目的區籌碼堆與數字一起更新。飛行籌碼抵達後由實體堆接續，不淡出成空桌；完成後才能下盲、發牌。尚未完成買入時雙方手牌區皆為空，包含背牌。

profile key `magic-poker-lite.player.v1`，現用version2：balance、outcomePools、table及lastBossProfileId。接受version1舊餘額／池；不得因研究設定匯入覆寫。load失敗回null；save以一次setItem存整筆，成功true／storage不可用false並由UI提示。正式買入、開手、動作、結算和離桌均保存，table=null代表沒有待兌回舊桌。載入舊桌時先結算並保存包含BALANCE、雙池／CD、上一型及空table的整筆profile，不能只清table而丟失桌籌碼，也不能在保存失敗後繼續新買入。

## 公開資訊與研究

公開牌參考算法只收playerHole、board；對手牌型range只枚舉公開牌下未知兩張牌。雙方底牌發完即可啟動：Preflop 排除玩家兩張牌後，精確列舉 C(50,2)=1,225 組，按兩張底牌當前的 Pair／High Card 分類；不補未來公牌，不是最終河牌預測。Flop／Turn／River 依已揭公共牌計算當前最佳五張分布。不可傳hand、target、pool、NPC實際牌或未來board給公開Worker。showdown view只能讀已揭NPC牌；牌背aria/CSS/DOM亦不能含暗牌。機率預覽可聚合 type 顯示，但引擎與動作輸入不丟尺寸。

`simulateStudy` 與 `simulateRefundStudy` 共用正式引擎。一般continuous／unlimitedBankroll是外部錢包無限，每次入桌有限100SB，桌碼跨手，歸零才模擬新入桌；tableEntries/tableBuyIns單列，買入不是投入。退幣initialAsset與targetAsset為錢包+桌碼總資產，池排除；達標或無碼且不足新買入才停，不設額外手數上限。

每位研究玩家獨立池與RNG，跨手及研究重入保留池／CD／對手序列。四個玩家策略balanced/call/aggressive/tight保留。種子空白開始時隨機一次、0有效，全部策略及一般／退幣共用該次seed，結果保存實際mode/seed。

Worker的run先發一般progress/partial，再refundProgress，全部策略退幣完成才回result:{reports,refundReports}；停止或失敗保留完成一般報表，不發布部分退幣比例。歷史tree/treeStudy介面可保留，正式pooled-holdem不能宣稱預先列舉完整NL樹，抽樣路徑不當成完整樹。

baseRtp=ΣnetReturn/ΣmatchedWager，totalRtp=ΣtotalReturn/ΣmatchedWager，rtp為totalRtp別名；退款和池未派餘額排除。CI按玩家聚類，樣本不足／零分母不可估。outcomePoolSummary依三桶對帳，重入及對手配置不計收益。實際報表版本以輸出欄位為準，不沿用舊模式數字冒充新驗證。
