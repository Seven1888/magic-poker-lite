# Magic Poker Lite

v53：單挑德州下注流程、兩型對手、實際桌籌碼，以及保留 99% 計分／個人雙池／JP 的 `pooled-holdem` 結果模型。方案 B 已於 2026-10-07 完成並發布；519項測試通過，Pages公開站已驗證。Git 提交與部署證據見 [驗證紀錄](docs/06-mobile-and-deployment.md)。

## 玩法與資產

入場數字是小盲 SB；BB = 2 SB，買入 = 100 SB。選 10 即小盲 10、大盲 20、買入 1,000。按 FIGHT 將 BALANCE 轉為 CHIPS，先播放買入飛行再下盲注。桌上只使用實際 CHIPS，不能補碼；每手對手起始籌碼等於玩家當時籌碼。結束後離桌才把剩餘 CHIPS 兌回錢包。

首手隨機盲位，後續單挑輪替。公共牌先顯示五個虛線空框，再按 Flop 3／Turn 1／River 1 發出。動作依狀態顯示 CHECK／CALL、BET／RAISE；雙方可以合法多次再加注。進攻按鈕向上展開半池、全池、ALL IN 的實付金額，短全下遵守加注重開限制。

對手只有激進與不激進，正式遊戲不連續重複。每街開始依 NPC 底牌、已揭公牌及已完成街道歷史鎖定「強／不強」；玩家行動前可查一般面對下注、免費 CHECK、不能加注三種機率。強包括成牌、指定聽牌與明確詐唬條件。每次 NPC 重新抽行為，進攻後再抽尺寸 50%／35%／15%。完整表格見 [v53 規格](docs/16-v53-holdem-spec.md)。

## 結果計分、雙池與 JP

開手預建固定玩家底牌、公牌序及所需 NPC win／nonWin 配對。玩家實付時，原結果公式決定是否換至已建配對；同街換牌不改已鎖機率，新街才重判。使用精簡結果控制器保存所選路徑，不預先展開全部無限加注分支。

`conversionRate = .99` 是唯一結果計分係數，匹配 POT 全額派彩、未跟注款全額退回。贏節點有效付費的計分按 80%／20% 入個人付費池／特殊池；盲注、買入與退款不入池。99% 設定不等於實測 RTP，池餘額也不是玩家返還。

池桶和 JP 沿用 BB 單位：低桶 0 < BB ≤ 10、中桶 10 < BB ≤ 500、高桶 BB > 500。皇家／同花順／四條為 200／50／20 BB，須 root 贏、特殊池足額且抽中資格，最後獲勝攤牌才派獎。SB 10／BB 20 的皇家額為 4,000。既有三桶存量保留。

## 保存與研究

錢包、桌籌碼、雙池、CD、對手序列及未完手狀態一併保存；重整繼續同一手和 RNG，不重新買入或重新布局。舊版餘額／池資料可遷移；研究設定不覆蓋遊戲資產。

機率工具與遊戲共用引擎。一般研究外部錢包無限，但每次入桌只有 100 SB，桌籌碼隨輸贏累積，歸零才模擬新入場。退幣研究以錢包加桌籌碼為總資產；水池不算資產。空白種子每次開始產生一次，固定 0 有效。一次統計先一般、再退幣；不把部分退幣樣本當完整比例。

## 執行與連結

需 Node.js 20 以上，無須安裝套件。在本目錄執行 `npm start`；自動測試 `npm test`，靜態建置 `npm run build`。main 推送由既有 GitHub Actions 建置與部署 Pages。

- 本地：[遊戲](http://127.0.0.1:4177/index.html?v=53)／[機率工具](http://127.0.0.1:4177/probability.html?v=53)／[規則與公式](http://127.0.0.1:4177/docs/04-game-flow-and-math.html?v=53)
- 文件：[完整規格](docs/16-v53-holdem-spec.md)／[規則與數學](docs/04-game-flow-and-math.md)／[API](API-CONTRACT.md)／[介面](docs/05-art-and-pot.md)／[驗證](docs/06-mobile-and-deployment.md)／[接手紀錄](HANDOFF.md)
- Git：[Repository](https://github.com/Seven1888/magic-poker-lite)／[Actions](https://github.com/Seven1888/magic-poker-lite/actions)
- 對外入口：[遊戲](https://seven1888.github.io/magic-poker-lite/)／[機率工具](https://seven1888.github.io/magic-poker-lite/probability.html)／[規則與公式](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html)

上述對外網址已提供 v53。遊戲英文，工具、文件及溝通繁體中文；只修改 Magic Poker Lite。
