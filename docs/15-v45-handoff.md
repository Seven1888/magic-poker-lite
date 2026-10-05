# Magic Poker v45 交接

工作目錄 C:/Users/User/Desktop/新Magic Poker/Magic Poker Lite；GitHub Seven1888/magic-poker-lite，main。原 Boss Duel／Hands Up／Final Table 永久唯讀，遊戲英文，工具、文件及溝通繁中。

## 本輪需求與變更

- 正收益 TOTAL／WIN 上下兩行與贏分皆為明亮金色立體美術字，直接浮在桌面；無底板、底框或裝飾線。
- 雙方籌碼減少不顯示負數浮字，行動橫條與角色浮字只列 CALL／RAISE／FOLD，不附重複金額；玩家操作按鈕的實付、STARTING BET、資產與明細照實保留。
- 中央 BOSS 機率抽選收起背後行動橫條，避免 BOSS TURN 或前一行動透出。依使用者最後補充，低於 10% 的小區段隱藏放不下的名稱及百分比，不另放外部標籤；原色、真實區寬與抽選結果保持。
- FIGHT 首手及 NEXT HAND 每手都抽出實際 50/50 SB／BB，播放同一結果的抽盲；允許連續同盲位。BOSS 仍排除上一型，其餘三型各 1/3，首手四型各 1/4。

## 引擎與預覽契約

createSession 的 options 仍只接受 firstSmallBlind:'random'|'player'|'npc'，沒有新增設定 key。random 設 session.blindMode='random'，首手沿用 createSession 既有的一次 RNG；後手 startHand 通過可開局檢查後、選 BOSS 與發牌前新增一次盲位 RNG。player／npc 及缺省 player 設 alternate，保留受控研究的交替位置。

session.firstSmallBlind 永遠保存首手實際 player／npc。random 的 session.blindDraw 只含本手 smallBlind 與 probability:0.5，不含 roll／handNumber／bigBlind；alternate 為 null。任一資產低於 .01 或 activeHand 仍 playing 時拒絕 startHand，不變更狀態或消耗 RNG。

局間 BET 的下一手 BOSS 預覽使用 RNG clone：random 後手先略過一次盲位抽樣，再選型，與正式開手對齊；不發牌、不扣款、不推進正式 RNG。多次調整 BET 不換下一型；取消／改回原 BET 還原。正式抽盲、選型、扣盲與發牌仍由 startHand 各執行一次。

simulateStudy 的 continuous／cashout 採每手 random，independent 保留受控交替，完整樹及抽樣樹維持既有交替排程。methodMeta.blindMode 分別為 random-each-hand／alternating，initialBlind 說明同步。

## 必須維持與驗證界線

- 贏分仍是 player.totalReturn = netReturn + jackpotAward，排除退款、不等於 profit；保留來源籌碼至抵達、精確跑分、單手去重及減少動態。
- v43 參考算法不變：等權未知牌，FLOP／TURN／RIVER 精確枚舉、PREFLOP 100,000 次估算、平手半份。BOSS 取最高三個正機率牌型再按牌力排序，無 OTHER，不補未來公牌。
- v44 原創 96／128 BPM 配樂、音效與獨立開關保留；BOSS 實際揭牌才換配樂，完整公開才收尾。全下按當下已揭公牌算勝率，不能讀未見牌演出。
- 發牌／起手重抽規則、固定 BOSS 表、下注額、JP 與帳務公式不改。但 v45 新增後手盲位抽樣，正式引擎及 RNG 排程已變；不能宣稱整個引擎完全未改或所有舊來源雜湊吻合。
- v35 數學 JSON 是歷史結構／帳務資料，不是 v45 RTP 校準。v43 純算法未改，但其報告內的引擎來源雜湊仍是歷史；舊 seed 的後手牌序不能宣稱相同。本輪未做大型 RTP 重跑。

## 驗證與發布

本文件於整合時寫入，不預宣通過或上線。實際測試、窄螢幕抽選／贏分截圖、自然連續開手與正式站結果，以 [docs/06 v45](06-mobile-and-deployment.md) 及完成訊息為準；瀏覽器手機 viewport 不能冒稱實體手機驗收。

使用者授權全部完成後一次提交／推送，確認 Pages 及正式站，再開新聊天室附全部連結。精確完整提交 SHA、成功 Pages run 與公開證據由部署後完成訊息及新聊天室交接提供，不為填入自身 SHA 再做第二次提交。交接完成後等使用者新要求，不自動開新改版。

## 所有主要連結

1. [遊戲 v45](https://seven1888.github.io/magic-poker-lite/?v=45)
2. [繁中機率工具](https://seven1888.github.io/magic-poker-lite/probability.html?v=45)
3. [完整規則與數學](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html?v=45)
4. [四 BOSS 表與牌型模型](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html?v=45#section-4)
5. [API 契約](https://seven1888.github.io/magic-poker-lite/API-CONTRACT.md?v=45)
6. [v43 參考算法歷史驗證](https://seven1888.github.io/magic-poker-lite/output/math-v43-holdem-validation.json)
7. [v35 遊戲模型歷史驗證](https://seven1888.github.io/magic-poker-lite/output/math-v35-validation.json)
8. [一般牌桌 BGM](https://seven1888.github.io/magic-poker-lite/assets/audio/table-v44.wav)
9. [BOSS 揭牌 BGM](https://seven1888.github.io/magic-poker-lite/assets/audio/showdown-v44.wav)
10. [GitHub 專案](https://github.com/Seven1888/magic-poker-lite)
11. [完整提交紀錄](https://github.com/Seven1888/magic-poker-lite/commits/main/)
12. [Pages 部署紀錄](https://github.com/Seven1888/magic-poker-lite/actions)
13. [手機／驗證文件](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/06-mobile-and-deployment.md)
14. [v45 交接](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/15-v45-handoff.md)
15. [配樂來源與 SHA256](https://github.com/Seven1888/magic-poker-lite/blob/main/assets/audio/README.md)
16. [歷史 v44 交接](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/14-v44-handoff.md)

以上 v45 網址是版本入口，不能單憑網址判斷已發布。完成訊息須將第 11／12 項補為本輪精確提交與成功部署連結。
