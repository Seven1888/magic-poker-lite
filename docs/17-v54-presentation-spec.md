# v54 買入、操作資訊與籌碼表演規格

更新：2026-10-07。**本地驗證完成，待 Git／Pages 發布。** 使用者已授權完成全部 11 項回饋，納入先前的重整離桌修正，驗證後一起更新 Git／Pages，再建立新聊天室交接並提供連結。提交、部署及新聊天室的實際結果須完成後另記，不預填成功。

## 1. 模型與範圍

只修改 Magic Poker Lite；同層 Boss Duel、Hands Up、Final Table 永久唯讀。遊戲英文，工具、文件與溝通繁體中文。

沿用 v53 已選方案 B：正式 `pooled-holdem`、0.99 結果計分、個人付費池／特殊池、CD、JP、兩型對手、每街鎖定機率、合法加注及有限桌碼。完整玩法與數學仍以 [v53 規格](16-v53-holdem-spec.md)、[規則與公式](04-game-flow-and-math.md) 及 [API](../API-CONTRACT.md) 為準。本輪不重選結果模型，不宣稱 0.99 是實測 RTP。

## 2. 使用者 11 項回饋

| 項次 | 已確認需求 |
| --- | --- |
| 1 | RAISE 金額選單由下往上為 0.5× POT、1× POT、ALL IN；也就是由上到下 ALL IN、1× POT、0.5× POT。 |
| 2 | 入場時雙方沒有手牌，包含背牌。雙方買入表演至少 1 秒；籌碼飛至各自區域後逐步形成實體籌碼堆，不淡出消失；金額由 0 同步累加至買入額。完成後才下盲注、發牌。 |
| 3 | 移除籌碼上方的 CHIPS 文字，保留實體籌碼堆及金額。 |
| 4 | 移除 NPC 手牌下方的行為機率橫條，改放玩家操作按鈕上方。三按鈕維持現有尺寸與 66 px 高度，將按鈕上方至行動資訊的整段區域向上移，騰出空間。 |
| 5 | 雙方底牌發完後立即顯示 NPC 牌型參考機率，不等待 Flop。 |
| 6 | CHECK／CALL 下方的 FREE 或金額前加上籌碼圖示。 |
| 7 | RAISE 的每個合法尺寸選項左側，顯示該選項對應的 NPC 行為機率。 |
| 8 | 任一方獲勝時，應得 POT 一次整筆收回，數字連續累加；玩家 TOTAL WIN 與玩家籌碼同步上跑至最終值，保留收款張力。 |
| 9 | 玩家 ALL IN 輸光、桌碼歸零後，完成結果表演即自動離桌，直接返回 BET／SB 選擇及 BUY-IN，不必手動離桌。 |
| 10 | 入口由左到右排列可調 SB、連動 BB、連動 BUY-IN；BB = 2 SB，BUY-IN = 100 SB。 |
| 11 | 依現有遊戲美術，以 GPT 生成三個操作位置的五種狀態：FOLD／CHECK／CALL／BET／RAISE。主文字使用美術字，RAISE AMOUNT 改為 RAISE ▲，不含 AMOUNT；RAISE 三尺寸金額前也加籌碼圖示。 |

## 3. 買入與入口

SB 是唯一自由選擇的數字；BB 與 BUY-IN 隨 SB 連動，不可各自變成獨立帳務設定。例如 SB 10 → BB 20 → BUY-IN 1,000。選額不扣款，按 FIGHT 才做一次 BALANCE → 桌籌碼的轉帳並保存。

買入動畫預設 1,400 ms，最低 1,000 ms，使用實際時間，不除以遊戲速度倍率。雙方顯示金額由 0 開始，飛行籌碼抵達時逐步堆成常駐籌碼，金額隨同一呈現進度增加至正確買入額。動畫只讀已提交金額，不另扣 BALANCE，也不向水池入帳。完整買入後才開始盲位、盲注與發牌流程；入口及買入中不預放任一方的背牌。

同桌不補碼。玩家歸零後先完成該手的公牌、攤牌與收款／結果表演，再離桌清空桌狀態、回買入入口。下一次須由使用者重新選 SB、按 FIGHT，不能自動買入；BALANCE 不足時仍依既有規則禁止買入。

## 4. 按鈕與回應預覽

三個操作位置維持現有尺寸及 66 px 高度；中間位置按合法動作顯示 CHECK／CALL，右側顯示 BET／RAISE。FOLD 為墨綠、CHECK／CALL 為酒紅、BET／RAISE 為皇家紫，五張美術共用金色厚倒角框及米金浮雕字。右側文字為 BET ▲／RAISE ▲；圖像下方保留動態資訊空間，數字及 FREE 由程式繪製，前方帶籌碼圖示。

選單連接右側按鈕向上展開；由上至下 ALL IN、1× POT、0.5× POT。排序只改呈現，不更動引擎合法動作、最小完整加注、短全下或尺寸公式。被最小額／籌碼上限合併的同額候選只顯示一次，保留原動作 ID、`sizeKeys` 及實付金額。

