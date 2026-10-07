# Magic Poker Lite

v54：依 11 項回饋調整買入、按鈕美術與機率預覽、籌碼收付及歸零重入，並納入重整返回入口修正。**552 項測試通過，已推送 Git／部署 Pages 並完成公開流程驗收。** 正式 `pooled-holdem` 模型、99% 計分、個人雙池／CD／JP 與對手機率均沿用 v53。完整變更見 [v54 規格](docs/17-v54-presentation-spec.md)，實際 v54 提交、Actions 與公開檢查見 [驗證紀錄](docs/06-mobile-and-deployment.md)；v53 原發布證據另列為歷史。

## 玩法與資產

入口由左到右為可調 SB、連動 BB、連動 BUY-IN；BB = 2 SB，買入 = 100 SB。選 10 即小盲 10、大盲 20、買入 1,000。按 FIGHT 將 BALANCE 轉為桌籌碼一次；雙方沒有底牌或背牌，先以 1,400 ms 買入表演讓籌碼飛至各自區域、逐步堆疊，金額由 0 同步累加至買入額，再下盲注、發牌。買入表演最低 1,000 ms，不隨遊戲速度縮短；籌碼上方不顯示 CHIPS 文字。

桌上只使用實際籌碼，不能補碼；每手對手起始籌碼等於玩家當時籌碼。勝方應得 POT 以每位收款者一整包移入，金額連續累加；玩家 TOTAL WIN 與籌碼同步呈現。退款、POT 派彩與 JP 分別對帳，動畫不再加錢。玩家歸零時先播完結果，隨後自動離桌回入口，重新選 SB 並按 FIGHT 才買入。一般離桌與重整也會結束舊桌帳務並兌回餘碼一次。

首手隨機盲位，後續單挑輪替。公共牌先顯示五個虛線空框，再按 Flop 3／Turn 1／River 1 發出。動作依狀態顯示 CHECK／CALL、BET／RAISE；雙方可以合法多次再加注。三個按鈕保持 66 px 高度，使用同組 FOLD／CHECK／CALL／BET／RAISE 透明美術。RAISE 顯示向上箭頭，不再有 AMOUNT；CHECK／CALL 的 FREE 或金額、各尺寸金額前均有籌碼圖示。

進攻選單由上到下為 ALL IN、1× POT、0.5× POT；同額仍依引擎合併、不重複。對手行為機率改放玩家按鈕上方，各尺寸左側顯示該精確合法動作的回應預覽。若 CHECK／CALL 結束本街，顯示 NEXT STREET，不提前公開下街機率。預覽不推進正式 RNG、牌面或水池。

對手只有激進與不激進，正式遊戲不連續重複。每街開始依 NPC 底牌、已揭公牌及已完成街道歷史鎖定「強／不強」；玩家行動前可查一般面對下注、免費 CHECK、不能加注三種機率。強包括成牌、指定聽牌與明確詐唬條件。每次 NPC 重新抽行為，進攻後再抽尺寸 50%／35%／15%。完整表格見 [v53 規格](docs/16-v53-holdem-spec.md)。

雙方底牌發完即顯示公開的對手牌型參考：Preflop 排除玩家兩張底牌，精確枚舉其餘 50 張中的 1,225 組未知底牌，顯示當前 Pair／High Card；翻牌後沿用當下最佳五張分布。這不是河牌預測，也不讀 NPC 實際暗牌。

## 結果計分、雙池與 JP

開手預建固定玩家底牌、公牌序及所需 NPC win／nonWin 配對。玩家實付時，原結果公式決定是否換至已建配對；同街換牌不改已鎖機率，新街才重判。使用精簡結果控制器保存所選路徑，不預先展開全部無限加注分支。

`conversionRate = .99` 是唯一結果計分係數，匹配 POT 全額派彩、未跟注款全額退回。贏節點有效付費的計分按 80%／20% 入個人付費池／特殊池；盲注、買入與退款不入池。99% 設定不等於實測 RTP，池餘額也不是玩家返還。

池桶和 JP 沿用 BB 單位：低桶 0 < BB ≤ 10、中桶 10 < BB ≤ 500、高桶 BB > 500。皇家／同花順／四條為 200／50／20 BB，須 root 贏、特殊池足額且抽中資格，最後獲勝攤牌才派獎。SB 10／BB 20 的皇家額為 4,000。既有三桶存量保留。

## 保存與研究

錢包、桌籌碼、雙池、CD、對手序列及未完手狀態一併保存。重整或重開頁面返回買入入口：未完成手按玩家離桌棄牌結算，即使可免費 CHECK 或正在等 NPC；已全下等待 NPC 時，使用保存的 RNG 正常抽取 NPC 回應並完成結算。未匹配投入全額退回，結算後剩餘 CHIPS 兌回 BALANCE 一次；尚未開手的買入則全額兌回。雙池、CD、上一對手及錢包保留，不重設初始資產。

舊桌結束後以一次保存寫入錢包、池及 `table: null`；保存失敗保留原存檔並阻止新買入。底層 snapshot／restore 仍供舊桌結算使用，不再讓 UI 接續舊牌局。舊版餘額／池資料可遷移；研究設定不覆蓋遊戲資產。

機率工具與遊戲共用引擎。一般研究外部錢包無限，但每次入桌只有 100 SB，桌籌碼隨輸贏累積，歸零才模擬新入場。退幣研究以錢包加桌籌碼為總資產；水池不算資產。空白種子每次開始產生一次，固定 0 有效。一次統計先一般、再退幣；不把部分退幣樣本當完整比例。

## 執行與連結

需 Node.js 20 以上，無須安裝套件。在本目錄執行 `npm start`；自動測試 `npm test`，靜態建置 `npm run build`。main 推送由既有 GitHub Actions 建置與部署 Pages。

- 本地：[遊戲](http://127.0.0.1:4177/index.html?v=54)／[機率工具](http://127.0.0.1:4177/probability.html?v=54)／[規則與公式](http://127.0.0.1:4177/docs/04-game-flow-and-math.html?v=54)
- 文件：[v54 呈現規格](docs/17-v54-presentation-spec.md)／[v53 遊戲與數學規格](docs/16-v53-holdem-spec.md)／[規則與數學](docs/04-game-flow-and-math.md)／[API](API-CONTRACT.md)／[介面](docs/05-art-and-pot.md)／[驗證](docs/06-mobile-and-deployment.md)／[接手紀錄](HANDOFF.md)
- Git：[Repository](https://github.com/Seven1888/magic-poker-lite)／[Actions](https://github.com/Seven1888/magic-poker-lite/actions)
- 對外入口：[遊戲](https://seven1888.github.io/magic-poker-lite/?v=54)／[機率工具](https://seven1888.github.io/magic-poker-lite/probability.html?v=54)／[規則與公式](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html?v=54)

上述對外網址已提供 v54，公開內容與流程已核對。新聊天室由本輪交付訊息提供，接手後先讀文件等待新需求。遊戲英文，工具、文件及溝通繁體中文；只修改 Magic Poker Lite。
