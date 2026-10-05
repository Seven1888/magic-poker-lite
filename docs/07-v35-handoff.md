# Magic Poker v35 新聊天室交接

工作目錄：C:/Users/User/Desktop/新Magic Poker/Magic Poker Lite。GitHub：Seven1888/magic-poker-lite，main。Boss Duel、Hands Up、Final Table 原作保持唯讀。遊戲英文，工具與溝通繁體中文。

## 入口

- 遊戲：https://seven1888.github.io/magic-poker-lite/?v=35
- 中文機率工具：https://seven1888.github.io/magic-poker-lite/probability.html?v=35
- 模型文件：https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html?v=35
- 本版驗證：https://seven1888.github.io/magic-poker-lite/output/math-v35-validation.json
- GitHub：https://github.com/Seven1888/magic-poker-lite
- 發布狀態：https://github.com/Seven1888/magic-poker-lite/actions

## 已整合

10,000起始資產；開局只顯示誰先／後與雙方盲注初始投入。POT居中、籌碼在金額後；取消牌堆畫面。單一常駐行動提示；BOSS機率浮於按鈕上方且標BOSS。玩家實付先飛抵POT，再飛BOSS機率並抽選。遊戲動作統一FOLD／CALL／RAISE、底層type保留。

BOSS底牌置桌前，玩家／對手籌碼上移及放大；TOTAL WIN與噴金幣在POT區，總返還不含退款。逐街翻牌平順、暗牌不提前揭。BOSS實際行動從角色前浮字，紅色RAISE與籌碼出發同步，CALL/FOLD也顯示；取消／下手／減少動態清理。

四型caller死跟、maniac狂攻、sniper狙擊、trapper設局。三新角色來自使用者附件，各neutral/smile/frown；圖檔及prompts/來源在assets。首次各25%，同一玩家下手排除上型、其餘各1/3；固定研究可刻意重複。每街×可見牌力有固定表，boss-profiles.mjs four-boss-v1共56列；合法動作過濾後正規化。config.npc只供玩家策略及legacy BOSS，不控制新四型。

中文工具依HandsUp的完整分析架構重做：單副固定牌序全部合法行動樹（1312節點750終端）、抽樣牌序×完整樹积分、玩家模式independent/continuous/cashout、各BOSS/街道/動作/資產/重抽/JP/切片/CI/稽核與匯出。未採HandsUp先定勝負配牌；本作仍共享52張牌、真實牌力決勝，沒有宣稱已校準高玩家勝率。

BossDuel重抽適配兩張未成對才判定：玩家50%/BOSS25%、額外最多50次、成對即停、保留最後候選不挑最好，落選回池。舊targetScore保留legacy-score兼容。JP皇家200×BET、同花順50×BET、四條20×BET，攤牌獨立加獎只取最高。

## 驗證與接續

236項測試、179檔建置，真實瀏覽器浮字／chips同步、四型表情、輪替、手機工具/文件均通過；25k手+1000副樹在math-v35-validation.json。CI：rotate跨手相關按玩家群集，fixed/legacy獨立模式按手，treeStudy獨立新桌按副牌（跨副可重複，與同桌遭遇不同）。新數據不能用v34或舊260k基準替代。

下一次修改先讀AGENTS.md、專案skill、docs/04、API-CONTRACT.md、docs/06。本次使用者要求全部整合一次上Git、再開新聊天室給所有連結；公開提交SHA與Actions驗證由建立新聊天室的訊息補充。接收交接後顯示連結，等待使用者下一個要求，不自行另做改版。
