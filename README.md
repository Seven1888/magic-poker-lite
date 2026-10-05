# Magic Poker Lite

手機直版、第一人稱的 1v1 德州風格遊戲原型。遊戲英文，機率工作台、規格與溝通使用繁體中文；原 Boss Duel、Hands Up、Final Table 永久唯讀。

**v46 本機整合驗證完成，正式部署仍待 Pages 流程與公開站核對。** 本輪採用 Hands Up 的完整預建結果樹與個人雙水池，保留雙方下注形成的 POT 派彩；BOSS 改為每街固定性格機率。完整測試 420／420 通過，1,000 樹門檻校準與 102 手跨手池驗證完成；範圍與證據見 [驗證與部署](docs/06-mobile-and-deployment.md)，版本網址本身不代表部署完成。

## 現行模型

每手仍是兩張玩家底牌、兩張 BOSS 暗牌、五張公共牌與四街下注。開局先完成所有合法分支的 win／nonWin 目標，再建立符合目標的牌面。玩家底牌及完整公牌序固定，各節點保存對應的 BOSS 暗牌與完整狀態；操作時讀取已存分支，不臨時重抽目標或找牌。布局無解時保留全部目標重建未公開牌；超限原子失敗，不提交扣款、手數或正式 RNG。

所有玩家付費 CALL／RAISE（引擎含 bet）在前節點 nonWin 時都有機會轉 win；免費 CALL 與 BOSS 非棄牌動作繼承前目標。win 後的非棄牌動作維持 win；玩家 FOLD 仍輸，BOSS FOLD 仍是玩家贏。nonWin 可以是輸或平手，最終依儲存牌面實際比牌結算。

這是依結果目標建牌的遊戲模型，不是均勻隨機發牌的標準德州。畫面上的標準德州參考勝率只使用已公開牌，不能當作此模型的實際條件勝率。

## 雙水池與 JP

Hands Up 現行參數適配如下：

- 轉贏計分係數為 0.99，與 POT 返還係數 0.96 分開；兩者都不是含 JP 的整體 RTP 保證。
- 贏節點的玩家有效付費分數，80% 進個人付費池、20% 進個人特殊池。原始盲注不入池；未跟注退款不賺取水池。
- 付費池可在前節點 nonWin、全局 CD 為 0 時補轉贏機率，最多補到 100%。CD 預設 0～0，可設定範圍；只在 nonWin 後實際付費時依規則更新。
- 三個 BET 桶為 1／2／5／10、20／50／100／200／500、800／1,000／1,200／1,500／1,800／2,000。兩種池依桶保存，CD 跨桶共用。
- root 為 win 且特殊池足額時，先選最高可負擔的皇家同花順 200×BET、同花順 50×BET、四條 20×BET，再抽 20% 出現資格。
- 有資格才建立對應特殊牌；玩家底牌必須參與特殊牌，公共牌不能自行形成特殊牌。正常攤牌、玩家贏且牌型符合資格才扣特殊池並派 JP；棄牌不扣、不派，資金保留但已抽資格不延到下一手。
- 無資格的一般布局排除玩家特殊牌，沒有另一套自然 JP 額外派彩。歷史 legacy-deck 模式保留舊自然 JP 規則。

每筆贏節點付費先記錄玩家累計投入區間，結算後以最終 matchedWager 剪裁，只有實際匹配部分分池。完整公式、實例及原作適配界線見 [規則與數學](docs/04-game-flow-and-math.md)。

## 每手資產門檻與保存

使用者已批准以「平均一手原始實扣投入 ÷ BET，向上取整」作為每手資產門檻。新模型 1,000 棵完整樹的平均為 **4.46954846265677 BET**，95% CI 為 [4.380062691021308, 4.559034234292232]，因此採 **5×BET**；預設 `minBuyIn=50`、`bigBlind=10` 維持不變。平均門檻不保證每條加注路徑都付得起。

[校準報告](output/entry-budget-v46.json) 使用主 seed 2026100546、四組獨立 seed cohort 各 250 副、balanced 策略、每副資產 10,000 與零初始池；共 1,312,000 節點、750,000 終端，最大機率質量誤差 3.11×10⁻¹⁵，帳務及池對帳誤差均為 0，計算來源雜湊全程一致。這是冷啟動單手平均，不是跨手水池穩態或長期 RTP 校準。

