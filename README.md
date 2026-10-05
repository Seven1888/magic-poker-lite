# Magic Poker Lite

手機直版、第一人稱的 1v1 簡化德州原型：兩張底牌、五張公共牌、四街下注、真實對手行動機率。遊戲英文，機率工作台與文件繁體中文；預設資產 **10,000**。

- [遊戲 Demo v45](https://seven1888.github.io/magic-poker-lite/?v=45)
- [繁中機率工作台](https://seven1888.github.io/magic-poker-lite/probability.html?v=45)
- [完整規則、公式與帳務案例](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html?v=45)
- [四 BOSS 固定表與牌型模型](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html?v=45#section-4)
- [v45 交接](docs/15-v45-handoff.md)／[驗證與部署](docs/06-mobile-and-deployment.md)

v45 將正收益 TOTAL／WIN 與贏分改為明亮金色立體美術字，直接浮在桌面，沒有底板、框線或裝飾線。雙方扣籌碼不再冒負數，行為文字不重複下注金額；可操作按鈕仍顯示本次實付。中央 BOSS 抽選時收起背後行動資訊，低於 10% 的小區段隱藏放不下的名稱與百分比，保留正確顏色與真實比例。NEXT HAND 每手重新以 50/50 抽出實際 SB／BB，並播放抽盲；BOSS 仍排除上一型。驗證及發布以 docs/06 與完成訊息為準，版本網址本身不代表已發布。

## 玩法與呈現

每手小盲自動投入半 BET、大盲一 BET；小盲翻牌前先動，後三街大盲先動。遊戲與連續／達標研究每手隨機抽盲，允許連續相同盲位。獨立研究與完整樹保留受控交替位置。每街最多一次加注；畫面固定 FOLD／CALL／RAISE，底層仍區分 check／call／bet／raise。付費按鈕列本次新增支付，免費 CALL 與 FOLD 不列金額；行動橫條與角色浮字只列動作。

入口預選 BET 1；入口與局間＋／−依序選 **1、2、5、10、20、50、100、200、500、800、1,000、1,200、1,500、1,800、2,000**。結算演出完成後可開 BET 小窗，CONFIRM BET 只保存設定，關閉取消草稿；NEXT HAND 才正式抽下一手盲位、選 BOSS、扣盲與發牌。改 BET 須雙方資產達新門檻（預設 20 BB），原 BET 不變仍可短籌碼續手。兩盲及四街注額同比縮放，不重建 session 或重設損益基準，已結算 JP 保持原值。

入場即呈現首手 BOSS，入口保存 seed，選 BET 或重開同一入口不換角色。局間 BET 草稿改成新值時，以 session.rng.clone() 先略過下一手抽盲的一次 RNG，再按 lastBossProfileId 預覽同一下一型；不消耗正式 RNG、不發牌或扣盲，fixed 維持同型。預覽暫藏舊 BOSS 手牌與牌型，取消或改回原 BET 還原；確認後保持至 NEXT HAND 正式選到同型。

每手抽盲明示 BLIND POSITION、SB／BB 及 YOU／BOSS 真實 STARTING BET。玩家籌碼先抵達 POT，再讓同手同街有效 BOSS 回應機率飛至中央抽選。混合回應按鈕預覽只列原始 FOLD／RAISE，單一回應亦顯示 CALL／RAISE／FOLD 100%；中央列全部正機率。免費或跨街行為不借舊預覽。

玩家最佳五張採金框，已揭 BOSS 最佳五張採藍框，共用牌金內藍外，完整揭牌後才調暗未入選牌。TOTAL WIN 取底池返還＋JP、排除退款，不等於淨利；跑分、金幣與籌碼演出不重複入帳，來源籌碼保留至抵達。

v44 原創牌桌電子爵士 BGM 為 96 BPM，BOSS 實際揭牌時切換 128 BPM 配樂，完整揭牌後才依結果收尾；紙牌音效、Music／Sound effects 獨立開關與桌面靜音保留。公開勝率跨 50% 顯示超車提示，全下依已揭 0／3／4／5 張公牌計算。暖機後配樂採單音源循環，卡牌 DOM／同值勝率環／同分布牌型列保持；不冒稱所有實體手機零卡頓。

## 標準德州參考機率

v43 玩家勝率與 BOSS 目前可能牌型只用已知玩家底牌及已揭公牌，其餘牌等機率；不因重抽設定、盲位、BOSS 身份、行動或秘密指定底牌改變。這是標準德州參考，未修正遊戲實際重抽或下注傾向。

玩家 equity 為（贏＋平手÷2）／總組合或樣本數。FLOP／TURN／RIVER 精確枚舉，翻牌前固定 100,000 次抽樣估算。BOSS 目前牌型不補未來公牌：選機率最高三類，再按牌力由強至弱排列，無 OTHER、不重新湊成 100%，詳情列完整九類，皇家併同花順。FLOP 三張完全公開後才顯示，換街重算先清舊值；攤牌、棄牌與換手隱藏，演出中禁開詳情。

## 機率工作台

- 單副牌完整展開雙方所有合法動作，包含零機率分支；預設可有 **1,312 節點、750 終端**，列狀態、實付、到達機率與結算。
- 抽樣牌序，每副完整積分動作樹後再平均；不是枚舉全部 52 張牌排列，不能用贏的葉子數除以總葉子數。
- 三種玩家統計：每手重設資產、連續遊玩、資產達標。後兩者保留玩家餘額、每手重抽盲位，BOSS 局間刷新另列；達安全上限列截尾。
- 四種策略、玩家／動作／街道／盲位／JP／資產／切片報表，Worker 執行與停止、設定保存及 JSON／CSV 匯出。
- 比率 CI：四型輪替／連續／達標按玩家聚類，固定對手獨立牌局按手，樹統計按副牌；結果保留參數、種子、模式與樣本單位。
- 起手重抽：未成對時玩家 50%／BOSS 25%，最多 50 次，成對即停、接受最後候選。舊 targetScore 設定保留 legacy-score 模式。

四型 BOSS 使用固定逐街／牌力機率表；config.npc 供模擬玩家策略及 legacy BOSS 使用。初遇各 25%，下一手排除上一型、其餘各 1/3；工具可選輪替、固定或舊模型。

## JP 與驗證範圍

JP：皇家同花順 **200×BET**、同花順 **50×BET**、四條 **20×BET**。正常攤牌只領最高一獎，可用零／一／兩張底牌，不必贏池；棄牌無 JP，BOSS 不領。JP、底池返還、退款與局間 BOSS 刷新分帳。

**0.96 是匹配底池返還係數，不是玩家勝率或含 JP 總 RTP 保證。** 勝負依真實牌組決定，未採用 Hands Up 先定輸贏／配牌流程，也未導入 99% RTP 或固定高勝率。

v45 每手隨機盲位使正式引擎 RNG 排程改變；發牌／重抽規則、BOSS 表、JP 與帳務公式保持。[v35 驗證](output/math-v35-validation.json) 是當時四型固定＋輪替各 5,000 手及 1,000 副完整樹的小樣本結構／帳務資料，**不是 v45 校準**，不能保證舊 seed 後手牌序相同。舊 260,000 手不含 JP，更不能作本版證據。

[v43 參考機率驗證](output/math-v43-holdem-validation.json) 保留為純算法既有證據；v45 未改等權算法，但歷史報告的引擎來源雜湊不代表目前版本，不能宣稱整份報告所有來源仍吻合。本輪不新增大型 RTP 試跑；功能、介面與部署驗證見 docs/06 v45。

## 本機啟動與驗證

Node.js 20+，不需 npm install。在此目錄執行 npm start、npm test、npm run build，或雙擊「啟動遊戲.cmd」。伺服器只綁定 127.0.0.1、預設埠 4177；遊戲為 http://127.0.0.1:4177/，工具為 /probability.html。ES modules／Worker 須經伺服器開啟。GitHub Actions 對 main 先測試、再建置 dist 並部署 Pages；本地通過不等於已發布。

原型未接帳號、支付或後端持久錢包。正常離桌再入桌保留當頁餘額，重載或明示 Reset demo chips 才重設。Boss Duel、Hands Up、Final Table 永久唯讀，本作不依賴舊目錄。

- [流程與完整數學](docs/04-game-flow-and-math.md)
- [API schema 與 Worker](API-CONTRACT.md)
- [素材來源](assets/README.md)／[配樂來源與 SHA256](assets/audio/README.md)
- [視覺演出契約](docs/05-art-and-pot.md)
- [驗證與部署](docs/06-mobile-and-deployment.md)
- [最新交接](docs/15-v45-handoff.md)
- [工作規範](AGENTS.md)／[專案技能](.agents/skills/magic-poker-bridge-design/SKILL.md)
