# v53 驗證與發布狀態

更新：2026-10-07。**方案B已完成並發布；正式模式pooled-holdem。519項測試、建置、Pages部署及公開站入場檢查通過。**

本頁記錄實際測試與部署證據，不把規格、計畫或舊模式結果當通過紀錄。當前需求見 [完整規格](16-v53-holdem-spec.md)；數學見 [規則與公式](04-game-flow-and-math.md)。

## 本輪正式驗證範圍

- 以pooled-holdem共用引擎驗證預建牌面、實付結果轉換、同街換NPC配對仍鎖概率、新街重算、原子開手／動作與RNG恢復。
- 德州首手抽盲／後手輪替、BB選擇權、多次加注、半池／全池／ALL IN、短全下不重開及未匹配全額退款。
- SB10／BB20／買入1000、BALANCE一次扣款、CHIPS跨手、不補碼、NPC匹配、離桌一次兌回、重整不重複交易。
- 三桶BB範圍、.99計分、80/20、CD、足額資格JP200/50/20BB及結算池對帳。
- 兩型交替與跨桌／重整續接、三情境公开機率、暗牌和分類原因不進公開DOM。
- 五空框及3/1/1發牌、買入飛行、真實CHECK/BET標籤、連接尺寸選單及320／375／393／412／1440px無水平溢出。
- 工具一般／退幣共用新mode，有限桌碼、外部錢包、歸零重入、正確總資產和有效投入、種子、報表、匯入匯出及中止完整性。
- 最終完整測試、靜態建置、Git推送、Actions成功及公開網址實際內容。

## 本輪正式整合驗證（2026-10-07）

- `npm test`：519／519通過，0失敗、0跳過；涵蓋正式pooled-holdem與明確指定模式的歷史回歸。紀錄：`output/tests-pooled-v53-final.log`。
- `npm run build`：成功，218個公開檔案；不收錄本機QA、Git資料、憑證或舊5BET門檻校準檔。`git diff --check`通過。
- 桌面Chrome viewport 320／375／393／412／1440px：入口置中、無水平溢出、尺寸選單不超出畫面，三個動作按鈕等高。
- SB10／BB20／買入1000：錢包10000→9000，盲注後玩家990、NPC980、POT30，五個虛線空框；買入飛行到達前CHIPS顯示0。既有三桶存量與CD保留，重整存檔完全一致。
- Flop顯示3牌、2空框及CHECK／BET；面對再加注仍可RAISE，驗證半池本次實付120。
- 下一手玩家／NPC起始碼同為1020、盲位及對手輪替。離桌錢包10020，重複點擊和重整不再入帳；再入場對手不重複。
- JP強制測試資格：SB10／BB20的皇家JP4000，ALL IN後按3／1／1補公牌，底池2000加JP4000，玩家桌碼6000、錢包仍9000；池帳784.08／196.02，重整不重派。
- 機率工具正式pooled-holdem：SB5／BB10、買入500、seed53，每策略2位×20手，共4策略160手；退幣每策略4位、共16位151手全部完成。320／375／1440px無水平溢出，JSON匯出成功且模型為pooled-holdem。資料：`output/study-pooled-v53-ui.json`。
- 瀏覽器腳本及截圖：`output/playwright/pooled-entry-v53.js`、`pooled-jp-v53.js`、`pooled-wallet-layout-v53.js`、`pooled-actions-v53.js`、`study-v53.js`；含`pooled-*-v53-393.png`及工具手機結果圖。這些本機測試檔不發布到Pages。

## v53發布紀錄

- 功能提交：[c5d5aca9f5d67d3e95b07ef4b371b7bd3e1bb457](https://github.com/Seven1888/magic-poker-lite/commit/c5d5aca9f5d67d3e95b07ef4b371b7bd3e1bb457)。已推送main。
- [Actions 37556303917](https://github.com/Seven1888/magic-poker-lite/actions/runs/37556303917)：build與deploy皆completed／success，線上測試及靜態建置通過。
- 公開遊戲、工具、HTML規則、v53完整規格、engine／pooled-holdem模組與樣式皆HTTP200，實際內容為v53。
- 公開站Chrome393×852重新入場：SB10扣買入1000，BALANCE9000；JP表頭隨選擇更新為4000，牌桌為pooled-holdem、五個空框。page／console錯誤0，HTTP失敗0。證據：`output/playwright/public-v53.js`、`public-entry-v53-393.png`、`public-game-v53-393.png`。
- 規則頁12節導覽、8表，320／393／1440px無水平溢出；`output/playwright/rulebook-v53.js`。
- 本次後續文件提交只回填上述實際發布證據；核心功能版本為c5d5aca。後續自動部署可於Actions查詢。

## 已完成的局部程式檢查

boss-profiles專項測試29／29通過，含pooled-holdem雙段抽樣標記、同街切換NPC配對保持原分類及新街重算。這只覆蓋該模組，不等於整個新mode、錢包、JP或部署驗證完成。

## 選方案B之前的候選證據

先前fixed-holdem候選完整測試483／483通過，建置產出215檔；其viewport及錢包流程、工具小樣本也完成檢查。紀錄在output/tests-v53.log、output/study-v53-ui.json及output/playwright內相關v53檔。

這些是固定牌自然勝負候選的歷史結果，**不能作為本次pooled-holdem保留水池／JP之整合證據**。任何v53字樣的舊output仍須核對實際config.outcome.mode，不能僅以檔名認定已驗證方案B。

## 前次正式發布：v52手機入口修正

最後已知公開提交為 `82a2cc5d19603ed098caec578733b66cfbcd11ca`；[Actions 37435730770](https://github.com/Seven1888/magic-poker-lite/actions/runs/37435730770) 完成439項測試、建置與部署。它不是本次v53的發布結果。

v52將入口BET標題與加減控制列明確置中。Chrome320／360／375／393／412／1440px、BET1／50／2000共18組及停用基礎樣式的對照檢查通過，金額控制中心偏差0px、無水平溢出、console/page error 0。證據為output/playwright/bet-v52-*。使用者截圖可重現偏左形態，但未據此斷定實體Android快取或網路原因。

更早v51數學對照、5BET門檻校準及完整分支樹樣本只屬舊玩法歷史，不再用作v53開局資產門檻。新規則固定買入100SB，不需要沿用舊5BET平均校準。

## 驗證範圍的描述限制

桌面Chrome裝置viewport不等於實體Android驗收。小樣本只驗證功能、帳務與研究流程，不是長期RTP認證。.99設定值不能取代實際投入／返還測量，水池未派餘額不列返還。發布必須同時核對Actions與公開頁面內容，不能只因本地build成功就宣稱上線。

## 入口

- 本地：[遊戲](http://127.0.0.1:4177/index.html?v=53)／[機率工具](http://127.0.0.1:4177/probability.html?v=53)／[規則](http://127.0.0.1:4177/docs/04-game-flow-and-math.html?v=53)
- 公開：[遊戲](https://seven1888.github.io/magic-poker-lite/)／[機率工具](https://seven1888.github.io/magic-poker-lite/probability.html)／[規則](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html)
- [GitHub](https://github.com/Seven1888/magic-poker-lite)／[Actions](https://github.com/Seven1888/magic-poker-lite/actions)

新聊天室以本輪交付訊息中的聊天室入口接續，先閱讀HANDOFF再接受後續需求。
