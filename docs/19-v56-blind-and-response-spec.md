# v56 抽盲資訊與三種下注壓力回應

更新：2026-10-07。目前本地驗證完成，發布待確認。使用者已確認本文件兩項調整，授權全部完成、驗證後推送 Git，再開新聊天室交接，由新聊天室直接提供完整相關連結。實際測試、部署及公開驗收證據只記在 [發布紀錄](06-mobile-and-deployment.md)，不將 v55 或更早的測試數字當作本輪結果。

## 範圍與優先順序

只修改 Magic Poker Lite；同層 Boss Duel、Hands Up、Final Table 永久唯讀。遊戲英文，工具、文件與溝通繁體中文。本文優先於 v55／v53 中「抽盲硬幣避開行動說明區」及「同街行為機率固定」的舊敘述。

正式模型仍為方案 B `pooled-holdem`，保留 .99 結果計分、三桶雙池、CD、JP、兩型對手、每街強弱分類與既有帳務。NPC 自己進攻的尺寸權重仍是半池50%／全池35%／ALL IN15%；其餘呈現沿用 [v55 規格](18-v55-feedback-spec.md)。

## 1. 抽盲整合行動說明區

使用者提供的截圖顯示硬幣下方盲位結果、STARTING BET與POT資訊相互重疊。改為在原本顯示行動階段的說明區完成圖示及文字表演：

1. 抽取中：左側硬幣翻轉，右側顯示 `DRAWING YOUR BLIND`。
2. 揭曉後：左側硬幣顯示 `SB` 或 `BB`；右側第一行為 `YOU · SMALL BLIND` 或 `YOU · BIG BLIND`，第二行為雙方實際盲注，例如 `YOU 50 · BOSS 100`。
3. 結束後：硬幣移至玩家盲位標記，說明區接續下一個遊戲階段。

取消原硬幣下方浮動結果、`STARTING BET` 與 `BLIND POSITION`。抽盲期間保留桌面、公牌空框與POT，圖示與文字不得彼此遮擋或覆蓋其他資訊。縮窄手機畫面時兩行文字仍需完整可讀。

抽盲只演出引擎已選結果，不新增 RNG 抽票、盲注付款或資產異動；首手50/50、後手SB／BB交換沿用。買入、總餘額、退款與收款仍依原帳務一次提交。

## 2. 三種實際下注壓力

使用者採用下表。每格依序為 **FOLD／CALL／RAISE** 百分比：

| 對手 | 強弱 | 半池壓力 | 全池壓力 | 大額壓力 |
| --- | --- | --- | --- | --- |
| 激進 maniac | 強 | 5／25／70% | 10／40／50% | 20／80／0% |
| 不激進 caller | 強 | 5／65／30% | 10／70／20% | 15／85／0% |
| 激進 maniac | 不強 | 45／55／0% | 55／45／0% | 70／30／0% |
| 不激進 caller | 不強 | 25／75／0% | 40／60／0% | 55／45／0% |

### 價格與分列公式

使用玩家動作後、NPC回應前的狀態：

```text
D = max(currentBet - streetBets.npc, 0)
C = min(D, max(stacks.npc, 0))
P = max(pot - D, 0)
```

- D是NPC尚需補的完整差額；C是其剩餘碼允許的實際CALL。
- P是玩家動作後POT扣掉完整差額D，等同玩家進攻前POT加上玩家先補的CALL；不能改成扣封頂後的C。
- 半池：C ≤ 0.5P；全池：0.5P < C ≤ P；大額：C > P。
- 實作以0.000001容忍支付六位小數造成的邊界差；P為0時，零價落半池、正價落大額（容忍範圍內微量仍落半池）。

比率以實際合法金額判定，不以 `sizeKey` 或ALL IN標籤判定。最小加注額可能讓半池按鈕落全池壓力；短碼ALL IN可能落半池或全池；NPC剩餘碼也會限制可實付壓力。同額合法選項合併，必須得到相同回應機率。

例：SB5／BB10，開局POT15；玩家半池本次付15、累計至20，NPC尚需C10、基準P20，落半池。玩家全池本次付25、累計至30，NPC尚需C20、基準P20，落全池。後續再加注同樣用當次狀態重新計算價格，不重新判定強弱。

