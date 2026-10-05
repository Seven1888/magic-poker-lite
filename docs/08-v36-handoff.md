# Magic Poker v36 新聊天室交接

工作目錄：`C:/Users/User/Desktop/新Magic Poker/Magic Poker Lite`。GitHub：`Seven1888/magic-poker-lite`，main。原 Boss Duel／Hands Up／Final Table 永久唯讀；遊戲英文，機率工具、文件與溝通繁體中文。

## 入口

- [遊戲](https://seven1888.github.io/magic-poker-lite/?v=36)
- [中文機率工具](https://seven1888.github.io/magic-poker-lite/probability.html?v=36)
- [完整數學與機率文件](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html?v=36)
- [四種 BOSS 固定機率表](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html?v=36#section-4)
- [沿用的 v35 數學驗證 JSON](https://seven1888.github.io/magic-poker-lite/output/math-v35-validation.json)
- [API 契約](https://seven1888.github.io/magic-poker-lite/API-CONTRACT.md)
- [GitHub](https://github.com/Seven1888/magic-poker-lite)
- [Pages 發布紀錄](https://github.com/Seven1888/magic-poker-lite/actions)

提交 SHA、Pages 成功 run 與公開核對结果由建立新聊天室的交接訊息補充；query 版本本身不構成部署成功證明。

## 本輪修改

BOSS 名稱／副標取消。角色近景上移 24 舞台 px（背景 y -14→-38），底牌 top 262→236、牌型 342→326、對手資產 276→262。主要順序改為角色牌→行動資訊→公共牌→POT→玩家手牌：行動資訊 top 358／高 68、felt 432、POT 542（felt＋110）、TOTAL WIN 546、玩家手牌 622。

玩家／BOSS 最佳五張改實色 4px 金／紅框及深色分隔，共用牌金內紅外；完整揭牌後調暗未入選牌。牌型等 `onVisible` 正面展開完成，玩家兩張底牌都可見後才出現；BOSS 依已揭底牌逐張更新，舊手牌型立即清空，無暗牌提前推算。

每個按鈕的機率 preview 改為左 BOSS／右機率的合併塊，異色且只有一個 BOSS；原機率及玩家籌碼抵達 POT→有效標籤飛入→BOSS 決策時序保留。

NEXT HAND 同步呈現 `startHand` 已選型的新 neutral，不新增抽型。入口預載四型 neutral；圖片未解碼則角色區轉場，發牌前最多等 4 秒，失敗／超時為無型名替身，晚到的舊圖不能覆蓋本手。busy、連點鎖及輪替不變。

## 模型與證據邊界

本輪只改呈現，延續 v35 四型固定表、首手各 25%／後手排除上一型其餘各 1/3、真實共享 52 張牌、10,000 起始資產及跨手實際餘額。原重抽、雙盲、JP 與帳務不變；工具的完整樹與 CI 樣本單位仍依 v35 契約。

`math-v35-validation.json` 的 25,000 手＋1,000 副完整樹是沿用的 **v35 數學證據**，不稱為 v36 新數據或 RTP 校準。舊 260,000 手／v34 權重資料同樣不能代替它。本輪 UI 測試須另留 v36 紀錄。

## 驗證與發布

- 自動測試 **247／247**；正式建置 **181 檔**。
- 正常速度自然四街攤牌，雙方最佳五張各5張；1,872幀無牌型提前出現，NEXT同步換型約5.3ms、舊牌型清空，0頁面／HTTP錯誤。
- 主桌 NEXT HAND 六次真實點擊均排除上一型，更新約9–21ms；慢圖轉場與恢復通過獨立呈現fixture，失敗有限重試另有單元測試。
- 四角色×四尺寸16組、完整決策區、320px單／雙機率格均通過；僅桌面Chromium viewport，不冒稱實體手機驗收。
- 使用者要求本次全部變更以唯一提交發布；確切提交SHA、成功Pages run和公開檢查結果由新聊天室訊息補充。

本機證據與限制集中 [docs/06](06-mobile-and-deployment.md)；未取得對應發布成功證據前，不以本地通過宣稱上線。

## 接續方式

使用者要求全部完成後一次提交／推送、確認 Pages，再開新聊天室提供所有入口、提交與部署連結。新聊天室先讀 `AGENTS.md`、`.agents/skills/magic-poker-bridge-design/SKILL.md`、本文件及 docs/06 的 v36 紀錄；必要時核對 docs/04／API-CONTRACT.md。接收交接並列連結後等待下一個需求，不自行改版或再次推送。
