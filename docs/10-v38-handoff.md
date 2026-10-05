# Magic Poker v38 新聊天室交接

工作目錄：`C:/Users/User/Desktop/新Magic Poker/Magic Poker Lite`。GitHub：`Seven1888/magic-poker-lite`，main。原 Boss Duel／Hands Up／Final Table 永久唯讀；遊戲英文，機率工具、文件及溝通繁體中文。

## 本輪範圍

- 修正有時不見 BOSS 決策預覽的情況：同手同街確有直接回應、但只有一個正機率動作時，按鈕上方仍顯示 **BOSS CALL 100%／RAISE 100%／FOLD 100%**。
- `check`／`call` 顯示 CALL，`bet`／`raise` 顯示 RAISE。混合分布仍只列原始 FOLD／RAISE，不補列 CALL、不重新正規化。
- 免費 CALL 若直接換街、FOLD 結束牌局或沒有同街 BOSS 回應，仍不顯示回應標籤，不借用未公開下一街或過期分布。
- 僅調整唯讀預覽；引擎決策、RNG、中央抽選／必然動作演出及帳務不變。v37 局間 BET、藍金最佳五張、放大牌型與公開時序維持。

## 入口

- [遊戲 v38](https://seven1888.github.io/magic-poker-lite/?v=38)
- [中文機率工具](https://seven1888.github.io/magic-poker-lite/probability.html?v=38)
- [完整數學與機率文件](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html?v=38)
- [四種 BOSS 固定機率表](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html?v=38#section-4)
- [沿用的 v35 數學驗證 JSON](https://seven1888.github.io/magic-poker-lite/output/math-v35-validation.json)
- [API 契約](https://seven1888.github.io/magic-poker-lite/API-CONTRACT.md)
- [GitHub](https://github.com/Seven1888/magic-poker-lite)
- [Pages 發布列表](https://github.com/Seven1888/magic-poker-lite/actions)
- [GitHub 交接文件](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/10-v38-handoff.md)

## 驗證與發布證據邊界

本輪全套自動測試 **258／258**、針對性測試 **14／14** 通過。四型 BOSS × 四種 viewport 寬度共 **16 組**確認 CALL 100% 藍底、無障礙名稱及文字無溢出。正常速度 251 個 20ms 取樣幀中，27 幀標籤飛行均在玩家籌碼到 POT 後；中央必然回應不掃動、連點僅扣一次。減少動態、完整結算後調 BET／NEXT HAND、混合分布原機率及免費 CALL 換街不預告皆通過，0 頁面／HTTP 錯誤。

瀏覽器為桌面 Chromium viewport，非實體手機。固定種子使用原引擎，未手動指定牌面，亦不當作新機率統計。詳細數值與證據見 [docs/06](06-mobile-and-deployment.md) 的 v38 段落及 `output/playwright/{tests-v38,boss-preview-v38-local,boss-preview-v38-edges-local}.txt`。本輪正式建置 **183 檔**通過，證據為 `output/playwright/build-v38.txt`；公開發布由下述交接訊息補足精確 SHA、Pages run 及部署後驗證。

`output/math-v35-validation.json` 的 25,000 手＋1,000 副完整樹仍是 **v35 舊證據**，不是 v38 新 RTP 校準。四型 BOSS 表、發牌、輪替、結算與 JP 公式未改，不用更早的 260,000 手或 v34 權重資料冒充新版驗證。

使用者要求調整好後重開聊天室。沿既有流程全部驗證完成後一次提交／推送，核對該完整 SHA 的 Pages 成功並實測公開站，再建立新聊天室、提供全部連結。精確提交 SHA、成功 run 與公開驗證結果由新聊天室的交接訊息補充；本文件的版本網址本身不證明上線。

## 接續方式

先直接讀取 `AGENTS.md`、本文件與 docs/06 的 v38 紀錄；後續實作前再讀 `.agents/skills/magic-poker-bridge-design/SKILL.md`。使用者最新規格與 AGENTS v38 優先於舊技能中的「至少兩個正機率才列預覽」等歷史規則。接手後簡短確認，列出交接訊息所帶的全部公開／提交／部署連結並等待下一個需求，不自行改版、再推送或另開聊天室。