行為資訊移至玩家按鈕上方；每個展開的加注尺寸左側顯示該完整合法動作的 NPC 回應分布，不能以同一個 type 取代不同金額。預覽只在隔離副本中計算，不推進正式 RNG、不變更暗牌、池或資產。顯示可合併同 type 的百分比，實際提交仍保留精確尺寸。

若 CHECK／CALL 會結束目前街道，顯示 `NEXT STREET`，不提前公開新街機率、分類或公牌；若已結算，顯示 `SHOWDOWN`。NPC 真正輪到行動時，仍依原有每街鎖定表抽樣。精確機率可推知強弱桶，但不公開桶內原因或秘密牌。

## 5. Preflop 公開牌型參考

雙方底牌發完即可顯示。Preflop 只排除玩家已知兩張底牌，從其餘 50 張精確列舉 `C(50,2) = 1,225` 組未知底牌，按當前兩張牌分成 Pair／High Card。Pair 的比例依玩家兩張牌是否同點數而不同，不能套固定比例。

這是標準未知底牌的當前牌型分布，不讀 NPC 實際暗牌、結果目標或未來公共牌，也不預測最終 River 牌型。Flop／Turn／River 沿用排除玩家底牌及已揭公牌後的未知底牌枚舉，以當下可用牌的最佳五張分類；不因提前顯示 Preflop 而改成完整河牌模擬。

## 6. 一次收款與同步顯示

每個收款者的匹配 POT 派彩 `netReturn` 以一整包移動；贏家一包，平手則每位玩家各收一包應得金額。POT、目的籌碼堆、籌碼數字與玩家 TOTAL WIN 依同一份已提交結算的進度同步，不拆成多筆反覆收 POT 的表演。

未匹配投入退款與 JP 仍保留獨立帳務及呈現階段：退款不算 TOTAL WIN，JP 按原有資格與結算加入。動畫只是把既有 `refund`／`netReturn`／`jackpotAward` 顯示出來，不修改結算結果、再次加錢或重派 JP。重整、切換視圖及重播都不能重複收款。

## 7. 重整返回入口修正（隨 v54 發布）

重整或重開頁面先結束保存中的舊桌，再回買入入口。未完手即使可免費 CHECK 或正在等 NPC，也按玩家離桌棄牌結算；玩家已全下、待 NPC 回應時，用保存 RNG 正常抽回應並完成結算。未匹配投入全額退回，剩餘玩家籌碼兌回 BALANCE 一次。已結算手不重派；買入動畫尚未開手時兌回全部桌籌碼。

保留 BALANCE、雙池／CD 與上一型，以一次保存提交完整新 profile 與 `table: null`；保存失敗保留原存檔並阻止新買入，不重設初始資產。`endHandForTableExit` 負責引擎結算，`closeSavedTable` 是不讀寫 storage 的純轉換；snapshot／restore 保留作帳務與研究底層 API，UI 不再接續舊手。

## 8. 美術資產與驗證

五張獨立透明 PNG 位於 `assets/action-buttons-v54/{fold,check,call,bet,raise}.png`，皆為 1,774×887、2:1、原生 alpha。以內建 ImageGen 生成 FOLD 母版後，分別生成四張相同幾何的變體；未使用 CLI／API fallback。最終提示詞與模式記錄見 [prompts.txt](../assets/action-buttons-v54/prompts.txt)。

本輪驗收需涵蓋買入時長／無牌／堆疊與數字、入口連動、按鈕高度／文字／圖示、各尺寸預覽與 RNG 不變、Preflop 1,225 組分布、雙方收款／平手／退款／JP、歸零返回入口、重整及保存失敗。桌面瀏覽器手機 viewport 不等於實體 Android 驗證；小樣本不構成長期 RTP 證據。

v54 本地驗證已完成：`npm test` 552／552 通過、0 失敗與跳過；建置 228 檔、59,566,682 位元組。Chrome 320／375／393／412／1440 px、買入無牌與連續堆疊／金額、逐尺寸圖示與回應、Preflop 分布、勝方一次收款與 TOTAL WIN 同步、輸光自動返回入口均已驗證；page error 與 request failed 皆 0。實際取樣與檔案見 [驗證紀錄](06-mobile-and-deployment.md)。Git 提交、Actions／Pages 及新聊天室仍待完成後補入 [HANDOFF](../HANDOFF.md)，不預填發布成功。原 v53 的 519 項與重整單項的 529 項保留為歷史證據。

## 9. 交付入口

- 本地：[遊戲](http://127.0.0.1:4177/index.html?v=54)／[機率工具](http://127.0.0.1:4177/probability.html?v=54)／[規則](http://127.0.0.1:4177/docs/04-game-flow-and-math.html?v=54)。
- 公開：[遊戲](https://seven1888.github.io/magic-poker-lite/?v=54)／[機率工具](https://seven1888.github.io/magic-poker-lite/probability.html?v=54)／[規則](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html?v=54)。v54 尚未部署，連結查詢值不代表已發布。
- [GitHub](https://github.com/Seven1888/magic-poker-lite)／[Actions](https://github.com/Seven1888/magic-poker-lite/actions)。新聊天室尚未建立，不預填連結。
