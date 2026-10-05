# Magic Poker v41 新聊天室交接

工作目錄 `C:/Users/User/Desktop/新Magic Poker/Magic Poker Lite`，GitHub `Seven1888/magic-poker-lite`，main。原 Boss Duel／Hands Up／Final Table 永久唯讀；遊戲英文，機率工具、文件與溝通繁中。

## 使用者本輪要求與完成內容

1. 使用者指定圖中 YOUR TURN／CHOOSE YOUR MOVE 提示「不是一個框，而是整個長條橫幅，沒有左右的框，視覺不能在牌桌上」。已將 action-flow 改成滿舞台寬、平面 HUD 長條，取消側框、圓角、內框及厚陰影，top 358／高 68 保持，BOSS 決策與籌碼時序不变。
2. 使用者確認並要求實作 **BOSS 目前牌型分布**。底牌左側顯示最高兩類＋OTHER，點開完整九類；皇家併同花順，互斥分類，非聽牌清單／未來成牌率／玩家勝率／行動機率。從 FLOP 已完整公開後呈現，busy 禁點詳情；新街清舊數字，攤牌、棄牌、換手隱藏。
3. 使用者要求全部更新完成後 **一次上 Git，確認上線後開新聊天室，提供全部連結**。此文件為提交前交接；精確 SHA／Pages run／正式站結果由部署後主訊息補入，不以版本 query 冒稱上線。

## 算法與資訊邊界

`src/boss-hand-range.mjs` 對最多 1,225 個未知底牌候選做精確加權枚舉，解析積分有限次弱牌重抽。玩家先發時用排除已知玩家牌的 50 張池；BOSS 先發時還須乘之後玩家已知牌的接受機率。指定玩家牌事先保留；指定 BOSS 牌只傳 `manualProvided` 布林並顯示不可估算，不傳其牌值。

公開 BOSS 角色、行動與已顯示機率是證據；標籤按玩家可見文字精度與可見項目集合篩相容候選，真正公開動作 likelihood 每 id 只乘一次。分子為該最佳牌型的候選權重，分母為全部相容候選總權重。玩家動作視為已選干預，不假設玩家隨機策略；公牌只用已揭前綴。某些局面可能由公開行動表推到某牌型 100%，不是讀暗牌。

`boss-range-public.mjs` 僅投影已知玩家牌、公開盲位、角色、重抽／legacy 參數及公開事件。Worker 不收 hand/session、BOSS 暗牌、牌庫、未揭公牌、seed、roll、dealAudit 或未顯示原始精確率。`boss-range-controller.mjs` 用 epoch/request 阻擋舊手／舊街晚回覆；計算在独立 Worker，不消耗正式 RNG。新模組、UI、文件與既有 engine/poker/BOSS tables/帳務分離，原 v40 抽盲／BET角色預覽保持。

## 驗證

- 自動測試 **300／300**；新數學 15、公開投影／時序 4、呈現 5，正式 build **191 檔**。
- 獨立 oracle：40 直接枚舉＋2 有限次邊界＋130 legacy 邊界＋2 反向條件＋2 指定玩家，最大差 **1.59e-14**。24 自然手／172 動作與未接 range 基準的 RNG、牌面、帳務一致，272 次真實牌型後驗皆正。保存來源 SHA256，非 RTP／發牌頻率校準。
- 本機四型×320／390 共8組完整牌局、430／844排版，九類詳情、不扣款、換街清空、NEXT HAND、公開payload稽核通過。自然 seed18 正常動畫兩對59.9／三條36.6／其他3.5；seed57兩對95.9／葫蘆4.1，320無溢出。
- 正常速度 1,616 個25ms取樣無側框／厚陰影復現、busy開窗或異常range；BET草稿／確認換手無舊分布，FLOP棄牌保持BOSS牌背。0頁面／HTTP錯誤，截圖已檢視。桌面 Chromium viewport，非實體手機。
- 本機證據 `output/playwright/{range-v41-local,range-v41-edges-local}.{json,txt}`、`tests-v41.txt`、`build-v41.txt`、`v41-local-*.png`。公開同名 public 檔由部署後追加，無須為發布SHA再提交一次。

## 全部連結

- [遊戲 v41](https://seven1888.github.io/magic-poker-lite/?v=41)
- [中文機率工具](https://seven1888.github.io/magic-poker-lite/probability.html?v=41)
- [完整數學與機率文件](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html?v=41)
- [四 BOSS 固定表與第 4.7 節牌型推估](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html?v=41#section-4)
- [v41 牌型算法與引擎隔離驗證 JSON](https://seven1888.github.io/magic-poker-lite/output/math-v41-range-validation.json)
- [沿用 v35 遊戲模型數學 JSON](https://seven1888.github.io/magic-poker-lite/output/math-v35-validation.json)
- [API](https://seven1888.github.io/magic-poker-lite/API-CONTRACT.md?v=41)
- [GitHub](https://github.com/Seven1888/magic-poker-lite)
- [Pages 發布列表](https://github.com/Seven1888/magic-poker-lite/actions)
- [v41 交接文件](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/12-v41-handoff.md)

提交及成功 Pages run 的精確連結由部署後主交接訊息補入。

## 新聊天室接續

先讀 `AGENTS.md`、本文件及 docs/06 v41，簡短確認已接手，列出全部連結（含主交接提供的 commit／Pages run），等使用者下一步反饋。兩項本輪功能均已做，不應又當成僅討論或待實作；勿自行推送、重開新聊天室或扩增其他玩法。後續更改依使用者最新要求；遊戲模型及公開資訊範圍若變動，明確記錄並驗證。
