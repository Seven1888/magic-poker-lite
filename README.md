# Magic Poker Lite — v59 介面與語音修正

2026-10-07：本輪將 BOSS 行為框恢復整高比例配色、放大文字；YOU／BOSS 使用不同聲線，語音不阻塞流程；移除 BOSS 牌型分布並保留玩家勝率。正式數學與 BOSS 機率表未改，既有 RTP 結構性缺口另行討論；`.99` 僅為計分係數，不能視為99%整體RTP。詳見 [審核與重現證據](docs/22-v59-feedback-and-rtp-audit.md)，實際提交及部署狀態見 [發布紀錄](docs/06-mobile-and-deployment.md)。

v59 入口：[公開遊戲](https://seven1888.github.io/magic-poker-lite/?v=59)／[公開機率工具](https://seven1888.github.io/magic-poker-lite/probability.html?v=59)／[本地遊戲](http://127.0.0.1:4177/index.html?v=59)／[本地工具](http://127.0.0.1:4177/probability.html?v=59)／[交接](HANDOFF.md)／[雙聲線資產](assets/action-voice-v59/)。下方保留 v58 歷史說明，被 v59 取代的呈現要求不再適用。

## v58 已發布歷史版本

單挑德州流程遊戲，正式模式為方案 B pooled-holdem。遊戲使用英文；機率工具與文件使用繁體中文。完整規則見 [規則與公式](docs/04-game-flow-and-math.md)，本次修改見 [v58 規格](docs/21-v58-actions-and-no-jackpot-spec.md)，實際測試與部署證據見 [發布紀錄](docs/06-mobile-and-deployment.md)。

## v58 行為

- 取消 Jackpot 入口、資格與派獎。贏節點有效付款的 .99 計分全部進一般池；舊特殊池同桶併入一般池，保留累積總額與 CD。舊桌先依原契約完成帳務，既有派款不重複、不追回。
- 玩家進攻尺寸為 2× POT、4× POT、ALL IN。倍數指本次支付的當前 POT 倍數，不再額外加 CALL；套最低合法額及剩餘碼上限，同額合併。選單由上到下為 ALL IN、4× POT、2× POT。NPC 進攻尺寸仍為半池、全池、ALL IN 的 50%／35%／15%。
- 玩家及 BOSS 正式行動後，顯示 YOU／BOSS 字卡並播放對應英文語音。包含 CHECK、CALL、BET、RAISE、ALL IN、FOLD，語音遵守音效開關。六個本地 WAV 隨網站發布。
- 每次入桌第一手抽 SB／BB，後手直接交替；每手 BOSS 獨立 50／50 隨機，允許重複。對手牌型機率與玩家參考勝率保留。
- v57 精確比例色帶、綠 FOLD／紅 CALL 與 CHECK／紫 RAISE 與 BET，以及手機可讀性保持。

## 玩法與帳務

選 SB，BB = 2 SB，買入 100 SB。買入轉帳一次，CHIPS 跨手保留，同桌不補碼。每手 NPC 起始籌碼匹配玩家。首次抽盲後依 HU 規則交替，Preflop 由 SB 先、其後由 BB 先，SB 補平後 BB 有選擇權。公共牌依 3／1／1 發出，合法再加注不限次，短全下不重新開放已行動者加注權。

結果模型預建玩家底牌、公牌序及所需 NPC win／nonWin 配對；玩家實付時依 .99 計分與付費池／CD 決定結果轉換。這不是雙方底牌固定、全牌均勻隨機的自然德州。nonWin 包括輸或和局。每街只鎖 NPC 強弱分類，回應按實際下注壓力套 v56 表格。預覽不改正式 RNG、牌或帳務。

匹配 POT 全額派彩，未匹配投入全退，沒有 JP。三桶按 0 < BB ≤ 10／10 < BB ≤ 500／BB > 500，跨手跨桌保留、CD 跨桶。池不算玩家資產或返還；.99 設定不是實測 RTP。

TOTAL BALANCE 是桌外錢包加呈現中的桌碼，`profile.balance` 仍只存錢包。重整結束舊桌後回買入入口：未完手按離桌棄牌，全下待 NPC 則用保存 RNG 正常完成，桌碼只兌回一次。保存失敗保留原存檔並阻止買入。設定匯入不覆蓋遊戲資產。

## 執行與入口

Node.js ≥ 20，無須安裝套件。在本專案執行 `npm start`；`npm test` 跑完整測試，`npm run build` 產出 dist。main 推送後由既有 GitHub Actions 建置並部署 Pages。

- 公開：[遊戲](https://seven1888.github.io/magic-poker-lite/?v=58)／[工具](https://seven1888.github.io/magic-poker-lite/probability.html?v=58)／[規則](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html?v=58)
- 本地：[遊戲](http://127.0.0.1:4177/index.html?v=58)／[工具](http://127.0.0.1:4177/probability.html?v=58)／[規則](http://127.0.0.1:4177/docs/04-game-flow-and-math.html?v=58)
- Git：[專案](https://github.com/Seven1888/magic-poker-lite)／[Actions](https://github.com/Seven1888/magic-poker-lite/actions)
- 文件：[交接](HANDOFF.md)／[工作規範](AGENTS.md)／[API](API-CONTRACT.md)／[v58](docs/21-v58-actions-and-no-jackpot-spec.md)／[v57](docs/20-v57-response-readability-spec.md)／[v56](docs/19-v56-blind-and-response-spec.md)／[v55](docs/18-v55-feedback-spec.md)／[v54](docs/17-v54-presentation-spec.md)／[v53](docs/16-v53-holdem-spec.md)
- 資產：[按鈕](assets/action-buttons-v54/)／[圖片提示詞](assets/action-buttons-v54/prompts.txt)／[行動語音](assets/action-voice-v58/)／[語音來源](assets/action-voice-v58/voice-source.txt)

發布狀態以實際驗證紀錄為準。完成本輪後新聊天室直接提供完整連結，再等待新需求；不重做已完成工作。只修改 Magic Poker Lite，同層其他遊戲永久唯讀。
