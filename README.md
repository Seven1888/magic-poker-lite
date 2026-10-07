# Magic Poker Lite

v57：BOSS 決策色帶依實際機率分配寬度，FOLD 綠、CALL／CHECK 紅、RAISE／BET 紫，並放大尺寸選單的行為名稱及百分比；小機率保留精確色帶，以獨立文字確保可讀。**本地驗證完成：572／572 測試通過、建置 236 檔；Git／公開發布待完成，實際證據見 [發布紀錄](docs/06-mobile-and-deployment.md)。** 最新呈現以 [v57 規格](docs/20-v57-response-readability-spec.md) 為準；[v56](docs/19-v56-blind-and-response-spec.md) 的抽盲與實際下注壓力機率保持，其餘呈現延續 v55。正式方案 B `pooled-holdem`、.99 計分、三桶雙池／CD／JP、RNG 與帳務不變；歷史版本或先前局部修正的驗收不當作 v57 完整結果。

## 玩法與資產

入口由左到右為可調 SB、連動 BB、連動 BUY-IN；BB = 2 SB，買入 = 100 SB。選 10 即小盲 10、大盲 20、買入 1,000。按 FIGHT 從桌外錢包轉為桌籌碼一次；雙方沒有底牌或背牌，先以 1,400 ms 在各自位置逐步堆高，金額由 0 同步累加至買入額，再下盲注、發牌。買入不再有資產飛向桌面的籌碼，最低仍為 1,000 ms，不隨遊戲速度縮短。雙方共用同一尺度：50 BB 買入對應 18 顆視覺籌碼，最多 45 顆；同額同高，不因個別座位曾歸零或收款而改比例。

上方 `TOTAL BALANCE` 是桌外錢包加畫面當下的玩家桌碼；買入堆疊期間已包含完整買入額，因此買入、離桌只是移動資金，不使總餘額跳動。玩家下注時同步減少，退款與收款時同步增加。profile 的 `balance` 仍只存桌外錢包，不把畫面總額存回錢包。

桌上只使用實際籌碼，不能補碼；每手對手起始籌碼等於玩家當時籌碼。`TOTAL WIN`／`BOSS WIN` 從收款開始即出現，前景文字與數字、後方持續流向勝方的籌碼，完整表演共用實際 2,000 ms，不除以遊戲速度。勝方桌碼與玩家總餘額依同一呈現進度更新；只有兩種 WIN 文字可以位於飛行籌碼前方，其餘資訊不得遮住下注或收款飛行。退款、POT 派彩與 JP 分別對帳，動畫不再加錢。玩家歸零時先播完結果，隨後自動離桌回入口，重新選 SB 並按 FIGHT 才買入。一般離桌與重整也會結束舊桌帳務並兌回餘碼一次。

首手隨機盲位，後續單挑輪替。抽盲保留桌面，硬幣與文字共同使用行動說明區：左側硬幣翻轉、右側顯示 `DRAWING YOUR BLIND`；揭曉後左側為 `SB／BB`，右側第一行顯示 `YOU · SMALL BLIND` 或 `YOU · BIG BLIND`，第二行顯示 `YOU 50 · BOSS 100` 等實際盲注。結束後硬幣移至玩家盲位標記，說明區回到遊戲階段。移除硬幣下方浮動結果、`STARTING BET` 及 `BLIND POSITION`，避免與 POT、公牌重疊。公共牌先顯示五個虛線空框，再按 Flop 3／Turn 1／River 1 發出。動作依狀態顯示 CHECK／CALL、BET／RAISE；雙方可以合法多次再加注。三個按鈕保持 66 px 高度，主文字縮小，籌碼圖示與花費金額放大；RAISE 向上箭頭加入動畫。

進攻選單由上到下為 ALL IN、1× POT、0.5× POT；同額仍依引擎合併、不重複。對手行為機率放在玩家按鈕上方；尺寸選單使用操作區可用寬度，以完整厚外框包住各尺寸對應回應。色帶以完整實際機率分配寬度，FOLD 綠、CALL／CHECK 紅、RAISE／BET 紫；行為名稱與百分比放大，5% 等窄色段搭配獨立可讀標籤，不讓文字撐大色帶比例。主預覽利用 FOLD 上方空間，左卡為 BOSS · CALL／CHECK、右側較寬卡為 BOSS · RAISE／BET，卡片不遮玩家底牌。若 CHECK／CALL 結束本街，改顯示 `DEAL FLOP／DEAL TURN／DEAL RIVER`，結算則顯示 `SHOWDOWN`，不加 BOSS 標題或提前公開下街機率。預覽不推進正式 RNG、牌面或水池。

