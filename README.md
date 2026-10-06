# Magic Poker Lite

現行 v51：Hands Up RTP 計分與個人雙水池，匹配底池全額派彩。2026-10-06 發布準備；使用者已授權提交並推送 main，Pages 建置與部署結果以 GitHub Actions 為準。

玩家入場後，每次開始新一手才依當時狀態建立該手完整合法行動樹、勝負目標與真實牌面。玩家底牌、公牌序固定，BOSS 暗牌隨已存節點選取；正常操作只走本手已建分支；各手不共用一棵預先建立的樹。這是德州風格的結果模型，公開參考勝率使用標準未知牌算法。

## RTP 與個人雙池

只有一個全系統 RTP 計分設定，預設 99%。開局用匹配盲注 × RTP ÷ 匹配底池；付費前輸時用（實付 × RTP＋可用個人付費池）÷ 付費後可匹配底池，最多補到 100%。付費前贏就繼承結果；免費行為不重抽。底池全額返還，不另扣結算費。

實際走到的贏節點有效付費 × RTP 按 80%／20% 分入付費池／特殊池；盲注及未跟注退款不入池。兩池依三個 BET 桶跨手、跨桌保存，CD 跨桶。開局贏且特殊池足額，選最高可負擔皇家 200／同花順 50／四條 20 倍 BET，再抽 20% 出現率；正常獲勝攤牌才扣池派獎。

與 Hands Up 使用相同計分、繼承、分池及 CD 規則；本作派彩分母使用雙方可匹配 POT。設定 99% 與實測 RTP 分列，未派的池餘額不算玩家返還。完整公式與案例見 [規則](docs/04-game-flow-and-math.md)。

## 遊戲與統計

小盲 .5 BET、大盲 1 BET，每手抽 50/50 盲位；四街下注增量 1／2／4／4 BET，每街最多一次加注。BOSS 四型每街固定權重，首手各 25%，後手排除上一型。開局門檻維持 5 BET：本輪 1,000 棵完整樹平均 4.5022 BET，95% CI [4.4128,4.5916]，向上取整為 5。

機率工具按模擬設定、RTP 與水池、基礎遊戲規則等彩色區塊排列，退幣位於玩家行為下面。一般統計連續遊玩、資產無限；每人完成指定手數。亂數種子空白時每次執行隨機，固定 0 有效。開始統計自動完成一般及退幣；退幣直到達標或不足開手資產，比例為達標人數／全部玩家。

遊戲保存已結算資產與個人雙池；工具保存的起始池只設定研究起點，不覆寫遊戲 profile。遊戲英文，工具與文件繁體中文。

## 入口與文件

在本目錄執行 npm start，無須安裝套件；npm test 為自動測試。推送 main 後由既有 GitHub Actions 建置並部署 Pages。

- [本地遊戲](http://127.0.0.1:4177/index.html?v=51)
- [本地機率工具](http://127.0.0.1:4177/probability.html?v=51)
- [本地規則與公式](http://127.0.0.1:4177/docs/04-game-flow-and-math.html?v=51)
- [API 契約](API-CONTRACT.md)／[工作規範](AGENTS.md)／[本輪驗證](docs/06-mobile-and-deployment.md)
- [本輪門檻報告](output/entry-budget-local51.json)
- [GitHub](https://github.com/Seven1888/magic-poker-lite)／[Actions](https://github.com/Seven1888/magic-poker-lite/actions)
- 公開 v51 入口：[遊戲](https://seven1888.github.io/magic-poker-lite/?v=51)／[機率工具](https://seven1888.github.io/magic-poker-lite/probability.html?v=51)／[規則與公式](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html?v=51)。本輪部署成功後才會提供 v51 內容，實際狀態請核對 Actions。
