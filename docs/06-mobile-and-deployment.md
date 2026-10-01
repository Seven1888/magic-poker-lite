# v17 手機相容與公開 Demo

更新：2026-10-01。只修改 Magic Poker Lite，原 Boss Duel、Hands Up、Final Table 永久唯讀。

## v18 演出與介面更新

- 整體播放改為 1.2 倍速，即原時間除以 1.2：涵蓋 CSS 動畫／轉場、抽選、發牌、翻牌、NPC 決策、入池、退款、派彩、閱讀停頓與音效節拍。音高保持原值；reduced motion 及動畫 watchdog 保留。
- 速度集中於 src/presentation-timing.mjs。既有時間參數保留 1× 定義，僅在排程時換算一次；已經開始的動畫剩餘時間是實際時鐘，不再重複縮短。
- 開局抽選只顯示 FIRST／SECOND，籌碼標為 1ST／2ND，沿用原本一次 50/50 抽選。它對應首手翻牌前先後順序；既有開局投入、逐手輪替及翻牌後順序不變。
- POT 五堆示意籌碼集中在金額後方，邊緣稍露出；金額在最上層。決策預覽左側 CHECK／CALL 採紅色、BET／RAISE 採紫色的主操作按鈕造型，維持唯讀，不觸發下注；右側機率寬度仍是真實比例。
- 本輪自動測試 107／107 通過，包含 1.2 倍時序、音高不變、單次扣款與資金守恆。瀏覽器證據另存 output/playwright/speed-v18；不改遊戲引擎、RNG 或派彩。

Chromium／WebKit 手機模擬均完成四街、攤牌、結算與下一手；快速兩次 CALL 20 只扣一次 20，點選決策預覽不改資產或牌局。兩個天然抽選分別驗證 FIRST／1ST 與 SECOND／2ND。實際排程量測為發牌 233.333ms、翻牌 108.333／141.667ms、入池 833.333ms、派彩 916.667ms，均為原時間除以 1.2；CSS 及主流程等待一致，瀏覽器錯誤紀錄為空。這仍是桌面引擎的手機模擬，非實體手機驗收。

## 公開入口與部署

- Demo：https://seven1888.github.io/magic-poker-lite/
- 機率工具：https://seven1888.github.io/magic-poker-lite/probability.html
- 原始碼：https://github.com/Seven1888/magic-poker-lite

GitHub Pages 使用 HTTPS、GitHub Actions workflow 部署。更新 main 後先跑 npm test，再執行 npm run build，將 dist 上傳並發布；測試失敗不部署。程式與素材使用相對路徑，支援 magic-poker-lite 子目錄。無需 npm install，Node.js 20+ 可本機啟動；CI 使用 Node.js 24。

scripts/build-static.mjs 只複製遊戲／工具入口、ES modules、載入中的樣式、實際引用素材、52 張牌及牌背、10 個牌型底圖、公開規則文件與工具使用的歷史基準 JSON。Git、憑證、測試程式、本機截圖與其餘 output 不進入網站；公開規則 HTML 對未收錄的歷史／開發檔改為文字，避免點擊後 404。

首次嘗試的 Sites 來源服務無法連線；該註冊沒有發布內容。其 .openai/hosting.json 僅留本機且不提交，本專案目前以 GitHub Pages 為準。

## 手機修正

- 以 visualViewport 可視高度與 safe-area-inset 計算舞台外留白；網址列伸縮、旋轉及鍵盤改變視窗時會更新。保留 pinch zoom，不用重新縮小舞台抵消使用者放大。
- 保留 400×860 舞台與正常直屏比例。短屏／橫屏最低縮放 0.75，再垂直捲動；小於 300px 寬以寬度優先，避免橫向溢出。主要下注按鈕至少約 45px 高。
- 彈窗依當前可視區限制高度，可觸控捲動；教學切頁、BET 加減、預設與關閉鍵擴大為 44px 目標。320px 寬的 BET 預設排成兩列。
- 入口焦點改到關閉鍵，避免短屏一開啟就捲到最下方。短屏 PLAY／關閉鍵維持可觸達；BET 等內容仍可在彈窗內捲動。
- iOS 文字輸入維持至少 16px；機率工具保留安全區。遊戲不禁止使用者縮放。
- 音效只在有效手勢啟用；切背景／pagehide 停止聲音，回來後下次手勢可重試。靜音設定保留，Web Audio 不可用時遊戲仍可運行。
- NPC 決策掃動及結果字卡沿用動畫 watchdog；動畫 API 缺少或 finished 沒結束時不會永久鎖住操作。
- 禁用瀏覽器儲存時遊戲與機率工具仍能使用預設設定。原有 busy gate 防止連點重複建立 session 或重複扣款。

## 驗證範圍

v17 當輪自動測試 105 項全部通過：新增 6 項 viewport／safe-area／縮放／清理測試及 3 項音效恢復／動畫 watchdog 邊界測試。既有規則、JP、RNG 隔離、資金守恆與單次派彩測試一併通過。

Chromium／WebKit 已驗證 320×568、375×667、390×844、412×915 與 844×390 的入口及桌面，沒有水平溢出；短屏 PLAY、關閉鍵與捲動後的 BET 預設均能觸控操作。兩引擎均完成四街、攤牌、結算與下一手；快速連點 CALL 20 只扣一次 20。另通過模擬安全區 47／34px、Chromium 減少動態效果完整牌局、部署子目錄的資源載入與禁用儲存流程；機率工具 Worker 1,000 手功能檢查資金守恆誤差為 0。

瀏覽器證據保存在開發者本機 output/playwright/mobile-public-v17，截圖與瀏覽器程式不提交 Git。以 Chromium 與 WebKit 的手機視窗／觸控模擬驗證；這不是 Android 或 iPhone 實體裝置驗收，也不保證所有廠牌內嵌瀏覽器、舊版系統或手機硬體行為完全一致。

本輪不改發牌、下注、對手機率、JP 或帳務，沒有新增 RTP 校準。遊戲仍是虛擬籌碼 Demo；重新載入初始化當頁資產，沒有伺服器持久錢包。
