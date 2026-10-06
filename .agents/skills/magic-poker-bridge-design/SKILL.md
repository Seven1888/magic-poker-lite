---
name: magic-poker-bridge-design
description: 維護 Magic Poker Lite 的現行預建結果樹、Hands Up RTP 計分與個人雙水池、德州下注、共用統計及繁體中文機率工作台。
---

# Magic Poker Lite 現行設計

先讀 [工作規範](../../../AGENTS.md)。最新使用者要求優先。2026-10-06 使用者已授權將 v51 提交、推送至 GitHub；推送 main 後由現有 Actions 測試、建置並部署 Pages，實際發布結果以 Actions 為準。沿用現有 checkout，原三款永久唯讀。

讀 [規則與數學](../../../docs/04-game-flow-and-math.md) 及 [API 契約](../../../API-CONTRACT.md) 理解目前模型；[驗證紀錄](../../../docs/06-mobile-and-deployment.md) 只記實際通過的檢查。不要引用過時模型或舊測試數當本輪證據。

對照 Hands Up 現行 simulation-engine.js 的第一手計分、drawPaidOperationOutcome、個人兩池及 CD。只用一個 RTP 係數 .99，匹配 POT 全額派彩；不新增另一筆結算折扣。付費前贏繼承；付費前輸且 CD=0 可用付費池；實際選中贏節點的有效付費分數按 80%／20% 入雙池；退款不入池。特殊池足額且開局抽贏才抽資格，獲勝攤牌後扣池派獎。

遊戲／研究共用正式引擎，玩家入場後每手建立本手完整樹、原子發布，分析／預覽不提交真實資產或池。雙池及 CD 跨手、BET 與桌保存，profile 的整手儲存不能被設定匯入覆蓋。公開參考勝率不能讀秘密目標或牌面。

機率工具採 Hands Up 的單欄工作台與兩欄群組橫列表單，退幣在模擬設定內玩家行為下方。一般研究固定無限資產連續遊玩；種子空白隨機；開始統計自動含退幣。不提供獨立建樹或樹統計入口。主畫面與現行文件不保留舊牌庫、歷史基準、舊 BOSS 或多個折扣的說明。

修改數學後核對真實結算、池對帳、跨手保存與共享 Worker；跑必要測試並重算平均開局門檻。以桌面 Chrome 驗證 1440／375／320px 設定與結果，不把 viewport 驗證說成實體手機或長期 RTP 認證。
