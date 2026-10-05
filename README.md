# Magic Poker Lite

手機直版、第一人稱的 1v1 簡化德州原型：兩張底牌、五張公共牌、四街下注、真實對手行動機率。遊戲介面英文，機率工作台與文件繁體中文；預設資產 **10,000**。

- [遊戲 Demo](https://seven1888.github.io/magic-poker-lite/?v=36)
- [機率工作台：完整行動樹與玩家統計](https://seven1888.github.io/magic-poker-lite/probability.html?v=36)
- [模型文件：公式、分母與帳務案例](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html?v=36)

目前整理 v36 介面：隱藏 BOSS 名稱、上移角色與底牌，依序安排角色牌／行動資訊／公共牌／POT／玩家手牌；加強雙方最佳五張對比，NEXT HAND 即時換角並補上慢圖轉場。牌型等正面展開後更新，按鈕上方機率改為左側 BOSS、右側數值的單一區塊。本輪驗證與發布狀態以 [docs/06](docs/06-mobile-and-deployment.md) 為準，交接見 [v36 交接](docs/08-v36-handoff.md)。

## 目前機率工具

- 單副牌完整展開雙方所有合法動作，包含零機率分支；預設可有 **1,312 節點、750 終端**。節點列狀態、實付、到達機率、條件期望與結算。
- 抽樣牌序，每副牌完整積分動作樹後再平均；完整的是合法操作分支，並非枚舉全部 52 張牌的排列，不能用贏的葉子數除以總葉子數。
- 三種玩家統計：每手重設資產、連續遊玩、資產達標。連續模式保留玩家餘額，BOSS 局間資產刷新另列；達安全上限列截尾。
- 四種策略、玩家／動作／街道／盲位／JP／資產／切片報表，Worker 執行與停止、設定保存、JSON／CSV 匯出。
- 比率 CI：四型輪替／連續／達標按玩家聚類；固定對手的獨立牌局按手；樹統計按副牌。每份結果保留參數、種子、模式與樣本單位。
- 起手重抽適配 Boss Duel 結構：兩張未成對時玩家 50%／BOSS 25%，最多重抽 50 次；成對即停，接受最後候選。舊 targetScore 設定明確保留 legacy-score 模式。

四型 BOSS 採固定逐街／牌力機率表；config.npc 只供模擬玩家策略及 legacy BOSS 使用。初遇各 25%，下一手排除上一型，其餘各 1/3；工具可選輪替、固定對手或舊模型。

## 玩法與呈現

小盲自動投入半 BET、大盲一 BET；翻牌前小盲先動，後三街大盲先動，逐手換位。每街最多一次加注。雙方畫面固定 FOLD／CALL／RAISE，底層仍區分 check／call／bet／raise；付費列本次新增支付，免費 CALL 與 FOLD 不列金額。

開局只說先後及雙方初始投入。對手機率獨立浮在按鈕上方，每組只保留一個 BOSS，標題與數值異色；玩家籌碼先抵達 POT，再飛標籤、演 BOSS 決策。對手底牌與行動底板都在公共牌上方，玩家手牌上方直接是 POT。玩家最佳五張用實色金框，BOSS 已揭最佳五張用紅框，共用牌金內紅外，完整揭牌後調暗未入選牌。TOTAL WIN 在 POT 區跑分與噴金幣，金額取底池返還＋JP，排除退款；動畫不重抽或重複入帳。

## JP 與數學範圍

JP 牌型／倍數：皇家同花順 **200×BET**、同花順 **50×BET**、四條 **20×BET**。正常攤牌只領最高一獎，可用零／一／兩張底牌，不必贏池；棄牌無 JP，BOSS 不領。JP、底池返還、未跟注退款與局間 BOSS 刷新分開記錄。

**0.96 是匹配底池返還係數，不是玩家勝率或含 JP 總 RTP 保證。** 目前仍依真實牌組比較勝負；未採用 Hands Up 先定輸贏／配牌流程，也沒有導入 99% RTP 或固定高勝率。後續模型選擇需同步改共用引擎與重新驗證。

舊 `output/math-validation.json` 的 260,000 手不含 JP，是歷史資料，不代表本版 50%／25% 重抽、完整樹或多玩家模型。現行 [v35 驗證資料](output/math-v35-validation.json) 包含四型固定＋輪替各 5,000 手，以及 1,000 副完整樹；僅為小樣本結構／帳務驗證。v34 舊權重模型的本機檔不代表新版。

v36 僅調整呈現，沿用 v35 共用引擎、固定 BOSS 表、輪替、起手重抽及帳務。以上數學檔仍是 **v35 證據**，並非 v36 新跑的 RTP 或機率校準；介面回歸與部署紀錄另列。

## 本機啟動與驗證

Node.js 20+，不需 npm install。在此目錄執行：

```sh
npm start
npm test
npm run build
```

也可雙擊 `啟動遊戲.cmd`。伺服器只綁定 127.0.0.1，預設埠 4177；遊戲為 `http://127.0.0.1:4177/`，工具為 `/probability.html`。ES modules／Worker 須經伺服器開啟。GitHub Actions 對 main 先測試、再建置 dist 並部署 Pages；本地通過不等於已發布。

原型未接帳號、支付或後端持久錢包。正常離桌與再入桌保留當頁餘額，重載或明示 Reset demo chips 會重設。Boss Duel、Hands Up、Final Table 保持唯讀，使用本作不依賴舊目錄。

- [現行流程與完整數學](docs/04-game-flow-and-math.md)
- [API schema 與 Worker](API-CONTRACT.md)
- [素材來源](assets/README.md)
- [視覺演出契約](docs/05-art-and-pot.md)
- [驗證與部署](docs/06-mobile-and-deployment.md)
- [工作規範](AGENTS.md)／[專案技能](.agents/skills/magic-poker-bridge-design/SKILL.md)
