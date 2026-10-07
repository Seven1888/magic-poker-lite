# Magic Poker Lite v53 接手紀錄

更新：2026-10-07。**方案 B 已完成、推送 Git 並部署 Pages；519項測試通過，公開站已驗證。**

## 目標與授權

使用者先回報 Android 入口 BET 偏左，之後確認全面調整德州流程、下注、對手策略和實際買入；要求全部完成後一併上 Git、提供全部對外連結，再開新聊天室。提交、推送及新聊天室均已授權，完成必要驗證後執行，不再詢問相同授權。

只處理 `C:/Users/User/Desktop/新Magic Poker/Magic Poker Lite`。同層 Boss Duel、Hands Up、Final Table 永久唯讀。沿用 checkout，不重設使用者／同伴修改。遊戲英文，工具與文件繁體中文。

## 最終規格

以 [v53 規格](docs/16-v53-holdem-spec.md)、[規則](docs/04-game-flow-and-math.md)、[API](API-CONTRACT.md) 為準。已選 `pooled-holdem`，不再等待結果模型選擇。

- 保留原 .99 計分、個人雙池、CD 及 JP。開手固定玩家牌／公牌序、預建 NPC win／nonWin 配對；實付時抽原公式結果並讀既存配對。nonWin 可和局。精簡控制器保存所選路徑，不展開完整 NL 樹。
- 五個公共牌虛線空框，依3/1/1發出。首次50/50盲位，其後HU輪替。CHECK/CALL、BET/RAISE 真實標籤；反覆合法再加注；半池／全池／ALL IN 選單連接進攻按鈕。
- SB為選單數值，BB=2SB，買入100SB。SB10買入1000、BB20，皇家JP4000。BALANCE先扣款、錢飛至CHIPS後下盲。桌碼跨手累積、同桌不可補碼，NPC每手匹配玩家起始碼，離桌剩碼只返一次。
- 只留caller不激進、maniac激進，正式遊戲交替、跨離桌和重整續接；研究固定型可保留。舊sniper/trapper遷caller。
- 每街在任何行動前鎖強弱；同街換NPC牌、玩家下注或再加注不重判。新街用當時配對重算。強條件、詐唬證據與概率詳見規格表。每NPC回合先抽行為，進攻再抽50/35/15尺寸。
- 三個公開機率情境不含NPC牌／原因；公共參考勝率不讀秘密資訊。
- 池桶依BB範圍0<BB≤10、10<BB≤500、BB>500，原存量不動；JP200/50/20BB僅有足額資格且獲勝攤牌才派。
- version2 profile保存錢包、池、上一型及active table；牌局、布局、結果、鎖街與RNG一起保存。設定匯入不改資產，重整不回退。
- 一般研究外部資產無限，但有限100SB桌碼；歸零才模擬新入場。退幣以錢包加桌碼計總資產，不把池當資產，不發布部分退幣比例。

## 主要檔案

| 檔案 | 責任 |
| --- | --- |
| src/engine.mjs | HU引擎、原子開手／動作、結算、雙段NPC抽樣 |
| src/engine.mjs 的 beginNewTable | 一般／退幣共用重入；同RNG新抽首盲、保留累計／池／CD／上一型 |
| src/holdem-betting.mjs | 3尺寸、最小加注、短全下、唯一動作ID |
| src/pooled-holdem.mjs | 開手布局與所選路徑結果控制 |
| src/outcome-pools.mjs | .99公式、三桶雙池、CD、JP、對帳 |
| src/boss-profiles.mjs | 兩型輪替、強弱判定、街道鎖、公開三情境 |
| src/table-wallet.mjs / outcome-profile.mjs | 買入／兌回、active hand snapshot、錢包與池持久化 |
| src/game.mjs / styles/holdem-v53.css | 入口、連接尺寸選單、對手資訊、保存與動畫 |
| src/simulation-study.mjs / refund-study.mjs | 有限桌碼／外部錢包研究，正式模型共用 |
| docs/16-v53-holdem-spec.md | 本次完整需求與正式規格 |

## 驗證與交付狀態

正式pooled-holdem的`npm test`已519／519通過，`npm run build`成功218檔，diff空白檢查通過。Chrome320／375／393／412／1440px、買入／離桌／重整、五空框、CHECK／BET／再加注及皇家JP實派都已驗證；工具4策略共160手、16位151手退幣流程與JSON匯出完成。詳見 [驗證紀錄](docs/06-mobile-and-deployment.md)。

研究重入使用 `beginNewTable(session,{buyIn})`，首桌不額外呼叫；後續已結算、歸零且外部錢包允許時重入。新桌首盲從同RNG抽一次，其後依桌內手序交替；總手數及累計資料不重設。函式不自行扣外部錢包，不允許未完手或新桌未開手時重複重入。

先前fixed-holdem候選483項結果只屬歷史。本輪功能提交為 [c5d5aca](https://github.com/Seven1888/magic-poker-lite/commit/c5d5aca9f5d67d3e95b07ef4b371b7bd3e1bb457)，[Actions 37556303917](https://github.com/Seven1888/magic-poker-lite/actions/runs/37556303917)測試／建置／部署成功。公開站入場驗證模式、買入、JP表頭及五空框，page／console錯誤0、HTTP失敗0。後續文件提交僅補發布紀錄，核心程式不再改動。

## 連結

- [GitHub](https://github.com/Seven1888/magic-poker-lite)／[Actions](https://github.com/Seven1888/magic-poker-lite/actions)
- [公開遊戲](https://seven1888.github.io/magic-poker-lite/)／[機率工具](https://seven1888.github.io/magic-poker-lite/probability.html)／[規則](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html)
- [本地遊戲v53](http://127.0.0.1:4177/index.html?v=53)／[本地機率工具v53](http://127.0.0.1:4177/probability.html?v=53)
- v53公開入口均可加`?v=53`；上一版v52基準為`82a2cc5`，僅供歷史比較。

本輪實作及發布已完成。新聊天室先讀本紀錄，沒有待重做的實作或再次发布工作；等待使用者後續需求。