對手只有激進與不激進，正式遊戲不連續重複。每街開始依 NPC 底牌、已揭公牌及已完成街道歷史鎖定「強／不強」，同街價格與配對切換不重判；回應機率則依 NPC 實際可付 CALL 相對於下注基準底池，分半池（≤ 0.5）、全池（> 0.5 且 ≤ 1）、大額（> 1）三列。三個尺寸的預覽各用其實際合法金額；短碼 ALL IN 按實際壓力選列，再移除 RAISE 並正規化 FOLD／CALL，同額選項同機率。強包括成牌、指定聽牌與明確詐唬條件。每次 NPC 重新抽行為，進攻後再抽尺寸 50%／35%／15%。真正只有一種行為、合計 100% 時直接執行，跳過抽取表演；四捨五入成 100% 不算確定行為，正式抽樣與 RNG 路徑不改。新版完整表格與壓力公式見 [v56 規格](docs/19-v56-blind-and-response-spec.md)。

雙方底牌發完即顯示公開的對手牌型參考：Preflop 排除玩家兩張底牌，精確枚舉其餘 50 張中的 1,225 組未知底牌，顯示當前 Pair／High Card；翻牌後沿用當下最佳五張分布。這不是河牌預測，也不讀 NPC 實際暗牌。

## 結果計分、雙池與 JP

開手預建固定玩家底牌、公牌序及所需 NPC win／nonWin 配對。玩家實付時，原結果公式決定是否換至已建配對；同街換牌不改已鎖強弱分類，新街才重判。回應機率依該分類及本次實際壓力取值。使用精簡結果控制器保存所選路徑，不預先展開全部無限加注分支。

`conversionRate = .99` 是唯一結果計分係數，匹配 POT 全額派彩、未跟注款全額退回。贏節點有效付費的計分按 80%／20% 入個人付費池／特殊池；盲注、買入與退款不入池。99% 設定不等於實測 RTP，池餘額也不是玩家返還。

池桶和 JP 沿用 BB 單位：低桶 0 < BB ≤ 10、中桶 10 < BB ≤ 500、高桶 BB > 500。皇家／同花順／四條為 200／50／20 BB，須 root 贏、特殊池足額且抽中資格，最後獲勝攤牌才派獎。SB 10／BB 20 的皇家額為 4,000。既有三桶存量保留。

## 保存與研究

錢包、桌籌碼、雙池、CD、對手序列及未完手狀態一併保存。重整或重開頁面返回買入入口：未完成手按玩家離桌棄牌結算，即使可免費 CHECK 或正在等 NPC；已全下等待 NPC 時，使用保存的 RNG 正常抽取 NPC 回應並完成結算。未匹配投入全額退回，結算後剩餘 CHIPS 兌回 BALANCE 一次；尚未開手的買入則全額兌回。雙池、CD、上一對手及錢包保留，不重設初始資產。

舊桌結束後以一次保存寫入錢包、池及 `table: null`；保存失敗保留原存檔並阻止新買入。底層 snapshot／restore 仍供舊桌結算使用，不再讓 UI 接續舊牌局。舊版餘額／池資料可遷移；研究設定不覆蓋遊戲資產。

機率工具與遊戲共用引擎。一般研究外部錢包無限，但每次入桌只有 100 SB，桌籌碼隨輸贏累積，歸零才模擬新入場。退幣研究以錢包加桌籌碼為總資產；水池不算資產。空白種子每次開始產生一次，固定 0 有效。一次統計先一般、再退幣；不把部分退幣樣本當完整比例。

## 執行與連結

需 Node.js 20 以上，無須安裝套件。在本目錄執行 `npm start`；自動測試 `npm test`，靜態建置 `npm run build`。main 推送由既有 GitHub Actions 建置與部署 Pages。

- 本地：[遊戲](http://127.0.0.1:4177/index.html?v=57)／[機率工具](http://127.0.0.1:4177/probability.html?v=57)／[規則與公式](http://127.0.0.1:4177/docs/04-game-flow-and-math.html?v=57)
- 文件：[v57 比例與可讀性](docs/20-v57-response-readability-spec.md)／[v56 抽盲與回應規格](docs/19-v56-blind-and-response-spec.md)／[v55 八項規格](docs/18-v55-feedback-spec.md)／[v54 歷史呈現規格](docs/17-v54-presentation-spec.md)／[v53 歷史遊戲與數學規格](docs/16-v53-holdem-spec.md)／[規則與數學](docs/04-game-flow-and-math.md)／[API](API-CONTRACT.md)／[介面](docs/05-art-and-pot.md)／[驗證](docs/06-mobile-and-deployment.md)／[接手紀錄](HANDOFF.md)
- Git：[Repository](https://github.com/Seven1888/magic-poker-lite)／[Actions](https://github.com/Seven1888/magic-poker-lite/actions)
- 對外入口：[遊戲](https://seven1888.github.io/magic-poker-lite/?v=57)／[機率工具](https://seven1888.github.io/magic-poker-lite/probability.html?v=57)／[規則與公式](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html?v=57)

以上是 v57 固定入口，最終驗證與部署狀態以發布紀錄為準。主聊天室完成全部調整、驗證、Git 推送及公開驗收後，依使用者授權開新聊天室交接；新聊天室先讀文件、直接提供完整相關連結，再等待新需求，不重做已完成實作、推送或部署。遊戲英文，工具、文件及溝通繁體中文；只修改 Magic Poker Lite。
