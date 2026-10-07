# Magic Poker Lite v55 接手紀錄

更新：2026-10-07。**v55 本地驗證完成，已推送 Git 並部署 Pages，公開內容驗收通過。** 本節與 [v55 八項規格](docs/18-v55-feedback-spec.md) 優先；下方 v54／v53 全文僅保留歷史證據與背景，不代表本次驗證或待辦。

## 本輪授權與接手方式

使用者已要求八項全部調整好、一起更新 Git，完成後再開新聊天室交接，並由新聊天室提供相關連結。原聊天室負責完成實作、驗證與發布；新聊天室先讀 `AGENTS.md`、本文件、`docs/18-v55-feedback-spec.md`、`docs/16-v53-holdem-spec.md`、`docs/06-mobile-and-deployment.md`，確認實際發布狀態，直接提供下列相關連結，然後等待新需求。交接本身不授權重做已完成實作、提交、推送或部署，也不需再開另一個聊天室。

唯一可修改專案為 `C:/Users/User/Desktop/新Magic Poker/Magic Poker Lite`。同層 Boss Duel、Hands Up、Final Table 永久唯讀。沿用現有 checkout；遊戲英文，工具、文件與溝通繁體中文。方案 B `pooled-holdem`、.99 計分、三桶雙池／CD／JP、兩型對手、每街鎖定機率及原有買入／兌回帳務已定案，不重新詢問方案。

## v55 八項與帳務邊界

1. 抽盲保留桌面其他資訊，硬幣不遮 `DRAWING YOUR BLIND`；去掉 `BLIND POSITION`。
2. 三按鈕維持 66 px，主字縮小、籌碼圖示與費用放大、RAISE 箭頭動態；尺寸旁 BOSS 決策框縮窄，以標籤底色作整圈厚邊框。
3. 真正單一行為 100% 跳過抽取表演，正式行為與尺寸 RNG 不變；四捨五入成 100% 不視為確定。
4. CHECK／CALL 跨街預覽改為 `DEAL FLOP／DEAL TURN／DEAL RIVER`，結算用 `SHOWDOWN`；不冠 BOSS、不提前洩漏牌面或下街機率。
5. `TOTAL WIN／BOSS WIN` 自收款開始即在前景，籌碼持續由文字後方飛向勝方，數字和桌碼同步，完整表演實際 2 秒。退款與 JP 仍分別對帳，動畫不重複派款。
6. 買入取消資產飛行，雙方原位逐步堆高與數字累加；預設 1.4 秒、至少 1 秒，期間雙方無底牌／背牌。上方 `TOTAL BALANCE = 桌外錢包 + 呈現中的玩家桌碼`，買入動畫期間使用完整買入碼；帶入／離桌不改總額，下注減、退款／收款加。`profile.balance` 仍只存桌外錢包，絕不能把總額再次存為錢包。
7. 雙方共用 BB 尺度：50 BB 對應 18 顆視覺碼、上限 45；同額同層數同高。新桌換盲注重新標定，個別座位歸零或派彩不另改尺度。
8. 下注至 POT 與 POT 至勝方的飛行籌碼在一般資訊上方；只有 `TOTAL WIN／BOSS WIN` 文字在其前景。

重整沿用 v54：先結束舊桌帳務再回入口，保留錢包／雙池／CD／上一對手；未完手離桌棄牌，全下待 NPC 則用保存 RNG 完成，餘碼只兌回一次。新總餘額呈現不改此持久化契約。

## v55 驗證與發布狀態

本地驗證完成，已推送 Git 並部署 Pages，公開內容驗收通過。`npm test` 560／560 全過（約20.1秒，`output/tests-v55.log`），靜態建置233檔。詳細本輪證據見 [發布紀錄](docs/06-mobile-and-deployment.md)，不沿用v54數字。

- 隔離本機4178的桌面Chrome：320／375／393／412／1440無水平溢出，三按鈕CSS高66px（縮放後視覺較小），尺寸機率框3px外框。`output/playwright/actions-v55-393.png`及原聊天室Cua工具紀錄保留畫面與取樣證據。
- 買入期間無牌／無資產飛行、總餘額不減；同額980皆18顆、同額2000皆36顆。抽盲57次取樣桌面元素保留，行動文字與硬幣無重疊。100%CHECK流程64次取樣無抽取影格；CALL後DEAL FLOP、下個CHECK預覽DEAL TURN。
- 玩家全下4000／8000收款的WIN、桌碼、TOTAL BALANCE同步；BOSS勝出以玩家棄牌、先退10再收20案例驗證，同樣同步。取樣跨度約2秒，精確2000ms與JP／平手／中斷由自動測試覆蓋。籌碼z200、WIN z210，截圖確認資訊遮擋順序。
- 連續兩次重整回入口，TOTAL BALANCE16990、保存table清空且不重複兌回；console warning/error皆0。另一次100籌碼買入19次取樣，雙方金額與顆數一致、總額16990維持。

