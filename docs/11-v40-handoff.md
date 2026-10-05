# Magic Poker v40 新聊天室交接

工作目錄：`C:/Users/User/Desktop/新Magic Poker/Magic Poker Lite`。GitHub：`Seven1888/magic-poker-lite`，main。原 Boss Duel／Hands Up／Final Table 永久唯讀；遊戲英文，機率工具、文件及溝通繁體中文。

## 本輪範圍

- 抽盲改回小盲／大盲英文：標題 BLIND POSITION、抽選中 DRAWING YOUR BLIND、中央與座位 coin 的 SB／BB、結果 YOU · SMALL BLIND／YOU · BIG BLIND。aria／title 明示雙方盲位；STARTING BET 保留 YOU／BOSS 真實初始投入，BET 1 為 0.5／1。只改呈現，不改盲位 RNG、輪替、行動順序或金流。
- 局間 BET 的＋／−將草稿改成新值時，以 `session.rng.clone()` 與 `lastBossProfileId` 預覽同一位下一手 BOSS neutral；多次改值不重選，不消耗正式 RNG、不發牌或扣盲。fixed 模式仍為同型。
- 取消或改回原 BET 還原開窗前畫面；CONFIRM BET 保留下一手 neutral，NEXT HAND 仍由原 `startHand` 選到同型並正式扣盲發牌。再次開窗取消也須還原已確認的預覽。
- 下一手預覽期間一律隱藏舊 BOSS 手牌及牌型，fixed／legacy 即使同角色也不能把上一手牌當成下一手牌；取消還原原可見狀態，不修改已結算結果。
- v39 首手入口 seed 與 entryBase 保持固定，入場、BET、關閉重開、FIGHT 及抽盲同一角色；入口 BET 比例不影響首型。v38 單一 BOSS 回應 100% 預覽、v37 局間 BET 與藍金最佳五張保留。引擎、牌庫、BOSS 固定表、JP 與帳務不變。

## 全部入口

- [遊戲 v40](https://seven1888.github.io/magic-poker-lite/?v=40)
- [中文機率工具](https://seven1888.github.io/magic-poker-lite/probability.html?v=40)
- [完整數學與機率文件](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html?v=40)
- [四種 BOSS 固定機率表](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html?v=40#section-4)
- [沿用的 v35 數學驗證 JSON](https://seven1888.github.io/magic-poker-lite/output/math-v35-validation.json)
- [API 契約](https://seven1888.github.io/magic-poker-lite/API-CONTRACT.md?v=40)
- [GitHub 專案](https://github.com/Seven1888/magic-poker-lite)
- [Pages 發布列表](https://github.com/Seven1888/magic-poker-lite/actions)
- [GitHub v40 交接文件](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/11-v40-handoff.md)

本次精確提交與成功 Pages run 的連結，須由部署後主交接訊息補入。以上版本網址本身不證明已上線。

## 驗證與發布證據邊界

本輪全套自動測試 **276／276**、抽盲測試 **4／4**、下一手身份 helper 測試 **9／9** 通過，正式建置 **184 檔**通過。helper 包含 rotate／四型 fixed／legacy、重複預覽、BET 設定與正式下一手／RNG 一致性；fixed 同角色另有下述實際瀏覽器驗證。

抽盲以原引擎 seed 1（BB）／seed 7（SB），各跑 320×740 減少動態與 390×844 正常速度，共四組中央與座位 coin 驗證；文字、無障礙盲位與 0.5／1 真實投入正確，次局 SB→BB 輪替，與原引擎基準一致，無額外 RNG 或溢出。

局間 BET 使用原引擎 seed 30、未手動指定牌面，四次 check 自然攤牌後玩家勝，trapper frown、雙方刷新後各 10,092。改草稿預覽 sniper neutral，多次調整不變；改回原 BET／取消恢復原角色表情及手牌。確認 BET 100→200 保留 sniper，連點 NEXT HAND 僅開一次，下一手玩家 SB、資產 9,992／9,892、POT 300、TOTAL BET 100，與無預覽基準一致。320／390／844 寬無溢出；上述瀏覽器腳本皆 0 頁面／HTTP 錯誤，截圖已檢視。

fixed／caller 補測使用 seed 30、自然四次 check 攤牌：caller smile、兩張已揭牌與 Pair。草稿／確認維持 caller neutral，舊底牌與 Pair 隱藏；取消恢復 smile 與原兩張牌／Pair。NEXT HAND 同 caller、清除預覽，兩張新背牌與隱藏牌型正確，資產 9,800／9,700、POT 300、TOTAL BET 100，0 頁面／HTTP 錯誤。

證據位於 `output/playwright/{tests-v40,build-v40,blind-tests-v40,blind-v40-local,bet-boss-v40-local,bet-boss-v40-fixed-local}.txt` 及 `output/playwright/v40-local-*.png`，詳細本機紀錄見 [docs/06](06-mobile-and-deployment.md)。皆為桌面 Chromium viewport，非實體手機，不是新機率統計。數學沿用 **v35 的 25,000 手＋1,000 副完整樹**，不是 v40 新 RTP 校準。

本文件記錄提交前證據。使用者要求全部驗證後一次提交／推送，確認該完整 SHA 的 Pages 成功並實測正式站，再開新聊天室。確切 SHA、Pages run、公開測試及任何後續補測，以部署後證據與主交接訊息補足，不提前宣稱上線。

## 新聊天室接續任務

先直接讀取 `AGENTS.md`、本文件及 docs/06 的 v40 紀錄，簡短確認接手並列出以上全部連結，以及主交接訊息提供的提交／成功 Pages run 連結。若接續實作，再讀 `.agents/skills/magic-poker-bridge-design/SKILL.md`；使用者最新指示及 AGENTS v40 優先於歷史描述。

接著與使用者討論：**「BOSS 手牌左邊顯示可能牌型與 % 數，是否更好？」** 先釐清想表達的是目前可能牌型、未來成牌率或其他資訊，說清百分比算法、分母與可用公開資訊，評估左側畫面空間及可讀性。不得洩漏 BOSS 未公開底牌、未來公共牌或引擎結果；不能把牌型分布、行動機率與玩家勝率混用。

這是下一輪的設計討論，尚未承諾、實作或驗證該功能。先與使用者形成明確方案，再依後續指示決定是否實作；接手時不自行加功能、改版、推送或另開聊天室。
