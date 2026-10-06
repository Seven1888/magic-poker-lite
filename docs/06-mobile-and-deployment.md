# 驗證與發布狀態

## v52 手機 BET 對齊修正（2026-10-06）

v51 已以提交 bc34ea78d8698320e3ecfc2543fc9eeb593ba0c7 發布，[Actions 37434084931](https://github.com/Seven1888/magic-poker-lite/actions/runs/37434084931) 的 439 項測試、建置與部署成功。以下 v51 紀錄保留其發布準備時的驗證範圍。

v52 修正入口 BET 標題與加減控制列的明確 flex 對齊，並更新 entry.css、entry-v28.css 的版本網址。停用基礎 entry.css 能重現使用者截圖的偏左、標題黏合與原生輸入框；不能僅憑截圖判定手機快取或網路失敗的具體原因。新版即使基礎樣式缺失，BET 控制列仍置中。

Chrome 320／360／375／393／412／1440px、BET 1／50／2000 共 18 組檢查通過：數值與加減按鈕中心偏差 0px、標籤對齊、無水平溢出；上下限按鈕及最低資產數值正常。缺少基礎樣式的對照檢查亦通過，console／page error 0。截圖與檢查腳本在 output/playwright/bet-v52-*；此為桌面 Chrome viewport 驗證，非實體 Android 驗收。遊戲數學與研究規則沿用 v51；本次推送後以 Actions 確認部署結果。

公開入口：[遊戲 v52](https://seven1888.github.io/magic-poker-lite/?v=52)。

## v51 驗證與發布準備紀錄

2026-10-06，local51／v51 發布準備。使用者已要求「更新上git，提供全部連結」，授權提交並推送 main；既有 GitHub Actions 會觸發建置與 Pages 部署，實際結果以 Actions 為準。以下保留已完成的本地驗證範圍。現行契約見 [規則與公式](04-game-flow-and-math.md)、[API](../API-CONTRACT.md) 及 [README](../README.md)。

## 已完成調整

- 對照 Hands Up 現行程式，保留唯一 99% RTP 計分係數；匹配 POT 全額派彩，退款全額返還，不再收額外 4% 費。舊保存設定載入後轉為現行結果及 BOSS 模型。
- 玩家入場並開始每一手後，才依當時狀態建立本手行動樹；遊戲、一般及退幣統計共用同一引擎。機率工具移除獨立建樹與樹統計入口。
- 工作台依 Hands Up 排版為五個彩色設定區，退幣在模擬設定的玩家行為下方；資產與下注歸基礎遊戲規則。移除舊模型選項、舊重抽欄位與歷史基準分頁。
- 一般統計固定無限資產連續遊玩，玩家行為只選策略；種子空白每次隨機一次，全策略及一般／退幣共用，固定 0 有效。
- 開始統計自動先完成一般策略、再完成退幣策略；退幣保留有限初始與目標資產，直到達標或不足固定 BET 的開手門檻。
- README、現行規則、呈現文件、工作規範與本輪驗證改為當前說明，移除堆疊的舊版本資訊。

## 數學與自動測試

完整 node --test --test-concurrency=4 tests/*.test.mjs：**439／439 通過**，失敗／取消／跳過皆 0。涵蓋真實結算、退款剪裁、三桶雙池及 CD、特殊資格、布局、預建分支、原子失敗、profile、無限資產研究與共用 Worker。記錄：output/tests-local51.log。

唯讀核對 Hands Up 的 firstHandOutcomeScore、drawPaidOperationOutcome：**39／39 組純函式對照通過**，涵蓋 RTP 0／.99／1、前節點贏／輸、CD 0／2、池預算 0／.1／2。原來源 SHA256：d24d15e8a532c04febf512b09379d51606a4737149b665b3b73035e5328fc8de。原目錄未修改、未執行遊戲或測試。證據：output/hands-up-alignment-local51.json。

[門檻校準](../output/entry-budget-local51.json)：主 seed 2026100546，四組獨立 cohort 各 250 副，balanced、每副資產 10,000、零初始池。**1,000 棵樹／1,312,000 節點／750,000 終端**；平均原始投入 **4.5021886189627605 BET**，95% CI **[4.412775222367272,4.591602015558248]**，向上取整維持 **5 BET**。最大質量誤差 3.11e-15，帳務與池對帳誤差皆 0；12 個計算來源雜湊在運算期間及收尾核對一致。此為冷啟動平均投入校準，不是長期 RTP 或跨手池穩態認證。

## 實際瀏覽器驗證

- 機率工具 **21 項通過**：五區設定、無第二係數及獨立樹入口、退幣位置、四策略一般及退幣一起完成、每玩家連續四手水池序號、全額派彩／零費用、池對帳、固定零種子、分頁、設定複製／保存／舊設定遷移、退幣驗證、空白種子，以及 1440／375／320px 無水平溢出。
- 遊戲 **10 項通過**：375px 連續正常操作兩手、結算後 NEXT HAND、個人池序號延續、全額派彩說明、結算明細與無水平溢出。此輪使用減少動態偏好，未重做正常動畫效能驗收。
- 規則頁 **8 項通過**：十二節現行規則、逐手建樹說明、全額派彩與 RTP 公式、移除舊扣費／獨立樹說明，1440／375／320px 無水平溢出。修正 320px 長數字換行及缺失 favicon。
- 三份驗證均為瀏覽器 console／page error 0；證據及截圖在 output/playwright/lab-local51/。以上為桌面 Chrome viewport，非實體手機驗收。

## 入口與狀態

- [本地機率工具](http://127.0.0.1:4177/probability.html?v=51)
- [本地遊戲](http://127.0.0.1:4177/index.html?v=51)
- [本地規則與公式](http://127.0.0.1:4177/docs/04-game-flow-and-math.html?v=51)
- [公開遊戲 v51](https://seven1888.github.io/magic-poker-lite/?v=51)
- [公開機率工具 v51](https://seven1888.github.io/magic-poker-lite/probability.html?v=51)
- [公開規則與公式 v51](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html?v=51)
- [GitHub](https://github.com/Seven1888/magic-poker-lite)／[Actions](https://github.com/Seven1888/magic-poker-lite/actions)

本輪推送前已記錄的公開基準為 v49：提交 7caabf98f45cb089fce880218fd0fc7a6b8b1a79，Pages Actions run 37408512245 成功。v51 將隨 main 推送經既有 Actions 建置與部署；須確認本輪 Actions 成功及公開內容後，才能視為發布完成。上列 v51 入口於本輪部署成功後提供更新內容。
