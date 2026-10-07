# v59 非數學修正：驗證與發布紀錄

更新：2026-10-07。**v59 四項非數學修正已推送 main、部署成功並通過公開驗收。** 使用者要求完成後另開聊天室提供相關連結並繼續討論數學。正式公式、池規則及 BOSS 機率表未改。詳細計算、研究設定及證據見 [v59審核](22-v59-feedback-and-rtp-audit.md)；介面發布不代表數學正確。

## v59 Git 與公開驗收

- 功能提交 [7548746743177e559e307ff143bea73b143be81a](https://github.com/Seven1888/magic-poker-lite/commit/7548746743177e559e307ff143bea73b143be81a) 已推送main；[Actions 37630704259](https://github.com/Seven1888/magic-poker-lite/actions/runs/37630704259) 的build／deploy均completed／success。
- 33個公開核心檔HTTP200且與dist的正規化文字／二進位hash一致，包含12個雙聲線WAV、比例CSS、遊戲、引擎及本輪文件。紀錄：本機 `output/public-v59-files.json`。
- 公開Chrome於320×900、375×900、393×852、412×900、1440×1000、320×640驗證比例色塊整高、比例誤差≤0.001、文字無裁切及無水平溢出；BOSS牌型分布移除、玩家勝率保留。主畫面及選單393px截圖已目視核對。
- YOU RAISE及BOSS CALL／CHECK均有對應WAV的BufferSource啟動；字卡顯示中POT從3→9→14。最後成功腳本的errors／warnings／HTTPfailed皆0。部署切換前曾讀到v58；該次已作廢，不納入成功證據。
- 工具與規則於320／393／1440共6組布局正常，errors及HTTPfailed皆0；工具顯示「結果計分係數」。規則保持v58既有模型與標題，數學另待討論。
- 公開腳本、紀錄及截圖位於本機 `output/playwright/public-v59*`。桌面viewport及WebAudio啟動不等於實體Android／喇叭聽感驗證。本次後續純文件提交回填已完成證據，最終文件SHA及成功run由原聊天室交接訊息提供。
- 入口：[遊戲 v59](https://seven1888.github.io/magic-poker-lite/?v=59)／[機率工具](https://seven1888.github.io/magic-poker-lite/probability.html?v=59)／[交接](../HANDOFF.md)。

## v59 本地驗證與數學審核邊界

- 完整 `npm test`：602／602，0失敗／跳過，32,126.0844 ms；`output/tests-v59.log`。後續窄框修正20／20、工具標籤文案9／9專項通過。
- `npm run build`：261個檔案，含12個雙聲線WAV、來源、新比例CSS與數學審核文件。`git diff --check`通過。
- Chrome六種viewport遊戲布局通過，另320／393／1440×四種機率組合共12組文字邊界與比例檢查通過。不同座位的WAV均實際啟動，字卡顯示中POT仍推進；對手牌型分布移除、玩家勝率保留。
- 腳本／紀錄：`output/playwright/qa-v59.js`／`.log`、`qa-v59-proportions.js`／`.log`。最後單次qa-v59 errors／warnings／HTTPfailed為0，初始session有既有圖片預載提示。
- 精確機制反例：無池、SB1／BB2、CALL1、對手跟／過牌且排除平手時，返還期望比例123.9975%。正式四策略各32玩家×64手的有限樣本RTP為194.277%／195.418%／199.535%／183.454%，不是長期RTP；錢包與籌碼對帳誤差0。原始資料在 `output/math-audit-v59-*`。

這些證據確認介面可用及舊數學有缺口，不能宣稱RTP已修正。桌面viewport與WebAudio啟動亦不能替代實體Android／喇叭聽感驗收。

---

# v58 歷史驗證與發布狀態

更新：2026-10-07。v58全部完成：本地驗證、Git推送、Pages部署與公開遊戲驗收通過。 本輪取消JP、2×／4× POT、行動字卡與語音、首次抽盲及隨機BOSS詳見 [v58規格](21-v58-actions-and-no-jackpot-spec.md)。

## v58 本地驗證

- npm test：598／598，0失敗、0跳過，30,707.0524 ms；output/tests-v58.log。本機Node20原npm萬用字元不展開，改scripts/run-tests.mjs跨平台列舉，不改測試內容或省略任何套件。
- npm run build：246個公開檔，含六份英語WAV及來源、新規格。git diff --check通過。
- 引擎專項101／101，output/tests-v58-engine.log；字卡語音11／11。四個由v57真實程式生成的舊存檔fixture覆蓋未完成JP預約、已派JP、全下後FOLD／CALL。按舊契約關桌後錢包依序9,995／12,010／10,010／12,500；同桶併池、來源不變及重關冪等通過。
- Chrome六種viewport：320×900、375×900、393×852、412×900、1440×1000、320×640，RAISE選單正確顯示ALL IN／4× POT／2× POT，沒有水平溢出。POT3時報價99／12／6，正式2×事件實付6。對手牌型參考保留、JP入口移除。
- 真實牌局字卡與本地WebAudio語音已觀察YOU RAISE／CHECK／ALL IN、BOSS CALL／CHECK／FOLD／ALL IN，共11次演出與11次對應語音BufferSource啟動。字卡位於公牌及底牌上方，不被回應抽取層遮擋。BET及其餘兩座位映射另由專項測試覆蓋。
- 首手玩家SB、第二手玩家BB，繼續至第三手只出現一次抽盲揭曉；第二手可隨機再次遇到PASSIVE。連續兩次重整table:null、balance10,116不重複兌回。
- 遊戲腳本與紀錄output/playwright/qa-v58.js、qa-v58.log、qa-v58-continuity.js／log；截圖v58-entry-393.png、v58-main-393.png、v58-menu-393.png、v58-player-raise-393.png、v58-allin-393.png。最後qa-v58單次errors／warnings／HTTPfailed皆0，session初始仍有既有圖片預載提示，不宣稱全session warning0。
- 工具／規則Chrome320／393／1440共18項布局檢查無水平溢出。保留12列BOSS機率；JP／特殊池設定及正式可見報表移除。每尺寸一般2玩家×8手、退幣2玩家／2手完整完成，seed58010；這是功能小樣本，不用其RTP當長期證據。下載JSON確認JP關閉、random、無派獎及total=net，CSV37欄對齊且無JP／special。lab-v58 errors／warnings／HTTPfailed皆0。腳本、紀錄、截圖與下載核對位於output/playwright/lab-v58*。
- 上述為桌面Chrome viewport及WebAudio啟動證據，不是實體Android／喇叭聽感或長期RTP認證。

## v58 Git 與公開發布

- 功能提交 [a7fb9c40a27699317a95cd032ee0b4252bef1c49](https://github.com/Seven1888/magic-poker-lite/commit/a7fb9c40a27699317a95cd032ee0b4252bef1c49) 已推送main；[Actions 37619283020](https://github.com/Seven1888/magic-poker-lite/actions/runs/37619283020) 的build／deploy均completed／success。
- 26個公開核心檔（含六個WAV、v58規格及發布紀錄）HTTP200且正規化換行／二進位hash與dist一致，output/public-v58-files.json。
- 公開Chrome393×852實際入場：JP入口移除、公開牌型參考保留；POT3時ALL IN／4×／2×為99／12／6，正式2×實付6。YOU RAISE、BOSS CALL／CHECK三次字卡與三次對應本地語音BufferSource啟動，首盲揭曉1次，文字不遮公牌／玩家牌。字卡截圖目視通過。
- 公開腳本output/playwright/public-v58.js、public-v58.log；截圖public-v58-entry-393.png、public-v58-main-393.png、public-v58-menu-393.png、public-v58-player-raise-393.png、public-v58-boss-call-393.png。最後單次errors／warnings／HTTPfailed為0，初始載入仍有既有圖片預載提示，不宣稱整個session warning0。
- 公開工具與規則393px另通過6組布局檢查，一般16手／退幣2人2手完成，12列機率、無舊JP設定或正式可見獎表；下載JSON與37欄CSV核對通過。public-lab-v58當次errors／warnings／HTTPfailed皆0，證據output/playwright/public-lab-v58*。
- 後續純文件提交回填以上已完成證據，不修改已測功能；最終文件SHA／成功run由原聊天室交付訊息補充。原聊天室確認最後部署後才交接，新聊天室不需重跑或追蹤。


## v58 入口

- 公開：[遊戲 v58](https://seven1888.github.io/magic-poker-lite/?v=58)／[機率工具](https://seven1888.github.io/magic-poker-lite/probability.html?v=58)／[規則](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html?v=58)。
- 本地：[遊戲 v58](http://127.0.0.1:4177/index.html?v=58)／[機率工具](http://127.0.0.1:4177/probability.html?v=58)／[規則](http://127.0.0.1:4177/docs/04-game-flow-and-math.html?v=58)。4177 若停止，在本專案 npm start 即可，無需安裝。
- Git：[專案](https://github.com/Seven1888/magic-poker-lite)／[Actions](https://github.com/Seven1888/magic-poker-lite/actions)。本輪功能及最後文件提交、成功run以原聊天室最終交付為準，不以v57代替。
- 文件：[HANDOFF](https://github.com/Seven1888/magic-poker-lite/blob/main/HANDOFF.md)／[AGENTS](https://github.com/Seven1888/magic-poker-lite/blob/main/AGENTS.md)／[README](https://github.com/Seven1888/magic-poker-lite/blob/main/README.md)／[v58完整規格](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/21-v58-actions-and-no-jackpot-spec.md)／[v57](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/20-v57-response-readability-spec.md)／[v56](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/19-v56-blind-and-response-spec.md)／[v55](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/18-v55-feedback-spec.md)／[v54](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/17-v54-presentation-spec.md)／[v53](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/16-v53-holdem-spec.md)／[API](https://github.com/Seven1888/magic-poker-lite/blob/main/API-CONTRACT.md)／[驗證與發布](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/06-mobile-and-deployment.md)。
- 資產：[按鈕圖片](https://github.com/Seven1888/magic-poker-lite/tree/main/assets/action-buttons-v54)／[圖片提示詞](https://github.com/Seven1888/magic-poker-lite/blob/main/assets/action-buttons-v54/prompts.txt)／[英文行動語音](https://github.com/Seven1888/magic-poker-lite/tree/main/assets/action-voice-v58)／[語音來源](https://github.com/Seven1888/magic-poker-lite/blob/main/assets/action-voice-v58/voice-source.txt)。

---

# v57 驗證與發布狀態

更新：2026-10-07。**v57 全部完成，本地驗證、Git 推送、Pages 部署與公開驗收通過。** 本輪 [v57 規格](20-v57-response-readability-spec.md) 包含 BOSS 決策色帶按實際機率分配寬度、FOLD 綠／CALL 與 CHECK 紅／RAISE 與 BET 紫、尺寸選單行為名稱與百分比放大，以及小機率的獨立可讀標籤。正式引擎機率、RNG、方案 B 與帳務不變。下方 v56 及更早資料只作歷史，不代替本輪證據。

## v57 本地驗證（2026-10-07）

- `npm test`：572／572 通過，0 失敗、0 跳過，24,159.5061 ms；紀錄 `output/tests-v57.log`。這是本輪重新執行結果，不沿用 v56 數字。
- `action-options`／`action-response`／`response-flight` 專項 28／28 通過。
- `npm run build`：成功，236 個公開檔案，含新增 v57 規格。
- 隔離桌面 Chrome 六組 viewport：320×900、375×900、393×900、412×900、1440×1000、320×640。尺寸選單 54 組 fixture 檢查、主預覽 36 組檢查通過；完整機率與實際色帶寬度的比例誤差 ≤ 0.001，CALL／CHECK 紅色，文字沒有裁切。尺寸選單實際行為名稱字級 ≥ 14 px、數字 ≥ 20 px。
- 主預覽利用 FOLD 按鈕上方空間，左卡為 `BOSS · CALL／CHECK`，右側較寬卡為 `BOSS · RAISE／BET`；名稱 15 CSS px、百分比 20 CSS px。卡片不遮玩家底牌，選單與主預覽的比例、配色和小機率文字通過上述檢查。
- 連續兩次重整後 `profile.table` 均為 null，balance 均為 9,996，沒有重複兌回。工具／規則於 320／393／1440 px 無水平溢出。
- 階段提示保留 `AFTER CALL／CHECK` 的操作關聯，後接 `DEAL FLOP／TURN／RIVER` 或 `SHOWDOWN`，不冠 BOSS；320／393／1440 px × 4 情境共 12 組檢查通過，腳本 `output/playwright/qa-v57-phase.js`。
- 腳本／紀錄：`output/playwright/qa-v57.js`、`output/playwright/qa-v57.log`。截圖包含 `v57-{weak,strong,short}-393.png`、`v57-main-{320,393}.png`，以及適用尺寸的 `v57-live-{320,393,1440}-{900,1000,640}.png`，皆位於 `output/playwright/`。
- 最後一次 `qa-v57` 執行的 errors 0、warnings 0、HTTP failures 0；同一隔離 session 更早曾有 2 筆既有圖片預載未立即使用提示。0 warnings 僅限最後一次執行，不代表整個 session 沒有提示。
- v57 只調整呈現，沒有修改引擎機率或重新評估長期 RTP；桌面 Chrome 手機 viewport 不是實體 Android。

## v57 Git 與公開發布

- 功能提交 [2b5e0fd2da7ccad88d3311ae08507d881b9c88e4](https://github.com/Seven1888/magic-poker-lite/commit/2b5e0fd2da7ccad88d3311ae08507d881b9c88e4)，已成功推送 main。
- [Actions 37610897593](https://github.com/Seven1888/magic-poker-lite/actions/runs/37610897593)：build／deploy 均 completed／success。
- 14 個公開核心檔案 HTTP 200，正規化換行後與已建置 dist 相同；紀錄 `output/public-v57-files.json`。
- 公開桌面 Chrome 393×852 實際入場通過：AGGRESSIVE 不強案例，ALL IN／全池／半池的 FOLD／CALL 依序為 70／30、55／45、45／55，色帶比例精確。CALL 為 `rgb(141, 48, 46)`；名稱實際 17.685 px、百分比 23.58 px。中央抽取的 CALL 漸層實測 `rgb(163, 68, 61)` 至 `rgb(106, 33, 31)`。工具 12 列與 v57 規則正常，無水平溢出。
- 公開腳本／紀錄為 `output/playwright/public-v57.js`、`output/playwright/public-v57.log`；截圖 `output/playwright/public-v57-main-393.png`、`output/playwright/public-v57-menu-393.png`。
- 最後一次 `public-v57` 執行 errors 0、warnings 0、HTTP failed 0；同一 session 最初有 2 筆既有圖片預載提示，因此不宣稱整個 session 的 warning 為 0。
- 後續純文件提交回填以上已完成證據，最終 SHA／run 由原聊天室交付訊息補充；原聊天室確認後才交接，新聊天室毋須重做或追蹤。
- 工作樹在功能提交後乾淨；後續證據文件提交後由原聊天室核對。全部收尾後建立新聊天室，由新聊天室直接提供完整連結，不重做本輪。

## v57 入口

- 公開：[遊戲](https://seven1888.github.io/magic-poker-lite/?v=57)／[工具](https://seven1888.github.io/magic-poker-lite/probability.html?v=57)／[規則](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html?v=57)。
- 本地：[遊戲](http://127.0.0.1:4177/index.html?v=57)／[工具](http://127.0.0.1:4177/probability.html?v=57)／[規則](http://127.0.0.1:4177/docs/04-game-flow-and-math.html?v=57)。4177 服務若停止，在本專案執行 `npm start`，無需安裝。
- [GitHub](https://github.com/Seven1888/magic-poker-lite)／[Actions](https://github.com/Seven1888/magic-poker-lite/actions)／[接手文件](../HANDOFF.md)／[v57 規格](20-v57-response-readability-spec.md)。

---

# v56 歷史驗證與發布狀態

更新：2026-10-07。**v56 全部完成，本地驗證、Git推送、Pages部署與公開驗收通過。** 本輪 [v56 規格](19-v56-blind-and-response-spec.md) 包含抽盲移入行動說明區與三種實際下注壓力回應；下方 v55 與更早資料只作歷史。

## v56 本地驗證

- npm test：572／572通過，0失敗、0跳過，約22.98秒；紀錄 output/tests-v56.log。涵蓋壓力分列、邊界、再加注、短全下、同額合併、預覽與正式一致及既有池／JP／錢包／Worker。
- npm run build：235個公開檔案，包含新增v56規格與blind-ribbon-v56.css。
- 抽盲與行動區專項11／11：SB／BB、減少動態、取消／取代／飛行中斷、無額外RNG與重繪保留。機率專項84／84：含正式引擎與預覽。
- 隔離桌面Chrome的320／375／393／412／1440：SB50／BB100抽盲全程逐影格核對硬幣留在行動說明區、與文字不交疊；揭曉兩行完整，POT與公牌不被遮擋。旋轉反彈修至-4px、硬幣y360，五尺寸重驗通過；截圖 output/playwright/v56-blind-{width}.png。
- 五尺寸RAISE選單三列皆不同：本次PASSIVE不強案例，半池25/75、全池40/60、大額全下55/45。截圖 output/playwright/v56-raise-{width}.png。12組完整數值、短碼與實際正式分布一致由自動測試覆蓋。
- 連續兩次重整返回入口，保存table均null且錢包數值相同，未重複兌回。機率工具與規則頁320／393／1440均無水平溢出，工具包含12列壓力表。腳本及執行紀錄 output/playwright/qa-v56.js、qa-v56.log。
- 瀏覽器執行錯誤0、HTTP載入失敗0；有5筆CALL圖片預載後未立即使用的Chrome提示，屬既有按鈕預載，不宣稱console warning為0。
- 桌面Chrome手機viewport不等於實體Android；機率設計值和功能驗證不代表長期實測RTP。

## v56 Git 與公開發布

- 功能提交 [82027f5b521a9214a79f34f5ba6a95bcc5d01007](https://github.com/Seven1888/magic-poker-lite/commit/82027f5b521a9214a79f34f5ba6a95bcc5d01007) 已非強制快轉推送至main。
- [Actions 37582922312](https://github.com/Seven1888/magic-poker-lite/actions/runs/37582922312)：build／deploy completed、success；測試與靜態建置步驟成功。
- 公開遊戲、工具、規則HTML、新v56規格、boss-profiles／boss-probability-view／blind-draw-view／action-flow-view／game／engine／action-options-view／table-wallet／outcome-pools及blind-ribbon-v56.css共14份HTTP200，與本地dist正規化換行後逐字相同；紀錄 output/public-v56-files.json。
- 公開Chrome393×852實際入場SB50：抽盲YOU · SMALL BLIND與YOU 50 · BOSS 100在說明區內，無舊浮動文字、無水平溢出。三尺寸預覽分別半池25/75、全池40/60、大額全下55/45；工具12列完整、規則標題v56。腳本／紀錄 output/playwright/public-v56.js、public-v56.log，截圖 public-v56-blind-393.png、public-v56-raise-393.png。
- 公開瀏覽器page／console error 0、HTTP失敗0；2筆既有CALL按鈕圖片預載未立即使用提示。這是桌面Chrome viewport，不是實體Android或長期RTP證據。
- 後續文件提交只回填本節已完成發布證據，不更改已測功能；其自動部署由本聊天室收尾確認後再完成交接。

## v56 入口

- 公開：[遊戲](https://seven1888.github.io/magic-poker-lite/?v=56)／[工具](https://seven1888.github.io/magic-poker-lite/probability.html?v=56)／[規則](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html?v=56)。
- 本地：[遊戲](http://127.0.0.1:4177/index.html?v=56)／[工具](http://127.0.0.1:4177/probability.html?v=56)／[規則](http://127.0.0.1:4177/docs/04-game-flow-and-math.html?v=56)。
- [GitHub](https://github.com/Seven1888/magic-poker-lite)／[Actions](https://github.com/Seven1888/magic-poker-lite/actions)／[接手文件](../HANDOFF.md)。

---

# v55 歷史驗證與發布狀態

更新：2026-10-07。**本地驗證完成，已推送 Git 並部署 Pages，公開內容驗收通過。** 本輪 [v55 八項呈現規格](18-v55-feedback-spec.md) 優先於 v54；正式 `pooled-holdem`、.99 計分、三桶雙池／CD／JP、對手表與保存帳務不改。下方歷史證據保留，不當作本輪結果。

## v55 本輪交付範圍

- 抽盲保留桌面、`DRAWING YOUR BLIND` 不被金幣遮擋、移除 `BLIND POSITION`。
- 操作主字縮小、費用與籌碼圖示放大、RAISE 箭頭動態；BOSS 尺寸回應框縮窄並套同色厚外框。
- 真正單一 100% 行為直接執行；CHECK／CALL 換街顯示 DEAL FLOP／TURN／RIVER，結算顯示 SHOWDOWN，維持 RNG 與預覽隔離。
- TOTAL WIN／BOSS WIN 由收款開始即顯示，持續籌碼流與數字共用 2 秒實際進度；飛行籌碼在一般資訊上方，僅 WIN 文字在前景。
- 買入原位堆高、無資產飛行；雙方共用尺度、同額同高。TOTAL BALANCE 是桌外錢包加呈現桌碼，買入期間包含完整買入碼；profile.balance 仍只保存錢包。

## v55 本地驗證（2026-10-07）

- `npm test`：560／560 通過，0 失敗，完整執行約 20.1 秒；紀錄 `output/tests-v55.log`。`npm run build` 成功，233 個公開檔案。精確 2,000 ms、JP／平手／中斷與不重複入帳由自動測試覆蓋。
- 主代理透過 Cua 在隔離的本機 4178 服務驗證 Codex 內建瀏覽器。320／375／393／412／1440 px 均無水平溢出；三按鈕 CSS 高度維持 66 px，窄畫面整桌縮放後的視覺高度較小；尺寸機率框外框 3 px。另有 `output/playwright/actions-v55-393.png`；Cua 畫面與取樣結果保存在本次原聊天室工具紀錄。
- SB10／買入1,000 期間雙方無底牌或背牌、沒有 `buyin-flight` 元素，TOTAL BALANCE 維持10,000。雙方同額980時皆18顆、碼尺寸相同；下一手同額2,000時皆36顆。另一場買入100共19次取樣，雙方每次金額與顆數一致、無牌／無飛行，TOTAL BALANCE維持16,990。
- 抽盲57次取樣保留 opponent／felt／player／controls／bankroll／action-flow 可見；`DRAWING YOUR BLIND` 與金幣不重疊。100% CHECK流程64次取樣，抽取表演影格數0；CALL後行動階段顯示 `DEAL FLOP`，下一個CHECK預覽為 `DEAL TURN`。
- 玩家全下收款4,000：33次取樣跨度2,020 ms，TOTAL WIN與玩家桌碼每次同步，總餘額每次等於9,000加呈現桌碼；24顆視覺籌碼形成連續流。另一場收款8,000：28次取樣跨度1,949 ms，同樣同步。取樣跨度受取樣時點影響，不取代自動測試的精確2,000 ms契約。
- BOSS WIN以玩家棄牌案例驗證：先退還未匹配10，再呈現20收款；32次取樣跨度1,967 ms，NPC桌碼每次等於7,990加WIN顯示額，玩家TOTAL BALANCE維持16,990，13顆視覺籌碼形成連續流。本輪瀏覽器未以全下輸光案例驗證BOSS勝出，不能據此宣稱該完整流程已重測。
- 飛行籌碼層級 `z-index:200`，WIN文字 `z-index:210`；截圖確認籌碼在行動資訊前、WIN文字後。連續兩次重整均回入口、TOTAL BALANCE16,990、桌上籌碼0，未重複兌回。console warning／error皆0。

上述是本輪本地證據，桌面 Chrome 手機 viewport 不等同實體 Android，小樣本也不構成長期 RTP 證據。行動階段 `BUYING IN` 提示已在買入取樣確認；最後行動階段與總餘額專項 7／7 通過。

## v55 Git 與公開發布完成

- 功能提交 [92c6affef0dc08bdec3b8faa47b775edf865fb83](https://github.com/Seven1888/magic-poker-lite/commit/92c6affef0dc08bdec3b8faa47b775edf865fb83) 已推送 main。
- [Actions 37569472742](https://github.com/Seven1888/magic-poker-lite/actions/runs/37569472742) completed／success，build 與 deploy 成功。
- 公開遊戲入口正常顯示 v55 的 TOTAL BALANCE，三份新版 CSS 載入，完整圖片無失敗，瀏覽器 console warning／error 0。
- 公開 game、action-options、action-response、action-flow、total-win、pot、bankroll、buyin、balance-display 九個模組，三份新版 CSS、機率工具、HTML 規則與 v55 規格共15份皆 HTTP200；正規化換行後與已測本地原始碼完全相同。
- 後續發布紀錄提交只回填以上證據，不改已驗證功能；其最後自動部署由原聊天室確認。使用者已授權完成後開新聊天室，該聊天室讀交接並提供相關連結後等待需求。

## v55 入口

- 本地：[遊戲](http://127.0.0.1:4177/index.html?v=55)／[機率工具](http://127.0.0.1:4177/probability.html?v=55)／[規則](http://127.0.0.1:4177/docs/04-game-flow-and-math.html?v=55)。
- 公開：[遊戲](https://seven1888.github.io/magic-poker-lite/?v=55)／[機率工具](https://seven1888.github.io/magic-poker-lite/probability.html?v=55)／[規則](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html?v=55)；本輪公開內容驗收通過。
- [GitHub](https://github.com/Seven1888/magic-poker-lite)／[Actions](https://github.com/Seven1888/magic-poker-lite/actions)／[接手文件](../HANDOFF.md)。

---

## v54 歷史驗證與發布狀態

更新：2026-10-07。**v54 已通過 552 項測試，推送 Git／部署 Pages，公開流程驗收通過。** 正式模型仍為 pooled-holdem，原 v53 遊戲數學與對手機率不改。本輪包含 11 項呈現回饋及重整返回入口修正。

當前呈現需求見 [v54 規格](17-v54-presentation-spec.md)，遊戲數學見 [v53 規格](16-v53-holdem-spec.md) 及 [規則與公式](04-game-flow-and-math.md)。本頁只記實際證據；本地成功不能替代 Git／Actions／公開站發布驗證。

## v54 本地驗證（2026-10-07）

- `npm test`：552／552 通過，0 失敗、0 跳過；紀錄 `output/tests-v54.log`。
- `npm run build`：成功，228 個公開檔案；包含 v54 規格、五張按鈕美術與生成提示詞。攤牌標籤上移後亦確認不與行動資訊重疊。
- 桌面 Chrome viewport 320／375／393／412／1440 px：無水平溢出；三個操作按鈕 computed height 均 66 px。RAISE 尺寸選單由上往下 ALL IN／1× POT／0.5× POT，每項都有金額前籌碼圖示及左側對應 NPC 行為機率。
- `output/playwright/qa-v54.js` 買入流程取樣兩場：每場各 84 個 rAF frames、取樣跨度 1,383 ms；期間雙方手牌 card count 全為 0，雙方籌碼堆及金額均單調上升。這是動畫取樣跨度，預設動畫契約仍為 1,400 ms、最低 1,000 ms。
- 雙方底牌發完即顯示 Preflop 牌型參考；該測試底牌顯示 Pair 5.9%／High Card 94.1%，來自排除玩家牌後 1,225 組未知底牌的當前分布，不是固定通用比例或 River 預測。
- seed 0：玩家全下獲勝，最終桌碼 2,000。收款取樣 108 frames、48 個不同數字值，玩家 TOTAL WIN 與籌碼完全同步；每位收款者只有一個飛行 group，來源堆在收款時隱藏，未出現重複收 POT。
- seed 7：玩家全下輸光，桌碼 0；結果表演完成後自動返回買入入口，BALANCE 9,000、profile 的 `table: null`。
- 以上 QA：page error 0、request failed 0。截圖為 `output/playwright/v54-raise-{320,375,393,412,1440}.png`、`v54-player-win-393.png`、`v54-auto-buyin-393.png`；本機 QA 檔不發布到 Pages。
- 重整離桌帳務修正納入本輪完整測試。早先單項測試 529／529 與相關瀏覽器結果另保留於 [HANDOFF](../HANDOFF.md)，不拿該舊數字替代本次 552 項結果。

## v54 發布狀態

- 功能提交：[efb8f02af19055a2ce8cb3799e62396c1bf356b7](https://github.com/Seven1888/magic-poker-lite/commit/efb8f02af19055a2ce8cb3799e62396c1bf356b7)，已推送 Git。
- [Actions 37561736242](https://github.com/Seven1888/magic-poker-lite/actions/runs/37561736242)：completed／success，build 與 deploy 均成功。
- `output/playwright/public-v54.js` 驗收 Pages：公開遊戲、機率工具與 HTML 規則均正常提供 v54。入口 SB10／BB20／BUY-IN1000，雙方沒有初始牌；三個藝術按鈕、三尺寸預覽與 Preflop 牌型參考正常。
- 公開牌局重整返回買入入口：BALANCE9,990、`table: null`。v54 規格、按鈕 prompts、action-options 與 chip-motion 模組均 HTTP200；page／console errors 0、HTTP fail 0。
- 補充公開驗收已等待按鈕圖片 `complete && naturalWidth > 0` 與完整 PAIR 文字後再截圖，`public-v54.js` exit 0。公開截圖確認 FOLD／CALL／RAISE 及各籌碼圖示完整顯示、PAIR 已就緒；page／console errors 與 HTTP fail 仍皆為 0。
- 本次後續更新包含以上實際發布證據，以及入口預載五張按鈕 PNG；原功能提交為 efb8f02。
- 新聊天室由本輪交付訊息提供，接手後先讀文件等待新需求。

## v53 歷史驗證與發布狀態

更新：2026-10-07。**方案B已完成並發布；正式模式pooled-holdem。519項測試、建置、Pages部署及公開站入場檢查通過。**

以下保留 v53 實際測試與部署證據，不把規格、計畫或舊模式結果當通過紀錄。v53 需求見 [完整規格](16-v53-holdem-spec.md)；數學見 [規則與公式](04-game-flow-and-math.md)。

## v53 正式驗證範圍

- 以pooled-holdem共用引擎驗證預建牌面、實付結果轉換、同街換NPC配對仍鎖概率、新街重算、原子開手／動作與RNG恢復。
- 德州首手抽盲／後手輪替、BB選擇權、多次加注、半池／全池／ALL IN、短全下不重開及未匹配全額退款。
- SB10／BB20／買入1000、BALANCE一次扣款、CHIPS跨手、不補碼、NPC匹配、離桌一次兌回、重整不重複交易。
- 三桶BB範圍、.99計分、80/20、CD、足額資格JP200/50/20BB及結算池對帳。
- 兩型交替與跨桌／重整續接、三情境公开機率、暗牌和分類原因不進公開DOM。
- 五空框及3/1/1發牌、買入飛行、真實CHECK/BET標籤、連接尺寸選單及320／375／393／412／1440px無水平溢出。
- 工具一般／退幣共用新mode，有限桌碼、外部錢包、歸零重入、正確總資產和有效投入、種子、報表、匯入匯出及中止完整性。
- 最終完整測試、靜態建置、Git推送、Actions成功及公開網址實際內容。

## v53 正式整合驗證（2026-10-07）

- `npm test`：519／519通過，0失敗、0跳過；涵蓋正式pooled-holdem與明確指定模式的歷史回歸。紀錄：`output/tests-pooled-v53-final.log`。
- `npm run build`：成功，218個公開檔案；不收錄本機QA、Git資料、憑證或舊5BET門檻校準檔。`git diff --check`通過。
- 桌面Chrome viewport 320／375／393／412／1440px：入口置中、無水平溢出、尺寸選單不超出畫面，三個動作按鈕等高。
- SB10／BB20／買入1000：錢包10000→9000，盲注後玩家990、NPC980、POT30，五個虛線空框；買入飛行到達前CHIPS顯示0。既有三桶存量與CD保留，重整存檔完全一致。
- Flop顯示3牌、2空框及CHECK／BET；面對再加注仍可RAISE，驗證半池本次實付120。
- 下一手玩家／NPC起始碼同為1020、盲位及對手輪替。離桌錢包10020，重複點擊和重整不再入帳；再入場對手不重複。
- JP強制測試資格：SB10／BB20的皇家JP4000，ALL IN後按3／1／1補公牌，底池2000加JP4000，玩家桌碼6000、錢包仍9000；池帳784.08／196.02，重整不重派。
- 機率工具正式pooled-holdem：SB5／BB10、買入500、seed53，每策略2位×20手，共4策略160手；退幣每策略4位、共16位151手全部完成。320／375／1440px無水平溢出，JSON匯出成功且模型為pooled-holdem。資料：`output/study-pooled-v53-ui.json`。
- 瀏覽器腳本及截圖：`output/playwright/pooled-entry-v53.js`、`pooled-jp-v53.js`、`pooled-wallet-layout-v53.js`、`pooled-actions-v53.js`、`study-v53.js`；含`pooled-*-v53-393.png`及工具手機結果圖。這些本機測試檔不發布到Pages。

## v53發布紀錄

- 功能提交：[c5d5aca9f5d67d3e95b07ef4b371b7bd3e1bb457](https://github.com/Seven1888/magic-poker-lite/commit/c5d5aca9f5d67d3e95b07ef4b371b7bd3e1bb457)。已推送main。
- [Actions 37556303917](https://github.com/Seven1888/magic-poker-lite/actions/runs/37556303917)：build與deploy皆completed／success，線上測試及靜態建置通過。
- 公開遊戲、工具、HTML規則、v53完整規格、engine／pooled-holdem模組與樣式皆HTTP200，實際內容為v53。
- 公開站Chrome393×852重新入場：SB10扣買入1000，BALANCE9000；JP表頭隨選擇更新為4000，牌桌為pooled-holdem、五個空框。page／console錯誤0，HTTP失敗0。證據：`output/playwright/public-v53.js`、`public-entry-v53-393.png`、`public-game-v53-393.png`。
- 規則頁12節導覽、8表，320／393／1440px無水平溢出；`output/playwright/rulebook-v53.js`。
- 本次後續文件提交只回填上述實際發布證據；核心功能版本為c5d5aca。後續自動部署可於Actions查詢。

## 已完成的局部程式檢查

boss-profiles專項測試29／29通過，含pooled-holdem雙段抽樣標記、同街切換NPC配對保持原分類及新街重算。這只覆蓋該模組，不等於整個新mode、錢包、JP或部署驗證完成。

## 選方案B之前的候選證據

先前fixed-holdem候選完整測試483／483通過，建置產出215檔；其viewport及錢包流程、工具小樣本也完成檢查。紀錄在output/tests-v53.log、output/study-v53-ui.json及output/playwright內相關v53檔。

這些是固定牌自然勝負候選的歷史結果，**不能作為本次pooled-holdem保留水池／JP之整合證據**。任何v53字樣的舊output仍須核對實際config.outcome.mode，不能僅以檔名認定已驗證方案B。

## 前次正式發布：v52手機入口修正

最後已知公開提交為 `82a2cc5d19603ed098caec578733b66cfbcd11ca`；[Actions 37435730770](https://github.com/Seven1888/magic-poker-lite/actions/runs/37435730770) 完成439項測試、建置與部署。它不是本次v53的發布結果。

v52將入口BET標題與加減控制列明確置中。Chrome320／360／375／393／412／1440px、BET1／50／2000共18組及停用基礎樣式的對照檢查通過，金額控制中心偏差0px、無水平溢出、console/page error 0。證據為output/playwright/bet-v52-*。使用者截圖可重現偏左形態，但未據此斷定實體Android快取或網路原因。

更早v51數學對照、5BET門檻校準及完整分支樹樣本只屬舊玩法歷史，不再用作v53開局資產門檻。新規則固定買入100SB，不需要沿用舊5BET平均校準。

## 驗證範圍的描述限制

桌面Chrome裝置viewport不等於實體Android驗收。小樣本只驗證功能、帳務與研究流程，不是長期RTP認證。.99設定值不能取代實際投入／返還測量，水池未派餘額不列返還。發布必須同時核對Actions與公開頁面內容，不能只因本地build成功就宣稱上線。

## 入口

- 本地：[遊戲](http://127.0.0.1:4177/index.html?v=54)／[機率工具](http://127.0.0.1:4177/probability.html?v=54)／[規則](http://127.0.0.1:4177/docs/04-game-flow-and-math.html?v=54)
- 公開：[遊戲](https://seven1888.github.io/magic-poker-lite/?v=54)／[機率工具](https://seven1888.github.io/magic-poker-lite/probability.html?v=54)／[規則](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html?v=54)；v54 已部署並核對實際內容。
- [GitHub](https://github.com/Seven1888/magic-poker-lite)／[Actions](https://github.com/Seven1888/magic-poker-lite/actions)

新聊天室由本輪交付訊息提供，接手後先讀文件等待新需求。先閱讀 HANDOFF／AGENTS／v54 及 v53 規格，不重做完成的工作。
