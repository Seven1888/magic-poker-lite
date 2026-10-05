# Magic Poker v42 交接

工作目錄 `C:/Users/User/Desktop/新Magic Poker/Magic Poker Lite`，GitHub `Seven1888/magic-poker-lite`，main。原 Boss Duel／Hands Up／Final Table 永久唯讀；遊戲英文，工具、文件與溝通繁中。

## 使用者要求與本版調整

使用者看到 FLOP `7♥ 6♠ K♠` 的 HIGH CARD 100%，明確要求「算出他可能是什麼牌型的機率，方便玩家看懂牌面」，並確認只有 FLOP 之後顯示、TURN 與 RIVER 也要改變。本版已將 v41 的行動證據推估改成只依已知牌與起手規則的牌型可能性；v41 固定行動表反推牌力的做法不再適用。

主畫面顯示 POSSIBLE HANDS，詳情為 POSSIBLE BOSS HANDS。保留最高兩類＋OTHER 原比例、詳情互斥九類、皇家併同花順；不是玩家勝率、BOSS 行動率或未來成牌率。FLOP 三張完整揭開後顯示，TURN／RIVER 揭開後重新計算並先清舊數字。同街下注不改分布，busy 關閉並禁開詳情，攤牌／棄牌／換手隱藏；v41 平面行動橫幅保持。

## 模型與資訊邊界

API 為 `createBossHandRange({playerHole,smallBlind,config:{deal}}).update({board})`。扣除玩家已知牌與已揭公牌，枚舉未知 BOSS 兩張底牌，依精確有限次重抽先驗加權；BOSS 先發時另計後發玩家手牌的條件權重，指定玩家牌事先保留。指定 BOSS 牌只傳 manualProvided 並 unavailable，不傳其牌值。

不再讀取 BOSS 身份、BOSS 模式、legacy 行動權重、FOLD／CALL／RAISE、可見行動機率、合法動作、POT 或待補金額。這份模型只對已知牌與起手規則條件化，刻意不加入下注策略的後驗訊息；預設重抽仍使候選不等權。只有牌面／起手規則真的令所有正權重候選都落入同類時才可顯示 100%。

Worker 僅收 `{epoch,request,context,board}`，context 只有 `playerHole`、`smallBlind` 與 allowlist `config.deal`。不收 hand/session、BOSS 暗牌、牌庫、未揭公牌、seed、roll 或 dealAudit。epoch/request 排除舊手舊街延遲結果；不消耗正式 RNG，不改 engine/poker、BOSS 表、輪替、帳務或 JP。

## 驗證與發布狀態

新 `scripts/validate-range-v42.mjs`／`output/math-v42-range-validation.json` 已通過獨立枚舉、有限次重抽、legacy 邊界、反向發牌與指定牌驗證，最大差 **1.59e-14**；20 組角色／行動不變性、4 組禁止 getter、三街重算與皇家公牌必然牌型亦通過。24 自然手／172 動作與無分析器基準的 RNG、牌面、帳務一致，272 次真實牌型有正機率、212 次同公牌動作前後分布不變。6 個來源雜湊採 UTF-8 normalized LF，附 clientDate/timezone。

本輪全套測試 **300／300**、正式建置 **192 檔**通過。本機四型×320／390 共 **8 組**完整四街→攤牌→NEXT HAND，另 430／844 排版與九類詳情檢查通過，0 頁面／HTTP 錯誤；標題／各列無溢出或底牌重疊，320 主桌與詳情截圖已檢視。Worker 每手 6 次請求中 3 次 ready，不含 profile／evidence／actions，同公牌不重算。瀏覽器為桌面 Chromium viewport，非實體手機。

seed 18 正常動畫 1,802 個 25ms 取樣幀涵蓋 deal／you／boss／complete，無異常幀或 range 錯誤；seed 57 減少動態補測亦通過。兩組均為 PAIR 72.7%／TWO PAIR 18.7%／OTHER 8.6%，seed 18 自然公牌為 `5c 6h 6d`、截圖已檢視。busy 禁點詳情、BET 草稿／確認／換手清空與 FLOP 棄牌隱藏分布、BOSS 維持牌背通過；0 頁面／HTTP 錯誤。

完整本機紀錄見 [docs/06 v42](06-mobile-and-deployment.md)。依既有要求全部驗證完成後整批一次提交／推送並核對正式站，本輪不再開新聊天室。本文件不宣稱已推送或部署；精確 SHA、Pages run 與正式站實測須發布後補入主交接訊息或證據。`output/math-v41-range-validation.json` 是舊模型歷史報告，不能當作 v42 證據；遊戲模型數據仍沿用 `output/math-v35-validation.json`，本輪不是新 RTP 或發牌頻率校準。

## 相關連結

以下版本網址不代表已部署，以完成後的發布紀錄為準。

- [遊戲 v42](https://seven1888.github.io/magic-poker-lite/?v=42)
- [中文機率工具](https://seven1888.github.io/magic-poker-lite/probability.html?v=42)
- [完整數學與機率文件](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html?v=42)
- [四 BOSS 表與第 4.7 節牌型模型](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html?v=42#section-4)
- [v42 牌型算法與引擎隔離驗證 JSON](https://seven1888.github.io/magic-poker-lite/output/math-v42-range-validation.json)
- [v35 遊戲模型數學 JSON](https://seven1888.github.io/magic-poker-lite/output/math-v35-validation.json)
- [API](https://seven1888.github.io/magic-poker-lite/API-CONTRACT.md?v=42)
- [GitHub](https://github.com/Seven1888/magic-poker-lite)
- [Pages 發布列表](https://github.com/Seven1888/magic-poker-lite/actions)
- [v42 交接文件](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/13-v42-handoff.md)

精確提交與成功 Pages run 連結只能於完成後提供；後續依使用者最新要求操作，不能把歷史開新聊天室要求當成本輪已完成的發布證據。