首次 FIGHT、相同 BET 的 NEXT HAND、改 BET 都檢查雙方實際資產。不足時 NEXT HAND 開啟 BET 視窗，玩家手動降低 BET 或離桌；不自動降 BET、不補資。連最低級距都不足時不能開新手。局中餘額降到門檻以下仍可正常全下完成。

個人資料鍵為 `magic-poker-lite.player.v1`，同一筆資料保存已結算餘額、兩種三桶水池、全局 CD 與跨桌手數序號。換桌、換 BET、正常重整保留。未完成牌局時重整，恢復前一筆已結算的整手快照；這是本機原型的交易邊界，不是後端續局。Reset demo chips 只重設測試資產，保留水池。設定另存 `magic-poker-lite.config.v2`，設定遷移不覆蓋玩家個人池。

## BOSS、呈現與研究工具

BOSS 版本為 `four-boss-fixed-street-v2`：每位 BOSS 每街一組固定 FOLD／CALL／RAISE 原始權重，取自舊版該街各牌力列等權平均，不再讀私牌牌力。剔除非法動作後正規化，所以免費 CALL、加注額度用盡等狀態仍會改變實際可用分布。首手四型各 25%，後手排除上一型，其餘各 1/3。[完整固定表](docs/04-game-flow-and-math.html#section-4)

FIGHT 與 NEXT HAND 每手抽真實 50/50 SB／BB；盲注為 0.5／1 BET，翻牌前小盲先動、後三街大盲先動。固定 BET 級距與局間預覽保持。BOSS WINS 與 TOTAL WIN 採金色無框美術字，BOSS WINS 不顯示金額；座位 SB／BB 下方不再附 YOU，STARTING BET 的雙方標籤保留。配樂、公開揭牌、籌碼時序與無障礙提示維持。

機率工具與遊戲共用引擎。單手樹積分的是已預建分支；多樹樣本每副從設定的初始水池冷啟動，不能代表跨手水池穩態。玩家 independent／continuous／cashout 研究都在同一玩家內保存水池；independent 僅重設資产。新水池模式的 CI 按玩家聚類，完整樹研究按副樹，少量樣本與罕見 JP 必須明示不確定性。

0.99 是轉贏計分係數，0.96 是匹配 POT 返還係數；整體 RTP 必須用玩家實際有效投入與返還另行估算。v35 遊戲報告、v43 參考算法報告及早期 v46 fixed-deck 門檻報告只屬歷史，不能當作新結果樹／雙池模型的校準或發布證據。

## 本機啟動與文件

Node.js 20+，無須 npm install。在本目錄執行 `npm start`、`npm test`、`npm run build`；伺服器只綁定 127.0.0.1，預設埠 4177。瀏覽器經伺服器開啟遊戲及 `probability.html`，以支援 ES modules／Worker。原型使用本機瀏覽器保存，未接帳號、支付或後端錢包。

- [規則與數學](docs/04-game-flow-and-math.html)／[Markdown](docs/04-game-flow-and-math.md)
- [API 契約](API-CONTRACT.md)／[v46 整合狀態](docs/16-v46-work-in-progress.md)
- [驗證與部署](docs/06-mobile-and-deployment.md)／[工作規範](AGENTS.md)
- [素材](assets/README.md)／[原創配樂與 SHA256](assets/audio/README.md)
- [上一正式遊戲 v45](https://seven1888.github.io/magic-poker-lite/?v=45)／[上一正式機率工具 v45](https://seven1888.github.io/magic-poker-lite/probability.html?v=45)
- v46 候選公開入口：[遊戲](https://seven1888.github.io/magic-poker-lite/?v=46)／[機率工作台](https://seven1888.github.io/magic-poker-lite/probability.html?v=46)／[規則](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html?v=46)
- v46 候選公開報告：[平均門檻](https://seven1888.github.io/magic-poker-lite/output/entry-budget-v46.json)／[跨手池驗證](https://seven1888.github.io/magic-poker-lite/output/math-v46-pooled-validation.json)；部署以 [Actions](https://github.com/Seven1888/magic-poker-lite/actions) 成功及公開資源核對為準。
- [GitHub](https://github.com/Seven1888/magic-poker-lite)／[v45 歷史交接](docs/15-v45-handoff.md)

本機整合、必要驗證與門檻重算已完成；接著依使用者授權一次提交／推送、核對 Pages 和正式站，再交接精確提交、部署 run 與所有連結。本文不預宣部署成功。
