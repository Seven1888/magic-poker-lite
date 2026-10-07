# v57 BOSS 決策比例、配色與可讀性

更新：2026-10-07。使用者指出「機率不同但寬度沒有隨機率調整」、「CALL 怎麼是藍色」及「文字和百分比小到看不清楚」，並要求全部調整完成後開新聊天室交接，由新聊天室直接提供相關連結。**本輪全部完成，本地驗證、Git 推送、Pages 部署與公開驗收通過；實際證據見 [發布紀錄](06-mobile-and-deployment.md)。** 不把上一輪測試數字或先前局部修正當成本輪完整交付證據。

## 範圍與優先順序

只修改 Magic Poker Lite；同層 Boss Duel、Hands Up、Final Table 永久唯讀。遊戲英文，機率工具、文件與溝通繁體中文。本文優先於 v55 的回應框縮窄要求及原回應呈現樣式；[v56 抽盲與壓力機率](19-v56-blind-and-response-spec.md) 保持，其餘延續呈現見 [v55 規格](18-v55-feedback-spec.md)。

正式模型仍為方案 B `pooled-holdem`，保留 .99 結果計分、三桶雙池、CD、JP、兩型對手、每街強弱分類與既有帳務。v57 不修改機率表、壓力公式、正式抽樣、NPC 進攻尺寸 50／35／15 或兩段 RNG 路徑。預覽不提交正式 RNG、暗牌、水池或資產。`profile.balance` 仍只存桌外錢包，不能把 `TOTAL BALANCE` 重複入帳。

## 1. 色帶寬度對應實際機率

BOSS 回應色帶的可分配寬度使用完整機率比例，不能固定等寬。以不激進不強為例，半池 FOLD／CALL 為 25／75，全池為 40／60，大額為 55／45，三列應呈現對應寬度。

文字四捨五入只供顯示，不回寫正式機率。不得以標籤最小寬度、內距或欄間距將小比例色塊撐大，導致視覺比例與實際分布不符。沒有機率的行為不保留無意義色塊；只有一種行為時仍沿用真正 100% 的原判定與流程。

## 2. 行為配色一致

| 行為 | 色系 |
| --- | --- |
| FOLD | 綠色 |
| CALL、CHECK | 紅色 |
| RAISE、BET | 紫色 |

尺寸選單、一般 BOSS 回應及抽取呈現使用一致對應；CALL／CHECK 不沿用藍色。行為名稱與百分比仍以文字明確提供，不只靠顏色分辨。

## 3. 手機可讀性

進攻尺寸選單可使用操作區完整可用寬度，保留 ALL IN、1× POT、0.5× POT 順序與對應金額；合法同額選項仍按引擎合併。放大各尺寸的 BOSS 決策行為名稱和百分比，名稱與數字不互相擠壓。

5% 等窄色段使用精確色帶及獨立可讀標籤，讓標籤需要的空間不影響色帶比例。標籤仍須清楚對應其行為及色系；不可裁掉名稱、百分號或用小字避免溢出。尺寸回應保留完整厚外框。換街／結算保留 `AFTER CALL／CHECK` 操作關聯，後接 `DEAL FLOP／TURN／RIVER` 或 `SHOWDOWN`，不冠 BOSS、不提前公開下街資訊。320／393／1440 px × 4 情境共 12 組階段提示檢查通過，證據為 `output/playwright/qa-v57-phase.js`。

主預覽利用 FOLD 按鈕上方空間：左卡標示 `BOSS · CALL` 或 `BOSS · CHECK`，右側較寬卡標示 `BOSS · RAISE` 或 `BOSS · BET`。各卡以單一完整框提供對應回應，名稱 15 CSS px、百分比 20 CSS px；卡片不能向上遮住玩家底牌。兩卡寬度用於各自回應內容，卡內色帶仍按機率分配。

桌面 Chrome 的 320×900、375×900、393×900、412×900、1440×1000、320×640 六組 viewport 已核對尺寸選單、百分比、5% 情境、兩／三種行為與選單收合後的 BOSS 回應。尺寸選單實際行為名稱 ≥ 14 px、百分比 ≥ 20 px，沒有文字裁切；完整機率與實際色帶寬度的比例誤差 ≤ 0.001。測量與截圖證據記於發布紀錄，不將桌面 viewport 宣稱為實體 Android。

## 4. 驗證及交付邊界

自動檢查與瀏覽器檢查需涵蓋比例、精確小機率、行為配色、字體可讀性、兩／三欄布局及原換街／確定行為流程。測試與建置只記本輪實際結果。機率、RNG 與帳務沿用 v56，不把純呈現修正宣稱為新的 RTP 證據。

主聊天室完成全部調整、驗證、Git 推送、Pages 部署與公開內容核對，回填實際證據後，依使用者授權建立新聊天室。新聊天室先唯讀 AGENTS、HANDOFF、本文、v56、v53 與發布紀錄，直接提供全部相關連結，再等待新需求；不要要求使用者重問連結，不重做本輪已完成工作，也不另開聊天室。

## 5. 版本入口與文件

- 公開：[遊戲](https://seven1888.github.io/magic-poker-lite/?v=57)／[機率工具](https://seven1888.github.io/magic-poker-lite/probability.html?v=57)／[規則](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html?v=57)。
- 本地：[遊戲](http://127.0.0.1:4177/index.html?v=57)／[機率工具](http://127.0.0.1:4177/probability.html?v=57)／[規則](http://127.0.0.1:4177/docs/04-game-flow-and-math.html?v=57)。本專案 `npm start` 啟動，Node ≥ 20，無需安裝套件。
- Git：[專案](https://github.com/Seven1888/magic-poker-lite)／[Actions](https://github.com/Seven1888/magic-poker-lite/actions)；本輪功能與發布紀錄提交、成功 run 以 [發布紀錄](06-mobile-and-deployment.md) 最終回填為準。
- 文件：[HANDOFF](../HANDOFF.md)／[AGENTS](../AGENTS.md)／[README](../README.md)／[v56](19-v56-blind-and-response-spec.md)／[v55](18-v55-feedback-spec.md)／[v54](17-v54-presentation-spec.md)／[v53](16-v53-holdem-spec.md)／[API](../API-CONTRACT.md)。
- 美術：[按鈕資產](../assets/action-buttons-v54/)／[完整生成提示詞](../assets/action-buttons-v54/prompts.txt)。沿用 v54 資料夾，本輪不重新生成圖片。