### 免費與不能再加注

免費時固定用半池基準列，FOLD與CALL合為CHECK：激進強CHECK30%／進攻70%；不激進強70%／30%；兩型不強均CHECK100%。

不能RAISE時，先依實際壓力選列，再移除RAISE，使用 `F/(F+C)`、`C/(F+C)` 正規化；不能一律套大額列。例如不激進強牌面對半池ALL IN為7.142857…%／92.857142…%，全池ALL IN為12.5%／87.5%，大額ALL IN為15%／85%。正式抽樣使用完整比值，畫面才四捨五入。僅有CHECK則100%CHECK。

大額列RAISE為0，即使引擎仍有合法進攻選項也不選。NPC抽中BET／RAISE後，尺寸仍依50／35／15抽取；同額尺寸加總原權重，單一合併尺寸仍保留尺寸票。真正100%行為只省略行為動畫，正式RNG路徑維持原契約。

### 每街鎖定與公開預覽

每街開始、任一該街行動前，鎖「強／不強」分類。分類只讀NPC底牌、已揭公牌及已完成街道歷史；玩家價格、同街再加注與NPC配對切換不重判。新街才依當時配對重新分類。

同街的回應機率由已鎖分類加上本次壓力選列，因此三個尺寸可以顯示不同數字。預覽每個完整合法動作，在隔離副本套同一正式回應規則，不提交正式RNG、暗牌、分類、資產或水池。若動作直接換街或結算，沿用DEAL FLOP／TURN／RIVER或SHOWDOWN，不提前公開下街機率。

公開API只提供數字，不回傳分類、原因或暗牌；精確百分比可能推知強弱桶，沿用既有資訊設計。`getBossProbabilityScenarios` 增加 `byPressure` 三列，保留現有 `facing／free／noRaise／sizes`；詳細字段見 [API契約](../API-CONTRACT.md)。歷史legacy研究保留原half基準，不冒充本版正式驗證。

## 3. 驗證與交付要求

需核對12組權重、每列正規化、半池／全池邊界、最小加注、短ALL IN、NPC籌碼封頂、同額合併、免費與不能加注；確認同街分類不變、新街重判、逐項預覽與正式回應一致且不動正式RNG。結果計分、池、CD、JP、退款、錢包保存、重整兌回與Worker共用引擎仍需對帳。

抽盲需實際檢查抽取、揭曉、移至標記三階段；手機320／375／393／412與桌面1440 viewport確認圖示、兩行文字、POT及公牌不重疊、無水平溢出。桌面瀏覽器手機viewport不是實體Android；機率設計值與小樣本都不能宣稱長期實測RTP。

全部調整與驗證完成後推送Git，核對部署及公開內容，更新交接文件，再依使用者授權開新聊天室。新聊天室先讀文件，直接提供以下完整連結與Git、Actions、功能／發布提交、工作規範、交接、規格、API、美術資料夾及prompts.txt，再等待新需求。

## 4. 固定入口

以下為版本入口；是否已部署以 [發布紀錄](06-mobile-and-deployment.md) 為準。

- 公開：[遊戲](https://seven1888.github.io/magic-poker-lite/?v=56)／[機率工具](https://seven1888.github.io/magic-poker-lite/probability.html?v=56)／[規則](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html?v=56)。
- 本地：[遊戲](http://127.0.0.1:4177/index.html?v=56)／[機率工具](http://127.0.0.1:4177/probability.html?v=56)／[規則](http://127.0.0.1:4177/docs/04-game-flow-and-math.html?v=56)。於此專案執行 `npm start`，Node ≥ 20，無須安裝套件。
- Git：[Repository](https://github.com/Seven1888/magic-poker-lite)／[Actions](https://github.com/Seven1888/magic-poker-lite/actions)。
- 文件：[HANDOFF](../HANDOFF.md)／[AGENTS](../AGENTS.md)／[README](../README.md)／[v53歷史規格](16-v53-holdem-spec.md)／[API](../API-CONTRACT.md)／[驗證與發布](06-mobile-and-deployment.md)。
- 美術：[按鈕資產](../assets/action-buttons-v54/)／[完整生成提示詞](../assets/action-buttons-v54/prompts.txt)。資產資料夾名稱保留v54，本輪無須重新生成美術。
