# Magic Poker Lite

手機直版、第一人稱的 1v1 簡化德州原型：兩張底牌、五張公共牌、四街下注、真實對手行動機率。遊戲介面英文，機率工作台與文件繁體中文；預設資產 **10,000**。

- [遊戲 Demo](https://seven1888.github.io/magic-poker-lite/?v=41)
- [機率工作台：完整行動樹與玩家統計](https://seven1888.github.io/magic-poker-lite/probability.html?v=41)
- [模型文件：公式、分母與帳務案例](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html?v=41)
- [四 BOSS 固定表與目前牌型分布算法](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html?v=41#section-4)

目前整理 v41：YOUR TURN／BOSS TURN 等行動資訊改為橫跨舞台的平面長條，取消左右框與卡片式厚邊。BOSS 底牌左側新增「目前牌型分布」，FLOP 起顯示最高兩類及 OTHER 的原始比例，點開查看完整九類。它用玩家已知底牌、已揭公牌、已公開 BOSS 行動與機率文字及起手重抽規則，精確枚舉候選 BOSS 底牌；不讀真實暗牌、未來公牌、牌庫或 seed，也不消耗正式 RNG。這是目前牌型的條件分布，不是行動機率、玩家勝率或河牌成牌預測。驗證及發布狀態以 [docs/06](docs/06-mobile-and-deployment.md) 對應版本紀錄為準，版本網址本身不代表已發布。

v40 抽盲明示小盲／大盲，coin 顯示 SB／BB，結果為 YOU · SMALL BLIND／YOU · BIG BLIND；STARTING BET 仍列 YOU／BOSS 的真實初始投入。局間調整 BET 草稿時立即預覽下一位 BOSS，確認後保持至 NEXT HAND；取消或改回原 BET 還原開窗前畫面。遊戲維持英文，正式 RNG、輪替、行動順序與金流不變；數學沿用 v35。歷史交接見 [v40 交接](docs/11-v40-handoff.md)。

v39 起，玩家入場時就呈現首手的當前 BOSS，調整 BET、關閉後重開入口、按 FIGHT 及抽盲期間維持同一角色。入口先保存本桌 seed 與設定，以隔離 session 讀取同一抽盲→選型流程的公開身份，不發牌、不扣款；FIGHT 仍以同 seed 走原引擎開局。NEXT HAND 保留排除上一型的輪替，離桌或 Reset demo chips 才準備新的入口。

v38 已補上同街 BOSS 只有一種回應時的 CALL 100%／RAISE 100%／FOLD 100% 提示。混合分布仍只列原始 FOLD／RAISE；直接換街或結束牌局不虛構回應。決策、RNG、帳務及 v37 局間 BET 保持。歷史交接保留於 [v38 交接](docs/10-v38-handoff.md) 與 [v37 交接](docs/09-v37-handoff.md)。

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

入口預選 BET 1；入口與局間＋／−依序選 **1、2、5、10、20、50、100、200、500、800、1,000、1,200、1,500、1,800、2,000**。每手結算演出完成後可開 BET 小窗，CONFIRM BET 只保存下一手設定，關閉取消草稿；NEXT HAND 才扣盲與發牌。改 BET 須雙方資產達新門檻（預設 20 BB），原 BET 不變仍可短籌碼續手。兩盲及四街注額同比縮放，不重建 session 或重設原桌損益基準，已結算 JP 保持原值。

局間＋／−將草稿改成新 BET 時，以 `session.rng.clone()` 與 `lastBossProfileId` 推導下一手 BOSS，立即顯示 neutral；多次改值仍是同一下一型，fixed 模式維持同型。預覽不消耗正式 RNG、不發牌或扣盲；一律暫藏舊 BOSS 手牌與牌型，fixed／legacy 即使同角色也不沿用舊牌畫面。取消或改回原 BET 還原開窗前畫面；CONFIRM BET 保留預覽，NEXT HAND 才由原 `startHand` 選到同型並正式開局。

入場角色就是即將對戰的 BOSS。首手 seed 已固定，入口 BET 比例或重開同一入口不影響首型；FIGHT 只沿用已保存 seed 建立正式 session，抽盲演出後才由 `startHand` 扣盲發牌。入口身份準備不讀底牌、未來公牌或牌力，也不推進正式 session 的 RNG。

開局明示玩家小盲／大盲及雙方初始投入。對手機率獨立浮在按鈕上方，每組只保留一個 BOSS，標題與數值異色；玩家籌碼先抵達 POT，再飛標籤、演 BOSS 決策。對手底牌與行動底板都在公共牌上方，玩家手牌上方直接是 POT。玩家最佳五張用實色金框，BOSS 已揭最佳五張用藍框，共用牌金內藍外，完整揭牌後調暗未入選牌。TOTAL WIN 在 POT 區跑分與噴金幣，金額取底池返還＋JP，排除退款；動畫不重抽或重複入帳。

v41 的行動長條不保留左右邊框、圓角卡片或桌面物件式厚陰影，沿用原本公開時序與抽選。BOSS 目前牌型分布在左側以小型無框文字呈現，OTHER 是前兩名以外的真實合計，不把前兩名湊成 100%。完整九類互斥，皇家同花順歸入同花順；新計算先清掉舊結果，攤牌、棄牌與換手隱藏，演出期間禁開詳情。指定 BOSS 底牌的設定不讀取該暗牌，顯示無法推估；錯誤或矛盾公開證據不假造 0%。

## JP 與數學範圍

JP 牌型／倍數：皇家同花順 **200×BET**、同花順 **50×BET**、四條 **20×BET**。正常攤牌只領最高一獎，可用零／一／兩張底牌，不必贏池；棄牌無 JP，BOSS 不領。JP、底池返還、未跟注退款與局間 BOSS 刷新分開記錄。

**0.96 是匹配底池返還係數，不是玩家勝率或含 JP 總 RTP 保證。** 目前仍依真實牌組比較勝負；未採用 Hands Up 先定輸贏／配牌流程，也沒有導入 99% RTP 或固定高勝率。後續模型選擇需同步改共用引擎與重新驗證。

舊 `output/math-validation.json` 的 260,000 手不含 JP，是歷史資料，不代表本版 50%／25% 重抽、完整樹或多玩家模型。現行 [v35 驗證資料](output/math-v35-validation.json) 包含四型固定＋輪替各 5,000 手，以及 1,000 副完整樹；僅為小樣本結構／帳務驗證。v34 舊權重模型的本機檔不代表新版。

v37 增加局間 BET 設定及呈現調整，沿用 v35 共用引擎、固定 BOSS 表、輪替、起手重抽及結算規則。以上數學檔仍是 **v35 證據**，並非 v37 新跑的 RTP 或機率校準；局間設定、介面回歸與部署紀錄另列。

v38 只修正單一 BOSS 回應預覽的顯示；以上數學檔同樣不是 v38 新跑的 RTP 或機率校準。

v39 讓入口角色與首手一致；引擎、牌庫、四型固定表與帳務未改，數學仍沿用 **v35 證據**，不是 v39 新 RTP 或機率校準。

v41 新增公開資訊牌型推估算法與橫幅呈現，保留原共用引擎、BOSS 行為表、正式 RNG、派彩及 JP。牌型分布的枚舉／條件權重驗證不等於重跑 RTP；上列資料仍為 **v35 證據**，不是 v41 新 RTP 校準。

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
