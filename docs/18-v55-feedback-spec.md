# v55 抽盲、操作資訊、資產與收款呈現

更新：2026-10-07。使用者已授權一次完成以下八項、驗證後推送 Git、部署並開新聊天室交接，由新聊天室提供相關連結。實際驗證與發布狀態見 [發布紀錄](06-mobile-and-deployment.md)。

## 範圍

只修改 Magic Poker Lite，同層 Boss Duel、Hands Up、Final Table 永久唯讀。遊戲英文，工具、文件與溝通繁體中文。沿用 v53 方案 B `pooled-holdem`、.99 結果計分、三桶雙池、CD、JP、兩型對手、每街鎖定機率與原有買入／兌回帳務；不改抽樣或派彩公式。

## 八項已確認要求

1. 抽大盲／小盲期間保留桌面其他資訊。抽盲金幣不遮行動階段 `DRAWING YOUR BLIND`；移除 `BLIND POSITION` 上排文字。
2. 三個操作按鈕主文字縮小；籌碼圖示、花費金額放大。BET／RAISE 保留向上箭頭，RAISE 箭頭有動態效果。展開尺寸左側的 BOSS 決策框縮窄，以 BOSS 標籤的底色形成整圈有厚度的外框。保留按鈕 66 px、合法尺寸及各精確動作的預覽。
3. 真正只有一種行為、其機率合計 100% 時，跳過行為抽取動畫，直接執行；不是將畫面四捨五入成 100% 的機率當作確定行為。引擎仍依原路徑抽樣，尺寸選擇與正式 RNG 不因表演而改變。
4. CHECK／CALL 直接結束街道時，預覽不用 BOSS 標題，改顯示 `DEAL FLOP`、`DEAL TURN` 或 `DEAL RIVER`；結算用 `SHOWDOWN`。不提前洩漏下一街牌面或決策機率。
5. `TOTAL WIN`／`BOSS WIN` 從收款開始即出現，前景文字及數字持續呈現，籌碼從文字後方持續飛向對應勝方籌碼堆。完整收款表演先設實際 2,000 ms，不除以遊戲速度；數字、目的籌碼與玩家總餘額共用同一進度。不是飛完 POT 才顯示勝方文字。退款與 JP 繼續各自對帳，視覺籌碼流不代表多次入帳。
6. 買入取消從資產位置飛向桌面的動畫，保留双方原位逐步堆高與金額同步增加；沿用 1,400 ms、至少 1,000 ms，完成前沒有任一方底牌／背牌。上方改為 `TOTAL BALANCE`：桌外錢包加畫面當下呈現的玩家桌碼。帶入／離桌本身不增減總餘額，下注時同步減、退款及贏錢時同步加。買入堆疊尚未長完時，總餘額仍包括完整已買入金額。profile 的 balance 仍只保存桌外錢包，不能把顯示總額再存為錢包而重複計算。
7. 雙方同額籌碼使用相同視覺單位、層數、高度與大小。共同標尺於新桌買入重設，同桌收款或下手 NPC 匹配不得各自改比例。
8. 雙方下注至 POT、POT 返還贏家的飛行籌碼在普通資訊上方，僅 `TOTAL WIN` 與 `BOSS WIN` 可以位於飛行籌碼前景。不得因其他資訊框、控制按鈕的堆疊上下文遮住籌碼。

## 驗證重點

需確認買入期間總餘額不變、兩堆同額同高、抽盲桌面保留、各種尺寸機率不洩密／不耗 RNG、真正 100% 跳抽、兩位勝方各 2 秒及進度同步；另檢查平手、退款、JP、重整、離桌及輸光重入的帳務不重複。桌面 Chrome 320／375／393／412／1440 px 驗證不等同實體 Android；小樣本不構成實測 RTP。

## 連結

- 本地：[遊戲](http://127.0.0.1:4177/index.html?v=55)／[機率工具](http://127.0.0.1:4177/probability.html?v=55)／[規則](http://127.0.0.1:4177/docs/04-game-flow-and-math.html?v=55)。本地服務 `npm start`（Node >= 20，127.0.0.1:4177）。
- 公開：[遊戲](https://seven1888.github.io/magic-poker-lite/?v=55)／[機率工具](https://seven1888.github.io/magic-poker-lite/probability.html?v=55)／[規則](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html?v=55)。
- [GitHub](https://github.com/Seven1888/magic-poker-lite)／[Actions](https://github.com/Seven1888/magic-poker-lite/actions)。