這是桌面Chrome手機viewport，不是實體Android。本輪瀏覽器BOSS勝出測的是棄牌，沒有宣稱完整全下輸光流程已重測。BUYING IN提示已通過瀏覽器買入取樣；最後行動階段與總餘額專項7／7通過。功能提交92c6affef0dc08bdec3b8faa47b775edf865fb83已推送；Actions 37569472742 completed／success，公開入口、15份主要檔案與本地原始碼比對通過。新聊天室由本輪交付建立。

## 新聊天室應提供的相關連結

- 公開：[遊戲 v55](https://seven1888.github.io/magic-poker-lite/?v=55)／[機率工具 v55](https://seven1888.github.io/magic-poker-lite/probability.html?v=55)／[規則與公式](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html?v=55)。本輪公開狀態需依上節紀錄確認。
- 本地：[遊戲 v55](http://127.0.0.1:4177/index.html?v=55)／[機率工具 v55](http://127.0.0.1:4177/probability.html?v=55)／[規則與公式](http://127.0.0.1:4177/docs/04-game-flow-and-math.html?v=55)。需本機 4177 服務運行；在本專案用 `npm start` 啟動，Node >= 20。
- Git：[Repository](https://github.com/Seven1888/magic-poker-lite)／[Actions](https://github.com/Seven1888/magic-poker-lite/actions)；本輪實際提交與成功 workflow 連結由發布紀錄取得，不沿用 v54 的 run。
- 文件：[README](https://github.com/Seven1888/magic-poker-lite/blob/main/README.md)／[AGENTS](https://github.com/Seven1888/magic-poker-lite/blob/main/AGENTS.md)／[HANDOFF](https://github.com/Seven1888/magic-poker-lite/blob/main/HANDOFF.md)／[v55 八項規格](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/18-v55-feedback-spec.md)／[v53 遊戲與數學](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/16-v53-holdem-spec.md)／[v54 歷史規格](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/17-v54-presentation-spec.md)／[API](https://github.com/Seven1888/magic-poker-lite/blob/main/API-CONTRACT.md)／[驗證與發布](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/06-mobile-and-deployment.md)。
- 美術：[既有按鈕資產](https://github.com/Seven1888/magic-poker-lite/tree/main/assets/action-buttons-v54)／[完整生成提示詞](https://github.com/Seven1888/magic-poker-lite/blob/main/assets/action-buttons-v54/prompts.txt)。資料夾仍為 v54，v55 調整其文字、金額與箭頭呈現。

---

## v54 歷史接手紀錄（已完成，以下保留原文）

更新：2026-10-07。**v54 全部 11 項與重整修正已完成，552 項測試通過，已推送 Git／部署 Pages 並完成公開流程驗收。** 新聊天室由本輪交付訊息提供，接手後先讀文件等待新需求。

## 本輪優先接手資訊

原本先記錄、等待「調整」的限制已由使用者本輪完整授權取代，11 項呈現需求已全部完成。正式 `pooled-holdem`、.99 計分、雙池／CD／JP、對手兩型與每街機率維持。完整需求見 [v54 規格](docs/17-v54-presentation-spec.md)，數學仍以 [v53 規格](docs/16-v53-holdem-spec.md) 為準，不再詢問方案 B 選擇。

接手後先只讀本 HANDOFF、AGENTS、v54 規格與 v53 遊戲規格，簡短確認接手並等待新需求；不要重新實作、提交、推送或部署已完成的工作。下方保留本輪實際測試、提交與公開驗收證據。

## v54 完整 11 項

1. RAISE 選單由下往上 0.5× POT／1× POT／ALL IN，亦即由上往下 ALL IN／1× POT／0.5× POT；同額仍依引擎合併。
2. 入場雙方沒有手牌或背牌。雙方買入動畫至少 1 秒（預設 1,400 ms、最低 1,000 ms，不除以遊戲速度）；籌碼飛至各自區域後逐步堆成實體碼，不淡出消失，金額由 0 同步累加至買入額，完成後才下盲發牌。
3. 移除籌碼上方 CHIPS 文字，保留籌碼堆及金額。
4. 取消 NPC 手牌下方的行為機率橫條，移至玩家按鈕上方；三按鈕保持目前尺寸與 66 px 高度，將上方至行動資訊的整段區域向上移以騰出空間。
5. 雙方底牌發完即顯示 NPC 牌型參考；Preflop 排除玩家牌後精確枚舉 1,225 組未知兩張牌的 Pair／High Card，非河牌預測，不讀實際 NPC 牌；翻牌後沿用當前最佳五張分布。
6. CHECK／CALL 下方 FREE 或金額前加籌碼圖示。
7. RAISE 每個合法尺寸左側顯示該精確動作的 NPC 回應機率；預覽不推進正式 RNG。CHECK／CALL 若結束本街顯示 NEXT STREET，不洩漏下一街機率。
8. 每位收款者應得 POT 一次整包收回、數字連續累加，玩家 TOTAL WIN 與籌碼同步上跑；退款／JP 獨立帳務，動畫不再加錢。
9. 玩家 ALL IN 輸光、籌碼歸零後先播完結果，再自動離桌回 SB／BUY-IN，不需手動離桌，不在同桌補碼。
10. 入口由左到右可調 SB／連動 BB／連動 BUY-IN，BB = 2 SB、BUY-IN = 100 SB。
11. 依現有美術以 GPT 生成五狀態 FOLD／CHECK／CALL／BET／RAISE 透明按鈕；主文字美術字，RAISE AMOUNT 改 RAISE ▲，三尺寸金額前也加籌碼圖示。資產與內建 ImageGen 最終提示詞位於 `assets/action-buttons-v54/`。

## 隨 v54 一併交付的重整修正

- 頁面載入時結束保存中的舊桌，再回買入入口；保留 BALANCE、雙池、CD 與上一型。
- 未完成手按玩家離桌棄牌結算，即使可免費 CHECK 或正在等 NPC。已全下等待 NPC 時，用保存的 RNG 正常抽 NPC 回應並完成結算；已結算手不重派。
- 退還未匹配投入，剩餘玩家 CHIPS 回 BALANCE 一次；買入動畫尚未開手時兌回全部桌籌碼。
- 一次保存 BALANCE、結算後雙池／CD、上一型與 `table: null`。保存失敗保留原存檔並阻止新買入，不重設初始資產。
- 引擎 `endHandForTableExit(hand)` 與 table-wallet 純轉換 `closeSavedTable(profile)` 處理帳務；snapshot／restore 底層保留供結束舊桌及研究使用，UI 不再接續舊手。
- 先前重整單項本地驗證：`npm test` 529／529 通過（含新增 10 項重整帳務測試，紀錄 `output/tests-reload-v53.log`）；`npm run build` 成功 218 檔；`git diff --check` 通過。隔離 Chrome 實際 FIGHT 後重整回買入入口，結算餘額 9,998、table 清空，連續重整資產不變、page error 0；另驗證保存失敗保留原存檔並禁用買入，恢復寫入後兌回未開手的 1,000 籌碼、BALANCE 回 10,000。腳本及截圖在 `output/playwright/check-reload*.js`、`output/playwright/reload-entry-v53.png`。這些是加入 11 項呈現需求之前的結果，不能當成 v54 完整驗證。

## v54 驗證與發布完成

- `npm test`：552／552 通過，0 失敗、0 跳過；紀錄 `output/tests-v54.log`。`npm run build`：228 個公開檔案。攤牌標籤上移後亦確認不與行動資訊重疊。
- 桌面 Chrome 320／375／393／412／1440 px 無水平溢出，三按鈕 computed height 均 66 px；三尺寸由上 ALL IN／1×／0.5×，每項均有籌碼圖示及左側回應機率。
- `output/playwright/qa-v54.js`：兩場買入各取樣 84 個 rAF frames、1,383 ms，期間雙方 card count 全為 0，籌碼堆／數字單調增加；發牌完成後即顯示 Pair 5.9%／High Card 94.1%（該測試底牌的當前分布）。
- seed 0 玩家全下獲勝後桌碼 2,000；收款取樣 108 frames、48 個不同數值，TOTAL WIN 與玩家籌碼完全同步，每位收款者一個飛行 group、來源堆隱藏。seed 7 全下輸光後桌碼 0，自動回入口，BALANCE 9,000、`table: null`。page error 0、request failed 0。
- 截圖：`output/playwright/v54-raise-{320,375,393,412,1440}.png`、`v54-player-win-393.png`、`v54-auto-buyin-393.png`。完整本地證據見 [驗證紀錄](docs/06-mobile-and-deployment.md)；不是實體 Android 或長期 RTP 證據。
- 功能提交 [efb8f02af19055a2ce8cb3799e62396c1bf356b7](https://github.com/Seven1888/magic-poker-lite/commit/efb8f02af19055a2ce8cb3799e62396c1bf356b7) 已推送；[Actions 37561736242](https://github.com/Seven1888/magic-poker-lite/actions/runs/37561736242) 的 build／deploy 均 completed／success。
- `output/playwright/public-v54.js` 公開驗收：遊戲、工具與 HTML 規則均為 v54；SB10／BB20／BUY-IN1000，入口無初始牌，三藝術按鈕、三尺寸預覽與 Preflop 牌型參考正常。補充驗收等待按鈕圖片 `complete && naturalWidth > 0` 及完整 PAIR 文字後再截圖，腳本 exit 0，按鈕資產完整載入已核對。重整返回入口，BALANCE9,990、`table: null`；v54 規格、prompts、action-options 與 chip-motion HTTP200。page／console errors 0、HTTP fail 0。
- 新聊天室由本輪交付訊息提供，接手後先讀文件等待新需求。

以下保留原 v53 方案 B 發布紀錄；v54 呈現及重整行為以本輪資訊及現行規格為準。

**原發布狀態：方案 B 已完成、推送 Git 並部署 Pages；當時519項測試通過，公開站已驗證。**

## 原發布輪目標與授權

使用者先回報 Android 入口 BET 偏左，之後確認全面調整德州流程、下注、對手策略和實際買入；要求全部完成後一併上 Git、提供全部對外連結，再開新聊天室。提交、推送及新聊天室均已授權，完成必要驗證後執行，不再詢問相同授權。

只處理 `C:/Users/User/Desktop/新Magic Poker/Magic Poker Lite`。同層 Boss Duel、Hands Up、Final Table 永久唯讀。沿用 checkout，不重設使用者／同伴修改。遊戲英文，工具與文件繁體中文。

## v53 遊戲與數學規格（v54 續用）

遊戲數學以 [v53 規格](docs/16-v53-holdem-spec.md)、[規則](docs/04-game-flow-and-math.md)、[API](API-CONTRACT.md) 為準；v54 呈現以 [v54 規格](docs/17-v54-presentation-spec.md) 為準。已選 `pooled-holdem`，不再等待結果模型選擇。

- 保留原 .99 計分、個人雙池、CD 及 JP。開手固定玩家牌／公牌序、預建 NPC win／nonWin 配對；實付時抽原公式結果並讀既存配對。nonWin 可和局。精簡控制器保存所選路徑，不展開完整 NL 樹。
- 五個公共牌虛線空框，依3/1/1發出。首次50/50盲位，其後HU輪替。CHECK/CALL、BET/RAISE 真實標籤；反覆合法再加注；半池／全池／ALL IN 選單連接進攻按鈕。
- SB為選單數值，BB=2SB，買入100SB。SB10買入1000、BB20，皇家JP4000。BALANCE先扣款、錢飛至CHIPS後下盲。桌碼跨手累積、同桌不可補碼，NPC每手匹配玩家起始碼，離桌剩碼只返一次。
- 只留caller不激進、maniac激進，正式遊戲交替、跨離桌和重整續接；研究固定型可保留。舊sniper/trapper遷caller。
- 每街在任何行動前鎖強弱；同街換NPC牌、玩家下注或再加注不重判。新街用當時配對重算。強條件、詐唬證據與概率詳見規格表。每NPC回合先抽行為，進攻再抽50/35/15尺寸。
- 三個公開機率情境不含NPC牌／原因；公共參考勝率不讀秘密資訊。
- 池桶依BB範圍0<BB≤10、10<BB≤500、BB>500，原存量不動；JP200/50/20BB僅有足額資格且獲勝攤牌才派。
- version2 profile保存錢包、池、上一型及active table；牌局、布局、結果、鎖街與RNG一起保存。設定匯入不改資產。原v53發布版重整續局；v54已改為結束舊桌帳務後回買入入口。
- 一般研究外部資產無限，但有限100SB桌碼；歸零才模擬新入場。退幣以錢包加桌碼計總資產，不把池當資產，不發布部分退幣比例。

## 主要檔案

| 檔案 | 責任 |
| --- | --- |
| src/engine.mjs | HU引擎、原子開手／動作、結算、雙段NPC抽樣 |
| src/engine.mjs 的 beginNewTable | 一般／退幣共用重入；同RNG新抽首盲、保留累計／池／CD／上一型 |
| src/holdem-betting.mjs | 3尺寸、最小加注、短全下、唯一動作ID |
| src/pooled-holdem.mjs | 開手布局與所選路徑結果控制 |
| src/outcome-pools.mjs | .99公式、三桶雙池、CD、JP、對帳 |
| src/boss-profiles.mjs | 兩型輪替、強弱判定、街道鎖、公開三情境 |
| src/table-wallet.mjs / outcome-profile.mjs | 買入／兌回、active hand snapshot、錢包與池持久化 |
| src/game.mjs / styles/holdem-v53.css / src/action-options-view.mjs | 入口、連接尺寸選單及逐項預覽、對手資訊、保存與動畫 |
| src/buyin-flight.mjs / pot-view.mjs / bankroll-view.mjs | 買入堆疊、一次整包收款、同步數字呈現 |
| src/boss-hand-range.mjs / boss-range-controller.mjs | Preflop 起的公開當前牌型參考 |
| assets/action-buttons-v54/ | 五張透明美術按鈕與內建 ImageGen 提示詞紀錄 |
| src/simulation-study.mjs / refund-study.mjs | 有限桌碼／外部錢包研究，正式模型共用 |
| docs/16-v53-holdem-spec.md | v53 正式玩法與數學規格 |
| docs/17-v54-presentation-spec.md | v54 全部 11 項、重整修正與呈現邊界 |

## 原發布輪驗證與交付狀態

正式pooled-holdem的`npm test`已519／519通過，`npm run build`成功218檔，diff空白檢查通過。Chrome320／375／393／412／1440px、買入／離桌／重整、五空框、CHECK／BET／再加注及皇家JP實派都已驗證；工具4策略共160手、16位151手退幣流程與JSON匯出完成。詳見 [驗證紀錄](docs/06-mobile-and-deployment.md)。

研究重入使用 `beginNewTable(session,{buyIn})`，首桌不額外呼叫；後續已結算、歸零且外部錢包允許時重入。新桌首盲從同RNG抽一次，其後依桌內手序交替；總手數及累計資料不重設。函式不自行扣外部錢包，不允許未完手或新桌未開手時重複重入。

先前fixed-holdem候選483項結果只屬歷史。原方案 B 功能提交為 [c5d5aca](https://github.com/Seven1888/magic-poker-lite/commit/c5d5aca9f5d67d3e95b07ef4b371b7bd3e1bb457)，[Actions 37556303917](https://github.com/Seven1888/magic-poker-lite/actions/runs/37556303917)測試／建置／部署成功。當時公開站入場驗證模式、買入、JP表頭及五空框，page／console錯誤0、HTTP失敗0。其後文件提交僅補原發布紀錄，當時核心程式未再改動。

## 連結

- [GitHub](https://github.com/Seven1888/magic-poker-lite)／[Actions](https://github.com/Seven1888/magic-poker-lite/actions)
- [公開遊戲](https://seven1888.github.io/magic-poker-lite/?v=54)／[機率工具](https://seven1888.github.io/magic-poker-lite/probability.html?v=54)／[規則](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html?v=54)；v54 已部署並完成公開內容驗收。
- [本地遊戲v54](http://127.0.0.1:4177/index.html?v=54)／[本地機率工具v54](http://127.0.0.1:4177/probability.html?v=54)／[本地規則](http://127.0.0.1:4177/docs/04-game-flow-and-math.html?v=54)。
- [v54 完整規格](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/17-v54-presentation-spec.md)（已推送且公開 HTTP200）；v52基準`82a2cc5`與上述v53提交僅供歷史比較。

v53 方案 B 及 v54 全部需求、驗證與發布均已完成，無須重做。新聊天室由本輪交付訊息提供，接手後先讀文件等待新需求。
