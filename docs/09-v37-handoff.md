# Magic Poker v37 新聊天室交接

工作目錄：`C:/Users/User/Desktop/新Magic Poker/Magic Poker Lite`。GitHub：`Seven1888/magic-poker-lite`，main。原 Boss Duel／Hands Up／Final Table 永久唯讀；遊戲英文，機率工具、文件及溝通繁體中文。

## 本輪完成

- BOSS 最佳五張改 4px 藍框 `#259dff`，玩家金框 `#ffe019`，共用牌金內藍外，深色分隔與暗牌公開時機維持。
- BOSS 牌型字級 14→17.5px（+25%），底板 170×25→214×30，top 326，與行動底板保留間隔。
- 每局結算演出後左 BET、右 NEXT HAND；主桌與結果明細一致。BET 小窗以 ＋／－ 選草稿，CONFIRM BET 只儲存下一局設定，關閉／Escape 取消未確認草稿，NEXT HAND 才發牌扣盲。
- BET 與 Hands Up 正式 `FIXED_STAKES` 相同：1、2、5、10、20、50、100、200、500、800、1000、1200、1500、1800、2000。入口與局間相同，預設 1；只借級距、不借舊遊戲規則。
- `nextHandBetConfig(session, bet)` 是純函式；確認才替換 `session.config`，不重建 session，不變動舊 `hand.config`、原 buyIn 基線、餘額、歷史、RNG、盲位／BOSS 輪替。注額同比縮放，改 BET 須達既有最低資產倍率；原 BET 短籌碼續手保留，零資產不能再開手。

## 入口

- [遊戲 v37](https://seven1888.github.io/magic-poker-lite/?v=37)
- [中文機率工具](https://seven1888.github.io/magic-poker-lite/probability.html?v=37)
- [完整數學與機率文件](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html?v=37)
- [四種 BOSS 固定機率表](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html?v=37#section-4)
- [沿用的 v35 數學驗證 JSON](https://seven1888.github.io/magic-poker-lite/output/math-v35-validation.json)
- [API 契約](https://seven1888.github.io/magic-poker-lite/API-CONTRACT.md)
- [GitHub](https://github.com/Seven1888/magic-poker-lite)
- [Pages 發布列表](https://github.com/Seven1888/magic-poker-lite/actions)
- [GitHub 交接文件](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/09-v37-handoff.md)

## 驗證與發布證據邊界

256／256 自動測試、183 檔建置；自然局間調注／取消／高注額不足資產提示／下一手連續性、正常速度 2,093 幀無提前牌型、四角色×四尺寸 16 組及長牌型通過。瀏覽器為桌面 Chromium viewport，非實體手機；fixture 不當作自然機率統計。詳見 [docs/06](06-mobile-and-deployment.md) 的 v37 紀錄。

`output/math-v35-validation.json` 的 25,000 手＋1,000 副完整樹仍是 **v35 舊證據**，不是 v37 新 RTP 校準；不要拿更早 260,000 手或 v34 權重資料代替它。引擎、四型 BOSS 表、起手重抽、派彩／JP 公式未改；只增加遊戲局間改下一手 BET 的操作。

使用者要求全部調整好後一次提交／推送，核對該 SHA 的 Pages 成功及公開煙霧測試，再開新聊天室給全部連結。精確提交 SHA、成功 run 和公開驗證結果由建立新聊天室的交接訊息補充；以上本機通過與網址版本字串本身不證明已上線。

## 接續方式

先讀 `AGENTS.md`、本文件、`.agents/skills/magic-poker-bridge-design/SKILL.md` 與 docs/06 的 v37 紀錄。使用者最新規格與 AGENTS v37 優先於舊技能中的紅框、固定 BET 或舊版配置。接手後簡短確認並列出交接訊息所帶的全部公開／提交／部署連結，等待下一個需求，不自行改版、再推送或開新聊天室。
